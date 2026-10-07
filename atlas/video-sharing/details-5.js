// Details for the video sharing plate, part 5: delivery, storage, analytics, platform.
ATLAS.details("video-sharing", {
  "edge-caches": {
    s: "Servers near viewers that keep recently and frequently requested segments in memory and on disk, so most playback traffic never reaches the origin.",
    d: "An edge server receives an HTTP request for a segment, looks it up in a memory tier then a disk tier, and serves it; a miss goes to a parent cache or the shield. Eviction policies favor objects with high request counts but must resist one-off large scans. The long tail of rarely watched videos has low hit rates, so cache efficiency depends on popularity skew. Hard because the catalog is far larger than any cache, popularity changes fast, and a single server cannot hold both hot content and the long tail.",
    k: ["Frequency-aware eviction versus plain recency: frequency-aware keeps genuinely popular segments through scans; recency adapts faster to sudden trends.", "Disk versus memory for the hot set: memory serves fastest and handles surges; disk holds far more and is cheaper, with seek and wear limits."],
    p: ["A flood of requests for one viral video overloads the few servers that hold it unless it is replicated within the site.", "A long tail scan evicts hot content and the hit ratio collapses for hours."],
    v: "Replay a production request log against a test cache. Hit ratio and origin offload meet the targets, a synthetic scan does not evict the hot set, and a viral object is served from several servers.",
    dep: ["origin-shield", "cache-fill-and-prefetch", "request-routing"]
  },
  "origin-shield": {
    s: "An intermediate cache tier in front of storage that merges misses from many edge locations into one request, protecting the origin and raising overall hit ratio.",
    d: "Edge caches send misses to a small number of shield sites rather than directly to the origin. The shield coalesces simultaneous requests for the same object into one fetch and caches the result. It also holds longer-tail content than the edges can afford to. The origin sees a fraction of the traffic. Hard because the shield becomes a concentration of load and a failure domain, adds a hop on a miss, and must be sized for the worst case where many edges cold-start at once.",
    k: ["One shield region per origin versus several: one maximizes hit ratio; several reduce latency and failure impact but fragment the cache.", "Request coalescing versus independent fetches: coalescing protects the origin from stampedes; waiting requests share the latency of a slow first fetch."],
    p: ["A shield outage sends all edge misses to the origin at once and overloads storage.", "Coalescing holds hundreds of requests behind one hung fetch with no timeout."],
    v: "Fail a shield site and cold-start many edges for one popular video. The origin request rate stays under its limit, duplicate fetches are coalesced, and playback continues with a bounded startup delay.",
    dep: ["object-store", "edge-caches"]
  },
  "request-routing": {
    s: "Directs each viewer's request to a suitable cache site using DNS answers, anycast addresses or redirects, based on location, health and current load.",
    d: "When a player resolves a delivery hostname, the routing system answers with addresses of nearby healthy sites, or the network routes an anycast address to the closest. Playback can also redirect between sites after a failure. Decisions use latency measurements, network topology and capacity data refreshed every few seconds. Hard because DNS answers are cached by resolvers beyond the platform's control, location from resolver addresses is approximate, and a bad routing change affects every viewer at once.",
    k: ["DNS-based routing versus anycast: DNS can account for load and policy per answer; anycast fails over fast and needs no client cooperation but steers poorly under congestion.", "Mapping by measured latency versus by geography: measurement tracks real network paths; geography is stable and easy to reason about but can send viewers across slow links."],
    p: ["Long DNS caching keeps viewers pinned to a failed site long after the change.", "A routing configuration error sends a whole region to a distant, overloaded site."],
    v: "Resolve the delivery hostname from many vantage points, then fail a site. Answers point to the nearest healthy site, and failed-site traffic moves to alternates within the failover target.",
    dep: ["capacity-aware-steering", "edge-caches", "observability"]
  },
  "capacity-aware-steering": {
    s: "Adjusts routing so that load follows available capacity and cost, shifting traffic away from congested or expensive links and sites while keeping latency acceptable.",
    d: "A controller gathers per-site and per-link utilization, cache health and transit prices, and computes how much of each region's demand each site should serve. Weights are pushed to the routing layer every minute. It can shed less important traffic, such as background prefetch, before it sheds playback. Hard because demand spikes faster than controller cycles, nearby sites have different costs, and oscillation occurs when many viewers shift between two sites in response to each other.",
    k: ["Cost-optimized steering versus latency-optimized: cost steering lowers bills by using cheap sites; latency steering gives the best startup but spends more on expensive links.", "Fast control loop versus smoothed: fast reacts to congestion; smoothing avoids oscillation but is slow to protect a site that is already overloaded."],
    p: ["Two sites each shed traffic to the other and load flips back and forth every cycle.", "A stale capacity figure sends traffic to a site that lost a rack."],
    v: "Simulate a surge and a link failure. Utilization on every link stays below its cap, steering weights converge without oscillation, and median startup time moves by less than the stated amount.",
    dep: ["request-routing", "capacity-planning", "observability"]
  },
  "cache-fill-and-prefetch": {
    s: "Rules for how and when caches fetch content: on first request, ahead of expected demand, or proactively for new uploads from large channels.",
    d: "Reactive fill fetches a segment when first requested; prefetch fetches the next segments of a playing video and pushes new popular uploads to caches before the audience arrives. Predictions come from subscriber counts, trending signals and scheduled live events. Fill traffic is deprioritized against viewer traffic on constrained links, and done at off-peak hours where possible. Hard because wrong predictions waste bandwidth and cache space, while missing a predicted spike makes the origin the bottleneck.",
    k: ["Aggressive prefetch versus reactive only: prefetch hides miss latency and protects the origin; it spends bandwidth on bytes nobody watches.", "Scheduled off-peak fill versus on-demand: off-peak fill is cheap; it cannot serve content that is needed immediately."],
    p: ["Prefetching the rest of every video wastes bandwidth when most viewers leave after a few seconds.", "A scheduled launch is not pre-positioned and thousands of edges all miss at once."],
    v: "Publish a test video from a channel with many subscribers and measure first-hour hit ratio and origin load. Prefetched segments are present at the edges before the audience arrives, and wasted prefetch bytes stay under a limit.",
    dep: ["edge-caches", "origin-shield", "subscription-graph"]
  },
  "signed-url-authorization": {
    s: "Issues short-lived, signed addresses for segments and manifests that prove a viewer is allowed to watch a given video, so caches can enforce access without calling back to the platform.",
    d: "On a play request the application checks permissions, then returns a manifest address that includes an expiry, scope and a signature computed with a secret shared with the edge. Edges verify the signature locally on every request. Scope may include path, region, device and entitlement. Keys rotate regularly. Hard because tokens must be cacheable-friendly without leaking in logs, long videos outlive short expiries, and a leaked link works until it expires.",
    k: ["Short expiry with renewal versus long expiry: short limits link sharing; renewal adds complexity and a failure point during long playback.", "Token in the URL path versus a query string or cookie: path-based tokens work with simple caching; they leak into logs and referrers, while cookies need domain handling."],
    p: ["The token is part of the cache key, so every viewer fetches a separate copy and the hit rate collapses.", "Key rotation invalidates tokens already issued and interrupts viewers mid-video."],
    v: "Request segments with a valid, expired, altered and cross-video token. Only the valid one is served, caches return the same cached object for different tokens, and a rotation does not interrupt an active session.",
    dep: ["age-and-region-gating", "edge-caches", "metadata-store"]
  },
  "isp-embedded-caches": {
    s: "Cache servers installed inside access networks and exchange points, filled during quiet hours, that serve a large share of popular video from within the viewer's own provider.",
    d: "Network operators host platform-supplied servers inside their networks. Viewers in that network are routed to them and receive popular content without crossing the operator's transit links. The servers fill overnight with predicted popular content and report health and traffic. The arrangement reduces cost for both sides and improves quality. Hard because servers live in infrastructure the platform does not control, must be managed remotely, and fill traffic and software updates need operator cooperation.",
    k: ["Embedded caches versus peering at exchange points: embedded caches are closest and cheapest per bit for the operator; peering is easier to operate and covers more networks.", "Nightly planned fill versus continuous fill: planned fill avoids daytime congestion; continuous follows trends but loads links at peak."],
    p: ["A misconfigured embedded cache serves stale or wrong content and cannot be repaired quickly because it is remote.", "Fill traffic competes with subscribers' traffic during the evening peak."],
    v: "Route test viewers inside a partner network and compare. A high share of their bytes is served from the embedded servers, upstream traffic falls accordingly, and failing a server shifts viewers to the next tier without errors.",
    dep: ["edge-caches", "cache-fill-and-prefetch", "request-routing"]
  },
  "object-store": {
    s: "A durable, scalable store for video segments, originals, thumbnails and captions, addressed by key and accessed over HTTP, with no filesystem semantics.",
    d: "Objects are written once and read many times. The store spreads each object across many disks and sites with replication or erasure coding, indexes keys in a sharded metadata layer and serves ranged reads. Throughput scales by adding nodes. Naming conventions place objects so listings and rebalancing stay efficient. Hard because video objects are large, the namespace holds trillions of entries, hotspots form on popular keys, and silent corruption must be found by background scrubbing.",
    k: ["Immutable objects versus in-place update: immutable objects make caching and replication simple; any change means writing a new object and cleaning up the old one.", "Key prefix by hash versus by video id: hashed prefixes spread load evenly; video-id prefixes keep a video's files together for simple deletion and listing."],
    p: ["A popular object's key concentrates reads on a few nodes and throttles unrelated objects.", "Silent bit rot is undetected for years until every replica is damaged."],
    v: "Write, read back with range requests and verify checksums, then fail disks and a site. All objects remain readable and verified, background scrubbing reports and repairs injected corruption within the target time.",
    dep: ["replication-and-erasure-coding", "data-sharding"]
  },
  "storage-tiers": {
    s: "Moves video data between fast, medium and slow storage according to how often it is watched, because most videos are rarely viewed after a short period.",
    d: "New and popular segments sit on fast media near the caches; older ones move to cheaper disks and finally to archival storage with slow, priced retrieval. A policy engine uses recent view counts and age to promote and demote objects. Lower-resolution renditions of old videos may be deleted and regenerated on demand. Hard because popularity is a long tail with sudden revivals, retrieval from cold storage delays playback or costs money, and moving data itself uses capacity and network.",
    k: ["Demote by age versus by observed views: age is simple and predictable; views protect old but popular content at the cost of tracking per-object access.", "Keep all renditions warm versus regenerate on demand: keeping them avoids latency; regeneration saves large amounts of storage for old content that is seldom watched."],
    p: ["A years-old video goes viral while its segments are in cold storage and playback stalls.", "Demotion jobs run at peak and compete with serving traffic for disk and network."],
    v: "Age a set of test videos through the tiers, then request one from cold storage. Tier placement follows the policy, the revived video is served within its allowed delay, and it is promoted for later requests.",
    dep: ["object-store", "lifecycle-policies", "view-counting"]
  },
  "replication-and-erasure-coding": {
    s: "Protects stored data against disk, machine and site loss by storing multiple copies or coded fragments, trading storage overhead against read speed and repair cost.",
    d: "Hot data is replicated three times for fast reads and simple repair. Colder data is split into data and parity fragments so any subset can rebuild it, using far less space than copies. Fragments are placed in different failure domains: disks, racks and sites. Repair rebuilds lost fragments in the background. Hard because large coded groups take heavy network traffic to repair, correlated failures break independence assumptions, and the math must still meet a stated durability target.",
    k: ["Replication versus erasure coding: replication reads and repairs fast; erasure coding stores the same durability in much less space but costs compute and repair bandwidth.", "Across sites versus within a site: across sites survives site loss; it adds wide-area traffic and write latency."],
    p: ["A rack-level failure destroys several fragments of the same group because placement ignored the failure domain.", "Repair traffic after a big failure saturates links and slows viewer traffic."],
    v: "Fail disks, a rack and a site in a test cluster. Every object remains readable, repair completes within the target while serving traffic stays within latency limits, and computed durability meets the stated number.",
    dep: ["data-sharding"]
  },
  "catalog-database": {
    s: "The transactional database of accounts, channels, videos, playlists and relationships, which records what exists and who owns it, distinct from the video bytes.",
    d: "Rows describe entities and their relationships, stored in a sharded relational or key-value database with replicas for reads and a log of changes consumed by search, caches and analytics. Writes are comparatively few but must be correct: ownership, visibility and deletion. Hard because the data set is large, hot rows such as a popular channel attract disproportionate load, schema changes on huge tables must happen without downtime, and many systems derive their own copies that must stay consistent.",
    k: ["Strongly consistent writes versus eventual replicas for reads: strong writes protect correctness for ownership and visibility; replicas scale reads at the cost of brief staleness.", "Publishing changes via a log versus having each service poll: a log gives every consumer ordered changes cheaply; it adds infrastructure and requires consumers to handle replays."],
    p: ["A schema migration on a very large table locks writes and takes down uploads.", "A consumer misses part of the change log, and its derived copy silently diverges from the source."],
    v: "Change ownership, visibility and delete a video, and confirm each downstream consumer reflects the change within its target. Run a schema change under load with no write errors.",
    dep: ["data-sharding", "replication-and-erasure-coding"]
  },
  "lifecycle-policies": {
    s: "Rules that decide how long each kind of data is kept and when it is demoted, compacted or deleted, covering originals, renditions, logs, drafts and abandoned uploads.",
    d: "Policies attach to object classes and are executed by background sweeps that read metadata, apply age and access rules, and issue moves or deletes. They enforce legal retention and holds, creator deletion, and cost controls such as dropping unused renditions. Reports show what was removed. Hard because deletions are irreversible, policies of different origin, such as legal hold and creator deletion, conflict, and sweeps over trillions of objects need careful rate limits.",
    k: ["Rules executed by background sweeps versus triggered by events: sweeps are simple and catch everything eventually; event triggers act promptly but miss objects whose events were lost.", "Soft delete with grace period versus immediate deletion: grace allows recovery from mistakes; immediate deletion honors privacy and takedown requirements faster."],
    p: ["A mistaken policy change deletes a class of data before anyone notices because deletion was immediate.", "A legal hold is not respected by a cost-saving sweep."],
    v: "Apply a policy to a test bucket with holds, soft-deleted items and abandoned uploads. Only eligible objects are removed, held items survive, and a report lists each action with its rule.",
    dep: ["object-store", "storage-tiers", "catalog-database"]
  },
  "deletion-propagation": {
    s: "Carries a delete, takedown or privacy request from the catalog to every copy: renditions, caches, search, recommendation inputs, analytics, backups and partner systems.",
    d: "A deletion event is published with a reason and a deadline. Each system that holds a copy subscribes, removes its data and confirms. Caches are purged by key, tokens are invalidated and search entries removed. Backups use expiry or cryptographic erasure. A tracker records which systems have confirmed and alerts on stragglers. Hard because copies are numerous and loosely owned, some stores cannot delete selectively, and legal deadlines apply to the slowest copy.",
    k: ["Cryptographic erasure by destroying keys versus physically deleting every copy: key destruction is fast and covers backups; it requires per-object keys and careful key management.", "Central deletion tracker versus each system acting independently: a tracker proves completion; it is another system to maintain and can itself become stale."],
    p: ["A cache or derived dataset is missed and the video remains visible or usable long after deletion.", "Purge requests are dropped during an incident and nobody notices because confirmation is not tracked."],
    v: "Delete a test video and audit every system for its id and content. Edge caches, search, recommendation inputs and storage show no copy by the deadline, and the tracker lists a confirmation from each.",
    dep: ["catalog-database", "object-store", "edge-caches", "search-index"]
  },
  "playback-event-collection": {
    s: "Receives the stream of events players send, such as start, heartbeat, seek, buffering, error and end, and writes them durably with minimal overhead on the viewer's device.",
    d: "Players batch small events and send them to collection endpoints, often when a page is hidden or periodically. Collectors validate, enrich with server-side fields such as region and network, and write to a partitioned durable log. Sampling and rate limits protect the pipeline. Volumes reach millions of events per second. Hard because events arrive late, duplicated and out of order, clients are untrusted and may send false data, and mobile devices lose events when the application is killed.",
    k: ["Heartbeats at fixed intervals versus event-only reporting: heartbeats give continuous watch time and show crashes; they multiply volume and battery use.", "Trusting client timestamps versus assigning server time: client time reflects when something happened; server time is reliable and ignores clock errors but loses real ordering."],
    p: ["Events are lost when the application is closed, which biases watch time downward for exactly the viewers who left.", "A buggy client release floods the collectors with malformed events."],
    v: "Play videos on test devices with network drops and forced app kills. Start, heartbeat and end events arrive exactly once after deduplication, within the freshness target, and malformed events are rejected and counted.",
    dep: ["api-gateway", "data-sharding"]
  },
  "stream-aggregation": {
    s: "Continuously computes counts and rolling statistics from the event stream, such as views per video per minute, concurrent viewers and error rates, for dashboards, ranking and alerts.",
    d: "A stream-processing job reads the log, deduplicates by event id, groups by keys such as video, region and device, and maintains windowed counters with state checkpointed for recovery. Late events are handled by allowed lateness and corrections. Outputs go to serving stores and the feature pipeline. Hard because hot keys (a viral video) skew load, exactly-once results require careful state management, and the choice between speed and accuracy affects every consumer.",
    k: ["Approximate sketches versus exact counts: sketches use little memory and scale to huge cardinalities; exact counts are required wherever money or disputes depend on them.", "Event-time windows versus processing-time windows: event time gives correct results despite delays; processing time is simpler and always timely but wrong when data is late."],
    p: ["A viral video's key overloads one worker and the whole job falls behind.", "A restart without state restores replays events and double counts a window."],
    v: "Feed a recorded event stream with late and duplicated events, kill and restore the job, and compare with a batch recomputation. Counts match within tolerance and lag stays below the target.",
    dep: ["playback-event-collection", "data-sharding"]
  },
  "view-counting": {
    s: "Decides which plays count as views, removes bots, loops and purchased traffic, and produces the counts shown publicly and used for revenue, with later corrections.",
    d: "A view counts after a minimum watch duration or fraction, subject to rules about repeated plays by the same viewer, embeds and autoplay. Fraud detection looks at device and network patterns, behavior timing and accounts. Public counts update quickly and approximately, while billing counts are finalized after validation. Creators see adjustments when invalid views are removed. Hard because adversaries continuously imitate real viewers and every rule change shifts numbers creators care deeply about.",
    k: ["Real-time counts versus delayed validated counts: real-time is satisfying and drives trends; validated counts are accurate and necessary for payment, so both are shown with different latency.", "Strict view rules versus permissive: strict rules resist inflation; permissive rules count more genuine but marginal views."],
    p: ["A botnet inflates views on a video, which then rises in recommendations before the filters catch it.", "Removing invalid views changes totals after a creator has already been paid."],
    v: "Inject real-like plays and simulated bot traffic into a test environment. Bot plays are excluded from validated counts within the validation delay, public counts converge to the validated number, and adjustments are logged.",
    dep: ["stream-aggregation", "playback-event-collection"]
  },
  "creator-analytics": {
    s: "Dashboards and reports for creators showing views, watch time, retention curves, traffic sources, audience demographics and revenue, with breakdowns and comparisons over time.",
    d: "Aggregated tables are precomputed per channel and video by day and dimension, and served through a query layer with access control so creators see only their own data. Retention is derived from sampled playhead positions. Demographics are shown only when groups are large enough to protect viewers' privacy. Hard because per-creator queries over very large data must be fast, numbers must agree with those in billing, and tiny audiences risk identifying individual viewers.",
    k: ["Precomputed aggregates versus ad hoc queries on raw events: aggregates are fast and cheap; they limit which questions can be answered without a new pipeline.", "Showing detailed demographics versus thresholds for privacy: detail helps creators target content; thresholds prevent identifying individuals."],
    p: ["Analytics shows a number that differs from the revenue report, and creators lose trust in both.", "Small-group breakdowns reveal one viewer's age, region and watching habits."],
    v: "Compare a creator's dashboard totals with the ledger and raw events for a test channel. Totals reconcile within the stated tolerance, queries meet latency targets, and small groups are suppressed.",
    dep: ["event-warehouse", "view-counting", "stream-aggregation", "revenue-ledger"]
  },
  "qoe-metrics": {
    s: "Measures what viewers actually experienced: time to first frame, rebuffering, bitrate delivered, failed starts and errors, broken down by device, network, region and cache site.",
    d: "Player events are aggregated into session summaries and joined with delivery data. Dashboards and alerts track percentiles per segment of traffic, and experiments compare them across variants. Engineers use them to find a bad network path, an overloaded cache site or a player regression on one device. Hard because averages hide the unlucky tail, sessions that failed before sending any event are missing, and cause is difficult to separate from correlation.",
    k: ["Percentiles versus averages: percentiles show the tail that viewers complain about; averages are stable but hide failures.", "Client-reported versus server-side measurement: client data shows the real experience; server data is trustworthy and covers sessions that never reported."],
    p: ["Failed starts never emit events, so the dashboard shows an improvement while more viewers fail.", "Metrics are broken down so finely that each cell is too small to alert on."],
    v: "Inject a throttled network, an overloaded cache site and a broken player build in a test. Each shows up in the right breakdown within minutes with the right percentile movement and fires its alert.",
    dep: ["playback-event-collection", "stream-aggregation", "edge-caches"]
  },
  "event-warehouse": {
    s: "Long-term analytical storage of cleaned event and catalog data, queryable by analysts, product teams and model training jobs, partitioned by date and organized for large scans.",
    d: "Raw events land in a durable store, are cleaned and modeled into tables partitioned by date and key, and queried with distributed SQL engines. Data is joined with catalog snapshots to give context at the time of each event. Access is controlled by sensitivity, with personal data minimized, pseudonymized and expiring. Hard because volumes are petabytes, queries are expensive, definitions of metrics drift between teams, and privacy rules require deleting a viewer's data from historical tables.",
    k: ["Raw events kept forever versus aggregates only: raw events support new questions and retraining; they cost storage and carry privacy liability.", "One governed metric layer versus each team defining metrics: a governed layer gives one answer; it slows teams and requires ownership."],
    p: ["Two teams compute watch time differently and executives see different numbers.", "A user's deletion request is satisfied in the live stores but not in historical partitions."],
    v: "Run a standard set of metric queries and a deletion request against the warehouse. Results match the governed definitions, query cost is within budget, and the deleted viewer's identifiers no longer appear in any table.",
    dep: ["playback-event-collection", "object-store", "data-sharding"]
  },
  "api-gateway": {
    s: "The single front door for apps and pages, which authenticates requests, applies rate limits and routing, and forwards them to internal services with consistent errors and tracing.",
    d: "Requests arrive over HTTP from many client versions. The gateway terminates TLS, validates sessions, enforces limits per user and per client, routes to services, and aggregates responses for common screens. It supports versioned APIs so old clients keep working. Hard because client versions linger for years, a single slow dependency can hold gateway resources and spread failure, and limits must stop abuse without hurting shared networks.",
    k: ["Backend-for-frontend aggregation versus thin routing: aggregation reduces round trips for apps; it concentrates logic and coupling in the gateway.", "Per-user versus per-IP rate limiting: per-user is fair for signed-in traffic; per-IP is needed for anonymous traffic and punishes shared networks."],
    p: ["One slow downstream service exhausts connections and the gateway returns errors for unrelated features.", "Removing an old API version breaks old television apps that cannot update."],
    v: "Load the gateway with mixed traffic while slowing one backend. Other routes keep their latency, limits trigger at the configured levels, and old client versions still receive correct responses.",
    dep: ["service-discovery", "observability"]
  },
  "service-discovery": {
    s: "The mechanism by which services find healthy instances of each other, with health checks, load balancing, retries and timeouts applied consistently across the fleet.",
    d: "A registry tracks instances and their health, and sidecar proxies or client libraries use it to route calls, balance load and retry failures within a budget. Policies set timeouts, circuit breakers and mutual authentication between services. Changes to policy propagate without redeploying services. Hard because retries multiply load during a failure, stale registry data sends traffic to dead instances, and a faulty mesh configuration can break every service at once.",
    k: ["Sidecar proxy versus in-process library: sidecars apply uniform policy to every language and need no code changes; libraries avoid an extra hop but must be updated everywhere.", "Aggressive retries versus none: retries hide brief failures; unlimited retries turn a partial outage into a total one."],
    p: ["Retry storms during a brownout amplify load several times and prevent recovery.", "A mesh configuration push with a mistake is applied everywhere at once."],
    v: "Kill instances and slow a dependency in a staging fleet. Traffic moves to healthy instances within seconds, retries stay within budget, and a bad configuration is rejected by validation or contained by staged rollout.",
    dep: ["observability"]
  },
  "workflow-orchestration": {
    s: "A durable engine that runs multi-step jobs, such as processing a video, as graphs of tasks with retries, timeouts, dependencies and visible state.",
    d: "A workflow defines the steps for a video: probe, safety checks, encode, package, publish. The engine persists state after each step, schedules tasks on workers, retries failed ones and compensates when a later step fails. Operators can see where a video is stuck and rerun from a step. Hard because workflows run for hours, versions of the definition change while jobs are in flight, and a failure that is not retried correctly leaves a video half-processed.",
    k: ["Central orchestrator versus choreography through events: an orchestrator gives visibility and simple recovery; choreography has no central bottleneck but is harder to trace and change.", "Upgrade running workflows to new definitions versus let old ones finish: upgrading fixes bugs everywhere; letting them finish avoids surprising mid-flight changes."],
    p: ["Workflow definition changes break videos that were mid-processing and leave them stuck.", "Non-idempotent steps run twice after a retry and create duplicate outputs."],
    v: "Run videos through the workflow with injected step failures, a worker crash and a definition change mid-run. Each completes or fails with a recorded reason, no duplicates appear, and an operator can resume a stuck one.",
    dep: ["data-sharding", "observability"]
  },
  "data-sharding": {
    s: "Splits large datasets across many database instances by a key, with routing, rebalancing and resharding, so no single machine limits capacity or availability.",
    d: "A shard map assigns key ranges or hashes to instances, and a routing layer sends each query to the right one. Hot keys are detected and split or cached. Adding capacity means moving data online while serving traffic. Cross-shard queries and transactions are avoided or handled by dedicated paths. Hard because the choice of key is almost impossible to change later, popularity skew breaks even distribution, and resharding must preserve correctness while data moves.",
    k: ["Hash versus range partitioning: hashing spreads load evenly; ranges support ordered scans and locality but create hot spots on recent data.", "Many small logical shards versus few large: small shards make rebalancing granular; they increase metadata and per-shard overhead."],
    p: ["A viral video makes one shard hot, and all other videos on it slow down.", "Resharding double-writes with a bug and leaves two copies that diverge."],
    v: "Add a shard to a loaded test cluster. Data moves online with no failed requests, key distribution evens out, and a verification pass finds identical content between source and destination.",
    dep: ["replication-and-erasure-coding"]
  },
  "capacity-planning": {
    s: "Forecasts demand for storage, encoding, network and serving, and decides purchases and placement months ahead, against budgets and lead times.",
    d: "Models project uploads, watch hours, bitrate and codec mix from history, launches and seasonal events. Planners translate them into disks, encoder chips, cache servers and transit commitments and compare with what is installed. Drills test failover headroom. Hard because lead times for hardware and network are months, demand is lumpy because of events, codec changes alter the cost mix, and being short means degraded playback while being long wastes money.",
    k: ["Provision for the peak versus the average with spillover: peak provisioning is safe and expensive; spillover to rented capacity is cheaper and depends on that capacity being available.", "Centralized versus per-region planning: central planning optimizes globally; per-region teams understand local conditions and respond faster."],
    p: ["A forecast misses a major event and caches in one region saturate.", "Planned headroom is consumed by failover from another region, and a second failure causes an outage."],
    v: "Compare last quarter's forecast with actual demand per resource. Error stays within the tolerance, and a failover drill shows remaining sites carry the displaced load within their capacity.",
    dep: ["observability", "cost-per-watch-hour"]
  },
  "observability": {
    s: "Metrics, logs and traces across all services, with dashboards, alerts and on-call tooling that show what is failing and where, especially for playback and processing paths.",
    d: "Services emit structured metrics and traces with request ids; collectors aggregate and store them with retention by value. Alerts are tied to viewer-facing service levels, such as failed starts and processing delay, rather than to machine counters. Synthetic probes play videos from several regions continuously. Hard because telemetry volume is itself a large cost, alert noise causes on-call fatigue, and failures that produce no signal, such as silent drops, need independent checks.",
    k: ["Alerting on symptoms viewers feel versus on causes: symptom alerts match real impact and have fewer false alarms; cause alerts help diagnosis but fire for harmless conditions.", "Full-fidelity traces versus sampling: full traces help debug rare faults; sampling cuts cost considerably and may miss them."],
    p: ["A synthetic probe tests only one path and stays green during an outage that affects real devices.", "Alert thresholds are never reviewed and on-call ignores the noisy ones."],
    v: "Inject a playback failure in one region and a processing delay. Alerts fire within the target on viewer-facing indicators, the probe detects the failing region, and traces lead to the faulty component.",
    dep: []
  },
  "progressive-rollout": {
    s: "Ships changes to services, players and configuration in stages, from a small share of traffic to all, with automatic checks and fast rollback.",
    d: "A new build or setting goes first to internal users, then to a fraction of one region, then wider, each stage gated on viewer-facing metrics compared with a control group. Feature flags separate deploying code from enabling it. Player changes go through app stores and web caches with their own delays. Hard because some problems only appear at scale or on one device model, rollbacks of data changes are not simple, and clients keep old code for months.",
    k: ["Automatic metric-gated promotion versus manual approval: automatic is faster and consistent; manual judgment catches issues that metrics miss but slows releases.", "Region-by-region versus random-percentage rollout: regions contain blast radius and match operations; random percentages give statistically cleaner comparisons."],
    p: ["A change is rolled out gradually but its data migration is not reversible, so rollback is impossible.", "Metrics at the early stage are too sparse to detect a regression on one device type."],
    v: "Roll out a deliberately faulty test change. Stage metrics detect the regression at the first stage, promotion halts automatically, and rollback restores previous behavior within the target time.",
    dep: ["observability", "service-discovery", "api-gateway"]
  },
});
