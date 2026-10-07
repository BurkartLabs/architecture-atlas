// Details for the web framework plate, part 1: tooling, controllers and lifecycle, view layer.
ATLAS.details("web-framework", {
  "cli-and-console": {
    s: "The command-line entry point that runs the server, migrations, jobs and custom tasks, plus an interactive console that boots the full application for inspection.",
    d: "A single executable boots the application in a chosen environment and dispatches to named commands: start the server, run migrations, list routes, clear caches, run a worker. Applications register their own commands through the same interface, with argument parsing and help text. The console loads the whole container and models so developers can query data and call services live. The hard part is that commands boot a different process shape than the server, so code relying on request state or server-only setup fails there.",
    k: ["Commands discovered by convention vs registered explicitly: discovery needs no wiring, but startup scans files and a misplaced file silently disappears.", "Console against production data vs a sandbox: live access debugs real problems fastest, but one mistyped statement changes real records."],
    p: ["A command that runs fine in the console but assumes request context fails when scheduled or run from a job.", "Long commands boot the whole application per invocation, so a scheduler that starts one every minute spends most of its time on startup."],
    v: "Run the route-listing command and compare its output with requests made against a running server, then open the console, query one record and call one service method with real configuration.",
    dep: ["application-bootstrap", "service-container"]
  },
  "code-generators": {
    s: "Commands that create files from templates for models, controllers, migrations and tests, so new features start from the framework's conventions rather than a blank file.",
    d: "A generator takes a name and options, renders file templates with the right paths and naming, and often edits existing files, such as adding a route or registering a provider. Generated code is ordinary application code the developer then owns. Good generators produce matching tests and migrations together. The difficulty is drift: templates change between framework versions, so old generated code diverges from what new generators produce, and automated edits to existing files break when those files were customized.",
    k: ["Generate editable code vs rely on runtime magic: generated files are visible and changeable, but they multiply boilerplate and never receive upstream fixes.", "Full scaffolding vs minimal stubs: scaffolds demo the whole stack quickly, but teams tend to keep unused generated actions and views."],
    p: ["Generated code with default permissive settings, such as open update actions, ships to production unreviewed.", "A generator that patches an existing file fails halfway and leaves routes registered for a controller that was never written."],
    v: "Generate a resource, run its generated tests and migration on a clean database, and request each generated route. Every route should respond with the expected status and no file should need hand edits to run.",
    dep: ["cli-and-console", "migrations"]
  },
  "test-harness": {
    s: "A test client that sends requests through the full stack in-process, with helpers for sessions, assertions on responses and per-test database isolation.",
    d: "The harness builds the application once, then issues requests without opening a socket and returns the response for assertions on status, headers, body and rendered view data. It provides login helpers, cookie jars, time control, fake mail and queue drivers, and wraps each test in a rolled-back transaction or a truncated database. Test levels run from unit tests of services to browser-driven end-to-end tests. The hard parts are speed, isolation of shared state such as caches, and faithfulness to the real server.",
    k: ["In-process requests vs a real server: in-process is fast and deterministic, but misses server-level behavior such as buffering, proxy headers and real connection limits.", "Transaction rollback vs truncation between tests: rollback is faster, but code that opens its own connection or commits explicitly sees different data."],
    p: ["Tests swap in fake queues and mailers, so real driver serialization and delivery failures are never exercised.", "Global caches and class-level settings leak between tests, making order-dependent failures that disappear when a test runs alone."],
    v: "Run the suite in random order, three times, in parallel, and get identical results. Then run one end-to-end test against a real server process and confirm it hits the same routes and rendered output.",
    dep: ["application-bootstrap", "fixtures-and-factories", "request-lifecycle"]
  },
  "fixtures-and-factories": {
    s: "Reusable ways to create known data for tests and demos: static fixture files loaded once, or factory functions that build records with sensible defaults and overrides.",
    d: "Fixtures are declarative data files loaded into the test database before the suite, fast but shared and rigid. Factories construct objects on demand with defaults, sequences and named variants, saving only what a test needs through the real model layer, so validations and callbacks run. Both feed development seeds and demos. The difficulty is coupling: a change to a model's required fields breaks every factory and fixture, and deep association chains make a single test insert dozens of rows.",
    k: ["Fixtures vs factories: fixtures load once and run fast, while factories keep each test's data visible beside its assertions at the cost of many inserts.", "Build objects in memory vs persist by default: unsaved objects are far faster, but miss database constraints that real writes enforce."],
    p: ["Factories that create full association chains by default make every test slow without anyone noticing.", "Shared fixtures get edited for one test and silently change the expected results of dozens of others."],
    v: "Create each factory's default object and each named variant, then confirm every one passes model validation and saves. Count queries for one common factory and confirm it is bounded by the declared associations.",
    dep: ["model-layer", "seed-data"]
  },
  "hot-reload": {
    s: "Detects changes to source files, templates and styles during development and applies them to the running server and browser without a manual restart.",
    d: "A file watcher notices changes. For server code the framework either restarts the process quickly or reloads the changed modules and discards cached references to old classes; templates are simply recompiled on next use. A browser-side channel can refresh the page or swap styles and components in place. It is hard because long-lived objects hold references to old code: singletons, registered callbacks and constants survive a reload and keep running stale behavior, producing bugs that vanish after a full restart.",
    k: ["Full process restart vs in-place module reload: restart is always correct but slow, while reload keeps state and speed but allows stale references.", "Polling file timestamps vs operating-system notifications: polling works everywhere including network mounts, but burns CPU and lags on large trees."],
    p: ["A class reloaded while an old instance sits in a long-lived registry produces errors like an object not matching its own type.", "Watchers hit file-count limits in containers and silently stop reloading, so developers debug changes that never took effect."],
    v: "Edit a handler, a template and a stylesheet while the server runs, and confirm each change shows in the next response or browser view within a second or two. Then check that a changed singleton service takes effect.",
    dep: ["application-bootstrap", "template-engine", "asset-pipeline"]
  },
  "debug-toolbar": {
    s: "A development overlay or log that shows each request's queries, timings, rendered templates, cache hits and memory, and an interactive error page that exposes the failing code.",
    d: "Instrumentation hooks in the framework record events during a request: every database query with its source location, view render times, events dispatched, cache operations and log lines. A toolbar injects this into the page or stores it for later inspection, and the development error page shows the stack trace, local variables and request details. Profilers add sampling. The hard part is overhead and safety: recording everything slows requests, and an interactive debugger exposed on a reachable server is a remote code execution hole.",
    k: ["Always-on instrumentation vs on-demand sampling: always-on shows every request but changes timings, while sampling is cheap but may miss the slow request.", "In-page toolbar vs a separate inspection store: in-page is immediate, but breaks for API clients and redirects that never render a page."],
    p: ["Debug mode left enabled in production exposes source code, settings and an interactive console to anyone who triggers an error.", "Query recording keeps every request's data in memory in a long-running process and slowly exhausts it."],
    v: "Load a page that runs a known number of queries and confirm the toolbar lists exactly those with correct timings. Then confirm in a production configuration that no toolbar, no detailed errors and no debug endpoints respond.",
    dep: ["query-diagnostics", "environments", "lifecycle-events"]
  },
  "plugin-system": {
    s: "The defined points where third-party code extends the framework: registered providers, middleware, commands, model behaviors and template helpers, loaded by name and configuration.",
    d: "An extension registers itself during boot, adding routes, middleware, services, commands, migrations, view paths or hooks, and exposes configuration with defaults the application can override. The framework needs stable extension interfaces, ordering rules when two extensions touch the same hook, and a way to publish assets and config. It is hard because extensions share one process and one container: two packages can override the same service, run in conflicting middleware order or depend on incompatible framework internals.",
    k: ["Narrow public extension points vs open internals: narrow points keep upgrades safe, but extension authors patch internals anyway when a need is missing.", "Auto-discovery of installed packages vs explicit registration: discovery is convenient, but installing a package changes behavior without any visible edit."],
    p: ["Two packages that each wrap the same service silently undo each other depending on boot order.", "A package pins an old framework internal and blocks the application's upgrade for months."],
    v: "Install a sample extension that adds a route, a middleware and a command, and confirm all three appear in the route list, the middleware stack and the command list. Remove it and confirm all three are gone.",
    dep: ["service-providers", "service-container", "middleware-pipeline"]
  },
  "package-ecosystem": {
    s: "The registry of reusable libraries for authentication, admin screens, payments, search and more, with the conventions that let them integrate with the framework.",
    d: "Most applications are mostly third-party code. A package manager resolves versions from a registry, locks them, and the framework's conventions decide how packages integrate: configuration files, migrations, views and assets published into the application. Ecosystem quality varies, so teams evaluate maintenance, security history and compatibility with the framework's release schedule. It is hard because every dependency is trusted code running with full application privileges, and transitive dependencies multiply the supply-chain surface.",
    k: ["Many small packages vs few larger frameworks: small packages fit exactly, but each adds maintenance and version-conflict risk.", "Pinning exact versions vs allowing compatible ranges: exact pins give reproducible builds, but security fixes need deliberate updates."],
    p: ["An abandoned package that nothing else replaces stays in the application for years, blocking runtime and framework upgrades.", "A malicious or hijacked package release runs with database credentials the moment it is installed."],
    v: "From a clean checkout and the lock file, install dependencies and confirm the resolved versions match the lock exactly. Run the audit command and confirm it reports no known vulnerabilities in installed packages.",
    dep: ["plugin-system"]
  },
  "controllers-and-handlers": {
    s: "The application's entry code for a routed request: a function or class method that reads input, calls services and returns a response, kept thin.",
    d: "The router resolves a request to a handler, either a plain function or a method on a controller class with several related actions. The handler receives the request or bound arguments, calls domain code, and returns a view, data or a redirect. Controllers may share filters and base behavior through inheritance or composition. The difficulty is discipline: handlers accumulate business logic, queries and formatting because it is convenient, and then logic is untestable without a request and duplicated across handlers.",
    k: ["Controller classes with many actions vs single-purpose handlers: classes share filters and context, but grow into large objects with unrelated dependencies.", "Logic in handlers vs a service layer: handlers are quick to write, but business rules then cannot be reused by jobs or commands."],
    p: ["A handler issues queries inside a loop over results, producing hundreds of queries for one page.", "Business rules copied into several handlers diverge when one is changed, so the same action behaves differently by route."],
    v: "Call a handler's underlying service from a test with no request object and confirm it behaves identically, then request the route and confirm the handler contains only input reading, one service call and response building.",
    dep: ["router", "request-object", "response-object", "service-container"]
  },
  "handler-argument-binding": {
    s: "Automatically supplies handler parameters from the request: path values converted to typed objects, parsed bodies, injected services and the current user.",
    d: "Before calling a handler, the framework inspects its declared parameters and resolves each one: a path parameter becomes an integer or a loaded record, a body becomes a validated object, a service type comes from the container. Custom resolvers add domain types such as the current tenant. Failure to resolve produces a defined response such as 404 or 422. The difficulty is hidden behavior: implicit loading makes a handler's data access invisible, and each resolver runs for every call, including its queries.",
    k: ["Implicit record loading vs explicit lookup: implicit saves boilerplate and gives uniform 404s, but hides queries and skips scoping unless the resolver enforces it.", "Reflection on declared types vs explicit registration: declarations read naturally, but depend on type information the runtime may not have."],
    p: ["Loading a record by id from the path without scoping to the current user exposes other users' data.", "A resolver quietly coerces bad input, such as turning text into zero, and the handler acts on the wrong record."],
    v: "Request a route with a valid id, an unknown id and a malformed id, and confirm the handler receives the typed record for the first and the framework returns 404 and 400 or 422 for the others without running the handler.",
    dep: ["route-parameters", "service-container", "request-object"]
  },
  "request-lifecycle": {
    s: "The fixed sequence a request passes through, from server hand-off through middleware, routing, handler and rendering to the response, and the cleanup after it.",
    d: "A request arrives from the server interface, is wrapped in a request object, passes inward through middleware, is matched by the router, has handler arguments bound, runs filters and the handler, produces a response that is rendered or serialized, and passes back outward through middleware before being written to the socket. Cleanup releases connections and request-scoped state. Errors at any stage divert to exception handling. The difficulty is knowing exactly where each stage runs, because ordering decides what can see what.",
    k: ["A single linear pipeline vs a pipeline with branches per route group: linear is easy to reason about, but branching lets APIs and pages have different stacks.", "Eager request construction vs lazy parsing: lazy parsing saves work for routes that ignore the body, but moves failures to unpredictable points."],
    p: ["Resources opened in the middle of the lifecycle, such as connections, leak when an exception skips the normal cleanup path.", "Code placed in the wrong stage, such as authorization before routing, runs against an unmatched or wrong route."],
    v: "Add a trace log at each stage and send one request. The log should show every stage in documented order exactly once, with the same request identifier, and a forced exception should show the same cleanup stages still running.",
    dep: ["middleware-pipeline", "router", "controllers-and-handlers", "error-handling", "server-interface"]
  },
  "lifecycle-events": {
    s: "Named hooks fired at defined points, such as request received, route matched, response ready and request finished, that application and package code can subscribe to.",
    d: "The framework dispatches events or runs callback lists at fixed lifecycle points, and extensions subscribe to add behavior such as logging, metrics, header injection or cleanup. Handlers run in a defined order and may modify context or short-circuit the request. Per-action filters, such as before and after callbacks on a controller, are a related, narrower form. The difficulty is hidden control flow: behavior attached through hooks does not appear at the call site, and hooks that fail or stall affect every request.",
    k: ["Hooks that can modify or halt the request vs read-only observers: modifiers are powerful, but make behavior hard to trace and order-dependent.", "Synchronous listeners vs deferred ones: synchronous listeners keep ordering and context, but add their latency to every request."],
    p: ["A slow listener on a request event adds its delay to every response and shows up as general slowness.", "Filters registered in inheritance chains run in surprising order, so an authorization filter runs after a filter that already acted."],
    v: "Register a listener on each lifecycle event, send a request, and confirm each fires once in documented order with the expected request and response objects. Make one listener throw and confirm the documented error behavior.",
    dep: ["request-lifecycle", "event-dispatcher"]
  },
  "form-handling": {
    s: "Builds forms from models or definitions, maps submitted fields back to typed values, and re-displays the form with entered data and errors when it fails.",
    d: "A form layer describes fields, types and constraints once, renders HTML with the right input types and error markup, and on submission converts strings into typed values, runs validation and either hands clean data to the handler or returns the form with messages. It also handles checkboxes and multi-value fields, nested objects, method override for browsers that only send two methods, and CSRF tokens. Hard cases are partial submissions, repeated nested records, and keeping what the user typed when validation fails.",
    k: ["Forms generated from the model vs separate form objects: generated forms are quick, but couple the page to the table, while form objects decouple at the price of more code.", "Server-rendered validation messages vs client-side checks: server messages are authoritative, but a round trip is slower for the user."],
    p: ["Binding submitted fields straight to a model lets users set fields the form never showed.", "A failed submission redisplays with fields reset, or with passwords echoed back into the page."],
    v: "Submit the form with valid data, with each field invalid, and with extra unknown fields. Valid data should save, invalid data should redisplay with entered values and per-field messages, and unknown fields should be ignored.",
    dep: ["validation", "request-object", "csrf-protection", "mass-assignment-guard", "output-escaping"]
  },
  "validation": {
    s: "Declarative rules that check input, such as presence, format, range, uniqueness and cross-field conditions, and collect errors keyed by field with translatable messages.",
    d: "Rules attach to models, form objects or request schemas and run on input before it is used or stored. Each rule produces structured errors with a field path, a code and a message resolved through the translation catalogs. Validators range from simple type checks to ones that query the database, such as uniqueness. The hard part is where truth lives: application validation can be bypassed or raced, so the database must enforce the same constraints, and rules must behave the same for forms, API calls and imports.",
    k: ["Validation on the model vs on the request: model rules protect every write path, but cannot know the context, such as which fields a form was allowed to change.", "Collect all errors vs stop at the first: collecting gives users one pass to fix everything, but costs more and may run expensive checks on bad data."],
    p: ["A uniqueness check done only in application code is raced by two simultaneous requests, producing duplicates.", "Messages built from user input and rendered unescaped turn validation errors into an injection point."],
    v: "Submit two simultaneous requests that violate a uniqueness rule and confirm exactly one succeeds and the other receives a field error, with a database constraint present. Confirm error codes are the same for form and API input.",
    dep: ["translation-catalogs", "model-layer", "api-error-format"]
  },
  "redirects-and-flash": {
    s: "Responses that send the browser to another URL after an action, plus one-time messages carried across that redirect, following the post-redirect-get pattern.",
    d: "After a state-changing request, the handler returns a redirect with a status code such as 303 so a refresh does not resubmit the form. The target URL comes from reverse routing, or from a validated return address. A flash message is stored in the session or a signed cookie, shown on the next request and then removed. Hard parts include choosing among redirect status codes, keeping flash data through multiple redirects, and preventing open redirects when the destination is user-supplied.",
    k: ["Flash in the session vs in a short-lived cookie: sessions are private and larger, while cookies avoid server storage but are limited in size.", "Redirect to a computed route vs back to the referrer: computed routes are predictable, but the referrer returns users where they were, and is unreliable and spoofable."],
    p: ["Redirecting to a return URL taken from a query parameter lets attackers send users from the trusted domain to a malicious site.", "A flash message set before a redirect chain is consumed by the first hop and never shown."],
    v: "Submit a form, confirm a 303 response to the right URL, load the target and see the message once, then reload and confirm the message is gone. Submit a return URL on another domain and confirm it is rejected.",
    dep: ["reverse-routing", "session-store", "response-object"]
  },
  "template-engine": {
    s: "Compiles template files that mix markup with expressions, loops and conditions into render functions, then runs them with a data context to produce HTML.",
    d: "Templates are parsed once into an intermediate form or compiled code, cached by file modification, and executed with variables from the handler. The engine provides inheritance, includes, loops, conditionals, filters and a lookup path across application and package view directories. Some engines allow arbitrary code, others restrict logic deliberately. The difficulty is the boundary: logic in templates is untestable and slow to debug, error messages must point to template lines, and user-supplied template text is a code-execution risk.",
    k: ["Logic-light templates vs full-language templates: restricted templates keep views simple and safer, while full code is flexible but turns views into hidden application logic.", "Compile at first use vs precompile at deploy: first-use compilation is simple, but the first requests are slow and cache writes need disk access."],
    p: ["Rendering a template whose source comes from user input allows server-side code execution.", "Queries triggered lazily from inside loops in a template produce N+1 behavior no handler code shows."],
    v: "Render a template with known data and compare to expected HTML, then force an error on a known line and confirm the message names the template file and line. Change the file and confirm the next render reflects it.",
    dep: ["output-escaping", "configuration"]
  },
  "layouts-and-partials": {
    s: "Reusable template structure: a layout wraps page content with shared chrome, and partials or components render repeated fragments with their own local data.",
    d: "A layout supplies headers, navigation and footers, with named slots that pages fill with titles, scripts and content. Partials render a fragment, such as a row or card, given explicit local variables, often over a collection. Nested layouts support sections of a site. Components bundle markup, styles and logic. Hard parts include passing data without leaking everything into scope, rendering collections efficiently, and caching fragments with the right key.",
    k: ["Implicit variables shared into partials vs explicit locals: implicit is convenient, but makes partials depend on invisible state and break when reused.", "Many small partials vs larger templates: small partials reuse well, but overhead per render adds up in large lists."],
    p: ["A partial that reads a variable only some pages set raises errors on the pages that do not.", "Rendering a collection by calling a partial once per item without batching makes list pages far slower than the equivalent single template."],
    v: "Render a page with two nested layouts and a partial over a thousand items, confirm the output structure, and time the render against a budget. Remove a required local from one call and confirm a clear error.",
    dep: ["template-engine", "response-caching"]
  },
  "view-helpers": {
    s: "Functions available in templates that build links, form tags, asset URLs, formatted dates and other markup consistently, so templates do not hand-write them.",
    d: "Helpers wrap common output: a link generator that calls reverse routing, a form tag helper that inserts the CSRF token and method override, an asset helper that returns fingerprinted URLs, number and date formatters that follow the locale. They return pre-escaped markup marked safe so it is not double-escaped. The difficulty is the safe-marking: a helper that marks user text as safe bypasses escaping, and helpers that grow into hidden logic make views harder to follow.",
    k: ["Many framework helpers vs plain markup: helpers keep URLs, tokens and attributes consistent, but hide the HTML and can lag behind new markup features.", "Global helper namespace vs scoped helpers per view area: global is convenient, but names collide and any template can use anything."],
    p: ["A custom helper that concatenates user text into a string and marks it safe creates a stored cross-site scripting hole.", "A link helper given a raw path rather than a named route keeps working until a route changes, then breaks silently."],
    v: "Render each helper with hostile input such as angle brackets and quotes and confirm the output is escaped everywhere except markup the helper itself generated. Rename a route and confirm link helpers update or fail loudly.",
    dep: ["output-escaping", "reverse-routing", "asset-pipeline"]
  },
  "output-escaping": {
    s: "Converts dynamic values to text that is safe for the place they are inserted, such as HTML body, attribute, URL, script or style, by default and without developer action.",
    d: "The template engine escapes every interpolated value by default and tracks values explicitly marked safe. Correct escaping depends on context: the characters that matter differ between element text, quoted attributes, URLs, inline scripts and styles. Some engines are context-aware and choose the escaper automatically; others apply one HTML escaper everywhere. The difficulty is the escape hatches: raw output, safe-marked strings and values built outside templates are where stored injection survives.",
    k: ["Escape by default with an explicit raw marker vs opt-in escaping: default escaping makes the safe path the lazy one, while opt-in depends on every author remembering.", "Context-aware automatic escaping vs one escaper: context-aware handles scripts and URLs correctly, but is more complex and still cannot cover everything."],
    p: ["Inserting a value into an inline script or an unquoted attribute with the plain HTML escaper leaves it exploitable.", "Rich text from users rendered raw without a sanitizer allows script in stored content."],
    v: "Render a set of known attack strings in each context the templates use and confirm none executes in a real browser. Search templates for raw-output markers and confirm each has a sanitized or constant source.",
    dep: ["template-engine"]
  },
  "ssr-and-hydration": {
    s: "Renders client-side components to HTML on the server for fast first paint and indexability, then lets the browser attach behavior to that markup without rebuilding it.",
    d: "The server runs the same component code as the browser, in the server process or a separate rendering service, with data fetched before rendering. It returns HTML plus serialized state; the browser then hydrates, attaching event handlers to existing nodes. Streaming can send shell content before slow data finishes. The difficulty is parity: the server and browser must produce identical markup, code must not touch browser-only objects on the server, and data must be fetched once, not twice.",
    k: ["Render in the application process vs a separate rendering service: in-process has no network hop, but couples runtimes and pins CPU-heavy rendering to request workers.", "Full-page rendering vs islands of interactivity: full pages are simple, but ship and hydrate more code than static regions need."],
    p: ["Server and browser render different output, such as from time or random values, and hydration fails or flickers.", "State serialized into the page includes data the user should not see, such as other users' fields."],
    v: "Fetch the page with scripting disabled and confirm the content is already in the HTML. Then load it in a browser, check there are no hydration warnings in the console, and confirm interaction works without a second data fetch.",
    dep: ["component-integration", "template-engine", "streaming-responses"]
  },
  "component-integration": {
    s: "Connects server code to a client-side component system: passing props from handlers to components, embedding components in server templates, and sharing routes and validation rules.",
    d: "Integration ranges from mounting components inside server-rendered pages with serialized props, to treating the server as an API for a single-page client, to a protocol where handlers return component names and data directly. The framework supplies build tool integration, manifest lookups for hashed bundles, shared type or schema definitions and development-server proxying. The difficulty is two codebases with two routers, two sets of validation and two ideas of the current user that must stay consistent.",
    k: ["Server-routed pages with embedded components vs a client-routed single-page application: server routing keeps one source of truth, while client routing feels faster but duplicates routes and state.", "Shared schemas generated for both sides vs duplicated definitions: shared definitions stay in sync, but add a build step."],
    p: ["Props passed from the handler are serialized in full, leaking fields the component never displays.", "Server and client validation rules drift apart, so the client accepts input the server rejects with unhelpful errors."],
    v: "Change a field's rules or type in the server's schema, rebuild, and confirm the client component reflects the change or fails the build. Inspect the page source and confirm only intended props are serialized.",
    dep: ["asset-pipeline", "response-serialization", "view-helpers"]
  },
  "asset-pipeline": {
    s: "Builds, bundles, minifies and fingerprints stylesheets, scripts, images and fonts, and maps logical asset names to the hashed files that templates reference.",
    d: "Source assets are processed by build tools into optimized bundles with content hashes in file names, plus a manifest mapping logical names to hashed paths. Templates call a helper that reads the manifest. Hashed files can be cached for a year because a change produces a new name. In development, a dev server compiles on demand with source maps. The difficulty is keeping cached HTML and assets consistent across deploys, and the build's weight in the toolchain.",
    k: ["Content-hashed file names vs query-string versions: hashed names cache correctly in every proxy and enable immutable caching, but need a manifest and careful deploy ordering.", "Build in the framework vs delegating to external tools: built-in is simple, while external tools track frontend practice faster but add a second toolchain."],
    p: ["Old pages still reference asset files removed by a deploy, so users with open tabs see broken styles.", "A manifest missing in production silently produces links to unhashed paths that do not exist."],
    v: "Build for production, load a page and confirm every referenced asset returns 200 with a long cache lifetime, then rebuild after a change and confirm the file name changes and the old page still works during the transition.",
    dep: ["static-file-serving", "configuration", "environments"]
  },
});
