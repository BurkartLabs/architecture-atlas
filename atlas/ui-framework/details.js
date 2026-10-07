// Details for the client-side UI framework plate, part 1: dev tools, compiler and build, components.
ATLAS.details("ui-framework", {
  "component-inspector": {
    s: "A browser panel that shows the live tree of components with their props, state and the DOM nodes they own, and lets a developer edit values and watch the screen change.",
    d: "The framework exposes a hook that the panel connects to, reporting each mounted component, its inputs and its internal state. Selecting a node highlights the matching element, and editing a value calls the same update path application code uses. The panel must map between two trees: the component tree and the DOM tree, which differ because components can render nothing or many nodes. Reporting costs time and memory, so the hook is inert until a panel attaches, and it must never change application behavior.",
    k: ["Hook inside the framework vs. reading the DOM from outside: the hook sees props and state, but couples the tool to framework internals and versions.", "Always-on instrumentation vs. attach-on-demand: always-on makes the tool instant but taxes every production user; attach-on-demand keeps production clean but misses early mounts."],
    p: ["Instrumentation retains references to unmounted components, so opening the panel causes a memory leak that disappears when it is closed.", "Editing state in the panel produces a state no code path could create, and the resulting crash is reported as an application bug."],
    v: "Open a page with a nested component, select it in the panel, change a prop value and confirm the rendered text updates and the panel's highlighted element matches the one the component owns.",
    dep: ["component-model", "dom-mutation-api"]
  },
  "state-time-travel": {
    s: "Records every state change with its cause and lets a developer step backward and forward through them, replaying the interface as it was at each point.",
    d: "State changes are routed through a log, either because the store records each action or because a tool wraps the update function. Stepping back restores a stored snapshot or replays the log from the start, then the framework re-renders from it. It works well when state is plain data and updates are pure. It breaks down when state holds handles, timers or server connections, because restoring the value does not restore the world it described, and replayed actions may repeat network side effects.",
    k: ["Action log replay vs. full snapshots: logs are small and show causes, but replay requires pure update logic; snapshots are exact but cost memory.", "Recording by default vs. opt-in: default recording gives bug reports for free, but retained history leaks sensitive data and memory."],
    p: ["Replaying an action that triggers a request re-sends it to the server, duplicating a real side effect.", "Snapshots hold large objects by reference, so history keeps the entire dataset alive and the page slows over a long session."],
    v: "Perform five actions, step back three, and confirm the screen and the displayed state match what they were after the second action; step forward and confirm the original final screen returns.",
    dep: ["global-store", "immutable-updates"]
  },
  "render-profiler": {
    s: "Measures which components rendered, how long each took and what caused it, so developers can find updates that are slower or more frequent than they should be.",
    d: "The runtime stamps each render with a start and end time and records the reason: new props, changed state, changed context or a parent re-rendering. A recording session aggregates these into a flame-style view per commit. It can also mark the commit phase, where DOM changes are applied, separately from render, where views are described. The difficulty is that development builds are slower than production and distort the numbers, and one slow commit often reflects work in the browser's layout rather than in the framework.",
    k: ["Development build with full detail vs. production build with timing only: development explains why, production tells the truth about how long.", "Component-level timing vs. whole-frame timing: component timing points to code, but frame timing is what the user feels."],
    p: ["Profiling a development build leads to optimizing code that is irrelevant in production.", "A component shown as fast hides the cost of the layout and paint it caused, which occur after the profiler stops timing."],
    v: "Record a click that updates one counter in a large list, and confirm the profile names the single component that re-rendered and why, with unrelated siblings absent from the commit.",
    dep: ["task-scheduler", "memoization-boundaries"]
  },
  "hot-module-replacement": {
    s: "Swaps an edited module into the running page without a reload, keeping component state so developers see the change instantly.",
    d: "A dev server watches files, recompiles the changed module and pushes it to the page over a socket. The runtime replaces the old module's exports, then asks the framework to re-render affected components. To keep state, the framework must recognize that the new component is the same one as the old, usually by a stable identity assigned at compile time, and re-run its template while preserving instances. Edits that change the shape of state, or modules with import-time side effects, cannot be swapped safely and trigger a full reload.",
    k: ["Preserve state across edits vs. always remount: preserving state keeps the developer in context but can leave stale state that production would never reach.", "Module-level replacement vs. full reload: replacement is fast, but modules that run side effects on import can double-register listeners."],
    p: ["Listeners and timers registered by the old module are not cleaned up, so after twenty edits each click fires twenty handlers.", "A bug appears only after a hot update and vanishes on reload, wasting time on a state production can never reach."],
    v: "Edit a component's text while it holds typed input, and confirm the new text appears within a second with the typed input still present and no full page load in the network log.",
    dep: ["module-bundler", "component-model", "source-maps"]
  },
  "devtime-warnings": {
    s: "Extra checks that run only in development builds and report misuse, such as missing keys, invalid props, state updates during render and mismatched server and browser output.",
    d: "The framework includes branches guarded by a build-time constant. In development they validate inputs, track which phase is running and compare expected structures. In production the bundler removes them entirely. Good warnings name the component, explain the cause and link to a fix. The challenge is precision: a warning that fires on correct code is ignored, and a check that cannot see the real cause, such as a hydration mismatch deep in a tree, can point to the wrong place.",
    k: ["Warn and continue vs. throw: continuing keeps the page usable but lets warnings pile up unread; throwing forces a fix but breaks flows that were nearly right.", "Warnings in the framework vs. in a separate linter: in-framework checks see real runtime values, a linter catches issues before running but only sees source."],
    p: ["A warning that fires on every render floods the console until developers filter all warnings, including real ones.", "Checks left in a production bundle through a wrong build constant slow every user and expose internal messages."],
    v: "Render a list without keys in a development build and confirm a warning names the component; build for production and confirm the warning code is absent from the output and the page still works.",
    dep: ["tree-shaking", "reconciliation-keys"]
  },
  "component-tests": {
    s: "Tests that mount a single component in a simulated or real browser document, interact with it as a user would and assert on what is rendered.",
    d: "A test harness renders the component into a detached document, fires events through the same paths a browser would and waits for updates to settle before asserting. Queries find elements by accessible role and text rather than internal structure, so tests survive refactors. The harness must control the scheduler, timers and network, because updates are asynchronous. The hard part is fidelity: a simulated document lacks layout, so tests cannot see overlap, scroll position or anything that depends on real measurement.",
    k: ["Simulated document vs. real browser: simulation is fast and runs anywhere, but has no layout, so visibility and positioning claims go untested.", "Query by role and text vs. by test identifier: role queries test accessibility along the way, identifiers are stable but verify nothing about what users perceive."],
    p: ["Asserting before an asynchronous update completes yields tests that pass or fail by timing alone.", "Tests that reach into component state pass while the rendered output is wrong."],
    v: "Mount a form component, type invalid text, click submit, and confirm the test finds the error message by its accessible role; mutate the component to drop the message and confirm the test fails.",
    dep: ["component-model", "task-scheduler", "browser-event-system"]
  },
  "e2e-browser-tests": {
    s: "Tests that drive a real browser through whole user journeys against a running build, checking what the user sees across pages, network and storage.",
    d: "A runner launches one or more real browser engines, loads the application, performs clicks and typing through browser automation, and asserts on the document, URL and network traffic. It exercises routing, data loading, server rendering and hydration together, which component tests cannot. Tests wait on observable conditions rather than fixed delays. Cost and flakiness are the main difficulty: each test needs a controlled backend and clean data, and a single timing assumption can fail one run in fifty.",
    k: ["Real backend vs. recorded responses: a real backend finds integration bugs but is slow and stateful; recordings are fast and repeatable but drift from reality.", "Many end-to-end tests vs. few: broad coverage catches more regressions, but each test costs minutes and a share of the maintenance budget."],
    p: ["Fixed sleeps make tests slow on a fast machine and flaky on a slow one.", "Tests share data, so one failure leaves records that fail every later test in the run."],
    v: "Run the sign-in journey against a production build in two browser engines, and confirm each lands on the account page with the user's name visible and no console errors recorded.",
    dep: ["route-matching", "hydration", "fetch-layer"]
  },
  "visual-regression": {
    s: "Captures screenshots of components or pages and compares them with approved baselines, flagging pixel differences that behavior tests cannot see.",
    d: "Each story or page is rendered in a fixed browser, viewport and font set, then screenshotted. The image is compared to the stored baseline with a tolerance, and differences are shown for a person to accept or reject. It finds spacing, color and overlap regressions caused by a style change far from the component. It is hard to keep stable: font rendering differs across machines, animations and dates change between runs, and a single global style change can fail hundreds of images at once.",
    k: ["Pixel comparison vs. perceptual comparison: pixel diffs are exact but noisy; perceptual tolerance reduces noise but can hide a one-pixel misalignment that matters.", "Component-level shots vs. full-page shots: component shots isolate the cause, full-page shots catch interactions between components."],
    p: ["Baselines produced on different machines differ by font smoothing, so every run reports changes nobody made.", "Reviewers approve large batches of diffs without looking, and a real regression is accepted into the baseline."],
    v: "Change a shared spacing token by two pixels and confirm the run flags every affected component with a highlighted diff, while a rerun with no change reports zero differences.",
    dep: ["design-tokens", "scoped-styles", "component-tests"]
  },
  "template-compiler": {
    s: "Translates declarative templates into optimized update code ahead of time, so the runtime does not parse templates or discover structure while the page runs.",
    d: "The compiler parses the template, builds a syntax tree, analyzes which parts are static and which depend on state, and emits code that creates nodes and updates only the dynamic parts. It checks directives, expressions and component references and reports errors with source positions. Because it sees the whole template, it can decide things a runtime cannot, such as which bindings never change. The difficulty is that every template feature must be understood statically, so dynamic features are either restricted or fall back to slower generic code.",
    k: ["Compile at build time vs. in the browser: build-time output is smaller and faster, but dynamic templates from a server need the compiler shipped to the browser.", "Rich template syntax vs. plain functions: templates are analyzable and optimizable, but add a second language to learn and debug."],
    p: ["An expression the compiler cannot analyze silently falls back to the slow path, and nobody notices until profiling.", "Error messages that cite generated code rather than the template send developers searching the wrong file."],
    v: "Compile a template with one dynamic text binding and confirm the output contains code that updates exactly that text node, with the surrounding static markup created once and never touched again.",
    dep: ["static-hoisting", "view-description", "source-maps"]
  },
  "markup-syntax-transform": {
    s: "Rewrites markup embedded directly in source code into plain function calls or node-creation code, so views can be written next to the logic that drives them.",
    d: "A parser reads the mixed language, recognizes markup literals inside expressions, and replaces each with calls that build view descriptions or DOM operations. Attribute names are mapped to property names, text is escaped, and children are flattened into arguments. The transform runs in the build or in an editor service. It is hard because markup nests arbitrary expressions that nest more markup, whitespace has rules that surprise people, and tools such as formatters and type checkers must understand the same extension.",
    k: ["Markup inside code vs. separate template files: embedding keeps logic and view together with full language power, while separate files are easier for designers and easier to analyze.", "Transform to generic calls vs. direct DOM code: generic calls feed a diffing runtime, direct code is faster but removes the runtime's ability to compare."],
    p: ["Whitespace between inline elements is collapsed in ways that differ from HTML, producing missing spaces nobody sees in review.", "A mismatch between the transform's output and the runtime's expected call shape breaks every component after a version bump."],
    v: "Compile a component with nested markup and an inline expression, and confirm the output has no markup left, the expression appears as an argument, and the rendered DOM matches the source structure.",
    dep: ["view-description", "build-plugins"]
  },
  "static-hoisting": {
    s: "Finds the parts of a view that never change and creates them once, outside the update path, so each update touches only what depends on state.",
    d: "During compilation, the analyzer marks nodes, attributes and subtrees with no dynamic inputs. Static subtrees are lifted out of the render function and reused, or serialized into a template string that the browser clones in one call. Dynamic bindings are tagged with the exact kind of change they can have, such as text only or class only, so updates skip checks. It is hard because correctness depends on proving something is constant: a value that looks static but is mutated elsewhere would render stale output.",
    k: ["Aggressive hoisting vs. conservative: aggressive hoisting skips more work, but a wrong analysis shows stale output; conservative is always correct but leaves cost on the table.", "Flagging dynamic parts at compile time vs. diffing at runtime: flags avoid comparisons entirely, but require the compiler and runtime to agree on a format."],
    p: ["Hoisting a subtree that contains an element later mutated by third-party code makes the mutation persist across renders unexpectedly.", "Hand-written render functions bypass the optimization, so a hand-optimized path is slower than a template."],
    v: "Compile a view with one hundred static rows and one counter, run one hundred updates, and confirm in a profile that the static nodes are created once and the counter is the only node touched per update.",
    dep: ["template-compiler", "template-cloning"]
  },
  "template-type-checking": {
    s: "Checks the types of expressions in templates and component props at build time, so a misspelled prop or wrong value type is an error in the editor, not a blank screen.",
    d: "The checker maps template code to a typed representation, then verifies that each prop passed to a component matches that component's declared inputs, that events carry the right payload and that variables in scope exist. Editors surface errors inline. It must understand the framework's own rules, such as how slots or context are typed, which a general type checker does not know. The trouble is generated code: errors point to positions in code the developer never wrote, and generic components make inference slow.",
    k: ["Strict checking of every template vs. opt-in: strict checking catches the most mistakes but slows adoption on existing code; opt-in is gradual but leaves unchecked islands.", "Checking templates in the editor vs. only in the build: editor checks are immediate but add load to the editor process."],
    p: ["Types describe what the author intended, not what a server returns, so a response that differs from its declared shape passes the checker and fails at runtime.", "Slow inference on a large generic component makes the editor lag until developers disable the checks."],
    v: "Pass a string to a numeric prop of a component and confirm the build fails with an error naming the component, the prop and the expected type, positioned at the template line.",
    dep: ["template-compiler", "props-and-events"]
  },
  "module-bundler": {
    s: "Follows imports from entry points, combines modules into a small number of files and rewrites references so the browser loads the application with fewer requests.",
    d: "The bundler builds a graph of modules from entry points, resolves each import to a file, transforms each module through plugins and then groups modules into chunks. It rewrites imports to internal references, deduplicates shared modules and emits a manifest mapping names to files. It handles non-code assets such as styles and images as modules too. The difficulty is the trade between few large files and many small ones, plus keeping builds fast on large codebases through caching and incremental work.",
    k: ["Bundle everything vs. serve native modules in development: bundling matches production behavior but rebuilds slowly; native modules start instantly but differ from what ships.", "Few large chunks vs. many small chunks: few chunks reduce requests, many chunks improve caching and let unchanged code stay cached across releases."],
    p: ["A duplicated dependency ends up in two chunks at different versions, doubling its size and splitting its internal state.", "Import-order dependent code behaves differently once modules are reordered by the bundler."],
    v: "Build the app and confirm the output contains the entry chunk plus split chunks, that a manifest lists each, and that loading the page issues exactly those requests with no unresolved import errors.",
    dep: ["build-plugins", "tree-shaking", "code-splitting"]
  },
  "tree-shaking": {
    s: "Removes exports that nothing imports, so a library's unused features do not add to the bundle that users download.",
    d: "Static import and export declarations let the bundler know exactly which names each module uses. After building the graph it marks live exports, then removes unreferenced code in minification. It only works when modules are free of side effects at load time, so libraries declare whether importing them does anything. The hard part is proving a function call has no effect: an unmarked call at the top level of a module, such as registering something, forces the bundler to keep it and everything it references.",
    k: ["Rely on static analysis vs. manual entry points: analysis is automatic but fragile to side effects; per-feature entry points are reliable but burden library users.", "Declaring modules side-effect free vs. letting the bundler prove it: the declaration shrinks output but is wrong whenever a module quietly registers something."],
    p: ["One top-level call in a library keeps the whole library in every bundle that imports it.", "A module wrongly marked side-effect free loses its registration and fails only in production."],
    v: "Import one small function from a large library, build, and confirm the output size increase matches that function rather than the library, and that the bundle report lists no other exports from it.",
    dep: ["module-bundler", "minification"]
  },
  "minification": {
    s: "Shortens names, removes whitespace and dead branches, and applies compression so the files sent to the browser are as small as they can be.",
    d: "A minifier parses the code, renames local variables, folds constants, removes unreachable branches such as development-only checks, and prints compact output. Build constants substituted earlier, for example a production flag, let it delete entire blocks. The result is then compressed on the server or at build time with a general-purpose algorithm negotiated through HTTP headers. It is hard because renaming must preserve any name the program or framework looks up by string, and smaller output costs build time.",
    k: ["Aggressive property renaming vs. keeping property names: renaming saves bytes but breaks code that accesses properties by string, such as serialization.", "Compressing at build time vs. at request time: precompressed files use the strongest setting for free, request-time compression is simpler but weaker."],
    p: ["Component names mangled in production make error reports and inspectors unreadable unless source maps are retained.", "A framework that reads function names at runtime breaks silently after renaming."],
    v: "Build with and without minification, and confirm the minified file is substantially smaller, contains no development-only warning strings, and passes the same end-to-end journey as the unminified build.",
    dep: ["module-bundler", "source-maps"]
  },
  "source-maps": {
    s: "Files that map positions in generated code back to the original source, so errors, breakpoints and profiles refer to what developers wrote.",
    d: "As each transform runs, it records a mapping from output positions to input positions and names, and the bundler composes these chains into one file. Browser debugging tools fetch it and show original files, set breakpoints in them and translate stack traces. Error reporting services use the same files to unminify production traces. The difficulty is composing many transforms accurately, since one transform that drops mappings breaks the chain, and the files are large and reveal source if served to everyone.",
    k: ["Publish maps publicly vs. upload privately to an error service: public maps help everyone debug but expose source; private upload protects code but needs deployment tooling.", "Inline maps vs. separate files: inline is simple for development, separate files keep production downloads small."],
    p: ["A transform in the chain that emits no mappings makes breakpoints land on the wrong line, wasting hours.", "Maps deployed out of step with the bundle point production traces at lines from a different version."],
    v: "Throw an error from a known line of a source file in a production build, and confirm the error report shows the original file name and that line, not a position in the minified file.",
    dep: ["build-plugins"]
  },
  "build-plugins": {
    s: "A defined extension interface that lets tools hook into resolving, loading and transforming modules and into emitting output, so formats and features can be added without changing the bundler.",
    d: "The build tool exposes hooks for stages of its pipeline: resolve an import path, load a file's content, transform source, generate chunks and write output. Plugins run in order and may share state through the build context. The framework ships its own plugin to compile templates, and applications add others for images, styles or environment values. The challenge is ordering and caching: plugins that depend on the order of others fail confusingly, and a plugin that is not deterministic breaks incremental builds.",
    k: ["Small hook set vs. many hooks: a small set is easy to keep stable, many hooks permit deep integration but freeze internals.", "Plugins sharing one pipeline vs. isolated stages: sharing makes cooperation easy but lets one slow plugin slow every file."],
    p: ["Two plugins both claim to handle the same file type, and which wins depends on the order in the configuration.", "A plugin with hidden state returns different output on a cached rebuild, producing a bug only on the second build."],
    v: "Add a plugin that transforms one file type, build twice with no changes, and confirm both builds produce byte-identical output and the second build skips running that plugin on unchanged files.",
    dep: []
  },
  "component-model": {
    s: "The definition of what a component is: a unit with inputs, optional state and an output description of interface, plus the rules for creating, updating and destroying it.",
    d: "A component is declared as a function, class or template file. The framework creates an instance when it first appears in a view, passes it inputs, calls it to produce output and keeps its state between updates. When a parent no longer includes it, the framework destroys it and releases its resources. Identity is decided by position and type, or by a key. The difficulty is the contract: whether a component function runs once or on every update shapes how state, effects and optimizations are written, and every other feature inherits that choice.",
    k: ["Function that re-runs on every update vs. function that runs once: re-running is simple to reason about but needs rules for state and memoization; running once is efficient but requires explicit reactive reads.", "Classes with methods vs. plain functions: classes give structured lifecycle, functions compose logic with less ceremony."],
    p: ["Treating a component as running once when it re-runs, or the reverse, causes stale values or repeated work.", "Defining a component inside another component creates a new type each update, so the framework remounts it and loses state."],
    v: "Mount a component with a counter, update the parent ten times and confirm the child kept its counter value and its mount hook fired once, not ten times.",
    dep: ["view-description", "local-state", "lifecycle-hooks"]
  },
  "props-and-events": {
    s: "The interface a component presents: values flowing in from its parent as inputs, and notifications flowing back out as events or callbacks.",
    d: "Props are passed down as named values and treated as read-only by the receiving component. Changes to them trigger an update. Output flows up the other way, by callback props or emitted events, so that state stays owned by one component and children ask for changes instead of making them. Defaults, validation and types describe the contract. The hard part is the cost of comparing props, which decides whether a child updates, and the temptation to pass large changing objects that defeat every optimization.",
    k: ["Callbacks as props vs. emitted events: callbacks are plain values that compose and type well; events decouple the child but add a named-channel layer.", "Props read-only vs. two-way binding: one-way flow keeps changes traceable, two-way binding shortens form code at the cost of hidden writes."],
    p: ["A new inline function or object passed each render defeats memoization and makes the child update every time.", "A child mutating a received object changes the parent's data and the interface disagrees with itself."],
    v: "Pass a callback prop, trigger it from the child, and confirm the parent state updates; then pass identical props again and confirm a memoized child does not re-render.",
    dep: ["component-model", "memoization-boundaries"]
  },
  "slots-and-children": {
    s: "Lets a parent pass pieces of view into a component to be placed in specific positions, so containers can be built without knowing their contents.",
    d: "A component receives children as a value it places where it likes, or declares named slots that parents fill. Slot content is created in the parent's scope, so it can use the parent's data, while the child decides where and whether to show it. Scoped slots go further, calling back into the parent's content with values from the child. The difficulty is that content passed in is evaluated and updated by someone other than the component that displays it, which complicates ownership, ordering of effects and optimization.",
    k: ["Children as a plain value vs. named slots: plain children are the simplest and compose with ordinary code; named slots make multi-region layouts declarative and checkable.", "Render callbacks vs. scoped slots: callbacks are just functions anywhere; scoped slots read more clearly in templates but need syntax support."],
    p: ["Slot content that is rebuilt each update causes the child to update even when nothing it uses changed.", "A container that inspects its children for their type breaks when someone wraps one in another component."],
    v: "Build a card component with header and body slots, fill them from a parent, and confirm each appears in the right place and that changing parent data updates the slot content without remounting the card.",
    dep: ["component-model", "view-description"]
  },
  "context-injection": {
    s: "Makes a value available to every component below a point in the tree without passing it through each intermediate layer.",
    d: "A provider component places a value, and any descendant reads the nearest one by key. The framework keeps a stack of providers during rendering and tracks which components read each, so a change to the value updates only those readers. Common uses are themes, the current user, routing state and dependency injection of services. The cost is hidden coupling: a component that reads context cannot be understood from its props alone, and a value that changes often updates every reader.",
    k: ["Context for shared values vs. explicit props: context removes wiring through layers, but hides what a component depends on and makes it harder to reuse or test.", "One context for many values vs. one per concern: a single context is simple but updates all readers when any field changes; per-concern contexts limit updates but multiply providers."],
    p: ["Putting a frequently changing value in one context re-renders every consumer on each change.", "A component reads context in a test with no provider and silently gets a default that hides the bug."],
    v: "Provide a theme value at the root, read it in a component five levels down, change it, and confirm only the components that read the context update, while intermediate components do not render.",
    dep: ["component-model", "dependency-tracking"]
  },
  "reusable-logic": {
    s: "Mechanisms for sharing stateful behavior, such as subscriptions, timers or form logic, across components without sharing their markup.",
    d: "The framework gives a way to package state, derived values and side effects into a function that any component can call: hooks that run inside a component's render, composable functions that create reactive values once, or mixins and higher-order components in older designs. The shared logic owns its own cleanup, which the framework runs when the component goes away. The difficulty is hidden rules: functions that must be called in a fixed order, or inside a component only, and logic that captures stale values when the inputs change.",
    k: ["Call-order based hooks vs. reactive composables: hooks work with re-running functions but demand fixed call order; composables work with run-once components and track dependencies automatically.", "Reuse by functions vs. by wrapper components: functions leave the tree unchanged; wrappers add nesting and obscure props."],
    p: ["A conditional call to a hook breaks the order and assigns one state slot's value to another.", "Shared logic that captures an input at creation keeps using the first value after the input changes."],
    v: "Write a logic function that tracks window width, use it in two components, resize the window and confirm both update, then unmount one and confirm the resize listener count drops by one.",
    dep: ["local-state", "effects", "component-model"]
  },
  "refs-and-handles": {
    s: "Escape hatches that give code direct access to a DOM node or a child component's methods when the declarative model cannot express what is needed.",
    d: "A ref is a container the framework fills with a node or instance after mount and clears on unmount. Code uses it for focus, measurement, playing media, or integrating a library that wants an element. A component can expose a limited set of methods to its parent through a handle instead of exposing its internals. The risk is that imperative changes happen outside the framework's knowledge, so a node the library edits can be overwritten or removed by the next update, and the ref is empty before mount.",
    k: ["Direct node access vs. declarative props: direct access can do anything the platform allows, but bypasses the update model; props are safe but cannot express focus or measurement.", "Exposing methods vs. exposing nothing: methods allow commands such as scroll or reset, but couple the parent to child internals."],
    p: ["Reading a ref during render returns empty on the first render and a stale node later.", "A third-party library changing children of a framework-managed element leaves the framework's view of the tree wrong and crashes on the next update."],
    v: "Attach a ref to an input, call focus on mount, and confirm the document's active element is that input after load; unmount the component and confirm the ref is cleared.",
    dep: ["component-model", "lifecycle-hooks", "dom-mutation-api"]
  },
  "portals": {
    s: "Renders a component's output into a different place in the document, such as the end of the body, while keeping it in the component tree for state, context and events.",
    d: "Modals, menus and tooltips must escape ancestors that clip or stack them with overflow or transform styles, so the framework mounts their DOM at another location while the logical parent stays the same. Context still flows through, and events from the portal bubble to the logical parent in the component tree even though the DOM path differs. Focus and accessibility need care because the DOM order no longer matches the visual or logical order, and outside-click detection must account for two separate subtrees.",
    k: ["Portal to the body vs. position in place: a portal avoids clipping and stacking trouble, but breaks natural DOM order and needs manual focus management.", "Framework-level event bubbling through the component tree vs. DOM bubbling: component bubbling matches how the code is written, but can surprise code that listens at the DOM level."],
    p: ["A modal portaled to the end of the page is unreachable by keyboard because focus never moves into it.", "Click-outside logic treats a click inside the portal as outside the parent and closes the menu being used."],
    v: "Open a modal rendered through a portal inside an element with hidden overflow, and confirm it displays unclipped, receives focus, returns focus on close and still reads the parent's context value.",
    dep: ["context-injection", "host-renderer", "accessibility-primitives"]
  },
  "custom-element-interop": {
    s: "Lets framework components be used as, and use, standard custom elements, so interface pieces can be shared across applications and frameworks.",
    d: "A component can be wrapped as a custom element that the browser creates and upgrades itself, with props mapped to properties and attributes and events dispatched as DOM events. In the other direction, the framework must set properties rather than attributes on elements it does not know and listen for events by name. Slots map to the platform's slot mechanism. The difficulty is a mismatch of models: attributes are strings while props are any value, and the platform has no concept of the framework's context or update batching.",
    k: ["Wrap each component as a custom element vs. share source: elements work in any host, but lose context and add string-typed boundaries; sharing source keeps full features but ties users to one framework.", "Set properties vs. attributes on foreign elements: properties pass real values but only work once the element is defined; attributes work earlier but only carry strings."],
    p: ["A framework passes an object as an attribute, and the element receives the text object Object.", "Custom elements upgrade after the framework sets values, so early property writes are lost."],
    v: "Use a custom element inside a framework view and pass an array property and a click event, and confirm the element receives the array itself and the handler fires with the event's detail.",
    dep: ["shadow-dom", "props-and-events", "binding-system"]
  },
  "component-packaging": {
    s: "How a set of components is built and published for others to consume: module formats, type declarations, style handling and what the consumer's bundler must do with them.",
    d: "A library ships compiled modules in formats that both bundlers and browsers understand, type declarations for editors, and its styles in a form that does not require the consumer to configure a plugin. It declares the framework as a peer dependency so one copy is shared. Components that need the compiler are either precompiled or ship source with instructions. The hard part is compatibility: two copies of the framework in one page break shared state, and styles that depend on the author's build do not travel.",
    k: ["Precompiled output vs. shipping source: precompiled works anywhere but is tied to a compiler version; source gives the consumer's build full optimization but needs the right plugin.", "Peer dependency on the framework vs. bundling it: a peer keeps one shared copy, bundling avoids version problems but breaks shared context and state."],
    p: ["Two copies of the framework in one page make context and hooks fail with errors that mention nothing about duplication.", "Library styles that rely on the author's build setup render unstyled in the consumer's app."],
    v: "Install the package in a clean application with no special configuration, import two components and confirm they render with styles, type information appears in the editor, and only one copy of the framework is in the bundle.",
    dep: ["module-bundler", "tree-shaking", "scoped-styles"]
  },
  "accessibility-primitives": {
    s: "Reusable pieces that implement correct keyboard and screen reader behavior, such as focus traps, live announcements and unique identifiers, so components do not each reinvent them.",
    d: "Frameworks and component libraries provide helpers for managing focus on open and close, trapping it inside dialogs, generating ids that match between server and browser output, announcing changes through live regions and implementing keyboard patterns such as arrow-key navigation in menus. They apply the roles and properties defined in accessibility standards. It is hard because correct behavior depends on the pattern and platform, and because the framework re-renders: focus can be lost when an element is replaced instead of updated.",
    k: ["Behavior-only primitives with no styling vs. complete styled components: primitives fit any design but make each team assemble them; styled components are quick but constrain appearance.", "Framework-managed focus vs. letting the browser handle it: managing focus is required for dialogs and route changes, but every manual rule is another way to trap a user."],
    p: ["A list re-render replaces the focused element, so focus drops to the document and a keyboard user loses their place.", "Ids generated differently on the server and browser cause hydration mismatches and broken label associations."],
    v: "Open a dialog by keyboard, confirm focus moves inside and Tab stays inside it, press Escape and confirm focus returns to the trigger; run the same with a screen reader and confirm the dialog title is announced.",
    dep: ["refs-and-handles", "accessibility-tree", "lifecycle-hooks"]
  }
});
