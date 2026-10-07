// Details for the graphics renderer plate, part 3: GPU memory, uploads and streaming, binding and pipeline state.
ATLAS.details("graphics-renderer", {
  "memory-heaps": {
    s: "The physical pools of memory the device exposes, such as device-local and host-visible, and the memory types that describe how each can be accessed.",
    d: "At startup the renderer queries heaps and types: fast device-local memory the CPU cannot touch, host-visible memory the CPU can write and the GPU reads across the bus, and a small device-local, host-visible window on some systems. Integrated GPUs share one pool. Each allocation picks a type from a resource's requirements and the intended use. The renderer allocates few, large blocks because the number of allocations is limited and each is slow. Choosing the wrong type, such as a render target in host memory, silently works and runs many times slower.",
    k: ["Query and select memory types per resource vs hard-code a mapping: querying adapts to unified and discrete GPUs; a fixed mapping is simple and wrong on half the hardware.", "Large blocks suballocated later vs one allocation per resource: blocks respect allocation count limits and need an allocator; per-resource is trivial and hits limits in the thousands."],
    p: ["A frequently read buffer placed in host-visible memory runs at bus speed and halves frame rate.", "Hitting the maximum allocation count on a large scene fails creation of unrelated resources."],
    v: "Log the chosen memory type for every resource class on a discrete and an integrated GPU. Render targets and static meshes must land in device-local memory on both, and per-frame constants in host-visible.",
    dep: ["device-creation", "feature-queries"]
  },
  "sub-allocator": {
    s: "Carves many buffers and textures out of a few large memory blocks, handling alignment, fragmentation and freeing.",
    d: "Strategies include linear bump allocators for per-frame data, pools of equal-size blocks for common sizes, and general allocators such as buddy or two-level segregated fit for mixed lifetimes. Each resource's alignment and size come from the device and may differ between buffers, textures and special targets. Dedicated allocations are used for very large or render-target resources where the driver benefits. Defragmentation can move resources to compact memory but requires copying and updating every reference. Fragmentation is the quiet failure: total free memory is enough and no single block is.",
    k: ["General-purpose allocator vs per-lifetime linear arenas: a general allocator handles anything and fragments over time; arenas are fast and free in bulk and need lifetimes known in advance.", "Defragment at run time vs size pools conservatively: defragmentation recovers memory and costs complexity and copies; conservative pools waste memory but never move data."],
    p: ["A long play session fragments texture memory until a large allocation fails despite free space in total.", "Ignoring buffer-to-image granularity rules lets neighboring resources corrupt each other."],
    v: "Run an allocation stress test of random sizes and lifetimes for an hour. Report fragmentation as the largest free block over total free, and confirm no allocation fails below the configured occupancy.",
    dep: ["memory-heaps"]
  },
  "resource-aliasing": {
    s: "Placing several resources in the same memory range when they are never live at the same time, to reduce peak memory.",
    d: "Resources are created without memory and bound later to a range of a heap. Two aliased resources may overlap if their lifetimes do not, and the renderer must insert a barrier when memory changes owner, because the old contents are undefined and caches may hold stale data for the previous resource. The render graph is the main client, aliasing transient targets, and it also benefits shadow atlases and streaming pools. Aliasing needs an API that separates resource and memory creation and has rules about which resource types can share a heap.",
    k: ["Alias transient resources vs dedicated memory for each: aliasing can save large amounts of memory; it requires correct activation barriers and makes uninitialized reads a bug.", "Aliasing across different resource types vs same type only: cross-type shares more and runs into heap tier restrictions on some hardware."],
    p: ["Skipping the aliasing barrier lets the new resource see leftover compressed data and shows corrupt pixels.", "Two aliased resources both turn out to be live at once because a lifetime calculation missed a pass."],
    v: "Enable aliasing and capture total allocated memory against a build with it off. The saving must match the plan. Run with validation and confirm no hazards on aliased pairs.",
    dep: ["memory-heaps", "sub-allocator", "barriers"]
  },
  "buffers": {
    s: "Linear GPU memory objects used for vertices, indices, constants, structured data, indirect arguments and acceleration structure storage.",
    d: "A buffer is created with a size and usage flags that say how it will be accessed, such as vertex input, uniform data, storage read-write, copy source or destination, indirect arguments or device address. Usage flags limit where it can be used and may restrict memory placement. Large buffers are common: one for all vertices, one for all indices, sub-ranges per mesh. Constant data uses alignment rules and small sizes, and shader-visible structure layouts must match the CPU exactly. Buffers have no layout transitions but still need barriers for read-after-write.",
    k: ["Few large shared buffers vs one buffer per mesh: shared buffers reduce binding changes and suit indirect draws; per-mesh buffers are simple to free and increase object count.", "Device addresses in shaders vs descriptors for buffers: addresses are flexible and skip descriptor management; descriptors give bounds checking and work on all hardware."],
    p: ["A buffer created without a needed usage flag fails at the first use rather than at creation.", "Struct layout rules put a three-component vector at a different offset than the CPU struct assumed."],
    v: "Write a known pattern from the CPU, read it in a compute shader, write results, and read back. Contents must match exactly for every struct field, which proves offsets and barriers.",
    dep: ["sub-allocator", "memory-heaps"]
  },
  "textures": {
    s: "Multi-dimensional image resources with a format, size, mip chain and array layers, used as render targets, shader inputs and storage.",
    d: "A texture's format determines bytes per texel, color space, and whether hardware can filter, blend or write it. Mip chains support filtering at distance, arrays hold atlases and cascades, and multisampled variants support anti-aliasing. Block-compressed formats cut memory and bandwidth by a factor of four to eight for most art. The driver chooses a tiled internal layout that is opaque, which is why upload goes through a copy command and not a raw write. Render targets may also have extra metadata that makes fast clears and compression possible.",
    k: ["Block-compressed formats vs uncompressed: compressed saves memory and bandwidth and adds loss and an offline encoder; uncompressed is exact and four to eight times larger.", "sRGB formats vs manual conversion in shaders: sRGB gets correct filtering in hardware; manual conversion works for any format and filters wrong values."],
    p: ["Sampling a color texture as linear when it holds sRGB data makes the whole scene look too dark.", "A texture created without a mip chain shimmers at distance because the lowest level is sampled."],
    v: "Upload a gradient texture, render it minified and magnified, and compare with a reference. Check that mip transitions are smooth and that the format reports the expected bytes per texel.",
    dep: ["sub-allocator", "memory-heaps"]
  },
  "resource-views": {
    s: "Typed windows onto buffers and textures that select format, mip range, array slices and usage, plus sampler objects that define filtering.",
    d: "Shaders never use the resource directly. They use a view, which interprets the same memory as a specific type, such as sRGB or linear, one mip, a cube, or an array. A render target view, depth view, shader resource view and storage view are separate. Samplers define filtering, address modes, anisotropy and comparison functions, and are few enough to share. In explicit APIs views are objects or descriptors that must be created and kept alive for as long as any pending work uses them. Views of a texture must match its declared usage and format class.",
    k: ["Create views on demand and cache them vs create all up front: caching is efficient and requires a hash and lifetime tracking; up front is simple and creates many unused views.", "Few static samplers vs per-material samplers: static samplers are cheap and fixed; per-material samplers give control and use descriptors."],
    p: ["A cached view that outlives its destroyed texture gets reused and refers to freed memory.", "Reading a depth texture through a color view format gives undefined values on some GPUs."],
    v: "Create views of one texture as sRGB, linear and single-mip, sample each, and confirm outputs differ exactly as expected. Destroy the texture and confirm the cache invalidates its views.",
    dep: ["textures", "buffers", "descriptor-pools"]
  },
  "residency-manager": {
    s: "Tracks which allocations are resident in device memory and moves resources in and out when the working set exceeds what the GPU can hold.",
    d: "Drivers can page memory over the bus when device memory runs out, which is dramatically slow. The residency manager keeps a record of each resource's last use, priority and size, evicts or demotes least valuable items before the budget is hit, and ensures a resource is resident before submitted work that uses it. On some APIs this is explicit calls to make memory resident or evict it; on others it is priorities and budget queries. It interacts with streaming and aliasing, and the hard part is predicting what the next frames will touch.",
    k: ["Explicit residency with eviction vs rely on the driver's paging: explicit control avoids stalls and needs tracking per resource; driver paging is automatic and produces unpredictable hitches.", "Priority by last-used frame vs by importance class: recency is simple and evicts rarely used big textures; classes protect critical data and need authoring."],
    p: ["Using a resource that was evicted without making it resident again causes a device removal.", "The sum of in-flight frames' working sets exceeds the budget even though one frame fits."],
    v: "Allocate more than the device budget in a test and confirm the manager evicts low-priority items, the frame time stays flat, and the log shows no driver-initiated paging.",
    dep: ["memory-budget", "memory-heaps", "texture-streaming"]
  },
  "memory-budget": {
    s: "Run-time accounting of GPU memory use against the amount the operating system currently allows this process, with policies for what to drop when it shrinks.",
    d: "The system reports a budget and current usage per heap, and the budget can fall when other programs run. The renderer tracks its own allocations by category, such as textures, geometry, targets and acceleration structures, compares them with the budget each frame, and acts: lowering texture streaming quality, reducing render resolution, dropping optional caches or refusing new allocations. Per-platform fixed budgets on consoles are decided in advance. The difficulty is giving every system a share, and making degradation graceful and not a crash.",
    k: ["Static per-system budgets vs a dynamic shared pool: static budgets are predictable and waste memory; a pool uses all of it and one system can starve others.", "Degrade quality automatically vs fail the allocation: degrading keeps the game running at lower fidelity; failing is simple and loses the session."],
    p: ["The renderer reads the budget once at startup and never notices it shrink when another application launches.", "Counting only texture memory leaves acceleration structures and targets unbudgeted, so totals overshoot."],
    v: "Reduce the available budget while running, using a test hook, and confirm streaming lowers resident mip levels within a few frames, with category totals summing to the reported usage.",
    dep: ["memory-heaps", "sub-allocator"]
  },
  "staging-ring": {
    s: "A ring of host-visible memory the CPU writes each frame, from which copy commands move data into device-only resources.",
    d: "Per-frame dynamic data, such as constants, instance transforms and mesh updates, is written into a ring buffer sized for several frames in flight. A head pointer advances as data is written, and each region is tagged with the frame that used it, so it is reused only after that frame's fence signals. Copy commands transfer the data into device-local buffers or textures. If the ring fills, writers must wait or grow. The ring avoids per-upload allocation and keeps all writes sequential, which is friendly to write-combined memory.",
    k: ["Single ring sized for the worst case vs growable chunks: one ring is simple and may waste memory; chunks adapt and need chained management.", "Write directly to host-visible GPU-read memory vs stage and copy: direct is simple for small per-frame data; staging is needed to reach fast device-local memory."],
    p: ["Reading from write-combined memory on the CPU is slow and looks like a performance mystery.", "Reusing a region before the frame that read it has finished corrupts that frame's data."],
    v: "Fill the ring beyond capacity in a test and confirm writers block until the fence for the oldest frame signals, and no region is overwritten while in flight, checked by writing frame-number patterns.",
    dep: ["buffers", "fences", "frames-in-flight"]
  },
  "copy-queue-uploads": {
    s: "Uses the dedicated copy queue to move assets into GPU memory asynchronously, in parallel with rendering.",
    d: "Hardware often exposes a queue backed by DMA engines that can copy at full bus speed while the graphics queue renders. The renderer submits copy batches for textures and meshes on it, signals a timeline value on completion, and the graphics queue waits on that value before first use. Resource ownership may need an explicit transfer to the graphics queue. Batches are sized to avoid long single submissions. Pitfalls are the extra synchronization and the fact that the copy queue cannot do format conversion or decompression, which must be done before or by compute.",
    k: ["Dedicated copy queue vs copy on the graphics queue: the copy queue overlaps with rendering and adds fences and ownership transfers; the graphics queue is simple and competes with draw work.", "Large batches vs many small copies: large batches use bandwidth well and delay the first resource; small copies deliver early and cost submission overhead."],
    p: ["Using a resource on graphics before the copy fence is waited on renders half-uploaded data.", "Missing the queue ownership release and acquire pair makes a texture read as garbage on some drivers."],
    v: "Stream textures during a camera sweep and capture queue timelines. Copy work must overlap graphics work, frame time must not rise, and every texture must pass a checksum comparison after upload.",
    dep: ["queue-families", "timeline-semaphores", "ownership-transfer", "staging-ring"]
  },
  "texture-streaming": {
    s: "Loads only the mip levels each texture currently needs, based on how large it appears, and drops the rest to fit memory.",
    d: "Each streamable texture keeps its smallest mips always resident. A streaming manager computes a desired mip per texture from distance, screen size and priority, ranks requests under the memory budget, and issues read, decompress and upload work. Higher mips are allocated in a pool and become visible when upload completes. Shaders clamp sampling to the available level so missing data blurs instead of failing. The challenge is latency, because a fast camera turn needs data before the disk can supply it, so the system prefetches and biases toward keeping more resident.",
    k: ["Whole-mip streaming vs tile-based virtual texturing: mip streaming is simple and moves large chunks; tiles give finer control and need an indirection step in shaders.", "Aggressive eviction vs hysteresis: aggressive saves memory and thrashes at boundaries; hysteresis is stable and uses more."],
    p: ["Fast camera turns show blurry textures for seconds while higher mips load.", "Raising the budget for one scene starves a texture class in another because requests share a queue."],
    v: "Teleport the camera in a test level and measure the time until all visible textures reach their desired mip. It must meet the target, with resident texture memory under budget throughout.",
    dep: ["copy-queue-uploads", "residency-manager", "textures"]
  },
  "virtual-texturing": {
    s: "Treats a very large texture as pages, keeping only pages the camera sees in a physical cache and mapping them through an indirection texture.",
    d: "A feedback pass renders which virtual pages each pixel wants at which resolution, into a small buffer. A CPU or GPU process reads it, loads the missing pages and writes them into a physical page cache texture, then updates a page table texture. Shaders translate virtual coordinates through that table. Hardware sparse resources can do this natively on some devices. The result is unlimited texture area with bounded memory. Costs are the feedback pass, extra filtering at page borders, and latency, which shows as blur until pages arrive.",
    k: ["Software page table vs hardware sparse residency: software works everywhere and adds shader math; hardware is transparent to shaders and limited by support and page size.", "Feedback from the main pass vs from a separate low-resolution pass: main-pass feedback is accurate and free-ish; a separate pass is decoupled and costs geometry."],
    p: ["Filtering across page borders without padding shows visible seams on page edges.", "A page requested while a feedback frame is late never arrives and the pixel stays blurry."],
    v: "Fly over a terrain with an eight-gigabyte virtual texture and confirm resident memory stays at the cache size, and screenshots at stop show full sharpness within the page latency target.",
    dep: ["texture-streaming", "residency-manager", "readback"]
  },
  "geometry-streaming": {
    s: "Loads and evicts mesh data, such as clusters of a high-detail model, according to what the view needs, keeping vertex and index memory bounded.",
    d: "Detailed meshes are organized as hierarchies of clusters with an error metric, and only the clusters needed for the current view and error threshold are resident. A streaming manager reads requested cluster pages, uploads them into a large pool in the geometry buffer through the staging path, and updates GPU-visible tables, while the culling pass skips clusters that are not resident and falls back to a coarser parent. This enables scenes with far more geometry than memory. It needs a page allocator, a compressed on-disk format and careful ordering of table updates.",
    k: ["Stream cluster pages vs load whole meshes: pages scale to huge models and need hierarchical data; whole meshes are simple and bound by memory.", "Fall back to coarse parents vs wait for data: fallback hides latency and shows brief pops; waiting is clean and stalls the frame."],
    p: ["A table updated before the page's data finishes uploading makes the GPU read garbage triangles.", "Overly eager prefetch fills the pool with data for a direction the camera does not go."],
    v: "Fly through a dense model with a pool smaller than the model. Resident memory must stay at the pool size, and visible geometry error must stay under the threshold except during measured transitions.",
    dep: ["copy-queue-uploads", "residency-manager", "gpu-driven-culling", "buffers"]
  },
  "readback": {
    s: "Copies GPU results back to host-visible memory for the CPU to read, delayed by frames in flight so the CPU never stalls waiting for the GPU.",
    d: "Anything the CPU wants from the GPU, such as occlusion feedback, picking, virtual texture requests, screenshots or profiler data, is copied into a host-visible buffer at the end of a pass. Reading it immediately would require waiting on a fence and stall the pipeline. Instead the renderer reads it N frames later, from a ring of readback buffers, when the fence for that frame has passed. Latency is the price, so consumers must tolerate old data. Some APIs also need cache invalidation before the CPU sees it.",
    k: ["Delayed asynchronous readback vs blocking wait: delayed keeps full frame rate and results are old; blocking is immediate and stalls the pipeline for the whole frame's work.", "Dedicated readback buffers per frame vs one shared buffer: per frame avoids hazards and uses more memory; one shared buffer is small and needs strict synchronization."],
    p: ["Reading the buffer before its fence signals returns last frame's or zeroed data without any error.", "A forgotten blocking readback in a debug feature ships and halves frame rate."],
    v: "Write the frame number into a GPU buffer, read it back and compare with the current frame. The difference must equal the configured delay, and frame time must match a build with the readback disabled.",
    dep: ["fences", "frames-in-flight", "buffers"]
  },
  "descriptor-pools": {
    s: "Memory that holds descriptors, the small records telling the GPU where a resource is and how to read it, organized into heaps, pools or sets.",
    d: "Shaders access resources through descriptors stored in shader-visible memory. Some APIs expose a large heap the renderer writes directly and addresses by index; others allocate descriptor sets from pools and update them through API calls. Heaps have size limits and only one can be bound at a time per type, so the renderer allocates ranges, writes descriptors with copy operations, and frees them by frame. Samplers use separate, small heaps. Descriptors cannot be modified while the GPU may still read them unless the API says it is safe.",
    k: ["One large persistent heap with index allocation vs per-draw transient sets: one heap enables bindless and cheap binding; transient sets are simple and cost allocation and update calls per draw.", "Free list allocator vs per-frame linear ranges: free lists handle persistent descriptors; linear ranges are trivial for dynamic ones and need frame-based reclamation."],
    p: ["Overwriting a descriptor the GPU is still using from an earlier frame in flight corrupts that frame.", "Running out of heap space mid-frame forces an expensive switch of the bound heap."],
    v: "Create and free ten thousand descriptors over many frames with validation on. Reports must show no write-while-in-use errors and occupancy returning to baseline.",
    dep: ["resource-views", "frames-in-flight"]
  },
  "binding-model": {
    s: "The scheme that decides how shaders get their resources: per-draw tables, grouped sets updated by frequency, or one global index space.",
    d: "Common models group bindings by update frequency: per-frame data, per-view, per-material and per-object, each its own set or table, so only the changed groups are rebound. A renderer picks conventions for what lives in each group and keeps them across every shader, which makes layouts compatible between pipelines. More advanced models place all resources in one table and pass indices. Choice drives CPU cost per draw, descriptor memory and how easy it is to add a resource. Every pipeline layout in the project follows from it.",
    k: ["Frequency-grouped sets vs a single global table: grouping is conventional, bounded in size and cheap to rebind; a global table is the simplest at run time and needs bindless support.", "Dynamic offsets into large uniform buffers vs separate descriptors per object: offsets avoid descriptor writes and have alignment limits; separate descriptors are flexible and costly to manage."],
    p: ["Two shaders that claim the same set number but different layouts make a rebind silently reinterpret resources.", "Putting rarely changing data in the highest-frequency group causes avoidable per-draw descriptor traffic."],
    v: "Capture a frame and count descriptor binds per draw. The number must match the design, such as one rebind for per-object data, and every shader must compile against the shared layout convention.",
    dep: ["descriptor-pools", "pipeline-layout"]
  },
  "bindless": {
    s: "Gives shaders access to large arrays of descriptors, so any texture or buffer can be selected by an index at run time with no per-draw binding.",
    d: "All textures and buffers are written once into a big descriptor array, and shaders receive indices through constants, per-instance data or a material table. The CPU no longer sets up descriptors per draw, which enables GPU-driven rendering, ray tracing material lookup and visibility-buffer shading. The array must be updatable while in use, with a lifecycle of free slots that are reused only after frames in flight finish. Non-uniform indexing needs shader support and can be slower when threads in a group use different indices.",
    k: ["Fully bindless vs hybrid with a few bound sets: fully bindless suits GPU-driven designs and removes binding code; hybrid works on more hardware and needs both paths.", "Bounds checking on indices vs trusting them: checking catches stale indices and costs a little; trusting is fastest and turns bugs into device hangs."],
    p: ["A stale index pointing at a freed slot samples another resource that reused it, showing wrong textures.", "Non-uniform indices without the proper qualifier produce correct results on one GPU and garbage on another."],
    v: "Draw a hundred materials with textures selected only by index and compare with a bound-descriptor build. Images must match exactly, and the capture must show no per-draw descriptor updates.",
    dep: ["descriptor-pools", "pipeline-layout", "feature-queries"]
  },
  "pipeline-layout": {
    s: "The declaration of what resources and constants a pipeline's shaders expect, in a root signature or pipeline layout, which commands bind against.",
    d: "A layout lists descriptor tables or sets, in order, with their types and visibility to shader stages, plus inline root descriptors and constants. Pipelines are created against a layout, and descriptors are bound by position. Compatible layouts let the renderer keep earlier bindings when switching pipelines, so ordering by update frequency avoids rebinding. Layouts have limited space for inline data, which pushes rarely used parameters into tables. Mismatches between the layout and what the shader reflects are a source of errors that validation finds and drivers sometimes tolerate silently.",
    k: ["A few shared layouts vs one layout per shader: shared layouts keep bindings stable between pipelines and may include unused slots; per-shader layouts are minimal and require rebinding on every switch.", "Generate from reflection vs declare by hand: generated layouts always match shaders; hand-written ones allow deliberate sharing and drift."],
    p: ["A layout with more inline root data than the hardware's fast space spills to memory and slows every draw.", "A layout that does not match the shader's resource declaration passes on one driver and fails on another."],
    v: "Create every pipeline against the project's layouts with validation enabled, and confirm no layout mismatch messages. Print per-layout inline data size and check it is under the limit.",
    dep: ["shader-reflection", "descriptor-pools"]
  },
  "push-constants": {
    s: "A few bytes of data written directly into command buffers and read by shaders, for small per-draw values such as indices and flags.",
    d: "Push and root constants store values in the command stream or fast on-chip registers, with no buffer or descriptor needed. The renderer uses them for a draw's object index, material index, or a pass parameter. The space is tiny, often 128 to 256 bytes, shared across stages, and large values cost every draw. They are updated cheaply between draws, which makes them the standard way to feed an index into bindless data. Changing them inside a recorded sequence is safe because the values are captured when recorded, not read later.",
    k: ["Constants for small per-draw indices vs a per-draw buffer slice: constants are the fastest and tiny; buffer slices hold larger structures and need an address or descriptor.", "Share one range across stages vs separate per stage: shared is simple and limited; separate ranges save space and complicate layouts."],
    p: ["Using more than the guaranteed minimum range works on desktop and fails on a mobile GPU.", "Treating them as persistent leads to stale values after a pipeline layout change resets them."],
    v: "Draw a hundred objects passing each object's index as a constant, render the index as a color, and confirm each object shows its own value. Then check the constant size against the lowest supported limit.",
    dep: ["pipeline-layout", "command-recording"]
  },
  "pipeline-state": {
    s: "A precompiled object that bundles shaders with the fixed-function state needed to draw, such as formats, blending, depth, rasterization and vertex input.",
    d: "Creating one is expensive because the driver compiles shaders into machine code specialized to the state. After creation, binding it is cheap. It is keyed by shader modules, layout, render target formats, sample count, topology and state blocks, and the number of combinations a renderer needs can reach tens of thousands. Pipelines are created ahead of time or on background threads. Some state can be left dynamic, and libraries allow the pieces to be compiled separately and linked quickly at draw time.",
    k: ["Many specialized pipelines vs few with dynamic state: specialized pipelines are fastest at draw time and large in number; dynamic state reduces count and may cost on some hardware.", "Monolithic creation vs linked pipeline libraries: monolithic gives the best code and slow creation; libraries link quickly and may produce slightly slower code."],
    p: ["Creating a pipeline on first draw on the render thread causes a visible hitch the first time an effect appears.", "A render target format mismatch between pipeline and pass makes a draw invalid or produces undefined output."],
    v: "Play a scripted traversal with a fresh cache and count pipeline creations on the render thread after the loading screen. The count must be zero, or every hitch must be accounted for.",
    dep: ["pipeline-layout", "bytecode", "render-passes"]
  },
  "pipeline-cache": {
    s: "A store of driver-compiled pipeline data that is saved to disk and reloaded, so later runs create pipelines much faster.",
    d: "The driver can serialize its internal results for a pipeline into an opaque blob. The renderer passes a cache object into pipeline creation, saves its contents at exit or periodically, and loads it at startup. The blob is tied to a specific driver version and device and carries a header the driver validates; a mismatch is rejected silently, and the renderer then compiles again. Caches can also be built on a server for known hardware. The blob is opaque, so the renderer must treat it only as bytes and handle corruption and partial writes.",
    k: ["One cache file per device and driver vs a shared multi-device file: per-device matches the validation rules and multiplies files; shared is convenient and rejected whole on mismatch.", "Save at exit vs save incrementally: exit is simple and loses data on a crash; incremental survives crashes and costs periodic disk writes."],
    p: ["A cache corrupted by a crash during write is loaded and fed to the driver, causing a crash at startup.", "A driver update invalidates every user's cache, and the next launch has a long hitching warm-up."],
    v: "Start twice and compare pipeline creation time. The second launch must be much faster, and deleting or corrupting the file must lead to a clean rebuild rather than a crash.",
    dep: ["pipeline-state", "device-creation"]
  },
  "pso-precompilation": {
    s: "Creating the pipelines a game will need before they are used, from a recorded list, so no draw waits for a compile.",
    d: "During testing, the renderer records every pipeline state it creates and stores the list with the content. At load or install time, worker threads create all of them against the real driver, filling the pipeline cache. Remaining creations at run time are done asynchronously and the draw is skipped, or drawn with a fallback, until ready. The lists must stay current as shaders and materials change, and can number tens of thousands, which makes warm-up long on first launch and requires progress UI.",
    k: ["Precompile at load vs async compile on demand with a fallback: precompile gives clean play and long loads; on-demand loads quickly and shows missing or placeholder draws.", "Recorded list from play sessions vs derived from content: recorded matches real use and can miss rare cases; derived is complete and includes many unused pipelines."],
    p: ["A stale list compiles pipelines that no longer exist and misses the new ones, so hitches return after a content update.", "Starting hundreds of compiles at once on all cores starves the game's loading threads."],
    v: "Run a fresh install through a full scripted playthrough and count render-thread pipeline compilations and the frame-time spikes above the threshold. Both must be zero after warm-up.",
    dep: ["pipeline-state", "pipeline-cache", "shader-permutations"]
  },
  "render-passes": {
    s: "A declaration of the attachments a group of draws renders into, with how they are loaded and stored, and optional subpasses that read the previous result on-chip.",
    d: "A pass starts by naming color and depth attachments and, for each, whether to load, clear or ignore its old contents and whether to store the result. Those choices determine real memory traffic, especially on tile-based hardware. Some APIs require pass and framebuffer objects, while newer ones use dynamic rendering that skips them. Subpasses or equivalents let a later draw read the result of an earlier one at the same pixel without going to memory. The renderer must keep formats and sample counts consistent between the pass and pipelines.",
    k: ["Explicit pass objects vs dynamic rendering with no objects: pass objects give the driver more information and require creation and compatibility management; dynamic rendering is simpler and gives less up-front knowledge.", "Clear vs load vs don't-care on attachments: clear is the cheapest start; load reads memory and don't-care is fastest and makes contents undefined."],
    p: ["Loading an attachment that is overwritten anyway wastes bandwidth on every frame.", "Don't-care on an attachment a later pass reads gives random contents, which looks fine on one GPU."],
    v: "Capture bandwidth counters for a frame with load operations on a fully overwritten target, then with don't-care. Bandwidth must drop, and the image must be identical.",
    dep: ["textures", "resource-views", "layout-transitions"]
  },
  "tile-based-rendering": {
    s: "Rendering paths that exploit GPUs which split the screen into small tiles processed in on-chip memory, keeping intermediate data out of main memory.",
    d: "Tile-based hardware sorts geometry into tiles and shades each tile completely before writing it out. If the renderer keeps work inside one pass, with subpasses or tile memory access, the G-buffer never leaves the chip, which saves bandwidth and power. The renderer must keep the number of passes small, avoid load operations that read memory, mark transient attachments as lazily allocated, and avoid operations that force the hardware to flush tiles, such as reading the framebuffer through a texture mid-pass. Desktop GPUs often ignore these hints, so code must work on both.",
    k: ["Single-pass deferred with on-chip G-buffer vs separate passes: single pass saves large bandwidth on mobile and needs subpass support; separate passes are portable and slower on tile hardware.", "Optimize for tile hardware first vs desktop first: tile-first is efficient on mobile and constrains graph structure; desktop-first allows many passes and hurts mobile badly."],
    p: ["A mid-pass resolve or copy forces a tile flush and doubles bandwidth, which shows as unexplained heat.", "Using lazily allocated memory for an attachment that a later pass samples loses its data."],
    v: "Run on a tile-based device with its counters and confirm external memory traffic for the G-buffer is near zero, and that frame energy per frame drops compared with a multi-pass build.",
    dep: ["render-passes", "deferred-gbuffer", "forward-lighting"]
  }
});
