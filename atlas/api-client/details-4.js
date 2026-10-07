// Details for the API client plate, part 4: mock servers, protocol clients, storage, secrets.
ATLAS.details("api-client", {
  "mock-engine": {
    s: "The server component that receives requests aimed at a mock and returns configured responses, with routing, status, headers, body and delay.",
    d: "It listens on a local or hosted address, matches each incoming request to a stored example or rule, renders the response and returns it, logging every call. Responses can use templates that reference request data. It runs in the same process as the tool or as a separate service. It is hard to behave like the real service on the details that matter, such as headers, error shapes and content negotiation, while remaining simple enough that people can set it up in minutes.",
    k: ["Embedded in the tool versus a separate hosted service: embedded needs no infrastructure and is reachable only from one machine; hosted is shared and requires accounts and network exposure.", "Responses from saved examples versus rules written by hand: examples are quick and static; rules are flexible and become a second program."],
    p: ["The mock returns success for a request the real service would reject, so the client under development never handles the error.", "A mock's port conflicts with another local server and requests go to the wrong place."],
    v: "Start a mock from a collection, call it from a separate client process, and confirm the response body, status and headers match the saved example and the call appears in the mock's request log.",
    dep: ["request-matcher", "request-examples", "http-client"]
  },
  "request-matcher": {
    s: "Chooses which saved response answers an incoming mock request by comparing method, path, query, headers and body, with a defined order when several match.",
    d: "Rules compare incoming requests to examples using exact, pattern and structural matching, and pick the most specific. Path templates extract parameters that responses can echo. When nothing matches the mock returns a configurable default or an error. Matching on bodies requires parsing by content type. It is hard because ambiguity must be resolved predictably, and because over-strict matching makes the mock reject valid calls while over-loose matching returns the wrong example.",
    k: ["Most specific wins versus first match in order: specificity is intuitive for authors, but harder to predict with overlapping rules; order is explicit and fragile.", "Matching on headers and bodies versus path only: richer matching reproduces real behavior, and makes mocks brittle against harmless client changes."],
    p: ["A new optional query parameter in the client causes every call to miss its example.", "Two examples match equally and the one served depends on the order they were saved."],
    v: "Create three overlapping examples, send requests that should match each, and confirm the most specific is chosen every time, and an unmatched request returns the documented default.",
    dep: ["request-examples", "response-queries"]
  },
  "schema-mock-generator": {
    s: "Produces mock responses from an API description's schemas and examples, so a mock exists for every operation before anyone writes an example by hand.",
    d: "The generator reads response schemas for each operation and status, builds bodies with the example synthesizer, honors content types and headers, and can choose a status from a request hint such as a header. Seeds make responses repeatable. It lets front-end teams start when only the description exists. It is hard because generated data is valid but meaningless, relationships between values are lost, and the description may not cover errors.",
    k: ["Static generation once versus per request: once is stable and predictable; per request varies and exercises client robustness.", "Following the description strictly versus injecting invalid data: strict output supports normal development, while deliberate violations test client error handling."],
    p: ["Generated lists are always empty or always one item long, so the interface is never tested with realistic volumes.", "The description is wrong and the mock faithfully reproduces the mistake."],
    v: "Generate a mock from a description and validate every response against its own schema across many seeded calls. All must pass, and the same seed must repeat the same body.",
    dep: ["example-synthesis", "mock-engine", "schema-assertions"]
  },
  "stateful-mocks": {
    s: "Mocks that remember what was written to them, so a create followed by a read returns the created data, letting multi-step flows work against a simulated service.",
    d: "An in-memory store sits behind the mock, with handlers or rules that insert, update, delete and query records based on requests. State can be reset between runs, seeded at start and inspected. Scenario modes change responses over time, for example failing the second call. It is hard because it begins to reimplement the real service's logic, drifts from it, and gets complicated to keep correct.",
    k: ["Stateless canned responses versus stateful behavior: stateless is simple and cannot model flows; stateful supports real scenarios and approaches a second implementation.", "Persisting state across restarts versus reset on start: persistence helps long demos, and makes tests order dependent."],
    p: ["State left from one test run changes the result of the next.", "The mock enforces a rule differently from the service, and client code is built around the wrong behavior."],
    v: "Create a record through the mock, read it back, delete it, read again and confirm a not-found response, then reset state and confirm the initial data is restored exactly.",
    dep: ["mock-engine", "request-matcher"]
  },
  "fault-injection": {
    s: "Adds delays, error statuses, dropped connections and malformed bodies to mock responses on demand, so client resilience can be tested.",
    d: "Rules attach faults to routes or to a fraction of calls: a fixed or random delay, an error status, a closed connection mid-body, a slow trickle of bytes, or invalid content. They can be switched by header, by time or by scenario step. The mock must produce faults at the transport level, not only at the application level. It is hard because realistic network faults involve connection behavior, such as resets and partial writes, that a simple response object cannot express.",
    k: ["Probabilistic faults versus scripted sequences: probabilistic faults find unexpected weaknesses and are hard to reproduce; scripted sequences are repeatable and test only what was imagined.", "Faults at the HTTP level versus the transport level: HTTP-level faults are easy to configure, while transport-level faults reproduce real network failures and need lower-level control."],
    p: ["Fault rules left enabled in a shared mock make unrelated teams see random failures.", "Only error statuses are tested, so the client's handling of a dropped connection is never exercised."],
    v: "Configure a delay, an error status and a mid-body disconnect, call the mock from a client and confirm each fault is observed as configured: latency within tolerance, the status, and a truncated read.",
    dep: ["mock-engine", "http-client"]
  },
  "mock-hosting": {
    s: "Makes a mock reachable by other people and machines, through a hosted address or a tunnel to the local one, with access control and request logs.",
    d: "A hosted mock gets a stable URL managed by the service, possibly private with a key. A local mock can be exposed through a tunnel that relays requests from a public address. Logs show every call for debugging integrations. Environment variables swap the real base URL for the mock one. It is hard because exposing a local machine has security consequences, hosted mocks are one more internet-facing system, and URLs shared in documents outlive the project.",
    k: ["Hosted persistent URLs versus temporary tunnels: persistent URLs suit teams and long projects, and need cleanup; tunnels are quick and disappear when the session ends.", "Public by default versus access key required: public is easy to try and exposes example data; keys protect and add friction for every consumer."],
    p: ["A tunnel to a local mock stays open after the demo and exposes the developer's machine to the internet.", "A mock URL committed in application configuration keeps being used long after the real service exists."],
    v: "Expose a mock, call it from another network with and without the access key, and confirm the keyless call is refused, the logs show both attempts, and closing the tunnel stops all access.",
    dep: ["mock-engine", "workspaces-and-roles"]
  },
  "http-client": {
    s: "The core transport for HTTP/1.1 requests: connection management, serialization on the wire, response parsing, keep-alive and chunked transfer, with control over details.",
    d: "It opens connections, writes the request line, headers and body exactly as given, reads status, headers and body with framing by length or chunks, and manages connection reuse and timeouts. Unlike an application library, it must allow malformed or unusual messages for testing: duplicate headers, odd casing, bodies on any method. It reports raw details to the console. It is hard because correctness for the common case is easy and exact control of the uncommon case is not.",
    k: ["A general-purpose library versus a custom transport: a library is mature and normalizes messages in ways testing tools want to avoid; custom code gives exact control and risks bugs in framing.", "Connection reuse by default versus fresh connections: reuse is faster and matches clients, and hides handshake cost and connection-specific bugs."],
    p: ["The library silently rewrites a header so the request on the wire differs from what the editor showed.", "A reused connection closed by the server causes a spurious failure on the next request."],
    v: "Send requests with duplicate headers, unusual casing and a body on a GET to a capture server, and diff the bytes received with the configuration. They must match exactly.",
    dep: ["tls-stack", "dns-resolver"]
  },
  "http2-http3": {
    s: "Transport support for multiplexed and UDP-based HTTP versions, including negotiation, stream handling and the differences visible to the person testing.",
    d: "The client negotiates version during the TLS handshake or through service hints, then sends requests as frames on multiplexed streams. The newer version runs over a datagram transport with its own handshake and recovery. The tool shows which version served each call and lets people force one. It is hard because header compression and pseudo-headers differ from the text protocol, because servers fall back silently, and because middleboxes block the UDP-based version.",
    k: ["Automatic negotiation versus a forced version: automatic matches real clients and hides which version was used; forced isolates version-specific bugs and may not mirror users.", "Showing frames versus a normalized message: frames help with deep debugging and overwhelm most users; a normalized message is readable and hides version differences."],
    p: ["The tool falls back to an older version silently, so a bug in the newer path is never reproduced.", "Header names shown in mixed case are lowercased on the wire and break an assertion."],
    v: "Call a server that supports all three versions, force each in turn, and confirm the console reports the negotiated version and the server log agrees. Block UDP and confirm the fallback is reported.",
    dep: ["http-client", "tls-stack"]
  },
  "tls-stack": {
    s: "Handles encrypted connections: protocol versions, cipher choices, certificate validation against a trust store, client certificates and diagnostics for failures.",
    d: "The stack performs the handshake, validates the server's certificate chain, name and validity period against system or custom trust roots, and negotiates protocol and application protocol. It exposes controls for testing, such as skipping verification, selecting versions and adding trusted authorities. Failures should explain what went wrong: expired, wrong name, unknown issuer. It is hard because the security setting that makes testing convenient, turning verification off, is the one that most damages safety when left on.",
    k: ["System trust store versus a bundled one: system store honors enterprise settings and varies by machine; bundled is consistent and ignores local trust decisions.", "A global verification switch versus per-host exceptions: global is simple and dangerous; per-host exceptions are safe and fiddly."],
    p: ["Verification is disabled to reach a staging server and remains disabled for production calls.", "A handshake failure is reported only as a connection error, sending people to debug the wrong layer."],
    v: "Call servers with an expired, a wrong-name and an unknown-issuer certificate, and confirm each fails with a distinct message. Then add a per-host exception and confirm only that host connects.",
    dep: ["dns-resolver"]
  },
  "dns-resolver": {
    s: "Resolves host names to addresses, with caching, overrides for testing, IPv4 and IPv6 choice, and control over which address is used.",
    d: "The resolver asks the system or a configured server, caches answers according to their lifetime, and returns several addresses that the connector tries in order. Host overrides let people point a name at a specific address, for example a staging machine, without editing system files. Name lookup time is part of the timing breakdown. It is hard because stale caches send requests to retired addresses, and because happy-eyeballs behavior between address families changes which server answers.",
    k: ["Using the system resolver versus a built-in one: system resolution matches other programs and hides details; built-in resolution gives control and timing and ignores local configuration.", "Caching aggressively versus honoring each lifetime: aggressive caching is fast and stale; honoring lifetimes is correct and costs lookups."],
    p: ["A cached address points at a decommissioned server for minutes after a cutover.", "A host override persists in the workspace and sends production names to a test machine."],
    v: "Override a name to a specific address and confirm the server at that address receives the request with the original host header, then remove the override and confirm normal resolution resumes.",
    dep: []
  },
  "websocket-client": {
    s: "Opens and manages long-lived two-way connections, with message composition, a timeline of sent and received frames, ping handling and close codes.",
    d: "The client performs an upgrade handshake with headers and subprotocols, then exchanges text and binary frames in both directions. The interface shows a message timeline and lets people send composed messages, with variables and saved templates. Scripts may react to incoming frames. It must handle ping and pong, fragmentation and close semantics. It is hard because the connection is stateful and open-ended, which breaks the request and response shape that assertions, history and runners assume.",
    k: ["A separate session model versus fitting into request and response: a session model reflects reality and needs its own saving and testing concepts; fitting in reuses features and distorts the protocol.", "Auto-reconnect versus manual: auto-reconnect helps long observation, and masks the disconnects being tested."],
    p: ["Messages arriving faster than the interface can render freeze it and are dropped from the timeline.", "A close code from the server is not shown, so a policy rejection looks like a random disconnect."],
    v: "Connect to an echo server, send text and binary messages, receive them in order in the timeline, and close from the server with a code. Confirm the code and reason are displayed.",
    dep: ["http-client", "tls-stack"]
  },
  "sse-client": {
    s: "Consumes one-way event streams over a long-lived response, parsing events as they arrive, honoring reconnect hints and last-event identifiers.",
    d: "The client sends a normal request and reads the response incrementally, splitting the stream into events with name, data and identifier fields. It displays each event as it arrives and may reconnect with the last identifier after a drop, following the server's retry hint. The response never completes in the usual sense, so post-response scripts and assertions need rules. It is hard because buffering by proxies delays events, and because a stream can run for days.",
    k: ["Treating the stream as a response versus a session: a response keeps one model and conflicts with never-ending bodies; a session fits streaming and needs separate display.", "Automatic reconnect with last-event identifier versus none: automatic reconnect matches browsers and hides drops; none exposes every interruption."],
    p: ["An intermediate proxy buffers the stream so events appear in large delayed batches.", "Memory grows without bound as events accumulate in the timeline of a long-running stream."],
    v: "Connect to a server that emits events with identifiers and drops the connection once. Confirm every event appears in order, the reconnect carries the last identifier, and no event is duplicated or lost.",
    dep: ["http-client", "response-decoding"]
  },
  "rpc-client": {
    s: "Calls remote procedures over a multiplexed binary protocol, supporting unary, server-streaming, client-streaming and bidirectional calls with metadata, deadlines and status codes.",
    d: "The client resolves a method from loaded descriptors, encodes messages, sends them as framed data on a stream, and decodes responses. Streaming calls need an interface to send multiple messages and view many replies. Metadata corresponds to headers and trailers, and deadlines are propagated. Errors come back as typed status codes with details, separate from the transport status. It is hard because streaming and trailers do not fit the single request and response assumption of the rest of the pipeline.",
    k: ["Including streaming calls in the normal flow versus a dedicated view: the normal flow reuses scripts and assertions, but hides stream behavior; a dedicated view is accurate and separate.", "Showing decoded messages versus raw frames: decoded messages are readable, while raw frames help debug encoding and compression issues."],
    p: ["The status code and trailing metadata are not displayed, so the real error reason is invisible.", "A call with no deadline hangs forever on an unresponsive server."],
    v: "Call unary and bidirectional streaming methods on a test server, send several messages and receive several replies, and confirm the final status and trailing metadata are displayed and a short deadline produces a deadline-exceeded status.",
    dep: ["http2-http3", "rpc-descriptors", "rpc-message-builder"]
  },
  "broker-clients": {
    s: "Connects to publish and subscribe messaging systems to send test messages and watch topics, using lightweight messaging protocols with delivery guarantees and retained messages.",
    d: "The client connects with credentials and options, subscribes to topic patterns, publishes with a chosen delivery level and retain flag, and shows incoming messages in a timeline. Session settings control whether the broker stores subscriptions between connections. Payloads can be text, structured or binary. It is hard because delivery semantics, retained messages and persistent sessions change what the test shows, and a debugging subscription with a wildcard can receive large volumes of unrelated traffic.",
    k: ["Treating messaging as another request type versus its own tool area: reusing the request model shares collections and variables, but publish and subscribe do not fit one request and one response.", "Persistent sessions versus clean sessions: persistent sessions match devices, and leave state on the broker that outlasts the test."],
    p: ["A retained test message stays on a shared topic and is delivered to real consumers.", "A broad wildcard subscription floods the timeline and hides the message being tested."],
    v: "Subscribe to a topic, publish at each delivery level with and without retain, and confirm each message arrives once or more as the level specifies, and the retained one is delivered to a new subscriber.",
    dep: ["tls-stack", "websocket-client"]
  },
  "local-database": {
    s: "The embedded store for application state: collections, environments, history, settings and cached schemas, with queries, indexes and crash-safe writes.",
    d: "An embedded database file or key-value store holds structured records and large blobs. The application reads it at startup and writes on change, with transactions so a crash does not corrupt state. Search over history and collections uses indexes. Sync components read and write it through the same interface. It is hard because it is long-lived data written by many versions of the application, grows unbounded, and sits on a machine the tool does not control.",
    k: ["An embedded relational store versus plain files: a store gives queries, transactions and indexes, and is opaque to other tools; files are inspectable and need their own consistency handling.", "Storing large bodies inline versus as separate blobs: inline is simple and slows queries; separate blobs keep indexes small and add lifecycle management."],
    p: ["A crash during a write corrupts the database and loses unsynced work.", "History blobs grow to gigabytes and nobody can find where the disk space went."],
    v: "Kill the process during a burst of writes, relaunch, and confirm the database opens, all committed data is present, and no partial records exist.",
    dep: []
  },
  "workspace-files": {
    s: "Plain files in a directory that hold collections and environments, readable by humans and other tools, as an alternative or complement to the internal database.",
    d: "The tool maps its model onto a folder structure with one file per item, writes atomically through temporary files and renames, and watches the folder for external changes. Paths are workspace-relative, so folders can move between machines. Secrets are kept out through ignore rules or separate files. It is hard because two writers, the tool and the person's editor or version control, race, and because file systems differ in case sensitivity, path length and line endings.",
    k: ["Files as the source of truth versus a database with export: files integrate with existing tools and make performance and consistency harder; a database is fast and a silo.", "Watching for external changes versus loading only at open: watching keeps the interface current and has to handle half-written files; loading at open is simple and surprises people."],
    p: ["Case-insensitive file systems merge two requests whose names differ only by case.", "An external editor and the tool both save the same file and one set of changes is lost."],
    v: "Edit a request file in an external editor while the tool is open, and confirm the tool reloads it. Then save from the tool and confirm the file on disk changes atomically with no partial content.",
    dep: ["collection-format"]
  },
  "migrations": {
    s: "Upgrades stored data and file formats when the application changes, preserving everything and allowing old data to be read after upgrade or rollback.",
    d: "Each stored structure carries a version. At startup, ordered migration steps transform older data to the current shape, usually after a backup. Collections shared with other versions require tolerant readers, since teammates update at different times. Rollback may not be supported, so the tool keeps data readable when possible. It is hard because the combinations of versions in a team are many, and because a migration bug destroys user data silently.",
    k: ["Migrating in place versus writing a new copy: in place is quick and risky; a copy is safe and doubles storage until cleanup.", "Forward-only migrations versus reversible: forward-only is simpler and prevents downgrade; reversible allows rollback and doubles the testing."],
    p: ["A migration runs on a teammate's newer version of a shared file and breaks older clients.", "A failure halfway through leaves data in a mixed state that neither version reads."],
    v: "Take stored data from each prior version, run the upgrade, and compare every collection, variable and history entry with the original. Interrupt one upgrade midway and confirm recovery from the backup.",
    dep: ["local-database", "collection-format"]
  },
  "offline-mode": {
    s: "Keeps the tool fully usable without a network or account connection, queuing changes for later sync and clearly showing what is pending.",
    d: "All data needed to work is held locally. Changes made offline are recorded as pending operations and replayed on reconnect, with conflict handling when others changed the same items. Features that need a service, such as monitors, are disabled with a clear message. A request to a private local service works with no internet at all. It is hard because many designs accidentally require the account service for startup, and because long offline periods produce large conflict sets.",
    k: ["Local-first with sync afterward versus server-first with a cache: local-first always works and needs conflict handling; server-first is simple and breaks when the service is down.", "Requiring sign-in at launch versus optional: required sign-in simplifies the product and blocks work during outages; optional keeps the tool useful and complicates features."],
    p: ["A service outage prevents the tool from starting even for purely local requests.", "Weeks of offline edits produce a conflict set no one wants to resolve and some changes are discarded."],
    v: "Disable the network, launch the tool, edit and send requests to a local server, then reconnect and confirm all edits sync and any conflicts are reported without silent loss.",
    dep: ["local-database", "account-sync"]
  },
  "account-sync": {
    s: "Moves workspace data between the local store and a service so devices and teammates share collections, environments and settings, with change tracking and conflict handling.",
    d: "The client sends local changes as operations with versions and receives remote ones, usually over a persistent connection with periodic full checks. The service stores canonical state, enforces permissions and fans out updates. Each item has a sync status, and some data, such as current variable values, is excluded. Authentication ties the device to an account. It is hard because sync is a distributed-systems problem with unreliable clients, partial failures and privacy requirements.",
    k: ["Operation logs versus state snapshots: logs merge concurrent edits and grow and need compaction; snapshots are simple and lose concurrent changes.", "Syncing everything versus selective workspaces: everything is simple and exposes unrelated data; selective reduces exposure and adds configuration."],
    p: ["A bug uploads local-only current values to the server.", "A clock skew on one device orders its edits wrongly and overwrites newer changes."],
    v: "Edit from two devices concurrently, then confirm both converge to the same state, that excluded local-only values are not present on the server, and a revoked device stops receiving updates.",
    dep: ["local-database", "workspaces-and-roles", "initial-vs-current"]
  },
  "request-history": {
    s: "An automatic, searchable record of requests sent, so a person can find and resend a call made earlier without having saved it.",
    d: "Each send writes an entry with time, method, URL, a resolved request snapshot and the status. The list is grouped by day, searchable and filterable, with options to restore an entry to a tab or save it into a collection. Retention limits cap its size. Entries hold what was actually sent, so they contain real credentials and data. It is hard because it is useful precisely because it records everything, and that makes it the most likely place for secrets to linger.",
    k: ["Recording resolved requests versus the templates: resolved requests reproduce exactly what happened and hold secrets; templates are safe and may not be reproducible.", "Unlimited retention versus a fixed window: unlimited preserves old work and grows without bound; a window is bounded and loses old calls."],
    p: ["Authorization headers are stored in history in clear text and survive after the person removes the secret from the environment.", "History syncs to the account and exposes private calls to other devices."],
    v: "Send requests using a secret variable, open history, and confirm the secret is masked or absent in the stored entry. Then reach the retention limit and confirm the oldest entries are removed.",
    dep: ["local-database", "redaction"]
  },
  "response-snapshots": {
    s: "Stored copies of past responses kept for comparison, documentation and mock data, with metadata about when and from which environment they were captured.",
    d: "A snapshot saves status, headers, body and timing along with the request that produced it and the environment name. It may be saved manually or by rules, such as the last failing response. Large bodies are stored as compressed blobs. Snapshots feed diffs, examples and snapshot assertions. It is hard because bodies are large and sensitive, because the environment and time matter for interpreting them, and because each stored copy needs retention and redaction rules.",
    k: ["Keeping full bodies versus hashes and summaries: full bodies allow real diffs and are large and sensitive; hashes are small and only say that something changed.", "Automatic capture of failures versus manual saving: automatic capture preserves evidence; manual saving stays deliberate and misses it."],
    p: ["Snapshots from production are stored without redaction and shared with a workspace.", "A snapshot lacks its environment name, so nobody knows what it represents."],
    v: "Capture a failing response automatically, open it later, and confirm it shows the body, headers, environment and time, and that secret header values are masked.",
    dep: ["local-database", "redaction", "response-viewer"]
  },
  "secret-variables": {
    s: "Variables marked as sensitive, whose values are masked in the interface, excluded from shared data, and treated specially by every feature that copies or displays them.",
    d: "A flag on a variable changes how it is stored, shown and exported. Values go to protected storage instead of the collection or synced data, appear as dots in tables, and are replaced in logs and generated code. The resolver still substitutes them at send time. Teammates see the name and supply their own value. It is hard because the flag has to be honored by every feature, including ones added later, and because a secret can reappear in a response body or a derived value.",
    k: ["Explicit marking by the person versus automatic detection by pattern: explicit marking is precise and forgotten; detection catches mistakes and has false positives and misses.", "Masked but retrievable versus write-only: retrievable is convenient and lets anyone with the app read it; write-only is safer and awkward when a person needs to copy it."],
    p: ["A secret is embedded in a URL and appears unmasked in history because masking only applies to variable values.", "A response echoes the secret and it ends up in a saved example."],
    v: "Mark a variable secret, use it in a request, then check the interface, console, history, export, generated code and sync payload. The value must be masked or absent everywhere.",
    dep: ["credential-store", "redaction", "variable-scopes"]
  },
  "credential-store": {
    s: "Uses the operating system's protected storage for secrets and tokens, so they are encrypted with keys tied to the user's login rather than saved in plain files.",
    d: "The tool saves secrets through the platform's credential API, indexed by an application-specific name, and reads them on demand, perhaps after an unlock prompt. Where no such store exists, it falls back to an encrypted file with a key derived from a user passphrase. It ties to the identity of the application, so a different program cannot read the entry. It is hard because platforms differ in behavior and prompts, headless and CI machines may have none, and the fallback is weaker.",
    k: ["Platform store versus an application-managed encrypted file: the platform store is well tested and varies across systems; own encryption is uniform and means managing keys.", "Caching decrypted values in memory versus reading each time: caching is fast and keeps secrets exposed to memory inspection; reading each time is safer and slows requests."],
    p: ["A fallback writes tokens in plain text on a system with no credential service, and the person is never told.", "Each read triggers an unlock prompt, so people disable protection."],
    v: "Store a secret, inspect the workspace files and database for its value (it must be absent), restart the application and confirm it is retrieved, and confirm another user account cannot read it.",
    dep: []
  },
  "secret-store-integrations": {
    s: "Fetches secrets at run time from an external secret service, so values are never copied into the tool or the collection and are rotated centrally.",
    d: "A variable is defined as a reference to a path in a secret service. At send time the tool authenticates to the service with a token or workload identity, reads the value, caches it briefly and substitutes it. Access is subject to the service's policies and audit logs. It is hard because it adds a dependency and a failure mode before every request, the identity used by a laptop or CI runner needs scoping, and cached values have lifetimes of their own.",
    k: ["Fetching at send time versus syncing values once: fetching keeps secrets central and current and needs connectivity; syncing is fast and creates copies.", "Per-user identity versus a shared service identity: per-user gives accountability and needs more setup; shared is easy and loses attribution."],
    p: ["The service is unreachable and every request fails with an unhelpful error about a missing variable.", "A shared identity with wide access is embedded in a collection."],
    v: "Reference a secret in the service, send a request and confirm it is substituted, rotate the value centrally and confirm the next request uses the new one, and confirm the service's audit log shows the reads.",
    dep: ["secret-variables", "http-client"]
  },
  "redaction": {
    s: "Removes or masks sensitive values in logs, history, exports, reports, generated code and shared output, by known secret values, header names and patterns.",
    d: "A redaction layer sits at every boundary where data leaves the live request: the console, history, snapshots, exports, reports, documentation and sync. It replaces known secret values, values of sensitive headers and fields, and matches of token-shaped patterns with a placeholder. It must work on bodies of many types and on values that were transformed, such as encoded. It is hard because it is a blacklist, and the secret that was not recognized passes straight through.",
    k: ["Redacting by known values versus by pattern: known values are exact and miss secrets typed directly; patterns catch more and produce false positives.", "Redacting at capture versus at display: capture-time redaction means data was never stored and loses debugging detail; display-time keeps detail and risks later leaks."],
    p: ["A secret that was base64 encoded by a script is not recognized and appears in the log.", "Redaction applies in the interface but not in the exported report generator."],
    v: "Use a secret in a header, body, query and an encoded form, then export the console, history, a report and generated code. Search each output for the secret and its encodings: none may appear.",
    dep: ["secret-variables"]
  },
  "secret-scanning": {
    s: "Detects credentials accidentally present in collections, environments, examples and workspace files before they are committed, synced or published.",
    d: "Scanners look for known token formats, high-entropy strings and values assigned to sensitive names, and compare against variables marked secret. They run on save, before sync, before publishing documentation and as a pre-commit check on workspace files. Findings explain where the value is and offer to move it into a secret variable. It is hard because patterns produce false positives that train people to ignore warnings, and because custom credentials have no recognizable format.",
    k: ["Blocking on detection versus warning: blocking prevents leaks and interrupts valid work; warning is gentle and easy to dismiss.", "Pattern and entropy rules versus matching known secret values: rules find unknown leaks with noise; value matching is precise and covers only secrets the tool knows."],
    p: ["A scanner flags every long identifier as a secret, and people turn it off.", "A real credential inside a script string is missed because only variables were scanned."],
    v: "Place a token-formatted value in a header, a script and an example, then attempt to sync and publish. Each location must be flagged, and moving the value to a secret variable must clear the finding.",
    dep: ["secret-variables", "workspace-files"]
  },
  "ci-secret-injection": {
    s: "Supplies secret values to headless runs from the pipeline's secret facility, as environment variables or files, so they are never stored in the collection or reports.",
    d: "The pipeline holds secrets and exposes them to a job. The runner maps named variables to those inputs, substituting them at send time, and masks them in output. Short-lived credentials issued per job are preferable to long-lived keys. The runner should refuse to continue when a required secret is missing, rather than send a literal placeholder. It is hard because logs, reports and error messages are all ways for a secret to appear in the build output, and forks of a repository may run with different access.",
    k: ["Environment variables versus mounted files: environment variables are simple and visible to every child process; files can be permissioned and need cleanup.", "Long-lived keys versus short-lived issued credentials: long-lived keys are easy and valuable to attackers; short-lived credentials limit exposure and need an identity setup."],
    p: ["A debug flag prints the full environment, including secrets, into the build log.", "A pull request from an untrusted fork runs the collection with production secrets."],
    v: "Run the pipeline with a secret supplied only through the CI facility, then search the build log, reports and artifacts for its value, and rerun with the secret absent to confirm the run stops before sending.",
    dep: ["secret-variables", "redaction", "cli-runner"]
  }
});
