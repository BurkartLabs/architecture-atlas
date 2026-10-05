// Web browser plate, details part 2: rendering pipeline, script engine.
(function () {
  var D = {};
  function E(id, s, d, k, p, v, dep) { D[id] = { s: s, d: d, k: k, p: p, v: v, dep: dep }; }

  // ---- Rendering pipeline ----
  E("html-parser",
    "Turns a byte stream of markup into DOM nodes using the standard's error-tolerant tokenizer and tree construction rules.",
    "The parser decodes bytes, tokenizes them with a state machine and builds a tree through insertion modes that repair malformed markup the same way in every engine. It runs incrementally as network data arrives, can pause on scripts that may rewrite the stream, and uses a speculative scanner to start fetching resources ahead of the main parser. Fragment parsing and templates share its rules. Compatibility depends on matching the specified error recovery exactly.",
    ["Implement the specified recovery algorithm exactly: every page parses the same way across browsers, but the rules are intricate and legacy-shaped.",
     "Scan ahead for resources on a separate thread: fetches start sooner, but speculative loads may be wasted if script changes the document."],
    ["Blocking the parser on a synchronous script without preloading stalls the whole page behind that fetch.",
     "Re-entrancy from document.write while the parser is active corrupts the tree if insertion points are not tracked."],
    "Parse a corpus of malformed documents and compare the resulting trees to the standard's test suite. All match. A page with a slow blocking script still has its later images fetched early by the preload scanner.",
    ["dom-tree", "resource-loader", "text-and-intl-libs", "event-loop"]);

  E("dom-tree",
    "The in-memory tree of nodes, with mutation, events and observers, that script and the rest of the pipeline read and write.",
    "The document object model holds elements, text, attributes and shadow roots in a tree, exposes standard interfaces to script and drives dirty flags for style, layout and paint. Mutations queue observer records and fire events with capture, target and bubble phases. Node memory is managed jointly with the script heap's garbage collector, since script wrappers keep nodes alive and nodes keep wrappers alive. Fast tree traversal and invalidation granularity define page speed.",
    ["Mark dirty at node granularity and recompute lazily: small updates stay cheap, but forced synchronous reads can trigger full recalculation.",
     "Share lifetime with the script heap via traced wrappers: cycles between DOM and script are collectable, at the cost of cross-heap tracing."],
    ["Reading layout properties after each write in a loop forces repeated layout and turns a linear update into quadratic work.",
     "Holding script references to detached subtrees leaks entire DOM trees."],
    "Mutate a thousand nodes in a batch, then read a layout property once. A single layout runs. Detach a subtree, drop references and force collection: its nodes are freed.",
    ["html-parser", "css-and-style", "web-idl-bindings", "garbage-collector", "shadow-dom-components"]);

  E("css-and-style",
    "Parses stylesheets and computes, for every element, the final property values by cascading, inheriting and resolving units.",
    "The CSS parser produces rule sets from sheets and inline styles. Style resolution matches selectors against elements, sorts matching declarations by origin, importance, layer, specificity and order, then computes values: inheritance, variables, relative units, media and container queries. Results form per-element computed style objects, shared where equal. Indexing rules by rightmost selector and invalidating only affected elements by tracking dependencies keep recalculation proportional to the change.",
    ["Index rules by key selector and invalidate by dependency sets: restyling after a class change is fast, but complex selectors need conservative invalidation.",
     "Share computed style between similar siblings: memory and time shrink, but sharing needs strict equality checks that are easy to get subtly wrong."],
    ["Selectors that depend on later siblings or descendants force broad invalidation on small changes.",
     "Custom property cycles or very deep inheritance chains produce expensive or invalid computed values if not detected."],
    "Toggle a class on a root element of a large page and measure style recalculation. Only elements whose rules mention the class are restyled, and the computed style matches a reference cascade test.",
    ["dom-tree", "layout", "text-and-fonts", "frame-scheduler"]);

  E("layout",
    "Computes size and position of every box from the styled tree, handling flow, flexbox, grid, tables, floats and text.",
    "Layout walks the box tree, running formatting contexts: block and inline flow, flex, grid, table, and fragmentation for columns and print. Each produces fragments with geometry and is constraint-based, with min and max content sizes resolved bottom-up. Results are cached and recomputed only for dirty subtrees. Text measurement dominates cost, and intrinsic sizing makes some algorithms multi-pass. Layout is main-thread work and is the most common cause of jank.",
    ["Cache layout results with constraint keys: unchanged subtrees skip work, but cache keys must capture every input or stale results appear.",
     "Isolate subtrees with containment: layout stays local, but pages must opt in and content may not overflow naturally."],
    ["Layout thrash: interleaved reads and writes of geometry force repeated full layouts in a loop.",
     "Percentage and intrinsic sizing cycles produce different results depending on pass order unless defined by the spec."],
    "Run a flex and grid test suite against reference results and confirm exact pixel geometry. Change one deep node and verify only its ancestors up to the containment boundary are re-laid out.",
    ["css-and-style", "text-and-fonts", "dom-tree", "paint", "frame-scheduler"]);

  E("text-and-fonts",
    "Selects fonts, shapes text into glyph runs, and breaks lines in every writing system the page uses.",
    "Text goes through itemization by script and direction, font matching with fallback, shaping into glyphs with positions through the font's tables, bidirectional reordering and line breaking per Unicode rules. Web fonts are loaded asynchronously with display policies that control invisible or fallback text. Shaping results are cached by word. Variable fonts, emoji and complex scripts make this large. Fonts are parsed in a restricted process, since font formats have a long record of vulnerabilities.",
    ["Show fallback text then swap when the web font loads: content appears immediately, but the swap can shift layout unless metrics are matched.",
     "Cache shaped words, not whole paragraphs: repeated text is cheap, but kerning across word boundaries and ligatures need careful key design."],
    ["Missing fallback fonts for a script show empty boxes where text should be.",
     "Parsing untrusted font files in the renderer exposes a large attack surface unless sanitized or sandboxed."],
    "Render mixed-direction text with an emoji and a complex-script word in a page whose web font is delayed. Text shows in the right order immediately with fallback, then swaps without breaking the line breaks.",
    ["layout", "text-and-intl-libs", "resource-loader", "paint"]);

  E("paint",
    "Walks the layout result and records ordered drawing commands, grouped into layers, without drawing a pixel.",
    "Paint traverses fragments in stacking-context order and emits display items such as rectangles, borders, text blobs and images into a display list, with property trees for transforms, clips, effects and scroll offsets stored separately. Because the list is a recording, it can be rasterized later on another thread and changes to a transform or scroll do not require repainting. Invalidation tracks which items changed so unchanged chunks are reused.",
    ["Record into a display list with separate property trees: scroll and transform animations skip repaint, but the data structures are complex to keep consistent.",
     "Cache paint chunks per layer: small changes cost little, but fine-grained caching requires precise tracking of what each item depends on."],
    ["Painting that depends on live layout during raster, rather than the recording, introduces thread races.",
     "Over-invalidation repaints entire layers for a one-pixel change."],
    "Animate a transform on a layer and confirm in a trace that no paint step runs per frame. Change one element's color and confirm only its chunk is repainted.",
    ["layout", "compositing", "rasterization", "text-and-fonts"]);

  E("compositing",
    "Assembles painted layers into frames on a dedicated thread, applying transforms, clips and effects with the GPU.",
    "The compositor owns a layer tree, built from paint output and property trees, and produces compositor frames: lists of draw quads referencing raster tiles. It runs on its own thread so scrolling, pinch zoom and transform or opacity animation continue while the main thread is busy. Frames are submitted to the display compositor in the GPU process, which aggregates frames from many surfaces (content, other frames, browser UI) and presents them.",
    ["Composite on a thread separate from the main thread: scrolling and animations stay smooth under script load, but the two trees must be committed in sync.",
     "Aggregate surfaces from several processes in one display compositor: out-of-process frames draw together with correct ordering, at the cost of a surface dependency system."],
    ["Too many layers waste GPU memory; too few force repainting large areas for small changes.",
     "Content that lags behind the compositor shows checkerboard tiles when scrolling fast."],
    "Run a long task on the main thread while scrolling a page. Scrolling remains at full frame rate, and a trace shows frames produced on the compositor thread with no main-thread work.",
    ["paint", "rasterization", "scroll-and-animation", "gpu-process", "frame-scheduler"]);

  E("rasterization",
    "Converts display lists into pixels for each tile, on worker threads or the GPU, prioritized by what the user will see next.",
    "Layers are divided into tiles. Raster workers replay display lists into tile textures, either on the CPU into shared memory or on the GPU via recorded commands sent to the GPU process. A tile manager prioritizes tiles in view, then near the viewport in the scroll direction, within a memory budget. Resolution can drop during fast scrolls or zoom and refine later. Text, paths, filters and images are expensive; decoding images is split out and cached.",
    ["Raster on the GPU with recorded command buffers: high throughput on complex paths, but needs a robust command boundary and GPU process.",
     "Prioritize tiles by distance and scroll direction: the visible area is ready first, at the cost of memory for speculative tiles."],
    ["Rasterizing offscreen tiles with large images stalls tiles that are actually visible.",
     "Under a tight memory budget, tile eviction thrashes and causes constant re-raster during scrolling."],
    "Scroll rapidly through a long image-heavy page. Visible tiles are always rasterized first, a low-resolution tile may appear briefly, and total tile memory stays within the configured budget.",
    ["paint", "compositing", "gpu-process", "graphics-backend", "memory-pressure"]);

  E("scroll-and-animation",
    "Runs scrolling, pinch zoom and declarative animations on the compositor so they do not wait on script.",
    "Scrolling is handled by the compositor with a scroll tree: touch or wheel input updates offsets directly, with snap points, overscroll and fling physics. Animations of transform, opacity and some filters run on the compositor from declarative descriptions; others must be driven by the main thread each frame. Scroll-linked effects and sticky positioning need cooperation between both. Event listeners that may cancel scrolling are the main reason a scroll falls back to the main thread.",
    ["Let the compositor scroll by default and consult the main thread only when handlers might cancel: smooth scrolling, but passive listeners must be opted into.",
     "Animate only compositor-friendly properties off the main thread: stays smooth under load, but layout properties still cost main-thread work."],
    ["Non-passive wheel or touch listeners on the document force every scroll to wait for script.",
     "Scroll-linked JavaScript animations lag behind the compositor-scrolled content and visibly jitter."],
    "Block the main thread with a busy loop and scroll a page whose animation uses transform only. Scrolling and the animation continue smoothly, while a layout-property animation stalls.",
    ["compositing", "input-routing", "event-loop", "frame-scheduler"]);

  E("input-routing",
    "Receives raw input in the browser, finds the target frame by hit testing and delivers events to the right process and thread.",
    "Mouse, touch, key and gesture events arrive at the browser process from the native window. The browser asks the compositor to hit-test layers, resolves the target frame, then forwards the event over IPC to the renderer's compositor thread, which handles scroll gestures directly and posts the rest to the main thread. Out-of-process frames require the browser to route through the frame tree. Latency from hardware event to frame is the key measure.",
    ["Hit test on the compositor with data from the main thread: fast routing, but hit test data can be stale after layout changes.",
     "Coalesce high-frequency events per frame: less main-thread work, but precise pointer paths are reduced unless raw updates are exposed."],
    ["Routing an event by stale hit test data delivers a click to an element that moved out from under the pointer.",
     "A hung renderer can still receive input queued behind the hang unless the browser times out and ignores it."],
    "Click a button in a cross-site iframe that overlaps another element, then tap during a long main-thread task. The click reaches the right frame, and a hang indicator appears while other tabs respond.",
    ["frame-tree", "scroll-and-animation", "native-windowing", "ipc-channel", "compositing"]);

  E("frame-scheduler",
    "Decides when to produce each frame, synchronized to the display's refresh, and balances rendering against input and script work.",
    "The scheduler receives a vsync signal and issues begin-frame messages to renderers and the compositor, with deadlines. The main thread runs input handlers, animation callbacks, style, layout and paint, in that order, if there is work. The compositor draws what it has by the deadline even when the main thread is late. Task priorities favor input and rendering over timers and idle work. Throttling hidden or offscreen frames saves power.",
    ["Drive work from vsync with a deadline: frames are paced and aligned with the display, but missing the deadline drops a frame rather than delaying it.",
     "Prioritize input and rendering tasks over timers: interaction stays responsive, but low-priority work can be starved unless aging is applied."],
    ["Doing layout and paint on every timer tick instead of once per frame wastes CPU and battery.",
     "Hidden iframes and tabs that keep running animation frames burn power for output no one sees."],
    "Record a trace while animating with requestAnimationFrame. One main-thread frame runs per vsync, a deliberately slow frame skips one display frame, and background tab animation callbacks stop.",
    ["compositing", "event-loop", "task-scheduler", "layout", "input-routing"]);

  // ---- Script engine ----
  E("js-parser",
    "Parses JavaScript source into a syntax tree and generates bytecode, preparsing functions lazily to start quickly.",
    "The parser scans source to tokens, builds an abstract syntax tree and resolves scopes. To start fast, it preparses inner functions, checking syntax without building trees, and fully compiles them on first call. A bytecode generator emits compact instructions for a register or stack machine. Early errors, strict mode, modules and the evolving language grammar all live here. Parsing large bundles is a measurable part of page load, so work moves off the main thread.",
    ["Compile functions lazily: startup does less work, but called functions are parsed twice and speculative eager hints are needed for hot ones.",
     "Parse on a background thread when streaming from the network: the main thread stays free, but scope information must be merged back safely."],
    ["Eagerly compiling an entire large bundle delays first interaction for code that may never run.",
     "Mismatched preparse and full parse behavior accepts code the first pass rejected, or the reverse."],
    "Load a large script bundle and measure main-thread parse time. Only called functions are fully compiled, and the same source produces identical syntax errors under lazy and eager modes.",
    ["bytecode-interpreter", "code-cache", "event-loop"]);

  E("bytecode-interpreter",
    "Executes bytecode directly, collecting type feedback so the optimizing tiers can specialize hot code.",
    "The interpreter runs the compact bytecode in a dispatch loop with minimal startup cost and low memory. As it runs, it records feedback in per-function vectors: observed types, call targets and property shapes. When a function becomes hot by invocation or loop counts, it is queued for a higher tier. The interpreter is also the fallback target when optimized code is invalidated, so its semantics are the reference.",
    ["Start in an interpreter and tier up on heat: fast startup and small memory, but peak performance is delayed until compilation completes.",
     "Collect feedback while interpreting: optimization has real data, but feedback storage costs memory per function."],
    ["Counting hotness poorly keeps long-running loops stuck in the slow tier or compiles code too eagerly.",
     "Interpreter and optimized code that disagree on semantics produce results that change as functions warm up."],
    "Run a function once and then a million times. The first run executes in the interpreter, then the function is compiled in a higher tier, and output is identical across tiers on a conformance test.",
    ["js-parser", "jit-tiers", "object-model-and-ics"]);

  E("jit-tiers",
    "Compiles hot functions to machine code in stages, each trading compile time for speed, with deoptimization when assumptions fail.",
    "A baseline tier produces machine code quickly from bytecode; an optimizing tier uses feedback to inline calls, unbox numbers, remove checks and allocate registers. Compilation runs on background threads and installs code when done. Optimized code relies on assumptions such as object shapes or integer ranges; guards trigger deoptimization back to a lower tier when violated. Executable memory must be writable then executable, which is a security-sensitive boundary.",
    ["Use multiple tiers: fast warmup and strong peak speed, but each tier adds code to maintain, plus the transitions between them.",
     "Speculate on feedback with guards: large speedups on typical code, but type-unstable code repeatedly deoptimizes and runs slower than baseline."],
    ["Deoptimization loops when a function oscillates between types waste compile time and run slower.",
     "JIT-emitted writable and executable pages enable code injection unless write permissions are toggled or isolated."],
    "Run a numeric function with integers, then pass a string. The optimized code deoptimizes, results stay correct, and a trace shows the function recompiled with wider assumptions.",
    ["bytecode-interpreter", "object-model-and-ics", "garbage-collector", "task-scheduler", "os-sandbox"]);

  E("object-model-and-ics",
    "Represents objects with hidden shapes and caches property lookups at each access site so dynamic code runs near static speed.",
    "Objects share shape descriptors (hidden classes) that record property layout. At each property access, an inline cache stores the shapes seen and the slot offset, turning a dictionary lookup into a shape check and load. Caches progress from uninitialized to monomorphic, polymorphic and megamorphic states. Arrays use element kinds such as small integers or doubles. Changing an object's layout or deleting properties invalidates assumptions that optimized code relied on.",
    ["Use shared shapes with inline caches: property access becomes a compare and load, but objects created with different property orders get different shapes.",
     "Specialize array element storage by kind: numeric arrays are compact, but one mixed-type write transitions them to a slower representation."],
    ["Adding properties in different orders or deleting them creates many shapes and megamorphic sites that lose caching.",
     "Prototype mutation after optimization invalidates dependent code across the heap."],
    "Create many objects with the same property order, read a property in a hot loop and confirm a monomorphic cache. Create variants with different orders and confirm the site becomes polymorphic and slower.",
    ["bytecode-interpreter", "jit-tiers", "garbage-collector"]);

  E("garbage-collector",
    "Reclaims unreachable objects using generational, incremental and concurrent collection to keep pauses short.",
    "The heap is split into a young generation collected frequently by copying survivors, and an old generation marked incrementally and concurrently with a write barrier, then swept or compacted. Work spreads across helper threads and idle time between frames. The collector traces references from DOM wrappers as well as script objects, since both heaps interlink. Pause time, throughput and memory footprint trade against each other, and the browser tells the collector about memory pressure.",
    ["Generational copying for young objects: most garbage dies cheaply, but a write barrier taxes every pointer store into the old generation.",
     "Mark concurrently with the mutator: pauses shrink, but the collector and script run in parallel and need careful synchronization and write barriers."],
    ["A collection that triggers during a rendering frame produces a visible stutter if the heap is large and marking is not incremental.",
     "Leaked references through event listeners or closures keep large object graphs alive."],
    "Allocate rapidly in a loop while animating. Trace shows young collections of a few milliseconds, concurrent old-generation marking on helper threads, and no frame dropped by a single pause.",
    ["object-model-and-ics", "dom-tree", "task-scheduler", "memory-pressure", "frame-scheduler"]);

  E("event-loop",
    "Runs tasks, microtasks and rendering steps for each agent in a defined order; the model every asynchronous API builds on.",
    "Each window or worker has an event loop with task queues by source: timers, networking, user interaction, messages. The loop picks a task, runs it to completion, drains microtasks (promise reactions), and then may perform a rendering update: animation callbacks, style, layout, paint. Run-to-completion semantics make script simple but mean a long task blocks input and rendering. The browser implements priorities and throttling above this specified model.",
    ["Run tasks to completion on one thread: no data races in script, but any long task blocks everything on that thread.",
     "Drain microtasks after each task: promise chains settle before rendering, but a microtask loop can starve rendering forever."],
    ["Long tasks over about 50 ms delay input and make interaction feel stuck.",
     "Promise callbacks that schedule more promise callbacks indefinitely never yield to rendering or input."],
    "Queue a timer, a promise reaction and an animation callback in one task. They run in the specified order: the task, microtasks, then rendering. A 200 ms task visibly delays a button click handler.",
    ["task-scheduler", "frame-scheduler", "web-idl-bindings", "js-parser"]);

  E("webassembly-runtime",
    "Validates, compiles and runs binary modules in a sandboxed linear memory with near-native speed and deterministic semantics.",
    "A module is validated against the type rules, then compiled by a fast baseline compiler and optionally an optimizing tier, often streaming while downloading. Instances run with a bounds-checked linear memory and imports and exports through typed tables. Features such as threads, SIMD, exception handling and garbage collection integration expand the runtime. Memory isolation depends on guard regions or explicit checks, and the module can only touch the world through what it imports.",
    ["Compile in tiers and stream while downloading: instantiation starts early, but baseline code is slower than the optimized tier.",
     "Bound memory with guard pages or checks: safe by construction, but guard regions consume large address space."],
    ["Validation bugs let malformed modules escape their sandbox, so validators need heavy fuzzing.",
     "Shared memory and threads reintroduce timing side channels unless cross-origin isolation is required."],
    "Stream-compile a module while downloading, instantiate it and call an export. An out-of-bounds memory access traps rather than reading outside the instance's memory, and invalid modules fail validation.",
    ["jit-tiers", "web-idl-bindings", "web-workers", "cross-origin-isolation", "code-cache"]);

  E("code-cache",
    "Stores compiled bytecode or machine code so repeat visits skip parsing and compilation.",
    "After a script runs, the engine can serialize its bytecode, and with enough use its optimized output, keyed by source hash and engine version. The cache lives with the HTTP cache or in its own store, and is checked on load before parsing. Streaming compilation overlaps parsing with download. Entries must be invalidated on engine updates and flags, and sensitive pages must not create cache timing channels. Warm loads often save a large part of script startup.",
    ["Cache bytecode after execution rather than at first load: only code that ran is cached, but the first visits pay full cost.",
     "Key on source hash plus version and flags: stale or mismatched code never loads, at the cost of a miss after each browser update."],
    ["Loading cached code compiled for a different engine version or flag set crashes or misbehaves.",
     "Cache hit timing can reveal which sites the user visited unless the cache is partitioned."],
    "Load a heavy script twice. The second load skips parse and compile, with measured startup time down substantially, and after a version bump the cache is rejected and rebuilt.",
    ["js-parser", "http-cache", "storage-partitioning", "bytecode-interpreter"]);

  ATLAS.details("web-browser", D);
})();
