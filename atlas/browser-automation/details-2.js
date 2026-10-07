// Details for the browser automation plate, part 2: actions, observation, contexts and pages.
ATLAS.details("browser-automation", {
  "actionability-checks": {
    s: "The set of conditions an element must satisfy before an action is performed: attached, visible, stable, enabled and receiving events at the target point.",
    d: "Before a click, the framework resolves the locator, then checks that the element is attached to the document, has a nonempty box, is not animating between frames, is not disabled, and that a hit test at the click point returns the element or a descendant rather than an overlay. Failing checks are retried until the action timeout. Each action has its own required set; reading text needs fewer checks than typing. The checks run inside the page for speed, which leaves a gap between check and input where the page can still change.",
    k: ["Checking before every action vs trusting the script: checks remove most sleeps and catch overlays; they add round trips and a small window of remaining race.", "Forcing an action past checks vs waiting: forcing is a quick escape for stubborn pages and clicks things a user could not; waiting is correct and sometimes slow."],
    p: ["A cookie banner or loading overlay covering the target makes the hit test fail, and the error blames the target rather than the overlay.", "Elements that animate forever, such as a pulsing button, are never stable and the action times out."],
    v: "Cover a button with a transparent overlay for one second, then remove it. The click must wait, succeed once the overlay is gone, and report the intercepting element if the overlay never leaves.",
    dep: ["auto-waiting", "scroll-into-view", "strictness"]
  },
  "auto-waiting": {
    s: "The built-in behavior of retrying a locator resolution and its readiness checks until an action can proceed or a timeout expires, replacing manual sleeps.",
    d: "Each action wraps a loop: resolve locator, run actionability checks, perform input, and if any step fails for a retryable reason go around again with a short backoff, up to the action timeout. Navigation-triggering actions also wait for the resulting navigation to commit. Timeouts are configurable globally, per test and per call. Auto-waiting cannot know what the user means by ready: it checks the element, not the data behind it, so scripts still need explicit conditions for server-side effects.",
    k: ["Waiting in the library vs in the script: library waiting is consistent and short to write; script waits are explicit but get duplicated and tuned by trial.", "Single global timeout vs per-action timeouts: global is simple; per-action allows slow operations a longer budget without making every failure slow."],
    p: ["Adding fixed sleeps on top of auto-waiting slows the suite and still races on slow machines.", "A generous timeout turns a missing element into a failure that arrives half a minute late."],
    v: "Insert a 3 second delay before a button appears and run the click with no sleeps. It must succeed after about 3 seconds, and with the button never appearing it must fail at exactly the configured timeout.",
    dep: ["actionability-checks", "timing-model", "strictness"]
  },
  "input-synthesis": {
    s: "Generating mouse, keyboard and touch input through the browser's input pipeline so pages see trusted events, in the same order a real user would produce.",
    d: "Actions compile into protocol input commands: mouse move, down and up at coordinates, key down, key up and text insertion, and touch points. Because input is injected below the page's event handlers, the browser sets the trusted flag and applies default behaviors such as focus changes, text selection and form submission. Typing sends per-key events with key codes and modifiers, and fill shortcuts set a value in one step. The hard parts are keyboard layouts, composition events for languages like Japanese, and drag and drop, which depends on engine details.",
    k: ["Dispatching real input events vs calling element methods in script: real input exercises handlers and defaults; script calls are faster and skip the behavior users hit.", "Fill vs per-key typing: fill is fast and deterministic; typing triggers key handlers, autocomplete and masks that some inputs need."],
    p: ["Setting a value through script on a framework-controlled input does not update its state, so the form submits stale data.", "Coordinates are computed before the page scrolls, so the click lands on a different element."],
    v: "On an input with key handlers and an autocomplete list, type a string and confirm key down, key up and input events fire in order and that the list appears. Then fill the same field and compare which events fire.",
    dep: ["debugging-protocol", "domains-and-events", "actionability-checks"]
  },
  "scroll-into-view": {
    s: "Bringing a target element into the viewport, and handling nested scroll containers and sticky headers, so that coordinate-based input lands on it.",
    d: "Before input the framework asks the engine to scroll the element into view, usually centered or nearest, then recomputes its box. Nested scrollable containers need each ancestor scrolled. Sticky or fixed headers can still cover the target after scrolling, which the hit test detects. Infinite lists lazily render items only when scrolled to. The difficulty is that scrolling can itself change layout: images load and push content down, and a smooth-scrolling page animates for hundreds of milliseconds after the call returns.",
    k: ["Native scroll-into-view vs wheel events: native calls are precise and skip the page's scroll handlers; wheel events trigger lazy loading and behave like a person, with less certainty of landing.", "Center alignment vs nearest edge: centering clears sticky bars but moves more; nearest moves little and may stay beneath a header."],
    p: ["A sticky header covers the target after scrolling and the click hits the header.", "Lazy-loaded images above the target load afterward and shift it out of the viewport mid-action."],
    v: "Put a target below a tall sticky header inside a scrollable panel and confirm the click lands on the target. Then add late image loading above it and confirm the action still succeeds.",
    dep: ["actionability-checks", "animation-stability"]
  },
  "navigation-waits": {
    s: "Rules for knowing a navigation has finished, using lifecycle milestones such as commit, document load and network quiet, and for handling redirects and single-page route changes.",
    d: "The engine reports a sequence of events: request sent, response committed, DOM parsed, load fired, and optionally network idle after a quiet period. The script chooses which milestone to wait for. Single-page applications change the URL without a document load, so URL or element conditions are used instead. Redirect chains, client-side redirects after load and downloads that cancel navigation each need handling. Network idle is the weakest signal, since pages with polling or analytics never go quiet.",
    k: ["Waiting for load vs for a specific element: load is generic and early for script-heavy pages; an element condition is accurate for that page and must be written per page.", "Network-idle waits vs fixed conditions: idle works for static sites and hangs on pages that keep polling."],
    p: ["Treating the load event as ready on a single-page app leaves the script acting on a skeleton screen.", "A wait registered after the click that triggers navigation misses an event that already happened."],
    v: "Navigate to a page that redirects twice and then renders content from an API call. The wait must resolve only after the final URL is reached and the intended element appears.",
    dep: ["explicit-waits", "domains-and-events", "frame-tree"]
  },
  "explicit-waits": {
    s: "Script-stated conditions to wait for, such as a response arriving, a function returning true or a URL matching, used where element readiness is not enough.",
    d: "Frameworks offer waits for a network response matching a pattern, for a predicate evaluated in the page until truthy, for URL changes, for events like popup or download, and for element states. Properly used, they express what the test truly depends on, such as saved data confirmed by the server. They must be registered before the triggering action, typically by starting the wait and the action together and awaiting both. The common mistake is the opposite order, creating a race where the event fires before anyone is listening.",
    k: ["Waiting on a network response vs on a visible change: responses are precise and tie the test to API shape; visible changes follow the user's view but may precede server commit.", "Page-side predicate polling vs event subscription: polling is simple and costs a little per check; events are exact and need the right event."],
    p: ["Starting the wait after the click means a fast response is already gone and the wait times out.", "A predicate that throws on missing elements is treated as false in some libraries and as a failure in others."],
    v: "Click save and wait for the save response in the same step. Make the server answer in 5 ms and then in 3 seconds; both runs must pass without code changes.",
    dep: ["domains-and-events", "request-interception", "timing-model"]
  },
  "uploads-and-downloads": {
    s: "Handling the browser's file chooser and download flow: attaching local files to inputs, and capturing, naming and verifying files the browser saves.",
    d: "File inputs are populated by telling the browser to attach paths directly to the input, bypassing the native dialog, or by intercepting the chooser event. Downloads are redirected by the framework to a managed directory; the script waits for a download event, then reads the suggested filename and final path and checks the content. Headless mode changes download policy in some engines. Difficulties include downloads started by script or a new tab, blob URLs and temporary file names, and tests that run on remote browsers where the file lives on another machine.",
    k: ["Setting files on the input vs driving the native dialog: setting is reliable and skips the dialog; the dialog tests user flow and cannot be automated by the browser protocol.", "Per-test download directory vs shared: per-test avoids collisions; shared is simpler and breaks parallel runs."],
    p: ["Reading the downloaded file before the browser finishes writing it returns a partial file.", "On a remote browser the path returned by the framework is on the remote machine, and the test cannot open it locally."],
    v: "Upload a 5 MB file to a form and download a generated report. Confirm the server received the exact uploaded bytes by hash, and the downloaded file's name and content match expectations.",
    dep: ["explicit-waits", "popups-and-new-tabs", "remote-connect"]
  },
  "dialog-handling": {
    s: "Responding to native alert, confirm, prompt and unload dialogs, which block the page until answered and must be handled by a registered listener.",
    d: "A script-opened dialog suspends the page's JavaScript until accepted or dismissed. The framework emits a dialog event and, by default in many libraries, auto-dismisses if no listener exists, to avoid hanging. A listener can accept, dismiss or supply prompt text, and can read the message. Beforeunload prompts and permission prompts are different mechanisms. The difficulty is that dialogs block the protocol responses for the page, so an action that triggers one must not wait for completion before the handler runs.",
    k: ["Auto-dismiss by default vs require explicit handling: auto-dismiss prevents hangs and quietly cancels confirmations; explicit handling is safer for destructive actions and adds code.", "One global handler vs per-test handlers: global is concise and surprising when a test expects a dialog that is accepted silently."],
    p: ["A confirm dialog dismissed by default makes a delete action appear to do nothing.", "Registering the listener after the click that opens the dialog leaves the page frozen until timeout."],
    v: "Trigger a confirm that deletes an item. With a handler that accepts, the item disappears; with a handler that dismisses, it remains, and the dialog message text is captured by the test.",
    dep: ["domains-and-events", "explicit-waits", "pages-and-targets"]
  },
  "screenshots": {
    s: "Capturing the rendered page, an element or the full scrollable height as an image, using the browser's compositor rather than the operating system's screen.",
    d: "A screenshot command asks the engine to render a region into an encoded image. Options cover full page by stitching or resizing the viewport, clipping to an element, transparent backgrounds and masking dynamic regions. Capture occurs after fonts and images settle, optionally with animations disabled. Output is deterministic only if rendering inputs are: fonts, anti-aliasing, device scale factor and GPU or software rasterization all change pixels. Full-page capture is difficult on pages with sticky elements and lazy images.",
    k: ["Full-page capture vs viewport only: full-page shows everything and is slower and breaks on sticky or virtualized layouts; viewport captures are cheap and predictable.", "Capture on failure only vs on every step: failures-only saves space; every step gives a timeline and storage cost."],
    p: ["Taking the shot before web fonts load records fallback fonts, producing diffs unrelated to any change.", "Full-page shots of pages with fixed headers repeat the header or leave gaps."],
    v: "Capture the same page ten times in one environment and compare the files by hash. They should match exactly, and a one-pixel layout change in a fixture should alter the image.",
    dep: ["debugging-protocol", "animation-stability", "viewport-and-pixel-ratio"]
  },
  "video-recording": {
    s: "Recording the page as a video during a test, so a failure can be watched as the browser saw it, including timing and transitions that stills miss.",
    d: "The engine streams screencast frames, either on every repaint or at a sampled rate, and the framework encodes them into a video file per page. Recording runs alongside the test and finalizes when the page closes, so a crash can truncate the file. Videos cost CPU and disk and can slow the very timing under investigation. A common policy records everything locally and keeps files only for failures, or records only on retry.",
    k: ["Video for all tests vs failures and retries only: all tests give complete history and heavy storage; retry-only is cheap and misses first-run detail.", "High frame rate vs low: high shows brief flickers and costs CPU that can change timing; low is cheap and misses short transitions."],
    p: ["The file is not finalized until the page closes, so reading it from an afterEach hook before closing yields a corrupt video.", "Recording overhead makes a borderline race pass or fail differently than in production runs."],
    v: "Fail a test on purpose after a 1 second animation. The saved video must open, show the animation, and its length must match the test's duration within a second.",
    dep: ["domains-and-events", "artifact-collection", "resource-limits"]
  },
  "trace-recording": {
    s: "A combined timeline of actions, DOM snapshots, network requests, console messages and screenshots, saved per test so a failure can be replayed and inspected step by step.",
    d: "A trace records each API call with its arguments and timing, takes before and after DOM snapshots, screenshots at intervals, network entries and console output, and bundles them into one archive. A viewer lets an engineer step through, inspect the page at each moment and see which locator matched. Tracing is the most useful artifact in remote CI, where nobody can watch the browser. Its cost is size and a slight slowdown, so it is often enabled only on the first retry.",
    k: ["Trace everything vs on retry: tracing everything gives certainty and storage cost; on retry keeps it light and hides failures that never repeat.", "Snapshots of live DOM vs screenshots alone: snapshots are inspectable and larger; screenshots are small and cannot be queried."],
    p: ["Traces include request headers and bodies, so credentials end up in archives uploaded to shared storage.", "The trace file is written when the context closes; a killed worker leaves no trace at all."],
    v: "Make a test fail on a wrong locator. Open the trace and confirm it shows the failing step, a DOM snapshot before it, the network requests around it, and the console messages.",
    dep: ["dom-snapshots", "har-recording", "console-and-error-capture", "screenshots"]
  },
  "console-and-error-capture": {
    s: "Collecting the page's console output, uncaught exceptions, failed requests and crash events, and turning chosen ones into test failures.",
    d: "The framework subscribes to protocol events for console messages, page errors, request failures and renderer crashes, and exposes them as listeners. A strict test fails on any unexpected error-level message or uncaught exception; a lenient test only logs. Messages include source location and arguments. The problem is noise: third-party scripts log warnings and fail requests, so an allowlist of known errors is needed, and it needs maintenance so that new real errors stay visible.",
    k: ["Failing on any console error vs logging only: failing catches real regressions early and punishes third-party noise; logging avoids false failures and lets defects slide.", "Allowlist by message text vs by source URL: text is precise and brittle to wording changes; URL is broad and hides new errors from the same source."],
    p: ["Listener registered after page creation misses errors thrown during the initial load.", "Serializing large console arguments across the protocol slows pages that log heavily."],
    v: "Load a page that throws an uncaught error during startup. The test must fail with the message and source line, and adding the message to the allowlist must make it pass.",
    dep: ["domains-and-events", "debugging-protocol", "third-party-noise"]
  },
  "dom-snapshots": {
    s: "Serialized copies of the page's structure and styles taken at moments in a run, so the page can be inspected later without the original browser.",
    d: "A snapshotter walks the document, inlines or references stylesheets and resources, and records enough to rebuild the visual page offline: structure, computed styles, shadow trees and frame contents. The result is viewed in a sandboxed frame. Some frameworks also produce text outlines from the accessibility tree for assertions and for agents. Snapshots can be large, and they cannot capture canvas drawings, video or cross-origin frames faithfully, so a replay may differ from what the browser showed.",
    k: ["Full snapshots at each action vs diffs: full snapshots are simple and big; diffs are compact and fragile to reconstruct.", "Inlining resources vs referencing recorded network entries: inlining is self-contained and heavy; referencing is light and breaks if the recorded data is missing."],
    p: ["Snapshot taken mid-animation shows an intermediate state that never appeared to the user.", "Sensitive page content such as tokens in inputs is captured and stored in the archive."],
    v: "Take a snapshot of a page with a shadow root, an iframe and a canvas, reopen it offline, and confirm the structure and styles match, with the canvas flagged as not captured.",
    dep: ["frame-tree", "accessibility-tree-queries", "debugging-protocol"]
  },
  "visual-comparison": {
    s: "Comparing a new screenshot against an approved baseline image, with tolerance and masking, to detect unintended visual changes.",
    d: "The framework renders the page or element, loads the stored baseline for that test and platform, computes a pixel or perceptual difference and fails above a threshold, writing the actual, expected and diff images. Tests mask dynamic regions such as timestamps, freeze animations and wait for fonts. Baselines are produced in the same environment they are compared in, since font rendering differs by operating system. Updating baselines is a deliberate commit, and reviewing image diffs is the human cost.",
    k: ["Strict pixel match vs tolerance: strict catches every change and fails on anti-aliasing noise; tolerance reduces noise and lets small real changes pass.", "Baselines per platform vs one canonical environment: per-platform is faithful and multiplies images; one environment, usually a container, keeps a single set."],
    p: ["Baselines generated on a developer's laptop fail in CI because fonts and rasterization differ.", "Blanket acceptance of updated baselines hides regressions in the review noise."],
    v: "Change a button's padding by two pixels in a fixture. The comparison must fail with a diff image showing the button, and an unchanged page must pass ten times in a row in the pinned environment.",
    dep: ["screenshots", "animation-stability", "container-images", "viewport-and-pixel-ratio"]
  },
  "har-recording": {
    s: "Recording all network requests and responses made by a page into a standard archive format with timings, headers and bodies.",
    d: "The framework listens to network events for a context and writes a HAR file: each entry holds request, response, timing phases and optionally content. Archives serve for debugging, performance analysis and as input for later replay. Recording bodies is optional because they can be large or sensitive. Entries for service worker traffic, WebSockets and cached responses are partial or absent. The file is written on context close, which means a crash loses it.",
    k: ["Recording bodies vs metadata only: bodies enable replay and are large and sensitive; metadata is small and shows timing and status only.", "Recording all hosts vs filtered by URL: all is complete and noisy; filtered is lighter and misses calls to unexpected hosts."],
    p: ["HAR files captured with authorization headers and cookies are uploaded as build artifacts and leak secrets.", "Responses served by cache or service worker are missing, so replay shows gaps."],
    v: "Record a page that makes an API call and loads an image. Open the archive and confirm both entries, with status, timing and body for the API call, and that no request was lost.",
    dep: ["request-interception", "security-and-secrets", "domains-and-events"]
  },
  "pdf-rendering": {
    s: "Producing a paginated PDF of a page using the browser's print layout engine, with control of page size, margins, headers and print stylesheets.",
    d: "A PDF command re-lays the page out for print media, applying print stylesheets, page breaks, margins and optional header and footer templates, then serializes pages. Background graphics are opt-in. It works only in the engine's headless or print mode in many browsers. Uses include invoice and report generation. The difficulty is that print layout differs from screen layout: viewport-dependent components, lazy images and fixed positioning behave differently, and fonts must be embedded to match across machines.",
    k: ["Browser rendering to PDF vs a dedicated document library: the browser reuses existing HTML and CSS and gives complete styling; a library offers exact control and requires separate templates.", "Letting the page paginate vs forcing breaks: letting it paginate is simple and splits tables awkwardly; forced breaks look better and need CSS care."],
    p: ["Printing before lazy images load yields blank placeholders in the PDF.", "Print stylesheet hides content the report depends on, so the PDF lacks sections visible on screen."],
    v: "Render a 12-page report and confirm the page count, that headers repeat on each page, that text is selectable, and that every image is present.",
    dep: ["media-emulation", "headless-modes", "debugging-protocol"]
  },
  "browser-contexts": {
    s: "Isolated, lightweight browser profiles inside one browser process, each with its own cookies, storage, cache, permissions and network settings.",
    d: "A browser contains many contexts. The framework creates a context through the protocol, attaches pages to it and disposes it, discarding all its state. Options set per context include viewport, locale, timezone, geolocation, proxy, extra headers and stored credentials. Contexts start in milliseconds and cost far less memory than separate browsers, which makes one per test practical. They are not a security boundary against a malicious page, and a few resources, such as the GPU process and DNS cache, are still shared across contexts.",
    k: ["Context per test vs browser per test: contexts are fast and share a process, so a crash hits all; separate browsers isolate crashes and cost seconds and memory.", "Default context vs explicit contexts: the default is convenient and persists state across scripts; explicit ones make isolation visible."],
    p: ["Creating many contexts without closing them leaks memory until the browser is killed by the operating system.", "Cache and DNS shared across contexts can make a test faster or different than a clean browser would be."],
    v: "Create two contexts, set a cookie in one and confirm the other's pages cannot read it. Close the first and confirm browser memory drops and the second keeps running.",
    dep: ["pages-and-targets", "target-attach", "process-launch"]
  },
  "storage-state": {
    s: "A serializable snapshot of a context's cookies and per-origin storage that can be saved to disk and loaded into a new context to restore a session.",
    d: "Exporting reads cookies and local storage from the context through protocol calls and writes JSON. Importing sets them before any page loads. It captures login sessions, consent choices and onboarding flags, which cuts setup time. It does not capture session storage, in-memory tokens, IndexedDB in some versions or server-bound state such as device registration. Because it contains live credentials, the file needs the same care as a password.",
    k: ["Reusing stored state vs logging in each time: reuse saves seconds per test and shares an identity; fresh login is slow and independent.", "Per-worker state files vs one shared: per-worker supports distinct accounts and more setup; shared is simpler and risks session conflicts."],
    p: ["Storage state excludes session storage, so apps that keep tokens there look logged out after restore.", "A stale state file with expired tokens produces mass failures that appear to be product bugs."],
    v: "Log in, save state, create a fresh context from it and open a protected page. It must load signed in without visiting the login form, and after clearing the file it must redirect to login.",
    dep: ["browser-contexts", "security-and-secrets"]
  },
  "pages-and-targets": {
    s: "The framework's page objects and the browser's underlying targets: tabs, windows, workers and frames that each can be addressed and controlled separately.",
    d: "The browser reports targets through the protocol as they are created and destroyed. The framework wraps page targets in page objects, tracks their lifecycle events, and routes commands to the right session by target id. Pages hold the main frame and child frames, and expose navigation, evaluation, input and capture. Closing a page releases its renderer. Difficulty comes from targets appearing unprompted, such as a popup or a crashed renderer replaced by a new process, which invalidates handles the script still holds.",
    k: ["One page object per target with eager tracking vs lazy attach: eager tracking never misses events and costs attaching to everything; lazy is cheaper and may miss early events.", "Reusing a page across tests vs a new page each time: reuse saves milliseconds; new pages avoid carryover of listeners and navigation history."],
    p: ["Using a page handle after a renderer crash throws target-closed errors that look unrelated to the crash.", "Pages opened by scripts and never closed accumulate and slow the browser."],
    v: "Kill a page's renderer process, then verify the page object emits a crash event, subsequent calls fail with a clear closed-target error, and a new page in the same context works.",
    dep: ["target-attach", "frame-tree", "message-framing"]
  },
  "frame-tree": {
    s: "The hierarchy of documents embedded through frames in a page, each with its own document, origin and script world, and which must be addressed explicitly by locators.",
    d: "Every iframe is a frame with a parent. The framework tracks frame attach, navigate and detach events, and gives each frame its own execution context. Locators can be scoped to a frame so selectors resolve inside it. Same-origin frames share a process with the parent; cross-origin frames may run in separate processes and appear as separate targets, which changes how events and input are routed. Dynamic frames that reload invalidate handles, so frame locators stay lazy.",
    k: ["Frame-scoped locators vs frame handles: scoped locators re-resolve after reloads; handles are direct and go stale.", "Treating out-of-process frames as part of the page vs separate targets: unifying them hides the complexity from scripts and costs the framework more bookkeeping."],
    p: ["A selector that matches inside an iframe fails at the top level and the error says only that the element was not found.", "Frames that navigate during an action invalidate the execution context mid-call."],
    v: "Nest a cross-origin frame in a page, click a button inside it and read text from it through frame-scoped locators, then reload the frame and repeat without code changes.",
    dep: ["execution-contexts", "pages-and-targets", "target-attach"]
  },
  "popups-and-new-tabs": {
    s: "Capturing windows opened by the page, by clicks or scripts, as new page objects the script can wait for and then control.",
    d: "A new window arrives as a new target tied to an opener. The framework emits a popup event with the page object, which may still be at its initial blank URL. Scripts start waiting for the event before the click and then wait for the new page's load state. Links with a target attribute, script-opened windows and OAuth flows all create them. Complexity arises when the popup closes itself, when the flow redirects through several domains, and when the engine blocks popups not triggered by a user gesture.",
    k: ["Handling popups as separate pages vs forcing them into the same tab: separate pages match user behavior; forcing is simpler and changes the product's flow.", "Waiting on the popup event vs polling pages of the context: events are exact; polling catches pages opened without an opener but is racy."],
    p: ["The new page closes before the script attaches handlers, so the test hangs waiting on a closed page.", "Popup blocked because the click was synthesized outside the engine's user gesture rules."],
    v: "Click a link that opens a new tab, capture the popup, assert its URL and title, close it and confirm the original page is still usable and focused.",
    dep: ["pages-and-targets", "explicit-waits", "browser-contexts"]
  },
  "workers-and-service-workers": {
    s: "Background script contexts, dedicated, shared and service workers, that run beside pages and can intercept their network traffic, which the framework exposes and sometimes must bypass.",
    d: "Workers appear as separate targets. The framework can list them, evaluate code in them and observe their lifecycle. A service worker can serve cached responses and rewrite requests, which means network interception at the page level may not see traffic that the worker answers. Options exist to block service workers or to route their requests as well. Registration persists in the profile, so state from a prior run can change behavior unless contexts are fresh.",
    k: ["Blocking service workers in tests vs allowing them: blocking makes mocks work predictably and tests a different app than production; allowing keeps fidelity and complicates interception.", "Inspecting worker targets vs treating them as opaque: inspecting aids debugging; opaque is simpler and leaves cache bugs invisible."],
    p: ["Mocks installed at the page level never fire because a service worker answers from its cache.", "A service worker from an earlier run serves an old app version to a persistent profile."],
    v: "Register a service worker that caches an API response, then mock that endpoint. Confirm whether the mock takes effect with workers allowed and blocked, and that the worker target appears in the target list.",
    dep: ["request-interception", "target-attach", "profile-directories"]
  },
  "execution-contexts": {
    s: "The separate JavaScript worlds within a frame, the page's main world and isolated worlds the framework creates, which determine what script can see and what the page can detect.",
    d: "Each frame has a main world shared with page scripts and may have additional isolated worlds with their own global objects but the same DOM. Framework helpers run in an isolated world so page code cannot observe or tamper with them, and so they do not collide with page globals. Evaluation targets a context id, which is invalidated on navigation. Running in the main world is needed to touch page variables and is visible to the page.",
    k: ["Isolated world vs main world for helpers: isolated worlds avoid collisions and interference and cannot read page variables; the main world sees everything and is detectable.", "Evaluate by context id vs by frame: ids are exact and expire on navigation; frame-based calls re-resolve and cost a lookup."],
    p: ["An evaluation that races with navigation fails with a context-destroyed error.", "Injected helpers in the main world define globals that clash with the page's own libraries."],
    v: "Define a global in the page and read it from both worlds. The main world must see it and the isolated world must not, while both see the same DOM node.",
    dep: ["frame-tree", "debugging-protocol", "script-evaluation"]
  },
  "script-evaluation": {
    s: "Running a function or expression inside the page and returning its result to the script, with arguments passed across the process boundary by value or by handle.",
    d: "The framework serializes a function, sends it with arguments to an execution context and returns a serialized result. Plain data copies by value; DOM nodes and other objects stay in the page and come back as handles that keep them alive. Evaluation can await promises. It is the escape hatch for anything the API lacks, and the foundation of the framework's own injected helpers. The costs are a protocol round trip per call, errors that stringify poorly, and values that cannot cross, such as functions and cyclic structures.",
    k: ["Evaluating in the page vs using API calls: evaluation is flexible and bypasses actionability and waiting; API calls carry checks and are less powerful.", "Returning values vs handles: values are simple and copy; handles avoid copying large objects and keep memory in the page until released."],
    p: ["Closure variables referenced in the function body do not exist in the page, and the error is a reference failure.", "Handles that are never released leak memory in long-running sessions."],
    v: "Evaluate a function that returns a nested object and one that returns a DOM node. The first must arrive as plain data, the second as a handle usable for later calls, and passing a closure variable must fail with a clear error.",
    dep: ["execution-contexts", "debugging-protocol", "message-framing"]
  }
});
