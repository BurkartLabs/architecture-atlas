// Details for the LLM inference server plate, part 3: speculative decoding, sampling, model loading, parallelism.
ATLAS.details("llm-inference-server", {
  "draft-model": {
    s: "A much smaller model that proposes several next tokens cheaply, which the large model then verifies together in a single pass.",
    d: "The draft model shares the tokenizer with the target and runs autoregressively for a few tokens per step. Its proposals are good when text is predictable, such as code or boilerplate, and poor on open-ended content. It occupies device memory and its own cache, and must be scheduled alongside the target. The benefit depends on the ratio of its cost to the target's and on how often its guesses are accepted. The hard part is that a draft trained on different data than the target accepts few proposals and yields no speedup.",
    k: ["Separate small model vs layers sharing the target's weights: a separate model is flexible and easy to swap, while shared weights save memory and align better with the target.", "Longer proposals vs shorter: longer proposals save more steps when accepted, but waste draft and verification work when an early token is rejected."],
    p: ["A draft with a different vocabulary or tokenization cannot be used, and a mismatch produces garbage proposals that all get rejected.", "At high batch sizes the extra draft cost outweighs the saving, making speculation slower than plain decoding."],
    v: "Measure tokens per second with and without the draft at low and high concurrency and confirm a gain at low load, with the output distribution identical, using a fixed-seed equality test on greedy decoding.",
    dep: ["acceptance-sampler","forward-executor","block-allocator"]
  },
  "self-speculation": {
    s: "Extra prediction heads attached to the target model that guess several future tokens from its own hidden state, avoiding a separate draft model.",
    d: "Small heads are trained to predict tokens two, three or more positions ahead from the same hidden state. At each step the main head gives the next token and the extra heads give candidates for the following ones, which are arranged as a tree and verified in the next step. This needs no second model, cache or tokenizer, but requires heads trained for the specific checkpoint. The difficulty is that quality depends on training and on the workload, and the verification step must handle a branching set of candidates.",
    k: ["Trained heads vs a separate draft model: heads need no extra memory for a model and share the cache, but must be trained for each target checkpoint.", "Fewer heads with high accuracy vs many with low: extra heads give deeper guesses, but each deeper guess is less likely to be accepted."],
    p: ["Heads trained on one fine-tune applied to another model variant lose accuracy and stop paying for themselves.", "Heads added without checking that sampling remains lossless change the output distribution."],
    v: "Run a benchmark with heads enabled and disabled and confirm the mean accepted tokens per step exceeds one by the expected margin, with greedy output identical between modes.",
    dep: ["tree-verification","acceptance-sampler","forward-executor"]
  },
  "prompt-lookup-drafting": {
    s: "Proposes next tokens by finding the recent text elsewhere in the prompt or earlier output and copying what followed it, with no model at all.",
    d: "When the last few generated tokens match an earlier span, the tokens that followed that span become the draft. This works well when output copies from input, as in summarization with quotations, code editing, retrieval answers and structured rewriting, and costs only a host or device string search. It adds no memory and no training. The hard part is that it helps only for copy-heavy tasks and does nothing for creative text, so it must be switched on per request type or adaptively.",
    k: ["Lookup drafting vs model drafting: lookup is free in memory and compute, but is useful for only some workloads.", "Long match requirement vs short: long matches give accurate proposals but fire rarely, while short matches fire often and are often wrong."],
    p: ["Searching long contexts on every step adds host cost that exceeds the gain.", "Enabled globally, it wastes verification work on workloads with no repeated spans."],
    v: "Run a document question task where answers quote the input and confirm a speedup with accepted-token statistics, then run an open creative task and confirm the controller backs off with no slowdown.",
    dep: ["tree-verification","acceptance-sampler","speculation-controller"]
  },
  "tree-verification": {
    s: "Checks several candidate continuations in one forward pass by arranging them as a tree and applying an attention mask that lets each candidate see only its own path.",
    d: "Instead of a single draft sequence, the engine can verify multiple branches, which raises the chance that one is accepted. Candidate tokens are appended as extra positions with positions and masks that reflect the tree structure, so one pass of the target computes scores for every node. The longest accepted path is kept, and the cache entries of rejected branches are discarded. The hard part is the custom attention mask, which most kernels do not support efficiently, and cache bookkeeping for tokens written then thrown away.",
    k: ["Tree of candidates vs single chain: trees raise accepted length per step, but cost extra verification arithmetic and custom masks.", "Write candidate keys into the real cache vs temporary buffers: writing directly is fast and needs rollback, while temporary buffers are clean but add a copy."],
    p: ["Rejected candidates left in the cache pollute later steps with keys from tokens that were never emitted.", "A mask bug lets a branch attend to a sibling, quietly changing probabilities and breaking losslessness."],
    v: "Verify a known tree against sequential evaluation of each path with the plain model and confirm the scores at every node match within tolerance.",
    dep: ["attention-backends","block-tables","forward-executor"]
  },
  "acceptance-sampler": {
    s: "Compares the large model's probabilities with the draft's for each proposed token, accepting or rejecting it so that the final output follows the target's distribution exactly.",
    d: "For each proposed token, the sampler draws a random number and accepts it with probability equal to the ratio of the target's to the draft's probability, capped at one. At the first rejection it resamples from a corrected distribution and discards the remaining proposals. If all are accepted, one extra token is sampled from the target. This keeps output statistically identical to normal sampling. The hard part is exact implementation: shared random streams, temperature and filtering must be applied identically to both distributions.",
    k: ["Exact rejection sampling vs approximate acceptance: exact keeps the output distribution unchanged, while approximate accepts more tokens at the cost of a distribution shift.", "Greedy matching vs probabilistic acceptance: greedy is simple and exact for temperature zero, but sampling modes need the full procedure."],
    p: ["Applying top-p to the target but not the draft breaks the probability ratio and biases output.", "Random numbers not tied to the request's seed make speculative output irreproducible."],
    v: "Sample ten thousand continuations of a fixed prompt with and without speculation and confirm the distributions of generated tokens agree under a statistical test, and greedy outputs are identical.",
    dep: ["sampling-strategies","seeded-randomness","logprobs"]
  },
  "speculation-controller": {
    s: "Decides per step and per request how many tokens to propose, or whether to speculate at all, based on measured acceptance and current load.",
    d: "Speculation helps when the device has spare arithmetic, as at low batch sizes, and hurts when it is saturated. The controller tracks acceptance rates per request or workload and the current batch size, then picks a proposal length, including zero. It can also pick among draft methods. Decisions must be cheap, since they are made every step. The difficulty is that benefit depends on load, so a setting that is best at night can be harmful at peak.",
    k: ["Adaptive proposal length vs fixed: adaptive follows workload and load, but adds a feedback loop that can oscillate.", "Decide per request vs per batch: per request matches content, while per batch simplifies kernel shapes and graphs."],
    p: ["Fixed proposal length tuned at low load reduces throughput at saturation.", "Acceptance statistics from short windows are noisy and cause constant flipping between modes."],
    v: "Sweep concurrency and confirm the controller reduces speculation as batch size grows, with aggregate throughput never falling below the no-speculation baseline by more than a small margin.",
    dep: ["queue-batch-metrics","draft-model","continuous-batching"]
  },
  "logits-processors": {
    s: "A pipeline of transformations on the raw scores before sampling: biases, penalties, constraint masks and custom hooks, applied per request.",
    d: "After the output head, each request's score vector passes through its processors in a defined order: add logit bias, apply repetition penalties, mask forbidden tokens, apply grammar masks, then scale by temperature. Requests in a batch have different settings, so processors operate on batched tensors with per-row parameters. Custom processors can be supplied by callers or operators. The hard part is cost and order: running an interpreted per-request loop at large batch makes processing as slow as the model, and order changes results.",
    k: ["Batched vectorized processors vs per-request functions: vectorized is fast, but supports only the built-in set, while per-request hooks are flexible and slow.", "Apply constraints before vs after temperature: before keeps constraint masks exact, and the order determines the final distribution."],
    p: ["Per-request host loops over a large vocabulary make sampling a bottleneck at high batch sizes.", "Processor order differing from the documented one changes outputs between versions without notice."],
    v: "Apply a bias, a penalty and a mask to a known score vector and confirm the result equals a reference implementation with the documented order, then time a batch of one thousand requests.",
    dep: ["embedding-and-head","penalties","token-mask-engine","sampling-strategies"]
  },
  "sampling-strategies": {
    s: "Turns processed scores into a chosen token using greedy selection or random draws shaped by temperature, top-k, top-p and minimum-probability cutoffs.",
    d: "Greedy takes the highest score. Otherwise scores are divided by temperature, converted to probabilities, truncated to the top k entries or the smallest set whose probability mass reaches p, renormalized and sampled. These steps run on the device over the whole batch with per-row parameters; sorting a large vocabulary is the main cost, so implementations avoid full sorts when possible. The hard part is consistency of semantics across implementations: the order of truncation and renormalization differs, and users expect the same setting to behave the same.",
    k: ["Full sort for top-p vs approximate selection: a full sort is exact but slow on a large vocabulary, while approximate methods are fast and slightly change behavior.", "Sample on the device vs on the host: device sampling avoids copying large score tensors, while host sampling is easier to extend."],
    p: ["Temperature of exactly zero divides by zero unless handled as greedy.", "Applying top-k and top-p in different orders than users expect gives surprising diversity differences."],
    v: "Sample a million tokens from a fixed score vector at several settings and confirm the empirical frequencies match the analytically computed truncated distribution within statistical error.",
    dep: ["logits-processors","seeded-randomness"]
  },
  "penalties": {
    s: "Adjust scores of tokens that already appeared in the prompt or output, to discourage repetition, or encourage new topics, and apply explicit caller biases.",
    d: "Repetition, frequency and presence penalties lower the scores of tokens seen before, by a multiplicative or additive amount that may scale with count. Logit bias lets callers add a fixed value to chosen tokens. The server keeps a per-request count of tokens seen, updated each step, which for long outputs is a large per-row structure. The hard part is semantics: libraries differ in whether the prompt counts, in the scale, and whether penalties act before or after temperature.",
    k: ["Count over prompt and output vs output only: including the prompt discourages echoing it, while output-only is gentler and matches many users' expectations.", "Dense per-request count arrays vs sparse structures: dense is fast and large for big vocabularies, while sparse saves memory and complicates kernels."],
    p: ["Penalizing common function words in code or structured output degrades correctness.", "Per-request count arrays at a large vocabulary multiply memory by batch size."],
    v: "Generate with and without a frequency penalty on a prompt that induces loops and confirm the penalized run has measurably lower repeated n-gram rate, and that its scores match a reference formula.",
    dep: ["logits-processors"]
  },
  "grammar-compiler": {
    s: "Translates a schema, regular expression or formal grammar into an automaton that says which tokens may legally come next in any partial output.",
    d: "A schema is converted to a grammar, then to a state machine over characters, and finally combined with the tokenizer's vocabulary so each state knows which tokens keep the output valid. Tokens can span several characters, so one token may take the automaton through several states. Compilation can be expensive for large or recursive schemas, so results are cached by schema. The hard part is the interaction between tokenization and grammar, as the model's preferred tokenization of valid text may not match what the automaton expects.",
    k: ["Precompile masks for all states vs compute lazily: precompiling makes each step fast but takes time and memory for large grammars, while lazy computation adds step-time cost on first visits.", "Context-free grammar support vs regular only: context-free handles nesting and recursion, but needs a pushdown parser and heavier masks."],
    p: ["Compiling a complex schema on the request path adds seconds to time to first token.", "A grammar that forbids the model's natural token sequences forces odd tokenization and degrades text quality."],
    v: "Compile a nested schema, generate one hundred outputs and parse each with a standard parser, confirming that all validate; also record compile time and confirm a repeat request hits the compile cache.",
    dep: ["tokenizer","model-config"]
  },
  "token-mask-engine": {
    s: "Applies the grammar automaton's allowed-token set to each step's scores, forbidding illegal tokens, and advances the automaton with the chosen token.",
    d: "At each step the engine looks up the current state's allowed set, as a bitmask over the vocabulary, and sets all other scores to negative infinity. After a token is sampled, it advances to the next state. Masks for the whole batch are assembled on the host or device and combined with other processors. With speculation, masks must be computed along each candidate path. The hard part is overhead: building masks on the host for every request each step can dominate a fast decode step.",
    k: ["Mask computed on the host per step vs cached bitmasks on the device: host computation is simple and flexible, while cached device masks make steps fast and consume memory.", "Mask before sampling vs reject and resample: masking is exact in one pass, while rejection is cheap when most tokens are valid but unbounded when few are."],
    p: ["Mask computation that is not overlapped with the device step adds its full latency to every token of constrained requests.", "An automaton with no allowed token, a dead end, produces an all-masked row and an invalid sample."],
    v: "Run constrained and unconstrained batches and confirm every constrained output parses, step time overhead is within a stated percentage, and a deliberately dead-end grammar fails with a clear error.",
    dep: ["grammar-compiler","logits-processors"]
  },
  "seeded-randomness": {
    s: "Gives each request its own reproducible random stream, so that a fixed seed yields the same output regardless of what else is in the batch.",
    d: "Sampling draws random numbers on the device. A single shared generator makes a request's output depend on its neighbors in the batch. Per-request generators, derived from the seed and the step index, remove that dependence. They must be preserved across preemption and handled consistently in speculation. The hard part is that identical random numbers do not guarantee identical tokens: floating-point differences from batch composition can still flip a close choice.",
    k: ["Per-request generators vs one batch-wide generator: per-request gives reproducibility under batching, while batch-wide is cheaper and ties outputs to scheduling.", "Counter-based random functions vs stateful generators: counter-based ones can be recomputed after preemption, and stateful ones are cheaper per draw."],
    p: ["Reproducibility claims fail once batch composition changes numeric results enough to flip a near-tie.", "Seed state lost across preemption makes a resumed request diverge."],
    v: "Run the same seeded request alone, in a small batch and in a large batch, and compare outputs; record the fraction of identical tokens and confirm identical text at temperature zero.",
    dep: ["sampling-strategies","numerics"]
  },
  "logprobs": {
    s: "Returns the log probability of chosen tokens and optionally the top alternatives at each position, for evaluation, confidence and debugging.",
    d: "After processing, the engine computes a normalized log-softmax over the vocabulary, picks out the sampled token's value and optionally the top few candidates, and attaches them to each streamed token. It can also score a supplied prompt, returning the probability of each prompt token, which supports evaluation. Which distribution is reported matters: before or after temperature, penalties and masks. The hard part is cost: normalizing and sorting the full vocabulary for every request every step is extra work and extra data to ship.",
    k: ["Report probabilities before processing vs after: before reflects the model itself, while after reflects what was actually sampled.", "Compute only on request vs always: on request avoids the cost for most traffic, but makes late debugging impossible."],
    p: ["Reporting top alternatives after masking hides the model's real preferences.", "Large top-k logprob requests across a big batch generate a bottleneck in device-to-host transfer."],
    v: "Score a fixed text and compare each reported token log probability with an independent reference computation, within numeric tolerance, and confirm probabilities of the full vocabulary sum to one.",
    dep: ["logits-processors","embedding-and-head"]
  },
  "stop-conditions": {
    s: "Rules that end generation: an end-of-sequence token, a length limit, stop strings, or a caller or policy signal, each reported as a distinct finish reason.",
    d: "After each token the engine checks whether the token is a stop token, whether the length limit is reached, and whether the recent text ends with a stop string. Stop strings can span tokens and, in streaming, partial matches must be held back so the client never sees part of a stop string. Finish reasons let callers distinguish natural ends from truncation. The hard part is stop strings: they interact with detokenization and need output delayed until safe to release.",
    k: ["Check stop strings on text vs token ids: text matching is general and works across tokens, while token matching is cheaper and misses strings with several tokenizations.", "Include or exclude the stop string in the output: excluding is what callers usually expect, but needs held-back buffering in streams."],
    p: ["Streaming a partial stop string to the client before realizing it completes leaks the stop text.", "Only a length limit set, so a model that never emits end-of-sequence generates to the maximum every time."],
    v: "Generate with a stop string that spans two tokens and confirm the stream never contains it, the finish reason is the stop reason, and the cache blocks are freed at that step.",
    dep: ["incremental-detokenizer","tokenizer"]
  },
  "beam-parallel-sampling": {
    s: "Generates several candidate outputs from one prompt, either independently or by tracking the highest-scoring partial sequences, sharing the prompt's cache.",
    d: "Parallel sampling creates n samples that diverge from a shared prompt, each with its own tail blocks. Beam search keeps the best few partial sequences by cumulative probability, expands each at every step and prunes; sequences that survive often share long prefixes, so copy-on-write holds the cache cost down. Beam search needs the full distribution at every step and reorders cache blocks as beams fork and die. The hard part is bookkeeping: beams change identity every step, and the scheduler must treat them as one request with many sequences.",
    k: ["Beam search vs independent samples: beam finds high-likelihood outputs for tasks like translation, while sampling gives diversity and costs less scheduling logic.", "Share prompt cache across samples vs duplicate: sharing saves memory proportional to n, and relies on copy-on-write being correct."],
    p: ["A large beam width multiplies decode batch size and cache use for one request, crowding out others.", "Length bias missing from beam scoring favors short outputs."],
    v: "Request n equals eight samples with different seeds and confirm each differs, total prompt prefill ran once, and cache use is far below eight copies of the prompt.",
    dep: ["copy-on-write","sampling-strategies","continuous-batching"]
  },
  "incremental-detokenizer": {
    s: "Converts newly generated token ids into text one step at a time, handling characters split across tokens so that no broken output is streamed.",
    d: "A token may be a fragment of a multi-byte character, and many tokenizers decide spacing from neighbors, so decoding a token alone gives wrong text. The detokenizer keeps a short window of recent tokens per request, decodes them together, and emits only the text that is stable, holding back any incomplete character. It runs on the host once per request per step, so cost grows with concurrency. The hard part is correctness at boundaries: invalid byte sequences, spaces and special tokens.",
    k: ["Decode a rolling window vs the whole output each step: a window keeps cost constant, while the whole output is simpler and gets slower as answers grow.", "Run in the engine process vs a separate worker: separate workers keep the loop free, at the cost of passing tokens across a process boundary."],
    p: ["Emitting a lone byte of a multi-byte character shows replacement symbols to the user.", "Whole-output decoding makes step cost grow quadratically for long generations."],
    v: "Stream a generation containing emoji, accented text and code and confirm the concatenated stream equals the one-shot decode of all tokens exactly, with no replacement characters at any prefix.",
    dep: ["tokenizer"]
  },
  "weight-fetcher": {
    s: "Downloads or maps model files from storage into local disk or memory, verifying integrity and caching them for later starts.",
    d: "Weights are large sets of files, fetched from object storage, a registry or a shared filesystem. The fetcher reads in parallel, checks hashes against a manifest, keeps a local cache keyed by content or version and exposes files for memory mapping. Credentials, bandwidth limits and partial downloads must be handled. The hard part is scale: many replicas fetching one multi-hundred-gigabyte model at the same moment saturate storage, so fetchers coordinate through caches or peer transfer.",
    k: ["Cache keyed by content hash vs by name and version: content hashes are never stale and need a manifest, while names are simple and can serve the wrong bytes after an overwrite.", "Download fully before loading vs stream into devices: full download is simple, while streaming overlaps transfer with loading and shortens startup."],
    p: ["A truncated file that passes an existence check loads partially and yields garbage output.", "Cache disk fills after several model versions and the node can no longer start new replicas."],
    v: "Corrupt one byte of a cached shard and confirm the fetcher detects the hash mismatch and refetches, then confirm a clean second start performs no network transfer.",
    dep: ["checkpoint-formats"]
  },
  "checkpoint-formats": {
    s: "The on-disk layout of weights: tensor names, shapes, dtypes and shard files, in a form that can be mapped directly into memory without executing code.",
    d: "Safe formats store a header listing each tensor's name, type, shape and byte range, followed by raw data, so files can be memory-mapped and read selectively. Large models are split into shards with an index naming which file holds each tensor. Some checkpoints are already quantized and carry scales and metadata. Formats that embed executable serialization are avoided for untrusted files. The hard part is naming: tensor names vary between model families and conversion versions, and loaders need mapping tables.",
    k: ["Memory-mappable raw tensor format vs general serialization: raw format is safe and fast to read, while general serialization stores arbitrary objects and can execute code on load.", "Few large shards vs many small: large shards reduce file count, and small shards let each device read only what it needs."],
    p: ["Loading a checkpoint in a format that runs code from an untrusted source gives the author control of the server.", "A tensor renamed between conversion tool versions is skipped, leaving a layer randomly initialized with no error."],
    v: "Load a checkpoint and assert every expected tensor was found exactly once with the right shape and dtype, then compare one forward pass against the producer's reference logits.",
    dep: []
  },
  "sharded-loader": {
    s: "Reads each device's slice of every weight tensor and places it in device memory, splitting tensors according to the parallel layout.",
    d: "With tensor parallelism, each device needs only a slice of each large matrix, so the loader reads just those byte ranges from the memory-mapped files, avoids a host copy of the whole model, and uploads straight to the device. Fused projections may need to be split or merged during loading. It can also quantize on the fly. Loading runs in parallel across devices and across files. The hard part is peak host memory and mismatched layouts between how weights were saved and how the server splits them.",
    k: ["Load pre-sharded checkpoints vs slice at load time: pre-sharded loads fastest but ties the files to one parallel degree, while slicing is flexible and reads more.", "Quantize at load time vs ship quantized checkpoints: load-time quantization simplifies distribution, but lengthens startup and needs the calibration inputs."],
    p: ["A shard layout that splits a fused matrix on the wrong axis produces plausible but wrong output.", "Reading the whole model into host memory on every worker exhausts RAM when many devices load together."],
    v: "Load at parallel degrees one, two and four, run the same prompt greedily, and confirm outputs agree within numeric tolerance, while peak host memory stays below a stated bound.",
    dep: ["checkpoint-formats","tensor-parallel","device-memory-manager","quantization-schemes"]
  },
  "model-config": {
    s: "Parses the model's configuration and maps its declared architecture to the engine's implementation, with checks that the checkpoint and engine support it.",
    d: "A configuration file lists layer counts, hidden sizes, head layout, activation, normalization type, position scheme, vocabulary size and special tokens. A registry maps the declared architecture to model code, and variants need arguments such as window size or expert count. The engine derives memory needs from it: cache bytes per token follow from layers, heads and precision. The hard part is breadth, since each new model family introduces small differences that need code or flags, and a wrong assumption fails silently.",
    k: ["Registry of explicit implementations vs generic loader from the configuration: explicit code is fast and checkable, while generic loaders support new models sooner at lower performance.", "Fail on unknown fields vs ignore: failing avoids silently dropping a feature, but blocks models with harmless extra fields."],
    p: ["Ignoring an unfamiliar configuration field, such as a different normalization epsilon, leaves output slightly off in ways that evaluations only reveal later.", "Computing cache size from a wrong head count misjudges capacity and leads to out-of-memory errors later."],
    v: "Load each supported architecture and compare layer shapes, parameter count and one forward pass of logits with the reference implementation, and confirm an unsupported architecture produces a clear error.",
    dep: ["checkpoint-formats"]
  },
  "quantization-schemes": {
    s: "Store weights, and sometimes activations, in fewer bits than the trained precision, shrinking memory and bandwidth so larger models fit and decode runs faster.",
    d: "Schemes differ in bit width, granularity and whether activations are also quantized. Weight-only quantization to four or eight bits cuts memory traffic, which dominates decode. Scales are stored per channel or per small group of weights to limit error. Activation quantization speeds arithmetic too but is harder because of outliers. Formats with floating-point low-precision types need hardware support. The hard part is quality: error accumulates differently across models and tasks, and aggressive widths hurt reasoning and long outputs more than short benchmarks show.",
    k: ["Weight-only vs weight-and-activation: weight-only gives memory and bandwidth savings with small quality loss, while both give arithmetic speedups with more risk.", "Per-channel vs fine group scales: finer groups preserve accuracy at low bit widths, and cost extra scale storage and kernel complexity."],
    p: ["A scheme with no kernel support on the deployed hardware saves memory but runs slower than full precision.", "Quality checked on one benchmark misses damage in code, math or non-English text."],
    v: "Evaluate the quantized and original models on a held-out task set including long generations, confirm the score drop is within the stated tolerance, and measure memory and tokens per second.",
    dep: ["calibration","low-precision-kernels","numerics"]
  },
  "calibration": {
    s: "The offline step that runs sample data through the model to choose scales and clipping ranges for quantization, ahead of serving.",
    d: "Calibration feeds a few hundred representative inputs, records activation ranges or weight sensitivities, and picks scales that minimize error, sometimes with iterative methods that adjust weights to compensate. Output is a new checkpoint with scales and metadata. It runs once per model and scheme, off the serving path, and its quality depends on the data used. The hard part is representativeness: calibrating on English prose and serving code or other languages gives scales that clip the real activations.",
    k: ["Simple min-max ranges vs error-minimizing methods: min-max is fast and robust to outliers poorly, while error-minimizing methods give better accuracy and take longer.", "Calibrate on general data vs on the deployment's own traffic: own traffic fits better but risks using private data and drifting from other uses."],
    p: ["A calibration set containing a few extreme examples inflates ranges and wastes most of the available precision.", "Calibrated checkpoints published without recording data and settings cannot be reproduced or audited."],
    v: "Calibrate with two different sample sets and confirm evaluation scores on a held-out domain mix are close, and that the produced checkpoint carries recorded settings and loads without warnings.",
    dep: ["quantization-schemes","forward-executor"]
  },
  "low-precision-kernels": {
    s: "Matrix multiplication routines that read packed low-bit weights, apply scales and accumulate at higher precision, turning memory savings into speed.",
    d: "At small batch sizes the matrix multiplication reads each weight once and does little arithmetic, so reading fewer bytes directly speeds it up. The kernel loads packed weights, unpacks them in registers, multiplies with activations and accumulates in wider precision. At larger batch sizes it is arithmetic-bound and the benefit shrinks or reverses. Kernels are specialized by bit width, group size and shape. The hard part is coverage: each combination needs a tuned kernel, and a missing one falls back to a slow path.",
    k: ["Dequantize in the kernel vs dequantize to full precision first: in-kernel keeps the bandwidth saving, while pre-dequantizing is simple and loses the speedup.", "One kernel for all batch sizes vs separate small and large batch kernels: separate kernels are each faster, and need dispatch logic and more code."],
    p: ["Using a small-batch kernel at large batch makes quantized serving slower than the unquantized baseline.", "Accumulating in low precision overflows or loses accuracy on large hidden sizes."],
    v: "Benchmark the kernel against full precision across batch sizes one to five hundred and confirm the expected crossover point, comparing output to a dequantize-then-multiply reference.",
    dep: ["kernel-library","numerics","quantization-schemes"]
  },
  "memory-profiling": {
    s: "A dry run at startup that measures peak device memory for the largest expected batch, so the rest can be given to the cache.",
    d: "After weights load, the engine runs a worst-case forward pass with the maximum batch size and token count, observes peak memory including activations and workspace, and subtracts that and a safety margin from total memory. What remains is divided into cache blocks. The result sets capacity, and therefore how many requests can run. The hard part is accuracy: allocator behavior, captured graphs, communication buffers and fragmentation all use memory that the profile may not see, so a profile that is too optimistic causes out-of-memory errors under load.",
    k: ["Reserve a generous safety margin vs a tight one: generous margins prevent crashes and strand capacity, while tight ones maximize cache and risk failures.", "Profile once at startup vs adapt at runtime: startup profiling is simple and predictable, and runtime adaptation handles changes but adds complexity."],
    p: ["Profiling before graph capture or communication setup leaves out their memory and causes late out-of-memory errors.", "Profiling with a small sequence length underestimates peak activations for long prompts."],
    v: "After startup, replay the largest allowed batch and a long-context request repeatedly for an hour and confirm no allocation failure occurs and reported free memory stays above the margin.",
    dep: ["device-memory-manager","forward-executor"]
  },
  "warmup": {
    s: "Runs representative requests before accepting traffic so that kernels are compiled, caches primed and graphs captured, avoiding slow first requests.",
    d: "On first use, kernels may be compiled just in time, autotuned or loaded, communication channels are created and allocator pools grow. Warmup exercises each batch shape and feature, such as the sampling path and long prompts, then marks the replica ready. It lengthens startup but removes multi-second delays from real users' first requests. The hard part is coverage: any path not exercised during warmup, such as an unusual shape, a grammar or an adapter, still pays its cost on the first real request.",
    k: ["Exhaustive warmup vs minimal: exhaustive removes surprises but makes startup and autoscaling slow, while minimal starts fast and shifts cost to users.", "Ship precompiled kernels vs compile at startup: precompiled starts faster, but must match hardware and library versions exactly."],
    p: ["Marking a replica ready before warmup finishes sends the first users into multi-second compile delays.", "Warmup traffic counted in metrics and billing distorts both."],
    v: "Start a replica, send the first real request of each supported type immediately after readiness, and confirm its latency is within a small factor of steady state.",
    dep: ["graph-capture","kernel-autotuning","forward-executor"]
  },
  "tensor-parallel": {
    s: "Splits each layer's matrices across devices so that every device computes part of every layer, with a reduction after each block.",
    d: "Attention heads and feed-forward columns are divided among devices. Each computes its share, and an all-reduce sums partial results after the attention and feed-forward blocks, twice per layer. This cuts per-device weight memory and per-token latency, and also splits the cache by heads. It needs very fast links, since communication happens inside every layer on the critical path. The hard part is scaling: beyond a node's high-speed interconnect, communication time overtakes the arithmetic saved.",
    k: ["Higher tensor degree vs more replicas: higher degree lowers latency and fits larger models, while replicas give better aggregate throughput.", "Split by heads vs by hidden dimension: head splitting avoids communication inside attention, and is limited by the number of heads."],
    p: ["Tensor parallelism across devices without a fast link makes decoding slower than a single device.", "A head count not divisible by the degree forces replication of cache or key-value heads."],
    v: "Measure step time at tensor degrees one, two, four and eight on one node and confirm latency falls as expected while outputs match the single-device reference within tolerance.",
    dep: ["collectives","interconnect-topology","worker-processes"]
  },
  "pipeline-parallel": {
    s: "Places consecutive groups of layers on different devices or nodes and passes activations between them, so models too large for one node still fit.",
    d: "Each stage holds a contiguous range of layers. Activations travel to the next stage after each micro-batch, and several micro-batches are in flight to keep stages busy. Communication is small and one-directional, so it tolerates slower links, making it suited to crossing node boundaries. It adds latency per token, because a token passes through every stage in series, and creates idle gaps called bubbles. The hard part is balance: stages with unequal work idle each other.",
    k: ["Pipeline across nodes vs tensor across nodes: pipeline needs far less bandwidth and adds latency, while tensor across slow links is bandwidth-bound.", "Many micro-batches vs few: more micro-batches shrink bubbles, and each runs a smaller, less efficient batch."],
    p: ["Uneven layer assignment, such as the head stage also holding the output matrix, leaves one stage as the bottleneck.", "A failure on any stage stalls the whole pipeline, widening the failure domain."],
    v: "Run with two and four stages across nodes and measure per-stage busy time; confirm utilization above a stated level at target concurrency and output equal to the single-stage run.",
    dep: ["interconnect-topology","control-channel","worker-processes"]
  },
  "expert-parallel": {
    s: "Distributes the experts of a sparse model across devices and sends each token to the devices holding its chosen experts.",
    d: "Each device holds a subset of experts. After routing, an all-to-all exchange sends tokens to their experts' devices, experts compute, and a second all-to-all returns results. This lets very large sparse models run with each device loading only a fraction of the weights. It is usually combined with tensor or data parallelism for the dense parts. The hard part is the load imbalance and the communication cost of two all-to-alls per layer, which grow with the number of devices.",
    k: ["Expert parallel vs tensor-splitting each expert: expert parallel keeps matrix sizes large and efficient, while tensor splitting balances load and communicates more.", "Wide expert parallelism across many nodes vs within one node: wide parallelism spreads weights thinner, and pays inter-node latency on every layer."],
    p: ["Skewed routing on a particular workload puts most tokens on a few devices, and the rest wait.", "A device failure removes experts that no other device holds, taking down every request."],
    v: "Log per-device token counts across a representative workload and confirm the step time is within a stated factor of the balanced ideal, with output matching a single-device run.",
    dep: ["collectives","moe-dispatch","interconnect-topology"]
  },
  "data-parallel": {
    s: "Runs independent copies of the model on separate device groups, each serving its own requests, to scale throughput linearly with hardware.",
    d: "Replicas share no state during serving, so scaling is simple and failure of one affects only its requests. With sparse models, replicas of the dense part may still coordinate so that expert devices see a combined batch, which requires synchronized steps even when some replicas are idle. A load balancer decides placement. The hard part is memory efficiency: every replica holds full weights, so many small replicas leave little room for cache compared to one larger group.",
    k: ["Many replicas vs one large parallel group: replicas have independent failures and simple scaling, while a large group leaves more memory for the cache and gives lower latency.", "Independent engines vs coordinated engines: independent is robust, while coordination is needed when sparse layers span replicas."],
    p: ["Coordinated replicas must step together, so an idle replica still does dummy work to keep others from blocking.", "Replicas with duplicated prefix caches split hit rate, unless routing is cache-aware."],
    v: "Double the replica count under proportional load and confirm total throughput roughly doubles with per-request latency unchanged within a small margin.",
    dep: ["load-balancer","worker-processes"]
  },
  "collectives": {
    s: "Group communication operations such as all-reduce, all-gather and all-to-all that combine or redistribute tensors across devices within a layer.",
    d: "A collective moves data among a group of devices according to a pattern. Libraries implement them with rings or trees that match the interconnect topology, and can fuse the reduction with computation on the device. Decode steps involve small messages, where latency, not bandwidth, dominates, so specialized low-latency variants are used. Collectives are synchronizing: every member must call them in the same order. The hard part is hangs, because one device that skips or reorders a call stalls all others with no error.",
    k: ["Ring vs tree algorithms: rings maximize bandwidth for large messages, while trees and one-shot variants cut latency for the small messages decode sends.", "Overlap communication with computation vs sequential: overlap hides communication, and complicates scheduling and memory use."],
    p: ["A mismatch in collective order across ranks causes a silent hang that looks like a slow request.", "Small-message latency is ignored in design, and tensor parallelism loses to its own communication."],
    v: "Benchmark all-reduce at decode-sized messages across the target group and confirm measured latency is within the stated bound, then run an end-to-end step with a timeout watchdog to prove hangs are detected.",
    dep: ["interconnect-topology","streams-events","driver-runtime"]
  },
  "interconnect-topology": {
    s: "The physical arrangement of links between devices, within and across nodes, which decides which parallel layouts are fast and which are not.",
    d: "Devices in one node usually share a high-bandwidth fabric, and nodes connect through a slower network, often with several adapters per node. Group placement should put communication-heavy groups, such as tensor-parallel ones, on the fastest links and use slower links only for light traffic. The runtime discovers the topology and selects algorithms. The hard part is that the topology is partly hidden behind virtualization and scheduling: a job can be given devices in different nodes or on mismatched links.",
    k: ["Topology-aware placement vs any free devices: aware placement keeps heavy groups on fast links, while any-devices scheduling improves cluster utilization and risks slow replicas.", "Dedicated network for cache transfer vs shared with collectives: dedicated avoids interference, and costs adapters."],
    p: ["A replica scheduled across a slow link boundary runs several times slower than its siblings and drags the tail.", "Misreported topology makes the library choose a poor algorithm with no visible warning."],
    v: "Run a pairwise bandwidth and latency test across all devices in a replica and confirm the measured matrix matches the expected topology, flagging any slow pair before serving begins.",
    dep: ["driver-runtime"]
  },
  "worker-processes": {
    s: "One process per device that holds its weights and cache shard and runs the step when told by the coordinator.",
    d: "Each worker initializes its device, joins communication groups, loads its weight slice and allocates its cache. For every step, workers receive the same scheduling decision, build their local inputs and execute. A coordinator drives them over a control channel, and one rank returns sampled tokens. Separate processes avoid interpreter contention and isolate device faults. The hard part is coordination at startup and shutdown: partial failures, ranks that disagree, and cleanup of device memory after a crash.",
    k: ["One process per device vs one process managing several devices: per-device processes scale and isolate faults, while a single process shares host memory and simplifies control.", "Workers decide locally vs the coordinator sends full inputs: sending full inputs is simple, and sending only the decision keeps messages small."],
    p: ["A worker that dies leaves its peers blocked in a collective waiting for it.", "Orphaned worker processes keep device memory after the engine crashes and block restart."],
    v: "Kill one worker during a request and confirm the coordinator detects it within the timeout, fails requests with a clear error, releases all devices, and restarts cleanly.",
    dep: ["control-channel","device-memory-manager","collectives"]
  },
  "control-channel": {
    s: "The messaging path by which the coordinator sends each step's plan to workers and collects results, designed for minimal latency per step.",
    d: "At every step, the plan, which requests run and with how many tokens, goes to all workers, and sampled tokens come back. Messages are small but frequent, so serialization and queue hops matter, and shared memory or direct device writes can replace sockets on one node. Across nodes, a network transport is used. Ordering is strict: workers must receive steps in order. The hard part is that overhead per step is multiplied by the step rate, so a few hundred microseconds of messaging is a visible throughput loss.",
    k: ["Broadcast the full plan vs workers compute it independently: broadcast keeps one source of truth, while independent computation removes messages and risks divergence.", "Sockets vs shared memory on one node: sockets are portable, and shared memory cuts per-step latency substantially."],
    p: ["Unbounded message queues between coordinator and workers hide a slow worker until memory runs out.", "Serialization of large objects each step, such as full block tables, makes control traffic the bottleneck."],
    v: "Measure round-trip time of an empty step across all workers and confirm it is below a stated fraction of the shortest real step time.",
    dep: ["worker-processes","engine-loop"]
  }
});
