// Details for the durable workflow plate, part 1: clients, operations, programming model.
ATLAS.details("durable-workflows", {
  "client-sdk": {
    s: "The library applications use to start workflows, send signals, run queries and wait for results, wrapping the service API with serialization, retries and deadlines.",
    d: "The client turns a typed call into a request carrying the namespace, workflow ID, workflow type, task queue, serialized input and a request identifier. It retries transient transport errors, applies interceptors for tracing and authentication headers, and exposes a handle for later calls. Waiting for a result is a long poll on the workflow's close event, not a held connection. The difficulty is that the client sits outside the determinism boundary: it may be called from anywhere, so every call must be safe to repeat.",
    k: ["Thin client over a raw API vs rich client with built-in retries: rich clients hide transient failures but can silently repeat a start request unless a stable request ID is generated up front.", "Long-poll for result vs callback on completion: polling needs no inbound connectivity but adds latency and load for very long workflows."],
    p: ["Generating a new request ID on every retry defeats deduplication and starts duplicate workflows.", "Waiting on a result with no deadline ties a caller's thread to a workflow that may run for months."],
    v: "Start a workflow with a fixed request ID, kill the client between send and response, retry from a fresh process, and confirm exactly one execution exists with the same run ID returned both times.",
    dep: ["start-workflow-request", "frontend-service", "payload-and-data-converters"]
  },
  "start-workflow-request": {
    s: "The call that creates an execution: namespace, workflow ID, type, task queue, input, timeouts, retry policy and a request ID that makes the call safe to repeat.",
    d: "The frontend validates the request, resolves the namespace, hashes the workflow ID to a shard and forwards it to the history service. There the first event, workflow-started, is appended along with the first workflow task. The response carries the run ID. If the ID is already in use, the conflict policy decides the outcome. The request ID is stored in mutable state so a retry after a lost response returns the original run instead of creating another. Hard parts are limits on input size and the window in which deduplication information is kept.",
    k: ["Server-side deduplication by request ID vs caller-supplied workflow ID alone: request IDs allow retried calls to return the same run, at the cost of storing recent IDs per execution.", "Starting synchronously vs through a queue: synchronous start gives an immediate durable answer but couples caller latency to the history shard."],
    p: ["Large inputs are stored in the first event and copied on every replay, inflating history and slowing every task.", "Omitting execution timeouts leaves a workflow that can never be reclaimed if its code is lost."],
    v: "Send the same start request twice concurrently with one request ID and confirm one workflow-started event exists and both callers received identical run IDs.",
    dep: ["workflow-id-and-run-id", "request-deduplication", "request-routing", "transactional-append"]
  },
  "workflow-id-and-run-id": {
    s: "Two identifiers for an execution: the workflow ID is the business key chosen by the caller and unique among open runs; the run ID identifies one attempt of that key.",
    d: "A workflow ID such as an order number ties external events to the right execution. Each start, retry-chain link, cron cycle or continue-as-new creates a new run under the same workflow ID. The service guarantees at most one open run per ID in a namespace. Signals and queries address the ID and reach the latest run unless a run ID is given. The ID also determines the shard, so it must be well distributed. Meaningful IDs make deduplication natural but expose the engine to hot keys.",
    k: ["Caller-chosen business IDs vs generated opaque IDs: business IDs give free idempotency and easy lookup, but collisions and low entropy become the caller's problem.", "Run chain under one workflow ID vs fresh ID per run: a chain keeps signals routed to the logical entity, at the cost of more complex lookup of past runs."],
    p: ["Using a low-cardinality ID such as a tenant name sends all load to one shard.", "Reusing an ID after completion while expecting old signals to be dropped can deliver them to the new run."],
    v: "Start two workflows with the same ID in one namespace and confirm the second is rejected or attached per policy; list runs for the ID and confirm each run ID is distinct.",
    dep: ["history-shards", "consistent-hash-ring"]
  },
  "id-reuse-and-conflict-policy": {
    s: "Rules that decide what happens when a start request names an ID that is running or has finished: reject, reuse, terminate the old run, or attach to it.",
    d: "Two policies apply. The reuse policy covers closed runs: allow always, allow only after failure, or never. The conflict policy covers an open run: fail the start, terminate the existing run and begin a new one, or return the existing run. The check and the append happen in the same shard transaction, which is what makes the policy race free. Terminating a run to replace it loses in-flight work, so the choice is a business rule written as configuration.",
    k: ["Reject duplicates vs terminate and replace: rejecting is safe and visible, replacing gives last-writer-wins semantics but kills running activities mid-flight.", "Reuse allowed after failure only vs always: restricting reuse prevents accidental double execution of a succeeded task but forces new IDs for legitimate reruns."],
    p: ["Terminate-existing used for a deduplication shortcut destroys a healthy run whenever a client retries late.", "Closed-run reuse checks depend on retention; after deletion the same ID is silently allowed again."],
    v: "With reject policy, start a duplicate while the first runs and confirm an already-started error; with reuse-after-failure, complete one run successfully and confirm a restart of the same ID is refused.",
    dep: ["workflow-id-and-run-id", "transactional-append", "retention-and-deletion"]
  },
  "workflow-updates": {
    s: "A synchronous, validated, durable request to a running workflow that can change its state and return a value to the caller, unlike a signal, which returns nothing.",
    d: "An update is sent through the frontend to the history service, which routes it to the workflow as a special message delivered in a workflow task. The workflow runs an optional validator that can reject without writing history, then the handler. Accepted and completed outcomes are recorded as events, and the caller waits for the result. Because the handler is workflow code, it must be deterministic and replay identically. The hard part is delivery during task failures and when the workflow is closing.",
    k: ["Update vs signal plus query: updates give a single request-response with validation, but require the workflow to be running and add event types to history.", "Reject in validator without history vs record all attempts: rejecting early keeps history small, but leaves no audit trail of refused requests."],
    p: ["An update arriving as the workflow completes can return an error the caller must treat as unknown outcome.", "Long handlers block the caller's request until it times out while the work continues."],
    v: "Send an update that mutates workflow state, confirm the returned value matches the state, and replay the history in a test harness to confirm accepted and completed events reproduce the same handler result.",
    dep: ["signals", "event-history", "workflow-definition", "frontend-service"]
  },
  "cron-and-schedules": {
    s: "Mechanisms that start workflows on a calendar or interval: a legacy cron field on a workflow, or first-class schedule objects with overlap, catch-up and pause policies.",
    d: "A cron workflow chains runs: each run ends by starting the next. A schedule is a separate durable object, itself backed by a long-running workflow, that computes the next action times, starts workflows, and applies an overlap policy such as skip, buffer one, or cancel the previous. Missed times are filled according to a catch-up window. Time zones, daylight saving shifts and calendar edits make schedule arithmetic subtle, and starts must be idempotent so a recovered schedule does not double fire.",
    k: ["Cron chaining vs schedule objects: chaining is simple but hard to pause, backfill or inspect, while schedules add a managed resource with its own history.", "Catch up missed runs vs skip them: catch-up preserves completeness after outages but can create a burst that overloads downstream systems."],
    p: ["A run that takes longer than the interval with an allow-all overlap policy accumulates concurrent runs without bound.", "Evaluating local times across a daylight saving change fires twice or not at all."],
    v: "Create a schedule with a one-minute interval, pause the cluster for five minutes, resume, and confirm the catch-up window yields the expected number of started runs with distinct deterministic IDs.",
    dep: ["start-workflow-request", "durable-timers", "continue-as-new", "id-reuse-and-conflict-policy"]
  },
  "batch-operations": {
    s: "Bulk actions applied to every execution matching a query: signal, cancel, terminate, reset or delete, run as a tracked job rather than thousands of manual calls.",
    d: "An operator supplies a visibility query and an operation. A batch job, itself an execution, pages through matching workflow IDs and issues the action for each at a controlled rate, recording progress and failures. Because the selection comes from the eventually consistent visibility store, the set may miss recent starts or include already-closed runs. Each action must tolerate a target that has changed state since listing. Rate control and a dry-run listing are what make this safe on a shared cluster.",
    k: ["Query-selected targets vs explicit ID lists: queries are convenient but reflect index lag, whereas explicit lists are exact and verifiable but laborious to assemble.", "Throttled job vs fast fan-out: throttling protects shards and downstream systems but a large cleanup can take hours."],
    p: ["Running a terminate batch from a broad query with no preview kills unrelated production workflows.", "Resetting many runs at once re-executes their activities simultaneously and floods external systems."],
    v: "Run a batch signal over a query matching a known set of fifty test workflows, then confirm every one received exactly one signal event and the job reports fifty successes and zero failures.",
    dep: ["visibility-query-language", "signals", "reset-and-replay-tools", "quotas-and-rate-limits"]
  },
  "operator-cli-and-ui": {
    s: "The command-line tool and web console for inspecting namespaces, listing executions, reading histories, sending signals and performing administrative repairs.",
    d: "Both tools call the same public and administrative APIs as applications. The console renders an execution's event history as a timeline with decoded payloads, pending activities with retry state, and the worker identity last seen on each queue. Decoding payloads requires access to the data converters, usually through a codec endpoint, because the server stores only opaque bytes. Administrative commands such as shard inspection or task queue description reach internal services. Their risk is that powerful actions sit one keystroke from a bad query.",
    k: ["Decode payloads in the browser vs through a server codec: browser decoding keeps keys with the user, a shared codec endpoint is simpler but becomes a sensitive service.", "Single admin surface vs separate read-only and write tools: separation limits accidents but splits the operator experience."],
    p: ["Opaque binary payloads make incident debugging slow if no codec endpoint is configured.", "Admin commands that bypass namespace authorization let a mistaken ID alter another tenant's workflow."],
    v: "Open a failing workflow in the console and confirm the pending activity shows its attempt count, last failure message and next retry time, with payloads decoded through the configured codec.",
    dep: ["event-history", "authn-and-authz", "payload-and-data-converters", "frontend-service"]
  },
  "namespaces": {
    s: "The isolation boundary for workflows: each namespace has its own workflow ID space, retention period, search attributes, quotas and access rules.",
    d: "A namespace is a record in the registry holding retention, visibility and archival settings, cluster replication targets and a failover version. Every request names one, and the frontend resolves it before routing. Workflow IDs only collide within a namespace, so teams can choose names freely. Namespaces share the underlying shards, so isolation of resources is by quota rather than by physical separation. Creating many cheap namespaces is easy; dividing load fairly among them is the harder problem.",
    k: ["Namespace per team or environment vs one shared namespace: separate namespaces isolate IDs, retention and permissions, but multiply operational objects and split cross-team queries.", "Logical isolation on shared shards vs dedicated clusters: sharing is efficient, yet one tenant's hot workflow can still affect others without quotas."],
    p: ["Setting retention too short per namespace deletes histories that incident reviews still need.", "Search attributes registered in one namespace are not available in another, breaking portable queries."],
    v: "Create two namespaces, start a workflow with the same ID in each, and confirm both run independently, that queries in one never list the other, and that retention differs as configured.",
    dep: ["namespace-registry", "quotas-and-rate-limits", "authn-and-authz"]
  },
  "quotas-and-rate-limits": {
    s: "Limits on request rate, concurrent executions, history size and task throughput per namespace, so one tenant cannot starve the others.",
    d: "The frontend applies token buckets per namespace and per operation type; the history and matching services apply limits on task dispatch and on concurrent persistence calls. Hard limits cap history length and payload size, with a warning threshold before the cap. Rejected requests return a resource-exhausted error that clients retry with backoff. Dynamic configuration lets operators raise or lower limits live. Fairness is difficult because limits are enforced where load arrives, not where it is expensive.",
    k: ["Per-namespace limits vs global limits: per-namespace limits protect tenants from each other but leave aggregate overload possible, so a global cap is still needed.", "Reject quickly vs queue and delay: rejecting keeps latency bounded and pushes backoff to callers, queuing hides spikes but grows memory and delays everything."],
    p: ["Clients that retry immediately on resource-exhausted errors turn a brief overload into a sustained one.", "Limits tuned on average load fail under a synchronized burst, such as a schedule firing at midnight."],
    v: "Drive one namespace above its configured rate and confirm its calls receive resource-exhausted errors while latency for a second namespace on the same cluster stays within its baseline.",
    dep: ["dynamic-config", "frontend-service", "namespaces"]
  },
  "reset-and-replay-tools": {
    s: "Operator tools that move an execution back to an earlier point in its history and continue from there, or re-run its history through new code to reproduce a bug.",
    d: "A reset picks an event boundary, usually a workflow-task completion, creates a new history branch holding events up to that point, closes the old run as terminated and starts a new run that resumes from it. Activities after the reset point run again, and signals received later can be re-applied. It is the recovery path for bad deployments, stuck non-deterministic workflows and bad external data. The danger is that resetting re-executes side effects, so idempotency of activities becomes the safety property.",
    k: ["Reset to a past point vs patch live state: reset reuses the normal replay machinery and stays consistent, but repeats activities that already had effects.", "Re-apply signals after the reset point vs drop them: re-applying preserves intent but may replay a signal that triggered the original fault."],
    p: ["Resetting past a payment activity charges the customer again unless the activity is idempotent.", "Resetting a run that already continued as new targets the wrong run and appears to do nothing."],
    v: "Reset a failed workflow to the task before its failure after deploying a fix, and confirm a new run starts, shares history events before that point, and completes, while the old run shows as terminated by reset.",
    dep: ["history-branches", "deterministic-replay", "event-history", "transactional-append"]
  },
  "replay-testing": {
    s: "Running recorded production histories against a new build of workflow code to detect non-deterministic changes before any worker with that code is deployed.",
    d: "A replayer loads exported histories and feeds each one to the candidate workflow code in a test process with no service attached. At every step it compares the commands the code produces with the commands recorded in history; a mismatch is a non-determinism error. Running it in CI over a sample of long-running and recently closed histories catches accidental reordering, removed timers and changed activity types. Coverage is the weakness: only branches that real histories exercised are checked.",
    k: ["Replay sampled production histories vs hand-written fixtures: production histories cover real branches and payloads, but exporting them needs data handling care.", "Replay in CI vs on the worker at deploy time: CI blocks bad changes early, while deploy-time replay catches only what is already shipped."],
    p: ["A sample dominated by short, recent runs misses the branch that long-running workflows will take next month.", "Histories containing sensitive payloads copied to CI breach data-handling rules."],
    v: "Change a workflow to add an activity call before an existing timer, replay a history recorded with the old code, and confirm the replayer reports a non-determinism error at that event index.",
    dep: ["deterministic-replay", "history-export-and-archival", "workflow-versioning-patches", "event-history"]
  },
  "time-skipping-test-harness": {
    s: "An in-process test environment that runs workflows against a lightweight engine whose clock jumps forward when nothing else can progress, so day-long timers finish instantly.",
    d: "The harness embeds a minimal service and workers in the test process. While activities are running, time passes normally; when every workflow is blocked on a timer, the clock advances to the next timer. This lets tests cover multi-day flows with real workflow code and real activity stubs. It does not exercise sharding, persistence latency, or real contention, so it checks business logic and replay safety rather than scale. Tests also gain the ability to lock time to check timeouts deterministically.",
    k: ["Skip time automatically vs advance only by explicit calls: automatic skipping is convenient, but explicit control makes assertions about intermediate states reliable.", "Embedded engine vs a shared test cluster: embedded is fast and isolated, but behaves differently from the real service under load."],
    p: ["Tests that pass with skipped time may hide real-clock races between activities and timers.", "Mocked activities that never fail leave retry and compensation paths untested."],
    v: "Run a workflow that sleeps for thirty days then calls an activity, and confirm the test finishes in seconds with the activity invoked once and the recorded timer fire event present.",
    dep: ["durable-timers", "workflow-definition", "activity-definition", "clock-and-time"]
  },
  "history-export-and-archival": {
    s: "Copying completed event histories to cheap, long-term storage on close or on a schedule, so they survive beyond online retention for audit, replay tests and analytics.",
    d: "When a workflow closes, an archival task serializes its history, usually in batches, to an object store or file system, keyed by namespace, workflow ID and run ID. A matching visibility record may be archived too. Export is the same idea driven by operators or a pipeline that streams histories into a data lake. Reading archived histories happens through a separate path from live ones. The problem is volume and privacy: histories contain payloads and live for as long as the archive does.",
    k: ["Archive on close vs export on demand: archiving on close guarantees coverage but spends storage on histories nobody reads; on-demand export is cheaper but needs the history before retention deletes it.", "Archive raw histories vs summarized records: raw supports replay, summaries are smaller and easier to query but cannot be replayed."],
    p: ["Retention deleting a history before the archival task runs leaves a gap that cannot be recovered.", "Archived payloads stay readable long after the keys that encrypted them were rotated away."],
    v: "Close a workflow, wait for retention to delete it online, then fetch it from the archive by IDs and confirm the history replays cleanly in a test replayer.",
    dep: ["retention-and-deletion", "history-event-store", "payload-and-data-converters"]
  },
  "metrics-and-tracing": {
    s: "Counters, latency distributions, logs and distributed traces from services and workers, showing queue depth, task latency, failures and the path of a request across tiers.",
    d: "Each service exports request latency, persistence latency by operation, shard lock waits, task queue backlog age and workflow task failure rates. Workers export schedule-to-start latency, which shows whether capacity is short, and activity and workflow-task execution times. Trace context rides in headers through the client, workflow, activities and child workflows so one business operation appears as one trace. Cardinality is the trap: labeling by workflow ID makes the metrics system the bottleneck.",
    k: ["Label by workflow type vs by workflow ID: type-level labels stay cheap and answer most questions, ID-level labels are precise but explode cardinality.", "Trace every execution vs sample: full tracing helps debugging but multiplies write volume for very long workflows."],
    p: ["Alerting on workflow failures without separating retried activity failures from final ones pages constantly on healthy retries.", "Replay emits duplicate logs and spans unless the logger knows when code is replaying."],
    v: "Stop all workers for a queue and confirm schedule-to-start latency and backlog age climb on the dashboard within one scrape interval, then recover when workers return.",
    dep: ["worker-process", "history-service", "matching-service", "persistence-interface"]
  },
  "authn-and-authz": {
    s: "Verification of caller identity and per-namespace, per-operation permission checks, applied at the frontend before any request reaches history or matching.",
    d: "Callers present a token or client certificate over TLS. A claim mapper converts it into roles per namespace, and an authorizer allows or denies each API call. Internal services authenticate to each other separately. Payload encryption is a different layer: the data converter encrypts before bytes leave the client or worker, so the service never holds plaintext. Hard cases are workers, which both read and write across many calls, and signals from third parties that should reach one workflow only.",
    k: ["Authorize at the frontend only vs also inside inner services: frontend checks are simple, but any internal bug or direct access bypasses them.", "Coarse namespace roles vs per-workflow-type permissions: coarse roles are easy to manage; fine-grained rules add safety and a policy burden."],
    p: ["A worker credential scoped to a whole namespace can read inputs of every workflow in it.", "Skipping TLS between internal services exposes histories inside the cluster network."],
    v: "Call a start request with a token granting read-only access and confirm it is denied with a permission error, while a describe call with the same token succeeds and is logged with the caller identity.",
    dep: ["frontend-service", "namespaces", "payload-and-data-converters"]
  },
  "workflow-definition": {
    s: "A function that orchestrates a business process as ordinary code, calling activities and waiting on timers and signals, whose progress the engine makes durable.",
    d: "The function takes input and a context, and returns a result. Everything it does that has an external effect goes through the context: start an activity, sleep, wait for a signal, start a child. The engine records each of those as events. On a restart, the code runs again from the top and the context supplies recorded results instead of repeating effects. The function must not read the real clock, random numbers, shared mutable state or the network directly. The reward is straight-line code for processes lasting months.",
    k: ["Code-defined workflows vs declarative graphs: code gives loops, branching and reuse from the host language, but demands determinism discipline that a declarative engine enforces for free.", "Long single function vs many small workflows: one function reads clearly, but its history and versioning burden grow with its lifetime."],
    p: ["Calling a library that uses the system clock or a random generator inside workflow code produces a different command on replay.", "A workflow that loops forever without continue-as-new grows its history until it hits hard limits."],
    v: "Run a workflow with three sequential activities, kill the worker after the second completes, restart it, and confirm the first two activities do not run again while the third executes.",
    dep: ["workflow-context-api", "event-history", "deterministic-replay", "activity-definition"]
  },
  "activity-definition": {
    s: "A function that performs one side effect, such as a payment call or file write, may fail and be retried, and is where nondeterminism is allowed.",
    d: "Activities run in workers outside the workflow's deterministic scope and can use any library, network, or clock. Each has a type name, input, result and per-call options: timeouts, retry policy and task queue. The service stores the scheduled, started and completed events, and re-dispatches on failure or timeout. Because an activity can be started more than once, for example after a worker crash following the external call but before reporting back, effects must be idempotent or guarded by a key derived from workflow and activity IDs.",
    k: ["Many small activities vs a few large ones: small ones retry cheaply and show progress, but each costs history events and a round trip.", "Idempotency key in the activity vs exactly-once assumption: keys make retries safe but need support from the called system."],
    p: ["Treating an activity as exactly once double-charges when a worker dies after calling the provider but before completing.", "Large payloads returned from activities bloat history and every later replay."],
    v: "Kill a worker between an activity's external call and its completion report, and confirm the activity runs again, the downstream system dedupes by key and the workflow proceeds with one recorded result.",
    dep: ["activity-retry-policy", "timeout-kinds", "task-queues", "event-history"]
  },
  "event-history": {
    s: "The append-only, per-execution log of everything that has happened: starts, scheduled and completed activities, timers, signals, child results, and workflow-task boundaries.",
    d: "Events carry a sequential ID, a type, a timestamp and attributes, and are written in batches by the history service together with a state update. The history is the source of truth: mutable state is a cache derived from it and can be rebuilt. Workers fetch it, possibly in pages, to replay. Everything is ordered, so causality is explicit. Its limits are practical: size in events and bytes, and the replay time that grows with length, which is why long processes must roll over.",
    k: ["Full event log vs snapshots of state: a log is complete and auditable and enables replay, but grows without bound and costs replay time; snapshots are small but lose history.", "Store payloads in events vs references to blob storage: inline payloads keep one read path, while references shrink history but add a dependency and a failure mode."],
    p: ["A history beyond the configured event or size limit causes the workflow to be terminated by the server.", "Reading the whole history on every task for a long workflow dominates task latency without a cache."],
    v: "Fetch the history of a finished workflow and confirm event IDs are contiguous from one, the final event is a completion, and each scheduled event has exactly one matching terminal event.",
    dep: ["history-event-store", "transactional-append", "payload-and-data-converters"]
  },
  "deterministic-replay": {
    s: "Rebuilding a workflow's in-memory state by re-running its code from the beginning against the recorded history, feeding recorded results to each call instead of redoing effects.",
    d: "On a cache miss, a worker loads the history, starts the workflow function and steps it event by event. Each time the code issues a command, such as schedule an activity, the replayer matches it with the next recorded event; recorded results are returned, so no effect is repeated. When the code reaches the point beyond recorded history, new commands are real and are sent back. A mismatch between code and history is a non-determinism error that blocks the workflow. This is the core trick, and all its constraints on user code come from it.",
    k: ["Replay from the start vs checkpoint the stack: replay needs no serialization of language runtime state and works across code versions that stay compatible, but costs time proportional to history length.", "Strict command matching vs lenient matching: strict matching detects bugs early, but rejects harmless refactors."],
    p: ["Reordering two independent activity calls in a refactor fails replay of every open workflow created before the change.", "Iterating over an unordered collection yields a different command order on replay."],
    v: "Replay a recorded history through the same code in a test replayer and confirm it completes with no mismatch; then swap two activity calls and confirm replay reports a non-determinism error.",
    dep: ["event-history", "workflow-sandbox", "side-effect-capture", "workflow-context-api"]
  },
  "workflow-context-api": {
    s: "The restricted set of calls workflow code may use to interact with the world: start activities, sleep, read engine time, receive signals, generate random values and spawn children.",
    d: "The context replaces every nondeterministic primitive. Its time function returns the timestamp of the current workflow task, not the clock; its random source is seeded from the run; its sleep is a durable timer; its concurrency primitives are scheduled by the engine rather than the OS. Each call emits a command that the history service turns into events. By funneling all effects through one surface, the engine can record, replay and test them. Misuse is easy because ordinary libraries are still importable.",
    k: ["Explicit context object vs ambient globals: explicit calls make effects visible and testable, at the cost of code that reads less like normal programs.", "Cooperative workflow threads vs OS threads: cooperative scheduling is deterministic, but blocks all workflow code if one routine busy-waits."],
    p: ["Using a standard sleep instead of the context's timer blocks the worker and records nothing.", "Reading environment variables in workflow code changes behavior between a replaying worker and the original."],
    v: "Call the context's time function in a workflow, replay it hours later in a different process, and confirm the returned value is identical to the first execution.",
    dep: ["deterministic-replay", "workflow-sandbox", "durable-timers"]
  },
  "side-effect-capture": {
    s: "Recording the result of a small nondeterministic operation, such as generating an ID or reading a flag, in history on first run so replays return the same value.",
    d: "The code runs the function once inside the workflow, and the engine writes its result as a marker event. During replay, the function is not called; the recorded value is returned. This suits cheap, local and non-critical values like a random identifier. It is not a way to call external systems: if the function has real effects, they cannot be retried or timed out, and the result is only recorded when the workflow task completes. For anything that matters, an activity is the right tool.",
    k: ["Capture in history vs compute in an activity: capture is cheap with no round trip, but offers no retry, timeout or visibility; activities cost a task but are observable and retried.", "Capture at first execution vs derive deterministically from run ID: capture allows any value, derivation avoids marker events but limits what can be generated."],
    p: ["Calling a network service inside a captured function succeeds on the first worker but its result is lost if that task fails before completion.", "Capturing large values bloats history for no benefit."],
    v: "Generate an identifier through capture, force a replay on a second worker, and confirm both workers observe the same value and the history holds exactly one marker event for it.",
    dep: ["event-history", "deterministic-replay", "workflow-context-api"]
  },
  "payload-and-data-converters": {
    s: "Pluggable code in the client and worker that turns application values into bytes with encoding metadata, and optionally compresses or encrypts them before they reach the service.",
    d: "Every input, result, signal and failure detail is a payload: bytes plus a metadata map naming the encoding. A converter chain tries encoders in order, such as null, raw bytes, then structured text. A codec stage can encrypt or compress the bytes, and the server only ever stores the output. Operator tools use a codec endpoint to decode for display. Because history is replayed and kept for years, a converter change must remain able to read old payloads.",
    k: ["Encrypt in the converter vs trust the server: client-side encryption keeps plaintext out of the cluster, but breaks server-side search on payloads and complicates debugging tools.", "Self-describing payloads vs fixed schema per type: metadata allows evolving formats, but each payload carries extra bytes."],
    p: ["Changing the serialization format breaks replay of long-running workflows whose inputs were written in the old one.", "Lost encryption keys make old histories permanently unreadable, including the ones needed for reset."],
    v: "Enable an encrypting codec, start a workflow, and confirm the stored history payloads are ciphertext while the worker and the console (via codec endpoint) both see the original value.",
    dep: ["event-history", "client-sdk"]
  },
  "workflow-state-and-stack": {
    s: "The in-memory variables and suspended call stack of a running workflow function, reconstructed by replay and held in a worker cache between tasks.",
    d: "Between workflow tasks, a workflow is a paused routine, with its local variables, pending futures and handlers, all in worker memory. The service never stores this; it stores only history. When a task arrives for a cached workflow, the worker feeds the new events and the routine resumes. If the cache has evicted it or the worker is new, replay recreates the stack. This is why workflow state cannot depend on anything outside the function, and why memory per open workflow is a capacity concern.",
    k: ["Rebuild state from history vs serialize it: rebuilding avoids runtime-specific serialization and is always consistent with history, but burns CPU when caches miss.", "Keep large data in variables vs fetch via activities: variables are simple, but inflate memory per open workflow and every cache rebuild."],
    p: ["Holding a large in-memory structure per workflow limits how many open workflows a worker can cache.", "Mutating a variable from a query handler corrupts state that replay will not reproduce."],
    v: "Open ten thousand idle workflows on a worker with a small cache, send a signal to one evicted workflow, and confirm it resumes with the correct variable values after a replay visible in the replay counter.",
    dep: ["deterministic-replay", "workflow-state-cache", "event-history"]
  },
});
