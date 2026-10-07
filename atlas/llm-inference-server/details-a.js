// Details for the LLM inference server plate, part 1: client API, fleet control, observability.
ATLAS.details("llm-inference-server", {
  "http-endpoints": {
    s: "The network-facing routes that accept a prompt or a conversation and return generated text, either as one response or as a stream of increments.",
    d: "Requests arrive over HTTP as JSON bodies naming a model, the input and sampling options. The handler validates them, hands them to the engine through an asynchronous queue and returns either a complete body or a stream. Many servers copy a widely adopted request shape so existing client libraries work unchanged. The difficulty is that one connection stays open for seconds or minutes while the work is scheduled elsewhere, so disconnects, timeouts and slow readers must all be translated into engine-side actions.",
    k: ["Mimic an established request shape vs define a native one: client compatibility is immediate, but engine-specific features need extension fields that other servers ignore.", "One handler per route vs a single generic generate path: the generic path is easier to keep correct, but chat, completion and embedding semantics then leak into shared code."],
    p: ["Treating a closed connection as harmless leaves the engine generating tokens nobody will read, burning capacity.", "Silently ignoring unknown request fields makes a misspelled option look accepted while having no effect."],
    v: "Send a streaming request, close the client socket after the third token, and confirm the engine's running-request count drops within one scheduling step and the cache blocks are freed.",
    dep: ["request-validation","engine-loop","streaming-transport"]
  },
  "request-validation": {
    s: "Checks every request against model limits and server policy before it consumes any scheduler or cache resources, and rejects it with a precise error.",
    d: "Validation covers field types, ranges for sampling parameters, the tokenized prompt length against the context window, the requested output length, the schema of any structured-output request and the availability of a named adapter. It runs after tokenization because length limits are in tokens, not characters. The hard part is catching combinations that are individually legal but impossible: a prompt that fits the window yet leaves no room for the requested output, or a grammar that no token sequence can satisfy.",
    k: ["Reject early vs clamp silently: rejection is honest and debuggable, but clamping keeps naive clients working at the cost of surprising output lengths.", "Validate in the front end vs inside the engine: front-end checks protect the engine cheaply, but duplicated limits drift apart across layers."],
    p: ["A prompt accepted by validation but larger than total cache capacity waits in the queue forever.", "Validating character counts instead of tokens lets multi-byte text overshoot the context window."],
    v: "Submit a prompt exactly at the context limit with a nonzero output length and confirm a clear 4xx error naming both numbers, with no queue entry created and no cache blocks allocated.",
    dep: ["tokenizer","model-config"]
  },
  "chat-templates": {
    s: "Renders a list of role-tagged messages into the exact token sequence, including special markers, that the model was trained to expect.",
    d: "Chat models are trained on a specific layout: role markers, turn separators and sometimes a system preamble. The template is shipped with the model as a small program that takes messages, tool definitions and flags and emits text. It must be applied before tokenization, and special markers must be tokenized as single tokens, not as ordinary text. Errors are subtle: a missing separator or doubled start token does not crash, it merely degrades answer quality in ways that are hard to attribute.",
    k: ["Template shipped with the model vs hard-coded in the server: shipped templates track the model exactly, but executing them means running third-party logic inside the server.", "Server adds the generation prompt vs client does: server-side is safer for chat clients, while raw completion clients need an off switch."],
    p: ["Doubling the start-of-sequence token because both the template and the tokenizer add it quietly lowers accuracy.", "User text containing marker strings is tokenized as real control tokens, which lets callers forge roles."],
    v: "Render a fixed three-message conversation and compare the token ids byte for byte with a reference produced by the model's authors, including the trailing generation prompt.",
    dep: ["tokenizer","model-config"]
  },
  "tokenizer": {
    s: "Converts text to the integer token ids the model consumes, using the vocabulary and merge rules the model was trained with.",
    d: "Most tokenizers use subword units learned from training text: a byte-level vocabulary plus merge rules, or a statistical segmentation. The server loads the exact vocabulary shipped with the checkpoint and runs it on the host CPU for every request, so very long prompts can make tokenization a visible slice of time to first token. It also defines special tokens, the end-of-sequence marker and the padding behavior. Mismatched tokenizer and weights produce fluent nonsense with no error.",
    k: ["Tokenize in the API process vs in a separate pool: in-process is simplest, but long prompts block the event loop that also serves streams.", "Cache tokenization of repeated prefixes vs recompute: caching cuts CPU for templated prompts, but adds memory and invalidation when the vocabulary changes."],
    p: ["Using a tokenizer from a sibling model with a slightly different vocabulary shifts every id and corrupts output without error.", "Tokenizing a megabyte prompt on the event loop stalls every open stream for tens of milliseconds."],
    v: "Round-trip a corpus including emoji, mixed scripts and trailing whitespace through encode and decode and confirm exact text equality, then confirm special tokens map to their documented ids.",
    dep: ["model-config"]
  },
  "streaming-transport": {
    s: "Delivers tokens to the client as they are produced, as incremental events over a long-lived connection, with a clear end marker and error signaling.",
    d: "Each engine step yields at most a few tokens per request. The detokenizer turns them into text, and the transport frames them as server-sent events or a similar chunked stream. Backpressure matters: a slow client must not make the engine hold memory unboundedly, so per-stream buffers are bounded and slow streams are cancelled. Errors after the first byte cannot change the status code, so mid-stream failures need an in-band error event that clients know how to parse.",
    k: ["Event per token vs batching several tokens per event: per-token feels smoother, but at high concurrency the framing and syscall overhead becomes a measurable CPU cost.", "Cancel slow readers vs buffer indefinitely: cancellation protects the server, but flaky mobile clients lose generations they could have finished."],
    p: ["Reporting an error only through the HTTP status misses failures that occur after streaming began, leaving clients with silently truncated text.", "Intermediaries that buffer responses make a healthy stream look frozen until the end."],
    v: "Run a long generation through the production proxy path and confirm the first event reaches the client within one decode step of being produced, and that an injected mid-stream fault arrives as an error event.",
    dep: ["incremental-detokenizer","engine-loop"]
  },
  "tool-calling": {
    s: "Lets the model request calls to caller-defined functions: tool schemas go in, and structured call requests are parsed out of the generated text.",
    d: "Tool definitions are rendered into the prompt through the chat template. The model emits a call in a model-specific syntax, and a parser extracts the function name and arguments, in streaming mode as partial JSON arrives. The server returns them as structured fields and expects the result in a later message. Reliability depends on the model, so servers often combine this with constrained decoding to guarantee that arguments match the declared schema. Parsing a call incrementally, before the text is complete, is the hard part.",
    k: ["Parse free text after generation vs constrain decoding to the tool grammar: parsing works with any model, but constraining guarantees valid arguments at the price of grammar compile time and slightly altered distributions.", "One parser per model family vs a generic one: per-family parsers handle real quirks, but need updates for every new model."],
    p: ["Streaming partial arguments to a client before the full call is valid lets it execute half a command.", "A parser that silently falls back to plain text hides tool failures from the calling application."],
    v: "Give a model a two-tool schema and a prompt requiring one, stream the response, and confirm the reassembled arguments validate against the declared schema in every one of a hundred runs.",
    dep: ["chat-templates","grammar-compiler","structured-output-api","incremental-detokenizer"]
  },
  "structured-output-api": {
    s: "The request option that demands output matching a schema, grammar or pattern, and the error behavior when the demand cannot be met.",
    d: "Callers pass a schema or a grammar. The API layer validates it, translates it into the form the grammar compiler accepts and attaches it to the request. It also defines what happens on truncation: a length limit can cut a JSON value in half, so the contract must say whether the output is guaranteed to be complete or only well-formed up to the point of stopping. Unsupported schema features need a defined response, either rejection or a documented subset.",
    k: ["Strict guarantee vs best effort: strict output can be parsed without a repair step, but rejects schema features the grammar engine cannot express.", "Schema in the request vs a pre-registered schema id: ids let the compiled grammar be cached, but add a registration step and a versioning problem."],
    p: ["A length limit cuts the JSON mid-value, and the client trusts it because the request asked for a schema.", "Accepting a recursive schema that the compiler cannot bound makes compile time or mask size explode."],
    v: "Request a schema with nested optional fields at a small output limit and confirm the response either completes a valid document or reports truncation explicitly, never returning invalid JSON labeled as valid.",
    dep: ["grammar-compiler","request-validation"]
  },
  "multimodal-inputs": {
    s: "Accepts images, audio or video alongside text, fetches and decodes them safely, and converts them into embeddings the language model consumes.",
    d: "Media arrives as inline data or a URL. The server downloads it with size and time limits, decodes and resizes it, and passes it to an encoder that produces a variable number of embedding positions, which are spliced into the token sequence at placeholder tokens. The number of positions affects scheduling and cache size, so it must be known before admission. Hard problems include untrusted fetches, decoder cost on the host CPU, and caching encoder output for repeated images.",
    k: ["Fetch URLs server-side vs require inline data: server fetch is convenient, but opens request-forgery risks and adds network latency to the critical path.", "Cache encoder output by content hash vs recompute: caching helps repeated documents, but consumes memory and complicates prefix matching."],
    p: ["Fetching an arbitrary caller-supplied URL from inside the cluster exposes internal services.", "Decoding a very large image on the event loop delays every other request, and decompression bombs exhaust memory."],
    v: "Send the same image in ten requests and confirm the encoder runs once, then send an oversized and a malformed file and confirm both are rejected before reaching the device.",
    dep: ["multimodal-encoders","request-validation","tokenizer"]
  },
  "auth-and-quotas": {
    s: "Identifies the caller, checks their entitlement to a model, and enforces rate limits and token budgets, so that no single tenant can consume the whole fleet.",
    d: "Credentials map to a tenant with allowed models, a requests-per-minute limit and a tokens-per-minute limit. Because cost is in tokens and output length is unknown at admission, enforcement uses an estimate at the start and settles the true count at the end. Limits are kept in a shared store so every replica agrees. The difficult part is fairness under overload: a limit that is only checked at admission does nothing against a tenant whose long generations are already running.",
    k: ["Charge by estimated tokens upfront vs by actual tokens afterward: upfront protects capacity but can reject legitimate requests, while afterward is exact but allows bursts.", "Central limiter vs per-replica limits: central is accurate but adds a dependency on the hot path, while local limits are fast and drift apart."],
    p: ["Counting only prompt tokens lets a caller exhaust capacity with tiny prompts that request very long outputs.", "A limiter outage that fails open removes protection exactly when load is highest."],
    v: "Drive one tenant past its token-per-minute limit while another stays under it, and confirm the first receives rate-limit errors with retry hints while the second's latency does not change.",
    dep: ["priority-scheduling","admission-control"]
  },
  "embedding-endpoints": {
    s: "Routes that return vectors or relevance scores instead of generated text, reusing the same model runner without the decode loop.",
    d: "An embedding request runs one prefill pass and returns a pooled or last-token hidden state, optionally normalized. A scoring request returns a single number for a pair of texts. These requests have no decode phase, no streaming and no need for a long-lived cache, so they batch very differently from chat. Many deployments serve them from dedicated replicas. The hard part is that sharing an engine with generation lets large embedding batches delay interactive streams.",
    k: ["Same engine as generation vs dedicated replicas: sharing raises utilization, but bulk embedding jobs then damage chat latency.", "Return full-precision vectors vs reduced precision: smaller payloads reduce network cost, at some loss in retrieval quality."],
    p: ["Padding every input to the longest in a batch wastes most of the arithmetic on mixed-length documents.", "Embeddings from a different pooling or normalization setting than the index was built with silently degrade search."],
    v: "Embed a fixed set of sentences and confirm vectors match a reference implementation within a stated tolerance, and that cosine similarity ordering of a labeled pair set is unchanged.",
    dep: ["forward-executor","continuous-batching","tokenizer"]
  },
  "load-balancer": {
    s: "Spreads incoming requests across engine replicas using live load signals, so that no replica queues while another idles.",
    d: "Round-robin works poorly because request cost varies by orders of magnitude with prompt and output length. Better balancers track outstanding tokens, queue depth or cache usage per replica, reported through frequent health or metrics calls, and pick the least loaded. Long-lived streams make load sticky: once placed, a request stays until it finishes. The hard part is that the signal is always stale by the time it is acted on, which causes herd behavior toward whichever replica looked emptiest.",
    k: ["Least outstanding requests vs least outstanding tokens: counting requests is simple, but one huge prompt then looks identical to a short one.", "Power of two random choices vs full global view: sampling avoids herding and needs less state, at slightly worse balance."],
    p: ["Sending a burst to the replica that last reported low load overloads it before the next report arrives.", "Ignoring cache state sends similar prompts to different replicas and discards the benefit of prefix reuse."],
    v: "Replay a mixed short and long request trace against four replicas and confirm the spread of p95 queue time between replicas stays within a small fraction of the median, unlike round-robin on the same trace.",
    dep: ["replica-health","queue-batch-metrics"]
  },
  "cache-aware-routing": {
    s: "Sends a request to the replica most likely to already hold its prompt prefix in cache, trading perfect balance for avoided recomputation.",
    d: "The router keeps an approximate index of which prefixes each replica holds, built from hashes of token blocks that replicas report, or from a consistent hash of the conversation or system prompt. A request goes to the replica with the longest match unless that replica is too loaded. The difficulty is that the index lags reality because replicas evict continuously, and that strict affinity creates hot spots when one shared prefix is very popular.",
    k: ["Approximate index from replica reports vs deterministic hashing on session id: reports are accurate but add traffic, while hashing is stateless and loses affinity when replicas change.", "Strict affinity vs load-bounded affinity: strict maximizes hits, but one viral prompt pins all traffic to a single replica."],
    p: ["A stale index routes to a replica that evicted the prefix, paying both the miss and the imbalance.", "Autoscaling reshuffles the hash space and drops hit rate for minutes after every change."],
    v: "Replay a multi-turn conversation trace and confirm per-replica prefix hit rate is clearly higher than under random routing, while the maximum replica load stays under a stated multiple of the mean.",
    dep: ["load-balancer","prefix-cache","cache-metrics"]
  },
  "model-router": {
    s: "Maps the model name or alias in a request to a concrete deployment and version, and falls back or splits traffic according to policy.",
    d: "Callers name a logical model; the router resolves it to a pool of replicas serving a specific checkpoint, quantization and adapter set. It supports aliases that move over time, weighted splits for experiments and fallbacks when a pool is saturated or down. It must account for features: a long-context request can only go to pools configured for it. The difficulty is keeping outputs consistent for one conversation when routing changes between turns.",
    k: ["Alias that moves with releases vs pinned versions: aliases ease upgrades, but pinned versions are the only way to reproduce a past result.", "Fallback to a smaller model on overload vs return an error: fallback keeps availability, but changes quality without the caller knowing unless it is reported."],
    p: ["Silent fallback to a weaker model makes quality regress with no alert, since requests still succeed.", "Splitting a multi-turn conversation across versions produces inconsistent personas and breaks prefix reuse."],
    v: "Change an alias weight to ten percent and confirm within a minute that the fraction of requests served by the new version, read from response metadata, matches within sampling error.",
    dep: ["replica-health","rollout-and-canary"]
  },
  "admission-control": {
    s: "Decides whether a new request is accepted, queued or shed, based on current capacity, so that overload degrades into fast refusals rather than uniformly slow answers.",
    d: "Admission looks at queue depth, estimated waiting time, free cache capacity and the request's priority and size. Beyond a threshold it rejects with a retry hint, or accepts only higher classes. Queueing without limit hides overload: latency rises for everyone while throughput stays flat. Estimating wait is difficult because output length is unknown, so controllers use per-class averages or the caller's declared maximum.",
    k: ["Shed early at the gateway vs queue inside the engine: early shedding protects latency, but engines have the best view of true capacity.", "Reject by count vs by predicted wait: wait-based limits match user experience, but depend on a prediction that errs under shifting traffic."],
    p: ["An unbounded queue lets a short spike become minutes of latency long after the spike ends.", "Shedding without retry guidance causes clients to retry immediately and amplify the overload."],
    v: "Drive the server at twice its measured capacity and confirm that accepted requests keep near-baseline time to first token while the excess receives fast rejections with retry hints.",
    dep: ["request-queue","queue-batch-metrics","priority-scheduling"]
  },
  "autoscaler": {
    s: "Adds and removes replicas based on load signals such as queue depth, cache usage and token rate, within cost and capacity limits.",
    d: "CPU utilization is useless for accelerators, which stay busy while serving. Scalers watch queue time, cache occupancy or tokens per second against a target and compute a replica count. Scale-up is slow because a new replica must obtain a device, pull weights and warm up, so it needs prediction or headroom. Scale-down must drain streams first. Pools for different models or phases scale on different signals, and device availability is often the true limit.",
    k: ["Scale on queue time vs on utilization: queue time tracks user pain directly, but is a lagging signal that reacts after users already wait.", "Keep warm headroom vs scale to zero: headroom absorbs bursts, while scale to zero saves cost for rare models and accepts a long first request."],
    p: ["Scaling down kills replicas holding open streams, truncating answers mid-sentence.", "Oscillation: a scale-up that takes minutes to become ready is read as insufficient, so the scaler overshoots."],
    v: "Ramp synthetic load up by three times over five minutes and confirm replica count rises ahead of the point where queue time exceeds its target, then falls with no stream terminated early.",
    dep: ["queue-batch-metrics","cold-start-management","replica-health"]
  },
  "cold-start-management": {
    s: "Shortens the time from scheduling a new replica to its first served token, by caching weights near devices and overlapping loading with other startup work.",
    d: "A cold replica must start a process, acquire devices, read weights, build or load compiled kernels, profile memory and warm graphs. Weights dominate: reading hundreds of gigabytes from remote storage can take many minutes. Mitigations include node-local caches, peer-to-peer copy from running replicas, loading directly into device memory with parallel readers, and serving traffic on partially loaded models. The hard part is that each mitigation adds state that can be stale or inconsistent with the deployed version.",
    k: ["Pre-pull weights to every node vs pull on demand: pre-pulling makes starts fast, but consumes local disk for models that may never run.", "Copy weights from a running peer vs from object storage: peer copy is fast and spares storage bandwidth, but loads the peer's network during its own serving."],
    p: ["A node-local cache keyed only by model name serves stale weights after a checkpoint is replaced.", "Thirty replicas starting at once saturate storage bandwidth, so each takes thirty times longer."],
    v: "Start a replica on a node with and without the local cache and record time to first successful request in each case; confirm the cached start meets the stated target and serves a correct answer.",
    dep: ["weight-fetcher","warmup","sharded-loader"]
  },
  "disaggregated-pools": {
    s: "Separates replicas that only process prompts from replicas that only generate tokens, so each pool can be sized and tuned for its own bottleneck.",
    d: "Prefill is arithmetic-bound and bursty; decode is memory-bandwidth-bound and steady. Running them on the same devices makes each interfere with the other's latency. In a split deployment, a router sends the prompt to a prefill pool, which ships the resulting cache to a decode pool that streams the answer. Pool ratios follow the traffic mix of prompt to output length and must change as that mix changes. The cost is the transfer and the added failure modes.",
    k: ["Split pools vs mixed replicas with chunked prefill: split gives independent tuning and steadier decode latency, but needs fast cache transfer and complex coordination.", "Static pool ratio vs dynamic rebalancing: static is simple, but a shift to longer prompts leaves one pool idle and the other saturated."],
    p: ["Transfer bandwidth between pools becomes the new bottleneck and offsets the gain for short prompts.", "A decode replica failure loses a cache that was expensive to build, forcing a full recompute."],
    v: "Compare the same trace on split and mixed deployments and confirm p99 inter-token latency under prompt bursts improves on the split deployment, with the transfer time per request reported separately.",
    dep: ["prefill-decode-split","kv-transfer","load-balancer"]
  },
  "rollout-and-canary": {
    s: "Moves traffic to a new model or engine version gradually, comparing quality and latency against the old one before completing.",
    d: "A new version receives a small slice of traffic. Automated checks compare latency percentiles, error rates and output-quality signals, such as sampled evaluation scores, against the baseline, and either widen or roll back. Because models are not deterministic, quality regression needs statistical comparison or fixed evaluation sets. Rollouts take place at replica granularity and need session stickiness, so one conversation does not flip versions between turns.",
    k: ["Gradual percentage ramp vs blue-green swap: ramps catch problems with less exposure, while swaps are simpler and need double capacity.", "Automated quality gates vs manual review: automation is faster and consistent, but only detects regressions its metrics were designed to see."],
    p: ["A version that is faster because it silently truncates output passes latency checks and fails users.", "Rolling back the engine but not the cached state leaves caches written in an incompatible layout."],
    v: "Deploy a deliberately degraded build to one percent of traffic and confirm the quality gate halts the rollout and traffic returns to the old version within the documented time.",
    dep: ["model-router","replica-health","ttft-tracking"]
  },
  "replica-health": {
    s: "Detects replicas that are unready, wedged or faulty, removes them from rotation, and drains running streams before shutdown.",
    d: "Liveness only shows the process runs. Readiness must show that a real generation completes, because an engine can accept connections while its device is hung. Health checks combine process state, a periodic tiny generation, device error counters and step-time watchdogs. Draining stops new admissions and lets running requests finish within a deadline. The hard cases are partial failures: a device that is slow, not dead, makes one replica degrade the whole fleet's tail latency.",
    k: ["Synthetic generation probe vs passive metrics: probes catch wedged engines, but cost capacity and miss faults that only affect certain inputs.", "Fail fast and restart vs wait and retry: fast restart limits user impact, while repeated restarts of a sick node can loop forever."],
    p: ["A readiness probe that only checks the port keeps a hung replica in rotation indefinitely.", "Draining with no deadline lets one very long generation block a rollout."],
    v: "Freeze the engine loop on one replica without killing the process and confirm readiness fails within the probe interval, traffic shifts away, and open streams are either completed or reported as failed.",
    dep: ["device-health","engine-loop"]
  },
  "ttft-tracking": {
    s: "Measures the time from request arrival to the first generated token, split into queueing, tokenization, prefill and transfer, as a percentile distribution.",
    d: "Time to first token is what users perceive as responsiveness. It is recorded per request with phase timestamps taken at defined points: received, admitted, scheduled, prefill finished, first token emitted and first byte sent. Reporting percentiles by prompt length bucket is essential because prefill time scales with length, so one global figure mixes unrelated populations. The difficulty is agreeing where the clock starts, since gateway queueing and client network time are often excluded by one team and included by another.",
    k: ["Measure at the server vs at the client: server timing is precise and cheap, but misses network and proxy delay that users feel.", "Percentiles by prompt-length bucket vs one global figure: buckets show real behavior, but multiply the number of series and alerts."],
    p: ["Quoting a mean hides a tail that is several times worse and drives most complaints.", "Counting from scheduler admission instead of arrival hides queueing, which is where overload shows up first."],
    v: "Send requests with known prompt lengths at low load and confirm reported time to first token grows with length and matches an independent client-side stopwatch within a stated margin.",
    dep: ["request-tracing","chunked-prefill"]
  },
  "inter-token-latency": {
    s: "Measures the gap between successive streamed tokens for each request, which determines whether output reads smoothly or stutters.",
    d: "After the first token, users experience the pace of generation. Inter-token latency is recorded per step and per request and summarized as percentiles and as a worst gap. It rises when large prefill chunks share a step, when a preemption occurs, or when decode batches grow large. Because it is a property of the step, the scheduler's token budget directly trades it against throughput. The hard part is that smooth averages can hide rare multi-second stalls.",
    k: ["Report per-token percentiles vs per-request average pace: percentiles reveal stalls, while averages are easier to explain and set targets for.", "Measure at emission vs at client receipt: emission isolates the engine, but misses batching in the transport that users actually see."],
    p: ["Averaging pace across a whole answer hides a three-second pause in the middle.", "Counting only the engine step time ignores the detokenizer and transport delay on the same path."],
    v: "Inject a large prefill into a batch with active streams and confirm the metric shows a stall on exactly those steps, and that enabling chunked prefill reduces the worst gap.",
    dep: ["request-tracing","token-budget"]
  },
  "throughput-goodput": {
    s: "Counts tokens produced per second, and separately the portion of that work delivered within latency targets, since raw throughput can rise while users suffer.",
    d: "Throughput is output tokens per second per device or per fleet, often reported with input tokens separately. Goodput counts only requests that met their time-to-first-token and inter-token targets. A scheduler can maximize throughput by building enormous batches that blow every latency target, so goodput is the honest number. Normalizing by hardware allows comparison across configurations. The hard part is defining targets that fit the product, since chat, summarization and batch jobs need different ones.",
    k: ["Optimize raw throughput vs goodput under a latency service level: raw is easy to measure, but goodput reflects value delivered.", "Per-device vs per-fleet reporting: per-device exposes tuning quality, while per-fleet includes routing and idle capacity."],
    p: ["A benchmark at saturation reports high throughput that no latency-sensitive product can use.", "Counting padding or discarded speculative tokens as output inflates the figure."],
    v: "Sweep offered load and plot throughput and goodput together; confirm goodput peaks and then falls while raw throughput keeps rising, identifying the usable operating point.",
    dep: ["ttft-tracking","inter-token-latency"]
  },
  "queue-batch-metrics": {
    s: "Exposes live scheduler state: waiting and running request counts, batch size, tokens per step, preemptions and time spent queued.",
    d: "These are the signals that autoscalers, balancers and admission control consume. The engine records them every step in cheap counters and publishes them to a metrics endpoint. Queue wait time and the waiting count show saturation; batch size and tokens per step show how well the device is used; preemption counts show cache pressure. They are the first place to look when latency rises, and the difficulty is exporting them at high frequency without adding overhead to the step loop.",
    k: ["Per-step counters vs sampled gauges: counters lose nothing but cost a little on every step, while sampling is cheaper and can miss short spikes.", "Per-request labels vs aggregate only: labels allow attribution, but unbounded label values overwhelm the metrics store."],
    p: ["A gauge sampled every fifteen seconds misses a thirty-millisecond stall that users notice.", "Labeling metrics by request id creates millions of series and takes the monitoring system down."],
    v: "Create a deliberate queue by exceeding capacity and confirm the waiting count and queue time metrics rise within one scrape interval and fall back when load stops.",
    dep: ["request-queue","continuous-batching","preemption"]
  },
  "cache-metrics": {
    s: "Reports cache occupancy, hit rate on prefixes, evictions and fragmentation, which show whether memory or recomputation limits the server.",
    d: "Occupancy shows how close the cache is to the point of preemption. Prefix hit rate, in tokens served from cache over tokens requested, shows whether reuse is paying off. Eviction and offload rates show churn. Together they explain throughput: a low hit rate with high occupancy means the cache is full of useless entries. The difficulty is that hit rate depends strongly on traffic shape, so a good figure on one workload says nothing about another.",
    k: ["Hit rate in tokens vs in requests: token-weighted rate reflects compute saved, while request rate is simpler and overstates short prefixes.", "Report per tenant vs aggregate: per-tenant data explains routing and quota decisions, but raises metric cardinality."],
    p: ["Reading a high aggregate hit rate as healthy when one big tenant's templates cause all of it.", "Ignoring fragmentation: free blocks exist in total but cannot form the contiguous allocation needed."],
    v: "Send ten requests sharing a long prefix and confirm that the reported hit rate approaches ninety percent of the repeated tokens after the first request, matching the logged block reuse.",
    dep: ["prefix-cache","block-allocator","eviction-policy"]
  },
  "request-tracing": {
    s: "Follows one request through gateway, router, scheduler, runner and transport with timestamps, so that a slow answer can be explained after the fact.",
    d: "Each request carries an id across every hop. Spans record queue entry, admission, each scheduling step it joined, prefill and decode counts, cache hit length, preemptions, and finish reason. Since a request touches hundreds of steps, traces summarize them instead of making a span per step. Sampling keeps cost down but must retain slow and failed requests. The hard part is attributing time inside a shared batch: a step was slow for everyone, and no single request caused it.",
    k: ["Trace every request vs sample: full tracing explains any complaint, but costs storage and some per-step overhead.", "Per-step events vs summary spans: events can reconstruct stalls exactly, while summaries are compact but hide timing detail."],
    p: ["Head-based sampling drops the rare slow request that most needed a trace.", "Missing correlation ids at the gateway make engine traces impossible to match to customer reports."],
    v: "Pick a slow request from a load run and confirm its trace alone shows queue wait, cache hit length, number of preemptions and finish reason, summing to its measured total latency.",
    dep: ["engine-loop","http-endpoints"]
  },
  "request-logging": {
    s: "Records request metadata and optionally content for debugging and billing, with redaction, retention limits and access control for the sensitive text it contains.",
    d: "Prompts and outputs often hold personal or confidential data, so by default logs keep only metadata: ids, token counts, model, latency, finish reason and tenant. Content logging is opt-in, with field-level redaction, short retention and restricted access. Usage records for billing are written separately and durably. The hard part is that the debugging value of content is highest exactly when the data is most sensitive, and that crash dumps and error messages can leak prompts outside the controlled path.",
    k: ["Metadata only vs content with redaction: metadata is safe by default, but reproducing a bad answer then needs the caller to resend it.", "Sync durable usage records vs async best effort: synchronous writes make billing exact, but add a failure point to the request path."],
    p: ["An exception handler that prints the failing prompt sends customer data to a general log stream.", "Redaction by pattern misses identifiers in unusual formats, giving false assurance."],
    v: "Send a request containing a planted secret string and search all logs, traces and error outputs for it with content logging off; confirm it appears nowhere, while the usage record is present.",
    dep: ["auth-and-quotas","request-tracing"]
  },
  "benchmark-harness": {
    s: "Generates realistic request traffic against a deployment and reports latency and throughput, so that changes can be judged against numbers instead of impressions.",
    d: "A useful harness replays a recorded or modeled distribution of prompt lengths, output lengths, arrival times and shared prefixes, in open-loop form where arrivals do not wait for responses. Closed-loop tests with a fixed number of in-flight requests hide queueing. It records per-request phase timing and reports percentiles at several offered rates, producing a latency-versus-load curve. The hard part is realism: synthetic uniform prompts produce flattering results that production traffic does not match.",
    k: ["Open-loop arrivals vs closed-loop concurrency: open-loop exposes overload and queueing, while closed-loop is simpler and always looks stable.", "Replay production traces vs synthesize: traces are realistic but carry privacy duties, while synthetic data is shareable and tunable."],
    p: ["Using random prompts with no shared prefixes makes the cache look useless, and the opposite error makes it look miraculous.", "Measuring on an idle fleet with warm caches, then comparing to a cold production run."],
    v: "Run the harness at three offered rates against the same build twice and confirm repeated runs agree on p50 and p95 within a few percent, with a clear knee in the latency curve.",
    dep: ["ttft-tracking","throughput-goodput","http-endpoints"]
  }
});
