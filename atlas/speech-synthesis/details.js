// Details for the speech synthesis plate, part 1: interfaces, markup and control, voices.
ATLAS.details("speech-synthesis", {
  "tts-api": {
    s: "The request interface that accepts text or markup, a voice and output options, and returns audio either as a stream or as a finished file.",
    d: "A request carries input text or markup, a voice identifier, a language, an output format and sample rate, and optional controls such as speaking rate. The service validates it, authenticates the caller, and routes it to the pipeline. Short requests return audio in one response. Interactive ones return a stream. Errors must distinguish bad input, unsupported voices and capacity limits so callers can retry correctly. The hard parts are keeping the contract stable while models change underneath, and defining what happens to input the front end cannot speak.",
    k: ["One endpoint for sync and streaming vs separate endpoints: one surface is easier to learn, but streaming needs different error and timeout semantics that leak into it.", "Explicit voice and model versions vs a moving alias: pinned versions keep audio stable for callers, at the cost of running old models for a long time."],
    p: ["Silently truncating over-long input returns audio that ends mid-sentence with a success status.", "Changing the default voice model without notice alters recorded customer experiences, and cached prompts no longer match live output."],
    v: "Send the same short text with a pinned voice and format, then with an invalid voice id and an oversize body. The first returns decodable audio of plausible duration, and the others return distinct, documented error codes.",
    dep: ["request-router", "markup-parser", "quotas-and-billing"]
  },
  "audio-encoding": {
    s: "Produces the audio in the requested sample rate, bit depth, compression format and container so the caller's player or telephone line can use it without conversion.",
    d: "The vocoder emits raw samples at its native rate. This stage resamples, converts to the target format and encodes: uncompressed samples with a header for editing, compressed formats for storage and web, and companded narrowband formats for telephony. For streaming, the container must be decodable from any chunk boundary, so headers cannot hold a final length. Compression adds delay and can introduce artifacts on synthetic speech, which has sharper regularities than natural speech. Every format must be tested against real players, because tolerance for malformed headers varies widely.",
    k: ["Encode on the fly vs store a master and convert on demand: on-the-fly saves storage, while a master avoids repeated lossy encoding and keeps one source of truth.", "Fixed set of formats vs open-ended options: a fixed set is testable and cacheable, but integrators with unusual players ask for exceptions."],
    p: ["A streaming WAV header with length zero is accepted by one player and rejected by another.", "Encoding twice, once in the service and again in a telephony gateway, leaves audible artifacts nobody can attribute."],
    v: "Request each supported format and sample rate, decode them with an independent decoder, and confirm duration, sample rate and channel count match the request and a spectrogram shows no band-limiting beyond what the format implies.",
    dep: ["sample-rate-conversion", "neural-vocoder"]
  },
  "client-players": {
    s: "Libraries and playback components that call the API, receive streamed audio and play it with correct buffering, interruption and error handling on each client platform.",
    d: "A client library wraps authentication, retries and the streaming protocol, and hands received chunks to an audio output queue. The player must decide how much to buffer before starting, how to keep the queue from running dry, and what to do on a dropped connection. Mobile and browser platforms add audio session rules: another app may take the speaker, autoplay may need a user gesture, and output devices change mid-utterance. It is hard because most perceived latency and glitching originates here, outside the service the provider measures.",
    k: ["Thin client that plays what it gets vs smart client that manages buffers and retries: thin is easy to port, smart delivers better reliability and needs more per-platform code.", "Shipping a player vs documenting the protocol: a player controls experience, while protocol-only lets integrators fit their own audio stacks."],
    p: ["Starting playback on the first chunk with no buffer produces stutter on slow networks.", "A client that never closes its stream on navigation keeps synthesizing and billing for audio no one hears."],
    v: "Play a one-minute passage on a throttled network and on a device whose output changes mid-playback. Audio should resume without gaps beyond the target and without replaying text, and server logs should show cancellation on exit.",
    dep: ["playback-buffering", "streaming-transport", "tts-api"]
  },
  "batch-jobs": {
    s: "Asynchronous synthesis of long documents or large lists of texts, with job queues, progress, partial results and delivery of finished audio files.",
    d: "A job is split into segments at sentence or paragraph boundaries, synthesized in parallel on spare capacity, then joined into one file or a set of files with chapter markers and timing data. Batch work runs at lower priority than interactive requests and is checkpointed so a failure resumes rather than restarts. The difficulty is consistency: segments synthesized separately may differ in loudness, pacing and voice texture, so the same settings, seeds and normalization must apply, and seams must be placed where pauses naturally occur.",
    k: ["Parallel segments vs one sequential pass: parallelism finishes sooner, but sequential gives smoother pacing across the document.", "Low-priority shared capacity vs reserved capacity: shared is cheap and delays unpredictably, reserved gives deadlines at a fixed cost."],
    p: ["Splitting mid-sentence on a decimal point or abbreviation yields a wrong pause and a restarted intonation at the seam.", "One failed segment that is retried with different settings produces an audibly different voice in the middle of a chapter."],
    v: "Submit a long text with known paragraph count, kill a worker mid-job, and confirm the job completes with every paragraph present once, consistent loudness across seams, and timing data that matches the joined file.",
    dep: ["request-router", "chunk-stitching", "loudness-normalization"]
  },
  "voice-catalog": {
    s: "The list of available voices with their languages, styles, supported features and sample audio, and the logic that picks a voice for a request.",
    d: "Each entry records the voice id, language and locales, gender and age descriptors where used, supported styles and markup, sample rates, quality tier, model version and status. Selection resolves a request that names a voice directly, or names a language and attributes and receives a default. Entries move through preview, general availability and deprecation. The catalog must reflect what is actually deployed in each region, because a listed voice that is not loaded fails at request time. Deprecation needs notice because customers hard-code ids.",
    k: ["Stable voice ids that survive model upgrades vs an id per model version: stable ids simplify callers but hide changes, versioned ids make changes explicit and multiply entries.", "Descriptive attributes (gender, age) vs neutral names only: attributes help selection and encode stereotypes that some customers do not want."],
    p: ["A voice listed in the catalog but not deployed in the caller's region returns an error only at synthesis time.", "Retiring a voice without a replacement or notice silently breaks products that cached its id."],
    v: "For every catalog entry in every region, synthesize a fixed test sentence and confirm each succeeds and the audio matches the entry's language and sample rate. Entries that fail are flagged before release.",
    dep: ["voice-registry"]
  },
  "quotas-and-billing": {
    s: "Authentication, rate limits, usage metering and charging for synthesis, normally counted in characters or seconds of audio, with different prices for voice tiers and features.",
    d: "Each request is attributed to an account, checked against concurrency and rate limits, and metered. Characters are known before synthesis and audio duration only after, so systems choose which to bill and reconcile the other. Premium and cloned voices carry different prices. Streaming complicates metering when a client disconnects partway: the audio generated but not played may or may not count. The hard part is that cost per request varies by orders of magnitude with text length and voice, so limits by request count alone are meaningless.",
    k: ["Bill by input characters vs output seconds: characters are predictable for customers, seconds track real compute but vary with voice speed and are known late.", "Hard limit vs soft limit with overage: hard stops protect capacity and break customer products, soft limits protect customers and need capacity headroom."],
    p: ["Counting characters including markup bills customers for tags that produce no speech.", "A retry storm after a timeout bills each attempt, so a transient outage inflates the invoice."],
    v: "Synthesize texts of known length through the API with one disconnected stream, then compare the usage report to an independent count of characters sent and seconds delivered. Discrepancies stay within the documented rule.",
    dep: ["request-router", "audit-provenance"]
  },
  "timing-output": {
    s: "Returns, alongside the audio, the start time of each word, sentence and mark, and optionally mouth shape events, so applications can highlight text or animate faces in sync.",
    d: "The acoustic model's duration predictions, or an alignment run on the generated audio, give start and end times per phoneme. These roll up to words and sentences and are mapped back to character offsets in the original input, not the normalized text, so a highlight lands on the right characters even when a number became several words. Mouth shape events map phonemes to a small viseme set. The difficulty is that normalization changes the text, so offset mapping must survive expansions, markup removal and language-specific tokenization.",
    k: ["Predicted durations vs measured alignment of generated audio: predictions are free and can drift from what the vocoder produced, alignment is accurate and costs extra compute.", "Word-level only vs phoneme-level events: words suffice for highlighting, phonemes are needed for lip animation and increase payload and latency."],
    p: ["Offsets computed on normalized text highlight the wrong words after a number or abbreviation expansion.", "Timing from a first draft is not updated after crossfading or trimming silence, so events drift against the delivered audio."],
    v: "Synthesize text containing numbers, tags and emoji. Play it with highlighting driven only by the timing output and confirm each highlighted span begins within about 50 ms of its spoken word.",
    dep: ["alignment-mechanism", "token-classifier", "duration-model"]
  },
  "markup-parser": {
    s: "Parses SSML or a similar markup into a tree of text and control annotations, validates it against the supported subset and passes it to the front end.",
    d: "Input is an XML-based document with elements for voice changes, breaks, emphasis, prosody, pronunciation and interpretation hints. The parser rejects malformed documents, resolves namespaces and language attributes, and flattens the tree into text spans with attached controls that later stages can read. Unsupported tags need a policy: ignore with a warning, or fail. It is hard because no voice supports every tag, the standard leaves behavior open, and plain text containing angle brackets or ampersands must not be mistaken for markup.",
    k: ["Strict validation vs lenient parsing: strict gives predictable behavior and breaks inputs that worked elsewhere, lenient accepts more and hides mistakes.", "Standard markup only vs vendor extensions: the standard is portable, extensions expose real capabilities at the price of lock-in."],
    p: ["A script containing a literal ampersand is rejected with an unhelpful error because it was sent as markup.", "Nested voice and language elements resolve differently than the author intended, changing the speaker mid-sentence."],
    v: "Feed a conformance set of valid, invalid and edge-case documents. Valid ones yield the expected spans and controls, invalid ones give errors naming the line, and plain text with special characters is treated as text.",
    dep: ["input-sanitizer"]
  },
  "prosody-tags": {
    s: "Markup controls for speaking rate, pitch, volume, pauses and emphasis, applied to spans of text and honored by the prosody and acoustic models.",
    d: "A caller can ask for a slower rate, a higher pitch, a louder emphasis or a pause of a given length. The front end converts these to values attached to the affected words. How they act depends on the model: a model with explicit duration and pitch predictors scales them directly, while a fully end-to-end model may only support them approximately or through coarse style conditioning. Limits are needed because extreme values produce artifacts. The challenge is making relative changes behave sensibly on top of a naturally varying contour.",
    k: ["Explicit numeric controls vs coarse named levels: numbers give precise control and invite unnatural extremes, named levels are safer and less expressive.", "Scale predicted values vs overwrite them: scaling keeps natural variation, overwriting gives exactness and flattens delivery."],
    p: ["A pitch change applied to a whole sentence sounds like a different speaker or a robotic monotone.", "The same rate value produces different speeds on different voices because their natural pace differs."],
    v: "Synthesize one sentence at rate settings of 0.8, 1.0 and 1.2 and measure duration. Durations should scale roughly proportionally, and listeners should hear no added distortion at the ends of the range.",
    dep: ["markup-parser", "duration-model", "energy-contour"]
  },
  "say-as-hints": {
    s: "Markup that tells normalization how to read a span, for example as a date, a telephone number, digits one by one, a currency amount or spelled letters.",
    d: "An interpret-as attribute with an optional format string overrides the classifier's guess. The span bypasses the usual ambiguity resolution and goes directly to the matching verbalizer: a cardinal, an ordinal, a digit sequence or letter names. Formats specify field order for dates and grouping for numbers. It is the escape hatch for the cases where context cannot tell. Hard parts are the set of types, which varies by language, and what to do when the content does not match the declared type, such as a date with month thirteen.",
    k: ["Fail on mismatch vs fall back to automatic reading: failing exposes author mistakes, falling back keeps audio flowing and hides them.", "Many fine-grained types vs a few general ones: fine types give control and add per-language work and documentation."],
    p: ["A digit-by-digit hint on a long number is read in one language's grouping convention, confusing listeners in another locale.", "A hint is applied to a span that normalization has already rewritten, so it is ignored."],
    v: "Synthesize the string 1/2/2024 with date hints in two formats and with a digits hint. The three outputs read as different dates and as digits, and the transcribed text matches each expected expansion exactly.",
    dep: ["markup-parser", "number-expansion", "token-classifier"]
  },
  "phoneme-tags": {
    s: "Markup that gives the exact phonemes for a word or span, in a standard phonetic alphabet or the system's own symbols, bypassing the dictionary and the grapheme-to-phoneme model.",
    d: "A phoneme element carries an alphabet identifier and a phoneme string. The parser validates the symbols against the voice's inventory and the lexicon stage substitutes them for the looked-up pronunciation, keeping stress and syllable boundaries. If a voice lacks a requested phone, a nearest substitute is chosen or the request fails. This is the tool of last resort for names and technical terms. It is hard because authors write phonetic strings poorly, alphabets differ between systems, and a phoneme foreign to the voice's training data sounds wrong even when specified correctly.",
    k: ["Standard phonetic alphabet vs a system-specific one: a standard one is portable and verbose, a native set maps exactly to the model's units.", "Reject unsupported phones vs approximate: rejection is honest, approximation keeps working and can mislead authors."],
    p: ["Authors supply phonemes for one dialect and the voice speaks another, so the override sounds odd.", "A phoneme override inside a word loses the stress marking and the word is spoken with flat rhythm."],
    v: "Override a name known to be mispronounced with a correct phoneme string and run round-trip recognition and a native listener review. The corrected word is recognized and judged right, and unsupported symbols return a clear error.",
    dep: ["markup-parser", "phoneme-inventory", "pronunciation-dictionary"]
  },
  "sync-marks": {
    s: "Markers placed in the input that the system reports back with their position in the audio, letting applications trigger actions or display content at exact points in speech.",
    d: "A mark element holds a name. During synthesis the system tracks where in the output each mark falls, using the duration model or alignment, and emits an event with the name and time offset either in the response metadata or inline in the stream. Applications use marks for slide changes, gestures, sound effects and analytics. The difficulty is accuracy through streaming and cache reuse: the time of a mark is relative to the start of the audio, so clipping, silence trimming or splicing cached pieces must adjust it.",
    k: ["Events delivered with the audio stream vs fetched separately: inline events stay in sync by construction, a separate channel is easier to consume and can drift.", "Mark at word boundary only vs anywhere in text: word boundaries are well defined, arbitrary positions split syllables and need interpolation."],
    p: ["Marks inside text that is replaced by a cached clip are dropped, so the slide never changes.", "Trimmed leading silence shifts the audio but not the event times."],
    v: "Place marks before several words, play the stream, and compare event times to the actual word onsets seen in a waveform. Deviations stay within one frame of the display rate, including after streaming and cache hits.",
    dep: ["markup-parser", "timing-output", "duration-model"]
  },
  "style-controls": {
    s: "Settings that choose or blend a speaking style or emotion, such as cheerful, calm, newsreader or whispered, either by name, by intensity or by a short description.",
    d: "Styles are trained into the models from labeled recordings of the same speaker in different moods, or learned as directions in a style embedding space. A request names a style and degree, which the front end turns into a conditioning vector for the prosody and acoustic models. Coverage differs per voice: only some styles exist for each speaker, and the style must fit the text, since a cheerful reading of bad news sounds wrong. It is hard to keep identity stable across styles, and to avoid exaggerated, theatrical delivery at high intensity.",
    k: ["Discrete named styles vs a continuous embedding space: names are predictable and limited, continuous control is flexible and hard to describe or reproduce.", "Style recorded per speaker vs transferred from other speakers: recorded is more convincing, transfer scales to many voices with more identity leakage."],
    p: ["A style trained from one text domain transfers poorly to others and sounds like a caricature.", "High intensity shifts perceived speaker identity so a clone no longer sounds like the person."],
    v: "Render one neutral sentence in each supported style and have listeners label the style blind. Labels agree with the request well above chance, and speaker similarity to the neutral rendering stays above the voice's threshold.",
    dep: ["style-embedding", "markup-parser", "speaker-conditioning"]
  },
  "speaker-embedding": {
    s: "A fixed-length vector that summarizes who is speaking, learned from audio and used to condition the models so one network can render many voices.",
    d: "A speaker encoder is trained, often on a verification task over many speakers, to map any utterance of a person to nearby points. The vector goes to the acoustic model as a conditioning input. Embeddings of training speakers give a space the system can interpolate in, and the embedding of a new reference clip lets it imitate an unseen voice. The quality of cloning depends on how well the space covers unusual voices, and on how much of recording conditions, rather than the speaker, leaks into the vector.",
    k: ["Learned embedding vs a table of per-speaker parameters: embeddings generalize to unseen speakers, a table is simpler and cannot add voices without retraining.", "One global vector vs several time-varying ones: a global vector is compact and loses within-speaker style, time-varying captures more and is harder to control."],
    p: ["Channel noise and microphone color end up in the embedding, so the clone reproduces the room.", "Rare accents or voices far from the training distribution map to the nearest common speaker, silently losing identity."],
    v: "Embed several clips each from many held-out speakers and confirm clips of one person cluster together and apart from others, with verification error below the target. Then check that audio from a clone scores close to its source.",
    dep: ["training-pipeline"]
  },
  "voice-cloning": {
    s: "Creates a new voice from a person's recordings, from a few seconds of zero-shot reference to hours used to fine-tune, then makes it available for synthesis.",
    d: "The pipeline accepts reference audio, checks its quality and length, verifies consent, extracts a speaker embedding or prepares adaptation data, and produces a voice entry. Zero-shot cloning conditions the shared model on the reference at request time. Fine-tuned cloning trains additional weights offline. Output is evaluated for similarity and intelligibility before release. The hard parts are noisy or mismatched reference audio, the gap between short-sample and studio-grade clones, and the risk that a good enough clone enables impersonation, so the pipeline sits behind safeguards.",
    k: ["Zero-shot conditioning vs per-voice fine-tuning: zero-shot is instant and less faithful, fine-tuning is slower, costs storage per voice and sounds closer.", "Open self-service cloning vs gated onboarding: self-service scales, gating with verification greatly reduces misuse and adds friction."],
    p: ["Reference audio with background music produces a clone that hums or reverberates.", "Cloning accepts any uploaded audio, including recordings of someone who never agreed."],
    v: "Clone a held-out speaker from clips of varied length and measure speaker similarity and word error against their real speech. Similarity rises with reference length, and an upload that fails the consent check never produces a usable voice.",
    dep: ["speaker-embedding", "consent-verification", "speaker-adaptation", "voice-registry"]
  },
  "voice-design": {
    s: "Builds a voice that corresponds to no real person, by choosing attributes or mixing existing voices, so products can have a unique identity without a recording session.",
    d: "Because speaker identities live in an embedding space, a designer can interpolate between voices, move along learned directions such as pitch or age, or sample new points, then audition the result. Some systems accept a text description and map it to the space. The new voice is stored like any other. Hard parts are controllability, since directions entangle attributes, and distinctiveness: a sampled voice near a real speaker may sound like that person, which raises both rights and impersonation questions.",
    k: ["Interpolating existing voices vs sampling the space freely: interpolation stays natural and inherits the sources' rights, free sampling gives novelty with more artifacts.", "Descriptive control vs audition-only search: descriptions are quick and imprecise, audition is exact and slow."],
    p: ["A blend of two licensed voices is released without checking that both licenses allow derivatives.", "Sampled points far from training speakers sound unstable or breathy."],
    v: "Generate a batch of designed voices and compare each against all training and licensed speakers. None exceeds the similarity threshold to a real person, and listeners rate each as stable and consistent across sentences.",
    dep: ["speaker-embedding", "voice-registry", "speaker-similarity"]
  },
  "speaker-adaptation": {
    s: "Fine-tunes part of a pretrained model on a small set of one speaker's recordings so the output matches that person more closely than zero-shot cloning can.",
    d: "Starting from a multi-speaker model, a small set of parameters such as adapter layers, speaker embeddings or low-rank updates is trained on the target recordings while most weights stay frozen. This takes minutes to hours and produces a small file per voice. Training data is cleaned, segmented and aligned first. The balance is between fidelity and generalization: too much training on a small set overfits, producing a voice that is perfect on read sentences and breaks on new text, with artifacts and lost pronunciation accuracy.",
    k: ["Adapters or low-rank updates vs full fine-tuning: small updates are cheap to store and swap, full tuning fits better and needs a model copy per voice.", "Train until loss stops vs stop early on listening checks: loss minimum can overfit, early stopping needs reliable validation sentences."],
    p: ["Overfitting to a few hours of read speech makes the voice unable to say out-of-domain names.", "Adapting on data containing noise or another speaker bakes the contamination into the voice."],
    v: "Adapt on a subset and test on held-out sentences and a stress set of rare words. Word error stays near the base model's, and similarity to the real speaker exceeds that of the zero-shot version in blind listening.",
    dep: ["training-pipeline", "segmentation-cleaning", "forced-alignment", "speaker-conditioning"]
  },
  "consent-records": {
    s: "The stored evidence of who agreed to have their voice used, for what purposes, in which products and for how long, tied to each voice that could imitate them.",
    d: "Each real-person voice has a record: identity of the speaker, the signed or recorded agreement, permitted uses, territories, expiry, revocation status and the source recordings it covers. The record travels with every derived artifact, so a model trained on the voice can be traced to its permission. Synthesis checks the record before use. The difficulty is life cycle. People revoke consent, contracts expire, and derived models and cached audio must be found and handled according to the terms, which requires lineage that most systems do not maintain by default.",
    k: ["Per-voice records vs per-recording records: per-voice is simple and misses mixed datasets, per-recording is exact and heavy to maintain.", "Hard delete on revocation vs disabling use: deletion honors the person fully and may break customers, disabling is gentler and leaves data in place."],
    p: ["A trained voice has no link back to its consent record, so revocation cannot find all copies.", "Expired agreements are never checked at synthesis time, so voices stay live past the contract."],
    v: "Revoke a test speaker's consent and confirm requests for the voice are refused within the stated time, derived adapters and caches are listed for removal, and the audit log shows the chain from agreement to model.",
    dep: ["voice-registry", "audit-provenance", "data-licensing"]
  },
  "voice-registry": {
    s: "The store of voice models and their metadata: weights or embeddings, versions, ownership, access control, quality scores and deployment status.",
    d: "Each voice is an entry with its artifacts, the base model version it needs, its owner, who may use it, and links to consent and evaluation results. The registry feeds the catalog and the serving layer, which loads the right weights when a request arrives. Private voices are visible only to their owners. Entries move from training through evaluation and approval to production. It is hard because per-voice artifacts must be compatible with the base model, and base model upgrades can invalidate thousands of adapted voices at once.",
    k: ["Voices as small separable artifacts vs bundled with the full model: separable is cheap to store and swap, and ties each voice to a base version.", "Central registry vs per-region copies: central is consistent, regional copies cut load latency and risk drifting apart."],
    p: ["A base model upgrade ships and old private voices fail to load for their owners.", "Access control is checked at catalog listing but not at synthesis time, so a known id works for anyone."],
    v: "Promote a test voice, then request it as its owner, as another account and after deprecating it. Only the owner succeeds before deprecation, and the registry shows the exact weights, base version and approvals used.",
    dep: ["consent-records", "model-versioning"]
  },
});
