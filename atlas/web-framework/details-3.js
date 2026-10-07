// Details for the web framework plate, part 3: sessions and identity, background work, realtime, caching/i18n/storage.
ATLAS.details("web-framework", {
  "session-store": {
    s: "Keeps per-user state across requests, identified by a cookie, in server-side storage or in a signed and encrypted cookie, with expiry and rotation rules.",
    d: "A session middleware reads the session identifier from a cookie, loads the data from a store such as a database or shared memory cache, exposes it on the request and saves changes after the response. Alternatively the whole session is encrypted into the cookie, needing no storage. Identifiers must be unpredictable, rotated at login to prevent fixation, expired after idle and absolute timeouts and deleted on logout. The difficulty is the trade between server load and revocation, and concurrent requests overwriting each other's changes.",
    k: ["Server-side session storage vs signed cookie sessions: server storage allows instant revocation and large data, while cookie sessions scale statelessly but cannot be revoked before expiry.", "Load and save every request vs lazy loading: eager is simple, while lazy avoids store round trips for routes that never touch the session."],
    p: ["Keeping the same identifier across login lets an attacker who planted it share the authenticated session.", "Two concurrent requests each load, modify and save the session, so one request's changes are lost."],
    v: "Log in and confirm the session identifier changes, log out and confirm the old identifier is rejected, and send two parallel requests that each set a different key, confirming both keys are present afterward.",
    dep: ["cookie-handling", "cache-store", "middleware-pipeline"]
  },
  "cookie-handling": {
    s: "Reads, writes and protects cookies, including signing, encryption, and the Secure, HttpOnly, SameSite, domain, path and lifetime attributes that control how browsers send them.",
    d: "The request object parses the Cookie header and the response collects Set-Cookie directives. Signed cookies add a message authentication code so tampering is detected; encrypted cookies also hide content. Keys can rotate with old keys still accepted for reading. Attributes restrict transport to HTTPS, hide cookies from scripts, limit cross-site sending and scope to a path or domain. The difficulty is browser behavior: size limits, per-domain counts, prefix rules and subdomain sharing all affect security and function.",
    k: ["Signed vs encrypted cookies: signing prevents tampering but shows content to the user, while encryption also hides it at slightly higher cost and complexity.", "Narrow host-only cookies vs shared parent-domain cookies: host-only limits exposure, while parent-domain sharing supports single sign-on but trusts every subdomain."],
    p: ["Authentication cookies without HttpOnly or Secure attributes are readable by injected script or sent over plain connections.", "Signing keys that never rotate stay valid forever after a leak."],
    v: "Inspect the Set-Cookie headers of login and confirm Secure, HttpOnly and SameSite are set with expected scope. Alter a signed cookie's value and confirm the server rejects it and treats the user as signed out.",
    dep: ["request-object", "response-object", "secrets-management"]
  },
  "authentication": {
    s: "Establishes who is making the request, by verifying credentials at login and then recognizing the user on later requests through a session or token.",
    d: "A login handler checks the submitted credentials against stored records, then starts a session or issues a token. A middleware or guard resolves the current user for each request and attaches it to the request, rejecting or redirecting unauthenticated callers. Multiple guards serve pages, APIs and administrators. Supporting flows include logout, remember-me, password reset and email confirmation. The difficulty is flows: every reset, change and confirmation path is an attack surface, and timing or message differences leak which accounts exist.",
    k: ["Session-based login for pages vs tokens for APIs: sessions are revocable and browser-friendly, while tokens suit non-browser clients but are harder to invalidate.", "Generic failure messages vs helpful ones: generic messages prevent account enumeration, but frustrate legitimate users."],
    p: ["Different error text or response time for unknown users and wrong passwords lets attackers list valid accounts.", "Password reset links that do not expire or can be reused remain usable by anyone who sees them later."],
    v: "Attempt login with a wrong password for a real and a nonexistent account and confirm identical responses and similar timing. Use a reset link twice and confirm the second use fails.",
    dep: ["session-store", "credential-storage", "rate-limiting", "middleware-pipeline"]
  },
  "credential-storage": {
    s: "Stores passwords as salted hashes from a deliberately slow algorithm, with work factors that can be raised and hashes upgraded transparently at next login.",
    d: "Passwords are never stored or logged in plain text. A password hashing function with a per-user salt and a tunable cost makes offline guessing expensive, and the stored string records its algorithm and parameters. At login the framework verifies in constant time and, if parameters are outdated, rehashes with current ones. It also handles breached-password checks, length rules and secure comparison of tokens. The difficulty is cost: hashing is intentionally expensive, so login becomes a CPU hot spot that attackers can exploit.",
    k: ["Higher work factor vs login latency and capacity: stronger hashes slow offline attacks, but consume CPU per attempt and ease denial of service on login.", "Framework-managed hashing with upgrade on login vs migrating hashes in bulk: on-login upgrade is gradual and needs no downtime, but dormant accounts keep old hashes."],
    p: ["Using a fast general-purpose hash for passwords allows billions of guesses per second after a database leak.", "Comparing tokens or hashes with ordinary equality leaks information through timing."],
    v: "Inspect a stored credential and confirm it holds an algorithm tag, salt and cost parameter with no recoverable password. Raise the cost, log in, and confirm the stored hash is rewritten with the new parameters.",
    dep: ["configuration", "model-layer"]
  },
  "token-authentication": {
    s: "Authenticates programs and scripts through bearer tokens or API keys in a request header, with scopes, expiry, rotation and revocation.",
    d: "A client presents a token on each request. The framework looks it up, if it is opaque, or verifies its signature and claims if it is self-contained, then resolves the principal and the scopes granted. Tokens are stored hashed, shown once at creation, and can expire, rotate and be revoked. Short-lived access tokens are paired with refresh tokens. The difficulty is revocation and leakage: self-contained tokens stay valid until they expire, and tokens in URLs, logs and client storage end up in places that attackers read.",
    k: ["Opaque tokens looked up server-side vs self-contained signed tokens: opaque tokens revoke instantly but need a lookup, while signed tokens verify without storage but live until expiry.", "Long-lived keys vs short-lived tokens with refresh: long-lived keys are simple for scripts, but a leak stays useful for a long time."],
    p: ["Tokens stored in plain text in the database give every attacker with read access a working credential.", "Accepting signed tokens without pinning the algorithm and audience allows forged or misused tokens."],
    v: "Create a token, use it, revoke it and confirm the next request fails. Present a tampered token, an expired token and one for a different audience, and confirm all are rejected with the proper status.",
    dep: ["authentication", "credential-storage", "authorization-policies"]
  },
  "authorization-policies": {
    s: "Decides what an authenticated user may do, through roles, permission checks or per-resource policies, enforced consistently in handlers, queries and views.",
    d: "Rules are written in one place as policies: can this user view, edit or delete this record. Handlers call a check before acting, queries are scoped so users only load what they may see, and views hide controls they cannot use. Models range from simple roles to attribute- and relationship-based rules. A default-deny posture requires an explicit grant. The difficulty is coverage: a single handler that forgets its check exposes data, and hiding a button is not enforcement.",
    k: ["Central policy objects vs checks inline in handlers: central policies are testable and uniform, but add indirection, while inline checks are easy to forget.", "Scoping queries by owner vs checking after loading: scoped queries never fetch forbidden records, while after-load checks are simpler but risk leaking via counts and errors."],
    p: ["A route added without an authorization check is open by default, and nothing flags it.", "Checking permission on the list but not on the nested or related resource lets users fetch records by guessing identifiers."],
    v: "For each route, request it as a user with no rights, a user with rights to a different record and a permitted user, and confirm forbidden, not found and success respectively. A test should fail for any route lacking a check.",
    dep: ["authentication", "model-layer", "handler-argument-binding"]
  },
  "federated-login": {
    s: "Delegates sign-in to an external identity provider through open protocols, accepting signed assertions or tokens and mapping them to local accounts.",
    d: "The application redirects the user to a provider, receives a code or assertion back, exchanges or verifies it, checks state, nonce, issuer, audience and signature, and then finds or creates a local account linked to the provider's stable identifier. Enterprise single sign-on uses a similar flow, with provisioning and group mapping. The difficulty is correctness of the protocol checks and account linking: linking by email address alone allows account takeover, and every skipped validation is an exploitable bypass.",
    k: ["Link accounts by provider identifier vs by email: identifiers are stable and safe, while email matching is convenient but unsafe unless verified by both sides.", "Build on a maintained protocol library vs hand-rolling: libraries cover edge cases and updates, but add dependencies and configuration surface."],
    p: ["Skipping the state or nonce check makes the login flow vulnerable to forged callbacks.", "Automatically linking a returning provider login to an existing local account by unverified email allows takeover."],
    v: "Complete a login against a test provider, then replay the callback, alter the state parameter and use a token for another audience. Only the first, valid attempt should succeed and create or match exactly one local account.",
    dep: ["authentication", "session-store", "model-layer"]
  },
  "multi-factor": {
    s: "Adds a second proof of identity, such as a one-time code or hardware key, and the recovery paths for when users lose it.",
    d: "After the password step, the login flow requires a second factor: a time-based code, a code sent through another channel, or a public-key credential held on a device. The framework stores enrollment secrets encrypted, tracks which sessions have passed the second step, throttles attempts and issues single-use recovery codes. Sensitive actions may demand fresh verification. The difficulty is recovery: it is the weakest path in the whole system, since an attacker who defeats it bypasses the factor.",
    k: ["Public-key hardware credentials vs one-time codes: hardware credentials resist phishing, while codes work on any phone but can be relayed by a fake site.", "Strong recovery vs convenient recovery: strict identity checks protect accounts, but locked-out users overload support and look for shortcuts."],
    p: ["Recovery by email alone lets an attacker who controls the mailbox skip the second factor.", "Code verification with no attempt limit lets a six-digit code be brute-forced."],
    v: "Enroll a factor, log in, and confirm access requires it. Enter wrong codes past the limit and confirm lockout, use a recovery code once and confirm it cannot be used again.",
    dep: ["authentication", "credential-storage", "rate-limiting"]
  },
  "job-queue": {
    s: "Accepts units of work from requests and stores them durably in a broker or database, with priority, delay and routing, for workers to run outside the request.",
    d: "Application code enqueues a job as a name plus serialized arguments, usually small identifiers rather than whole objects, and returns immediately. The queue backend holds it durably with options for delay, priority, unique keys and named queues. Enqueuing after a database commit avoids workers running before the data exists. Jobs are delivered at least once. The difficulty is that enqueuing and committing are two separate systems, and jobs must tolerate running twice or arriving late.",
    k: ["Queue in the application database vs a separate broker: database queues commit atomically with the data, while brokers handle higher throughput and isolate load.", "Pass identifiers vs full objects in arguments: identifiers stay small and fresh, but need a lookup and fail if the record was deleted."],
    p: ["A job enqueued inside a transaction runs before the transaction commits and cannot find its record.", "Large serialized objects in arguments go stale or fail to deserialize after a code change."],
    v: "Enqueue a job inside a transaction that rolls back and confirm no job runs, then commit one and confirm it runs once. Restart the broker with pending jobs and confirm they survive.",
    dep: ["job-workers", "transactions", "database-adapters"]
  },
  "job-workers": {
    s: "Long-running processes that pull jobs from queues and execute them with concurrency limits, timeouts, graceful shutdown and the same application code as the web process.",
    d: "A worker boots the application, polls or subscribes to named queues, deserializes each job and runs it inside its own context with request-like cleanup. Concurrency comes from threads, processes or an event loop, with limits per queue so slow jobs do not starve fast ones. Timeouts bound runaway jobs. On shutdown signal the worker stops fetching and finishes or returns running jobs. The difficulty is resources: workers share database pools, memory growth accumulates, and code deployed mid-run can differ from enqueue time.",
    k: ["Separate worker pools per queue vs one shared pool: separate pools isolate slow work, while a shared pool uses capacity efficiently but lets one workload block others.", "Run workers on the web deploy vs independently: shared deploys keep code consistent, while independent scaling allows tuning but needs compatibility between versions."],
    p: ["Workers use more database connections than the pool or database allows and starve the web processes.", "A shutdown kills a worker mid-job and the job is lost or duplicated because the visibility timeout was too short."],
    v: "Run a worker with a long job, send the termination signal and confirm the job completes or returns to the queue exactly once. Watch memory over ten thousand jobs and confirm it stays within a stable range.",
    dep: ["job-queue", "application-bootstrap", "connection-pooling"]
  },
  "retry-and-dead-letter": {
    s: "Policies for failed jobs: how many attempts, how long to wait between them, which errors are permanent, and where exhausted jobs go for inspection and replay.",
    d: "When a job raises an error, the framework records it and schedules another attempt with growing delay and jitter, up to a limit. Errors marked permanent skip retries. After the limit the job moves to a dead-letter store with its arguments and error, where operators can inspect, fix and replay it. Idempotency keys protect external side effects from running twice. The difficulty is that at-least-once delivery makes duplicates normal, so every job must be safe to repeat.",
    k: ["Exponential backoff with jitter vs fixed delay: backoff relieves struggling dependencies, while fixed delays recover faster but can pile on and synchronize.", "Retry everything vs classify errors: blanket retries need no thought, but waste capacity on errors that cannot succeed."],
    p: ["A non-idempotent job that charges or emails is retried after a partial success and does it twice.", "Failed jobs vanish after the retry limit with no record, so nobody learns the work never completed."],
    v: "Make a job fail twice and then succeed, and confirm three attempts with growing delays and one effect. Make another fail permanently and confirm it appears in the dead-letter store with its error and can be replayed.",
    dep: ["job-queue", "job-workers", "logging"]
  },
  "scheduled-tasks": {
    s: "Runs jobs or commands at defined times or intervals from a declared schedule, ensuring each run executes once across all servers.",
    d: "A schedule defines tasks with cron-like expressions or intervals. A single scheduler process, or a lock shared by all instances, decides which tasks are due and enqueues them or runs them. Features include overlap prevention, time zones, maintenance windows and run history. The difficulty is distributed correctness: multiple application servers each running a scheduler fire every task several times, a missed tick after downtime must be skipped or caught up deliberately, and daylight-saving changes shift or repeat local times.",
    k: ["Enqueue scheduled work to the queue vs run it in the scheduler process: enqueuing spreads load and gains retries, while running in place is simpler but blocks the scheduler.", "Catch up missed runs vs skip them: catching up preserves completeness, but a long outage floods the system on recovery."],
    p: ["Every application instance starts its own scheduler, and each task runs once per instance.", "A task scheduled in local time runs twice or not at all on daylight-saving change days."],
    v: "Run three application instances with a one-minute task for ten minutes and confirm exactly ten runs. Stop the scheduler for five minutes and confirm the documented catch-up or skip behavior.",
    dep: ["job-queue", "cli-and-console", "configuration"]
  },
  "mail-delivery": {
    s: "Builds email from templates and sends it through a pluggable transport, usually from a queue, with plain and HTML parts, attachments and delivery-failure handling.",
    d: "A mailer class prepares recipients, subject and bodies from templates, using the same view layer as pages, and hands the message to a transport such as a relay service. Sending is normally deferred to a job so requests do not wait on a remote server. The framework supplies previews, test capture and rate control. The difficulty is deliverability and correctness: sender authentication records, bounces, complaints and unsubscribe rules sit outside the framework, and links in emails need absolute URLs from configuration.",
    k: ["Send in the request vs queue the message: inline sending reports failure to the user immediately, but couples page speed to a remote service.", "Framework-templated mail vs an external template service: framework templates stay in code review, while external ones let non-developers edit but live outside deployment."],
    p: ["Messages are generated with request-derived hosts or localhost links, so recipients receive unusable or spoofed URLs.", "Bounce and complaint feedback is ignored, and the sender's reputation degrades until all mail is filtered."],
    v: "Trigger a real message to a test inbox and confirm delivery, both parts rendering, correct absolute links and passing sender authentication checks. Force a transport failure and confirm it is retried from the queue.",
    dep: ["template-engine", "job-queue", "reverse-routing", "configuration"]
  },
  "notifications": {
    s: "A single API for telling users about events across several channels, such as email, push, SMS and in-app, with per-user preferences and one definition per notification.",
    d: "A notification class names an event and declares which channels it uses and how it renders for each. The framework resolves the recipient's preferences and addresses, enqueues one delivery per channel and records in-app notifications in a table with read state. Digests and quiet hours batch or delay delivery. The difficulty is volume and consent: one event can fan out to many recipients and channels, and each channel has its own failure modes, limits and legal rules.",
    k: ["One notification definition across channels vs separate code per channel: one definition keeps content consistent, but channel-specific formatting needs escape hatches.", "Respect preferences at send time vs at enqueue time: send-time checks honor late changes, but need a lookup in the worker."],
    p: ["A bulk event fans out thousands of immediate deliveries and exceeds provider rate limits.", "Opt-outs are stored but not checked on one channel, so users keep receiving messages they declined."],
    v: "Send one notification to a user with email enabled and push disabled and confirm exactly one email, an in-app record and no push. Change the preference and confirm the next notification follows it.",
    dep: ["mail-delivery", "job-queue", "event-dispatcher"]
  },
  "event-dispatcher": {
    s: "An in-process publish and subscribe mechanism that lets application code announce that something happened and other code react without direct references.",
    d: "Code fires a named or typed event with a payload; registered listeners run in order, synchronously or by enqueuing a job for each. Model callbacks, authentication and framework lifecycle points use the same mechanism, so application code can hook in. Listeners may be discovered by convention. The difficulty is hidden coupling: behavior triggered by events cannot be found from the call site, ordering between listeners is implicit, and a listener failure may abort the original operation.",
    k: ["Synchronous listeners vs queued listeners: synchronous ones share the transaction and fail together, while queued ones isolate failures but run later and need to tolerate stale data.", "Typed events vs string names: types give tooling and checked payloads, but string names are easier to extend across packages."],
    p: ["A listener sends mail inside a transaction that later rolls back, so users get notices for events that never happened.", "Dozens of listeners on one event make the effect of a simple action impossible to predict."],
    v: "Fire an event with three listeners, one failing, and confirm order, that the failure behavior matches documentation and that queued listeners run only after the originating transaction commits.",
    dep: ["lifecycle-events", "job-queue"]
  },
  "websocket-handling": {
    s: "Upgrades an HTTP connection to a persistent, bidirectional message channel and manages its lifecycle, authentication, message framing, heartbeats and limits.",
    d: "A route performs the upgrade handshake, after which the connection is handled by an event-driven handler for open, message, close and error. The framework authenticates the connection from cookies or tokens at connect time, validates the origin, parses messages, applies size and rate limits and sends heartbeats to detect dead peers. Connections are long-lived, so memory per connection and total count matter. The difficulty is state and scale: connection state lives on one process, and clients disconnect abruptly or reconnect in storms.",
    k: ["Handle sockets in the web processes vs a dedicated realtime service: shared processes reuse code and sessions, while a dedicated service scales connection counts separately.", "Cookie authentication at connect vs token in the first message: cookies reuse sessions but are exposed to cross-site connection attempts, while tokens need explicit handling."],
    p: ["Skipping the origin check lets any website open an authenticated socket using the visitor's cookies.", "A server restart makes every client reconnect at once, overwhelming the replacement."],
    v: "Connect with a valid session, an invalid session and a disallowed origin, and confirm only the first succeeds. Kill the client network and confirm the server detects it and frees the connection within the heartbeat window.",
    dep: ["server-adapters", "authentication", "channels-and-pubsub", "request-object"]
  },
  "channels-and-pubsub": {
    s: "Named topics that connections subscribe to, and a broadcast mechanism, backed by a shared bus, that delivers a message to subscribers across all server processes.",
    d: "Clients subscribe to channels such as a room or a user's own stream, after authorization checks. Server code broadcasts to a channel and every subscribed connection receives the message. With several processes, a shared message bus relays broadcasts so connections on other processes also receive them. Delivery is usually at most once with no history. The difficulty is authorization at subscribe time, ordering and gaps: a client that reconnects may have missed messages and needs a way to catch up.",
    k: ["At-most-once broadcast vs durable streams with replay: broadcast is cheap and simple, while replay supports reliable catch-up but needs storage and offsets.", "Per-user channels vs shared room channels: per-user channels simplify authorization, while shared channels reduce fan-out cost but need membership checks."],
    p: ["Authorization is checked on connect but not on each channel subscription, exposing private rooms to any signed-in user.", "After a reconnect, the client silently misses messages sent during the gap and shows stale data."],
    v: "Run two server processes, subscribe one client to each, broadcast from a third context and confirm both receive the message once. Subscribe to an unauthorized channel and confirm rejection.",
    dep: ["websocket-handling", "authorization-policies", "event-dispatcher"]
  },
  "server-sent-events": {
    s: "A one-way stream of text events from server to browser over an ordinary HTTP response, with automatic reconnection and resume support built into the client.",
    d: "A handler returns a response with an event-stream content type and keeps it open, writing events with optional identifiers and types. The browser's client reconnects automatically after a drop and sends the last event identifier so the server can resume. It works through standard HTTP infrastructure, authentication and compression. The difficulty is intermediaries and capacity: proxies may buffer or time out idle streams, each stream holds a connection and a worker, and browsers limit simultaneous streams per host.",
    k: ["Server-sent events vs WebSockets: events are simple and ride on plain HTTP, but only go one way, while sockets are bidirectional with more machinery.", "Resume with event identifiers vs stateless streams: resume gives gap-free updates, but requires the server to retain recent events."],
    p: ["A proxy buffers the stream, so events arrive in bursts or not at all.", "Each open stream occupies a worker in a thread-per-request server, exhausting capacity with a few hundred users."],
    v: "Open a stream through the production proxy and confirm events arrive within a second of being sent. Drop the connection, reconnect and confirm the server resumes from the last event identifier without gaps.",
    dep: ["streaming-responses", "channels-and-pubsub"]
  },
  "presence-tracking": {
    s: "Tracks which users or devices are currently connected to a channel and shares joins and leaves, tolerating unclean disconnects and multiple processes.",
    d: "Each connection registers its user on a channel with metadata. Presence state is replicated across processes, typically as a conflict-free structure or entries with timeouts in a shared store, and changes are broadcast as join and leave diffs. A user with several tabs counts as present until the last one leaves. Heartbeats expire dead entries. The difficulty is accuracy: network partitions and crashed processes leave ghosts, and large rooms make each join an expensive broadcast.",
    k: ["Heartbeat expiry vs explicit leave messages: expiry handles crashes, but delays updates, while explicit leaves are instant and lost on failures.", "Full-state sync vs diffs only: diffs are small and fast, but need periodic full syncs to repair missed updates."],
    p: ["A crashed process leaves its users listed as online indefinitely because no heartbeat ever expires them.", "A popular room broadcasts every join to every member, producing quadratic traffic."],
    v: "Join with two tabs, close one and confirm the user stays present, then kill the server process hosting the other and confirm the user disappears from other processes' views within the timeout.",
    dep: ["channels-and-pubsub", "websocket-handling", "cache-store"]
  },
  "cache-store": {
    s: "A uniform key-value cache interface over in-process memory, shared memory servers or files, with expiry, tagging, atomic increment and locks.",
    d: "Application and framework code read and write values under keys through one interface, with a time to live, namespaces and a fetch-or-compute helper that fills on miss. Backends differ: per-process memory is fastest but not shared, network cache servers are shared and survive deploys, file stores are simple. The same store often backs sessions, rate limits and locks. The difficulty is invalidation and stampedes: stale data survives past changes, and when a hot key expires, many requests recompute it simultaneously.",
    k: ["Time-based expiry vs explicit invalidation on change: expiry is simple and bounds staleness, while explicit invalidation is fresher but requires every write path to remember.", "Shared cache vs per-process cache: shared caches give consistent values across workers, while per-process caches avoid network hops but diverge between workers."],
    p: ["A popular key expires and hundreds of requests recompute it at once, overloading the database.", "Cache keys omit a varying input such as locale or tenant, so one user receives another's cached data."],
    v: "Write, read, expire and delete a key through each configured backend, then expire a hot key under concurrent load and confirm only one request recomputes it. Check keys include tenant and locale.",
    dep: ["configuration", "secrets-management"]
  },
  "response-caching": {
    s: "Stores rendered pages, template fragments or API responses in the cache under keys derived from their inputs, so repeated requests skip rendering and queries.",
    d: "Fragment caching wraps part of a template with a key built from the record's identifier and last-updated time, so changing the record changes the key and old entries simply expire. Page and response caching store whole outputs, keyed by URL and varying headers. Nested fragments can cascade invalidation upward. Cache keys must include everything that changes output, including locale, format and permissions. The difficulty is correctness: serving private content from a shared cache or serving stale content after a change.",
    k: ["Key-based invalidation with version in key vs explicit deletion: version keys never need deletion and stay correct, but leave old entries to age out.", "Whole-response caching vs fragment caching: whole responses save the most work, while fragments allow personalization and finer invalidation."],
    p: ["A cached response containing user-specific content is stored under a shared key and shown to other users.", "A template changes but cached fragments keep the old markup until they expire, since template version is not part of the key."],
    v: "Render a page twice and confirm the second render skips queries, then edit one record and confirm only its fragment re-renders. Request the page as two different users and confirm no content crosses between them.",
    dep: ["cache-store", "layouts-and-partials", "http-caching"]
  },
  "http-caching": {
    s: "Uses standard validators and directives, such as ETag, Last-Modified, Cache-Control and Vary, so browsers and intermediaries reuse responses or revalidate cheaply with 304.",
    d: "The framework computes an ETag from the response body or from the underlying records, and answers conditional requests with 304 and no body when nothing changed. Cache-Control directives state whether a response may be stored by shared caches, how long it is fresh and whether it must revalidate. Vary lists the request headers that change the response. Private pages get private directives. The difficulty is precision: too permissive exposes user data in shared caches, and too strict throws away free performance.",
    k: ["Computing ETags from the rendered body vs from record versions: body-based is automatic but still pays for rendering, while record-based skips rendering but needs care to include all inputs.", "Short freshness with revalidation vs long lifetimes: revalidation keeps content correct at the cost of requests, while long lifetimes are fastest but cannot be recalled."],
    p: ["Authenticated pages sent without private or no-store directives are stored by a shared proxy and served to others.", "A missing Vary header makes caches return a compressed or localized variant to clients that cannot use it."],
    v: "Request a page, repeat it with If-None-Match and confirm a 304 without body, change the record and confirm 200 with a new validator. Inspect headers on authenticated responses and confirm they are private.",
    dep: ["response-object", "request-object", "content-negotiation"]
  },
  "locale-resolution": {
    s: "Determines the language and region for a request from the URL, a saved preference, the Accept-Language header or a default, and applies it for the rest of the request.",
    d: "A middleware picks the locale by a defined precedence, for example a URL prefix, then the user's profile, then a cookie, then the header, falling back through related locales to a default. It sets the locale for the request's scope, affecting translation lookup, formatting and templates, and the reverse routing helpers can include it in URLs. Time zones are resolved alongside. The difficulty is leakage: locale stored in global state bleeds into background jobs and other requests.",
    k: ["Locale in the URL vs from headers and preferences: URL locales are crawlable, cacheable and shareable, while header-based selection keeps URLs clean but varies content invisibly.", "Per-request scoped locale vs global setting: scoped locale is safe under concurrency, while a global is simple and wrong when requests overlap."],
    p: ["A locale set globally during one request affects other concurrent requests or later jobs on the same worker.", "Pages vary by locale without Vary or a URL difference, so a cache serves the wrong language."],
    v: "Send concurrent requests with different locales and confirm each response uses only its own. Enqueue a job from a French request and confirm the job renders in the intended locale, not the worker's last one.",
    dep: ["middleware-pipeline", "request-object", "translation-catalogs"]
  },
  "translation-catalogs": {
    s: "Stores translated strings by key and locale, resolves them with interpolation and plural rules, and falls back through related locales when a string is missing.",
    d: "Strings live in per-locale files or a database, addressed by stable keys. Lookup takes a key, locale and variables, applies fallback chains and plural categories, and returns the string; missing keys are reported in development and tests. Messages can include markup, which needs safe handling. Extraction tools find keys in code, and workflows send them to translators. The difficulty is grammar: plural, gender and word-order rules vary widely, and string concatenation in code cannot be translated correctly.",
    k: ["Keys as identifiers vs the source text as key: identifier keys survive wording changes, while source-text keys are easier to write but break when text is edited.", "Files in the repository vs a translation management service: files version with code, while a service speeds translator workflows but adds synchronization."],
    p: ["Building sentences by joining translated fragments makes correct translation impossible in languages with different word order.", "Missing translations show raw keys in production because nothing fails the build when one is absent."],
    v: "Render a page in every supported locale and confirm no raw keys appear, then run the missing-key check in the test suite. Verify plural forms with zero, one, two and many items in a language with several plural classes.",
    dep: ["locale-resolution", "configuration"]
  },
  "localized-formatting": {
    s: "Formats dates, times, numbers, currencies and lists according to the user's locale and time zone, and parses localized user input back into values.",
    d: "Formatting uses locale data, such as separators, calendars and currency placement, to turn stored values into display text; time values are stored in UTC and converted to the user's zone for display. Parsing accepts the same localized forms in inputs. Sorting and case conversion follow locale collation rules. The difficulty is data and rules: time zone rules change, daylight-saving boundaries are ambiguous, currencies have varying minor units, and storing local times instead of instants creates errors that cannot be fixed later.",
    k: ["Store UTC instants and convert on display vs store local times: UTC is unambiguous, while local times preserve intent for future events such as appointments across zone rule changes.", "Locale data bundled with the framework vs from the platform: bundled data is consistent across hosts, while platform data stays current but varies by environment."],
    p: ["Dates stored without a time zone are displayed shifted for users in other zones or on daylight-saving change days.", "Parsing a localized number with the wrong separator turns 1.234 into 1234 or into a decimal."],
    v: "Format the same instant for users in three zones, including one on a daylight-saving boundary, and confirm expected local times. Format and parse a currency value in two locales and confirm round-trip equality.",
    dep: ["locale-resolution", "view-helpers"]
  },
  "file-storage": {
    s: "A single interface for reading, writing and linking to files that works the same over local disk and remote object stores, with signed URLs for private access.",
    d: "The application writes files by logical path through a driver. The local driver uses a directory, the remote driver an object store, and both can be mounted by name. Public files return URLs, private ones return time-limited signed URLs so downloads bypass application workers. Metadata, content types and visibility are set at write. Attachment records link files to models. The difficulty is consistency and cost: eventual consistency, partial uploads and orphaned files after record deletion accumulate silently.",
    k: ["Local disk vs object storage: disk is simple and fast on one host, while object storage is shared across servers and durable but adds latency and per-request cost.", "Signed URLs vs proxying downloads through the application: signed URLs offload bytes, but cannot easily log or revoke individual downloads."],
    p: ["Files remain in storage after their database records are deleted, growing storage cost and keeping data that should be gone.", "A private file is stored with public visibility by default and is reachable by anyone with the URL."],
    v: "Write a private file, fetch it directly without a signature and confirm denial, fetch through a signed URL and confirm success, then wait past expiry and confirm the URL fails. Delete the record and confirm the file is removed.",
    dep: ["configuration", "secrets-management", "job-queue"]
  },
});
