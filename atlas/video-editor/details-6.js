// Details for the video editor plate, part 6: proxies and caches, foundation, cross-cutting concerns.
ATLAS.details("video-editor", {
  "proxy-generation": {
    s: "Creates lightweight, easy-to-decode copies of heavy media in the background, matching the original's timing exactly so edits can be made on the copy.",
    d: "A background job transcodes each original to a low-resolution, intra-frame or lightly compressed format that decodes quickly at any position. Timecode, frame count, rate and audio layout must match the original exactly, since the proxy stands in for it. Proxies live next to the media or in a managed cache, and are linked to the original through the media item. Generation can start at import, on camera cards or on a server. It is hard because mismatched length or timing makes the final conform differ, and because the job competes with the editor for resources.",
    k: ["Intra-frame proxies vs long-GOP: intra-frame gives instant random access at larger file size, while long-GOP is small but scrubs poorly.", "Generating at import vs on demand: at import has proxies ready, while on demand saves storage but makes the first use slow."],
    p: ["A proxy with one dropped frame silently shifts everything that follows against the original.", "Proxy generation saturates the disk and CPU, and the editor stutters while working."],
    v: "Generate proxies for a corpus, compare each against its original for duration, frame count, timecode and audio length, and confirm all match exactly and scrub latency on the proxy is under the target.",
    dep: ["decoder-layer","background-jobs","encoder-integration","variable-frame-rate"]
  },
  "proxy-switching": {
    s: "Toggles between proxy and full-resolution media for viewing and rendering, per clip or per project, without changing the edit.",
    d: "Each media item can hold links to alternate versions: original, proxy, optimized. A project-level mode decides which is used for playback, while export always uses originals unless told otherwise. Switching reopens decoders, swaps cached frames and keeps the playhead exactly in place. The effect framework must make results resolution-independent, so a blur is the same fraction of the frame at any size. It is hard to ensure that the switch is invisible to the edit and never leaves a clip on the wrong version.",
    k: ["Project-wide mode vs per-clip choice: project-wide is simple and clear, per-clip allows mixing when only some proxies exist.", "Always exporting originals vs allowing proxy export: originals guarantee quality, while proxy export is useful only for drafts and risky as a default."],
    p: ["A clip that lacks a proxy plays the full-resolution original and stalls the whole timeline.", "Effect parameters in pixels give a different look at proxy and full resolution."],
    v: "Toggle proxy mode during playback and export, and confirm the playhead does not move, no edit changes, the export uses originals, and a resolution-independent effect renders the same look in both modes.",
    dep: ["proxy-generation","clips-and-references","effect-framework"]
  },
  "thumbnail-waveform-cache": {
    s: "Stores small preview images and audio waveform summaries for every clip, so the timeline and bins can draw instantly without decoding media.",
    d: "Filmstrip thumbnails are decoded at intervals and stored at small size; waveforms are stored as min and max values per block at several zoom levels, a multi-resolution summary. They are generated in the background on import and cached on disk keyed by media identity. The timeline draws from them at any zoom. Missing entries are drawn as placeholders and filled in later. The difficulty is volume across large libraries and invalidation when the media changes.",
    k: ["Multi-resolution waveform summaries vs recomputing on zoom: summaries draw instantly at any zoom, at the cost of extra stored data and generation time.", "Thumbnails at fixed intervals vs adaptive to scene changes: fixed is simple and predictable, adaptive shows more useful frames at more cost."],
    p: ["A waveform generated from the proxy differs from the one for the original's audio.", "Thousands of items generating thumbnails at once starves playback of disk throughput."],
    v: "Open a timeline of five hundred clips with an empty cache and confirm the timeline draws immediately with placeholders, fills in progressively, and drawn waveforms match values computed from the audio.",
    dep: ["decoder-layer","background-jobs","disk-cache"]
  },
  "frame-cache": {
    s: "Keeps recently decoded and recently rendered frames in memory, so playing, looping and scrubbing over the same area do not repeat the work.",
    d: "Two levels are common: decoded source frames keyed by media and frame number, and rendered composite frames keyed by the timeline content at that time. Entries are evicted by recency with weight for cost and size. Pinned ranges, such as a loop, are kept. The cache must be keyed by everything that influences the result. It is hard because memory is limited while frames are large, with a single 4K float frame taking over a hundred megabytes, so budgets and eviction are central.",
    k: ["Caching decoded sources vs caching final composites: sources are reusable across edits, composites save the most work but are invalidated by any change below them.", "Cost-aware eviction vs plain least-recently-used: cost-aware keeps expensive frames longer, while LRU is simple and predictable."],
    p: ["A key that omits one effect parameter returns a stale composite after the change.", "The cache grows until the operating system starts paging and playback gets slower than without caching."],
    v: "Loop a ten-second range twice and confirm the second pass takes no decode work and hits the cache for every frame; edit one clip and confirm only affected frames are recomputed.",
    dep: ["frame-memory-pools","cache-invalidation","gpu-memory-budget"]
  },
  "disk-cache": {
    s: "Stores renders, proxies, conformed audio and analysis results on disk with size limits, so they survive restarts and can be shared or cleaned.",
    d: "The disk cache holds items larger or longer-lived than memory allows: preview renders, conformed audio, waveforms, indexes, optimized media. Each entry records its key, size, last use and source identity. A manager enforces a size limit, removes least valuable entries, and cleans entries whose sources are gone. The location is chosen by the user, ideally on a fast drive separate from the media. It is hard to keep the cache consistent after crashes and to avoid it silently filling the system drive.",
    k: ["One shared cache location vs per-project: shared gets reuse across projects, per-project is simple to clean up and archive.", "Automatic size limit with eviction vs manual cleanup: automatic prevents full disks, but may delete a render someone was about to need."],
    p: ["The cache fills the system drive and the operating system becomes unstable.", "Partially written cache entries after a crash are later read as valid."],
    v: "Fill the cache past its limit, confirm least valuable entries are evicted and total size stays under limit, kill the process during a write, and confirm no partial entry is used afterwards.",
    dep: ["media-file-io","cache-invalidation"]
  },
  "background-jobs": {
    s: "Schedules low-priority work such as proxies, indexing, waveform generation, analysis and caching, so it uses spare resources without disturbing editing.",
    d: "Jobs are queued with a priority, a resource profile and dependencies, for example proxy before waveform. The scheduler watches CPU, GPU and disk use and pauses or throttles when the editor is playing or rendering. Jobs are cancellable, restartable and persisted so work survives a restart. Visible items, such as clips on screen, are promoted. It is hard to be a good neighbor on shared resources, and to make progress visible without making it distracting.",
    k: ["Throttling by measured load vs fixed low priority: measured load uses idle time well, while fixed priority is simple but still competes for disk and memory bandwidth.", "Persisting the job queue vs in-memory only: persisted work survives crashes, but stale jobs must be validated against current files."],
    p: ["Background analysis competes for the GPU and causes playback to drop frames.", "A failed job retries forever and keeps the machine busy."],
    v: "Start playback while two hundred background jobs are queued, and confirm playback holds its frame rate, jobs resume when playback stops, and a killed process restarts them from persisted state.",
    dep: ["job-system","media-file-io"]
  },
  "cache-invalidation": {
    s: "Determines when cached frames, proxies and renders no longer match the project, using content keys and dependency tracking instead of timestamps alone.",
    d: "Each cached item records a key built from everything that produced it: source media identity, clip range, effect and parameter values, color settings, plugin versions and project resolution. When any ingredient changes, the key changes and the old entry is simply never found. The editor also tracks dependencies so dirty ranges can be shown on the timeline, for example the red and yellow bars over unrendered sections. It is hard to include every input in the key, and over-invalidating throws away expensive work.",
    k: ["Content-addressed keys vs explicit invalidation events: keys cannot go stale if complete, while events are precise but easy to forget.", "Coarse invalidation of whole clips vs per-frame ranges: coarse is simple and safe, per-frame saves work when only a section changed."],
    p: ["A newly installed plugin version has the same name, and old cached results keep being used.", "Over-broad keys invalidate every render when a project setting such as a title changes."],
    v: "Change one effect parameter, plugin version, color setting and source file in turn, and confirm each invalidates exactly the affected frames, while unrelated frames still hit the cache.",
    dep: ["timeline-model","effect-framework","clips-and-references"]
  },
  "optimized-media": {
    s: "Full-quality intermediate versions of difficult formats, made once so editing and rendering run faster without a quality drop worth noticing.",
    d: "Some camera formats are costly to decode, such as long-GOP with high bit rates or variable rate. Optimized media is a transcode into an editing-friendly codec at the original resolution and high quality, usually intra-frame with ten or more bits. It is meant to replace the original in all processing, including final render, unlike a proxy. It trades disk space, often several times larger, for speed. It is hard to ensure generation transcode loss is truly negligible and that color and timing carry over exactly.",
    k: ["Optimized media at full resolution vs proxies at reduced resolution: optimized supports final output, while proxies are much smaller and enough for judging cuts.", "Transcoding everything vs only difficult formats: everything gives uniform behavior, selective saves time and space."],
    p: ["Transcoding through a lower bit depth bakes in banding that was not in the original.", "Storage use triples and no one notices until the drive is full."],
    v: "Transcode a set of clips, compare against originals in pixel difference after decode, and confirm differences stay below a set threshold and timing, timecode and color tags are identical.",
    dep: ["encoder-integration","decoder-layer","background-jobs","disk-cache"]
  },
  "platform-abstraction": {
    s: "Isolates operating system differences for windows, input, files, threads, displays and audio devices behind one interface, so the rest of the editor is portable.",
    d: "The layer wraps windowing and event loops, high-resolution timers, file system calls, native dialogs, color profile access, audio device I/O and display enumeration. Platform code is kept in one place, so the rest of the editor never includes system headers. It also abstracts capability differences, for example available hardware decode APIs or path rules. The difficulty is keeping it thin while real differences, such as case sensitivity, file locking and display color management, leak through.",
    k: ["Own thin abstraction vs a portable toolkit: own abstraction gives control over latency and color, while a toolkit saves effort but limits the real-time behavior.", "Lowest common denominator vs per-platform features: common keeps behavior identical, per-platform features give the native feel and best performance."],
    p: ["File paths with non-ASCII characters or very long names fail on one platform only.", "Timer resolution differs and playback pacing is correct on one system and uneven on another."],
    v: "Run the platform conformance tests on every supported system, and confirm file, timer, audio device and display queries return equivalent results, including long and non-ASCII paths.",
    dep: []
  },
  "job-system": {
    s: "A pool of worker threads and a scheduler that runs decode, render, analysis and export tasks in parallel with priorities and dependencies.",
    d: "Work is expressed as tasks with declared dependencies and priorities, run by a fixed pool sized to the processor. Real-time tasks, such as audio mixing and playback frames, outrank background ones. Tasks split large frames into tiles to spread across cores. Blocking I/O is kept off the main workers. Cancellation propagates, so a seek stops the old work. It is hard to avoid priority inversion and oversubscription, since decoders, effects and the GPU driver each have their own threads.",
    k: ["One shared pool vs separate pools per subsystem: shared uses cores efficiently, while separate pools prevent background work from starving real time.", "Fine-grained tile tasks vs one task per frame: tiles balance load across cores, while whole frames have less overhead and simpler state."],
    p: ["A real-time audio thread waits on a lock held by a background worker and glitches.", "Libraries spawning their own thread pools oversubscribe the cores and slow everything."],
    v: "Run playback at full load with traces of thread activity, and confirm real-time tasks always start within their deadline, cores are not oversubscribed, and cancelled tasks stop within a frame time.",
    dep: ["platform-abstraction"]
  },
  "frame-memory-pools": {
    s: "Preallocated, reusable blocks for large frame buffers, with accounting and limits, so playback does not allocate memory frame by frame.",
    d: "Frames are large and arrive at video rates, so general allocation causes fragmentation and pauses. Pools hold buffers by size and format, hand them out with reference counts and take them back when the last user finishes. Buffers can be aligned for vector processing and for upload to the GPU. Total use is capped, and requests beyond the cap wait or evict cached frames. It is hard because ownership of a frame is shared among decode, cache, effects, viewer and encoder, and a leak or early return shows up as corruption.",
    k: ["Reference-counted shared buffers vs copying: sharing avoids heavy copies, but any consumer that modifies in place must copy first.", "Fixed pool sizes vs growing on demand: fixed is predictable, growing adapts to unusual media at the risk of exhausting memory."],
    p: ["A consumer that modifies a shared buffer in place corrupts a cached frame others still use.", "A missed release leaks a buffer per frame, and the editor dies hours into a session."],
    v: "Play and export for one hour while tracking pool counters, and confirm allocations stay constant, all buffers return to the pool when idle, and no cached frame is ever altered by a consumer.",
    dep: ["platform-abstraction"]
  },
  "media-file-io": {
    s: "Reads and writes very large media files with the right buffering, read-ahead and error handling for local drives, network shares and removable media.",
    d: "Media access is sequential for playback and random for scrubbing, and often concurrent over many files. The I/O layer uses asynchronous reads, aligned buffers, read-ahead for streaming access, and bypasses the system cache where that helps. It handles network storage latency, drives that disappear and files being written by another process. Writes during export are buffered and flushed safely. It is hard because performance differs across storage types and failures, such as a dropped network share, must show as offline media, not a crash.",
    k: ["Asynchronous direct reads vs memory-mapped files: direct reads give control over buffering, while mapping is simple but hides stalls and unmount failures.", "Large read-ahead vs minimal: large read-ahead smooths playback on slow storage, but wastes bandwidth when scrubbing."],
    p: ["A network share briefly disconnects and the editor hangs instead of marking media offline.", "Reading from a removable drive that is pulled out leads to a crash in the decoder."],
    v: "Play from local, network and removable storage while interrupting the connection, and confirm throughput matches the stream rate, and interruptions produce an offline indication and recovery without crashing.",
    dep: ["platform-abstraction","job-system"]
  },
  "plugin-host": {
    s: "Loads third-party effects, codecs and tools, gives them a stable interface and limited access, and contains their crashes and misbehavior.",
    d: "Plugins are discovered at start, validated, and loaded with a declared interface version. The host passes frames, parameters and services, and imposes limits on time and memory. Because plugins are native code written by many parties, the host may run them in a separate process, with shared memory for frames, so a crash fails one effect, not the project. Compatibility is managed by versioned interfaces. The difficulty is isolation without the cost of copying frames, and giving users a clear message when a plugin is missing.",
    k: ["In-process plugins vs out-of-process: in-process is fast and simple, while out-of-process contains crashes but adds frame-transfer cost.", "Strict interface versioning vs permissive loading: strict versioning avoids undefined behavior, while permissive loading keeps old plugins working at some risk."],
    p: ["A plugin crash during export kills the process and loses the render queue.", "A project opened without a plugin silently drops its effect from the render."],
    v: "Run a plugin that crashes on purpose during playback and export, and confirm the host survives, marks only that effect as failed, and the project opens with a visible missing-plugin warning.",
    dep: ["platform-abstraction","job-system","frame-memory-pools"]
  },
  "scripting-api": {
    s: "Exposes the project and its commands to scripts and external programs, so repetitive work, batch jobs and pipeline integration can be automated.",
    d: "The API offers read access to the model and the same commands the interface uses, so a script's changes are undoable and validated like manual ones. It runs in an embedded interpreter or through a local connection from outside, with versioned names and documented types. Typical uses are batch import with naming rules, report generation, conform and render automation. It is hard to keep a stable public surface while internals change, and to prevent scripts from corrupting the project or hanging the interface.",
    k: ["Scripts using the same command layer as the UI vs direct model access: the command layer keeps validation and undo, while direct access is faster but can break invariants.", "In-process scripting vs external control: in-process is fast and convenient, external lets existing tools drive the editor and survives script crashes."],
    p: ["A long-running script blocks the main thread and the editor appears frozen.", "A change to an internal name breaks every studio's automation without warning."],
    v: "Run a script that imports, trims, labels and exports one hundred clips, and confirm the result equals the same work done manually, every step appears in undo history, and a script error leaves the project valid.",
    dep: ["edit-operations","undo-history","render-queue"]
  },
  "diagnostics": {
    s: "Collects logs, performance traces and crash reports, with project and system context, so failures on real machines can be reproduced and fixed.",
    d: "A logging layer records events with levels and subsystem tags, including decoder errors, dropped frames, device resets and plugin failures. Performance traces mark frame stages for timing analysis. On a crash, a handler writes a minimal dump and recent logs, then offers to send them without media or private data. Diagnostics also reports hardware and driver versions, which explain many failures. It is hard to log enough to explain a failure without slowing playback or leaking personal information.",
    k: ["Always-on lightweight tracing vs enabling on demand: always-on explains the first occurrence of a rare problem, on demand has no cost but misses it.", "Automatic crash upload vs user-initiated: automatic gives complete data, user-initiated respects privacy and the sensitive nature of unreleased footage."],
    p: ["Logs containing file names and paths reveal confidential project titles when shared.", "Trace overhead on the render thread changes timing enough to hide the bug."],
    v: "Force a crash during playback, and confirm a dump and recent logs with hardware context are produced, contain no media content or personal paths when scrubbed, and the next start offers recovery.",
    dep: ["platform-abstraction","job-system"]
  },
  "frame-accuracy-and-time": {
    s: "Every component must agree that a frame is an exact instant, and that time is exact arithmetic, because one frame of error is a visible failure in sync, cuts and exports.",
    d: "Frame accuracy depends on rational time, correct handling of drop-frame labels, exact timestamps in demux and mux, and consistent rounding between rates. Each layer, from the source viewer to the encoder, converts between frames, samples and time. Mixed frame rates, variable-rate sources and retimes multiply conversions. The rule is to convert once, at defined boundaries, with integer arithmetic. It is hard because errors are tiny, accumulate over duration and appear only in conform or after delivery.",
    k: ["One time representation everywhere vs per-module native units: one representation prevents drift, while native units avoid conversions in hot paths.", "Rounding policy fixed globally vs per operation: fixed policy makes results predictable, per operation fits odd cases but invites inconsistency."],
    p: ["A single module using floating-point seconds introduces a one-frame drift after an hour.", "An off-by-one at import is not seen until the round trip to a colorist and back."],
    v: "Burn frame numbers into a test source, run it through import, an edit, a retime, export and re-import, and confirm every displayed frame number and audio sample position matches expectation exactly.",
    dep: ["rational-time","frame-index","muxing","sync-and-drift"]
  },
  "end-to-end-color-management": {
    s: "Color meaning must be tracked from camera encoding through grading to display and delivery, because a wrong tag anywhere shifts every image after it.",
    d: "Each clip's color space and range are metadata that travel with it. The pipeline converts to a working space once, grades there, and converts to each output with a defined transform. The viewer, scopes and export all use the same transforms, so what is seen is what is measured and delivered. Mixed HDR and SDR content, monitors with different calibrations, and delivery formats with their own conventions complicate this. It is hard because the common failure is a mismatch that looks plausible and is therefore not noticed.",
    k: ["A managed pipeline with explicit transforms vs treating all footage as the same encoding: managed is correct for mixed sources, while the simple route is faster but wrong when sources differ.", "Display calibration inside the editor vs in the operating system: inside gives repeatable results, system calibration works across applications."],
    p: ["A source tagged incorrectly is graded to look right, then every later output inherits the error.", "Scopes read pre-transform values, so a legal-looking signal is out of range at delivery."],
    v: "Pass a calibrated test chart in every supported encoding through to each output, measure patch values with a probe or analyzer at the display and the exported file, and confirm they match references.",
    dep: ["color-pipeline","luts-and-transforms","video-scopes","hdr-and-tone-mapping"]
  },
  "non-destructive-editing": {
    s: "No edit changes source media: the project is a description of how to build the result from untouched files, which is what makes undo, relink and re-export possible.",
    d: "Clips reference source ranges, effects are parameters, titles are generated, and caches are disposable. The final picture is always a function of the timeline and the sources. This lets editors revise anything later, share projects without media, and re-render at another resolution. The cost is that every view is computed, so evaluation speed matters, and that references must stay valid. It is hard where destructive operations are tempting, such as baking effects for speed or consolidating media.",
    k: ["Computing everything from the description vs baking results into media: computing keeps full flexibility, baking is faster to play but locks decisions.", "Disposable caches vs caches treated as data: disposable caches can always be rebuilt, so the project never depends on them."],
    p: ["A feature that writes into source files makes one editor's change affect another's project.", "A baked render replaces the live effect and the original settings are lost."],
    v: "Checksum all source media before and after a long editing session with every feature used, and confirm no file changed; delete all caches and confirm the project renders identical frames.",
    dep: ["clips-and-references","timeline-model","cache-invalidation","undo-history"]
  },
  "real-time-budget": {
    s: "Playback has a fixed time per frame, and every component spends from that budget, so each must state what it costs and what it gives up when the budget is exceeded.",
    d: "At sixty frames per second each frame has about sixteen milliseconds to decode, process, composite and display, and audio must never miss its own deadline. Budgets are divided among decode, effects, GPU work and presentation, and each stage has a cheaper mode to use under pressure. Measurement uses per-stage timings and worst cases, not averages. It is hard because cost varies by content, with many layers and heavy effects at one point and none elsewhere, so the same editor feels fast and slow in the same project.",
    k: ["Degrading quality under load vs stopping to render: degrading keeps timing judgments possible, while stopping to render gives exact pictures at the cost of continuity.", "Per-stage budgets vs one global target: per-stage budgets locate overruns, while a global target lets cheap stages subsidize expensive ones."],
    p: ["Averaged frame time looks healthy while individual spikes cause visible stutter.", "Adding an effect that is cheap alone pushes a layered section over budget."],
    v: "Play the heaviest section of a reference project with per-frame stage timings, and confirm worst-case frame time, dropped frames and audio underruns against stated limits for the hardware class.",
    dep: ["playback-engine","quality-fallback","frame-scheduler","gpu-memory-budget"]
  },
  "format-diversity": {
    s: "The editor must accept hundreds of codecs, containers and camera conventions, so isolating format knowledge behind narrow interfaces decides how fast support can be added.",
    d: "New cameras and delivery formats appear continuously, each with quirks in timestamps, color tags, audio layouts and metadata. Format knowledge is concentrated in demuxers, decoders, metadata extractors and encoders, behind uniform interfaces, so the timeline and effects never see it. A corpus of real files from many cameras is the test base. Licensing and hardware support differ between formats. It is hard because every format is a long tail of exceptions, and files from failed recordings must still be opened.",
    k: ["Wide built-in support vs plugin-based codecs: built-in works out of the box, while plugins let formats be added without releases at the cost of version management.", "Fail on unknown vs best-effort decode: failing is clear and safe, best-effort rescues footage but may produce wrong frames."],
    p: ["A new camera firmware changes metadata layout and breaks color tagging for that camera only.", "A format supported for decode but not for export strands people who need to deliver in it."],
    v: "Run a corpus of real camera files from each supported format through import, playback and export, and confirm every file opens, frame counts match the source, and failures are reported with a specific cause.",
    dep: ["container-demux","decoder-layer","encoder-integration","metadata-extraction"]
  },
  "crash-safety": {
    s: "The editor must assume it will crash, so saves are atomic, work is journaled and background jobs are restartable, and no failure may lose finished work or damage media.",
    d: "Crashes come from plugins, drivers, memory exhaustion and unusual files. Defenses are layered: atomic project saves, autosave and journals, isolating risky code in separate processes, persistent queues, and never writing to source media. Recovery on restart is automatic and tells the user what was restored. Long exports write to temporary names and publish on completion. It is hard because these mechanisms are rarely exercised, and untested recovery paths fail when needed.",
    k: ["Isolating risky components in processes vs keeping everything in one: isolation contains failures, but adds communication overhead and complexity.", "Frequent autosave vs rare: frequent saves lose little work, but cost responsiveness on large projects."],
    p: ["A recovery file saved with a bug in a corrupted state restores the corruption.", "A crash during export leaves a plausible but truncated file under the final name."],
    v: "Inject crashes at random points during editing, saving, caching and exporting for hundreds of runs, and confirm every restart restores a valid project within one command of the last edit and no media or final output is damaged.",
    dep: ["project-file","autosave","plugin-host","render-queue"]
  }
});
