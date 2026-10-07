// Details for the social feed plate, part 3: reactions and counters, search, privacy, moderation.
ATLAS.details("social-feed", {
  "reaction-service": {
    s: "Records that a person liked, reacted to or saved a post, enforcing one reaction per person per post and feeding counters, notifications and ranking.",
    d: "A reaction is a small record keyed by user and post, written idempotently so a double tap changes nothing. Writes emit events to counters, notifications and the ranking signal pipeline. Reads answer whether this reader reacted, for a batch of posts, on every feed page. It is hard because the write rate is the highest of any user action, the read must be fast for a whole page, and the one-per-person rule needs uniqueness without a global lock.",
    k: ["Store a row per reaction vs only a counter: rows enable unliking, who-liked lists and abuse analysis and cost storage; a counter is tiny and cannot be undone or audited.", "Synchronous count update vs asynchronous: synchronous looks exact and limits throughput; asynchronous scales and shows lag."],
    p: ["Rapid like and unlike toggling creates an event storm and leaves counters off by one.", "The did-I-react lookup is done per post, adding dozens of queries to every feed page."],
    v: "Tap like twice quickly and confirm one reaction and a count of one. Load a page of 30 posts and confirm reaction state arrives in a single batched lookup.",
    dep: ["post-store", "sharded-counters", "event-log", "idempotency-and-dedup"]
  },
  "sharded-counters": {
    s: "Splits one hot counter across many cells that are incremented independently and summed on read, so a viral post does not serialize on a single row.",
    d: "Each counter has N sub-counters. A write picks one at random and increments it; a read sums them or reads a periodically rolled-up total. N can grow for hot keys. This turns a contended single-writer problem into a parallel one. It is hard because choosing N is a trade-off, reads get costlier as N grows, and sums are only eventually consistent with writes in flight.",
    k: ["Many sub-counters vs one row with locking: sub-counters give high write rates and cost extra reads; one row is exact and caps at a few hundred writes per second.", "Fixed shard count vs dynamic by heat: dynamic is efficient and needs detection and migration; fixed is simple and wastes space or throttles."],
    p: ["Every counter gets many shards by default, and storage and reads cost far more than needed for ordinary posts.", "A sub-counter is lost with its node and the total silently drops."],
    v: "Apply 50,000 increments per second to one counter from many writers, then stop. The summed value equals the total sent, and no single storage node exceeds its stated write rate.",
    dep: ["post-store", "hot-key-replication", "shard-routing"]
  },
  "counter-aggregation": {
    s: "A stream pipeline that batches raw reaction, reply and view events into periodic count updates, reducing millions of writes to a few per object per interval.",
    d: "Events from the log are consumed, grouped by object and counter type over short windows, summed and written as one delta. Aggregation also deduplicates and applies filters, such as excluding blocked or spam accounts. Totals are persisted and published to caches. It is hard because windows trade freshness for load, late events must be accounted for, and restarts must neither lose nor repeat a window.",
    k: ["Streaming windows vs periodic batch jobs: streaming is fresh and operationally demanding; batch is simple and minutes to hours stale.", "Count in aggregation vs count in the write path: aggregation protects storage and delays; the write path is immediate and contended."],
    p: ["A consumer restart replays a window, and counts inflate.", "Filters applied here drift from filters applied at read, so counts disagree with the visible list of reactors."],
    v: "Send a known number of events including duplicates and late arrivals and confirm the final persisted count equals the expected total, and the update delay is within the stated window.",
    dep: ["event-log", "idempotency-and-dedup", "post-store", "spam-and-rate-limits"]
  },
  "approximate-counts": {
    s: "Shows counts in a rounded or lagging form, such as 1.2K, and uses probabilistic structures where exact numbers cost too much and nobody needs them.",
    d: "Display counts are rounded and updated at human-visible intervals. For unique viewers, probabilistic sketches estimate distinct counts in small fixed memory with a known error. The exact value remains available for billing and audits from the log. The product rule is that a count should be believable and monotonic, not exact. It is hard because people notice contradictions: a count that goes down, or differs between two screens.",
    k: ["Rounded display vs exact: rounding hides lag and noise and is not precise for small numbers; exact is satisfying and costs freshness and money.", "Sketch for distinct counts vs exact set: a sketch uses constant memory and has bounded error; an exact set is correct and grows with audience."],
    p: ["Counts shown on a post and on its detail page come from different caches and visibly disagree.", "A sketch is merged incorrectly across shards and double counts the same viewers."],
    v: "Compare sketch estimates against exact counts on a sample of posts across sizes. Error stays within the documented bound, and the displayed count never decreases between consecutive refreshes.",
    dep: ["counter-aggregation", "view-counts"]
  },
  "counter-reconciliation": {
    s: "Periodically recomputes counts from the source records and corrects drifted values, because incremental counters eventually diverge from truth.",
    d: "A background job scans reaction and reply records for sampled or all objects, computes totals and compares them with the stored counters, then repairs differences and logs their rate. Priority goes to recently active and large objects. It is the safety net for lost events, double counts and failed writes. It is hard because scanning big tables is expensive and races with live increments, so corrections must be applied as deltas against a consistent point.",
    k: ["Full recompute vs sample and extrapolate: full is exact and heavy; sampling is cheap and estimates the drift rate without fixing every item.", "Overwrite counters vs apply a delta: overwriting is simple and loses increments in flight; deltas are safe and need a snapshot version."],
    p: ["Reconciliation overwrites a counter while increments arrive, losing real reactions.", "Nobody tracks the correction rate, so a growing bug in the pipeline stays hidden behind the repair job."],
    v: "Inject lost and duplicated events into a test set. After a run, counters match source records and the job reports the injected drift rate.",
    dep: ["reaction-service", "counter-aggregation", "post-store"]
  },
  "view-counts": {
    s: "Counts how many times a post was seen, which needs cheap high-volume logging, bot filtering and a definition of what counts as a view.",
    d: "Clients report views when a post is visible long enough. The server dedupes by viewer and window, filters automated traffic, aggregates and updates display counts. Views are the largest event stream in the system, and they feed ranking velocity, creator analytics and ad billing. It is hard because it is the easiest number to inflate and the definition affects money: fraction visible, time on screen, repeated views, logged-out views.",
    k: ["Count on server fetch vs client visibility: server is simple and overcounts items never seen; client visibility is accurate and can be forged.", "Unique viewers vs total views: unique is meaningful and costs state; total is simple and inflated by repeats."],
    p: ["Bots or scripted refreshes inflate counts, and creators and advertisers lose trust.", "The definition changes between client versions and trend lines break."],
    v: "Replay a labeled mix of real and scripted traffic and confirm bot views are excluded, repeats within the window count once, and the displayed number matches the audited log within the stated tolerance.",
    dep: ["impression-logging", "event-log", "coordinated-behavior-detection", "counter-aggregation"]
  },
  "trending-detection": {
    s: "Finds topics, tags and posts whose activity is rising faster than normal, to surface in a trends panel, candidate generation and search.",
    d: "A stream job counts mentions per tag or phrase in short windows and compares each with its baseline for that hour, using a ratio or statistical test. Candidates are filtered for spam, coordinated pushes and unsafe terms, grouped, labeled and sometimes reviewed. Regional and personalized variants exist. It is hard because most spikes are noise or manipulation, so detection needs baselines, diversity of sources and a human or policy gate.",
    k: ["Rate of change vs absolute volume: change surfaces new topics and noise; volume shows only what is already known.", "Automatic publication vs human curation: automatic is fast and exposed to manipulation; curation is safe and slow and costly."],
    p: ["A small coordinated group makes a tag trend with many accounts posting the same text.", "A trending term is offensive or unsafe in context, and the panel promotes it to millions."],
    v: "Inject a synthetic spike from many distinct accounts and another from a few bots. The first appears as trending within the stated minutes; the second is suppressed.",
    dep: ["hashtag-index", "event-log", "coordinated-behavior-detection", "approximate-counts"]
  },
  "search-indexer": {
    s: "Consumes post, profile and edit events and updates the search index, applying text analysis and keeping the index close to the source of truth.",
    d: "Events from the log are batched, text is tokenized and normalized for the language, fields such as author, time and language are extracted, and documents are written to the right index shard. Deletes and visibility changes arrive as updates. The indexer can reprocess from the log to rebuild. It is hard because each post is indexed once but searched many times, so write latency matters less than staying complete, and the privacy state must be reflected.",
    k: ["Near-real-time indexing vs batched: near-real-time makes new posts findable in seconds and costs index churn; batched is efficient and minutes late.", "Index every post vs only public: indexing everything supports restricted search and complicates permissions; public only is simple and limited."],
    p: ["A delete event is missed, and a removed post remains searchable.", "A bad analyzer change requires reindexing everything and is deployed without a plan to rebuild."],
    v: "Create, edit, restrict and delete a post and query for it after each step. Results reflect each change within the stated freshness, and a full rebuild from the log yields the same index.",
    dep: ["event-log", "inverted-index", "post-store", "job-queue"]
  },
  "inverted-index": {
    s: "The data structure mapping each term to the posts that contain it, split across shards and built so queries combine terms and filters quickly.",
    d: "For every term the index keeps a sorted list of document ids with positions and fields. Queries intersect lists, filter by author, time or language and score the results. The index is sharded by document or by term, replicated, and divided into immutable segments merged in the background. It is hard because short texts, many languages, and a constant stream of updates make segments proliferate, and the newest documents are the ones people search for.",
    k: ["Shard by document vs by term: by document spreads work and queries every shard; by term targets few shards and creates hot terms.", "Recent-data tier vs one index: a separate recent tier gives fast fresh search and complexity in merging; one index is simple and slower to update."],
    p: ["A very common term has a huge list, and queries containing it become slow.", "Segment merges run during peak and starve query traffic."],
    v: "Run a query set under write load and confirm the 99th percentile latency is within target, results match a brute-force scan on a sample, and merges do not spike latency.",
    dep: ["replication-and-failover", "shard-routing"]
  },
  "people-search": {
    s: "Finds accounts by name, handle and context, ranking by closeness to the searcher and hiding accounts that blocked them or opted out.",
    d: "A separate index holds names, handles and bios with fuzzy and prefix matching, as typing begins before the full name is known. Ranking blends text match with graph proximity, shared connections and popularity. Results are filtered by blocks and discoverability settings. It is hard because names are ambiguous, spelled many ways, and a result can reveal who exists and who is connected.",
    k: ["Rank by proximity vs by popularity: proximity finds the person you mean and needs graph lookups per query; popularity is cheap and surfaces the famous.", "Prefix typeahead vs full submit only: typeahead is fast to use and costs many small queries; submit only is cheap and slower to use."],
    p: ["An account that opted out of search can still be found through an exact handle.", "Impersonators with near-identical names rank above the real account."],
    v: "Search for a name with variants and typos and confirm the intended account is within the top results for a searcher who knows them. A blocked or hidden account never appears.",
    dep: ["inverted-index", "follow-edge-store", "blocks-and-mutes", "account-privacy-settings", "profile-store"]
  },
  "hashtag-index": {
    s: "Maps each tag to its recent posts and counts, serving tag pages, trending detection and tag search.",
    d: "A tag entry holds a time-ordered list of post ids, with a separate recent window for fast reads and counters per interval. Posts are added at creation, removed on deletion or privacy change, and listed by recency or popularity. Heavy tags have their lists split. It is hard because popular tags are intensely hot writes and reads, and a tag page mixes content from authors with differing audiences.",
    k: ["Time-ordered lists vs ranked lists: time order is cheap to maintain and shows noise; ranked lists are better and need continuous rescoring.", "Index all tagged posts vs only public ones: all supports follower-only tag views and complex filters; public is simple and incomplete."],
    p: ["Spam accounts attach unrelated popular tags to their posts and flood the tag page.", "A hot tag list is one key on one shard, which overloads during an event."],
    v: "Post with a tag from public and private accounts and confirm the tag page lists only what the viewer may see. Generate a burst of 10,000 posts with one tag and confirm the page still serves quickly.",
    dep: ["mentions-and-hashtags", "inverted-index", "hot-key-replication", "read-time-privacy-check"]
  },
  "query-understanding": {
    s: "Interprets what a search means before running it: spell correction, language detection, entity recognition, synonym expansion and deciding whether the person wants people, posts or a tag.",
    d: "The raw query is normalized, tokenized, spell-corrected from query logs, tagged with language and checked for entities such as handles or tags. A classifier predicts intent and routes the query to the right indexes with weights. Operators such as from: and quotes are parsed. It is hard because queries are short and ambiguous, language mixed, and rewriting too eagerly changes what the person asked for.",
    k: ["Aggressive rewriting vs literal matching: rewriting rescues typos and synonyms and can override intent; literal is predictable and fails on mistakes.", "Single blended result list vs separate tabs: blended is convenient and needs cross-type scoring; tabs are clear and require a choice."],
    p: ["Spell correction turns a rare name or new slang into a common word and returns nothing useful.", "Intent routing misclassifies a handle query as text and shows irrelevant posts."],
    v: "Run a labeled set of queries and measure intent accuracy and correction precision. Check that a quoted exact query is never rewritten.",
    dep: ["inverted-index", "people-search", "hashtag-index"]
  },
  "search-ranking": {
    s: "Orders matching posts and accounts by relevance, recency, author quality and engagement, tuned separately from the feed because the intent is different.",
    d: "A first stage retrieves candidates by text match; a second stage scores with features such as match quality, post age, reactions, author trust and the searcher's connections. Spam and low-quality signals demote results. Time-sensitive queries weigh recency heavily. It is hard because search is adversarial: people optimize content to be found, and a query about an event needs the freshest results, which have the least engagement data.",
    k: ["Recency-weighted vs relevance-weighted: recency suits news and misses the best explanation; relevance suits reference queries and shows stale posts.", "Personalized results vs the same for everyone: personalized is more relevant and harder to debug and cache; shared is cacheable and plain."],
    p: ["Engagement features reward posts that already did well, hiding new relevant ones.", "Keyword stuffing and tag stuffing push spam to the top until a classifier catches it."],
    v: "Evaluate on a judged query set with a standard ranking metric and compare to the previous model. Check that for a breaking-event query the newest relevant posts appear in the top results.",
    dep: ["inverted-index", "feature-store", "query-understanding", "experimentation-platform"]
  },
  "index-freshness": {
    s: "Keeps the delay between a post being created or changed and being searchable low and measured, including deletion and privacy changes.",
    d: "End-to-end lag is measured with canary posts created continuously and queried until found. Backpressure, partition lag in the event log and segment refresh intervals are monitored. Privacy changes and deletions use a faster path than ordinary additions. Alerts fire when lag passes the objective. It is hard because the pipeline has many stages, each with its own queue, and a slow stage anywhere shows up as stale search.",
    k: ["Faster refresh vs index efficiency: frequent refresh gives freshness and creates many small segments; slower refresh is efficient and stale.", "Separate fast path for removals vs one path: a fast path honors takedowns and privacy quickly and doubles the machinery; one path is simpler and slower for removals."],
    p: ["Lag is only measured on average, hiding multi-minute delays on a few partitions.", "Removals wait in the same queue as bulk reindexing and take hours."],
    v: "Create canary posts every minute and chart the time until each is searchable. Delete one and chart time until it disappears. Both stay within the stated limits at peak.",
    dep: ["search-indexer", "event-log", "observability"]
  },
  "visibility-model": {
    s: "The vocabulary of audiences a post can have, such as public, followers, friends, a list or only me, and the rules for combining them with account-level settings.",
    d: "Each post stores an audience value and an optional list reference. Account settings, blocks, age rules and regional restrictions add constraints. The model defines a single function, can this viewer see this post, which every surface must use. It is hard to keep the model small: each new audience type multiplies the cases for every read path, and the answer must be consistent across feed, search, notifications, embeds and exports.",
    k: ["One central visibility function vs per-surface logic: central is consistent and a shared dependency on the hot path; per-surface is fast and diverges.", "Few coarse audiences vs many fine ones: coarse is easy to understand and enforce; fine is expressive and error-prone."],
    p: ["A new surface implements its own check and omits the friends-only rule.", "The audience on a post is changed, but derived copies still carry the old value."],
    v: "Build a matrix of viewers (follower, friend, stranger, blocked, list member) by audience types and verify the central function and every surface return the same decisions for each cell.",
    dep: ["post-schema-and-ids", "blocks-and-mutes", "lists-and-groups"]
  },
  "audience-selection": {
    s: "The control and rules by which an author chooses who may see a post, including defaults that persist, per-post overrides and what happens when audiences are later changed.",
    d: "The composer shows the current default and lets the author override it. The choice is validated server-side and stored with the post. Changing audience after posting re-scopes the post, which triggers removals from feeds and indexes and updates caches. Defaults are sticky, remembered from the last choice or account setting. It is hard because mistakes are costly and invisible: the author assumes the audience is what they meant, and widening it later cannot unsee.",
    k: ["Sticky default audience vs a fresh choice per post: sticky is convenient and carries a restrictive or broad choice into later posts; a fresh choice is deliberate and tiresome.", "Retroactive audience change vs fixed at creation: retroactive gives control and requires propagation; fixed is simple and unforgiving."],
    p: ["An author believes a post is private because the default changed in an update, and it goes public.", "Narrowing an audience hides a post from new views, while cached or search copies remain visible."],
    v: "Post as followers-only, then change to only me. Within the stated time the post disappears for followers on every surface and in search, and remains visible to the author.",
    dep: ["visibility-model", "edit-and-delete-propagation", "post-service"]
  },
  "read-time-privacy-check": {
    s: "Re-evaluates whether the current viewer may see each item at the moment it is served, regardless of how the item reached the feed or cache.",
    d: "Feeds and caches store references that were valid when written. Before returning a page, the service batches the posts' audiences and the viewer's relationships and filters out anything now disallowed, such as after a block, an unfollow, a deletion or a setting change. The check uses cached graph data and post metadata. It is hard because it runs on every item of every request, so it must be a batch lookup with tight latency.",
    k: ["Check at read vs rely on write-time scoping: read-time is always current and costs lookups on the hot path; write-time is fast and cannot undo.", "Fail closed on lookup errors vs fail open: closed protects privacy and shortens feeds in an outage; open keeps the feed full and may leak."],
    p: ["The check uses a stale graph cache, so a block takes effect only after the cache expires.", "A code path assembles a feed from precomputed data and skips the filter."],
    v: "Block an account, then request feeds for both sides without waiting for cache expiry. Posts from the blocker never appear to the blocked, with check latency within budget at peak.",
    dep: ["visibility-model", "graph-cache", "post-object-cache", "blocks-and-mutes"]
  },
  "account-privacy-settings": {
    s: "Account-level choices such as private account, discoverability, who can message, tag or mention, and whether activity is shown to others.",
    d: "Settings are stored per account and read by many services: follow acceptance flow, search, suggestions, mentions, reposts and profile views. A change must apply to the future and, for private accounts, to existing followers and content. Each setting has a default and a rule when it conflicts with another. It is hard because settings are read everywhere, so each service caches them, and a setting that is not honored in one service is a breach.",
    k: ["Private accounts approve followers vs open following: approval gives control and slows growth and adds a queue; open is easy and public.", "Settings read by each service vs a central policy service: central is consistent and a hot dependency; local is fast and drifts."],
    p: ["An account becomes private and old followers who were never approved retain access.", "A new feature ignores discoverability settings and surfaces hidden accounts in suggestions."],
    v: "Switch an account to private and verify non-followers lose access to posts, search results, suggestions and tag pages within the stated time, and approved followers keep access.",
    dep: ["profile-store", "follow-edge-store", "cache-invalidation"]
  },
  "privacy-aware-fanout": {
    s: "Ensures fan-out writes only deliver a post to people who are allowed to see it, and re-scopes already delivered entries when the audience or relationship changes.",
    d: "The fan-out worker intersects the author's followers with the post's audience before writing, skipping blocked and restricted recipients. Relationship and audience changes emit events that remove or add entries in affected feeds. Combined with read-time checks, it gives defense in depth. It is hard because the work doubles when audiences change, and the second step is rarely tested compared with the first.",
    k: ["Filter during fan-out vs filter only on read: filtering at write saves storage and read work and misses later changes; read-only filtering is simpler and wastes storage.", "Eager removal on change vs lazy removal on next read: eager is clean and costly for big audiences; lazy is cheap and leaves entries stored."],
    p: ["A relationship change is handled for new posts only, and old entries remain in the feed.", "Audience intersection is expensive for very large lists and is skipped under load."],
    v: "Post to a close-friends list, then remove a friend and verify the entry is gone from that person's stored feed, not only filtered on read, within the stated time.",
    dep: ["fanout-workers", "visibility-model", "edge-change-events", "feed-store"]
  },
  "data-export-and-deletion": {
    s: "Lets people download everything the service holds about them and have it erased, including posts, messages, derived data and backups on a defined schedule.",
    d: "An export job gathers a user's records from every store into an archive. Deletion marks the account, hides it at once, removes data across stores and caches, and handles derived data such as search entries, model features and logs on a schedule. Backups age out. Legal holds can pause it. It is hard because personal data is scattered across dozens of systems and no one owns the whole list.",
    k: ["Central registry of data locations vs per-team handling: a registry makes completeness checkable and requires discipline to maintain; per-team is flexible and loses data stores.", "Grace period before deletion vs immediate: a grace period allows recovery and keeps data longer; immediate meets the request and is unrecoverable."],
    p: ["A new store holding user data is never registered, and survives deletion indefinitely.", "Deleted users' content remains in training data and exports."],
    v: "Create a test account with posts, reactions and messages, delete it, and run a scan across all stores, caches, indexes and logs. After the stated period nothing identifiable remains.",
    dep: ["post-store", "profile-store", "event-log", "cold-archive-tiering", "search-indexer"]
  },
  "consent-and-age-gating": {
    s: "Records what each person agreed to and applies age and region rules, limiting features, defaults and data use for minors and where law requires.",
    d: "Account creation captures age or age range and region, and consent choices for data use and personalization. These are stored with timestamps and versions of the terms accepted. Services consult them: ranking may be restricted, audiences narrowed and notifications limited for younger users. It is hard because the rules differ by region and change, the signal is self-declared, and the checks appear in many services.",
    k: ["Self-declared age vs verification: self-declared is easy and trivially false; verification is stronger and costs friction and sensitive data.", "Region-specific behavior vs one global policy: regional follows law closely and multiplies code paths; global is simple and strictest-common."],
    p: ["A consent withdrawal is stored but the ranking pipeline keeps using the data.", "Age gating is checked in the signup flow and not in the API, so scripted clients bypass it."],
    v: "Create accounts with different ages and regions and confirm defaults, audiences, personalization and notifications match policy. Withdraw consent and confirm downstream use stops.",
    dep: ["profile-store", "account-privacy-settings"]
  },
  "reporting-flow": {
    s: "How people flag a post, account or message: the choice of reason, the evidence attached and the routing of the report to the right queue with feedback to the reporter.",
    d: "The client collects a reason and context and submits it with the object id and a snapshot, so evidence survives edits and deletion. Reports are deduplicated, scored by reason, reporter reliability and volume, and routed to automated checks or a review queue. Reporters are told the outcome. It is hard because reports are noisy and sometimes weaponized, with brigades filing against a target, so volume is a weak signal on its own.",
    k: ["Snapshot the content at report time vs reference it: a snapshot preserves evidence and stores sensitive content again; a reference is lean and loses edited or deleted material.", "Weight reports by reporter history vs equal weight: weighting resists brigading and may ignore new reporters; equal weight is fair and gameable."],
    p: ["A report on a post that is then deleted loses the evidence, and repeated offenders go unnoticed.", "Mass false reports take down a legitimate account through automatic thresholds."],
    v: "File a report on an edited post and confirm the reviewer sees the original snapshot, duplicate reports collapse into one case, and the reporter receives the outcome.",
    dep: ["post-store", "review-queue", "event-log"]
  },
  "automated-classifiers": {
    s: "Models that score text, images and video for abuse categories such as harassment, graphic content, scams and self-harm, to act or to prioritize human review.",
    d: "Each new post and media item passes through classifiers in parallel with publishing or just before it. Scores are compared with thresholds per category and region: very high confidence acts automatically, middle goes to review, low passes. Models are retrained on reviewer decisions. It is hard because language, context and satire defeat classifiers, adversaries adapt wording, and thresholds trade over-removal against exposure.",
    k: ["Block before publish vs act after: before limits harm and adds latency and false positives; after is smooth and exposes content briefly.", "High threshold for automatic action vs low: high is conservative and sends more to humans; low acts quickly and removes legitimate posts."],
    p: ["A model trained on one language performs poorly on another, and the harm there goes undetected.", "Classifiers are tuned on past content and miss a new coded vocabulary for weeks."],
    v: "Evaluate on a labeled, per-language set and report precision and recall per category. Replay a known-violating sample through the live path and confirm actions and review routing follow thresholds.",
    dep: ["event-log", "review-queue", "enforcement-actions", "feature-store"]
  },
  "hash-matching": {
    s: "Compares media against fingerprint databases of known illegal or banned content, matching even after resizing or minor edits, and blocking or reporting without human viewing.",
    d: "Uploads are fingerprinted with perceptual hashes that stay similar under compression and cropping, and looked up in lists from trusted clearinghouses and the platform's own prior removals. A match triggers a block, account action and mandatory reporting where required. Lists update continuously. It is hard because near matches create false positives, lists are sensitive and distributed under strict handling, and evasion tries small modifications.",
    k: ["Perceptual hashes vs exact hashes: perceptual tolerate edits and produce false positives; exact are precise and trivially evaded.", "Scan at upload vs retroactively on stored media: at upload prevents spread; retroactive scans catch newly listed items and cost large compute."],
    p: ["Hash lists are updated, but old stored media is never rescanned.", "A false match removes a family photo and the account is wrongly penalized with no clear appeal."],
    v: "Test with licensed benign test hashes: exact copies, resized and re-encoded variants match, unrelated images do not, and a list update triggers a retroactive scan that finds a stored match.",
    dep: ["media-processing", "enforcement-actions", "job-queue"]
  },
  "review-queue": {
    s: "The tooling where human moderators see prioritized cases with context, apply policy and record decisions, with workload, wellness and quality controls.",
    d: "Cases come from reports and classifiers, are grouped by object and policy area, ranked by severity, reach and age, and assigned by skill and language. The reviewer sees content, history and the policy text and chooses an action. Decisions feed back into models and audits sample for consistency. It is hard because volume far exceeds capacity, exposure is harmful to reviewers, and consistency across people and time is difficult.",
    k: ["Prioritize by severity and reach vs first-in-first-out: priority limits harm and leaves low-risk cases waiting; FIFO is fair and slow for urgent harm.", "Single reviewer vs multiple opinions on hard cases: multiple raises accuracy and cost; single is fast and noisy."],
    p: ["Queues are not ranked by reach, and a post seen by millions waits behind a post seen by ten.", "Reviewers see content without context, such as the thread it replies to, and make wrong calls."],
    v: "Seed the queue with known cases of varied severity and reach and confirm the order, assignment by language, decision recording, and that audited agreement between reviewers meets the stated rate.",
    dep: ["post-store", "profile-store", "enforcement-actions", "observability"]
  },
  "enforcement-actions": {
    s: "The set of consequences applied to content and accounts, such as removal, reduced distribution, warning labels, feature limits, suspension and ban, applied consistently and recorded.",
    d: "A policy decision maps to an action with a duration and scope. Actions write flags on the post or account that downstream services honor: ranking demotes, fan-out skips, search excludes, the composer is limited. Strikes accumulate toward escalating consequences. All actions are logged with reasons for appeal and audit. It is hard because flags must be respected by every system, and reduced distribution is invisible to the author, which raises fairness and transparency questions.",
    k: ["Graduated penalties vs binary remove or keep: graduated is proportionate and complex to track; binary is simple and blunt.", "Remove vs reduce distribution: removal is clear and contentious; reduction limits harm and cannot be verified by the author."],
    p: ["A flag set by moderation is ignored by one service, such as search, and removed content stays findable.", "A ban is enforced on the account but not on linked alternate accounts."],
    v: "Apply each action type to a test post and account and confirm every surface honors it: feed, search, notifications, profile, API. Lift the action and confirm all return to normal.",
    dep: ["post-store", "profile-store", "event-log", "feed-store"]
  },
  "appeals": {
    s: "A path for people to contest an action, reviewed by someone other than the original decider, with outcomes that can restore content and correct records.",
    d: "An appeal references the action and stores the person's statement. It is routed to a separate queue, reviewed against policy and the original evidence, and results in upheld or overturned. Overturn reverses the action, restores content and fixes strike counts, and results feed back as training labels. It is hard because reversal must undo derived effects, such as removed fan-out and reduced reach, and because volume rises with every automated action.",
    k: ["Independent reviewer vs same team: independent is fairer and costs more; same team is quick and tends to confirm itself.", "Automatic restore pending review vs keep removed: restoring limits harm to creators and risks exposure; keeping protects viewers and silences wrongly."],
    p: ["Content is restored on appeal but not re-added to feeds or the index, so it effectively remains gone.", "Appeals take weeks, and by then the post's relevance has passed."],
    v: "Overturn a removal and confirm the post returns to its author's profile, is searchable, the strike is removed and the decision is recorded and used as a label.",
    dep: ["enforcement-actions", "review-queue", "post-store", "search-indexer"]
  },
  "spam-and-rate-limits": {
    s: "Limits how fast any account can post, follow, react and message, and detects automated or abusive behavior at the point of action.",
    d: "Per-account and per-device counters over time windows cap actions by type and account age, with tighter limits for new accounts. Signals such as repeated text, link patterns and velocity feed a spam score that adds friction, such as a challenge, or blocks. Limits live in a fast shared store checked in the gateway and services. It is hard because attackers distribute across many accounts, and legitimate surges such as an event must not be throttled.",
    k: ["Hard limits vs risk-based friction: hard limits are predictable and block legitimate bursts; risk-based adapts and is opaque.", "Limit per account vs per device or network: per account is fair; per device or network catches farms and affects shared connections."],
    p: ["Limits are enforced on the main API but not on a secondary endpoint, and spammers use that one.", "A busy newsroom account is throttled during a breaking story."],
    v: "Script a new account to post, follow and react at high rates and confirm each hits its limit and challenge. Run a normal heavy user and confirm no false throttling.",
    dep: ["quotas-and-load-shedding", "api-gateway", "profile-store"]
  },
  "coordinated-behavior-detection": {
    s: "Finds groups of accounts acting together to manipulate attention, such as fake engagement, copied posts and synchronized timing, using graph and behavior analysis.",
    d: "Offline and streaming jobs look for clusters with similar creation times, shared devices or networks, repeated text, synchronized actions and unusual follow patterns. Clusters are scored and sent for action or review. Results also feed counts, trending and ranking by discounting suspect activity. It is hard because adversaries imitate organic behavior and real communities also act in sync, such as fans at an event.",
    k: ["Behavior-based signals vs content-based: behavior is hard to disguise and catches real groups; content is precise and evaded by rewording.", "Remove suspected accounts vs discount their activity quietly: removal deters and risks false positives; discounting protects metrics and keeps feedback hidden."],
    p: ["Real fan communities are flagged as coordinated and lose reach.", "Detection runs daily, and the manipulation has already done its work by the time it completes."],
    v: "Plant a synthetic ring of accounts with shared patterns and a genuine group of similar-timing users. The ring is clustered and discounted, the genuine group is not.",
    dep: ["event-log", "follow-edge-store", "enforcement-actions", "feature-store"]
  }
});
