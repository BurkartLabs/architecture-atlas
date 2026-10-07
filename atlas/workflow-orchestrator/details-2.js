// Details for the workflow orchestrator plate, part 2: parameters and versioning, scheduler, dependencies, backfills.
ATLAS.details("workflow-orchestrator", {
  "run-parameters": {
    s: "Values supplied to a run when it starts, by the schedule, an operator or an API call, that change what its tasks do without changing the definition.",
    d: "Parameters have declared names, types and defaults, and are validated when a run is created. A scheduled run gets defaults plus the logical date and interval; a manual or API run can override them. They are stored with the run so a rerun uses the same values, and tasks read them through templating or their context. It is hard because parameters are inputs from outside the review process, so they need validation, and rerunning with changed values breaks reproducibility.",
    k: ["Typed, validated parameters vs free-form configuration: validation rejects bad runs at creation, while free-form is flexible but fails late inside a task.", "Parameters frozen at run creation vs read live: frozen values make reruns reproducible, while live values pick up fixes but make history ambiguous."],
    p: ["A mistyped parameter is accepted and the run processes the wrong dataset for hours.", "A rerun after someone edited a variable behaves differently from the original run with no record of why."],
    v: "Trigger a run with an invalid parameter and confirm it is rejected before any task starts, then trigger with a valid one and confirm the stored value appears in the run record.",
    dep: ["templating", "control-api", "metadata-database"]
  },
  "templating": {
    s: "A text substitution step that fills task arguments with run-specific values such as dates, intervals, parameters and variables before the task executes.",
    d: "Fields marked templated are rendered at the start of an attempt using the run's context: logical date, interval start and end, run identifier, parameters and helper functions. Rendering happens on the worker, so values reflect that attempt. Templates make one definition produce correct paths and queries per date. It is hard because errors appear at run time, not parse time, and because templates executed with user-supplied values can run unintended code.",
    k: ["Render at run time vs at parse time: run time has the real context and the actual date, while parse time catches syntax errors early but lacks them.", "Full expression language vs plain substitution: expressions allow conditions and date arithmetic, but are harder to review and secure."],
    p: ["A template with a typo in a rarely used field passes review and fails at midnight.", "Rendered values containing secrets are saved in the task's displayed fields."],
    v: "Open the rendered view of a task for a chosen past run and confirm date-dependent fields show that run's values, not the current date's.",
    dep: ["run-parameters", "data-intervals", "variable-store"]
  },
  "variable-store": {
    s: "A key-value store of settings that pipelines read at run time, editable without redeploying definitions.",
    d: "Values live in the metadata store, an environment mapping or a secrets backend, and are read by tasks or templates. They suit environment-specific settings such as bucket names, feature flags and thresholds. Each read can be a database query, so reading them at the top level of a definition causes load on every parse. It is hard because they are global, mutable and weakly versioned: a change affects all pipelines that read it immediately.",
    k: ["Variables in the database vs in files under version control: the database allows quick edits and no deploy, while files give review and history.", "Read at parse time vs at run time: parse time is convenient but multiplies database reads and bakes values into the graph."],
    p: ["Editing a shared variable during a run changes behavior between a pipeline's early and late tasks.", "Reading a variable at import time sends thousands of queries per parse cycle."],
    v: "Change a variable while a long run is in progress and confirm which tasks saw the old and new values, and confirm parsing issues no database reads for it.",
    dep: ["metadata-database", "secrets-backends"]
  },
  "connections-registry": {
    s: "A named registry of endpoints and credentials for external systems, so tasks refer to a connection by name instead of embedding host and password.",
    d: "Each connection has a type, host, port, login, secret and extra settings, stored in the metadata store, environment values or a secrets backend. Operators and hooks look up a connection by identifier at run time and build a client. A registry lets the same pipeline point at staging or production by changing which connection resolves. It is hard because it is a store of credentials that many pipelines share.",
    k: ["Connections in the database vs a secrets backend: the database is convenient and editable in the console, while the backend gives rotation, audit and stronger storage.", "One connection per system vs per pipeline: shared connections are easy to maintain, while per-pipeline gives least privilege."],
    p: ["Everyone who can edit connections can read the secrets, since the editor shows them.", "Pipelines use a default connection name that silently points at production from a test environment."],
    v: "Point the same pipeline at a staging connection by changing only the registry entry and confirm its logs show the staging host with the password masked.",
    dep: ["secrets-backends", "metadata-database", "secret-masking"]
  },
  "definition-versioning": {
    s: "Keeps track of which version of a pipeline definition produced each run, and how runs in flight behave when the definition changes.",
    d: "Definitions usually live in a source repository, so history is in version control, while the orchestrator itself may only hold the latest parsed copy. Better systems stamp each run with a version and keep the serialized graph used for it, so the UI and reruns reflect what actually ran. In-flight runs either continue on the old version or pick up the new one. It is hard to decide the behavior when tasks are added or removed mid-run.",
    k: ["Pin each run to the version it started with vs always use the latest: pinning is reproducible, while latest picks up fixes immediately but changes a run's shape midway.", "Orchestrator-stored versions vs relying on the repository: stored versions are self-contained, while repository versions avoid duplication but require a link back."],
    p: ["Removing a task from the file makes it vanish from the history of earlier runs.", "A rerun of an old date uses today's logic and produces results that differ from the original."],
    v: "Change a task's arguments, then clear and rerun a run made before the change, and confirm the run record shows which definition version executed and that version is retrievable.",
    dep: ["serialized-definitions", "definition-sync"]
  },
  "definition-sync": {
    s: "The mechanism that moves pipeline definitions from their source into the places the scheduler, parser and workers read them.",
    d: "Common paths are a shared volume, a synchronizing process pulling from a repository on an interval, files packaged into the worker image, or an upload to object storage. The scheduler side and the worker side must see compatible versions, otherwise a task is scheduled for code that the worker does not have. It is hard because synchronization is not atomic across components and may leave them disagreeing for a time.",
    k: ["Pull sync on an interval vs bundle in the image: pull updates in minutes without a rebuild, while bundling gives exactly consistent versions at the cost of slower deploys.", "One definition source for all components vs per component copies: one source avoids skew but becomes a shared dependency."],
    p: ["A worker with an older copy fails a task that the scheduler thinks exists.", "A half-synchronized folder is parsed mid-copy and reports spurious import errors."],
    v: "Merge a change that adds a task and confirm that within the documented delay the scheduler, the workers and the console all show that task, with no import errors in between.",
    dep: ["definition-parser", "artifact-storage"]
  },
  "pipeline-testing": {
    s: "Tools and practices for checking a pipeline before it reaches production: parse tests, single-task runs, and whole-graph runs against fixtures.",
    d: "At the lightest level, tests load every definition and assert that it parses, has no cycles, and meets team rules such as an owner and retries set. Next, a command runs one task for a date without recording state. A full local run executes the graph in-process with test connections and sample data. It is hard because task logic mostly talks to external systems that are difficult to fake, so many tests check wiring but not data correctness.",
    k: ["Parse-only checks in CI vs full runs against sample data: parse checks are fast and catch the common breaks, while full runs catch logic errors but need fixtures and time.", "Mocked connections vs a real staging environment: mocks are quick and isolated, while staging reveals real integration problems and costs more to keep alive."],
    p: ["A passing parse test gives false confidence for pipelines that fail only at run time with real data.", "Tests that execute against production connections modify real data."],
    v: "In CI, introduce a task with no owner and a deliberate cycle in two branches and confirm each causes a distinct failing check before merge.",
    dep: ["definition-parser", "command-line"]
  },
  "timetables": {
    s: "Rules that define when a pipeline's runs are due: calendar expressions, fixed intervals, irregular business calendars or none at all.",
    d: "A timetable maps from the previous run to the next run's data interval and trigger time. Simple forms are calendar expressions and fixed frequencies; custom ones encode business days, month-end or holiday calendars. The scheduler asks it for the next interval after each run is created. Pipelines can also be unscheduled and only triggered by events or hand. It is hard because calendars interact with time zones, daylight changes and variable-length months.",
    k: ["Calendar expressions vs custom timetable code: expressions are universal and readable, while code expresses business calendars at the cost of a program to maintain and test.", "Fixed intervals vs calendar-aligned ones: fixed intervals are simple to reason about, while aligned ones match how people ask for reports."],
    p: ["A month-end schedule written as day thirty-one skips months that are shorter.", "A pipeline scheduled at the same minute as hundreds of others creates a thundering herd at the top of the hour."],
    v: "Generate the next twelve run times for a schedule across a daylight saving change and confirm each lands where specified, with no duplicate and no skipped run.",
    dep: ["clock-and-timezones", "data-intervals"]
  },
  "data-intervals": {
    s: "The start and end of the slice of data a run is responsible for, computed by the schedule and passed to tasks explicitly.",
    d: "For each run the timetable computes an interval, such as midnight to midnight for a day. Tasks use the boundaries in queries and file names rather than the wall clock. The run's trigger time is usually the interval's end. Manually triggered runs get an interval too, often a degenerate one. It is the mechanism that makes backfills and reruns correct, because the same interval always names the same data.",
    k: ["Explicit interval boundaries vs only a single logical date: boundaries remove ambiguity for irregular schedules, while one date is easier to read for simple daily jobs.", "Half-open intervals vs closed ones: half-open intervals avoid double counting the boundary row, while closed ones read more naturally and invite duplicates."],
    p: ["Using the end boundary as an inclusive filter counts boundary events in two adjacent runs.", "Manual runs with no real interval make tasks read an empty or inverted range."],
    v: "Run two adjacent intervals and confirm every source row falls in exactly one of them, with the sum of both counts equal to a query over the combined range.",
    dep: ["timetables", "clock-and-timezones"]
  },
  "scheduling-loop": {
    s: "The repeating process in the scheduler that finds due schedules, creates runs, finds ready tasks and sends them to the executor.",
    d: "Each iteration queries the metadata store for pipelines whose next run is due, creates runs, then selects task instances whose dependencies are met and which fit under limits, marks them queued and passes them to the executor. It also processes executor events such as task completion. Doing this in bounded batches keeps latency stable. It is hard because the loop must be fast and correct under concurrency, and a slow query makes every pipeline late.",
    k: ["Fixed polling interval vs event-driven wakeups: polling is simple and robust, while events cut latency but must still fall back to polling to avoid missed signals.", "Large batches vs small ones: large batches use the database well, but a long batch delays urgent work."],
    p: ["A single pathological pipeline with huge fan-out dominates the loop and delays others.", "A loop that handles an exception by skipping the whole iteration never schedules anything and appears healthy."],
    v: "Create one thousand runnable tasks and confirm the loop queues them in bounded time per iteration, with loop duration and ready-to-queued delay within the stated target.",
    dep: ["run-creation", "readiness-evaluation", "executor-interface", "metadata-database"]
  },
  "run-creation": {
    s: "Creates a new run record for a pipeline and interval, along with its pending task instances, in one consistent step.",
    d: "When a schedule is due, a manual trigger arrives or an asset update fires, the scheduler inserts a run row with its logical date, interval, parameters and definition version, and typically creates task instance rows up front or lazily. A uniqueness constraint on pipeline plus logical date prevents duplicates. It is hard because several scheduler replicas can race to create the same run, so the database constraint, not application logic, must guarantee exactly one.",
    k: ["Create all task rows up front vs lazily as they become ready: up front shows the whole run immediately, while lazy saves rows for large or mapped graphs.", "Unique key on pipeline and date vs on run identifier only: the first blocks duplicates for schedules, while the second allows deliberate multiple manual runs for one date."],
    p: ["Two schedulers create the same run because the uniqueness is only checked in code.", "Creating rows for a graph of ten thousand tasks takes long enough to stall the loop."],
    v: "Start two scheduler replicas against one due schedule and confirm exactly one run exists for that interval, with each task instance present once.",
    dep: ["timetables", "metadata-database", "definition-versioning"]
  },
  "readiness-evaluation": {
    s: "Decides for each task instance whether it can run now: dependencies satisfied, trigger rule met, limits open and not already queued.",
    d: "The evaluator reads upstream states and applies the task's trigger rule, then checks that its run is active, the pipeline is not paused, and concurrency and pool slots are available. Tasks that are ready move to scheduled and then queued. It also sets skipped or upstream-failed states for tasks whose rule can never be met. It is hard because it is the hottest query in the system and must be accurate under concurrent state changes.",
    k: ["Evaluate all tasks each pass vs only those affected by a change: full evaluation is simple and self-healing, while incremental is faster but can miss a state change.", "Check limits before or after dependencies: checking dependencies first avoids consuming slots for tasks that cannot run anyway."],
    p: ["A task is judged ready from a stale read just after its upstream was cleared and runs on old data.", "Tasks whose rules can never be met stay in none state forever without being marked."],
    v: "Complete the last upstream task of a join and confirm the join is queued by the next loop, and clear an upstream task and confirm the downstream is not queued while it is rerunning.",
    dep: ["task-state-machine", "trigger-rules", "concurrency-limits", "pools"]
  },
  "priority-ordering": {
    s: "Chooses which of many ready tasks to start first when capacity is limited, using priority weights, age and fairness rules.",
    d: "Each task has a priority weight, often summed with its downstream weights so that tasks on long chains go first. The scheduler orders candidates by priority, then by date, then by age, up to the available slots. Fairness policies add a per-pipeline or per-tenant share so high priority work does not starve the rest. It is hard because absolute priorities starve low ones, while pure first-in-first-out lets bulk work block urgent work.",
    k: ["Strict priority vs weighted fair share: strict is predictable for urgent work, while fair share avoids starvation but gives no hard guarantee.", "Older logical dates first vs newest first: oldest first drains backlog in order, while newest first restores freshness quickly after an outage."],
    p: ["A backfill with equal priority to a daily report delays the report past its deadline.", "Low priority tasks wait forever on a permanently busy system."],
    v: "Queue a thousand low priority backfill tasks and one high priority task with a single free slot, and confirm the high priority task starts on the next loop.",
    dep: ["readiness-evaluation", "pools"]
  },
  "scheduler-ha": {
    s: "Running several scheduler processes at once so that scheduling continues when one fails, and so that capacity scales with load.",
    d: "Replicas do not talk to each other; they coordinate through the metadata store using row locks that skip rows another replica holds, so each task instance is claimed by one. If one dies, the others keep going and its in-flight claims are recovered by timeouts. Replicas also scale the loop across more pipelines. It is hard because it relies on correct locking in the database, and because it can mask a slow database by adding more contenders.",
    k: ["Lock-based active-active replicas vs one leader with standbys: active-active uses all replicas and fails over instantly, while leader election is simpler to reason about but leaves capacity idle.", "More replicas vs a faster single loop: replicas scale throughput, but add lock contention that can lower it."],
    p: ["Replicas on databases without skip-lock support serialize or deadlock under load.", "Replicas with different definition versions disagree on a pipeline's graph."],
    v: "Kill the replica that holds the most claims during a busy period and confirm remaining replicas continue scheduling, with no task started twice and none left unclaimed past the recovery timeout.",
    dep: ["row-locking", "metadata-database", "heartbeat-detection"]
  },
  "heartbeat-detection": {
    s: "Detects tasks and processes that stopped reporting, so work on dead workers can be marked failed and retried.",
    d: "A running task updates a heartbeat timestamp at an interval through its supervisor. The scheduler or a cleanup job looks for running attempts whose heartbeat is older than a threshold and fails them, usually as a retriable failure. The same idea applies to schedulers and workers. It is hard to set the threshold: too short and a database pause fails healthy tasks, too long and a lost worker holds a slot and a run for a long time.",
    k: ["Heartbeats written by the task process vs by a supervisor: a supervisor still reports while the task is stuck, while task-process heartbeats prove progress but need task cooperation.", "Short threshold vs long threshold: short detects loss quickly but misjudges slowness, long is tolerant but extends the outage."],
    p: ["A paused virtual machine resumes and reports as a second copy of an attempt already declared dead.", "A flood of heartbeat writes from many tasks becomes the main load on the database."],
    v: "Kill a worker host abruptly and confirm its attempts are marked failed after the threshold and retried elsewhere, with each attempt recorded.",
    dep: ["metadata-database", "task-state-machine"]
  },
  "upstream-dependencies": {
    s: "Edges between tasks meaning that one may start only after another reaches an acceptable state, forming the order within a run.",
    d: "Dependencies are declared in the definition and stored in the graph. At run time the scheduler reads each task's parents' states and applies the trigger rule. Dependencies are within one run: the same logical date. Optionally a task can depend on its own previous run's state, which serializes runs. It is hard because the graph structure determines the possible parallelism, and because adding an edge is cheap while its cost in lost parallelism is hidden.",
    k: ["Explicit edges vs inferred from data use: explicit edges are visible and reviewable, while inferred edges are less work to write but invisible and fragile.", "Depend on the previous run vs run independently: depending on it enforces order for stateful loads, but one failure blocks every later date."],
    p: ["Unneeded edges force sequential execution of work that could run in parallel.", "A missing edge lets a task read data that its upstream is still writing."],
    v: "Run a graph with two independent chains and confirm they overlap in the timeline, while a task with a declared edge never starts before its parent's end time.",
    dep: ["dag-model", "task-state-machine"]
  },
  "sensors": {
    s: "Tasks whose job is to wait for an outside condition, such as a file, a partition, a message or another pipeline, before downstream work starts.",
    d: "A sensor repeatedly checks a condition at an interval until it is true or a timeout expires. In poke mode it holds a worker slot while waiting; in reschedule mode it releases the slot between checks; in deferred mode it hands the wait to the trigger service. Timeouts turn non-arrival into a failure or a skip. It is hard because many waiting sensors consume workers or database writes, and because a condition checked at one time may change later.",
    k: ["Poke vs reschedule vs deferred: poke gives lowest latency but holds a slot, reschedule frees slots but adds scheduler churn, deferral is cheapest but needs the extra service.", "Fail on timeout vs soft-skip: failing raises the alarm for missing data, while skipping lets optional pipelines continue."],
    p: ["Hundreds of poking sensors fill the worker pool so the tasks they wait for cannot run.", "A sensor that sees a file appear reads it before the writer has finished."],
    v: "Start fifty sensors waiting on a file in deferred mode and confirm they hold no worker slots, then create the file and confirm all proceed within the check interval.",
    dep: ["trigger-service", "pools", "task-timeouts"]
  },
  "trigger-service": {
    s: "A lightweight asynchronous process that waits on many external conditions at once, so tasks can give up their worker while they wait.",
    d: "A task defers by naming a trigger and a resume point. The trigger service runs thousands of triggers concurrently in an event loop, checking timers, files, queues or remote job status, and when one fires, it writes an event so the scheduler reschedules the task to continue at its resume point. It is hard because trigger code runs in a shared process: a blocking call stalls every trigger, and a crash loses in-memory state that must be rebuilt from the database.",
    k: ["Shared event loop vs one process per waiter: sharing handles thousands of waits cheaply, while process isolation prevents one bad trigger from blocking others.", "Triggers stored in the database vs only in memory: storage survives restarts and lets other replicas take over, at the cost of writes."],
    p: ["A trigger that makes a blocking network call freezes all other triggers.", "After a restart some triggers are never reassigned and their tasks wait forever."],
    v: "Defer one thousand tasks on a timer, restart the trigger service, and confirm all one thousand resume on time with none duplicated or lost.",
    dep: ["metadata-database", "readiness-evaluation", "process-supervision"]
  },
  "data-assets": {
    s: "Named records of data a pipeline produces or consumes, such as a table or file collection, with a history of when it was updated.",
    d: "A task declares assets it updates (outlets) or reads (inlets). When the task succeeds, the system records an update event for each outlet, with optional metadata like row counts. Assets are identified by a name or location and can be grouped. They connect pipelines through data rather than through time and also form the lineage graph. It is hard because the system records that a task claims to have updated something, not that the data actually changed.",
    k: ["Declare assets explicitly vs infer from queries: explicit declaration is reliable and cheap, while inference needs parsing and misses dynamic cases.", "Asset updates emitted on task success vs by the data system: task success is simple, while data-system events reflect real changes including outside writers."],
    p: ["A task that declares an outlet but writes nothing still triggers every consumer.", "Two names for the same table create separate assets and break the dependency."],
    v: "Run a producer task twice and confirm two update events are recorded for the asset, each with its run and timestamp, and a consumer pipeline sees both.",
    dep: ["metadata-database", "task-state-machine"]
  },
  "data-aware-scheduling": {
    s: "Starts a pipeline when the data it needs has been updated, rather than at a fixed time.",
    d: "A consumer pipeline lists the assets it depends on. When all (or any, or a combination) of them have new update events since its last run, the scheduler creates a run. The run's interval is the span of events. This removes guessing at how long producers take, and gives a natural fan-in. It is hard because events can arrive in bursts, partially, or out of order, and because a pipeline that waits for many assets may run rarely or never.",
    k: ["Run when all inputs updated vs when any updated: all gives consistent inputs but waits for the slowest producer, any is fresher but reruns often.", "One run per event vs coalesced events: per event is precise but costly, while coalescing is cheap but processes multiple updates together."],
    p: ["A producer that stops updating silently stops its consumers, and no failure is raised.", "A burst of one hundred updates creates one hundred runs of an expensive pipeline."],
    v: "Update only one of two required assets and confirm no run is created, then update the second and confirm exactly one run starts with both events attached.",
    dep: ["data-assets", "run-creation", "timetables"]
  },
  "cross-pipeline-dependencies": {
    s: "Ways one pipeline waits for or starts another: a sensor on another run, a task that triggers a run, or a shared asset.",
    d: "A task can trigger another pipeline's run, optionally waiting for it to finish and passing parameters. A sensor can wait for a specific task or run in another pipeline for the same logical date. Because the two pipelines have separate schedules, mapping between their intervals needs an explicit offset. It is hard because these dependencies are invisible in either graph alone, and failures and clears do not propagate across them automatically.",
    k: ["Trigger the downstream pipeline vs wait on the upstream one: triggering gives control at the source, while waiting keeps pipelines decoupled but couples schedules.", "Shared assets vs direct links: assets decouple producers and consumers, while direct links show the relationship explicitly."],
    p: ["Clearing the upstream pipeline does not clear its downstream, leaving it computed from old output.", "Mismatched schedules make the waiting sensor look for a date that never exists."],
    v: "Fail the upstream pipeline's task for one date and confirm the downstream's waiting task fails or times out for that date alone and starts correctly after the upstream is cleared.",
    dep: ["sensors", "data-aware-scheduling", "data-intervals"]
  },
  "external-event-triggers": {
    s: "Starts runs in response to events from outside, such as a message on a queue, a webhook, a file notification or a database change.",
    d: "An external system calls the control API or a listener consumes from a queue and creates a run with the event's payload as parameters. This replaces polling with a push, and suits irregular arrivals. The orchestrator must authenticate callers, deduplicate repeated events, and limit the rate. It is hard because the event source defines delivery guarantees: duplicates and losses are likely, and the orchestrator must handle both without relying on the sender.",
    k: ["Push through the API vs a listener pulling from a queue: the API is simple, while a queue buffers bursts and survives downtime.", "One run per event vs batching events into a window: per event gives low latency, while windows reduce overhead and give consistent inputs."],
    p: ["A sender retry creates duplicate runs for one file notification.", "A burst of events starts hundreds of runs at once and exhausts pools."],
    v: "Send the same event three times with the same identifier and confirm exactly one run is created, and send a burst of one thousand and confirm the run rate stays below the configured limit.",
    dep: ["control-api", "admission-control", "run-creation"]
  },
  "catchup-policy": {
    s: "The setting that decides whether the scheduler creates runs for every missed interval since the start date or only the latest one.",
    d: "With catchup on, a pipeline created with a start date last year gets a run for each interval between then and now, usually all at once, limited by active run caps. With it off, only the most recent interval runs. The choice reflects whether each interval's data must be processed individually. It is hard because enabling it by accident is a common way to flood a system, and disabling it silently drops history that must be processed.",
    k: ["Catchup on vs off: on gives complete history without manual work, while off avoids floods and suits pipelines that only process the latest state.", "Catchup limited to a window vs unbounded: a window bounds the burst, but needs a decision on how old is too old."],
    p: ["A new pipeline with an old start date launches thousands of runs and saturates shared resources.", "Turning catchup off during an outage skips intervals that were expected to be processed."],
    v: "Create a daily pipeline with a start date thirty days ago and confirm the number of runs created matches the catchup setting, with active runs never exceeding their limit.",
    dep: ["timetables", "max-active-runs", "run-creation"]
  },
  "backfill-jobs": {
    s: "A request to run a pipeline for a range of past intervals, tracked as a job with progress and a way to cancel it.",
    d: "An operator specifies a pipeline, a date range and options such as running in reverse order, reprocessing completed intervals, or limiting concurrency. The system creates a run for each interval, tracks progress, and reports which succeeded and failed. Backfills use the same execution path as regular runs but with their own limits. It is hard because they are bulk, long-running and write to production data stores, so a mistaken range causes expensive and visible damage.",
    k: ["Backfill as a first-class job vs a loop of manual triggers: a job gives progress, cancel and limits, while manual triggers are simple but ungoverned.", "Newest first vs oldest first: newest first restores recent data early, while oldest first suits stateful pipelines that depend on order."],
    p: ["A backfill over the wrong range overwrites correct historical data with the output of new logic.", "A backfill starved by live runs never finishes, while one with priority starves live runs."],
    v: "Backfill thirty days with concurrency limited to three, and confirm at most three runs are active, progress counts reach thirty, and cancel stops new runs while letting active ones end.",
    dep: ["run-creation", "backfill-concurrency", "audit-trail", "idempotent-task-design"]
  },
  "backfill-concurrency": {
    s: "Limits that keep a backfill from overwhelming workers, data stores and live pipelines, such as maximum parallel runs and reserved capacity.",
    d: "Controls include a cap on simultaneous backfill runs, a dedicated pool or queue, a lower priority, and a requirement that runs for stateful pipelines go in order. The target is usually an external system, such as a warehouse or API, that can serve limited parallel load. It is hard because the right limit is not visible to the orchestrator, so operators pick it by hand, and live pipelines compete for the same data store.",
    k: ["Dedicated backfill capacity vs shared pools with low priority: dedicated capacity isolates live work but sits idle, while sharing uses all capacity but live work can be delayed.", "Ordered execution vs parallel: order protects dependent state, while parallel completes much sooner for independent intervals."],
    p: ["A parallel backfill passes the orchestrator's limits but exhausts the database those tasks write to.", "Ignoring the dependency on past runs makes a stateful backfill compute wrong values in parallel."],
    v: "Run a backfill during live traffic and confirm live pipeline start delays stay within their normal range while the backfill uses only its reserved slots.",
    dep: ["pools", "max-active-runs", "priority-ordering"]
  },
  "clear-and-rerun": {
    s: "Resets selected task instances to their initial state so the scheduler runs them again, with options for including upstream, downstream or only failed ones.",
    d: "Clearing sets state to none, increments an attempt counter or starts a new try, and optionally resets downstream tasks and the run's state back to running. The scheduler then treats them like fresh work. It is the standard recovery step after fixing a bug or a data problem. It is hard because the selection is a set operation on a graph and a date range, and because earlier attempts' logs and outputs must be kept for comparison.",
    k: ["Keep history of cleared attempts vs overwrite: keeping lets people compare before and after, while overwriting saves rows.", "Clear only failed vs clear everything downstream: only failed is minimal, while downstream clearing guarantees consistent outputs."],
    p: ["Clearing a task whose output is consumed by a finished downstream leaves two inconsistent datasets.", "A clear of a large range at once starts thousands of tasks beyond what limits would handle in a day."],
    v: "Clear a failed task after fixing its code and confirm a new attempt starts, prior attempt logs remain viewable, downstream tasks run after it, and the run returns to success.",
    dep: ["task-state-machine", "run-state-machine", "manual-trigger-and-clear"]
  },
  "idempotent-task-design": {
    s: "The authoring practice of writing tasks so that rerunning them for any interval gives the same final result, which makes catchup and backfill safe.",
    d: "Practices include deriving all inputs from the interval and parameters, writing outputs to a location keyed by interval, replacing instead of appending, and keeping tasks free of hidden state. Tasks should not depend on being run in order unless the pipeline declares it. Reviews and shared templates can encode these. The orchestrator can help by passing intervals and stable run identifiers. It is hard because many natural operations, such as counters and notifications, are not idempotent.",
    k: ["Replace the interval's partition vs merge by key: replacing is simple and exact, while merging handles tables updated by several writers.", "Stateless tasks vs tasks that store watermarks: stateless tasks can run for any date, while watermarks are efficient but break under reruns and parallel backfills."],
    p: ["A task that reads the latest watermark instead of its interval produces different output when run for old dates.", "A shared output file written by several intervals is overwritten by the last one to finish."],
    v: "Backfill ten intervals in parallel and then in sequence, and confirm the resulting tables are identical row for row.",
    dep: ["data-intervals", "run-parameters"]
  },
  "missed-run-handling": {
    s: "What the system does when the scheduler was down or paused and intervals passed without runs: skip, run the latest, or run all.",
    d: "On restart the scheduler computes the intervals that came due during the outage and applies the catchup policy. A paused pipeline accumulates no runs until resumed, at which point it can start one or many. Alerts about missed runs depend on deadline checks, not run failures, since no run exists. It is hard because after an outage every pipeline wants to run at once, so recovery needs ordering and limits to avoid a second outage.",
    k: ["Run all missed intervals vs only the latest: all keeps history complete but creates a burst, while latest is quick but loses intervals.", "Stagger recovery vs release all at once: staggering protects shared systems but prolongs lateness for everyone."],
    p: ["After a long outage, thousands of pipelines start at once and overload the metadata store again.", "Missed intervals are silently skipped, and the gap is found weeks later by a consumer."],
    v: "Stop the scheduler for two hours, restart it, and confirm each pipeline creates runs according to its policy, recovery stays within configured limits and a missed-deadline alert was raised during the outage.",
    dep: ["catchup-policy", "sla-tracking", "admission-control"]
  },
});
