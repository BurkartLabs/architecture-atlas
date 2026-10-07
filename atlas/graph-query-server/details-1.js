// Details part 1: clients, tooling, transport.
ATLAS.details("graph-query-server", {
  "client-libraries": {
    s: "Code in the calling application that builds operations, sends them over HTTP or a streaming transport, and delivers typed results and errors to the user interface.",
    d: "A client library wraps transport, serialization, retries and error handling behind a small API such as run query, run mutation and subscribe. It attaches authentication, sends variables separately from query text, and reports both transport failures and the errors array in a successful response. Most also provide a cache and hooks for the user interface framework. The hard part is that an HTTP 200 may still carry partial errors, so callers must inspect data and errors together rather than rely on status codes.",
    k: ["Thin transport wrapper vs full-featured client with cache: a thin one is predictable and small; a full one saves effort but hides when data is stale.", "Retry in the library vs retry in the caller: library retries are convenient, but retrying a mutation blindly can apply it twice."],
    p: ["Treating an HTTP 200 as success hides field errors, so screens render half-empty data without any failure signal.", "Sending query text with values interpolated into it defeats caching and invites injection."],
    v: "Run a query where one field resolver throws. Confirm the client returns the other fields as data, surfaces the error with its path, and does not treat the whole call as a failure.",
    dep: ["http-transport", "request-envelope"]
  },
  "operation-documents": {
    s: "The named queries, mutations and subscriptions that clients write, plus reusable fragments that declare the fields a component needs, kept in source files next to the code that uses them.",
    d: "An operation document holds one or more named operations with typed variables, and fragments that select fields on a type. Components declare their data needs as fragments and parents compose them into one operation per screen. Names let servers and telemetry identify traffic without parsing text. Documents are validated against the schema at build time, and often replaced at runtime by a hash. Difficulty comes from fragment sprawl: one over-fetching fragment, once composed, enlarges every query that uses it.",
    k: ["One operation per screen vs one per component: a single operation means one round trip, but couples components through a shared variable list.", "Colocated fragments vs central query files: colocation keeps data needs beside use, but makes the total query size hard to see."],
    p: ["Anonymous operations cannot be grouped in metrics or allow-listed by name.", "A fragment added for one component silently adds fields to every query that spreads it."],
    v: "Build the client, list the operation names found in source, and confirm each is unique and appears as the operation name in server metrics after one real request.",
    dep: ["client-libraries", "schema-definition-language"]
  },
  "client-code-generation": {
    s: "A build step that reads the schema and the client's operation documents and emits typed code for variables, result shapes and fragment data, so type errors appear at compile time.",
    d: "The generator loads the schema, usually from introspection or a published file, validates each operation against it, and emits types matching exactly the fields selected, not the whole object type. It can also emit typed document objects, hooks, and the manifest of operation hashes. Run in CI, it fails the build when a client uses a removed field. The difficulty is keeping scalars mapped to the right native types, handling unions and nullability precisely, and keeping generated output deterministic so diffs stay reviewable.",
    k: ["Generate types per operation vs per schema type: per operation is exact about what was fetched; per type is simpler but lets code read unfetched fields.", "Commit generated files vs generate at build: committed output eases review but drifts; build-time generation never drifts but needs the schema available."],
    p: ["Generating from a stale schema snapshot passes the build while the live server has already removed a field.", "Custom scalars left unmapped become an untyped catch-all and hide bugs."],
    v: "Remove a field from the schema in a branch and run generation. Confirm the build fails at the exact operation that selects it, with its file and line.",
    dep: ["introspection", "operation-documents", "custom-scalars"]
  },
  "normalized-client-cache": {
    s: "A client-side store that splits results into objects keyed by type and identifier, so several queries share one copy and an update to an object refreshes every view of it.",
    d: "Each response is flattened: objects with an identifier become records in a table keyed by type and id, and parent fields hold references. Reads reassemble the tree from references. A mutation that returns an object updates its record and every query reading it re-renders. The challenge is identity and freshness: objects without ids cannot be merged, list fields need merge rules for pagination, and deletes or reorderings are not visible to the cache unless the client says so.",
    k: ["Normalized store vs document cache by query: normalization shares updates across views; document caching is simple and predictable but shows different values for the same object.", "Cache-first vs network-first reads: cache-first is instant, network-first is fresh, and a wrong default shows stale data or wastes bandwidth."],
    p: ["Two types sharing an id value collide when the type name is not part of the key.", "A deleted object remains referenced by cached lists until something evicts it."],
    v: "Open two screens showing the same object, edit it on one with a mutation that returns the object, and confirm the other updates with no new query sent.",
    dep: ["global-object-ids", "client-libraries"]
  },
  "optimistic-mutations": {
    s: "A client technique that applies the expected result of a mutation to the local cache at once, then replaces it with the server's answer or rolls it back on failure.",
    d: "The client supplies a guessed response for the mutation. The cache writes it in a temporary layer, the interface updates immediately, and when the real response arrives the layer is dropped and the true data is written. On error the layer is dropped and the old values reappear. It depends on the guess having the same shape as the server's response and on identifiers being predictable. The hard part is concurrency: several in-flight mutations touching one object must roll back in the right order.",
    k: ["Optimistic update vs wait for the server: optimistic feels instant but must handle visible rollbacks; waiting is simpler and always correct but feels slow.", "Client-generated ids vs server ids: client ids let new objects be referenced at once, but need uniqueness guarantees and server acceptance."],
    p: ["A failed mutation rolls back after the user has already navigated away, with no visible explanation.", "Out-of-order responses overwrite a newer optimistic value with an older server value."],
    v: "Throttle the network, submit a mutation, and confirm the interface changes immediately. Then force the server to reject it and confirm the screen returns to the prior value and shows an error.",
    dep: ["normalized-client-cache", "error-model"]
  },
  "persisted-query-manifest": {
    s: "A build-time map from operation hashes to operation text, produced from client source and uploaded to the server so clients can send only a short identifier.",
    d: "During the client build, a tool extracts every operation, computes a hash of its normalized text and writes a manifest. The manifest is published to the server's store before the client ships. At runtime the client sends the hash and variables, the server looks up the text, and skips parsing and validation when a verified entry exists. It shrinks requests and enables a mode that rejects unknown operations. It must be versioned with the client release, since old app versions keep sending old hashes.",
    k: ["Publish at build time vs register on first use: build-time publishing allows locking the server to known operations; first-use registration needs no pipeline but cannot block unknown text.", "Keep old manifests forever vs expire them: keeping them supports old clients, expiring limits storage but breaks installed apps."],
    p: ["A manifest uploaded after the client release causes unknown-hash errors for early users.", "Dropping manifests of old releases breaks mobile clients that users never update."],
    v: "Ship a build, then request each hash in its manifest against the server. Every one must resolve to text that validates against the current schema.",
    dep: ["operation-documents", "persisted-queries", "schema-publishing"]
  },
  "introspection": {
    s: "A built-in set of schema fields that lets any client ask the server for its own types, fields, arguments, directives and deprecations, in the same query language.",
    d: "The server exposes reserved meta fields that return the schema as data, including each type's kind, its fields, argument types, defaults, deprecation reasons and descriptions. Explorers, code generators and mock servers read it to work without a schema file. Because it is generated from the live schema it cannot drift from what the executor enforces. The cost is exposure: a full dump documents every field, including internal ones, and the introspection query itself is large and deeply nested.",
    k: ["Always on vs disabled in production: always on supports tooling and discovery, while disabling hides structure from attackers but does not replace authorization and breaks generators.", "Live introspection vs published schema file: a file works offline and can be reviewed, but must be kept in sync."],
    p: ["Hiding introspection while leaving fields unauthorized only obscures them; field suggestions in errors still reveal names.", "An unbounded introspection query is itself an expensive request."],
    v: "Query the type listing and confirm it names every type in the schema file. Then deprecate a field and confirm it appears with its reason in the introspection result.",
    dep: ["schema-definition-language", "object-and-interface-types"]
  },
  "interactive-explorer": {
    s: "A browser tool that renders the schema as browsable documentation and lets a developer write, run and inspect queries against a live endpoint with autocomplete.",
    d: "The explorer fetches the schema through introspection, builds a documentation tree and drives editor autocomplete and inline validation. It keeps variable and header panels so requests can carry credentials. Responses show data, errors, timing and sometimes a trace. It is the fastest way to understand an unfamiliar graph. Risks come from exposure: served in production it lets anyone browse the graph and, with ambient cookies, make authenticated calls from a page they do not control.",
    k: ["Served by the API vs separate tool: bundled means zero setup, while a separate tool keeps the explorer out of the production attack surface.", "Persist headers locally vs never: persistence saves effort but stores tokens in browser storage."],
    p: ["An explorer left enabled in production becomes an unauthenticated documentation and testing portal.", "Explorer requests using session cookies can be driven from another origin if CSRF defenses are absent."],
    v: "Open the explorer in a clean browser, type a partial field name, and confirm autocomplete offers schema fields. Run a query with a bad argument and confirm the error shows its line and column.",
    dep: ["introspection", "http-transport"]
  },
  "editor-language-service": {
    s: "A language server that gives code editors schema-aware completion, hover documentation, validation and go-to-definition for operation documents and schema files.",
    d: "The service loads the schema, parses open documents with error recovery, and reports validation errors as editor diagnostics. It answers completion by finding the type at the cursor and listing its fields and arguments, and supports hover with descriptions and deprecations. It follows fragments across files and embedded tagged strings in application code. Hard parts are incremental parsing of unfinished text, locating documents in a large project, and keeping the loaded schema fresh when it changes.",
    k: ["Load schema from a file vs a live endpoint: a file is fast and reproducible; an endpoint is current but needs network and credentials in the editor.", "Strict diagnostics vs tolerant: strict catches mistakes early, but mid-edit text produces noisy false errors."],
    p: ["Pointing the service at a stale schema produces confident but wrong autocomplete.", "Embedded strings in application code are missed when interpolation breaks extraction."],
    v: "In an editor, type a field that does not exist on a type and confirm an immediate diagnostic with the correct range. Hover a deprecated field and confirm the reason shows.",
    dep: ["lexer-and-parser", "validation-rules", "schema-definition-language"]
  },
  "schema-linter": {
    s: "A static checker that applies style and design rules to the schema, such as naming, required descriptions, pagination shape and forbidden patterns, and fails the build on violations.",
    d: "The linter reads the schema, walks every type and field, and applies configurable rules: consistent casing, descriptions on public fields, mutation payload shapes, connection patterns, no nullable list items by accident, no secrets in names. Output is a list with locations, and CI blocks merges. It encodes the design review that would otherwise be repeated by hand. Hard parts are choosing rules worth enforcing, allowing documented exceptions, and not retroactively failing every legacy field.",
    k: ["Enforce on all fields vs only on changes: all fields is thorough but blocks unrelated work; changes-only adopts gradually but leaves old debt.", "Errors vs warnings: errors guarantee compliance but make exceptions costly; warnings get ignored."],
    p: ["Rules with no exception mechanism get disabled wholesale the first time they block a release.", "Linting only the schema file misses types contributed at runtime by plugins."],
    v: "Add a mutation that returns a bare scalar instead of a payload object and confirm the linter fails the build, naming the rule and the field.",
    dep: ["schema-definition-language", "connection-pagination"]
  },
  "mock-server": {
    s: "A server that answers operations from the schema alone, generating plausible values for each type, so clients can be built and tested before backends exist.",
    d: "The mock builds an executable schema whose resolvers return generated values by scalar type, with overrides for specific fields and fixed seeds for repeatability. Lists get a configurable length, abstract types pick a concrete member, and errors can be injected. It enables parallel front end and back end work and stable tests. The risk is divergence: mocks encode what the author guessed, not what the real server returns, so edge cases like nulls, empty lists and errors are skipped unless added deliberately.",
    k: ["Random generated data vs curated fixtures: random finds layout surprises but is unreadable in tests; fixtures are stable but hide variety.", "Mock the whole schema vs a partial overlay on the real server: whole is independent; partial keeps real behavior where it exists but needs the backend."],
    p: ["Mocks that never return null or empty lists let clients ship with untested empty states.", "A mock schema drifting from the real one hides breaking changes until integration."],
    v: "Point a client test at the mock, run every operation in the suite, and confirm all pass. Then change the schema and confirm the mock rejects an operation using a removed field.",
    dep: ["schema-construction", "validation-rules"]
  },
  "operation-checks": {
    s: "A pre-merge check that replays recently observed client operations against a proposed schema and reports which would fail or change, so risk is measured against real traffic.",
    d: "The check pulls the set of operations seen in a recent window from usage tracking, validates each against the candidate schema, and groups failures by client name and version. It distinguishes changes that break nothing observed from changes that break named clients. Output is attached to the pull request. It makes schema changes safe to review, but only as safe as the traffic sample: rare operations, old app versions and low-volume clients may be missing from the window.",
    k: ["Window of days vs weeks of traffic: a longer window catches rare clients but includes operations already abandoned.", "Block on any failure vs block on failures above a threshold: strict is safe but stalls cleanups; thresholds allow progress but accept breaking someone."],
    p: ["A short window misses a weekly batch job that uses the field being removed.", "Unnamed clients cannot be contacted, so a failure cannot be assigned to an owner."],
    v: "Propose removing a field known to be used by one client version. Confirm the check lists that client and operation, and passes after the client's last observed use is gone.",
    dep: ["field-usage-tracking", "breaking-change-detection", "validation-rules"]
  },
  "http-transport": {
    s: "The endpoint that accepts operations over HTTP, usually POST with a JSON body and sometimes GET for cacheable reads, and returns a JSON response with a status and headers.",
    d: "A single path receives the operation, variables and operation name. POST carries mutations and large queries; GET carries short, persisted queries so intermediaries can cache them. The server decides status codes: pure validation failures return an error status, while a request that began executing returns success with an errors array. It sets cache and content headers, honors compression and handles request timeouts. Hard parts are that one URL hides many different operations from generic HTTP tooling, and deciding what status a partial failure deserves.",
    k: ["Always 200 with errors in body vs mapped error statuses: always-200 is simple for clients but blinds load balancers and monitors; mapped statuses help operations but complicate partial results.", "POST only vs POST and GET: POST only is safe by default; GET enables CDN caching but needs mutation blocking."],
    p: ["Accepting mutations over GET lets a link or image tag trigger writes.", "Monitoring only HTTP status misses nearly every query-level failure."],
    v: "Send a valid query, an invalid query and a query where one resolver throws. Confirm three distinguishable outcomes in status and body, and that all appear correctly in access logs.",
    dep: ["request-envelope", "content-negotiation"]
  },
  "request-envelope": {
    s: "The parser for the request body: it extracts query text or a persisted-query hash, variables, operation name and extensions, and rejects malformed or oversized input.",
    d: "The body is decoded and checked: query or hash present, variables a map, operation name a string, extensions an optional map. It may also accept a list of operations as a batch. Size limits apply before parsing so huge bodies are never buffered. Invalid shape returns an error without touching the executor. It is deliberately small, but it is the first untrusted-input boundary: type confusion, duplicate keys and deeply nested variable JSON can all be used to stress the server.",
    k: ["Strict envelope validation vs lenient: strict fails fast on client mistakes; lenient tolerates sloppy clients but allows ambiguous inputs.", "Accept batched arrays vs single operations: batches cut round trips but multiply cost under one rate-limit count."],
    p: ["Parsing the whole body before checking size lets a large upload exhaust memory.", "Variables sent as a JSON string instead of a map are silently accepted by some paths and rejected by others."],
    v: "Post bodies with a missing query, a non-map variables field and an oversized payload. Confirm each returns a distinct client error and none reaches the parser.",
    dep: ["http-transport", "depth-limiting"]
  },
  "content-negotiation": {
    s: "Selection of request and response formats: JSON by default, with compression, an optional incremental multipart response and a legacy media type, chosen from request headers.",
    d: "The server reads the Accept and Content-Type headers to choose how to decode the request and encode the response. A plain query returns one JSON document; a deferred or streamed operation needs a multipart or event-stream response, and the client must opt in by header. Compression is negotiated separately. Getting it wrong is subtle: a client that does not support multipart receiving it sees garbage, and caches must vary on the headers that changed the body.",
    k: ["Opt-in incremental responses vs always streaming: opt-in is safe for old clients; always streaming is simpler but breaks them.", "Compress at the server vs at the edge: server compression works anywhere, but edge compression frees application CPU."],
    p: ["A cache not varying on Accept serves a multipart body to a client expecting JSON.", "Compressing responses containing secrets alongside attacker-controlled text enables length-based attacks."],
    v: "Request the same query with plain and with multipart-capable Accept headers. Confirm the first returns one JSON body and the second chunks, and that a shared cache keeps them separate.",
    dep: ["http-transport"]
  },
  "multipart-uploads": {
    s: "Support for sending files alongside an operation in one multipart request, with file parts mapped into variables and streamed to the resolver rather than buffered whole.",
    d: "The client sends a multipart body with an operations part, a map part saying which file part fills which variable path, and the file parts. The server parses the stream, substitutes file handles for placeholders, then runs the mutation. Resolvers read the stream and write it to storage. It is not part of the core language, so it is an optional extension. Risks are resource exhaustion, content-type spoofing and CSRF, since the multipart type is a form-submittable type.",
    k: ["Upload through the API vs direct to object storage with a signed address: through the API is one call but burns server bandwidth; signed addresses scale but add a second step.", "Buffer to disk before resolving vs stream: buffering is simple and allows retries but costs disk; streaming is lean but can leave partial writes."],
    p: ["Accepting multipart without a CSRF guard lets another site submit uploads with the user's cookies.", "Missing size limits per file and per request let one caller fill the disk."],
    v: "Upload a file larger than the limit and confirm rejection before the resolver runs. Upload a valid file and confirm the stored bytes match a checksum computed on the client.",
    dep: ["http-transport", "cors-and-csrf", "custom-scalars"]
  },
  "cors-and-csrf": {
    s: "Browser-origin controls: which sites may call the endpoint, whether cookies are sent, and a requirement that state-changing requests carry a header or content type a plain form cannot produce.",
    d: "Cross-origin resource sharing headers list allowed origins, methods and headers, and answer preflight requests. For cookie-authenticated endpoints, the server also refuses requests that could come from a form or image tag: it requires a JSON content type or a custom header, and does not allow mutations over GET. Simple requests skip preflight, so origin checks alone are not enough. Misconfiguration is common: wildcard origins with credentials, or reflecting the Origin header without validation.",
    k: ["Token header vs cookie-only authentication: header tokens are immune to cross-site request forgery; cookies need explicit defenses but keep tokens out of script reach.", "Strict origin allow-list vs permissive: strict blocks unknown sites; permissive eases development and invites abuse."],
    p: ["Reflecting any Origin back with credentials allowed gives every site access to logged-in users data.", "Allowing form-encoded content types for queries opens forgery against cookie sessions."],
    v: "From a page on a disallowed origin, send a credentialed request and a form-encoded POST. Confirm the browser blocks the first and the server rejects the second.",
    dep: ["http-transport", "authentication-context"]
  },
  "gateway-integration": {
    s: "How the server sits behind an API gateway or proxy: forwarded identity, path routing, timeouts, body limits and header handling that must agree with the server's own settings.",
    d: "A gateway often terminates TLS, authenticates the caller and forwards a verified identity as headers or a signed token. It may enforce coarse rate limits and body size limits and route one path to the graph server. The server trusts those headers only from the gateway. Mismatches cause trouble: a gateway timeout shorter than the server's leaves work running after the client got an error, and a gateway that buffers responses breaks streamed and subscription traffic.",
    k: ["Authenticate at the gateway vs in the server: gateway authentication centralizes policy, while server-side checks protect against bypass and keep context rich.", "Gateway-level rate limiting by request count vs server-side by query cost: count is cheap but blind to expensive queries."],
    p: ["Trusting identity headers from any source lets clients forge them when the server is reachable directly.", "A buffering proxy delays streamed and incremental responses until completion."],
    v: "Call the server directly with a forged identity header and confirm it is rejected. Then call through the gateway with a valid token and confirm the resolvers see the right user.",
    dep: ["http-transport", "authentication-context", "rate-limiting"]
  },
});
