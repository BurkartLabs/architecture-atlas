// Details for the music streaming plate, part 2: social features, search, recommendations.
ATLAS.details("music-streaming", {
  "friend-graph": {
    s: "Stores who follows whom among listeners and artists, with mutual and blocked relationships, and answers neighbor and membership queries for feeds and sharing.",
    d: "Edges are directed follows plus optional mutual friendship, stored as adjacency lists keyed by user in both directions so both followers and followees can be listed. Counts are kept as denormalized counters. Blocks remove visibility in both directions and must be checked by every feature that surfaces another person. Importing contacts or external social connections seeds the graph. Artists with millions of followers make the follower list a hot, enormous row, and the graph is also a privacy surface.",
    k: ["Asymmetric follows vs mutual friendship: follows scale to artists and need no consent; mutual friendships suit private sharing but add an approval flow.", "Exact follower counts vs approximate counters: exact is correct for small accounts; approximate counters avoid write hotspots on very popular artists."],
    p: ["Checking blocks only in the profile view lets a blocked user still appear in feeds and shared sessions.", "Treating a follower list as public by default exposes private listeners to scraping."],
    v: "Block a user and confirm they disappear from feed, search, suggestions and shared sessions within the stated delay, while the follower count of both accounts updates once and not twice.",
    dep: ["user-data-store","profile-and-privacy","identity-and-sessions"]
  },
  "activity-feed": {
    s: "Shows what friends and followed artists are listening to or releasing, built by fanning events out to the people who may see them.",
    d: "When a listener plays something and has sharing on, an event is written and either pushed into followers' feeds at write time or assembled at read time from the people they follow. Entries are collapsed, since fifty plays by one friend become one row. Releases from followed artists join the same stream. Visibility rules and private sessions filter every entry. The usual fan-out dilemma applies: a celebrity's event must not be written into a million inboxes, while ordinary users should read fast.",
    k: ["Fan-out on write vs on read: write-time makes reads cheap and fits ordinary accounts; read-time avoids huge write bursts for popular accounts, and many systems mix both by account size.", "Real-time presence vs periodic refresh: live feeds feel social but need long-lived connections; periodic refresh is far cheaper and sufficient for most listeners."],
    p: ["Showing a friend's track after they unshared it or switched to private session breaches their expectation.", "Fan-out to inactive users spends storage and writes on feeds nobody ever opens."],
    v: "Have an account with 5,000 followers play a track and confirm the entry reaches active followers within the target delay, never reaches a blocked follower, and does not appear when private session is on.",
    dep: ["friend-graph","event-pipeline","profile-and-privacy","user-data-store"]
  },
  "shared-listening": {
    s: "Lets several people hear the same track at the same position, with shared control of the queue, through a synchronized session hosted by the backend.",
    d: "A host creates a session and invites others, each client joins over a persistent channel. The session holds the queue and a reference position, defined as a server timestamp and track offset. Each client computes where it should be, compensates for its own measured latency, and corrects drift by small seeks or rate adjustment. Participants may need their own license state, since a free-tier listener joining a premium host session is a policy question. Synchronization is hard because device output latency differs by hundreds of milliseconds.",
    k: ["Server clock reference with client correction vs peer-to-peer sync: server reference is simple and consistent; peer-to-peer lowers latency but fails behind restrictive networks.", "Each participant streams their own copy vs one stream relayed: separate streams respect per-listener rights and quality; relaying saves bandwidth but breaks rights and offline rules."],
    p: ["Correcting drift with hard seeks every few seconds makes the audio stutter for everyone.", "Letting a participant without the right plan hear the full track undermines licensing for the feature."],
    v: "Join one session from three devices on different networks, play for ten minutes, and confirm recorded outputs stay within the target offset, such as 100 ms, throughout and after a pause and resume.",
    dep: ["device-handoff","play-queue-state","plan-entitlements","stream-resolver"]
  },
  "sharing-and-deep-links": {
    s: "Creates links and cards for tracks, playlists and profiles that open the right content in the app or on the web, with previews and attribution for where the share came from.",
    d: "A share link carries an entity id and a short-lived source token that records who shared it. Opening it routes to the app if installed, else a web player or store page, and keeps the target through install. Social platforms fetch a preview with title, artwork and a short audio clip. Short links are resolved server side. The hard cases are handling an entity that has since merged or been withdrawn, availability that differs for the recipient's country, and protecting recipients from tracking they did not consent to.",
    k: ["Opaque short links resolved server side vs plain entity URLs: short links allow redirects, analytics and merges; plain URLs are transparent and cache well but break when entities change.", "Preview clips served openly vs behind login: open previews drive discovery but must be limited to licensed clip lengths and rates."],
    p: ["A link to an entity that was merged into another returns not found instead of redirecting.", "Embedding the sharer's identifiers in a public link reveals who shared it to anyone who receives it."],
    v: "Share a playlist link from one account, open it in a logged-out browser and in a phone with the app installed, and confirm both land on the playlist with a correct preview and a recorded source.",
    dep: ["entity-identity-model","metadata-serving-store","territory-availability","identity-and-sessions"]
  },
  "creator-profiles": {
    s: "The artist and creator pages and tools: profile, discography, bios, follower statistics and the controls through which artists see how their music is performing.",
    d: "A profile aggregates data from the catalog (releases, credits), editorial content, social counts and licensed media. A separate creator tool shows listener counts, geography, playlist adds and royalty estimates, drawn from aggregated pipelines with privacy thresholds. Claiming and verifying an artist identity links a person to a catalog entity, which needs proof and protection against impersonation. Profiles must pick which of many same-name artists a release belongs to, which is the same problem as catalog disambiguation.",
    k: ["Verified claim by a human review vs automated link from the distributor: review prevents impersonation but is slow; automatic linking scales but trusts the supplier.", "Near-real-time artist stats vs daily batch: real-time rewards releases but needs a streaming path and approximations; daily batch is exact and cheap."],
    p: ["Showing counts for a handful of listeners can identify individuals, so small segments need minimum thresholds.", "A verified badge granted to the wrong same-name artist sends fans and payouts to the wrong person."],
    v: "Release a track and confirm that within the stated delay it appears on the correct profile, counts in the creator dashboard match the aggregated play events, and segments under the threshold are suppressed.",
    dep: ["artist-disambiguation","usage-aggregation","metadata-serving-store","friend-graph"]
  },
  "year-in-review": {
    s: "A once-a-year personalized summary of what a listener played, computed from the full history and presented as shareable stories.",
    d: "A batch job processes a year of history per user to compute top tracks, artists, genres, minutes played and distinctive patterns, writes results to a serving store, and the client reads a prebuilt document at launch. Because everyone opens it within days, it is a planned traffic event, so data is precomputed and static assets are cached at the edge. The work includes filtering private sessions, fraud and duplicates, and keeping statistics consistent with the royalty-grade counting.",
    k: ["Precompute for all users vs compute on first open: precompute gives instant, stable results but spends compute on inactive accounts; on-demand saves work and risks a spike on launch day.", "Counting plays by the royalty rule vs by raw events: royalty counting is defensible and consistent with artist numbers; raw events match what listeners remember."],
    p: ["Including private sessions or children's profiles in shareable results exposes data the listener chose to hide.", "A cutoff date that differs between the summary and the artist's own report triggers complaints about mismatched numbers."],
    v: "Compare one test account's summary against a manual count from its raw history, excluding private sessions, and confirm top-five lists and total minutes match; load-test the read path at launch-day volume.",
    dep: ["data-lake","listening-history","stream-qualification","profile-and-privacy"]
  },
  "query-understanding": {
    s: "Interprets what a typed or spoken query probably means, classifying intent such as artist, track, playlist or mood, and rewriting it for retrieval.",
    d: "The query is normalized, tokenized and passed through classifiers that estimate intent and recognize entities by lookup against the catalog's names. It may expand synonyms, split a combined 'artist song' query, detect language, and add context such as the listener's market and recent behavior. Output is a structured query for the index plus intent probabilities used in ranking. Short, ambiguous queries are the norm, and the same words mean different things to different listeners.",
    k: ["Learned intent classifier vs rules and dictionaries: learned models handle novel queries and shifts; rules are predictable, debuggable and quick to patch when a release goes viral.", "Using the listener's history to disambiguate vs treating all users alike: personal context resolves ambiguity better, but makes results hard to reproduce and to explain."],
    p: ["Aggressive rewriting turns a precise query for an obscure artist into a popular lookalike.", "A dictionary that lags behind new releases fails exactly on the queries people care about most on release day."],
    v: "Replay a labeled set of several thousand queries and confirm the predicted intent and entity match the labels at the target accuracy, with a separate report for new releases less than a week old.",
    dep: ["catalog-search-index","spelling-and-transliteration","listening-history"]
  },
  "catalog-search-index": {
    s: "An inverted index over names, titles, credits and playlists that retrieves matching entities quickly and stays up to date as the catalog changes.",
    d: "Documents are built per entity with fields for names, aliases, titles and popularity signals. Text is analyzed per language, with prefix and n-gram variants for partial matches. The index is sharded across machines, replicated for read load, and updated by a stream of catalog changes so new releases become searchable within minutes. Separate indexes may serve tracks, albums, artists and user playlists. Scale is not the issue so much as freshness and the sheer number of near-duplicate documents.",
    k: ["One index of all entity types vs one per type: one index allows blended results with a single query; separate indexes tune analysis and ranking per type but need a merge step.", "Near-real-time updates vs periodic rebuilds: streaming updates make releases findable quickly but add write load; rebuilds are simple and consistent but stale."],
    p: ["Indexing a withdrawn track after its takedown keeps it in results and violates a legal requirement.", "Treating all aliases as equal ranks a stage name below a rarely used legal name."],
    v: "Publish a new release and measure the time until it is returned by an exact title query, then take it down and confirm it is absent from results within the takedown deadline.",
    dep: ["metadata-serving-store","event-pipeline","update-and-takedown-handling","entity-matching"]
  },
  "autocomplete": {
    s: "Suggests completions after each keystroke, within a few tens of milliseconds, drawn from popular queries and catalog names.",
    d: "Suggestions come from a compact prefix structure holding popular queries, entity names and recent personal searches, scored by popularity, recency and personal affinity. Clients send each keystroke after a short debounce and cancel stale requests. The service is in the request path of every search and must answer from memory at the edge or in a nearby region. The hard problems are latency, filtering offensive or legally problematic suggestions, and not suggesting items that are unavailable to this listener.",
    k: ["Server prefix lookup per keystroke vs a downloaded local dictionary: server lookup sees the newest names and personalizes; local is instant and offline but stale and larger.", "Suggest queries vs suggest entities directly: queries lead into a full search; direct entities save a step and need availability checks inline."],
    p: ["Suggesting a take-down or unavailable item sends the listener to a dead end.", "Learning suggestions from raw queries lets abusive or manipulated searches surface to everyone."],
    v: "Type a known artist name character by character and confirm each response arrives under the latency budget at the 99th percentile, the right entity appears by a stated prefix length, and blocked terms never appear.",
    dep: ["catalog-search-index","query-understanding","availability-resolver"]
  },
  "spelling-and-transliteration": {
    s: "Maps misspelled, phonetic and cross-script queries to catalog names, so 'beyonse' or a name typed in another alphabet still finds the artist.",
    d: "The component applies edit-distance correction against the vocabulary of names, phonetic keys for sound-alike matches, and script conversion between writing systems, with stored transliterations as aliases on catalog entities. Corrections are weighted by how popular the corrected name is, and uncertain ones are shown as 'did you mean' instead of replacing the query. Names are hard because they are not words: stylized spellings, symbols and deliberate misspellings are the correct form.",
    k: ["Automatic correction vs suggesting only: automatic saves a step when right but wrongly overrides unusual real names; suggestions are safer and cost a click.", "Aliases curated in the catalog vs inferred from logs: curated is accurate and reviewable; log-inferred coverage is wide but picks up systematic mistakes."],
    p: ["Correcting a deliberately odd artist name to a common word makes that artist unfindable.", "Transliteration rules applied per language, not per name, produce wrong spellings for artists known by a particular romanization."],
    v: "Run a labeled set of misspellings and cross-script queries and confirm the intended entity is in the top results at the target rate, and that a set of intentionally unusual names is never auto-corrected.",
    dep: ["catalog-search-index","query-understanding","artist-disambiguation"]
  },
  "search-ranking": {
    s: "Orders retrieved candidates by predicted relevance for this listener, blending text match, popularity, intent, personal affinity and availability.",
    d: "A first pass retrieves a few hundred candidates; a second pass scores them with a model using features such as text match quality, global and regional popularity, whether the listener has played or saved the item, and the predicted intent. Results from different entity types are blended into one list or sectioned into top result and groups. Unplayable items are filtered or demoted. Evaluation relies on click and play logs, which are biased by what was shown before, so offline judgments and online experiments are both needed.",
    k: ["A learned ranker vs hand-tuned weights: learned handles interactions among features and adapts; hand weights are transparent and safe for the exact-match case users expect to be first.", "Strong personalization vs mostly global ranking: personal ranking wins on ambiguous queries but makes the same query give different answers, which is confusing in support and demos."],
    p: ["Training only on clicks reinforces the already-ranked results and starves new releases.", "Ranking a cover or karaoke version above the original because it is more popular this week."],
    v: "On a labeled judgment set, confirm the exact-title match is first for at least the target share of queries, and an online experiment shows play-through rate on search results does not fall.",
    dep: ["query-understanding","catalog-search-index","ranking-model","availability-resolver"]
  },
  "voice-search": {
    s: "Turns spoken requests such as 'play something upbeat' into structured queries and actions through speech recognition tuned to music names.",
    d: "Audio is transcribed by a speech recognizer, whose vocabulary is biased toward catalog names, then passed to query understanding with a voice-specific intent set: play, add, skip, what's playing. Names that sound alike and foreign-language titles are common errors, so the system maps phonetic hypotheses against the catalog and may ask for clarification. Smart speakers and cars impose their own integrations, rules and latency. Transcription errors and ambiguous commands need a graceful fallback, not silence.",
    k: ["Vocabulary biasing on catalog names vs a general recognizer: biasing finds odd names but must be refreshed daily; general recognition is stable and misses most stylized artist names.", "Execute the best guess vs confirm first: executing is fast and right most of the time; confirming avoids the wrong song at the cost of a conversation."],
    p: ["A catalog vocabulary refreshed weekly misses names that became popular since.", "Playing explicit content on a household device because the voice profile was not matched to the child's restrictions."],
    v: "Speak a labeled set of 500 music requests across accents and ambient noise and confirm the intended entity is played or offered in the top two at the target rate.",
    dep: ["query-understanding","spelling-and-transliteration","content-rating-rules"]
  },
  "entity-page-assembly": {
    s: "Builds the album, artist, playlist and track pages from many sources into one response, adding availability, personalization and links.",
    d: "A page request fans out to the metadata store for core fields, the rights layer for what is playable, the library for saved state, the social graph for friends who play it, recommendation for related items and editorial for features. The assembler applies timeouts and returns partial pages when a slow dependency fails. Results are layered: shared public parts are cached at the edge, personal parts added per request. Complexity comes from the fan-out: one slow call can delay all, so budgets per dependency are required.",
    k: ["Server-side assembly vs client composition from several calls: server assembly reduces round trips and hides internals; client composition is flexible but slow on mobile networks.", "Cache the whole page vs cache fragments: whole page is simplest and fastest, but cannot hold personal data; fragments allow mixing public and personal at a cost of assembly work."],
    p: ["Waiting for every dependency before returning makes the page as slow as its slowest optional widget.", "Caching a page with availability computed for one country and serving it to another."],
    v: "Load an artist page with the social and recommendation services deliberately stalled and confirm the page still renders within budget with those sections absent, and shows availability correct for the listener's country.",
    dep: ["metadata-serving-store","availability-resolver","saved-library","service-gateway"]
  },
  "candidate-generation": {
    s: "Narrows tens of millions of tracks to a few thousand plausible ones per listener using several cheap retrieval strategies, before expensive ranking runs.",
    d: "Multiple sources contribute candidates in parallel: nearest neighbors of recent listening in embedding space, items from similar listeners, new releases by followed artists, popular items in the listener's region, and editorial picks. Each source is cheap and approximate, using precomputed lists or approximate nearest-neighbor indexes. Candidates are merged and deduplicated, and unavailable or already-heard items are removed. Recall matters: whatever is not retrieved can never be ranked into view, and candidate bias is invisible downstream.",
    k: ["Many specialized sources vs one general model: many sources cover distinct needs such as freshness and exploration and are debuggable; one model is simpler but misses cases it is not trained for.", "Precomputed candidates per user vs computed at request time: precomputed is fast and cheap but stale; request-time uses fresh context and costs latency and compute."],
    p: ["A nearest-neighbor index built from last week's embeddings never retrieves tracks released since.", "Candidates dominated by popular items shrink the variety listeners see over months."],
    v: "Measure recall: for held-out later listens, the share that appeared in the generated candidate set, per source and overall, and confirm new releases less than a day old appear in candidates.",
    dep: ["content-embeddings","collaborative-filtering","listening-history","availability-resolver"]
  },
  "ranking-model": {
    s: "Scores each candidate for this listener and context using a learned model over user, item and context features, and orders them for display.",
    d: "A supervised model predicts outcomes such as play-through, save or skip, from features: listener history aggregates, item popularity and audio traits, time of day, device, and the surface being ranked. Features come from an online store kept consistent with training data. Predictions across several objectives are combined into one score with weights set by product goals. Training uses logged impressions, which were selected by the previous system, so exposure bias must be corrected. Latency caps model size.",
    k: ["Predicting skip and play-through vs predicting long-term retention: short-term signals are plentiful and quick to evaluate; retention is what matters but is slow, noisy and hard to attribute.", "A large model at request time vs distilled or tiered models: large models rank better but cost latency and compute; tiered ones fit the budget."],
    p: ["Training features computed differently from serving features silently degrade ranking without any error.", "Optimizing play counts alone favors loud, short, familiar tracks over what listeners value."],
    v: "Compare ranked output offline using held-out sessions, then run an online experiment confirming the new model's long-horizon retention and skip rates are no worse than control before ramp.",
    dep: ["candidate-generation","content-embeddings","listening-history","recommendation-experiments"]
  },
  "content-embeddings": {
    s: "Vector representations of tracks, artists and listeners learned from audio, metadata and listening behavior, so similarity becomes distance.",
    d: "Track vectors come from audio models over spectrogram content, from text on tags and lyrics, and from co-listening patterns, often combined. Listener vectors are derived from the vectors of what they play. Vectors are stored in an approximate nearest-neighbor index for retrieval and fed as features to rankers. Audio-based embeddings solve the cold start problem, because a new track has no listening data yet but has sound. They are retrained periodically, and each retraining changes every vector, so downstream consumers must change together.",
    k: ["Audio-derived vs behavior-derived embeddings: audio works for brand-new and obscure tracks; behavior reflects taste and context that sound alone does not capture; most systems combine both.", "Frequent retraining vs stable versions: frequent keeps up with trends; stability protects downstream models trained on old vector spaces."],
    p: ["Mixing vectors from two training runs in one index produces nonsense neighbors that look plausible.", "Embeddings trained on listening alone encode popularity bias, so obscure music clusters apart from the mainstream."],
    v: "Sample known similar pairs, such as covers or same-artist tracks, and confirm they sit among each other's nearest neighbors at the target rate, and that a brand-new track gets sensible neighbors within hours.",
    dep: ["audio-analysis","data-lake","metadata-serving-store"]
  },
  "collaborative-filtering": {
    s: "Finds music through the behavior of similar listeners, learning from who played what together, without needing to understand the audio.",
    d: "A user-item interaction matrix, with implicit signals such as plays, saves, skips and repeats, is factorized or modeled by neural networks to produce listener and item vectors. Recommendations are items near the listener or liked by neighbors. Training runs in batch on the data lake and is refreshed frequently. It works well for popular music and badly where data is sparse: new tracks, new listeners, niche genres. Implicit feedback is noisy, since a play is not a like and a skip can mean many things.",
    k: ["Implicit signals weighted by confidence vs treating all plays alike: weighting separates a repeated favorite from a background play; it needs tuning of what each action means.", "Global model vs per-region models: global shares statistical strength; regional models respect local taste and licensing."],
    p: ["Treating a play on a shared household account as one person's taste produces strange recommendations.", "Plays generated by looping or bots inflate similarity between unrelated items."],
    v: "Hold out each listener's last week of plays, train on earlier data, and confirm the share of held-out tracks recovered in the top recommendations exceeds a popularity baseline by the target margin.",
    dep: ["data-lake","listening-history","artificial-streaming-detection"]
  },
  "radio-and-autoplay": {
    s: "Keeps music playing when a context ends or the listener asks for similar music, by continuing from a seed with a stream of related, varied tracks.",
    d: "A seed such as a track, artist or playlist defines a station. The service retrieves related items, ranks them for the listener, applies rules for artist spacing, freshness and not repeating recent plays, and appends them to the queue in small batches. Feedback during playback, such as skips and likes, adjusts upcoming picks. Autoplay does the same when a queue ends. Constraints from licensing also matter: some plans limit skips or on-demand selection, so the station must respect them.",
    k: ["Familiar tracks vs discovery within a station: familiar keeps listeners comfortable; discovery builds long-term engagement but raises skips and complaints.", "Computing a whole sequence ahead vs picking next tracks one at a time: ahead enables smooth flow and prefetch; one at a time reacts to skips but cannot plan transitions."],
    p: ["Ignoring recent plays plays the same track twice in a short session.", "Ignoring skip limits on a free plan creates a license violation in a feature that looks like a normal station."],
    v: "Start a station from a seed, skip five tracks, and confirm later picks move away from skipped styles, no artist repeats within the spacing rule, and skip limits for the plan are enforced.",
    dep: ["candidate-generation","ranking-model","play-queue-state","plan-entitlements"]
  },
  "editorial-curation": {
    s: "Human-made playlists and features by editors who select, sequence and promote music, supplying context and quality that models cannot judge.",
    d: "Editors use internal tools to build playlists, schedule updates, place them on surfaces, and tag tracks with mood, genre and language. Their picks become high-trust signals for models and for new-music launches. Placement is time-bound, regional and sometimes tied to commercial agreements, so tools must make promotional placements labeled and auditable. Editorial lists attract the biggest audiences in the catalog, so changes need review, scheduling and rollback because a mistake is seen by millions.",
    k: ["Editorial placement vs algorithmic placement: editors catch quality and cultural context and give artists predictable exposure; algorithms scale to personal taste and cost nothing per list.", "Region-specific curators vs a global team: local curators know scenes; a global team is cheaper and misses local relevance."],
    p: ["A scheduled update that publishes a track unavailable in some regions leaves a gap in a prominent list.", "Unlabeled paid placement mixed with editorial picks breaks both trust and some regulations."],
    v: "Schedule an update to a high-traffic playlist, preview it in three regions, publish at the set time and confirm availability gaps are flagged beforehand and the previous version can be restored in one action.",
    dep: ["playlist-service","availability-resolver","metadata-schema"]
  },
  "home-feed-composer": {
    s: "Assembles the home screen from shelves of recommendations, recent items, editorial features and promotions, choosing which shelves to show, in what order, for whom.",
    d: "A shelf is a titled set of items from some source. The composer asks multiple recommendation services in parallel, ranks shelves by predicted value for the listener and time of day, removes duplicates across shelves, and applies business rules such as sponsored slots and release campaigns. It must degrade gracefully: if a source times out, its shelf is dropped. The response is cached briefly per user and refreshed as context changes. The difficulty is keeping the page coherent while many independent systems contribute to it.",
    k: ["Ranking shelves with a model vs a fixed layout: models fit each listener but are less predictable for product and marketing; fixed layouts are easy to reason about and ignore personal habits.", "Deduplicating across shelves vs allowing repeats: deduplication shows more variety on a small screen; repeats can reflect true strongest picks."],
    p: ["Waiting on every shelf makes the home screen as slow as its slowest source.", "Sponsored placements without frequency limits fill the page and push out the music the listener came for."],
    v: "Load the home screen with one recommendation source forced to time out and confirm it renders within the latency budget with that shelf missing and no duplicate items across the remaining shelves.",
    dep: ["candidate-generation","ranking-model","editorial-curation","service-gateway"]
  },
  "recommendation-experiments": {
    s: "The system for running controlled online tests of ranking, layout and features, assigning listeners to variants and measuring effects on listening and retention.",
    d: "Listeners are assigned to variants by hashing their id with an experiment key, so assignment is stable and needs no storage. Events record the variant, and the analysis computes metric differences with confidence intervals, with guardrail metrics such as skips, crashes and complaints. Experiments run in layers so independent ones do not interfere. Long-horizon effects like retention take weeks, and novelty effects fade, so early readouts mislead. Interference between listeners, such as shared playlists, complicates the arithmetic.",
    k: ["Short proxy metrics vs long-term outcomes: proxies give fast decisions; long-term outcomes are the real goal but slow, and proxies can move the wrong way.", "Many parallel experiments vs fewer clean ones: parallel testing increases learning speed; overlapping changes hide interactions and make attribution harder."],
    p: ["Stopping a test the first time the result looks significant inflates false positives.", "Assigning by device rather than account puts one listener in two variants and corrupts both."],
    v: "Run an A/A test with identical variants and confirm the metrics differ by less than the expected noise, then confirm a deliberately degraded variant is detected by a guardrail within the planned time.",
    dep: ["event-pipeline","data-lake","identity-and-sessions"]
  },
});
