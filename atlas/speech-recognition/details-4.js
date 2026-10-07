// Details for the speech recognition plate, part 4: capture, front end, training data, cross-cutting concerns.
ATLAS.details("speech-recognition", {
  "microphone-capture": {
    s: "Reading audio samples from a microphone through the operating system's audio interface, at a chosen rate and buffer size, with permission and device changes handled.",
    d: "The application requests the microphone, picks a sample rate, channel count and buffer duration, and receives blocks of samples on a real-time callback. The callback must copy data quickly into a buffer and never block. Devices can be removed, switched to headphones, interrupted by calls or muted by the system, and the capture layer must report these. Platform processing such as built-in noise suppression may already be applied. It is hard because behavior varies by device and operating system, and gaps or glitches in capture damage accuracy without producing an error.",
    k: ["Small capture buffers vs larger: small buffers cut latency but risk underruns and dropped samples, larger buffers are safe but add delay.", "Platform voice processing on vs raw audio: platform processing is tuned to the hardware and cheap, but its effects are invisible and can conflict with the recognizer's own."],
    p: ["The callback does work that blocks, so the audio thread misses deadlines and samples are lost.", "A device switch changes the sample rate and the stream is labeled with the old one."],
    v: "Record a reference signal such as a tone sweep and speech for ten minutes through the capture path; confirm no gaps, constant sample rate and expected levels, and repeat after plugging and unplugging headphones.",
    dep: ["audio-ring-buffer"]
  },
  "audio-decoding": {
    s: "Reading recorded audio from container and compression formats into raw samples, handling the codecs, headers and damage found in real-world files.",
    d: "Files arrive as many formats: lossless or lossy compression, telephone codecs, video containers with several audio tracks. The decoder extracts the chosen track, reads the declared sample rate and channel layout, and outputs linear samples. Lossy codecs and telephone codecs leave artifacts that affect accuracy, so the system records which source it came from. It is hard because headers lie, files are truncated, streams have variable rates or timing gaps, and a decoder bug can silently shift or distort audio.",
    k: ["Support many formats directly vs require a standard format upload: wide support is convenient for callers, but widens the attack surface and the testing burden.", "Decode on the edge vs in the worker: edge decoding keeps workers simple, worker decoding handles odd files with full context."],
    p: ["A file with a declared rate different from the actual is decoded at the wrong speed, and the transcript is garbage.", "Malformed files are fed to a decoder library with a memory safety flaw."],
    v: "Decode a corpus of files in each supported format, including truncated and mislabeled ones, and confirm duration matches the source, sample values match a reference decoder, and bad files fail with a specific error.",
    dep: ["sample-rate-conversion", "channel-handling"]
  },
  "sample-rate-conversion": {
    s: "Resampling audio from whatever rate it arrives at to the one the models expect, without adding aliasing or distortion.",
    d: "Models are trained at one rate, usually sixteen thousand samples per second, and audio at forty-four or forty-eight thousand is downsampled using a low-pass filter to remove frequencies that would fold back as noise. Telephone audio at eight thousand is upsampled, or served to a narrowband model. High-quality resamplers cost more compute but avoid artifacts. It is hard because upsampling cannot restore lost high frequencies, and the model can behave differently on upsampled narrowband audio than on true wideband.",
    k: ["Resample everything to one rate vs keep a model per rate: one rate is simple to operate, per-rate models are more accurate for telephone audio but multiply variants.", "High-quality filter vs fast filter: high-quality avoids artifacts that can hurt recognition, fast filters save compute at scale."],
    p: ["Downsampling without a proper filter folds high-frequency noise into the speech band, and accuracy falls.", "Telephone audio is declared as wideband after upsampling, and the system routes it to the wrong model."],
    v: "Resample a swept tone across the band and confirm no aliasing tones appear and the passband is flat within tolerance; compare transcripts of the original and resampled recording.",
    dep: ["audio-decoding"]
  },
  "channel-handling": {
    s: "Deciding how multichannel audio is treated: mixed down to one channel, recognized per channel, or processed jointly for spatial information.",
    d: "Stereo recordings of calls often hold each party on a separate channel, which makes speaker separation trivial and avoids overlap errors. Meeting recordings may mix everyone to one channel. Microphone arrays provide multiple channels for beamforming. The system records channel layout, converts as configured and labels results by channel. It is hard because mixing channels with opposite phase cancels speech, because channel assignments are not always as documented, and because per-channel recognition doubles compute.",
    k: ["Recognize each channel separately vs mix down: per-channel gives clean speaker labels and no overlap, but doubles compute and loses cross-channel context.", "Average the channels vs pick the best one: averaging uses all the signal but risks phase cancellation, picking the best is robust but discards information."],
    p: ["An out-of-phase stereo pair is averaged and the speech nearly vanishes.", "A mono recording duplicated into two channels is billed and processed as two speakers."],
    v: "Process a stereo call with each party on one channel and confirm results are labeled by channel, with no cross-talk, and that a deliberately out-of-phase file is not mixed to silence.",
    dep: ["audio-decoding"]
  },
  "jitter-buffer": {
    s: "A short buffer for audio arriving over a network that reorders packets, conceals losses and smooths uneven arrival so the stream reaches the recognizer as continuous samples.",
    d: "Packets of audio arrive late, out of order, duplicated or not at all. The buffer holds a small amount, tens to hundreds of milliseconds, sorts by sequence number, and releases samples at a steady rate. For missing packets it can fill with silence, repeat the last frame, or let the codec's concealment generate a guess. Larger buffers tolerate worse networks and add latency. It is hard because adaptive buffer sizing trades delay against gaps, and recognition degrades sharply when losses land mid-word.",
    k: ["Large fixed buffer vs adaptive buffer: fixed is simple and predictable, adaptive keeps delay low on good networks but varies and can underrun on a sudden change.", "Conceal losses vs mark them for the recognizer: concealment hides gaps from the model, but marks let the model or confidence scoring treat the region as unreliable."],
    p: ["Loss concealment fills gaps with plausible audio, and the recognizer confidently transcribes something never said.", "A growing buffer under network stress adds seconds of delay that never recovers."],
    v: "Replay a recording through a network emulator with loss and jitter profiles; confirm buffer delay stays within limit, output is continuous, and error rate rises smoothly rather than collapsing at moderate loss.",
    dep: ["audio-ring-buffer"]
  },
  "audio-ring-buffer": {
    s: "A fixed-size circular buffer that holds recent samples so producers and consumers can run at different paces without allocation or copying of old data.",
    d: "The capture or network thread writes at the head; the front end reads at the tail. The buffer also keeps recent history so that voice detection can look back and include the start of a word that triggered it. Sizes are chosen for the worst expected delay. Full buffers must either drop oldest audio or block the producer, and the choice depends on whether real-time or completeness matters. It is hard because races between threads cause subtle, rare corruption, and an undersized buffer loses audio only under load.",
    k: ["Drop oldest on overflow vs block the producer: dropping keeps live audio current but loses speech, blocking preserves audio but can stall capture and overrun the device.", "Lock-free single-producer design vs locks: lock-free is safe for real-time threads, but is restricted to one writer and one reader."],
    p: ["Overflows under load silently drop samples and the transcript has missing words with no logged error.", "Read and write positions race, and a rare corrupted block produces a click and a misrecognized word."],
    v: "Stress the buffer with a fast producer and a slow, then fast, consumer for hours with a counter pattern; confirm every sample arrives in order, and that overflow is counted and reported.",
    dep: []
  },
  "noise-suppression": {
    s: "Removing background noise from the signal before recognition, using spectral estimates or neural models, to improve intelligibility without distorting speech.",
    d: "Classical methods estimate the noise spectrum during pauses and subtract it. Neural suppressors predict a mask over the spectrum that keeps speech and attenuates the rest, and run in real time. The output goes to the recognizer or to a listener. For recognition, aggressive suppression can remove speech detail and lower accuracy relative to feeding the model noisy audio it was trained on. It is hard because suppression optimized for human listening introduces artifacts that harm recognition, and models trained with noisy data may do better without it.",
    k: ["Suppress before recognition vs train the recognizer on noisy audio: suppression is modular and helps weak models, training on noise often gives better accuracy without artifacts.", "Neural suppression vs classical: neural handles non-stationary noise such as speech babble better, but costs compute and can distort speech."],
    p: ["Suppression meant to improve call quality is left on and reduces recognition accuracy.", "Music or the speaker's own tone is treated as noise and removed along with real speech."],
    v: "Measure word error rate on noisy test sets with and without the suppressor at several noise levels; confirm it helps where enabled, and listen to a sample for distortion of speech.",
    dep: ["spectral-transform", "audio-ring-buffer"]
  },
  "echo-cancellation": {
    s: "Removing the device's own playback audio, such as music or an assistant's speech, from the microphone signal so it is not recognized as the user's words.",
    d: "An adaptive filter models the path from speaker to microphone and subtracts the predicted playback from what the microphone hears. It needs the playback signal as a reference and tight timing between playback and capture. Residual echo is suppressed further by a nonlinear stage. It lets users interrupt a speaking device. It is hard because the room changes the path constantly, playback and capture clocks drift, and double talk, where user and playback overlap, makes the filter diverge.",
    k: ["Linear filter plus residual suppression vs neural echo removal: the classical pair is well understood and light, neural methods remove nonlinear echo from small speakers but need more compute.", "Cancel on device vs on the server: device-side has the exact reference and timing, server-side cannot see playback."],
    p: ["Without a reference signal, an assistant hears its own speech and transcribes it as user input.", "Clock drift between playback and capture slowly breaks the filter, and echo returns after minutes."],
    v: "Play known speech from the device while a user speaks, then measure echo return loss and recognition accuracy on the user's speech; confirm the playback text is absent from the transcript and the filter holds for a long session.",
    dep: ["microphone-capture", "noise-suppression"]
  },
  "gain-control": {
    s: "Automatic adjustment of signal level so quiet and loud talkers, near and far, reach the model at a consistent amplitude without clipping.",
    d: "A controller measures short-term level and raises or lowers gain gradually, with fast attack on loud sounds and slow release. It runs on the analog stage, in the operating system or in software before features. Normalizing level helps models that are sensitive to absolute loudness. It also amplifies noise during silence, which voice activity detection must tolerate. It is hard because the controller reacts to noise as well as speech, because poorly tuned release makes word beginnings quiet, and because training data should match its behavior.",
    k: ["Fast adaptation vs slow adaptation: fast follows changing talkers but pumps noise between words, slow is smooth but misses a sudden loud or quiet speaker.", "Software gain control vs relying on feature normalization: software control protects against clipping, feature normalization is simpler but cannot fix clipped audio."],
    p: ["Clipped audio from an overdriven microphone is distorted beyond repair, and no later step restores it.", "Gain rises during silence and amplifies background noise into false speech detections."],
    v: "Feed speech at levels from very quiet to near clipping and confirm output level stays in a target range, clipping is reported, and recognition accuracy is stable across the levels.",
    dep: ["microphone-capture"]
  },
  "beamforming": {
    s: "Combining signals from several microphones to emphasize sound from the speaker's direction and suppress sound from elsewhere.",
    d: "Delay and sum alignment, or adaptive filters estimated from the data, steer a beam toward a talker, and neural beamformers learn the weights from multichannel input. Arrays appear in smart speakers, cars and meeting-room devices, and a direction estimate often selects the beam. Output is a single cleaner channel for recognition, or one channel per speaker. It is hard because it needs known or calibrated array geometry and synchronized channels, because moving talkers require tracking, and because reverberation limits gains.",
    k: ["Fixed beams vs adaptive beamforming: fixed beams are cheap and predictable, adaptive beamforming nulls interference but can suppress the target when direction is wrong.", "Beamform before recognition vs feed channels to a multichannel model: separate beamforming is modular, a multichannel model can learn the best use but needs array-specific training."],
    p: ["Direction estimation locks onto a loud noise source and the beam suppresses the user.", "Microphone gain mismatches between array elements degrade the beam in ways that tests with ideal arrays do not show."],
    v: "Play speech from known angles with interference from other angles and confirm signal-to-noise gain toward the target, and word error rate improvement versus a single microphone; test target movement.",
    dep: ["echo-cancellation", "dereverberation"]
  },
  "dereverberation": {
    s: "Reducing the smearing caused by room reflections, which blurs consonants and degrades recognition in large or hard-walled spaces.",
    d: "Reverberation convolves speech with the room's response, so each sound leaks into later ones. Linear prediction methods estimate and remove the late reverberation; neural models learn to restore clean spectra. Training with simulated room responses also makes recognizers robust without a separate step. Far-field devices such as smart speakers and meeting-room systems need it most. It is hard because rooms vary enormously, estimation needs several seconds of audio, and the processing can leave artifacts or remove speech cues.",
    k: ["Remove reverberation explicitly vs train on reverberant data: explicit removal is modular and helps any model, training on simulated rooms is simple and avoids artifacts but needs varied simulations.", "Offline estimation vs adaptive online: offline is more accurate but needs the whole recording, online tracks changes but starts poorly."],
    p: ["A room response estimated from a previous speaker position is applied after the speaker moves, and speech is distorted.", "Simulated rooms in training are unlike real rooms, so the benefit disappears in the field."],
    v: "Compare recognition error on far-field recordings in several real rooms with and without the step; confirm improvement in reverberant rooms and no loss in dry ones.",
    dep: ["spectral-transform"]
  },
  "voice-activity-detection": {
    s: "A classifier that marks which stretches of audio contain speech, so silence and noise are skipped, saving compute and shaping segmentation and endpointing.",
    d: "A small model, running on short frames, outputs a probability of speech for each. Smoothing, hangover and minimum duration rules turn it into segments. Its output starts recognition, supports endpointing, cuts long recordings at pauses and lowers cost by dropping silence. Devices may run it continuously at low power. It is hard because it must be extremely cheap, tolerate noise and music, and avoid clipping word beginnings, and errors in either direction have cost: false alarms waste compute and cause garbage, misses delete speech.",
    k: ["Energy thresholds vs learned detectors: energy thresholds are trivial but fail in noise, learned detectors are far more robust at small cost.", "Include pre-roll context vs start exactly at detection: pre-roll recovers the soft start of words, but adds buffering and compute."],
    p: ["Trailing and leading consonants are clipped because detection fired after the word began.", "Constant background noise holds the detector open, and the recognizer transcribes noise as words."],
    v: "Score against hand-labeled speech regions at several noise levels; confirm miss and false alarm rates at the operating point, that onset error is below the pre-roll, and that silent audio produces no segments.",
    dep: ["audio-ring-buffer", "spectral-transform"]
  },
  "wake-word-detection": {
    s: "An always-on, very small model that listens for a specific trigger phrase and wakes the full recognizer only when it hears it.",
    d: "A tiny network runs on a low-power processor over a few frames of features and outputs a score for the trigger phrase. When it passes a threshold, a larger verifier model may check the audio before the main recognizer starts. It must reach very few false activations per day while rarely missing real ones. Audio is kept local until it fires. It is hard because the trade between false accepts and false rejects is steep, the phrase must work for all voices and noise, and the model must fit in a tiny power and memory budget.",
    k: ["Single stage vs two-stage with verifier: single stage is the cheapest, two-stage reduces false activations by checking on a larger model at the cost of latency and power.", "Fixed phrase vs user-defined phrase: a fixed phrase can be trained with massive data and is accurate, user-defined phrases give flexibility but lower accuracy."],
    p: ["Television or radio speech containing the phrase triggers the device repeatedly.", "A threshold tuned in a quiet lab produces many false activations in a noisy home."],
    v: "Play hours of negative speech and media to measure false activations per day, and recorded trigger phrases from varied speakers to measure the miss rate; confirm both meet targets and no audio leaves the device before activation.",
    dep: ["voice-activity-detection", "mel-filterbank", "on-device-runtime"]
  },
  "audio-segmentation": {
    s: "Dividing audio into regions of speech, silence, music and other sound, so that only relevant parts are recognized and the pieces map back to the timeline.",
    d: "Classifiers label frames or segments, and smoothing joins them into regions with start and end times. Speech regions are further split at pauses or at maximum lengths for the model. Music or noise regions are skipped or marked in the output. The segment list drives parallel processing of long recordings and the offsets that restore times in the final transcript. It is hard because boundary decisions affect words directly, because speech over music is ambiguous, and because many regions of different types interleave in broadcast audio.",
    k: ["Split on pauses only vs also on acoustic change: pauses are simple and avoid cutting words, acoustic change finds speaker and scene boundaries but is less reliable.", "Skip non-speech regions vs transcribe everything: skipping saves compute, transcribing everything avoids losing speech mislabeled as music."],
    p: ["Singing or speech over music is labeled as music and skipped, and the words are lost.", "Regions are cut inside a word, and two partial words are mistranscribed."],
    v: "Compare segment boundaries to hand labels on varied audio; confirm speech recall is above target, boundaries rarely fall within words, and that segment offsets reproduce original timestamps.",
    dep: ["voice-activity-detection", "framing-and-windowing"]
  },
  "training-corpus": {
    s: "The collection of audio and matching transcripts used to train models, with its coverage of languages, accents, devices, noise and topics determining what the recognizer can do.",
    d: "Sources include licensed recordings, read speech, transcribed broadcast and call audio, user data collected with consent, and public datasets. Each item has audio, text, language, speaker and device metadata. Corpora run from hundreds to millions of hours. Balance matters: a corpus dominated by one accent or channel produces a model that favors it. It is hard because quality transcripts are costly, rights and consent limit use, and the gaps show up only as poor performance on groups and conditions the data does not cover.",
    k: ["Large noisy data vs smaller clean data: large noisy data often wins with enough filtering, but needs strong cleaning and risks inheriting systematic label errors.", "Real recordings vs synthetic speech: real recordings capture true variation, synthetic speech is cheap for rare words and languages but lacks natural variety."],
    p: ["A single accent or device dominates the data, and the model works poorly for everyone else.", "Data collected for one purpose is reused for training without the consent that covers it."],
    v: "Produce a data report listing hours by language, accent, channel, noise and domain with consent status per source; confirm coverage meets targets and every item can be traced to a source and license.",
    dep: ["transcript-alignment-and-filtering"]
  },
  "transcript-alignment-and-filtering": {
    s: "Checking that each training clip's transcript actually matches its audio, and discarding or correcting items where it does not.",
    d: "Weak transcripts, such as subtitles or user-typed text, often differ from what was said in timing, wording or omitted passages. A recognizer aligns the text to the audio and clips are scored by agreement; those below a threshold are dropped or realigned, and long recordings are cut into short, well-aligned segments. Text is normalized to spoken form. Filters also remove duplicates and corrupt audio. It is hard because the filter's own recognizer biases what is kept, favoring clean, easy speech, and removing the hard examples a model most needs.",
    k: ["Strict filtering vs permissive: strict keeps clean labels and speeds training, permissive retains hard, valuable examples but trains on label noise.", "Filter with the current model vs an independent model: current-model filtering is cheap, but reinforces its own biases and drops what it cannot yet recognize."],
    p: ["Filtering removes accented and noisy speech because the filter model fails on it, shrinking coverage.", "Duplicates between training and test data pass through and inflate evaluation."],
    v: "Sample items kept and rejected and have people verify the labels; confirm kept items are mostly correct, rejected items mostly wrong, and that rates of rejection are similar across accents and conditions.",
    dep: ["forced-alignment", "scoring-normalization"]
  },
  "waveform-augmentation": {
    s: "Modifying training audio by adding noise, room reverberation, speed changes and codec effects, so the model sees conditions beyond those in the recordings.",
    d: "Clean clips are mixed with noise at random signal-to-noise ratios, convolved with real or simulated room responses, speed- and pitch-perturbed, passed through telephone or compression codecs and clipped or level-shifted. Augmentations are chosen to cover expected deployments and are applied on the fly. The result is a model robust to conditions it would not otherwise see. It is hard because unrealistic augmentation wastes capacity or hurts clean speech, and gaps between simulated and real conditions limit the benefit.",
    k: ["Heavy augmentation vs light: heavy augmentation improves robustness in hard conditions, but can lower accuracy on clean audio and lengthen training.", "Simulated conditions vs recorded real ones: simulation is cheap and diverse, real recordings are accurate but limited."],
    p: ["Noise samples in training also appear in the test set, and measured robustness is overstated.", "Speed perturbation changes pitch and speaking rate in ways real speakers never do."],
    v: "Evaluate matched models with and without augmentation on real noisy, reverberant and codec-compressed test audio and on clean audio; confirm gains in hard conditions with small cost on clean.",
    dep: ["training-corpus"]
  },
  "pseudo-labeling": {
    s: "Using a strong model to transcribe unlabeled audio and then training on those machine transcripts, expanding data far beyond what people can transcribe.",
    d: "A teacher model transcribes large stores of audio; the outputs are filtered by confidence and agreement across models, and the surviving transcripts join the training data for a student, which can be the same size or smaller. Iterating gradually improves quality. It is a main route to new domains and languages. It is hard because the student learns the teacher's errors as truth, the filter selects the easy cases, and bias in the teacher compounds over rounds.",
    k: ["Aggressive confidence filtering vs keep more: aggressive filtering gives clean labels but skews toward easy speech, keeping more increases coverage and noise.", "Single iteration vs repeated rounds: one round is stable, repeated rounds keep improving but amplify systematic errors without fresh human labels."],
    p: ["Pseudo-labels of rare names are wrong in the same way every time, and the student treats them as consistent.", "Evaluation uses pseudo-labeled data, and the reported accuracy is measured against the teacher."],
    v: "Train with and without pseudo-labeled data and evaluate on human-transcribed test sets for each slice; confirm gains, and check that error on rare words and difficult accents has not worsened.",
    dep: ["confidence-scores", "training-corpus"]
  },
  "training-pipeline": {
    s: "The automated process that turns data and configuration into a trained, evaluated, packaged model, reproducibly and at scale across many accelerators.",
    d: "Stages include data preparation, feature or tokenizer building, distributed training with checkpointing, evaluation on frozen test sets, language model building and packaging into the format used by serving. Experiments are tracked with configuration, data versions and code revisions. Large runs take days to weeks and fail partway, so resumption matters. It is hard because everything must be reproducible, data loading can starve accelerators, and quiet bugs, such as a feature mismatch with serving, only show up in deployment.",
    k: ["Streaming data from storage vs local copies: streaming handles huge corpora, but throughput and shuffling quality depend on the storage system.", "One large run vs many small experiments: large runs reach the best accuracy but are costly to repeat, small experiments are cheap but may not transfer."],
    p: ["Training features are computed by different code than the serving front end, and accuracy drops only in production.", "A run resumes from a checkpoint with a different data order or learning rate state, and results are not reproducible."],
    v: "Re-run a past experiment from its recorded configuration and data version and confirm the same metrics within noise; confirm the packaged model reproduces evaluation scores when loaded in the serving stack.",
    dep: ["training-corpus", "spectrogram-augmentation", "waveform-augmentation", "model-registry"]
  },
  "model-registry": {
    s: "A versioned store of trained models and their companion files, such as vocabularies, language models and normalization rules, with metadata, evaluation results and approval state.",
    d: "Each entry bundles everything needed to run one model: weights, tokenizer, language model, lexicon, feature settings and post-processing configuration, with a content hash, the data and code versions that produced it, and evaluation scores. Stages such as candidate, approved and retired control where it may be used. Serving fetches entries by version. It is hard because the pieces must stay matched as a set, and because old versions must remain reproducible while callers still pin them.",
    k: ["Immutable versioned bundles vs mutable latest pointers: immutable bundles are reproducible and roll back cleanly, but cost storage and require explicit promotion.", "Whole-bundle versioning vs separate versions per component: whole bundles prevent mismatches, per-component versions allow faster independent updates."],
    p: ["A vocabulary file is updated without the matching model, and tokens map to the wrong words.", "Retired models are deleted while customers still pin them."],
    v: "Fetch a registered version in a clean environment and confirm hashes match, evaluation reproduces the recorded scores, and that a mismatched component set is rejected at load time.",
    dep: []
  },
  "error-mining": {
    s: "Finding the kinds of audio and words the production system gets wrong, using user corrections, low confidence, disagreement between models and sampled review, and sending them back as training data.",
    d: "Production traffic is sampled, where consent allows, and ranked by signals of likely error: low confidence, user edits or repeated queries, differences between the live and a stronger offline model. Selected clips go to human transcription, and the results enter training and test sets. Aggregate analysis shows which words, accents and conditions fail most. It is hard because retained audio is a privacy risk, error signals are biased toward noticeable errors, and fixing one cluster can shift errors elsewhere.",
    k: ["Collecting audio from production vs only synthetic hard cases: production audio shows true failures, but needs consent, security and retention controls.", "Fix by retraining vs by customization or rules: retraining generalizes but is slow, customization fixes a specific term quickly but accumulates special cases."],
    p: ["Only audio from users who opted in is mined, and their conditions are not representative.", "Mined examples are added to training with no matching test items, so progress cannot be measured."],
    v: "Trace a mined error from the production flag through transcription into a training or test set and confirm the next model fixes it on held-out cases of the same type without raising error elsewhere.",
    dep: ["human-review-loop", "confidence-scores", "training-corpus", "privacy-and-data-handling"]
  },
  "latency-versus-accuracy": {
    s: "The system-wide trade between how quickly words appear and how accurate they are, set by chunk size, look-ahead, beam width, model size and second-pass processing.",
    d: "Every technique that adds accuracy, such as more future context, wider search, larger models or rescoring, adds delay or compute. Applications sit at different points: voice commands need answers within a few hundred milliseconds, captions can wait a second or two, and transcription of recordings has no deadline. Operating points are chosen per use case and often need distinct models. The decision touches front end buffering, model architecture, decoding and endpointing together, and cannot be fixed in one layer.",
    k: ["One model at one operating point vs a family of models: one model is simple to operate, a family fits each application's needs but multiplies testing and serving.", "Commit early and revise vs wait and commit once: revising gives fast feedback with flicker, waiting is stable but delays."],
    p: ["Accuracy numbers quoted from offline runs are used to plan a live product that can only afford a fraction of that context.", "Latency targets are met in the lab and missed in the field because network and buffering were left out."],
    v: "Publish for each product use case a curve of error against end-to-end delay on a fixed test set, and confirm the deployed configuration lies on or near the curve and meets both of its targets.",
    dep: []
  },
  "privacy-and-data-handling": {
    s: "The rules and mechanisms controlling who can hear audio, how long it and its transcripts are kept, and whether it is used for training, enforced across every layer.",
    d: "Speech carries identity, health, location and other sensitive content, and voices are biometric. Decisions include on-device versus server processing, encryption in transit and at rest, retention periods, consent for training use, human review access, redaction and deletion on request. Logs and caches count as stored audio. Regulations vary by region and sector, and some require data to stay in a region. It is hard because convenience, debugging and quality improvement all pull toward keeping data, and a single stray log can undo a policy.",
    k: ["Keep no audio vs keep with consent for improvement: keeping nothing is safest, but removes the main source of error analysis and training data.", "Process on device vs on server: on-device keeps audio local, but limits model size and prevents central improvement."],
    p: ["Debug logging records raw audio or transcripts and bypasses retention rules.", "A deletion request removes the audio but not the derived transcripts, embeddings and training copies."],
    v: "Trace a test recording through every system, including logs, caches, backups and training sets; confirm retention matches policy, deletion removes every copy, and access is limited to approved roles and logged.",
    dep: []
  },
  "language-and-accent-coverage": {
    s: "Which languages, dialects, accents, ages and speaking styles the system must handle, and the data, models and tests needed to make each work well.",
    d: "Coverage is a product decision that shapes data collection, tokenization, models, post-processing rules and evaluation for each language. Widely spoken languages have abundant data; many have little. A shared multilingual model transfers knowledge to low-resource languages but compromises on each. Code-switching, regional vocabulary and non-native speech each need explicit data and tests. It is hard because quality gaps follow data gaps, and the average accuracy conceals who is served poorly.",
    k: ["One multilingual model vs per-language models: one model transfers across languages and is simpler to deploy, per-language models are more accurate for large languages and easier to update.", "Broad language count vs depth for fewer: breadth reaches more users, depth gives each a dependable experience."],
    p: ["A language is marketed as supported on the strength of a small test set that does not include regional accents.", "Post-processing rules written for one language are applied to another, damaging output."],
    v: "Publish per-language and per-accent error rates with test-set sizes and confidence intervals, and confirm each supported language meets its minimum quality and has formatting and text normalization rules.",
    dep: []
  },
  "acoustic-robustness": {
    s: "How well recognition holds up under noise, reverberation, distance, overlapping talkers, codecs and device differences the model did not train on.",
    d: "Real audio differs from training audio in countless ways, and a model that is accurate on clean read speech can be unusable in a car or a call center. Robustness comes from varied training data and augmentation, front-end processing, adaptation and tests that cover hard conditions. No single layer provides it. It is hard because the space of conditions is open ended, improvements for one condition can reduce accuracy in others, and failures are silent: the model outputs confident but wrong text.",
    k: ["Make the front end clean the signal vs make the model tolerate noise: cleaning is modular and helps older models, tolerance generally scores better and avoids artifacts.", "Broad training for all conditions vs separate models per condition: broad training is simpler to run, per-condition models are more accurate but need routing."],
    p: ["Benchmarks use clean audio, and the shipped system fails on the first noisy deployment.", "Robustness to one noise type is tested and assumed to cover all."],
    v: "Evaluate across a matrix of noise types, levels, reverberation and codecs, including recorded real-world audio, and confirm error degrades gracefully with condition severity and stays above the minimum on each.",
    dep: []
  },
  "model-version-consistency": {
    s: "Keeping the many pieces that must agree, models, vocabularies, features and post-processing, matched across training, serving, customization and clients, and stable across upgrades for callers.",
    d: "A recognizer is a chain of components that each assume the others' exact behavior: feature settings, tokenizer, language model, lexicon, normalization rules and output schema. A change in one breaks the rest silently. Callers also depend on stable output formatting and timestamps across versions. Versioned bundles, compatibility tests and pinned versions manage this. It is hard because mismatches produce plausible text rather than errors, and customers cannot tell which version produced a given transcript.",
    k: ["Frequent upgrades vs stable pinned versions: frequent upgrades deliver improvements, pinned versions protect customers' parsers and tuning at the price of maintaining old models.", "Strict compatibility checks at load vs trust deployment process: strict checks stop mismatches early, but add friction to fast changes."],
    p: ["A tokenizer change ships without retraining the language model, and a fraction of words are mangled.", "A customer's downstream parser fails after an update changed how numbers are formatted."],
    v: "Load each deployed model bundle and run a golden test set that checks exact output, including formatting and timestamps, and confirm the version is recorded in every result so a transcript can be traced to the exact bundle.",
    dep: []
  },
  "cost-and-compute-budget": {
    s: "The limit on compute, memory and money per hour of audio, which bounds model size, search width, redundancy and what features can be offered by default.",
    d: "Serving costs scale with audio duration and concurrent streams, so every added feature, such as a second pass, diarization or a larger model, multiplies cost. Batch processing on spare capacity is far cheaper than live. On-device compute shifts cost to the user's battery and hardware. Budgets are set per use case and tracked in compute seconds per audio second. It is hard because accuracy gains tend to cost superlinear compute, and cost depends on traffic mix that changes with customers.",
    k: ["Larger model per stream vs more streams per accelerator: larger models are more accurate, smaller models serve more users and may be distilled to nearly match.", "Always-on features vs opt-in: always-on is a better default product, opt-in keeps cost for users who value it."],
    p: ["Cost is estimated from benchmark averages, and a customer with long, noisy, many-speaker calls costs several times the estimate.", "A feature added for quality quietly doubles compute per stream and nobody notices until the bill."],
    v: "Measure accelerator seconds and memory per audio hour for each model and feature combination under production-like traffic, and confirm the totals match the cost model within tolerance.",
    dep: []
  },
});
