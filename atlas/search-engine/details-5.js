// Details for the search engine plate, part 5: feedback and evaluation, abuse and privacy, platform, cross-cutting.
ATLAS.details("search-engine", {
  "click-logging": {
    s: "Records what was shown and what people did with it: queries, result lists, positions, clicks, dwell time and reformulations, as the raw material of learning and measurement.",
    d: "The page logs an impression record listing every result and component shown, with positions and the index and model versions that produced them. Click events return through redirect or beacon, with timestamps and later actions such as returning to the page or refining the query. Records are joined by a request identifier into sessions. It is hard because logs are enormous, because beacons are lost on slow connections, and because a record that does not match what was displayed corrupts every model trained from it.",
    k: ["Log on the server vs on the client: server logs are reliable and miss what was visible on screen, while client logs capture scrolling and hover and arrive unreliably.", "Log every impression vs sample: full logs allow exact analysis, while sampling cuts storage and removes rare cases."],
    p: ["Clicks that go through a cached or prefetched page are never logged and the page looks unclicked.", "The logged ranking omits a late page modification and a click is attributed to the wrong position."],
    v: "Perform scripted searches and clicks on a test account and confirm the logs contain matching impressions, positions, versions and click records, joined under one request identifier within the expected delay.",
    dep: ["result-page-assembly","query-log-pipeline","privacy-and-retention"]
  },
  "click-models": {
    s: "Statistical models that infer relevance from clicks while correcting for the fact that people click higher results more and skip what they never saw.",
    d: "A click model describes how a person scans a result list: probability of examining a position, probability of clicking if examined, and of being satisfied. Fitting it to logs yields debiased relevance estimates per query and document, and satisfaction measures such as long clicks. Outputs become training labels, features and tier signals. It is hard because position bias and trust bias are strong, because clicks reflect titles and snippets, not page quality, and because exploration is required to learn about unshown results.",
    k: ["Parametric examination model vs counterfactual weighting: parametric models are simple and can be wrong in structure, while counterfactual weighting is flexible and needs randomization data.", "Click-through as relevance vs long-dwell satisfaction: clicks are plentiful and favor attractive snippets, while dwell is closer to value and noisier and sparser."],
    p: ["A clickbait snippet earns many clicks and the model learns it as relevance.", "New documents never shown cannot earn clicks, and the model cannot learn they are good."],
    v: "Randomize the order of a small share of results, fit the model on normal traffic, and confirm the debiased estimates agree with the randomized click rates to within the tolerance.",
    dep: ["click-logging","query-log-pipeline"]
  },
  "query-log-pipeline": {
    s: "Processes the stream of logged queries and sessions into cleaned, deduplicated, joined data used by suggestions, spelling, synonyms, intent models and training.",
    d: "Raw logs pass through bot and abuse filtering, deduplication, session construction, language and locale tagging, and aggregation to query-level statistics such as frequency, reformulation pairs and click patterns. Privacy rules are applied early: identifiers are removed or coarsened and rare queries are dropped from shared aggregates. Outputs are written to datasets with defined retention. It is hard because volume is huge, because automated traffic distorts statistics, and because aggregates for rare queries can reveal individuals.",
    k: ["Filter bots before aggregation vs after: filtering first keeps aggregates clean and depends on a good detector, while filtering after preserves raw data for analysis.", "Aggregate only above a frequency threshold vs keep everything internally: thresholds protect privacy and drop the long tail, while keeping everything helps rare queries and increases exposure."],
    p: ["Scraper traffic repeating the same queries inflates frequency and distorts suggestions and spelling.", "A raw session table is retained past its allowed period because a downstream job still reads it."],
    v: "Run synthetic traffic with known bots, rare queries and sessions through the pipeline, and confirm bot queries are excluded, rare queries are suppressed from shared aggregates and session joins are correct.",
    dep: ["click-logging","bot-and-scraper-defense","log-anonymization","stream-compute"]
  },
  "training-data-assembly": {
    s: "Builds labeled training sets for ranking and understanding models by joining logs, click-model labels, rater judgments and features as they were at serving time.",
    d: "For each logged query it reconstructs the candidate list with the feature values that were actually served, attaches labels from raters and debiased clicks, and samples to balance query classes and languages. Data is split by time to prevent leakage and checked for skew against live feature distributions. It is hard because features must be the logged ones, not recomputed with later information, because labels are noisy and biased, and because sets must stay reproducible for months.",
    k: ["Use logged features vs recompute historical features: logged features match serving exactly and constrain what can be tried, while recomputation allows new features and risks leakage.", "Mix rater labels with click labels vs use one: mixing gets volume and stated quality, while a single source is clean and limited."],
    p: ["A feature computed after the click leaks the label into training and the model looks excellent offline and fails online.", "Sampling that favors head queries gives a model that is weak on the long tail."],
    v: "Check a sample of rows that every feature value equals the value logged at serving, no feature has a timestamp after the request, and class balance matches the sampling plan.",
    dep: ["click-models","judged-relevance-sets","feature-assembly","query-log-pipeline"]
  },
  "ranking-model-training": {
    s: "Trains and validates the ranking models, tracking data, features, code and hyperparameters so any production model can be reproduced and its change explained.",
    d: "Jobs fit candidate models on the assembled data, evaluate on time-held-out judged and click-derived sets, and compare against the production model per query class and language. A candidate that clears offline gates goes to interleaving and online experiments. Model, feature spec and data version are registered together. It is hard because training takes accelerator-hours, because small offline gains often do not appear online, and because a model must be shipped in sync with the feature definitions it expects.",
    k: ["Retrain on a schedule vs when drift is detected: schedules keep models fresh and produce churn, while drift triggers save effort and respond late.", "Optimize a ranking loss directly vs distill from a larger model: direct optimization is simple, while distillation passes a heavy model's judgment into a model cheap enough to serve."],
    p: ["A model trained against stale feature definitions is deployed and quietly mis-scores a feature.", "Offline gain comes from overfitting to the judged set that has been used for tuning many times."],
    v: "Retrain from the registered data and code and confirm the model's metrics reproduce within noise, then check the candidate does not regress any language or query class beyond its stated limit.",
    dep: ["training-data-assembly","offline-evaluation","batch-compute","learned-ranking-models"]
  },
  "judged-relevance-sets": {
    s: "Collections of queries with documents rated by trained people against written guidelines, used as ground truth for evaluation and as training labels.",
    d: "Queries are sampled from traffic to represent head, torso and tail, locales and intents. Documents from several systems are pooled and rated on graded scales, with multiple raters per item and quality control through gold examples and agreement checks. Guidelines define relevance, quality and harm, and change over time. It is hard because ratings are expensive, because raters disagree about intent, and because the set ages as the web and the queries change.",
    k: ["Few raters per item vs many: few raters cover more items, while many raters yield reliable labels per item and fewer items.", "Rate with the full page vs with the snippet: full-page ratings reflect real value, while snippet ratings are cheaper and measure what people choose from."],
    p: ["A judged set built from one ranker's output hides relevant documents that ranker never retrieved.", "Guidelines change and old labels no longer mean what new ones mean, yet both sit in one set."],
    v: "Measure inter-rater agreement and agreement with gold items per batch, and confirm both are above the thresholds, with the sample's query distribution matching traffic across classes and locales.",
    dep: ["query-log-pipeline","click-models"]
  },
  "offline-evaluation": {
    s: "Computes quality metrics for a ranking change against judged sets and logged data before it touches users, sliced by language, query class and difficulty.",
    d: "A harness replays queries through the candidate configuration against a frozen index and scores the result lists with graded-relevance metrics, diversity and freshness measures, and counts changed results against the baseline. Slices expose regressions hidden in averages. Results include confidence intervals and per-query diffs for inspection. It is hard because offline metrics only approximate user value, because frozen indexes and live ones differ, and because repeated testing on one set overfits to it.",
    k: ["Replay against a frozen index vs the live index: frozen indexes make comparisons exact, while live indexes include freshness effects and add noise.", "Single headline metric vs a metric suite: one metric makes decisions easy and rewards gaming it, while a suite shows tradeoffs and requires judgment."],
    p: ["A change improves the average and wrecks a small language or query class with no one looking at slices.", "The judged set has been reused so often that gains reflect memorization, not improvement."],
    v: "Run the harness on the same configuration twice and confirm identical metrics, run it on a known-worse configuration and confirm it reports a drop, and confirm per-slice tables and confidence intervals are produced.",
    dep: ["judged-relevance-sets","index-publish-and-rollout","batch-compute"]
  },
  "online-experiments": {
    s: "Splits live traffic between a control and a change, measuring user-behavior and quality metrics with statistical care, to decide whether a change ships.",
    d: "Users or queries are assigned to arms by a stable hash within layers so multiple experiments run at once without interfering. Metrics include success measures such as clicks and abandonment, latency, and guardrails such as error and spam rates. Analysis uses variance reduction and sequential rules to avoid false positives. It is hard because effects are small and need huge samples, because behavior has novelty effects, and because metrics can improve for the wrong reasons.",
    k: ["Randomize by user vs by query: user-level assignment gives consistent experience and fewer samples, while query-level assignment is more powerful and shows people mixed behavior.", "Stop early on strong results vs fixed duration: early stopping saves time and raises false positives without correction, while fixed duration is reliable and slow."],
    p: ["Two overlapping experiments interact and the measured effect belongs to neither.", "Clicks rise because a change made the results harder to judge, and the lift is read as quality."],
    v: "Run an experiment where both arms are identical and confirm no metric differs beyond the expected false-positive rate, then run one with a known degradation and confirm it is detected within the planned sample size.",
    dep: ["click-logging","config-and-rollout","monitoring-and-alerting","interleaving"]
  },
  "interleaving": {
    s: "Compares two rankers by mixing their results into one list shown to the same person and counting which ranker's results get chosen, for sensitivity with far less traffic.",
    d: "A merge procedure combines the lists, such as alternating picks with randomized starting order, and keeps track of which ranker contributed each result. Clicks are credited to the contributing ranker, and the preferred ranker per query is aggregated across many queries. Because each person sees both rankers, between-user variance disappears, so differences show up with roughly an order of magnitude less traffic. It is hard because interleaving measures preference, not absolute quality, and gets complicated with page layouts and personalization.",
    k: ["Interleave vs run a split experiment: interleaving detects small ranking differences quickly, while split experiments measure absolute effects such as latency and satisfaction.", "Team-draft vs probabilistic mixing: team-draft is simple and can bias on small lists, while probabilistic methods are less biased and harder to explain."],
    p: ["A ranker whose results look attractive but are worse after clicking wins an interleaving test.", "The interleaved list breaks layout rules and the mixed page does not look like either ranker's."],
    v: "Interleave a ranker against itself and confirm preference near fifty percent, then interleave against a deliberately degraded one and confirm the better ranker wins with the expected sample size.",
    dep: ["click-logging","click-models","learned-ranking-models"]
  },
  "adversarial-seo-defenses": {
    s: "The ongoing program that detects and counters manipulation of ranking, combining signal design, model retraining, human investigation and policy enforcement.",
    d: "Teams track manipulation tactics, such as hidden text, link schemes, hacked sites, doorway pages and large-scale generated content, and build detection into models and rules. Ranking features are chosen and weighted with their manipulability in mind, and new signals are held back until understood. Spam reports and examples drive classifier updates and manual actions. It is hard because attackers adapt to every defense, because each signal that predicts relevance becomes a target once it is known, and because defenses must not harm legitimate publishers.",
    k: ["Secrecy about signals vs published guidance: secrecy delays attackers and frustrates honest publishers, while guidance helps honest sites and informs attackers.", "Automated demotion vs manual review: automation scales and errs in volume, while manual review is accurate and cannot cover the web."],
    p: ["A new ranking feature is announced or discovered and within weeks an industry exploits it.", "Defense models are retrained on spam they caught last quarter and miss the new tactic."],
    v: "Seed a test set of known manipulation tactics, including a fresh one, into a sandbox corpus and confirm the combined defenses demote them, and measure time to detect a novel tactic from first appearance.",
    dep: ["spam-classification","link-spam-filtering","manual-actions","cloaking-detection"]
  },
  "bot-and-scraper-defense": {
    s: "Detects automated query traffic that scrapes results, inflates statistics or attacks the service, and challenges, throttles or blocks it without harming people.",
    d: "Signals include request rates, query patterns, client fingerprints, network reputation and behavioral timing. Classifiers score each request, and actions escalate from logging to rate limits, challenges and blocks. Traffic classified as automated is excluded from logs used for learning. Legitimate automated clients can use authorized access. It is hard because bots imitate people, because shared networks make blocking collateral, and because manipulating clicks at scale poisons feedback data.",
    k: ["Challenge suspicious clients vs silent throttling: challenges give a signal and add friction for people, while silent throttling avoids friction and gives attackers no feedback.", "Block at the edge vs inside the service: edge blocking saves capacity, while in-service scoring can use richer features."],
    p: ["A large shared network is blocked because a few clients on it behaved like bots.", "Click bots go undetected and move rankings through fake engagement."],
    v: "Replay recorded scraper and click-manipulation traffic mixed with normal traffic and confirm bots are classified and excluded from logs at the target rate while the false-positive rate on real users stays below its limit.",
    dep: ["query-frontend","query-log-pipeline","monitoring-and-alerting"]
  },
  "manual-actions": {
    s: "Human reviewed penalties and reinstatements for sites that violate policy, with a documented process, notification to the site owner and an appeal path.",
    d: "Reviewers examine flagged sites against written policies and apply an action: demote, remove sections, or remove entirely, recording the reason and notifying the owner through a console. Owners fix issues and request reconsideration; reviewers verify and lift actions. Decisions feed training data for automated systems. It is hard because policies must be applied consistently across a global web, because owners need actionable explanations without receiving a guide for evasion, and because mistakes affect livelihoods.",
    k: ["Detailed notices vs terse notices: detailed notices help honest owners fix problems and teach abusers what is detected, while terse notices protect detection and frustrate honest owners.", "Site-wide actions vs targeted section actions: site-wide actions are simple and blunt, while targeted actions are fair and need accurate scoping."],
    p: ["An action is never lifted after the site is fixed because the reconsideration queue is backlogged.", "Reviewers apply the same policy differently and similar sites receive different treatment."],
    v: "Submit test cases through detection, action, notification, fix and reconsideration, confirm each step is recorded and the demotion is applied and then lifted in the index, and audit reviewer agreement on a shared sample.",
    dep: ["spam-classification","site-level-quality","adversarial-seo-defenses","removals-and-tombstones"]
  },
  "legal-removals": {
    s: "The process for receiving, validating and applying removal orders and requests from courts, regulators and rights holders, scoped by jurisdiction.",
    d: "Requests arrive through forms, notices and orders and are checked for validity and scope by trained staff. Approved removals become tombstones with a jurisdiction, and the serving tier applies them for queries from the affected locations. Counter-notices and appeals are tracked, and aggregate transparency reports are published. It is hard because laws differ by country and change, because requests can be abusive, and because scoping a removal to the right places and urls needs location detection that is imperfect.",
    k: ["Remove globally vs by jurisdiction: global removal is simple and applies one country's law everywhere, while jurisdictional removal respects local law and depends on locating the person.", "Fast automated acceptance vs manual review: automation meets deadlines and accepts abusive requests, while review is accurate and slower."],
    p: ["A removal scoped to one country is visible there through a different regional entry point.", "Fraudulent requests suppress a competitor's page before anyone reviews them."],
    v: "Process a test order scoped to one jurisdiction and confirm the URL disappears for queries from that location in results, caches and suggestions, remains in others, and is counted in the transparency data.",
    dep: ["removals-and-tombstones","personalization-and-locale","regional-routing"]
  },
  "privacy-and-retention": {
    s: "Policies and mechanisms that limit what is collected about searchers, how long it is kept and who can read it, with deletion on request and defined purpose limits.",
    d: "Each data class, such as raw query logs, account history and aggregated statistics, has a documented purpose, a retention period and access rules. Pipelines enforce these through expiry, aggregation thresholds and access controls with audit logs. Users can view and delete their history. Sensitive categories receive extra protection. It is hard because data is copied into many derived datasets and models, because deletion must reach all copies, and because learning from logs and keeping people private pull in opposite directions.",
    k: ["Short retention vs long retention: short retention limits exposure and harms long-term learning, while long retention helps models and increases risk.", "Per-user personalization vs aggregate-only learning: personalization improves relevance and needs identifiable history, while aggregate learning protects individuals and cannot adapt to them."],
    p: ["A derived dataset copied for an experiment outlives the retention period because it was not registered.", "A deletion request clears the account history and leaves the person's queries in training data."],
    v: "Delete a test user's history and confirm a scan of registered datasets finds no records for them after the deadline, and confirm every dataset with personal data has an owner, purpose and expiry enforced by a job.",
    dep: ["log-anonymization","distributed-storage","click-logging"]
  },
  "log-anonymization": {
    s: "Techniques that remove or blur identifying information from logs before wide use, including identifier removal, coarsening, thresholds and noise, balancing utility against re-identification risk.",
    d: "Identifiers are replaced by rotating pseudonyms or dropped, locations are coarsened, and queries containing personal strings such as names, numbers or addresses are detected and removed. Aggregates only release items seen by enough distinct users, and some statistics add calibrated noise. Access to less-processed data is limited and audited. It is hard because queries themselves can identify a person, because combining datasets re-identifies, and because each technique reduces the fidelity learning depends on.",
    k: ["Remove identifiers vs add noise to aggregates: removal is simple and leaves quasi-identifiers, while noise gives formal guarantees and reduces accuracy for rare items.", "Threshold by distinct users vs by count: distinct users resist one person repeating a query, while count thresholds are simpler and weaker."],
    p: ["A rare query containing a name passes the threshold because a few colleagues searched for it.", "Two anonymized datasets are joined by time and location and individuals are recovered."],
    v: "Attempt re-identification against an anonymized release using known test users and auxiliary data, confirm the success rate is below the policy limit, and confirm detected personal strings are absent from aggregates.",
    dep: ["query-log-pipeline","privacy-and-retention"]
  },
  "distributed-storage": {
    s: "A replicated, fault-tolerant file or object store holding raw documents, indexes, graphs, logs and models, built for large sequential reads and appends over thousands of machines.",
    d: "Data is split into chunks replicated across machines and failure domains, with a metadata service tracking placement. Writes are mostly appends and bulk files; jobs read large ranges. Erasure coding reduces cost for cold data. Quotas, access control and encryption protect data. It is hard because capacity is measured in exabytes at the high end, because machines and disks fail daily, and because a metadata outage or a rebalance storm affects every pipeline at once.",
    k: ["Replication vs erasure coding: replication gives fast reads and quick repair at triple cost, while erasure coding costs much less and makes reads and repairs heavier.", "One global namespace vs separate clusters: a global namespace simplifies sharing, while separate clusters limit the blast radius of failures."],
    p: ["A metadata service overload stalls every batch job simultaneously.", "Silent disk corruption is replicated before anyone notices because checksums are not verified on read."],
    v: "Kill a machine and a rack storing a known file during a read job and confirm reads continue, replication is restored within the target time, and checksums validate on every chunk.",
    dep: ["cluster-scheduling"]
  },
  "batch-compute": {
    s: "A framework for running large parallel jobs over stored data with automatic retries, used for index builds, graph computation, model training and log processing.",
    d: "Jobs are expressed as stages of map, shuffle and reduce or as dataflow graphs, scheduled onto a cluster close to the data. The framework retries failed tasks, speculatively re-runs slow ones, and writes outputs atomically. Workflow tools chain jobs with dependencies and deadlines. It is hard because stragglers dominate completion time, because data skew overloads a few workers, and because pipeline correctness depends on exact input versions and deterministic outputs.",
    k: ["Speculative execution vs none: speculation cuts tail time from slow machines at extra cost, while none avoids waste and lets one worker hold up the job.", "Materialize every stage vs pipeline in memory: materializing allows restart at any stage, while pipelining is faster and restarts from the beginning."],
    p: ["One hot key sends most of the data to a single reducer and the job runs for days.", "A job reads input while another is still writing it, and mixes two versions."],
    v: "Run a job with injected machine failures and a deliberately slow task, and confirm it completes with outputs identical to a clean run and with completion time within the agreed factor.",
    dep: ["distributed-storage","cluster-scheduling"]
  },
  "stream-compute": {
    s: "Continuous processing of ordered event streams, such as logs, crawl results and feeds, with low latency, exactly-once effects and the ability to replay from a log.",
    d: "Events are appended to durable partitioned logs, and processing jobs read them with checkpointed offsets, maintaining windowed aggregates or applying transformations and writing results to stores. Watermarks track event time to handle late data. It powers real-time indexing, log pipelines and trending detection. It is hard because late and out-of-order events must be handled consistently, because exactly-once effects require careful design with external stores, and because replay after a bug must not corrupt state.",
    k: ["Event time vs processing time windows: event time gives correct results for late data and needs watermarks and buffering, while processing time is simple and drifts with delays.", "Exactly-once effects vs at-least-once with idempotent sinks: exactly-once is convenient and costly, while idempotent sinks are cheaper and put the burden on the writer."],
    p: ["A consumer lags during a spike and the real-time index falls behind without anyone being alerted.", "Replaying events after a fix double-counts statistics because sinks were not idempotent."],
    v: "Pause a consumer, let events accumulate, resume, and confirm output equals what uninterrupted processing would produce with lag falling to normal within the target, and inject duplicates to confirm they have no effect.",
    dep: ["distributed-storage","cluster-scheduling"]
  },
  "cluster-scheduling": {
    s: "Places jobs and services onto machines with resource limits, priorities, failure-domain spreading and automatic restarts, so thousands of different workloads share one fleet.",
    d: "A scheduler tracks machine capacity and each task's requested CPU, memory and accelerators, and assigns tasks by priority, preempting low-priority batch work for serving when needed. It spreads replicas across failure domains, restarts failed tasks, and drains machines for maintenance. Serving and batch jobs share machines to raise utilization. It is hard because interference between neighbors shows up as tail latency, because quotas and priorities cause conflicts, and because a scheduler fault stops all placement.",
    k: ["Share machines between serving and batch vs separate fleets: sharing raises utilization and creates interference, while separation protects latency at the cost of idle capacity.", "Strict priorities with preemption vs fair sharing: strict priorities protect serving, while fair sharing is gentler on batch jobs and can let serving suffer."],
    p: ["A batch job and serving process on one machine contend for memory bandwidth and p99 latency rises.", "A maintenance drain removes too many replicas of one shard at the same time."],
    v: "Submit a high-priority serving job to a full cluster and confirm lower-priority work is preempted and serving starts within the target, with replicas spread across the required failure domains.",
    dep: []
  },
  "config-and-rollout": {
    s: "Versioned configuration, feature flags and staged deployment for binaries and models, with canarying, automatic rollback and an audit trail for every change.",
    d: "Settings, model versions and flags are stored in version control or a config service, delivered to servers dynamically, and rolled out gradually across a small fraction, then regions, with health checks that halt on regressions. Changes are attributed and reversible. Experiments use the same system. It is hard because a config change is as dangerous as a code change and often skips review, because dependencies between settings and binaries are implicit, and because a global push without staging can take everything down.",
    k: ["Dynamic config without a restart vs config bundled with the binary: dynamic changes are fast and bypass the safety of binary releases, while bundled config is slower and tested together.", "Automatic rollback on a metric dip vs human decision: automatic rollback limits damage and can roll back for noise, while human decisions avoid false rollbacks and are slow."],
    p: ["A flag flipped everywhere at once enables a code path that was only tested in one region.", "Config and model versions drift apart and a server runs a model with the wrong feature spec."],
    v: "Push a deliberately bad config to a canary and confirm health checks halt the rollout and roll back automatically before most traffic is affected, with the change and its author recorded.",
    dep: ["monitoring-and-alerting","cluster-scheduling"]
  },
  "monitoring-and-alerting": {
    s: "Metrics, traces, logs and alerts on the health and quality of every stage, including relevance proxies and freshness, so regressions are noticed by machines first.",
    d: "Every service exports latency, error and saturation metrics, and the pipeline exports data-quality metrics such as document counts, signal coverage and index staleness. Canary query sets track result quality continuously, and distributed traces follow a query across stages. Alerts are tied to service objectives and route to on-call people. It is hard because quality regressions rarely cause errors, because alerts must be few and meaningful, and because the system is too large for anyone to see directly.",
    k: ["Alert on symptoms vs causes: symptom alerts match what users feel and are fewer, while cause alerts help diagnosis and produce noise.", "Quality probes with fixed queries vs relying on traffic metrics: fixed queries detect regressions fast with known answers, while traffic metrics reflect real use and are slow and noisy."],
    p: ["An index missing a slice of the web raises no error and is only noticed when a customer complains.", "Alert fatigue leads on-call staff to ignore a page that is real."],
    v: "Inject a missing-shard fault, a stale signal feed and a latency regression, and confirm each triggers the right alert within its target time and routes to the owning team.",
    dep: ["distributed-storage"]
  },
  "latency-budget": {
    s: "The fixed time allowance for a query, divided among understanding, fan-out, ranking and assembly, which decides how much work every stage may do.",
    d: "A page must arrive within a few hundred milliseconds, so each stage receives a share of the budget, and the sum is enforced through propagated deadlines. Stages that cost more must be gated to the queries that gain from them. The budget decides model size, candidates ranked, tiers searched and snippet depth, and it is the first thing sacrificed under load. It is hard because small additions accumulate, because averages hide the tail that fan-out amplifies, and because quality ideas arrive faster than milliseconds free up.",
    k: ["Strict per-stage budgets vs a shared deadline: per-stage budgets give each team a clear limit and waste slack, while a shared deadline is efficient and invites contention.", "Spend latency on quality for every query vs only for hard queries: uniform spending is simple, while gating spends where it helps and requires a reliable difficulty estimate."],
    p: ["Each team adds a few milliseconds and the page is a hundred milliseconds slower after a year.", "Latency is measured as an average and the p99 that fan-out exposes is far worse."],
    v: "Publish the budget per stage, trace a sample of requests, and confirm each stage's p50 and p99 stay within its share, with total p99 inside the page target at peak load.",
    dep: ["fan-out-and-aggregation","tail-latency-control","neural-reranking","query-frontend"]
  },
  "freshness-vs-cost": {
    s: "The tradeoff between how current the index is and what it costs to crawl, process and serve, set differently for news, popular pages and the long tail.",
    d: "Each step toward freshness costs more: faster crawls, a real-time index, smaller batches and cache invalidation. The value differs sharply by topic, so the system classifies queries and documents by their freshness need and spends accordingly. Most of the web is built on a batch cycle of days, with a minority on a fast path. It is hard because freshness need is only known after an event, because a fast path has fewer quality signals, and because users judge the engine by its worst stale answer.",
    k: ["Uniform refresh cadence vs freshness by demand: a uniform cadence is simple and wastes effort on static pages, while demand-driven cadence concentrates effort and depends on prediction.", "Fast path with lighter checks vs everything through the full pipeline: the fast path is timely and open to spam, while the full pipeline is trusted and late."],
    p: ["A sudden event outpaces the schedule and results show the situation from yesterday.", "The fast path is abused with low-quality pages timed to events."],
    v: "Measure end-to-end time from a page change to its visibility in results per freshness class, and confirm each class meets its target at the planned cost per document.",
    dep: ["freshness-scheduling","real-time-index","incremental-index-updates","result-cache"]
  },
  "adversarial-pressure": {
    s: "The fact that every public ranking signal is attacked, so signals, models and processes must be designed expecting manipulation rather than honest input.",
    d: "Anything that improves ranking is worth money, so links, content, markup, clicks and even queries are manipulated. This shapes which signals are trusted, how feedback data is filtered, how models are monitored and how quickly defenses can ship. Teams treat the web as an adversary with unlimited trials and the ranking system as an oracle it can probe. It is hard because the same signals that help honest publishers help attackers, and because defenses have to avoid collateral damage.",
    k: ["Few robust signals vs many fragile signals: robust signals are harder to game and discard useful information, while many signals gain accuracy and widen the attack surface.", "Fast reactive defenses vs slow principled ones: reactive defenses stop current attacks and accumulate special cases, while principled ones last longer and arrive late."],
    p: ["A signal designed assuming honest input is gamed within weeks of being used in ranking.", "Feedback data from clicks is trusted without checking for fake traffic."],
    v: "Run red-team exercises that attempt to rank planted pages with known techniques, and confirm each attack is detected or ineffective, with results tracked as time to mitigation.",
    dep: ["adversarial-seo-defenses","spam-classification","link-spam-filtering","bot-and-scraper-defense"]
  },
  "version-consistency": {
    s: "The need for index, document store, features, encoders, analyzers and models to be from compatible versions at the moment a query is answered.",
    d: "A query touches shards, the document store, the feature store, query encoders, tokenizers and ranking models, each updated on its own schedule. Mismatches cause silent errors: tokens that no longer match, vectors from different encoders, features with changed meaning, snippets from another document version. Systems tag artifacts with versions, publish compatible sets together, and check compatibility at load time and at query time. It is hard because rollouts are gradual, so mixed versions are normal for hours.",
    k: ["Strict version lockstep vs tolerant compatibility windows: lockstep prevents mismatch and makes rollouts heavy, while windows allow independent releases and need compatibility discipline.", "Check versions at runtime vs trust deployment ordering: runtime checks catch mistakes and cost a little per request, while ordering is free and fails silently."],
    p: ["A tokenizer change goes live in the query path before the index is rebuilt, and queries with accents stop matching.", "Shards on different versions return scores that cannot be compared and the merged ranking is wrong."],
    v: "Deliberately mismatch an encoder, a feature spec and a tokenizer version in staging and confirm each mismatch is detected and refused at load or flagged per request instead of silently ranking.",
    dep: ["index-publish-and-rollout","embedding-index-build","feature-assembly","text-analysis"]
  },
  "experimentation-discipline": {
    s: "The practice of proving every ranking change with judged sets and live experiments before it ships, with guardrails, holdouts and recorded decisions.",
    d: "Because effects are small and every change touches many queries, intuition is unreliable. Changes pass offline evaluation, interleaving and a controlled experiment with pre-declared metrics and guardrails, and a small holdout stays on old behavior to measure cumulative drift. Launch decisions are recorded with data. It is hard because teams are pushed to ship, because metrics are proxies that can be improved without helping people, and because long-term effects such as trust do not appear in short tests.",
    k: ["Strict gates for every change vs lighter gates for small changes: strict gates catch regressions and slow improvement, while lighter gates are fast and accumulate unmeasured risk.", "Optimize engagement metrics vs satisfaction measures: engagement is plentiful and rewards attention capture, while satisfaction is closer to value and expensive."],
    p: ["Dozens of small launches each pass their tests and together make results worse for a language.", "Metrics are chosen after seeing the data and any difference becomes a win."],
    v: "Audit launches over a quarter and confirm each has a pre-declared metric plan, an offline and an online result, and a recorded decision; compare the long-term holdout against current production on the main quality metrics.",
    dep: ["offline-evaluation","online-experiments","interleaving","judged-relevance-sets"]
  },
  "privacy-and-data-minimization": {
    s: "The principle that the engine collects, keeps and exposes only the user data it needs, designed into logging, learning, personalization and debugging from the start.",
    d: "Queries reveal health, beliefs and plans, so protection is built into the data model: coarse identifiers, short retention, aggregation thresholds, purpose-bound access and on-request deletion. Learning systems use aggregates or anonymized data where possible, and personalization is opt-in or limited. Debugging tools avoid raw personal logs. It is hard because quality improves with more data, because data spreads to derived stores and models, and because rules and expectations vary by country.",
    k: ["Collect broadly and restrict use vs collect narrowly: broad collection keeps options open and creates risk and obligations, while narrow collection is safer and limits learning.", "Central policy enforcement vs per-team responsibility: central enforcement is consistent and slows teams, while per-team responsibility is quick and uneven."],
    p: ["A debugging dump of raw queries is shared widely and contains personal information.", "A new model is trained on logs outside the registered purpose because no one tracks derived data."],
    v: "Trace a test user's query through logs, derived datasets and models, and confirm each store holds only the allowed fields for the allowed time, and a deletion request removes them all.",
    dep: ["privacy-and-retention","log-anonymization","query-log-pipeline","personalization-and-locale"]
  },
});
