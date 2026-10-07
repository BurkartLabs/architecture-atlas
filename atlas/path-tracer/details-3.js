// Details for the path tracer plate, part 3: materials, volumes, acceleration structures, geometry.
ATLAS.details("path-tracer", {
  "microfacet-bsdf": {
    s: "Models a rough surface as a statistical collection of tiny mirror facets, giving glossy highlights whose width and shape follow a roughness parameter.",
    d: "The model combines a normal distribution (which facets face the halfway direction), a shadowing and masking term (which facets are hidden) and a Fresnel term (how much light each facet reflects). Together they give a value for any pair of directions. Transmission uses the same machinery with refraction. Quality depends on the distribution's tail, since long tails produce soft halos, and on correct masking at grazing angles. Without multiple-scattering compensation, rough surfaces lose energy.",
    k: ["Heavy-tailed vs short-tailed distribution: heavy tails match real glossy highlights with soft halos, but are harder to sample and show more noise.", "Single-scattering model vs with multiple-scattering compensation: single scattering is simple and darkens rough metals, while compensation restores energy at extra cost."],
    p: ["Roughness near zero produces numerically unstable values and fireflies unless it is clamped to a small minimum.", "Using different masking functions in evaluation and sampling gives subtle brightness errors."],
    v: "Compute directional albedo over incident angle and roughness by Monte Carlo and compare with the model's stated albedo. Verify white-furnace energy is at most one, and that reciprocity holds by swapping directions.",
    dep: ["energy-conservation","bsdf-sampling","sample-warping"]
  },
  "diffuse-and-conductor": {
    s: "The two basic surface responses: matte diffuse scattering in all directions, and metal reflection with complex refractive index that colors the highlight.",
    d: "Diffuse uses a Lambertian response, optionally with a roughness-dependent correction, and is sampled with a cosine-weighted hemisphere. Conductors reflect with a Fresnel term from a complex index of refraction, producing colored edges and no transmission, and may be rough. Artist-friendly parametrizations use a base color and an edge tint rather than raw indices. It is a small part of a renderer where small errors are very visible: an energy error in diffuse surfaces compounds with every bounce.",
    k: ["Lambertian vs roughness-aware diffuse: Lambertian is simple and cheap, while roughness-aware matches rough materials better and complicates sampling.", "Complex index vs artist color parameters: index is physical and measured, but color parameters are intuitive and need mapping to avoid unphysical results."],
    p: ["Albedo above one in a diffuse material makes paths gain energy at every bounce and indoor scenes blow out.", "Using an index suited to one wavelength for all channels tints metals wrongly."],
    v: "Render a furnace test with diffuse albedo 0.8 and compare to the geometric series. Render a gold sphere and compare the highlight color at normal and grazing incidence to the measured Fresnel curves.",
    dep: ["bsdf-sampling","energy-conservation"]
  },
  "dielectric-transmission": {
    s: "Glass, water and other transparent materials that both reflect and refract, choosing between them by Fresnel reflectance and bending paths by the refractive index.",
    d: "At a dielectric boundary a path either reflects or refracts, chosen by probability equal to the Fresnel reflectance or by splitting. Refraction bends direction by Snell's law and scales radiance by the squared ratio of indices. Total internal reflection can trap paths. Rough dielectrics use microfacets for blurry glass. Challenges include tracking the medium a ray is inside, absorption through colored glass, thin shells such as windows, and caustics created by smooth glass.",
    k: ["Stochastic choice between reflection and refraction vs splitting the path: stochastic keeps cost constant but adds noise, while splitting reduces noise and grows exponentially.", "Thin-surface approximation vs true thick glass: thin avoids tracing inside and misses refraction through the body, while thick is physically right and more expensive."],
    p: ["The radiance scale for refraction is applied in both directions and the glass appears too bright or dark when seen from inside.", "Overlapping glass objects confuse which index to use at a boundary."],
    v: "Render a glass sphere in a uniform furnace; it must be invisible when its index equals the surroundings, and energy must be conserved at any other index. Check refracted lines against Snell's law on a ruled background.",
    dep: ["microfacet-bsdf","nested-media","caustics-handling"]
  },
  "principled-material": {
    s: "A single parameterized material that covers most real surfaces, such as metal, plastic, glass and cloth, with parameters designed so that artists can tune it intuitively.",
    d: "It layers or blends several lobes: diffuse, specular, clear coat, sheen, transmission, subsurface and emission, driven by parameters like base color, roughness, metallic and transmission, in the manner of a physically-based standard. The model is stable under blending and across extreme settings. It reduces the number of shaders a studio must maintain and makes assets portable. Hard parts include choosing lobe probabilities well for sampling, keeping energy conserved as parameters vary and exact portability across renderers.",
    k: ["One broad uber material vs many specialized shaders: the uber material gives consistency and fewer assets to maintain, but is slower than a simple shader for simple surfaces.", "Parameter blending vs physically derived layering: blending is intuitive and cheap but may break conservation, while layering is accurate and slower."],
    p: ["Two parameters that interact, such as transmission and metallic, produce unphysical results at intermediate values.", "Portability fails because another renderer interprets the same parameter slightly differently."],
    v: "Sweep each parameter from zero to one on a sphere under a white furnace and in an environment. Albedo must never exceed one, change must be monotone and smooth, and the same material must match a reference in another implementation.",
    dep: ["microfacet-bsdf","diffuse-and-conductor","dielectric-transmission","subsurface-scattering","energy-conservation"]
  },
  "layered-materials": {
    s: "Materials built by stacking thin layers, such as a clear coat on paint or a wet film over stone, whose combined response is computed from each layer's own behavior.",
    d: "A layer sits over a base; light enters, scatters in or reflects from each interface and may bounce between them. Exact treatment traces random walks between layers; approximations combine layer albedos and directional behavior analytically. Stack evaluation yields the effective BSDF for sampling and evaluation. Costs rise with the number of layers and interactions, and approximations break at extreme parameters. Used for car paint, varnish, fabrics and skin oils.",
    k: ["Stochastic random walk through layers vs analytic approximation: random walks are accurate and noisy, while approximations are smooth and fast with limits at extreme angles.", "Few thick layers vs many thin: fewer layers are cheaper, but many give richer effects like interference at a higher price."],
    p: ["A layer's energy accounting ignores interreflection between layers, darkening the result.", "Layer stack evaluation is not reciprocal, so bidirectional methods disagree with unidirectional ones."],
    v: "Compare an analytic layered model against a brute-force random walk through the same stack across angles. Directional albedo must agree within a few percent, and a lossless stack must stay under one in a furnace.",
    dep: ["microfacet-bsdf","principled-material","energy-conservation"]
  },
  "subsurface-scattering": {
    s: "Models light entering a translucent material, scattering inside and leaving elsewhere, which gives skin, wax, marble and milk their soft look.",
    d: "Approaches range from diffusion profiles, which blur light across the surface using a radial kernel by scattering distance and color, to full random walks through the volume that follow actual scattering and absorption. Random walks are accurate across thin geometry and strongly varying properties, and cost more. Parameters are specified as albedo and mean free path, or inferred from a color. Difficulties include conservation near thin features, edges where a profile does not apply, and artist control over per-channel distance.",
    k: ["Volumetric random walk vs surface diffusion profile: random walks handle thin parts and corners correctly, but cost many steps per sample, while profiles are fast and fail where geometry is thin.", "Per-channel mean free path vs one scale with color: per-channel is physical and tricky to author, while a single scale is intuitive and less flexible."],
    p: ["A profile applied to thin ears or fingers makes them glow incorrectly or too dark.", "Random walks that exit inside another object leak light between touching surfaces."],
    v: "Illuminate a slab with a narrow beam, measure radial falloff of exiting light and compare to a reference random-walk simulation. Also render an ear-like thin wedge and confirm transmission increases as thickness falls.",
    dep: ["participating-media","phase-functions","dielectric-transmission"]
  },
  "hair-and-fur-shading": {
    s: "Scattering models for thin fibers: light reflects off the outer surface, passes through, and bounces inside, giving hair and fur their characteristic double highlights and color.",
    d: "A fiber is treated as a cylinder with an elliptical or round cross-section, and the model separates reflection, transmission through the fiber and internal reflection, each as a lobe in terms of longitudinal and azimuthal angles. Color comes from absorption inside, set by melanin-like parameters or direct color. Multiple scattering between fibers matters for light hair; approximations or path-traced volumes handle it. It is hard to sample well, and to make scene-scale amounts of fibers affordable.",
    k: ["Dedicated fiber model vs generic glossy material: a fiber model gives correct highlight shifts and color, while a generic material is cheap and looks plastic.", "Path-traced inter-fiber scattering vs dual scattering approximation: path tracing is accurate and costly, while the approximation is fast for blond or white hair and loses detail."],
    p: ["Highlights that do not shift between reflection and internal lobes make hair look like thin plastic wire.", "Fiber widths too small for the pixel footprint alias and shimmer unless handled by coverage."],
    v: "Render a single cylinder fiber and compare the lobes against measured or reference scattering data across the azimuthal angle. Render a head of hair at distance and confirm color stays stable without shimmer.",
    dep: ["curve-intersection","energy-conservation","bsdf-sampling"]
  },
  "energy-conservation": {
    s: "The property that a material never reflects more light than it receives and obeys reciprocity, which keeps path tracing stable and results predictable.",
    d: "For any incoming direction, the integral of the scattering function over outgoing directions must not exceed one, and swapping directions must give the same value. Violations make paths gain energy, so bright feedback grows with each bounce. Models are tested with the white furnace and compared against numeric integration. Practical models break conservation at the edges: rough surfaces lose energy to ignored multiple scattering, and some artist controls add or remove light. Rules must be chosen as to when to cheat.",
    k: ["Strict conservation vs artistic freedom: conservation keeps lighting stable and assets reusable, but forbids some looks artists request.", "Compensating for lost energy vs accepting darkening: compensation restores brightness of rough metals, at the price of extra computation and a more complex model."],
    p: ["A material with albedo slightly above one makes bright indoor scenes diverge as bounces accumulate.", "Non-reciprocal models break bidirectional methods while looking fine in a unidirectional tracer."],
    v: "Run a white-furnace test over a grid of angles and parameters for every material. Maximum reflected energy must not exceed one beyond sampling noise, and swapping directions must reproduce the same value.",
    dep: ["bsdf-sampling"]
  },
  "spectral-rendering": {
    s: "Carries a range of wavelengths per path instead of three color channels, which gives accurate dispersion, fluorescence and metamerism at some extra cost.",
    d: "Each path samples a few wavelengths, converts material and light spectra to values at those wavelengths and accumulates to the film using color matching functions. RGB inputs are lifted to smooth spectra through a precomputed model. Wavelength sampling by importance reduces color noise. Benefits are correct dispersion in glass, accurate light and pigment mixing, and sensor matching. Costs include color noise, larger texture handling cost and the difficulty of keeping RGB assets looking identical.",
    k: ["Spectral vs RGB rendering: spectral gives physically right color mixing and dispersion, while RGB is cheaper and uses less memory and matches legacy assets.", "Hero-wavelength sampling vs independent wavelengths: hero sampling needs fewer samples to reduce color noise, but dispersive media require carefully tied wavelengths."],
    p: ["RGB assets lifted to spectra no longer reproduce the exact original color under colored light.", "Dispersion makes paths wavelength dependent, so color noise appears if wavelengths are not sampled well."],
    v: "Render a color chart under a known illuminant spectrally and compare to the analytic colorimetric result. Render a prism and confirm the rainbow's spread matches the index curve, and RGB assets reproduce under white light.",
    dep: ["color-management","units-and-color-spaces","dielectric-transmission"]
  },
  "participating-media": {
    s: "Material in which light scatters or is absorbed along a ray, such as fog, smoke, clouds and fluids, described by density, absorption, scattering and phase.",
    d: "The medium is defined by extinction, the sum of absorption and scattering, per unit length, plus albedo and phase function. Light along a ray is attenuated by transmittance, the exponential of the optical depth, and gains from in-scattering. The renderer samples a distance and decides at that point whether the path is absorbed, scattered or passes out. Challenges include heterogeneous densities, many scattering events in thick media and sharing sampling logic with surfaces.",
    k: ["Unified surface and volume path logic vs separate integrators: unified code handles mixed scenes and is complex, while separate code is easier and cannot mix effects.", "Homogeneous analytic vs heterogeneous numerical: analytic is exact and fast, but real media vary in density and need numerical methods."],
    p: ["A camera inside fog needs the medium active from ray start, or the effect only begins at the first surface.", "Dense media scatter hundreds of times per path and swamp the frame budget."],
    v: "Render a homogeneous slab and compare transmittance to the exponential of optical depth for a range of thicknesses. Confirm a scattering-free absorbing slab matches Beer's law within noise.",
    dep: ["free-flight-sampling","phase-functions","volume-grids"]
  },
  "volume-grids": {
    s: "Stored density and temperature fields on a sparse grid, with fast trilinear lookup and bounds that let the renderer skip empty space.",
    d: "Simulations produce voxel data that is mostly empty, so sparse tree structures store only active regions. Each coarse block keeps the minimum and maximum density, giving the bounds that are used to skip empty space or take large steps. Lookups use trilinear or higher filtering and are cached because rays access neighboring voxels. Hard parts include memory for large simulations, thread-safe cached access, mapping grid to world transforms and motion blur in grid data.",
    k: ["Sparse tree vs dense array: sparse saves memory on mostly-empty data and costs lookup time, while dense is fast and impractical at large resolution.", "Trilinear vs smoother interpolation: trilinear is cheap with visible voxel structure, while smoother needs more neighbors per lookup."],
    p: ["Min and max bounds computed at the wrong resolution make empty regions appear occupied and slow every ray.", "Per-thread lookup caches are not isolated, so threads fight over cache lines and scaling collapses."],
    v: "Load a simulation grid, query it at random points and compare to a dense reference. Values must match, memory must be a small fraction of dense, and render time must scale with occupied volume.",
    dep: ["participating-media","memory-budget"]
  },
  "free-flight-sampling": {
    s: "Choosing how far a ray travels before interacting with a medium, with probability matched to the medium's density, so distance sampling is exact for uniform media.",
    d: "In a homogeneous medium the distance to the next event follows an exponential distribution that can be inverted directly. In a heterogeneous medium, one samples against a majorant density that bounds the real density everywhere. At the sampled distance an event is real or null, and the path continues or scatters. Distance sampling can be done by extinction color channels, with spectral media needing special care. Subtleties are the number of events, and consistent density along shadow rays.",
    k: ["Sampling by distance vs by equiangular around lights: distance sampling is general, while equiangular sampling reduces noise when lights are inside the medium.", "Single majorant vs per-region majorants: a single one is simple and slow in thin areas, while per-region ones cut null steps and need a grid."],
    p: ["A majorant lower than the real density in places biases the volume toward being too transparent.", "Chromatic extinction sampled by one channel gives high variance in the others."],
    v: "Sample a million distances in a homogeneous medium and fit the exponential. In a heterogeneous test, compare converged transmittance to numeric quadrature of the optical depth.",
    dep: ["participating-media","delta-and-ratio-tracking","sample-warping"]
  },
  "delta-and-ratio-tracking": {
    s: "Unbiased ways to handle media whose density varies, by adding fictitious null collisions or weighting by the ratio of real to bounding density.",
    d: "Delta tracking adds null particles so the medium looks uniform to the sampler, and rejects collisions at random according to the true density. Ratio tracking, used for shadow rays, multiplies a weight by the fraction of non-null at each tentative collision instead of terminating, giving smoother transmittance estimates. Both need a bounding density. Variants reduce variance by using tighter bounds from the grid. The hard problems are extremely heterogeneous media with sharp features and chromatic cases.",
    k: ["Delta tracking vs ratio tracking: delta gives binary outcomes with higher variance on shadow rays, while ratio gives continuous weights at the cost of never terminating early.", "Tight local majorants vs one global bound: tight bounds greatly cut null collisions but cost a grid traversal and storage."],
    p: ["A loose global bound in a mostly empty volume makes most steps null and renders extremely slowly.", "Ratio tracking weights multiplied across very many steps underflow to zero in thick media."],
    v: "Compare transmittance estimates from both methods against numeric integration along random rays in a procedural density. Means must agree, and ratio tracking must show less variance on shadow rays.",
    dep: ["free-flight-sampling","volume-grids"]
  },
  "phase-functions": {
    s: "Describe how light changes direction when it scatters inside a medium, from isotropic to strongly forward-scattering, with a parameter for how directional it is.",
    d: "A phase function gives the probability density of scattering from one direction to another. Common models take an anisotropy parameter from backward to forward. Real media such as clouds and skin scatter forward strongly, and some use mixtures of two lobes. Each model supplies evaluation, sampling and density, as surfaces do. Hard parts include handling very high anisotropy, where sampling and the distribution are narrow, and consistency with the medium's measured appearance.",
    k: ["Single-lobe vs two-lobe phase functions: single lobes are cheap and easy to sample, while two lobes fit clouds and tissue better with more parameters.", "Analytic sampling vs table lookup: analytic is exact and fast for standard forms, while tables allow arbitrary measured distributions."],
    p: ["An anisotropy of nearly one gives numerically unstable sampling and very bright forward fireflies.", "A phase function not normalized changes brightness of the medium as parameters change."],
    v: "Sample many directions from each phase function, histogram them against the analytic density and confirm it integrates to one. The mean cosine of sampled directions must equal the anisotropy parameter.",
    dep: ["sample-warping","participating-media"]
  },
  "volume-emission": {
    s: "Light produced inside a medium itself, as in fire and explosions, with radiance that depends on temperature and is sampled along the ray.",
    d: "Emission is added as a source term along the ray, from a temperature or intensity field converted to color through a blackbody or ramp. It can be accumulated analytically in homogeneous cases or at the sampled collisions in heterogeneous media. Strong emission also lights other objects, which requires sampling emissive volume as a light, an expensive step. The difficulty is energy conservation, noise in emissive regions, and artistic control through ramps in place of temperature.",
    k: ["Emission accumulated along ray vs sampled as a light source: accumulation is cheap and cannot light other objects, while sampling lights the scene and adds noise.", "Blackbody from temperature vs artist ramps: temperature is physical and consistent, while ramps give direct control over stylized fire."],
    p: ["Emissive volumes that do not light surrounding geometry look pasted on.", "Large temperature ranges give color values that overflow the working color space."],
    v: "Render a uniform emitting slab and confirm radiance grows linearly with thickness until absorption saturates it, matching the analytic solution, and confirm nearby surfaces receive the expected light when emission sampling is on.",
    dep: ["participating-media","volume-grids","many-light-sampling"]
  },
  "nested-media": {
    s: "Keeps track of which material a ray is inside when objects overlap or nest, such as ice in water in a glass, so refraction and absorption use the correct values.",
    d: "At every boundary crossing the renderer maintains a stack of enclosing media with priorities, determining which index and medium applies on the other side. Priorities resolve overlaps, such as a drink overlapping the glass wall slightly. The stack is carried by the path state, and must be updated on both refraction and reflection. Difficulties include modeling errors, such as gaps and overlaps in meshes, and orientation of surfaces, since normals must point out of the object.",
    k: ["Priority-based stack vs relying on exact geometry: priorities tolerate overlaps and make authoring forgiving, while exact geometry needs no extra data and is brittle.", "Storing the stack per path vs recomputing by ray cast: per-path storage is fast with extra state, while recomputation is stateless and costs an extra ray."],
    p: ["A mesh with flipped normals breaks the stack and rays think they are inside a solid when they are outside.", "A gap between glass and its contents leaves a thin layer of air with a visible silver line."],
    v: "Render ice cubes in water in a glass with overlapping meshes and confirm index changes occur at the right surfaces, no thin air layers appear and absorption matches the path lengths in each medium.",
    dep: ["participating-media","dielectric-transmission","surface-normals"]
  },
  "bvh-construction": {
    s: "Builds the hierarchy of bounding boxes over primitives, usually by recursively splitting them to minimize an estimated traversal cost, before rendering starts.",
    d: "The builder partitions primitives by choosing split planes using the surface area heuristic, which estimates the cost of a split from child surface areas and primitive counts. Binning approximates the best split quickly; parallel builds divide the work across threads. Faster builders trade quality for time, which matters for interactive use and animation. Top builds spend time on quality because the tree is traversed many times. Challenges include tree quality for clustered or overlapping geometry and memory during the build.",
    k: ["High-quality build vs fast build: high quality gives faster traversal for long renders, but costs build time that is wasted on short or animated scenes.", "Binned approximation vs full sweep: binned is fast and nearly as good, while a full sweep is exact and much slower on large primitive counts."],
    p: ["Long thin primitives at diagonals produce huge overlapping boxes that make traversal slow for a whole region.", "Build memory peaks at several times the final size and exhausts RAM on a very large scene."],
    v: "Build a tree for a scene, count average nodes visited per ray, and compare with a reference build. Render must be identical across builders, and quality metrics such as expected cost must match the heuristic prediction.",
    dep: ["triangle-intersection","thread-scheduler","memory-arenas"]
  },
  "bvh-traversal": {
    s: "Walks the tree for one ray, testing child boxes in near-to-far order and descending only into those the ray enters, until the nearest hit is certain.",
    d: "A stack of pending nodes is kept; at each node the ray is tested against child boxes, the nearer is visited first and the other is pushed. When a primitive is hit, the ray's maximum distance shrinks, pruning remaining nodes. Wide trees test several boxes at once with vector instructions. The code is the hottest in the renderer, so layout, data alignment and branch behavior dominate. Correctness includes handling rays parallel to axes and watertight box tests.",
    k: ["Wide trees with vector box tests vs binary trees: wide trees use vector units well and have lower depth, but more complex build and wasted tests in sparse nodes.", "Ordered traversal vs unordered: ordering finds closest hits early and prunes more, with extra work per node."],
    p: ["A box test that fails on rays parallel to an axis makes thin objects flicker or vanish.", "Stack overflow in deep trees on degenerate geometry crashes threads."],
    v: "Trace one million random rays through the tree and compare hit results to brute-force testing of every primitive. Results must be identical, and nodes visited per ray must be logarithmic in primitive count.",
    dep: ["bvh-construction","triangle-intersection","simd-math"]
  },
  "instancing-hierarchy": {
    s: "A two-level structure: a top tree over instances, each pointing to a shared bottom tree for its object, so repeated objects cost memory once.",
    d: "The top level contains one entry per instance with its bounds and transform. A ray reaching an instance is transformed into the object's space and traverses the shared bottom tree there, and hit data are transformed back. This makes forests, crowds and cities practical. Deeper nesting generalizes it. Costs are the transform per instance entered and weaker pruning when instances overlap heavily. Per-instance data such as materials are looked up by instance index.",
    k: ["Two-level structure vs one flat tree: two-level saves memory massively and supports updating transforms cheaply, but adds a transform step and overlap cost.", "Instancing small objects vs merging them: instancing is cheap in memory and slow when objects are tiny, while merging is faster to trace and costly in memory."],
    p: ["Non-uniform scale on an instance changes ray directions' length and breaks hit distances unless normalized carefully.", "Many overlapping instances in a dense forest force rays to enter dozens of bottom trees."],
    v: "Instance one object ten thousand times, compare rendering to a fully duplicated scene and confirm identical images, with memory at a small fraction and construction time proportional to instance count.",
    dep: ["bvh-construction","bvh-traversal","scene-graph-and-instancing"]
  },
  "motion-blur-bvh": {
    s: "A hierarchy whose bounding boxes cover motion over the shutter interval, so primitives that move can be found at any ray time.",
    d: "Boxes are stored at several time keys and interpolated at the ray's time, or stored as one conservative box swept across the whole shutter. Interpolated boxes are tighter and cost more per test. Fast-moving objects lead to large conservative boxes that make traversal inefficient. Some builders split time into segments with separate trees. The difficulty is the balance of tightness against memory, plus handling rotation, where the swept volume is curved.",
    k: ["Time-interpolated boxes vs one conservative box: interpolation prunes tightly and takes extra math and memory per node, while a single box is simple and wasteful for fast motion.", "Splitting the shutter into several trees vs one tree: splitting gives tighter bounds, but multiplies build time and memory."],
    p: ["A single box over a fast rotation encloses a huge area and slows every ray in the frame.", "Linear interpolation of box corners misses rotating geometry between keys, producing missed hits."],
    v: "Render a fast moving object using each approach and confirm identical images, and measure node visits per ray: interpolated boxes must visit fewer nodes than conservative ones on fast motion.",
    dep: ["bvh-construction","motion-blur"]
  },
  "bvh-refit": {
    s: "Updates box bounds of an existing tree after objects move, instead of rebuilding it, which is quick and degrades tree quality as motion grows.",
    d: "Refit walks bottom-up and recomputes each node's bounds from its children, keeping the tree's topology. It takes linear time and fits animation or interactive editing. After large motion, boxes overlap and traversal slows, so the system rebuilds periodically or when a quality metric crosses a threshold. For instanced scenes, only the top level needs updating when instances move. The difficulty is knowing when to stop refitting.",
    k: ["Refit vs rebuild: refit is far faster and degrades quality as motion grows, while rebuild restores quality at higher cost.", "Rebuild on a schedule vs on measured quality: schedules are predictable, while quality-driven rebuilds adapt and need a metric that is cheap to compute."],
    p: ["A tree refit through many frames slows gradually until a frame takes several times longer.", "Refit applied to topology changes, such as new primitives, leaves invalid structures."],
    v: "Animate a character through a hundred frames with refit only and measure traversal cost per frame. It must stay within the threshold of a fresh build, and a rebuild must trigger when it does not.",
    dep: ["bvh-construction","instancing-hierarchy","incremental-scene-update"]
  },
  "bvh-compression": {
    s: "Stores node bounds with reduced precision and compact child indices, shrinking the hierarchy several-fold so more of it stays in cache and in memory.",
    d: "Child boxes are quantized relative to the parent's box using a few bits per coordinate, rounded outward so no hit is lost. Nodes are laid out in cache-line-sized blocks with child offsets rather than pointers. Compression shrinks memory and bandwidth, usually the limiting factor in traversal. The cost is decode arithmetic and slightly looser boxes. The challenge is ensuring conservativeness, so that no primitive ever falls outside its quantized box.",
    k: ["Quantized boxes vs full-precision boxes: quantization cuts memory several times and has slightly looser bounds, while full precision is simple and bandwidth-heavy.", "Compressed layouts for CPU and GPU: separate layouts suit each hardware's cache design, and double the structures to maintain."],
    p: ["Rounding box bounds inward instead of outward makes rays miss thin primitives, visible as holes.", "Compression applied to tiny scenes adds decode cost for no benefit."],
    v: "Compare traversal results on a million rays between compressed and full trees; hits must be identical. Report memory ratio and render time, and confirm the compressed tree fits in the target cache level.",
    dep: ["bvh-traversal","memory-budget"]
  },
  "ray-coherence": {
    s: "Reorders or batches rays so that those traveling similar paths are processed together, improving cache and vector efficiency, especially for deep bounces.",
    d: "Primary rays are naturally coherent; after several diffuse bounces, they are random. Sorting rays by origin and direction into bins, or by the tree node they will visit, groups work so that data is loaded once and reused. Packets carry several rays through the tree together. Sorting has its own cost and benefits mostly scenes that exceed cache or are out of core. It also complicates the integrator, which now processes a queue of rays rather than one path at a time.",
    k: ["Sorting and batching rays vs independent path tracing: batching improves locality and out-of-core behavior, but costs sorting time and requires path state in queues.", "Packets vs single rays: packets amortize traversal for coherent rays and waste lanes when rays diverge."],
    p: ["Sorting overhead exceeds the savings on scenes that already fit in cache.", "Path state stored per queued ray multiplies memory with the number of in-flight rays."],
    v: "Render a scene larger than cache with and without sorting and compare time and cache miss counters. Images must match within noise, and sorted tracing must show fewer misses.",
    dep: ["bvh-traversal","wavefront-execution","memory-budget"]
  },
  "triangle-intersection": {
    s: "Tests whether and where a ray crosses a triangle, returning distance and barycentric coordinates, in a way that never lets a ray slip through the shared edge of two triangles.",
    d: "Fast methods compute the intersection from the triangle's edges using a few cross products and a determinant; watertight methods transform the ray into a space where the test uses consistent edge functions, so a ray hitting an edge always hits exactly one neighbor. The barycentric coordinates drive interpolation of normals and attributes. It is called more than any other routine, so vector versions test several triangles at once. The challenge is robustness against rounding at edges and vertices.",
    k: ["Watertight vs fast test: watertight never leaks at shared edges, at a small cost, while fast tests are quicker and occasionally let rays pass through pinholes.", "Precomputed triangle data vs reading vertices: precomputation speeds up the test and uses more memory per triangle."],
    p: ["Rays passing exactly through shared edges leak through and show sparkles of background in solid meshes.", "Degenerate zero-area triangles produce division by zero and invalid hits."],
    v: "Fire a million rays at the shared edges and vertices of a closed mesh and confirm every ray hits exactly one triangle. Compare hit distances and barycentrics to a double precision reference.",
    dep: ["floating-point-robustness","simd-math"]
  },
  "self-intersection": {
    s: "Prevents a new ray from immediately hitting the surface it just left, using offsets or exact error bounds instead of arbitrary epsilon values.",
    d: "A ray spawned at a hit point may start slightly inside the surface due to rounding, and hit it again, producing dark speckle. Simple renderers push the origin along the normal by a small constant, which fails at different scales. Better methods compute a bound on the numerical error at the hit point from the triangle's coordinates and offset by exactly that amount, along the side the ray leaves. Hard cases are grazing rays, large scenes and instanced geometry with transforms.",
    k: ["Error-bound offsets vs constant epsilon: error bounds work at every scale with no tuning, while a constant epsilon is simple and fails for tiny or huge objects.", "Offset the origin vs ignore the previous primitive: offsetting is general and can leak light through thin walls, while ignoring is exact for flat shapes and fails on curved ones."],
    p: ["A constant epsilon tuned in meters leaks light at the junction of walls when the scene is in millimeters.", "Offsetting along the wrong side after refraction puts the ray inside the object it has just exited."],
    v: "Render a closed room with a single light behind the wall and confirm no leaks at corners, no speckle on flat or curved surfaces, and that the result is unchanged under scene scaling by factors of a thousand.",
    dep: ["triangle-intersection","floating-point-robustness"]
  },
  "curve-intersection": {
    s: "Intersects rays with hair and fur modeled as thin curves with varying radius, which cost far less memory than meshes with a triangle tube per strand.",
    d: "Strands are stored as splines with a radius at control points, and the intersection works on swept ribbons, flat or round tubes. Techniques subdivide the curve recursively and test small segments, or use a flattened form facing the ray. Hit data include position, tangent and a parameter along the strand for shading. A scene may have millions of strands, so bounds and traversal must be efficient. Difficulties include sub-pixel width, and accuracy at tight curls.",
    k: ["Round tube vs flat ribbon: round tubes are more accurate for thick strands, while ribbons are cheaper and fine for hair thinner than a pixel.", "Recursive subdivision vs a closed-form test: subdivision is robust and slower, while closed forms are fast with more failure modes at curls."],
    p: ["Strands thinner than a pixel flicker between frames unless coverage is handled.", "Leaks or doubled hits where tube segments join at sharp bends."],
    v: "Render a curve with known radius and compare the silhouette width and hit tangent to the analytic tube. Render hair at several distances and confirm stable coverage and no gaps along strands.",
    dep: ["bvh-construction","floating-point-robustness","hair-and-fur-shading"]
  },
  "tessellation": {
    s: "Converts smooth surface descriptions such as subdivision patches into small triangles at render time, at a density suited to how close they are.",
    d: "A control mesh defines a limit surface; refinement splits each face repeatedly, with edge rules that make neighbors agree. The density is chosen from the patch's size on screen, so close objects are smooth and far ones are cheap. The result feeds displacement and the acceleration structure. Edges between patches of different density must be handled to avoid cracks. The difficulties are memory for dense results, view dependency across frames and secondary rays that see the surface from other viewpoints.",
    k: ["Tessellate then trace vs trace the patch directly: tessellation reuses triangle machinery and costs memory, while direct tracing saves memory and needs custom intersection.", "Camera-based density vs fixed: camera-based saves memory, but reflections of nearby surfaces may be too coarse to look right."],
    p: ["Silhouettes of curved surfaces appear faceted in reflections because density was set by the camera only.", "Mismatched densities between adjacent patches leave cracks at their borders."],
    v: "Tessellate a curved patch at several densities, confirm the silhouette error shrinks as density grows, and confirm no cracks occur between neighboring patches at differing densities.",
    dep: ["bvh-construction","triangle-intersection","memory-budget"]
  },
  "analytic-primitives": {
    s: "Exact intersection for simple shapes such as spheres, disks, cylinders and boxes, with perfectly smooth surfaces and tiny memory use.",
    d: "These shapes are solved with algebra: the ray equation is substituted into the shape's equation and the nearest valid root is taken. They provide exact normals and parameterizations, and are used for lights, test scenes and simple props. Precision matters, since a naive quadratic loses accuracy for distant or large shapes, so stable formulations are used. They need bounding boxes for the tree, and transform handling for non-uniform scale. Uses are limited in production, as most models are meshes.",
    k: ["Analytic vs tessellated spheres: analytic gives perfect silhouettes and light sampling with simple code, while tessellated unifies the pipeline and shows facets.", "Object-space solve vs world-space solve: object space handles transforms robustly, at a transform per ray."],
    p: ["Catastrophic cancellation in the quadratic produces missed hits on large, distant spheres.", "Non-uniform scaling distorts normals unless inverse-transpose transforms are used."],
    v: "Trace rays at a sphere from many distances and angles, and compare hit points and normals to a high-precision computation. Errors must stay at rounding level even for very large radius to distance ratios.",
    dep: ["floating-point-robustness","bvh-construction"]
  },
  "surface-normals": {
    s: "Two normals at every hit: the true geometric one from the face, and the interpolated shading one that makes faceted meshes look smooth, which must be reconciled carefully.",
    d: "The geometric normal comes from the triangle's plane and defines which side a ray is on. The shading normal is interpolated from vertex normals, optionally perturbed by normal or bump maps, and used in scattering. They differ, and light paths that are valid for one may be invalid for the other, leaving dark terminators and non-reciprocal results. Renderers correct shading normals so that directions below the geometric surface are rejected and weights remain symmetric.",
    k: ["Using shading normals for scattering vs geometric only: shading normals give smooth appearance, but break energy conservation unless corrected.", "Normal-map perturbation in tangent space vs object space: tangent space follows deformation and needs consistent tangent frames, while object space is simple and breaks with animation."],
    p: ["A low-poly sphere with strong shading normals shows a dark band where light falls below the geometric surface.", "Light leaks through thin geometry where the shading normal says the light is on the lit side."],
    v: "Render a coarse mesh sphere with smooth shading normals in a furnace and confirm brightness is uniform, no dark terminator appears and swapping light and view direction gives the same reflectance.",
    dep: ["attribute-system","triangle-intersection"]
  },
  "point-geometry": {
    s: "Spheres, discs and oriented points used to render particles, fluids and scanned data directly, without building a surface mesh first.",
    d: "Each point has a position, radius and optional orientation and color. Rays intersect them as spheres or oriented discs, and the acceleration structure holds one primitive per point. Millions or billions of points are common in simulation output and scans, so memory per point must be tiny. Procedural expansion can generate points on demand. Challenges include the sparse appearance of too few points, ordering for the tree and making the points look like a continuous surface when shaded.",
    k: ["Points directly vs a reconstructed mesh: points avoid costly surfacing and preserve detail, while a mesh gives cleaner normals and shading and costs time.", "Spheres vs oriented discs: spheres need no orientation, while discs give better flat-surface look from scans and need normals."],
    p: ["Point radius too small leaves gaps that rays pass through, and the surface looks like a mist.", "Billions of points exhaust memory before the tree is built."],
    v: "Render a point cloud of a known sphere at several densities and confirm the silhouette converges to the true sphere, the shading normals are smooth, and memory use per point matches the stated budget.",
    dep: ["analytic-primitives","bvh-construction","procedural-geometry"]
  }
});
