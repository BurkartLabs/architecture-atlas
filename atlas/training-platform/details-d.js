// Details for the training platform plate, part 4: data pipeline, storage, node layer, cross-cutting concerns.
ATLAS.details("training-platform", {
  "dataset-catalog": {
    s: "A registry of datasets with versions, shard lists, sizes, schemas, provenance and licenses, so a run names its data by identifier and gets exactly the same bytes.",
    d: "Each dataset version is an immutable manifest listing its shards, checksums, record counts and the preprocessing that produced it. Runs reference a version, and the platform records it in the run's identity. The catalog also holds quality statistics, source and license terms, and the lineage from raw sources, filters and tokenizer version. The hard part is immutability at scale: editing a dataset in place is tempting and breaks every earlier result, while keeping every version costs large storage unless versions share unchanged shards.",
    k: ["Immutable versions sharing shards versus mutable datasets: immutable versions make results traceable and cheap to share, but need versioning discipline and garbage collection.", "Central catalog versus per-team manifests: central gives discovery and policy enforcement, while per-team is faster to change and lacks cross-team visibility."],
    p: ["A shard replaced in place changes a dataset's content under the same version, invalidating comparisons.", "A catalog entry without license or provenance data blocks release of a model trained on it."],
    v: "Pick a past run, read its dataset version, and verify every shard checksum in the manifest still matches storage, and the record count equals the catalog's stated total.",
    dep: ["object-storage-tier"]
  },
  "tokenization-and-preprocessing": {
    s: "Converts raw documents into the integer sequences the model consumes, applying cleaning, filtering and a fixed tokenizer, usually offline and once.",
    d: "A batch pipeline reads raw sources, cleans and filters them, deduplicates, tokenizes with a fixed vocabulary and writes tokens in binary shards with an index for random access. Doing it offline keeps training devices from spending host time on it and makes data order and content inspectable. Tokenizer version becomes part of the model: changing it invalidates every checkpoint. The difficulty is scale and reproducibility: trillions of tokens take thousands of CPU hours and any filtering bug is only visible after training.",
    k: ["Offline preprocessing versus on-the-fly: offline reuses work across runs and removes host load, while on-the-fly gives flexibility for experiments at the price of CPU capacity.", "Binary token shards versus raw text with online tokenization: binary reads fast and predictably, but fixes the tokenizer and filtering at creation."],
    p: ["A bug in the filter drops a language or domain, and the loss never reveals it until evaluation.", "Different tokenizer versions between training and serving produce silently wrong inputs."],
    v: "Sample 1,000 records from the output shards, decode them with the recorded tokenizer version and compare to the source text, confirming round-trip equality and the expected filter counts.",
    dep: ["dataset-catalog"]
  },
  "shuffling-and-sampling": {
    s: "Decides the order in which examples are seen, mixing across the whole dataset and across epochs, deterministically from a seed so that resumption and comparisons are exact.",
    d: "True random access over trillions of tokens is expensive, so pipelines shuffle shards, then examples within a buffer, or compute a permutation by index. The order is a function of seed, epoch and global step, which lets a restart or a resized job recompute where it was. Each data-parallel rank takes a disjoint slice. The hard part is quality versus cost: a small shuffle buffer leaves correlated neighbors in a batch, while a full permutation forces random reads that storage cannot serve.",
    k: ["Index-based permutation versus buffer shuffling: permutation is exact and resumable but needs random reads, while buffers stream sequentially but leave local correlation.", "Order fixed by seed versus by arrival: seeded order enables exact resumption and fair comparison, while arrival order adapts to slow workers but is irreproducible."],
    p: ["Shuffling shards only leaves each document's neighbors identical in every epoch.", "Changing the worker count reassigns slices so some examples are seen twice and others never."],
    v: "Generate the order for epoch 3 from the seed on two different worker counts and confirm the union of examples seen is identical, with no duplicates across ranks within the epoch.",
    dep: ["sharded-readers", "dataset-catalog"]
  },
  "sharded-readers": {
    s: "Workers that read each rank's slice of the dataset in parallel from storage, decode it and hand it to the training loop, with a cursor that can be saved and restored.",
    d: "Each rank owns a deterministic subset of shards and runs several reader workers that fetch, decompress and parse records ahead of need. They report progress as a cursor, such as shard index and offset, included in the checkpoint. Readers must cope with storage hiccups, slow shards and skew in sequence length. The difficulty is behavior at scale: thousands of ranks opening files at once hammers metadata servers, and one slow reader stalls its rank and then every other one in the synchronized step.",
    k: ["Many small shards versus few large: small shards balance and reshuffle easily but multiply metadata operations; large shards stream well but balance poorly.", "Reader processes per rank versus threads: processes avoid interpreter contention and isolate failures, at the cost of memory and inter-process copies."],
    p: ["All ranks opening the same hot shard at the start of an epoch overloads the storage nodes holding it.", "A reader worker that dies silently leaves its rank waiting until a timeout."],
    v: "Run the pipeline on its own at the target rate, and confirm each rank sustains the needed tokens per second with no stalls, and that restoring a saved cursor resumes at the exact next record.",
    dep: ["parallel-file-system", "local-nvme-cache"]
  },
  "prefetch-and-buffering": {
    s: "Keeps a queue of ready batches in host memory, and copies the next one to the device during the current step, so accelerators never wait for input.",
    d: "Reader workers fill a bounded queue with decoded, collated batches. A transfer stage copies the next batch from pinned host memory to device memory asynchronously while the current step computes. Queue depth absorbs jitter from storage. The sizes balance memory against stall risk. Input stalls are among the most common causes of low utilization, and the hard part is noticing them: the device simply idles, and the symptom is a throughput figure that is a bit too low without any error.",
    k: ["Deeper buffers versus shallower: deeper hide longer storage hiccups, but cost host memory and delay the effect of data-order changes.", "Asynchronous device copy versus synchronous: asynchronous overlaps with compute and needs pinned memory, while synchronous is simple and loses a few percent of step time."],
    p: ["An empty queue shows up only as lower utilization, and gets misdiagnosed as a slow network.", "Buffers sized per rank on a node with many ranks exhaust host memory and trigger swapping."],
    v: "Record queue depth over a run and confirm it stays above a minimum with no step waiting on data, and that throwing away storage for several seconds does not stall the device.",
    dep: ["sharded-readers", "host-memory-and-pinning"]
  },
  "data-mixture-weights": {
    s: "The proportions in which sources such as web text, code and books are sampled, set per phase of training and recorded so the exact mix can be reproduced.",
    d: "Training data comes from several sources of different quality and size. The mixture assigns each a sampling weight, possibly changing over the run: for example, higher-quality data late in training. The sampler draws from each source in proportion and tracks per-source counts, so the actual mix can be verified. Weights are found by small-scale experiments and then trusted at large scale. The hard part is that small proxies do not always predict the effect, and that changing a weight mid-run alters the learning curve in ways dashboards cannot attribute.",
    k: ["Static mixture versus scheduled phases: static is simple to reason about, while phases can improve final quality by ending on better data, at the cost of more tuning.", "Sampling by weight versus by size: weights give deliberate control over each source, while size-proportional sampling leaves large noisy sources dominant."],
    p: ["Upsampling a small source many times repeats its examples so often that the model memorizes them.", "A mixture change merged into the config mid-run goes unrecorded, and later comparisons are invalid."],
    v: "Count tokens drawn from each source over 10,000 steps and confirm each source's share is within a small tolerance of its configured weight at every phase.",
    dep: ["dataset-catalog", "shuffling-and-sampling"]
  },
  "sequence-packing": {
    s: "Concatenates short documents into fixed-length training sequences with attention masks, so no compute is spent on padding.",
    d: "Documents vary from a few tokens to many thousands. Padding each to a maximum length wastes arithmetic; packing joins several into one sequence, separated by end markers and masked so tokens do not attend across documents. Bin-packing heuristics reduce leftover gaps. Variable length also matters for balance: if ranks receive different amounts of real work, the fast ones wait for the slow at each synchronization. Packing is easy to get subtly wrong, since a missing mask lets information leak between unrelated documents.",
    k: ["Packing with cross-document masking versus plain concatenation: masking prevents contamination between documents, while concatenation is simpler and cheaper but trains on false context.", "Optimal bin-packing versus greedy: optimal wastes the least padding but costs preprocessing time; greedy is fast and nearly as good."],
    p: ["Missing attention masks let the model attend to an unrelated document in the same sequence.", "Truncating long documents at the sequence boundary cuts them mid-sentence in every epoch."],
    v: "Inspect a packed batch: confirm the padding fraction is below target, document boundaries have end markers and the attention mask blocks all cross-document positions.",
    dep: ["tokenization-and-preprocessing"]
  },
  "parallel-file-system": {
    s: "A shared file system striping data across many storage servers for high aggregate bandwidth, holding datasets, checkpoints and logs visible to every node.",
    d: "Files are split into stripes distributed over storage targets, with separate metadata servers tracking names and layout. Aggregate bandwidth scales with the number of targets, but individual operations such as opening or listing many files go through metadata servers and can become the bottleneck. Clients cache aggressively and keep consistency with locks. Challenges are the synchronized bursts of training: thousands of nodes opening shards at the start of an epoch or writing checkpoints at the same moment.",
    k: ["Wide striping versus narrow: wide striping gives large files high bandwidth, but each file touches more servers, so failures and contention reach more of them.", "Shared by all workloads versus a dedicated training namespace: shared maximizes use, while dedicated protects training from noisy neighbors."],
    p: ["A metadata storm at job start makes every other tenant's file operations slow.", "A single overloaded storage target makes one shard slow, and the slowest rank sets the step time."],
    v: "Have all nodes of a test job read distinct shards at once and confirm aggregate throughput reaches the target, then repeat during a checkpoint write and confirm neither degrades beyond the budget.",
    dep: ["storage-throughput-monitoring"]
  },
  "object-storage-tier": {
    s: "Capacity storage with an HTTP interface for large, durable, cheaper data: raw corpora, dataset versions, and long-term checkpoints.",
    d: "Objects are stored with replication or erasure coding across a region, accessed through a flat namespace with high aggregate throughput but high per-request latency. Training reads large ranges in parallel, and checkpoint writers upload shards as multipart uploads. It is durable and cheap, but each request has a cost and rate limits per prefix. It is hard to use directly as a training source, so jobs stage hot data to faster tiers and treat object storage as the system of record.",
    k: ["Training directly from objects versus staging first: direct is simple and always fresh, while staging hides latency but needs space and a copy step.", "Erasure-coded versus replicated: erasure coding is cheaper per byte, while replication gives faster reads and simpler repair."],
    p: ["Hot prefixes hit request-rate limits when thousands of ranks open the same shards.", "Eventual visibility of a listing causes a loader to miss a recently written shard."],
    v: "Read a 1 TB dataset from many clients concurrently, confirm total throughput scales with client count up to the target and no request fails due to throttling.",
    dep: []
  },
  "local-nvme-cache": {
    s: "Fast flash drives inside each node used as a cache for dataset shards and as a staging area for checkpoints, absorbing bursts that shared storage cannot.",
    d: "Each node has local drives with high bandwidth and low latency. A cache layer fetches shards from shared storage on first use, evicts by policy, and serves later epochs locally. Checkpoint writers dump to local flash first, since it takes seconds, then upload in the background. Local data dies with the node, so it is a cache or staging area, never the only copy of something important. Cache sizing and warmup after a restart onto new nodes are the main design problems.",
    k: ["Caching shards per node versus a shared cache tier: per-node is fastest and needs no network, but each node duplicates data and restarts start cold.", "Checkpoint to local flash first versus direct to shared storage: local flash minimizes stall, but a node failing before upload loses that shard."],
    p: ["A replacement node starts with an empty cache and all its reads hit shared storage at once.", "A checkpoint staged only on a node that then fails exists nowhere else."],
    v: "Run a second epoch and confirm most reads are served locally with shared-storage traffic dropped to the expected fraction, then kill a node mid-upload and confirm the checkpoint is not marked complete.",
    dep: ["node-agent"]
  },
  "dataset-staging": {
    s: "Copies the datasets a job needs from capacity storage into faster tiers ahead of the job's start, so training does not begin with an input stall.",
    d: "When a job is queued, the platform reads its dataset manifest and starts staging shards to the parallel file system or local flash in the placement it will get. Staging is scheduled like other work: it competes for storage bandwidth, so it is rate limited and prioritized by expected start time. Status is visible to the scheduler, which can hold the job until data is local. The difficulty is predicting where and when a job starts, since placement is decided late and stale staging wastes bandwidth.",
    k: ["Staging before scheduling versus after placement: staging early wastes work when placement changes, while staging after placement delays the start by the copy time.", "Whole dataset versus working set only: whole datasets are simple, while working-set staging saves space but needs access prediction."],
    p: ["Many jobs staging the same large dataset at once saturate the object tier and slow every job's start.", "Stale staged copies are not removed and fill the fast tier, blocking new datasets."],
    v: "Queue a job with a 5 TB dataset, and confirm staging completes before the job's predicted start, the job begins with no read stalls, and the staged copy is released afterwards.",
    dep: ["object-storage-tier", "dataset-catalog", "parallel-file-system"]
  },
  "storage-throughput-monitoring": {
    s: "Measures read and write bandwidth, latency and metadata operation rates for each storage tier and attributes them to jobs, so input stalls and checkpoint slowdowns can be diagnosed.",
    d: "Server-side counters report throughput, queue depths and errors per target. Client-side agents report per-job read latency and bytes. Joined together, they show which job is consuming bandwidth and which tier is slow. Checkpoint events are overlaid so that a write burst can be seen against other tenants' load. The hard part is that averages mislead: storage problems are usually a single slow target or a tail latency, which only per-target and percentile views reveal.",
    k: ["Server-side metrics versus client-side: server-side show total load and health, while client-side show what training actually experienced, so both are needed.", "Per-job attribution versus aggregate: attribution finds the noisy job, at the cost of tracing identity through the client stack."],
    p: ["Aggregate bandwidth looks healthy while one slow target holds up every job that touches it.", "No view of metadata operations hides the real cause of slow job starts."],
    v: "Start a heavy read job and a checkpoint write together and confirm the dashboard attributes bandwidth to each job correctly and shows the p99 read latency rise for the other jobs.",
    dep: ["parallel-file-system", "metric-logging"]
  },
  "accelerator-drivers": {
    s: "Kernel and firmware components that let the operating system and runtimes control accelerators, manage their memory, report errors and expose their links.",
    d: "The driver initializes devices, manages memory mapping and scheduling of work, exposes health counters and error events, and cooperates with the network card driver for direct transfers. Firmware on the devices and cards must match the driver and runtime versions. Upgrades are done in rolling waves and each version combination needs testing together. It is the layer where many obscure failures originate: devices falling off the bus, memory errors, or resets that leave devices in a state only a reboot clears.",
    k: ["Rolling driver upgrades versus all at once: rolling limits the blast radius of a bad version, but runs mixed versions that jobs must tolerate.", "Persistent driver mode versus load on demand: persistence cuts job start time and avoids repeated initialization, but holds device state across jobs."],
    p: ["A device left in a bad state after a job crash causes the next job placed there to fail.", "A firmware mismatch on part of a cluster produces a failure only when specific nodes are drawn together."],
    v: "On a test node, reset a device after a forced job crash and confirm the driver reports a healthy state, then run the diagnostic suite and confirm the device passes before it is returned to the pool.",
    dep: []
  },
  "device-runtime": {
    s: "The user-space library that launches kernels, allocates device memory, manages streams and events, and gives frameworks a uniform interface to the accelerator.",
    d: "Frameworks call the runtime to allocate memory, copy data, and enqueue kernels onto streams that execute asynchronously and in order. Events synchronize streams and measure time. A caching allocator reuses device memory to avoid slow allocation calls, which can lead to fragmentation and memory that appears used but is free. Runtime version must match driver and framework. It is hard because asynchrony defers errors: a bad kernel launch fails many calls later, far from its cause.",
    k: ["Caching allocator versus direct allocation: caching removes allocation latency from every step, but fragmentation can cause out-of-memory with plenty of nominal free space.", "Many streams versus few: many streams allow concurrency and overlap, while few are simpler to reason about and less prone to ordering errors."],
    p: ["An asynchronous error is reported at a later unrelated call, which sends debugging to the wrong place.", "Fragmentation in the caching allocator causes out-of-memory hours into a run when a larger tensor appears."],
    v: "Train for several hours with varying sequence lengths and confirm reserved memory stays below the device limit with no out-of-memory, and that a deliberately bad launch under synchronous mode reports at the faulty call.",
    dep: ["accelerator-drivers"]
  },
  "container-runtime": {
    s: "Starts job processes in isolated containers with the right devices, network interfaces, mounts and resource limits, from the image the spec names.",
    d: "The node agent asks the runtime to pull the image, create a container with accelerators and network cards exposed, mount datasets and checkpoint paths, and apply limits for memory, processes and shared memory size. Containers share the host kernel, so isolation is weaker than a virtual machine but overhead is negligible, which matters for performance. Details decide success: shared memory sizing for data loaders, pinned memory limits, network namespaces that preserve direct hardware access, and cleanup of leftover processes when a job ends.",
    k: ["Containers versus virtual machines: containers give native performance and fast start, while virtual machines isolate better but add overhead to device and network access.", "Host networking versus virtualized networking: host networking keeps full performance for collectives, but weakens network isolation between tenants."],
    p: ["Too-small shared memory limits make data loader workers crash only on larger batch sizes.", "Orphan processes from a previous job keep holding device memory and fail the next job."],
    v: "Start a job in a container and confirm devices, network cards and mounts are visible as specified, collective bandwidth matches bare host results, and after the job ends no process holds device memory.",
    dep: ["accelerator-drivers"]
  },
  "node-agent": {
    s: "The daemon on every server that executes the control plane's instructions, reports health and utilization, and enforces cordons, drains and cleanup.",
    d: "The agent registers the node, advertises its devices and topology, receives launch and stop requests, supervises job processes, and sends heartbeats and telemetry. It runs health checks before and between jobs and applies cordons. It must keep working when the job is wedged and when the control plane is unreachable, taking safe default actions. Because it runs on every node, a bug in the agent has cluster-wide effect, so it is rolled out carefully and kept small and conservative.",
    k: ["Agent pulls work versus control plane pushes: pulling tolerates restarts and firewalls and scales well, while pushing gives faster reaction but needs connections to every node.", "Rich local logic versus a thin executor: local logic acts when the control plane is slow, but hides policy in many places."],
    p: ["An agent upgrade that crashes on startup removes a whole rack from the cluster at once.", "Heartbeats continue from a healthy agent while the device underneath is already failed."],
    v: "Block the agent's connection to the control plane for a minute and confirm the node's job continues, the agent buffers its reports, and the node resumes reporting without a duplicate launch afterwards.",
    dep: ["container-runtime", "accelerator-drivers"]
  },
  "power-and-thermal-management": {
    s: "Power caps, clocks and cooling controls that keep thousands of devices inside electrical and thermal limits while sustaining as much speed as possible.",
    d: "Training drives accelerators near their limits in synchronized waves, producing large, rapid swings in power that stress the datacenter's supply. Devices throttle clocks when hot or capped, and a throttled device becomes a straggler. Operators set power limits per node or rack, monitor temperatures and coolant flow, and in some sites slow jobs deliberately to follow grid constraints. The hard part is that power is a shared physical resource: one job's synchronized spike affects the whole facility, and throttling hides behind unchanged utilization numbers.",
    k: ["Power caps per device versus per rack: per-device caps are predictable but waste headroom, while per-rack budgets allow sharing but risk coordinated throttling.", "Running at peak clocks versus slightly lower clocks: peak clocks maximize speed, while lower clocks save energy and cut throttling variance among devices."],
    p: ["A synchronized power ramp at step start trips a facility limit and forces a mass throttle.", "One hot slot in a rack throttles repeatedly and makes its whole job slower than its peers."],
    v: "Run a stress job on a rack and confirm temperatures stay below limits at the set power cap, that no device logs throttling, and that rack power stays within its budget through step boundaries.",
    dep: ["accelerator-drivers", "hardware-telemetry"]
  },
  "host-memory-and-pinning": {
    s: "Management of server RAM for training: pinned buffers for fast device transfers, memory for data loaders, and staging space for checkpoints, within strict limits.",
    d: "Fast copies between host and device need page-locked (pinned) memory, which the operating system cannot swap, and which direct network transfers also require. Data loader workers, prefetch queues and asynchronous checkpoint snapshots all consume host RAM, with several processes per node. Non-uniform memory layouts mean placing processes and buffers on the memory closest to their device matters. Limits are tight: exceeding them kills processes, and pinned memory counts against container limits in ways that surprise people.",
    k: ["Large pinned pools allocated up front versus on demand: up front gives predictable transfer speed but takes memory from everything else; on demand is flexible but slower and can fail late.", "Binding processes to the nearest memory domain versus letting the system place them: binding gives steady speed, while unbound placement is simpler and costs some bandwidth."],
    p: ["An asynchronous checkpoint snapshot adds host memory use that pushes the node over its limit during a save.", "Processes placed on the wrong memory domain run measurably slower on every transfer."],
    v: "Run a job through a checkpoint save while watching host memory per node and confirm peak usage stays below the limit, and that transfer bandwidth with pinned buffers matches the benchmark for the link.",
    dep: ["container-runtime"]
  },
  "determinism-and-reproducibility": {
    s: "Whether a run can be repeated bit for bit, or only statistically, shapes how reductions, data order, random seeds and kernel choices are made across the whole stack.",
    d: "Bitwise reproducibility needs fixed reduction orders, deterministic kernels, seeded and checkpointed random state, and a data order that is a pure function of seed and step. It also usually needs the same device count and layout. Most large runs settle for statistical reproducibility because bitwise determinism costs throughput and cannot survive elastic restarts. The decision has to be made early: it affects algorithm selection in the collective library, checkpoint contents, dataloader design and how debugging disputes are resolved.",
    k: ["Bitwise determinism versus statistical reproducibility: bitwise makes bugs reproducible and regressions provable, while statistical allows faster algorithms and elasticity.", "Determinism for debugging runs only versus always: debug-only keeps production speed, but the bug may only appear in the nondeterministic mode."],
    p: ["Assuming reruns will match leads to wasted days chasing differences that are ordinary floating-point reordering.", "A single nondeterministic kernel makes a regression impossible to bisect."],
    v: "Run the same job twice at fixed layout with determinism enabled and confirm identical checkpoints byte for byte, then repeat with it off to measure the actual divergence and throughput difference.",
    dep: ["reproducibility-capture", "allreduce-algorithms", "resume-state"]
  },
  "failure-as-normal": {
    s: "At scale something is always failing, so every layer assumes loss of nodes, links and processes and treats recovery as a routine path measured in minutes.",
    d: "A single device may fail once in several years, but a cluster of thousands has a failure every few hours, so the failure rate of a job grows linearly with its size. This reshapes design: checkpoints become frequent and cheap, schedulers keep spare nodes, jobs are restartable on different hardware, detection is automatic and diagnosis is built in. The platform is judged by recovery time and by how many human interventions a run needs, not by how rarely failures occur. Treating failure as an exception leaves each incident a manual effort.",
    k: ["Spare capacity held in reserve versus running everything at full allocation: spares shorten recovery to minutes, but leave paid devices idle.", "Automated recovery versus human decision: automation restores progress at 3 a.m., but needs strong classification so it does not retry bad code forever."],
    p: ["Design that assumes a stable cluster makes each failure at scale a multi-hour manual recovery.", "Failure handling tested only on small jobs breaks at the first real node loss in a large run."],
    v: "Kill a random node every hour in a large test job for a day and confirm each recovery completes within the target with no human action, and track the total fraction of time lost.",
    dep: ["restart-controller", "failure-detection", "checkpoint-cadence"]
  },
  "goodput": {
    s: "The share of paid device time that produces lasting training progress, after subtracting queueing, startup, recomputation after failures, checkpoint stalls, stragglers and idle waits.",
    d: "Utilization of the arithmetic units says how well a step runs, but goodput says how much of the wall clock and the allocation became training that was kept. A run can have excellent step efficiency and low goodput if it spends hours restarting. Measuring it requires event data from the scheduler, the restart controller, the checkpointer and the step timer, joined by run. It gives the platform team a single number whose parts, each reducible, tell them where to spend effort.",
    k: ["Optimizing step efficiency versus goodput: step efficiency is easy to measure and tune, while goodput captures recovery, waiting and waste that often dominate large runs.", "One cluster-wide goodput number versus per-run breakdown: the number tracks health over time, while the breakdown shows which change to make."],
    p: ["Celebrating a high utilization figure while a third of the allocation is spent in recovery and queueing.", "Measuring goodput from the training logs alone misses the time the job spent waiting to start."],
    v: "For one large run, sum device-hours by state across queueing, startup, training, lost work and checkpoint stalls and confirm the parts add to the allocation total, with goodput computed from the productive part.",
    dep: ["usage-metering", "throughput-and-utilization", "restart-controller"]
  },
  "scale-effects": {
    s: "Behavior that is invisible at eight devices appears at thousands: rare failures become constant, communication dominates, startup takes minutes, and hyperparameters stop transferring.",
    d: "Many properties change qualitatively with size. Failure rate scales with device count; collective latency grows with group size; bootstrap time and metadata load rise; stragglers become likely in every step; and small-scale hyperparameter tuning stops predicting full-scale behavior. Memory and plan feasibility change, too. Platforms therefore need scale tests, ramp-up procedures that grow runs in stages, and metrics that expose which effect dominates. Designing only from small experiments leaves the first full-scale run to find the problems, at full price.",
    k: ["Ramping up in stages versus launching at full size: staged ramp-ups find scale problems cheaply, while direct full-size launches save calendar time but risk expensive early failures.", "Tuning at small scale then transferring versus tuning at scale: transfer rules are cheap but approximate, while tuning at scale is accurate and prohibitively expensive."],
    p: ["A recipe tuned at 64 devices diverges at 4,096, and the first sign is a loss spike after days.", "Startup procedures taking seconds on a test cluster take tens of minutes at full size and dominate every restart."],
    v: "Run the same job at 8, 64, 512 and 4,096 devices and tabulate step time, startup time, failure count per day and communication share, confirming each stays within the plan's predicted curve.",
    dep: ["communicator-bootstrap", "straggler-detection", "device-mesh-planner"]
  },
  "cost-versus-time": {
    s: "Every design choice trades money against wall-clock time or against risk: more devices finish sooner at lower efficiency, spares speed recovery but idle, and frequent checkpoints cost bandwidth.",
    d: "Scaling out reduces time but raises cost because efficiency falls with more communication and failures. Reserved capacity is cheaper per hour than on-demand but is paid for when idle; preemptible capacity is cheapest but is reclaimed. Checkpoint frequency, spare pools, queue priority and parallelism plans each shift the balance. The platform's job is to expose these trade-offs with numbers so owners choose deliberately, instead of defaulting to the largest allocation available, which is rarely the most economical.",
    k: ["Using more devices to finish sooner versus fewer for longer: more devices cut calendar time, but efficiency losses raise total device-hours.", "Reserved capacity versus preemptible: reserved gives certainty for deadlines, while preemptible is far cheaper for work that tolerates interruptions."],
    p: ["Taking the largest allocation by default raises cost with little improvement in finish time.", "Optimizing cost alone with preemptible capacity starves a run whose deadline then slips."],
    v: "Price one job at three device counts using the estimator and then run all three, confirming the measured cost and duration follow the predicted trade-off curve closely enough to decide between them.",
    dep: ["cost-estimates", "quotas-and-budgets", "idle-and-waste-reporting"]
  },
  "multi-tenancy": {
    s: "Many teams share one cluster, so the platform must separate their data, devices, network traffic and accounting, while keeping fairness and utilization high.",
    d: "Isolation operates at several levels: containers and device assignment on the node, network traffic classes on the fabric, quotas and priority in the scheduler, namespaces and access control in storage and the catalog. Each level has leakage. Shared storage and network links let one job slow another, and data access policy must follow the data. Sharing raises utilization and lowers cost, but every shared resource is a place where performance interference and security boundaries must be explicitly managed.",
    k: ["Shared fabric and storage versus dedicated partitions: sharing raises utilization and flexibility, while partitions give predictable performance and clearer security boundaries.", "Strong isolation versus native performance: stronger boundaries protect tenants, but add overhead on the paths training depends on."],
    p: ["A noisy tenant's checkpoint write slows every other job's input pipeline.", "Access controls on datasets but not on the checkpoints derived from them leak the same data."],
    v: "Run a heavy job in one tenant and measure another tenant's step time and read latency against its isolated baseline, and confirm a user without access cannot read the first tenant's checkpoints.",
    dep: ["container-runtime", "congestion-and-routing", "fair-share-and-priority"]
  }
});
