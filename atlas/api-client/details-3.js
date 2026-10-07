// Details for the API client plate, part 3: scripting, assertions, request execution, runners.
ATLAS.details("api-client", {
  "script-sandbox": {
    s: "The isolated runtime in which user scripts execute, limiting what they can reach and how long they can run, while exposing only the tool's scripting API.",
    d: "Scripts run in a separate context, a worker, an isolated interpreter instance or a child process, with a fixed set of injected objects and no direct access to the application's internals. The sandbox enforces time and memory limits, captures console output and errors, and decides whether file, network and module access are permitted. It must start fast, since it runs around every request. It is hard because the useful capabilities for automation, such as network calls and library loading, are the same ones an attacker would want.",
    k: ["Strong isolation in a separate process versus an in-process context: a separate process contains crashes and escapes, but costs startup time and serialization; in-process is fast and a single bug can expose the host.", "Allowing network and file access versus denying it: allowing supports real automation, while denying makes imported collections far safer."],
    p: ["An infinite loop in a script freezes the interface because no time limit was enforced.", "A sandbox escape through a shared object prototype gives a script access to application internals."],
    v: "Run scripts that loop forever, allocate until memory runs out, and read a protected file. Each must be terminated or refused within the limit, with a clear error in the console and the tool still responsive.",
    dep: ["scripting-api"]
  },
  "pre-request-scripts": {
    s: "Code that runs before a request is sent to compute values, set variables, adjust headers or bodies, sign requests, or skip the request entirely.",
    d: "The engine runs scripts in order from collection to folder to request, with the request model and variable scopes available through the scripting API. Changes to the request apply to this send only and are not saved back. Scripts can be asynchronous, for example fetching a token, so the engine waits for completion. Errors abort the send with a message. It is hard because the order, scope of side effects and the time at which variable resolution happens must be clear, or the same script behaves differently in the runner and in the interface.",
    k: ["Mutating the in-flight request versus emitting a new one: mutation is simple and can leave the saved version diverged from the sent one; emission is explicit and verbose.", "Failing the send on script error versus continuing: failing prevents wrong requests, while continuing keeps exploratory work moving."],
    p: ["A script computes a value after variable resolution has already happened, so the request carries the old one.", "An exception in a collection-level script blocks every request, with an error that names no request."],
    v: "Add a script that sets a header from a computed value and confirm the console shows the header on the sent request, while the saved request remains unchanged.",
    dep: ["script-sandbox", "scripting-api", "template-interpolation"]
  },
  "post-response-scripts": {
    s: "Code that runs after a response arrives to extract values, save tokens, assert results, and decide what the runner executes next.",
    d: "The script receives the response object, with status, headers, body and timing, plus the request and variable scopes. Typical uses are copying an identifier or token into a variable for later requests, and recording assertion results. It can also direct the runner to jump to another request or stop. It runs even for error statuses, but not when the network call itself failed unless designed otherwise. It is hard because parsing responses defensively takes care: a missing field throws, and the failure should explain which request and why.",
    k: ["Extraction in scripts versus declarative extractors: scripts handle any logic and are hard to inspect; declarative extractors are readable and limited.", "Running when the transport failed versus skipping: running lets scripts record the failure, and forces them to handle a missing response."],
    p: ["A script parses the body as structured text and throws on an error page, hiding the real HTTP failure behind a parse error.", "Saved values are never cleared, so a later run uses an identifier from a previous one."],
    v: "Send a request that returns an identifier, extract it in a script and use it in the next request. The console must show the same identifier in both, and a failing parse must name the request.",
    dep: ["script-sandbox", "scripting-api", "variable-scopes"]
  },
  "scripting-api": {
    s: "The object model scripts use: the request, response, variables, cookies, environment, test results and helpers such as hashing, encoding and sending sub-requests.",
    d: "A documented set of objects and functions injected into the sandbox. It reads and writes variable scopes, reads response parts in convenient forms, registers tests and assertions, and offers utilities for encoding, hashing and random values. Some APIs can send additional requests from within a script. The API is a contract with every script ever written, so changes must be additive. It is hard because the surface grows, each addition widens what untrusted scripts can do, and imitating another tool's API creates long-term compatibility obligations.",
    k: ["A small stable API versus a broad convenient one: small is easy to secure and document, but forces boilerplate; broad is productive and hard to sandbox or version.", "Synchronous calls versus promises: synchronous code reads easily, but blocks on network access; promises scale to parallel calls and confuse casual users."],
    p: ["A helper function is removed in a new version and thousands of saved collections fail at once.", "A script uses the sub-request function in a loop and floods a service."],
    v: "Run a script that touches each documented object and function, and compare outputs with expected values. Run the same script from the interface and the command-line runner and confirm identical results.",
    dep: ["variable-scopes", "cookie-jar", "test-result-model"]
  },
  "script-libraries": {
    s: "Reusable code that scripts can import: built-in utility modules, packages fetched from a registry, and shared snippets stored in the workspace.",
    d: "A module loader resolves names to bundled libraries, workspace files or downloaded packages, and exposes them to scripts. Packages bring dependencies and version choices, and must be available offline and in CI. Shared snippets avoid copying code across requests. Loading third-party code from the network into a tool that holds credentials is a significant risk. It is hard because dependency versions drift between machines, and a collection that imports a package fails in a runner that cannot fetch it.",
    k: ["Bundled fixed set versus arbitrary packages: a bundled set is auditable and predictable, but limits what scripts can do; arbitrary packages are flexible and bring supply chain risk.", "Pinning versions in the collection versus using the latest: pinning is reproducible, and misses fixes; latest is current and breaks silently."],
    p: ["A package update changes behavior and a monthly test run begins to fail with no change to the collection.", "A malicious package reads environment variables through the scripting API."],
    v: "Import a module in a script, run it from the interface and in the command-line runner on a machine without network access, and confirm both succeed using the pinned version.",
    dep: ["script-sandbox", "workspace-files"]
  },
  "request-chaining": {
    s: "Passes data from one response to later requests and controls order, with loops, conditions, jumps and stops, so a collection can model a multi-step scenario.",
    d: "Chaining combines variables written by one request and read by the next with flow control that changes which request runs after the current one. A script can name the next request, repeat one, or stop. The runner keeps an execution cursor and a run scope. It makes login-then-create-then-fetch scenarios possible without separate tooling. It is hard because the flow is hidden inside scripts, which makes the actual order difficult to read, test and debug, and because loops can run forever.",
    k: ["Order by position versus explicit jumps in scripts: position is easy to read, and cannot branch; explicit jumps allow loops and conditions and hide control flow in code.", "A run scope for passed values versus global variables: a run scope avoids leaking state between runs, while globals survive and help ad hoc use."],
    p: ["A loop condition never becomes false and the run keeps sending requests until stopped manually.", "A dependency between requests is only a variable name, so reordering the folder breaks the scenario silently."],
    v: "Build a three-step scenario where each step uses the previous response, run it, and confirm the console shows each identifier passed forward, then reorder two steps and confirm the failure names the missing variable.",
    dep: ["post-response-scripts", "collection-runner", "variable-scopes"]
  },
  "declarative-assertions": {
    s: "Checks written as selections from a menu or short expressions, such as status equals, header contains or field matches, that need no code.",
    d: "Each assertion has a target in the response, an operator and an expected value, which may be a variable. The engine evaluates them after the response arrives and produces results in the common result model. Common operators include equality, containment, regular expression match, type check and existence. Declarative checks are readable, can be edited by non-programmers, and are easy to display and filter. It is hard to make them expressive enough, because the moment someone needs a conditional or computed value they fall back to scripts.",
    k: ["A fixed operator set versus an expression language: fixed operators are easy to use and validate, but run out quickly; expressions cover everything and become programming.", "Stop at first failure versus evaluate all: evaluating all shows the complete picture, and is noisier when one root cause fails many checks."],
    p: ["An assertion on a field that is absent passes vacuously because the operator treats missing as no violation.", "Exact match on a timestamp fails on every run."],
    v: "Write assertions for status, a header and a nested field, break each in turn on the server, and confirm exactly the matching assertion fails with expected and actual values shown.",
    dep: ["response-queries", "test-result-model"]
  },
  "response-queries": {
    s: "Path and query languages for picking values out of structured responses, so assertions and scripts can address fields without writing parsing code.",
    d: "A path expression evaluates against the parsed body and returns zero, one or many values. JSON path syntax covers fields, array indexes, wildcards and filters, and XML path covers elements and attributes. Results feed assertions, extractors and the response viewer's filter box. It is hard because dialects differ in how they treat missing values, filters, and arrays of one element, and so the same expression can return a list in one place and a single value in another.",
    k: ["One query dialect versus several: one dialect is learnable, and cannot follow every API's convention; several dialects cover formats and multiply documentation.", "Returning lists always versus unwrapping single results: always lists is consistent, while unwrapping reads naturally for one-value queries and surprises when a second element appears."],
    p: ["A path with a filter returns an empty list when the field name changes, and an equality check on it passes against an unset value.", "A dialect difference makes the same path work in the viewer and fail in a script."],
    v: "Evaluate a filter path against a body with zero, one and many matches, and confirm each case returns the documented shape in the viewer, an assertion and a script.",
    dep: ["body-editors"]
  },
  "schema-assertions": {
    s: "Validates a response body against a schema, checking types, required fields, formats and constraints, so a contract change is caught as a failure.",
    d: "A validator loads a schema from the collection, an imported description or inline text and checks the parsed body, reporting each violation with a path. It runs as an assertion and appears in results with details. Strictness is configurable, for example whether extra fields are allowed. It is hard because schemas written for documentation are often looser or stricter than reality, and because error messages for nested composed schemas can be difficult to read.",
    k: ["Strict validation that rejects extra fields versus lenient: strict catches unannounced additions and breaks on harmless ones; lenient tolerates growth and misses leaks.", "Schema from the description versus hand-written in the collection: description schemas stay aligned with documentation, while hand-written schemas can express what the description cannot."],
    p: ["The schema marks a field as required that the API legitimately omits for some users, causing intermittent failures.", "Validation errors report a path in the schema rather than in the response, which makes them hard to locate."],
    v: "Validate a response missing a required field and containing a wrong type. The result must list both violations with the response path of each.",
    dep: ["openapi-importer", "test-result-model", "response-queries"]
  },
  "test-result-model": {
    s: "The common structure for outcomes: named tests with pass or fail, messages, expected and actual values, and the request they belong to, shared by the interface, runner and reports.",
    d: "Every assertion and script test emits a result record with a name, status, error detail, duration and a link to the request and iteration. Records roll up by request, folder and run. The interface renders them live, the runner tallies them for exit codes, and reporters serialize them. Skipped and errored states are separate from failed. It is hard to keep it stable: reports, dashboards and integrations parse it, and the difference between a failed assertion and a test that could not run is easy to blur.",
    k: ["Distinguishing failed from errored versus a single failure state: distinguishing helps diagnosis and routing, but complicates tallies; a single state is simple and mixes bugs with environment problems.", "Storing actual values in results versus only messages: actual values enable diagnosis and may carry secrets or large payloads."],
    p: ["A script that throws before registering tests reports zero failures, so a broken test file looks like a passing run.", "Two tests with the same name in different requests merge in a report."],
    v: "Run a collection with one passing, one failing, one skipped and one erroring test, and confirm the interface, the exit code and the report all show four distinct outcomes.",
    dep: []
  },
  "snapshot-comparison": {
    s: "Compares a response with a stored earlier one, ignoring fields that legitimately change, so unexpected differences are visible without writing individual assertions.",
    d: "A baseline response is stored, and later runs diff the new body and sometimes headers against it using a structural comparison. Rules mask volatile fields such as timestamps, identifiers and ordering. Differences are listed, and the person can accept a change as the new baseline. It is hard because a response contains many volatile values, and each ignored field is a gap in coverage, while too few rules make the tests fail constantly.",
    k: ["Whole-response snapshots versus targeted assertions: snapshots catch unexpected changes cheaply, but approve noise by habit; assertions are precise and cover only what was thought of.", "Ignoring by field path versus by value pattern: paths are exact and break on renames; patterns are flexible and can hide real differences."],
    p: ["People update the baseline without reading the diff, so a regression becomes the new expected value.", "A sort order change in an array fails every snapshot though nothing meaningful differed."],
    v: "Store a baseline, change one non-volatile field on the server and one timestamp. Only the field change should fail, with a readable diff showing before and after values.",
    dep: ["response-snapshots", "test-result-model"]
  },
  "timing-assertions": {
    s: "Checks on response time and size, such as a latency threshold or a maximum body length, used as coarse performance and regression guards.",
    d: "The engine compares the measured duration, or a phase such as time to first byte, and the body or header size against thresholds and reports a result in the usual model. Thresholds may be absolute or relative to a baseline. A single measurement from one machine is noisy, so these checks fit smoke testing, not benchmarking. It is hard because network jitter, cold caches and the machine running the tool all affect timing.",
    k: ["Absolute thresholds versus relative to a baseline: absolute thresholds are clear and ignore environment differences; relative thresholds adapt and need stored history.", "Single sample versus repeated sampling with a percentile: a single sample is cheap and flaky, while repeated sampling is stable and slows the run."],
    p: ["A latency check passes on a developer machine and fails on a busy CI agent, and gets disabled.", "A threshold set tightly during a quiet hour causes constant failures later."],
    v: "Add a delay of known length on the server and confirm a threshold just below it fails, with the measured phase durations shown in the result and in the report.",
    dep: ["timing-capture", "test-result-model"]
  },
  "request-pipeline": {
    s: "The ordered stages that carry a request from the editor model to the wire and back: resolve variables, apply authentication, run scripts, send, receive and post-process.",
    d: "A coordinator runs stages in a fixed order and passes a context object between them. Stages include inheritance resolution, variable substitution, pre-request scripts, authentication, serialization, cookie attachment, transport, response decoding, post-response scripts and result recording. Each stage emits events for the console and can fail with a typed error. The same pipeline serves the interface, runner and mock-aware tools. It is hard because stage order matters and every feature wants to insert itself at a different point.",
    k: ["A fixed pipeline versus pluggable middleware: fixed order is predictable and easy to document; middleware allows extension and makes order a source of bugs.", "One pipeline for every protocol versus one per protocol: one shares cookies, scripts and logging, and strains at streaming; separate ones fit each protocol and duplicate behavior."],
    p: ["Authentication runs before a script that changes the URL, so a signature covers the old URL.", "The interface and runner use slightly different stage orders and give different results for the same request."],
    v: "Send the same request from the interface and the command-line runner and diff the console event sequences and wire requests. Stage order and bytes must match.",
    dep: ["template-interpolation", "http-client", "cookie-jar", "pre-request-scripts", "post-response-scripts"]
  },
  "cookie-jar": {
    s: "Stores cookies set by responses and attaches matching ones to later requests by domain, path, expiry and security attributes, as a browser would.",
    d: "The jar keys cookies by name, domain and path, honors expiry, secure and same-site flags, and selects those that apply to each request. People can view, edit and delete cookies, and scripts can read and write them. It may be shared across all requests, or isolated per workspace or per run. It is hard because the matching rules are intricate, hidden state makes requests behave differently from run to run, and the jar holds session credentials.",
    k: ["A persistent shared jar versus a fresh jar per run: persistence mirrors a browser and carries hidden state; fresh jars make runs reproducible and force explicit login.", "Automatic cookie handling versus manual headers: automatic matches real clients, while manual gives exact control for testing."],
    p: ["A stale session cookie makes a request succeed locally and fail in CI where no cookie exists.", "A cookie set by one environment's host is sent to another because of a domain match."],
    v: "Log in, confirm a cookie is stored with its attributes, send a follow-up request and verify it is attached only to matching paths, then clear the jar and confirm the request is rejected.",
    dep: ["scripting-api", "local-database"]
  },
  "redirect-handling": {
    s: "Decides whether and how to follow redirect responses, and applies retry rules for transient failures, with limits and visibility into each hop.",
    d: "On a redirect status the pipeline can follow up to a limit, choosing the next method and body according to the status code and dropping sensitive headers when the host changes. Retries apply to connection errors and selected statuses, with delays and caps, and must only repeat requests safe to repeat. Each hop appears in the console. It is hard because redirect semantics differ by status code, and a retry of a non-idempotent request can create duplicate records.",
    k: ["Following automatically versus stopping at each redirect: following matches clients and hides what happened; stopping shows each hop and makes testing redirects possible.", "Retrying by default versus never: retrying smooths over flaky networks and may repeat writes; never retrying is honest and flaky."],
    p: ["An authorization header is forwarded to a different host during a redirect, leaking a credential.", "A retried payment request is processed twice."],
    v: "Call an endpoint that redirects to another host and confirm the console shows each hop, that the authorization header is not sent to the second host, and that a write request is not retried after a timeout.",
    dep: ["http-client", "console-pane"]
  },
  "proxy-settings": {
    s: "Routes requests through a configured proxy or the system's settings, with bypass rules, authentication and trust for intercepting proxies used in debugging.",
    d: "The tool reads system proxy configuration or custom values per workspace, with host patterns that bypass the proxy. Proxy authentication and tunnelling for encrypted traffic are handled in the transport. Debugging proxies that re-encrypt traffic need their root certificate trusted. Environment variables can override all of it. It is hard because corporate networks differ widely, proxy failures look like server failures, and a custom trust setting weakens the security of every request.",
    k: ["Following system settings versus separate tool settings: system settings need no setup and surprise people in changing networks; separate settings are predictable and duplicate configuration.", "Trusting an intercepting proxy's certificate globally versus per proxy: global is easy, and lets any holder of that certificate read all traffic."],
    p: ["A request to a local service is sent through a corporate proxy and fails with a gateway error.", "The tool disables certificate verification to get through a proxy and never turns it back on."],
    v: "Configure a local capturing proxy, send requests to a bypassed and a non-bypassed host, and confirm only the second appears in the proxy log, with the tunnel established over the proper method.",
    dep: ["http-client", "tls-stack"]
  },
  "response-decoding": {
    s: "Turns received bytes into usable content by undoing transfer and content encodings, applying the declared or sniffed charset and parsing structured types.",
    d: "The pipeline decompresses bodies according to content encoding headers, joins chunked transfer, decodes text by charset, and parses known types into structures for scripts and assertions. Binary bodies stay as bytes. The raw bytes are kept alongside for exact display and for saving. It is hard because servers mislabel encodings and charsets, send invalid structured text, and stream responses that never finish, so decoding needs sensible fallbacks and size limits.",
    k: ["Decoding eagerly versus on demand: eager decoding makes scripts simple and wastes work for large bodies; on demand saves memory and complicates every consumer.", "Trusting declared charset versus sniffing: trusting is predictable and fails on mislabeled servers; sniffing recovers and sometimes guesses wrong."],
    p: ["A compressed bomb inflates to gigabytes and exhausts memory.", "A body with a wrong charset label shows as garbled text and an assertion on a non-ASCII value fails."],
    v: "Fetch bodies using each supported content encoding and a mislabeled charset, and confirm the decoded text is correct, the raw bytes remain available, and an oversized body is cut at the configured limit.",
    dep: ["http-client"]
  },
  "timing-capture": {
    s: "Measures where time goes in a request: name lookup, connection, handshake, waiting for the first byte, download and total, with sizes for each direction.",
    d: "The transport records timestamps at each phase boundary using a monotonic clock, and the pipeline adds script and queue time. The viewer shows a breakdown, assertions can check phases, and reports aggregate them. Reused connections skip lookup, connection and handshake phases, so the shape of the numbers changes after the first call. It is hard to make them honest: measurements include the tool's own scheduling delays, and the first call differs from later ones.",
    k: ["Phase-level timing versus total only: phases localize the problem to network or server, and need instrumentation in the transport; a total is easy and says little.", "Reporting reused connections as zero-cost phases versus hiding them: showing zero is accurate, while hiding avoids confusing readers."],
    p: ["The first request looks slow because of handshake time and is mistaken for a server problem.", "Wall-clock changes from time synchronization produce negative durations."],
    v: "Send a request to a server with a known delay before responding and confirm the wait phase matches it within a small tolerance, and that a second call on a reused connection reports no connect or handshake time.",
    dep: ["http-client", "dns-resolver", "tls-stack"]
  },
  "collection-runner": {
    s: "Executes a chosen set of requests in order, applying scripts, assertions and delays, and collecting the results of the whole run.",
    d: "The runner takes a collection or folder, an environment and optional data, builds an ordered list, and sends each request through the pipeline. It handles flow control from scripts, per-request delays, stop-on-failure options and cancellation. Results stream to the interface as they arrive and are stored in a run record. It is the same engine used headless. It is hard because long runs need cancellation that really stops in-flight work, bounded memory for results and a clear distinction between request failure and test failure.",
    k: ["Sequential execution versus parallel requests: sequential keeps dependencies and order, and is slow; parallel is fast and breaks any scenario that shares state.", "Stop at first failure versus run to the end: stopping is quick and avoids cascading noise; running to the end shows the full picture."],
    p: ["Cancellation stops scheduling new requests while an in-flight request keeps running and sends its results into a closed run.", "A failed login lets forty dependent requests run and fail, burying the real cause."],
    v: "Run a ten-request collection with one failing request in the middle, with and without stop-on-failure, and confirm the result counts, ordering and exit status match the chosen option.",
    dep: ["request-pipeline", "test-result-model", "iteration-engine"]
  },
  "iteration-engine": {
    s: "Repeats a run once per data row or a fixed count, giving each iteration its own variables and tracking results per iteration.",
    d: "For each iteration the engine binds a row from the data source to a temporary scope, resets run-scoped variables as configured, and executes the sequence. Results record the iteration index and row. It supports a fixed count without data, and options to continue or stop on errors. It hands the runner a shape for reports. It is hard because state leaks between iterations when scripts write to wider scopes, and because the first and later iterations often differ, for example in token acquisition.",
    k: ["Resetting state between iterations versus carrying it over: resetting makes iterations independent and re-runs setup each time; carrying state is faster and makes later iterations depend on earlier ones.", "Row values as variables versus as a separate data object: variables are simple to use, and can collide with other names; a data object is explicit and slightly verbose."],
    p: ["Iteration two fails because iteration one left a created record that conflicts with its data.", "A token fetched in the first iteration expires during a long run and every later iteration fails."],
    v: "Run three iterations from a data file and confirm each result records its own row and index, and that a variable written in iteration one is absent at the start of iteration two when reset is on.",
    dep: ["data-files", "variable-scopes"]
  },
  "cli-runner": {
    s: "A headless program that runs a collection from a terminal or build job, with options for environment, data, reporters and failure behavior, and a meaningful exit status.",
    d: "It embeds the same pipeline and scripting engine as the interface, loads a collection and environment from files or an account, and writes results to the console and report files. Options select folders, iterations, delays and timeouts. The exit code distinguishes success, test failures and run errors. It is hard because it must behave identically to the interface, which means shipping the same sandbox and library set, and because it is a primary integration point that people automate around.",
    k: ["Sharing code with the interface versus a separate runtime: sharing guarantees the same results and ties releases together; a separate lighter runtime is small and drifts.", "Reading from local files versus fetching from the service: files work offline and in forks, while fetching keeps runs current and needs credentials."],
    p: ["The runner ships an older scripting API than the interface, so a collection passes in the application and fails in the pipeline.", "A failure in a script exits with status zero, and the build stays green."],
    v: "Run the same collection through the interface and the command-line runner with the same data. Results must match, and a deliberate failure must produce a nonzero exit status.",
    dep: ["collection-runner", "report-generators", "workspace-files"]
  },
  "report-generators": {
    s: "Serializes run results into formats other tools read, such as console summaries, structured files for CI dashboards, and human-readable web pages.",
    d: "Reporters subscribe to run events and render the result model into outputs: a summary table, a machine-readable test report, a structured document with full details, and a standalone page with charts. Reports can include request and response details, with options to omit bodies. Several reporters can run at once. It is hard because reports are consumed by other software with strict expectations, because large runs produce huge files, and because detailed reports capture secrets.",
    k: ["Full request and response detail versus summaries: full detail enables diagnosis and risks secrets and size; summaries are small and demand a rerun to investigate.", "Streaming output as it happens versus writing at the end: streaming survives crashes and gives live feedback, and is harder to keep well-formed."],
    p: ["A report includes authorization headers and is uploaded as a public build artifact.", "A crash during the run leaves a truncated, unparseable report that the CI system rejects without explanation."],
    v: "Run a collection with a failing test, produce each report format, and validate the machine-readable one against its schema. Search all reports for a known secret value, which must not appear.",
    dep: ["test-result-model", "redaction"]
  },
  "ci-integration": {
    s: "Connects collection runs to build pipelines: installing the runner, supplying environments and secrets, failing the build on test failures and publishing reports.",
    d: "A pipeline step installs or invokes the runner, passes the collection and environment, injects secrets from the CI system's secret store, and interprets the exit code. Reports are attached to the build, and trends may be sent to the hosting service. Runs may target an ephemeral environment created earlier in the pipeline, so the base URL is a variable. It is hard because CI machines differ from developer ones: no browser for token flows, restricted networks, shared state in the target and parallel jobs colliding.",
    k: ["Running against a shared environment versus an ephemeral one: shared is cheap and tests collide with other work; ephemeral is isolated and costs setup time.", "Gating merges on the run versus informing only: gating protects the main line and stops people on flaky tests; informing never blocks and gets ignored."],
    p: ["Two pipelines run the same collection against one environment and each deletes the other's test data.", "Interactive authentication is required in CI, where nobody can complete it."],
    v: "Trigger a pipeline with a deliberately failing assertion and confirm the build fails, the report is attached, and no secret value appears in the build log.",
    dep: ["cli-runner", "ci-secret-injection", "report-generators"]
  },
  "scheduled-monitors": {
    s: "Runs a collection on a schedule from hosted or self-managed agents, recording results over time and alerting when checks fail.",
    d: "A scheduler triggers runs at intervals from one or more regions, using stored environments and secrets. Results are stored with history, and failures notify people through chat, email or paging integrations after a configurable number of consecutive failures. Run locations let teams see regional problems. It is hard because stored secrets live on a service, because flaky checks create alert fatigue, and because a monitor that writes data against production must be carefully designed to be safe.",
    k: ["Hosted agents versus self-managed agents inside the network: hosted agents are easy and reach only public endpoints; self-managed agents reach private services and need operation.", "Alerting on one failure versus consecutive failures: one failure is fast and noisy; consecutive failures are calm and slower to detect a real outage."],
    p: ["A monitor creates a record on every run and fills a production database.", "The monitor's token expires and every alert after that is about authentication, hiding real outages."],
    v: "Schedule a monitor against a service, take the service down, and confirm an alert arrives after the configured number of failures, with the failing request and response in the run record.",
    dep: ["collection-runner", "secret-store-integrations", "report-generators"]
  }
});
