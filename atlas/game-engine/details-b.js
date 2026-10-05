// Game engine details: rendering, animation, physics, audio.
ATLAS.details("game-engine", {
  "render-hardware-interface": {
    s: "A thin abstraction over the platform's graphics APIs: buffers, textures, pipelines and command lists behind one interface, so the renderer above never names a specific API.",
    d: "The RHI wraps resource creation, pipeline state, descriptor binding, command recording, queue submission and swapchain presentation. Renderer code records commands against abstract handles, and a backend per API translates them. It owns memory placement, resource state transitions, synchronization between queues and the lifetime of GPU objects that may still be in flight for several frames. The hard part is choosing an abstraction level: too close to one API forces emulation on the others, too high hides the control that modern explicit APIs exist to give. Debug layers, validation and capture hooks live here too.",
    k: [
      "Explicit-style interface vs high-level immediate interface: explicit maps cleanly to modern APIs and gives control, but pushes barriers, lifetimes and memory management onto renderer authors.",
      "One backend per API vs a single lowest-common-denominator path: separate backends exploit each platform fully but multiply test and maintenance cost.",
      "Render-thread command recording vs recording on any thread: parallel recording scales across cores but needs per-thread allocators and careful submission ordering."
    ],
    p: [
      "Freeing a buffer or texture the GPU is still reading because lifetimes were tied to CPU frames, causing rare corruption or device loss that only appears on some drivers.",
      "Missing or redundant resource barriers that pass on one vendor's hardware and produce flicker or hangs on another."
    ],
    v: "Run the same test scene on every supported backend with validation layers enabled; zero validation errors, and screenshots diff within tolerance against a reference. Stress resize, device-lost recovery and rapid resource churn for several minutes.",
    dep: ["platform-abstraction", "memory-allocators"],
  },
  "shader-system": {
    s: "Compiles, permutes, caches and binds the GPU programs that run every pass, turning shader source and material options into ready-to-use pipeline objects.",
    d: "Shader source is authored once in a high-level language, with includes and feature switches, and cross-compiled offline to each backend's bytecode. The system tracks permutations, such as lighting model, skinning or alpha test, reflects each program's resource bindings and builds a cache keyed by source hash and options. At runtime it supplies pipeline objects to the renderer, ideally precompiled so no stall occurs mid-frame. Difficulty comes from permutation explosion, long compile times, driver-level pipeline compilation hitches and keeping reflection data consistent across backends.",
    k: [
      "Compile all permutations offline vs on demand: offline removes hitches but inflates build time and package size; on demand is lean but stutters unless warmed up.",
      "Uber-shader with dynamic branches vs many specialized permutations: uber-shaders reduce variants and switches, specialized code is faster per pixel and uses fewer registers.",
      "Cross-compile from one source language vs hand-written per backend: one source avoids drift but constrains features to what translates reliably."
    ],
    p: [
      "Shipping without a precompiled pipeline cache, so players see multi-hundred-millisecond hitches the first time each effect appears.",
      "Letting every material flag double the permutation count until builds take hours and most variants are never used."
    ],
    v: "Clear the shader and pipeline caches, play a scripted route that triggers every material type, and record frame times. No frame exceeds budget due to compilation, and a variant-usage report shows no unused permutations shipped.",
    dep: ["render-hardware-interface", "reflection-and-types", "hot-reloading"],
  },
  "materials-and-pbr": {
    s: "Describes how surfaces respond to light using physically based parameters such as base color, roughness and metalness, so assets look consistent under any lighting.",
    d: "A material couples a shader with parameters and textures. Physically based models split a surface into diffuse and specular response governed by a few intuitive, measurable inputs, usually base color, metalness, roughness, normal and occlusion. Instances override parameters of a parent material cheaply, so thousands of objects share one program. The engine sorts draws by material to minimize state changes, packs parameters into constant buffers or bindless tables, and handles special models such as skin, hair, glass and clear coat. Consistency across lighting conditions depends on energy conservation and calibrated reference values.",
    k: [
      "Metallic-roughness vs specular-glossiness parameterization: metallic-roughness is harder to author invalidly; specular workflows allow more control but make non-physical values easy.",
      "Fixed set of shading models vs fully custom material graphs: fixed models are fast and predictable; graphs give artists freedom at the cost of unbounded shader cost.",
      "Material instancing with parameter overrides vs unique materials per object: instancing batches well and saves memory; uniqueness adds draw state and compile cost."
    ],
    p: [
      "Artists tuning albedo against one light rig, producing assets that look wrong elsewhere because texture values violate physical ranges.",
      "Using many unique materials with no instancing, which prevents batching and multiplies shader permutations and memory."
    ],
    v: "Render a calibration scene with reference spheres at varied roughness and metalness under several lighting setups; compare to known-good images. Artists confirm a single asset looks correct in sun, interior and night scenes without retuning.",
    dep: ["shader-system", "runtime-resource-manager"],
  },
  "renderer-architecture": {
    s: "The overall shape of the renderer: forward, deferred or clustered shading, how scene data is gathered each frame, and how responsibilities split between the game thread and render thread.",
    d: "This is the decision that fixes how lights, materials and transparency are handled. The renderer extracts a snapshot of visible objects from the world, builds draw lists, sorts them and feeds them to passes. Forward shading evaluates lights while drawing; deferred writes surface attributes to a G-buffer and shades afterward; clustered and tiled variants bin lights spatially. It also defines how scene state is mirrored to the render thread, how view-dependent work is organized and which features each platform tier receives. Changing it late touches nearly every other rendering component.",
    k: [
      "Forward vs deferred shading: forward handles transparency and MSAA naturally but scales poorly with many lights; deferred decouples lights from geometry but costs bandwidth and complicates transparency.",
      "Render-side scene mirror vs reading game state directly: a mirror removes locking and enables pipelining but adds copy cost and one frame of latency.",
      "Retained draw lists vs rebuilt every frame: retained is cheaper for static scenes but harder to keep correct as objects change."
    ],
    p: [
      "Reading live gameplay transforms from the render thread without a snapshot, producing torn objects where position and rotation come from different frames.",
      "Choosing deferred shading for a handheld or VR target where G-buffer bandwidth dominates the frame budget."
    ],
    v: "Build scenes with one, hundreds and thousands of dynamic lights plus heavy transparency on each target tier; frame time and image correctness stay within budget. Pause the game thread and confirm rendering continues without tearing.",
    dep: ["render-frame-graph", "visibility-and-culling", "scene-graph-and-transforms", "threading-model"],
  },
  "render-frame-graph": {
    s: "Declares a frame's passes and the resources they read and write, then compiles that graph to schedule work, allocate transient memory and insert synchronization automatically.",
    d: "Each pass registers the resources it consumes and produces, without allocating them. The compiler culls passes whose outputs are unused, orders the rest, aliases transient textures with non-overlapping lifetimes to share memory, and derives the barriers and layout transitions the RHI needs. It can also overlap independent passes on separate queues, such as compute running beside graphics. Features become isolated, composable passes rather than hand-ordered code. Difficulty lies in debuggability, handling resources that persist across frames, and keeping the declaration phase cheap enough to rebuild every frame.",
    k: [
      "Rebuilt every frame vs cached graph: rebuilding permits dynamic features and simple code, caching saves CPU but needs invalidation whenever settings change.",
      "Automatic aliasing of transient memory vs manual allocation: aliasing cuts memory substantially but makes use-after-free bugs harder to diagnose.",
      "Async compute scheduling in the compiler vs by hand: automatic placement is convenient but may serialize poorly on hardware with limited queue overlap."
    ],
    p: [
      "A pass that writes to a persistent resource gets culled because nothing in the graph reads it, so history textures silently stop updating.",
      "Declaring a resource's size from last frame's settings, causing one-frame mismatches on resolution change."
    ],
    v: "Dump the compiled graph for a reference frame and confirm pass order, culled passes and aliasing match expectations; toggle each feature and verify its passes and memory vanish. Validate that GPU captures show no redundant barriers.",
    dep: ["render-hardware-interface", "job-system"],
  },
  "visibility-and-culling": {
    s: "Decides which objects can possibly affect the image this frame, discarding the rest early using frustums, occlusion and distance so the GPU only draws what matters.",
    d: "Culling runs in stages: coarse spatial queries against a hierarchy, frustum tests on bounds, distance and size thresholds, then occlusion tests using software rasterization, portals or the previous frame's depth buffer. Increasingly the work runs on the GPU over instance arrays and emits indirect draw arguments. Each light and shadow view repeats the process. The output is a compact visible set per view. Conservative tests must never drop something visible, yet need to be cheap enough to run on thousands of objects in well under a millisecond.",
    k: [
      "CPU culling vs GPU-driven culling: CPU is simpler and easier to debug, GPU culling scales to huge instance counts and removes draw submission cost but needs indirect-draw support.",
      "Hardware occlusion queries vs depth-pyramid tests: queries are exact but stall or lag, pyramid tests are fast and synchronous but conservative.",
      "Precomputed visibility vs runtime-only: precomputed is nearly free at runtime but breaks with dynamic geometry and adds bake time."
    ],
    p: [
      "Using stale previous-frame depth for occlusion without handling fast camera cuts, so objects pop in for a frame after teleports.",
      "Bounding volumes that ignore vertex animation or shader displacement, so deforming meshes vanish at screen edges."
    ],
    v: "Fly a camera through a dense test scene with culling debug visualization; count submitted versus visible objects, and diff screenshots against a run with culling disabled. Images must match exactly while draw count drops substantially.",
    dep: ["spatial-partitioning", "cameras-and-viewports", "scene-graph-and-transforms"],
  },
  "lighting": {
    s: "Computes how light sources illuminate surfaces each frame: direct lights of several types, ambient contribution, exposure and the data structures that make many lights affordable.",
    d: "Directional, point, spot and area lights are described by color, intensity in physical units, falloff and shape. The renderer decides which lights touch which pixels, using tiles, clusters or per-object lists, and evaluates a shading model for each. Static lighting may be baked into lightmaps or probes while dynamic lights are evaluated live. Exposure adaptation maps wide-range luminance into display range. Costs scale with light count and overdraw, so budgets, light culling and radius limits matter. Consistent units between artists and the shader are essential to predictable results.",
    k: [
      "Baked vs fully dynamic lighting: baked is cheap and high quality but static; dynamic supports time of day and destruction at higher runtime cost.",
      "Clustered light binning vs per-object light lists: clustering handles large light counts uniformly, per-object lists are simpler and fine for few lights.",
      "Physical light units vs arbitrary intensity: physical units make exposure and assets consistent across scenes but need training and sensible defaults."
    ],
    p: [
      "Letting artists place hundreds of overlapping lights with large radii, so overdraw and shading cost explode in a single room.",
      "Lighting values authored in one color space and shaded in another, producing washed-out or crushed results."
    ],
    v: "Load a stress scene with a defined maximum light count; GPU lighting pass time stays within budget, and a debug view of light-per-tile counts shows no tile exceeding the cap. Compare against a brute-force reference render.",
    dep: ["materials-and-pbr", "renderer-architecture", "visibility-and-culling"],
  },
  "shadows": {
    s: "Determines which surfaces are hidden from each light, usually by rendering depth from the light's viewpoint and testing against it, giving objects grounding and scenes depth.",
    d: "The common technique renders scene depth into shadow maps, one per spot light, several cascades for the sun, and cube or atlas entries for point lights. Shading samples these with filtering to soften edges. Resolution, bias and cascade splits trade quality against cost; atlases and caching limit redraws of static casters. Alternatives include ray-traced shadows and screen-space contact shadows for fine detail. Difficulty comes from aliasing, acne and light leaking, the cost of rendering geometry again per light, and keeping quality stable as the camera moves.",
    k: [
      "Cascaded vs virtual shadow maps: cascades are simple and predictable; virtual maps give uniform texel density but need page management and feedback passes.",
      "Cached static shadows vs redrawing every frame: caching saves large amounts of geometry cost but requires invalidation when casters move.",
      "Shadow maps vs ray-traced shadows: maps work everywhere and are cheap; ray tracing gives accurate penumbrae at higher cost and hardware requirements."
    ],
    p: [
      "Fitting cascades to the camera frustum every frame without snapping to texel increments, so shadow edges shimmer as the camera moves.",
      "Fixed depth bias tuned for one scene, causing self-shadowing acne on slopes or detached shadows on thin objects elsewhere."
    ],
    v: "Pan and rotate the camera slowly over a test scene and capture consecutive frames; shadow edges must not crawl or shimmer. Check for acne and peter-panning on a slope-and-thin-object scene, and report shadow pass timings against budget.",
    dep: ["render-hardware-interface", "visibility-and-culling", "lighting"],
  },
  "global-illumination": {
    s: "Approximates light bouncing between surfaces and reflections of the environment, so indirect light, color bleeding and glossy reflections respond to the scene.",
    d: "Techniques range from baked lightmaps and probe grids to real-time methods: screen-space tracing, voxel or distance-field cones, probe volumes updated incrementally, and hardware ray tracing with denoising. Reflections combine captured cubemaps, planar renders and screen-space or ray-traced hits. Results are blended with ambient occlusion to ground contact areas. The core tension is correctness against stability: dynamic methods are noisy, leak light through thin walls and lag behind changes, so engines mix several techniques and fall back gracefully on weaker hardware.",
    k: [
      "Baked vs real-time global illumination: baked is cheap and stable but static; real-time reacts to moving lights and geometry at significant cost and noise.",
      "Probe grids vs screen-space methods: probes work off-screen and are temporally stable but low resolution; screen-space is sharp but lacks off-screen information.",
      "Hardware ray tracing with denoising vs software tracing: hardware gives accuracy but limits platforms; software fallbacks broaden reach with lower fidelity."
    ],
    p: [
      "Light leaking through thin walls because probes or voxels are coarser than the geometry that is supposed to block them.",
      "Temporal accumulation that ghosts or lags visibly when a light or door moves, because history is not invalidated."
    ],
    v: "Toggle a light on and off in a closed room and watch the indirect response over ten frames: it settles without ghosting or flicker. Compare against an offline path-traced reference of the same scene and check leaks at thin walls.",
    dep: ["lighting", "shadows", "render-frame-graph", "spatial-partitioning"],
  },
  "meshes-and-instancing": {
    s: "Stores and draws geometry efficiently: vertex and index formats, level-of-detail chains, and instancing that renders many copies of a mesh in few draw calls.",
    d: "Meshes are packed into large shared buffers with compact vertex formats, quantized positions and normals, and per-submesh material slots. Level-of-detail chains swap or morph to cheaper versions by screen size. Instancing draws many copies with per-instance transforms and parameters read from a buffer; indirect drawing lets the GPU generate those arguments. Cluster-based schemes split meshes into small meshlets for finer culling and continuous detail. The difficulty is balancing draw call count, memory bandwidth, vertex cache efficiency and LOD popping across thousands of objects.",
    k: [
      "Discrete LOD chains vs continuous cluster-based detail: discrete is simple and widely supported; cluster schemes avoid popping and authoring LODs but need a more complex pipeline.",
      "Interleaved vs separate vertex streams: separate streams let depth-only passes read less data, interleaved is better for full shading.",
      "Instancing with per-instance buffers vs merged static batches: instancing keeps objects individually movable, merging costs memory but removes per-instance fetch cost."
    ],
    p: [
      "Generating LODs with thresholds that ignore field of view or resolution, so objects visibly pop at some settings.",
      "Thousands of tiny unique meshes each with their own draw call and buffer, instead of sharing storage and instancing."
    ],
    v: "Render a scene of ten thousand instances of several meshes; draw call count stays below a stated limit, frame time meets budget, and a camera dolly shows no visible LOD popping beyond tolerance in captured frame diffs.",
    dep: ["render-hardware-interface", "visibility-and-culling", "runtime-resource-manager"],
  },
  "terrain-and-foliage": {
    s: "Renders large heightfield landscapes and the vegetation on them, using tiled level of detail, blended material layers and heavy instancing to cover kilometers within budget.",
    d: "Terrain is stored as tiled heightmaps with splat maps blending material layers, rendered with distance-based tessellation or clipmap meshes so detail concentrates near the camera. Foliage is scattered procedurally or by painting, culled in clusters and drawn as instances with impostors or billboards at range, with wind animation in the vertex shader. Streaming supplies tiles as the player moves. Collision and navigation data derive from the same heights. Difficulty comes from seams between levels of detail, overdraw from dense vegetation, shadow cost and storage for large worlds.",
    k: [
      "Clipmaps vs quadtree tiles: clipmaps give predictable memory and smooth LOD; quadtrees adapt to varied detail and edits but need crack handling.",
      "Painted foliage vs procedural scattering: painted gives authored control but large data; procedural scales to huge areas and saves storage but is harder to art-direct.",
      "Impostors vs geometric LODs for distant trees: impostors are very cheap but show parallax errors; mesh LODs look correct but cost more."
    ],
    p: [
      "Cracks and popping where adjacent terrain tiles pick different detail levels and edge vertices do not match.",
      "Alpha-tested foliage overdraw that turns forests into the most expensive pixels on screen, especially in shadow passes."
    ],
    v: "Fly across the full terrain at maximum speed with foliage at highest density; no cracks appear in captured frames, streaming keeps pace, and GPU time for terrain and vegetation passes stays within their budget.",
    dep: ["meshes-and-instancing", "streaming", "materials-and-pbr", "level-streaming"],
  },
  "particles-and-vfx": {
    s: "Simulates and draws large numbers of small, short-lived elements such as smoke, sparks and magic, driven by emitters that artists author as modular effects.",
    d: "An effect is a set of emitters, each with spawn rules, per-particle modules for forces, color and size over lifetime, and a renderer type: camera-facing sprites, meshes, ribbons or lit volumes. Simulation runs on the CPU for small counts or on the GPU in compute for millions, writing into buffers that drawing reads directly. Particles can collide with a depth buffer or distance fields and emit lighting or events. Hard problems are sorting translucent particles, overdraw and fill-rate cost, deterministic behavior, pooling to avoid allocation, and keeping effects within a strict budget when many gameplay events fire at once.",
    k: [
      "CPU vs GPU simulation: CPU makes gameplay interaction and events simple; GPU handles vastly more particles but makes feedback to gameplay slow or impossible.",
      "Sorted vs unsorted blending: sorting avoids visible artifacts but costs time; order-independent approximations are cheaper and imperfect.",
      "Authoring as module stacks vs node graphs: stacks are quick to learn and validate, graphs allow arbitrary behavior but are harder to budget."
    ],
    p: [
      "Large, soft, overlapping smoke sprites filling the screen, so fill-rate cost spikes exactly during the most intense combat moments.",
      "Spawning effects per event without pooling or caps, so a crowd firing at once allocates memory and drops frames."
    ],
    v: "Trigger the worst-case scripted battle with every effect active; GPU and CPU particle time stay within budget, the active particle count never exceeds its cap, and screenshots show correct translucent ordering.",
    dep: ["render-frame-graph", "shader-system", "job-system", "visibility-and-culling"],
  },
  "post-processing": {
    s: "Full-screen passes applied after scene shading that turn raw lit pixels into the final image: tone mapping, bloom, depth of field, motion blur, color grading and anti-aliasing.",
    d: "Post-processing runs on the lit HDR image plus auxiliary buffers such as depth and velocity. Typical stages are temporal anti-aliasing or upscaling, exposure and tone mapping to display range, bloom, depth of field, motion blur, color grading through lookup tables and film effects. Volumes or camera settings blend parameters smoothly between areas. Passes chain through the frame graph and, being bandwidth bound, are often fused or run in compute. Quality depends on color space discipline, handling HDR output, and keeping UI and screen effects out of unwanted passes.",
    k: [
      "Temporal anti-aliasing vs MSAA or post filters: temporal is cheap and handles shader aliasing but can blur and ghost; MSAA is sharp but costly and misses shading aliasing.",
      "Many separate passes vs fused passes: separate passes are modular, fused ones save bandwidth but are harder to maintain.",
      "Artist-authored grading in a lookup table vs per-parameter controls: tables are flexible and cheap at runtime, parameters are easier to animate and blend."
    ],
    p: [
      "Applying tone mapping before or after UI composition inconsistently, so interface colors shift between SDR and HDR outputs.",
      "Motion vectors that omit skinned or moving objects, producing ghost trails under temporal anti-aliasing."
    ],
    v: "Render a gradient and color-chart scene through the full chain on SDR and HDR displays and compare measured output to expected values. Move fast objects across the screen and confirm no ghosting; each pass's GPU time is within budget.",
    dep: ["render-frame-graph", "shader-system", "cameras-and-viewports"],
  },
  "2d-sprites-and-tilemaps": {
    s: "Draws two-dimensional content efficiently: batched textured quads, sprite sheets, layered tile grids and parallax, with pixel-accurate control where the art style demands it.",
    d: "Sprites are textured quads with transform, tint and sort order, drawn in large batches from texture atlases to minimize state changes. Tilemaps store cell indices and render only visible chunks, often as one mesh per chunk. Layers, parallax, lighting with normal maps and animated frames sit on top. Pixel-art games need integer scaling, point sampling and subpixel camera snapping to avoid shimmer. Alpha blending order matters more than depth, so sorting by layer is central. Difficulties include atlas management, texture bleeding at edges, resolution independence and consistent behavior across aspect ratios.",
    k: [
      "Atlas-based batching vs per-sprite textures: atlases reduce draws dramatically but constrain texture sizes and memory residency.",
      "Chunked tilemap meshes vs per-tile sprites: chunks scale to huge maps with few draws but make per-tile effects and edits costlier.",
      "Integer pixel scaling vs fractional scaling: integer keeps pixel art crisp but wastes screen area; fractional fills the display with shimmer risk."
    ],
    p: [
      "Neighboring atlas regions bleeding into edges under filtering or scaling, producing visible seams between tiles.",
      "Moving the camera by fractional pixels so tiles and sprites shimmer or show gaps between them."
    ],
    v: "Scroll a large tilemap slowly at several window sizes and aspect ratios; captured frames show no seams, gaps or shimmer, and draw calls stay under a fixed count with ten thousand visible sprites.",
    dep: ["render-hardware-interface", "cameras-and-viewports", "runtime-resource-manager"],
  },
  "text-and-ui-rendering": {
    s: "Turns glyphs and interface shapes into pixels: font atlases or distance fields, batched rectangles and clipping, kept separate from scene rendering so UI stays sharp at any resolution.",
    d: "Text arrives as shaped glyph runs from the UI layer and is drawn from a dynamic glyph atlas or from signed distance fields that scale smoothly. Interface elements become batched, clipped quads with rounded corners, borders and gradients, often built through a retained draw-list that is merged by texture and material. Rendering occurs in a dedicated pass after post-processing, with resolution scaling and DPI awareness. It must handle many fonts, emoji, color glyphs and dynamic atlas eviction without hitches. Sharpness, batching efficiency and correct clipping inside scrolling containers are the main challenges.",
    k: [
      "Raster glyph atlas vs signed distance fields: rasterized glyphs are crisp at known sizes; distance fields scale and animate but soften sharp corners and small text.",
      "Retained vs immediate-mode draw lists: retained batches well and diffs cheaply; immediate is simpler to author but rebuilds all geometry each frame.",
      "Rendering UI at native resolution vs scene resolution: native keeps text sharp when the scene is upscaled but needs a separate composition pass."
    ],
    p: [
      "Glyph atlas filling up on a language with large character sets, forcing evictions mid-frame that cause hitches or missing characters.",
      "Rendering UI into the upscaled scene buffer, so text becomes blurry whenever dynamic resolution lowers."
    ],
    v: "Display text in every shipped script and size at multiple DPI and render scales; compare captures against golden images for sharpness and correct glyph shapes. Scroll a clipped list and confirm no overflow or extra draw calls.",
    dep: ["render-hardware-interface", "text-shaping-and-rtl", "widget-framework"],
  },
  "debug-drawing": {
    s: "Immediate lines, shapes, text and overlays that any system can emit for one frame, making invisible state such as bounds, paths and forces visible in the running game.",
    d: "Systems call simple functions like draw line, box, sphere or label with a color and optional duration, and the renderer collects them into a transient buffer drawn after the scene, usually with and without depth test. It works from any thread through lock-free queues, can be compiled out of shipping builds, and is available in the editor and in game. Categories let developers toggle channels. Because it is the cheapest way to see what code believes, collision, navigation, audio emitters and animation bones are all routinely visualized this way. The risk is cost and clutter when left enabled.",
    k: [
      "Per-frame submission vs persistent shapes with lifetimes: per-frame is stateless and simple; lifetimes allow one-shot events to remain visible for inspection at the cost of cleanup logic.",
      "Compiled out in release vs always present behind a flag: compiling out removes cost and exposure, keeping it enables diagnosis of shipped builds.",
      "Draw on any thread vs main thread only: any thread is convenient for jobs but needs thread-safe buffering."
    ],
    p: [
      "Leaving high-volume debug shapes enabled in profiling builds, which skews timings and hides the real cost of the feature under test.",
      "Drawing debug geometry from systems that run at fixed steps without a duration, so shapes flicker at display frame rate."
    ],
    v: "Enable each debug channel in a test level and verify shapes match the system's actual data, for example collision bounds line up with visible meshes. Confirm a release build contains no debug draw code paths or cost.",
    dep: ["render-hardware-interface", "cameras-and-viewports", "job-system"],
  },
  "cameras-and-viewports": {
    s: "Defines how the world is seen: camera position, projection, field of view and the screen regions each view renders into, including split screen and render-to-texture views.",
    d: "A camera holds a transform, a projection with near and far planes, exposure and post-processing settings. Viewports map views to rectangles of the output, supporting split screen, picture-in-picture and offscreen targets for portals or minimaps. Gameplay controls cameras through rigs, such as follow, orbit or cinematic blends, that update after movement but before rendering. Precision matters: reversed-depth projection and camera-relative rendering prevent jitter at large distances. Cameras also feed culling, shadows and audio listener placement, so one definition of the view is shared across systems.",
    k: [
      "Reversed-Z floating point depth vs conventional depth: reversed gives far better precision over large ranges but requires every depth-related pass to agree.",
      "Camera-relative rendering vs world-space coordinates: relative removes precision jitter in large worlds but complicates transforms and shader inputs.",
      "Gameplay camera rigs in script vs native: script iterates faster for designers, native guarantees update order and frame consistency."
    ],
    p: [
      "Updating the camera before character movement finishes, so the view lags one frame and the player appears to jitter.",
      "Using a huge far plane with a conventional depth buffer, causing z-fighting on distant surfaces."
    ],
    v: "Move a character at full speed in follow-cam while capturing a high-speed recording; the character holds a steady screen position with no jitter. Render a far-distance test scene and confirm no z-fighting at maximum range.",
    dep: ["scene-graph-and-transforms", "math-library", "game-loop"],
  },

  "skeletons-and-skinning": {
    s: "Represents a character as a hierarchy of bones and deforms its mesh by blending bone transforms per vertex, turning poses into visible shapes.",
    d: "A skeleton is a bone hierarchy with a bind pose; animation produces local transforms that are composed down the tree into model-space matrices, then multiplied by inverse bind matrices to give skinning transforms. Each vertex carries a few bone indices and weights. Skinning runs on the GPU in vertex shaders or compute, with linear blend, dual quaternion or corrective approaches to limit volume loss at joints. Sockets attach weapons or effects to bones. Costs scale with bone count, vertex weights and the number of characters on screen, so budgets and level of detail for skeletons matter.",
    k: [
      "Linear blend skinning vs dual quaternion: linear is fast and universal but collapses at twists; dual quaternion preserves volume but can bulge and costs more.",
      "Skinning in vertex shader vs compute pre-pass: shader skinning is simple, compute writes skinned vertices once for reuse across shadow and depth passes.",
      "Limit of four vs eight influences per vertex: four is cheaper and compact, eight gives better deformation for faces and shoulders."
    ],
    p: [
      "Exceeding the maximum bone count of a shader or constant buffer, truncating bones and producing stretched triangles on some characters.",
      "Mismatch between the bind pose in the mesh and the skeleton asset, producing a collapsed or inside-out character."
    ],
    v: "Play extreme poses and a full range-of-motion clip on every character and review captured frames for pinching, candy-wrapper twist and stretched polygons; verify skinning cost per character against budget with a crowd of the maximum count.",
    dep: ["blend-trees-and-state-machines", "meshes-and-instancing", "scene-graph-and-transforms", "math-library"],
  },
  "blend-trees-and-state-machines": {
    s: "Chooses which animation clips play and blends them by gameplay parameters such as speed and direction, with state machines governing transitions between motion modes.",
    d: "An animation graph evaluates to a pose each frame. Blend trees mix clips by continuous parameters, for example walk and run weighted by speed, while state machines switch between modes like locomotion, jump and attack with timed or conditional transitions and cross-fades. Layers and masks play upper-body actions over lower-body movement, and additive clips layer leans or breathing. Root motion can drive the character's movement from authored displacement. Difficulties include foot sliding when blends mismatch, transition rules that multiply into unmanageable graphs, and keeping animation consistent in networked play.",
    k: [
      "Root motion vs code-driven movement: root motion looks authentic but gives gameplay less direct control; code-driven is responsive but risks foot sliding.",
      "Hierarchical state machines vs flat graphs: hierarchy keeps large graphs readable; flat graphs are simpler to evaluate and debug when small.",
      "Phase-synchronized blending vs time-based cross-fades: sync keeps foot cycles aligned, time-based is simpler but can blend opposing leg positions."
    ],
    p: [
      "Blending a walk and a run clip of different cycle lengths without synchronizing phase, so feet cross and slide.",
      "Transitions evaluated from stale gameplay parameters, creating a pop when the state changes a frame late."
    ],
    v: "Drive the character through a scripted sweep of speeds and directions while recording foot positions; measure foot slide against ground contact and verify every transition completes within its specified duration without pops.",
    dep: ["skeletons-and-skinning", "state-machines", "animation-compression", "game-loop"],
  },
  "inverse-kinematics": {
    s: "Solves joint rotations so an end effector such as a foot or hand reaches a target, correcting authored poses to fit the real world.",
    d: "Given a chain of bones and a target, solvers like two-bone analytic, FABRIK or cyclic descent compute rotations that place the end at the target while respecting joint limits. Common uses include planting feet on uneven ground, aiming weapons, reaching for handles and looking at points. IK runs after clip sampling and blending, then blends back in by weight so corrections fade smoothly. Targets usually come from scene queries such as ground raycasts. Challenges include popping when targets change abruptly, pole vector control for elbows and knees, and keeping solutions stable and cheap for many characters.",
    k: [
      "Analytic two-bone solver vs iterative solvers: analytic is exact and cheap for limbs; iterative handles long chains and constraints but costs more and may not converge.",
      "Full-body IK vs per-limb IK: full-body distributes motion naturally but is complex to tune; per-limb is predictable and easy to debug.",
      "Smoothing targets over time vs snapping: smoothing hides pops but lags behind fast changes."
    ],
    p: [
      "Foot IK targets sampled from a raycast each frame without filtering, causing legs to twitch on noisy or stair-like geometry.",
      "No joint limits on knees and elbows, so solutions bend the wrong way at extreme target distances."
    ],
    v: "Walk a character over stairs, slopes and rubble; feet stay planted within a small tolerance of the surface without knee flipping or jitter, verified by logging foot-to-ground distance and joint angles against limits.",
    dep: ["skeletons-and-skinning", "scene-queries", "blend-trees-and-state-machines"],
  },
  "procedural-animation": {
    s: "Generates or modifies motion at runtime from rules and simulation, such as look-at, secondary motion, ragdolls and spring-driven parts, instead of playing only authored clips.",
    d: "Procedural layers run on top of or instead of clips. Examples are head and eye look-at, spring chains for tails and antennae, procedural walk cycles for creatures with arbitrary legs, physical ragdoll blending after impact, and motion matching that selects poses from a database to follow desired trajectories. They usually execute as nodes in the animation graph, reading gameplay and physics state and writing bone transforms. Blending between authored and physical control must be smooth. Challenges are stability, tuning that is tied to frame rate, and giving animators predictable control over results.",
    k: [
      "Motion matching vs authored state graphs: matching gives fluid responsiveness with less graph authoring but needs large databases and offers less direct control.",
      "Physics-driven ragdoll vs authored death animations: ragdoll reacts to the world naturally but can look limp or unstable.",
      "Spring simulation per frame vs fixed step: fixed step is stable and reproducible, per frame is simpler but behaves differently at varied frame rates."
    ],
    p: [
      "Spring chains using variable frame time, so tails and hair explode or go limp after a hitch.",
      "Switching from animation to ragdoll with no velocity inheritance, so the body drops or snaps instead of continuing its motion."
    ],
    v: "Run the simulation at 30, 60 and 144 frames per second on the same input and compare resulting poses; they stay within tolerance. Trigger ragdoll transitions at speed and confirm momentum continues without snapping.",
    dep: ["skeletons-and-skinning", "rigid-body-solver", "fixed-step-and-determinism", "blend-trees-and-state-machines"],
  },
  "retargeting": {
    s: "Maps animation authored for one skeleton onto characters with different proportions or bone layouts, so clips can be shared across a cast.",
    d: "Retargeting defines a correspondence between source and target bones, usually through a standard humanoid rig map, and converts motion accounting for differences in bone lengths, rest poses and orientations. Rotations transfer relative to each rig's reference pose; root and hip translation are scaled by leg length. IK passes then re-plant feet and hands that would otherwise slide or penetrate. It enables marketplace animation reuse and large crowds sharing a library. Challenges include non-humanoid skeletons, differing proportions that alter silhouette, and preserving contact with the environment and props after conversion.",
    k: [
      "Runtime retargeting vs baked per-character clips: runtime saves storage and eases iteration, baking costs memory but removes runtime cost and lets artists fix results.",
      "Standard humanoid map vs arbitrary bone mapping: a standard map is easy to set up and share but limited to compatible rigs; arbitrary mapping covers creatures with authoring effort.",
      "Rotation transfer with IK cleanup vs pure rotation: cleanup preserves contacts but adds solver cost and tuning."
    ],
    p: [
      "Rigs with different rest-pose orientations mapped without compensation, so arms twist or legs point sideways.",
      "Scaling hip translation by overall height rather than leg length, so short characters slide or hover."
    ],
    v: "Apply a reference clip set to characters of very different proportions; verify bone orientation correctness in a T-pose test and measure foot slide and ground penetration against thresholds across the whole set.",
    dep: ["skeletons-and-skinning", "inverse-kinematics", "reflection-and-types"],
  },
  "animation-compression": {
    s: "Reduces animation data size and sampling cost by quantizing, curve-fitting and discarding redundant keys while keeping visible error below a tolerance.",
    d: "Raw clips store a transform per bone per frame, which is enormous for large libraries. Compression drops constant tracks, stores keys at variable rates, fits splines, quantizes rotations to a few bits using the smallest-three representation, and packs data for cache-friendly random access. Error is measured at the skeleton's visible extremities rather than per bone, since parent error amplifies down the chain. Decoding must be fast and support seeking and blending. The trade is memory and bandwidth against accuracy, with per-clip or per-bone tolerances for faces and feet that cannot afford drift.",
    k: [
      "Uniform sampling with quantization vs variable-rate keyframes: uniform decodes fast and predictably; variable-rate compresses more but needs searches during sampling.",
      "Global error tolerance vs per-bone tolerance: global is simple, per-bone protects feet and fingers while allowing aggressive compression elsewhere.",
      "Offline-only compression vs streamed clip data: streaming bounds memory for huge libraries but adds latency and load complexity."
    ],
    p: [
      "Measuring error in local bone space, so tiny rotation errors near the root become large positional errors at the hands.",
      "Compressing facial or contact-critical clips with the same settings as body motion, causing visible drift and foot sliding."
    ],
    v: "Compute maximum and average positional error at test points on the mesh for every clip against the uncompressed source, confirm it is below tolerance, and report memory and decode time per clip against budget.",
    dep: ["offline-asset-pipeline", "skeletons-and-skinning", "math-library"],
  },
  "morph-targets": {
    s: "Deforms a mesh by blending stored vertex offsets, giving facial expressions, corrective shapes and body variation that bones alone cannot express.",
    d: "Each morph target, or blend shape, stores per-vertex position and sometimes normal deltas from a base mesh. At runtime weights scale and sum the active targets before or alongside skinning. Faces rely on dozens of targets driven by expression rigs and speech animation; corrective targets fix joint deformation triggered by bone angles. Sparse storage keeps only changed vertices, and the GPU applies targets in compute or vertex shaders. Costs scale with vertex count and active targets, so limits per frame and level-of-detail rules are required. Normals and tangents need updating to keep lighting correct.",
    k: [
      "Dense vs sparse delta storage: dense is simple to fetch on the GPU; sparse saves memory for faces where each shape touches few vertices.",
      "Morph targets vs additional facial bones: morphs give fine sculpted control but cost memory; bones are lightweight and compress well but are less detailed.",
      "Applying morphs before skinning vs after: before is correct for most cases; after is rarely used but cheaper for corrective effects."
    ],
    p: [
      "Forgetting to apply normal deltas, so shading looks flat or wrong on expressions even when the shape moves correctly.",
      "Leaving many targets active at small weights each frame, which wastes GPU time for imperceptible change."
    ],
    v: "Sweep each target from zero to full weight on a lit character and inspect captured frames for correct shape and shading; verify combined extreme expressions do not tear and cost with maximum characters is within budget.",
    dep: ["skeletons-and-skinning", "meshes-and-instancing", "animation-compression"],
  },
  "cloth-and-hair-hooks": {
    s: "The interface through which animation passes bone poses and receives simulation results for cloth, hair and similar secondary motion, without owning the simulation itself.",
    d: "The animation system supplies the simulator with driving bone transforms, collision proxies and tuning parameters, and the simulator returns positions or bone rotations that are blended back into the final pose or mesh. This lets cloth, capes, hair and accessories react to movement while remaining controllable: weights allow artists to fade between authored and simulated results, and teleport events reset state to avoid stretching. Evaluation order matters, because simulation must follow the character's final pose yet precede skinning. The hard parts are stability under fast motion, LOD for distant characters and consistent results for replay and networking.",
    k: [
      "Simulate in bone space vs mesh space: bones are cheap and fit existing skinning, mesh simulation is richer but costs more memory and bandwidth.",
      "Simulation on the animation thread vs on a separate job: separate jobs scale but add one frame of latency or require careful dependencies.",
      "Blend simulated result by weight vs full takeover: weights offer art direction and safety, full takeover is more physical but harder to control."
    ],
    p: [
      "Teleporting a character without resetting the simulation, so cloth stretches across the map for several frames.",
      "Letting simulated parts penetrate the body because collision proxies were not updated for the current pose or outfit."
    ],
    v: "Teleport, sprint, spin and ragdoll a character wearing cape and long hair; no stretching, explosions or body penetration appears in captured frames, and simulation cost per character fits its budget across LODs.",
    dep: ["skeletons-and-skinning", "soft-body-cloth-fluids", "job-system"],
  },
  "sequencer-and-cutscenes": {
    s: "A timeline system that choreographs animation, cameras, audio, effects and gameplay events along a shared clock, used for cinematics and scripted moments.",
    d: "A sequence contains tracks, each bound to an object or property, holding keyed values, clips or events along a timeline. Tracks drive transforms, animation playback, camera cuts and blends, audio cues, visibility, lighting and script calls. Playback is deterministic and scrubbable, so designers can jump to any time and see the correct state, which requires evaluating tracks as functions of time rather than as incremental events. Sequences can run in the editor, in-engine in real time, or be rendered offline. Difficulties include handing control back to gameplay, bindings to spawned objects, localization of audio and subtitles, and skipping safely.",
    k: [
      "Real-time in-engine cutscenes vs pre-rendered video: in-engine reflects player customization and scales with hardware but costs runtime budget; video is predictable but fixed.",
      "Evaluation as pure function of time vs incremental event firing: pure evaluation allows scrubbing and skipping, events are simpler but break when jumped over.",
      "Sequence owns the objects vs binds to existing ones: owning is self-contained, binding reuses gameplay actors and keeps continuity."
    ],
    p: [
      "Skipping a cutscene and jumping to its end without applying state changes that events would have made, leaving doors closed or quests unadvanced.",
      "Hard-binding tracks to object names, so renaming or respawning an actor silently breaks a shot."
    ],
    v: "Play each sequence start to end, then skip at random times and scrub in both directions; the resulting world state matches a full playthrough, and captured frames at fixed times match golden images.",
    dep: ["blend-trees-and-state-machines", "cameras-and-viewports", "game-loop", "timers", "adaptive-music"],
  },

  "broadphase": {
    s: "Cheaply finds pairs of objects whose bounding volumes overlap, so the expensive exact collision tests run only on a small set of candidates.",
    d: "Every collidable has a conservative bounding volume, usually an axis-aligned box. The broadphase maintains a spatial structure, such as a dynamic bounding-volume tree, sweep and prune, or uniform grid, and reports overlapping pairs each step. Static geometry sits in its own structure that is rarely updated, while moving bodies are refit or reinserted. It also applies collision filtering by layer or mask so irrelevant pairs never reach later stages. Performance depends on how well the structure matches the scene's distribution: huge worlds, dense piles and fast objects each stress different designs, and pair-list churn between frames drives memory and cache behavior.",
    k: [
      "Dynamic tree vs sweep and prune: trees handle varied object sizes and queries well; sweep and prune exploits temporal coherence for many similar-sized bodies but degrades on clustered scenes.",
      "Fat bounds with margin vs tight bounds: margin avoids reinsertion every step but produces extra candidate pairs.",
      "Separate static and dynamic structures vs one shared: separate saves update work, one shared is simpler and uniform for queries."
    ],
    p: [
      "Forgetting collision filters, so thousands of pairs between objects that can never interact flood the narrowphase.",
      "A single huge static object, such as a ground plane, with a giant bounding box that overlaps everything and degrades the structure."
    ],
    v: "Spawn ten thousand bodies in a stress scene and compare broadphase pairs to a brute-force all-pairs reference; no true overlap is missed, and step time for this stage stays within budget as counts grow.",
    dep: ["spatial-partitioning", "math-library", "job-system"],
  },
  "narrowphase-and-shapes": {
    s: "Computes exact contact points, normals and penetration depth between candidate shape pairs such as spheres, boxes, capsules, convex hulls and triangle meshes.",
    d: "For each pair from the broadphase, the narrowphase picks an algorithm by shape type: analytic tests for spheres and capsules, GJK with EPA or SAT for convex shapes, and midphase queries against triangle meshes and heightfields. It produces a contact manifold, a few points with normal and depth, that the solver consumes, and caches manifolds across frames for stability. Shapes are authored as compound primitives or simplified convex decompositions, since collision geometry differs from render geometry. Numerical robustness, tunneling edge cases, thin triangles and keeping manifolds coherent are the hard parts.",
    k: [
      "Convex decomposition vs triangle-mesh collision for dynamic bodies: convex pieces are fast and stable; meshes are accurate for static scenery but unsupported or expensive for moving bodies.",
      "GJK/EPA vs SAT: GJK works for any convex shape with a support function; SAT gives exact features for boxes and polyhedra.",
      "Persistent contact manifolds vs fresh contacts each step: persistence stabilizes stacking but needs matching and invalidation logic."
    ],
    p: [
      "Using the visual mesh as collision shape for dynamic objects, giving expensive tests and unstable contacts from thin or concave geometry.",
      "Degenerate triangles and zero-volume hulls producing NaN normals that propagate into the solver and eject bodies."
    ],
    v: "Test every shape-pair combination against analytic or brute-force reference results for contact depth and normal, including degenerate and near-touching cases. Stack a pyramid of boxes and verify it rests without drift for sixty seconds.",
    dep: ["broadphase", "math-library"],
  },
  "scene-queries": {
    s: "Answers spatial questions for gameplay and other systems: raycasts, shape sweeps and overlap tests against the collision world, returning what is hit, where and how.",
    d: "Queries such as line-of-sight rays, shape sweeps for character movement, and sphere overlaps for explosions run against the same broadphase and narrowphase structures as simulation, without creating contacts. Filters select layers, ignore specific bodies and choose whether to return the closest hit, any hit or all hits. Results carry position, normal, material and the object hit. Queries come from many threads and systems, such as AI, weapons, animation IK and audio occlusion, so the world must be readable concurrently with simulation. The hard part is consistency: whether results reflect the pre-step or post-step world, and keeping query cost bounded.",
    k: [
      "Queries against the last simulated state vs a synchronized live view: last-state needs no locking and is predictable; live is more current but forces synchronization with simulation.",
      "Synchronous queries vs batched asynchronous queries: synchronous is easy to use, batching parallelizes well and suits AI and audio at scale.",
      "Rich filter system vs a few fixed layers: rich filters are flexible but easier to misconfigure and slower."
    ],
    p: [
      "A ray that starts inside a collider and silently returns no hit, so gameplay checks like line-of-sight pass through walls.",
      "Issuing hundreds of unbudgeted queries from a single system per frame, making query time the hidden bottleneck."
    ],
    v: "Fire a grid of rays and sweeps against a scene with known geometry; hits match analytic expected positions and normals, including starting-inside and grazing cases. Measure queries per millisecond and confirm it meets the stated budget.",
    dep: ["broadphase", "narrowphase-and-shapes", "job-system"],
  },
  "rigid-body-solver": {
    s: "Advances bodies through time under forces, resolving contacts and joints so objects fall, stack, slide and collide plausibly.",
    d: "Each fixed step, the solver integrates velocities from forces, builds constraints from contacts and joints, and iterates to satisfy them, commonly with sequential impulses or position-based methods. Friction, restitution, stacking stability and sleeping of resting bodies are tuned here. Islands of connected bodies are solved in parallel. Joints connect bodies with hinges, sliders and springs, and motors drive them. Accuracy trades against speed through iteration count and substeps. Difficulties include jitter in stacks, tunneling at high speed, energy gain from approximations, large mass ratios and keeping the result reproducible across hardware.",
    k: [
      "Sequential impulse vs position-based dynamics: impulses are mature and accurate for stacking; position-based is simple and robust but less physically exact.",
      "More solver iterations vs more substeps: substeps improve stability and accuracy at higher cost, iterations help stacking cheaply but not fast motion.",
      "Sleeping aggressively vs keeping bodies awake: sleeping saves cost but can freeze objects that should react slightly."
    ],
    p: [
      "Extreme mass ratios, such as a heavy body resting on a light one, causing jitter or sinking that no iteration count fixes.",
      "Waking an entire large island for one touch, producing sudden frame-time spikes."
    ],
    v: "Build a tall stack, a pendulum chain and a high-speed collision scene; stacks settle and sleep without drift, energy in the pendulum stays bounded, and step time under the maximum body count stays within budget.",
    dep: ["narrowphase-and-shapes", "fixed-step-and-determinism", "job-system", "math-library"],
  },
  "continuous-collision": {
    s: "Prevents fast objects from passing through thin geometry between steps by sweeping motion over time rather than only testing positions at step boundaries.",
    d: "Discrete simulation tests where objects are at each step, so a bullet or falling body can move farther than a wall's thickness and tunnel through. Continuous collision detection sweeps shapes along their motion to find the earliest time of impact, then clamps motion or substeps to that time. Approaches include conservative advancement, speculative contacts that anticipate collisions, and swept shape casts for chosen fast bodies. It is applied selectively since it costs more. Trade-offs involve missed rotational motion, ghost collisions at edges and the complexity of stepping several bodies to different times.",
    k: [
      "Time-of-impact sweeps vs speculative contacts: sweeps are exact but costly and sequential; speculative contacts are cheap and parallel but can produce ghost collisions.",
      "Enable continuous mode per body vs globally: per body limits cost to bullets and fast actors, but needs flags kept correct.",
      "Clamping to impact time vs substepping the world: clamping is cheap but alters motion, substepping is accurate and expensive."
    ],
    p: [
      "Relying on thicker walls instead of continuous detection, which fails the moment a projectile speed or frame time changes.",
      "Ghost collisions where speculative contacts stop a body against an edge it would have cleared."
    ],
    v: "Fire projectiles at increasing speeds at one-centimeter walls at several frame rates; none pass through, and bodies skimming edges are not stopped incorrectly. Record the speed at which tunneling would first occur with detection disabled.",
    dep: ["rigid-body-solver", "narrowphase-and-shapes", "scene-queries"],
  },
  "character-controller": {
    s: "Moves a player or non-player character through the world with game-friendly rules for walking, stepping, sliding and jumping, instead of full rigid-body physics.",
    d: "A controller represents the character as a capsule or similar shape, takes desired velocity from input or AI, and moves it using shape sweeps. It resolves collisions by sliding along surfaces, climbs steps up to a height, limits walkable slope angle, detects ground and handles moving platforms, gravity, jumping and crouching. Because responsiveness matters more than realism, it is kinematic and deliberately non-physical, yet it may push dynamic bodies and be pushed by them. Hard problems are corner and seam snagging, stable ground detection, moving-platform inheritance, and matching behavior between client and server.",
    k: [
      "Kinematic controller vs dynamic rigid body: kinematic gives precise, responsive control; dynamic gets interactions for free but feels floaty and unpredictable.",
      "Capsule vs box or custom shape: a capsule slides smoothly past edges; boxes catch on corners but match some art styles.",
      "Collide-and-slide with iterations vs depenetration only: iterations handle corners robustly, depenetration alone is cheaper but jitters in tight spaces."
    ],
    p: [
      "Snagging on seams between adjacent collision pieces, so the character stops dead while sliding along a flat floor.",
      "Using frame-rate-dependent movement, so jump height and speed differ between machines."
    ],
    v: "Run a scripted course with stairs, slopes just below and above the limit, seams, moving platforms and narrow gaps at varied frame rates; the character's path and jump height match expected values and it never sticks or tunnels.",
    dep: ["scene-queries", "narrowphase-and-shapes", "fixed-step-and-determinism", "action-mapping"],
  },
  "vehicles": {
    s: "Simulates wheeled and other vehicles with suspension, tires, engine and drivetrain, layered on the rigid body solver to deliver tunable handling.",
    d: "A vehicle is a rigid body plus per-wheel models. Each wheel casts a ray or sweep for ground contact, applies spring and damper suspension force, and computes tire forces from slip using a friction curve. The engine, gearbox, differential and brakes turn throttle into torque at the wheels, and anti-roll bars and aerodynamics add stability. Handling feel is the product, so designers tune curves and assists rather than raw physical values. Difficulties include stability at high speed, tire model behavior at low speed, ground-contact hitching over seams and keeping networked vehicles in sync.",
    k: [
      "Simulation-grade tire model vs arcade model: simulation rewards skill and realism; arcade models add assists and are forgiving and easier to balance.",
      "Raycast wheels vs wheel colliders with real shapes: raycasts are fast and stable but ignore wheel width and curbs; shapes are more faithful and costlier.",
      "Vehicle as one body with forces vs articulated joints for parts: one body is stable and simple, articulation allows visible suspension travel and trailers."
    ],
    p: [
      "Tire friction curves that behave well at speed but oscillate at standstill, so parked vehicles creep or jitter.",
      "Suspension stiffness tuned for a flat test track, causing launches or bottoming out over ramps and seams."
    ],
    v: "Drive a test circuit with slalom, braking, jump and ramp segments, logging lap times and body orientation; handling is repeatable between runs, stable at top speed and parked vehicles sit motionless for a minute.",
    dep: ["rigid-body-solver", "scene-queries", "fixed-step-and-determinism"],
  },
  "soft-body-cloth-fluids": {
    s: "Simulates deformable and flowing matter, such as cloth, ropes, soft objects and liquids, with particle or mesh solvers separate from the rigid body pipeline.",
    d: "Cloth and soft bodies use mass-spring systems or position-based and finite-element constraints on mesh vertices, with collision against body proxies and self-collision. Fluids use particle methods or grids to model liquid and smoke. Solvers often run on the GPU for particle counts the CPU cannot handle, trading tight coupling with gameplay for throughput. Results feed the renderer directly, or feed back to rigid bodies through coupling. Costs grow quickly with resolution, so level of detail and activation distance are needed. Stability, stretching, penetration and determinism are persistent difficulties.",
    k: [
      "Position-based constraints vs finite elements: position-based is stable, fast and easy to tune; finite elements are physically accurate but heavier and harder to make robust.",
      "GPU vs CPU solving: GPU scales to huge counts but returns data to gameplay late; CPU keeps results available for logic and queries.",
      "Two-way coupling with rigid bodies vs one-way: two-way is believable but costly and unstable; one-way is cheap and sufficient for decoration."
    ],
    p: [
      "Cloth with no self-collision or thin collision proxies, so it tangles or slips through the body in fast motion.",
      "Running full-resolution simulation for off-screen or distant objects because activation distance was never set."
    ],
    v: "Drop cloth on a moving collider, pour a liquid into a container and stretch a soft body to its limits; no penetration or explosion occurs, and simulation cost with the scene at maximum content fits the budget.",
    dep: ["narrowphase-and-shapes", "fixed-step-and-determinism", "job-system"],
  },
  "destruction": {
    s: "Breaks objects into pieces at runtime in response to damage, from pre-fractured chunks to procedural fracture, with debris managed so cost stays bounded.",
    d: "Destruction pairs an authored or procedurally generated fracture pattern with a structural model: chunks connect through bonds that hold until damage exceeds a threshold, then detach as separate bodies or particles. Supports collapse when connected load paths fail. Debris is pooled, simplified, put to sleep and faded out after a lifetime. It touches rendering, physics, audio and networking, so a single wall collapse spawns bodies, effects and sounds at once. Challenges include solver cost from many new bodies, navigation and collision updates when geometry changes, and replicating the same outcome to every player.",
    k: [
      "Pre-fractured pieces vs runtime procedural fracture: pre-fractured is cheap and art-directable; runtime fracture is flexible but costs more and may look inconsistent.",
      "Bond graph structural simulation vs scripted collapse: bond graphs react to arbitrary damage; scripted collapses are predictable and cheaper.",
      "Real debris bodies vs particles beyond a budget: bodies interact physically, particles are cheap and stay under a cap."
    ],
    p: [
      "Spawning every fragment as a rigid body at once, so a large collapse produces a multi-hundred-millisecond frame.",
      "Not updating navigation and collision when geometry breaks, so characters walk through gone walls or get blocked by rubble that is not there."
    ],
    v: "Destroy the largest authored structure with maximum debris settings; the worst frame time stays within budget, debris count never exceeds its cap, and navigation reflects the new geometry. Repeat on a networked pair and compare final states.",
    dep: ["rigid-body-solver", "particles-and-vfx", "navmesh-generation", "replication"],
  },
  "fixed-step-and-determinism": {
    s: "Runs simulation in constant time increments decoupled from display frame rate, and defines how reproducible those results must be across runs and machines.",
    d: "An accumulator collects elapsed real time and advances physics in fixed steps, possibly several per frame or none, interpolating rendered transforms between the last two steps to remain smooth. Fixed steps keep behavior independent of frame rate and make solvers stable. Determinism goes further: identical inputs produce identical results, which replays, lockstep networking and debugging rely on. That demands fixed update order, controlled floating point behavior, no unordered iteration and seeded randomness. Challenges are spiral-of-death when steps take longer than real time and the cost of enforcing bit-exact results across platforms and compilers.",
    k: [
      "Fixed step with interpolation vs variable step: fixed is stable and reproducible but adds visual latency; variable is responsive but behaves differently on every machine.",
      "Same-machine determinism vs cross-platform bit-exactness: same-machine suffices for replays and is achievable; cross-platform needs strict math and often fixed-point or software floats.",
      "Cap on steps per frame vs run all needed: a cap prevents the spiral of death but lets simulation fall behind real time."
    ],
    p: [
      "Iterating over unordered containers or thread results in nondeterministic order, so replays diverge after a few seconds.",
      "No step cap, so one slow frame schedules several more steps that make the next frame even slower."
    ],
    v: "Record inputs for a five-minute session, replay it twice and on a second machine; hashed world state matches at every checkpoint. Run at 30, 60 and 240 display frames per second and confirm identical simulation outcomes.",
    dep: ["game-loop", "time-system", "math-library"],
  },

  "device-and-mixer": {
    s: "Talks to the platform's audio output and mixes all active voices into the final stream, on a real-time thread that must never miss its deadline.",
    d: "The device layer opens an output stream with a sample rate and buffer size and calls the mixer to fill each small block, typically a few milliseconds of audio. The mixer sums voices, applies per-voice volume and pitch with resampling, routes them through buses with their own effects and volume, and applies a limiter. It runs on a dedicated high-priority thread that must avoid locks, allocation and blocking I/O, communicating with the game through lock-free command queues. Latency, glitch-free playback during device changes and channel-layout conversion for stereo, surround and headphones are the main challenges.",
    k: [
      "Small buffers vs large buffers: small lowers latency but risks underruns; large is safe but makes sound lag the visual event.",
      "Voice limit with priority stealing vs unlimited voices: a limit bounds CPU and is audibly managed by priority; unlimited sounds richer until the mix collapses.",
      "Bus graph with hierarchical groups vs flat voices: buses let designers mix and duck categories, flat is simpler but unmixable."
    ],
    p: [
      "Allocating memory or taking a lock in the audio callback, producing rare crackles that appear only under load.",
      "Ignoring device changes, so unplugging headphones silences the game until restart."
    ],
    v: "Play maximum voices while the CPU is saturated and record output for ten minutes; there are no underruns or clicks in the capture. Hot-swap output devices and sample rates, and confirm playback resumes within a second.",
    dep: ["platform-abstraction", "threading-model", "memory-allocators", "events-and-messaging"],
  },
  "decoding-and-streaming": {
    s: "Turns compressed audio files into playable samples, either decoding fully into memory or streaming from disk in chunks, balancing memory, CPU and start latency.",
    d: "Short sounds such as footsteps are decoded at load time or kept compressed in memory and decoded on play, while long music and ambience stream in small chunks through ring buffers filled by an I/O thread ahead of the playback position. Codecs trade size, decode cost and quality, and some formats allow seeking and loop points exactly. Preloaded starting segments hide disk latency for streamed sounds. Decoding must happen off the mixer thread. Problems include seek accuracy, gapless looping, hitching when disk is slow and unpredictable total memory when many sounds trigger at once.",
    k: [
      "Decode on load vs decode on play: decoded memory is fast to play but large; compressed in memory is small but costs CPU per voice.",
      "Stream long sounds vs load whole: streaming saves memory but depends on disk throughput and needs buffering ahead.",
      "Lossy codec vs lossless for effects: lossy saves space and bandwidth, but artifacts and loop gaps can appear in short, frequently heard sounds."
    ],
    p: [
      "Streaming buffers too small for a slow disk or busy console, so music stutters when the game is loading.",
      "Codec priming or padding samples that create an audible gap at loop points."
    ],
    v: "Loop each music and ambience asset for ten minutes, capturing output and checking waveform continuity at the loop point. Play the maximum simultaneous streams while loading a level on the slowest supported storage with no underruns.",
    dep: ["device-and-mixer", "streaming", "runtime-resource-manager", "job-system"],
  },
  "3d-spatialization": {
    s: "Positions sounds in space relative to a listener using distance attenuation, panning, Doppler shift and head-related filtering so players can locate sources by ear.",
    d: "Each emitter has a world position, velocity and attenuation curve. Relative to the listener, usually at the camera or the player, the engine computes gain from distance, pan across the speaker layout, pitch shift for Doppler and high-frequency loss with range. Headphone output can use head-related transfer functions for elevation and front-back cues, while surround layouts use panning laws. Sounds can be spread or positioned as volumes rather than points. Challenges are choosing the listener when camera and character differ, split screen, fast-moving sources that glitch in pitch and keeping cost down with many emitters.",
    k: [
      "Panning-law output vs head-related binaural rendering: panning works on any speakers and is cheap; binaural gives elevation and depth on headphones at higher CPU cost and varying individual fit.",
      "Listener at camera vs at character: camera matches the view, character matches gameplay in third person, and each can feel wrong in some cases.",
      "Logarithmic vs authored attenuation curves: logarithmic is physically plausible; authored curves give designers control over audibility and mix clarity."
    ],
    p: [
      "Updating emitter positions only at game frame rate, so moving sounds step audibly instead of gliding smoothly.",
      "Doppler computed from raw velocity without limits, so teleports and camera cuts produce screeching pitch jumps."
    ],
    v: "Move a test emitter in circles and passes around the listener on speakers and headphones; blind testers report direction correctly, and a recorded capture shows smooth gain and pan with no steps or pitch spikes on teleport.",
    dep: ["device-and-mixer", "scene-graph-and-transforms", "cameras-and-viewports", "math-library"],
  },
  "occlusion-and-reverb-zones": {
    s: "Shapes sound by the environment: muffling sources blocked by walls, and applying reverberation that matches the room or space the listener is in.",
    d: "Occlusion queries geometry between emitter and listener, using ray tests or sound-propagation graphs, and reduces volume and high frequencies when blocked, with extra paths through doors and openings considered. Reverb comes from designer-placed zones or geometry-derived estimates that select an effect preset or parameters, with sends to shared reverb buses blended as the listener crosses boundaries. More advanced systems simulate early reflections and diffraction. Costs come from ray queries per emitter and per-zone effects. Problems include abrupt transitions, expensive queries and mismatches between visual and audio geometry.",
    k: [
      "Ray-test occlusion vs propagation through portals: rays are simple but treat all walls as equally thick; portals model sound traveling around openings but need authored or generated connectivity.",
      "Authored reverb zones vs geometry-driven reverb: zones are controllable and cheap; geometry-driven adapts automatically but can sound wrong without tuning.",
      "Update rate of queries: frequent queries respond faster but cost more; throttled queries save time and risk delayed muffling."
    ],
    p: [
      "Occlusion rays hitting visual-only or tiny props, so a sound switches on and off as a chair edge crosses the line.",
      "Hard cuts between reverb zones instead of cross-fades, producing audible pops at doorways."
    ],
    v: "Walk a route through rooms, corridors and doorways while a fixed source plays; recorded output shows smooth filtering and reverb transitions, correct muffling behind walls, and query cost within its per-frame budget.",
    dep: ["3d-spatialization", "dsp-effects", "scene-queries", "spatial-partitioning"],
  },
  "dsp-effects": {
    s: "Real-time signal processing on voices and buses: filters, equalizers, compression, delay, reverb and distortion that shape how sounds are heard.",
    d: "Effects are processing nodes inserted on voices or buses, each processing blocks of samples with parameters that can change over time. Typical effects are low-pass and high-pass filters, parametric equalization, dynamic range compression and limiting, delays, convolution or algorithmic reverb, chorus and distortion. They support gameplay features like underwater muffling, radio filtering and ducking dialogue under explosions. They must be allocation-free, run within the mixer's deadline, and avoid zipper noise by smoothing parameter changes. Sample-rate dependency, denormal numbers and CPU spikes from convolution are the practical difficulties.",
    k: [
      "Per-voice vs per-bus effects: per-voice is flexible but cost scales with voice count; per-bus is cheap and typical for shared reverb and compression.",
      "Convolution vs algorithmic reverb: convolution reproduces real spaces accurately but costs more CPU and memory; algorithmic is cheap and tweakable.",
      "Smoothed vs instantly applied parameter changes: smoothing prevents clicks but delays response slightly."
    ],
    p: [
      "Changing filter or gain parameters in one step, producing audible zipper noise or clicks during gameplay transitions.",
      "Denormal floating point values in feedback paths that silently spike CPU use during quiet passages."
    ],
    v: "Feed test tones and impulses through each effect and verify frequency response and timing against specification with an analyzer. Sweep parameters during playback with no clicks, and measure per-effect CPU time against budget at maximum bus count.",
    dep: ["device-and-mixer", "math-library", "memory-allocators"],
  },
  "adaptive-music": {
    s: "Music that responds to gameplay: layers fade in and out, segments transition on musical boundaries and intensity follows what the player is doing.",
    d: "Music is authored as stems, segments or short cells with tempo and bar metadata. The system tracks a musical clock, so transitions are scheduled on beats or bars rather than whenever gameplay changes. Techniques include vertical layering, where parts fade with intensity, horizontal re-sequencing between segments, stingers over the top and transitions with authored bridges. Game state drives parameters or states that the music logic maps to behavior. Sample-accurate scheduling with streaming is needed for seamless results. Problems include rapid state flapping, transitions that clash harmonically, and testing the many paths a player can take.",
    k: [
      "Vertical layering vs horizontal re-sequencing: layering is seamless and simple but uses more voices; re-sequencing gives variety and structure but needs careful authored transitions.",
      "Quantized transitions vs immediate: quantized sounds musical but delays response to events; immediate is responsive and can sound abrupt.",
      "Game state drives music directly vs through a smoothing layer: direct is simple but flaps; smoothing and hysteresis keep music stable."
    ],
    p: [
      "Combat state toggling on and off every few seconds, so music restarts or flaps between segments instead of settling.",
      "Scheduling transitions from the game thread rather than the audio clock, producing timing drift and off-beat entries."
    ],
    v: "Script gameplay through every state pair and transition including rapid toggling; recorded audio shows every change landing on its specified beat or bar with no gaps, clicks or tempo drift, and a coverage report shows all authored transitions exercised.",
    dep: ["decoding-and-streaming", "device-and-mixer", "game-loop"],
  },
  "middleware-integration": {
    s: "The adapter that lets a dedicated audio authoring runtime drive sound, so sound designers build events, mixes and music outside the engine and the game only posts events and parameters.",
    d: "Instead of triggering raw files, gameplay posts named events, sets parameters and updates emitter and listener positions through a narrow interface; the external runtime decides which sounds play, how they are randomized, layered and mixed. Banks of audio content load and unload through the engine's resource manager, and the runtime may share the output device with the engine's own mixer or replace it. Integration covers memory allocation hooks, file I/O routing, thread priorities, profiling and live connection from authoring tools. Risks are licensing and platform support limits, doubled mixing paths and designers and programmers disagreeing about who owns what.",
    k: [
      "External audio runtime vs in-house audio system: external gives mature authoring and mixing tools quickly; in-house gives full control, tighter integration and no third-party dependency.",
      "Event-based interface vs direct file playback: events move sound logic to designers and enable iteration without code; direct playback is simpler for small games.",
      "Banks loaded by the engine vs by the runtime: engine-owned loading unifies memory accounting; runtime loading is simpler but hides memory use."
    ],
    p: [
      "Sound code posting events by string names scattered in gameplay code, so a rename in the authoring tool silently breaks audio.",
      "Allowing the middleware its own allocator and file reads outside the engine's budgets, hiding memory and I/O spikes."
    ],
    v: "Post every authored event from a test harness and confirm each plays with correct parameters; renaming or removing an event fails a build-time check. Compare memory and I/O accounting with the engine's own reports.",
    dep: ["device-and-mixer", "runtime-resource-manager", "memory-allocators", "platform-abstraction"],
  },
});
