// Web browser plate, details part 4: networking, storage, foundation, cross-cutting concerns.
(function () {
  var D = {};
  function E(id, s, d, k, p, v, dep) { D[id] = { s: s, d: d, k: k, p: p, v: v, dep: dep }; }

  // ---- Networking ----
  E("resource-loader",
    "Turns a request from any component into a prioritized network transaction, applying policy, cache lookup and redirects.",
    "Every fetch, navigation and subresource load passes through the loader in the network service. It attaches cookies and headers, consults the cache and service workers, sniffs content types, follows redirects with policy checks, and assigns a priority from the resource type and position: blocking styles and scripts outrank images. Priority maps to the transport's scheduling. Responses stream to the requester through data pipes with backpressure. Consistent policy here means no load path can skip a check.",
    ["Assign priorities from resource type and page position: critical content arrives first, but wrong heuristics delay what matters and need constant tuning.",
     "Stream bodies through bounded pipes: memory stays flat for large responses, but a slow consumer holds a connection open."],
    ["Sniffing content type from bytes when a server says otherwise lets uploaded text run as script unless nosniff is respected.",
     "Giving all requests equal priority makes a hero image compete with render-blocking styles."],
    "Load a page with blocking CSS, scripts and many images. The network trace shows styles and scripts requested first with higher priority, images later, and a nosniff response with wrong type is blocked.",
    ["connection-pool", "http-cache", "service-workers", "cookie-jar", "cors", "dns-resolver"]);

  E("dns-resolver",
    "Resolves hostnames to addresses, with its own cache, parallel lookups, encrypted transports and fallback between address families.",
    "The resolver queries the system or a configured server, caching answers by time to live, and races IPv4 and IPv6 results to pick a working path. It can speak encrypted DNS and discover service parameters such as supported protocols and alternate endpoints through service binding records. Prefetching names for links hides latency. Failures, captive portals and split-horizon corporate networks all complicate it, and a single slow lookup delays the first byte of a page.",
    ["Use an in-process resolver with its own cache: control over retries, concurrency and encryption, but behavior can diverge from the system and break local network names.",
     "Race address families with a small head start: users on broken IPv6 do not wait for timeouts, but extra connections are opened."],
    ["Caching failures or ignoring TTLs makes a recovered site look down, or a moved one unreachable.",
     "Leaking lookups for private names to a public resolver exposes internal hostnames."],
    "Resolve a name with both address families where IPv6 black-holes. The connection uses IPv4 within a fraction of a second, a cached answer is not re-queried until TTL, and an internal name stays on the system path.",
    ["connection-pool", "tls-stack", "platform-abstraction", "http3-quic"]);

  E("connection-pool",
    "Reuses and limits connections per origin and proxy, choosing between new sockets and multiplexing over existing ones.",
    "The pool tracks idle and active connections keyed by origin, proxy and privacy partition. It limits per-host and total sockets, starts connections speculatively, retries on stale reused sockets and groups requests onto multiplexed sessions where the protocol allows it. It decides which protocol to race, using alternate service information. Partition keys stop connection reuse from linking identities across sites. Correct handling of server-side closes and half-open connections matters more than raw speed.",
    ["Limit sockets per host and reuse idle ones: fewer handshakes and kinder to servers, but queued requests wait when all sockets are busy.",
     "Key pools by network partition: cross-site connection reuse cannot link users, but fewer connections are shared."],
    ["Reusing a socket that the server already closed fails the request unless the pool retries safe requests.",
     "Sharing connections across privacy partitions lets sites infer cross-site activity from timing."],
    "Load a page twice from the same origin. The second visit reuses the open connection with no new handshake, per-host limits are respected, and the same origin embedded in another site gets a separate connection.",
    ["http1-codec", "http2-multiplexing", "http3-quic", "tls-stack", "storage-partitioning"]);

  E("http1-codec",
    "Frames text requests and responses: headers, chunked bodies, keep-alive, pipelining restrictions and robust parsing.",
    "The HTTP/1.1 codec serializes requests and parses responses: status lines, header folding rules, content length and chunked transfer, upgrade, and connection persistence. One request is in flight per connection, so concurrency comes from parallel sockets. Strict, consistent parsing is crucial: disagreements with proxies on message boundaries enable request smuggling. Compatibility with decades of server quirks forces tolerance, which pulls against strictness.",
    ["Parse strictly with a few compatibility exceptions: smuggling attacks fail, but broken legacy servers may be unreachable.",
     "Open parallel connections rather than pipeline requests: head-of-line blocking is avoided, but more handshakes and sockets are needed."],
    ["Accepting both content length and chunked encoding, or duplicate lengths, lets attackers desync a proxy and the browser.",
     "Reusing a connection after a response whose end is ambiguous corrupts the next response."],
    "Send responses with conflicting length headers and malformed chunk sizes. The codec rejects them, the connection is closed, and a valid chunked response streams progressively to the page.",
    ["connection-pool", "tls-stack", "resource-loader", "proxy-and-pac"]);

  E("http2-multiplexing",
    "Carries many concurrent requests over one connection with binary frames, header compression and stream priorities.",
    "HTTP/2 sends requests as streams of frames on a single connection with flow control per stream and per connection, and compresses headers with a shared dynamic table. Priorities guide the server's scheduling, and servers can push resources, a feature largely abandoned. A single TCP connection means packet loss blocks all streams. Resource-exhaustion attacks use rapid stream resets and large control floods, so limits and accounting matter on both sides.",
    ["Multiplex everything on one connection: one handshake and better congestion control, but one lost packet stalls every stream beneath TCP.",
     "Compress headers with a stateful table: bandwidth shrinks, but a shared table creates memory and attack surface that must be bounded."],
    ["Missing limits on concurrent streams or reset rates enables denial of service.",
     "Setting priorities that conflict with the page's real needs makes the server send images before critical scripts."],
    "Load a page with a hundred resources over one connection. The trace shows one socket, interleaved streams with priorities honored, and a stream reset flood is rejected by limits.",
    ["connection-pool", "tls-stack", "resource-loader", "http3-quic"]);

  E("http3-quic",
    "HTTP over a user-space, encrypted, UDP-based transport with independent streams, fast handshakes and connection migration.",
    "QUIC runs over UDP with TLS 1.3 integrated, giving one round trip (or zero on resumption) to start, independent streams so loss affects only one, and connection identifiers that survive network changes. Congestion control is implemented in user space, so it can evolve with the browser. Browsers learn of HTTP/3 support through an advertised alternative service, race it against TCP and fall back when UDP is blocked. Middleboxes, amplification limits and CPU cost are the practical problems.",
    ["Race QUIC against TCP and cache failures: users never wait on blocked UDP, but extra connection attempts and fallback logic are needed.",
     "Implement transport in user space: rapid evolution and per-stream loss recovery, but higher CPU use than a kernel TCP stack."],
    ["Corporate networks that drop UDP silently cause slow fallback unless failure is remembered.",
     "Zero-round-trip data can be replayed, so only idempotent requests should use it."],
    "Visit a server advertising HTTP/3 and another with UDP blocked. The first uses QUIC from the second visit, the second falls back to TCP quickly, and moving the client to another network keeps the connection alive.",
    ["tls-stack", "connection-pool", "dns-resolver", "resource-loader"]);

  E("tls-stack",
    "Establishes encrypted, authenticated connections, resumes sessions and enforces HTTPS-only policies such as HSTS and upgrades.",
    "The TLS stack negotiates versions and cipher suites, performs the key exchange, verifies certificates and encrypts records. Session tickets let repeat visits skip full handshakes. HSTS and preload lists tell the browser to use HTTPS only for a host, and automatic upgrades rewrite insecure links. Encrypted client hello hides the server name. Legacy servers push for downgrades, so supporting old protocols conflicts with security, and a library vulnerability here affects every connection.",
    ["Drop old protocol versions and weak ciphers on a schedule: security rises, but old devices and servers become unreachable.",
     "Remember HSTS and preload hosts: downgrade attacks fail, but a misconfigured or expired certificate on those sites cannot be bypassed."],
    ["Falling back to older versions on handshake failure lets an attacker force a weaker protocol.",
     "Resuming sessions across privacy partitions lets a tracker link visits by ticket."],
    "Connect to a host with HSTS set, then try the http URL. The browser rewrites to https internally, a server offering only an old protocol version fails, and session resumption shortens a repeat handshake.",
    ["certificate-validation", "connection-pool", "platform-abstraction", "storage-partitioning"]);

  E("http-cache",
    "Stores responses on disk and memory and serves, revalidates or bypasses them according to HTTP caching rules.",
    "The cache keys entries by URL and a partition key such as the top-level site, stores headers and bodies, and decides freshness from max-age, validators and heuristics. Stale entries are revalidated with conditional requests, and stale-while-revalidate allows instant use with a background refresh. Back and forward navigations prefer cached content. The disk index must survive crashes and bounded size forces eviction. Partitioning by site limits timing leaks but lowers hit rates for shared libraries.",
    ["Partition the cache by top-level site: cached-resource timing cannot reveal browsing across sites, but common libraries are downloaded once per site.",
     "Allow stale content while revalidating: pages feel instant, but users may see out-of-date data briefly."],
    ["Caching responses with credentials or private data without checking directives serves one user's content to another via a shared proxy.",
     "A corrupted index after a crash serves wrong bodies unless entries are verified."],
    "Load a cached asset with and without a validator. The first loads from cache without a request, the second sends a conditional request and gets 304, and the same asset embedded under another site is fetched again.",
    ["resource-loader", "storage-partitioning", "profile-data-store", "quota-and-eviction", "service-workers"]);

  E("proxy-and-pac",
    "Selects and tunnels through proxies by system settings, auto-detection or scripts, and authenticates to them.",
    "Proxy configuration comes from the system, policy or the user, optionally via an auto-config script evaluated per URL in a sandboxed utility process. Connections go through HTTP or tunnel proxies, with authentication challenges handled in the UI. Fallback lists try alternatives when one fails. The resolver and TLS stack must know whether names are resolved by the proxy. Proxies also let enterprise networks inspect traffic through their own root certificates.",
    ["Evaluate proxy scripts in a sandboxed process: untrusted scripts cannot touch the system, but each lookup crosses a boundary and can be slow.",
     "Resolve names at the proxy when tunneled: client lookups do not leak, but local name resolution rules no longer apply."],
    ["A slow or hanging auto-config script delays every request until a timeout.",
     "Leaking DNS lookups outside a proxy exposes browsing even when traffic itself is tunneled."],
    "Configure a script that routes by host and fails over between two proxies. Matching hosts go through the first proxy, a dead proxy falls back to the second, and the script runs in a separate sandboxed process.",
    ["connection-pool", "dns-resolver", "utility-processes", "tls-stack"]);

  E("service-workers",
    "Event-driven scripts that sit between a page and the network, enabling offline use, caching strategies and push.",
    "A service worker is registered for a scope, installed and activated through a lifecycle, and then receives fetch events for pages in scope. It can answer from cache storage, rewrite or forward requests, and run in the background for sync and push. It is started on demand and killed when idle, so it cannot keep in-memory state. Updates are checked by byte comparison and apply after old clients close. Because it intercepts all traffic of a site, it needs HTTPS and strict scope rules.",
    ["Intercept fetches in a worker that can be killed: offline apps and custom caching, but every request may pay worker startup latency.",
     "Activate updated workers only after old clients close: no page sees mixed versions, but users on long-lived tabs stay on old code."],
    ["A buggy worker that serves a broken response from cache can leave a site permanently broken until the worker updates.",
     "Keeping state in globals loses it whenever the worker is stopped."],
    "Register a worker, go offline and reload. The page loads from cache storage, a new worker version waits until tabs close, and a worker idle for a minute is stopped and restarts on the next fetch.",
    ["fetch-api", "cache-storage", "event-loop", "web-workers", "resource-loader"]);

  // ---- Storage ----
  E("cookie-jar",
    "Stores cookies by site, applies attribute rules such as Secure, HttpOnly and SameSite, and attaches them to requests.",
    "The cookie store lives in the network service, indexed by domain and path. It parses Set-Cookie headers, enforces attributes, expiry, size limits and prefixes, and selects cookies per request under SameSite and partitioning rules. Script access through document.cookie and the async store API is mediated by the browser. Third-party cookies are restricted or partitioned for privacy. Cookies are the main session credential, so theft, fixation and cross-site request forgery all revolve around this one component.",
    ["Default to SameSite restrictions: most cross-site request forgery is blocked automatically, but legitimate cross-site flows must opt in.",
     "Partition third-party cookies by top-level site: embedded widgets cannot track across sites, but cross-site login and embeds need new mechanisms."],
    ["Missing HttpOnly or Secure on session cookies exposes them to script or plaintext networks.",
     "Domain-wide cookies from a sibling subdomain can override or fix a session identifier."],
    "Set cookies with Secure, HttpOnly and SameSite attributes. Script cannot read the HttpOnly one, the Secure one is not sent over http, and a cross-site POST omits the SameSite cookie.",
    ["network-process", "storage-partitioning", "profile-data-store", "same-origin-policy"]);

  E("web-storage",
    "Simple synchronous key-value stores per origin: persistent local storage and per-tab session storage.",
    "Local storage persists strings under an origin partition, and session storage is scoped to a browsing context group. The API is synchronous, so the renderer keeps a cached copy and syncs with the browser process, which writes to disk. Quotas are small, and storage events inform other same-origin tabs. Synchronous access on the main thread is its major downside, which is why larger or concurrent needs go to IndexedDB.",
    ["Keep a synchronous API with a renderer cache: simple for developers, but large values block the main thread and need loading before first access.",
     "Notify other same-origin tabs through events: shared state across tabs, but writes race without coordination."],
    ["Storing large or frequently written data stalls the main thread on every access.",
     "Storing session tokens in script-readable storage exposes them to any injected script."],
    "Write a key in one tab and read it in another same-origin tab. The storage event fires, the value persists after restart, and session storage in a new tab starts empty.",
    ["profile-data-store", "quota-and-eviction", "storage-partitioning", "browser-process"]);

  E("indexed-database",
    "A transactional, indexed object store for large structured data, with asynchronous access and versioned schemas.",
    "IndexedDB stores structured-cloneable values in object stores with key paths and secondary indexes, accessed through transactions with isolation guarantees. The API is asynchronous and event-based, so the main thread stays free while the browser process handles reads and writes against an on-disk database. Schema upgrades run in version-change transactions that block other connections. Transaction lifetime rules, auto-commit when no requests are pending, and quota-triggered failures are frequent sources of bugs.",
    ["Use auto-committing transactions: simple to use correctly for short work, but awaiting unrelated async calls mid-transaction commits early.",
     "Run schema upgrades as exclusive version changes: consistent schemas, but old tabs holding connections block upgrades until they close."],
    ["Storing very large values or many tiny records without batching makes the database slow and inflates the profile.",
     "A blocked upgrade caused by an old tab connection hangs the page's startup without an explicit handler."],
    "Write many records in one transaction, kill the browser mid-way and reopen. Either all or none are present, an index query returns sorted results, and an upgrade with an open old connection fires a blocked event.",
    ["profile-data-store", "quota-and-eviction", "storage-partitioning", "web-workers", "browser-process"]);

  E("cache-storage",
    "A named store of request and response pairs that service workers and pages control explicitly.",
    "Cache storage holds full responses keyed by request, under named caches within an origin. Unlike the HTTP cache, nothing is evicted or revalidated automatically: scripts add, replace and remove entries. Bodies are stored on disk and streamed back. Opaque cross-origin responses count against quota at padded sizes so their real size is not revealed. It is the backing store for offline applications and precache strategies.",
    ["Give scripts full control of caching: precise offline behavior, but nothing expires without explicit code and stale data can persist forever.",
     "Count opaque responses at padded sizes: cross-origin sizes stay hidden, but quota is consumed faster than the data size suggests."],
    ["Never deleting old caches after deployments fills quota with obsolete assets until evictions begin.",
     "Caching an error response because of missing status checks serves the error offline indefinitely."],
    "Add responses to a cache, go offline and read them back. Deleting the cache frees the space reported by the quota API, and a cross-origin opaque response counts as a padded size.",
    ["service-workers", "quota-and-eviction", "profile-data-store", "storage-partitioning"]);

  E("quota-and-eviction",
    "Tracks per-origin storage use across all APIs, enforces limits and evicts whole origins when disk is short.",
    "The quota manager aggregates usage reported by every storage API for each origin and decides allowed size from available disk. Storage is best-effort by default: when pressure rises, whole origins are evicted least recently used first, and sites can request persistence to be exempt. Eviction deletes all of an origin's data together to keep it consistent. Usage estimates are deliberately imprecise to avoid revealing information. Writes fail with quota errors that code must handle.",
    ["Evict whole origins rather than single records: data stays consistent, but one eviction can lose a user's entire offline state.",
     "Offer opt-in persistence with a permission-like gate: important apps keep data, but users decide and must be told."],
    ["Applications that ignore quota errors lose writes silently or end in a half-saved state.",
     "Exact usage numbers exposed to script become a fingerprinting or history-sniffing signal."],
    "Fill a test origin's storage past its limit with disk nearly full. Writes fail with quota errors, the least recently used non-persistent origin is evicted whole, and a persistent origin is kept.",
    ["indexed-database", "cache-storage", "web-storage", "profile-data-store", "memory-pressure"]);

  E("storage-partitioning",
    "Keys storage, caches and connections by top-level site as well as origin, so embedded content cannot track users across sites.",
    "A third-party frame traditionally shared cookies, storage and cache entries with the same origin embedded on every site, making it a cross-site tracker. Partitioning adds the top-level site to the key for cookies, local storage, IndexedDB, cache storage, the HTTP cache, connection pools and more. Embedded content sees a separate empty store per embedding site. Legitimate cross-site uses such as single sign-on need explicit grant APIs, and every storage component must adopt the key consistently.",
    ["Key all state by top-level site: third parties lose cross-site identity, but embedded widgets lose sharing and first-party flows need new APIs.",
     "Provide explicit access grants for legitimate cases: login and payment embeds keep working, but each grant is a user-facing decision."],
    ["Missing the partition key in one cache or pool reintroduces a cross-site side channel.",
     "Embeds that relied on shared third-party state, such as login, silently break."],
    "Embed the same third-party frame on two sites and set a cookie, a local storage value and cache an image. Each site sees a separate empty state, with no cache hit across sites.",
    ["cookie-jar", "http-cache", "web-storage", "indexed-database", "connection-pool"]);

  E("profile-data-store",
    "The on-disk profile directory and databases holding history, preferences, credentials and site data, with crash-safe writes.",
    "A profile is a directory of preferences, databases, caches and keys that belong to a user. Components own their own files: history, favicons, logins, bookmarks, site storage. Writes go through background sequences with transactional or atomic-replace semantics. Profiles must survive crashes, version upgrades and downgrades, include migration, and support multiple profiles and a guest or private mode that leaves nothing on disk. Sensitive entries are encrypted with an operating-system-backed key.",
    ["Give each component its own transactional file: failures stay isolated and migrations are local, but there is no single consistent snapshot to back up.",
     "Keep private sessions in memory only: nothing persists to disk, but memory is used until the window closes and extensions need explicit opt-in."],
    ["Writing files in place without atomic replace corrupts the profile when the browser is killed during a write.",
     "Opening a profile written by a newer version without checking the schema version loses or damages data."],
    "Kill the browser repeatedly during heavy writes and reopen. All databases load and pass integrity checks. A private window leaves no new files, and an older build refuses to open a newer-schema profile.",
    ["task-scheduler", "platform-abstraction", "quota-and-eviction"]);

  // ---- Platform & foundation ----
  E("task-scheduler",
    "Thread pools, sequences and priority queues that every component posts work to, instead of creating and locking threads directly.",
    "Components post tasks to sequences (ordered, one at a time, not tied to a thread) or to named threads such as UI and IO. A scheduler maps tasks to a pool of workers by priority, with traits that say whether work may block or must finish before shutdown. This replaces locks with ordering and makes it possible to prioritize user-visible work over background tasks. The main threads must never block, which the scheduler's tooling helps to enforce.",
    ["Use sequences instead of locks: data races disappear by construction, but code must be structured around asynchronous hand-offs.",
     "Declare blocking and priority traits on every task: the scheduler can protect responsiveness, but misdeclared work still stalls users."],
    ["Posting blocking file or network calls to the UI or IO thread freezes the whole process.",
     "Tasks that capture raw pointers outlive their owners and run after destruction."],
    "Run a stress test posting thousands of mixed-priority tasks. User-visible tasks complete first, no task runs on a sequence concurrently with another from the same sequence, and shutdown waits only for tasks marked to block it.",
    ["platform-abstraction"]);

  E("platform-abstraction",
    "A thin layer over files, threads, processes, synchronization, time and system services that hides operating system differences.",
    "Portable code never calls the operating system directly. The abstraction exposes file and path operations, shared memory, process launch with sandbox hooks, synchronization, clocks, power and thermal state, and system services such as secure storage and notifications. Per-platform implementations hide differences like path syntax or permission models. It must stay thin and predictable, because every leak of platform behavior upward turns into conditional code across the whole browser.",
    ["Keep the abstraction small and explicit: portable code stays clean, but features unique to a platform need a way to be exposed without leaking.",
     "Implement per-platform behind one interface and test all of them: consistent semantics, but each fix must be verified on every target."],
    ["Platform quirks such as path length limits or case sensitivity leak into feature code when the abstraction is too thin.",
     "A convenience API that hides blocking behavior hides stalls on the UI thread."],
    "Run the abstraction's test suite on every supported platform. File, time, process and synchronization semantics match, and a path with unusual characters round-trips through each.",
    []);

  E("native-windowing",
    "Creates native windows and translates operating system input, drawing and focus events into the browser's own event types.",
    "Each platform provides windows, menus, drag and drop, clipboard, input methods, touch, pen and gamepad events. This layer wraps them behind one interface, handling high-density displays, multiple monitors, fullscreen, text input composition for non-Latin languages and native dialogs. Events are normalized and handed to input routing and the UI toolkit. Getting input method and accessibility integration right is more work than the window itself.",
    ["Normalize native events into one model: upper layers are portable, but platform-specific gestures and conventions can be lost.",
     "Embed native text input through the platform's input method API: users of every language can type, but composition and selection state is intricate."],
    ["Mishandling composition events makes typing Chinese, Japanese or Korean produce wrong or duplicated text.",
     "Assuming a single display or scale factor breaks windows moved between monitors."],
    "Type composed text in a non-Latin input method, drag a window between monitors of different scale, and use fullscreen and drag-and-drop. Text is correct, rendering stays sharp and events arrive once.",
    ["platform-abstraction", "task-scheduler"]);

  E("graphics-backend",
    "An abstraction over the platform's graphics APIs, providing the textures, surfaces and command submission that raster and compositing use.",
    "The backend wraps the platform's native graphics API behind one interface: contexts, textures, buffers, shaders, fences and presentation. It handles driver bugs through workarounds and blocklists, falls back to software rendering when drivers are absent or untrusted, and shares memory between processes through handles. Present timing feeds the frame scheduler. This layer decides which hardware features the rest can rely on and how failures degrade.",
    ["Support multiple native APIs behind one interface: wide hardware coverage, but behavior and bugs differ per driver and need workarounds.",
     "Keep a software rendering fallback: pages still draw with bad drivers, but slowly and with higher CPU use."],
    ["Trusting a driver with known bugs causes crashes or corrupt rendering unless blocklisted.",
     "Missing explicit synchronization between processes sharing a texture gives tearing or stale frames."],
    "Force software rendering and run the same page. Output matches within tolerance, the blocklist disables a known-bad driver feature, and a shared texture is not read before the producer finishes.",
    ["platform-abstraction", "task-scheduler"]);

  E("text-and-intl-libs",
    "Unicode, collation, locale, bidirectional text, segmentation, font and image-decoding libraries shared by layout, script and the UI.",
    "Libraries provide Unicode properties, normalization, case mapping, bidirectional algorithms, line and grapheme breaking, locale data, date and number formatting for script's internationalization API, and font parsing and shaping. Data tables are large and are shared across processes or compressed to save memory. Correctness is defined by standards that evolve each year, so updates must be routine. Behavior must be identical across processes and platforms to avoid layout or sorting differences.",
    ["Bundle one set of locale and Unicode data in the browser: results are identical on every platform, but binary size grows and updates ship with the browser.",
     "Load rarely used data lazily and share it between processes: memory stays low, but first use can stall."],
    ["Using the operating system's text or locale libraries makes line breaks and sorting differ between platforms.",
     "Out-of-date Unicode data misrenders new emoji or scripts."],
    "Run text segmentation, normalization and locale-formatting tests against the standard's data on all platforms. Results are identical, and a mixed-script paragraph breaks lines at the specified places.",
    ["platform-abstraction"]);

  E("tracing-and-metrics",
    "Low-overhead instrumentation across threads and processes that feeds profiling tools, performance regressions tests and field metrics.",
    "Trace events are written to per-thread buffers with cheap timestamps and category filters, then merged across processes by a tracing service for tools and tests. Histograms and counters record field metrics in aggregate. The same instrumentation feeds benchmarks in CI, so performance regressions fail builds. It must cost close to nothing when disabled and not distort timing when enabled. Clock alignment between processes and consistent naming make traces readable.",
    ["Use per-thread lock-free buffers: tracing barely perturbs timing, but buffers have fixed size and can overwrite old events.",
     "Share instrumentation between local tools, CI and field metrics: one vocabulary of events, but permanent instrumentation points must be kept cheap and stable."],
    ["Instrumentation with locks or allocation on hot paths changes the behavior it measures.",
     "Unaligned clocks across processes produce traces where cause appears after effect."],
    "Record a trace across browser, renderer and GPU processes with a known sequence of events. Events appear in the correct order on one timeline, and disabling tracing leaves overhead below measurement noise.",
    ["task-scheduler", "platform-abstraction"]);

  // ---- Cross-cutting concerns ----
  E("security-boundaries",
    "Where trust changes: between sites, between processes, between the page and the browser UI, and between the browser and the machine.",
    "Four boundaries hold the browser together. The origin boundary stops one site from reading another. The process boundary stops a compromised renderer from reaching the system. The chrome boundary keeps pages from imitating browser UI. The machine boundary is the OS sandbox. Each is defended in depth, so one bug does not break all of them. Every feature must state which boundary its data crosses, because most browser vulnerabilities are a feature that forgot one.",
    ["Treat every renderer message as hostile: the browser stays safe after a renderer compromise, but each interface must validate input and own its policy.",
     "Layer origin checks, process isolation and sandbox: any one failing is survivable, but defenses must be kept in step as features are added."],
    ["Adding a convenience capability to the renderer for speed, such as direct file access, silently removes a boundary.",
     "Checking policy only in the renderer rather than the browser makes the check optional for attackers."],
    "Review an API end to end: list where its data crosses origin, process and sandbox boundaries, then attack it from a test renderer. Each privileged step is validated in the browser process and denied when forged.",
    ["site-isolation", "os-sandbox", "ipc-channel", "same-origin-policy", "security-indicators"]);

  E("responsiveness",
    "The guarantee that input is handled and frames are produced within tight budgets, even when pages misbehave.",
    "Responsiveness is a budget: input should show an effect within roughly a hundred milliseconds and frames should arrive every sixteen on a sixty-hertz display. It is protected by structure: the browser UI never blocks on a page, the compositor scrolls without the main thread, long script is chunked into tasks, garbage collection and compilation run in the background, and input and rendering outrank other tasks. Hung pages are detected and the user keeps control of the rest.",
    ["Keep latency-critical paths off the main thread: scrolling and UI stay smooth, but stale data and two-thread synchronization become permanent complexity.",
     "Give input and rendering priority over other tasks: interactions stay fast, but background work can starve unless bounded."],
    ["A single synchronous cross-process call from the UI thread turns a hung page into a hung browser.",
     "Measuring only averages hides the long tail of frames that users actually notice as jank."],
    "Run a script that blocks the main thread for two seconds. The tab strip and other tabs respond, scrolling continues on the compositor, and the page shows a hang indicator after the timeout.",
    ["frame-scheduler", "task-scheduler", "scroll-and-animation", "browser-process", "input-routing"]);

  E("memory-pressure",
    "Keeping many tabs and processes within the machine's memory by sharing, discarding, throttling and releasing caches on demand.",
    "Memory is spent per process, per heap and in caches for tiles, decoded images, code and network data. The browser budgets it by limiting process counts, sharing read-only data, throttling background tabs and listening to operating system pressure signals. Under pressure it flushes caches, triggers garbage collection, freezes and discards tabs by value to the user, and lets the OS reclaim the rest. Doing this without data loss is the hard part.",
    ["Reclaim caches first and discard tabs last: users lose little work, but caches are repopulated and reloading costs CPU and network.",
     "Prefer fewer processes under pressure: memory falls, but isolation and crash containment weaken."],
    ["Discarding the wrong tab, such as one with unsaved work or playing audio, is worse than the slowdown it avoids.",
     "Leaks in long-running browser or GPU processes accumulate across days of uptime and are invisible in short tests."],
    "Raise memory pressure with many tabs open. Caches shrink first, hidden idle tabs are discarded by value, an audio tab is spared, and total memory settles under the limit without a crash.",
    ["page-lifecycle", "process-allocation", "garbage-collector", "quota-and-eviction", "rasterization"]);

  E("web-compatibility",
    "The constraint that existing pages must keep working: behavior is changed carefully, and quirks are preserved by specification.",
    "The web is a long-lived platform where old pages are never updated. Compatibility is maintained by standards that define even error handling, a large shared test suite, usage counters that show whether a feature can be removed, and staged rollouts that can be reverted. Quirks such as legacy parsing modes remain. New features are shipped behind flags and origin trials. Interoperability across engines is as important as within one, because sites test on whatever is popular.",
    ["Change behavior only when usage data shows it is safe: old pages keep working, but the legacy surface grows and constrains design.",
     "Ship new APIs behind experiments with a clear exit: feedback arrives before commitment, but half-adopted features can become permanent."],
    ["Removing a feature because it seems unused breaks a long tail of sites that never get fixed.",
     "Implementing a draft behavior differently from other engines makes sites that work in one break in another."],
    "Run the shared conformance suite and a corpus of archived pages before and after a change. Test results do not regress, a usage counter shows the affected feature's share, and a flag disables it remotely.",
    ["html-parser", "css-and-style", "event-loop", "field-trials-and-metrics", "web-idl-bindings"]);

  E("privacy",
    "Limiting what sites and the vendor can learn about a user, through partitioning, permission gates, fingerprint reduction and minimal telemetry.",
    "Tracking works through any shared state: cookies, storage, caches, connection reuse, device and font lists, timing and network addresses. The browser breaks these links by partitioning state per site, reducing high-entropy surface, gating sensors, cleaning referrers and keeping private modes ephemeral. The vendor's own services follow the same rule: aggregate metrics, hashed lookups and optional sync encryption. Every new API is reviewed for the information it adds about the user.",
    ["Close shared-state channels by default: users are protected without choices, but legitimate cross-site features such as login need explicit new mechanisms.",
     "Reduce fingerprinting surface across APIs: fewer unique signals, but cutting detail can break features that depend on precision."],
    ["A single missed shared cache or connection pool undermines partitioning everywhere else.",
     "Adding a new API that exposes hardware detail creates a new fingerprinting signal on every site."],
    "Visit two sites embedding the same tracker and compare what it can recover: cookies, storage, cache timing and connection reuse differ per site, and the exposed device details match a common baseline.",
    ["storage-partitioning", "cookie-jar", "permissions-model", "http-cache", "safe-browsing"]);

  E("power-efficiency",
    "Spending as little energy as possible per page: throttling hidden content, using hardware paths and avoiding wasted frames.",
    "Battery life is dominated by background pages, timers, animation and video decode. The browser throttles timers, rendering and network in hidden tabs, freezes idle pages, prefers hardware decoding and compositor-only animation, and skips frames when nothing changed. It aligns wakeups and uses energy-aware scheduling on mixed-speed cores. Pages can opt into lifecycle events to cooperate. The user sees it as battery life, but it is the sum of many small decisions made by every component.",
    ["Throttle hidden content aggressively: battery life improves, but background apps relying on timers need opt-outs such as audio or active connections.",
     "Prefer hardware decode and compositor animations: lower energy, but fallback paths and driver issues must be handled."],
    ["A page that runs animation frames or high-frequency timers while hidden keeps cores awake for no visible result.",
     "Coarse measurement hides energy regressions, since short CPU bursts add up across thousands of wakeups."],
    "Measure package power with a video tab visible, then hidden, then with a timer-heavy page in the background. Hidden tabs fall to near idle, hardware decode lowers power versus software, and timers coalesce.",
    ["page-lifecycle", "frame-scheduler", "media-decoders", "task-scheduler", "scroll-and-animation"]);

  ATLAS.details("web-browser", D);
})();
