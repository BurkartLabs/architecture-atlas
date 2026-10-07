// Details for the recommender system plate, part 2: filtering, ranking, re-ranking, exploration.
ATLAS.details("recommender-system", {
  "seen-item-filter": {
    s: "Removes items the user has already consumed or been shown recently, so the same content is not recommended over and over.",
    d: "The filter checks each candidate against the user's history: consumed items always, and merely shown items for a recency window. Exact membership over long histories is expensive at scale, so systems use compact probabilistic sets or per-user sorted lists with limits. Rules differ by domain: a purchased appliance should not return, but a favorite song may be welcome again. The hard part is deciding what counts as seen, since impressions that were never actually visible should not burn an item, while repeated visible impressions without interaction are a signal.",
    k: ["Exact history vs probabilistic set: exact lists are correct but heavy; a compact probabilistic set is cheap and fast but sometimes removes an unseen item as a false positive.", "Filter at retrieval vs after ranking: filtering early saves ranking cost but needs the history available to every source; filtering late is simple but wastes compute on removed items."],
    p: ["The filter drops items marked seen only because they scrolled past offscreen, and the user never gets to see them.", "History lookup is slow or missing at request time and the filter is skipped, so users see items they just consumed."],
    v: "Consume a set of test items, then request recommendations immediately and confirm none of them appear, while items merely shown but not visible remain eligible per the stated rule.",
    dep: ["online-user-history-store", "impression-logging"]
  },
  "availability-filter": {
    s: "Drops candidates that cannot actually be consumed right now because they are out of stock, expired, removed, unreleased or otherwise unavailable.",
    d: "Retrieval indexes and neighbor lists are built from snapshots, so they lag reality. The filter checks live availability from the catalog or an inventory service, ideally from a fast replicated view rather than a synchronous call per item. Availability can be per user: region, subscription tier, age rating or device. Reads are batched to stay within the latency budget. It is hard because the cost of being wrong is asymmetric, and an unavailable item shown is a worse experience than a slightly fresher but smaller list.",
    k: ["Live lookup vs cached availability: live lookups are accurate but add latency and a dependency; cached views are fast but allow short windows of wrong answers.", "Fail open vs fail closed when the check is unavailable: failing open keeps recommendations flowing but may show dead items; failing closed is safe but can return empty slates."],
    p: ["A snapshot ANN index still contains items removed hours ago, and the filter's cache has the same stale view.", "Availability check timeouts are treated as available, so an outage surfaces broken items on every page."],
    v: "Mark a set of test items unavailable and confirm they disappear from recommendations within the stated propagation time, including from cached responses and email batches already generated.",
    dep: ["item-catalog"]
  },
  "policy-and-safety-filter": {
    s: "Removes candidates that violate content or legal policy, or that are not appropriate to recommend even if they are allowed to exist on the platform.",
    d: "Policy has two layers: what must be removed (illegal, prohibited) and what may stay but should not be amplified (borderline, low quality, sensitive for the audience). Items carry labels from classifiers, human review and user reports; the filter uses them with thresholds that vary by surface and user, such as age. It runs as a hard rule, not a model feature, because the cost of a miss is not average-case. Hard parts are label latency, since new items arrive before classification, and conflicts between engagement-based ranking and policy.",
    k: ["Remove vs demote: removal is certain and simple to audit; demotion preserves legitimate content near the line but still amplifies some of it.", "Block until classified vs allow until flagged: blocking is safer but delays good new content; allowing is faster and exposes users to unreviewed items."],
    p: ["A policy label is updated in the review system but not propagated to the serving index, so a removed item keeps being recommended.", "Thresholds tuned on average content over-remove material from small communities whose language the classifier handles poorly."],
    v: "Insert known-violating test items with fresh labels and confirm none are served on any surface; measure the lag between a label change and its enforcement in recommendations.",
    dep: ["item-metadata-enrichment", "item-catalog"]
  },
  "region-and-rights-filter": {
    s: "Removes candidates the user may not legally or contractually be shown or sold in their location, language, age group or subscription.",
    d: "Rights, licensing and regulation vary by region, and many catalogs hold items that are available only in some territories or windows. The filter takes the user's resolved region (not just a reported one), account tier and age category and compares them with each item's rights record. Time windows matter: an item can be licensed from one date to another. It is simple logic whose difficulty is data: rights metadata is incomplete, changes often, and arrives from partners in inconsistent shapes.",
    k: ["Resolve region from the request vs account setting: request-based resolution follows actual location but is affected by travel and proxies; account settings are stable but wrong for travelers.", "Hard-fail on missing rights data vs default allow: hard-fail avoids violations but hides large parts of the catalog; default allow is lenient and carries legal risk."],
    p: ["A licensing window ends at midnight in one time zone, and the filter uses another, so the item is shown for hours without rights.", "Missing rights records are read as available worldwide."],
    v: "Test with accounts in several regions and tiers against items with known rights, and confirm each sees exactly the allowed set, including on the days a window opens and closes.",
    dep: ["item-catalog", "user-profile-store"]
  },
  "user-preference-filter": {
    s: "Applies the user's explicit choices to the candidate list: blocked creators, muted topics, hidden items and categories they asked not to see.",
    d: "Explicit blocks and mutes are stored per user and checked against each candidate's creator, topic and id. They must be honored on every surface, including emails and notifications, and with immediate effect. Matching on topic needs reliable item labels, and matching on a creator must handle aliases and reposts. The filter is a hard rule that overrides model scores. The difficulty is coverage: a block respected in the feed but missed in the similar-items module or a push batch destroys trust faster than any poor ranking.",
    k: ["Enforce centrally in the pipeline vs per surface: central enforcement guarantees consistency; per-surface enforcement lets surfaces differ but creates gaps.", "Exact creator and item matching vs topic-level matching: exact is precise and predictable; topic matching honors intent better but misclassifies borderline items."],
    p: ["A blocked creator reappears through a reposting account, because the filter matched only on the original id.", "Offline batch jobs such as email digests read an older copy of the preferences and ignore recent blocks."],
    v: "Block a creator and a topic, then exercise every surface and batch channel; confirm no item from them appears anywhere within the stated time, and that the block survives a profile cache refresh.",
    dep: ["user-profile-store", "item-catalog", "user-controls-and-feedback"]
  },
  "near-duplicate-filter": {
    s: "Detects and collapses items that are essentially the same, such as reposts, reuploads and variants, so one slate does not repeat the same content.",
    d: "Duplicates are found with content fingerprints, text shingling or embedding distance, plus catalog-level grouping of variants into a canonical item. The filter keeps the best representative of each group, based on quality or availability, and removes the rest from the candidate list. Done at index time, it reduces catalog noise; done at request time, it catches duplicates across sources. The hard part is the threshold: too strict leaves near copies, too loose merges distinct items such as sequels or different editions.",
    k: ["Collapse at ingestion vs at request time: ingestion is cheap at serving and consistent; request time catches cross-source duplicates and uses current availability, at a latency cost.", "Fingerprint matching vs embedding similarity: fingerprints are precise for exact copies; embeddings catch paraphrases and edits but make more false merges."],
    p: ["Sequels and numbered editions are merged as duplicates, and users cannot find the next installment.", "The canonical representative chosen for a group is out of stock while another variant is available."],
    v: "Run the filter on a labeled set of duplicate and distinct pairs and confirm precision and recall meet stated targets, and that slates in production contain no pair from the labeled duplicates.",
    dep: ["item-catalog", "item-metadata-enrichment"]
  },
  "ranking-feature-assembly": {
    s: "Gathers and joins every feature the ranker needs for each user-candidate pair: user, item, context and cross features, fetched within the latency budget.",
    d: "For a few hundred candidates, the assembler fetches item features by id, user features once, and context from the request, then computes crosses such as user-category affinity. Lookups are batched and parallel, and each carries a timeout and a default. Features come from the online store, the request and real-time state. It is often the largest share of ranking latency and the most common source of production bugs: missing values, stale values and subtle differences from the training definitions.",
    k: ["Fetch everything vs fetch by ranker stage: fetching all at once is simple but wasteful; staged fetching gives the pre-ranker a few cheap features and the heavy ranker the rest, with more coordination.", "Default value on timeout vs drop the candidate: defaults preserve candidates but distort scores; dropping is clean but can empty the slate during an incident."],
    p: ["A timeout silently substitutes zero for a feature whose zero is meaningful, and scores shift for the affected requests.", "Candidate features are fetched one at a time, so latency scales with candidate count and breaches the budget at peak."],
    v: "Log assembled vectors for sampled requests and check missing-value rates per feature stay below target, fetch p99 fits the stage budget, and values equal an offline recomputation.",
    dep: ["online-feature-store", "online-user-history-store", "feature-definitions", "windowed-counters"]
  },
  "pre-ranker": {
    s: "A fast, light model that cuts several hundred or thousands of candidates down to a few hundred, so the heavy ranker only scores what it can afford.",
    d: "The pre-ranker uses a small set of cheap features and a compact model, such as a shallow network or a boosted tree, to order candidates for pruning. It must be much cheaper per item than the heavy ranker, and good enough that it rarely drops items the heavy ranker would have placed at the top. Its output is also a useful feature. The design problem is consistency: it is trained on logs that contain only items that survived to be shown, so it never sees the items it should have cut.",
    k: ["Distill from the heavy ranker vs train on user feedback: distillation matches what the final stage prefers and covers items never shown; feedback training reflects real users but inherits selection bias.", "Few cheap features vs many: fewer features keep latency low; more improve agreement with the heavy ranker but erode the savings."],
    p: ["Items the heavy ranker would have promoted are pruned early, and nobody sees them because the loss is invisible in served logs.", "The pre-ranker is retrained less often than the heavy ranker, and their preferences drift apart."],
    v: "On a sampled set, run the heavy ranker on all candidates and confirm that the share of its top-ten items surviving the pre-ranker cut meets a stated target, tracked per release.",
    dep: ["ranking-feature-assembly", "model-distillation", "model-inference-runtime"]
  },
  "heavy-ranker": {
    s: "The main ranking model: a large neural network with many features that scores each remaining candidate for one or several predicted outcomes.",
    d: "The model takes user, item, context and interaction features, including sparse id embeddings and cross features, and outputs predictions per candidate. Architectures combine feature interaction layers, attention over the user's history and shared lower layers for several tasks. It consumes most of the compute budget, so it runs on a limited candidate set, batched on accelerators. Hard parts include training on feedback that only covers shown items, calibration of outputs, and keeping the model fresh as content and behavior change daily.",
    k: ["Large expressive model vs smaller fast model: larger models capture more interactions and lift metrics but cost latency, accelerators and iteration time.", "Retrain from scratch vs fine-tune incrementally: scratch training is stable and clean but slow and costly; incremental updates track change but accumulate drift and make regressions harder to trace."],
    p: ["Offline gains do not transfer because the model overfits to the logged policy's exposure pattern.", "Sparse id embeddings for rare items are barely trained, so the model ranks new items essentially at random."],
    v: "Compare the new model against the incumbent in a controlled online experiment, and confirm the lift on the target metric matches the offline prediction in direction and rough size, with no guardrail regression.",
    dep: ["ranking-feature-assembly", "training-pipeline", "embedding-tables", "model-inference-runtime"]
  },
  "multi-task-prediction": {
    s: "Predicting several outcomes for each candidate at once, such as click, long watch, purchase, share and hide, from a shared model with separate output heads.",
    d: "Shared lower layers learn common structure; each head predicts one outcome, trained on that outcome's label. This is cheaper than separate models and lets sparse outcomes borrow strength from dense ones. The value model later combines the predictions into one score. The tension is in training: tasks can pull the shared layers in conflicting directions, and a head with few positive labels can be dominated. Interactions between outcomes, such as a click that ends in a quick bounce, are explicit in the combination rather than hidden inside one label.",
    k: ["Shared model with several heads vs separate models: sharing is cheaper and helps sparse tasks; separate models are independent and easier to update, but cost more and miss shared structure.", "Fixed loss weights vs learned weighting: fixed weights are simple and predictable; learned weights adapt but can silently deprioritize an important rare task."],
    p: ["A rare but valuable outcome such as purchase gets almost no gradient, and its head is close to the base rate.", "Updating one head's labels changes shared layers and shifts every other head's calibration."],
    v: "Evaluate each head on its own metric against its single-task baseline and confirm none regressed beyond tolerance, and that predicted rates match observed rates within bins for each head.",
    dep: ["heavy-ranker", "label-construction"]
  },
  "value-model": {
    s: "Combines the predicted outcomes into a single score per item using weights that express what the product values, then orders by that score.",
    d: "The value model is a formula, often a weighted sum or product of predicted probabilities and expected values, such as click probability times expected watch time minus a hide penalty. Weights are set by product owners, tuned through experiments and sometimes optimized automatically against long-term metrics. Keeping it separate from the models lets the business change priorities without retraining. It is where the objective becomes concrete, and where mistakes in calibration are amplified: a poorly calibrated probability multiplied by a large weight dominates the ordering.",
    k: ["Hand-tuned weights vs automatically optimized weights: hand-tuning is transparent and easy to explain; optimization finds better trade-offs but needs a trustworthy metric to optimize.", "Additive blend vs multiplicative combination: additive is robust to one bad prediction; multiplicative reflects that value requires all steps to succeed but is sensitive to errors in any factor."],
    p: ["A weight raised to boost one outcome amplifies the noise in its prediction, and rankings become erratic.", "Weights are changed in a config with no experiment or record, and a metric shift weeks later cannot be traced."],
    v: "Change one weight in a test arm and confirm the metric tied to it moves in the intended direction and the others move by the expected trade-off, with the change recorded and reversible.",
    dep: ["multi-task-prediction", "score-calibration", "objective-choice"]
  },
  "score-calibration": {
    s: "Adjusting model outputs so a predicted probability of 0.1 means about ten percent of such items are actually clicked, which the value model and downstream rules rely on.",
    d: "Ranking loss improves order but not the absolute meaning of scores. Calibration maps raw outputs to observed rates using a monotone transform fitted on recent data, often per segment such as surface or device. It matters when scores are combined across tasks, compared across models, fed to bidding or thresholded. It must be refit as behavior shifts, since a calibrated model today is miscalibrated after a product change. The difficulty is that calibration must be measured on the traffic the model serves, which is itself selected by the model.",
    k: ["Calibrate globally vs per segment: global is simple and stable; per-segment is more accurate where behavior differs but needs enough data and risks inconsistency between segments.", "Post-hoc calibration layer vs calibration-aware training: a post-hoc layer is easy to refresh and decouple; training-time methods avoid the extra step but make training harder to tune."],
    p: ["The calibration map is fit on last month's data and a new surface launches with a different click base rate, so every predicted rate is off.", "Calibration is checked on the whole population and hides a segment that is badly over-predicted."],
    v: "Bin predictions by score and compare the mean prediction with the observed rate on fresh traffic for the whole population and each major segment; confirm gaps fall within tolerance.",
    dep: ["heavy-ranker", "calibration-and-coverage-checks"]
  },
  "position-bias-correction": {
    s: "Separates the effect of where an item was displayed from how relevant it is, so models do not learn that top positions are good rather than the items in them.",
    d: "Items at the top of a list get more attention regardless of quality. Approaches include a position feature used in training and neutralized at serving, inverse-propensity weights from estimated examination probability, and randomized position experiments to estimate the effect directly. Some systems train a separate examination tower. Correct estimation requires some randomization or a model of how users scan, which differs per surface layout. The hard part is that estimates are noisy and the correction can add variance larger than the bias removed.",
    k: ["Position as a training feature vs inverse-propensity weighting: the feature is simple and low variance but can be leaked at serving; weighting is principled and unbiased in theory but has high variance.", "Estimate examination from randomized slots vs from a model: randomization is trustworthy but costs user experience; modeling is free but depends on assumptions."],
    p: ["The position feature is set to the real slot at serving time, and the model reproduces the previous ordering.", "A layout change shifts attention patterns, and the old position estimates keep being applied to the new layout."],
    v: "Run a small randomized-position test and compare the model's debiased click predictions against observed click rates by position; confirm predictions for the same item are flat across positions.",
    dep: ["propensity-logging", "training-example-builder", "heavy-ranker"]
  },
  "model-inference-runtime": {
    s: "The runtime that loads ranking models onto accelerators or processors and executes them in batches under the request deadline, with versioning and warm-up.",
    d: "It receives feature tensors for a batch of candidates, runs the model graph and returns scores. Dynamic batching combines concurrent requests to raise throughput, while embedding lookups for large tables can dominate memory. Models are loaded from the registry with their version tags, warmed up before taking traffic and replaced without dropping requests. Optimizations include reduced numeric precision, graph fusion and caching of user-side computation. The challenge is tail latency: batching and garbage collection pauses create rare very slow responses that breach the deadline.",
    k: ["Large batches vs low latency: large batches use accelerators efficiently and cut cost; waiting to fill them adds delay for every request.", "Embedding tables in accelerator memory vs sharded remote lookup: local tables are fast but limit model size; remote shards allow huge tables with added network latency and failure modes."],
    p: ["A new model version loads cold and the first requests exceed the deadline because compilation and caches are not warmed.", "Reduced precision changes scores slightly, and ordering of near-ties flips in ways offline evaluation never saw."],
    v: "Replay recorded feature batches through the runtime and confirm scores match the training framework within tolerance, p99 latency holds at peak load, and a model swap completes with no failed requests.",
    dep: ["model-registry", "embedding-tables", "capacity-and-autoscaling"]
  },
  "diversity-reranker": {
    s: "Reorders the ranked list so that similar items are spread out, using a trade-off between predicted relevance and dissimilarity to what is already placed.",
    d: "Sorted by score, a list often fills with near-identical items because relevance predictions correlate. A greedy method picks items one at a time, penalizing each candidate's similarity to those already chosen. Related methods use determinantal sampling or category and creator constraints. The similarity measure can be embeddings, categories or creators. It needs a tuned trade-off parameter and is evaluated on both relevance and variety. The hard part is that diversity has a real cost in the immediate metric and a benefit that shows in long-term satisfaction, which is hard to measure.",
    k: ["Greedy marginal-relevance selection vs global optimization: greedy is fast and nearly always good enough; global optimization finds better slates but costs latency and complexity.", "Embedding-based vs attribute-based similarity: embeddings capture what feels similar to users; attributes are transparent and controllable but miss subtle likeness."],
    p: ["Diversity pushes low-scoring items up to satisfy a quota, and the slate trades a lot of relevance for a variety nobody asked for.", "Similarity is measured on attributes only, so ten items from one creator with different tags count as diverse."],
    v: "Compare slates before and after re-ranking and confirm intra-list similarity drops by the intended amount while the relevance metric drops no more than the stated tolerance, then verify in an experiment.",
    dep: ["heavy-ranker", "embedding-tables", "item-metadata-enrichment"]
  },
  "slate-optimization": {
    s: "Choosing the whole ordered list as a unit, accounting for how items interact with each other, rather than sorting each item by an independent score.",
    d: "Items affect each other: a strong item next to a similar one is partly redundant, and a weak item next to a strong one gets less attention. Slate methods model the list jointly, using sequence models that generate or rescore the list, or learn from list-level rewards. They capture context that pointwise scoring misses and can directly optimize a list metric. They are expensive and harder to train, since the space of lists is enormous and logged data covers only the few lists the system actually showed.",
    k: ["List-aware model vs pointwise score plus rules: list-aware captures interactions and can lift quality; pointwise plus rules is simpler, cheaper and easier to debug.", "Generate the list directly vs rescore a fixed candidate set: generating can explore better lists but is hard to constrain; rescoring is safer and fits the existing pipeline."],
    p: ["The model learns an ordering pattern from logged lists that never included alternatives, and its list-level gains vanish online.", "Latency grows with list length and candidate count, and the stage is cut for most traffic, so its benefit is measured on a minority."],
    v: "Compare the list-aware stage against pointwise ranking in an online experiment on a list-level metric, and confirm the improvement holds across list lengths and devices.",
    dep: ["heavy-ranker", "diversity-reranker", "model-inference-runtime"]
  },
  "freshness-boost": {
    s: "Raises the score of recent items so new content reaches users quickly, usually with a decay that fades as the item ages or gains enough data.",
    d: "Ranking models trained on history prefer items with a track record, which starves new ones. A freshness adjustment adds a boost based on item age, strong at first and decaying toward zero, sometimes combined with a quality estimate from content signals. In news and short-lived content, recency is itself a relevance signal and may be the main one. Tuning is delicate: the boost must be big enough to produce a sample of impressions and small enough not to bury items users actually want.",
    k: ["Additive or multiplicative boost vs a learned age feature: a boost is transparent and adjustable by product; an age feature lets the model learn per-surface effects but entangles with exposure bias.", "Same decay for all content vs per-category decay: one decay is simple; per-category decay fits news versus evergreen content but needs tuning and ownership."],
    p: ["Poor-quality new items receive the boost and crowd the slate, because the boost ignores any quality estimate.", "The boost interacts with exploration and double-counts the same effect, so new items are over-served."],
    v: "Publish test items and measure time to first impression and impression count in the first hours against target; confirm older strong items keep their share of top positions.",
    dep: ["value-model", "item-catalog", "new-item-trial-traffic"]
  },
  "exposure-and-fairness-control": {
    s: "Constraints or adjustments that manage how impressions are distributed across items, creators or groups, beyond what predicted relevance would give.",
    d: "Left alone, ranking concentrates exposure on a few popular producers. Controls set minimum exposure for new or small producers, caps for dominant ones, or targets across groups, enforced as constraints during re-ranking or through score adjustments. Goals include ecosystem health, fairness to groups of creators or users, and compliance. Measurement requires logged exposure per producer and group. The hard part is definition: fairness has several incompatible meanings, and each constraint has a cost in relevance that has to be justified and measured.",
    k: ["Hard exposure constraints vs soft score adjustments: hard constraints guarantee the target but can force poor matches; soft adjustments cost less relevance but only nudge.", "Fairness for producers vs for users: producer-side targets help supply but may reduce individual relevance; user-side targets equalize quality but ignore producers."],
    p: ["A group's protected status is not in the data, so the constraint is applied to a noisy proxy and misses the intended group.", "A minimum exposure rule floods users with items from small producers regardless of fit, and engagement drops."],
    v: "Compute exposure shares per producer and group over a week from impression logs and confirm they meet the stated targets, with the relevance cost reported alongside.",
    dep: ["impression-logging", "producer-ecosystem-health", "diversity-reranker"]
  },
  "frequency-caps-and-pacing": {
    s: "Limits how often the same item, creator, topic or message type is shown to a user over a period, and spreads allotted exposure over time.",
    d: "Caps are counters keyed by user and entity with time windows, stored in a fast store and checked during re-ranking or filtering. They prevent repetition fatigue, protect against saturating one source, and apply to campaigns and messages with agreed delivery limits. Pacing distributes a budget of impressions across the day rather than spending it all at once. The difficulty is counting correctly: impressions must be counted when they happen, across devices and surfaces, and the check must be cheap enough for every request.",
    k: ["Hard cap vs score penalty that grows with repetition: caps are predictable and auditable; penalties let a truly strong item return but make the limit fuzzy.", "Count on serve vs count on view: counting on serve is immediate and may overcount unseen items; counting on view is accurate but arrives later and allows overshoot."],
    p: ["Counters are per device, so a user with three devices sees the same promoted item three times as often as intended.", "Counter updates lag, and a burst of requests all pass the check before any is counted."],
    v: "Request recommendations repeatedly as one test user and confirm a capped item stops appearing at the configured count, across surfaces and devices, and returns after the window expires.",
    dep: ["online-user-history-store", "impression-logging"]
  },
  "business-rules": {
    s: "Explicit rules applied to the final list for reasons the model does not know: promotions, partner commitments, safety margins, minimum quality and layout requirements.",
    d: "Rules are expressed as configuration over item and slot attributes: pin an item to position one, require at least one local item, exclude low-margin items from the top, or cap an advertiser's share. They run late so they are the last word, and each rule is logged when it fires. Rules give the business control without retraining and are fast to change. They accumulate: over time conflicting and obsolete rules pile up, and no one can tell which still serve a purpose or how much relevance each costs.",
    k: ["Declarative rule configuration vs code: configuration is auditable and quickly changed by non-engineers; code can express anything but hides intent and needs a deploy.", "Rules as hard constraints vs as score features: constraints are guaranteed; features let the model trade them against relevance and are easier to experiment with."],
    p: ["Two rules conflict, and which one wins depends on evaluation order that nobody documented.", "A promotion rule outlives its campaign and keeps pinning a stale item months later."],
    v: "Log each rule firing with its id; confirm every active rule fires within expected rates, has an owner and an expiry date, and removing a rule in a test arm changes metrics by the amount claimed.",
    dep: ["value-model", "item-catalog"]
  },
  "sponsored-insertion": {
    s: "Places paid or promoted items into the organic list, deciding where they go, how they are labeled and how they compete with unpaid recommendations.",
    d: "Sponsored candidates come from an auction or booking system with bids or commitments. The inserter chooses slots, often at fixed intervals, and scores sponsored and organic items on a comparable basis such as expected value per impression. Items are labeled as required. Relevance floors keep irrelevant ads out. It is hard because it joins two systems with different objectives and owners, because the auction needs calibrated predicted rates, and because too many ads erode the user trust the recommender depends on.",
    k: ["Fixed ad slots vs unified ranking of ads and organic items: fixed slots are predictable and simple; unified ranking can maximize total value but couples revenue logic to organic ranking.", "Strict relevance floor vs revenue-first: a floor protects user experience at some revenue cost; revenue-first earns more short-term and damages engagement over time."],
    p: ["Sponsored items pass through the organic filters inconsistently, so a policy-violating ad appears when the same organic item would have been removed.", "Ad load rises in small steps over many launches and no experiment measures the cumulative effect on retention."],
    v: "Sample slates and confirm every sponsored item is labeled, passes the same policy and availability filters, meets the relevance floor, and that ad share per user stays within the stated limit.",
    dep: ["score-calibration", "policy-and-safety-filter", "business-rules"]
  },
  "random-exploration-slots": {
    s: "A small share of slots filled with randomly or near-randomly chosen eligible items, producing unbiased data about items the model would not otherwise show.",
    d: "A fixed percentage of requests, or specific positions in the list, draw items uniformly or from broad sets instead of from the ranker. The cost is some relevance on those slots; the benefit is training and evaluation data with known sampling probabilities, which corrects selection bias and lets new items collect feedback. It is easy to implement and easy to reason about. The hard parts are sizing: too little yields too few samples to matter, too much visibly hurts the product, and the traffic must be logged with its sampling probability or the benefit is lost.",
    k: ["Uniform random vs random within a plausible set: uniform gives clean unbiased data but shows poor items; a restricted set costs less relevance but gives a narrower picture.", "A fixed slot vs a random subset of requests: a fixed slot is simple to analyze; sampling requests gives every position unbiased data but adds more variance for users."],
    p: ["Exploration traffic is not tagged, and its low click rate is mistaken for model degradation.", "The random pool includes items that would normally be filtered, which leaks unsafe items through the exploration path."],
    v: "Confirm exploration impressions carry a flag and sampling probability in logs, that their share matches the configured rate, and that all exploration items pass the same filters as organic ones.",
    dep: ["propensity-logging", "exploration-budget", "seen-item-filter", "policy-and-safety-filter"]
  },
  "bandit-policy": {
    s: "A decision rule that chooses among items using both estimated reward and uncertainty, trading off showing the best-known item against learning about uncertain ones.",
    d: "Contextual bandit policies, such as upper-confidence methods or posterior sampling, pick items by sampling from the estimated reward distribution or by adding a bonus proportional to uncertainty. As an item gains impressions its uncertainty shrinks and it is chosen by estimated value alone. They give principled, adaptive exploration with little manual tuning. They require a model that produces usable uncertainty and updates quickly. The hard part is delayed and sparse rewards: if conversions arrive days later, the policy acts on stale beliefs.",
    k: ["Posterior sampling vs upper-confidence bonus: sampling is simple and performs well in practice; confidence bounds are deterministic and analyzable but need careful scaling.", "Per-item independent estimates vs a shared model with uncertainty: independent estimates are simple and fit small catalogs; shared models generalize to new items but have harder uncertainty estimates."],
    p: ["Reward feedback arrives late, so the policy keeps exploring items it has already effectively learned about.", "Uncertainty from the model is overconfident, so exploration never triggers and the policy behaves like greedy ranking."],
    v: "Simulate on a replay with known item rewards and confirm cumulative regret is below that of greedy and random baselines, then verify online that new items reach a target number of impressions.",
    dep: ["uncertainty-estimation", "heavy-ranker", "propensity-logging"]
  },
  "uncertainty-estimation": {
    s: "Producing a measure of how unsure a model is about a prediction, so the system can tell items it knows well from items it is guessing about.",
    d: "Methods include ensembles of models, dropout at inference, explicit variance outputs and counts of how much data an item or segment has. The estimate drives exploration bonuses and flags low-confidence predictions for fallback behavior. Serving cost rises with ensemble size, so approximations such as shared lower layers with several heads are common. The difficulty is calibration: uncertainty that is not honest produces either wasteful exploration or none at all, and it must be checked against how often predictions turn out wrong.",
    k: ["Ensemble vs single-model approximations: ensembles give reliable estimates at several times the cost; approximations are cheap but tend to be overconfident outside the training distribution.", "Model-based uncertainty vs count-based: counts are simple and robust for items with little data; model-based estimates also reflect how unusual the features are."],
    p: ["The model reports low uncertainty for new items because their features resemble popular ones, and they are never explored.", "The ensemble members share the same data and errors, so they agree and understate the real uncertainty."],
    v: "Bucket predictions by estimated uncertainty and confirm observed prediction error grows monotonically across buckets, including for items and users with little history.",
    dep: ["heavy-ranker", "training-pipeline"]
  },
  "exploration-budget": {
    s: "The cap on how much relevance the system will spend on exploration, set per surface and user group, and enforced so the learning does not hurt the product.",
    d: "Exploration has a cost in short-term metrics. The budget states the allowed share of impressions or loss of expected value, and is shared among exploration mechanisms such as random slots, bandits and new-item traffic. It may be higher for new users and new surfaces and lower for loyal heavy users. Enforcement uses counters and per-request decisions. Hard parts are choosing the level, which has no clean answer, and accounting across mechanisms so they do not each take the full amount and sum to far more than intended.",
    k: ["A fixed percentage vs a loss-based budget: a percentage is easy to explain and operate; a loss budget bounds the harm but needs expected-value estimates for each exploratory choice.", "Uniform across users vs adaptive by user value: uniform is fair and simple; adaptive spares valuable users but biases the exploration data toward less engaged ones."],
    p: ["Each exploration mechanism is configured by a different team, and the combined share is several times the intended amount.", "The budget is cut during a bad quarter and never restored, so the system slowly stops learning about new content."],
    v: "Sum exploration impressions across all mechanisms from logs per surface and confirm the total is within the budget, and that the measured relevance cost is reported with the effect on new-item discovery.",
    dep: ["random-exploration-slots", "bandit-policy", "impression-logging"]
  },
  "propensity-logging": {
    s: "Recording, for every shown item, the probability with which the policy chose it, so later analysis can correct for what the system decided to display.",
    d: "When the policy is stochastic, as with sampling or bandits, the probability of each choice is logged beside the impression, together with the policy version and context. Counterfactual estimators, inverse-propensity weighting and unbiased training depend on these numbers being correct. For deterministic ranking, propensities are approximated by modeling exposure. Hard parts include logging the probability of the whole slate rather than a single item, keeping it consistent after post-processing filters change the outcome, and storing it at no meaningful latency cost.",
    k: ["Log exact probabilities vs estimate afterwards: exact logging is correct and cheap if designed in; estimates can be applied to old data but introduce modeling error.", "Item-level vs slate-level propensity: item-level is simple and usable for pointwise methods; slate-level is correct for list effects but exponentially harder to compute."],
    p: ["Filters and re-ranking run after the sampling step, so the logged probability no longer describes the final list.", "A policy change ships without updating the logged propensity logic, and every estimate on the new data is biased."],
    v: "Sum logged propensities over the candidates of sampled requests and confirm they are consistent with a valid distribution, and that reweighted outcomes recover the observed average reward.",
    dep: ["impression-logging", "event-schema-and-contracts"]
  },
  "new-item-trial-traffic": {
    s: "A guaranteed small allocation of impressions to each new item so the system gathers enough feedback to judge it before deciding how widely to show it.",
    d: "On creation, an item enters a trial stage in which it is shown to a sample of users likely to be interested, based on content similarity or creator audience, until it collects a minimum number of impressions. Its measured results then feed ranking features and move it into normal competition or out of it. The trial stage may be staged by increasing audience sizes. The difficulty is statistical: a few early impressions give noisy results, and the sample of users chosen strongly biases what the item appears to be worth.",
    k: ["Targeted trial audience vs random audience: targeted is efficient and better for good items; random is unbiased but wastes impressions on poor matches.", "Fixed impression minimum vs sequential stopping: a fixed minimum is simple; sequential rules end early for clear winners or losers and save traffic, at higher complexity."],
    p: ["Items first shown to a highly engaged audience look better than they are and get over-promoted.", "Trial traffic is spent on spam or low-quality items because quality screening runs after the allocation."],
    v: "Publish a batch of test items and confirm each reaches the minimum trial impressions within the stated time, that screened items receive none, and that outcomes feed the item's features.",
    dep: ["new-item-handling", "exploration-budget", "policy-and-safety-filter"]
  }
});
