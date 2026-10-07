// Details for the serverless platform plate, part 3: placement and scaling, retries and failures, the worker host agent.
ATLAS.details("serverless-platform", {
  "placement-scheduler": {
    s: "Chooses where each invocation runs: an idle warm sandbox if one exists, otherwise a host with room to create one. It runs on the hot path and must decide in about a millisecond.",
    d: "For an incoming request the scheduler checks an in-memory index of warm sandboxes for the resolved version and takes one, usually the most recently used. If none is free it picks a host with enough memory, favoring hosts that already hold the code, and sends a create request. Decisions rely on approximate, slightly stale host state to avoid per-request coordination. The hard problem is balancing three goals at once: low latency, high packing to cut cost, and spread across hosts and zones to limit damage from a failure.",
    k: ["Most-recently-used reuse vs. round robin: reuse keeps few sandboxes hot and lets idle ones expire, but concentrates load and heats those hosts.", "Decentralized placement from cached state vs. a central scheduler: decentralized scales and survives failures, but occasionally overcommits a host and must retry elsewhere."],
    p: ["Stale capacity data sends a burst to one host, which then rejects creations and adds latency.", "Packing to maximize utilization leaves no headroom when a zone fails and its load must move."],
    v: "Replay a recorded traffic trace through the scheduler in a test cell and confirm warm hit rate, p99 placement latency, and host memory utilization meet targets, with no host above its commit limit.",
    dep: ["host-capacity-tracking","warm-pool-manager","routing-table"]
  },
  "host-capacity-tracking": {
    s: "Keeps an approximate, frequently refreshed record of free memory, CPU and sandbox counts on every host so the scheduler can place work without asking each host.",
    d: "Host agents report resource use and sandbox inventory at short intervals, and the platform aggregates it per cell into an index. Placement reads the index locally; creation requests are validated by the host, which has the true figure and can refuse. Hosts commit memory at a ratio that allows some overcommit because sandboxes rarely use their full limit. Reports can lag or be lost, so the tracker also infers capacity from the placements it has made, and must reconcile the two views.",
    k: ["Overcommit memory based on typical use vs. strict reservation: overcommit improves packing and cuts cost, but a coincident spike causes out-of-memory kills.", "Host-authoritative admission vs. scheduler-authoritative: host admission is always correct and costs a rejected request now and then."],
    p: ["A host agent that stops reporting still looks to have free capacity and receives placements it cannot serve.", "Overcommit tuned on average usage fails during a correlated event, such as a retry storm."],
    v: "Fill a test host to its commit limit and confirm further creations are routed elsewhere, and kill the host's agent and confirm the tracker removes it from placement after the stated timeout.",
    dep: ["host-agent","regional-cells"]
  },
  "warm-pool-manager": {
    s: "Maintains the sandboxes that are ready or idle, deciding how many to hold per function and when to evict them, balancing start-up latency against wasted memory.",
    d: "The manager tracks idle sandboxes per version and host, with last use times. Policies keep recently used ones for some minutes, scale the pool from observed concurrency peaks, and evict on host memory pressure or version retirement. It also maintains pre-created generic sandboxes that can be specialized to a function quickly. The core tension is cost: every idle sandbox consumes memory that the platform does not bill, so the pool is a direct cost of lower latency.",
    k: ["Keep sandboxes warm for a fixed idle time vs. adaptive prediction: fixed time is predictable and simple, but wastes memory on rarely used functions and misses periodic ones.", "Pool of specialized sandboxes vs. generic pre-booted ones: specialized ones start instantly for known functions, while generic ones serve any function but need a load step."],
    p: ["An aggressive eviction policy makes a function with traffic every few minutes cold on every call.", "Pools sized for peak waste capacity overnight and inflate the platform's cost."],
    v: "Send steady traffic with periodic gaps and chart warm hit rate by gap length. Confirm it matches the policy: hits for gaps under the idle limit and cold starts beyond it.",
    dep: ["keep-alive-policy","warm-sandbox-reuse","host-capacity-tracking"]
  },
  "scale-from-zero": {
    s: "Creating the first sandboxes for a function with none running, and then adding more as demand grows, with no instance count configured by the owner.",
    d: "When a request finds no free sandbox, the scheduler creates one and the request waits through the cold start. Concurrent arrivals each need their own sandbox, since a sandbox handles one request at a time, so a burst of 1,000 requests asks for 1,000 sandboxes. Scaling rates are limited per account to protect hosts and downstream systems, so a spike beyond the burst rate queues or throttles. Scaling back to zero happens by idle expiry, which frees all memory and cost.",
    k: ["One request per sandbox vs. multiple concurrent requests per sandbox: one at a time gives isolation and simple code, but multiplies sandboxes and cold starts for bursts.", "Fast initial burst plus a slower sustained rate vs. a flat rate: a burst allowance handles spikes, but caps how quickly truly huge surges can be absorbed."],
    p: ["A sudden launch hits the account's burst limit and gets throttled just when demand peaks.", "Every sandbox created concurrently opens its own database connection, overwhelming the database."],
    v: "Send an instantaneous burst of 500 concurrent requests to an idle function, and confirm sandbox creation reaches the documented burst rate, requests wait or are throttled as specified, and all cold starts are visible in records.",
    dep: ["placement-scheduler","cold-start-path","concurrency-controller"]
  },
  "concurrency-controller": {
    s: "Counts how many executions of each function are in flight and enforces the account and function limits that decide when new invocations are admitted, delayed or rejected.",
    d: "Each admitted invocation takes a slot from a counter for its function and account, returned at completion. Because many front-end servers share the counters, they borrow small blocks of slots and return the unused ones. Concurrency is the platform's scaling unit, approximated by rate times average duration, so slow downstream calls directly raise it. The difficulty is leakage: crashed hosts and lost completions must have their slots reclaimed by timeout so counts do not drift upward.",
    k: ["Block leasing of slots vs. a counter updated per request: leasing avoids a hot central counter, but can leave slots stranded on idle servers.", "Enforce at admission vs. at sandbox creation: admission gives exact limits, while creation-time enforcement is cheaper and allows brief overshoot."],
    p: ["A slow dependency doubles duration and so doubles concurrency, hitting the limit and throttling unrelated requests.", "Leaked slots from crashed hosts slowly reduce effective capacity until a reconcile job runs."],
    v: "Set a limit of 50, run 200 concurrent long calls, and confirm exactly 50 run at once with the rest throttled or queued, and that after hosts are killed in the test the counter returns to zero.",
    dep: ["quota-service","host-agent"]
  },
  "reserved-concurrency": {
    s: "A per-function allocation carved out of the account's concurrency, which both guarantees capacity for that function and caps it, protecting it from, and protecting others from, its traffic.",
    d: "An owner sets a number; the platform subtracts it from the pool available to all other functions in the account and enforces it as the function's maximum. Setting it to zero effectively disables the function, a useful emergency stop. It does not keep sandboxes warm; it only reserves permission to run. Used as a cap, it protects a downstream database from too many parallel callers. The risk is that the cap becomes the cause of throttling when traffic outgrows what was set.",
    k: ["Reserve a share for critical functions vs. share a pool: reserving guarantees headroom, but removes that capacity from everyone else even when unused.", "Cap as a downstream protection vs. downstream rate limiting: a cap is simple and local, but limits concurrency rather than request rate."],
    p: ["A cap set to protect a database throttles users during a normal traffic peak.", "Reservations across functions add up to nearly the whole account limit, leaving too little for new ones."],
    v: "Reserve 10 for one function, then flood another function in the account and confirm it never exceeds the remainder, while the reserved function reaches 10 concurrent runs and no more.",
    dep: ["concurrency-controller","quota-service"]
  },
  "provisioned-concurrency": {
    s: "A paid setting that keeps a fixed number of initialized sandboxes ready for a version or alias, so those requests avoid cold starts.",
    d: "The owner sets a number for an alias; the platform creates that many sandboxes, runs their init phase, and holds them until removed. Requests up to that number get the warm path at consistent latency, and requests beyond spill to on-demand sandboxes that can cold start. Capacity is billed for the time held whether or not used. Updates must be staged: the new version's sandboxes are created and ready before traffic shifts, and the old ones are released after.",
    k: ["Provisioned sandboxes vs. relying on keep-alive: provisioned gives predictable latency, but you pay for idle time and must size it to traffic.", "Scale provisioned count on a schedule vs. fixed: scheduling follows known daily patterns and cuts cost, but misses unexpected spikes."],
    p: ["A rollout that shifts traffic before the new version's provisioned sandboxes are ready causes a visible cold start spike.", "Provisioned count set below peak leaves the peak, and the users in it, on the cold path."],
    v: "Provision 20, send 20 concurrent requests and confirm none report an init duration. Send 30 and confirm exactly the extra ones show cold starts in their invocation records.",
    dep: ["warm-pool-manager","aliases-and-traffic-shifting","init-phase"]
  },
  "autoscaling-signals": {
    s: "The measurements the platform uses to decide how much capacity to create or release: queue depth, concurrency, request rate, utilization and recent history.",
    d: "Per-function scaling reacts to demand directly because a request that finds no sandbox creates one. Fleet-level scaling uses aggregate signals, such as committed memory per cell and rate of cold creations, to add hosts ahead of need, since hosts take minutes to prepare. Poller scaling uses queue backlog and age. Predictive models can pre-warm for cyclic traffic. The challenge is that these loops operate at different time scales and can interact: a burst of sandbox creation is a signal to the fleet loop long after it is over.",
    k: ["Reactive scaling vs. predictive: reactive is simple and correct for any pattern, but always lags a surge, while prediction anticipates cycles and fails on novelty.", "Scale fleet on committed memory vs. on actual use: committed memory is safe and avoids surprise, but runs hotter in cost terms."],
    p: ["A fleet autoscaler tuned on average load adds hosts only after the burst that needed them has finished.", "Queue depth alone scales pollers up for a backlog that downstream systems cannot absorb."],
    v: "Ramp synthetic load by tenfold over a minute and plot demand, sandboxes created and fleet capacity. Confirm capacity leads or meets demand with no sustained throttling and falls back within the stated time after the load stops.",
    dep: ["host-capacity-tracking","queue-pollers","regional-cells"]
  },
  "invocation-timeouts": {
    s: "A maximum execution time for each invocation, set per function up to a platform limit, after which the platform ends the execution and reports a timeout.",
    d: "The worker agent starts a deadline timer when the event is delivered, and exposes the remaining time to code. At expiry it terminates the process or sandbox, records a timeout, and returns an error or triggers retry handling. Timeouts bound cost and stop runaway code, and also bound how long a held connection or queue message is in flight, so they must nest inside caller timeouts, visibility timeouts and gateway limits. Inner deadlines should be shorter than outer ones, or the outer layer gives up and retries while the inner work continues.",
    k: ["Short timeouts vs. long: short ones fail fast and cap cost, but cut off legitimately slow work, while long ones hide hangs.", "Kill the whole sandbox on timeout vs. only the request: killing the sandbox is clean, but discards its warm state and may break the next request."],
    p: ["Gateway timeout shorter than the function timeout leaves the function running and billed after the client has left.", "Work interrupted at timeout leaves partially written state, with no cleanup code run."],
    v: "Set a 3-second timeout with a handler that sleeps 10 seconds, and confirm the record shows a timeout at about 3 seconds, billed duration of 3 seconds, and the sandbox is replaced for the next request.",
    dep: ["host-agent","runtime-api"]
  },
  "retry-policy": {
    s: "The rules for repeating failed invocations: how many attempts, how long between them, which failures qualify, and who is responsible for retrying in each invocation mode.",
    d: "Synchronous calls are not retried by the platform, so the caller decides. Pollers retry a failed batch until success or expiry, and asynchronous events follow a platform schedule. Retries use backoff with jitter to avoid synchronized storms. The policy separates retryable failures, such as throttles and transient errors, from permanent ones, such as invalid input. What makes it hard is amplification: layers of retries multiply, so three layers of three attempts each can send nine calls for one failure into an already struggling dependency.",
    k: ["Retry at one layer only vs. at every layer: one layer keeps load predictable, but needs that layer to see the right failure signal.", "Fixed attempts vs. retry until expiry: fixed attempts bound cost and load, while expiry-based retries maximize eventual success at the risk of long backlogs."],
    p: ["Retries nested through gateway, function and SDK multiply load against a failing dependency.", "A permanent error, such as a bad payload, is retried for hours when it could never succeed."],
    v: "Fail a downstream dependency for two minutes while sending traffic and confirm total calls to it stay within the expected multiple of the original, with backoff intervals growing and jittered rather than aligned.",
    dep: ["invocation-timeouts","async-retry-schedule","delivery-guarantees"]
  },
  "async-retry-schedule": {
    s: "The fixed pattern the platform follows for events that fail in asynchronous mode: a few delayed attempts, with a maximum event age, before the event goes to failure handling.",
    d: "On failure the dispatcher requeues the event with a delay, for example one minute for the first retry and longer for the second, up to a configured number of attempts and until the event reaches its maximum age. Throttled events are retried with a separate, longer-lived schedule since throttling is not the function's fault. Once the attempts or age are exhausted the event is passed to the dead-letter queue or failure destination. Owners can tune attempts and age to fit how stale a result may be.",
    k: ["Few attempts, short age vs. many attempts, long age: short settings limit stale work and cost, but lose events during a lengthy outage.", "Separate treatment for throttles vs. one schedule: separating avoids burning attempts on capacity shortages, but adds a second timer to reason about."],
    p: ["Setting attempts to zero without a failure destination silently discards every failed event.", "A long maximum age replays hours-old events after an outage, writing stale data over newer data."],
    v: "Make a function fail three times, then succeed, and confirm the delivery timestamps follow the configured delays and the event is delivered to the failure destination after attempts are exhausted when it never succeeds.",
    dep: ["async-event-queue","retry-policy","failure-destinations"]
  },
  "dead-letter-queues": {
    s: "A queue or topic that receives events and messages that could not be processed after the allowed attempts, keeping them for inspection and replay instead of discarding them.",
    d: "When retries are exhausted, the platform or the source queue moves the event, with metadata about the error and attempt count, to a designated queue. Operators examine, fix and redrive them back to the source. Queue-based sources usually define the dead-letter policy on the queue itself, counting receives; asynchronous function calls define it on the function. The value depends on the follow-up: a dead-letter queue nobody watches is a slower way to lose data.",
    k: ["Dead-letter every failure vs. drop known-bad events: parking everything preserves data and audit trail, but fills storage with irreparable noise.", "Redrive back to the source vs. a separate repair flow: redrive is simple, but reprocesses poison events that fail again until the code is fixed."],
    p: ["No alarm on queue depth means failed events sit unnoticed until retention deletes them.", "Redriving before the underlying bug is fixed cycles the same events through failure again."],
    v: "Send a poison message, confirm it lands in the dead-letter queue with error metadata after the configured attempts, fix the handler, redrive it, and confirm it is processed once and removed from the dead-letter queue.",
    dep: ["retry-policy","failure-destinations"]
  },
  "failure-destinations": {
    s: "Configurable targets, such as a queue, topic, event bus or another function, to which the platform sends the outcome of asynchronous invocations, including the original event and error context.",
    d: "Compared with a plain dead-letter queue, destinations carry richer records: the request, the response or error, and attempt details. They can be set separately for success and failure. A failure destination can start remediation automatically, for example by invoking a repair function. The platform delivers records with its own at-least-once guarantee. Trouble arises with chains: a destination that is itself a function can fail and need its own handling, so chains must end somewhere durable.",
    k: ["Rich destination records vs. raw dead letters: destination records ease diagnosis and automation, but contain payloads that may include sensitive data in another store.", "Destinations on success as well as failure: success events enable simple choreography, but double the delivery volume."],
    p: ["A destination function that fails has no failure handling of its own, so the original error context is lost.", "Failure records containing full payloads copy personal data into a less protected queue."],
    v: "Configure a failure destination, trigger an exhausted-retry event, and confirm the destination receives a record with the original payload, the error message, the attempt count and the request identifier.",
    dep: ["async-event-queue","event-bus-rules"]
  },
  "idempotency": {
    s: "Designing handlers so that running the same event more than once has the same effect as running it once, which is required because the platform's delivery is at least once.",
    d: "Duplicates arise from retries, redelivery after visibility timeout and client resubmission. A handler becomes idempotent by deriving a stable key from the event, such as a message or request identifier, and recording it with the result in a store using a conditional write, then skipping repeated keys. Effects on external systems need the same key passed along. The hard part is the window between performing an effect and recording the key: a crash in the gap yields a repeat, which is why recording and effect should be one transaction where possible.",
    k: ["Idempotency key store vs. naturally idempotent operations: a key store works for any effect, but adds a write to the hot path; naturally idempotent operations, such as set-to-value, need no store.", "Record key before vs. after the effect: recording before prevents repeats but can lose the effect on a crash, while recording after can repeat it."],
    p: ["Keys with no expiry grow the table without bound, while keys that expire too early allow late duplicates through.", "Using timestamps instead of event identifiers as keys treats a retry as a new event."],
    v: "Deliver the same event identifier five times, concurrently and in sequence, and confirm the external effect, such as a payment or row, happens exactly once and later calls return the stored result.",
    dep: ["external-state-stores","delivery-guarantees"]
  },
  "partial-batch-failures": {
    s: "A way for a handler to report which records in a batch failed so that only those are retried, rather than the whole batch.",
    d: "Without it, one bad record fails the whole batch, and every record is redelivered, including those already processed, which creates duplicates and wasted work. With partial reporting, the handler returns a list of failed record identifiers; the poller deletes the rest or advances the checkpoint to just before the first failure for ordered streams. The poller must handle handlers that return nothing, malformed lists or identifiers that do not exist. It requires the handler to track each record's result, which is a design obligation.",
    k: ["Report failed identifiers vs. throw for the whole batch: partial reporting avoids redoing successes, but needs per-record bookkeeping in the handler.", "Bisect the batch on failure vs. explicit reporting: bisection needs no handler change, but costs extra invocations to isolate the bad record."],
    p: ["Returning an empty failure list on an internal error tells the poller everything succeeded, deleting unprocessed records.", "For ordered streams a failure at position three still blocks positions four onward."],
    v: "Send a batch of ten with record four failing, and confirm only record four is redelivered while the other nine are processed once and removed from the source.",
    dep: ["queue-pollers","stream-shard-pollers","idempotency"]
  },
  "host-agent": {
    s: "The privileged daemon on every worker host that creates and destroys sandboxes, fetches code, delivers events to runtimes, and reports usage and health to the control plane.",
    d: "The agent receives create, invoke and release commands from the scheduler and front door. It prepares each sandbox: file system from package or image, network, resource limits, then starts the runtime. It proxies events, enforces deadlines, collects output, measures resource use and sends records to metering and log pipelines. It must stay small and robust, since a bug in it affects every tenant on the host, and fast, since its work is on every cold start. It is the host's only trusted component that talks to customer code.",
    k: ["Single agent per host vs. one per sandbox: one agent amortizes cost across many sandboxes, but its failure takes down all of them.", "Agent in a minimal language and process vs. a rich runtime: minimal reduces attack surface and memory, but limits what can be done in the agent itself."],
    p: ["An agent memory leak on a long-lived host gradually raises host overhead and causes placement failures.", "An agent crash orphans running sandboxes that are still billed or still holding capacity."],
    v: "Kill the agent on a test host with sandboxes running, and confirm it restarts, reconciles with its sandbox inventory, reports orphaned ones for cleanup, and the scheduler stops placing on that host until it recovers.",
    dep: ["hypervisor-layer","host-os-minimal","sandbox-lifecycle"]
  },
  "invocation-router": {
    s: "Inside the host, hands each incoming event to the correct sandbox's runtime and carries its result, status and timing back to the front door.",
    d: "The router maps a request to a sandbox by identifier. It writes the event onto the sandbox's local channel, such as a virtual socket or loopback port, waits for the runtime's response, and measures start and end. It enforces that a sandbox processes one event at a time, and it maintains a connection back to the front door for the result. Failures need distinct signals: a runtime error returned by the handler, a crash of the process, a timeout, and loss of the host itself each map to different outcomes for retry logic.",
    k: ["One event at a time per sandbox vs. multiplexed: one at a time keeps handlers simple and isolated, but needs more sandboxes under load.", "Persistent connection to each sandbox vs. per-event connection: persistent connections cut overhead, but need health checks to detect stale ones."],
    p: ["A sandbox that dies between routing and response gives an ambiguous outcome: it is unclear whether the handler's side effects occurred.", "A stale connection to a recycled sandbox sends an event into a void."],
    v: "Kill the sandbox's process mid-request and confirm the caller receives a runtime-crash error distinct from a handler error and a timeout, and the sandbox is not reused.",
    dep: ["host-agent","runtime-api","sandbox-lifecycle"]
  },
  "code-fetch-and-cache": {
    s: "Downloads a function's package or image blocks to the host on first use and keeps them in local caches so later sandboxes for the same version start without a network fetch.",
    d: "At sandbox creation the agent checks local storage for the code digest. On a miss it reads from a rack or regional cache, then the package store, verifies the digest, and unpacks or mounts it. Common bases and runtimes are pre-installed on hosts. Caches are limited in size and evicted by recency and cost. Fetch time is a direct part of cold start, which makes cache hit rate one of the most important numbers in the platform.",
    k: ["Fetch whole package at start vs. fetch blocks on demand: whole fetch is simple and caches fully, while on-demand starts faster for large packages but makes later reads slower.", "Pre-install common runtimes on every host vs. fetch when needed: pre-install removes a fetch from the start path, at the cost of host disk and rollout work."],
    p: ["A cache that evicts before reuse makes rare-but-large functions pay a full download on every cold start.", "A corrupted cached object that is not verified runs wrong code silently."],
    v: "Start a sandbox on a host with an empty cache and again on a warmed one, and confirm the second skips the fetch with a much shorter start, and tampering with the cached file is detected by digest check.",
    dep: ["package-store","host-os-minimal"]
  },
  "sandbox-lifecycle": {
    s: "The states a sandbox moves through, from creation and initialization to idle, busy, frozen and destroyed, along with the rules for when each transition happens.",
    d: "A sandbox is created with its file system, network and limits, runs the runtime's init, and then serves invocations one at a time. Between them it is idle or frozen. It is destroyed by idle expiry, a crash, a timeout, a version retirement, host draining or a maximum lifetime that forces periodic replacement for security and hygiene. The state machine must handle concurrent events, such as a request arriving as expiry starts, and must clean up everything: processes, memory, mounts, network entries and temporary files.",
    k: ["Maximum sandbox lifetime vs. unlimited reuse: a lifetime limit contains leaks and security risks and picks up patches, but forces regular cold starts.", "Destroy on any error vs. recycle after recoverable errors: destroying is safe and clean, while recycling saves cold starts but risks carrying corrupted state."],
    p: ["Race between idle expiry and a new request destroys a sandbox just after routing to it.", "Incomplete cleanup leaves mounts or processes that leak between tenants or exhaust the host."],
    v: "Drive a sandbox through every transition in a test, including simultaneous request and expiry, and verify after destroy that no process, mount, network device or temporary file from it remains on the host.",
    dep: ["host-agent","micro-vm-sandbox","resource-limits"]
  },
  "runtime-api": {
    s: "The small interface between the platform and the language runtime inside the sandbox, through which the runtime asks for the next event and posts its result, error or response stream.",
    d: "Commonly an HTTP interface on a local address: the runtime loops, fetching the next invocation with its identifier, deadline and trace context, calls the handler, and posts the response or error. Extensions and custom runtimes use the same protocol, which lets any language or a container image participate. The interface separates the platform from the language implementation. Its design affects latency per call, since it is on every invocation, and defines what happens when a handler errors, hangs or crashes.",
    k: ["Pull model (runtime asks for next event) vs. platform pushes: pull makes backpressure and one-at-a-time natural and works for any language, but needs a blocked request waiting.", "Standard open protocol vs. language-specific SDK: an open protocol supports custom runtimes, but moves protocol correctness to each implementer."],
    p: ["A custom runtime that posts a result twice or never leaves the sandbox in an undefined state.", "Handlers that start background work after returning have it frozen and resumed unpredictably."],
    v: "Write a minimal runtime that only speaks this interface, deploy it, and confirm it receives the event with its deadline and trace context and that its posted error is returned to the caller with the right format.",
    dep: ["invocation-router","init-phase"]
  },
  "init-phase": {
    s: "The one-time setup at sandbox start: loading the runtime, importing code, running top-level initialization, and initializing extensions, before the first event is delivered.",
    d: "After the file system is ready the runtime starts, loads the handler module and runs its top-level code, which usually creates clients, loads models or reads configuration. Extensions initialize in parallel. Platforms apply a limit on init time and often bill for it. Work done here is paid once per sandbox rather than per event, so it is where expensive objects belong, but it is also what dominates cold start time. The difficulty is knowing which work is safe to reuse across requests and which is per request.",
    k: ["Initialize eagerly at start vs. lazily on first use: eager init keeps request latency flat after the first, while lazy init makes the cold start shorter but surprises the first user of a path.", "Heavy work in init vs. in a snapshot: init is simple but slow, while snapshots store its result but constrain what state can be captured."],
    p: ["An init that opens connections or reads time-sensitive data reuses stale values across requests.", "Init that exceeds the time limit repeats on every attempt, so the function never becomes healthy."],
    v: "Add timing around top-level code, deploy, invoke cold and warm, and confirm the init duration in the record accounts for the measured top-level work and does not recur on warm calls.",
    dep: ["runtime-api","cold-start-path"]
  },
  "freeze-and-thaw": {
    s: "Suspending a sandbox's processes between invocations, so an idle sandbox uses no CPU, and resuming them when the next event arrives.",
    d: "After a response is sent, the platform stops scheduling the sandbox's processes, preserving memory but not running anything, and thaws it when the next event is delivered. This makes warm reuse cheap and lets billing cover only execution time. The side effects are visible to code: timers and background threads do not run while frozen, outbound connections may time out on the far side, and wall-clock jumps forward. Work meant to continue after the response must finish before it, or be done by an extension.",
    k: ["Freeze between requests vs. keep running: freezing saves CPU and fits per-duration billing, but breaks background tasks and long-lived connections.", "Freeze the entire sandbox vs. only the handler: whole-sandbox freeze is simple and secure, but also pauses helper processes that might have useful work."],
    p: ["A background flush of logs or metrics scheduled after the response never runs until the next invocation.", "Pooled connections silently die while frozen, and the first query after thaw fails."],
    v: "Start a background timer that logs every second, invoke twice with a 10-second gap, and confirm the log shows no ticks during the gap and resumes on the second call.",
    dep: ["sandbox-lifecycle","warm-sandbox-reuse"]
  },
});
