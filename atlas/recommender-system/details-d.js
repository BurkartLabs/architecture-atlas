// Details for the recommender system plate, part 4: evaluation, feedback loops, features, event data.
ATLAS.details("recommender-system", {
  "ranking-metrics": {
    s: "Offline measures of list quality against held-out behavior, such as recall at k, normalized discounted cumulative gain, precision and mean reciprocal rank.",
    d: "Each metric compares a model's ranked list with the items the user later interacted with. Recall at k suits retrieval, where finding any good item matters; position-weighted metrics suit ranking, where order matters. They are computed per user and averaged, usually over a sampled candidate set. They are cheap and fast, which makes them the main tool for model development. Their weakness is that they measure agreement with logged behavior, which was shaped by the previous system, so they reward models that imitate it.",
    k: ["Full-catalog evaluation vs sampled negatives: full-catalog is faithful and expensive; sampling is cheap but can reorder models and overstate results.", "Per-user average vs per-impression average: per-user weights every person equally; per-impression weights heavy users more and tracks total engagement."],
    p: ["Evaluation ranks only logged candidates, so a model that surfaces a better unlogged item gets no credit.", "Sampled evaluation yields a model ordering that reverses when evaluated against the entire catalog."],
    v: "Recompute headline metrics for the production model on fresh held-out data and confirm they match the stored values; confirm the model ranking by metric is the same under full-catalog and sampled evaluation.",
    dep: ["temporal-holdout", "training-example-builder"]
  },
  "temporal-holdout": {
    s: "Splits data by time so a model is trained on the past and tested on a later period, matching how it will really be used.",
    d: "Random splits leak future information: the model sees items and trends from after the test event and looks better than it will in production. A temporal split trains on events before a cutoff and evaluates on events after, with features computed as of each event. Rolling cutoffs give several estimates. Test windows must be long enough to include weekly cycles. The hard part is that the world shifts, so a model's offline score also reflects how much the test period resembles the training one.",
    k: ["Single cutoff vs rolling backtest: a single cutoff is simple; rolling cutoffs show stability over time and cost several evaluations.", "Leave-last-out per user vs global time cutoff: leave-last-out gives every user a test case but mixes time periods; a global cutoff is realistic and drops users with no later events."],
    p: ["Features such as item popularity are computed over the full dataset, so test items carry statistics from after the cutoff.", "The test period contains a holiday spike, and the chosen model is tuned to a pattern that does not recur."],
    v: "Compare offline results from the temporal split with the online outcome of the same models in an experiment, and confirm it ranks models correctly more often than a random split does.",
    dep: ["point-in-time-joins", "offline-feature-store"]
  },
  "counterfactual-estimators": {
    s: "Estimators that predict how a new policy would have performed using logs from the old one, correcting for the difference in what each would have shown.",
    d: "Inverse-propensity scoring reweights logged outcomes by the ratio of the new policy's probability of an action to the logging policy's. Doubly robust variants add a reward model to cut variance. They need logged propensities and enough overlap: the new policy must only choose what the old one sometimes chose. They allow offline comparison of ranking policies without a live test. They are hard to use in practice because variance is large for slates and for policies that differ much from the logging one.",
    k: ["Inverse-propensity weighting vs a reward model: weighting is unbiased given correct propensities but high variance; a reward model has low variance and inherits its own bias.", "Clipped weights vs raw weights: clipping reduces variance and introduces bias; raw weights are unbiased and can be dominated by a few samples."],
    p: ["The new policy recommends items the logging policy never showed, so there is no data and the estimate is meaningless.", "Estimates are reported as point values with no confidence interval, and a noisy winner is promoted."],
    v: "Validate the estimator on randomized exploration traffic: estimate the value of a known policy from logs of another and confirm the estimate falls within its interval around the directly measured value.",
    dep: ["propensity-logging", "random-exploration-slots"]
  },
  "slice-analysis": {
    s: "Breaks evaluation results down by user segment, item type, region, device and activity level to find groups where a model is worse even when the average improves.",
    d: "An average hides trade-offs: a model can gain on heavy users and lose on new ones, or favor popular items at the expense of the tail. Slices are defined in advance for important segments and sometimes discovered automatically by searching for subsets with large metric gaps. Results appear in the evaluation report next to the headline number and are part of the promotion gate. The difficulty is statistical: small slices have noisy metrics, and checking many slices guarantees some false alarms.",
    k: ["Pre-defined slices vs automatically discovered slices: pre-defined slices are stable and interpretable; discovery finds unknown problems and produces false positives that need triage.", "Report all slices vs gate on a few: reporting everything is informative and ignorable; gating on a few makes decisions clear but misses other regressions."],
    p: ["A new model improves the average while quietly worsening results for a small language group that nobody was tracking.", "Slice definitions drift from the product's real segments, and the report evaluates groups that no longer matter."],
    v: "For a candidate model, produce the slice report and confirm every pre-defined slice has a metric with an interval and sample size, and that an injected regression on one slice is flagged.",
    dep: ["ranking-metrics", "user-profile-store"]
  },
  "calibration-and-coverage-checks": {
    s: "Checks that predicted probabilities match observed rates, and that the system can recommend a reasonable share of the catalog and reach a reasonable share of users.",
    d: "Calibration is measured by comparing predicted and observed rates in score bins. Coverage metrics include the fraction of items that ever appear in recommendations, the concentration of impressions across items, novelty and the share of users receiving a full slate. They catch problems that accuracy metrics ignore, such as a model that only ever recommends the top one percent of items. Results gate model promotion and are tracked over time. The hard part is that thresholds are judgments: there is no correct amount of coverage.",
    k: ["Catalog coverage vs impression concentration: coverage counts items ever shown, which is easily satisfied by token exposure; concentration measures how evenly exposure is spread.", "Strict gates vs reported-only metrics: gates prevent known harm and slow experimentation; reporting keeps speed and relies on reviewers to act."],
    p: ["Coverage is met by showing every item once a month, while ninety-nine percent of exposure goes to a few items.", "Calibration is measured on training data instead of fresh traffic and looks perfect."],
    v: "Compute the calibration table and coverage measures for the candidate and the production model on the same fresh data, and confirm the candidate stays within stated limits on both.",
    dep: ["score-calibration", "temporal-holdout"]
  },
  "promotion-gate": {
    s: "The checklist that a candidate model must pass before it gets live traffic: offline metrics, slice checks, latency, cost, compatibility and a review of changes.",
    d: "The gate compares the candidate against the production model on offline metrics and slices, checks inference latency and memory on the real runtime, verifies feature and index compatibility and runs a shadow comparison. Passing allows a canary, not a full release. Gates are automated where possible, with a human review for exceptions. A gate reduces bad launches and also bounds how fast the team can iterate. The hard part is thresholds: too tight blocks real improvements on noise, too loose passes regressions.",
    k: ["Non-regression thresholds vs improvement thresholds: non-regression allows safe incremental changes; requiring improvement filters trivial releases but blocks necessary maintenance retrains.", "Automated gate only vs human review for large changes: automation is fast and consistent; human review catches issues the checks do not encode."],
    p: ["The gate checks offline metrics only, and a model with a latency regression is promoted and causes timeouts.", "Engineers learn the gate thresholds and tune for them, so passing no longer predicts online results."],
    v: "Submit a deliberately regressed model, a slow model and an incompatible model, and confirm each is blocked with the correct reason; review the share of gate-passing models that later improved the online metric.",
    dep: ["ranking-metrics", "slice-analysis", "model-registry", "calibration-and-coverage-checks"]
  },
  "simulation-environment": {
    s: "A synthetic model of users and items in which candidate recommendation policies can be run to study long-term effects and feedback loops without real exposure.",
    d: "Simulated users have preferences, attention and reactions drawn from models fit to real data; items have properties and arrival patterns. A policy is run for many simulated sessions and the resulting behavior, such as concentration, narrowing or retention, is measured. Simulations help explore effects that experiments are too slow or risky to measure, and test exploration and re-ranking ideas cheaply. They are hard to trust: they answer questions according to their assumptions, so conclusions are hypotheses to confirm in real experiments.",
    k: ["Simple stylized users vs data-fit user models: stylized models isolate a mechanism and are easy to interpret; data-fit models look realistic and hide their assumptions.", "Simulate to choose a policy vs simulate to understand: using it to decide is risky unless validated; using it for understanding is safe and guides which real experiments to run."],
    p: ["The simulated users are built from logs of the current policy, so the simulator rewards the policy it was derived from.", "A simulated result is reported as an effect size and used to justify a launch without live confirmation."],
    v: "Reproduce a known past result in the simulator, such as the concentration increase after a past launch, and confirm the simulated and measured effects agree in direction and approximate size.",
    dep: ["counterfactual-estimators", "interaction-events"]
  },
  "popularity-bias-monitor": {
    s: "Tracks how concentrated exposure and clicks are on popular items over time, and whether the system amplifies popularity beyond what user preferences justify.",
    d: "Measures include the share of impressions going to the top percentile of items, Gini-style concentration, and the gap between recommended popularity and the user's historical taste. The monitor also watches the trend: rising concentration signals a rich-get-richer loop. Alerts and dashboards connect to model releases. Some concentration is natural, so the question is whether it is growing and whether the tail loses reach. The hard part is separating real popularity from the effect of exposure, since clicks follow impressions and the two are entangled.",
    k: ["Exposure concentration vs engagement concentration: exposure shows what the system decides; engagement shows what users do, and a gap between them shows amplification.", "Absolute thresholds vs trend alerts: thresholds are simple but arbitrary per product; trend alerts catch change and miss a system that was always too concentrated."],
    p: ["Popularity is measured from clicks that were themselves driven by position, and the loop looks like natural preference.", "The monitor covers only the main surface, and a secondary surface becomes a hit-only list."],
    v: "Report weekly concentration per surface alongside the model release dates, and confirm a deliberately popularity-heavy test model shows a measurable increase and triggers the alert.",
    dep: ["impression-logging", "windowed-counters"]
  },
  "debiasing-weights": {
    s: "Weights applied to training examples or losses to counteract exposure and popularity effects, so rarely shown items are not penalized for being rarely shown.",
    d: "Examples are reweighted by the inverse of the estimated chance they were exposed, which raises the influence of impressions on items or positions that the system seldom chooses. Other forms down-weight popular items in the loss or add exposure as a feature that is set neutral at serving time. They reduce the feedback loop's strength in the training data. They also raise variance and can degrade accuracy on the head. Estimates of exposure are themselves models, so errors propagate into the weights.",
    k: ["Inverse-propensity weights vs popularity re-weighting: propensity weights are principled with known probabilities; popularity re-weighting is simple and works without them but is a heuristic.", "Clip extreme weights vs keep them: clipping stabilizes training and leaves residual bias; unclipped weights are unbiased and can be dominated by a few examples."],
    p: ["A few rare impressions get enormous weights and the model overfits to them.", "The weights are estimated from the same model whose bias they are meant to correct, which circularly reinforces it."],
    v: "Train with and without the weights and compare recall by item popularity decile and the overall online metric; confirm the tail improves and the head loss stays within tolerance.",
    dep: ["propensity-logging", "training-pipeline"]
  },
  "diversity-and-narrowing-metrics": {
    s: "Measures how varied each user's recommendations are, and whether a user's exposure narrows over time toward a smaller set of topics or sources.",
    d: "Per-slate measures include category entropy and intra-list similarity. Longitudinal measures track the breadth of each user's consumption and recommendations across weeks and compare cohorts under different models. They can be joined with retention to see whether narrowing hurts or helps. The metrics are descriptive, and judging what is too narrow requires a view on what the product owes users. The hard part is causality: narrowing may reflect users deepening a real interest and not the system trapping them.",
    k: ["Slate-level diversity vs longitudinal breadth: slate-level is immediate and easy; longitudinal breadth captures the cumulative effect but takes weeks and needs cohorts.", "Taxonomy-based measures vs embedding-based measures: taxonomies are interpretable and coarse; embeddings detect subtler similarity and are harder to explain."],
    p: ["Categories are too coarse, so a user seeing fifty near-identical items from one category counts as diverse.", "Narrowing is measured only for active users, and the users who left because the feed felt repetitive are excluded."],
    v: "Compute breadth metrics for cohorts exposed to different models over eight weeks and confirm the metric separates a deliberately narrow model from the standard one, and ties to retention.",
    dep: ["impression-logging", "item-metadata-enrichment"]
  },
  "producer-ecosystem-health": {
    s: "Tracks effects on creators, sellers and suppliers: how exposure is distributed, whether new producers can grow and whether producers leave.",
    d: "In a two-sided marketplace or content platform, supply responds to what the recommender rewards. Health metrics include the exposure share of new producers, the time for a new producer to reach a given audience, producer retention, and the diversity of the supply that gets traffic. Changes in ranking alter producer behavior, such as what gets uploaded, with lag. Measuring this needs producer-level logs and long horizons. The difficulty is that the harm is slow and indirect, and short experiments on the consumer side do not see it.",
    k: ["Optimize consumer value only vs include producer outcomes: consumer-only is simpler and ignores the supply side; including producer goals protects the long-term supply and costs short-term relevance.", "Rules that guarantee small-producer exposure vs let the market decide: guarantees help growth and distort relevance; letting ranking decide is efficient and concentrates reach."],
    p: ["A ranking change that rewards a content format causes producers to shift to it within weeks, and quality drops before any consumer metric moves.", "Producer metrics are reviewed quarterly and the cause is no longer traceable to a launch."],
    v: "Report per cohort of new producers the time to first meaningful audience and retention before and after a ranking launch, and confirm the report can attribute a change to a specific release.",
    dep: ["impression-logging", "exposure-and-fairness-control"]
  },
  "drift-monitoring": {
    s: "Watches for changes in input data, predictions and outcomes over time that signal a model is going out of date or a pipeline has broken.",
    d: "Monitors compare current distributions of features, scores and labels with a reference using summary statistics and distance measures, and track online metrics against expected levels by segment. Sudden shifts usually mean a pipeline fault such as a feature going null; gradual shifts mean the world changed, such as seasonality or a catalog change. Alerts trigger investigation or retraining. The hard part is separating harmless from harmful change: many distributions move constantly, and an alert that fires daily is ignored.",
    k: ["Monitor inputs vs monitor outputs and outcomes: input monitoring catches faults early and sees harmless changes too; outcome monitoring reflects real harm but only after the damage.", "Fixed reference vs rolling reference: a fixed reference detects slow drift and fires continuously after real change; rolling references adapt and can absorb a slow degradation."],
    p: ["A feature distribution changes slowly over months, and a rolling reference follows it down with no alert.", "Dozens of drift alerts fire on harmless seasonal changes, and the one real fault is lost in them."],
    v: "Inject a known fault, such as zeroing a feature in a test, and confirm an alert fires within the stated time naming that feature; review the false alert rate per week.",
    dep: ["online-feature-store", "data-quality-checks", "skew-detection"]
  },
  "feature-definitions": {
    s: "The single, versioned specification of each feature: its source, transformation, windows, null handling and owner, used by both training and serving.",
    d: "A definition says how a feature is computed from raw data, the entity it belongs to, its type and its freshness target. Code generation or a shared transformation library produces the batch and online computations from the same definition. Changes are versioned so models declare which version they use. A central catalog lets teams discover and reuse features. The hard part is governing change: modifying a definition in place silently changes every model that uses it, so definitions are immutable and new versions are added.",
    k: ["Declarative definition generating both paths vs hand-written code per path: declarative prevents divergence and limits expressiveness; hand-written code is flexible and drifts.", "Immutable versions vs in-place edits: immutable versions make every model reproducible and multiply what must be maintained; in-place edits are convenient and break dependents."],
    p: ["A definition is edited to fix a bug, and every deployed model that used the old behavior silently loses accuracy.", "Two teams define the same concept with slightly different rules, and models disagree about what a click-through rate is."],
    v: "For each feature in production, confirm it has an owner, version, freshness target and a link to the code that computes it in both paths, and that unversioned changes are rejected by the build.",
    dep: []
  },
  "offline-feature-store": {
    s: "Bulk storage of historical feature values, keyed by entity and time, from which training sets are built and backfills are run.",
    d: "It holds feature values with timestamps for users, items and contexts over long periods, in columnar storage for large scans. Training jobs query it to join the correct value as of each example's time. Batch jobs compute features on schedules and write them with their definition versions. It also supports backfilling a new feature across history so new models can use it right away. The challenges are volume, since every change to every feature is a row, and ensuring that its values equal what the online store served at the time.",
    k: ["Store every change vs periodic snapshots: every change gives exact point-in-time values at a high storage cost; snapshots are cheaper and approximate between snapshots.", "Compute features in the store vs in training jobs: in-store computation is shared and consistent; in-job computation is flexible and duplicates logic."],
    p: ["Snapshots are daily, and examples from late in the day use values that were stale at the time of the impression.", "A backfill runs with today's code on old data, and historical values differ from what was actually served then."],
    v: "Choose sampled historical requests and compare the offline store's value as of the request time with the logged served value, and confirm agreement above the stated rate for every feature.",
    dep: ["feature-definitions", "event-ingestion-pipeline"]
  },
  "online-feature-store": {
    s: "A low-latency key-value store holding the current value of each feature for serving, kept up to date by batch loads and streaming updates.",
    d: "Serving reads features by entity id in a few milliseconds, in batches for many candidates. Values are loaded from the offline store on a schedule, and fresher values are written by stream jobs. It is replicated across regions and sized for read throughput. Entries carry timestamps and version tags so freshness and definition versions can be checked. The difficulty is keeping the dataset hot and consistent: loads must not cause latency spikes, and a partial load should not expose a mix of old and new values.",
    k: ["In-memory store vs disk-backed with cache: memory is fastest and costly at large scale; disk-backed is cheaper with higher and more variable latency.", "Atomic swap of full snapshots vs row-level updates: swaps are consistent and need double capacity; row updates are efficient and show mixed versions during a load."],
    p: ["A bulk load saturates the store and read latency spikes at the same hour every day.", "A missing key returns a default silently, and the model cannot tell an unknown entity from a zero value."],
    v: "Read a sample of keys under production load and confirm p99 latency, check each value's timestamp against the freshness target, and confirm missing keys are reported as missing and not defaulted.",
    dep: ["feature-definitions", "offline-feature-store"]
  },
  "point-in-time-joins": {
    s: "Joining labeled events with the feature values that were valid at the moment of each event, never values computed afterwards.",
    d: "For each training example the join finds, per feature, the latest value at or before the example's timestamp, and excludes later ones. Doing this across billions of rows needs sorted, partitioned merges rather than naive lookups. It also respects the delay between an event and its availability in the serving store, since the serving system could not have used a value that arrived seconds after the request. The hard part is correctness at the boundaries: time zones, clock skew between systems and late-arriving data all create leaks.",
    k: ["Join on event time vs on ingestion time: event time reflects reality and needs late-data handling; ingestion time matches what serving could see and shifts with pipeline delays.", "Exact as-of join vs snapshot lookup: exact is faithful and expensive; snapshots are quick and approximate near snapshot boundaries."],
    p: ["Clock skew between the logging service and the feature pipeline lets feature values from just after the request leak into training.", "The join takes the latest value overall for slowly changing features, and the model learns from the user's future."],
    v: "Construct a test case where a feature changes one second after an event, and confirm the training row holds the earlier value; run a leakage check that correlates features with the label's future.",
    dep: ["offline-feature-store", "impression-logging"]
  },
  "embedding-tables": {
    s: "Large lookup tables mapping ids of users, items and categories to learned vectors, which dominate the model's size and its memory and network cost.",
    d: "Sparse ids are mapped to dense vectors by table lookups; tables can hold billions of rows. They are sharded across accelerators or servers for training and serving. To control size, ids are hashed into fewer buckets, rare ids share vectors, dimensions vary by frequency, and rows are evicted. Updates are sparse, so optimizers treat them specially. Tables are versioned with the model. Hard parts are collisions from hashing, memory growth as the catalog grows, and consistent versions across shards and the retrieval index.",
    k: ["Unique vector per id vs hashed buckets: unique vectors are precise and memory-hungry; hashing bounds memory and mixes unrelated ids in one bucket.", "Large dimension for all vs frequency-based dimension: uniform dimension is simple; frequency-based sizing saves memory and complicates the model."],
    p: ["Hash collisions merge a popular item with a rare one, and the rare item inherits its scores.", "Shards from different training runs are loaded together after a partial rollout, and lookups return vectors from different versions."],
    v: "After deployment, check every shard reports the same version tag, sample ids and compare lookups against the training checkpoint, and measure collision rate for the most-served ids.",
    dep: ["model-registry"]
  },
  "skew-detection": {
    s: "Compares feature values and distributions seen at serving with those seen in training and flags features where the two paths disagree.",
    d: "Served feature vectors are logged for a sample of requests and compared with the training pipeline's values for the same requests (value-level skew), and the distributions are compared over time (distribution-level skew). Alerts name the features that differ. Common causes include different null handling, units, time windows or stale online values. Continuous detection catches the failures that make a model look healthy offline and wrong online. Sampling and storage cost are modest compared with debugging an unexplained metric drop.",
    k: ["Value-level comparison vs distribution comparison: value-level pinpoints the exact bug and needs joined logs; distribution comparison is cheap and detects drift but cannot localize the cause.", "Alert per feature vs alert per model: per-feature is actionable and noisy; per-model aggregates are quiet and delay locating the fault."],
    p: ["Only the most important features are compared, and the skew sits in a feature that matters only for one segment.", "The comparison data is produced by the same code as one path, so the check cannot find a bug in that code."],
    v: "Introduce a deliberate difference in one feature's online computation in a test environment and confirm the detector flags exactly that feature within the stated time.",
    dep: ["online-feature-store", "offline-feature-store", "impression-logging"]
  },
  "feature-lineage": {
    s: "A record of where every feature comes from, which sources and transformations produce it, and which models and surfaces consume it.",
    d: "Lineage links raw data sources to features, features to model versions and models to the products using them. It answers questions in both directions: what breaks if a source changes, and which sources and users' data a given prediction used. It supports deletion requests, audits and impact analysis for schema changes. It is built from metadata captured by the pipeline tools rather than documents. The challenge is completeness: lineage that omits ad-hoc or one-off pipelines gives false assurance.",
    k: ["Automatically captured lineage vs hand-maintained documentation: automatic capture stays accurate and requires tooling in every pipeline; documents are easy to start and decay.", "Column-level vs table-level lineage: column-level supports precise deletion and impact analysis at higher cost; table-level is simple and over-reports dependencies."],
    p: ["A one-off notebook pipeline feeds a production feature and is absent from the lineage, so a source change breaks it without warning.", "A deletion request cannot be fully executed because the lineage does not show which derived tables hold the user's data."],
    v: "Pick a source column and confirm lineage lists every feature, model and surface that depends on it, then change it in a test and verify the listed dependents are exactly those that break.",
    dep: ["feature-definitions", "model-registry"]
  },
  "impression-logging": {
    s: "Records exactly what was shown to whom, in what position and context, with model, experiment and propensity information, forming the base for training and evaluation.",
    d: "Logging happens at two points: the server logs what it returned, and the client logs what was actually rendered or visible. Each record carries a request id, user and item ids, position, surface, model and experiment versions, scores and propensities, and often the features used. Impressions are the denominator of every click-through rate and the source of negative labels. Hard parts are volume, since impressions outnumber interactions by orders of magnitude, and correctness: logging items that were returned but never seen corrupts every downstream use.",
    k: ["Log at the server vs at the client: server logs are complete and reliable and overstate what the user saw; client logs reflect visibility and are lost to crashes, ad blockers and network failures.", "Log full feature vectors vs log ids only: full vectors guarantee training-serving consistency and cost large storage; ids are cheap and require reconstruction."],
    p: ["Server impressions are used as negatives for items the user never scrolled to, and the model learns to avoid lower slots.", "A client release drops the request id from impression events, and clicks can no longer be joined to the lists that produced them."],
    v: "Compare server and client impression counts per request for a sample, confirm the difference matches rendered but unseen items, and verify every record carries request id, position, model version and propensity.",
    dep: ["event-schema-and-contracts", "event-ingestion-pipeline"]
  },
  "interaction-events": {
    s: "Records of what users do after seeing recommendations: clicks, views, dwell, purchases, shares, saves, skips, hides and complaints, with timestamps and context.",
    d: "Events are emitted by clients and servers, carry the request id and item id from the impression, and include the kind of action and its value, such as seconds watched. Implicit events are plentiful and noisy; explicit ones are rare and clear. Event definitions must be exact: what a view means, when a play starts, what counts as a completion. These events become labels, features, counters and metrics. The hard part is consistency across platforms: web, mobile and television clients emit the same action differently.",
    k: ["Raw high-frequency events vs summarized events: raw events enable flexible analysis and cost volume; summaries are small and lock in definitions at the client.", "Client-computed values such as dwell vs server-derived: client values are direct and vary by implementation; server derivation is consistent and loses detail."],
    p: ["Different clients define a view differently, and the model learns platform behavior instead of preference.", "Events are sent with the client's clock, which drifts, and interactions appear to happen before the impression that caused them."],
    v: "Perform scripted actions on each client platform and confirm the expected events arrive with correct ids, timestamps and values, and that counts per action match across platforms for a controlled session.",
    dep: ["event-schema-and-contracts", "event-ingestion-pipeline"]
  },
  "event-schema-and-contracts": {
    s: "The agreed, versioned structure and meaning of every logged event, enforced at the producer so downstream pipelines can rely on it.",
    d: "A schema names each field, type, units, allowed values and semantics, and says which fields are required. Contracts are checked in client and server builds and at ingestion, rejecting or quarantining nonconforming events. Evolution rules allow adding fields and forbid changing meanings silently. Documentation states what each event means for modeling. The hard part is organizational: many teams emit events, and a harmless-looking change on a client can invalidate a training pipeline weeks before anyone notices.",
    k: ["Strict validation at ingestion vs permissive acceptance with later cleaning: strict validation protects data quality and drops data on producer bugs; permissive keeps everything and moves the problem downstream.", "Central schema registry vs per-team definitions: a registry gives one source of truth and a bottleneck; per-team definitions are fast and diverge."],
    p: ["A client changes the unit of a dwell field from milliseconds to seconds, and model features shift by a factor of a thousand.", "Optional fields are omitted by one platform, and null handling creates a platform effect that the model learns."],
    v: "Send an event that violates the schema in a test and confirm it is rejected or quarantined with an alert, and that every field in production events is described in the registry with units and meaning.",
    dep: []
  },
  "event-ingestion-pipeline": {
    s: "The transport and storage path that carries events from clients and servers into durable logs, the stream processors and the warehouse reliably and in order.",
    d: "Clients batch and send events to collection endpoints that validate and write to a partitioned durable log. From there, stream jobs read for real-time features and loaders write to the warehouse for batch work. It deduplicates retried events, handles late arrivals, and keeps ordering per user where needed. Throughput is high and bursty. Failures mean lost or duplicated data, which become silent errors in labels and counters. The hard part is guaranteeing delivery semantics end to end and measuring loss against the true event counts.",
    k: ["At-least-once with deduplication vs exactly-once: at-least-once with idempotent keys is simpler and robust; exactly-once pipelines are harder to operate and still need deduplication at the edge.", "Client batching vs immediate sending: batching saves battery and network and delays events and risks loss on app close; immediate sending is timely and costly."],
    p: ["A collector outage drops a few percent of events unevenly across platforms, which biases the labels for those users.", "Retried events are not deduplicated, and counters and click-through rates are inflated."],
    v: "Generate a known number of test events from each client type and confirm the exact count reaches the log and the warehouse, without duplicates, and measure the delay from emission to availability.",
    dep: ["event-schema-and-contracts"]
  },
  "identity-resolution": {
    s: "Maps devices, sessions, logged-out visits and accounts to a stable person or household identifier, so behavior can be combined into one history.",
    d: "Identifiers come from accounts, cookies, device ids and linked logins. The resolver links them with deterministic rules, such as login events, and sometimes probabilistic matching, producing a canonical user id and handling merges and splits. Better resolution gives longer histories and better personalization; mistakes mix two people's data. Shared devices and households complicate the notion of a user. Privacy rules limit linking. The difficulty is that identity is never fully certain, and the system needs to carry that uncertainty and handle later corrections.",
    k: ["Deterministic linking only vs probabilistic matching: deterministic is precise and misses logged-out behavior; probabilistic recovers more history and makes occasional wrong merges.", "Person-level vs profile-level identity on shared accounts: person-level gives sharper recommendations and needs ways to tell users apart; account-level is simple and blends tastes."],
    p: ["Two household members merge into one profile, and each receives recommendations driven by the other's history.", "A merge is applied to the profile store but not to the feature tables, and the same person has two histories."],
    v: "Create a test user who browses logged out and then signs in, and confirm the pre-login history joins the account; confirm that unlinking removes it, in every store.",
    dep: ["consent-and-data-controls"]
  },
  "bot-and-spam-filtering": {
    s: "Detects and removes automated, fraudulent and abusive interactions from training data, counters and metrics, so they do not distort what is learned or reported.",
    d: "Detection uses rules, rate limits, behavior models and reputation signals on accounts and devices. Flagged traffic is excluded from labels, counters, popularity lists and experiments, and sometimes shown differently. Spammers adapt, since a recommender that rewards engagement is an attractive target for manipulation by fake clicks and fake items. Cleaning must be applied consistently across the real-time and batch paths. The hard parts are the adversarial setting and the cost of false positives, which remove real users' data.",
    k: ["Filter at ingestion vs at use: ingestion filtering protects every consumer and cannot be undone; filtering at use allows reanalysis and risks missing a path.", "Hard exclusion vs down-weighting: exclusion is clean and sensitive to false positives; down-weighting handles uncertainty and leaves some contamination."],
    p: ["Bot clicks inflate an item's counters in the real-time path while the cleaned batch path excludes them, so scores differ between paths.", "A new bot pattern evades rules, and a manipulated item reaches the top of trending before detection."],
    v: "Inject synthetic bot traffic in a test and confirm it is flagged and excluded from counters, labels and experiment metrics in both real-time and batch paths, and measure the false positive rate on known humans.",
    dep: ["event-ingestion-pipeline", "identity-resolution"]
  },
  "item-catalog": {
    s: "The authoritative record of every recommendable item: its identity, attributes, availability, rights, creator and lifecycle state, with changes propagated to the recommender.",
    d: "The catalog stores items with ids, titles, categories, prices, owners, release and expiry dates, and statuses. Changes such as new, edited, removed or sold out flow out through events to indexes, caches and filters. Many systems own parts of the catalog, so the recommender maintains its own replicated view tuned for lookup. It is the source for availability, policy and rights decisions. The hard part is propagation speed and consistency: any lag between a change and its effect on recommendations is visible to users as a stale or broken item.",
    k: ["Event-driven propagation vs periodic full sync: events are fast and can miss messages; periodic sync is slow and self-healing, and most systems use both.", "Shared catalog service vs recommender-owned copy: sharing avoids duplication and adds a runtime dependency; a copy is fast and independent and can diverge."],
    p: ["A deleted item remains in the recommender's copy because its removal event was dropped and no reconciliation ran.", "Item ids are reused or merged by the catalog, and history attached to the old id points to a different item."],
    v: "Change, remove and re-add test items in the source catalog and measure the time until each change is reflected in indexes, caches and filters; run a reconciliation and confirm zero diffs.",
    dep: []
  },
  "item-metadata-enrichment": {
    s: "Derives extra attributes for items, such as topics, quality scores, language, safety labels and embeddings, from their content and from how they are used.",
    d: "Classifiers and encoders process text, images, audio and video to produce categories, tags, quality and safety scores and content vectors. Behavioral aggregates add engagement statistics. The output feeds retrieval, filtering, ranking features and diversity measures. Enrichment runs at item creation, so latency matters for time-sensitive items, and again when models improve. The challenge is consistency and drift: a new classifier version changes labels for the whole catalog, and every feature and filter that uses them shifts at once.",
    k: ["Enrich synchronously at creation vs asynchronously: synchronous gates eligibility on complete data and delays items; asynchronous is fast and means early recommendations lack some attributes.", "One shared enrichment vs per-consumer enrichment: shared enrichment is consistent and cost-efficient; per-consumer enrichment fits each need and duplicates work and disagrees."],
    p: ["A classifier update relabels a large share of the catalog overnight, and diversity and filters change behavior with no model release.", "Enrichment failures leave attributes empty and the items are then treated as belonging to no category."],
    v: "Compare enrichment outputs against a labeled sample for accuracy per attribute, confirm a new item is enriched within the target time, and track label distribution changes across classifier versions.",
    dep: ["item-catalog"]
  },
  "user-profile-store": {
    s: "Stores account-level information and long-term derived attributes about each user: declared interests, settings, language, region, and aggregated taste.",
    d: "The profile holds stable attributes, the user's explicit choices, privacy and notification settings, and aggregates computed in batch such as favorite categories. It is read by many components, so it is replicated and cached, with a clear owner for each field. It is the place where preferences such as blocks and consent are authoritative. The difficulty is the mix of sources and update speeds, and sensitivity: a profile can hold inferred traits, and exposing them to the wrong component or surface is a privacy failure.",
    k: ["Store inferred traits vs compute on demand: storing is fast and creates a sensitive record to protect; computing on demand avoids persistent records and costs latency.", "Single profile record vs separate stores per concern: a single record is simple to read and hard to govern; separate stores isolate sensitive data and need joining."],
    p: ["Inferred sensitive attributes are stored in the general profile and become accessible to components that should never see them.", "A settings change updates the profile but the cached copy in a batch job is hours old, so the change is ignored."],
    v: "Update each setting for a test user and confirm every consumer, including batch jobs, reflects it within the stated time; audit access to sensitive fields and confirm only authorized components read them.",
    dep: ["identity-resolution", "consent-and-data-controls"]
  },
  "consent-and-data-controls": {
    s: "Records what each user has agreed to and enforces it, including opt-outs from personalization, data export and deletion across every store and pipeline.",
    d: "Consent state is stored per user and purpose, such as personalization, ads and messaging. Enforcement points check it in event collection, feature computation, training example selection and serving, falling back to non-personalized recommendations when personalization is off. Deletion and export requests fan out to logs, stores and derived datasets with deadlines and confirmation. Regional laws set the rules. The difficulty is coverage and proof: every pipeline that copies data is a place the control can fail, and the system must be able to demonstrate compliance.",
    k: ["Enforce consent at collection vs at use: collection-time enforcement means data never exists; use-time enforcement keeps flexibility and relies on every consumer to check.", "Delete from stores and exclude from training vs retrain to purge: the first is fast and leaves residual influence in weights; retraining is thorough and expensive."],
    p: ["An opted-out user's events still flow to the training pipeline because only the serving path checks consent.", "A deletion request is acknowledged but a derived table in a rarely used pipeline keeps the data."],
    v: "Opt out a test user, then confirm no events from them reach training sets, features or personalized slates; submit a deletion and confirm a scan of every store finds no records after the deadline.",
    dep: ["identity-resolution", "event-ingestion-pipeline"]
  },
  "data-quality-checks": {
    s: "Automated checks on event volumes, schemas, null rates, distributions and joins that stop bad data from reaching training and features, and alert owners.",
    d: "Checks run at ingestion, after each pipeline stage and before training. They compare counts with expectations by platform and hour, validate schema and ranges, check join rates between impressions and events, look for duplicate keys and monitor label rates. Failures block downstream jobs or quarantine the data. Tests are written with the data's owners and linked to alerts with runbooks. The hard part is calibrating: strict checks block good runs on harmless variations, and loose ones let silent loss through.",
    k: ["Block the pipeline on failure vs warn and continue: blocking prevents bad models and delays everything on a false alarm; warning keeps flow and risks training on bad data.", "Fixed thresholds vs learned expectations: fixed thresholds are clear and need updates; learned expectations adapt to seasonality and are harder to explain."],
    p: ["Volume checks pass because duplicate events replaced the missing ones, and counts look normal while content is wrong.", "A check fails every day, the team mutes it, and a real outage a month later goes unseen."],
    v: "Drop a platform's events for an hour in a test and confirm the check fails the run, names the platform and hour, pages the owner and blocks the training job.",
    dep: ["event-schema-and-contracts", "event-ingestion-pipeline"]
  }
});
