// Details for the client-side UI framework plate, part 2: routing, forms, styling, state, data.
ATLAS.details("ui-framework", {
  "route-matching": {
    s: "Turns a URL path into a route: the screen to show and the parameters, such as an identifier, extracted from the path.",
    d: "Routes are declared as patterns with static segments, named parameters, optional parts and wildcards, in a list or a file layout. The router tests the current path against them, ranks matches by specificity and returns the winner with its parameters decoded. Query strings and fragments are parsed separately. Ranking is the hard part: two patterns can match one path, and the result must not depend on declaration order alone. Encoding also matters, since slashes and percent-escapes inside parameters must round-trip exactly.",
    k: ["Declared route table vs. file-based routes: a table is explicit and can be generated or tested, while file layout makes routes discoverable and ties code splitting to structure.", "Ranking by specificity vs. first match wins: specificity is order-independent but harder to predict; first match is simple but fragile when routes are reordered."],
    p: ["A catch-all pattern placed early swallows routes declared after it, and a new page silently shows the not-found screen.", "A parameter containing an encoded slash is split into two segments and matches the wrong route."],
    v: "Request a path matching both a static route and a parameter route, and confirm the static one wins; request a path with an encoded slash in the parameter and confirm the decoded value arrives intact.",
    dep: ["history-integration"]
  },
  "nested-layouts": {
    s: "Composes screens from nested routes, so shared chrome such as navigation stays mounted while only the inner section changes.",
    d: "A route tree matches a path to a chain of routes, each rendering its component with an outlet where the next route's view goes. Navigating between siblings replaces only the inner part, preserving the state and scroll of the layouts above. Each level can load its own data in parallel. The challenge is coordination: errors and loading states must be assignable to a level, so one failing panel does not blank the page, and layouts must decide whether to remount when parameters change.",
    k: ["Remount layouts on parameter change vs. reuse: reuse keeps state and avoids flicker but leaves stale data unless explicitly reset; remount is clean but loses scroll and input.", "Per-level loading and error views vs. one for the page: per-level views contain failures, but multiply states to design and test."],
    p: ["A layout keeps state belonging to the previous item because it was reused when only a parameter changed.", "An error in a deep route renders at the root and discards the navigation that was working."],
    v: "Navigate between two child routes under one layout, and confirm the layout's open menu and scroll position persist while the child's content and URL change and only the child fetches data.",
    dep: ["route-matching", "slots-and-children", "error-boundaries"]
  },
  "history-integration": {
    s: "Keeps the address bar, the back and forward buttons and the displayed screen consistent by pushing and listening to the browser's session history.",
    d: "Navigating by link pushes an entry through the History API and then renders the new route without loading the page. Back and forward fire an event, and the router renders the entry's route and restores its saved state. Hash-based routing avoids server configuration, while path-based routing needs the server to return the application for any path. The hard part is edge behavior: replacing versus pushing entries, entries restored from the browser's cache, and navigations triggered while a previous one is still loading.",
    k: ["Path-based URLs vs. hash-based URLs: paths are clean and indexable but require the server to serve the app on every path; hashes work from static hosting but look unusual and cannot be handled server-side.", "Push vs. replace for redirects and filters: replace keeps history clean, push lets users step back through each change."],
    p: ["A redirect pushed instead of replaced traps the back button, which returns to the page that redirects forward again.", "A server returning not-found for deep links makes every refresh on a sub-page fail."],
    v: "Navigate through three pages, press back twice, and confirm the URL and screen follow each step without a network request for the document, and a hard reload on the second page returns that same page.",
    dep: ["history-api"]
  },
  "navigation-guards": {
    s: "Hooks that run before a route change completes, to require sign-in, confirm leaving unsaved work or redirect, and can cancel or redirect the navigation.",
    d: "A guard is a function the router calls with the target and current routes. It may allow, cancel or redirect, and may be asynchronous. Guards are declared globally, per route or inside components, and the router runs them in a fixed order. Leaving guards ask about unsaved changes. They are hard because they intersect with the browser: a back-button press has already changed the URL, so cancelling must restore it, and a guard that waits on the network delays every navigation.",
    k: ["Guard in the router vs. check inside the screen: router guards stop navigation before any work is done, but access rules are duplicated from the server; screen checks are close to the data but flash content.", "Blocking on asynchronous guards vs. showing a pending state: blocking is simple but feels frozen; showing pending requires designing the in-between state."],
    p: ["Client-side guards are treated as security, but a user can ignore them, so the server must enforce access itself.", "A guard that redirects to a page that also redirects back creates an endless loop."],
    v: "Visit a protected route while signed out and confirm redirection to sign-in with the target remembered; sign in and confirm landing on the target, and confirm the server rejects the same data request without credentials.",
    dep: ["route-matching", "history-integration"]
  },
  "route-data-loaders": {
    s: "Functions attached to routes that fetch the data a screen needs, started when navigation begins rather than after the screen renders.",
    d: "Each matched route can declare a loader. On navigation, the router calls all loaders for the new route chain in parallel, then renders when they finish or shows a pending state. Results are passed to components and cached by the data layer. Starting fetches at navigation avoids waterfalls, where a child discovers its data needs only after its parent loaded. The difficulty is deciding what happens during loading, how failures map to error views, and how a mutation causes the loaders to run again.",
    k: ["Fetch in the route vs. fetch in the component: route loaders start earlier and in parallel, component fetching keeps data next to its use and composes better.", "Wait for loaders before navigating vs. navigate immediately with placeholders: waiting avoids partial screens, immediate navigation feels fast but needs skeleton states."],
    p: ["Loaders for parent and child fetch overlapping data, so the same request is sent twice.", "A slow loader on one route delays the whole navigation because nothing shows until it resolves."],
    v: "Navigate to a route with three data dependencies on a throttled network, and confirm in the network log that all three requests start in the same instant, before the new screen renders.",
    dep: ["route-matching", "query-cache", "fetch-layer"]
  },
  "link-prefetching": {
    s: "Loads the code and data for a likely next screen before the user clicks, based on hover, viewport visibility or idle time.",
    d: "Links report intent: pointer hover, touch start, focus or appearing in the viewport. The router responds by fetching the route's code chunk and, optionally, its loader data into the cache. By the time of the click, the work is done or partly done. Policy is the difficulty: prefetching everything wastes bandwidth and server load, especially on slow or metered connections, and prefetched data may be stale by the time it is shown.",
    k: ["Prefetch on hover vs. on viewport entry: hover is precise but gives little lead time; viewport entry is earlier but fetches many unused pages.", "Code only vs. code and data: code is cheap and safe to cache, data may be personal or stale and needs a short lifetime."],
    p: ["Prefetching every link on a long list floods the server and the user's connection.", "Prefetched data with side effects on the server, such as marking something read, is triggered by merely hovering."],
    v: "Hover a link for 200 ms on a throttled connection and confirm the target's chunk request appears in the network log before the click, then click and confirm the screen shows with no further chunk request.",
    dep: ["code-splitting", "chunk-preloading", "route-data-loaders"]
  },
  "scroll-focus-restoration": {
    s: "Restores scroll position on back navigation and moves scroll and focus sensibly on forward navigation, as full page loads do natively.",
    d: "On each navigation, the router saves the scroll position keyed to the history entry, and on back or forward restores it once the content is tall enough to scroll to. On forward navigation it scrolls to top or to a fragment target. For assistive technology it moves focus to a heading or main region and announces the new page title, since no page load signals the change. The difficulty is timing: content loads asynchronously, so restoring too early lands at the wrong place.",
    k: ["Restore after the data loads vs. immediately: waiting is correct but delays and can fight user scrolling; immediate restore is quick but fails when the page is too short.", "Move focus to the page heading vs. leave it on the link: moving focus helps screen reader users orient, but surprises keyboard users who expected to continue from the link."],
    p: ["Restoring scroll before the list has rendered clamps to the top and the position is lost.", "No focus management on route change leaves screen reader users hearing nothing after activating a link."],
    v: "Scroll down a long list, open an item, press back, and confirm the list returns to the same scroll offset; navigate forward to a new page and confirm focus lands on its heading and the title is announced.",
    dep: ["history-integration", "accessibility-tree", "layout-measurement"]
  },
  "controlled-inputs": {
    s: "The two ways to bind a form field to state: the framework owns the value and sets it on every change, or the browser owns it and the framework reads it when needed.",
    d: "A controlled input renders with a value from state and updates state on each input event, so the state is the single source of truth and can be validated or transformed on the fly. An uncontrolled input keeps its own value in the DOM, and code reads it on submit through a reference or form data. Controlled fields give immediate access and control, at the cost of updating on each keystroke. The trap is timing: if the framework sets the value later than the browser, the cursor jumps or text is lost.",
    k: ["Controlled vs. uncontrolled: controlled gives live validation and formatting but re-renders per keystroke; uncontrolled is cheap and simple but the value is only readable on demand.", "Update on every keystroke vs. on blur: every keystroke is responsive but costly in big forms; on blur is cheap but delays feedback."],
    p: ["Updating state asynchronously for a controlled field makes the cursor jump to the end while typing.", "Switching a field from uncontrolled to controlled mid-life produces warnings and lost values."],
    v: "Type quickly into a controlled field whose state transforms input to uppercase, and confirm no characters drop and the cursor stays where typing occurs, even when the value is changed in the middle of the text.",
    dep: ["local-state", "ime-text-input", "browser-event-system"]
  },
  "form-state": {
    s: "Tracks each field's value, whether it was touched or changed, its errors and the form's overall status, so interface and submission logic read from one place.",
    d: "A form library or built-in feature holds a structure of field values plus metadata: pristine or dirty, touched, valid, submitting. It registers fields, updates them on change, and exposes derived flags such as whether to enable the submit button. Nested and repeating groups, such as a list of addresses, make the structure recursive. The difficulty is scale: a form with hundreds of fields must not re-render everything on each keystroke, and metadata must reset correctly after a successful save or a cancel.",
    k: ["Form state in a library vs. in component state: a library handles metadata and performance patterns, component state has no new concepts but repeats logic per form.", "Subscribe per field vs. whole form: per-field subscriptions limit re-rendering, whole-form subscriptions are simpler but slow with many fields."],
    p: ["Resetting a form after submit restores the old initial values rather than the saved ones, so the form appears to undo the save.", "Every keystroke re-renders the whole form, and typing lags once it has many fields."],
    v: "Fill a form with two hundred fields, type in one, and confirm via the profiler that only that field and the submit-button flag re-render; reset and confirm every field returns to its initial value and pristine status.",
    dep: ["local-state", "derived-values", "controlled-inputs"]
  },
  "validation": {
    s: "Checks field values against rules, locally for fast feedback and on the server for truth, and presents errors in a way users and assistive technology can find.",
    d: "Rules come from a schema shared with the server, from functions per field or from built-in browser constraints. Validation runs on change, blur or submit, synchronously or against the server for uniqueness checks. Errors attach to fields and to the form, and are linked to inputs by accessible description and moved into view and focus on submit. The hard part is consistency: client rules that differ from server rules reject or accept the wrong things, and asynchronous checks race, so an older response can overwrite a newer one.",
    k: ["Shared schema with the server vs. separate client rules: a shared schema cannot drift, but ties client and server to one description format; separate rules are flexible but eventually disagree.", "Validate on every change vs. on blur and submit: constant validation shows errors while the user is still typing; delayed validation is calmer but later."],
    p: ["An error shown only as red color is invisible to screen reader users and people with color blindness.", "A slow uniqueness check for an earlier value returns after a newer one and marks a valid entry invalid."],
    v: "Submit an empty required field and confirm an error message appears linked to the input, focus moves to the first error and the screen reader announces it; submit a value the server rejects and confirm its message shows on the same field.",
    dep: ["form-state", "accessibility-primitives", "fetch-layer"]
  },
  "form-submission": {
    s: "Sends form data to the server and handles pending, success and failure states, including refreshing the data the change affects.",
    d: "Submission gathers values, serializes them as form data or JSON, sends them and tracks status for the interface: disable the button, show progress, report errors. Mutations tell the cache which data became stale so it refetches or updates. Frameworks can also submit through the browser's native form behavior and enhance it, so forms work before scripts load. The difficulty is idempotency and failure: a double click can send twice, a lost response leaves the client unsure whether the change happened, and partial failures need clear recovery.",
    k: ["Native form submission enhanced with scripts vs. script-only submission: native works without scripts and gets standard behavior for free, but limits custom flows; script-only is flexible but fails if scripts fail.", "Optimistic update vs. wait for the server: optimistic feels instant but needs rollback; waiting is simple and always accurate."],
    p: ["Double-clicking submit creates two orders because the button stayed enabled until the response.", "After a timeout the user retries a request that had in fact succeeded, creating a duplicate."],
    v: "Click submit twice quickly and confirm only one request is sent, the button shows a pending state, and on success the list showing the new record refreshes; cut the network and confirm a retry-able error appears.",
    dep: ["form-state", "fetch-layer", "cache-invalidation"]
  },
  "ime-text-input": {
    s: "Handles composed text entry, where an input method assembles characters over several keystrokes, without interrupting the composition by re-rendering the field.",
    d: "Many languages enter text by composing: the user types phonetic keys, sees an underlined candidate, and confirms a character. The browser fires composition events, and the field holds provisional text. If the framework sets the field's value during composition, or reformats it, the provisional text is destroyed. Frameworks must skip updates and validation while composing and apply the final value at the end. The difficulty is that behavior and event ordering differ across browsers and input methods, and cannot be fully simulated in tests.",
    k: ["Ignore input events during composition vs. process them: ignoring protects composition but delays live features such as search suggestions; processing them gives live features but risks breaking input.", "Native editable text vs. custom rendered editor: native fields handle input methods correctly; custom editors give control but must reimplement composition support."],
    p: ["Reformatting a field on each input event, such as stripping characters, deletes in-progress composition for users of many languages.", "Search-as-you-type fires a request for every provisional character."],
    v: "Enter text with an input method that composes characters, in a controlled field with live validation, and confirm the composition is not interrupted and the final character is committed once.",
    dep: ["controlled-inputs", "browser-event-system"]
  },
  "file-and-drag-input": {
    s: "Handles files chosen through a picker, dropped on a target or pasted, including previews, size checks and uploads that report progress.",
    d: "File inputs yield file objects with names, types and sizes, and drag-and-drop targets receive the same through drop events after the code prevents the browser's default of opening the file. The interface validates type and size, creates local previews, then uploads in one request or in chunks with progress and cancellation. Dragging items within a page uses the same events, or pointer events for finer control. The difficulty is that drag events are verbose and inconsistent, previews hold memory until released, and keyboard alternatives are required.",
    k: ["Native drag events vs. pointer-based custom dragging: native is built in and works with external files, custom dragging gives control of visuals and touch support but more code.", "Single upload vs. chunked resumable upload: single is simple, chunked survives flaky networks at the cost of server support and state."],
    p: ["Preview URLs created for each file are never released and memory grows during a long session.", "A drop target with no keyboard alternative excludes users who cannot drag."],
    v: "Drop a file of the wrong type and confirm a message names the problem; drop a valid large file, watch progress advance, cancel it and confirm the request is aborted and no preview memory remains referenced.",
    dep: ["browser-event-system", "fetch-layer", "accessibility-primitives"]
  },
  "scoped-styles": {
    s: "Compiles each component's CSS so its rules apply only to that component's elements, preventing collisions with the rest of the page.",
    d: "At build time, the compiler rewrites selectors with a generated attribute or class unique to the component and adds that marker to the component's elements. The styles are extracted into a stylesheet and loaded by the browser as ordinary CSS, so there is no runtime cost. Alternatively, the platform's shadow boundary provides the isolation. The difficulty is the edges: styling a child component from outside, global resets, and keeping specificity predictable when generated markers add weight to selectors.",
    k: ["Compile-time scoping vs. shadow DOM isolation: compile-time works with ordinary DOM and global themes but is a convention; shadow isolation is enforced by the platform but blocks inherited global styles from selectors.", "Extract to a stylesheet vs. inline in script: stylesheets cache and parse early, inline bundles avoid an extra request but delay rendering."],
    p: ["A generated marker raises specificity so a theme override stops applying.", "Styling a child's internals from the parent fails because the child's elements carry another marker."],
    v: "Define a rule for a generic selector in one component, and confirm elements with the same tag in another component are unaffected while the first component's elements are styled, with no style code running in the browser.",
    dep: ["template-compiler", "module-bundler"]
  },
  "runtime-style-injection": {
    s: "Generates styles from component code in the browser, with values computed from props and state, and inserts them into the document as needed.",
    d: "A styling function receives props and returns CSS. The library hashes the result into a class name, inserts the rule into a stylesheet if absent and applies the class. Values can depend on the theme and on state, so dynamic styling is simple to write. The costs are runtime work on every render, more script to ship, and server rendering complexity: styles used during server render must be collected and sent, or the page flashes unstyled before scripts run.",
    k: ["Runtime generation vs. build-time extraction: runtime allows any dynamic value, but adds script and per-render cost; extraction is faster but dynamic values need custom properties.", "Rule insertion through the style object model vs. text nodes: object-model insertion is fast but hard to inspect and not shown in all tools."],
    p: ["Server-rendered pages flash unstyled content because the styles were not collected during render.", "Creating a unique rule per distinct value fills the stylesheet when a prop takes continuous values."],
    v: "Render a component with a color prop on the server and in the browser, and confirm the styles are present in the first HTML response, that changing the prop adds one rule, and that a thousand identical components add none.",
    dep: ["host-renderer", "server-renderer", "design-tokens"]
  },
  "utility-css": {
    s: "Styling by composing many small single-purpose classes in markup, with a generator that emits only the classes actually used.",
    d: "A scanner reads source files for class names, a generator emits the CSS for exactly those utilities, and markup lists them directly on elements. Because each class does one thing with a value from a fixed scale, the stylesheet stops growing as the app grows, and changes to one element do not affect others. Variants cover states and breakpoints. The costs are long class lists, a need to extract repeated patterns into components, and class names constructed dynamically by string concatenation, which the scanner cannot see.",
    k: ["Utility classes vs. named semantic classes: utilities avoid naming and keep styles local and bounded, at the cost of verbose markup and weaker separation of structure from presentation.", "Generate on demand vs. ship a prebuilt set: on-demand output is small but needs a build step; prebuilt works anywhere but is large."],
    p: ["A class built from string pieces is never found by the scanner, and its styles are missing in production only.", "The same long class list is copied across files, and a design change requires editing every copy."],
    v: "Build the production CSS and confirm it contains only the utilities present in source, that a class assembled dynamically in code is absent unless listed, and that the file size is under the agreed budget.",
    dep: ["build-plugins", "design-tokens", "minification"]
  },
  "design-tokens": {
    s: "Named values for color, spacing, type and motion, kept in one place and exposed as CSS custom properties so themes switch without rebuilding.",
    d: "Tokens are defined once in data, often in layers: raw values, then meanings such as surface or danger, then component-specific aliases. Build tooling emits them as custom properties on the root, and components reference the properties. Themes, such as dark mode, redefine the same names under a condition, and the browser's cascade does the switching with no re-render. It is hard to keep disciplined: ad hoc values creep in, and a token's meaning must stay stable across themes.",
    k: ["Custom properties at runtime vs. build-time substitution: properties allow live theming and per-subtree overrides, while build-time values are static but work in contexts without custom property support.", "Few semantic tokens vs. many specific tokens: few are easy to learn but limit variation; many fit every case but are hard to keep consistent."],
    p: ["A raw color used directly in one component fails to change with the theme, leaving an unreadable panel in dark mode.", "A token renamed in the source breaks every reference silently, since a missing custom property yields an invalid value, not an error."],
    v: "Switch the theme at runtime and confirm every component's colors change with no re-render in the profiler, and run a scan that finds no hard-coded color values outside the token definitions.",
    dep: ["dom-mutation-api"]
  },
  "transitions-animation": {
    s: "Moves elements between states, including entering and leaving the document, using CSS transitions or script-driven animation without causing layout thrash.",
    d: "Simple motion uses CSS transitions and keyframes on properties the compositor can animate without layout. Elements leaving the tree must stay long enough to play their exit, so the framework delays removal until the animation ends. Shared-element and list reordering animations measure positions before and after an update, then animate from the old to the new. The difficulty is coordination between the framework and browser: measuring forces layout, and honoring the user's reduced-motion preference is a requirement.",
    k: ["CSS-driven animation vs. script-driven: CSS is cheap and runs off the main thread but limited in sequencing; script gives full control but competes with other work.", "Delay removal for exit animation vs. remove immediately: delay looks polished but adds state to every list and can leave dead elements; immediate removal is simpler and abrupt."],
    p: ["Animating width or top triggers layout every frame and drops below smooth frame rates on slow devices.", "Ignoring the reduced-motion preference causes discomfort for users who set it."],
    v: "Remove a list item and confirm its exit animation plays before the node leaves the DOM, the frame profile shows no layout work during it, and the same action with reduced motion enabled completes instantly.",
    dep: ["layout-measurement", "dom-mutation-api", "browser-scheduling-apis"]
  },
  "responsive-layout": {
    s: "Adapts interface to screen and container size with media and container queries, fluid units and layout primitives, rather than separate mobile and desktop code.",
    d: "Layouts are expressed with flexible grids and wrapping, and rules change at breakpoints chosen by content. Container queries let a component respond to the space it is given instead of the window, which matters when the same component appears in a sidebar and a main area. Script-based detection of size is reserved for behavior that CSS cannot express, such as swapping a menu for a drawer. The difficulty is server rendering, where the window size is unknown, so size-dependent script logic can render the wrong layout first.",
    k: ["CSS queries vs. script-detected size: CSS needs no re-render and works with server output, script allows structural changes but flashes the wrong layout before it runs.", "Viewport breakpoints vs. container-based: viewport breakpoints are simple, container-based make components portable but need the container to establish a size context."],
    p: ["A component checks window width in script, so the server renders the desktop layout and mobile users see a flash and a hydration mismatch.", "Fixed pixel heights break when users enlarge text."],
    v: "Load the page at 360 and 1280 pixel widths, and confirm the layout changes correctly with no script-driven re-render, then place one component in a narrow container on the wide page and confirm it uses its compact layout.",
    dep: ["design-tokens", "observers"]
  },
  "local-state": {
    s: "Values a single component owns and can change, which the framework remembers between updates and uses to trigger a re-render when they change.",
    d: "State is declared by the component and stored by the framework against that component instance, not in the function's local variables. An update call schedules a render with the new value, and the next render sees it. Updates can be given as a function of the previous value so several in a row compose correctly. State stays with the instance until it is destroyed or its key changes. The hard part is staleness: closures capture the value from the render they were created in, and updates are batched, so reading state right after setting it returns the old value.",
    k: ["Update by value vs. by function of previous value: values are simple, functions stay correct under batching and repeated updates.", "State in the component vs. lifted to a parent: local keeps components independent, lifting lets siblings share it but widens what re-renders."],
    p: ["A timer callback captures the state from the first render and keeps using that value forever.", "Storing a value that can be computed from props in state creates a copy that goes out of date."],
    v: "Call an update three times in one handler using the function form and confirm the state increases by three with a single render; do the same with the value form and observe the difference.",
    dep: ["update-batching", "component-model"]
  },
  "reactive-primitives": {
    s: "Observable values, such as signals or reactive objects, that record who reads them and notify exactly those readers when they change.",
    d: "A primitive wraps a value with a getter and a setter. Reading inside a tracked context, such as a computation or a template binding, registers it as a subscriber. Writing notifies subscribers, which are queued and re-run. Objects can be wrapped in proxies so nested property reads are tracked. Because dependencies are discovered by running code, no one declares them, and updates go to the exact node that needs them. The difficulty is boundaries: reads outside a tracked context are not noticed, and destructuring a reactive object copies a value that is then no longer reactive.",
    k: ["Value wrapper with explicit access vs. proxy over plain objects: wrappers are explicit and work with any value, proxies read naturally but break on destructuring and on values the proxy cannot see.", "Eager notification vs. lazy pull: eager is simple, lazy recomputes only what is read, avoiding wasted work and temporary inconsistent values."],
    p: ["Destructuring a reactive object in a component copies the current values and the screen stops updating.", "Updating a reactive value inside its own computation creates an endless update loop."],
    v: "Create a reactive value read by two bindings, update it, and confirm exactly those two DOM nodes change, with nothing else executing in the profiler and no component function re-run.",
    dep: ["dependency-tracking", "update-batching"]
  },
  "derived-values": {
    s: "Values computed from other state and cached, recomputed only when an input changes, so expensive derivations are done once.",
    d: "A derived value declares a computation over reactive inputs or over an explicit list of dependencies. The framework caches the result and invalidates it when any input changes, then recomputes on next read. Derivation avoids storing duplicated data in state and keeps views consistent. In frameworks that re-run components, memoization compares dependency lists by identity. Difficulty arises from precision: an object rebuilt each render looks changed every time, and a computation with side effects or that reads untracked data produces stale or repeated results.",
    k: ["Automatic dependency tracking vs. explicit dependency lists: automatic is hard to get wrong but depends on tracked reads; explicit lists are visible but go stale when someone forgets an entry.", "Memoize everything vs. only expensive work: memoizing everything adds comparison cost and complexity, selective use keeps simple code simple."],
    p: ["A missing entry in a dependency list leaves a derived value stale after an input changes.", "Memoizing a cheap computation costs more in comparison and memory than recomputing it."],
    v: "Derive a sorted list from a ten-thousand-item array, change an unrelated value and confirm the sort does not run again, then change the array and confirm it runs exactly once.",
    dep: ["dependency-tracking", "reactive-primitives", "memoization-boundaries"]
  },
  "dependency-tracking": {
    s: "The mechanism that discovers which computations read which values, so a change reaches exactly the code that depends on it.",
    d: "While a computation or binding runs, the framework sets it as the current observer. Every read of a reactive value adds an edge from that value to the observer, and every run rebuilds the edges, so dependencies that stop being read are dropped. On write, the framework walks outgoing edges, marks dependents dirty and schedules them in an order that avoids running a computation before its own inputs are updated. The difficulty is correctness: avoiding glitches, where a computation sees half-updated inputs, and avoiding leaks from edges that outlive their observers.",
    k: ["Track at read time vs. declare statically: read-time tracking handles any code and conditionals, static declaration allows compile-time optimization but limits expressiveness.", "Property-level vs. object-level tracking: property-level updates only what changed but costs more per read; object-level is cheaper but over-notifies."],
    p: ["A conditional read means a dependency is only registered on one path, so a change on the other path is missed until the condition flips.", "Observers that are not disposed keep subscribing to values and keep objects alive."],
    v: "Create a computation that reads value A or B by condition, change B while A is selected and confirm no re-run, flip the condition and confirm B now triggers it and A no longer does.",
    dep: []
  },
  "immutable-updates": {
    s: "Updating state by producing new objects rather than changing existing ones, so changes are detected by comparing references instead of scanning contents.",
    d: "An update copies the changed path of a nested structure and shares the rest, giving a new top-level reference. Memoization and re-render checks then need only an identity comparison. Helper libraries or language features make copy-on-write updates readable, and some frameworks provide drafts that look mutable and produce immutable results. It also makes history cheap, since old versions remain valid. The difficulty is ergonomics and cost: deeply nested updates are verbose, and copying very large structures per update is slow if sharing is not done carefully.",
    k: ["Immutable updates vs. mutating tracked objects: immutable updates make change detection trivial and history free, but cost copying and syntax; tracked mutation reads naturally but depends on proxy tracking.", "Draft-style helpers vs. manual spreading: drafts reduce errors in deep updates but add a dependency and a conceptual layer."],
    p: ["Mutating an object in place leaves its reference unchanged, so memoized components skip the update and the screen is stale.", "Copying a large array on every keystroke makes typing slow."],
    v: "Update one field of a nested object, and confirm the changed path has new references while an untouched sibling keeps its identical reference, and only the component reading the changed path re-renders.",
    dep: ["local-state", "memoization-boundaries"]
  },
  "global-store": {
    s: "A single shared state container outside the component tree, with defined ways to read slices of it and to change it, used for data many distant components share.",
    d: "The store holds state, exposes selectors that read slices and an update interface, such as actions handled by reducers or methods on stores. Components subscribe to the slices they use and re-render only when those slices change. Middleware can log, persist or run side effects. It serves cases where context would update too much, or where state must be accessed outside components. The difficulty is discipline: everything in global state is global, so unrelated features couple, and selectors returning fresh objects defeat subscriptions.",
    k: ["Central store with explicit actions vs. many small stores: one store gives a single traceable history, small stores keep features independent and code split.", "Subscribe through selectors vs. whole state: selectors limit re-renders but must return stable references; whole-state subscriptions are simple and slow."],
    p: ["A selector that builds a new array each call causes every subscriber to re-render on every store change.", "Server-derived data copied into the store goes stale with no refresh rule."],
    v: "Subscribe two components to different slices, update one slice, and confirm only its subscriber re-renders and the action appears in the log with before and after values.",
    dep: ["reactive-primitives", "immutable-updates", "update-batching"]
  },
  "state-machines": {
    s: "Models a component's or flow's behavior as explicit states and allowed transitions, so impossible combinations such as loading and failed together cannot occur.",
    d: "Instead of several boolean flags, a machine has one current state and a table of events that move it to others, with actions run on entry or exit. Interface code renders from the state, and invalid events are ignored in states that do not handle them. Machines suit wizards, uploads, authentication and anything with ordering rules, and can be visualized and tested without a screen. The cost is ceremony for simple cases, and the need for hierarchical and parallel states as flows grow.",
    k: ["Explicit machine vs. boolean flags: a machine rules out impossible states and documents the flow, but is more code for simple toggles.", "Machine in the UI layer vs. shared with the server: shared machines keep rules identical, but couple deployment and need a neutral definition format."],
    p: ["Flags for loading, error and success drift out of sync, and the screen shows a spinner beside an error message.", "A machine that grows to dozens of states without hierarchy becomes harder to understand than the flags it replaced."],
    v: "Send every event in every state of a small machine and confirm in a generated table that disallowed events leave the state unchanged and that each state renders a distinct screen.",
    dep: ["local-state", "global-store"]
  },
  "url-state": {
    s: "Keeps filter, sort, selection and page state in the URL, so views can be shared, bookmarked and restored with the back button.",
    d: "State that identifies a view, rather than editing in progress, is stored in path and query parameters. The router parses them into typed values, components read them like state, and changing them pushes or replaces a history entry. The URL then is the source of truth, and reloading reproduces the screen. It requires serialization: arrays, dates and nested values need a stable encoding, and defaults should be omitted to keep addresses short. Updates must debounce, or typing in a search box creates a history entry per character.",
    k: ["URL as the source of truth vs. component state mirrored to the URL: URL-first is always shareable but every read parses text; mirroring is fast but can disagree.", "Push vs. replace per change: push makes every filter step undoable but fills history; replace keeps history tidy but loses steps."],
    p: ["Syncing a search box to the URL on every keystroke fills the back button history with dozens of entries.", "Putting private values such as tokens or personal data in the address leaks them through history, referrers and logs."],
    v: "Apply a filter and sort, copy the address into a new window, and confirm the same filtered, sorted view loads, and that pressing back removes only the last applied change.",
    dep: ["history-integration", "route-matching", "local-state"]
  },
  "state-persistence": {
    s: "Saves selected state in browser storage and restores it on load, so preferences and drafts survive reloads and, optionally, sync across tabs.",
    d: "Chosen parts of state are serialized into storage with a version number and written after changes, debounced. On start they are read back, validated and migrated if the shape has changed. Storage events can propagate changes between open tabs. Server-rendered pages cannot read storage, so restored values appear after hydration, which risks flicker or mismatch. The difficulty is evolution and limits: old saved shapes outlive the code that wrote them, storage is size-limited and unavailable in some modes, and anything stored is readable by scripts on the page.",
    k: ["Persist the whole store vs. selected keys: whole-store is simple, but restores stale and sensitive data; selected keys require thought and stay small.", "Local storage vs. cookies vs. server-side: local storage is simple but invisible to the server; cookies reach the server for first render but add request size."],
    p: ["A new release changes a state shape, and old saved data crashes the app on load for returning users until they clear storage.", "Storing authentication tokens in script-readable storage lets any injected script steal them."],
    v: "Save state, change its shape in a new build, reload, and confirm the loader migrates or discards the old version without a crash; open a second tab, change a preference, and confirm the first tab updates.",
    dep: ["global-store", "local-state"]
  },
  "fetch-layer": {
    s: "A wrapper around the network that issues requests, applies headers and credentials, parses responses and turns failures into a consistent set of errors and cancellations.",
    d: "It builds requests with base address, authentication and content negotiation, sends them using the platform's request API, and decodes bodies. Interceptors add tokens, refresh expired ones, log and normalize errors, so that a network failure, an HTTP error status and a malformed body all arrive as distinguishable cases. Requests can be cancelled when a component goes away or a newer one supersedes it. The difficulty is that HTTP error statuses are not exceptions by default, and cancelled or retried requests must not apply stale results.",
    k: ["Thin wrapper vs. full client library: thin keeps behavior visible and small, a full client adds retries and interceptors but hides what is sent.", "Throw on error statuses vs. return a result object: throwing is concise, result objects force callers to handle every case."],
    p: ["A response for an earlier request arrives after a later one and overwrites newer data.", "Expired-token refresh happens in parallel for several requests, and each one invalidates the others."],
    v: "Fire two overlapping requests for different search terms, delay the first one's response, and confirm the screen shows only the second one's result and the first request shows as cancelled in the network log.",
    dep: ["observers"]
  },
  "query-cache": {
    s: "A client-side store of server responses keyed by request, tracking each entry's status, age and subscribers, and serving cached data while fresh ones load.",
    d: "Each distinct query, identified by a key, has an entry holding data, error, loading status and timestamps. Components subscribe through the key. Entries are fresh for a configured time, after which a read serves the cached value and refetches in the background, called stale-while-revalidate. Entries without subscribers are garbage-collected after a delay. The difficulty is choosing key structure and lifetimes, since a key that omits a parameter returns the wrong data and a long freshness window shows outdated facts.",
    k: ["Stale-while-revalidate vs. block until fresh: stale-while-revalidate shows something immediately but may briefly show old data; blocking is always current but slow.", "Normalized cache by entity vs. cache by request: normalized updates every view of an entity at once but needs identifiers and merge logic; request caches are simple but duplicate data."],
    p: ["A key missing one parameter makes two different screens share one entry and show the other's data.", "A long freshness window shows users stale prices while everything appears loaded."],
    v: "Request the same key from two components and confirm one network request; navigate away and back within the freshness window and confirm instant data with no request, then after it expires confirm a background refetch.",
    dep: ["fetch-layer", "request-deduplication", "reactive-primitives"]
  },
  "cache-invalidation": {
    s: "Rules for marking cached data out of date after a change, so the next read or an immediate refetch brings the interface back in line with the server.",
    d: "After a mutation succeeds, code names the keys or key prefixes that are now stale. The cache marks them invalid, refetches those that are on screen and discards the rest on next use. Other triggers include window focus, reconnection, timers and server-sent signals. Tags on entries let one mutation invalidate everything related. It is hard because dependencies are implicit: a change to one record affects lists, counts and detail views that are cached under different keys, and missing one leaves the screen wrong in a way tests rarely catch.",
    k: ["Invalidate and refetch vs. patch the cache by hand: refetch is always correct but costs a request; patching is instant but duplicates server logic and can diverge.", "Fine-grained keys vs. broad invalidation: fine keys minimize refetching but are easy to miss; broad invalidation is safe and wasteful."],
    p: ["A mutation updates a record but not the list that shows it, so the list is stale until reload.", "Invalidating broadly after every action floods the server with refetches."],
    v: "Edit a record's name, and confirm that the detail view, the list row and a count on another page all show the new value without a reload, with only the on-screen queries refetched.",
    dep: ["query-cache", "form-submission"]
  },
  "request-deduplication": {
    s: "Combines identical requests in flight into one, so several components asking for the same data cause a single network call.",
    d: "The cache keeps the promise of each in-flight request under its key. A second request for that key joins the existing promise rather than starting another, and all callers receive the same result. This lets components fetch locally without coordination, and avoids waterfalls from parent and child asking for the same thing. Cancellation needs care: aborting one caller must not abort the shared request while others still wait. Identity is the hard part, since two requests that look alike but differ in headers or credentials are not the same.",
    k: ["Deduplicate in flight only vs. also within a short window: in flight is exact and safe, a short window also saves quick repeat requests but may serve slightly old data.", "Key by URL vs. by logical query: URL keys are automatic, logical keys survive changes in how the request is built."],
    p: ["One component unmounts and cancels the shared request, and another still waiting receives an abort error.", "Requests that differ only in an authorization header are merged, and one user's data is returned to another context."],
    v: "Mount ten components that request the same key in the same tick, and confirm one request in the network log with all ten receiving the same data; unmount nine and confirm the tenth still gets a result.",
    dep: ["fetch-layer", "query-cache"]
  },
  "optimistic-updates": {
    s: "Shows the expected result of a change immediately, before the server confirms it, and rolls back or reconciles if the server disagrees.",
    d: "On a mutation, the client snapshots the affected cache entries, applies the predicted change and renders it, then sends the request. On success it refetches or replaces the prediction with the server's value, and on failure it restores the snapshot and shows an error. It makes interactions such as toggles and reordering feel instant. The difficulty is concurrency: further changes may be made before the first response, responses may arrive out of order, and predictions for server-computed fields, such as identifiers or totals, can only be approximate.",
    k: ["Optimistic vs. pessimistic updates: optimistic feels instant but needs rollback and conflict handling; pessimistic is simple and honest but shows a delay.", "Roll back on failure vs. keep the change and mark it unsaved: rollback restores consistency but loses user input; marking keeps input but lets the screen differ from the server."],
    p: ["A failed request rolls back a snapshot taken before a later successful change, discarding that change too.", "A temporary client-generated identifier is shown to the user, then replaced, which loses focus or selection."],
    v: "Toggle an item while the server is made to reject the request, and confirm the toggle shows instantly, then reverts with an error message, and that an unrelated change made in the meantime remains.",
    dep: ["query-cache", "form-submission", "immutable-updates"]
  },
  "pagination-infinite-lists": {
    s: "Loads long lists in pages, by number, offset or cursor, and stitches them into one view that grows as the user scrolls or advances.",
    d: "Each page is a separate cache entry keyed by its position. Offset pagination is simple but shifts when items are added or removed, while cursor pagination continues from the last item seen and stays stable. Infinite scroll appends pages as a sentinel enters the viewport, and is paired with virtualization to bound DOM size. Refreshing needs a policy: refetching all pages is expensive and a stale page may duplicate or skip items. Also, a long list makes the footer unreachable and breaks scroll restoration without care.",
    k: ["Cursor vs. offset pagination: cursors are stable under changes and efficient for the server but cannot jump to a page; offsets allow page numbers but skip or repeat items.", "Infinite scroll vs. explicit pages: infinite scroll is fluid for browsing, explicit pages are better for finding a position and reaching a footer."],
    p: ["Items inserted while paging cause the same item to appear on two pages.", "Infinite scroll with no virtualization grows the DOM until the page slows to a crawl."],
    v: "Scroll through five hundred items with items inserted on the server midway, and confirm no duplicates or gaps in the displayed list and that the number of DOM nodes stays bounded.",
    dep: ["query-cache", "list-virtualization", "observers"]
  },
  "realtime-subscriptions": {
    s: "Keeps displayed data live by receiving pushed changes over a persistent connection and merging them into the cache, instead of polling.",
    d: "The client opens a connection, using a socket or event stream, and subscribes to topics that match the data on screen. Pushed messages are applied to cache entries or trigger a targeted refetch. The connection reconnects automatically after drops, resends subscriptions and catches up on missed changes. It must fit the framework's lifecycle, subscribing on mount and unsubscribing on unmount. The difficulty is ordering and gaps: a message may arrive before the initial fetch finishes, and after a reconnect, changes during the outage must be recovered.",
    k: ["Apply pushed data directly vs. use messages as a signal to refetch: applying is fast and light, refetching is simple and always consistent but costs a request per event.", "One shared connection vs. one per feature: sharing saves resources and needs multiplexing; separate connections are simple and multiply load."],
    p: ["A message arrives before the initial query returns, and the later fetch overwrites it with older data.", "No catch-up after reconnect leaves the screen silently missing changes."],
    v: "Open a view, change the data from another client, and confirm the view updates within a second; drop the connection, change the data again, restore the connection, and confirm the missed change appears.",
    dep: ["query-cache", "effects", "offline-retry-queue"]
  },
  "offline-retry-queue": {
    s: "Holds mutations made while offline or failing and replays them in order when the connection returns, with backoff and visible status.",
    d: "Writes are placed in a persistent queue with their intended effect, and the interface shows them as pending. A worker sends them when the network is available, retries transient failures with exponential delay and jitter, and surfaces permanent failures for the user to resolve. Idempotency keys let the server ignore duplicates from retried requests. Reads come from the cache with a clear marker that data may be old. The difficulty is conflict: by the time a queued change is sent, the server data may have changed, and queue order must be preserved across reloads.",
    k: ["Queue and replay vs. fail immediately: queueing keeps users working through outages but needs conflict handling and persistence; failing fast is simple but loses work.", "Last write wins vs. merge or ask: last-write-wins is simple but overwrites others' changes; merge or confirm protects data but needs a model and interface."],
    p: ["Retrying a non-idempotent request after a timeout creates duplicate records.", "A queued change to a record deleted meanwhile fails permanently and the user is never told."],
    v: "Go offline, make three edits, reload, come back online, and confirm the three requests are sent once each in the original order with idempotency keys, and the interface moves from pending to saved.",
    dep: ["fetch-layer", "state-persistence", "optimistic-updates"]
  }
});
