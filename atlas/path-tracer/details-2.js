// Details for the path tracer plate, part 2: camera and film, integrators, sampling, lights.
ATLAS.details("path-tracer", {
  "camera-models": {
    s: "Defines how a pixel position maps to a ray: perspective, orthographic, fisheye, panoramic and measured lens models, with the parameters artists use to describe them.",
    d: "A camera model generates, for each film position, an origin and direction in world space. Perspective uses a pinhole with a field of view or focal length and sensor size; panoramic and fisheye models map angles to the film differently. Cameras also carry transforms that may vary over the shutter interval. Complexity lies in matching real cameras: sensor sizes, lens shift, anamorphic squeeze and non-linear distortion must agree with the footage that rendered elements will be composited into.",
    k: ["Pinhole plus a distortion map vs tracing through a lens: a distortion map is cheap and matches footage, but physical lens tracing gives real aberrations at a large cost.", "Specifying focal length and sensor vs field of view: real lens parameters match on-set data, while field of view is simpler and loses the link to depth of field."],
    p: ["A sensor size mismatch gives the right framing and wrong depth of field.", "Lens distortion applied to the rendered image but not to the rays leaves reflections and light-based effects misaligned."],
    v: "Render a grid of known spacing, measure its projected corner positions, and confirm they match the analytic projection of the camera's parameters to within a fraction of a pixel.",
    dep: ["camera-ray-generation","units-and-color-spaces"]
  },
  "lens-and-depth-of-field": {
    s: "Simulates a finite aperture by choosing ray origins across a lens, so objects away from the focus distance blur by the right amount and shape.",
    d: "For each camera ray, a point is sampled on the aperture and the ray is aimed at the point on the plane of focus the pinhole ray would have hit. Aperture shape, such as a disk or polygon with blades, determines the shape of bokeh highlights. The sampling cost is paid through extra noise rather than extra geometry. Hard parts include bright out-of-focus highlights that produce noise spikes, optical vignetting and catseye shapes, and matching lens character.",
    k: ["Sampled aperture vs post-process blur: sampling handles occlusion and highlights correctly, but adds noise, whereas a depth-based blur is fast and fails at edges and behind objects.", "Disk vs bladed polygon aperture: polygons match real lens bokeh, but sampling them well needs a more complex mapping."],
    p: ["Small bright lights out of focus produce rare, very bright samples that appear as fireflies.", "Focus distance specified in the wrong unit gives a subject that is never sharp."],
    v: "Render a plane of point-like emitters across a depth range and confirm blur-disc diameter grows with distance from focus as predicted by the thin-lens equation, with the stated aperture shape.",
    dep: ["camera-models","sample-warping"]
  },
  "motion-blur": {
    s: "Renders moving objects and cameras over a shutter interval by giving each ray a time, so blur arises from the actual motion paths.",
    d: "Every camera ray is assigned a time in the shutter interval, and all later rays on the path inherit it. Transforms and vertex positions are interpolated between stored keys at that time, so the scene is effectively different for each sample. The acceleration structure must support moving primitives. Costs are extra storage for motion keys, wider bounds that slow traversal, and noise from having to sample time as well as space. Rotation needs interpolation that preserves shape.",
    k: ["Ray-time sampling vs vector-based post blur: sampling is correct with occlusion, reflections and shadows, but multiplies the noise and acceleration cost, while post blur is cheap and approximate.", "Few motion keys with linear interpolation vs many keys: few save memory, but fast rotation turns into a straight-line shrink without enough keys."],
    p: ["Linear interpolation of a rotating wheel's vertices shrinks it mid-shutter instead of arcing.", "Shutter time not matched to the footage's shutter angle gives blur that is visibly too long or short in compositing."],
    v: "Render a disk rotating exactly 90 degrees over the shutter with four keys and confirm the blur follows an arc with no radial shrink, and that the blur length scales with the shutter setting.",
    dep: ["motion-blur-bvh","camera-ray-generation","scene-graph-and-instancing"]
  },
  "film-and-pixel-filter": {
    s: "Defines how samples are weighted into pixels: the reconstruction filter's shape and width trade sharpness against aliasing and noise.",
    d: "A sample at some position within or around a pixel contributes to nearby pixels by the filter's weight at that offset. Box filters are sharp and alias, Gaussian and windowed-sinc filters trade sharpness for smoothness; negative-lobed filters sharpen but can ring. Filter width must be wider than a pixel to anti-alias fully. Film also handles crops, overscan and resolution. The difficulty is that filtering interacts with noise, denoising and compositing: a wide filter blurs, and a negative lobe rings around bright points.",
    k: ["Wide smooth filter vs sharp narrow filter: wide filters reduce aliasing and noise, but soften the image, while narrow ones preserve detail and need more samples.", "Sampling the filter distribution vs weighting samples: sampling the filter keeps weights equal and noise low, but cannot use negative lobes."],
    p: ["A negative-lobed filter creates dark halos around very bright highlights.", "Compositing multiple elements rendered with different filters shows edges that do not match."],
    v: "Render a sharp edge and a one-pixel-wide line, measure the edge response, and confirm it matches the analytic response of the chosen filter, with correct total weight so a flat field stays flat.",
    dep: ["sample-accumulation"]
  },
  "exposure-and-sensor": {
    s: "Maps scene radiance to recorded values with exposure, white balance, response curve and noise properties that mimic a camera sensor or a film stock.",
    d: "Radiance is scaled by exposure settings such as aperture, shutter time and sensor sensitivity, then optionally by white balance and a response curve. Output stays scene-referred and linear for compositing, while display transforms are applied later. Some pipelines add sensor effects such as glare, bloom and grain. The hard part is keeping exposure physically consistent between lights, camera and later processing, so that doubling exposure doubles pixel values everywhere.",
    k: ["Physical exposure units vs arbitrary scale factors: physical units make lights and camera consistent across shots, but require artists to learn them and lights to be calibrated.", "Baking tone mapping into the render vs leaving it linear: baking gives a finished look immediately, but destroys information that compositing needs."],
    p: ["Exposure applied before and after compositing is double counted in one step.", "Clipped highlights stored in a limited-range format cannot be recovered in later grading."],
    v: "Render a gray card lit to a known illuminance and confirm its pixel value matches the exposure equation. Double the exposure time and confirm all linear values double without change in color.",
    dep: ["photometric-units","units-and-color-spaces","color-management"]
  },
  "camera-ray-generation": {
    s: "Produces the primary rays for each sample: choosing a film position, a lens point and a time, and transforming them into world space with differentials.",
    d: "For each sample, the sampler supplies film, lens and time dimensions. The camera model turns those into an origin and direction, usually in camera space, and the transform at that time moves them to world space. Rays carry a weight and the footprint estimate. This code runs billions of times, so it is highly tuned and vectorized. The challenge is dimension bookkeeping: reusing the same random dimensions for the wrong purpose correlates the samples and produces patterned noise.",
    k: ["Generate rays in packets vs one at a time: packets allow vector hardware to be used, but divergent paths make later bounces incoherent.", "Jittered subpixel positions vs fixed grid: jitter converts aliasing to noise, but loses the exactly regular samples that are cheap for denoisers."],
    p: ["Two sampler dimensions accidentally shared between lens and time make blur and depth of field correlate.", "A camera transform evaluated at shutter midpoint for all rays removes motion blur silently."],
    v: "Trace camera rays only and write their directions and times as an image. Directions must be continuous across pixels, times spread uniformly over the shutter, and no repeating pattern appear in either.",
    dep: ["low-discrepancy-sequences","simd-math"]
  },
  "path-integrator": {
    s: "The core algorithm: build a random path from the camera, at each hit sample a light and a scattering direction, and add up the energy the path collects.",
    d: "From each camera ray, the integrator finds the first hit, adds emission, samples a light directly with a shadow ray, then samples the material for a new direction and repeats until the path is absorbed or killed. Contributions are weighted by the product of scattering values over the sampling probabilities. Weights from light and material sampling are combined so each covers the other's weakness. It is simple to write and hard to make robust: tiny bugs in a probability produce slightly wrong brightness that nothing flags.",
    k: ["Unidirectional paths from the camera vs paths from lights too: camera paths are simple and handle most scenes, but struggle on light through small openings or caustics.", "Direct-light sampling at every bounce vs only by chance: sampling at each bounce cuts noise sharply, at the price of one shadow ray per bounce."],
    p: ["A mismatched probability and sampling routine leaves images a few percent too bright or dark with no visible artifact.", "Paths that never terminate on a closed mirror box run until a depth limit, and wasting time."],
    v: "Render a closed furnace: a diffuse sphere with albedo 1 in a uniform environment of radiance 1. Every pixel must converge to 1, and a sphere of albedo 0.5 to 0.5 at one bounce plus its geometric series.",
    dep: ["next-event-estimation","multiple-importance-sampling","bsdf-sampling","russian-roulette","bvh-traversal"]
  },
  "bidirectional-path-tracing": {
    s: "Traces paths from both the camera and the lights and connects their vertices, so paths that a camera-only tracer finds rarely are found often.",
    d: "A subpath is traced from the camera and another from a light. Every pair of vertices, one from each, is connected with a shadow ray, forming a complete path of every possible length split. The strategies are combined with multiple importance sampling so each path is weighted by how well each method finds it. This finds caustics and light through small gaps much faster. The cost is bookkeeping of probabilities in both directions for every vertex, and that connections to the camera need splatting into other pixels.",
    k: ["Bidirectional vs unidirectional: bidirectional handles indoor and caustic scenes much better, but costs more per sample and is harder to keep consistent with every material.", "Light tracing to the film vs camera-only: it finds hard paths and splats across pixels, so tiles and denoisers cannot treat pixels independently."],
    p: ["Reverse-direction probabilities computed incorrectly for one material give subtly wrong brightness, only in bidirectional mode.", "Splatted light samples break tile rendering and adaptive sampling that assume each pixel is independent."],
    v: "Render a scene with a light behind a small opening using both integrators. They must converge to the same image, with the bidirectional one reaching a given noise level in far fewer samples.",
    dep: ["path-integrator","multiple-importance-sampling","sample-accumulation"]
  },
  "vertex-connection-merging": {
    s: "Combines bidirectional connections with merging of nearby camera and light vertices, which handles paths that connections alone cannot find, such as caustics seen through glass.",
    d: "Besides connecting vertices with shadow rays, the integrator merges a camera vertex with light vertices within a small radius, in the manner of photon density estimation. Both are cast as strategies for the same paths and combined with multiple importance sampling. The merge radius shrinks over iterations so the result converges. It excels at specular-diffuse-specular paths. It is complex, memory hungry, and the radius schedule trades bias for noise.",
    k: ["Merging vs only connecting: merging finds paths that connection never can, but is biased at finite radius and needs spatial lookup structures.", "Shrinking radius over iterations vs fixed radius: shrinking converges to the correct answer, while a fixed radius is faster to stabilize and permanently biased."],
    p: ["A radius that is too large blurs caustics into a soft glow that looks plausible and wrong.", "Light vertex storage grows with resolution and path depth until memory runs out."],
    v: "Render a pool-bottom caustic through a glass sphere and compare against a very long bidirectional render. Caustic brightness and shape must converge toward it as iterations increase and the radius shrinks.",
    dep: ["bidirectional-path-tracing","caustics-handling","memory-budget"]
  },
  "metropolis-transport": {
    s: "Mutates a found light path slightly to find nearby paths, spending samples around the rare paths that carry most of the energy.",
    d: "The renderer starts from a valid path and proposes small changes: perturbing a vertex, or the random numbers that generated it. Each proposal is accepted with a probability that keeps the sampling density proportional to path contribution. Images emerge from the density of visited paths. It shines in scenes dominated by hard-to-find light, such as a bright room seen through a keyhole. Weaknesses include correlated noise, start-up bias, uneven convergence across the image and poor behavior in simple scenes.",
    k: ["Mutation-based vs independent sampling: mutation concentrates effort on difficult paths, but produces correlated, blotchy noise that independent sampling does not.", "Mutating random numbers vs mutating geometry: mutating random numbers works with any material, but small changes can lead to large path changes."],
    p: ["Samples stuck in one bright region leave other areas of the image with no coverage for a long time.", "Without a correct start-up weight, the average brightness is subtly off."],
    v: "Render a scene lit through a narrow gap with the mutation-based and the path integrator at equal time. Averages over large regions must agree, with the mutation-based one showing lower error in the hard region.",
    dep: ["path-integrator","random-number-generation","convergence-estimation"]
  },
  "russian-roulette": {
    s: "Randomly ends low-energy paths and boosts survivors by the inverse of the survival probability, which shortens paths without changing the expected result.",
    d: "After a minimum number of bounces, each path continues with a probability related to its remaining throughput, and surviving paths multiply their weight by one over that probability. The estimate remains unbiased while most dim paths end early. Probability choice matters: too aggressive increases variance, too weak wastes time. It also pairs with a hard depth cap for safety. The subtlety is that it adds variance, and interaction with other estimators, such as light sampling at later bounces, must be accounted for.",
    k: ["Russian roulette vs fixed depth limit: roulette is unbiased and finds long paths occasionally, but a fixed cutoff is predictable in cost and biased dark.", "Throughput-based survival vs constant survival: throughput-based ends paths that matter least, while constant is simple and wastes effort on dim paths."],
    p: ["Survival probability near zero gives huge boosted weights and occasional extremely bright pixels.", "Applying roulette from the first bounce makes every pixel noisy in a bright, simple scene."],
    v: "Render a diffuse furnace with roulette on and off. Mean brightness must match within noise, with average path length lower with roulette and a variance report showing the trade.",
    dep: ["path-integrator","convergence-estimation"]
  },
  "firefly-clamping": {
    s: "Limits the value of any single sample so rare, extremely bright samples cannot leave white dots, accepting a small, controlled energy loss.",
    d: "Fireflies arise from low-probability paths with enormous weight, for example a diffuse ray that happens to find a small bright light through a glossy bounce. Clamping caps the contribution of each sample, or of indirect light only, at a threshold. It removes noise a denoiser cannot, but darkens true highlights and removes caustic energy. Alternatives include path regularization, which blurs near-specular lobes after a diffuse bounce. All of these trade bias for stability.",
    k: ["Clamping vs regularization: clamping is trivial and loses energy at the threshold, while regularization is smoother and changes appearance of glossy light paths.", "Clamp indirect only vs clamp everything: indirect-only keeps direct highlights correct, but misses fireflies from direct light on glossy surfaces."],
    p: ["A threshold set low for a quick preview is left in the final render and the scene looks dull.", "Clamping applied after tone mapping leaves fireflies that were already below display white."],
    v: "Render a glossy scene with a tiny bright light, with clamping at several thresholds. Firefly counts must fall as the threshold drops, and average image energy must change by an amount that matches the reported clamped energy.",
    dep: ["path-integrator","bias-vs-variance"]
  },
  "path-guiding": {
    s: "Learns where light comes from during rendering and steers path directions toward it, cutting noise in scenes with difficult illumination.",
    d: "While rendering, the integrator records the radiance arriving at points in space as directional distributions, in a spatial structure such as a tree. Later samples draw directions from a mixture of this learned distribution and the material's own sampling, combined with multiple importance sampling. It helps with indirect light through doors or caustic-like paths. Costs include memory, extra training samples and the risk of the learned distribution being wrong early or in unexplored regions.",
    k: ["Learned guiding vs plain sampling: guiding converges faster in hard indoor scenes, but adds training overhead and memory with little gain in simple ones.", "Online learning during the render vs a separate training pass: online needs no extra setup but early samples are poorly guided, while a pass costs time up front."],
    p: ["A poorly trained distribution sends samples away from real light and increases noise compared with doing nothing.", "Guiding data stored per tile is inconsistent between machines, leaving visible differences in distributed renders."],
    v: "Render a room lit through a window with and without guiding at equal time. Mean image values must match within noise, with error measured against a long reference lower for the guided render.",
    dep: ["multiple-importance-sampling","bsdf-sampling","memory-budget"]
  },
  "caustics-handling": {
    s: "Strategies for light focused through specular surfaces onto diffuse ones, which unidirectional tracing finds almost never and which otherwise appear as fireflies or are lost.",
    d: "A diffuse surface seeing a small light through glass is an event too rare to sample from the camera. Options include ignoring it, clamping it, blurring specular materials after diffuse bounces, tracing from lights with photon-style merging, or using bidirectional connections. Production renderers often make caustics optional and fake them where needed. It is hard because the paths are a measure-zero event for point sampling, and approximations that remove noise also change light's apparent energy.",
    k: ["Disable caustics vs compute them: disabling gives clean fast images but loses real glow under glass, while computing them requires bidirectional or merging methods and time.", "Photon-style lookups vs path methods: lookups converge quickly with bias that fades, but need storage and radius tuning."],
    p: ["Caustic paths left on in a unidirectional render fill the image with fireflies that need clamping.", "Disabled caustics make a glass of water cast an unnaturally flat shadow."],
    v: "Render a glass sphere over a plane with caustics off, clamped and with merging. The merged result must show the bright focused patch under the sphere at the expected position and with energy matching a long reference.",
    dep: ["vertex-connection-merging","firefly-clamping","dielectric-transmission"]
  },
  "random-number-generation": {
    s: "Produces the stream of numbers that drive every sampling decision, with good statistical quality, fast evaluation and independent streams per pixel and per thread.",
    d: "Generators are small and fast, often counter-based so that sample number and pixel index map directly to a value without shared state. They must be independent across pixels, threads and dimensions, and reproducible. Poor generators produce visible patterns or correlation between pixels. Seeding decides whether two renders match. The difficulty is giving every consumer its own stream without storing state per pixel, and without accidental correlation among related decisions along one path.",
    k: ["Counter-based stateless vs stateful generators: stateless allow random access, reproducibility and parallelism with no storage, while stateful ones are cheaper per number and tied to order of execution.", "Hashing pixel and sample into a seed vs a global stream: hashing is deterministic regardless of thread timing, but cheap hashes risk correlated neighbors."],
    p: ["Weak seeding between pixels creates faint repeated patterns visible when images are averaged.", "A thread-shared generator makes results depend on timing and impossible to reproduce."],
    v: "Generate one billion numbers across simulated pixels and run a statistical test suite, then render with different thread counts. All tests must pass and the images must be bit-identical.",
    dep: ["reproducibility-and-seeds","thread-scheduler"]
  },
  "low-discrepancy-sequences": {
    s: "Deterministic point sets that fill a space more evenly than random numbers, so integrals converge faster than the random rate when the integrand is smooth.",
    d: "Sequences such as radical-inverse or digital constructions place sample points so no large gap exists in any projection. They are scrambled per pixel with a random permutation to avoid correlation between pixels and to allow variance estimates. Convergence can approach one over N instead of one over the square root. The catch is dimensionality: quality degrades in high dimensions, so renderers use them for the first few dimensions and switch to random numbers deeper in the path.",
    k: ["Low-discrepancy vs independent random samples: low-discrepancy gives faster convergence in few dimensions, but requires careful scrambling and degrades in many.", "Fixed sample count vs open-ended sequence: some constructions need a power-of-two count to reach full quality, while extensible ones allow progressive rendering."],
    p: ["Unscrambled sequences repeated across pixels cause correlated structured artifacts.", "Using later dimensions of a sequence for deep bounces gives worse than random results."],
    v: "Integrate a smooth 2D function with random and the sequence for 16 to 4096 points and fit the error slope. The sequence slope must be clearly steeper, and scrambled repeats must give independent error estimates.",
    dep: ["random-number-generation"]
  },
  "stratification-and-blue-noise": {
    s: "Arrange samples across pixels so error is spread as fine-grained noise that is least visible and easiest to denoise, instead of coarse blotches.",
    d: "Stratification divides the sample domain into cells with one sample in each, guaranteeing coverage. Blue-noise methods go further by arranging the random numbers across neighboring pixels so their error is negatively correlated and high-frequency. At low sample counts this makes noise look like fine grain. It requires per-pixel assignment of seeds from a precomputed texture, and degrades as sample counts grow. The difficulty is that gains are perceptual and denoiser dependent, and that it can interact badly with temporal accumulation.",
    k: ["Blue-noise assignment vs independent seeds: blue noise looks cleaner at low sample counts, but gives no benefit in converged images and needs a mask texture.", "Stratify all dimensions vs a few: full stratification explodes in cost, so most renderers stratify only primary dimensions."],
    p: ["A fixed blue-noise mask reused across frames shows as a static pattern on the screen when images move.", "Correlated samples fed to a denoiser trained on independent noise produce artifacts."],
    v: "Render at four samples per pixel with independent and blue-noise seeds and compare the noise spectra. Blue noise must show less low-frequency energy, and both must have equal mean.",
    dep: ["low-discrepancy-sequences","denoiser"]
  },
  "adaptive-sampling": {
    s: "Spends more samples on pixels that are still noisy and stops early on pixels that have converged, using variance estimates to decide.",
    d: "After an initial batch of samples per pixel, the renderer estimates each pixel's error from sample variance or from comparing two independent halves of the samples. Pixels below a threshold are retired; others get more samples, up to a cap. It can cut render time greatly on scenes with large smooth areas. Risks include stopping early on pixels that merely looked quiet by chance, bias introduced by deciding using the same samples, and uneven noise across the image.",
    k: ["Variance from the same samples vs from independent halves: same-sample variance is cheap but biased low, while split buffers need extra memory and are robust.", "Per-pixel vs per-tile decisions: per-pixel is efficient on edges, but tile decisions keep coherence and fit bucket rendering."],
    p: ["A pixel that received dark samples only is declared converged just before a rare bright path would have appeared.", "A threshold set on absolute error ignores bright regions that need more care in relative terms."],
    v: "Render a scene with large flat areas and a noisy glass region. Confirm the sample map is low in flat areas and high in glass, the average samples drop by the expected factor and error matches a uniform render at that budget.",
    dep: ["convergence-estimation","sample-accumulation"]
  },
  "multiple-importance-sampling": {
    s: "Combines estimates from several sampling strategies with weights that automatically favor whichever strategy suits each case, giving low variance where individual strategies fail.",
    d: "A direction can be chosen by sampling the material or by sampling a light. Multiple importance sampling gives each result a weight based on both strategies' probabilities for that same direction, so the weights sum to one and the combination stays unbiased. The balance and power heuristics are the common forms. The challenge is correctness: every strategy must report the probability the others would have assigned, in the same measure, or the weights stop summing to one.",
    k: ["Power heuristic vs balance heuristic: power usually has lower variance, but the balance version is simpler and has proven variance bounds.", "MIS between material and light vs choosing one at random: MIS is robust to both small lights and glossy surfaces, but evaluates two strategies per bounce."],
    p: ["A probability evaluated in the wrong measure, such as per solid angle against per area, gives wrong weights and a biased image.", "Light and material sampling disagree about which directions are possible, leaving fireflies or dark spots."],
    v: "Render a scene with a small light, a large light and glossy and diffuse surfaces using each strategy alone and combined. All must converge to the same mean, with the combined one showing the lowest noise in every region.",
    dep: ["bsdf-sampling","next-event-estimation","area-light-sampling"]
  },
  "bsdf-sampling": {
    s: "Choosing outgoing directions with probability proportional to the material's scattering, so energy-carrying directions are picked often and the estimate has little variance.",
    d: "Each material implements a sampling routine that, given the incoming direction and random numbers, returns a direction, the scattering value and the probability density. Mixed materials first choose a lobe by its weight, then sample inside it. Sampling the visible distribution of microfacet normals avoids wasting samples on hidden facets. The sampled value divided by the density is the path weight. It is hard because the routine, the evaluation and the density must agree exactly, and edge cases like grazing angles must be handled.",
    k: ["Sampling visible normals vs full normal distribution: visible sampling is more efficient and robust at grazing angles, but has more complex math.", "Choosing a lobe by weight vs sampling all lobes: choosing is cheaper per bounce, while sampling all lowers variance with more evaluations."],
    p: ["Sampling and evaluation use slightly different formulas, creating bright or dark errors that vary with roughness.", "Samples generated below the surface are not rejected cleanly and corrupt later bounces."],
    v: "For each material, sample a million directions, histogram them and compare against the evaluation function. The histogram must match the normalized density, and the mean of value divided by density must equal the albedo.",
    dep: ["sample-warping","microfacet-bsdf","energy-conservation"]
  },
  "sample-warping": {
    s: "Maps uniform random numbers onto shapes such as hemispheres, disks, cones and tabulated distributions, giving the sampling densities other components need.",
    d: "Warping functions transform a point in the unit square into a point with a target distribution: cosine-weighted hemisphere, uniform disk, sphere and triangle area. Tabulated distributions invert a cumulative distribution by binary search or by alias tables. Each warp has a known density, which the integrator must divide by. Good warps preserve stratification of the input. They are hard to get right near singular points and with distributions that have zero regions.",
    k: ["Concentric disk mapping vs polar mapping: concentric preserves the structure of stratified inputs, while polar is simpler and distorts area.", "Alias tables vs binary search on cumulative sums: alias tables give constant-time sampling, with more setup and a poor fit for stratified inputs."],
    p: ["A warp that does not preserve stratification wastes the benefit of low-discrepancy points.", "Rounding errors at the unit square's edge return directions outside the valid domain."],
    v: "Map a stratified grid through each warp and plot the result. Histograms must match the analytic densities, stratification must be visibly preserved, and edge inputs must stay in domain.",
    dep: ["low-discrepancy-sequences"]
  },
  "convergence-estimation": {
    s: "Measures how noisy the current image is and how far it likely is from the converged result, so rendering can be stopped on evidence instead of guesswork.",
    d: "Estimators use per-pixel sample variance, differences between independently accumulated buffers, or comparisons with a denoised image. The result is a noise map and a global metric that can drive adaptive sampling, termination and farm time estimates. The difficulty is that variance is itself estimated from the same noisy data, heavy-tailed distributions give unreliable estimates, and what viewers consider acceptable noise depends on the shot's content.",
    k: ["Two half buffers vs running variance: half buffers are robust against bias in variance, but double the accumulation memory.", "Relative vs absolute error criterion: relative scales to the pixel brightness and may over-sample dark noisy pixels, while absolute is stable and ignores perceptual difference."],
    p: ["Heavy-tailed pixels report low variance until a rare bright sample arrives, then jump.", "A global noise number is dominated by a few fireflies and misrepresents the rest of the image."],
    v: "Render a scene to many sample counts, compare the estimated noise to the true error against a long reference, and confirm the estimate tracks it within a factor of two over the range.",
    dep: ["sample-accumulation"]
  },
  "light-types": {
    s: "The kinds of emitters a scene may contain, such as points, spots, distant lights, area lights, environment maps and emissive meshes, each with its own sampling.",
    d: "Point and spot lights are delta lights with no area: they cannot be hit by chance and are only sampled directly. Distant lights model the sun as a disk at infinity. Area lights have shape and give soft shadows. Environment maps surround the scene, and any emissive mesh can be a light. Each type must report its radiance, a sampling routine, a density and its power. The difficulty is making them consistent: the same physical light should look the same in each representation.",
    k: ["Delta lights vs small area lights: delta lights are cheap and noise free, but give hard shadows and cannot be seen in reflections, so many renderers replace them with small areas.", "Treating all emitters uniformly vs special cases: uniform code is simpler and robust, while special cases are faster for common types."],
    p: ["A point light of finite power placed inside geometry creates an infinitely bright pixel.", "A light's falloff convention differs from the authoring tool's, leaving the scene dimmer at distance."],
    v: "Place each light type to give the same illuminance at a test plane and confirm the plane's brightness matches the analytic value for every one, and spot and distant lights match their angular specifications.",
    dep: ["photometric-units","area-light-sampling"]
  },
  "area-light-sampling": {
    s: "Choosing points on a shaped emitter, such as a rectangle, disk or sphere, with a density that accounts for distance and angle, so soft shadows converge with few samples.",
    d: "Points can be sampled uniformly by area, with a conversion of density to solid angle, or directly by solid angle for spheres and polygons, which lowers variance when the light is near. Analytic methods can integrate unshadowed illumination from a polygon exactly. The routine returns a point, its emitted radiance and a density. Near the light and at grazing angles the solid angle densities blow up, so the implementation must handle degenerate cases.",
    k: ["Area sampling vs solid angle sampling: area sampling is simple for any shape, but solid angle sampling has lower variance for close or large lights and needs shape-specific code.", "Spherical-triangle sampling vs projected-area sampling: spherical triangles are exact and complex, with projected area simpler and less uniform."],
    p: ["Density converted between area and solid angle with the wrong cosine gives a light that appears too bright at grazing angles.", "A sample at the light's edge or behind it returns zero or infinite density and produces black or white pixels."],
    v: "Illuminate a plane by a rectangular light with no occluders and compare converged unshadowed illumination against the analytic form factor. They must match within noise at every distance, including near contact.",
    dep: ["light-types","sample-warping"]
  },
  "environment-sampling": {
    s: "Sampling directions of a surrounding image of light, so bright regions like the sun in a sky image are chosen far more often than dim ones.",
    d: "An environment map is a high-dynamic-range image whose pixels have radiance. A sampling distribution is built from the pixel luminance weighted by solid angle, as a marginal over rows and conditionals within rows or as an alias table, and used to pick directions with probability proportional to brightness. The sun in a sky map may be thousands of times brighter than the sky, so without importance sampling, noise is severe. Problems are mapping distortion near poles and storing the distribution for large maps.",
    k: ["Importance-sampling the map vs uniform direction sampling: importance sampling is essential for bright, small sources, but needs precomputed tables and memory.", "Separating the sun from the sky vs one map: separation samples the sun analytically and exactly, but needs an authoring step and may disagree with the captured image."],
    p: ["The distribution is built without the solid angle factor, over-sampling the poles.", "Clipped sun pixels in the image make shadows too soft and the sun too dim."],
    v: "Render a diffuse sphere under a map with a very bright small sun using importance and uniform sampling. Means must agree, importance sampling must reach the same noise in far fewer samples, and the shadow edge must match the sun's apparent size.",
    dep: ["sample-warping","light-types","photometric-units"]
  },
  "many-light-sampling": {
    s: "Picks which of thousands of lights to sample at a point, favoring those that contribute most, so scenes with huge numbers of emitters stay affordable.",
    d: "Sampling one light uniformly gives high noise when only a few matter. Light hierarchies group lights into a tree, each node storing the total power, bounds and orientation, and the renderer descends choosing children by estimated contribution at the shading point. Alternatives use precomputed tables per cell or resampling. The estimate must be a valid probability for multiple importance sampling. Difficulties are building the tree for moving lights, handling lights with orientation and very close points.",
    k: ["Hierarchical light tree vs uniform or power-based choice: the tree reduces noise sharply with many lights, but costs build time and traversal per shading point.", "Contribution estimates that are conservative vs tight: conservative bounds are safe and noisier, while tight bounds are efficient and risk zero probability for a light that matters."],
    p: ["An estimate that gives zero probability to a contributing light biases the image dark.", "A light tree built once is stale after lights animate."],
    v: "Render a scene of ten thousand small lights using uniform and tree-based choice. Means must agree, and the tree version must reach the same noise level with a fraction of the samples.",
    dep: ["light-types","next-event-estimation","incremental-scene-update"]
  },
  "light-linking": {
    s: "Restricts which lights illuminate which objects, and which objects cast shadows from which lights, as an artistic control outside physical rules.",
    d: "Artists associate objects with sets of lights through lists or groups. During light sampling, the renderer filters candidates to those linked to the shaded object, and shadow rays ignore blockers not linked to the light. Implementation requires per-object masks consulted during sampling, and light sampling distributions that are valid per set. Costs are extra bookkeeping and loss of physical consistency, which makes global effects such as indirect bounces ambiguous.",
    k: ["Linking in the renderer vs fixing in compositing: linking gives a correct look with interaction, but breaks conservation of energy, while compositing keeps physics and costs extra passes.", "Per-set sampling distributions vs filtering a global one: per-set distributions are exact, and multiply memory, while filtering is cheap and raises variance."],
    p: ["A light excluded from an object still lights it by indirect bounce, which surprises artists.", "Shadow linking left on from an earlier shot removes shadows no one expects."],
    v: "Link a light to one of two identical spheres and confirm only that sphere is lit directly, the other receives only indirect light, and the sampled direct lighting on the linked sphere matches the unlinked case.",
    dep: ["many-light-sampling","visibility-and-overrides","art-directability"]
  },
  "next-event-estimation": {
    s: "At each path vertex, picks a point on a light and tests visibility, instead of waiting for a random bounce to hit the light, which greatly cuts noise from direct lighting.",
    d: "At a surface hit, the integrator samples a light, builds the connecting direction, traces a shadow ray, and if unoccluded adds the product of emitted light, scattering and geometric terms over the probability. Combined by MIS with the same light reached through material sampling, so neither double counts. It makes small lights tractable. Complications arise with specular surfaces, where direct connection is impossible, and with transparent blockers.",
    k: ["One shadow ray per bounce vs several per bounce: more shadow rays reduce noise from lights, but cost grows linearly while indirect noise remains.", "Sampling lights by power vs by estimated contribution: power is simple and wasteful for distant lights, while contribution-aware choices need more computation."],
    p: ["Counting emission from a light twice, once by sampling and once by an incidental hit, makes lights too bright.", "Connection attempted at perfectly specular vertices contributes nothing and wastes a ray."],
    v: "Render an area-lit diffuse plane with next event estimation only, material sampling only and both with weights. All three must converge to the same value, with the weighted one showing the lowest variance.",
    dep: ["shadow-rays","area-light-sampling","environment-sampling","multiple-importance-sampling"]
  },
  "shadow-rays": {
    s: "Rays that only test whether anything blocks the segment between two points, which can stop at the first hit and so are cheaper than full intersection queries.",
    d: "A shadow ray runs from a shading point to a light sample and returns blocked or clear, ending at the first hit. Transparent surfaces need either stochastic opacity tests or accumulated transmittance. Because they outnumber camera rays, traversal for them is specialized: no sorting by distance, no need for hit details. Offsets avoid self-hits. The hard part is correctness with partial transparency, volumes between points and the interaction with light linking.",
    k: ["Any-hit early exit vs closest hit: early exit is much faster, but cannot account for partially transmissive blockers without an extra evaluation.", "Stochastic transparency vs accumulating transmittance: stochastic is cheap and noisy, while accumulation is exact for a few layers and costly for many."],
    p: ["A shadow ray offset too little finds its own surface and darkens it with speckle.", "Leaves treated as opaque in shadow rays but transparent to camera produce shadows with no holes."],
    v: "Place a half-transparent plane between a light and a floor and confirm the floor's brightness is the plane's transmittance times the unshadowed value, to within noise, with no speckle on the floor.",
    dep: ["bvh-traversal","self-intersection","participating-media"]
  },
  "photometric-units": {
    s: "The relation between a light's specified power, such as watts, lumens, nits or exposure values, and the radiance used inside the renderer.",
    d: "Artists specify intensity in many forms: power for a bulb, luminance for a panel, illuminance for sunlight, relative multipliers. The renderer converts them to radiance with the shape's area and solid angle, optionally using spectral efficiency and a color temperature. Consistent conversion means scenes keep exposure when lights change shape. Problems arise from legacy intensity conventions, spectral color specification and exposure at physical values that are very large.",
    k: ["Physical units vs unitless multipliers: physical values make assets portable and exposure meaningful, but force artists to learn units and be careful with scale.", "Power that stays constant when the shape grows vs radiance that stays constant: constant power keeps overall brightness, while constant radiance keeps surface look."],
    p: ["Doubling a light's size doubles its power if specified as radiance, brightening the shot unexpectedly.", "Scene scale in centimeters while units assume meters changes light falloff by a factor of ten thousand."],
    v: "Make lights of the same specified power with different shapes and confirm each gives the same illuminance on a test plane, and that converting to lumens and back returns the original value.",
    dep: ["units-and-color-spaces"]
  }
});
