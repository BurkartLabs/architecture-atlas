// Details for the CDN plate, part 3: cache logic, purge and invalidation, cache storage.
ATLAS.details("cdn", {
  "cache-key-construction": {
    s: "Builds the identifier that decides which requests share a stored response, from hostname, path, selected query parameters, headers, cookies and device class, as the customer configures.",
    d: "The key is a string or hash assembled from request parts after normalization. By default it includes scheme, host and path with the query string, and customers add or remove parts: ignore tracking parameters, include a language cookie, split by device class. Everything left out must not change the response, and everything that does must be in. The key is also what purges and sharding use. It is hard because mistakes are silent: a missing part serves one user's content to another, and an extra part destroys the hit ratio.",
    k: ["Including the full query string vs. an allowlist of parameters: the full string is always correct, but random tracking parameters make every URL unique, while an allowlist raises hits and needs maintenance.", "Short hashed keys vs. readable keys: hashes are compact and fast to compare, but make debugging and tag-based purges harder without a side index."],
    p: ["A personalized response cached under a key that omits the cookie shows one user's data to another.", "Changing the key format on a release invalidates the entire cache and sends a flood to origins."],
    v: "Request the same resource with irrelevant parameters, reordered parameters and varying cookies, and confirm the expected set of requests share a key and hit the same entry, while requests that differ in an included part do not.",
    dep: ["key-normalization","vary-handling"]
  },
  "key-normalization": {
    s: "Rewrites equivalent URLs to one canonical form before keying, such as lowercasing the host, sorting query parameters and resolving encodings, so trivial differences do not create separate cache entries.",
    d: "The edge lowercases the hostname, decodes unreserved percent-encodings, collapses duplicate slashes and dot segments, sorts query parameters and drops those the customer marked irrelevant. The normalized form feeds the key and often the origin request, though some origins treat variants differently, so customers can choose which to forward. It is hard because normalization must match origin semantics: treating two URLs as equal that the origin treats as different serves wrong content, and the reverse costs hits.",
    k: ["Aggressive normalization vs. conservative: aggressive merging raises hit ratio, but breaks origins that treat case or slashes as significant.", "Normalizing the key only vs. also rewriting the origin request: key-only preserves what the origin sees, but caches a response fetched under a different form than the key suggests."],
    p: ["Case-folding paths on a case-sensitive origin returns the wrong file for some requests.", "Sorting parameters changes order-dependent origin behavior, so a cached response differs from a direct one."],
    v: "Send ten URL spellings of one resource, confirm they map to one key and one stored object, and then send two spellings that the origin treats differently and confirm they remain separate entries.",
    dep: ["request-parsing-and-normalization"]
  },
  "vary-handling": {
    s: "Stores multiple variants of one resource when the origin says the response depends on certain request headers, and picks the matching variant on lookup.",
    d: "An origin response listing request headers as varying tells the cache to record those header values alongside the stored copy. A later request matches only if its values are equal. Caches therefore keep a list of variants under one primary key. Because raw headers have enormous variety, edges commonly normalize values into a few classes or ignore headers the customer says are safe. It is hard because the variant list can grow without bound, and varying on headers like cookies or user agent defeats caching.",
    k: ["Honoring origin vary headers exactly vs. overriding them: honoring is correct by the protocol, while overrides rescue hit ratio at the risk of serving the wrong variant.", "Capping variants per object vs. unlimited: a cap protects memory from attackers sending random header values, but evicts legitimate variants and lowers hits."],
    p: ["An origin that varies on the cookie header makes every logged-in user a separate variant and pins hits at zero.", "Ignoring a vary header the origin actually depends on serves the wrong language or format."],
    v: "Fetch an object with three distinct accept-language values, confirm three variants are stored, a fourth request matching one variant is a hit and the variant count never exceeds the configured cap.",
    dep: ["cache-key-construction","content-negotiation"]
  },
  "cacheability-decision": {
    s: "Decides, from response status, headers and customer rules, whether a response may be stored at all, and for which kinds of requests it may be reused.",
    d: "The edge examines the method, status code, cache directives, presence of cookies or authorization, response size and content type, then applies customer overrides. Successful responses to safe requests are typically stored, errors only when configured, and responses marked private or no-store are not. Negative results such as not found may be stored for short periods to protect origins. It is hard because defaults must be safe for private data while still caching enough to be worthwhile, and origins send contradictory headers.",
    k: ["Conservative defaults vs. caching by file extension: conservative defaults prevent leaks, but leave static assets uncached unless customers learn the rules, while extension rules help quickly and risk caching dynamic output.", "Caching error responses briefly vs. never: brief caching shields struggling origins, but preserves a transient failure for users after recovery."],
    p: ["A response with a session cookie is stored and handed to other users because the customer forced caching of the path.", "A temporary error from the origin is cached for minutes and keeps a healthy page down."],
    v: "Request responses with varied headers: public, private, no-store, set-cookie, and a not-found status. Confirm each is stored or bypassed per the documented table, and confirm a forced-cache rule does not store a response with set-cookie unless configured.",
    dep: ["cache-control-semantics","ttl-overrides"]
  },
  "cache-control-semantics": {
    s: "Interprets the standard freshness and validation directives sent by origins, including max-age, shared-cache age, no-cache, no-store, private and immutable, plus their interactions.",
    d: "A shared cache follows the directives meant for it: a shared max-age overrides the general one, no-cache requires revalidation before reuse, and immutable tells it a validator check is pointless. Age already spent in upstream caches is subtracted from remaining freshness. When directives are absent, heuristics based on the last-modified time estimate freshness. It is hard because the rules are intricate, origins and intermediaries disagree, and subtle errors, like ignoring age, cause content to live twice as long as intended.",
    k: ["Strict protocol compliance vs. practical overrides: compliance behaves as origins expect, while overrides let customers extend lifetimes against bad headers, at the risk of surprising stale content.", "Heuristic freshness when headers are absent vs. treating as uncacheable: heuristics lift hit ratios for sloppy origins, but guess wrong for content that changes without warning."],
    p: ["A cache ignores the age header and a response passes through two tiers, living the full lifetime at each.", "Origins send both a long and a short lifetime header and the wrong one wins in one tier."],
    v: "Serve test objects with each directive combination and an age header, and confirm the time before first revalidation matches the standard's computed remaining freshness, including the effect of upstream age.",
    dep: ["cacheability-decision"]
  },
  "ttl-overrides": {
    s: "Customer rules that set, extend or cap how long objects stay fresh regardless of origin headers, including different lifetimes for edge caches and for browsers.",
    d: "Overrides apply by path, content type or status and can force an edge lifetime, replace or strip headers sent to browsers, or ignore the origin entirely. They commonly keep browsers on short lifetimes while the edge holds objects for days, relying on purge to refresh. Overrides run in a defined phase relative to other rules. It is hard because a long forced lifetime turns every origin mistake into a prolonged incident, and customers forget which rules override which headers.",
    k: ["Long edge lifetimes with explicit purge vs. short lifetimes with revalidation: long lifetimes maximize hits and offload, but make freshness depend on purge, while short lifetimes are self-healing and send more traffic to the origin.", "Separate edge and browser lifetimes vs. one: separate values give control, but surprise teams who assume browsers see the same freshness."],
    p: ["A forced one-year lifetime on an unversioned file leaves users on old code for months because browsers kept it too.", "An override intended for one path matches a wider pattern and caches dynamic content."],
    v: "Set a one-hour edge override on an object whose origin says no-cache, confirm repeated requests hit the cache for an hour with a browser header of five minutes, then purge and confirm a fresh fetch.",
    dep: ["cache-control-semantics","rule-engine"]
  },
  "stale-while-revalidate": {
    s: "Serves an expired object immediately while fetching a fresh copy in the background, so users do not wait for the origin and only one revalidation runs.",
    d: "When an object passes its freshness lifetime but is within a configured stale window, the edge responds from the stored copy and starts a single background fetch. Later requests keep getting the old copy until the update lands. The window is set by the origin or by customer rules. It removes revalidation latency from the user's path and smooths load on the origin. It is hard because users may see old content up to the window length, background fetches can fail silently, and each site refreshes independently.",
    k: ["Long stale window vs. short: a long window hides origin slowness, but lets outdated content circulate longer.", "Background refresh by the first request vs. a scheduled refresher: request-triggered refresh needs no extra machinery, while scheduled refresh keeps popular objects warm but wastes fetches on idle ones."],
    p: ["Background fetches fail repeatedly and the object stays stale beyond the window without anyone noticing.", "Content serving price or stock information stays out of date for the whole window at every site."],
    v: "Let an object expire inside its stale window, send ten concurrent requests, and confirm all are served immediately from the old copy, the origin sees exactly one request and the next request gets the new content.",
    dep: ["conditional-revalidation","request-collapsing"]
  },
  "stale-if-error": {
    s: "Serves an expired object when the origin fails or times out, keeping a site up for a bounded time after the origin goes down.",
    d: "If revalidation or a refetch returns a server error, a timeout or a connection failure, and the stored copy is within the permitted stale-on-error window, the edge returns the old response, often with a header marking it stale. Customers choose which failures count. After the window the error is passed through. It turns short origin outages into non-events for cached content. It is hard because it hides real outages from customers, the window must outlast typical incident length, and uncacheable content gets no benefit.",
    k: ["Serving stale on any origin error vs. only on connection failure: broad coverage protects more outages, but masks genuine application errors that users should see.", "A long window vs. a short one: a long window rides through multi-hour incidents, but hands out increasingly outdated content."],
    p: ["Customers do not notice the origin has been down for hours because the edge keeps answering.", "Objects that expire before the first outage have nothing stored to fall back on."],
    v: "Warm a set of objects, make the test origin refuse connections, and confirm requests inside the window return the old content with a stale marker and requests after the window return the configured error.",
    dep: ["origin-failover","conditional-revalidation"]
  },
  "conditional-revalidation": {
    s: "Asks the origin whether a stored object has changed, using validators such as an entity tag or modified time, and reuses the stored body if it has not.",
    d: "When an object expires, the edge sends the stored validator in a conditional request. A not-modified reply, a few hundred bytes, lets the edge extend the object's life without transferring the body. A full response replaces it. Revalidation is also how no-cache objects are served. It is hard because origins generate weak or unstable validators, such as per-server tags that differ behind a load balancer, causing needless full transfers, and revalidation still costs a round trip.",
    k: ["Revalidating on expiry vs. refetching: revalidation saves bandwidth for large unchanged objects, while refetching is simpler and avoids reliance on correct validators.", "Trusting weak validators vs. requiring strong: weak validators allow reuse for equivalent content, but are unsafe for range requests that need byte-exact matches."],
    p: ["Entity tags that differ between origin servers turn every revalidation into a full download.", "A validator derived from modified time ignores same-second edits and keeps serving the earlier version."],
    v: "Expire an object, confirm the next request sends a conditional header, and observe a not-modified reply with no body transferred upstream, and the freshness lifetime restarted on the stored copy.",
    dep: ["cache-control-semantics","origin-connection-pooling"]
  },
  "request-collapsing": {
    s: "When many clients ask for the same missing object at once, sends a single request to the origin and makes the others wait for its result, preventing a stampede.",
    d: "On a miss, the cache server marks the key as in flight and queues later requests for it. When the response arrives, headers are checked, and if it is cacheable all waiters are served from it, streaming while it downloads. If the response turns out uncacheable, waiters must be released to fetch individually, or they would serialize behind one slow origin. Collapsing works per server, per site and across tiers. It is hard because timeouts, uncacheable responses and very large objects change the safe behavior.",
    k: ["Collapsing all waiters vs. a small concurrency limit: full collapsing gives the origin one request, while a limit avoids long queues if the first request is slow.", "Serializing for uncacheable objects vs. releasing waiters immediately: releasing avoids head-of-line stalls, but then every waiter goes to the origin."],
    p: ["A first request that hangs makes every waiter hang until the full timeout, turning one slow fetch into mass failure.", "Responses to personalized requests are shared with all waiters because the response was wrongly considered cacheable."],
    v: "Send one thousand concurrent requests for an uncached, slow object and confirm the origin receives one request, all clients get the response and first-byte times show waiters served as data streams in.",
    dep: ["cache-key-construction","origin-connection-pooling"]
  },
  "purge-by-url": {
    s: "Removes or invalidates a single exact object, identified by its full URL or cache key, from every cache server in the network.",
    d: "The customer submits a URL through the API or portal. The system normalizes it, derives the keys it covers, including variants, and sends a purge message to all sites. Each server marks matching entries expired or deletes them, and the next request refetches. Because the key may include headers or device classes, a URL can map to several entries. It is hard because correctness depends on matching the exact key construction, and because completion must be known worldwide even when some sites are unreachable.",
    k: ["Deleting entries vs. marking them expired: deleting frees space immediately, while marking lets stale-serving and revalidation still work.", "Purging all variants of a URL vs. only the exact key: all variants avoids leaving a stale copy for one device class, but removes more than intended."],
    p: ["The URL typed by the customer normalizes differently from the cached key and nothing is purged.", "Purging one URL leaves a copy cached under a cookie or device variant that users keep receiving."],
    v: "Cache an object in several sites with two variants, purge its URL, then request it from each site and confirm a miss with the new content in all variants within the stated propagation time.",
    dep: ["cache-key-construction","purge-propagation"]
  },
  "purge-by-tag": {
    s: "Invalidates every cached object the origin labeled with a given tag, so one publishing event can clear many related pages without listing their URLs.",
    d: "The origin adds tag values to responses in a header, such as an article identifier or product category. The cache server records the tags with each stored object in an index. A purge by tag looks up all objects carrying it and expires them. Tags let a content system invalidate pages that embed an updated item, with no knowledge of where it appears. It is hard because the index costs memory and writes on every insert, tag sets can be huge, and the purge must find entries on disk quickly.",
    k: ["Tag index in memory vs. on disk: memory is fast but expensive per object, while disk scales and makes purges slower and heavier on storage.", "Purging by tag immediately vs. lazily on next access: immediate scanning frees space but can stall a server, while lazy checking marks the tag expired and tests it on lookup."],
    p: ["An overly broad tag attached to every page lets one purge empty the entire cache and trigger an origin flood.", "Tags set on cached objects after a purge arrives are missed because the index is updated late."],
    v: "Store fifty objects sharing a tag, purge by that tag and confirm all fifty miss at every site, while objects without the tag remain hits, and check the purge completes within the stated time.",
    dep: ["purge-propagation","cache-index"]
  },
  "purge-by-prefix": {
    s: "Invalidates every object under a path prefix or matching a pattern, for cases like a whole directory or a site section when individual URLs are unknown.",
    d: "A prefix purge cannot enumerate keys centrally because the cache holds billions. Servers either scan their indexes for matching keys, which is costly, or record the purge as a rule with a timestamp, and treat any object stored before that time and matching the prefix as expired on lookup. Rule-based purges are cheap to apply and are cleaned up as entries age. It is hard because patterns multiply lookup cost, and rules accumulate unless their lifetime is bounded.",
    k: ["Timestamped invalidation rules vs. scanning and deleting: rules apply instantly and cost nothing up front, but add a check to every lookup until they expire.", "Allowing arbitrary patterns vs. only prefixes: patterns are flexible, while prefixes can be organized in a trie and evaluated in constant time."],
    p: ["Thousands of live prefix rules slow every lookup because each must be checked.", "A rule matches by pattern but objects stored later with older timestamps from upper tiers still look stale or fresh incorrectly."],
    v: "Cache a directory of one hundred objects, purge its prefix, then confirm every object misses at every site, an object just outside the prefix still hits, and lookup latency stays flat as rules expire.",
    dep: ["purge-propagation","key-normalization"]
  },
  "purge-propagation": {
    s: "Delivers purge messages to every cache server worldwide quickly and reliably, including servers that are down or partitioned when the purge is sent.",
    d: "Purges flow from the API through a fan-out tree to regional relays and then to each site's servers, in seconds. Each message has an identifier and sequence number, so a server that was away can ask for the ones it missed. Persisted logs let new or restarted servers replay purges newer than their cache contents. Acknowledgments show progress. It is hard because the target is a global cache of billions of items in seconds, with at-least-once delivery and no stale content ever served after acknowledgment.",
    k: ["Push fan-out vs. polling a log: push propagates in about a second, while polling is robust to disconnections and restarts but slower, so systems often combine both.", "Acknowledging when queued vs. when applied: early acknowledgment is fast to report but lies about completion, while applied acknowledgment is accurate and slower."],
    p: ["A server restores a disk cache after a restart and serves objects purged while it was down.", "A relay fails and a whole region silently misses purges because acknowledgments were counted at the relay."],
    v: "Issue a purge and record per-server application times, then confirm the slowest server applies it within the target, and kill and restart a server mid-purge and confirm it replays the missed purge before serving.",
    dep: ["purge-ledger-and-ordering","global-state-propagation"]
  },
  "soft-purge": {
    s: "Marks objects stale instead of removing them, so they can still be served briefly while a fresh copy is fetched or if the origin fails.",
    d: "A soft purge sets the object's freshness to expired but keeps the body and validators. The next request triggers revalidation or a background refresh, and stale-while-revalidate and stale-if-error rules still apply. This avoids the cliff of a hard purge, where every site refetches everything at once. Customers choose soft purges for large sets such as an entire site refresh. It is hard because a stale object may be served for a window the customer did not expect, and the behavior depends on other settings.",
    k: ["Soft purge vs. hard purge: soft keeps latency low and shields the origin during mass refreshes, but briefly allows outdated content, while hard is exact and risks an origin stampede.", "Default to soft for large purges vs. always hard: soft by default is safer for origins, but surprises customers expecting immediate removal."],
    p: ["A customer purges sensitive or wrong content softly and it stays visible to users during revalidation.", "A soft-purged object whose origin is down keeps being served indefinitely under stale-if-error."],
    v: "Soft purge an object and confirm the next request is served immediately from the stored copy with a stale marker while exactly one revalidation occurs, then confirm the following request returns the new content.",
    dep: ["stale-while-revalidate","purge-propagation"]
  },
  "purge-ledger-and-ordering": {
    s: "The durable, ordered record of every purge, so that servers apply them in the same order, replay missed ones and never let an old purge erase newer content.",
    d: "Each purge is appended to a log with a timestamp or sequence number and stored redundantly. Servers record the highest sequence applied. An object carries the time it was fetched, and a purge only affects objects fetched before it. This rule prevents a delayed purge from removing content refilled after the change. The log is truncated after a retention period longer than the longest realistic outage. It is hard because clocks differ between machines, and because ordering between purges and in-flight fills must be defined.",
    k: ["Comparing object fetch time with purge time vs. tracking sequence numbers only: time comparison handles in-flight fills correctly, but depends on synchronized clocks.", "Long log retention vs. short: long retention lets sites recover from lengthy outages by replay, while short retention is cheaper and forces a full flush for long-disconnected servers."],
    p: ["A fill that began before the purge completes after it and stores the old content as new.", "A site offline longer than the log retention returns with unknown missed purges and must flush everything."],
    v: "Start a slow origin fetch, issue a purge while it is in flight, and confirm the arriving response is treated as older than the purge and is not served as fresh content after the purge.",
    dep: ["purge-propagation"]
  },
  "purge-verification": {
    s: "Checks that a purge actually took effect everywhere, through acknowledgments, probes against sites and sampled fetches, and reports completion or lingering stragglers.",
    d: "The system collects acknowledgments per server and reports the fraction that has applied a purge. For stronger assurance, probe requests fetch the purged object from many sites and compare the content version with the expected one. Customers get a status in the API and portal, and operators get alerts on servers that lag. Verification also catches key-construction errors where a purge reports success but matched nothing. It is hard because completion means every server including unreachable ones.",
    k: ["Trusting acknowledgments vs. probing content: acknowledgments are cheap and scalable, but cannot detect a purge that matched no entries, while probes are definitive and costly.", "Reporting completion at a percentage vs. at all servers: a percentage is reached quickly and misleads, while all-servers is truthful but is held up by one lagging machine."],
    p: ["A purge reports complete while a server in an isolated site never received it, and users there see old content for a day.", "Probes hit the same server repeatedly and verify one machine instead of the site."],
    v: "After a purge, run probes through one hundred distinct sites and confirm each returns the new version, then compare the reported completion percentage with the probe results and confirm they agree.",
    dep: ["purge-propagation","synthetic-probing"]
  },
  "memory-tier": {
    s: "The fastest cache layer, holding the hottest objects and metadata in RAM, so most requests are served without touching disk.",
    d: "Objects are stored in memory in a slab-like or log-structured arrangement, with metadata such as keys, freshness and tags in compact structures. A small share of objects receives most requests, so a memory tier of a few percent of the total capacity absorbs a large share of hits. Entries are promoted from disk on access and written back on eviction. It is hard because memory is expensive and fragmentation wastes it, large objects crowd out many small ones, and garbage handling or allocation pauses show up as tail latency.",
    k: ["Caching whole objects vs. only the first chunks: whole objects serve simply, while chunk-level caching holds the starts of many large files, lowering time to first byte for each.", "Fixed-size slabs vs. a general allocator: slabs avoid fragmentation and are fast, but waste space for sizes between classes."],
    p: ["A single very large object fills a significant share of memory and evicts thousands of small hot objects.", "Memory fragmentation reduces usable capacity by a quarter after weeks of uptime."],
    v: "Drive a skewed request distribution at a server and confirm memory serves the expected share of hits, the resident set stays under its limit over a week, and tail latency has no allocation-related spikes.",
    dep: ["eviction-policy","cache-index"]
  },
  "disk-tier": {
    s: "The large, slower layer of the cache on flash or rotating disks, designed for high throughput of reads and for a write pattern that does not wear devices out.",
    d: "Objects are stored in large pre-allocated files or raw devices, laid out in logs or fixed-size blocks to turn small writes into sequential ones, with the index in memory pointing to offsets. Flash is favored for random reads, rotating disks for cheap capacity. Each server may hold dozens of drives, with objects assigned to drives by key hash. It is hard because write amplification wears flash, device latency varies widely, and one slow drive can delay every request routed to it.",
    k: ["Log-structured writes vs. in-place updates: logs minimize wear and give consistent write speed, but need compaction and delay reuse of space.", "Striping across drives vs. assigning each key to one drive: striping spreads load but a single failure harms everything, while per-drive placement isolates failures and limits hot-drive spreading."],
    p: ["Heavy write churn on flash exhausts its endurance in months rather than years.", "One drive with growing latency drags down every request routed to it and no health check notices."],
    v: "Run a representative mix of fills and reads for a day, then confirm read latency percentiles stay within budget, drive wear counters rise slower than the endurance plan, and no drive has a latency outlier.",
    dep: ["cache-index","admission-policy"]
  },
  "cache-index": {
    s: "The in-memory map from cache key to an object's location, size, freshness and tags, which every lookup, purge and eviction consults.",
    d: "A compact hash table, often sharded to avoid lock contention, stores a fixed-size entry per object with a key hash, location, metadata and access information. With billions of objects per site, bytes per entry matter greatly, and index memory limits the number of objects a server can hold. Rebuilding the index after a restart means scanning disks or reading a persisted snapshot. It is hard because the index must be fast under high concurrency, small, and recoverable without long outages.",
    k: ["Storing only a hash of the key vs. the full key: hashes shrink entries a lot, but need a verification read to rule out collisions.", "Persisting the index vs. rebuilding on start: persistence restarts quickly with a warm cache, but risks mismatch with disk contents after a crash."],
    p: ["A hash collision serves one customer's object for another's key when the full key is never verified.", "A slow index rebuild keeps a restarted server out of rotation for an hour and shifts load to neighbors."],
    v: "Fill a server to capacity, restart it and measure time to warm index and first hit, then confirm every stored object verifies against its full key and no lookups return a mismatched object.",
    dep: ["memory-tier"]
  },
  "eviction-policy": {
    s: "Chooses which stored objects to remove when space runs out, using recency, frequency and size, to keep as many future requests as possible served from cache.",
    d: "Simple recency lists work, but one-time scans can flush valuable objects, so policies add frequency tracking or segmented queues and consider size, since keeping many small popular objects beats one large one. Eviction runs per tier, memory demoting to disk and disk deleting. Customers do not control it directly, though cache-control hints inform it. It is hard because real request streams mix scans and popular content, and the metadata needed to track access must be cheap.",
    k: ["Recency-based vs. frequency-aware policies: recency is simple and adapts quickly, while frequency awareness resists scans and holds the stable popular set, at the cost of tracking state and slower adaptation.", "Evicting by object count vs. weighing size: size-aware choices raise the request hit ratio, but lower the byte hit ratio that drives bandwidth cost."],
    p: ["A crawler reading the whole site once evicts the popular working set under a plain recency policy.", "Tuning for request hit ratio silently raises origin bandwidth because large objects are discarded."],
    v: "Replay a recorded production trace through the policy in a simulator and on a test server, and compare request and byte hit ratios against the baseline, confirming a scan of ten million one-time objects does not reduce the popular set's hits.",
    dep: ["cache-index","memory-tier","disk-tier"]
  },
  "admission-policy": {
    s: "Decides whether a newly fetched object is worth storing at all, so objects that will probably never be requested again do not displace useful ones or wear out flash.",
    d: "On a first fetch the policy checks the object's size, a counting filter that tracks whether it was seen before, and customer settings. A common rule admits an object only on its second request within a window, since most one-hit objects never return. Large objects can bypass memory and go straight to disk or not be stored. It is hard because skipping the first request costs a miss for every genuinely popular object, and the filter itself consumes memory.",
    k: ["Admit on second request vs. admit on first: second-request admission keeps one-hit wonders out and protects flash, but costs one extra origin fetch for every popular object.", "Size limits on admission vs. none: limits protect the cache from huge objects, but make large files miss at every request."],
    p: ["Aggressive admission rules keep a newly released popular file out of the cache and hammer the origin.", "The counting filter saturates after a traffic shift and admits or rejects almost everything."],
    v: "Request ten thousand distinct one-time objects and confirm few are stored and disk write volume stays low, then request a set twice and confirm the second pass admits them and the third pass is all hits.",
    dep: ["cache-index","eviction-policy"]
  },
  "hot-object-handling": {
    s: "Special treatment for objects that suddenly receive enormous traffic, so a single popular object does not overload the one server or drive that holds it.",
    d: "Consistent hashing sends all requests for a key to one server, which is efficient until a single object is requested hundreds of thousands of times a second. Detectors count per-key rates and replicate hot objects to more servers in the site, or promote them to memory on every server, so any server can answer. Load balancers can also spread a hot key's requests across a small set. It is hard because detection must be fast, replication must be reversed when traffic fades, and purges must reach every replica.",
    k: ["Replicating hot objects widely vs. keeping one owner: replication spreads load and survives a server loss, but stores duplicates and complicates purges.", "Detecting on request rate in the load balancer vs. in the cache server: balancer-level detection acts before overload, while server-level detection is more accurate but reacts later."],
    p: ["A viral object saturates one server's network port while its neighbors idle, and the hash makes it impossible to shed.", "Replicas are not purged along with the owner and serve old content after a purge."],
    v: "Direct two hundred thousand requests per second at one object in a lab site and confirm the load spreads across servers, no server exceeds its limit, and a purge removes every replica.",
    dep: ["consistent-hashing-to-cache","memory-tier"]
  },
  "range-request-handling": {
    s: "Serves requests for part of an object, such as byte ranges for video seeking and resumed downloads, from stored data, and fetches only missing parts from upstream.",
    d: "A client asks for a byte range. If the object is cached, the server reads and returns exactly that slice with the correct partial-content status. If it is not, the edge either fetches the whole object in the background while serving the range, or fetches just that range and stores it as a chunk. Multi-range requests, open-ended ranges and validators that must match are handled according to the standard. It is hard because partial storage needs a map of which byte spans are present, and edge cases confuse clients.",
    k: ["Fetching the whole object on a range miss vs. fetching only the range: whole-object fetch makes later ranges hits, but wastes bandwidth if the client wants a small slice.", "Storing sparse chunks vs. requiring complete objects: sparse storage serves huge files efficiently, but needs presence tracking and careful validator checks."],
    p: ["A range response assembled from chunks of two different versions of the object yields a corrupt file.", "Many distinct small ranges of one large uncached file each trigger a separate origin fetch."],
    v: "Request ranges from the start, middle and end of a cold large file and confirm each returns the exact bytes by checksum with the right partial-content headers, and that the origin transfer matches the chosen strategy.",
    dep: ["large-file-chunking","conditional-revalidation"]
  },
  "large-file-chunking": {
    s: "Stores and serves very large files, such as software downloads and video, as fixed-size chunks that are cached, evicted and fetched independently.",
    d: "A multi-gigabyte file is split into chunks of a few megabytes, each stored under its own sub-key with a shared manifest of the object's validator and size. Requests are mapped to chunks, which stream to the client while later chunks are read ahead or fetched upstream. Chunking lets a partly downloaded object serve early requests, allows evicting cold parts, and spreads one object across drives. It is hard because the chunks of one object must stay consistent, eviction must not leave unusable fragments, and chunk fetches multiply origin requests.",
    k: ["Large chunks vs. small chunks: large chunks mean fewer fetches and less metadata, while small chunks give finer eviction and less waste for partial reads.", "Streaming to the client while filling vs. completing the fill first: streaming lowers first-byte latency, but ties the fill to a client that may disconnect."],
    p: ["A client disconnect aborts the fill, and each retry restarts, leaving the object perpetually partial.", "Evicting middle chunks leaves an object that every request half-serves and half-fetches."],
    v: "Download a ten-gigabyte file from a cold site by many clients and confirm the origin sends it once, the result matches the checksum, and killing one client's connection does not interrupt the others.",
    dep: ["disk-tier","cache-index","request-collapsing"]
  },
  "storage-integrity-and-failure": {
    s: "Detects corrupt objects and failed devices through checksums and health signals, and recovers by treating affected content as misses and removing broken drives from service.",
    d: "Each object or chunk carries a checksum verified on read, or at least on fill and periodically, and a bad result is treated as a miss and refetched. Device error counters and latency trigger a drive being taken out, after which its keys are remapped and refetched on demand. Because the data is reproducible from the origin, recovery is simple relative to databases. It is hard because silent corruption is rare and costly, and a remapped dead drive shifts load onto the origin and to the remaining drives.",
    k: ["Verifying checksums on every read vs. sampling: every read catches corruption at once, while sampling saves CPU and lets some corrupt reads reach users.", "Replacing a failed drive in place vs. remapping its keys: remapping keeps serving but changes placement and hit ratio, while in-place replacement is simple and begins cold."],
    p: ["A drive returns wrong bytes with no error and corrupt objects are served until a user complains.", "Several drives fail in a window and the resulting miss storm overloads the origin."],
    v: "Flip bits in stored objects on a test server and confirm reads detect the mismatch, serve a fresh copy and log a corruption event, then pull a drive and confirm the server keeps serving with a bounded hit-ratio drop.",
    dep: ["disk-tier","cache-index"]
  },
});
