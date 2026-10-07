// Details for the web framework plate, part 2: API responses, HTTP core, request security.
ATLAS.details("web-framework", {
  "response-serialization": {
    s: "Converts domain objects into the wire format of an API response, choosing which fields to expose, how to name them and how to render nested relations.",
    d: "A serializer or resource class maps a model to a document: it selects fields, renames them, formats dates and numbers, includes related objects and adds links or metadata. The result is encoded as JSON or another format and written to the response. Conditional fields depend on the caller's permissions. The difficulty is coupling and cost: serializing the model directly leaks columns and ties the contract to the schema, and nested serialization triggers queries that were never planned.",
    k: ["Explicit serializer classes vs serializing models by default: explicit classes keep the contract stable and safe, but add a file per resource to maintain.", "Embedding relations vs returning links: embedding saves round trips, but inflates payloads and queries, while links push work onto clients."],
    p: ["Serializing a user model directly exposes password hashes or internal flags once a column is added.", "Nested serializers load relations lazily per item, turning one list endpoint into hundreds of queries."],
    v: "Add a new column to a model and confirm the API response does not change. Fetch a list of a hundred records and confirm the query count matches the planned number, not one per item.",
    dep: ["model-layer", "response-object", "content-negotiation", "relationship-loading"]
  },
  "content-negotiation": {
    s: "Chooses a response format and language from the client's Accept headers, or from URL extensions and parameters, and answers 406 or 415 when it cannot comply.",
    d: "The framework parses Accept, Accept-Language and Content-Type headers, with quality values, and matches them against what the route can produce and consume. Handlers declare supported formats and the framework renders the matching template or serializer. Request bodies are accepted only for declared content types. The difficulty is ambiguity and caching: wildcards and equal quality values need deterministic tie-breaks, and any response that varies by header must say so with Vary or caches will serve the wrong variant.",
    k: ["Header-based negotiation vs explicit URL formats: headers keep URLs stable, but are invisible in links and logs, while URL suffixes are testable in a browser.", "Strict 406 on no match vs falling back to a default: strict failures are honest, but break clients with sloppy headers."],
    p: ["A response varying by Accept-Language or Accept is cached without a Vary header and served in the wrong format to the next client.", "A browser's default Accept header makes an API route return a rendered page instead of data."],
    v: "Request one route with Accept for each supported format, an unsupported format and a wildcard, and confirm the correct body, a 406 for the unsupported one and a Vary header on every negotiated response.",
    dep: ["request-object", "response-object", "locale-resolution"]
  },
  "api-versioning": {
    s: "A scheme for changing an API without breaking existing clients, by carrying a version in the URL, a header or a media type and routing to matching handlers.",
    d: "Versions map to separate route sets, handler namespaces or serializer variants, with shared domain code underneath. Additive changes such as new optional fields usually need no new version; removals or meaning changes do. Deprecation uses warning headers and sunset dates, and usage logs show who still calls old versions. The difficulty is cost: every live version needs tests and security fixes, and sharing code between versions without letting one change break another takes discipline.",
    k: ["Version in the URL vs in a header: URL versions are visible and easy to route and cache, but encourage whole-API version bumps over small additive evolution.", "Frozen copies of old versions vs transforming new responses to old shape: frozen copies are safe but multiply code, while transforms stay small but can hide breakage."],
    p: ["A shared serializer is changed for the new version and silently alters the old version's responses.", "Old versions stay online indefinitely because nobody knows which clients still use them."],
    v: "Run the same recorded request set against each supported version after every change and confirm old versions return byte-identical response shapes. Check usage logs show per-version request counts.",
    dep: ["router", "response-serialization", "logging"]
  },
  "pagination": {
    s: "Returns large collections in bounded pages, with limits, cursors or offsets, sort order, filters and links to the next page, so queries and payloads stay small.",
    d: "Offset pagination uses limit and offset and supports jumping to page numbers but gets slower and unstable on deep pages. Cursor pagination encodes the position of the last item, usually as an opaque token over a unique sort key, and stays fast and consistent. The framework validates page size, whitelists sortable and filterable fields and emits next and previous links. The difficulty is correctness under change: inserts and deletes between requests skip or repeat items under offsets.",
    k: ["Offset vs cursor pagination: offsets allow jumping and totals, but degrade and shift under writes, while cursors are stable and fast but sequential only.", "Returning total counts vs omitting them: totals help interfaces, but a count over a large filtered table can cost more than the page."],
    p: ["No maximum page size lets one client request a million rows in a single call.", "Sorting on a non-unique column makes cursor pages repeat or skip rows with equal values."],
    v: "Insert and delete rows while a client walks a cursor through a thousand-row set, and confirm no item appears twice or is skipped. Request a page size above the cap and confirm it is clamped or rejected.",
    dep: ["query-builder", "response-serialization", "route-parameters"]
  },
  "api-error-format": {
    s: "A single, documented shape for error responses, with a status code, a stable machine-readable code, a message and field-level details, produced for every failure.",
    d: "Exception handling and validation both funnel into one error formatter, which sets the right HTTP status and returns a body with a type, title, detail and optionally per-field errors and a request identifier for support. Codes are stable across releases even when messages are reworded or translated. The difficulty is consistency: errors from the router, middleware, parsers, authentication and handlers all originate in different places and must all produce the same shape, without leaking internals.",
    k: ["Standard problem-details format vs a custom shape: a standard is understood by generic clients and tools, but may not fit every field-level need.", "Detailed messages vs generic ones: detail helps developers, but stack traces and SQL fragments in production responses leak internals."],
    p: ["Framework-level failures such as malformed JSON or unknown routes return an HTML page instead of the API's error shape.", "Clients parse the human message text, and rewording it breaks them."],
    v: "Trigger a malformed body, an unknown route, a validation failure, an authentication failure and a server exception against the API, and confirm all five return the same documented structure with correct status codes and no internals.",
    dep: ["error-handling", "validation", "response-object"]
  },
  "schema-and-docs": {
    s: "A machine-readable description of the API's routes, parameters and payloads, used to generate documentation, client libraries and request validation.",
    d: "A schema document lists each operation with its path, method, parameters, request body and response shapes. It is written by hand, generated from route and type declarations, or both. Tooling renders documentation, generates client code and mock servers, and can validate requests and responses against it at runtime or in tests. The difficulty is staying true: a hand-written description drifts from the code, and generated ones only describe what the declarations capture.",
    k: ["Schema first, code generated from it, vs code first with a generated schema: schema-first gives a reviewed contract, while code-first stays in sync but exposes implementation accidents.", "Runtime validation against the schema vs documentation only: validation enforces the contract, at the cost of per-request work."],
    p: ["Documentation is updated by hand and describes fields the API stopped returning months ago.", "Runtime response validation is enabled only in development, so production violations go unnoticed."],
    v: "Replay each documented example against the running API and validate the real responses against the schema. A route or field added in code without a schema entry should fail the build.",
    dep: ["router", "response-serialization", "validation"]
  },
  "server-interface": {
    s: "The standard contract between a web server and the framework: how a request is described, how a response is returned and how streaming and connection upgrades are signaled.",
    d: "A common interface defines the application as a callable that receives an environment or request description and returns status, headers and a body, synchronous or asynchronous. Because servers and frameworks agree on it, either can be swapped, and middleware written for the interface works across frameworks. Extensions cover streaming bodies, hijacking connections for upgrades and server lifecycle events. The difficulty is the lowest common denominator: features beyond the contract, such as early hints or trailers, need extensions.",
    k: ["Synchronous vs asynchronous interface: synchronous is simple and fits worker pools, while asynchronous scales idle connections but infects all code with async rules.", "A thin shared standard vs server-specific APIs: the standard gives portability, but caps access to server features."],
    p: ["Blocking code called inside an asynchronous interface stalls every connection that shares the event loop.", "Reading an unbounded request body into memory because the interface exposes it as a simple stream."],
    v: "Run the same application unchanged under two different compliant servers and confirm identical responses to a recorded request set, including a streamed response and a connection upgrade.",
    dep: ["server-adapters", "request-object", "response-object"]
  },
  "server-adapters": {
    s: "Thin layers that translate between a particular server, gateway or serverless runtime and the framework's server interface, including process models and startup.",
    d: "An adapter maps the host's request representation into the framework's, runs the application and writes the response back. Adapters exist for worker-pool servers, event-driven servers, reverse-proxy protocols and function-as-a-service platforms, each with a different process and concurrency model. They also own startup and shutdown behavior, graceful draining and signal handling. The difficulty is that behavior varies: header casing, body buffering, timeouts, request size limits and keep-alive differ per host.",
    k: ["Run behind a production server vs the framework's built-in server: built-in servers are convenient locally, but lack hardening, concurrency control and tuning.", "Long-lived workers vs one process per invocation: long-lived workers amortize boot time, while per-invocation isolation avoids shared-state bugs but pays startup cost."],
    p: ["An adapter buffers the whole response, so streaming and server-sent events appear to hang until completion.", "A worker killed mid-request during deploy drops in-flight requests because shutdown draining was not configured."],
    v: "Send a streamed request and response through each supported adapter and confirm chunks arrive incrementally. Send a termination signal during a slow request and confirm it completes before the worker exits.",
    dep: ["server-interface", "application-bootstrap"]
  },
  "request-object": {
    s: "A uniform, read-mostly view of the incoming request: method, URL, headers, query, parsed body, cookies, client address and per-request attributes set by middleware.",
    d: "The server hands over raw pieces; the request object normalizes them: lowercase header lookup, decoded query parameters, parsed cookies, an input stream, the real client address and scheme after trusted proxy handling. Parsing is lazy and cached. Middleware attaches attributes such as the current user or route match. The difficulty is safe defaults: parameter merging from path, query and body can let one source override another, and values are untrusted strings until validated.",
    k: ["Immutable request objects vs mutable ones: immutability prevents surprising edits across middleware, but needs a copy-on-change method to attach data.", "One merged parameter bag vs separate sources: a merged bag is convenient, but lets a query parameter shadow a path or body value."],
    p: ["Trusting a forwarded address or scheme header from any client lets attackers fake their origin.", "Parameters merged from query and body let a crafted link override a field the form protects."],
    v: "Send requests with duplicate headers, repeated query keys, encoded characters and conflicting query and body fields, and confirm the object exposes each as documented, with the real client address only through trusted proxies.",
    dep: ["server-interface", "trusted-proxy-handling", "body-parsing"]
  },
  "response-object": {
    s: "A builder for the outgoing response: status, headers, cookies and a body that may be a string, a file or a stream, finalized after middleware has had its turn.",
    d: "Handlers and middleware create or modify a response value. It carries the status line, header multimap, cookies to set and a body representation, and computes derived headers such as content length and type. Responses can be returned early by middleware to short-circuit the stack. Streaming bodies are iterated lazily by the adapter. The difficulty is ordering: headers cannot change after the first byte is written, so late errors cannot turn into error pages, and each layer must avoid clobbering headers set by others.",
    k: ["Handlers return response values vs mutate a shared response object: return values are easy to compose and test, while mutation allows deep helpers to set headers.", "Buffered vs streamed bodies: buffering allows final headers and error handling, but holds full content in memory and delays first byte."],
    p: ["An exception after a partial streamed write cannot produce an error status, leaving the client with a truncated body and a 200.", "Two middleware layers each set the same header and the later one overwrites an important value, such as caching directives."],
    v: "Return responses with each body type and confirm status, headers and content length on the wire. Throw midway through a streamed response and confirm the connection is closed in a way the client detects as incomplete.",
    dep: ["server-interface", "cookie-handling"]
  },
  "router": {
    s: "Matches a request's method and path against a table of route patterns and selects the handler, with grouping, prefixes, per-route middleware and defined results for no match.",
    d: "Routes are declared in code or files as method, pattern, handler and options, often nested by prefix, host or resource. At startup they compile into a tree or ordered list; at request time the router finds the first or best match, extracts parameters and distinguishes 404 from 405 with an Allow header. Resource declarations expand into the usual set of routes. The difficulty is ambiguity: overlapping patterns resolve by declaration order or specificity, and large tables need efficient matching.",
    k: ["First match by declaration order vs most specific wins: order is predictable but fragile to reordering, while specificity is order-independent but harder to predict.", "Central route table vs annotations beside handlers: a central table gives one overview, while annotations keep routes with the code but scatter the map."],
    p: ["A catch-all route declared too early swallows requests meant for routes defined below it.", "Trailing slashes and case differences produce duplicate URLs that split caching and search results."],
    v: "List the compiled routes, then request every route plus near misses such as wrong method, trailing slash and different case. Confirm the expected handler, a 405 with an Allow header for wrong methods and 404 for the rest.",
    dep: ["request-object", "route-parameters", "middleware-pipeline"]
  },
  "route-parameters": {
    s: "Named segments of a URL pattern that are captured, constrained by type or pattern, converted to typed values and passed to the handler.",
    d: "A pattern like a collection path followed by an identifier declares a parameter that the router captures and decodes. Constraints restrict what matches, such as integers or a slug pattern, so non-matching paths fall through to other routes or 404. Optional segments, wildcard tails and defaults are supported. Converters turn text into numbers, dates or identifiers. The difficulty is encoding: percent-decoding, slashes inside values and Unicode normalization differ between layers and have caused security bypasses.",
    k: ["Constraints in the route vs validation in the handler: route constraints give a cheap 404 and clean fall-through, while handler validation allows better error messages.", "Decode before or after matching: decoding first is easier for authors, but encoded slashes can then change which route matches."],
    p: ["An encoded slash or dot-segment in a parameter reaches a file lookup and escapes the intended directory.", "A permissive wildcard parameter swallows a path meant for a more specific route."],
    v: "Request routes with encoded slashes, double encoding, Unicode, very long values and out-of-range numbers. Each should either match as documented with the exact decoded value or return 404, and none should reach a handler with an unexpected value.",
    dep: ["router"]
  },
  "reverse-routing": {
    s: "Builds URLs from route names and parameters, so links, redirects and API hypermedia come from the route table instead of hand-written strings.",
    d: "Every route can carry a name. A URL generator looks up the pattern, fills in parameters with proper encoding, appends extra values as a query string and adds scheme and host when an absolute URL is needed, using the trusted request host or configured base URL. Signed or time-limited URLs add a verification signature. The difficulty is context: absolute URLs behind proxies and background jobs depend on correct configuration, and missing parameters must fail loudly rather than yield broken links.",
    k: ["Named routes vs path strings: names survive path changes and encode parameters correctly, but require every route to be named and unique.", "Absolute URLs from the request host vs a configured base URL: request-derived is flexible, while configured is safe from host header spoofing and works in jobs."],
    p: ["Absolute URLs in emails are built from a spoofed Host header, enabling password-reset poisoning.", "Links built in background jobs have no request, so they point at localhost or the wrong environment."],
    v: "Generate each named route with its parameters, then request the generated URL and confirm it hits the same route. Build one inside a background job and inside a request and confirm both use the production base URL.",
    dep: ["router", "route-parameters", "configuration"]
  },
  "middleware-pipeline": {
    s: "An ordered chain of wrappers around the handler, each able to inspect or change the request, short-circuit with a response, or change the response on the way back.",
    d: "Each middleware receives the request and a function that calls the rest of the chain, so it can act before and after the inner layers. Typical layers handle exceptions, request identifiers, logging, compression, sessions, authentication, security headers and body parsing. Chains can be global, per route group or per route. Order matters because each layer sees only what outer layers produced. The difficulty is ordering dependencies and cost: every layer runs on every request.",
    k: ["Global stack with per-route exclusions vs per-group stacks: global defaults are safe, while groups express differences between pages and APIs explicitly.", "Wrapping layers vs separate before and after hooks: wrapping handles state across both phases and errors naturally, but nests deeply and hides ordering."],
    p: ["Authentication placed after the session layer or body parser fails in ways that look unrelated to ordering.", "A middleware that catches exceptions but forgets to re-raise hides failures from the error handler and logs."],
    v: "Print the effective stack for a route and confirm its order, then send requests that exercise early exit, response modification and an exception, and confirm each layer observed exactly the documented before and after events.",
    dep: ["request-object", "response-object", "error-handling"]
  },
  "body-parsing": {
    s: "Decodes request bodies by content type, including URL-encoded forms, JSON and multipart data, into structured values, with size and depth limits.",
    d: "A parser selected by Content-Type reads the body stream and produces nested parameters. It enforces limits on total size, number of fields, nesting depth and decompression ratio before building objects, and rejects malformed input with 400 or 413, and unsupported types with 415. Streaming parsers avoid holding large bodies in memory. The difficulty is hostile input: deeply nested structures, huge arrays, duplicate keys and parser differentials between layers have caused denial of service and bypasses.",
    k: ["Parse all bodies by default vs only on routes that declare input: parsing everywhere is easy, but wastes work and widens the attack surface.", "Lenient parsing of duplicates and bad encodings vs strict rejection: leniency tolerates clients, but different layers may disagree about the meaning."],
    p: ["No limit on body size or nesting lets one request exhaust memory or CPU.", "Duplicate keys handled differently by a proxy and the framework allow filters in one layer to be bypassed in the other."],
    v: "Send a body just over the size limit, a deeply nested document, duplicate keys, a wrong content type and malformed JSON. Confirm 413, 400 or 415 as appropriate, bounded memory use and the same values seen by validation and by the handler.",
    dep: ["request-object", "configuration"]
  },
  "file-uploads": {
    s: "Receives multipart file uploads, streaming them to temporary storage with size and type checks, then hands them to the application to validate and store permanently.",
    d: "A multipart parser separates fields from file parts, writing each file to a temporary location instead of memory, and reports name, declared type, size and a handle. The application checks size, sniffed content type and extension, scans or transforms the file, generates its own storage name and moves it to the file storage layer. Direct-to-storage uploads with signed URLs bypass the application server. The difficulty is distrust: names, types and contents are all attacker-controlled.",
    k: ["Upload through the application vs direct-to-storage with signed URLs: through-application is simple and checkable, but ties up workers, while direct upload scales but validates after the fact.", "Trust declared content type vs inspect file contents: declared types are free and wrong often, while inspection costs CPU but resists disguised files."],
    p: ["Storing a file under the client-supplied name allows path traversal or overwriting other files.", "Serving uploaded files from the application's own origin lets uploaded HTML or SVG run script with the site's privileges."],
    v: "Upload an oversize file, a file with a traversal name, a script disguised as an image and a normal image. Confirm the first three are rejected or neutralized, the last is stored under a generated name and temporary files are cleaned up.",
    dep: ["body-parsing", "file-storage", "validation"]
  },
  "streaming-responses": {
    s: "Sends response bodies incrementally as they are produced, for large downloads, exports, progressive rendering and long-lived event streams, without buffering them in memory.",
    d: "A handler returns a body that is a generator, stream or file handle; the adapter writes chunks as they become available, using chunked transfer or fixed length, and handles client disconnects and backpressure. Uses include CSV exports, file downloads with range requests, streamed page rendering and server-sent events. The difficulty is everything that assumes a complete response: compression and proxies may buffer, middleware cannot change headers afterward, and errors midway cannot change the status.",
    k: ["Stream from the database cursor vs build the whole export first: streaming bounds memory, but holds a connection and a worker for the full duration.", "Chunked streaming vs precomputed files served from storage: streaming starts immediately, while precomputed files offload work and support resumable range requests."],
    p: ["An intermediary buffers the response, so users see nothing until the end and the stream seems broken.", "A slow client holds a worker and database connection for minutes, exhausting the pool."],
    v: "Stream a large export and confirm memory stays flat, the first bytes arrive quickly, and cancelling the download client-side stops server work and releases the database connection within seconds.",
    dep: ["response-object", "server-adapters", "connection-pooling"]
  },
  "static-file-serving": {
    s: "Serves files from disk or storage for assets and downloads, with correct content types, conditional and range requests, cache headers and protection against path traversal.",
    d: "A handler or middleware maps URL paths to a root directory, resolves them safely, sets content type from the extension, adds validators and cache lifetimes, and supports range and conditional requests. In production a front server or content delivery network usually serves these directly and the framework only handles the cache-miss path. The difficulty is safety and efficiency: path resolution must never leave the root, and serving through application workers wastes them on bytes a simpler server handles better.",
    k: ["Serve through the framework vs from the front server or CDN: through-framework is simple and works everywhere, but spends workers on file transfer.", "Aggressive immutable caching vs short lifetimes: immutable caching is fastest, but only safe for content-hashed names."],
    p: ["Path normalization done after the permission check lets encoded dot segments read files outside the directory.", "Dotfiles, source maps or backups sitting in the public directory get served and expose source or secrets."],
    v: "Request files with traversal sequences in plain and encoded form, a hidden file, a missing file and a real file with a range header. Only the real file should return content, with the correct type, validators and a 206 for the range.",
    dep: ["request-object", "response-object", "http-caching"]
  },
  "csrf-protection": {
    s: "Prevents other sites from making a signed-in user's browser perform state-changing requests, by requiring a secret token or a same-site origin proof on unsafe methods.",
    d: "The framework issues a per-session or per-request token embedded in forms and exposed to scripts, and rejects unsafe-method requests whose token is missing or wrong. Complementary defenses check Origin and Referer headers and set cookies with SameSite attributes. API clients using bearer tokens in headers are not affected, because browsers do not attach those automatically. The difficulty is coverage: tokens must reach every form and script call, caching must not serve one user's token to another, and exemptions must be deliberate.",
    k: ["Synchronizer tokens vs double-submit cookies: synchronizer tokens need session state, while double-submit is stateless but weaker if cookies can be set by subdomains.", "Token required on every unsafe route vs opt-in per route: universal protection prevents omissions, but needs explicit exemptions for webhooks."],
    p: ["Page caching serves a cached form containing another user's token, causing failures or leaking tokens.", "Protection is disabled for a route to make a third-party callback work and is never re-enabled for neighbors."],
    v: "Submit a state-changing request from a page on a different origin using the victim's session cookie and confirm it is rejected. Then submit it from the real form with a valid token and confirm it succeeds.",
    dep: ["session-store", "cookie-handling", "middleware-pipeline"]
  },
  "xss-protection": {
    s: "Layers that stop injected script from running: output escaping, input sanitization for rich text and a Content Security Policy that restricts where scripts may load from.",
    d: "Escaping prevents most injection at output time. Where users may submit markup, a sanitizer with an allowlist removes dangerous elements and attributes. A Content Security Policy header limits script sources, usually with per-response nonces so inline scripts must carry a valid one, and reports violations. Cookie flags such as HttpOnly limit the damage of script that does run. The difficulty is that policy and sanitizer rules are strict, and third-party scripts, inline handlers and legacy pages break under them.",
    k: ["Nonce-based policy vs host allowlists: nonces resist allowlisted-host abuse, but need per-response generation and cannot be cached with the page.", "Sanitize on input vs on output: sanitizing on output adapts to every context, while on-input cleaning is cheaper but locks in one context's rules."],
    p: ["A Content Security Policy allowing unsafe inline script or broad hosts is present, but gives no real protection.", "A sanitizer allowlist adds one attribute or tag for a feature and opens a new bypass."],
    v: "Submit known script payloads through each input that reaches a page and confirm none executes in a browser with the policy active. Check the policy header on every page and review violation reports for real traffic.",
    dep: ["output-escaping", "security-headers", "cookie-handling"]
  },
  "injection-protection": {
    s: "Defenses against untrusted input becoming code in another interpreter: parameterized queries for SQL, safe argument passing for commands, and escaping for LDAP, templates and paths.",
    d: "The core rule is to keep data and commands separate. Query builders and mappers send values as bound parameters, never concatenated into SQL. Process execution uses argument arrays instead of shell strings. File paths are resolved against a root and checked. Identifiers such as sort columns, which cannot be parameterized, are allowlisted. Serialized object loading is limited to safe formats. The difficulty is escape hatches: raw query fragments, dynamic ordering and string-built filters are where injection returns.",
    k: ["Parameterized queries everywhere vs escaping functions: binding is correct by construction, while escaping depends on getting each context right.", "Allowlist for dynamic identifiers vs quoting them: allowlisting is strict and simple, but needs a list maintained as columns change."],
    p: ["A raw SQL fragment used for a custom sort or search builds a query from a request parameter.", "Passing a user-supplied file name to a shell command string allows arbitrary command execution."],
    v: "Send classic injection strings into every parameter that reaches a query, command or path, and confirm they are stored or rejected as plain data. Search code for raw query and shell calls and confirm each takes only bound or allowlisted values.",
    dep: ["query-builder", "mass-assignment-guard"]
  },
  "security-headers": {
    s: "Response headers that instruct browsers to apply protections: transport security, content-type sniffing prevention, framing limits, referrer policy and permission restrictions.",
    d: "A middleware adds a set of headers to every response: strict transport security to force HTTPS, a no-sniff directive, a frame restriction against clickjacking, a referrer policy, cross-origin isolation and permission policies, alongside the content security policy. Defaults should be secure with per-route overrides. The difficulty is that these headers interact with real features: framing restrictions break legitimate embeds, and a mistaken transport security setting can lock users out of a domain for a long time.",
    k: ["Secure defaults with opt-out vs opt-in headers: secure defaults protect forgetful teams, but can break embeds and old pages until adjusted.", "Long transport-security lifetimes with preload vs short ones: long lifetimes protect strongly, but are hard to reverse if HTTPS breaks on a subdomain."],
    p: ["Headers added only to application responses are missing from static files and error pages served elsewhere.", "A transport-security header with subdomain coverage is sent before every subdomain supports HTTPS."],
    v: "Scan the home page, an API route, a static file and an error page with a header checker and confirm each carries the intended set. Confirm an embed on another origin is blocked where the framing rule applies.",
    dep: ["middleware-pipeline", "response-object"]
  },
  "cors-policy": {
    s: "Declares which other origins a browser may call this server from, answering preflight requests and adding the allow headers to real responses.",
    d: "Browsers block cross-origin reads unless the server permits them. The policy lists allowed origins, methods, headers, whether credentials may be sent, and how long preflight results are cached. A middleware answers preflight OPTIONS requests before routing and adds headers to actual responses, matching the Origin header against the list. The difficulty is subtlety: allowing credentials requires a specific origin, never a wildcard, reflecting any origin defeats the policy, and caches must be told the response varies by Origin.",
    k: ["Explicit origin allowlist vs reflecting the request origin: an allowlist is safe, while reflection is convenient and lets any site read authenticated responses.", "Policy in the framework vs at the edge proxy: framework policy is per route and testable, while edge policy applies uniformly and cheaply."],
    p: ["Reflecting the Origin header together with allowed credentials lets any website read signed-in users' data.", "Responses lacking a Vary: Origin header are cached by a proxy and served to the wrong origin."],
    v: "Send preflight and real requests from an allowed origin, a disallowed origin and a null origin, with and without credentials. Only the allowed origin should receive allow headers, and every variant should carry Vary: Origin.",
    dep: ["middleware-pipeline", "request-object"]
  },
  "rate-limiting": {
    s: "Caps how many requests a client, user or key may make in a time window, answering excess requests with 429 and a retry hint, to blunt abuse and brute force.",
    d: "A counter keyed by client address, user, API key or route is checked at the start of the pipeline, using fixed windows, sliding windows or token buckets, stored in a shared cache so all workers agree. Stricter limits apply to login, password reset and expensive endpoints. Responses carry limit and retry headers. The difficulty is identification and shared state: addresses behind proxies and shared networks misidentify clients, and limit storage becomes a dependency and a hot spot.",
    k: ["Limit by address vs by account or key: addresses work before login but punish shared networks, while accounts are precise but only after identification.", "Fail open vs fail closed when the counter store is down: failing open keeps the site up, but removes brute-force protection exactly when it may be needed."],
    p: ["The limiter keys on the proxy's address instead of the client's, so one user's traffic blocks everyone.", "Per-process counters multiply the real limit by the number of workers."],
    v: "Send requests above the limit from one client and confirm 429 with a retry header, while a second client remains served. Run across several workers and confirm the total allowed equals the configured limit.",
    dep: ["cache-store", "trusted-proxy-handling", "middleware-pipeline"]
  },
  "trusted-proxy-handling": {
    s: "Decides which forwarded headers to believe, so the real client address, scheme and host are recovered behind load balancers and proxies, and spoofed values are ignored.",
    d: "Behind proxies the connection's peer is the proxy. Headers such as the forwarded address, protocol and host carry the original values, but any client can send them. The framework accepts them only from configured trusted proxy addresses, takes the right entry from a multi-hop list, and also validates the Host header against an allowed list. The result feeds request URLs, redirects, secure-cookie decisions and logging. The difficulty is topology: the number of trusted hops differs by deployment.",
    k: ["Trust by proxy address list vs trusting a fixed hop count: address lists adapt to infrastructure changes, but hop counts are simpler and survive address changes if the topology is fixed.", "Strict host allowlist vs accepting any host: strict rejects spoofed hosts early, but breaks when new domains arrive without configuration."],
    p: ["Trusting forwarded headers from all sources lets any client claim to be a local address and bypass address-based rules.", "Failing to trust the proxy's scheme header makes the app think requests are plain HTTP and loop on HTTPS redirects."],
    v: "Send a request with a spoofed forwarded address directly and through the proxy, and confirm the spoofed value is ignored in the first case and the real address used in the second. Send a bad Host header and confirm rejection.",
    dep: ["request-object", "configuration"]
  },
  "mass-assignment-guard": {
    s: "Restricts which request fields may be copied into model attributes, using explicit allowlists, so users cannot set fields such as role or ownership by adding them to a request.",
    d: "When a handler passes request parameters into a model's create or update, every submitted key could set a column. The guard requires the handler to name permitted fields, often through a per-action permitted-parameters declaration, or the model to declare assignable fields. Unpermitted keys are dropped or raise an error. Nested records need the same treatment. The difficulty is maintenance: new columns added to models are quietly assignable under denylist schemes, and broad allowlists drift as features are added.",
    k: ["Allowlist in the request layer vs on the model: request-level lists reflect each action's context, while model-level lists protect every path but cannot vary by caller.", "Silently dropping unknown keys vs raising: dropping is forgiving to clients, while raising makes probing and mistakes visible."],
    p: ["A denylist of protected fields misses a column added later, which becomes writable by any user.", "Permitting a whole nested hash passes through keys that the nested model never intended to expose."],
    v: "Submit a create and an update request including extra keys such as role, owner and timestamps, and confirm those columns are unchanged in the database while permitted fields are saved.",
    dep: ["model-layer", "form-handling", "request-object"]
  },
});
