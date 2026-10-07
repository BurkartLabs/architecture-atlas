// Details for the training platform plate, part 1: job specification, experiments, monitoring, cost accounting.
ATLAS.details("training-platform", {
  "job-spec-schema": {
    s: "The declarative description of a run: code version, entry command, resources, environment, priority and restart policy, in a form both the scheduler and the runtime can read.",
    d: "The schema separates what the job is from where it runs. It names a code revision, a container image, a command, the number and type of devices, the maximum runtime, and policies for preemption and restart. The control plane stores it as an immutable record so a restart or a retry on other machines runs the same thing. Hard parts are versioning the schema while old jobs still run, and keeping it small enough that researchers fill it in correctly rather than copying a stale example.",
    k: ["A declarative spec versus an imperative launch script: declarative lets the platform validate, queue and replay the job, but cannot express every custom launch sequence.", "One spec for every job type versus per-kind schemas: one schema is simpler to operate, while per-kind schemas catch more mistakes at submission."],
    p: ["Fields that default silently, such as restart count, let a crashing job loop for days burning devices.", "Specs referencing a mutable branch or tag mean a restart quietly runs different code than the original."],
    v: "Submit a spec, kill the job, and resubmit from the stored record: the restart must report the same code revision, image digest and resource shape, visible in the job's metadata.",
    dep: ["container-images"]
  },
  "resource-requests": {
    s: "The part of a spec that states how many accelerators, how much host memory and which interconnect a job needs, plus constraints such as placement domain and device generation.",
    d: "Requests are expressed in whole devices and nodes because training jobs use entire servers and their local links. They can carry constraints: same network block, a minimum device memory, a specific generation, or exclusive use of the node's network cards. The scheduler treats them as hard requirements for gang allocation. The difficulty is that a request that is slightly off, such as asking for nine nodes where eight fit a switch, can wait much longer or run measurably slower.",
    k: ["Requesting whole nodes versus fractions of devices: whole nodes give predictable communication and isolation, but strand capacity for small experiments.", "Hard placement constraints versus soft preferences: hard constraints guarantee speed but lengthen queues; soft ones start sooner on possibly slower placements."],
    p: ["Over-requesting devices the parallelism plan cannot use leaves paid hardware idle for the whole run.", "Constraints copied from an old job pin a new run to a scarce hardware generation for no reason."],
    v: "Submit a job requesting 64 devices in one network block and confirm the allocated nodes all report the same block identifier and that no other job shares their network cards.",
    dep: ["job-spec-schema"]
  },
  "container-images": {
    s: "Versioned, immutable bundles holding the training code, framework, libraries and device runtime, so every node in a job runs the same software.",
    d: "Images are built from a pinned base containing the driver-compatible device runtime and communication libraries, then layered with the framework and the team's code. Nodes pull them from a registry, usually through a cache close to the cluster, and the spec references them by content digest. Starting a thousand nodes at once makes the pull itself a load event. Compatibility is the hard part: framework, device runtime, collective library and driver versions must all agree.",
    k: ["Digest-pinned images versus floating tags: digests make runs reproducible and restarts safe, but demand a build step for every code change.", "Fat images with code baked in versus thin images plus mounted code: fat images start reproducibly; thin ones iterate faster but risk drift between nodes."],
    p: ["A thousand nodes pulling a multi-gigabyte image at once saturates the registry and delays start for many minutes.", "A driver upgraded on some nodes but not others makes the same image fail on only part of the job."],
    v: "Start a job on 512 nodes and confirm every node logs the same image digest, framework version and collective library version, and that start time stays within the budgeted window.",
    dep: ["container-runtime"]
  },
  "launch-entrypoint": {
    s: "The program that starts on each node, discovers its rank and peers, initializes communication and then hands control to the training code.",
    d: "A launcher receives environment variables from the scheduler: node rank, world size, the address of a coordinator and device lists. It starts one process per device, sets affinity and variables for the communication library, waits at a rendezvous until all processes arrive, and then runs the training function. It forwards signals so the platform can stop jobs cleanly and exits with codes the restart controller can classify. The difficulty is that any one process failing to start must fail the whole job fast rather than hang the rest.",
    k: ["Platform-provided launcher versus user-written scripts: a common launcher gives uniform rank assignment and error handling, but constrains unusual setups.", "Static rank assignment versus assignment at rendezvous: static is simple and reproducible, while dynamic assignment is needed for elastic membership."],
    p: ["One process that never reaches the rendezvous leaves hundreds of others waiting in silence until a timeout.", "Exit codes that do not distinguish a hardware fault from a code bug make the controller retry bugs forever."],
    v: "Start a job with one deliberately broken node and confirm the whole job aborts within the rendezvous timeout, with logs naming the missing rank and the node that failed to start.",
    dep: ["communicator-bootstrap", "container-images"]
  },
  "spec-validation": {
    s: "Checks run at submission that reject jobs that cannot succeed: unavailable resources, unknown images, impossible parallelism shapes, missing permissions and budget violations.",
    d: "A validator runs the spec against the cluster's catalog and policies before it enters the queue. It checks that the requested devices exist, that the parallelism degrees multiply to the device count, that the image and data paths resolve, and that the owner has quota. Some platforms also launch a short dry run on a few devices to catch configuration errors. The difficulty is calibrating strictness: rules that are too loose waste hours of queue time, and rules that are too tight block legitimate unusual jobs.",
    k: ["Static checks only versus a short dry run on real devices: static checks are free and instant, but dry runs catch out-of-memory and shape errors the static rules cannot.", "Blocking errors versus warnings: blocking protects the cluster, while warnings keep experienced users unblocked."],
    p: ["A job accepted with a wrong data path waits in the queue for a day and then fails in its first seconds.", "Validation rules drift from what the scheduler actually supports, rejecting valid jobs or admitting impossible ones."],
    v: "Submit a spec whose tensor and pipeline degrees do not divide the device count and confirm it is rejected immediately with a message naming the mismatch, without entering the queue.",
    dep: ["job-spec-schema", "quotas-and-budgets"]
  },
  "job-templates": {
    s: "Reviewed, reusable starting specs for common job shapes so researchers inherit tested launch settings, network variables and parallelism defaults instead of assembling them by hand.",
    d: "A template pairs a spec skeleton with defaults for a known model family and hardware: environment variables for the communication library, recommended parallelism degrees, checkpoint cadence and restart policy. Users override a few fields. Platform engineers update templates as they learn what works, and new jobs pick up improvements without edits. The challenge is governance: templates become de facto standards, so a bad default is copied into hundreds of jobs, and an unversioned change alters running workflows.",
    k: ["Central templates versus each team's own: central templates spread fixes quickly, but a team with special needs must fork and then maintain the fork.", "Pinned template versions versus always-latest: pinning keeps runs stable, while latest propagates safety fixes automatically but can change behavior mid-project."],
    p: ["A template with a conservative timeout default is copied everywhere and kills long runs that were working.", "Templates not updated for a new hardware generation silently leave performance on the table."],
    v: "Create a job from the template with only a name and data path set, run it on a small slice of the cluster, and confirm it trains at the throughput the template documents.",
    dep: ["job-spec-schema", "launch-entrypoint"]
  },
  "config-composition": {
    s: "Builds a run's final configuration by layering defaults, model and data presets and command-line overrides, and records the fully resolved result.",
    d: "Configurations are written as small composable pieces: a model preset, an optimizer preset, a data mixture, a hardware profile. A composition engine merges them in order with later layers overriding earlier ones, validates types and ranges, and writes the resolved tree to the run record. Sweeps vary fields of this tree. The hard part is that composition hides the final values: a researcher cannot tell which layer set the learning rate unless the engine shows its provenance.",
    k: ["Layered composition versus one flat file per run: layers avoid copy-paste and make comparisons easy, but obscure where a value came from.", "Typed schema versus free-form dictionaries: types catch mistakes at launch, while free-form keys let experimental options appear without code changes."],
    p: ["An override applied in the wrong order trains with an unintended learning rate and nobody notices for days.", "A new option with a silent default changes every old config's behavior when the code is upgraded."],
    v: "Compose a config with two overrides, dump the resolved config from the run record, and confirm each value and the layer that set it match the intended settings.",
    dep: []
  },
  "run-identity": {
    s: "Assigns every run a stable identifier and attaches to it the code revision, config, data version, seeds and parent run, so any result can be traced to its inputs.",
    d: "At submission the platform mints an identifier and writes a record linking the resolved config, source revision, image digest, dataset snapshot and random seeds. Restarts and resumptions join the same run as numbered attempts, while forks create a child run that points to its parent checkpoint. Metrics, checkpoints and logs are keyed by this identifier. The difficulty is deciding when something is a new run versus a continuation, since that choice determines how curves are stitched and which results are comparable.",
    k: ["Restart as the same run versus as a new run: the same run keeps one continuous curve, but hides that data or code changed between attempts.", "Platform-generated identifiers versus human-chosen names: generated ones never collide, but need a separate label field so people can find runs."],
    p: ["Two attempts sharing an identifier but using different code produce a curve that looks continuous and is not.", "Missing parent links make it impossible to know which checkpoint a fine-tuned model came from."],
    v: "Fork a run from a checkpoint, then query lineage from the child: it must return the parent run, checkpoint step, code revision and dataset snapshot without manual lookup.",
    dep: ["config-composition"]
  },
  "sweep-definition": {
    s: "A declaration of which parameters vary, over what ranges and distributions, how many trials to run, and which metric defines success.",
    d: "A sweep spec names the search space (continuous ranges, log scales, categorical choices, conditional parameters), the objective metric and direction, a trial budget, and per-trial resources. The sweep controller expands it into trial specs that go through the normal scheduler as ordinary jobs, each tagged with the sweep identifier. Trials need disciplined isolation of seeds and data order so differences come from parameters. The hard part is cost: a naive grid at large scale spends more than the research question is worth.",
    k: ["Many small proxy trials versus few full-size trials: proxies are cheap and wide but must transfer to scale, which is not guaranteed.", "Sweeping at the platform level versus inside one job: platform level isolates failures and scales out, while in-job sweeping shares data loading and startup cost."],
    p: ["Sweeping hyperparameters that interact with scale, such as learning rate, on a small proxy yields values that diverge at full size.", "Trials sharing a seed make differences look meaningful when they are noise."],
    v: "Launch a 20-trial sweep and confirm 20 linked runs appear, each with its sampled parameters in the record, and that the summary ranks them by the declared metric.",
    dep: ["config-composition", "run-identity"]
  },
  "search-algorithms": {
    s: "The strategies that choose the next trial's parameters: random, grid, population-based and model-based search that learns from finished trials.",
    d: "Random search samples the space independently and is a strong baseline. Model-based methods fit a surrogate to completed trials and propose points likely to improve. Population-based methods evolve a pool of concurrent runs, copying weights from strong members and perturbing parameters. The algorithm runs in the sweep controller, receives metrics from the tracker and asks the scheduler for resources. Hard parts are noisy objectives, because one seed can mislead the search, and asynchronous results, since trials finish at different times.",
    k: ["Random search versus adaptive methods: random is simple, parallel and unbiased, while adaptive methods use fewer trials but depend on the surrogate being appropriate.", "Population-based schedules versus fixed hyperparameters: they find schedules no one would write, but the final recipe is hard to reproduce from scratch."],
    p: ["Optimizing a single seed's validation score selects noise and the winner disappoints when rerun.", "Adaptive search concentrates trials in one region and never explores a second, better one."],
    v: "Run random and adaptive search with the same budget on a task with a known optimum and compare: the adaptive result should be at least as good on average over several repeats.",
    dep: ["sweep-definition", "metric-logging"]
  },
  "early-stopping": {
    s: "Ends trials that are clearly worse than their peers at a given step, freeing devices for more promising runs.",
    d: "The stopper compares each running trial's metric at checkpoints of progress against the distribution of other trials at the same step, and terminates those below a threshold such as the median or a successive-halving cut. It reads metrics from the tracker and sends a stop request through the scheduler, ideally after a checkpoint so the trial can be resumed. The hard part is that early learning curves do not always predict final quality: methods that learn slowly then catch up get eliminated unfairly.",
    k: ["Aggressive stopping versus patient stopping: aggressive frees resources sooner, but removes late bloomers and biases the search toward fast starters.", "Kill outright versus pause with a checkpoint: pausing preserves the option to resume, but holds storage and complicates accounting."],
    p: ["Stopping on a noisy early metric kills good trials in the first few hundred steps.", "A trial stopped without a checkpoint wastes everything it computed, and cannot be extended later."],
    v: "Run a sweep with early stopping on and off using the same seed set, and confirm the stopped sweep uses fewer device-hours while selecting a final model of equal quality.",
    dep: ["search-algorithms", "preemption"]
  },
  "reproducibility-capture": {
    s: "Snapshots everything needed to rerun a result: code, resolved config, image digest, dataset version, seeds, hardware shape and library versions.",
    d: "At launch the platform records the source revision with any uncommitted diff, the resolved configuration, the exact image digest, the dataset snapshot and shard list, random seeds and the cluster hardware profile. It stores them with the run record next to the checkpoints. Reruns replay this bundle. The limit is physical: floating-point reductions across devices depend on algorithm and device count, so an identical bundle yields nearby, not identical, results unless determinism is deliberately enforced at a throughput cost.",
    k: ["Capturing a code diff versus requiring a clean commit: capturing is convenient for exploration, but encourages results nobody can find in version control.", "Enforcing bitwise determinism versus statistical reproducibility: bitwise settles debugging disputes, but slows steps and rules out some fast algorithms."],
    p: ["An experiment that depends on an unrecorded environment variable cannot be rerun a month later.", "Capturing the dataset path but not its contents loses reproducibility when the files are updated in place."],
    v: "Rerun a finished 1,000-step run from its captured bundle and compare loss curves: they should match within the documented tolerance, or exactly when deterministic mode is on.",
    dep: ["run-identity", "container-images"]
  },
  "metric-logging": {
    s: "Collects scalars, histograms and text from every process and sends them to a central store, tagged with run, step and rank, without slowing training.",
    d: "Training code calls a logging API with values keyed by global step. A local buffer batches and ships them asynchronously to the metric service, which stores time series and serves dashboards and alert rules. Only one rank usually logs aggregated values; per-rank detail is sampled. Logging is hard to get right at scale: synchronizing a loss across thousands of devices costs a collective, buffers can lose data on crash, and a high-cardinality tag can overload the store.",
    k: ["Asynchronous buffered logging versus synchronous: buffering protects step time, but data in the buffer is lost if the process dies.", "Logging every step versus sampling: every step catches brief spikes, while sampling cuts storage and network load by orders of magnitude."],
    p: ["A blocking metric call in the training loop stalls every device whenever the metric service is slow.", "Logging per-parameter statistics from every rank overwhelms the metric store and drops the important series."],
    v: "Run a job, kill it mid-step, and confirm the dashboard shows data up to within one flush interval of the failure and that step time with logging on is within one percent of logging off.",
    dep: ["run-identity"]
  },
  "loss-spike-detection": {
    s: "Watches the loss and related signals for sudden jumps or divergence and triggers an alert, a rollback or a data skip before the run is ruined.",
    d: "A detector compares each step's loss to a trailing window using a robust statistic and flags excursions beyond a threshold, sustained rises or NaN values. Policies can pause the job, roll back to an earlier checkpoint, skip the offending batches, or lower the learning rate. Some detectors also watch gradient norms, which often jump first. The hard part is separating a harmless noisy batch from the start of divergence: false alarms waste time, and misses waste days of compute on a dead run.",
    k: ["Automatic rollback versus alert only: automatic rollback saves hours at night, but can loop on a bad data region without a person deciding to skip it.", "Fixed thresholds versus adaptive baselines: fixed are predictable, while adaptive follow the loss as it falls but can drift to accept a slow divergence."],
    p: ["A run continues for hours after the loss turned to NaN because the check ran only on the logging rank.", "Rolling back without advancing the data order replays the same bad batch and diverges again."],
    v: "Inject a corrupted batch into a test run and confirm the detector flags it within a few steps, that the configured policy executes, and that training recovers to the previous loss curve.",
    dep: ["metric-logging", "gradient-statistics", "resume-state"]
  },
  "gradient-statistics": {
    s: "Tracks gradient norms, update-to-weight ratios, activation magnitudes and per-layer statistics that reveal instability, dead units or precision problems before the loss shows them.",
    d: "Hooks in the training step compute cheap summaries: a global gradient norm, per-layer norms, the largest absolute activation, the fraction of overflowed or clipped values, and optimizer moment magnitudes. They reduce across devices and are logged at a lower rate than the loss. These signals lead the loss by tens or hundreds of steps. Cost matters: computing per-layer statistics adds collectives and memory traffic, so they are sampled and computed on the same buckets that gradient synchronization already forms.",
    k: ["Global norm only versus per-layer detail: global is nearly free, while per-layer data localizes the cause of an instability but costs extra reductions.", "Always on versus enabled on demand: always on catches the first spike, while on-demand keeps overhead out of production runs."],
    p: ["Reporting a gradient norm taken after clipping hides the very explosion the metric was meant to show.", "Per-layer statistics logged from one rank miss problems local to a tensor-parallel shard."],
    v: "Force a layer to produce large activations in a test and confirm the per-layer statistic for that layer rises above its baseline several steps before the loss moves.",
    dep: ["metric-logging", "mixed-precision"]
  },
  "throughput-and-utilization": {
    s: "Measures tokens or samples per second per device and the share of peak arithmetic capacity actually achieved, the main indicator of how efficiently the cluster is used.",
    d: "The step timer records forward, backward, communication and optimizer time, and the platform divides the model's known operation count by elapsed time and the devices' peak rate to report utilization of the arithmetic units. Dashboards show it next to the loss. A drop with an unchanged job points at a slow node, a congested link or an input stall. The hard parts are measuring honestly, since asynchronous device execution makes naive timers wrong, and knowing which of many causes moved the number.",
    k: ["Reporting utilization of peak versus raw throughput: utilization lets different models and hardware compare, but depends on an accurate operation count.", "Per-step timers with device synchronization versus event-based timing: synchronization is simple but stalls the pipeline; events stay asynchronous but need care."],
    p: ["A timer that does not wait for the device reports impossibly fast steps and hides a real slowdown.", "Averaging over a window hides periodic stalls, for example from checkpoint writes, that cost a tenth of throughput."],
    v: "Throttle one node's power in a test and confirm the job's reported throughput drops proportionally and the straggler analysis names that node within a few minutes.",
    dep: ["metric-logging", "hardware-telemetry"]
  },
  "hardware-telemetry": {
    s: "Continuously samples device temperature, power, clocks, memory errors, link errors and utilization from every node and stores it for alerting and for correlating failures.",
    d: "A node agent reads counters from the device driver and the network cards at a fixed interval, and exports them as time series labeled with node, device and the job currently placed there. Rules compare them with limits and with peer devices in the same job. Memory error counts, throttling reasons and link retries are the usual precursors to failures. The difficulty is volume and joining: thousands of devices at one-second resolution is large, and the data is only useful when linked to the job and step it affected.",
    k: ["High-frequency sampling versus coarse sampling: fine sampling catches brief throttling events, but multiplies storage and agent overhead.", "Per-job labeling versus node-only metrics: job labels let analysts connect a slowdown to a run, but require the agent to track placement changes."],
    p: ["Coarse sampling averages away short thermal throttling that is slowing every step of a synchronized job.", "Counters that reset on driver reload make error rates look like they improved after a recovery."],
    v: "Inject a corrected-memory-error burst or lower one device's clock cap and confirm the telemetry shows the change within one sample interval, labeled with the job running on that device.",
    dep: ["node-agent", "accelerator-drivers"]
  },
  "profiler-traces": {
    s: "Detailed timelines of kernels, memory copies and collectives captured for a few steps, used to find where a step spends its time and why devices wait.",
    d: "A profiler hooks the device runtime and the framework to record start and end times of every kernel, transfer and communication call on each device, along with host-side events and stack frames. Traces from many ranks are aligned on a common clock and viewed together, which exposes gaps where one device waits for another. Capture is scheduled for a short window because tracing is heavy. The hard part is the volume of data and aligning clocks across nodes accurately enough to compare ranks.",
    k: ["Scheduled windows versus continuous low-rate sampling: windows give full detail when needed, while sampling shows long-term drift but misses short events.", "Per-rank traces versus aggregated summaries: raw traces explain exactly what happened, but are large and need tools to read."],
    p: ["Profiling every step changes the timing it is meant to measure and moves the bottleneck.", "Unsynchronized clocks across nodes make one rank look late when its start was simply offset."],
    v: "Capture a five-step trace on 16 ranks, then identify the gap before one all-reduce and confirm the delayed rank also shows a long preceding kernel on its own timeline.",
    dep: ["device-runtime", "metric-logging"]
  },
  "alerting-and-paging": {
    s: "Turns monitoring signals into notifications to the right person, with severity, deduplication and a runbook, so a failing run is noticed in minutes.",
    d: "Rules evaluate metric streams: loss spikes, throughput drops, a node entering quarantine, an expired checkpoint deadline, a queue stuck for hours. Matches create alerts with the run, owner and a link to the relevant dashboard and runbook, grouped so one failure in a 1,000-node job produces one page, not a thousand. Routing sends hardware faults to infrastructure on-call and model issues to the owner. The challenge is precision: alert fatigue teaches people to ignore pages, and silent failures are only caught if the absence of data itself triggers an alert.",
    k: ["Paging on symptoms versus on causes: symptom alerts catch unknown failures, but cause alerts point to the fix, so most platforms keep both with clear ownership.", "Per-run alert rules versus platform-wide defaults: defaults give coverage for free, while per-run rules suit unusual jobs but are often never written."],
    p: ["A job that stops reporting metrics produces no alert because rules only fire on bad values, not missing ones.", "One failing node triggers an alert per device and hides the real cause among hundreds of notices."],
    v: "Stop a test job's metric output and confirm a missing-data alert fires within its configured window, grouped into one notification that names the run and its owner.",
    dep: ["metric-logging", "hardware-telemetry"]
  },
  "usage-metering": {
    s: "Records which job held which devices for how long, including queue wait, startup, productive training and idle time, as the raw data for every cost report.",
    d: "The control plane emits allocation events when a job receives nodes and releases them, and the node agent reports whether devices were busy. A metering pipeline joins these into device-hours per job, team and state: starting, training, checkpointing, restarting, failed. Billing-quality accuracy needs a source of truth for allocation, not a sampled estimate. The hard part is attribution during overlap and failure: when a node is quarantined mid-job, someone has to decide who pays for the lost hours.",
    k: ["Metering allocation versus metering actual use: allocation is simple and fair for reserved capacity, but hides idle devices that the owner could have released.", "Event-based records versus periodic sampling: events are exact but must be replayed correctly after a crash; sampling is easy but approximate."],
    p: ["Lost allocation events after a control-plane restart leave jobs billed for time they never held.", "Counting restarts as productive time hides how much of a large run's cost went to recovery."],
    v: "Run a job on 8 nodes for a known 30 minutes, then compare reported device-hours with the expected 240 and confirm the state breakdown adds up to the total.",
    dep: ["node-agent", "job-queue"]
  },
  "chargeback-attribution": {
    s: "Assigns metered cost to teams, projects and models using a price per device-hour, so budgets can be enforced and spending discussed on facts.",
    d: "A rate table prices each device type and reserved versus preemptible capacity. The attribution job sums usage by owner tag from the job spec, with rules for shared resources, failures caused by the platform, and queue time. Reports roll up by team, project and run, and feed budget checks. The challenge is political as much as technical: whether the platform or the researcher bears the cost of a hardware failure changes behavior, and untagged jobs end up in an unowned bucket nobody pays attention to.",
    k: ["Charging for failed hardware versus absorbing it centrally: absorbing it is fairer to users, but hides reliability costs from the platform team.", "Fixed prices versus demand-based prices: fixed are predictable for planning, while demand-based pricing nudges work to quiet periods but frustrates budgeting."],
    p: ["Jobs submitted without an owner tag accumulate cost no team is responsible for.", "Charging by allocation while a pipeline stall idles devices encourages users to hide the stall instead of fixing it."],
    v: "Run jobs for two tagged teams and one untagged, then confirm the monthly report attributes each team's device-hours to its budget and lists the untagged usage separately for follow-up.",
    dep: ["usage-metering", "job-spec-schema"]
  },
  "quotas-and-budgets": {
    s: "Limits on how many devices or device-hours a team may hold or spend, enforced at submission and by the scheduler.",
    d: "Quotas cap concurrent devices by team and class; budgets cap cumulative spending over a period. The admission controller checks them when a job is submitted and the scheduler checks them again when it allocates. Some quotas are guaranteed and others are borrowable when capacity is idle, to be reclaimed through preemption. Spending alerts warn owners as they near a limit. The difficulty is policy: hard stops protect the budget but can cancel a nearly finished run, and soft limits protect research but allow overspending.",
    k: ["Hard enforcement versus soft warnings: hard stops give certainty to finance, while soft limits avoid killing a run weeks in at the price of occasional overruns.", "Guaranteed quota with borrowing versus strict partitions: borrowing raises utilization, but needs preemption to give capacity back."],
    p: ["A budget that cancels a job at 100 percent wastes the entire run if it is hours from finishing.", "Quota changes that do not reach the scheduler cache let teams exceed limits for hours."],
    v: "Set a team quota to 64 devices, submit jobs totaling 96, and confirm 64 devices run, the remainder queue with an explicit quota reason, and no allocation exceeds the limit.",
    dep: ["usage-metering", "admission-control"]
  },
  "idle-and-waste-reporting": {
    s: "Reports device time that was allocated but unproductive: idle devices, stalled input, restart recovery, failed attempts and time spent waiting for the slowest rank.",
    d: "The report breaks down each job's device-hours by state using utilization telemetry, step timing and run history. It highlights allocations with near-zero utilization, jobs spending a large share of time in checkpoint writes, and attempts that ended in a failure before the first checkpoint. Results go to owners and to platform engineers who prioritize fixes. The hard part is naming the waste correctly: a low utilization number can come from the job, the data pipeline, a slow node or the network, and the report must point to one.",
    k: ["Automatic reclaim of idle jobs versus reports only: reclaim recovers capacity at once, but kills debugging sessions and long waits that were intentional.", "Reporting to owners versus to a central team: owners can fix their jobs, but a central view finds platform-wide waste owners cannot see."],
    p: ["Treating all low-utilization time as user error hides a platform problem, such as slow storage, affecting everyone.", "Reports delivered monthly arrive after the wasteful run has finished."],
    v: "Leave an allocated test job idle for an hour and confirm the report lists it with the idle fraction and owner, and that an active job with the same allocation does not appear.",
    dep: ["usage-metering", "throughput-and-utilization"]
  },
  "cost-estimates": {
    s: "Predicts what a run or sweep will cost before it starts, from model size, tokens, expected throughput and price, so decisions are made with numbers.",
    d: "An estimator takes the resolved config and uses a throughput model, fitted from past runs on the same hardware, to predict step time. It multiplies by steps, devices and price, and adds an allowance for restarts and checkpointing overhead. Sweeps are priced as the sum of trials, reduced by the expected early-stopping rate. The estimate appears at submission and is compared with actuals afterwards. It is hard because throughput depends on parallelism and network placement, so a good estimate needs the real plan and calibrated models.",
    k: ["Analytical models versus fitting from history: analytical models work for new hardware, while fitted ones capture real inefficiencies but need data on similar jobs.", "Showing a single number versus a range: a range is honest about failures and queue time, but people anchor on the low end."],
    p: ["Estimates that ignore restarts and recovery understate the cost of long runs on large clusters by tens of percent.", "A model fitted on old hardware overpredicts speed on a new generation and misleads planning."],
    v: "Compare estimates for ten finished runs against their metered device-hours and confirm the error is within the documented band, with the largest misses traced to a cause.",
    dep: ["usage-metering", "device-mesh-planner"]
  }
});
