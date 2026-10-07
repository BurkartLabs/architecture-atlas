// Details for the text shaping plate, part 5: caches, foundation, testing, cross-cutting concerns.
ATLAS.details("text-shaping", {
  "glyph-cache-keys": {
    s: "The set of values that identify one rasterized glyph image: font, glyph, size, transform, variation, hinting, subpixel offset and rendering mode.",
    d: "A cached glyph is valid only for the exact inputs that produced it. The key combines a font identity, the glyph id, the scaled size, any transform, the variation coordinates, the hinting and antialiasing mode, the quantized subpixel offset and for color glyphs the palette. Hashing must be fast, since it runs per glyph per frame. Keys should be as coarse as correctness allows to raise hit rates. The challenge is completeness: a missing input serves a wrong image, and an extra input multiplies entries and drops hit rates.",
    k: ["Fine-grained keys versus coarse keys: fine keys are always correct, while coarse keys share entries across nearly identical sizes at the cost of slight blur.", "Quantizing size and offset versus exact values: quantizing bounds the entries, but introduces small positioning or scale error."],
    p: ["A key without the variation coordinates draws the wrong weight after an axis changes.", "Using the exact fractional size of an animation makes every frame a cache miss."],
    v: "Draw text while changing each key input in turn and confirm the output changes accordingly, then redraw with unchanged inputs and confirm a cache hit rate near one hundred percent.",
    dep: ["font-matching", "variation-axes", "subpixel-positioning"]
  },
  "atlas-packing": {
    s: "Places rasterized glyph images into a shared texture, using a packing algorithm so thousands of glyphs can be drawn from one bound texture.",
    d: "Glyph images of varying sizes are allocated into one or more large textures. Common strategies are shelf packing, where glyphs fill rows by height, and skyline or guillotine approaches that reuse space better. Padding between glyphs prevents filtering from bleeding neighbors in. Different formats go in separate atlases: single-channel coverage, three-channel subpixel masks, and color. The challenge is fragmentation and growth: variable sizes leave wasted space, and when an atlas fills the system must evict, grow or add another texture.",
    k: ["Shelf packing versus skyline packing: shelves are simple and fast to allocate, while skylines use space better but cost more per allocation.", "One atlas per format versus a combined atlas: separate atlases keep shaders simple, but binding multiple textures adds draw splits."],
    p: ["Insufficient padding lets neighboring glyph pixels bleed into edges when scaled or filtered.", "A single huge atlas exceeds the texture size limit of low-end devices."],
    v: "Draw a page with thousands of distinct glyphs and confirm they fit in the atlas budget, no glyph shows neighbor pixels at its edges, and an atlas dump shows packing efficiency above its target.",
    dep: ["glyph-cache-keys", "gpu-upload"]
  },
  "atlas-eviction": {
    s: "Frees atlas space when it fills, by discarding least recently used glyphs, clearing generations or rebuilding the atlas, without dropping glyphs needed by the current frame.",
    d: "When an allocation fails, the cache must reclaim space. Options include evicting individual least recently used glyphs, which leaves holes, flushing everything and re-rasterizing what the next frame needs, or generation-based clearing where old pages are dropped together. Glyphs used in the frame being built must stay valid until it has been drawn. Eviction runs while text is being laid out. The challenge is thrashing: if one frame needs more glyphs than the atlas holds, evict-and-refill repeats each frame and performance collapses.",
    k: ["Per-glyph least-recently-used eviction versus whole-atlas flush: per-glyph keeps hot glyphs but fragments space, while a flush is simple and compacts.", "Growing the atlas versus evicting: growing avoids thrash up to a limit, but uses more video memory."],
    p: ["Evicting a glyph already queued in the current frame draws garbage for that glyph.", "A page of many distinct scripts at once thrashes a small atlas every frame."],
    v: "Display a page needing more glyphs than the atlas holds and confirm that no frame draws a wrong glyph, the frame rate stays within budget, and the number of re-rasterizations per frame stays bounded.",
    dep: ["atlas-packing", "glyph-cache-keys", "text-memory-management"]
  },
  "gpu-upload": {
    s: "Transfers new glyph images into the atlas texture each frame, batching updates and avoiding stalls from synchronizing with drawing that is still using the texture.",
    d: "Newly rasterized glyphs are copied into a staging area and then into the atlas texture with sub-region updates. To avoid waiting on the GPU, updates are batched per frame, written to regions not in use by in-flight frames, or double buffered. Formats must match the atlas. Uploads happen on the render thread or a transfer queue. The challenge is the first frame with new text: a screen of unseen glyphs causes a burst of rasterization and uploads, producing a visible hitch.",
    k: ["Uploading as glyphs are needed versus precomputing common glyphs: on-demand is simple and adapts, while precomputing hides startup hitches for known text.", "Staging buffers versus direct texture writes: staging lets uploads overlap drawing, but uses extra memory and copies."],
    p: ["Writing into a texture region still being read by an earlier frame shows flickering glyph fragments.", "Uploading many small regions one at a time costs more than one batched copy."],
    v: "Scroll through unseen text while recording frame times, and confirm uploads are batched, no frame exceeds the budget by more than a set margin, and no glyph appears corrupted for a frame.",
    dep: ["atlas-packing", "coverage-rasterizer"]
  },
  "glyph-quad-batching": {
    s: "Turns each visible glyph into a textured rectangle and groups many of them into few draw calls, so a screen of text costs a handful of draws instead of thousands.",
    d: "For every glyph the batcher computes the destination rectangle from its position and the glyph's bearings, and the source rectangle from the atlas entry, then appends vertices or instance data to a buffer. Quads sharing a texture, shader and blend state are drawn together. Color text, outlines and shadows may use separate passes. Clipping and transforms are applied in the shader or on the CPU. The challenge is ordering and state changes: text interleaved with other content breaks batches, and per-glyph data uses large amounts of memory.",
    k: ["Instanced quads versus expanded vertex data: instancing uses less memory and bandwidth, while expanded vertices work on older hardware.", "Sorting by texture versus preserving draw order: sorting makes bigger batches, but changes results when text overlaps other content."],
    p: ["Reordering draws for batching puts text behind a translucent shape that should be behind it.", "Atlas growth that changes the bound texture mid-batch splits batches unexpectedly."],
    v: "Draw a screen of ten thousand glyphs and confirm the frame uses a small number of text draw calls, per-frame CPU time stays within budget, and the image equals an unbatched reference.",
    dep: ["atlas-packing", "glyph-cache-keys", "gpu-upload"]
  },
  "large-glyph-paths": {
    s: "Draws very large or heavily transformed text from outlines as filled paths instead of cached glyph images, since atlas entries at that size are too big or too short-lived.",
    d: "Above a size threshold, or when the transform is perspective, rotated or animated, a bitmap per size is wasteful and blurry. The renderer instead sends glyph outlines to the vector path pipeline, which tessellates or evaluates coverage on the GPU, with its own cache of path data. The threshold balances atlas memory against path cost. Effects such as strokes and gradients along text use the same route. The challenge is visible mismatch at the threshold, where text can change appearance as it scales, and the cost of path drawing for large blocks of text.",
    k: ["Switching to paths at a size threshold versus always using bitmaps: paths stay sharp at any scale, but cost more per glyph than cached bitmaps.", "Caching tessellated paths versus regenerating each frame: caching saves CPU, but takes memory per glyph and size."],
    p: ["Text visibly shifts weight or position at the switch size because the two renderers differ.", "A screen of large path text overloads the path renderer and drops frames."],
    v: "Animate text scale across the threshold and confirm no visible jump in position or weight, and compare path-drawn output at large size with an exact reference within a small error.",
    dep: ["glyph-outlines", "outline-scaling", "curve-flattening"]
  },
  "shape-result-cache": {
    s: "Remembers the glyphs, advances and clusters produced for a run of text in a font and settings, so repeated words and strings are not shaped again.",
    d: "Shaping is costly, and text repeats: labels, table cells, and common words. The cache keys on the characters, font, size, features, language, script and direction, and stores the glyph array. Some caches work per word, splitting runs at spaces, which assumes shaping across a space does not matter and fails for a few fonts and scripts. Entries are evicted by size or recency. The challenge is the correctness of the key and of word-level splitting, and memory held by cached arrays for unusual strings.",
    k: ["Caching whole runs versus per-word: whole runs are always right, while per-word hits far more often but can change contextual results.", "Bounded by entry count versus by memory: counts are simple, but memory bounds handle long strings."],
    p: ["Word-level caching in a script where shaping crosses spaces yields subtly wrong forms.", "A key omitting the language lets an entry shaped for one language serve another."],
    v: "Shape a document twice and confirm results from the cached path equal uncached results glyph for glyph, with hit rate above a target on repeated content and memory under the cap.",
    dep: ["shaper-driver", "styled-text-runs", "text-memory-management"]
  },
  "line-layout-cache": {
    s: "Keeps the laid-out lines of a paragraph keyed by its text, style and width, so unchanged paragraphs are not broken into lines again when the view scrolls or resizes.",
    d: "Layout results include line breaks, run positions and metrics. A paragraph cache stores them by content and constraints and returns them when nothing changed. For a new width, some caches reuse shaped runs and recompute only breaks, which is much cheaper than shaping. Large documents use it with virtualization: only visible paragraphs are laid out and cached, with estimated heights for the rest. The challenge is invalidation: any change in text, style, font load state or width must drop affected entries, and estimates cause scrollbar jumps when replaced by real heights.",
    k: ["Caching shaped runs and relaying out lines versus caching final lines: run caching survives width changes, while final lines are fastest for same-width redraws.", "Estimated heights for unseen paragraphs versus laying out everything: estimates keep long documents fast, but make scroll position unstable."],
    p: ["A font finishing loading does not invalidate cached lines, so text keeps fallback metrics.", "Estimated heights replaced by measured ones make the scroll position jump under the reader."],
    v: "Resize a window on a long document while profiling and confirm only visible paragraphs are laid out per frame, shaping is not repeated, and scroll position remains stable after measured heights replace estimates.",
    dep: ["shape-result-cache", "line-box-assembly", "greedy-line-breaker"]
  },
  "platform-font-service": {
    s: "The operating system's own font enumeration, matching and fallback service, which the stack may call or bypass, and which defines what fonts exist for the user.",
    d: "Systems provide a service that lists installed fonts, resolves family requests, returns a fallback font for a character and language, and sometimes renders glyphs. Using it gives the platform's own fallback and user font settings, and consistent behavior with native applications. Bypassing it and reading font files directly gives control and identical results across platforms. Calls can be slow and may cross a process boundary. The challenge is the trade-off between native fidelity and cross-platform consistency.",
    k: ["Delegating to the platform versus bundling a self-contained stack: delegation matches the system, while self-contained gives identical output everywhere.", "Synchronous calls versus cached results: caching avoids stalls, but can hold stale answers after font changes."],
    p: ["A blocking call to the system service on the main thread freezes the interface the first time an uncommon script appears.", "Platform fallback results differ between versions, changing rendering after an update."],
    v: "Request fallback for characters in a dozen scripts through the service and confirm each returns a covering font within a latency budget, and the answers match those native applications show.",
    dep: []
  },
  "unicode-data-tables": {
    s: "Compact tables of character properties: script, category, bidirectional class, line break class, combining class, mirroring and cluster rules, shared by segmentation, shaping and layout.",
    d: "The character database assigns properties to over a million code points. Software compiles them into multi-stage lookup tables or range arrays for fast access, along with data for composition, case mapping and emoji. Each release adds characters and changes properties, so the tables carry a version. Consumers must agree on the version, since differences change cluster, break and script results. The challenge is size and freshness: the tables must be small, rebuilt reliably from source data, and updated in step with fonts and renderers.",
    k: ["Compiling tables into the binary versus loading data at runtime: compiled is fast and self-contained, while runtime data can update without a new release.", "Using the platform's tables versus bundled tables: platform tables save size, but vary by operating system version."],
    p: ["Two components with different data versions disagree on a new character's script or class.", "Property lookups through a slow generic path dominate itemization time on large text."],
    v: "Compare lookups for every code point against the published data files for the supported version, and confirm all components in the process report the same version string.",
    dep: []
  },
  "display-scale-and-dpi": {
    s: "Carries the pixel density and scale factor of the target display into text sizing and rasterization, so type is the intended physical size and sharp on every screen.",
    d: "Text sizes are defined in logical units, and a scale factor converts to device pixels, with fractional factors common. The renderer rasterizes at the device size, not at a logical size scaled up, and picks hinting and subpixel modes by density: high-density screens need neither. Moving a window between displays changes the factor, which invalidates caches and triggers relayout. The challenge is fractional scaling, where rounding of metrics and baselines causes blur or inconsistent spacing, and keeping layout stable across factors.",
    k: ["Laying out in device pixels versus logical units: device pixels give the sharpest text, while logical layout keeps the same line breaks at every scale.", "Rasterizing at the exact fractional size versus rounding: exact is faithful, but rounding reduces distinct cache entries."],
    p: ["A window dragged to a display with a different scale shows blurry text until it is relaid out.", "Layout in logical units with device-pixel rounding gives different line breaks on different displays."],
    v: "Show the same document at scale factors 1, 1.25, 1.5 and 2 and confirm text is sharp at each, rasterized at the device size, with line breaks identical or differing only where the specification allows.",
    dep: ["outline-scaling", "glyph-cache-keys"]
  },
  "text-memory-management": {
    s: "Rules for how fonts, glyph data and layout results are allocated, shared and released, keeping memory bounded across thousands of fonts and long documents.",
    d: "Font data is large and shared: files are memory-mapped so pages load lazily and are shared between processes, parsed tables hold references into the mapping, and glyph outlines are decoded on demand. Caches have budgets with eviction, and arenas hold per-layout temporary data to free it at once. Reference counting or generational handles keep fonts alive while runs use them. The challenge is the lifetime of mapped data: a font file replaced or deleted on disk must not crash code still reading it, and budgets must hold even with hostile or huge inputs.",
    k: ["Memory-mapping font files versus reading into private memory: mapping is cheap and shared, while private copies survive file changes.", "Per-layout arenas versus individual allocations: arenas are fast and leak-free, but hold memory until the layout ends."],
    p: ["A mapped font file truncated or replaced on disk crashes readers with a fault on access.", "Caches without a global budget grow with each new font and string until memory runs out."],
    v: "Open and use a thousand fonts, run a long scrolling session, and confirm resident memory stays under the configured budget and returns to baseline after fonts are released.",
    dep: ["container-and-directory"]
  },
  "thread-safety": {
    s: "Defines which text objects may be shared between threads and how, so layout can run in the background without locks becoming the bottleneck or data being corrupted.",
    d: "Fonts and their parsed tables are immutable after loading and can be shared freely. Shaping buffers and layout objects are per-thread or per-call. Caches are shared and need either locks, sharding or lock-free structures. Glyph rasterization may run on worker threads and hand images to the render thread for upload. The rasterizer library state may require a lock per font face. The challenge is contention on shared caches and on non-thread-safe components such as the hinting interpreter, which can serialize all text work.",
    k: ["Immutable shared data versus per-thread copies: shared immutable data saves memory, while copies avoid all synchronization.", "A global cache lock versus sharded caches: a lock is simple, while shards scale across threads with more complex eviction."],
    p: ["A font face used by two threads at once corrupts internal state of a rasterizer that is not thread-safe.", "A cache lock held during rasterization blocks all other threads for the duration."],
    v: "Run layout and rasterization on eight threads against shared fonts under a thread sanitizer and confirm no data races are reported and throughput scales with thread count to a target.",
    dep: ["text-memory-management", "glyph-cache-keys"]
  },
  "compositing-handoff": {
    s: "Passes finished text to the surface that shows it: pixel buffers, textures or draw lists, with the opacity, transform and color information the compositor needs.",
    d: "Text can end up as drawn glyph quads inside a larger scene, as a pre-rendered texture for a layer, or as a draw list replayed by a compositor process. The handoff includes the color space, whether the background is opaque, which decides subpixel antialiasing, and the transform applied by the compositor. Text on a layer that is later scaled, rotated or faded may need to be rasterized again at the new transform. The challenge is deciding where text is rasterized: early gives stable results but blurs when transformed, and late gives sharper results at higher cost.",
    k: ["Rasterizing text into a layer texture versus drawing it into the final target: layer textures animate cheaply, while final-target drawing keeps text sharp.", "Preserving subpixel antialiasing versus falling back to grayscale on layers: preserving needs opaque backgrounds, while grayscale is safe for any compositing."],
    p: ["A layer rasterized at one scale and then magnified by the compositor shows blurred text.", "Subpixel text on a layer later composited over varying content shows color fringes."],
    v: "Animate a layer containing text through scale, rotation and fade, and confirm the text stays legible, re-rasterizes at rest, and shows no color fringes once it becomes translucent.",
    dep: ["subpixel-rendering", "text-drawing-calls", "display-scale-and-dpi"]
  },
  "embedding-permissions": {
    s: "Reads and honors a font's embedding and usage flags, which say whether it may be embedded in documents, installed temporarily, or only viewed, and applies the limits when exporting or downloading.",
    d: "A font carries a permission field with levels such as installable, editable, preview and print, and restricted. Document exporters check it before embedding a font in a file, and some embed only the subset of glyphs used. Downloaded fonts may be restricted to the origin that requested them. Subsetting reduces size and exposure but still must respect the flag. The challenge is that flags are advisory, vary by license, and are often wrong, and enforcing them incorrectly either breaks legitimate documents or ignores a license.",
    k: ["Enforcing flags strictly versus warning: strict enforcement respects licensing, while warnings avoid blocking documents with incorrectly flagged fonts.", "Embedding a subset versus the full font: subsets are small and expose less, but prevent editing text later with missing glyphs."],
    p: ["Exporting a document with a restricted font embedded in full violates its license.", "Subsetting without keeping the layout tables used by the text makes the embedded copy shape differently."],
    v: "Export documents using fonts with each permission level and confirm restricted fonts are not embedded or are outlined, subsets include the glyphs and layout data used, and the output renders the same as the source.",
    dep: ["font-name-and-metadata", "container-and-directory"]
  },
  "shaping-conformance-suites": {
    s: "Test data with expected glyph output for specific scripts, fonts and sequences, run against the shaper to catch regressions and differences from reference behavior.",
    d: "A suite lists inputs: a font, a text string, a script, direction and features, with the expected glyph ids, clusters and advances. Test fonts are small and built to exercise single lookups or script models. Suites cover simple scripts, joined scripts, reordering scripts, marks and emoji. They run on every build and compare against an independent implementation's output. The challenge is that expected output is itself a judgment: implementations disagree in legitimate ways, and each new font or script adds cases that must be reviewed by readers of that script.",
    k: ["Comparing against reference output versus invariant checks: reference output catches any change, while invariants such as order and cluster monotonicity survive legitimate differences.", "Small purpose-built fonts versus real fonts: small fonts isolate one rule, while real fonts reveal interactions."],
    p: ["Regenerating expected output after a change without review hides a real regression.", "No coverage for a script means its breakage reaches users who read it and nobody on the team does."],
    v: "Run the suite on the current build and a reference implementation and confirm the result lists zero unexplained differences, with each documented difference tied to a reviewed note.",
    dep: ["shaper-driver", "script-shaping-models"]
  },
  "golden-image-tests": {
    s: "Renders text to images and compares them with approved reference images, catching changes in rasterization, hinting, antialiasing and layout that metrics alone would miss.",
    d: "Test pages render a fixed set of strings, fonts, sizes and modes on a pinned configuration and compare the pixels to stored goldens with a small tolerance. Variants cover grayscale and subpixel modes, scales and color glyphs. Failures output a diff image. Because rasterizers and platforms produce slightly different pixels, goldens are kept per platform or compared with a perceptual metric. The challenge is noise and review: a tolerance that hides real regressions, and a flood of updated goldens that nobody inspects.",
    k: ["Exact pixel comparison versus tolerance: exact is strict but fails on harmless differences, while tolerance is robust but may let small regressions pass.", "One set of goldens versus per platform: one set is easy to maintain, while per platform matches real output."],
    p: ["Updating all goldens after a rasterizer change without inspecting them accepts a regression.", "Tests that depend on installed system fonts produce different results on different machines."],
    v: "Run the golden suite on a clean checkout and confirm zero diffs, then change a hinting setting and confirm the affected tests fail with diff images that visibly show the change.",
    dep: ["coverage-rasterizer", "bytecode-hinting", "subpixel-rendering"]
  },
  "font-parser-fuzzing": {
    s: "Feeds mutated and malformed font files to the parsers and rasterizer continuously, to find crashes, hangs and memory errors before attackers do.",
    d: "A fuzzer starts from a corpus of valid fonts, mutates bytes, table offsets and counts, and runs the sanitizer, parser, shaper and rasterizer under memory error detection with time and memory limits. Coverage feedback guides mutations toward unexplored table code. Structure-aware mutators change table fields consistently so inputs pass early checks. Crashes are minimized into regression tests. The challenge is depth: shallow validation rejects most random inputs, and the code behind a bytecode interpreter or a composite glyph needs inputs that are valid enough to reach it.",
    k: ["Byte-level mutation versus structure-aware mutation: byte-level is easy and finds shallow bugs, while structure-aware reaches deep logic.", "Fuzzing the sanitizer alone versus the full pipeline: the sanitizer is the main barrier, but the pipeline finds bugs the sanitizer accepts."],
    p: ["Fuzzing without memory error detection misses silent out-of-bounds reads.", "A corpus lacking collections, variable or color fonts never exercises those parsers."],
    v: "Run the fuzzers for a fixed number of hours on the current build and confirm zero crashes or hangs, coverage of each table parser above a target, and that every past crash exists as a regression test.",
    dep: ["font-sanitizer", "glyph-outlines", "layout-tables", "bytecode-hinting"]
  },
  "text-profiling": {
    s: "Measures where time and memory go in itemization, shaping, line breaking, rasterization and upload, so budgets can be enforced and regressions found.",
    d: "Instrumentation records per-stage timings and counts: runs shaped, cache hits and misses, glyphs rasterized, atlas uploads, bytes allocated. Benchmarks use fixed corpora, such as a long article in several scripts, a table with thousands of cells and a scroll test, and report percentiles rather than means. Traces connect stages to frames. Results are compared with budgets in continuous builds. The challenge is representativeness: synthetic text overstates cache hit rates, and real content varies by script, so a benchmark in one language says little about another.",
    k: ["Always-on lightweight counters versus on-demand tracing: counters are free in production, while tracing gives detail at a cost.", "Benchmarking whole pages versus individual stages: whole pages reflect users, while stages locate the cause."],
    p: ["Benchmarks with a warm cache hide first-use costs that users see.", "A benchmark on Latin text misses a slow path that only a complex script triggers."],
    v: "Run the benchmark corpus on each build and confirm per-stage percentiles are within budget, and that deliberately slowing one stage makes the trace attribute the extra time to it.",
    dep: ["shape-result-cache", "line-layout-cache", "glyph-quad-batching"]
  },
  "glyph-debug-overlays": {
    s: "Developer views that draw glyph boxes, baselines, cluster boundaries, run boundaries, fallback fonts and bidirectional levels on top of the text to explain what the pipeline did.",
    d: "An overlay draws, from the same layout data used for rendering, each glyph's bounding box and origin, the baseline and metrics lines, color-coded runs by font and script, cluster brackets, and the bidirectional level and break opportunities. It can also show which font supplied each character, and missing-glyph counts. Overlays are toggled at runtime or in a dump tool. Because they read the real data rather than recomputing it, they show what the renderer saw. The challenge is keeping the tools in step with data structures and cheap enough to leave in builds.",
    k: ["Overlay in the running application versus an offline dump tool: overlays show real content in context, while offline tools are reproducible and scriptable.", "Showing raw data versus interpreted labels: raw data is exact, but readable labels make fallback and bidirectional problems obvious."],
    p: ["An overlay that recomputes layout separately can show a result the renderer did not use.", "Overlays left enabled in release builds expose internals and cost frame time."],
    v: "Enable the overlay on a mixed-script paragraph and confirm every glyph box, run color and level label matches the data dumped by the layout API for the same text.",
    dep: ["cluster-mapping", "shaping-run-builder", "per-character-fallback", "line-box-assembly"]
  },
  "cross-platform-metric-checks": {
    s: "Automated comparisons of text widths, line counts and breaks across platforms and renderers, to find differences before they show up as clipped or reflowed text.",
    d: "A set of strings, fonts and widths is laid out on each target and the results are compared: total advance, number of lines, break positions and baseline offsets. Differences are reported against a tolerance, with known causes recorded. Tests pin the font files and the character data version to isolate engine differences from data differences. The same checks run between the layout and drawing paths of one engine. The challenge is deciding which differences are bugs, since rounding and hinting legitimately shift widths, and keeping the corpus broad enough to cover scripts and fonts.",
    k: ["Strict equality versus a tolerance: strict equality catches every change, while a tolerance avoids noise from rounding and hinting.", "Pinned bundled fonts versus system fonts: bundled fonts isolate engine differences, but system fonts reflect what users see."],
    p: ["Comparing results made with different font versions reports engine differences that are really data differences.", "A tolerance wide enough for hinting hides a one-letter line wrap difference."],
    v: "Run the corpus on every target and confirm line counts and break positions are identical and total advances differ by less than the tolerance, with every exception listed with a cause.",
    dep: ["text-measurement", "horizontal-metrics", "unicode-data-tables"]
  },
  "unicode-version-skew": {
    s: "Cross-cutting concern: every stage that reads character properties must agree on one version of the data, and fonts and renderers must support the characters it defines.",
    d: "Segmentation, bidirectional resolution, line breaking, script itemization, normalization and emoji handling all use the character database. A mismatch between components, or between the software and the fonts in use, makes new characters split, break, reorder or fall back incorrectly. Updates arrive yearly with new scripts, emoji and changed rules. The decision is who owns the data version, how it updates, and how much older data is tolerated. The cost is felt at the edges: documents written with newer characters displayed on older software.",
    k: ["Bundling data with the program versus using the platform's data: bundling gives consistent behavior, while platform data saves size but varies by system version.", "Updating yearly versus lagging: updating supports new text sooner, but forces coordinated changes in fonts, segmentation and tests."],
    p: ["Components built against different data versions disagree on whether a new emoji is one cluster.", "Updating the tables without updating tests means changes in behavior go unnoticed."],
    v: "Display the version of the data used by each component and confirm they match, then render text with characters added in the latest release and confirm segmentation, breaking and shaping behave as specified.",
    dep: ["unicode-data-tables", "grapheme-clusters", "break-opportunities"]
  },
  "untrusted-font-security": {
    s: "Cross-cutting concern: fonts are complex binary programs from untrusted sources, so every parser, interpreter and renderer must treat them as hostile input.",
    d: "Font files carry offsets, counts, compressed streams, instruction programs, vector documents and graph structures that all reach code running with the application's privileges. The decisions are what to validate and where, which features to support at all, and whether parsing runs in a separate low-privilege process. Resource limits on size, depth, instruction counts and time apply everywhere. Past vulnerabilities in this area have led to remote code execution through crafted fonts, which is why isolation and fuzzing are standard.",
    k: ["Parsing in-process versus in a sandboxed process: in-process is fast, while sandboxing contains a compromise at the cost of copying and latency.", "Supporting every table versus a minimal set: broad support renders more fonts, but each table adds attack surface."],
    p: ["A feature included for compatibility, such as a legacy instruction interpreter, becomes the entry point for an exploit.", "Limits applied in one parser but not another let a hostile font hang a different stage."],
    v: "Load a corpus of malformed and hostile fonts and confirm each is rejected or rendered safely within time and memory limits, the parsing process has no access to files or network, and fuzzers report no findings.",
    dep: ["font-sanitizer", "font-parser-fuzzing", "compressed-wrappers"]
  },
  "layout-render-consistency": {
    s: "Cross-cutting concern: layout and drawing must use the same fonts, sizes, rounding and metrics, or text will clip, overlap or shift between the measured and drawn result.",
    d: "Layout runs on measured advances, and drawing places glyph images using the same positions. Any difference in font choice, hinting mode, size rounding, subpixel quantization or variation settings between the two makes drawn text differ from the layout's box. The decision is the single source of metrics: one scaled font object and one set of rounding rules used by both. It is also a decision about what is allowed to change at draw time, such as scale or palette, without redoing layout.",
    k: ["Unhinted layout metrics versus hinted metrics: unhinted metrics are stable across sizes and displays, while hinted metrics match drawn pixels exactly.", "Sharing one font object between layout and draw versus separate instances: sharing guarantees agreement, but couples threading and lifetime."],
    p: ["Layout measured with a fallback font that later changed gives text that overflows its box.", "Hinted advances at draw time and unhinted at layout cause a gradual drift along long lines."],
    v: "Draw a long line and compare the position of each glyph's drawn pixels with the layout's glyph positions, and confirm the difference is below the quantization step for every glyph.",
    dep: ["text-measurement", "outline-scaling", "glyph-cache-keys"]
  },
  "performance-budgets": {
    s: "Cross-cutting concern: each stage gets a limit on time and memory per frame or per paragraph, because text is on every screen and slow text makes the whole interface slow.",
    d: "A frame has milliseconds to lay out and draw all visible text, and scrolling or editing repeats the work. Budgets are set per stage: shaping on cache miss, line breaking per paragraph, rasterization per glyph, upload per frame. Decisions include caching levels, virtualization of long documents, moving work off the main thread, and degrading gracefully when a budget is exceeded, such as drawing a fallback glyph while a font loads. The risk is the first-time cost of new scripts and large fonts.",
    k: ["Doing work synchronously versus in the background: synchronous work is correct on the first frame, while background work keeps frames smooth but shows placeholders.", "Strict per-frame limits versus amortizing over frames: strict limits protect frame rate, while amortizing finishes expensive work sooner overall."],
    p: ["A first view of a script with a large font and a long fallback chain hitches for hundreds of milliseconds.", "Caches tuned for one language collapse in hit rate when the content changes to another."],
    v: "Scroll a long multi-script document on target hardware and confirm every frame stays within the frame budget at the 99th percentile, with first-use costs for new scripts reported separately.",
    dep: ["shape-result-cache", "line-layout-cache", "atlas-eviction", "text-profiling"]
  },
  "script-and-language-coverage": {
    s: "Cross-cutting concern: the stack is only as good as its worst-supported script, so coverage of shaping models, fonts, line breaking and input must be decided and tested per script.",
    d: "Supporting a script means a shaping model, fonts that cover it, break and segmentation rules, hyphenation, bidirectional behavior, input method integration, caret and editing rules, and test data reviewed by readers. Decisions include which scripts are in scope, the minimum quality for each, and how unsupported text fails: boxes, fallback fonts or errors. Coverage gaps are invisible to teams who do not read the script and are found by users, often after release.",
    k: ["Broad shallow support versus deep support of fewer scripts: broad support shows something for everyone, while depth gives correct text for the chosen scripts.", "Relying on community-reviewed tests versus in-house review: community tests are wide, while in-house review fits the product's content."],
    p: ["A script that renders legibly but with wrong reordering is shipped because no reviewer reads it.", "Fallback fonts exist for a script but no shaping model, so letters appear unjoined."],
    v: "Render a fixed passage in each in-scope script and have a reader of that script check shaping, line breaking, caret movement and selection, and record a pass for each against the written coverage list.",
    dep: ["script-shaping-models", "fallback-chains", "dictionary-segmentation", "shaping-conformance-suites"]
  },
  "memory-and-caching-policy": {
    s: "Cross-cutting concern: every cache, from shaped runs to glyph atlases, needs a size limit, an eviction rule and an invalidation rule, decided together so they do not fight.",
    d: "Text has caches at many levels: font files, parsed tables, glyph images, atlas pages, shape results and laid-out lines. They depend on each other: evicting a font should drop everything derived from it. Decisions include budgets per cache and in total, how pressure from the operating system is handled, what keys and generations signal invalidation, and what survives a display change or a font update. Without one policy, each cache grows alone and total memory is unbounded.",
    k: ["A global memory budget shared by caches versus independent limits: a global budget bounds total use, but needs cross-cache accounting and priorities.", "Aggressive eviction under pressure versus keeping caches warm: eviction saves memory for other uses, while warm caches avoid hitches."],
    p: ["Evicting a font while derived caches keep stale references serves glyphs from a font that has gone.", "Independent caches each set to a generous limit together exceed the device's memory."],
    v: "Run a long session of varied content under a memory limit and confirm total cache memory stays within the global budget, eviction of a font drops all derived entries, and no stale entry is ever drawn.",
    dep: ["glyph-cache-keys", "atlas-eviction", "text-memory-management", "shape-result-cache"]
  },
});
