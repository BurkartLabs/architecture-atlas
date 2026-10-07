// Details for the graphics renderer plate, part 5: device and hardware abstraction, diagnostics, cross-cutting concerns.
ATLAS.details("graphics-renderer", {
  "instance-adapters": {
    s: "Initializes the API, loads its runtime and enumerates the physical GPUs, or adapters, available on the machine along with their properties.",
    d: "The application creates an instance, optionally enabling validation and platform extensions, and asks it for the list of physical devices. Each reports its name, type (discrete, integrated, virtual or software), memory heaps, limits, supported features and queue families. Adapters may also be reported with the displays they drive. The list can change at run time, as with docking stations or external GPUs. Failure to find any adapter that meets the minimum requirements must produce a clear message and an optional fallback to a different API or a software path.",
    k: ["Enable layers and extensions at instance creation vs minimal instance: debug features need extensions enabled up front; a minimal instance is smaller and cannot validate.", "Enumerate once at startup vs react to adapter changes: once is simple; reacting supports hot-plug and needs recreating the device."],
    p: ["Treating the first adapter as the best picks a low-power integrated GPU on a laptop with a discrete one.", "Requesting an extension the runtime does not offer makes instance creation fail instead of degrading."],
    v: "Run on a machine with an integrated and a discrete GPU and print the adapter list. Both must appear with correct type, memory and limits, and a missing runtime must produce a readable error.",
    dep: []
  },
  "adapter-selection": {
    s: "Choosing which physical GPU to use, by checking required features and limits and scoring candidates by type, memory and user preference.",
    d: "The selector rejects adapters missing required features, queue types or formats, then ranks the rest: discrete over integrated by default, more device-local memory, higher capability tier, and a user or configuration override. Laptops may have the display connected to one adapter and the faster adapter elsewhere, which adds a copy before presenting. Multi-adapter rendering is rare and complex. The decision is logged with the reasons, because support cases start with the question of which GPU was used.",
    k: ["Automatic scoring vs asking the user to choose: scoring works without a decision and sometimes picks wrongly; a menu is accurate and requires a restart or rebuild.", "Require a minimum feature set vs adapt to whatever exists: a hard minimum simplifies the renderer and excludes old hardware; adapting reaches more users and multiplies code paths."],
    p: ["Selecting by memory size alone prefers an integrated GPU that reports system memory as its own.", "A selected adapter that cannot present to the window's display fails at swap chain creation."],
    v: "On a laptop with two GPUs, confirm the discrete one is picked by default, the override flag switches to the other, and the log states the chosen adapter and the reason.",
    dep: ["instance-adapters", "feature-queries"]
  },
  "device-creation": {
    s: "Opens a logical device on the chosen adapter with the queues, features and extensions the renderer will use, and obtains its queue handles.",
    d: "The renderer lists queue families and counts to create, enables only the features it will use, such as bindless indexing, timeline semaphores, ray tracing and mesh shaders, and requests extensions. The device is the root of every allocation and command. Creating it enables the driver's memory manager and loads function entry points. Features not requested are not usable even if present. The structure of the request is large and API-specific, and a missing or misspelled flag shows up only when a feature is used.",
    k: ["Enable only what is used vs everything available: minimal enables lower overhead and clearer requirements; enabling all is convenient and can disable driver optimizations.", "Create all queues at start vs lazily: at start is predictable; lazily saves resources and complicates ownership."],
    p: ["Using a feature that was supported but not enabled gives undefined behavior without an error on some drivers.", "Creating queues in the wrong order assigns the wrong handles to compute and copy."],
    v: "Create the device with the shipping feature list on each target GPU, run the test suite with validation, and confirm no use of an unrequested feature is reported.",
    dep: ["adapter-selection", "feature-queries", "queue-selection"]
  },
  "feature-queries": {
    s: "Asking the adapter what it supports, including optional features, format capabilities, limits and tiers, so the renderer can choose paths.",
    d: "Queries return booleans for features, numeric limits such as maximum descriptor counts and workgroup sizes, and per-format capability flags such as can-filter, can-blend and can-write. Many features have tiers whose behavior differs. The renderer builds a capability record at start, checks the minimum requirements and chooses between paths, for example ray tracing on or off or mesh shaders versus compute. Reported capabilities can be wrong or overly optimistic, so critical paths have tests on real hardware.",
    k: ["Query into one central capability record vs ad hoc queries: central record gives one place for decisions and testing; ad hoc queries are fast to write and scatter assumptions.", "Trust reported support vs maintain a driver and hardware blocklist: trusting is simple; a blocklist works around known driver bugs and needs upkeep."],
    p: ["Assuming a limit equals the specified minimum wastes capability, and assuming it is large breaks on a different GPU.", "Checking a feature flag but not the format support for it makes a render target creation fail later."],
    v: "Dump the capability record on a low-end, mid-range and high-end GPU and confirm each activates the expected paths. Force each path off and confirm the image still renders correctly.",
    dep: ["instance-adapters"]
  },
  "queue-selection": {
    s: "Deciding which queue families and indices to use for graphics, compute, copy and presentation, based on what the device exposes.",
    d: "The renderer picks a graphics family that can also present to the surface, a dedicated compute family if it exists and a dedicated copy family if present, falling back to the graphics family otherwise. Queue priorities can favor latency-sensitive work. Some devices share hardware between families, so a dedicated queue may not be independent. The result is a table of queue handles used by the submission and render graph code. Presentation support must be checked against the actual surface, since support differs by family and window system.",
    k: ["Prefer dedicated families for compute and copy vs always use the main one: dedicated families allow overlap and require ownership transfers; the main family is simple and serializes.", "Use queue priorities vs equal priority: priorities protect frame work from background tasks and are only hints on some hardware."],
    p: ["Selecting a graphics family that cannot present to the window's surface fails at present time.", "A dedicated compute queue that shares hardware with graphics shows no overlap and adds synchronization cost."],
    v: "Print the selected queue table on each test GPU. Presentation must succeed on the chosen family, and the fallback to a single family must pass the full scene suite.",
    dep: ["device-creation", "queue-families"]
  },
  "rhi-abstraction": {
    s: "A thin interface above graphics APIs that exposes devices, resources, pipelines, commands and synchronization in one shape, implemented per backend.",
    d: "The interface mirrors the explicit model, with buffers, textures, views, pipelines, command lists, queues and fences as handle types, and records commands through a common recorder. Backends translate to the native API and take care of details like memory type selection and descriptor management. The renderer above is written once against it. The level is a design choice: thin and close to the native model keeps performance and exposes the complexity; thick and simplified is easier to use and hides cost. Features missing on a backend are reported through capabilities.",
    k: ["Thin explicit interface vs high-level stateful interface: thin keeps full control and puts barriers and memory on every user; high-level is easy and gives up optimization.", "Handles with generation checks vs raw pointers: handles catch stale use and cost a lookup; pointers are fast and crash on misuse."],
    p: ["An interface shaped around one API's idioms makes the other backend slow or awkward to write.", "Leaking backend types through the interface ties the renderer to a single API."],
    v: "Run the same render test scenes on every backend and confirm matching images. Add a stub backend that only logs calls and confirm the renderer runs against it, proving no backend type leaks.",
    dep: ["api-backends", "capability-tiers", "device-creation"]
  },
  "api-backends": {
    s: "The per-API implementations of the hardware interface, each translating handles and commands to a specific native graphics API.",
    d: "Each backend owns its API's device, memory allocation, descriptor management, barrier translation, pipeline creation and presentation. Differences are large: memory models, how layouts and barriers are expressed, binding models and shader formats. Backends share code for allocators and caches where possible. Each one needs its own validation setup, debugging tools and testing on its target hardware. Keeping them in step as the interface grows is the main cost, and platform-specific backends often lag in features.",
    k: ["Maintain several native backends vs one backend plus a portability layer: native backends reach the best performance and multiply maintenance; one backend plus a layer is smaller and inherits the layer's limits.", "Share allocator and cache code across backends vs per-backend implementations: sharing reduces bugs and strains on API-specific differences; separate code is simple and duplicated."],
    p: ["A feature implemented and tested on one backend silently does nothing on another.", "Barrier translation that is right on one backend's model is wrong on another, and shows up only with validation."],
    v: "Run the full image-comparison suite on each backend on its target hardware in continuous integration, with validation on, and require every scene to match the reference within tolerance.",
    dep: ["device-creation", "memory-heaps", "pipeline-state", "barriers"]
  },
  "capability-tiers": {
    s: "Named levels of hardware capability that the renderer maps to feature sets, so content and code paths target a few known configurations instead of every GPU.",
    d: "A tier groups features, such as basic, bindless-capable with async compute, and ray tracing with mesh shaders. The capability record decides the tier at startup. Each tier selects paths: the lighting architecture, shadow technique, culling method, texture budget and whether ray tracing runs. Fewer tiers make testing practical and each one needs hardware in the test lab. Optional features beyond the tier are turned on individually. Content is authored once and scaled by tier settings.",
    k: ["A few coarse tiers vs per-feature toggles: tiers are testable and have gaps for hardware between them; toggles use all capability and make an untestable matrix.", "Choose tier automatically vs let the user override: automatic gives good defaults and misjudges some systems; override handles those and lets users break their game."],
    p: ["A tier name that implies support for a feature the hardware reports but runs very slowly leads to unplayable defaults.", "A code path used only by the top tier is never tested after the tier's hardware leaves the lab."],
    v: "Force each tier on one machine and run the scene suite. Every tier must render without errors, with the expected frame time order, and the chosen tier on each lab GPU must match the table.",
    dep: ["feature-queries", "rhi-abstraction"]
  },
  "timestamp-queries": {
    s: "Commands that write the GPU's clock into a query pool at chosen points, which the CPU reads later to measure how long each pass took.",
    d: "The renderer writes a timestamp at the start and end of each pass into a query pool slot, resolves them into a buffer and reads that back some frames later. The tick period converts values to nanoseconds, and different queues use different clocks that must be aligned to compare. Query pools are created per frame in flight. Resolution and overhead vary, and measuring in too fine a granularity changes the result by inserting stalls. Timestamps feed the profiler, the pacing logic and automatic quality scaling.",
    k: ["Timestamps around every pass vs only around groups: every pass gives detail and adds overhead; groups are cheap and coarse.", "Read back after frames in flight vs wait immediately: delayed is free and shows old data; immediate stalls the pipeline."],
    p: ["Ignoring the timestamp period yields times that are off by a constant factor on some GPUs.", "Comparing timestamps from different queues without clock calibration shows overlap that did not happen."],
    v: "Wrap a pass that is known to take a fixed time, such as a controlled number of dispatches, and compare the measured duration with an external profiler's value. They must agree within a few percent.",
    dep: ["readback", "frames-in-flight", "debug-names"]
  },
  "gpu-profiler": {
    s: "A built-in view of per-pass GPU time, memory use and counters, shown in an overlay or exported for analysis, backed by timestamps and hardware counters.",
    d: "The profiler collects timestamps per scope, builds a hierarchy by pass and by queue, and presents rolling averages and spikes on screen. It also records resource counts, draw counts, memory by category and barrier counts from the renderer. Vendor performance counter libraries can add occupancy, cache hit rates and bandwidth. Capture is exported in a trace format that the CPU profiler can merge, so CPU and GPU timelines line up. The challenge is keeping overhead low enough to run in shipping builds.",
    k: ["Always-on lightweight profiler vs on-demand heavy capture: always-on catches regressions in the field and limits detail; on-demand shows everything at the cost of disturbing timing.", "Hardware counters vs timestamps only: counters explain why a pass is slow and are vendor-specific; timestamps work everywhere and show only how long."],
    p: ["Reading profiler results from the same frame forces a stall that distorts the numbers it reports.", "Averages over many frames hide a periodic spike that players feel."],
    v: "Trigger a deliberate slow pass in a test build and confirm the overlay attributes the extra time to that pass within one frame of data, and that disabling the profiler restores frame time.",
    dep: ["timestamp-queries", "debug-names"]
  },
  "validation-layers": {
    s: "Run-time checking of every API call and its state against the specification, reporting misuse that the driver would otherwise ignore or turn into a crash.",
    d: "Validation is a layer between the application and the driver that tracks object lifetimes, descriptor contents, layouts and the synchronization state of every resource. It reports hazards, such as a missing barrier, invalid usage, and leaks. Extended modes model GPU execution to find race conditions and, on request, check shader accesses for out-of-bounds reads. It slows rendering heavily and is enabled in development and continuous integration, with test runs required to produce zero messages. Message callbacks route to the log and fail the build.",
    k: ["Always on in development vs on demand: always on catches misuse as it is written and slows iteration; on demand is fast and misses errors until later.", "Fail tests on any message vs triage by severity: failing on any keeps the baseline clean and blocks work on driver false positives; triage is pragmatic and lets warnings pile up."],
    p: ["A renderer that was never run under validation has hundreds of latent errors, and the first run is unusable.", "Validation is disabled for performance in the test machines and the CI result no longer means anything."],
    v: "Run the full scene suite with all validation modes on, including synchronization and shader checking, and require zero errors. Introduce one deliberate misuse and confirm exactly one message identifies it.",
    dep: ["debug-names", "device-creation"]
  },
  "gpu-crash-diagnostics": {
    s: "Tooling that identifies which command or shader was running when the GPU hung or faulted, by writing breadcrumb markers and collecting fault data.",
    d: "When the device is lost, the CPU sees only an error code. To locate the cause the renderer writes markers into a buffer before and after commands or passes, in memory that survives a hang, and reads them after the crash to see the last marker reached. Driver crash tools additionally report the faulting shader, address and resource name and write a dump file. Page fault information shows out-of-bounds access, often from a stale descriptor. These tools have a cost, so they are enabled on demand or in beta builds, and the dumps need symbols to be useful.",
    k: ["Breadcrumbs always enabled vs on demand: always enabled catches field crashes at a small cost; on demand is free and finds nothing from players' crashes.", "Own marker buffer vs vendor crash tool: own markers work on all GPUs with limited detail; vendor tools report the faulting shader and are tied to specific hardware."],
    p: ["Writing the marker from the GPU after the faulting command rather than before records that the command succeeded.", "Dumps without shader symbols or debug names name only addresses and cannot be read."],
    v: "Deliberately dispatch a shader with an out-of-bounds write, trigger the device loss, and confirm the dump names the pass, the shader and the resource, and the log shows the last breadcrumb reached.",
    dep: ["debug-names", "device-creation", "command-recording"]
  },
  "debug-names": {
    s: "Human-readable names and scoped markers attached to resources and command ranges, which tools and validation messages use to identify objects.",
    d: "Every buffer, texture, pipeline and queue gets a name at creation, and every pass and group of draws is wrapped in begin and end markers with a name and color. Frame capture tools show the markers as a tree, validation errors quote the name of the offending object, and crash dumps use them to identify resources. Names have no cost on the GPU, and the markers are nearly free when no tool is attached. The renderer builds names from the owning system and asset path, and disables them in shipping builds if the memory use matters.",
    k: ["Name everything always vs only in development builds: always lets field captures be understood and costs strings; development-only is lean and makes shipped crashes opaque.", "Automatic names from asset path vs manual names: automatic is complete and long; manual is readable and incomplete."],
    p: ["Unnamed resources show up as hex handles in validation messages, and nobody can tell which is which.", "Mismatched begin and end markers corrupt the tree in capture tools."],
    v: "Open a captured frame in a capture tool and confirm every pass appears in the hierarchy with a name, and that a deliberately invalid use reports the resource's name, not a handle.",
    dep: ["command-recording"]
  },
  "frame-capture": {
    s: "Recording every command and the resources of one frame so it can be replayed and inspected step by step in an external tool.",
    d: "A capture tool intercepts API calls, records resource contents and the full command stream for one frame, and replays it to show each draw's state, inputs and outputs, shader code with source if debug information is present, and the pixel history. The renderer cooperates by naming objects, keeping shader debug info in development builds, and offering a trigger key or API to capture a specific frame. Capture needs the application to use standard API calls, and large resource sets make files huge. Replays on another machine can differ.",
    k: ["Integrate a capture trigger vs rely on tool injection: integration allows scripted and automatic captures; injection requires nothing and cannot capture a specific moment.", "Keep shader debug info in shipping builds vs strip it: keeping allows source-level debugging of field issues and exposes shader source; stripping is smaller and opaque."],
    p: ["A capture taken with a different driver or GPU shows different behavior than the failing machine.", "Capturing a frame with a streaming spike makes the replay include one-time uploads and misleads timing."],
    v: "Capture a frame, replay it in the tool, and compare the final image and draw count with the live one. Select one pixel and confirm the tool shows its full history through the passes.",
    dep: ["debug-names", "validation-layers"]
  },
  "resource-lifetime-vs-gpu": {
    s: "The rule that no resource can be freed, reused or overwritten while any submitted GPU work might still read it, which runs through every layer.",
    d: "On an explicit API the driver does not track what the GPU still uses. Every layer must obey the same discipline: per-frame memory is reused after its fence, descriptors are recycled only after in-flight frames complete, deleted objects wait in a queue for N frames, aliased memory needs barriers, and streamed resources are released only once unreferenced. The bugs are timing dependent and may appear once in thousands of frames. A single, central mechanism, such as a frame-indexed deferred deletion queue and a monotonic completed-frame counter, keeps the discipline in one place.",
    k: ["Central deferred deletion vs each system tracking its own: central is uniform and easy to audit; local tracking is flexible and repeated incorrectly many times.", "Frame-count based retirement vs fence value based: frame count is simple and conservative; fence values are exact and allow earlier reuse."],
    p: ["A system frees a resource immediately because the CPU is done, and the bug appears only when the GPU falls behind.", "Different systems assume different numbers of frames in flight, so one releases early."],
    v: "Run with the GPU artificially delayed by several frames and validation on. No use-after-free or overwrite reports may appear, and memory in the deletion queue must drain back to zero.",
    dep: ["frames-in-flight", "fences", "memory-budget"]
  },
  "abstraction-level": {
    s: "How much of the explicit API the renderer exposes to its own users versus hiding, which decides performance headroom, portability and who can make mistakes.",
    d: "The renderer can hide barriers, memory and descriptors behind a render graph and resource manager, or expose them to every feature author. Hiding makes feature code short and safe and caps what an expert can do. Exposing allows tuned code and means every author must understand synchronization. The choice sets how thick the hardware interface is, how many backends are feasible, how much validation helps, and how portable pass code is. It is usually layered: a thin interface at the bottom, a graph above it, and rarely a raw escape hatch for specialists.",
    k: ["Thick helpful layers vs a thin interface: thick layers protect feature authors and cost control; thin interfaces give control and need expertise from everyone.", "Escape hatch to raw API calls vs none: an escape hatch allows optimization and breaks portability and assumptions; none keeps invariants and blocks needed tricks."],
    p: ["A layer that hides barriers but cannot express a needed access pattern pushes people to bypass it unsafely.", "An interface designed around the first backend turns out to be wrong for the second."],
    v: "Have a developer unfamiliar with the API add a new pass using only the graph layer. It must render correctly under validation, with no raw API calls and no manual synchronization.",
    dep: ["rhi-abstraction", "render-graph-builder"]
  },
  "cpu-gpu-parallelism": {
    s: "How work is divided across CPU threads, queues and GPU hardware, deciding where overlap is gained and where the synchronization bill is paid.",
    d: "The CPU side spreads culling, sorting and command recording across jobs, while a submission path feeds the queues. On the GPU side, async compute and copy queues overlap with graphics, and frames in flight overlap CPU and GPU. Each overlap adds a synchronization point and a resource duplication cost. The design must show a clear owner for every piece of data at every moment, so no thread reads what another writes. The payoff is hidden latency and higher utilization. Problems show as idle gaps in both CPU and GPU timelines.",
    k: ["Maximum overlap everywhere vs a simple serial pipeline: overlap raises throughput and makes bugs and tuning harder; serial is predictable and leaves hardware idle.", "Decouple render thread from game thread by a frame vs run in lockstep: decoupling hides cost and adds latency; lockstep is simple and loses overlap."],
    p: ["A shared data structure updated from two threads without an owner gives rare crashes in recording.", "Overlapping passes that contend for the same units produce no speedup and extra complexity."],
    v: "Capture a combined CPU and GPU timeline over several frames. Both should be busy with few idle gaps, and removing one overlap mechanism at a time must measurably slow the frame as predicted.",
    dep: ["parallel-recording", "async-compute-scheduling", "frames-in-flight"]
  },
  "pipeline-variant-count": {
    s: "The number of distinct shader and pipeline combinations the renderer can produce, which determines build time, package size, memory and hitching.",
    d: "Every switch in a shader, every vertex type, render target format, blend mode and pass multiplies variants, and every variant must be compiled, stored, created and sometimes warmed up on the player's machine. Uncontrolled growth shows up first as build times, then as a long first launch and hitches. The remedy is design: few well-chosen switches, dynamic state where cheap, branches for rare paths, reports of counts per shader and a budget enforced in the build. Decisions about the material system and shading language are made with the variant count in mind.",
    k: ["Static specialization vs dynamic branching: specialization gives fast code and a variant explosion; branching keeps variant count low and costs registers.", "Budget enforced in the build vs reported only: enforced stops growth early and annoys; reported is friendly and ignored."],
    p: ["A single innocent switch added to a common include multiplies the whole shader set.", "Variants nobody uses stay in the package and still get compiled on every machine."],
    v: "Fail the build when per-shader or total variant counts exceed their budget. After a change that adds a switch, the report must show exactly which shaders grew and by how much.",
    dep: ["shader-permutations", "pipeline-state", "material-render-state"]
  },
  "memory-budgeting": {
    s: "Planning and enforcing how much GPU memory each system may use, across a range of cards and operating conditions.",
    d: "GPU memory is fixed per card and shared with the operating system and other applications. The renderer divides it among render targets, streamed textures, geometry, acceleration structures, shadow atlases and caches, and watches the OS-provided budget as it shifts. Systems degrade in a planned order when memory runs short: lower texture quality, smaller shadows, reduced resolution. Budgets are also set per capability tier. Without a plan, the last system to allocate fails, and failure appears as a crash on lower-end cards that nobody tested.",
    k: ["Fixed per-system budgets vs dynamic sharing with priorities: fixed budgets are predictable and waste unused memory; dynamic sharing is efficient and can starve a system.", "Plan for the minimum card vs for typical hardware: planning for minimum guarantees it runs everywhere and leaves fidelity unused on larger cards; typical-hardware planning needs scalable paths."],
    p: ["Memory for acceleration structures is added late and pushes mid-range cards over budget.", "Budgets measured at startup do not include what streaming adds after the first minute."],
    v: "Run a long scripted session on the minimum-spec card and plot memory by category. Totals must stay under the budget for the entire session, and category sums must equal the API's reported usage.",
    dep: ["memory-budget", "residency-manager", "capability-tiers"]
  },
  "debuggability": {
    s: "Designing the renderer so that wrong output, hangs and slowdowns can be traced to a cause, since GPU work is asynchronous and gives little feedback by default.",
    d: "A debuggable renderer names everything, groups work in scopes, keeps validation clean as a standing rule, exposes toggles for each pass and feature, can dump the frame graph, can capture a frame on demand, writes breadcrumbs for hangs and records timings. It also keeps rendering deterministic where it can, so a bug can be reproduced. The cost is a small amount of overhead and discipline. The benefit is the difference between finding a missing barrier in minutes and in weeks, since symptoms often appear far from the cause and only on one vendor's hardware.",
    k: ["Build in diagnostics from the start vs add when needed: early costs a little work and makes later bugs cheap; late means debugging blind at the worst moment.", "Deterministic rendering paths vs maximum performance tricks: determinism helps reproduce and compare; nondeterministic optimizations such as atomic ordering run faster and hide problems."],
    p: ["A renderer shipped without breadcrumbs gets crash reports that say only device lost.", "Debug toggles that change the work done hide the very bug they were added to find."],
    v: "Inject three known faults: a missing barrier, a stale descriptor and an infinite loop shader. In each case the tooling must name the pass or resource responsible within a single debugging session.",
    dep: ["validation-layers", "gpu-crash-diagnostics", "debug-names", "frame-capture"]
  }
});
