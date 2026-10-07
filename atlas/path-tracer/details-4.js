// Details for the path tracer plate, part 4: CPU foundation, GPU rendering, cross-cutting concerns.
ATLAS.details("path-tracer", {
  "simd-math": {
    s: "Vector math types and routines that process several rays, points or colors per instruction, wrapping the processor's vector units behind a portable interface.",
    d: "Rendering code works on small vectors, and wide registers let the same arithmetic run on four, eight or sixteen rays at once. The library provides vector and matrix types, masked operations for divergent lanes and fast approximations of functions such as reciprocal, square root, sine and exponent. Code is compiled for several instruction sets and selected at startup. The challenge is divergence: when lanes of one vector need different branches, masks waste work, and results from different widths can differ in the last bits.",
    k: ["Explicit vector types vs trusting the compiler to vectorize: explicit control gives predictable speed, but is harder to write and maintain.", "Fast approximate functions vs exact ones: approximations are several times faster, and add error that may be visible in extreme highlights or in reproducibility."],
    p: ["Different instruction sets give slightly different results, so the same frame differs between machines in a farm.", "A path that is mostly masked off wastes full vector width of work."],
    v: "Run each routine over a dense sweep of inputs on every supported instruction set and compare to a double precision reference. Error must stay within the documented bound and all sets must agree within it.",
    dep: ["floating-point-robustness"]
  },
  "thread-scheduler": {
    s: "Distributes tiles, samples and build tasks across all cores, balances the load as work finishes unevenly and keeps shared data from becoming a bottleneck.",
    d: "A pool of worker threads takes tasks from queues with work stealing, so idle threads take work from busy ones. Render tasks are tiles or sample batches; build tasks split tree construction. Per-thread scratch memory and random streams avoid sharing. Affinity and memory locality matter on machines with several processors. The difficulty is the tail: the last tiles are often the most expensive, and any lock held across threads limits scaling on high-core machines.",
    k: ["Work stealing vs a central queue: stealing scales well on many cores and is harder to reason about, while a central queue is simple and becomes contended.", "Smaller tasks vs larger tasks: small tasks balance the tail and add scheduling overhead, while large tasks amortize setup and strand cores at the end."],
    p: ["A lock around a shared statistics counter limits scaling to a handful of cores.", "Memory allocated by one thread and freed by another causes allocator contention."],
    v: "Render the same frame on 1 to the maximum number of cores and plot speedup. It must be near linear, with idle fraction at the end of the frame under a few percent.",
    dep: ["memory-arenas"]
  },
  "memory-arenas": {
    s: "Allocators that hand out memory in large blocks per thread or per task and free it all at once, avoiding the cost and contention of a general-purpose allocator.",
    d: "Per-thread arenas bump a pointer through a block, so allocating costs a few instructions, and nothing is freed individually; when a tile or path batch ends, the arena resets. Scene data uses larger arenas tracked for a memory budget, and some are memory mapped from files. Alignment suits vector loads. The hard parts are knowing what lifetime each object has, avoiding fragmentation in long sessions and reporting memory use by category.",
    k: ["Arena allocation vs a general allocator: arenas are much faster and contention free, but demand clear lifetimes and cannot free single objects.", "Per-thread arenas vs one shared arena: per-thread avoids locks and wastes memory when threads' needs differ."],
    p: ["Objects with longer lifetime allocated from a short-lived arena become dangling after reset.", "Memory is reserved but not reported, so the render is killed by the operating system without a warning."],
    v: "Render a long interactive session with many scene edits and confirm resident memory returns to the same level after each edit, with a per-category report summing to the process total within a small margin.",
    dep: ["memory-budget"]
  },
  "floating-point-robustness": {
    s: "Practices that keep rounding from creating visible errors: error-bounded intersections, careful ordering of operations, consistent precision and handling of extremes like infinities and NaNs.",
    d: "Single precision gives about seven digits, so positions far from the origin lose fractions of a millimeter, and subtracting nearly equal numbers loses most of the precision. Techniques include tracking error bounds through intersection, computing in local object space, using double precision for transforms and clamping or rejecting invalid values early. A single NaN can contaminate a pixel permanently because it spreads through accumulation. It is hard because errors depend on scene scale and are rare.",
    k: ["Single precision with care vs double everywhere: single is faster and halves memory and bandwidth, while double avoids many problems at a large performance cost.", "Rejecting NaNs at the source vs at accumulation: source rejection finds bugs early, while accumulation guards are a cheap safety net."],
    p: ["One NaN from a division by zero in a material turns a pixel black or white forever, and spreads into denoising.", "Scenes modeled kilometers from the origin show jitter and cracking."],
    v: "Render a scene translated by one hundred kilometers and compare it to the original. The images must match to within noise, with a NaN counter in the statistics equal to zero.",
    dep: []
  },
  "color-management": {
    s: "Defines the working color space for lighting math and converts to and from the spaces of textures, displays and delivery formats.",
    d: "Rendering is done in a linear working space, where doubling light doubles the values. Input textures declared as encoded are converted to linear, and output is converted to the delivery space with the display transform applied only at the end. Spaces are described by primaries, white point and transfer function, usually through a configuration file shared with other tools. The difficulty is consistency: one mis-tagged texture silently changes appearance, and renderers must agree with compositing on every conversion.",
    k: ["Wide-gamut working space vs a display-sized one: wide gamut avoids clipping saturated lights and requires conversions for every asset, while display-sized is simple and loses colors.", "Converting textures on load vs at lookup: on load avoids repeated math and costs memory for converted copies."],
    p: ["Textures for color are read as linear data and look washed out, while data textures such as normals are converted and look wrong.", "Display transform baked into frames and then applied again in compositing."],
    v: "Render a known color chart, read the file in the compositing tool with the same configuration, and confirm every patch matches its reference value in the working space within rounding.",
    dep: ["units-and-color-spaces"]
  },
  "logging-and-statistics": {
    s: "Reports what the renderer is doing: timings per stage, ray counts, cache hit rates, memory use and warnings, so slow or wrong frames can be explained.",
    d: "At the end of a frame, and during it, the renderer prints and records scene build time, tree build time, rays traced by type, texture cache behavior, peak memory by category, time per sample and warnings such as clamped values or missing textures. Counters use per-thread storage to avoid contention. The output is machine-readable for the farm. It is hard to keep useful: too much noise hides warnings, and counters that perturb performance are turned off when most needed.",
    k: ["Always-on counters vs enabled on demand: always-on gives data from every farm frame, but costs a little performance everywhere.", "Human-readable log vs structured output: logs help individuals, while structured output feeds dashboards and regression checks."],
    p: ["A warning flood for a harmless issue hides the one that explains a bad frame.", "Per-thread counters merged only at the end are lost when a render crashes."],
    v: "Render a frame with a missing texture and a clamped sample and confirm the log lists both once, with counts. Ray totals by type must match an independent instrumented count.",
    dep: ["thread-scheduler"]
  },
  "hardware-ray-tracing": {
    s: "Dedicated GPU units that traverse an acceleration structure and test triangles in hardware, much faster than doing the same in general shader code.",
    d: "The application builds an acceleration structure through the driver, which chooses an opaque, vendor-specific layout, and shader programs launch rays and receive hit callbacks. Fixed-function units perform traversal and triangle tests, while shading runs on the ordinary cores. Features include any-hit programs for transparency and instancing support. Constraints are that the structure format is not controllable, custom primitives are slower, and motion blur and large instance counts are supported to differing degrees.",
    k: ["Hardware traversal vs custom software traversal: hardware is much faster for triangles and fixed in behavior, while software allows custom primitives and layouts and runs slower.", "Driver-built structures vs own format: driver-built are simple and fast, but cannot be inspected, shared with the CPU or tuned."],
    p: ["Any-hit programs for alpha-tested geometry slow traversal sharply when many surfaces are cut-outs.", "Memory for acceleration structures is larger than expected and cannot be compacted until after the build."],
    v: "Trace one billion random rays through the same scene on hardware and on the reference CPU tracer. Hit results must agree except for tolerated edge cases, and throughput must exceed software traversal on the same device by a stated factor.",
    dep: ["bvh-construction","gpu-memory","wavefront-execution"]
  },
  "wavefront-execution": {
    s: "Splits the path tracer into separate stages, such as intersect, shade and sample lights, each run over a large queue of rays, which keeps GPU lanes doing the same work.",
    d: "A megakernel runs an entire path in one program and suffers from divergence when neighboring threads do different things. A wavefront design stores path state in memory and runs one stage at a time across many paths, sorted by material or ray type, so threads in a group execute the same code. Cost is memory traffic for path state and queue management; benefit is better occupancy and the ability to batch shadow rays and shading by material. Used for complex materials where megakernels run out of registers.",
    k: ["Wavefront vs megakernel: wavefront keeps lanes busy on complex scenes and costs memory bandwidth for state, while a megakernel avoids that traffic and diverges.", "Sorting by material before shading vs shading in ray order: sorting improves coherence, and costs a pass and memory."],
    p: ["Path state stored for millions of in-flight paths uses most of the memory budget, leaving little for scene data.", "Queue imbalance leaves later stages with a few active paths and an idle GPU."],
    v: "Render a scene with hundreds of materials as wavefront and megakernel and compare throughput and occupancy. Images must match in distribution, and wavefront must win on the complex scene and may lose on a simple one.",
    dep: ["ray-coherence","hardware-ray-tracing","gpu-memory"]
  },
  "gpu-memory": {
    s: "Manages the limited, separate memory on the graphics device: fitting the scene, textures and acceleration structures, and falling back to host memory or streaming when it does not fit.",
    d: "Device memory is much smaller than system memory, so the scene must be compacted, textures converted to compressed formats and acceleration structures compacted after building. When it still does not fit, the renderer can page textures in from host memory over the bus, split the scene between several devices or fall back to the CPU. Memory is reported and budgeted by category. The hard part is that out-of-memory failure is abrupt, and paging over the bus is slow enough to dominate render time.",
    k: ["Out-of-core streaming vs refusing to render: streaming completes any scene and runs several times slower, while refusing is predictable and forces artists to simplify.", "Compressed textures vs full precision: compression saves memory and adds artifacts that may be visible in close-ups."],
    p: ["A scene that fit on the artist's workstation card does not fit on the farm's smaller cards and fails after a long load.", "Memory fragmentation after repeated scene edits causes an out-of-memory error with half the memory free."],
    v: "Render a scene bigger than device memory and confirm it completes with streaming, memory reports stay under the limit and the image matches an in-memory render within texture compression tolerance.",
    dep: ["memory-budget","texture-cache","bvh-compression"]
  },
  "cpu-gpu-parity": {
    s: "Keeping both backends producing the same image from the same scene, so artists can switch devices without the look changing.",
    d: "The two backends implement the same integrators, materials and lights in different code, with different precision, math functions and sampling order. A parity suite renders reference scenes on both and compares results statistically, since pixel-exact equality is not possible. Differences are triaged into bugs, features missing on one side and accepted variance. Shared source for material evaluation helps. The difficulty is that every new feature must be built twice and tested on both.",
    k: ["Shared source for both backends vs separate implementations: shared source guarantees identical logic with portability constraints, while separate implementations let each exploit hardware and drift apart.", "Strict parity vs allowed feature gaps: strict parity limits the GPU to the lowest common set, while gaps let each shine and confuse artists."],
    p: ["A feature silently unsupported on the GPU is ignored, and the final image differs from the preview.", "Small differences in math functions make GPU and CPU frames differ in dark scenes by visible amounts."],
    v: "Render a library of reference scenes on both backends with a long sample count and confirm the difference image is noise only, with mean error per scene below a stated threshold.",
    dep: ["shading-networks","simd-math","shader-compilation"]
  },
  "multi-gpu": {
    s: "Spreads one render across several devices, by splitting the image or sample count, and combines results with little overhead.",
    d: "Each device holds a copy of the scene and renders a share of tiles or of the samples, with partial results copied to a device or host to merge. Where peer links exist, memory can be pooled so a large scene spans devices. Load balancing handles devices with different speeds. The cost is replication: every device needs the full scene, so total memory does not grow with the count. Merge and transfer overhead is small relative to render time for long frames.",
    k: ["Replicating the scene on each device vs sharing memory across a fast link: replication is simple and limited by one device's memory, while sharing fits larger scenes and depends on link speed.", "Splitting by tile vs by sample count: tiles reduce per-device accumulation and show imbalance, while sample splitting balances and merges full frames."],
    p: ["A slow device holds back a split image, making the whole frame wait for its last tile.", "Display and compute sharing one device causes interface stalls during rendering."],
    v: "Render the same frame on one, two and four devices and plot time. Scaling must be near linear for long frames, and the merged image must match a single-device render within noise.",
    dep: ["gpu-memory","tile-distribution"]
  },
  "shader-compilation": {
    s: "Turning material and shading network descriptions into GPU programs, with caching so a scene does not wait for the same code to compile every time it loads.",
    d: "Shading graphs are translated to GPU source or intermediate form and compiled for the device, a process that can take seconds to minutes for large scenes. Compiled programs are cached on disk keyed by the content of the graph and the driver version. Techniques include compiling per material with specialization on constant values, or using an interpreter-like uber shader to start quickly and replace it as compilation finishes. It is hard because compile latency harms interactive editing and the cache invalidates on driver updates.",
    k: ["Specialize per material vs one general program: specialization runs faster and costs compile time per variant, while general programs start instantly and run slower.", "Compile at load vs lazily in the background: load-time gives predictable rendering and long waits, while lazy rendering starts at once and may flicker as shaders swap."],
    p: ["Driver update invalidates the cache on every machine at once, and the first jobs wait a long time.", "Specializing on a parameter an artist is tuning triggers a recompile on every slider move."],
    v: "Load a scene with five hundred materials cold and with a warm cache, then edit one parameter. Cold time must be reported, warm load must be near instant and the edit must respond without a full recompile.",
    dep: ["shading-networks","hardware-ray-tracing"]
  },
  "reproducibility-and-seeds": {
    s: "Whether the same scene and settings give the same pixels every time, across thread counts, machines and restarts, and what is sacrificed to keep it that way.",
    d: "Exact reproducibility needs seeds derived from pixel and sample index instead of thread timing, deterministic merges, and identical floating-point behavior across hardware. It lets a failed frame be re-rendered identically, tiles be combined without seams and regressions be found by image comparison. It conflicts with adaptive or dynamic scheduling, fast approximate math and GPU rendering, where reduction order varies. Teams decide per use whether bitwise, statistical or visual equality is the contract.",
    k: ["Bitwise determinism vs speed: determinism gives exact regression tests and retry-safe farms, but forbids some scheduling and math optimizations.", "Seeds by pixel vs by thread: pixel seeds survive any scheduling and tile layout, while thread seeds are simpler and produce timing-dependent images."],
    p: ["Two machines with different instruction sets produce frames that differ slightly, visible as a flicker in a sequence.", "A retried tile uses a new seed, so its noise pattern differs from its neighbors."],
    v: "Render a frame with 1 and 64 threads and on two machine types in deterministic mode and compare files byte for byte. Any difference must be explained by a documented exception.",
    dep: ["random-number-generation","thread-scheduler","simd-math"]
  },
  "bias-vs-variance": {
    s: "The standing choice between an estimator that is correct on average and noisy, and one that is cleaner and slightly wrong, which shapes clamping, denoising and approximations.",
    d: "An unbiased renderer converges to the exact answer given enough samples, which allows it to serve as a reference and makes errors a matter of time. Biased shortcuts such as clamping, merging radii, light caching, denoising and filtering give acceptable images in a fraction of the time. Production usually accepts bias where it is invisible and controls it with parameters. The difficulty is that bias does not shrink with more samples, and quality metrics based on noise do not reveal it.",
    k: ["Unbiased reference-quality estimators vs biased fast ones: unbiased results are trustworthy and slow, while biased results are fast and need validation against a reference.", "Hidden defaults that bias vs explicit controls: hidden defaults give clean images with no effort, and explicit controls make the compromise visible and tunable."],
    p: ["A clamp or radius left from a preview is not noticed, and long renders converge to the wrong brightness.", "Judging a biased renderer by noise alone hides systematic errors that do not diminish with samples."],
    v: "Render a reference scene with every biased feature on and compare to a converged unbiased render by mean error maps. Bias must be within the stated tolerance for each feature and not shrink with samples.",
    dep: ["firefly-clamping","denoiser","vertex-connection-merging"]
  },
  "units-and-color-spaces": {
    s: "The conventions for length, light and color that every component must agree on, from meters and watts to the working color space and exposure.",
    d: "Scenes carry a unit scale, usually meters or centimeters, which affects light falloff, subsurface distances, volume density and depth of field. Light quantities need consistent radiometric or photometric meaning, and colors a defined space with a linear working encoding. These conventions are set by studios and expressed in scene metadata, but each importer, shader and output stage can break them. Problems surface late and look like artistic issues rather than bugs.",
    k: ["Strict declared units vs assumed defaults: declared units catch mismatches and add authoring work, while assumed defaults are easy and break when scenes arrive from elsewhere.", "One working space for everything vs conversions per stage: one space avoids errors and requires conversion at the edges, while stage conversions are flexible and error prone."],
    p: ["A scene authored in centimeters rendered as meters has volumes one hundred times too dense.", "Colors treated as linear in one stage and encoded in another produce washed or crushed images."],
    v: "Import the same test scene in meters and centimeters and confirm identical images. Pass a color chart through the full pipeline and confirm values at each stage match the expected conversion.",
    dep: []
  },
  "memory-budget": {
    s: "Deciding how much memory scene data, caches, buffers and the acceleration structure may use, and what the renderer does when the limit is reached.",
    d: "Production scenes may need more memory than any machine has, so categories such as geometry, tree, textures, volumes and frame buffers get budgets, and the renderer reduces consumption when needed: evicting texture tiles, compressing trees, expanding procedurals on demand or rendering in regions. The farm schedules by predicted memory. Running out kills the render late, so budgets are checked early. The difficulty is that techniques interact, and a budget good for one frame is wrong for the next.",
    k: ["Hard budgets with graceful degradation vs best-effort allocation: budgets give predictable behavior and the renderer must degrade deliberately, while best effort is simple and fails abruptly.", "Optimizing memory vs speed: smaller structures use less bandwidth and decode more, while larger ones are faster and limit scene size."],
    p: ["Peak memory occurs during the build, but the budget is checked only at steady state.", "Memory reported per renderer does not include the operating system's file cache, which also evicts under pressure."],
    v: "Render a scene at several memory limits down to a quarter of its needs. Each must complete without being killed, peak resident memory must stay under the limit and image differences must be within the documented tolerance.",
    dep: []
  },
  "physical-plausibility": {
    s: "How closely the renderer obeys real light behavior, such as conservation, reciprocity and correct falloff, which makes scenes predictable and assets reusable, and when it is relaxed.",
    d: "Physical models let artists set up lights and materials by real-world intuition and trust that they will behave under any lighting. They keep indirect light from growing and make results independent of the order of operations. Production pushes against them: non-physical lights, shadow tricks and exaggerated effects are demanded. The renderer chooses what to allow, and marks which parts are physical. Plausibility is a design contract rather than a component, and violating it in one corner affects every other component's assumptions.",
    k: ["Strictly physical model vs permissive controls: strict models produce reliable and portable results, while permissive controls match artistic demands and risk unstable images.", "Physically-based defaults with explicit escape hatches vs freeform: defaults keep most scenes right, while escape hatches make deliberate cheating visible."],
    p: ["A non-physical light with no falloff makes indirect bounces gain energy.", "Assets tuned under cheating lights look wrong in a different scene."],
    v: "Run white furnace, reciprocity and conservation tests across all materials and lights, plus a Cornell-box comparison to a published reference. Failures must come only from features flagged as non-physical.",
    dep: ["energy-conservation","photometric-units"]
  },
  "art-directability": {
    s: "How much control artists have to bend the render toward a look, through light linking, per-light passes, overrides and shaders, without breaking the physics under it.",
    d: "Films are art directed: shadows are moved, highlights are shaped and objects are lit separately. The renderer provides controls such as light linking, ray visibility, shadow catchers, per-light outputs and shape-controlled lights, with cost in complexity and physical consistency. Good controls are predictable and local; poor ones have global side effects. Directability trades with the performance of sampling and with the clarity of the lighting model, and what is supported shapes the data model of the scene.",
    k: ["Many local controls vs one physical setup: local controls let artists solve any shot and fragment the look across shots, while a physical setup is consistent and inflexible.", "Controls in the renderer vs in compositing: renderer controls interact with indirect light correctly, while compositing controls are fast to iterate and approximate."],
    p: ["A control that exists in one renderer path but not another surprises artists when they switch modes.", "Dozens of overrides per shot make look development impossible to reuse."],
    v: "Ask an artist to relight a test shot using only the provided controls and render it. Outcome must be reachable without editing geometry, consistent across frames and unchanged when rendered on the farm.",
    dep: ["light-linking","visibility-and-overrides"]
  }
});
