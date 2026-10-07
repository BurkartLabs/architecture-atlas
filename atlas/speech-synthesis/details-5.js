// Details for the speech synthesis plate, part 5: evaluation, safeguards, data and training, cross-cutting concerns.
ATLAS.details("speech-synthesis", {
  "listening-tests": {
    s: "Panels of listeners rate samples on a scale for naturalness or quality, producing the mean opinion score that remains the reference measure of speech quality.",
    d: "Listeners, ideally native speakers using good headphones in a quiet setting or a screened crowd platform, hear samples in random order, mixed with hidden reference recordings and anchors of known quality, and rate each on a five-point scale. Scores are averaged with confidence intervals. Rating instructions, sample selection and listener screening decide validity. Results are only comparable within one test, since the scale drifts between panels. It is slow and costly, so it is run at milestones, while automatic metrics cover the time in between.",
    k: ["Absolute rating vs side-by-side comparison: absolute scores track quality over time and are noisy, comparisons detect small differences and do not give a scale.", "Crowd listeners vs trained panel: crowds are cheap and fast with variable attention, trained panels are consistent and slow."],
    p: ["Comparing a score from last quarter's test with this quarter's, though the panel and anchors differ.", "Too few sentences or speakers produce tight intervals that do not generalize to the real workload."],
    v: "Run a test with hidden reference and low-quality anchors. The reference scores near the top, the anchor near the bottom, the confidence intervals are narrow enough to separate the systems, and screened-out listeners are logged.",
    dep: ["regression-corpus"]
  },
  "preference-tests": {
    s: "Listeners compare two or more versions of the same sentence and pick the better one, or rank several against a reference, to detect small differences quickly.",
    d: "In A/B tests listeners hear a pair in random order and choose, with an optional tie. Multi-stimulus tests with hidden reference and anchors, rated on a 0 to 100 scale, give finer detail for several systems. Preference tests require fewer listeners than absolute scoring to find a difference. They tell which is better, not how good either is, and they are sensitive to the choice of sentences. They are the routine gate before shipping a model update.",
    k: ["Forced choice vs allowing ties: forced choice gives clean statistics and adds noise when systems are equal, ties keep honesty and need more samples.", "Test on the production text mix vs a standard set: production text finds the real regressions, a standard set is comparable over time."],
    p: ["Testing only short sentences misses a regression in long-form stability.", "Listeners prefer louder samples, so an unmatched loudness decides the result."],
    v: "Run a pair of identical systems through the test as a control. The result is close to even, and a deliberately degraded version loses decisively, which shows the test can separate real differences.",
    dep: ["regression-corpus", "loudness-normalization"]
  },
  "round-trip-asr": {
    s: "Transcribes the generated audio with a speech recognizer and compares the words to the input, giving an automatic measure of intelligibility and a detector of skipped or invented words.",
    d: "For each test sentence the system synthesizes, the recognizer transcribes, and the word error rate against the normalized input measures how many words were lost, added or garbled. It catches alignment failures, hallucinated words and mispronunciations at scale, with no listeners. It is a proxy: the recognizer may be more tolerant than a person, may correct errors from context, and may fail on stylized or accented voices. Results must be compared against the same measurement on recorded speech from the same voice.",
    k: ["A strong recognizer vs a deliberately weaker one: a strong one forgives mistakes and hides defects, a weaker one is stricter and adds recognizer error.", "Compare to input text vs to normalized text: input text tests the whole pipeline and requires normalization of both sides, normalized text isolates the models."],
    p: ["A recognizer language model fills in a skipped word from context and the defect goes unnoticed.", "Word error improves while naturalness gets worse, because the metric ignores prosody."],
    v: "Measure word error on recorded speech and on synthesized speech of the same sentences. Synthesized error is close to the recorded baseline, and a seeded defect such as dropped words raises it measurably.",
    dep: ["regression-corpus"]
  },
  "speaker-similarity": {
    s: "Measures how closely generated speech matches a target speaker, using speaker embeddings from a verification model and, for important voices, listener ratings.",
    d: "An independent speaker encoder embeds the generated audio and a reference, and the cosine similarity is reported. It is used to evaluate clones, to check that style changes do not alter identity, and to verify that a designed voice is not too close to a real person. Automatic scores correlate with listener judgments imperfectly: encoders respond to channel and content, and can be fooled. For high-stakes cases, listeners judge whether two samples come from the same person.",
    k: ["Automatic similarity score vs listener ratings: automatic scores are fast and consistent and miss perceived identity, listeners are accurate and slow.", "Same encoder as used in training vs an independent one: the training encoder can be gamed by the model, an independent encoder is an honest check."],
    p: ["A model trained against one encoder scores high on it and sounds different to people.", "Similarity is measured on clean reference and tested on text of a different style, and the identity gap is overlooked."],
    v: "Score genuine pairs, impostor pairs and clone pairs. Genuine and impostor scores separate cleanly, clones score in the genuine range, and listener judgments agree with the automatic decision on a sample.",
    dep: ["speaker-embedding"]
  },
  "prosody-metrics": {
    s: "Automatic measures of pitch, duration and energy against references, and learned predictors of naturalness, used as quick indicators between listening tests.",
    d: "Distances on pitch contour, duration and energy compare generated speech with reference recordings of the same text, while learned quality predictors estimate a naturalness score from audio alone. They run on every build. They are useful for regressions and gross failures, and a poor guide to subjective quality: a flat voice can match averages, and a natural but different reading scores badly against a single reference. Metrics must be calibrated against listening tests periodically or they drift from what people hear.",
    k: ["Compare to a reference reading vs predict naturalness without one: references are objective and penalize valid alternatives, predictors need no reference and can be fooled.", "Many metrics tracked vs one headline: many metrics find specific regressions and invite arguments, one is clear and misleading."],
    p: ["Optimizing the model against the predictor raises scores while listeners hear no improvement.", "A shift in loudness or recording conditions moves the metric without changing quality."],
    v: "Correlate each metric with listening test results across several model versions. Use only the metrics with a stable correlation as gates, and verify a deliberately flattened voice gets worse scores.",
    dep: ["listening-tests", "pitch-accent", "duration-model"]
  },
  "regression-corpus": {
    s: "A fixed set of texts, voices and settings covering known hard cases, rendered by every candidate build and compared with previous renders.",
    d: "It contains normal sentences, long paragraphs, numbers, names, homographs, markup cases, multilingual text and previous bug cases, for every voice and language. Each build produces audio, which is scored by metrics and spot-checked by listeners. Differences from the last release are flagged by spectral distance. The corpus grows with every escaped bug. Its limit is coverage: speech systems fail on inputs nobody listed. Selected audio is archived for reproducible comparison across runtime and model changes.",
    k: ["Large corpus run on every build vs a small smoke set: large coverage finds more and takes hours, small is quick and passes real regressions.", "Compare by metric vs by listening: metrics scale and miss what ears catch, listening is decisive and slow."],
    p: ["The corpus never changes and the system is tuned to it.", "Non-deterministic sampling makes every comparison noisy, so the team ignores all differences."],
    v: "Introduce a seeded defect, such as a mispronounced word or dropped phrase, and confirm the corpus run flags it. Then check that a no-change rebuild shows differences below the noise threshold.",
    dep: ["round-trip-asr", "prosody-metrics"]
  },
  "quality-monitoring": {
    s: "Tracks quality and performance signals on live traffic: latency, error rates, audio anomalies, recognition-based intelligibility checks and user reports.",
    d: "A sample of production output is scored automatically for silence, clipping, truncation, duration out of proportion to text and round-trip word error. Latency percentiles and fallbacks are tracked per voice, language and model version. User feedback and support reports feed back as flagged examples. Alerts fire on shifts from the baseline. Privacy limits what can be kept: spoken text may be personal, so monitoring uses derived statistics and short retention. Detecting subtle degradations that do not break anything is the hard part.",
    k: ["Score a sample of real traffic vs synthetic probes: real traffic reflects use and carries privacy limits, probes are safe and miss real content.", "Alert on absolute thresholds vs change from baseline: thresholds are simple and ignore slow drift, baselines catch drift and need stable history."],
    p: ["Monitoring checks only latency, and a model that sounds worse passes every dashboard.", "Logging full text for diagnosis stores personal data without a retention limit."],
    v: "Release a deliberately degraded model to a canary slice. Alerts fire within the target time on at least one audio metric, the dashboards identify the model version, and no raw text appears in stored monitoring data.",
    dep: ["round-trip-asr", "regression-corpus", "audit-provenance"]
  },
  "consent-verification": {
    s: "Confirms that the person being cloned actually agrees, for example by having them read a fresh random phrase that is matched to the reference audio and logged.",
    d: "Before a clone is created, the requester must show that the speaker is present and consenting: a live reading of a unique prompt, a recorded statement, or a verified contract. The system compares the speaker in the consent audio with the reference using speaker verification, and checks liveness against replays and synthetic audio. The results are stored in the consent record. It cannot be perfect: determined attackers use stolen or synthesized audio, so it is combined with account identity checks and use monitoring.",
    k: ["Live challenge phrase vs uploaded signed agreement: a live challenge resists reuse and is quick, a document gives legal weight and is hard to bind to the audio.", "Strict verification for every clone vs lighter checks for own-voice use: strict is safer and slows users, lighter is easy and easier to abuse."],
    p: ["A recorded consent statement from one session is replayed for a different clone.", "The verification model is itself fooled by a clone made from the same speaker's public audio."],
    v: "Attempt cloning with the speaker present, with a replay of a previous consent clip, with a synthesized consent clip and with a different speaker. Only the first succeeds, and each attempt is logged with its decision.",
    dep: ["speaker-embedding", "synthetic-detection", "consent-records"]
  },
  "content-moderation": {
    s: "Checks the text to be spoken, and sometimes the output, for content the service forbids, such as fraud scripts, impersonation of officials, threats and sexual content involving minors.",
    d: "Classifiers and rule lists run on input text before synthesis, with stricter policy for cloned voices of real people and for realistic voices of public figures. Decisions are allow, block or flag for review. Context matters: the same words are acceptable in fiction or training material and harmful in a scam call. Output-side checks can catch what slipped through. The hard parts are false positives that block legitimate use, evasion by paraphrase, and non-English text where moderation models are weaker.",
    k: ["Block at request time vs review after the fact: blocking prevents harm and adds latency and false positives, after-the-fact review is lenient and finds harm late.", "One policy for all voices vs stricter for cloned real people: one policy is simple, tiered policy matches risk and needs voice classification."],
    p: ["Moderation is trained mainly on one language and misses abusive text in others.", "A blocked request is reworded and resubmitted until it passes, with no throttling."],
    v: "Submit a labeled set of allowed, borderline and prohibited texts in each supported language. Block and false-block rates meet their targets, and decisions are recorded with reason codes.",
    dep: ["voice-use-policy", "audit-provenance"]
  },
  "audio-watermarking": {
    s: "Embeds an inaudible, robust signal in generated audio that identifies it as synthetic and optionally traces it to the system and request.",
    d: "A watermark is added to the waveform, or generated into it, by a model that spreads a short payload across time and frequency so it survives compression, resampling, noise and trimming. A detector reads the payload from suspect audio. The payload may identify the provider, model and a request reference. Robustness is in tension with inaudibility and payload size, and adversaries try removal by filtering, re-recording or regenerating. A watermark proves origin only for audio of this system and says nothing about audio from others.",
    k: ["Embed after the vocoder vs train generation to include it: after-the-fact embedding works for any model and can be removed more easily, built-in watermarks are more robust and tied to one model.", "Detect only vs carry a traceable payload: detect-only is private and simple, a payload supports tracing and creates data to protect."],
    p: ["Watermark survives high-quality codecs and fails after phone-line compression plus re-recording.", "Audible artifacts appear at some loudness levels or on some voices."],
    v: "Watermark a test set, apply compression, resampling, noise, trimming and re-recording, and measure detection rate and false positives on unmarked speech. Detection stays above target under the listed transformations, and listeners cannot distinguish marked from unmarked audio.",
    dep: ["neural-vocoder", "audit-provenance"]
  },
  "synthetic-detection": {
    s: "A classifier that judges whether an audio clip is machine generated, used to screen consent samples, uploads and suspicious audio the service is asked about.",
    d: "Detectors are trained on many examples of real speech and speech from many generators, learning artifacts in spectrum and phase. They are used inside the system, to reject synthetic consent recordings, and outside it, to assess reports of misuse. Accuracy falls on new generators, new codecs and noisy channels, so detectors need continuous retraining. Scores are probabilities, not proofs, and are paired with watermark checks, which are decisive only for the provider's own output.",
    k: ["Train on known generators vs aim for generalization: specific training scores well on known sources, generalization is needed for new ones and is much less accurate.", "Threshold for low false alarms vs high detection: low false alarms avoid accusing real recordings, high detection catches more fakes and creates disputes."],
    p: ["A new generator or compression path defeats the detector without anyone noticing.", "A score is treated as evidence in a dispute without any error rates attached."],
    v: "Evaluate the detector on a held-out set of unseen generators, codecs and channels, and report detection and false positive rates by condition. A fresh generator not in training is included on a schedule.",
    dep: ["training-pipeline"]
  },
  "voice-use-policy": {
    s: "The rules that say what each voice and account may do: who may clone, which voices are restricted, prohibited uses, required disclosure and the consequences of violations.",
    d: "Policy is written down and turned into enforceable checks: voice classes such as stock, customer-owned and cloned-from-person, with different permissions; blocked categories of impersonation, such as public figures and officials; required labeling for synthetic audio in some uses; and terms accepted by account owners. The checks live in the API, the cloning pipeline and moderation. Policies change with law and incidents, so enforcement points must read from one policy source rather than hard-coded rules.",
    k: ["Hard-coded enforcement vs a policy engine: hard-coded is simple and slow to change, a policy engine adapts quickly and needs governance of changes.", "Allow by default with monitoring vs deny by default with approval: allow-by-default is open and discovers abuse after harm, deny-by-default prevents more and slows legitimate users."],
    p: ["Different services enforce different versions of the same policy.", "A policy forbids public-figure voices, and no list or matcher exists to enforce it."],
    v: "Attempt each prohibited action through every entry point: API, console, batch and cloning. Each is blocked with the same reason code, and a policy change takes effect everywhere within the stated time.",
    dep: ["consent-records", "voice-registry"]
  },
  "abuse-throttling": {
    s: "Detects patterns that suggest misuse, such as bulk generation of scam scripts or repeated cloning attempts, and limits, challenges or suspends the accounts involved.",
    d: "Signals include request volume, content categories flagged by moderation, clones created per account, many different cloned voices of unrelated people, newly created accounts, and anomalous geography. Rules and models combine them into a risk score that triggers friction such as stricter limits, extra verification or manual review. Enforcement must be proportionate and appealable. Attackers rotate accounts, so account-level signals are joined with payment, network and device signals within privacy limits.",
    k: ["Automatic suspension vs human review: automatic action is fast and wrongly punishes legitimate users, review is accurate and slow.", "Account-level limits vs identity-level linking: account limits are simple and evaded by new accounts, linking is effective and raises privacy concerns."],
    p: ["Legitimate high-volume customers are throttled during a product launch.", "Abusers spread requests across many accounts so no single one crosses a threshold."],
    v: "Replay simulated abuse patterns and normal heavy-use patterns through the system. Abusive accounts are limited within the target time, legitimate heavy users are not, and every action has a logged reason and an appeal path.",
    dep: ["content-moderation", "quotas-and-billing", "audit-provenance"]
  },
  "audit-provenance": {
    s: "Records who generated what, with which voice and model, under which consent, in a form that supports investigation, deletion requests and compliance reporting.",
    d: "Each request logs account, voice and model version, text hash or text under a retention rule, settings, time and a reference to the stored or watermarked audio. Voice records link to training data and consent. Logs are append-only and access-controlled. When misuse is reported, an investigator takes a clip, reads the watermark, and traces the request. The conflict is with privacy: text and audio can be personal, so logs keep as little as will answer the questions that need answering, for as short a time as the obligations allow.",
    k: ["Log full text vs only a hash: full text supports investigation and creates a store of personal data, hashes protect privacy and can confirm only known text.", "Longer retention for traceability vs short for privacy: long retention helps investigations and widens exposure, short limits both."],
    p: ["Logs omit model version, so a reported clip cannot be tied to a model.", "Audit logs are writable by the same operators whose actions they record."],
    v: "Generate watermarked test audio, then trace it from the clip to the request, account, voice and consent record using only the logs. Verify the log entry exists, is complete and expires on the retention schedule.",
    dep: ["consent-records", "audio-watermarking"]
  },
  "recording-scripts": {
    s: "The texts a voice talent reads, designed for phonetic and prosodic coverage, domain relevance and a natural, consistent delivery over many hours.",
    d: "Scripts are selected from large text sources by an algorithm that maximizes coverage of phoneme sequences, stress patterns, sentence types and the target domain vocabulary, then reviewed and cleaned. They include questions, lists, numbers, names and styles that the product needs. Styles are scripted separately. The talent needs readable text, breaks and direction. Good scripts reduce the hours required. The trade-off is that coverage-driven text is unnatural to read, and a talent reading odd sentences for hours delivers odd prosody.",
    k: ["Coverage-optimized sentences vs natural domain text: coverage reduces hours and reads unnaturally, domain text sounds natural and covers less.", "Short sentences vs long passages: short sentences are easy to segment and align, long passages teach connected prosody and fatigue the talent."],
    p: ["A script with rare words the talent cannot pronounce yields inconsistent recordings.", "No questions or exclamations are in the script, so the voice cannot produce them."],
    v: "Count phoneme-in-context coverage and sentence types in the script against targets. A pilot recording confirms the talent can read it naturally, and the trained voice handles each type in listening.",
    dep: ["phoneme-inventory", "pronunciation-dictionary"]
  },
  "studio-recording": {
    s: "Recording of the talent in a treated room with consistent microphone, distance, gain and delivery, supervised by a director who checks pronunciation and consistency.",
    d: "Recording takes many hours across sessions. Equipment, room, microphone position and processing are fixed and documented, because changes appear as different voices to the model. A director follows the script, marks errors and has lines repeated. Talent hydration, fatigue and pace are managed across days. Lossless audio is kept with session metadata. Style-specific sessions are separate. The practical hazard is drift: the talent's voice changes over weeks, and the sound of the room and chain varies, which the model learns as noise.",
    k: ["Few long sessions vs many short ones: long sessions are consistent and tiring, short sessions keep energy and risk drift between them.", "Direct the performance vs let it be natural: direction gets expressive, usable styles and may sound forced, natural reading is relaxed and flat."],
    p: ["Microphone placement changes between days and the model learns two voices.", "Mispronounced words are left in because no one reviewed the takes."],
    v: "Compare spectra and loudness across sessions to detect drift. Check a sample of takes against the script for errors, and confirm the recordings pass noise floor and clipping thresholds before they reach training.",
    dep: ["recording-scripts", "data-licensing"]
  },
  "segmentation-cleaning": {
    s: "Cuts recordings into utterances and removes or repairs bad segments: noise, clicks, mispronunciations, overlapping speech and long silences, before the data is used for training.",
    d: "Long recordings are split at pauses, aligned to text, and filtered by automatic checks: signal-to-noise ratio, clipping, speaker consistency, loudness, and agreement between recognized and scripted words. Bad segments are removed or sent for review. Silence at the edges is trimmed to a standard length, as models learn pauses from it. Enhancement may be applied to found audio and is risky on studio data. Over-cleaning removes breaths and natural variation the model should reproduce, and under-cleaning teaches it noise.",
    k: ["Strict filtering vs keep more data: strict filtering gives a clean voice and fewer hours, keeping more helps coverage and teaches artifacts.", "Enhance noisy audio vs discard it: enhancement saves rare data and leaves traces, discarding is clean and costs data."],
    p: ["Trimming silence too hard removes the natural pauses, and the voice speaks without breath.", "A recognizer-based filter removes accented or unusual words that were correctly read."],
    v: "Audit a random sample of kept and rejected segments by listening. Kept segments have no audible defects, rejected ones are mostly defective, and the pause-length distribution matches the original recordings.",
    dep: ["studio-recording", "forced-alignment"]
  },
  "forced-alignment": {
    s: "Matches the transcript to the audio at phoneme level, providing the start and end of every sound used to train duration models and align acoustic training.",
    d: "An alignment model takes the audio and the phoneme sequence and finds the most likely timing, constrained to follow the text order. Results give boundaries, pronunciation variants chosen by the speaker and silences. Quality of alignment determines quality of duration and prosody training targets. It fails when the transcript differs from what was said, when audio is noisy, or when the pronunciation dictionary lacks the speaker's variant. Alignment is usually checked by confidence scores and spot listening to boundary placement.",
    k: ["External aligner vs alignment learned within training: external gives explicit, inspectable durations and depends on the aligner's accuracy, learned alignment needs no extra tool and is harder to debug.", "Dictionary pronunciations only vs allow variants: dictionary only is rigid, variants match real speech and lengthen search."],
    p: ["A transcript error shifts all subsequent boundaries within the file.", "Alignments assume a dictionary pronunciation, so a different spoken variant gets stretched and the duration targets are wrong."],
    v: "Compare automatic boundaries with hand-labeled ones on a sample and report error in milliseconds. Low-confidence utterances are flagged, and listening to cut-up phonemes confirms the boundaries.",
    dep: ["pronunciation-dictionary", "transcript-verification"]
  },
  "transcript-verification": {
    s: "Checks that the text matches what was actually said, with automatic comparison to recognition and human review of disagreements, so training pairs are correct.",
    d: "Scripted recordings still differ from the script: talents add words, skip them, or fix awkward phrases. Found or crowdsourced audio has transcripts of uncertain quality. A recognizer transcribes each clip, and mismatches above a threshold go to human review or are corrected to the spoken words. Normalized text and phonemes are re-derived from the corrected transcript. Verified text is a requirement: a model trained on mismatched pairs learns to skip or invent words, which later appears as hallucination in synthesis.",
    k: ["Correct the transcript to match the audio vs re-record: correcting is cheap and keeps the data, re-recording preserves the script and costs studio time.", "Automatic verification only vs adding human review: automatic is cheap and misses subtle differences, human review is accurate and slow."],
    p: ["The recognizer and the script agree on an error because both normalize numbers the same wrong way.", "Silently dropping mismatches removes all hard words and biases the data toward easy text."],
    v: "Review a random sample of accepted pairs manually and measure the transcript error rate, which stays under the target. Track what categories of mismatch were removed so the data is not skewed.",
    dep: ["segmentation-cleaning"]
  },
  "data-licensing": {
    s: "The contracts and records giving the right to train on and synthesize from each recording, including the talent's agreement on uses, duration, compensation and revocation.",
    d: "Each dataset has an owner, a license, and a definition of permitted uses, such as training, synthesis for specific products, resale, and derived voices. Talent agreements cover likeness, change of terms, and what happens at expiry. Public speech data comes with its own license terms, and some forbid synthesis or commercial use. Metadata links every training utterance to its agreement, so a model's lineage can be audited. It is a legal matter that has an engineering dimension, as most pipelines do not track provenance per file unless someone builds it.",
    k: ["Use only data with clear commercial rights vs use broad found data: clear rights limit scale and reduce legal exposure, broad data adds volume and unclear terms.", "Talent buyout vs per-use royalties: a buyout is simple and may be refused, royalties share upside and require metering."],
    p: ["Public dataset with a non-commercial license is mixed into a production training set.", "No link from model back to training files, so a revocation cannot be honored."],
    v: "Pick a deployed voice and trace it to every training file and the agreement covering each. Every file has a license record, and the permitted uses include the deployment in question.",
    dep: ["consent-records"]
  },
  "training-pipeline": {
    s: "The automated process that turns verified recordings into trained models: feature extraction, training of each model, checkpoint selection, evaluation and release packaging.",
    d: "Data is converted to phonemes, spectrograms and speaker labels, and models are trained in stages: text and acoustic model, vocoder or codec, speaker encoder, with large multi-speaker pretraining followed by voice-specific adaptation. Runs track configuration, data versions and metrics. Checkpoints are chosen by listening and metrics, not loss alone. Artifacts are versioned with their compatibility information. It is hard because training is expensive, results vary with seeds, and the choice that minimizes loss is often not the one that sounds best.",
    k: ["Large pretraining plus adaptation vs train each voice from scratch: pretraining gives quality from little data and a heavy upfront investment, scratch needs hours of studio data per voice.", "Train all models jointly vs separately: joint training can optimize end-to-end and is unstable, separate training is modular and compounds errors."],
    p: ["The checkpoint with the lowest loss is released and sounds worse than an earlier one.", "Training data and code versions are not recorded, so a good model cannot be reproduced."],
    v: "Re-run training from recorded configuration and data versions and confirm the resulting model scores within the seed variation of the original on the regression corpus. Release packages carry metadata on data, code and evaluation.",
    dep: ["forced-alignment", "transcript-verification", "data-licensing", "regression-corpus"]
  },
  "latency-budget": {
    s: "A decision about how many milliseconds each stage may spend, set from the product's interaction needs and enforced on every model and protocol choice.",
    d: "Conversational use wants audio within a few hundred milliseconds of text arriving, and everything on the path takes a share: network, queueing, front end, lookahead, acoustic generation, vocoding, encoding and playback buffering. The budget turns into constraints: how long the first chunk can be, how many sampling steps are allowed, which models fit, and what batching delay is tolerable. It is a cross-cutting decision because quality improvements usually cost latency, and offline use can accept more. Budgets are measured at the client, as percentiles, not on the server.",
    k: ["Tight budget favoring responsiveness vs relaxed budget favoring quality: tight budgets allow conversation and exclude the best models, relaxed budgets allow fidelity and fit only non-interactive use.", "One budget for all uses vs per-product tiers: one budget is simple, tiers serve each product at higher engineering cost."],
    p: ["Each team meets its own stage target and the sum exceeds what users tolerate.", "Budgets are set on average latency and the tail is ignored."],
    v: "Measure end-to-end time to first audio at the client, broken down by stage, for the 50th, 95th and 99th percentiles. Every stage's measured share fits its allocation and the total meets the product target.",
    dep: ["first-audio-latency", "dynamic-batching", "lookahead-buffer"]
  },
  "variability-reproducibility": {
    s: "A decision about whether the same input must produce the same audio, or may vary, which affects caching, testing, sampling in models, and user perception of naturalness.",
    d: "Stochastic models give different audio on each call, which sounds lively and makes tests, caches and legal records harder. Deterministic settings fix seeds and use stable kernels, giving repeatable output at some cost to variety. Differences also come from hardware, runtime versions, batch composition and floating-point order, even with fixed seeds. Products with fixed prompts want exact repeatability, and conversational ones prefer variation. The decision shapes what regression tests can compare and what the cache may return.",
    k: ["Deterministic output vs sampled variation: determinism supports caching, audits and tests and sounds repetitive, variation sounds natural and is difficult to test.", "Bitwise reproducibility vs perceptual equivalence: bitwise reproducibility is checkable and constrains hardware and runtimes, perceptual equivalence is flexible and judged by metrics."],
    p: ["Batch composition changes numerical results, so one request produces different audio depending on its neighbors.", "A cached clip and a newly generated one for the same text differ audibly in one conversation."],
    v: "Synthesize the same request repeatedly across workers and times with deterministic settings. Outputs are identical or within the stated numeric tolerance, and with variation on, outputs differ and all remain within quality limits.",
    dep: ["audio-cache", "regression-corpus", "model-runtime"]
  },
  "consent-and-privacy": {
    s: "Decisions on whose voice and whose text the system may use, what is stored and for how long, and how permissions can be withdrawn, applying to data, models, caches and logs.",
    d: "Voices belong to people, and the text spoken may be personal. The system has to decide what to retain, who can access voices, how consent is captured and revoked, and where processing may occur. These decisions determine data flow, from consent verification through training data, voice models, caches and logs, to deletion. Retrofitting is very hard because artifacts spread: a revoked voice may exist in training sets, adapter files, cached audio and CDN copies. Regulation adds requirements on biometric data and on disclosure of synthetic speech.",
    k: ["Retain text and audio for debugging vs process transiently: retention helps support and quality work and creates liability, transient processing is private and harder to diagnose.", "Central processing vs on-device for sensitive content: central allows the best models, on-device keeps data local with weaker voices."],
    p: ["Training data lineage is not recorded, so revocation cannot find all derived models.", "Caches and logs outlive the retention policy applied to the primary store."],
    v: "Run a revocation and a deletion request end to end for a test speaker and a test user. All derived models, caches and logs are located and handled within the stated deadline, with a report.",
    dep: ["consent-records", "audit-provenance", "cache-invalidation"]
  },
  "language-and-voice-coverage": {
    s: "A decision about which languages, dialects, voices and styles to support, and at what quality, given data availability, market need and the cost of maintaining each.",
    d: "Each language needs a front end with normalization grammars, lexicons, a phoneme inventory, and speech data from native speakers, plus evaluators who can judge quality. Each voice multiplies this with styles and versions. Low-resource languages are sometimes supported by sharing models with related languages, at lower quality. Coverage decisions are product decisions with engineering consequences: every addition must be tested, monitored and maintained forever. Quality is uneven, and the average of supported languages hides the weakest.",
    k: ["Few languages at high quality vs many at moderate quality: depth builds trust and covers fewer users, breadth reaches more people with visible rough spots.", "Dialect-specific voices vs a standard dialect: dialect voices sound right to local users and multiply cost, a standard dialect is cheap and alienates some."],
    p: ["A language is launched with the front end of a related language and mispronounces numbers and names.", "No native evaluators are available, so defects remain unseen."],
    v: "For every supported language and voice, run the regression corpus and a native-listener test. Each meets the minimum quality bar, and coverage is published with the known limitations.",
    dep: ["cross-lingual-sharing", "locale-conventions", "voice-catalog"]
  },
  "cost-per-audio-second": {
    s: "A decision about the compute, storage and human cost allowed per second of generated audio, which constrains model size, sampling steps, batching and where inference runs.",
    d: "Accelerator time per second of audio, divided by utilization, is the dominant serving cost, and it varies by model family, voice quality tier and traffic shape. Idle capacity, cold starts, caching hit rates and failed or cancelled work are the hidden terms. Offline voice recording and training are fixed costs spread over usage. Pricing then reflects this, so features such as higher fidelity are priced separately. The target cost determines which architectures are viable, and cost modeling must be done early, since a model that sounds best may be unaffordable at scale.",
    k: ["Best-quality model for all traffic vs tiered models: one model is simple and wasteful for easy uses, tiers match cost to need and add routing and testing.", "Over-provision for latency vs run hot for utilization: over-provisioning is responsive and expensive, high utilization is cheap and fragile at spikes."],
    p: ["Cost is measured per request and not per second of audio, hiding long outliers.", "Cancelled and cached requests are excluded from the model, and real spend exceeds forecast."],
    v: "Compute cost per hour of audio from billing and fleet metrics for each voice tier and compare with the model's forecast. The gap stays within tolerance, and the cost of cancelled and failed work is reported separately.",
    dep: ["accelerator-pool", "dynamic-batching", "audio-cache"]
  },
  "model-versioning": {
    s: "A decision about how models, lexicons, front-end rules and voices are versioned, which combinations are compatible, how long old versions are kept and how upgrades roll out.",
    d: "The pipeline is a chain of components that must agree: phoneme inventory, front end, acoustic model, vocoder or codec, speaker embeddings and adapters. A change in one can break another or alter the audio. Versions are recorded per voice and per request, compatibility is declared, and rollouts are gradual with listening checks. Customers depend on stable sound, so changes need notice and an option to pin. Old versions cost memory and operations. Cache keys, logs and consent records all include the version to make results traceable.",
    k: ["Frequent silent improvements vs pinned versions with scheduled upgrades: silent improvements keep quality current and surprise customers, pinned versions are predictable and cost long maintenance.", "Independent component versions vs bundled releases: independent versions allow fast iteration and a compatibility matrix, bundles are simpler and slow."],
    p: ["A new front end changes pronunciations while customers' cached audio and recorded demos still use the old ones.", "Adapters trained on one base model are loaded on another and produce garbled output."],
    v: "For each release, verify the compatibility matrix by loading every supported combination and synthesizing a fixed test set. Incompatible combinations are refused at load time, and a pinned version continues to produce the same audio.",
    dep: ["voice-registry", "cache-keys", "regression-corpus"]
  },
});
