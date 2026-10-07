// Details for the web server plate, part 1: configuration, observation, routing, cross-cutting concerns.
ATLAS.details("web-server", {
  "config-language": {
    s: "The declarative syntax operators use to describe listeners, sites, rules and upstreams, organized as nested blocks of directives with inheritance from outer to inner scope.",
    d: "Directives are grouped into contexts such as global, per-site and per-rule, and an inner context inherits from the outer one unless it overrides. Each directive declares which contexts accept it, how many arguments it takes and how it merges with its parent value. The language is declarative: order matters only where it is documented. It is hard because inheritance has subtle rules, since some directives replace an inherited list while others append, so a rule added in one place can silently discard another.",
    k: ["Declarative blocks with inheritance versus imperative scripts: configuration is easy to validate and diff, but conditional logic is awkward and operators reach for escape hatches.", "Replace-on-override versus append-on-override for list directives: replacement is predictable per scope, but an inner block silently drops headers or rules set outside it."],
    p: ["A directive set at the outer level is assumed to apply inside a block that overrides it, so a security header disappears on one path.", "Using conditionals inside rules as if they were general if-statements produces surprising behavior because only some directives run under them."],
    v: "Dump the effective configuration for one request path and confirm each directive's value matches what the nested blocks and inheritance rules predict, including one deliberately overridden list.",
    dep: ["config-validation"]
  },
  "config-validation": {
    s: "Parses the configuration into a typed tree, checks each directive against its allowed contexts, argument types and cross references, and refuses to start or reload on any error.",
    d: "A tokenizer feeds a parser that builds blocks, then each module's own checker runs: are the referenced upstreams defined, do certificate files exist and match their keys, do listen addresses conflict, are regular expressions valid. A test-only mode parses and validates without binding sockets, for use in deployment pipelines. The hard part is validating what only exists at runtime: file permissions of the worker user, name resolution and port availability can pass a syntax check and still fail on apply.",
    k: ["Strict failure on any unknown directive versus warning and continuing: strictness catches typos before traffic is affected, but a module that was not loaded turns a harmless difference into a refusal to start.", "Validation in a separate test mode versus only at apply time: pipelines can reject bad changes early, but the test environment may differ from production."],
    p: ["A configuration passes the syntax test but references a certificate the worker user cannot read, so the reload fails after approval.", "Warnings about overlapping server names or unused variables are ignored until they cause a wrong-site response."],
    v: "Feed a configuration with a misspelled directive, a missing certificate file and a duplicate listen address to the test mode, and confirm it exits nonzero with each problem named by file and line, without opening any socket.",
    dep: ["config-language"]
  },
  "config-includes": {
    s: "Lets one configuration pull in many files by pattern and expand named variables and maps at request time, so large fleets can share fragments and per-request values.",
    d: "Include directives splice files or glob patterns into the tree at parse time, so each site or upstream can live in its own file. Variables are named values computed per request, such as the client address, the matched host or a response header, and can be used in log formats, rewrites and header values. Maps compute one variable from another by lookup. Variables evaluate lazily, so a variable not used costs nothing. The difficulty is that includes make the effective configuration hard to see, and variable expansion is a place where untrusted request data enters otherwise static text.",
    k: ["Lazy variable evaluation versus computing all up front: unused variables cost nothing, but a variable's value can change between uses if the request changes mid-flight.", "Glob includes versus an explicit file list: dropping a file in a directory is easy, but a stray or half-written file is loaded silently."],
    p: ["A glob include picks up a backup or editor swap file, producing duplicate site definitions.", "A request-derived variable is placed into a file path or a response header without sanitizing, allowing path or header injection."],
    v: "Add a file in an included directory defining a new site, reload, and confirm it serves; then print the fully expanded configuration and confirm the file contents appear at the include point.",
    dep: ["config-language"]
  },
  "hot-reload": {
    s: "Applies a new configuration without stopping the service: new workers start with the new settings while old workers finish their requests and exit.",
    d: "On a reload signal the master process re-parses and validates the file, opens any new listening sockets, starts a fresh set of workers with the new configuration and tells the old workers to stop accepting and finish. Existing connections stay on old workers until they close. If validation fails, the old configuration keeps running and the error is logged. The hard parts are the overlap period, where two generations run together using double the memory and compete for shared state, and long-lived connections such as streaming or upgraded ones that keep old workers alive indefinitely.",
    k: ["Start new workers and retire old ones versus mutating workers in place: the generation swap is simple and atomic per connection, but memory and shared-zone usage briefly double.", "Keep the old configuration on failure versus exit: availability is preserved, but the running state silently diverges from the file on disk."],
    p: ["Long-lived connections keep old workers running for days, holding memory and an outdated configuration.", "A reload that fails validation is sent from automation that does not check the result, leaving the change unapplied while the deploy is reported successful."],
    v: "Open a slow download, change the site's response header, reload, and confirm the old download completes unchanged while a new request shows the new header and the old worker exits afterward.",
    dep: ["config-validation", "master-process", "graceful-drain"]
  },
  "binary-upgrade": {
    s: "Replaces the running executable with a new version without closing listening sockets or dropping connections, by starting a new master that inherits the sockets.",
    d: "The old master re-executes the new binary and passes the listening descriptors through environment or inherited handles. The new master starts its own workers and both generations accept on the same sockets. Operators then tell the old master to drain, or to roll back by retiring the new one. A pidfile and signal protocol coordinate the steps. It is hard because the two versions must agree on shared memory layout, on any state files and on configuration, and because a bad new binary must be reversible while the old one still holds the sockets.",
    k: ["Inherited-socket re-exec versus a front load balancer cycling instances: no extra infrastructure is needed, but the two versions run on one machine and share its resources and state files.", "Manual two-step cutover versus automatic: an operator can verify the new generation before draining the old, at the cost of a scripted, error-prone procedure."],
    p: ["The new version changes the shared-memory layout, and old and new workers corrupt each other's zones during the overlap.", "The pidfile is overwritten by the new master, so a later stop signal targets the wrong generation."],
    v: "Upgrade the binary while a load generator runs and confirm zero connection resets, a new version string in responses, and the old master exiting once drained; then roll back and confirm the same.",
    dep: ["master-process", "listen-sockets", "graceful-drain"]
  },
  "graceful-drain": {
    s: "Stops accepting new connections, lets in-flight requests finish within a deadline, tells keep-alive clients to reconnect, and then exits.",
    d: "On a quit signal a worker closes or stops polling its listening sockets, marks idle keep-alive connections to close after their current response, sends a connection-close header or an HTTP/2 shutdown notice with the last accepted stream, and waits for active requests. A deadline bounds the wait, after which remaining connections are cut. The hard part is knowing what is idle: a connection waiting for a request is safe to close, but one the client has just started writing on is not, and an HTTP/2 or HTTP/3 shutdown needs a two-phase notice so no stream is lost to a race.",
    k: ["A fixed drain deadline versus waiting indefinitely: a deadline bounds deploy time, but cuts long downloads and streams at the cutoff.", "Two-phase shutdown notice for multiplexed protocols versus an immediate close: the extra step avoids losing a request sent just as shutdown begins, at the cost of added delay."],
    p: ["Closing idle connections without a notice makes clients see a reset on a request they had just sent.", "Upgraded connections such as WebSockets never finish, so the drain always hits its deadline."],
    v: "Start a long response, begin a drain, and confirm the response completes, new connections are refused or sent elsewhere, idle keep-alive clients receive a close signal, and the process exits within the deadline.",
    dep: ["connection-state-machine", "keep-alive", "worker-supervision"]
  },
  "control-interface": {
    s: "The channel through which operators and automation signal the running server: process signals, a local control socket, or a small administrative API for status and runtime changes.",
    d: "Signals map to reload, reopen logs, quit and upgrade. Some servers add a local socket or administrative endpoint that can list upstreams, mark backends up or down and dump statistics, with changes held in shared memory so every worker sees them. Access is limited to the local host or an authenticated channel. It is hard because runtime changes are not in the configuration file, so they vanish on reload or restart unless they are persisted, and an administrative endpoint exposed to the wrong network is full control of the server.",
    k: ["Signals only versus a control API: signals are simple and need no listener, but cannot carry arguments or return results.", "Runtime changes held in memory versus written back to the configuration: in-memory changes are instant, but they are lost on restart and make the file misleading."],
    p: ["The administrative endpoint is bound to all interfaces and reachable from untrusted networks.", "An operator marks a backend down at runtime, a reload resets it to up, and traffic returns to a backend being repaired."],
    v: "Mark a backend down through the control interface and confirm no request reaches it; then reload and confirm whether the state persists as documented, and that a non-local address cannot reach the interface.",
    dep: ["shared-memory-zones", "upstream-groups", "metrics-counters"]
  },
  "access-log": {
    s: "Writes one structured record per completed request containing client, request line, status, sizes, timings and selected headers, in a configurable format.",
    d: "A format string with variables is compiled at load time and evaluated when the response finishes, then appended to a buffer and written to a file, pipe or remote collector. Fields typically include timings for the whole request and for the upstream, bytes sent, cache status and the TLS version. Records are written after completion, so a request that never finishes is missing. The difficulty is cost and fidelity: formatting and writing on every request affects latency, and logs can leak tokens and personal data carried in URLs and headers.",
    k: ["Text format versus structured records: text is compact and familiar, but structured output is parsed reliably and extended without breaking consumers.", "Log after completion versus at request start: completion allows full timings and status, but a hung or crashed request leaves no trace."],
    p: ["Query strings with session tokens are logged in full, leaving credentials in files with wide read access.", "A format change drops a field that downstream parsers assumed, silently emptying dashboards."],
    v: "Send a request with a known path, status and a slow upstream, and confirm one log line appears with the right status, byte count, and an upstream time that is a plausible fraction of the total time.",
    dep: ["config-includes", "log-rotation", "request-tracing"]
  },
  "error-log": {
    s: "Records the server's own diagnostics at selectable severity levels: configuration warnings, upstream failures, parsing rejections, resource exhaustion and optional debug traces.",
    d: "Messages carry a severity, a timestamp, the worker, the connection or request they relate to and a text. A level setting filters at write time, and finer levels can be enabled for chosen client addresses without raising global verbosity. Rejected or malformed requests, timeouts and failed handshakes are logged here rather than in the access log. The hard part is volume and signal: a flood of bad clients can fill the log faster than anyone reads it, and the most useful lines, such as the reason a backend was marked failed, are easy to bury.",
    k: ["Global level versus per-client or per-site level: scoped debugging finds a problem without drowning the log, but needs configuration changes during an incident.", "Log every rejected request versus rate-limit messages: full detail aids investigation, while limiting keeps a scanner from filling the disk."],
    p: ["Debug level left on after an investigation slows the server and fills the disk within hours.", "Errors about upstream failures omit the upstream address, so an operator cannot tell which backend is bad."],
    v: "Stop one backend, send a request that routes to it, and confirm an error line names the upstream address, the failure reason and the request, at the configured severity and no lower one.",
    dep: ["log-rotation", "request-tracing"]
  },
  "log-rotation": {
    s: "Moves, reopens and buffers log files so they do not grow without bound and so writes do not block request handling.",
    d: "An external tool renames the file and signals the server to reopen it, or the server writes to a pipe or syslog-style transport that handles rotation. Writes go through a buffer flushed when full or after a short interval, and some servers batch compress. Workers must all reopen on the signal. The difficulty is the boundary: records written between rename and reopen go to the old file, a full disk can stall or fail writes, and a log pipe that blocks can stall workers unless writes are bounded or dropped.",
    k: ["Buffered writes versus flush per record: buffering cuts system calls sharply, but a crash loses the last records.", "Rotate by rename and reopen versus a copy-and-truncate: rename keeps every record, while truncation is simpler but can lose lines written during the copy."],
    p: ["Rotation renames the file but the reopen signal is never sent, so the server keeps writing to a deleted file and the disk fills.", "A log pipe to a slow collector blocks the worker's write and stalls request handling."],
    v: "Rotate logs under load, signal reopen, and confirm every request in a numbered test appears in exactly one of the old or new files, with new records only in the new file.",
    dep: ["worker-supervision"]
  },
  "request-tracing": {
    s: "Assigns or accepts a unique identifier per request, forwards it upstream and writes it to logs so one request can be followed across the proxy and the services behind it.",
    d: "The server accepts a trace identifier from a trusted client or generates a random one, stores it in a variable, adds it to the upstream request and to the response, and writes it in access and error records. Standard trace-context headers may be propagated or extended with a new span for the proxy hop. The challenge is trust: identifiers from untrusted clients can be forged or used to inject log text, so they are validated and length limited, and generated identifiers must be unique across workers and hosts without coordination.",
    k: ["Trust the client's identifier versus always generate a new one: reusing it keeps one trace across the whole path, but an untrusted client can collide with or forge others.", "Random identifiers versus time-ordered ones: random is simple and collision-resistant, while time-ordered sorts well in storage but leaks timing."],
    p: ["An attacker supplies an identifier containing newlines or separators, which splits or forges log records.", "The identifier is generated but not forwarded on retries, so the same user request appears as unrelated traces."],
    v: "Send a request with and without an identifier and confirm the upstream receives one in both cases, the response echoes it, and the same value appears in both the access log and the upstream's own record.",
    dep: ["upstream-request-build", "access-log"]
  },
  "metrics-counters": {
    s: "Cheap per-worker counters and histograms for connections, requests, bytes, status classes, timings and upstream outcomes, aggregated across workers for scraping.",
    d: "Each worker updates counters in its own memory or in shared atomic zones, with timing recorded into fixed buckets. Aggregation across workers happens at read time. Dimensions such as site, upstream and status class are bounded in advance. The challenge is cardinality and contention: labeling by URL path or client address creates unbounded series, and one shared counter updated by every worker on every request becomes a cache-line bottleneck, so per-worker counters summed on read are preferred.",
    k: ["Per-worker counters summed on read versus shared atomic counters: per-worker avoids cache contention, but a read walks every worker and may be slightly inconsistent.", "Fixed histogram buckets versus recording raw samples: fixed buckets use bounded memory and merge across workers, but lose precision between boundaries."],
    p: ["Labeling metrics with the full request path creates millions of series and exhausts memory in the collector.", "Counters reset on reload because they live in worker memory, so rates computed over the reload show negative or huge values."],
    v: "Send exactly one thousand requests with known statuses and confirm the counters increase by one thousand in total and by the right amount per status class, and that a reload does not lower a cumulative value.",
    dep: ["shared-memory-zones", "event-loop-workers"]
  },
  "status-endpoint": {
    s: "A built-in, access-controlled page or API that returns live server state: active connections, accepted and handled totals, upstream health and cache statistics.",
    d: "The handler reads the counters and the shared zones and returns them as text or structured data. Typical contents are current reading, writing and waiting connections, total accepted and handled connections, request totals, and per-upstream state with failure counts. It is attached to a rule restricted by address or credentials. The difficulty is exposure: the data reveals topology and load, so it must not be reachable from the public listener, and reading it must not take locks that stall workers.",
    k: ["A separate listener on a private address versus a restricted path on the public site: a private listener cannot be reached by mistake, but needs its own address and firewall rule.", "Pull from the server versus push to a collector: pull is simple and stateless, while push survives short-lived instances but needs a destination."],
    p: ["The status path is left reachable from the internet and discloses internal upstream addresses.", "Reading statistics takes a lock held by workers, so frequent scraping adds latency to requests."],
    v: "Fetch the status endpoint from the private address and confirm counts change as a test load runs, then fetch it from a public address and confirm it is refused.",
    dep: ["metrics-counters", "ip-access-rules", "upstream-groups"]
  },
  "vhost-selection": {
    s: "Chooses which site's configuration applies to a request by matching the listener address and port, then the TLS server name or Host header against the declared names.",
    d: "Connections are first matched to a listener, then to a site by name: exact names, wildcard prefixes and suffixes, and regular expressions are tried in a fixed order, with a default site when nothing matches. For encrypted traffic the name comes from the handshake before any request is read, and the Host header is checked again afterwards. The hard parts are the mismatch between the two names, which allows requests for one site over a connection negotiated for another, and the default site, which receives every unrecognized name and scanner.",
    k: ["Match by server name only versus also by IP address: name matching supports many sites on one address, but clients without names, or old ones, reach the default.", "Exact names first, then wildcards, then regexes versus configuration order: a fixed precedence is predictable, but operators must learn it."],
    p: ["The default site is an internal application, so any request with an unknown host header reaches it.", "A connection negotiated for one site reuses the connection with a different Host header and bypasses that site's client certificate requirement."],
    v: "Send requests with each configured name, a wildcard match and an unknown name to one address, and confirm each reaches the intended site, with the unknown name going to a deliberately empty default.",
    dep: ["listen-sockets", "certificate-selection", "http1-parser"]
  },
  "location-matching": {
    s: "Selects the rule inside a site that handles a request by comparing the normalized path against prefix, exact and pattern matches in a defined precedence.",
    d: "After a site is chosen the path is normalized and compared against rules: exact matches win, then the longest prefix, with a pattern check that can override depending on modifiers. Matching is done on a decoded, canonical path so that percent-encoding and dot segments cannot dodge a rule. Each rule carries the handler and directives that apply. The difficulty is precedence: pattern rules and prefix rules interact in ways that depend on modifiers, so a rule added for one path can capture another, and security rules attached to a prefix can be bypassed by an equivalent path that matches a different rule.",
    k: ["Longest-prefix with pattern overrides versus first-match in file order: the mix is expressive and fast, but the winner is harder to predict than the order of lines.", "Match on the decoded path versus the raw one: decoded matching defeats encoding tricks, but changes meaning for encoded separators."],
    p: ["Access control is attached to a prefix, and a request with a different case or encoding reaches the same file through another rule.", "A broad pattern rule added later captures static assets and sends them to the application."],
    v: "Request one path in its plain, percent-encoded, doubled-slash and dot-segment forms and confirm each lands on the same rule, with the access control applied, using the debug log's matched-rule line.",
    dep: ["path-resolution", "vhost-selection", "phase-pipeline"]
  },
  "rewrite-engine": {
    s: "Changes the request path or query using pattern substitutions, with flags that continue, restart rule matching, redirect or stop.",
    d: "Rules hold a regular expression, a replacement using captured groups and variables, and a flag. When the pattern matches, the internal URI changes and the server either continues with the next rewrite, restarts location matching with the new path, or issues a redirect. A loop counter bounds restarts. The hard parts are regular expression cost and order: a complex pattern on every request is hot-path CPU, an unanchored pattern matches more than intended, and rewrites interact with location matching since each restart can select a different rule.",
    k: ["Rewrite and restart matching versus resolve in place: restarting lets the new path pick its own rule, but a poorly bounded chain loops or surprises.", "Regular expressions versus prefix substitution: expressions are flexible, but cost more per request and are easy to get subtly wrong."],
    p: ["An unanchored pattern also matches paths containing the string deeper in the URL and rewrites them wrongly.", "Two rules rewrite each other's results and loop until the limit returns an internal server error."],
    v: "Feed a table of paths through the rewrite rules with the debug log on and confirm each produces the expected final path and rule, including a path that should not match and a loop that stops at the limit.",
    dep: ["location-matching", "config-includes", "internal-redirects"]
  },
  "redirects": {
    s: "Answers with a status and a Location header that sends the client elsewhere, for canonical host names, scheme upgrades, moved paths and trailing-slash corrections.",
    d: "A rule or handler produces a permanent or temporary redirect, building the target from variables. Common cases are upgrading plain connections to encrypted ones, choosing a canonical host, and adding a slash to a directory path. Permanent redirects are cached by clients and shared caches for a long time, and the status code determines whether a method and body are preserved. It is hard because of the target: building it from the Host header trusts client input, and redirects behind a proxy must use the externally visible scheme, port and name rather than the internal ones.",
    k: ["Permanent versus temporary status: permanent saves requests and transfers ranking, but a mistaken one stays cached in browsers and is hard to undo.", "Build the target from the request Host versus a configured canonical name: using the request is flexible, but permits host header injection and wrong names behind proxies."],
    p: ["A redirect built from an attacker-chosen Host header sends users to another site from a trusted link.", "Behind a terminating proxy the redirect uses the internal scheme and port, producing a loop or a broken link."],
    v: "Request a plain-scheme URL, a non-canonical host and a directory path without a slash, and confirm each gets the expected status and a Location with the public scheme and name; send a forged Host and confirm it is not echoed.",
    dep: ["vhost-selection", "rewrite-engine", "config-includes"]
  },
  "try-files": {
    s: "Tries a list of candidate files or directories in order and falls back to a final rule or status, the usual way to serve static assets first and an application otherwise.",
    d: "For each candidate the handler builds a path from the request and checks whether it exists as a file or directory, using the open file cache. The first existing candidate is served by the static handler. If none exist, the last entry is an internal redirect to a named rule or a status code. This supports single-page applications and front-controller patterns. The difficulty is cost and correctness: each candidate is a file system lookup, and a fallback to the application turns missing static files into expensive application errors instead of cheap not-found responses.",
    k: ["Static-first with application fallback versus routing the application by explicit prefixes: fallback needs little configuration, but every typo reaches the application.", "Existence checks on each request versus a cached result: live checks see new files immediately, but add system calls that the open file cache can absorb."],
    p: ["Requests for missing images fall through to the application, which renders a full error page and loads the database.", "A candidate built from user input without normalization lets path segments escape the document root."],
    v: "Request an existing asset, a missing asset and an application route, and confirm the first is served from disk, the second returns not-found without reaching the application, and the third reaches it, as shown in both logs.",
    dep: ["static-handler", "internal-redirects", "open-file-cache"]
  },
  "internal-redirects": {
    s: "Restarts request processing with a different path or rule inside the server, without telling the client, bounded by a counter to prevent loops.",
    d: "A handler, a rewrite or an error page mapping can ask the server to process the request again as if it had been for another URI. Location matching runs again on the new path, while the client sees only the final response. A header or flag can mark an internal-only target so clients cannot request it directly. A cycle counter ends runaway chains with a server error. The difficulty is state: some per-request values are reset on restart and others are not, so variables, status and headers can differ between the first and second pass.",
    k: ["Internal restart versus a client redirect: internal avoids a round trip and hides structure, but the URL the client sees no longer matches what was served.", "A fixed maximum number of restarts versus unbounded: a limit stops loops cheaply, but a legitimate long chain fails with an error."],
    p: ["An internal-only location is reachable by clients because the rule was not marked as internal.", "A header set before the restart is lost or duplicated after it, producing inconsistent responses on error pages."],
    v: "Trigger a rule that restarts to an internal-only path and confirm the client gets its content, a direct request to the internal path is refused, and a deliberately looping pair stops at the limit.",
    dep: ["location-matching", "phase-pipeline"]
  },
  "error-pages": {
    s: "Maps response status codes, from the server or from upstreams, to custom pages, redirects or internal handlers, with controls over whether upstream errors are intercepted.",
    d: "A table maps a status to a file, a URL or a rule. When the server produces the status, or when the proxy sees one from an upstream and interception is on, the response body is replaced by the mapped content, optionally with a changed status code. Error responses should remain small, cached carefully and not leak internals. The difficulty is recursion and information: an error page that itself fails produces a loop, and default pages can reveal the server name and version.",
    k: ["Intercept upstream errors versus pass them through: interception gives consistent branded pages, but hides detailed machine-readable error bodies that API clients need.", "Serve the page from disk versus from the application: static pages work even when the application is down, but cannot show request-specific information."],
    p: ["The error page is served by the same failing upstream, so an outage produces an empty or looping response.", "Interception replaces JSON error bodies from an API with an HTML page that clients cannot parse."],
    v: "Stop the application and request a page through the proxy and confirm the static error page is served with the correct status; separately, return a JSON error from the upstream and confirm it is passed unchanged where interception is off.",
    dep: ["internal-redirects", "proxy-handler", "static-handler"]
  },
  "phase-pipeline": {
    s: "The fixed ordered sequence of stages a request passes through, such as rewrite, access, content and log, where each module registers handlers for the stages it needs.",
    d: "Stages are named points: after reading headers, server rewrite, rule selection, rule rewrite, preaccess, access, try-files, content and log. A module registers a handler in a stage, and the stage's handlers run in a defined order with a return code that continues, declines, finishes with a status or stops. Exactly one content handler produces the response. The hard part is ordering across modules: a feature built for one stage cannot see what happens in a later one, and a check placed in the wrong stage can run after the content has already been chosen.",
    k: ["Fixed stages versus arbitrary hooks: fixed stages keep behavior understandable and efficient, but a feature that needs two stages must be split across modules.", "Handlers return verdicts versus manipulating shared state: verdicts keep each module independent, but coordination between modules needs agreed variables."],
    p: ["An authorization check placed in a content stage runs after a rewrite sends the request to an unprotected handler.", "A handler returns the wrong code and skips later stages that were supposed to always run, such as logging."],
    v: "Enable the debug log and send one request, then confirm the sequence of stages and the handlers that ran in each, and that an access denial stops the request before the content stage.",
    dep: ["module-api", "location-matching", "filter-chain"]
  },
  "concurrency-model": {
    s: "The decision about how many requests run at once and on what: processes, threads, event loops or a mix, and which state is shared between them.",
    d: "It sets how connections map to execution contexts, whether blocking calls are allowed on the request path, how caches and counters are shared, and what a crash takes down. Event loops give high connection counts at low cost, but one blocking call stalls every connection on that loop; processes isolate faults but make shared state costly; threads share state cheaply but spread faults. Every layer inherits the choice: modules must not block, shared zones need locks or atomics, and logging and file access need offload.",
    k: ["Few event loops with non-blocking code versus many threads or processes with blocking code: loops scale to huge idle connection counts, but every module must be written not to block.", "Shared-nothing workers versus shared structures: shared-nothing avoids locking and limits fault spread, but caches, limits and health state are duplicated or need explicit shared memory."],
    p: ["A module makes one blocking call on a loop thread and latency rises for every connection on that worker.", "State assumed to be global is per worker, so a rate limit allows as many requests as there are workers."],
    v: "Inject a one-second blocking call in one handler under load and confirm what the other connections on the same worker experience, then confirm that the configured model matches that result.",
    dep: ["event-loop-workers", "shared-memory-zones", "thread-pool-offload"]
  },
  "untrusted-input": {
    s: "The stance that every byte from the network is hostile: sizes, encodings, names, headers and timing are all validated and limited before use.",
    d: "Input arrives from clients, and also from upstreams, DNS and configuration includes. Every parser has limits on length, count and depth; every decoder rejects ambiguous encodings; every value placed into a path, header, log or command is sanitized for that context. Ambiguity between two parsers, such as the server and an application behind it, is treated as a vulnerability. Rejecting early is cheaper than recovering later, and rejections are logged but rate limited so the log itself is not a target.",
    k: ["Reject ambiguous requests versus normalize and forward: rejecting is safe against parser disagreement, but breaks some old clients and sloppy applications.", "Strict defaults with explicit opt-outs versus permissive defaults: strict defaults protect by default, but every legacy integration needs a documented exception."],
    p: ["A header accepted by the server but interpreted differently by the application lets a client bypass a check performed at the proxy.", "A value from a request is written to a log or response header without filtering newlines."],
    v: "Run a corpus of malformed and ambiguous requests, such as duplicate lengths, bare line feeds and oversized headers, and confirm each is rejected with a client error and a log line, and none reaches an upstream.",
    dep: ["http1-parser", "smuggling-defenses", "header-limits", "path-resolution"]
  },
  "zero-downtime-change": {
    s: "The requirement that configuration changes, certificate renewals, backend changes and binary upgrades happen while traffic continues, shaping how state and sockets are owned.",
    d: "Listening sockets must outlive any one process generation, workers must be replaceable one generation at a time, and shared state must be compatible across two versions. Certificates are reloaded without restarts, upstream changes are applied by marking servers down and draining them, and long-lived connections are given a time limit and a notice. The design cost is that two generations briefly coexist, so memory, shared zone layouts and file locks all have to tolerate it.",
    k: ["Overlapping generations versus brief stop and start: overlap hides the change from clients, but needs double capacity during the change and compatible shared state.", "Drain with a deadline versus wait for all connections: a deadline bounds deployment time, but cuts some long transfers."],
    p: ["Two generations both write to the same cache directory or state file and corrupt it.", "A change is tested only on idle servers, and the first load-bearing reload drops connections."],
    v: "Under constant load, perform a reload, a certificate swap and a binary upgrade in turn, and confirm the load generator records no failed requests and no connection resets.",
    dep: ["hot-reload", "binary-upgrade", "graceful-drain", "listen-sockets"]
  },
  "buffering-policy": {
    s: "The decision, per direction and per route, whether bodies are held in memory or disk before forwarding or relayed as they arrive.",
    d: "Buffering the request protects slow-upload clients from tying up an application, and lets the proxy retry. Buffering the response frees the application quickly from slow readers. Streaming gives low latency for large transfers, events and long polling, and avoids memory use. Each choice changes memory per connection, retry ability, latency to first byte and how a slow client affects the backend, and it must be consistent with the protocol: upgraded and streaming responses must not be held back.",
    k: ["Buffer both directions versus stream: buffering shields applications from slow peers and enables retries, but adds latency and uses memory or disk per connection.", "Per-route settings versus one global setting: per-route fits mixed workloads, but needs care so streaming endpoints are not accidentally buffered."],
    p: ["Server-sent events are buffered by default and arrive in a burst when the buffer fills.", "A large upload is buffered to disk on every request and exhausts the temporary file space."],
    v: "Upload a large body slowly and confirm the upstream receives it only after full receipt when buffered, or progressively when streaming; stream an event feed and confirm each event arrives within a fraction of a second.",
    dep: ["body-buffering", "streaming-relay", "write-backpressure"]
  },
  "timeout-budgets": {
    s: "The set of deadlines on every wait, such as header read, body read, idle, upstream connect, upstream read and handshake, chosen so that no peer can hold resources forever.",
    d: "Every phase of a connection has a timeout, and they are layered: client-side timeouts bound slow readers and writers, upstream timeouts bound slow applications, and a total request deadline may bound everything. Timeouts must nest correctly across hops: a proxy's upstream timeout should be shorter than the client's, and the sum of retries should fit inside the caller's deadline. Too long ties up memory and connections; too short breaks slow but legitimate transfers.",
    k: ["Per-phase timeouts versus one overall deadline: per-phase timeouts permit long transfers that keep making progress, but a trickle of bytes can hold a connection indefinitely.", "Short defaults with route overrides versus long defaults: short defaults resist slow attacks, but upload and report routes need explicit exceptions."],
    p: ["A read timeout resets on every byte, so a client sending one byte a second holds a connection forever.", "Retries each get the full upstream timeout, so the total latency exceeds the caller's limit and the work is wasted."],
    v: "Open a connection and send nothing, send headers one byte at a time, and stall a body, and confirm each is closed at its configured limit with the expected status and a log line naming the phase.",
    dep: ["timeouts", "upstream-timeouts", "retries-failover", "keep-alive"]
  },
  "resource-limits": {
    s: "The caps on what a client, a connection or the whole server may consume: connections, rates, body sizes, header sizes, memory and open descriptors.",
    d: "Limits exist at several scopes: per connection, per client address, per site and per server. They cover counts, bytes and time, and they must be set below what the operating system provides so the server rejects work before the kernel does. Limits give predictable behavior under load and abuse, but they need to be chosen against real traffic, and addresses behind shared networks or proxies make per-client limits unfair unless the real client is identified.",
    k: ["Reject at the limit versus queue: rejecting keeps latency bounded and protects the server, but clients see errors during bursts that queueing would have absorbed.", "Per-client address limits versus per-credential limits: addresses work before authentication, but punish many users behind one gateway."],
    p: ["Limits are keyed on the connecting address behind a load balancer, so all users share one bucket and are throttled together.", "The descriptor limit is lower than connection limit times upstream connections, so accepts fail with errors at peak."],
    v: "Drive a client above each configured limit in turn and confirm the server returns the specified status, other clients are unaffected, and descriptors and memory stay below the configured ceilings.",
    dep: ["rate-limiter", "connection-limiter", "body-size-limits", "fd-limits"]
  }
});
