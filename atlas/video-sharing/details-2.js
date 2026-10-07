// Details for the video sharing plate, part 2: metadata, search, recommendations.
ATLAS.details("video-sharing", {
  "metadata-store": {
    s: "The authoritative record of each video's title, description, owner, visibility, language, duration, rendition list and state, served to every other service at high read volume.",
    d: "Each video has a record keyed by an opaque id. Writes come from creators and the pipeline; reads come from nearly every page, API call and background job, so the store is fronted by caches and replicated read copies. The record separates fields creators edit from fields the pipeline and moderation set, so one cannot overwrite the other. Hard because visibility and takedown state must be correct everywhere quickly, while the volume of reads makes strong consistency expensive.",
    k: ["One wide record versus separate records per concern (creator-edited, pipeline, policy): one record is simple to read; separate records stop concurrent writers from clobbering each other but need joins.", "Cache with short expiry versus explicit invalidation on change: expiry is simple and bounded; explicit invalidation makes takedowns immediate but is hard to get complete."],
    p: ["A cache layer keeps serving a private or removed video after the record changed because invalidation missed one replica.", "A creator edit and a moderation action race, and the later write restores a hidden title."],
    v: "Change a video to private and request it from several regions and surfaces. All stop serving it within the documented propagation time, and an audit entry records who changed it and when.",
    dep: ["catalog-database", "data-sharding"]
  },
  "search-index": {
    s: "An inverted index over titles, descriptions, tags, captions and channel names that returns candidate videos for a query, updated within minutes of upload or edit.",
    d: "Documents are tokenized and written into index shards partitioned by video id; a query fans out to all shards and merges top results. Text fields carry different weights, and signals such as watch time, recency and language are stored for ranking. Updates stream in from the metadata store, with periodic full rebuilds. Hard because the index is large, the corpus changes constantly, deleted and private videos must disappear promptly, and relevance depends on behavior signals that arrive late.",
    k: ["Real-time incremental indexing versus batch rebuilds: incremental makes new uploads searchable quickly; batch is simpler and cheaper but leaves a delay and needs a separate path for deletions.", "Index transcripts versus titles and tags only: transcripts find content the creator never described; they multiply index size and bring in recognition errors."],
    p: ["A removed video stays in results because the delete event was dropped between the metadata store and the index.", "Spam titles stuffed with popular keywords dominate results when ranking trusts text over behavior."],
    v: "Upload a video with a unique phrase in its title and caption. It appears in search results within the freshness target; making it private removes it from results in a similar time.",
    dep: ["metadata-store", "data-sharding", "view-counting"]
  },
  "query-understanding": {
    s: "Interprets what a typed or spoken query means: spelling correction, language detection, synonyms, entity recognition and intent such as wanting a specific video, a topic, or the latest.",
    d: "Before retrieval, the query passes through steps that normalize it, correct typos, recognize names of people, shows and songs, and guess intent from the query and the viewer's context. The output expands or rewrites the query and sets ranking preferences, such as favoring recent uploads for news topics. It uses logs of past queries and clicks. Hard because queries are short and ambiguous, language varies, and the right interpretation of a trending term changes by the hour.",
    k: ["Aggressive query rewriting versus faithful matching: rewriting recovers from typos and synonyms; it can override what the user typed and return confusing results.", "Personalized interpretation versus global: personalization resolves ambiguity better; it makes results hard to reproduce, test and explain."],
    p: ["A correction model trained on old logs rewrites a new brand or show name into a common word.", "Intent detection treats a sensitive search as a request for something harmful and returns a poor or blocked result."],
    v: "Run a labeled set of queries with typos, mixed languages and entity names. The correct interpretation is chosen for at least the target share, and the top results change appropriately for a time-sensitive query.",
    dep: ["search-index", "engagement-signals"]
  },
  "autocomplete": {
    s: "Suggests completions as a viewer types, drawn from popular and personal queries, and must answer within tens of milliseconds for every keystroke.",
    d: "A prefix lookup structure holds popular queries scored by recent frequency, with a personal layer from the viewer's own history and a locale layer. Suggestions are filtered for policy and quality. Results are cached at the edge for common prefixes. Updates come from query logs on a short cycle so that trending terms appear quickly. Hard because latency is tight, the volume is the highest of any request type, and suggestions can expose private searches or offensive terms if filtering fails.",
    k: ["Precomputed suggestion tables versus live query-log lookups: precomputed is very fast and cacheable; it lags behind trends and needs a separate pipeline.", "Including personal history versus only global suggestions: personal suggestions are more useful; they leak private searches on shared devices and complicate caching."],
    p: ["An offensive or defamatory completion appears for a person's name because it was frequent in logs.", "A shared device shows one user's sensitive searches to the next user."],
    v: "Type common and rare prefixes against a test environment. Ninety-ninth percentile latency stays within target, blocked terms never appear, and a newly trending query appears within the stated refresh time.",
    dep: ["query-understanding", "policy-classifiers"]
  },
  "chapters-and-auto-tags": {
    s: "Splits a video into labeled sections and attaches topic, language and speech transcripts, from creator markup or from models run on the audio and frames.",
    d: "A pipeline job extracts audio and sampled frames, runs speech recognition, language identification and visual classifiers, and writes transcripts, topics and suggested chapter boundaries back to the metadata store. Creators can accept, edit or hide the results. Outputs feed search, captions, recommendations and policy checks. Hard because model errors reach viewers, the compute cost scales with total uploaded hours, and languages and accents vary widely in accuracy.",
    k: ["Run models at upload time versus lazily on first watch: at upload makes everything searchable at once; lazy saves the cost for videos nobody ever watches.", "Auto-publish generated chapters versus creator approval: auto-publish scales; wrong boundaries or labels reflect on the creator and mislead viewers."],
    p: ["Transcripts of music or noisy speech produce confident nonsense that is then indexed and used for recommendations.", "A model upgrade changes outputs for existing videos and silently shifts search results."],
    v: "Process a set of videos with known chapter markers and transcripts. Word error rate and chapter boundary offsets stay within thresholds per language, and creator edits are preserved when the models are rerun.",
    dep: ["transcode-scheduler", "metadata-store", "audio-normalization"]
  },
  "thumbnail-selection": {
    s: "Produces candidate still images from the video, filters poor ones, and lets creators upload or test alternatives, since the thumbnail strongly drives whether a video is clicked.",
    d: "Frames are sampled during transcoding and scored for sharpness, faces, brightness and absence of text or unsafe content. A few candidates are offered to the creator, who can also upload a custom image after a policy check. Some platforms run controlled tests that show different thumbnails to different viewers and keep the winner. Hard because images are served at huge volume in many sizes and the images are an attack surface for misleading and unsafe content.",
    k: ["Automatic choice versus creator-supplied only: automatic gives every video a usable image; creator control produces better results but many uploads end up without a good one.", "Per-viewer thumbnail testing versus a single fixed image: testing raises engagement; it complicates caching, analytics attribution and consistency of what a shared link shows."],
    p: ["A custom thumbnail skips the safety checks applied to the video and carries explicit or misleading content.", "Image sizes are generated on demand without caching and overload the image service during a viral event."],
    v: "Upload a video with several scenes. The offered candidates exclude black frames and blur, a custom upload passes through the policy classifier, and the served image matches the chosen one in every size.",
    dep: ["segmenting-and-packaging", "policy-classifiers", "metadata-store"]
  },
  "candidate-generation": {
    s: "Narrows the whole catalog to a few hundred plausible videos for a viewer, using fast retrieval methods such as embeddings, co-watch graphs and subscriptions.",
    d: "Several retrievers run in parallel: nearest neighbors in an embedding space built from viewing behavior, videos watched together, recent uploads from subscribed channels, trending items and topic-based lists. Their outputs are merged and deduplicated. Retrieval must run in tens of milliseconds over hundreds of millions of items using approximate search indexes that are rebuilt regularly. Hard because retrievers bias toward already popular content and new videos have no behavior to place them anywhere.",
    k: ["One embedding retriever versus several specialized retrievers: one is simpler to maintain; several cover subscriptions, freshness and exploration that one model overlooks, at the cost of merging logic.", "Approximate nearest neighbor with periodic rebuilds versus exact search: approximate is fast at scale; recall loss and index staleness hide good items."],
    p: ["Retrieval returns mostly the most popular items, so new creators never get a first audience.", "An index rebuild fails and retrieval silently serves yesterday's catalog, including removed videos."],
    v: "Offline, measure recall of videos a viewer actually watched next against retrieved sets, and online confirm latency. Recall meets the target and the sets include fresh uploads from subscribed channels.",
    dep: ["feature-pipeline", "engagement-signals", "subscription-graph", "catalog-database"]
  },
  "ranking-models": {
    s: "Scores each candidate for a viewer with a learned model that predicts clicks, watch time and satisfaction, then orders the list shown.",
    d: "A model takes features about the viewer, the video and the context and predicts several outcomes: click, watch fraction, like, and survey-reported satisfaction. A final score combines them using weights chosen by product teams. Models are retrained often on logged feedback and served within a strict latency budget. Hard because the target is a proxy for what people actually want: optimizing clicks alone rewards misleading thumbnails, and feedback loops reinforce whatever was shown before.",
    k: ["Optimizing predicted clicks versus predicted watch time and satisfaction: clicks are plentiful and quick to measure; satisfaction targets reduce bait but rely on sparse survey data.", "Large model with fewer candidates versus small model over many: a large model ranks better but forces tight candidate limits and higher serving cost."],
    p: ["Training data reflects only what the old system showed, so the model never learns about content it never surfaced.", "A new model improves a metric offline and degrades a long-term one such as return visits."],
    v: "Run the candidate model against a holdout replay set and then a small live experiment. Offline ranking metrics improve, serving latency stays in budget, and the long-term retention metric does not decrease.",
    dep: ["candidate-generation", "feature-pipeline", "engagement-signals"]
  },
  "feature-pipeline": {
    s: "Computes and serves the inputs the retrieval and ranking models use, such as viewer history aggregates and video statistics, identically for training and for live requests.",
    d: "Batch jobs compute slow-moving features like long-term interests, while streaming jobs update fast ones such as views in the last hour. Values are written to a low-latency store for serving and to a historical store for training, with point-in-time correctness so training sees only what was known then. Hard because a feature computed differently online and offline silently degrades the model, and freshness and cost pull in opposite directions.",
    k: ["One shared feature definition for both training and serving versus separate code paths: shared definitions prevent skew; they constrain what can be expressed and slow experimentation.", "Streaming updates versus hourly batch: streaming reacts to trends within minutes; batch is cheaper and easier to repair and backfill."],
    p: ["Training joins features computed after the event, leaking the future and producing models that look excellent offline and fail live.", "A broken upstream job leaves features stale with no alert, so ranking quietly worsens."],
    v: "Pick a sample of live requests, recompute their features from the historical store as of request time, and compare. Differences stay under a small tolerance and freshness lag stays within the stated limit.",
    dep: ["stream-aggregation", "event-warehouse", "engagement-signals"]
  },
  "engagement-signals": {
    s: "The record of viewer behavior used as feedback: impressions, clicks, watch fraction, likes, shares, skips, searches and explicit not-interested and survey answers.",
    d: "Players and pages emit events that are deduplicated and joined to what was shown. Implicit signals such as watch time are plentiful and noisy; explicit ones are rare but clearer. The system must record impressions, not just clicks, or it cannot know what viewers passed over. Hard because bots and accidental plays pollute the data, signals mean different things for a ten-second clip and a three-hour lecture, and viewers can delete their history.",
    k: ["Logging every impression versus sampled impressions: full logging gives unbiased training data; sampling cuts storage and processing considerably but hurts rare-item learning.", "Treating watch time as satisfaction versus requiring explicit feedback: watch time is plentiful; it rewards length and autoplay rather than value."],
    p: ["Autoplay inflates watch time and trains the model to favor content people did not choose.", "History deletion removes the user's page but not the derived training data, breaking promises to the viewer."],
    v: "Play and skip a set of videos on a test account. Impression, click, watch fraction and skip events appear in the pipeline joined to the right recommendation request, and a history delete removes them from downstream stores.",
    dep: ["playback-event-collection", "view-counting"]
  },
  "diversity-and-policy-filters": {
    s: "Rules applied after ranking that remove ineligible videos, avoid repetition, demote borderline content and mix sources, so the final list is acceptable beyond a high score.",
    d: "A post-ranking stage drops removed, restricted and age-inappropriate items for this viewer, limits how many videos come from one channel or topic, demotes borderline material and promotes authoritative sources for sensitive subjects. It also enforces product rules, such as not repeating recently shown videos. Hard because rules interact with the model, each rule hides items from creators who cannot see why, and the same filters must be applied identically on every surface.",
    k: ["Hard filters versus score penalties: hard filters guarantee a rule; penalties are softer and allow a strong item through, which is sometimes wrong for safety.", "Per-surface rules versus one shared rule set: shared rules stay consistent; per-surface rules fit differing contexts such as kids' experiences but drift apart."],
    p: ["A new surface ships without the shared filters and recommends restricted videos.", "Over-demotion of a topic quietly removes whole communities of creators from suggestions."],
    v: "Feed a list containing removed, age-restricted, region-blocked and borderline videos through every surface for a test account profile. None of the ineligible items appear, and channel and topic repetition limits hold.",
    dep: ["age-and-region-gating", "policy-classifiers", "ranking-models"]
  },
  "home-and-up-next": {
    s: "The surfaces where recommendations appear: the home feed, the suggestions beside a video, the autoplay next item and notifications, each with its own context and goals.",
    d: "Each surface calls the retrieval and ranking stack with different context. The home feed is open-ended exploration; suggestions beside a video stay related to it; autoplay picks one item with high confidence; notifications must justify interrupting. Results are assembled from several rankers, cached briefly per viewer, and logged with the request id for later learning. Hard because each surface needs a distinct objective yet shares models and filters, and latency counts against page load.",
    k: ["Per-surface objectives versus one global score: separate objectives fit each context; they multiply models to maintain and make results across surfaces feel inconsistent.", "Precomputing feeds per viewer versus computing on request: precomputed is fast and cheap; it goes stale and wastes work for viewers who never return."],
    p: ["Autoplay chains drift away from what the viewer started with, ending in unrelated or unsuitable content.", "Caching a feed too long shows videos already watched or removed."],
    v: "Open the home feed, a watch page and finish a video on a test account. Each surface shows an appropriate list within its latency budget, with no already-watched or ineligible entries, and each request is logged with its id.",
    dep: ["ranking-models", "diversity-and-policy-filters", "candidate-generation", "api-gateway"]
  },
  "experiment-framework": {
    s: "Assigns viewers to variants of a model, ranking rule or interface, measures the difference in behavior, and gates what ships to everyone.",
    d: "Viewers are hashed into stable buckets per experiment, with layers so independent experiments do not collide. Metrics come from the event warehouse: watch time, return rate, complaints and creator-side measures. Results are checked for statistical significance and for harm in sub-groups before ramp-up. Hard because effects are small, viewers return over weeks, interference between experiments is real, and short-term gains can hide long-term losses.",
    k: ["Many concurrent experiments in layers versus one at a time: layers give throughput; they allow interactions that are hard to detect and attribute.", "Short experiments on proxy metrics versus long holdouts: short runs decide quickly; long holdouts catch slow harm but delay launches."],
    p: ["A change in event logging during the experiment looks like a treatment effect.", "Peeking at results daily and stopping when significant produces false wins."],
    v: "Run an A/A test with no real change. The measured difference between groups is not significant at the expected false-positive rate, and bucket assignment is stable for a viewer across devices and sessions.",
    dep: ["event-warehouse", "stream-aggregation", "engagement-signals"]
  },
});
