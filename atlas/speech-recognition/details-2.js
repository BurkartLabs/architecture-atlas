// Details for the speech recognition plate, part 2: streaming, customization, post-processing, speakers.
ATLAS.details("speech-recognition", {
  "audio-chunking": {
    s: "Cutting the incoming sample stream into fixed-size pieces, typically a few hundred milliseconds, that are fed to the streaming model one at a time.",
    d: "The chunk size sets the floor on latency, since the model cannot answer for audio it has not received, and sets compute efficiency, since larger chunks use accelerators better. Chunks may overlap or carry left context so the model sees what came before the cut. Client send intervals, network packets and model chunks are different sizes, so a buffer reassembles them. It is hard because boundaries cut through phonemes, and a model trained on one chunk size performs worse at another, so chunking is a trained property, not a free setting.",
    k: ["Small chunks vs large chunks: small chunks cut latency and return results sooner, but lower accuracy and waste compute on per-chunk overhead.", "Fixed chunk size vs variable chunks trained together: variable training lets one model serve several latency settings, but costs training time and some accuracy at each size."],
    p: ["Serving with a chunk size the model never trained on raises error noticeably, with no failure signal.", "A short final chunk is padded with silence, and the last word is cut off or misrecognized."],
    v: "Transcribe a recording at several chunk sizes and confirm error rate and first-result latency move in the documented direction, and that a transcript produced from chunks equals the model's whole-file result within tolerance.",
    dep: ["audio-ring-buffer", "streaming-encoder-state"]
  },
  "streaming-encoder-state": {
    s: "The cached activations and context a streaming acoustic model keeps between chunks, so each new chunk is processed without recomputing earlier audio.",
    d: "Convolution layers keep the last frames they need; attention layers keep a bounded window of past keys and values; recurrent layers keep hidden state. Each session owns its own cache, whose size sets how many streams fit in memory. Limited left context bounds that memory but also limits what the model can use. The state must be saved, moved or discarded correctly on session start, pause and failure. It is hard because bugs here are silent: a stale or mismatched cache produces plausible but wrong text.",
    k: ["Bounded left context vs full history: bounded context caps memory and latency per stream, but loses long-range cues such as speaker or topic.", "State on the accelerator vs state in host memory: accelerator state is fast but limits stream count, host state scales but adds transfer time per chunk."],
    p: ["A cache is not reset between sessions on a reused slot, and the first words of a new call reflect the previous speaker.", "Cache size grows with call length and memory is exhausted on very long sessions."],
    v: "Run one stream alone and again interleaved with many others on the same worker; confirm identical transcripts, and confirm a new session on a reused slot starts exactly like a fresh one.",
    dep: ["acoustic-encoder", "session-management"]
  },
  "lookahead-and-latency-budget": {
    s: "The trade between how much future audio the model may see before committing to words and how soon those words can be shown.",
    d: "Seeing a few extra frames of right context improves accuracy because the end of a sound clarifies its start, but every frame of look-ahead is delay. The budget adds up from capture buffering, network, chunking, look-ahead, model compute, decoding and delivery. Designers allocate it across stages: for voice commands the total might be a few hundred milliseconds, for captions a second or two is acceptable. It is hard because the stages interact, and a saving in one, such as a smaller chunk, often costs accuracy that another must buy back.",
    k: ["Zero look-ahead vs several frames of look-ahead: zero is the fastest, but substantially less accurate on word endings, a few frames recover most of the gap.", "Fixed budget for all uses vs per-application budgets: fixed is simpler to run, per-application serves captions and commands each well but multiplies model variants."],
    p: ["The budget is tracked as model time only, and buffering and network make up most of the delay users see.", "Accuracy is compared at different latencies between systems, so the comparison is unfair."],
    v: "Plot error rate against measured finalization and first-word delay for each configuration, and confirm the chosen operating point meets both the accuracy and latency targets of its application.",
    dep: ["audio-chunking", "acoustic-encoder"]
  },
  "partial-hypotheses": {
    s: "Provisional transcripts emitted while the speaker is still talking, which are updated as more audio arrives and replaced by a final result at the end of the utterance.",
    d: "After each chunk the decoder reports its current best hypothesis for the utterance so far. Early words may later change as context accumulates: a homophone resolves, or a number is completed. Partial results drive live captions, dictation display and early intent detection in assistants. Each carries a flag marking it non-final and an identifier of the utterance it belongs to. It is hard because the best hypothesis at one moment is not a prefix of the best at the next, so the display flickers unless the system controls revision.",
    k: ["Emit every change vs emit on a schedule: every change is the most current, but flickers and floods the client, scheduled updates are calmer but can lag.", "Best-path partials vs partials from a lattice prefix: lattice-based partials can be more stable, but cost more computation per update."],
    p: ["A downstream system acts on a partial result, such as executing a command, then the final text differs.", "Partials are logged as if they were final transcripts, inflating error measurements and storage."],
    v: "Stream a recording and record every partial; confirm each utterance ends with exactly one final that replaces them, that partial words usually persist, and that revision rate stays under its target.",
    dep: ["beam-search", "result-schema"]
  },
  "result-stabilization": {
    s: "Techniques that reduce how often displayed words change, such as holding back uncertain tail words or committing prefixes once they are unlikely to be revised.",
    d: "The system tracks how long each word has survived in successive partial hypotheses, and marks a prefix as stable when all competing hypotheses agree on it or when a stability score passes a threshold. Unstable trailing words may be shown in a lighter style or withheld. Some models are trained with a penalty for revisions. The cost is delay: waiting to commit adds latency. It is hard because users dislike flicker more than a small delay, but the right trade depends on the display: captions tolerate lag, a typing cursor does not.",
    k: ["Withholding unstable words vs showing them marked provisional: withholding looks clean but delays, showing provisional text feels responsive but can mislead.", "Commit by agreement of hypotheses vs by fixed delay: agreement adapts to difficulty, fixed delay is predictable and easy to reason about."],
    p: ["A word is committed too early and later proved wrong, with no way to correct it for a user who already read it.", "Stability thresholds tuned on clean speech fail on noisy audio, where hypotheses change constantly."],
    v: "Measure the share of words changed after first display, and the added delay, for several thresholds on a noisy and a clean set; confirm the chosen setting meets the flicker target within the latency budget.",
    dep: ["partial-hypotheses", "hypothesis-recombination"]
  },
  "endpointing": {
    s: "The decision that the speaker has finished an utterance, so the system can finalize the transcript and, in an assistant, respond.",
    d: "Simple endpointers wait for a fixed length of silence reported by voice activity detection. Better ones combine silence with the decoder's state, using trailing-silence tokens from the model, sentence completeness from a language model, or intent context such as expecting a number. Hard limits cap utterance length. Timeouts are tuned per task: short for commands, long for dictation with pauses. It is hard because both errors hurt: cutting a thoughtful pause truncates the user, waiting too long makes the system feel slow.",
    k: ["Fixed silence timeout vs model-based endpointing: a timeout is predictable and simple, but model-based decisions cut latency on completed sentences and wait through mid-sentence pauses.", "Server-side vs client-side endpointing: client-side reacts without network delay, but cannot use the full model and varies by device."],
    p: ["Slow speakers, people reading numbers aloud and non-native speakers pause longer and are routinely cut off.", "Background noise keeps voice detection active, so the utterance never ends until a hard time limit."],
    v: "On a set labeled with true end times, measure the share of utterances cut off early and the average delay after true end; confirm both stay within targets and compare against a fixed-timeout baseline.",
    dep: ["voice-activity-detection", "partial-hypotheses", "neural-language-model"]
  },
  "session-management": {
    s: "Creation, tracking and teardown of per-stream recognition state, including configuration, audio position, model assignment and cleanup after disconnects.",
    d: "A session starts with validated configuration, is assigned a worker and model, and receives a unique identifier. The manager tracks audio offset, last activity and results emitted so far. It enforces maximum duration, idle timeouts and resource limits, and releases cache and buffers on end. Some designs allow resuming a dropped session by identifier. It is hard because leaks accumulate: each abandoned session holds accelerator memory, and sessions end in many ways, including client crash, network loss and worker drain.",
    k: ["Resumable sessions vs one-shot sessions: resumable sessions survive network drops, but require replicated state and extra buffering of unacknowledged audio.", "Session timeouts short vs long: short timeouts reclaim capacity quickly, long ones tolerate users who pause to think."],
    p: ["Clients disconnect without a close message and their sessions hold memory until a timeout nobody tuned.", "Session identifiers are guessable, and one client can attach to another's stream."],
    v: "Open and abruptly drop many streams, then confirm the session count and accelerator memory return to baseline within the timeout, and that no worker retains cache from a closed session.",
    dep: ["audio-ring-buffer", "streaming-encoder-state"]
  },
  "long-form-segmentation": {
    s: "Splitting hours-long recordings into manageable pieces at natural pauses, so each fits the model's context and compute while the final transcript reads continuously.",
    d: "Segmentation uses voice activity detection or silence to cut at pauses, targeting pieces of a few tens of seconds, with overlap or carried context at boundaries. Segments are transcribed in parallel, then merged, with timestamps offset to the original recording. Some systems pass the previous segment's text as context to keep names and style consistent. It is hard because cuts in the middle of a word drop or duplicate it, models trained on short clips degrade on long ones, and parallel segments can disagree on spelling of the same name.",
    k: ["Cut at silence vs cut at fixed intervals: silence cuts avoid splitting words, but continuous speech with no pause yields oversized segments.", "Independent segments vs context carried across segments: independent segments parallelize fully, carried context improves consistency but forces sequential work."],
    p: ["A word split at a boundary appears twice, or not at all, in the merged transcript.", "Timestamps drift because each segment's offset was computed from decoded duration that differs slightly from the original."],
    v: "Transcribe a long recording with a known script both whole and segmented; confirm no words are lost or duplicated at boundaries, and the final timestamp error stays below the tolerance.",
    dep: ["audio-segmentation", "voice-activity-detection", "word-timestamps"]
  },
  "batch-job-queue": {
    s: "A durable queue that holds submitted recordings, schedules them onto available capacity by priority and retries failures, decoupling submission from processing.",
    d: "Jobs are persisted with their options and audio location, then claimed by workers, which report progress and heartbeats. Priorities let urgent jobs overtake bulk ones; fair-share rules stop one customer filling the queue. Failed jobs are retried a limited number of times and then marked failed with a reason. Throughput scales by adding workers on cheap or spare capacity. It is hard because jobs vary from seconds to hours of audio, so scheduling by job count misjudges load, and a poison file that crashes workers can cycle forever.",
    k: ["Scheduling by audio duration vs job count: duration reflects real work, but requires the duration to be known at submission.", "Retry on any failure vs retry only transient failures: broad retry hides flakiness, but repeats work on files that will never succeed."],
    p: ["A single customer's large backlog starves everyone else's jobs.", "A worker dies silently mid-job and the job stays marked in progress forever."],
    v: "Submit a mixed set of long and short jobs from two accounts, kill a worker mid-job, and confirm the job is reassigned and completes, and that the second account's jobs finish within their fair share.",
    dep: ["accelerator-scheduling"]
  },
  "vocabulary-boosting": {
    s: "Raising the likelihood of specified words or phrases during decoding, so names and terms the general model rarely saw are recognized.",
    d: "The caller supplies a list of words or phrases, optionally with a boost weight. The decoder adds a bonus to hypotheses that spell or contain those items, often through a prefix structure that applies the bonus as each piece of a word is matched. The same technique handles dynamic lists, such as a user's contacts. Phrases with several words are rewarded as they proceed. It is hard because bonuses that are too small do nothing and too large cause false insertions, so a boosted word appears in speech that merely sounds similar.",
    k: ["Decode-time boosting vs retraining the language model: boosting works instantly per request, but is crude, while retraining generalizes but takes time and data.", "Global weight vs per-phrase weights: a global weight is easy to use, per-phrase weights fit rare and common terms but require tuning effort."],
    p: ["A boosted name is inserted into unrelated sentences where something similar-sounding was said.", "Very long vocabulary lists slow decoding and lower accuracy for everything else."],
    v: "On audio containing the target terms, compare recall of those terms and overall error with and without the list; confirm recall rises substantially and overall error does not worsen on audio without the terms.",
    dep: ["beam-search", "pronunciation-lexicon", "shallow-fusion"]
  },
  "contextual-biasing": {
    s: "Steering recognition with information about the current situation, such as a contact list, a screen's contents or the question just asked, supplied or updated during the session.",
    d: "Context items are encoded as a trie, a set of phrases or an embedding that the model attends to, and can be swapped between utterances. Examples include expected answers to a prompt, names visible on screen, and recent conversation. Neural biasing modules learn to use the context during training; decode-time methods add bonuses. It is hard because most context is irrelevant to any given utterance, so the model must learn when to ignore it, and large context lists dilute the effect.",
    k: ["Trained biasing module vs decode-time bonuses: trained modules use context more cleverly, but need training on simulated context and a specific model, bonuses work with any model.", "Per-utterance context vs session-level context: per-utterance is precise but requires the application to supply it, session-level is easier but less targeted."],
    p: ["Context lists contain near-homophones of common words, and the model begins substituting them for the common words.", "Context carries private data, such as contacts, that is logged along with the request."],
    v: "Test with utterances whose correct answer is in the supplied context and others where it is not; confirm context items are recognized more often when present, and are not inserted when absent.",
    dep: ["vocabulary-boosting", "acoustic-encoder", "shallow-fusion"]
  },
  "custom-pronunciations": {
    s: "Caller-supplied spellings and pronunciations for unusual words, so the recognizer can match the sounds of brand names, acronyms and foreign words.",
    d: "An entry pairs a written form with one or more pronunciations, either as phoneme strings or as a sounds-like spelling. It is added to the lexicon used in decoding or used to generate extra training text and audio. In end-to-end models without a lexicon, the same effect comes from synthesized speech or biasing toward the written form. It is hard because users write pronunciations inconsistently, the phoneme inventory differs by language and accent, and one word can have several valid pronunciations.",
    k: ["Phoneme strings vs sounds-like spellings: phonemes are exact but need expertise, sounds-like spellings are friendly but rely on automatic conversion that may guess wrong.", "Adding to the lexicon vs generating synthetic training data: lexicon edits apply at once but only in lexicon-based decoders, synthetic data works on end-to-end models but needs retraining."],
    p: ["An entry using one accent's pronunciation fails for speakers with another, and the term is missed half the time.", "Invalid phoneme symbols are accepted silently and the entry has no effect."],
    v: "Add a pronunciation for an invented brand name, speak it through several speakers, and confirm it is recognized at a high rate; confirm an invalid entry is rejected with an error message.",
    dep: ["pronunciation-lexicon", "grapheme-to-phoneme"]
  },
  "oov-handling": {
    s: "How the recognizer deals with words absent from its vocabulary or training text, which are common in names, products and new terms.",
    d: "Subword models can spell out unseen words from pieces, so no word is strictly impossible, but they tend to produce close-sounding known words instead. Older systems used a fixed word list and emitted an unknown token. Remedies include adding words to the vocabulary, spelling-based fallback models and boosting. Names and loanwords are the main source. It is hard because out-of-vocabulary words are often exactly the content words that matter, such as a person or drug name, and errors on them are costly out of proportion to their share of the text.",
    k: ["Open vocabulary through subwords vs a closed word list: subwords can produce any word, but often misspell rare ones, a closed list is exact but fails on anything new.", "Frequent vocabulary updates vs stable vocabulary: updates keep up with new terms, but each change needs testing for side effects."],
    p: ["Error rate is reported on all words, and a high failure rate on new names stays invisible.", "An unknown word is replaced by a similar common word, producing a fluent but wrong sentence."],
    v: "Build a test set of sentences containing words absent from training and measure error on those words separately; confirm the rate is reported and that adding the words by customization lowers it.",
    dep: ["subword-vocabulary", "grapheme-to-phoneme", "vocabulary-boosting"]
  },
  "domain-adaptation": {
    s: "Tuning the language and acoustic models toward a specific field, such as medicine, law or a call center, using that field's text or recordings.",
    d: "Text adaptation interpolates a domain language model with the general one, or fine-tunes a neural language model, and is cheap since text is plentiful. Acoustic adaptation fine-tunes on transcribed audio from the domain, which captures its channel, jargon pronunciation and speaking style. Adapters or small added parameter sets let one base model serve many customers. It is hard because narrow tuning can make the model forget general speech, and because customers rarely have transcribed audio, only documents.",
    k: ["Text-only adaptation vs audio adaptation: text-only is easy and safe, but misses acoustic mismatch, audio adaptation helps more but needs costly transcription.", "Separate model per customer vs shared base with adapters: separate models are isolated, adapters share compute and storage but need routing at serve time."],
    p: ["Fine-tuning on a small domain set overfits and degrades performance on ordinary words in the same calls.", "Customer text containing private information is baked into a model shared with others."],
    v: "Evaluate the adapted and base models on in-domain and general held-out sets; confirm in-domain error falls and general error rises by no more than the allowed margin.",
    dep: ["neural-language-model", "ngram-language-model", "training-pipeline"]
  },
  "acoustic-adaptation": {
    s: "Adjusting the recognizer to a particular speaker, microphone or channel, using a short sample or by learning from the user's own corrected speech.",
    d: "Methods include feature transforms estimated from a few utterances, speaker embeddings fed to the model as an extra input, and small fine-tuned layers. Adaptation can run continuously on device, using the user's corrections as labels, or once at enrollment. It targets accents, atypical speech and unusual microphones. It is hard because a few utterances give little data, because adaptation can drift toward errors if it learns from the system's own outputs, and because personalized models raise privacy and storage questions.",
    k: ["Unsupervised adaptation vs supervised from corrections: unsupervised needs no labels but reinforces its own errors, supervised is reliable but needs user effort.", "On-device personalization vs server-side profiles: on-device keeps data private, server profiles are shared across devices but centralize personal data."],
    p: ["Adaptation on a noisy session degrades the profile, and later clean sessions are worse than before.", "A shared device adapts to one speaker and then serves another badly."],
    v: "For speakers with atypical speech, compare error before and after adaptation on held-out utterances; confirm improvement, and confirm resetting the profile restores baseline behavior exactly.",
    dep: ["speaker-embeddings", "feature-normalization", "privacy-and-data-handling"]
  },
  "customization-management": {
    s: "The service functions for creating, validating, storing, versioning and applying a caller's vocabulary lists, pronunciations and adapted models.",
    d: "Callers upload lists or training data to named resources. The service validates entries, rejecting unsupported characters, duplicates and oversized lists, compiles them into decoder structures, and reports build status. Resources are versioned, scoped to an account, and referenced by name in recognition requests. Lists are compiled once and cached, so requests pay no build cost. It is hard because compilation must be fast enough for interactive use, and because a bad list can quietly lower accuracy for a customer without any error.",
    k: ["Compile at upload vs compile per request: upload-time compilation keeps requests fast, but a compiled artifact must match the exact model version.", "Strict validation vs permissive acceptance: strict rejects questionable entries early, permissive avoids frustrating users but accepts entries that hurt."],
    p: ["A model upgrade invalidates compiled customizations, and requests quietly run without them.", "No quality check on customer lists, so a list of thousands of common words degrades accuracy."],
    v: "Create, update and delete a customization, confirm each version applies only when referenced, that a model upgrade triggers recompilation, and that a request naming a missing resource fails with a clear error.",
    dep: ["vocabulary-boosting", "custom-pronunciations", "model-registry"]
  },
  "inverse-text-normalization": {
    s: "Converting spoken-form words into written form: \"twenty three dollars\" to \"$23\", \"march third\" to \"March 3\", and spoken symbols and abbreviations to their usual notation.",
    d: "Rules written as weighted grammars or transducers match patterns of cardinals, ordinals, currency, dates, times, addresses and units, and emit written forms, with per-language variants. Neural taggers or sequence models handle ambiguous cases, such as whether \"one\" is a number or a pronoun. The step runs after recognition and before punctuation, or is folded into the recognizer. It is hard because spoken forms are ambiguous, conventions differ by locale, and a wrong conversion changes meaning, as in turning \"two\" and \"to\" into the wrong digit.",
    k: ["Rule-based grammars vs neural models: rules are predictable and auditable, but expensive to write per language, neural models generalize but can hallucinate digits.", "Convert in post-processing vs let the recognizer emit written form: post-processing keeps the model simple, direct emission uses acoustic context but needs formatted training text."],
    p: ["Ambiguous words such as \"one\" or \"to\" are converted to digits in the middle of a sentence.", "A locale rule applies a date order or decimal separator that the reader does not use."],
    v: "Run a test set of spoken numbers, dates, currencies and times through the step and compare to hand-written forms; confirm exact-match rate per category and that ambiguous words stay unconverted.",
    dep: ["entity-formatting", "scoring-normalization"]
  },
  "punctuation-restoration": {
    s: "A model that inserts periods, commas and question marks into unpunctuated recognized text, using the words and sometimes the pauses and intonation in the audio.",
    d: "A sequence tagger reads the word sequence and predicts a punctuation mark after each word. Text-only models are cheap and use language cues; models that also take timing or pitch features distinguish a question from a statement more reliably. Models run on streaming text with a short delay, since the right mark may depend on the next words. It is hard because spoken language has no fixed grammar, people differ in how they punctuate, and mistakes alter meaning, such as the placement of a comma in a list.",
    k: ["Text-only vs text plus prosody: text-only is simple and works for any source, prosody improves question detection but ties the model to the audio path.", "Separate punctuation model vs joint with the recognizer: a separate model can be updated independently, joint modeling uses acoustics directly but couples training."],
    p: ["A streaming system punctuates the partial text, then removes or moves marks when the final arrives.", "The model trained on written text puts periods where speakers merely paused, producing choppy fragments."],
    v: "On a set of human-punctuated transcripts, compute precision and recall per mark type; confirm question marks and periods meet the target and review a sample read aloud for meaning changes.",
    dep: ["capitalization", "neural-language-model"]
  },
  "capitalization": {
    s: "Restoring uppercase letters on sentence starts, names, acronyms and the pronoun \"I\", which recognizers generally output in lowercase.",
    d: "A tagger predicts case for each word using the surrounding text, often jointly with punctuation. It leans on lists of proper nouns and on casing rules per language, such as nouns being capitalized in some languages. Customization adds names that should keep an unusual case. It is hard because case is a property of the written convention, not the sound: names that are also words, brand-specific styling and acronyms spoken as words need knowledge of context.",
    k: ["Joint with punctuation vs separate step: joint modeling shares evidence such as sentence boundaries, separate steps are simpler to test and change.", "Context-based prediction vs dictionary lookup: context handles ambiguous names, dictionaries are exact for known terms but miss new ones."],
    p: ["Words such as \"may\" or \"apple\" are capitalized or not based on frequency alone, and mistakes read as careless.", "Customer brand names are lowercased because the vocabulary list stored them without their casing."],
    v: "Score on references with true casing and report case accuracy for names, acronyms and sentence starts separately; confirm customer-supplied casing is preserved in output.",
    dep: ["punctuation-restoration", "custom-pronunciations"]
  },
  "entity-formatting": {
    s: "Rendering spoken names, phone numbers, addresses, email addresses and similar structured entities in their conventional written format.",
    d: "Recognized words are matched against patterns such as digit sequences, letters spelled out, and spoken symbols like \"at\" and \"dot\". Grammars assemble them: \"j o h n at example dot com\" becomes an email address. Validation against format rules, such as lengths and check digits, catches impossible results. It is hard because speakers group digits in many ways, pause inside entities, and say letters that sound alike, and because a one-character error makes the entity useless even when most of the phrase is right.",
    k: ["Grammar-based assembly vs learned formatting: grammars give guaranteed valid structure, learned models handle messy speech but can emit invalid formats.", "Format when spoken in a recognized pattern vs always format: pattern-triggered formatting avoids damaging ordinary text, but misses entities spoken unusually."],
    p: ["Spelled letters like \"b\" and \"d\" are confused, and an email address is wrong with no indication.", "Digit strings in unrelated sentences are merged into a phone number."],
    v: "Test with recorded phone numbers, emails and addresses in several speaking styles; confirm exact entity match rate, and confirm invalid results are flagged as low confidence rather than presented as certain.",
    dep: ["inverse-text-normalization", "confidence-scores"]
  },
  "disfluency-removal": {
    s: "Optionally dropping fillers, repetitions, false starts and self-corrections so the transcript reads as written text rather than as speech.",
    d: "A tagging model marks words such as \"um\", repeated words, and the abandoned part of a restart. The output mode is a policy choice: verbatim keeps everything, clean verbatim removes fillers, and edited text also fixes restarts. Medical, legal and research uses often need verbatim. The timing of removed words is kept so alignments still hold. It is hard because the line between a disfluency and content is thin, such as \"I mean\" or a meaningful repetition for emphasis, and removing the wrong words changes meaning.",
    k: ["Verbatim vs cleaned output: verbatim is faithful and auditable, cleaned text is readable but loses what was actually said.", "Remove in post-processing vs train the recognizer not to emit them: post-processing can offer both modes, training is simpler to run but fixes one style."],
    p: ["A legal transcript is cleaned and no longer records a hesitation that mattered.", "A model removes a repeated word that was a deliberate emphasis or a real number sequence."],
    v: "Compare output to human references in each mode; confirm verbatim mode retains all spoken words, cleaned mode removes fillers at the target rate, and a sample review finds no meaning changes.",
    dep: ["transcript-structuring", "word-timestamps"]
  },
  "profanity-filtering": {
    s: "A policy step that masks or removes offensive words in transcripts, configurable per request, without altering the underlying recognition.",
    d: "A list per language, with variants and common misspellings, is matched against output words, and matches are masked, replaced with a tag or removed. The filter operates after recognition so that the unfiltered text stays available where policy permits. Context rules reduce false matches in words that are only offensive in some senses. It is hard because offensive language is context and community dependent, lists need maintenance, and masking can distort the meaning of a transcript used as a record.",
    k: ["Masking vs removing the word: masking shows that something was said and preserves length, removal gives cleaner text but hides the omission.", "Filtering after recognition vs biasing the recognizer away: post filtering is reliable and reversible, biasing risks changing the recognition of similar innocent words."],
    p: ["A blocklist hides legitimate words such as place names that contain an offensive substring.", "Filtering applied to the stored transcript makes the original unrecoverable for a compliance review."],
    v: "Run audio containing listed words and near-misses; confirm listed words are masked in each mode, innocent words are untouched, and the raw transcript remains in access-controlled storage when policy allows.",
    dep: ["transcript-structuring"]
  },
  "sensitive-data-redaction": {
    s: "Detecting and removing or masking personal and payment data, such as names, account numbers and addresses, in the transcript and sometimes in the audio itself.",
    d: "Entity taggers and pattern matchers flag candidates in the text; the system replaces them with a category label, and uses word timestamps to silence or tone out the same spans in the audio. Redaction happens before storage and before any human sees the data. Some sets are narrow, such as card numbers; others broad, covering names and locations. It is hard because recall matters most and is never perfect, spoken digits are split across turns, and errors in recognition make an entity unrecognizable and so unredacted.",
    k: ["Redact before storage vs retain raw with controlled access: redacting first minimizes exposure, but loses data needed for debugging and for fixing redaction errors.", "Pattern rules vs learned tagging: rules are precise on formats such as card numbers, learned tagging catches names and context but misses some."],
    p: ["A card number is read in pieces across two turns, and each piece alone escapes detection.", "Audio redaction uses misaligned timestamps and leaves part of the digit sequence audible."],
    v: "Seed test calls with known sensitive items spoken in varied ways; measure recall of redaction in text and audio per category, and confirm none appear in stored transcripts, logs or audio.",
    dep: ["word-timestamps", "entity-formatting", "privacy-and-data-handling"]
  },
  "transcript-structuring": {
    s: "Assembling word-level output into the final document: paragraphs, speaker turns, timestamps, channels and caption lines in the requested format.",
    d: "Words are grouped into sentences and paragraphs by pauses and punctuation, labeled by speaker and channel, and serialized as plain text, structured data, or subtitle formats with line length and display time rules. Caption formats limit characters per line and enforce reading speed. Metadata records model version and options. It is hard because layout rules conflict with accuracy: breaking caption lines at good phrase boundaries needs language knowledge, and timing must stay aligned to audio after edits and removals.",
    k: ["Structure from pauses vs from language cues: pauses are simple, language cues give more natural paragraphs but depend on punctuation quality.", "One canonical structured output with converters vs direct generation per format: a canonical form keeps formats consistent, direct generation can optimize each at the cost of drift."],
    p: ["Caption lines break in the middle of a name or phrase, hurting readability.", "Subtitles lag the speech because timings were taken from the raw words before words were removed or merged."],
    v: "Generate captions for a recording and play them alongside the audio; confirm each line stays within the length and reading-speed limits and appears within a tolerance of the spoken words.",
    dep: ["word-timestamps", "punctuation-restoration", "speaker-diarization"]
  },
  "speaker-diarization": {
    s: "Determining who spoke when in a recording and labeling each stretch of speech with a speaker identity such as speaker one or speaker two.",
    d: "The pipeline detects speech regions, slices them into short windows, computes a speaker embedding for each, clusters embeddings into speakers, and assigns labels to time ranges. End-to-end neural models predict speaker activity directly and handle overlap. Words from the recognizer are then attached to speakers by timestamp. It is hard because the number of speakers is unknown, turns are short, voices sound similar, and overlapping speech belongs to two people at once; error is measured by diarization error rate on the time axis, not by words.",
    k: ["Cluster-based pipeline vs end-to-end model: pipelines are modular and scale to many speakers, end-to-end models handle overlap but are limited by speaker count.", "Offline over the full recording vs online as it streams: offline sees everything and is more accurate, online labels live but may revise or mislabel early turns."],
    p: ["Two speakers with similar voices are merged, and a single label covers both sides of a dialogue.", "One speaker is split into two labels because their voice changes with distance from the microphone."],
    v: "Score on recordings with human-labeled turns: confirm diarization error rate meets target, the speaker count is correct on a majority of files, and word-to-speaker assignment is correct at turn boundaries.",
    dep: ["speaker-embeddings", "speaker-clustering", "overlap-detection", "voice-activity-detection", "word-timestamps"]
  },
  "speaker-embeddings": {
    s: "Fixed-length vectors computed from a segment of speech that capture who is speaking, so that segments from the same person land close together.",
    d: "A neural network trained to distinguish thousands of speakers pools frame-level features into one vector per segment. Distance, usually cosine, between vectors estimates whether two segments share a speaker. Embeddings must come from segments long enough to be reliable, around one or two seconds at least. They also encode channel and emotion, which are unwanted. It is hard because short or noisy segments give unreliable vectors, and because embedding quality varies across languages and ages, and between speakers who are children or recorded on different devices.",
    k: ["Short windows vs long windows: short windows give fine time resolution for turn changes, but noisier embeddings, long windows are more reliable but blur turns.", "General-purpose embeddings vs domain-trained: general embeddings work out of the box, domain-trained ones separate speakers better in a specific channel such as phone calls."],
    p: ["Embeddings capture the room or the microphone, and one speaker in two rooms looks like two people.", "A segment of laughter or noise yields a vector that attaches to a random speaker cluster."],
    v: "On a labeled set, compute same-speaker and different-speaker distances; confirm the equal error rate is below target and that the distributions separate for short segments as well as long.",
    dep: ["spectral-transform", "mel-filterbank", "voice-activity-detection"]
  },
  "speaker-clustering": {
    s: "Grouping speaker embeddings from a recording into one cluster per person, deciding also how many people there are.",
    d: "Agglomerative or spectral methods merge embeddings by similarity until a threshold or an estimated count is reached. Refinement steps smooth labels over time, since speakers do not change every half second. Streaming variants assign each new segment to an existing cluster or start a new one. If the number of speakers is known, such as two on a call, the count constrains the result. It is hard because threshold choice depends on the audio, and it trades merging different people against splitting one person.",
    k: ["Known speaker count vs estimated count: a given count is more accurate, an estimated one is needed for open meetings but is often wrong.", "Offline spectral clustering vs online assignment: offline uses global structure and is better, online is required for live labels and cannot revisit decisions."],
    p: ["A fixed distance threshold tuned on meetings over-splits speakers on noisy phone calls.", "A speaker who talks briefly is absorbed into a larger cluster and disappears from the transcript."],
    v: "Run on recordings with known speaker counts, from two to many; confirm estimated count accuracy and diarization error stay within target at each count, and confirm online labels match offline for most of the audio.",
    dep: ["speaker-embeddings"]
  },
  "overlap-detection": {
    s: "Identifying stretches where two or more people talk at once, so they are labeled with both speakers instead of being assigned to one and garbling the transcript.",
    d: "A frame-level classifier marks overlapped regions. The results either route to a separation model that splits the mixture into one signal per speaker, or are used to assign multiple labels. Recognition on overlapped speech is much worse than on single speakers, so systems may flag it low confidence. It is hard because overlap is short and often involves a quiet backchannel under a louder voice, and because separating speakers that sound alike or arrive from one microphone is still unsolved for many cases.",
    k: ["Detect and flag vs separate and recognize each voice: flagging is cheap and honest, separation recovers words but adds compute and artifacts.", "Single-channel detection vs multichannel with spatial cues: spatial cues from multiple microphones separate voices much better, but most recordings are single-channel."],
    p: ["Backchannels such as \"yes\" under a long turn are lost, changing the apparent flow of conversation.", "Overlapped words are assigned to the louder speaker only, and the quieter speaker's contribution is deleted."],
    v: "On recordings with annotated overlap, measure detection precision and recall, and word error rate inside overlapped regions with and without separation; confirm flagged regions are marked low confidence.",
    dep: ["voice-activity-detection", "speaker-embeddings", "beamforming"]
  },
  "language-identification": {
    s: "Detecting which language is being spoken, from the audio or from the first words, so the right models are used and mixed-language speech can be handled.",
    d: "A classifier on features or embeddings outputs a probability over supported languages for each segment. Detection can run once at the start of a call, or continuously to catch switches within a conversation. Candidate lists from the caller limit the choices. Code-switched speech, where a sentence mixes languages, needs a model that handles both at once. It is hard because closely related languages and dialects sound alike, short utterances give little evidence, and accented speakers can be mistaken for another language.",
    k: ["Identify first then recognize vs a single multilingual model: separate steps allow specialized models, but errors in identification are unrecoverable, a multilingual model avoids the decision at some accuracy cost.", "One decision per call vs continuous detection: a single decision is stable, continuous detection follows switches but can flip erroneously."],
    p: ["A few seconds of accented speech is classified as the wrong language and the whole call is transcribed as nonsense.", "Short single-word utterances are misidentified because they carry too little evidence."],
    v: "On labeled multilingual audio of varying length, measure identification accuracy by language and utterance duration; confirm accuracy meets target at the shortest supported length and that supplying a candidate list improves it.",
    dep: ["acoustic-encoder", "model-and-language-selection"]
  },
  "speaker-identification": {
    s: "Matching a voice to a known, enrolled person rather than just distinguishing speakers, so transcripts carry real names or user profiles apply.",
    d: "Users enroll by speaking a few phrases, and the system stores an embedding. At recognition time, segment embeddings are compared against enrolled ones, and a match above a threshold applies the identity. Uses include labeling meeting participants and loading personalized settings. It handles an unknown speaker by rejecting matches below threshold. It is hard because voices change with illness and age, spoofing with recordings or synthetic voices is possible, and because storing voiceprints creates biometric data subject to strict consent rules.",
    k: ["Closed set of enrolled speakers vs open set with rejection: closed set is easier and more accurate, open set is needed in practice and must trade false accepts against false rejects.", "Voiceprints stored on device vs on a server: on-device protects the data, server storage lets identity follow the user across devices."],
    p: ["A false accept attaches one person's words to another's name in a record someone may rely on.", "Voiceprints are retained after a user withdraws consent."],
    v: "Test with enrolled and unenrolled speakers, including the same speaker across days and devices; confirm false accept and false reject rates at the operating threshold, and that deleting an enrollment removes the voiceprint.",
    dep: ["speaker-embeddings", "privacy-and-data-handling"]
  },
});
