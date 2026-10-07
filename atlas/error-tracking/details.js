// Details for the error tracking plate, part 1: capture in the application, context, ingestion.
ATLAS.details("error-tracking", {
  "event-model": {
    s: "The schema of one captured event: an identifier, timestamp, platform, severity, exception chain, context blocks, tags and release, shared by every SDK so the server can treat all clients uniformly.",
    d: "An event is a JSON document with a small set of required fields and many optional typed interfaces: exception values with ordered frames, a message, user, request, device and runtime blocks, free-form tags and extra data. Every SDK fills the same shape regardless of runtime. The format is the contract between thousands of independently upgraded clients and the server, so it grows by adding optional fields and never by changing meaning. The difficulty is size: an unbounded field in one event can be megabytes.",
    k: ["Strict shared schema vs per-runtime formats: one server pipeline handles all clients, but runtimes with unusual error shapes must be squeezed into a common frame model.", "Optional typed interfaces vs one free-form blob: servers can index and render known fields, but every new concept needs a spec change and a rollout across clients.", "Client-assigned event identifier vs server-assigned: clients can show a reference to the user and retry safely, but must be trusted to generate unique values."],
    p: ["Letting arbitrary objects be attached without depth or size limits produces multi-megabyte events that are rejected whole, losing the error entirely.", "Reusing a field for a new meaning breaks older servers or clients silently."],
    v: "Capture one error from each supported runtime, decode the payloads, and confirm each validates against the same schema with identical field names for exception type, value, frames, timestamp and release.",
    dep: []
  },
  "sdk-configuration": {
    s: "Initialization of the capture library with its destination key, environment, release, sampling and hook settings, performed once at program start before any error can occur.",
    d: "The application calls an init function with a destination address that embeds a public project key, plus options: environment name, release string, sample rates, maximum breadcrumbs, allowed domains and callbacks. The SDK installs handlers and creates a root scope. Defaults must be safe because most applications never tune them. It is hard because init runs early and in odd places: before logging exists, in worker threads, in serverless handlers that freeze between calls, and in code bundled twice.",
    k: ["Single global client vs explicit client objects passed around: a global gives one-line setup, but multiple tenants or test isolation inside one process need escape hatches.", "Configuration at init only vs live remote configuration: init-only is predictable, while remote settings allow changing sample rates without a deploy but add a startup dependency."],
    p: ["Initializing after the first error handlers are needed means early crashes during startup are never reported.", "Omitting the release or environment makes later regression detection and filtering meaningless."],
    v: "Start the app with each option set, throw an error immediately, and confirm the received event carries the configured release, environment and sample rate, and that init failures with a malformed destination do not crash the app.",
    dep: ["event-model"]
  },
  "exception-capture": {
    s: "Turns a runtime's error object into the event model: type, message, an ordered list of frames, and the chain of causes, extracted without running application code that could itself fail.",
    d: "The SDK reads the runtime's error representation and builds exception values, each with a type, message and frames holding file, function, line, column and optionally surrounding source lines and local variables. Chained errors are flattened with their relationships kept. Frames are marked as application or library code. The difficulty is that stack formats vary by runtime and version, errors may be non-error objects such as strings, and capturing locals is both powerful and a privacy hazard.",
    k: ["Capturing local variables vs frames only: values make bugs reproducible, but increase payload size and the chance of recording secrets.", "Parsing the textual stack vs using runtime introspection APIs: text parsing works everywhere but breaks across versions, while introspection is exact but not always available.", "Walking the whole cause chain vs the top error: root causes become visible, at the cost of larger events and more complex grouping."],
    p: ["Throwing a plain string or object yields an event with no stack, so every occurrence groups together or not at all.", "Cyclic cause chains cause infinite loops in the serializer unless depth is bounded."],
    v: "Throw a nested error whose cause is a second error, and confirm the event contains both values in order, frames with line numbers and application flags, and that a thrown string still produces a usable event.",
    dep: ["event-model"]
  },
  "global-handlers": {
    s: "Hooks installed into the runtime that catch errors nobody handled: uncaught exceptions, rejected promises, fatal signals on the main thread and failed resource loads.",
    d: "On init the SDK registers with the runtime's last-resort handlers: the uncaught exception hook, the unhandled promise rejection event, window error events and thread-level handlers. It chains to any handler already installed rather than replacing it. Capturing at this point is the only way to see errors from code the team did not instrument. The difficulty is that the process may be about to die, so the event must be flushed synchronously, and handlers installed by two libraries can fight or double-report.",
    k: ["Wrapping existing handlers vs replacing them: chaining preserves other tools' behavior, but order bugs can swallow or duplicate events.", "Flushing before exit vs returning immediately: flushing records the fatal error but delays shutdown and can hang when the network is down, so it needs a short timeout."],
    p: ["A process that exits right after the handler runs drops the queued event, so the most severe errors are the ones least often seen.", "Reporting an error both from the global handler and from a framework integration shows it as two issues."],
    v: "Trigger an unhandled exception and an unhandled promise rejection in a test app that exits immediately, and confirm both arrive at the service exactly once, marked as unhandled.",
    dep: ["exception-capture", "sdk-transport"]
  },
  "native-crash-handlers": {
    s: "Signal and exception handlers for compiled code that record a minimal crash report, such as a minidump, when memory corruption or a fatal fault kills the process.",
    d: "When native code faults, the process is in an unsafe state: the heap may be corrupt and locks held. The handler runs on a pre-allocated stack and writes registers, thread stacks and loaded module identifiers to disk using only async-signal-safe calls. The report is uploaded on the next launch or by a separate watchdog process. It is hard because almost nothing is safe to call during a crash, and the report must carry build identifiers so the server can later find matching debug files.",
    k: ["In-process handler vs out-of-process watcher: in-process is simple but unreliable if the crash corrupts the handler, while a separate process survives but must be started and kept alive.", "Full memory dump vs minimal dump: full memory allows deep debugging, but files are very large and contain sensitive data."],
    p: ["Uploading from inside the crashed process hangs or corrupts, so reports are lost exactly when needed.", "A dump without module build identifiers cannot be symbolicated later."],
    v: "Force a null dereference in a release build, relaunch, and confirm a report with thread stacks and module build identifiers is uploaded and later resolves to source lines.",
    dep: ["offline-queue", "symbol-upload"]
  },
  "manual-capture-api": {
    s: "Explicit calls the developer makes to report a handled error or a message, with optional severity, extra data and a custom fingerprint.",
    d: "Not every problem throws. Code catches an error and decides it still matters, or records a warning condition. The API accepts an error or text, applies the current scope, and returns the event identifier. Options set level, tags, fingerprint and attached files for this call only. The difficulty is overuse: capture calls in a retry loop or a hot path produce huge volume, and capturing messages with interpolated values yields thousands of distinct issues.",
    k: ["Messages with embedded values vs templates plus parameters: values read well, but a template with separate parameters groups correctly.", "Per-call overrides vs scope-wide settings: per-call is precise, while scope settings keep code clean but affect later unrelated captures if not restored."],
    p: ["Capturing every caught error in a loop turns a transient dependency outage into millions of events and exhausts the quota.", "Capturing a message instead of the error object throws away the stack."],
    v: "Call capture inside a catch block with a tag and a level of warning, and confirm the issue shows that tag and level, the original stack, and a returned event identifier that matches the stored event.",
    dep: ["event-model", "scope-isolation"]
  },
  "before-send-hooks": {
    s: "A user-supplied callback that receives each finished event just before transmission and may modify it, scrub it or drop it, the client-side last line of defense.",
    d: "After the SDK builds an event, it passes it to a hook that returns the event, a changed copy or nothing. Teams use it to remove sensitive fields, drop known-noisy errors, rewrite messages or attach data. It runs inside the application, so it sees data before any server-side scrubbing and keeps it off the network entirely. The risk is the hook itself: it runs on the error path, so a bug in it can hide every error or throw during a crash.",
    k: ["Client-side scrubbing vs server-side only: client-side data never leaves the machine, but each runtime and version needs its own implementation to maintain.", "Synchronous hooks vs asynchronous: synchronous is predictable and fast, while async allows lookups but can delay or lose events at shutdown."],
    p: ["A hook that throws or returns nothing by mistake silently drops every event, and nobody notices because no errors arrive.", "Slow hooks add latency to the failing request."],
    v: "Install a hook that strips an email field and drops events matching a known message, send both kinds, and confirm the stored event has no email and the dropped one never reaches the ingest endpoint.",
    dep: ["event-model", "sdk-configuration"]
  },
  "sdk-transport": {
    s: "The component that serializes events, sends them over HTTP without blocking the app, and obeys the server's rate-limit and retry signals.",
    d: "Events are placed in a bounded in-memory queue and sent by a background worker or async call, compressed, to the ingest endpoint with the project key. It reads response headers carrying rate-limit information and pauses the affected categories until the stated time. Failures are retried with backoff, and when the queue is full the oldest or newest event is dropped. It must never block the host request, never grow memory without bound and never recurse by reporting its own failures.",
    k: ["Dropping when the queue is full vs blocking the caller: dropping protects the application, at the cost of silently losing events during an outage.", "Retrying aggressively vs respecting server backoff: fast retries recover quickly, but retries during a server overload add to the load that caused it."],
    p: ["A transport error that is itself reported as an event creates a feedback loop during a network outage.", "Ignoring the retry-after signal keeps hammering a limited project and extends the block."],
    v: "Point the client at a server that returns a rate-limit response with a delay, send events for a minute, and confirm none are sent until the delay passes and memory use of the queue stays flat.",
    dep: ["ingest-endpoint", "event-model"]
  },
  "offline-queue": {
    s: "Persistence of events to local disk when the network is unavailable or the process is dying, so they are sent later at the next opportunity.",
    d: "Mobile devices, desktop apps and crashing processes cannot count on a connection at the moment of failure. The SDK writes the envelope to a bounded directory, with a cap on count and total size, and a sender drains it at the next launch or when connectivity returns, oldest first. Stale entries expire. It is hard because of file corruption on abrupt exit, concurrent processes writing the same directory, and replaying old events whose release has since been fixed.",
    k: ["Persisting every event vs only fatal ones: persisting all maximizes delivery, but disk writes cost battery and storage on constrained devices.", "Replaying oldest first vs newest first: oldest-first preserves chronology, but a long backlog delays the most relevant recent events."],
    p: ["An unbounded cache fills the user's storage and gets the application blamed.", "Replaying a thousand queued events when a device reconnects triggers rate limits for that project."],
    v: "Disable the network, trigger three errors and force-quit, restore the network and relaunch, and confirm all three arrive once with their original timestamps and no duplicates.",
    dep: ["sdk-transport"]
  },
  "breadcrumbs": {
    s: "A bounded, time-ordered list of recent events in the app, such as clicks, navigation, requests and log lines, attached to each error to show what led up to it.",
    d: "As the program runs, integrations push short records into a ring buffer: category, message, level, timestamp and small data. Typical sources are user interface events, route changes, network calls, console output and state transitions. When an error is captured, the current buffer is copied into the event. The buffer is capped, commonly around a hundred entries, so memory stays small. The difficulty is deciding which activity is signal, and keeping sensitive values in URLs and messages out.",
    k: ["Automatic collection vs manual: automatic coverage reveals unexpected paths, but a noisy source can push out the useful entries from a bounded buffer.", "Fixed ring size vs size by time window: fixed size is cheap and predictable, but a burst of activity can erase the earlier cause."],
    p: ["Recording request URLs with tokens in the query string stores secrets in every event.", "A chatty log source fills the buffer so the one relevant breadcrumb is gone when the error fires."],
    v: "Click through three screens, make a failing network request and throw an error, and confirm the event lists the navigation, the request with its status, and the click, in order and with timestamps.",
    dep: ["scope-isolation", "event-model"]
  },
  "scope-isolation": {
    s: "The container for ambient data such as tags, user and breadcrumbs, with a rule for which scope an error picks up when many requests or tasks run at once.",
    d: "Context set in one place should appear on errors raised later in the same logical operation, but never on unrelated concurrent work. SDKs therefore keep a stack of scopes: a global one, a current one per request or task, and temporary ones pushed for a block. Capturing merges them. Isolation depends on the runtime's concurrency model: thread-local storage, async-local storage or explicit passing. It is hard because asynchronous continuations can lose the scope.",
    k: ["Implicit current scope vs explicit scope parameter: implicit keeps code clean, but fails silently across thread pools, callbacks and some async boundaries.", "Copy-on-fork scopes vs shared mutable scope: copies prevent leakage between requests, at the cost of allocation per request."],
    p: ["Setting the user on a global scope in a server leaks one customer's identity onto another customer's errors.", "Context lost across an async boundary shows errors with no tags, so filters miss them."],
    v: "Handle two overlapping requests that set different users and throw errors, and confirm each stored event carries only its own request's user and tags, including after an awaited call.",
    dep: ["event-model"]
  },
  "user-context": {
    s: "Optional identification of the affected person on an event, such as an identifier or a username, used to count how many users an issue touches.",
    d: "The application sets a user object with an identifier and optionally email, username and address on the scope. The server uses the identifier to count distinct users per issue, which ranks impact better than raw event counts: one user in a loop is not a thousand users. Where no identifier is set, the service can derive an anonymous one from the network address. The tension is value against privacy: richer data speeds support, but increases what must be protected and deleted on request.",
    k: ["Stable pseudonymous identifier vs email or name: a pseudonym counts users with little exposure, but support must map it back through the application's own database.", "Deriving users from IP address vs requiring an explicit identifier: IP works with zero code, but is wrong behind shared addresses and is itself personal data."],
    p: ["Sending email addresses by default puts personal data into a system that was not designed for deletion on request.", "Changing the identifier scheme resets distinct-user counts and makes an old issue look new."],
    v: "Raise the same error from five distinct identifiers and ten times from one, and confirm the issue reports five affected users and fifteen events.",
    dep: ["scope-isolation"]
  },
  "request-context": {
    s: "Environmental facts attached to an event: the HTTP request with method, URL and headers, the device model and operating system version, and the runtime and version.",
    d: "Framework integrations read the in-flight request and add its URL, method, selected headers and a bounded body, while platform code adds device, operating system, memory, orientation or locale. The server later derives browser and device families from the strings. This context explains why only certain clients fail. It is hard because bodies and headers carry credentials and cookies, so there must be an allowlist or scrubber, and because the amount of useful context differs wildly across runtimes.",
    k: ["Denylist of sensitive headers vs allowlist of safe ones: a denylist keeps more useful data but misses custom secret headers, while an allowlist is safer and loses detail.", "Capturing request bodies vs omitting them: bodies reproduce bugs, but may contain anything the user typed."],
    p: ["Cookies and authorization headers included by default put session credentials into stored events.", "Capturing a large upload body inflates events past the size limit, so the error is dropped."],
    v: "Send a request with an authorization header and a cookie that triggers a server error, and confirm the stored event shows method, URL and device context but those two headers appear filtered.",
    dep: ["scope-isolation", "event-model"]
  },
  "auto-instrumentation": {
    s: "Patches applied by the SDK to common libraries and runtime functions so that errors, requests and log lines are captured without developer code.",
    d: "At init the SDK wraps well-known points: the framework's error handler, the HTTP client, the database driver, the console and timer functions. Each wrapper records breadcrumbs, attaches request context or reports failures, then calls the original. This gives useful data with a one-line setup. The risk is that wrapping changes behavior: it can break under library upgrades, alter stack traces, add overhead on hot paths, or conflict with another tool that wraps the same function.",
    k: ["Monkey-patching at runtime vs official extension points: patching works with any library, but is fragile across versions, while hooks are stable but exist only where the library provides them.", "Enabled by default vs opt-in: default coverage gets most users value immediately, but surprises teams with data they did not expect to send."],
    p: ["Two monitoring libraries wrapping the same function can recurse or report each error twice.", "A wrapper that swallows or rethrows incorrectly changes the application's behavior only when the tool is installed."],
    v: "Install the SDK in an app using a framework and an HTTP client, trigger a handler error and a failed outbound call without adding capture code, and confirm both appear with request context and breadcrumbs, and behavior is unchanged without the SDK.",
    dep: ["breadcrumbs", "request-context", "exception-capture"]
  },
  "trace-linking": {
    s: "Attaching the current distributed trace and span identifiers to an error so an engineer can jump from the failure to the request that crossed several services.",
    d: "When the application participates in tracing, the SDK reads the active trace and span identifiers and writes them into the event's context. If the service also receives traces, the error view links to the full request timeline, and the trace view marks spans where errors occurred. The SDK also propagates trace headers on outbound calls so a downstream error shares the upstream trace. The difficulty is that it depends on a second system being enabled and sampled consistently.",
    k: ["Always attaching identifiers vs only when sampled: always attaching is cheap and reliable, but the linked trace may have been dropped by trace sampling, producing dead links.", "Propagating via standard headers vs private ones: a standard header interoperates with other tools, but private ones can carry extra sampling data."],
    p: ["Links that lead to traces dropped by sampling make users distrust the feature.", "A proxy that strips the propagation header splits one request into disconnected traces."],
    v: "Make a request through two services where the second throws, and confirm its error carries the same trace identifier as the first service's span, and the link opens the complete trace.",
    dep: ["scope-isolation", "event-model"]
  },
  "session-tracking": {
    s: "Records the start, end and outcome of each user session so the service can compute how many sessions and users were affected by errors in a release.",
    d: "The SDK starts a session on app launch or first request and marks it healthy, errored, crashed or abnormally ended, sending a small session update rather than a full event. Aggregated per release, the counts yield crash-free rates, independent of how many events each failure produced. Server-side applications often send pre-aggregated counts per interval instead. It is hard because abnormal exits cannot report themselves, so the next launch must infer a crash from a leftover marker.",
    k: ["Per-session updates vs pre-aggregated counts: per-session allows distinct-user rates, but at high request rates aggregation is the only affordable choice.", "Inferring crashes from stale markers vs only explicit reports: inference catches silent kills and out-of-memory exits, but can misclassify a device that simply lost power."],
    p: ["Sampling errors but not sessions skews the health rate, since the numerator and denominator come from different sampling.", "Counting every request as a session makes a web service's crash-free percentage meaningless."],
    v: "Run one hundred sessions of which three crash and two hit handled errors, and confirm the release shows ninety-seven percent crash-free sessions and five errored sessions.",
    dep: ["sdk-transport", "user-context"]
  },
  "ingest-endpoint": {
    s: "The public HTTP receiver that accepts events from every client, answering quickly and handing the payload onward, since slow replies are paid for by the monitored app.",
    d: "A horizontally scaled, stateless front end terminates TLS, reads the request, checks the project key and basic limits, writes the raw body to a queue and returns a small acknowledgment with an event identifier. Heavy work is deferred. It serves browsers, servers and devices over many network conditions, accepts compressed bodies and answers cross-origin preflight requests. It is hard because it faces the open internet with load set by clients' bugs: one bad deploy can multiply traffic instantly.",
    k: ["Acknowledging after enqueue vs after processing: early acknowledgment keeps clients fast and absorbs bursts, but the client cannot learn that its event was later dropped.", "A thin stateless edge vs validation at the edge: thin scales trivially and fails safe, while validating early rejects junk before it costs queue space."],
    p: ["Doing database lookups per request for key validation couples availability of the entire service to a database.", "Returning errors to the client on overload causes retry storms that worsen the overload."],
    v: "Send a valid event and a malformed one at thousands of requests per second, and confirm the valid one returns an identifier within a low-latency budget and appears in the queue, while the malformed one is rejected without reaching it.",
    dep: ["project-keys", "ingest-queue", "envelope-parsing"]
  },
  "project-keys": {
    s: "Public client keys that identify the destination project for events, validated against a cached key table, with revocation and per-key limits.",
    d: "Each project has one or more keys embedded in the application, and in browsers they are visible to anyone. A key therefore identifies rather than secures: it lets a client write events and nothing else. The ingest layer checks it against a replicated cache of active keys, which holds the project, its quotas and its filter settings. Keys can be disabled or rate-limited separately to cut off an abusive source without deleting the project. The trade-off is that anyone can send fake events.",
    k: ["Public write-only keys vs secret keys: public keys fit browser and mobile clients, but cannot stop forgery, so spam must be handled by filters and limits.", "Cached key table vs lookup per request: caching keeps ingest fast and independent of the database, but a revoked key stays valid until the cache refreshes."],
    p: ["A leaked key used by a scraper floods a project and exhausts its quota for legitimate events.", "Rotating a key without a grace period cuts off every deployed client that still holds the old one."],
    v: "Disable a key and confirm requests using it are rejected within the cache refresh interval while other keys for the same project continue, and a request with an unknown key is rejected cheaply.",
    dep: ["issue-store"]
  },
  "envelope-parsing": {
    s: "Decoding of the wire container that bundles an event, attachments, sessions and other items into one request with a header describing each part.",
    d: "Rather than one JSON body per request, clients send an envelope: a header line, then a series of items each with its own header giving type and length, followed by payload. This lets one request carry an event, a crash dump and session data, and lets the server route items without parsing the payload. Parsing must be streaming and bounded, tolerate unknown item types from newer clients, and reject truncated or inconsistent lengths. It is hard because of compressed bodies and hostile input.",
    k: ["Typed multi-item envelopes vs separate endpoints per data type: envelopes batch and evolve without new endpoints, but every parser must skip unknown items safely.", "Length-prefixed items vs delimiters: lengths allow skipping without scanning, but a lying length can desynchronize the rest of the body."],
    p: ["Decompressing without a limit lets a small body expand into gigabytes.", "Failing the whole request on one unknown item type blocks older servers from accepting newer clients."],
    v: "Send an envelope with an event, a dump and an item type the server does not know, and confirm the first two are accepted, the third is skipped without error, and a body with a wrong length is rejected.",
    dep: ["payload-limits"]
  },
  "payload-limits": {
    s: "Hard ceilings on request size, decompressed size, item count and field depth so no single client can consume disproportionate memory or storage.",
    d: "Different parts have different caps: a small limit for an event, a larger one for an attachment, a cap on decompressed size, on the number of items in an envelope and on the nesting depth of JSON. Limits are checked while streaming so oversized bodies are cut off early. When the event itself is too large but valid, some systems trim the biggest fields instead of dropping it. The difficulty is choosing numbers that block abuse yet allow real stack traces and breadcrumbs.",
    k: ["Reject oversized events vs trim them: rejecting is simple and honest, but loses the error, while trimming keeps it with less detail and needs rules about what to remove first.", "Limits at the edge vs inside processing: at the edge they stop abuse early, while processing limits protect later stages that have different constraints."],
    p: ["Limits that differ between edge and processing let a payload pass one and crash the other.", "A limit set below legitimate large stack traces silently drops the very errors of deeply recursive failures."],
    v: "Submit events just under and just over each limit, including a compressed body that inflates past the cap, and confirm the under-limit ones are stored and the over-limit ones are refused or trimmed as specified, with memory use flat.",
    dep: []
  },
  "event-normalization": {
    s: "Server-side cleanup that coerces each event into the canonical schema: truncating strings, fixing types, defaulting missing fields and dropping unknown ones.",
    d: "Clients differ in version and quality, so the server cannot trust the event's shape. Normalization checks types, limits string and list lengths, converts timestamps to one format, fills in defaults such as platform and level, and records any corrections as metadata for debugging. It is deliberately forgiving: a mistake in one field should lose that field, not the event. The difficulty is doing this fast, since every event passes through it, and keeping it consistent with what clients produce today.",
    k: ["Lenient repair vs strict rejection: repair keeps events from buggy clients, but hides client bugs, so corrections are recorded for later diagnosis.", "Normalizing before queueing vs after: before gives consumers a clean contract, but puts cost on the latency-sensitive edge."],
    p: ["Timestamps in the future or in seconds instead of milliseconds place events in the wrong time partition.", "Silent truncation of a long message changes its grouping without anyone knowing."],
    v: "Feed events with wrong types, an oversized message, a missing level and a timestamp in the future, and confirm each is stored in canonical form, with the corrections listed in the event's metadata.",
    dep: ["event-model", "payload-limits"]
  },
  "attachment-intake": {
    s: "Receiving large binary items such as native crash dumps, screenshots and log files, stored separately from the event with their own size limits and retention.",
    d: "Attachments travel as envelope items and are streamed straight to object storage, linked to the event by identifier. A crash dump also triggers a native processing step that produces an event from it. Attachments are far larger than events, so they have separate quotas and shorter retention. They also hold the most sensitive data, since a dump contains memory contents. The difficulty is ordering: the attachment may arrive before, after or without its event, and the two must be joined later.",
    k: ["Streaming to object storage vs buffering in the receiver: streaming keeps memory flat, but a failed upload mid-stream leaves partial objects to clean up.", "Separate attachment quota vs shared quota: separate keeps a flood of dumps from consuming event budget, but adds another limit to configure and explain."],
    p: ["A dump retained as long as events keeps memory contents from users far longer than anyone intended.", "An orphan attachment whose event was dropped by sampling stays in storage forever without a cleanup job."],
    v: "Upload a crash dump with an event and a second dump whose event is filtered, and confirm the first is linked and retrievable, and the second is removed by the cleanup job.",
    dep: ["blob-store", "envelope-parsing"]
  },
  "edge-relay": {
    s: "A proxy deployed in front of or beside the service, in the customer's network or domain, that forwards events so ad blockers and egress rules do not block them.",
    d: "Browsers often block requests to known monitoring domains, so the application can send events to its own domain, where a tunnel endpoint forwards them to the service. A relay can also sit inside a private network, buffering and forwarding events, applying filters, scrubbing and rate limits locally before anything leaves. It reduces the load on the central ingest. The cost is another component for the customer to run and keep up to date, and one more place where data passes through.",
    k: ["First-party tunnel vs direct send: a tunnel survives blockers and keeps data on the customer's own domain, but needs extra deployment and open forwarding that can be abused.", "Relay-side scrubbing vs central scrubbing: scrubbing at the relay keeps data inside the network, but the rules must be distributed and kept in step."],
    p: ["An open tunnel that forwards to arbitrary destinations becomes an abuse vector.", "A relay that is down silently drops events if clients do not fall back or queue."],
    v: "Block the service's domain at the client network, send errors through the tunnel path, and confirm they arrive; then stop the relay and confirm clients queue and deliver after it returns.",
    dep: ["ingest-endpoint"]
  },
  "ingest-queue": {
    s: "A durable, partitioned log between the front door and processing that absorbs bursts and decouples ingest speed from processing speed.",
    d: "After the cheap checks, the raw event is appended to a partitioned log keyed by project or event so ordering and load can be controlled. Processing workers consume at their own pace and track their position, so a slow stage creates lag instead of dropped data. The queue is the buffer that makes the rest of the system survivable. It is hard because of partition skew, where one huge project fills one partition, and because retention must outlast the longest outage of consumers.",
    k: ["Partition by project vs by event identifier: by project keeps related events together and enables per-project control, but hot projects create uneven partitions.", "Long retention vs short: long retention allows reprocessing after bugs, at the cost of storage and of replaying stale data."],
    p: ["A single noisy project saturating one partition delays every other project on it.", "Consumers that crash mid-batch and re-read can process an event twice unless later stages are idempotent."],
    v: "Stop the processing consumers for ten minutes under steady load and confirm ingest still acknowledges, lag grows, and after restart all events are processed with no loss.",
    dep: []
  },
  "data-volume-economics": {
    s: "Error volume is set by faults, not by users or contracts, so every layer must bound what it accepts, stores and keeps against a budget.",
    d: "One bad release can emit thousands of times the usual events in minutes, while storage and compute are billed by volume. The same decision therefore appears in the SDK as sample rates and limits, at the edge as quotas and spike protection, in processing as dedup and filters, and in storage as retention tiers. Cost control must be fair, so that a noisy project cannot starve others, and must degrade by dropping the least valuable data first, never the first occurrence of a new issue.",
    k: ["Dropping at the client vs at the server: client drops save bandwidth and cost, but the server can no longer count what was dropped unless the client reports it.", "Per-project quotas vs a global pool: per-project fairness protects neighbors, but unused capacity cannot flow to a project in need.", "Keeping every event vs sampling repeats: all events allow exact counts, but repeats of one issue add cost with little information."],
    p: ["Dropping events without recording counts makes charts show a quiet system when the system is actually being throttled.", "Retention set once for all data keeps worthless repeats as long as rare, valuable events."],
    v: "Trigger a ten-thousand-fold error burst in one project and confirm its excess is limited with the drop counts recorded, new issues still appear, and other projects' events are processed without added delay.",
    dep: ["rate-limiting", "tiered-retention", "dynamic-sampling"]
  },
  "privacy-and-compliance": {
    s: "Errors capture whatever the program held, so rules about personal data, retention and location must be enforced at capture, on the wire, in storage and on deletion.",
    d: "Personal data enters through messages, variables, URLs, headers, user fields and dumps, and the same decision shows up at every layer: what the SDK collects, what the edge strips, what scrubbing removes, which region stores data, how long it stays and how a user's data is found and deleted. Defense is layered because no single stage catches everything. The hard problem is deletion: copies exist in the event store, aggregates, attachments, search indexes and backups.",
    k: ["Scrub on the client vs on the server: client scrubbing keeps data off the network, but server scrubbing covers old and unmaintained clients, so both are used.", "Collect little by default vs collect richly with filters: little by default is safer, but makes some bugs hard to diagnose.", "Delete by user identifier vs by retention expiry: identifier deletion answers requests but needs an index of where data lives, while expiry is simple but slow."],
    p: ["A scrubber applied after the queue means raw secrets already sit in the queue's logs and backups.", "Aggregates and search indexes retained after event deletion keep traces of the removed data."],
    v: "Send events containing a card number, a token and an email, then request deletion of that user, and confirm the stored events never contained the card or token, and no store returns the email afterward.",
    dep: ["scrubbing-rules", "retention-deletion", "data-residency"]
  },
  "event-schema-evolution": {
    s: "Clients are upgraded on their own schedule, some never, so the event format and every consumer must accept old and new versions at once.",
    d: "Applications embed SDKs that may stay unchanged for years, while the server adds fields and rules every month. The compatibility decision shows up in the event model, in envelope parsing that skips unknown items, in normalization that repairs old shapes, in grouping algorithms whose versions are pinned per project, and in stores that must read old rows. The rule is additive change only: add optional fields, never change meaning, and keep each old behavior until its clients are gone.",
    k: ["Additive-only evolution vs versioned breaking changes: additive keeps all clients working, but accumulates legacy handling that must be carried forever.", "Pinning grouping per project vs upgrading everyone: pinning avoids sudden regrouping of existing issues, but leaves projects on old behavior until they opt in."],
    p: ["Reinterpreting an existing field changes the meaning of years of stored events.", "Dropping support for an old client version silently stops error reports from apps that cannot easily be updated."],
    v: "Replay a corpus of events from every SDK version ever released against the current server and confirm all are accepted, produce the same fingerprints under their pinned versions, and render correctly.",
    dep: ["event-model", "grouping-config-versions", "event-normalization"]
  },
  "tenant-isolation": {
    s: "Many customers or projects share the same queues, workers and stores, so quotas, limits and fairness controls must keep one tenant's problems from becoming everyone's.",
    d: "Isolation operates at several points: per-project rate limits at ingest, partitioning in the queue, per-project processing budgets, row-level tenancy in stores and access checks in the interface. The failure mode is the noisy neighbor, a project whose burst saturates a shared resource. The second concern is data separation, where one tenant must never read another's events. Strong separation costs more through dedicated resources, so it is applied by tier.",
    k: ["Shared infrastructure with quotas vs dedicated per tenant: shared is far cheaper and absorbs uneven load, but needs accurate limits and has a larger blast radius.", "Tenant key on every row vs separate databases: row keys scale simply, while separate databases isolate failures and deletions but multiply operational work."],
    p: ["A query without the tenant filter, in a rarely used endpoint, exposes another customer's events.", "Quotas enforced per instance rather than globally let a tenant exceed its limit by the number of instances."],
    v: "Drive one project at maximum rate while measuring a second project's end-to-end latency, and confirm the second is unaffected; then query every endpoint with a token from a different tenant and confirm none returns data.",
    dep: ["rate-limiting", "permissions", "ingest-queue"]
  },
  "delivery-guarantees": {
    s: "An event passes through many hops, each of which may retry or drop it, so the system must define what it promises: at-least-once delivery, with idempotent processing.",
    d: "From the SDK queue through the network, ingest, the log, processing and storage, any hop can fail after doing part of its work. Exactly-once is impractical, so the pipeline retries and accepts duplicates, and stages deduplicate by event identifier. Some data is deliberately best-effort: events are dropped under load, while first occurrences and session data are protected. The system should say where loss can occur and make every deliberate drop countable.",
    k: ["At-least-once with idempotent stages vs at-most-once: at-least-once loses less, but needs dedup in every stage, while at-most-once is simple and loses events on any failure.", "Protecting new issues over repeats during overload: you learn of new failures even when saturated, at the cost of undercounting repeats."],
    p: ["Retries without a stable event identifier create duplicate counts after any restart.", "A hop that drops without counting makes the loss invisible to users and operators alike."],
    v: "Kill a processing worker mid-batch and drop one network request during a test run, and confirm every sent event appears exactly once in storage and every deliberate drop appears in the drop counters.",
    dep: ["event-deduplication", "ingest-queue", "sdk-transport"]
  },
  "self-observability": {
    s: "The service must be monitored as carefully as the applications it watches, and by something that does not depend on itself.",
    d: "Ingest rate, queue lag, processing latency per stage, drop reasons, symbolication failures, store lag and alert delivery time must be measured and alerted on. Error tracking is also an application that can fail: its own exceptions need a separate path, because reporting through itself fails exactly when it is broken. Key indicators are end-to-end latency, from the client send to the issue appearing, and the fraction of events dropped by cause, which together show whether users can trust what they see.",
    k: ["Monitoring through a separate system vs dogfooding: a separate system still works during an outage, while dogfooding finds real usability problems but fails when needed most.", "End-to-end synthetic events vs component metrics: synthetic events prove the whole path works, while component metrics locate the fault."],
    p: ["Alert delivery that depends on the same queue as ingest goes silent during a queue backlog.", "A canary that checks only the front door stays green while processing is hours behind."],
    v: "Inject a synthetic error every minute from a client and confirm its time to appear as an issue is plotted; stall one processing stage and confirm the alert fires through a path independent of that stage.",
    dep: ["processing-pipeline", "ingest-queue", "notification-routing"]
  }
});
