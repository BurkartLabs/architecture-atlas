// Details for the document OCR plate, part 5: serving and operations, and cross-cutting concerns.
ATLAS.details("document-ocr", {
  "model-serving": {
    s: "Hosts the detection, recognition, layout and extraction models behind network endpoints or in-process runtimes, with loading, warm-up, scaling and health checks.",
    d: "Models run on accelerators or CPUs in services that load weights, keep them warm, expose a batch interface and report latency and errors. Stages may be fused in one service to avoid copying images, or split to scale independently. Model sizes make cold starts slow, so scaling reacts to queue depth ahead of demand. The difficulty is heterogeneity: many models with different shapes, memory needs and latency, sharing a limited set of devices.",
    k: ["One service per model vs fused pipeline: separate services scale and update independently and pay for image transfer; fused pipelines are fast and couple release cycles.", "Dedicated accelerators vs shared: dedicated gives steady latency at higher cost; sharing improves utilization and creates interference."],
    p: ["A cold start loads a large model while a burst of documents waits, and timeouts cascade.", "Memory growth with large page sizes crashes the service mid-batch."],
    v: "Send a burst at ten times normal rate and confirm that latency percentiles stay within target after scale-out, with no out-of-memory restarts in the service log.",
    dep: ["model-registry", "gpu-batching"]
  },
  "gpu-batching": {
    s: "Groups work from many documents into batches sized to keep accelerators busy, balancing throughput against waiting time and memory use.",
    d: "Detection works on whole pages, recognition on many line crops of different widths. The scheduler collects items for a short window, sorts lines by width to limit padding, packs batches up to a memory limit and dispatches. Priorities let urgent documents jump ahead of bulk loads. Dynamic batching helps throughput several times over, while batch limits depend on the largest input. The balancing act is latency for interactive users against cost for bulk jobs.",
    k: ["Wait to fill batches vs dispatch immediately: waiting maximizes throughput and adds latency; immediate dispatch is responsive and wastes capacity.", "Sort by width vs arrival order: sorting reduces padding and reorders results that must be restored to document order."],
    p: ["One page with thousands of line crops monopolizes the device and delays interactive requests.", "An unusually tall image exceeds memory and fails the whole batch, not just itself."],
    v: "Measure throughput and p95 latency at several batch windows with a mixed interactive and bulk load, and confirm interactive requests stay below target while bulk jobs complete.",
    dep: ["pipeline-orchestrator"]
  },
  "pipeline-orchestrator": {
    s: "Runs each document through its stages as a tracked workflow, with fan-out per page, joins, branching by routing rules, timeouts and state that survives restarts.",
    d: "A workflow engine or queue-based design records each document's stage states. It fans pages out, waits for them, runs document-level steps after the join, branches on classification and confidence, and sends items to review and back. State is stored durably so a worker crash does not lose work. Visibility is a core requirement: operators need to see where each document is and why it is stuck. Complexity comes from partial failure and human waits that last hours or days.",
    k: ["Central workflow engine vs choreographed queues: an engine gives visibility and a single place for logic; queues are decoupled and make the whole flow hard to see.", "Persist after every stage vs checkpoint rarely: frequent persistence enables precise resume and costs storage and throughput."],
    p: ["A document waiting for review holds a worker slot, and slots run out.", "A retry replays an already completed stage and double-delivers output."],
    v: "Kill a worker mid-document and confirm that the workflow resumes at the right stage without repeating completed work, and that the stuck-document view shows each document's current stage and age.",
    dep: ["retry-idempotency", "routing-rules", "document-storage"]
  },
  "retry-idempotency": {
    s: "Rules that make repeated execution of a stage safe: unique keys, deterministic outputs, bounded retries with backoff and a place for permanently failed items.",
    d: "Failures are normal: timeouts, out-of-memory, bad pages, restarted workers. Each stage execution has an idempotency key made from document, page, stage and configuration version, so repeating it replaces rather than duplicates its output. Transient errors retry with limits; permanent ones, such as a corrupt page, go to a dead-letter store with the reason. Retried model inference must give the same result or be treated as a new version. The risk is retry storms that overload a recovering service.",
    k: ["Retry automatically vs fail fast: retries hide transient problems and extend the time to notice real ones; failing fast is visible and requires manual resubmission.", "Deterministic stages vs allowing nondeterminism: determinism makes retries safe and testable; nondeterministic stages need stored first outputs."],
    p: ["A poison page is retried forever and blocks its batch.", "Output written twice because of a retry creates duplicate records downstream."],
    v: "Inject a transient failure and a permanent failure into one batch; the transient case completes after retry with one output, and the permanent case lands in the dead-letter store with its reason.",
    dep: ["document-storage"]
  },
  "model-registry": {
    s: "The versioned catalog of models, preprocessing settings, thresholds and schemas, with lineage, evaluation results and the version that produced each output.",
    d: "Each model version records its weights, training data snapshot, code, evaluation scores per slice and compatible configuration. Releases promote a version through stages with shadow runs and gradual rollout, and any output refers to the exact versions used. Rollback is a pointer change. The registry makes it possible to answer why a document came out differently on two dates. The difficulty is the many interacting pieces: a model, its calibration, thresholds and schema must move together.",
    k: ["Bundle model, calibration and config as one release vs independent versions: bundles are consistent and coarse; independent versions give fine control and allow incompatible combinations.", "Shadow-run new versions vs deploy after offline tests: shadow runs find live problems and cost double compute."],
    p: ["A recognizer is upgraded without recalibrating confidence, and the review rate jumps.", "Output does not record the version, so a regression cannot be traced to a release."],
    v: "Pick any output from last month and look up the model, calibration, thresholds and schema versions; reprocessing with that bundle must reproduce the output.",
    dep: []
  },
  "document-storage": {
    s: "Durable storage for originals, page images, intermediate results and outputs, with encryption, content addressing, lifecycle rules and retention limits.",
    d: "Original files are stored immutably and referenced by hash. Derived artifacts, such as page images, detections and results, are stored per stage for debugging and reprocessing, with expiry. Retention is set by policy and by law: some customers require deletion within days, others require years of archive. Large volumes make cost significant, so images move to cheaper tiers. Deletion must reach every copy, including indexes, caches and review tool data.",
    k: ["Keep intermediates vs recompute: keeping makes debugging and error analysis possible and multiplies stored sensitive data; recomputing is cheap on storage and costs compute.", "Per-customer encryption keys vs shared: per-customer keys make deletion by key destruction possible and add key management."],
    p: ["A deletion request removes the original while thumbnails and extracted text remain in caches.", "Intermediate images accumulate indefinitely and become the largest cost."],
    v: "Delete a test document by policy and confirm that original, page images, intermediates, index entries and review records are all gone, as shown by an inventory of all stores.",
    dep: []
  },
  "access-privacy": {
    s: "Authentication, per-tenant isolation, least-privilege access for reviewers and engineers, audit logging and handling of personal data in documents.",
    d: "Documents often contain identity numbers, health and financial records. Controls include tenant isolation in storage and queues, role-based access for reviewers who see only assigned items, masking of unrelated fields, encryption in transit and at rest, and logs of every access. Engineers debugging need a sanctioned way to view a failing document. Regional rules may require processing in a place. The difficulty is that every stage handles the content, and so does every debugging tool.",
    k: ["Strict tenant isolation vs shared pools: isolation protects customers and costs utilization; shared pools are efficient and make leaks a single bug away.", "Reviewers see whole pages vs only the field: whole pages help accuracy and expose more; field crops limit exposure and make ambiguous cases harder."],
    p: ["Debug logs contain extracted values, and they are retained far longer than the documents.", "A shared model cache returns one tenant's cached result to another."],
    v: "Attempt to read one tenant's document with another tenant's credentials through every API, queue and tool, and confirm each attempt is denied and recorded in the audit log.",
    dep: []
  },
  "cost-controls": {
    s: "Budgets, quotas and policies that keep cost per page predictable, by choosing cheaper paths where quality allows and capping usage.",
    d: "Cost depends on page count, resolution, model size, retries and human review. Controls include routing easy pages to small models, early exit when a text layer exists, caching of repeated documents, per-tenant quotas, spot capacity for bulk work and tracking of cost per page by stage. Review labor usually dominates, so improving automation can save more than any compute optimization. The conflict is between accuracy, speed and price, and these tradeoffs need explicit owners.",
    k: ["Cheapest model first with escalation vs best model always: escalation saves much compute and adds latency on hard pages; best-always is simple and expensive.", "Hard quotas vs soft alerts: hard quotas bound spend and refuse legitimate bursts; alerts keep service and risk overspend."],
    p: ["A customer uploads a hundred-thousand-page archive, and the month's budget disappears overnight.", "Escalation thresholds are poorly tuned and nearly every page runs both models."],
    v: "Report cost per page by stage for a week and match the total with the bill; then run a quota-exceeding job and confirm the defined limit behavior occurs.",
    dep: ["model-serving", "routing-rules"]
  },
  "error-propagation": {
    s: "Every stage consumes the previous stage's output, so an early error is carried forward and amplified, and later stages rarely signal that their input was wrong.",
    d: "A skewed page degrades detection, which degrades segmentation, recognition, layout and extraction, and the final field is wrong with a confidence that reflects only the last stage. Pipelines handle this with stage-level quality gates, carrying uncertainty forward, saving intermediate outputs and retrying a stage with a different method. Joint models reduce hand-offs and are harder to inspect. The design question is where to detect and correct problems cheaply, usually as early as possible.",
    k: ["Modular stages vs end-to-end model: modules can be inspected and replaced and accumulate errors; end-to-end models avoid hand-offs and are harder to debug and fix.", "Hard decisions at each stage vs passing alternatives forward: hard decisions are simple and lose information; alternatives keep options open and multiply the work."],
    p: ["Orientation error in the first step makes every later metric look like a recognition problem.", "Confidence reflects the last stage only, so a field read from a mis-segmented region looks reliable."],
    v: "Inject known corruption at one stage, such as a ten-degree skew, and measure the final field error and the confidence; the loss should appear in the confidence or raise a gate.",
    dep: ["quality-scoring", "char-confidence", "error-taxonomy"]
  },
  "confidence-as-contract": {
    s: "A confidence number is a promise to downstream users and reviewers, so it must mean the same thing across models, versions, document types and stages.",
    d: "Thresholds, review workloads, customer guarantees and automation rates all depend on confidence. The contract states what a score means, how it is calibrated, and how it is combined from stages. Breaking it by changing models without recalibration, or by combining scores carelessly, silently changes error rates and costs. It requires labeled outcomes, from audits, to verify. The question to settle is who owns the meaning of the number and how it is tested at every release.",
    k: ["One calibrated probability vs raw scores per model: calibrated values are comparable and require maintenance; raw scores are free and cannot be compared across versions.", "Confidence per field vs per document: field confidence supports precise review; document confidence is simpler and hides one bad field."],
    p: ["Each team uses its own scale, and combined thresholds are meaningless.", "A model release changes confidence distributions, and nobody notices until the review queue floods."],
    v: "At every release, compare reliability curves of the new and old versions on the same audit sample, and block the release if calibration error exceeds the agreed bound.",
    dep: ["confidence-calibration", "threshold-policy"]
  },
  "document-variability": {
    s: "Real documents vary in layout, language, print quality, paper, age, capture device and condition far more than any training set, and the long tail determines the product's reputation.",
    d: "The population is not fixed: new suppliers, redesigned forms, new scanners and phone apps arrive continuously. Systems cope with diverse training data and augmentation, fallback paths, template-free methods and review. Variability is measured by slicing evaluation on source, quality and type. Decisions about which documents to support, and which to refuse, belong with the product definition. The long tail is permanent, so the design assumes a stream of unfamiliar inputs.",
    k: ["Broad generalist models vs per-customer tuning: generalists handle surprises with moderate accuracy; tuned models are excellent on known sources and brittle on new ones.", "Support everything vs a defined supported set: broad support wins customers and creates unbounded quality promises; a defined set is honest and turns some away."],
    p: ["Accuracy measured on a clean benchmark is quoted, and the first real customer's faxes perform far below it.", "A new capture app compresses images heavily, and every document from it fails in the same way."],
    v: "Evaluate per source and per quality tier, and list the lowest-performing slices with their share of volume; the report must show variability, not a single average.",
    dep: ["quality-scoring", "drift-monitor", "unknown-handling"]
  },
  "sensitive-data": {
    s: "Scanned documents are full of identity, health, financial and legal content, so privacy, retention and access are design constraints for every stage, tool and log.",
    d: "Sensitive data lives in images, intermediates, text, indexes, caches, review screens, logs, training sets and test corpora. Controls include encryption, tenant isolation, minimal retention, masking in review and logs, consent for using corrections as training data, and regional processing. Redaction, access control and deletion must cover every copy. The common failure is a side channel, such as a debug log or a shared test set, outside the controlled path.",
    k: ["Keep data for improvement vs delete early: keeping enables retraining and error analysis and increases exposure; early deletion limits risk and slows learning.", "Centralized processing vs processing in the customer's environment: central is easier to operate and improve; local keeps data in place and complicates updates."],
    p: ["Real customer documents are copied into a development corpus without consent.", "Extracted values in application logs are shipped to a third-party monitoring service."],
    v: "Trace one test document with unique marker strings through every store, log and tool; after deletion, search all of them for the markers and find none.",
    dep: ["access-privacy", "document-storage", "redaction"]
  },
  "language-and-script-coverage": {
    s: "Which languages, scripts, directions and conventions the system supports, and how well, shapes models, dictionaries, normalization and evaluation in every layer.",
    d: "Support is more than recognition: layout rules differ for right-to-left and vertical text, dates, numbers and names follow local conventions, dictionaries and language models are per language, and labeled data is scarce for many scripts. Quality is published per language, not as one number. Adding a language touches detection, recognition, rescoring, normalization, extraction and review staffing. Honest coverage statements matter more than a long list of nominal languages.",
    k: ["Few well-supported languages vs many nominal ones: few allows high quality and tested behavior; many wins breadth and gives poor results for the tail.", "Language-specific pipelines vs one multilingual path: specific pipelines are accurate and costly to maintain; one path is simple and uneven."],
    p: ["A script is advertised as supported, and no reviewer can read it to correct output.", "Numbers in a locale with different digits are not normalized and fail validation."],
    v: "Publish a table of per-language error rates on labeled test pages, and for each supported language confirm that a reviewer, a dictionary and a normalization rule exist.",
    dep: ["multilingual-models", "script-detector", "field-normalizer"]
  },
  "versioning-and-reproducibility": {
    s: "Any result must be traceable to the exact models, settings, templates and code that produced it, and reproducible, so changes can be tested and disputes resolved.",
    d: "Outputs carry version stamps for every component; stored inputs allow reprocessing; stages are deterministic or record their randomness. Changes are rolled out gradually with comparisons against previous behavior, and old versions remain runnable for audit. Regulated customers need to show how a value was derived years later. The tension is that improvement means change, and customers who built processes around specific output behavior treat any change as a regression.",
    k: ["Pin versions per customer vs always latest: pinning gives stability and fragments maintenance; latest improves everyone and surprises somebody.", "Store inputs for reprocessing vs delete after processing: storing allows reproduction and conflicts with minimal retention."],
    p: ["A library upgrade changes numeric output in the last decimal place, and every regression comparison fails.", "A customer disputes a value from two years ago, and the model that produced it is gone."],
    v: "Reprocess a stored document from a year ago with its stamped versions and compare with the original output; they must be identical or differences must be explained.",
    dep: ["model-registry", "template-registry", "regression-corpus"]
  },
  "latency-vs-accuracy": {
    s: "Faster paths use smaller models and fewer passes and make more mistakes, so each use case must fix how long a page may take and how much error it can tolerate.",
    d: "An interactive phone capture needs a result in a second or two; a nightly archive can use the slowest, best models and more review. Levers include model size, resolution, beam width, rescoring, ensembles, tiled passes and escalation to heavier models only for uncertain pages. Budgets are set per use case and per stage. The decision is not only technical: it determines hardware cost, user experience and how much human review is needed.",
    k: ["One tuned pipeline vs multiple service tiers: one pipeline is simple to run and fits no use case perfectly; tiers match needs and multiply what is tested.", "Early exit on confident results vs always full processing: early exit saves large compute and risks missing a flaw; full processing is uniform and costly."],
    p: ["A pipeline tuned for archives is exposed to an interactive app and times out.", "Speed optimizations lower accuracy slightly on every page, and the loss is never measured."],
    v: "For each service tier, publish p50 and p95 latency alongside field accuracy on the same labeled set, and confirm both meet the tier's stated targets in a load test.",
    dep: ["gpu-batching", "cost-controls", "model-serving"]
  },
});
