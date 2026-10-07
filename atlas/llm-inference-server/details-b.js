// Details for the LLM inference server plate, part 2: scheduler, key-value cache, model runner.
ATLAS.details("llm-inference-server", {
  "engine-loop": {
    s: "The core cycle that repeatedly asks the scheduler for a batch, runs one model step, processes outputs and returns tokens, while the API side stays responsive.",
    d: "Each iteration schedules a batch, executes the forward pass, samples tokens, updates request state, frees finished requests and hands new text to output queues. Front-end tasks run asynchronously and exchange messages with the loop through queues, so tokenization and streaming do not stall the device. Host work between steps, such as building inputs, is overlapped with device execution where possible. The hard part is keeping the device busy: any host-side delay per step is multiplied by thousands of steps per second.",
    k: ["Single loop process vs separate front-end and engine processes: separation prevents API work from stalling steps, but adds serialization and queue hops.", "Synchronous steps vs overlapped scheduling: overlap hides host overhead and keeps the device fed, but complicates stop conditions, since the next step is already planned when a stop is found."],
    p: ["Host-side work that grows with batch size creates gaps between steps, so the device idles while the CPU prepares.", "An exception inside one request's processing that escapes the loop takes down every request in flight."],
    v: "Profile a steady decode workload and confirm device busy time between consecutive steps is close to one hundred percent, with host gaps below a small fraction of step time.",
    dep: ["continuous-batching","forward-executor","input-preparation","incremental-detokenizer"]
  },
  "request-queue": {
    s: "Holds requests that have been admitted but not yet started, ordered by arrival and priority, until the scheduler can fit them into a step.",
    d: "New requests wait with their tokenized prompt, sampling settings and arrival time. The scheduler pulls from the front when memory and budget allow. Preempted requests return here, usually ahead of new arrivals so they finish. Ordering is first-come by default, with priority classes or shortest-job heuristics as options. The difficulty is head-of-line blocking: one huge prompt at the front that does not fit stops smaller requests behind it, unless the scheduler is allowed to skip it.",
    k: ["Strict first-come order vs skipping blocked requests: strict order is fair and predictable, but one oversized request stalls everything behind it.", "Single queue vs per-tenant queues: per-tenant queues give isolation, at the price of an extra policy deciding which queue to serve."],
    p: ["Letting short requests always jump the queue starves long ones indefinitely.", "Counting time spent queued toward a client timeout means a request can expire before it starts."],
    v: "Submit one very large prompt followed by many small ones while memory is tight, and confirm small requests are served within the stated policy and the large one still completes in bounded time.",
    dep: ["priority-scheduling","block-allocator"]
  },
  "continuous-batching": {
    s: "Rebuilds the batch at every step, letting finished requests leave and new ones join immediately, instead of waiting for a whole batch to finish.",
    d: "Older batching ran a fixed group of requests until the slowest completed, wasting capacity on finished slots. Continuous batching treats the step as the unit: each iteration selects any mix of requests in the prefill or decode phase, flattening their tokens into one forward pass. This keeps the device full as lengths differ widely. It requires the cache to be allocated per request and attention kernels to handle ragged sequences. The hard part is balancing step size, because larger steps raise throughput and also delay every token in them.",
    k: ["Iteration-level scheduling vs request-level batching: iteration-level fills the device and cuts waiting, but needs ragged kernels and per-step scheduling cost.", "Mix prefill and decode in one step vs separate them: mixing improves utilization, but a big prefill delays decode tokens that share the step."],
    p: ["Scheduler work that scales with number of running requests becomes the bottleneck at high concurrency.", "A new request joining mid-stream with a long prompt makes every existing stream stutter for that step."],
    v: "Run requests with widely varying output lengths and confirm that slot occupancy stays near full and that a short request submitted behind a long one finishes first, not after it.",
    dep: ["token-budget","paged-layout","attention-backends","request-queue"]
  },
  "token-budget": {
    s: "A cap on the number of tokens processed in one step, which bounds step time and splits capacity between new prompts and ongoing generation.",
    d: "Step time grows with the number of tokens in the batch. The scheduler fills a budget, spending one token per running decode request and giving the remainder to prompt chunks. A small budget keeps inter-token latency low but slows prompt processing and lowers throughput; a large budget does the opposite. Many systems set the budget from a target step duration measured on the actual hardware. The hard part is that the right value depends on model size, device and traffic mix.",
    k: ["Fixed budget vs adaptive to a latency target: fixed is predictable, but adaptive follows hardware and load changes at the cost of oscillation.", "Reserve budget for decode first vs split proportionally: decode-first protects streaming smoothness, but prompts take longer under steady load."],
    p: ["A budget tuned on short prompts is far too large for long-context traffic and causes multi-second steps.", "Setting the budget by tokens alone ignores attention cost, which grows with context length."],
    v: "Sweep the budget on a fixed mixed workload and confirm measured p99 step time rises with it, and pick the value at which the inter-token latency target is just met.",
    dep: ["continuous-batching","chunked-prefill"]
  },
  "chunked-prefill": {
    s: "Splits a long prompt into pieces processed across several steps, so that decoding for other requests continues instead of waiting for the whole prompt.",
    d: "A prompt of a hundred thousand tokens in one step could take seconds, freezing every other stream. Chunking processes, say, a few thousand tokens per step, appending each chunk's keys and values to the cache and attending to what was already stored. The request produces its first token after the last chunk. Chunks ride along with decode tokens in the same step. The difficulty is the extra cache reads for later chunks and the delay to the long prompt's own first token.",
    k: ["Small chunks vs large chunks: small chunks protect other streams and delay the long request, while large chunks finish prompts sooner and cause stalls.", "Chunk alongside decode vs dedicated prefill steps: sharing keeps decoding alive, but makes step time less predictable."],
    p: ["Chunks too small make the arithmetic inefficient and prompt processing several times slower than needed.", "Prefix-cache hits that end mid-chunk require care to align block boundaries, or work is silently repeated."],
    v: "Start a very long prompt during active streams and confirm worst inter-token latency for the existing streams stays under target, with the long prompt's output still correct and identical to unchunked.",
    dep: ["token-budget","paged-layout","attention-backends"]
  },
  "priority-scheduling": {
    s: "Orders and shares capacity between requests by class, tenant or deadline, so important or latency-sensitive traffic is served first and none starves.",
    d: "Policies range from strict priority classes to weighted fair sharing across tenants, with optional aging so waiting raises priority. Interactive requests may outrank batch jobs, which are filled in around them. Priorities apply at admission, at queue selection and at preemption victim choice. The hard part is that capacity is not just compute: a low-priority request that already holds cache cannot be dropped for free, so priority inversion appears, with a high-priority request waiting on memory held by a low one.",
    k: ["Strict priority vs weighted fair share: strict gives the best latency to top class, but fair share prevents starvation of the rest.", "Preempt low priority to admit high vs wait: preemption gives responsiveness, but wastes the work already done on the victim."],
    p: ["Strict priority under sustained high-priority load starves batch work indefinitely.", "Tenants labeling every request as urgent erases the distinction unless classes are tied to authorization."],
    v: "Run an interactive class and a batch class together at saturation and confirm interactive latency stays at target, batch throughput still progresses, and no request waits beyond its aging limit.",
    dep: ["request-queue","preemption","auth-and-quotas"]
  },
  "preemption": {
    s: "Pauses a running request to free cache memory for others, either by discarding its cache to recompute later or by swapping it to host memory.",
    d: "When cache blocks run out during decode, the scheduler must free some. It picks a victim, often the most recently admitted or lowest priority, and either drops its blocks, recomputing the prompt and generated tokens on resume, or copies them to host memory and back. Recompute costs compute but no transfer bandwidth; swap costs bandwidth and host memory. The hard part is thrash: if capacity is genuinely too small for the load, requests are repeatedly preempted and resumed and make no net progress.",
    k: ["Recompute vs swap: recompute is simple and needs no host memory, while swap saves arithmetic for long contexts at the price of transfer time.", "Preempt newest vs oldest: newest wastes the least work, but oldest frees the most memory per victim."],
    p: ["Thrashing under overload where the same requests are evicted and restarted repeatedly, so goodput collapses.", "Resuming with sampling state not saved makes seeded output differ from an uninterrupted run."],
    v: "Shrink cache capacity until preemption occurs, and confirm every preempted request finishes with text identical to a run without preemption for a fixed seed, with the preemption count visible in metrics.",
    dep: ["block-allocator","host-offload","seeded-randomness"]
  },
  "cancellation": {
    s: "Stops work for requests whose client has gone, whose deadline passed or which hit a limit, and releases their cache and batch slots promptly.",
    d: "Cancellation arrives from the front end as a message naming a request. The scheduler removes it at the next step boundary, frees its blocks and drops queued output. Deadlines are enforced the same way, with time measured from arrival. Cancelling in the middle of a step is not possible, so the cost is at most one step. The difficulty is distributed: a request waiting for a transfer between pools, or inside a pipeline, must be cancelled in every stage, and a race can leak its resources.",
    k: ["Cancel at step boundary vs abort mid-step: boundary cancellation is safe and cheap, while aborting mid-step gains little and risks corrupt state.", "Server-side deadlines vs client disconnect only: deadlines bound worst-case cost, but need a sensible default that does not truncate valid long answers."],
    p: ["Cancellation messages lost in a queue leave orphan requests generating for hours.", "A cancelled request in a speculative step releases blocks that the verification step is still writing."],
    v: "Start one hundred streams, drop half the client connections at random, and confirm cache usage and running count fall by half within a few steps, with no leaked blocks after all requests end.",
    dep: ["engine-loop","block-allocator","http-endpoints"]
  },
  "prefill-decode-split": {
    s: "The scheduler-side design in which one engine instance runs only the prompt phase and another only the generation phase, with cache moved between them.",
    d: "A prefill instance processes the whole prompt in large efficient batches and emits the first token plus the stored cache. A decode instance receives that cache and generates the rest. The scheduler on each side applies different policies: prefill maximizes arithmetic throughput under a time-to-first-token target; decode maximizes batch size under an inter-token target. The hard part is the handoff: it needs a layout both sides agree on, flow control, and recovery when either side fails midway.",
    k: ["Push the cache from prefill vs pull from decode: push starts transfer early, while pull lets the decode side choose when it has capacity.", "Same device type for both phases vs different: identical devices simplify operations, but different devices can match each phase's bottleneck."],
    p: ["Decode side without free cache blocks causes the prefill result to wait, wasting its memory and delaying the request.", "Mismatched parallelism layouts between pools require a reshape of the cache during transfer."],
    v: "Run a prompt through a split deployment and confirm the output tokens are identical to a single-instance run with the same seed, and that transfer time is logged per request.",
    dep: ["kv-transfer","chunked-prefill","block-allocator"]
  },
  "kv-transfer": {
    s: "Moves a request's cache blocks between engine instances or memory tiers over the interconnect or network, overlapped with computation where possible.",
    d: "A transfer sends blocks, with their layer and head layout, from a source device to a destination and updates the destination's block table. High-speed paths use direct device-to-device copies; slower ones stage through host memory. Sends are pipelined per layer so decode can begin as soon as the last layer arrives, and often overlapped with the prefill of later chunks. The challenge is bandwidth: a cache for a long prompt is gigabytes, so transfer can cost more than recomputing it for short prompts.",
    k: ["Layer-by-layer streaming vs transfer at the end: streaming hides latency behind compute, but needs fine-grained synchronization and ordering.", "Transfer vs recompute on the destination: transfer saves arithmetic for long prompts, while recompute is simpler and better for short ones."],
    p: ["Sender frees blocks before the receiver confirms, so a failed transfer loses the only copy.", "Layout differences such as different parallel degrees make a raw copy produce garbage, not an error."],
    v: "Transfer a known cache between two devices and compare a checksum of every block on both sides, then generate from the destination and confirm the continuation matches the source's.",
    dep: ["block-tables","interconnect-topology","paged-layout"]
  },
  "block-allocator": {
    s: "Hands out fixed-size cache blocks to requests on demand and takes them back when requests finish, tracking free, shared and evictable blocks.",
    d: "Device memory left after weights is carved into equal blocks, each holding keys and values for a fixed number of tokens across all layers. A free list serves allocations in constant time. Each request gets blocks as it grows, one at a time during decode, so memory is never reserved for tokens that may not be generated. Reference counts support sharing. The hard parts are accounting at admission, since the scheduler must know whether a request can finish, and choosing the block size.",
    k: ["Small blocks vs large blocks: small blocks waste less at the tail of each sequence and give finer sharing, but increase table size and kernel indirection.", "Allocate on demand vs reserve the maximum: on demand packs far more requests, but can run out mid-generation and force preemption."],
    p: ["Counting free blocks without in-flight growth admits more requests than can finish, leading to preemption storms.", "Reference-count bugs leak blocks slowly until capacity quietly shrinks over days."],
    v: "Run a long soak with random request lengths and cancellations, then stop traffic and confirm every block returns to the free list and the free count equals total capacity.",
    dep: ["paged-layout","device-memory-manager","memory-profiling"]
  },
  "paged-layout": {
    s: "Stores each request's keys and values in non-contiguous fixed-size blocks and lets attention kernels follow indirection to gather them, like virtual memory pages.",
    d: "Contiguous per-request buffers must be sized for the maximum length, wasting most memory and fragmenting. Paging stores blocks anywhere and records their locations in a table; the attention kernel reads the table to find each block. This makes memory use proportional to actual tokens, enables sharing and cheap growth. The cost is an extra memory lookup per block and kernels written to handle it. The hard part is that block size and layout affect kernel efficiency and must match the hardware's memory access patterns.",
    k: ["Paged non-contiguous blocks vs contiguous reservation: paging cuts waste dramatically and supports sharing, at the cost of kernel complexity and slight lookup overhead.", "Layout with heads or tokens contiguous within a block: the choice favors different kernels and memory access patterns, and cannot easily be changed later."],
    p: ["Kernels that assume contiguity silently read wrong memory when given paged input.", "Block size not aligned to the hardware's access granularity wastes bandwidth on every read."],
    v: "Compare attention outputs from the paged kernel against a reference contiguous implementation on random block placements and confirm they agree within numeric tolerance for several sequence lengths.",
    dep: ["block-tables","attention-backends","device-memory-manager"]
  },
  "block-tables": {
    s: "Per-request lists mapping logical token positions to the physical cache blocks that hold them, passed to attention kernels at every step.",
    d: "Each running request has a table of block indices in order. At each step the runner copies tables for the whole batch into a padded device array so kernels can find any request's blocks. Tables grow as blocks are appended and are shared in part when requests share a prefix. They are also the unit of transfer, offload and eviction. The difficulty is overhead: building and copying tables for thousands of requests each step costs host time unless the update is incremental.",
    k: ["Rebuild tables each step vs update incrementally: rebuild is simple and robust, while incremental updates scale to large batches but are easy to get out of sync.", "Padded rectangular array vs flat array with offsets: rectangular is simple for kernels, but wastes memory on short requests in mixed batches."],
    p: ["A table entry pointing to a block freed and reused by another request leaks one user's context into another's output.", "Stale tables after preemption read garbage blocks, yielding plausible but wrong text."],
    v: "Randomly interleave allocation, sharing, preemption and finish events in a stress test and assert after every step that no physical block is referenced by two requests unless marked shared.",
    dep: ["block-allocator","paged-layout"]
  },
  "prefix-cache": {
    s: "Keeps the cache blocks of finished or ongoing requests so a later request with the same beginning can skip recomputing them.",
    d: "Blocks are identified by a hash of their tokens together with everything before them. When a new prompt arrives, the engine hashes its blocks in order and reuses all that match, starting prefill after the matched prefix. Shared system prompts, few-shot examples and long documents with many questions benefit most. Matched blocks are pinned while in use and otherwise kept in an evictable pool. The hard problem is exactness: reuse must give the same result as recomputation, which depends on identical adapters, multimodal inputs and numeric kernels.",
    k: ["Block-granular hash matching vs token-granular tree matching: block hashes are simple and fast, but only match at block boundaries, wasting partial blocks.", "Keep finished cache blocks vs free at once: keeping them wins on repeated prefixes, but reduces free memory and can lengthen preemption decisions."],
    p: ["Cache hits across different adapters or different model versions return state computed under other weights.", "Hash collisions or incomplete keys that omit multimodal content share state between unrelated prompts."],
    v: "Send the same long prompt twice and confirm the second request reports a prefix hit and prefill tokens drop to near zero, while its output with a fixed seed equals the uncached output.",
    dep: ["radix-index","block-allocator","eviction-policy","block-tables"]
  },
  "radix-index": {
    s: "A tree keyed by token sequences that finds the longest cached prefix of a prompt and tracks which branches are in use or evictable.",
    d: "Each edge holds a run of tokens and points to the cache blocks that store them, so prompts that share a beginning share a path. A lookup walks from the root following the prompt and returns the longest match in time proportional to prompt length. Insertion splits edges where a new prompt diverges. Leaves with no active users are candidates for eviction, usually least recently used first. The hard part is concurrency and memory: the index itself consumes host memory and must stay consistent with the real block state.",
    k: ["Radix tree vs flat hash of blocks: the tree finds token-exact matches and supports ordered eviction of leaves, while flat hashes are simpler and easier to distribute.", "Index on the host vs on the device: host indexes are flexible and cheap to update, but add CPU work per scheduling step."],
    p: ["Evicting an interior node whose descendants are in use corrupts the path and drops live requests' state.", "A very large number of unique prompts balloons the tree faster than eviction trims it."],
    v: "Insert a set of prompts with known overlaps and confirm each lookup returns the expected match length, then evict and confirm interior nodes survive while any descendant is referenced.",
    dep: ["block-tables","eviction-policy"]
  },
  "eviction-policy": {
    s: "Chooses which unreferenced cache blocks to discard or demote when memory is needed, balancing the chance of reuse against the cost of recomputing.",
    d: "Only blocks no running request holds can be evicted. Least-recently-used is the baseline; refinements weight by recompute cost, since early blocks are cheaper to attention-compute than late ones, by frequency, or by tenant quota. Eviction proceeds from the leaves of the prefix tree so that shared ancestors survive. Evicted blocks may move to a slower tier instead of vanishing. The hard part is predicting reuse from workload shape, which changes through the day.",
    k: ["Recency vs frequency weighting: recency adapts to shifting traffic, while frequency protects hot system prompts from being flushed by a one-time scan.", "Discard vs demote to host: demotion preserves work for later hits, but spends transfer bandwidth and host memory on blocks that may never return."],
    p: ["One huge one-time prompt flushes the entire useful cache under a pure recency rule.", "Per-tenant fairness is absent, so one tenant's traffic evicts everyone else's prefixes."],
    v: "Warm the cache with a hot prefix, then run a large scan of unique prompts, and confirm that the hot prefix still hits afterward under the chosen policy, and measure what plain recency would have lost.",
    dep: ["block-allocator","host-offload"]
  },
  "copy-on-write": {
    s: "Lets several requests share the same cache blocks and gives a request a private copy of a block only when it must write to it.",
    d: "When requests share a prefix, or when one prompt produces several samples, the shared blocks have a reference count above one. Reads are free. If a request must append tokens into a block that is shared and partially full, the allocator first copies that block and updates only that request's table. Most blocks are completely filled before sharing, so copies are rare. The hard part is correctness under concurrency: writing into a shared block by mistake corrupts other requests silently.",
    k: ["Share partial tail blocks and copy when written vs share only full blocks: sharing partial blocks maximizes reuse, but needs copy logic and extra synchronization.", "Copy eagerly at fork time vs lazily at first write: lazy saves memory and bandwidth when no divergence occurs, but delays cost into the decode path."],
    p: ["A missed copy path lets two samples write into the same block and overwrite each other's keys.", "Reference counts decremented twice free a block that is still in use."],
    v: "Fork one prompt into eight parallel samples with different seeds and confirm each output equals its independent single-sample run, while the measured cache use is far below eight times the prompt size.",
    dep: ["block-allocator","block-tables","beam-parallel-sampling"]
  },
  "host-offload": {
    s: "Moves cold cache blocks from device memory to host memory or disk, and brings them back on a hit, extending effective cache capacity.",
    d: "Device memory is the scarcest tier, so blocks that are not being read are copied to host RAM, and from there optionally to local or shared storage. A lookup that hits a lower tier triggers a prefetch back before use. Transfers run on separate streams to overlap with compute. The value depends on a simple comparison: reloading a block must be cheaper than recomputing its tokens. The hard part is scheduling this movement without stealing bandwidth from the interconnect that decode already needs.",
    k: ["Offload to host vs discard and recompute: offload keeps long-context sessions cheap to resume, but spends bandwidth and host memory on blocks that may never be reused.", "Local tier vs shared cache service: shared tiers let any replica reuse a block, but add network latency and consistency to manage."],
    p: ["Reload slower than recompute turns a cache hit into a net loss, especially on small models.", "Host memory pressure from offloaded blocks starves the rest of the host processes."],
    v: "Fill the device cache, offload a conversation, resume it, and confirm the reload time per block is below the measured recompute time and that the continuation text matches the original.",
    dep: ["block-tables","eviction-policy","streams-events","memory-pools"]
  },
  "kv-quantization": {
    s: "Stores keys and values at lower numeric precision than the model's activations, trading a small accuracy loss for far more cache capacity.",
    d: "Cache bytes per token scale with precision, so halving it roughly doubles the number of tokens or requests that fit. Keys and values are quantized when written, with per-tensor, per-head or per-block scales, and dequantized inside the attention kernel when read. Keys are more sensitive to error than values, because they determine attention weights. The hard part is evaluating damage: perplexity may hold while long-context retrieval or reasoning degrades, so tests must use tasks that stress the cache.",
    k: ["Lower precision cache vs full precision: more capacity and less bandwidth per step, against accuracy loss that grows with context length.", "Static scales vs dynamic scales per block: static is cheaper and simpler, while dynamic tracks outliers at the cost of extra metadata and compute."],
    p: ["Outlier tokens, such as the first token in a sequence, dominate scale choice and wreck precision for the rest.", "Accuracy checked only on short prompts misses degradation at long context."],
    v: "Run a long-context retrieval task and a general benchmark at both precisions and confirm the score drop is within the stated tolerance, while cache capacity measured in tokens rises by the expected factor.",
    dep: ["paged-layout","attention-backends","numerics"]
  },
  "sliding-window": {
    s: "Limits how much past context each layer keeps, discarding or compressing old entries, so memory per request stops growing with length.",
    d: "Some models attend only to a recent window in some or all layers, so older blocks in those layers are never read again and can be freed. Other techniques keep a few initial tokens plus a recent window, or select important entries by score. Cache management must handle different layers having different lifetimes, which breaks the assumption of one uniform table per request. The hard part is that prefix reuse and window eviction interact: a freed block can no longer be shared.",
    k: ["Window attention built into the model vs post-hoc eviction of cache entries: built-in windows are exact by design, while eviction is applicable to any model but risks losing needed context.", "Per-layer cache pools vs one pool: per-layer pools reflect real lifetimes and save memory, but complicate allocation and transfer."],
    p: ["Applying post-hoc eviction to a model not trained for it quietly fails on questions about early content.", "Freeing window-expired blocks that the prefix cache still lists produces hits on blocks that no longer hold data."],
    v: "Generate beyond the window length and confirm per-request cache use plateaus at the window size, while output for a prompt that fits the window equals the full-cache output exactly.",
    dep: ["block-allocator","prefix-cache","attention-backends"]
  },
  "input-preparation": {
    s: "Builds the flat arrays of token ids, positions, block tables and sequence lengths that one forward pass needs, from the scheduler's chosen batch.",
    d: "The scheduler outputs a list of requests with how many tokens each processes. Preparation flattens these into one ragged array with offsets, computes each token's position, fills block tables and slot mappings for writing new keys and values, and gathers sampling parameters. It runs on the host and the result is copied to the device, ideally while the previous step still executes. Its cost grows with batch size, and at high step rates it becomes a leading cause of idle devices.",
    k: ["Rebuild all arrays each step vs persist and patch: rebuild is simple, while persistent buffers cut host cost and need careful updates.", "Pad to fixed shapes vs ragged exact shapes: fixed shapes enable captured graphs, but waste arithmetic on padding."],
    p: ["Off-by-one in position or slot mapping writes keys into the wrong block, corrupting later tokens silently.", "Allocating new host buffers each step triggers allocator stalls that appear as random latency spikes."],
    v: "Compare prepared arrays against a slow reference builder on randomized batches mixing prefill chunks and decode tokens, asserting exact equality of ids, positions and slot mappings.",
    dep: ["block-tables","continuous-batching","tokenizer"]
  },
  "forward-executor": {
    s: "Runs the network layers over the prepared batch on the device, writing new keys and values into the cache and returning scores for the next token.",
    d: "For each layer it applies normalization, projections, attention against the paged cache, the feed-forward block and residual connections. Outputs for only the positions that need next-token scores are passed to the output head. Under model parallelism, communication steps occur inside the layers. A step has one launch of many kernels, so launch overhead and kernel efficiency decide speed. The hard part is that decode steps are limited by reading all weights from memory, so batch size, not arithmetic, determines tokens per second.",
    k: ["Eager kernel launches vs captured graphs: eager supports any shape, while captured graphs remove launch overhead for the common decode shapes.", "Compute only needed positions in the head vs all positions: restricting saves large memory and arithmetic for prefill, and needs index bookkeeping."],
    p: ["A shape not covered by the captured set falls back to a slow path, causing latency spikes for rare batch sizes.", "Numerical differences between prefill and decode kernels make the same prompt give different tokens depending on batching."],
    v: "Run a fixed prompt greedily at batch size one and inside a large mixed batch, and confirm the tokens agree, or the divergence is within the documented numeric tolerance.",
    dep: ["attention-backends","fused-kernels","graph-capture","embedding-and-head","kernel-library"]
  },
  "attention-backends": {
    s: "The kernels that compute attention over the paged cache, selected by phase, shape and hardware, since attention dominates cost at long context.",
    d: "Prefill uses blocked, memory-efficient kernels that never materialize the full score matrix. Decode uses kernels that split work across the cache length, because one query token has little parallelism by itself. Variants handle grouped or shared key-value heads, windowed attention, paged lookups and mixed ragged batches. A dispatcher picks one per step. The difficulty is correctness and coverage: each combination of feature, precision and shape needs a tested kernel, or a fallback.",
    k: ["Specialized kernel per phase vs one unified kernel: specialization is fastest for each case, while unified kernels simplify mixed batches and reduce code.", "Hand-tuned kernels vs compiler-generated: hand-tuned reach peak speed on known hardware, but each new device generation needs porting."],
    p: ["A kernel that supports only some head dimensions silently falls back, slowing a new model several times over.", "Split-length decode kernels reduce in a nondeterministic order and give slightly different results run to run."],
    v: "Compare every kernel variant against a naive reference over random shapes, block layouts and precisions, within tolerance, and benchmark that the dispatcher chooses the fastest one for each.",
    dep: ["paged-layout","kernel-library","numerics","kv-quantization"]
  },
  "graph-capture": {
    s: "Records the sequence of device operations for a given batch shape once, then replays it with minimal launch cost on later steps.",
    d: "Each decode step launches hundreds of small kernels, and host launch overhead can exceed their runtime. A captured graph stores the whole sequence and replays it in a single call, reading inputs from fixed buffers. Because a graph has fixed shapes and addresses, servers capture a set of batch sizes and pad each real batch up to the next captured size. Capture happens at startup, consumes device memory and takes noticeable time. The difficulty is anything dynamic: shapes, host-side branching and memory allocation cannot occur inside.",
    k: ["Capture many sizes vs few: many sizes waste less padding, but use more memory and longer startup.", "Capture decode only vs prefill too: decode gains most, while prefill shapes vary too much for graphs to pay off."],
    p: ["Captured graphs hold memory that the cache allocator does not see, causing out-of-memory errors at startup or under load.", "Replaying with stale input buffers produces the previous step's results."],
    v: "Measure step time for small decode batches with and without graph replay and confirm a clear reduction, and confirm tokens are identical between the two modes for a fixed seed.",
    dep: ["forward-executor","device-memory-manager","streams-events","warmup"]
  },
  "fused-kernels": {
    s: "Combine adjacent operations such as normalization, activation, rotary position and residual addition into one kernel to avoid writing intermediates to memory.",
    d: "Many layer operations are limited by memory traffic, not arithmetic. Fusing them reads inputs once and writes results once, cutting bandwidth and launches. Common fusions include normalization with residual add, gated activations, position rotation with the cache write, and sampling-related scaling. Fusion is written by hand for hot paths or produced by a compiler from the model graph. The hard part is numerical: fused kernels reorder arithmetic and may use different intermediate precision, so results shift slightly.",
    k: ["Hand-written fusion vs compiler-driven fusion: hand-written is fastest and predictable, while compiler fusion adapts to new architectures with less engineering.", "Fuse aggressively vs keep operations separate: fused code is faster, but harder to debug and to change when the model variant differs slightly."],
    p: ["Fused kernels with a different accumulation precision shift outputs enough to fail regression comparisons against the reference model.", "A fusion that assumes a fixed head dimension is wrong for a variant model and fails silently."],
    v: "Compare fused and unfused layer outputs on random inputs within a stated tolerance, then run an end-to-end evaluation to confirm accuracy matches and measured per-layer time falls.",
    dep: ["kernel-library","numerics","kernel-autotuning"]
  },
  "moe-dispatch": {
    s: "For models with many expert sub-networks, routes each token to its few chosen experts, runs them in grouped batches and combines the results.",
    d: "A small router scores experts per token and selects the top few. Tokens are then grouped by expert so each expert's matrix multiplication runs on a contiguous batch, and outputs are scattered back and weighted. With experts spread across devices, this needs an all-to-all exchange. Load is uneven: popular experts get many tokens and idle ones few. The difficulty is keeping devices balanced and the grouped multiplications efficient when batch sizes per expert vary from step to step.",
    k: ["Capacity-limited routing vs dropless routing: limits give predictable shapes and may drop tokens, while dropless is exact but needs dynamic shapes.", "Replicate hot experts vs a fixed placement: replication evens load, at the cost of memory and placement logic."],
    p: ["One device holding popular experts sets the step time for all devices, so scaling stalls.", "Dropping tokens past capacity quietly lowers quality and only under heavy batch load."],
    v: "Run a mixed workload and log tokens per expert and per device; confirm the busiest device stays within a stated factor of the mean, and outputs match a dense reference of the same routing.",
    dep: ["expert-parallel","collectives","kernel-library"]
  },
  "positional-encoding": {
    s: "Applies position information to queries and keys, and supports contexts longer than those seen in training through scaling or interpolation of positions.",
    d: "Most models rotate query and key vectors by position-dependent angles. Each token's position must be exact, including after prefix reuse or chunked prefill, or attention compares the wrong distances. Longer contexts are served by rescaling the angles or by variants trained for length, with different handling for short and long inputs. Cached keys are stored after rotation, so the scheme cannot change between cached and new tokens. The hard part is that errors do not crash: the model just gets worse as length grows.",
    k: ["Store rotated keys vs rotate at read time: storing saves compute on every step, while rotating at read allows flexible position changes at a bandwidth cost.", "Static scaling for long context vs dynamic scaling by length: static is deterministic but weakens short prompts, while dynamic changes cached keys as length grows."],
    p: ["Resetting positions to zero for a resumed chunk breaks attention without any error message.", "Dynamic scaling invalidates previously cached keys, making prefix reuse return stale state."],
    v: "Compare logits for the same long prompt processed in one pass and in several chunks, and confirm they match within tolerance; then check a retrieval task at the maximum supported length.",
    dep: ["input-preparation","model-config"]
  },
  "embedding-and-head": {
    s: "Looks up input token vectors at the start of the network and projects the final hidden state to a score for every vocabulary entry at the end.",
    d: "The embedding table maps ids to vectors and can be large for big vocabularies; the output head is a matrix of similar size, sometimes tied to the same weights. Only the last position of each decoding request needs scores, so the head is applied to a small subset. Across devices, the vocabulary dimension is split, and scores are gathered or reduced. The hard part is the memory and bandwidth of a vocabulary of hundreds of thousands of entries: logits for a large batch are a significant tensor in their own right.",
    k: ["Split vocabulary across devices vs replicate it: splitting saves memory, but sampling then needs gathered or distributed logits.", "Compute scores in full precision vs reduced: full precision protects tail probabilities for sampling, at extra memory and time."],
    p: ["Computing logits for every prompt position instead of the last wastes gigabytes and time on long prompts.", "Reduced-precision logits flatten differences between top candidates and change greedy outputs."],
    v: "Measure peak memory during a long-prompt prefill with last-position-only head computation and confirm it is far below a full-position computation, with identical next-token scores.",
    dep: ["tensor-parallel","numerics","logits-processors"]
  },
  "multimodal-encoders": {
    s: "Run image, audio or video inputs through their own networks to produce embeddings that stand in for tokens in the language model's input.",
    d: "A vision encoder splits an image into patches, runs a transformer over them and projects the result into the language model's embedding space. The number of output positions depends on image size, so scheduling must account for it. Encoders run on the same devices, usually as a separate batched step before prefill, and their output can be cached by content. The hard part is memory and scheduling: the encoder's activations compete with the cache, and large images or long audio create big, uneven work.",
    k: ["Encode in the same step as prefill vs as a separate stage: separate stages batch encoders well, but add latency and a queue to manage.", "Dynamic resolution vs fixed resizing: dynamic keeps detail and gives variable token counts, while fixed gives predictable cost and loses fine text."],
    p: ["An unbounded number of image positions from a high-resolution input exhausts the cache for one request.", "Position ids for inserted embeddings are miscounted, so text after the image is shifted."],
    v: "Send an image with known content and confirm the model's answer is correct and the number of inserted positions matches the encoder's documented output for that resolution.",
    dep: ["forward-executor","multimodal-inputs","input-preparation"]
  }
});
