// Details for the serverless platform plate, part 2: event sources, the front door, the function control plane.
ATLAS.details("serverless-platform", {
  "http-triggers": {
    s: "Turns an incoming HTTP request into an invocation, mapping method, path, headers and body into an event and the function's result back into a response.",
    d: "A gateway or a built-in function endpoint terminates TLS, matches routes, and invokes the function synchronously with a request event, then converts the returned status, headers and body into an HTTP response. Optional features add authorizers, request validation and caching. The mapping is where most trouble sits: binary bodies need encoding, header casing and multi-value headers differ between event formats, and the gateway's timeout is usually shorter than the function's, so a slow function appears to the client as a gateway error while still running.",
    k: ["Gateway in front vs. built-in function URL: a gateway offers auth, throttling and routing in one place, but adds a hop, a cost and its own timeout.", "Proxy-style pass-through event vs. configured field mapping: pass-through is flexible and simple, but puts parsing and validation inside every function."],
    p: ["A response over the synchronous size limit fails after the work has already been done and billed.", "Gateway timeout fires first, the client retries, and the function runs twice for one logical request."],
    v: "Send a request with a binary body and multi-value headers through the trigger, and confirm the handler sees them decoded as documented and the client receives the status, headers and body the handler returned.",
    dep: ["invoke-api","request-authentication","throttling-and-rate-limits"]
  },
  "schedule-triggers": {
    s: "Invokes a function on a recurring or one-time schedule, expressed as a rate or a calendar expression, without any server running a timer.",
    d: "A scheduler service stores rules and, at each due time, submits an asynchronous invocation to the front door with a fixed payload. Many rules share a small number of scheduler shards, which scan time-ordered indexes for due work. Delivery is at-least-once and usually within seconds of the due time, not exact. The hard problems are time zones and daylight changes, bursts when thousands of rules share the same minute, and missed runs after an outage, which can be skipped or caught up.",
    k: ["Fire-and-forget on schedule vs. queued with catch-up: skipping missed runs avoids a stampede after recovery, but loses work that had to happen.", "Jitter added to start times vs. exact times: jitter spreads load on downstream systems, but breaks users who need a precise moment."],
    p: ["Every job scheduled at minute zero of the hour produces a synchronized spike that throttles itself.", "A long-running scheduled job overlaps its next run because nothing enforces single execution."],
    v: "Create a rule firing every minute, record invocation times for an hour, and confirm each is within the stated delay of its due time, none are missing, and duplicates, if any, are visible by request identifier.",
    dep: ["invoke-api","async-event-queue"]
  },
  "queue-pollers": {
    s: "Platform-run readers that poll a message queue on the function's behalf, fetch batches, invoke the function with them, and delete messages only after success.",
    d: "A fleet of pollers, separate from the customer's code, long-polls the queue, assembles a batch, and calls the function synchronously. If the function returns success the poller deletes the messages; on failure they reappear after the visibility timeout. The pollers scale their count with queue depth within a concurrency limit. This gives at-least-once delivery. The hard parts are scaling up quickly without overwhelming downstream systems, and the interaction between visibility timeout and function timeout: if messages become visible while the function still runs, they are processed twice.",
    k: ["Scale pollers on backlog vs. fixed maximum concurrency: backlog scaling drains bursts fast, but can flood a database unless a cap is set.", "Delete after success vs. delete on receipt: deleting after success is safe against crashes, but means every consumer must tolerate duplicates."],
    p: ["Visibility timeout shorter than function timeout makes messages reappear mid-processing and run concurrently.", "One slow message in a batch holds the rest of the batch and delays every message behind it."],
    v: "Enqueue 10,000 messages, watch concurrency rise to its configured cap and drain, then confirm every message was processed at least once and the queue is empty with no message deleted before a successful return.",
    dep: ["invoke-api","concurrency-controller","batching-windows"]
  },
  "stream-shard-pollers": {
    s: "Readers for ordered log or stream shards that invoke the function with consecutive records, preserving order within a shard and tracking progress with a checkpoint.",
    d: "One poller owns each shard, reads records from a position, invokes the function with a batch, and advances the checkpoint on success. Ordering inside a shard is kept by never invoking two batches from the same shard at once. Parallelization factors can split a shard by key to raise concurrency. The hard consequence of ordering is head-of-line blocking: one record that always fails stalls its shard until retries run out, the record expires, or it is skipped to a failure destination.",
    k: ["Strict per-shard order vs. parallel batches: order preserves correctness for per-key logic, but caps throughput at one batch at a time per shard.", "Block on a poison record vs. skip and park it: blocking preserves completeness, but halts the stream, while skipping keeps flow and needs a recovery path."],
    p: ["A single malformed record retries forever and the shard's lag grows until records expire unprocessed.", "Resharding in the source splits a shard while the old position is still being processed, breaking order assumptions."],
    v: "Write ordered records with one deliberately failing, and confirm the function sees records in order, the shard stalls or skips as configured, and the checkpoint advances past it only when expected.",
    dep: ["invoke-api","retry-policy","failure-destinations","batching-windows"]
  },
  "storage-notifications": {
    s: "Event notifications from object storage and similar services, delivered to a function when something is created, changed or deleted.",
    d: "The storage service publishes an event record per change to the configured destination, which invokes the function asynchronously. The event includes the object key, size and a version marker. Delivery is at-least-once and not strictly ordered, so two changes to the same key can arrive in either order. The common design trap is the feedback loop: a function that writes to the same location that triggers it creates unbounded recursion and a very large bill.",
    k: ["Direct trigger vs. via an event bus: direct is simple and low latency, but fanning out to several consumers or filtering needs a bus.", "Process on event vs. periodic scan: events are immediate and cheap, but a missed notification is invisible until a scan reconciles."],
    p: ["A function that writes results into the watched prefix triggers itself in a loop.", "Out-of-order notifications cause an older version of an object to overwrite the result of a newer one."],
    v: "Upload an object and confirm one invocation arrives with the right key and size. Upload the same key twice quickly and confirm the handler uses the object version to resolve the order.",
    dep: ["async-event-queue","event-filtering"]
  },
  "event-bus-rules": {
    s: "A routing layer that matches events from many producers against pattern rules and delivers each match to one or more function targets, decoupling producers from consumers.",
    d: "Producers publish structured events to a bus. Rules hold a pattern over event fields and a list of targets. A matching engine evaluates each event against rules, then submits an asynchronous invocation per target with retries and a dead-letter option. Patterns support prefix, numeric and existence matching but not arbitrary code. The difficulty is scale of rules and evolution of event shape: adding a field is safe, but renaming one silently stops rules matching.",
    k: ["Central bus with rules vs. direct point-to-point triggers: a bus lets consumers be added without changing producers, but hides who depends on which event.", "Declarative patterns vs. code in the router: patterns can be indexed and are safe at scale, but cannot express every filter."],
    p: ["A producer renames a field and consumer rules stop matching, with no error anywhere.", "A rule with a target that is throttled retries for hours and holds delivery capacity for others."],
    v: "Publish matching and non-matching events, and confirm only matching ones reach each target within the stated latency, with counts per rule visible in metrics and a failed target's events in its dead-letter queue.",
    dep: ["async-event-queue","dead-letter-queues","event-filtering"]
  },
  "event-filtering": {
    s: "Rules evaluated by the platform before invocation so events the function does not care about are dropped without paying for a call.",
    d: "A filter is a pattern over the event body, evaluated by the poller or router for each record. Non-matching records are acknowledged and discarded, or in some sources simply never batched. Filtering in the platform reduces invocations, cost and downstream load, and removes boilerplate checks from handlers. The subtlety is semantics: whether a dropped record counts as processed for checkpointing, and what happens to a malformed record that cannot be parsed for matching.",
    k: ["Filter before invoking vs. inside the handler: pre-filtering saves cost and concurrency, but moves logic into configuration that is harder to test.", "Drop unmatched events vs. route them elsewhere: dropping is simplest, but loses data if the filter was wrong."],
    p: ["A filter typo drops every event, and the only symptom is that the function is never invoked.", "Filters on a field that arrives as a string in some events and a number in others match only some."],
    v: "Send ten events of which three match, and confirm the function is invoked for exactly those three, the invocation count metric agrees, and the others are acknowledged rather than retried.",
    dep: ["queue-pollers","stream-shard-pollers"]
  },
  "batching-windows": {
    s: "Settings that gather several records into one invocation, bounded by a maximum count, a maximum size and a maximum wait, to trade latency for lower cost per record.",
    d: "A poller accumulates records until the batch reaches a count or byte limit, or the window timer fires, and then invokes once. Larger batches amortize per-invocation overhead and fixed costs such as database connections. They also lengthen the time before the first record is handled, and widen the blast radius of one bad record. The timeout must cover processing a full batch. The balance depends on per-record cost versus per-invocation cost.",
    k: ["Large batches vs. small: large batches cut cost and downstream calls, but add waiting time and make retries redo more work.", "Wait window of seconds vs. immediate dispatch: a window fills batches on low traffic, but adds a floor to end-to-end latency."],
    p: ["Function timeout sized for one record fails when handed a full batch.", "A window longer than the data's freshness requirement makes results stale by design."],
    v: "Send records at a low rate with a ten-second window and confirm invocations carry several records each and the first record is delivered no later than the window plus processing time.",
    dep: ["invocation-timeouts","partial-batch-failures"]
  },
  "invoke-api": {
    s: "The regional endpoint that accepts an invocation request naming a function, version or alias and a payload, and returns a result or an acknowledgment.",
    d: "A fleet of stateless front-end servers terminates connections, authenticates the caller, loads the routing entry from a local cache, checks limits, and forwards the request to a worker capable of running it. For synchronous calls it holds the connection and streams the result back; for asynchronous calls it writes to a durable queue and returns immediately. It is the only component every invocation passes through, so its latency overhead, availability and shed-load behavior define the platform's floor.",
    k: ["Stateless front end with local caches vs. consulting the control plane per request: caches keep latency low and survive control-plane outages, but serve stale routes briefly.", "Shed excess load early vs. queue it: early shedding protects the fleet, but turns bursts into client-visible errors."],
    p: ["A cache refresh that stalls leaves servers routing to a version that was just deleted.", "Retries by clients after a slow response multiply load exactly when the system is saturated."],
    v: "Invoke a trivial function 100,000 times and confirm the platform-added latency, from receipt to handler start on warm sandboxes, stays at the stated figure at the 99th percentile.",
    dep: ["request-authentication","routing-table","placement-scheduler"]
  },
  "request-authentication": {
    s: "Verification that the caller is who they claim, using signed requests, tokens or network identity, followed by a policy check that they may invoke this function.",
    d: "The front door verifies a signature or token against the identity service, resolves the caller to a principal, and evaluates identity and resource policies together. Results can be cached briefly by credential. Public endpoints may use an authorizer function, which itself is an invocation with its own latency. The hard parts are cost on the hot path, since every request pays for it, and the staleness of cached decisions after a permission is revoked.",
    k: ["Cache authorization decisions vs. evaluate each call: caching saves latency and load on the identity service, but delays revocation by the cache lifetime.", "Platform-native auth vs. an authorizer function: native is fast and reliable, while a function can implement any scheme at the cost of a nested invocation."],
    p: ["A revoked credential keeps working until the cached decision expires.", "An authorizer that errors fails open if misconfigured, exposing the function to the internet."],
    v: "Call with a valid signature, an expired one and a valid one from an unauthorized principal, and confirm the results are success, rejection and denial, each logged with the principal identifier.",
    dep: ["resource-policies","execution-role"]
  },
  "payload-limits": {
    s: "Hard caps on request and response sizes for each invocation mode, which force large data to travel by reference through storage rather than through the function interface.",
    d: "Synchronous payloads are limited to a small number of megabytes, and asynchronous events to a smaller one, because the front door buffers them and the worker passes them over a local channel. The limits protect memory in shared servers and bound replay cost. Functions that need larger data receive a pointer, such as an object key, and fetch the content. The effect is architectural: payload limits decide where binary data, file uploads and large results live, and are rarely raised.",
    k: ["Small hard limit vs. large streaming support: small limits keep multi-tenant buffering safe, but push developers to a pointer pattern for large data.", "Different limits for sync and async: tuning each to its path is efficient, but surprises developers moving a call from one to the other."],
    p: ["An event grows past the limit only for rare large inputs and fails in production but not in tests.", "Base64 encoding of binary bodies inflates them by a third, pushing them over the limit."],
    v: "Send payloads just under and just over each limit in both modes, and confirm the first succeed unchanged and the second are rejected with an explicit size error before any code runs or is billed.",
    dep: ["invoke-api"]
  },
  "sync-and-async-modes": {
    s: "The two ways to call a function: wait for the result, or hand over an event and get an acknowledgment while the platform runs it later with retries.",
    d: "In synchronous mode the caller holds a connection, errors are returned directly and retries are the caller's job. In asynchronous mode the front door persists the event, acknowledges, and a dispatcher delivers it with platform-managed retries and failure destinations. The modes imply different guarantees: synchronous is at-most-once from the platform's view, asynchronous at-least-once. Choosing wrongly produces either lost events or callers blocked by work they did not need to wait for.",
    k: ["Synchronous for request-response vs. asynchronous for events: synchronous gives immediate errors, while asynchronous decouples load and gets managed retries but hides failures.", "Platform retries in async mode vs. caller retries: platform retries are consistent and free of caller logic, but mean handlers must be idempotent."],
    p: ["Calling a long job synchronously ties up the caller and times out at the first intermediary.", "Assuming an async acknowledgment means the work happened leads to silent loss when the function later fails."],
    v: "Call the same function in both modes with a handler that fails once, and confirm the synchronous caller receives the error while the asynchronous call is retried and succeeds with the same event identifier.",
    dep: ["invoke-api","async-event-queue","delivery-guarantees"]
  },
  "async-event-queue": {
    s: "The durable regional queue that holds accepted asynchronous events until a dispatcher can deliver them, with its own age limit and retry schedule.",
    d: "On an asynchronous call the front door writes the event to a replicated queue, partitioned by function, and acknowledges. Dispatchers pull events, subject to the function's concurrency, and invoke. Events wait in the queue when concurrency is saturated or the function is failing, up to a maximum age after which they go to failure handling. The design problem is fairness: a flood for one function must not delay events for others sharing the queue.",
    k: ["Per-function queues or partitions vs. one shared queue: isolation prevents head-of-line effects between tenants, but costs more partitions to manage.", "Persist before acknowledging vs. acknowledge from memory: persisting costs a few milliseconds, but a front-end crash cannot lose accepted events."],
    p: ["A function with its concurrency set to one builds hours of backlog, and events expire unrun.", "Events delivered after a long delay carry data that is no longer valid."],
    v: "Throttle a function to zero concurrency, send events, confirm they are held and not lost, restore capacity, and confirm all are delivered in the maximum age or sent to the failure destination.",
    dep: ["concurrency-controller","async-retry-schedule","regional-cells"]
  },
  "throttling-and-rate-limits": {
    s: "Limits on request rate and concurrent executions at account, function and caller levels, rejecting or delaying excess so that no tenant exhausts shared capacity.",
    d: "Token buckets or concurrency counters are held in a distributed rate-limit service, with each front-end server taking small local allowances to avoid a lookup per request. Excess synchronous requests receive a throttle error; asynchronous ones are queued. Limits exist at several levels: platform-wide burst, account and function. The difficulty is precision at low cost: perfectly accurate global counting would be a bottleneck, so counts are approximate and limits are enforced within a margin.",
    k: ["Local allowances with periodic sync vs. strict global counting: local allowances are fast, but let a small overshoot through when many servers act at once.", "Reject excess immediately vs. queue it: rejecting is honest and bounded, while queuing smooths bursts but adds invisible delay."],
    p: ["Clients that retry throttle errors without backoff keep the system throttled.", "One function consuming the account's concurrency starves every other function in the account."],
    v: "Exceed a function's limit with a burst and confirm the excess receives a distinct throttle error and a metric increments, while other functions in the same account keep running normally.",
    dep: ["quota-service","concurrency-controller"]
  },
  "response-streaming": {
    s: "Sending the function's result to the caller in chunks as it is produced, rather than buffering the whole response, to reduce time to first byte and exceed buffered size limits.",
    d: "The runtime writes to a response stream instead of returning one value. The worker agent forwards chunks over the host connection to the front door, which relays them to the client with chunked transfer. Streaming lets large or incremental results, such as generated text or file contents, begin arriving early. It changes billing and failure semantics: the status line and headers are sent first, so a failure mid-stream can only truncate the body, and the function runs, and is billed, for as long as the client keeps reading.",
    k: ["Stream chunks vs. buffer and return once: streaming gives early bytes and large bodies, but errors can no longer change the status code.", "Backpressure from the slow client vs. buffering in the platform: honoring backpressure bounds memory, but holds the sandbox open for a slow reader."],
    p: ["A mid-stream error leaves the client with a truncated body that looks like a successful response.", "A slow or stalled client keeps the function running and billing until timeout."],
    v: "Stream a response of 100 MB with a delay between chunks, and confirm the first byte arrives well before completion, the full body arrives intact, and an injected mid-stream failure is reported to the client as a broken stream.",
    dep: ["invoke-api","runtime-api","invocation-timeouts"]
  },
  "function-metadata-store": {
    s: "The durable database of record for functions, versions, aliases, configuration and event source mappings, owned by the control plane and read only indirectly by the hot path.",
    d: "A replicated database holds one record per function and version with its digest, settings, role, aliases and triggers. Writes come from the management API and deploy workflows; reads are served to the routing layer through change streams or periodic snapshots rather than by queries per invocation. Strong consistency is used for writes, to prevent two conflicting updates, and eventual propagation for reads. Its availability should not bound invocation availability, which is why the hot path keeps copies.",
    k: ["Strongly consistent writes with eventually consistent propagated reads vs. one consistency level: it keeps management safe and the hot path fast, but changes appear after a delay.", "Control plane separate from data plane vs. shared database: separation keeps invocations running through control-plane outages, at the cost of replication machinery."],
    p: ["A schema migration on the metadata database blocks deploys fleet-wide for the migration's duration.", "The hot path continues using a deleted function's cached record for a window after deletion."],
    v: "Make the metadata store unavailable in a test cell, then confirm existing functions still invoke normally from cached routing data while create and update calls fail with a clear error.",
    dep: ["routing-table"]
  },
  "deploy-orchestrator": {
    s: "The workflow that turns an upload or configuration change into a live version: validate, store, create version, update aliases, and propagate to the hot path.",
    d: "A deploy is a multi-step workflow with each step idempotent and resumable: accept the package, run validation, copy to the store, write version metadata, update the alias, and wait for propagation. It handles concurrent updates with conditional writes. For provisioned concurrency it also pre-creates sandboxes before shifting traffic. Failures leave half-finished state unless each step can be re-run or rolled back, which is why the workflow stores its progress durably rather than running as one long request.",
    k: ["Durable multi-step workflow vs. one synchronous transaction: workflows survive crashes and long steps, but expose intermediate states to observers.", "Mark a version active only after propagation vs. immediately: waiting avoids routing to a version no host can fetch yet, but lengthens deploy time."],
    p: ["Two deploys to the same function racing leave the alias pointing at the older of the two.", "A deploy that fails after the alias update leaves an active version whose provisioned sandboxes were never created."],
    v: "Kill the orchestrator mid-deploy at each step in a test, and confirm on restart that the deploy completes or rolls back, with exactly one version created and the alias consistent with the metadata.",
    dep: ["function-metadata-store","package-validation","package-store","routing-table"]
  },
  "version-resolver": {
    s: "Maps what the caller named, such as an alias, a version or the latest, to a concrete version and code digest at invocation time.",
    d: "On each request the front door looks up the function's entry in its cached routing table, follows the alias to one or two versions, applies traffic weights, and produces a version, code digest, settings and role reference. The result keys placement, since warm sandboxes are version-specific. Resolution has to be deterministic given a snapshot and cheap, because it runs for every request. Staleness is the main risk, bounded by how quickly alias changes propagate.",
    k: ["Resolve per request vs. pin at trigger creation: per-request resolution follows alias changes immediately, while pinning avoids surprises but needs reconfiguration for each release.", "Weighted choice at the front door vs. at the worker: the front door knows all weights, while a worker would need per-version state."],
    p: ["A trigger configured with the unpublished head runs whatever was last uploaded, including half-tested code.", "Cache lag lets some requests resolve to a version after the alias has moved."],
    v: "Move an alias and send continuous traffic, then check the invocation records to confirm every request after the stated propagation delay reports the new version and none report an unresolved or deleted one.",
    dep: ["routing-table","immutable-versions"]
  },
  "routing-table": {
    s: "A compact, replicated snapshot of function and alias data held in the memory of front-end servers so each invocation can be routed with no remote lookup.",
    d: "The control plane publishes changes, as a full snapshot plus deltas, to every front-end server in the cell. Servers hold the data in a read-optimized structure keyed by function. The table also carries limits, roles and event mapping settings. A server that cannot refresh keeps serving the last copy and reports its age. The design challenge is bounding staleness while keeping the table small enough to fit in memory for millions of functions, and rebuilding quickly when a server starts.",
    k: ["Push deltas vs. pull periodic snapshots: deltas propagate in seconds, but need ordering and recovery logic, while snapshots are simple and slower.", "Serve stale on failure vs. refuse: serving stale keeps invocations alive through an outage, but may use a deleted or changed function."],
    p: ["A server that missed a delta never learns of a deletion until the next full snapshot.", "Table growth with new functions slowly raises start-up time for new front-end servers until it exceeds their health check."],
    v: "Update an alias, then poll all front-end servers' reported table versions and confirm each reaches the new version within the stated bound, and a server cut off from the control plane serves and reports a stale age.",
    dep: ["function-metadata-store"]
  },
  "quota-service": {
    s: "Holds and enforces per-account limits such as function count, storage, concurrency and rate, with an approval path to raise them.",
    d: "Quotas are numbers per account and region, with defaults and overrides. The management path checks counts and sizes before accepting a change; the invocation path consumes cached concurrency and rate limits derived from them. Raising a limit is a controlled process because capacity must exist to back it, and low default limits protect new accounts from accidents and abuse. The difficulty is keeping distributed counters close to true values without a central bottleneck.",
    k: ["Low default limits with request-based increases vs. generous defaults: low limits cap damage from runaway loops and abuse, but surprise legitimate burst workloads.", "Hard limits vs. soft limits with alerts: hard limits protect capacity, while soft limits avoid outages but allow overuse."],
    p: ["A new project launches at a scale above the default limit and discovers the throttle during a campaign.", "Quota for one region is assumed to apply in another, but each is separate."],
    v: "Set a function-count quota of ten in a test account, create eleven functions, and confirm the eleventh is rejected with a quota error naming the limit, while existing functions continue to run.",
    dep: ["function-metadata-store","regional-cells"]
  },
});
