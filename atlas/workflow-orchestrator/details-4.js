// Details for the workflow orchestrator plate, part 4: metadata store, logs and lineage, secrets, foundation services.
ATLAS.details("workflow-orchestrator", {
  "metadata-database": {
    s: "The relational database holding pipelines, runs, task attempts, variables, connections, pools and users: the system's source of truth and its coordination point.",
    d: "Schedulers, the parser, executors, the console and the API all read and write it. Tables for runs and task attempts grow with every execution; small tables such as pools and heartbeats are updated constantly. Its transactions provide the atomic state changes and locks that the rest relies on. It is hard because it is both the bottleneck and the single point of failure, and nearly every performance incident ends in a slow query on it.",
    k: ["One shared relational store vs a purpose-built queue plus store: a relational store gives transactions, ad hoc queries and simplicity, while split stores scale throughput but complicate consistency.", "Run on a managed database vs self-hosted: managed gives backups and failover, while self-hosted allows tuning and avoids provider limits."],
    p: ["Long transactions held by reports block the scheduler's row locks and stall scheduling.", "Direct manual edits to state tables bypass invariants and leave runs in impossible states."],
    v: "Fail the primary database over during a busy hour and confirm schedulers reconnect, no run or task is lost or duplicated, and scheduling delay returns to normal within the target.",
    dep: ["db-connection-pooling", "schema-migrations", "database-failover"]
  },
  "schema-migrations": {
    s: "Versioned changes to the metadata schema applied when the orchestrator is upgraded, with a way to check and apply them.",
    d: "Each release carries ordered migration scripts. A command applies them to the database, and components compare their expected version to the actual one at startup. Large tables make some migrations slow and locking, so they may need to run while the system is stopped. It is hard because components of different versions often run together during a rolling upgrade, and a migration that adds a required column breaks old ones.",
    k: ["Expand then contract migrations vs one-step changes: two steps allow rolling upgrades, while one-step changes are simpler but need downtime.", "Run migrations automatically at startup vs by an explicit command: automatic is convenient, while explicit control avoids several components racing to migrate."],
    p: ["A migration that rewrites a table with a hundred million rows holds locks for an hour.", "Rolling back the software after a migration fails because the old version cannot read the new schema."],
    v: "Upgrade a copy of production-sized data and confirm the migration time and lock duration are within the maintenance window, and that a downgrade command restores the previous version's compatibility.",
    dep: ["metadata-database"]
  },
  "row-locking": {
    s: "Database row locks that let several scheduler replicas claim different tasks without conflict or duplicate work.",
    d: "The scheduling query selects candidate rows and locks them for update while skipping rows locked by another transaction, so each replica gets a disjoint set. Locks last for the claim transaction only. Other updates, like state changes, use conditional writes. It is hard because it depends on database features and isolation levels, and because long lock holds, deadlocks between components and lock ordering produce stalls that appear only under load.",
    k: ["Skip-locked claims vs a single leader doing all claiming: skip-locked scales across replicas, while a leader is simpler but caps throughput.", "Short claim transactions vs holding locks through queueing: short claims reduce contention, while long ones guarantee consistency but block other writers."],
    p: ["Two components lock the same rows in different order and deadlock under load.", "A claimed row is lost if the process dies between the claim and the executor receiving the task."],
    v: "Run four scheduler replicas against ten thousand ready tasks and confirm each task is claimed exactly once, lock wait time stays low, and killing one replica mid-claim loses no task.",
    dep: ["metadata-database"]
  },
  "db-connection-pooling": {
    s: "Reuses and limits database connections from schedulers, workers, the console and tasks, so connection counts do not exhaust the database.",
    d: "Each process keeps a small pool of connections, and an external pooler may sit in front to multiplex thousands of short-lived clients onto few server connections. Workers that open a connection per task attempt multiply connections with the number of tasks. Some designs have workers talk to an API instead. It is hard because the total across all components is what matters, and because pooler modes can break session features that components rely on.",
    k: ["Pooler in front of the database vs per-process pools only: a pooler caps total connections, while per-process pools are simpler but sum across every process.", "Workers connect directly vs go through an API: direct is simple, while an API removes credentials and connection load from workers."],
    p: ["A burst of tasks each opening connections hits the database connection limit and fails unrelated requests.", "A pooler that reuses connections between transactions breaks code relying on session-level locks."],
    v: "Start one thousand concurrent tasks and confirm the database's connection count stays below its limit and no task fails with a connection error.",
    dep: ["metadata-database"]
  },
  "retention-cleanup": {
    s: "Deletes or archives old runs, task attempts, logs and events after a retention period so tables and storage stay bounded.",
    d: "A cleanup job removes rows older than a threshold, in batches, and may export them to an archive first. Some data is kept longer: audit events, last successful runs, and records tied to assets. Without it, run and attempt tables grow without limit and slow every query. It is hard because deletes on large tables are costly and lock, because related tables must stay consistent, and because people want long history for investigations.",
    k: ["Delete old rows vs archive then delete: deleting is simple, while archiving preserves history for analysis in cheaper storage.", "Batch deletes during a quiet window vs continuous small deletes: a window is predictable, while continuous deletes spread the load."],
    p: ["A first cleanup after a year of growth runs for hours and blocks the scheduler.", "Cleanup removes a run that a downstream sensor or asset still references."],
    v: "Run cleanup on a table with two years of history and confirm rows older than the policy are gone, newer ones remain, scheduling delay stayed within its target during the job and references are intact.",
    dep: ["metadata-database"]
  },
  "serialized-definitions": {
    s: "Stored, parsed copies of each pipeline graph in the metadata store, which the scheduler and console read instead of executing definition code.",
    d: "After the parser loads a file, it writes a structured representation of graphs and tasks, with a hash to detect change. The scheduler reads it to evaluate dependencies without running author code, and the console reads it for the graph view. Workers still load the actual code to run tasks. It is hard because the serialized form can disagree with the code on a worker, and because fields that exist only at run time are not captured.",
    k: ["Serialize into the database vs read definition files directly: serialization isolates the scheduler from author code and speeds reads, while direct reads are always current but run untrusted code in critical components.", "Keep every version vs only the latest: keeping versions shows what ran, but grows storage."],
    p: ["The scheduler follows the serialized graph while a worker runs a different version of the code.", "Very large serialized graphs slow each scheduling pass that loads them."],
    v: "Edit a definition and confirm the stored hash changes within one parse interval, the scheduler uses the new graph for new runs, and no scheduler process executed the definition file.",
    dep: ["definition-parser", "metadata-database"]
  },
  "database-failover": {
    s: "Backups and replicas of the metadata store, with a tested procedure to restore it or promote a replica after loss.",
    d: "Regular base backups plus continuous log shipping allow point-in-time recovery, and a synchronous or asynchronous replica allows quick promotion. After restoring, the orchestrator's view of the world is behind: tasks may have run since the restore point, so state and reality differ. Pipelines then need reconciliation through idempotent reruns. It is hard because the metadata is small compared to the data pipelines move, so it is easy to neglect.",
    k: ["Synchronous replica vs asynchronous replica: synchronous loses no committed state but adds write latency, while asynchronous is faster and can lose recent transitions.", "Restore from backup vs rebuild from definitions and rerun: restoring keeps history, while rebuilding is cleaner but requires safe reruns of everything uncertain."],
    p: ["After restoring from a backup an hour old, tasks that already ran appear not to have run and are executed again.", "Backups never test-restored turn out to be unusable when needed."],
    v: "Restore the latest backup to a scratch environment, start a scheduler against it and confirm it resumes, with run and task counts matching those at the backup time.",
    dep: ["metadata-database", "artifact-storage"]
  },
  "task-logs": {
    s: "The text output of each task attempt, captured with its start, errors and progress, kept separately for every attempt of every task.",
    d: "The runner redirects the task's standard output and its logging library into a file or stream tagged with pipeline, run, task, attempt and time. It is the first thing read after a failure. Logs from orchestration events, such as scheduling decisions, are separate. It is hard because logs come from processes that may die abruptly, so unflushed output is lost, and because they can contain secrets and personal data.",
    k: ["One log per attempt vs one per task: per-attempt logs make retries comparable, while per-task logs are fewer but interleave attempts.", "Plain text vs structured records: text is simple and readable, while structured records allow search and filtering but need parsing tools."],
    p: ["A task killed by out-of-memory loses its buffered final lines, which held the cause.", "Verbose debug logging fills local disk on workers and takes them down."],
    v: "Kill a task abruptly mid-run and confirm its log still contains output up to within a second of the kill, and is retrievable from the console afterward.",
    dep: ["task-runner", "log-shipping"]
  },
  "log-shipping": {
    s: "Moves task logs off workers into durable shared storage, so they survive worker loss and can be read from anywhere.",
    d: "Logs are written locally and uploaded when the task ends, or streamed continuously to an object store or log service. Containers and autoscaled workers disappear, so local-only logs are lost. Upload on completion is simple but leaves running tasks unreadable. It is hard because uploads can fail, and because the final upload must still happen when the task is killed.",
    k: ["Upload at task end vs stream continuously: end-of-task upload is simple and cheap, while streaming lets people watch running tasks and survives crashes.", "Orchestrator-managed storage vs a general log platform: managed storage is self-contained, while a platform gives search and retention across systems."],
    p: ["A worker terminated by scale-down never uploads its logs, so the failure has no evidence.", "Slow uploads delay the release of the task's slot."],
    v: "Run a task, terminate its worker host immediately afterward, and confirm the full log is available in shared storage from the console.",
    dep: ["task-logs", "artifact-storage"]
  },
  "log-retrieval": {
    s: "Serving a task's logs to the console and API, whether the task is finished, running or its worker is gone.",
    d: "The console requests logs by task attempt. For finished tasks, the server reads them from shared storage; for running ones, it fetches from the worker's log endpoint or the stream and may tail. Access is checked against pipeline permissions. It is hard because logs can be large, the source differs by task state, and a reader must not block the worker or the database, and pagination must be correct.",
    k: ["Fetch from the worker while running vs wait for shipping: fetching gives live output but needs network access to workers, while waiting is simple but delayed.", "Return whole logs vs paginate or tail: whole logs are simple, while pagination handles very large logs without freezing the browser."],
    p: ["A log request for a huge task loads the whole file into the web server's memory.", "Logs readable by anyone who can see the pipeline expose secrets printed by tasks."],
    v: "Open a running task's logs and confirm new lines appear within seconds, then open a finished attempt on a terminated worker and confirm the same content loads from storage.",
    dep: ["log-shipping", "access-control"]
  },
  "lineage-events": {
    s: "Records of which datasets each task read and wrote, emitted as structured events for a lineage or catalog system.",
    d: "On start, success and failure, the runner emits an event naming the run, task, inputs and outputs, and optionally schema and row counts, in an open format that a lineage service collects. Operators can extract inputs and outputs automatically from queries or declared assets. The result is a graph of how data flows across pipelines. It is hard because coverage is partial: tasks that run opaque code cannot report what they touched.",
    k: ["Automatic extraction vs author declaration: extraction scales with no work, while declarations are accurate where authors maintain them.", "Emit from the orchestrator vs from the data systems: orchestrator events know the run context, while data-system events capture all writers."],
    p: ["Lineage claims a dataset comes from a task that failed halfway, and consumers trust it.", "Missing lineage for custom tasks leaves gaps that look like no dependency."],
    v: "Run a pipeline of three tasks and confirm the catalog shows an edge from the input to the intermediate to the final dataset, each tied to the correct run identifier.",
    dep: ["data-assets", "task-runner"]
  },
  "run-statistics": {
    s: "Aggregated history of run and task durations, success rates and delays, used for trends, capacity planning and spotting regressions.",
    d: "Statistics derive from attempt records: duration, queue wait, attempts per success, and outcome per day. They back charts in the console and feed alerts for duration anomalies and flakiness. Heavy aggregation over raw history can load the database, so rollups may be precomputed or copied to an analytics store. It is hard because retention deletes the raw data that long-term trends need, and averages hide tail behavior.",
    k: ["Query raw attempts on demand vs maintain rollups: on-demand is always exact, while rollups are fast and survive retention.", "Export to a separate analytics store vs keep in the metadata store: exporting protects the scheduler's database, while keeping avoids another pipeline to maintain."],
    p: ["A dashboard query scanning a year of attempts competes with the scheduler for the database.", "Average durations hide the slowest tenth of runs that miss deadlines."],
    v: "Load a year of history and confirm the duration chart for one pipeline loads within a few seconds without raising scheduling delay.",
    dep: ["metadata-database", "retention-cleanup"]
  },
  "secrets-backends": {
    s: "Integration with a dedicated secret store, so passwords, keys and tokens are fetched at run time rather than held in the orchestrator's database.",
    d: "When a task asks for a connection or variable, the lookup first consults a configured backend, using a path convention, and falls back to the metadata store or environment. Values are fetched per attempt, optionally cached for a short time. Access to the backend uses the orchestrator's identity. It is hard because the backend is a runtime dependency: if it is slow or down, tasks fail to start, and caching trades freshness against load.",
    k: ["Fetch per attempt vs cache for a period: per attempt always gets rotated values, while caching reduces load and tolerates short backend outages.", "Backend first vs database first: backend first centralizes secrets, while database first is faster but leaves stale copies."],
    p: ["A backend outage stops every pipeline that needs credentials, even though the data systems are healthy.", "A path naming convention lets one pipeline request another team's secrets."],
    v: "Rotate a secret in the backend and confirm the next task attempt uses the new value, and that with the backend unreachable tasks fail with a clear error naming it.",
    dep: ["workload-identity", "variable-store", "connections-registry"]
  },
  "secret-masking": {
    s: "Redacts known secret values from logs, rendered fields and the console so that credentials are not shown to people with log access.",
    d: "Values fetched as secrets, or fields with sensitive names, are registered with the runner, which replaces them with a mask in log output and displayed task fields. Masking works on exact matches, so encoded or partial forms may slip through. It is a defense for accidents, not a guarantee. It is hard because secrets can appear in transformed forms, in exceptions from other systems, or in files tasks write elsewhere.",
    k: ["Mask by value at the log writer vs by field name: value masking catches leaks anywhere in output, while name masking is cheap but misses secrets in other fields.", "Mask in the console only vs at the source: source masking protects stored logs, while console masking leaves raw data in storage."],
    p: ["A secret that is base64 encoded or split across lines passes through unmasked.", "Short or common secret values mask unrelated text and make logs unreadable."],
    v: "Print a secret directly, inside an exception message and after URL encoding, and confirm stored logs contain the mask in the first two cases, with the third documented as a known gap.",
    dep: ["task-logs", "secrets-backends"]
  },
  "credential-rotation": {
    s: "Changing the credentials the orchestrator and its pipelines use on a schedule or after a leak, without stopping scheduled work.",
    d: "Rotation updates the secret in the backend and the target system. Safe rotation supports two valid credentials for a window so that running tasks and new ones both work, and tasks fetch fresh values per attempt. Long-lived processes such as workers and schedulers must reload. It is hard because credentials are used by many pipelines and tools, and a missed consumer fails only when it next runs, perhaps days later.",
    k: ["Overlapping old and new credentials vs a hard cutover: overlap avoids failures in running tasks, while a hard cutover is simpler and revokes leaked values immediately.", "Short-lived issued tokens vs rotated static secrets: short-lived tokens limit exposure and need an issuing service, while static secrets are simple but long-lived."],
    p: ["A weekly pipeline using a rotated password fails days after rotation, long after anyone remembers the change.", "Rotation breaks workers that cached the old value for their lifetime."],
    v: "Rotate a credential during a busy period and confirm running tasks finish, new attempts use the new value, and the old value is rejected after the overlap window.",
    dep: ["secrets-backends", "workload-identity"]
  },
  "workload-identity": {
    s: "Giving each component, worker or task its own verifiable identity, so access to data systems and secret stores is granted to the workload rather than a shared password.",
    d: "The platform issues short-lived tokens bound to the worker's service account or container, and the secret store and data systems check them. Different pipelines can run under different identities, so each has only the access it needs. The orchestrator can assume a role for a task. It is hard because mapping pipelines to identities adds configuration, and a shared worker identity grants every task the union of access.",
    k: ["Identity per task or pipeline vs one per worker: per-task identity gives least privilege, while per-worker is simple but grants shared access.", "Short-lived tokens vs long-lived keys: short-lived tokens limit leaks, but rely on the issuer being reachable."],
    p: ["All pipelines running on shared workers inherit the broadest access any of them needs.", "An identity token expiring mid-task fails long running work."],
    v: "Run two pipelines on one worker with different identities and confirm each can read only its own data store and secrets, and an attempt to read the other's is denied.",
    dep: ["secrets-backends", "pipeline-permissions"]
  },
  "pipeline-permissions": {
    s: "Rules that decide which people and teams may see, run, edit or manage each pipeline, and which data connections it may use.",
    d: "Permissions attach to pipelines or folders and to roles, and are enforced by the console, API and command line. They also control which connections and variables a pipeline can reference, so a team cannot use another's credentials. Ownership metadata feeds alert routing and quotas. It is hard because definition files are code deployed by a pipeline, so whoever can merge code can effectively run anything the worker identity can reach.",
    k: ["Permissions defined in the orchestrator vs derived from repository ownership: orchestrator-defined are explicit, while repository ownership keeps one source of truth.", "Scope connections per team vs global: per-team scope prevents misuse, while global is simpler to administer."],
    p: ["Reviewing who can edit definitions is skipped, while that is the real path to production access.", "A pipeline that triggers another bypasses the second pipeline's permissions."],
    v: "As a user with view-only rights, try to trigger, edit a variable and read a connection of a pipeline, and confirm all three are refused and recorded in the audit trail.",
    dep: ["access-control", "audit-trail"]
  },
  "process-supervision": {
    s: "The host-level mechanism that starts, restarts and monitors the orchestrator's own processes: scheduler, parser, trigger service, web server and workers.",
    d: "A service manager or cluster controller starts each process, restarts it on exit, applies resource limits, and uses health checks to decide when to replace it. Graceful shutdown lets workers finish tasks and schedulers release claims. It is hard because restart policy interacts with the system's recovery: restart loops can hammer the database, and abrupt termination produces orphaned tasks that later recovery must find.",
    k: ["Restart immediately vs with backoff: immediate restart minimizes downtime, while backoff prevents a crash loop from overloading shared services.", "Graceful drain vs fast stop: draining protects running tasks but slows deployments, while fast stop is quick and relies on orphan recovery."],
    p: ["A crash loop in the scheduler reconnects to the database in a tight cycle and exhausts connections.", "Restarting all workers at once during a deploy kills every running task."],
    v: "Send a graceful shutdown to a worker with running tasks and confirm it stops taking new work, finishes within the grace period, and leaves no task in running state.",
    dep: ["orchestrator-configuration"]
  },
  "message-broker": {
    s: "The queue or messaging service between the scheduler and workers, carrying task commands and sometimes results and events.",
    d: "The executor publishes task messages to named queues, and workers consume them with acknowledgments and visibility timeouts. Messages are small, and state of record stays in the metadata store. The broker may be memory-based and fast, or durable. Its availability and depth are key signals. It is hard because broker semantics, such as redelivery, ordering and persistence, differ, and an unacknowledged message can reappear while the first copy is still running.",
    k: ["Durable broker vs in-memory broker: durable survives restarts and costs throughput, while in-memory is fast and relies on the database to recover lost messages.", "Broker as source of truth vs database as source of truth: the database makes the broker disposable, while broker truth is faster but harder to reconcile."],
    p: ["A broker restart drops queued messages, and tasks the database thinks are queued never run.", "A visibility timeout shorter than a long task redelivers it to a second worker."],
    v: "Flush the broker with tasks queued and confirm the system detects the loss and requeues them, with every task running once and none stuck.",
    dep: ["process-supervision"]
  },
  "clock-and-timezones": {
    s: "Reliable time on every host and a consistent policy for time zones and daylight saving, since schedules, deadlines and heartbeats all depend on them.",
    d: "Hosts synchronize their clocks, and the orchestrator stores timestamps in UTC while converting for schedules and display. Heartbeat, timeout and SLA calculations compare times taken on different machines, so skew matters. Schedules in a local zone need rules for the missing and repeated hours of daylight changes. It is hard because time bugs appear twice a year or only at a particular offset.",
    k: ["Store UTC and convert at the edges vs store local time: UTC is unambiguous, while local time matches display but is wrong around daylight changes.", "Use database time for comparisons vs host time: database time gives one reference, while host time avoids a query but accumulates skew."],
    p: ["A host with a drifting clock marks healthy tasks as timed out or shows end times before start times.", "A schedule at two in the morning local time runs twice or never when clocks change."],
    v: "Simulate the spring and autumn daylight transitions for a local-time schedule and confirm each interval runs exactly once, and skew between hosts stays under the heartbeat threshold.",
    dep: []
  },
  "artifact-storage": {
    s: "Durable storage for logs, definition bundles, backups, large task outputs and archived history, usually an object store or shared filesystem.",
    d: "Components write immutable objects under structured paths such as pipeline, run, task and attempt. The store is cheap and scalable but has higher latency and its own consistency and permission rules. It decouples workers from long-term data, since workers can be discarded. It is hard because paths must be predictable for retrieval, lifecycle rules must delete old data, and permissions must keep one team's files from another.",
    k: ["Object store vs shared filesystem: object stores scale and are cheap, while shared filesystems offer familiar semantics and lower latency but become bottlenecks.", "Lifecycle rules in the store vs deletion by the orchestrator: store rules are simple and cheap, while orchestrator deletion can keep records consistent with the database."],
    p: ["Logs kept forever in storage grow cost steadily and are never reviewed.", "A path convention that includes mutable names makes old logs unreachable after a rename."],
    v: "Write and then read a log object for a task from a different host than the writer, and confirm lifecycle rules remove it after the retention period.",
    dep: []
  },
  "deployment-packaging": {
    s: "How the orchestrator's software, the task code and its dependencies are built into versioned images or bundles and rolled out to every host that needs them.",
    d: "Components and workers run from images or packages containing the orchestrator, provider libraries and definitions. The scheduler, parser and workers need compatible versions. Rollouts are staged: database migration, then control components, then workers. Definitions may be bundled or synced separately. It is hard because the pieces upgrade at different times and interact, and pipelines pin library versions that clash with the orchestrator's.",
    k: ["Definitions baked into the image vs synced separately: baking gives exact version consistency, while syncing lets pipeline changes ship without rebuilding the platform.", "Frequent upgrades vs pinning for long periods: frequent upgrades stay close to fixes and are smaller, while pinning avoids change but builds up risk."],
    p: ["A worker image rebuilt with an unpinned library pulls a new version overnight and breaks tasks.", "Upgrading the scheduler before the migration leaves it unable to start."],
    v: "Deploy a new version to a staging environment with a canary pipeline, run it to success, then roll back, and confirm the previous version resumes cleanly with no pending migrations.",
    dep: ["orchestrator-configuration"]
  },
  "orchestrator-configuration": {
    s: "The set of settings that control the orchestrator's behavior, such as loop intervals, parallelism, timeouts, executor choice and database location, applied at startup.",
    d: "Settings come from a file, environment overrides and defaults, with environment typically winning. Components read them at start, and most changes need a restart. Dozens of settings interact: parse interval, scheduler batch size, heartbeat threshold and limits all shape load and latency. It is hard because the defaults suit small installations, and tuning for scale means understanding relationships among values.",
    k: ["File with environment overrides vs environment only: files are readable and reviewable, while environment-only suits containers but is harder to audit.", "Conservative defaults vs tuned defaults: conservative defaults run anywhere, while tuned ones perform better and surprise small installs."],
    p: ["Different components run with different values of a setting that must agree, such as a heartbeat threshold.", "A change in a file is assumed live but the process was not restarted."],
    v: "Dump the effective configuration from the scheduler, a worker and the web server and confirm settings that must match are identical and each shows its source.",
    dep: []
  },
});
