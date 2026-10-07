// Details for the recommender system plate, part 1: product surfaces, experiments, candidate generation.
ATLAS.details("recommender-system", {
  "home-feed-slots": {
    s: "The main ranked list or set of shelves a user lands on, where the system fills each slot with the best item it can find for that person at that moment.",
    d: "The surface sends a request with user identity, device, page, time and the number of slots to fill. The recommender returns an ordered list with item ids, scores for logging and a request id that ties later clicks back to what was shown. Layouts matter: a grid, a carousel and an infinite scroll have different position effects and different needs for batching. The hard part is that the surface owns the display contract while the models own relevance, and both change independently.",
    k: ["Server-composed layout vs client-composed layout: server composition keeps ranking and slot rules in one place; client composition adapts to screen size but spreads logic and complicates logging.", "One flat list vs themed shelves: shelves give users context and variety, but each shelf is a separate pipeline to run and measure."],
    p: ["The client truncates the returned list but logs all of it as shown, so impressions are overstated and training learns that unseen items were ignored.", "Pagination calls re-run the pipeline with changed state, so items repeat or vanish between pages."],
    v: "Load the surface, scroll to the end, and confirm every displayed item appears exactly once in impression logs with its request id and position, and no logged impression lacks a rendered item.",
    dep: ["request-orchestrator", "impression-logging"]
  },
  "similar-items-module": {
    s: "A shelf shown next to a specific item, such as \"more like this\" or \"frequently bought together\", driven by the item itself rather than only by the user.",
    d: "The request carries an anchor item and usually a user. Candidates come from item-to-item sources: co-occurrence statistics, embedding neighbors or shared metadata. Because the anchor strongly constrains the result, user-level ranking is applied lightly, mostly to order and filter. The module must distinguish substitutes (a different item that serves the same need) from complements (an item used with the anchor), since each is useful in different contexts and a mix of the two reads as noise.",
    k: ["Substitute vs complement targeting: substitutes help comparison shopping, complements raise basket size, and a single list serving both usually serves neither well.", "Precomputed neighbor lists vs live retrieval: precomputed lists are cheap and fast but stale and unpersonalized; live retrieval costs latency and can use session context."],
    p: ["The anchor's own variants (sizes, editions, reposts) fill the shelf, so every slot is the same item in different clothes.", "Neighbor lists built before an item went out of stock keep recommending it."],
    v: "Open ten anchor items from different categories and confirm the shelf contains no variant of the anchor, no unavailable item, and a defensible relation to the anchor that a reviewer can name.",
    dep: ["item-to-item-co-occurrence", "two-tower-retrieval", "availability-filter"]
  },
  "query-and-search-surface": {
    s: "Surfaces where the user supplies intent, such as a query, a category or a seed, and the recommender personalizes or reorders results within that intent.",
    d: "Here the intent signal is explicit, so retrieval is constrained by the query and the recommender's job shifts to ordering and to filling gaps for vague queries. Personalization signals are blended with query relevance rather than replacing it. Typeahead, browse-by-category and \"you might also search\" modules all share the pattern. The difficulty is deciding how much weight personal history deserves when the person just stated something specific, and keeping latency within search expectations.",
    k: ["Relevance first, personalization as tie-breaker vs a joint model over both: the first is predictable and debuggable; the second can learn the tradeoff but is harder to explain when results look wrong.", "Share one ranker with the feed vs separate rankers: sharing saves effort but the objectives differ, since search users measure success by finding the thing."],
    p: ["Strong history overrides the query, so a gift search shows items for the buyer instead of the recipient.", "Vague or empty queries get fed through a ranker trained only on specific ones and return generic results."],
    v: "Issue a set of queries with known correct answers under two users with opposite histories and confirm the query-matching item stays in the top results for both, with only the secondary order changing.",
    dep: ["heavy-ranker", "ranking-feature-assembly", "request-orchestrator"]
  },
  "notification-and-email-picks": {
    s: "Recommendations delivered outside the product session through push, email or messages, where the system chooses both what to send and whether to send at all.",
    d: "These are generated in batch or triggered by events, ahead of the moment the user sees them. The pipeline picks candidates, ranks them, and then decides send time, channel and volume, since sending too much harms every future message. Content may be stale by open time, so availability is checked again at send and sometimes at click. The central difficulty is that opening a message is a weak proxy for value, and unsubscribes and disabled notifications are a delayed, costly signal.",
    k: ["Optimize opens vs optimize downstream value: opens are plentiful and fast but reward curiosity-bait; downstream value is slower and sparser but matches what the business wants.", "Fixed schedule vs per-user send-time model: a schedule is simple and predictable; a model lifts engagement but needs careful guards on volume."],
    p: ["A recipient gets recommendations for an item they bought an hour ago because the batch snapshot predates the purchase.", "Volume optimization raises short-term clicks while opt-out rates climb unnoticed until the channel is unusable."],
    v: "Send a test batch to seeded accounts and confirm every item is still available at send time, none is already purchased, per-user frequency caps hold, and opt-outs are respected.",
    dep: ["frequency-caps-and-pacing", "availability-filter", "user-preference-filter"]
  },
  "reasons-and-explanations": {
    s: "Short labels telling the user why an item is shown, such as \"because you watched X\", derived from the signal that actually produced the recommendation.",
    d: "Explanations work only when they are true. The source that retrieved or ranked the item records its reason (a seed item, a followed creator, a trending topic), and the surface renders the strongest reason that passes policy checks. Explanations raise trust and click-through, and they let users correct the system by removing the seed behind a bad suggestion. They are hard because modern ranking models are not additive, so the displayed reason is often the retrieval source rather than the real driver.",
    k: ["Source-attributed reasons vs model-derived attributions: source reasons are cheap and honest about retrieval but ignore what the ranker did; attributions are richer but costly and can mislead.", "Specific reasons vs generic ones: specific reasons are more convincing but can expose sensitive history on shared screens."],
    p: ["A reason cites an item the user has since deleted from history, and the explanation contradicts the account page.", "A sensitive inference, such as a health topic, appears as a reason on a shared device."],
    v: "For a sample of recommendations, trace each displayed reason back to the logged retrieval source and seed item, and confirm the seed exists in that user's history and is not marked sensitive or removed.",
    dep: ["candidate-merging", "user-profile-store", "policy-and-safety-filter"]
  },
  "user-controls-and-feedback": {
    s: "Explicit controls such as like, dislike, not interested, hide and mute, which give the user direct influence and give the system labeled preference signals.",
    d: "Explicit feedback is rare compared with clicks but far less ambiguous. It feeds three paths at once: an immediate filter (hide this item or creator now), a feature or label for models, and a session-level adjustment. Controls need clear scope so users know what they affect. The hard part is semantics: \"not interested\" can mean not this item, not this topic or not now, and the system must treat each differently and apply it fast enough that the next refresh visibly honors the action.",
    k: ["Immediate rule-based effect vs model-only learning: rules honor the click instantly and predictably but are blunt; models generalize but may show the same thing again, which users read as being ignored.", "Few simple controls vs many fine-grained ones: simple controls get used; fine-grained ones give cleaner labels but few people touch them."],
    p: ["The dislike is logged but takes a day to reach the online store, so the disliked item reappears on the next refresh.", "Negative feedback is treated as a weak positive because it followed an impression and a dwell, and training learns to show more of it."],
    v: "Mark an item not interested and refresh: confirm it is gone within seconds, similar items from that source drop in rank, and the event appears as an explicit negative label in the training data.",
    dep: ["user-preference-filter", "interaction-events", "online-user-history-store"]
  },
  "experiment-assignment": {
    s: "The service that deterministically assigns each user or request to an experiment arm, so the same unit always sees the same variant and arms are balanced.",
    d: "Assignment hashes a stable unit id with an experiment-specific salt into buckets, so no lookup is needed and assignments stay consistent across servers. Layers or domains keep overlapping experiments from interfering, and exposure is logged at the moment the variant actually affects what is shown. Choice of unit (user, device, session, item) determines which effects can be measured. The hard parts are keeping assignments stable across logged-in and logged-out states, and logging exposure only for users who really reached the changed code path.",
    k: ["User-level vs request-level randomization: user-level shows consistent behavior and captures learning effects but needs more traffic; request-level is fast and powerful but mixes experiences for one person.", "Hash-based assignment vs stored assignment: hashing is stateless and fast; stored assignments allow ramping and sticky exclusion at the cost of a lookup and a table to maintain."],
    p: ["A salt reused across experiments correlates their assignments, so one experiment's effect leaks into another's arms.", "Users who never reach the changed surface are counted in the analysis and dilute the measured effect toward zero."],
    v: "Assign a large synthetic id set and confirm arm sizes match the configured split, the same id gets the same arm across servers and restarts, and two experiments' assignments are statistically independent.",
    dep: ["identity-resolution"]
  },
  "holdout-and-baseline": {
    s: "A group of users kept on an older or simpler recommender for a long period, so cumulative change can be measured against a fixed reference.",
    d: "Short A/B tests measure one change at a time. A long-running holdout, often a few percent of users kept on a frozen or minimally personalized system, measures what all the changes together are worth and catches slow decay that no single test shows. It also provides a clean population for evaluating the effect of recommendation itself. Holdouts cost real revenue and engagement, which is why they need an owner and a budget. They are hard because the frozen system's dependencies must keep working while everything around them evolves.",
    k: ["Frozen model vs non-personalized baseline: a frozen model shows the value of recent work; a popularity baseline shows the value of personalization at all, and each answers a different question.", "Small permanent holdout vs rotating holdouts: permanent holdouts give clean long-term reads but hurt the same users; rotation spreads the cost but resets what you can measure."],
    p: ["The frozen model depends on a feature table that was later retired, and the holdout silently degrades into a worse system than intended.", "Holdout users receive other product changes, so the comparison measures much more than the recommender."],
    v: "Compare holdout and main-population metrics over the last quarter and confirm the gap is stable and explained, and that holdout users still receive the exact frozen configuration, verified from logged model versions.",
    dep: ["experiment-assignment", "model-registry"]
  },
  "metric-definitions": {
    s: "The agreed definitions of success measures such as click-through, engaged time, conversion and retention, computed the same way in every experiment and dashboard.",
    d: "A metric is a query over logged events with a unit, a time window and an exposure rule, plus a variance estimate for significance testing. Central definitions prevent each team from reporting its own version of \"engagement\". Metrics are layered: immediate proxies (clicks), session metrics (time, depth), and long-horizon outcomes (return rate, revenue). The central difficulty is that easily moved metrics are weak proxies for what the product wants, and optimizing a proxy hard enough separates it from the goal.",
    k: ["Fast proxy metrics vs slow outcome metrics: proxies resolve experiments in days but can be gamed; outcome metrics are truthful but take weeks and have wide error bars.", "Ratio of sums vs mean of per-user ratios: the first weights heavy users more; the second weights users equally; they can disagree in sign and need a stated choice."],
    p: ["Two dashboards compute click-through with different denominators and teams argue over a difference that is purely definitional.", "A metric rises after a logging change that double-counts impressions rather than after any user behavior change."],
    v: "Recompute a headline metric from raw events with an independent query for one day and confirm it equals the dashboard value, and that its definition document states unit, window and exposure rule.",
    dep: ["interaction-events", "impression-logging"]
  },
  "guardrail-metrics": {
    s: "Metrics that must not get worse, such as latency, complaints, unsubscribes, content quality and creator reach, checked alongside the target metric in every experiment.",
    d: "A change that raises clicks by showing sensational or low-quality items passes the target metric and fails the product. Guardrails encode what the team refuses to trade away. Each has a threshold and a test direction, and a launch decision requires the target to improve with no guardrail breached. Some guardrails are hard rules, such as latency over budget, while others are judgment calls. They are hard to get right because guardrails move slowly and noisily, and teams under pressure treat a small breach as noise.",
    k: ["Hard threshold vs trade-off review: thresholds are unambiguous and fast; reviews allow sensible exceptions but invite negotiation every time.", "Few guardrails vs many: few keep decisions clear; many catch more harm but raise the false-alarm rate when every test is checked against dozens of metrics."],
    p: ["A guardrail is measured over too short a window, so a slow-building harm such as rising unsubscribes shows up only after launch.", "Multiple comparisons across many guardrails produce a false breach that blocks good changes, and people learn to ignore the alerts."],
    v: "Run a deliberately harmful variant, for example one that promotes low-quality items, in a test and confirm the guardrail dashboard flags it and the launch checklist refuses to pass.",
    dep: ["metric-definitions", "experiment-assignment"]
  },
  "interleaving": {
    s: "An evaluation technique that mixes results from two rankers in one list and credits whichever ranker's items users choose, detecting preferences with far less traffic.",
    d: "Instead of splitting users between rankers, interleaving shows each user a combined list built by alternating or sampling from the two rankings, tracking which ranker contributed each item. A click credits its contributor. Because every user compares both rankers directly, sensitivity is much higher than a standard split test, so it suits quick screening of ranker changes. It cannot measure effects that depend on the whole experience, such as session length or retention, and it needs rankers that produce comparable lists.",
    k: ["Interleaving vs full A/B split: interleaving needs a fraction of the traffic and finds small ranking differences; it cannot see long-term, whole-page or business-level outcomes.", "Team-draft vs probabilistic interleaving: team-draft is simple and fair; probabilistic variants support counterfactual reuse of the logs but are harder to implement correctly."],
    p: ["Duplicated items between the two rankers get credited to neither or both, which biases the verdict toward the ranker listed first.", "A winner in interleaving loses in a full A/B test because it optimized clicks at the expense of satisfaction."],
    v: "Run interleaving between a model and itself and confirm the preference rate is near 50 percent; then between a model and a deliberately degraded copy and confirm it detects the degraded one.",
    dep: ["experiment-assignment", "metric-definitions"]
  },
  "long-term-effects": {
    s: "Methods for measuring what a recommendation change does to behavior weeks or months later, beyond the immediate clicks an ordinary experiment captures.",
    d: "Many important effects are slow: user habits form, tastes narrow, novelty wears off, and creators respond. Approaches include long experiments with holdbacks, surrogate metrics learned to predict long-term outcomes from short-term signals, and cohort comparisons after a ramp. Results are noisy and arrive late, so they are used to calibrate the faster proxies rather than to drive every decision. The difficulty is that user behavior changes under a long test for reasons outside the recommender, and the treated and control groups drift apart through many small sources.",
    k: ["Run experiments long vs predict long-term from surrogates: long runs are direct but slow and costly; surrogates are fast but only as good as their last validation.", "Ramp then hold back a small control vs measure only at launch: a persistent control reveals decay and novelty effects at a small ongoing cost."],
    p: ["A novelty effect makes a new feed look strong in week one, and the launch decision is made before the gain fades.", "A surrogate trained on old experiments stops predicting retention after the product changes, and nobody notices until a bad launch."],
    v: "For a past launch, compare the week-one effect with the effect at week eight from its holdback group, and confirm the surrogate metric predicted the eight-week sign and approximate size.",
    dep: ["holdout-and-baseline", "metric-definitions"]
  },
  "interference-handling": {
    s: "Design choices for experiments where users or items affect each other, such as shared inventory, social links or two-sided markets, which breaks the usual assumption of independent units.",
    d: "Standard A/B analysis assumes one user's arm does not change another's outcome. Recommenders violate this: a better ranker for treated users uses up limited inventory or creator attention, so control users see a worse market, and the measured gap is wrong. Remedies include randomizing by cluster, by region or by time, and budget-split designs where treatment and control draw from separate supply. They trade statistical power for validity, and the right choice depends on which interaction dominates.",
    k: ["User-level randomization vs cluster or market-level: user-level has far more power but is biased under interference; clusters are valid but give few units and wide intervals.", "Time-switching vs parallel arms: switching removes shared-supply interference but confounds with time-of-day and day-of-week effects."],
    p: ["Treatment users buy scarce items first, so control looks worse than it would be without the experiment, and the launch effect is overestimated.", "Clusters chosen by social links still leak across edges, giving a false sense of having handled the interference."],
    v: "Run the same change as a user-level test and a market-level test and compare the estimated effects; confirm the gap is explained by measured shared-supply or network exposure rather than random noise.",
    dep: ["experiment-assignment", "metric-definitions"]
  },
  "collaborative-filtering-retrieval": {
    s: "Finds candidates by looking at what similar users engaged with, using the pattern of the interaction matrix rather than any information about the items themselves.",
    d: "The classic form factors a sparse user-item interaction matrix into low-dimensional vectors, so that a dot product predicts affinity, and neighborhood methods find users or items with overlapping histories. It works with no content understanding and finds surprising, taste-based connections. It needs enough interactions per user and item to be reliable and ignores everything outside the matrix. Hard parts include implicit feedback, where the absence of interaction is not dislike, weighting popular items down, and keeping the factors current as the matrix changes daily.",
    k: ["Matrix factorization vs neighborhood methods: factorization generalizes across sparse data and serves fast; neighborhoods are simple and explainable but cost memory and degrade with sparsity.", "Implicit confidence weighting vs treating all observations equally: weighting handles the uncertainty in unobserved items but adds hyperparameters that interact with item popularity."],
    p: ["Popular items dominate every neighborhood, so users receive the same blockbuster list.", "Items with a handful of interactions get extreme factor values and surface everywhere for a few hours before settling."],
    v: "Hold out each user's most recent interactions, retrieve 500 candidates from earlier history, and confirm recall at 500 beats the popularity baseline by a stated margin across user activity levels.",
    dep: ["training-pipeline", "interaction-events", "ann-index"]
  },
  "two-tower-retrieval": {
    s: "A learned retrieval model with separate user and item encoders that produce vectors in a shared space, so the best items for a user are the nearest neighbors of the user vector.",
    d: "The user tower encodes history and context at request time (or from a cached state); the item tower encodes item features offline into vectors stored in an index. Training maximizes the score of observed pairs against sampled negatives. Because the towers do not interact until a dot product, items can be pre-embedded and searched in milliseconds. The cost is expressiveness: no feature crossing between user and item. Hard parts are choosing negatives that reflect what the system could actually show and keeping both towers consistent with the deployed index version.",
    k: ["Two-tower vs full cross model for retrieval: two-tower is searchable at scale but limited in interactions; full models are accurate but only affordable for ranking.", "In-batch negatives vs mined hard negatives: in-batch is cheap and popularity-biased; hard negatives sharpen the boundary but can include real positives that were never shown."],
    p: ["The user tower is updated but the item index is not rebuilt, so the two live in incompatible vector spaces and recall collapses.", "Training only on clicked items trains the model to recommend what was already shown, narrowing retrieval."],
    v: "After each deployment, confirm tower and index share a version tag, retrieve for a labeled user set, and verify recall at a fixed cutoff matches the offline number within a small tolerance.",
    dep: ["ann-index", "embedding-pretraining", "negative-sampling", "online-feature-store"]
  },
  "ann-index": {
    s: "The vector index that finds the nearest items to a query vector in milliseconds by accepting a small, controlled loss of accuracy compared with exact search.",
    d: "Exact nearest-neighbor search over millions of vectors is too slow, so indexes use graph navigation, space partitioning with quantization, or hashing to examine a small fraction of the vectors. Parameters trade recall against latency and memory. The index is rebuilt or incrementally updated as items change, and filters (region, availability) are applied during or after search. The hard part is filtered search: strict filters applied after the search can leave too few results, while filtering during traversal can hurt recall and speed.",
    k: ["Graph index vs quantized partition index: graphs give high recall at low latency but use more memory and update awkwardly; quantized partitions compress well and scale but lose some accuracy.", "Pre-filtering vs post-filtering: pre-filtering returns the right count under strict rules but is complex; post-filtering is simple but can return fewer results than requested."],
    p: ["A tight filter leaves five candidates out of the requested five hundred because the search only examined the nearest thousand overall.", "Index rebuilds finish after the new model is live, so queries run against vectors produced by the previous model."],
    v: "Compare index results with brute-force search on a sampled query set and confirm recall at the serving cutoff meets target at the p99 latency, including queries with the strictest filters.",
    dep: ["item-catalog", "embedding-tables"]
  },
  "item-to-item-co-occurrence": {
    s: "Candidates found by counting which items are consumed together by the same users or sessions, then recommending the strongest associates of what the user just touched.",
    d: "Counts of pairs from sessions, baskets or histories are normalized, since popular items co-occur with everything. Common normalizations include cosine, lift and probabilistic variants. Results are precomputed as a neighbor list per item, which makes retrieval a key-value lookup keyed by the user's recent items, with extremely low latency. It needs no model serving and is easy to explain. It is hard to scale pair counts across large catalogs, and the neighbor lists see only popular items well.",
    k: ["Raw counts vs normalized association: raw counts favor popular items; normalization surfaces more specific relations but amplifies noise for rarely seen pairs.", "Session windows vs full-history windows: sessions capture current intent; full history captures stable taste but dilutes the signal of what the user wants now."],
    p: ["A single power user or bot who touched thousands of items creates millions of spurious pairs that pollute neighbor lists.", "Neighbor lists are never refreshed for seasonal items, so last winter's associates are offered in summer."],
    v: "Inspect the top neighbors for twenty sampled items from head and tail, confirm a reviewer can explain most relations, and confirm no neighbor list is older than the stated refresh interval.",
    dep: ["interaction-events", "bot-and-spam-filtering", "item-catalog"]
  },
  "content-based-retrieval": {
    s: "Candidates selected by matching item attributes, text, images or audio to a profile of what the user has liked, independent of what other users did.",
    d: "Items are described by metadata and learned content embeddings; the user is represented by an aggregate of liked items or by explicit topics. Retrieval finds items near that profile. It works for new items with no interactions and for users with unusual taste, and it is easy to explain. It tends to over-specialize into more of the same, and its quality depends on how well content features capture what users actually care about, which is often not the visible topic.",
    k: ["Content similarity vs behavioral similarity: content works at cold start and is explainable; behavior captures taste that content cannot describe, so most systems use both.", "Hand-built attributes vs learned content embeddings: hand-built are controllable and auditable; learned ones capture more but need monitoring for drift and bias."],
    p: ["Items that look alike but differ in quality, such as a careful review and a copied one, are indistinguishable by content features.", "A profile averaged over very different interests lands in the middle of the space and matches nothing the user actually likes."],
    v: "For brand-new items with no interactions, confirm they appear in retrieval for users whose history matches their attributes, and measure the click rate on those slots against a random-eligible baseline.",
    dep: ["item-metadata-enrichment", "ann-index", "user-profile-store"]
  },
  "sequence-retrieval": {
    s: "Retrieval driven by the order of a user's recent actions, predicting the next item from the sequence rather than from a static profile.",
    d: "A sequence model reads the last tens or hundreds of interactions, with time gaps and action types, and outputs a vector or next-item distribution that drives retrieval. It captures intent that shifts within a session and patterns such as a series being watched in order. Costs are real: long sequences make the user encoder expensive, so teams cache encoded state or truncate. The hard part is balancing recency against stable taste, and not letting a single accidental click redirect the whole session.",
    k: ["Short recent window vs long history: short windows track intent and are cheap; long histories capture stable taste at larger compute and storage cost.", "Encode at request time vs update state incrementally: request-time encoding is simple but adds latency; incremental state is fast but must be kept consistent with the training logic."],
    p: ["One accidental click on an unrelated item shifts retrieval for the rest of the session.", "The online sequence includes items the user did not choose, such as autoplayed ones, so the model learns its own output as intent."],
    v: "Replay recorded sessions step by step and confirm next-item hit rate at each step beats the static-profile retriever, and that results change sensibly when a single click is removed from the sequence.",
    dep: ["online-user-history-store", "session-state", "ann-index", "training-pipeline"]
  },
  "graph-retrieval": {
    s: "Candidates found by walking a graph of users, items, creators and follows, so that connections such as \"followed by people you follow\" propose relevant items.",
    d: "Nodes are users, items and creators; edges are follows, interactions and shared attributes. Retrieval uses random walks, neighborhood expansion or learned graph embeddings starting from the requesting user. It excels where relationships carry the signal, as in social products, and surfaces items several steps away. Precomputing walks or embeddings keeps serving fast. The hard parts are hubs with enormous degree that dominate every walk, graph updates arriving continuously, and privacy: a recommendation can reveal a relationship the user did not know was visible.",
    k: ["Walk-based expansion vs learned graph embeddings: walks are simple and fresh; embeddings compress multi-hop structure and serve faster but lag behind graph changes.", "Social-graph signal vs interest signal: social signals are timely and trusted but concentrate on celebrities and can expose private connections."],
    p: ["Accounts with millions of followers sit on most paths, so every user receives the same celebrity recommendations.", "A suggestion reveals that two people are connected through a private relationship, which causes real harm."],
    v: "Sample users and confirm each graph-sourced candidate has a traceable path, that no hub item exceeds a stated share of results, and that private edges never contribute to another user's candidates.",
    dep: ["identity-resolution", "consent-and-data-controls", "embedding-tables"]
  },
  "trending-and-popular-sources": {
    s: "Candidates chosen by recent aggregate popularity, globally or within a region, category or cohort, giving a strong baseline and a source of fresh items.",
    d: "Counts of recent engagement per item, often with time decay, are computed in streaming windows and ranked, sometimes by growth rate rather than raw volume to catch rising items. Segmenting by locale, language or category makes the list far more relevant than a single global one. Popularity candidates are cheap, always available and a basis for fallbacks. Over-reliance feeds the loop where popular items get more exposure and so more clicks, which is why this source usually has a capped share of the slate.",
    k: ["Raw volume vs growth rate: volume is stable and favors established items; growth finds new hits earlier but is noisy for small counts.", "Global list vs segmented lists: segments are more relevant but need enough traffic per segment and a rule for choosing which one applies."],
    p: ["A burst of bot traffic pushes junk items to the top of the trending list for every user at once.", "Decay constants tuned for one season or product launch make the list stale or jittery in another."],
    v: "Compare the trending list to an independent count from raw logs for the same window, confirm bot-filtered traffic is excluded, and confirm each segment has the minimum volume required.",
    dep: ["windowed-counters", "bot-and-spam-filtering"]
  },
  "candidate-merging": {
    s: "Combines the lists from all retrieval sources into one deduplicated candidate set, with per-source quotas and a record of where each candidate came from.",
    d: "Each source returns items with its own score, and those scores are not comparable. The merger deduplicates, applies source quotas or priority rules, and tags each item with its sources so later stages can use them as features and logs can attribute outcomes. Quotas protect smaller sources, such as exploration or fresh content, from being crowded out by a high-scoring dominant one. It is a small component with outsized influence, since anything it drops can never be recommended downstream.",
    k: ["Fixed quotas per source vs a learned merge: quotas are predictable and protect minority sources; a learned merge adapts to context but is harder to reason about and debug.", "Union of everything vs a size cap: a larger set raises recall but increases ranking cost linearly and can breach the latency budget."],
    p: ["One source returns near-identical lists for many users, and its quota is full of the same items.", "Dropped candidates are not logged, so a missing item cannot be diagnosed as a retrieval miss or a merge cut."],
    v: "For a sampled request, confirm every candidate in the ranked list carries its source tags, the merged size respects the cap, and replaying the request shows which source provided any given item.",
    dep: ["collaborative-filtering-retrieval", "two-tower-retrieval", "item-to-item-co-occurrence", "trending-and-popular-sources"]
  },

  "objective-choice": {
    s: "The decision about what the system is trying to maximize, such as clicks, watch time, purchases or long-term satisfaction, which every model, metric and experiment inherits.",
    d: "The objective is rarely one number. Click probability, dwell, purchase, share and satisfaction survey results all point in different directions, and the value model blends them with weights. Each choice shapes what content wins: optimizing clicks rewards sensational titles, optimizing time rewards length. The objective also defines the training labels and the experiment success metric, so changing it later means changing the whole stack. The hard part is that the measurable objective is always a proxy for the one the business actually holds.",
    k: ["Single proxy vs weighted blend: a single proxy is clear and easy to optimize but gameable; a blend balances goals but its weights become a political and hard-to-justify set of numbers.", "Short-term engagement vs long-term value: short-term is measurable now; long-term is correct but slow, noisy and hard to attribute."],
    p: ["Optimizing a proxy long enough decouples it from the goal, and metrics rise while user satisfaction falls.", "Weights tuned once and never revisited drift out of alignment as the product and its users change."],
    v: "Periodically survey a sample of users on satisfaction and confirm it moves in the same direction as the optimized metric over the last several launches; flag any launch where they diverged.",
    dep: ["value-model", "metric-definitions", "label-construction"]
  },
  "selection-bias": {
    s: "The fact that the system logs only what it chose to show, so the data records the system's own decisions and positions, not unbiased user preference.",
    d: "Users cannot click on items they were never shown, and they click more at the top of a list. Training on these logs teaches the model to repeat its own choices. Corrections include logging propensities, inverse-propensity weighting, position features, randomized exploration traffic and counterfactual evaluation. Each correction adds variance or complexity. The issue touches logging, training, offline evaluation and exploration at once, which is why it is a cross-cutting concern and not a component.",
    k: ["Correct with weights vs gather unbiased data by randomizing: weighting reuses existing logs but explodes in variance; randomization is clean but costs user experience.", "Model position as a feature vs remove it at serving: it separates preference from placement but needs care to set the position feature to a neutral value at inference."],
    p: ["Offline metrics improve because the new model agrees better with the old model's choices, not because it is better.", "Propensities are logged inconsistently with the policy that actually ran, which makes the corrections silently wrong."],
    v: "On a small randomized slice of traffic, compare the offline estimate of a model's value against its measured online value and confirm they agree within the stated error across several models.",
    dep: ["propensity-logging", "position-bias-correction", "counterfactual-estimators", "debiasing-weights"]
  },
  "latency-and-cost-budgets": {
    s: "The limits on how long and how much each stage may spend per request, which decide which models can run, how many candidates are scored and what the system does when it runs late.",
    d: "A response deadline of a few hundred milliseconds is divided among retrieval, feature fetch, ranking and re-ranking, with the heavy model getting the largest share. Candidate count, feature count and model size trade directly against each other. Cost is a second budget: accelerators and feature storage dominate. Budgets are enforced with deadlines and degradations, not just monitored. The hard part is that gains in model quality usually cost latency, so every improvement competes for the same fixed budget.",
    k: ["Strict per-stage deadlines vs one shared end-to-end deadline: per-stage deadlines isolate failures and are easy to debug; a shared deadline lets fast stages donate time but couples every stage's behavior.", "Bigger model on fewer candidates vs smaller model on more: the first sharpens order but risks missing good items; the second raises recall but loses precision."],
    p: ["A slow feature store lookup eats the ranker's time, and the ranker silently scores a truncated candidate list.", "Cost grows with every added feature or tower, and nobody owns the aggregate until the accelerator bill arrives."],
    v: "Load test at peak traffic and confirm p99 end-to-end latency meets the deadline, per-stage timings sum to it, and the degradation path triggers and recovers when a dependency is deliberately slowed.",
    dep: ["latency-budget-enforcer", "request-orchestrator", "capacity-and-autoscaling"]
  },
  "privacy-and-consent": {
    s: "The rules for what data about people the system may collect, store, infer and use for recommendations, including consent, deletion, retention and sensitive categories.",
    d: "Recommenders run on behavior data and often infer traits the user never stated. Consent decides which signals are admissible; deletion requests must reach logs, feature stores, embeddings and trained models; retention limits cap how far back features reach. Sensitive categories need blocks on use as features and on appearing in reasons or segments. Local law and platform rules differ by region. It is hard because data copies multiply across pipelines, and a deletion honored in the primary store may leave the user in a derived table or training set.",
    k: ["Collect broadly and filter later vs collect only consented signals: broad collection is flexible but risks misuse and breach exposure; narrow collection is safer but may weaken some models.", "Retrain to remove deleted users vs delete from stores only: retraining is thorough but expensive and slow; store deletion is immediate but leaves traces in model weights."],
    p: ["A deletion request clears the profile but not the offline feature snapshots, so the user's data persists in training sets.", "An inferred sensitive attribute becomes a feature through a correlated proxy and effectively targets a protected group."],
    v: "Submit a test deletion and trace the user id across every store, log and feature table; confirm no record remains after the stated deadline and that the next training run excludes the user.",
    dep: ["consent-and-data-controls", "user-profile-store", "feature-lineage"]
  },
  "training-serving-consistency": {
    s: "The requirement that every feature and transformation computes the same value when training a model as when serving it, since models fail quietly when the two disagree.",
    d: "Features are computed once in bulk for training and again online for serving, often by different code, with different data freshness. Differences in time handling, null handling, normalization and joins produce skew that offline metrics cannot show. Defenses are shared feature definitions, logging served features and training from those logs, point-in-time joins, and continuous skew monitors. It cuts across feature management, training, serving and evaluation. The cost is discipline: every shortcut that computes something differently online is a future incident.",
    k: ["Train on logged serving features vs recompute offline: logged features guarantee consistency but lock in old definitions and add storage; recomputing allows reuse and backfill but risks skew.", "One shared codebase for both paths vs two optimized paths: sharing prevents divergence but may be slower in one environment; separate paths are faster but need continuous comparison."],
    p: ["A feature uses the current value at training time but the value as of request time at serving, so the model learns from the future.", "A timezone or null-handling difference shifts a feature distribution online, and accuracy drops with no error raised."],
    v: "Log served feature vectors for a sample of requests, recompute them offline for the same instants, and confirm values match within tolerance for every feature; alert on any feature whose mismatch rate rises.",
    dep: ["skew-detection", "point-in-time-joins", "feature-definitions", "online-feature-store"]
  },
  "rollback-and-reproducibility": {
    s: "The ability to return to a known-good model, feature set and configuration quickly, and to reconstruct exactly what a past recommendation was based on.",
    d: "A bad model can lose revenue in minutes, so promoting any model needs a tested path back: versioned models, versioned indexes, versioned feature definitions and configuration that move together. Reproducibility means that for any logged request one can recover the model version, feature values and experiment arm that produced it, which makes both debugging and audit possible. It requires version tags in every log record and immutable artifacts. The hard part is bundles: rolling back a model without its matching index or feature version produces a different, untested system.",
    k: ["Immutable versioned bundles vs mutable components: bundles roll back atomically and are reproducible but consume storage; mutable components save space and cause mismatches.", "Instant flip to the previous model vs gradual ramp-down: an instant flip limits damage but can spike load on cold caches; a ramp is gentler but leaves the bad model live longer."],
    p: ["The rollback restores the previous model but not its feature definitions, which have since changed, so the old model runs on inputs it never saw.", "Request logs omit model and index versions, so nobody can tell which version produced a bad recommendation."],
    v: "Execute a drill: promote a test model, then roll back, and confirm traffic returns to the previous bundle within the stated time and a logged request can be replayed to the same output.",
    dep: ["model-registry", "shadow-and-canary-rollout", "feature-definitions"]
  }
});
