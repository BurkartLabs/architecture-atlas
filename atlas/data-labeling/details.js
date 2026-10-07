// Details for the data labeling plate, part 1: export and integration, cost and operations, cross-cutting concerns.
ATLAS.details("data-labeling", {
  "export-formats": {
    s: "The file and record layouts in which labeled data leaves the platform, such as per-item JSON, columnar tables and region or span lists, each tied to a data type.",
    d: "Each data type has conventions for expressing a label: boxes as corner or center-plus-size coordinates, masks as run-length or polygon encodings, text spans as character offsets, ranking as ordered ids. The platform defines one internal representation and maps it to each target. Coordinates may be absolute or normalized, and offsets may count characters or bytes. The hard part is that formats differ in what they can express, so a lossless internal model is converted into lossy targets and the loss must be known.",
    k: ["One rich internal model with per-format writers vs storing each format natively: one source of truth, at the cost of lossy conversions that need explicit documentation.", "Normalized vs absolute coordinates: normalized values survive resizing, but consumers must know the original dimensions to use them."],
    p: ["Offsets counted in bytes by the exporter and characters by the consumer silently shift every span after the first non-ASCII character.", "A format that cannot express overlapping or empty labels drops them without warning."],
    v: "Export a small dataset in each supported format, load every file with an independent reader, and confirm that the box, mask and span counts and positions match the annotation store exactly.",
    dep: ["annotation-store", "dataset-versions"]
  },
  "format-converters": {
    s: "Translators between the platform's internal annotation model and the layouts other tools expect, handling coordinate systems, class mappings and fields that have no equivalent.",
    d: "A converter reads internal annotations and writes a target layout, or reads a foreign layout and produces internal annotations. It resolves class names to the target's ids, converts coordinate conventions, flattens or rebuilds hierarchies, and applies rules for fields the target cannot hold. Converters are small but numerous, and each carries conventions that are rarely written down, such as whether a polygon is closed or whether an image origin is at the top or the bottom.",
    k: ["Round-trip tests per converter vs trusting the specification: tests catch silent convention mismatches, but only cover the cases someone thought to include.", "Strict failure on unmappable fields vs best-effort drop: strictness prevents silent loss, and best effort keeps pipelines running with data quietly missing."],
    p: ["A class-id mapping built from list order changes when a class is added in the middle, relabeling every old record.", "Image origin conventions disagree, and every vertical coordinate arrives mirrored."],
    v: "Convert a dataset to a target layout and back, then diff the result against the original and confirm that every difference is a documented, expected loss.",
    dep: ["export-formats", "ontology-schema"]
  },
  "export-pipeline": {
    s: "The job that builds an export: select items by version and filter, apply quality gates, join metadata, write files and publish them with a manifest and checksums.",
    d: "An export request names a dataset version, filters and a format. A job reads the matching annotations, applies the configured gates, joins asset references, renders files into object storage and writes a manifest listing every file with its size and checksum. Large exports shard across workers and finish with an atomic commit so consumers never see half a set. It is hard because exports are large, repeated and must be reproducible: the same request against the same version must produce identical bytes.",
    k: ["Materialized exports stored per version vs rendered on demand: stored exports are instant and auditable, but cost storage and go stale if conversion code changes.", "Atomic publish via manifest last vs incremental visibility: atomic prevents partial reads, and delays every consumer until the slowest shard finishes."],
    p: ["Reading from the live store instead of a frozen version makes two exports of the same request disagree.", "A crash after writing files but before the manifest leaves orphaned shards that consumers might still pick up."],
    v: "Run the same export request twice against one version and confirm identical manifests and checksums. Kill the job mid-run and confirm no consumer-visible manifest appears.",
    dep: ["dataset-versions", "export-formats", "quality-gates", "job-queue", "asset-storage"]
  },
  "streaming-and-pull-api": {
    s: "Programmatic access that lets training jobs fetch annotations page by page or as a stream, authenticated and scoped to a dataset version rather than the live project.",
    d: "Besides file exports, the platform serves annotations over an API: paged listing with stable cursors, filtered queries, and streaming of large result sets. Requests name a version, so the answer does not change under the reader. Asset access is by short-lived signed links returned with the records. Rate limits and quotas protect the store. The difficulty is consistency: cursors must survive concurrent edits, and a training job reading for hours must see one coherent snapshot.",
    k: ["Version-pinned reads vs reading live state: pinned reads are reproducible, while live reads show corrections immediately but make training runs unrepeatable.", "Cursor pagination vs offset paging: cursors stay stable under inserts, and offsets are simpler but skip or repeat rows as data changes."],
    p: ["Offset pagination over a changing set returns duplicates and gaps, so a training epoch quietly sees some items twice.", "Signed asset links in the response expire before a slow consumer reaches them."],
    v: "Page through a dataset version while another process edits annotations in the live project, and confirm the pages together contain exactly the versioned items once each, unchanged.",
    dep: ["dataset-versions", "access-control", "signed-url-access", "api-and-sdk"]
  },
  "training-platform-handoff": {
    s: "The contract by which a dataset version becomes a training input: a registered artifact with schema, splits, statistics and lineage that the training side can reference by id.",
    d: "Rather than copying files by hand, the platform registers a dataset version with the training platform's catalog, passing the manifest location, schema, split definitions and summary statistics such as class counts. Training runs record the version id, so a model can be traced to its data. Notifications tell the training side that a new version exists. It is hard because both sides must agree on versions, schemas and permissions, and because changes to the label schema break models trained on the old one.",
    k: ["Registering by immutable version id vs a moving latest pointer: ids give traceability, while latest is convenient and makes a model's training data unknowable later.", "Pushing metadata to the training side vs letting it pull: pushing keeps its catalog current, at the cost of coupling release timing across two systems."],
    p: ["A schema change published as the same dataset name breaks running training jobs mid-epoch.", "Summary statistics computed before the final quality filter describe data the model never sees."],
    v: "Register a version, start a training run from it, and confirm the run's recorded lineage resolves to that exact version, schema and split definition. Then trace one training item back to its annotation history.",
    dep: ["export-pipeline", "dataset-versions", "lineage-and-provenance", "splits-and-sampling"]
  },
  "webhooks-and-events": {
    s: "Outbound notifications of platform events, such as a batch finishing or a dataset version being published, so external systems react without polling.",
    d: "The platform emits events for lifecycle changes and delivers them to registered endpoints with signed payloads, retries with backoff and a record of every attempt. Consumers use events to start exports, update trackers or trigger retraining. Delivery is at-least-once, so events carry ids for deduplication, and ordering is guaranteed only within one project or batch. It is hard because receivers fail, are slow, or are down for hours, and a flood of events must not overload either side.",
    k: ["At-least-once delivery with consumer deduplication vs attempts at exactly-once: at-least-once is achievable and simple, and shifts idempotency to every receiver.", "Thin events carrying ids vs fat events carrying data: thin events avoid leaking data and staleness, but force a callback for every use."],
    p: ["A receiver that is down for a day gets a burst of retries and events from the backlog all at once.", "Unsigned payloads let anyone who finds the endpoint forge a publish event."],
    v: "Publish a dataset version while the receiver returns errors for three attempts, and confirm exactly one logged successful delivery with a valid signature, and that a replayed event id is ignored by the receiver.",
    dep: ["job-queue", "api-and-sdk"]
  },
  "import-existing-labels": {
    s: "Bringing labels made elsewhere, such as legacy datasets or model predictions, into the platform as annotations or pre-labels, mapped to the current ontology.",
    d: "Teams rarely start empty. An import reads files in a foreign layout, maps classes to the current ontology, validates geometry and offsets against the assets, and creates annotations with a source tag marking them as imported rather than human-made. Imports may land as accepted labels, as pre-labels for review, or as gold. The difficulty is trust: imported labels carry unknown quality and unknown guidelines, and mixing them with fresh labels without a marker contaminates quality metrics.",
    k: ["Importing as pre-labels to review vs as accepted labels: review costs money and finds errors, while direct acceptance is free and inherits every old mistake.", "Strict validation and rejection vs lenient import with warnings: strict keeps the store clean, and lenient preserves old data at the cost of broken geometry later."],
    p: ["Imported labels follow a retired guideline version, and nothing marks them, so quality metrics blend two definitions.", "Asset identifiers in the old files do not match the ingested assets, and labels attach to the wrong images."],
    v: "Import a legacy file of known contents and confirm every label carries an imported source tag and the ontology version it was mapped to, that unmappable rows are listed, and that a sample of labels overlays correctly on its assets.",
    dep: ["format-converters", "ontology-schema", "annotation-store", "asset-ingestion"]
  },
  "cost-per-label-tracking": {
    s: "Attributing money to each label and each accepted item by combining payments, review effort, vendor fees and compute, so cost per usable label is known per project and class.",
    d: "Every task, review and adjudication carries time and a rate. The platform sums direct worker pay, reviewer and adjudicator cost, vendor charges and model-assist compute, then divides by accepted outputs rather than attempted ones. Costs roll up by project, class and week. The hard part is the denominator: rejected work, redundancy and rework are real costs, so the cost per accepted label is often several times the price listed per task.",
    k: ["Cost per accepted label vs cost per task: accepted-label cost is the honest number, and it moves slowly because it depends on later review outcomes.", "Allocating shared overhead vs showing only direct cost: allocation gives full cost for decisions, and invites arguments about the allocation rule."],
    p: ["Dividing spend by submitted tasks makes a project with high rejection look cheap.", "Vendor invoices arrive monthly, and live dashboards omit them until then, understating cost."],
    v: "For one finished batch, compute pay, review, redundancy and vendor cost by hand from raw records and confirm the dashboard's cost per accepted label matches to the cent.",
    dep: ["time-tracking", "payments-and-payouts", "redundancy-policy", "annotation-store"]
  },
  "budget-controls": {
    s: "Limits that stop or warn when spending approaches a cap, set per project, batch or vendor, and checked before work is released rather than after it is paid.",
    d: "A budget defines a ceiling and thresholds. Before a batch is released, the platform estimates its cost from item count, expected time and redundancy, compares it with the remaining budget and either releases it, holds it for approval or refuses it. During work, running totals trigger alerts and can pause assignment. The difficulty is estimation, because true cost depends on time per item and rework that are only known after the work is done.",
    k: ["Pre-release estimate gates vs after-the-fact alerts: gates prevent overruns, but a bad estimate blocks good work or lets bad work through.", "Hard stop at the cap vs soft warnings: hard stops protect the budget, and can leave a nearly finished batch unusable."],
    p: ["Estimates ignore redundancy and review, so a batch released within budget overruns by half.", "A paused project still owes pay for tasks already in progress, and the cap is breached anyway."],
    v: "Set a small cap, release batches until it is reached, and confirm that the next batch is held with its estimate shown, and that running totals never exceed the cap by more than in-flight work.",
    dep: ["cost-per-label-tracking", "throughput-forecasting", "workflow-engine"]
  },
  "time-tracking": {
    s: "Measuring active time per task from interface events, used to price work, detect rushing or idling, and forecast throughput.",
    d: "The interface records when a task is opened, when meaningful interaction occurs, and when it is submitted, then separates active time from idle gaps using inactivity thresholds. Times aggregate per worker, task type and class, giving distributions rather than single averages. These feed pay for hourly work, quality analysis and forecasts. It is hard because wall-clock time includes reading, thinking, breaks and tab switches, and any rule that reads from it changes how people behave.",
    k: ["Event-based active time vs wall-clock time: active time is closer to effort, but depends on idle thresholds that need tuning per task type.", "Using time for pay or ranking vs for monitoring only: pay linkage motivates honesty about time, but encourages speed-gaming and padding."],
    p: ["A worker leaves a task open overnight, and one task inflates a daily average by an hour.", "Time targets pressure workers to rush, and error rates rise while the dashboard shows improving speed."],
    v: "Complete a task with a known five-minute pause in the middle and confirm that recorded active time excludes the pause, and that the distribution report shows the pause as an idle gap.",
    dep: ["interaction-telemetry", "annotation-store"]
  },
  "throughput-forecasting": {
    s: "Predicting when a batch or project will finish from queue size, worker capacity, historical speed and rework rates, with a range rather than a single date.",
    d: "The forecast combines remaining items, observed items per hour by task type, the number of active workers by shift, the redundancy required and the expected share returning for rework. It produces a completion distribution and highlights the bottleneck: supply of workers, expert review or adjudication. The difficulty is that capacity is volatile, because workers join, leave and change speed, and that the final percent is slower since leftover items are the hard ones.",
    k: ["A distribution from historical variance vs a single date: ranges tell managers how much slack to hold, but are harder to communicate than one deadline.", "Per-queue forecasts vs one project forecast: per-queue forecasts expose bottlenecks, and require modeling the hand-offs between stages."],
    p: ["Extrapolating the speed of easy items to the remaining hard ones makes the forecast optimistic every time.", "Forecasts ignore expert review capacity, so a finished annotation phase waits weeks for reviewers."],
    v: "Forecast a past batch from its first day's data only, then compare the predicted range with its actual completion and confirm the actual date falls inside the stated interval.",
    dep: ["queue-manager", "capacity-and-shifts", "time-tracking", "redundancy-policy"]
  },
  "rate-setting": {
    s: "Choosing what each task type pays, by item, by hour or by outcome, so effective hourly earnings are fair, quality is rewarded and cost stays predictable.",
    d: "Rates start from measured time per task and a target hourly wage for the worker's region and skill, then adjust for difficulty classes, bonuses for accuracy or speed, and review premiums. Pilot data sets the first rates. Piece rates are monitored against actual time, because items that take longer than planned cut effective pay. It is hard because the incentive shapes the output: pay by item rewards speed, pay by hour rewards slowness, and bonuses on agreement reward conformity.",
    k: ["Piece rate vs hourly pay: piece rates cost predictably and reward speed, while hourly pay protects careful work and requires trusted time measurement.", "Accuracy bonuses based on gold vs on consensus: gold bonuses reward truth, and consensus bonuses reward agreeing with others even when everyone is wrong."],
    p: ["A rate set from pilot speed on easy items underpays the harder real batch, and the best workers leave.", "Bonus on agreement with the majority pushes workers to guess what others will choose."],
    v: "For one task type, compute effective hourly earnings from recorded time and pay for each worker and confirm that the median meets the target wage, and that no worker falls below the floor.",
    dep: ["time-tracking", "skill-and-trust-profiles", "payments-and-payouts"]
  },
  "vendor-invoicing": {
    s: "Reconciling what outside labeling vendors claim to have delivered against what the platform recorded as accepted work, before invoices are paid.",
    d: "Vendors supply teams that work in the platform or in their own tools. At period end the platform produces a statement of accepted items, hours, rework and penalties per team, matched to contract terms such as per-item prices and quality thresholds. Disputes are resolved against the audit trail. The hard part is agreeing on what counts: items rejected on review, items reworked at vendor cost, and items delivered late each have a contractual treatment that must be computed consistently.",
    k: ["Payment on accepted items vs on submitted items: accepted-only aligns vendor incentives with quality, and requires fast, fair review to avoid disputes.", "Platform-produced statements vs vendor-submitted invoices: platform statements are consistent and auditable, and vendors need access to the evidence behind them."],
    p: ["Review lags behind delivery, so items accepted next month appear in neither this invoice nor the dispute.", "Rework hours are billed twice, once as rejected work and again as new work."],
    v: "Generate a vendor statement for a closed period and recompute three random teams' totals from raw task records, checking that accepted counts, rework and payable amounts match, and that every disputed line links to its evidence.",
    dep: ["cost-per-label-tracking", "team-and-vendor-management", "quality-gates", "audit-log"]
  },
  "project-reporting": {
    s: "Dashboards and scheduled reports for project managers: progress, quality, cost, backlog and risks, drawn from the same records the rest of the platform uses.",
    d: "Reports summarize progress by stage and class, quality by team and worker, cost against budget, and the oldest waiting items. They read from precomputed aggregates refreshed on a schedule, with drill-down to individual items. Scheduled digests go to stakeholders. The difficulty is trust: every number must match a definition people agree on, such as what counts as done, and a dashboard that disagrees with the invoice or the export loses all credibility.",
    k: ["Precomputed aggregates vs live queries: aggregates are fast and consistent, and lag the underlying data by their refresh interval.", "A few agreed headline metrics vs many configurable ones: fewer metrics are understood, and managers lose the ability to answer unusual questions without data requests."],
    p: ["Two dashboards define done differently, and project managers quote different completion numbers to the same executive.", "Aggregates silently exclude archived items, so totals drop after cleanup."],
    v: "Pick one reported number, such as accepted items this week, and recompute it from raw records using the stated definition, confirming that the dashboard, the digest and the export agree.",
    dep: ["cost-per-label-tracking", "quality-gates", "throughput-forecasting"]
  },
  "label-ambiguity": {
    s: "How well the label definitions pin down a single correct answer, and what the platform does when reasonable people legitimately disagree.",
    d: "Many labels have no ground truth: sentiment, relevance, toxicity, whether an object is occluded too much to count. Disagreement can be noise, a sign of unclear guidelines, or real variation in human judgment. Every layer treats it differently: the ontology tries to reduce it, routing measures it, aggregation resolves it, export may preserve it as soft labels, and models trained on it learn the average. A platform that assumes one truth hides this variation rather than removing it.",
    k: ["Collapse to one label vs keep the distribution of judgments: one label is simple for training code, and distributions preserve information about difficulty and subjectivity at the cost of larger data and more complex consumers.", "Tighten guidelines vs accept variation: tighter rules raise agreement, and can encode arbitrary conventions that disagree with how users see the data."],
    p: ["A team raises agreement by making rules narrower, and the model then fails on the real cases the rules excluded.", "Discarding all disagreeing items removes exactly the hard and informative examples."],
    v: "Pick a sample of items with low agreement and confirm each has a recorded disposition: guideline revised, adjudicated, kept as soft label, or excluded, with the reason and the guideline version.",
    dep: []
  },
  "cost-quality-speed": {
    s: "The three-way trade-off behind every setting: more redundancy, review and training raise quality, while faster turnaround and lower cost push against them.",
    d: "Each knob moves the three together. Extra redundancy raises quality and cost. Smaller batches with faster review shorten the feedback loop and add overhead. Cheaper, less trained workers lower the price and raise the error rate that later review must correct. The right setting depends on what a wrong label costs the model and the business. The platform's job is to expose the knobs, measure their effect and let owners choose per project, instead of fixing one policy for all data.",
    k: ["Uniform quality policy vs per-class or per-risk policy: uniform is simple to operate, and per-risk policy spends review where errors hurt most at the price of more rules.", "Optimizing for cost per label vs cost per model improvement: the first is easy to measure, and the second is what matters but needs experiments."],
    p: ["Optimizing cost per task drives quality down until review and rework consume the savings.", "A single global accuracy target over-reviews easy classes and under-reviews the rare, costly ones."],
    v: "Run one batch at two redundancy levels and compare cost per accepted label and measured accuracy against gold, confirming that the platform reports both numbers per setting so the trade-off can be read off directly.",
    dep: []
  },
  "human-factors": {
    s: "The effects of attention, fatigue, monotony, incentives and tool friction on label quality, which no model of the workflow captures unless it is measured.",
    d: "Workers label for hours. Accuracy falls with fatigue and repetition, rises with clear instructions and good tools, and is shaped by how they are paid, tracked and corrected. Distressing content takes a toll. Interface choices such as default selections, ordering and task length change the labels produced. These effects appear in every layer: batch size, break prompts, feedback tone, content exposure limits and shift design all belong to the platform, not to the workers' personal discipline.",
    k: ["Short tasks with frequent variety vs long uniform runs: variety sustains attention, and costs context switching and instruction overhead.", "Immediate feedback on mistakes vs periodic reports: immediate feedback teaches faster and can feel punitive when mistaken or too frequent."],
    p: ["Accuracy in the last hour of a shift is well below the first, and the quality metric averages them together.", "Default values in the interface get accepted far more often than chosen, and bias the whole dataset."],
    v: "Plot accuracy against gold by position within the shift and by consecutive items labeled for a sample of workers, and confirm that the platform has set breaks or batch limits according to the observed decline.",
    dep: []
  },
  "bias-and-fairness": {
    s: "How the composition, background and incentives of annotators, and the tools shown to them, shape labels, and therefore the behavior of models trained on those labels.",
    d: "Labels encode annotators' knowledge, culture, language and assumptions. A narrow pool produces labels that fit its own view, and pre-labels from a model anchor workers to the model's prior errors. Sampling and routing choices decide whose judgments count. The platform can measure this by comparing agreement across worker groups and by auditing class balance, but it cannot decide what is fair: that is a project decision, to be written into guidelines and recorded in the data card.",
    k: ["Homogeneous trained pool vs diverse pool: homogeneous workers agree more and give consistent labels, while diverse pools expose real variation and look noisier.", "Showing model suggestions vs hiding them: suggestions speed work and anchor judgment, while blind labeling is slower and gives independent evidence."],
    p: ["Annotators from one region label regional dishes, names or dialects as errors, and the model learns the same.", "Fairness checks run only on final labels miss bias introduced by whose tasks were routed to experts."],
    v: "Compare label distributions and agreement across annotator groups on a shared sample, and confirm the data card lists the annotator pool's composition, the pre-labeling use and the known limits.",
    dep: []
  },
  "reproducibility": {
    s: "The ability to explain, and rebuild, exactly which labels a given model was trained on, including guidelines in force, annotators, aggregation rules and tool versions.",
    d: "A dataset version must pin more than annotations: the ontology and guideline versions, the aggregation rule, the filter and split definitions, the pre-labeling model versions and the code that produced the export. History is append-only so earlier states can be reconstructed. Without this, a regression in a model cannot be traced to a labeling change. It is a cross-cutting concern because any component that mutates data silently, or applies an unversioned rule, breaks it.",
    k: ["Immutable snapshots with full provenance vs mutable current state with history: snapshots make rebuilds cheap and storage heavy, and history alone makes them expensive to reconstruct.", "Pinning tool versions in the manifest vs trusting backward compatibility: pinning allows exact replay, and old versions must be kept runnable."],
    p: ["A guideline change applied in place makes last month's dataset unrebuildable.", "The aggregation code is updated, and the same raw judgments now give different consensus labels."],
    v: "Rebuild a six-month-old dataset version from its recorded manifest, and confirm byte-identical output. Then change a rule and confirm the new version is named separately and the old one is unchanged.",
    dep: []
  },
  "scale-and-throughput": {
    s: "How the platform behaves as items, annotators and annotations grow by orders of magnitude, from thousands of items to billions of labels.",
    d: "Small projects tolerate a single database and synchronous pages. Large ones need sharded queues, bulk ingestion, assets served from object storage through caches, streaming exports and aggregates that do not scan the annotation store. Annotation interfaces must stay responsive with thousands of regions per image or hours of audio. Every layer has a growth limit: batch size, queue contention, export time, history size. The decision is where to make each component scale out, and where to accept a limit.",
    k: ["Designing for large scale from the start vs scaling when needed: early scale design avoids rewrites, and costs complexity small projects never needed.", "Eventually consistent aggregates vs exact counts: eventual aggregates stay fast at any scale, while exact counts are needed for billing and gating."],
    p: ["A queue table with row-level contention serves ten workers and stalls at a thousand.", "Annotation history grows without a retention policy until reads of a single item slow down."],
    v: "Load a synthetic project at one hundred times the usual item count and worker count, and confirm queue assignment latency, interface load time and export duration each stay within their documented limits.",
    dep: []
  }
});
