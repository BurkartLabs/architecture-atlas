// Details for the workflow orchestrator plate, part 3: executors and workers, task state and retries, limits.
ATLAS.details("workflow-orchestrator", {
  "executor-interface": {
    s: "The contract between the scheduler and whatever runs tasks: accept a task to run, report its state, and stop it on request.",
    d: "The scheduler hands the executor a task identity and command, and the executor returns events as tasks start, finish or fail. Implementations differ in where work runs but share the contract, so the scheduler is unaware of them. The executor also reports its free capacity. It is hard because the executor holds in-memory knowledge about queued and running tasks that the database may disagree with, so after a crash the two must be reconciled.",
    k: ["Narrow contract vs rich contract: narrow contracts make new executors easy to add, while richer ones allow per-task resources and queues at the cost of complexity.", "Executor reports state vs scheduler observes the database: executor reports are fast, while the database is the authority and survives executor restarts."],
    p: ["After an executor restart, tasks the scheduler considers queued are unknown to the executor and wait forever.", "An executor that reports success before the task's own state write lets downstream tasks start early."],
    v: "Restart the executor with tasks queued and running, and confirm the scheduler reconciles them: queued tasks are resubmitted or failed explicitly, and none stay stuck.",
    dep: ["task-state-machine", "metadata-database"]
  },
  "local-executor": {
    s: "Runs tasks as processes on the same machine as the scheduler, with no queue or remote workers, for development and small deployments.",
    d: "The executor starts a subprocess for each task, up to a parallelism limit, and monitors its exit. There is no broker and nothing to deploy beyond the scheduler. Capacity is bounded by one host. It is hard to rely on in production because task load and the scheduler share CPU and memory, a runaway task can starve the scheduler, and the host is a single point of failure.",
    k: ["Single host simplicity vs distributed workers: local needs no extra infrastructure, while distribution scales but needs a broker or cluster.", "Process per task vs thread per task: processes isolate crashes and memory, while threads start faster but share failures."],
    p: ["A task consuming all memory makes the host kill the scheduler as well.", "Teams outgrow it quietly, with late tasks as the only symptom."],
    v: "Run a pipeline with parallelism of four and confirm no more than four task processes exist at once, and killing one task process leaves the scheduler running.",
    dep: ["executor-interface", "process-supervision"]
  },
  "queue-executor": {
    s: "Puts runnable tasks onto a message queue that a pool of separate workers consumes, so capacity scales by adding workers.",
    d: "The executor publishes a message per task; workers pull messages, run them and report back through the queue or the database. Queues can be named so tasks reach specific worker groups. Workers are long-lived processes with the task code installed. It is hard because the queue has its own delivery semantics, such as acknowledgment timeouts, and the broker adds a failure point: a message lost or redelivered must not become a lost or duplicated task.",
    k: ["Long-lived workers vs workers created per task: long-lived workers start tasks in milliseconds, while per-task workers give isolation at higher latency.", "Acknowledge on receipt vs on completion: early acknowledgment loses tasks if the worker dies, while late acknowledgment can redeliver long tasks that are still running."],
    p: ["An acknowledgment timeout shorter than the longest task makes the broker redeliver it, so it runs twice at once.", "Queue contents and database states drift apart after a broker flush."],
    v: "Kill a worker holding a task, and confirm the task is redelivered or failed and retried exactly once, while queue depth returns to zero after workers drain it.",
    dep: ["executor-interface", "message-broker", "worker-process"]
  },
  "container-executor": {
    s: "Launches each task in its own short-lived container or pod, giving isolation and per-task resources at the cost of startup time.",
    d: "For each task the executor asks a cluster scheduler to create a container from an image with the task command, resource requests and credentials, then watches it to completion and cleans up. There is no idle worker pool; capacity is whatever the cluster has. Each task can have its own image and dependencies. It is hard because startup adds seconds to minutes, the cluster can reject or evict pods, and the executor must track them reliably.",
    k: ["Container per task vs shared worker pool: containers isolate dependencies and resources and scale to zero, while shared workers start faster and use fewer cluster objects.", "Image per pipeline vs one shared image: per-pipeline images avoid dependency conflicts, but multiply builds and storage."],
    p: ["An evicted container leaves the attempt in running state until a heartbeat timeout reaps it.", "Thousands of short tasks overwhelm the cluster's API with create and delete calls."],
    v: "Run a task with a memory limit it exceeds and confirm the container is terminated, the attempt is marked failed with the reason out of memory, and the container is removed afterward.",
    dep: ["executor-interface", "resource-requests", "dependency-isolation", "deployment-packaging"]
  },
  "worker-process": {
    s: "A long-running process that receives task assignments, runs them, and reports results and heartbeats.",
    d: "On start it registers with the queue, and then takes tasks up to its concurrency setting. For each it spawns a supervised child process, so a crashing task does not kill the worker. Workers hold the task code, installed dependencies and network access to data systems. They are replaceable: no durable state lives in them. It is hard because they are the place where arbitrary code runs, so memory leaks, hung processes and version skew all appear here.",
    k: ["Many concurrent tasks per worker vs one: many tasks use memory and CPU efficiently, while one task per worker isolates noisy neighbors.", "Recycle workers after N tasks vs run indefinitely: recycling bounds memory leaks, but adds restart churn."],
    p: ["A worker with an older code version runs a task that behaves differently from the rest.", "A worker stuck in an uninterruptible call holds slots forever while looking alive."],
    v: "Run a task that leaks memory until the limit and confirm the child is killed and reported failed, while the worker keeps serving other tasks.",
    dep: ["task-runner", "message-broker", "heartbeat-detection"]
  },
  "task-runner": {
    s: "The supervisor that runs one task attempt: builds the context, renders templates, executes the code, captures output and reports the final state.",
    d: "It loads the definition for the task, renders its fields, fetches connections and variables, starts the operation, and wraps it with timeouts, heartbeats and log capture. On exit it writes the final state, results and any asset events. Using a separate process or isolated interface per attempt means task code cannot corrupt the worker. It is hard because the runner must report outcomes correctly even when the code crashes, hangs or is killed.",
    k: ["Task code talks to the database directly vs through an API: direct is fast but gives tasks broad access, while an API narrows access and lets workers lose database credentials.", "Report state from inside the task vs from the supervisor: supervisor reports are reliable on crashes, while inside reports are precise on success."],
    p: ["A task that ignores termination signals is never stopped, so timeouts do not work.", "Output written after the final state is lost."],
    v: "Run tasks that succeed, raise, call exit directly, and hang past their timeout, and confirm each ends with the correct final state, a recorded reason and a complete log.",
    dep: ["task-state-machine", "templating", "task-logs", "heartbeat-detection"]
  },
  "dependency-isolation": {
    s: "Keeping each task's libraries and runtime separate from the orchestrator and from other tasks, so versions do not conflict.",
    d: "Approaches include a virtual environment created per task, a dedicated image per task or team, a pre-built shared environment with pinned versions, and running code in remote systems and only submitting it. The goal is for the orchestrator's own libraries to be free to upgrade and for pipelines to pin what they need. It is hard because isolation costs build and start time, and a shared environment makes every team's upgrade a coordinated event.",
    k: ["Per-task environments vs one shared environment: per-task avoids conflicts and costs startup and storage, while shared is fast and uniform but couples teams.", "Orchestrate remote jobs vs run code on workers: remote jobs keep workers light and isolated, but add another system to monitor."],
    p: ["Upgrading a shared library for one pipeline breaks ten others that pinned the old behavior.", "A virtual environment built at run time fails on a network outage that has nothing to do with the task."],
    v: "Run two tasks requiring conflicting versions of the same library in one run and confirm each imports its own version and neither affects the orchestrator process.",
    dep: ["container-executor", "deployment-packaging"]
  },
  "worker-autoscaling": {
    s: "Adds and removes workers according to queue depth or pending tasks, so capacity follows demand and idle cost falls.",
    d: "A controller reads the number of queued and running tasks, from the broker or the metadata store, and computes desired worker count within minimum and maximum bounds. Scaling up needs time to start workers; scaling down must wait until running tasks finish or the workers are drained. It is hard because task load is bursty, workers take minutes to be ready, and scaling down kills long tasks unless it is drained carefully.",
    k: ["Scale on queue depth vs on running tasks: queue depth reacts to backlog, while running counts track steady load but lag during bursts.", "Terminate immediately vs drain: draining protects running tasks and costs idle time, while terminating saves cost and forces retries."],
    p: ["Scale-down removes a worker mid-task and the task is retried or fails.", "Rapid up and down scaling around a threshold wastes more time starting workers than it saves."],
    v: "Submit a burst of one thousand tasks and confirm workers scale up within the stated time, tasks drain, and scale-down waits until running tasks finish without any killed mid-run.",
    dep: ["worker-process", "queue-executor", "message-broker"]
  },
  "queue-routing": {
    s: "Directs tasks to named queues so that specific worker groups, such as those with a GPU or network access, handle them.",
    d: "A task names a queue in its definition, and workers subscribe to one or more queues. Routing separates workloads that need different hardware, network zones, credentials or priorities, and prevents a slow category from blocking a fast one. It is hard because every queue is a separate capacity pool to size and monitor, so queues proliferate, and a queue with no workers silently accumulates tasks.",
    k: ["Few broad queues vs many specific ones: few queues share capacity well, while many allow tight isolation but leave idle pools and more to monitor.", "Routing by task definition vs by operator-level policy: definition-level is explicit, while policy-level keeps authors from choosing capacity."],
    p: ["A typo in a queue name sends tasks to a queue with no workers, and they wait indefinitely.", "A priority queue gets starved because workers are shared with a busier one."],
    v: "Send a task to a queue served by no workers and confirm an alert fires for an aging queue, then start a worker on that queue and confirm the task runs.",
    dep: ["queue-executor", "message-broker", "tenant-quotas"]
  },
  "inter-task-data": {
    s: "The way tasks pass small results to each other, such as file paths, counts or identifiers, using the metadata store or external storage.",
    d: "A task returns a value, which the system stores with the run, keyed by task and name; a downstream task reads it. Because values go through the database, they are for small metadata, not datasets. Large data goes to object storage with only the location passed. Custom backends can store values outside the database. It is hard because large values slow the store and are hard to clean up, and because values are tied to a run, so reruns overwrite them.",
    k: ["Small values in the database vs a pluggable storage backend: the database is simple and transactional, while external storage handles large values without loading the store.", "Pass data vs pass locations: passing locations keeps the orchestrator light, but needs agreed paths and cleanup."],
    p: ["Returning a large dataframe from a task fills the metadata store and slows every query.", "A rerun overwrites the value that a still-running downstream task is about to read."],
    v: "Pass a result between two tasks, rerun the first, and confirm the downstream gets the new value, while a value above the size limit is rejected with a clear error.",
    dep: ["metadata-database", "artifact-storage"]
  },
  "task-state-machine": {
    s: "The defined set of states a task attempt can be in and the allowed transitions between them, such as scheduled, queued, running, success and failed.",
    d: "States include none, scheduled, queued, running, success, failed, up for retry, skipped, upstream failed, deferred and removed. Each transition has a cause and a component allowed to make it, and is written to the database, often with a timestamp. Other components react to state, so the machine is the system's shared language. It is hard because transitions race: a task may finish just as it is timed out, and the rules must say which wins.",
    k: ["Compare-and-set transitions vs unconditional writes: conditional writes prevent two components from overwriting each other, while unconditional writes are simple but cause lost updates.", "Many fine-grained states vs few: fine states aid diagnosis, but every rule must handle each of them."],
    p: ["A late success report overwrites a failure the scheduler already recorded, and downstream tasks run twice.", "A task left in queued after executor loss looks busy while nothing runs it."],
    v: "Force a race by finishing a task at the instant its timeout fires, and confirm exactly one terminal state is recorded and the other transition is rejected and logged.",
    dep: ["metadata-database", "row-locking"]
  },
  "run-state-machine": {
    s: "The states of a whole run, such as queued, running, success and failed, derived from the states of its tasks.",
    d: "A run starts queued, becomes running when its first task is scheduled, and ends when all leaf tasks are terminal: success if all are success or skipped, failed if any leaf failed. The scheduler updates it each loop. A run can also be marked by hand. Run state drives limits on active runs, deadlines and downstream triggers. It is hard because a run with deferred, retrying or cleared tasks is not final, so its state may move backward.",
    k: ["Derive run state from leaf tasks vs from all tasks: leaf-based is simple and matches the pipeline's intent, while all-task evaluation catches stray failures.", "Allow a finished run to reopen vs create a new run: reopening preserves identity for reruns, while new runs keep history immutable."],
    p: ["A run is marked success while a cleanup task failed, since only leaves count and the cleanup was not a leaf.", "Runs reopened by a clear count against active run limits and block new schedules."],
    v: "Fail one leaf task and confirm the run becomes failed only after the other branches reach a terminal state, then clear the task and confirm the run returns to running.",
    dep: ["task-state-machine", "metadata-database"]
  },
  "retry-policy": {
    s: "Per-task settings for how many times to retry after a failure, how long to wait, and which errors are worth retrying.",
    d: "A failed attempt with retries left moves to up-for-retry and becomes runnable after the delay; once exhausted it is failed. Settings come from defaults, pipeline or task. Some systems allow retry decisions by exception type, and some failures such as invalid configuration should never retry. Each attempt is recorded with its own logs. It is hard because retries multiply work and delay, and repeating non-idempotent tasks causes damage.",
    k: ["Few retries on every task vs retries only where known-transient: blanket retries cover surprises, while targeted retries keep failures visible sooner.", "Retry the task vs retry from the beginning of the run: task-level retries repeat less work, while whole-run retries are simpler for tightly coupled steps."],
    p: ["Retries on a task that charges a customer or sends a message produce duplicate side effects.", "Five retries with long delays turn a permanent failure into hours of silence before the alert."],
    v: "Make a task fail twice then succeed with three retries and confirm three attempts are recorded, the first two with their errors, and the task ends in success.",
    dep: ["task-state-machine", "retry-backoff", "idempotent-task-design"]
  },
  "retry-backoff": {
    s: "Increasing and randomizing the wait between retries so failing tasks do not hammer a struggling dependency in lockstep.",
    d: "The delay can be fixed, grow exponentially up to a cap, or include random jitter. Without jitter, tasks that failed together retry together. The delay is stored as the earliest next run time and the scheduler honors it. It matters most when many tasks depend on one external service that is down or rate limiting. It is hard because longer delays make recovery slower and shorter ones add load to a service that is already failing.",
    k: ["Exponential backoff with jitter vs fixed delay: exponential spreads load and gives the service time, while fixed is predictable and recovers faster from short blips.", "Cap on maximum delay vs unbounded growth: a cap bounds recovery time, while unbounded growth can delay a task past its deadline."],
    p: ["Hundreds of tasks fail on the same outage, retry at the same second and take the service down again.", "A backoff cap longer than the deadline guarantees a missed deadline for any second failure."],
    v: "Fail one hundred tasks together against a test service and confirm retry times are spread across the window, not clustered, and each delay respects the configured cap.",
    dep: ["retry-policy", "clock-and-timezones"]
  },
  "task-timeouts": {
    s: "Maximum time limits on a task attempt and on a whole run, after which the attempt is stopped and counted as failed.",
    d: "An execution timeout applies to one attempt, and the runner terminates the task when it expires. A run-level timeout fails the run. Sensors have their own timeout for waiting. The runner first asks the task to stop, then kills it after a grace period. Choosing values requires knowing normal runtime. It is hard because forced termination can leave external work running or output half written.",
    k: ["Timeout on each attempt vs on the whole run including retries: per-attempt timeouts catch hangs, while run timeouts bound total delay.", "Graceful stop then kill vs kill immediately: a grace period allows cleanup, while immediate kill frees the slot sooner."],
    p: ["A timeout kills the local process but the remote job it started keeps running and later conflicts with the retry.", "No timeout on a hung task holds a slot and delays the run indefinitely."],
    v: "Run a task that sleeps past its timeout and confirm it is terminated at the limit, marked failed with a timeout reason, and its slot is released within the grace period.",
    dep: ["task-runner", "task-state-machine"]
  },
  "skip-propagation": {
    s: "How skipped and upstream-failed states spread down the graph so that tasks that cannot run are marked and the run can finish.",
    d: "When a parent fails with no retries left, children whose trigger rule needs success become upstream failed. When a branch or condition skips a task, descendants with no other live parents are skipped in turn. The scheduler marks them without running anything, which lets the run reach a terminal state. It is hard because the interplay with trigger rules, mapped tasks and groups is subtle, and visual distinction between failed, skipped and upstream failed must stay clear.",
    k: ["Mark descendants immediately vs leave them waiting: immediate marking shows the extent of damage and finishes the run, while waiting keeps the option to clear.", "Skip counts as success for downstream vs as a distinct state: success lets joins proceed, while a distinct state keeps rules explicit."],
    p: ["Operators treat skipped tasks as completed work, and reports assume data that was never produced.", "A permissive trigger rule runs a task that expected input from a skipped parent."],
    v: "Fail a task with a deep chain of descendants and confirm all descendants end upstream failed without running, and that the run reaches failed once no live tasks remain.",
    dep: ["task-state-machine", "trigger-rules", "readiness-evaluation"]
  },
  "cancellation": {
    s: "Stopping a run or task on request, including terminating the running process and cleaning up any external work it started.",
    d: "An operator marks a run or task as failed or cancelled, and the system tells the executor to stop its running attempts. The runner sends a termination signal, waits for a grace period and kills. Well-behaved operators implement a cancel hook to stop remote jobs. Queued tasks are removed. It is hard because the signal has to reach a process on a remote host, and because remote work only stops if the operator knows how to ask.",
    k: ["Cooperative cancel hook vs forced kill: hooks clean up external work correctly, while forced kills are reliable but leave remote jobs orphaned.", "Cancel downstream tasks too vs only the selected one: cancelling downstream avoids wasted work, while selective cancel preserves unrelated progress."],
    p: ["A cancelled task stops locally but the warehouse query it started keeps consuming resources for hours.", "A cancel arrives between queueing and starting, and the task starts anyway."],
    v: "Cancel a run with one task running a long remote job and confirm the process stops, the remote job is cancelled, queued tasks never start, and the run ends in the cancelled state.",
    dep: ["task-runner", "executor-interface", "task-state-machine"]
  },
  "orphan-recovery": {
    s: "Finds tasks recorded as running or queued whose worker or executor no longer exists and returns them to a state where they can be retried.",
    d: "A periodic job compares the database to what executors and workers report and to heartbeat ages. Attempts with no live owner are failed or reset, and the retry policy decides whether they run again. This covers worker crashes, evicted containers and executor restarts. It is hard because an orphan and a slow-but-alive task look alike for a while, and resetting a task that is actually still running creates two copies.",
    k: ["Reset orphaned tasks immediately vs wait for the full threshold: waiting avoids duplicates after short pauses, while immediate reset reduces lost time.", "Count orphan loss as a retriable failure vs as a separate state: counting it uses existing retry logic, while a separate state tracks infrastructure faults."],
    p: ["A network partition makes live workers look dead, and tasks run twice when they are reset.", "Orphans never found because the check only looks at one executor's tasks."],
    v: "Pause a worker's network for longer than the threshold and confirm its tasks are recovered, and confirm when it returns the stale attempt is rejected and does not write results.",
    dep: ["heartbeat-detection", "executor-interface", "task-state-machine"]
  },
  "at-least-once-semantics": {
    s: "The guarantee that every scheduled task runs at least once, which allows duplicates after failures but never silent loss.",
    d: "Exactly-once execution would require atomic commit between the orchestrator and every external system, which is not available. So the system retries when unsure, such as after a lost worker, and tasks must tolerate repeats. Fencing, with a unique attempt number checked when writing state, stops a stale copy from overwriting a newer result. It is hard because duplicates are rare and look fine in tests, so the damage appears only under failures.",
    k: ["At-least-once with idempotent tasks vs at-most-once: at-least-once never loses work but needs idempotence, while at-most-once avoids duplicates but silently drops tasks.", "Fence with attempt numbers vs trust the latest writer: fencing blocks stale results, while trusting the latest allows an old attempt to win."],
    p: ["A stale attempt on a partitioned worker commits output after the retry already published.", "Authors assume a task runs exactly once and add non-idempotent side effects."],
    v: "Pause a running task so it is declared lost and retried, resume the original, and confirm only one attempt's state and output are accepted and the stale attempt's writes are refused.",
    dep: ["task-state-machine", "orphan-recovery"]
  },
  "concurrency-limits": {
    s: "Caps on how many task instances can run at once, at the scope of one task, one pipeline, one worker or the whole system.",
    d: "The scheduler counts running and queued instances at each scope before queueing another, and the tightest cap wins. Defaults exist system-wide with overrides per pipeline and task. They protect workers and external systems and bound the effect of a mistake. It is hard because several scopes interact and the counts must be accurate under concurrent scheduling, and because a cap that is too low shows up as unexplained lateness.",
    k: ["Several scopes vs one global cap: several scopes let a team protect a specific system, while a global cap is simple but crude.", "Count queued tasks toward the limit vs only running: counting queued tasks bounds the backlog, while counting only running tasks lets the queue grow."],
    p: ["A task-level cap set to one for safety makes a backfill take weeks.", "Counts drift after crashes, and limits block tasks that are not actually running."],
    v: "Set a pipeline cap of five, trigger twenty tasks, and confirm no more than five run at once, with the rest waiting and the console naming the limit that held them.",
    dep: ["readiness-evaluation", "metadata-database"]
  },
  "max-active-runs": {
    s: "A cap on how many runs of one pipeline may be in progress at the same time.",
    d: "When the number of running runs reaches the cap, new runs stay queued until one finishes. The cap prevents overlapping runs of a pipeline that cannot run concurrently, such as one writing one table, and bounds catchup bursts. A value of one forces sequential runs. It is hard because a stuck run blocks every later one, so one failure turns into a growing queue of late runs.",
    k: ["Cap of one for safety vs allowing overlap: one prevents conflicts, while overlap lets a slow run not delay the next interval.", "Queue excess runs vs skip them: queueing keeps every interval, while skipping avoids pile-up for pipelines that only need the newest."],
    p: ["A hung run with a cap of one blocks all later intervals with no failure visible.", "Reopened runs from a clear use up the cap and block scheduled runs."],
    v: "Set a cap of two with a catchup of ten days and confirm no more than two runs are running at any time, and the rest start in order as slots free.",
    dep: ["run-state-machine", "catchup-policy"]
  },
  "pools": {
    s: "Named sets of slots for a shared resource, such as a database connection limit, that tasks must take before starting.",
    d: "An administrator defines a pool with a number of slots; tasks name a pool and a slot cost. The scheduler only queues a task if enough slots remain, and releases them when it ends. Pools model limits of external systems, not workers. Priority decides who gets a slot when demand exceeds supply. It is hard because pools are global and unrelated pipelines share them, and slots held by waiting tasks waste capacity.",
    k: ["Pools tied to external resources vs to worker capacity: external resource pools protect the real bottleneck, while worker-based ones just restate capacity.", "Slot weights per task vs one slot each: weights model heavy tasks, but need accurate estimates."],
    p: ["Sensors holding pool slots while waiting block the tasks they wait for.", "A pool left at default size becomes the hidden bottleneck for every pipeline using it."],
    v: "Create a pool of three slots, start ten tasks using it, and confirm at most three run at once, with the pool view showing three running and seven waiting.",
    dep: ["readiness-evaluation", "metadata-database"]
  },
  "resource-requests": {
    s: "Declarations of the CPU, memory and special hardware a task needs, used to place it on a worker or in a container with enough capacity.",
    d: "A task states requests and limits, and the executor passes them to the cluster scheduler or picks a worker queue that provides them. Limits are enforced by the host, which kills a task that exceeds memory. Requests drive packing and cost. It is hard because authors guess, and wrong values either waste money or cause kills, and the orchestrator seldom observes real use well enough to suggest better numbers.",
    k: ["Explicit requests per task vs defaults per queue: explicit values fit better, while defaults keep definitions simple and place the choice with operators.", "Hard limits vs best effort: hard limits protect neighbors, while best effort avoids kills but allows noisy neighbors."],
    p: ["A memory limit too low kills tasks only when a larger day of data arrives.", "Requests set high by habit leave cluster capacity reserved and idle."],
    v: "Run a task above its memory request and below its limit, then above its limit, and confirm the first completes and the second is killed with a recorded out-of-memory reason.",
    dep: ["container-executor", "queue-routing"]
  },
  "tenant-quotas": {
    s: "Limits on the share of tasks, slots or runs one team or tenant may use, so one cannot take the entire system.",
    d: "Quotas are expressed as maximum concurrent tasks, pool slots, queue shares or runs per tenant, and the scheduler checks them before queueing. They may be hard caps or guaranteed minimums with borrowing of idle capacity. Tenants map from pipeline ownership metadata. It is hard because quotas need correct ownership data and fairness definitions, and strict caps strand capacity while loose ones fail to protect.",
    k: ["Hard caps vs guaranteed share with borrowing: hard caps are predictable, while borrowing uses idle capacity but needs reclaim when the owner returns.", "Per-tenant queues and workers vs shared with quotas: separate infrastructure isolates fully but costs more."],
    p: ["Pipelines without an owner tag fall into a default tenant and compete with each other.", "A tenant's cap is reached by its own backfill and blocks its important daily work."],
    v: "Run two tenants where one submits a very large backlog and confirm the other keeps its guaranteed share and its tasks start within their normal delay.",
    dep: ["concurrency-limits", "pools", "pipeline-permissions"]
  },
  "admission-control": {
    s: "Decides whether new runs or tasks are accepted, delayed or shed when the system is overloaded, instead of letting every request pile up.",
    d: "Controls include a maximum count of queued tasks, rate limits on run creation from events and the API, and a pause on lower-tier work when the metadata store or queue is slow. Rejected requests get an error, or are held in a buffer. It protects the system from event storms and recovery bursts. It is hard because the signals of overload, such as latency and queue depth, lag, and shed work must be recoverable.",
    k: ["Reject new work vs buffer it: rejection protects the system and pushes retry to senders, while buffering absorbs bursts but can grow without bound.", "Shed low-tier work first vs uniform slowdown: tiered shedding protects important pipelines, while uniform slowdown is fair but hurts critical work."],
    p: ["Dropped event-triggered runs are never replayed, leaving silent gaps.", "A buffer that grows during an outage releases an overwhelming burst on recovery."],
    v: "Send events at ten times the configured rate and confirm the run creation rate holds at the limit, excess requests receive explicit responses, and critical-tier runs are unaffected.",
    dep: ["control-api", "scheduling-loop", "metrics-export"]
  },
});
