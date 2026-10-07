// Details for the social feed plate, part 4: stores, caching, platform plumbing, cross-cutting concerns.
ATLAS.details("social-feed", {
  "post-store": {
    s: "The durable system of record for posts, keyed by post id and sharded for write volume, optimized for point reads and for scans of one author's recent posts.",
    d: "Posts are stored by id with the author's timeline as a secondary key ordered by time. The store is a sharded database or wide-column system with replication. Reads are mostly single-key or small batches by id, so it serves hydration for feeds. Old posts are rarely read but must remain. It is hard because it must absorb sustained writes, keep latency low for batch reads of dozens of ids, and survive losing a node without losing a post.",
    k: ["Shard by post id vs by author: by post id spreads writes and scatters an author's timeline; by author keeps timelines local and creates hot shards for big accounts.", "Wide-column or key-value store vs relational: key-value scales out and limits queries; relational is flexible and harder to shard."],
    p: ["An author-keyed shard of a very popular account becomes the system's hot spot.", "Batch hydrate of 50 ids hits 50 shards, and the slowest one sets the page latency."],
    v: "Write at the expected peak rate and read batches of 50 ids by many clients. The 99th percentile batch read stays within target and killing one node loses no acknowledged post.",
    dep: ["shard-routing", "replication-and-failover", "id-generator"]
  },
  "feed-store": {
    s: "Holds each user's precomputed feed as a bounded, time-ordered list of post references, optimized for append and for reading the newest page.",
    d: "A key per user holds a list of post ids with metadata such as time and source. Appends add to the head, trimming the tail, and reads fetch a range. Because the data is derived and can be rebuilt, the store favors speed over durability, often in memory with persistence or a fast log-structured engine. It is hard because it is the largest write workload, scaled by follows times posts, and is read on every open.",
    k: ["Memory-resident with async persistence vs durable disk store: memory is fast and expensive and loses recent writes on failure; disk is cheaper and slower.", "Lists per user vs a global index filtered per reader: lists read in one step and cost storage; a global index is compact and expensive per read."],
    p: ["A cache-like store loses data on a node failure and many users see empty feeds until backfill runs.", "A few feeds grow far beyond the bound because trimming is only applied on append."],
    v: "Kill a feed store node and measure how many feeds are affected and how long until backfill restores them. Confirm reads stay within target and no feed exceeds its cap.",
    dep: ["shard-routing", "replication-and-failover", "feed-backfill"]
  },
  "profile-store": {
    s: "Stores account records, handles, display data, settings and verification state, read at very high rates and changed rarely.",
    d: "Each account has a stable internal id and mutable fields such as handle, name, photo and bio. Reads are batched by id for every feed page to render authors, and are cached aggressively. Writes are rare and must propagate to caches and search. Handle uniqueness needs a strongly consistent path. It is hard because the read-to-write ratio is extreme and a stale profile can display a former name or a suspended account.",
    k: ["Strongly consistent for handle claims vs eventual everywhere: strong consistency for uniqueness avoids duplicates and costs latency for a rare operation; eventual would allow duplicates.", "Embed author data in posts vs join at read: embedding reads quickly and goes stale on rename; joining is current and adds a batch lookup."],
    p: ["Handle reuse after deletion lets a new owner receive mentions or links meant for the old account.", "A profile cache serves a suspended account for hours."],
    v: "Rename an account and confirm every surface shows the new name within the stated time. Claim the same handle from two clients simultaneously and confirm exactly one succeeds.",
    dep: ["shard-routing", "replication-and-failover", "cache-invalidation"]
  },
  "media-blob-store": {
    s: "Object storage for original and processed media, with replication or erasure coding for durability and lifecycle rules for moving data to cheaper tiers.",
    d: "Objects are written once and read many times, addressed by key, split across disks and sites with erasure coding or copies. Metadata such as size, checksum and state is stored separately. Lifecycle rules move cold objects to cheaper storage. Integrity is checked by background scrubbing. It is hard because it is by far the largest data set, cost scales with retention, and durability must be nearly absolute while access patterns are heavily skewed to recent items.",
    k: ["Erasure coding vs full replicas: erasure coding cuts storage overhead and makes repair and small reads costlier; replicas read fast and use more space.", "Keep originals forever vs only processed forms: originals allow reprocessing and cost storage; keeping processed forms only saves cost and cannot re-encode."],
    p: ["A deletion removes the metadata but not the object, which stays in storage and billing indefinitely.", "Silent disk corruption is found only when someone reads the object years later."],
    v: "Write objects, corrupt a stored fragment in a test environment, and confirm scrubbing detects and repairs it, reads still return the right checksum, and deleted objects are physically removed after retention.",
    dep: ["replication-and-failover", "shard-routing"]
  },
  "shard-routing": {
    s: "Maps a key to the shard that owns it, with a directory or consistent hashing that clients and services share, and supports moving data between shards online.",
    d: "A routing layer holds the shard map, either as a lookup table or a hash ring, and is cached by clients and proxies. Rebalancing moves ranges to new nodes while serving traffic, using dual writes or forwarding during the move. Queries across shards are scatter-gather. It is hard because the map must be consistent enough that nobody writes to the old owner after a move, and because moves under load can double traffic.",
    k: ["Consistent hashing vs directory lookup: hashing needs no lookup and limits control; a directory lets operators place hot keys and adds a lookup service.", "Many small virtual shards vs few large: many make rebalancing smooth and add overhead; few are simple and move in coarse chunks."],
    p: ["A client with a stale shard map writes to the old owner and the write is lost.", "Rebalancing runs at peak traffic and pushes latencies over the limit."],
    v: "Move a shard under load and confirm no request fails, no acknowledged write is lost, clients converge on the new map within seconds, and latency stays inside target.",
    dep: ["service-rpc", "observability"]
  },
  "replication-and-failover": {
    s: "Keeps copies of data on several machines and sites and promotes a replica when the primary fails, trading durability, freshness and availability.",
    d: "Writes go to a leader and are copied to followers, synchronously for some data, asynchronously for most. Health checks detect failures and a coordination service chooses a new leader. Reads may go to replicas, accepting lag. Cross-region replication adds delay and adds disaster tolerance. It is hard because failover can lose recent writes under async replication, or split-brain if two nodes both think they lead.",
    k: ["Synchronous vs asynchronous replication: synchronous prevents loss and raises latency and unavailability risk; asynchronous is fast and can lose the last writes.", "Read from replicas vs only leaders: replica reads scale and may show stale data, such as a post you just made; leader reads are fresh and concentrate load."],
    p: ["A replica reading right after a write shows the author their own post missing.", "Automatic failover triggers on a network blip and creates two leaders."],
    v: "Kill a primary under write load. A replica is promoted within the stated time, the number of lost acknowledged writes is within the documented bound, and the old primary rejoins as a follower.",
    dep: ["service-rpc", "observability"]
  },
  "cold-archive-tiering": {
    s: "Moves old, rarely read posts, feeds and media to cheaper, slower storage while keeping them retrievable when someone scrolls far back or opens an old link.",
    d: "Age and access frequency drive migration jobs that move data to dense storage and leave a pointer. A read of archived data triggers a slower fetch, optionally promoting it back. The tiers differ in cost and latency by orders of magnitude. It is hard because access to old content is rare but real, such as an anniversary or a search from years ago, and the slow path has to work and not time out the request.",
    k: ["Tier by age vs by observed access: age is predictable and moves content that is still read; access-based fits usage and needs tracking.", "Transparent slow reads vs explicit loading state: transparent keeps the interface simple and risks timeouts; explicit is honest and complicates clients."],
    p: ["The archive path is rarely used and breaks silently, so the first deep scroll after a change fails.", "Moving data to a tier with a minimum retention period creates charges when it is deleted early."],
    v: "Request a post older than the archive threshold. It returns correctly within the stated slow-path time, and the tier migration job moved a known sample and left valid pointers.",
    dep: ["post-store", "media-blob-store", "job-queue"]
  },
  "feed-cache": {
    s: "Memory cache of recently built feed pages, and of the ranked list for a session, so repeat requests skip assembly and ranking.",
    d: "A key per user and variant holds the last page of entries or the ranked list for a short time. Requests check it first. Entries are invalidated or patched when new posts arrive, or simply allowed to expire in seconds. It cuts load sharply for users who refresh often. It is hard because personalization makes entries non-shareable, so hit rates are lower than for media, and staleness conflicts with the expectation that a new post appears.",
    k: ["Short expiry vs event-driven invalidation: expiry is simple and imprecise; invalidation is fresh and needs a reliable event path.", "Cache assembled pages vs only the id list: pages are fastest and stale in all fields; id lists reuse object caches and need hydration."],
    p: ["A cached feed continues to show a post after the reader blocked its author.", "A cold start after a cache failure sends the whole read load to the feed store at once."],
    v: "Refresh a feed repeatedly and confirm the hit rate and latency drop. Publish a new post from a followed account and confirm it appears within the stated time without waiting for expiry.",
    dep: ["feed-store", "cache-invalidation", "request-coalescing"]
  },
  "post-object-cache": {
    s: "Memory cache of post records and rendered fields by id, shared across readers, absorbing most of the hydration reads for popular and recent posts.",
    d: "After a feed returns a list of ids, the service batch-fetches posts from this cache and falls back to the post store for misses, filling the cache. Because every reader of the same post shares an entry, hit rates are very high for recent content. Entries are invalidated on edit and delete events. It is hard because the key space is huge, hot entries concentrate on a few nodes, and deletes must reach it promptly.",
    k: ["Cache the raw record vs the hydrated view: raw is general and needs assembly work; hydrated is fast and ties cache shape to one view.", "Negative caching of deleted ids vs none: negative caching shields the store from repeated lookups of deleted posts and keeps tombstones; none is simple and costly."],
    p: ["A deleted post remains in the cache because the invalidation event was lost.", "A viral post makes one cache node handle most of the traffic."],
    v: "Fetch a feed page of 50 posts and confirm over 95 percent of hydration reads hit the cache at steady state. Delete one and confirm it is gone from the cache within the stated time.",
    dep: ["post-store", "cache-invalidation", "hot-key-replication"]
  },
  "graph-cache": {
    s: "Memory cache of adjacency lists, counts and relationship checks, such as whether A follows B and who blocked whom, read on nearly every request.",
    d: "Frequently requested lists and relationship bits are cached close to the services that use them, including negative results. Updates arrive through the edge-change stream, applying deltas rather than dropping whole lists. Large lists are cached partially or as filters. It is hard because relationship data is highly skewed, large for heavy accounts, and the privacy path depends on it being current.",
    k: ["Cache whole lists vs individual relationship checks: lists serve many queries and are big; point checks are small and miss on rare pairs.", "Apply deltas from events vs expire entries: deltas keep entries fresh and need ordered events; expiry is simple and stale."],
    p: ["A block event is delayed, and the cache serves the old relationship for minutes.", "A single large account's list is loaded fully into cache on every miss and evicts everything else."],
    v: "Follow, unfollow and block while reading relationship checks continuously. Cached answers match the store within the stated lag, and the block takes effect first.",
    dep: ["follow-edge-store", "edge-change-events", "hot-key-replication"]
  },
  "cache-invalidation": {
    s: "The mechanism that removes or updates cached copies when the source changes, driven by events, versions and short lifetimes as a backstop.",
    d: "Writers emit invalidation messages after a change, delivered to all cache nodes that may hold the key, often over the event log or a dedicated channel. Entries carry versions so late messages are ignored. Time-to-live bounds the damage when a message is lost. It is hard because ordering races exist: a reader can fill the cache with an old value just after an invalidation, leaving stale data until expiry.",
    k: ["Delete on write vs update on write: delete is simple and causes a miss; update avoids misses and risks writing a stale value.", "Version-tagged entries vs plain keys: versions defeat out-of-order fills and add metadata to every entry."],
    p: ["A read races with a write and refills the cache with the old value, which persists until expiry.", "Invalidations are published before the database commit, so the next read caches the old data."],
    v: "Run concurrent writers and readers against one key and verify that after the last write every cache node converges to the final value within the stated time, with no stale refill.",
    dep: ["event-log", "service-rpc"]
  },
  "hot-key-replication": {
    s: "Detects keys with extreme read rates and serves them from many replicas or local memory, so one popular post or account does not overload a single node.",
    d: "Monitoring identifies hot keys from request counts. Hot entries are copied to several nodes, with clients choosing one at random, or into a small in-process cache with a very short lifetime. Writes to a hot key update or invalidate all copies. The same idea applies to counters and tag lists. It is hard because heat is sudden and short-lived, so detection must be fast, and replicas multiply the cost of invalidating a key.",
    k: ["Client-side local cache vs more server replicas: local caches take load off the network entirely and add staleness; replicas are consistent and keep traffic.", "Automatic detection vs a known list: automatic reacts to the unexpected and lags a few seconds; a list is instant for known cases and misses the rest."],
    p: ["Detection reacts after the node is already overloaded and failing.", "Short local lifetimes are forgotten, and a deleted hot post stays visible on app servers."],
    v: "Direct 100,000 requests per second at one key. The load spreads across replicas within seconds, no node exceeds its capacity, and an update is visible everywhere within the stated time.",
    dep: ["observability", "service-rpc"]
  },
  "request-coalescing": {
    s: "When many requests need the same missing item at once, only one fetches it and the rest wait for that result, preventing a stampede on the store.",
    d: "On a cache miss, the first request takes a short lease and loads the value; others see the lease and wait or are served a slightly stale value. The cache entry is then filled once. Early refresh before expiry avoids synchronized expiry of popular keys. It is hard because waiting requests add latency, a failed loader must release its lease, and stale serving must be bounded.",
    k: ["Wait for the loader vs serve stale while refreshing: waiting is fresh and queues requests; stale-while-refresh is fast and briefly outdated.", "Lease with timeout vs lock until done: a timeout recovers from a crashed loader and may allow duplicate loads; a lock is strict and can hang."],
    p: ["The loader crashes holding the lease, and every request for the key waits until timeout.", "All popular keys share the same expiry and refill together every period."],
    v: "Expire a hot key under load and confirm only one request reaches the store, the others return within the budget, and a killed loader releases its lease so the key refills.",
    dep: ["post-object-cache", "feed-cache", "graph-cache"]
  },
  "id-generator": {
    s: "Issues unique, roughly time-ordered 64-bit identifiers across many machines without a central bottleneck, used for posts, edges, events and media.",
    d: "Each id packs a timestamp, a machine or shard number and a per-millisecond sequence, so generation is local and sorts by time. Allocation of machine numbers is coordinated, and clocks are watched for going backward. Ids allow cursors and range scans without extra columns. It is hard because correctness depends on clocks, and the structure of ids leaks into storage layout, public URLs and the hot-spotting of time-ordered writes.",
    k: ["Time-based local generation vs a central sequence: local is fast and available and depends on clocks; central is exact and a bottleneck and single point of failure.", "Expose ids publicly vs use an opaque public handle: exposing is simple and leaks volume and timing; opaque hides it and requires a mapping."],
    p: ["A clock steps backward after a correction and the generator produces duplicates.", "Two hosts are given the same machine number after a misconfiguration and issue colliding ids."],
    v: "Generate ten million ids across many hosts with injected clock skew. No duplicates occur, ids sort within the allowed skew, and a backward clock step causes a wait or an error, not a repeat.",
    dep: ["service-rpc"]
  },
  "event-log": {
    s: "A durable, ordered, replayable stream of everything that happens, such as posts, edges, reactions and views, which every downstream system consumes at its own pace.",
    d: "Producers append events to partitioned topics, usually keyed by object so order holds per object. Consumers keep their own position and can rewind to rebuild state. Retention is days to weeks. It decouples the write path from fan-out, counting, search, notifications and analytics, and is the replay source after bugs. It is hard because ordering exists only within a partition, consumer lag is silent, and schemas must evolve while old events are still being read.",
    k: ["Log as the integration backbone vs direct service calls: the log decouples and replays and adds latency and an operational dependency; direct calls are immediate and tightly coupled.", "Partition by object key vs round robin: object keys preserve per-object order and risk hot partitions; round robin balances and loses order."],
    p: ["A slow consumer falls behind past retention and loses events it never read.", "Schema changes break old consumers, and a poison message stalls a partition."],
    v: "Stop a consumer for an hour under load, restart it, and confirm it catches up without loss or reorder per key, and that replaying from an earlier offset rebuilds an identical derived state.",
    dep: ["service-rpc", "replication-and-failover"]
  },
  "job-queue": {
    s: "A reliable queue of background work with retries, delays, priorities and dead-letter handling, used by fan-out, media, notifications and cleanup.",
    d: "Jobs are enqueued with a payload and a priority and picked up by workers who acknowledge on completion. Failures retry with backoff up to a limit, then land in a dead-letter queue for inspection. Visibility timeouts return jobs from crashed workers. It is hard because delivery is at least once, so jobs must be idempotent, and because one slow job type must not starve others.",
    k: ["At-least-once with idempotent jobs vs at-most-once: at-least-once loses nothing and demands idempotency; at-most-once is simple and drops work on failure.", "Separate queues per type vs one shared: separate queues isolate load and multiply configuration; one is simple and shares fate."],
    p: ["A poison job retries forever and consumes a worker.", "A backlog during an outage is processed at once afterward and overloads the stores."],
    v: "Kill workers mid-job and confirm each job completes exactly once in effect. Inject a failing job and confirm it reaches the dead-letter queue after the retry limit and alerts.",
    dep: ["idempotency-and-dedup", "service-rpc"]
  },
  "service-rpc": {
    s: "How services find and call each other: discovery, load balancing, timeouts, retries and circuit breaking over a common request protocol.",
    d: "Callers resolve a service name to healthy instances, balance across them and apply a deadline that shrinks as the request moves down the call chain. Retries are limited and use budgets. Circuit breakers stop calls to failing dependencies. Calls are traced. It is hard because a feed request fans out to dozens of services, so tail latency compounds, and naive retries turn a slowdown into an outage.",
    k: ["Deadline propagation vs per-hop timeouts: propagated deadlines stop wasted work and require every hop to cooperate; per-hop is simple and can sum to more than the user will wait.", "Hedged requests vs single attempts: hedging cuts tail latency and increases load; single attempts are cheap and slow at the tail."],
    p: ["Retries at several layers multiply, and a brief slowdown becomes a traffic storm.", "A dependency without a timeout ties up threads until the caller exhausts them."],
    v: "Make one dependency slow and confirm callers hit their deadline, the circuit opens, error rates stay within the stated bound, and normal traffic resumes after recovery.",
    dep: []
  },
  "idempotency-and-dedup": {
    s: "Makes repeated delivery of a request or event produce one effect, using keys, versions and deduplication windows.",
    d: "Clients attach an idempotency key to writes such as post creation. The server stores the key with its result for a window and returns the stored result on repeats. Consumers of events track processed ids or apply version checks so replays do nothing. It is the foundation that makes retries and at-least-once delivery safe. It is hard because the dedup store is itself a dependency, windows must be long enough to cover real retries, and some effects such as sending a push cannot be undone.",
    k: ["Key-based dedup store vs naturally idempotent operations: a store handles any operation and adds state and a lookup; natural idempotency such as set to value needs no store and fits fewer operations.", "Long dedup window vs short: long covers late retries and holds more state; short is cheap and lets old retries through."],
    p: ["The key is generated per attempt rather than per intent, so every retry is a new request.", "The dedup record is written after the effect, and a crash between them repeats it."],
    v: "Send the same create-post request ten times, concurrently and across a server restart. Exactly one post exists and every call returns the same id.",
    dep: ["post-store"]
  },
  "quotas-and-load-shedding": {
    s: "Protects the system under overload by limiting each client and service, rejecting low-priority work early and keeping the important paths alive.",
    d: "Per-client quotas cap request rates. Under load, servers shed work by priority: background and prefetch before user-visible reads, feed before analytics. Queues are bounded, and adaptive concurrency limits reduce load as latency rises. Degraded modes return cheaper results, such as an unranked feed. It is hard because deciding what to drop is a product choice made in advance, and shedding must start before collapse.",
    k: ["Shed by priority class vs uniformly: priorities protect core actions and require classification of every request; uniform shedding is simple and hurts everything.", "Reject early at the edge vs deep in the stack: early rejection wastes no work and knows little; deep rejection knows load and has already spent resources."],
    p: ["Retrying clients respond to rejections with more requests and sustain the overload.", "Degraded mode is never exercised, and fails when finally triggered."],
    v: "Apply twice the peak load in a test. Core feed reads and posting stay within target latency, low-priority work is rejected first, and the system recovers fully when load returns to normal.",
    dep: ["observability", "service-rpc"]
  },
  "observability": {
    s: "Metrics, logs and traces that show whether feeds are fast, fresh and correct, from a single request up to the whole fleet, with alerts tied to user-facing objectives.",
    d: "Every service emits latency and error metrics, structured logs and spans linked by a request id. Dashboards track feed latency, fan-out lag, cache hit rates, queue depth and freshness canaries. Alerts fire on objectives such as the 99th percentile latency or posts visible within a time, not on raw CPU. It is hard because the key failures are silent: stale feeds, missing posts and wrong counts return success codes.",
    k: ["Alert on user-facing objectives vs on resource metrics: objectives match what hurts and need careful definitions; resource alerts are easy and noisy.", "Trace every request vs sample: full tracing is complete and expensive; sampling is cheap and can miss the rare failure."],
    p: ["Averages hide a slow tail, and users on one shard experience outages that dashboards do not show.", "Alert fatigue leads to ignored pages, and a real incident passes unnoticed."],
    v: "Inject a fan-out delay and a missing-post bug in staging. Alerts fire within the stated time with the failing component identifiable from a trace, and the freshness canary shows the lag.",
    dep: ["service-rpc"]
  },
  "flags-and-rollout": {
    s: "Switches that turn features on for a percentage of users or regions, with gradual rollout, instant rollback and kill switches for expensive or risky paths.",
    d: "Flags are evaluated at request time from a locally cached configuration that updates within seconds. Rollouts widen by stages with metrics gates between them. Kill switches disable ranking, ads or a fan-out path to protect the system. Flags have owners and expiry. It is hard because combinations of flags multiply states nobody tests, and old flags linger as dead code with live branches.",
    k: ["Runtime flags vs deploy-time config: runtime flags change instantly and add evaluation cost and complexity; deploy-time config is simple and slow to reverse.", "Staged percentage rollout vs all at once: staged limits blast radius and takes days; all at once is quick and risky."],
    p: ["A flag configuration service outage is not handled, and services fall back to unsafe defaults.", "Flags are never removed, and a code path nobody remembers is still reachable."],
    v: "Roll a change to 1 percent, then 10 percent, and confirm metrics per cohort. Flip the kill switch and confirm the behavior stops everywhere within seconds without a deploy.",
    dep: ["service-rpc", "observability"]
  },
  "freshness-vs-cost": {
    s: "How soon a new post, edit, count or deletion must appear is a dial between spending compute and storage now and tolerating lag, and different data deserves different settings.",
    d: "Posts to close friends should appear in seconds. Counts can lag tens of seconds. Search can lag a little more. Deletions and privacy changes should be faster than any of them. Each tier of delay has a cost: fan-out writes, cache invalidations, stream windows and index refreshes all get cheaper as targets loosen. Setting explicit freshness objectives per data type keeps teams from defaulting to everything now.",
    k: ["Uniform freshness target vs per data type: uniform is simple and wasteful or harmful somewhere; per type fits cost to value and needs a catalog of objectives.", "Faster removal than addition vs symmetric: faster removal protects privacy and needs a second path; symmetric is simpler and leaves takedowns slow."],
    p: ["No freshness objective is written down, and engineers tune each pipeline until a visible lag appears.", "Freshness of privacy changes is assumed to match feed freshness, and is minutes slower."],
    v: "For each data type, measure time from change to visibility on every surface under load and compare with its written objective, including a deletion and an audience narrowing.",
    dep: ["feed-cache", "index-freshness", "counter-aggregation", "edit-and-delete-propagation"]
  },
  "eventual-consistency": {
    s: "Most state in a feed system converges after a delay rather than agreeing instantly, which is acceptable where users cannot tell and dangerous where they can.",
    d: "Feeds, caches, counters, indexes and replicas all lag the source of truth. Users notice a few violations: not seeing their own post, seeing a deleted post reappear, or a count going backward. Designs add read-your-writes for the author, monotonic reads for a session, and versioned writes so older data never overwrites newer. Everything else is allowed to lag. It is hard because the visible rules must be chosen deliberately, and each store has different guarantees.",
    k: ["Read-your-writes via sticky routing vs always read the leader: sticky routing is cheap and breaks across devices; leader reads are exact and concentrate load.", "Version stamps on derived data vs last write wins: versions reject stale overwrites and need plumbing; last write wins is simple and can resurrect old state."],
    p: ["An author posts, refreshes and the post is missing because the read hit a lagging replica.", "A late event overwrites a newer state, and a deleted post comes back."],
    v: "Post, edit and delete in rapid sequence from one device while reading from another. The author always sees their own writes, no state moves backward, and all copies converge to the final state.",
    dep: ["replication-and-failover", "event-log", "cache-invalidation", "idempotency-and-dedup"]
  },
  "privacy-by-construction": {
    s: "Privacy is easiest to guarantee when the data model, the read path and the defaults make leaks structurally hard, instead of relying on every feature remembering a check.",
    d: "Choices that help: one visibility function used by all surfaces, defaults that are restrictive, filters at read time as the final authority, audience stored with the data and propagated on change, and tests that probe every surface with every viewer type. Data that is copied is registered so deletion and changes can reach it. It is hard because every new feature is a new place to forget, and the cost of a miss is high and silent.",
    k: ["Central enforcement vs trust each service: central is consistent and a dependency on every read; trust is fast and only as good as the weakest team.", "Restrictive defaults vs permissive: restrictive prevents accidents and reduces reach; permissive grows engagement and exposes mistakes."],
    p: ["A launch review checks the main feed and misses the embed, export and notification paths.", "Copies of content in analytics and ML data sets sit outside the privacy system entirely."],
    v: "Run an automated matrix of viewers, audiences, relationship changes and surfaces against the live system on every release, with any disallowed exposure failing the release.",
    dep: ["visibility-model", "read-time-privacy-check", "privacy-aware-fanout", "data-export-and-deletion"]
  },
  "multi-region-design": {
    s: "Running in several regions for latency, capacity and disaster recovery raises where each kind of data lives, how it replicates and what happens when a region is lost.",
    d: "Users are homed in a region that holds their primary data; others replicate asynchronously. Media and caches are served from the nearest. Writes that need global uniqueness, such as handles, use a strong path. Failover shifts users to another region with some data lag. Laws may constrain where data can live. It is hard because cross-region delay is large, conflicts are possible, and a region failure must be practiced rather than assumed.",
    k: ["Home region per user vs fully active everywhere: home region is simple and slows cross-region interaction; active-active is fast everywhere and needs conflict handling.", "Replicate everything vs only what is needed: everything makes recovery easy and costs; selective is cheap and complicates failover."],
    p: ["Failover is never rehearsed, and the first real one finds missing capacity and stale replicas.", "A user traveling is served from the wrong region and sees a feed that lags their own posts."],
    v: "Fail a region in a drill during peak. Traffic moves, the stated fraction of recent writes is retained, feeds remain available within the recovery objectives and failback is clean.",
    dep: ["replication-and-failover", "shard-routing", "media-storage-and-cdn", "event-log"]
  },
  "read-heavy-economics": {
    s: "A feed is read orders of magnitude more often than it is written, so most architecture exists to move cost from reads to writes, caches and precomputation, within a budget.",
    d: "Reads outnumber posts by a hundred times or more. That favors precomputed feeds, aggressive caching, batched hydration and read-optimized stores, and justifies expensive write-time work. But the balance moves with the audience: precomputation wastes effort on inactive users and big accounts. Costs concentrate in media bandwidth, feed storage and ranking compute, and each is worth tracking per active user. It is hard because the cheapest design changes as usage patterns and prices change.",
    k: ["Spend at write time vs at read time: write time makes reads cheap and fast and wastes work on unread content; read time is flexible and expensive per view.", "Rank every request vs cache ranked results: ranking each time is fresh and costly; caching is cheap and stale."],
    p: ["Cost per active user is not measured, and a feature that doubles reads is shipped without anyone noticing the bill.", "Optimizing for the average user leaves the heaviest ten percent responsible for most of the load."],
    v: "Report cost and latency per daily active user broken down by media, feed storage, ranking and caches, and show how a proposed change moves each number before it ships.",
    dep: ["fanout-on-write", "feed-cache", "media-storage-and-cdn", "ranking-model-serving", "inactive-user-handling"]
  }
});
