// Details for the vision pipeline plate, part 5: privacy and governance, annotation and retraining loop.
ATLAS.details("vision-pipeline", {
  "redaction-and-blurring": {
    s: "Obscures faces, plates, screens or whole regions in stored and transmitted images, so that review and training can proceed without exposing identities.",
    d: "A detector finds the sensitive regions, then blur, pixelation or solid masks are applied before the frame leaves the trusted boundary. Static privacy masks exclude fixed areas such as a neighboring window from processing entirely. Redaction must run on the evidence clips, the snapshots and the frames sampled for training. It is only as good as its recall: a missed face is a disclosure, so thresholds favor over-redaction, and the redacted copy is what gets shared while the original follows stricter retention.",
    k: ["Redact at the source vs redact before sharing: at the source means identifiable data never leaves the device; redacting later keeps full evidence available locally.", "Blur vs solid mask: blur looks natural and may be partly reversible at low strength; solid masks are irreversible and obvious.", "High recall with over-blurring vs balanced: over-blurring protects people and hides useful context."],
    p: ["A face turned away or small in the frame is missed and appears unredacted in a training set.", "Blur is applied to the displayed clip but not to the stored original that is exported."],
    v: "Run redaction over a labeled set of faces and plates at varied sizes and angles and confirm the miss rate is below the policy limit, then inspect exported files to confirm no unredacted copy exists.",
    dep: ["object-detection", "access-control-and-audit"]
  },
  "on-device-processing": {
    s: "Keeping raw video on the device and sending only derived data such as counts and events, as a structural guarantee that images are not exposed.",
    d: "The device decodes, infers and discards frames, retaining only what policy allows: metadata, event clips on trigger, and nothing else. This reduces both bandwidth and the damage of any cloud breach. It forces the system to carry its capabilities in the device, including model updates, and makes debugging harder, because failures cannot be reviewed from stored video. Where review is needed, the device can release a clip only on explicit request under audit.",
    k: ["On-device only vs cloud processing of video: on-device protects privacy and needs capable hardware; the cloud gives power and exposes streams.", "Release clips on request vs never: on request enables review under control; never is the strongest guarantee and prevents debugging.", "Store nothing vs short rolling buffer: nothing is simplest to defend; a short buffer enables evidence and is a liability."],
    p: ["A debug mode that dumps frames is left enabled in production and quietly stores video.", "Crash dumps include memory with recent frames and are uploaded for analysis."],
    v: "Capture traffic and storage on a production device over a day: only derived data and triggered clips leave the device, and a memory dump inspection finds no retained frames beyond the documented buffer.",
    dep: ["pre-event-ring-buffer", "edge-cloud-split-of-events"]
  },
  "retention-and-deletion": {
    s: "The policy and mechanism that keep video, clips and metadata only as long as justified, and delete them reliably everywhere they have been copied.",
    d: "Each data class, such as raw video, event clips, snapshots, embeddings and counts, has a retention period set by law and purpose. Deletion runs on schedule on devices and in the cloud, including backups, caches and derived datasets. Deleting means finding every copy: training sets built from clips, thumbnails, search indexes. A deletion request for a person needs a way to find that person's data. Lineage metadata makes completeness checkable.",
    k: ["Time-based deletion vs event-based deletion: time-based is simple and auditable; event-based keeps important evidence and needs flags and review.", "Delete derived data with the source vs keep it: deleting is cleaner; derived datasets such as training sets are costly to rebuild.", "Hard delete vs mark and sweep: hard delete is immediate; mark-and-sweep allows recovery from mistakes and delays real removal."],
    p: ["Clips copied into a labeling tool outlive the retention period since the tool has its own storage.", "A retention job fails silently for a month and the backlog is never noticed."],
    v: "Create test data of every class, advance time past retention, and verify through search of all stores and backups that every copy is gone and that the deletion job emitted a completion record.",
    dep: ["dataset-versioning", "evidence-clips-and-snapshots"]
  },
  "access-control-and-audit": {
    s: "Controls who can view streams, clips and results, and records every access, so misuse is both preventable and detectable.",
    d: "Roles grant access by site, camera and data class; viewing raw video is a stronger permission than viewing counts. Access to clips is time-limited and requires a stated reason for sensitive cameras. Every view, export and configuration change is written to an append-only audit log that people other than operators can review. Service credentials on devices are scoped and rotated. The hard part is usability: overly strict controls push people to share links and screenshots.",
    k: ["Role-based access vs per-camera grants: roles are manageable; per-camera grants are precise and become hard to audit.", "Reason required for viewing vs open access: reasons deter curiosity and slow legitimate work; open access is fast and invites abuse.", "Central audit log vs per-device logs: central is complete and needs reliable delivery; per-device survives disconnects and is hard to review."],
    p: ["Long-lived shared links to clips are posted in a chat and remain valid indefinitely.", "Audit logs are writable by the same administrators whose actions they record."],
    v: "As a restricted user attempt to open a raw stream, an export and a clip outside your sites; each must be denied, and an authorized access must appear in the audit log within a minute with user, object and reason.",
    dep: ["event-schema"]
  },
  "consent-and-notices": {
    s: "Notifying people that cameras and analysis are in use, and recording the legal basis and consent where it is required.",
    d: "Signage, privacy notices and documented purposes tell people that analytics are running and what is collected. Some jurisdictions require consent, impact assessments or a legal basis per purpose, and prohibit certain uses such as identification from faces. The system should record, per camera, its purpose and basis, and refuse to enable analyses outside the declared purpose. Opt-out and data subject requests need working paths into the data stores.",
    k: ["Purpose-limited configuration vs general-purpose platform: purpose limits keep use within policy and constrain reuse; a general platform is flexible and easy to misuse.", "Signage only vs signage plus on-device indicator: signage is cheap; an indicator is visible at the moment of use.", "Per-site legal review vs a standard policy: per-site fits local law and is slow; standard is quick and sometimes wrong."],
    p: ["A camera installed for safety is later used for marketing analytics outside its declared purpose.", "Signage is removed during renovation and not replaced."],
    v: "Audit each active analysis against the camera's recorded purpose and basis; any analysis without a matching record must be flagged, and enabling one outside purpose must require explicit sign-off.",
    dep: ["access-control-and-audit"]
  },
  "anonymized-metadata": {
    s: "Designing outputs so that they describe activity without identifying individuals: counts, flows and aggregates rather than identities and appearance.",
    d: "Metadata can still identify: a stored embedding, an exact timestamp with a position or a rare attribute can single out a person. Anonymization aggregates over time and space, removes or rotates identifiers, coarsens timestamps and suppresses small groups. Embeddings used for within-visit tracking are discarded at the end of a visit. The test is whether someone with outside knowledge could link the data to a person, which is a design review and not a property a script can certify.",
    k: ["Aggregate on the device vs aggregate in the cloud: on the device keeps individual data local; in the cloud allows flexible later analysis and exposes more.", "Rotating identifiers vs stable identifiers: rotating limits long-term tracking and breaks repeat-visitor analysis.", "Small-group suppression vs reporting everything: suppression prevents singling out and loses detail in quiet periods."],
    p: ["A single person at three in the morning makes a count of one a personal record.", "Stored embeddings are treated as anonymous and are used to re-identify a person later."],
    v: "Attempt re-identification of known participants using only the released metadata and available outside data; the attack should fail at the stated rate, and review should find no stable per-person identifiers.",
    dep: ["appearance-embeddings", "retention-and-deletion"]
  },
  "bias-and-fairness-review": {
    s: "Measuring whether models err more for some groups, conditions or places, and acting on the differences before deployment.",
    d: "Accuracy is evaluated per slice, such as lighting, skin tone, clothing, age, mobility aids and camera position, using labeled data that represents them. Gaps are documented, and the system is changed by collecting data, adjusting thresholds or restricting use. Reviews repeat on every model and for each new site. Uneven error rates matter most when outputs trigger action about people; for those uses, a human review step and an appeal path are part of the design.",
    k: ["Group-specific thresholds vs one threshold: group thresholds equalize error rates and raise questions of their own; one threshold is simple and can be unequal.", "Collect more data vs restrict the use: more data may close gaps; restricting the use is sometimes the right answer.", "Pre-release review vs continuous monitoring: pre-release prevents known harm; monitoring catches shifts after deployment."],
    p: ["Aggregate metrics are excellent while one group has several times the miss rate, because it is a small fraction of the test set.", "A fairness check done once is never repeated after the model is retrained."],
    v: "Publish a per-slice accuracy report for each model release, with sample sizes and intervals, and confirm every slice is above its floor or has a documented mitigation approved before rollout.",
    dep: ["slice-based-accuracy", "training-and-evaluation"]
  },
  "hard-example-mining": {
    s: "Finding the frames from the field that the model gets wrong or is unsure about, so that labeling effort goes where it improves the model most.",
    d: "Signals include low or unstable confidence, disagreement between models, disagreement between the model and a tracker, operator corrections, rejected alerts and frames from drifted conditions. Mining ranks frames by expected value, avoids near-duplicates and balances classes and sites so rare cases are not drowned. It runs partly on the device, as a cheap filter, and partly in the cloud. Choice of signal biases what the model learns next.",
    k: ["Uncertainty sampling vs random sampling: uncertainty finds hard cases efficiently and can overfit to noise and oddities; random is unbiased and wasteful.", "On-device selection vs upload everything and select centrally: on device saves bandwidth and privacy; central selection sees all the data and costs more.", "Operator corrections as signal vs model signals only: corrections are accurate and sparse; model signals are plentiful and self-referential."],
    p: ["The mining signal selects thousands of near-identical frames of one failing camera and the dataset becomes skewed.", "Confidently wrong predictions are never selected, because only uncertain ones are."],
    v: "Compare the improvement from retraining on mined frames against the same number of randomly sampled frames on a held-out field set; mined data should give a clearly larger gain.",
    dep: ["confidence-monitoring", "sampling-and-upload-policy"]
  },
  "sampling-and-upload-policy": {
    s: "Rules for which frames leave a device for training, how many, when and at what privacy and bandwidth cost.",
    d: "Policy sets quotas per device and per day, sensitive-area exclusions, redaction, required consent and send windows that avoid peak network use. Upload is prioritized by mined value and capped by data plan. Every uploaded frame carries its provenance, the model version and the reason for selection, so that datasets can be reconstructed and deleted. Policy is remotely adjustable, since a campaign to collect night frames needs to be turned on and off quickly.",
    k: ["Opt-in per site vs default collection: opt-in respects customers and slows data collection; default collection is fast and needs strong contracts.", "Quota per device vs global quota: per device is fair; global focuses on needed data and may starve some sites.", "Upload raw frames vs redacted frames: redacted is safer and may remove cues the model needs."],
    p: ["A collection campaign left on exhausts a cellular data plan in a week.", "Frames are uploaded without recording which model version selected them and the selection bias cannot be corrected later."],
    v: "On a test device, enable a collection campaign and confirm uploads respect the quota, window and exclusions, each frame arrives with provenance, and disabling the campaign stops uploads within minutes.",
    dep: ["redaction-and-blurring", "remote-configuration"]
  },
  "annotation-queue": {
    s: "The workflow that distributes frames to labelers with instructions, tools and deadlines, and tracks progress and cost.",
    d: "Selected frames are turned into tasks with clear label definitions, examples of edge cases and an interface suited to the task, such as boxes, polygons or keypoints. Tasks are routed by labeler skill and sensitivity, and a share is sent to several labelers for agreement. Instructions evolve as ambiguous cases appear, and each change must be versioned with the labels it produced. Sensitive footage needs restricted workforces and secure environments.",
    k: ["Internal labelers vs external workforce: internal gives domain expertise and privacy control at higher cost; external scales and needs more quality control.", "Detailed instructions vs short ones: detailed reduce disagreement and are rarely read; short are read and leave edge cases to chance.", "Label everything vs label a sample for review: everything gives training data; sampling is cheaper and thinner."],
    p: ["Ambiguous instructions produce labels that disagree on the same case across weeks and the model learns the noise.", "Frames with visible people are sent to an unvetted workforce."],
    v: "Check a sample of finished tasks against the instruction version in force, compute agreement between labelers and confirm sensitive tasks went only to the approved workforce.",
    dep: ["hard-example-mining", "access-control-and-audit"]
  },
  "model-assisted-prelabeling": {
    s: "Using the current model to draw first-draft labels that people correct, which is faster than labeling from scratch.",
    d: "The production or a larger offline model predicts boxes and masks on new frames, and labelers adjust rather than create. Speed gains of several times are common on easy frames. The risk is anchoring: reviewers accept plausible predictions and the new model inherits the old model's blind spots. Mitigations include hiding confident predictions for a sample, auditing accepted drafts and using a different, stronger model for pre-labels.",
    k: ["Pre-label with the production model vs a stronger offline model: production is available and shares its own mistakes; a stronger model gives better drafts.", "Show all predictions vs only confident ones: all speeds up labeling and anchors reviewers; confident only keeps labelers attentive.", "Review every prediction vs spot-check high-confidence ones: full review is accurate and slow; spot checks are fast and risk systematic errors."],
    p: ["Systematic misses of a rare class are never labeled because the pre-labels never show it.", "Reviewers click accept on long queues and errors pass through."],
    v: "Audit a random sample of accepted pre-labels with independent from-scratch labeling and compare: disagreement must be below the agreed rate, and measured labeling time per frame must drop.",
    dep: ["annotation-queue", "object-detection"]
  },
  "label-quality-review": {
    s: "Measuring and improving label correctness through gold questions, multi-labeler agreement, expert adjudication and automatic anomaly checks.",
    d: "Gold tasks with known answers are mixed into queues to score labelers. Agreement between labelers gives a noise estimate, and disagreements go to experts. Automatic checks find boxes outside the image, implausible sizes, missing labels near confident model predictions and class imbalance changes. Model predictions that confidently contradict labels are a strong sign of label errors. Cleaning labels often improves a model more than changing its architecture.",
    k: ["Multiple labelers per item vs one plus audits: multiple is accurate and costs several times more; audits are cheap and sample-based.", "Model-flagged label errors vs human sampling: model flags find real errors at scale and can reinforce the model's biases; human sampling is unbiased and small.", "Strict acceptance threshold vs throughput: strictness raises label quality and reduces volume."],
    p: ["A labeler's systematic misunderstanding contaminates thousands of items before anyone notices.", "Gold questions become known to labelers and stop measuring anything."],
    v: "Re-label a random sample with experts and confirm label error rate is below target per class, and that flagged anomalies lead to corrections visible in the next dataset version.",
    dep: ["annotation-queue", "dataset-versioning"]
  },
  "dataset-versioning": {
    s: "Immutable, named snapshots of images, labels and splits with lineage, so that any model can be traced to the exact data that trained and tested it.",
    d: "A dataset version records its frames, labels, label-instruction version, splits and the policies that selected them. Splits keep frames from the same camera and time period together to prevent leakage between training and test. Versions are stored by reference and content hash. Deleting a person's data requires finding every version that contains it, so lineage is also a privacy tool. Dataset changes should be reviewed like code.",
    k: ["Immutable snapshots vs mutable datasets: snapshots make results reproducible and use storage; mutable data is cheap and impossible to audit.", "Split by camera and time vs random split: grouped splits measure generalization honestly; random splits look better because near-duplicate frames leak.", "Store raw images in the dataset vs references: storing is self-contained; references save space and break when sources are deleted."],
    p: ["Near-identical frames from one camera land in both training and test and accuracy is overstated.", "A label fix changes a dataset in place and old results cannot be reproduced."],
    v: "Pick a deployed model, retrieve its recorded dataset version, retrain with the same settings and confirm the evaluation numbers reproduce within the expected variance.",
    dep: ["label-quality-review"]
  },
  "training-and-evaluation": {
    s: "The pipeline that trains candidate models from a dataset version and evaluates them on frozen tests, slices and field samples, recording everything for comparison.",
    d: "Training starts from a pretrained model, uses augmentations that mimic field conditions such as blur, noise and compression, and records configuration, code version and seeds. Evaluation covers aggregate and per-slice metrics, calibration and robustness tests, then latency on target hardware after optimization. Experiments are tracked so comparisons are fair. The aim is not the highest number on a benchmark but the best result on the cameras where the system runs.",
    k: ["Fine-tune a pretrained model vs train from scratch: fine-tuning needs less data and inherits the pretrained biases; scratch training needs far more data.", "Heavy augmentation vs field data only: augmentation covers rare conditions cheaply and can teach unrealistic cues; field data is faithful and scarce.", "Evaluate on public benchmarks vs on field samples: benchmarks allow comparison; field samples predict deployment."],
    p: ["A model scores higher on the benchmark and lower in the field, since the benchmark looks nothing like the cameras.", "Seeds and configuration are not recorded and a good run cannot be repeated."],
    v: "Rerun a recorded experiment from its stored configuration and confirm results land within the known run-to-run variance, and that the evaluation report covers slices and target-device latency.",
    dep: ["dataset-versioning", "train-serve-parity"]
  },
  "shadow-and-canary-evaluation": {
    s: "Testing a new model on real field traffic before it takes over, by running it silently beside the old one or giving it a small share of devices.",
    d: "In shadow mode the candidate processes the same frames and its outputs are compared with the incumbent's and with later ground truth, without affecting events. A canary sends real decisions from the candidate on a small group of devices, with automatic rollback if metrics regress. Both reveal differences that offline sets miss: new lighting, camera models, unusual traffic. Shadow mode needs spare compute, which edge devices often lack, so it may run on a subset or on sampled frames.",
    k: ["Shadow vs canary: shadow is risk-free and needs double compute; canary uses normal compute and exposes some sites to the new model.", "Compare to the incumbent vs compare to ground truth: incumbent comparison is immediate and tells only about disagreement; ground truth is slow and decisive.", "Canary on representative sites vs on easy sites: representative finds problems and carries risk; easy sites are safe and teach less."],
    p: ["The canary group lacks the one camera type that the new model fails on, and the rollout proceeds.", "Shadow outputs are not stored with frames, so the disagreements cannot be inspected."],
    v: "Run a candidate in shadow for a week and confirm the disagreement report links each differing case to its frame, and that a deliberately worse candidate triggers an automatic halt on the canary group.",
    dep: ["staged-rollout", "accuracy-regression-gate", "slice-based-accuracy"]
  },
});
