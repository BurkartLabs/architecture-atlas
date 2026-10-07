// Details for the HPC batch scheduler plate, part 3: controller, accounting and node daemon.
ATLAS.details("hpc-scheduler", {
  "controller-daemon": {
    s: "The central process that holds the state of all jobs, nodes and partitions, runs scheduling, and answers every client and node daemon.",
    d: "One controller process, with a standby, keeps the live cluster model in memory and applies all state changes under locks. Threads handle incoming requests, a scheduling loop, node status checks, timers for time limits and periodic saves of state. Everything on the cluster depends on it, so it must stay responsive under floods of queries while scheduling. Its hardest problems are lock contention between readers and the scheduler, memory growth with queue size, and recovering consistent state after a crash.",
    k: ["Single authoritative controller vs distributed scheduling: one authority is simple and consistent, but bounds throughput and is a single failure point.", "In-memory state with periodic saves vs a transactional store: memory is fast, but a crash loses the most recent changes."],
    p: ["A user script querying all jobs in a tight loop takes the read lock repeatedly and delays scheduling.", "Memory grows with finished jobs kept for queries until the process is restarted."],
    v: "Under a steady load of submissions and queries, confirm the daemon's request latency and scheduling cycle stay within bounds, and its memory use is flat once the queue size is stable.",
    dep: ["cluster-state-model", "job-state-machine", "rpc-server", "main-scheduling-pass"]
  },
  "cluster-state-model": {
    s: "The in-memory data structures describing every node, partition, job, reservation and association, which all scheduling decisions read.",
    d: "Nodes hold their configured and current resources, state flags, allocated amounts and features. Jobs hold their descriptors, state and allocation. Partitions, reservations and accounts reference these by index for fast lookup. Because scheduling inspects tens of thousands of jobs per pass, the structures are laid out for speed, with bitmaps over nodes to make set operations cheap. The model must stay consistent: a job's allocation must always agree with the nodes' free counts, or resources leak or double-book.",
    k: ["Bitmaps over nodes vs object lists: bitmaps make set intersection fast at large scale, but are less readable and awkward for sparse data.", "One global lock vs fine-grained locks per structure: a global lock avoids ordering bugs, but limits concurrency."],
    p: ["A job's allocation and the nodes' counters diverge after a partial failure, leaking resources until restart.", "Lock ordering between structures is violated in a new feature and causes occasional deadlock."],
    v: "Run a consistency audit that sums allocations over all running jobs and compares them with each node's allocated counters; confirm they match after a burst of starts, ends and cancellations.",
    dep: []
  },
  "job-state-machine": {
    s: "The defined set of states a job moves through, from pending to running to completed, with the legal transitions and their side effects.",
    d: "States include pending, configuring, running, suspended, completing and the terminal outcomes of completed, failed, cancelled, timed out and node failure. Transitions have effects: entering running starts the clock, entering completing waits for all nodes to confirm cleanup before releasing them. The completing state is important, since resources are freed only after every node confirms its processes are gone. Requeue makes the machine cyclic. A wrongly handled transition appears as stuck jobs, double charges or nodes that remain allocated to nothing.",
    k: ["A completing state that holds nodes vs releasing immediately: holding prevents overlap with stray processes, but nodes stay unavailable until the slowest confirms.", "Terminal reasons as distinct states vs one with a reason code: distinct states are easy to query, but multiply transitions."],
    p: ["A node fails to confirm cleanup and stays held in completing for hours.", "A requeue after node failure resets the start time, and accounting under-reports the first partial run."],
    v: "Cancel a running job and watch it pass through completing, confirm its nodes are released only after the node daemons confirm, and that the final state and reason are recorded in accounting.",
    dep: ["cluster-state-model"]
  },
  "rpc-server": {
    s: "The network front end of the controller: it accepts requests from clients and nodes, authenticates them, and dispatches handlers.",
    d: "Requests arrive over TCP as framed messages carrying a credential. A pool of worker threads decodes, authenticates, authorizes and runs the handler, then returns a response. Handlers differ greatly in cost: a status query for one job is cheap, a listing of all jobs is not. Rate limiting by user or message type and a bounded queue protect against flooding. Because every user command and every node message passes here, it needs careful handling of timeouts and retries.",
    k: ["Thread pool with a bounded queue vs unbounded: bounded sheds load cleanly, but rejects legitimate requests during bursts.", "Per-request authentication vs a session: per-request is stateless and simple, but costs a signature check every time."],
    p: ["Users' retry loops amplify load during a slowdown and make it worse.", "A full listing request is allowed to run unbounded and holds locks long enough to stall node heartbeats."],
    v: "Send a burst above the configured rate from one user and confirm excess requests get a back-off response while another user's requests and node heartbeats are served normally.",
    dep: ["credential-signing", "cluster-state-model"]
  },
  "controller-failover": {
    s: "A standby controller that takes over from a failed primary using the saved state, so the cluster keeps scheduling after a crash.",
    d: "The primary writes state to a location the standby can read, usually a shared filesystem or a replicated store. The standby pings the primary and, after a timeout, takes control, loads the saved state and tells nodes to report to it. Running jobs continue unaffected, since daemons on nodes manage them. Failover takes seconds to a minute. The danger is two controllers believing they are active, which is avoided with a lock or token, and the loss of changes since the last save.",
    k: ["Shared-filesystem state with a lock vs a replicated store: a filesystem needs nothing extra, but depends on its availability and locking behavior.", "Automatic takeover vs manual: automatic reduces downtime, but a false positive causes split brain."],
    p: ["A network partition makes both controllers active, and jobs are started twice on the same nodes.", "The state directory is unavailable during failover and the standby starts with an empty queue."],
    v: "Kill the primary during a stream of submissions and confirm the standby becomes active within the timeout, running jobs continue unharmed, and pending jobs are all present after takeover.",
    dep: ["controller-state-store", "controller-daemon"]
  },
  "controller-state-store": {
    s: "The periodic and event-driven saving of job, node and reservation records to disk, so a restarted controller recovers what it knew.",
    d: "The controller writes files or records containing each job's descriptor and state, nodes' states, reservations and priorities, using atomic replace so a crash never leaves a half file. Saves occur at intervals and at shutdown, so recent changes can be missed, and nodes' reports are used to reconcile on restart. The size of the state grows with the queue, so a save takes longer and can hold locks. It is hard because recovery must reconcile saved state against what nodes actually report.",
    k: ["Periodic snapshot vs write-ahead log: snapshots are simple, but lose recent changes, and a log is exact but adds write cost and replay logic.", "Saving on the scheduler thread vs a background thread: background keeps cycles short, but needs a consistent copy."],
    p: ["A save of a huge queue takes long enough that the controller appears hung each time it runs.", "After restart, a job that finished just before the crash is shown running until a node reports it."],
    v: "Submit and run jobs, kill the controller abruptly, restart it, and confirm all pending jobs are restored and running jobs are reconciled with the nodes' reports within one heartbeat interval.",
    dep: ["cluster-state-model", "shared-filesystem"]
  },
  "reconfiguration": {
    s: "Changing the cluster's configuration while running, by reloading files to add nodes, change partitions or tune policy without stopping jobs.",
    d: "An operator edits the configuration and issues a reconfigure command. The controller reparses, builds new node and partition structures, and reconciles them with the running state, preserving allocations. Some changes, such as node hardware definitions, need more than a reload, and some are refused. Daemons on every node also read the file, so a divergence between nodes and the controller breaks assumptions. Configuration is often served from the controller rather than copied around to avoid divergence.",
    k: ["Configuration served from the controller vs files on each node: serving keeps nodes consistent, but makes nodes depend on the controller at start.", "Reload in place vs restart: reload keeps jobs and users unaffected, but supports fewer kinds of change."],
    p: ["A typo in the file makes reconfigure fail partway and leaves some settings old and some new.", "A node daemon runs with an old configuration and misreports resources."],
    v: "Add a partition and change a limit in the configuration, reconfigure, and confirm the new partition and limit appear, with every running job's allocation unchanged.",
    dep: ["controller-daemon", "node-daemon", "partitions-and-queues"]
  },
  "tree-communication": {
    s: "Fan-out of messages from the controller to thousands of nodes through a tree of node daemons, instead of one connection per node.",
    d: "To send a launch, a status request or a configuration change to many nodes, the controller sends it to a few nodes, each forwards it to a handful more, and replies are aggregated on the way back. This keeps the controller's connections and bandwidth low and completes in logarithmic time. Failed nodes are skipped, and their children are contacted by an alternate path. The tree makes node failure harder to attribute, since a missing response may mean the node or its parent is down.",
    k: ["Wide fan-out vs deep: wide trees finish in fewer hops but load interior nodes, while deep trees spread load and increase delay.", "Interior nodes forwarding vs controller contacting all: forwarding scales, but makes interior failures cause retries."],
    p: ["An interior node is slow, and all its subtree appears down until timeouts expire.", "Messages travel to nodes through a hostname that resolves differently from the nodes' view."],
    v: "Send a status request to a thousand nodes, confirm responses arrive in a time near the tree depth times the hop latency, then kill an interior node and confirm its children still respond.",
    dep: ["node-daemon", "network-fabric", "rpc-server"]
  },
  "plugin-framework": {
    s: "A way to load interchangeable modules for authentication, scheduling, selection, accounting storage and other behaviors, chosen by configuration.",
    d: "Each extension point defines a set of functions, and the configuration names the module that implements it. The controller loads it at start. This lets sites replace scheduling algorithms, job filters, priority formulas or accounting backends without forking. The cost is an interface that must stay stable across releases, and plugin code that runs inside the controller with its privileges and locks. A slow or faulty plugin hurts the whole system, and testing combinations of plugins is difficult.",
    k: ["In-process plugins vs separate helper processes: in-process is fast, but a crash or leak affects the controller.", "A broad plugin interface vs a narrow one: broad enables more customization, but freezes more internals."],
    p: ["A plugin built for a previous release loads and misbehaves because a structure layout changed.", "A plugin blocks on a network call while holding a controller lock."],
    v: "Switch the priority plugin by configuration, reconfigure, and confirm pending jobs are ordered by the new formula, with the loaded plugin name reported in the controller's status.",
    dep: ["controller-daemon"]
  },
  "accounting-daemon": {
    s: "A separate service that receives job and usage records from the controller and writes them to the database, and answers accounting queries.",
    d: "The controller sends events when jobs start and end, and when resources change. The daemon validates and stores them, also serves association data, limits and usage back to the controller and tools. Separating it keeps database slowness out of scheduling: if the database is slow, records queue up in the controller. It is the authority for who may submit under which account, so its availability matters at submit time. Hard aspects are ordering, duplicates after retries, and keeping up after an outage.",
    k: ["Separate daemon vs controller writing directly: separate isolates the database's latency, but adds a network hop and a component to monitor.", "Synchronous association checks vs cached: synchronous is always current, but ties submission to the daemon's uptime."],
    p: ["The daemon is down and the controller's record buffer fills until it starts discarding records.", "Retries after a timeout write the same job twice and double the charge."],
    v: "Stop the accounting daemon, run jobs, restart it, and confirm every job's record appears exactly once with correct times, and the controller reports an empty backlog.",
    dep: ["accounting-database", "rpc-server", "accounting-buffering"]
  },
  "accounting-database": {
    s: "The relational store holding job records, usage per account and user, associations, limits and rates, queried for reports and fair-share.",
    d: "Tables hold one row per job and step, with times, resources, exit codes and account, plus tables for accounts, users, associations, quality-of-service definitions and rolled-up hourly, daily and monthly usage. Indexes support queries by user, account and time. A large facility accumulates hundreds of millions of rows, so queries over long periods are slow and schema migrations take hours. It must be backed up and monitored like any production database, since billing and fair-share depend on it.",
    k: ["Raw per-job rows plus rollups vs only aggregates: raw rows allow any later question, but need space, while aggregates are small and cannot answer new ones.", "Schema changes online vs a maintenance window: online avoids downtime, but takes longer and risks locks."],
    p: ["A schema upgrade on a huge table runs for hours while the accounting daemon is stopped and records back up.", "The database runs out of disk and writes fail silently until the buffer overflows."],
    v: "Query the sum of cores times hours for one account in a month and compare it with the sum of the individual job records; confirm they match and the query finishes in the target time.",
    dep: ["accounting-daemon"]
  },
  "job-completion-records": {
    s: "The final record written for each job and step: requested and allocated resources, times, exit state and measured usage.",
    d: "At job end the controller assembles the record from its descriptor and state, and the node daemons add measured usage such as CPU time, peak memory and energy. It becomes the basis of reports and charging. The record also captures why the job ended, including limit reached, node failure or user cancel, and the node list. Precision matters: a clock jump or a requeue can produce a negative elapsed time or a missing first run. Records for steps give finer detail than the job.",
    k: ["One record per job vs per step: per job is compact, while per-step shows where time and memory went in a multi-step job.", "Storing the node list vs only a count: lists help trace hardware faults, but enlarge each record."],
    p: ["Requeued jobs overwrite their first run's record, hiding wasted usage.", "Peak memory is reported from a sample interval that missed the real peak."],
    v: "Run a job that allocates a known amount of memory and exits with code 3, then confirm its record shows exit code 3, peak memory near the known amount, and correct start and end times.",
    dep: ["accounting-daemon", "resource-usage-sampling", "job-state-machine"]
  },
  "usage-rollups": {
    s: "Aggregated usage per account, user and period, computed from job records, which fair-share, limits and reports read instead of raw rows.",
    d: "Periodic tasks add each finished and running job's resource-time into hourly buckets per association, then roll hours into days and months. Fair-share reads recent usage from them, and limits that cap total resource-minutes consult them. Because jobs span many hours, usage is split across the buckets that they overlap, and late or corrected records require re-running the rollups for past periods. Rollups must finish faster than new data arrives, or reports fall behind.",
    k: ["Rollup incrementally vs recompute from raw: incremental is fast, but errors in a bucket persist until recomputation.", "Hourly buckets vs finer: hourly is small and sufficient for fair-share, but cannot answer sub-hour questions."],
    p: ["A late record for a past month is not reflected, and an allocation is charged incorrectly.", "A rollup job is interrupted and the buckets double count after it re-runs."],
    v: "Run a job across a bucket boundary and confirm its usage is split into the two hours in proportion to time, and that the sum of the buckets equals the job's total.",
    dep: ["accounting-database", "job-completion-records"]
  },
  "association-management": {
    s: "The maintenance of user-account pairs and their attributes: shares, limits, permitted partitions and quality-of-service, kept consistent between database and controller.",
    d: "Administrators add and modify associations with the accounting tool, and the database holds the master copy. The controller caches the relevant part and receives updates when changes are made. Each job is checked against its association at submission and during scheduling. The problems are propagation and ordering: a user added to the database must be known to the controller before they submit, and removal must decide what happens to their running and pending jobs. Large sites automate this from a project management system.",
    k: ["Push updates to the controller vs periodic refresh: pushing makes changes effective quickly, but needs reliable delivery.", "Delete associations vs mark inactive: inactive keeps history and referential integrity, but clutters lists."],
    p: ["The controller's cache lags and a new user's first jobs are rejected as unknown.", "Deleting a user removes the records needed to attribute their earlier usage."],
    v: "Add an association with a limit, confirm the user can submit within seconds and the limit applies, then remove it and confirm submits are refused while history remains queryable.",
    dep: ["accounting-database", "account-hierarchy", "accounting-daemon"]
  },
  "reporting-queries": {
    s: "Standard and ad hoc reports on usage, utilization, wait times and efficiency, answered from accounting data for users, projects and managers.",
    d: "Tools query the accounting database for jobs by user, account, partition and period, and compute totals, averages and distributions. Common questions are utilization of each partition, how long jobs waited, how much of allocated resources were actually used, and top consumers. Reports guide capacity planning and policy changes. Since queries over years of data are costly, the common ones read the rollups, and results are often exported to a separate analytics system rather than running on the production database.",
    k: ["Querying the live database vs a replica or export: live is current, but heavy queries slow accounting writes.", "Wait time measured from submit vs from eligibility: from submit includes holds and limits, while eligibility isolates scheduler delay."],
    p: ["A broad report query with no time bound locks tables and delays accounting.", "Utilization is computed against configured nodes including drained ones, hiding that capacity was unavailable."],
    v: "Generate last month's utilization report and compare its core-hours with the total from the node-state history; confirm they agree within the expected margin for drained time.",
    dep: ["accounting-database", "usage-rollups"]
  },
  "charge-rates": {
    s: "The weights that convert resource use into billable or allocated units, such as core-hours, accelerator-hours or memory, per partition or QoS.",
    d: "A job's cost is computed as time multiplied by weighted resources, with weights set per resource type and sometimes per partition. Accelerators typically weigh much more than cores, and high-memory nodes more than standard. The same weights may feed fair-share, so heavy consumers of scarce hardware lose priority faster. Rate changes need care: applied retroactively they alter history, while applied only forward they require stored versions. Unclear charging for shared or partial devices leads to disputes.",
    k: ["Charge by allocation vs by measured use: allocation rewards efficient requests and is simple, but charges for idle reserved resources.", "Billing the dominant resource vs the sum: dominant reflects what limits others, while a sum is simpler to explain."],
    p: ["A weight change is applied to old jobs, and past allocations appear exhausted.", "Jobs requesting memory beyond their core share are charged only for cores and pay too little."],
    v: "Run one-hour jobs using four cores, then one accelerator, then a large memory node, and confirm the recorded charge for each equals the configured weight times the time.",
    dep: ["job-completion-records", "qos-levels"]
  },
  "data-retention": {
    s: "Policies that archive or delete old accounting records and finished job data, to bound database size while preserving what is required.",
    d: "Job records beyond a configured age are exported to files and removed from the active tables, while rollups are kept longer since they are small. The controller also forgets finished jobs after a short interval. Retention is set by cost, audit requirements and the need for long-term trends. Purging is an ordinary heavy database operation, so it runs in small batches in the quiet hours. Restoring archived data for an audit should be tested, since archives are rarely read until they matter.",
    k: ["Purge raw rows while keeping rollups vs keeping everything: purging bounds size, but loses detail.", "Archive to files vs delete: archives satisfy audits, but need storage and a way to read them back."],
    p: ["A purge deletes records still needed for a pending dispute or audit.", "The archive format is not readable after a schema change, so old data is lost in practice."],
    v: "Set a short retention in a test system, run the purge, confirm old job rows are gone and archived, monthly rollups remain, and an archive loads back into a scratch database.",
    dep: ["accounting-database", "usage-rollups"]
  },
  "accounting-buffering": {
    s: "A controller-side queue that holds job records while the accounting daemon or database is unreachable, then delivers them in order afterward.",
    d: "When the daemon cannot be reached, the controller keeps records in memory, and sometimes in a file, up to a limit, and retries. This lets scheduling continue through database maintenance. If the outage lasts too long or the buffer fills, records are lost, which causes missing charges and wrong fair-share. The buffer must survive a controller restart, preserve order, and not deliver duplicates. Monitoring its depth is the main early warning of accounting trouble.",
    k: ["Memory-only buffer vs persisted to disk: memory is simple and fast, but a restart during an outage loses the records.", "Block scheduling when full vs drop records: blocking protects accuracy, but stops the cluster over a bookkeeping issue."],
    p: ["Maintenance on the database runs longer than the buffer allows and records are silently discarded.", "The buffer is replayed out of order, and a job's end is processed before its start."],
    v: "Stop the database for an hour while jobs run, restart it, and confirm the controller's backlog drains to zero and the number of stored job records equals the number of jobs that ran.",
    dep: ["accounting-daemon", "controller-state-store"]
  },
  "node-daemon": {
    s: "The per-node service that registers the node, receives launch and control orders from the controller, and manages jobs on that node.",
    d: "On start, it reports the node's hardware to the controller, then answers requests to launch job steps, send signals, collect usage and run cleanup. It authenticates each request and forks a child under the user's identity for each task. It also reports regularly so the controller notices failure. It runs as a privileged user on every node, so it must be small, stable and hardened. It is hard because it must keep working when the node is overloaded or memory is nearly exhausted by a job.",
    k: ["Long-running daemon vs launching per request: a daemon is fast to act, but needs protection from the load it manages.", "Daemon forks tasks directly vs a helper: direct is simple, but daemon crashes affect running tasks."],
    p: ["A job exhausts node memory and the kernel kills the daemon, so the controller loses the node.", "A node daemon restart orphans running tasks that it can no longer track."],
    v: "Restart the node daemon while a job runs and confirm the job continues, the daemon re-adopts its processes, and the controller does not mark the node down.",
    dep: ["credential-signing", "kernel-resource-controls", "tree-communication"]
  },
  "job-launch-tree": {
    s: "The way a launch order reaches all nodes of a job and starts tasks everywhere quickly, using the node daemon tree to avoid central bottlenecks.",
    d: "The launch command asks the controller for an allocation, then sends a start message through the first node's daemon, which fans it out through a tree. Each daemon sets up the environment, forks tasks and returns status up the tree. Launching ten thousand nodes in seconds needs this design. Credentials, environment and executable path must reach every node, so launchers also broadcast the binary or rely on a shared filesystem. Slow nodes extend the whole launch, so timeouts and straggler handling matter.",
    k: ["Tree fan-out vs direct from the launcher: a tree scales to large jobs, but adds hops and complicates error attribution.", "Broadcasting the executable vs reading from shared storage: broadcast avoids filesystem storms, but needs space and time on every node."],
    p: ["Thousands of tasks load the same executable from a shared filesystem at once and stall it.", "One slow node delays the start of a ten-thousand-node job by minutes."],
    v: "Launch a trivial command on a thousand nodes and confirm total launch time is within the target, with every node reporting exit status exactly once.",
    dep: ["tree-communication", "node-daemon", "job-steps"]
  },
  "job-steps": {
    s: "Individual launches within a job's allocation, each with its own tasks, resources and accounting, so a script can run several programs in sequence or together.",
    d: "A batch job holds an allocation, and each launch command inside the script creates a step using some or all of it. Steps can run concurrently on disjoint resources. Each has its own ID, usage record and exit status, which gives per-program accounting. The step manager tracks tasks, forwards signals and cleans up. It is hard because the step's view of resources must fit within the job's, and steps may be launched faster than the system can set them up.",
    k: ["Steps as first-class accounted objects vs only the job: steps give detail, but multiply records for scripts launching thousands of them.", "Step limited to a job's allocation vs allowing overcommit: limiting is safe, but overcommit allows oversubscription tricks."],
    p: ["A script loop launches a hundred thousand tiny steps, and the controller becomes the bottleneck.", "A step requests more than is left in the allocation and hangs waiting rather than failing."],
    v: "Launch two concurrent steps on disjoint cores within one job and confirm each has its own record with its own exit code and its tasks stayed within its cores.",
    dep: ["job-launch-tree", "task-binding", "job-completion-records"]
  },
  "process-containment": {
    s: "Placing all processes of a job in a kernel group with enforced limits on memory and cores, so nothing escapes or exceeds its allocation.",
    d: "At launch the node daemon creates a control group for the job and step, assigns the allowed cores and memory limit, restricts visible devices, and moves the tasks into it. At end, all processes in the group are killed, even those that daemonized. Containment also enables accurate usage measurement. It is hard because limits must match what the allocation promised, because kills by the kernel for memory must be attributed to the right job, and because processes started by remote shell login must also be placed in the group.",
    k: ["Kernel groups for enforcement vs process tracking by parent: groups are reliable even when processes detach, but depend on kernel features.", "Hard memory limit vs soft: hard protects neighbors with kills, while soft tolerates short peaks and risks swap pressure."],
    p: ["A process that reparents itself survives the job end and keeps using cores.", "Page cache charged to the job's memory causes kills for files merely read."],
    v: "Start a job that forks a background process and exits, then confirm the node has no processes left from the job after completion, and that exceeding the memory limit kills only that job.",
    dep: ["kernel-resource-controls", "node-daemon"]
  },
  "prolog-epilog": {
    s: "Site scripts that run on each node before a job starts and after it ends, to prepare the node and to clean it up and check it.",
    d: "The prolog may mount filesystems, create scratch directories, set up devices or run quick health checks. The epilog removes temporary files, kills leftover processes, resets accelerators and reports problems. A prolog failure drains the node and requeues the job, so these scripts also act as guards. They run on the critical path of every job, so they must be fast and idempotent. They run as the privileged user, so they must handle unusual names and states safely.",
    k: ["Heavy checks in the prolog vs separate periodic checks: prolog checks catch problems before the job runs, but add delay to every job.", "Run once per job vs once per node: per job is simple, but wasteful when many short jobs share the node."],
    p: ["A prolog hangs on a broken mount and nodes pile up in a configuring state.", "An epilog failing for a harmless reason drains healthy nodes, shrinking the cluster."],
    v: "Inject a failing check into the prolog on one node and confirm the job is requeued to another node, the faulty node is drained with the reason, and other nodes' jobs are unaffected.",
    dep: ["node-daemon", "drain-and-resume", "node-health-checks"]
  },
  "task-binding": {
    s: "Starting each task with its assigned cores and memory placement applied, and reporting where tasks landed.",
    d: "The step manager receives from the controller the cores and memory each task may use, and applies affinity masks as it starts them. It supports patterns such as block or cyclic distribution of tasks over nodes and sockets. Environment variables expose the rank and local rank. A user can request a different layout within the allocation. The difficulty is getting layouts right for hybrid programs with several threads per task and for accelerator-aware placement where the best cores depend on the device.",
    k: ["Binding applied by the launcher vs left to the parallel runtime: the launcher is consistent, but the runtime knows the program's threading.", "Block vs cyclic distribution: block keeps neighbors together to share memory, while cyclic spreads load across sockets."],
    p: ["Both the launcher and the runtime set masks, and the second silently overrides the first.", "Rank numbering differs from what the application expects, so neighbors land on distant nodes."],
    v: "Start sixteen tasks with a block layout and print each task's rank, node and core set; confirm consecutive ranks share nodes and no cores overlap.",
    dep: ["memory-and-core-binding", "job-steps", "hardware-topology-discovery"]
  },
  "parallel-launcher-bootstrap": {
    s: "The exchange of addresses and ranks that lets the processes of a parallel program find each other after the scheduler starts them.",
    d: "The scheduler provides a way for processes to exchange wire-up information: a key-value service run by the step manager, so each task publishes its endpoint and reads its peers'. It also sets environment variables with the rank, size and node list. A launch of tens of thousands of ranks must complete the exchange without every rank contacting a central point, so the service aggregates on the node and across the tree. When wire-up fails, the job hangs, which is hard to diagnose.",
    k: ["Scheduler-provided key-value service vs the runtime's own launcher: the scheduler's is integrated with allocation, but must implement the runtime's expected interface.", "Eager vs lazy connection setup: eager fails early, while lazy is faster to start for large jobs."],
    p: ["One rank fails before publishing, and all others wait indefinitely rather than failing.", "Environment variables from an earlier step leak into a later step and give wrong rank numbers."],
    v: "Launch a ten-thousand-rank program that does an all-to-all exchange of ranks and confirm all ranks complete the exchange within the target time, with the correct size and rank values.",
    dep: ["job-launch-tree", "network-fabric", "job-steps"]
  },
  "io-forwarding": {
    s: "Carrying standard input, output and error between tasks on compute nodes and files or the user's terminal.",
    d: "By default, task output is written by the step manager to a file in the job's working directory, named by job and task. For interactive runs, output is streamed back to the launching terminal, and input may be sent to one or all tasks. Output can be labeled by rank. At scale, thousands of tasks writing to one file or terminal is a problem, so aggregation and buffering are used. It is hard because filesystem failures lose output at the moment it is most needed.",
    k: ["Direct file writes by each node vs streaming through the launcher: direct scales and works if the client dies, but needs a shared path.", "One file per task vs one combined: per-task keeps output separate, while combined is easier to read but contends on writes."],
    p: ["The output directory does not exist on the compute node, so the job fails at start with no message.", "A job writing gigabytes of text to standard output fills the shared filesystem quota."],
    v: "Launch four tasks that each print their rank, and confirm the output file or streamed terminal output shows each rank's line exactly once, with an error stream kept separate.",
    dep: ["job-steps", "shared-filesystem", "node-daemon"]
  },
  "signal-handling": {
    s: "Delivering signals to all tasks of a job on request, and sending warnings before limits expire or preemption occurs.",
    d: "Users can signal a job or step, and the scheduler can send a configured signal some seconds before the time limit or on preemption so programs can checkpoint. The signal goes through the tree to every node, then to the processes in the job's group, with options to reach only the batch script or all tasks. Escalation follows a defined order: polite signal, a grace period, then forceful kill. It is hard to get delivery right for processes inside containers, and because unhandled signals terminate programs that expected to catch them.",
    k: ["Signal sent to the script only vs all tasks: script only lets the script coordinate, but tasks never see it unless forwarded.", "Warning time before the limit: more time allows full checkpoints, but wastes allocation for jobs that need none."],
    p: ["The shell wrapper receives the warning signal and does not pass it to the application.", "A grace period shorter than the checkpoint time leaves half-written files."],
    v: "Submit a job with a warning signal sixty seconds before its limit, have the program log on receipt, and confirm the log time is about sixty seconds before the kill.",
    dep: ["job-launch-tree", "process-containment"]
  },
  "job-environment-setup": {
    s: "Building each task's runtime environment: user variables, scheduler variables, working directory, limits, identity and mounts.",
    d: "The step manager switches to the user's identity, sets group memberships, resource limits and working directory, and builds the environment from the submit-time copy plus variables describing the allocation, such as node list, task count, job ID and visible devices. Optionally it sources the user's login scripts for a clean state. It also sets up per-job temporary directories. Mistakes here are visible to every program: a missing variable or wrong user can look like application bugs.",
    k: ["Exporting the submitter's environment vs a minimal one: exporting preserves the user's setup, but also their accidental dependencies.", "Per-job private temp directories vs the shared temp: private is isolated and cleaned automatically, but is another thing to create and remove."],
    p: ["A module environment loaded on the login node refers to paths absent on compute nodes.", "Resource limits inherited from the daemon, such as open files, are lower than the user expected."],
    v: "Run a job that prints its environment, user, groups and limits, and confirm they match the submitter's identity, the allocation variables are correct, and the temp directory is removed at the end.",
    dep: ["node-daemon", "identity-services"]
  },
});
