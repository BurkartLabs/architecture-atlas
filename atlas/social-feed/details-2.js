// Details for the social feed plate, part 2: ranking, social graph, posts and media.
ATLAS.details("social-feed", {
  "candidate-generation": {
    s: "Gathers the few hundred posts worth scoring for a reader from many sources: followed accounts, popular posts, similar interests and re-surfaced older items.",
    d: "Several retrievers each return posts with a rough reason: recent from follows, liked by people the reader follows, popular in a topic, trending. Their outputs are unioned and deduplicated. Retrieval must be cheap because it runs for every feed request and the model downstream can only score so many. It is hard because candidates set the ceiling for quality, since a post never retrieved can never be ranked, and each source adds load and its own failure modes.",
    k: ["Many specialized retrievers vs one general one: many give diversity and need merging and tuning of quotas; one is simple and narrow.", "Retrieve more candidates vs score fewer more carefully: more candidates raise recall and latency; fewer keep the model cheap and risk missing good posts."],
    p: ["One retriever dominates by volume, so the candidate set is nearly all the same kind of post.", "A retriever times out and the ranked feed silently loses a source until engagement dips."],
    v: "Log the candidate set for a sample of requests, then check each source's share and the share of shown posts that came from each, and confirm a disabled source disappears without errors.",
    dep: ["follow-edge-store", "feed-store", "post-store", "trending-detection", "mutuals-and-suggestions"]
  },
  "feature-store": {
    s: "Serves the inputs the ranking model needs, such as a post's age, author history and the reader's recent behavior, consistently for training and for live requests.",
    d: "Features are computed in batch and in streaming from events, written to a low-latency store keyed by user, post or author, and read at ranking time. Each has a version and freshness. The same definitions feed training data, so the model sees at serving what it saw in training. It is hard because of skew between the two: a feature computed one way offline and another online silently degrades the model.",
    k: ["One definition for batch and online vs separate pipelines: one definition prevents skew and constrains tools; separate pipelines are easy to build and drift apart.", "Precomputed features vs computed at request: precomputed are fast and stale; request-time are fresh and cost latency."],
    p: ["A feature is missing for new posts and defaults to zero, so new content is systematically buried.", "A feature pipeline falls behind and the model uses day-old behavior without alarm."],
    v: "For a sample of impressions, recompute features offline from logged events and compare with the values served. They agree within a stated tolerance, and freshness lag is within its target.",
    dep: ["event-log", "impression-logging", "profile-store"]
  },
  "ranking-model-serving": {
    s: "Runs the trained models that predict how likely a reader is to engage with each candidate, producing scores within the time left in the feed request.",
    d: "A request sends candidates and features to a serving tier that batches them through one or more models, often a cheap first pass then a heavier second one. Outputs predict clicks, replies, reports and hides, which are combined by a value formula into one score. Models are updated frequently and deployed gradually. It is hard because the latency budget is a few tens of milliseconds, and because the objective chosen shapes what the product becomes.",
    k: ["Predict several outcomes and combine vs one engagement score: several outcomes let product tune the trade-off and add weights to maintain; one score is simple and optimizes whatever correlates.", "Heavy model on few candidates vs light on many: heavy models are accurate and limit candidates; light models cover more and miss nuance."],
    p: ["Optimizing for clicks favors outrage and bait, and long-run satisfaction falls while the metric rises.", "A new model is deployed fleet-wide at once and a serving bug returns zero scores for everyone."],
    v: "Run a new model on a small slice and compare against control on engagement, hides and reports. Measure the 99th percentile latency at peak and confirm it fits in the stated budget.",
    dep: ["feature-store", "candidate-generation", "experimentation-platform", "flags-and-rollout"]
  },
  "heuristic-scoring": {
    s: "Hand-written scoring rules such as recency decay, author affinity and engagement velocity, used alone in simple systems and as a fallback or blend with models in larger ones.",
    d: "A score combines age with a decay, a weight for how often the reader interacts with the author, and the recent rate of reactions. Rules are explicit and cheap, and their weights are tuned by experiment. They provide a baseline to compare models against and a safe path when model serving fails. It is hard because rules multiply: each fix adds a term, interactions between terms are unclear, and nobody remembers why a constant is what it is.",
    k: ["Transparent rules vs learned models: rules are explainable and plain to debug and plateau; learned models find patterns and are opaque.", "Strong recency decay vs gentle: strong keeps the feed fresh and buries good older posts; gentle shows better posts that readers missed."],
    p: ["Engagement velocity rewards posts that are already viral, so a small number of items saturate every feed.", "Constants are tuned for one season or one audience and degrade as the product changes."],
    v: "Turn off the model tier and confirm feeds still serve, with scores computed by rules, within a modest engagement drop compared with the model-ranked control.",
    dep: ["feature-store", "view-counts"]
  },
  "diversity-and-dedup": {
    s: "Rearranges scored posts so the page is varied: limits runs from one author, spreads content types, removes near-duplicates and avoids showing what the reader has already seen.",
    d: "After scoring, a pass enforces spacing rules, caps per author or topic, and demotes posts with the same link or similar text. A seen-set, kept per reader for a day or so, removes what was already shown. Some rules apply to safety as well, such as reducing borderline content. It is hard because every rule trades relevance for variety, and the seen-set must be fast, bounded and shared across devices.",
    k: ["Hard caps vs score penalties: caps are predictable and can force weaker posts in; penalties blend smoothly and are hard to guarantee.", "Seen-set per device vs per account: per account stops repeats across devices and needs shared storage on every request; per device is local and repeats."],
    p: ["Near-duplicate detection merges two different posts that happen to share a link, hiding a reply.", "The seen-set is lost on a cache eviction, and readers see the same top posts again on every refresh."],
    v: "Request ten consecutive pages and confirm no post repeats, no author appears more than the cap in any window of five, and a reshared link shows once.",
    dep: ["feed-cache", "post-object-cache"]
  },
  "sponsored-insertion": {
    s: "Places paid posts into the organic feed at allowed positions, after a separate auction and selection process, while keeping them labeled and within frequency limits.",
    d: "An ads system returns eligible sponsored items with bids and predicted value. The feed service picks positions by pacing rules, such as no more than one in every few slots and not first, and merges the winners with organic posts. Items are labeled, logged separately and excluded from privacy-sensitive categories. It is hard because ads have different latency, targeting and policy constraints and a different team and objective, yet they must not break the feed's own guarantees.",
    k: ["Insert ads before ranking vs after: before lets one model weigh them against organic posts and couples the systems; after keeps them separate and can place them poorly.", "Fixed slots vs dynamic load: fixed is predictable for users; dynamic raises revenue and can degrade the experience."],
    p: ["The ads call times out and the feed waits for it, so a third-party dependency slows every page.", "Ad impressions are logged on fetch rather than view, and advertisers are billed for items nobody saw."],
    v: "Load 20 pages and confirm sponsored items appear only at permitted positions, are labeled, are logged once per view, and that disabling the ads service leaves the feed loading at normal speed.",
    dep: ["timeline-merger", "impression-logging", "service-rpc"]
  },
  "experimentation-platform": {
    s: "Assigns users to variants of ranking and product changes, measures their effect on chosen outcomes, and decides whether a change ships.",
    d: "Users are hashed into stable buckets per experiment. Each request carries its assignments and logs them with outcomes. A pipeline computes metrics per variant with confidence intervals, and guardrail metrics such as reports or latency can stop a test. It is hard because feed experiments interact: ranking changes alter what everyone sees, social effects leak between buckets, and long-term effects differ from the first week.",
    k: ["Randomize by user vs by session: by user is stable and clean for habit effects; by session gives more samples and mixes experiences.", "Many concurrent experiments vs a few at a time: many speed learning and risk interactions; few are clean and slow."],
    p: ["Network effects mean the control group sees content produced by the treated group, so the measured difference is biased.", "A test is stopped at the first significant result, and the effect disappears when repeated."],
    v: "Run an A/A test with identical variants and confirm no metric differs significantly more often than the chosen error rate, and that bucket sizes match what was configured.",
    dep: ["impression-logging", "flags-and-rollout", "event-log"]
  },
  "impression-logging": {
    s: "Records what was shown, to whom, in what position and what they did next, producing the data that trains rankers, bills ads and measures every change.",
    d: "The client reports impressions in batches, with the post id, position, visible time, the ranking request id and the model version. Server logs add what was candidates but not shown. Streams feed the feature store, training sets, counters and analytics. It is hard because it is the system's ground truth and is easy to get wrong: lost batches, double counts and mismatched ids all bias every model trained on it.",
    k: ["Log on client visibility vs on server response: client logging reflects what was seen and can be lost or spoofed; server logging is reliable and counts items never viewed.", "Log all candidates vs only shown posts: all candidates enable counterfactual training and multiply data volume."],
    p: ["Offline devices send batches late with old timestamps, and dashboards attribute them to the wrong day.", "A client bug stops logging a content type, and the model learns that type is never engaged with."],
    v: "Scroll a scripted sequence on a test device and compare client events, server records and the stored table. The counts, positions and request ids match exactly.",
    dep: ["event-log", "post-schema-and-ids", "idempotency-and-dedup"]
  },
  "follow-edge-store": {
    s: "The durable record of who follows whom, with direction, timestamp and state, supporting fast lookups of both followers and followees for any account.",
    d: "Each edge is stored twice, once keyed by follower for who this person follows and once by followee for who follows this person, so both directions are single-shard scans. Edges carry state such as pending, accepted or removed. Counts are kept separately. It is hard because the data is simple and huge, reads dominate and are skewed, and both copies must stay consistent without cross-shard transactions.",
    k: ["Store both directions vs one with a secondary index: both are fast and double writes with a consistency problem; one is smaller and slow in the other direction.", "Sorted adjacency lists vs one row per edge: lists are compact and cheap to scan and awkward to update; rows are flexible and larger."],
    p: ["The two copies diverge after a failed write, and an account shows up as a follower in one view but not the other.", "A single account's follower list is read by a full scan and blocks the shard."],
    v: "Follow and unfollow in a loop and confirm both directional lookups agree after each step, and that a reconciliation job over a sample of accounts finds no mismatched edges.",
    dep: ["graph-sharding", "edge-change-events", "shard-routing"]
  },
  "reciprocal-friendship": {
    s: "Mutual connections that need a request and an acceptance, as opposed to one-way follows, with states for pending, accepted, declined and removed.",
    d: "A request creates a pending record visible to the target. Acceptance writes the mutual edge, both directions at once, and makes content mutually visible to the degree privacy allows. It supports friends-only audiences and mutual-friend counts. It is hard because the state machine has many edges: a request while blocked, a withdrawn request, both sides requesting at once, and the need for the two views to switch together.",
    k: ["Mutual model vs follow model: mutual gives meaningful privacy and limits reach; follow lets audiences grow and attracts spam and harassment.", "Atomic cross-shard write vs eventual convergence: atomic is correct and expensive; eventual is simple and briefly inconsistent."],
    p: ["Simultaneous requests from both people deadlock or create two conflicting records.", "A block does not cancel a pending request, and the blocked person can still see the other in suggestions."],
    v: "Send requests in both directions at the same instant and confirm exactly one friendship results. Block either account and confirm it moves to removed with no remaining visible traces.",
    dep: ["follow-edge-store", "blocks-and-mutes", "edge-change-events"]
  },
  "blocks-and-mutes": {
    s: "User controls that hide content: a block severs interaction in both directions, a mute silently removes someone from your view, and both must apply everywhere content appears.",
    d: "Blocks and mutes are stored as small per-user sets and checked on feed assembly, search, replies, notifications, mentions and suggestions. They apply to existing content, not just new. Muted terms and muted conversations extend the idea. It is hard because enforcement points are numerous, and a single path that forgets the check leaks content to someone who blocked an abuser.",
    k: ["Check at every read vs filter once at write: read-time checks apply instantly and cost a lookup per item; write-time filtering is cheap and cannot honor a block placed later.", "Silent mute vs visible block: mute avoids retaliation and leaves a quiet disagreement; block is clear and noticed."],
    p: ["A new surface such as a search page ships without the block check, and blocked users appear in results.", "Block lists are cached and a new block takes minutes to apply, during which the abuser still sees replies."],
    v: "Block an account, then try to reach it through feed, search, reply, mention, notification and profile view from the other side. Each path shows nothing of the blocker and sends nothing.",
    dep: ["profile-store", "graph-cache", "edge-change-events"]
  },
  "lists-and-groups": {
    s: "User-defined collections of accounts that form their own feeds or audiences, such as a list of favorite authors or a close-friends group.",
    d: "A list is a named set of accounts owned by a person, with its own feed built like the main one: precomputed or merged on read. Lists can be public, private or collaborative, and can be an audience for posts. Membership changes must update feeds and audiences. It is hard because they multiply the graph: millions of lists with different sizes and owners, and a list used as an audience is a privacy control that must be exactly enforced.",
    k: ["Materialize list feeds vs merge on demand: materialized lists are fast and cost storage per list; on demand is cheap and slow for large lists.", "Lists as audiences vs follows only: lists give fine control and require read-time membership checks; follows are simple and coarse."],
    p: ["Removing a member from a close-friends list leaves their access to earlier posts through a cached audience.", "Very large public lists become a back door to heavy fan-out."],
    v: "Post to a close-friends list, remove one member, and confirm that member can no longer see the post in any surface, including cached feeds and search.",
    dep: ["follow-edge-store", "audience-selection", "read-time-privacy-check", "feed-store"]
  },
  "graph-sharding": {
    s: "Splits the edge data across machines so no single one holds or serves the whole graph, choosing the key that keeps related lookups together.",
    d: "Edges are partitioned by account id, usually hashed, so an account's list lives on one shard. Queries that touch several accounts, such as mutual follows, fan out to multiple shards and intersect. Hot accounts get replicas or split lists. Resharding moves ranges while serving traffic. It is hard because the graph has no clean cut: any partition leaves many edges across it, and skew makes some shards far busier than others.",
    k: ["Hash by account vs by locality: hashing balances load and scatters neighbors; locality helps traversals and creates hot shards.", "Split very large adjacency lists vs keep one per account: splitting spreads heavy accounts and complicates scans; one list is simple and a bottleneck."],
    p: ["A popular account's shard becomes the hottest in the system, and replicas of it are not rebalanced.", "Resharding doubles writes for a time and lags replication, causing stale reads."],
    v: "Run a skewed workload including one account with a million followers and confirm shard CPU stays within a narrow band and a reshard completes with no failed or stale lookups.",
    dep: ["shard-routing", "replication-and-failover"]
  },
  "mutuals-and-suggestions": {
    s: "Computes shared connections and recommends people to follow, using friends of friends, contacts, interests and activity.",
    d: "Mutual counts intersect two adjacency lists. Suggestions come from offline jobs that score second-degree candidates by shared connections and interactions, filtered by blocks, existing follows and abuse signals, then stored for quick serving. Fresh signals such as a new follow adjust the list. It is hard because friend-of-friend expansion explodes for well-connected accounts, and suggestions can expose private relationships if not filtered carefully.",
    k: ["Precompute suggestions vs compute on request: precomputed are cheap to serve and stale; on request is fresh and costly.", "Use contact data vs graph only: contacts raise relevance and bring privacy risks and consent obligations; graph only is safer and weaker."],
    p: ["A suggestion reveals that two people know each other privately, as when a former contact appears for a hidden account.", "Expansion through a very large account makes the job quadratic and it never finishes."],
    v: "Check that suggestions for a sample of accounts exclude blocked, already followed and private accounts, and that the offline job completes within its window including the largest accounts.",
    dep: ["follow-edge-store", "blocks-and-mutes", "account-privacy-settings", "event-log"]
  },
  "edge-change-events": {
    s: "A stream that announces every follow, unfollow, block and acceptance so feeds, counters, notifications, caches and indexes can update themselves.",
    d: "Writes to the edge store emit an ordered event per account with the old and new state. Consumers backfill feeds, adjust counts, invalidate graph caches, create notifications and update suggestion inputs. Events carry a version so late duplicates are discarded. It is hard because many systems depend on the stream being complete and in order per account, and a missed unfollow or block leaves content visible that should not be.",
    k: ["Emit from the database change log vs from application code: the log is complete and ties the stream to storage details; application events are flexible and can be forgotten.", "At least once with idempotent consumers vs exactly once: at least once is practical and demands idempotency; exactly once is expensive and narrower."],
    p: ["A consumer lags, and a blocked user continues to receive feed entries during the lag.", "Events for one account are processed out of order, leaving the feed in the state of the earlier edge."],
    v: "Follow, unfollow and block in quick succession and confirm each consumer ends in the final state, the stream shows ordered events for the account and lag stays within its objective.",
    dep: ["event-log", "idempotency-and-dedup"]
  },
  "post-service": {
    s: "The service that creates, reads, changes and removes posts, validating input and emitting the events that start fan-out, indexing, notifications and moderation.",
    d: "Creating a post checks authentication, rate limits and content rules, assigns an id, writes the record, links uploaded media and emits a post-created event. Reads fetch by id, in batches, with visibility checks. Later changes go through the same service. It is the system of record for content. It is hard because many consumers react to a post and each can fail separately, so the write and the event must not diverge.",
    k: ["Write then emit in one transaction vs emit separately: a transactional outbox guarantees the event and adds machinery; separate emission is simple and can lose events on crash.", "Synchronous moderation before publish vs after: before blocks harmful content and adds latency and false stops; after is fast and exposes content briefly."],
    p: ["The post is written and the event is lost, so it never reaches any feed or index.", "Batch reads skip the privacy check for speed, and private posts leak through an internal call."],
    v: "Create a post and confirm that within the stated time it is readable by id, present in follower feeds, searchable, and that each stage consumed one event. Kill the service mid-write and confirm no orphans.",
    dep: ["post-store", "post-schema-and-ids", "event-log", "spam-and-rate-limits", "idempotency-and-dedup"]
  },
  "post-schema-and-ids": {
    s: "The shape of a post record and its identifier: author, text, attachments, audience, time, parent links and flags, with ids that sort by time and spread across shards.",
    d: "A post has a unique id that encodes time so ids order roughly chronologically, enabling cursors and range scans without a timestamp index. Fields are versioned and extensible, with attachments referenced by id rather than inlined. Counts live elsewhere. It is hard because the schema must evolve for years across clients and services, and the id choice leaks into everything: sorting, sharding and public URLs.",
    k: ["Time-ordered ids vs random ids: time-ordered ids give cheap sorting and tend to write to one shard hot spot; random ids spread load and lose ordering.", "Narrow core record vs wide with everything: narrow is cheap to cache and needs more lookups; wide is convenient and bloats every read."],
    p: ["Public ids reveal post volume and creation time, which competitors or attackers can read.", "A field is added and old clients crash on it because they assumed a closed set of fields."],
    v: "Generate ids from many workers for a minute and confirm they are unique, sorted within the clock tolerance, spread across shards evenly, and that a record from the oldest schema version still reads correctly.",
    dep: ["id-generator"]
  },
  "media-upload": {
    s: "Moves photos and video from the device to storage reliably, with resumable chunks, direct-to-storage transfer and checks before the file is accepted.",
    d: "The client asks for an upload session and receives a signed target, then sends chunks in parallel, retrying failures and resuming after drops. The service verifies size, type and a checksum, then registers the asset and queues processing. Large files go straight to object storage, avoiding application servers. It is hard because mobile networks fail often and files are large, and unprocessed uploads are untrusted bytes that must never be served directly.",
    k: ["Direct-to-storage with signed URLs vs through application servers: direct saves bandwidth and bypasses inspection; proxying inspects and costs capacity.", "Chunked resumable vs single request: chunks survive bad networks and add a protocol; single requests are simple and restart from zero."],
    p: ["Abandoned uploads accumulate and are never cleaned up, filling storage with orphan files.", "A file with a misleading type is served as it arrived, and runs as script in a browser."],
    v: "Upload a 500 MB video while toggling network on and off. The upload resumes, completes, the checksum matches, and an unreferenced upload is deleted after the stated retention.",
    dep: ["media-blob-store", "job-queue", "session-and-auth"]
  },
  "media-processing": {
    s: "Turns uploaded media into safe, device-ready forms: validates, strips metadata, resizes, transcodes, extracts thumbnails and runs safety scans before the post can show it.",
    d: "A pipeline takes each upload through decode, rotation and orientation fixes, removal of location data, generation of several sizes and, for video, several bitrates and segments. Hash matching and classifiers run in parallel. Outputs are stored under content-derived names. Posts can display a placeholder until it completes. It is hard because video work is heavy and bursty and a failed step must not leave a post pointing at nothing.",
    k: ["Process before the post is visible vs after: before guarantees quality and delays posting; after is instant and shows placeholders or broken media for a while.", "Many renditions up front vs on demand: up front is fast to serve and costly in storage; on demand saves storage and slows first viewers."],
    p: ["Location metadata is left in images and exposes where a person lives.", "A malformed file crashes the decoder and the job is retried forever, blocking the queue."],
    v: "Upload a photo with location tags and a rotated video. The outputs have no location data, correct orientation, all renditions exist, and the post shows complete media within the stated time.",
    dep: ["media-upload", "media-blob-store", "job-queue", "hash-matching", "automated-classifiers"]
  },
  "media-storage-and-cdn": {
    s: "Stores processed media durably and delivers it from caches near viewers, so most views never reach the origin and load fast anywhere.",
    d: "Renditions sit in object storage and are referenced by immutable URLs. A content delivery network caches them at edge locations with long lifetimes, and misses fall through to regional caches then origin. Access control uses signed, expiring URLs for private media. It is the largest cost line of the system. It is hard because cache hit rate decides cost, private content must not be cached publicly, and deletion has to remove copies in every cache.",
    k: ["Immutable URLs with long caching vs mutable URLs: immutable URLs cache perfectly and need a new URL on any change; mutable URLs are simple and invalidation is hard.", "Signed expiring URLs vs public URLs: signed protect private media and reduce cache sharing; public are cheap and unrestricted."],
    p: ["A deleted image remains reachable by its URL from edge caches for days.", "Signed URLs include a per-user token in the cache key, so nothing is shared and the hit rate collapses."],
    v: "Fetch a popular image from several regions and confirm over 95 percent of requests are edge hits. Delete it and confirm it returns an error everywhere within the stated purge time.",
    dep: ["media-blob-store", "media-processing", "cold-archive-tiering"]
  },
  "link-previews": {
    s: "Fetches a shared link, extracts a title, description and image, and stores a preview card with the post so viewers see context without leaving the feed.",
    d: "On post creation, a crawler service fetches the URL with strict limits, reads standard page metadata, resizes the image and stores the card keyed by canonical URL. Results are cached and refreshed. Safety checks run on the destination. It is hard because the crawler fetches arbitrary addresses on the system's behalf: it must not reach internal networks, must respect size and time limits and must handle pages that change after posting.",
    k: ["Fetch at post time vs at view time: post time is stable and fast to render; view time is current and slow and exposes viewers' addresses.", "Server-side fetch vs client-side: server is controlled and cached; client avoids a crawler and leaks viewer data and varies."],
    p: ["The crawler can be pointed at internal addresses and returns private data in a preview, a server-side request forgery.", "A destination changes to harmful content after the preview was approved."],
    v: "Post links to a normal page, a very large file, a redirect loop and an internal address. The first gives a card; the others fail fast with no internal access and no hung worker.",
    dep: ["job-queue", "media-processing", "automated-classifiers", "quotas-and-load-shedding"]
  },
  "mentions-and-hashtags": {
    s: "Parses posts for references to accounts and topics, links them, notifies mentioned people and feeds topic indexes and trending detection.",
    d: "Text is tokenized at creation to find mentions and tags, which are validated against existing accounts and normalized. Each becomes a structured entity stored with the post, so rendering does not reparse. Mentions create notifications subject to privacy and blocks; tags go to the hashtag index. It is hard because text rules vary across languages and scripts, entity offsets shift with edits, and mentions are an abuse vector.",
    k: ["Parse on the server vs trust client-provided entities: server parsing is authoritative and costs compute; client entities are fast and can disagree with the text.", "Allow mentions of anyone vs only connections: open mentions enable discovery and harassment; limits reduce abuse and block legitimate use."],
    p: ["Account renames change what a mention points to, so old posts link to the wrong person unless mentions store ids.", "A post with hundreds of mentions is used to spam people."],
    v: "Post text with mentions and tags in several scripts. Each resolves to the right account or tag, mentioned users are notified once, and blocked accounts are not.",
    dep: ["post-service", "notification-generator", "hashtag-index", "blocks-and-mutes"]
  },
  "reposts-and-quotes": {
    s: "Lets people share an existing post to their followers, either unchanged or with their own comment, linking back to the original.",
    d: "A repost is a new lightweight record pointing at the original and fanning out like a post, with display rules showing the original author. A quote is a post with an embedded reference. Counts roll up to the original. Visibility is checked against both the reposter's audience and the original's. It is hard because content crosses audiences: a private post must not be resharable beyond its own audience, and deletion of the original has to remove or tombstone all derived views.",
    k: ["Reference to the original vs copy of content: references keep one source of truth and need a join at read; copies read fast and go stale.", "Allow reshare of restricted posts vs forbid: forbidding preserves the author's intent and frustrates sharing; allowing breaks privacy."],
    p: ["The original is deleted and reposts keep showing its cached text.", "A repost chain creates cycles or very deep nesting that the renderer cannot handle."],
    v: "Repost a post and confirm followers see it with attribution and counts credited to the original. Delete the original and confirm every repost and quote shows a deleted placeholder.",
    dep: ["post-service", "fanout-on-write", "read-time-privacy-check", "edit-and-delete-propagation"]
  },
  "replies-and-threads": {
    s: "Conversation structure under a post: replies linked to their parents, ordered and collapsed for reading, with controls over who may reply.",
    d: "Each reply stores a parent id and a root id, so a thread can be fetched in one query and arranged as a tree. Display orders by time, relevance or the author's own replies first, and collapses deep branches. Reply permissions limit who can join. Replies are posts themselves, with feeds and notifications, but are normally shown in context. It is hard because popular threads become huge trees and ranking replies is a feed problem of its own.",
    k: ["Store the root id on every reply vs only the parent: a root id gives one-query thread loads and costs write complexity; only parent requires recursive walks.", "Nested display vs flat: nested shows structure and is hard on small screens; flat is easy and loses who replied to whom."],
    p: ["A deleted parent orphans its replies, which then render without context or vanish.", "Reply restrictions are checked in the client only, and a crafted request posts anyway."],
    v: "Create a thread with three levels and 1,000 replies, load it from several devices, and confirm the ordering is stable, deep branches collapse, and a restricted reply is rejected by the server.",
    dep: ["post-service", "post-schema-and-ids", "post-store", "read-time-privacy-check"]
  },
  "edit-and-delete-propagation": {
    s: "Makes a change or removal of a post reach every copy: feeds, caches, search indexes, notifications, reposts, backups and downstream data stores.",
    d: "An edit or delete creates an event with the post id and a version. Consumers update or remove their copies, and reads check a tombstone for the latest state. Edits may keep a visible history. Deletes are soft first, then physically removed after a retention window, subject to legal holds. It is hard because the post was copied into many places by design, and the guarantee people expect, that deleted means gone, covers all of them.",
    k: ["Tombstone check at read vs rely on propagation: tombstone checks are immediate and add a lookup; propagation is cheap and has a window of exposure.", "Show edit history vs overwrite: history is transparent and keeps old text visible; overwrite is clean and enables silent changes."],
    p: ["A deleted post stays in a search index because the indexer missed the event.", "An edit changes a post after it was approved by moderation, and no re-review runs."],
    v: "Delete a post and probe feed, search, notifications, reposts, client cache and CDN. Each shows it gone within the stated time. A backup restore does not resurrect it.",
    dep: ["event-log", "cache-invalidation", "search-indexer", "feed-store", "post-store"]
  }
});
