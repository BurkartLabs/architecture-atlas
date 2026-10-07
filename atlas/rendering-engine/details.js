// Details for the rendering engine plate, part 1: input, script integration, markup parsing.
ATLAS.details("rendering-engine", {
  "input-event-intake": {
    s: "Receives raw pointer, touch, wheel and key events from the shell, normalizes them, and decides which thread handles each one first.",
    d: "Events arrive from the browser shell with device coordinates and timestamps. The engine converts them to page coordinates, applies zoom and scroll transforms, coalesces high-rate moves, and queues them for the main thread or the compositor thread. Scroll and pinch events are offered to the compositor first because it can respond without waiting for script. The hard part is ordering: a touch sequence must reach one target consistently, and script may cancel it after the compositor has already begun scrolling.",
    k: ["Coalescing moves to once per frame vs delivering every sample: fewer callbacks and less main-thread load, but script sees a coarser path unless it asks for the raw samples.", "Compositor-first handling vs main-thread-first: scrolling stays smooth during long script tasks, but a handler that wants to cancel the scroll must be known in advance or it arrives too late."],
    p: ["Treating timestamps from different clocks as comparable gives negative latencies and wrongly ordered events.", "A single non-passive wheel or touch listener on the root silently forces every scroll to wait for the main thread."],
    v: "Block the main thread for 500 ms with script and scroll a long page by wheel. The page should keep moving if no blocking listener exists, and should stall only when one is registered.",
    dep: ["hit-testing", "event-dispatch", "threaded-scrolling"]
  },
  "hit-testing": {
    s: "Maps a point on screen to the element, box, text position or scrollable region that should receive the event.",
    d: "Hit testing walks the layer and paint structures in reverse paint order, applying transforms, clips, border radii, pointer-events rules and overflow to find the topmost box covering the point. It returns the element plus a position inside it, such as a text offset. The compositor can do a coarse version over layers to decide whether the main thread must be consulted at all. Difficulty comes from transforms, scrolled and clipped subtrees, shadow trees that retarget results, and the need to run against a layout that may be stale.",
    k: ["Walking the paint-order structure vs a separate spatial index: no extra memory or maintenance, but cost grows with depth and overlap on busy pages.", "Hit testing against up-to-date layout vs against the last frame: correct for script that just moved something, but a forced layout can be expensive and surprising."],
    p: ["Ignoring a transform or clip in the hit path makes buttons clickable where they are invisible, or dead where they are visible.", "Hit results leaking nodes from inside a shadow tree break encapsulation unless retargeted."],
    v: "Overlay a transparent rotated element with pointer-events off on a button, then click the button's rotated corner. The click must reach the button, and the reported target must match what a screenshot shows.",
    dep: ["stacking-contexts", "property-trees", "layout-tree", "flat-tree"]
  },
  "event-dispatch": {
    s: "Delivers an event along a path through the tree in capture, target and bubble phases, running listeners and honoring cancellation.",
    d: "The path is computed from the target up through ancestors, crossing shadow boundaries with the target retargeted at each level. Listeners run in registration order per node, can stop propagation, and can cancel default behavior. Passive listeners promise not to cancel, which lets the engine proceed in parallel. Each listener invocation is a script call that ends with a microtask checkpoint. It is hard because listeners can add, remove or move nodes mid-dispatch, so the engine snapshots the path and list and must still obey the rules.",
    k: ["Computing the path once at dispatch vs recomputing as the tree changes: predictable and cheap, but a listener sees events at nodes that have since been detached.", "Synchronous dispatch of untrusted events vs queuing them: matches what script expects, but re-entrant handlers can corrupt state in code that assumes events arrive one at a time."],
    p: ["A listener that removes its siblings during dispatch can be skipped or run twice if the list is iterated live.", "Registering listeners on every element instead of delegating costs memory and slows teardown."],
    v: "Attach capture and bubble listeners at three nesting levels, including across a shadow boundary, fire a click, and compare the logged order and event target values against the specified sequence.",
    dep: ["hit-testing", "flat-tree", "microtask-checkpoints", "script-bindings"]
  },
  "focus-and-default-actions": {
    s: "Tracks which element has keyboard focus and performs built-in behavior such as activating links, toggling controls and moving focus with Tab.",
    d: "Focus is a property of the document and the frame tree: one element holds it, and navigation order follows tab index and tree order across shadow boundaries. After listeners run, uncanceled events trigger default actions: following a link, submitting a form, scrolling, or starting a drag. Focus changes fire events, scroll the target into view, and update style via focus pseudo-classes. Hard cases are elements removed while focused, inert subtrees, dialogs that trap focus, and the difference between focus caused by keyboard and by pointer.",
    k: ["Default actions after dispatch vs inside each element: one cancellation rule for all content, but built-in controls need hidden hooks that mimic what script could do.", "A focus ring tied to input modality vs always on: less visual noise for pointer users, but heuristics can hide it from people who need it."],
    p: ["Removing the focused element without moving focus strands keyboard users at the top of the page.", "Skipping layout before computing tab order picks hidden elements that are not yet known to be hidden."],
    v: "Tab through a page with a shadow tree, a disabled control and an inert region, and confirm the focus order matches the visual order and skips the disabled and inert elements.",
    dep: ["event-dispatch", "flat-tree", "style-invalidation", "scroll-containers"]
  },
  "selection-and-caret": {
    s: "Represents the user's text selection and caret as positions in the DOM and renders and edits them against layout.",
    d: "A selection is a pair of DOM positions, anchor and focus, stored as live ranges, possibly spanning shadow trees and frames. Pointer gestures and keyboard commands move it using layout: the engine converts points to text offsets through hit testing, and moves by character, word or line using segmentation rules and line boxes. Painting needs selection rectangles per line, in logical order for mixed-direction text. The caret blinks on a timer and must stay visible while the page scrolls. Complexity is in mapping between visual and logical positions.",
    k: ["Storing selection as DOM positions vs layout positions: it survives relayout and edits, but every move must convert back through layout, which may need fresh geometry.", "Visual vs logical cursor movement in mixed-direction text: visual matches arrow keys on screen, logical matches editing semantics, and each surprises in the other case."],
    p: ["Selecting across a boundary the engine does not model, such as a sealed subtree, can leak hidden text through copy.", "Layout shifts during a drag move the content under the pointer and extend the selection to the wrong place."],
    v: "Select a paragraph that mixes right-to-left and left-to-right runs with a drag, then copy it. The selection highlight must be contiguous per line and the copied text must follow logical order.",
    dep: ["hit-testing", "dom-ranges", "bidi-text", "segmentation-hyphenation", "inline-formatting"]
  },
  "ime-composition": {
    s: "Supports text entry through input method editors by holding uncommitted composition text, showing it in place, and reporting caret geometry to the system.",
    d: "An input method sends a stream of composition updates before the final text. The engine keeps a composition range inside the editable element, marks it for underline styling, and fires composition and input events at defined points. It reports the caret and selection rectangles back to the shell so the candidate window appears in the right place, and answers queries for surrounding text. The hard part is that script may rewrite the field mid-composition, and the engine and the method must still agree on where the text is.",
    k: ["Mutating the DOM during composition vs holding text outside it: live updates make styling and events natural, but an interfering script can break the composition state.", "Reporting geometry on each change vs on request: always correct, but it can force layout during typing."],
    p: ["Resetting the element's value while composition is active cancels the composition and loses user input.", "Stale caret geometry after a scroll puts the candidate window far from the text being typed."],
    v: "Compose a multi-character word with a candidate window in a field inside a scrolled container. The window must appear next to the composition and the final text must match the selected candidate.",
    dep: ["selection-and-caret", "event-dispatch", "dom-ranges", "layout-tree"]
  },
  "accessibility-tree": {
    s: "A parallel tree of objects with roles, names, states and relationships, derived from the DOM and layout, for assistive technology.",
    d: "The tree is built from semantics: element roles, explicit labels and relations, text content, and layout facts such as visibility and bounding boxes. Not every node appears: presentational or hidden ones are pruned, and generic ones may be collapsed. Names and descriptions are computed by an algorithm over labels, content and attributes. The tree is exposed to the platform accessibility interface and answers actions such as focus, click and scroll. It is hard because it must mirror a DOM that changes constantly, including across shadow trees and frames.",
    k: ["Building the tree lazily when assistive technology connects vs always: no cost for most users, but the first connection pays a large build and must not disturb the page.", "Deriving from layout vs from DOM only: layout gives visibility and geometry, but ties the tree to a clean lifecycle and makes it unavailable mid-frame."],
    p: ["Name computation that differs from the specified algorithm makes controls announce nothing or the wrong label.", "Hidden content that stays in the tree is read aloud, while visible content that is pruned is unreachable."],
    v: "Dump the tree for a page with a labeled button, a hidden dialog and a custom control. Check roles, names and states against the expected values, and confirm the hidden dialog is absent.",
    dep: ["flat-tree", "computed-style", "layout-tree", "node-tree"]
  },
  "accessibility-updates": {
    s: "Reports changes in the accessibility tree incrementally, as events and subtree updates, instead of resending the whole tree.",
    d: "Each DOM, style or layout change that affects semantics marks the corresponding accessibility objects dirty. At a safe point in the lifecycle, after layout, the engine recomputes the dirty objects and serializes a batch of updates: nodes added, removed or changed, plus events such as focus moved or value changed. Batches go to the process that talks to the platform. Hard parts are ordering relative to rendering, avoiding churn from rapid DOM updates, and keeping object identity stable so assistive technology does not lose its place.",
    k: ["Incremental batches vs full snapshots: far less data and work per change, but a missed dirty mark leaves assistive technology permanently out of date.", "Updating after layout vs immediately on mutation: results are consistent with geometry, but announcements arrive a frame later."],
    p: ["Regenerating a list's whole subtree on every update resets screen reader position and floods announcements.", "Updates sent while a node is detached refer to ids that no longer exist."],
    v: "Append items to a live list one per animation frame and capture the update stream. Each batch should contain only the new nodes and one live-region event, and object ids of existing items must stay unchanged.",
    dep: ["accessibility-tree", "mutation-model", "layout-invalidation", "frame-lifecycle"]
  },
  "script-bindings": {
    s: "The glue that exposes DOM and style objects to the script engine as native-looking objects and converts values and exceptions between the two worlds.",
    d: "Every DOM interface has generated glue from a declarative interface description: attribute getters and setters, methods, constructors, overload resolution and type conversion. Native objects are reached through wrapper objects owned by the script engine, so each wrapper must keep its native object alive and be kept alive by it where needed. Calls cross a boundary with costs for conversion and for exceptions. Difficulty lies in security checks, wrapper identity across worlds, and reentrancy, because a getter can run script that changes the very structure being read.",
    k: ["Generated glue from interface descriptions vs hand-written: uniform conversions and fewer bugs, but code size grows and special cases need escape hatches.", "One wrapper per object per world vs creating wrappers on demand each time: identity comparisons work and caches stay valid, at the cost of memory and lifetime tracking."],
    p: ["A wrapper collected while the native object still holds script callbacks drops event listeners that the page expects to fire.", "Unchecked reentrancy from a getter leaves the engine reading freed or restructured data."],
    v: "Create ten thousand elements, drop script references, and force collection. Memory should fall, while an element with a registered listener still reachable from the document must keep firing it.",
    dep: ["node-wrappers", "node-tree", "event-loop-tasks", "microtask-checkpoints"]
  },
  "parser-blocking-scripts": {
    s: "Classic scripts the parser must fetch and run before it can continue, because they may write more markup into the stream.",
    d: "When the tree builder meets a script element without defer or async, the parser stops. It waits for the script to download and, if style sheets that precede it are still loading, waits for them too, because script may read styles. While stalled, the preload scanner keeps finding resources. When ready, the script runs, may call document.write to insert text at the parser's position, and then parsing resumes. This is the reason scripts at the top of a page delay everything, and why blocked parsing is a first-class state in the engine.",
    k: ["Blocking the parser vs continuing and re-parsing on write: simple and predictable semantics, but a slow script stalls the whole page, so the web added defer and async as opt-outs.", "Waiting for pending style sheets before running script vs not: script sees correct computed styles, but styles can become a hidden dependency of script latency."],
    p: ["A script in the head from a slow origin leaves the page blank until timeout.", "document.write after parsing ends replaces the whole document, a surprise for third-party snippets."],
    v: "Load a page whose head contains a script that the server delays by three seconds. Confirm nothing after it is parsed or painted for three seconds, while images later in the page still begin downloading.",
    dep: ["tree-builder", "stylesheet-loading", "script-loading", "speculative-parsing"]
  },
  "script-loading": {
    s: "Fetches, compiles and schedules classic scripts and modules, including the defer, async and dependency graph rules that decide when each one runs.",
    d: "Scripts come in kinds: parser-blocking, deferred, async and module. Deferred scripts run in order after parsing ends and before the load event. Async scripts run as soon as they arrive. Modules form a graph: the engine fetches and links all dependencies before running any, evaluates in dependency order, and caches results by resolved URL. Fetching goes through the loader with credentials and integrity rules. Compilation can start off the main thread as bytes stream in. The difficulty is ordering guarantees across different kinds and failure behavior when any dependency is missing.",
    k: ["Static module graphs vs on-demand loading: complete dependency knowledge allows preloading and tree shaking, but dynamic needs require a second, asynchronous path.", "Compiling during download vs after: lowers main-thread time, but wastes work if the script turns out to be unneeded."],
    p: ["A failed fetch of one module dependency blocks the entire graph without the page seeing a clear error.", "Treating async scripts as ordered causes race-dependent initialization that works on fast networks only."],
    v: "Load a page with two deferred scripts, one async script and a module with a dependency. Log execution order under different network delays and confirm deferred scripts always run in document order.",
    dep: ["parser-blocking-scripts", "script-bindings", "event-loop-tasks"]
  },
  "event-loop-tasks": {
    s: "The loop that runs tasks from prioritized queues one at a time on the main thread, with rendering steps interleaved between them.",
    d: "Everything on the main thread runs as a task: a parsed chunk, an event callback, a timer, a network response, a message. Tasks come from per-source queues, and the scheduler picks the next one by priority and fairness. After each task, a microtask checkpoint runs. At selected points the loop runs a rendering opportunity: animation callbacks, style, layout, paint and commit. The hard part is that a task cannot be preempted, so a long one blocks input and rendering, and the engine can only influence tasks it knows how to split.",
    k: ["Single-threaded cooperative tasks vs preemptive threads: no data races on the shared DOM, but one slow task delays every other source of work.", "Per-source queues with a scheduler vs one FIFO: input and rendering can be prioritized, but starvation of low-priority work needs explicit aging."],
    p: ["A loop that posts itself with zero delay can starve rendering and input if the scheduler favors it.", "Assuming tasks from different sources run in posted order breaks code that depends on network and timer order."],
    v: "Record a trace of a page running a 200 ms task during a scroll gesture. The trace should show the task as one block, input waiting behind it, and the next frame delayed by the same amount.",
    dep: ["task-prioritization", "microtask-checkpoints", "frame-lifecycle"]
  },
  "microtask-checkpoints": {
    s: "Drains the microtask queue, where promise reactions and queued callbacks run, at every point where script returns to the engine.",
    d: "A microtask checkpoint runs when the script stack empties after a callback, and also at a few other defined points. It processes the queue to exhaustion, including tasks added while draining. This makes promise continuations run before the next task, before rendering, and between event listeners. Mutation observer notifications are delivered through the same mechanism. The hard part is the interplay: the checkpoint must be skipped while script is still on the stack, must not run in the middle of parsing a chunk, and a microtask loop that always adds another one freezes the page.",
    k: ["Running microtasks after every callback vs once per task: listeners see each other's promise results in order, but a long chain delays the next listener and the frame.", "Draining to exhaustion vs bounded batches: the simplest ordering guarantee, but no protection against self-feeding loops."],
    p: ["A promise chain that reschedules itself indefinitely blocks rendering and input without any task being long.", "Running a checkpoint with script still on the stack lets observers fire inside a half-finished operation."],
    v: "Queue a promise reaction from each of two listeners on one event. Confirm the first listener's reaction runs before the second listener, and that both run before any timer or rendering step.",
    dep: ["event-loop-tasks", "script-bindings"]
  },
  "timers-and-idle": {
    s: "Schedules script to run after a delay, repeatedly, or when the main thread is idle, with throttling that depends on page state.",
    d: "Timers are tasks queued at a deadline. The engine clamps short and nested delays to limit abuse, aligns timers to reduce wakeups, and throttles pages in the background, sometimes to once a second or less. Idle callbacks run in the gaps left by the frame, with a deadline derived from the time to the next frame or the next known task. Timer accuracy is therefore a best effort. The hard part is balancing power, fairness and compatibility with pages that expect a minimum of drift.",
    k: ["Clamping nested timers vs honoring zero delays: protects the main thread from tight loops, but code that expects immediate re-queuing runs slower.", "Idle callbacks with a deadline vs plain timers: work fits between frames without jank, but under constant load idle work may never run unless a timeout is given."],
    p: ["Relying on timers for animation pacing yields uneven frames and fires in hidden tabs where they are throttled.", "Idle work that ignores its deadline causes the very frame drops it was meant to avoid."],
    v: "Run a one-millisecond repeating timer in a foreground and a hidden page. Measure the interval: the foreground should settle near the clamp value, the hidden page near the background throttle rate.",
    dep: ["event-loop-tasks", "visibility-throttling", "task-prioritization"]
  },
  "custom-element-reactions": {
    s: "Runs author-defined callbacks when custom elements are created, connected, disconnected or have attributes changed, at carefully chosen points.",
    d: "Elements with a registered definition get lifecycle callbacks. Rather than run script in the middle of a DOM operation, the engine queues reactions on a per-element queue and runs them when the outermost bindings call returns, preserving a defined order. Elements created before their definition are upgraded when it registers. Parser-created elements use a synchronous construction path. It is hard because callbacks can mutate the DOM that triggered them, so every DOM primitive must be written to tolerate being interrupted at the stack boundary.",
    k: ["Queued reactions at the call boundary vs inline callbacks: DOM algorithms stay atomic from their own point of view, but order is subtle for nested operations.", "Upgrade of existing elements vs requiring definitions first: markup can precede scripts, but upgrades may touch large trees at registration time."],
    p: ["A connected callback that moves its own element can loop between connect and disconnect without ever settling.", "Constructors that read attributes or children fail for parser-created elements, where those do not yet exist."],
    v: "Define an element with logging callbacks, then insert a fragment containing nested instances. The log must show construction and connection in tree order, each exactly once, after the insertion returns.",
    dep: ["mutation-model", "script-bindings", "microtask-checkpoints", "tree-builder"]
  },
  "observers": {
    s: "Delivers batched notifications about DOM mutation, element size, and visibility in the viewport, outside the code that caused the change.",
    d: "Mutation observers record changes as small records and deliver them in a microtask, so script sees a batch after a burst of edits. Resize and intersection observers run in the rendering steps: after layout, the engine compares each observed element's size or visibility to its last report and queues entries for any change. Resize notifications can themselves change layout, so delivery loops up to a depth limit. Hard parts are cost on big trees, avoiding feedback loops, and keeping geometry reads from forcing extra layout.",
    k: ["Batched asynchronous delivery vs synchronous callbacks: far less re-entrancy and wasted work, but code sees stale state between the change and the notification.", "Delivering resize notifications in a loop until stable vs once per frame: layout converges, but pathological pages can burn the whole frame budget."],
    p: ["An observer that changes the size of its own target produces a loop the engine can only break by dropping notifications.", "Observing every node on a large page makes each mutation record expensive."],
    v: "Observe an element with a resize observer and change its width twice within one frame. Exactly one notification should arrive, after layout, carrying the final size.",
    dep: ["mutation-model", "microtask-checkpoints", "layout-invalidation", "frame-lifecycle"]
  },
  "forced-layout": {
    s: "When script reads geometry or computed style while changes are pending, the engine must run style and layout synchronously to answer correctly.",
    d: "Reading offsets, bounding rectangles, scroll positions or computed values must reflect all prior writes. If style or layout is dirty, the engine runs just enough of them right then, instead of waiting for the frame. This is correct but costly, and alternating writes and reads in a loop repeats the work for every iteration, a pattern called layout thrashing. Engines narrow the work to the affected subtree and skip layout when only independent properties are asked. It is hard because the set of reads that need layout is large and easy to trigger by accident.",
    k: ["Synchronous answers on demand vs returning the last frame's values: correct and simple for authors, but one careless read can turn a cheap update into a full layout.", "Partial lifecycle updates vs a full update: smaller cost when only one subtree is queried, with more bookkeeping about which stages are clean."],
    p: ["A loop that sets a style and reads an offset for each of a thousand elements performs a thousand layouts.", "Reads inside observer callbacks force layout again in the middle of the rendering steps."],
    v: "Time a loop that writes a width and reads the offset height of one thousand elements, then reorder it to do all reads first. The reordered version should run one layout and be many times faster.",
    dep: ["layout-invalidation", "style-invalidation", "computed-style", "frame-lifecycle"]
  },
  "input-stream-decoding": {
    s: "Turns the byte stream from the network into characters by detecting the encoding and decoding incrementally as chunks arrive.",
    d: "The engine determines the encoding from, in order, a byte order mark, the transport header, a declaration in the first bytes of the document, and finally a heuristic over the content. Decoding is stateful and incremental, because a multi-byte sequence can be split across chunks. The decoded stream feeds the tokenizer, and a late conflicting declaration can force the engine to restart parsing with another encoding. It is hard because wrong guesses garble text, and restarts are expensive once script has already run.",
    k: ["Prescanning the first bytes for a declaration vs trusting headers alone: handles files served without a charset, but the scan must be bounded or large documents stall.", "Restarting on a late encoding change vs keeping the guess: correct text, at the cost of repeating work and discarding side effects."],
    p: ["A chunk boundary inside a multi-byte sequence yields replacement characters if decoder state is not kept.", "A declaration beyond the scan window silently falls back to a wrong default encoding."],
    v: "Serve the same page with no header, a declaration at byte 900, and chunk boundaries inside multi-byte characters. The rendered text must be identical in every case, with no replacement characters.",
    dep: ["html-tokenizer"]
  },
  "html-tokenizer": {
    s: "A state machine that reads characters and emits start tags, end tags, text, comments and doctype tokens, handling every malformed input defined by the standard.",
    d: "The specification defines dozens of states, including character references, raw-text and script content, and several kinds of comments and attribute values. The tokenizer emits tokens to the tree builder, which can in turn change the tokenizer's state, for example after seeing a script or textarea start tag. Performance matters because it touches every byte: implementations use lookup tables, fast paths for plain text runs, and avoid allocation per token. Hard parts are exact parse-error behavior and being resumable when input ends mid-token.",
    k: ["Strict transcription of the state machine vs a hand-optimized scanner: exact web compatibility is easy to verify, but speed needs fast paths that must be proven equivalent.", "Tokenizing on the parser thread vs main thread: main-thread cost drops, but tokens must be handed over in bulk and script-driven state changes need coordination."],
    p: ["A missed state transition after raw-text elements makes content inside a script or style element parse as tags.", "Not resuming mid-token across chunks corrupts attributes that straddle a packet boundary."],
    v: "Run the standard conformance token tests, which include thousands of malformed inputs and split-chunk variants, and compare the emitted token stream and error list to the expected output exactly.",
    dep: ["input-stream-decoding", "tree-builder"]
  },
  "tree-builder": {
    s: "Consumes tokens and builds the DOM tree using insertion modes and stacks of open elements, always producing a tree, never rejecting input.",
    d: "The builder keeps an insertion mode, a stack of open elements and a list of active formatting elements. Each token is handled according to the mode and the current context, which may insert a node, close implied elements, switch modes or reprocess the token. It also handles templates, foreign content and scripting suspension. The result is deterministic for any input, so every compliant engine builds the same tree from broken markup. Hard parts are the dense special cases, which exist because pages in the wild depend on them.",
    k: ["Following the specified algorithm exactly vs a simpler recovery: identical trees across engines, but the rules are intricate and tests are essential.", "Building nodes directly on the main thread vs buffering operations on a parser thread: lower main-thread cost, but nodes appear in batches and scripts can see the tree mid-batch."],
    p: ["Misplaced table content moves outside the table silently, which surprises authors who expect the markup as written.", "Handling a script end tag without pausing the tokenizer lets later markup race ahead of the script."],
    v: "Parse a corpus of malformed fragments and compare the serialized tree to reference output from the conformance suite. Every tree must match exactly, including how misnested formatting tags are reparented.",
    dep: ["html-tokenizer", "node-tree", "error-recovery", "parser-blocking-scripts"]
  },
  "error-recovery": {
    s: "The rules that turn misnested, unclosed and misplaced markup into a well-formed tree, such as reconstructing formatting elements and foster-parenting table content.",
    d: "Recovery is a set of named procedures inside the tree builder. The adoption agency algorithm repairs misnested formatting tags like bold and italic by cloning and moving elements. Active formatting elements are reconstructed when a new block starts so style continues across paragraphs. Foster parenting moves stray content out of tables. Implied end tags close paragraphs and list items automatically. These behaviors are not elegant, but the web depends on them, and the standard was written by reverse engineering what browsers did.",
    k: ["Matching historical recovery behavior vs a cleaner error model: old pages keep working, but the rules look arbitrary and every engine must implement them all.", "Bounding work in pathological cases vs unbounded fidelity: deeply nested misnested tags can be quadratic, so limits protect the engine but alter output for hostile input."],
    p: ["Treating recovery as optional leaves malformed pages rendering differently from every other engine.", "Pathologically nested formatting tags can cause quadratic cloning and a long parse stall."],
    v: "Feed thousands of nested unclosed bold tags and a table with stray text cells. Parsing must finish within a fixed time bound, and the stray text must appear before the table in the resulting tree.",
    dep: ["tree-builder", "node-tree"]
  },
  "speculative-parsing": {
    s: "A lightweight scanner that runs ahead of the blocked parser to find resources such as scripts, styles and images and start fetching them early.",
    d: "While the real parser waits on a script, a second scanner tokenizes the remaining input without building a tree, looking for URLs in tags it knows load resources. It issues preload requests, with the right priority and credentials, so downloads overlap with the stall. It does not run script, so it can guess wrong when script would have changed the document or base URL. Hard parts are matching what the real parser would later request exactly, so the preload is reused, and not wasting bandwidth on resources that turn out unused.",
    k: ["Scanning ahead vs waiting for the real parser: network starts earlier and parser stalls hurt less, but wrong guesses spend bandwidth and can delay the right requests.", "Tracking enough state to resolve URLs vs a fast approximation: more preloads match, but the scanner duplicates logic of the real parser."],
    p: ["A preload issued with different credentials or type than the later request is not reused and downloads twice.", "Scanner decisions that ignore a base element resolve URLs against the wrong location."],
    v: "Load a page whose head has a slow blocking script followed by an image and a style sheet. The network log must show the image and sheet requests starting before the script finishes.",
    dep: ["html-tokenizer", "parser-blocking-scripts", "stylesheet-loading"]
  },
  "fragment-parsing": {
    s: "Parses a string of markup in the context of a given element, used for innerHTML, template contents and insertion APIs, without a whole document.",
    d: "Fragment parsing uses the same tokenizer and tree builder, but starts with a context element that decides the initial insertion mode and tokenizer state. Output nodes are placed into a new fragment with no scripts executed, then inserted. The reverse operation, serialization, writes a subtree back into markup, with escaping rules that must round trip. The problems are security and surprises: parsing a string in one context and serializing it into another can change its meaning, which is the basis of mutation-based injection attacks.",
    k: ["Reusing the document parser vs a dedicated fast path: identical semantics everywhere, but small fragments pay setup costs unless the engine special-cases simple strings.", "Context-dependent parsing vs context-free: output matches how the markup would parse in place, but the same string yields different trees in different parents."],
    p: ["Sanitizing a string, then parsing it in a different context than the sanitizer assumed, lets script through.", "Large innerHTML on a live node builds and tears down the entire old subtree synchronously."],
    v: "Parse the same string as the child of a table row, a select and a div, and serialize each. Confirm the three trees match the specified context-dependent results and round trip through serialization.",
    dep: ["tree-builder", "html-tokenizer", "mutation-model"]
  },
  "incremental-parse-yielding": {
    s: "Lets the parser run in small slices so rendering and input can happen while a large document is still being parsed.",
    d: "A big document is parsed in chunks as data arrives. After a time budget or a count of tokens, the parser yields to the event loop so tasks such as input and paint can run. When it resumes it continues from saved state. Some engines parse on a worker thread and commit tree operations on the main thread in batches. The decision of when to let the browser produce a frame before the document ends affects first paint. The hard part is giving up control without breaking script ordering or exposing a half-built tree in a surprising state.",
    k: ["Yielding on a time budget vs on a token count: time adapts to slow devices, but makes parse chunking nondeterministic and harder to test.", "Painting before the document ends vs waiting: earlier content for users, but layout changes as late content arrives and can shift what the reader sees."],
    p: ["A parser that never yields on a huge document freezes input for seconds.", "Yielding in the middle of a script element exposes a tree whose pending script is still downloading."],
    v: "Stream a ten-megabyte document over a slow connection and record input latency. A click during parsing must be handled within one frame, and the page must paint content that arrived before the document ended.",
    dep: ["html-tokenizer", "event-loop-tasks", "render-blocking"]
  },
});
