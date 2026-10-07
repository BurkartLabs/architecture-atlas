// Details for the speech recognition plate, part 1: deployment, evaluation, client interfaces.
ATLAS.details("speech-recognition", {
  "server-inference-service": {
    s: "A fleet of stateless-looking workers that load recognition models onto accelerators, accept audio over long-lived connections and return transcripts, scaled to the number of concurrent audio streams.",
    d: "Each worker holds one or more models in memory and serves many sessions at once. Streaming sessions are pinned to a worker because encoder state lives there, so load balancing happens at connection start, not per request. Workers report capacity as concurrent streams, not requests per second. Batch work pulls from a queue and fills idle capacity. The hard parts are admission control when streams arrive faster than capacity, draining a worker without cutting live calls, and keeping tail latency flat while a mix of languages and models competes for memory.",
    k: ["Session pinning vs stateless chunk routing: pinning keeps encoder state local and cheap, but a worker failure drops live calls and rebalancing is coarse.", "One model per process vs many models per process: sharing hardware raises utilization, but a memory spike in one model can evict or starve the others."],
    p: ["Autoscaling on CPU or request rate lags behind a sudden wave of new streams, so calls are refused while capacity sits idle.", "Deploys that kill workers without draining cut users off mid-sentence."],
    v: "Open the maximum rated number of concurrent streams on one worker, replay known audio, and confirm per-chunk latency at the 99th percentile stays within budget and transcripts match the single-stream output.",
    dep: ["dynamic-batching", "accelerator-scheduling", "session-management"]
  },
  "dynamic-batching": {
    s: "Groups audio chunks from different concurrent streams into one model call, trading a few milliseconds of waiting for much higher accelerator throughput.",
    d: "Accelerators are efficient on large matrices and wasteful on one stream at a time. The batcher collects chunks that arrive within a short window, pads them to a common length or packs them, runs one forward pass, and splits the outputs back to their sessions. Streaming batches must also gather each stream's saved encoder state. A maximum wait time bounds the added latency. It is difficult because chunk lengths vary, arrivals are bursty, and one slow or oversized item can delay everyone in the batch.",
    k: ["Fixed batch window vs fill-or-timeout: a fixed window gives predictable latency but idles at low load, while fill-or-timeout adapts but makes latency depend on traffic.", "Padding to the longest item vs bucketing by length: padding is simple but wastes compute, bucketing wastes less but needs enough traffic to fill each bucket."],
    p: ["Batching delay tuned at peak load adds needless latency overnight when only one stream is active.", "Padding frames leak into attention or normalization, so a stream's result changes depending on its batch neighbors."],
    v: "Transcribe the same audio alone and inside full batches with different neighbors; confirm identical text and word timestamps, and confirm throughput per accelerator rises with batch size.",
    dep: ["accelerator-scheduling", "streaming-encoder-state"]
  },
  "on-device-runtime": {
    s: "The inference engine that runs a compressed recognition model on a phone, car or embedded board, working within fixed memory, power and thermal limits and no network.",
    d: "It loads a packaged model, runs the front end and decoder on the device's processors or neural accelerator, and exposes the same streaming interface as the server. Operators are fused and memory is preallocated so no allocation happens mid-utterance. The model must fit in a few tens or hundreds of megabytes and finish each chunk faster than real time even when the device is hot or busy. It is hard because device hardware varies widely, and a model that is fast on one chip may lack supported operators on another.",
    k: ["Vendor accelerator delegates vs portable CPU kernels: delegates are faster and cooler, but operator support varies by chip and fallbacks differ in accuracy.", "Bundled model vs downloaded model: bundling works offline from first launch, but inflates the app and delays model updates."],
    p: ["Thermal throttling slows the processor mid-session until chunks arrive later than real time and latency grows without bound.", "A model validated on flagship hardware misses its latency target on older devices that make up much of the user base."],
    v: "On the slowest supported device, run a ten-minute recording while the device is warm and confirm real-time factor stays below one, peak memory stays under the limit, and transcripts match the server model within tolerance.",
    dep: ["quantization", "audio-ring-buffer", "streaming-encoder-state", "beam-search"]
  },
  "quantization": {
    s: "Storing and computing model weights and activations in lower precision, such as eight-bit integers, to cut memory and speed up inference at a small accuracy cost.",
    d: "Weights are mapped to integers with per-layer or per-channel scales. Post-training quantization calibrates scales on sample audio; quantization-aware training simulates the rounding during training so the model learns to tolerate it. Sensitive parts, such as normalization layers, softmax outputs or the first and last layers, are often left in higher precision. It is hard because speech models accumulate error across many frames and layers, and accuracy loss concentrates on quiet, accented or noisy speech that average word error rate hides.",
    k: ["Post-training vs quantization-aware training: post-training is quick and needs no training pipeline, but loses more accuracy on small models.", "Per-tensor vs per-channel scales: per-channel preserves accuracy better, but some accelerators only support per-tensor kernels."],
    p: ["Calibration audio that is clean studio speech gives scales that clip noisy input, and error rises sharply in the field.", "Accuracy is checked only on aggregate error rate, hiding a large regression on one language or accent."],
    v: "Compare full-precision and quantized models on the same held-out sets, overall and per slice, and confirm relative error increase stays under the agreed threshold while model size and latency drop as expected.",
    dep: ["acoustic-encoder", "test-set-curation"]
  },
  "distillation": {
    s: "Training a small, fast student model to reproduce a large teacher's outputs, so a compact model reaches accuracy it could not get from labeled data alone.",
    d: "The teacher transcribes large amounts of audio, including unlabeled audio, and the student learns from its output probabilities or hypotheses rather than only from human references. Variants distill an offline model into a streaming one, or a multilingual model into per-language models. Pruning and layer sharing shrink models further. The student's gains depend on how much unlabeled audio is available and how well it matches production. It is hard because the student inherits the teacher's errors and biases, and cannot be better than the data it saw.",
    k: ["Distilling soft probabilities vs hard transcripts: soft targets carry more information per frame, but need matching output units between models.", "One large shared student vs many small specialized students: sharing is cheaper to maintain, specialization is faster and often more accurate per language."],
    p: ["Teacher mistakes on rare names are copied faithfully into the student, so they look like consistent, trusted behavior.", "Distillation audio that differs from production traffic produces a student that scores well offline and poorly live."],
    v: "Evaluate teacher and student on a held-out set from production-like audio; confirm the student's error is within the agreed gap of the teacher while using a fraction of the memory and compute.",
    dep: ["pseudo-labeling", "training-pipeline"]
  },
  "hybrid-routing": {
    s: "Policy that decides whether each utterance is recognized on the device, on a server, or on both, based on connectivity, privacy settings, language and confidence.",
    d: "A common pattern runs the on-device model first for instant results and sends audio to the server only when allowed and useful, replacing the local result if the server's confidence is higher and it arrives in time. Another routes by task: short commands stay local, dictation goes to the server. The router tracks network quality and per-user consent. It is hard because the two models disagree, so users see text change after the fact, and because results must stay consistent across a mid-session network drop.",
    k: ["Race both and take the better result vs choose one up front: racing gives the best accuracy but uses bandwidth and server compute on every request, choosing is cheaper but cannot recover from a wrong choice.", "Route by confidence vs route by task type: confidence adapts to difficulty but needs calibration, task type is simple but cannot see hard utterances."],
    p: ["Offline fallback silently uses a weaker model, and users are never told why accuracy dropped.", "Audio is uploaded for the server pass although the user's setting required local-only processing."],
    v: "Cut the network mid-utterance and confirm a final transcript still arrives from the local model; with local-only consent enabled, capture traffic and confirm no audio leaves the device.",
    dep: ["on-device-runtime", "server-inference-service", "confidence-scores", "privacy-and-data-handling"]
  },
  "accelerator-scheduling": {
    s: "Allocation of accelerator memory and compute among models, languages and streams so that expensive hardware stays busy without any workload missing its latency target.",
    d: "Models are loaded to specific devices, sharded when too large, and warmed before taking traffic. A scheduler assigns streams to devices, prioritizes live traffic over batch jobs, and preempts low-priority work. Mixed precision, kernel fusion and compiled graphs reduce time per chunk. Memory is mostly consumed by model weights plus per-stream state, so capacity is a count of streams per device. The difficulty is fragmentation and cold starts: loading a large model takes seconds to minutes, so scaling or moving models cannot be done reactively.",
    k: ["Dedicated devices per model vs shared pool: dedicated is predictable and isolates failures, but idles when a language is quiet.", "Live-over-batch preemption vs separate fleets: preemption uses spare capacity, but batch jobs suffer unpredictable stalls and need checkpointing."],
    p: ["Loading a rarely used language model on demand stalls the first caller for many seconds.", "A batch backlog consumes capacity that live streams needed, and live latency spikes."],
    v: "Under a mixed load of live streams and a large batch backlog, confirm live latency stays within budget at the 99th percentile, the batch finishes in the expected time, and accelerator utilization stays near target.",
    dep: ["dynamic-batching", "model-registry"]
  },
  "model-rollout": {
    s: "The staged release of new recognition models to traffic, with comparison against the current model and a fast path back when a regression appears.",
    d: "A new model ships first to shadow traffic, where it transcribes the same audio as production but its output is only compared, then to a small share of live traffic, then to everyone. Each stage is gated by error, latency and crash metrics per language and slice. Models are versioned immutably with their features, vocabulary and post-processing, so a rollback restores the whole bundle. It is hard because ground truth is delayed or absent for live audio, so the system leans on proxies such as confidence, user corrections and disagreement with the previous model.",
    k: ["Shadow comparison vs live canary: shadow is risk-free and gives paired comparison, but cannot show user reaction or latency under real load.", "Gradual percentage rollout vs per-customer opt-in: percentage rollout catches problems quickly, opt-in protects customers whose downstream parsers depend on exact output."],
    p: ["A model that improves average error but changes number formatting breaks downstream systems that parsed the old output.", "Rollback restores the acoustic model but not the matching vocabulary file, leaving a mismatched pair."],
    v: "Roll a candidate to a one percent canary, then trigger the rollback; confirm all workers return to the previous model and vocabulary within the target time and transcripts for a fixed test set match the earlier version exactly.",
    dep: ["model-registry", "regression-gates", "server-inference-service"]
  },
  "word-error-rate": {
    s: "The standard accuracy measure: substitutions, deletions and insertions between reference and hypothesis words, divided by the number of reference words.",
    d: "The hypothesis is aligned to the reference by minimum edit distance, and the three error types are counted. Because the denominator is reference length, the rate can exceed one hundred percent when many words are inserted. Character error rate is used for languages without spaces. The measure treats every word equally, so a missed filler counts as much as a wrong medication name. It is hard to use well because it depends entirely on reference quality, text normalization before scoring, and the audio chosen, and small differences between systems are often statistical noise.",
    k: ["Word error rate vs task-specific metrics: word error rate is comparable across systems, but ignores which errors matter, such as names or numbers.", "Micro-averaged over all words vs averaged per utterance: micro-averaging weights long utterances more, per-utterance averaging exposes failures on short commands."],
    p: ["Two systems are compared on different normalization rules, and the difference reported is mostly formatting.", "A one-point improvement is claimed from a few hundred sentences, which is within sampling noise."],
    v: "Score a reference with one inserted, one deleted and one substituted word in a ten-word sentence and confirm the tool reports three errors and thirty percent; compute confidence intervals by resampling on real test data.",
    dep: ["scoring-normalization", "test-set-curation"]
  },
  "test-set-curation": {
    s: "Building held-out audio with verified reference transcripts that represents the speakers, devices, noise and vocabulary the recognizer will meet in production.",
    d: "Audio is sampled from real or simulated traffic, stratified by language, accent, device, noise level and domain, then transcribed by several people with disagreements adjudicated. The set is frozen and kept out of training, including the pretraining and tuning of any component. Separate sets cover general speech, hard cases and each customer or domain. It is hard because the best test audio is production audio, which is private, and because test sets age: language, devices and products change while the frozen set does not.",
    k: ["Production-sampled vs scripted recordings: production audio reflects real conditions, but requires consent and costly transcription, scripted audio is cheap but unrealistic.", "One large general set vs many small targeted sets: a general set gives a stable headline number, targeted sets reveal where the system fails."],
    p: ["Test sentences leak into the language model training text, and measured error falls without any real improvement.", "Reference transcripts contain the errors of an earlier recognizer because it was used to pre-label them."],
    v: "Audit a random sample against a second independent transcription and confirm agreement is above the target; check test text and speakers against training data and confirm zero overlap.",
    dep: ["human-review-loop", "training-corpus"]
  },
  "scoring-normalization": {
    s: "Rules that convert both reference and hypothesis into a common written form before counting errors, so formatting differences are not scored as recognition mistakes.",
    d: "Normalization lowercases, strips punctuation, expands or contracts abbreviations, converts digits to words or the reverse, maps spelling variants and handles hyphens, contractions and filler words. A published rule set is applied identically to every system. Some evaluations score formatted output separately to measure punctuation and capitalization. It is hard because every choice moves the number: normalizing numbers one way can change error by several points, and rules written for one language or accent do not carry to another.",
    k: ["Aggressive normalization vs minimal normalization: aggressive scoring isolates the acoustic work, minimal scoring reflects what users actually read.", "Single rule set for all systems vs each vendor's own: a shared set is fair, but may penalize a system whose output style is valid."],
    p: ["Reference text keeps digits while the hypothesis spells numbers out, and a large share of errors are artifacts.", "Normalization rules are changed between runs, and trends across releases become meaningless."],
    v: "Feed pairs of strings that differ only by case, punctuation and number format and confirm they score as identical; version the rule set and confirm an old run reproduces its old score.",
    dep: ["inverse-text-normalization"]
  },
  "error-breakdown": {
    s: "Analysis that splits recognition errors by type, word class, speaker group, acoustic condition and position, to show what to fix rather than only how many errors exist.",
    d: "Aligned outputs are tagged: substitution, deletion or insertion; proper noun, number or common word; clean or noisy; start or end of utterance. Confusion tables list which words are mistaken for which. Aggregating by slice reveals patterns, such as deletions at utterance ends caused by early endpointing, or insertions during silence caused by weak voice detection. It is hard because causes are entangled, and a pattern in the numbers needs listening to examples to confirm which stage actually produced it.",
    k: ["Automatic tagging vs manual review: automatic tagging scales to millions of words, but mislabels the cause, so a sample still needs human listening.", "Many fine-grained slices vs a few coarse ones: fine slices find specific problems, but each has too few examples for stable numbers."],
    p: ["A top error word is attributed to the model when the reference transcript was wrong.", "Slices are defined so finely that differences between them are noise, and effort goes into fixing nothing."],
    v: "Inject a known defect, such as truncating the last half second of every utterance, and confirm the breakdown flags a spike of end-of-utterance deletions that was absent in the baseline.",
    dep: ["word-error-rate", "forced-alignment"]
  },
  "confidence-calibration": {
    s: "Checking and correcting confidence scores so that a score of eighty percent means about eighty percent of such words are correct, which downstream decisions depend on.",
    d: "Words or utterances are binned by confidence and their actual accuracy computed, producing a reliability curve. A small calibration model, trained on held-out data, maps raw scores to calibrated ones, often per language and model version. Applications use thresholds to route low-confidence results to a human, a retry or a clarification question. It is hard because raw scores from end-to-end models are overconfident, calibration drifts with new audio conditions, and one threshold does not fit different languages or noise levels.",
    k: ["Calibrating per model version vs globally: per-version is accurate, but must be redone with every release and its labeled data.", "Word-level vs utterance-level confidence: word-level pinpoints errors, but is noisier, utterance-level is stable but cannot locate the mistake."],
    p: ["A model update shifts raw score distributions, and fixed thresholds suddenly pass many wrong transcripts.", "Calibration is fitted on clean audio, so noisy calls look more confident than they are."],
    v: "On fresh held-out audio, bin words by confidence and confirm accuracy in each bin is within a few points of the bin's score, and that the expected calibration error is below the target.",
    dep: ["confidence-scores", "test-set-curation"]
  },
  "latency-measurement": {
    s: "Instrumentation that measures how long users wait for first words, for partial updates and for the final transcript, in terms that match what they perceive.",
    d: "Timestamps are taken at capture, at send, at arrival, after the model and at delivery. Key figures are time to first partial, partial delay behind the audio, finalization delay after the speaker stops, and real-time factor. Measurement uses audio with known word times, so delay can be computed against when the word was actually spoken. It is hard because clocks differ between client and server, network time is variable, and averages hide the slow tail that users feel.",
    k: ["Measuring from the client vs the server: client-side numbers include the network and what users feel, but need clock correction and are noisier.", "Latency per word vs per utterance: per-word shows streaming behavior, per-utterance is simpler but hides slow starts."],
    p: ["Only server processing time is reported, and a slow network or buffering adds seconds users complain about.", "Mean latency looks fine while the 99th percentile is several times higher."],
    v: "Play audio with a known word onset, record when the client receives that word, and confirm measured delay matches an independent stopwatch within tens of milliseconds, with percentiles reported.",
    dep: ["partial-hypotheses", "lookahead-and-latency-budget", "word-timestamps"]
  },
  "slice-fairness-analysis": {
    s: "Reporting accuracy separately for accents, ages, genders, devices, noise levels and languages, to find groups the system serves worse than the average suggests.",
    d: "The test set carries metadata for each speaker and recording. Error rates are computed per group with confidence intervals, and gaps beyond a threshold block release or trigger data collection. Groups include dialects, non-native speakers, children, elderly speech, speech disorders and low-resource languages. It is hard because metadata is incomplete or sensitive to collect, groups overlap, and some groups have too little audio to measure reliably, which can hide the largest gaps.",
    k: ["Self-reported vs inferred attributes: self-reported is accurate and consensual, but sparse, inferred attributes cover everything but carry their own errors and privacy concerns.", "Absolute thresholds vs relative-gap rules: absolute thresholds guarantee a minimum quality, relative rules push toward parity but may lower the best group."],
    p: ["A group with few test speakers shows a good score by chance and is declared fine.", "Fixing the average improves the best-served groups most, widening the gap."],
    v: "Compute error per group with confidence intervals on a labeled set; confirm the report lists every required group, flags gaps above threshold, and states where a group has too little data to conclude.",
    dep: ["word-error-rate", "test-set-curation"]
  },
  "human-review-loop": {
    s: "A workflow in which people listen to audio and correct or verify transcripts, producing references for evaluation and training and checking low-confidence production results.",
    d: "Audio snippets are selected by sampling, by low confidence or by disagreement between models, and shown to transcribers with the machine draft. Style guides define handling of numbers, filler words, unclear speech and names. Several reviewers can transcribe the same clip, and disagreements are resolved by a senior reviewer. Quality is tracked by agreement and by hidden gold clips. It is hard because correcting a draft anchors reviewers to its mistakes, and because audio shared with reviewers is a privacy exposure that needs consent and access control.",
    k: ["Correcting a machine draft vs transcribing from scratch: correction is two to three times faster, but biases reviewers toward the model's errors.", "Internal reviewers vs crowd workers: internal staff handle sensitive audio and domain terms better, crowds scale and are cheaper."],
    p: ["Reviewers accept the draft without listening, so references copy model errors and measured accuracy looks inflated.", "Sensitive recordings are routed to an uncontrolled external workforce."],
    v: "Insert clips with known correct transcripts into the queue and confirm each reviewer's accuracy on them stays above threshold; confirm clips tagged sensitive are served only to approved reviewers.",
    dep: ["confidence-scores", "privacy-and-data-handling"]
  },
  "regression-gates": {
    s: "Automated checks run on every model or pipeline change that block release when error, latency, formatting or resource use worsens beyond set limits.",
    d: "A candidate is run over the frozen test sets, a latency benchmark and a golden set of audio with expected exact output. Results are compared with the current production model per language and slice. Gates include absolute limits and statistical tests for relative change. Some gates check the whole pipeline: formatting, timestamps, redaction and schema. It is hard because runs are expensive, thresholds must be tight enough to catch real regressions but loose enough not to fail on noise, and a change in one stage can break another.",
    k: ["Blocking gates vs advisory reports: blocking prevents known regressions, but a noisy gate trains people to override it.", "Statistical tests vs fixed thresholds: tests respect noise, but need enough test data to detect the small changes that matter."],
    p: ["Gates run only on aggregate error, and a regression for one language ships unnoticed.", "A flaky latency gate is repeatedly rerun until it passes, and it stops meaning anything."],
    v: "Submit a deliberately degraded model, for example one with an altered number-formatting rule, and confirm the gate fails with the affected slice named; resubmit the unchanged model and confirm it passes.",
    dep: ["word-error-rate", "latency-measurement", "slice-fairness-analysis", "test-set-curation"]
  },
  "streaming-api": {
    s: "A long-lived bidirectional connection over which a client sends audio as it is captured and receives partial and final results as they are produced.",
    d: "The client opens a connection, sends a configuration message with language, audio format and options, then streams audio chunks. The server replies with interim results, finals and events such as speech start and end. Transport is a persistent, framed channel over HTTP-based protocols. Flow control, keepalives and an end-of-audio signal are part of the contract. It is hard because connections break on mobile networks, clients send audio faster or slower than real time, and the protocol must remain compatible as options and result fields grow.",
    k: ["Connection-level streaming vs repeated short requests: a persistent connection has lower latency and carries context, but is harder to load balance and retry.", "Server-driven endpointing vs client-driven stop: server endpointing is convenient, but client control suits push-to-talk and avoids cutting off pauses."],
    p: ["A client sends audio much faster than real time, such as a file, and overruns buffers or hits rate limits.", "An idle connection is dropped by a proxy during a long silence, and the client does not notice until the next speech."],
    v: "Stream a recording at real-time pace and confirm interim results arrive during speech and a final per utterance; kill the network for two seconds and confirm the client reconnects and the transcript has no gap or duplicate.",
    dep: ["session-management", "result-schema", "audio-chunking", "authentication-and-quotas"]
  },
  "batch-api": {
    s: "An interface for submitting recorded audio files, receiving a job identifier and fetching the finished transcript later, for content that does not need a live answer.",
    d: "The client uploads a file or provides a storage location, with options for language, diarization, vocabulary and output format. The service validates and decodes the file, places a job in the queue, and reports status. Results are retrieved by polling or callback. Long recordings are split into segments and processed in parallel, then reassembled. It is hard because input varies widely in format, length and quality, and failures must be reported per job with a clear cause rather than as a silent empty transcript.",
    k: ["Direct upload vs reference to storage: direct upload is simple for small files, but references avoid pushing hours of audio through the API.", "Synchronous response for short files vs always asynchronous: synchronous is convenient, but forces timeouts and a second code path."],
    p: ["A corrupt or silent file yields an empty transcript with a success status, and the caller assumes there was no speech.", "Results are retained indefinitely by default, keeping sensitive recordings longer than the customer expects."],
    v: "Submit a one-hour recording and confirm the job completes, the transcript's final timestamp matches the file duration, and a deliberately corrupt file returns a failed status with a specific reason.",
    dep: ["batch-job-queue", "result-schema", "long-form-segmentation", "audio-decoding"]
  },
  "client-sdk": {
    s: "Library code shipped to applications that handles microphone access, audio encoding, connection management and result delivery, so developers call a few functions rather than the wire protocol.",
    d: "The SDK requests permission to use the microphone, captures audio, resamples and optionally compresses it, applies simple local processing such as voice detection, and manages the streaming connection with reconnection and backoff. It surfaces results as events or callbacks and handles platform quirks such as audio interruptions, route changes to headphones and background limits. It is hard because every platform differs in capture behavior, and an SDK bug, such as dropped frames, silently lowers accuracy for every customer who uses it.",
    k: ["Thin SDK vs rich SDK: thin is easy to port and keep correct, but pushes capture and retry logic onto every customer.", "Local processing in the client vs all on the server: local voice detection saves bandwidth, but is hard to update and varies by device."],
    p: ["The SDK captures at one sample rate and labels the stream with another, and accuracy collapses with no error.", "Reconnection resends buffered audio from the start, so the transcript contains repeated phrases."],
    v: "On each supported platform, record a reference tone and speech through the SDK and confirm the received audio has the right sample rate and no gaps, then confirm transcripts match a file-based run.",
    dep: ["microphone-capture", "sample-rate-conversion", "streaming-api", "voice-activity-detection"]
  },
  "result-schema": {
    s: "The defined structure of recognition output: alternatives, words, timings, confidences, speaker labels, channel and finality, versioned so clients can rely on it.",
    d: "A result carries a stable utterance identifier, a final flag, one or more alternative transcripts with a confidence, and per-word entries with start and end times, confidence and optional speaker. Fields for language, channel and audio offsets support multi-speaker and multichannel audio. Partial results can revise earlier text, so the schema says what a later message replaces. It is hard because fields added for one feature burden all clients, because partial and final semantics are easy to misread, and because changing meaning without changing names silently breaks consumers.",
    k: ["Replace-the-whole-utterance partials vs incremental word updates: whole replacement is simple for clients, but incremental updates use less bandwidth and flicker less.", "Strict versioned schema vs permissive evolving fields: strict versions protect consumers, permissive fields ship features faster but allow drift."],
    p: ["Clients append every partial result instead of replacing, and the displayed transcript repeats itself.", "Timestamps are in different units or origins for streaming and batch, and subtitle tools misalign."],
    v: "Validate real responses from streaming and batch against the published schema, and replay a recorded stream through a reference client that rebuilds the transcript, confirming it equals the batch result.",
    dep: ["word-timestamps", "confidence-scores", "partial-hypotheses"]
  },
  "model-and-language-selection": {
    s: "The caller-facing choice of language, dialect and model variant, which the service maps to the right loaded model, vocabulary and post-processing.",
    d: "A request names a language tag, possibly a regional variant, and a model family such as one tuned for phone calls, video or voice commands. The service resolves this to a specific model version, falling back to a default when the exact variant is absent, and pins the version for the session. Some deployments accept several candidate languages and run identification first. It is hard because model choice is a hidden quality knob: callers using the wrong model for their audio get poor results and blame the service.",
    k: ["Explicit model naming vs automatic selection: explicit names give control and reproducibility, but automatic selection protects callers who would otherwise pick wrongly.", "Pinning versions vs always latest: pinning keeps output stable, but delays improvements and requires supporting old models."],
    p: ["A phone-call audio stream is sent to a model built for wideband audio and accuracy drops with no warning.", "A regional variant silently falls back to a generic model, and local words are mistranscribed."],
    v: "Request each supported language and model combination with a short reference clip and confirm the response reports the model actually used, and that an unsupported combination is rejected or falls back with an explicit notice.",
    dep: ["model-registry", "language-identification", "model-rollout"]
  },
  "authentication-and-quotas": {
    s: "Identification of callers and enforcement of per-account limits on concurrent streams, audio minutes and request rates, to protect capacity and bill correctly.",
    d: "Requests carry credentials validated at the edge; short-lived tokens suit client-side apps so long-term secrets are not shipped in them. Limits count concurrent streams, because that is what consumes capacity, as well as total audio duration. Usage is metered per second of audio processed, per model and feature, for billing. It is hard because streams last minutes, so a limit checked only at start misses growth, and because rejecting traffic during a surge must be graceful, with clear errors and retry hints.",
    k: ["Concurrency limits vs rate limits: concurrency tracks real capacity use, but is harder to enforce across a distributed fleet.", "Metering processed audio vs metering requested audio: processed audio is accurate billing, but needs reconciliation when streams fail partway."],
    p: ["Long-lived credentials are embedded in client apps and extracted, then used to consume the account's quota.", "Quota rejection looks like a transient error, so clients retry aggressively and make the overload worse."],
    v: "Open streams up to an account's concurrency limit, confirm the next is refused with a retry hint, close one and confirm a new stream is accepted; reconcile billed seconds with audio durations.",
    dep: ["session-management"]
  },
  "callbacks-and-webhooks": {
    s: "Server-initiated notifications that tell a caller a batch job finished, failed or produced an event, so the caller does not need to poll.",
    d: "The caller registers a destination address with a job. When processing completes, the service sends a signed message with the job identifier, status and a link to the result, retrying with backoff on failure. Large transcripts are fetched from storage rather than embedded. Delivery is at least once, so receivers deduplicate by identifier. It is hard because destinations are outside the service's control: they can be down, slow or hostile, and the service must not become a way to send requests to internal addresses.",
    k: ["Link to the result vs transcript in the message: a link keeps messages small and access-controlled, but needs a second authenticated fetch.", "At-least-once delivery vs exactly-once attempts: at-least-once is achievable and reliable, but forces receivers to handle duplicates."],
    p: ["A destination that points to an internal network address makes the service call its own private systems.", "Retries continue for days against a dead endpoint and fill the delivery queue."],
    v: "Complete a job with a test receiver that fails twice then succeeds, and confirm the message is retried with backoff, carries a valid signature, and that a duplicate delivery is recognized by its identifier.",
    dep: ["batch-job-queue", "authentication-and-quotas"]
  },
});
