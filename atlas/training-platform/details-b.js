// Details for the training platform plate, part 2: scheduling and allocation, fault tolerance and elasticity.
ATLAS.details("training-platform", {
  "admission-control": {
    s: "Decides at submission whether a job may enter the queue, based on quota, policy, validity and cluster capacity, and rejects or defers the rest with a reason.",
    d: "The controller receives the validated spec and checks the owner's quota, the priority class they may use, whether the cluster could ever satisfy the request, and any maintenance freeze. Accepted jobs get a queue position; deferred ones wait for a window; rejected ones return a message. It also sets the job's initial state, labels and retry budget. The hard part is saying no usefully: a job that can never fit should fail now, but one that merely cannot fit today should wait.",
    k: ["Rejecting impossible jobs at the door versus queueing everything: early rejection saves users days of waiting, but needs an accurate model of cluster capacity.", "Global policy checks versus delegating to team admins: global checks are consistent, while delegation lets teams set their own rules with less central load."],
    p: ["A job requesting more devices than a single network block holds is accepted and never schedules.", "Admission using stale capacity data accepts work during a maintenance freeze and then strands it."],
    v: "Submit one job larger than the cluster and one within quota during a freeze window: the first must be rejected with a capacity message, the second deferred with a stated start condition.",
    dep: ["quotas-and-budgets", "spec-validation"]
  },
  "job-queue": {
    s: "The ordered store of waiting jobs with their priority, owner, size, age and constraints, from which the scheduler repeatedly picks what to allocate next.",
    d: "The queue is a durable data structure, not just a list, because the control plane may restart while thousands of jobs wait. Each entry carries the effective priority, the time it has waited, its size and constraints, and a retry count. The scheduler reads it in policy order each cycle. Operators need to see why a job is waiting: lacking quota, waiting for a block of free devices, or blocked behind a larger job. The challenge is that explanations are as important as order, since unexplained waits generate support load.",
    k: ["Strict priority order versus age-weighted order: strict is easy to reason about, but starves low-priority work; aging bounds waiting at the cost of more complex behavior.", "Durable queue in a database versus in-memory state rebuilt on restart: durable survives crashes without surprises, while in-memory is faster but risks losing orderings."],
    p: ["A large job at the head waits for hundreds of devices to free up while smaller jobs behind it could have run.", "Queue entries for cancelled jobs linger and distort position estimates shown to users."],
    v: "Submit twenty jobs of mixed priority, restart the control plane, and confirm every job reappears in the same order and each waiting job shows a specific reason for waiting.",
    dep: ["admission-control"]
  },
  "gang-scheduling": {
    s: "Allocates all of a job's devices at the same moment or none at all, because partial allocation leaves started processes waiting uselessly for peers.",
    d: "A training job cannot make progress until every rank is present. The scheduler therefore treats the job as a single unit: it reserves enough nodes, commits them atomically and signals all start hooks together. While it accumulates nodes for a large job, it may hold partial reservations, which wastes capacity unless it uses backfill. Deadlocks arise when two big jobs each hold half of what they need. Real implementations use all-or-nothing transactions and bounded holding times.",
    k: ["Atomic commit of all nodes versus incremental accumulation: atomic avoids holding idle devices, while incremental can fill the cluster fast but risks deadlock between jobs.", "Reserving ahead for the next big job versus first-fit: reservation stops starvation of large jobs, at the cost of idle gaps small jobs could use."],
    p: ["Two large jobs each hold half the cluster and wait for the other to release, deadlocking until a timeout.", "A node failing between commit and launch leaves the gang one rank short with no automatic replacement."],
    v: "Submit a job needing 128 devices when 100 are free and confirm none are allocated to it, then free 28 and confirm all 128 are assigned at the same timestamp and start together.",
    dep: ["job-queue", "topology-aware-placement"]
  },
  "topology-aware-placement": {
    s: "Chooses which nodes a job gets by network distance and failure domain, keeping communicating devices close so collectives run at full bandwidth.",
    d: "The scheduler has a model of the cluster: devices within a node, nodes under one switch, switches in a block, blocks in the fabric. It prefers the smallest domain that fits the job, orders ranks so neighbors in the parallelism plan are near each other, and avoids splitting jobs across domains with weak links. It must also leave contiguous space for future large jobs. Placement is hard because it conflicts with fairness and utilization: strict placement fragments the cluster into pieces too small for big jobs.",
    k: ["Strict locality versus flexible placement: strict gives the best step time, while flexible shortens queues but can slow every step by a fixed percentage.", "Packing jobs tightly versus spreading across failure domains: packing preserves large free regions, but one switch failure then takes out a larger share of a job."],
    p: ["Fragmentation leaves enough free devices for a large job in total but never within a single block.", "A rank order that ignores topology sends the heaviest traffic across the slowest links."],
    v: "Launch the same job on a compact placement and on a deliberately scattered one and confirm the compact job's step time is lower, with the placement and block IDs visible in the job record.",
    dep: ["fabric-topology", "resource-requests"]
  },
  "fair-share-and-priority": {
    s: "Rules that decide who gets capacity when demand exceeds supply: weighted shares per team, priority classes and decay of past usage.",
    d: "The scheduler computes each team's entitled share and its recent usage, and orders jobs so that teams below their share are served first. Priority classes sit on top: production runs and urgent fixes outrank exploratory sweeps. Usage decays over a window so a team that was idle earns back standing. The policy is a balance between predictability and utilization, and between large jobs, which need long accumulation of free devices, and many small ones that can always slip in.",
    k: ["Share-based fairness versus strict priority classes: shares protect every team from being squeezed out, while priority classes serve deadlines but let high classes crowd out others.", "Long usage-decay windows versus short ones: long windows punish bursts and reward steady use, while short windows forgive past heavy use quickly."],
    p: ["A team splitting one large job into many small ones games fairness and delays everyone else's large runs.", "Priority inflation: every team labels its work urgent until the top class means nothing."],
    v: "Load the cluster with two teams at 70/30 weights and equal demand, then confirm over a day the allocated device-hours divide close to 70/30, and that a high-priority job still starts promptly.",
    dep: ["job-queue", "usage-metering"]
  },
  "preemption": {
    s: "Stops lower-priority or borrowed-quota jobs to free devices for higher-priority work, ideally after the victim has saved a checkpoint.",
    d: "When a high-priority job cannot be placed, the scheduler picks victims that free the right nodes at least cost, preferring jobs with a recent checkpoint, preemptible class or borrowed quota. It signals the victim to checkpoint, waits a grace period, then kills it and requeues it to resume later. The cost model matters: preempting a job that just started costs little, while one that is hours from its last checkpoint can lose substantial compute. Frequent preemption also fragments the cluster.",
    k: ["Grace period for checkpoint versus immediate kill: a grace period saves work but delays the urgent job, and is useless if saving takes longer than the grace.", "Preempting the smallest set of jobs versus the cheapest set: the smallest set disturbs fewer users, while the cheapest set loses less compute but touches more jobs."],
    p: ["A victim that ignores the preemption signal loses all progress since its last checkpoint when it is killed.", "Cycles of preemption and resumption leave a low-priority job repeatedly restarting without ever advancing."],
    v: "Fill the cluster with preemptible jobs, submit a high-priority job, and confirm victims write a checkpoint within the grace period, the job starts, and victims resume later from their saved step.",
    dep: ["fair-share-and-priority", "async-checkpoint-writer"]
  },
  "backfill": {
    s: "Starts small, short jobs in the gaps while a large job is waiting for enough devices, provided doing so does not delay the large job's planned start.",
    d: "The scheduler computes when the head-of-queue job can start from the expected finish times of running jobs, then looks for waiting jobs that fit in the idle devices and will end before that time. This depends on runtime limits in specs, so users must provide reasonably tight estimates, or the scheduler cannot trust them. Good backfill raises utilization sharply in clusters dominated by a few huge jobs. The weakness is estimate quality: jobs that run longer than declared would delay the reserved job unless they are killed.",
    k: ["Strict runtime enforcement versus trusting estimates: enforcement keeps reservations honest, but kills jobs that are only a little late.", "Conservative backfill versus aggressive: conservative protects every queued job's start time, while aggressive fills more gaps but can delay mid-queue jobs."],
    p: ["Users set maximum runtime to the cluster limit, so no job looks short enough to backfill.", "Backfilled jobs that overrun delay the large job anyway, defeating the reservation."],
    v: "With a 512-device job reserved to start in two hours, submit 30-minute 8-device jobs and confirm they start immediately in idle gaps and that the large job still starts on its predicted time.",
    dep: ["gang-scheduling", "job-queue"]
  },
  "node-draining": {
    s: "Takes a node out of service in an orderly way: stop new placements, let or help jobs leave, then hand it to repair or maintenance.",
    d: "An operator or the health system marks a node as draining. The scheduler stops allocating it, and the control plane either waits for the current job to finish, or asks it to checkpoint and migrate. After the node is empty it moves to a repair state where diagnostics, firmware updates or part replacement happen, and then it returns to the pool after a health check. Draining at scale is a continuous process, since rolling upgrades and repairs touch a share of nodes every day.",
    k: ["Waiting for jobs to end versus forcing migration: waiting costs no work but can take weeks for long runs, while forced migration frees nodes quickly at the cost of a restart.", "Draining whole blocks versus single nodes: block drains simplify network maintenance, while single-node drains reduce the blast radius."],
    p: ["A drained node returned to service without a health check fails the next job in its first minutes.", "Draining too many nodes in a block at once makes large placements impossible for days."],
    v: "Drain a node running a job and confirm no new work lands on it, the job is told to checkpoint, and after repair and a passing health test the node accepts jobs again.",
    dep: ["node-quarantine", "node-agent"]
  },
  "failure-detection": {
    s: "Notices that a process, node, device or link has failed and reports which one, within seconds, so the platform can react while the other ranks wait.",
    d: "Detection combines several signals: process exit codes, node-agent heartbeats, driver error events, network error counters and collective-library errors reported by ranks. A detector correlates them, since one dead node causes errors on every peer, and names the likely origin rather than every victim. It then informs the restart controller. The core difficulty is localization: the first error message seen is often from a healthy rank whose peer disappeared, so naive handling blames the wrong machine.",
    k: ["Many independent signals versus one heartbeat: many signals localize faults precisely, but require correlation logic that can itself be wrong.", "Fast detection versus conservative detection: fast cuts wasted time, while conservative avoids declaring a slow node dead and triggering a costly restart."],
    p: ["Blaming the first rank to log an error sends healthy nodes to repair while the faulty one keeps getting jobs.", "Heartbeats from a node agent keep arriving while the training process on the node is wedged."],
    v: "Power off one node in a 64-node test job and confirm the detector names that node, not a peer, within the configured detection time, and that the restart controller receives the event.",
    dep: ["node-agent", "hardware-telemetry"]
  },
  "hang-detection": {
    s: "Finds jobs that are alive but making no progress, usually blocked in a collective, by watching step counters and collective activity rather than process state.",
    d: "A hang looks healthy to every process monitor: processes run, heartbeats arrive, no error is raised. Detectors watch for step counters or logged metrics that stop advancing, collective operations that exceed a deadline, and idle devices on a job that should be busy. On suspicion they capture stack traces and collective state from each rank to find which one is missing from the operation. The hard part is distinguishing a hang from a legitimately slow phase such as a large checkpoint or an evaluation.",
    k: ["Progress-based timeouts versus per-operation timeouts: progress timeouts are simple, while per-operation timeouts localize the stuck call but need library support.", "Automatic kill and restart versus dump and wait for a person: automatic restart saves time, but destroys the state needed to debug a rare hang."],
    p: ["Timeouts set shorter than a checkpoint write kill healthy jobs every time they save.", "No stack traces captured before the kill leaves a recurring hang undiagnosable."],
    v: "Block one rank in a test job and confirm that, within the timeout, the platform reports the job as hung, identifies the rank missing from the pending collective and saves stack traces from all ranks.",
    dep: ["collective-timeouts", "metric-logging"]
  },
  "hardware-diagnostics": {
    s: "Targeted tests of devices, memory, links and network cards, run before jobs, after failures and periodically, to separate bad hardware from bad software.",
    d: "Diagnostics range from fast checks at job start, such as device visibility and link speed, to longer burn-in tests that stress compute, memory and interconnect and compare results with known-good references. They run when a node returns from repair, on a schedule on idle nodes, and when a failure points at a suspect. Results feed quarantine decisions. The hard part is coverage and time: the failures that hurt most are intermittent, so a short test passes a node that fails under a day-long run.",
    k: ["Short checks at every job start versus long tests only on schedule: short checks add minutes to every launch but catch obvious faults, while long tests find subtle ones off the critical path.", "Comparing to a reference result versus self-consistency: references catch silent wrong answers, but need a trusted baseline for each device type."],
    p: ["A passing quick test returns a flaky node to service where it kills the next large job.", "Diagnostics run on idle nodes use settings that never reach the power draw of real training."],
    v: "Insert a node with a known-faulty memory module into a pool and confirm the diagnostic suite flags it and routes it to quarantine before any job is placed there.",
    dep: ["node-agent", "accelerator-drivers"]
  },
  "node-quarantine": {
    s: "Marks suspect nodes unavailable for scheduling and tracks their state until diagnostics clear them or repair replaces them, so one bad machine stops killing jobs.",
    d: "When detection or diagnostics implicate a node, the health system cordons it: no new placements, and running jobs are asked to leave. The node enters a state machine such as suspect, diagnosing, repairing and probation, with history kept per device. Repeat offenders are escalated for hardware replacement. The difficulty is evidence and thresholds: quarantining too eagerly drains capacity, while too lazily lets a node fail job after job and repeatedly cost the cluster a restart.",
    k: ["Quarantine on first suspicion versus after repeated failures: first suspicion protects jobs but can drain healthy nodes blamed by mistake; repetition requires tolerating more failures.", "Automatic return after a passing test versus manual sign-off: automatic keeps capacity high, while manual review catches nodes that only pass short tests."],
    p: ["Healthy nodes blamed for a network fault are quarantined in bulk and shrink the usable cluster.", "A node cycling between quarantine and service with no failure count is never replaced."],
    v: "Fail a node three times in a test and confirm it is cordoned after the policy threshold, visible in the node's history with the evidence, and not returned to the pool until diagnostics pass.",
    dep: ["failure-detection", "hardware-diagnostics"]
  },
  "restart-controller": {
    s: "Supervises a job across failures: classifies the cause, decides whether to retry, replaces bad nodes, relaunches from the latest checkpoint and gives up after a limit.",
    d: "On a failure event the controller classifies the exit: platform or hardware fault, out of memory, user code error, preemption. Hardware faults are retried on other nodes, usually with spares to keep placement tight; code errors are retried at most a few times, since they repeat. It selects the newest valid checkpoint, requests resources from the scheduler with high priority since the job already ran, and starts a new attempt. Recovery time is the metric that matters: minutes lost at every failure multiply by the failure rate of a large job.",
    k: ["Retry with identical resources versus request fresh nodes: identical resources can retry quickly, but fresh nodes avoid a repeat on the same faulty machine.", "Unlimited retries versus a bounded budget: unlimited maximizes autonomy for hardware faults, but burns devices when the cause is a code bug."],
    p: ["Restarting from a corrupt latest checkpoint fails again; without fallback it loops until the retry budget ends.", "Waiting in the normal queue for replacement nodes turns a five-minute recovery into hours."],
    v: "Kill a node in a running 64-node job and measure the time to resume: the new attempt must start from the latest valid checkpoint on replacement nodes within the recovery target.",
    dep: ["failure-detection", "resume-state", "gang-scheduling"]
  },
  "elastic-membership": {
    s: "Lets a job continue or restart with a different number of workers after losses or additions, rebuilding communication groups and data assignments rather than waiting for the original size.",
    d: "On failure, the surviving ranks and any replacements go through a new rendezvous that assigns fresh ranks and a new world size. The training code then reshapes: parallel groups are rebuilt, checkpoint shards are reloaded onto the new layout, and the data pipeline redistributes remaining work. Elasticity can mean a shrunken data-parallel degree, which changes the global batch size and therefore needs a rule for the learning rate. It is complex for models using tensor or pipeline parallelism, which constrain valid sizes.",
    k: ["Continue at reduced size versus wait for replacement: continuing keeps progress moving, but changes batch size and throughput; waiting keeps the run identical but idles the cluster.", "Elasticity only in the data-parallel dimension versus all dimensions: data-parallel elasticity is tractable, while other dimensions need resharding of weights."],
    p: ["Silently changing the global batch size after a shrink alters training dynamics without any note in the run record.", "A new rendezvous that races with a late-recovering node produces two groups that each believe they own the job."],
    v: "Remove 8 of 64 data-parallel workers mid-run and confirm training resumes at 56 workers from the same step, with the new batch size and learning-rate rule recorded and the loss curve continuous.",
    dep: ["communicator-bootstrap", "resharding-on-load", "restart-controller"]
  },
  "straggler-detection": {
    s: "Identifies devices or nodes that run slower than their peers and so slow every synchronous step, even though nothing has failed.",
    d: "Synchronous training advances at the pace of the slowest rank. Detection compares per-rank times for compute and for waiting at collectives, usually from lightweight step timers or from profile samples; the rank with the shortest wait is the one others wait for. The causes are thermal throttling, a degraded link, noisy neighbors on the host, a slow disk read or uneven data. The challenge is that stragglers are intermittent and fleet-wide averages hide them, so detection needs per-rank history and a path from rank to physical node.",
    k: ["Continuous per-rank timing versus on-demand profiling: continuous timing catches intermittent slowdowns, while on-demand profiling is cheaper but misses them.", "Replacing a straggler immediately versus tolerating a small slowdown: replacement restores speed but costs a restart, so thresholds weigh both."],
    p: ["A single throttled device slows a thousand-device job by five percent for weeks, because average utilization hid it.", "Blaming the waiting ranks, which show high idle time, instead of the slow rank they wait for."],
    v: "Cap one device's clock in a test job and confirm the detector names that device as the slowest within a few minutes, and that the job's step time improves after the node is replaced.",
    dep: ["throughput-and-utilization", "hardware-telemetry", "node-quarantine"]
  },
  "silent-corruption-checks": {
    s: "Detects wrong arithmetic that raises no error, caused by faulty devices or memory, by comparing results across replicas and checking numerical invariants.",
    d: "Rare hardware faults can flip bits or compute wrong values without any error signal. Because data-parallel replicas should agree, the platform can compare gradient norms or checksums across replicas and flag divergence, rerun suspect steps on other devices, or run periodic known-answer tests. Checksums on checkpoints and on communications guard data in transit and storage. The cost is real overhead and the hard part is attribution: a divergence says which replica disagrees, but not whether the fault is in the device, memory or interconnect.",
    k: ["Cross-replica comparison versus known-answer tests: comparison catches faults during real work at modest cost, while known-answer tests find faults on idle nodes but miss ones that appear under load.", "Checking every step versus sampling: every step bounds the damage of a corrupt step, while sampling keeps overhead small but lets bad updates through."],
    p: ["A corrupted update enters the weights, is saved in checkpoints for hours and degrades the model quietly.", "Treating a loss spike from corruption as a data problem and skipping batches never finds the faulty device."],
    v: "Inject a deliberate bit flip into one replica's gradients in a test and confirm the check flags the replica within the next verification interval and the platform marks that device as suspect.",
    dep: ["data-parallelism", "node-quarantine", "checkpoint-integrity"]
  }
});
