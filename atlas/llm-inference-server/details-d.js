// Details for the LLM inference server plate, part 4: adapters, accelerator runtime, cross-cutting concerns.
ATLAS.details("llm-inference-server", {
  "adapter-registry": {
    s: "The catalog of fine-tuned adapters available to serve, with their base model, rank, location, version and owner, used to validate and resolve requests.",
    d: "Adapters are small sets of low-rank weight updates applied to a shared base model. The registry records for each adapter which base it fits, its size and rank, where its files live, and which tenants may use it. A request names an adapter; the registry confirms it exists, matches the loaded base and is permitted. It also tells the scheduler how much memory loading would cost. The hard part is consistency: adapters trained on one base revision silently misbehave on another, so compatibility must be checked, not assumed.",
    k: ["Central registry vs adapters discovered from storage: a registry gives validation and access control, while discovery is simple and lets stale or incompatible files appear.", "Immutable versioned adapters vs mutable names: immutable versions make results reproducible, and mutable names are convenient and invalidate caches."],
    p: ["An adapter loaded against the wrong base revision gives fluent but wrong answers with no error.", "Replacing an adapter under the same name leaves prefix-cache entries computed with the old one."],
    v: "Request an adapter trained for a different base and confirm it is rejected with a compatibility error, then request a valid one and confirm the response metadata names its exact version.",
    dep: ["model-config","auth-and-quotas"]
  },
  "adapter-loading": {
    s: "Brings an adapter's weights into device memory on demand, keeps hot ones resident and evicts cold ones, without pausing other requests.",
    d: "Adapters are small relative to the base, so many can be held on the device and more in host memory. A request for an absent adapter triggers a load from storage or host, which takes milliseconds to seconds. The scheduler can hold the request or admit it after the copy completes on a side stream. A slot table maps adapter ids to device buffers. The hard part is churn: when the active set exceeds the slots, adapters thrash in and out, and requests wait on loads.",
    k: ["Load on first request vs preload a configured set: on-demand supports a long tail of adapters and gives cold requests a delay, while preloading removes delay and limits the catalog.", "Evict by recency vs by popularity weight: recency adapts to shifting demand, while weighting keeps important adapters hot."],
    p: ["A burst of requests for many distinct cold adapters stalls the queue behind loads.", "Loading on the compute stream pauses the engine step for every other request."],
    v: "Request fifty distinct adapters in a burst while a streaming request runs and confirm the stream's inter-token latency stays within its target and every adapter response uses its own weights.",
    dep: ["adapter-registry","streams-events","device-memory-manager","model-eviction"]
  },
  "batched-adapter-kernels": {
    s: "Compute the base model's output once for a whole batch and add each request's own low-rank update, so different adapters share one forward pass.",
    d: "The base matrices multiply the whole batch as usual. For the adapter part, specialized kernels gather each request's low-rank matrices by slot index, multiply the small inputs and add the result to the base output. This avoids running one separate pass per adapter. Efficiency depends on grouping tokens by adapter and on ranks being small. The hard part is overhead: with many distinct adapters in one step, the gather and many tiny multiplications can cost more than the base layer itself.",
    k: ["Batched mixed-adapter kernels vs separate batches per adapter: mixed batches keep the device full, while separate batches are simple and fragment the batch.", "Merge adapter into base weights vs apply separately: merging gives full speed for one adapter and prevents sharing, while separate application costs extra but supports many."],
    p: ["Many distinct adapters per step make the adapter path slower than the base model.", "Different ranks across adapters in one batch force padding to the largest."],
    v: "Run a batch containing eight different adapters and confirm each request's output equals that adapter served alone, within tolerance, and report the throughput ratio against a no-adapter batch.",
    dep: ["adapter-loading","kernel-library","forward-executor"]
  },
  "model-lifecycle": {
    s: "Loads, unloads and swaps whole models on a replica in response to demand and policy, tracking each model's state and memory.",
    d: "A multi-model server holds a set of models in states such as unloaded, loading, ready, draining and unloading. Requests for an unloaded model trigger a load, with a queue while it comes up. Unloading waits for in-flight requests or cancels them after a deadline. Each model's weights and cache pool are accounted for separately. The hard part is the long load time: switching models on demand takes tens of seconds to minutes, so deciding what to keep resident is the main policy question.",
    k: ["Keep popular models resident vs load on demand: resident models answer instantly and hold memory idle, while on-demand loading serves a long tail at a large first-request cost.", "One model per replica vs several per replica: one per replica is simpler and isolates faults, while sharing raises utilization for low-traffic models."],
    p: ["Two models loading at once exceed device memory and both fail halfway.", "Unloading with requests still in flight cuts their streams."],
    v: "Request a model that is not loaded, confirm it loads and answers, then request the others until eviction occurs and confirm in-flight requests of the evicted model complete or fail with a clear error.",
    dep: ["multi-model-memory","weight-fetcher","sharded-loader","model-eviction"]
  },
  "multi-model-memory": {
    s: "Divides device memory among several models' weights and their cache pools, and enforces each model's share.",
    d: "Each resident model needs weights, activation workspace and a cache. A static split gives each a fixed budget; a dynamic scheme moves cache capacity between models as load shifts, by growing or shrinking pools in block units. Devices can also be partitioned in hardware. The profile pass must be run per model. The hard part is that cache is the elastic part and weights are not, so a quiet model still pins its full weight footprint and limits what others can use.",
    k: ["Static budgets vs dynamic shared pool: static is predictable and isolates models, while a shared pool follows demand and lets one model starve another.", "Hardware partitioning vs software sharing: partitions isolate performance and waste leftover capacity, while software sharing is flexible and interferes."],
    p: ["A busy model grows its cache and forces preemption in a quiet but latency-sensitive neighbor.", "Memory fragmented across pools leaves enough total free space but no room for the next model to load."],
    v: "Run two models with opposite load patterns and confirm each respects its minimum cache share, total memory never exceeds capacity, and capacity moves toward the busy model within the stated time.",
    dep: ["device-memory-manager","memory-profiling","block-allocator"]
  },
  "model-eviction": {
    s: "Chooses which model or adapter to unload when memory is needed for another, weighing demand, load cost and the cost of failing in-flight requests.",
    d: "Candidates are scored by recent request rate, time to reload, priority tier and whether they have requests in flight. Models with traffic and long load times are expensive to evict; rarely used and quick-to-load ones are cheap. Pinned models are never evicted. Eviction drains the model first when possible. The hard part is avoiding thrash: alternating requests for two models that do not fit together force swaps back and forth, and each swap costs minutes.",
    k: ["Evict least recently used vs lowest expected cost: recency is simple and adapts, while a cost model protects slow-to-load models and needs demand estimates.", "Drain gracefully vs evict immediately: draining avoids failed requests and delays the memory being freed."],
    p: ["Two alternating hot models that cannot coexist cause continuous swapping and all requests time out.", "Evicting a model that just finished loading wastes the load."],
    v: "Alternate requests between more models than fit and confirm eviction follows the policy, pinned models stay, and the reload count over an hour stays within the expected bound.",
    dep: ["model-lifecycle","queue-batch-metrics"]
  },
  "device-memory-manager": {
    s: "Owns the accelerator's memory: allocates weights, cache and workspace, tracks usage and prevents any component from taking what another needs.",
    d: "Device memory is fixed and has no swap, so overuse is an immediate failure. The manager gives weights a static region, cache a large pool carved into blocks, and activations a workspace sized by profiling, with captured graphs and communication buffers also taking their share. It reports free memory to the profile pass and to metrics. The hard part is that several libraries allocate on their own, outside the manager's view, and the driver itself reserves memory, so the accounting is never exactly right.",
    k: ["Preallocate the whole cache up front vs grow dynamically: preallocation avoids runtime allocation failures and strands memory, while dynamic growth uses memory better and can fail late.", "Own allocator vs the framework's caching allocator: an own allocator gives control and predictability, while the framework's gives compatibility and extra overhead."],
    p: ["A library's hidden allocation after startup pushes memory over the limit during a traffic peak.", "Fragmentation in the workspace region causes an out-of-memory error with plenty of total free memory."],
    v: "After warmup, query the driver's used memory and compare it with the manager's accounting; confirm the difference is within the stated margin and stays flat during a long soak test.",
    dep: ["driver-runtime","memory-pools"]
  },
  "memory-pools": {
    s: "Reusable pre-allocated regions for temporary buffers, so steps never call the driver's allocator on the critical path.",
    d: "Activation tensors, workspaces and staging buffers are carved from pools sized for the largest batch and reused each step, in a stack or by size class. Pinned host pools hold staging space for transfers. Allocation and free are pointer operations, with no driver call and no synchronization. Pools make memory use predictable and graph capture possible. The hard part is sizing: pools too large strand memory, and too small trigger a fallback to slow allocation or an error under unusual batches.",
    k: ["Stack-style per-step arenas vs general free-list allocation: arenas are fastest and reset each step, while free lists handle arbitrary lifetimes at more cost.", "Pinned host memory pool vs on-demand pinning: pools avoid slow pinning calls and hold host memory permanently."],
    p: ["A buffer kept past its step by mistake is overwritten by the next, corrupting results nondeterministically.", "Pinned host pools over-sized across many workers exhaust the node's memory."],
    v: "Run a long soak with varied batch shapes and confirm zero driver allocation calls in steady state and no growth of pool usage between the first and last hour.",
    dep: ["device-memory-manager"]
  },
  "streams-events": {
    s: "Ordered queues of device work and signals between them, letting copies, compute and communication overlap while keeping dependencies correct.",
    d: "Work on a stream runs in order, and different streams can run concurrently. The engine puts compute on one, cache transfers and adapter loads on others, and communication on another, with events marking dependencies, such as waiting for a copy before attention reads the block. The host can launch ahead of the device, so synchronization points define when results can be read. The hard part is races: a missing dependency means one stream reads data while another still writes, producing wrong output only sometimes.",
    k: ["Many streams for overlap vs few: more streams hide transfers and add synchronization risk, while few are simple and serialize work.", "Synchronize each step vs run ahead: synchronizing is simple, and running ahead hides host overhead at the cost of delayed error detection."],
    p: ["A missing event lets compute read a cache block before its transfer completes, giving wrong tokens rarely.", "An unnecessary full device synchronize in a hot path erases all overlap."],
    v: "Run a stress test with concurrent offload, adapter loads and decode, and compare every output with a serialized run; confirm identical tokens in at least ten thousand steps.",
    dep: ["driver-runtime"]
  },
  "kernel-library": {
    s: "The collection of tuned device routines for matrix multiplication, attention, normalization, activation and sampling that the model code calls.",
    d: "Performance comes from a few hundred kernels, each specialized by shape, precision and layout. Vendor-supplied libraries cover dense multiplication; custom kernels cover attention over paged caches, fused operations, quantized multiplications and sampling. A dispatcher selects by shape and hardware generation. Libraries are versioned together with drivers, so a mismatch can disable fast paths. The hard part is the matrix of combinations: each new model feature or precision multiplies the kernels to write and verify.",
    k: ["Use vendor libraries vs write custom kernels: vendor libraries are fast and maintained for standard operations, while custom kernels are needed for paged attention, fusion and new formats.", "Ahead-of-time compiled kernels vs just-in-time: ahead-of-time starts fast and ties to hardware targets, while just-in-time adapts to any device and delays first use."],
    p: ["A driver or library update changes kernel selection and quietly alters speed or numerics.", "A kernel that is correct for tested shapes reads out of bounds for an untested one."],
    v: "Run every kernel against a reference over randomized shapes and boundary sizes with memory checking enabled, and compare performance with the previous release, flagging regressions.",
    dep: ["driver-runtime","numerics"]
  },
  "kernel-autotuning": {
    s: "Searches tile sizes, block counts and other kernel parameters for each shape on the actual device, and records the best choices.",
    d: "A kernel's best configuration depends on the device, shapes and precision. Autotuning tries candidates on representative shapes, times them and stores the winner in a table keyed by device and shape, used at runtime. Tuning takes minutes to hours, so it runs offline or at first startup, with results cached. The hard part is shape coverage: serving sees many batch sizes and lengths, so the table must cover or interpolate, and stale tables from another device or library version are worse than none.",
    k: ["Tune offline and ship tables vs tune at startup: shipped tables start fast and need a build per device, while startup tuning fits any device and delays readiness.", "Tune many shapes vs few and interpolate: many shapes find better optima and cost more tuning time and table size."],
    p: ["A tuning table made on one device model is loaded on another and picks a configuration that is slow or invalid.", "Noisy timing under other load records a poor configuration as the winner."],
    v: "Compare kernel latency using the tuned table against defaults on the shape set, confirm a measured gain, and confirm the table is rejected when device model or library version differs.",
    dep: ["kernel-library","driver-runtime"]
  },
  "driver-runtime": {
    s: "The vendor-supplied software that exposes the device to processes: it manages contexts, memory, launches and links, and must match the libraries above it.",
    d: "The driver and runtime handle device initialization, memory mapping, kernel launch, stream scheduling and interconnect setup. Containers need the right device files and a user-space runtime matching the host driver. Version compatibility between driver, runtime, communication library and kernels is strict, and updates alter performance and bugs. The hard part is operations: driver resets, ECC events and link retraining cause failures that only appear after days of operation.",
    k: ["Pin exact versions vs track the latest: pinned versions give reproducible behavior, while the latest brings fixes and new hardware support with regression risk.", "Bundle the runtime in the image vs use the host's: bundling reproduces the stack, while using the host's reduces mismatch with the driver."],
    p: ["A node whose driver version differs from the image's expectations fails at startup or runs slow paths.", "Driver hangs require a node reboot, but the orchestrator keeps scheduling to it."],
    v: "On each node class, run the standard device diagnostic and a reference kernel suite from inside the serving container, confirming versions match the compatibility matrix and results match expected values.",
    dep: []
  },
  "device-health": {
    s: "Watches device temperature, memory error counters, link errors and step-time anomalies to find failing hardware before it corrupts answers or hangs the fleet.",
    d: "The monitor reads the driver's counters for correctable and uncorrectable memory errors, link retries, clock throttling and temperature, and compares step time against the replica's own baseline. Corrected errors accumulating, throttling or one slow device in a tensor group are signs that precede failure. On a bad signal the node is cordoned and drained. The hard part is silent data corruption: a faulty device can return plausible wrong numbers, which no counter reveals, and only periodic known-answer tests catch it.",
    k: ["Counters and thresholds vs known-answer self tests: counters are free and miss silent corruption, while self tests catch wrong results and cost device time.", "Replace on first warning vs on threshold: early replacement reduces risk and strands good hardware, while thresholds use hardware longer and risk bad outputs."],
    p: ["Throttling from cooling problems makes one replica slow, and averages hide it until users complain.", "A device with silent corruption keeps serving wrong output because every health probe still passes."],
    v: "Inject a known-answer test every few minutes on each device and confirm failures are detected within that interval, also check a simulated error counter increase triggers drain.",
    dep: ["driver-runtime","numerics"]
  },
  "numerics": {
    s: "The numeric formats used for weights, activations, accumulators and cache, and the rules for where each may be reduced without damaging output.",
    d: "Models are run in 16-bit floating point formats with different range and precision trade-offs, with lower 8-bit and 4-bit formats for weights, activations or cache. Accumulation of sums and normalization statistics stay in higher precision. Hardware has native support for specific formats, which decides which are fast. Results depend on operation order, so changing batch size, kernel or parallel degree changes low-order bits. The hard part is that errors are small per operation and compound over layers and long outputs.",
    k: ["Format with wide range vs with more precision: wide range avoids overflow without scaling, while more precision keeps small differences between close scores.", "Higher-precision accumulation vs speed: higher precision protects accuracy for sums over large dimensions, and lowers throughput for some operations."],
    p: ["Overflow in a narrow-range format produces infinities and not-a-number values that spread to the entire output.", "Assuming results are bit-exact across batch sizes leads to flaky tests and unreproducible bug reports."],
    v: "Run the same prompts with greedy decoding at several batch sizes and parallel degrees, and measure the logit difference and the fraction of identical tokens, confirming both stay within the documented bounds.",
    dep: []
  },
  "latency-throughput-tradeoff": {
    s: "The central tension: larger batches use the device better and raise tokens per second, and every extra request in a step slows each user's tokens.",
    d: "Decode is memory-bound, so adding requests to a step costs little extra time up to a point and then rises sharply. Throughput therefore climbs with load and so does latency, with a knee beyond which latency grows without throughput gain. Every setting expresses a position on this curve: token budget, maximum batch size, chunk size, speculation depth, admission limits and replica count. Product requirements, such as interactive chat versus overnight batch, determine where to sit. The hard part is that the curve moves with model, hardware and traffic mix.",
    k: ["Run near the knee vs with headroom: near the knee is cost-efficient and fragile to bursts, while headroom absorbs bursts and idles hardware.", "One service level for all traffic vs separate pools: one pool shares capacity and compromises each class, while separate pools tune independently at lower utilization."],
    p: ["Tuning on throughput alone produces a deployment that passes benchmarks and fails latency targets in production.", "Settings tuned for one traffic mix are left unchanged after prompt lengths shift."],
    v: "Sweep offered load and plot latency percentiles against throughput for the current settings; confirm the knee location and that the production operating point sits below it with measured headroom.",
    dep: ["token-budget","continuous-batching","admission-control","throughput-goodput"]
  },
  "memory-budgeting": {
    s: "The decision of how fixed device memory is divided among weights, cache, workspace and graphs, which sets how many requests and how much context fit.",
    d: "Weights are a fixed cost set by model size and precision. What remains becomes cache, and cache capacity in tokens sets concurrency and maximum context. Each choice trades against another: more cache needs quantized weights or more devices, higher parallel degree duplicates some buffers, captured graphs and communication buffers take memory too. Budgets must be computed per deployment, validated by profiling and monitored. The hard part is that the limits interact, so a change in one, such as a larger context window, silently reduces another.",
    k: ["Quantize weights to free cache vs keep full precision: quantizing buys concurrency at accuracy risk, while full precision keeps quality and limits batch size.", "More devices per replica vs more replicas: more devices give more cache per replica and lower latency, while more replicas give independent capacity."],
    p: ["Raising the maximum context length without recomputing the budget lets a single request consume the whole cache.", "A budget computed from nominal memory ignores the driver's reservation and fails at startup."],
    v: "Compute the expected cache capacity in tokens from the budget formula and compare it with the engine's reported capacity after startup; confirm they match within a few percent.",
    dep: ["memory-profiling","block-allocator","device-memory-manager","quantization-schemes"]
  },
  "numerical-precision-policy": {
    s: "The rules fixing which tensors use which numeric format and how quality is checked, applied consistently across weights, activations, cache and communication.",
    d: "Every precision choice saves memory or time and costs accuracy: weight bits, cache bits, activation format, accumulator width, communication format and logit precision. The policy sets each and ties it to an evaluation gate that must pass before release. Hardware support narrows the options. Because effects compound, the policy is evaluated end to end on tasks that stress long outputs and rare tokens. The hard part is that damage appears first in long contexts, non-English text and arithmetic, which common benchmarks under-sample.",
    k: ["One global precision vs per-component choices: global is simple to reason about, while per-component choices give the best trade-off and many combinations to validate.", "Gate on benchmark scores vs on side-by-side human review: scores are repeatable and cheap, while review catches qualitative regressions."],
    p: ["A cache or communication format changed without re-running evaluations lowers quality unnoticed.", "Evaluating only at greedy decoding misses behavior changes under sampling."],
    v: "For each release candidate, run the evaluation suite including long-context and multilingual tasks against the reference precision and confirm every score is within its stated tolerance.",
    dep: ["numerics","quantization-schemes","kv-quantization"]
  },
  "determinism-reproducibility": {
    s: "How far the same request is expected to produce the same output, given seeds, batch composition, parallel layout and kernel choices.",
    d: "Floating-point addition is not associative, so results depend on the order of operations, which varies with batch size, split of the sum across devices and kernel selection. With a fixed seed, per-request random streams remove one source of variation, but numeric differences can still flip close choices. Strict reproducibility needs fixed kernels, fixed reduction orders and batch-invariant algorithms, at some cost in speed. The hard part is deciding what to promise: bit-exact, same-text or only statistically equivalent output.",
    k: ["Batch-invariant kernels vs fastest kernels: batch-invariant gives the same output regardless of load and costs throughput, while fastest kernels let output vary with traffic.", "Promise reproducibility per seed vs not at all: a promise helps testing and evaluation, and constrains optimization and upgrades."],
    p: ["Evaluation comparisons between engine versions are noisy because outputs change with batch composition.", "Customers assume a seed guarantees identical text across hardware generations."],
    v: "Run one seeded request alone and inside varied loads one hundred times each; measure the rate of identical outputs and confirm it meets the documented guarantee.",
    dep: ["seeded-randomness","numerics","attention-backends"]
  },
  "failure-domains": {
    s: "How far a single fault spreads: one request, one replica, one model-parallel group, one pool or the whole fleet, and what happens to the work in flight.",
    d: "Every layer defines a blast radius. A bad request should fail alone; a device fault fails its parallel group, because every member waits on collectives; a bad deploy affects every replica of a version. Wider parallelism increases the radius and the chance of a failure in the group. Streams in flight cannot be moved between replicas, so a failure loses their work unless the client retries from the start. The hard part is containing faults deliberately: isolating poisoned inputs, limiting group size and shipping changes gradually.",
    k: ["Larger parallel groups vs smaller groups with more replicas: larger groups fit bigger models and fail together more often, while smaller groups limit the blast radius.", "Retry transparently in the gateway vs surface the failure: transparent retry hides faults and doubles load during incidents, while surfacing is honest and burdens clients."],
    p: ["One malformed request that crashes a kernel takes down every request in the batch and every replica it is retried on.", "Retries without budgets turn a partial outage into a full one."],
    v: "Inject a fault into one device of a parallel group and into one replica; confirm only that group's requests fail, traffic shifts, the failed work is reported, and the fleet recovers without manual action.",
    dep: ["replica-health","worker-processes","rollout-and-canary","device-health"]
  },
  "tenant-isolation": {
    s: "How callers sharing the same hardware are kept from seeing each other's data or degrading each other's service, in memory, cache, queues and logs.",
    d: "Isolation has two sides. Data isolation: one tenant's prompts must never leak into another's, which touches prefix caching, shared cache blocks, adapter selection, logs and crash dumps. Performance isolation: quotas, fair scheduling and per-tenant limits keep one tenant from consuming capacity. Shared prefix caches can also leak by timing, since a fast response reveals that someone else sent the same prompt. The hard part is that sharing is where the efficiency comes from, so each isolation measure costs hit rate or utilization.",
    k: ["Share the prefix cache across tenants vs partition per tenant: sharing maximizes hits and exposes timing side channels, while partitioning is safer and lowers reuse.", "Dedicated replicas per tenant vs shared with quotas: dedicated gives the strongest isolation at the lowest utilization, while shared depends on scheduler policy."],
    p: ["Cache keys that ignore tenant let one customer's request hit another's cached prompt, and reveal it through timing.", "Logs, traces or crash dumps containing prompts are readable by operators and tenants who should not see them."],
    v: "Send an identical unique prompt from two tenants and confirm no cross-tenant cache hit is reported or observable in timing, and a flood from one tenant leaves the other's latency within its target.",
    dep: ["prefix-cache","auth-and-quotas","priority-scheduling","request-logging"]
  }
});
