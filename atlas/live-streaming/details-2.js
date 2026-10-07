// Details for the live streaming plate, part 2: packaging, latency modes, origin and CDN delivery.
ATLAS.details("live-streaming", {
  "segmenter": {
    s: "Cuts each rendition into short, independently decodable files, a few seconds long or less, and publishes them in order so ordinary web servers can deliver live video.",
    d: "The segmenter reads encoded frames, starts a new segment at each keyframe boundary, wraps the data in a container suitable for web players, and writes the file to the origin along with an updated manifest. Segment duration is the main knob: shorter segments lower latency and speed up quality switching but increase request counts and header overhead. It must produce identical numbering and boundaries across redundant instances, so a standby can take over mid-stream without players noticing. Timing errors here show up as stalls everywhere.",
    k: ["Short segments vs long segments: lower delay and faster adaptation, against many more requests, lower cache efficiency and more overhead per byte.", "Deterministic numbering from timestamps vs a counter per instance: redundant packagers agree without coordinating, but every upstream timestamp must be trustworthy."],
    p: ["Two redundant packagers number segments differently, so a failover makes players request files that do not exist.", "A segment published before it is fully written is cached by the edge as truncated and served broken to every viewer."],
    v: "Run two packagers on the same input, compare their segment names, durations and bytes for an hour, and confirm they are identical. Then kill one mid-stream and confirm players continue without errors.",
    dep: ["keyframe-alignment","origin-service","clock-and-timecode"]
  },
  "hls-manifests": {
    s: "A playlist file that lists the recent segments of each rendition in order, which the player re-fetches repeatedly to learn what to play next in a live stream.",
    d: "A master playlist names the renditions and their properties; each media playlist lists segment addresses, durations and a sequence number, with a sliding window for live. The server rewrites it every time a segment is published, and players poll it, so it is among the most requested files on the platform. It also carries discontinuity markers, encryption key references, program time and ad-break tags. Its correctness is critical: a missing segment, wrong sequence number or stale copy causes stalls, and older devices accept only strict forms.",
    k: ["Sliding window of few segments vs long window: small manifests are cheap to fetch and cache, but players that fall behind cannot recover and DVR needs another path.", "Include full details in every update vs minimal playlists: richer data helps players, but each update is larger and requested by everyone."],
    p: ["A manifest published before its newest segment exists makes players request a file that returns an error.", "A wrong media sequence number after failover makes players replay or skip content."],
    v: "Poll the playlist every 500 ms for an hour and confirm the sequence number only increases by one per segment, every listed segment returns successfully, and no entry disappears before its time.",
    dep: ["segmenter","short-ttl-manifests","origin-service"]
  },
  "dash-manifests": {
    s: "An XML description of the stream, using time-based segment templates, that lets players compute segment addresses from the clock instead of re-downloading a list.",
    d: "The manifest describes adaptation sets for video, audio and text, each with representations and a template for deriving segment addresses from time or number. A player reads the template once, uses a synchronized clock to calculate what the newest segment should be, and needs fewer manifest refreshes. It also describes availability times and periods for ad insertion. The difficulty is clock dependence: a player or server with an incorrect clock requests segments that are not yet published or already gone.",
    k: ["Template-based addressing vs explicit lists: fewer manifest downloads and easier caching, but players must trust a synchronized clock.", "Multiple periods for ads and content vs one continuous period: clean boundaries for insertion, but player support varies and period transitions can stutter."],
    p: ["A viewer's device clock is minutes wrong, so the player computes segment times that do not exist and fails to start.", "Period boundaries that do not match actual media timing cause a gap or overlap at every ad break."],
    v: "Test playback on devices with clocks set minutes off and confirm the player corrects using the server's time reference and starts within the target, requesting only segments that exist.",
    dep: ["segmenter","clock-and-timecode","origin-service"]
  },
  "low-latency-parts": {
    s: "Splits each segment into small parts that are published and requested while the segment is still being encoded, cutting delay to a few seconds.",
    d: "Instead of waiting for a full multi-second segment, the packager emits sub-second parts using chunked transfer, and the manifest advertises parts as they appear. The player requests the next part with a blocking request, which the server holds until it exists, removing polling delay. It requires support across the chain: encoder, packager, origin, every cache layer and the player. Parts hurt cache efficiency and request volume, and intermediaries that buffer responses silently destroy the gain.",
    k: ["Parts and blocking requests vs ordinary segments: delay drops from tens of seconds to a few, against many more requests and fragile cache behavior.", "Dedicated low-latency path vs same path for all: tuned behavior, but a second delivery system to operate and monitor."],
    p: ["A proxy that buffers whole responses holds parts until the segment is complete, so latency is back to normal with no error.", "Held blocking requests exhaust connection limits at the origin during a surge."],
    v: "Measure delay with a burned-in clock on the low-latency path and confirm it is within the target, then insert a buffering proxy and confirm monitoring flags the regression.",
    dep: ["segmenter","request-coalescing","buffer-controller"]
  },
  "dvr-window": {
    s: "Keeps recent segments available so viewers can pause, rewind and rejoin from earlier in a live stream, within a window of minutes to hours.",
    d: "The origin retains segments beyond the live edge, and the manifest exposes either a sliding window or the stream from its start. Players seek within it, and each rewound request goes to the cache or origin as an ordinary file. The cost is storage and cache pressure: rewound viewers request old segments that are cold in edge caches, and a popular moment can create a sudden surge on files that were never cached. Window length is a product and cost decision, tied to what rights allow.",
    k: ["Long window vs short window: viewers gain pause and rewind, at the cost of storage and cold-cache origin load.", "Serve rewind from the live path vs from recordings: no extra system, but live origins carry load they were not sized for."],
    p: ["A moment goes viral and thousands rewind to the same minute, hitting the origin for segments not in any cache.", "Retention shorter than the manifest's window makes listed segments return errors."],
    v: "Rewind 30 minutes on a stream with a 60-minute window and confirm playback starts within the startup target, and that segment requests beyond the window are removed from the manifest before they fail.",
    dep: ["segmenter","object-storage","origin-service"]
  },
  "content-encryption": {
    s: "Encrypts segments so only players holding a key released by the license service can decode them, protecting paid or licensed streams from copying.",
    d: "The packager encrypts media with a content key, either whole segments or just the media samples, and references the key in the manifest. Keys are generated per stream, rotated periodically, and registered with the license service. Encrypting at packaging time means the cache stores ciphertext and needs no keys. The difficulty is that two common schemes exist and devices differ in which they support, so platforms often package twice or choose a common mode. Key rotation must be coordinated between packager and license server to the second.",
    k: ["One common encryption scheme vs separate packaging per device family: single copy halves storage and cache fragmentation, but excludes devices that need the other.", "Frequent key rotation vs fixed keys: limits the value of a leaked key, but adds license traffic and a rotation failure mode."],
    p: ["A key rotates at the segment boundary but the license server has not yet published it, so every player stalls at once.", "Keys logged or stored with the media defeat the protection entirely."],
    v: "Fetch an encrypted segment directly and confirm it cannot be decoded without the key, rotate the key mid-stream, and confirm players continue without a stall or extra license round trip beyond the plan.",
    dep: ["segmenter","identity-and-auth","stream-registry"]
  },
  "ad-break-markers": {
    s: "Signals in the stream and manifest that say where an ad break begins and ends, so ad insertion and players know exactly where to splice.",
    d: "Markers originate from the broadcaster's cue messages, a platform scheduler, or an operator's button, and carry a time, duration and break identifier. The packager converts them into manifest tags and aligns the break to a segment boundary, forcing a keyframe at the exact point. Downstream, the ad insertion service uses them to substitute content. Accuracy matters: a marker that is one second off cuts the start of the show or leaves a black gap. Markers can also be lost or duplicated by upstream encoders.",
    k: ["Markers in the stream vs out-of-band scheduling: in-stream markers travel with the video and stay in sync, but depend on every upstream step preserving them.", "Align to segment boundaries vs exact frames: segment alignment is simple, but exact splices need keyframes forced at that frame."],
    p: ["An encoder drops the cue message, so ads never play and the missed revenue is invisible until reporting.", "A duplicated marker triggers two ad breaks back to back, annoying viewers."],
    v: "Send 100 scheduled cues from the source and confirm each produces exactly one break in the manifest, aligned within one frame, with the right duration, and none lost or repeated.",
    dep: ["segmenter","keyframe-alignment","timed-metadata-sync"]
  },
  "webrtc-sfu": {
    s: "Delivers video to viewers over real-time peer connections through a forwarding server that relays packets without decoding them, giving sub-second delay at lower viewer scale.",
    d: "A selective forwarding unit receives each rendition from the transcoder and forwards packets to each connected viewer, choosing the rendition by that viewer's measured bandwidth and sending retransmissions or keyframe requests as needed. There are no segments or manifests; delay can be a few hundred milliseconds. But every viewer is a stateful connection, so scale is bounded by servers rather than caches. Cascading forwarders in a tree extends reach. Hard parts are congestion control per viewer, rendition switching and the cost of per-viewer connections.",
    k: ["Real-time connection delivery vs cached segments: sub-second delay, against stateful servers, no use of ordinary caches and higher cost per viewer.", "Forwarding without decoding vs transcoding per viewer: cheap and low delay, but quality switching depends on aligned renditions."],
    p: ["A flood of simultaneous joins each demanding a keyframe overloads the forwarder and the encoder behind it.", "Strict networks block the required UDP ports, so a fraction of viewers cannot connect at all."],
    v: "Connect 10,000 test viewers to one stream and confirm median glass-to-glass delay under a second, server CPU stays within plan, and viewers on throttled links drop to a lower rendition without freezing.",
    dep: ["live-video-encoder","abr-ladder","edge-network","signed-urls"]
  },
  "latency-tiers": {
    s: "The set of delivery modes the platform offers, such as ultra-low, low and standard delay, and the rule that picks one for each stream and viewer.",
    d: "A standard tier uses longer segments and a large buffer for reliability and cache efficiency. A low tier uses parts and shorter buffers. An ultra-low tier uses real-time connections. Each costs more per viewer and tolerates less jitter. Selection depends on the stream's purpose, such as auctions or betting, and on the viewer's connection and device, with fallback when conditions worsen. The platform must keep the tiers consistent enough that moving viewers between them does not break chat, ad and recording timing.",
    k: ["Offer several tiers vs one default: each use case gets what it needs, but each tier is a delivery system to run and test.", "Broadcaster picks the tier vs platform picks automatically: broadcasters control interactivity, but platform control protects cost and stability."],
    p: ["Viewers on the low-delay tier see spoilers in chat from standard-tier viewers who are far ahead or behind.", "Automatic fallback flaps between tiers on a marginal connection, causing repeated rebuffering."],
    v: "Run the same stream on all tiers, measure the delay of each with a burned-in clock, and confirm each is within its published target while a throttled viewer falls back to a slower tier within the plan.",
    dep: ["low-latency-parts","webrtc-sfu","segmenter"]
  },
  "origin-service": {
    s: "The authoritative store and server of live segments and manifests, which edge caches fetch from and which must stay available for the entire broadcast.",
    d: "The packager writes segments and manifests to the origin, which serves them over HTTP with correct cache headers: long lifetimes for immutable segments and very short ones for manifests. It may hold only a rolling window in memory and write older files to object storage. Because every cache miss ends here, the origin must handle bursts for the newest segment, and its capacity decides how many viewers the platform can serve without more tiers. It is also a single source of truth, so its failure is visible to everyone.",
    k: ["In-memory rolling window vs durable store on every write: very fast and cheap for live, but segments vanish with the machine unless replicated.", "Origin per region vs central origin: closer to caches and resilient, but needs replication of every segment and agreement on the live edge."],
    p: ["A cache miss storm on the newest segment overwhelms the origin because many edges ask at once.", "Wrong cache headers on a manifest let edges serve stale versions for ten seconds and freeze playback."],
    v: "Serve a stream to a test fleet of caches and confirm the origin sees one request per segment per cache tier, response time stays flat as viewers increase tenfold, and cache headers match the specified lifetimes.",
    dep: ["object-storage","edge-network","origin-replication"]
  },
  "origin-shield": {
    s: "An intermediate cache tier between edge caches and the origin, so many edges that miss at the same time produce a single request to the origin.",
    d: "Edge locations are numerous, so without a shield each would fetch every new segment independently. The shield tier is a small set of larger caches; edges route misses to the nearest shield, and only the shield contacts the origin. It multiplies the effect of request coalescing and shrinks the origin's load to a fixed small number of clients. The cost is one more hop, adding delay, and one more place for failure, so shield capacity and placement must follow the audience rather than the origin.",
    k: ["Shield tier vs edges fetching directly: origin load drops by orders of magnitude, but adds a hop and a component that can fail or saturate.", "Few large shields vs many: better hit rates and coalescing, but longer paths for far regions."],
    p: ["A shield sits far from a region's edges, adding hundreds of milliseconds and defeating low-latency modes.", "A shield failure without a bypass route sends every edge to the origin at once."],
    v: "Count origin requests while ten thousand viewers join a stream across many regions. The count should match the number of shields times segments, and failing one shield should shift traffic to another without origin saturation.",
    dep: ["edge-cache","origin-service","request-coalescing"]
  },
  "edge-cache": {
    s: "Servers near viewers that store recent segments and serve them directly, so most requests never leave the viewer's region.",
    d: "Each edge keeps recently requested segments in memory and disk, evicting old ones, and follows cache headers. For live video the working set is tiny, only the newest few segments of each stream, but every viewer requests the same object within seconds, so hit ratio should be very high. Hard problems are the first request after publication, which always misses, manifests with lifetimes of a second or less, and retaining enough capacity of bandwidth rather than storage. Edge capacity is mostly a network throughput problem.",
    k: ["Memory-first cache vs disk-based: very high throughput for hot live objects, but little space for rewound or on-demand content.", "Pull-through on demand vs push to edges: pull is simple and adapts to demand, but the first viewers in a region all pay the miss."],
    p: ["Short manifest lifetimes cause a thundering herd of refreshes at each expiry that overloads the edge.", "A node with a full network link serves slowly but still appears healthy, so traffic is not moved away."],
    v: "Watch a popular stream through the edge and confirm segment hit ratio above 99%, manifest freshness within one segment duration, and per-node throughput below the link limit at peak.",
    dep: ["edge-network","origin-shield","request-coalescing"]
  },
  "request-coalescing": {
    s: "Combines simultaneous requests for the same missing object into one upstream request, holding the others until it returns.",
    d: "When a new segment is published, thousands of viewers ask for it before any cache has it. A coalescing cache notices the first request in flight, queues the rest and serves them all from the single response, sometimes while the response is still arriving. It needs correct handling of errors, so one failed fetch does not fail all waiters, and of timeouts so waiters do not stack indefinitely. Applied at every cache tier it turns millions of requests into one at the origin. Without it, live events overload the source.",
    k: ["Collapse requests vs pass each through: origin load becomes independent of audience, but every waiter inherits that one request's latency and failure.", "Stream the response to waiters as it arrives vs wait for completion: lower delay for low-latency parts, but harder error handling if the transfer breaks."],
    p: ["A failed upstream fetch is cached or shared, so all waiting viewers get an error for a segment that exists.", "Collapsing applied to personalized responses serves one viewer's data to another."],
    v: "Fire 5,000 simultaneous requests for an uncached segment at one edge and confirm the origin receives exactly one request and all clients receive identical bytes with response times within one round trip of each other.",
    dep: ["edge-cache","origin-service"]
  },
  "multi-cdn-steering": {
    s: "Distributes viewers across several delivery networks, choosing per session based on measured performance, cost, contract commitments and failures.",
    d: "No single delivery network is best everywhere or always up. The platform assigns each session to a CDN using real measurements from players and synthetic probes, by region and network, and can change the choice mid-session. Steering may be done in DNS, in the manifest by rewriting segment addresses, or in the player. It must respect commitments, since contracts often require minimum volumes, and avoid pushing a surge to a network that cannot absorb it. It adds complexity: cache efficiency falls when audiences split.",
    k: ["Steer in the manifest or player vs in DNS: fast, per-session switching, but requires player support and rewriting manifests at scale.", "Performance-first vs cost-first steering: better quality for viewers, against bills that depend on each contract's price and commitment."],
    p: ["Steering sends an entire surge to the apparently fastest network, which saturates and becomes the slowest.", "Splitting a small audience over many CDNs makes each cache cold and raises the origin's load."],
    v: "Degrade one CDN artificially in one region and confirm sessions there move to others within the stated time, rebuffering stays flat, and per-network volumes stay within contract limits.",
    dep: ["viewer-qoe-metrics","synthetic-viewers","signed-urls","hls-manifests"]
  },
  "signed-urls": {
    s: "Segment and manifest addresses that carry a signature and expiry, so edges can verify a viewer's right to fetch without calling the platform on each request.",
    d: "After checking entitlements, the platform issues URLs or cookies containing an expiry time, path scope and a keyed signature. The edge validates the signature locally and rejects expired or tampered ones. This keeps the authorization check off the hot path while still limiting sharing. It requires every CDN in use to support compatible validation, with shared secrets distributed to each. Tokens must outlive playback or be renewable, since a long stream outlasts a short token, and caches must avoid storing responses keyed by token.",
    k: ["Edge-verified signatures vs asking the platform per request: scales with audience and adds no latency, but revocation takes effect only at expiry.", "Token in the path vs in a cookie or query: path tokens work everywhere but fragment cache keys unless they are excluded from the key."],
    p: ["Tokens included in the cache key make every viewer's URL unique, collapsing the hit ratio to zero.", "A token that expires mid-stream interrupts a viewer who has watched legitimately for hours."],
    v: "Request a segment with a valid token, an expired one and a tampered one at the edge. Confirm only the first succeeds, and that two different tokens for the same segment share one cached object.",
    dep: ["identity-and-auth","entitlements","edge-cache"]
  },
  "short-ttl-manifests": {
    s: "Caching rules for manifests that let them live for a fraction of a segment, so viewers see new segments quickly while the origin sees few requests.",
    d: "A live manifest changes every segment, so it can be cached only briefly, around half a segment or less. Each edge then refreshes it from the shield at most once per interval no matter how many viewers poll. Techniques include stale-while-revalidate, which serves the old copy while fetching a new one, and blocking requests for low-latency. The trade-off is direct: longer lifetimes protect origins but add delay and stale views, shorter ones cost load. A wrong lifetime is among the most common causes of freezes.",
    k: ["Very short TTL vs serve-stale-while-refreshing: freshest data against smoother origin load, with a risk of showing a copy a segment behind.", "Different TTL for each tier vs one value: tuning per tier, but inconsistent values add up to unexpected total staleness."],
    p: ["Intermediate caches add their lifetimes, so a manifest is stale by several seconds and players run out of segments.", "A TTL set in seconds when the target was sub-second synchronizes every edge refresh into bursts."],
    v: "Publish a segment and poll the manifest at the viewer side. The new entry should appear within the stated bound of its publication at every tier, and origin manifest request rate should match the plan.",
    dep: ["edge-cache","origin-shield","hls-manifests"]
  },
  "origin-failover": {
    s: "Switching delivery to a second origin when the first stops serving, with matching content so players continue without a visible interruption.",
    d: "Edges and shields are configured with a primary and a secondary origin. On errors or timeouts they retry on the secondary, which holds the same segments because the packager writes to both or replication keeps it current. The challenge is that the two must agree on names, numbering and timing, and the secondary must be warm and sized for the full load. Health checks need to detect partial failures, like a manifest that updates but segments that return errors, rather than just whether the server answers.",
    k: ["Automatic retry at the cache vs DNS-level failover: seconds to recover and no client involvement, but cache configuration must be correct everywhere.", "Dual-write from the packager vs replicate after the fact: lower delay and less lag, but the packager must handle one destination failing."],
    p: ["The secondary is missing the last few segments because replication lags, so players fail exactly at the switch.", "Health checks pass on a page that works while segment storage behind it is broken."],
    v: "Block the primary origin during a live stream and confirm edges serve from the secondary within seconds, players show no error and the segment sequence is continuous in captured playback logs.",
    dep: ["origin-service","origin-replication","segmenter"]
  },
  "origin-replication": {
    s: "Copies new segments and manifests from the primary origin to other origins and regions as they are published, keeping each copy current within a segment.",
    d: "Replication is push or pull, per object or by streaming, and has to beat the viewers: a replica that is two segments behind serves a stale live edge. Segments are immutable, so there is no conflict, but manifests change and must be updated only after the segments they reference have arrived. Cross-region bandwidth is charged, so replicating every rendition of every stream everywhere is costly, and platforms replicate by audience location. Monitoring replication lag per stream is essential.",
    k: ["Replicate everywhere vs only where watched: simple and always ready, against cost for streams with audiences in one region.", "Publish the manifest after segments replicate vs immediately: consistent views, but adds the replication time to delay."],
    p: ["A manifest replicates before its newest segment, and viewers of the replica receive errors for the live edge.", "A cross-region link failure leaves a replica silently serving an old live edge."],
    v: "Publish segments continuously and compare the newest segment and manifest on each replica against the primary. The lag should stay within one segment, and the manifest never reference a missing file.",
    dep: ["object-storage","edge-network","event-bus"]
  },
});
