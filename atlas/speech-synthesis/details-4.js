// Details for the speech synthesis plate, part 4: streaming, inference serving, caching.
ATLAS.details("speech-synthesis", {
  "chunked-synthesis": {
    s: "Splits input into pieces that are synthesized and delivered one after another, so playback can begin before the whole text has been processed.",
    d: "The text is divided at sentence or phrase boundaries into chunks sized to balance first-audio latency against naturalness. Each chunk runs through the models and its audio is sent as soon as it is ready, while later chunks are still computing. The first chunk is often kept short and later ones longer. Context from earlier chunks, such as the speaker state and final pitch, carries forward so prosody continues. The difficulty is that every boundary is a place where pitch, rhythm and loudness can break, and that shorter chunks lose context the models use to sound natural.",
    k: ["Short first chunk, longer later ones vs uniform chunks: a short start cuts latency and risks an abrupt opening, uniform chunks are consistent and wait longer.", "Chunk at sentences vs at fixed durations: sentences keep intonation intact, fixed durations bound latency and cut speech mid-phrase."],
    p: ["A chunk boundary in the middle of a number or name restarts intonation in the middle of the item.", "Each chunk is synthesized with a slightly different loudness, giving audible steps."],
    v: "Synthesize a long text as one piece and as chunks, then compare. Listeners cannot reliably tell boundaries, pitch at joins is continuous, and the first byte arrives within the time budget.",
    dep: ["sentence-segmenter", "chunk-stitching", "acoustic-decoder"]
  },
  "incremental-text-input": {
    s: "Accepts text as it is produced, for example from a language model, and begins speaking before the full text exists, deciding when enough has arrived to say a piece.",
    d: "The client sends text fragments over a persistent connection, and a buffer accumulates them until a boundary such as a sentence end, a clause or a timeout. The synthesizer commits the stable part and holds back text that might still change meaning, like an unfinished number. Revisions and cancellation must be handled. A flush signal tells the system the stream is finished. The trade-off is between speaking early and speaking well: longer buffering gives the models context, but conversational use cannot wait for it.",
    k: ["Wait for a sentence boundary vs speak at clause or token count: sentence boundaries sound best and add delay, earlier commits cut latency and risk odd intonation.", "Allow retraction of sent text vs append-only: retraction supports corrections and complicates audio already played, append-only is simple and rigid."],
    p: ["A number arriving digit by digit is spoken as soon as the first digits arrive and read wrong.", "No flush at the end leaves the final words stuck in the buffer, never spoken."],
    v: "Stream a text token by token with realistic delays and compare audio to the same text sent whole. Time to first audio is within the budget, and word-level content is identical with no cut-off or duplicated words.",
    dep: ["sentence-segmenter", "streaming-transport", "lookahead-buffer"]
  },
  "lookahead-buffer": {
    s: "The amount of upcoming text or frames the models see before committing audio, trading naturalness (more context) against delay (less).",
    d: "Prosody and some acoustic decisions depend on what comes next, such as whether a phrase ends in a question. A lookahead window holds a few words or frames before output. Convolutional layers and vocoders also need future frames to produce the current samples, so streaming variants use limited right context. The window size is a tuned parameter per component and the delays add up across the pipeline. It is hard because the dependencies are scattered across stages and each stage's lookahead is easy to forget when computing total latency.",
    k: ["Larger lookahead for quality vs minimal lookahead for latency: larger windows sound smoother and delay audio, minimal windows are responsive and produce small glitches.", "Per-stage lookahead tuned separately vs one global budget: separate tuning gets the best of each stage, a budget is easier to reason about."],
    p: ["Latency numbers measured per stage omit the lookahead, so end-to-end latency is higher than predicted.", "Training with full context and inferring with limited context causes artifacts at every chunk edge."],
    v: "Measure the delay from the last input character needed to the first affected output sample for each stage, sum them, and compare to measured end-to-end latency. They agree within a frame or two.",
    dep: ["chunked-synthesis", "neural-vocoder"]
  },
  "first-audio-latency": {
    s: "The time from receiving a request to emitting the first playable audio, the figure that users feel as responsiveness in voice conversations.",
    d: "It is the sum of network and queue wait, front-end processing, the first chunk's acoustic generation, vocoding, encoding and delivery. Interactive products set targets in the low hundreds of milliseconds. Teams measure it as a distribution, not an average, because the slow tail dominates experience. Reducing it involves warm models, short first chunks, small batches, early flushes of the encoder and keeping connections open. Cold starts, long first sentences and busy accelerators cause the worst cases and have to be handled at the system level.",
    k: ["Optimize the median vs the tail: median improvements look good on dashboards, tail improvements are what users feel and cost headroom.", "Spend capacity to keep batches small vs maximize throughput: small batches cut latency and cost more per second of audio."],
    p: ["Reporting average latency hides a slow tail that makes one request in twenty feel broken.", "A long first sentence is synthesized whole before any audio is sent."],
    v: "Record time to first audio at the client for thousands of requests of varied length under realistic load, and report percentiles. The 95th and 99th percentiles meet their targets, including after a cold start.",
    dep: ["chunked-synthesis", "request-router", "dynamic-batching", "streaming-transport"]
  },
  "playback-buffering": {
    s: "Holds a small queue of audio on the client or edge so that variable generation and network delays do not become gaps, while keeping added delay low.",
    d: "Synthesis in real time delivers audio at about the speed it plays, so there is little slack. A buffer of a few hundred milliseconds absorbs jitter. The player starts when enough is queued, and if the queue empties it either pauses and rebuffers or inserts silence. Faster-than-real-time generation lets the server send ahead, giving the client headroom. Adaptive buffers grow after underruns. The tension is that every millisecond of buffer is latency, and an underrun in the middle of a word is far more disruptive than a slightly late start.",
    k: ["Large buffer for smooth audio vs small buffer for responsiveness: large buffers survive jitter and add noticeable lag, small ones are fast and stutter.", "Pace the server at real time vs send ahead as fast as possible: pacing saves wasted work if the user interrupts, sending ahead builds buffer and wastes compute on cancelled speech."],
    p: ["A fixed buffer tuned on a fast network stutters on mobile connections.", "The server generates the entire reply instantly, and the user's interruption leaves minutes of audio queued that must be flushed."],
    v: "Play streams over a network with injected jitter and loss and count underruns and added delay. Underruns stay under the target while added buffer delay stays within the budget.",
    dep: ["streaming-transport", "client-players"]
  },
  "barge-in": {
    s: "Handles the listener interrupting: stopping synthesis and playback quickly, discarding queued audio and reporting how much was actually heard.",
    d: "On interruption the client stops playback and sends a cancel. The server aborts in-flight generation, releases accelerator resources and drops queued chunks. The system needs to know the position at which playback stopped, so a dialogue manager can record what the user heard and not what was sent. Stop must be fast and click-free: a short fade avoids a pop. Cancellation has to cross every stage, including batching queues and the vocoder, which are usually built to finish what they started.",
    k: ["Hard cut vs short fade-out: a cut is immediate and clicks, a fade of tens of milliseconds sounds clean and delays stop slightly.", "Cancel work immediately vs let the batch finish: immediate cancel frees capacity and needs support in every stage, letting it finish is simple and wastes compute."],
    p: ["The server continues generating and billing for speech after the client has stopped.", "The conversation record contains the whole reply though the user heard only the first sentence."],
    v: "Interrupt a long reply at random points. Playback stops within the target time with no click, server work stops, and the heard-position report matches the audio actually played to within one chunk.",
    dep: ["streaming-transport", "playback-buffering", "request-router"]
  },
  "chunk-stitching": {
    s: "Joins separately generated audio pieces into continuous speech by controlling boundaries, overlap, pause length and level so the seams are not heard.",
    d: "Adjacent chunks may be generated independently, so their boundaries are made compatible by carrying state forward, by overlapping a few frames and crossfading, or by generating with shared context. Silence at the edges is trimmed and replaced by a pause of controlled duration. Level is matched. For vocoders with receptive fields, the overlap region is generated twice so edge samples are correct. Errors show up as clicks, level jumps or inconsistent room tone. Cached clips need the same treatment when joined to live-generated speech.",
    k: ["Overlap and crossfade vs generate with carried state: crossfade is simple and works across any sources, carried state gives exact continuity and only works within one model.", "Fixed pause between chunks vs predicted pause: fixed is predictable, predicted follows the text and varies."],
    p: ["Trimmed silence leaves no room at a seam, so words run together.", "A cached clip at a different loudness joined to live speech makes a clear jump."],
    v: "Synthesize passages in chunks and inspect seams by spectrogram and blind listening. Waveform is continuous, no clicks are detected, and level difference across seams stays under a small threshold.",
    dep: ["loudness-normalization", "postfilter-denoise"]
  },
  "streaming-transport": {
    s: "The network protocol that carries text in and audio out for interactive use, with ordering, flow control, cancellation and connection reuse.",
    d: "Common choices are a persistent bidirectional socket, a chunked HTTP response, or a real-time media transport. A message framing carries audio chunks and events such as marks, timing and end-of-stream, plus control messages like flush and cancel. Flow control prevents the server from outrunning a slow client. Connection setup cost is significant for short requests, so connections are reused. The problems are proxies that buffer responses and defeat streaming, retries that must not duplicate audio, and different timeouts between client, load balancer and server.",
    k: ["Bidirectional socket vs request-response streaming: a socket supports incremental text and cancellation, plain streaming is simpler to deploy and one-directional.", "Raw audio frames vs a media transport with loss concealment: frames are simple and reliable, media transport tolerates loss and adds protocol complexity."],
    p: ["An intermediate proxy buffers the whole response, so the stream arrives all at once at the end.", "A reconnect replays chunks the client already played."],
    v: "Stream through the production path with a deliberately slow client, a dropped connection and a cancel message. Chunks arrive in order as produced, backpressure slows the server, and the cancel stops generation.",
    dep: ["tts-api", "request-router"]
  },
  "request-router": {
    s: "Receives requests and sends each to a suitable worker based on voice, language, model version, load and priority, keeping queues short and spreading failures.",
    d: "The router knows which workers hold which voice models, how loaded each is, and which regions are healthy. It prefers a worker that already has the voice in memory, applies priority between interactive and batch traffic, enforces timeouts and retries idempotent work elsewhere. Sticky routing keeps one stream on one worker. Admission control rejects work when it cannot meet its deadline. It is hard because the best placement depends on model memory residency, which changes slowly and expensively, while load changes in milliseconds.",
    k: ["Route to a worker that has the voice loaded vs to the least loaded worker: residency avoids load delays and can unbalance load, least loaded balances and triggers cold loads.", "Reject early under overload vs queue and risk timeouts: rejecting protects latency for admitted requests, queueing serves more and violates deadlines."],
    p: ["A retry of a streaming request sends a second copy to another worker and doubles the audio.", "One popular voice concentrates on the few workers holding it while others idle."],
    v: "Replay a traffic mix with skewed voice popularity and a worker failure. Interactive latency percentiles hold, no request is processed twice, and the router's view of loaded voices matches workers' actual state.",
    dep: ["accelerator-pool", "dynamic-batching", "voice-registry"]
  },
  "dynamic-batching": {
    s: "Groups requests that arrive close together into one accelerator run, trading a short wait for much higher throughput per second of audio generated.",
    d: "Accelerators are efficient on large batches and idle on small ones. The scheduler collects work for a few milliseconds or until a size limit, pads or sorts sequences by length, and runs them together. For autoregressive models it batches at each generation step, adding and removing sequences as they finish, which keeps the device busy despite varied lengths. Streaming requests need steady per-step service. The tension is latency fairness: a request must not wait for a batch to fill, and one long request must not delay short ones.",
    k: ["Wait a few milliseconds to fill batches vs run immediately: waiting raises throughput and adds latency, immediate runs waste capacity.", "Batch similar lengths together vs first come first served: sorting reduces padding waste and reorders arrivals, FIFO is fair and inefficient."],
    p: ["A tail of long sequences holds a whole batch while short ones are done.", "Batch size tuned for peak load makes quiet periods slower than necessary."],
    v: "Run load at several concurrency levels and plot throughput against latency percentiles. Batching increases throughput several times at moderate load without exceeding the interactive latency target.",
    dep: ["model-runtime", "accelerator-pool"]
  },
  "model-runtime": {
    s: "The execution engine and kernels that run the neural networks on the accelerator or CPU, managing memory, precision, caches and operator implementations.",
    d: "A runtime loads model weights, plans memory, and executes operators with optimized kernels. For sequence models it keeps attention key and value caches so each new token costs a constant amount. Operators are fused, and graphs are compiled for fixed shapes where possible. Dynamic input lengths complicate compilation. A speech pipeline has several models with different needs, and they must share device memory. Numerical differences between runtimes can change audio slightly, so changing the engine is a model change from the listener's view.",
    k: ["General-purpose runtime vs custom kernels for the hot models: general is portable and slower, custom reaches real-time with maintenance cost.", "Static shapes with padding vs dynamic shapes: static allows aggressive compilation and wastes compute, dynamic is flexible and slower."],
    p: ["A new runtime version produces slightly different audio and invalidates cached output and regression baselines.", "Key and value caches grow with long inputs and exhaust accelerator memory."],
    v: "Run a fixed set of inputs on the new and old runtime and compare spectrograms and listening scores. Differences are within the stated tolerance, memory stays bounded on the longest allowed input, and speed meets the target.",
    dep: ["quantization-compilation", "acoustic-decoder", "neural-vocoder"]
  },
  "quantization-compilation": {
    s: "Reduces model size and compute by lowering numeric precision and compiling the network into a faster form, with checks that audio quality stays acceptable.",
    d: "Weights and activations move from high precision to half precision or to small integers, sometimes with calibration data to set scales. Sensitive layers stay at higher precision. Compilation fuses operators and tunes for the target device. Speech is less forgiving than classification: small numeric errors in a vocoder or in an autoregressive loop accumulate into audible noise, instability or changed timing. Each reduction must be evaluated by listening and by metrics, per voice and per language, since the damage varies.",
    k: ["Lower precision for speed vs full precision for fidelity: lower precision gives large speed and memory gains and risks artifacts, full precision is safe and costly.", "Post-training quantization vs training aware of quantization: post-training is quick and loses more, aware training is accurate and expensive."],
    p: ["Quantization looks fine on average metrics and breaks a rare voice or language.", "Calibration on a narrow set of text gives scale values that clip in other domains."],
    v: "Compare quantized and baseline output on a regression corpus across all voices by blind listening and word error. No voice drops beyond the tolerance, and size and speed improvements are measured on the target hardware.",
    dep: ["training-pipeline", "regression-corpus"]
  },
  "accelerator-pool": {
    s: "The fleet of accelerators and the autoscaling that matches it to demand, including model placement, memory use, warm capacity and the cost of idle devices.",
    d: "Workers run on accelerators with limited memory, so each can hold only some voice models. Pools are sized for peak interactive load plus batch headroom. Autoscaling reacts to queue depth and latency, but model loading takes seconds to minutes, so scale-up lags demand and a warm reserve is kept. Placement decides which voices share a device. Spot or lower-priority capacity serves batch work. Cost is dominated by idle capacity during troughs, while every cold start is felt by users as a slow first request.",
    k: ["Keep warm capacity for spikes vs scale to demand: warm capacity protects latency and costs while idle, scaling saves money and risks slow starts.", "Dedicated pools per voice tier vs shared pool: dedicated pools isolate latency-critical traffic with lower utilization, shared pools pack better and let batch hurt interactive."],
    p: ["Autoscaling reacts to a spike after it has passed, and new workers are loading models when load drops.", "A rarely used voice is evicted and its next request waits for a load."],
    v: "Replay a day of traffic with a sudden spike in a staging fleet. Interactive latency percentiles hold during the spike, scale-up completes within the planned time, and utilization stays above its target in steady state.",
    dep: ["model-loading", "model-runtime"]
  },
  "graceful-degradation": {
    s: "Keeps the service answering under overload or failure by falling back to a cheaper model, a cached or shorter response, or a controlled refusal.",
    d: "When capacity is short, policies choose what to shed first: batch jobs, low-tier accounts, premium styles. A fallback path may use a smaller vocoder, a faster model or fewer sampling steps, at lower quality. For model failure on a request, retry with a simpler configuration or a different worker. Clear errors let clients back off. The danger is silent degradation: audio quality drops and nobody is told, and a fallback voice that sounds different from the requested one is worse for some products than a delay.",
    k: ["Degrade quality vs reject requests: degrading keeps service up and changes what users hear, rejecting keeps quality and fails some calls.", "Fallback to a different voice vs fail: a different voice keeps conversations going and breaks brand identity, failing is correct and disruptive."],
    p: ["Fallback quietly serves a lower-quality model, and the regression is found weeks later in complaints.", "Load shedding drops the highest-value interactive traffic because the policy only looks at queue order."],
    v: "Induce overload and worker failures in a test fleet. Each shed or fallback event is logged and counted, interactive traffic keeps its latency target, and audio served in fallback mode scores within the declared quality range.",
    dep: ["request-router", "quality-monitoring", "accelerator-pool"]
  },
  "on-device-synthesis": {
    s: "Runs the whole pipeline on the user's device, offline and with no network latency, using compact models, limited memory and the device's power budget.",
    d: "The device ships smaller models, often quantized and distilled, a compact lexicon and a lightweight front end. It must meet real-time on mobile processors and neural accelerators within a memory cap and without heating or draining the battery. Voices are fewer and lower in quality than the hosted ones. Updates arrive by app or OS releases. The benefits are privacy, offline use and zero marginal serving cost, and the constraints are the model size, no centralized monitoring and a long tail of device capabilities.",
    k: ["Fully on-device vs hybrid with a fallback to the cloud: on-device is private and always available, hybrid gives better voices when online and adds routing complexity.", "One model for all devices vs tiered models: one is simple and wastes high-end devices, tiers fit each device and multiply testing."],
    p: ["A model that meets real-time on a test phone stutters on an older, thermally throttled one.", "Device models lag the hosted ones for months, so the same text sounds different across surfaces."],
    v: "Run the pipeline on the lowest supported device through a long session. Real-time factor stays under target, memory and temperature remain within limits, and offline output is intelligible by round-trip recognition.",
    dep: ["quantization-compilation", "vocoder-distillation", "pronunciation-dictionary"]
  },
  "audio-cache": {
    s: "Stores generated audio keyed by what produced it, so repeated requests are answered without running the models.",
    d: "Before synthesis, the router computes a key from the normalized text, voice, model version, style and output settings, and looks it up. A hit returns stored audio, while a miss synthesizes and stores. Caches live in memory near the workers and in shared storage, with eviction by recency and size. Fixed prompts, menus and notifications hit constantly, and generated or personalized text rarely does. The value is large for latency and cost, and the danger is serving stale or wrong audio, so the key must contain everything that changes the sound.",
    k: ["Cache full responses vs cache per sentence: full responses are simple and rarely repeat, sentence-level caching hits more and needs stitching.", "Cache everything vs only designated content: everything is easy and fills storage with unrepeated audio, designated content keeps hit rates high and needs rules."],
    p: ["A key without the model version serves audio from a retired voice after an upgrade.", "Caching personalized text keeps personal data in audio storage beyond its allowed lifetime."],
    v: "Issue identical requests repeatedly and confirm a hit returns byte-identical audio in a fraction of the latency. Change the voice, style or model version and confirm each causes a miss.",
    dep: ["cache-keys", "storage-cdn", "cache-invalidation"]
  },
  "cache-keys": {
    s: "The definition of what makes two requests identical: which fields, in what normalized form, and how they are hashed to find stored audio.",
    d: "A key includes the normalized text or its markup, voice and version, language, style settings, rate and pitch controls, lexicon identifiers and their versions, sample rate and format. Text is normalized first so equivalent inputs share entries. Fields that do not affect sound, such as request IDs, are excluded. Randomness is a problem: if sampling varies the audio, a cache turns variable output into fixed output, which may be desirable. Mistakes are asymmetric: leaving out a field serves wrong audio, adding extra fields lowers the hit rate.",
    k: ["Key on raw text vs normalized text: raw is cheap and misses equivalent variants, normalized hits more and depends on the front end version.", "Include the user's lexicon contents vs its version id: contents are exact and costly, ids are small and require versions to be immutable."],
    p: ["Two lexicons with the same name but different contents share cache entries.", "A new normalization rule changes the words spoken but not the key, so old audio is served."],
    v: "For each input field, vary it alone and confirm the key changes if and only if the audio changes. Differences in unrelated fields such as request id leave the key unchanged.",
    dep: ["frontend-cache", "model-versioning"]
  },
  "phrase-library": {
    s: "A set of fixed phrases rendered ahead of time, or recorded by a voice talent, and played directly with live synthesis used only for the variable parts.",
    d: "Systems with a limited script, such as prompts, confirmations and announcements, pre-render each phrase at the best quality and store it, sometimes with careful manual review. Phrases with slots, like a time or a name, are built from stored lead-in and live-synthesized fill-ins, with boundary matching so they join naturally. The library removes latency and cost and gives exact control. Maintenance is the cost: each voice, language or model change requires re-rendering and re-approval, and concatenation with live speech can sound uneven.",
    k: ["Pre-render at best quality vs synthesize live: pre-rendered phrases are fast, consistent and reviewed, live is flexible and unpredictable.", "Slot filling by concatenation vs rendering the whole sentence: concatenation reuses audio and risks seams, whole rendering is natural and not reusable."],
    p: ["A script edit is deployed without re-rendering, so the audio says the old text.", "Slot values are rendered in a different style than the lead-in, and the join is obvious."],
    v: "Compare each library entry's stored text to the live script and flag mismatches. Play assembled phrases with slots and confirm blind listeners rate seams as acceptable and loudness consistent.",
    dep: ["audio-cache", "chunk-stitching", "regression-corpus"]
  },
  "frontend-cache": {
    s: "Stores the results of the text front end, such as normalized text and predicted phonemes, so repeated words and sentences skip those steps.",
    d: "Normalization and g2p are cheap compared with acoustic generation, but at high volume and for rare-word models they add up, and the same unknown words recur. Entries are keyed by the input string plus language, locale and the versions of dictionary, lexicon and models. Phoneme predictions for single words are cached across all requests. Because outputs affect what is said, cache correctness depends on version keys. Caching mistaken predictions makes errors sticky, so a way to flush a word after a fix is required.",
    k: ["Cache per word vs per sentence: per word shares widely and loses context effects, per sentence is exact and rarely repeats.", "Long lifetimes vs short: long lifetimes save compute and keep stale errors, short lifetimes self-heal and recompute."],
    p: ["A corrected dictionary entry has no effect because the old prediction is cached.", "Cached results are shared across accounts that have different lexicons."],
    v: "Fix a pronunciation, bump the dictionary version and confirm the next request uses the new phonemes while unrelated entries stay cached. Cache hit ratios and correctness are logged and compared with an uncached run.",
    dep: ["g2p-model", "token-classifier", "cache-keys"]
  },
  "cache-invalidation": {
    s: "The rules and mechanisms that remove or ignore stored audio when voices, models, lexicons, normalization or consent change.",
    d: "Version fields in the key make old entries unreachable when a model or lexicon changes, and expiry reclaims their space. Explicit invalidation is needed for events that should remove content: a voice withdrawn for consent reasons, a bug in a pre-rendered phrase, or a legal request. Invalidation must reach every layer: local memory, shared stores and edge caches at a CDN. Consent revocation turns invalidation into a compliance requirement with deadlines. The problem is knowing which entries depend on what, which means recording lineage with each stored audio.",
    k: ["Version-in-key invalidation vs active purge: version keys are simple and leave garbage until expiry, active purge frees space and needs an index of dependents.", "Short time-to-live everywhere vs targeted invalidation: short lifetimes are robust and lower hit rates, targeted invalidation keeps hits and needs correct dependencies."],
    p: ["An edge cache keeps serving audio of a withdrawn voice for days.", "A pronunciation fix is deployed and old audio keeps playing because only the new key is used by some clients."],
    v: "Withdraw a test voice and request its cached audio from every layer, including the CDN. Within the stated deadline all layers refuse or miss, and the purge log lists every removed object.",
    dep: ["audio-cache", "consent-records", "storage-cdn"]
  },
  "storage-cdn": {
    s: "Durable object storage for finished audio and the content delivery network that serves it close to listeners with correct caching headers and access control.",
    d: "Generated files are written to object storage with metadata: voice, version, text hash, and retention. Delivery through a CDN uses signed URLs or tokens so private audio stays private, and cache headers control lifetime. Range requests allow seeking. Lifecycle rules move cold content to cheaper tiers and delete it after retention periods. The problems are cost of storing rarely replayed audio, privacy of spoken personal data, and the mismatch between CDN caching and the need to invalidate quickly.",
    k: ["Keep audio long-term vs delete after short retention: long retention enables reuse and raises cost and privacy exposure, short retention is cheap and forces regeneration.", "Signed expiring URLs vs public URLs: signed URLs protect content and block sharing of links, public URLs are simple and unprotected."],
    p: ["Public URLs for personal text leak spoken content through shared links.", "The CDN ignores a purge for hours and serves audio that should be gone."],
    v: "Fetch stored audio with valid, expired and tampered URLs and from another region. Valid ones play with range support, others are refused, and retention rules delete test objects at the configured time.",
    dep: ["audio-encoding"]
  },
  "model-loading": {
    s: "Brings model weights from storage into accelerator memory, keeps the most useful ones resident and evicts the rest, so requests rarely wait on a load.",
    d: "Loads read weights from local disk or a network store, verify checksums, move them to device memory and run a warm-up pass that triggers compilation and kernel setup. Base models are large and shared, while per-voice adapters are small and can be swapped quickly. Eviction policies weigh recency, size and expected demand. Rolling out a new model means loading it alongside the old one and moving traffic gradually. It is hard because load time stalls requests, and the memory for two versions during a rollout may not exist.",
    k: ["Load on demand vs preload all voices: on demand uses memory efficiently and delays first requests, preloading is fast and limits how many voices a worker can hold.", "Hot swap adapters on a shared base vs separate full models: swapping is cheap and requires compatibility, full models are independent and large."],
    p: ["A worker passes its health check before warm-up finishes and serves a slow first request.", "A rollout needs memory for both versions and evicts voices that are in use."],
    v: "Time cold load, warm-up and first-request latency for each model size, and run a rollout under load. No health-checked worker serves a request slower than the warm target, and traffic shifts without errors.",
    dep: ["voice-registry", "model-runtime"]
  },
});
