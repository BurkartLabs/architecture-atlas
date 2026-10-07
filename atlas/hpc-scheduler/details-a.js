// Details for the HPC batch scheduler plate, part 1: interfaces and job submission.
ATLAS.details("hpc-scheduler", {
  "admin-cli": {
    s: "The command-line tool operators use to inspect and change cluster state: node status, job control, reservations, configuration reload and account management.",
    d: "It speaks the same RPC protocol as every other client but is authorized for privileged operations such as draining a node, cancelling any job, creating a reservation or editing accounts. Output is built for scripts as much as for people, with parsable formats and selectable fields. Because it can change production state instantly, it is where audit trails, confirmation and permission checks matter most. It is hard because operators run it during incidents, when a wrong flag on a wildcard node range affects hundreds of machines.",
    k: ["Privileged commands over the same protocol as user commands vs a separate admin channel: one code path is simpler, but authorization must be checked per operation.", "Wildcard node expressions vs explicit lists: ranges are fast during incidents, but mistakes scale to the whole range."],
    p: ["A script parsing human-formatted output breaks when a column width or field name changes in a release.", "Draining by pattern matches more nodes than intended because the expression also covers a neighboring rack."],
    v: "Drain a node with a reason string, then confirm the scheduler lists it as drained with that reason and the audit log records the operator, the command and the time.",
    dep: ["rpc-server", "drain-and-resume"]
  },
  "rest-api": {
    s: "An HTTP interface exposing job submission, queries and cluster state as JSON, so portals and services can use the scheduler without shelling out to commands.",
    d: "A small daemon translates HTTP requests into the same RPC calls the command-line tools make, authenticating each request with a token or the signed credential of the caller. Endpoints cover submitting and cancelling jobs, listing jobs and nodes, and reading accounting data. Schemas are versioned so older clients keep working. The hard parts are mapping a rich job descriptor onto JSON without losing fields, rate-limiting expensive queries that can lock the controller, and acting as the right user for each request.",
    k: ["Versioned schema paths vs one evolving schema: versions let old clients keep working, but every version adds code to maintain and test.", "Daemon acting as a trusted proxy vs per-user tokens end to end: a proxy is easy to build, but it concentrates privilege that an attacker would target."],
    p: ["A portal polling the full job list every few seconds from many users saturates the controller's request queue.", "Unknown JSON fields are silently dropped, so a submission loses a resource request and runs with defaults."],
    v: "Submit a job with a GPU request through the API as a normal user, then fetch it and confirm the stored descriptor includes the GPU count and the job runs under that user's identity.",
    dep: ["rpc-server", "credential-signing", "job-descriptor"]
  },
  "client-libraries": {
    s: "Programming interfaces that let applications and tools submit jobs, query state and receive job events without parsing command output.",
    d: "A library wraps the controller's RPC protocol with typed structures for job descriptors, node records and partition information, plus helpers for authentication and retries. Workflow engines and schedulers-of-schedulers link against it. Compatibility is the main design burden: the library must work against controllers one or two releases apart, so struct fields are optional and unknown values are tolerated. Memory ownership for returned lists and error reporting across language boundaries are common sources of defects.",
    k: ["Stable binary interface vs rebuilding clients every release: stability protects site tools, but forces old fields to live on long after they are useful.", "Thin wrapper over RPC vs a high-level job object: thin is predictable, while high-level hides retries and state that callers then cannot control."],
    p: ["A tool built against one release mishandles a new job state and treats a pending job as failed.", "Returned structures are never freed by the caller, leaking memory in a long-running portal."],
    v: "Run a client built against the previous release against the current controller and confirm it lists jobs and submits one successfully, ignoring fields it does not know.",
    dep: ["rpc-server", "job-descriptor", "credential-signing"]
  },
  "portal-and-web-ui": {
    s: "A browser front end that lets users launch interactive sessions, submit from forms, browse files and watch their jobs without touching a terminal.",
    d: "The portal authenticates users against the site's identity system, then submits and monitors jobs on their behalf, usually through the REST interface or by running commands as the user. Typical features are templates for interactive desktops or notebooks, a job composer, queue views and links to output files. It must proxy connections from the browser to a service running on a compute node, which may be behind a private network, and clean up the session when the job ends.",
    k: ["Reverse proxy to node services vs direct node access: proxying keeps nodes private, but adds a hop and a component that every interactive session depends on.", "Templated forms vs free-form scripts: forms are safe for novices, but every new application needs a template written and maintained."],
    p: ["A session job ends but the proxy mapping persists, so the next job on that node and port receives someone else's connection.", "Credentials stored by the portal for acting as users become a high-value target."],
    v: "Launch an interactive session from the portal, open it in a browser, confirm it runs on a compute node under your own account, then end the job and confirm the proxied URL stops working.",
    dep: ["rest-api", "identity-services", "interactive-allocations"]
  },
  "workflow-manager-integration": {
    s: "The connection between external workflow engines and the scheduler: submitting many dependent tasks, tracking their state and avoiding flooding the queue with tiny jobs.",
    d: "Workflow tools express a graph of tasks and need to submit each as a job, poll or subscribe to completion, and retry failures. Good integration uses job dependencies and arrays rather than submitting one job per task from a loop, and groups short tasks into pilot jobs that pull work themselves. The scheduler contributes dependency types, job names and comments for tagging, and event hooks. The difficulty is volume: thousands of one-second tasks each pay scheduling and launch overhead and can swamp the controller.",
    k: ["One scheduler job per task vs pilot jobs pulling tasks: per-task jobs give accurate accounting, while pilots avoid scheduling overhead but hide task-level usage.", "Polling for completion vs event callbacks: polling is simple and portable, but costs controller requests that grow with the workflow size."],
    p: ["A workflow submits ten thousand short jobs in one minute and delays unrelated users' scheduling cycles.", "A retry loop resubmits a job that failed for a permanent reason and burns the account's allocation."],
    v: "Run a workflow of a thousand short tasks and confirm it completes in the expected time, with the controller's request rate and scheduling cycle length staying within normal limits.",
    dep: ["job-dependencies", "job-arrays", "client-libraries"]
  },
  "container-and-cloud-integration": {
    s: "Support for running jobs inside container images and for extending the cluster with rented cloud machines when local capacity runs out.",
    d: "Container integration lets a job name an image that is fetched, unpacked and entered without giving the user root, mapping the user's identity and mounting scratch and home paths. Cloud integration lets the controller create nodes on demand, add them to the cluster, and remove them when idle, often through programs run at resume and suspend time. Both depend on the launch path honoring the allocation: cores, devices and limits must still apply inside the container.",
    k: ["Unprivileged user-namespace containers vs privileged runtimes: unprivileged is safer on shared nodes, but some device and filesystem features need workarounds.", "Prebuilt cloud images vs configuring nodes at boot: images start faster, but drift from the on-premises software stack."],
    p: ["Cloud nodes keep running after the queue empties because the suspend program failed silently, and the bill grows.", "Accelerators are visible inside the container that the job was never allocated."],
    v: "Submit a job requesting one GPU with a container image and confirm only that GPU is visible inside it, files are owned by the submitting user, and the image cache is reused by a second job.",
    dep: ["process-containment", "dynamic-and-cloud-nodes", "job-environment-setup"]
  },
  "monitoring-export": {
    s: "Publishing scheduler metrics, such as queue depth, node states, scheduling cycle times and request rates, to the site's monitoring system.",
    d: "An exporter reads the controller's statistics and exposes them in a standard scrape format or pushes them to a time-series store. Useful series include pending and running jobs by partition, nodes by state, scheduling cycle duration, backfill depth, RPC counts by type and user, and accounting daemon backlog. These are the early warnings for an overloaded controller. The challenge is cost: some statistics require walking all jobs, so collecting them too often adds the load that they are meant to detect.",
    k: ["Pull-based scraping vs pushing from the controller: scraping keeps the controller passive, but needs a reachable endpoint and consistent timing.", "Per-user metrics vs aggregates: per-user detail finds abusive clients, but multiplies the number of series."],
    p: ["Statistics calls hold a controller lock while counting, so a dashboard refresh stalls scheduling.", "Alerts fire on pending job counts that are normal for a busy cluster, training operators to ignore them."],
    v: "Submit a flood of test jobs and confirm queue depth and scheduling cycle time rise on the dashboard within one scrape interval, then fall as jobs drain.",
    dep: ["rpc-server", "event-log"]
  },
  "license-server-integration": {
    s: "Tracking externally licensed software as a countable resource, so jobs wait for a license instead of starting and then failing to check one out.",
    d: "Commercial applications check out licenses from a separate server. The scheduler models each license as a counted resource, subtracts what pending and running jobs claim, and optionally queries the license server for the true number in use. Jobs request licenses in the same way as other resources. The difficulty is that checkouts happen inside the application, outside the scheduler's control, so the scheduler's count and the server's count disagree whenever users run the software elsewhere.",
    k: ["Local counters only vs querying the license server: counters are cheap and predictable, but go wrong when licenses are used outside the cluster.", "Reserving licenses at job start vs checking them at launch: reserving prevents failures, but idle jobs hold scarce licenses while they run non-licensed phases."],
    p: ["Users run the application on their desktops, exhausting the license pool so cluster jobs start and fail on checkout.", "A job requests a license it never uses and blocks others for its whole walltime."],
    v: "With three licenses and four jobs each requesting one, confirm three start, one waits with a license reason, and it starts as soon as a running job finishes.",
    dep: ["license-and-token-limits", "consumable-resources"]
  },
  "user-notifications": {
    s: "Messages that tell users when jobs start, finish or fail, delivered by email or similar channels according to the options in the job.",
    d: "A job may request notification at begin, end, failure or when time is nearly used. The controller hands each event to a configurable program that formats and delivers the message, including the job ID, name, state, exit code and basic usage. Sites often add summaries of efficiency. The difficulty is volume and abuse: array jobs can generate thousands of messages, and a mistyped address turns the cluster into a mail source that gets the site blocked.",
    k: ["Controller sending directly vs handing off to a program: handing off keeps the controller simple and flexible, but each event costs a process launch.", "Per-task messages vs one summary per array: per-task is complete, while a summary protects mail servers."],
    p: ["A ten-thousand-element array with end notifications floods a mail server and gets the site's mail blacklisted.", "Notifications to external addresses leak job names that contain project details."],
    v: "Submit a failing job with failure notification and confirm exactly one message arrives with the job ID, state and exit code, and none arrive for a successful job.",
    dep: ["job-descriptor", "event-log"]
  },
  "job-script-directives": {
    s: "Special comment lines at the top of a batch script that declare resource requests and options, so a script carries its own requirements.",
    d: "The submit command scans the leading lines of the script for a marker prefix and parses each as an option exactly as if given on the command line. Command-line options override the script's. This lets a user keep the request with the code, but it also means the script is parsed twice: once by the scheduler for resources and once by the shell as ordinary comments. Parsing stops at the first real command, so a directive placed after it is silently ignored, which is a classic source of confusion.",
    k: ["Directives in the script vs options only on the command line: in-script is reproducible and self-documenting, but hides defaults that a wrapper may override.", "Stopping at the first command vs scanning the whole file: stopping is fast and predictable, but surprises users who add a line late."],
    p: ["A directive placed after the first command is ignored and the job runs with default limits that kill it.", "Windows line endings in the script make the final directive value include a stray character and fail validation."],
    v: "Submit a script with a nodes and time directive and a different command-line time; confirm the stored job shows the nodes from the script and the time from the command line.",
    dep: ["resource-requests", "job-descriptor"]
  },
  "submit-commands": {
    s: "The user commands that send work to the scheduler: batch submit for scripts, run for immediate execution in an allocation, and a way to request an interactive shell.",
    d: "Each command builds a job descriptor from options, environment and the script, authenticates, and sends it to the controller, which replies with a job ID or a rejection reason. Submission copies the working directory, environment and limits so the job later runs as if launched from the same shell. The commands must fail fast and clearly: a rejection explaining that no partition can satisfy the request saves users from waiting on jobs that can never run.",
    k: ["Copying the whole environment vs a clean one: copying reproduces the user's shell, but leaks site-specific settings and varies between submitters.", "Rejecting impossible requests at submit vs queueing them: rejecting is kind to users, but needs the controller to know the full cluster shape."],
    p: ["Environment variables from a login session on a different OS image change library paths on the compute nodes and the job fails.", "A submit command hangs when the controller is busy, and users resubmit, creating duplicates."],
    v: "Submit a job requesting more memory than any node has and confirm an immediate rejection naming the limit, then submit a valid job and confirm an ID is returned and the job is pending or running.",
    dep: ["job-descriptor", "rpc-server", "credential-signing"]
  },
  "job-descriptor": {
    s: "The structured record of everything requested for a job: resources, time, partition, account, dependencies, environment, working directory and output paths.",
    d: "It is the object passed from client to controller and stored for the life of the job. Fields not given are filled from defaults of the partition, account and site, in a defined order, then validated against limits. The descriptor changes over the job's life: users may modify a pending job's time or priority, and the scheduler may update the expected start. It is hard because it grows with every feature, must stay compatible across versions, and is the input every policy check reads.",
    k: ["Explicit unset values vs sentinel defaults: explicit fields avoid ambiguity, but sentinel values make older clients easy to support and are easy to misread.", "Immutable after submit vs editable while pending: editing helps users, but each editable field must be revalidated against all limits."],
    p: ["A field left at a sentinel is treated as a real value, such as zero memory, and the job is placed on tiny allocations.", "A modification bypasses a limit that was only checked at original submission."],
    v: "Submit a job with minimal options, read back the stored descriptor and confirm each unspecified field shows the partition default, then modify its time and confirm limits are rechecked.",
    dep: ["resource-requests"]
  },
  "submit-filters": {
    s: "Site-written hooks that inspect and rewrite or reject each job at submission, enforcing local conventions without changing the scheduler.",
    d: "Before the job is accepted, a plugin or script receives the descriptor and the submitting user and may change fields, such as routing to a partition by memory request or adding an account default, or refuse with a message. This is where sites enforce rules like requiring a time limit or mapping project names. It runs on the controller's request path, so it is a latency and stability risk: a slow or crashing filter delays every submission.",
    k: ["Filter in the controller process vs an external program: in-process is fast, but a bug can crash or stall the controller.", "Rewriting silently vs rejecting with a message: rewriting is convenient, but users then see results that do not match their request."],
    p: ["A filter that calls a slow directory lookup makes every submission wait and backs up the request queue.", "Rewrites change the job without telling the user, who debugs the wrong configuration."],
    v: "Submit a job without a time limit and confirm the filter either supplies the site default or rejects it with a clear message, and that submission latency stays within a few milliseconds of normal.",
    dep: ["plugin-framework", "job-descriptor", "admission-control"]
  },
  "resource-requests": {
    s: "The vocabulary users employ to ask for compute: nodes, tasks, cores per task, memory, accelerators, constraints and time, in a form the scheduler can fit.",
    d: "Requests combine counts at several levels: how many nodes, how many tasks, how many cores each task needs, how much memory per node or per core, and how many devices. Many requests are valid ways to say similar things, and the scheduler must resolve them into one concrete shape. Defaults and rounding matter, since memory asked per core on nodes with different cores changes the total. Misunderstanding the request language wastes more allocation than any scheduling algorithm decision does.",
    k: ["Per-node vs per-task vs per-core units: rich units express intent exactly, but their interactions confuse users and produce unintended allocations.", "Exclusive nodes by default vs shared by default: exclusive simplifies performance, while sharing raises utilization for small jobs."],
    p: ["A user asks for memory per core and many cores, accidentally requesting more than any node has, and the job never starts.", "Asking for far more than needed to be safe lowers the job's priority and wastes the allocation."],
    v: "Submit a request of four tasks with two cores each and confirm the allocation shows eight cores in total, with each task bound to two cores on the nodes selected.",
    dep: []
  },
  "job-dependencies": {
    s: "Rules that hold a job until other jobs reach a given state, such as success, any end, failure or a specific start, to express pipelines.",
    d: "A job lists dependency conditions on other job IDs. The controller keeps the job pending with a dependency reason until all conditions can be evaluated, and either releases it or cancels it when a condition becomes impossible, such as waiting for success on a job that failed. Dependencies can chain thousands of jobs, so evaluating them must not scan the whole queue. Conditions on jobs that have been purged from memory need the accounting record or must be treated as satisfied.",
    k: ["Cancel on impossible dependency vs leave pending forever: cancelling frees the queue, but surprises users who expected manual repair.", "Dependency on job IDs vs on names: IDs are unambiguous, but names let tools reference work not yet submitted."],
    p: ["A dependent job waits indefinitely on a failed parent because the cluster is configured not to cancel it, and users forget it.", "Dependencies on purged jobs are treated as satisfied and the pipeline runs on incomplete data."],
    v: "Submit job B depending on success of A, make A fail, and confirm B is cancelled or flagged with a dependency-never-satisfied reason instead of running or waiting forever.",
    dep: ["job-state-machine", "job-descriptor"]
  },
  "job-arrays": {
    s: "A way to submit many similar jobs as one entry, each with its own index, so a parameter sweep costs one submission and one queue record.",
    d: "An array is described by an index range and optional step and concurrency cap. The controller stores it compactly as one pending record and splits off individual tasks only as they become runnable, giving each an ID and an index in its environment. Users can cancel or modify the whole array or one task. The key point is scale: a million-element array must not create a million records at once, so expansion is lazy and per-task limits apply to the running subset.",
    k: ["Lazy task expansion vs creating all tasks at submit: lazy keeps memory and scheduling cost flat, but makes queries and priority per task more complex.", "A concurrency cap per array vs none: a cap protects shared resources, but needs the scheduler to track running counts."],
    p: ["An array of many short tasks pays launch overhead per task and spends most of its time in startup.", "Tasks all write to one output path and overwrite each other because the index was not in the filename."],
    v: "Submit an array of 1000 tasks with a cap of 50 and confirm never more than 50 run at once, the controller holds one pending record, and each task sees a distinct index.",
    dep: ["job-descriptor", "job-state-machine"]
  },
  "interactive-allocations": {
    s: "Allocations granted for live use rather than a script: a shell on a compute node, or a held allocation in which the user launches commands by hand.",
    d: "The user requests resources and the command blocks until they are granted, then provides a shell or lets commands run inside the allocation. The allocation is a normal job with a time limit and accounting, so it can be waiting in the queue for a long time. Sites often reserve a partition or priority for short interactive work. The hard problem is the mismatch of human timing: people leave sessions idle while holding expensive nodes, and a pending interactive request has a person waiting on it.",
    k: ["Dedicated interactive partition vs sharing the batch queue: dedicated gives fast starts, but idle capacity sits reserved for them.", "Strict short limits vs generous time: short limits stop idle hoarding, but interrupt real debugging."],
    p: ["Users leave an eight-GPU allocation idle overnight while thousands of jobs wait.", "The blocking client loses its connection and the allocation continues to run with no one attached."],
    v: "Request a one-node interactive session, confirm the shell prompt appears on a compute node within the expected wait, then exit and confirm the allocation is released and accounted.",
    dep: ["resource-requests", "job-launch-tree"]
  },
  "heterogeneous-job-requests": {
    s: "A single job made of several components with different resource shapes, such as one large-memory node plus many ordinary nodes, scheduled together.",
    d: "Components may each name their own node count, memory, accelerators and sometimes partition, and the job starts only when all can be placed at the same time. Tasks across components communicate as one parallel program. The scheduler must find a placement for every component in the same window, which makes backfill and reservations harder, since the job is as hard to place as its most constrained component. Accounting and limits are applied per component and for the whole.",
    k: ["Co-scheduling all components vs staggering them: co-scheduling is required for tightly coupled programs, but waits longer for a simultaneous window.", "Per-component partitions vs one partition: mixed partitions fit real hardware, but complicate limits and fair-share accounting."],
    p: ["One component requests a rare resource, and the whole job waits much longer than its other components suggest.", "Limits are checked per component but not for the sum, letting a job exceed an account's total."],
    v: "Submit a two-component job with one large-memory node and four standard nodes and confirm the scheduler starts both components at the same moment on suitable nodes.",
    dep: ["resource-requests", "node-selection", "backfill-planner"]
  },
});
