// Details for the video sharing plate, part 1: apps and player.
ATLAS.details("video-sharing", {
  "watch-page": {
    s: "The page that hosts the player and surrounds it with title, description, suggestions and comments, tuned so the video starts before the rest of the page finishes loading.",
    d: "The server renders a minimal shell with the video id and initial metadata, then the browser fetches the player code, manifest and first segments in parallel. Suggestions, comments and ads load afterward in separate requests. The page talks to the metadata store, recommendation service, comments service and the player. It is hard because every extra script or request competes with the video for bandwidth and main-thread time, so product teams and playback engineers are in constant tension.",
    k: ["Server-rendered shell versus fully client-rendered page: server rendering shows content and starts the video sooner and helps search crawlers; it costs more server compute and a more complex cache story.", "Preloading the player and manifest on hover versus on click: preloading hides startup latency; it wastes bandwidth and server work on videos never played."],
    p: ["Comments or recommendation widgets blocking the main thread delay playback start, and the regression is only visible in field timing, not in lab tests.", "A cached page that embeds stale availability shows a video that was taken down or made private."],
    v: "Open a watch URL on a throttled connection with a cold cache and record time to first frame. It stays under the startup target, and playback begins before comments finish loading.",
    dep: ["manifest-parser", "metadata-store", "home-and-up-next", "comments-service"]
  },
  "native-and-tv-apps": {
    s: "Phone, tablet and television applications that wrap a platform-specific player, with remote-control navigation, background audio, offline downloads and device-specific codec support.",
    d: "Each platform has its own media stack, input model and release cycle. Phone apps add offline download, background playback and casting to another screen. Television apps are driven by directional remote input and must be usable ten feet away with slow processors and little memory. They use the same backend APIs as the web but differ in which codecs and encryption schemes the hardware supports. Hard part: old devices stay in the field for a decade and cannot be updated.",
    k: ["One shared cross-platform core versus fully native per platform: sharing cuts duplicated logic and bugs; it limits access to platform media features and often performs worse on weak television hardware.", "Server-driven layouts versus compiled screens: server-driven lets product change pages without an app release; it makes offline behavior and testing harder."],
    p: ["Dropping support for old devices to simplify code strands a visible fraction of viewers who never update.", "Remote-control focus handling breaks on a new layout, leaving screens that cannot be navigated without a pointer."],
    v: "Install the oldest supported app build on a low-end television, play a video with a remote only, change quality, resume after a pause and exit. Each step works without a crash or a stuck focus state.",
    dep: ["manifest-parser", "decode-and-render", "api-gateway"]
  },
  "embeds-and-share-links": {
    s: "Ways to show a video on third-party pages: an embeddable player frame, short links, and link previews that carry title and thumbnail into other applications.",
    d: "An embed is a small frame that loads the player from the platform's origin and receives options such as autoplay, start time and allowed controls. Share links resolve to the watch page or to the embed, and publish preview metadata that chat and social applications fetch. Embed requests come from pages the platform does not control, so privacy, framing permissions and autoplay rules need explicit design. Hard because the player must work inside arbitrary pages and policies.",
    k: ["Allowing embeds by default versus per-video opt-in: default allow spreads reach; creators lose control over where their content appears and ad context.", "Sandboxed cross-origin frame versus script embedded directly: a frame isolates the player and the host page from each other; it limits integration and costs another page load."],
    p: ["Embedding pages that autoplay many players at once overload the viewer's device and inflate view counts.", "Preview metadata cached by other services keeps showing the old title or thumbnail long after a creator changed it or a takedown."],
    v: "Embed a private, an unlisted and a public video on a test page from a different origin. Only the allowed ones play, the preview card shows the current thumbnail, and a takedown disables the embed.",
    dep: ["watch-page", "signed-url-authorization", "age-and-region-gating"]
  },
  "channel-pages": {
    s: "A creator's home: profile, uploaded videos, playlists, about text and subscribe button, assembled from the catalog and counts and customizable by the creator.",
    d: "A channel page reads the creator's profile, a paginated list of videos in chosen order, pinned or featured items, playlists and public statistics. Subscriber counts and total views come from counting systems and are cached and rounded. Creators can organize sections and set trailers for new versus returning visitors. The challenge is popular channels with millions of videos and visitors, which makes listing and counting queries hot spots, and privacy states per video must be enforced on every listing.",
    k: ["Computing listings on read versus precomputed lists per channel: on read is always fresh; precomputed lists are fast under load but lag behind uploads and state changes.", "Exact versus abbreviated public counts: exact is more satisfying; abbreviated counts hide small fluctuations and avoid expensive consistent reads."],
    p: ["A video set to private still appears in a cached channel listing until the cache expires.", "Sorting by view count over a huge channel scans everything and overloads the database during a viral event."],
    v: "Make a video private and reload the channel page as an anonymous viewer. It disappears from the listing within the stated propagation time, and the channel page still renders in time for a very large channel.",
    dep: ["metadata-store", "catalog-database", "subscription-graph", "view-counting"]
  },
  "playlists-and-queues": {
    s: "Ordered lists of videos that viewers or creators build, share and play in sequence, including the temporary queue that decides what plays next.",
    d: "A playlist is an ordered list of video ids with an owner, visibility and metadata. Playback uses a queue derived from a playlist, a channel or recommendations, with shuffle and repeat state kept on the device and synced across devices. Playlists are edited concurrently from several devices, so ordering uses stable positions or fractional keys. Hard parts are items that are later deleted or restricted and the very large list that people expect to behave like a small one.",
    k: ["Array of ids stored in one document versus one row per entry: a document is simple and fast to read; per-entry rows scale to huge lists and concurrent edits.", "Queue held on the device versus held on the server: on-device is responsive offline; server-held queues sync between phone and television at the cost of round trips and conflicts."],
    p: ["Deleted or restricted videos stay as dead entries, leaving playlists that stall or skip unexpectedly.", "Two devices reorder the same list simultaneously and the last writer silently drops the other's changes."],
    v: "Reorder and add items from two devices to the same playlist at once, then reload both. Both show the same final order with no lost items, and a deleted video appears as a clearly marked unavailable entry.",
    dep: ["metadata-store", "catalog-database", "resume-state"]
  },
  "creator-studio": {
    s: "The workspace where creators upload, set titles and visibility, see processing status, edit captions and chapters, manage claims and read analytics.",
    d: "The studio is a separate application over the same services, with creator-only views: video list with processing and rights status, an editor for metadata and visibility, caption and chapter tools, monetization settings, and analytics. It surfaces the state machine of each video honestly so a creator knows whether a file is still processing, claimed, restricted or live. Hard because it must show the real status of asynchronous pipelines, and a stale status makes creators re-upload or panic.",
    k: ["Showing the true internal state versus a simplified one: true state helps creators diagnose problems; simplified states are easier to understand but hide why a video is held.", "Optimistic edits versus waiting for confirmation: optimistic feels fast; it can display a change that a later validation or moderation step rejects."],
    p: ["Status in the studio lags the pipeline, so creators publish before processing finishes and share a broken link.", "Bulk edit tools applied to thousands of videos by mistake have no easy undo."],
    v: "Upload a file and watch the studio status move through uploading, processing, checks complete and published, matching the video state machine and the actual playability of the link at each stage.",
    dep: ["upload-api", "video-state-machine", "creator-analytics", "rights-registry", "metadata-store"]
  },
  "manifest-parser": {
    s: "Reads the manifest, a text or XML file listing every rendition, its codec, bitrate and the URLs of its segments, so the player knows what it can fetch.",
    d: "A manifest follows an open adaptive-streaming standard: a master document lists renditions and audio and subtitle tracks, and a media document per rendition lists segment URLs and durations. The parser builds an in-memory timeline, filters renditions the device cannot decode, and refreshes the document for live streams. It also reads encryption and ad-marker information. It is hard because real manifests contain inconsistencies, vendor extensions and timing gaps that a strict parser would reject but a viewer still expects to play.",
    k: ["Strict standards conformance versus tolerant parsing: strict catches packager bugs early; tolerant parsing keeps broken streams playing but hides defects and can desynchronize timelines.", "One master manifest for all devices versus per-device manifests: one is simpler to cache; per-device manifests can hide unsupported codecs at the cost of cache fragmentation."],
    p: ["A segment duration mismatch makes the timeline drift, producing audio and video out of sync after a long seek.", "A rendition the device cannot decode is selected from the manifest, causing a stall with no fallback."],
    v: "Feed the player manifests from every packager version and a deliberately malformed set. Valid ones list the expected renditions, and malformed ones either play with a logged warning or fail with a clear error.",
    dep: ["segmenting-and-packaging"]
  },
  "abr-controller": {
    s: "The algorithm that chooses which rendition to fetch next, from measured throughput and buffer level, trading picture quality against the risk of stalling.",
    d: "After each segment download the controller updates a bandwidth estimate and looks at how much video is buffered, then picks the next rendition. Throughput-based rules follow the network; buffer-based rules follow the cushion; hybrids combine them with smoothing to avoid constant switching. It must work across mobile, Wi-Fi and wired links with highly variable latency. The difficulty is that the estimate is always old and noisy, and the best choice differs for viewers who care about smoothness versus sharpness.",
    k: ["Throughput-driven versus buffer-driven selection: throughput reacts quickly to network change but is noisy; buffer-driven is stable but slow to climb and slow to detect a collapse.", "Aggressive quality ramp-up versus conservative: aggressive shows sharp video sooner; conservative avoids a stall right after a switch, at the cost of lower quality early."],
    p: ["Frequent oscillation between two renditions looks worse than staying on the lower one.", "Estimating bandwidth from small segments over a cold connection underestimates capacity and pins viewers at low quality."],
    v: "Replay recorded network traces in a test harness. Across the traces the controller keeps rebuffering below the target ratio, switches no more than a set number of times per minute, and reaches the top sustainable rendition.",
    dep: ["manifest-parser", "buffer-manager"]
  },
  "buffer-manager": {
    s: "Holds downloaded segments ahead of the playhead, decides how much to fetch and keep, and discards what is already played to stay within the device's memory.",
    d: "The buffer manager requests segments until a target amount of video is ahead of the playhead, pauses fetching when it is full, and resumes when it drops. It appends data to the decoder's source buffers and removes played ranges. On a seek it flushes ranges, finds the nearest random access point and refetches. It coordinates with the bitrate logic when quality changes mid-stream. Hard because memory limits, gaps in timestamps and decoder quirks differ per device, and getting eviction wrong causes either stalls or crashes.",
    k: ["Large forward buffer versus small: large rides out network dips but wastes bandwidth if the viewer leaves; small saves data but stalls on brief outages.", "Replacing already-buffered low quality with higher quality versus keeping it: replacing improves picture sooner; it spends extra bandwidth and risks a gap if the switch lands badly."],
    p: ["Evicting data too close to the playhead on a memory-constrained device causes a visible stall on a backward seek.", "Appending segments with overlapping timestamps stalls some decoders silently on certain devices."],
    v: "Play a long video on a device with a small memory limit, seek forward and backward repeatedly. Memory stays within its budget, playback resumes within the target time after every seek and there are no timestamp gaps.",
    dep: ["manifest-parser", "decode-and-render"]
  },
  "decode-and-render": {
    s: "Hands compressed video and audio to the device's decoders, keeps them synchronized to a common clock, and draws frames to the screen at the right time.",
    d: "Compressed samples go into the platform's media pipeline, which uses hardware decoders when available and software ones otherwise. The player keeps audio as the master clock and drops or repeats video frames to stay in sync. It handles frame rate changes, color spaces and high dynamic range, and picture-in-picture or casting. What makes it hard is the variety of hardware: decoders have different limits on resolution, profiles and number of simultaneous streams, and software fallback can overheat or drain a phone.",
    k: ["Hardware decoding versus software: hardware saves power and handles high resolutions; software supports newer codecs on old devices but can be too slow and hot.", "Device-native media pipeline versus a player-supplied decoder: native uses vendor-tuned hardware paths; a bundled decoder gives uniform behavior and new codecs at the cost of size and power."],
    p: ["A decoder that silently supports only a lower profile than advertised causes green frames or a stall at a specific resolution.", "Audio and video drift apart after a long session because the clock reference was not corrected."],
    v: "Play a reference clip with a known frame counter and an audio click track on each target device class. Frames present at the expected times, and measured audio-video offset stays within one frame for the full duration.",
    dep: ["buffer-manager", "content-decryption"]
  },
  "content-decryption": {
    s: "Requests keys from a license service and passes them to a protected decryption module so encrypted renditions play without exposing the key or the clear frames to the page.",
    d: "Protected content is encrypted at packaging time with a standard common-encryption scheme. The player detects it from the manifest, creates a decryption session, sends a challenge to the license service, and passes the response to the device's trusted module. Which security level the device has determines the highest resolution allowed. Hard because several incompatible protection systems must be supported, license servers are latency-sensitive on startup, and devices differ in what they enforce.",
    k: ["One encrypted copy supporting several protection systems versus separate copies: one copy saves storage and cache space; it requires a common scheme that some old devices do not support.", "License at start versus prefetched or persistent licenses: at start is simple and revocable; persistent licenses enable offline playback but need expiry and rental-window handling."],
    p: ["License server slowness adds directly to startup time and becomes the main source of failed starts.", "Rolling out a key rotation without updating cached manifests makes older cached copies undecryptable."],
    v: "Play an encrypted title on a device at each security level. The device receives a license, plays up to the resolution its level allows, and an expired or revoked license stops playback with a clear message.",
    dep: ["manifest-parser"]
  },
  "caption-renderer": {
    s: "Fetches and draws subtitles and captions, including styling, positioning, language selection and auto-generated tracks, in time with the video.",
    d: "Caption tracks are separate text files listed in the manifest, in open timed-text formats. The renderer fetches the chosen language, parses cue timing and style, and draws text over the video or hands it to the platform. It must respect viewer preferences for size and color, and place text clear of controls and burned-in text. Auto-generated tracks come from a speech recognition service and may arrive after upload. Hard because language, direction, line-breaking rules and platform text rendering are all different.",
    k: ["Rendering captions in the player versus delegating to the platform: in-player gives uniform style and features; platform rendering honors system accessibility settings but varies in behavior.", "Auto-generated captions on by default versus opt-in: on by default helps accessibility and silent viewing; wrong transcripts can embarrass creators and mislead."],
    p: ["Cue timing offset between the text file and the actual video start after trimming makes captions appear early or late.", "Right-to-left or mixed-direction text is mis-ordered in some renderers."],
    v: "Play a clip with tracks in several languages including a right-to-left one. Each track appears in sync within a quarter second, honors the viewer's size setting, and switching language mid-play takes effect without a rebuffer.",
    dep: ["manifest-parser", "chapters-and-auto-tags"]
  },
  "resume-state": {
    s: "Remembers where each viewer stopped, which videos they watched and their preferences, and syncs them across devices so playback continues where it left off.",
    d: "The player periodically sends the playhead position to a per-user store, and the history service records watched videos. When a viewer opens a video on another device, the position is fetched and playback seeks to it. The same history feeds recommendations and can be paused or cleared by the user. Writes are frequent and small, so they are batched and written with last-writer-wins by timestamp. The difficulty is the volume of writes and honoring privacy settings and deletion everywhere the history is copied.",
    k: ["Frequent position updates versus updates only on pause or exit: frequent updates survive crashes and device switches; they multiply write volume enormously.", "Last-writer-wins by timestamp versus merging per device: last-writer-wins is simple; it can jump backward when a device clock is wrong or a stale tab writes later."],
    p: ["Clearing history in the app leaves copies in recommendation features, so suggestions still reflect it.", "A device with a wrong clock overwrites a newer position with an older one."],
    v: "Watch a video halfway on one device, open it on another, and the second resumes within a few seconds of the first position. After clearing history, neither device nor the recommendation inputs retain that entry.",
    dep: ["catalog-database", "data-sharding", "engagement-signals"]
  },
});
