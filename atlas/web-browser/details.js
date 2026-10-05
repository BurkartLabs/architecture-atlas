// Web browser plate, details part 1: browser product, navigation, accessibility.
(function () {
  var D = {};
  function E(id, s, d, k, p, v, dep) { D[id] = { s: s, d: d, k: k, p: p, v: v, dep: dep }; }

  // ---- Browser UI shell ----
  E("tab-and-window-manager",
    "Owns the set of windows and tabs, tracks which tab is active, and maps each tab to a content container hosting a page.",
    "The browser process keeps a model of windows, tab strips, groups and pinned tabs, and each tab owns a web contents object that hosts frames rendered by other processes. The model drives tab creation, drag between windows, restore after a crash and discarding of background tabs. It coordinates with navigation and session history for every tab. The hard parts are focus and ownership: a tab can be moved between windows while a navigation, a download or a permission prompt is still attached to it.",
    ["Model tabs separately from the views that show them: windows can be torn down and rebuilt without destroying page state, but every operation must go through the model.",
     "Restore sessions lazily: reopening hundreds of tabs as placeholders keeps startup fast, but the first click on each one pays a full load."],
    ["Closing a tab while a navigation, dialog or download still references it leaves dangling pointers or prompts attached to nothing.",
     "Treating tab order as identity breaks drag, restore and extensions that cache indices; stable tab ids are needed."],
    "Open a hundred tabs, drag one into a new window while it loads, then kill the browser and restart. The window layout returns, the dragged tab keeps its history, and only the active tab loads immediately.",
    ["navigation-controller", "session-history", "browser-ui-toolkit", "frame-tree"]);

  E("omnibox",
    "A combined address and search field that parses input, ranks suggestions from many sources and decides whether the text is a URL or a query.",
    "The omnibox classifies typed text as a URL, a search or a command, and queries providers in parallel: history, bookmarks, open tabs, a search suggestion service and inline autocomplete. Results are scored and merged while the user types, so latency budgets are tight. On commit it hands a parsed URL to the navigation controller. It also owns the security indicator display and must never let the typed text be confused with the committed origin.",
    ["Query all providers asynchronously and merge by score: suggestions arrive fast and stay fresh, but the list can reorder under the user's cursor.",
     "Send keystrokes to a remote suggestion service only after opt-in: better results cost privacy, since partial queries leak what the user is thinking.",
     "Show a simplified origin instead of the full URL: it resists spoofing with long hostnames, but hides detail some users need."],
    ["Suggestions that reorder just as the user presses Enter send them to the wrong page.",
     "Treating `host:port` or a bare word with a dot as a search or as a URL inconsistently makes some intranet names unreachable.",
     "Rendering IDN hostnames as typed enables homograph spoofing unless mixed-script names show their punycode form."],
    "Type a partial site name and confirm inline completion appears within one frame of each keystroke, Enter on an IP:port navigates rather than searches, and a lookalike mixed-script hostname displays in its encoded form.",
    ["history-store", "bookmarks", "url-and-scheme-handling", "navigation-controller", "security-indicators"]);

  E("bookmarks",
    "A hierarchical store of saved pages with folders, a bar for quick access, search, import and export, and optional sync.",
    "Bookmarks are a tree of folders and URLs with titles, stored in the profile and indexed for the omnibox. Changes are applied in the browser process, persisted atomically and sent to sync as individual entity changes. Import reads exported files or other browsers' data through a utility process. The tricky parts are merge semantics when two devices edit the same folder, preserving order, and handling very large trees without blocking the interface.",
    ["Store as a tree of ids with stable parents: moves are cheap and sync can express them, but a folder deleted on one device while edited on another needs an explicit merge rule.",
     "Parse imported files in a sandboxed utility process: untrusted HTML or database formats never touch the privileged process, at the cost of an extra IPC round trip."],
    ["Writing the whole file on every change corrupts the store if the browser is killed mid-write; use atomic replace or a database.",
     "Syncing the folder order as a single list creates conflicts on every concurrent edit."],
    "Add, move and delete bookmarks on two signed-in devices at once, then force a sync. Both converge to the same tree, and killing the browser during a write leaves a loadable file.",
    ["profile-data-store", "accounts-and-sync", "omnibox"]);

  E("history-store",
    "Records visited URLs with titles, visit times and transitions, and serves them to the omnibox, the history page and link coloring.",
    "A database in the profile keeps visits keyed by URL, with visit counts, typed counts, last visit and the transition type such as typed, link or redirect. The omnibox and new-tab surfaces read it to rank suggestions; link visited state is derived from it. Entries expire or can be cleared by time range and site. Writes are batched on a background thread so navigation never waits on disk. Privacy modes bypass it entirely.",
    ["Batch writes on a dedicated sequence: commits do not stall navigation, but a crash can lose the last seconds of history.",
     "Expose visited-link state to pages only through partitioned, coarse lookups: classic link coloring is a history-sniffing channel, so the cost is a less exact :visited feature."],
    ["Letting a page read :visited styling directly through getComputedStyle reveals the user's browsing history to any site.",
     "Clearing history but not the derived caches (favicons, suggestions, thumbnails) leaves the visits recoverable."],
    "Visit a page, clear the last hour of history, then type the site name in the address bar. No suggestion appears, and the visited link color on a test page is the unvisited color.",
    ["profile-data-store", "navigation-controller", "storage-partitioning"]);

  E("download-manager",
    "Streams response bodies to disk, tracks progress and resumption, and decides whether a file is safe to save and open.",
    "A navigation or user action that yields an attachment or unrenderable type becomes a download item. The network process streams the body to a temporary file; the manager shows progress, supports pause and resume with range requests, renames to the final path and records the origin for later warnings. Before completion the file goes through safe browsing checks and the operating system's quarantine marking. Filename handling and the dangerous-type list are security surfaces.",
    ["Download to a temporary name and rename on completion: partial files never look finished, but disk space is held until the user acts.",
     "Warn by file type and reputation instead of blocking: users keep control, but warning fatigue trains them to click through."],
    ["Trusting the filename or content type from the server allows path traversal or executable disguised as a document.",
     "Resuming a download without validating the entity tag can splice two different file versions together."],
    "Start a large download, kill the network, then resume. The final file hash matches the server's. A file served with a double extension is flagged and a path traversal name is sanitized.",
    ["resource-loader", "safe-browsing", "profile-data-store", "utility-processes"]);

  E("settings-and-policies",
    "A settings interface backed by a typed preferences store, with enterprise policies that can force or lock values.",
    "Settings pages are web content running with extra privileges, reading and writing a preferences tree in the browser process. Each preference has a type, default, and a source: user, extension, managed policy or command line. Policies override user values and may hide the control entirely. Changes notify observers across components and processes. The design problem is precedence among sources and keeping the privileged settings page from becoming an attack surface.",
    ["Resolve each preference through ordered sources with policy on top: administrators get real enforcement, but users need an explanation of why a control is locked.",
     "Build settings as privileged web pages: one UI toolkit and fast iteration, but the page needs a strict content security policy and its own process."],
    ["Letting an extension or page write a preference that the settings page then displays as the user's choice hides hijacked defaults.",
     "Reading preferences synchronously in the renderer on startup ties page load to disk speed."],
    "Set a managed policy that locks the home page, then open settings. The control is disabled with a managed indicator, the preference reads back the policy value, and an extension write to it is rejected.",
    ["profile-data-store", "browser-ui-toolkit", "extension-permissions"]);

  E("passwords-and-autofill",
    "Detects forms, offers saved credentials and addresses, and fills them only for the right origin.",
    "A renderer-side agent finds login, address and payment fields and sends form structure to the browser process, which matches it against an encrypted credential store using the origin. It offers a fill on user gesture, observes submission to propose saving, and can flag reused or breached passwords. Heuristics and server-provided hints classify fields. Filling must be resistant to scripts that read or spoof form values, and cross-origin frames need explicit rules.",
    ["Fill only after a user gesture and into the matching origin: a malicious script cannot harvest credentials silently, but some legitimate single-page logins need extra heuristics.",
     "Encrypt the store with a key held by the operating system's secure storage: stolen profile files are useless on their own, but keys tie data to one user account."],
    ["Auto-filling into invisible fields or cross-origin frames lets a page capture credentials the user never saw.",
     "Classifying fields only by name breaks on obfuscated or localized forms, so saving silently fails."],
    "On a test page with a hidden credential field and an embedded cross-origin frame, request a fill. Only the visible same-origin fields populate, and submitting offers to save under the correct origin.",
    ["profile-data-store", "browser-ui-toolkit", "same-origin-policy"]);

  E("browser-ui-toolkit",
    "The framework that draws and lays out the browser's own windows, menus, dialogs and controls across operating systems.",
    "The browser chrome is built from a cross-platform view toolkit, or from privileged web pages, painted through the same compositor and graphics path as content. It handles layout, theming, high-density displays, right-to-left languages, native menus and window frames, and delegates input to native event sources. The toolkit must keep drawing while a page is busy, so it runs on the browser process's main thread and must never wait on renderers.",
    ["Use one in-house toolkit across platforms: consistent behavior and shared code, but native integration (menus, text input, window frames) needs per-platform adapters.",
     "Implement secondary surfaces such as settings and the new-tab page as web content: faster to build, but they need a separate trust level."],
    ["Calling into a renderer synchronously from the UI thread freezes the whole browser when a page hangs.",
     "Hard-coded sizes and string lengths break in other languages and at high zoom or display scaling."],
    "Hang a page with an infinite loop and confirm the tab strip, menus and address bar still respond. Switch to a right-to-left locale and 200 percent scaling and confirm no clipped controls.",
    ["native-windowing", "graphics-backend", "task-scheduler"]);

  // ---- Accounts, updates & telemetry ----
  E("accounts-and-sync",
    "Signs the user into an account and replicates bookmarks, passwords, history and settings across devices using encrypted, incremental updates.",
    "A sync engine tracks local changes per data type, uploads them with a progress token and applies remote changes through type-specific bridges. Conflicts resolve per entity, usually last writer wins, with special handling for ordered lists. Sensitive types can be end-to-end encrypted with a user-held passphrase. The engine runs in a background sequence, retries with backoff and throttles per type. The difficulty is correctness over flaky networks and schema evolution across browser versions.",
    ["Sync per data type with its own bridge: failures stay isolated, but each type needs conflict rules, and adding one means a protocol and schema change.",
     "Offer client-side encryption with a user passphrase: the server cannot read data, but a lost passphrase makes it unrecoverable."],
    ["Applying a remote deletion without tombstones resurrects deleted data from a stale device.",
     "Syncing an unknown newer-version field and dropping it on write erases data the other device wrote."],
    "Edit the same bookmark folder on two devices offline, reconnect both, and confirm they converge with no duplicates. Sign out, and confirm local data stays while the sync cache is cleared.",
    ["bookmarks", "passwords-and-autofill", "history-store", "profile-data-store", "tls-stack"]);

  E("auto-updater",
    "Downloads signed updates in the background and swaps in the new version, restarting processes without losing the user's session.",
    "An updater service polls or receives a push for a new version, downloads a differential or full package, verifies the signature and stages it beside the running copy. On the next launch or an explicit restart, the browser switches versions and restores tabs. Rollout is staged by percentage and can be halted. Running processes from the old version must not mix with new binaries, so child processes check version compatibility at startup.",
    ["Stage the update next to the running version and switch on restart: the running copy never changes underneath itself, at the cost of double disk use.",
     "Roll out gradually with a kill switch: regressions hit few users, but fixing a security flaw takes days to reach everyone."],
    ["A new child process launched from an updated binary tree while the old parent runs causes version mismatch crashes.",
     "Skipping signature or integrity checks on the update package turns the updater into a code-execution channel."],
    "Stage an update while the browser is running, open a new tab, and confirm it still works. Restart: the version number increases and tabs return. A package with a bad signature is rejected.",
    ["task-scheduler", "platform-abstraction", "field-trials-and-metrics"]);

  E("crash-reporter",
    "Catches crashes in any process, writes a minidump and uploads it, with consent, so engineers can find the faulting code.",
    "Each process installs a crash handler that writes a minimal dump with a stack, module list and a few annotations such as version and process type. A separate uploader sends it with metadata when the user has consented. The browser notices a child exiting abnormally and shows a crash page for the tab. Server-side aggregation groups dumps by stack signature. Handlers must work when the heap is corrupted, so they avoid allocation.",
    ["Write the dump from an out-of-process handler: it survives heap corruption in the crashing process, but costs another process on every platform.",
     "Attach few annotations and never page contents: the reports stay privacy-safe, at the price of harder reproduction."],
    ["Including URLs or form data in a dump leaks user content to the vendor.",
     "A handler that allocates memory or takes locks deadlocks exactly in the crash cases it was meant to record."],
    "Trigger a deliberate null dereference in a renderer. The tab shows a crash page, the rest of the browser keeps running, and a dump with version, process type and symbolizable stack is queued for upload.",
    ["renderer-process", "browser-process", "field-trials-and-metrics"]);

  E("field-trials-and-metrics",
    "Assigns users to experiment groups, toggles features remotely and records aggregate usage and performance measurements.",
    "A field trial system deterministically maps a client to experiment groups using a seed delivered by a config service, and exposes the result as feature flags and parameters. Metrics libraries record histograms and counters, tagged with active groups, and upload aggregated data on a schedule. This lets engineers ramp changes gradually, measure real-world performance and disable a bad feature without shipping. Stable assignment and low overhead matter more than detailed data.",
    ["Deliver flags from a signed server config with local defaults: features can be disabled in hours, but the browser must run correctly when the config is stale or missing.",
     "Record aggregated histograms rather than individual events: uploads are small and anonymous, but you cannot answer questions the buckets did not anticipate."],
    ["Exposing a new experiment's group to pages creates a fingerprinting signal.",
     "Metrics code on a hot path, such as per-frame recording with locks, becomes the performance regression it was supposed to detect."],
    "Enable a feature for ten percent of a test population and confirm the same client always lands in the same group across restarts, and that flipping the server flag disables it without a new build.",
    ["tracing-and-metrics", "profile-data-store", "tls-stack"]);

  // ---- Extensions ----
  E("extension-loader",
    "Parses an extension package and manifest, validates it, installs it into the profile and starts its background context.",
    "An extension is a signed package with a manifest declaring its scripts, pages, permissions and the sites it can touch. The loader verifies the package, stores it, registers its resources and declarative rules, and starts a background worker on events. Updates are fetched from a store and applied in place. Extensions have their own origin and a privileged API surface, so the loader decides which process hosts each extension context and how it is kept isolated from pages.",
    ["Use an event-driven background worker instead of a persistent page: far less memory per extension, but state must survive being stopped and restarted.",
     "Declare permissions up front in the manifest: users and reviewers can see capability before install, but extensions then ask for broad access out of caution."],
    ["Loading an unpacked or sideloaded extension without integrity checks lets malware persist silently in the profile.",
     "Keeping per-event state in memory in a worker loses it when the worker is stopped between events."],
    "Install a test extension, let its worker go idle until it is stopped, then fire an event. The worker restarts and handles it, and uninstalling removes its storage and registered rules.",
    ["extension-permissions", "extension-apis", "profile-data-store", "utility-processes"]);

  E("extension-apis",
    "Privileged browser APIs and content scripts that let extensions observe tabs, rewrite requests and run code inside pages.",
    "Extension APIs expose tabs, windows, storage, alarms, messaging and request interception to extension code through bindings checked against the manifest's permissions. Content scripts run in an isolated world inside a page's renderer: they share the DOM but not the page's JavaScript objects. Declarative request rules let the network process modify requests without extension code in the loop. Calls cross from the extension's process to the browser process and are validated there.",
    ["Run content scripts in isolated worlds: page script cannot tamper with extension objects, but both can race on shared DOM state.",
     "Prefer declarative request rules over blocking request callbacks: network speed is preserved and extensions cannot read every request, but expressiveness is limited."],
    ["Trusting messages from content scripts in the browser process lets a compromised page act with extension privileges.",
     "Injecting scripts into the page's own world exposes extension logic and privileges to the page."],
    "Run a content script that reads a page's DOM and attempts to read a page-defined global. The DOM read works, the global is undefined, and a call to an API without the manifest permission is rejected.",
    ["extension-loader", "extension-permissions", "renderer-process", "ipc-channel", "web-idl-bindings"]);

  E("extension-permissions",
    "Maps manifest permissions and host patterns to what an extension may do, and prompts the user when capabilities are added.",
    "Permissions are split into API permissions and host permissions matched against page origins. The browser process enforces them on every API call, and the network process applies them to request modification. Optional permissions can be requested at runtime on a user gesture, and updates that widen access disable the extension until approved. Enterprise policy can force or block installs. The weakest point is over-broad host access, which turns every extension into a potential cross-site data thief.",
    ["Request broad host access up front or optional access on demand: install is simpler with the former, but on-demand gives users per-site control at the cost of more prompts.",
     "Disable an extension when an update adds permissions: users keep control, but updates stall until they respond."],
    ["Enforcing permissions only in the renderer lets a compromised extension process call any API; checks belong in the privileged process.",
     "Matching host patterns on a URL string rather than a parsed origin can be fooled by userinfo or trailing dots."],
    "Update a test extension to add a host permission. It is disabled with a prompt until approved, and before approval its attempt to inject a script into the new host fails in the browser process.",
    ["extension-loader", "settings-and-policies", "browser-process"]);

  // ---- Developer tools ----
  E("devtools-frontend",
    "The inspector interface, itself a web application, with panels for elements, console, sources, network and performance.",
    "DevTools is a single-page web application loaded from bundled resources and connected to the inspected page through the debugging protocol. It can be docked, undocked or run against a remote target. Panels subscribe to protocol domains and render live data: trees, timelines, memory snapshots. It needs its own process and privileges, and must be isolated so that the inspected page cannot influence it. Large traces test its rendering performance.",
    ["Build the front end as a web app speaking the public protocol: any client can replace it, but features cannot depend on private hooks.",
     "Keep the inspector in a separate process from the inspected page: a hung or hostile page cannot freeze the tools, at the cost of protocol round trips for each interaction."],
    ["Rendering a million-row network or trace view without virtualization freezes the tools and distorts the measurement.",
     "Trusting data from the inspected page, such as console strings, as HTML enables script injection into the privileged tool."],
    "Open the tools on a page that logs heavy objects and has an infinite loop elsewhere. The panels remain responsive, console HTML is escaped, and closing the tools restores page behavior.",
    ["devtools-protocol", "dom-and-style-inspector", "script-debugger", "performance-tracing"]);

  E("devtools-protocol",
    "A message protocol for inspecting and controlling pages, used by the built-in tools, remote devices and test automation.",
    "The protocol is a set of domains such as DOM, network, debugger and page, each with commands, events and typed parameters, carried as JSON over a pipe or socket. A router in the browser process forwards sessions to agents living in the renderer, network or other processes. Remote debugging exposes it over a local port or device connection, so it needs authentication and origin checks. Versioning matters because third-party tooling depends on it.",
    ["Use one flat command and event schema for all clients: tools and automation share the interface, but any change must stay backward compatible.",
     "Route sessions through the browser process to per-target agents: one connection can drive many pages, but each message crosses processes."],
    ["Exposing the remote debugging port without authentication or origin checks gives any local or web page full control of the browser.",
     "Agents that hold references to destroyed targets crash or leak when a tab closes mid-session."],
    "Attach a protocol client to a page, evaluate an expression and subscribe to network events. Results arrive in order. A web page that tries to connect to the debugging port is refused.",
    ["browser-process", "ipc-channel", "renderer-process"]);

  E("dom-and-style-inspector",
    "Shows the live DOM, matched style rules and computed layout boxes, and lets developers edit them in place.",
    "The inspector asks the renderer for the node tree and, for a selected node, the cascade of matched rules, computed values and box geometry. Edits patch the live DOM or stylesheet and trigger a normal style and layout pass. It highlights nodes by drawing an overlay that does not affect layout. It needs stable node identities across mutations and must represent shadow trees, pseudo-elements and inherited values without changing what it measures.",
    ["Edit the live tree through the normal mutation paths: results match real behavior, but the inspector can itself trigger observers and page logic.",
     "Draw highlights as a separate overlay layer: layout and paint are untouched, but overlays need a coordinate mapping through transforms and scrolling."],
    ["Using the inspector's own style queries can force synchronous layout and hide the performance problem being investigated.",
     "Node ids that are not stable across removal and re-insertion break the selection mid-edit."],
    "Select an element, change its width in the styles pane, and confirm the page reflows with a single layout. The highlight overlay aligns with a rotated, scrolled element.",
    ["dom-tree", "css-and-style", "layout", "devtools-protocol"]);

  E("script-debugger",
    "Pauses script at breakpoints, steps through code, inspects scopes and maps minified code back to source files.",
    "The debugger agent talks to the script engine through an inspector interface: set breakpoints on source positions, pause on exceptions, step by statement, evaluate expressions in a paused frame and pause workers separately. Optimized code must be deoptimized to the interpreter to show faithful frames. Source maps connect generated code to authored files. Pausing a renderer also freezes its event loop, so the tools must run elsewhere.",
    ["Deoptimize on pause: frames and variables are exact, but the debugged program runs slower and may behave differently than at full speed.",
     "Resolve breakpoints by source position at compile time: they survive reloads, but lazily compiled functions need breakpoint fix-ups when they first compile."],
    ["Evaluating expressions with side effects in a paused frame alters the state being debugged.",
     "Stale or wrong source maps place breakpoints on lines that never run."],
    "Set a breakpoint inside a hot loop already optimized by the JIT. Execution pauses, local variables show correct values, and stepping continues without changing the program output.",
    ["devtools-protocol", "bytecode-interpreter", "jit-tiers", "web-workers"]);

  E("performance-tracing",
    "Records timelines of script, style, layout, paint and network activity so developers can find what blocks the main thread.",
    "Tracing collects timestamped events from instrumented points across threads and processes into a trace buffer, which the tools render as a flame chart and frame timeline. It samples the script stack, records long tasks and frame timing, and can capture screenshots and memory over time. Overhead must stay small enough not to change timing. Merging clocks across processes and attributing work to a page are the main difficulties.",
    ["Instrument with cheap event macros and sampling: overhead stays low enough for production-like timing, but short events can be missed.",
     "Use a unified trace across processes: one timeline shows main thread, compositor and GPU together, at the cost of clock synchronization and large buffers."],
    ["A trace buffer that fills and wraps silently drops the beginning of the interesting period.",
     "Profiling with the tools open and extensions enabled attributes their work to the page."],
    "Record a trace of a janky scroll. The timeline shows main-thread tasks, compositor frames and the GPU work aligned, and a long task is attributed to a specific script function.",
    ["tracing-and-metrics", "frame-scheduler", "event-loop", "devtools-protocol"]);

  // ---- Navigation & session ----
  E("navigation-controller",
    "Orchestrates a navigation from request to committed document: decides which process loads it, runs checks, fetches and commits.",
    "A navigation request starts in the browser process, which parses the URL, checks policy, chooses the site instance and process, starts the network request, and waits for response headers. Only when headers arrive and checks pass does it commit: it hands the response stream to the target renderer, which creates the document. Cancellation, redirects, downloads and error pages are all outcomes. The key property is that the browser decides, not the renderer, before any content is trusted.",
    ["Decide the target process in the browser before the response is parsed: security and isolation are enforced early, but cross-process commits add latency to each navigation.",
     "Commit only after response headers: the old page stays alive and responsive until then, but a slow server leaves the user with no visible progress unless the UI shows it."],
    ["Letting a renderer commit a URL the browser did not authorize allows spoofing and cross-site confusion.",
     "Forgetting to cancel an old navigation when a new one starts leaves two loads racing to commit."],
    "Click a link, then click another before the first responds. Only the second commits, the first request is cancelled, and a link to an attachment starts a download without replacing the current page.",
    ["frame-tree", "navigation-throttles", "resource-loader", "process-allocation", "session-history", "url-and-scheme-handling"]);

  E("session-history",
    "The ordered list of entries per tab behind back and forward, with scroll position, form state and serialized frame state.",
    "Each tab keeps a list of navigation entries with the URL, title, referrer, a per-frame state blob and the scroll offset. Back and forward replay entries, loading from cache when allowed. Same-document changes through the history API add entries without a document load. Subframe navigations add nested entries, and the model must reconcile them. Entries persist across restarts for session restore, so the format must be versioned.",
    ["Tie entries to documents, with frame state per entry: back restores scroll and form data, but subframe navigation makes the model complex and error-prone.",
     "Serialize entries to disk for restore: crash recovery works, but old browser versions must still be able to read them."],
    ["Entries that store POST bodies replay unsafe resubmissions silently on back or restore.",
     "Pruning after navigating from the middle of the list but forgetting pending entries leaves ghost forward targets."],
    "Navigate through pages with form input, scroll and a same-document state change, then go back and forward. Scroll and form values return, and the entry count matches expectations across a restart.",
    ["navigation-controller", "frame-tree", "back-forward-cache", "profile-data-store"]);

  E("url-and-scheme-handling",
    "Parses URLs per the web standard and dispatches schemes to loaders, external handlers or blocked-by-default paths.",
    "A URL parser implements the standard algorithm, including percent-encoding, IDN conversion and special schemes, and produces an origin used by every security check. Scheme handlers route http and https to the network service, file to a restricted loader, blob and data to in-memory sources, and unknown schemes to the operating system with a prompt. Parsing disagreements between components are a source of bypasses, so one shared implementation is used everywhere.",
    ["Use one parser in all processes and languages: origin checks agree, but any divergence from other implementations must be handled as a compatibility fix.",
     "Prompt before launching external protocol handlers: users stay in control, but repeated prompts invite abuse and fatigue."],
    ["Parsing a URL differently in the address bar and the network layer lets a crafted URL display one host and load another.",
     "Launching external handlers without a user gesture lets pages start arbitrary applications."],
    "Feed a corpus of tricky URLs (userinfo, backslashes, dotted IPs, mixed-script hosts) to the parser and compare the host and origin to the standard's test vectors. All match, and an unknown scheme prompts.",
    ["same-origin-policy", "resource-loader", "omnibox"]);

  E("navigation-throttles",
    "Checkpoints during a navigation that can defer, redirect or cancel it: safe browsing, CSP, extensions, policies and error handling.",
    "During a navigation, registered throttles are consulted at request start, on each redirect, and on response. They implement blocklists, enterprise rules, mixed content blocking, HTTPS upgrades, extension request rules and certificate error interstitials. A throttle can proceed, defer asynchronously, cancel or replace the response with an error page. They keep policy logic out of the controller, but ordering and latency matter since each can delay the page.",
    ["Model policy as ordered, asynchronous checks: components stay independent and testable, but the combined delay adds to every navigation and order can change outcomes.",
     "Check again on every redirect hop, not just the first URL: bypass by redirect is blocked, at the cost of more checks."],
    ["Checking only the initial URL lets a redirect chain land on a blocked destination.",
     "A throttle that defers forever without a timeout leaves the tab loading indefinitely."],
    "Navigate to a URL that redirects twice, the last hop pointing at a blocklisted site. The navigation stops at the last hop with an interstitial, and the intermediate hops appear in the redirect chain.",
    ["navigation-controller", "safe-browsing", "content-security-policy", "certificate-validation", "extension-apis"]);

  E("prefetch-and-prerender",
    "Loads likely next pages ahead of time, either just the resources or an entire hidden page, to make navigation feel instant.",
    "Prefetch fetches a document or subresources into a short-lived cache; prerender builds the full page in a hidden context and activates it on navigation, with script and layout already done. Triggers come from speculation rules, hints on links and the omnibox. Prerendered pages must defer APIs that need user presence, use no more credentials than a normal navigation would, and be discarded if state changes. Cost and privacy trade off against speed.",
    ["Prerender only on strong signals: activation is instant when right, but wrong guesses waste bandwidth, battery and may leak the user's interest to the target.",
     "Defer sensitive APIs until activation: the hidden page cannot spy, but sites must handle a page that starts life already loaded."],
    ["Prerendering pages that change state on load (analytics, one-time tokens) corrupts counts or consumes links.",
     "Sharing cookies with a prerender before the user commits to the navigation can link sites the user never visited."],
    "Add a speculation rule for a link and hover it. Navigating activates the prerendered page with first paint at activation time near zero, and a page that is not eligible falls back to a normal load.",
    ["navigation-controller", "http-cache", "frame-tree", "page-lifecycle"]);

  E("back-forward-cache",
    "Keeps a whole previous page frozen in memory when the user navigates away, so back and forward restore it instantly.",
    "When leaving a page, the browser may freeze the entire frame tree with its script heap, DOM and timers rather than destroy it. Back then reactivates it with no load. Eligibility is strict: pages with open connections, certain APIs, unload handlers or pending requests are excluded. Frozen pages hold memory, so they are capped in number and age and are evicted on pressure or when cookies change in sensitive ways.",
    ["Freeze rather than destroy on navigation: back is instant and exact, but memory use rises and pages must tolerate suspension and resume.",
     "Keep an eligibility blocklist of APIs: broken pages are avoided, but any new API must declare whether it blocks caching."],
    ["Pages using an unload handler, open sockets or locks are silently ineligible, so developers do not learn why back is slow.",
     "Restoring a frozen page with stale auth state shows data after the user has logged out."],
    "Navigate from an eligible page to another and press back. The page restores without a network request, scroll and script state intact, and a page with an unload handler reloads instead.",
    ["session-history", "frame-tree", "page-lifecycle", "memory-pressure"]);

  E("frame-tree",
    "The tree of frames in a page, each tied to a site instance and process, which allows cross-site iframes to live in different processes.",
    "A page is a tree of frames. The browser process keeps a mirror of this tree with each frame's origin and its owning process. Frames from different sites are rendered out of process; the parent holds a proxy for the child and events, focus and messages are routed through the browser. Site instances group frames that may script each other. Navigations in one frame can change its process without disturbing others. This structure underlies site isolation.",
    ["Mirror the frame tree in the browser process: the browser can route input and enforce isolation, but every frame lifecycle event must be replicated across processes.",
     "Group frames into site instances by relatedness: same-site frames share a heap for script access, but unrelated windows from the same site may still share a process by policy."],
    ["Routing input or focus to the wrong process after a cross-process frame navigation sends key events to a stale frame.",
     "Out-of-process iframes break features that assumed synchronous access to frame content, such as printing and find."],
    "Embed a cross-site frame in a page and inspect processes. The frame lives in a separate process, a click inside it reaches the child, and the parent's script cannot read the frame's document.",
    ["site-isolation", "process-allocation", "renderer-process", "ipc-channel", "same-origin-policy"]);

  E("page-lifecycle",
    "Manages whether a page is active, hidden, frozen or discarded, so background tabs use little CPU and memory.",
    "Tabs move through states: visible, hidden, frozen (timers and tasks paused) and discarded (renderer destroyed, entry kept). The browser throttles timers and rendering for hidden pages, freezes long-idle ones and discards under memory pressure, choosing victims by recency, audio, user interaction and unsaved form state. Pages receive visibility and lifecycle events to save state. A discarded tab reloads on demand, so correctness depends on pages restoring state.",
    ["Discard background tabs under pressure: the browser avoids being killed by the OS, but a discarded tab reloads and may lose unsaved state.",
     "Throttle hidden pages' timers heavily: battery use falls, but background pages that rely on precise timing, such as chat or sync, can break."],
    ["Discarding a tab that is playing audio, in a call or holding unsaved form data frustrates users and loses work.",
     "Freezing a page without notifying it leaves held locks or open connections that never get released."],
    "Open many tabs under constrained memory. Background idle tabs discard first, a tab playing audio is spared, and clicking a discarded tab reloads it with the same URL and scroll.",
    ["memory-pressure", "renderer-process", "back-forward-cache", "event-loop", "tab-and-window-manager"]);

  // ---- Accessibility, find & documents ----
  E("accessibility-tree",
    "A parallel tree of roles, names, states and relationships derived from the DOM and layout, for assistive technology.",
    "The renderer computes an accessibility tree from DOM semantics, ARIA attributes and layout results: roles, accessible names, values, states and geometry. Changes are serialized as incremental updates and sent to the browser process, which exposes them through platform bridges. It is built only when an assistive technology is detected, because it adds cost. Correctness depends on shadow trees, iframes across processes and dynamic content updating without losing the user's position.",
    ["Build the tree lazily when assistive technology connects: ordinary users pay nothing, but first activation must catch up on a large page without stalling.",
     "Send incremental updates, not whole trees: dynamic pages stay responsive, but ordering and dropped updates can desynchronize the client's view."],
    ["Updates for nodes already removed from the tree crash the consumer or leave stale elements for screen readers.",
     "Cross-process frames need their subtrees stitched into one tree or navigation skips them."],
    "Turn on a screen reader on a page with a dialog, live region and cross-site iframe. Roles and names are announced, updates to the live region are spoken, and navigation moves into the iframe.",
    ["dom-tree", "layout", "platform-a11y-bridge", "frame-tree", "css-and-style"]);

  E("platform-a11y-bridge",
    "Translates the accessibility tree into each operating system's accessibility interfaces and delivers events to assistive tools.",
    "A platform bridge in the browser process wraps accessibility nodes in native objects implementing the interfaces screen readers, magnifiers and voice control expect, and fires native events for focus, value and structure changes. Actions such as click or scroll come back and are routed to the renderer. Each operating system has different semantics for text ranges, tables and live regions, so mappings are numerous and fiddly. The bridge also detects when assistive tools are running.",
    ["Write one bridge per platform over a shared tree: each reads native, but behavior differences must be tested against real assistive tools.",
     "Answer queries from a cached snapshot in the browser process: native calls are fast and do not block on the renderer, but data can lag the page."],
    ["Making synchronous round trips to the renderer from native calls hangs the assistive tool when the page is busy.",
     "Mapping ARIA roles inconsistently between platforms yields controls announced differently across systems."],
    "Navigate a form with the platform's screen reader. Labels, required state and errors are announced, a spoken action presses a button, and a hung page does not freeze the reader.",
    ["accessibility-tree", "browser-process", "native-windowing"]);

  E("keyboard-navigation",
    "Moves focus between interactive elements with Tab, arrow keys and shortcuts, across frames and into the browser chrome.",
    "Focus has a model in each document: the focused element, tab order from tabindex and DOM order, focus scopes in shadow trees and dialogs. Moving focus past the last element in a frame hands it to the next frame, possibly in another process, and finally to browser chrome. Caret browsing and spatial navigation add modes. Keyboard events go to the focused frame first, then to the browser for shortcuts, and the order decides who can intercept what.",
    ["Let pages see keys before browser shortcuts, with a few reserved: pages can build rich apps, but cannot trap the user.",
     "Track focus per frame with browser-level routing: keyboard users can cross process boundaries, but every move must be mediated by the browser."],
    ["Dialogs that do not trap focus let Tab reach hidden content behind them.",
     "A page that prevents all key defaults can strand keyboard users inside an embedded frame."],
    "Tab through a page with a modal dialog and a cross-site iframe. Focus stays inside the open dialog, moves into the iframe and back out, and finally reaches the address bar with Shift+Tab.",
    ["input-routing", "frame-tree", "accessibility-tree", "dom-tree"]);

  E("find-in-page",
    "Searches visible text across frames, highlights matches and scrolls to them, in as many documents as the page contains.",
    "Find asks each frame's renderer to search its text nodes, using layout text to handle case and diacritic folding, hyphenation and text split across inline elements. Matches are counted across frames and reported to the browser UI, highlighted with overlays, and the active one is scrolled into view. Cross-process frames need the browser to coordinate the search order. Large documents need incremental search so the page keeps painting.",
    ["Search laid-out text rather than the raw DOM: results match what the user sees, but hidden or collapsed content needs special rules.",
     "Coordinate frames from the browser process: out-of-process frames are included, but result ordering requires a frame-order agreement."],
    ["Searching the whole document in one synchronous pass freezes large pages.",
     "Matches inside closed shadow trees or details elements are either missed or revealed unexpectedly."],
    "Search a term that appears in the parent, a cross-site iframe and inside a text split by bold tags. The count includes all three, Enter cycles through them in order and each scrolls into view.",
    ["layout", "frame-tree", "dom-tree", "browser-process"]);

  E("print-pipeline",
    "Lays out a page for paper, applies print styles, and renders it to a print device or a document file.",
    "Printing re-lays out the document with a paged media model: print stylesheets, page size and margins, page breaks and repeated headers. The renderer produces a vector record of each page and sends it to a utility or printer process, which drives the operating system's printing service or writes a PDF. Cross-process frames and fonts must be included and print preview needs the same result. Print layout differs deeply from screen layout.",
    ["Re-lay out for paged output: output is correct for paper, but a different layout can reveal bugs and double work for preview and print.",
     "Render through a sandboxed utility process to the printing service: drivers and fonts stay away from page code, but data crosses a process boundary."],
    ["Page-break rules ignored for tables or fixed elements split rows and clip content.",
     "Printing a cross-process frame as an empty box because its content was never gathered."],
    "Print a long page with a table, a fixed header and a cross-site iframe to a file. The file has proper page breaks, the repeated header appears on each page, and the frame content is present.",
    ["layout", "paint", "utility-processes", "frame-tree"]);

  E("pdf-viewer",
    "A built-in viewer that renders documents in a sandboxed process and provides search, selection, forms and accessibility.",
    "PDF content is untrusted and complex, so rendering runs in a dedicated sandboxed process embedded in a page frame. The viewer parses the document, renders pages to bitmaps or vector commands, and exposes text for selection and find, form fields and an accessibility tree. The browser supplies navigation, zoom, printing and download. A parser bug is a high-impact vulnerability, so the viewer is a primary target for sandboxing and fuzzing.",
    ["Run the document engine in its own sandboxed process: parser bugs are contained, but scrolling and interaction involve cross-process messages.",
     "Build the viewer UI as a privileged page around the engine: reuses browser features, but the page must resist content that tries to script it."],
    ["Allowing document scripts or external links to run with the viewer's privileges lets a document attack the browser UI.",
     "Not exposing text and structure to accessibility makes documents an unreadable bitmap for screen readers."],
    "Open a malformed fuzz-generated document. The viewer process crashes or shows an error, but the browser and other tabs continue, and a normal document supports search, selection and screen reader text.",
    ["utility-processes", "os-sandbox", "accessibility-tree", "print-pipeline", "find-in-page"]);

  ATLAS.details("web-browser", D);
})();
