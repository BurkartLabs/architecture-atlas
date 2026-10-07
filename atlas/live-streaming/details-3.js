// Details for the live streaming plate, part 3: player, chat and interactivity, recording and clips.
ATLAS.details("live-streaming", {
  "manifest-fetch-loop": {
    s: "The player's cycle of loading the manifest, working out which segments exist, requesting them in order and refreshing the manifest again at the right moment.",
    d: "On start the player fetches the master manifest, picks a rendition, then repeatedly reloads the media manifest at an interval tied to segment duration, or issues blocking requests in low-latency mode. It computes the next segment to fetch from sequence numbers or time, handles gaps, retries failures against alternate addresses and tolerates redirects. It also reacts to changes such as discontinuities and ladder updates. It is hard because it is the only part that sees the origin's mistakes first: every inconsistency in a manifest becomes a player decision.",
    k: ["Poll on a timer vs blocking requests: simple and works everywhere, but polling adds up to a segment of delay and extra load.", "Retry quickly vs back off: fast retries recover from transient errors, but synchronized retries from many viewers worsen an outage."],
    p: ["Players all refresh at the same instant after a deploy and hammer the edge in synchronized bursts.", "A missing segment is retried forever on a stalled stream instead of skipping to the live edge."],
    v: "Run a test player against a stream with injected missing segments and a stale manifest. Confirm it recovers by retrying within its limit, skips ahead to the live edge, and logs each failure with its cause.",
    dep: ["hls-manifests","dash-manifests","buffer-controller","signed-urls"]
  },
  "abr-controller": {
    s: "The algorithm that picks which rendition to fetch next, based on measured throughput and buffer level, to maximize quality without running out of video.",
    d: "After each segment the controller estimates bandwidth from download time, smooths it, and combines it with buffer occupancy to choose the next rung. Throughput rules react quickly but are noisy; buffer-based rules are stable but slow to climb. In live, the buffer is small, so the controller has little room for error, and it must avoid changing quality too often. It must also account for device limits such as screen size and decoder capacity, and for CDN behavior that makes small downloads misleading estimates of speed.",
    k: ["Throughput-based vs buffer-based selection: throughput reacts faster, buffer-based is steadier, and most players blend them with different weights for live.", "Aggressive quality ups vs conservative: sharper images sooner, but a drop in bandwidth right after causes a stall."],
    p: ["Estimating bandwidth from short segments over a connection that bursts overestimates speed, so the player climbs and stalls.", "Frequent switching between rungs is more annoying than steady lower quality."],
    v: "Replay recorded bandwidth traces from congested mobile and Wi-Fi networks and confirm rebuffering ratio and switch count stay below the targets, and average quality is near the best sustainable rung.",
    dep: ["buffer-controller","abr-ladder","manifest-fetch-loop"]
  },
  "buffer-controller": {
    s: "Holds downloaded but unplayed media, decides how much to keep, and appends it to the decoder in order, so playback survives short network stalls.",
    d: "The buffer sits between the network and the decoder. Its target size is the central tradeoff in live: larger buffers absorb network problems, smaller ones lower delay. The controller appends segments to the media pipeline, removes played data to limit memory, and handles gaps and overlaps caused by timestamp issues. When the buffer empties, playback stalls and the viewer sees rebuffering. In low-latency mode the controller may hold under two seconds, so it adjusts playback rate slightly to recover or stay near the edge.",
    k: ["Large buffer vs small: resilient to jitter, against seconds of extra delay behind the live edge.", "Skip gaps automatically vs wait for data: gap-skipping avoids freezes from tiny timing holes, but can hide a real missing segment."],
    p: ["Small timing overlaps between segments create a stall at every boundary on some devices.", "Memory limits on weak devices force early eviction and stutter when the player seeks back."],
    v: "Play a stream through an artificial 5-second network outage and confirm the buffer drains, playback continues for the buffered amount, rebuffering is reported when it empties, and recovery returns to the live edge.",
    dep: ["media-decode-path","manifest-fetch-loop","device-compat-layer"]
  },
  "live-edge-sync": {
    s: "Keeps playback at a chosen distance behind the live edge, and moves a viewer who has drifted back toward it by adjusting speed or jumping.",
    d: "Viewers can end up behind real time after stalls, tab backgrounding or slow joins. The player knows the live edge from the manifest or a clock and compares it to the playback position. To catch up it plays slightly faster, usually a few percent, which is rarely noticeable, or seeks forward when far behind. It also targets a consistent delay so viewers watching together stay close, which matters for chat and shared events. Its challenge is stability: aggressive catch-up conflicts with the buffer controller and causes new stalls.",
    k: ["Speed up gradually vs seek to the edge: unnoticeable catch-up, though it takes longer and pitch changes can be heard, against an immediate but visible jump.", "Target a fixed delay vs minimum possible: consistent viewers and fewer stalls, against being further from real time than needed."],
    p: ["Catch-up speed pushes the player into an empty buffer, causing a stall that increases the drift again.", "A background tab throttles timers, so the player falls minutes behind and does not recover automatically."],
    v: "Pause playback for 20 seconds then resume and confirm the player returns to within its target of the live edge within a stated time, without a stall, using only speed adjustment for gaps under the threshold.",
    dep: ["buffer-controller","clock-and-timecode","latency-tiers"]
  },
  "startup-logic": {
    s: "Everything that happens between pressing play and the first frame: choosing an initial rendition, fetching the manifest and first segments, and decoding enough to show video.",
    d: "Join time is a major quality measure, and live adds problems: the player must find the live edge, choose a first rung without bandwidth history, and wait for a keyframe. Common tactics start on a low or middle rendition to show a picture quickly, then climb; preconnect to the CDN; cache the license and manifest; and begin with only one segment buffered. Each shortcut trades a fast start against a worse first seconds. Abandonment rises sharply with every second of waiting, so it is measured closely.",
    k: ["Start on a low rung vs on an estimated sustainable one: quick first frame, against a blurry opening that viewers can see for a few seconds.", "Start with minimal buffer vs build safety first: faster join, but a higher chance of an early stall."],
    p: ["The player waits for a license before showing anything, adding a second or more to every encrypted start.", "Starting at the live edge with an empty buffer stalls immediately on slow connections."],
    v: "Measure time from play action to first frame across 1,000 sessions over varied network profiles, reported at median and 95th percentile, and compare with the target. Break the time down by phase.",
    dep: ["manifest-fetch-loop","abr-controller","drm-license-client","media-decode-path"]
  },
  "media-decode-path": {
    s: "Hands buffered media to the device's decoder and displays the result in sync with audio, using hardware decoding where available.",
    d: "Compressed segments are passed to the platform's media pipeline, which demultiplexes, decodes and renders. Hardware decoders are efficient but have strict limits on codec profile, resolution, frame rate and number of simultaneous streams. Software fallback is flexible but drains battery and may not hold frame rate. The player must handle decoder errors, resolution changes mid-stream, and audio-video synchronization when one stream is slower. Behavior varies between devices, which makes this the least predictable part of the system.",
    k: ["Hardware vs software decoding: efficiency and smooth high frame rates, against limits and device-specific bugs that software avoids.", "Newer efficient codecs vs universal ones: lower bandwidth where supported, but needs another ladder for all other devices."],
    p: ["A device decoder fails on a stream's profile and shows a black screen while audio plays.", "Switching resolution mid-stream triggers a decoder reset that freezes video for a second on some devices."],
    v: "On a matrix of target devices, play every rendition for ten minutes and confirm no decoder errors, frame rate within 2% of source, and audio-video offset within tolerance, recording any rungs a device cannot play.",
    dep: ["device-compat-layer","buffer-controller"]
  },
  "drm-license-client": {
    s: "The player component that requests decryption keys from the license service, proving the device and session are allowed, and passes them securely to the decoder.",
    d: "When the manifest names protected content, the player makes a license request through the device's secure module, sending a challenge and the viewer's authorization token. The license service checks entitlements and device security level, and returns a key bound to that device. Keys can expire and rotate, so the client renews them during long streams. Security levels matter: a hardware-backed module may unlock high resolutions while a software one is limited to lower ones. A slow or failing license call blocks playback completely.",
    k: ["Hardware-backed modules for high resolution vs software for reach: licensors require the first, but fewer devices qualify.", "Fetch the license before the first segment vs in parallel: parallel shortens start, but complicates error handling when the license fails."],
    p: ["A license server outage during a major event prevents every new viewer from starting.", "Key rotation arrives mid-stream and the client has not renewed, so playback freezes until it does."],
    v: "Start playback on devices at each security level and confirm license issue, resolution caps by level, renewal at rotation without visible interruption, and a clean error message when entitlement is denied.",
    dep: ["entitlements","content-encryption","identity-and-auth"]
  },
  "caption-rendering": {
    s: "Displays caption text tracks over the video with the viewer's chosen language, size and style, kept in step with the picture.",
    d: "The player loads text segments alongside video, parses cues with their timing and position, and draws them as an overlay or via the platform's native renderer. It supports viewer preferences for font, color and background, which accessibility rules often require. In live, cues arrive late relative to speech, and the player shows each as it arrives, sometimes rolling up lines. It must keep captions aligned after seeks and quality switches, and avoid covering burned-in graphics or controls.",
    k: ["Native platform renderer vs custom drawing: consistent with system accessibility settings, against less control over styling and placement.", "Show live captions immediately vs delay to match audio: immediate shows text late, while delaying the video adds latency for everyone."],
    p: ["Captions stay on screen after a rendition switch because the text track's timing was not realigned.", "Cue positions that cover the on-screen scoreboard or the player controls."],
    v: "Play a stream with known captions, change language and style, switch rendition and seek back, and confirm each cue is shown within 500 ms of its spoken words and the viewer's style choices persist.",
    dep: ["caption-extraction","buffer-controller"]
  },
  "player-beacons": {
    s: "Small telemetry messages sent from the player reporting startup time, stalls, quality, errors and playback position, which feed the platform's view of viewer experience.",
    d: "The player records events locally and sends them in batches to a collection endpoint, with a session identifier, the stream identifier, the rendition and delivering CDN. Beacons are the only direct source of what viewers experience, so they feed alerts, steering and quality dashboards. Volume is huge, so they are sampled or aggregated and sent at intervals, and they must use few resources and survive tab close. Beacons from broken players are often missing exactly when something is wrong.",
    k: ["Frequent beacons vs batched: faster detection of trouble, against more traffic and battery use on viewers' devices.", "Client-side aggregation vs raw events: smaller volume, but harder to debug a single session after the fact."],
    p: ["A beacon endpoint that shares the video CDN fails with it, and the platform goes blind during the outage.", "Sessions that crash before sending leave a survivorship bias, making quality look better than it is."],
    v: "Stall a test player and confirm a beacon with the stall start, duration, rendition and CDN reaches the pipeline within the target, and compare aggregated stall counts to a known number injected through a test.",
    dep: ["realtime-analytics","device-compat-layer"]
  },
  "device-compat-layer": {
    s: "The adaptation code that hides differences between browsers, phones, televisions and set-top boxes, which each support different codecs, APIs, memory limits and quirks.",
    d: "Viewer devices range from current phones to ten-year-old televisions. The compatibility layer detects capabilities, such as supported codecs, security levels and maximum resolution, and selects the delivery format, ladder subset and features that each device can use. It also contains workarounds for known bugs, which accumulate over time. A device matrix with automated tests is the only way to keep it honest. Every added workaround is a long-term cost, and devices that cannot be updated stay broken permanently.",
    k: ["Detect capabilities vs identify device models: capability detection generalizes to new devices, but models are the only way to avoid known bugs that lie about capabilities.", "Support old devices vs drop them: reach and revenue, against engineering effort and limits on features for everyone."],
    p: ["A workaround for one television's bug is applied too widely and degrades other devices.", "A device firmware update changes behavior and the compatibility entry silently stops working."],
    v: "Run the automated playback suite on each device in the matrix on every release and confirm start, quality switching, seek and recovery all pass, with new failures blocking release.",
    dep: []
  },
  "chat-gateway": {
    s: "The service that holds each viewer's long-lived connection for chat and pushes messages to it, authenticating users and attaching them to channel rooms.",
    d: "Viewers connect over a persistent socket protocol; the gateway authenticates the token, subscribes the connection to the channel's room, and forwards incoming messages to the chat backend. A single machine holds tens of thousands of connections, so it is built around event loops, small per-connection state and fast heartbeats to detect dead clients. The difficulty is reconnection: after a gateway failure or deploy, hundreds of thousands of clients reconnect at once, and the system must absorb that without cascading failure.",
    k: ["Persistent sockets vs polling: instant delivery and less overhead per message, but stateful servers and careful handling of reconnect storms.", "Gateway holds only connections vs also logic: stateless gateways scale and deploy easily, but every message needs another hop to a backend."],
    p: ["A gateway deploy drops all its connections, and clients reconnecting in lockstep overload the authentication service.", "Half-open connections accumulate because heartbeats are too infrequent, wasting memory and showing phantom viewers."],
    v: "Restart a gateway holding 50,000 connections and confirm clients reconnect with jittered delays, authentication latency stays within bounds, and all rooms resume delivery within the stated recovery time.",
    dep: ["identity-and-auth","chat-fanout","edge-network"]
  },
  "chat-fanout": {
    s: "Distributes each chat message to every connected viewer of the channel, which for large streams means one message becoming hundreds of thousands of deliveries.",
    d: "A message is validated, then published to a channel topic; each gateway subscribed to that topic delivers it to its local viewers. For huge channels the platform batches messages into frames every few hundred milliseconds, samples or throttles display rates, and uses a tree of relays so no single node sends everything. Ordering is per channel and approximate across servers. The scale problem is multiplicative: a thousand messages per second to a million viewers is a billion deliveries per second, which no design can send literally.",
    k: ["Deliver every message vs sample at high rates: complete delivery, against an unreadable flood and unbounded cost that sampling avoids.", "Batch into frames vs send individually: far fewer network operations, but adds up to a few hundred milliseconds of delay."],
    p: ["A raid on one channel concentrates traffic on a few gateways, which fall over while others sit idle.", "Clients that cannot keep up with the message rate fall behind and render stale chat or crash."],
    v: "Simulate a channel with one million viewers and 1,000 messages per second. Confirm all viewers receive messages within the delay target, per-gateway load is balanced and no client receives more than its rate cap.",
    dep: ["chat-gateway","event-bus","chat-rate-limits"]
  },
  "chat-rate-limits": {
    s: "Rules that cap how often a viewer or channel can post, such as slow mode, follower-only mode and per-user limits, keeping chat usable and the platform stable.",
    d: "Limits operate at several levels: per connection to stop floods, per user per channel to prevent spam, and per channel through modes set by the broadcaster or moderators such as one message per ten seconds or subscribers only. Checks run before fan-out so a rejected message costs almost nothing. Limits use counters held close to the gateway with some shared state for accounts spanning servers. It is a design choice with social consequences, since strict limits protect conversation but make lively chat impossible.",
    k: ["Strict limits vs permissive: stable and readable chat, against suppressing legitimate excitement during big moments.", "Local counters vs globally consistent counters: low cost and delay, but a user on several gateways can exceed the limit."],
    p: ["An overly strict global limit blocks every viewer during a large event, when chat is most valuable.", "Rate limits keyed only by account are bypassed by creating many accounts."],
    v: "Send messages above the per-user limit from one account and from fifty new accounts, and confirm excess messages are rejected before fan-out with a clear reason, while normal users in the same channel are unaffected.",
    dep: ["chat-gateway","identity-and-auth"]
  },
  "emotes-and-reactions": {
    s: "Custom images and quick reactions that viewers insert into chat or send as bursts, which the platform must store, deliver and render at high volume.",
    d: "Emotes are small images or animations referenced by token in message text; the client replaces tokens with images from a cache, and the platform manages ownership, availability by subscription and moderation of uploads. Reactions, such as floating icons, are sent as aggregated counts rather than individual messages so a million reactions do not become a million deliveries. Rendering heavy animation at high rates can overwhelm weak devices. The images are served from the CDN and cached aggressively.",
    k: ["Aggregate reactions into counts vs deliver each: bounded traffic and calm screens, but loses individual attribution.", "Emote tokens resolved by the client vs inlined images: small messages and cacheable images, but clients need fresh emote lists."],
    p: ["Uploaded emotes with offensive content reach every viewer before review catches them.", "Hundreds of animated emotes on screen overload weak devices and stutter the video next to them."],
    v: "Send 100,000 reaction events in ten seconds and confirm viewers see aggregated animations, server fan-out is limited to a few batched updates, and client frame rate on the lowest-supported device stays above target.",
    dep: ["chat-fanout","edge-cache","chat-automod"]
  },
  "polls-and-predictions": {
    s: "Interactive features in which the broadcaster poses a question and viewers vote or wager points, with results tallied live and shown on screen.",
    d: "A poll or prediction is created with options and a closing time, announced to viewers through the chat channel or a metadata track, and tallied from vote messages. Counting must be exact for predictions that award points, so votes are deduplicated per user and recorded durably, while display counts can be approximate and updated a few times a second. The closing moment must be consistent: viewers at different delays should not vote after outcomes are visible to others, which is why the cutoff uses server time.",
    k: ["Exact durable tallies vs approximate counters: required when points are awarded, but costs more than counting for display only.", "Close by server time vs by each viewer's own playback time: fair to everyone ahead, but viewers behind may see the result before they could vote."],
    p: ["A viewer with low delay sees the outcome and votes after, if the cutoff is not enforced on the server.", "Duplicate votes from reconnecting clients inflate counts when deduplication is missing."],
    v: "Run a prediction with 100,000 test voters, including retries and duplicates, and confirm final counts match the number of unique votes exactly, votes after cutoff are rejected, and displayed counts converge.",
    dep: ["chat-fanout","timed-metadata-sync","identity-and-auth","event-bus"]
  },
  "timed-metadata-sync": {
    s: "Carries events such as poll starts, overlays and ad cues inside the media timeline, so they appear at the same moment for viewers at different delays.",
    d: "Events are inserted into the stream as timed metadata or a side track with a presentation time. The player reads them and fires them when playback reaches that time, rather than when they arrive. This keeps overlays aligned with the picture for a viewer ten seconds behind another. The packager must carry them through segmentation, and players must support the format. Alternatives, like pushing events through chat, arrive at the network's pace, which is earlier or later than the video, leading to spoilers.",
    k: ["Events inside the media timeline vs pushed separately: always aligned with the picture, but needs every pipeline step to preserve them.", "Fire on playback time vs on arrival: correct for each viewer, but late events that arrive after their time fire immediately or are dropped."],
    p: ["Packaging strips the metadata track on one rendition, so viewers on that rung never see the overlay.", "Events pushed through chat reveal a result before the video shows it."],
    v: "Insert an event at a known frame and confirm every viewer, at several delays and renditions, triggers it within 100 ms of that frame appearing.",
    dep: ["segmenter","timestamp-normalization","player-beacons"]
  },
  "viewer-count": {
    s: "A live estimate of how many people are watching a stream, used for directories, broadcaster feedback and capacity planning.",
    d: "Counting is surprisingly hard: a viewer is a connection that sends heartbeats or segment requests, but the same person may have several tabs, connections drop and reappear, and the true total is spread across edges and regions. The platform aggregates unique session identifiers over a short window using approximate counting structures, then publishes a smoothed number. Exact counts are not needed for display, but the same numbers feed billing and ranking, which creates pressure to inflate them. Bot traffic must be filtered.",
    k: ["Approximate distinct counting vs exact: tiny memory and cheap merging across regions, against an error of a percent or two.", "Count from player heartbeats vs from CDN requests: heartbeats count real viewers, but miss players that fail to report."],
    p: ["Reconnect loops from a failing client count as thousands of viewers when there are few people.", "Viewer counts used for ranking invite fake viewers purchased through bots."],
    v: "Connect a known number of test viewers, including duplicates and disconnects, and confirm the published count lies within 2% of the true number and returns to zero within the timeout after all leave.",
    dep: ["realtime-analytics","player-beacons","event-bus"]
  },
  "chat-history": {
    s: "Stores recent and past chat messages so new viewers see recent conversation and moderators can review what was said.",
    d: "Messages are written to a log keyed by channel and time. New joiners are sent the latest few dozen messages from a hot cache, so they do not enter an empty room. Older messages go to cheaper storage for moderation, appeals and replay with recordings. The write volume equals the message rate and must not slow delivery, so persistence is asynchronous. Deletions and bans must also remove or mask stored messages, and retention rules depend on law and policy, which requires the history to be genuinely erasable.",
    k: ["Asynchronous persistence vs write before delivery: delivery stays fast, but a crash can lose the last messages.", "Keep forever vs expire: supports moderation review and replay, against storage cost and privacy obligations to delete."],
    p: ["A deleted message remains in the cached backlog shown to new viewers because only the primary store was updated.", "Hot channels create a single hot partition in the message store and slow all writes."],
    v: "Post messages, delete one as a moderator and confirm a new viewer joining immediately receives the backlog without it, and that the stored record is marked removed and unavailable to ordinary queries.",
    dep: ["event-bus","object-storage","chat-fanout"]
  },
  "recorder": {
    s: "Captures the live stream as it is produced, writing the segments of every rendition to durable storage so a recording exists even if the broadcaster never asks for one.",
    d: "The recorder subscribes to the packager's output or reads from the origin and copies segments and manifests to object storage with their timing. Recording the source stream, rather than only the delivered ladder, preserves quality for later processing. It must tolerate gaps from source drops by marking them rather than inventing content, and survive restarts without losing segments. Because every stream is recorded by default on many platforms, this component's volume is the full platform's ingest volume, continuously written.",
    k: ["Record the highest-quality source vs the delivered renditions: best for editing and re-encoding later, against more storage than the viewer-facing ladder.", "Record everything vs on demand: nothing is ever lost, but storage is spent on streams nobody wants to keep."],
    p: ["A recorder restart loses the segments in flight, leaving a hole in a recording of an important event.", "The recording is written only to one region, and a regional failure loses it permanently."],
    v: "Kill the recorder mid-stream and restart it, then compare the finished recording with the live output. It should contain every segment, with any gap explicitly marked and total duration within one second of actual.",
    dep: ["segmenter","object-storage","stream-registry"]
  },
  "live-to-vod": {
    s: "Turns the recorded live segments into a finished on-demand video with a complete seekable manifest, and optionally re-encodes it for efficiency.",
    d: "When a stream ends the platform finalizes the recording: it closes the manifest so the video has a fixed length, removes or marks gaps, stitches reconnections and may generate a thumbnail sprite for seeking. Optionally a second pass re-encodes with slow, efficient settings that real-time encoding could not afford, saving storage and bandwidth for repeated views. The recording is available almost immediately because it is already in segment form. Hard parts are streams that restart, very long streams, and consistency of timing for later chat replay.",
    k: ["Publish as-is immediately vs re-encode first: instant availability, against the efficiency gains of a better encode that delay publication.", "Stitch reconnections into one video vs separate videos: easier for viewers, but long recordings are harder to process and edit."],
    p: ["A stream that restarted several times produces a manifest with timing jumps that break seeking.", "A very long recording exceeds a processing limit and fails silently, leaving no on-demand version."],
    v: "End a test stream that included two reconnects and confirm a seekable recording is available within the target time, its duration matches the broadcast, and seeking to any point plays within the startup target.",
    dep: ["recorder","object-storage","event-bus"]
  },
  "clip-service": {
    s: "Lets a viewer or moderator capture a short span of the stream, usually the last tens of seconds, as a standalone shareable video.",
    d: "A clip request names a stream and a time range relative to the live moment. The service identifies the segments covering that range from the recorded or DVR segments, builds a manifest or file from them, and publishes it at a new address. Because the segments already exist, a clip can be made in seconds without re-encoding by trimming only the first and last segments. It faces viral load: one popular clip may be viewed by millions, so it must reach the CDN cache like any other content, and the platform needs controls to prevent abuse.",
    k: ["Reference existing segments vs copy to a new file: instant and nearly free, but the clip depends on the source recording's lifetime.", "Allow clips by anyone vs by permission: viral growth, against broadcaster control over their content."],
    p: ["A clip points to segments that retention then deletes, so a shared clip breaks later.", "Clips created from a delayed view miss the moment because the request used the viewer's own position inconsistently."],
    v: "Create a clip from the previous 30 seconds during a live stream and confirm it plays within a few seconds, is 30 seconds long within a frame, starts and ends on the intended moments, and survives retention of the source.",
    dep: ["recorder","dvr-window","object-storage","identity-and-auth"]
  },
  "clip-trim-and-share": {
    s: "The editing and sharing step for clips: adjusting start and end, adding a title, and producing links and embeds that load quickly and display previews.",
    d: "After capture, the viewer adjusts the range on a timeline, previews it and publishes. The service creates a stable address, a preview image, metadata for link previews and embed support, and a vertical-video version for mobile feeds on request. Frame-accurate trimming needs re-encoding of the edges because cuts must start at keyframes. Sharing links drives sudden audience spikes, and each clip must be moderated like any other content, as clips often contain the worst moments.",
    k: ["Keyframe-snapped trimming vs frame-accurate: instant with no re-encode, but cut points are rounded by up to one keyframe interval.", "Generate extra formats on publish vs on demand: ready immediately and predictable, but costs compute for clips nobody views."],
    p: ["Link previews show a thumbnail from the wrong frame because the preview was generated before trimming finished.", "Embedded clips on external sites bypass access rules intended for the original stream."],
    v: "Trim a clip to an exact range and confirm the output starts within one keyframe interval of the request, the link preview shows the right frame, and a mobile-format version plays correctly.",
    dep: ["clip-service","thumbnail-generator","stream-classification"]
  },
  "chat-replay-sync": {
    s: "Plays stored chat messages alongside a recording, timed to the video position instead of when they were originally posted, so a replay feels like the live event.",
    d: "Each stored message carries both its wall-clock timestamp and the stream's media time. During replay the player fetches messages for the upcoming window and shows each when playback reaches its media time. Because live viewers watched at different delays, the replay uses the broadcast timeline, not any individual viewer's. Seeking requires loading the messages for the new position, including the earlier context. The difficulty is mapping wall-clock timestamps to media time correctly across gaps and restarts.",
    k: ["Anchor messages to media time vs to arrival time: synchronized with the picture and seekable, but needs an accurate mapping recorded at write.", "Fetch by time window vs download everything: small requests and quick start, but seeking issues new queries."],
    p: ["A recording with a gap shifts the mapping, so every later message appears early or late.", "Messages deleted by moderators still appear in replay because it reads from an unfiltered copy."],
    v: "Play back a recording of an event with a known marker message and confirm it appears within a second of the matching moment in the video, including after seeking and across a recorded gap.",
    dep: ["chat-history","live-to-vod","timestamps-and-clocks"]
  },
  "storage-tiering": {
    s: "Moves recordings between fast, standard and archival storage as they age, trading access speed for cost per gigabyte.",
    d: "New recordings sit in storage that serves traffic well, since the first days see most views. A policy then migrates objects to cheaper classes by age and access pattern, and eventually to archive with retrieval delays measured in hours. Segment-based recordings are numerous small objects, so request and metadata costs can exceed capacity costs; consolidating into larger files helps. The tradeoff is surprise cost and latency: a long-forgotten recording that suddenly gets traffic must come back from cold storage.",
    k: ["Aggressive tiering to cold storage vs keeping content warm: large savings, but retrieval delay and fees when old content resurfaces.", "Keep individual segment objects vs consolidate: simple serving, against high per-object costs at the scale of millions of streams."],
    p: ["A tiering rule moves a recording to archive just before a documentary clip makes it popular, and viewers wait hours.", "Per-request charges for millions of tiny segments outweigh the savings in storage price."],
    v: "Age a test recording through each tier and confirm the policy moves it at the stated time, first-byte time for each tier matches expectations, and a monthly bill report separates storage from request charges.",
    dep: ["object-storage","retention-policy"]
  },
  "retention-policy": {
    s: "Rules that decide how long recordings, clips, chat logs and moderation evidence are kept, and who can extend or delete them.",
    d: "Retention is set per content type: a rolling window for ordinary recordings, longer for paying broadcasters, indefinite for saved highlights, and mandatory holds for content under investigation or legal request. A job enforces expiry, deleting objects, manifests and derived data such as thumbnails and replays together. Deletion must also answer to privacy requests, which require finding every copy. Mistakes are irreversible in one direction and costly in the other: deleting too soon loses evidence, keeping too long breaks promises and law.",
    k: ["Automatic expiry vs manual deletion only: predictable cost and compliance, but broadcasters lose content they forgot to save.", "Legal hold flags vs separate evidence store: simple to apply to existing objects, but holds must override every deletion path."],
    p: ["Expiry deletes the video but leaves thumbnails and chat replay, which keep personal data.", "A deletion job runs against a hold-flagged recording because the check was applied only in one path."],
    v: "Create recordings with each retention class and a hold, run the expiry job and confirm exactly the expired ones and all derived artifacts are deleted, the held one remains, and an audit record exists for each action.",
    dep: ["object-storage","event-bus","takedown-actions"]
  },
});
