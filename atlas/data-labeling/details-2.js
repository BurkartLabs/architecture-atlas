// Details for the data labeling plate, part 2: consensus and adjudication, quality metrics.
ATLAS.details("data-labeling", {
  "redundancy-policy": {
    s: "The rule for how many independent workers label each item, whether that number is fixed or grows when the first judgments disagree.",
    d: "Redundancy buys accuracy by collecting several judgments per item. A fixed policy asks for the same count everywhere. An adaptive policy starts with one or two judgments and requests more only while agreement is low or the class is risky, stopping at a cap. The policy lives per task type and class, and feeds routing, which must create the extra assignments. It is hard because redundancy multiplies cost and delay, and independence matters: workers who see each other's answers add little.",
    k: ["Fixed redundancy vs adaptive stopping: fixed is predictable to budget, and adaptive saves money on easy items while making cost and schedule harder to forecast.", "Redundancy on everything vs redundancy on a sample plus gold: full redundancy catches every error, and sampling is cheaper but tolerates a known error rate."],
    p: ["Judgments are collected from workers who share a team chat, and the apparent agreement is copying.", "An adaptive policy with no cap sends one ambiguous item to dozens of workers."],
    v: "Label a set with a known number of hard items under an adaptive policy and confirm that extra judgments concentrate on the hard items, no item exceeds the cap, and total judgments match the cost report.",
    dep: ["assignment-policy", "worker-item-exclusion", "consensus-rules"]
  },
  "consensus-rules": {
    s: "The deterministic rules that turn several judgments of an item into one accepted label: majority, unanimity, thresholds on agreement and handling of ties.",
    d: "For each task type the platform defines how to combine judgments: the most frequent class, a median for numbers, the union or intersection of regions at a threshold overlap, or the longest common span. A rule also states what happens when no label wins, usually sending the item to adjudication. Rules are versioned with the task design. They are hard for structured outputs: two boxes around one object rarely match exactly, so consensus needs geometry-aware matching, not equality.",
    k: ["Simple majority vs weighted by worker reliability: majority is transparent and fair-looking, and weighting is more accurate when reliability is well measured and misleading when it is not.", "Strict unanimity vs quorum threshold: unanimity yields cleaner labels and sends many more items to adjudication."],
    p: ["Ties in a two-worker setup resolve by whichever came first, and a systematic bias in submission order becomes label bias.", "Box overlap thresholds that are too strict reject nearly identical boxes as disagreements."],
    v: "Feed the rule a table of constructed judgment sets, including ties, near-matching boxes and empty answers, and confirm that each produces the documented outcome or an adjudication request.",
    dep: ["redundancy-policy", "task-templates", "adjudication-queue"]
  },
  "label-aggregation-models": {
    s: "Statistical methods that estimate each item's true label and each worker's reliability together from all judgments, instead of counting votes.",
    d: "Probabilistic aggregation models treat the true labels as hidden and each worker as having an error profile, such as a confusion matrix between classes. They estimate both from the full set of judgments, usually by iterative inference, and output a posterior probability per item rather than a bare label. This beats voting when worker quality varies widely and workers are not always labeling the same items. The difficulty is data volume: estimating per-worker, per-class errors needs many overlapping judgments and can overfit when it is sparse.",
    k: ["Probabilistic aggregation vs majority vote: probabilistic uses unequal reliability and gives confidence, but is harder to explain and fails on sparse data.", "Soft posteriors kept vs argmax labels exported: posteriors preserve uncertainty for training, and most downstream code expects a single hard label."],
    p: ["Workers who copy one another look highly reliable to the model and dominate the estimate.", "Fitting on a small batch gives extreme error estimates for rarely seen classes."],
    v: "Simulate judgments from workers of known reliability over items of known truth, run the model and confirm it recovers the true labels more accurately than majority vote and estimates the reliabilities within tolerance.",
    dep: ["consensus-rules", "annotator-reliability-models", "annotation-store"]
  },
  "annotator-reliability-models": {
    s: "Per-worker estimates of accuracy, bias and consistency by task type and class, built from gold results, agreement with consensus and review outcomes.",
    d: "Each worker accumulates evidence: results on gold questions, agreement with accepted labels, reviewer corrections and appeal outcomes. The model combines these into estimates with uncertainty, kept per task type and class since skill does not transfer. New workers start with wide uncertainty and narrow it as evidence arrives. The estimates drive routing, weighting in aggregation and pay tiers. The hard part is that agreement with consensus is not accuracy: a worker who is right when everyone else is wrong looks unreliable.",
    k: ["Reliability from gold only vs from agreement signals as well: gold is trustworthy and sparse, while agreement is plentiful and rewards the herd.", "Exponential decay of old evidence vs full history: decay tracks improvement or decline, and throws away evidence needed for stable estimates."],
    p: ["A skilled worker disagrees with a flawed consensus and is penalized for it.", "Estimates across different task types are pooled, and a specialist's weakness elsewhere hides their strength."],
    v: "Inject a worker who answers at random into a live batch and confirm that their estimated reliability drops below the threshold within a stated number of items, while a known accurate worker's estimate stays high.",
    dep: ["gold-questions", "label-aggregation-models", "skill-and-trust-profiles"]
  },
  "adjudication-queue": {
    s: "A queue of items whose judgments conflict or fall below confidence, held for a more senior person to decide with all prior answers visible.",
    d: "Items that fail consensus rules, items flagged by workers and items sampled for audit enter a queue served to adjudicators. An adjudicator sees the item, the competing judgments and the guideline, then chooses one, edits it or rejects the item as unusable. Their decision is final unless disputed and is recorded with a reason. It is hard because adjudication is the most expensive human step, so the queue must be small and well chosen, and because adjudicators can drift from the guidelines they are supposed to enforce.",
    k: ["Showing prior judgments vs blind adjudication: seeing them is faster and anchors the decision, while blind adjudication gives independent evidence at the price of speed.", "Single adjudicator vs panel: a single adjudicator is cheap and consistent, and a panel catches idiosyncrasy on high-stakes classes."],
    p: ["The queue grows faster than adjudicators clear it, and the whole project waits on the final one percent.", "Adjudicator decisions are not recorded with reasons, so the same disagreement recurs with no guideline fix."],
    v: "Create a conflicting item and follow it into the queue, then confirm the adjudicator sees all judgments and the guideline, that the decision is stored with a reason, and that the accepted label updates the dataset.",
    dep: ["consensus-rules", "queue-manager", "expert-review", "annotation-store"]
  },
  "expert-review": {
    s: "A tier of domain specialists who check difficult or high-stakes labels, answer worker questions and set the standard that gold answers come from.",
    d: "Experts are scarce and costly, so they review a targeted share: items from low-trust workers, rare classes, audit samples and cases where the guidelines are silent. They also author gold questions and edge-case rulings, which flow back into the guidelines. Review can be a second pass over accepted work or a first pass by an expert on the hardest slice. The difficulty is allocation: expert time is the bottleneck, so choosing what they see matters more than how fast they work.",
    k: ["Expert review of a random sample vs of targeted risky items: random sampling gives an unbiased error estimate, and targeting finds more errors per hour.", "Experts labeling directly vs reviewing others' work: direct labeling is highest quality, and review is cheaper per item and anchors on the first answer."],
    p: ["Experts disagree among themselves, and no process records which view became the rule.", "All review capacity is spent on a single noisy worker's output while systematic errors elsewhere go unseen."],
    v: "Pull a month of expert reviews and confirm that each correction links to a worker and a guideline version, that corrections feed at least one guideline or gold update, and that review capacity usage matches the targeting rules.",
    dep: ["gold-questions", "edge-case-rulebook", "skill-and-trust-profiles", "queue-manager"]
  },
  "disagreement-analysis": {
    s: "Analysis that groups disagreements by class, item features and worker to show whether they come from unclear guidelines, hard data or a few unreliable annotators.",
    d: "The platform summarizes disagreements as confusion matrices between classes, items with the highest spread and agreement broken down by worker and by feature such as image blur or text length. Clusters of confusion between two classes usually point to a guideline gap or an ontology problem, such as overlapping classes, while disagreement concentrated in a few workers points to training. The output is a worklist for guideline owners. The hard part is acting on it: analysis that does not feed back into task design only documents the problem.",
    k: ["Automated clustering of disagreements vs manual review of samples: automatic scales to every class, and manual review understands why people differ.", "Reporting per class pair vs per item: pair-level reports show where the ontology fails, and item-level reports give examples for the guidelines."],
    p: ["Aggregate agreement looks healthy while one rare but important class pair has none.", "The report is generated each week and never assigned to anyone who can change the guidelines."],
    v: "Seed a batch with two deliberately overlapping classes and confirm that the report ranks that class pair first, lists example items, and creates a task for the guideline owner.",
    dep: ["inter-annotator-agreement", "ontology-schema", "instruction-guidelines"]
  },
  "dispute-and-appeal": {
    s: "A path for workers to challenge a rejection or a quality score, and for requesters to challenge a delivered label, with a second look and a recorded outcome.",
    d: "When review rejects work or a quality score reduces pay or access, the worker can submit a dispute with the item and a reason. A reviewer who did not make the original decision rules on it against the guideline. Upheld disputes reverse pay and score changes and are fed to guideline owners as evidence of ambiguity. Requesters can similarly flag delivered labels. It is hard to run at volume: appeals must be cheap to resolve, resistant to abuse and consistent with earlier rulings.",
    k: ["Appeals reviewed by a different person vs by the original reviewer: a different reviewer is fairer and loses context, while the same reviewer is fast and defends their own decision.", "Free appeals vs limited appeals: free appeals build trust and invite bulk challenges, while limits protect reviewers and silence legitimate disputes."],
    p: ["Appeals take weeks, and workers leave before they are decided.", "A ruling on one appeal is not recorded as precedent, and identical disputes get opposite results."],
    v: "File a dispute on a rejected item, and confirm a different reviewer is assigned, the outcome is recorded with a reason, pay and score are adjusted when upheld, and the ruling is linked to the guideline entry it clarified.",
    dep: ["expert-review", "payments-and-payouts", "skill-and-trust-profiles", "edge-case-rulebook"]
  },
  "gold-questions": {
    s: "Items whose correct answers are known with high confidence, mixed into normal work to measure each worker's accuracy against truth rather than against other workers.",
    d: "Gold items are chosen from items that experts or unanimous trusted workers labeled, then stored with their answers and the guideline version. They are served indistinguishably from real tasks and scored automatically, or with tolerance for structured answers. Their results measure accuracy per worker and class, feed qualification, and detect guideline drift. It is hard to build good gold: items must be representative, not too easy, not ambiguous, and refreshed, since workers share answers and remember them.",
    k: ["Gold from expert labels vs from unanimous crowd answers: expert gold is more reliable and costly, and unanimous crowd gold skews toward easy items.", "A small stable gold set vs a large rotating pool: stable sets make scores comparable over time, and rotation resists memorization at the cost of comparability."],
    p: ["Gold items get shared in worker forums, and measured accuracy climbs while real accuracy does not.", "Gold covers common classes only, so rare-class errors never show up in any score."],
    v: "Check that every class above a frequency floor has gold, that gold items are indistinguishable in the interface, and that a worker answering all gold correctly and real items at random is detected by a separate audit.",
    dep: ["expert-review", "annotation-store", "taxonomy-versioning"]
  },
  "gold-injection": {
    s: "The mechanism that selects when and which gold item to insert into a worker's stream, at a rate that measures accuracy without wasting paid work or revealing a pattern.",
    d: "The injector chooses a rate per worker and task type, higher for new or uncertain workers and lower for established ones, and draws gold from the pool with class balance and rotation. Insertions are randomized so position gives nothing away. Results return to the reliability model within seconds so assignment can react. The difficulty is the rate: a high rate wastes money and annoys workers, a low rate leaves an uncertain worker's errors uncaught for days.",
    k: ["Adaptive insertion rate vs fixed rate: adaptive spends measurement where uncertainty is, and a fixed rate is simpler to explain and budget.", "Immediate feedback on gold errors vs silent scoring: feedback teaches and also reveals which items are gold."],
    p: ["Gold appears at regular intervals, and workers learn the pattern and take care only on those items.", "A worker sees the same gold item twice because the exclusion set was not applied."],
    v: "Over a large sample of tasks, confirm that gold positions pass a randomness test, that each worker's gold rate matches the policy for their trust tier, and that no worker is served a given gold item twice.",
    dep: ["gold-questions", "assignment-policy", "skill-and-trust-profiles"]
  },
  "inter-annotator-agreement": {
    s: "Statistics such as chance-corrected agreement coefficients that quantify how consistently different workers label the same items, per class and per project.",
    d: "Agreement is computed over items labeled by several workers, using a coefficient suited to the task: categorical, ordinal, numeric, or overlap-based for regions and spans. Chance correction matters because a heavily imbalanced class gives high raw agreement by guessing. Values are tracked over time and by class. Low agreement indicates unclear guidelines or inherently subjective labels, high agreement suggests clarity or a shared bias. The difficulty is interpretation: no universal threshold exists, and a coefficient is not accuracy.",
    k: ["Chance-corrected coefficients vs raw percent agreement: corrected values are honest on imbalanced data, and are harder to explain and unstable on rare classes.", "Pairwise vs multi-rater statistics: pairwise is simple and multi-rater handles missing data and varying rater sets properly."],
    p: ["High agreement between two workers who both follow the same shortcut is read as quality.", "A single coefficient over all classes hides a class with near-zero agreement."],
    v: "Compute the coefficient on a synthetic set with known agreement levels, including a heavily imbalanced class, and confirm that reported values match an independent calculation and drop when noise is added.",
    dep: ["redundancy-policy", "annotation-store"]
  },
  "accuracy-against-gold": {
    s: "A per-worker, per-class accuracy score computed from gold results with confidence intervals, used for qualification, routing and review of trends.",
    d: "Each gold answer is scored against the key, with tolerance for structured labels such as an overlap threshold for boxes. Scores aggregate into accuracy and per-class precision and recall for the worker, with a confidence interval that reflects how many gold items were seen. Few answers make a wide interval, so decisions use the interval, not the point. The challenge is that gold accuracy estimates quality only on gold-like items, and real tasks may be harder or different.",
    k: ["Decisions on the lower confidence bound vs on the point estimate: bounds avoid acting on luck and slow the promotion of good new workers.", "Per-class scores vs one overall score: per-class scores find specific weaknesses and need more gold per class to be meaningful."],
    p: ["A worker is banned after three unlucky gold answers because no interval was applied.", "Overall accuracy is dominated by common easy classes and hides failure on the rare ones."],
    v: "Replay a worker's logged gold results, and confirm that the platform's accuracy and interval equal an independent computation, and that a decision rule fires only when the lower bound crosses the threshold.",
    dep: ["gold-questions", "gold-injection", "annotator-reliability-models"]
  },
  "acceptance-sampling": {
    s: "Statistical sampling of completed batches for expert audit, so that the error rate of the whole batch is bounded without checking every item.",
    d: "After a batch finishes, the platform draws a random sample, stratified by class and by worker, and sends it for expert review. From the number of errors found it computes an estimate of the batch error rate with an interval and compares it with the acceptance threshold. A batch below the threshold is accepted, one above is sent back for rework or full review. It is hard because required sample size depends on the error rate to be detected, and rare classes need targeted sampling to be covered at all.",
    k: ["Stratified sampling vs simple random sampling: stratified guarantees coverage of rare classes and workers, and complicates the error estimate.", "Accept or reject the whole batch vs rework only failing slices: whole-batch decisions are simple, and slice decisions save money when errors are concentrated."],
    p: ["A sample too small to detect a five percent error rate certifies a batch with twice that.", "Workers learn that sampled items are reviewed and the platform fails to randomize selection after submission."],
    v: "Plant known errors at a ten percent rate in a test batch and confirm that the audit's estimate interval contains ten percent, and that a batch above threshold is rejected automatically.",
    dep: ["expert-review", "quality-gates", "annotation-store"]
  },
  "label-error-detection": {
    s: "Automatic flagging of items whose labels are probably wrong, by finding disagreement between a trained model's confident prediction and the human label.",
    d: "A model trained on the labeled data, ideally with cross-validation so it did not see the item, predicts each item. Items where it confidently disagrees with the label are ranked as likely errors and sent for review. The same approach finds duplicates with conflicting labels and outliers. It is hard because the model learns the same systematic errors the labelers made, so it finds noise better than bias, and because a rare but correct label looks like an error to a model that has seen few examples.",
    k: ["Cross-validated model predictions vs in-sample predictions: cross-validation avoids memorized errors, and costs several training runs per check.", "Flagging for human review vs automatic correction: review keeps humans accountable and is slow, while automatic correction fixes noise and entrenches model mistakes."],
    p: ["Rare classes are flagged as errors, and reviewers relabel real minorities into the majority class.", "A model trained on biased labels agrees with them, and the bias is never flagged."],
    v: "Corrupt a known fraction of labels in a clean dataset and confirm that the detector ranks a high share of the corrupted items in its top flagged items, with review confirming most flagged items as errors.",
    dep: ["pre-labeling-models", "annotation-store", "expert-review"]
  },
  "quality-drift-monitoring": {
    s: "Tracking quality signals over time to detect when accuracy, agreement or guideline interpretation changes for a worker, a team or a class.",
    d: "Time series of gold accuracy, agreement, rejection rate and speed are tracked per worker, team and class with control limits. A shift triggers an alert, such as a team's accuracy dropping after a guideline change, a new batch type, a tool release or a workforce change. The monitor separates real drift from noise using sample sizes and changepoint tests. The hard part is cause: a drop may be fatigue, new data distribution, an interface bug or a better guideline revealing past errors.",
    k: ["Statistical control limits vs fixed thresholds: control limits adapt to each series' variance, and need history that new projects lack.", "Alerting per worker vs per team and class: per-worker catches individual problems and creates many alerts, while grouped alerts find systematic causes."],
    p: ["A tool update changes a default, and accuracy falls across all workers on the same day, unnoticed for a week.", "Alerts fire so often that managers stop reading them."],
    v: "Inject a degradation of ten points in accuracy for one team in a replayed log and confirm that the monitor alerts within the stated number of items, names the team and class, and does not alert on matched control series.",
    dep: ["accuracy-against-gold", "inter-annotator-agreement", "notification-service"]
  },
  "quality-gates": {
    s: "Configured conditions that must hold before labels are accepted, merged into a dataset or paid for, such as agreement thresholds, gold scores and review results.",
    d: "A gate is a rule evaluated on an item, batch or worker: minimum agreement, maximum disagreement, required review, gold accuracy above a floor, audit error rate below a limit. Items that fail are held, sent back or excluded, and the reason is recorded. Gates apply at three points: before payment, before aggregation into the dataset, and before export. They are hard to set: too strict wastes spend and starves the dataset, too loose lets bad labels into training.",
    k: ["Gates that block vs gates that flag: blocking guarantees the standard and can stall delivery, while flags keep flow and let bad data through.", "Gates per task type vs project-wide: per-type gates fit each task's real difficulty, and make quality harder to compare across the project."],
    p: ["A gate rejects a whole class because its agreement is naturally lower, and the dataset loses it entirely.", "Gate settings change mid-project without a record, and earlier and later data are not comparable."],
    v: "Submit batches deliberately above and below each threshold, and confirm that failing ones are held with a stated reason, that passing ones proceed, and that the gate configuration version is stored on every decision.",
    dep: ["accuracy-against-gold", "inter-annotator-agreement", "acceptance-sampling", "workflow-engine"]
  }
});
