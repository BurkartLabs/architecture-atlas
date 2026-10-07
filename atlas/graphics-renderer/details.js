// Details for the graphics renderer plate, part 1: render graph, post-processing, culling and draw submission.
ATLAS.details("graphics-renderer", {
  "render-graph-builder": {
    s: "Collects the frame's passes and the virtual resources they touch into a directed graph each frame, before any GPU command is recorded.",
    d: "Each frame, systems call into the builder to add passes and to create or import resources by description rather than by handle. Imported resources, such as the swap chain image or persistent history buffers, are marked external. The builder records only declarations and callbacks, so building is cheap and can run on any thread. The hard part is the API: it must make wrong usage hard to express, for example reading a resource nobody has written, while letting feature code stay local and not know about the rest of the frame.",
    k: ["Rebuild the graph every frame vs cache it between frames: rebuilding is simple and adapts to settings and visible content; caching saves CPU but needs invalidation rules that are easy to get wrong.", "Typed resource handles vs raw device objects: handles let the compiler defer allocation and catch misuse; they add an indirection that feature authors must learn."],
    p: ["A pass that captures a pointer to per-frame data by reference runs later, after the data is gone, and reads garbage.", "Importing a persistent resource without declaring its starting state makes the first-frame barrier wrong and shows up as a one-frame flash."],
    v: "Dump the built graph for one frame as text and confirm every pass lists its reads and writes, and that disabling a feature removes exactly its passes and no others.",
    dep: ["pass-declaration"]
  },
  "pass-declaration": {
    s: "The contract a pass makes with the graph: which resources it reads or writes, in what usage, and which queue type it runs on, plus a callback that records its commands.",
    d: "A declaration lists each resource with an access type such as sampled, storage read, storage write, color target, depth target or copy source. The graph uses these accesses, not the recorded commands, to decide order and barriers, so the declaration must be truthful. The execution callback runs later with real device objects resolved. Passes also state their queue affinity (graphics, compute, copy) and whether they have side effects that forbid culling. Declarations that are too broad cost overlap, and ones that are too narrow cause hazards the graph cannot see.",
    k: ["Declare accesses explicitly vs infer them from recorded commands: explicit declarations allow planning before recording; inference removes duplication but requires recording first, which defeats reordering.", "Fine-grained subresource declarations vs whole-resource: subresource accuracy enables overlap between mip levels or array slices, and multiplies bookkeeping."],
    p: ["A pass that samples a texture it declared only as written gets no barrier and reads stale data on some GPUs only.", "Marking everything as read-write to be safe removes all parallelism and serializes the frame."],
    v: "Under validation, run a frame where one pass deliberately under-declares a read. The validation layer reports a hazard on that resource, and the graph's own debug check names the same pass.",
    dep: ["render-graph-builder"]
  },
  "graph-compiler": {
    s: "Takes the declared graph and produces an ordered, lifetime-annotated execution plan: dependency sort, culling, memory assignment, barriers and queue splits.",
    d: "Compilation runs on the CPU after all passes are added. It builds edges from producer to consumer, topologically sorts the passes, removes unreachable work, computes first and last use for every resource, assigns memory, derives barriers between uses, and groups passes for different queues with the fences between them. The output is an immutable list the executor walks. It must be fast, since it runs every frame, and deterministic, because ordering differences change results and make bugs impossible to reproduce.",
    k: ["Greedy topological order vs scheduling that minimizes memory or barriers: greedy is fast and predictable; optimizing orderings reduce peak memory but cost compile time and change from frame to frame.", "Compile on a worker thread vs inline: overlapping with other CPU work hides cost, at the price of a harder-to-debug dependency on when passes finished being declared."],
    p: ["Non-deterministic tie-breaking between independent passes yields flicker that appears only in some runs.", "Compile time grows with pass count and shows up as a CPU spike when a feature adds hundreds of tiny passes."],
    v: "Compile the same declared graph twice and confirm byte-identical plans. Then time compilation on the largest scene and confirm it stays under its budget, typically a fraction of a millisecond.",
    dep: ["pass-declaration", "pass-culling", "transient-resources", "automatic-barriers"]
  },
  "transient-resources": {
    s: "Resources that exist for only part of a frame, created virtually in the graph and given real memory only between their first and last use.",
    d: "Intermediate render targets such as the G-buffer, blur buffers and depth pyramids are needed for a few passes. The compiler computes each one's lifetime in pass order, then allocates backing memory from a pool, and lets resources with disjoint lifetimes overlap in the same bytes. Descriptions that match across frames are reused from a cache, so there is no per-frame allocation. The difficulty is that overlapping memory means contents are undefined at first use, so every transient must be fully written, or cleared, before it is read.",
    k: ["Alias disjoint lifetimes in shared memory vs give each its own: aliasing can halve render target memory; it makes reads of uninitialized data deterministic nonsense rather than a clean zero.", "Pool by exact description vs by size class: exact matching is simple; size classes reuse memory across resolutions but waste bytes."],
    p: ["A pass that reads a transient before any writer sees leftover pixels from an unrelated earlier pass.", "Resizing the window changes every description, so the cache misses and memory spikes for a frame while old targets still live."],
    v: "Report peak transient memory for a frame with aliasing enabled and disabled. Enabled must be clearly lower, and a screenshot from both runs must be identical.",
    dep: ["graph-compiler", "resource-aliasing", "sub-allocator"]
  },
  "automatic-barriers": {
    s: "Derives the synchronization between passes from their declared accesses, so passes never write barriers by hand.",
    d: "For each resource the compiler tracks its current usage state across the pass order. When the next pass needs a different state, such as moving from color target to sampled, it emits a barrier with the correct source and destination stages, access masks and image layout. It batches barriers together, merges reads into a combined state, uses split barriers when there is work to hide the transition behind, and emits ownership transfers when the next user is on another queue. Subresource tracking and aliasing make this the most intricate part of the graph.",
    k: ["Track state per whole resource vs per subresource: whole-resource tracking is cheap and simple; per-subresource tracking is required for mip chains and array slices used independently.", "Conservative stage masks vs exact ones: conservative barriers are always correct and stall more; exact ones overlap more work and are the first thing to break on a new GPU."],
    p: ["A missing barrier for a never-before-seen access combination passes on one vendor's GPU and corrupts pixels on another.", "Redundant full-pipeline barriers between every pass hide in captures as long idle gaps on the timeline."],
    v: "Run a frame under strict synchronization validation and confirm zero hazard reports. Then count barriers per frame before and after batching and confirm the count dropped without changing the image.",
    dep: ["graph-compiler", "barriers", "layout-transitions", "ownership-transfer"]
  },
  "pass-culling": {
    s: "Removes passes whose outputs nothing consumes, so disabled or invisible features cost no GPU time and no memory.",
    d: "After the graph is built, the compiler starts from the outputs that matter, such as the swap chain image and any resource marked as having side effects, and walks the graph backward marking every pass that contributes. Anything unmarked is dropped, along with resources only it used. This lets features add their passes unconditionally and relies on the graph to remove dead ones, for example a reflection pass when no reflective surface is visible. Passes that write to external memory or counters must be flagged, or they are removed by mistake.",
    k: ["Cull automatically from outputs vs let features guard their own passes: automatic culling keeps feature code simple; it hides the cost of passes whose results merely look unused to the graph.", "Mark side effects explicitly vs treat all writes to imported resources as live: explicit marking is precise; the default of live is safer and keeps work nobody needs."],
    p: ["A pass writing to a readback buffer is culled because nothing in the graph reads it, and captures come back empty.", "A feature appears disabled and still costs frame time because an unrelated pass keeps its inputs alive."],
    v: "Turn off one effect and capture the frame. Its passes must be absent from the timeline and the transient memory report must drop by that effect's targets.",
    dep: ["graph-compiler", "pass-declaration"]
  },
  "async-compute-scheduling": {
    s: "Runs compute passes on a separate queue concurrently with graphics work, using fences between queues to keep dependencies correct.",
    d: "Some work, like light culling, ambient occlusion or particle simulation, is limited by arithmetic or memory instead of the fixed-function pipeline, so it can overlap with graphics passes that use rasterization hardware. The compiler partitions passes by queue, inserts signal and wait pairs where a dependency crosses queues, and transfers resource ownership if the API needs it. The benefit is real only when overlapped work uses different hardware units. Otherwise the two queues compete, the extra synchronization costs more than it saves, and results vary by GPU.",
    k: ["Overlap on a second queue vs keep everything on one: overlap can recover idle units; it adds fences and ownership transfers and can slow down GPUs that cannot truly run both.", "Static queue assignment per pass vs profile-driven assignment: static is predictable; adaptive tuning wins on each GPU but is hard to test."],
    p: ["Two heavy passes that both saturate memory bandwidth run on separate queues and finish later than serially.", "A fence placed too conservatively makes the compute queue wait for the whole graphics frame, erasing overlap."],
    v: "Capture a frame on a GPU with true async compute and confirm the compute and graphics timeline rows overlap in time, and that total GPU time is lower than with the compute pass on the graphics queue.",
    dep: ["graph-compiler", "queue-families", "timeline-semaphores", "ownership-transfer"]
  },
  "tone-mapping": {
    s: "Converts high-dynamic-range scene light into the limited range of the display, driven by an exposure value that adapts to scene brightness.",
    d: "Lighting is computed in linear floating-point units that span many orders of magnitude. A histogram or average of scene luminance, computed in a compute pass, drives an exposure that adapts over time. A tone curve then compresses the result to display range, followed by the transfer function the output format expects. Done last, after bloom and grading, but before any pass that expects display-referred values, such as UI. Getting exposure wrong changes the apparent brightness of everything, and the curve choice dominates the look of the image.",
    k: ["Histogram-based exposure vs plain average: histograms ignore outliers such as the sun or black bars and are steadier; they cost an extra compute pass and need tuning of the clipped percentiles.", "Fixed curve vs scene-adaptive curve: a fixed curve is predictable for art direction; an adaptive one handles extreme scenes and drifts away from authored looks."],
    p: ["Adapting exposure from last frame's data that includes the UI makes the world pulse when a menu opens.", "Applying the display transfer function twice, once here and once in the swap chain format, washes out the image."],
    v: "Render a gray ramp card at three exposure values and confirm output pixel values match the expected curve, and that moving from a dark room to sunlight converges in the configured adaptation time.",
    dep: ["bloom", "color-grading", "swap-chain"]
  },
  "bloom": {
    s: "Spreads the brightest parts of the image into a soft glow using a chain of downsampled and blurred copies.",
    d: "The scene color is thresholded or weighted by brightness, downsampled through a chain of half-resolution textures with a filter that avoids flicker from tiny bright pixels, and upsampled back with additive blending. Lens-related effects such as flares, dirt masks and glare reuse the same chain. Each level is a render target the graph must allocate and barrier, so bloom is a good test of how cheap small passes are. Energy conservation matters: too much additive glow brightens the whole frame and interacts with exposure.",
    k: ["Downsample-upsample chain vs single wide blur: the chain gives a large, cheap radius with a natural falloff; a single blur is simpler and costs rapidly more as the radius grows.", "Bloom before tone mapping vs after: before keeps physically plausible intensity and glow tracks exposure; after is easier to control and loses the highlights that made it glow."],
    p: ["A single extremely bright pixel produces a flickering star in the blurred chain unless the first downsample filters it.", "The bloom chain allocates targets at odd sizes after a resize and causes visible shimmer from shifting sample positions."],
    v: "Render one very bright pixel against black and capture the result across ten frames. The glow must be stable and symmetric, and total added energy must match the configured intensity.",
    dep: ["tone-mapping"]
  },
  "temporal-aa": {
    s: "Reduces aliasing by jittering the camera sub-pixel each frame and blending the current image with reprojected history.",
    d: "Each frame the projection is offset by a small pattern, so successive frames sample different positions within the pixel. A resolve pass reprojects the previous output using motion vectors, clamps or validates the history against the current neighborhood to reject stale data, and blends. The result approximates supersampling at low cost and also stabilizes noisy effects. It is hard because everything that changes between frames must be accounted for: moving objects, disocclusion, transparency, particles and shader effects with their own noise all produce ghosting or blur if history is trusted incorrectly.",
    k: ["Neighborhood clamping vs variance-based rejection: clamping is cheap and robust; variance methods keep more detail and flicker on thin features.", "Jitter all passes vs only the main one: consistent jitter keeps history correct; unjittered passes such as UI or some post effects must be excluded or they shimmer."],
    p: ["Surfaces without motion vectors, such as transparent particles, leave smeared trails behind them.", "Skipping the jitter removal in texture sampling lowers sharpness, and the whole image looks soft."],
    v: "Pan the camera slowly past a thin high-contrast wire. The wire must stay continuous and not crawl, and a stationary frame must converge to the same image as a supersampled reference within a small error.",
    dep: ["motion-vectors", "view-setup", "tone-mapping"]
  },
  "motion-vectors": {
    s: "Per-pixel records of how far each surface moved on screen since the last frame, used to reproject history for temporal techniques and motion blur.",
    d: "A velocity target is written during the main geometry pass, computed from the current and previous clip-space positions of each vertex, including skinned and animated meshes, so the renderer must keep last frame's transforms and bone data. Camera motion is added for static pixels afterward. History buffers for anti-aliasing, upscaling, denoising and exposure are all reprojected with it. The difficulty is coverage: anything drawn without correct velocity, such as vertex shader displacement or transparent surfaces, becomes a source of ghosting for every temporal consumer.",
    k: ["Write velocity in the geometry pass vs reconstruct from depth: writing is exact for moving objects; depth reconstruction costs no target but only handles camera motion.", "Previous-frame vertex data retained vs recomputed: retaining uses memory and bandwidth; recomputing risks mismatches with the animation actually shown last frame."],
    p: ["Procedural wind in the vertex shader moves geometry but not its velocity, so foliage ghosts.", "Teleporting the camera without resetting history streaks the first frames after the cut."],
    v: "Render a known object moving at a fixed screen speed and read back its velocity target. Values must match the expected pixel displacement, and a camera cut must flag history as invalid.",
    dep: ["view-setup", "render-proxies"]
  },
  "upscaler": {
    s: "Renders at lower internal resolution and reconstructs a full-resolution image from several frames of jittered samples, with motion vectors and depth as inputs.",
    d: "The renderer draws the scene at a fraction of display resolution with sub-pixel jitter, runs the upscaler on color, depth and motion vectors, and the output replaces the anti-aliasing resolve. Some are analytic algorithms and some run a learned model on matrix hardware. The pipeline splits into passes before the upscale, which run at internal resolution, and passes after it, at output resolution. Texture level-of-detail bias, jitter pattern, exposure and a reactive mask for transparent content must all follow the upscaler's rules or quality collapses.",
    k: ["Learned upscaler vs analytic one: learned models recover more detail and need specific hardware or a vendor library; analytic ones run anywhere and soften fine detail.", "Upscale early and shade at output resolution vs upscale late: late saves the most cost; early lets expensive screen-space effects run at full detail and costs more."],
    p: ["Forgetting the negative mip bias for the lower internal resolution makes every texture look blurry after upscaling.", "Feeding already-tone-mapped color when the upscaler expects linear HDR produces halos around bright edges."],
    v: "Compare a native-resolution frame to a quality-mode upscaled frame of the same static scene. Differences must stay within the documented error, and GPU time must drop by roughly the pixel count ratio.",
    dep: ["temporal-aa", "motion-vectors"]
  },
  "dof-motion-blur": {
    s: "Image-space simulation of camera focus and shutter: blur that grows with distance from the focal plane and along per-pixel motion.",
    d: "Depth of field uses a circle of confusion computed from depth, aperture and focus distance, then gathers or scatters color in a few passes, splitting foreground and background layers to keep sharp objects from bleeding into blur. Motion blur uses the velocity buffer to smear pixels along their path, with tile-based maximum velocity to bound the search. Both are expensive when blur radii are large, so implementations downsample first. The difficult parts are edges, where a sharp foreground over a blurred background and the reverse need different treatment.",
    k: ["Gather-based blur vs scatter-based bokeh sprites: gather is predictable and cheap; scatter gives true bokeh shapes and costs fill rate that varies with scene content.", "Per-object motion blur vs camera-only: per-object blur needs a full velocity buffer and conveys speed; camera-only is nearly free and misses moving characters."],
    p: ["Foreground blur that does not extend over sharp background pixels leaves a hard silhouette around out-of-focus objects.", "Motion blur from a velocity target missing some objects smears the background across them."],
    v: "Render a point light grid with the focus plane moved through it. Disc sizes must match the computed circle of confusion, and a pixel moving 20 pixels per frame must blur along exactly that path.",
    dep: ["motion-vectors", "tone-mapping"]
  },
  "color-grading": {
    s: "Maps final colors through an artist-authored transform, usually a three-dimensional lookup table sampled once per pixel.",
    d: "Grading adjusts contrast, saturation, tint and the overall look. The adjustments are baked into a small 3D lookup table, often 32 or 64 texels per side, which the final pass samples with trilinear filtering after converting to a perceptual encoding, so a single texture fetch replaces a long chain of math. Tables are blended between scene volumes or time of day. The display's color space and the output range also enter here. The traps are precision and interpolation: grading in the wrong encoding bands the dark gradients.",
    k: ["Lookup table vs per-pixel math: a table is constant cost and supports arbitrary authored looks; math is exact and costs more as controls multiply.", "Grade before vs after tone mapping: before keeps grading in scene-referred space and reacts to exposure; after is intuitive for artists and clips highlights."],
    p: ["Sampling the table in linear space puts almost all texels in the bright range and bands shadows.", "Blending two tables with 8-bit storage introduces rounding steps visible in smooth skies."],
    v: "Apply an identity table and confirm the output equals the input within one code value across a full gradient. Then load a test table and compare against the offline-computed result.",
    dep: ["tone-mapping"]
  },
  "view-setup": {
    s: "Builds each view's camera, projection, jitter and per-view constants, for the main camera and every shadow, reflection or capture view.",
    d: "A view bundles the matrices, viewport, the previous frame's matrices for reprojection, near and far planes with a reversed depth range, jitter offset, exposure and the frustum used for culling. The renderer usually has many views at once: the player camera, each shadow cascade, light faces, planar reflections and probe captures. Per-view data is packed into a constant buffer written to a ring. Precision matters: a large world needs camera-relative transforms and a floating-point depth range chosen to avoid z-fighting at distance.",
    k: ["Reversed floating-point depth vs standard integer depth: reversed gives near-uniform precision over a large range; it requires every comparison and clear value to be flipped consistently.", "Camera-relative rendering vs absolute world coordinates: relative transforms remove jitter at large distances; they require rebasing every cached world position each frame."],
    p: ["One pass that still assumes the old depth direction culls everything or fails every test.", "Using the unjittered matrix for culling and the jittered one for drawing makes objects at the screen edge pop."],
    v: "Project known world points and compare against expected pixel positions in a captured frame, at the origin and at ten kilometers away. Both must agree to sub-pixel accuracy.",
    dep: ["frustum-culling"]
  },
  "render-proxies": {
    s: "Renderer-owned copies of the data it needs from each scene object, kept separate from gameplay data so rendering can read them from another thread.",
    d: "When a mesh, light or decal is created or changed, the scene sends an update command that the renderer applies to its own proxy: transform, bounds, mesh and material references, visibility flags and flags like cast-shadow. The renderer never touches gameplay objects during a frame. This lets simulation run ahead on another thread and keeps cache-friendly arrays for culling. The cost is duplication and the need to synchronize updates, and the hardest bugs are objects that look stale for a frame or leak proxies after deletion.",
    k: ["Proxy copy with update commands vs direct reads of scene data: copies isolate threads and allow cache-tight layouts; direct reads avoid duplication and require locking or lockstep.", "Structure-of-arrays storage vs object per proxy: arrays make culling fast and vectorizable; objects are simpler to extend and cost a cache miss per item."],
    p: ["Deleting an object while its proxy is still referenced by an in-flight frame frees GPU data the GPU is still reading.", "An update command lost during a load causes an object that is visible to gameplay and absent on screen."],
    v: "Spawn, move and delete ten thousand objects over a hundred frames with the renderer one frame behind, and confirm the count of live proxies matches the scene and no validation errors appear.",
    dep: ["frames-in-flight"]
  },
  "draw-list-sorting": {
    s: "Orders visible draws by a packed sort key so state changes are minimized for opaque work and depth order is correct for transparent work.",
    d: "Each visible mesh-material pair yields a draw with a 64-bit key: pass, pipeline, material, then depth for opaque work to reduce overdraw front to back, or depth back to front for blended work. Keys are sorted in parallel with a radix sort. Fewer pipeline and descriptor changes cost less CPU and let the GPU keep state in flight. With GPU-driven rendering the sort moves to compute or disappears into bindless access. The weakness is that perfect sorting for state and for depth conflict, and transparency cannot be fully solved by any order.",
    k: ["Sort by state first vs by depth first: state-first minimizes CPU and driver work; depth-first minimizes overdraw and helps when pixel shading is the bottleneck.", "Sort every frame vs retain a cached order: caching saves CPU for static scenes and breaks when objects move or views change."],
    p: ["Sorting transparent objects by their center produces visible popping where large objects overlap.", "Sort keys with too few depth bits make distant objects tie and flicker between orders."],
    v: "Capture one frame and count pipeline switches. They must be equal to the number of distinct pipelines used, and a transparent test scene must blend in correct far-to-near order.",
    dep: ["render-proxies", "pipeline-state"]
  },
  "instancing-batching": {
    s: "Combines many draws of the same mesh and material into one call with per-instance data, cutting CPU overhead and driver work.",
    d: "Instances of identical geometry share a draw call, and per-instance transforms and parameters are read from a structured buffer using the instance index. Batching merges compatible draws across different meshes when they share a pipeline and are placed in one large vertex and index buffer. On an explicit API the per-draw cost is already small, so the goal shifts to reducing recorded commands and descriptor changes. The difficulty is data: per-instance buffers must be filled each frame without stalling, and merged geometry breaks per-object culling and LOD.",
    k: ["Hardware instancing vs merged static geometry: instancing keeps per-object culling and flexibility; merging has the lowest draw count and loses per-object control.", "Per-instance data in a shared buffer vs per-draw constants: a shared buffer scales to thousands of instances; per-draw constants are simpler for a handful."],
    p: ["Instance data written for the wrong frame in flight is overwritten while the GPU still reads it, causing flickering transforms.", "Over-batching merges unrelated objects, so culling can no longer reject any of them."],
    v: "Render ten thousand identical meshes and confirm one instanced draw call appears in the capture, with CPU render-thread time at least an order of magnitude below the per-object version.",
    dep: ["draw-list-sorting", "buffers", "staging-ring"]
  },
  "lod-selection": {
    s: "Chooses a coarser mesh or simpler material for objects as they become small on screen, trading unnoticed detail for lower vertex and shading cost.",
    d: "Each object carries a chain of levels, each with an error metric. The renderer projects that error to screen space for the current view and picks the level whose error stays under a pixel threshold, with hysteresis to prevent flicker at boundaries. Transitions use dithered cross-fades or are hidden by small error. In GPU-driven pipelines selection runs per cluster in a compute shader. Shadow views choose levels independently, usually coarser. Hard parts are popping and consistent selection across passes, since a depth prepass and the main pass must draw the same level.",
    k: ["Discrete levels vs continuous cluster-level simplification: discrete is simple and widely supported; continuous removes popping and needs a cluster hierarchy and a GPU-driven path.", "Select per object vs per cluster: per object is cheap and coarse; per cluster follows the surface better at a higher culling cost."],
    p: ["A prepass and a color pass that select different levels cause depth mismatch and speckled artifacts.", "A level with a different silhouette makes shadows pop even when the main view looks stable."],
    v: "Move an object away from the camera in fixed steps and log the selected level. Switch distances must match the error threshold, with no flip-flopping within the hysteresis band.",
    dep: ["view-setup", "render-proxies"]
  },
  "frustum-culling": {
    s: "Rejects objects whose bounds lie entirely outside the camera's view volume before any draw is recorded.",
    d: "Bounding spheres or boxes are tested against six planes extracted from the view-projection matrix. Tests run over structure-of-arrays bounds in parallel jobs, often hierarchically against a spatial structure so whole branches reject at once. Every view repeats this: shadow cascades test against the light's volume. The result is a list of indices that later stages sort and turn into draws. It is a conservative test, so it is correct to keep something invisible, but never to drop something visible, which is why bounds that do not cover skinning or vertex displacement cause missing objects.",
    k: ["Test against a spatial hierarchy vs a flat array: a hierarchy rejects large groups cheaply and costs updates when objects move; a flat vectorized array has predictable cost and scales linearly.", "Sphere tests vs oriented boxes: spheres are the cheapest and loose; boxes are tighter and reject more at about twice the cost."],
    p: ["Skinned or procedurally animated meshes with static bounds disappear when the animation extends outside them.", "Culling against the unjittered or previous frame's frustum drops objects on the screen edge during fast camera turns."],
    v: "Rotate the camera in one-degree steps with a marker object at known angles. The object must appear exactly when its bounds enter the frustum, and counts of tested versus accepted objects must match the test scene.",
    dep: ["view-setup", "render-proxies"]
  },
  "occlusion-culling": {
    s: "Removes objects hidden behind other geometry by testing their bounds against a hierarchical depth pyramid built from the previous or current frame's depth.",
    d: "Depth from occluders is downsampled into a pyramid keeping the farthest value per texel. Each candidate's bounding box is projected to screen, the right mip is chosen from its size, and a few texel reads decide whether it could be visible. Two-pass schemes first draw what was visible last frame, rebuild the pyramid, then test the rest and draw newly visible objects. It runs in compute and produces a visible list or indirect arguments directly. Reprojected history from the last frame is cheap and wrong after fast motion, so a correction pass is required.",
    k: ["Previous-frame depth with a second pass vs current-frame depth from a prepass: two-pass avoids drawing everything twice and needs careful handling of disocclusion; a prepass is simpler and costs a full depth draw.", "Software rasterized occluders vs GPU depth: software is deterministic and early; GPU depth is automatic and one frame late."],
    p: ["Using last frame's pyramid without the second pass makes objects pop in late after quick camera moves.", "Testing with a depth pyramid from a mismatched resolution or reversed depth rejects visible objects."],
    v: "Place a large wall in front of a thousand objects and confirm the culled count rises to match. Then spin the camera quickly and confirm no object that is visible in a reference render is missing.",
    dep: ["gpu-driven-culling", "frustum-culling"]
  },
  "gpu-driven-culling": {
    s: "Runs culling and LOD selection in compute shaders over GPU-resident scene data, so the CPU never touches per-object visibility.",
    d: "Object and cluster data live in persistent GPU buffers that are updated sparsely. A compute pass tests each against the frustum and the depth pyramid, picks the LOD, and appends survivors to a compacted list using atomics or a prefix sum, writing counts that feed indirect draws. The CPU records a small fixed number of commands regardless of scene size. This pays off for scenes with tens of thousands of objects. It is hard because debugging happens on data the CPU does not see, and the persistent scene buffers need their own allocation and update scheme.",
    k: ["GPU-resident scene data vs per-frame CPU upload: resident data removes CPU cost at scale and needs sparse update machinery; per-frame upload is simple and caps scene size.", "Atomic append vs prefix-sum compaction: atomics are short and non-deterministic in order; prefix sums preserve order at the cost of extra passes."],
    p: ["Non-deterministic append order causes sorting-dependent artifacts that vary between runs.", "A bug in the persistent buffer update leaves a deleted object's data in place and it draws a ghost."],
    v: "Read back the compacted visible list for a fixed camera and compare with a CPU reference culling of the same scene. The sets must match, and CPU time must not grow with object count.",
    dep: ["frustum-culling", "occlusion-culling", "indirect-draws", "buffers"]
  },
  "indirect-draws": {
    s: "Draw commands whose arguments are read from a GPU buffer at execution time, letting a compute pass decide what gets drawn.",
    d: "An indirect draw takes vertex counts, instance counts and offsets from a buffer rather than from recorded parameters. Multi-draw variants execute many entries in one command, optionally with a count also read from a buffer, so the number of visible draws can be decided by culling on the GPU. Per-draw data is fetched through a draw index. The buffer must be written and barriered before the draw reads it, and its size must cover the maximum possible count. Support for per-draw state changes inside the buffer varies, so most designs keep one pipeline per indirect call.",
    k: ["Multi-draw with GPU count vs fixed maximum with empty entries: GPU count executes only visible draws; fixed maximum works everywhere and costs command processor time on empty entries.", "One indirect call per pipeline vs a single call using bindless: per-pipeline calls keep state changes simple; a single call needs bindless materials and uniform shaders."],
    p: ["Reading the argument buffer before the culling pass finishes draws garbage counts and can hang the GPU.", "An argument buffer sized for the average rather than the worst case overflows in a busy scene."],
    v: "Draw with an argument buffer that culling filled, and compare the capture's draw count against the visible set. Force a worst-case scene and confirm no out-of-bounds validation errors.",
    dep: ["gpu-driven-culling", "barriers", "bindless"]
  },
  "meshlet-pipeline": {
    s: "Splits geometry into small clusters of triangles processed by task and mesh shaders, which cull and emit primitives directly on the GPU.",
    d: "Meshes are preprocessed offline into meshlets of a few dozen vertices and triangles, each with a bounding sphere and a normal cone. A task stage tests clusters for visibility and selects LOD, and a mesh stage reads each surviving cluster's data and emits primitives to the rasterizer, replacing the fixed vertex fetch. Hardware without mesh shaders falls back to a compute culling pass and indirect draws. Cluster size is a tuning knob, and the cost of the approach is an offline build step and different handling for skinned or deformed meshes.",
    k: ["Mesh shader path vs compute plus indirect draws: mesh shaders skip an intermediate buffer and need newer hardware; compute plus indirect runs everywhere and writes visible triangles to memory.", "Small vs large meshlets: small clusters cull tightly and increase task overhead; large ones are efficient to launch and cull coarsely."],
    p: ["Normal cone culling on deforming meshes drops clusters that are visible after the deformation.", "Maintaining both the mesh shader path and the fallback doubles the test matrix and they drift apart."],
    v: "Render the same scene through both paths and compare images and triangle counts. They must match within rasterization differences, and the mesh shader path must show fewer triangles submitted to raster.",
    dep: ["gpu-driven-culling", "lod-selection", "rhi-abstraction"]
  }
});
