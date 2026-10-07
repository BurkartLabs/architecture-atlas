// Details for the HPC batch scheduler plate, part 2: queues, scheduling and resource selection.
ATLAS.details("hpc-scheduler", {
  "partitions-and-queues": {
    s: "Named pools of nodes with their own limits and defaults, which jobs are submitted to and which divide the cluster by hardware or purpose.",
    d: "A partition lists the nodes it contains, a default and maximum walltime, who may use it, a priority tier and a sharing policy. Nodes may belong to several partitions, so a job submitted to a short partition and a general one competes in both. Partitions encode hardware classes such as large-memory or accelerator nodes and service levels such as debug. They are simple to configure and hard to keep tidy: overlapping partitions multiply the cases the scheduler must consider, and users must choose among them.",
    k: ["Overlapping partitions vs disjoint ones: overlap raises utilization by sharing nodes, but makes limits and fairness harder to explain.", "Many specialized partitions vs few with constraints: specialized partitions are clear to users, while constraints reduce fragmentation of idle capacity."],
    p: ["Users submit to the wrong partition and wait days for scarce nodes when general ones were free.", "A partition's node list is not updated after hardware changes and jobs are routed to retired machines."],
    v: "Submit identical jobs to two overlapping partitions during a quiet period and confirm each starts at once on a node in the expected set, with limits of the chosen partition shown on the job.",
    dep: ["node-features", "cluster-state-model"]
  },
  "qos-levels": {
    s: "Named service classes that attach a priority boost, limits and preemption rights to jobs, independent of the partition they use.",
    d: "A quality-of-service record carries a priority adjustment, caps on jobs, nodes or time per user or in total, and flags such as whether jobs may preempt others or be preempted. Users pick from those their account is allowed to use. It is the main lever for urgent work, standby work that runs at no charge and is easily displaced, and fixed-price allocations. Because QoS interacts with limits at every level, the effective rule for a job is the combination of the strictest applicable ones.",
    k: ["QoS as the unit of limits vs account-level limits only: QoS gives flexible tiers, but multiplies combinations that must be validated.", "Letting users choose their QoS vs assigning it: choice is flexible, but needs policing so everyone does not pick the highest."],
    p: ["Every job uses the urgent class because it has no cost, and the class stops meaning anything.", "Two limits on one job conflict, and users cannot tell which one is holding it."],
    v: "Submit a job under a standby class and one under a normal class, confirm the standby job is priced at zero and listed as preemptible, and the normal one is not.",
    dep: ["account-hierarchy", "priority-factors", "preemption"]
  },
  "account-hierarchy": {
    s: "A tree of accounts and users to which allocations, limits and fair-share weights are attached, mirroring organizations and projects.",
    d: "Accounts form a tree, such as a facility, departments, projects and users. Each user-account pair is an association carrying shares, limits and permitted partitions and QoS. Charging goes to the account the job names, and fair-share is computed over the tree so a department's heavy usage lowers priority for all its members. The tree is maintained in the accounting database and propagated to the controller. It is hard because real organizations reorganize, and moving a project must not lose its history.",
    k: ["Deep tree mirroring the organization vs flat projects: a tree allows delegated management and group fairness, but makes every change ripple through shares.", "Users in many accounts vs one default: many accounts model real work, but make users choose and mischarge."],
    p: ["A user submits without naming an account and the job is charged to a default project that is not theirs.", "Removing a user from an account cancels or orphans their pending jobs."],
    v: "Add a user to two accounts, submit with each, and confirm the usage is attributed to the named account while a third, unlisted account is rejected at submit.",
    dep: ["association-management", "fair-share-tree"]
  },
  "per-user-limits": {
    s: "Ceilings on how many jobs, nodes, cores or running minutes a user or group may hold at once, so no one monopolizes the machine.",
    d: "Limits apply at several scopes: per user, per account, per partition and per QoS. They cap submitted jobs, running jobs, total cores or GPUs, and the product of resources and time. Jobs exceeding a limit stay pending with a limit reason but do not block others, so the scheduler must skip them rather than stall on them. Evaluating limits for every job each cycle is costly, so counters are maintained incrementally and updated on start and end of each job.",
    k: ["Limits enforced at submit vs at start: submit-time limits protect the queue, while start-time limits adapt as running usage changes.", "Counting resource-minutes vs counting jobs: resource-minutes is fair across job sizes, but harder for users to predict."],
    p: ["A counter is not decremented when a job is requeued, and the user's limit shrinks until the next restart.", "A user hits a limit but sees only a generic pending reason and opens a ticket."],
    v: "Set a limit of two running jobs, submit five, and confirm two run, three show the limit reason, and a different user's job starts normally.",
    dep: ["account-hierarchy", "main-scheduling-pass"]
  },
  "walltime-limits": {
    s: "The maximum run time a job may request and is allowed, enforced by the scheduler, which kills jobs that exceed it.",
    d: "Every job carries a time limit, defaulted and capped by partition. The scheduler uses it to plan: backfill relies on it to know when resources free up. When the limit is reached, the node daemon signals the job to stop, waits a grace period, then kills it. Limits can be reduced or extended by authorized users while the job runs. Because scheduling quality depends on the estimates being close to reality, but users have every reason to overstate them, walltime is the cluster's most important approximate input.",
    k: ["Mandatory user-supplied time vs a generous default: mandatory gives better planning, but pushes users to pad requests.", "A grace period before kill vs immediate kill: grace allows checkpoint writes, but delays release of nodes for the next job."],
    p: ["Users request the partition maximum for every job and backfill finds almost no gaps.", "A job killed at its limit loses hours of work because it never wrote a checkpoint."],
    v: "Submit a sleep job with a one-minute limit and confirm it receives a warning signal, is killed shortly after the minute ends, and finishes with a timeout state.",
    dep: ["partitions-and-queues", "signal-handling"]
  },
  "admission-control": {
    s: "The decision at submit time to accept, hold or reject a job based on whether it can ever run and on limits and policy.",
    d: "On submit the controller checks that the request fits some partition's hardware, that the account is valid and permitted, that limits and association rules allow it, and that the queue is not full. Jobs that could never run are rejected immediately; those over a temporary limit are accepted and held. Admission control is the main defense against queue growth that slows scheduling. The challenge is balancing strictness with the ability to submit before maintenance or a hardware addition makes a job feasible.",
    k: ["Reject infeasible jobs vs queue them: rejecting gives quick feedback, but fails jobs that would run after an upgrade.", "Hard queue-size cap vs per-user caps: a global cap protects the controller, but lets one user crowd out others."],
    p: ["A cap on total queued jobs fills with one user's array, so everyone else's submissions are refused.", "Rules rejecting jobs for a stale reason keep blocking after the policy is changed."],
    v: "Submit a job requesting more cores than the largest partition has and confirm it is rejected with the limit named, while one that fits an unavailable node set is accepted and left pending.",
    dep: ["per-user-limits", "partitions-and-queues", "association-management"]
  },
  "license-and-token-limits": {
    s: "Counted abstract resources, such as software licenses or filesystem bandwidth shares, that jobs request and that cap concurrent use.",
    d: "A token is a named count defined in configuration. Jobs request some number, the scheduler subtracts requests from the pool and keeps jobs pending when none remain. Unlike nodes, tokens have no location, so they are checked against global counters. Sites use them for shared filesystem load, per-project software seats or network-attached resources. They work when users request them honestly; since the scheduler cannot see actual consumption, enforcement relies on request accuracy.",
    k: ["Cluster-local tokens vs mirroring an external authority: local is simple and fast, but drifts when use happens outside the scheduler.", "Required tokens vs advisory ones: required prevents overload, but blocks jobs when an unrelated user holds them."],
    p: ["A job that never requested the token still uses the scarce resource and overloads it.", "Tokens held by a hung job are only freed at its time limit."],
    v: "Define two filesystem tokens, submit three jobs each wanting one, and confirm only two run at a time and the third shows a resources reason until a token frees.",
    dep: ["resource-requests", "consumable-resources"]
  },
  "federation": {
    s: "Linking several clusters so jobs can be submitted to one and run on whichever can start them first, with a shared view of queues.",
    d: "Each cluster keeps its own controller, and a federation layer lets a submission be copied to peers as sibling jobs. When one sibling starts, the others are cancelled. The peers exchange job state and start decisions with limited delay. The difficulty is consistency: two clusters may start siblings at the same moment, so a lock or origin-cluster arbitration decides the winner. Data location, differing hardware and independent policies mean federated jobs are only suitable when inputs are accessible everywhere.",
    k: ["Sibling jobs on all clusters vs routing to one by estimate: siblings start earliest, but load every queue with copies.", "Origin cluster arbitrates starts vs peer consensus: origin arbitration is simple, but a down origin blocks starts."],
    p: ["Both clusters start a sibling and the job runs twice, writing conflicting output.", "Federation hides a cluster outage, and jobs wait on a peer that is unreachable."],
    v: "Submit a federated job while one cluster is full and confirm it starts on the other, the sibling on the first is cancelled, and accounting records exactly one run.",
    dep: ["rpc-server", "job-state-machine", "credential-signing"]
  },
  "job-holds": {
    s: "Mechanisms for administrators and users to stop a pending job from starting or to override its priority without cancelling it.",
    d: "A held job stays in the queue but is never considered, until released. Users may hold their own; operators may place a held-by-admin state which users cannot clear. Priority can be set directly, bypassing the formula, to push a job ahead or behind. Holds are also applied automatically, for instance when a dependency is unmet or after repeated launch failures. They are small features that carry accountability: an unlabeled admin hold with no reason can leave a user's job stuck for months.",
    k: ["Separate user and admin holds vs a single hold: two kinds stop users from clearing operator holds, but need two release paths.", "Manual priority overrides vs formula only: overrides handle exceptions quickly, but accumulate and distort fairness."],
    p: ["A job held for maintenance is never released afterward and sits for weeks.", "Priority overrides left from past incidents place old jobs ahead of everything indefinitely."],
    v: "Hold a pending job as an operator, confirm the user's release attempt is refused, then release as an operator and confirm it is scheduled normally.",
    dep: ["job-state-machine", "priority-factors"]
  },
  "priority-factors": {
    s: "The weighted sum that ranks pending jobs: age, fair-share, size, partition, QoS and other terms, each normalized and multiplied by a site weight.",
    d: "Each pending job gets a number built from factors: how long it has waited, how far its account is below or above its entitlement, how large it is, the partition's tier, the QoS adjustment and optional site terms. Each is scaled between zero and one, then multiplied by a weight. The queue is sorted by the sum, and the highest is considered first. The weights are the site's policy, and they are hard to set because they interact: a heavy age weight slowly erases fair-share, while a heavy size weight favors large jobs.",
    k: ["Weighted sum vs strict tiers: a sum blends concerns smoothly, but is difficult to reason about and tune.", "Favoring large jobs vs small jobs: favoring large protects the machine's purpose, but starves quick tasks."],
    p: ["Age weight dominates, so a huge idle account's fair-share penalty has no effect on ordering.", "Priority values overflow or tie, and ordering among equals becomes unpredictable."],
    v: "Print the per-factor breakdown for two pending jobs and confirm the ordering of their totals matches the order in which the scheduler considers and starts them.",
    dep: ["fair-share-tree", "qos-levels", "partitions-and-queues"]
  },
  "fair-share-tree": {
    s: "A hierarchy of shares that compares each account's recent usage with its entitlement and turns the difference into a priority factor.",
    d: "Every node of the account tree holds a share value. The scheduler computes, for each, the ratio between usage and normalized share, and a job's fair-share factor reflects how its account compares with siblings, recursively up the tree. An account that used less than its share gets a boost; one that exceeded it is pushed back. The effect appears over days, not minutes. It is hard because the tree must be recomputed as jobs finish and as usage decays, and the formulas must give stable results with thousands of leaf users.",
    k: ["Tree-structured fair-share vs per-user only: a tree gives group fairness, but users in a busy group are penalized for others' use.", "Fine-grained recomputation at every job end vs periodic: continuous is accurate, but costly with large trees."],
    p: ["A new account with zero history jumps to the top and floods the queue.", "A user in a mostly idle group gets a large boost and starves others in the same department."],
    v: "Run two equal-share accounts with one submitting heavily for a day, then confirm the heavy account's fair-share factor is lower and the light account's pending job starts first.",
    dep: ["account-hierarchy", "usage-decay", "usage-rollups"]
  },
  "usage-decay": {
    s: "The time-weighted forgetting of past usage, so that old consumption counts less and an account's priority recovers over time.",
    d: "Past usage is multiplied by a decay factor tied to a half-life, typically days, so yesterday matters more than last month. The controller applies decay at regular intervals and adds the usage of running jobs as it accrues. A usage window can alternatively be reset at fixed intervals. The half-life is a policy choice: short forgives quickly and rewards bursts, long enforces sustained fairness. The implementation must keep numerical precision over long periods and avoid losing usage during restarts.",
    k: ["Exponential half-life decay vs a hard window reset: decay is smooth and avoids cliffs, but old heavy usage never fully vanishes.", "Charging usage as it accrues vs at job end: accruing keeps long jobs honest, but requires recalculation every interval."],
    p: ["Usage counters are lost on controller restart and every account suddenly appears to have used nothing.", "A very short half-life lets a user alternate bursts and idle gaps, always near the top."],
    v: "Record an account's usage, wait through one half-life with no new jobs, and confirm its stored usage has halved and its fair-share factor rose accordingly.",
    dep: ["controller-state-store", "usage-rollups"]
  },
  "main-scheduling-pass": {
    s: "The periodic loop that sorts pending jobs by priority and starts those that fit now, in strict order for the top of the queue.",
    d: "At intervals and on events such as a job ending, the scheduler takes the sorted queue and walks it, allocating resources to each job that fits and honoring limits. It stops considering a partition when a high-priority job cannot start and would otherwise be passed over, leaving the filling of gaps to backfill. Walk depth is limited so a long queue cannot make a cycle run for minutes. This loop holds the controller's state locks, so its duration directly delays submissions and queries.",
    k: ["Strict priority order vs allowing any fitting job to start: strict is predictable, but wastes idle nodes behind a large waiting job.", "Short cycle with a depth limit vs full queue evaluation: depth limits keep latency low, but jobs deep in the queue may wait for backfill."],
    p: ["A cycle runs for tens of seconds with the state lock held, and the controller stops answering commands.", "A job that cannot start because of a transient reason blocks lower-priority jobs behind it."],
    v: "Fill the queue with a few thousand jobs and confirm the main pass time stays under the configured bound while jobs start in priority order for the partition's top-ranked entries.",
    dep: ["priority-factors", "node-selection", "cluster-state-model", "scheduler-throttling"]
  },
  "backfill-planner": {
    s: "A second scheduling pass that fills idle gaps with lower-priority jobs, only if they will finish before a higher-priority job's planned start.",
    d: "The planner simulates future time. It takes running jobs and their end times, walks pending jobs in priority order, and reserves a start window for each top job. Smaller jobs are then tried in the gaps, allowed only if their time limit ends before the reserved start or if they use nodes unneeded by the reservation. It depends entirely on time limits being accurate. It is expensive because it maintains a timeline of resource availability, so it is limited by depth, window length and resolution.",
    k: ["Conservative backfill (protect every job) vs aggressive (protect only the first): conservative gives bounded waits, but finds fewer gaps.", "Fine time resolution vs coarse: fine fits tightly but costs time, while coarse is faster and leaves slivers idle."],
    p: ["Jobs with padded time limits make gaps look smaller than they are, so utilization sinks while short jobs wait.", "A cycle too short for the queue never reaches deep jobs, which starve."],
    v: "With a large job waiting for a full node set, submit short small jobs and confirm they start on idle nodes and the large job's start time does not move later.",
    dep: ["main-scheduling-pass", "walltime-limits", "advance-reservations"]
  },
  "advance-reservations": {
    s: "Resources set aside for a future time window for a user, group or maintenance, which other jobs may use only if they end before it begins.",
    d: "A reservation names nodes or a count, a start and end, and who may use it. The scheduler treats it as a hard block in the timeline: jobs that could overlap it are not started on those nodes. Authorized jobs name the reservation and run inside it. Uses include maintenance windows, classes, demonstrations and guaranteed deadlines. Draining before a reservation is the hidden cost: the nodes sit idle while waiting for running jobs to end, so a large reservation produces a wide trough in utilization.",
    k: ["Reserving specific nodes vs a count of any nodes: specific nodes suit hardware work, while a count lets the scheduler choose cheaper ones.", "Recurring reservations vs one-off: recurring is easy for weekly maintenance, but easy to forget and leaves stale blocks."],
    p: ["A maintenance reservation starts and long jobs still run on its nodes because their limit looked acceptable at submit.", "A reservation that is not deleted after an event keeps nodes empty."],
    v: "Create a reservation one hour ahead and confirm a two-hour job is not started on its nodes, a thirty-minute job is, and the reserved user's job starts inside the window.",
    dep: ["cluster-state-model", "backfill-planner"]
  },
  "gang-scheduling": {
    s: "Starting all tasks of a parallel job together, and optionally time-slicing several jobs on the same nodes by suspending and resuming them as a group.",
    d: "Tightly coupled programs make progress only when every task runs, so partial starts waste cores. The scheduler allocates all nodes at once. Time-sliced gang scheduling goes further: several jobs share nodes, and at short intervals the scheduler suspends one set of tasks together and resumes another, so no job waits long. It is hard because suspend must reach every node nearly at once, because memory stays occupied while suspended, and because the cost of switching is high for jobs with large state or active network use.",
    k: ["Space sharing (each job gets its nodes) vs time slicing: space sharing is efficient, while time slicing gives short jobs fast response on a busy machine.", "Suspend in memory vs checkpoint out: memory suspend is quick, but memory is not free for others."],
    p: ["Suspend signals reach nodes at different times, and ranks time out waiting on a peer that is already stopped.", "Suspended jobs hold memory, so a resumed job on the same node is killed for lack of it."],
    v: "Run two parallel jobs time-sliced on the same nodes and confirm all tasks of each stop and start together at slice boundaries, with no rank-level communication timeouts.",
    dep: ["job-launch-tree", "signal-handling", "consumable-resources"]
  },
  "preemption": {
    s: "Taking resources from a running lower-priority job, by suspending, requeueing or cancelling it, so a higher-priority job can start.",
    d: "Policy decides which jobs may preempt which, usually by QoS or partition tier. When a high-priority job cannot start, the scheduler picks victims that free the needed resources with the least loss, then signals them and waits a grace period before taking the nodes. Victims are requeued, suspended or cancelled depending on configuration. It is hard because victim choice affects wasted work, because checkpoints are the application's job, and because a job requeued repeatedly makes no progress.",
    k: ["Requeue vs suspend vs cancel: requeue frees everything but loses work unless checkpointed, suspend keeps work but holds memory.", "Preempting by partition tier vs by QoS: tiers are simple to see, while QoS is more flexible and harder to audit."],
    p: ["A job is preempted again and again just before finishing and never completes.", "The victim's grace period is too short for its checkpoint, and the file is left half written."],
    v: "Start a low-priority job filling a node, submit a high-priority job needing it, and confirm the first receives a signal, stops after the grace period, and the second starts on that node.",
    dep: ["qos-levels", "fault-recovery", "signal-handling"]
  },
  "scheduler-throttling": {
    s: "Limits on how much work the scheduler does per cycle, such as queue depth, jobs per user and cycle duration, so decision-making cannot starve the controller.",
    d: "Because scheduling holds state locks and runs while users submit and query, each pass is bounded: it examines only a number of jobs, a number per user, and stops after a time budget, then yields. Backfill similarly limits its window and resolution. These settings are the tuning knobs between scheduling quality and responsiveness. At scale, with hundreds of thousands of pending jobs, a default tuned for a small queue causes either delay or poor utilization.",
    k: ["Strict time budgets vs complete evaluation: budgets keep the controller responsive, but may skip jobs that could have started.", "Per-user examination caps vs global: per-user caps stop one user's queue crowding out others, but ignore real fit."],
    p: ["Raising the depth for utilization pushes cycles past their interval and requests time out.", "A user with a huge queue consumes the budget and hides startable jobs of others."],
    v: "Load a large pending queue and confirm each scheduling cycle ends within its time budget, command latency stays low, and the number of jobs examined matches the configured depth.",
    dep: ["cluster-state-model", "rpc-server"]
  },
  "node-selection": {
    s: "Choosing which specific nodes satisfy a job's request, by matching features, free resources and placement preferences.",
    d: "Given a job and a set of candidate nodes, the selector builds the list of nodes that have enough free cores, memory and devices and meet constraints, then picks among them using a policy such as best fit, least loaded or contiguous. It must be fast, since it runs for every candidate job. It differs for exclusive and shared allocation, and for requests spanning many nodes where topology matters. Poor selection fragments the cluster so that large jobs cannot find whole nodes.",
    k: ["Best fit (pack tightly) vs spread: packing leaves whole nodes free for large jobs, while spreading reduces contention on shared nodes.", "Selection plugin per resource model vs one algorithm: a plugin adapts to sites, but adds code paths to test."],
    p: ["Small jobs are scattered across all nodes, and a job needing whole nodes cannot start although the cluster is mostly idle.", "Selection ignores a node's drained state and places a job on a node about to be repaired."],
    v: "With a mix of small jobs running, submit a job needing four whole nodes and confirm the earlier small jobs were packed so four nodes are available without waiting for any to end.",
    dep: ["consumable-resources", "node-features", "cluster-state-model"]
  },
  "topology-aware-placement": {
    s: "Placing a multi-node job on nodes that are close together in the network, to reduce communication cost and interference between jobs.",
    d: "The scheduler holds a model of the network: switch tiers, groups, or torus coordinates. When selecting nodes, it prefers a set under one leaf switch or in one group, falling back to wider sets if none fits, and can accept a user hint about how strict to be. Better placement improves performance for tightly coupled jobs, but forces the scheduler to wait or fragment. The model must match the actual wiring, and drift between the file and reality gives confident but wrong placement.",
    k: ["Strict locality vs best effort: strict gives predictable performance, but increases wait and leaves nodes idle.", "Switch-based tree model vs coordinates: a tree fits fat-tree networks simply, while coordinates are needed for direct networks."],
    p: ["The topology file is not updated after cabling changes, and jobs are placed on nodes believed to be close.", "Jobs requesting strict locality wait for days while split placements would have started immediately."],
    v: "Submit a sixteen-node job with a one-switch preference and confirm all nodes share a leaf switch, then compare a bandwidth test with a deliberately spread placement.",
    dep: ["hardware-topology-discovery", "node-selection", "network-fabric"]
  },
  "consumable-resources": {
    s: "Tracking cores and memory as quantities that jobs consume, so several jobs share a node as long as each fits its remaining free amounts.",
    d: "In whole-node mode a job takes entire nodes. In consumable mode each node has counts of cores and memory, jobs subtract their allocations, and the scheduler places new jobs where enough remains. This raises utilization for small jobs but requires accurate memory limits and CPU binding, since otherwise jobs interfere. Accounting records what was allocated, not what was used. The model also affects the scheduler's speed, because per-node counters must be updated and checked for every placement.",
    k: ["Whole-node allocation vs consumable cores: whole nodes are simple and avoid interference, but waste cores for small jobs.", "Memory as a consumable vs unlimited: memory accounting prevents out-of-memory kills, but jobs that overestimate waste capacity."],
    p: ["Memory is not enforced, so one job's overuse kills a neighbor on a shared node.", "Cores are shared but not bound, and tasks migrate across a neighbor's cores."],
    v: "Run two four-core jobs on an eight-core node and confirm both start, each with its own cores and memory limit, and a third job requiring five cores waits.",
    dep: ["kernel-resource-controls", "cluster-state-model"]
  },
  "generic-resources-and-gpus": {
    s: "A way to describe arbitrary countable or typed devices, most often accelerators, and to allocate and expose specific ones to jobs.",
    d: "Each node declares devices by name, type, count and sometimes device file and link layout. Jobs request them per node or per task. At launch, the node daemon sets environment variables and cgroup device rules so a job sees only its devices. The scheduler can use link topology to prefer devices connected by fast interconnects, and can bind them to nearby cores. It is hard because device lists in configuration drift from reality when hardware fails or is replaced, and because users assume visibility when it is not restricted.",
    k: ["Auto-detected devices vs declared in configuration: detection tracks reality, but declaration gives predictable, reviewable state.", "Typed devices (model names) vs a plain count: typed allows exact matching, but fragments pools into many small ones."],
    p: ["A failed device remains in the configured count, and jobs land on a node that cannot start their kernel.", "Device visibility is controlled only by an environment variable, so a job can open devices it was not given."],
    v: "Request two of four devices on a node and confirm the job sees exactly two, a concurrent job sees the other two, and neither can open the other's device files.",
    dep: ["kernel-resource-controls", "hardware-topology-discovery", "resource-requests"]
  },
  "gpu-sharing-and-partitioning": {
    s: "Dividing one accelerator among several jobs, by hardware partitions or time-slicing, so small workloads do not each take a whole device.",
    d: "Some accelerators can be split into isolated slices with dedicated memory and compute, appearing to jobs as separate devices. Others allow time-sliced sharing, which gives no memory isolation or guarantees. The scheduler models slices as typed generic resources and must know which slice layouts exist, since changing a layout requires emptying the device. Sharing improves utilization for interactive work and inference. It complicates accounting, which must charge a fraction of a device, and health checks, since one slice's fault may affect the others.",
    k: ["Hardware partitions vs software time-slicing: partitions isolate memory and performance, but fix the layout, while time-slicing is flexible and unprotected.", "Static layouts vs reconfiguring on demand: static is simple, but on-demand needs a drained device and tooling."],
    p: ["Time-sliced jobs exhaust the device's memory, and one job's allocation failure kills a neighbor.", "Charges are computed per whole device, so shared use appears free or overcharged."],
    v: "Partition one device into four slices, run four jobs each on one slice, and confirm each sees one device with its own memory limit and that accounting shows a quarter share each.",
    dep: ["generic-resources-and-gpus", "charge-rates", "accelerator-health-checks"]
  },
  "memory-and-core-binding": {
    s: "Pinning tasks to specific cores and memory regions on a node so they stay close to their data and to the devices they use.",
    d: "Modern nodes have several processor sockets and memory regions, with higher cost to reach remote memory. The scheduler assigns each task a set of cores, and the launcher applies a mask, sometimes also a memory policy and a device affinity. The choice among packing tasks, spreading across sockets or following a device's locality changes performance noticeably. Defaults must be safe for novices, while expert users want explicit control. Binding is hard to verify because misplacement produces slow runs, not failures.",
    k: ["Automatic binding by default vs user-controlled: automatic helps most users, but can be wrong for hybrid parallel programs.", "Binding enforced by the kernel vs a request to the runtime: kernel enforcement is reliable, but applications that set their own binding conflict with it."],
    p: ["Tasks pile onto the first few cores of a socket because the binding mask was built from the wrong core numbering.", "A hybrid program's threads are confined to one core and run serially."],
    v: "Launch eight tasks on a two-socket node with binding, print each task's allowed cores and memory node, and confirm they match the intended layout with no overlap.",
    dep: ["hardware-topology-discovery", "task-binding", "kernel-resource-controls"]
  },
  "node-features": {
    s: "Labels on nodes, such as processor generation, memory size or network type, that jobs use as constraints to select suitable hardware.",
    d: "Administrators or detection scripts tag nodes with feature strings. A job's constraint expression combines them with and, or, and counts, for instance requiring a particular processor and a fast network. The scheduler filters node candidates by these expressions and may allow mixed features within a job. Features let one partition hold diverse hardware, but turn every request into a small query. They are error-prone when tags are inconsistent or invented by users without agreement on names.",
    k: ["Free-form feature strings vs a controlled vocabulary: free form is flexible, but typos create jobs that wait forever.", "Features on nodes vs separate partitions: features keep pools merged and efficient, but partitions give users a simpler choice."],
    p: ["A constraint with a misspelled feature matches no node, and the job waits with an unclear reason.", "A node's features go stale after a firmware or memory upgrade."],
    v: "Submit a job constrained to a feature carried by two nodes and confirm it runs on one of them, and that a job requiring a nonexistent feature is flagged as unsatisfiable.",
    dep: ["cluster-state-model", "hardware-topology-discovery"]
  },
  "power-management": {
    s: "Reducing energy use by powering off or slowing idle nodes, and capping power or frequency for running jobs.",
    d: "The scheduler can suspend idle nodes after a delay and resume them when needed, calling site programs to shut down and boot them. The wake delay is added to job start times. It can also set processor frequency policies per job, track measured energy in accounting, and cap total power by delaying starts. Savings are real for large systems with long idle periods, but cycling hardware reduces its life and boot failures become scheduling events. Power caps need rapid measurement to be safe.",
    k: ["Powering off idle nodes vs leaving them on: off saves energy, but adds start latency and boot failures.", "Frequency chosen by users vs by policy: user choice allows tuning for efficiency, while policy keeps power within facility limits."],
    p: ["A node fails to boot on resume, and the job waits on it until a timeout expires.", "Energy figures from sensors are sampled too coarsely, so short jobs show wrong consumption."],
    v: "Let nodes idle past the suspend delay, confirm they power down, submit a job, and confirm they resume and the job starts after the measured boot time with no manual action.",
    dep: ["dynamic-and-cloud-nodes", "resource-usage-sampling", "node-provisioning"]
  },
  "dynamic-and-cloud-nodes": {
    s: "Adding and removing nodes from the cluster while it runs, to follow demand with rented machines or repurposed hardware.",
    d: "Cloud-style nodes exist in the configuration as placeholders in a powered-down state. When pending jobs need them, the controller runs a resume program that creates the machine and waits for its daemon to register, then starts the job. Idle nodes are removed after a delay. Dynamic registration lets nodes announce themselves with their features. The difficulty is timing and cost: creation delays, quota limits and failure to start must be handled without the job being lost, and orphaned machines keep costing money.",
    k: ["Pre-defined placeholder nodes vs fully dynamic registration: placeholders keep scheduling predictable, while dynamic registration is flexible but harder to control.", "Scale down quickly vs keep warm: quick saves cost, while warm nodes avoid repeated creation delay."],
    p: ["The resume program fails because of a provider quota, and the job waits indefinitely on a node that will never appear.", "Nodes created but never registered continue to be billed."],
    v: "Submit a job needing a node that is powered down, confirm one is created and registers within the expected time, the job runs, and the node is removed after the idle delay.",
    dep: ["node-provisioning", "cluster-state-model", "node-daemon"]
  },
});
