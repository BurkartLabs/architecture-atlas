// Details for the video editor plate, part 4: playback engine and GPU acceleration.
ATLAS.details("video-editor", {
  "playback-engine": {
    s: "Plays the timeline in real time by repeatedly producing the right picture and sound for the current moment, coordinating decoding, effects, display and audio output.",
    d: "The engine turns the timeline model and a playhead position into a stream of frames and audio blocks. It runs pipelines for decode, effect evaluation and display in parallel, passes frames between them through bounded queues, and keeps all of them ahead of the output clock. It handles play, pause, loop, variable speed and in-out ranges. It reports dropped frames. It is hard because every frame has a variable cost, and a single slow stage will stall the whole stream.",
    k: ["Pipelined stages with bounded queues vs one thread per frame: pipelines smooth the load and bound memory, while per-frame threads are simpler but vary more in latency.", "Audio as master clock vs video as master: audio master avoids audible glitches and drops or repeats frames instead, while video master keeps picture smooth at the price of audio resampling."],
    p: ["An unbounded queue lets decode run far ahead and consume memory, then stalls on a seek.", "A single slow effect makes playback dip every time it appears, which an averaged measurement hides."],
    v: "Play a stress timeline of layered 4K clips for ten minutes with frame-time logging, and confirm dropped frames and audio underruns match the reported counters, with no growth in memory use.",
    dep: ["frame-scheduler","frame-graph","av-sync","decoder-layer"]
  },
  "frame-scheduler": {
    s: "Decides which frame to produce next, and when, from the playhead, the speed and the display refresh, driving the whole playback pipeline against a clock.",
    d: "A clock advances with the audio device or the display. For each tick the scheduler computes the target timeline time, maps it to a frame for the project rate, and issues requests for it and for upcoming frames to the render graph. It picks frames for rate conversion, such as 24 frames on a 60 hertz display, with a fixed cadence. It cancels requests that have become stale after a seek. The difficulty is making all of this deterministic and responsive when requests complete out of order.",
    k: ["Pull model driven by the output clock vs push model driven by decode: pull keeps pace with display and avoids waste, while push simplifies pipelines but may produce frames no one needs.", "Cancelling stale requests vs letting them finish: cancelling frees resources for the new position, but needs every stage to support it."],
    p: ["Uneven cadence when converting frame rates makes pans visibly judder.", "A seek while requests are in flight shows an old frame after the new one."],
    v: "Seek repeatedly during playback while logging presented frame numbers, and confirm every displayed frame matches the requested time, cadence at 24 on 60 hertz is the expected 3:2 pattern, and no stale frames appear.",
    dep: ["rational-time","timeline-model","platform-abstraction"]
  },
  "av-sync": {
    s: "Keeps picture and sound aligned during playback by timestamping both against one clock and compensating for the delay of each output device.",
    d: "Audio output has a fixed buffer and a known latency, while video presentation has its own pipeline delay. The engine reads the audio device's position as the master clock and presents each frame when its time matches, after subtracting measured delays. A user-adjustable offset corrects for external displays and processors. When video falls behind, it drops frames. When it runs ahead, it holds. The difficulty is that the reported device latency is often inaccurate, especially with wireless audio and external monitors.",
    k: ["Locking to audio position vs the system clock: audio position tracks what is actually heard, while the system clock is smooth but drifts from the device.", "Dropping late frames vs slowing audio: dropping keeps sync, slowing keeps every frame but is audibly wrong."],
    p: ["Wireless headphones add hundreds of milliseconds of delay that the editor does not know about.", "Display lag on an external monitor makes picture late relative to sound and is blamed on the footage."],
    v: "Play a clap-and-flash test clip through the real output chain, record picture and sound with a camera or sensor, and confirm the measured offset is within a few milliseconds after calibration.",
    dep: ["playback-engine","mixer-and-routing","frame-scheduler"]
  },
  "frame-graph": {
    s: "A per-frame graph of operations, from decoding sources through effects and compositing to the output, built from the timeline at a given time.",
    d: "For a requested time, the engine walks the timeline, finds visible clips, and builds a graph of nodes: decode, color transform, effects, transform, blend. Nodes declare their inputs and the region they need. The graph is simplified, for example by merging transforms and skipping nodes with no effect, and then scheduled across threads and the GPU. Intermediate results are cached by a key of node identity and parameters. The hard part is building and optimizing the graph fast enough to run every frame.",
    k: ["Rebuilding the graph for every frame vs reusing it across a stable range: rebuilding is simple and handles any edit, while reuse is cheaper but needs careful invalidation.", "Evaluating only the needed region vs the whole frame: region-based saves work on crops and zooms, at the cost of region math in every node."],
    p: ["A cached node result keyed without a parameter used by a plugin returns stale pixels after a setting change.", "Graph building walks every clip of a long timeline instead of only the ones at the current time."],
    v: "Change a single effect parameter, and confirm only nodes depending on it are re-evaluated, the output matches a full uncached evaluation exactly, and graph build time stays constant as timeline length grows.",
    dep: ["timeline-model","effect-framework","frame-cache","compositing-and-blending"]
  },
  "quality-fallback": {
    s: "Reduces work when the system cannot keep up, by lowering preview resolution, skipping effects or dropping frames, and restores quality as soon as it can.",
    d: "The engine measures time per frame against its budget. If it consistently exceeds it, it steps down through defined levels: render at half or quarter resolution, use proxies, bypass expensive effects, finally drop video frames while keeping audio intact. When load falls it steps back up. The editor shows which mode is active, so the person knows the picture is not final. The difficulty is hysteresis, avoiding flapping between levels, and keeping preview faithful enough for timing judgments.",
    k: ["Lowering resolution first vs dropping frames first: lower resolution keeps motion smooth for timing decisions, while dropped frames preserve full-quality stills.", "Automatic adaptation vs manual quality setting: automatic keeps playback working, while manual is predictable for people judging detail."],
    p: ["A silent bypass of an effect leads the editor to judge a shot without the grade it will have.", "Switching levels on every slow frame makes the picture quality visibly pulse."],
    v: "Play a timeline that exceeds capacity, and confirm audio never breaks, the indicator shows the reduced mode, quality steps down once and not repeatedly, and it returns to full after the heavy section.",
    dep: ["playback-engine","proxy-switching","frame-graph"]
  },
  "lookahead-prefetch": {
    s: "Reads and decodes media ahead of the playhead, in the direction of play, so frames are ready when they are due and seeks land quickly.",
    d: "A prefetcher predicts which source frames will be needed in the next seconds from the timeline, the speed and the direction, then asks the decoder layer to produce them into the frame cache. For long-GOP media it positions decoders at the preceding key frame. It also pre-opens files and decoders for upcoming clips, so a cut does not wait for a file open. It limits the work by memory and I/O budget. It is hard because wrong predictions waste resources, such as when the editor scrubs or reverses.",
    k: ["Aggressive look-ahead vs minimal: aggressive hides latency on cuts, but uses memory and disk throughput that other work needs.", "Predicting from the timeline vs from recent playhead motion: timeline-based is exact for normal play, motion-based adapts to scrubbing."],
    p: ["Prefetching while the disk is also writing a render makes both slow.", "Pre-opened decoders for many upcoming clips exhaust hardware decoder sessions."],
    v: "Play across a hundred cuts and confirm every first frame after a cut is served from cache with no wait, memory stays below budget, and seeking to a random point shows a frame within a defined delay.",
    dep: ["frame-cache","decoder-layer","frame-index","media-file-io"]
  },
  "preview-output": {
    s: "Sends the program to the editing interface's viewer, to a full-screen display or to external video hardware, with the right color and timing for each.",
    d: "The viewer shows frames in a window through the GPU, applying the display transform for that monitor. A second path outputs to a reference monitor, often through dedicated hardware that expects exact frame timing and signal format. Overlays such as guides, scopes and timecode are drawn separately from the program image. Some outputs run at a different rate than the project. It is hard to keep window display flicker-free and color correct, and to treat the monitor's calibration as part of the setup.",
    k: ["Window viewer using the operating system's color management vs the editor applying its own: the system's handling is convenient, the editor's own is predictable and consistent with scopes.", "Output through dedicated hardware vs the graphics output: dedicated hardware gives exact timing and signal, but adds cost and driver dependence."],
    p: ["Viewer shows a different gamma from the reference monitor, so grades are made against the wrong picture.", "Overlays burned into the output instead of drawn separately appear in the exported file."],
    v: "Display a ramp and a color chart in the viewer and on the reference output, measure both with a probe, and confirm they match the expected values for the active display transform.",
    dep: ["color-pipeline","gpu-abstraction","frame-scheduler"]
  },
  "gpu-abstraction": {
    s: "A thin layer over the platform's graphics and compute interfaces, giving the rest of the editor devices, buffers, textures and command submission without API-specific code.",
    d: "The layer exposes devices, queues, textures, buffers, shader programs and synchronization primitives with a common interface, implemented once for each supported graphics API. It handles device selection, feature detection, such as float formats or compute support, and reports capabilities upward. The renderer, effects and viewer use only this layer. It is hard to hide real API differences in memory, synchronization and shader languages without losing performance or capabilities on any platform.",
    k: ["One abstraction over several APIs vs targeting one API: abstraction lets the editor run on every platform, but costs a translation layer and lowest-common features.", "Shaders in one language cross-compiled vs hand-written per API: cross-compiling keeps one source, while hand-written shaders squeeze out more speed per platform."],
    p: ["A feature present on one vendor's driver but absent on another's is assumed everywhere.", "Driver bugs differ by version, so a working build breaks on a new driver."],
    v: "Run the rendering conformance suite on each supported API and driver, and confirm output frames match reference images within tolerance and every capability query reflects the actual device.",
    dep: ["platform-abstraction"]
  },
  "shader-runtime": {
    s: "Compiles, caches and runs the programs that execute effects, color transforms and compositing on the GPU, including those supplied by plugins.",
    d: "Effects supply shader source or a graph of operations. The runtime compiles them for the active device, caches the compiled form on disk keyed by source and driver, and binds inputs and parameters at draw time. It combines adjacent simple operations into one pass to avoid memory traffic. It uses tiles when a frame is too large for one dispatch. The challenge is compile time, which can freeze the first playback of a new effect, and output differences between drivers.",
    k: ["Compiling on first use vs precompiling known shaders: first-use handles plugins, while precompiling avoids a stall but covers only the built-in set.", "Fusing operations into one shader vs separate passes: fusing saves bandwidth, but explodes the number of shader variants."],
    p: ["First play of a new effect hangs for seconds while shaders compile on the render thread.", "A stale shader cache from an older driver produces corrupted output."],
    v: "Clear the cache, play a timeline using twenty effects, and confirm compile happens off the playback thread or ahead of time with no dropped frames, and a second run uses the cache.",
    dep: ["gpu-abstraction","plugin-host","background-jobs"]
  },
  "texture-management": {
    s: "Allocates, uploads and recycles GPU images for decoded frames and intermediate results, choosing formats and avoiding copies.",
    d: "Decoded frames arrive in CPU memory or as hardware surfaces, in planar or packed formats. The manager uploads them to textures, converting formats in shaders rather than on the CPU, and pools intermediate textures by size and format for reuse within a frame and across frames. Where possible a hardware-decoded surface is shared directly with the GPU without a copy. It is hard because copies between processors are expensive, and because lifetime is subtle: a texture can only be reused when all work using it has finished.",
    k: ["Pooling textures by format and size vs allocating on demand: pooling avoids allocation stalls and fragmentation, but holds memory even when idle.", "Zero-copy sharing of decoder output vs copying: sharing saves bandwidth, but ties the pipeline to specific hardware and driver paths."],
    p: ["Reusing a texture before the GPU has finished reading it produces flickering or torn frames.", "Format mismatch between decoder output and shader input forces a hidden slow conversion on every frame."],
    v: "Play a 4K timeline while profiling uploads and allocations, and confirm steady-state allocations are zero, CPU-to-GPU copies match the expected count, and no frames show reuse artifacts.",
    dep: ["gpu-abstraction","hardware-codecs","gpu-memory-budget"]
  },
  "float-precision": {
    s: "Chooses bit depth and numeric format for each stage so gradients stay smooth, highlights keep detail, and results are the same on every processor.",
    d: "Video arrives as eight, ten or twelve-bit integers, and the working pipeline uses sixteen or thirty-two-bit floating point so operations do not accumulate rounding errors or clip. Half-precision floats halve bandwidth but have limited accuracy near high values. The pipeline converts at defined boundaries, and dithers when reducing to an integer output. Different GPUs round slightly differently. The difficulty is balancing cost against banding, and ensuring that a tolerance defined for tests actually reflects what viewers see.",
    k: ["Sixteen-bit float intermediates vs thirty-two-bit: sixteen halves memory and time and suits most grades, thirty-two protects extreme operations at twice the cost.", "Dithering when quantizing vs plain rounding: dithering hides banding in gradients, but adds noise that interacts with compression."],
    p: ["An eight-bit intermediate in the middle of a chain causes visible banding in skies.", "Using half floats for large absolute values loses precision in HDR highlights."],
    v: "Render a long smooth gradient through a full effect chain, and confirm no visible banding, output within one code value of a double-precision reference, and clipped highlights stay recoverable.",
    dep: ["gpu-abstraction","color-pipeline"]
  },
  "cpu-fallback": {
    s: "A processor-based path for effects and conversions when no capable GPU exists or when a stage cannot run on it, producing results that match the GPU path.",
    d: "Every built-in operation has a reference implementation on the CPU, vectorized and run across threads in tiles. It is used on machines without suitable graphics hardware, in render nodes without GPUs, for operations that are not suited to the GPU, and as a reference for testing. The scheduler decides per node which path to use and moves frames between them when necessary. Keeping two implementations equivalent is the continuing cost, since any difference shows as a mismatch between preview and export.",
    k: ["Maintaining two implementations vs GPU only: two paths cover more hardware and give a test reference, at the cost of duplicated work and drift.", "Moving data to the CPU for one node vs failing the whole frame onto the CPU: a single transfer limits slowdown, while whole-frame fallback avoids repeated copies."],
    p: ["A tiny numeric difference between paths shows as a visible seam between tiles processed on different devices.", "A CPU-only node in the middle of a GPU chain makes real-time playback impossible."],
    v: "Render a test suite of effects on both paths and compare, requiring results within a stated tolerance, and confirm a machine without a GPU produces a complete export identical in cut points and close in pixels.",
    dep: ["effect-framework","job-system","float-precision"]
  },
  "hardware-codecs": {
    s: "Uses dedicated decode and encode circuits on the graphics processor or system chip, giving much higher speed and lower power than software codecs for the formats they support.",
    d: "Fixed-function blocks decode and encode common formats and bit depths. The editor queries which formats, profiles and resolutions are supported, opens sessions through the platform's video API, and feeds compressed data in and gets surfaces or frames out. There are limits on the number of simultaneous sessions, supported chroma formats and, for encoding, quality compared to good software encoders. The challenge is fallback: any unsupported stream or exhausted session must go to the software codec transparently.",
    k: ["Hardware decode for playback, software for export: hardware gives real-time speed, while software encoders usually give better quality per bit.", "Probing capabilities at start vs trying and falling back on failure: probing gives clean decisions, trying handles drivers that misreport."],
    p: ["Hardware decoders output slightly different pixels than software ones, so a re-render differs from the preview.", "Multicam with many streams runs out of hardware sessions and silently falls back to a slow path."],
    v: "Decode the same stream with hardware and software decoders and compare output, confirm sessions are released on close, and confirm exceeding the session limit falls back to software without errors.",
    dep: ["decoder-layer","gpu-abstraction","encoder-integration"]
  },
  "gpu-memory-budget": {
    s: "Tracks how much video memory is in use for frames, caches and intermediates, and evicts or downscales work so the device never runs out.",
    d: "The budget manager knows the device's memory, subtracts what the system and other applications use, and assigns shares to the texture pool, frame cache and effect scratch space. When a request does not fit, it evicts least recently used cached frames, splits the frame into tiles or reduces work. Overcommitting on some drivers causes silent paging that is extremely slow. The hard part is that demand depends on the timeline, with many layers of high-resolution media needing more than any budget.",
    k: ["Strict budget with eviction vs relying on driver paging: strict budgets keep performance predictable, while paging is simple but can stall for seconds.", "Tiled rendering of large frames vs failing: tiling lets any frame render in limited memory, at the cost of border handling in effects."],
    p: ["Another application takes video memory mid-session and the editor begins to stall without a clear cause.", "Cached frames are never evicted for intermediates and rendering fails while the cache sits full."],
    v: "Render a deliberately oversized composite on a device with limited memory, and confirm it completes correctly through tiling or eviction, memory use stays under the budget and no driver paging is observed.",
    dep: ["gpu-abstraction","texture-management","frame-cache"]
  }
});
