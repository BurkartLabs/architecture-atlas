// Details for the document OCR plate, part 4: review, output, evaluation.
ATLAS.details("document-ocr", {
  "confidence-calibration": {
    s: "Maps raw model scores to probabilities that match observed accuracy, so that a field reported at 0.9 is correct about nine times in ten.",
    d: "Calibration uses labeled outcomes: for each score bucket it measures how often the value was right, then fits a monotonic mapping such as isotonic or logistic regression, separately per field type and often per document source. It must be refit whenever models, preprocessing or document populations change. Calibrated confidence is what makes thresholds meaningful and lets the business predict review workload. The difficulty is that labels come from reviewers, who see only flagged fields, a biased sample.",
    k: ["Per-field and per-source calibration vs one global curve: per-segment curves are accurate and need enough labeled data for each; a global curve is simple and wrong for outliers.", "Calibrate on reviewer corrections vs on audited random samples: corrections are plentiful and biased toward hard cases; random audits are unbiased and costly."],
    p: ["A model update shifts score distributions and old thresholds quietly route twice as many fields to review, or half as many.", "Calibration is fit on clean documents and applied to poor scans, where it overstates confidence."],
    v: "Plot reliability curves per field type on a fresh random audit sample; each bucket's observed accuracy should sit within a few points of its stated confidence.",
    dep: ["char-confidence", "audit-sampling"]
  },
  "threshold-policy": {
    s: "The rule that decides per field which results pass automatically, which go to review and which are rejected, based on confidence, validation and business risk.",
    d: "Thresholds differ by field cost of error: a wrong total costs more than a wrong note. Policy combines calibrated confidence, validation results, document quality and customer settings, and can compute expected error cost to choose the cut. It sets the balance between automation rate and accuracy and is revised as the model improves. The hard part is that thresholds are a business decision, and a number set once tends to stay long after the model, the documents and the costs have changed.",
    k: ["Field-specific thresholds vs one global threshold: field-specific values match the real cost of errors and need more tuning; one number is simple and wasteful.", "Review the whole document vs only the flagged fields: whole-document review catches unflagged errors and costs far more time per document."],
    p: ["A threshold is lowered to clear a queue backlog and error rate to the customer rises for weeks.", "Different teams change thresholds without recording them, so accuracy trends cannot be explained."],
    v: "Replay a labeled week of documents at several threshold settings and plot automation rate against error rate for passed fields; the selected setting should be on the measured curve.",
    dep: ["confidence-calibration", "validation-rules"]
  },
  "review-queue": {
    s: "The prioritized list of fields and documents awaiting human verification, with assignment, deadlines, locking and escalation.",
    d: "Items enter with a reason such as low confidence, failed validation or unknown type, and are ordered by deadline, value and age. The queue assigns work to reviewers by skill and language, locks items being edited, returns abandoned items, and tracks time spent. Review can be per field, giving reviewers only the uncertain values, or per document. The challenge is flow: sudden volume spikes, aged items that miss deadlines and sensitive documents that only approved staff may see.",
    k: ["Per-field tasks vs whole documents: field tasks are fast and lose context; whole documents give context and slow reviewers down.", "Pull by reviewer vs push assignment: pulling is simple and lets hard items age; pushing balances load and needs a model of reviewer skills."],
    p: ["Items locked by a reviewer who left for the day block the queue until a timeout expires.", "Ordering by age alone leaves a few high-value documents behind low-value ones."],
    v: "Create a burst of mixed-priority items with deadlines, and check that they are assigned in the intended order, locks release on abandonment, and no item exceeds its deadline without an escalation record.",
    dep: ["threshold-policy", "access-privacy"]
  },
  "review-ui": {
    s: "The screen where a person sees the page image beside the extracted value, with the source highlighted, and confirms or corrects it quickly.",
    d: "A good interface shows the field's source box on the page, a zoomed crop, the extracted value and alternatives, with keyboard-only operation and no scrolling between fields. It displays why the item was flagged and previews how validation reacts to a change. Design affects accuracy as much as models: reviewers anchor on suggested values and approve errors they would have caught typing the value blind. It must also meet accessibility needs and handle huge pages and many fields.",
    k: ["Show the prediction vs hide it: showing is faster and induces approval of wrong values; hiding is slower and catches more errors, so it suits audits.", "Field-by-field focus vs full page: focus is fast and loses context; full page helps ambiguous cases and invites distraction."],
    p: ["Reviewers press Enter through fields, confirming values they did not read.", "Highlights are misaligned because the display scale differs from the stored coordinates."],
    v: "Time a reviewer working a standard batch and seed it with known wrong values; measure throughput and the fraction of seeded errors caught.",
    dep: ["review-queue", "provenance-metadata", "structured-json"]
  },
  "correction-capture": {
    s: "Stores every human correction with its context, so it can be used for training data, error analysis and measurement of real accuracy.",
    d: "Each correction records the original value and box, the corrected value, the reviewer, the document type, model version and confidence, and whether the reviewer confirmed or changed. Corrections are deduplicated and checked before use as labels, since reviewers make mistakes too. They feed fine-tuning, calibration and the regression corpus. The difficulty is bias: only flagged fields are reviewed, so the data under-represents errors the system was confident about.",
    k: ["Use corrections directly as labels vs after adjudication: direct use is quick and adds reviewer errors; adjudication costs extra review and cleans the set.", "Store full page context vs the field crop: full context supports retraining of layout models and increases the sensitive data kept."],
    p: ["A reviewer's systematic habit, such as always normalizing a name, teaches the model a wrong pattern.", "Corrections are stored without the model version, so they cannot be attributed to a regression."],
    v: "Correct a field and confirm a record exists with before, after, model version and source box; export a training batch and verify it excludes unadjudicated disagreements.",
    dep: ["review-ui", "model-registry"]
  },
  "double-keying": {
    s: "Two independent people enter or verify the same field and a third adjudicates disagreements, used when error cost is high or when building trusted labels.",
    d: "Independence means neither sees the other's answer or the machine's suggestion. Matching answers are accepted; disagreements go to a senior reviewer. The agreement rate is an accuracy signal in itself, and the process is used for critical fields such as amounts and identifiers, for ground-truth creation and for onboarding new reviewers. It multiplies labor, so it is applied selectively by value or by confidence.",
    k: ["Blind double entry vs single review with suggestion: blind entry gives very low error and doubles the cost; single review is cheap and anchors on the suggestion.", "Adjudicate every disagreement vs sample: full adjudication guarantees the result; sampling saves labor for low-value fields."],
    p: ["Both reviewers are shown the model's value first, so agreement is inflated by anchoring.", "The same two reviewers always work together and share the same habits, so their mistakes agree."],
    v: "Insert known-answer fields into the stream; the process's final accepted value must match the known answer, and the measured disagreement rate must fall within its expected range.",
    dep: ["review-queue", "review-ui"]
  },
  "audit-sampling": {
    s: "Random sampling of documents that passed automatically or after review, checked against truth to measure real accuracy and catch confident errors.",
    d: "Auditors re-key or inspect a random sample, stratified by document type, source and field, including items that were never flagged. The result is an unbiased error rate with a confidence interval, used to validate calibration, justify thresholds and report quality to customers. The sample size follows from the precision needed per segment. It costs labor, and the benefit is the only measurement that sees errors the system itself did not doubt.",
    k: ["Uniform vs stratified sampling: uniform is simple and thin on rare types; stratified gives stable estimates per segment and needs weights when aggregating.", "Fixed rate vs adaptive: a fixed rate is predictable; adaptive sampling increases after a model change or an alert."],
    p: ["Audit sample is drawn only from reviewed items, so error rates of the auto-passed majority are never measured.", "Auditors see the system's answer and accept it, so errors appear fewer than they are."],
    v: "Draw a stratified weekly sample of auto-passed fields, have them verified blind, and publish the error rate with an interval per document type.",
    dep: ["review-queue", "ground-truth"]
  },
  "stp-tracking": {
    s: "Measures the share of documents and fields that pass through with no human touch, alongside the accuracy of those, as the system's main business indicator.",
    d: "Straight-through rate is reported per document type, field, customer and period, together with the audited error rate of the auto-passed items. Rate alone is meaningless: lowering thresholds raises it and the error rate with it. Trends show model improvements, new document types and drift. It connects model quality to cost, since each reviewed field has a labor price. Careless definitions inflate it, for example counting documents that went through but were later corrected downstream.",
    k: ["Document-level vs field-level rate: document-level reflects the actual labor saved and is dragged down by one weak field; field-level pinpoints what to improve.", "Report with accuracy vs alone: paired reporting stops gaming by thresholds, and is harder to summarize in one number."],
    p: ["The team celebrates a rate increase that came from a lowered threshold, and customer complaints follow.", "Downstream corrections made in the customer's system never flow back, so accuracy of passed items is overstated."],
    v: "Pick a month and recompute rate and audited accuracy from raw logs and audit data; the dashboard figures must match, and a threshold change must show up as a marked event.",
    dep: ["threshold-policy", "audit-sampling"]
  },
  "searchable-pdf": {
    s: "Output that keeps the original page image and adds an invisible text layer positioned over each word, so the document looks unchanged and can be searched and copied.",
    d: "The writer places recognized words at their boxes with matching font size and width in an invisible layer, often with the original image compressed and optionally segmented into background and text layers to save space. Text order follows reading order for copy and accessibility tools. Standards for long-term archiving constrain fonts and metadata. The challenges are alignment accuracy, the file size of image layers and special scripts where invisible text must map correctly to glyphs.",
    k: ["Image plus hidden text vs rebuilt text document: hidden text preserves the look and evidence; rebuilding gives reflowable, smaller output and may change appearance.", "Layered image compression vs single image: layered is much smaller and can distort fine detail; single image is simpler and larger."],
    p: ["Hidden text boxes are offset, so search highlights land beside the words they match.", "Recognition errors are invisible, yet searchable text silently misses words in the image."],
    v: "Search a word in the produced file and confirm the highlight lies on that word in the image; copy a paragraph and compare it with the reading-order transcript.",
    dep: ["reading-order", "word-segmenter", "provenance-metadata"]
  },
  "structured-json": {
    s: "The primary machine-readable result: pages, blocks, lines, words, tables and fields with coordinates, confidence, types and provenance, in a documented, versioned schema.",
    d: "The schema nests page, block, line and word, with polygons in page coordinates and confidence at every level, plus a separate section for extracted fields and tables with references into the layout. It names the model and configuration versions that produced it. Consumers range from user interfaces to data pipelines, so backward compatibility matters. The difficulty is size, since word-level detail multiplies, and balancing a rich schema with one that remains stable.",
    k: ["Rich nested layout vs flat fields only: rich output supports review, highlighting and reprocessing; flat output is simpler and discards the evidence.", "Strict versioned schema vs flexible: strict versions protect consumers and slow changes; flexible schemas evolve fast and break clients unexpectedly."],
    p: ["A schema change renames a field, and downstream integrations silently receive nulls.", "Coordinates are stored in different units across versions."],
    v: "Validate output against the published schema for every document type, and render the coordinates back over the page to confirm every box lands on its content.",
    dep: ["provenance-metadata", "model-registry"]
  },
  "layout-markup": {
    s: "Established markup formats that store recognized text together with its layout and confidence, used for interchange with archives, libraries and other tools.",
    d: "Formats such as hOCR and ALTO XML describe pages, blocks, lines and words with coordinates and optional confidence, using HTML or XML. They suit digital library and archive workflows and interoperate with viewers and correction tools. Mapping the system's internal structure to them loses some detail, such as tables or fields, and a profile fixes what is included. Their value is that other organizations' tools can read the output without custom integration.",
    k: ["Emit a standard format vs only the internal schema: standards give interchange and tool support and constrain what can be expressed; the internal schema is complete and proprietary.", "One profile of the standard vs all options: a fixed profile is predictable for consumers and leaves some features unused."],
    p: ["Coordinates are exported in a different unit than the one the viewer expects, and highlights are scaled wrongly.", "Table structure is silently dropped on export, and consumers believe none was found."],
    v: "Open the exported file in an independent viewer and confirm that word boxes, reading order and confidence values display as in the source.",
    dep: ["structured-json"]
  },
  "text-export": {
    s: "Plain text, markdown or similar flat renderings of a document for search, summarization and language-model input, with layout reduced to simple conventions.",
    d: "Export linearizes blocks in reading order, renders headings, lists and tables in simple markup, and drops page furniture such as headers and footers. Tables are written as grids or as per-row records, since flat tables are hard for models to read. Because many consumers feed language models, the form of the text affects their answers. The choice of what to drop is lossy and permanent for that output, while the structured result keeps everything.",
    k: ["Faithful reading-order text vs semantic cleanup: faithful keeps all content and noise; cleanup reads better and can hide content that mattered.", "Tables as markup vs as sentences or records: markup is compact and dense; records are easier for models and larger."],
    p: ["Tables flattened into one line per row lose column meaning, and a model reads the wrong header.", "Page-break artifacts such as page numbers appear inside sentences."],
    v: "Feed the exported text of a set of documents to a consumer, such as a question-answering test, and compare its answers with those obtained from the ground-truth text.",
    dep: ["reading-order", "header-footer", "heading-hierarchy"]
  },
  "field-mapping": {
    s: "Translates extracted fields into the vocabulary and format of the destination system, such as an accounting or case-management record, with defaults and lookups.",
    d: "Mappings convert field names, units, code lists and structures: vendor names to vendor ids, tax text to tax codes, a line list to the destination's line structure. Lookups use master data, and unmatched values produce explicit exceptions rather than guesses. Mapping versions follow the destination's own changes. It is a boundary where extraction errors turn into business errors, because a wrong vendor match posts an invoice to the wrong account.",
    k: ["Mapping in the extraction service vs in the consuming system: in the service, one team owns correctness and needs destination knowledge; in the consumer, the destination owns it and sees raw output.", "Fuzzy master-data matching vs exact: fuzzy matching increases hits and risks wrong matches; exact matching sends variants to exceptions."],
    p: ["A vendor name matches a similar but different company, and payments go to the wrong account.", "A new destination version requires a field the mapping does not populate, and writes fail silently."],
    v: "Run documents through to a sandbox of the destination and compare the created records with expected records, including a vendor not in master data, which must produce an exception.",
    dep: ["structured-json", "field-normalizer", "validation-rules"]
  },
  "delivery": {
    s: "Hands results to consumers by callbacks, polling, queues or files, with retries, signing, ordering and a record of what was delivered.",
    d: "Processing is asynchronous, so the system notifies consumers when a document is done, partial or failed. Webhooks carry a signed event with a link to the result; queues give ordered streams with replay; polling is the fallback. Delivery tracks acknowledgments and retries with backoff, and exposes status. Consumers must handle duplicates and out-of-order events. The usual difficulty is partial completion: some pages processed, some failed, some awaiting review.",
    k: ["Push webhooks vs polling: webhooks are timely and need public endpoints and retry handling; polling is simple for clients and wastes requests.", "Send the full result vs a link to fetch it: full results are convenient and large and expose data in transit; links keep data under access control."],
    p: ["A consumer endpoint is down for an hour, and unretried events leave documents permanently pending on its side.", "Retries deliver the same event twice and the consumer posts a duplicate record."],
    v: "Fail the consumer endpoint during processing, restore it, and confirm each document's event arrives at least once, is flagged as a repeat when resent, and shows delivery history.",
    dep: ["structured-json", "retry-idempotency", "access-privacy"]
  },
  "redaction": {
    s: "Permanently removes sensitive content from the output, both visible pixels and the underlying text and metadata, based on detected entities or rules.",
    d: "Candidates come from entity extraction, patterns and field definitions: identifiers, names, account numbers, faces and signatures. Redaction burns boxes into the page image, removes the corresponding words from the text layer and clears metadata and embedded copies. It must apply to every derived output. Recall matters most: a missed item is a disclosure. The failure that has caused real leaks is covering text with a shape while leaving the text itself in the file.",
    k: ["Automatic redaction with review vs fully automatic: review catches misses and costs labor; fully automatic is scalable and carries the risk of undetected leaks.", "Redact at output vs at ingestion: at ingestion no downstream system ever holds the original and removes data other stages needed."],
    p: ["A black rectangle is drawn over text that remains selectable in the file.", "A name is redacted on one page and left unredacted on another because of a recognition error."],
    v: "After redaction, extract all text, metadata and image layers from the output file with an independent tool, and confirm none of the protected strings appear anywhere.",
    dep: ["entity-extractor", "word-segmenter", "access-privacy"]
  },
  "search-indexing": {
    s: "Sends recognized text, fields and metadata to a search index, with confidence-aware handling so recognition errors do not hide documents.",
    d: "Documents are indexed by text, fields, type and dates, with word-level coordinates available for highlight. Because recognition has errors, indexes often add fuzzy matching, alternative candidates from the n-best list or character n-grams, so a misread letter does not make a word unfindable. Updates follow reprocessing and corrections, and access rules are carried into the index. The difficulty is keeping the index consistent when a document is reprocessed or corrected, and enforcing per-user permissions in results.",
    k: ["Index best text only vs include alternatives: best text is smaller and misses misread words; alternatives raise recall and produce noisier results.", "Index full text vs fields only: full text supports discovery and exposes more data; fields are precise and miss unstructured content."],
    p: ["A corrected value never reaches the index, and users keep finding the old wrong text.", "Permissions are applied at the document but not in snippets, which show text to users who cannot open the file."],
    v: "Search for a word that was misread by one character in the first pass; the document should still be found, and a user without access must see neither the hit nor the snippet.",
    dep: ["structured-json", "access-privacy", "text-export"]
  },
  "ground-truth": {
    s: "Carefully labeled reference sets, with correct text, boxes, structure and fields for real documents, against which every measurement is made.",
    d: "Truth is produced by transcription with double entry and adjudication, covers the real population of documents including hard cases, and records the labeling guidelines used. Separate sets serve for development, tuning and untouched final testing. Decisions about what counts as correct, such as whitespace, hyphenation, reading order and normalization, are written down, because they change scores. It is expensive to build and ages as the document population changes.",
    k: ["Large sampled set vs small curated hard set: a sampled set measures real performance; a hard set exposes weaknesses and overstates how often they occur.", "Strict guidelines vs reviewer judgment: strict rules make labels consistent and may not reflect what users want; judgment is flexible and varies between annotators."],
    p: ["Developers tune on the test set until the score is high and meaningless.", "Labels contain transcription errors that make a good model look worse than an old one."],
    v: "Have two annotators label a sample independently and compute their agreement; it sets the noise ceiling, and model scores near it cannot be distinguished.",
    dep: ["correction-capture", "double-keying"]
  },
  "cer-wer": {
    s: "Character and word error rates, the edit distance between recognized and true text divided by true length, the basic measure of recognition quality.",
    d: "Rates count substitutions, insertions and deletions after alignment. Choices change the numbers: case, punctuation, whitespace and Unicode normalization handling, and whether reading order errors count. Reported by slice, such as by font size, scan quality, script and document type, because averages hide failures. They measure transcription, not business value: a two-percent character error can destroy every amount field, or none.",
    k: ["Strict vs normalized comparison: strict counts every difference including harmless ones; normalized matches what users care about and can mask real problems.", "Corpus-level vs per-document average: corpus-level weighs long documents more; per-document average treats each equally and is noisy on short ones."],
    p: ["Errors in reading order are scored as massive insertion and deletion, hiding that the words were right.", "A headline score on easy documents is quoted for the whole product."],
    v: "Recompute the rate on a fixed sample with an independent implementation; the two figures must agree, and the report must list normalization settings and slice breakdown.",
    dep: ["ground-truth"]
  },
  "field-accuracy": {
    s: "The share of extracted fields that exactly match the truth after normalization, reported per field, with precision, recall and the cost of each error type.",
    d: "Each field is compared with the labeled value after canonicalization; results are split into correct, wrong, missing and spurious. Precision matters when wrong values are expensive; recall when missing ones are. Reported with confidence intervals per field and document type, and linked to automation rate through the threshold. A field-level view matches how customers judge the product and reveals problems character error rate hides.",
    k: ["Exact match vs tolerant match: exact match is clear and punishes harmless formatting; tolerant match reflects usable results and is arguable.", "Document-level vs field-level accuracy: document-level is what a customer experiences and is pulled down by one field; field-level tells developers where to work."],
    p: ["Averaging across fields hides one critical field that is much worse than the rest.", "Normalization in the metric differs from the normalization in the product, so reported accuracy does not match user experience."],
    v: "Produce a per-field table with precision, recall and count for a fresh batch, and verify that the biggest error contributors match the reviewers' own corrections.",
    dep: ["ground-truth", "field-normalizer"]
  },
  "table-metrics": {
    s: "Measures that score structure rather than words: table detection overlap, cell adjacency relations, tree-edit similarity of tables, and layout region and reading-order quality.",
    d: "Detection is scored by box overlap; structure by comparing cell adjacency or tree similarity to the truth, with content scored separately so errors can be located to structure or to recognition. Layout is scored by region overlap per type, and reading order by order-sensitive distance. Published benchmark metrics are convenient and may not match the target population. Metrics must separate structure from content, or a recognition error is blamed on the table model.",
    k: ["Structure-only metric vs structure plus content: structure-only isolates the table model; combined scores reflect the final result and mix two error sources.", "Public benchmark metrics vs own population metrics: public metrics allow comparison; own metrics reflect actual documents."],
    p: ["A table model improves on a public benchmark and degrades on real borderless tables.", "A single averaged table score hides that complex spanning headers always fail."],
    v: "Score tables by complexity class, and verify that structure scores agree with a manual look at a sample of the worst-scoring and best-scoring tables.",
    dep: ["ground-truth", "table-structure", "reading-order"]
  },
  "drift-monitor": {
    s: "Watches live inputs and outputs for changes in document mix, image quality, confidence distributions and corrections, to find degradation before customers do.",
    d: "Signals include the distribution of document types, quality scores, confidence, field fill rates, validation failure rates, review volume and correction rates. Comparisons against a baseline window use statistical distance and alert on shifts. Causes are mundane: a customer switches scanner, a supplier redesigns an invoice, a model update changes scores. Ground truth is not available in production, so monitoring relies on proxies and audit sampling for confirmation.",
    k: ["Monitor inputs vs outputs: input drift is early and may not hurt; output and correction drift is real and lags.", "Tight alert thresholds vs loose: tight catches problems quickly and makes noise; loose is quiet and finds problems late."],
    p: ["A new scanner at one customer lowers quality for weeks while the global average stays flat.", "Alert fatigue after several false alarms leads to ignored warnings."],
    v: "Replay a historical week with a known change, such as a template revision, and confirm the monitor raises an alert that names the affected customer and field within the expected delay.",
    dep: ["quality-scoring", "confidence-calibration", "audit-sampling"]
  },
  "regression-corpus": {
    s: "A frozen set of real and synthetic documents, including past failures, run on every change to catch quality drops before release.",
    d: "Every fixed bug and every escaped error adds a case. The suite runs through the full pipeline and compares output with expected results, reporting changes per document, field and metric. Changes to models, preprocessing, thresholds and templates all run against it. Failures need a policy: small shifts are allowed when the net effect is better, and certain cases are never allowed to regress. It must be kept fast enough to run routinely and be representative enough to matter.",
    k: ["Strict per-document pass-fail vs aggregate thresholds: pass-fail catches every change and blocks improvements with trade-offs; aggregates tolerate noise and let local regressions through.", "Real documents vs synthetic: real documents are representative and carry privacy burden; synthetic ones are safe and miss real degradation."],
    p: ["The corpus is never updated, so it grows irrelevant while the product changes.", "Private customer documents sit in the suite without consent or retention limits."],
    v: "Introduce a deliberate regression, such as a worse deskew angle, in a branch and confirm the suite fails and names the affected documents and fields.",
    dep: ["ground-truth", "correction-capture", "model-registry"]
  },
  "error-taxonomy": {
    s: "A structured classification of failures by stage and cause, such as detection miss, wrong order, structure error and bad normalization, used to direct engineering effort.",
    d: "Each error is traced through intermediate results to the first stage where output diverged from the truth, then labeled with a cause. Counts weighted by business cost show where improvement pays: often upstream issues such as missing regions or wrong orientation dominate, and recognition model changes would have little effect. It needs intermediate outputs to be saved and a repeatable way to inspect a document through every stage. It is manual work that yields the most useful decisions.",
    k: ["Manual error review vs automatic attribution: manual attribution is accurate and slow; automatic attribution scales and can mislabel interacting errors.", "Fine-grained causes vs coarse stages: fine causes point to precise fixes and demand more labeling; coarse stages are easy and vague."],
    p: ["Teams retrain the recognizer for months when most errors come from missed text regions.", "Intermediate artifacts are not kept, and errors cannot be traced to a stage after the fact."],
    v: "Sample fifty failed fields, trace each through saved stage outputs to its first wrong stage, and verify that two reviewers agree on the stage for most of them.",
    dep: ["field-accuracy", "cer-wer", "provenance-metadata"]
  },
});
