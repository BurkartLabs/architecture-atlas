// Details for the media pipeline plate, part 1: playback control, transcoding farm, adaptive streaming, content protection.
ATLAS.details("media-pipeline", {
  "player-state-machine": {
    s: "The explicit set of playback states and the legal transitions between them, which keeps asynchronous pipeline events from leaving the player in a contradictory state.",
    d: "States typically include idle, preparing, buffering, ready, playing, paused, seeking, ended and error. User commands and pipeline events such as first frame, underrun, end of stream and device loss are both inputs. Transitions are processed on one serial context so commands cannot interleave with events. Pending commands are queued: a seek issued during preparation runs after it. The difficulty is that the pipeline is asynchronous. A pause may arrive while a seek is in flight, and the player must decide which wins.",
    k: ["Single serial command queue vs. direct calls into the pipeline: one ordering makes races reproducible, at the cost of added latency and a risk of blocking on slow stages.", "Separate user-intended state from actual pipeline state: the interface stays stable during buffering, but the two must be reconciled whenever they disagree."],
    p: ["Treating buffering as a failure path drops queued commands, so a seek during an underrun is silently ignored.", "Reporting playing before the first frame is on screen makes progress bars move over a black picture."],
    v: "Issue play, seek, pause and play again within 50 ms against a slow source and confirm the state log shows each legal transition once, ending in playing at the last seek target.",
    dep: ["graph-lifecycle", "pipeline-thread-model"]
  },
  "transport-controls": {
    s: "The operations a user performs on playback: play, pause, stop, rate change, step by frame and volume, each mapped to concrete pipeline actions.",
    d: "Each control becomes a change on the graph and the clock. Pause freezes the media clock and holds the last frame; play resumes it, usually after prerolling so that the first frame and the first audio sample are ready together. Rate changes alter the clock speed and may need audio time stretch or muting, and trick modes such as fast forward often decode only key frames. Frame stepping needs a decoded frame queue that can advance one entry at a time. The hard part is making each action feel instant while stages still hold buffered data from the old state.",
    k: ["Flush buffers on every control change vs. drain them: flushing responds instantly but throws away decode work, while draining is smooth but delays the visible result.", "Trick play from key frames only vs. full decode at higher rate: key frames are cheap at any speed, but motion looks choppy and audio is lost."],
    p: ["Pausing without holding the clock lets the position creep forward, so resume jumps ahead by the paused time.", "Applying a rate change to the clock but not to audio produces pitch shift or a growing sync error."],
    v: "Pause for ten seconds on a known frame, confirm the displayed frame and reported position do not change, then resume and confirm the next presented timestamp follows the paused one with no skip.",
    dep: ["media-clock", "player-state-machine", "time-stretch"]
  },
  "seek-controller": {
    s: "Turns a requested target time into the precise sequence of index lookup, flush, decode-from-keyframe and discard that lands on the right frame.",
    d: "A seek asks the demuxer for the nearest earlier key frame, flushes every queue and decoder, restarts the clock at the target and decodes forward, discarding output before the target. The controller distinguishes accurate seeks, which show exactly the requested frame, from fast seeks that stop at the key frame. Seeks arrive in bursts while a user drags a slider, so stale ones are cancelled. For streaming sources the controller may also pick a segment and request it over the network. Hardest are audio and video landing together and reference frames that precede the key frame.",
    k: ["Accurate seek vs. fast seek: accurate decodes and discards up to a full GOP of frames, which is slow on long GOPs, while fast shows a frame near the target.", "Cancel superseded seeks vs. complete each one: cancelling keeps scrubbing responsive, but each cancel needs a clean abort path through every stage."],
    p: ["Not flushing the audio path after a seek plays a short burst of old audio.", "Dropping frames before the target by arrival rather than timestamp shows a wrong frame when the stream has reordered output."],
    v: "Seek to ten arbitrary timestamps in a clip with long GOPs and confirm the first presented frame's timestamp is within one frame duration of each target and audio resumes without a click.",
    dep: ["seek-index", "frame-types-gop", "buffering-watermarks", "player-state-machine"]
  },
  "track-selection": {
    s: "Chooses which audio, video and subtitle streams to decode and present, based on user preference, language, device capability and what the source offers.",
    d: "A source may contain several audio languages, commentary, alternative camera angles and many subtitle tracks. The selector filters by what the device can decode, ranks the rest by user and system preferences such as language, channel count and accessibility needs, and applies the choice by enabling the matching demuxer streams and graph branches. Switching during playback means building a new branch, aligning it to the current clock and cutting over cleanly. In adaptive streaming it also picks the rendition group. The challenge is making the switch without a gap or a repeated word.",
    k: ["Decode only selected tracks vs. decode all and mute: selecting saves compute and memory, but switching needs a rebuild and resync, while muting switches instantly.", "Preference rules by language tag vs. explicit user choice only: rules give a good first experience, but surprise users when a default track is wrong."],
    p: ["Selecting by index rather than a stable identifier picks the wrong track after the source reorders its streams.", "A track the decoder cannot handle gets chosen as default and playback starts silent."],
    v: "Play a file with three audio languages, switch from the first to the third mid-scene and confirm the new audio starts at the current position with no overlap and no more than one frame of A/V offset.",
    dep: ["demuxer", "pipeline-graph", "dynamic-reconfiguration", "hw-capability-probe"]
  },
  "playlist-and-gapless": {
    s: "Sequences several items for one continuous experience, preparing the next item ahead of time so the transition shows no gap in picture or sound.",
    d: "A queue of items is resolved one ahead of the current. The next item's source is opened, probed and its decoders primed while the current plays. At the boundary the clock continues with a timestamp offset so output is contiguous. True gapless audio also needs encoder delay and padding trimmed using values from container metadata, otherwise a few tens of milliseconds of silence appear between tracks. Mixed formats force a resampler or renderer reconfiguration at the boundary. Preparing early costs memory and a second decoder, so how far ahead to prepare is a budget decision.",
    k: ["Prepare the next item early vs. on demand: early preparation hides latency but holds a second set of decoders and buffers, which can exhaust hardware decoder slots.", "Continuous clock with an offset vs. a restart per item: the offset keeps outputs unbroken, but timestamps from different items must never be compared directly."],
    p: ["Ignoring encoder delay metadata leaves audible gaps between tracks of a continuous album.", "Preparing the next item with a hardware decoder can fail on devices that allow only one session, and the boundary stalls."],
    v: "Play two consecutive tracks of a continuous recording and confirm the waveform across the boundary has no inserted silence and the second item's first frame follows within one frame period.",
    dep: ["container-metadata", "timestamps-time-bases", "resampler", "media-clock"]
  },
  "playback-diagnostics": {
    s: "Counters and event logs describing what playback actually did: startup time, rebuffer count, dropped frames, bitrate switches and decode errors.",
    d: "The player records timings from the load request to the first frame, every stall with its duration, the rendition in use over time, frames decoded, dropped and presented, and errors with their stage. Samples are aggregated and sent to a collection service so operators can see problems that never appear in the lab. Locally, an overlay shows buffer level, current bitrate and clock skew. The hard part is defining metrics identically across platforms and not letting collection itself add load or leak private data.",
    k: ["Client-side metrics vs. server-side logs only: client metrics see stalls and dropped frames the server cannot, but need privacy review and a sampling policy.", "Event stream vs. pre-aggregated counters: events allow later re-analysis, while counters are cheaper to upload and store."],
    p: ["Counting a seek-induced wait as a rebuffer inflates stall rates and sends engineers after a non-problem.", "Reporting only averages hides the long tail of sessions that never start."],
    v: "Throttle the network in a test session to force one stall and one downswitch, then confirm the report shows exactly one rebuffer event with its duration and one bitrate change at the right time.",
    dep: ["packet-and-frame-types", "abr-algorithm", "video-renderer"]
  },
  "job-scheduler": {
    s: "Assigns transcoding jobs and their chunks to machines by priority, deadline, hardware type and cost, and retries what fails.",
    d: "Uploads create a job graph: probe, split, encode each rendition, quality check, package, publish. The scheduler holds a priority queue where live-adjacent and premium content jumps ahead of backlog. It matches tasks to workers by capability: some have hardware encoders, some have large memory for high-resolution software encodes. It tracks heartbeats, requeues work from lost workers and keeps results idempotent so a retry cannot publish twice. The difficulty is mixed workloads: short urgent jobs behind long ones, and costly retries of nearly finished encodes.",
    k: ["Priority queue with preemption vs. run-to-completion: preemption protects urgent work but discards partial encodes unless chunks checkpoint.", "Central scheduler vs. workers pulling from queues: central gives global optimization, while pulling scales simply and avoids a single bottleneck."],
    p: ["Retrying a deterministic failure such as a corrupt input forever burns compute without ever finishing.", "A task that reports success before its output is durably stored publishes missing segments."],
    v: "Submit one urgent and fifty backlog jobs, kill a worker mid-encode and confirm the urgent job completes first, the lost chunk reruns on another worker and the final output has exactly one copy of each segment.",
    dep: ["chunked-parallel-encode", "farm-autoscaling", "hw-capability-probe"]
  },
  "ladder-design": {
    s: "Chooses the set of resolution and bitrate pairs, the rungs, offered to clients so each network and screen has a suitable rendition.",
    d: "A ladder lists renditions from a low-bitrate small picture up to the highest quality, with spacing so each step is a noticeable but not jarring improvement, often a bitrate ratio near 1.5 between rungs. Design considers target devices, codec efficiency, audio renditions and the cost of storing and caching every rung. A fixed ladder is simple but wasteful: simple content looks perfect at low rates while complex content looks poor at the same rung. Too many rungs cost storage and fragment cache hits; too few cause visible quality jumps.",
    k: ["Fixed ladder for all titles vs. content-adaptive ladder: fixed is predictable and cache-friendly, while adaptive saves bandwidth but multiplies encoding and testing effort.", "Many fine-grained rungs vs. few coarse rungs: fine steps match bandwidth closely, but increase storage, cache fragmentation and switching frequency."],
    p: ["Offering a top rung that most devices cannot decode wastes storage and causes startup failures on clients that choose it.", "Rungs spaced unevenly leave a bandwidth range with no good option and constant oscillation."],
    v: "Plot delivered quality score against bitrate for a sample of titles and confirm every adjacent pair of rungs differs by at least a perceptible score step and none is dominated by a lower-bitrate rung.",
    dep: ["objective-quality-scores", "video-encoder", "manifest-generation"]
  },
  "per-title-optimization": {
    s: "Runs trial encodes of each title at several settings and picks the ladder and parameters that give the best quality per bit for that content.",
    d: "The farm encodes samples or the whole title at a grid of resolutions and quantizer or rate targets, measures each with an objective score, and finds the convex hull of quality against bitrate. Rungs are then chosen along the hull at target quality levels. Shot-level variants repeat this per scene so a static scene gets less bitrate than an action scene. The outcome is a title-specific ladder and per-chunk settings. It is costly: many trial encodes precede the real one, so the saving is only worth it for titles with enough viewing.",
    k: ["Per-title vs. per-shot optimization: per-shot extracts more savings but requires scene detection, stitching constraints and many more trial encodes.", "Optimize for every title vs. only popular ones: universal use spends compute on titles nobody watches, while selective use needs a popularity prediction."],
    p: ["Optimizing against one quality metric can overfit it, giving good scores on screens where viewers see artifacts.", "Per-shot settings that change reference structure at chunk boundaries produce visible pulses where segments join."],
    v: "Encode a test set both with the fixed ladder and the optimized one, and confirm at matched quality score the optimized version uses fewer total bits on most titles, with a viewing check on the worst case.",
    dep: ["objective-quality-scores", "ladder-design", "rate-control", "job-scheduler"]
  },
  "chunked-parallel-encode": {
    s: "Splits a long video at scene or key-frame boundaries, encodes the pieces on many machines at once and joins them into one seamless stream.",
    d: "A splitter cuts the master at points where reference chains can restart, usually scene cuts, producing chunks of tens of seconds. Each chunk is encoded independently, starting with a key frame, so wall-clock time scales with machines rather than duration. A concatenation stage restores continuous timestamps and verifies parameter sets match. Rate control must be coordinated: independent chunks each guess their own budget, so a two-pass or shared complexity estimate keeps bitrate and quality consistent. Joins are the weak point where buffer models and audio alignment can break.",
    k: ["Chunk at scene cuts vs. at fixed intervals: scene cuts hide the forced key frame, while fixed intervals are predictable for scheduling and segment alignment.", "Independent chunk rate control vs. a shared budget: independence is simple, but quality and bitrate vary between chunks without a global plan."],
    p: ["Chunks encoded with differing parameter sets cannot be concatenated, and the join fails at playback rather than at build time.", "Audio encoded per chunk adds priming gaps at every join."],
    v: "Encode a ninety-minute title in chunks, play across every join and confirm continuous timestamps, no decoder resets and bitrate per chunk within the budgeted tolerance.",
    dep: ["frame-types-gop", "rate-control", "muxer", "job-scheduler"]
  },
  "objective-quality-scores": {
    s: "Computes numbers such as a perceptual fusion score, structural similarity or peak signal-to-noise ratio that estimate how much an encode differs from its source.",
    d: "Full-reference metrics compare each decoded frame to the aligned source frame after scaling to a common resolution. Simple metrics such as peak signal-to-noise ratio are cheap but track viewer opinion loosely. Perceptual metrics combine several features and are trained against subjective ratings, giving a score per frame that is pooled across the clip. The metric must see exactly the same frame alignment, color range and cropping as the source, or the score is meaningless. Computing it costs nearly as much as decoding both streams, so farms often sample.",
    k: ["Cheap signal metric vs. trained perceptual metric: the cheap one is fast and deterministic, while the perceptual one correlates better with viewers but costs more and has known blind spots.", "Mean pooling vs. worst-percentile pooling: the mean hides short bad scenes that viewers remember; percentiles expose them but are noisier."],
    p: ["Frame misalignment by one frame produces a very low score for a perfectly good encode.", "Comparing in the wrong color range or after unmatched scaling inflates or deflates scores by more than the difference being measured."],
    v: "Score an encode against its source, then insert a one-frame offset and confirm the tool flags the misalignment or the score visibly drops, and that a known blurred copy scores below the original encode.",
    dep: ["video-decoder", "scaler", "color-spaces"]
  },
  "quality-gates": {
    s: "Automated checks that block a rendition from publishing when its quality score, bitrate, conformance or sync falls outside agreed limits.",
    d: "After encoding, a verifier runs a set of checks: minimum quality score per rung, a bound on the lowest scoring scene, bitrate and buffer model conformance, correct segment durations, audio and video duration match, and a decode test of every segment. Failures route the job back for re-encode with adjusted settings or to human review. Gates also catch regressions when an encoder version changes, by encoding a fixed set of clips and comparing against stored baselines. The balance is strictness: a gate that fails too often stalls releases, one that never fails protects nothing.",
    k: ["Block on any failure vs. warn and publish: blocking protects viewers, but delays content and needs an owner for every failure.", "Fixed thresholds vs. thresholds relative to a stored baseline: fixed limits are easy to explain, while baselines catch regressions on content where absolute scores differ."],
    p: ["Checking only the first minute misses defects deep in the title such as a corrupt segment.", "Thresholds tuned on a sample set reject legitimate animation or grainy film that scores differently."],
    v: "Feed the pipeline a deliberately corrupted segment and a rendition below the minimum score and confirm both are blocked with a reason, while a known-good rendition publishes.",
    dep: ["objective-quality-scores", "segmenter-packager", "video-decoder"]
  },
  "farm-autoscaling": {
    s: "Grows and shrinks the pool of encoding machines with queue depth and deadlines, balancing cost against how soon content is ready.",
    d: "Encoding demand is bursty: a release day brings thousands of jobs, a weekend brings few. The autoscaler watches queue depth, the estimated remaining work in machine-hours and deadlines, and requests or releases workers. Cheaper interruptible machines handle chunks that can be retried; steady reserved capacity handles urgent work. Hardware encoders and software encoders are scaled as separate pools. Scale-down must wait for in-flight chunks to finish or checkpoint. The hard part is lead time: machines take minutes to start, so scaling by current load is always late.",
    k: ["Interruptible capacity vs. reserved capacity: interruptible is much cheaper, but interrupted chunks waste work and need retry-safe design.", "Scale on queue length vs. scale on predicted work: length is easy to measure, while estimated work accounts for job size but depends on a good duration model."],
    p: ["Scaling down while chunks are mid-encode throws away their work and triggers a retry storm.", "A pool tuned for software encodes starves when a codec switch moves load onto a small hardware pool."],
    v: "Submit a burst ten times the usual load and confirm workers scale up before the deadline of the oldest job, no chunk is lost on scale-down and the pool returns to baseline when the queue empties.",
    dep: ["job-scheduler", "hw-capability-probe"]
  },
  "segmenter-packager": {
    s: "Cuts encoded streams into short, independently decodable segments and wraps them in the container format a streaming client expects.",
    d: "Segments start at key frames so any can be decoded alone, and all renditions share the same boundaries so a client can switch at a segment edge. The packager rewrites the encoded stream into segment containers with their own headers and timing, or into a shared initialization segment plus small fragments. Duration is a trade-off: a few seconds balances switching speed and overhead. The same encoded data can be packaged for several delivery formats without re-encoding. Alignment across renditions and across audio and video is the hard part.",
    k: ["Short segments vs. long segments: short ones switch quality quickly and cut live latency but multiply requests and header overhead; long ones are efficient but slow to adapt.", "Package per delivery format vs. one common container: one format simplifies storage, but some clients still need a manifest and container of their own."],
    p: ["Renditions with key frames at different times prevent seamless switching and show glitches at every switch.", "Segment timestamps that drift from the wall clock accumulate until live players fall off the window."],
    v: "Package a four-rendition title and confirm every segment starts with a key frame, boundaries match across renditions to within one sample, and a client can play a stream that switches rendition at every segment.",
    dep: ["muxer", "frame-types-gop", "timestamps-time-bases", "manifest-generation"]
  },
  "manifest-generation": {
    s: "Writes the playlist or description file that lists renditions, tracks, segment locations and timing so a client can choose and fetch media.",
    d: "The manifest names each video, audio and subtitle rendition with its codec string, resolution, bandwidth and language, and gives either a template or an explicit list of segment addresses and durations. For live streams it is regenerated or updated as segments appear, with a sliding window. Codec strings and bandwidth numbers are used by clients to filter what they can play and to pick a start rendition, so errors here break playback on specific devices. The difficulty is correctness over time: the live manifest must always point only at segments that already exist.",
    k: ["Explicit segment lists vs. templates with a duration: lists describe irregular segments exactly, while templates are compact and cache-friendly but assume regular timing.", "One manifest per delivery format vs. a unified description rendered per client: unified avoids drift between formats, but needs a translation layer to maintain."],
    p: ["Advertising a segment before it is fully written makes clients fetch a truncated file.", "Wrong codec profile strings in the manifest make capable devices skip a rendition or incapable ones try it."],
    v: "Fetch the manifest of a live stream every second for a minute and confirm every listed segment returns completely when requested, and the window advances by exactly the segments produced.",
    dep: ["segmenter-packager", "ladder-design", "container-metadata"]
  },
  "abr-algorithm": {
    s: "The client logic that picks which rendition to fetch for each segment, using measured throughput and buffer level to avoid both stalls and needless quality drops.",
    d: "Before each request the algorithm estimates available bandwidth, reads the buffer level and chooses a rendition whose bitrate fits. Throughput-based rules choose the highest bitrate below the estimate scaled by a safety factor. Buffer-based rules ignore the estimate and move up when the buffer is full, down when it drains. Hybrids combine them with a startup phase and a panic mode. It also limits switching frequency and respects resolution caps for the display. It is hard because estimates are noisy, segments of one rendition vary in size and a wrong choice shows up seconds later.",
    k: ["Throughput-based vs. buffer-based selection: throughput reacts fast but is fooled by bursty links, while buffer-based is stable but slow to ramp up from empty.", "Aggressive up-switching vs. conservative: aggressive reaches high quality early, but risks stalls when bandwidth dips; conservative wastes capacity for longer."],
    p: ["Estimating throughput from small segments or from cache hits overstates bandwidth and picks a rung the link cannot sustain.", "Switching on every segment makes quality flicker, which viewers dislike more than a steady lower rung."],
    v: "Replay a recorded bandwidth trace with a drop to 40 percent and a recovery, and confirm the player downswitches before the buffer empties, records no stall, and upswitches within a bounded number of segments after recovery.",
    dep: ["throughput-estimator", "buffering-watermarks", "manifest-generation"]
  },
  "throughput-estimator": {
    s: "Measures how fast media is actually downloading and smooths it into the estimate the rendition chooser uses.",
    d: "Each segment download yields bytes and elapsed time from first byte to last. Idle gaps between requests and time to first byte are excluded or accounted separately. Samples are combined with an average, usually weighted so recent samples count more, with different weights for rising and falling values, or with a harmonic mean to resist spikes. Concurrent requests for audio and video share the link and must be accounted for together. Streaming responses can be sampled during download. The hard part is that a request that never fully uses the link measures the sender, not the network.",
    k: ["Fast-reacting vs. slow-reacting average: fast tracks real changes but passes noise to the rendition choice, while slow is smooth but late in a collapse.", "Per-request samples vs. samples taken during transfer: per-request is simple, while mid-transfer allows quicker reaction at the cost of more complex accounting."],
    p: ["Including connection setup and wait time in a small download makes a fast link look slow.", "A server that sends a segment from cache in a burst yields estimates that the network cannot repeat."],
    v: "Download segments over a link shaped to a fixed 4 Mbit per second and confirm the estimate settles within 10 percent of that value after a few segments and follows a step to 1 Mbit per second within a few more.",
    dep: ["protocol-handlers", "byte-io-layer"]
  },
  "live-ingest": {
    s: "Accepts a continuous stream from an encoder or camera over a contribution protocol and hands it to packaging with minimal added delay.",
    d: "A contributor pushes media over a connection-oriented or packet-based protocol with its own timestamps. The ingest server authenticates the sender, parses the stream, checks continuity of timestamps and key frames and writes into packaging and, optionally, a transcoding ladder. It must handle reconnects without breaking the output timeline, so a dropped encoder can resume without a discontinuity or with a marked one. Redundant ingest from two encoders provides failover. Challenges are clock differences between sender and server and deciding when a silent sender has actually gone away.",
    k: ["Accept and repackage vs. transcode on ingest: repackaging adds little delay but trusts the contributor's encode; transcoding controls quality at the price of latency and compute.", "Single ingest point vs. redundant paths: redundancy survives failures, but requires deduplication and agreed timestamps between feeds."],
    p: ["A contributor clock that runs fast fills buffers slowly until the live window overflows.", "Treating a short network gap as end of stream ends the broadcast for every viewer."],
    v: "Push a test stream, drop the connection for five seconds and reconnect, and confirm viewers see at most a short stall, timestamps stay monotonic or are marked discontinuous, and the stream continues.",
    dep: ["protocol-handlers", "stream-reassembly", "segmenter-packager", "jitter-buffer"]
  },
  "low-latency-streaming": {
    s: "Reduces glass-to-glass delay of live segmented streams to a few seconds by publishing partial segments and letting players request them before they are complete.",
    d: "Segments are split into small parts, perhaps a few hundred milliseconds each, published as soon as each is encoded. Players use chunked transfer to request the in-progress segment or a part list, receive data as it is produced and keep a small buffer close to the live edge. The packager, origin and cache must all support serving incomplete objects and blocking requests that wait for the next part. The ABR logic must work with a very small buffer, so there is little room for error. The difficulty is that every stage must add almost no delay.",
    k: ["Partial segments with a small buffer vs. standard segments: partial gets seconds of latency, but removes safety margin so stalls become more likely.", "Blocking requests at the origin vs. polling: blocking cuts delay and load, but ties up connections and complicates caches in front of the origin."],
    p: ["A cache layer that buffers a whole response before forwarding turns a low-latency stream into a normal one.", "Throughput estimation from tiny chunks sent at the encoder rate always reads the encode bitrate, never the link."],
    v: "Display a running clock in the source, play the stream and measure the clock difference on screen; confirm it stays within the target for ten minutes and the player's buffer never empties.",
    dep: ["segmenter-packager", "abr-algorithm", "low-latency-mode", "live-ingest"]
  },
  "live-window-and-dvr": {
    s: "Manages the sliding set of recent segments a live stream keeps available, so viewers can join at the edge or rewind within the retained window.",
    d: "The packager keeps a number of segments, advertises a window in the manifest and removes older ones from the manifest and, later, from storage. Players join slightly behind the live edge to leave room for buffering. A longer window enables rewind and pause on live content, and a recorded copy can be converted to on-demand when the event ends. Clients compute the live edge from timing information in the manifest and a wall clock. Problems are clock skew between client and server, and deleting segments that slow clients are still fetching.",
    k: ["Short window vs. long DVR window: short saves storage and keeps everyone near live, while long allows rewind but multiplies storage and cache footprint.", "Delete expired segments immediately vs. after a grace period: immediate saves space, but breaks slow clients that still reference them."],
    p: ["A client with a wrong clock computes a live edge in the past or future and requests missing segments.", "Removing segments from storage before the manifest drops them produces errors for fresh joiners."],
    v: "Run a live stream for an hour with a thirty minute window, rewind to twenty minutes back and confirm playback is continuous, then confirm segments older than the window return not found only after the grace period.",
    dep: ["manifest-generation", "segmenter-packager", "seek-controller"]
  },
  "encryption-and-key-exchange": {
    s: "Encrypts segments or samples with content keys and distributes those keys so only authorized clients can decrypt them.",
    d: "Media is encrypted with a symmetric cipher, either whole segments or only parts of each sample so headers and some data remain clear for parsing. Common schemes differ in cipher mode and in which bytes are encrypted, and clients support different ones. Key identifiers are carried in the manifest or container, and the client requests the key from a license service after proving its identity. Packaging may encrypt once for several key systems. Keys rotate for live streams. The challenge is that key distribution, not encryption, is where policy and failures sit.",
    k: ["Encrypt whole segments vs. selected sample bytes: whole is simple, while partial keeps parsing possible and cuts decrypt cost but needs codec-aware code.", "One key per title vs. per rendition or time period: one key is simple, while several limit damage from a leaked key and allow stricter policy per quality tier."],
    p: ["Encrypting with a mode or pattern a device does not support gives black video only on that device.", "Rotating keys without delivering the next key early causes a stall at every rotation."],
    v: "Package a title with two key identifiers, request play with and without a valid license and confirm the licensed client plays all segments while the unlicensed one fails at the key request, not at random later.",
    dep: ["segmenter-packager", "manifest-generation", "license-client"]
  },
  "license-client": {
    s: "The client component that requests, receives and enforces licenses: it proves device identity, obtains keys and applies rules such as expiry and output restrictions.",
    d: "On encountering encrypted content the player creates a session with the protection module, which produces a request containing the key identifiers and device credentials. The application forwards it to a license service and returns the response. The module decrypts the key internally and never shows it to the application. License rules may limit resolution, require protected outputs, set expiry and allow offline use. The module reports key status so the player can drop to a lower rendition when a rule forbids the current one. Difficulties are latency at start, offline renewal and handling revocation.",
    k: ["Fetch the license before playback vs. at first encrypted sample: early hides latency, but wastes requests for items never played.", "Enforce output restrictions by downgrading vs. by blocking: downgrading keeps playing, but blocking is simpler for content owners and more disruptive to viewers."],
    p: ["Treating a denied license as a network error causes endless retries instead of a clear message.", "Not renewing a license before expiry interrupts long playback or downloaded content."],
    v: "Start playback of protected content, expire the license server-side and confirm the player asks for renewal before the deadline or stops with a clear license error, never with silent black video.",
    dep: ["encryption-and-key-exchange", "secure-decode-path", "protocol-handlers"]
  },
  "secure-decode-path": {
    s: "Decrypts and decodes protected samples inside a trusted environment so clear compressed or raw data is never available to the application or to screen capture.",
    d: "The protection module hands encrypted samples to a trusted decoder, which decrypts into protected memory, decodes there and sends frames to a display path that the normal operating system cannot read. The application sees opaque surfaces. The pipeline must connect stages that cannot be inspected, so filters that would read pixels, such as scalers or overlays, must run on the protected path or be skipped. This limits the effects available. Higher security levels apply only to hardware paths, often restricting resolution in software-only implementations.",
    k: ["Hardware protected path vs. software protection: hardware allows premium resolutions and is hard to bypass, but limits filters, devices and debugging.", "Composite overlays in protected memory vs. skip overlays: compositing keeps the interface, but needs hardware support that varies and can be missing."],
    p: ["A subtitle or watermark stage that reads frame pixels gets zeros or crashes on protected surfaces.", "Screenshots and recordings of the protected area show black, which users report as a defect."],
    v: "Play protected content with the screen capture feature running and confirm the captured frames show the protected region as blank while the display shows normal video and the application never receives readable pixel data.",
    dep: ["hw-decode", "zero-copy-surfaces", "license-client", "video-renderer"]
  },
});
