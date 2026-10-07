// Details for the client-side UI framework plate, part 3: rendering model, scheduling, server rendering, delivery, browser platform, cross-cutting.
ATLAS.details("ui-framework", {
  "view-description": {
    s: "The data structure a component produces to say what the interface should look like: element types, properties and children, as a tree of plain objects or as compiled instructions.",
    d: "Rendering a component yields a description, not DOM. In diffing designs it is a tree of lightweight nodes created on every update. In compiled designs it is a static template plus a set of bindings. The description is declarative: it says what, never how to change the screen. Treating the view as a value is what lets components compose, be tested and be rendered on a server. The cost is allocation, since building a fresh tree each update produces garbage, and the description must stay free of side effects.",
    k: ["Fresh description tree each update vs. static template with bindings: fresh trees are flexible and any code can build them; static templates allow update code to be precomputed.", "Plain objects vs. opaque handles: plain objects are inspectable and serializable, opaque handles allow cheaper internal representation."],
    p: ["Doing work with side effects while building the description makes the result depend on how often rendering happens.", "Large descriptions rebuilt on every keystroke create allocation pressure and pauses."],
    v: "Render the same component twice with identical inputs outside the browser, and confirm the two descriptions are structurally equal and that rendering made no DOM calls and no network requests.",
    dep: []
  },
  "virtual-dom": {
    s: "Keeps an in-memory tree of the last description, compares it with the new one after each update and applies only the differences to the real document.",
    d: "On each update the component re-runs and yields a new tree. The differ walks old and new trees together, comparing node types, properties and children, and records operations: create, update, move, remove. Those operations are then applied to the real DOM in a batch. It lets developers write code as if the whole screen were rebuilt, without paying for rebuilding it. The costs are the diff itself, which is proportional to tree size, and the memory for two trees. Its heuristics, such as assuming different types mean different subtrees, make it fast but not minimal.",
    k: ["Diff trees at runtime vs. compile precise updates: diffing needs no template analysis and supports any code, but costs time proportional to the tree; compiled updates skip comparison but restrict dynamism.", "Whole-tree diff vs. component-bounded diff: whole-tree is simple, component-bounded avoids work in untouched subtrees but needs update tracking."],
    p: ["Re-rendering a high-level component diffs thousands of unchanged nodes on every keystroke.", "Inserting an element at the start of an unkeyed list updates every following item instead of adding one."],
    v: "Update one leaf in a thousand-node tree and confirm the DOM mutation log records a single property change, while a profile shows diffing time proportional to the subtree that re-rendered.",
    dep: ["view-description", "reconciliation-keys", "host-renderer"]
  },
  "fine-grained-updates": {
    s: "Connects each dynamic value directly to the DOM node or property that shows it, so a change updates that node alone and nothing is compared or re-run.",
    d: "At creation, the compiled template builds nodes once and sets up a small computation per dynamic binding that reads reactive values and writes one text node or attribute. When a value changes, only the computations that read it run. Component functions execute once, and there is no tree comparison. Updates cost in proportion to what changed rather than the size of the view. The difficulty is control flow: lists and conditionals need their own reactive structures to create and dispose nodes, and the model requires developers to keep reads inside tracked places.",
    k: ["Direct bindings vs. re-run and diff: direct bindings do the least work per change and have no comparison cost, but require reactive discipline and tooling support; re-run and diff is forgiving.", "Run components once vs. on every update: running once is efficient and stable, but closures and conditions must be written reactively."],
    p: ["Reading a value outside a binding captures it once, and the displayed text never updates.", "Many tiny computations each hold memory, and a view with a huge number of bindings costs more at creation than diffing would."],
    v: "Bind a counter to one text node in a page of a thousand nodes, increment it, and confirm that only that text node's data changes in the DOM mutation log and no component function ran again.",
    dep: ["reactive-primitives", "template-compiler", "dom-mutation-api"]
  },
  "reconciliation-keys": {
    s: "The rules for deciding whether an element in the new view is the same as one in the old, using type, position and developer-supplied keys, so state and DOM are preserved correctly.",
    d: "When updating a list of children, the framework matches new entries to old ones. Without keys it matches by position, so inserting at the front shifts every item and reuses the wrong instances. With stable keys it matches by identity and moves nodes. The same rule applies to a single child: a different type or key means the old one is destroyed with its state and a new one created. Algorithms like longest-increasing-subsequence minimize moves. The hard part is that key choice is the developer's, and wrong keys silently attach state to the wrong item.",
    k: ["Match by position vs. by key: position needs no input from developers but reuses wrong instances on reorder; keys are exact but require stable identifiers.", "Resetting state by changing a key vs. explicit reset code: a key change is a concise reset but destroys the whole subtree, explicit reset keeps the nodes and takes more code."],
    p: ["Using the array index as the key makes inputs keep their text when the list is sorted, as state stays at the position.", "Generating a random key each render destroys and recreates every item on every update."],
    v: "Reorder a keyed list of inputs holding typed text, and confirm the text moves with its row and the DOM mutation log shows node moves, not recreation; repeat with index keys and observe the mismatch.",
    dep: ["view-description", "virtual-dom"]
  },
  "host-renderer": {
    s: "The interface between the framework's core and the thing it draws into, with operations to create, update, insert and remove nodes, so the same core can target the DOM, a server string or native views.",
    d: "The core never touches the document directly. It calls host operations: create an element, set a property, insert a child before another, remove a node, set text, schedule a callback. A DOM host implements these with browser APIs, a server host builds strings, a test host records calls and native hosts create platform widgets. Separating them lets custom renderers exist. The difficulty is the abstraction boundary: operations must be few enough to implement and rich enough for performance, and platform differences, such as event models, leak through.",
    k: ["Abstract host interface vs. direct DOM calls: an interface allows other targets and testing, but adds an indirection layer on the hottest path.", "Fine-grained operations vs. batched instructions: fine-grained is simple to implement, batching reduces calls across boundaries such as workers."],
    p: ["A host that implements insertion differently handles moving a node as remove and insert, losing focus and playing animations again.", "Platform-specific behavior leaks into shared components, so the same component works on one host only."],
    v: "Run the same component with the DOM host and the recording host, and confirm the recorded operation sequence matches the DOM mutations observed for the DOM host, and the server host output equals the first-render markup.",
    dep: ["dom-mutation-api"]
  },
  "binding-system": {
    s: "Applies values from the view description to DOM nodes, deciding whether each name is a property, an attribute, a style, a class or an event listener.",
    d: "A value named in the view must become the right kind of change: setting an element's property, setting or removing an attribute, toggling a class, updating one style entry, or attaching a listener. Boolean attributes are present or absent, some values are properties only, and form controls have separate value and default value. The binder caches the last applied value to avoid redundant writes. The difficulty is the platform's inconsistencies: names differ between attributes and properties, and unknown elements, namespaced elements such as graphics, and custom elements each follow their own rules.",
    k: ["Prefer properties vs. attributes: properties carry real values and are faster, attributes appear in markup and in server output and are needed for styling selectors.", "Skip writes when unchanged vs. always write: skipping saves DOM work but trusts the cache, and always writing fights external modification."],
    p: ["Writing the attribute for a form control's value changes only the initial value, and the field stops reflecting state after the user types.", "Setting a boolean attribute to the text false leaves it on, since presence alone means true."],
    v: "Bind a checked state, a disabled flag, a class list and an inline style to an element, toggle each, and confirm the element's properties and computed style change correctly and the DOM log shows no redundant writes.",
    dep: ["dom-mutation-api", "view-description"]
  },
  "memoization-boundaries": {
    s: "Marks points where the framework may skip re-rendering a subtree because its inputs have not changed, so work is limited to what was affected.",
    d: "A boundary compares the previous and new inputs of a component, props and context, using identity or a custom comparison, and if they match, reuses the earlier output and skips everything below. Compilers may insert boundaries automatically. Without them, an update in a parent re-renders all descendants. The difficulty is that a boundary is only valid if inputs are stable: new objects and functions created on each render defeat it, and comparison itself has a cost that exceeds the work saved when inputs nearly always change.",
    k: ["Manual boundaries vs. automatic compiler insertion: manual is explicit and tunable but easy to forget or get wrong; automatic is uniform, but depends on the compiler understanding the code.", "Shallow comparison vs. deep comparison: shallow is cheap and fails on rebuilt objects; deep is accurate and can cost more than the render."],
    p: ["A boundary wraps a component that receives a fresh object each time, paying for comparison and never skipping.", "Stale output is shown because an input outside the compared set changed, such as a mutated object."],
    v: "Wrap a heavy child in a boundary, update an unrelated parent value ten times, and confirm in the profiler that the child rendered zero additional times, then change one of its props and confirm one render.",
    dep: ["view-description", "props-and-events"]
  },
  "list-virtualization": {
    s: "Renders only the rows visible in a scroll container, plus a buffer, and reuses or recycles them as the user scrolls, so huge lists stay fast.",
    d: "The container has a total height computed from item count and row heights, and a window calculates which indices are visible from the scroll offset. Only those rows exist in the DOM, positioned absolutely or by padding. Variable heights require measurement and a cache of measured sizes, with estimates for unmeasured rows. It cuts node count and layout cost dramatically. The difficulties are costs elsewhere: find-in-page, anchor links and screen reader navigation cannot see rows that are not rendered, and fast scrolling can reveal blank areas.",
    k: ["Fixed row height vs. measured variable height: fixed is simple and exact; variable fits real content but needs measuring and jumps when estimates are wrong.", "Virtualize vs. paginate: virtualizing keeps one continuous list, pagination bounds the DOM trivially and keeps native find and navigation working."],
    p: ["Scrollbar size jumps as rows are measured, and the user loses their position.", "Screen reader users and find-in-page cannot reach items that are outside the window."],
    v: "Render one hundred thousand rows, and confirm the DOM holds only a few dozen row nodes, scrolling stays at the display's frame rate and jumping to row 90,000 shows that row with no blank gap.",
    dep: ["layout-measurement", "observers", "fragments-and-text"]
  },
  "fragments-and-text": {
    s: "Allows a component to return several siblings or plain text without a wrapper element, and defines how adjacent text and empty values are represented.",
    d: "A fragment is a node with children and no DOM output of its own, so a component can return a list of cells for a table row or items for a list without invalid wrapper markup. Text values become text nodes, merged or kept separate depending on the framework, and null, false and empty values render nothing but still occupy a position for matching. The host renderer needs to know a fragment's boundaries to insert and move its children as a group. The difficulty is tracking boundaries: a fragment with no children or one that moves must still find its place.",
    k: ["Wrapper-free fragments vs. always a single root: fragments keep markup valid and styling simple, but complicate position tracking and event targets; single roots are easier to manage and add nodes.", "Merge adjacent text vs. separate nodes: merging reduces nodes but changes how server output is parsed by the browser."],
    p: ["Adjacent text nodes in server output are merged by the HTML parser, so hydration finds fewer nodes than expected.", "A fragment inside a flex or grid parent leaves children as direct items, changing layout unexpectedly."],
    v: "Render a table row component returning three cells as a fragment, and confirm the DOM contains three cells directly under the row with no wrapper, and that moving the fragment moves all three together.",
    dep: ["view-description", "host-renderer"]
  },
  "update-batching": {
    s: "Collects several state changes made in the same tick into a single render, so one user action causes one update, not many.",
    d: "When state changes, the framework does not render immediately. It marks the owning component or computation dirty and enqueues a flush, usually at the end of the current event handler or microtask. At flush it renders each dirty unit once with the latest values, ordered parents before children so a child is not rendered twice. Code that sets three values in one handler yields one render. The trade is visibility: reads right after a write see old values, and flush timing differs between event handlers, timers and promises unless the framework batches uniformly.",
    k: ["Batch everything uniformly vs. only inside framework events: uniform batching is predictable and efficient, but state reads after writes surprise developers; limited batching feels immediate and renders more.", "Flush in a microtask vs. in a frame: microtask is fast and before paint; frame-aligned batching matches display updates and delays results."],
    p: ["Code reads a value immediately after setting it and sees the previous value.", "Updates inside a promise callback are not batched in some designs, and each triggers its own render."],
    v: "Set three state values in one click handler and confirm the profiler shows one render and one DOM commit; set them again in a timer callback and confirm still one render.",
    dep: ["task-scheduler"]
  },
  "task-scheduler": {
    s: "Decides when queued render and effect work runs relative to input, painting and other tasks, by splitting work into small tasks and yielding to the browser between them.",
    d: "The scheduler keeps a priority queue of units of work, each with an expiry. It runs units until a time slice, typically a few milliseconds, is spent, then yields back to the event loop through a message or the browser's scheduling API so input and painting can proceed. Work close to expiry runs regardless. It makes long renders interruptible, so a keystroke is handled between slices. The difficulty is that yielding has overhead, tasks can starve if urgent work never stops arriving, and the scheduler competes with the application's own timers.",
    k: ["Time-sliced rendering vs. run to completion: slicing keeps input responsive during big updates but adds bookkeeping and allows the screen to show partial work if not coordinated; run-to-completion is simple and blocks.", "Own scheduler vs. browser scheduling API: own is available everywhere and tunable, the platform's version integrates with priorities and input awareness."],
    p: ["Slices that are too long block input, while slices that are too short spend more time scheduling than rendering.", "A constant stream of urgent updates starves low-priority work, which then never runs."],
    v: "Trigger a render taking 300 ms of work while typing in an unrelated field, and confirm each keystroke is handled within one frame because the render was split across slices and finished afterward.",
    dep: ["browser-scheduling-apis", "update-batching"]
  },
  "priority-lanes": {
    s: "Classifies updates by urgency, such as typing, hovering or background data, so urgent ones are rendered first and less urgent ones can be interrupted and restarted.",
    d: "Each update is tagged with a priority from where it originated: discrete input is highest, continuous input such as scrolling is next, data arrival and transitions are lower. The scheduler picks the highest-priority pending work and may abandon a partly finished low-priority render when a higher one arrives, then redo it with fresh state. Rendering must therefore be free of side effects, since it can be started many times. The difficulty is correctness of interrupted work: components must tolerate being rendered and discarded, and tearing between external data and rendered state must be prevented.",
    k: ["Interruptible rendering vs. committed rendering: interruptible keeps input fluid but demands pure components and risks inconsistent reads of external data; committed is simple and can block.", "Automatic priorities vs. developer-marked: automatic is invisible but coarse; marking gives control and another concept to teach."],
    p: ["A component with side effects in render runs them several times, since the render was started, discarded and restarted.", "External mutable data read during an interrupted render shows two different values in one frame."],
    v: "Type into a field while a large filtered list updates at low priority, and confirm the field's characters appear immediately and the list catches up afterward, with the discarded partial render absent from the DOM log.",
    dep: ["task-scheduler", "update-batching", "view-description"]
  },
  "lifecycle-hooks": {
    s: "Defined points in a component's life, creation, first display, update and removal, where code can run to set up or release resources.",
    d: "Each component passes through stages: it is created, rendered, committed to the document, updated on later renders and finally unmounted. The framework offers hooks or callbacks at fixed points, some before the DOM is touched and some after. Setup code subscribes or measures, and teardown code releases subscriptions and timers. Modern designs fold these into effects with cleanup. The difficulty is order and repetition: parents and children mount in a defined sequence, development modes can mount twice to expose missing cleanup, and server rendering runs only the early stages.",
    k: ["Separate lifecycle callbacks vs. a single effect with cleanup: callbacks name the moment clearly, effects pair setup with teardown, which is harder to forget but obscures timing.", "Run mount code twice in development vs. once: double mounting exposes missing cleanup early, but surprises developers who assumed one run."],
    p: ["A subscription made on mount with no teardown keeps running after the component is gone and updates a ghost.", "Code that assumes the DOM exists runs during server rendering and throws."],
    v: "Mount and unmount a component that adds a window listener, and confirm via a listener count that it increases by one on mount and returns to zero on unmount, including after ten rapid mount-unmount cycles.",
    dep: ["component-model", "update-batching"]
  },
  "effects": {
    s: "Code that runs after rendering to synchronize with something outside the framework, such as a subscription, a document title or a timer, and cleans up before the next run.",
    d: "An effect is declared with the values it uses. After a commit, the framework runs it if those values changed, first running the previous run's cleanup. Effects run after paint by default, so they do not block display. They keep external systems in sync with state: opening a connection for a given id, then closing it when the id changes or the component leaves. The difficulty is overuse and staleness: effects used to derive state cause extra renders and loops, missing dependencies capture old values, and asynchronous work inside them can finish after cleanup.",
    k: ["Effects for synchronization only vs. for deriving state: restricting effects to external systems keeps data flow clear; deriving state in effects causes cascades of renders.", "Dependency list written by hand vs. tracked automatically: manual lists are visible but forgotten entries cause stale values; automatic tracking removes that bug and hides what triggers a re-run."],
    p: ["An asynchronous request started in an effect returns after cleanup and sets state on a component that is gone or on a newer id.", "Setting state in an effect that depends on that state loops forever."],
    v: "Change the id an effect depends on twice quickly, and confirm the first connection is closed before the second is opened, no response from the first updates the screen, and only one connection remains open.",
    dep: ["lifecycle-hooks", "dependency-tracking", "update-batching"]
  },
  "layout-measurement": {
    s: "A phase that runs after the DOM is updated but before the browser paints, so code can read sizes and positions and adjust without a visible flicker.",
    d: "Measuring an element, such as its height for a tooltip placement, requires the DOM to be updated first. Running that measurement in an ordinary after-paint effect shows one frame with the wrong position. The framework runs layout effects synchronously after the commit, before the browser paints, and any state set there triggers a render before paint. Reads of layout force the browser to compute it synchronously. The difficulty is cost and safety: interleaving reads and writes causes repeated forced layouts, and these effects do not run on the server.",
    k: ["Measure before paint vs. after paint: before paint avoids flicker but blocks display until done; after paint is non-blocking and may show one wrong frame.", "Measure in script vs. observer APIs: script measurement is immediate and forces layout; observers report asynchronously with no forced layout and one frame of lag."],
    p: ["Alternating reads and writes of layout in a loop forces the browser to recompute layout on each iteration and the page stutters.", "Measuring in a server-rendered component throws, as no layout exists there."],
    v: "Position a tooltip from the measured size of its target, and confirm via frame capture that its first painted frame is already in the right place, with only one layout pass recorded in the performance trace.",
    dep: ["effects", "dom-mutation-api", "observers"]
  },
  "suspense-boundaries": {
    s: "Marks regions that may be waiting for code or data, showing a placeholder for that region while the rest of the page remains usable.",
    d: "A component that cannot render yet signals that it is waiting, by throwing a promise or returning a pending marker. The nearest boundary above catches it, shows its fallback and retries when the promise settles. Boundaries nest so each region loads independently. On the server, the same mechanism decides what to stream first and what to defer. It moves loading states from each component to a few places in the tree. The difficulty is design: too many boundaries show a flickering patchwork, too few block large regions, and waterfalls hide when children start fetching only after their parents resolve.",
    k: ["Boundaries around regions vs. loading flags in each component: boundaries centralize loading design and avoid repeated checks, but make the waiting point implicit; flags are explicit and noisy.", "Show fallback immediately vs. delay it: immediate avoids a blank screen, delaying avoids flashing a spinner for fast loads."],
    p: ["Nested boundaries each resolve at different times, and the layout jumps several times as pieces appear.", "Fetching in a child only after the parent resolves creates a sequential waterfall that is invisible in the code."],
    v: "Load a page with two independent slow regions behind separate boundaries, and confirm each shows its fallback, the rest of the page stays interactive, and each region replaces its fallback as its own data arrives.",
    dep: ["error-boundaries", "query-cache", "streaming-html"]
  },
  "error-boundaries": {
    s: "Catches errors thrown while rendering a subtree and shows a fallback for that region, so one failing component does not blank the whole application.",
    d: "When a component throws during render or in a lifecycle step, the framework unwinds to the nearest boundary, discards the failed subtree and renders the fallback instead, optionally with a retry that resets the boundary. The boundary also reports the error with the component stack to logging. Without a boundary, the whole tree unmounts, since a half-rendered tree would be inconsistent. The difficulty is the gaps: errors in event handlers, asynchronous callbacks and the boundary's own fallback are not caught by the mechanism and need separate handling.",
    k: ["Boundary per region vs. one at the root: per-region contains failures and keeps the rest usable, but needs a meaningful fallback for each; root-only is simple and fails the entire page.", "Retry automatically vs. on user action: automatic retry hides transient failure, but may loop on a deterministic one."],
    p: ["An error in an event handler bypasses the boundary and leaves the interface in a broken state with no message.", "A boundary that re-renders the same failing child after retry loops and floods the logger."],
    v: "Make one widget throw while rendering, and confirm only its region shows the fallback, the rest of the page works, the error and component stack reach the logger once, and retry restores the widget after the fault is removed.",
    dep: ["component-model", "lifecycle-hooks"]
  },
  "transitions": {
    s: "Marks a state change as non-urgent, so the interface keeps showing the current screen and stays responsive while the next one prepares in the background.",
    d: "A navigation or filter change is wrapped as a transition. The framework renders the new state at low priority in the background, keeps the old view visible, and exposes a pending flag. If it would suspend, the old screen stays rather than showing a fallback. If another urgent update occurs, the background work is dropped or restarted. It avoids layout jumps from loading spinners on fast updates. The difficulty is feedback: users must still see that something is happening, and background rendering can use stale inputs that need to be reconciled when it commits.",
    k: ["Keep old view during transition vs. show fallback at once: keeping avoids flicker but delays any visible response; fallback gives immediate feedback and flashes content.", "Defer a value vs. defer an update: deferring a value is local and simple; deferring an update covers everything it triggers and needs wrapping at the source."],
    p: ["A transition with no pending indicator makes the interface look broken during a slow update.", "Work marked as non-urgent is starved by constant urgent updates and never commits."],
    v: "Switch a tab whose content takes 400 ms to render, and confirm the old content stays visible and interactive, a pending indicator appears, and the new content swaps in at once when ready without a blank state.",
    dep: ["priority-lanes", "suspense-boundaries", "task-scheduler"]
  },
  "server-renderer": {
    s: "Runs components on a server to produce an HTML string of the first screen, so users and crawlers see content before any script runs.",
    d: "The same components are run with a server host that appends to a string or a stream rather than touching a document. Data they need must be available before output, so the server fetches it first or waits on boundaries. Lifecycle effects and browser-only APIs are skipped or guarded. State used during rendering is serialized into the page so the browser can start from it. The difficulty is shared code: components must not rely on browser globals, per-request state must be isolated from other requests, and output must be identical to what the browser computes at hydration.",
    k: ["Render per request vs. precompute at build time: per request is always fresh and personalized but costs server time; build-time is cheap and cacheable but stale until rebuilt.", "Same components on both sides vs. separate server templates: shared components avoid duplication but add constraints; separate templates are free of them and duplicate the interface."],
    p: ["Module-level state shared between requests leaks one user's data into another's page.", "Code referencing browser globals crashes the server render, often only in a rarely used component."],
    v: "Request the page with scripts disabled and confirm the full content is in the response body, then fire two concurrent requests for different users and confirm each response contains only its own data.",
    dep: ["host-renderer", "view-description", "head-management"]
  },
  "streaming-html": {
    s: "Sends the page to the browser in chunks as parts become ready, so the shell and fast regions display while slow data is still loading.",
    d: "The server writes the document's shell immediately, with placeholders for regions behind boundaries. As each region's data resolves, it writes that region's HTML with a small instruction to move it into its placeholder, and, with inline data, the state needed later. The browser renders progressively as chunks arrive. It lowers time to first byte and first paint on slow-data pages. The difficulty is that headers and status codes are sent first, so a late error cannot change the response status, and proxies that buffer responses defeat the whole effect.",
    k: ["Stream with placeholders vs. wait for everything: streaming improves perceived speed but fixes the status code before knowing about errors; waiting is simpler and slower.", "Out-of-order vs. in-order streaming: out-of-order shows whichever region is ready first but moves content on the page; in-order is stable and waits behind the slowest earlier part."],
    p: ["An intermediate proxy buffers the response, and users see nothing until the whole page is ready.", "An error found after streaming begins can only be shown inline, because the response already reported success."],
    v: "Request a page with one slow region, and confirm in the network timeline that the first bytes arrive immediately, the shell paints before the slow region resolves, and the region then appears in place without a reload.",
    dep: ["server-renderer", "suspense-boundaries"]
  },
  "hydration": {
    s: "Attaches event handlers and state to HTML that the server already produced, by running the components in the browser and matching them to the existing nodes.",
    d: "The browser downloads the code, runs the components against the server's markup, walks the existing DOM in step with the new view description and adopts each node instead of creating it. State serialized into the page seeds the components. Handlers are attached and the page becomes interactive. It reuses the server's work but still re-executes every component, so cost grows with page size. The difficulty is mismatch: if the browser's first render differs from the server's, due to time, randomness or locale, the framework must patch or discard the markup, and the page can flicker or break.",
    k: ["Full hydration vs. lazier strategies: full is simple and uniform, but pays for all components up front; lazier approaches cut startup work and complicate the model.", "Repair mismatches silently vs. report them: silent repair keeps the page working but hides bugs; reporting finds them and can be noisy."],
    p: ["Rendering a timestamp or random value on both sides produces different output and a hydration mismatch.", "The page looks ready but ignores clicks until hydration finishes, as users interact with inert controls."],
    v: "Load a server-rendered page on a throttled device, click a control before and after hydration completes, and confirm the first click is handled or replayed and the second is handled, with zero mismatch warnings in the console.",
    dep: ["server-renderer", "reconciliation-keys", "browser-event-system"]
  },
  "partial-hydration": {
    s: "Hydrates only the interactive parts of a page, leaving static regions as plain HTML with no code shipped for them.",
    d: "Components are marked, by the developer or by analysis, as interactive. Only those get their code and a hydration trigger: immediately, when visible, when idle or on first interaction. Static regions stay inert HTML and never download their component code. This reduces script size and main-thread work on content-heavy pages. The difficulty is boundaries: islands cannot easily share state or context with each other, and a page that is mostly interactive gains little and pays for the added orchestration.",
    k: ["Islands of interactivity vs. whole-page hydration: islands cut the cost on mostly static pages but make shared state across islands awkward; whole-page is uniform and costs more.", "Hydrate on visibility vs. on load: visibility defers cost until needed but can make a control unresponsive on first reach; on load is ready and costs earlier."],
    p: ["Two islands need the same state, and developers invent ad hoc channels between them.", "A control hydrated only when visible does not respond to a click that arrives during the hydration delay."],
    v: "Build a page with one interactive widget among static content, and confirm the network shows code only for that widget, the static parts ship no component code, and the widget hydrates when it scrolls into view.",
    dep: ["hydration", "code-splitting", "observers"]
  },
  "resumability": {
    s: "Serializes the application's state and event wiring into the HTML so the browser can continue where the server stopped, without re-running components to become interactive.",
    d: "Instead of re-executing everything, the server output records, for each handler, the reference to its code chunk and the state it closes over. The browser loads a tiny listener that, on the first event, downloads only the code for that handler and the state it needs, then runs it. Startup work is near constant regardless of page size. It requires the compiler to split code at handler boundaries and make state serializable. The difficulty is constraints on code shape: closures must be serializable, and the first interaction pays a network delay.",
    k: ["Resume from serialized state vs. re-execute to hydrate: resuming gives constant startup and pushes cost to first interaction; hydrating costs more at start and is uniform afterward.", "Serialize all state vs. only what handlers use: all is simple and large; selective is small but needs compiler analysis."],
    p: ["State that cannot be serialized, such as a connection or class instance, breaks the resume model and needs workarounds.", "The first click waits for a chunk download, and the control feels sluggish on slow networks."],
    v: "Load a large page with no interaction and confirm the browser downloads and runs almost no component code; click one button and confirm only that handler's chunk is fetched and the action succeeds.",
    dep: ["server-renderer", "code-splitting", "template-compiler"]
  },
  "static-generation": {
    s: "Renders pages to HTML files at build time, so serving them requires only a static file host and no per-request computation.",
    d: "The build enumerates the pages, from files or from data, renders each to HTML with the server renderer and writes them with their assets. Pages are then served from a cache or edge storage, and hydrated in the browser if they are interactive. Incremental regeneration rebuilds individual pages on demand or on a schedule instead of the whole site. It gives the best load time and the lowest cost. The difficulty is freshness and scale: content changes need a rebuild, personalized content cannot be baked in, and very large sites make full builds slow.",
    k: ["Build-time pages vs. render per request: build-time is fastest and cheapest to serve but stale until rebuilt; per request is fresh and costs compute.", "Rebuild everything vs. incremental regeneration: full rebuild is simple and always consistent, incremental scales to many pages and complicates cache invalidation."],
    p: ["A content edit does not appear because the page was generated before it and nothing triggered a rebuild.", "A build of one hundred thousand pages takes hours and blocks every deploy."],
    v: "Build the site, serve the output from a plain file server with no application runtime, and confirm each route returns complete HTML; edit one data record, trigger regeneration and confirm only that page's file changes.",
    dep: ["server-renderer", "module-bundler", "route-matching"]
  },
  "server-components": {
    s: "Components that run only on the server and send their rendered output, not their code, to the browser, so data access and heavy dependencies stay off the client.",
    d: "A component marked as server-only can read databases or files directly and use large libraries. Its output is sent as a serialized tree that the client framework merges into the page, with references to client components that remain interactive. The server component's code and dependencies are never shipped. On navigation, the client asks for a new serialized tree and the framework merges it, preserving client state. The difficulty is the boundary: props crossing it must be serializable, a server-only component cannot hold state or effects, and the split adds a mental model of two kinds of components.",
    k: ["Server-only components vs. client components everywhere: server-only removes code and fetch waterfalls from the client but adds a boundary and serialization rules; client-only is one model and ships everything.", "Merge serialized trees on navigation vs. full page loads: merging preserves client state and is fast but needs a streaming format and a protocol."],
    p: ["Passing a function or class instance across the boundary fails, since only serializable data can cross.", "Secrets or sensitive data placed in props of a client component are sent to every browser."],
    v: "Build a page using a server-only component with a large dependency, and confirm that dependency is absent from every client bundle, while an interactive child still responds to clicks and keeps its state across a navigation.",
    dep: ["server-renderer", "streaming-html", "props-and-events"]
  },
  "head-management": {
    s: "Lets components set the document's title, meta tags and links, in both server and browser rendering, based on the current screen.",
    d: "A component declares head elements, such as the title, description, canonical link and social preview tags, and the framework collects them from the whole tree, resolves duplicates by letting the deepest component win, and writes them into the document head. On the server, they are included in the first response, which is what crawlers and link previews read. In the browser, they update on navigation, and the title also serves screen reader users as the page announcement. The difficulty is ordering and timing: head output must be known before the streamed shell is sent.",
    k: ["Head tags declared in components vs. in route configuration: components keep tags beside the content that determines them; route configuration is simple and static but cannot see loaded data.", "Deepest declaration wins vs. merge: deepest wins is predictable, merging suits lists of tags and needs rules per tag."],
    p: ["A streamed page sends the head before a slow component sets its title, and crawlers see the default.", "Two components set the same tag and both appear, producing duplicate canonical links."],
    v: "Fetch the server response for a product page with scripts disabled and confirm the title, description and canonical link reflect that product; navigate client-side and confirm the title updates and no duplicate tags exist.",
    dep: ["server-renderer", "route-data-loaders"]
  },
  "code-splitting": {
    s: "Divides the application into chunks loaded on demand, usually by route or feature, so the first load downloads only what the first screen needs.",
    d: "The code uses dynamic import boundaries, and the bundler turns each into a separate chunk with a manifest of which chunks each route needs. A shared-dependency analysis puts common code in shared chunks. On navigation, the runtime requests the needed chunks, in parallel with data. Smaller initial downloads improve load time. The difficulty is granularity: too coarse leaves large first loads, too fine produces many requests and waterfalls where a chunk's own imports are discovered only after it arrives.",
    k: ["Split by route vs. by component: route splitting is predictable and covers most cases; component-level splitting trims more but multiplies loading states.", "Few shared chunks vs. duplicate shared code: shared chunks save bytes and add requests, duplication removes requests and grows total download."],
    p: ["A chunk's imports are only discovered after it loads, creating a waterfall of sequential requests.", "A shared dependency is split into dozens of tiny files, and request overhead exceeds the savings."],
    v: "Load the home page and confirm the network shows only the entry and home chunks, with total script under the budget; navigate to another route and confirm only that route's chunks load, in parallel.",
    dep: ["module-bundler", "lazy-components"]
  },
  "lazy-components": {
    s: "Loads a component's code the first time it is needed, showing a placeholder until it arrives, so rarely used features cost nothing at startup.",
    d: "A lazy component wraps a dynamic import. The first render triggers the download, the framework treats it as waiting and a suspense boundary shows a fallback. After it arrives, the component renders and is cached for later uses. Typical candidates are dialogs, editors, charts and settings screens. Combined with preloading, the delay disappears for likely next steps. The difficulty is failure: a chunk request can fail, especially after a new deployment removed the old file, so errors need a boundary and a retry, and a fallback that differs in size causes layout shift.",
    k: ["Lazy load on first render vs. preload on intent: lazy on render keeps startup minimal but delays the feature; preloading on hover or idle hides the delay and fetches more.", "Fallback with reserved size vs. generic spinner: reserved size prevents layout shift but needs known dimensions."],
    p: ["After a deployment, an open tab requests a chunk that no longer exists and the feature fails until reload.", "A fallback with no reserved size makes the page jump when the component appears."],
    v: "Open the settings dialog for the first time on a throttled connection, and confirm a fallback of the right size appears, the chunk loads once, the dialog renders, and a second open shows it instantly with no new request.",
    dep: ["code-splitting", "suspense-boundaries", "error-boundaries"]
  },
  "chunk-preloading": {
    s: "Tells the browser to fetch chunks the user will probably need next, at low priority and in advance, so navigation and lazy features appear instantly.",
    d: "The build emits a manifest that lists each route's chunks and their dependencies. The server adds preload hints for the first screen's critical chunks to the head, and the client adds hints for likely next routes on idle or intent. Browsers fetch hinted resources at an assigned priority and keep them in cache for the later import. Preloading the right set shortens the critical path. The difficulty is precision: hinting too much steals bandwidth from critical resources, and wrong hints waste data for users on metered plans.",
    k: ["Preload critical chunks vs. prefetch likely ones: preload raises priority for what is needed now, prefetch uses idle bandwidth for what may be needed, and confusing them delays the first screen.", "Hints in HTML vs. injected by script: HTML hints start before scripts run; script-injected hints can depend on user behavior and start late."],
    p: ["Preloading every route's code at startup competes with the first screen's resources and slows it.", "Hinted resources fetched with a different credentials mode are not reused and are downloaded twice."],
    v: "Load the page and confirm via the network panel that the first screen's chunks have high priority and start from the HTML, while next-route chunks load at lowest priority after idle, and that a later navigation reuses them from cache.",
    dep: ["code-splitting", "asset-hashing", "head-management"]
  },
  "asset-hashing": {
    s: "Names each built file with a hash of its content, so it can be cached forever, and changes to a file change its name and force a fresh download.",
    d: "The bundler computes a hash from each output file's content and includes it in the filename, then rewrites every reference, including entry points, imports between chunks and style assets. The server serves these with long-lived caching headers, while the HTML that points to them is served uncached or briefly cached. Unchanged chunks keep their names across releases, so returning users download only what changed. The difficulty is stability: a change to a shared module must not change the hash of unrelated chunks, and old files must stay available while old pages are still open.",
    k: ["Content-hashed names with forever caching vs. fixed names with validation: hashes remove validation requests and guarantee freshness, but need a build that rewrites references; fixed names are simple and need a request per file.", "Keep old releases available vs. delete: keeping avoids broken open tabs and costs storage; deleting is clean and breaks lazy loads."],
    p: ["A hash that includes an unrelated value changes on every build, and nothing stays cached.", "Deleting old files at deploy breaks every open tab that has not reloaded."],
    v: "Deploy a release that changes one component, and confirm only that chunk and the entry file receive new names, while the other chunk names are byte-identical and are served from cache on a return visit.",
    dep: ["module-bundler", "minification"]
  },
  "bundle-budgets": {
    s: "Limits on the size of shipped code per route, enforced in the build, so growth is noticed when it happens and not after users complain.",
    d: "The build measures compressed script, style and sometimes image size for each entry and route, and compares them with limits stored in configuration. A report shows what each dependency contributes. Exceeding a limit fails the build or warns on the pull request, with a diff against the previous release. Budgets turn performance into a visible constraint with an owner. The difficulty is choosing limits that reflect real devices and networks, and keeping them honest: a budget raised each time it is exceeded protects nothing.",
    k: ["Fail the build vs. warn: failing forces a decision but blocks urgent fixes; warning is easy to ignore and becomes noise.", "Budget on bytes vs. on measured user metrics: bytes are deterministic and checkable in the build; user metrics reflect reality and vary run to run."],
    p: ["A single added dependency adds hundreds of kilobytes, and nobody notices until the next quarterly review.", "Budgets are raised whenever they fail, so they no longer constrain anything."],
    v: "Add a large dependency to a route in a branch, and confirm the build fails or flags it with the route name, the new size, the budget and the dependency responsible, and that removing it restores a pass.",
    dep: ["module-bundler", "minification", "tree-shaking"]
  },
  "dom-mutation-api": {
    s: "The browser operations that create, change, move and remove nodes, which the framework calls to apply its updates and which cost differently depending on what they invalidate.",
    d: "Frameworks use methods to create elements, set text, set attributes and properties, insert and remove nodes. Each mutation may invalidate style or layout, which the browser recalculates before the next paint, or sooner if script reads layout. Batching writes and avoiding interleaved reads avoids repeated recalculation. Frameworks cut costs by touching the minimum nodes and by building detached subtrees before inserting. The difficulty is that costs are indirect: the call is cheap and the layout it causes is not, and the same operation differs in cost across engines.",
    k: ["Build detached then insert vs. mutate in place: building detached causes one invalidation, in-place mutation triggers many but is needed to preserve existing nodes.", "Fine-grained property writes vs. replacing nodes: property writes keep focus and state, replacement is simpler and loses them."],
    p: ["Mutating a node, then reading its size, then mutating again forces layout repeatedly in a loop.", "Replacing a node that has focus or an active selection drops the user's place."],
    v: "Apply one thousand row updates in one batch, and confirm in a performance trace a single style and layout recalculation, followed by one paint, with focus and selection preserved on untouched nodes.",
    dep: ["accessibility-tree"]
  },
  "template-cloning": {
    s: "Builds repeated structure by parsing markup once into an inert template and copying it for each instance, which is faster than creating nodes one by one.",
    d: "The compiler emits the static structure as a markup string. At runtime, the framework parses it once into a template element, then each instance is made by cloning that template's content in a single native call. Dynamic spots are found by known paths from the root and then bound. For lists, cloning a prepared row for each item is far cheaper than creating each element and setting each attribute. The difficulty is correctness of the paths and of what the parser does with markup: some structures, such as table parts, are restricted by the parser rules.",
    k: ["Clone parsed templates vs. create nodes via calls: cloning is fastest for repeated structure, node creation has no parse step and suits one-off or highly dynamic structure.", "One template per component vs. shared templates: per-component is simple, sharing identical structures saves memory."],
    p: ["Markup that the parser fixes up, such as stray table content, produces a tree different from the one the compiler's paths assume.", "Templates cloned from content containing custom elements upgrade them at clone time, running their code earlier than expected."],
    v: "Render ten thousand identical rows, and confirm a profile shows a clone call per row and no per-element creation calls, with total creation time well below that of the node-by-node path on the same data.",
    dep: ["dom-mutation-api", "static-hoisting"]
  },
  "browser-event-system": {
    s: "The browser's model of events: capture and bubble phases, default actions, cancellation and the distinction between trusted user events and synthetic ones.",
    d: "An event travels from the window down to the target, capture phase, then back up, bubble phase, calling listeners along the way. Listeners may stop propagation or prevent the default action, such as following a link. Some events do not bubble, and passive listeners promise not to cancel scrolling. Frameworks sit on top of this, attaching listeners to nodes or at the root and sometimes presenting a normalized event. The difficulty is subtle ordering: framework handlers, native handlers and third-party libraries all share one path, and a stopped event may never reach someone who needed it.",
    k: ["Use native events directly vs. a normalized synthetic layer: native has no overhead and full capability, a synthetic layer smooths differences and can break expectations of code that reads native details.", "Passive listeners vs. cancellable: passive keeps scrolling smooth and gives up the ability to cancel; cancellable allows control and can delay scrolling."],
    p: ["A handler stops propagation and a document-level analytics or outside-click listener never sees the event.", "A non-passive touch listener on a large area delays scrolling on phones."],
    v: "Click a nested element with listeners in capture and bubble phases at three levels, and confirm the recorded call order is capture from outside in, then bubble from inside out, and stopping propagation at the middle prevents the outer bubble handler.",
    dep: []
  },
  "event-delegation": {
    s: "Attaches one listener at a common ancestor, or the root, and routes each event to the right handler by inspecting its target, instead of adding listeners to every element.",
    d: "Because most events bubble, a single root listener hears events from all descendants. The framework looks at the event target, walks up to find the component or node that registered a handler for that event type, and calls it with the right context. This reduces memory and setup time for large lists, and elements added later need no new listeners. It must reproduce propagation order and cancellation in its own walk. The difficulty is events that do not bubble, handlers that must run during capture, and shadow boundaries that retarget the event.",
    k: ["Delegate at the root vs. listen on each node: delegation saves memory and setup work and must emulate propagation; per-node listeners use native behavior and cost more for large lists.", "Delegation in the framework vs. by application code: in the framework it is uniform and hidden, in application code it is explicit and a pattern developers must remember."],
    p: ["A handler for an event that does not bubble never fires, since the root listener is never reached.", "Two framework copies on one page each install a root listener, and every event is handled twice."],
    v: "Render ten thousand buttons with handlers, and confirm the page has a handful of event listeners on the root, clicking any button runs its handler once, and buttons added later respond with no extra listener registration.",
    dep: ["browser-event-system", "props-and-events"]
  },
  "browser-scheduling-apis": {
    s: "Browser facilities for deciding when code runs: animation frame callbacks, idle callbacks, timers, microtasks and priority-aware task scheduling.",
    d: "Microtasks run right after the current script, before rendering. Animation frame callbacks run before each paint and suit visual updates. Timers run no sooner than their delay and are clamped in background tabs. Idle callbacks run when the browser has spare time, and a scheduling interface can post tasks with priorities and yield to input. Frameworks build their schedulers on these. The difficulty is that behavior varies: timers are throttled in hidden tabs, idle callbacks may never fire on a busy page, and microtask loops can starve rendering.",
    k: ["Microtask flush vs. frame-aligned: microtasks apply updates before paint, so users never see an intermediate state; frame-aligned batching coalesces repeated updates and waits.", "Platform priority-aware scheduling vs. own message-based loop: the platform integrates with input awareness and is not available everywhere; own loop works everywhere with less insight."],
    p: ["Work scheduled with a timer is throttled to once per second when the tab is hidden, and a background update lags.", "A promise chain that keeps queuing microtasks prevents the browser from painting."],
    v: "Schedule work through each mechanism and log the order and timing, and confirm microtasks run before the next frame, animation callbacks run once per frame, and timers in a hidden tab are throttled.",
    dep: []
  },
  "observers": {
    s: "Browser interfaces that report changes asynchronously: element size, visibility within the viewport, and DOM mutations, without polling or forced layout.",
    d: "A resize observer reports when an element's box changes, an intersection observer reports when it enters or leaves the viewport or another element, and a mutation observer reports changes to the tree. Callbacks are delivered in batches at defined points in the frame, so the framework can respond without measuring on its own. They underlie virtualization, lazy loading, infinite scroll, container-based layout and sticky behavior. The difficulty is delivery timing: callbacks occur after layout, so reacting by changing size can loop, and observers must be disconnected to avoid retaining nodes.",
    k: ["Observers vs. scroll and resize listeners with measurements: observers avoid forced layout and run only when needed, listeners are immediate and costly.", "One shared observer vs. one per element: one shared observer is more efficient for many elements, one per element is simpler to clean up."],
    p: ["A resize observer callback changes the observed element's size, producing a loop error.", "Observers that are never disconnected keep removed elements alive in memory."],
    v: "Observe one thousand elements for visibility while scrolling, and confirm callbacks fire only on crossing the viewport edge, no layout is forced by them in the trace, and disconnecting stops further callbacks.",
    dep: []
  },
  "shadow-dom": {
    s: "Platform features for encapsulation: shadow trees with their own scoped styles and markup, slots for projecting content, and custom elements for defining new tags.",
    d: "A custom element registers a tag with lifecycle callbacks the browser calls on creation, attribute change and removal. It may attach a shadow root, a separate tree whose styles do not leak out and whose internals are hidden from outside selectors. Slots let the host's children appear inside. Events crossing the boundary are retargeted to the host. Frameworks use it for isolation and to build portable components. The difficulty is the barriers: global styles, form participation, focus delegation and accessibility references by id do not cross the boundary without care.",
    k: ["Shadow encapsulation vs. conventions in ordinary DOM: shadow isolation is enforced and breaks global theming and id references; conventions are porous and compatible with everything.", "Open vs. closed shadow roots: open allows tools and tests to reach inside, closed hides internals and mostly frustrates tools."],
    p: ["A label in one tree referencing an input by id in another does not associate, breaking accessible naming.", "Global styles, such as a theme or a reset, do not reach inside the shadow tree and components render unstyled."],
    v: "Define a custom element with a shadow root and a slot, and confirm a global rule does not change its internals, slotted content appears in place, and a click inside reports the host as the event target at the document.",
    dep: ["dom-mutation-api", "browser-event-system"]
  },
  "history-api": {
    s: "The browser interface for adding, replacing and traversing session history entries and reading the current location without loading a new document.",
    d: "Script can push a new entry with a URL and an associated state object, replace the current entry, and move back and forward. Traversal fires an event with the saved state. The document is not reloaded, so the application must render the matching screen itself. Scroll restoration can be handled by the browser or by script. The difficulty is the edges: pushes are limited to same-origin URLs, state objects have size and type limits, and entries may be restored from the browser's page cache with scripts in a frozen state.",
    k: ["Browser-managed scroll restoration vs. manual: browser-managed is automatic and fails when content loads later; manual is precise and adds code.", "State in the history entry vs. in the URL: entry state is private and survives back and forward but not sharing; URL state is shareable and visible."],
    p: ["A page restored from the back-forward cache continues with stale data because no load event fired.", "Pushing a cross-origin URL throws an error that appears only for unusual links."],
    v: "Push three entries with distinct state, go back twice and forward once, and confirm each traversal event delivers the state saved with that entry and the location bar matches.",
    dep: []
  },
  "accessibility-tree": {
    s: "The parallel structure the browser builds from the DOM, with roles, names, states and relationships, which assistive technology reads to present and operate the page.",
    d: "The browser computes an accessibility object for each relevant node: native elements give roles for free, and attributes add or override roles, names, descriptions and states. Assistive tools navigate by landmarks, headings and controls, and act on them through the platform's accessibility interface. Everything the framework does to the DOM changes this tree: replacing a node can drop focus, hiding content with styles removes it, and live regions announce changes. It is hard to test automatically, since tools only detect a fraction of problems.",
    k: ["Native elements first vs. custom elements with roles: native elements bring behavior and semantics free; custom widgets give design control and must reimplement keyboard handling and states.", "Automated checks vs. manual testing with assistive technology: automated checks catch missing names and contrast cheaply but cannot judge whether the experience makes sense."],
    p: ["A clickable div has no role or keyboard handling, so it is invisible and unreachable to assistive technology.", "Updating content in place with no live region means screen reader users never hear that anything changed."],
    v: "Inspect the page's accessibility tree and confirm each control has a role and a name, tab through every interactive element in a logical order, and navigate it with a screen reader, hearing the same labels and states.",
    dep: ["dom-mutation-api"]
  },
  "where-code-runs": {
    s: "The decision about which work happens at build time, on a server, at an edge location or in the browser, which shapes every other trade-off in the framework.",
    d: "Each piece of rendering and data work can run when the site is built, per request on a server, close to the user at the edge, or in the browser. Earlier is cheaper and faster for users and fresher later. Later is more dynamic and personalized and costs device time. Server rendering, static generation, server components, resumability and client-only rendering are different answers. The choice sets what can be shared between environments, where secrets may live and what happens when scripts fail, and is hard to change after code is written.",
    k: ["Build-time vs. request-time vs. client rendering: earlier means faster and cheaper but staler and less personal; later means fresh and custom, with more device work and later content.", "One mixed model per route vs. one model per application: per route fits each page's needs but multiplies what developers must understand."],
    p: ["Code assumes the browser exists, and breaks when it first runs on a server.", "Per-user content is generated at build time and shown to everyone."],
    v: "For one page, list each data dependency with where it runs, then load it with scripts disabled and on a throttled device and confirm the content shown matches that plan, with no secret reaching the browser.",
    dep: []
  },
  "update-cost-budgets": {
    s: "Explicit limits on what an update may cost in time, memory and bytes, so that design choices in the framework and in applications are judged against the frame and the user's device.",
    d: "An interface has about sixteen milliseconds per frame, less after the browser's own work, and a first-load budget set by the slowest supported device and network. Every layer spends part of it: diffing, effects, layout, hydration, script parsing. Budgets are set for typical and worst-case devices, and measured in the field as well as in the lab. They decide whether to virtualize a list, split a bundle or defer an update. They are hard to hold because costs are added by many small decisions, none of which looks expensive alone.",
    k: ["Budget on fast development hardware vs. a reference slow device: development hardware is convenient and misleads; a reference device is honest and slows iteration.", "Lab measurement vs. field data: lab runs are repeatable and miss real-world variety; field data is real, noisy and arrives late."],
    p: ["All testing happens on a fast laptop, and the page that feels instant there is unusable on a mid-range phone.", "Each feature adds a few milliseconds and kilobytes, and no one owns the total."],
    v: "Record a trace of the main interaction on the reference low-end device throttled profile, and confirm every frame during it stays within the frame budget and the load stays within the byte and time limits written for the route.",
    dep: []
  },
  "accessibility-by-default": {
    s: "The decision to make accessible behavior the outcome of normal use of the framework's components and defaults, not a separate task added at the end.",
    d: "It shapes the design of every layer: templates warn about missing labels, the router manages focus and announces page changes, components follow established keyboard patterns, the renderer preserves focus when updating nodes and animations respect user preferences. It starts from native elements and standards for roles and names. It is hard because the framework's re-rendering and abstraction can break what the platform provides for free, and because correctness depends on real use with assistive technology, not only on automated rules.",
    k: ["Accessible by default vs. documented patterns: defaults make the right result automatic and constrain design; documented patterns give freedom and depend on every developer applying them.", "Linting at build time vs. runtime checks: build-time linting catches static mistakes early and misses dynamic ones; runtime checks see real state and run only when exercised."],
    p: ["A component library looks accessible but loses focus after every update, which no automated check detects.", "Custom controls replace native ones to match a design, and keyboard and screen reader support is dropped."],
    v: "Complete the main task using only a keyboard and then a screen reader, with no mouse and no sight of the screen, and confirm each step is reachable, labeled and announced, and focus is never lost.",
    dep: ["accessibility-primitives", "accessibility-tree", "scroll-focus-restoration"]
  },
  "internationalization": {
    s: "The decision to support many languages, scripts and regional formats from the start, in text, layout, input, formatting and routing.",
    d: "Text lives in message catalogs with placeholders and plural rules, loaded per locale and split from the main code. Numbers, dates and currencies use locale-aware formatting. Layout supports right-to-left scripts by using logical properties, and fonts and line breaking vary by script. Input methods and composition must work, and URLs may carry the locale. Server and browser must agree on locale to hydrate identically. It is hard because assumptions about text length, order, case and sorting are spread through the code and appear only when a new language is added.",
    k: ["Catalogs loaded per locale vs. all bundled: per-locale loading keeps bundles small and adds a loading step; bundling everything is simple and large.", "Logical layout properties from the start vs. retrofitting right-to-left: logical properties cost little early and avoid a rewrite; retrofitting touches every style."],
    p: ["Strings built by concatenating pieces cannot be reordered or pluralized in other languages.", "Fixed-width buttons clip text that is much longer in another language."],
    v: "Switch the interface to a right-to-left language with long strings and plural forms, and confirm layout mirrors, no text is clipped, plurals follow the language's rules and dates and numbers use local formats.",
    dep: ["ime-text-input", "responsive-layout", "code-splitting"]
  },
  "injection-safety": {
    s: "The decision to treat all text as data by default, so untrusted content cannot become markup, script or style, and the dangerous exceptions are explicit and rare.",
    d: "The renderer sets text through text nodes and properties, so markup in a value is shown, not parsed. Server output escapes values for the context they land in: text, attribute, URL or script. Escape hatches that insert raw markup are named so reviewers notice them, and sanitization is applied to anything that must be allowed. Links with script-bearing schemes are rejected. Content security policy provides a second layer. The difficulty is context: a value safe in text is unsafe in an attribute or URL, and third-party code can bypass the framework entirely.",
    k: ["Escape by default vs. trust developers to escape: default escaping stops the common case automatically; manual escaping fails once, somewhere.", "Sanitize on input vs. on output: output sanitization fits the context where data is used; input sanitization cannot know every future use."],
    p: ["A raw-markup escape hatch is used with user text, creating script injection.", "A user-supplied link beginning with a script scheme is placed in a link target and runs when clicked."],
    v: "Submit content containing script tags, event attributes and a script-scheme link through every field that is displayed, and confirm each is shown as inert text or rejected, with no script executing and the content security policy reporting no violations.",
    dep: ["binding-system", "server-renderer", "form-submission"]
  },
  "api-stability": {
    s: "The decision about how the framework changes over time: what is promised to stay stable, how deprecations are announced and how applications upgrade without a rewrite.",
    d: "A framework has many consumers, so its public surface, such as component contracts, hooks, template syntax, build plugins and rendering behavior, is a promise. Changes ship behind flags, with warnings in development, automated code changes for migration and long overlap between old and new. Internals are kept private so they can change. Each of the plate's layers has contracts that others depend on: the compiler's output is read by the runtime, and a bundler plugin by many tools. It is hard because even a bug fix changes behavior someone relies on.",
    k: ["Frequent small breaking changes vs. rare large ones: frequent changes are easier to absorb and keep the framework current; rare large ones allow planning and strand users on old versions.", "Automated migration tools vs. documentation only: tools lower the cost of upgrading and are expensive to build and keep correct; documentation scales poorly."],
    p: ["Applications rely on undocumented internal behavior, and a minor release breaks them.", "A deprecation warning is shown without a replacement, and teams ignore it until removal."],
    v: "Upgrade a sample application across a major version using the published migration tool, and confirm it builds, passes its end-to-end tests with no edits beyond the tool's, and that deprecated usage produced warnings naming the replacement in the prior release.",
    dep: ["devtime-warnings", "build-plugins", "component-packaging"]
  }
});
