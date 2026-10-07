// Details for the image processing plate, part 1: interfaces, batch service, geometry, filters.
ATLAS.details("image-processing", {
  "command-line-tool": {
    s: "A program that applies chains of operations to image files from a shell, used in scripts, build steps and one-off fixes without writing code.",
    d: "The tool parses arguments into a list of operations, opens inputs through the codec layer, builds a pipeline and writes outputs. Options often come in an order-sensitive grammar, because the order of resize, crop and sharpen changes the result. It shares the operation registry with the library so every new operation gets a command for free. It is hard to design: a compact syntax for dozens of parameters, predictable defaults for quality, and exit codes that scripts can trust.",
    k: ["Order-sensitive argument grammar vs fixed pipeline stages: sequence matches how users think and allows repeated operations; parsing is subtle and mistakes silently change output.", "Overwrite in place vs write new files: in place is convenient for batch jobs; a bad run destroys originals with no recovery."],
    p: ["A default quality setting that differs between versions changes thousands of files in a rebuild without any visible warning.", "Shell globbing and unusual file names cause the wrong files to be read or written."],
    v: "Run the same resize command twice on one input and compare output bytes. Run it on a corrupt file and confirm a nonzero exit code, a message naming the file and no partial output left behind.",
    dep: ["library-api","operation-registry","error-model"]
  },
  "library-api": {
    s: "The native programming interface: functions to load an image, apply operations, query properties and save, with rules for who owns memory and what each call may block on.",
    d: "The API exposes an image handle, operation calls that return new handles, loaders and savers with option sets, and queries for size, format and metadata. Calls are designed for stable binary compatibility: opaque types, versioned option structures and explicit allocation rules. A thread-safety contract says which handles may be shared. Difficulty lies in keeping the surface small while operations multiply, and in evolving it without breaking compiled consumers.",
    k: ["Opaque handles with accessor functions vs public structs: opaque types permit internal change and binary stability; they cost a call per access and make hot loops slower.", "Immutable images vs in-place mutation: immutability simplifies caching and threading; it can double memory use in naive code."],
    p: ["An added field in a public struct breaks every precompiled consumer that links to a newer library.", "Callers that free an image still referenced by a lazy pipeline hit use-after-free faults."],
    v: "Compile a program against version N, replace the library with version N+1 without recompiling, and confirm it still loads, resizes and saves a test image with identical output.",
    dep: ["operation-registry","operation-graph","error-model","reference-counting"]
  },
  "language-bindings": {
    s: "Wrappers that expose the library to higher-level languages, converting between their image or array types and the native handle with minimal copying.",
    d: "Bindings are either hand-written or generated from the operation registry and its introspection data. They map native handles to language objects, translate errors into exceptions, release native memory when objects are collected, and exchange pixel data with array libraries through shared buffers. The hard part is lifetime: garbage collectors run when they please while native memory is large, so the wrapper must drive release and communicate real memory pressure to the host runtime.",
    k: ["Generated bindings vs hand-written: generation keeps pace with new operations automatically; hand-written wrappers feel more idiomatic but fall behind.", "Zero-copy buffer sharing vs copying into native memory: sharing is fast for big images; the caller can mutate or free memory under a running operation."],
    p: ["Garbage collection lags, so a loop over thousands of images holds gigabytes of native memory before anything is freed.", "A wrapper that releases the global interpreter lock incorrectly deadlocks or corrupts shared state."],
    v: "Process ten thousand images in a loop from the host language and confirm resident memory stays flat. Pass an array view in, modify the original afterward and confirm the documented behavior holds.",
    dep: ["library-api","operation-registry","reference-counting","error-model"]
  },
  "operation-registry": {
    s: "A table of every operation with its name, typed arguments, flags and implementation, from which documentation, command-line options and bindings are generated.",
    d: "Each operation registers its name, input and output images, optional parameters with types and defaults, and flags such as whether it is sequential or cacheable. Callers look operations up by name, introspect arguments and instantiate them. Plugins register more at load time. It is hard because it is a contract: argument names and defaults become public, and the registry must carry enough metadata for the optimizer to reason about operations it did not write.",
    k: ["Self-describing operations vs hand-maintained docs and bindings: introspection removes duplicated work; it demands rigorous metadata on every operation.", "Dynamic plugin loading vs a closed set: plugins extend the library without rebuilds; they add version skew and a trust problem for loaded code."],
    p: ["Renaming an argument for tidiness breaks every script and binding that used the old name.", "A plugin with wrong metadata, such as claiming no region dependence, causes the optimizer to produce incorrect output."],
    v: "List every registered operation, generate the command-line help and the language binding from it, and confirm a newly added test operation appears in both with correct argument types and no manual edits.",
    dep: ["error-model"]
  },
  "error-model": {
    s: "The way failures are reported: error codes or exceptions, messages that name the file and operation, and rules for what state remains after a failed call.",
    d: "Errors originate deep in codecs and operations, often on worker threads long after the call that triggered them, because lazy pipelines run on demand. The model carries a message, an error domain and context such as the file path, and delivers it to the caller that forced evaluation. Warnings, such as a recoverable truncated file, travel separately. The difficulty is distinguishing fatal, recoverable and ignorable problems, and producing messages that identify which of ten thousand files failed.",
    k: ["Strict failure on any corruption vs tolerant partial decode: strict is safe and predictable; tolerant rescues damaged photos but can mask truncation and return wrong data.", "Per-thread error buffer vs error return values: a buffer is simple to retrieve; it can be overwritten or read by the wrong thread."],
    p: ["A truncated file returns a half-gray image with exit status zero and ends up published.", "An error raised on a worker thread surfaces later in an unrelated call, confusing the cause."],
    v: "Truncate a valid file at several byte offsets and confirm each load reports an error naming the path and failure type, or a flagged partial image, never a silent success.",
    dep: []
  },
  "batch-scheduler": {
    s: "Runs the same pipeline over many files with bounded parallelism, retries, ordering rules and a record of which inputs succeeded, failed or were skipped.",
    d: "The scheduler enumerates inputs, decides whether to parallelize across files, within images or both, and bounds in-flight jobs by memory and cores. It records a manifest of results, skips outputs that are already current, and retries transient failures. Parallelism across files avoids lock contention but multiplies memory use; within an image it uses fewer resources but leaves cores idle on small files. Restartability after a crash is the feature users value most.",
    k: ["Parallel across files vs parallel within each image: across scales linearly for small images; within is needed for giant images and bounds peak memory.", "Skip-if-newer checks vs always regenerate: skipping saves hours on reruns but depends on timestamps and ignores changed parameters."],
    p: ["Running one worker per core on large images exhausts memory and the job is killed after hours.", "A crash midway leaves half-written output files that look complete to the next run."],
    v: "Run a batch of one thousand files, kill the process halfway, rerun, and confirm only the missing outputs are produced, no partial files remain and the manifest matches the output folder.",
    dep: ["work-scheduler","job-resource-limits","error-model","library-api"]
  },
  "on-demand-transform-service": {
    s: "A network service that returns an image resized, cropped or reformatted according to parameters in the request URL, rendering from an original on first use.",
    d: "A request names the original and a set of transformations. The service validates parameters against an allowlist, fetches the original, runs a bounded pipeline, picks an output format and returns it with cache headers. It sits behind a content delivery layer so most requests never reach it. The hard parts are abuse and cost: unbounded size parameters let anyone force expensive work, and a combinatorial URL space defeats caching unless parameters are normalized or signed.",
    k: ["Free-form parameters vs named presets: free-form is flexible for frontends; presets bound the cache keyspace and the cost an attacker can cause.", "Signed URLs vs open endpoints: signing prevents cost attacks and enumeration; it needs key management and complicates ad hoc use."],
    p: ["A request for an enormous output size ties up memory and CPU, and a modest number of such requests takes the service down.", "Unnormalized parameter order generates duplicate cache entries for identical images."],
    v: "Request one derivative twice and confirm the second is served from cache with identical bytes. Request a size beyond the limit and confirm a fast rejection with no pipeline started.",
    dep: ["library-api","derivative-cache","format-negotiation","job-resource-limits"]
  },
  "derivative-cache": {
    s: "Stores generated variants of an original, keyed by source identity and transformation parameters, and invalidates them when the original or the processing code changes.",
    d: "Each derivative is stored under a key combining a content hash or version of the original, the normalized parameters and a processing version. Lookup precedes any work. Entries live in file storage or an object store with expiry or size-based eviction. Concurrent misses for the same key must be coalesced so only one render happens. The hard parts are invalidation and fairness: knowing when a variant is stale, and keeping a flood of one-off variants from evicting the popular ones.",
    k: ["Content-hash keys vs path and timestamp keys: hashes never serve stale data and dedupe identical files; computing them needs a full read of the original.", "Store all variants vs only popular ones: storing everything makes reads fast; storage grows with variants times originals."],
    p: ["Upgrading a resampling filter without bumping the processing version keeps serving old-looking images from cache.", "Two simultaneous requests for a missing variant both render it, doubling load during traffic spikes."],
    v: "Replace an original with changed content and confirm the next request returns a new rendering. Fire fifty concurrent identical requests on a cold cache and confirm exactly one render occurs.",
    dep: ["format-negotiation"]
  },
  "format-negotiation": {
    s: "Chooses the output format and quality for a client from its declared capabilities and the image's content, so each viewer gets the smallest acceptable file.",
    d: "The service reads capability headers listing accepted formats, then picks among candidates such as a modern efficient codec, a widely supported lossy one, or lossless for graphics with flat colors and transparency. It may inspect the image, for example for an alpha channel or a small palette. Responses must vary by the capability header so caches keep separate copies. It is hard because the best choice depends on content, and the caching layer must know the response is not a single resource.",
    k: ["Header-based negotiation vs explicit format in the URL: headers give clean URLs and automatic upgrades; explicit URLs are simpler to cache and debug.", "Content-aware choice vs fixed rule per request: content-aware saves bytes on graphics and photos; costs extra analysis per image."],
    p: ["A missing variation header makes a cache serve an unsupported format to older clients, who see broken images.", "Choosing an efficient codec that is slow to encode adds seconds of latency on cold requests."],
    v: "Request one image with differing capability headers and confirm different formats, matching content types, correct variation headers, and that a cache keeps each variant distinct.",
    dep: ["codec-registry","rate-quality-control"]
  },
  "job-resource-limits": {
    s: "Hard ceilings on pixels, memory, time and output size that a single job may use, enforced before and during processing.",
    d: "Limits are checked at several points: declared dimensions after reading the header, projected memory from the pipeline plan, elapsed time during execution and output size at write. Exceeding one aborts the job with a specific error. Limits may be set per tenant or per endpoint. The difficulty is that cheap checks run before knowing the true cost: a small file can expand to billions of pixels, and a harmless-looking pipeline can need a huge intermediate.",
    k: ["Limit by pixel count vs by file size: pixel count tracks memory and CPU cost; file size is simple but compressible images evade it.", "Fail fast on projected cost vs abort on actual use: projection avoids wasted work; it must be conservative, rejecting some valid jobs."],
    p: ["Limits applied only to the output ignore a huge intermediate, so a request is accepted and then exhausts memory.", "No time limit lets one pathological file hold a worker indefinitely."],
    v: "Submit a tiny file declaring one hundred thousand pixels per side and confirm rejection from the header alone, with peak memory near baseline and an error naming the exceeded limit.",
    dep: ["memory-budget","dimension-and-memory-limits"]
  },
  "resampling-filters": {
    s: "The functions that estimate pixel values at new positions when an image is enlarged or reduced, trading sharpness, ringing, aliasing and speed.",
    d: "Resampling computes each output pixel as a weighted sum of nearby input pixels, with weights from a kernel such as box, triangle, cubic, or a windowed sinc. Reduction must lowpass first or detail aliases into false patterns, so the kernel widens with the shrink factor. Implementations precompute weights per row and column and run the two axes separately. Hard parts: correct alignment of pixel centers, handling edges, operating in linear light, and weighting alpha correctly.",
    k: ["Wide windowed kernels vs narrow cubic kernels: wide ones keep detail but ring near edges and cost more; narrow ones are fast and softer.", "Resampling in gamma-encoded values vs linear light: encoded is faster and the common default; linear light is correct and avoids darkened edges but needs more precision."],
    p: ["Treating pixel positions as corners instead of centers shifts the image by half a pixel, which accumulates across repeated resizes.", "Shrinking by a large factor without widening the kernel produces moire in fine textures."],
    v: "Downscale a zone-plate test pattern and confirm no aliasing rings appear. Resize a checkerboard of black and white and confirm the average of the output is mid-gray in linear light.",
    dep: ["separable-kernels","transfer-functions","alpha-premultiplication","sample-types-and-bit-depth"]
  },
  "shrink-on-load": {
    s: "Asks the decoder for a reduced-size version of the image directly, so a large photo being turned into a thumbnail is never fully decoded.",
    d: "Several codecs can produce images at one half, one quarter or one eighth scale cheaply, by decoding only low-frequency coefficients or lower pyramid levels. The pipeline planner detects a following shrink and requests the largest integer-factor reduction that still leaves enough pixels, then finishes with an accurate resample. The gain is large, often several times faster and a fraction of the memory. The risk is quality: the codec's cheap reduction uses its own filter and a rounding choice for odd sizes.",
    k: ["Decoder-side reduction plus final resample vs full decode then resample: much faster and lighter; slightly different filtering, so results are not identical to the reference path.", "Aggressive factor vs conservative factor: aggressive saves most work; conservative keeps extra source pixels for a better final filter."],
    p: ["Reducing too far before the final resize leaves too few pixels and the output looks soft.", "Output dimensions differ by one pixel between the shrink path and the full path because of rounding."],
    v: "Make a thumbnail of a twenty-megapixel photo with and without the reduction, compare timing and peak memory, and confirm output dimensions are identical and visual difference stays under a set error threshold.",
    dep: ["resampling-filters","region-decode","transform-lossy-coding","pipeline-optimizer"]
  },
  "affine-warp": {
    s: "Maps output pixels back to source positions through a matrix for rotation, scaling, skew and translation, sampling the source with an interpolation filter.",
    d: "For each output pixel the transform inverts the matrix to find the corresponding source coordinate, then interpolates from neighbors. Mapping backward avoids holes that forward mapping leaves. The output bounding box is computed from the transformed corners, and areas with no source data are filled by a background or an edge rule. The hard parts are accuracy for rotation by ninety degrees, which should be exact, speed through incremental coordinate stepping, and tile-friendly access when a large rotation reads far-apart source rows.",
    k: ["Backward mapping with interpolation vs forward splatting: backward leaves no holes and matches the filter model; forward is sometimes cheaper but needs hole filling.", "Special-casing exact right-angle turns vs a single general path: special cases are lossless and fast; they add branches that must match the general result."],
    p: ["Rotation of a large image reads source rows far apart, thrashing the cache and the tile pool.", "Repeated small rotations accumulate blur because each pass resamples the previous output."],
    v: "Rotate an image by ninety degrees four times and confirm it equals the original bit for bit. Rotate by thirty degrees and back and confirm the center region matches within a small error.",
    dep: ["resampling-filters","region-propagation","crop-and-extend"]
  },
  "perspective-and-lens-warp": {
    s: "Applies nonlinear coordinate mappings: projective correction of tilted subjects and removal of lens distortion, vignetting and color fringing.",
    d: "A projective warp uses a three-by-three matrix with a per-pixel divide, so scale varies across the image and the filter must adapt. Lens correction uses a radial polynomial model per lens and focal length, applied as a lookup grid computed at coarse resolution and interpolated. Chromatic fringing is handled by warping channels differently. Difficulty: local scale changes mean resampling needs a variable-width filter, and the correction parameters need a trustworthy source such as a profile database.",
    k: ["Evaluate the mapping per pixel vs interpolate a coarse grid: exact evaluation is accurate and slow; a grid is fast with small error between nodes.", "Variable-width filtering vs a fixed filter: variable avoids aliasing where the image shrinks; fixed is simpler and fails visibly near perspective horizons."],
    p: ["Applying a profile for the wrong lens or focal length makes straight lines bend in the opposite direction.", "Strong perspective correction pulls source pixels from outside the frame, leaving visible empty corners."],
    v: "Photograph a printed grid with a wide lens, correct it, and measure that straight lines deviate by less than one pixel across the frame, with no aliasing in the compressed region.",
    dep: ["resampling-filters","affine-warp","region-propagation"]
  },
  "crop-and-extend": {
    s: "Selects a rectangle of an image, or grows the canvas, with defined rules for what values appear outside the original edges.",
    d: "Cropping is a metadata-only change in a lazy pipeline: it narrows the region the upstream must produce. Extending needs a border rule: constant color, copy of the nearest edge, mirrored reflection or wraparound. The same rules serve neighborhood filters that read past the edge. Details matter at the margin: offsets can be fractional, crops can fall partly outside, and the choice of border affects filter results at the boundary, where blurs and warps otherwise darken or smear.",
    k: ["Mirror vs constant vs edge-replicate borders: mirror hides seams in filters; constant is predictable for masks; replicate is cheap and can streak.", "Lazy crop vs eager copy: lazy costs nothing and avoids reading unused tiles; eager makes the result independent of the source buffer."],
    p: ["Filtering with constant black borders darkens a visible band along every image edge.", "A crop rectangle that extends beyond the image by one pixel causes a silent clamp or an error depending on the call path."],
    v: "Crop the center of a large image through a pipeline and confirm only the tiles covering it are read. Blur a constant gray image with mirrored borders and confirm every pixel remains identical gray.",
    dep: ["region-propagation","operation-graph"]
  },
  "orientation-transform": {
    s: "Applies the rotation and mirroring recorded in metadata so that an image displays upright, and resets the tag to avoid applying it twice.",
    d: "Cameras store sensor-order pixels and an orientation value, one of eight rotations and flips, in metadata. Display software is expected to apply it. A library can auto-rotate on load, expose the tag and let the caller decide, or apply it only at save. Implementation is a set of transposes and flips, which are memory-bound and benefit from tile-wise transposition. The recurring trouble is double application: rotating pixels and leaving the tag set rotates the image again in any viewer that honors it.",
    k: ["Auto-apply on load vs leave to the caller: auto-apply gives correct pictures by default; callers who also read the tag rotate twice.", "Rotate pixels and reset the tag vs keep pixels and keep the tag: baking in is robust across viewers; lossy codecs may need an exact block-aligned lossless rotation."],
    p: ["Resizing a portrait photo without applying orientation produces a landscape thumbnail with a sideways face.", "Rotating pixels but copying the original tag makes some viewers show the image rotated twice."],
    v: "Take eight test images covering every orientation value, process each through the library, and confirm all eight render upright in a viewer that honors the tag and in one that ignores it.",
    dep: ["exif-metadata","metadata-policy","affine-warp"]
  },
  "compositing-and-blending": {
    s: "Combines images using alpha, masks and blend modes: overlays, watermarks, layer stacks and soft transitions, with correct treatment of transparency.",
    d: "The core is the over operator, which mixes foreground and background by alpha, ideally in premultiplied form so that edges blend correctly. Blend modes such as multiply and screen are per-channel formulas applied before the mix. Masks come from channels or generated shapes. Compositing in linear light gives physically plausible results, while encoded values give the look many designers expect. Difficulty: precision for semi-transparent edges, consistent alpha across formats, and matching other tools' expectations.",
    k: ["Premultiplied vs straight alpha internally: premultiplied composes and filters correctly; it loses color precision at low alpha and needs conversion at the edges.", "Linear-light compositing vs encoded-value compositing: linear is physically correct; encoded matches legacy appearance and runs faster."],
    p: ["Compositing straight-alpha images with a naive formula leaves dark or bright halos around cutouts.", "A watermark composited in 8 bits across thousands of operations accumulates visible banding."],
    v: "Composite a 50 percent white layer over 50 percent black and confirm results match a reference to within one code value, then place a soft-edged cutout on contrasting backgrounds and confirm no halo.",
    dep: ["alpha-premultiplication","transfer-functions","pixel-format-model","simd-kernels"]
  },
  "convolution-engine": {
    s: "Applies an arbitrary small weight matrix to every pixel neighborhood, the general mechanism behind blur, sharpen, emboss and edge filters.",
    d: "For each output pixel, the engine multiplies a window of input pixels by kernel weights and sums them, with scaling and offset. It handles borders through the same rules as cropping and works per channel. Fast paths exist for common sizes, integer weights and separable kernels, and for large kernels it switches to frequency-domain multiplication. The hard parts are the cost curve, which grows with the square of kernel size, and numerical care: negative weights, accumulation precision and clipping.",
    k: ["Direct spatial convolution vs frequency-domain: direct is exact and fast for small kernels; frequency-domain wins for large kernels but allocates big complex buffers and has wraparound artifacts.", "Integer fixed-point weights vs floating point: integer is quicker with vector instructions; floating point avoids overflow and rounding bias."],
    p: ["Kernels whose weights do not sum to one shift overall brightness unless a normalization step exists.", "Accumulating in 8 bits overflows with sharpening kernels and wraps bright pixels to dark."],
    v: "Convolve with an identity kernel and confirm bit-exact output. Convolve an impulse image with a known kernel and confirm the output reproduces the kernel, including at image borders.",
    dep: ["halo-and-overlap","crop-and-extend","simd-kernels","separable-kernels"]
  },
  "separable-kernels": {
    s: "Splits a two-dimensional kernel into a horizontal and a vertical pass, cutting the work per pixel from the square of the kernel width to twice its width.",
    d: "A kernel that is an outer product of two vectors can be applied as two one-dimensional convolutions. Gaussian blur and box filters qualify, as do most resampling kernels. The intermediate image holds the result of the first pass, so a streaming implementation keeps a band of rows. Vertical passes read widely spaced rows and perform poorly unless processed in cache-friendly blocks or on transposed data. Non-separable kernels can sometimes be approximated by a sum of several separable ones.",
    k: ["Two passes with an intermediate vs a direct two-dimensional pass: two passes are far cheaper for wide kernels; the intermediate costs memory and may need higher precision.", "Transpose between passes vs strided vertical reads: transposing makes both passes sequential; strided access avoids the extra copy but stalls on cache misses."],
    p: ["Storing the intermediate in 8 bits adds a second rounding step and visible banding in smooth gradients.", "Vertical pass reads over a tall tile touch one cache line per pixel and run several times slower than the horizontal pass."],
    v: "Compare a two-pass Gaussian with a direct two-dimensional Gaussian on a test image and confirm the maximum difference is within rounding, with a timing ratio near the ratio of operation counts.",
    dep: ["convolution-engine","simd-kernels","scanline-streaming"]
  },
  "gaussian-blur": {
    s: "Smooths an image with a bell-shaped kernel, the standard way to reduce noise or detail, and the basis of unsharp masking and scale-space analysis.",
    d: "The kernel width follows the chosen standard deviation, typically truncated at three or four sigma. Small sigmas use a direct separable convolution. Large sigmas switch to repeated box filters, which approximate a Gaussian with constant cost per pixel, or to recursive filters or the frequency domain. Quality depends on truncation and accuracy: too narrow a window leaves visible edges in the kernel, and approximate methods differ slightly between implementations.",
    k: ["Exact truncated kernel vs repeated box approximation: exact is predictable; the box approach has constant cost for huge sigma at the price of small shape errors.", "Blur in linear light vs encoded values: linear light looks more natural around bright highlights; encoded is the common and cheaper default."],
    p: ["Truncating the kernel at one or two sigma leaves visible blockiness in the blur of smooth gradients.", "Large sigma on a tile without enough overlap shows seams at tile borders."],
    v: "Blur a single bright pixel and confirm the output sums to the input value and matches the analytic profile within one code value. Process a large image in tiles and in one piece and confirm identical output.",
    dep: ["separable-kernels","convolution-engine","halo-and-overlap","sample-types-and-bit-depth"]
  },
  "sharpening": {
    s: "Increases apparent detail by boosting local contrast at edges, usually by adding back a scaled difference between the image and a blurred copy.",
    d: "Unsharp masking subtracts a blurred copy from the original and adds the scaled difference back, with a radius for detail size, an amount for strength and a threshold to leave flat noise alone. Better variants work on luminance only, limit the boost near already-bright or dark pixels, and apply less in smooth areas. Sharpening after reduction restores crispness lost to resampling. The trouble is halos around edges and amplified noise or compression artifacts.",
    k: ["Luminance-only vs per-channel sharpening: luminance avoids color fringes at edges; per-channel is simpler and can shift hue.", "Fixed sharpening after resize vs none: fixed sharpening makes thumbnails crisp; applied twice or on already sharp images it creates ringing."],
    p: ["Sharpening before lossy encoding amplifies block noise and inflates file size without improving the look.", "Strong settings leave bright halos along high-contrast edges, obvious on text and logos."],
    v: "Sharpen a slanted-edge test chart and confirm edge rise distance shrinks without overshoot above a stated percentage. Sharpen a flat noisy region with a threshold and confirm noise variance is unchanged.",
    dep: ["gaussian-blur","tone-curves","convolution-engine"]
  },
  "morphology": {
    s: "Grows or shrinks bright regions with neighborhood minimum and maximum operations, used to clean masks, find boundaries and remove small specks.",
    d: "Dilation takes the maximum over a structuring element and erosion the minimum. Combined, they give opening, which removes small bright specks, and closing, which fills small holes. Rectangular elements are separable and can be run with van Herk style algorithms that cost constant time per pixel regardless of size. Distance transforms and connected-component labeling are usual companions. It is hard to make fast for arbitrary shapes, and results on gray and color images need a clear definition per channel.",
    k: ["Rectangular separable elements vs arbitrary shapes: rectangles run in constant time per pixel; arbitrary shapes cost proportional to their area.", "Binary mask morphology vs grayscale: binary can pack bits and run very fast; grayscale handles soft masks but costs full samples."],
    p: ["Applying a large element to a tiled image without overlap changes the result near tile borders.", "Erosion on a premultiplied color image pulls transparent black into edges and darkens object outlines."],
    v: "Open a binary image containing specks one pixel wide and large blobs, and confirm that all specks vanish while blobs keep their shape, with identical results whether run whole or in tiles.",
    dep: ["convolution-engine","halo-and-overlap","simd-kernels"]
  },
  "noise-reduction": {
    s: "Reduces random variation from sensors or compression by averaging or modeling similar pixels while trying to leave real edges and texture alone.",
    d: "Simple methods are median and bilateral filters that weight neighbors by both distance and value similarity. Stronger ones compare patches across a wide search window and average the most similar, or work in a wavelet domain by shrinking small coefficients. Luminance and chroma noise are treated separately since they differ in size and structure. The cost is high, usually the slowest operation in a pipeline, and the trade-off between smoothing and detail loss is subjective and image dependent.",
    k: ["Edge-preserving local filters vs patch-based averaging: local filters are fast and leave residual noise; patch-based is much better and orders of magnitude slower.", "Denoise before sharpening or resizing vs after: before removes noise that later steps would amplify; after is cheaper on a smaller image."],
    p: ["Aggressive settings turn skin and foliage into a waxy plastic texture that no later step recovers.", "Treating all channels equally smears color edges, since chroma noise is much stronger than luminance noise."],
    v: "Add known Gaussian noise to a clean image, denoise, and confirm peak signal-to-noise ratio improves by the expected margin while an edge-sharpness measure falls by less than a stated fraction.",
    dep: ["convolution-engine","halo-and-overlap","sample-types-and-bit-depth"]
  },
});
