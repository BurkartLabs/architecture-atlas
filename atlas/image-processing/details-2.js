// Details for the image processing plate, part 2: tonal operations, pipeline, tiling, pixel formats.
ATLAS.details("image-processing", {
  "tone-curves": {
    s: "Remaps each pixel value through a function, such as gamma, contrast or an arbitrary spline, applied independently per channel or on luminance only.",
    d: "A curve is evaluated once into a lookup table with one entry per possible input value, and each pixel is then a table read. For high bit depth inputs the table is sampled and interpolated, or the curve is computed directly with vector math. Curves on luminance preserve hue, while per-channel curves change color balance. The hard parts are doing the mapping in the intended space, since the same curve looks very different in linear and encoded values, and preserving precision.",
    k: ["Lookup table vs direct computation: tables are fastest for 8 and 16 bit data; direct math is needed for floating point and avoids table quantization.", "Per-channel curves vs luminance-only: per-channel is simple and shifts saturation; luminance-only keeps hue and needs a color-space conversion."],
    p: ["Applying a contrast curve to 8-bit data and then another adjustment compounds rounding and produces visible gaps in the histogram.", "A curve designed for encoded values applied to linear data crushes shadows."],
    v: "Apply an identity curve and confirm bit-exact output. Apply a gamma curve to a 256-step gray ramp and confirm each output step matches the analytic value within half a code value, and the sequence is monotonic.",
    dep: ["lookup-tables","transfer-functions","sample-types-and-bit-depth"]
  },
  "histogram-operations": {
    s: "Counts pixel values and uses the distribution to analyze or adjust an image, as in auto levels, equalization, matching and exposure checks.",
    d: "A histogram is an array of counts per value per channel, computed in one pass, often with per-thread private arrays merged at the end to avoid contention. Operations derived from it include percentile clipping for auto contrast, cumulative-distribution equalization, and matching one image's distribution to another's. Sixteen-bit and float data need binning. A hard point is that global statistics are a whole-image dependency: they break streaming, requiring a pass over the data before the adjustment pass.",
    k: ["Global equalization vs local adaptive methods: global is cheap and can wash out regions; local adapts but amplifies noise and needs clip limits.", "Exact counts vs sampled estimates: exact is deterministic; sampling reads far less of a huge image at small cost in accuracy."],
    p: ["Computing statistics inside a streaming pipeline forces a full read first, or silently uses only the first tiles.", "Equalizing a photo with a large black border maps the border to a large share of the range and darkens the subject."],
    v: "Compute a histogram of a synthetic image with known counts and confirm exact agreement across thread counts. Auto-level a low-contrast image and confirm the output spans the intended percentile range.",
    dep: ["work-scheduler","sample-types-and-bit-depth","lazy-evaluation"]
  },
  "white-balance": {
    s: "Corrects the color cast of the light source by scaling channels so that a neutral object appears neutral.",
    d: "Gains are estimated by sampling a reference gray patch, by assuming the average scene color is gray, by finding the brightest region, or from camera-recorded multipliers. The correction is best applied to linear sensor-like data, as a diagonal scaling or a chromatic adaptation transform in a cone response space. Applied to encoded data it works poorly for highlights. The difficulty is estimation: scenes dominated by one color fool automatic methods, and gains can push channels beyond the representable range.",
    k: ["Gain scaling in camera space vs adaptation in a perceptual space: camera space is simple and physically motivated; a cone-space transform keeps colors more natural across large shifts.", "Automatic estimation vs user-provided reference: automatic needs no input and fails on dominant colors; a reference is accurate but needs one."],
    p: ["Applying gains after clipping makes blown highlights take a pink or green tint.", "Gray-world assumption on a photo of a red wall removes the red and gives the entire scene a blue cast."],
    v: "Photograph a gray card under tungsten light, set balance from the card, and confirm gray patch RGB values are within a few code values of equal, and that a second image under the same light is corrected identically.",
    dep: ["color-space-model","transfer-functions","channel-mixing"]
  },
  "channel-mixing": {
    s: "Builds each output channel as a weighted sum of input channels, which covers grayscale conversion, channel swaps, color matrices and color space rotations.",
    d: "A three-by-three or four-by-four matrix multiplies each pixel vector, executed efficiently on vector units. Grayscale conversion uses luminance weights that depend on the color primaries and should be applied in linear light for physical accuracy, though many tools use encoded values. Matrices are also the core of conversions between linear spaces with different primaries. The hard parts are choosing the right weights for the space, handling out-of-range results and keeping a single definition of luminance across the library.",
    k: ["Luminance in linear light vs encoded values: linear is accurate for light intensity; encoded matches legacy grayscale and gives a different look.", "Clamping outputs vs keeping out-of-range values in float: clamping is simple; keeping them preserves information for later steps at the cost of floating-point formats."],
    p: ["Using equal weights for grayscale makes saturated blue and green look wrong compared with human brightness perception.", "Matrix coefficients for the wrong primaries produce a subtle but systematic hue shift."],
    v: "Convert a set of saturated primary patches to gray and confirm the values match published luminance for the working space within one code value. Apply a channel swap twice and confirm the original is restored exactly.",
    dep: ["color-space-model","simd-kernels","sample-types-and-bit-depth"]
  },
  "dithering-and-quantization": {
    s: "Reduces the number of distinct values, as when converting to a lower bit depth or a limited palette, using error spreading to avoid visible banding.",
    d: "Plain rounding to fewer levels causes bands in smooth gradients. Ordered dithering adds a repeating threshold pattern before rounding. Error diffusion pushes each pixel's rounding error onto unprocessed neighbors, which is sequential and hard to parallelize. Palette quantization chooses a limited set of representative colors with clustering methods and maps pixels to them. Hard parts are perceptual error measures, determinism across threads and avoiding flicker between frames in animations.",
    k: ["Ordered dithering vs error diffusion: ordered is parallel and stable between frames; diffusion gives smoother results and is sequential with possible worm artifacts.", "Fixed palette vs adaptive palette: fixed is fast and consistent across frames; adaptive fits the image and can change from frame to frame in animations."],
    p: ["Error diffusion across tile boundaries restarts at each tile and produces visible seams.", "Dithering a gradient before a lossy encoder wastes bits since the codec removes the pattern."],
    v: "Reduce a smooth gradient from sixteen bits to eight and then to four, and confirm that without dithering distinct bands appear and with dithering the local average matches the original within half a level.",
    dep: ["sample-types-and-bit-depth","indexed-color-coding","lookup-tables"]
  },
  "hdr-tone-mapping": {
    s: "Compresses images with a very wide brightness range into the limited range of a display while preserving local contrast and a natural look.",
    d: "Scene-referred floating-point data can span many orders of magnitude. Global operators apply one curve to all pixels. Local operators separate a base layer of large-scale brightness from a detail layer using an edge-preserving filter, compress the base and recombine, or work in a pyramid. The result then goes through the display transfer function. The hard parts are halos near strong edges, preserving color saturation after compression, and consistency between frames and tiles, since adaptation may depend on global statistics.",
    k: ["Global operator vs local operator: global is fast, stable and flat in contrast; local reveals shadow and highlight detail and risks halos and an unnatural look.", "Tone map in luminance and rescale color vs per-channel: luminance keeps hue; per-channel is simple and desaturates or shifts highlights."],
    p: ["Normalizing by the brightest pixel makes one specular highlight darken the entire image.", "Local operators computed per tile give each tile its own exposure and visible seams."],
    v: "Map a bracketed high dynamic range scene and confirm that both a window-lit exterior and dark interior retain visible detail, no halos exceed a stated width at a high-contrast edge, and tiled and whole-image runs match.",
    dep: ["tone-curves","gaussian-blur","histogram-operations","transfer-functions"]
  },
  "operation-graph": {
    s: "A directed graph in which each node is an operation and each edge an image flowing between them, built by the caller and executed only when a result is needed.",
    d: "Calling an operation does not compute pixels; it creates a node holding its inputs and arguments and returns a handle. The graph can be inspected, rewritten and cached by node identity. At output time, the runtime walks backward from the sink to determine what must be computed. Nodes carry metadata: output size, format, how much input neighborhood each output pixel needs and whether access must be sequential. Hard part: correct metadata for every operation, since the optimizer trusts it.",
    k: ["Graph of immutable nodes vs imperative buffer updates: immutable nodes allow sharing, caching and replay; they allocate more objects and hide when work happens.", "Graph building separate from execution vs eager execution: separation allows optimization and streaming; errors surface far from their cause."],
    p: ["A node that holds a reference to a large input keeps the entire source image alive after the caller thinks it is released.", "Reusing one handle in two branches computes upstream work twice unless a cache node exists."],
    v: "Build a graph with a shared upstream node feeding two outputs, run both, and use instrumentation to confirm the shared operation executed once per tile. Dump the graph and confirm node count matches the calls.",
    dep: ["operation-registry","reference-counting"]
  },
  "lazy-evaluation": {
    s: "Defers all pixel computation until an output is written or read, so only the regions and operations that affect the result are ever executed.",
    d: "An evaluation request names a sink and a region. The runtime asks each node for the tiles or lines needed, which recursively request their inputs. Unused branches, areas outside a crop, and earlier steps made irrelevant by later ones are never computed. It enables streaming from file to file with bounded memory. The difficulty is predictability: the point where errors, time and memory appear moves to the first demand, and profiling and debugging require tools that map cost back to the call that created each node.",
    k: ["Demand-driven evaluation vs eager step-by-step: demand-driven skips unused work and streams; eager is simple to reason about and profile.", "Pull from the sink vs push from the source: pull knows exactly which regions are needed; push suits sources that cannot seek, such as network streams."],
    p: ["An error in a loader appears during the final save, long after the file was opened and with no hint which input failed.", "Calling a property query that forces evaluation silently decodes the whole image."],
    v: "Open a large image, crop a small corner and save it, then measure the bytes read and decoded. Confirm they cover only the corner region plus the codec's unit overhead, not the whole file.",
    dep: ["operation-graph","region-propagation","region-decode"]
  },
  "region-propagation": {
    s: "Works backward from a requested output rectangle to compute which input rectangle each operation needs, including the extra border neighborhood operations read.",
    d: "Each operation declares a function from output region to required input region: identity for per-pixel operations, expanded by kernel radius for filters, scaled for resampling, mapped through the matrix for warps. The runtime composes these along the graph so a request for one tile expands to exactly the source pixels required. It is hard because declarations must be conservative and exact: too small yields wrong pixels near tile borders, too large wastes work, and nonlinear mappings need bounding boxes.",
    k: ["Exact rectangle per operation vs conservative bounding box: exact avoids wasted reads; bounding boxes are simpler and always safe for nonlinear warps.", "Declare requirements per operation vs infer by probing: declarations are fast and need author discipline; probing is automatic and slow."],
    p: ["A filter that under-declares its radius by one pixel shows a faint grid of seams only in tiled runs.", "A warp declaring the full image as input forces a whole-image decode for every small tile."],
    v: "Run a pipeline with every operation once whole-image and once in many small tiles, and confirm output is bit-identical. Log requested input regions and confirm they are tight for a pure crop and expanded by the kernel radius for a blur.",
    dep: ["operation-graph","halo-and-overlap"]
  },
  "operation-fusion": {
    s: "Combines adjacent operations into one pass over the pixels so that intermediate images are never written to memory.",
    d: "Per-pixel operations such as format conversion, gain, lookup and channel mixing can be merged into one loop whose body applies all of them while the pixel is in registers. Some systems generate the fused kernel at run time, from a small description of the chain, and compile it for the vector unit. A smaller form merges the matrix operations algebraically. Gains come from memory bandwidth, the main limit on these workloads. Hard: correctness of rounding between steps and the combinatorial number of kernels.",
    k: ["Run-time code generation vs a fixed set of hand-written fused kernels: generation handles any chain; it adds a compiler dependency and warm-up cost.", "Fuse and skip intermediate rounding vs round at every step: skipping is faster and more accurate; it changes results compared with the unfused reference."],
    p: ["A fused path and an unfused path give results that differ by one code value, breaking bit-exact tests and cached comparisons.", "Generating kernels for each unique chain thrashes the compile cache in a service."],
    v: "Run a chain of five per-pixel operations fused and unfused and measure memory traffic with hardware counters, confirming a reduction near the expected factor, with output differences within one code value.",
    dep: ["pipeline-optimizer","simd-kernels","lookup-tables","sample-types-and-bit-depth"]
  },
  "pipeline-optimizer": {
    s: "Rewrites the operation graph before it runs: reordering steps, removing no-ops, choosing cheaper equivalents and inserting conversions only where required.",
    d: "Rules recognize patterns: resize followed by resize collapses to one, a crop moves before an expensive filter, a conversion to a format and back is cancelled, a shrink is replaced by a shrink-on-load request. Rules check metadata to be sure a rewrite is legal. Cost models estimate memory and time. The optimizer also decides which nodes get a cache. It is hard because rewrites change results subtly, so each needs a precise statement of when the output is equivalent, or acceptably close.",
    k: ["Aggressive reordering vs literal execution order: reordering can make a pipeline an order of magnitude cheaper; users expect results identical to the order they wrote.", "Rule-based rewriting vs a cost-based search: rules are predictable and easy to test; search finds better plans and is hard to make deterministic."],
    p: ["Moving a crop before a filter without adding the filter's border changes edge pixels.", "A rule that is correct for 8-bit data silently degrades results for floating-point data."],
    v: "For a corpus of pipelines, execute with the optimizer on and off, and confirm outputs agree within a stated tolerance while the optimized plan reads fewer pixels or runs faster on the ones with obvious redundancy.",
    dep: ["operation-graph","region-propagation","shrink-on-load","operation-fusion"]
  },
  "work-scheduler": {
    s: "Divides output into tiles or bands and runs them across worker threads, with a limit on in-flight work to keep memory bounded.",
    d: "Workers pull output tiles from a queue; each pull triggers the demand-driven evaluation of its input regions. Sinks that need sequential order, such as many encoders, use a window of tiles to reorder results. Threads share caches and buffer pools, so contention is a design issue. The scheduler balances grain size: tiny tiles waste time on overhead and overlap recomputation, large tiles cause load imbalance and cache misses. Deadlocks arise when a sink waits for a tile that cannot be scheduled.",
    k: ["Fixed worker pool vs per-image thread creation: a pool avoids start-up cost; it shares and can be starved by long tasks from other callers.", "Large tiles vs small tiles: large tiles amortize overhead and halo recomputation; small tiles balance load and fit the cache."],
    p: ["A sink that needs rows in order while workers finish tiles out of order buffers unbounded results and exhausts memory.", "Nested parallelism, such as a batch of parallel jobs each starting a thread per core, oversubscribes the machine."],
    v: "Run one large pipeline on one, two, four and eight workers and confirm speedup is near linear to the memory-bandwidth limit, peak memory stays bounded by the window, and the output is identical across counts.",
    dep: ["region-propagation","buffer-pool","tile-cache","memory-budget"]
  },
  "operation-cache": {
    s: "Keeps recently computed results of operations so repeated or overlapping requests reuse them instead of recomputing.",
    d: "Entries are keyed by node identity and region. They are held in a bounded cache with least-recently-used eviction, charged by size against a memory budget. Interactive applications rely on it for panning and zooming; batch jobs rarely benefit. Selective caching, marked by the optimizer on nodes with several consumers, avoids polluting memory with single-use results. The hard parts are choosing what to cache, handling invalidation when an upstream argument changes and avoiding retention cycles.",
    k: ["Cache every node vs only marked nodes: caching everything helps interactive use and evicts useful data; marking requires analysis and covers the common case.", "Cache by region vs by whole image: regions save memory and match tiled access; whole-image entries are simpler and force full computation."],
    p: ["Caches that count only pixel buffers and ignore bookkeeping memory exceed the configured budget in long sessions.", "A changed parameter reuses a stale entry because the key omitted one argument."],
    v: "Pan across a large image twice in an interactive session and confirm the second pass takes far less compute with a cache hit rate over 90 percent, while resident memory stays below the budget after thousands of pans.",
    dep: ["operation-graph","memory-budget","tile-cache"]
  },
  "tile-cache": {
    s: "Holds decoded or computed tiles in memory by position, so repeated access to the same area of a large image does not redo the work.",
    d: "Tiles are fixed-size blocks, commonly between 64 and 512 pixels on a side, stored with their image identity and level. A lookup either returns the buffer or triggers computation and inserts it, with concurrent requests for the same tile coalesced. Eviction follows recent use under a byte budget. For file formats whose own layout is tiled, the cache aligns with it. Hard parts are thread safety under heavy contention, tile-size choice, and keeping the cache from pinning tiles that downstream code still references.",
    k: ["Sharded locks vs one global lock: shards scale with threads; a global lock is simple and becomes the bottleneck on many cores.", "Cache sized to working set vs large generous cache: tight sizing keeps memory predictable but thrashes on wide filters; generous sizing hides cost until memory runs out."],
    p: ["Tile size that does not match the file's block layout makes each lookup decode several blocks and discard most of the output.", "An eviction policy that ignores in-flight tiles evicts data being used and forces a repeat computation."],
    v: "Scan an image in raster order twice with a cache sized for one tile row, and confirm decode counts match the theory, with each tile decoded once per row pass and total memory pinned to the configured budget.",
    dep: ["buffer-pool","memory-budget","reference-counting"]
  },
  "scanline-streaming": {
    s: "Processes an image as a moving window of rows from input to output, so peak memory depends on image width and kernel height rather than the whole picture.",
    d: "A decoder emits rows in order, each operation keeps just the rows it needs, such as a few lines for a vertical filter, and the encoder consumes rows as they are produced. Memory is a handful of rows per stage. Only formats and operations that permit sequential access qualify: many codecs are sequential by design, while rotation, transposition and global statistics require random access or a full read. It is hard when a pipeline mixes sequential and random-access nodes, and the planner must insert a full buffer.",
    k: ["Strict sequential streaming vs random-access tiles: sequential is minimal in memory and works from pipes; tiles allow rotation and arbitrary access with more machinery.", "Row windows per stage vs one shared window: per-stage windows are simple; sharing reduces copies and complicates ownership."],
    p: ["One non-sequential operation in the middle makes the planner buffer the entire image without any warning to the caller.", "Reading rows out of order from a sequential decoder triggers a hidden restart of the decode."],
    v: "Convert a hundred-megapixel image through blur and resize in streaming mode and confirm peak resident memory is a small multiple of row width times kernel height, and output equals the non-streaming result.",
    dep: ["lazy-evaluation","separable-kernels","region-decode"]
  },
  "halo-and-overlap": {
    s: "Extra border pixels that each tile reads beyond its own area so neighborhood operations produce the same result as if the whole image were processed at once.",
    d: "A filter with radius r needs r extra pixels on every side of a tile. A chain of filters accumulates: the halo is the sum of the radii of all stages, and tiles recompute overlapping areas, so small tiles with large halos waste much work. Strategies are to read overlapping source regions, to exchange borders between neighboring tiles, or to process strips. At the true image edge the border rule applies instead. The hard part is exactness: any mismatch produces a visible grid.",
    k: ["Recompute overlap per tile vs exchange borders between tiles: recomputation is simple and parallel; exchange saves work and creates dependencies between neighbors.", "Large tiles vs small tiles: large tiles dilute halo cost; small ones improve cache fit and balance."],
    p: ["Halo sizes are computed for a filter but not for the downstream resampler, so seams appear only when both are chained.", "A pipeline of several large blurs makes the halo larger than the tile and the work several times what is useful."],
    v: "Run a three-filter chain over a random-noise image in 64-pixel tiles and as a single piece and confirm every pixel is identical, including pixels adjacent to tile boundaries and the true image edge.",
    dep: ["region-propagation","crop-and-extend"]
  },
  "image-pyramids": {
    s: "A stack of successively half-sized copies of an image, used to display or analyze large images quickly at any zoom level.",
    d: "Each level is a filtered, downsampled version of the one below. Viewers pick the level nearest the display scale and fetch only visible tiles. Pyramids are stored in the file, as in tiled multi-resolution formats, or generated on demand and cached. They also support multi-scale algorithms such as blending and feature detection. The costs are about one third extra storage and the build time. Hard parts are the downsampling filter, consistency of edges for odd sizes and keeping levels in sync after edits.",
    k: ["Store pyramid levels in the file vs generate on demand: stored levels give instant zoom and bigger files; on-demand saves space and delays first view.", "Box filter vs better downsampling filter: box is fast and aliases; better filters give a cleaner zoomed-out view at higher build cost."],
    p: ["An edited base image keeps old pyramid levels, so zoomed-out views show content that no longer exists.", "Odd dimensions round differently per level and shift content by a pixel at deep zoom."],
    v: "Generate a pyramid for a large image and confirm each level is half the previous size, rounded as documented, and that the top level equals a direct high-quality reduction within a small error.",
    dep: ["resampling-filters","tile-cache","out-of-core-storage"]
  },
  "out-of-core-storage": {
    s: "Keeps pixel data of working images in temporary files or mapped storage when it exceeds memory, with tiles paged in and out on demand.",
    d: "When an intermediate cannot stream, such as for a rotation of a huge image, the runtime writes it to disk in a tiled layout and reads tiles back as needed. The layout is chosen for the expected access pattern. Operating system paging may be used through memory mapping, or a library-managed spill with explicit eviction. Temporary files need cleanup after crashes and must live on fast storage. The challenge is I/O cost, which is orders of magnitude above memory and dominates run time.",
    k: ["Library-managed spill vs relying on virtual memory paging: library control lets it evict smartly and bound I/O; paging is automatic and can thrash unpredictably.", "Tiled temporary layout vs row-major temporary: tiled suits random access; row-major suits sequential passes and rotations are painful."],
    p: ["Temporary files left behind after a crash accumulate and fill the disk of a service.", "Spilling to a slow network volume makes a job run hundreds of times slower than expected."],
    v: "Rotate an image larger than available memory with the budget lowered and confirm the job completes, spills to a temporary file, deletes it on exit and on forced termination at the next start, and output matches a high-memory run.",
    dep: ["tile-cache","memory-budget","memory-mapped-input"]
  },
  "region-decode": {
    s: "Decodes only a selected rectangle of a file, or a reduced resolution of it, by seeking to the independently coded blocks that cover that area.",
    d: "Formats that code tiles or strips independently, with an index of offsets, allow decoding just the needed blocks. Others, such as sequential block codecs, can skip whole entropy-coded rows but must still parse to reach the region. Some formats store multiple resolutions and decode quality layers selectively. The decoder interface needs a region-and-scale request, and the cache must understand partial results. Hard parts are formats with no random access, where the decoder has to fall back to a full decode.",
    k: ["Independent tiles with an offset table vs a single entropy stream: tiles allow direct access and cost compression efficiency; a single stream compresses better and forbids random access.", "Region request in the codec interface vs decode and crop: the request saves work and complicates every codec; decode and crop is trivial and slow."],
    p: ["A codec silently ignores the region request and decodes everything, so a thumbnail service runs far slower than expected.", "A region decode at the edge of a block returns pixels that differ from the full decode due to filtering at block borders."],
    v: "Request a small rectangle from a very large tiled file and confirm bytes read and decode time scale with the rectangle area, and that pixels equal the same area from a full decode.",
    dep: ["codec-registry","tile-cache","transform-lossy-coding","wavelet-coding"]
  },
  "pixel-format-model": {
    s: "The description of how one pixel is stored: its channels, sample type, bit depth, color interpretation and alpha, which every operation inspects before running.",
    d: "A format record names the channel count, the sample type, such as unsigned integer or float, the interpretation, such as gray, RGB, CMYK or lab, and flags for alpha and premultiplication. Operations declare which formats they support; the planner converts the rest. A small set of internal formats keeps the code manageable, while an open set increases fidelity. The challenge is combinatorial: every operation times every format is too many kernels, so libraries pick a canonical working format.",
    k: ["Few canonical internal formats vs native support for many: few formats mean fewer kernels and conversions on load; many preserve fidelity and multiply code.", "Interpretation stored with the image vs implied by channel count: explicit interpretation prevents misreading data; implied is simpler and wrong for non-RGB images."],
    p: ["A four-channel image treated as RGBA that is actually CMYK produces garish colors with no error.", "Converting through a lower-precision canonical format loses data from a sixteen-bit source."],
    v: "Load images of each supported format, round-trip them through the canonical working format and back, and confirm values are bit-identical for lossless pairs and within documented error for the rest.",
    dep: ["sample-types-and-bit-depth","channel-layout","alpha-premultiplication"]
  },
  "sample-types-and-bit-depth": {
    s: "The numeric type of each channel value, from 1-bit masks to 8, 16 and 32-bit integers and half or single precision floating point, and how values map to intensity.",
    d: "Integer types map a fixed range to zero through one, with the maximum value meaning full intensity. Floating point formats keep values outside zero to one, which holds highlights above white and negative values from filters. Operations pick an accumulator type wide enough for sums, and scaling rules define how a value changes meaning between depths. It is hard because rounding and clamping policy is spread through the library, and moving between 8 and 16 bits requires a precise rule such as replicating bits or multiplying.",
    k: ["Float working precision vs 16-bit integers: float avoids clamping and rounding drift and uses more memory and bandwidth; 16-bit integer is compact and can clip.", "Round to nearest vs truncate when narrowing: rounding is unbiased and costs an add; truncation is cheap and darkens images across repeated passes."],
    p: ["Widening 8 to 16 bits by shifting leaves white at 65280 instead of 65535, so white is not white.", "Accumulating in the sample type overflows when summing a kernel, wrapping bright values to black."],
    v: "Convert a 256-step ramp from 8 to 16 bits and back and confirm all steps are restored, with 255 mapping to 65535 exactly. Blur a full-white image in each type and confirm it stays full white.",
    dep: ["pixel-format-model"]
  },
  "channel-layout": {
    s: "How channels are arranged in memory: interleaved, with all channels of a pixel adjacent, or planar, with each channel in its own array.",
    d: "Interleaved storage keeps a pixel's channels together, which suits per-pixel operations and display. Planar storage keeps channels apart, suiting codecs that process luminance and chroma separately and vector code that works on one channel at a time. Some formats use semi-planar compromises. Channel order, such as red-green-blue or blue-green-red, differs by platform and API. Hard parts are the number of conversions between layouts and a vector kernel for each, and avoiding repeated shuffling in a pipeline.",
    k: ["Interleaved vs planar internally: interleaved is cache friendly for color math and matches display; planar suits separable filters and codecs, and complicates alpha handling.", "Fixed channel order vs flexible order flag: fixed order simplifies kernels; flexible avoids conversion on platforms with a native order."],
    p: ["Swapped red and blue channels from an API's native order give blue skin tones and go unnoticed in tests using gray images.", "A planar-to-interleaved conversion in the middle of every operation negates vector gains."],
    v: "Pass a test image with distinct, known values in each channel through every layout conversion pair and back, and confirm the channels land in the expected positions and survive unchanged.",
    dep: ["pixel-format-model","stride-and-alignment"]
  },
  "alpha-premultiplication": {
    s: "Whether stored color values are already multiplied by opacity, which determines how blending and resampling treat the edges of transparent objects.",
    d: "With straight alpha, color and opacity are independent; with premultiplied alpha, color is scaled by opacity. Premultiplied values make blending a single multiply-add and let filters average correctly, because fully transparent pixels contribute nothing. Straight alpha preserves exact color under low opacity and is the usual file representation. Libraries convert to premultiplied form before resampling or compositing and back at output. The hard parts are precision at low alpha, division by zero when unpremultiplying and tracking which form each image is in.",
    k: ["Premultiply for processing vs process straight alpha directly: premultiplied is correct for filtering and blending; straight avoids conversions and produces halos.", "Track the state as a format flag vs convention by operation: a flag prevents double conversion; a convention is simpler and error-prone."],
    p: ["Resizing a logo with a transparent background in straight alpha bleeds black or white into the edges as a fringe.", "Premultiplying an 8-bit image with low opacity loses most color precision, visible after unpremultiplying."],
    v: "Resize a red circle on a transparent background and composite it on white, and confirm the edge shows only red-to-white blends with no dark ring. Premultiply and unpremultiply at full opacity and confirm exact identity.",
    dep: ["pixel-format-model","sample-types-and-bit-depth"]
  },
  "chroma-subsampling": {
    s: "Stores color information at lower resolution than brightness, exploiting the eye's lower sensitivity to color detail, as in half-width or half-height chroma planes.",
    d: "Images are converted to a luminance plus two color-difference channels, and the color channels are reduced in size, commonly by half horizontally or in both directions. Decoders must upsample them again, with filtering choices that affect sharp colored edges. Layouts and the siting of chroma samples relative to luminance vary, which shifts colors if misread. A library must decide whether to expose subsampled planes or always return full-resolution data, and avoid needless upsample and downsample cycles when re-encoding.",
    k: ["Keep subsampled planes through lossless edits vs always convert to full resolution: keeping preserves quality and speed; converting is simple and costs memory and a quantization step.", "Simple replicate upsampling vs smooth filtered upsampling: replicate is fast and blocky at colored edges; filtered is smoother and costs time."],
    p: ["Assuming the wrong sample siting shifts color edges by half a chroma pixel, a subtle fringe visible on red text.", "Repeated decode and encode at half chroma resolution degrades colored edges each generation."],
    v: "Decode a red-on-white text image with half-resolution chroma, upsample, and confirm edges have no color shift beyond a stated tolerance and that a decode-encode cycle without changes preserves chroma planes exactly.",
    dep: ["pixel-format-model","channel-layout","transform-lossy-coding"]
  },
  "stride-and-alignment": {
    s: "The distance in bytes between the starts of consecutive rows, which may exceed the row's pixel data so that each row begins at an aligned address.",
    d: "Rows are padded so that vector loads are aligned and so a window into a larger image can be represented without copying: a sub-image shares the parent's memory with the same stride and a different base. Code must always use the stride, never width times pixel size. Alignment affects vector speed and some hardware requires it. Hard parts are the many bugs from assuming contiguous rows, negative strides for flipped images, and padding bytes that contain stale data and leak into hashes.",
    k: ["Padded rows with a stride vs tightly packed rows: padding gives aligned vector access and zero-copy crops; packed rows are simple and need copies for sub-images.", "Support negative strides vs normalize by copying: negative strides give free vertical flips; they complicate every kernel and are often unsupported."],
    p: ["A function that assumes packed rows reads the wrong pixels from a cropped view and works only on whole images.", "Hashing buffers including row padding makes identical images compare different."],
    v: "Run each operation on a full image and on a one-pixel-offset sub-view with odd width, and confirm the sub-view result equals the matching region of the full result, with no reads outside the buffer under a memory checker.",
    dep: ["channel-layout","copy-on-write"]
  },
  "format-conversion": {
    s: "Translates pixels between formats: changing depth, layout, channel count and interpretation, with defined rounding, scaling and handling of alpha.",
    d: "Conversions are the glue of a pipeline. Common ones are widening, narrowing, adding or removing alpha, gray to color, color to gray, and between encodings. Each is a specialized kernel; rare pairs go through the canonical working format. The planner inserts them where an operation does not support its input, and minimizes the count. Hard parts: policy questions such as how to flatten alpha onto a background, which luminance weights to use, and keeping lossless pairs exactly invertible.",
    k: ["Direct kernels for common pairs vs routing everything through one canonical format: direct is fast and exact; canonical is far less code and may lose precision or time.", "Implicit conversion vs explicit conversion required from the caller: implicit is friendly and hides cost; explicit surprises beginners and makes cost visible."],
    p: ["Removing alpha by dropping the channel leaves color values from transparent areas, which show up as unexpected content.", "A hidden conversion to 8 bits in the middle of a 16-bit pipeline quantizes the whole result."],
    v: "Convert between every supported pair of formats on a ramp and checker image, and confirm lossless pairs round-trip exactly, the planner logs conversions, and a pipeline of sixteen-bit operations contains none to lower depth.",
    dep: ["pixel-format-model","sample-types-and-bit-depth","alpha-premultiplication","simd-kernels"]
  },
});
