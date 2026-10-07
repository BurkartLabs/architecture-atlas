// Details for the video sharing plate, part 4: ingest, transcoding, live.
ATLAS.details("video-sharing", {
  "upload-api": {
    s: "The authenticated entry point where creators and applications start an upload, declare metadata and receive an upload session, separate from the data path that carries the bytes.",
    d: "A request creates a video record in an uploading state and returns a session address that accepts file bytes directly into storage, bypassing application servers. The API validates the account, checks quotas and policy status, and records declared size, type and metadata. Bulk and API clients use the same path. Hard because the control plane must stay small and fast while the data plane moves terabytes a day, and because declared properties often disagree with the actual file.",
    k: ["Bytes through application servers versus direct to storage: direct upload scales and cuts cost; it needs signed, scoped, short-lived credentials and separate completion checks.", "Create the video record at the start versus at completion: at the start lets the studio show progress; it leaves many abandoned records to clean up."],
    p: ["Abandoned uploads leave records and partial files that are never garbage collected.", "A session address is shared or leaked and used to write a different file than the one declared."],
    v: "Start uploads with valid, over-quota and suspended accounts. Only the valid one receives a session, bytes go straight to storage, and an abandoned session is cleaned up within the stated retention.",
    dep: ["video-state-machine", "upload-quotas", "object-store", "api-gateway"]
  },
  "resumable-upload": {
    s: "Splits a large file into chunks sent independently with offsets and checksums so an interrupted upload resumes from the last good chunk instead of restarting.",
    d: "The client sends chunks with an offset and a hash; the server acknowledges the committed length. After a network drop the client asks the server for its current offset and continues. Chunks may go in parallel and are assembled on completion. The protocol is plain HTTP so it crosses proxies. Hard because mobile networks drop constantly, files reach tens of gigabytes, clients must tolerate duplicate and out-of-order chunks, and the server must commit exactly once.",
    k: ["Fixed-size chunks versus adaptive: fixed is simple and cacheable; adaptive sizes improve throughput on fast links and recovery on poor ones but complicate bookkeeping.", "Server-tracked offset versus client-tracked: server-tracked is authoritative after any failure; it needs durable per-session state and expiry."],
    p: ["A chunk is acknowledged before it is durable, and a server restart silently loses data.", "Parallel chunks with a retry on timeout write the same range twice with different content."],
    v: "Upload a large file while repeatedly cutting the network and killing a server mid-upload. The final stored object's checksum equals the original and the client never resends committed chunks.",
    dep: ["upload-api", "object-store"]
  },
  "container-probing": {
    s: "Inspects the uploaded file to read its container, codecs, duration, frame rate, resolution and stream layout, and rejects files that are malformed, truncated or unsafe to process.",
    d: "A sandboxed probe parses the container headers and samples streams without trusting declared values. It records codec profiles, color information, audio layout, rotation and timecodes, and flags corrupt, truncated or oddly constructed files. The results choose the encoding ladder and processing path. Because media parsers handle hostile input, probing runs in isolated, resource-limited workers. Hard because real-world files break specifications in countless ways and decoders have historically been a major source of security flaws.",
    k: ["Probe in a locked-down sandbox versus in-process: a sandbox contains parser exploits; it adds startup cost and complexity.", "Reject odd files versus attempt repair: rejecting is safe and predictable; repair serves more creators at the cost of rare and confusing output defects."],
    p: ["A crafted file exploits a parser in an unsandboxed worker and reaches internal systems.", "A file with a wrong duration header causes the pipeline to allocate or wait indefinitely."],
    v: "Probe a corpus of valid, truncated, mislabeled and fuzzed files. Valid ones report accurate properties, bad ones are rejected with a specific reason, and none crash or escape the sandbox.",
    dep: ["resumable-upload", "ingest-queue"]
  },
  "upload-quotas": {
    s: "Limits how much each account may upload by size, count, duration and rate, with tiers for new, verified and partner accounts, to control cost and abuse.",
    d: "Limits are checked at session creation and again at completion against account standing, verification level and recent usage. New or unverified accounts get small allowances that grow with history. Limits apply by size, duration, number per day and concurrency. Hard because limits must stop abuse such as storage dumping and spam floods without blocking legitimate high-volume creators, and attackers create many accounts to multiply allowances.",
    k: ["Per-account limits versus per-network or per-device limits: per-account is fair and simple; per-network limits resist mass account creation but hit shared networks.", "Hard rejection versus throttling: rejection is clear and protects capacity; throttling is gentler but keeps resources tied up."],
    p: ["Quota counters are updated only at completion, so parallel uploads exceed the limit.", "Limits lock out a legitimate partner during an event upload because their tier was not raised."],
    v: "Start parallel uploads from accounts at different tiers beyond their limits. Each is refused or throttled at its own threshold, counters reflect in-progress work, and a tier upgrade takes effect immediately.",
    dep: ["catalog-database", "strikes-and-enforcement"]
  },
  "ingest-queue": {
    s: "A durable queue of work created when an upload completes, handing each video to probing, safety checks and transcoding with retries and priorities.",
    d: "Completion enqueues a job per video with its priority, such as partner, short or very long. Workers lease a job, run a stage and acknowledge it; a failed or timed out lease returns the job. Priorities keep time-sensitive uploads ahead of bulk backfills. The queue records attempts and sends exhausted jobs to a dead-letter store for people to inspect. Hard because jobs are long, workers die mid-job, and a poison file can fail repeatedly and consume capacity.",
    k: ["At-least-once delivery with idempotent stages versus exactly-once: at-least-once is practical and robust; every stage must tolerate being rerun.", "Strict priority versus weighted fair share: strict priority serves urgent uploads first and can starve bulk work; fair share protects everyone with slower urgent handling."],
    p: ["A file that crashes every worker is retried forever and blocks capacity.", "Without idempotent stages a retry creates a second set of renditions and double charges storage."],
    v: "Enqueue jobs, kill workers mid-job, and enqueue a poison file. Every healthy job completes exactly one set of outputs, the poison file lands in the dead-letter store after the retry limit, and priorities hold.",
    dep: ["upload-api", "workflow-orchestration"]
  },
  "video-state-machine": {
    s: "The explicit lifecycle of every video from uploading through processing, checks, published, restricted and removed, with allowed transitions and one owner for each.",
    d: "Each video has a state and a record of which stages completed. Transitions are made only by the owning service and are validated, for instance a video cannot become public before safety checks pass and at least one rendition is ready. Several visibility axes, such as processing, policy and creator choice, are modeled separately and combined to decide playability. Hard because many independent systems affect state, events arrive out of order, and showing the right state in each surface depends on a single agreed definition.",
    k: ["One combined state field versus orthogonal state axes: a single field is simple; orthogonal axes avoid combinatorial states and let policy and processing change independently.", "Event-sourced history versus current state only: history supports audit and debugging; current-state-only is smaller but cannot explain how a video got there."],
    p: ["Two services write state concurrently and a restricted video becomes public again.", "A video stuck in processing has no timeout, so creators wait indefinitely with no explanation."],
    v: "Drive test videos through normal, failed, restricted and appealed paths. Each transition is recorded, illegal transitions are rejected, and playability on every surface matches the combined state.",
    dep: ["catalog-database", "metadata-store"]
  },
  "source-archive": {
    s: "Keeps the creator's original uploaded file in durable storage so the video can be re-encoded later for new codecs or fixed after a pipeline defect.",
    d: "The original is stored once, checksummed, and rarely read, so it lives in cold storage with high durability. When a new codec, a better encoder or a bug fix requires reprocessing, jobs read the original rather than a lossy rendition. The archive also supports legal holds and creator downloads. Hard because originals are the largest objects and are the most expensive copy to keep, and retention conflicts with creator deletion and privacy rules.",
    k: ["Keep every original forever versus delete after processing: keeping allows future re-encoding at the best quality; it costs storage for files that may never be used again.", "Store originals in cold tier versus hot: cold is cheap; retrieval is slow and priced per read, which affects bulk re-encoding projects."],
    p: ["Originals are deleted to save cost, and a later codec migration must re-encode from lossy renditions with visible quality loss.", "A deleted video's original survives in an archive that the deletion pipeline does not reach."],
    v: "Select a video and re-encode it from the archive years' worth of simulated age. The output matches a fresh upload's quality, and deleting the video removes the archived original within the stated deletion time.",
    dep: ["object-store", "storage-tiers", "deletion-propagation"]
  },
  "transcode-scheduler": {
    s: "Decides which encoding jobs run where and when, balancing priority, deadline, machine type and cost across a large heterogeneous fleet.",
    d: "The scheduler receives a job graph per video and places tasks on workers with suitable codecs and hardware, preferring cheap or idle capacity for non-urgent work. Short videos from popular creators and new live replays are prioritized; long-tail backfill uses spare cycles. It tracks task progress, retries failures and caps retries. Hard because encoding times vary widely by content, capacity is bursty, and delaying a video's availability hurts creators while overprovisioning wastes the largest cost.",
    k: ["Dedicated encoding fleet versus preemptible or spare capacity: dedicated gives predictable throughput; spare capacity is much cheaper but tasks are interrupted and must be resumable.", "Process all renditions immediately versus lowest first then others later: lowest first publishes quickly; the rest cost more to run for videos that may never be watched."],
    p: ["A queue of long backfill jobs fills the fleet and delays new uploads by hours.", "Interrupted tasks restart from scratch each time and never finish on busy preemptible machines."],
    v: "Submit a mixed load of urgent short videos and bulk backfill. Urgent videos meet the time-to-playable target, bulk work uses spare capacity only, and preempted tasks resume without redoing finished chunks.",
    dep: ["ingest-queue", "chunked-parallel-encode", "encoder-hardware-pool", "workflow-orchestration"]
  },
  "chunked-parallel-encode": {
    s: "Cuts a video at scene boundaries into independent pieces, encodes them in parallel on many machines, then joins the results, cutting wall-clock time for long videos.",
    d: "The splitter finds random access points or scene changes and creates chunks of seconds to minutes. Each chunk is encoded for every rendition independently, then outputs are concatenated and checked for continuity. Rate control must be coordinated so that quality and bitrate do not jump at chunk edges. Hard because independent chunks lose context across the cut, causing visible seams or rate mismatches, and orchestration overhead and many small outputs reduce efficiency.",
    k: ["Short chunks versus long: short chunks parallelize more and recover cheaply from failure; long chunks encode more efficiently and have fewer seams.", "Split at scene cuts versus at fixed intervals: scene cuts hide boundaries and aid compression; fixed intervals are simpler and give predictable segment lengths."],
    p: ["Bitrate resets at chunk boundaries create a visible pulse every few seconds.", "One failed chunk is not detected and the joined output has a missing second."],
    v: "Encode a long test video chunked and unchunked. Duration and frame count match exactly, no visible seams appear at boundaries in a frame comparison, and quality scores differ by less than the stated tolerance.",
    dep: ["transcode-scheduler", "codec-encoders", "container-probing"]
  },
  "encoding-ladder": {
    s: "The set of resolution, bitrate and codec combinations produced for each video, chosen from the content's complexity so simple videos use fewer bits and complex ones get more.",
    d: "A fixed ladder uses the same renditions for everything; a per-title ladder runs trial encodes at several settings, measures quality against bitrate and picks the points that lie on the efficient frontier. Popular videos may be re-encoded later with extra renditions and better codecs, because their views repay the encode cost. The ladder also reflects the audience's devices and networks. Hard because trial encodes cost compute and the optimum depends on viewing conditions unknown at upload.",
    k: ["Fixed ladder versus per-title ladder: fixed is simple and predictable; per-title saves bandwidth and improves quality but costs trial encodes and breaks uniform bitrate expectations.", "Encode everything in the best codec upfront versus upgrade when popular: upfront serves the best experience at once; upgrading later spends compute only where views justify it."],
    p: ["A ladder tuned for animation applied to sports footage leaves detailed scenes starved of bits.", "Too many renditions fragment the cache and raise storage cost without improving viewer experience."],
    v: "Encode diverse test clips with fixed and per-title ladders. At matched quality scores per-title uses less bitrate on simple content and delivers higher quality at the top rendition on complex content.",
    dep: ["quality-scoring", "codec-encoders", "container-probing"]
  },
  "codec-encoders": {
    s: "The software and hardware encoders for each video and audio codec, configured for quality, speed and compatibility, and tracking which devices can decode which codec.",
    d: "Several generations of codec are maintained: a universally supported one, a more efficient one, and the newest, which saves bandwidth but takes far more compute and decodes only on newer devices. Presets trade encode time for efficiency. Settings control keyframe spacing, so segments align across renditions, and color metadata for high dynamic range. Hard because each codec adds renditions to encode, store and test, and device support is uneven and changes slowly.",
    k: ["Encode newest codec for all videos versus only popular ones: all videos maximizes savings; the compute and storage cost is wasted on rarely watched ones.", "Slow, high-efficiency presets versus fast presets: slow presets reduce bits delivered over every view; they multiply encode time and queue delay."],
    p: ["Keyframes are not aligned across renditions, so quality switches cause glitches or are impossible at segment boundaries.", "A new codec is served to devices that claim support but decode it poorly."],
    v: "Encode a reference set in each codec and play on a matrix of devices. Segment boundaries align across renditions, every device decodes without artifacts, and the efficient codec achieves its stated bitrate saving at equal quality.",
    dep: ["encoder-hardware-pool", "quality-scoring"]
  },
  "encoder-hardware-pool": {
    s: "The fleet of general-purpose machines and dedicated video encoding chips, with their capacity, power use and per-job cost, from which the scheduler draws.",
    d: "General processors run flexible software encoders with the best compression; dedicated video silicon encodes many streams per watt at somewhat lower efficiency, and graphics processors encode quickly for live. The pool is partitioned by capability, and workers advertise which codecs and presets they handle. Fleet size is planned against upload volume forecasts. Hard because hardware has long lead times, specialized chips fix codec choices at design time, and utilization has daily and event-driven peaks.",
    k: ["Custom encoding chips versus general processors: custom chips cut cost and power per stream sharply; they are inflexible when codecs and ratecontrol techniques change.", "Own fleet versus rented capacity: owned is cheapest at steady load; rented absorbs peaks without commitments but costs more per hour."],
    p: ["Specialized hardware cannot run a new codec preset, so all new-codec encodes fall back to scarce general machines.", "Capacity is sized for the average and the Monday upload peak delays everyone."],
    v: "Run the same job set on each hardware type and record throughput, power and quality. Costs per output hour match the plan, and the scheduler routes each job to a capable worker type.",
    dep: ["transcode-scheduler"]
  },
  "audio-normalization": {
    s: "Measures and adjusts loudness, encodes audio renditions and tracks, and reads speech for captions and fingerprinting, so videos play at consistent volume across the catalog.",
    d: "Audio is decoded, measured for integrated loudness and peak using a broadcast standard, and encoded in a few bitrates and channel layouts, with a stereo fallback. Rather than altering the signal, the platform often stores a gain value that the player applies, so original dynamics are preserved. Extra tracks such as dubs and descriptions are processed the same way. Hard because loudness preferences differ by content type and device, and clipping or phase problems in uploads must be handled gracefully.",
    k: ["Baking normalization into the audio versus a gain hint applied by the player: baking works everywhere; hints preserve the original but need player support and are ignored on some devices.", "Aggressive loudness targets versus gentle: aggressive gives uniform volume across videos; it flattens music and quiet content."],
    p: ["Normalization boosts a quiet recording and amplifies noise or distorts clipped peaks.", "Surround layouts are downmixed incorrectly and dialogue becomes inaudible on stereo devices."],
    v: "Process a set of clips at very different loudness levels. Measured integrated loudness falls within tolerance of the target after the gain is applied, and the stereo downmix keeps dialogue intelligible.",
    dep: ["container-probing", "transcode-scheduler"]
  },
  "segmenting-and-packaging": {
    s: "Cuts encoded streams into a few seconds of independently fetchable segments, writes the manifests that list them, and applies encryption, so any player can stream them over plain HTTP.",
    d: "Encoded renditions are repackaged into segment files in one or more standard container formats, aligned on keyframes with fixed duration. Manifests list renditions, tracks and segment URLs. Packaging may encrypt segments, add ad markers and produce one set of media files that serves several streaming protocols. Hard because segment boundaries must align across renditions for switching, naming must be stable and cacheable, and a packaging defect breaks playback for every viewer of that video.",
    k: ["Short segments versus long: short segments allow quick quality switches and low live latency; they multiply requests, manifest size and cache entries.", "Pre-packaged files versus packaging on request: pre-packaged files are simple and fast to serve; on request saves storage and supports many formats but adds compute at the origin."],
    p: ["A mismatch in segment durations between renditions causes visible hiccups when the player switches quality.", "A manifest is published before all its segments are in storage, giving viewers 404 errors."],
    v: "Package a test video and run an automated conformance validator, then play it in each target player. Segments align across renditions, every manifest URL resolves, and encrypted output plays only with a valid license.",
    dep: ["codec-encoders", "chunked-parallel-encode", "object-store"]
  },
  "quality-scoring": {
    s: "Computes objective and perceptual quality scores for each rendition, to choose ladders, compare encoders and detect broken outputs before publishing.",
    d: "Reference-based metrics compare each rendition with the source frame by frame; perceptual metrics approximate human judgment. Scores are used to tune encoder presets and the ladder, and as a gate: an output with a very low score or wrong duration is rejected and re-encoded. Sampling keeps cost manageable. Hard because no metric perfectly matches viewer perception, scoring is itself compute-heavy, and optimizing hard for one metric can degrade appearance in ways it does not see.",
    k: ["Score every rendition fully versus sample frames: full scoring catches local defects; sampling costs a fraction and can miss a short corrupted section.", "Single metric versus a panel of metrics: one metric is simple to optimize; a panel resists gaming at higher compute cost and harder interpretation."],
    p: ["Encoders tuned to maximize a metric produce a look viewers dislike despite high scores.", "Sampling skips a corrupted section and the broken video is published."],
    v: "Run scoring on known good and deliberately corrupted renditions. Corrupted ones fall below the gate and are re-encoded, good ones pass, and scores correlate with a small panel of human ratings above the target.",
    dep: ["codec-encoders", "container-probing"]
  },
  "live-ingest": {
    s: "Servers that accept a creator's continuous stream over a contribution protocol, authenticate the stream key, and hand the feed to live processing with failover to a backup.",
    d: "Encoders on the creator side push video using a low-latency contribution protocol or a standard web real-time transport. Ingest points are spread geographically, and a router directs each creator to a nearby one. The server checks the stream key and account standing, validates codec settings, and forwards the stream to transcoding. Hard because creators' uplinks are poor and unstable, streams must reconnect without breaking the broadcast, and leaked stream keys let strangers broadcast.",
    k: ["Contribution over a reliable stream protocol versus an error-correcting low-latency protocol: reliable protocols are widely supported and simple; they stall under loss while error-correcting ones keep latency steady.", "Backup ingest in a second region versus single: backup survives a site failure; it doubles encoder bandwidth and complicates stream switching."],
    p: ["A leaked stream key is used to broadcast unauthorized content under the creator's channel.", "A reconnect creates a second session and viewers see a frozen or duplicated stream."],
    v: "Stream from an encoder through impaired networks and kill the primary ingest point. The broadcast recovers on the backup within the target seconds, and a wrong stream key is rejected immediately.",
    dep: ["live-transcode", "request-routing", "upload-quotas"]
  },
  "live-transcode": {
    s: "Converts the incoming live feed into several renditions in real time with strict per-frame time limits, favoring speed and stability over best compression.",
    d: "Each stream needs a dedicated session on encoders running at or faster than real time. Settings use short keyframe intervals, limited look-ahead and constant-ish bitrate to bound latency. The system must reproduce the same renditions on a standby worker without gaps if a machine fails. Often only popular streams get the full ladder; smaller ones get fewer renditions. Hard because encoding cannot be retried, load cannot be predicted when a stream goes viral, and a single stall is seen by all viewers at once.",
    k: ["Full ladder for every stream versus on-demand renditions for popular ones: full ladder is simple and instant; on-demand saves large amounts of compute on the many streams few people watch.", "Redundant parallel encodes versus failover on demand: parallel encodes give seamless recovery at double cost; failover is cheaper but visibly interrupts."],
    p: ["A sudden burst of new streams exhausts encoder capacity and starts degrading all of them.", "Timestamps differ between the primary and backup encodes, so failover causes a jump."],
    v: "Run many concurrent test streams and kill an encoder. Output stays within the real-time budget, renditions keep aligned timestamps, and failover completes within the target with no more than a stated frame gap.",
    dep: ["live-ingest", "codec-encoders", "encoder-hardware-pool"]
  },
  "live-packager": {
    s: "Continuously cuts live renditions into segments and maintains a rolling manifest, with optional encryption and ad markers, so players can follow the stream.",
    d: "The packager receives encoded frames and writes short segments or partial segments, updating the live manifest as each is ready. It tracks a sliding window and a longer archive for rewind. It inserts markers for ad breaks and signals discontinuities. Several packagers run in redundancy so a viewer can fetch from either. Hard because manifest and segment timing must be exactly consistent between redundant packagers, and tiny timing errors accumulate over a stream that may run for many hours.",
    k: ["Short segments versus partial segments for low latency: short segments are broadly compatible; partial segments reduce delay but need newer players and more requests.", "Window of a few minutes in the manifest versus longer: short windows keep manifests small and cacheable; long windows allow rewinding at the cost of bigger documents."],
    p: ["Clock drift between redundant packagers produces mismatched segment numbering and playback errors on failover.", "The manifest update lags segment creation and players request segments that do not exist yet."],
    v: "Run a stream for many hours with two packagers, switching between them. Segment numbering and timestamps stay consistent, players see no discontinuity at the switch, and manifest updates stay within one segment duration.",
    dep: ["live-transcode", "segmenting-and-packaging", "object-store"]
  },
  "low-latency-delivery": {
    s: "The techniques that reduce delay between camera and viewer to a few seconds: chunked transfer, partial segments, blocking manifest requests, edge-side hold of requests and shorter buffers.",
    d: "The player requests the next partial segment before it exists, and the edge holds the request until the packager publishes it, then streams bytes as they are produced. Players run with a small buffer, relying on accurate bandwidth estimation and fast switching. Edge caches coalesce thousands of identical waiting requests into one origin request. Hard because every part of the chain must cooperate, shorter buffers leave less margin against jitter, and caches that do not understand the protocol break it.",
    k: ["Latency of a few seconds versus ten to thirty: low latency enables interaction and fewer spoilers; larger buffers give smoother playback and use cheaper standard caching.", "Selectable low-latency mode versus always on: selectable lets viewers on poor networks keep a safe buffer; always on simplifies operations but hurts them."],
    p: ["An intermediate cache buffers whole segments before forwarding and removes the latency benefit.", "Small buffers cause constant rebuffering on mobile networks that previously played fine with long delay."],
    v: "Measure glass-to-glass delay with an embedded timestamp across regions under normal and impaired networks. Median delay meets the target, rebuffering ratio stays under its limit, and a high-delay mode remains available.",
    dep: ["live-packager", "edge-caches", "abr-controller", "buffer-manager"]
  },
  "live-chat": {
    s: "A real-time message stream beside a live video, with rate limiting, moderation, emotes, badges and replay, delivered to many thousands of concurrent viewers.",
    d: "Messages are sent over persistent connections to chat servers that validate, filter and publish them to every connected viewer through fan-out trees. At high rates the system samples or batches messages so clients are not overwhelmed. Moderators and automated filters can delete messages, slow the room or restrict it to subscribers. Messages are stored for replay beside the recorded video. Hard because fan-out to hundreds of thousands of viewers is expensive, and moderation must act within seconds.",
    k: ["Show every message versus sample at high rates: showing all is fair to chatters; at scale it is unreadable and overloads clients, so sampling keeps the room usable.", "Pre-moderation versus post-moderation: pre-moderation blocks abuse before anyone sees it but kills the real-time feel; post-moderation is live and relies on fast removal."],
    p: ["A raid of bot accounts floods chat faster than moderators and filters can remove it.", "Deleted messages persist in the replay and are shown on the recording afterward."],
    v: "Simulate a chat of many thousands of connections with a spam burst. Message delivery stays within the target delay for a sampled share, spam is filtered or removed within seconds, and a deleted message is absent from replay.",
    dep: ["creator-moderation-tools", "policy-classifiers", "service-discovery"]
  },
  "dvr-and-live-to-vod": {
    s: "Lets viewers rewind a live stream while it runs and converts the finished broadcast into a normal video available for on-demand viewing.",
    d: "Live segments are written to storage as they are produced and indexed, so the manifest can offer an expanding or sliding window. When the stream ends, the system stitches the recorded segments into a regular video, optionally re-encodes it with the standard ladder and better settings, and runs the usual safety checks on it. Hard because the recorded stream has gaps, resets and ad breaks that must be cleaned up, and because policy checks on live content are never complete in real time.",
    k: ["Reuse live renditions for the replay versus re-encode: reuse makes the replay available instantly; re-encoding gives better quality and a clean ladder after a delay.", "Keep every live segment versus only a window: keeping everything enables full replays; deleting the older ones saves storage for streams that nobody replays."],
    p: ["A stream that dropped and reconnected produces a replay with timestamp jumps that break seeking.", "A violating segment aired live is not caught until the replay is processed and is public in the meantime."],
    v: "Run a long test stream with a dropped connection and an ad break, then end it. The replay appears within the target time, plays continuously with working seek, and goes through the standard safety checks.",
    dep: ["live-packager", "object-store", "ingest-queue", "policy-classifiers"]
  },
  "stream-health": {
    s: "Monitors each live stream's incoming bitrate, frame rate, dropped frames, latency and viewer-side errors, and alerts the creator and operators when quality degrades.",
    d: "Ingest, transcoder and player data are combined into a per-stream health view with thresholds. The creator's dashboard warns of unstable uplinks and suggests lower bitrate. Operators watch fleet-level health and error rates by region and ingest point. Automated rules can restart sessions or reroute streams. Hard because the signal is noisy, a single bad stream must be separated from a failing region, and the data has to be fresh within seconds to be useful.",
    k: ["Alerting the creator versus acting automatically: alerts keep creators in control; automatic bitrate or route changes fix problems faster but can surprise them.", "Per-stream monitoring versus fleet aggregates: per-stream catches individual failures; aggregates reveal systemic problems but hide small ones."],
    p: ["Health data arrives after the problem has ended, so alerts are always late.", "A regional ingest problem is blamed on creators because per-stream alerts fire without a fleet-level view."],
    v: "Degrade a test stream's uplink and then an ingest region. The creator sees a warning within seconds, operators see a regional alert distinct from per-stream ones, and recovery clears both.",
    dep: ["live-ingest", "qoe-metrics", "observability"]
  },
});
