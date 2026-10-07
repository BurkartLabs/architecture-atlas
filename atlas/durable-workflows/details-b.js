// Details for the durable workflow plate, part 2: coordination primitives, failure handling, workers.
ATLAS.details("durable-workflows", {
  "durable-timers": {
    s: "A sleep that survives restarts: the workflow asks for a delay, the engine records a timer and wakes the workflow when it fires, whether the delay is a second or a year.",
    d: "The workflow's sleep call produces a start-timer command. The history service writes a timer-started event and creates a timer task with the fire time. A timer queue per shard holds pending tasks, ordered by time, and when one is due the shard appends a timer-fired event and schedules a workflow task. No worker holds anything while waiting. Accuracy is bounded by queue scanning and shard load, so timers fire at or after the deadline, never before. Millions of idle timers cost only storage.",
    k: ["Timers in the shard's queue vs in worker memory: shard-held timers survive worker loss and cost nothing while idle, but fire with scan-interval granularity.", "Absolute fire times vs relative durations: absolute times are immune to delays in scheduling, relative durations are easier to reason about but drift when tasks are late."],
    p: ["Assuming sub-second precision leads to logic that fails when a loaded shard fires timers late.", "Thousands of timers set to the same instant create a thundering herd of workflow tasks."],
    v: "Start a workflow that sleeps one hour, restart every worker and service process, advance the test clock or wait, and confirm a timer-fired event appears at or after the deadline and the workflow continues.",
    dep: ["timer-task-queue", "event-history", "workflow-context-api", "clock-and-time"]
  },
  "signals": {
    s: "A one-way, durable message sent to a running workflow by ID, recorded in its history and delivered to a handler or a waiting receive call.",
    d: "A signal request is routed to the shard owning the workflow. The history service appends a signal-received event and schedules a workflow task. The workflow code either registers a handler or blocks on a channel until a message arrives. Signals are ordered per workflow and are never lost while the workflow is open. A signal for a closed workflow fails. Sending a signal with a request ID makes the send idempotent. Signals are the way to feed human decisions and external events into long-running logic.",
    k: ["Signal vs polling an external store from an activity: signals push events into history with exact ordering, but fan-in from many senders means a history that grows by one event per message.", "Signal-with-start vs separate start then signal: the combined call is atomic and avoids a race where the signal arrives before the workflow exists."],
    p: ["A flood of signals to one workflow grows its history toward the limit and forces premature continue-as-new.", "Signals sent just as the workflow completes are rejected and the sender must handle the failure."],
    v: "Send three signals to a waiting workflow in a known order and confirm the history shows three signal events in that order and the handler observes them in the same sequence, including after replay.",
    dep: ["event-history", "history-service", "workflow-context-api", "request-deduplication"]
  },
  "queries": {
    s: "A synchronous, read-only request that asks a running or closed workflow for a value computed from its current in-memory state, without writing anything to history.",
    d: "The query is routed to a worker, preferably the one caching the workflow, which returns it as a special task. The worker replays if needed, runs the query handler against the state, and returns the answer. Nothing is recorded, so queries add no history. Because they need a live worker, they fail if no worker is polling the queue. Handlers must not mutate state or block. They are for status checks like how many items are processed, not for tight loops.",
    k: ["Query the workflow vs maintain an external status table: queries need no extra store and always match workflow state, but need available workers and add load to a possibly busy one.", "Consistent queries vs fast queries: forcing a query through a task sees the latest state at the cost of latency and a workflow task."],
    p: ["Using queries for high-rate dashboards turns each page view into worker replay work.", "A query handler that changes variables makes the next replay diverge from what was recorded."],
    v: "Query a running workflow for a counter while it increments, confirm monotonic values returned and that the event history length is identical before and after the queries.",
    dep: ["workflow-state-and-stack", "task-queues", "workflow-state-cache", "worker-process"]
  },
  "child-workflows": {
    s: "A workflow started by another workflow, with its own history and ID, used to split work, bound history size or isolate failure, with parent-close behavior set by policy.",
    d: "The parent issues a start-child command; the history service creates a new execution, possibly on another shard, and records initiated, started and closed events in the parent. When the child finishes, its result is delivered back through the transfer queue. The parent-close policy decides whether the child is terminated, cancelled or abandoned if the parent ends. Children allow histories to stay short and workers for different code to be separate. The cost is cross-shard messaging and one more thing to reason about when cancelling.",
    k: ["Child workflow vs activity that starts a workflow: children give typed results, cancellation and parent-close handling built in, while an activity-started workflow is loosely coupled.", "Many small children vs one large workflow: children bound history growth and parallelize, but each adds events, shards and scheduling overhead."],
    p: ["A parent that starts a hundred thousand children in one task produces a huge batch of commands and a task that cannot complete.", "Abandoned children keep running after the parent fails with no one listening for their result."],
    v: "Start a parent with ten children, terminate the parent with a terminate-on-close policy, and confirm all ten children close with a parent-closed reason within seconds.",
    dep: ["transfer-task-queue", "start-workflow-request", "history-service", "cancellation-scopes"]
  },
  "continue-as-new": {
    s: "Atomically closing the current run and starting a fresh run of the same workflow ID with new input and an empty history, used to bound history growth in long or looping processes.",
    d: "At a safe point, the workflow carries forward the state it still needs and issues continue-as-new. The service closes the run with a continued-as-new status and starts the next run in one transaction, with the same workflow ID and a new run ID. Pending signals can be handed over, and queries address the latest run. The new history starts small, so replay is fast again. Developers decide where to cut, and the SDK can suggest it when a history approaches its limits.",
    k: ["Roll over by event count vs by elapsed time: count-based keeps replay time bounded for chatty workflows, time-based gives predictable cycles for quiet ones.", "Pass minimal state vs everything: minimal state keeps the next history small, but dropping something needed later causes bugs that appear only after rollover."],
    p: ["Signals arriving during rollover can be lost unless the code drains pending ones into the next input.", "A loop that never rolls over eventually hits the history limit and is terminated."],
    v: "Run a looping workflow past the rollover threshold and confirm the run chain shows continued-as-new, the new run's history is short, and in-flight signals sent during rollover are all processed.",
    dep: ["history-growth-limits", "workflow-id-and-run-id", "transactional-append", "signals"]
  },
  "external-workflow-handles": {
    s: "A reference to another execution by workflow ID, used from workflow code to signal or cancel it without a parent-child relationship.",
    d: "The handle names a workflow, optionally a specific run, in the same or another namespace. Calls on it become commands such as signal-external or request-cancel-external; the history service delivers them via the transfer queue and records initiated and result events in both executions where relevant. Unlike a child, the target has its own lifecycle. This is how independent workflows cooperate, for example a payment workflow notifying an order workflow. Failures such as target not found must be handled, because the target may have closed.",
    k: ["Signal by ID vs shared external store: ID-based signals are ordered and durable, but require knowing the target's ID and its liveness.", "Child relationship vs loosely coupled handles: children give lifecycle control, handles let independent teams deploy separately."],
    p: ["Signaling an ID that has completed returns not found and silently drops the message if unchecked.", "Cross-namespace signals depend on both namespaces' authorization and can fail asymmetrically."],
    v: "From workflow A, signal workflow B by ID, and confirm B's history has a signal-received event and A's history has a matching signal-external-completed event.",
    dep: ["signals", "transfer-task-queue", "workflow-id-and-run-id", "cancellation-scopes"]
  },
  "parallel-activities-and-futures": {
    s: "Starting several activities or children at once and combining their results, with futures and selectors that wait for the first, all, or a quorum of them.",
    d: "The code issues multiple schedule commands in one workflow task and holds futures for each. The engine records them in a stable order, and results return in whatever order they complete; the workflow resumes when the selected future is ready. A selector waits on several of them plus timers and signals at once. Because the order in which results arrive can vary between runs, the code must depend only on the recorded event order during replay. Fan-out sizes are limited by history size and pending-activity limits.",
    k: ["Fan out in one task vs in batches: one task is fast but creates a giant command batch, while batches keep each task small and bounded in history growth.", "Wait for all vs first success: waiting for all gives completeness, racing gives latency but requires cancelling the losers cleanly."],
    p: ["Fanning out ten thousand activities in one go hits pending-activity limits and slows every later replay.", "Collecting results into a map keyed by completion order produces nondeterministic output if the order is used."],
    v: "Fan out fifty activities with random durations, confirm the workflow collects all results, and replaying the history yields the same final output despite different completion orders in the original.",
    dep: ["activity-definition", "workflow-context-api", "history-growth-limits", "cancellation-scopes"]
  },
  "activity-retry-policy": {
    s: "A declared rule, with initial interval, backoff coefficient, maximum interval, maximum attempts and non-retryable error types, that the service applies when an activity fails.",
    d: "On failure the history service does not write an event per attempt; it keeps attempt count and next retry time in mutable state and reschedules the activity after the backoff delay. Only the final result is written to history. Errors marked non-retryable end the sequence at once. The default retries indefinitely with exponential backoff, bounded by the activity's timeouts. Retries make activities at-least-once, so side effects must be idempotent. Choosing intervals trades recovery speed against load on a struggling dependency.",
    k: ["Server-side retries vs retry loops in workflow code: server-side retries keep history small and survive worker loss, but give workflow code less control per attempt.", "Unlimited retries vs bounded attempts: unlimited retries survive long outages but can hide permanent bugs; bounded attempts surface failure but need an escalation path."],
    p: ["Retrying a validation error forever because it was not marked non-retryable wastes capacity and hides the bug.", "Zero backoff retry storms a dependency that is already failing."],
    v: "Make an activity fail with a retryable error three times, confirm attempt count and next-retry-time show in the pending activity view, and the history contains one scheduled and one completed event, not four.",
    dep: ["activity-definition", "timeout-kinds", "mutable-state", "timer-task-queue"]
  },
  "timeout-kinds": {
    s: "Four bounded waits for an activity, schedule-to-start, start-to-close, schedule-to-close and heartbeat, plus run and execution timeouts for workflows, each catching a different failure.",
    d: "Schedule-to-start measures time waiting for a worker and signals under-provisioning. Start-to-close bounds a single attempt and catches hung code. Schedule-to-close bounds the whole activity including retries. Heartbeat timeout detects a worker that stopped reporting. Each is a timer task in the history shard. When one fires the engine writes a timed-out event or retries per policy. Workflow run and execution timeouts bound a run or the whole chain. Missing timeouts are the usual root of stuck workflows.",
    k: ["Short start-to-close with retries vs long single attempt: short attempts detect hangs sooner and retry, but break work that legitimately runs long unless it heartbeats.", "Set schedule-to-start vs leave unbounded: bounding it makes lack of workers visible, unbounded lets work wait safely through an outage."],
    p: ["No start-to-close timeout means a hung activity blocks its workflow forever.", "Start-to-close set shorter than real work causes endless retries that each do the work again."],
    v: "Run an activity that sleeps past its start-to-close timeout and confirm a timed-out event with timeout type start-to-close appears, followed by the retry per policy.",
    dep: ["timer-task-queue", "activity-definition", "heartbeating", "state-machine-transitions"]
  },
  "heartbeating": {
    s: "Periodic progress reports from a running activity that prove the worker is alive, carry a checkpoint, and deliver cancellation requests back to the activity.",
    d: "The activity calls heartbeat with optional details; the worker batches and throttles these to the service, which resets a heartbeat timer. If none arrive within the heartbeat timeout, the attempt fails and may be retried on another worker, which receives the last recorded details so it can resume. A cancellation or workflow termination is delivered in the heartbeat response, which is the only way a long activity learns about it. Throttling prevents heartbeat traffic from overwhelming the history shard.",
    k: ["Heartbeat with checkpoint details vs restart from scratch: checkpoints let retries resume, but need activity logic to be resumable.", "Frequent heartbeats vs sparse ones: frequent ones detect failure faster, sparse ones cost less and can be throttled further."],
    p: ["A long activity that never heartbeats cannot be cancelled and appears healthy until its overall timeout.", "Heartbeat details that grow large are stored with mutable state and slow every update."],
    v: "Run a long activity that heartbeats a progress counter, kill its worker midway, and confirm the retry starts from the last reported counter rather than zero within the heartbeat timeout.",
    dep: ["timeout-kinds", "activity-executor", "mutable-state", "cancellation-scopes"]
  },
  "cancellation-scopes": {
    s: "Structured propagation of a cancellation request through a workflow's pending activities, timers and children, with scopes that can shield cleanup code from being cancelled.",
    d: "A cancel request writes an event and delivers a cancellation to the workflow, which marks its scope cancelled. Pending sleeps and activities in that scope are cancelled according to their cancellation type: try cancel, wait for the activity to confirm, or abandon. Child workflows receive a request and respond. A detached scope lets cleanup, such as releasing a reservation, run even after cancellation. Cancellation is cooperative, so code that ignores it just continues. It differs from terminate, which stops the workflow immediately and skips cleanup.",
    k: ["Cancel vs terminate: cancel lets the workflow run compensation and close cleanly but depends on its cooperation, terminate is immediate and cannot be ignored.", "Wait for activity cancel confirmation vs abandon: waiting is accurate about what stopped, abandoning is fast but leaves the activity running."],
    p: ["Cleanup code placed in the same cancelled scope never runs because its own calls are cancelled.", "Using terminate for routine stops skips compensation and leaves reservations held."],
    v: "Cancel a workflow that holds a reservation and confirm its cleanup activity runs in a detached scope, the reservation is released, and the workflow closes as cancelled rather than failed.",
    dep: ["activity-definition", "heartbeating", "failure-and-error-model", "child-workflows"]
  },
  "failure-and-error-model": {
    s: "The distinction between application errors, retryable and not, timeouts, cancellations and system errors, and how each propagates from activity to workflow to caller.",
    d: "An activity failure is wrapped with context: the activity type, ID, attempt and cause chain. In workflow code it surfaces as an error to catch. An unhandled error in the workflow function fails the workflow; an error that signals a bug, such as a panic or non-determinism, fails the workflow task and is retried, leaving the workflow stuck but recoverable after a fix. This difference between failing a workflow and failing a task is central: business failure ends it, code bugs pause it.",
    k: ["Fail the task on bugs vs fail the workflow: failing the task keeps the execution recoverable after a deploy, but leaves it stuck and consuming retries until fixed.", "Typed application errors vs strings: types allow retry decisions and handling, at the cost of a shared error vocabulary across languages."],
    p: ["Catching all errors in workflow code and returning success hides activity failures from operators.", "Error details with large stack traces inflate history on every retry."],
    v: "Throw an unhandled exception in workflow code and confirm the workflow stays open with repeating workflow-task-failed events; deploy a fix and confirm it then completes with no data loss.",
    dep: ["activity-retry-policy", "state-machine-transitions", "event-history"]
  },
  "workflow-versioning-patches": {
    s: "Code-level markers that let a workflow take the old branch for executions started before a change and the new branch for later ones, so replay of old histories still works.",
    d: "The code asks the context whether a named patch applies. On first execution of a new run the engine records a marker and returns true; on replay of a history without the marker it returns false, selecting the old path. After all old executions finish, the old branch and the patch call are deprecated and then removed in stages. An alternative is to fork a new workflow type. Without this, any change that alters the command sequence breaks every open workflow, and with year-long workflows that is a daily concern.",
    k: ["Patch markers in one function vs new workflow type per change: patches keep a single entry point, but branches accumulate; new types are clean but need routing of new starts.", "Remove old branches after drain vs keep forever: removal keeps code readable, but needs a reliable way to prove no open run still needs it."],
    p: ["Removing an old branch while a run started before the change is still open fails its replay.", "Patching code inside a loop without distinct IDs gives every iteration the same decision."],
    v: "Deploy a patched workflow while an old-version run is waiting on a timer, then fire the timer and confirm the old run completes via the old branch while a new start takes the new one.",
    dep: ["deterministic-replay", "event-history", "replay-testing", "side-effect-capture"]
  },
  "worker-build-id-versioning": {
    s: "Tagging each worker deployment with a build identifier and routing workflow tasks so that an execution stays on compatible code while new executions use the newest version.",
    d: "Task queues keep a set of compatible build IDs. Each workflow is pinned to the version that started it, or moves forward only when the new build is marked compatible with it. Matching delivers tasks only to workers advertising an eligible build ID. Old worker fleets are kept running until their pinned workflows drain, then retired. This trades code branching for fleet management: more deployments run at once, but no replay compatibility problem arises for pinned runs.",
    k: ["Pin to a build vs patch in code: pinning avoids branches and replay risk, but means old fleets run until the last pinned workflow ends, which can be months.", "Auto-upgrade compatible builds vs manual migration: auto-upgrade is convenient, yet one mistaken compatibility claim breaks open workflows."],
    p: ["Retiring an old worker fleet while pinned workflows remain leaves them with no eligible worker and they stall.", "Marking a build compatible without replay testing causes widespread non-determinism errors."],
    v: "Deploy build B alongside A with A-pinned workflows open, start new workflows, and confirm new runs execute only on B while A-pinned runs keep executing only on A until they close.",
    dep: ["task-queues", "matching-service", "workflow-versioning-patches", "worker-process"]
  },
  "saga-compensation": {
    s: "A pattern in which each step of a multi-service process registers an undo action, and on failure the workflow runs those undo actions in reverse order to restore consistency.",
    d: "Workflow code keeps a list of compensations as each activity succeeds, such as cancel reservation after reserve. When a later step fails or the workflow is cancelled, the code runs the list backwards, each undo itself an activity with retries and idempotency. This replaces distributed transactions with explicit business-level rollback. Durable execution makes it reliable because the unwinding itself survives crashes. The hard part is that some steps cannot be undone, and compensations can fail or interleave with concurrent changes.",
    k: ["Compensate in reverse sequentially vs in parallel: sequential respects dependencies and is simple, parallel finishes sooner but needs independence between steps.", "Register compensation before the step vs after: registering before covers a step that succeeds but whose result is lost, at the cost of sometimes undoing something that never happened."],
    p: ["A compensation that is not idempotent double-refunds when retried after a timeout.", "Registering undo actions only after success misses the case where the worker crashed mid-step."],
    v: "Force the third of four steps to fail and confirm the history shows undo activities for steps two and one in reverse order, and the external systems end in their original state.",
    dep: ["activity-definition", "activity-retry-policy", "cancellation-scopes", "workflow-definition"]
  },
  "worker-process": {
    s: "A process that registers workflow and activity implementations for named task queues, polls the service for work, executes it and reports results.",
    d: "On start, the worker connects to the frontend, registers types and begins pollers for workflow tasks and activity tasks on each queue it serves. Concurrency is bounded by slots. It holds the workflow cache, runs the sandboxed workflow code and delegates activities to executors. It identifies itself so operators can see which workers are connected. Workers are stateless between tasks apart from the cache, so they scale horizontally and can be restarted freely. Their configuration, not service defaults, usually limits throughput.",
    k: ["One worker for workflows and activities vs separate fleets: one fleet is simpler, separate fleets let CPU-heavy activities scale and fail without starving workflow tasks.", "Many task queues per worker vs one: many queues isolate workloads but each consumes pollers and memory."],
    p: ["Too few pollers or slots leaves tasks waiting while workers look idle.", "A worker that registers a workflow type under an older name than deployed code fails tasks for it."],
    v: "Start a worker for one queue, start a workflow of a registered type, and confirm the worker identity appears in the queue description and the workflow task completes within the schedule-to-start target.",
    dep: ["long-poll-task-pollers", "task-queues", "workflow-state-cache", "activity-executor", "internal-rpc"]
  },
  "task-queues": {
    s: "Named, durable queues that carry workflow tasks and activity tasks from the service to workers, decoupling who schedules work from who runs it.",
    d: "A task queue is identified by namespace and name, with separate workflow and activity kinds. The history service creates a task when something needs a worker; matching holds it until a poller takes it. Queues are partitioned for throughput and can have rate limits. Which workers serve a queue is a deployment choice: routing by queue is how teams send work to GPU hosts or to a specific region. Queues are created implicitly on first use, so a typo creates an empty queue and tasks never run.",
    k: ["Queue per worker pool vs one shared queue: separate queues give routing and isolation, but multiply capacity planning and can leave one pool idle while another is overloaded.", "Implicit creation vs declared queues: implicit is convenient, but misspelled names fail silently."],
    p: ["A misspelled queue name accepts tasks that no worker will ever poll, and the workflow appears hung.", "One heavy activity type sharing a queue with latency-sensitive workflow tasks causes head-of-line delays."],
    v: "Schedule an activity on a queue with no pollers and confirm the queue description shows zero pollers and a growing backlog; start a worker and confirm the backlog drains.",
    dep: ["matching-service", "task-queue-partitions", "task-backlog"]
  },
  "long-poll-task-pollers": {
    s: "Worker threads that hold an open request to matching until a task is available, so tasks are handed over with low latency and without busy polling.",
    d: "Each poller sends a poll request naming a queue, which matching holds for up to about a minute. If a task arrives, it is returned immediately; otherwise an empty response is returned and the poller reconnects. Poll count bounds how many tasks can be fetched concurrently. The service forwards the request to the partition with a task if needed. Held requests mean a worker pull model: workers need only outbound connectivity, and slow workers simply take fewer tasks. Poller loss is invisible until a request timeout expires.",
    k: ["Pull via long poll vs push to workers: pull needs no inbound ports and gives natural backpressure, but costs a held connection per poller and polling overhead when idle.", "Many pollers vs many slots: more pollers reduce dispatch latency, more slots increase parallel execution; they are tuned separately."],
    p: ["A load balancer with a shorter idle timeout than the poll cuts requests and tasks are delivered to dead connections.", "Too many idle pollers across a fleet load the matching service for no throughput gain."],
    v: "Start a worker, send one task, and measure schedule-to-start under a few milliseconds from the matching metrics; then stop the worker and confirm poller count for the queue drops to zero.",
    dep: ["worker-process", "matching-service", "task-queue-partitions", "internal-rpc"]
  },
  "workflow-state-cache": {
    s: "An in-memory cache of recently active workflows in a worker, holding their replayed state so the next task needs only the new events, not a full replay.",
    d: "After a workflow task completes, the worker keeps the paused workflow instance, keyed by run ID, up to a configured size. On the next task, if the workflow is cached and the task is for the next expected event, it applies the new events directly. Eviction drops the least recently used instance; the next task must fetch history and replay. Cache size is bounded by memory and by thread or routine counts. Sticky routing sends follow-up tasks back to the same worker to reuse it.",
    k: ["Large cache vs small: a large cache reduces replays and history reads, but each cached workflow holds memory and execution resources.", "Evict on idle time vs on size: idle-time eviction frees memory predictably, size-based eviction maximizes hit rate."],
    p: ["A cache sized for typical load thrashes during a burst of many workflows, doubling history reads.", "Cached instances survive across code reload only if the worker restarts, so hot patching leaves stale code."],
    v: "Run a workflow with fifty signals, then compare replay counts and history fetches on a worker with the cache enabled against one with it disabled; the enabled one should replay once.",
    dep: ["workflow-state-and-stack", "sticky-task-queues", "worker-process", "event-history"]
  },
  "sticky-task-queues": {
    s: "A per-worker queue to which the service sends the next workflow tasks of an execution, so they return to the worker that already holds its state, falling back to the normal queue on timeout.",
    d: "After a worker completes a workflow task, it reports a sticky queue name. The history service sends subsequent tasks for that run to the sticky queue, carrying only the new events. If no poll arrives within a short sticky timeout, or the worker is gone, the task is rescheduled on the normal queue where any worker replays the full history. This optimization saves history transfer and CPU, and failure only costs latency. The sticky timeout is a trade between waiting for the cached worker and replaying elsewhere.",
    k: ["Sticky routing vs always normal queue: sticky saves replay and bandwidth for chatty workflows, but a dead worker delays tasks until the sticky timeout.", "Short sticky timeout vs long: short fails over quickly but loses the cache on slight delays; long preserves it but stretches latency on failure."],
    p: ["A sticky timeout longer than the worker's restart time stalls workflow progress for every cached workflow on that worker.", "Many workers with tiny caches create many sticky queues and pollers with little benefit."],
    v: "Send two signals to a cached workflow and confirm the second task goes to the same worker identity; kill that worker and confirm the next task is picked up elsewhere after about the sticky timeout.",
    dep: ["workflow-state-cache", "matching-service", "task-queues"]
  },
  "workflow-sandbox": {
    s: "A restricted execution environment around workflow code that blocks or replaces nondeterministic operations, such as clocks, randomness, threads and network access, so replay stays correct.",
    d: "The sandbox runs workflow code with its own scheduler and replaces time, random and concurrency primitives with deterministic ones. Some implementations isolate in a separate runtime context, others check imports and flag forbidden calls. It detects many but not all violations: reading a mutable global or iterating an unordered map can still diverge. Because workflow code is replayed, the sandbox also limits execution time per task with a deadlock timeout, to catch infinite loops that would hold a task forever.",
    k: ["Strong isolation vs lint-level checks: isolation catches more violations at runtime, but costs startup time and memory per workflow and restricts library use.", "Block violations vs allow with warning: blocking prevents corrupt histories, warning is friendlier to existing code but lets bugs reach production."],
    p: ["Sandbox bypass through a shared global variable produces replay failures only after a deploy.", "A tight CPU loop in workflow code trips the deadlock timeout and fails the task repeatedly."],
    v: "Call the system clock from workflow code in a test and confirm the sandbox raises an error or substitutes the context time; replaying the history then produces identical results.",
    dep: ["deterministic-replay", "workflow-context-api", "worker-process"]
  },
  "activity-executor": {
    s: "The component that runs activity functions on a bounded pool, enforcing concurrency slots, reporting heartbeats and returning results or failures to the service.",
    d: "An activity poller fetches a task and hands it to an executor slot. The executor decodes the input, invokes the registered function with a context carrying heartbeat and cancellation, and encodes the result or error. It reports completion through the frontend. Slots bound concurrency, so an activity fleet can be sized by resource use, and a slow activity does not block workflow tasks if they use separate slots or fleets. Rate limits per worker or per queue protect downstream systems.",
    k: ["Fixed slot count vs resource-based slots: fixed slots are simple to reason about, resource-based slots adapt to CPU and memory but need tuning.", "Per-activity timeouts enforced by service only vs also locally: local enforcement frees the slot sooner, service-only is simpler but a hung call holds the slot."],
    p: ["An activity that ignores cancellation holds its slot until its timeout, starving other tasks.", "A completion report that fails after the effect leaves the retry to repeat the effect."],
    v: "Set slots to two, start five activities that each sleep, and confirm at most two run at once while the others show as scheduled in the pending activity list.",
    dep: ["worker-process", "long-poll-task-pollers", "activity-definition", "heartbeating"]
  },
  "local-activities": {
    s: "Short activities run directly inside the workflow worker during the workflow task, without a round trip through a task queue, recorded as a marker in history.",
    d: "The worker executes the function immediately in the same process, retries it locally, and records only the final outcome as a marker event when the workflow task completes. This saves latency and history events for fast operations like a cache lookup. In exchange, there is no separate task queue, no independent scheduling or heartbeat, and the whole workflow task must finish before its own timeout, so long local activities are risky. A worker crash before the task completes loses the result and re-runs it.",
    k: ["Local activity vs regular: local is faster and cheaper in history, but is bounded by the workflow task timeout and has weaker visibility and cancellation.", "Local retries vs server retries: local retries are quick, but a crash restarts the whole sequence from the beginning."],
    p: ["A local activity that takes longer than the task timeout causes endless workflow task timeouts.", "Side effects in a local activity repeat if the worker dies before the batch is committed."],
    v: "Run a workflow calling ten local activities, and confirm the history has marker events but no scheduled and started events for them, and total latency is lower than for regular activities.",
    dep: ["activity-definition", "workflow-context-api", "worker-process", "event-history"]
  },
  "async-activity-completion": {
    s: "An activity returns without a result and a token; some other process completes or fails it later, so a step can wait on a human or external system for days.",
    d: "The activity function marks itself as pending and exits, freeing its worker slot. It passes a task token, an opaque handle identifying that attempt, to the outside system, which later calls complete or fail with that token through the client. The service continues to enforce timeouts and heartbeat rules. This models approval steps and long vendor jobs without holding a worker. The token must be stored safely and protected, as anyone holding it can finish the activity, and a retry issues a new token.",
    k: ["Async completion vs workflow waiting on a signal: async keeps retry and timeout semantics of an activity, a signal is simpler and decoupled from the attempt identity.", "Token in a database vs token in an external system: either works, but losing the token means the activity can only time out."],
    p: ["A token stored only in memory vanishes on restart, leaving the activity to time out.", "Completing with a stale token after a retry is rejected, and the external system must handle that."],
    v: "Start an async activity, store its token, complete it from a separate process with the token, and confirm the workflow resumes with that result and the history shows a single completed event.",
    dep: ["activity-executor", "timeout-kinds", "frontend-service"]
  },
});
