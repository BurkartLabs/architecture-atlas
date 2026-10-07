// Details for the data labeling plate, part 3: model-assisted labeling, task design, annotation interfaces.
ATLAS.details("data-labeling", {
  "pre-labeling-models": {
    s: "Models that produce draft labels for each item before a person sees it, so the person confirms or corrects instead of starting from nothing.",
    d: "A model trained on earlier labels, a general-purpose model or a rule system runs over new items and writes predictions into the annotation store as proposed labels with confidence. The interface shows them for correction. Items above a confidence threshold may skip humans, subject to audit. Gains are largest for dense tasks such as boxes and spans. The difficulty is that errors are not random: the model is wrong in consistent ways, and workers tire of fixing the same mistake or stop looking.",
    k: ["Show all predictions vs only confident ones: showing all speeds correction of mostly right items, and clutters the screen with wrong drafts that cost more to remove than to redraw.", "Auto-accept above a threshold vs always human-checked: auto-accept cuts cost sharply, and any systematic model error enters the data unseen."],
    p: ["Workers accept pre-labels without checking, and the dataset becomes a copy of the model's mistakes.", "A model retrained on its own accepted pre-labels amplifies its errors with each cycle."],
    v: "Label a gold-bearing batch with and without pre-labels, and confirm that time per item falls while accuracy on gold does not drop, and that accepted-without-edit items have a measured error rate from audit.",
    dep: ["annotation-store", "uncertainty-sampler", "automation-bias-guards", "annotation-ui-framework"]
  },
  "interactive-assist-tools": {
    s: "Tools inside the interface where a model reacts to a person's clicks, such as segmenting an object from a few points or snapping a box to its edges.",
    d: "The person gives a hint, such as a click inside an object, a rough stroke or a short phrase, and a model returns a mask, polygon or span proposal in real time. They accept it, refine it with more clicks or draw by hand. The model runs on a nearby service with cached image embeddings so each click is fast. It is hard because latency must stay below human tolerance, and because proposals are accepted at pixel level, small systematic boundary errors spread across the whole dataset.",
    k: ["Server-side inference vs in-browser inference: servers use bigger models and add network latency and cost, while in-browser is instant and limited by device power.", "Accept-or-redraw vs editable proposals: editable proposals give precise results, and take interface complexity and time to learn."],
    p: ["A slow response interrupts the rhythm of work, and workers abandon the tool for manual drawing.", "Model boundaries are slightly too loose in every mask, and the trained model inherits the offset."],
    v: "Time a worker on the same objects with and without the tool, and confirm that median time per object falls, that response latency stays under its stated limit, and that masks match expert masks within the agreed overlap.",
    dep: ["annotation-ui-framework", "image-region-tools", "pre-labeling-models"]
  },
  "uncertainty-sampler": {
    s: "Selects items the current model is least sure about, so labeling effort goes to the examples most likely to improve it.",
    d: "The sampler scores unlabeled items by model uncertainty, such as the entropy of predicted class probabilities, the margin between top classes, or disagreement among an ensemble. It takes the highest-scoring items in batches and releases them to the queue with a higher priority. The loop repeats after each retraining. It is hard because uncertainty also marks junk, ambiguous and mislabeled items, because batches of similar uncertain items are redundant, and because the model's own calibration is often poor.",
    k: ["Uncertainty sampling vs random sampling: uncertainty reaches target accuracy with fewer labels, and produces a biased dataset that misrepresents the real distribution.", "Single model score vs ensemble disagreement: ensembles give better uncertainty estimates and cost several models per pass."],
    p: ["The selected batch is full of near-duplicate hard examples, and labeling it adds little.", "A badly calibrated model is confidently wrong on a whole region of data that is never selected."],
    v: "Run a simulation on a fully labeled dataset, comparing models trained on equal numbers of labels chosen by the sampler and at random, and confirm the sampler's curve reaches a given accuracy with fewer labels.",
    dep: ["pre-labeling-models", "metadata-index", "queue-manager", "diversity-sampler"]
  },
  "diversity-sampler": {
    s: "Chooses items so the labeled set covers the data's variety, by clustering embeddings or coverage of features, rather than repeating what is already well represented.",
    d: "Items are embedded with a model, grouped by clustering or nearest-neighbor coverage, and chosen to spread across clusters and to include rare ones. It runs alone to build a first labeled set with no model, or combines with uncertainty scores so batches are both informative and varied. It also supports balancing underrepresented slices such as rare conditions or minority groups. It is hard because the embedding defines similarity, and a poor embedding makes the notion of diversity meaningless.",
    k: ["Embedding-based diversity vs metadata-based stratification: embeddings find unnamed variety, and stratification is explainable and only covers what has been named.", "Diversity first, uncertainty later vs combined scoring: staged selection is simple to reason about, and combined scoring uses labeling budget better but is harder to tune."],
    p: ["The embedding clusters by image background rather than by the object that matters, and the sample is diverse in the wrong way.", "Rare clusters are mostly corrupted or irrelevant data, and the sampler spends budget on junk."],
    v: "Run the sampler on a dataset with known rare subgroups, and confirm that each subgroup appears in the sample at or above its stated floor and that cluster coverage exceeds that of a random sample of the same size.",
    dep: ["metadata-index", "data-selection-filters", "queue-manager"]
  },
  "weak-supervision-functions": {
    s: "Programmatic labeling rules, patterns and heuristics that label items cheaply and noisily, with a model that combines their outputs into probabilistic labels.",
    d: "Experts write small functions, such as keyword matches, regular expressions, lookups in databases and rules over metadata, each of which labels some items or abstains. A label model estimates each function's accuracy and correlations from agreements and conflicts, and outputs a combined probabilistic label for every item. These labels train a model directly or seed human review. It is hard because function outputs are correlated, coverage is uneven and the estimated accuracies are only as good as a small validated set.",
    k: ["Many noisy functions combined statistically vs few careful rules: many functions scale and cover more, and need a label model and a trusted dev set to avoid compounding errors.", "Training on weak labels directly vs using them as pre-labels for humans: direct training is free, and review catches systematic rule errors at human cost."],
    p: ["Two functions share one underlying pattern and are counted as independent evidence.", "Functions tuned against the dev set pass its evaluation and fail on the real distribution."],
    v: "Apply the functions to a set with expert labels, and confirm that the combined label's accuracy and coverage reported by the platform match a direct comparison, and that each function's estimated accuracy is within tolerance.",
    dep: ["annotation-store", "label-aggregation-models", "metadata-index"]
  },
  "llm-as-labeler": {
    s: "Using a large language or multimodal model to produce labels from prompts and examples, either as a pre-labeler, an extra judge in consensus, or a reviewer.",
    d: "Prompts hold the guideline, labeled examples and the item, and request a label with a rationale. Outputs are parsed into the ontology, validated, and stored with the model and prompt versions. The model's judgments can be one more vote in aggregation, a draft for humans, or a cheap first pass whose agreement with experts is monitored. It is hard because outputs vary with wording and version, costs scale with volume, model behavior changes without notice, and errors correlate with the model's training data.",
    k: ["Model as one vote among humans vs as replacement: as a vote it adds cheap signal under human oversight, and as replacement it saves the most and has no independent check.", "Prompt with the full guideline vs a short instruction: the full guideline raises agreement with experts, and adds token cost and sensitivity to wording."],
    p: ["The provider updates the model, labels shift overnight, and nothing in the dataset records which model made them.", "The model's rationales sound plausible for wrong labels and persuade reviewers."],
    v: "Run the labeler on gold items under a pinned model version and prompt, and confirm accuracy matches the last accepted evaluation, that every label stores the model and prompt version, and that parse failures are counted rather than dropped.",
    dep: ["instruction-guidelines", "example-libraries", "gold-questions", "annotation-store"]
  },
  "assist-feedback-loop": {
    s: "The path that returns human corrections of model suggestions to the model's training data, so suggestions improve as people correct them.",
    d: "Every acceptance, edit and rejection of a suggestion is stored with the original prediction and the final label. Periodically these corrections join the training set, or a measured subset such as only audited items does. Metrics such as the share of suggestions accepted unchanged and the edit distance to the final label show whether the model is improving. It is hard because acceptance without review is not confirmation, and because training on accepted suggestions leaks the model's errors back into its own data.",
    k: ["Training on audited corrections only vs on all accepted labels: audited data is trustworthy and slower to accumulate, while all labels give volume and feed back errors.", "Continuous retraining vs scheduled retraining: continuous adapts fast and complicates evaluation, while scheduled versions give reproducible comparisons."],
    p: ["The acceptance rate climbs because workers rubber-stamp suggestions, and is read as the model improving.", "Corrections made under an old guideline are fed into training after the guideline changed."],
    v: "Track a model's accepted-unchanged share and its accuracy on a held-out gold set across three retraining cycles, and confirm the gold accuracy rises in step with, or ahead of, the acceptance rate.",
    dep: ["pre-labeling-models", "annotation-history", "retraining-trigger", "automation-bias-guards"]
  },
  "automation-bias-guards": {
    s: "Controls that keep workers from simply accepting machine suggestions: hidden suggestions on some items, planted wrong suggestions, and audits of unedited acceptances.",
    d: "People anchor on a suggestion and edit less than they should. The platform measures this by serving some items without suggestions, by occasionally showing an incorrect suggestion with a known truth, and by sampling items accepted unchanged for expert review. The measured rate of missed errors is reported per worker and per model. These checks feed training and pay: workers who catch planted errors are rewarded. The cost is that the checks spend real effort and slightly lower the apparent speed gain.",
    k: ["Blind items and planted errors vs trusting worker diligence: planted errors give a measured miss rate, and cost labeling effort and require known-wrong suggestions.", "Penalizing missed planted errors vs only reporting them: penalties change behavior fast and can punish workers for tool design problems."],
    p: ["Planted wrong suggestions are recognizable by style, and workers learn to spot the plant instead of checking.", "The miss rate is never measured, and the model's confidence alone decides which suggestions skip review."],
    v: "Serve a set of planted wrong suggestions mixed into normal work, and confirm that the platform reports each worker's catch rate with an interval and that the sample audit of unedited acceptances found no more errors than the catch rate predicts.",
    dep: ["pre-labeling-models", "gold-injection", "expert-review"]
  },
  "retraining-trigger": {
    s: "The rule that decides when the assist model is retrained and promoted, based on new labeled volume, measured drift or a drop in acceptance and accuracy.",
    d: "Triggers watch for enough new reviewed labels, a change in the data distribution, or a decline in the model's accuracy on a held-out gold set. When triggered, the platform requests a training job from the training platform with a named dataset version, compares the candidate with the current model on gold and fresh audits, and promotes it only if it is better. It is hard because evaluation sets leak, because retraining changes suggestions mid-project and shifts worker behavior, and because every promotion must be reversible.",
    k: ["Volume-based vs drift-based triggers: volume is predictable and wasteful when data is unchanged, while drift triggers retrain exactly when needed and depend on a reliable drift signal.", "Automatic promotion vs human sign-off: automatic is fast and can promote a model that games the metric, and sign-off adds a day to every cycle."],
    p: ["The evaluation set is built from items the model helped label, and measured improvement is partly circular.", "A promoted model changes suggestion style, and agreement metrics break at the same time."],
    v: "Trigger a retraining on a test project, then confirm the candidate is evaluated on a held-out gold set and fresh audit items, that a worse candidate is rejected, and that promotion and rollback are both recorded with model versions.",
    dep: ["training-platform-handoff", "dataset-versions", "accuracy-against-gold", "workflow-engine"]
  },
  "ontology-schema": {
    s: "The formal definition of what can be labeled: classes, attributes, relations and allowed values, with the rules about which combinations are valid.",
    d: "The ontology lists classes with ids, names and definitions, attributes such as occluded or truncated, relations between objects, and constraints like mutually exclusive classes, required attributes and hierarchy. Interfaces are generated from it, validation checks submissions against it, and exports carry it. It is hard because it must be stable enough for large datasets and flexible enough as the product changes: splitting or merging a class later means relabeling, and the hierarchy decides how errors are counted.",
    k: ["Flat classes vs a hierarchy: flat is simple to label and measure, while a hierarchy lets coarse labels be reliable and fine ones optional at the cost of validation complexity.", "Many fine classes vs few coarse ones: fine classes keep options open and lower agreement and increase cost, while coarse classes are cheap and cannot be refined without relabeling."],
    p: ["Two classes overlap in definition, and workers pick between them by habit.", "The ontology is changed in place, and old annotations now refer to classes that mean something else."],
    v: "Submit annotations that violate each constraint, such as two exclusive classes on one object, and confirm each is rejected with the rule named. Generate the interface from the ontology and confirm every class and attribute appears.",
    dep: ["taxonomy-versioning"]
  },
  "taxonomy-versioning": {
    s: "Versioning of the ontology so every annotation records the version it was made under, with explicit mappings when classes are split, merged or renamed.",
    d: "Each change to the ontology creates a new version with a changelog. Annotations store the version they were made under. A mapping describes how old classes translate to new ones: one to one, merge, or split, where a split needs human relabeling or a rule on attributes. Datasets built across versions apply mappings explicitly. It is hard because a split cannot be mapped automatically, and because old and new labels must not be mixed unknowingly in one training set.",
    k: ["Immutable versions with explicit mappings vs in-place edits: versions keep every dataset interpretable, and require migration work with each change.", "Relabel after a split vs infer by rule: relabeling is accurate and expensive, while rules are cheap and wrong on cases the rule did not foresee."],
    p: ["A merge is applied to the live ontology, and last month's exports no longer match their documented classes.", "A split is mapped to the larger child class by default, and the minority class vanishes."],
    v: "Split one class into two on a test project, and confirm old annotations keep their original version, that a mapped export marks split-class items as needing review, and that no item is silently assigned.",
    dep: ["ontology-schema", "annotation-history"]
  },
  "instruction-guidelines": {
    s: "The written instructions workers follow: what each class means, how to choose between close ones, what to skip, with decision rules and worked examples.",
    d: "Guidelines are long documents kept versioned and linked from every task. They state the purpose of the data, define each class with positive and negative examples, give decision rules for borderline cases, and say what to do with unusable items. Good guidelines are tested in pilots and revised from disagreement data. They are hard because length trades against compliance: workers read the first page and skim the rest, and every added rule creates new interactions to specify.",
    k: ["Long comprehensive guidelines vs short rules plus examples: long documents cover more and are read less, while short ones are followed and leave gaps that workers fill by guessing.", "One guideline for all workers vs tiered guidance: one guideline is consistent, and tiered guidance gives experts nuance that novices misapply."],
    p: ["A rule is added to the guideline and is never announced, and half the workers use the old version.", "Guidelines describe the ideal but not the ugly cases that make up the real data."],
    v: "Give new workers the guideline and a qualification set, and confirm pass rates, then check that each rule cited in an adjudication links to a guideline version and that every worker's task shows the current version.",
    dep: ["ontology-schema", "example-libraries", "edge-case-rulebook"]
  },
  "example-libraries": {
    s: "Curated labeled examples, good and bad, attached to each class and shown to workers inside the guidelines and the interface at the moment of decision.",
    d: "An example library holds items with correct labels, annotated explanations and counterexamples such as near misses. Examples come from pilots, adjudications and expert review, and are tagged with class, difficulty and guideline version. The interface can show relevant ones beside the task. Libraries double as raw material for qualification tests and gold. It is hard to keep them current and representative: examples get stale as guidelines change, and a few vivid cases mislead workers about what is typical.",
    k: ["Typical examples vs boundary examples: typical ones build a core picture quickly, and boundary examples teach distinctions and confuse novices.", "Static library vs examples retrieved for each task: retrieved examples are relevant to the item, and need similarity search and curation."],
    p: ["An example from the old guideline version is still shown and contradicts the current rule.", "Examples are copied from one batch and miss the lighting, accents or formats of later data."],
    v: "Check that every class has examples of each type, that every example carries a guideline version matching the current one or is flagged stale, and that the interface shows relevant examples on a sample task.",
    dep: ["ontology-schema", "taxonomy-versioning", "annotation-store"]
  },
  "edge-case-rulebook": {
    s: "A running record of rulings on hard cases from adjudication and expert review, which become guideline additions and gold items.",
    d: "When an adjudicator or expert settles a disagreement that the guidelines did not cover, the platform records the item, the ruling and the reason in a searchable rulebook. Entries are periodically reviewed and merged into the guidelines, and the best become gold or qualification items. Workers can search it from the task. It is hard because rulings must be generalized without becoming contradictory, and because the rulebook that nobody reads is as good as no rulebook.",
    k: ["Rulings stored as cases vs rewritten into general rules: cases are precise and numerous, while rules are short and lose the detail that made each case hard.", "Open to all workers vs restricted to reviewers: open access raises consistency, and exposes gold-like items and invites rule lawyering."],
    p: ["Two rulings made a month apart contradict each other, and both are in force.", "Rulings live in chat messages and never reach the guideline."],
    v: "Resolve a new edge case, and confirm that it enters the rulebook with its reason, appears in worker search, is linked from the guideline revision that incorporates it, and that conflicting rulings are flagged.",
    dep: ["adjudication-queue", "instruction-guidelines", "taxonomy-versioning"]
  },
  "task-templates": {
    s: "Reusable definitions of a task's interface, inputs, outputs, validation and consensus rule, from which new projects are created without custom code.",
    d: "A template says which data type is shown, which tools are enabled, which fields are required, how outputs are validated and how judgments are combined. Projects pick a template and bind it to an ontology and a dataset. Templates are versioned so a change does not silently alter running projects. It is hard to make them flexible without becoming a programming language: every added option is another path to test, and organizations always want one more.",
    k: ["Declarative configuration vs custom code per project: configuration is fast to deploy and safe, and custom code handles unusual tasks at the cost of maintenance.", "Few strict templates vs many options: strict templates keep quality predictable, and options let teams fit unusual data."],
    p: ["A template is edited while a project is running, and workers in mid-task submit outputs the new validation rejects.", "Teams copy a template and modify it, and soon a dozen versions differ in unknown ways."],
    v: "Create a project from a template with only configuration, run a pilot batch, and confirm outputs validate against the ontology, the consensus rule runs, and a later template change does not affect the running project.",
    dep: ["ontology-schema", "annotation-ui-framework", "consensus-rules"]
  },
  "task-decomposition": {
    s: "Splitting a complex annotation job into simpler steps, such as detect then classify then describe, each with its own interface, workers and quality check.",
    d: "A single hard task, such as marking every object with attributes in a crowded scene, is split into stages: find objects, review the finds, then label attributes per object. Each stage has an interface and a reliability profile, and the output of one is the input of the next. Decomposition improves accuracy and lets work be routed by skill. It is hard because stages add overhead and handoffs, and because a mistake in an early stage, such as a missed object, cannot be fixed later.",
    k: ["Many simple stages vs one rich task: simple stages are easier to train and verify and add handoff cost, while a rich task keeps context in one head.", "Verifying each stage vs only the final output: stage checks stop errors early and cost more review."],
    p: ["Objects missed in the first stage are never labeled, and no later stage can recover them.", "Stages are tuned separately and the pipeline's total cost is never measured."],
    v: "Run a multi-stage pipeline on a set with known objects and attributes, confirming each stage's output reaches the next, missed objects are counted at the first stage, and end-to-end accuracy and cost are reported.",
    dep: ["task-templates", "workflow-engine", "queue-manager"]
  },
  "pilot-rounds": {
    s: "Small trial batches labeled before a project starts at scale, to measure agreement, time per item and guideline gaps while changes are still cheap.",
    d: "A pilot sends a few hundred items to a few trusted workers and experts, then examines disagreement, questions, time and the labels' fit with the intended use of the data. Findings revise the ontology, guidelines and interface, and the pilot repeats until agreement and quality are acceptable. Pilot results also set rates and the cost estimate. It is hard to resist skipping: pilots look like delay, and the problems they find are the ones that would otherwise be found after a million labels.",
    k: ["Several short pilots vs one long pilot: short rounds iterate guidelines quickly, and each has less data to support conclusions.", "Pilot workers drawn from the production pool vs trusted experts: the production pool shows realistic difficulty, and experts show whether the task is possible."],
    p: ["Pilot items are the easy ones, so measured speed and agreement are too optimistic for the production data.", "Pilot findings are discussed but never written into the guidelines."],
    v: "Check that the pilot report states agreement by class, time per item, questions raised and guideline changes made, that the final guideline version cites the pilot, and that production cost per item is within a stated range of the estimate.",
    dep: ["instruction-guidelines", "inter-annotator-agreement", "disagreement-analysis", "task-templates"]
  },
  "annotation-ui-framework": {
    s: "The browser-based application shell that hosts every annotation tool: loading tasks, rendering assets, managing tool state, validating and submitting outputs.",
    d: "The framework fetches a task and its assets, renders the tool matching the data type, keeps in-progress work in local state with undo, validates against the ontology, autosaves drafts and submits. It exposes a plug-in interface so tools for new data types share navigation, hotkeys, telemetry and layout. It is hard because it is performance-critical on modest hardware, must not lose work through network drops, and has to render large assets, such as high-resolution images and long audio, smoothly.",
    k: ["Single generic framework with plug-in tools vs separate applications per data type: shared infrastructure gives consistency, while separate apps allow deeper optimization per type.", "Local-first drafts with sync vs server-saved on every action: local-first survives network loss, and drafts can diverge from the server."],
    p: ["A network drop discards forty minutes of work because drafts were only in memory.", "A heavy tool freezes older machines and workers lose their rate."],
    v: "Complete tasks while the network is cut midway and restored, confirming that no work is lost, drafts sync once, the submitted output validates, and the interface remains responsive on the lowest supported device.",
    dep: ["ontology-schema", "signed-url-access", "api-and-sdk"]
  },
  "image-region-tools": {
    s: "Interface tools for marking regions in images: boxes, polygons, brushes, keypoints and lines, with zoom, editing and attribute entry.",
    d: "Workers draw shapes over an image with pan and zoom, edit vertices, assign classes and attributes, and group shapes into objects. Tools snap to edges, copy shapes between frames, and show model suggestions as editable overlays. Output is stored in the platform's geometry model. It is hard because precision, speed and ergonomics pull apart: pixel accuracy at high zoom is slow, scenes with hundreds of overlapping objects overwhelm the screen, and the choice of tool, such as box versus polygon, decides the data's quality ceiling.",
    k: ["Boxes vs polygons or masks: boxes are fast and coarse, while masks are precise at several times the effort.", "Draw from scratch vs edit suggestions: editing is faster when suggestions are good, and trains workers to accept what is on screen."],
    p: ["Boxes drawn with a consistent gap around each object teach the model a systematically oversized target.", "Hundreds of overlapping shapes make selecting the right one a slow, error-prone task."],
    v: "Have workers mark a reference image set with known masks and boxes and confirm that overlap with the reference meets the stated threshold, that median time per object matches the pilot, and that edits to shapes persist exactly.",
    dep: ["annotation-ui-framework", "ontology-schema", "interactive-assist-tools"]
  },
  "text-span-tools": {
    s: "Interface tools for marking spans of text with entity types, relations and attributes, with correct handling of offsets, overlapping spans and multiple scripts.",
    d: "Workers select text and assign a class, link spans into relations, and mark document-level labels. The tool maps selection to character offsets in a normalized text version and stores them with the text hash. It handles right-to-left scripts, combining characters and tokenization boundaries. It is hard because offsets break on any change to the text, because the selection model of browsers differs from the data model, and because long documents need virtualized rendering without losing context.",
    k: ["Character offsets vs token boundaries: characters keep exact positions, and tokens give clean boundaries and tie labels to one tokenizer.", "Overlapping spans allowed vs flat spans only: overlaps express nested entities and complicate agreement and training formats."],
    p: ["The source text is re-normalized after labeling, and every stored offset shifts.", "A selection includes a trailing space or half of a combined character, and the exported span is malformed."],
    v: "Label spans in text containing emoji, combining marks and right-to-left words, export, and confirm that each exported offset recovers exactly the text the worker selected using an independent reader.",
    dep: ["annotation-ui-framework", "ontology-schema", "export-formats"]
  },
  "audio-video-timeline": {
    s: "Interface tools for labeling time-based media: waveform and frame timelines, segments, transcript alignment, speaker turns and object tracks across frames.",
    d: "Workers scrub a timeline, mark segments, edit transcripts with time alignment and follow objects across frames, with interpolation between keyframes. The tool streams media in small chunks and keeps frame-accurate seeking. Playback speed controls and looped segments help. It is hard because media is large, seeking must be exact, and interpolating between keyframes hides drift: an object track that looks right at keyframes may be wrong between them.",
    k: ["Keyframes with interpolation vs per-frame labeling: interpolation cuts effort by an order of magnitude and risks error between keyframes, while per-frame labeling is accurate and very costly.", "Streaming proxies vs full-quality media: proxies load fast and may hide the detail needed to decide."],
    p: ["Frame numbers disagree between the player and the export because of variable frame rates, and every label is offset.", "Interpolated boxes drift off a fast object between keyframes and go unreviewed."],
    v: "Label a clip with known frame-accurate events, export, and confirm that the exported times match the reference to the frame, including a variable-frame-rate clip, and that interpolated tracks are checked at midpoints.",
    dep: ["annotation-ui-framework", "preprocessing-and-proxies", "ontology-schema"]
  },
  "point-cloud-tools": {
    s: "Interface tools for labeling three-dimensional data such as lidar point clouds and meshes: cuboids, segmentation and tracking across scans, with synchronized camera views.",
    d: "Workers view points from several angles, draw oriented cuboids, assign points to classes and track objects across a sequence, usually next to the matching camera images. The tool renders millions of points with level-of-detail and uses ground-plane assistance and model suggestions. It is hard because depth perception on a flat screen is difficult, calibration between sensors must be exact for camera views to line up, and labeling is slow and expensive per frame.",
    k: ["Cuboids vs point-level segmentation: cuboids are fast and approximate, while point labels are precise and many times costlier.", "Labeling each scan vs tracking with interpolation: tracking saves effort and relies on motion assumptions that fail when objects turn or stop."],
    p: ["Calibration is stale, and the cuboid that fits in the point view floats off the object in the camera image.", "Sparse far-away points make cuboid size ambiguous and every worker picks a different one."],
    v: "Label a sequence with known reference cuboids, and confirm that the overlap, orientation and position errors meet the stated tolerances, and that projecting each cuboid into the camera image lands on the object.",
    dep: ["annotation-ui-framework", "preprocessing-and-proxies", "ontology-schema"]
  },
  "document-layout-tools": {
    s: "Interface tools for labeling scanned documents and forms: regions, reading order, field values, tables and links between text and boxes.",
    d: "Workers mark layout regions on a page image, assign types such as heading or table, order them for reading, and transcribe or correct text in them. For forms they link a field label to its value. Tables need cell structure, with spans over rows and columns. The tool overlays recognition output for correction. It is hard because documents vary enormously, tables have many valid structures, and the ground truth often depends on reading order and context across pages.",
    k: ["Correct recognition output vs transcribe from scratch: correction is faster and inherits recognizer errors, while transcription is independent and slow.", "Cell-level table structure vs text-only tables: cell structure supports training table models and costs much more per table."],
    p: ["Multi-page tables are labeled per page, and the relation between pages is lost.", "Corrected text keeps the recognizer's reading order, which is wrong for multi-column pages."],
    v: "Label a sample of varied forms and tables with known structure, export, and confirm that cell counts, spans, field links and reading order match the reference, and that corrected text equals an independent transcription.",
    dep: ["annotation-ui-framework", "pre-labeling-models", "ontology-schema"]
  },
  "ranking-and-comparison-ui": {
    s: "Interfaces for collecting preferences: choose the better of two outputs, rank several, rate on a scale and explain why, mainly for training and evaluating generative models.",
    d: "Workers see a prompt and two or more responses, and choose or rank them against criteria such as helpfulness, accuracy and safety, sometimes giving a rating per criterion and a short rationale. The tool randomizes position, hides which system produced each response and supports side-by-side comparison of long outputs. It is hard because preferences are subjective, because position and length bias are strong, and because the quality of a comparison depends on the worker's ability to verify the content.",
    k: ["Pairwise choice vs full ranking: pairs are simple and reliable, and rankings give more information per item with more cognitive load.", "Scalar ratings vs comparisons: ratings are easy to collect and differ in scale between workers, while comparisons are consistent and need more items."],
    p: ["Workers prefer the longer or first-shown response regardless of quality, and the preference data teaches verbosity.", "Workers cannot verify factual claims in the responses and choose by style."],
    v: "Present identical response pairs in both orders and confirm that the choice is stable beyond a stated rate, that length bias on a controlled set is within bounds, and that the platform stores the order shown.",
    dep: ["annotation-ui-framework", "task-templates", "gold-questions"]
  },
  "form-and-free-text-fields": {
    s: "Structured fields beside the main tool for attributes, yes-no questions, selections and short written answers, with validation that keeps outputs machine-readable.",
    d: "Many tasks ask more than a region or span: whether the image is usable, what the language is, how confident the worker is, and why. Fields are defined in the template with types, options, conditional visibility and limits. Free text is checked for length and basic quality. It is hard because every extra field costs time and attention, and because free-text answers are expensive to aggregate and review, so they are used only where structure fails.",
    k: ["Closed options vs free text: closed options aggregate and validate easily and constrain what workers can say, while free text captures the unexpected and has to be read.", "Required fields vs optional: required fields guarantee completeness, and push hurried workers to guess an answer."],
    p: ["A required field with no valid answer for an item makes workers pick arbitrarily instead of skipping.", "Free-text boxes fill with filler text to meet length rules."],
    v: "Submit tasks with missing, invalid and conditional fields, and confirm each rule is enforced with a clear message, that valid outputs are stored in the stated types, and that skip reasons are captured.",
    dep: ["annotation-ui-framework", "ontology-schema", "task-templates"]
  },
  "shortcuts-and-ergonomics": {
    s: "Keyboard shortcuts, default positions, auto-advance and layout choices that reduce clicks and strain, tuned from observed behavior of experienced workers.",
    d: "Fast labelers rarely use the mouse for classes: hotkeys choose classes, move between items and submit. Defaults reduce movement, and the layout keeps the item large and the controls near. Settings are saved per worker. Ergonomics are measured with telemetry on time per action and error rates. It is hard because shortcuts speed up expert users and are hard to discover, and because a speed gain that increases accidental submissions is a loss.",
    k: ["Aggressive auto-advance vs explicit submit: auto-advance saves a click per item and risks submitting by mistake, while explicit submit is slower and safer.", "Customizable shortcuts vs a single fixed set: customization fits individuals and makes help and support harder."],
    p: ["A hotkey for a class sits beside the one for skip, and mistyped keys silently skip paid items.", "Interfaces tuned for experts overwhelm new workers who then give up."],
    v: "Observe experienced and new workers on the same tasks, and confirm that median time per item falls with the shortcut layout without a rise in accidental-submission or undo rates.",
    dep: ["annotation-ui-framework", "interaction-telemetry"]
  },
  "interaction-telemetry": {
    s: "Recording of what workers do inside the interface: events, timings, edits and tool use, used to measure effort, find usability problems and detect low-effort work.",
    d: "The interface emits events for task open, tool selection, shape edits, hotkeys, zoom and submit, batched and sent to a collector with the task and worker ids. Derived metrics include active time, edits per item, undo rate and zoom use. Patterns such as submitting instantly or never zooming flag low effort. It is hard because it can be intrusive, so collection must be minimal, disclosed and limited to the work, and because noisy signals produce false accusations of workers.",
    k: ["Fine-grained event streams vs summary metrics: events allow replay and new analyses, and cost storage and privacy care, while summaries are cheap and answer only planned questions.", "Using telemetry to flag workers vs to improve tools only: flagging catches cheating and risks unfair judgments from noisy signals."],
    p: ["A fast, accurate expert is flagged for low effort because they rarely zoom.", "Telemetry captures content-bearing text and creates a privacy problem on its own."],
    v: "Replay a recorded session from its events and confirm that it reproduces the submitted output, and that the derived active time and edit counts match a manual count of the recording.",
    dep: ["annotation-ui-framework", "observability"]
  }
});
