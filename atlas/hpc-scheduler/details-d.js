// Details for the HPC batch scheduler plate, part 4: health, foundations and cross-cutting concerns.
ATLAS.details("hpc-scheduler", {
  "node-health-checks": {
    s: "Scripts that test a node's filesystems, memory, network, devices and services, and mark it unusable when they fail.",
    d: "A check runs periodically, at job start or end, and on demand. It verifies things jobs depend on: mounts respond, free memory and disk are adequate, devices are present, the network reaches key services, and critical daemons run. A failing result drains the node with a reason so operators can see it. It must be conservative about false positives, since each wrongly drained node reduces capacity, and quick, since a check that hangs on a broken mount hangs itself.",
    k: ["Frequent light checks vs rare thorough ones: frequent detects fast, but thorough checks cost real time on busy nodes.", "Automatic drain on failure vs alert only: drain stops bad jobs, but a bad check can empty the cluster."],
    p: ["A check that reads a hung filesystem blocks forever, and the node looks healthy because the checker never returns.", "A shared dependency failure makes every node fail the check and the cluster drains itself."],
    v: "Unmount a required filesystem on one test node and confirm the next check drains it within the interval with a clear reason, while other nodes remain in service.",
    dep: ["drain-and-resume", "node-daemon", "shared-filesystem"]
  },
  "heartbeat-and-failure-detection": {
    s: "Regular messages from nodes that let the controller notice when a node stops responding and mark it down.",
    d: "Nodes are polled or report on a schedule, and the controller marks a node not responding after a timeout. Running jobs on a failed node are ended or requeued according to their settings. Timeouts balance detection speed against false alarms from a briefly overloaded node. Reports also carry the node's free memory and uptime, and let the controller detect a reboot. At large scale, the heartbeats go through the tree to avoid millions of connections.",
    k: ["Short timeouts vs long: short detect failure quickly, but mark busy nodes down and kill jobs wrongly.", "Controller polling vs nodes reporting: polling is simple and controlled, while reporting scales better and tolerates the controller being busy."],
    p: ["A node that is slow but alive is marked down, and its job is requeued while still running there.", "A network blip marks a whole rack down and kills many jobs at once."],
    v: "Disconnect a node's network, confirm the controller marks it not responding after the timeout and handles its jobs per policy, then reconnect and confirm it returns to service.",
    dep: ["tree-communication", "node-daemon", "cluster-state-model"]
  },
  "drain-and-resume": {
    s: "Taking a node out of service for new jobs while letting its current jobs finish, and putting it back after repair.",
    d: "A drained node accepts no new allocations and shows a reason, set by a person, a health check or a failed prolog. It becomes drained once its running jobs end. Resume returns it to the pool, optionally after verification. Draining is the gentle way to do maintenance, a down state is the forceful one. Good practice requires reasons that are specific and who set them, because long lists of drained nodes with no explanation are common and hide lost capacity.",
    k: ["Drain until empty vs fail jobs immediately: draining is gentle, but delays repair, particularly with long jobs.", "Automatic return to service vs manual resume: automatic recovers capacity, but can reintroduce a flapping node."],
    p: ["Nodes remain drained with a vague reason for months and capacity quietly disappears.", "A flapping node is automatically returned after each failure and keeps killing jobs."],
    v: "Drain a node with a running job, confirm the job continues, no new job is placed on it, and after the job ends the node reports drained with the reason and the operator.",
    dep: ["cluster-state-model", "node-daemon"]
  },
  "resource-usage-sampling": {
    s: "Periodic measurement of each job's CPU, memory, I/O and energy, collected on the node and stored with the job record.",
    d: "The node daemon reads kernel counters for each job's group at a fixed interval, keeping totals and peaks, and can read device and energy sensors. At job end the values are sent to the accounting records. Sampling costs CPU on every node, so the interval is a compromise between detail and overhead. The data supports efficiency reports, which show users that they asked for far more than they used, and helps find jobs that thrash memory or leave cores idle.",
    k: ["Short sampling interval vs long: short catches peaks, but takes noticeable CPU and storage.", "Reading kernel counters vs instrumenting the process: counters need nothing from users, but cannot see inside the application."],
    p: ["A sampling interval longer than a brief memory spike misses the peak that killed the job.", "Counters reset when a task restarts, and totals are lower than real use."],
    v: "Run a job that uses a known amount of CPU time and memory, then confirm its record shows CPU time and peak memory within a few percent of the known values.",
    dep: ["process-containment", "node-daemon", "kernel-resource-controls"]
  },
  "job-profiling": {
    s: "Detailed time-series recording of a job's resource use, enabled on request, for diagnosing performance and efficiency problems.",
    d: "Beyond end-of-job totals, profiling stores usage samples over time for each task and node, including CPU, memory, file system and network activity, in a file or database. Users enable it for particular jobs. It reveals phases, such as input loading then compute, and imbalances among nodes. It adds overhead and produces large files, so it is opt-in, with limits on sampling frequency and retention. Merging per-node data into one timeline after the job finishes is a separate step.",
    k: ["Always on at low rate vs on demand at high rate: always-on catches surprises, while on-demand avoids overhead for most jobs.", "Per-node files merged later vs streaming to a central store: files are simple and robust, but need merging and storage."],
    p: ["Profiling a thousand-node job writes so much data that it slows the job being profiled.", "Per-node clocks differ and the merged timeline shows events out of order."],
    v: "Profile a job with a known compute and I/O phase pattern and confirm the merged timeline shows the phases at the right times on all nodes within the sampling interval.",
    dep: ["resource-usage-sampling", "time-synchronization", "shared-filesystem"]
  },
  "fault-recovery": {
    s: "What happens to jobs when nodes fail or jobs are preempted: requeue, restart from checkpoint, or end with a failure state.",
    d: "On node failure, the controller consults the job's setting: requeue it to start again from the beginning, or cancel it. Some systems let the job continue on surviving nodes if the program supports shrinking. Programs that write checkpoints can resume, but the scheduler only restarts them, since state capture is up to the application. Requeue loops are limited by a count. Accounting must record each attempt so the lost work is visible. A fault during a large job can waste thousands of node-hours.",
    k: ["Automatic requeue vs fail the job: requeue recovers work for restartable jobs, but re-runs jobs that are not safe to repeat.", "Application checkpoints vs system-level: application checkpoints are small and portable, while system-level works for any program but is heavy and fragile."],
    p: ["A non-idempotent job is requeued after a node failure and runs its side effects twice.", "A job that fails because of its own bug is requeued repeatedly, consuming nodes."],
    v: "Kill a node running a requeueable job, confirm the job returns to pending, restarts on healthy nodes, and its accounting shows both attempts with the first marked as node failure.",
    dep: ["job-state-machine", "heartbeat-and-failure-detection", "job-completion-records"]
  },
  "event-log": {
    s: "A chronological record of cluster events: job starts and ends, node state changes, reservation changes and configuration reloads, with reasons.",
    d: "The controller logs structured entries to files and, optionally, to a central logging system. Entries cover scheduling decisions, node transitions with reasons, authentication failures, rejected submissions and limit hits. Logs are the primary tool for answering why a job waited or why a node went down. Verbosity can be raised by component at runtime. Logs must be rotated, kept long enough for investigations, and be cheap enough that debug levels do not slow scheduling.",
    k: ["Debug flags per subsystem vs one global level: per-subsystem keeps volume down, but requires knowing where to look.", "Local files vs central log service: local is simple and survives network loss, while central allows cross-node correlation."],
    p: ["Log rotation is missing and the controller's disk fills, stopping the daemon.", "Debug logging left on after an investigation slows scheduling cycles."],
    v: "Pick a job that waited a long time and trace its reason from the log: confirm entries show the limit or resource shortage and the time it became eligible and started.",
    dep: ["controller-daemon"]
  },
  "accelerator-health-checks": {
    s: "Tests of GPUs and similar devices for memory errors, link faults, thermal throttling and driver state, run before and between jobs.",
    d: "Accelerators fail more often than CPUs and in subtler ways: single devices drop off the bus, links degrade, memory shows correctable and uncorrectable errors, or a device runs slower because of thermal limits. A check queries the device management interface, may run a short diagnostic kernel and compares throughput with a baseline. Failed devices can be removed from the node's resource list so that the other devices stay available. This is hard because a degraded device passes simple presence tests and silently slows whole parallel jobs.",
    k: ["Query-only checks vs running a short workload: query-only is fast and safe, but misses degraded performance.", "Drain the whole node vs remove one device: removing one preserves capacity, but needs reliable device-level state."],
    p: ["One slow device holds back a thousand-device synchronous job, and nothing reports a failure.", "A device is removed from the resource list but still visible to the next job."],
    v: "Inject a throttled device on a test node, confirm the diagnostic detects the throughput drop, the device is removed from the allocatable list and the node's other devices still receive jobs.",
    dep: ["generic-resources-and-gpus", "node-health-checks", "hardware-event-handling"]
  },
  "hardware-event-handling": {
    s: "Taking in hardware error reports, such as memory faults or power events, and turning them into node state changes and tickets.",
    d: "Nodes and their management controllers emit events for corrected and uncorrectable memory errors, disk faults, fan and temperature alarms and power loss. A collector reads these and applies rules: a few corrected errors may only be logged, repeated ones drain the node, a fatal one marks it down. Events can also open a repair ticket. The goal is to remove failing hardware before it corrupts a job's results. The hard parts are thresholds, because noise causes needless repairs, and correlating an event with the job that ran at that moment.",
    k: ["Act on thresholds of corrected errors vs wait for failure: acting early prevents silent corruption, but costs capacity.", "Management network events vs in-band reads: out-of-band works when the node is down, but needs separate access and credentials."],
    p: ["A corrected memory error rate is ignored until an uncorrectable error corrupts a week-long computation.", "Events are not tied to jobs, so the affected user is never told their results may be wrong."],
    v: "Inject a series of corrected memory errors on a test node and confirm the node is drained after the threshold, a ticket is opened, and the jobs that ran there recently are listed.",
    dep: ["drain-and-resume", "event-log", "node-health-checks"]
  },
  "shared-filesystem": {
    s: "A parallel filesystem visible at the same paths on all nodes, holding home directories, job scripts, input data and output.",
    d: "The scheduler assumes that a job's working directory, script and executables exist identically on every node. Parallel filesystems provide high bandwidth but have shared metadata servers that become the bottleneck when thousands of tasks open files or list directories at once. They also fail in ways that hang processes uninterruptibly. The scheduler depends on it for controller state in failover, output files and often the configuration. Jobs abuse it more often than any other shared resource.",
    k: ["One shared filesystem for everything vs separating home, project and scratch: one is simple, but lets heavy jobs slow everyone's login.", "Quotas enforced strictly vs advisory: strict protects shared capacity, but fails jobs at write time."],
    p: ["Thousands of tasks start in one directory and exhaust metadata service capacity.", "A hung mount blocks processes in uninterruptible wait, and jobs cannot be cancelled."],
    v: "Write and read a file from one node and confirm it is immediately visible with the same path, ownership and content on another, and check metadata rates under a many-task open test.",
    dep: ["network-fabric"]
  },
  "network-fabric": {
    s: "The high-speed, low-latency network joining nodes for application traffic, plus the management network used by the scheduler's own messages.",
    d: "Application traffic uses a dedicated fabric whose topology, such as a tree of switches or a direct network, determines how placement affects performance. The scheduler's control messages typically use an ordinary Ethernet management network. Both must be stable, and the scheduler needs a description of the topology for placement. Congestion from one job can slow others on shared links, so isolation or adaptive routing may be provided. A partial failure, such as a degraded link, often shows as slow jobs rather than errors.",
    k: ["Separate management and application networks vs shared: separate keeps scheduler messages reliable under load, but costs cabling and switches.", "Fat-tree vs direct topologies: fat-trees give uniform bandwidth, while direct networks scale cheaply and make placement matter."],
    p: ["A job's heavy traffic saturates links, so control messages are delayed and nodes are marked down.", "A degraded link is not detected, and one parallel job runs at half speed for weeks."],
    v: "Run a bandwidth test between node pairs under the same leaf switch and across switches, and confirm results match the design values, and control-plane latency stays normal while a heavy job runs.",
    dep: []
  },
  "identity-services": {
    s: "A directory that provides the same users, groups and numeric identifiers on every node, which the scheduler relies on to run jobs as the right person.",
    d: "Compute nodes look up users and groups through a directory service or synchronized files. The node daemon starts tasks under the submitter's user ID and groups, and file access depends on it matching the filesystem's owners. If identities differ between nodes or lookups are slow, jobs fail or write files as the wrong owner. Large jobs cause a surge of lookups when thousands of tasks start together, so nodes cache them. Authorization in the scheduler is by the same identities.",
    k: ["Central directory with local caching vs files pushed to nodes: a directory is easy to manage, but a slow one stalls launches.", "Resolving identity on the controller and passing it vs on each node: on the controller is consistent, but nodes still need it for file access."],
    p: ["Cache on a node expires during an outage and a job cannot resolve its own user.", "A user's numeric ID differs between two clusters and shared data is owned by someone else."],
    v: "On several nodes run an identity lookup for one user and confirm the same user ID and groups are returned each time, and a launch of a thousand tasks completes without lookup timeouts.",
    dep: ["network-fabric"]
  },
  "credential-signing": {
    s: "A service that creates and verifies signed credentials proving who sent a request, shared by the controller and node daemons across the cluster.",
    d: "A client asks the local credential service to sign its user ID. The scheduler daemon on receiving it checks the signature using a key shared by all nodes in the cluster, and confirms it is fresh and unused. This avoids passwords on every message. The key must be distributed to every node and protected, and clocks must be near enough for the freshness check. The scheduler also signs its own job credentials, which tell nodes what resources a job may use.",
    k: ["Shared symmetric key across the cluster vs per-node asymmetric keys: shared is simple and fast, but a stolen key compromises the cluster.", "Replay protection by short lifetimes vs tracking used tokens: short lifetimes need synchronized clocks, while tracking uses memory."],
    p: ["Clock skew on a node causes valid credentials to be rejected as expired.", "The key file is readable by users on a login node, and requests can be forged."],
    v: "Send a request with a signed credential, confirm it is accepted, then replay the same credential after its lifetime and confirm it is rejected, and test one signed with a wrong key.",
    dep: ["time-synchronization", "identity-services"]
  },
  "time-synchronization": {
    s: "Keeping clocks on all nodes close to each other, since credentials, time limits, accounting and logs all depend on a shared notion of time.",
    d: "Nodes synchronize to a time source over the network, usually within milliseconds. The scheduler uses the controller's clock for time limits and start times, and node clocks for usage timestamps and credential freshness. Large offsets cause rejected credentials, jobs ending at the wrong time and logs that cannot be correlated. Jumps are worse than drift: stepping a clock backward can make a job appear to have negative duration. Detecting and alarming on offset is simpler than debugging its effects.",
    k: ["Stepping the clock vs slewing gradually: stepping fixes error fast, but breaks elapsed-time calculations, while slewing is safe and slow.", "Synchronizing to a site source vs each other: a site source gives accuracy, while peer sync gives only relative agreement."],
    p: ["After a long suspend a node's clock jumps forward and its jobs appear to exceed their time limit.", "Time zones differ between nodes' logs, and events are misordered during analysis."],
    v: "Query clock offset on all nodes and confirm each is within the bound, then step one node's clock by a minute in a test and confirm the monitoring alarm fires.",
    dep: ["network-fabric"]
  },
  "node-provisioning": {
    s: "Installing and updating the operating system image and software on nodes consistently, so that all nodes in a partition are identical.",
    d: "Nodes boot from an image delivered over the network or installed to disk, with the node daemon, drivers and libraries included. Updates roll through the cluster by draining nodes, rebooting into a new image and returning them to service, so jobs do not see mixed versions. The scheduler cooperates by providing reboot-when-idle features and node states for maintenance. The challenge is drift: a node with a different library or driver than its neighbors causes the infuriating failure that happens only on some nodes.",
    k: ["Stateless image boot vs installed to disk: stateless is uniform and fast to reprovision, but depends on the boot services and loses local state.", "Rolling update vs full maintenance window: rolling keeps capacity, but runs mixed versions for a time."],
    p: ["A node missed in an update runs an old driver and fails only jobs that land on it.", "A bad image is rolled to all nodes at once and the cluster is unusable."],
    v: "Roll a new image to a few nodes via drain, reboot and resume, then compare image identifiers across all nodes and confirm jobs run normally on the updated ones.",
    dep: ["drain-and-resume", "network-fabric"]
  },
  "hardware-topology-discovery": {
    s: "Detecting each node's sockets, cores, memory regions, devices and their locality, to give the scheduler an accurate hardware description.",
    d: "At start, the node daemon reads the kernel's hardware description and builds a tree of sockets, cores, hardware threads, caches, memory regions and attached devices. It reports counts to the controller, and a detailed form is used for binding. The scheduler compares it with the configuration and flags a node whose real hardware differs, for example after a failed memory module reduced capacity. The network topology, in contrast, is not detectable from a node and must be supplied or discovered from switches.",
    k: ["Detected hardware vs declared in configuration: detection is accurate, but a missing component then silently changes capacity.", "Hardware threads exposed as cores vs hidden: exposing raises counts for throughput jobs, but hurts jobs that expect real cores."],
    p: ["A node loses a memory module, boots with half the memory, and keeps receiving jobs sized for the full amount.", "Core numbering differs across node types, and binding masks built for one are wrong on another."],
    v: "Compare each node's reported sockets, cores, memory and devices with the inventory, and confirm any node that boots with fewer resources is flagged and kept from scheduling.",
    dep: []
  },
  "kernel-resource-controls": {
    s: "The operating system's mechanisms for limiting and measuring groups of processes, such as control groups, affinity masks, device restrictions and resource limits.",
    d: "The kernel provides hierarchical groups with limits on memory, CPU shares and cores, device access and process counts, and counters that report usage. The node daemon creates a group per job and sets limits from the allocation. Affinity calls pin tasks to cores, and namespaces can isolate mounts and process IDs. These are the actual enforcement; the scheduler only decides. Their behavior changes between kernel versions, and accounting details such as how cache is charged can surprise users with kills that look unexplained.",
    k: ["Strict kernel limits vs trusting jobs: strict limits protect neighbors, but kill jobs for accounting subtleties such as cache.", "Isolating with namespaces vs plain groups: namespaces separate processes and mounts, but complicate tools that need to see the host."],
    p: ["A kernel upgrade changes how memory is charged, and jobs that fitted before are killed.", "A limit set on the wrong level of the group hierarchy fails to cover forked processes."],
    v: "Start a job limited to two cores and one gigabyte, run a busy loop and an allocation loop, and confirm it uses at most two cores and is killed near one gigabyte without affecting neighbors.",
    dep: []
  },
  "scratch-and-staging": {
    s: "Fast temporary storage on or near nodes, and mechanisms to move data in before a job and out after it, so jobs do not stall on slow shared storage.",
    d: "Local disks or a burst-buffer layer give high-speed scratch for temporary files. A job may request staging: the scheduler holds the job while input is copied to fast storage, and after it ends, copies results out before releasing the space. Per-job temporary directories are created and removed in prolog and epilog. This turns data movement into a scheduled, accounted step. It is hard because staging must finish before the allocation begins, or the nodes idle, and because failed jobs can leave large temporary data behind.",
    k: ["Staging as scheduled phases vs jobs copying by themselves: scheduled phases overlap with other work, but need the scheduler to model data movement.", "Local scratch vs shared fast tier: local is the fastest and private, while shared allows data to outlive a job and be seen by many nodes."],
    p: ["Temporary data from killed jobs is never cleaned up and fills the local disks.", "Staging out is skipped when the job is cancelled, and results are lost."],
    v: "Submit a job with input staging and output retrieval, and confirm the job starts after the input is in place, the output appears on shared storage after it ends, and scratch space is released.",
    dep: ["shared-filesystem", "prolog-epilog"]
  },
  "scale-and-decision-latency": {
    s: "How many jobs, nodes and requests the scheduler must handle per second, and how long a decision may take, which shapes data structures and algorithms in every layer.",
    d: "A small cluster tolerates a slow scheduling pass, while a facility with hundreds of thousands of queued jobs and ten thousand nodes needs cycles measured in seconds and request handling in milliseconds. This affects locking, bitmap data structures, tree communication, depth-limited backfill and incremental accounting. Throughput under bursts, such as a workflow submitting thousands of jobs at once, matters as much as steady state. Each layer spends part of a latency budget, and exceeding it anywhere shows up as unresponsive commands.",
    k: ["Optimizing for peak burst vs steady load: burst design needs queues and shedding, but spare capacity sits idle most of the time.", "Exact decisions vs bounded-time approximations: exact decisions are optimal, while bounded ones keep the controller responsive."],
    p: ["Tuning on a small test cluster misses the cost that appears only at hundreds of thousands of jobs.", "A new feature that scans all jobs per request is added without a scale test."],
    v: "Replay a synthetic load at the site's expected peak queue depth and request rate, and confirm the scheduling cycle length and the ninety-ninth percentile request latency stay within their targets.",
    dep: []
  },
  "fairness-versus-utilization": {
    s: "The standing tension between giving every group its entitled share promptly and keeping every node busy, which every scheduling policy resolves in some way.",
    d: "Strict fair-share and strict priority leave nodes idle when the next job in line cannot fit, so backfill, preemption and sharing are added to raise utilization, each at some cost to predictability. Large jobs need whole sets of nodes and wait unless the scheduler holds resources for them, which idles nodes. The choices are the site's policy: what the machine is for, who funds it, and which delays are acceptable. They must be written down, since users read the scheduler's behavior as the policy.",
    k: ["Holding nodes for large jobs vs filling them immediately: holding gives large jobs a chance, but idles capacity.", "Short half-life for usage vs long: short restores priority quickly, while long enforces fairness over months."],
    p: ["Tuning only for utilization produces a machine that is full but where small projects feel locked out.", "Policy changes are made without telling users, who then suspect favoritism."],
    v: "Over a month, compare each account's delivered usage with its entitled share, and the cluster's utilization, and confirm both lie within the ranges the site's policy states.",
    dep: ["priority-factors", "backfill-planner", "fair-share-tree"]
  },
  "failure-handling": {
    s: "The assumption that nodes, links, daemons and the database fail constantly at scale, and the choices about detection, recovery and what a job may lose.",
    d: "In a cluster of thousands of nodes, hardware failures occur daily, so every layer is designed to continue: heartbeats find failed nodes, jobs are requeued or ended cleanly, the controller has a standby, accounting buffers records, and prologs keep bad nodes out. Failure also defines what users may expect: whether a job survives a node loss depends on the application's checkpoints. The hard cases are partial failures, such as slow nodes, degraded links and hung filesystems, which are not detected by simple up-or-down checks.",
    k: ["Fail fast and requeue vs wait for recovery: failing fast frees resources and users, but loses running progress.", "Redundant controllers vs a quick restart: redundancy shortens outages, but adds the risk of two active controllers."],
    p: ["Recovery paths are never exercised and fail the first time they are needed.", "A partial failure is treated as an outright one, and the response worsens the incident."],
    v: "In a test, kill a compute node, the controller, and the accounting daemon in turn during a load, and confirm each is recovered per design with no lost accounting records or double-run jobs.",
    dep: ["fault-recovery", "controller-failover", "heartbeat-and-failure-detection"]
  },
  "security-boundaries": {
    s: "Where trust changes: users versus the scheduler, one user's job versus another's on a shared node, nodes versus controller, and the portal versus everything behind it.",
    d: "Users must run only as themselves and see only their resources, so identity is established by signed credentials and enforced by the node daemon, containment and device restrictions. Nodes are partially trusted, and a compromised node must not be able to start jobs or forge accounting. Administrative actions need distinct privileges. Portals and APIs that act on users' behalf concentrate risk. Each boundary needs both a technical control and an audit trail, and shared nodes need containment from the start, not as an add-on.",
    k: ["Strong isolation with containers and namespaces vs trust on shared nodes: isolation protects users from each other, but adds setup cost and compatibility issues.", "Whole-node exclusive allocation for sensitive work vs shared: exclusive avoids side channels, but lowers utilization."],
    p: ["A job reaches another user's processes or files because the group mapping is wrong.", "A key that signs credentials is shared with login nodes, where users can read it."],
    v: "As an ordinary user, attempt to signal another user's job, read its temporary directory, and open its devices, and confirm every attempt is refused and recorded in the logs.",
    dep: ["credential-signing", "process-containment", "identity-services"]
  },
  "state-consistency": {
    s: "Keeping the controller's picture of jobs and nodes equal to what is true on the nodes and in the database, through crashes, retries and network splits.",
    d: "Truth is split: the controller holds the intended state, node daemons hold the actual processes, and the database holds history. These can disagree after a crash, a lost message or a failover. Reconciliation rules decide who wins: after restart the controller trusts node reports for what runs, and nodes trust the controller's orders for what should run. Operations are made idempotent so retries are safe, and leases and tokens prevent two controllers acting at once. Leaks of resources, ghost jobs and duplicate records are the symptoms of getting it wrong.",
    k: ["Controller as sole authority vs nodes as authority for running work: a sole authority is simple, but errors persist, while node authority corrects them.", "Idempotent retried messages vs exactly-once delivery: idempotence is practical, but every handler must be written to tolerate repeats."],
    p: ["A job runs on nodes that the controller believes are free, and a second job is started on them.", "A completed job's resources are never released because the completion message was lost."],
    v: "Restart the controller during a burst of starts and ends, then run an audit comparing jobs and allocations in the controller, processes on the nodes and records in the database; confirm they agree.",
    dep: ["controller-state-store", "job-state-machine", "accounting-buffering"]
  },
  "time-limits-as-contract": {
    s: "The agreement that a job's stated time limit is a promise: the scheduler plans with it and enforces it, and users must size it honestly.",
    d: "Backfill, reservations, maintenance drains and preemption grace all use time limits to predict when resources free up. Users overestimate, so plans are pessimistic, and underestimates kill work. The scheduler's side of the contract is enforcement and clear warnings; the user's side is accurate estimates and checkpoints. Sites improve the contract with efficiency reports, default limits, limit maxima per partition and short-job incentives. Systems that cannot rely on limits, such as those with unbounded interactive work, need other mechanisms.",
    k: ["Strict enforcement vs extending limits on request: strict makes planning reliable, while extensions help users but shake the schedule.", "Charging for the requested time vs used time: requested time rewards honest estimates, while used time rewards padding."],
    p: ["Users learn that padded limits cost nothing and every job asks for the maximum.", "A policy that extends limits quietly makes reservations and maintenance windows unreliable."],
    v: "Compare requested limits with actual runtimes over a month, then confirm the median ratio matches the site's target and that jobs hitting their limit are killed within the grace period.",
    dep: ["walltime-limits", "backfill-planner", "advance-reservations"]
  },
});
