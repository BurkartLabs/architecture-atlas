// Details for the feature flag service plate, part 3: usage pipeline, client libraries, fallbacks.
ATLAS.details("feature-flags", {
  "evaluation-event-ingestion": {
    s: "The service endpoint that accepts batches of evaluation and custom events from SDKs, validates them cheaply and hands them to a durable queue.",
    d: "SDKs post compressed batches over HTTP. The ingestion tier authenticates the key, checks size and schema, rejects or truncates abusive payloads, and appends to a log or queue, returning quickly so clients are not held. Downstream consumers read the queue at their own pace. It is hard because the volume tracks the product's traffic, not the flag count, and because it must stay available during spikes; a slow ingestion endpoint must never slow application code, so SDKs send in the background.",
    k: ["Accept-and-queue versus process inline: the endpoint stays fast under bursts, but data appears in views after a lag.", "Per-key rate limits versus unlimited ingestion: protects the shared pipeline from a runaway client, but drops legitimate events from a busy customer."],
    p: ["A retry storm after a brief outage doubles the load on the ingestion tier just as it recovers.", "Events with no deduplication id are counted twice after a client retries a request that actually succeeded."],
    v: "Send ten thousand evaluation events in batches and confirm the queue holds exactly that many records, that the endpoint returned in under the target latency, and that a malformed batch was rejected with an error.",
    dep: ["event-batching-and-sampling", "service-tokens-and-keys", "multi-region-replication"]
  },
  "event-batching-and-sampling": {
    s: "SDK-side logic that buffers evaluation events, summarizes repeats and sends them periodically, optionally sampling, so reporting costs little at high request rates.",
    d: "Rather than one event per check, an SDK keeps counters per flag, variant and version for a flush interval, and sends a summary. Full per-user events are kept only for flags that need them, such as experiments or debugging windows. A bounded buffer drops the oldest data when full. Sampling ratios are carried in each event so totals can be reweighted. It is hard because summarizing loses information needed later and unbounded buffers risk memory exhaustion.",
    k: ["Summarized counters versus full per-evaluation events: tiny payloads and cheap storage, but no way to answer questions about individual users.", "Dropping events when the buffer is full versus blocking: the application is never slowed, but data silently has holes."],
    p: ["Process exit before the final flush loses the last interval of events, especially in short-lived functions.", "Sampled events stored without their sampling ratio are summed as if complete, undercounting usage."],
    v: "Evaluate one flag one million times in a loop with a flush interval of ten seconds and confirm the service receives a few summary payloads whose counts add up to exactly one million.",
    dep: ["in-memory-flag-store", "evaluation-api-and-hooks"]
  },
  "usage-aggregation": {
    s: "Rolls events up into per-flag, per-variant and per-environment counts over time, powering usage charts and showing which variants are actually served.",
    d: "A stream or batch job consumes ingested events and writes time-bucketed counters to an analytical or time-series store keyed by flag, variant, version, environment and SDK. Queries read these rollups instead of raw events. Late events arrive and must update earlier buckets within a window. It is hard because cardinality (flags times variants times SDK versions times time buckets) grows quickly, and consumers expect numbers that agree with the raw log and with each other.",
    k: ["Pre-aggregated rollups versus querying raw events: fast, cheap charts, but unplanned questions need a raw event store anyway.", "Event-time windows with late data versus processing time: counts match when things happened, at the cost of revising numbers already shown."],
    p: ["A new SDK version string on every build creates unbounded label cardinality and swells the store.", "Late events after an outage land in a closed window and the chart never matches the raw total."],
    v: "Replay a fixed event file with known per-variant counts and confirm the usage chart totals equal the file totals for every flag and hour, including a few events delivered out of order.",
    dep: ["evaluation-event-ingestion", "event-batching-and-sampling", "data-retention-and-privacy"]
  },
  "last-evaluated-tracking": {
    s: "Keeps the most recent time each flag was evaluated in each environment, so people can tell dormant flags from live ones with a single lookup.",
    d: "A cheap field updated from the ingestion stream with the maximum observed evaluation time per flag and environment, often also the variants seen and SDK versions. It is stored separately from usage rollups because it needs a different shape: one small record per flag, written often, read in lists. It is hard because it must be approximately current without turning every event into a database write, and because a lack of recent evaluations does not prove nothing uses the flag.",
    k: ["Updating at most once per interval per flag versus on every event: far fewer writes, but the field lags by that interval.", "Tracking per environment and SDK versus per flag only: shows which old clients still use a flag, at the cost of more records."],
    p: ["A flag evaluated only by a client with sampling disabled looks unused because events were never sent.", "Time zone or clock errors on clients cause 'last evaluated' times in the future."],
    v: "Evaluate a flag once from a test client, wait one update interval, and confirm the console shows that evaluation time and the SDK that made it, while an untouched flag shows no evaluation.",
    dep: ["evaluation-event-ingestion", "usage-aggregation"]
  },
  "analytics-export": {
    s: "Streams or batches raw event data into the customer's own warehouse or analytics tools so flag assignments can be joined to business data there.",
    d: "Destinations receive evaluation and assignment events, either through a continuous stream or periodic file drops, in a documented schema with stable ids. Mapping rules rename fields and filter which flags are included. The customer's warehouse then joins variant assignments with product events. It is hard because the export must be complete and ordered enough for analysis, retry safely without duplicates, and handle schema changes without breaking downstream tables.",
    k: ["Streaming export versus periodic batches: lower delay for dashboards, but harder retry and ordering semantics.", "A fixed documented schema versus customer-defined mapping: stable downstream tables, but less convenient for sources with different conventions."],
    p: ["A schema change adds a field and breaks a downstream load that expected exact columns.", "A failed destination is retried until the retention window ends and events are lost without notice."],
    v: "Send a known set of events to a test destination, then count rows there by flag and variant and confirm they equal the service's own usage counts, with no duplicates after forcing a retry.",
    dep: ["evaluation-event-ingestion", "data-retention-and-privacy"]
  },
  "data-retention-and-privacy": {
    s: "Rules for how long events and context data are kept, which attributes are stored at all, and how a person's data is found and removed on request.",
    d: "Evaluation contexts can contain personal data. The service limits what it stores: hashed or omitted attributes, private attribute lists that SDKs strip before sending, and retention windows per data type, such as days for raw events and longer for aggregates. Deletion requests must find a person's records across raw logs, rollups and exports. It is hard because aggregates are easy to delete but raw logs spread across stores, and because analysis needs just the data privacy wants removed.",
    k: ["Stripping attributes in the SDK versus at ingestion: sensitive values never leave the app, but targeting that needs them must run locally.", "Short raw retention with long aggregates versus long raw retention: lower exposure, but unplanned analysis of old events becomes impossible."],
    p: ["Email addresses in a context key end up in raw logs and exports, outliving the retention policy.", "A deletion request is satisfied in the main store but not in a downstream warehouse copy."],
    v: "Submit a test context with an email attribute marked private and confirm no stored event contains it. Request deletion for a key and confirm a search across raw and exported data returns nothing.",
    dep: ["attribute-privacy", "evaluation-event-ingestion"]
  },
  "server-side-sdk": {
    s: "The library for back-end processes: it downloads the full ruleset, keeps it in memory, evaluates locally for any user and reports events in the background.",
    d: "At startup it connects with a secret key, fetches every flag and segment for its environment, and then receives updates by streaming or polling. Each check evaluates against the in-memory ruleset, with no network call, taking microseconds. It is shared by many threads or requests, so the store must be safe for concurrent reads during updates. It is hard because it holds private targeting data, runs for long periods in many replicas, and must behave identically across the many language runtimes.",
    k: ["Local evaluation from a full ruleset versus a remote evaluation call: no per-check latency or dependency, but the whole ruleset, including private rules, must reach every server.", "A long-lived singleton client versus per-request construction: one connection and one copy of the rules, but requires careful shutdown and initialization."],
    p: ["Creating a client per request opens a connection and downloads the ruleset every time.", "Using the SDK before initialization completes returns defaults for the first requests after startup."],
    v: "Start a server with the SDK, wait for ready, and evaluate a flag one million times. Confirm no network traffic during the loop and that a change in the console arrives within the propagation target.",
    dep: ["in-memory-flag-store", "rule-evaluator", "streaming-connection", "polling-client", "service-tokens-and-keys"]
  },
  "client-side-sdk": {
    s: "The library for browsers and other untrusted front ends: it asks the service for evaluated values for one user and caches them, never receiving the full rules.",
    d: "Because code in a browser can be inspected, the client sends its context to the service or a relay, which evaluates and returns only that user's flag values. The SDK stores them and answers checks locally, then listens for change notifications and refetches when the context or rules change. It must work with slow networks, avoid flashes of wrong content, and respect consent. It is hard because every context change needs a roundtrip and values can lag.",
    k: ["Remote evaluation returning values versus shipping rules to the browser: private rules stay private, but each context change costs a request.", "Blocking render until flags load versus rendering defaults then updating: no flicker, but a slower first paint when the service is slow."],
    p: ["Flags load after first render, so users briefly see the old experience and then a jump to the new one.", "Sending a full user record to the service for evaluation exposes more personal data than needed."],
    v: "Load a page with a throttled network and confirm the page renders using bootstrapped values, then updates when evaluation arrives, and that the network log shows no rule bodies, only values for this user.",
    dep: ["in-memory-flag-store", "streaming-connection", "initial-values-and-bootstrapping", "service-tokens-and-keys", "attribute-privacy"]
  },
  "mobile-sdk": {
    s: "The library for phones and tablets: like the client-side SDK, but built for intermittent networks, battery limits, background suspension and app versions that stay in use for years.",
    d: "It fetches evaluated values for the signed-in or anonymous user, persists them to local storage so the next launch starts with the last known values, and refreshes on foreground and on a streaming connection when active. It batches events to survive offline periods and avoid radio wakeups. It is hard because old app versions live on devices for years, so flag semantics and the SDK's own behavior must stay compatible, and because the OS suspends connections unpredictably.",
    k: ["Persisting values between launches versus fetching fresh on every launch: instant, consistent startup and offline operation, but a user may see stale values until the fetch completes.", "Streaming only in the foreground versus always: saves battery, but background changes show only at next foreground."],
    p: ["A flag deleted server-side still evaluated by a two-year-old app version falls back to its compiled default.", "Offline users never flush their events because the buffer is cleared at app update."],
    v: "Launch the app online, switch on airplane mode, kill and relaunch it, and confirm flags return the last fetched values. Return online and confirm updated values arrive and buffered events flush.",
    dep: ["in-memory-flag-store", "persistent-sdk-cache", "streaming-connection", "event-batching-and-sampling"]
  },
  "edge-runtime-sdk": {
    s: "The library for edge workers and other short-lived, stateless runtimes: it reads flag data from a nearby store or cache instead of holding connections open.",
    d: "Edge functions start often, live briefly and cannot keep streaming connections. The SDK reads a compact ruleset or evaluated payload from a key-value store or edge cache populated by the service, and evaluates in the request path. Updates are pushed to the store by the publisher, so a read sees the latest version already propagated. It is hard because cold starts must not fetch from a distant origin, memory and CPU limits are tight, and eventual consistency across locations means different edge points may briefly disagree.",
    k: ["Rules in an edge key-value store versus fetching from origin: a local read at each request, but updates reach locations at different times.", "Evaluating at the edge versus precomputing per segment: flexible for any user, but costs CPU in every request."],
    p: ["Two edge locations hold different versions, so one user alternates between variants across requests.", "A ruleset larger than the platform's value limit fails to store and the edge keeps serving the old one."],
    v: "Publish a change, then request through several edge locations and record the version each served. Confirm all report the new version within the propagation target and that no request made an origin call.",
    dep: ["edge-cache-distribution", "snapshot-files", "rule-evaluator"]
  },
  "in-memory-flag-store": {
    s: "The SDK's local copy of flags and segments, replaced atomically on each update, which makes every evaluation a memory lookup.",
    d: "The store holds flag definitions, segments and their versions in maps keyed by flag key. Updates apply as full or partial changes, ignored if their version is not newer than what is held. Readers must see a consistent view: swapping an immutable snapshot, or using version-aware reads, prevents a check from seeing half an update. Deleted flags are kept as tombstones with versions so a late older update cannot resurrect them. It is hard because concurrency and ordering are subtle.",
    k: ["Replacing an immutable snapshot versus mutating in place: readers need no locks and never see partial state, at the cost of copying on update.", "Tombstones for deletions versus removing entries: stale updates cannot bring back deleted flags, but deleted data lingers in memory."],
    p: ["An older update arriving after a newer one overwrites it because versions are not compared.", "Mutating shared structures during a rule evaluation lets a check see a flag from one version and a segment from another."],
    v: "Apply updates out of order, version three then version two, and confirm the store keeps version three. Delete a flag, replay its creation at an old version, and confirm it stays deleted.",
    dep: ["ruleset-serialization", "config-versioning"]
  },
  "evaluation-api-and-hooks": {
    s: "The small function surface applications call to get a value, a variant with reason, or all values for a context, plus hooks that run around each evaluation.",
    d: "Typed functions return a boolean, string, number or structured value given a key, a context and a default. Detail variants return the value, variant, rule reason and version. Hooks let applications and plugins observe evaluations to add tracing attributes, log or emit exposure events. Open standards for vendor-neutral evaluation APIs let application code stay portable. It is hard because the API is used in hot paths, in every language, and must never throw or block.",
    k: ["A required default value argument versus a library-wide default: the safe result is chosen at the call site, but each call carries a constant that can drift.", "Hooks around evaluation versus built-in telemetry only: allows custom tracing and exposure, but each hook is code in the hot path."],
    p: ["A hook that blocks on network I/O adds latency to every flag check.", "The default is a different type from the flag's variants, so a failure returns a value the code cannot handle."],
    v: "Call the detail API for a flag with a rule match and confirm it returns the variant, rule reason and version. Make a hook throw and confirm the evaluation still returns the correct value.",
    dep: ["in-memory-flag-store", "rule-evaluator", "in-code-default-values", "evaluation-reasons"]
  },
  "test-overrides-and-mocks": {
    s: "Test support that lets automated tests set flag values directly, without a network or service, so tests can cover both sides of every conditional.",
    d: "Libraries provide a test mode backed by a local map: tests declare flag keys and values, or load a ruleset file, and the SDK answers from it with no connection. Browser tests can override values by query parameter or local storage in non-production builds. Test data builders create flags with realistic rules. It is hard because tests must cover each variant of every live flag, and overrides must never be reachable in production.",
    k: ["A local test data source versus calling a test environment: fast, deterministic and offline, but may drift from how the real service evaluates.", "Query-string overrides in non-production only versus everywhere: useful for QA on real builds, but a vulnerability if enabled in production."],
    p: ["Tests exercise only the default value, so the code path behind the flag ships untested.", "A debug override left enabled in production lets anyone switch flags with a URL parameter."],
    v: "Write a test that sets a flag to each variant in turn and asserts the matching behavior, with the network disabled. Confirm the same override attempt on a production build is ignored.",
    dep: ["evaluation-api-and-hooks", "in-memory-flag-store", "ruleset-serialization"]
  },
  "initial-values-and-bootstrapping": {
    s: "Supplies flag values to a client at startup, embedded in the page or app, so first render uses real values without waiting for a network call.",
    d: "A server evaluates flags for the incoming user during page generation and embeds the result in the HTML or startup payload. The client SDK initializes with these values and begins live updates in the background. For static builds the bootstrap may be a file shipped with the app. It is hard because bootstrapped values can differ from what the client later fetches, causing flicker, and because embedding values for one user into a cached page serves them to others.",
    k: ["Server-rendered bootstrap versus client fetch: instant first render without a flash, but every page render needs a server evaluation.", "Shipping a fixed bootstrap file versus fetching: no network at startup, but values age until the next release."],
    p: ["A cached page with embedded values for one user is served to many users, giving them someone else's variants.", "Bootstrap values come from a stale ruleset, so the client flips after loading and users see a layout jump."],
    v: "Load a page with the service blocked and confirm it renders with the bootstrapped values. Unblock, and confirm the SDK reports identical values or updates them without a visible layout change.",
    dep: ["client-side-sdk", "rule-evaluator", "evaluation-context"]
  },
  "in-code-default-values": {
    s: "The value written at each call site that the SDK returns when it has no usable flag data, making the safe behavior explicit in the code itself.",
    d: "Each evaluation call takes a default. The SDK returns it when the client is not initialized, the flag key is missing, the type does not match, or evaluation fails. The default should be the behavior that is safe if the service is gone: usually the old code path, off for unfinished features and on for safety controls. It is hard because defaults are scattered across a codebase and drift from the service's configured fallback.",
    k: ["Defaults at the call site versus a central default list: the safe choice is next to the code that uses it, but the same flag may carry different defaults in different places.", "Defaulting new features to off versus on: unfinished code never turns on by accident, but a kill switch must default on."],
    p: ["A flag defaults to on in code while the service has it off, so an outage turns the feature on everywhere.", "Defaults differ across services using the same flag, so partial outages produce inconsistent behavior."],
    v: "Block the SDK from reaching the service and evaluate each flag in a test, confirming the value returned equals the call-site default and that the evaluation reason reports an error or uninitialized state.",
    dep: ["evaluation-api-and-hooks"]
  },
  "last-known-good-cache": {
    s: "Keeps serving the most recent successfully received ruleset when the service becomes unreachable, instead of reverting to defaults.",
    d: "The in-memory store already holds the last ruleset it received. The SDK simply continues using it when connections fail, and keeps retrying in the background. This means a service outage causes stale flags rather than wrong ones. Expiry on that data is a policy choice: serving week-old rules may be worse than defaults. It is hard because staleness is invisible to the application, a kill switch cannot take effect during the outage, and a restart during the outage loses the cache unless persisted.",
    k: ["Serving stale rules indefinitely versus expiring after a limit: stable behavior during long outages, but flags may differ from intent for days.", "In-memory only versus persisted: no storage dependency, but a restart in an outage drops back to defaults."],
    p: ["A kill switch pressed during the outage does nothing, and nobody knows because the console shows success.", "The SDK keeps stale rules after a flag is deleted and revived with a different meaning."],
    v: "Initialize a client, cut its network, and evaluate a flag for an hour of simulated time, confirming it returns the last received value, and that the SDK reports the stale state through its status interface.",
    dep: ["in-memory-flag-store", "degraded-mode-signals", "retry-and-backoff"]
  },
  "persistent-sdk-cache": {
    s: "Saves the latest ruleset or evaluated values to local disk or storage, so a restart during an outage still starts with real data.",
    d: "After each successful update the SDK writes the data to a file, local storage or a shared volume. On startup it loads this copy first, begins serving, and then refreshes from the network. For mobile and browser clients this is the main startup path. For servers a sidecar or shared cache serves the same purpose across replicas. It is hard because data on disk may be older than the application's expectations, may contain private rules that need protection, and its format must be readable by newer SDK versions.",
    k: ["Loading a persisted copy first versus waiting for the network: fast, resilient startup, but briefly serves older values.", "Encrypting the persisted data versus plain storage: protects private rules on shared machines, but adds key management."],
    p: ["A persisted ruleset from an incompatible older SDK version fails to parse and the client falls back to defaults.", "Cached values from a previous user are applied to the next user on a shared device."],
    v: "Initialize a client online, stop the service, restart the application, and confirm flags return the previously fetched values within the startup time target, then recover to fresh values once the service returns.",
    dep: ["in-memory-flag-store", "ruleset-serialization", "attribute-privacy"]
  },
  "initialization-timeout": {
    s: "A bounded wait at startup for the first ruleset, after which the application continues with defaults or cached data instead of hanging.",
    d: "Applications that evaluate flags during startup must decide how long to wait. The SDK exposes a ready signal or a blocking wait with a timeout. When it expires, the SDK reports failure and continues attempting in the background, while evaluations return defaults or cache. Short timeouts keep startup fast but risk serving defaults to early traffic; long timeouts delay deployment. It is hard because health checks, readiness gates and load balancer warmup all interact with this value.",
    k: ["A short timeout with fallback versus waiting until ready: startup never blocks on the service, but early requests may see defaults.", "Gating readiness on flags loaded versus not gating: new instances serve right values from the start, but an outage blocks every new instance from joining."],
    p: ["Every new instance waits the full timeout during an outage, so scaling out in response to load stalls.", "A timeout of a few hundred milliseconds routinely loses to cold starts and serves defaults to the first users."],
    v: "Start the application with the service blackholed and confirm it begins serving within the configured timeout, evaluations return defaults, and the status reports initialization failure.",
    dep: ["server-side-sdk", "in-code-default-values", "degraded-mode-signals"]
  },
  "offline-mode": {
    s: "A configuration in which the SDK never contacts the service and answers only from local data, for tests, air-gapped systems and tightly controlled environments.",
    d: "In offline mode the SDK is given a ruleset from a file, an embedded constant or a data source the operator controls, and makes no outbound requests, including event reporting. Production uses include isolated networks, where a ruleset is delivered through the deployment pipeline. It is hard because the operator takes over the work of distribution: rules must be delivered, versioned and kept consistent across instances by some other means.",
    k: ["Rules delivered by the deployment pipeline versus fetched live: no runtime dependency on the service, but flag changes need a deploy or file push.", "Disabling event reporting entirely versus queueing: no outbound traffic, but usage and experiment data is lost."],
    p: ["Instances in one cluster hold different ruleset files after a partial rollout of the file.", "Teams leave offline mode on after testing and production never receives changes."],
    v: "Start with offline mode, block all outbound traffic and confirm evaluations return values from the provided file. Swap the file and confirm the new values after the documented reload step.",
    dep: ["ruleset-serialization", "in-memory-flag-store", "snapshot-files"]
  },
  "degraded-mode-signals": {
    s: "Exposes the SDK's state, such as connecting, ready, stale or failed, through status calls, events and metrics, so applications and operators can see when flags are not fresh.",
    d: "SDKs publish connection status, time since the last successful update, current ruleset version, buffered event counts and errors. Applications can wire these to health endpoints, alerts or logs, and may choose to change behavior when flags are stale. Evaluation reasons also report when a value came from a default because of an error. It is hard because most applications never look at these signals, so a silent staleness lasts until someone wonders why a change had no effect.",
    k: ["Exposing state through callbacks and metrics versus logging only: automatable alerting, but each application must wire it up.", "Failing readiness when stale versus continuing to serve: orchestrators drain unhealthy instances, but a service outage then drains every instance."],
    p: ["Nobody alerts on stale flag data, so an SDK that stopped updating a week ago goes unnoticed.", "Errors are logged on every evaluation during an outage and flood the logging system."],
    v: "Cut the SDK's network, wait past the staleness threshold, and confirm the status changes to stale, the metric for age of data climbs, and an alert rule on it fires.",
    dep: ["in-memory-flag-store", "evaluation-reasons"]
  },
  "retry-and-backoff": {
    s: "The SDK's policy for reconnecting and refetching after failures: how long to wait, how that grows, and how randomness keeps thousands of clients from retrying together.",
    d: "After a failed connection or request the SDK waits before retrying, with exponential growth up to a cap and random jitter, and resets after a stable period. Permanent errors such as an invalid key stop retries. Servers can send hints, such as an HTTP Retry-After header, to slow clients further. It is hard because synchronized retries after an outage create a spike that prolongs it, and because too gentle a policy delays recovery by minutes.",
    k: ["Exponential backoff with jitter versus fixed intervals: the fleet spreads out and the service recovers, but individual clients take longer to reconnect.", "Retrying forever versus giving up on errors: automatic recovery from outages, but a permanently bad key keeps generating traffic."],
    p: ["All clients reconnect at the same moment after a deploy and overload the streaming tier.", "An invalid key is retried indefinitely and floods logs with errors."],
    v: "Simulate a service outage across many clients, restore it, and plot reconnection times. Confirm they are spread over the backoff window rather than concentrated in the first second.",
    dep: ["polling-client", "streaming-connection"]
  },
});
