// Details for the VFX compositor plate, part 3: node graph, caching, image model.
ATLAS.details("vfx-compositor", {
  "node-and-knob-model": {
    s: "The data model of a composite: nodes with typed inputs and parameters, connected into a directed acyclic graph that defines the output.",
    d: "A node has a type, named inputs, an output and a set of parameters, often called knobs, each with a type, default and animation. The graph is the program: it contains no loops, and the output of one node feeds many consumers. Nodes are created from a registry of operator classes, which also describe the metadata and channels they affect. The model must support disabled nodes, labels and expressions linking values. It is hard because the same structure serves the interface, files, scripts and the engine, so changes to it ripple into all four.",
    k: ["Strict acyclic graph vs allowing feedback: acyclic graphs are easy to schedule and cache; feedback allows effects such as trails and requires frame-by-frame evaluation.", "Parameters typed and declared vs free-form properties: declared types allow generated interfaces and validation; free-form properties are flexible and unchecked."],
    p: ["A cycle created through an expression link, not a wire, is not caught until evaluation hangs.", "Deleting a node reconnects its output to the wrong input and silently changes the branch."],
    v: "Build a graph of three nodes, serialize it, reload it, and confirm the nodes, connections and parameter values are identical and a render of the output produces the same pixels as before saving.",
    dep: []
  },
  "pull-evaluation": {
    s: "Computes an image by asking the output node for pixels, which asks its inputs in turn, so only what is needed is ever calculated.",
    d: "When a viewer or writer requests a frame and region, the engine walks up from that node. Each node first reports metadata and the region it needs from each input, then pulls those, then computes its own output. Work not feeding any requested output is never done. Results for identical requests can be shared between consumers through caching. The model suits interactive use because disabling a branch costs nothing. It is hard because request parameters, such as frame, view and region, define identity, so they must be carried precisely through every node.",
    k: ["Pull from outputs vs push from sources: pull computes only what is visible; push is simple to parallelize and does wasted work on edits.", "Evaluate per request vs build a full execution plan first: per request is flexible and repeats analysis; a plan can optimize across nodes and is stale after every edit."],
    p: ["A node that queries an input at a different frame without declaring it makes caching return the wrong result.", "Deep chains evaluated recursively overflow the call stack on very large graphs."],
    v: "Build a graph where one branch feeds nothing connected to an output, render the output, and confirm via the engine's evaluation log that no node in the unused branch was computed.",
    dep: ["node-and-knob-model","regions-of-interest","time-dependencies"]
  },
  "regions-of-interest": {
    s: "Tracks which rectangle of each input a node needs to produce a requested output rectangle, so work is limited to what matters.",
    d: "Each operator declares how its needed input area relates to its output area: a blur needs its output region grown by the blur radius, a transform needs the transformed rectangle, a pointwise grade needs the same area. The engine propagates these from the output to the sources, and also propagates the bounding box of data forward to know where an image is non-empty. It makes zoomed viewing and tiled processing cheap. It is hard because wrong declarations either produce visible seams at tile edges, if too small, or waste work, if too large.",
    k: ["Conservative rectangles vs exact shapes: rectangles are simple and slightly wasteful; exact shapes save work and complicate every operator.", "Declared by each operator vs measured by the engine: declared regions are cheap and rely on author correctness; measuring is safe and needs instrumentation."],
    p: ["A filter that under-reports its radius leaves visible lines at tile boundaries.", "An operator that requests the full frame whenever a part is needed turns a zoomed-in preview into a full-frame render."],
    v: "Render a heavy blur graph as a full frame and as four separate quadrants, stitch the quadrants, and confirm the stitched result is identical to the full render, with no seams.",
    dep: ["pull-evaluation","display-and-data-windows"]
  },
  "scanline-tile-scheduling": {
    s: "Divides the requested image into rows or tiles that are computed independently, so different parts can run in parallel and be streamed.",
    d: "An operator is asked for a unit of work: a scanline, a block of rows or a tile. The scheduler decides the unit based on the operator's needs. Pointwise operators work on any unit, while filters need neighbors, and transforms need arbitrary source areas, so they request larger inputs and cache them. Tiles enable evaluating images larger than memory and spread work across cores. It is hard because the unit that suits one operator is wasteful for another, and redundant overlap between tiles repeats work.",
    k: ["Scanline units vs square tiles: scanlines suit sequential files and streaming; tiles suit filters and transforms with two-dimensional neighborhoods.", "Fixed tile size vs adaptive: fixed size is simple and tunable once; adaptive size matches each operator at the cost of complexity."],
    p: ["Small tiles recompute the neighbor overlap of a large blur many times, taking several times longer than a single pass.", "Operators that require the whole image defeat tiling and spike memory."],
    v: "Render the same graph with tile sizes of 64 and 512 pixels and confirm identical output while the profile shows the overlap work fall as the tile size increases.",
    dep: ["regions-of-interest","thread-pool","memory-cache"]
  },
  "node-multithreading": {
    s: "Runs several operators or several regions of one operator at the same time across cores while keeping results consistent.",
    d: "Parallelism exists at three levels: different frames, different branches of the graph and different regions inside a node. The engine hands work to a pool and uses locks or per-thread buffers where nodes keep shared state, such as a cache or a parameter lookup. Operators are written to be re-entrant. Evaluation order does not change results if operators are pure. It is hard because shared mutable state, such as lazily built lookup tables, is a source of rare crashes and nondeterminism, and too many threads thrash memory bandwidth.",
    k: ["Parallelize inside nodes vs across frames: inside nodes lowers latency of one frame; across frames gives better throughput and needs more memory.", "Locks around shared caches vs per-thread caches: locks save memory and can serialize threads; per-thread caches scale and duplicate data."],
    p: ["An operator caching a lookup table without a lock produces occasional wrong pixels that vanish on retry.", "Running one thread per core on a memory-bound graph slows it down."],
    v: "Render the same frame one hundred times with one thread and with all cores and confirm every output is bit-identical, with the multithreaded run faster by at least the expected factor.",
    dep: ["thread-pool","scanline-tile-scheduling","pull-evaluation"]
  },
  "time-dependencies": {
    s: "Tracks which input frames each node needs to produce an output frame, so retimes, temporal filters and trackers are evaluated correctly.",
    d: "Most nodes use the same frame as requested, but retimes, frame holds, averaging, temporal denoise and motion vectors read other frames. They declare the range they need so the engine can fetch, cache and invalidate correctly. Time is also a parameter of expressions and animation curves. Frame requests can be fractional. It is hard because dependencies are transitive: a retime upstream of a temporal filter expands the set of frames needed, and a mistake makes caches return the wrong frame, which only shows during playback.",
    k: ["Declared frame ranges vs discovering reads at runtime: declared ranges allow prefetching and caching; discovered reads are flexible and unplannable.", "Whole frames only vs fractional times: whole frames are simple; fractional times are required for correct retime and motion blur."],
    p: ["A node reading an undeclared neighboring frame gets stale data after an upstream edit.", "Temporal effects at the start and end of a shot read frames that do not exist and show a pop."],
    v: "Insert a three-frame average after a retime, request frame 20, and confirm from the evaluation log that it read exactly the source frames the retime curve maps to for frames 19 to 21.",
    dep: ["pull-evaluation","node-and-knob-model"]
  },
  "groups-and-subgraphs": {
    s: "Nest part of a graph inside a single node so complex sections are collapsed for readability and reused with the same evaluation rules.",
    d: "A group is a node containing its own graph with inputs and outputs mapped to the outer connections. It evaluates exactly as if the inner nodes were part of the parent, and an expanded group's nodes can be edited in place. Groups carry their own promoted parameters. They organize comps, form macros and allow per-shot templates. It is hard because names and scoping must work across levels: expressions referring to nodes inside or outside need stable paths, and a render error deep inside has to be reported with a path an artist can follow.",
    k: ["Groups evaluated as inlined nodes vs as opaque units: inlining allows cross-boundary optimization and caching; opaque units isolate behavior and prevent sharing.", "Relative vs absolute node paths in expressions: relative paths survive copying a group; absolute paths are readable and break when moved."],
    p: ["Copying a group that contains expressions with absolute paths leaves the copy controlled by the original.", "Errors inside deeply nested groups are reported without a path and take a long time to find."],
    v: "Wrap three nodes in a group, render before and after, and confirm identical pixels; then copy the group and confirm each copy's expressions refer to its own internals.",
    dep: ["node-and-knob-model","gizmos-and-macros","expression-language"]
  },
  "metadata-propagation": {
    s: "Carries information such as frame rate, color space, camera data and timecode along the graph, so downstream nodes and writers know how to treat pixels.",
    d: "Each image carries a dictionary of attributes. Source nodes fill it from file headers, and operators pass it along, modify it or drop it. Typical contents are the source color space, shot and take identifiers, lens and exposure data, timecode and the original window. Merging nodes must decide which input's metadata wins. Writers embed it in output files. It is hard because there is no universal rule: an operator that changes resolution invalidates some values, and silently dropped metadata breaks color handling at the end of the chain.",
    k: ["Pass metadata from the first input vs merge all inputs: first-input is predictable; merging keeps more information and creates conflicts.", "Metadata as advisory vs as binding: advisory metadata lets artists override; binding metadata prevents mistakes and blocks legitimate corrections."],
    p: ["A merge that discards the background's metadata writes a file without the correct color tag.", "Stale timecode survives a retime and misleads editorial."],
    v: "Read a clip carrying a known color space and timecode tag, pass it through several operators and a merge, write a file, and confirm the written file's header has the expected tags.",
    dep: ["image-attributes","node-and-knob-model","writers-and-encoders"]
  },
  "memory-cache": {
    s: "Keeps recent node outputs in memory keyed by what produced them, so repeated requests such as scrubbing and small edits are returned instantly.",
    d: "Cache entries are keyed by node, its parameter state hash, the upstream hashes, the frame and the region or tile. The cache has a size limit and an eviction policy, usually least recently used with cost awareness, so cheap images are evicted before expensive ones. Everything the engine requests passes through it, which makes it the main performance device of an interactive session. It is hard because key correctness decides everything: too coarse and stale images appear, too fine and nothing hits.",
    k: ["Cache every node vs only selected nodes: caching everything maximizes reuse and consumes memory fast; selective caching is lean and requires heuristics.", "Least recently used vs cost-aware eviction: recency is simple and discards expensive results; cost-aware retains slow-to-compute images and needs measurements."],
    p: ["A key that omits a hidden dependency returns an old image after a parameter change.", "A cache sized larger than physical memory pushes the system to swap and slows everything."],
    v: "Render a frame, then re-request it with no change and confirm it returns without computing any node; change one parameter and confirm only that node and its downstream nodes recompute.",
    dep: ["cache-invalidation","memory-budgeting","pull-evaluation"]
  },
  "disk-cache": {
    s: "Writes computed frames to local or shared storage so playback and later sessions can reuse them without recomputation.",
    d: "A disk cache stores frames, usually in a fast uncompressed or lightly compressed format, under keys derived from the graph state. It lets artists play a slow section at real time and survives restarting the session. It can be per node, in which a node is told to cache itself, or session-wide. Writes happen in the background. It is hard because storage is finite and slow if networked, cleanup is manual, and stale caches from changed upstream nodes must be detected reliably.",
    k: ["Local fast storage vs shared storage: local is fast and private; shared lets others reuse and is limited by network bandwidth.", "Automatic keys from graph state vs manual cache nodes: automatic keys remove errors and fill the disk; manual nodes are predictable and rely on artists remembering to refresh."],
    p: ["A cache keyed only by file name serves old frames after the source is replaced.", "Disks fill with caches no one deletes, then writes fail in the middle of a render."],
    v: "Fill the disk cache for a range, restart the tool, play the range and confirm frames load from cache without evaluation; edit an upstream node and confirm affected frames are marked stale and recomputed.",
    dep: ["cache-invalidation","image-sequences","network-storage-access"]
  },
  "proxy-resolutions": {
    s: "Works at a reduced scale, such as half or quarter resolution, to evaluate faster, then renders at full resolution for output.",
    d: "A proxy mode scales source images on read, or reads pre-generated lower-resolution copies, and the graph processes the smaller images. Parameters expressed in pixels must scale with it, or they behave differently. Many tools define parameters in terms of the full-resolution format so they remain consistent. Switching is global and the output is always full resolution. It is hard because results are not identical: filters, blurs and tracked offsets behave differently at lower resolution, and some operations are only judged correctly at full size.",
    k: ["Scale on read vs pre-generated proxies: scaling on read needs no preparation and still reads full frames; pre-generated proxies read less data and need a pipeline step.", "Pixel parameters scale automatically vs stay literal: automatic scaling keeps the look consistent; literal values are simple and change the result."],
    p: ["A blur size in pixels looks right in half resolution and twice too small at full resolution.", "Approving a look judged only at proxy resolution hides noise or edge detail problems."],
    v: "Render a graph at full and half resolution proxy, upscale the half result, and compare: confirm the structure matches within a small tolerance and that a blur's apparent size is equal in both.",
    dep: ["resolution-independence","sequence-readers","display-and-data-windows"]
  },
  "cache-invalidation": {
    s: "Decides when stored results are no longer valid, by hashing the inputs and parameters that produced them and comparing them on every request.",
    d: "Each node computes a hash from its own parameters, the hashes of its inputs, its code version and any external files it reads, including modification times. A cached image is valid only if its recorded hash equals the current one. Changing a parameter changes that node's hash and every downstream one automatically. Time-varying values, random seeds and file contents must all enter the hash. It is hard because hidden inputs, such as a file replaced in place or a global setting, produce stale images that look correct.",
    k: ["Hash of inputs vs explicit dirty flags: hashes are automatic and recomputed on every request; flags are cheap and are missed when a change path forgets to set them.", "Content hash of files vs modification time: content hashes are exact and slow on large frames; modification times are fast and wrong after copies that preserve times."],
    p: ["A file overwritten in place with the same size and time keeps the old frame in the cache.", "A random seed missing from the hash makes cached grain differ from a fresh render."],
    v: "Replace a source frame on disk with different content, request the frame, and confirm the cache is bypassed and the new pixels appear, then change nothing and confirm the next request hits.",
    dep: ["node-and-knob-model","memory-cache","disk-cache"]
  },
  "precomp-and-freeze": {
    s: "Renders part of a graph to files and replaces it with a reader of those files, trading flexibility in that part for speed and stability.",
    d: "A precomp writes the output of a heavy or finished branch, such as a cleanup or a keyed element, to an image sequence, then reads it back in place of the original nodes. A freeze does this inside the same script and can be switched. The result is quicker interaction and a fixed input for farm tasks, and it is common for expensive tracked cleanup. It is hard because the frozen result goes out of date when upstream changes and nothing forces a refresh, and because the intermediate format must keep full range and channels.",
    k: ["Precomp to files vs keep the live graph: files are fast and stable; the live graph is always current and slow.", "Lossless intermediate vs compressed intermediate: lossless keeps exactness and uses space; lossy is small and can add banding or artifacts that compound."],
    p: ["An old precomp keeps feeding the final render after the plate was re-scanned.", "A precomp written in a limited range clips highlights that later operations needed."],
    v: "Precomp a branch, replace it with its reader, and confirm the downstream render is identical to the live graph render; then change an upstream parameter and confirm the tool flags the precomp as out of date.",
    dep: ["sequence-readers","writers-and-encoders","cache-invalidation"]
  },
  "playback-cache": {
    s: "Pre-computes frames ahead of the playhead into memory so playback runs at the project frame rate even when evaluation is slower.",
    d: "Pressing play starts a background process that evaluates frames in order and stores them in a ring or in a reserved memory area, then plays from there. Frames shown are display-ready, with exposure and display transform applied, so they use fewer resources than working data. Any edit invalidates affected frames. The size limits the length of real-time clips at a given resolution. It is hard because it hides the cost of the graph: a clip plays smoothly while the comp may take ten seconds a frame, so artists must not confuse the two.",
    k: ["Cache display-ready 8-bit frames vs floating-point working frames: display-ready frames are small and cannot be re-exposed; working frames allow adjustments and use four times or more memory.", "Cache the whole range vs a sliding window: the whole range loops forever and needs memory; a window is bounded and re-evaluates on each loop."],
    p: ["A cached frame played after an edit shows the previous result because invalidation missed it.", "Reading real-time playback as proof that the comp renders quickly."],
    v: "Fill the playback cache for a 48-frame range, play it with the frame counter overlay, and confirm the achieved rate equals the project rate, while a cached-frame indicator turns off for frames after an edit.",
    dep: ["memory-cache","timeline-and-frame-range","display-transforms"]
  },
  "pixel-types": {
    s: "The numeric format of each channel: 16-bit half float, 32-bit float or integer, chosen to balance range, precision and size.",
    d: "Floating-point pixels store values below zero and far above one, which scene-referred light needs. Half floats use 16 bits with about three decimal digits of precision and a large range, and are common for files and intermediate storage; 32-bit floats are used for computation and for data such as depth or position. Integer formats of 8, 10 or 16 bits suit display and delivery and clip. Conversion between types has rules for rounding and clamping. It is hard because precision limits show up late as banding, and data channels need full precision.",
    k: ["Half float vs 32-bit float: half halves memory and bandwidth and has limited precision for large values or accumulations; 32-bit is exact and heavy.", "Convert at the boundaries vs carry the source type: converting once to float simplifies operators; carrying types saves memory and multiplies code paths."],
    p: ["Storing depth or position in half floats quantizes them into visible steps.", "Saving a working image to an integer format clips all values above one."],
    v: "Write a gradient that includes values from -1 to 100 as half float and as 8-bit integer, read both, and confirm the half file retains the full range within precision while the integer file clamps to zero-to-one.",
    dep: ["float-precision"]
  },
  "channel-sets": {
    s: "The named channels an image carries, such as red, green, blue, alpha, depth and any number of extra layers for passes and data.",
    d: "Each image holds a set of named channels, grouped into layers: the color layer, a depth layer, lighting passes, vectors, object identifiers. Operators declare which channels they read and write, so a node can process only the color and pass others through, and the engine can skip loading unused ones. Channel names follow conventions that downstream tools understand. It is hard because dozens of passes use memory fast, and a node that touches all channels indiscriminately damages data channels that should not be filtered or graded.",
    k: ["Dynamic named channels vs a fixed set: named channels support any pass and need conventions; a fixed set is simple and cannot carry arbitrary render outputs.", "Process all channels by default vs selected channels: all channels is convenient and risks corrupting data; selected is safe and verbose."],
    p: ["A grade applied to all channels also changes the normal and position passes.", "Misspelled channel names produce an empty layer that raises no error."],
    v: "Load a render with twenty named layers, grade only the color layer, and confirm all other layers are bit-identical to the input while the color changed as expected.",
    dep: ["pixel-types","image-attributes"]
  },
  "alpha-and-coverage": {
    s: "The channel describing how much of a pixel is covered by the foreground, treated consistently as coverage and as opacity in blending.",
    d: "Alpha ranges from zero for empty to one for opaque, and for anti-aliased edges it represents the fraction of the pixel covered. Compositing formulas treat it as opacity. Alpha can exceed one in light-adding elements such as fire, where additive color is wanted. Mattes, roto and renders all deliver it with various conventions about premultiplication. Many tools carry a single alpha shared by all color channels. It is hard because renderers differ in how they handle overlapping transparent surfaces and edge coverage, and mixing them gives subtle inconsistent edges.",
    k: ["One alpha for all color vs per-channel alpha: one alpha is standard and simple; per-channel alpha models colored transparency and is rarely supported.", "Clamped alpha vs unclamped: clamped keeps blending correct; unclamped lets additive elements carry light and can cause strange results in over."],
    p: ["An alpha delivered inverted or with different premultiplication gives a black or a glowing edge only after final composite.", "Adding unclamped alpha produces values above one that over-brighten overlaps."],
    v: "Render a half-covered pixel edge, read its alpha value, and confirm it equals the coverage fraction; composite over black and white backgrounds and confirm both match the expected blend.",
    dep: ["channel-sets","pixel-types"]
  },
  "multipart-containers": {
    s: "Image files holding several independent images or parts, each with its own channels, size and type, such as separate beauty, deep and data parts.",
    d: "A multipart container stores parts with their own headers, each a scanline, tiled or deep image. This keeps channels with different resolution or compression apart, supports deep data alongside flat images, and enables reading just the part needed. Names and types identify parts. Readers expose them as layers or as separate outputs. Writers decide on grouping and compression per part. It is hard because tools differ in what they preserve on resave, and a part dropped by one tool is not noticed until a downstream stage needs it.",
    k: ["One multipart file per frame vs many single files: one file is neat and ties passes together; separate files are easy to replace individually and multiply file counts.", "Compress parts differently vs uniformly: different compression suits data and color separately and complicates tools; uniform is simple and wasteful."],
    p: ["Resaving through a tool that does not know multipart collapses it to the first part.", "Per-frame files with dozens of parts overload storage metadata operations."],
    v: "Write a file with color, depth and a deep part, reopen it, and list the parts: confirm all three exist with the correct names, types and sizes, and that reading only the depth part does not load the others.",
    dep: ["channel-sets","deep-samples","compression-codecs"]
  },
  "image-attributes": {
    s: "Metadata attached to an image: pixel aspect, color space tag, frame rate, timecode, camera and lens data, and custom studio fields.",
    d: "Attributes live in headers and travel with images through the graph. Standard ones define how to interpret pixels: the color space, the pixel aspect ratio of anamorphic footage, the premultiplication state and the display window. Others describe the shot: exposure, lens, take. Studios add custom ones for show and shot identifiers. Tools must preserve unknown attributes. It is hard because attributes are only trusted when they are right, and files from varied sources arrive with missing or wrong tags that artists must override deliberately.",
    k: ["Trust the file's tags vs configured rules by path: tags are self-describing and sometimes wrong; path rules are controlled by the studio and do not follow files that move.", "Preserve unknown attributes vs drop them: preserving keeps studio data intact and grows headers; dropping is clean and loses traceability."],
    p: ["A wrong pixel aspect tag leaves anamorphic footage squeezed in the final.", "An attribute silently dropped by an operator breaks a later automated step that needed it."],
    v: "Read a file with a custom attribute, pass it through a graph and write it, then read the written file and confirm the custom attribute and the color space tag are present with unchanged values.",
    dep: ["pixel-types"]
  },
  "display-and-data-windows": {
    s: "Two rectangles describing an image: the display window is the intended frame, and the data window is the region that actually holds pixels.",
    d: "The data window can be smaller than the frame, as for an element or roto that covers a small area, or larger, as for overscan beyond the frame that lets blurs and distortions pull in real data at the edges. Operators compute and carry the bounding box of non-empty pixels so empty areas cost nothing. Outside the data window, pixels are treated as zero or as a chosen edge behavior. It is hard because windows change through the graph and writers must decide which to output, and the confusion between the two leads to cropped or oversized files.",
    k: ["Bounding boxes carried through the graph vs full-frame images: boxes save memory and time on small elements; full frames are simple and wasteful.", "Edge behavior black vs clamp vs mirror: black is physically empty and creates dark edges after filters; clamp repeats edge pixels and avoids them while inventing data."],
    p: ["A blur at the frame edge darkens because pixels beyond the data window are zero.", "Writing the data window instead of the display window gives files of inconsistent sizes."],
    v: "Create a small element with a data window of 100 by 100 inside a 1920 by 1080 display window, merge it over a plate, and confirm only that region is computed and the output equals the plate elsewhere.",
    dep: ["image-attributes"]
  },
  "image-sequences": {
    s: "A series of numbered frame files treated as one moving image, the usual way film-resolution material is stored for compositing.",
    d: "Each frame is a separate file with a frame number in its name, which suits parallel reading and writing, per-frame replacement and random access. A sequence is identified by a pattern and a frame range, and gaps or missing frames must be detected and handled by a policy: error, black or hold. Frame rate and timecode come from metadata or project settings. Millions of files stress file systems. It is hard because numbering conventions vary and a mismatch between the sequence and the script's range gives a silent error.",
    k: ["One file per frame vs a single movie file: sequences allow parallel access and exact frames and create many files; movies are tidy and make random access and replacement harder.", "Error on a missing frame vs hold the nearest: erroring prevents shipping holes; holding keeps playing and hides a defect."],
    p: ["A missing middle frame holds the previous one and creates a visible stutter nobody reports.", "Padding mismatch between four and five digit numbers makes the reader find nothing."],
    v: "Point a reader at a sequence with frame 57 deliberately deleted and confirm the tool reports exactly frame 57 as missing, and a render in error mode stops there instead of writing a repeated frame.",
    dep: ["path-and-frame-patterns","sequence-readers"]
  },
});
