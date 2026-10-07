// Details for the workflow orchestrator plate, part 1: interfaces, monitoring, pipeline definitions.
ATLAS.details("workflow-orchestrator", {
  "web-console": {
    s: "The browser interface for browsing pipelines, watching runs, reading logs and taking actions such as pausing, triggering or clearing tasks.",
    d: "It is a thin client over the control API plus a few views that read the metadata store directly. Pages list pipelines with their latest runs, show a grid of runs by task, and link each task attempt to its logs. Actions post to the same service layer the command line uses. It is hard because views must stay fast with thousands of pipelines and millions of task records, and because a click can change production state.",
    k: ["Server-rendered pages vs a client application over the API: server rendering is simpler to secure and cache, while a client application keeps the UI and automation on one contract at the cost of a second code base.", "Polling vs pushed updates for live runs: polling is trivial but loads the database with every open tab; pushing is cheaper per viewer but needs a stream to maintain."],
    p: ["Unbounded list queries over the run table make the page slow exactly when the system is busiest.", "Destructive buttons placed next to routine ones lead to cleared runs and accidental production triggers."],
    v: "With ten thousand pipelines loaded, the home page returns in a couple of seconds, and pausing one pipeline from the page is reflected in the scheduler's next loop with no new run created.",
    dep: ["control-api", "access-control"]
  },
  "graph-view": {
    s: "A drawing of one pipeline's tasks and edges, colored by the state of each task in a chosen run, used to find where a run is stuck or failed.",
    d: "The view reads the serialized graph for structure and the task attempt records for state, then lays out nodes by dependency depth. It shows groups collapsed or expanded, and mapped tasks as a single node with a count. It must handle graphs of several thousand tasks without becoming unreadable, which means collapsing, search and filtering by state, and it must show the structure as it was when that run started, not the current file.",
    k: ["Current definition vs the definition the run used: showing the current graph is simple but misleads after edits, while storing a version per run costs storage and a lookup.", "Client-side layout vs server-side layout: client layout is interactive, but very large graphs freeze the browser and need a precomputed layout."],
    p: ["Drawing the latest definition over an old run shows tasks that never existed in that run.", "A graph with hundreds of parallel mapped tasks renders as an unreadable wall instead of a summary."],
    v: "Open a failed run after deleting a task from the definition and confirm the view still shows that task, in its failed color, with a link to its log.",
    dep: ["serialized-definitions", "task-state-machine", "task-groups"]
  },
  "run-history-view": {
    s: "A timeline of past runs and task attempts showing durations, overlaps, queue waits and retries, used to find slow steps and trends.",
    d: "It reads attempt records for start, queue and end times and plots them as bars per task or per run. The valuable parts are the gaps: time spent waiting in a queue or on a pool slot looks different from time spent running. It also supports comparing durations across days to spot drift. Accuracy depends on timestamps recorded at the right moment by the right component, and clock differences between hosts distort bars.",
    k: ["Recording queued, started and ended separately vs one duration: three timestamps cost a few columns but separate scheduler delay from task slowness.", "Computing aggregates on read vs precomputing: on-read is always current but slow on long histories, precomputed is fast but can disagree with raw records."],
    p: ["Treating queue wait as task runtime sends engineers to optimize code when the real problem is an exhausted pool.", "Timestamps from several hosts with drifting clocks produce attempts that appear to end before they start."],
    v: "Fill a pool so one task waits ten minutes, then confirm the timeline shows ten minutes of queue time and the actual runtime separately.",
    dep: ["run-statistics", "task-state-machine"]
  },
  "command-line": {
    s: "A terminal tool for scripted and emergency operations: listing pipelines, triggering and clearing runs, testing a task, managing variables and checking configuration.",
    d: "It either talks to the control API or opens the metadata store directly, depending on the command. Direct access allows repair when the web service is down, which is why commands for database migration, user creation and task testing usually work that way. It is hard because the same tool serves both safe reads and dangerous writes, and direct commands bypass the checks and audit trail the API enforces.",
    k: ["Direct database access vs API-only: direct access works during outages, but bypasses authorization and audit; API-only is safer but unavailable when you need it most.", "Interactive confirmations vs explicit flags: confirmations prevent mistakes by hand, but break in scripts, so destructive commands need a deliberate non-interactive flag."],
    p: ["A clear command run with a too-wide date range silently wipes the history of a month of runs.", "Scripts that parse human-readable output break when a column is added."],
    v: "Run the test command for one task for a past date against a staging connection and confirm it executes, prints its log and writes no run or attempt record.",
    dep: ["control-api", "metadata-database"]
  },
  "control-api": {
    s: "The programmatic interface for reading and changing pipelines, runs, tasks, variables and connections, used by the console, scripts and other systems.",
    d: "Resources map to the metadata model: pipelines, runs, task attempts, variables, pools. Reads are paginated and filterable; writes validate permissions, then change state or enqueue work. Triggering a run through the API creates a run record with an explicit conf payload and a logical date. It is hard because it must be stable for clients that outlive releases, while the model underneath changes, and because listing endpoints can overload the database.",
    k: ["Versioned stable resources vs mirroring internal tables: stability lets clients survive upgrades, while mirroring is cheaper to build but turns every schema change into a breaking one.", "Idempotency keys on writes vs none: keys let clients retry safely after a timeout, but require storing and expiring them."],
    p: ["An unpaginated listing of all task attempts brings down the database when an integration polls it each minute.", "A trigger call retried after a timeout creates two runs for the same date."],
    v: "Post the same trigger request twice with one idempotency key and confirm exactly one run exists, and that a client without trigger permission gets a refusal and no run.",
    dep: ["access-control", "metadata-database", "audit-trail"]
  },
  "manual-trigger-and-clear": {
    s: "Operator actions that start a run on demand, mark task states by hand, or clear tasks so the scheduler runs them again.",
    d: "A manual trigger creates a run outside the schedule, often with parameters. Marking a task as success or failed overrides its state without running it. Clearing a task resets its state to none and optionally clears downstream tasks, which makes the scheduler treat it as new work. These are the main repair tools. They are hard because they touch live state, and the options (downstream, upstream, past, future, only failed) multiply.",
    k: ["Clear with downstream by default vs task only: including downstream gives consistent data, while task only is surgical but leaves stale outputs below it.", "Manual runs sharing the schedule's limits vs bypassing them: sharing protects resources, but an urgent fix may then wait behind a backlog."],
    p: ["Marking a task as success to unblock the run leaves its output missing, and downstream jobs publish partial data.", "Clearing a whole date range during peak hours floods workers with reruns."],
    v: "Clear one failed task with downstream selected and confirm only that task and its descendants return to a scheduled state, with upstream successes untouched and an audit record naming the operator.",
    dep: ["control-api", "task-state-machine", "audit-trail"]
  },
  "access-control": {
    s: "Authentication of users and programs and the roles and permissions that decide who can view, trigger, edit or delete which pipelines.",
    d: "Identity comes from a built-in user table or an external identity provider. Permissions combine a role (viewer, operator, admin) with optional scope by pipeline, folder or team. Every console and API request checks them, and the scheduler may filter what each user sees. It is hard because permissions must be enforced identically in each interface and because the pipelines' own credentials are a separate, more privileged concern than user access.",
    k: ["Coarse roles vs per-pipeline permissions: roles are easy to audit, while per-pipeline scoping is needed for multi-team use but multiplies rules to maintain.", "Local accounts vs delegated identity: local accounts work anywhere, but delegation gives central offboarding and group mapping."],
    p: ["A viewer role that can read task logs also reads secrets printed into them.", "A permission checked in the console but not the API leaves a path around it."],
    v: "As a user limited to one team's pipelines, list pipelines and trigger one outside the team through the console and the API, and confirm both are refused identically.",
    dep: ["pipeline-permissions", "metadata-database"]
  },
  "audit-trail": {
    s: "A durable record of who did what and when: triggers, clears, state overrides, variable edits, pauses and permission changes.",
    d: "Each state-changing request writes an event with actor, action, target, time and relevant parameters, either in the same transaction as the change or just after. Operators use it to answer why a run exists or why a task was skipped. It is hard because events must not be forgettable, so it must live in the service layer rather than each interface, and because automated actors need identities too.",
    k: ["Same-transaction audit write vs asynchronous write: the first cannot lose events but adds latency and failure coupling, the second can drop events when the process dies.", "Logging parameters in full vs a redacted subset: full detail aids investigation, but may store secrets passed as run parameters."],
    p: ["Direct database repairs leave no trace, so a change is later impossible to explain.", "Audit tables with no retention policy grow until they slow the metadata store."],
    v: "Clear a task through the console, the API and the command line, and confirm three events appear, each with the correct actor and the same target.",
    dep: ["metadata-database", "retention-cleanup"]
  },
  "sla-tracking": {
    s: "Compares each run or task against a deadline, such as finish by seven in the morning, and records a miss when the deadline passes unmet.",
    d: "A deadline is relative to the run's scheduled time or an absolute clock time. A checker, often inside the scheduler or a separate process, scans for unfinished work past its deadline and records a miss and optionally calls a callback. The key point is that a miss is detected by time passing, not by an event, so a run that never starts still misses. It is hard because deadlines depend on the logical date and time zones.",
    k: ["Deadline as duration vs absolute time: durations suit any schedule, but business commitments are phrased as clock times and need conversion.", "Detecting misses in the scheduler vs a separate watcher: the scheduler has the data at hand but a stalled scheduler misses its own absence."],
    p: ["Measuring from actual start rather than scheduled time hides a long delay before the run began.", "A deadline recorded only when the run finishes never fires for a run that hangs."],
    v: "Set a deadline of five minutes on a task, hold it in a queue for ten, and confirm a miss is recorded at the five minute mark while the task has still not started.",
    dep: ["timetables", "clock-and-timezones", "failure-callbacks"]
  },
  "failure-callbacks": {
    s: "User-defined hooks that run when a task or run succeeds, fails, retries or is skipped, used to notify, clean up or trigger other work.",
    d: "On a state transition the system invokes a registered function with context: pipeline, run, task, exception and attempt number. Callbacks may run in the worker, in the scheduler or in a separate process. Running them in the scheduler is dangerous because arbitrary code runs in the critical loop. They are hard because a callback can itself fail, hang or be lost when the worker dies, and must not change the task's outcome.",
    k: ["Callbacks on the worker vs in a callback processor: the worker is simple, but fails with the worker; a dedicated process survives worker loss but adds a component.", "Fire once vs retried callbacks: retrying avoids lost alerts but can send duplicates."],
    p: ["A callback that blocks on a slow external service delays state updates or the scheduler loop.", "A task killed by out-of-memory never runs its own failure callback, so nobody is told."],
    v: "Kill a worker process during a task and confirm the failure callback still fires exactly once, from the system rather than the dead worker.",
    dep: ["task-state-machine", "alert-routing"]
  },
  "alert-routing": {
    s: "Decides which channel and which people receive each alert, based on pipeline ownership, severity, time of day and grouping rules.",
    d: "Events from callbacks, SLA checks and health checks enter a router that looks up owners, deduplicates repeats, groups related failures and chooses email, chat or a paging service. Ownership is stored as pipeline metadata such as team and tier. It is hard because one upstream failure can produce hundreds of downstream alerts, and because ownership data goes stale as teams change.",
    k: ["Alerting on every failure vs only after retries are exhausted: every failure is noisy, while waiting hides a problem until retries finish.", "Per-task alerts vs per-run grouped alerts: grouped alerts reduce noise but make it harder to see which task failed first."],
    p: ["Alerts sent to a former owner's mailbox are never read.", "An outage upstream triggers a flood of alerts that buries the single root cause."],
    v: "Fail one task with fifty downstream tasks skipped and confirm the owner receives one grouped notification naming the root failed task, not fifty.",
    dep: ["failure-callbacks", "metadata-database"]
  },
  "metrics-export": {
    s: "Publishes counters, gauges and timings about the orchestrator and its pipelines, such as queue depth, scheduling delay and task durations, to a monitoring system.",
    d: "Components emit metrics through a collector, and an exporter exposes them for scraping or pushing. The most useful ones are system level: scheduler loop time, tasks queued, running and starved, pool slot use, metadata store latency, and the delay between scheduled time and task start. Per-pipeline metrics have high cardinality when keyed by every task. The difficulty is choosing what to keep.",
    k: ["Labels per task vs per pipeline: per-task detail finds the culprit, but multiplies series and storage.", "Pull vs push export: pull is simple to operate and detects dead targets, while push suits short-lived processes that exit before a scrape."],
    p: ["Metrics from a stuck scheduler stop updating and look the same as a quiet system on a dashboard with no staleness check.", "High-cardinality labels from dynamic task identifiers overwhelm the monitoring backend."],
    v: "Pause all workers and confirm the queued-tasks gauge rises and scheduling delay grows within one scrape interval, then falls when workers return.",
    dep: ["scheduling-loop", "message-broker"]
  },
  "health-checks": {
    s: "Probes that report whether the scheduler, workers and metadata store are alive and doing useful work, not merely running.",
    d: "A liveness check reads the latest scheduler heartbeat from the database and compares it to a threshold. A deeper check confirms the scheduler is actually producing runs and tasks, not just looping. Workers report through the queue or their own heartbeat. Hosting systems use these to restart components. It is hard because a process can be alive and stuck, so checks must measure progress.",
    k: ["Heartbeat age vs end-to-end canary pipeline: heartbeat is cheap, while a canary proves real scheduling and execution but needs its own pipeline to maintain.", "Aggressive vs lenient thresholds: aggressive finds hangs quickly but restarts healthy components during short database pauses."],
    p: ["A heartbeat written by a background thread continues while the main loop is deadlocked.", "A restart loop triggered by a tight threshold makes a slow database outage worse."],
    v: "Freeze the scheduling loop with a debugger while its process stays alive and confirm the check reports unhealthy within its threshold, and the orchestrator restarts it.",
    dep: ["heartbeat-detection", "process-supervision"]
  },
  "freshness-checks": {
    s: "Verifies that the data a pipeline produces is recent and plausible, for example that a table was updated today and contains rows.",
    d: "A check task or external monitor queries the output, such as the latest timestamp, row count, null rate or value range, and compares against thresholds or the previous run. It can run as the last task of the pipeline or as a separate schedule that watches the output regardless of whether the pipeline ran. The independent version is hard to build but catches the case where the pipeline silently stopped.",
    k: ["Check inside the pipeline vs independent monitor: inside is simple and gates downstream tasks, while independent also catches a pipeline that never ran.", "Fixed thresholds vs learned baselines: fixed values are predictable, but baselines adapt to weekday and seasonal patterns at the cost of tuning."],
    p: ["A successful run that wrote zero rows passes every task-level check.", "A check scheduled with the pipeline stops running when the pipeline is paused."],
    v: "Pause the pipeline for one cycle and confirm an independent freshness check alerts that the table is stale, while the pipeline itself shows no failure.",
    dep: ["alert-routing", "timetables"]
  },
  "escalation-and-paging": {
    s: "Escalates unacknowledged alerts through on-call schedules and pages a person for critical pipelines, outside normal working hours if needed.",
    d: "Severe alerts go to a paging service with an on-call rotation. If nobody acknowledges within a time, the alert moves to the next person or team. The orchestrator tags pipelines by tier so that only business-critical ones page, and others wait for working hours. It is hard because the system must decide severity, and because a paging integration that fails silently is worse than none.",
    k: ["Page on failure vs page on missed deadline: failure is immediate but often retried away, while deadline misses relate to business impact and are rarer.", "Per-pipeline tier set by owners vs central tiers: owner-set is easy but inflates, so critical tiers need review."],
    p: ["Every pipeline marked critical makes paging routine and gets alerts ignored.", "Pages sent through a service that depends on the same network that failed are never delivered."],
    v: "Fail a critical-tier pipeline's deadline during a test window and confirm the on-call person is paged, and that unacknowledged pages escalate after the configured delay.",
    dep: ["alert-routing", "sla-tracking"]
  },
  "dag-model": {
    s: "The data model of a pipeline: a set of tasks joined by dependency edges that must form no cycle, plus a schedule, defaults and metadata.",
    d: "A graph holds nodes (tasks) and directed edges (this task runs after that one), validated to be acyclic when loaded. It carries a schedule, start date, default arguments, tags and concurrency settings. Each run is an instance of the graph for one logical date. It is hard because the graph is both a definition and a template: it must be fixed enough to schedule yet expressive enough for dynamic cases like per-partition fan-out.",
    k: ["Static graph known at parse time vs graph built during the run: static graphs are easy to visualize and validate, while runtime graphs handle data-dependent fan-out but cannot be fully inspected in advance.", "One graph per pipeline vs nested graphs: nesting reuses components but complicates state and display."],
    p: ["A cycle introduced by a late edge is detected only when the file is parsed, so it can fail silently in the scheduler.", "Giant graphs with thousands of tasks slow parsing, scheduling and the UI."],
    v: "Add an edge that closes a loop and confirm the definition is rejected with an import error naming the cycle, and the previous valid version keeps running.",
    dep: ["definition-parser"]
  },
  "authoring-sdk": {
    s: "The library authors use to declare pipelines in code or configuration: functions, decorators or markup that build the graph and tasks.",
    d: "Authors write ordinary source files that call the library to create a graph and tasks, or write a declarative format that a loader converts. The SDK offers shortcuts for passing task outputs as inputs, for setting defaults and for grouping. It runs at parse time on every refresh, so code at the top level of a definition executes repeatedly and should be cheap. It is hard because definitions are programs, so they can do anything at parse time.",
    k: ["Code-based vs declarative definitions: code allows loops and reuse, while declarative files are safer to parse and easier to generate and review.", "Implicit wiring from task outputs vs explicit edges: implicit is concise, but hides dependencies that explicit edges would show."],
    p: ["A definition that queries a database at import time makes every parse slow and can fail the whole parser.", "Top-level code reading the current time makes the graph shape differ between parses."],
    v: "Parse a definition file with network access disabled and confirm it loads in under a second and produces the same graph structure on repeated parses.",
    dep: ["dag-model", "task-definition"]
  },
  "task-definition": {
    s: "The description of one unit of work: its operation, arguments, retries, timeouts, resource needs and relationships to other tasks.",
    d: "A task has an identifier unique within its graph, the operation to perform, templated arguments, and policies for retries, timeouts, queue and pool. At run time each execution of it for one run is a task instance with its own state. It is hard to size correctly: a task too coarse restarts too much work on failure, and a task too fine multiplies scheduling overhead and database rows.",
    k: ["Many small tasks vs few large tasks: small tasks retry cheaply and show progress, but add scheduler overhead; large tasks are efficient but rerun everything on failure.", "Task-level policies vs graph-wide defaults: defaults keep definitions short, but task overrides are easy to forget when reviewing."],
    p: ["Renaming a task identifier loses its history and orphans its old state.", "Tasks that do their own internal batching hide progress from the scheduler and the UI."],
    v: "Fail a task in the middle of a run, retry it, and confirm only that task's work repeats and its attempt count and state history are recorded separately from other tasks.",
    dep: ["dag-model", "operator-library"]
  },
  "operator-library": {
    s: "Reusable task types for common operations, such as running a query, transferring files, calling a service or running a command in a container.",
    d: "Each operator wraps a parameterized action and a connection to a system, exposes templated fields, and implements execute plus often cleanup and cancellation. Provider packages bundle operators and hooks for one external system and are versioned separately from the core. It is hard because the quality varies: an operator may not be idempotent, may leak connections, or may poll inefficiently, and upgrading one can change behavior of pipelines that use it.",
    k: ["Many specific operators vs a few generic ones: specific operators give validation and clear logs, while generic ones are flexible but push correctness onto authors.", "Core-bundled vs separately versioned packages: separate versioning lets integrations move fast, but creates compatibility matrices."],
    p: ["An operator that submits remote work and returns immediately reports success while the remote job later fails.", "Upgrading a provider package silently changes default behavior used by hundreds of pipelines."],
    v: "Run an operator against a test system twice for the same date and confirm the second run leaves the destination identical to one run, and that cancellation stops the remote work.",
    dep: ["task-definition", "connections-registry"]
  },
  "dynamic-task-mapping": {
    s: "Creates a variable number of parallel task instances at run time from the output of an earlier task, such as one per file or partition.",
    d: "An upstream task returns a list; the scheduler expands a mapped task into one instance per element, each with its own index, state, logs and retries. A downstream reduce step waits for all and collects their results. The graph is therefore partly decided during the run. It is hard because the expansion count is unbounded, state rows multiply, and limits and display need to cope with thousands of instances.",
    k: ["Mapped instances vs a loop inside one task: instances give per-item retries and visibility, but cost a database row and scheduling pass each.", "Cap on expansion vs unlimited: a cap protects the scheduler from a runaway list, but can make a legitimately large run fail."],
    p: ["An upstream bug returns a million elements, and the scheduler creates a million task rows.", "Passing large payloads through the expansion list overflows the metadata store's value limit."],
    v: "Feed a task a list of fifty files and confirm fifty independent instances run, one fails and retries alone, and the reduce task receives all fifty results in index order.",
    dep: ["task-definition", "inter-task-data", "readiness-evaluation"]
  },
  "task-groups": {
    s: "A way to bundle related tasks under one name for display and shared settings, without creating a separate pipeline.",
    d: "A group is a visual and organizational container: tasks inside have identifiers prefixed by the group, and the group can be collapsed in the graph and given shared dependencies, so one edge into the group attaches to all its entry tasks. Groups can nest. They do not have their own state or schedule. They are hard to design well because they must reduce clutter without hiding dependencies, and because renaming a group renames every task identifier in it.",
    k: ["Groups inside one graph vs separate pipelines linked by triggers: groups keep one run and one state, while separate pipelines isolate failures and schedules but need cross-pipeline wiring.", "Prefixing identifiers by group vs separate namespaces: prefixes keep identifiers globally unique but make them long."],
    p: ["Refactoring a task into a group renames it and breaks history, alerts and references that used its old identifier.", "A dependency set on a group is assumed to be a barrier but only attaches to entry tasks."],
    v: "Collapse a group in the graph view and confirm its single edge into the group matches the edges from upstream to every entry task in the stored graph.",
    dep: ["dag-model", "task-definition"]
  },
  "trigger-rules": {
    s: "Per-task rules deciding when a task may run based on the outcomes of its upstream tasks, such as all succeeded, any failed or all done.",
    d: "The default requires every upstream task to have succeeded. Other rules allow running after any upstream success, after all upstream complete regardless of outcome, only if something failed, or when none failed (allowing skips). The scheduler evaluates the rule from the states of immediate parents. Cleanup and notification tasks use looser rules so they run even after failure. It is hard because combinations with skips and branches produce surprising results.",
    k: ["Strict all-success default vs permissive defaults: strict avoids running on bad data, while permissive suits cleanup but can quietly publish partial results.", "Rules on tasks vs conditions in task code: rules are visible to the scheduler and the graph, while code conditions are flexible but hidden."],
    p: ["A join task after a branch is skipped forever because one of its parents was skipped and the rule requires success.", "A cleanup task with the wrong rule does not run after a failure and leaks resources."],
    v: "Fail one of three parallel tasks and confirm a task with the all-done rule runs, while a task with the all-success rule is marked as upstream failed and does not run.",
    dep: ["task-state-machine", "readiness-evaluation", "skip-propagation"]
  },
  "branching": {
    s: "Lets a task choose at run time which downstream paths to follow, so that unchosen paths are skipped.",
    d: "A branching task returns the identifiers of the next tasks to run. The scheduler marks the other direct descendants as skipped, and skip propagates down paths with no other live parent. A join after the branch needs a trigger rule that tolerates skipped parents. Variants include short-circuit tasks that skip everything downstream and conditions on dates, for example only run weekly steps on Monday. It is hard because skip propagation interacts with trigger rules.",
    k: ["Branch on data at run time vs separate pipelines per case: branching keeps one definition, while separate pipelines give clearer history but duplicate shared steps.", "Skip as a distinct state vs treating it as success: a distinct state keeps history honest, but every rule must handle it."],
    p: ["The join task defaults to requiring all parents succeed, so it never runs after a branch.", "A branch condition that reads mutable data gives a different answer on a rerun of the same date."],
    v: "Run a branch that picks path A and confirm path B tasks end skipped, the join task runs, and the run is marked successful rather than failed.",
    dep: ["trigger-rules", "skip-propagation", "task-definition"]
  },
  "definition-parser": {
    s: "The process that loads definition files, executes or reads them, validates the resulting graphs and stores them for the scheduler.",
    d: "A parser process scans the definitions folder or repository on an interval, loads each file in an isolated subprocess with a time limit, collects the graphs it declares and any import errors, then writes a serialized form to the metadata store. The scheduler reads the serialized form and never runs author code itself. It is hard because parsing cost grows with the number of files and the work they do at import, and a single slow file can delay others.",
    k: ["Parse in a separate process vs inside the scheduler: separation protects the scheduler from slow or crashing author code, at the cost of an extra component and staleness.", "Frequent re-parse vs change detection: frequent parsing picks up dynamic definitions, while change detection saves CPU but misses definitions that depend on external data."],
    p: ["An import error in one shared module breaks every pipeline that imports it, and the scheduler continues with stale versions.", "Parse intervals shorter than the parse time keep every core busy parsing."],
    v: "Introduce a syntax error in one file and confirm only its pipelines show an import error in the console, others keep their current version, and fixing the file clears the error within one parse interval.",
    dep: ["serialized-definitions", "authoring-sdk", "definition-sync"]
  },
  "idempotency-and-reruns": {
    s: "The rule that running a task again for the same inputs produces the same result without duplicate effects.",
    d: "Retries, manual clears, backfills and at-least-once delivery all execute tasks more than once, so every task must tolerate it. Typical techniques are overwriting a partition rather than appending, merge or upsert by key, writing to a temporary location and publishing by rename, and checking whether the output already exists. The orchestrator cannot enforce this, only help: stable run identifiers and logical dates give tasks a deterministic key. It is the largest source of silent data errors.",
    k: ["Overwrite a partition vs append and deduplicate later: overwriting is simple and exact, while appending is cheaper per run but pushes cleanup downstream.", "Pass the logical date explicitly vs read the clock: the logical date makes reruns reproducible, while the clock is easy but different on every attempt."],
    p: ["A task that appends rows doubles the data on every retry after a partial failure.", "A task that sends an email or payment has no safe rerun without an external idempotency key."],
    v: "Run a task three times for the same date, including once interrupted midway, and compare the destination: row counts and checksums must equal those after a single clean run.",
    dep: ["task-runner", "run-parameters"]
  },
  "time-semantics": {
    s: "The definitions of scheduled time, logical date and data interval, and the conventions that map a run to the data it processes.",
    d: "A run covers an interval of data, and by common convention starts when that interval ends, so a daily run for Monday starts early Tuesday. The logical date names the start of the interval and is passed to tasks, while the actual start time is something else. Time zones and daylight saving shift intervals, and some schedules are irregular. Confusion between these is a perennial cause of off-by-one errors, so tasks should receive explicit interval boundaries.",
    k: ["Interval-end triggering vs interval-start triggering: end triggering guarantees the data exists, while start triggering is intuitive but needs the data to arrive after the run begins.", "Schedule in UTC vs local time: UTC is unambiguous, while local time matches business expectations and breaks around daylight saving changes."],
    p: ["A task using the current date instead of the interval reprocesses today's data when backfilling last month.", "A schedule in local time runs twice or not at all on the day clocks change."],
    v: "Trigger a daily pipeline's run for a past date and confirm every task receives interval start and end values for that date, and a task that logs them shows the same values on a retry.",
    dep: ["timetables", "data-intervals", "clock-and-timezones"]
  },
  "failure-semantics": {
    s: "The system-wide rules for what failure means: how attempts are counted, which delivery guarantee applies, what is retried, and when a run is declared failed.",
    d: "A task can fail by raising an error, by timing out, by being killed, or by losing its worker with no report at all. The orchestrator turns each into a state transition, retries within a budget, and then fails the attempt permanently and propagates to downstream tasks. Delivery is at-least-once: a task may run twice, never zero times unless cancelled. Defining clearly which failures are retriable and which are permanent is the hardest part.",
    k: ["Retry everything vs retry only classified errors: retrying everything is simple and masks transient faults, while classification avoids repeating hopeless work but needs maintenance.", "Fail the run on first task failure vs continue independent branches: continuing completes more work, while failing fast saves resources and signals sooner."],
    p: ["Retrying a permanent error such as bad credentials five times only delays the alert.", "A worker lost mid-task appears as running forever unless a heartbeat expires it."],
    v: "Inject a transient error, a permanent error and a worker kill into three tasks and confirm each ends in its documented state with the expected number of attempts and no task stuck in running.",
    dep: ["task-state-machine", "retry-policy", "orphan-recovery"]
  },
  "metadata-store-scale": {
    s: "The limit on how many pipelines, runs and tasks the shared database can serve, which in practice sets the size of the whole system.",
    d: "Every task attempt writes several rows and the scheduler queries them in tight loops, so row counts grow with tasks per day times retention. Hot paths are the scheduling query over runnable tasks, the heartbeat updates and the UI listings. Scale comes from indexes, retention, batching writes, scheduler replicas using row locks and a database sized for write load. Past a point, splitting into several deployments is simpler than scaling one.",
    k: ["One shared store vs one deployment per team: sharing is easy to operate and inspect, while separate deployments bound the blast radius and load.", "Long retention vs aggressive cleanup: long retention helps analysis, but the tables slow every query."],
    p: ["An unindexed query added to the scheduling loop slows every pipeline at once.", "A fleet-wide heartbeat interval turns idle workers into the largest write load."],
    v: "Load the store with a month of synthetic history at expected daily volume and confirm scheduling loop duration and console list latency stay within their targets.",
    dep: ["metadata-database", "retention-cleanup", "row-locking"]
  },
  "multi-tenancy": {
    s: "How multiple teams share one orchestrator without reading each other's data, starving each other's work or exposing each other's credentials.",
    d: "Isolation can be at the level of permissions (who sees what), resources (quotas and pools), execution (separate worker pools and environments) and credentials (secrets scoped per team). The strongest form is a separate deployment per tenant; the cheapest is logical separation inside one. The tradeoff is operational cost against blast radius. It is hard because a shared scheduler and database are shared failure domains whatever the access rules say.",
    k: ["Shared deployment with logical isolation vs one deployment per tenant: shared is cheaper and uniform, while separate removes cross-tenant incidents and is simpler to reason about.", "Shared worker pool vs dedicated pools: shared pools use capacity better, but one tenant's code can reach another's runtime."],
    p: ["Teams see only their pipelines in the console but share one set of connections, so one can use another's credentials.", "A single tenant's runaway backfill fills the shared queue and delays everyone."],
    v: "As tenant A, flood the queue with ten thousand tasks and confirm tenant B's tasks still start within their normal delay, and that A cannot read B's logs or secrets.",
    dep: ["tenant-quotas", "pipeline-permissions", "queue-routing"]
  },
  "observability-of-the-orchestrator": {
    s: "How operators learn that the orchestrator itself is slow, stuck or lagging, as distinct from learning that a pipeline failed.",
    d: "The signals are scheduling delay (scheduled time to task start), queue depth, loop duration, heartbeat age, database latency and worker availability, plus traces of a single task's path from queue to completion. The most useful alert is delay between when a task became ready and when it started. It is hard because a stuck scheduler produces no failures, only silence, so detection has to look for the absence of expected events.",
    k: ["Alert on symptoms such as late tasks vs on component metrics: symptoms match what users feel, while component metrics point to causes sooner but fire on harmless fluctuations.", "Canary pipeline vs passive metrics: a canary tests the whole path, while passive metrics cost nothing but cannot prove progress."],
    p: ["Dashboards that show only failures stay green while the scheduler is down.", "Averaged delays hide a tail of tasks that wait for hours."],
    v: "Stop the scheduler process and confirm an alert fires from the absence of expected scheduling events within the threshold, without any task failing.",
    dep: ["metrics-export", "health-checks", "scheduling-loop"]
  },
});
