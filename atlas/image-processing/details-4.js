// Details for the image processing plate, part 4: decoder security, acceleration, memory, cross-cutting concerns.
ATLAS.details("image-processing", {
  "untrusted-input-parsing": {
    s: "The discipline of treating every byte of an input file as attacker-controlled: validating lengths, offsets and counts before they drive any allocation or memory access.",
    d: "Image formats are full of sizes and offsets read from the file itself. A parser must check each against remaining input and sane bounds, handle integer overflow in size arithmetic, and never trust a count to size a buffer without a cap. Checks are centralized in a bounded reader that fails cleanly instead of reading past the end. State machines for chunked formats must reject impossible orderings. Hard: the sheer number of formats and fields, and the pressure to skip checks for speed in inner loops.",
    k: ["Central bounds-checked reader vs ad hoc checks per field: central checking is uniform and costs a little per read; ad hoc is faster and one missed check becomes a vulnerability.", "Reject any malformed input vs best-effort recovery: rejecting is safe; recovery helps real damaged files and enlarges the attack surface."],
    p: ["Multiplying width, height and channel count in a 32-bit integer overflows to a small buffer that the decode loop then overruns.", "A chunk length larger than the file causes a huge allocation before any data check."],
    v: "Run the decoder under a memory-error checker on a corpus of crafted files with extreme lengths, counts and overflowing dimensions, and confirm every one ends in a clean error with no out-of-bounds access and bounded allocation.",
    dep: ["error-model","dimension-and-memory-limits"]
  },
  "dimension-and-memory-limits": {
    s: "Caps on width, height, total pixels, frame count and metadata size, checked from the header before any buffer is allocated.",
    d: "A decoder reads the header, computes the memory a full decode would need, and compares it with configured limits before allocating. Separate limits cover single dimensions, pixel counts, number of frames, size of metadata and nesting depth. Defaults must be generous enough for real scientific and map images yet safe for a web upload path. Limits can be raised per call for trusted inputs. Hard: choosing defaults, accounting for intermediates, and applying the same limits in every codec.",
    k: ["Strict default limits with explicit opt-out vs unlimited by default: strict protects services by default and surprises users with big legitimate images; unlimited is permissive and unsafe.", "Limit on pixels vs on bytes of memory: pixels are easy to check from the header; bytes account for format and frame count and need arithmetic."],
    p: ["A limit checked in one codec but not another lets a crafted file in the unchecked format exhaust memory.", "Counting only the first frame lets an animation with thousands of frames pass."],
    v: "Feed headers that declare 65535 by 65535 pixels, ten thousand frames and a gigabyte of metadata, and confirm rejection before any allocation beyond a few kilobytes, with an error naming the exceeded limit.",
    dep: ["untrusted-input-parsing","memory-budget"]
  },
  "decompression-bomb-defense": {
    s: "Protects against small files that expand enormously when decoded, such as a huge uniform image that compresses to a few kilobytes.",
    d: "Compressed data can expand by factors of thousands. Header-declared size limits catch most cases, but a decoder must also bound output while running: inflate streams with a maximum, count decoded pixels against the declared total, and stop at a time or CPU limit. Metadata blocks, nested containers and compressed profiles are equally vulnerable. Defense is layered: pre-check, running quota and a wall-clock timeout. Hard: legitimate flat images compress extremely well, so a ratio threshold alone has false positives.",
    k: ["Limit by expansion ratio vs absolute output size: ratio flags bombs early and rejects legitimate blank images; absolute size is predictable and permits a large but bounded bomb.", "In-process time limit vs process kill: in-process limits are cheap and cannot interrupt a tight native loop; killing a process is reliable and costs isolation overhead."],
    p: ["A compressed profile or text chunk inside a valid image expands beyond memory while the pixel limits are satisfied.", "A decoder stuck on a pathological stream consumes a core for minutes with no output."],
    v: "Decode a 10 kilobyte file that expands to 4 gigabytes and a nested compressed metadata bomb, and confirm both abort within a stated time and memory cap with a specific error, while a real blank page image still decodes.",
    dep: ["dimension-and-memory-limits","untrusted-input-parsing","job-resource-limits"]
  },
  "fuzzing-and-sanitizers": {
    s: "Continuous automatic testing of decoders with mutated and random inputs while memory-error detectors watch for out-of-bounds access, leaks and undefined behavior.",
    d: "Coverage-guided fuzzers start from a corpus of valid files and mutate them, keeping inputs that reach new code. Builds with address, memory and undefined-behavior sanitizers turn silent corruption into immediate failures. Each codec has a harness that feeds bytes to the decoder in a loop. Findings are minimized, filed and added to a regression corpus. Hard parts: reaching deep states behind checksums and compressed blocks, harness quality, and running continuously so that new code does not erode what was proven.",
    k: ["Structure-aware fuzzing vs raw byte mutation: structure-aware reaches deep logic and needs a grammar per format; raw bytes are generic and stall at checksums.", "Fuzz each codec library separately vs the integrated pipeline: separate is fast and targeted; integrated finds interaction bugs more slowly."],
    p: ["A fuzz target that disables checksum verification never exercises the real production path.", "Findings that are not minimized and added to a regression corpus come back in a later release."],
    v: "Run the fuzzers for a fixed budget on the current build and confirm coverage grows then plateaus, zero sanitizer failures occur, and every previously found crash input still decodes cleanly in the regression suite.",
    dep: ["untrusted-input-parsing","codec-registry"]
  },
  "sandboxed-decoding": {
    s: "Runs decoders in a restricted process with limited system access, so that a memory-safety exploit in a codec cannot reach files, network or credentials.",
    d: "The parent sends the compressed bytes to a worker through a pipe or shared memory; the worker has no network, no file system access and a restricted set of system calls, and returns pixels or an error. Resource limits cap memory and CPU. Workers can be pooled and recycled after each file. The cost is copying and process management, and codecs that need library state or profiles must receive them explicitly. Hard parts: designing a small safe interface and keeping performance acceptable for small images.",
    k: ["Process isolation vs in-process decoding: isolation contains a compromised decoder and adds latency and copies; in-process is fast and a single exploit owns the host.", "Fresh worker per file vs reused worker: fresh limits cross-file contamination and costs start-up; reuse is fast and a compromise can persist."],
    p: ["A sandbox that still permits network access lets a compromised decoder send data out.", "Shared memory handed to the worker without size checks lets it write over the parent's memory."],
    v: "Run a deliberately malicious test decoder inside the sandbox that tries to open a file, make a network call and exceed memory, and confirm each is denied, the worker is terminated, and the parent continues serving other jobs.",
    dep: ["codec-registry","job-resource-limits"]
  },
  "simd-kernels": {
    s: "Inner loops written with vector instructions that process many pixels or channels per instruction, the main source of speed in filters, conversions and codecs.",
    d: "A vector unit applies one instruction to 8 to 64 byte lanes. Kernels use saturating arithmetic, widening multiplies, shuffles and masked loads to do conversions, convolution, blending and the transforms inside codecs. Data must be laid out for them: aligned rows, planar or well-shuffled channels, padding at edges. Scalar fallbacks must give identical results. Hard parts: writing and testing one kernel per instruction set, edge handling, and rounding semantics that differ between vector and scalar code.",
    k: ["Hand-tuned intrinsics vs compiler auto-vectorization: intrinsics reach peak speed and cost expert effort per target; auto-vectorization is portable and fragile to code shape.", "Process edge pixels in the vector loop vs a scalar tail: scalar tails are simple and slow for narrow images; masked vector tails are fast and complex."],
    p: ["A vector path that rounds differently from the scalar path produces results that vary with image width or alignment.", "Reading a full vector past the end of a row touches unmapped memory and faults at page boundaries."],
    v: "Run every kernel with scalar and each vector path over random data of many widths and alignments, and confirm outputs are bit-identical, with measured throughput near the expected fraction of memory bandwidth.",
    dep: ["stride-and-alignment","runtime-cpu-dispatch","fixed-point-arithmetic"]
  },
  "runtime-cpu-dispatch": {
    s: "Detects the processor's vector features at start-up and routes each operation to the best kernel available on that machine.",
    d: "The library builds several versions of hot kernels for different instruction set levels and stores function pointers. At initialization it queries the processor's feature flags, selects the widest supported version and fills the table. Operating system support for wider registers must also be checked. The decision can be overridden for testing and for reproducibility. Hard parts: build complexity, avoiding dispatch overhead on small inputs, and clock frequency drops on some hardware when the widest instructions run.",
    k: ["Dispatch at run time vs compile for the build machine: run time works on any machine and costs build time and binary size; build-time tuning is simple and breaks on older processors.", "Widest available instructions vs a moderate level: widest has highest peak throughput; a moderate level avoids frequency throttling and may win overall."],
    p: ["A binary built for a newer instruction set crashes with an illegal instruction on older cloud machines.", "Different machines select different kernels, so output hashes vary between servers."],
    v: "Force each dispatch level on one machine and confirm the same test suite passes with identical output hashes, and that on the target hardware the auto-selected level is the fastest in a benchmark.",
    dep: ["simd-kernels"]
  },
  "fixed-point-arithmetic": {
    s: "Uses scaled integers instead of floating point for pixel math, which lets more pixels fit in each vector instruction and gives exact, reproducible rounding.",
    d: "Weights are scaled by a power of two, such as 2 to the 14th, products accumulate in wider integers and the result is shifted back with a rounding offset. Eight-bit pixels and sixteen-bit weights fit commonly available multiply-add instructions. Compared with float it is faster on 8-bit data and deterministic across machines. Hard parts are choosing the scale to avoid overflow while keeping accuracy, handling negative lobes in kernels, and accounting for error that accumulates through several stages.",
    k: ["Integer fixed point vs single-precision float: integer is fast and exact on 8-bit data with limited headroom; float is flexible, handles HDR and costs memory bandwidth.", "More fractional bits vs more headroom: more bits improve precision and risk overflow in sums; headroom avoids overflow and loses precision."],
    p: ["A scale chosen for typical kernels overflows with a sharpening kernel's large negative and positive weights.", "Truncating instead of rounding after the shift adds a half-level bias that darkens every pass."],
    v: "Compare the fixed-point kernel with a double-precision reference across random inputs and extreme kernels, and confirm maximum error is one code value and the average bias is under a hundredth of a level.",
    dep: ["sample-types-and-bit-depth"]
  },
  "lookup-tables": {
    s: "Precomputed arrays that replace calculation with a memory read, used for tone curves, gamma conversion, color transforms and codec tables.",
    d: "A one-dimensional table of 256 or 65536 entries maps each possible value directly, which is faster than computing powers or divides. Three-dimensional tables with interpolation represent color transforms as a grid of samples. Tables are built once, shared and kept small enough for the cache, since a table that misses the cache is slower than math. Vector units use shuffle instructions as small table lookups. Hard parts: table size versus accuracy, building cost, and thread-safe sharing.",
    k: ["Large exact table vs smaller interpolated table: exact is precise and can exceed the cache; interpolated is compact and adds arithmetic and small error.", "Build tables lazily vs at start-up: lazy saves start time and needs thread-safe initialization; start-up is simple and wastes time on unused tables."],
    p: ["A 16-bit table of 64k entries per channel thrashes the cache and runs slower than direct arithmetic.", "Two threads building the same table at once race and one reads half-built data."],
    v: "Time a gamma conversion by table and by direct math on a large image, confirming the table is faster and bit-identical to the exact function at every input value.",
    dep: ["sample-types-and-bit-depth"]
  },
  "gpu-offload": {
    s: "Runs suitable operations as parallel programs on a graphics processor, which is worthwhile for large images and heavy operations.",
    d: "An operation is expressed as a kernel executed by thousands of threads, one per pixel or tile. The library uploads input, dispatches the chain, then downloads the result, or keeps images resident for later operations. It chooses the device per operation using a cost estimate. Fused chains avoid intermediate round trips. Hard parts: multiple backends for different vendors, limits on texture sizes and memory, exact numerical differences from the CPU path and the transfer cost, which can exceed the compute savings.",
    k: ["Keep images on the device across a chain vs transfer per operation: resident is fast and demands a device memory manager; per-operation transfer is simple and often slower than the CPU.", "One portable compute backend vs per-vendor native backends: portable has one code base and trails peak performance; native is faster and multiplies maintenance."],
    p: ["A single cheap operation sent to the device spends more time on upload and download than on the CPU.", "Device memory runs out on a large image and the job fails where the CPU path would have finished."],
    v: "Benchmark a heavy chain on CPU and device across image sizes and confirm a crossover size where the device wins, with outputs within a stated tolerance and the library choosing the CPU below the crossover.",
    dep: ["host-device-transfer","operation-fusion","pipeline-optimizer"]
  },
  "host-device-transfer": {
    s: "Moves pixel data between main memory and accelerator memory, using pinned buffers and overlap with computation to hide the bus latency.",
    d: "Transfers cross a bus much slower than either memory. Pinned host buffers allow direct memory access, and double-buffering lets one tile upload while another is computed and a third downloads. Tiled images map naturally onto this pipeline. Formats may need conversion before upload, since devices prefer specific layouts and sample types. Hard parts: staying within device memory, synchronizing correctly to avoid races, and measuring where the time really goes.",
    k: ["Overlapped double-buffered transfers vs synchronous copies: overlap hides much of the bus time and adds streams and synchronization; synchronous copies are simple and leave the device idle.", "Pinned staging buffers vs pageable memory: pinned is faster and a limited resource; pageable is plentiful and goes through an extra copy."],
    p: ["A missing synchronization lets the download read a buffer before the device finishes writing it, giving rare corrupt tiles.", "Allocating pinned memory for every request exhausts the system's locked pages."],
    v: "Profile a tiled job and confirm that compute and transfer overlap, with device utilization above a stated fraction, total time close to the larger of the two, and output identical across repeated runs.",
    dep: ["buffer-pool","tile-cache","pixel-format-model"]
  },
  "buffer-pool": {
    s: "A reusable stock of image and tile buffers that avoids repeated allocation and zeroing, keeps memory aligned and limits fragmentation.",
    d: "Allocating large buffers per operation from the system allocator is slow, since big blocks are mapped and cleared by the operating system, and fragments the address space. A pool keeps released buffers sorted by size class for reuse, aligned for vector access. A cap bounds total size, and a trim step returns memory to the system when idle. Per-thread pools reduce lock contention. Hard parts: sizing, fragmentation across varied image sizes and giving memory back so a long-running service does not only grow.",
    k: ["Size-class pooling vs exact-size reuse: classes waste some memory and match often; exact reuse wastes nothing and rarely hits when sizes vary.", "Per-thread pools vs one shared pool: per-thread avoids locks and holds memory idle; shared uses memory well and can contend."],
    p: ["A service sees resident memory ratchet upward after rare large requests because the pool never trims.", "Buffers reused without clearing leak the previous image's pixels into new areas that were meant to be blank."],
    v: "Run a mixed-size workload for hours and confirm resident memory plateaus, the pool hit rate is high, allocation time drops against the system allocator, and new buffers handed out never contain data from earlier images.",
    dep: ["memory-budget","reference-counting"]
  },
  "reference-counting": {
    s: "Tracks how many users hold each image or tile buffer and frees it exactly when the last one releases, so lazy pipelines and caches can share data safely.",
    d: "Every handle holds a count on the underlying image, and operations hold counts on their inputs while they may still run. Counts are atomic so any thread can retain and release. A buffer returns to the pool at zero. This lets caches, graphs and bindings overlap in ownership without copying. Hard parts: cycles, such as a cache entry holding the graph that produced it, atomic contention on hot images, and language bindings where the host collector must release counts promptly.",
    k: ["Atomic reference counts vs a tracing collector: counts free memory deterministically, which matters for large buffers, and add atomic costs and cycle risk; a collector handles cycles and frees later.", "Count at image level vs at tile level: image level is simple; tile level frees early in streaming and adds bookkeeping."],
    p: ["A leaked reference from an error path keeps a gigabyte image alive for the life of the process.", "A cycle between a cache and a graph node is never freed and slowly grows memory."],
    v: "Run ten thousand pipelines, including ones that fail midway, then force a collection and confirm the live-buffer count returns to the baseline and a leak checker reports nothing outstanding.",
    dep: ["buffer-pool"]
  },
  "copy-on-write": {
    s: "Lets several images share the same pixel memory until one of them is modified, at which point only the modified one gets its own copy.",
    d: "Operations that change only metadata, such as setting a tag, cropping or making a view, return a new handle on the same buffer. A write request checks the reference count and copies the buffer if it is shared. This makes derived images cheap and allows immutable semantics at the API without wasting memory. The costs are the hidden copy on first write and the need to route every mutation through the check. Hard: aliasing bugs when a path forgets the check and mutates a shared buffer in place.",
    k: ["Copy on first write vs copy eagerly on every derive: lazy copying saves memory and time in common read-only flows; eager is simple and predictable.", "Mutable API with copy-on-write vs an immutable API with new images: mutable is convenient for editing loops; immutable cannot alias and allocates more."],
    p: ["An in-place operation that skips the shared check silently edits an image that a cache or another thread still uses.", "A write inside a loop triggers a full copy on every iteration when the code holds a second reference."],
    v: "Make a derived view, mutate the view, and confirm the original is unchanged and exactly one copy occurred. Repeat with threads reading the original while another writes and confirm no torn reads under a race detector.",
    dep: ["reference-counting","buffer-pool","stride-and-alignment"]
  },
  "memory-mapped-input": {
    s: "Maps a file directly into the address space so the operating system pages in only the parts the decoder touches, avoiding a read into a separate buffer.",
    d: "Uncompressed and tiled formats can be read by pointer through the mapping, letting the pipeline access tiles with no copy and without loading the file. Random access to a huge file costs only the pages used. The operating system evicts cold pages under pressure. Problems: the mapping can fail on 32-bit address spaces or network files, an unexpected truncation of the file while mapped raises a fault instead of an error, and performance differs between sequential and random patterns.",
    k: ["Map the file vs read into library-owned buffers: mapping is zero-copy and lazy; reading is predictable, portable and gives clean error handling.", "Trust the operating system's readahead vs issue explicit prefetch hints: default readahead is free and often right; hints help random tile patterns and are platform specific."],
    p: ["Another process truncating a mapped file turns a read into a fatal signal that crashes the service.", "A mapped file on a network volume stalls an entire thread on each page fault."],
    v: "Open a multi-gigabyte tiled file, read a small region, and confirm resident memory grows only by the pages touched. Truncate the file during a read in a test and confirm a handled error rather than a crash.",
    dep: ["tile-cache","out-of-core-storage"]
  },
  "memory-budget": {
    s: "A global accounting of image memory with a hard ceiling, so caches evict, spills start and new work waits or fails before the process exhausts the machine.",
    d: "Every large allocation, whether pooled buffers, cached tiles or decoded frames, is charged to a counter. When usage nears the limit, caches evict, the scheduler holds back new tiles and the job fails with a clear error if progress is impossible. Budgets are set per process, per tenant or per job, ideally derived from container limits rather than host totals. Hard parts: accounting for memory the library does not control, such as codec internals, and picking limits that keep concurrent jobs from deadlocking waiting for each other.",
    k: ["Hard limit with failure vs soft limit with swapping: a hard limit keeps latency predictable and fails some jobs; soft limits keep jobs alive and risk thrashing or kills.", "Per-job budgets vs one process-wide budget: per-job isolates tenants and wastes headroom; process-wide uses memory well and lets one job starve others."],
    p: ["Several jobs each waiting for memory held by the others deadlock the whole process.", "Reading host total memory inside a container with a lower limit sets a budget the container cannot honor."],
    v: "Run concurrent jobs whose combined demand is double the budget and confirm peak resident memory stays under the ceiling, caches evict, jobs finish or fail with a clear error, and no job deadlocks.",
    dep: ["buffer-pool"]
  },
  "color-correctness": {
    s: "The set of decisions that keep colors meaning what the author intended from input to output, applying to every operation that blends or converts pixel values.",
    d: "It covers which space operations run in, whether blending is in linear light, how untagged images are interpreted, what profile is embedded at output and how out-of-gamut values are treated. Each layer plays a part: codecs report tags, the pixel model carries them, operations preserve or change them, and savers write them. Mistakes are subtle: the output looks plausible but is slightly dark, desaturated or shifted, and no crash flags it. The decision must be made once and enforced in every operation.",
    k: ["Default to correct linear-light processing vs default to fast encoded-value processing: correct is accurate and costs time and memory; fast matches legacy results and is slightly wrong.", "Strict tagging with explicit conversions vs forgiving defaults: strict surfaces mistakes and annoys users; forgiving works silently and hides errors."],
    p: ["Every individual operation passes its tests while the pipeline as a whole darkens edges because they all assume encoded values.", "A saver drops the profile and a wide-gamut photo looks flat in every browser."],
    v: "Run reference images with known colors through representative pipelines and display them in a color-managed viewer next to a reference rendering, confirming no visible shift, plus measured patch differences below a delta-E threshold.",
    dep: ["color-space-model","working-space-policy","transfer-functions","icc-profiles"]
  },
  "precision-and-rounding": {
    s: "The policy for numeric types, intermediate precision and rounding that determines how much error accumulates across a chain of operations.",
    d: "Every operation either rounds its result back to the stored type or keeps extra precision. Chains of eight-bit operations accumulate errors and produce banding; floating point intermediates avoid this at a cost in memory and speed. Rounding must be consistent, to nearest rather than truncated, and clamping policy defines what happens above and below range. Fixed-point scales, lookup table sizes and codec transforms each introduce their own error. The decision spans accuracy targets, fusion and the choice of working type.",
    k: ["Float intermediates between operations vs rounding to the storage type each time: float is accurate and uses more bandwidth; rounding is compact and compounds error.", "Bit-exact scalar semantics vs allowing small differences for speed: exact semantics permit reproducible tests; tolerances let kernels use faster instructions."],
    p: ["Ten chained eight-bit adjustments produce visible banding that no single step shows in isolation.", "Truncation in one library kernel shifts mean brightness slightly every time an image is processed."],
    v: "Pass a smooth gradient through a representative ten-step chain in each precision mode and measure error and histogram gaps against a double-precision reference, confirming the chosen default stays inside the stated tolerance.",
    dep: ["sample-types-and-bit-depth","fixed-point-arithmetic","operation-fusion"]
  },
  "memory-versus-speed": {
    s: "The trade-off between holding more of an image in memory, which is faster, and streaming or spilling, which bounds footprint, and the knobs that move between them.",
    d: "Whole-image buffers make every operation simple and fast and cap image size by memory. Streaming and tiling bound memory and add overlap recomputation, scheduling logic and restrictions on operations. Caches and pools trade memory for speed. The decision shows up in the pipeline planner, cache sizes, tile sizes and defaults. A library that serves small thumbnails and one that edits gigapixel maps need different defaults, and users must be able to set them per job.",
    k: ["Default to streaming vs default to whole-image buffers: streaming scales to any image and may be slower; whole buffers are fast for typical sizes and fail on large ones.", "Memory sized by workload vs fixed cap: sizing by workload uses the machine well; a fixed cap is predictable in shared hosts."],
    p: ["A library tuned for desktop-size images exhausts memory the first time it meets a satellite scene.", "A library tuned for giant images pays tile overhead on every thumbnail and runs several times slower than it needs to."],
    v: "Run small, medium and giant images through the default configuration and a tuned one, recording time and peak memory, and confirm the defaults stay within a stated factor of the best choice at each size.",
    dep: ["scanline-streaming","tile-cache","memory-budget","out-of-core-storage"]
  },
  "determinism-and-reproducibility": {
    s: "Whether the same input and parameters give bit-identical output across threads, machines, instruction sets and library versions.",
    d: "Sources of variation include thread scheduling in reductions, different instruction sets rounding differently, floating-point fused multiply-add, optimizer rewrites and codec library versions. Reproducibility matters for caching by content hash, regression testing, audit and distributed rendering where different machines produce neighboring tiles. Achieving it costs speed: fixed reduction order, scalar-compatible rounding and pinned codec versions. Decide which results must be exact, and test them in continuous integration across machines.",
    k: ["Bit-exact output everywhere vs tolerance-based equality: bit-exact enables hash comparison and constrains kernels; tolerances let each machine use its fastest code.", "Pin codec and library versions vs upgrade freely: pinning gives stable outputs and delays security fixes; upgrading gets fixes and changes outputs."],
    p: ["Output hashes differ between servers with different instruction sets, so a content-hash cache stores duplicates or flags false regressions.", "A parallel reduction in a histogram sums floats in thread-dependent order and the result varies from run to run."],
    v: "Process a fixed corpus on machines with different processors and thread counts, and confirm output hashes are identical for operations declared exact and within the stated tolerance for the rest.",
    dep: ["runtime-cpu-dispatch","work-scheduler","precision-and-rounding","operation-cache"]
  },
  "security-posture": {
    s: "How hostile the expected input is, and the layered defenses chosen as a result: limits, isolation, fuzzing, minimal codec sets and update practice.",
    d: "A library used on a private archive can trust its inputs; one behind an upload form cannot. The stance sets defaults: strict limits, which codecs are enabled, whether decoding happens in a sandbox, how metadata is parsed, how fast dependency fixes are shipped. Image decoders are a long-standing source of memory-safety flaws, so the choice is whether to rely on defense in depth and process isolation or on careful code alone. Decide it early; retrofitting sandboxing into an in-process design is expensive.",
    k: ["Enable all formats by default vs minimal allowlist: all formats are convenient and widen the attack surface; an allowlist reduces risk and breaks unusual inputs.", "Isolate decoding in sandboxes vs rely on hardened code: isolation limits damage from any bug and costs performance; hardened code is fast and one flaw is fatal."],
    p: ["An obscure format enabled by default and unused by the application becomes the entry point of an attack.", "Security fixes in bundled codec dependencies reach users months late because the library pins old versions."],
    v: "Review the deployed configuration against a checklist: enabled codecs are an allowlist, limits are set, decoding runs sandboxed, fuzzers ran on the shipped versions, and a known vulnerable test file is rejected safely.",
    dep: ["sandboxed-decoding","dimension-and-memory-limits","fuzzing-and-sanitizers","untrusted-input-parsing"]
  },
  "quality-versus-size": {
    s: "The standing trade-off between fidelity, file size and processing time, which sets the defaults for every lossy step, resampling filter and encoder effort level.",
    d: "Every lossy choice spends fidelity to save bytes or time: encoder quality, subsampling, resampling kernel width, dithering, sharpening and denoise strength. Savings compound across a delivery chain, and so does loss when images are re-encoded. The right point depends on the use: a photo archive, a thumbnail grid and a print workflow differ widely. The choice appears in default parameters, perceptual targets, and whether originals are kept so derivatives can be regenerated.",
    k: ["Keep originals and derive on demand vs store only the compressed result: keeping originals allows regeneration with better settings and costs storage; storing only results saves space and compounds loss.", "Tune for lowest bytes vs lowest latency: low bytes need slow encoders and save bandwidth; low latency suits interactive paths and sends larger files."],
    p: ["Images re-encoded at each stage of a content workflow lose quality visibly by the third generation.", "A single global quality default is too high for flat graphics and too low for detailed photos."],
    v: "Measure size, perceptual score and encode time across a representative corpus for each preset, and confirm each preset meets its documented target for score and size on at least the stated fraction of images.",
    dep: ["rate-quality-control","resampling-filters","transform-lossy-coding"]
  },
});
