// Details for the image processing plate, part 3: color management, metadata and animation, codecs.
ATLAS.details("image-processing", {
  "color-space-model": {
    s: "The definition of what a set of channel numbers means as color: the primaries, white point and transfer function, carried with each image.",
    d: "A color space fixes the chromaticity of its primaries, its reference white and how numbers relate to light. Each image carries a space, either from an embedded profile or a named standard, or is tagged unknown. Operations that mix colors need to know it: blending, blurring and resizing give different results in different spaces. The library keeps a registry of known spaces and a way to describe custom ones. Hard parts are untagged images, where a default must be guessed, and ensuring that every operation preserves or updates the tag.",
    k: ["Tag every image with a space vs assume one default: tagging is correct and demands care in every operation; assuming is simple and wrong for wide-gamut or print images.", "Named standard spaces vs profiles only: named spaces are fast and unambiguous; profiles cover cameras and printers at higher cost."],
    p: ["An untagged wide-gamut photo is treated as the default small space and looks dull and desaturated on every display.", "An operation creates a new image and forgets to copy the space tag, so downstream conversion is skipped."],
    v: "Load images tagged with three different spaces, apply an operation that creates a new image, and confirm the output reports the same tag. Display each and compare against a reference rendering from a managed viewer.",
    dep: ["transfer-functions","pixel-format-model"]
  },
  "transfer-functions": {
    s: "The curve that maps stored values to light intensity, such as the encoding gamma, and the reverse needed to do arithmetic on real light.",
    d: "Encoded values distribute precision according to how the eye perceives brightness, so they are not proportional to physical light. Blending, blurring and resizing are physically right only on linear values. Implementations convert with an exact piecewise curve or a power function, through a lookup table for 8-bit data or math for float. High dynamic range encodings use curves designed for much brighter ranges. The decision of where in a pipeline to be linear is central to quality.",
    k: ["Operate in linear light vs encoded values: linear is physically correct and needs more bits and conversions; encoded is cheaper and shows dark edges and shifted gradients.", "Exact piecewise curve vs simple power approximation: exact matches the standard to the last bit; approximation is faster with small deviations in darks."],
    p: ["Averaging encoded values when downscaling makes a black-and-white stripe pattern darker than a mid-gray average should be.", "Converting to linear in 8 bits crushes shadow detail because few codes remain near black."],
    v: "Downscale a fine black-and-white checkerboard by sixteen in each mode and confirm linear-light output measures close to mid-gray 50 percent light, while encoded-value output is visibly darker.",
    dep: ["lookup-tables","sample-types-and-bit-depth"]
  },
  "icc-profiles": {
    s: "Standard files describing how a device's numbers map to a device-independent color space, embedded in images and used to convert between devices.",
    d: "A profile contains either matrices and curves for simple display-like devices or multi-dimensional lookup tables for printers and complex cameras, with tags for intent and a connection space. Parsing must be robust because profiles come from untrusted files and can be malformed or enormous. The library extracts, validates, caches and transforms through them. Hard parts are profile variety and versions, quality differences between them, and embedded profiles that are wrong, so a policy is needed to decide when to trust them.",
    k: ["Embed profile in output vs convert to a standard space and tag by name: embedding preserves intent and adds bytes per file; a standard space is small and loses wide-gamut data.", "Strict profile validation vs tolerant parsing: strict rejects broken but usable profiles; tolerant works with more files and risks wrong colors."],
    p: ["A damaged profile is accepted and gives a strange but plausible color shift that nobody notices until printing.", "Embedding a large printer profile in every thumbnail multiplies file size many times."],
    v: "Convert a test chart through a set of known profiles using the library and a reference implementation, and confirm color differences stay below a stated delta-E. Feed truncated profiles and confirm clean rejection.",
    dep: ["color-space-model","conversion-engine","untrusted-input-parsing"]
  },
  "gamut-mapping": {
    s: "Decides what to do with colors that a target space cannot represent, by clipping, compressing or desaturating them toward the closest displayable color.",
    d: "Converting from a wide space to a narrow one yields values outside the target range. Clipping each channel is simplest and changes hue and loses gradations in saturated areas. Better methods compress chroma toward the neutral axis while holding hue and lightness, working in a perceptual space, or use a smooth knee that begins before the boundary. Black point compensation matters for dark colors. The hard parts are perceptual quality, speed per pixel and keeping the mapping continuous so gradients do not break.",
    k: ["Clip vs compress: clipping is fast and preserves in-gamut colors exactly; compressing keeps relationships between out-of-gamut colors and slightly shifts everything.", "Mapping in a perceptual space vs in device channels: perceptual space holds hue better; device channels are cheap and distort."],
    p: ["Clipping a saturated sunset in a wide gamut photo flattens the reds into one solid patch.", "A mapping with a discontinuity creates visible contours in smooth saturated gradients."],
    v: "Convert a saturated gradient from a wide to a narrow gamut and confirm the output stays smooth, hue drift stays below a stated angle, and in-gamut colors remain identical to a clip-only conversion.",
    dep: ["color-space-model","rendering-intents","conversion-engine"]
  },
  "rendering-intents": {
    s: "The policy choosing how out-of-gamut colors and white points are treated during a profile conversion: perceptual, relative colorimetric, saturation or absolute.",
    d: "Intent selects among tables in a profile or among algorithm variants. Perceptual compresses the whole gamut to keep relationships. Relative colorimetric keeps in-gamut colors exact, clips others and maps the white point to the destination's white. Absolute keeps white as measured, for proofing. Saturation favors vivid colors for graphics. Black point compensation is a related option. Hard because profiles may support only some intents and silently substitute another, and the default most tools choose is a compromise.",
    k: ["Perceptual vs relative colorimetric: perceptual keeps smooth tone relationships in photos at the cost of accuracy; relative keeps exact colors for logos and brand tones.", "Fixed default intent vs per-job choice: a default is simple; per-job control is needed for print workflows and gets ignored."],
    p: ["Requesting an intent that the profile lacks silently falls back to another, so two machines give different results.", "Using absolute intent for display output leaves a visible yellow paper-white tint."],
    v: "Convert a chart with in-gamut and out-of-gamut patches using each intent and confirm that in-gamut patches stay exact only under relative colorimetric, while the others move as documented.",
    dep: ["icc-profiles","gamut-mapping"]
  },
  "conversion-engine": {
    s: "Executes the actual per-pixel color transformation between spaces, compiled from a source and destination description into a fast pipeline of matrices, curves and tables.",
    d: "Given two color descriptions, the engine builds a chain: linearize, matrix to a connection space, matrix or table to the destination, then encode. It collapses the chain where possible into a single three-dimensional lookup table with interpolation for complex cases, or a matrix and curves for simple ones. Transforms are cached by their source and destination pair. Hard parts are accuracy against speed in table size, handling of float and out-of-range values, and thread-safe reuse of a built transform.",
    k: ["Exact chain per pixel vs baked lookup table with interpolation: exact is precise and slow; a table is fast with controlled interpolation error.", "Build a transform per image vs cache by color-space pair: caching removes setup from small-image workloads; it costs memory and a lookup key."],
    p: ["A coarse lookup table shows visible banding in smooth gradients near saturated colors.", "Rebuilding a transform for every thumbnail dominates run time, since building costs more than applying it to a small image."],
    v: "Convert a sweep of gray and saturated colors through the engine and compare with a double-precision reference, confirming error stays under half a code value, and that a second conversion with the same pair performs no build.",
    dep: ["color-space-model","transfer-functions","icc-profiles","lookup-tables","simd-kernels"]
  },
  "working-space-policy": {
    s: "The library's rule for which space operations run in and what happens at load and save: convert on input, process in one space, convert on output.",
    d: "A policy specifies a working space, often linear with wide primaries for quality, or the image's own space for speed. On load, images with a profile or tag are converted; untagged images get a default. On save, the output space is chosen by the caller or follows the input. Operations assume the working space. The policy must handle images that differ in space within one pipeline, such as a watermark combined with a photo, and deal with embedded profiles on output.",
    k: ["Convert to one linear working space vs process in the native space: one space gives consistent, accurate math; native avoids conversions and rounding and mixes inconsistently.", "Convert untagged images to a default on load vs pass through untouched: default conversion keeps pipelines uniform; passthrough preserves bytes and risks wrong colors."],
    p: ["Compositing images in different spaces without conversion yields a watermark that is a different color than intended.", "Converting to a working space and back on every load and save of a no-op pipeline changes the pixels."],
    v: "Run a no-operation load and save of tagged images in several spaces and confirm output pixels and tag are unchanged. Composite two differently tagged images and confirm both are converted into the working space first.",
    dep: ["color-space-model","conversion-engine","sample-types-and-bit-depth"]
  },
  "exif-metadata": {
    s: "Structured camera and capture data stored in image files: exposure settings, time, orientation, lens, and location, in tagged binary tables.",
    d: "The data is a tree of directories of typed tag entries with offsets to values, sometimes with vendor-specific blocks in undocumented layouts. Readers must handle byte order, offsets that point outside the data, repeated and conflicting entries, and thumbnails embedded as sub-images. Writers must rebuild offsets and keep unknown blocks intact if asked. The hard parts are robustness, since it is a common source of parser bugs, privacy, because location and device serial numbers leak, and round-trip fidelity of unknown tags.",
    k: ["Parse fully into a model vs keep as an opaque block: a model allows editing and queries; opaque blocks preserve bytes exactly and permit only copy or drop.", "Rewrite offsets on edit vs patch in place: rewriting is safe for any change; in place is minimal and breaks when a value grows."],
    p: ["A tag whose offset points beyond the block causes an out-of-bounds read in a naive parser.", "Cropping a photo leaves the original embedded thumbnail, which still shows the removed part of the image."],
    v: "Parse a corpus of files from many cameras, rewrite the metadata and confirm all known tags survive and unknown vendor blocks are byte-identical. Feed fuzzed headers and confirm no crash and bounded memory.",
    dep: ["untrusted-input-parsing","metadata-policy","embedded-previews"]
  },
  "xmp-and-iptc": {
    s: "Descriptive and rights metadata, such as titles, keywords, creator and copyright, stored as an XML packet or a legacy binary block inside or beside the image.",
    d: "XMP is an XML document embedded in the file, and the older block stores captions and keywords in a record format. The same fact can appear in several places, such as a creator in both, so the library needs a reconciliation rule. Packets can be large, nest arbitrarily and may be stored in a sidecar file. Editing needs padding to avoid rewriting the file. Hard parts are the XML parser's attack surface, character encodings, and reconciling duplicates.",
    k: ["Embedded packet vs sidecar file: embedded travels with the image and needs file rewriting; sidecar is simple to edit and gets separated from the image.", "Reconcile duplicate fields on write vs preserve each block independently: reconciling keeps them consistent; independent copy preserves exact originals."],
    p: ["An XML parser that expands entities lets a small packet use gigabytes of memory.", "Editing a keyword in one block but not the other leaves different viewers showing different values."],
    v: "Set a title and keywords, save, and read back in the library and a second independent reader, confirming both blocks agree. Load an entity-expansion test packet and confirm rejection under a fixed memory cap.",
    dep: ["untrusted-input-parsing","metadata-policy"]
  },
  "metadata-policy": {
    s: "The rule for which metadata survives each operation and save: keep everything, keep a safe subset, or strip all, with special handling for color profiles and orientation.",
    d: "Resizing, converting and re-encoding all produce a new image, so the library decides which fields to carry across. Some must be updated, not copied: pixel dimensions, orientation after rotation, and thumbnails. Some are required for correct display, such as the color profile. Others are sensitive: location, device serial and author names. A policy engine applies defaults, with per-call overrides. The difficulty is that the privacy-safe choice, stripping everything, also removes the color profile and rights information, so it needs an allowlist.",
    k: ["Strip all by default vs keep all by default: stripping protects privacy and loses color profile and copyright; keeping preserves information and leaks personal data.", "Allowlist of fields vs denylist: an allowlist is safe against new fields; a denylist is easier to explain and misses what it did not anticipate."],
    p: ["A service that strips all metadata also removes the profile, so wide-gamut images appear dull after resize.", "A copied orientation tag with rotated pixels turns the image on its side in some viewers."],
    v: "Process a photo with location, profile and orientation through the strip policy and confirm the output contains no location, still carries the profile, and displays upright in viewers that honor orientation.",
    dep: ["exif-metadata","xmp-and-iptc","icc-profiles"]
  },
  "embedded-previews": {
    s: "Small preview images stored inside a file, such as thumbnails or full-size previews inside raw files, which can be extracted much faster than decoding the main image.",
    d: "Cameras write a thumbnail and often a mid-size preview into the metadata. Extracting one costs a few kilobytes of reading and a small decode, which makes browsing large collections fast. The library exposes them as images with their own size and orientation, and may generate a fresh preview when saving. Pitfalls are staleness, since an edited image can keep the old preview, quality, since the preview may be a different color space and crop, and size-reporting differences.",
    k: ["Use the embedded preview vs decode the main image for thumbnails: preview is orders of magnitude faster; it may be low quality, differently cropped or wrongly colored.", "Regenerate previews on save vs drop them: regeneration keeps browsers fast and costs time; dropping avoids leaking old content."],
    p: ["A cropped photo keeps the old preview, and file managers show the uncropped picture.", "A preview in a different color space from the main image shows colors that do not match the full view."],
    v: "Extract the embedded preview from a raw file and confirm it appears in a few milliseconds, with dimensions and orientation matching the metadata. Edit and save the file and confirm the preview reflects the new content.",
    dep: ["exif-metadata","metadata-policy","codec-registry"]
  },
  "animation-frame-model": {
    s: "The representation of multiple frames in one file: a sequence with sizes, offsets and durations, or a stack of pages, layers or resolutions.",
    d: "An animated or multi-page image holds a list of frames. Each may be a full image or only the changed rectangle, with an offset in the canvas. The library exposes them either as separate images or as one tall image with a page height, so ordinary operations run per frame by splitting and joining. Frames can differ in size and format, and counts can be large. Hard parts are memory, since decoding all frames at once of a long animation is enormous, and keeping frame metadata through operations.",
    k: ["Frames as a tall strip with page height vs a list of separate images: the strip works with every operation unchanged; a list is flexible and needs new APIs.", "Decode all frames up front vs on demand: all at once is simple to use and huge; on demand is lean and needs sequential access for delta frames."],
    p: ["Loading a long animation decodes every frame into full canvas size and uses gigabytes.", "Resizing a strip treats the whole stack as one image and blends the bottom row of one frame into the next."],
    v: "Load a multi-frame image, apply a resize via the strip model, and confirm each frame is resized independently with no bleed across frame boundaries, durations preserved, and the frame count unchanged.",
    dep: ["frame-disposal-and-timing","pixel-format-model","codec-registry"]
  },
  "frame-disposal-and-timing": {
    s: "The rules for how each animation frame replaces or draws over the previous one, and how long it stays on screen before the next.",
    d: "Frames after the first often hold only the changed region. A disposal rule says what happens to the area afterward: leave it, clear to background, or restore the earlier content. A blend rule says whether a new frame replaces or composites with what is below. Timing is a delay per frame, with some formats clamping very short delays that players round up. Loop count controls repetition. Implementation must compose frames in order, and optimizers rewrite them as deltas. Hard: formats disagree on corner cases.",
    k: ["Compose to full frames on decode vs keep deltas: full frames are easy to process and use more memory; deltas are compact and need a stateful player.", "Honor tiny delays literally vs apply the convention players use: literal is faithful; the convention makes files play at the speed viewers actually show."],
    p: ["Ignoring restore-previous disposal leaves ghost trails of earlier frames in the composed result.", "Zero-delay frames play instantly in one library and at a default rate in another."],
    v: "Compose a test animation that uses each disposal and blend mode and confirm every composed frame matches a reference rendering, and the total duration matches the sum of the delays under the stated convention.",
    dep: ["animation-frame-model","compositing-and-blending","indexed-color-coding"]
  },
  "format-detection": {
    s: "Identifies a file's format by its leading bytes and structure rather than its name, and picks the right decoder.",
    d: "Each codec supplies a signature test, usually magic numbers in the first bytes and sometimes deeper structure, since containers can wrap different codecs. The registry tries them in priority order and passes the first match on. Detection sees only a prefix, so streams need buffering. The name extension is a hint only. Hard parts are polyglot files, which are valid in more than one format, truncated headers, and giving detection a size cap so it cannot be used to waste memory.",
    k: ["Sniff by content vs trust the file extension: content is accurate and reads bytes; extensions are free and wrong whenever a file was renamed or uploaded by an adversary.", "First-match priority vs scoring all candidates: first-match is fast and order dependent; scoring handles ambiguity at more cost."],
    p: ["Trusting an extension passes a file of one format to a decoder for another and crashes or misparses it.", "A polyglot file decoded as one format by the scanner and another by the viewer bypasses a content check."],
    v: "Rename a corpus of files with wrong and missing extensions and confirm each is detected by content. Feed random bytes and truncated headers and confirm a clean unknown-format error with bounded reads.",
    dep: ["codec-registry","untrusted-input-parsing"]
  },
  "codec-registry": {
    s: "The table of installed format handlers, each exposing the same interface for probing, reading headers, decoding and encoding, loaded statically or as plugins.",
    d: "A codec implements a few entry points: test signature, read header into dimensions, format and metadata, decode a region or rows, and encode with options. The pipeline sees only this interface. Codecs may be compiled in, loaded as modules, or run out of process. Options are described in the same self-describing way as operations. Hard parts are keeping a uniform contract over formats with very different capabilities, such as random access, progressive display and multiple frames, and managing third-party decoder dependencies.",
    k: ["Uniform interface with capability flags vs per-format special cases: flags let the pipeline adapt to random access or sequential-only codecs; every codec author must set them correctly.", "In-process codecs vs out-of-process codecs: in-process is fast; out-of-process contains decoder crashes and costs copying."],
    p: ["A codec that claims random access but is sequential makes region requests silently decode everything.", "Each bundled decoder library carries its own security update schedule, and the library ships an old vulnerable version."],
    v: "Enumerate registered codecs and their capability flags, and for each run a conformance test: header read, full decode, region decode if claimed, encode and re-decode, comparing with a reference image.",
    dep: ["format-detection","error-model","sandboxed-decoding"]
  },
  "lossless-predictive-coding": {
    s: "Compresses without any loss by predicting each pixel from its neighbors and entropy-coding the small differences, with no change to decoded values.",
    d: "Rows are filtered so each pixel is replaced by its difference from a prediction, using the left, upper or a blend of neighbors, or an adaptive predictor. The residuals are then compressed with a dictionary or arithmetic coder. Stronger modern coders use context modeling per pixel and image-specific transforms such as palette detection or color decorrelation. The trade-off is time against ratio, and for photographs the ratio is modest. Hard parts: decode speed, memory for the sliding window and fair filter choice per row.",
    k: ["Fixed filter per row vs adaptive per pixel: fixed is fast and simple with weaker compression; adaptive compresses far better and costs time in both directions.", "Dictionary coder vs context-modeled arithmetic coder: dictionary is fast and ubiquitous; arithmetic coding saves more bytes at lower speed."],
    p: ["Choosing the best filter per row by trying all of them makes encoding many times slower for a few percent gain.", "Encoders at maximum effort take minutes per image and are unusable in an upload path."],
    v: "Encode a corpus losslessly, decode and compare to the source bit for bit, record compression ratio against effort level, and confirm decode time stays within the stated bound at every level.",
    dep: ["codec-registry","scanline-streaming","sample-types-and-bit-depth"]
  },
  "transform-lossy-coding": {
    s: "Compresses photographs by transforming small blocks to frequency coefficients, quantizing the high frequencies coarsely and entropy-coding the rest.",
    d: "Images are converted to luminance and color-difference planes, often with subsampled color, and split into small blocks. A discrete cosine transform converts each to coefficients, quantization discards precision according to a table scaled by the quality setting, and a Huffman or arithmetic coder writes the result. Decoding reverses the steps with an inverse transform. The artifacts, blocking and ringing, grow as quality drops. Hard parts are decoder determinism, since inverse transforms differ slightly between implementations, and avoiding generational loss.",
    k: ["Large quality steps with fixed tables vs perceptually tuned adaptive quantization: fixed is simple and predictable; adaptive hides artifacts better and costs encode time.", "Huffman entropy coding vs arithmetic coding: Huffman is fast and universally decodable; arithmetic saves around a tenth of the size and has less support."],
    p: ["Re-encoding a photo repeatedly at the same quality compounds loss, with visible blocks after several generations.", "Different decoders produce outputs that differ by one code value, so exact-hash comparisons fail between machines."],
    v: "Encode a test photo at ten quality levels and confirm size and error metrics change monotonically, decoder output stays within one code value of a reference decoder, and no blocking exceeds a stated threshold at the default quality.",
    dep: ["chroma-subsampling","rate-quality-control","simd-kernels","codec-registry"]
  },
  "wavelet-coding": {
    s: "Compresses by splitting the image into frequency bands at several resolutions with a wavelet transform, then coding each band, which enables scalability and region access.",
    d: "A wavelet transform applied repeatedly produces a small low-resolution image plus detail bands at each scale. Coefficients are quantized and coded in independent code blocks with embedded bitplanes, so a prefix of the data gives a lower-quality or lower-resolution image. Files can be decoded progressively, by region and by resolution without reading everything. The cost is computational complexity and memory, which makes encoders and decoders slower than block-transform coders, and they have less hardware support.",
    k: ["Independent code blocks vs a single global stream: blocks allow region and resolution access and cost some efficiency; global coding compresses a little better and forbids random access.", "Wavelet transform vs block transform: wavelets give scalability and no block artifacts; block transforms are faster and ubiquitously supported."],
    p: ["Decoding a whole large image to produce a thumbnail when the reduced-resolution request could have read a tiny part.", "Slow software decoders make wavelet files unattractive for interactive viewing without a fast path."],
    v: "Decode a large file at full size, half size and a small region, and confirm bytes read and time scale with the amount requested, and the reduced-size result matches a downscale of the full decode within tolerance.",
    dep: ["codec-registry","region-decode","image-pyramids","rate-quality-control"]
  },
  "video-derived-still-coding": {
    s: "Codes still images with intra-frame methods taken from video codecs, which predict blocks from neighbors and use flexible block sizes for higher compression at equal quality.",
    d: "These coders partition the image into a quadtree of variable-size blocks, predict each from adjacent decoded pixels in many directions, transform the residual with several transform types, apply in-loop deblocking and restoration filters, and use context-adaptive arithmetic coding. They are wrapped in a container with metadata, alpha and sometimes multiple images. Compression gains are large over older codecs, at much higher encode cost, and decoders benefit from hardware support. Hard parts: encoder speed, tuning for photos versus graphics, and dependence on hardware features.",
    k: ["Maximum compression effort vs fast encode: slow modes save a quarter of the size and can take seconds per image; fast modes suit uploads and lose some savings.", "Software decode vs hardware decode: software is portable and uses CPU; hardware is efficient and varies by device and limits sizes."],
    p: ["Encoding at maximum effort on a request path adds seconds of latency and blows through timeouts.", "A decoder that lacks support for a rarely used coding tool fails on a valid file from another encoder."],
    v: "Encode a photo corpus at matched perceptual quality against a baseline lossy codec and confirm the file is smaller by the expected margin, decoding takes under a set time on target hardware and output matches the reference decoder.",
    dep: ["codec-registry","rate-quality-control","simd-kernels","chroma-subsampling"]
  },
  "indexed-color-coding": {
    s: "Stores each pixel as an index into a small palette of colors, compressing flat-color graphics very well and often used with animations and transparency.",
    d: "An image carries a palette of up to 256 entries and one small integer per pixel. Indices are compressed with a dictionary coder after optional filtering. Transparency is a flag on one palette entry or an alpha value per entry. Producing such an image from full color requires palette selection by clustering, and dithering to hide the limited colors. Decoding is fast and trivial. Hard parts: quality of the quantizer, palette ordering for compression, and consistent palettes across animation frames.",
    k: ["Global palette vs per-frame local palettes: global is compact and consistent; local palettes reproduce each frame better and cost bytes.", "Optimal palette search vs fast heuristic: search gives visibly better color and takes much longer; heuristic is quick and bands in gradients."],
    p: ["Quantizing a photo to 256 colors without dithering shows bands in the sky.", "Unordered palette indices defeat the compressor's neighbor modeling and bloat files."],
    v: "Quantize a gradient and a logo to indexed form, decode and confirm the logo's flat colors are exact, the gradient error stays under a stated limit with dithering, and transparency is correct against a reference.",
    dep: ["dithering-and-quantization","lossless-predictive-coding","frame-disposal-and-timing"]
  },
  "raw-sensor-decode": {
    s: "Turns camera sensor data, one color sample per photosite behind a color filter mosaic, into a viewable image through demosaicing and color processing.",
    d: "Raw files store linear sensor values with black and white levels, a color filter pattern, white balance multipliers and camera color matrices. Processing subtracts black level, applies white balance, interpolates the missing two channels at every pixel in demosaicing, applies a camera-to-working-space matrix, then a tone curve. Lens corrections and noise handling may follow. Formats are proprietary or poorly documented, and each camera needs its constants. Hard parts: demosaic quality and artifacts, and keeping up with new cameras.",
    k: ["Fast bilinear demosaic vs gradient or learned demosaic: bilinear is fast and shows zippers and false color; advanced methods are cleaner and much slower.", "Camera-supplied tone rendering vs neutral linear output: camera rendering matches the preview; neutral gives full editing latitude and flat-looking images."],
    p: ["A new camera model unknown to the library fails to decode or produces wrong colors until a profile is added.", "Demosaicing artifacts such as maze patterns appear in fine repetitive textures."],
    v: "Decode a raw file of a color chart and confirm patch values are close to reference after the matrix, and a resolution target shows no zipper or false color beyond a stated amount.",
    dep: ["white-balance","color-space-model","exif-metadata","codec-registry","untrusted-input-parsing"]
  },
  "progressive-coding": {
    s: "Stores an image so that a partial read already shows a complete but blurry picture, which sharpens as more data arrives.",
    d: "In a progressive file the data is ordered in scans, each refining all coefficients, or the image is interlaced so every few rows give a coarse view. A decoder can render after each scan. The same layout lets a server cut a file to a lower quality without re-encoding. It costs memory, since coefficients must be held while scans arrive, and slightly more time. Hard parts are decoders that do not support incremental output, and deciding how many intermediate renders to compute.",
    k: ["Progressive vs sequential layout: progressive gives early previews and often smaller files, and needs full buffering of coefficients; sequential streams rows with low memory.", "Render every scan vs only when done: every scan feels responsive and burns CPU; a final render is cheap and shows nothing until complete."],
    p: ["Rendering after every scan on a mobile device spends more time than the download saved.", "Truncated progressive files decode to a blurry image with no error, hiding the damage."],
    v: "Truncate a progressive file at several points and confirm the decoder returns a complete lower-quality image at each, flagged as partial, with quality increasing with the bytes available.",
    dep: ["transform-lossy-coding","scanline-streaming","error-model"]
  },
  "rate-quality-control": {
    s: "Chooses encoder settings to meet a target, either a file size or a perceptual quality, and measures the result with an objective metric.",
    d: "A quality number does not mean the same size or look for different images. Controllers search over quality settings, encoding and measuring, to hit a target score from a metric such as structural similarity or a perceptual distance. Others use a target size and iterate. Content-aware tuning raises quality for smooth areas where artifacts show. Cost is repeated encodes. Hard parts are choosing a metric that tracks human perception, and the trade-off between search iterations and request latency.",
    k: ["Fixed quality setting vs target a perceptual score: fixed is fast and wastes bytes on easy images; targeted gives consistent look and costs extra encodes.", "Metric computed on the whole image vs on regions: whole is simple; regions catch local artifacts and take more computation."],
    p: ["A single global quality value over-compresses detailed images and under-compresses flat ones, with visible damage in some uploads.", "An objective metric that ignores color makes images with hue shifts score as perfect."],
    v: "Encode a diverse corpus with the target-score controller and confirm score variance is much lower than with fixed quality, that average size is below the fixed-quality baseline at equal mean score, and latency stays within budget.",
    dep: ["transform-lossy-coding","video-derived-still-coding","codec-registry"]
  },
});
