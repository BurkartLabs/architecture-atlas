// Details for the data labeling plate, part 5: versioned datasets, privacy and security, platform services.
ATLAS.details("data-labeling", {
  "annotation-store": {
    s: "The system of record for annotations: current labels per item, with the raw judgments, status, authorship and the ontology version, stored so they can be queried, validated and exported.",
    d: "Each annotation records its item, worker, task, geometry or value, ontology version, source such as human, model or import, and state such as draft, submitted, accepted or rejected. Raw judgments are kept next to the aggregated label. Writes are validated against the ontology. Queries retrieve by item, batch, worker or class. It is hard because volume is high, geometry is variable in size, schema evolves, and the store serves both interactive reads from workers and large analytical scans.",
    k: ["Relational tables with a flexible payload column vs a document store: tables give strong queries and constraints, while documents handle shape variety and make cross-record integrity weaker.", "Raw judgments kept forever vs only the aggregate: keeping them allows re-aggregation and audit and costs storage and privacy exposure."],
    p: ["An aggregate label is overwritten in place, and the judgments that produced it are lost.", "Analytical scans over the live store slow interactive task loading for every worker."],
    v: "Submit judgments for an item, aggregate, then re-aggregate under a changed rule, and confirm that both labels are retrievable with their rules, raw judgments remain, and a scan query does not raise interactive latency beyond its limit.",
    dep: ["ontology-schema", "annotation-history"]
  },
  "annotation-history": {
    s: "An append-only record of every change to every annotation: who, when, from what to what, and why, so any past state can be reconstructed.",
    d: "Each submission, edit, review decision, adjudication, import and correction adds an event to the log, never overwriting. Current state is derived from the events, and any past dataset state can be rebuilt up to a point in time. The log supports audits, pay disputes, reliability models and root-cause analysis of bad labels. It is hard because it grows without bound and needs retention and compaction rules, and because it contains personal data about workers.",
    k: ["Event sourcing with derived state vs mutable rows plus an audit table: event sourcing gives exact reconstruction and complex queries, while audit tables are simple and can drift from the data.", "Retaining the full log forever vs compacting old events: full retention supports any audit, and compaction controls cost and loses detail."],
    p: ["A bulk fix script updates rows directly, bypassing the log, and history no longer explains the data.", "The log grows until reading one item's history becomes slow."],
    v: "Apply a sequence of edits, a review and an adjudication to one item, then reconstruct its state at three earlier timestamps from the log and confirm each matches what was recorded at the time.",
    dep: []
  },
  "dataset-versions": {
    s: "Immutable named snapshots of a set of annotations, filters and splits, each with an id, a manifest and a recorded rule for how it was built.",
    d: "A version freezes which items, which accepted labels, which ontology version, which aggregation rule and which gates were applied, as a manifest and, usually, as stored files. New versions are built from the current store, never edited. Versions can be tagged, compared and deprecated. They are the unit that training, evaluation and audit refer to. It is hard because building one is expensive at scale, because lazy designs reference mutable data, and because people want to fix a version after release.",
    k: ["Materialized snapshots vs manifests referencing history: materialized snapshots are fast to read and cost storage, while referencing history is compact and depends on log retention.", "Never edit a released version vs patch releases: immutability keeps results trustworthy and forces a new version for every fix."],
    p: ["A fixed label is edited into a released version, and a model trained on it cannot be reproduced.", "Two versions share a name in different projects, and the wrong one is used for training."],
    v: "Build a version, change labels in the live project, then rebuild the version from its manifest and confirm identical content, and that a newly built version differs exactly by the changes made.",
    dep: ["annotation-store", "quality-gates", "lineage-and-provenance", "taxonomy-versioning"]
  },
  "splits-and-sampling": {
    s: "Assignment of items to training, validation and test sets, stratified by class and grouped to prevent leakage, with fixed seeds so splits can be rebuilt.",
    d: "A split rule partitions items deterministically, usually by hashing a stable id with a seed, stratifying by class, and keeping related items together such as near duplicates, frames from one video or documents of one source. The test set is protected from reuse in training and from repeated tuning. Splits are recorded in the dataset manifest. It is hard because leakage hides in relations the id does not show, and because stratifying on several attributes at once leaves rare combinations empty.",
    k: ["Group-aware splits vs random item splits: group-aware splits stop leakage and make uneven sets, while random splits are balanced and optimistic.", "A fixed test set vs a refreshed one: a fixed set tracks progress and is eventually overfit, while a refreshed one stays honest and breaks comparisons."],
    p: ["Frames from the same video land in both training and test sets, and accuracy looks excellent.", "The test labels are used to pick thresholds and later reported as an unbiased result."],
    v: "Check that no group, near-duplicate cluster or source document spans two splits, that class proportions match the targets within a tolerance, and that rebuilding with the same seed gives identical assignments.",
    dep: ["deduplication", "dataset-versions", "metadata-index"]
  },
  "lineage-and-provenance": {
    s: "A trace from any label back to its source asset, the judgments, the workers, the rules and tool versions that produced it, and forward to the models that used it.",
    d: "Each dataset item links to its asset version, the raw judgments, the guideline and ontology versions, the aggregation and gate rules, the pre-labeling model versions and the export code. Forward links record which training runs consumed which dataset version. Queries answer why an item has its label and which models are affected if a labeler or a rule was wrong. It is hard because it spans many systems, and because partial lineage looks reassuring while failing the one query that matters.",
    k: ["Capture lineage automatically at each step vs reconstruct it on demand: automatic capture is complete and costs write overhead, while reconstruction is cheap and fails when logs have been compacted.", "Item-level lineage vs batch-level: item-level answers precise questions at large storage cost, and batch-level is cheap and coarse."],
    p: ["A faulty vendor team is identified, and nobody can list which dataset versions and models used their labels.", "Lineage records point to a model version that has since been deleted."],
    v: "Pick a model, trace it back to its dataset version and a sampled item, and then to the judgments and worker, and run the reverse query from a worker to all affected dataset versions and models, checking both against known facts.",
    dep: ["annotation-history", "dataset-versions", "training-platform-handoff"]
  },
  "schema-migration": {
    s: "Controlled change to the annotation schema or ontology on existing data: mappings, backfills and relabeling plans, applied without breaking running projects or old datasets.",
    d: "A migration is a plan with a mapping from old to new classes and attributes, the items that can be converted automatically, those that need human relabeling, and the order of rollout. It runs in a dry run first, with counts and examples, then as a job writing new versions of annotations while keeping old ones. Projects pin schema versions so they can move on their own schedule. It is hard because splits and merges are lossy in one direction, and because data in flight is labeled under the old schema.",
    k: ["Migrate all data to the new schema vs keep versions side by side: migration gives one consistent set at a cost in rework, while side by side is cheap and complicates every consumer.", "Automatic mapping with review of the ambiguous vs full manual relabeling: automatic saves most of the cost and risks silent errors in the mapped share."],
    p: ["A migration runs on the live store with no dry run and mislabels a class for a week.", "In-flight tasks submit under the old schema after the cutover and fail validation."],
    v: "Run a dry-run migration on a copy, check the counts of converted, ambiguous and unmapped items against a manual sample, then run it and confirm old versions remain readable and in-flight tasks complete under their pinned schema.",
    dep: ["taxonomy-versioning", "annotation-store", "annotation-history", "job-queue"]
  },
  "dataset-diffing": {
    s: "Comparison of two dataset versions: items added and removed, labels changed, class balance shifted, and the reasons for the change.",
    d: "A diff lists per-item changes between versions and summarizes them by class, source, worker and rule: how many labels changed class, how many were corrected after review, how class proportions moved. It links changes to events such as a guideline revision or an audit. It is used to review a release before sending it to training, and to explain a model's behavior change. It is hard at scale, and because a diff's interesting part is the cause, which depends on lineage.",
    k: ["Item-level diffs vs summary statistics only: item diffs support audit and cost compute and storage, while summaries are fast and cannot explain a particular change.", "Automatic release checks on diffs vs human review: automatic checks catch large unintended shifts, while humans see context and do not scale."],
    p: ["A mapping bug changes thousands of labels between versions and no one looks at the diff before release.", "Diffs ignore changed assets, so identical labels on different images appear unchanged."],
    v: "Build two versions with known planted changes, such as relabeled items, a dropped class and added data, and confirm that the diff reports each exactly with its cause, and that a release check flags an unexpected class shift.",
    dep: ["dataset-versions", "lineage-and-provenance", "annotation-history"]
  },
  "data-cards": {
    s: "A structured description published with each dataset version: purpose, composition, collection, labeling process, annotators, known limits and intended use.",
    d: "The card records where the data came from, how items were selected, the ontology and guideline versions, who labeled and under what conditions, measured agreement and audit error rates, class balance, known gaps and biases, and permitted and prohibited uses. Most fields are filled from the platform's records; some need a human author. It is hard because honest limits are uncomfortable to write, and because a card that is not regenerated with each version quickly describes the wrong dataset.",
    k: ["Generated automatically from records vs written by hand: generated cards are complete, current and mechanical, while handwritten ones carry judgment and drift out of date.", "Public card vs internal only: public cards support accountability and expose weaknesses and workforce details."],
    p: ["The card lists last year's agreement figures for a dataset relabeled since.", "Intended-use limits are written in the card and ignored by the teams who consume the data."],
    v: "Generate a card for a dataset version and check each figure, such as agreement, class counts and audit error rate, against raw records, and confirm that it names the guideline and ontology versions and lists the annotator pool's composition.",
    dep: ["dataset-versions", "lineage-and-provenance", "inter-annotator-agreement", "acceptance-sampling"]
  },
  "access-control": {
    s: "Rules deciding who can see and change which projects, data, labels and reports, based on role, team, project and the task assigned.",
    d: "Roles such as worker, reviewer, project manager, administrator and vendor lead hold permissions at organization, project and batch scope. Workers see only the tasks assigned to them and nothing else. Every access goes through checks that read the current assignment and role. Policies are tested and logged. It is hard because assignment-based access changes every few minutes, because export and reporting paths bypass the interface's checks unless they are built to apply the same rules, and because exceptions accumulate.",
    k: ["Role-based access vs per-task grants: roles are simple to administer, and per-task grants enforce least privilege at constant check cost.", "Centralized policy service vs checks in each component: central policy is consistent and a single point of failure, while local checks are fast and drift apart."],
    p: ["The API returns annotations from projects the caller cannot open in the interface.", "A departed manager's permissions remain active because deprovisioning was manual."],
    v: "As each role, attempt to read and write data in and out of scope through the interface, the API and exports, and confirm that every out-of-scope attempt is refused and logged.",
    dep: ["identity-and-sso", "audit-log"]
  },
  "pii-detection": {
    s: "Automated detection of personal and sensitive information in raw items, such as faces, plates, names, identifiers and voices, before they reach workers or datasets.",
    d: "Detectors scan text with pattern and model-based recognizers, images with face and plate detectors, audio with speaker and speech content detection, and documents with both. Findings carry type and location with a confidence, and drive redaction, routing to cleared workers, or exclusion. Detection runs at ingestion and again on outputs such as free-text answers. It is hard because recall is never complete, false positives destroy useful data, and different jurisdictions define sensitive differently.",
    k: ["High recall with more false positives vs balanced thresholds: high recall protects people and removes useful data, while balanced thresholds keep data and let more through.", "Detect at ingestion only vs also on outputs: ingestion detection protects workers, and output checks catch what workers type into free-text fields."],
    p: ["Detectors miss a new identifier format, and personal data flows to workers and into the dataset.", "Faces are blurred for privacy in the same images where faces are the label."],
    v: "Run detection on a labeled test set containing every sensitive type the policy names, and confirm that measured recall meets the stated target by type, and that every finding is routed per policy.",
    dep: ["asset-ingestion", "redaction-and-masking", "consent-and-retention"]
  },
  "redaction-and-masking": {
    s: "Removing or obscuring sensitive content in assets, such as blurring faces or replacing identifiers with tokens, while keeping what the labeling task needs.",
    d: "Given detections, the platform replaces text spans with typed placeholders, blurs or masks image regions, bleeps or removes audio segments, and stores the redacted version as a derived asset shown to workers, with the original kept under tight access. Reversible tokenization keeps links consistent across records. It is hard because redaction must not destroy the signal, because redacted text still reveals identity by context, and because redacting the original is irreversible while keeping both multiplies exposure.",
    k: ["Redact the copy shown to workers and keep the original vs destroy the original: keeping allows re-labeling and audits and holds the risk, while destroying removes the risk and the options.", "Typed placeholders vs blanks: typed placeholders keep structure for models and reveal the category, while blanks leak less and distort text."],
    p: ["The redacted copy is shown, but the proxy and thumbnail created before redaction are still served.", "A name is redacted in the text and appears unredacted in the metadata field."],
    v: "Redact a test set with planted identifiers, and confirm that none remains in any served asset, proxy, thumbnail, metadata field or log, and that labels made on redacted data still validate against the task.",
    dep: ["pii-detection", "preprocessing-and-proxies", "asset-storage"]
  },
  "task-scoped-views": {
    s: "Showing a worker only the fragment of data a task needs, such as a cropped region, a single sentence or a shuffled item, so no one assembles the whole record.",
    d: "Sensitive records are split into pieces: a form is shown as isolated fields, a conversation as single turns, an image as a crop, and records are shuffled so one person rarely sees related pieces. The platform generates the fragment views, tracks which worker saw which pieces, and limits how many pieces of one record a worker can see. It is hard because labels often need context, and because limiting context lowers accuracy.",
    k: ["Fragments with limited context vs full records for cleared workers: fragments protect privacy and lower label quality, while cleared workers see everything and need vetting and secure environments.", "Shuffling across workers vs keeping one worker per record: shuffling hides the whole, and consistency suffers when nobody sees the full picture."],
    p: ["A worker who sees many fragments of one record reassembles it from their own memory.", "A fragment is so small that the label depends on context the worker cannot see."],
    v: "Label a fragmented record set and confirm that no worker sees more than the allowed share of any one record, that the fragments are logged, and that label accuracy against full-context gold stays within the tolerance.",
    dep: ["access-control", "assignment-policy", "redaction-and-masking"]
  },
  "consent-and-retention": {
    s: "Rules for what data may be used for labeling and for how long it is kept, recorded with each item and enforced on storage, exports and deletion requests.",
    d: "Each item carries its provenance and permitted uses, such as consent terms and license, and a retention period. The platform checks them at ingestion and export, deletes assets and derived data at expiry, and handles a person's request to remove their data across assets, annotations, proxies, exports and backups. Worker data has its own rules. It is hard because copies are everywhere, and because already-trained models and issued datasets are out of the platform's reach.",
    k: ["Per-item consent metadata vs project-level declaration: per-item enforcement is precise and requires metadata the sources often lack, while project-level is simple and coarse.", "Hard delete everywhere vs tombstone and exclude: hard deletion satisfies requests fully and breaks reproducibility, while tombstones keep structure and risk residual copies."],
    p: ["A deletion request removes the original but not the exports sitting in a partner's bucket.", "Retention periods differ per source, and a single project-wide setting keeps some data too long."],
    v: "Issue a deletion request for a test item and confirm removal from assets, proxies, annotations, indexes, exports and caches within the stated time, with a record that lists each place and its outcome.",
    dep: ["asset-storage", "annotation-store", "audit-log"]
  },
  "encryption": {
    s: "Protection of data in transit and at rest with managed keys, per-tenant separation and key rotation, so stolen storage or traffic does not reveal content.",
    d: "All connections use TLS. Stored assets and databases are encrypted with keys held in a key service, ideally separate per tenant or project, with rotation and revocation. Backups and exports are encrypted. Customers may bring their own keys. Signed links and tokens are protected the same way. It is hard because the data must be decrypted wherever it is displayed or processed, and because key management failures are catastrophic, causing either exposure or permanent loss.",
    k: ["Per-tenant keys vs one platform key: per-tenant keys limit damage and allow customer revocation, at the cost of many keys to manage.", "Customer-managed keys vs platform-managed keys: customer control suits strict customers and makes platform operation depend on their key availability."],
    p: ["Keys are rotated for storage but not for backups, which remain readable with the old key.", "A key is deleted by mistake, and a project's data is gone for good."],
    v: "Inspect storage, backups and exports from outside the platform and confirm that nothing readable appears without keys, rotate a key and confirm that reads continue, and revoke a tenant key and confirm that access stops.",
    dep: []
  },
  "audit-log": {
    s: "A tamper-evident record of who accessed or changed what, when and why, covering data views, exports, permission changes and administrative actions.",
    d: "Security-relevant events, such as a task assignment that exposes an item, an export, a role change or a deletion, are written to a separate append-only store with actor, object, time and context, signed or chained so tampering is detectable. Logs are searchable by investigators and retained per policy. They answer who saw this record and who exported that file. It is hard because volume is high, because logs contain personal data themselves, and because a log that is not reviewed protects nobody.",
    k: ["Log every data view vs only changes and exports: full logging supports investigations of exposure and is voluminous, while change-only logs are small and cannot show who saw a record.", "Separate immutable store vs the main database: a separate store resists tampering by insiders and adds infrastructure."],
    p: ["Administrators can edit the audit log with the same credentials they use to run the platform.", "Logs record the personal data they should only point to."],
    v: "Perform a view, an export, a permission change and a deletion, and confirm that each appears with actor, object and time, that an attempted edit of the log is rejected or detected, and that a query for one record lists everyone who saw it.",
    dep: ["identity-and-sso"]
  },
  "data-residency": {
    s: "Keeping data and processing in the regions its owner or law requires, including which workers in which countries may see it.",
    d: "Projects declare permitted regions for storage, processing and worker location. The platform pins assets, annotations, derived data and backups to those regions, routes tasks only to workers located within them, and records the location of every access. Cross-region features, such as global search or a central model service, must respect the same pins. It is hard because worker supply is regional and constrained, and because convenient shared services quietly move data across borders.",
    k: ["Regional deployments vs one global deployment with region tags: regional deployments give strong guarantees and multiply operations, while tags are cheaper and rely on every component respecting them.", "Restricting workers by country vs by clearance: country rules are easy to state and shrink the pool, while clearance is flexible and harder to verify."],
    p: ["A model-assist service in another region receives items for pre-labeling, breaking the residency promise.", "Backups replicate to a default region that was never in the project's list."],
    v: "Create a project pinned to one region, run a full cycle of ingestion, labeling, assist, export and backup, and confirm from storage and network records that no data or access left the region.",
    dep: ["asset-storage", "multi-tenancy", "assignment-policy"]
  },
  "identity-and-sso": {
    s: "Authentication and identity for workers, managers and vendors: accounts, single sign-on with organizational providers, multi-factor checks and session handling.",
    d: "Staff and vendors sign in through their organization's identity provider; crowd workers use platform accounts with strong credentials and verification. Sessions are short-lived and tied to devices where possible, and roles come from claims or group mappings. The identity of workers is also the basis of pay, reliability and exclusion rules. It is hard because multiple accounts per person break reliability and fraud controls, and because offboarding must propagate quickly to every system.",
    k: ["Federated sign-in for organizations vs platform-managed accounts: federation centralizes control for customers and depends on their provider, while platform accounts are self-contained.", "Strong identity verification for crowd workers vs light verification: strong verification stops multi-accounting and raises the barrier to join."],
    p: ["One person runs many accounts and passes gold with the answers of the others.", "A person leaves a vendor, and their access continues for weeks because group sync is nightly."],
    v: "Sign in through a test provider, remove the user from the provider group, and confirm that access ends within the stated time, that sessions expire, and that a second account with the same verified identity is refused.",
    dep: []
  },
  "workflow-engine": {
    s: "The engine that moves items through stages such as label, review, adjudicate and accept, according to configurable rules and state machines.",
    d: "Each project defines stages, transitions and conditions: after two matching judgments accept, on disagreement add one more, on audit failure send back. The engine stores each item's state, applies transitions in response to events, creates tasks in queues and records every step. Definitions are versioned, and running items continue under the version they began with. It is hard because rules interact, long-running state must survive restarts, and changing a workflow while items are in flight needs a migration plan.",
    k: ["Declarative state machines vs code-defined workflows: declarative definitions are visible and testable and limited in expressiveness, while code handles any logic and hides it.", "Items pinned to their starting workflow version vs migrated to the new one: pinned items stay consistent and finish under old rules, while migration applies fixes and risks inconsistent states."],
    p: ["A transition rule has no path for one combination of results, and items sit in limbo forever.", "A workflow change is deployed, and in-flight items follow rules they were never validated for."],
    v: "Run items through every defined transition in a test project, including failure paths, and confirm each ends in a defined state with its steps recorded, that restarting the engine mid-run loses no item, and that a version change leaves in-flight items on their version.",
    dep: ["job-queue", "task-templates"]
  },
  "job-queue": {
    s: "Background processing for long-running work: ingestion, preprocessing, aggregation, exports and retraining, with retries, concurrency limits and visible status.",
    d: "Components submit jobs with parameters and priorities; workers pick them up, run them with timeouts and retry on failure with backoff, and report progress. Jobs are idempotent so a retry is safe, and large jobs are sharded. Dead-letter queues hold jobs that exhaust retries. Operators see queue depth and age. It is hard because jobs fail halfway, because partial effects must be undone or made repeatable, and because one heavy job class can starve all others.",
    k: ["At-least-once execution with idempotent jobs vs attempted exactly-once: at-least-once is reliable and demands careful job design, while exactly-once claims complicate the system and rarely hold.", "Separate queues per job class vs one shared queue: separate queues isolate heavy work and need more capacity planning."],
    p: ["A retried export job duplicates its output because it was not idempotent.", "A burst of ingestion jobs fills the workers, and exports wait for hours."],
    v: "Kill a worker mid-job, and confirm that the job is retried once, finishes with correct output and no duplicates, that failures after the limit land in the dead-letter queue with the error, and that queue age alerts fire.",
    dep: ["observability"]
  },
  "notification-service": {
    s: "Delivery of messages to workers, managers and systems: task availability, deadlines, quality alerts, payment notices and announcements, through email, in-app messages and chat.",
    d: "Components publish notification events; the service applies user preferences, groups and rate-limits them, renders templates in the recipient's language and sends them through channels, tracking delivery and reading. Critical alerts, such as a quality drift or a queue starved of reviewers, are separated from routine ones. It is hard because over-notification trains people to ignore everything, and because an alert that fails to reach the right person is indistinguishable from silence.",
    k: ["Digest batching vs immediate messages: digests reduce noise and delay action, while immediate messages are fast and overwhelm.", "User-configurable preferences vs fixed rules: preferences fit people and can silence the alerts that matter, so critical ones need an override."],
    p: ["Alerts go to a mailbox nobody reads after a team change.", "A flood of per-item notifications during a bulk operation locks a team out of its own tools."],
    v: "Trigger a critical alert and a routine one for a test user with preferences set, and confirm that the critical one arrives immediately in the right channel and language, the routine one is batched, and delivery is recorded.",
    dep: ["identity-and-sso", "job-queue"]
  },
  "api-and-sdk": {
    s: "The programmatic interface to the platform: creating projects, importing items, managing batches, retrieving annotations and exports, with client libraries and versioning.",
    d: "A documented HTTP interface with authentication, pagination, idempotency keys and rate limits exposes the same operations as the console. Client libraries wrap common flows. Versions are stable and deprecated on a schedule. Webhooks complement polling. The API is how customers integrate labeling into data and training pipelines. It is hard because it must keep behavior stable for years, expose enough to automate and not enough to bypass access checks, and handle large payloads reliably.",
    k: ["Versioned stable API with deprecation windows vs rapid iteration: stability earns integrator trust and slows change, while rapid iteration is flexible and breaks customers.", "Fine-grained endpoints vs bulk operations: fine-grained endpoints are simple to reason about, and bulk operations are needed at scale and are harder to make atomic."],
    p: ["A retried create request makes duplicate projects because no idempotency key was used.", "A bulk import endpoint accepts a malformed file halfway and leaves partial data."],
    v: "Run a full automated workflow through the API with client libraries, covering project creation, import, labeling by test accounts and export, then repeat each write with the same idempotency key and confirm that no duplicates appear.",
    dep: ["access-control", "identity-and-sso"]
  },
  "observability": {
    s: "Metrics, logs and traces of the platform's own health: latency, queue depth, error rates, job failures and costs, with alerts and dashboards for operators.",
    d: "Each service emits structured logs, metrics and traces linked by request and task ids. Dashboards show interface load times, queue wait, assignment latency, export duration and storage growth, and alerts fire on thresholds and trends. Worker-facing latency matters directly: slow tasks cost money. It is hard because telemetry volume is high, because user content and worker data must be kept out of logs, and because platform health must be separated from labeling quality, which has its own monitors.",
    k: ["Sampling traces vs full tracing: sampling controls cost and misses rare slow paths, while full tracing finds everything at a high price.", "Metrics at the task level vs aggregate only: task-level metrics support debugging individual complaints, and cost far more storage."],
    p: ["Logs include item contents or worker answers, and become a data leak.", "Alerts are tuned on average latency, and the slowest tasks, which workers feel most, are invisible."],
    v: "Inject a delay into task loading and an error into a job, and confirm that both appear in dashboards, that alerts fire within the stated time, and that a trace connects a worker's slow task to the slow storage call.",
    dep: []
  },
  "multi-tenancy": {
    s: "Separation of organizations sharing one platform: their projects, data, workers, keys, quotas and settings are isolated and cannot leak into each other.",
    d: "Every record belongs to a tenant, and every query, job, cache key and storage path is scoped by it. Quotas and rate limits stop one tenant from consuming shared capacity. Dedicated infrastructure tiers exist for those who need stronger isolation. Shared workers who serve several tenants are scoped per task. It is hard because isolation must hold in every path, including background jobs, search indexes, caches, exports and support tools, and a single unscoped query is a breach.",
    k: ["Shared infrastructure with logical isolation vs dedicated per tenant: shared infrastructure is efficient and relies on code correctness, while dedicated deployments isolate strongly and cost much more to run.", "Per-tenant quotas vs global fairness: quotas protect others from noisy neighbors and can leave capacity idle."],
    p: ["A cache key omits the tenant, and one customer briefly sees another's task.", "A support tool queries across tenants without scoping and exposes data to staff who need not see it."],
    v: "Run adversarial tests that attempt cross-tenant reads through the API, search, caches, exports and background jobs, and confirm every attempt is refused, and that one tenant's load spike leaves others' latency within limits.",
    dep: ["access-control", "identity-and-sso", "encryption"]
  }
});
