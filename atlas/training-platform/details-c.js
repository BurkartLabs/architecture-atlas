// Details for the training platform plate, part 3: parallelism, checkpointing, communication, network.
ATLAS.details("training-platform", {
  "device-mesh-planner": {
    s: "Chooses how to arrange devices into a multi-dimensional grid and which parallelism degree goes on each axis, matching the model's memory and communication needs to the cluster's network.",
    d: "Given the model shape, global batch size and devices, the planner picks degrees for data, tensor, pipeline, context and expert parallelism whose product equals the device count. It maps the most communication-heavy axis, usually tensor parallelism, to the fastest links inside a node, and the lightest to the slowest tier. It estimates memory per device and step time with an analytical or measured cost model. Search space is large and costs are only approximate, so planners usually propose a few candidates for a short benchmark.",
    k: ["Automated search versus hand-tuned plans: search handles many shapes consistently, but a cost model that misses an effect picks plans experts would reject.", "Fixed plan per model versus per cluster size: per-size plans use hardware best, but each new scale needs its own tuning and checkpoints must reshard between them."],
    p: ["A plan that fits memory on paper runs out on the real device because the estimate ignored communication buffers and fragmentation.", "Placing tensor-parallel groups across nodes makes every layer wait on the slow network."],
    v: "Benchmark the planner's top three plans for ten steps each on the target cluster and confirm the chosen plan is the fastest, with measured memory below the device limit.",
    dep: ["fabric-topology", "intra-node-interconnect"]
  },
  "data-parallelism": {
    s: "Runs identical copies of the model on different slices of each batch and averages their gradients every step, the simplest way to scale training across devices.",
    d: "Each replica holds the full weights and optimizer state, processes its own micro-batches and contributes gradients to an all-reduce before the optimizer step, so replicas stay identical. Throughput scales almost linearly while the model fits on one device and communication stays hidden behind backward computation. Its limits are memory, since every replica stores everything, and the global batch size, which grows with the replica count and eventually hurts convergence unless the learning rate and schedule are adjusted.",
    k: ["Synchronous updates versus asynchronous: synchronous gives clean convergence behavior and reproducibility, while asynchronous tolerates slow workers but adds stale gradients.", "Larger global batch versus more steps: larger batches use more devices at once, but past a critical size each additional example adds little learning."],
    p: ["Scaling the replica count without adjusting the learning rate gives a run that converges worse than the small one.", "Replicas that drift through nondeterministic ops or a skipped update silently diverge."],
    v: "Train the same model on 8 and 64 replicas with scaled hyperparameters and confirm the loss versus tokens curves align, and that parameters are bit-identical across replicas after each step.",
    dep: ["allreduce-algorithms", "gradient-bucketing"]
  },
  "sharded-data-parallelism": {
    s: "Splits optimizer state, gradients and optionally weights across data-parallel replicas, gathering them only when needed, so far larger models fit without changing the math.",
    d: "Instead of every replica holding everything, each owns a shard of the optimizer state; deeper stages shard gradients and the weights themselves. Before computing a layer, the shards are all-gathered; after, gradients are reduce-scattered and the weights are freed again. Memory per device falls roughly linearly with the group size, at the cost of extra communication that must overlap with compute. It is hard to tune because the gather timing, prefetch depth and wrapping granularity strongly affect memory spikes and speed.",
    k: ["Shard only optimizer state versus shard everything: optimizer-only costs little extra communication, while full sharding saves the most memory but moves weights every step.", "Sharding across the whole cluster versus within groups: whole-cluster sharding saves the most memory, while grouped sharding keeps gathers on faster links."],
    p: ["Gathering too many layers ahead of use produces memory spikes that out-of-memory the job mid-run.", "Checkpoints saved in sharded layouts cannot be loaded at a different device count without resharding."],
    v: "Run a model that does not fit with plain data parallelism, confirm it fits with sharding, and compare final loss against a smaller non-sharded run to verify identical results within tolerance.",
    dep: ["data-parallelism", "collective-library"]
  },
  "tensor-parallelism": {
    s: "Splits individual layers' weight matrices across devices so each computes part of every layer, requiring frequent fast communication within a group.",
    d: "Matrix multiplications are partitioned by columns or rows across a small group, commonly the devices in one node. Each layer needs collective operations, typically an all-reduce or a gather and scatter pair, in both forward and backward, so it only works well on very fast intra-node links. It lowers per-device memory for weights and activations and shortens each layer's latency. It is hard to scale beyond a node, because communication volume per layer is large and sits directly on the critical path.",
    k: ["Tensor parallelism within a node versus across nodes: within a node uses fast links and costs little, while across nodes hits slower fabric and usually wastes the gain.", "Sequence-parallel companion versus replicated activations: splitting activations along the sequence cuts memory, at the cost of more collective calls."],
    p: ["Tensor groups spanning two nodes put layer-level collectives on the network and halve throughput.", "Degrees that do not divide the number of attention heads or the hidden size leave unbalanced shards."],
    v: "Run the same layer with tensor degree 1, 4 and 8 inside a node and confirm outputs match within tolerance and the measured per-layer time follows the expected speedup curve.",
    dep: ["intra-node-interconnect", "collective-library"]
  },
  "pipeline-parallelism": {
    s: "Assigns consecutive groups of layers to different devices and streams micro-batches through them like an assembly line, trading idle time for lower communication volume.",
    d: "Each pipeline stage holds a block of layers and sends activations to the next stage using point-to-point transfers, which suits slower inter-node links. Splitting a batch into many micro-batches keeps stages busy; the schedule, such as one-forward-one-backward or interleaved, determines the idle fraction called the bubble and the activation memory held. Stages must be balanced, or the slowest limits all. It is hard to debug because failures in one stage appear as stalls in others, and layer balance depends on non-uniform layers.",
    k: ["More micro-batches versus fewer: more shrink the bubble, but raise memory for in-flight activations and per-micro-batch overhead.", "Interleaved stages versus contiguous: interleaving reduces the bubble but multiplies point-to-point messages and complexity."],
    p: ["Imbalanced stages, such as one holding the embedding or loss, make one device the permanent bottleneck.", "A stage that stalls leaves all other stages waiting with no error, which looks like a hang."],
    v: "Measure stage busy-time in a test run and confirm it is within a few percent across stages, and that the idle bubble matches the predicted fraction for the chosen micro-batch count.",
    dep: ["device-mesh-planner", "rdma-transport"]
  },
  "expert-and-context-parallelism": {
    s: "Specialized splits for large models: expert parallelism distributes mixture-of-experts layers across devices, and context parallelism divides very long sequences across devices.",
    d: "In mixture-of-experts models, a router sends each token to a few experts, and experts live on different devices, so every such layer performs all-to-all exchanges of tokens. Load imbalance between experts leaves devices idle. Context parallelism splits the sequence dimension so attention over very long inputs fits in memory, passing key and value blocks around a ring. Both add heavy communication and constraints on the plan. They are hard because their communication pattern depends on data, which makes step time uneven.",
    k: ["Dropping overflow tokens versus padding capacity: dropping keeps step time bounded but loses training signal, while padding wastes compute.", "Ring-style context splitting versus gathering the full sequence: ring overlaps transfers with compute at larger sequence lengths, while gathering is simpler but needs more memory."],
    p: ["A router that collapses onto a few experts leaves most devices idle while a few overload.", "All-to-all traffic across slow links dominates step time when experts span too many nodes."],
    v: "Log tokens per expert and per-device all-to-all time over 1,000 steps, and confirm the busiest expert is within the planned capacity factor and no device waits more than the budgeted fraction.",
    dep: ["device-mesh-planner", "collective-library"]
  },
  "mixed-precision": {
    s: "Computes in low-precision number formats for speed and memory while keeping master weights and sensitive operations in higher precision to preserve accuracy.",
    d: "Forward and backward passes run in 16-bit or 8-bit formats, using specialized arithmetic units that are several times faster, while the optimizer keeps higher-precision master weights and accumulates in wider formats. Narrow formats with a small exponent range need loss scaling so small gradients do not underflow; wider-exponent formats avoid that. Per-tensor scaling and selective higher precision for normalization and softmax keep stability. The hard part is that failures are subtle: training can run, yet diverge slowly or converge worse.",
    k: ["Wide-exponent 16-bit versus narrow-exponent with loss scaling: wide-exponent is simpler and more stable, while narrow has more mantissa precision but needs dynamic scaling logic.", "8-bit training versus 16-bit: 8-bit nearly doubles throughput, but requires careful scaling recipes and is riskier at long durations."],
    p: ["Loss scaling that overflows repeatedly skips updates, so the run looks healthy while barely learning.", "A reduction performed in low precision across thousands of devices loses accuracy that small runs never revealed."],
    v: "Train a model in the low-precision recipe and in full precision for 5,000 steps and confirm the loss curves stay within the accepted gap, and that overflow-skip counts remain near zero.",
    dep: ["accelerator-drivers"]
  },
  "activation-recomputation": {
    s: "Discards intermediate activations during the forward pass and recomputes them during backward, trading extra arithmetic for a large drop in memory.",
    d: "Backpropagation needs the forward activations of each layer. Storing all of them dominates memory for deep models and long sequences. With recomputation, only selected checkpoints between blocks are kept; when the backward pass reaches a block it reruns that block's forward to regenerate what it needs. Full recomputation costs roughly a third more compute, while selective schemes recompute only cheap, memory-heavy operations and recover most of the savings. Placement matters, and randomness such as dropout must be replayed with the same seeds.",
    k: ["Full recomputation versus selective: full saves the most memory for the largest models, while selective costs far less compute and is usually the better default.", "Recompute versus offload to host memory: recompute needs no transfers, while offload costs no compute but depends on link bandwidth being free."],
    p: ["Random operations recomputed with different random state produce gradients that do not match the original forward pass.", "Recomputation enabled where memory was already sufficient costs a third of throughput for nothing."],
    v: "Run a layer stack with and without recomputation and confirm identical gradients within tolerance, peak memory reduced by the expected amount, and step time increased by the predicted fraction.",
    dep: ["device-runtime"]
  },
  "checkpoint-format": {
    s: "How model weights, optimizer state and training progress are laid out on storage: sharded files plus metadata that describe what each shard holds.",
    d: "Each rank writes its own shards in parallel to avoid gathering everything on one machine, and a metadata file records every tensor's global shape, dtype and which shard and offset hold which slice. This lets a loader on a different parallelism layout compute what to read. The format also holds optimizer state, learning-rate schedule position, random states and data cursors. Design tension is between fast parallel writes, portability across layouts and consumption by other tools, which usually want a single consolidated weight file.",
    k: ["Sharded files with a global index versus a single consolidated file: sharding writes in parallel and scales, while consolidation is portable but needs a slow gather.", "Self-describing format versus framework-private: self-describing eases loading elsewhere and long-term storage, at the cost of format maintenance."],
    p: ["Metadata written separately from shards can disagree after a partial failure, producing an unloadable checkpoint.", "Omitting optimizer state makes a resumed run behave like a different run for thousands of steps."],
    v: "Save a checkpoint at one layout, list its metadata, and confirm every tensor's slices cover its full global shape exactly once with no gaps or overlaps.",
    dep: ["parallel-file-system"]
  },
  "async-checkpoint-writer": {
    s: "Copies state off the device quickly and writes it to storage in the background, so training resumes in seconds instead of stalling for the whole write.",
    d: "A snapshot first copies tensors from device memory to host memory, which blocks training briefly, then a background thread or process writes from host memory to storage while training continues. A second stage may stage to local flash and upload from there. It must ensure the snapshot is consistent across ranks and that a second snapshot does not start before the first finishes. Hard parts are host memory overhead, interference with training traffic, and making the checkpoint visible only when every shard is complete.",
    k: ["Stage to host memory then write versus write directly: staging frees devices in seconds, but costs host memory equal to the shard and can slow training through memory contention.", "Multi-tier writes through local flash versus direct to shared storage: tiers absorb bursts and smooth load, but a node loss before upload loses its copy."],
    p: ["A new checkpoint begins before the last upload ends and background writes pile up until host memory runs out.", "Marking a checkpoint complete before all ranks finish lets a restart load a partial one."],
    v: "Checkpoint a large job and measure the training stall: it should be the device-to-host copy time only, and the checkpoint should become visible as complete only after the last rank's shard is durable.",
    dep: ["checkpoint-format", "host-memory-and-pinning", "local-nvme-cache"]
  },
  "checkpoint-cadence": {
    s: "The policy for how often to checkpoint, balancing the overhead of each save against the compute lost when a failure rewinds the run to the last one.",
    d: "Expected lost work is about half the interval multiplied by the failure rate, while overhead is write stall time per checkpoint divided by the interval. The optimum shortens as clusters grow and failures become more frequent, and as checkpoint writes get cheaper. Platforms often set cadence from measured failure rates and write time, add a checkpoint before planned maintenance and on preemption signals, and keep a sparser long-term series for evaluation and rollback. The hard part is that failure rates are not stable.",
    k: ["Fixed interval versus failure-rate-adaptive: fixed is predictable, while adaptive reduces total waste but changes behavior over a run and is harder to reason about.", "Frequent cheap checkpoints versus rare full ones: frequent cheap ones cap lost work, but costs storage and bandwidth continuously."],
    p: ["An interval chosen for a 64-node test is reused at 4,096 nodes, where failures come every hour.", "Checkpointing only on step multiples misses the chance to save just before a planned preemption."],
    v: "Compute lost work from three months of real failures at the current interval and compare against alternatives: the chosen interval should minimize total lost time plus checkpoint overhead.",
    dep: ["async-checkpoint-writer", "failure-detection"]
  },
  "resharding-on-load": {
    s: "Loads a checkpoint written under one parallelism layout and device count into a different one, by reading and redistributing the needed slices of each tensor.",
    d: "The loader consults checkpoint metadata, computes for each new rank which slices of which global tensors it owns under the target layout, and reads only those byte ranges from the relevant shard files. Optimizer state is resharded the same way. This enables elastic restarts on fewer nodes, scaling a run up, changing the parallelism plan mid-run, and converting for evaluation. It is hard because partitioning schemes differ in padding and order, and reads scatter across many files, so loading can be slower than saving.",
    k: ["Online resharding at load versus an offline conversion step: online is convenient and needed for elastic recovery, while offline can be verified and cached but delays the restart.", "Reading only needed ranges versus reading whole shards: ranges save bandwidth, but produce many small reads that storage serves poorly."],
    p: ["Reading thousands of small ranges at the same time overloads the metadata servers during every restart.", "Padding added for even sharding is mistaken for data, leaving garbage values in the resharded tensor."],
    v: "Save at 64 devices, load at 48 with a different tensor degree, and confirm the first evaluation loss matches the pre-save value within tolerance and every weight equals the original after gathering.",
    dep: ["checkpoint-format", "sharded-data-parallelism"]
  },
  "checkpoint-integrity": {
    s: "Verification that a checkpoint is complete and uncorrupted before it is trusted, using checksums, completion markers and test loads, with fallback to an earlier good one.",
    d: "Each shard carries a checksum computed before writing and verified after upload; a commit marker is written only after all shards verify, and loaders consider only committed checkpoints. Some platforms also run a periodic restore test on a small replica set, and check that weights contain no NaN or implausible magnitudes. Retention keeps several recent checkpoints, so a bad one can be skipped. The hard part is detecting corruption that happened before the checksum, in memory, which is why value checks complement byte checks.",
    k: ["Checksums on every shard versus completion marker only: checksums catch storage corruption, but cost hashing time; markers catch only partial writes.", "Testing loads regularly versus trusting verification: test loads find format and layout bugs early, at the cost of dedicated devices and time."],
    p: ["A checkpoint of NaN weights is committed and verified byte-perfect, and every restart reproduces the failure.", "Only the latest checkpoint is retained, so one bad write leaves nothing to fall back to."],
    v: "Corrupt one shard of the newest checkpoint and confirm the loader rejects it, falls back to the previous committed one and records the rejection in the run's event log.",
    dep: ["checkpoint-format", "object-storage-tier"]
  },
  "resume-state": {
    s: "Everything beyond the weights needed to continue a run exactly: optimizer state, step counter, schedules, random generator states and the data pipeline position.",
    d: "A resumed run should behave as though it had never stopped. This requires saving optimizer moments, the learning-rate schedule position, gradient scaler state, the random state of each rank, and a cursor into the data order that is consistent for every worker. Data cursors are the hard part: after an elastic restart with a different worker count the pipeline must resume without skipping or repeating examples. Gaps appear in practice when some state lives in places nobody remembered to include.",
    k: ["Exact resumption versus approximate: exact makes debugging and comparison reliable, but requires every state to be saved; approximate is easier but muddles analysis.", "Saving data position with the checkpoint versus recomputing it from the step: saving handles variable batch contents, while recomputing is simpler but breaks if the pipeline changes."],
    p: ["Restoring weights but not the optimizer moments produces a loss spike after every restart.", "A data cursor that restarts from the beginning of an epoch repeats examples and biases the run."],
    v: "Run 2,000 steps straight and another run with a stop and resume at step 1,000, then compare the data batches and loss values from 1,000 to 2,000: they should match exactly or within the documented tolerance.",
    dep: ["checkpoint-format", "shuffling-and-sampling"]
  },
  "collective-library": {
    s: "The library that implements all-reduce, all-gather, reduce-scatter and all-to-all across devices, choosing algorithms and transports for the topology.",
    d: "Frameworks call collectives through a common interface; the library discovers the hardware topology, creates communicators for each parallel group and selects algorithm and protocol by message size and layout: ring or tree algorithms, in-network or in-node paths, small-message low-latency protocols. It runs on dedicated streams so communication overlaps compute. The difficulty is correctness under failure: a collective is only complete when every rank participates, so a missing rank blocks the others, and errors may surface far from the cause.",
    k: ["Vendor-tuned library versus portable implementation: tuned libraries reach near-peak bandwidth on their hardware, while portable ones run anywhere but leave performance behind.", "Asynchronous collectives versus blocking: asynchronous allow overlap with compute, but make ordering bugs and hangs harder to diagnose."],
    p: ["Ranks issuing collectives in different orders deadlock without any error message.", "Library tuning tables built for one topology choose poor algorithms on a different one."],
    v: "Run an all-reduce benchmark across message sizes on the real cluster and confirm achieved bus bandwidth reaches the expected fraction of link speed at large sizes, and that results match a reference reduction.",
    dep: ["rdma-transport", "intra-node-interconnect", "communicator-bootstrap"]
  },
  "allreduce-algorithms": {
    s: "The strategies that sum a tensor across many devices: ring, tree, recursive halving and hierarchical combinations, chosen by message size, device count and topology.",
    d: "Ring all-reduce passes chunks around a loop, using every link and approaching optimal bandwidth for large messages but with latency growing with the device count. Tree and halving-doubling variants cut latency for small messages. Hierarchical schemes reduce within a node first, across nodes next, then broadcast, matching fast and slow links. In-network aggregation can reduce data inside switches. The right choice changes with scale, so libraries switch automatically, and the hard part is that floating-point sums differ by algorithm.",
    k: ["Ring versus tree: ring maximizes bandwidth for large gradients, while tree has fewer steps and wins on latency-bound small messages.", "Hierarchical versus flat: hierarchical matches the topology and reduces traffic on slow links, but adds stages and complexity."],
    p: ["Switching algorithm at a message-size threshold changes summation order and breaks bitwise reproducibility.", "A ring across thousands of devices has one slow link set the pace for all of them."],
    v: "Sweep message sizes and device counts, record bandwidth for each algorithm, and confirm the library's automatic choice is within a few percent of the best fixed algorithm at every point.",
    dep: ["collective-library", "fabric-topology"]
  },
  "communicator-bootstrap": {
    s: "The startup handshake in which processes find each other, exchange addresses and build the communication groups the collective library needs.",
    d: "Processes meet at a coordinator, usually a key-value service reached by an address from the scheduler. Each publishes its network endpoints and device identity, reads everyone else's, and builds communicators for each parallel dimension. The library then probes topology and sets up connections, which for a large job opens a huge number of links. The cost grows with scale: bootstrapping thousands of ranks can take minutes, and each restart repeats it, so it directly counts against recovery time.",
    k: ["Central coordinator versus peer-to-peer discovery: central is simple and debuggable, but becomes a bottleneck and single failure point at large scale.", "Lazy connection setup versus eager: lazy shortens startup and saves memory, while eager avoids latency spikes on the first use of a link."],
    p: ["A coordinator that restarts mid-handshake leaves some ranks waiting for peers that already moved on.", "A rank with a stale address from the previous attempt connects to the wrong peer."],
    v: "Measure bootstrap time at 64, 512 and 4,096 ranks and confirm it scales within the budget, and that a killed rank during bootstrap fails the job with a message naming it.",
    dep: ["launch-entrypoint", "rdma-transport"]
  },
  "compute-communication-overlap": {
    s: "Scheduling communication to run at the same time as computation, so transfer time is hidden behind math rather than added to the step.",
    d: "During backward, gradients become ready layer by layer, so their reduction can start while earlier layers still compute. Sharded schemes prefetch the next layer's weights while the current one runs. Overlap needs separate streams, careful ordering, and enough spare memory bandwidth and network capacity. Its effectiveness is bounded by dependencies: the last layer's communication has nothing left to hide behind. The challenge is that overlapped work competes for the same memory and compute units, so gains are smaller than the arithmetic suggests.",
    k: ["Aggressive overlap versus conservative: aggressive hides more time, but increases peak memory and can slow compute through contention.", "Explicit scheduling by the framework versus relying on the runtime: explicit gives predictable overlap, while runtime heuristics adapt but are hard to debug."],
    p: ["A synchronization call placed in the wrong spot serializes everything and silently removes the overlap.", "Communication kernels that compete with compute for streaming units slow matrix math more than they save."],
    v: "Profile a training step and confirm collective operations run concurrently with compute kernels on the timeline, with exposed (non-overlapped) communication below the target share of step time.",
    dep: ["gradient-bucketing", "collective-library"]
  },
  "gradient-bucketing": {
    s: "Groups many small gradient tensors into larger buffers before reduction, so collectives run at efficient sizes and can start as soon as each bucket fills.",
    d: "A model has thousands of tensors. Reducing them one by one wastes time on latency; reducing all at once forces communication to wait until backward ends. Buckets, filled in the order gradients arrive in the backward pass, balance the two: each bucket is launched when full. Size is a tuning parameter, typically tens of megabytes, which interacts with the topology and overlap. The hard parts are consistent bucket assignment across ranks, since all must agree on the order, and unused parameters that never produce a gradient.",
    k: ["Large buckets versus small: large reach full bandwidth but delay the first launch, while small start early at lower efficiency.", "Buckets in reverse-layer order versus static order: reverse order matches when gradients appear and improves overlap, but breaks if the graph changes."],
    p: ["Ranks building buckets in different orders issue mismatched collectives and hang.", "Parameters that receive no gradient on some steps stall the bucket that waits for them."],
    v: "Sweep bucket size on the real cluster and confirm step time has a clear minimum, and that all ranks log identical bucket assignments at startup.",
    dep: ["collective-library", "data-parallelism"]
  },
  "collective-timeouts": {
    s: "Deadlines on collective operations that convert a silent wait on a missing peer into an error with a diagnosable message.",
    d: "Every collective waits for all ranks. Without a deadline, a dead or stuck peer blocks the rest forever. The library or a watchdog thread aborts any operation that exceeds a timeout, tears down the communicators and raises an error carrying the operation, sequence number and ranks believed missing. The value is a trade: long timeouts tolerate legitimate pauses such as a checkpoint or an evaluation on one rank; short ones detect failures sooner. Different timeouts for startup, steady state and checkpoint phases are common.",
    k: ["Long timeouts versus short: long avoids false aborts during slow phases, but each real failure then wastes that much device time across the whole job.", "Aborting only the communicator versus the whole job: communicator abort enables in-process recovery, but is harder to make safe than a clean restart."],
    p: ["A timeout shorter than a rank's evaluation pause kills the job whenever evaluation runs.", "Timeout errors raised on every rank bury the one rank that was actually missing."],
    v: "Stall one rank in a test and confirm every other rank raises a timeout within the configured deadline, naming the same missing rank, and that the platform restarts the job from the last checkpoint.",
    dep: ["collective-library"]
  },
  "fabric-topology": {
    s: "The physical arrangement of switches and links connecting nodes, usually a multi-tier tree with rails per device, which sets the bandwidth between any two accelerators.",
    d: "Common designs use leaf and spine switches in a fat-tree or similar scheme, with each accelerator on its own network rail so traffic from the same device index stays on the same plane. Bandwidth tapers at upper tiers when oversubscribed. The scheduler and the parallelism plan need this map to keep heavy traffic low in the tree. Fabric choices are made years ahead and cost hundreds of millions; the difficulty is that workload patterns change faster than cabling does.",
    k: ["Full bisection bandwidth versus oversubscription: full bisection removes placement sensitivity, but costs far more switches and cables than a tapered design.", "Rail-optimized layout versus a flat shared fabric: rails keep same-index traffic on one plane for speed, but a rail failure removes a device's network entirely."],
    p: ["A mis-cabled link between tiers cuts bandwidth for a block but passes connectivity tests.", "A topology file out of date after a repair sends the scheduler's placement decisions to the wrong switches."],
    v: "Run a pairwise bandwidth test across every pair of blocks and confirm results match the documented topology, with no pair far below its tier's expected value.",
    dep: ["rdma-transport"]
  },
  "rdma-transport": {
    s: "Remote direct memory access over the fabric, letting one device or host write another's memory without involving the remote CPU, giving low latency and high throughput.",
    d: "The network cards move data directly between registered memory regions, often straight from accelerator memory, bypassing the kernel and host copies. Connections are queue pairs set up during bootstrap; reliable transports retransmit lost packets in hardware. Some designs expect a lossless fabric, using flow control, while others tolerate loss. It is fast but fragile: memory must be registered and pinned, the number of connections grows with ranks, and errors appear as timeouts rather than readable messages.",
    k: ["Lossless fabric with flow control versus loss-tolerant transport: lossless gives full speed under normal load, but congestion can spread and block unrelated flows.", "Direct device-memory transfers versus staging through host memory: direct halves latency and copies, but needs matching drivers, firmware and topology."],
    p: ["A flapping cable produces retries and long tail latency without any clear error reaching the training job.", "Exhausting registered-memory limits makes connections fail only at the largest scales."],
    v: "Run a point-to-point benchmark between two nodes and confirm throughput reaches the expected fraction of line rate from device memory, then repeat after a link reset to confirm it recovers.",
    dep: ["accelerator-drivers", "fabric-topology"]
  },
  "congestion-and-routing": {
    s: "How the fabric shares links among many simultaneous flows: congestion control, load balancing across paths and traffic isolation, which decide the tail latency of collectives.",
    d: "Collective traffic is synchronized and bursty, so many flows hit the same links at once. Static hashing can place several large flows on one path while others sit idle; adaptive routing spreads packets across paths, at the cost of reordering that the transport must handle. Congestion control reduces senders' rates when queues grow. Job isolation uses separate traffic classes or virtual lanes. It is hard because the slowest flow determines the collective's finish time, so tail behavior matters more than average bandwidth.",
    k: ["Adaptive per-packet routing versus static flow hashing: adaptive balances load but needs reorder-tolerant endpoints; static is simple but collisions create hot links.", "Congestion control tuned for throughput versus for tail latency: throughput tuning raises averages, while tail tuning keeps collectives predictable."],
    p: ["Two jobs sharing an uplink slow each other in ways neither job's metrics explain.", "Hash collisions place several heavy flows on one link and make one step in ten much slower."],
    v: "Run an all-reduce benchmark with another heavy job active on the same spine and confirm bandwidth remains within the target of the isolated run, with tail latency reported per collective.",
    dep: ["fabric-topology", "rdma-transport"]
  },
  "intra-node-interconnect": {
    s: "The high-bandwidth links between accelerators inside one server, many times faster than the network, which make a node the natural unit for tensor-parallel groups.",
    d: "Devices in a node are joined by a dedicated all-to-all switch or direct links with an order of magnitude more bandwidth than the host network. The topology, including which devices share a switch and which host network card is closest, is exposed to software so collectives and rank placement can use it. A node is therefore both a failure domain and a performance domain. Complications are firmware-level link training, partial link failures that silently degrade bandwidth, and mismatches between logical and physical device order.",
    k: ["Full switch inside the node versus point-to-point links: a switch gives uniform bandwidth to any pair, while direct links cost less but make some pairs slower.", "One large node versus many small ones: large nodes keep more traffic on fast links, but each failure removes more capacity."],
    p: ["A degraded link inside a node cuts a tensor-parallel group's speed while all health checks report the node as fine.", "Device numbering that differs from physical topology places communicating ranks on the farthest pair."],
    v: "Run a bandwidth test between every device pair within a node and confirm all pairs reach the expected rate, with any outlier pair flagged by the health check.",
    dep: ["accelerator-drivers"]
  },
  "network-health-checks": {
    s: "Tests and monitors that find degraded links, bad cables, misconfigured switches and slow nodes before and during jobs, since a single weak link slows a whole collective.",
    d: "Before a job, pairwise or all-to-all bandwidth probes check the nodes allocated; during a job, switch and network card counters report errors, retransmissions, pause frames and link flaps. Results are mapped to physical links so operators know what to replace. Automated actions drain the affected nodes or reroute traffic. The challenge is sensitivity: intermittent faults appear only under load, and counters are ambiguous, since high error rates on one link can be caused by the neighbor at the other end.",
    k: ["Active probes versus passive counters: probes find faults on idle links but add load, while counters cost nothing but only reveal faults that traffic exercises.", "Check at every job start versus on schedule: every-start checks catch recent faults at the cost of start delay."],
    p: ["A link running at half speed passes a connectivity test and shows only as a gradual throughput loss.", "Counters read from one end of a faulty cable blame the wrong device."],
    v: "Degrade one link in a test cluster, run the health check, and confirm it names that link and both endpoints within one probe cycle, and the scheduler stops placing jobs across it.",
    dep: ["fabric-topology", "hardware-telemetry"]
  }
});
