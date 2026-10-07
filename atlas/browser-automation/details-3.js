// Details for the browser automation plate, part 3: network, emulation, protocol, lifecycle.
ATLAS.details("browser-automation", {
  "request-interception": {
    s: "Pausing outgoing requests at the browser's network layer so the script can inspect, continue, modify, fulfill or abort each one before it reaches the server.",
    d: "The framework enables a fetch-style protocol domain with patterns. Matching requests are held, an event reaches the script with the request details, and the script answers with continue, modified continue, fulfill with a synthetic response, or fail. Every held request costs a protocol round trip, so broad patterns slow pages. Handlers run in registration order or last-wins depending on the library. Interception sees what the browser's network stack sees: not traffic from other processes, and sometimes not service worker or preflight requests.",
    k: ["Intercepting everything vs narrow patterns: broad interception is flexible and adds latency to every request; narrow patterns are fast and miss unexpected calls.", "Handler order first-wins vs last-wins: first-wins is predictable for layered rules; last-wins lets a test override a suite-wide default."],
    p: ["A handler that neither continues nor fulfills a request leaves it hanging, and the page appears frozen.", "Enabling interception disables the browser's HTTP cache in some engines, changing performance and behavior."],
    v: "Intercept all image requests and abort them. The page must load with zero image bytes transferred, and a handler that forgets to answer one request must be reported as a hung request.",
    dep: ["route-matching", "domains-and-events", "debugging-protocol"]
  },
  "response-mocking": {
    s: "Replacing server responses with canned or computed ones, so tests are independent of backends and can force errors, slow replies and rare data states.",
    d: "A mock registers a route and a handler that fulfills with a status, headers and body, or fetches the real response and edits it. Tests mock to simulate a 500, a timeout, an empty list or a very large payload that is hard to produce on a real server. Contract drift is the danger: a mock is a copy of an API that continues to change, so tests pass against a server shape that no longer exists. Teams mix mocked tests for edge cases with a small set of real end-to-end ones.",
    k: ["Mocking the network vs a test backend: network mocks are fast and fully controlled and diverge from the real API; a test backend is faithful and slower to set up.", "Hand-written mocks vs recorded responses: hand-written ones are readable and drift; recordings are realistic and go stale."],
    p: ["Mocks silently stay green after the real API changes its field names.", "A mock that matches too broadly catches calls the test never meant to fake."],
    v: "Mock the list endpoint to return an empty array and then a 500. The page must show its empty state and its error state, and a contract check against the real API must flag a mismatched field.",
    dep: ["request-interception", "route-matching", "har-replay"]
  },
  "route-matching": {
    s: "The pattern language that decides which requests a handler applies to, using URL globs, regular expressions or predicates over method, headers and body.",
    d: "A route is a matcher plus a handler. Matchers compare against the full request URL, including query strings and origin, and can examine method and post data. Several routes may match, and resolution order is defined by the library. Specific routes are safer than wide ones. Matching on URL alone fails for APIs that distinguish operations by body, such as query-language endpoints, where predicates parse the request. The usual trouble is accidental matches and missed matches caused by different query ordering or origins across environments.",
    k: ["Glob patterns vs regular expressions: globs are readable for typical paths; regular expressions express query and variable parts and are easy to get subtly wrong.", "Predicate functions vs patterns: predicates can read bodies and headers and are slower and harder to log."],
    p: ["A glob that omits the query string stops matching when the app adds a cache-busting parameter.", "Routes registered on a context and on a page both match, with surprising precedence."],
    v: "Register routes for an endpoint with different query parameters and methods. A log of which route handled each request must show the intended handler for every request in a fixture run.",
    dep: ["request-interception"]
  },
  "har-replay": {
    s: "Serving responses from a recorded network archive instead of the live site, giving fast, repeatable runs against captured data.",
    d: "A replay router loads a HAR file and answers matching requests with recorded responses, matching on URL and method and optionally on body. Unmatched requests either fall through to the network or fail. It lets a test suite or a scraper run offline and deterministically, and it is a cheap way to build realistic fixtures. Recordings go stale as the application changes, and authentication tokens, timestamps and random ids in requests break exact matching, so replays need normalization or lenient matching.",
    k: ["Strict replay with failures on misses vs fall through to the network: strict makes runs hermetic and reveals gaps; falling through keeps tests passing and hides network dependence.", "Re-recording on a schedule vs on demand: schedules keep data fresh and create diffs; on demand is quieter and drifts."],
    p: ["A recorded response containing a time-limited token fails days later.", "Multiple identical requests that need different responses in sequence, such as polling, all receive the first recorded answer."],
    v: "Record a session, disconnect the network, replay it, and confirm the page renders identically and any request not in the archive is reported by URL.",
    dep: ["har-recording", "route-matching", "response-mocking"]
  },
  "websocket-handling": {
    s: "Observing and controlling WebSocket connections: reading frames, waiting for specific messages, and sometimes mocking the server side.",
    d: "The framework surfaces socket creation, frames sent and received, errors and close events. Scripts wait for a message that matches a predicate, assert on its content, or route the connection to a fake server. Because sockets are long-lived and push data on the server's schedule, tests need explicit waits on messages rather than on requests. Interception of other transports, such as server-sent events or streaming responses, is more limited, and tools may expose only passive observation.",
    k: ["Observing real sockets vs mocking the server: observing tests the real integration and depends on server timing; mocking gives control and diverges from production messages.", "Message-level assertions vs UI-level assertions: messages are precise and test internals; UI checks follow the user's view and are slower to localize."],
    p: ["Waiting for a message after the page has already received it loses the event.", "Binary frames and compressed messages are compared as text and appear empty."],
    v: "Open a page that streams price updates over a socket. Wait for a message with a given symbol, assert its fields, and confirm the displayed value matches the frame.",
    dep: ["domains-and-events", "route-matching", "explicit-waits"]
  },
  "proxy-configuration": {
    s: "Routing browser traffic through an HTTP or SOCKS proxy, at browser or context level, with authentication and bypass lists.",
    d: "The browser accepts a proxy server setting at launch, and some engines allow a different proxy per context. Settings include scheme, host, credentials and hosts that bypass the proxy. Proxies serve to reach internal environments, record traffic, control egress addresses and avoid blocks. The framework must handle proxy authentication challenges and avoid leaking credentials into logs. A proxy that terminates TLS requires trusting its certificate, and name resolution may occur at the proxy or locally depending on the scheme.",
    k: ["Per-context proxies vs one per browser: per-context lets parallel tests use different egress points and needs engine support; per-browser is universal and forces separate browsers.", "Proxy-level recording vs in-browser interception: a proxy sees all traffic including non-page requests and needs certificate trust; interception is simpler and sees only page traffic."],
    p: ["Local addresses are routed through the proxy by default in some engines, so tests on localhost fail.", "Credentials in the proxy URL end up in process lists and logs."],
    v: "Set a proxy that logs requests, load a page and confirm each request appears in the proxy log with the expected exit address, and that hosts on the bypass list do not appear.",
    dep: ["process-launch", "browser-contexts", "certificate-handling", "ip-reputation"]
  },
  "certificate-handling": {
    s: "Deciding how the browser treats invalid, self-signed or intercepting certificates during automation, and when to ignore errors versus install trust.",
    d: "Test environments often use self-signed certificates, internal certificate authorities or an intercepting proxy. The framework can ignore certificate errors per context, which lets pages load while turning off a security check, or trust a specific authority through the profile or system store. Client certificates for mutual TLS are configured per origin. It is hard because ignoring errors hides real problems, such as an expired certificate, and a suite that always ignores them never tests the secure path.",
    k: ["Ignoring all certificate errors vs trusting one authority: ignoring is easy and masks real faults; trusting a specific authority keeps validation in place with setup work.", "Context-level ignore vs browser-wide flag: context-level limits the exposure; the flag applies everywhere, including to any page the script visits."],
    p: ["A flag that ignores certificate errors left on while scraping real sites exposes the session to interception.", "An expired internal certificate is invisible until the day the flag is removed."],
    v: "Load a page served with a self-signed certificate. It must fail by default with a certificate error, load with a context-level override, and the override must not apply to a second context.",
    dep: ["process-launch", "browser-contexts", "proxy-configuration"]
  },
  "device-descriptors": {
    s: "Named bundles of viewport, pixel ratio, user agent and touch settings that make the browser present itself as a particular phone, tablet or desktop.",
    d: "A descriptor sets screen size, device scale factor, mobile flag, touch support and a user agent string, applied at context creation. Mobile emulation enables meta viewport handling, touch events and mobile layout rules. It approximates real devices: the engine, GPU, fonts and input are the host's. Emulation catches responsive layout bugs cheaply, and it cannot find defects specific to a real mobile engine. Descriptor lists age as devices change, and sites that sniff user agents see only the string.",
    k: ["Emulation of named devices vs real device farms: emulation is cheap and fast and misses engine and hardware bugs; real devices are faithful and slow and costly.", "Bundled descriptors vs hand-set fields: bundles reduce mistakes; hand-set values handle new or custom sizes."],
    p: ["Changing the user agent without the matching client hints produces a mismatch that sites flag as automation.", "Testing only emulated phones assumes the host engine behaves like the mobile one."],
    v: "Open the same page with a phone descriptor and a desktop descriptor. The layout must switch at the breakpoint, touch events must fire for taps on the phone, and the page's reported width and ratio must match the descriptor.",
    dep: ["viewport-and-pixel-ratio", "input-synthesis", "automation-signals"]
  },
  "viewport-and-pixel-ratio": {
    s: "The size of the visible page area and the number of device pixels per layout pixel, both of which change layout, image selection and screenshot size.",
    d: "The viewport is set per page or context and can change at runtime. Responsive layouts, media queries and image sets depend on it. The device scale factor makes screenshots larger without changing layout, and a ratio of two doubles each dimension. Headless defaults differ from a typical desktop window, so layouts that look right on a developer's screen collapse in CI. Browser chrome, scrollbars and zoom affect the usable area, and some engines treat the window size and the viewport size separately.",
    k: ["Fixed viewport for all tests vs per-test sizes: fixed gives stable layout and screenshots; per-test sizes cover responsive behavior and multiply baselines.", "Ratio of one vs two: one gives smaller faster captures; two shows the text and edge detail real screens have."],
    p: ["Default headless window size triggers the mobile layout and tests written for desktop find missing menus.", "Scrollbars present in one environment and overlaid in another shift layout by fifteen pixels."],
    v: "Load a responsive page at 1280 and 375 pixels wide and confirm the navigation changes from a bar to a menu button. Screenshot at ratio 2 and confirm the image dimensions are double.",
    dep: ["device-descriptors", "media-emulation", "screenshots"]
  },
  "permissions-and-geolocation": {
    s: "Granting or denying browser permissions such as location, camera, notifications and clipboard for an origin, and supplying fake sensor data.",
    d: "Permission prompts cannot be clicked by page input, so the framework sets permissions through the protocol on a context, per origin. Geolocation, camera and microphone can be fed with fixed coordinates or a synthetic media stream. Notification and clipboard access follow their own rules. Tests also check the denied path: the page must work, or say why not, when permission is refused. Granting persists for the life of the context, and engines differ in which permissions they allow automation to change.",
    k: ["Granting up front vs handling the prompt flow: granting is reliable and skips the prompt UI; the denied and prompt paths need their own tests.", "Fake media device vs real hardware: fake streams are deterministic and test only the page's handling; real devices are fragile in CI."],
    p: ["A test grants location and the page code path that handles denial is never run.", "Permission set for the wrong origin, such as http vs https or a different subdomain, has no effect."],
    v: "Grant geolocation with fixed coordinates and confirm the page reports them. Then deny it in a second context and confirm the page's fallback message appears.",
    dep: ["browser-contexts", "debugging-protocol", "domains-and-events"]
  },
  "locale-and-timezone": {
    s: "Overriding the browser's language, region and timezone so formatting, translations and date logic behave identically on any machine.",
    d: "Locale settings change the language header, the values scripts read and number, date and currency formatting. The timezone override changes how dates are interpreted and displayed. Without them, a suite passes in one region and fails in another, or twice a year when daylight saving time shifts. They apply per context. Fixtures need dates relative to the overridden zone. Time-based features also depend on the clock, and full control needs the clock override described elsewhere.",
    k: ["Pinning locale and timezone for every test vs per test: pinning removes machine dependence and hides locale bugs; per-test variation tests them and multiplies cases.", "Testing in several locales vs one: several catch layout and translation bugs and multiply run time."],
    p: ["Dates computed in the test process timezone differ from dates displayed in the overridden page timezone.", "Right-to-left locales expose layout issues that appear only when the locale is switched."],
    v: "Run a date-formatting page under two timezones and two locales. The displayed strings must match fixed expectations in each case, regardless of the host machine's settings.",
    dep: ["browser-contexts", "clock-control", "role-and-text-locators"]
  },
  "media-emulation": {
    s: "Overriding media features such as color scheme, reduced motion, print versus screen and contrast preference, so pages that adapt to them can be tested.",
    d: "The framework sets values the engine reports to media queries. Dark and light themes, reduced-motion preferences and forced colors can be switched without changing the operating system. Print emulation switches media type to render print styles on screen. Reduced motion is also a flake defense because it removes many animations. The limits are that emulation changes what queries report and not necessarily every other effect of the real setting.",
    k: ["Emulating reduced motion in all tests vs leaving defaults: emulating removes animation noise and does not test the motion path; leaving defaults tests real behavior and invites flakiness.", "Emulated color scheme vs a real one on the host: emulation is repeatable; the host setting varies per machine."],
    p: ["Screenshots taken without pinning the color scheme change when the CI image's default changes.", "Print emulation does not apply page-break rules the same way as real pagination."],
    v: "Load a themed page with the scheme set to dark and then light and confirm the computed background differs. Enable reduced motion and confirm a transition has zero duration.",
    dep: ["debugging-protocol", "animation-stability", "pdf-rendering"]
  },
  "clock-control": {
    s: "Replacing the page's time sources so a test can freeze, set or fast-forward the clock, and trigger timers deterministically.",
    d: "An injected script overrides the date, performance timers, timeouts and intervals and animation frame callbacks, then lets the test advance time by a chosen amount, firing everything due. It lets a test check a session timeout of thirty minutes in milliseconds, or a date-dependent banner on a chosen day. The override lives in the page, so server time, certificate validity and cookies expiry are unaffected. Libraries that cache a reference to the native timer before the override are missed.",
    k: ["Fake clock vs real waiting: fake time is fast and deterministic and can diverge from real scheduling; real waiting is faithful and slow.", "Fully controlled time vs frozen time only: full control lets timers run on command and needs care with promises; frozen time is simpler and stops timers."],
    p: ["Server-issued tokens still expire on real time while the page believes it is later or earlier.", "Libraries capturing native timers at load time ignore the fake clock."],
    v: "Install the clock at a fixed date, advance 30 minutes and confirm the session-timeout dialog appears with no real delay, and that the page's reported date equals the set date.",
    dep: ["script-evaluation", "locale-and-timezone", "timing-model"]
  },
  "debugging-protocol": {
    s: "The browser's native remote control protocol: JSON messages describing commands, results and events grouped by domain, spoken over a socket or pipe.",
    d: "A client sends a message with an id, a method name and parameters; the browser replies with the same id and a result or error, and separately emits events with no id. Methods are grouped into domains such as page, network, input, DOM and emulation. The protocol exposes the engine's internals closely, with fine control and powerful state access. It is versioned loosely with the browser, so methods get added, changed and removed between releases, and each engine family has its own variant.",
    k: ["Native protocol vs the standardized one: native gives the deepest access and tracks one engine closely; the standard is portable and exposes less.", "Direct use vs through a framework: direct use gives full power and the burden of waiting and ordering; frameworks add safety and hide features."],
    p: ["Relying on an experimental method that disappears in the next browser version breaks the suite without any change on your side.", "Events arriving between a command and its reply create ordering assumptions that only fail under load."],
    v: "Open a raw socket to a running browser, send a version query and a navigate command, and confirm replies carry the matching ids and a navigation event follows.",
    dep: ["message-framing", "domains-and-events", "transports"]
  },
  "bidirectional-standard": {
    s: "A standardized, event-driven browser control protocol over a persistent connection, intended to give one cross-browser alternative to engine-specific protocols.",
    d: "Like the native protocol it uses messages with ids and unsolicited events over a socket, but its commands and modules are defined in a specification and implemented by several engines. It covers browsing contexts, script evaluation, network events and interception, input and logging. It replaces the older request-response standard for new work. Coverage of features still trails the native protocol, so frameworks use it where parity exists and fall back to engine-specific calls for the rest.",
    k: ["Standard protocol vs native only: the standard is portable across engines and lacks some features; native is complete for one engine and ties a suite to it.", "Adopting early vs waiting for parity: early adoption invests in the future and meets gaps; waiting avoids the gaps and keeps the engine-specific lock-in."],
    p: ["A feature present in one engine's implementation of the standard is missing in another, and tests pass in one browser only.", "Mixing standard and native commands in one session confuses state tracking."],
    v: "Run the same script, covering navigation, evaluation and a network event, against two engines that implement the standard. Both must complete with the same results.",
    dep: ["message-framing", "domains-and-events", "transports"]
  },
  "command-response-protocol": {
    s: "The older standardized remote control model: each command is one HTTP request to a driver and returns one response, with no events pushed back.",
    d: "A client posts a command, such as navigate or click, to a driver server and waits for the JSON reply. Sessions are created by a capabilities negotiation. There is no way for the browser to push events, so scripts poll for changes. It is mature, supported by every major engine, and works across languages and remote grids. Its drawbacks are latency per command, limited access to network and console events, and coarse waiting models, which led to its replacement for rich testing.",
    k: ["Request-response vs persistent event connection: request-response is simple, stateless on the wire and universally supported; a persistent connection gives events and lower latency and is stateful.", "Implicit waits in the driver vs explicit waits in the script: implicit ones are convenient and make timing unclear; explicit ones are precise and verbose."],
    p: ["Polling for state with round trips makes tests slow over a remote network.", "Capabilities negotiation silently ignores unsupported options, so a requested setting is never applied."],
    v: "Create a session through the driver's endpoint, navigate and read an element's text. Then request an unsupported capability and confirm what the driver does with it.",
    dep: ["driver-server", "transports", "message-framing"]
  },
  "message-framing": {
    s: "How individual commands and replies are delimited and matched on a byte stream: ids, JSON encoding, and the rules for correlating answers with requests.",
    d: "Messages are JSON objects, sent as WebSocket text frames or as null-delimited bytes on a pipe. Each command has an integer id and the reply echoes it, so many commands can be in flight. Events lack ids. The client keeps a map from id to a pending promise and rejects all of them when the connection closes. Large payloads such as screenshots are base64-encoded into one message, which costs memory and time. Framing bugs, like splitting multibyte characters across reads, show up only with unusual data.",
    k: ["Many commands in flight vs strictly one at a time: concurrency is fast and needs ordering discipline; serial is simple and slow.", "Base64 in messages vs streaming handles: inline is simple and heavy for large data; streams need extra calls and handle huge results."],
    p: ["A pending command never rejected on disconnect leaves tests hanging until the global timeout.", "Message-size limits on a proxy truncate a large screenshot reply."],
    v: "Fire 100 commands concurrently and confirm each promise resolves with its own result. Then close the socket mid-flight and confirm every pending promise rejects promptly.",
    dep: ["transports"]
  },
  "domains-and-events": {
    s: "The protocol's grouping of commands and notifications by feature area, with domains enabled on demand so the browser only streams events the client wants.",
    d: "A domain such as network or page must be enabled before its events flow. Enabling is per session, so each attached target needs its own. Event streams report navigation, resource loading, console output, dialogs, frames and more, and the framework converts them into higher-level events and waits. Event order is only partly guaranteed across domains, and enabling a domain late misses what already happened. Heavy domains, for example full network tracking with bodies, cost real memory and CPU in the browser.",
    k: ["Enabling domains eagerly vs lazily: eager never misses early events and costs overhead in every test; lazy is cheap and risks missing initial traffic.", "Surfacing raw events vs curated high-level events: raw gives full detail and burdens users; curated is easy and drops information."],
    p: ["Cross-domain ordering assumptions break: a load event can arrive before the last network event.", "Forgetting to enable a domain in a new session produces silence, not errors."],
    v: "Attach to a page, enable network and page domains after it loaded, and confirm earlier events are absent. Repeat enabling before navigation and confirm the full sequence arrives.",
    dep: ["debugging-protocol", "target-attach", "message-framing"]
  },
  "target-attach": {
    s: "The mechanism by which a client connects to a browser target and gets a session id, with auto-attach so new frames, workers and popups are controlled before they run.",
    d: "Targets are discovered through events and attached to explicitly, producing a session that routes commands by id over the same connection. Auto-attach with a wait-for-debugger option pauses a new target at its first instruction until the client has set up interception and emulation and resumes it. Without that pause, early requests and scripts escape control. The tree of sessions grows with out-of-process frames and workers, and each needs the same setup repeated.",
    k: ["Auto-attach with pause vs attach after creation: pausing guarantees setup before any code runs and adds a resume round trip; attaching later is simpler and loses early activity.", "Flat sessions on one connection vs one connection per target: flat is efficient; separate connections isolate failures and cost more."],
    p: ["A new out-of-process frame is not configured with the same emulation and routes, so its requests bypass mocks.", "Forgetting to resume a paused target leaves it frozen forever."],
    v: "Open a popup that issues a request on its first line of script. Confirm the request was seen by the interceptor, proving the new target was attached and configured before its code ran.",
    dep: ["domains-and-events", "message-framing", "pages-and-targets"]
  },
  "protocol-bindings": {
    s: "Generated typed client code for the protocol's schema, so that method names, parameters and event payloads are checked when the framework or script is written.",
    d: "The browser publishes a machine-readable description of its domains. A generator turns it into typed functions and event definitions in the client language. Bindings catch typos and parameter changes at build time, and they must be regenerated for each browser version. A framework pinned to one version of the schema works with the matching browser and degrades on newer ones, where fields it does not know are dropped and removed methods fail.",
    k: ["Generated bindings vs hand-written wrappers: generated ones cover everything and track changes; hand-written ones are small, readable and fall behind.", "Bundling a schema version vs fetching at runtime: bundled gives reproducibility; fetching adapts to the browser and makes builds depend on it."],
    p: ["A schema newer than the browser exposes methods that fail at runtime with unknown-method errors.", "Experimental domains appear in bindings and are then removed from the engine."],
    v: "Regenerate bindings from two browser versions and diff them. The tool must list added and removed methods, and a call to a removed method must fail with a clear error.",
    dep: ["debugging-protocol", "browser-version-coupling"]
  },
  "transports": {
    s: "The byte channels carrying protocol messages: a WebSocket on a local port, an inherited pipe between parent and child, or a tunneled connection to a remote host.",
    d: "A WebSocket on a debugging port is easy to attach to from any tool and is reachable by anything that can connect to that port. A pipe passes messages over file descriptors inherited at launch and leaves nothing listening. Remote setups tunnel the socket through a server that authenticates and forwards it. Transports must handle half-closed connections, back pressure for large messages and reconnection, which the protocol itself does not provide, since session state lives in the browser process.",
    k: ["Pipe vs listening port: pipes need no open port and no discovery; ports let external tools and a person inspect a running browser.", "Direct socket to the browser vs through a gateway: direct is simple and fast; a gateway adds authentication and routing and a hop of latency."],
    p: ["A debugging port bound to all interfaces lets anyone on the network control the browser.", "A reconnect after a network blip finds the session gone, since the transport is not the session."],
    v: "Start a browser with a pipe transport and confirm no port is listening. Start another with a port and confirm that an external client can attach and list its targets.",
    dep: []
  },
  "browser-discovery": {
    s: "Locating, downloading and pinning the exact browser binary a run will use, so that results depend on a known engine version instead of whatever is installed.",
    d: "The framework either downloads a matching browser build into a cache directory, with checksums and a version registry, or searches known install locations for a system browser. Pinned builds match the protocol version the framework expects. System browsers update on their own schedule, which moves the test environment under the suite. Discovery must handle several channels, such as stable and beta, multiple operating systems and architectures, and offline machines where downloads are not possible.",
    k: ["Framework-managed browser downloads vs the system browser: managed builds are reproducible and add download size; system browsers are present and drift.", "Pinned exact version vs latest channel: pinned avoids surprise breakage; latest finds incompatibilities early."],
    p: ["An auto-updating system browser changes behavior between two CI runs on identical code.", "Download steps fail behind proxies and leave a partial binary in the cache that later runs try to launch."],
    v: "On a clean machine, install browsers, print the resolved path and version for each, and confirm repeating the install is a no-op and the version equals the one the lockfile requests.",
    dep: ["process-launch", "browser-version-coupling", "container-images"]
  },
  "process-launch": {
    s: "Spawning the browser as a child process with the right command-line flags, environment, debugging transport and sandbox settings, and waiting until it is ready for commands.",
    d: "The launcher builds an argument list: debugging transport, headless mode, profile directory, window size, proxy, feature toggles and flags that disable first-run dialogs and background services. It starts the process, reads a startup line or probes the port for readiness, then connects. Flags are a pile of engine-specific switches that change behavior in undocumented ways. Running as an administrator account or inside containers often needs the sandbox disabled, which weakens isolation against hostile pages.",
    k: ["Minimal default flags vs a long list of tuned switches: minimal behaves like a real browser and is flakier in constrained hosts; tuned lists stabilize CI and drift from real behavior.", "Sandbox on vs off in containers: on keeps page code contained; off is often required and means a hostile page can reach the host."],
    p: ["Launch hangs because the browser waits on a first-run or crash-restore dialog nobody can see.", "Flags copied from tutorials disable security features such as site isolation and make results unrepresentative."],
    v: "Launch the browser with debugging output on, confirm readiness within a few seconds, list the final command line, and verify the page can be controlled. Then kill the parent and confirm the child exits.",
    dep: ["browser-discovery", "profile-directories", "transports", "headless-modes"]
  },
  "profile-directories": {
    s: "The on-disk user data directory that holds a browser's cookies, cache, extensions and settings, either temporary and disposable or persistent across runs.",
    d: "By default launchers create a fresh temporary directory per launch and delete it afterward, which gives clean state. A persistent profile keeps logins, extensions and cache, which is useful for scraping and for manual debugging, and means state carries over between runs. Only one browser process can use a profile at once, enforced by lock files, so parallel launches against one directory fail or corrupt data. Disk usage can grow into gigabytes, and crashes leave locks behind.",
    k: ["Temporary profile per launch vs persistent profile: temporary is clean and slower on first load; persistent keeps warm caches and logins at the cost of hidden state.", "Profile per worker vs shared: per worker is safe and uses disk; shared is impossible while a process holds the lock."],
    p: ["A stale lock file from a crashed browser prevents the next launch with an opaque error.", "A persistent profile accumulates cache and cookies, making old and new runs behave differently."],
    v: "Launch twice against the same profile at once and confirm the second fails cleanly. Launch with a temporary profile and confirm the directory is deleted at exit.",
    dep: ["process-launch", "shutdown-and-cleanup"]
  },
  "headless-modes": {
    s: "Running the browser without a visible window, either with a separate simplified rendering path or with the full browser code and an offscreen display.",
    d: "Older headless modes use a stripped-down shell that lacks extensions, some features and sometimes renders differently. The newer approach runs the real browser without drawing to a screen, so behavior matches headed runs closely. Headed mode with a virtual display is the third option. Headless removes the need for a desktop session on CI. Differences remain in download handling, GPU, fonts, permission prompts and detection by sites, so a test that passes headless may fail headed, and the reverse.",
    k: ["Real-browser headless vs the old shell mode: the real browser matches users and uses more resources; the shell is lighter and differs in features.", "Headless vs headed with a virtual display: headless is simpler; a virtual display supports features that need a window and adds a display server."],
    p: ["Behavior differences between headless and headed modes make a bug reproducible in only one.", "Missing system fonts in a headless container change layout and screenshots."],
    v: "Run the same suite headless and headed on one machine. List every test whose result or screenshot differs; the set should be empty or explained.",
    dep: ["process-launch", "screenshots", "automation-signals"]
  },
  "remote-connect": {
    s: "Attaching to a browser already running somewhere else, a container, a cloud service or a person's desktop, instead of launching one locally.",
    d: "The client connects to a protocol endpoint by URL, possibly with authentication tokens, and drives the browser as if local. Differences: files such as uploads and downloads live on the remote machine, latency multiplies the cost of chatty protocols, and the browser's lifetime is not owned by the client, so it can be left running. Remote connect separates the machine running tests from the machine running browsers, which allows many more browsers than test hosts and puts the network in the control path.",
    k: ["Remote browsers vs local launch: remote scales browser count and offloads memory; local is simple, fast and free of network failures.", "Attaching to an existing browser vs a new session: attaching reuses logged-in state for debugging and risks disturbing a person's work."],
    p: ["Round-trip latency of a hundred milliseconds makes a 30-command test take seconds longer than locally.", "A remote browser left alive after a failed client keeps consuming paid capacity."],
    v: "Connect to a remote browser, run a login test, and confirm that on client disconnect the remote session is destroyed within the grid's configured idle timeout.",
    dep: ["transports", "remote-grid", "uploads-and-downloads"]
  },
  "shutdown-and-cleanup": {
    s: "Closing pages, contexts and the browser in order, and reaping child processes and temporary files, including after crashes and timeouts.",
    d: "A clean exit closes contexts, then the browser through the protocol, then waits for the process to end. A crash or a killed test runner skips this, so launchers register exit handlers and track child process trees, and the runner periodically kills strays. Browsers spawn renderer, GPU and utility processes that may outlive the main one. Temporary profiles and downloaded files need deletion. Leaks accumulate quietly: a CI machine with thousands of orphaned processes becomes slow and unreliable days after the leak began.",
    k: ["Graceful close then force kill vs kill only: graceful lets the browser flush data and takes time; kill is immediate and leaves temporary files.", "Process-group termination vs killing the main process: group kills catch helpers and need operating system support; main-only is portable and leaks children."],
    p: ["After a test timeout the page closes but the browser stays, and memory grows over the suite.", "Exit handlers do not run on a hard kill, so temporary directories pile up in CI machines."],
    v: "Run 50 tests, kill the runner abruptly midway, then list processes and temp directories. None from the run should remain after the cleanup step.",
    dep: ["process-launch", "profile-directories", "resource-limits"]
  },
  "driver-server": {
    s: "A separate helper process, shipped per browser, that translates the standard command-response protocol into the browser's own control interface.",
    d: "The client talks HTTP to the driver server, which launches the browser, speaks that engine's native protocol to it and returns standardized answers. Each browser family has its own driver, and the driver version must match the browser version closely. The driver can be local or run on a remote host, where a hub routes sessions to nodes. It adds a process and a version-compatibility constraint, and its logs are often the only explanation for a launch failure.",
    k: ["Using a driver vs direct protocol access: a driver gives standard multi-language compatibility and an extra hop; direct access is faster and tied to the framework.", "Driver management by the framework vs by the user: framework management hides version matching; user management is explicit and breaks on browser updates."],
    p: ["A browser auto-update leaves an old driver in place, and sessions fail to start with a version-mismatch message.", "Driver processes left running hold ports and block later runs."],
    v: "Start the driver, create a session, and read its log. Update the browser to a newer major version and confirm the mismatch is reported with both versions named.",
    dep: ["command-response-protocol", "debugging-protocol", "browser-discovery"]
  }
});
