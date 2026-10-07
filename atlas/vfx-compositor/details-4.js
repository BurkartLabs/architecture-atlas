// Details for the VFX compositor plate, part 4: color pipeline, media I/O, compute, cross-cutting concerns.
ATLAS.details("vfx-compositor", {
  "working-space": {
    s: "The single color space in which all compositing math is done, usually scene-linear with wide primaries so light adds and blends physically.",
    d: "Every input is converted into the working space on entry and every output is converted out of it. Scene-linear means pixel values are proportional to light, so a merge that adds two lights, a blur and an exposure change behave as in the real world. A wide gamut avoids clipping saturated colors from digital cameras and renderers. The working space is chosen once per show and recorded in the configuration. It is hard because mixed spaces in one comp, from a forgotten conversion, produce effects that look almost right and fail only in some colors or highlights.",
    k: ["Scene-linear working space vs display-referred working space: linear gives physically correct blends and bright highlights; display-referred matches legacy habits and misbehaves for light math.", "Very wide gamut vs moderate gamut: wide holds all sources without clipping and makes negative values and hue shifts possible; moderate is safer and clips some camera colors."],
    p: ["A single input left in its camera log space makes glows and blurs look wrong in every shot using it.", "Changing the working space mid-show changes every approved look."],
    v: "Merge two lights of values 0.25 each with an add operator, convert the result to display, and confirm it equals the display transform of 0.5, then repeat in a nonlinear space and show the mismatch.",
    dep: ["config-driven-transforms","pixel-types"]
  },
  "config-driven-transforms": {
    s: "A shared configuration file defining every color space, transform, display and look by name, so all tools in a studio convert colors identically.",
    d: "The configuration lists named color spaces with transforms to and from a reference space, displays with their views, looks and roles such as scene-linear or compositing log. Applications load it from a path set by the environment and ask it to build a processor for a given conversion. Sharing one file across the compositor, renderer, review and editorial keeps handoffs consistent. It is hard because versions of the configuration change what names mean, and a farm machine with a different configuration renders different pixels with no error.",
    k: ["One studio-wide configuration vs per-show configurations: one file is consistent and slow to change; per-show files fit each project and multiply management.", "Roles that map to names vs hardcoded space names: roles let tools survive renames; hardcoded names are explicit and break across configurations."],
    p: ["A farm machine loading a default configuration renders a subtly different look than workstations.", "A renamed color space leaves old scripts pointing to a missing name and falling back silently."],
    v: "Print the effective configuration path and a hash of its contents on a workstation and on a farm machine, and confirm they are equal, then convert a test chart on both and confirm identical outputs.",
    dep: ["startup-hooks","working-space"]
  },
  "input-transforms": {
    s: "Converts footage and renders from their capture or authoring color space into the working space, chosen per source.",
    d: "Camera files arrive in a vendor log encoding with their own primaries, scans in a film density encoding, renders already in linear, and graphics in a display space. Each reader assigns an input color space, by metadata, naming rules or manual choice, and the transform converts to the working space. Conversion may be an analytic formula or a lookup table. It is hard because assignments are made per file, and a wrong one is not an error: the image just looks a little off, and the mistake travels to every downstream grade.",
    k: ["Assign input space automatically from metadata vs manually per reader: automatic is fast and trusts the tags; manual is deliberate and slow and error-prone at scale.", "Analytic transforms vs lookup tables: analytic transforms are exact and available for known encodings; lookups cover anything and approximate between samples."],
    p: ["Treating a log-encoded plate as linear makes it look washed out and silently ruins keying and blur.", "A graphics file treated as linear is far too bright after display."],
    v: "Read a chart with known patches in its native encoding, convert it, and confirm that the middle gray patch lands at 0.18 and white at the expected scene value in the working space, within 1 percent.",
    dep: ["config-driven-transforms","working-space","image-attributes"]
  },
  "display-transforms": {
    s: "Maps working-space values to what a particular monitor or projector should receive, including tone mapping and the display's primaries and transfer function.",
    d: "A display transform chains a rendering step that compresses the large scene range into the display's range with a conversion to its color primaries and encoding. The viewer applies it on the fly. Different views, such as standard monitor, wide-gamut or cinema projector, share the same working data. It is applied only for viewing and delivery, never baked into working pixels. It is hard because everyone must see the same thing: a different transform on the reviewer's player than the artist's viewer makes approvals meaningless.",
    k: ["Tone-mapped view transform vs simple transfer curve: tone mapping gives a pleasing and consistent rendering of highlights and is a studio-wide choice; a simple curve is predictable and clips bright values.", "Apply in the viewer on the GPU vs bake into review files: viewer application keeps the data live; baking is portable and fixed."],
    p: ["An artist unknowingly working with a view meant for another display grades to compensate for it.", "The display transform baked into a precomp is applied again at output."],
    v: "Display a scene-linear ramp through the transform, read the screen values with a probe or colorimeter, and confirm they match the transform's reference values and that a patch at 0.18 lands at the expected display code value.",
    dep: ["config-driven-transforms","working-space","lut-application"]
  },
  "lut-application": {
    s: "Applies sampled one-dimensional and three-dimensional lookup tables to convert or grade colors, with interpolation between the stored samples.",
    d: "A one-dimensional table maps each channel independently, often for a transfer curve. A three-dimensional table is a cube of output colors sampled on a grid of inputs, and a pixel's output is interpolated from the nearest grid points, trilinearly or tetrahedrally. The tables are loaded from files or generated from analytic transforms. On GPUs they are textures. It is hard because tables sample a continuous function: input values outside the table's range clip, shaped inputs are needed for high dynamic range, and interpolation error appears in saturated colors and near the neutral axis.",
    k: ["Large cube vs small cube: large cubes are accurate and use more memory and load time; small cubes are fast and show interpolation errors.", "Trilinear vs tetrahedral interpolation: trilinear is simple; tetrahedral follows the neutral axis better and is slightly more complex."],
    p: ["A table intended for display-referred values applied to scene-linear data clips all highlights.", "A table applied twice, once in the viewer and once in a node, double-grades the image."],
    v: "Pass a neutral gray ramp through an identity table and confirm the output equals the input within one code value, then pass a saturated ramp and confirm the interpolation error is below the stated tolerance.",
    dep: ["pixel-types","gpu-execution","config-driven-transforms"]
  },
  "looks-and-grades": {
    s: "Creative color adjustments such as primary grades, secondary selections and look files, applied in a defined place and space in the pipeline.",
    d: "Grading operators include offset, gain, gamma, saturation, curves and selections by hue or luminance. The result is stored as parameters or as a shareable file so the same look is applied in the compositor, review and final grade. Operators work in a working or special grading space such as a log encoding, because controls behave predictably there. A look is applied to unpremultiplied color and often restricted by a matte. It is hard because the same numbers produce different results in different spaces, so a look is meaningful only with the space it was made in.",
    k: ["Grade in the working space vs in a log encoding: working space is physically plausible and has unfamiliar controls; log encoding matches traditional grading tools and requires conversions around it.", "Bake the look into the comp vs apply it separately at review: baking gives a single source of truth; applying separately keeps the comp neutral for the final grade."],
    p: ["Grading premultiplied color changes edges and leaves dark outlines.", "A look applied in the comp and again by the colorist doubles its effect."],
    v: "Apply a known gain of 2 to a 0.18 gray patch in the working space and confirm the output is 0.36, then apply the same look in review and confirm the shown values match the comp's output view.",
    dep: ["working-space","premult-handling","lut-application"]
  },
  "gamut-and-clipping": {
    s: "Handles colors outside the target display's range or the working gamut, through clamping, compression or mapping, without breaking brightness or hue.",
    d: "Scene-referred images contain values far above what a display can show, and saturated colors that fall outside a smaller gamut, sometimes with negative components. Handling includes soft compression of highlights, desaturation toward the gamut boundary and clamping at delivery. Negative values from keying or filtering must be understood and not clipped early. It is hard because a hard clip is lossy and visible as hue shifts or flat areas, and gamut mapping choices affect every delivery format differently.",
    k: ["Clamp at the end vs compress gradually: clamping is simple and gives hard flat regions and hue shifts; gradual compression keeps detail and changes values near the boundary.", "Preserve negative values in the working space vs clip them: preserving avoids losing data and can surprise operators; clipping is safe and discards information."],
    p: ["Clipping negative values before a filter changes edges and breaks reversible operations.", "A very saturated light turns a different hue after clamping each channel separately."],
    v: "Pass a saturated out-of-gamut test color through the delivery path and confirm its hue stays within the stated tolerance and that no channel is negative or above the legal maximum in the output file.",
    dep: ["display-transforms","working-space","pixel-types"]
  },
  "sequence-readers": {
    s: "Source nodes that open frames from a sequence or movie by frame number and present them as images, assigning color space and handling missing frames.",
    d: "A reader maps the graph's frame to a file, opens it with the appropriate format decoder, optionally reads a region or a subset of channels, and returns pixels in the working pixel type. Settings include the frame range, behavior outside it, the input color space and proxy path. Readers cache open handles and headers. They request only the needed rows and tiles when the format supports it. It is hard because reads are the most common stall: a network hiccup makes the whole evaluation wait, and file formats vary in how they report errors for truncated frames.",
    k: ["Read only requested channels and regions vs whole frames: partial reads save bandwidth and need format support; whole reads are simple and wasteful.", "Fail on a corrupt frame vs substitute: failing exposes defects; substituting keeps a render going with an undetected bad frame."],
    p: ["A truncated file from an interrupted copy decodes with a black bottom half and passes without warning.", "Opening and closing a file on each tile request multiplies latency on network storage."],
    v: "Read a frame with only the alpha channel requested and a small region, and confirm from I/O statistics that bytes read are a small fraction of the file, with alpha values identical to a full read.",
    dep: ["compression-codecs","path-and-frame-patterns","image-sequences","input-transforms"]
  },
  "compression-codecs": {
    s: "Schemes that shrink frame data for storage, lossless or lossy, chosen to balance file size, decode speed and fidelity.",
    d: "Lossless schemes, such as run-length, zip-based and wavelet or predictor-based coding, reproduce pixels exactly. Lossy schemes quantize in a transform domain to reduce size by an order of magnitude, with quality settings. Block sizes affect random access: compression in groups of scanlines lets a reader fetch only needed rows. Noise and grain resist lossless compression. It is hard because the choice affects the pipeline: lossy intermediates degrade every generation, decode speed bounds playback, and some formats do not preserve floating-point values exactly.",
    k: ["Lossless vs lossy intermediates: lossless keeps exactness and uses much more storage; lossy is small and accumulates artifacts across versions.", "Small compression blocks vs large: small blocks allow partial reads and compress less efficiently; large blocks compress better and force reading more."],
    p: ["A lossy codec on a key plate blurs the edge detail the keyer needed.", "Choosing a slow-to-decode codec makes playback of the composite impossible even from fast storage."],
    v: "Write a test frame with each codec, read it back, and compare to the original: lossless must match exactly and lossy must stay within the declared error, with the decode time per frame recorded.",
    dep: ["pixel-types","image-sequences"]
  },
  "video-decode": {
    s: "Decodes movie containers and inter-frame codecs into individual frames, providing frame-accurate seeking where the format allows.",
    d: "Video files store most frames as differences from others, so decoding a frame can require decoding a sequence from the previous key frame. The decoder seeks, builds a cache of recent frames and converts from the chroma-subsampled, limited-range encoding to full-range RGB. Frame-accurate random access needs an index and often decoding ahead. Timecode and frame rate come from the container. It is hard because seeking is slow and sometimes inexact, color range and matrix are frequently untagged or wrong, and variable frame rates break frame numbering.",
    k: ["Decode on demand vs transcode to a sequence first: on demand is convenient and slow and sometimes inexact; transcoding first costs time and gives exact fast access.", "Trust container color tags vs configured assumptions: tags are correct when set; assumptions are consistent and wrong for odd sources."],
    p: ["Limited range interpreted as full range lifts blacks and clips whites.", "Seeking lands on the nearest key frame instead of the requested frame by a few frames."],
    v: "Decode a clip where each frame has its number burned in, request frames 1, 500 and 1000 randomly, and confirm each returned frame shows the requested number and sensible black and white levels.",
    dep: ["compression-codecs","input-transforms","image-attributes"]
  },
  "writers-and-encoders": {
    s: "Output nodes that render a frame range and write files in a chosen format, with the right channels, bit depth, compression and tags.",
    d: "A writer asks the graph for each frame, converts from the working space and pixel type to the file's, encodes and writes. Options cover channels to include, compression, bit depth, metadata, and whether to overwrite. Good writers write to a temporary name and rename on completion, so readers never see a partial frame. Movie writers feed an encoder and need frames in order. It is hard because writing is the last place any mistake can be fixed, and failures such as disk full or permission errors must stop the job instead of leaving holes.",
    k: ["Write to temporary names then rename vs write directly: renaming gives atomic completion and needs support from the file system; direct writes are simple and expose partial files.", "Render in order vs any order: any order parallelizes for sequences; order is required for movies and limits speed."],
    p: ["A full disk produces zero-length files that look present to dependency checks.", "Writing without the display transform or with a wrong tag delivers frames that look different from approvals."],
    v: "Render ten frames to a directory, kill the process mid-frame, and confirm no partial frame appears under the final name, then complete the render and confirm every file decodes and matches the viewer.",
    dep: ["compression-codecs","pixel-types","metadata-propagation"]
  },
  "path-and-frame-patterns": {
    s: "The notation for naming frame files and for substituting variables such as show, shot and version in paths, resolved at open and render time.",
    d: "Patterns use markers for the frame number and padding, and tokens that expand from project settings. Resolution happens through a function that maps tokens to real directories, so the same script works on workstations, the farm and a vendor's machines. Paths are also validated and normalized across operating systems. The pattern is part of file identity for caching and for dependencies. It is hard because paths are the most common reason a script fails off the artist's machine, and token resolution must be deterministic, fast and available everywhere.",
    k: ["Tokenized paths resolved at runtime vs absolute paths: tokens relocate scripts easily and need a resolver everywhere; absolute paths are simple and break on every move.", "Resolve once at open vs at every access: once is fast and goes stale when settings change; every access is right and slower."],
    p: ["A resolver unavailable on the farm makes every task fail at open with unresolved tokens.", "Mixed path separators across systems make a script work on one platform only."],
    v: "Open a script on a machine with a different mount root, set the root token, and confirm every reader and writer resolves to existing files without editing any path in the script.",
    dep: ["startup-hooks"]
  },
  "network-storage-access": {
    s: "How the system reads and writes frames on shared storage, managing latency, bandwidth, caching and many machines hitting the same files.",
    d: "Frames live on networked storage shared by artists and the farm. Throughput limits how many frames per second can be read: a single uncompressed high-resolution frame can exceed a hundred megabytes. Tools use read-ahead, local caches of source frames, larger sequential reads and limits on concurrent requests. Directories with tens of thousands of files are slow to list. It is hard because contention is invisible: the same graph is fast at night and slow at noon, and the farm can saturate storage and slow every artist.",
    k: ["Local caching of sources vs reading directly: caching speeds repeated reads and needs space and freshness checks; direct reads are always current and bound to network speed.", "Throttle farm concurrency vs maximize throughput: throttling protects artists and slows the farm; maximizing finishes sooner and degrades interactive work."],
    p: ["A farm burst reading the same plates saturates the network and freezes artists' viewers.", "Listing a directory of huge sequences on every evaluation stalls the tool."],
    v: "Read the same 100-frame range from two workstations while the farm is idle and loaded, and record frames per second for each, confirming the loaded case stays above the interactive threshold set by throttling.",
    dep: ["sequence-readers","retry-and-failure-logs"]
  },
  "gpu-execution": {
    s: "Runs image operators on a graphics processor through shader or compute kernels, trading transfer cost and precision details for large throughput.",
    d: "Many operators are per-pixel or small-neighborhood math, which maps well to thousands of parallel threads. The system uploads tiles to device memory, runs kernels, and reads the result back or displays it directly. Chains of GPU nodes keep data on the device to avoid transfers. The same operator is often implemented twice, for the CPU and the GPU, and must give matching results. It is hard because device memory is smaller than frames, transfers are slow, drivers differ in precision and behavior, and a result that differs slightly from the CPU path breaks reproducibility.",
    k: ["GPU path for every operator vs only for heavy ones: every operator avoids transfers and multiplies implementations; heavy ones only is simpler and transfers more.", "Same kernel source for CPU and GPU vs separate implementations: shared source guarantees closer parity; separate code allows full optimization and drifts."],
    p: ["Device memory exhaustion on a large frame crashes the session or falls back to a slow path unannounced.", "Different drivers produce slightly different values and the farm and workstations disagree."],
    v: "Render the same graph on the CPU path and the GPU path and confirm the maximum per-pixel difference is below the documented tolerance, with the GPU timing measured per node.",
    dep: ["kernel-language","memory-budgeting","float-precision","device-fault-isolation"]
  },
  "cpu-vector-kernels": {
    s: "Hand-tuned inner loops using wide vector instructions so one core processes several pixels or channels at once.",
    d: "Operators work on rows of floating-point pixels in structure-of-arrays or interleaved layouts, and kernels use vector registers to process four to sixteen values per instruction. Cache-friendly access, aligned allocations and avoiding branches in the inner loop matter more than clever math. Runtime detection selects the best kernel for the host. Results must match the scalar reference. It is hard because wide vector paths can change rounding, because machines in a farm have different instruction sets, and because such code is expensive to maintain.",
    k: ["Runtime dispatch among kernels vs one baseline kernel: dispatch uses each machine's best features and multiplies testing; one baseline is simple and slower.", "Interleaved vs planar pixel layout: interleaved suits color operations on a whole pixel; planar suits channel-wise operations and vectorizes better."],
    p: ["A kernel using an instruction missing on older farm machines crashes with an illegal instruction.", "A faster path with different rounding changes images between workstation and farm."],
    v: "Run every kernel against its scalar reference on random and edge-case inputs, and confirm the maximum difference stays within the documented bound while timing shows the expected speedup.",
    dep: ["float-precision","thread-pool"]
  },
  "memory-budgeting": {
    s: "Divides finite memory among caches, working images, device buffers and the rest of the system, with limits and eviction so the process never runs out.",
    d: "A frame of floating-point pixels with many channels is hundreds of megabytes, and a graph holds many of them. The engine tracks allocations, gives each cache a share, reports use, and releases cached data under pressure, usually by least cost to recompute. Per-thread working buffers are bounded. Reserving headroom for the operating system avoids swapping. It is hard because memory is consumed in bursts by large operators and by many threads at once, and when it runs out on a farm machine the process is killed with little to diagnose.",
    k: ["Hard limits per cache vs a shared pool: hard limits are predictable and waste spare room; a shared pool uses everything and lets one consumer starve others.", "Evict on pressure vs pre-allocate fixed memory: eviction adapts and complicates timing; fixed memory is predictable and wasteful on small comps."],
    p: ["Running many frames in parallel multiplies working memory beyond physical memory and the system swaps.", "Memory limits set for a workstation are left on the farm, which has more, and slow everything."],
    v: "Render a heavy graph under a stated memory limit and confirm peak resident memory from the operating system stays below it, with eviction counters showing the caches released data and the output unchanged.",
    dep: ["memory-cache","scanline-tile-scheduling"]
  },
  "float-precision": {
    s: "The rules for how floating-point arithmetic is done and rounded so results stay accurate over long chains of operations and across machines.",
    d: "Compositing accumulates thousands of operations on values spanning many orders of magnitude. Computation uses 32-bit floats, with storage sometimes in half precision. Sums over large regions, such as scopes and blur normalization, need care to avoid accumulation error. Special values such as not-a-number and infinity can be created by divisions and must be contained. Vector and GPU paths may fuse operations and change rounding. It is hard because small differences are invisible individually and add up to banding, flicker or farm disagreement.",
    k: ["32-bit computation with half storage vs all 32-bit: half storage saves memory and bandwidth and rounds at every store; all 32-bit is exact and costs twice as much.", "Strict deterministic arithmetic vs fast arithmetic: strict gives identical results everywhere and is slower; fast reorders operations for speed and varies by machine."],
    p: ["A single not-a-number pixel spreads through a blur into a growing black square.", "Repeated half-precision storage on slow gradients produces visible banding."],
    v: "Run a chain of one hundred small gain operations forward and inverse on a gradient, and confirm the final differs from the input by less than the stated tolerance with no not-a-number values in any channel.",
    dep: ["pixel-types"]
  },
  "thread-pool": {
    s: "A fixed set of worker threads that execute tasks from tiles, nodes and frames, sized to the machine and shared by every part of the engine.",
    d: "One pool avoids creating threads per operation and avoids oversubscription when parallel operators nest. Work is split into tasks placed on queues, and idle workers take tasks from busy ones. The pool is shared by the evaluator, readers, the cache writer and background playback. Priorities let interactive requests overtake background ones. It is hard because nested parallelism can deadlock if workers block waiting for subtasks, and because the interface thread must stay free while the pool saturates every core.",
    k: ["Work-stealing queues vs a single shared queue: stealing scales better with many cores and is more complex; a shared queue is simple and contends under load.", "Reserve a core for the interface vs use every core: reserving keeps the tool responsive and slows rendering; using all cores maximizes throughput and makes the interface stutter."],
    p: ["A task that blocks a worker waiting on subtasks deadlocks when all workers are blocked.", "Background caching at equal priority slows the viewer during editing."],
    v: "Run a parallel render on all cores while moving the interface, and confirm interaction latency stays within the target, then confirm a nested-parallel graph completes without deadlock on a machine with two cores.",
    dep: []
  },
  "kernel-language": {
    s: "A restricted language for writing pixel operators once and compiling them to run on both CPU and GPU, used for custom effects.",
    d: "Artists and technical directors write short functions that take pixels from inputs and return a value, with access to coordinates, parameters and neighbors. The tool compiles the source at load time to the selected device, with a restricted subset that has no pointers or unbounded loops. It lets users create custom effects without building native plugins and with no risk to the host process. It is hard because the same source must behave identically on devices, error messages must be understandable, and complex effects hit the language's limits.",
    k: ["Restricted portable language vs native plugins: portable kernels are safe and run anywhere with limits on expressiveness; native plugins are unrestricted and risk crashes.", "Compile at load vs ahead of time: load-time compilation is flexible and delays startup; ahead of time is fast and ties kernels to a device."],
    p: ["A kernel that reads outside its declared neighborhood produces seams at tile edges.", "Compiling many kernels at startup delays every farm task by seconds."],
    v: "Write a kernel that brightens by a parameter, compile it for CPU and GPU, and confirm both outputs match within tolerance on a test image, and that a deliberate syntax error is reported with a line number.",
    dep: ["gpu-execution","cpu-vector-kernels","regions-of-interest"]
  },
  "device-fault-isolation": {
    s: "Containing failures of the graphics driver or a plugin so one bad operator or hung device does not lose the artist's session or a farm job.",
    d: "GPU kernels can hang or crash drivers, and plugins can fault. Mitigations include running risky work in separate processes, setting watchdog timeouts, validating kernel inputs, and falling back to the CPU path when a device operation fails. Autosave and the recovery file limit the loss. On the farm, a device fault marks the machine and retries the task elsewhere. It is hard because a driver failure can corrupt the whole process or the whole display, and fallbacks must produce results consistent with the failed path.",
    k: ["Fallback to the CPU after a device error vs fail the task: fallback keeps work going and may change results slightly; failing is honest and needs a retry.", "Out-of-process execution vs in-process: separation survives crashes and costs copying; in-process is fast and fragile."],
    p: ["A hung kernel freezes the whole desktop display until the driver resets.", "A silent CPU fallback produces a slightly different image than the rest of the shot."],
    v: "Inject a fault into a GPU operator during a render, and confirm the session survives, the event is logged with the node name, and the fallback result matches the reference within tolerance.",
    dep: ["gpu-execution","retry-and-failure-logs","project-files-and-autosave"]
  },
  "reproducibility": {
    s: "The property that the same script, inputs and configuration produce identical pixels on any machine at any later date.",
    d: "Reproducibility depends on pinned software and plugin versions, stored color configuration, deterministic arithmetic, seeded random operators and script snapshots. It underlies review, because approved frames must be re-renderable, and fixes, because a client note six months later needs the same result with one change. Sources of drift include different drivers, different instruction sets, unversioned macros and changed source files. It is hard because exact bit equality is rarely free: speed optimizations change rounding, and teams choose a tolerance instead of exactness.",
    k: ["Bit-exact results vs tolerance-bounded results: bit exactness allows simple verification and limits optimization; tolerance permits fast kernels and needs a judged threshold.", "Pin all software per show vs track the latest: pinning keeps old shots stable and delays fixes; tracking gets improvements and changes shots."],
    p: ["A driver update changes grain or noise and old shots no longer match approved frames.", "Unseeded random operators produce different noise on every render."],
    v: "Re-render an approved shot months later from its stored snapshot with the pinned versions, and compare every frame to the archived output with a pixel difference tool, confirming zero or within-tolerance differences.",
    dep: ["cache-invalidation","float-precision","render-submission"]
  },
  "color-discipline": {
    s: "The rule that every image has a known color space at every stage, and every conversion is explicit, so no number is ever ambiguous.",
    d: "A color-disciplined pipeline defines the working space, assigns an input space to every source, applies the same display transform for review and delivery, and tags every output. It forbids baking display transforms into working data and treats a missing tag as an error. Review, editorial and the final grade use the same configuration. The effect crosses all layers: keyers, grades, blends, scopes, readers and writers. It is hard because the cost of violation is invisible until late, and because many people at many tools each need to follow the rule.",
    k: ["Strict enforcement with errors on untagged images vs permissive defaults: strict stops mistakes early and annoys artists; permissive keeps flow and lets errors reach delivery.", "Central configuration vs local overrides: central gives consistency and slow change; local overrides allow experiments and fragment the pipeline."],
    p: ["One untagged source silently treated as linear passes review because the viewer compensates.", "Different tools in the chain using different default transforms make delivered frames differ from approved frames."],
    v: "Send a test chart with known patch values through the entire path from reader to delivered file and to the review player, and confirm patch values match expected values at each stage within tolerance.",
    dep: ["working-space","config-driven-transforms","display-transforms","input-transforms"]
  },
  "resolution-independence": {
    s: "The principle that effects are defined relative to the frame, not to pixel counts, so the same comp works at proxy, full and larger resolutions.",
    d: "Parameters such as blur size, transform offsets and shape coordinates are expressed in units tied to the format, or scaled automatically with the proxy factor. Shapes rasterize at the requested resolution and tracked data is stored in normalized coordinates. Overscan and alternate deliverable sizes reuse the same script. The principle touches proxies, roto, trackers, readers and writers. It is hard because some operations are inherently pixel-based, such as grain size and sharpening radius, and artists' habits of typing pixel values make comps that look different when the format changes.",
    k: ["Normalized units vs pixel units: normalized units survive any resize and read abstractly; pixel units are familiar and break at another resolution.", "Resolution-independent grain vs pixel-sized grain: independent grain matches across sizes and costs a resample; pixel-sized grain is fast and changes character."],
    p: ["A script built with pixel offsets at full resolution is wrong at proxy and in an alternate deliverable size.", "Shapes drawn on a downscaled proxy have coarse edges at full size."],
    v: "Render a frame at half and full resolution from one script, upscale the half-resolution output, and confirm feature positions and effect sizes agree within a pixel at full scale.",
    dep: ["proxy-resolutions","roto-shapes","display-and-data-windows"]
  },
  "precision-and-bit-depth": {
    s: "The decision of how many bits and which numeric type pixels carry at each stage, from capture to storage to delivery.",
    d: "Precision is chosen for each stage: float for computation, half float for files, integers for display and delivery. Higher precision costs memory, bandwidth and storage; lower precision risks banding, clipping and error accumulation. Data channels such as depth need full precision while color can use less. Dither is applied when reducing bit depth for delivery. The decision touches readers, caches, nodes, writers and the GPU. It is hard because failures are statistical and appear on smooth gradients, in dark areas and after many operations, not on test frames.",
    k: ["Float throughout vs reduced precision where it seems safe: float throughout avoids surprises and costs memory; reduced precision saves resources and risks banding.", "Dither on delivery vs plain rounding: dither hides banding and adds noise; plain rounding is clean and shows steps on gradients."],
    p: ["An intermediate saved at 8 bits creates banding in a sky gradient that grading then exaggerates.", "A pass stored at the wrong precision loses detail in dark areas that relighting later brightens."],
    v: "Render a slow gradient and a deep shadow gradient through the complete chain, view them at high contrast, and confirm the steps in the output are no larger than the target bit depth's step size.",
    dep: ["pixel-types","float-precision","compression-codecs"]
  },
  "interchange-with-other-tools": {
    s: "The ability to exchange images, cameras, geometry, color settings and timing with renderers, editors, trackers and review tools without loss.",
    d: "A compositor sits between many tools. Images move in open container formats with named channels and deep data; cameras and geometry in scene interchange files; edit decisions as lists with timing; color through the shared configuration. Each boundary has conventions on units, axes, naming and range. Interchange needs conventions agreed in the pipeline, not only formats. It is hard because every exchange is a chance to lose data silently, and because tools support different subsets of the same format.",
    k: ["Open formats with conventions vs studio-private formats: open formats work with any tool and need agreed conventions; private formats are tidy and lock you in.", "Strict validation at boundaries vs trust: validation catches mismatches at publish time and slows delivery; trust is fast and lets mistakes travel."],
    p: ["Axis or unit conventions differing between tools place a camera correctly in shape and wrongly in scale.", "A tool dropping a layer on resave removes a pass a later stage expected."],
    v: "Round-trip a scene with a camera, a deep render and a color-tagged plate through each partner tool and back, and confirm channels, units, timing and tags are preserved and a check script reports no differences.",
    dep: ["multipart-containers","camera-solve-import","config-driven-transforms","shot-database-link"]
  },
  "cost-per-frame": {
    s: "The budget of time and memory a frame may consume, which constrains what a comp may contain and how a shot is built.",
    d: "A feature may have thousands of shots, each with hundreds of frames, and multiple versions. Every extra second per frame multiplies into days of farm time and storage. Budgets influence structure: how much is precomped, which operators are used, whether deep data is kept, and what resolution iterations run at. They also decide hardware, licenses and storage. It is hard because costs are spread: a slow node, a huge intermediate or a heavy cache policy looks fine in one shot and ruinous across a show, and measurement must be per node.",
    k: ["Optimize the graph vs add hardware: graph optimization saves time every render and takes skilled effort; hardware is quick to buy and scales cost linearly.", "Per-frame time budgets enforced by tooling vs advisory: enforcement keeps shots in range and can block creative work; advisory is flexible and drifts upward."],
    p: ["A single unoptimized node used in thousands of shots wastes weeks of farm time.", "Judging cost from one frame misses the heavy frames in the middle of a shot."],
    v: "Render a representative frame range with per-node timing and memory profiling enabled, then check that the sum of node times matches the frame time within 10 percent and that the heaviest frame stays under the shot's budget.",
    dep: ["memory-budgeting","frame-chunking","precomp-and-freeze","gpu-execution"]
  },
});
