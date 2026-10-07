// Details for the graphics renderer plate, part 4: command recording and queues, synchronization, presentation.
ATLAS.details("graphics-renderer", {
  "command-pools": {
    s: "Memory owned by one thread from which command buffers are allocated and reset, so recording on different threads never contends.",
    d: "A pool belongs to one queue family and one recording thread at a time. Command buffers allocated from it are reset together when the pool is reset, which is far cheaper than resetting each one. The renderer keeps a pool per thread per frame in flight, resets the pool when that frame's fence signals, and reuses its memory. Pools grow as needed and rarely shrink. Using a pool from two threads at once is undefined, and resetting one whose buffers are still executing is a hang waiting to happen.",
    k: ["One pool per thread per frame vs a shared locked pool: per-thread pools remove locks and multiply object count; a shared pool is simple and serializes recording.", "Reset the whole pool vs reset individual buffers: whole-pool reset is cheap and requires everything finished; individual reset allows early reuse and costs more."],
    p: ["Resetting a pool before the fence for its last submission signals corrupts or hangs the GPU.", "Handing a pool to a job that runs on a different thread than the one that created it breaks the single-thread rule."],
    v: "Record from eight threads for a thousand frames with validation. No threading violations may be reported, and pool memory in use must be flat after warm-up.",
    dep: ["device-creation", "fences", "frames-in-flight"]
  },
  "command-recording": {
    s: "Writing GPU work into a command buffer as a sequence of state changes, binds, draws, dispatches, copies and barriers, executed later at submission.",
    d: "Nothing runs while recording. Commands are encoded into the buffer, which the GPU reads after submission. The renderer's wrapper tracks current pipeline and bindings to skip redundant sets, inserts debug markers and timestamp queries, and enforces correct ordering of begin and end for passes. Recording is typically the dominant CPU cost in a frame. Commands capture values at record time, so referenced memory such as data in constants must remain valid until execution. Recorded buffers can be replayed several times if created for that.",
    k: ["Redundant state filtering in the wrapper vs recording everything: filtering reduces command size and costs CPU compares; recording everything is simplest and bloats the stream.", "Immediate recording from passes vs deferring to a translation of a high-level command list: direct is fast and tied to one API; a list allows reordering and multiple backends and adds a layer."],
    p: ["Recording a draw that references a resource destroyed before submission crashes at execution, far from the cause.", "Forgetting to end a render pass before recording a copy yields errors only validation reports."],
    v: "Record one frame, count commands by type, and compare against the plan. With state filtering enabled the number of bind commands must fall by the expected ratio and the image must stay identical.",
    dep: ["command-pools", "pipeline-state", "binding-model"]
  },
  "parallel-recording": {
    s: "Splitting a frame's command recording across worker threads, each with its own command buffers, then submitting them in order.",
    d: "The frame's passes, or chunks of a large pass's draw list, are assigned to jobs. Each job records into its own command buffer from its own pool, and the results are collected and submitted in the correct order on the queue. Large passes can be split into secondary buffers executed inside one primary buffer. This scales recording with core count on explicit APIs, where recording does not take a global lock. The main risks are load imbalance, because the slowest job sets the pace, and too-fine splitting, where submission and per-buffer overhead outweigh the gain.",
    k: ["Parallelize by pass vs by splitting draw lists within a pass: per pass is simple and limited by the largest pass; splitting scales further and needs secondary buffers or chunked passes.", "Coarse jobs vs fine jobs: coarse jobs have little overhead and balance poorly; fine jobs balance well and add buffers and synchronization."],
    p: ["Ordering results by thread completion instead of the declared order draws transparent objects in a random sequence.", "Two jobs touching the same descriptor allocator or ring without protection corrupt each other's data."],
    v: "Measure render-thread CPU time with one, four and eight workers on a heavy scene. It must scale to the expected speedup and the image must be identical to the single-threaded result.",
    dep: ["command-pools", "secondary-buffers", "command-recording", "draw-list-sorting"]
  },
  "secondary-buffers": {
    s: "Command buffers recorded separately that a primary buffer executes inside a pass, or pre-recorded bundles replayed in many frames.",
    d: "A secondary buffer inherits pass state from the primary buffer that calls it. Different threads can record secondary buffers for one render pass, which the primary then executes in a single call. Bundles are reusable command lists for repeated geometry, replayed in later frames with no recording cost, but they fix the pipeline and bindings at recording time and have restrictions on which commands they contain. The execution cost of calling many small secondaries is not zero, and on some hardware the driver copies them, which loses the advantage.",
    k: ["Secondary buffers for parallelism vs several passes split across primaries: secondaries keep one render pass and allow parallel recording; multiple passes cost extra load and store traffic.", "Reusable bundles for static draws vs re-record every frame: bundles save CPU and become stale when bindings or culling change; re-recording is flexible."],
    p: ["A secondary buffer recorded with a different attachment format than the pass causes an invalid-state error or undefined results.", "A bundle that bakes in a descriptor for a freed resource keeps referring to it for as long as it is replayed."],
    v: "Record the opaque pass as eight secondaries on eight threads, compare the image with a single-buffer build, and confirm one render pass appears in the capture.",
    dep: ["command-recording", "render-passes", "command-pools"]
  },
  "queue-families": {
    s: "The hardware queues a device offers, usually graphics, compute and copy, each accepting a different set of commands and running independently.",
    d: "Queues are grouped by family with capability flags. The graphics family accepts all commands. Compute-only families run dispatches and copies, and copy-only ones run transfers on DMA engines. Queues in different families can execute concurrently, and a family may offer one or several queues. The renderer assigns passes to queues by type, and uses compute for async work and copy for streaming. Work on separate queues needs explicit synchronization, and the hardware may serialize them or share execution units, so concurrency is not guaranteed.",
    k: ["Use all three queue types vs graphics only: multiple queues overlap work and add synchronization complexity; a single queue is simple and leaves transfer and compute idle time.", "One queue per type vs several queues of a type: one is enough for most workloads; more allow priorities or independent submission and rarely help."],
    p: ["Assuming a dedicated compute queue exists breaks on hardware that exposes only one universal queue.", "Submitting from two threads to the same queue without external locking corrupts the queue."],
    v: "Print the queue families and their flags on three different GPUs and confirm the renderer maps passes to an available queue on each, with a clean fallback to one queue when only one exists.",
    dep: ["queue-selection", "queue-submission"]
  },
  "queue-submission": {
    s: "Hands recorded command buffers to a hardware queue along with the semaphores to wait on and signal, and the fence to mark completion.",
    d: "A submission contains one or more command buffers, a list of semaphores to wait on before starting with the stages that wait, and semaphores to signal when done. Submissions on one queue start in order but may overlap and finish out of order unless barriers say otherwise. Batching many buffers into one submission reduces overhead, while too large a batch delays the GPU starting. Submission is thread-unsafe per queue, so one thread, or a lock, owns it. A dedicated submission thread decouples recording from the driver's submission cost.",
    k: ["Few large submissions vs many small ones: large submissions reduce driver overhead and delay the first work; small ones start the GPU sooner and cost more calls.", "Submit on the render thread vs a dedicated submission thread: a dedicated thread hides driver cost and adds latency and a hand-off; inline is simple."],
    p: ["Forgetting a wait on the acquire semaphore draws into a swap chain image the display still owns.", "Submitting with a signal on a fence that is already signaled is invalid and ends in a lost device."],
    v: "Submit a frame with the GPU timeline capture on and confirm queue start times follow the submit order, waits release at the expected signals, and fences signal after the final command completes.",
    dep: ["command-recording", "fences", "timeline-semaphores", "queue-families"]
  },
  "barriers": {
    s: "Commands that order GPU work and make memory writes visible between uses, specifying which stages and access types come before and after.",
    d: "A barrier names source and destination pipeline stages, source and destination access masks, and the resources it affects. Work in the destination stage after the barrier waits for the source stage's earlier work, and the named caches are flushed and invalidated. Too weak a barrier gives hazards; too strong a one, like a full-pipeline barrier, stalls everything. Barriers are the main cost of explicit synchronization, and the render graph generates them automatically. Aliased memory, queue transfers and layout changes all use the same mechanism with extra information.",
    k: ["Precise stage and access masks vs conservative all-commands barriers: precise barriers permit overlap and are easy to get subtly wrong; conservative ones are safe and serialize the GPU.", "Batch barriers into one call vs issue individually: batching lets the driver merge flushes and requires collecting them first."],
    p: ["A barrier with the wrong destination stage passes testing on one vendor and corrupts output on another.", "A full-pipeline barrier added to silence validation sits in the code for years and costs milliseconds."],
    v: "Run a frame under synchronization validation with zero hazard reports. Then replace one barrier with a weaker one and confirm validation reports exactly that hazard.",
    dep: ["command-recording", "layout-transitions"]
  },
  "layout-transitions": {
    s: "Changing an image's internal arrangement in memory so it is optimal for its next use, such as render target, shader read or copy source.",
    d: "On some APIs an image has a layout that the driver uses to pick compression and tiling choices. A transition is part of a barrier and names the old and new layouts. Using an image in a layout that does not match the operation is an error and gives wrong results, and transitioning from an undefined layout discards the contents. Each subresource has its own layout, so mip chains can be mixed. Modern designs reduce the number of layouts, but the renderer must track the current layout of every resource and subresource to know the old layout.",
    k: ["Track layout per subresource vs per image: per subresource allows independent mips and arrays and costs bookkeeping; per image is simpler and forces uniform use.", "Transition from undefined when contents are dead vs preserve: undefined is faster and loses contents; preserving is safe and costs bandwidth."],
    p: ["Transitioning from an undefined layout on an image that still holds needed data erases the data.", "Sampling a depth image in an attachment layout gives undefined values on some GPUs and fine ones on others."],
    v: "Render to a texture, transition to shader read, sample and compare with a reference. Then deliberately skip the transition under validation and confirm a layout error names the image.",
    dep: ["barriers", "textures"]
  },
  "fences": {
    s: "Objects the CPU waits on to learn that a submitted batch of GPU work has finished.",
    d: "A fence is signaled when the GPU completes the submission it was attached to. The CPU can poll or block on it. Each frame in flight owns a fence, and before the CPU reuses that frame's command pools, staging memory or descriptors it waits for the fence. Fences are also used for readback and for deferred resource deletion. Waiting too early stalls the CPU and wastes the overlap between CPU and GPU, and waiting too late means reusing memory that is still in use.",
    k: ["One fence per frame in flight vs a single timeline value: per-frame fences are simple and numerous; a timeline counter replaces them with one object and monotonic values.", "Block with a timeout vs spin-poll: blocking saves power and wakes with scheduler latency; polling reacts fastest and burns a core."],
    p: ["Waiting on the fence at the start of recording instead of the start of resource reuse throws away CPU and GPU overlap.", "A fence created in the signaled state is forgotten, and the first wait returns immediately for a frame not yet submitted."],
    v: "Measure CPU wait time per frame with two frames in flight. It must be near zero when the GPU is the faster side and equal to the GPU time overshoot otherwise, never always the whole frame.",
    dep: ["queue-submission"]
  },
  "timeline-semaphores": {
    s: "Counters with a monotonically increasing value that queues and the CPU can wait on and signal, replacing many binary semaphores and fences.",
    d: "A timeline semaphore holds a 64-bit value. A submission signals it to a higher value when it completes, and other submissions or CPU threads wait until it reaches a given value. One object can express the whole frame's cross-queue dependencies, such as copy complete, compute complete and graphics complete, by assigning values in submission order. Waits can be issued before the signal is submitted. The renderer tracks the next value and the last known completed value. It is easier to reason about than a graph of binary signals.",
    k: ["Timeline semaphore per queue vs binary semaphore per dependency: timelines are few and simple to extend; binaries are universally supported and need creating, recycling and pairing signals with waits.", "CPU waits on timeline vs on fences: one primitive for CPU and GPU waits simplifies code and may be unavailable on older drivers."],
    p: ["Signaling a value lower than the current one is invalid and gets the device lost.", "Waiting on a value that no submission will ever signal hangs the queue forever, with no error."],
    v: "Chain copy, compute and graphics submissions through one timeline and confirm in a timeline capture that each starts only after its predecessor's value, with no extra stalls.",
    dep: ["queue-submission", "fences"]
  },
  "ownership-transfer": {
    s: "The paired release and acquire barriers needed to hand a resource from one queue family to another when the API requires exclusive ownership.",
    d: "On APIs with exclusive sharing, a resource belongs to one queue family at a time. Moving it requires a release barrier recorded on the source queue and a matching acquire barrier on the destination queue, with a semaphore between the two submissions. The contents persist. Concurrent sharing mode avoids this and may disable compression, so it is usually reserved for rarely moved resources. The render graph generates transfers when a pass on another queue touches a resource, and streaming code uses them to publish uploaded textures to graphics.",
    k: ["Exclusive ownership with explicit transfers vs concurrent sharing: exclusive keeps fast compressed layouts and requires paired barriers; concurrent is simple and may be slower on some GPUs.", "Transfer per resource vs batch per submission: batching reduces barrier count and delays use until the batch is released."],
    p: ["Recording only the acquire barrier, without the release, reads undefined contents on some drivers and works on others.", "A resource left owned by the copy queue is used by graphics without acquire and produces garbage."],
    v: "Upload a texture on the copy queue, transfer to graphics, sample it, and compare to the source on each GPU vendor in the test set. Remove the release and confirm validation flags it.",
    dep: ["barriers", "queue-families", "timeline-semaphores"]
  },
  "split-barriers": {
    s: "Barriers divided into a begin and an end, with independent work placed between them, so a transition overlaps useful work instead of stalling.",
    d: "A split barrier signals that earlier work has finished at the begin point, and waits for it at the end point. Commands between them can execute freely if they do not touch the resource. The render graph uses them when a producer pass finishes well before its consumer, such as when a compute pass writes data that is read two passes later. Events provide a similar primitive for synchronization within a queue. Overuse gives little benefit, and the intermediate state of the resource is restricted, which makes mistakes harder to spot.",
    k: ["Split barriers where there is slack vs a single immediate barrier: splitting hides latency and constrains what runs in between; an immediate barrier is simple and may stall.", "Events inside a queue vs pipeline barriers: events can overlap more and have platform quirks; barriers are well supported and strict."],
    p: ["Using the resource in the gap between begin and end gives undefined results.", "Splitting a barrier with no work in between adds overhead and no overlap."],
    v: "Insert a split barrier around a pass that is independent of the transition and capture the timeline. The independent pass must overlap the transition and total pass time must drop.",
    dep: ["barriers", "automatic-barriers"]
  },
  "swap-chain": {
    s: "A queue of images owned by the presentation engine, which the renderer acquires, draws into and presents to the display.",
    d: "The renderer creates a swap chain for a window surface with a format, color space, size, image count and usage. Each frame it acquires the next image, which may not be ready yet, signaling a semaphore when it is. It renders into that image and presents it after a semaphore signaled by rendering. The number of images, typically two or three, together with the presentation mode, determine latency and smoothness. The images are owned by the system, are re-created on resize, and are the only resources whose layout transitions to and from a presentation state.",
    k: ["Three images vs two: three lets the CPU and GPU run without waiting on the display and adds a frame of latency; two keeps latency low and stalls more often.", "Render directly to the swap chain image vs render offscreen and copy: direct saves a copy; offscreen allows resolution scaling and keeps the pipeline independent of the surface format."],
    p: ["Reusing a render-finished semaphore across frames before its present has consumed it triggers validation errors and rare hangs.", "Ignoring a suboptimal or out-of-date result from acquire leaves a stretched or black window after resize."],
    v: "Run for ten minutes while resizing, minimizing and moving between monitors. The swap chain must be re-created as needed, with no validation errors and no black frames.",
    dep: ["present-modes", "layout-transitions", "frames-in-flight"]
  },
  "present-modes": {
    s: "The policy that decides when a presented image appears on screen: synchronized to refresh, immediate, or replacing a queued image with the newest.",
    d: "First-in first-out mode waits for the display's refresh, prevents tearing and is always available, with a latency of one or more refresh intervals. Immediate mode shows the image as soon as it is presented, minimizing latency and allowing tearing. Mailbox keeps one pending image and replaces it, giving low latency without tearing and extra GPU work. Adaptive modes tear only when a frame is late. The renderer chooses a default from what the surface supports and lets users change it. Variable refresh displays change which choice is best.",
    k: ["Synchronized FIFO vs immediate: FIFO gives tear-free output with higher latency; immediate gives the lowest latency with tearing.", "Mailbox vs FIFO: mailbox lowers latency at a steady cost of rendering frames that are never shown; FIFO renders only what it shows and is more efficient."],
    p: ["Requesting a mode the surface does not support fails creation instead of falling back to FIFO.", "Immediate mode in a windowed compositor does not actually avoid the compositor's own synchronization."],
    v: "Measure input-to-photon latency with a high-speed camera or an LED probe in each mode. Results must follow the expected order and confirm no tearing in FIFO with a moving test pattern.",
    dep: ["swap-chain", "frame-pacing"]
  },
  "frames-in-flight": {
    s: "Letting the CPU prepare frame N+1, and sometimes N+2, while the GPU is still executing frame N, with per-frame copies of everything the GPU reads.",
    d: "The renderer keeps K sets of per-frame resources: command pools, descriptor ranges, constant ring regions and fences. Frame N uses set N mod K, and before reusing it waits on its fence. This overlaps CPU and GPU work, trading latency for throughput. Anything that is written each frame and read by the GPU must be duplicated or placed in a ring, and anything destroyed must be deferred until the K frames that might use it are finished. A deletion queue indexed by frame handles the second requirement.",
    k: ["Two frames in flight vs three: two keeps latency lower and exposes stalls; three absorbs spikes and adds a frame of input latency and more memory.", "Duplicate resources per frame vs ring-allocate within one buffer: duplication is simple; a ring uses memory efficiently and needs offset bookkeeping."],
    p: ["Destroying a resource when the CPU is done with it, not when the last in-flight frame finishes, crashes the GPU.", "Per-frame data indexed by swap chain image instead of frame index collides when the counts differ."],
    v: "Destroy resources every frame through the deferred queue with validation on for an hour. No use-after-free reports may appear, and measured latency must equal the configured frame count.",
    dep: ["fences", "command-pools"]
  },
  "frame-pacing": {
    s: "Controlling when frames start and present so that frame times are even, avoiding judder from uneven intervals as well as low average frame time.",
    d: "A steady 16.6 ms interval looks smoother than alternating 10 and 23 ms at the same average. The renderer paces by waiting on the present, using a timestamp of previous present times to predict when to start the next frame, and sometimes by capping the rate to a divisor of the refresh rate. Latency reduction schemes delay the start of CPU work so input is sampled as late as possible. Variable refresh displays relax the constraints. Pacing depends on knowing GPU time, which is why accurate timestamps matter.",
    k: ["Cap to a refresh divisor vs run uncapped: capping gives even intervals and wastes headroom; uncapped has lower latency and uneven pacing.", "Sample input late with a predicted start time vs start immediately: late sampling reduces latency and risks missing the deadline if the prediction is wrong."],
    p: ["Timing frames on the CPU only hides that the GPU is running late, and judder remains.", "A pacer tuned for one refresh rate misbehaves when the user moves the window to a monitor with a different rate."],
    v: "Record present timestamps for a minute and plot the interval histogram. At the target rate it must be concentrated around one value, with the ninety-ninth percentile below the threshold.",
    dep: ["present-modes", "timestamp-queries", "swap-chain"]
  },
  "hdr-output": {
    s: "Presenting in a wide-gamut, high-brightness format when the display supports it, with output encoding and brightness mapped to the display's capability.",
    d: "The renderer queries the surface for supported formats and color spaces, such as a 10-bit format with a perceptual transfer curve, or a floating-point linear format. It then maps scene-referred color to the display's peak brightness and gamut in the final pass, normally after tone mapping, with paper white and peak luminance as settings. UI is composed at a controlled brightness so it does not glare. The system compositor may transform output further. Mistakes make a standard-range image look dim or blown out.",
    k: ["Render to an HDR swap chain format vs an SDR target converted by the system: HDR gives direct control and needs a separate tone map; system conversion is automatic and varies.", "Fixed peak luminance setting vs reading display metadata: metadata adapts automatically and is often wrong or missing; user settings are reliable and need a calibration screen."],
    p: ["Composing UI in the scene-referred range makes text blinding on HDR displays.", "A swap chain created in a format that is supported but with the wrong color space produces washed-out colors."],
    v: "Show a ramp and a peak white patch on an HDR display and measure with a meter. Brightness must follow the requested curve up to the configured peak, with SDR output visually unchanged.",
    dep: ["swap-chain", "tone-mapping"]
  },
  "surface-recreation": {
    s: "Handling window resize, minimize, monitor change and device loss by destroying and rebuilding the swap chain and every size-dependent resource.",
    d: "When the window size changes, acquire or present reports that the swap chain is out of date. The renderer waits for the GPU to finish work that uses the old images, destroys the swap chain and all targets that depend on its size, and creates new ones. The render graph makes this easier, since size-dependent targets are transient. A minimized window has zero size and must pause rendering. Device removal, from a driver reset or unplugged adapter, requires recreating the entire device and every resource from the application's own data.",
    k: ["Wait for idle then rebuild vs defer deletion of old resources: waiting is simple and hitches; deferring keeps rendering and requires careful lifetime tracking.", "Recreate on any resize event vs only when the surface reports out-of-date: events react fast and thrash during a drag; surface status is accurate and lags."],
    p: ["Creating a swap chain with a zero-size extent on minimize fails and the app crashes.", "Size-dependent resources not tied to the resize path keep the old size and render a quarter of the window."],
    v: "Drag the window edge continuously for a minute, minimize and restore, and switch monitors. No validation errors, crashes or stale-size images may occur, and rendering must resume within a few frames.",
    dep: ["swap-chain", "frames-in-flight", "transient-resources"]
  }
});
