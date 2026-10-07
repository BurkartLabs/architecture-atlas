// Details for the social feed plate, part 1: clients, real-time delivery, feed generation.
ATLAS.details("social-feed", {
  "timeline-ui": {
    s: "The scrolling list of posts a person sees, rendering text, media and counts, reporting what was seen, and keeping position while new content arrives above.",
    d: "The screen requests a page of feed entries, renders cards with placeholders for media, and recycles off-screen views so long scrolls stay smooth. It records which posts were actually visible and for how long, and sends those signals back for ranking. New content arriving at the top must not shove the reader's place. It is hard because feed items have wildly different heights, load media at different times, and may be deleted or hidden while they are on screen.",
    k: ["Insert new posts immediately vs hold them behind a tap: immediate feels live but moves what the reader is looking at; holding keeps position and costs a little freshness.", "Server-rendered cards vs client-rendered from data: server rendering is easier to change without app releases but ships more bytes; client rendering is lighter and ties layout changes to release cycles."],
    p: ["Image load changes card height after render, so the list jumps under the reader's thumb and scroll position cannot be restored.", "Visibility is logged when a card is mounted rather than when it is on screen, so ranking learns from posts nobody saw."],
    v: "Scroll through 500 posts on a mid-range device while new posts arrive, and confirm the frame rate stays smooth, the visible post never shifts, and the impression log matches what was on screen.",
    dep: ["cursor-pagination", "client-side-cache", "media-viewer", "impression-logging"]
  },
  "composer": {
    s: "The editor where a person writes a post, attaches media, picks an audience and publishes, with drafts and optimistic display before the server confirms.",
    d: "The composer holds text, mentions, attachments and audience choices locally, uploads media in the background while the person types, and submits one create request carrying an idempotency key. It shows the new post at once in the author's own timeline, then reconciles with the server's id and any rejection. Drafts survive app kills. It is hard because partial failure is common: media uploaded but the post not created, or the post created but the response lost.",
    k: ["Upload media on attach vs on publish: uploading early makes publish instant but wastes bandwidth and storage on abandoned drafts; uploading late is wasteful of nothing and slow at the moment of tapping.", "Optimistic local post vs wait for confirmation: optimism feels instant but the post may be rejected by moderation or fail; waiting is honest and slower."],
    p: ["A retry after a lost response creates a duplicate post because the create call carried no idempotency key.", "A draft with an old audience setting is published after the person tightened their privacy, exposing it more widely than intended."],
    v: "Publish a post with two images on a throttled network and drop the connection mid-request. After reconnecting, exactly one post exists, with both images and the chosen audience.",
    dep: ["media-upload", "post-service", "audience-selection", "idempotency-and-dedup"]
  },
  "cursor-pagination": {
    s: "Fetching the feed in pages identified by an opaque position marker rather than a page number, so new and deleted posts do not cause repeats or gaps.",
    d: "The server returns a page of entries plus a cursor encoding the position, usually the last item's sort key and a version of the ranking. The client sends it back for the next page. Offsets break on a live feed because inserting posts at the top shifts everything down. Ranked feeds add a problem: the order at page two must match page one, so the server keeps a short-lived ranked list or signs the ranking state into the cursor.",
    k: ["Cursor on a stable sort key vs offset: cursors survive inserts and deletes and cost an index lookup; offsets are simple and show duplicates as the list shifts.", "Snapshot the ranked list per session vs re-rank on every page: a snapshot gives consistent order and stale scores; re-ranking is fresher and can show a post twice or skip one."],
    p: ["A cursor tied to a cache entry that expires gives an error mid-scroll, and the client restarts from the top.", "Clients parse the cursor and depend on its shape, so changing the encoding breaks old app versions."],
    v: "Fetch ten pages while 50 posts are inserted and 10 deleted between requests. Every surviving post appears exactly once, in order, with no error from an expired cursor.",
    dep: ["timeline-merger", "feed-cache", "post-schema-and-ids"]
  },
  "client-side-cache": {
    s: "A local store of recently seen feed pages, posts and images so the app opens instantly, works briefly offline and avoids refetching what has not changed.",
    d: "Entries sit in memory and on disk keyed by post id and version. On launch the client shows the last feed immediately, then refreshes in the background and merges. Images are cached by URL under a size limit with least-recent eviction. Revalidation uses version tags so unchanged data costs a tiny response. It is hard because cached posts can become wrong: edited, deleted, or hidden by a new block.",
    k: ["Show stale cache first vs wait for fresh data: stale-first opens instantly but may briefly show deleted content; waiting is correct and shows a spinner at every launch.", "Cache by post id vs cache whole pages: per-post caching dedupes across feeds and needs reassembly; whole pages are simple and go stale together."],
    p: ["A post deleted for legal reasons stays readable from the local cache until it is evicted.", "The disk cache grows without a bound on devices with little storage, and the operating system kills the app."],
    v: "Open the app in airplane mode and see the last feed. Reconnect and confirm a post deleted server-side vanishes after the first refresh and does not reappear.",
    dep: ["edit-and-delete-propagation", "cursor-pagination"]
  },
  "media-viewer": {
    s: "The player and gallery that show images and video inline and full screen, choosing the right quality for the network and device and loading only what is about to be seen.",
    d: "The viewer picks a rendition from the sizes the processing pipeline made, using screen density and measured bandwidth. Images load progressively from a small blurred placeholder. Video autoplays muted when mostly visible, pauses when scrolled away, and starts from adaptive streaming segments. Prefetching looks a few items ahead. It is hard because each item competes for bandwidth, memory and battery against all the others in the list.",
    k: ["Autoplay in the feed vs tap to play: autoplay raises engagement and burns data and battery; tap to play is cheap and slower to hook people.", "Prefetch aggressively vs on demand: prefetching hides latency and wastes bytes on items never reached; on demand saves data and stalls."],
    p: ["Several videos decode at once while scrolling quickly, so memory runs out and the app is killed.", "A rendition URL that was signed for a short time expires while the post is cached, giving a broken image."],
    v: "Scroll a feed of 30 mixed items on a throttled connection and confirm only visible video plays, the first frame appears within about a second, and no more than a couple of decoders are active.",
    dep: ["media-storage-and-cdn", "media-processing"]
  },
  "api-gateway": {
    s: "The single entry point for client requests, handling transport security, authentication, request shaping, rate limits and routing to the feed and content services.",
    d: "It terminates TLS, validates the session token, applies per-user and per-client limits, and routes the request. A feed call is usually composed here or in a thin aggregation layer that calls the feed, post, graph and counter services in parallel and assembles one response. It version-checks old clients and can shed load by endpoint priority. It is hard because it sits on every request and must add very little latency, while a slow dependency must not tie up its worker pool.",
    k: ["One composed response vs many fine-grained calls: composing saves mobile round trips and puts logic on the server; separate calls are flexible and cost battery and latency on bad networks.", "Per-endpoint timeouts with partial responses vs fail whole: partial responses keep the feed up when a counter service is slow; failing whole is simpler and less available."],
    p: ["One slow downstream service consumes all gateway workers, and unrelated endpoints time out.", "Retries from clients and the gateway multiply, turning a small slowdown into a traffic storm."],
    v: "Make the counter service return slowly and confirm feed requests still complete within the latency budget with counts omitted, while the gateway's worker usage stays flat.",
    dep: ["session-and-auth", "service-rpc", "quotas-and-load-shedding"]
  },
  "session-and-auth": {
    s: "Establishes who is calling: sign-in, short-lived access tokens, refresh, device tracking and the ability to end a session everywhere.",
    d: "Sign-in produces an access token with a short life and a refresh token held securely on the device. Each request carries the access token, which the gateway verifies locally or against a session store. Sessions are tied to devices so a stolen token can be revoked individually and suspicious sign-ins can trigger extra checks. It is hard because revocation must take effect quickly while verification stays cheap enough to run on every request.",
    k: ["Self-contained signed tokens vs server-side sessions: signed tokens verify without a lookup and cannot be revoked until expiry; server sessions revoke at once and add a store to every request.", "Long refresh lifetime vs frequent re-login: long lifetimes keep people signed in and widen the window of a stolen token."],
    p: ["A user is suspended or changes a password but old tokens keep working until they expire.", "Token validation is skipped on an internal path, so a service trusts a user id supplied by the client."],
    v: "Sign in on two devices, revoke one, and confirm the revoked device is refused within the documented time while the other keeps working.",
    dep: ["profile-store", "consent-and-age-gating"]
  },
  "live-connection-gateway": {
    s: "Servers that hold millions of open connections to apps and pages, so updates can be pushed the moment they exist instead of waiting for the next poll.",
    d: "Each client opens a long-lived connection over a persistent transport and authenticates once. The gateway keeps minimal per-connection state, sends heartbeats, and forwards messages from the publishing system to the right sockets. It is a separate fleet from the request path because connections are cheap to hold and costly to restart. It is hard because a deploy or crash disconnects a whole fleet slice, and every client reconnects at once.",
    k: ["Persistent connections vs polling: persistent connections give near-instant updates and need a connection-holding fleet; polling is stateless and wastes requests when nothing changed.", "Push full payloads vs push a hint to fetch: full payloads save a round trip and can leak content that privacy rules would now refuse; hints are safe and add a request."],
    p: ["After a restart every client reconnects within seconds, and the thundering herd overloads authentication.", "Half-open connections to dead phones are kept for minutes, wasting memory and misleading presence."],
    v: "Restart one gateway host holding 100,000 connections and confirm clients reconnect spread over at least a minute with jitter, no authentication errors, and no missed update afterwards.",
    dep: ["subscription-registry", "session-and-auth", "service-rpc"]
  },
  "subscription-registry": {
    s: "Tracks which connections care about which topics, such as a user's own feed or a viewed post, so a published event is sent only to the gateways that need it.",
    d: "When a client opens a screen it subscribes to topics; the registry maps topic to the gateway hosts holding interested connections. The publisher looks up hosts and sends one message per host, and each host fans out to its local sockets. Entries expire with connections. It is hard because the mapping changes constantly, must be fast to read, and can be slightly wrong without harm if clients also catch up by fetching.",
    k: ["Per-user topics vs per-object topics: user topics keep the mapping small and push everything to everyone; object topics target precisely and create enormous numbers of topics.", "Exact mapping vs approximate with a refresh: exact needs strong coordination; approximate is cheap and may miss a few updates that polling then repairs."],
    p: ["Stale entries for closed connections cause the publisher to send to hosts that no longer hold the socket.", "A viral post attracts millions of subscribers to one topic and one host is overloaded."],
    v: "Subscribe 1,000 clients to a post, publish an update, and confirm each receives it once and a client that closed its screen first receives nothing.",
    dep: ["live-connection-gateway", "event-log"]
  },
  "live-update-publisher": {
    s: "Turns changes such as new posts, edits and count changes into messages routed to subscribed connections, batching and sampling so busy objects do not flood clients.",
    d: "It consumes events from the event log, looks up interested hosts in the registry, applies privacy and block checks, and sends compact updates. For counters it coalesces: send the latest value at most every second or two rather than every like. It is hard because the volume on a popular post can exceed what any client can render, so the system must decide what to drop without making the display look wrong.",
    k: ["Coalesce to latest value vs deliver every event: coalescing bounds load and loses intermediate states nobody needs; every event gives exact history at a cost clients cannot absorb.", "Check visibility at publish vs trust earlier fan-out: checking at publish stops leaks after a block and adds a lookup per message."],
    p: ["A blocked user keeps receiving live updates for a post because the check ran only at the original fan-out.", "Updates arrive out of order, and an older count overwrites a newer one on the screen."],
    v: "Like a post 10,000 times in ten seconds while a client watches it. The client receives a handful of coalesced updates, the final count is correct, and its CPU stays low.",
    dep: ["subscription-registry", "event-log", "read-time-privacy-check", "approximate-counts"]
  },
  "new-posts-indicator": {
    s: "The small banner telling a reader that newer posts exist, so the feed can stay still while giving the reader control over when to load them.",
    d: "The client polls a cheap endpoint, or receives a live hint, that returns only whether and how many entries are newer than the top cursor. Tapping the banner fetches and prepends them. The server answers from the feed cache without building a full feed. It is hard because the count must be consistent with what the next fetch returns, and ranking may make newer not mean better, so some products show a dot instead of a number.",
    k: ["Show a count vs a plain dot: counts are informative and promise a specific number that ranking and filtering may not deliver; a dot promises only that something changed.", "Poll vs live hint: polling is simple and adds steady load; hints are efficient and need the live connection."],
    p: ["The banner says 12 new posts and loading shows 3 because the other 9 were filtered by privacy or muting.", "Every open client polls every few seconds, creating constant load that dwarfs real feed requests."],
    v: "Publish five posts from followed accounts and confirm the banner appears within the stated time, the count matches what loads, and a muted author's post is not counted.",
    dep: ["feed-cache", "live-update-publisher", "blocks-and-mutes"]
  },
  "notification-generator": {
    s: "Watches events such as follows, replies, mentions and reactions and creates a notification record for each person who should be told, applying relevance and spam rules.",
    d: "Consumers read the event log and decide who is affected, creating one record per recipient with a type, actor, target and time. It filters by blocks, mutes, preferences and abuse signals before storing anything. Notifications are written to a per-user store and then handed to aggregation and delivery. It is hard because one event can mean many recipients, such as a mention in a thread, and because relevance is subjective: too many notifications train people to disable all of them.",
    k: ["Generate on write for each recipient vs compute on open: on write enables push and an inbox with its own storage cost; on open is cheap and cannot push.", "Filter early vs filter at delivery: early filtering saves storage and cannot honor later setting changes; late filtering is flexible and stores records never shown."],
    p: ["A mention in a post with a thousand tagged people creates a thousand notifications and a harassment vector.", "Events are replayed after a consumer failure and recipients receive duplicate notifications."],
    v: "Have an account reply to a post and confirm the author gets exactly one notification, a blocked replier produces none, and replaying the event does not create a second.",
    dep: ["event-log", "blocks-and-mutes", "notification-preferences", "idempotency-and-dedup"]
  },
  "notification-aggregator": {
    s: "Combines many similar notifications into one, such as 'and 40 others liked your post', and paces delivery so activity on a hit post does not become a flood.",
    d: "Aggregation groups records by recipient, type and target within a window, keeps the latest few actors for display, and updates one entry instead of adding many. Delivery waits a short delay so a burst becomes one message, with a ceiling so the first like is not held for long. It is hard to pick windows: too long and notifications feel late, too short and a viral post sends a message for every reaction.",
    k: ["Aggregate in the store vs at render time: store aggregation keeps the inbox small and loses individual records; render-time grouping preserves detail and costs more to read.", "Fixed delay vs adaptive delay by rate: adaptive reacts to bursts and is harder to reason about; fixed is predictable and wrong at both extremes."],
    p: ["Aggregation updates an entry that was already delivered, and the user is pushed the same notification repeatedly.", "The first reaction to a new post is delayed by the aggregation window, and the author feels the app is slow."],
    v: "Generate 500 likes on one post in a minute and confirm the owner gets a small number of pushes with correct growing totals, and the inbox shows one entry.",
    dep: ["notification-generator", "job-queue"]
  },
  "push-delivery": {
    s: "Sends notifications to closed apps through each platform's push service, with token management, retries, expiry and the fallback of email or in-app badges.",
    d: "A worker takes an aggregated notification, looks up the recipient's device tokens, builds a platform payload and sends it through the platform's push gateway. Responses tell it which tokens are dead so they can be removed. Messages carry an expiry so stale ones are dropped instead of arriving hours late. It is hard because delivery is best effort and unobservable: the gateway accepts a message that the phone may never show.",
    k: ["Send content in the payload vs a generic alert that fetches: content is richer and exposes private text on lock screens and to intermediaries; generic is safer and needs the app to wake.", "Retry until delivered vs drop after expiry: retries raise delivery odds and deliver stale news; expiry keeps relevance and loses some notifications."],
    p: ["Dead device tokens are never removed, so sends slow down and the platform throttles the sender.", "A notification is sent for a post that was deleted a minute earlier, exposing its content."],
    v: "Send a test notification to a device and measure delivery latency at the median and the 99th percentile. Uninstall the app and confirm its token is removed after the platform reports it invalid.",
    dep: ["notification-aggregator", "notification-preferences", "profile-store", "job-queue"]
  },
  "notification-preferences": {
    s: "Per-user settings for which events notify, through which channel and when, applied consistently before a notification is created or sent.",
    d: "Preferences are stored per user by event type and channel, with global quiet hours and per-account mute choices such as notifications only from people followed. The generator and delivery both read them, often through a cache. Defaults matter more than the settings screen because most people never change them. It is hard because the matrix of types, channels and sources grows with each new feature and each addition needs a sensible default.",
    k: ["Opt-out defaults vs opt-in: opt-out brings people back and risks irritation and regulatory trouble; opt-in is respectful and leaves reach low.", "Enforce at generation vs at send: enforcing at generation avoids storing unwanted records; enforcing at send responds at once to changes."],
    p: ["A new notification type ships without a preference entry and cannot be turned off.", "Cached preferences lag a change, and a person who just disabled a type still receives it."],
    v: "Turn off reply notifications, have another account reply, and confirm no push or inbox entry appears. Turn them on again and confirm the next reply notifies.",
    dep: ["profile-store", "feed-cache"]
  },
  "fanout-on-write": {
    s: "When a post is published, copy a reference to it into the feed of every follower, so reading a feed is a single cheap lookup.",
    d: "A worker reads the author's follower list in batches and appends the post id to each follower's feed list in the feed store. A read then fetches that list and hydrates the posts. It shifts cost from the many reads to the fewer writes, which suits a read-heavy product. It is hard because write amplification equals follower count: one post from an account with millions of followers becomes millions of writes, and it lags the account's own timeline.",
    k: ["Precompute feeds vs compute on read: precomputed feeds are fast to read and expensive to write and store; computing on read is cheap to store and slow and costly per view.", "Store ids only vs store post copies: ids save space and need hydration; copies read faster and are hard to edit or delete."],
    p: ["A very large account posts and the fan-out queue is occupied for minutes, delaying every other author's posts.", "Fan-out partially fails, so some followers get the post and others never do."],
    v: "Publish from an account with 10,000 followers and measure how long until the last follower's feed contains the post. Check that all 10,000 have exactly one entry.",
    dep: ["fanout-workers", "follow-edge-store", "feed-store", "post-schema-and-ids"]
  },
  "fanout-on-read": {
    s: "Build the feed at request time by fetching recent posts from each account the reader follows and merging them, with nothing precomputed per reader.",
    d: "The service reads the reader's followed accounts, fetches each one's latest posts from the author's own timeline, and merges by time or score. Writes are cheap: a post is stored once under its author. Cost moves to every read, which grows with the number followed. It is hard because it fans out into many small lookups, so tail latency is set by the slowest of them, and caches have to carry the load.",
    k: ["Pull from every followed account vs a sampled subset: complete results cost many lookups; sampling is cheaper and can miss posts.", "Per-author timelines vs one global index: per-author timelines are simple and spread reads widely; a global time index is compact and harder to shard."],
    p: ["Readers who follow thousands of accounts make each request issue thousands of lookups and time out.", "One slow shard holding a popular author stalls every feed that includes that author."],
    v: "Load a feed for a reader following 2,000 accounts and confirm the request completes within the latency budget and the result equals a brute-force merge of those accounts' recent posts.",
    dep: ["follow-edge-store", "post-store", "timeline-merger", "graph-cache"]
  },
  "hybrid-fanout-policy": {
    s: "The rule that picks write-time or read-time delivery per author, usually by follower count and activity, so ordinary accounts are precomputed and the largest are merged in on read.",
    d: "Authors above a follower threshold are marked as heavy and skipped by fan-out on write. At read time the service takes the reader's precomputed feed and merges in recent posts from the heavy accounts that reader follows. The threshold may adapt to load, and the set of heavy accounts is a small list that can be cached everywhere. It is hard because accounts cross the threshold, readers' mix of heavy follows varies, and each request now runs both paths.",
    k: ["Static follower threshold vs adaptive by load: a static line is predictable and misclassifies bursts; adaptive handles surges and changes behavior without a deploy.", "Skip heavy accounts entirely vs push to only active followers: skipping saves the most writes; pushing to active followers keeps their feeds fresh and still bounds cost."],
    p: ["An account crosses the threshold and its old posts remain in feeds while new ones are only merged at read, creating inconsistent ordering.", "The heavy list is stale on some servers, and those servers show feeds missing a major account's posts."],
    v: "Move a test account across the threshold and confirm its posts appear in followers' feeds before and after, in correct order and without duplicates, and write load for it drops.",
    dep: ["fanout-on-write", "fanout-on-read", "follow-edge-store", "flags-and-rollout"]
  },
  "fanout-workers": {
    s: "A pool of background workers that consume new-post events and perform the copy into follower feeds, in parallel batches with retries and backpressure.",
    d: "Posting emits an event; fan-out jobs are queued partitioned by author or follower shard. Workers page through followers, write feed entries in batches, and record progress so a failed job resumes rather than restarts. They run at lower priority than user-facing work and give priority to authors with active followers. It is hard to keep fairness: one huge job must not starve many small ones, and lag must be visible.",
    k: ["Split large jobs into follower chunks vs one worker per post: chunks parallelize and need progress tracking; a single worker is simple and takes too long for large audiences.", "Prioritize active followers first vs strict order: activity-first improves perceived freshness and complicates completeness checks."],
    p: ["A retry reruns the whole job and duplicates entries, because writes are not idempotent.", "A backlog grows quietly during a bad deploy, and feeds go stale for hours before anyone notices."],
    v: "Publish 1,000 posts in a minute from mixed authors, watch queue depth return to zero, and confirm the 99th percentile fan-out delay stays within its objective with no duplicate feed entries.",
    dep: ["job-queue", "idempotency-and-dedup", "feed-store", "follow-edge-store", "quotas-and-load-shedding"]
  },
  "timeline-merger": {
    s: "Combines several ordered sources, such as the precomputed feed, heavy-author posts, ads and the person's own recent posts, into one list with consistent order and no duplicates.",
    d: "Each source returns entries sorted by key. A k-way merge produces the next page, skipping ids already seen and applying cursor position. Filters for blocks, mutes and deleted posts run here or just before. The merger must also handle sources that fail or are slow, returning a partial result rather than none. It is hard because the sources use different keys and freshness, and correctness depends on every page agreeing about order.",
    k: ["Merge by time vs merge by score: time order is stable and explainable; score order needs one comparable scale across sources.", "Fail the page on a missing source vs degrade: degrading keeps the feed usable and can quietly omit major accounts."],
    p: ["A post appears twice because it arrives through both the precomputed feed and the heavy-author path.", "A slow source blocks the whole merge, and a feed request times out due to one minor input."],
    v: "Merge four sources with overlapping entries and a deliberately slow one. The page returns on time, contains each post once in the right order, and marks the degraded source in logs.",
    dep: ["feed-store", "diversity-and-dedup", "blocks-and-mutes", "post-object-cache"]
  },
  "feed-backfill": {
    s: "Repairs or rebuilds a feed when it is empty, stale or wrong: after a new follow, a new account, a failed fan-out or a restore from backup.",
    d: "When someone follows a new account, their recent posts are inserted into the follower's feed, otherwise the follow seems to do nothing. A new user's feed is seeded from suggested accounts. A rebuild job can recompute a feed from the graph and post store. Unfollows and blocks remove entries. It is hard because backfills compete with live traffic and must interleave correctly with posts arriving at the same time.",
    k: ["Insert on follow vs wait for the next post: inserting makes the follow feel real and costs writes; waiting is free and leaves new follows invisible for hours.", "Rebuild from the source of truth vs patch the feed: rebuilds are always correct and costly; patches are cheap and can compound errors."],
    p: ["Unfollowed accounts' posts remain in the feed because backfill only adds and never removes.", "A mass rebuild after an incident saturates the store and slows normal reads."],
    v: "Follow an account with recent posts and confirm its latest posts show in the feed within seconds. Unfollow and confirm they disappear. Delete a feed and rebuild it, and confirm the result matches the original.",
    dep: ["follow-edge-store", "post-store", "feed-store", "edge-change-events"]
  },
  "feed-truncation": {
    s: "Keeps each precomputed feed to a bounded length and age, dropping old entries so storage and read cost per user stay predictable.",
    d: "Each feed list holds the most recent few hundred to few thousand entries. Appending beyond the limit trims the oldest, or a background job expires entries by age. Deeper scrolling falls back to a slower path such as read-time merge or an archive. It is hard to choose a limit: too small and heavy scrollers hit the end, too large and storage grows with the number of follows times activity.",
    k: ["Fixed length per feed vs by age: fixed length bounds storage exactly and keeps old posts for slow feeds; age keeps relevance and varies in size.", "Hard stop at the limit vs fallback to a slow path: a hard stop is simple and frustrating; a fallback is complete and adds a second code path."],
    p: ["Trimming removes entries that were pinned or promoted, and they vanish unexpectedly.", "Deeper pages are served by a rarely exercised fallback that is slow or broken when it is finally used."],
    v: "Scroll a heavy reader's feed to the stated limit and confirm the fallback loads older posts without gaps, and that feed storage for the account stays at or under the cap.",
    dep: ["feed-store", "cold-archive-tiering", "fanout-on-read"]
  },
  "inactive-user-handling": {
    s: "Stops spending fan-out writes on feeds nobody reads, by skipping dormant accounts and rebuilding their feed on return.",
    d: "Most accounts are inactive at any time. Fan-out skips users who have not opened the app in some number of days, and keeps only a small pointer. When they return, a backfill builds the feed from the graph and recent posts, using a slower first load. Cold feeds may be evicted from fast storage. It is hard because the first impression of a returning user is the slowest feed they will see, and the definition of inactive determines both cost and that experience.",
    k: ["Skip dormant users vs fan out to everyone: skipping can cut writes by large fractions and makes the return slow; fanning out to everyone is simple and expensive.", "Short dormancy threshold vs long: short saves more and rebuilds more often; long avoids slow returns and spends more."],
    p: ["A returning user sees an empty or sparse feed because rebuild is asynchronous and the first request does not wait.", "A marketing push brings back many dormant users at once, and rebuild load spikes."],
    v: "Reactivate an account dormant for 30 days and confirm its first feed request returns a full, correctly ordered page within the latency target, and its feed storage exists again afterwards.",
    dep: ["feed-backfill", "fanout-workers", "feed-store"]
  },
  "celebrity-skew": {
    s: "The audience of a social network follows a steep power law: a few accounts have millions of followers while most have dozens, and almost every design choice must account for that.",
    d: "Average-case thinking fails here. Fan-out on write is fine for the typical account and unaffordable for the largest. A single post can bring a flood of reads to one object, one counter and one shard. The same skew appears in hashtags, trending events and shared links. Designs handle it with separate paths for heavy accounts, replicated hot keys, sampled counters and capacity planned for peaks rather than averages. It is hard because load is set by the few extremes, which change daily.",
    k: ["Special-case the head vs one uniform path: special paths bound cost and add code to test; a uniform path is simple and fails on the first big event.", "Detect heavy keys automatically vs configure them: automatic detection reacts to surprise virality and can misfire; configuration is predictable and late."],
    p: ["Load tests use uniform random accounts, so the first real viral event is also the first time hot-key behavior is exercised.", "Heavy-account lists are manual and stale, and an unlisted account goes viral."],
    v: "Replay a traffic profile in which one account gains a million followers and one post receives a hundred thousand reactions per minute. No shard or cache node exceeds its stated load and latency stays within target.",
    dep: ["hybrid-fanout-policy", "hot-key-replication", "sharded-counters", "graph-sharding"]
  }
});
