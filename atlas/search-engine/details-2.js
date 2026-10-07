// Details for the search engine plate, part 2: retrieval, ranking and the serving tier.
ATLAS.details("search-engine", {
  "lexical-candidate-retrieval": {
    s: "Finds documents containing the query terms by walking posting lists on each shard, producing a candidate set of thousands from billions without scoring every document.",
    d: "Each shard evaluates the query plan against its inverted index: it intersects or unions posting lists for required and optional terms, skips ahead using skip structures, and stops early once enough high-scoring candidates are found. Document-at-a-time or score-at-a-time strategies bound the work. The single-node mechanics are covered by the search-index plate; here the concern is the contract between planner and shards and the budgets that apply. It is hard because rare-term queries are cheap and long queries of common words are expensive, and recall must be kept without scanning everything.",
    k: ["Early termination vs exhaustive evaluation: early stopping bounds latency and cost, but can miss a good document that sits late in the lists.", "Conjunctive first, disjunctive fallback vs always disjunctive: conjunctive matching is fast and precise, while fallback to partial matches rescues queries with a stray term at higher cost."],
    p: ["A query made entirely of very common words scans enormous lists and blows through the shard deadline.", "A tuning change to early termination lowers recall only for rare long queries, which aggregate metrics do not show."],
    v: "Replay a sample of queries against one shard with early termination on and off and confirm the top-ranked documents overlap above the agreed recall threshold while the median postings scanned fall.",
    dep: ["query-plan-construction","index-serving-replication","posting-list-cache","text-analysis"]
  },
  "dense-vector-retrieval": {
    s: "Retrieves candidates by embedding the query and finding nearest document vectors, catching matches that share meaning but not words with the query.",
    d: "A query encoder produces a vector at serving time, and each shard searches an approximate nearest-neighbor structure over document or passage vectors built offline. Results merge with lexical candidates. Vectors may be compressed to cut memory, and filters such as language or freshness are applied during or after the search. It is hard because approximate search trades recall for speed in ways that vary by region of the space, because the encoder and index must always be from the same model version, and because dense retrieval misses exact strings that lexical matching finds easily.",
    k: ["Compressed vectors vs full precision: compression fits far more documents per machine and speeds search, but lowers the accuracy of the nearest-neighbor ranking.", "Filter during search vs after: filtering during search keeps result counts full, but complicates the index structure; post-filtering is simple and can return too few results."],
    p: ["A new encoder version is deployed to the query side before the document vectors are rebuilt, and similarity scores become meaningless.", "Strict filters combined with post-filtering leave a query with almost no candidates."],
    v: "Compare retrieved sets against exhaustive nearest-neighbor search on a sample to measure recall at the serving settings, and confirm queries with no shared words but the same meaning retrieve the right document.",
    dep: ["embedding-index-build","index-serving-replication","query-plan-construction","candidate-merging"]
  },
  "candidate-merging": {
    s: "Combines candidate lists from lexical retrieval, dense retrieval and other sources into one set, removing duplicates and aligning scores that were produced by different methods.",
    d: "Each source returns documents with its own score scale. The merger deduplicates by document, keeps provenance, and either normalizes scores or uses rank-based fusion so no source dominates by scale alone. It caps the total passed to scoring and may reserve slots per source to protect recall. It is hard because the best mixture depends on query class, because a candidate retrieved by only one method may be exactly the one that matters, and because the cap decides what the expensive models ever see.",
    k: ["Rank-based fusion vs learned score combination: rank fusion needs no training and is stable, while learned combination uses scores fully and needs retraining as sources change.", "Per-source quotas vs a single pooled cap: quotas protect minority sources, while a pooled cap lets the strongest source use the whole budget."],
    p: ["One source's scores inflate after a model update and crowd the others out of the candidate set.", "The merge cap is set too low and recall silently falls before the ranker can help."],
    v: "Measure recall of judged relevant documents in the merged candidate set per source combination, and confirm the merged recall exceeds each source alone on a judged query sample.",
    dep: ["lexical-candidate-retrieval","dense-vector-retrieval","first-stage-scoring"]
  },
  "first-stage-scoring": {
    s: "Scores the merged candidates with a cheap function combining term statistics and a few precomputed document signals, cutting the set to the few hundred worth ranking with heavy models.",
    d: "The scorer uses term-frequency and length-normalized statistics, inverse document frequency, field weights for title and anchor text, proximity of terms, and a query-independent prior built from authority and quality. It runs on the shard next to the index so that only the best few hundred leave the machine. It is hard because it must be extremely cheap, because its mistakes are unrecoverable (a document cut here is never seen again), and because its weights must be kept aligned with the later learned stages.",
    k: ["Score on the shard vs ship candidates for central scoring: shard scoring cuts network and later cost, but limits the features and requires consistent code across the fleet.", "Hand-tuned formula vs small learned model: a formula is transparent and cheap, while a learned model is more accurate but needs feature plumbing on every shard."],
    p: ["Static priors dominate and an old authoritative page outranks a better recent one at this stage and never reaches the learned model.", "Shard-local statistics differ between shards, so scores are not comparable when merged."],
    v: "For a judged query set, confirm that the fraction of documents the final ranker would place in the top ten that also survive first-stage cutoff stays above the target recall.",
    dep: ["candidate-merging","link-authority-scoring","page-quality-model","anchor-text-aggregation"]
  },
  "feature-assembly": {
    s: "Gathers the many signals the learned ranker consumes for each candidate: query features, document features, query-document match features and context, with consistent definitions between training and serving.",
    d: "Features come from the shard (match statistics), a feature store of document signals (authority, quality, freshness, entity annotations), the query understanding output and the request context. A single definition of each feature is used offline for training data and online for serving. Missing values, defaults and staleness are handled explicitly. It is hard because training-serving skew is the most common cause of a ranker that is excellent offline and poor in production, and because adding features adds fetch cost to every candidate.",
    k: ["Precomputed feature store vs computing at query time: stores are fast and consistent, but features are only as fresh as the last refresh.", "One shared feature definition for training and serving vs separate pipelines: sharing prevents skew, while separate pipelines let each be optimized and then drift."],
    p: ["A feature computed in batch for training is approximated differently online, and the model reads values it never saw in training.", "A feature store outage leaves default values in place and ranking degrades with no error raised."],
    v: "Log the feature vectors served for a sample of requests, recompute them with the offline pipeline for the same documents and time, and confirm the values agree within tolerance for every feature.",
    dep: ["first-stage-scoring","document-entity-annotation","page-quality-model","personalization-and-locale","distributed-storage"]
  },
  "learned-ranking-models": {
    s: "Models trained on judged and behavioral data that score candidates from hundreds of features, replacing hand-tuned formulas with a function fitted to what people find relevant.",
    d: "Gradient-boosted trees or neural networks are trained with pairwise or listwise losses on labeled examples, then deployed as the second ranking stage on a few hundred candidates. Separate models may exist for query classes, languages or verticals. Outputs are calibrated so they can be compared with other stages. It is hard because training labels are biased by earlier rankings, because the model can exploit features that are easy to game, and because each release changes results for a large share of queries at once.",
    k: ["Trees vs neural rankers: trees are fast and robust on tabular features, while neural models capture text interaction but cost more per candidate.", "One global model vs per-class models: a global model shares statistical strength, while per-class models fit specific behavior at the cost of more models to train and maintain."],
    p: ["The model learns to prefer a feature that spammers can inflate, and spam rises before anyone notices.", "A retrain on fresh logs shifts results for an entire language because that slice had little data."],
    v: "Run the candidate model against a held-out judged set and against interleaved live traffic, and confirm both show a gain over the current model with no slice of language or query class regressing beyond its threshold.",
    dep: ["feature-assembly","ranking-model-training","first-stage-scoring"]
  },
  "neural-reranking": {
    s: "Re-scores the top few dozen results with a large text model that reads the query and document together, trading high per-document cost for better judgment of relevance.",
    d: "A cross-encoder or similar model takes the query and the document's title and best passage as one input and outputs a relevance score. Because of its cost it runs on only the top candidates from the learned ranker, often on accelerators, with strict batching and timeouts. Its score becomes a feature or the final order. It is hard because the model adds tens of milliseconds, because it needs a fallback when accelerators are saturated, and because it can be fooled by text written to look relevant.",
    k: ["Re-rank more documents vs fewer: more candidates raise the ceiling on quality, while fewer keep latency and accelerator cost controlled.", "Replace the order vs feed a score into the previous ranker: replacement is simpler and strong, while blending retains robustness against model quirks."],
    p: ["Accelerator saturation at peak causes timeouts and traffic silently falls back to the weaker order for part of the day.", "Long documents are truncated, so the model scores only the introduction and misses the relevant section."],
    v: "Compare judged-set quality with and without the stage, then load-test the stage at peak query rate and confirm the p99 added latency stays inside budget with the fallback rate near zero.",
    dep: ["learned-ranking-models","document-store-servers","tail-latency-control"]
  },
  "result-diversification": {
    s: "Reorders the final list so that results cover different interpretations and sub-topics of an ambiguous query instead of repeating the same one.",
    d: "After scoring, a diversifier selects results greedily: each next result is chosen for its relevance plus how much new coverage it adds over the ones already picked, using intent distributions, entity or topic labels and document similarity. It weights coverage by the probability of each interpretation. It is hard because the right amount of diversity depends on the query, because it can demote the single best answer for a specific query, and because coverage needs reliable topic labels that are themselves noisy.",
    k: ["Greedy marginal-relevance selection vs a learned list-level model: greedy selection is understandable and tunable, while list-level models can optimize the whole page but are harder to explain.", "Diversify always vs only for ambiguous queries: always diversifying hurts precise queries, while gating on ambiguity depends on intent classification being right."],
    p: ["A precise query gets diversified and the exact answer drops below weaker results.", "Near-duplicate pages are treated as different interpretations because the similarity measure is too strict."],
    v: "For a set of ambiguous queries confirm the top ten covers each major interpretation above its probability threshold, and for a set of specific queries confirm the order is unchanged from the ranker.",
    dep: ["learned-ranking-models","intent-classification","near-duplicate-detection","document-entity-annotation"]
  },
  "host-clustering": {
    s: "Limits how many results from one site appear on a page, grouping extra pages under the best one so a single domain cannot fill the results.",
    d: "After ranking, results are grouped by host or registered domain. The top result for each host is kept in place, with a limited number of additional results, sometimes indented as sub-results. Navigational queries may be allowed many results from one site. The clustering must be consistent across shards and pages of results, since deeper pages depend on the same grouping. It is hard because it must work on the merged ranked list, because pagination changes the groups, and because the right cap differs between a site-specific query and a broad one.",
    k: ["Cluster after ranking vs penalize repeated hosts inside the ranker: post-hoc clustering is simple and predictable, while in-model penalties adapt to the query but are harder to control.", "Strict cap vs query-dependent cap: a strict cap is uniform, while a dependent cap serves site-specific queries at the cost of intent-detection dependence."],
    p: ["A site-specific query is clustered into one result and the person cannot find the page they wanted.", "Page two groups differently from page one and the same site appears on both."],
    v: "Search for a broad topic where one site has many matches and confirm at most the configured number appear, and search for a name of that site and confirm multiple pages from it are shown.",
    dep: ["result-diversification","intent-classification","canonical-selection"]
  },
  "query-frontend": {
    s: "The entry point that receives each query, authenticates and classifies the request, runs query understanding, consults caches and dispatches to the serving tier.",
    d: "The frontend terminates connections, applies rate limits and bot checks, attaches locale and settings, and orchestrates the stages: understanding, cache lookup, fan-out, ranking, assembly. It maintains per-request deadlines that downstream calls inherit, and records a request trace with the identifiers needed for logging and debugging. It is hard because every request passes through it, so its latency and availability are the product's, and because it owns the logic for degrading when something downstream is unhealthy.",
    k: ["Thin router vs frontend that owns orchestration: a thin router is simple and stable, while an orchestrating frontend can degrade intelligently at the cost of concentrating complexity.", "Stateless frontends vs session-aware frontends: stateless instances scale and recover easily, while session awareness improves understanding but needs state lookups."],
    p: ["A deadline is not propagated to one downstream call, which keeps running after the client has gone and wastes capacity.", "A bad release of the frontend affects every query at once because there is no gradual traffic split."],
    v: "Trace a sample of requests end to end and confirm each stage's time and deadline are recorded; kill one downstream service and confirm the frontend returns degraded results within its deadline.",
    dep: ["query-parsing","result-cache","fan-out-and-aggregation","bot-and-scraper-defense","load-shedding"]
  },
  "fan-out-and-aggregation": {
    s: "Sends one query to every shard of an index in parallel and merges their partial top lists into a global ranking, returning once enough shards have answered.",
    d: "Documents are partitioned across many shards, so no shard can answer alone. A root node sends the plan to one replica of each shard, optionally through intermediate aggregators to limit fan-in, and merges sorted partial results. Statistics such as term frequencies may be gathered globally so that scores are comparable. It is hard because latency is set by the slowest shard, because the number of requests per query multiplies load, and because partial results must be handled when a shard misses its deadline.",
    k: ["Wait for all shards vs return when most have answered: waiting is complete, while returning early bounds latency and loses the results held by the missing shards.", "Flat fan-out vs a tree of aggregators: a tree reduces connection counts and merge work at the root, but adds a hop of latency."],
    p: ["Shard-local statistics are used for scoring and the same query ranks differently depending on which replica answered.", "Partial results are returned without being marked, and the person sees a degraded page that looks normal."],
    v: "Disable one shard and confirm the system returns a page within the deadline with the partial flag set and the loss in recall matching that shard's share of the documents.",
    dep: ["index-serving-replication","tail-latency-control","document-sharding","first-stage-scoring"]
  },
  "tail-latency-control": {
    s: "Techniques that keep the slowest responses from setting query latency: hedged requests, tied requests, selective replication, timeouts and cancellation of redundant work.",
    d: "With hundreds of shards per query, the chance that at least one is slow is high even if each is rarely slow. Hedging sends a duplicate request to another replica after a short delay and takes the first answer; tied requests tell the replicas about each other so the loser cancels. Slow machines are detected and drained, and background work such as compaction or garbage collection is scheduled to avoid overlapping on replicas of the same shard. It is hard because hedging adds load that can cause the very slowness it fights.",
    k: ["Hedge after a delay vs send to two replicas immediately: delayed hedging adds little load, while immediate duplication gives the best tail at double the cost.", "Aggressive timeouts vs patient waiting: tight timeouts protect the deadline and drop more partial results, while patience improves recall and risks missing the budget."],
    p: ["Hedging at saturation doubles load on already slow replicas and turns a slowdown into an outage.", "Cancellation is not honored by the shard and cancelled requests continue to consume CPU."],
    v: "Inject a slow replica at a known rate and confirm the p99 query latency with hedging stays close to the healthy baseline, and that total request volume rises by no more than the planned amount.",
    dep: ["fan-out-and-aggregation","index-serving-replication","load-shedding","monitoring-and-alerting"]
  },
  "index-serving-replication": {
    s: "Runs each index shard on multiple machines in several locations so queries survive failures and load can spread, with each replica serving an identical immutable index version.",
    d: "A shard's index files are loaded by serving processes, often memory-mapped so the operating system caches the hot parts. Replicas are placed across failure domains and receive new versions by copying files from storage rather than by replaying writes. Load balancers send queries to healthy replicas by load. A replica is only added to rotation when it has warmed its caches. It is hard because index data is large, replicas must be consistent across a version change, and cold replicas are slow until their caches fill.",
    k: ["Copy immutable files vs replicate updates: copying whole versions keeps replicas identical and simple, while update replication gets changes live sooner at the cost of divergence risk.", "Many small replicas vs fewer large machines: small replicas fail gracefully and rebalance easily, while large machines reduce fan-out and per-query overhead."],
    p: ["A new replica enters rotation cold and answers slowly until its cache warms, pushing up tail latency during every rollout.", "A single failure domain holds all replicas of one shard and one rack loss removes that part of the corpus."],
    v: "Fail one machine, then one rack, during peak load, and confirm queries continue with unchanged recall from surviving replicas and the replacement is warmed before it takes traffic.",
    dep: ["document-sharding","index-publish-and-rollout","distributed-storage","cluster-scheduling"]
  },
  "index-tier-routing": {
    s: "Sends each query to the high-quality tier first and only to lower tiers when that tier cannot supply enough good results, saving most of the cost of searching everything.",
    d: "The corpus is divided into tiers by expected usefulness: a small, fast tier of frequently useful documents, then larger tiers of the long tail. The router evaluates the plan against the first tier and consults later tiers when result counts or scores are too low, or for query classes known to need depth. Tiers can sit on different hardware, such as memory for the top tier and disk for the rest. It is hard because the decision to go deeper must be made quickly and often, and because tier assignment errors hide good documents.",
    k: ["Search top tier first, descend on demand vs query all tiers: staged search is far cheaper for most queries, while a flat search has no tier boundary to get wrong.", "Static tier membership vs dynamic promotion: static tiers are simple, while dynamic promotion adapts to demand and complicates builds."],
    p: ["A good page in a low tier is never retrieved for queries whose top tier results look sufficient.", "Descending to the lower tier is slow and its fallback rate creeps up until it is nearly every query."],
    v: "Measure the fraction of queries answered from the first tier alone and confirm that recall of judged relevant documents when searching all tiers differs from staged search by no more than the threshold.",
    dep: ["tier-assignment","index-serving-replication","query-plan-construction"]
  },
  "result-cache": {
    s: "Stores complete or partial result lists for repeated queries so popular searches return without touching the index, with expiry tuned to how quickly answers go stale.",
    d: "Keyed by normalized query, locale, settings and index version, the cache holds ranked lists, sometimes snippets, with a time to live based on query freshness needs. A large share of traffic is head queries, so hit rates are high. Entries are invalidated when a new index version is published or when events make a topic fresh. It is hard because personalized or time-sensitive results are uncacheable, because a hit rate hides a stale answer for news, and because a cold cache after a deployment sends a surge to the index.",
    k: ["Long expiry vs short expiry: long expiry saves more load, while short expiry keeps answers fresh for changing topics at the cost of more index traffic.", "Cache final pages vs cache candidate lists: page caching is cheapest per hit, while candidate caching lets personalization and layout vary after the lookup."],
    p: ["The cache key omits a setting such as safe search, and one person receives another's filtered or unfiltered results.", "A newsworthy event keeps being answered from a cache entry computed before it happened."],
    v: "Issue a head query twice and confirm the second is served from cache without shard traffic, then publish a fresh index version and confirm the entry is not served past its invalidation.",
    dep: ["query-frontend","index-publish-and-rollout","freshness-scheduling"]
  },
  "posting-list-cache": {
    s: "Keeps the posting lists and index blocks for frequent terms in memory on each shard, so common query terms avoid disk reads.",
    d: "Term frequencies on queries are highly skewed: a small set of terms accounts for most list reads. Each shard caches decompressed or compressed blocks by recency and frequency, and may cache intersections of frequent term pairs. The operating system page cache sits underneath. Sizing is a tradeoff between memory and the proportion of reads that hit. It is hard because cache contents depend on traffic that changes with events, and because a new index version invalidates cached blocks on every replica at once.",
    k: ["Cache raw blocks vs cache computed intersections: blocks serve many queries flexibly, while intersections give large savings for popular term pairs at the cost of memory and invalidation.", "Application-managed cache vs page cache only: application control allows smart eviction, while the page cache is simpler and shares memory with everything else."],
    p: ["After an index swap every replica starts cold together and disk reads spike across the fleet.", "A burst of unusual queries evicts the hot lists and slows normal traffic."],
    v: "Measure the hit rate and disk reads per query before and after loading a new index version with and without cache pre-warming, and confirm pre-warming keeps latency inside budget.",
    dep: ["index-serving-replication","lexical-candidate-retrieval"]
  },
  "document-store-servers": {
    s: "Servers holding the parsed text and metadata of each document, fetched after ranking to build snippets, titles and answer boxes for the results actually shown.",
    d: "The inverted index finds document identifiers, not text. A separate store keyed by document identifier keeps compressed content, fields and annotations, sharded and replicated like the index. After ranking, the frontend fetches records for roughly the top ten results, usually in one parallel round. Locality matters: records are laid out so a fetch costs one read. It is hard because it adds a second fan-out on the critical path, and because stored content must match the index version, or snippets and highlights disagree with the ranking.",
    k: ["Store full text vs only extracted passages: full text allows flexible snippets, while passages cut storage and fetch size but limit what can be shown.", "Separate store vs co-locate with the index shard: co-location saves a hop, while separation lets each scale and be tiered independently."],
    p: ["The document store lags the index by a version and results show a snippet that does not contain the query.", "A hot document is fetched constantly and overloads one replica."],
    v: "Fetch records for the top ten results of a sample of queries and confirm each exists at the same version as the index that ranked it, with fetch latency within budget at p99.",
    dep: ["index-serving-replication","distributed-storage","index-publish-and-rollout"]
  },
  "load-shedding": {
    s: "Deliberately reduces work under overload by skipping expensive stages, lowering result depth, serving cached answers or rejecting low-priority traffic, so the service stays up.",
    d: "Admission control measures queue depth and latency at each tier and switches to cheaper modes in steps: disable neural re-ranking, search fewer tiers, shorten snippets, serve stale cache, drop automated traffic, and finally reject. Each mode has a known quality cost. Priorities distinguish interactive users from batch clients. It is hard because overload spreads, since retries multiply load, and because degradation modes are rarely exercised and so often broken when needed.",
    k: ["Degrade quality gradually vs reject excess requests: degradation keeps serving everyone with lower quality, while rejection protects quality for those admitted at the cost of failed requests.", "Local decisions per tier vs global coordination: local shedding reacts fast, while coordinated shedding avoids wasted work upstream but adds delay and complexity."],
    p: ["Client retries during an overload multiply traffic and keep the system saturated after the original cause is gone.", "A degradation mode was never tested in production and fails when switched on."],
    v: "In a load test beyond capacity, confirm the system steps through its degradation modes in order, holds latency for admitted queries and recovers to full quality when load drops, with each mode exercised at least monthly.",
    dep: ["query-frontend","tail-latency-control","result-cache","monitoring-and-alerting"]
  },
  "regional-routing": {
    s: "Directs each query to a nearby serving location with a full index copy, and shifts traffic between locations for failures, maintenance and capacity.",
    d: "Each region holds complete serving stacks, so a query is answered within one region. A global load balancer chooses a location by proximity, capacity and health, and can drain a region for maintenance. Index versions roll out region by region. Data residency rules may restrict where certain data may be processed. It is hard because failing over a region doubles load on its neighbors, because a bad index or config reaches every region unless rollouts are staged, and because latency to the person has to be balanced against cache locality.",
    k: ["Full copy in every region vs regional subsets: full copies make regions interchangeable and resilient, while subsets cut cost and need cross-region calls for the rest.", "Proximity-first routing vs cache-affinity routing: proximity minimizes network time, while affinity increases cache hits and can send people farther away."],
    p: ["A regional failure sends its traffic to neighbors that lack the capacity, and the failure cascades.", "A rollout reaches all regions before a regression is detected."],
    v: "Drain one region during peak traffic and confirm users are redistributed with latency and error rates within thresholds, and that remaining regions stay under their capacity limits.",
    dep: ["index-serving-replication","index-publish-and-rollout","config-and-rollout","privacy-and-retention"]
  },
});
