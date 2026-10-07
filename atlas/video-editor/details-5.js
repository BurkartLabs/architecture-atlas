// Details for the video editor plate, part 5: rendering and export, import and decoding.
ATLAS.details("video-editor", {
  "render-queue": {
    s: "Holds export jobs with their settings, runs them in order in the background or on other machines, and reports progress, failures and results.",
    d: "A job captures a snapshot of a sequence, a range, a preset and a destination. The queue runs jobs one at a time or in parallel within resource limits, and keeps editing responsive by lowering priority or by running in a separate process on a copy of the project. It persists across restarts, supports pause and retry, and logs warnings such as offline media. It is hard because the editor keeps changing the timeline while the job runs, so the job must render a frozen snapshot.",
    k: ["Rendering a snapshot in a separate process vs inside the editor: a separate process isolates crashes and lets editing continue, but needs the project and plugins loaded twice.", "Failing a job on the first error vs continuing with warnings: failing is safe for delivery, continuing helps for review copies."],
    p: ["A job reads the live timeline, so edits made during a long export appear halfway through the file.", "A queue that is lost on a crash leaves overnight batches silently unrun."],
    v: "Queue three exports, edit the timeline while they run, kill the process mid-job, and confirm the exports reflect the original snapshots and the queue resumes the unfinished job on restart.",
    dep: ["timeline-model","export-presets","job-system","project-file"]
  },
  "export-presets": {
    s: "Named bundles of codec, resolution, frame rate, bit rate, audio layout and container settings for each delivery target, shared and versioned.",
    d: "A preset records everything needed to reproduce a deliverable: video codec and profile, bit depth, color space and range, size and scaling mode, frame rate conversion, rate control, audio format and loudness target, container and metadata. Presets for broadcast, streaming, review and archive are supplied and can be customized and shared with a team. Presets are validated against the encoder's capabilities. The difficulty is that settings are interdependent, and silently incompatible combinations produce files that look right but fail at the destination.",
    k: ["Presets as complete specifications vs inheriting from the project: complete specifications are reproducible, while inheriting makes outputs depend on the project.", "Managed shared presets vs per-user: shared presets give consistent deliverables across a team, but need change control."],
    p: ["A preset that does not set color space inherits it from the project and delivers an HDR file as SDR.", "Changing a shared preset alters earlier jobs that referenced it by name."],
    v: "Export with each shared preset and inspect the output with an independent analyzer, confirming codec, profile, resolution, frame rate, color metadata and audio layout match the preset exactly.",
    dep: ["encoder-integration","muxing","color-pipeline"]
  },
  "encoder-integration": {
    s: "Connects the renderer's frames to video and audio encoders, hardware or software, passing settings, handling their threading and collecting the compressed output.",
    d: "The export feeds frames in the encoder's required pixel format, converting from the working space with dithering. Encoders have their own threading, buffering and delay, so frames go in ahead of the packets that come out. The integration provides timestamps, handles B-frame reordering, and exposes encoder-specific options. Audio is encoded on a separate path. It is hard because encoders are libraries with different assumptions, and the pipeline must not stall when the encoder is slower than rendering, or the reverse.",
    k: ["Linking encoders into the process vs running them as separate programs: linked is fast with direct control, while separate programs isolate crashes and licensing but cost piping and parsing.", "Hardware vs software encoders: hardware is far faster, while software at slow settings gives better quality per bit."],
    p: ["Frames fed with wrong timestamps produce files that play with stutter or with audio drift.", "Encoder output ordering is assumed equal to input ordering and the container gets packets in the wrong order."],
    v: "Encode a numbered test sequence, decode the result with an independent decoder, and confirm every frame is present, in order, with correct timestamps and quality above a stated measure.",
    dep: ["hardware-codecs","float-precision","rate-control"]
  },
  "rate-control": {
    s: "Decides how many bits each frame receives, using constant quality, constant or variable bit rate and one or two passes, to meet size or quality targets.",
    d: "The encoder spends bits where the image is complex and saves them where it is simple. Constant quality fixes the visual quality and lets size vary; bit-rate modes fix the average or a ceiling, needed for streaming and broadcast with buffer limits. Two-pass encoding analyzes the whole piece first to distribute bits more efficiently. The decoder's buffer model puts constraints on bursts. It is hard to hit a precise file size or a strict ceiling while keeping quality even across hard scenes.",
    k: ["Constant quality vs constrained bit rate: constant quality gives the best use of bits, while constrained rates are needed when a channel or limit is fixed.", "Two-pass vs single-pass: two-pass gives better distribution and exact targets, at the cost of doubling encode time."],
    p: ["A fast-moving scene exceeds the buffer limit and the file is rejected by the broadcaster's validator.", "A rate chosen for a short test is applied to a long program and produces a file too large to upload."],
    v: "Encode a hard test clip with a strict ceiling, analyze the stream's buffer behavior with a verifier, and confirm no violations and total size within the target tolerance.",
    dep: ["encoder-integration"]
  },
  "muxing": {
    s: "Packs encoded video, audio, captions and metadata into a container file with correct timing, indexes and chapter data for the intended player or system.",
    d: "The muxer interleaves packets from each stream by timestamp, writes headers, and finishes with an index that enables seeking. It adds metadata for color, HDR, language, chapters and timecode tracks. Some containers write the index at the end, which makes the file unplayable until finishing; fast-start layouts move it to the start for streaming. Different containers support different codecs and features. The difficulty is correctness of timestamps and edit lists, and surviving a failed export.",
    k: ["Index at the end vs at the start: at the end allows single-pass writing, while at the start suits streaming but needs a second pass or reserved space.", "One output file vs segmented output: one file is simple to deliver, segments suit adaptive streaming and resumable uploads."],
    p: ["An interrupted export leaves a file with no index that no player can open.", "Audio starts slightly later than video because the container's start offsets are written wrongly."],
    v: "Mux a numbered clip with a tone, probe the result with an independent tool, and confirm stream counts, durations, start times, chapters and color metadata match, and the file seeks to any frame.",
    dep: ["encoder-integration","metadata-extraction","markers-and-metadata"]
  },
  "segmented-render": {
    s: "Splits an export into time segments rendered in parallel, on several cores or machines, then joins them into one file.",
    d: "The timeline is cut into ranges at points where independent encoding is possible, usually key frames. Each worker renders and encodes its range with the same settings, and the pieces are concatenated by the muxer. On a farm, each node needs the project, the plugins and access to the media, and a coordinator tracks, retries and assembles. It is hard because effects with temporal state need pre-roll before each segment, rate control must be consistent across joins, and different nodes must give identical pixels.",
    k: ["Segments split at fixed lengths vs at scene boundaries: fixed lengths balance load, while scene boundaries reduce visible seams at the cost of uneven jobs.", "Distributing across machines vs only local cores: machines scale further, but add shared storage and environment consistency problems."],
    p: ["Two machines with different driver versions produce slightly different colors in adjacent segments.", "A temporal effect without pre-roll shows a visible glitch at every join."],
    v: "Render a sequence whole and in eight segments on different nodes, and compare outputs frame by frame, requiring identical timing and pixel difference within tolerance, and no discontinuity at joins.",
    dep: ["render-queue","encoder-integration","muxing","cpu-fallback"]
  },
  "smart-render": {
    s: "Reuses previously rendered or original compressed data for unchanged sections, so only edited parts are re-encoded and exports and previews finish faster.",
    d: "Rendered results are stored with a key built from the timeline content and settings for each range. On export, a range whose key matches is copied from the cache. When a clip is unchanged and the codec and settings match the destination, its original compressed data can be copied without re-encoding, called smart rendering, avoiding quality loss. The boundaries must start at key frames. It is hard because the key must include every input that affects pixels, including plugin versions, and because copying needs exact stream compatibility.",
    k: ["Re-encode everything vs reuse compressed streams: re-encoding is uniform and simple, reuse is faster and lossless but depends on matching parameters.", "Strict content keys vs timestamp-based invalidation: strict keys never serve stale output, while timestamps are cheap but can miss indirect changes."],
    p: ["A plugin update does not change the key, and cached output from the old version is delivered.", "Reused sections have different rate control than newly encoded ones, producing a visible quality change at joins."],
    v: "Export twice with one clip changed and confirm only the affected ranges are re-encoded, and the output is identical to a full re-render except for allowed differences at reused ranges.",
    dep: ["frame-graph","cache-invalidation","disk-cache","muxing"]
  },
  "delivery-targets": {
    s: "Sends finished files to where they are needed, such as a streaming site, a shared drive or a broadcaster, with metadata, checks and resumable transfer.",
    d: "Targets define a destination, authentication and a profile. After export the file can be validated against the target's rules for format, loudness, captions and file naming, and then uploaded with resumable chunks. Some targets receive a package with sidecar files, for example captions, thumbnails or XML descriptors. Jobs record results and receipts. The difficulty is that targets change their requirements and APIs, and that credentials must be stored safely.",
    k: ["Validating before upload vs relying on target rejection: validation saves hours when something is wrong, but each target's rules must be kept current.", "Uploading from the editor vs handing to a separate service: from the editor is direct, a service survives editor shutdown and retries reliably."],
    p: ["An upload that restarts from zero after a network drop wastes hours on large files.", "Stored credentials for a delivery site are left readable in the project file."],
    v: "Upload a file to a test endpoint while interrupting the network twice, and confirm the transfer resumes, the received file hash matches the original, and validation findings are shown before the upload begins.",
    dep: ["render-queue","export-presets","captions","loudness-control"]
  },
  "media-import": {
    s: "Brings files, folders and camera cards into the project, copying or referencing them, identifying what each contains, and queuing analysis and proxy creation.",
    d: "Import identifies files by content, not only by extension, and reads their container for streams and metadata. Camera cards have structured folders where one clip may be several files with sidecar data, which the importer groups into a single item. Options include copying to project storage with verification, leaving in place, and creating proxies at the same time. The result is a media item in a bin with analyzed properties. It is hard because cameras produce many structures, and import must be safe for the original card.",
    k: ["Referencing files in place vs copying into project storage: referencing is instant and saves space, copying protects against moved or unmounted drives.", "Importing everything on a card vs selected clips: everything is simple and complete, selection saves time and storage on large cards."],
    p: ["Treating each file of a multi-file clip as separate media loses the pairing of picture and audio.", "Importing from a card that is later reformatted leaves references pointing at nothing."],
    v: "Import a card with spanned clips and sidecar files, and confirm each clip appears once with correct duration and streams, copies match source checksums, and proxy jobs are queued.",
    dep: ["container-demux","metadata-extraction","media-bins","media-file-io"]
  },
  "container-demux": {
    s: "Reads container files and separates them into streams of compressed packets with timestamps, for video, audio, timecode, captions and metadata.",
    d: "A container is a structure of boxes or chunks holding streams and an index. The demuxer parses the index, exposes streams and their parameters, and returns packets by time or by position. It handles files that are still being written, damaged files, and fragmented files. Timestamps and edit lists must be interpreted exactly to place the first frame correctly. It is hard because containers are specified loosely, files from cameras contain quirks, and a parser fed untrusted files must not crash or be exploitable.",
    k: ["Using the index vs scanning the file: the index is fast, but missing or broken indexes need a slow scan to rebuild.", "Strict parsing vs tolerant parsing: strict rejects damaged files safely, tolerant recovers footage from a failed recording at the cost of guessing."],
    p: ["A file with a corrupt index imports as zero length though the footage is intact.", "Malformed headers in untrusted media trigger memory errors in the parser."],
    v: "Demux a corpus of containers including truncated and fragmented files, and confirm stream lists and packet timestamps match an independent parser, damaged files recover what is recoverable, and a fuzz run causes no crashes.",
    dep: ["media-file-io","platform-abstraction"]
  },
  "decoder-layer": {
    s: "A common interface over all video and audio decoders, hardware and software, that turns compressed packets into frames and samples and hides codec differences.",
    d: "The layer selects a decoder for each stream, opens it, feeds packets and returns decoded frames with timestamps, pixel format and color information. It manages decoder state, since inter-frame codecs need earlier frames to decode later ones, and handles seeking by restarting at a key frame and discarding frames until the target. It chooses hardware or software, and falls back on failure. It is hard because decode cost varies enormously across codecs, and inter-frame decoding makes random access expensive.",
    k: ["One interface for all decoders vs codec-specific paths: one interface simplifies everything above, but cannot express special features like raw sensor access.", "Long-lived decoder per clip vs opening on demand: long-lived is fast for sequential access, while on demand uses less memory but pays the open cost."],
    p: ["Seeking in long-GOP media decodes dozens of frames to show one, and scrubbing stalls.", "A decoder leak per seek exhausts memory over an eight-hour session."],
    v: "Seek to one thousand random frames in several codecs and confirm each returned frame equals the frame produced by sequential decode, with time per seek reported and decoders released on close.",
    dep: ["container-demux","hardware-codecs","frame-index","frame-memory-pools"]
  },
  "frame-index": {
    s: "A map from frame number or time to the position of the packet and the key frame that begins its decode, enabling exact seeking in any file.",
    d: "Some containers include an index; others do not, or give timestamps that do not match the displayed order. The indexer scans packets once, recording each frame's timestamp, size, offset and the nearest preceding key frame, and handles reordering so that display order is mapped to decode order. It is stored in a cache for later opens. The result lets the decoder jump straight to the right key frame. It is hard for files still being recorded, and for those with irregular timing.",
    k: ["Building the index at import vs lazily on first open: at import delays work to a predictable moment, while lazy keeps import fast but stalls the first seek.", "Trusting container timestamps vs counting frames: timestamps are cheap, but counting is exact when timestamps are wrong."],
    p: ["Frame-accurate seeks are off by one on a stream with initial negative timestamps.", "A stale index used after the file was extended shows too few frames."],
    v: "Index a stream with reordered frames, request each frame by number, and confirm the returned picture carries the expected burned-in number for every frame, including the first and last.",
    dep: ["container-demux","rational-time","metadata-extraction"]
  },
  "raw-and-log-media": {
    s: "Handles sensor-level raw files and log-encoded video, with the camera's own settings for debayering, white balance and exposure applied or adjustable at edit time.",
    d: "Raw files store sensor data before color processing. A debayer step reconstructs full-color pixels, applies white balance and gain, and converts to a working space. Some settings are baked in metadata and can be changed non-destructively in the editor, at a cost in decode time, so quality and speed are selectable. Log video is already processed but uses a flat curve that needs an input transform. It is hard because each camera maker defines its own decode and metadata, and debayering is slow.",
    k: ["Debayering at full quality vs reduced during editing: full is exact but slow, reduced is fast enough for playback and finalized at export.", "Camera settings applied on import vs adjustable per clip: applied on import is simple, adjustable keeps the sensor latitude available."],
    p: ["A raw clip is graded against the camera's default look, and the exported version uses different decode settings.", "Playing full-resolution raw on a modest machine is unusable without proxies."],
    v: "Decode a raw clip at each quality level, compare to a reference development of the same frame, and confirm adjusting white balance changes the image without re-import and export matches the preview settings.",
    dep: ["decoder-layer","color-pipeline","metadata-extraction"]
  },
  "variable-frame-rate": {
    s: "Normalizes recordings whose frame timing varies, as from phones and screen capture, to a constant rate so edits and sound remain in sync.",
    d: "Variable-rate files have frames at irregular timestamps, since the recorder drops or duplicates frames under load. Editing assumes a constant rate, so the editor either reads the timestamps and conforms the clip by dropping or repeating frames to a chosen rate, or transcodes to a constant-rate version at import. The conform must keep the first frame time and total duration so audio stays aligned. It is hard because the nominal rate stored in metadata is often just an average, and wrong choices cause slow drift.",
    k: ["Conforming on the fly vs transcoding at import: on the fly keeps the original, transcoding gives simple later behavior but costs time and space.", "Dropping and repeating frames vs blending: dropping is exact and cheap, blending hides judder but softens motion."],
    p: ["Trusting the average frame rate makes picture drift from sound over a long recording.", "Frame repeat patterns are uneven and visible in slow pans."],
    v: "Import a deliberately irregular recording with a counter and a tone, conform it, and confirm picture and tone remain aligned at start, middle and end, with total duration within one frame.",
    dep: ["frame-index","rational-time","proxy-generation"]
  },
  "metadata-extraction": {
    s: "Reads technical and descriptive metadata from files and sidecars: timecode, reel, camera settings, color encoding, lens data, GPS and embedded keywords.",
    d: "Metadata comes from container headers, per-frame data, sidecar files from cameras, and file system attributes. The extractor normalizes names and units into a common set, and stores source values so they are not lost. Timecode and reel name are used for sync and relink, color encoding for the color pipeline, and descriptive fields for search. It is hard because the same fact is stored differently by each device, and wrong or missing values silently cause errors downstream, such as wrong color.",
    k: ["Normalizing into a common schema vs keeping every native field: normalizing makes search and exchange consistent, while native fields keep full detail for specialized tools.", "Trusting embedded color tags vs overriding by user: trusting is automatic, overriding is needed when cameras tag incorrectly."],
    p: ["A wrong frame rate in metadata makes every duration calculation off.", "Timecode from a sidecar and from the stream disagree and the wrong one wins."],
    v: "Extract from a corpus of files from many sources, compare to values from a reference tool, and confirm timecode, frame rate, color encoding and audio layout match for every file.",
    dep: ["container-demux","media-file-io"]
  }
});
