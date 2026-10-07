// Details for the graphics renderer plate, part 2: lighting, ray tracing, materials and shaders.
ATLAS.details("graphics-renderer", {
  "forward-lighting": {
    s: "Shades each fragment during geometry rasterization, looping over the lights that affect it, with no intermediate geometry buffer.",
    d: "The pixel shader evaluates the surface and all relevant lights in one pass. Light lists come from a per-tile or per-cluster structure, or a small per-object set. Forward rendering handles transparency, many material models and hardware multisampling naturally, and uses little memory bandwidth. Its weakness is overdraw: expensive shading runs for fragments later covered by nearer surfaces, so a depth prepass is common. It is also the path that favors tile-based GPUs, where on-chip memory makes the single pass cheap.",
    k: ["Forward with a depth prepass vs forward without: the prepass eliminates shading overdraw and costs a second geometry draw; skipping it saves the draw and wastes shading on hidden fragments.", "Forward vs deferred for many materials: forward lets every material use its own shading model; deferred is limited to what the G-buffer layout can express."],
    p: ["A light list that is not clamped overruns per-tile storage in a crowded scene and lights flicker off.", "Skipping the prepass on scenes with heavy overdraw makes shading cost track depth complexity instead of resolution."],
    v: "Render a scene with five hundred lights and capture shader invocations per pixel. With a prepass the count must be near one per visible pixel, and the image must match a reference render.",
    dep: ["clustered-lighting", "render-passes", "surface-model"]
  },
  "deferred-gbuffer": {
    s: "Renders surface attributes into several screen-sized targets first, then lights the whole screen in later passes that read them.",
    d: "The geometry pass writes albedo, normal, roughness, metalness, depth and other data to a set of render targets. Lighting passes then read those and shade each pixel once per light or per tile, so cost scales with resolution and lights rather than geometry complexity. Memory bandwidth is the price: wide targets are written and read back, and anti-aliasing hardware does not apply to resolved shading. Transparent surfaces cannot be stored and use a separate forward pass. The G-buffer layout is a hard commitment, because adding a material feature needs room in it.",
    k: ["Fat G-buffer vs packed minimal one: fat is flexible and costs bandwidth; packed encodings save memory and limit material models and make debugging harder.", "Deferred lighting vs full deferred shading: storing only data for lighting and re-drawing for materials gives more flexibility at the cost of a second geometry pass."],
    p: ["Encoding normals into too few bits causes banding in specular highlights on smooth surfaces.", "Transparent objects drawn into the G-buffer overwrite opaque ones behind them and look broken."],
    v: "Visualize each G-buffer target for a test scene and confirm values against a known material sweep. Then compare lit output against the forward path for opaque materials, with differences only from quantization.",
    dep: ["clustered-lighting", "render-passes", "textures"]
  },
  "clustered-lighting": {
    s: "Divides the view volume into a three-dimensional grid and records which lights touch each cell, so each pixel loops over only the nearby lights.",
    d: "A compute pass builds the grid, usually screen tiles subdivided in depth on a logarithmic scale, tests every light's bounds against every cluster, and writes index lists into a buffer. The lighting shader finds its cluster from pixel position and depth and iterates the list. This handles thousands of lights in both forward and deferred pipelines. The difficulty is tuning cluster count, bounding memory for the lists in worst cases, and handling light types other than point lights, which all need conservative overlap tests against cluster boxes.",
    k: ["Three-dimensional clusters vs two-dimensional tiles: clusters separate near and far lights and cost more build time and memory; tiles are cheaper and waste work on depth discontinuities.", "Build every frame on the GPU vs on the CPU: GPU builds scale with light count and use compute; CPU builds are easier to debug and cap the number of lights."],
    p: ["A fixed-size light index buffer overflows in a dense scene and silently drops lights in the brightest areas.", "Inverted depth mapping in the cluster slicing assigns lights to the wrong depth slice."],
    v: "Place a light so it touches exactly one known cluster and read back the cluster buffer. Only that cluster must list it, and the lit image must match a brute-force all-lights reference.",
    dep: ["gpu-driven-culling", "buffers", "view-setup"]
  },
  "visibility-buffer": {
    s: "Writes only a triangle and instance identifier per pixel, then reconstructs attributes and shades in a later pass, avoiding a wide G-buffer.",
    d: "The geometry pass stores a single integer per pixel that names the drawn triangle. A shading pass fetches that triangle's vertices through bindless access, computes barycentrics from the pixel, interpolates attributes analytically and evaluates materials, often with shading grouped per material to reduce divergence. Bandwidth is low and shading is done once per pixel, with no overdraw cost. It requires bindless resources and structured geometry buffers and makes derivative calculation explicit, so texture filtering needs gradients computed by hand.",
    k: ["Visibility buffer vs wide G-buffer: the visibility buffer cuts bandwidth and enables material-sorted shading; it needs bindless and manual attribute fetch and interpolation.", "Per-material shading dispatches vs one uber shader: per-material dispatches keep registers low; one shader is simple and suffers divergence."],
    p: ["Texture sampling with wrong analytic gradients makes seams or blur at triangle edges.", "Alpha-tested materials need coverage in the geometry pass, which complicates what the identifier means."],
    v: "Render with the visibility buffer and with a G-buffer path using the same scene. Images must agree within filtering differences, and bandwidth counters in a capture must be lower.",
    dep: ["bindless", "indirect-draws", "material-data-tables"]
  },
  "shadow-maps": {
    s: "Renders scene depth from a light's viewpoint into a texture, then compares each shaded point's light-space depth against it to decide shadowing.",
    d: "Each shadowing light renders its view of the scene into a depth target using the same culling and draw pipeline with a simpler shader. During shading the pixel is transformed to light space, the stored depth is compared with filtering to soften edges, and bias terms keep surfaces from shadowing themselves. Point lights need six faces or a cube. Costs add up quickly because each light is another full view of the scene, so lights beyond a few are limited, culled by distance or cached.",
    k: ["Constant plus slope-scaled bias vs normal-offset bias: constant bias is simple and leaks light; offset in the normal direction fixes acne with a slight light bleed near contacts.", "Wide filtering vs high resolution: filtering hides aliasing and blurs contact shadows; resolution keeps them sharp at a memory and render cost."],
    p: ["Shadow acne or peter-panning shows up when bias is tuned for one scene scale and used in another.", "A shadow view with different LOD selection than the main view produces mismatched silhouettes."],
    v: "Render a plane with a pole and compare the shadow edge position and softness against a ray-traced reference. Check a grazing-angle surface for acne at the default bias.",
    dep: ["view-setup", "frustum-culling", "textures"]
  },
  "cascaded-shadows": {
    s: "Splits the camera's view range into depth slices, each with its own shadow map, so nearby shadows get high resolution and distant ones get less.",
    d: "For a directional light such as the sun, the view frustum is divided into several ranges, commonly four, and each gets a tightly fitted orthographic light view. The shader picks the cascade by pixel depth and blends across boundaries. Fitting the cascades to the visible region maximizes resolution and, if not snapped to texel increments, causes shimmering as the camera moves. Each cascade is one more view to cull and draw, so updating far cascades less often or caching static content is common.",
    k: ["Texel-snapped stable cascades vs tightly fitted ones: snapping removes shimmering and wastes some resolution; tight fitting uses every texel and crawls when the camera turns.", "Practical logarithmic split vs uniform split: logarithmic follows perspective and starves mid-range; uniform wastes resolution up close."],
    p: ["Objects outside a cascade's fitted frustum that still cast into it are missed, producing shadows that vanish at the edge.", "A visible seam appears where adjacent cascades differ in filtering and bias."],
    v: "Move the camera in sub-texel steps over a static scene and capture the shadow edge. It must not crawl, and cascade transitions must show no visible line in a flat-shaded test.",
    dep: ["shadow-maps", "view-setup", "frustum-culling"]
  },
  "shadow-caching": {
    s: "Keeps shadow maps for many lights in a shared atlas and re-renders only the lights, or regions, whose contents changed.",
    d: "Point and spot lights get sub-rectangles of one large depth atlas, sized by their screen importance. Static geometry is rendered into a cached layer that is reused until something inside the light's volume moves, and only dynamic objects are re-rendered each frame. A scheduler ranks lights by distance and screen size and spreads updates across frames. The challenge is invalidation, since a moved object must dirty every cached light that sees its old and new position, and the atlas needs an allocator that handles varying sizes.",
    k: ["Cache static geometry separately vs re-render everything: caching cuts shadow cost sharply in mostly static scenes; it requires dirty tracking and fails for fully dynamic content.", "Fixed-size atlas slots vs dynamic packing: fixed slots are trivial and waste memory; packing adapts to light importance and fragments."],
    p: ["A moving object that is not invalidated in the cache leaves a stationary ghost shadow.", "An atlas that fills up evicts a nearby light and its shadow pops off when you walk toward it."],
    v: "Move one object in a room of cached lights and confirm exactly the lights that see it re-render, via a capture of shadow passes, with its shadow updating the same frame.",
    dep: ["shadow-maps", "resource-aliasing", "render-proxies"]
  },
  "ambient-occlusion": {
    s: "Darkens creases and contact areas where ambient light would be blocked, approximated from depth, ray traces or precomputed data.",
    d: "Screen-space variants sample the depth buffer around each pixel in a hemisphere, estimate how much is blocked, and denoise the result, often reusing history. Horizon-based forms trace a few directions in the depth buffer. A ray-traced form shoots short rays and denoises. The result multiplies indirect light and is written to a half or full resolution target. Screen-space methods only know what is visible, so occluders off screen or behind a surface are missed, and thin objects produce halos.",
    k: ["Screen-space AO vs ray-traced AO: screen-space works on all hardware and misses off-screen geometry; ray tracing is accurate and needs acceleration structures and a denoiser.", "Half-resolution with a depth-aware upsample vs full resolution: half costs a quarter and risks edge haloes; full is clean and expensive."],
    p: ["Using view-space depth with the wrong projection scale makes the radius vary with field of view.", "Halos appear around thin foreground objects because depth samples cannot tell thin from thick."],
    v: "Render a cube on a plane with AO only. Darkening must concentrate at the contact crease, fall off with the configured radius, and stay stable when the camera is still.",
    dep: ["motion-vectors", "deferred-gbuffer", "textures"]
  },
  "gi-probes": {
    s: "Stores incoming light at sample points in the world, as grids of spherical-harmonic or octahedral-mapped data, and interpolates it to light surfaces indirectly.",
    d: "Probes are placed in a grid or volume and capture irradiance and sometimes visibility. They can be baked offline or updated at run time by tracing rays or rasterizing cube faces, a few probes per frame. Shaders sample the eight surrounding probes with visibility weights to avoid light leaking through walls. Run-time updates spread cost across frames and make lighting respond to changing lights. The common failure is leaking: a probe on the wrong side of a wall lights the surface behind it.",
    k: ["Baked probes vs dynamically updated probes: baked costs nothing at run time and cannot react to change; dynamic reacts and consumes a per-frame budget and hardware ray tracing or capture passes.", "Dense uniform grid vs adaptive placement: a grid is simple and wastes probes in empty space; adaptive placement is efficient and needs authoring or a placement algorithm."],
    p: ["Probes inside geometry produce black or leaking samples and show as dark patches.", "Updating too few probes per frame makes lighting visibly lag after a light switches on."],
    v: "Toggle a light in a closed room and measure indirect brightness over successive frames. It must converge to the reference value in the configured number of frames, with no light leaking through the wall.",
    dep: ["rt-pipeline", "textures", "buffers"]
  },
  "sky-atmosphere": {
    s: "Computes sky color, aerial perspective and sun and moon light from the atmosphere's scattering properties, usually through precomputed lookup tables.",
    d: "Light scattering through air is expensive to integrate per pixel, so transmittance and multiple-scattering tables are computed once, or when parameters change, and the sky is rendered by sampling them with a small ray march. A low-resolution volume holds aerial perspective that is applied to scene color with depth. The same data produces the sun's color for the directional light and a sky cube for ambient lighting and reflections. The difficulty is units and continuity across time of day, and keeping the ambient capture consistent with the visible sky.",
    k: ["Precomputed tables vs live ray marching: tables make cost small and constant and need regeneration when parameters change; marching handles any state and costs far more per pixel.", "Capture sky into a cube for ambient vs sample tables everywhere: a cube is cheap to light with and lags; sampling is exact and costs more per surface."],
    p: ["The sun's color for the light is computed from a different table than the visible sky and they disagree at sunset.", "Aerial perspective applied before transparency leaves transparent objects with the wrong haze."],
    v: "Sweep the sun from noon to horizon and compare sky color, sun disc color and fog tint against the reference model at five elevations. They must change smoothly and stay consistent.",
    dep: ["textures", "tone-mapping"]
  },
  "acceleration-structures": {
    s: "Hardware-traversable spatial hierarchies built per mesh, which let ray queries find the nearest triangle without testing every one.",
    d: "A bottom-level structure is built from a mesh's triangles or procedural bounds by a GPU build command. The result is an opaque blob whose size is queried before allocation, with a scratch buffer for the build. Static meshes build once and compact to save memory, while deforming meshes are refit each frame or rebuilt. Flags trade build time against trace speed and update capability. The difficulty is memory, which can be larger than the mesh itself, and the schedule: builds are heavy GPU work that must be spread so a frame does not spike.",
    k: ["Rebuild vs refit for deforming meshes: refit is fast and degrades trace quality over time; rebuild keeps quality and costs several times more.", "Compact after build vs keep the original size: compaction can halve memory and needs a readback and a second allocation; keeping it is simple and wastes memory."],
    p: ["Building many large structures in one frame spikes GPU time and causes a visible stutter on level load.", "Scratch buffers allocated per build are never recycled and consume more memory than the structures."],
    v: "Build the structure for a test mesh and trace a grid of rays. Hit distances must equal a CPU reference to within a small tolerance, and reported memory before and after compaction must differ.",
    dep: ["buffers", "memory-heaps", "barriers"]
  },
  "tlas-instances": {
    s: "A top-level structure that places many bottom-level structures in the world through per-instance transforms, rebuilt or updated each frame.",
    d: "Each frame the renderer writes an array of instance records into a GPU buffer: transform, reference to a bottom-level structure, a mask for ray filtering, flags and an index used to find its material. A build command then constructs the hierarchy over them, which is much cheaper than rebuilding geometry. Instances can be hidden from certain ray types through the mask. The hard parts are keeping the buffer coherent with the raster scene, and making sure every bottom-level structure referenced is built and resident before the top-level build.",
    k: ["Rebuild the top level every frame vs update in place: rebuild is robust and costs more with instance count; update is cheaper and degrades when instances move far.", "Mirror the raster scene exactly vs a simplified ray scene: exact mirroring keeps reflections consistent and costs build time; simplified saves cost and shows mismatches."],
    p: ["An instance referencing a bottom-level structure that was freed while a frame was in flight crashes the device.", "Instance masks set incorrectly make some objects cast shadows but not appear in reflections."],
    v: "Move an instance each frame and trace a ray through its position. Hits must follow the object with at most one frame of lag, and capture tools must show one top-level build per frame.",
    dep: ["acceleration-structures", "render-proxies", "buffers"]
  },
  "rt-pipeline": {
    s: "A pipeline state that bundles ray generation, closest-hit, any-hit and miss shaders, dispatched over a grid of rays.",
    d: "Rays are launched from a ray generation shader by a dispatch command. Hardware traversal finds intersections and calls the shader groups for the hit geometry's material. The pipeline contains all shaders that can be called, with a maximum recursion depth, and its state includes payload and attribute sizes. Compilation is slow and the count of hit shaders grows with materials. Divergence is the main performance problem, since neighboring rays hit different materials and execute different code, so many renderers reorder rays or keep shaders short.",
    k: ["Full ray tracing pipeline vs compute shader with inline queries: the pipeline allows per-material hit shaders and recursion; inline queries are simple, use compute and cannot call arbitrary shaders.", "Recursive tracing vs iterative loop in the ray generation shader: recursion is natural and has a depth limit; an iterative loop uses fewer resources and bounds stack size."],
    p: ["Payload sized larger than needed increases register use and lowers occupancy on every ray.", "Compiling hundreds of hit shaders on the main thread causes a long load hitch."],
    v: "Trace primary rays for a test scene and compare the image to a raster reference. Shapes and hit materials must match, and capture counts of rays per second must meet the budget.",
    dep: ["tlas-instances", "shader-binding-table", "pipeline-state", "pipeline-layout"]
  },
  "shader-binding-table": {
    s: "A GPU buffer that tells the ray tracing hardware which shaders and resource bindings to run for each ray generation, hit and miss event.",
    d: "The table is organized in regions for ray generation, miss, hit groups and callable shaders. When a ray hits an instance and geometry, the hardware indexes into the hit region using the instance's offset, the geometry index and the ray's parameters, finds a shader group handle and local data such as descriptors. The renderer writes handles obtained from the pipeline into aligned records. Tables must be rebuilt or updated when the set of visible materials changes. Stride, alignment and index arithmetic are strict, and mistakes show as the wrong shader running.",
    k: ["Per-geometry hit records with local bindings vs one global bindless hit shader: local records give flexible bindings and a big table; one global shader uses a tiny table and needs bindless material data.", "Rebuild the table each frame vs keep it persistent: per-frame is simple and costs upload; persistent saves work and needs updates when instances change."],
    p: ["An off-by-one in instance contribution makes every object use its neighbor's material.", "Records not aligned to the required boundary cause undefined behavior that only appears on some GPUs."],
    v: "Assign each of ten materials a distinct debug color in its hit shader and render. Every object must show its own color, which proves the index arithmetic and record alignment.",
    dep: ["rt-pipeline", "buffers", "material-data-tables"]
  },
  "ray-queries": {
    s: "Traversal calls made from any shader stage, including compute and pixel shaders, which return hit information without a separate ray tracing pipeline.",
    d: "A shader creates a ray query object, sets the ray and flags, and steps through candidate hits, either committing the nearest or stopping at the first. There are no hit shaders, so the calling shader decides what to do with the result, which suits visibility tests such as shadows or occlusion that only need yes or no. It fits cleanly into existing passes and avoids a shader binding table. The limit is flexibility: shading of hit points must be done by the caller with material data it can reach.",
    k: ["Inline queries vs the full pipeline: inline is easy to integrate and keeps hit shading in the caller; the pipeline separates stages and handles complex materials and recursion.", "Any-hit alpha testing in the loop vs opaque-only tracing: handling alpha is correct for foliage and slows traversal; opaque-only is fast and shows solid leaf cards."],
    p: ["Forgetting to mark geometry opaque forces the hardware to call back for every candidate and tanks performance.", "Using a query in a pixel shader with large divergence stalls a whole wave on one slow ray."],
    v: "Trace shadow rays from each pixel with ray queries and compare to shadow maps for a simple scene. Shadow shapes must match within bias and the pass must be faster than a pipeline version.",
    dep: ["tlas-instances", "shading-language"]
  },
  "rt-denoiser": {
    s: "Filters the noisy output of few-sample ray tracing, using depth, normals, motion and history to reconstruct a stable image.",
    d: "Real-time budgets allow one or a few rays per pixel, so shadows, reflections and indirect light are very noisy. The denoiser accumulates samples over time by reprojecting history, estimates variance, then applies spatial filters guided by depth, normal and material roughness to avoid blurring edges. Separate passes or signal types, such as shadow, diffuse and specular, keep each filtered correctly. The cost is latency and ghosting: reuse of history makes lighting lag after changes, and incorrectly rejected history leaves noise.",
    k: ["Separate denoisers per signal vs one combined: separate filters match each signal's statistics and cost more passes; a combined filter is cheaper and over- or under-blurs some terms.", "Learned denoiser vs hand-tuned filter: learned reconstruction retains detail and needs matrix hardware and training; hand-tuned filters run anywhere and need tuning per effect."],
    p: ["History not invalidated at a light change leaves a slow fade between old and new lighting.", "Using noisy primary-surface normals as guides lets noise leak through edges."],
    v: "Render a static scene with one ray per pixel and compare noise versus a high-sample reference after two seconds. Error must fall below the threshold, and a light switch must settle within the lag budget.",
    dep: ["motion-vectors", "ambient-occlusion", "shadow-maps"]
  },
  "material-graph": {
    s: "Compiles an artist's node network into shader source, a set of parameters and a render state description.",
    d: "Artists connect nodes for textures, math and inputs to outputs like base color or roughness. A compiler walks the graph, emits shader code snippets for each node, merges them into a template for the target pass, and records which values become parameters. Compilation happens in the editor and offline, and a material may need many outputs, one per pass, such as depth only, shadow, G-buffer and forward. Constant folding and dead-node elimination keep generated code small. The work is hard because artists can create expensive shaders without noticing.",
    k: ["Generate source from a template with node snippets vs assemble precompiled fragments: generating gives the compiler full visibility to optimize; fragments link quickly and miss cross-node optimization.", "Per-pass shader generation vs one uber shader with switches: per-pass keeps each lean; one uber shader reduces count and carries unused code and registers."],
    p: ["A node feature that is valid in forward shading and not in the depth-only pass fails in a shader nobody opened.", "Unbounded node loops let a material take milliseconds of GPU time on screen."],
    v: "Build a material with a known node graph, compile it, and render a swatch. Output must match the reference render, and the report must show instruction count and the parameters exposed.",
    dep: ["shader-compiler", "shader-permutations", "material-instances"]
  },
  "material-instances": {
    s: "Lightweight variations of a parent material that override parameters like colors, textures and scalars without creating a new shader.",
    d: "An instance references its parent and stores values for parameters it overrides. At draw time the values are placed in a constant or structured buffer slice and the instance's textures are bound through descriptors. Because all instances share one pipeline, draws sort together and hundreds of variations cost little. Parameters can change at run time per object, which means per-instance data must be uploaded without stalling. Switches that change shader code, like turning on a feature, are not parameters and produce a different permutation.",
    k: ["Parameters in a shared structured buffer vs per-material constant buffers: a shared buffer fits bindless and few descriptors; separate buffers are simple and multiply descriptor sets.", "Static switches as permutations vs dynamic branches on parameters: permutations make branch-free fast code and add variants; dynamic branches keep one shader and use registers on all paths."],
    p: ["Changing a static switch at run time triggers a shader compile hitch the first time it is used.", "A texture parameter left unset binds a null descriptor and crashes or reads garbage."],
    v: "Create a hundred instances varying only color and confirm the capture shows one pipeline for all of them and a single bound parameter buffer, with each swatch showing its own color.",
    dep: ["material-data-tables", "descriptor-pools", "shader-permutations"]
  },
  "surface-model": {
    s: "The shading equation that turns material inputs and light into outgoing color, usually a physically based model with base color, roughness and metalness.",
    d: "The model evaluates a diffuse term and a specular lobe from a microfacet distribution, geometric shadowing and Fresnel, for each light and for image-based lighting from prefiltered environment data. Additional models handle clear coat, cloth, hair, skin and foliage. Inputs must be energy-conserving and in a consistent color space, and all lights and probes must use the same units. Authoring data is the real difficulty: a correct model fed with inconsistent textures still looks wrong.",
    k: ["One general model with optional layers vs separate models per material type: one model keeps lighting code unified and costs instructions on simple materials; separate models are lean and multiply lighting permutations.", "Analytic light approximations vs sampled integration: analytic is fast for area lights and approximate; sampling is accurate and noisy."],
    p: ["Textures authored in the wrong color space make albedo too dark or washed out across the whole scene.", "Specular aliasing on bumpy surfaces sparkles unless roughness is adjusted from normal variance."],
    v: "Render a sphere grid sweeping roughness and metalness under a uniform white environment. Furnace test results must not gain energy, and values must match the reference formula at sampled points.",
    dep: ["shading-language", "textures"]
  },
  "vertex-factories": {
    s: "Code and data layouts that tell a shader how to read each mesh type, such as static, skinned, instanced or morphed, from vertex and index buffers.",
    d: "The same material must draw different kinds of geometry. A vertex factory defines the vertex input layout and the shader code that fetches and transforms attributes: bone matrices for skinning, blend shape deltas for morph targets, or per-instance transforms. Combinations of material and factory multiply shader permutations. Modern designs read vertices manually from structured buffers, so the pipeline needs no fixed input layout and one pipeline can draw many mesh formats. Compressed attribute formats save bandwidth and must be decoded precisely.",
    k: ["Fixed-function vertex input layouts vs manual vertex pulling from buffers: layouts use hardware fetch and fix the format per pipeline; pulling is flexible and bindless friendly and may fetch less efficiently.", "Skin in the vertex shader vs a separate compute skinning pass: vertex skinning is simple; a compute pass writes skinned vertices once and reuses them across passes and ray tracing."],
    p: ["Normals decoded with insufficient precision from packed formats cause faceted lighting on smooth meshes.", "Every added factory doubles shader variants for every material."],
    v: "Draw the same material on static, skinned and instanced meshes of one shape in a rest pose. All three must be pixel-identical, and the build report must list one permutation per factory.",
    dep: ["buffers", "shader-permutations", "pipeline-state"]
  },
  "material-render-state": {
    s: "The fixed-function choices attached to a material: blending, depth test and write, culling, stencil and fill mode, which become part of its pipeline.",
    d: "Opaque, masked, additive and alpha-blended materials differ in blend equations, depth writes and render pass placement. These settings feed the pipeline state object, so each distinct combination is a separate compiled pipeline. Some state can be set dynamically at draw time, which reduces variants, such as viewport, scissor and in some APIs cull mode. The material system exposes a small set of authored blend modes and maps them to the right passes. Misplaced state is a common source of surfaces that disappear or show through.",
    k: ["Bake state into pipelines vs use dynamic state where available: baked state is fully optimized and creates more pipelines; dynamic state cuts pipeline count and can cost a little on some hardware.", "Few named blend modes vs fully free state: named modes keep pipeline counts small and testable; free state gives artists control and explodes the matrix."],
    p: ["A transparent material that writes depth hides objects behind it where the artist expected to see them.", "Switching cull mode per material without a matching winding fix draws inside-out meshes."],
    v: "Draw one quad per blend mode over a checker background and compare against the reference image. Each must blend as defined, and the capture must show one pipeline per distinct state combination.",
    dep: ["pipeline-state", "draw-list-sorting"]
  },
  "material-data-tables": {
    s: "A GPU-resident table of material parameters indexed by a material id, so shaders can fetch any material's data without per-draw binding.",
    d: "Parameters from all material instances are packed into a large structured buffer. Each draw or pixel carries a small material index, either in a push constant, per-instance data or the visibility buffer, and the shader reads parameters and texture indices from the table, then samples textures through bindless descriptors. The table needs a slot allocator and sparse updates when parameters change, and a lifetime scheme so a slot is not recycled while an in-flight frame still reads it. It is the enabling data structure for GPU-driven and ray traced rendering.",
    k: ["One global table vs per-material buffers: a global table supports bindless, indirect and ray traced draws with one binding; per-material buffers are simpler and force binding changes.", "Fixed-size records vs variable layouts per material type: fixed records give easy indexing and waste space; variable layouts are compact and need offsets and type tags."],
    p: ["Recycling a slot while an in-flight frame still reads it renders the old object with the new material.", "A texture index stored in the table refers to a descriptor that was freed, and the shader samples garbage."],
    v: "Update one material's color at run time and confirm only objects using that id change within one frame, and that a frame in flight rendered before the change shows the old value consistently.",
    dep: ["buffers", "bindless", "staging-ring"]
  },
  "shading-language": {
    s: "The high-level language shaders are written in, with types and intrinsics for graphics hardware, compiled for each pipeline stage.",
    d: "Source files define entry points for stages such as vertex, pixel, compute, mesh and ray generation, with structured resources, resource arrays and attributes that map to binding locations. A shared include library provides lighting, packing and math functions. The language is a restricted subset of general programming: limited recursion, specific loop and texture-sampling rules, and implicit derivatives only in some stages. A renderer's shader code is a large codebase that needs structure, modules and conventions to stay maintainable, since errors surface only after compilation and often only on one GPU.",
    k: ["One shading language compiled to all targets vs separate source per API: one language avoids duplication and relies on translation fidelity; separate sources allow API-specific optimization and diverge.", "Shared include library vs self-contained shaders: shared code reduces duplication and a change recompiles everything that includes it."],
    p: ["Using implicit derivatives inside non-uniform control flow gives undefined results that vary by GPU.", "Struct packing rules differ between languages, so a constant buffer written on the CPU is misread."],
    v: "Compile every shader entry point in the project in a clean build and confirm zero errors and warnings, then render the test scenes and compare against golden images on at least two GPU vendors.",
    dep: ["shader-compiler"]
  },
  "shader-compiler": {
    s: "A toolchain that parses shading language source, optimizes it and emits intermediate bytecode for each target, run at build time and sometimes at run time.",
    d: "The compiler preprocesses includes and defines, type-checks, inlines and optimizes, and writes a bytecode module per entry point and permutation. Offline compilation runs as a parallel build step with a content-addressed cache, so unchanged shaders are never recompiled. Debug builds keep names and source mapping for tools, release builds strip them. A run-time compiler may exist for editors and hot reload. The hard parts are compile time at scale, since permutation counts reach hundreds of thousands, and deterministic output so caches and patches stay small.",
    k: ["Offline compilation of all permutations vs lazy compile on first use: offline removes hitches and increases build time and package size; lazy keeps builds small and hitches on first appearance.", "Optimize aggressively vs keep debuggable code: optimized code runs faster and is harder to step through; a separate debug configuration doubles the cache."],
    p: ["Non-deterministic bytecode output defeats caching and makes every patch download huge.", "A compiler version change silently alters results, and an old cache keeps serving stale binaries."],
    v: "Compile the full shader set twice with a warm cache and confirm byte-identical output and near-zero compile time on the second run, then change one include and confirm only dependent shaders rebuild.",
    dep: ["shading-language", "bytecode", "shader-cache"]
  },
  "bytecode": {
    s: "A portable intermediate binary form of a shader that applications ship, and the driver compiles to the GPU's native instructions at pipeline creation.",
    d: "Bytecode is a typed, validated representation, either a binary standard defined by an API vendor group or an API-specific container. It lets the renderer compile once offline and hand the driver something cheaper to process than text, but the final machine code is generated at pipeline creation or first use, so the cost and result vary by driver. Some platforms accept fully precompiled native binaries, with no portability. The renderer treats the bytecode as the unit of shipping and keys caches on its hash and the driver version.",
    k: ["Ship portable bytecode vs ship precompiled native binaries: bytecode works on any GPU and compiles at run time; native binaries load instantly and are tied to one hardware and driver combination.", "Strip reflection and debug data vs keep it: stripping shrinks size and hides data from crash tools; keeping aids debugging and increases package size."],
    p: ["A driver update changes generated machine code and a shader that worked starts producing wrong output.", "Bytecode validated by the offline tool is rejected by a stricter driver at pipeline creation."],
    v: "Run the bytecode validator over every module and create every pipeline on the test GPUs. All must succeed, and the pipeline creation log must report no driver-side errors.",
    dep: ["shader-compiler", "pipeline-state"]
  },
  "shader-reflection": {
    s: "Metadata extracted from compiled shaders that lists their resources, constant layouts, inputs and thread group sizes, so the renderer can build bindings automatically.",
    d: "After compilation, a reflection pass reads the bytecode and reports each bound resource with its name, type, register or set and binding, array size, and the offsets of members in constant buffers. The renderer uses it to generate pipeline layouts, validate that the CPU-side structs match the shader, bind resources by name, and pick compute dispatch sizes from the declared thread group. Reflection is stored beside the bytecode so it is available at load without a parser. Differences in reporting between compilers and optimized-out resources are the usual trouble.",
    k: ["Derive layouts from reflection vs hand-written layouts: reflection removes duplication and errors; hand layouts give explicit control and drift from the shaders.", "Reflect at build time and store vs reflect at load: build time is zero cost at run time; load-time reflection simplifies the pipeline and slows loading."],
    p: ["An unused resource removed by optimization disappears from reflection and the CPU still tries to bind it.", "Different packing between reflection and CPU structs shifts every member after the first mismatch."],
    v: "Compare reflected constant buffer offsets with the C-side struct offsets for every shader at build time, and fail the build on any difference. A deliberate field reorder must trigger it.",
    dep: ["bytecode", "pipeline-layout"]
  },
  "shader-permutations": {
    s: "The set of compiled variants of one shader produced by combining static switches such as lighting model, vertex type, feature flags and pass.",
    d: "Switches turn code on or off at compile time, so each variant is fast but the count multiplies: a few dozen binary switches would mean billions of variants. The renderer defines which dimensions exist, prunes invalid combinations, and builds only what materials and passes actually use, determined by walking the content. Variants are keyed by a hash of the switch set and loaded on demand or in a precompiled set. Permutation counts drive build time, package size, memory and the number of pipelines to warm, so they have to be budgeted.",
    k: ["Compile-time switches vs run-time branches: switches give lean code at the cost of variants; run-time branches keep one shader and pay for unused paths.", "Build only used permutations vs build all valid ones: used-only is small and misses any combination reached at run time; all-valid is safe and large."],
    p: ["A new switch added to a widely used include doubles the variant count for hundreds of materials.", "A permutation requested at run time that was never built falls back to a placeholder or compiles on the main thread."],
    v: "Report variant counts per shader after a build and fail when a budget is exceeded. Play a scripted level traversal and confirm no run-time request misses the precompiled set.",
    dep: ["shader-compiler", "material-graph", "pso-precompilation"]
  },
  "shader-cache": {
    s: "A persistent store of compiled shader bytecode, keyed by source and options, that avoids recompiling anything that has not changed.",
    d: "At build time a content-addressed cache maps a hash of the source, includes, defines, compiler version and target to its output, shared by the team over the network. At run time a separate cache holds driver-compiled results so the second launch is fast. Entries are validated against the driver and hardware version and discarded if they differ. Keys must cover everything that influences output: missing an include or a flag in the key gives a stale shader that looks fine until someone notices a bug that was fixed weeks ago.",
    k: ["Shared team cache vs local only: shared makes clean builds quick and spreads a bad entry to everyone; local is isolated and slower for new machines.", "Key on file content vs timestamps: content hashing is correct across checkouts and costs reading files; timestamps are cheap and break across machines."],
    p: ["A key that omits an included file serves stale bytecode after the include changes.", "A cache that grows without eviction fills the disk on build machines."],
    v: "Edit one included file and rebuild. Exactly the shaders that include it must recompile, and a clean checkout with the shared cache must build with a hit rate above the target.",
    dep: ["shader-compiler", "bytecode"]
  },
  "shader-hot-reload": {
    s: "Recompiles an edited shader while the program runs and swaps the new version in, without restarting.",
    d: "A file watcher detects changes to shader sources or includes, finds dependent entry points, recompiles them on a worker thread, and on success creates new pipelines and swaps them in between frames. Old pipelines are retired only after frames in flight that use them complete. Failure keeps the previous version and shows the error. Hot reload shortens the artist and programmer loop from minutes to seconds. It must handle layout changes, such as a new resource, which also affect pipeline layouts and bindings, and sometimes need a full pipeline rebuild.",
    k: ["Swap in place vs rebuild affected pipelines on the next load: in-place swap gives instant feedback and needs deferred deletion; reload on next load is simpler and slower to use.", "Block until compile finishes vs async with the old shader running: blocking is simple and hitches; async keeps the frame rate and needs state to track pending swaps."],
    p: ["Destroying the old pipeline immediately crashes the GPU because a frame in flight still uses it.", "A compile error leaves the screen black instead of falling back to the last good version."],
    v: "Edit a pixel shader color constant while running, and confirm the output changes within the target time without a dropped frame. Introduce a syntax error and confirm the old shader keeps rendering and the error is shown.",
    dep: ["shader-compiler", "pipeline-state", "frames-in-flight"]
  },
  "cross-api-translation": {
    s: "Converts shaders written for one graphics API's language or bytecode to the form another API needs, so one source tree serves all backends.",
    d: "A translator reads bytecode or source and emits the target's form: bytecode to a different bytecode, or to source text for platforms that compile text. It maps resource binding models, semantics, matrix conventions, depth range and coordinate origin, and decides how to emulate features a target lacks. Reflection data is produced for each target. Translation is typically part of the offline build. Subtle differences in rounding, derivative behavior and uninitialized value handling mean the same shader can render slightly differently between backends, which tests must tolerate and track.",
    k: ["Translate bytecode vs write once in a language each compiler accepts: translation of a common bytecode gives one optimized form for all; compiling from source per target retains source-level information.", "Emulate missing features in the translator vs restrict the shader dialect: emulation hides gaps at a performance cost; restriction keeps shaders predictable and removes features on all platforms."],
    p: ["Clip-space depth range and Y-axis differences flip or clip the image on one backend only.", "A translated shader changes precision on a mobile GPU and produces banding the desktop build never showed."],
    v: "Render the test scene set through each backend and diff images against the golden reference. Differences must stay under the per-backend tolerance, and any exceeding case must be listed and justified.",
    dep: ["shader-compiler", "bytecode", "api-backends"]
  }
});
