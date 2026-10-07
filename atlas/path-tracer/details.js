// Details for the path tracer plate, part 1: render farm, frame execution, scene description, textures.
ATLAS.details("path-tracer", {
  "job-submission": {
    s: "Turns a request to render frames into described jobs: scene location, frame range, settings, resource needs and dependencies, placed in a queue the farm can schedule.",
    d: "Artists or pipeline scripts submit a job naming the scene file, frames, render settings, required memory and cores, and priority. Jobs can be chained so a simulation cache finishes before the render that reads it. The submitter validates that paths are reachable from farm machines and records the software versions used. It is hard because a job is a promise about the future: the scene must still be on shared storage, with the same plug-ins, when a machine gets to it hours later.",
    k: ["Submit a scene path vs submit a packaged snapshot: a path is fast and light, a snapshot is reproducible, but copying a large scene on every submit costs minutes and storage.", "Per-frame tasks vs one task per job: fine-grained tasks balance load and retry cheaply, but multiply scheduler traffic and repeat scene loading for every frame."],
    p: ["A scene edited after submission but before the job starts renders the new version, so frames in one sequence disagree.", "Absolute paths valid on a workstation are missing on farm machines, so every frame fails after a slow load."],
    v: "Submit a three-frame job, confirm each task records the scene version and renderer build, and re-render frame two later from that record to get a pixel-identical image.",
    dep: ["scene-file-format","render-settings"]
  },
  "distributed-scheduling": {
    s: "Matches queued tasks to machines by priority, resource fit and fairness, and keeps every machine busy without letting one user or a huge job starve the rest.",
    d: "A central scheduler tracks each machine's cores, memory, GPUs and installed software, and each task's requirements. It picks the next task by priority, owner share and age, may preempt low-priority work, and packs small jobs beside large ones. Workers poll or are pushed tasks and report heartbeats. The hard parts are fairness across competing users, memory fit (a task that exceeds RAM is killed late), and scheduler throughput when a hundred thousand short tasks are queued.",
    k: ["Strict priority vs weighted fair share: priority serves deadlines directly, but a high-priority flood starves everyone else, while shares stay fair but slow an urgent frame.", "Preemption vs waiting: preempting frees machines for urgent work, but discards the minutes of work already done unless the renderer can checkpoint."],
    p: ["Underestimated memory requirements place tasks on small machines, which are killed by the operating system near the end of the frame.", "A scheduler that polls every task individually becomes the bottleneck with many short tasks."],
    v: "Queue one hundred tasks at mixed priorities on a ten-machine test pool and confirm utilization stays above 95 percent, urgent tasks start within one scheduling interval and no user receives less than their share.",
    dep: ["job-submission","farm-monitoring"]
  },
  "tile-distribution": {
    s: "Splits one very large frame into regions or sample passes rendered on different machines and merged, so a single image can use the whole farm.",
    d: "Frames are divided into spatial tiles, or into sample ranges where each machine renders the full image with a different random seed. The merge step combines tile pixels, or averages sample sets with matching weights. Splitting by tile keeps memory per machine but needs padding around tiles for filters and denoisers. Splitting by samples scales almost linearly but loads the whole scene on every machine. The difficulty is seams: filter footprints, denoiser support and deep data must all match across tile edges.",
    k: ["Spatial tiles vs sample splitting: tiles allow partial results and equal work, but cost uneven runtimes by content; sample splitting balances perfectly but repeats scene loading on each machine.", "Large vs small tiles: large tiles amortize setup and keep coherent rays, small tiles balance load better but multiply border overhead."],
    p: ["Machines using identical random seeds produce correlated noise that does not average away when merged.", "Tiles without filter padding leave faint visible grid lines at tile borders."],
    v: "Render one frame whole, then as sixteen tiles and as four sample passes with distinct seeds. Difference images against the whole render must show noise only, with no structure at tile borders.",
    dep: ["distributed-scheduling","sample-accumulation","random-number-generation"]
  },
  "asset-sync-and-caching": {
    s: "Gets the scene, textures and caches to each render machine quickly and consistently, using shared storage, local caches and content-addressed copies.",
    d: "A frame may reference hundreds of gigabytes of geometry and textures. Farm machines read them from shared storage, from a local cache filled on first use, or from a pre-staged package keyed by content hash so identical files are fetched once. The renderer also stores generated data such as converted textures and acceleration structures in caches. The challenge is contention: thousands of machines opening the same files at job start can saturate storage, and stale cache entries silently render old assets.",
    k: ["Read from shared storage vs stage locally: shared reads avoid copying but collapse under thundering herds, while local staging adds startup latency and disk use.", "Content-hash keys vs path and timestamp keys: hashes make stale caches impossible, but hashing large files costs time on every publish."],
    p: ["A whole farm starting a job at once saturates the storage server, so frames take minutes just to load.", "A cache keyed by path serves an outdated texture after an artist overwrote the file in place."],
    v: "Start one hundred machines on the same job, confirm shared storage throughput stays below its limit, and confirm a texture overwritten in place is re-fetched on the next job.",
    dep: ["job-submission","texture-cache"]
  },
  "failure-recovery": {
    s: "Detects crashed, hung or out-of-memory tasks and machines, retries them elsewhere, and prevents a single bad frame from stalling a whole sequence.",
    d: "Workers send heartbeats; a task that goes silent, exceeds its memory limit or exits with an error is marked failed and re-queued, usually on a different machine. Retry counts are bounded and failures are classified so a deterministic crash in the scene is not retried forever. Renderers that write checkpoints let a retry resume. The difficulty is distinguishing machine faults from scene faults: retrying a scene that always crashes wastes a day of farm time.",
    k: ["Automatic retry vs fail fast: retries hide transient machine faults, but retry loops on a broken scene burn capacity and delay discovery of the real problem.", "Blacklisting suspect machines vs trusting them: blacklisting stops repeated failures, but a wrongly flagged healthy machine shrinks the farm."],
    p: ["A frame that crashes at ninety percent each time is retried repeatedly because failures are not classified.", "A machine with failing memory produces corrupt tiles that are accepted as valid output."],
    v: "Kill a worker mid-frame and confirm the task restarts elsewhere within the timeout. Submit a scene that always crashes and confirm it stops after the retry limit with a report, not an endless loop.",
    dep: ["distributed-scheduling","checkpoint-and-resume"]
  },
  "farm-monitoring": {
    s: "Reports queue depth, machine utilization, per-frame time and memory, failure rates and cost, so people can see what is slow, expensive or stuck.",
    d: "Workers publish render statistics: wall time, peak memory, ray counts, texture cache hits and time per stage. A dashboard aggregates them per job, user and machine class and shows spend for rented capacity. Alerts fire on stalls and rising failure rates. Historical data feeds estimates of how long a new job will take. It is hard because the useful numbers are scattered across renderer, scheduler and storage, and a frame's time is unpredictable before it runs.",
    k: ["Per-frame detailed statistics vs aggregate counters: detail finds the one bad asset, but storing it for every frame costs real storage and ingestion capacity.", "Estimates from history vs from a test render: history is free but misses new content, while a test render is accurate but spends farm time."],
    p: ["Averaged frame time hides a handful of frames that take ten times longer and miss the deadline.", "Cloud capacity left running after a job ends quietly accumulates cost."],
    v: "Run a job with a deliberately slow frame and confirm the dashboard flags it within a few minutes, shows its peak memory and time per stage, and reports cost matching the provider's invoice within a few percent.",
    dep: ["logging-and-statistics"]
  },
  "progressive-rendering": {
    s: "Renders the whole image repeatedly with one more sample per pixel each pass, so a usable preview appears immediately and improves until stopped.",
    d: "Each pass traces one or a few samples for every pixel and adds them to a running average, so the image sharpens as noise falls. The user can stop at any time or let a convergence criterion decide. Interactive previews and light-field editing use this mode. Costs include revisiting the whole scene each pass, which hurts cache locality, and the need to keep a full-frame accumulation buffer in memory. Pass boundaries are also natural places to display, checkpoint and accept scene edits.",
    k: ["Progressive passes vs finishing each pixel: progressive gives early feedback and cheap stopping, but loses cache locality compared with finishing small regions one at a time.", "Fixed samples per pass vs time-boxed passes: fixed is predictable, time-boxed keeps a viewport responsive on slow scenes but makes sample counts uneven."],
    p: ["Floating-point accumulation of thousands of passes loses precision unless sums use a wider type or compensation.", "Edits applied mid-pass mix samples from two scene states into one image."],
    v: "Render a still progressively to 1, 16 and 256 samples and confirm the mean error against a long reference falls by roughly the square root of the sample ratio, with no change in average brightness.",
    dep: ["sample-accumulation","incremental-scene-update"]
  },
  "bucket-rendering": {
    s: "Renders the frame as small square regions one after another per thread, finishing each region before moving on, which keeps memory and caches focused.",
    d: "The image is divided into buckets, typically 32 or 64 pixels square, handed to threads in a chosen order such as spiral from the center. A thread renders all samples for its bucket, writes the finished pixels and takes the next. Locality is good: neighboring rays hit similar geometry and textures. The cost is slow first feedback and tail waste, where the last few expensive buckets leave most cores idle while one finishes.",
    k: ["Finishing buckets vs progressive passes: buckets use caches better and allow per-pixel adaptive sampling, but show nothing complete until late and cannot be stopped partway without gaps.", "Large vs small buckets: large buckets reduce overhead and share filter borders, but worsen tail imbalance at the end of the frame."],
    p: ["One slow bucket at the end of the frame leaves all other cores idle for minutes.", "A filter wider than the bucket margin produces visible seams where neighboring buckets disagree."],
    v: "Render with 1, 8 and 64 threads and confirm identical pixels, near-linear speedup on the body of the frame and tail idle time under five percent of total wall time.",
    dep: ["thread-scheduler","film-and-pixel-filter","adaptive-sampling"]
  },
  "sample-accumulation": {
    s: "Combines the many noisy radiance samples for each pixel into a final value using weights from the pixel filter, while tracking totals needed for variance and adaptive decisions.",
    d: "Each sample contributes its radiance, weighted by the pixel filter at its offset from the pixel center, to the pixels it overlaps. The buffer holds weighted sums and total weights, and often second moments for variance. Samples may come from many threads or machines, so accumulation must be race free, usually by per-thread buffers merged later. Care is required with extreme values and precision: a single bright sample can dominate, and long sums in single precision drift.",
    k: ["Per-thread accumulation buffers vs atomic adds: buffers avoid contention but multiply memory by thread count, while atomics are compact and slow under heavy overlap.", "Storing mean only vs mean and variance: mean is all delivery needs, but variance enables adaptive sampling and denoising guidance at extra memory cost."],
    p: ["Accumulating in single precision over very many samples visibly drifts in dark regions.", "Splatting from light paths into other pixels without thread-safe buffers corrupts the image intermittently."],
    v: "Render a flat emitter with known radiance and confirm every pixel equals it to within float rounding regardless of thread count, filter width or number of passes.",
    dep: ["film-and-pixel-filter","memory-arenas"]
  },
  "aovs-and-passes": {
    s: "Writes extra images beside the beauty render: depth, normals, albedo, motion vectors, object identifiers and separated lighting components, for compositing and denoising.",
    d: "Arbitrary output variables are computed at the first hit or accumulated along the path: direct and indirect light, diffuse and specular components, emission, and per-light contributions. Each is filtered and accumulated like color, except identifiers and depth, which need special reconstruction without blending. Components sum back to the beauty image, so artists can adjust them in compositing. It is hard because the decomposition must be exact, and some quantities cannot be filtered meaningfully.",
    k: ["Light-path-expression splits vs fixed named passes: expressions are flexible but each costs memory and time, while fixed passes are cheap and cover only anticipated needs.", "Filtering ID and depth values vs taking one sample: filtering gives smooth edges but invents values that match no object, so single samples are safer for matte generation."],
    p: ["Components do not sum to the beauty because of clamping or a path category assigned inconsistently.", "Antialiased depth or identifier buffers produce wrong values at silhouettes, breaking compositing mattes."],
    v: "Render with diffuse, specular, emission and indirect passes, sum them in float, and confirm the result matches the beauty image to within rounding in every pixel.",
    dep: ["sample-accumulation","deep-and-multilayer-output","path-integrator"]
  },
  "deep-and-multilayer-output": {
    s: "Stores many channels and, optionally, a list of depth-ordered samples per pixel in one file, so downstream tools can combine renders correctly.",
    d: "Multilayer files hold the beauty and all extra outputs as named channels in float or half precision with a defined color space and metadata such as camera and exposure. Deep files keep, per pixel, a list of samples with depth, color and coverage, so rendered elements can be merged with correct occlusion without needing mattes. Deep data is large and unbounded, and requires merging and compression. The tension is size against fidelity, plus keeping channel names and units consistent across studios.",
    k: ["Half vs full float channels: half halves size and suffices for color, but depth, positions and identifiers need full precision or become wrong.", "Deep samples vs flat images: deep removes matte and edge problems, but files are many times larger and tools must support them."],
    p: ["Storing depth or position in half precision quantizes distant objects into visible steps.", "A deep image with unmerged near-duplicate samples balloons past memory limits in compositing."],
    v: "Write a multilayer file, read it back with a separate reader and confirm channel names, color space metadata and every pixel value round-trip exactly. Merge two deep renders and confirm occlusion matches one combined render.",
    dep: ["aovs-and-passes","units-and-color-spaces"]
  },
  "denoiser": {
    s: "Removes residual Monte Carlo noise from a render by filtering the image with help from auxiliary buffers, trading a little detail for much shorter render times.",
    d: "A denoiser takes the noisy beauty image plus albedo, normal and sometimes depth or variance, and outputs a cleaner image. Methods range from edge-aware filters weighted by feature similarity to neural networks trained on pairs of noisy and converged renders. It runs after rendering, per tile or whole frame, on CPU or GPU. It is hard because it must remove noise without removing real detail, flicker between frames, or leaking one object's color into another.",
    k: ["Learned denoiser vs hand-built filter: learned results are cleaner at low sample counts, but need training data, can invent plausible detail and are harder to debug.", "Per-frame vs temporal denoising: temporal uses neighboring frames for stability, but ghosts on fast motion and needs motion vectors."],
    p: ["Thin features such as hair, wires and text are smeared away at low sample counts.", "Frame-to-frame differences in the denoiser's output cause visible flicker in animation."],
    v: "Render at 64 samples, denoise, and compare against a 16,000-sample reference. Error metrics must beat the undenoised render by a wide margin while fine textures and sharp shadow edges remain visible in zoomed crops.",
    dep: ["denoiser-guide-buffers","aovs-and-passes","convergence-estimation"]
  },
  "denoiser-guide-buffers": {
    s: "Feature images supplied to the denoiser: first-hit albedo, shading normal, depth and variance, which tell it where real edges are so it will not blur across them.",
    d: "The renderer writes albedo and normals at the first non-specular surface, so mirrors and glass show what lies behind them. Buffers are accumulated with the same filter as color but are nearly noise free, because they depend only on camera rays. Optional channels include variance estimates, motion vectors and first-hit material identifiers. The difficulty is deciding what a pixel means for transparent, reflective and volumetric content, and keeping buffers consistent with the beauty pass.",
    k: ["Albedo at first hit vs first diffuse hit: first hit is cheap but shows a mirror's own surface, while following specular bounces gives better guidance and extra tracing.", "Raw normals vs filtered normals: raw ones keep sharp edges, while antialiasing blends them at silhouettes in ways the denoiser must handle."],
    p: ["Guide buffers computed without the beauty pass's pixel filter disagree at edges and cause halos.", "Normals defined for geometry under displacement differ from those used in shading, leaving residual noise."],
    v: "Inspect albedo and normal buffers of a scene with a mirror and a glass sphere, confirm they show the visible content and are free of noise at one sample per pixel, and confirm denoising with them beats denoising without.",
    dep: ["aovs-and-passes","surface-normals","sample-accumulation"]
  },
  "checkpoint-and-resume": {
    s: "Saves the accumulated image, sampling state and random seeds periodically, so a stopped or crashed render continues without starting over.",
    d: "At intervals the renderer writes its accumulation buffers, the number of samples or buckets completed and the state of sampler sequences to disk. A resumed render reloads them and continues so that the final result equals an uninterrupted one. It enables preemption on shared farms, cheap spot machines and long single frames. It is hard because everything affecting future samples must be in the checkpoint, including adaptive sampling maps and per-thread random state, and because scene changes invalidate the file.",
    k: ["Frequent checkpoints vs rare ones: frequent limit lost work, but writing large buffers stalls rendering and loads storage.", "Exact resume vs approximately equivalent resume: exact needs all random state saved, while approximate is simpler and breaks bitwise reproducibility."],
    p: ["A checkpoint made against an older scene version is resumed against a newer one, silently mixing two images.", "A checkpoint written partway through a crash is truncated and rejects or, worse, loads partially."],
    v: "Render fifty percent of a frame, kill the process, resume, and compare with an uninterrupted render of the same seeds. The images must match exactly in deterministic mode, or within noise statistics otherwise.",
    dep: ["sample-accumulation","random-number-generation","reproducibility-and-seeds"]
  },
  "scene-file-format": {
    s: "A persistent, versioned description of geometry, materials, lights, cameras and settings that a renderer can load without the application that authored it.",
    d: "Formats are text or binary, and describe a graph of nodes with typed parameters, references between them and often layers that override one another. Large data such as meshes and volumes live in side files, which are memory mapped or streamed. A loader validates, resolves references and builds renderer-native structures. The difficulty is evolution: formats outlive renderer versions, so unknown parameters, deprecated names and units need explicit rules, and loading hundreds of gigabytes must be parallel.",
    k: ["Text vs binary: text is diffable and easy to repair by hand, while binary loads faster and smaller but needs tools to inspect.", "Self-contained vs referencing files: references keep assets shared and small, but a missing file or moved path breaks the scene far from the cause."],
    p: ["A parameter silently ignored by an older renderer produces a different look with no warning.", "Serial parsing of a huge text scene takes longer than rendering the frame."],
    v: "Load a scene, write it back and reload it, then confirm rendered images are identical. Load a scene with an unknown parameter and confirm a warning names it and the rest renders.",
    dep: ["scene-graph-and-instancing","attribute-system"]
  },
  "scene-graph-and-instancing": {
    s: "The hierarchy of transforms and shared object definitions that lets one mesh appear thousands of times without being copied in memory.",
    d: "Objects form a tree or directed graph with local transforms, and prototypes can be referenced by many instances, each with its own transform, material overrides and per-instance attributes. Instancing lets a forest or crowd use a handful of meshes. The renderer flattens the graph into a two-level structure for traversal. Problems include nested instances, per-instance material variation without copying geometry, and keeping transforms exact in single precision far from the origin.",
    k: ["Instancing vs duplicating geometry: instancing saves enormous memory, but per-instance changes to shape are impossible and traversal has an extra transform step.", "Deep hierarchies vs flattening on load: deep graphs preserve structure for editing, while flattening speeds rendering and discards the structure."],
    p: ["An instance far from the origin loses precision in its transform and visibly jitters or cracks.", "Per-instance overrides that force unique geometry copies silently multiply memory."],
    v: "Instance one mesh ten thousand times and confirm memory grows by transforms only, every instance renders in the right place, and an instance with an overridden material shows it without changing neighbors.",
    dep: ["instancing-hierarchy","attribute-system"]
  },
  "host-scene-translation": {
    s: "Converts the authoring application's scene into the renderer's own description, mapping its lights, materials and cameras onto renderer equivalents.",
    d: "A plug-in or exporter walks the host's data and builds renderer nodes, mapping each host material, light and camera to the closest model. Translation can be a one-time export, or continuous so an interactive view updates as the artist works. Constructs without a direct equivalent are approximated or baked. It is hard because the host and renderer define things slightly differently, so looks drift, and because translating on every edit must be fast enough to feel interactive.",
    k: ["Full re-export vs live translation: re-export is simple and robust, while live translation gives immediate feedback but requires tracking every kind of host edit.", "Faithful mapping vs renderer-native authoring: mapping lets existing scenes render, but hides renderer features and keeps host quirks."],
    p: ["Units, handedness or color-space conventions differ between host and renderer, so the render is mirrored or washed out.", "A host feature mapped approximately makes the preview and the final frame differ."],
    v: "Render the same test scene in the host's own preview and the renderer, and confirm camera framing, light intensities and material colors agree within a stated tolerance in a side-by-side image.",
    dep: ["scene-file-format","incremental-scene-update","units-and-color-spaces"]
  },
  "procedural-geometry": {
    s: "Geometry generated at render time by code or rules, such as scattering plants or expanding fur, instead of stored as explicit meshes.",
    d: "A procedural is a node that is asked to produce geometry when a ray first needs a region, or at scene build, from parameters and a seed. Rays are bounded by a declared box, and the procedural is expanded only when something might hit it. This keeps memory low for scenes of enormous detail. Difficulties include producing the same result every time for a given seed, thread-safe expansion on demand, and bounding boxes that are accurate enough not to expand unneeded content.",
    k: ["Expand on demand vs expand at scene build: on demand saves memory for unseen content, but adds latency in the middle of traversal and needs locking.", "Evicting expanded geometry vs keeping it: eviction bounds memory, but forces regeneration when rays return to the region."],
    p: ["A procedural that depends on thread timing produces different geometry on different runs.", "A loose declared bound expands every procedural in the scene even though few are visible."],
    v: "Render a procedural scene twice with the same seed and confirm identical images, and confirm that peak memory with on-demand expansion is far below the all-expanded size when most of the content is off screen.",
    dep: ["bvh-construction","memory-budget","scene-graph-and-instancing"]
  },
  "attribute-system": {
    s: "Typed per-object, per-primitive and per-vertex data such as colors, UV sets and identifiers, with defined interpolation across surfaces.",
    d: "Attributes are named arrays attached to a scope: constant for an object, uniform per face, varying across a face by interpolation, or vertex-wise. Shading networks read them by name, and outputs such as identifiers consume them. Storage is compact, often with half-precision or quantized formats. Complexity comes from interpolation across polygons that are not triangles, subdivided surfaces where values must follow limit surfaces, and the volume of data: dozens of attributes on millions of vertices.",
    k: ["Named dynamic attributes vs fixed vertex layout: names are flexible for shading networks, but lookups cost indirection and compact fixed layouts are faster.", "Full-precision vs quantized storage: quantization saves memory on huge meshes, at the risk of visible banding in smooth data."],
    p: ["Interpolating a discontinuous attribute across a seam smears values over triangles that should show a clean edge.", "A misspelled attribute name returns a default silently, so a material renders flat."],
    v: "Assign a ramp attribute to a mesh and render it as color. Values must interpolate linearly across faces, remain discontinuous at marked seams, and match input to within the storage precision.",
    dep: ["scene-file-format","memory-arenas"]
  },
  "incremental-scene-update": {
    s: "Applies edits to a scene already in memory, rebuilding only what changed so interactive renders restart quickly.",
    d: "An edit such as moving an object, changing a color or adding a light is recorded as a delta. The renderer determines the minimum invalidation: material edits touch only shading, a moved object needs a refit of its part of the hierarchy, camera moves reset accumulation but keep geometry. Accumulated samples are then discarded or reweighted. It is hard because dependencies are wide, a changed light can affect every sampling table, and because edits must be applied atomically between samples.",
    k: ["Fine-grained invalidation vs full rebuild: fine-grained responds in milliseconds, but a missed dependency leaves stale state that is hard to reproduce.", "Applying edits between passes vs mid-pass: between passes is consistent, mid-pass is more responsive but mixes states in one image."],
    p: ["A cached light sampling table is not invalidated after a light moves, so the image looks lit by a ghost.", "Dropping the whole accumulation on any edit makes interactive tuning feel stuck at noisy images."],
    v: "Move an object, then confirm the next accumulated image equals one rendered from a fresh load of the edited scene, and that edit latency to the first updated pass is under the target.",
    dep: ["bvh-refit","progressive-rendering","many-light-sampling"]
  },
  "render-settings": {
    s: "The global controls for a render: resolution, sample counts, bounce limits, clamps, filter, seeds and output list, held as one versioned block.",
    d: "Settings cover image size and crop windows, samples per pixel, maximum path depth per lobe type, clamping thresholds, texture memory, thread count and output channels. They are read once at scene start and fixed during a render. Good defaults matter, as most users never change them. The difficulty is the interaction between settings: raising bounces, lowering clamps or changing filter width moves brightness or noise in ways that are not obvious, and settings that trade bias for speed need clear names.",
    k: ["Few high-level quality controls vs many low-level parameters: few are easy to use and portable across scenes, many allow expert tuning but invite inconsistent results across a show.", "Defaults tuned for speed vs defaults tuned for accuracy: speed-first defaults win benchmarks, but silently bias images."],
    p: ["A show-wide setting overridden in one scene makes that shot's brightness differ from its neighbors.", "Depth limits set too low cut off indirect light and darken interiors."],
    v: "Change one setting at a time on a reference scene and confirm each changes only what its documentation says: image size, noise level or, for bias controls, a measured and stated brightness change.",
    dep: ["bias-vs-variance","scene-file-format"]
  },
  "visibility-and-overrides": {
    s: "Controls which objects are seen by which ray types, such as camera, shadow or reflection, and applies per-shot overrides without editing the scene.",
    d: "Each object carries a visibility mask by ray type: an object can be invisible to the camera yet still cast shadows or appear in reflections, which is how matte objects and holdouts are made. Layers of overrides replace attributes by pattern at render time. The renderer checks the mask on every intersection, so it must be cheap. Complexity comes from consistency: a hidden object still affects light transport in some modes, and patterns that match unexpectedly change many objects.",
    k: ["Per-ray-type visibility flags vs separate scenes: flags are cheap and flexible, but every intersection must test them and masked-out hits waste traversal work.", "Override by pattern vs by explicit edit: patterns scale across shots, but a loose pattern changes things nobody intended."],
    p: ["An object hidden from the camera but not from reflections shows up in a mirror, surprising lookdev.", "A wildcard override matches names added later by another department."],
    v: "Set one sphere invisible to camera but visible to shadows and reflections and confirm that only its shadow and mirror image appear, with energy elsewhere unchanged.",
    dep: ["scene-graph-and-instancing","attribute-system"]
  },
  "texture-cache": {
    s: "A memory-bounded cache of texture tiles that loads image data on demand and evicts old tiles, so scenes with terabytes of textures can render in limited RAM.",
    d: "Textures are pre-converted to tiled, mip-mapped files. At lookup the cache finds the tile for the requested level and location, reading it from disk on a miss, and evicts the least recently used when full. Many threads look up concurrently, so the structure must be sharded or lock-light. A hit rate near 99 percent keeps cost low; below that, I/O dominates. Problems include thrash when the working set exceeds memory and stalls from slow shared storage.",
    k: ["Large shared cache vs per-thread caches: shared uses memory best, but contention limits scaling, while per-thread caches scale and duplicate hot tiles.", "Pre-converted tiled files vs reading original images: tiled files are random-access fast, but conversion takes time and doubles storage."],
    p: ["A cache sized smaller than the working set thrashes, and render time rises ten-fold with no obvious message.", "An unconverted whole-image file is read in full for one pixel, flooding memory."],
    v: "Render with the cache limit set to 10 percent of total texture size and confirm hit rate above 95 percent in statistics, peak memory within the limit and images identical to an unlimited-cache render.",
    dep: ["memory-budget","logging-and-statistics"]
  },
  "texture-filtering": {
    s: "Reads a texture so that the result averages the image over the area a pixel covers on the surface, preventing shimmer and aliasing on distant or tilted surfaces.",
    d: "Given the ray's footprint, the filter selects a mip level and weights texels with a trilinear or anisotropic kernel. Minification without filtering produces noise that sampling would have to average away; filtering moves part of that work into a cheap lookup. For path tracing, the footprint of secondary rays is estimated more coarsely. Hard cases include very oblique angles, high-contrast texture detail and alpha textures, where filtering changes coverage.",
    k: ["Anisotropic vs isotropic filtering: anisotropic keeps detail on oblique surfaces, but costs several lookups per sample.", "Filtered lookups vs more camera samples: filtering is cheaper and slightly blurs, while sampling is exact and costs many more rays to remove texture noise."],
    p: ["Isotropic filtering blurs a textured floor receding to the horizon into mush.", "Mip levels filtered in a nonlinear space darken or brighten distant textures."],
    v: "Render a checkerboard plane to the horizon and confirm no moire, constant average brightness across distance, and detail along the view direction comparable to a high-sample reference.",
    dep: ["texture-cache","ray-differentials"]
  },
  "ray-differentials": {
    s: "Estimates how much surface area a ray stands for, by tracking how neighboring rays diverge, so textures and procedural patterns can be filtered correctly.",
    d: "For camera rays the footprint comes from offset rays or analytic derivatives at the hit. After a bounce, the footprint is propagated through the reflection or refraction, which grows it with surface curvature and roughness. Simplified schemes, such as widening a cone with distance and roughness, avoid keeping extra rays. The estimate sets texture mip levels and the antialiasing of procedural patterns. It is difficult to keep accurate through many bounces, so renderers usually degrade it gracefully.",
    k: ["Full differentials vs ray cones: differentials are accurate on curved and specular surfaces, but double state per ray, while cones are cheap and approximate.", "Tracking footprint through all bounces vs only the first: full tracking filters indirect textures properly, but costs time to improve effects rarely seen."],
    p: ["A footprint that is too small leaves textures noisy, too large blurs them, with no hint in the image about which is wrong.", "Differentials are not updated after a refraction, so objects seen through glass are mis-filtered."],
    v: "Render a textured plane seen through a lens-like glass sphere and a mirror and compare filtered results to a very high-sample unfiltered render. Blur and noise must both match the reference's visible detail.",
    dep: ["camera-ray-generation","surface-normals"]
  },
  "shading-networks": {
    s: "Graphs of small nodes, such as textures, math, noise and color ramps, evaluated at each hit to produce the inputs to a material.",
    d: "Artists connect nodes into a network whose outputs drive material parameters. The renderer compiles the graph into an executable form or interprets it, evaluating in batches over many hit points so that vector hardware stays busy. Results may be cached per hit. Complexity is in speed and portability: a deep network evaluated at every bounce can dominate runtime, and the same network must compile for both CPU and GPU.",
    k: ["Compile to native code vs interpret: compiled networks run several times faster, but compile time and driver differences complicate interactive editing.", "Evaluate whole networks per hit vs only requested outputs: evaluating only needed outputs saves time, but requires dependency tracking and breaks batching."],
    p: ["A network evaluated again for every shadow ray repeats expensive noise computation.", "Different results between CPU and GPU backends from slightly different math in the same node."],
    v: "Evaluate a network at ten thousand points on both backends and compare against a reference implementation. Differences must stay below one least-significant bit of the output format, and timing must scale linearly with points.",
    dep: ["texture-filtering","procedural-textures","attribute-system"]
  },
  "procedural-textures": {
    s: "Patterns computed from position or parameters, such as noise, marble or bricks, which have no resolution limit and need no image files.",
    d: "Procedural textures are functions of 3D position or UV, built from noise functions summed over octaves, cellular patterns and gradients. They are resolution independent and tiny in memory, but cost computation at every lookup, and must be band-limited to avoid aliasing at distance. Seeding gives variation per object. Hard parts include making noise tile and be continuous across seams, making results identical across platforms, and baking them to images when evaluation costs too much.",
    k: ["Procedural vs image textures: procedural has infinite detail and no storage, but costs time per lookup and is harder for artists to art-direct than painted images.", "Evaluate live vs bake to image: baking is faster to render and fixes resolution, while live keeps edits and scale freedom."],
    p: ["Noise octaves above the pixel footprint are summed unfiltered and shimmer in animation.", "A pattern defined in object space jumps when the object is scaled or instanced at different sizes."],
    v: "Render a noise pattern at three distances and in animation, and confirm detail fades smoothly without shimmer, the same seed gives the same pattern on both CPU and GPU, and a baked copy matches the live one.",
    dep: ["shading-networks","ray-differentials"]
  },
  "uv-and-udim-mapping": {
    s: "Maps surface points to texture coordinates, including tiled layouts where one object uses many image files arranged on a grid of coordinate ranges.",
    d: "Each vertex carries UV coordinates, interpolated across faces to find the texture position. Production assets use tiled layouts, where tile numbers in the coordinate range pick one of many images, so a hero character can have a thousand-pixel-resolution map per body part. The renderer resolves tile to filename, loads on demand and filters across tile borders. Difficulties are seams, where adjacent faces have unrelated coordinates, mirrored UVs that flip normal maps, and missing tiles.",
    k: ["Tiled multi-file layout vs single atlas: tiles give detail where needed and independent editing, but add file lookups and border filtering problems.", "Seamless unwrapping vs accepting seams: continuous mapping hides seams but distorts, while seams allow low distortion and need careful padding."],
    p: ["Filtering across a tile border samples the neighboring unrelated tile, leaving a visible line.", "Mirrored UVs flip tangent-space normals so lighting appears inverted on half the model."],
    v: "Render a model with a distinct numbered texture per tile and confirm each region shows the right tile, with no lines at tile borders and correct lighting on mirrored regions.",
    dep: ["texture-cache","attribute-system"]
  },
  "displacement-and-bump": {
    s: "Adds fine surface detail from a height map, either by moving actual geometry (displacement) or by perturbing the shading normal only (bump).",
    d: "Bump changes the normal as if the surface were uneven but leaves silhouettes and shadows smooth. Displacement tessellates the surface finely and moves each vertex along its normal by the map value, producing real silhouettes and self-shadowing. Displacement happens at render time, usually in screen-size-aware steps to give about one micropolygon per pixel. The difficulties are cracks between patches with different tessellation, memory for the displaced result and bounds large enough to contain the displaced geometry.",
    k: ["True displacement vs bump: displacement gives correct silhouettes and shadows, but costs tessellation time and memory, whereas bump is nearly free and looks flat at grazing angles.", "View-dependent tessellation vs fixed density: view-dependent saves memory at distance, but results change with camera and need crack handling."],
    p: ["Neighboring patches tessellated to different densities open visible cracks along their shared edge.", "A displacement bound that is too small clips the displaced surface where rays miss it."],
    v: "Displace a plane with a known height map, render from a grazing angle and confirm silhouette height matches the map, no cracks appear along patch edges and memory stays within the stated bound.",
    dep: ["tessellation","texture-filtering","bvh-construction"]
  }
});
