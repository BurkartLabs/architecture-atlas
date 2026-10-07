// Details for the recommender system plate, part 3: serving infrastructure, real-time features, cold start, training.
ATLAS.details("recommender-system", {
  "request-orchestrator": {
    s: "The service that receives a recommendation request and runs the funnel: fan-out to sources, feature fetch, ranking, re-ranking and response, within the deadline.",
    d: "It parses the request, resolves the experiment arm and context, launches retrieval sources in parallel, merges results, calls filters, feature assembly and models in order, and applies post-processing. It tracks the remaining time and passes it to each stage. Each stage is a dependency that can fail or lag, so the orchestrator decides what to skip or substitute. It also writes the request log with the versions and decisions used. The hard part is partial failure: a stage that returns late or incomplete should degrade the result, not fail the request.",
    k: ["Parallel fan-out vs sequential stages: fan-out cuts latency but multiplies load on dependencies; sequential execution is simpler and cheaper but adds stage times together.", "Synchronous pipeline vs precomputed results refreshed in the background: synchronous is fresh and context-aware; precomputing is fast and cheap but stale and blind to the current session."],
    p: ["One slow retrieval source holds every request to its timeout because the orchestrator waits for all of them.", "A retry on a failing dependency multiplies load and turns a minor slowdown into an outage."],
    v: "Inject latency and errors into each dependency in a test environment and confirm the orchestrator still returns a valid slate within the deadline, with the degraded stage recorded in the request log.",
    dep: ["latency-budget-enforcer", "candidate-merging", "ranking-feature-assembly", "fallback-recommendations"]
  },
  "latency-budget-enforcer": {
    s: "Tracks the time left in each request and cuts, shrinks or skips stages when the deadline is at risk, so the response is on time even if less refined.",
    d: "Each stage gets a deadline derived from the end-to-end target. When a source or fetch exceeds its deadline, the enforcer stops waiting and continues with what exists. When time is short it can reduce the candidate count, switch to the lighter model or skip optional re-ranking. Degradations are logged and counted, so the share of degraded requests is a visible metric. The challenge is tuning: deadlines that are too tight make degradation routine, while loose ones let rare slow requests run over the response limit.",
    k: ["Hard cancel at the deadline vs let late results finish for caching: cancel frees resources and bounds load; finishing helps later requests but ties up capacity during overload.", "Graceful quality reduction vs failing the request: reduction keeps users served with a weaker slate; failing is honest but turns slow dependencies into visible errors."],
    p: ["Degradation fires so often at peak that most traffic receives the weaker path, and nobody notices because requests still succeed.", "Cancelled calls are not actually cancelled downstream, so wasted work continues and increases load."],
    v: "Track the percentage of requests that hit each degradation level per hour, and confirm it stays under the alert threshold in normal load and rises predictably when a dependency is slowed in a test.",
    dep: ["request-orchestrator"]
  },
  "recommendation-cache": {
    s: "Stores computed recommendation lists or intermediate results for reuse, trading some freshness for large savings in latency and compute.",
    d: "Caching can occur at several levels: whole slates per user and surface for a short time, candidate lists per user or per anchor item, and item scores or embeddings. Keys include the user or segment, surface, experiment arm and model version, or stale data crosses arms. Time-to-live is chosen by how quickly relevance changes. Caches smooth traffic spikes and protect dependencies. Invalidation is the hard part: a user's own action, a blocked creator or an item going out of stock should alter what is served immediately.",
    k: ["Cache whole slates vs intermediate candidate lists: whole slates are cheapest but frozen to the moment; candidate caching still reranks with fresh context at some compute cost.", "Short TTL vs event-driven invalidation: a short TTL is simple and bounded in staleness; event invalidation is fresher but requires reliable events and more machinery."],
    p: ["The key omits the experiment arm, so users in one arm get responses computed by the other and the experiment is contaminated.", "A cached list continues to include an item the user just blocked, because the cache was not invalidated by the action."],
    v: "Block an item as a test user and confirm it disappears from the very next response, and compare cache hit rate and latency before and after, with keys verified to include arm and model version.",
    dep: ["request-orchestrator", "user-preference-filter"]
  },
  "fallback-recommendations": {
    s: "Precomputed, always-available lists, such as popular or editorially chosen items, returned when the normal pipeline fails or is too slow.",
    d: "Fallbacks are built offline per region, language and surface, stored where they can be read with minimal dependencies, and refreshed on a schedule. They are used when personalization is unavailable, such as an unknown user or a service outage, or as filler when filters leave too few items. A good fallback is still filtered for availability and policy. The difficulty is keeping them alive: code that runs only in emergencies rots, and a fallback with stale or removed items is worse than none.",
    k: ["Popularity list vs lightly personalized fallback: popularity is simple and robust; a light personalization from cached user vectors is better but depends on more infrastructure.", "Serve fallback silently vs mark the response as degraded: silent keeps the interface clean; marking lets the client adjust and lets analysis separate fallback traffic."],
    p: ["The fallback list was last refreshed weeks ago and contains items that no longer exist.", "Fallback impressions are logged like normal ones and train the next model to prefer the fallback's items."],
    v: "Disable the personalized path in a test environment and confirm every surface returns a fully filtered fallback within the deadline, flagged as fallback in logs, with items refreshed within the allowed age.",
    dep: ["trending-and-popular-sources", "availability-filter", "item-catalog"]
  },
  "shadow-and-canary-rollout": {
    s: "Methods for introducing a new model or pipeline safely: run it silently beside the live one, then give it a small share of traffic before full release.",
    d: "In shadow mode the new system processes real requests and its outputs are logged and compared with the live system's, but users never see them. A canary then serves a small fraction of live traffic while automated checks watch errors, latency and key metrics. Promotion proceeds in stages with abort conditions. Shadow runs find crashes, latency and input mismatches cheaply; canaries find user-visible regressions. The hard part is that small canaries have too little traffic to detect modest metric regressions, so the checks must be matched to what they can see.",
    k: ["Shadow only vs shadow then canary: shadow is risk-free but cannot show user behavior; canary shows real effects with real exposure to harm.", "Automatic abort vs manual judgment: automatic abort is fast and consistent but may fire on noise; manual review is thoughtful but slow at night and during incidents."],
    p: ["The shadow system is allowed to write to shared caches or logs and quietly changes live behavior.", "The canary share is too small for metric checks to have power, so a regression passes and is found only at full rollout."],
    v: "Deploy a deliberately broken model as a canary in a test and confirm automated checks abort it within the stated time, with traffic returned to the previous version and the event recorded.",
    dep: ["model-registry", "experiment-assignment", "request-orchestrator"]
  },
  "capacity-and-autoscaling": {
    s: "Planning and automatic adjustment of compute, accelerator and memory resources so the pipeline meets its deadline through daily peaks and traffic spikes.",
    d: "Recommendation load follows daily and weekly cycles and spikes with events or notifications that send thousands of users to the product at once. Services scale on request rate and latency, while accelerator pools scale more slowly and cost more, so headroom is planned in advance. Large embedding tables and indexes need memory sized to fit and long warm-up before a new instance takes traffic. The hard part is the slow components: a node that needs minutes to load its model cannot respond to a spike that lasts one minute.",
    k: ["Provision for peak vs autoscale from baseline: peak provisioning is safe and wasteful; autoscaling saves money but cannot respond to fast spikes for slow-starting components.", "Shed load by degrading quality vs rejecting requests: degrading keeps everyone served with weaker results; rejecting protects quality for those admitted but shows errors."],
    p: ["Autoscaling adds instances that spend several minutes loading models, during which the spike has already caused timeouts.", "A push notification campaign sends a surge of users to the surface at one second, and the pre-warmed capacity assumed a gradual ramp."],
    v: "Run a load test shaped like the largest recent spike, including a notification burst, and confirm latency and error rate stay within target, with scaling events timed against warm-up.",
    dep: ["model-inference-runtime", "recommendation-cache"]
  },
  "stream-processing": {
    s: "Continuously processes the event stream to update features, counters and user state within seconds, instead of waiting for the daily batch.",
    d: "Stream jobs consume impression and interaction events, join them with reference data, aggregate over windows and write results to the online stores. They provide exactly-once or idempotent updates, handle late and out-of-order events using event time, and checkpoint state to recover. They share definitions with the batch computation to avoid skew. The hard parts are correctness and operations: restarts must not double-count, state can grow large, and a lagging job quietly serves stale features while every request still succeeds.",
    k: ["Event-time windows vs processing-time windows: event time is correct under delays and replays but needs watermarks and handling for late data; processing time is simple and wrong when the pipeline lags.", "Exactly-once semantics vs idempotent at-least-once: exactly-once is simplest for consumers but costs throughput; idempotent writes are cheaper but require careful design of every sink."],
    p: ["After a restart the job replays events and doubles the counters for the replayed interval.", "Consumer lag grows overnight, and the online features are hours stale until someone checks the dashboard."],
    v: "Replay a recorded hour of events through the stream job and the batch job, and confirm resulting feature values match; measure end-to-end lag from event time to online availability against target.",
    dep: ["event-ingestion-pipeline", "online-feature-store", "feature-definitions"]
  },
  "session-state": {
    s: "A short-lived record of what the user has done in the current visit, such as items viewed, queries and skips, used to adapt recommendations on the next request.",
    d: "State is updated as events arrive and read at the next request, typically from a low-latency store keyed by session or user. It carries recent interactions in order, derived intent signals such as category interest rising this session, and the list of what has already been shown. It lets the system respond within minutes to a change of interest. The hard part is freshness against latency: the update path must finish before the next request, and clients may fire events in bursts or out of order.",
    k: ["Update on every event vs batch updates every few seconds: per-event updates are fresher but write-heavy; micro-batches cut load but delay adaptation.", "Server-side state vs state passed by the client: server-side is consistent and trusted; client-passed state avoids storage but can be forged, bloated or lost."],
    p: ["The state write loses a race with the next request, so the list refresh ignores the click the user just made.", "State from one session leaks into the next through a long expiry, and a one-off interest dominates the following day."],
    v: "Click through a test sequence and confirm the next request's candidates reflect each click within the stated seconds, and that state expires on schedule and is cleared by logout.",
    dep: ["stream-processing", "online-user-history-store"]
  },
  "windowed-counters": {
    s: "Counts of events per item, creator or user over sliding or tumbling windows, such as clicks in the last hour, used as features and for trending.",
    d: "Counters are maintained by the stream job in buckets and combined to answer window queries, with several windows such as one hour, one day and one week. Ratios such as click-through are computed with smoothing so small counts do not dominate. They answer how an item is doing right now, which is predictive and cheap to serve. Hard parts are the sheer number of keys, the need to protect against bot inflation, and consistency with the offline version of the same counters used in training.",
    k: ["Exact sliding windows vs approximate sketches: exact counts are correct and heavy for large key spaces; sketches use little memory but add error and complicate ratios.", "Raw counts vs smoothed ratios: raw counts are simple but unstable; smoothing with a prior stabilizes small counts at the cost of a tuned parameter."],
    p: ["A coordinated bot burst inflates counters and the item shoots to the top before filters catch up.", "Online counters exclude late events that the offline counters include, so training sees different values from serving."],
    v: "Compare online counter values with an offline recomputation from raw events for sampled items and windows, and confirm differences are within tolerance and not systematically biased toward either side.",
    dep: ["stream-processing", "bot-and-spam-filtering", "online-feature-store"]
  },
  "embedding-refresh": {
    s: "Keeps user and item vectors current as new behavior and new items arrive, by recomputing or updating them more often than the full retraining cycle.",
    d: "Item vectors for new items are computed from content as soon as they are created, and vectors for active users are updated from recent actions by the user encoder or by incremental update rules. Refreshed vectors are written to the embedding tables and the retrieval index. The model that produces them must remain version-compatible with the retrieval and ranking models that consume them. The hard part is this compatibility: a refresh path that uses a newer or older model than the index produces vectors in a different space.",
    k: ["Recompute with the live encoder vs approximate incremental update: recomputing is consistent and costly; incremental updates are cheap but drift away from what the encoder would produce.", "Refresh all users vs only active ones: refreshing all is uniform and expensive; refreshing active users saves compute but leaves returning users with stale vectors for their first request."],
    p: ["The refresh job runs with last week's encoder after a model release, writing vectors into the new index that mean nothing there.", "Refresh volume at peak competes with serving for the same store capacity and slows requests."],
    v: "After a model release, sample refreshed vectors and confirm each carries the current model version tag, and that retrieval recall measured with the refreshed vectors matches the offline recall for the same model.",
    dep: ["two-tower-retrieval", "embedding-tables", "stream-processing", "model-registry"]
  },
  "online-user-history-store": {
    s: "A low-latency store of each user's recent interactions and derived features, read on every request by retrieval, filtering and ranking.",
    d: "Keyed by user id, it holds the last few hundred interactions with timestamps and types, aggregated profile features and the list of recently shown items. Reads must complete in a few milliseconds, so it is a replicated in-memory or log-structured key-value store. Writes come from the stream processor. Entries have size caps and expiry. The hard parts are hot keys from very active users, growth in value size, and consistency: a request arriving just after an action must usually see that action.",
    k: ["Store raw events vs precomputed aggregates: raw events allow flexible features at request time but cost reads and compute; aggregates are fast but fix the feature definitions at write time.", "Strong consistency vs fast eventual reads: strong consistency makes feedback visible immediately but costs latency and availability; eventual is faster and sometimes shows stale state."],
    p: ["Heavy users' entries grow without a cap, making their requests slower than everyone else's.", "A failover returns an empty history for known users, who are then treated as new and shown onboarding content."],
    v: "Write a test event and measure how long until a read returns it, confirm p99 read latency under load, and verify that size caps and expiry hold for a synthetic heavy user.",
    dep: ["stream-processing", "identity-resolution"]
  },
  "freshness-monitoring": {
    s: "Measures how old the features, vectors and indexes in use are at serving time, and alerts when they fall behind the stated freshness targets.",
    d: "Each real-time and batch feature has a freshness objective, such as session state within seconds or item counters within minutes. Producers stamp values with event time; the serving layer records the age at read and aggregates it. Monitoring also covers index build time, embedding refresh lag and the time from an item's creation to eligibility. Stale features rarely cause errors, they just degrade quality, so this monitoring is the only way to see it. The difficulty is deciding each target and tying staleness to a measured quality effect.",
    k: ["Measure age at read time vs at write time: read-time age shows what the model actually received; write-time lag shows pipeline health but misses stale items never rewritten.", "Alert on thresholds vs on quality impact: thresholds are simple; impact-based alerts fit real harm but need an established link between staleness and metrics."],
    p: ["Freshness is monitored for the pipeline's output tables but not for the cache in front of them, which hides the real age.", "A feature that stops updating produces no error, and quality erodes for weeks before anyone connects it to the stall."],
    v: "Pause a feature's producer in a test and confirm the staleness alert fires within the stated time, and that the age distribution at serving time is visible per feature on the dashboard.",
    dep: ["online-feature-store", "stream-processing"]
  },
  "new-user-onboarding": {
    s: "The first-session experience for a person with no history: what is shown, what is asked, and how quickly the system learns enough to personalize.",
    d: "With no behavior, the system uses context (region, language, device, referral source, time) and popularity within matching segments, and often asks for a few choices such as topics or favorite items. Subsequent clicks update the user's state at high speed, with exploration set higher than for established users. The first sessions strongly determine whether the user returns. The hard parts are balancing explicit questions, which add friction, against slower implicit learning, and making sure the new-user path is a real, tested pipeline rather than a leftover default.",
    k: ["Ask upfront vs learn from behavior: asking gives immediate relevance but loses some users to friction; passive learning is smooth but gives weak early sessions.", "Dedicated new-user model vs the main model with default features: a dedicated model fits sparse inputs and can be tuned for retention; the main model is simpler but treats missing history as a rare case."],
    p: ["The history store is unreachable and returning users are routed through onboarding, which is then logged as their genuine behavior.", "Onboarding choices are not logged with their source, so their implicit labels contaminate normal preference data."],
    v: "Create fresh test accounts across regions and devices, and confirm the first slate is relevant to context, that it adapts after three clicks, and that onboarding signals are logged and flagged separately.",
    dep: ["interest-elicitation", "context-and-popularity-priors", "bandit-policy", "session-state"]
  },
  "interest-elicitation": {
    s: "Asks the user for explicit interests, favorites or ratings, usually early, to give the models something to work with when there is no behavioral history.",
    d: "Typical forms are topic pickers, sample items to rate or follow, and imports from other accounts when allowed. The choices become profile features and seeds for content-based and graph retrieval. Selecting which items to ask about is itself an optimization: the best questions split the population by taste. Stated interests differ from revealed interests, so they are weighted against behavior as it accumulates. The hard parts are the drop-off at each question and the mismatch between what people say and what they engage with.",
    k: ["Few broad choices vs many specific ones: few choices keep completion high and give coarse signal; many choices give richer signal and lose users.", "Treat stated interest as strong label vs weak prior: a strong label is immediate but often wrong; a prior is safer and fades as behavior takes over."],
    p: ["Users pick aspirational interests, and the feed fills with content they never actually engage with.", "The set of sample items is the same for everyone, so choices reflect the sample's popularity, not the user's taste."],
    v: "Compare engagement in the first week between users who completed elicitation and a matched group who skipped, and confirm the stated interests predict later engagement better than chance and decay in weight as behavior accumulates.",
    dep: ["user-profile-store", "content-based-retrieval"]
  },
  "new-item-handling": {
    s: "The path that makes a brand-new item recommendable before it has any interactions, using its content, its creator and its context.",
    d: "At creation an item gets content features and embeddings, creator-level statistics, and a place in candidate sources that need no history, such as content retrieval. Ranking uses a model that handles missing interaction features, and trial traffic collects early feedback. Item ids with no trained embedding fall back to a shared default or a content-derived vector. The hard part is the delay: every hour between creation and eligibility costs value for time-sensitive content, and the pipeline must be fast and still screened for policy.",
    k: ["Eligible immediately after creation vs after screening completes: immediate is fresh but risks unreviewed content; waiting is safe and loses the most time-sensitive value.", "Content-derived vector vs learned id embedding: content vectors work on the first request; id embeddings are sharper after data arrives, so systems switch as feedback accumulates."],
    p: ["Items lacking required metadata are silently ineligible, so a producer's uploads vanish without any error.", "A default embedding shared by all new items makes them look identical to the ranker and they are ranked as one."],
    v: "Create a test item and measure time to first eligible request, confirm it appears in content-based retrieval for matching users, and receives trial impressions without any interaction history.",
    dep: ["content-feature-fallback", "item-metadata-enrichment", "new-item-trial-traffic", "content-based-retrieval"]
  },
  "content-feature-fallback": {
    s: "Substitutes content-derived features, such as text, image and audio embeddings, for interaction features that do not yet exist for a new user or item.",
    d: "Models are trained so that interaction features can be missing: through masking during training, or by having a content tower whose output is blended with the id embedding by a learned weight that favors content when interaction data is thin. Serving checks the amount of data available and routes accordingly. This turns cold start from a special case into a graceful gradient. It requires the content encoders to be good, which depends on the quality of metadata and media, and the model to be trained with enough examples of missing features.",
    k: ["Train with random feature dropout vs a separate cold-start model: dropout makes one model handle both; a separate model can be tuned for sparse data but doubles maintenance.", "Blend content and id signals by learned gate vs fixed thresholds: a gate adapts smoothly to data volume; thresholds are simple to explain and debug but create cliffs."],
    p: ["The model never saw missing features in training and treats the default as a meaningful value.", "Content encoders miss what makes an item good, so new items match topically and are poor in quality."],
    v: "Evaluate ranking quality on a held-out set of items with all interaction features masked, and confirm it beats a popularity baseline and degrades smoothly as the feature masking rate changes.",
    dep: ["heavy-ranker", "item-metadata-enrichment", "embedding-tables"]
  },
  "context-and-popularity-priors": {
    s: "Default recommendations derived from context and aggregate behavior, such as popular items for a region, device and time of day, used when personal data is missing or thin.",
    d: "Priors are computed offline or in a stream as segment-level statistics: top items per locale, per entry point and per hour, with smoothing so small segments borrow from larger ones. They form the baseline for new users, signed-out sessions and a shrinkage target for users with little data. Priors shrink toward the user's own behavior as it accumulates. The main design question is the segmentation: too coarse and recommendations are generic, too fine and counts are noisy and sparse.",
    k: ["Hierarchical shrinkage vs one fixed segmentation: shrinkage uses the finest level with enough data and degrades gracefully; fixed segments are simple but wrong for rare combinations.", "Popularity by clicks vs by downstream satisfaction: clicks are plentiful and rewarding sensational items; satisfaction signals pick better defaults but are sparser."],
    p: ["The prior reflects bot or promotion-driven traffic, so every new user starts with the same low-quality list.", "Context such as time zone is taken from a default, and morning content is served at night."],
    v: "For fresh sessions, compare the prior-based slate's engagement against a global popularity list across segments, and confirm segments with low volume fall back to their parent segment.",
    dep: ["trending-and-popular-sources", "windowed-counters"]
  },
  "training-example-builder": {
    s: "Turns raw logs into training examples by joining each impression with the features it was scored with, the context, and the outcomes that followed.",
    d: "The builder reads impression logs, interaction events and logged or reconstructed features, and emits one example per shown candidate, with labels attached after the outcome window closes. It handles attribution (which impression caused a purchase), deduplication and sampling of the very large set of non-clicked impressions. Point-in-time correctness is the central requirement: features must be those available at serving, not recomputed with later data. The hard parts are the volume of data and the many subtle ways the join can silently leak the future or lose events.",
    k: ["Train on logged features vs reconstruct features offline: logged features are exact and fixed to old definitions; reconstruction allows new features on old data but risks skew.", "Wait for the full label window vs use partial labels: waiting yields correct labels and delays training; partial labels are fresher but treat late converters as negatives."],
    p: ["The join uses the user's latest profile instead of the profile at impression time, which leaks future behavior into features.", "Impressions that were never visible are labeled negative and teach the model that offscreen items are unattractive."],
    v: "Pick sampled examples and verify each feature value equals the logged served value or its point-in-time recomputation, and that label counts per day match an independent aggregate from raw events.",
    dep: ["impression-logging", "interaction-events", "point-in-time-joins", "offline-feature-store"]
  },
  "label-construction": {
    s: "Defines what counts as a positive or negative outcome for each training example: a click, a watch beyond a threshold, a purchase, a hide.",
    d: "Labels turn behavior into targets, and each definition encodes a view of value. A click is cheap to collect and easily inflated; a long watch or a purchase is closer to value and sparse; a hide or complaint is a strong negative. Thresholds, attribution windows and handling of ambiguous outcomes such as quick bounces matter. Several labels feed the multi-task heads. Hard parts are delayed feedback, where outcomes arrive days after the impression, and noise in implicit labels, which blur satisfaction with curiosity or accident.",
    k: ["Click label vs engagement-threshold label: clicks are plentiful and noisy; thresholds reflect satisfaction better but depend on a chosen cutoff and reduce positives.", "Wait for delayed conversions vs model the delay: waiting is accurate and slow; delay modeling gives fresher training but adds assumptions about the arrival distribution."],
    p: ["A quick click followed by an instant exit is labeled positive, and the model learns to maximize accidental clicks.", "The attribution window is shorter than real purchase latency, so valuable items look unconverted."],
    v: "Sample labeled examples with their raw event timelines and confirm labeling follows the written definition; compare label rates by day to catch changes from logging or product shifts.",
    dep: ["interaction-events", "objective-choice", "training-example-builder"]
  },
  "negative-sampling": {
    s: "Chooses which non-interacted items count as negatives for training retrieval and ranking models, since the true set of disliked items is unknown.",
    d: "Most items are never interacted with, and not because they were disliked. Retrieval models use sampled negatives such as other items in the batch, random catalog items, or hard negatives near the user in embedding space. Ranking models use shown but unclicked impressions. The sampling distribution shapes what the model learns: uniform sampling teaches coarse separation, popularity-based sampling corrects for popularity, and hard negatives sharpen boundaries. It needs a correction term for the sampling probability or scores are biased.",
    k: ["In-batch negatives vs catalog-wide sampling: in-batch is cheap and efficient but biased toward popular items; catalog-wide sampling is unbiased at the cost of compute.", "Hard negatives vs random negatives: hard ones improve fine distinctions; they also include unseen items the user would have liked, which can degrade training."],
    p: ["The hardest negatives are really unseen positives, and the model is trained to push away what the user would have liked.", "Sampling-probability correction is left out, and the model systematically under-scores popular items."],
    v: "Train with two sampling schemes and compare recall by item popularity decile on held-out data; confirm the chosen scheme does not under-recall head or tail items by more than the stated margin.",
    dep: ["training-example-builder", "item-catalog"]
  },
  "training-pipeline": {
    s: "The scheduled, reproducible process that builds examples, trains the model, validates it and registers the result for serving.",
    d: "Stages run as a workflow: data extraction and checks, example building, training on accelerators with distributed sharding of large embedding tables, evaluation, and registration with metadata. Inputs and code are versioned so a run can be repeated. Large sparse models make training expensive, so checkpoints and resumption matter. Hyperparameter search and experiment tracking sit around it. The hard part is reliability at the daily cadence: one broken upstream table or a silent schema change produces a model trained on bad data that still passes loss checks.",
    k: ["Full retraining on a long window vs shorter windows with warm start: full retraining is clean but slow; warm starts are fast and fresher but can carry forward errors and drift.", "Train on all data vs sampled data: all data is accurate and costly; sampling cuts cost but requires reweighting for correct probabilities."],
    p: ["An upstream table silently loses a day of data, and the trained model passes validation on equally broken holdout data.", "Training is not reproducible because inputs are read from mutable tables, so a regression cannot be bisected."],
    v: "Re-run a past training job from its recorded inputs and code versions and confirm the model's offline metrics match within tolerance; confirm data checks block a run when a source table is deliberately corrupted.",
    dep: ["training-example-builder", "label-construction", "model-registry", "data-quality-checks"]
  },
  "retraining-schedule": {
    s: "How often and in what manner models are refreshed: full retrains, periodic fine-tunes or continuous incremental updates from the latest events.",
    d: "Content and taste change, so a model decays after training. Schedules range from weekly full retrains to hourly incremental updates for the most time-sensitive models, usually with periodic full retrains to reset accumulated drift. Cadence depends on how fast the decay shows in metrics and on cost. Automated checks decide whether a candidate is promoted. The hard parts are stability and comparability: continuous updates make it harder to attribute a change in behavior to a single model version.",
    k: ["Frequent incremental updates vs infrequent full retrains: incremental updates track change and cost little per step; full retrains are reproducible and reset drift but lag.", "Fixed schedule vs trigger on measured decay: fixed schedules are predictable; triggers save compute but depend on monitoring that may itself lag."],
    p: ["Daily updates compound a small data error each day until the model degrades, with no single bad release to blame.", "The schedule ignores events such as a catalog launch or holiday, and the model is stale exactly when behavior shifts."],
    v: "Plot offline and online metrics against model age and confirm the chosen cadence keeps decay within the stated tolerance, with the largest decay interval observed and documented.",
    dep: ["training-pipeline", "drift-monitoring", "promotion-gate"]
  },
  "embedding-pretraining": {
    s: "Learns general-purpose vectors for items, users or content from large data ahead of the task models, so they start with useful structure.",
    d: "Item vectors can be learned from co-occurrence in sessions, from content encoders over text, image or audio, or from graph structure. User vectors can be aggregated from their items or learned by sequence models. Pretrained embeddings feed retrieval, ranking and cold-start paths, and may be frozen or fine-tuned. Pretraining makes rare items usable since they borrow structure from similar ones. The hard part is versioning: every consumer of a vector must use the same version, so updating pretraining forces coordinated updates of everything downstream.",
    k: ["Frozen pretrained embeddings vs fine-tuning inside the task model: frozen is stable and shareable; fine-tuning fits the task better but fragments embeddings into many incompatible versions.", "Behavior-based vs content-based pretraining: behavior captures taste and cannot represent new items; content works for anything and misses what users actually like."],
    p: ["A new pretrained embedding is released while the retrieval index still holds the old one, mixing incompatible spaces.", "Embeddings trained on popular sessions encode popularity as a dominant direction and every nearest-neighbor list tilts toward head items."],
    v: "Evaluate each embedding version on a fixed neighbor-quality benchmark and downstream retrieval recall, and confirm the registry lists every consumer with the version it uses.",
    dep: ["item-metadata-enrichment", "embedding-tables", "model-registry"]
  },
  "model-distillation": {
    s: "Trains a smaller, faster model to reproduce the outputs of a large one, giving most of the quality at a fraction of the serving cost.",
    d: "A large teacher model scores a large set of examples, including candidates never shown to users; a smaller student learns to match those scores. Students serve as pre-rankers, retrieval models and on-device models. Because the teacher can label unlogged items, distillation also reduces selection bias in the student's training data. It needs the teacher to be good and consistent, and the student must be evaluated against what users actually do, not only agreement with the teacher.",
    k: ["Match scores vs match rankings: matching scores transfers calibration; matching rankings focuses capacity on order, which is what usually matters for pruning.", "Distill from the latest teacher vs a stable teacher: the latest is best but moves the target; a stable teacher is easier to compare but ages."],
    p: ["The student inherits the teacher's biases and errors and reproduces them with higher confidence.", "The teacher and student are not retrained in step, and the student keeps imitating an obsolete teacher."],
    v: "Compare student and teacher on held-out data for rank agreement at the pruning cutoff and for the online metric in an experiment, and report the latency and cost saved.",
    dep: ["heavy-ranker", "training-pipeline"]
  },
  "model-registry": {
    s: "The versioned catalog of trained models and indexes with their data, code, metrics, lineage and deployment state, which serving reads from.",
    d: "Each entry has an immutable artifact, the training data and code versions, the feature definitions it expects, offline metrics, the embedding versions it depends on and its deployment stage. Serving pulls versions by id, and rollouts and rollbacks are changes to stage pointers. Bundles tie together the model, index and feature versions that must travel together. Hard parts are discipline and linkage: a registry that does not capture dependencies lets a model be deployed with the wrong features or an index from another version.",
    k: ["Bundled versions vs independent versions: bundles guarantee consistency and roll back atomically; independent versions are flexible and allow incompatible combinations.", "Strict promotion stages vs ad-hoc deployment: stages enforce checks and an audit trail; ad-hoc deployment is quick and eventually unreproducible."],
    p: ["A model is promoted without recording which feature definitions it needs, and a later change breaks it silently.", "Old versions are garbage-collected while a holdout group still depends on them."],
    v: "For a serving request, resolve the model id from the log and confirm the registry returns its data version, code version, feature definition version and compatible index, with immutable artifacts.",
    dep: ["feature-definitions"]
  }
});
