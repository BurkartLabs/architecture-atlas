// Details for the speech recognition plate, part 3: decoding, language models, features, acoustic model.
ATLAS.details("speech-recognition", {
  "beam-search": {
    s: "The search that extends a set of the best partial transcripts frame by frame, scoring each with acoustic and language evidence and discarding the rest.",
    d: "At each step every active hypothesis is extended by the possible next output units, new scores are computed as the sum of log probabilities from the acoustic model and, if used, the language model, and only the top few are kept. At the end the highest-scoring complete hypothesis is output. Exhaustive search is impossible because the number of word sequences is astronomical. It is hard because quality and speed are set by how many hypotheses survive, and because hypotheses that differ only in alignment must be merged to avoid wasting beam slots.",
    k: ["Wide beam vs narrow beam: a wide beam finds better transcripts but costs compute and latency, a narrow beam is fast but loses the right answer when it falls just outside.", "Time-synchronous vs label-synchronous search: time-synchronous suits streaming and CTC or transducer models, label-synchronous suits attention models but is harder to stream."],
    p: ["A beam tuned on clean speech is too narrow for noisy audio, where the correct path scores poorly early on.", "Hypotheses that differ only by blank placement fill the beam with duplicates, and real alternatives are pruned."],
    v: "Sweep beam width on a held-out set and plot error against compute per second of audio; confirm the chosen width sits where further widening gives negligible gain, and that results are deterministic for identical input.",
    dep: ["pruning-and-beam-width", "hypothesis-recombination", "acoustic-encoder", "shallow-fusion"]
  },
  "pruning-and-beam-width": {
    s: "The thresholds and limits that decide which hypotheses survive each step, setting the balance between search accuracy and computation.",
    d: "Pruning combines a maximum count of hypotheses, a score threshold relative to the best, and limits on the number of next-unit candidates considered. Adaptive schemes widen the beam when the model is uncertain and narrow it when one hypothesis dominates. Separate beams can apply to words and to subword units. These settings are tuned per model, language and latency target. It is hard because the best setting depends on the audio, and a setting good on average may fail on the hardest 5 percent of utterances that users remember.",
    k: ["Fixed beam vs adaptive beam: fixed is predictable in cost, adaptive saves compute on easy audio but has variable latency that complicates capacity planning.", "Score-relative threshold vs count limit: thresholds follow model confidence, counts bound worst-case cost, using both gives safety at the price of two settings."],
    p: ["A strict pruning limit makes decoding fast in benchmarks but drops rare names that were lower ranked early.", "Pruning is tuned on one language and carried to another with different unit inventories."],
    v: "Measure the oracle error, the best path available among surviving hypotheses, at several settings; confirm that actual error approaches oracle error at the chosen setting and worst-case decode time stays within budget.",
    dep: ["beam-search"]
  },
  "hypothesis-recombination": {
    s: "Merging partial hypotheses that have reached equivalent states, such as the same recent words, so the beam holds distinct possibilities instead of duplicates.",
    d: "Two paths that differ only in how the same words were aligned to frames, or that share the last few words and so the same language model context, can be combined: their probabilities are summed or the better one kept. In transducer and CTC models this includes merging different blank and repeat patterns of the same label sequence. Recombination keys include the recent word history and decoder state. It is hard because the key must be exactly the information the future scoring depends on: too coarse merges different futures, too fine leaves duplicates.",
    k: ["Sum probabilities of merged paths vs keep the maximum: summing is mathematically correct for the probability of the text, maximum is cheaper and nearly as good.", "Longer recombination history vs shorter: longer keys are safe with neural language models, shorter keys are efficient with n-grams that only look back a few words."],
    p: ["Hypotheses are merged on word identity only, and a language model that looks further back scores the survivors wrongly.", "Missing merges let near-identical hypotheses crowd out different words from the beam."],
    v: "Decode with recombination on and off at equal beam size; confirm the on setting gives equal or lower error and a larger number of distinct word sequences in the n-best list.",
    dep: ["beam-search", "ctc-output"]
  },
  "decoding-graph": {
    s: "A compiled network, usually a weighted finite-state transducer, that combines the lexicon and language model into one structure the decoder walks to turn sounds into word sequences.",
    d: "Component graphs for acoustic units, the lexicon and the grammar are composed and optimized into one search network, so the decoder follows arcs and accumulates weights. It supports large vocabularies and is fast, and dynamic changes such as added words can be done by composing small graphs at run time. Hybrid and subword models use simpler graphs or none. It is hard because composition can produce graphs of many gigabytes, and updating a vocabulary means rebuilding or patching a large static structure.",
    k: ["Precompiled static graph vs dynamic composition at run time: a static graph is fastest, dynamic composition handles per-request vocabulary but costs latency and complexity.", "Graph-based decoding vs language model fusion without a graph: graphs give exact constraints and speed, fusion is simpler for end-to-end models but offers less control."],
    p: ["A graph rebuilt for a vocabulary change is not tested, and silently drops a path for common words.", "The graph for a large vocabulary exceeds memory on small deployments."],
    v: "Compose the graph and decode a set of sentences with known word sequences; confirm every in-vocabulary sentence is reachable, graph size fits the memory limit, and decoding speed meets the real-time target.",
    dep: ["pronunciation-lexicon", "ngram-language-model"]
  },
  "word-lattice": {
    s: "A compact graph of the competing word hypotheses the decoder considered, with times and scores, kept for rescoring, confidence estimation and alternatives.",
    d: "Rather than one best sentence, the decoder records nodes at points in time and arcs for candidate words with acoustic and language scores. The lattice is pruned to a size that fits memory and can encode millions of distinct paths. Later stages walk it to rescore with a bigger language model, compute word posteriors for confidence, extract an n-best list or find the minimum-error path. It is hard because lattices are large, because pruned lattices may exclude the correct answer, and because end-to-end models do not produce them naturally and approximate versions must be built.",
    k: ["Keep a lattice vs keep only an n-best list: a lattice represents far more alternatives compactly, an n-best list is simpler to rescore and store.", "Aggressively pruned lattice vs generous: aggressive is fast to rescore, generous retains more correct paths but costs memory and time."],
    p: ["The lattice is pruned so hard that the correct transcript is absent, and rescoring cannot recover it.", "Lattices are stored for every call and fill storage."],
    v: "Check lattice oracle error, the best path in the lattice measured against the reference, and confirm it is substantially lower than the one-best error; confirm lattice size per second of audio stays under the limit.",
    dep: ["beam-search", "hypothesis-recombination"]
  },
  "n-best-list": {
    s: "The few highest-scoring complete transcripts for an utterance, each with a score, offered as alternatives or as input to rescoring and downstream decisions.",
    d: "The decoder returns its top hypotheses, usually between 3 and 20, ranked by combined score. Consumers include second-pass rescoring with a larger language model, intent classifiers that can search among alternatives for a valid command, and user interfaces that show alternatives for correction. Alternatives are often near duplicates differing in one word. It is hard because the n-best list from a beam is not a diverse sample, scores are not calibrated across hypotheses, and returning many alternatives increases response size and cost.",
    k: ["Large n-best list vs small: more alternatives give rescoring and downstream logic more to work with, but cost latency and bandwidth.", "Raw scores vs normalized posteriors: raw scores are available for free, normalized posteriors compare better but need extra computation."],
    p: ["Alternatives differ only by punctuation or case, and the list contains one real hypothesis many times.", "A caller trusts the second alternative as an independent reading, when it is a minor variation of the first."],
    v: "Confirm the n-best list is sorted, contains distinct word sequences, and that choosing the best entry by oracle yields a lower error than the first entry; confirm score order matches confidence order.",
    dep: ["word-lattice", "confidence-scores"]
  },
  "forced-alignment": {
    s: "Aligning a known transcript to its audio to find when each word or phoneme occurs, without searching for what was said.",
    d: "Given audio and the text, the aligner constrains the search to that word sequence, usually using the acoustic model's frame posteriors, and finds the best path through them. Outputs are start and end times per word. Uses include subtitles, training data cleaning, error analysis and locating redaction spans. It is hard because the text must match the speech: extra, missing or misspelled words, and long non-speech stretches, break the alignment, and boundaries between words are acoustically ambiguous to within tens of milliseconds.",
    k: ["Alignment with the recognizer's own model vs a dedicated aligner: reusing the model is simple, a dedicated aligner can give finer and more accurate boundaries.", "Strict alignment vs allowing insertions and skips: strict is faster but fails on imperfect transcripts, flexible alignment tolerates them but can place words wrongly."],
    p: ["A transcript with a missing sentence pushes all following words out of place, and errors look systematic.", "Alignment of numbers and abbreviations fails because the written text does not match the spoken words."],
    v: "Align recordings with hand-labeled word boundaries and measure median and 95th percentile boundary error; confirm it meets target and that a transcript with a deleted sentence is flagged as a mismatch.",
    dep: ["ctc-output", "pronunciation-lexicon"]
  },
  "word-timestamps": {
    s: "Start and end times for every recognized word, derived from the model's alignment, enabling subtitles, search, editing and speaker assignment.",
    d: "End-to-end models emit labels at a coarse frame rate, so each word's time comes from the frame where its first and last pieces were output, sometimes corrected by a small alignment pass. Times are relative to the stream or file start and must be offset when audio is chunked or segments merged. Delay between the label appearing and the sound occurring varies by model, which the system calibrates. It is hard because model outputs fire late or early relative to the acoustic event, and errors of a few hundred milliseconds are visible in captions.",
    k: ["Timestamps from model emission vs from a separate alignment pass: emission times are free but biased, a dedicated pass is accurate but adds compute.", "Frame-level resolution vs word-level only: frame detail supports editing and redaction, but multiplies output size."],
    p: ["Timestamps are systematically late by the model's delay, and every caption trails the speaker.", "Offsets for removed silence or segment boundaries are applied inconsistently, so times drift over long recordings."],
    v: "Compare word times to a hand-labeled set for median and tail error, in short and hour-long recordings; confirm no drift accumulates over duration and that streaming and batch times agree.",
    dep: ["forced-alignment", "ctc-output", "frame-subsampling"]
  },
  "confidence-scores": {
    s: "Numeric estimates, per word and per utterance, of how likely the output is to be correct, offered so applications can accept, verify or reject results.",
    d: "Scores are derived from the posterior probability of a word given all competing hypotheses in a lattice, from the model's softmax values, or from a small learned estimator that takes features such as duration, margins and language model scores. Utterance scores aggregate the word scores. Downstream uses include flagging uncertain words in a transcript, routing calls to review and deciding whether to ask the user to repeat. It is hard because raw model probabilities are overconfident, and the estimator itself must be trained on realistic errors.",
    k: ["Posterior-based scores vs a learned estimator: posteriors come directly from decoding, a learned estimator is more accurate and calibrated but needs labeled error data.", "Word-level scores vs utterance score only: word-level shows where errors are, but is noisier and increases output size."],
    p: ["Raw scores are used as probabilities, when they are consistently higher than real accuracy.", "A confidence threshold set on clean speech lets through many errors on noisy audio."],
    v: "Rank words by confidence on held-out data and confirm error rate falls monotonically as confidence rises, and that rejecting the lowest-confidence tenth of words removes a much larger share of the errors.",
    dep: ["word-lattice", "ctc-output"]
  },
  "ngram-language-model": {
    s: "A table of how likely each word is given the previous few words, estimated from large amounts of text and compiled for fast lookup during decoding.",
    d: "Counts of word sequences are smoothed so unseen combinations still get a probability, and rare entries are pruned to control size. The model can be built from general text plus domain text and interpolated. At decode time a word's probability depends only on a short history, so hypotheses with the same history can be merged. Models are stored in compact trie structures that fit in memory. It is hard because they cannot see beyond a few words, grow large with vocabulary and order, and generalize poorly to new phrasing.",
    k: ["High order vs low order: higher order captures longer phrases and improves accuracy, but grows quickly in memory and is sparse for rare sequences.", "One mixed model vs separate models interpolated: mixing is simple, separate models let each domain be updated and weighted independently."],
    p: ["Training text includes the test sentences, and measured accuracy looks too good.", "Aggressive size pruning removes rare names and the model forgets entities customers rely on."],
    v: "Compute perplexity on held-out domain text before and after changes, and check word error rate; confirm perplexity falls with domain data added and memory use fits the deployment limit.",
    dep: ["pronunciation-lexicon"]
  },
  "neural-language-model": {
    s: "A neural network that predicts the next word or piece from a long context, giving better estimates than n-grams at higher computational cost.",
    d: "Recurrent or attention-based models condition on the full preceding transcript and often on broader context. They are used to rescore candidate hypotheses, or fused into the search for each extension. They capture grammar and meaning, which helps with homophones and rare combinations. Large models need accelerators and add latency in streaming. It is hard because the model must be small enough for first-pass use, its vocabulary must match the acoustic model's units, and it must be trained on text from the same domain as speech.",
    k: ["Use in first pass vs second pass only: first-pass use improves the search itself, second-pass rescoring is simpler and cheaper but can only choose among what was kept.", "Large general model vs small domain model: large models know more, but are slow and may overweight written style, small models are fast and focused."],
    p: ["A language model trained on written text prefers formal phrasing and corrects genuine spoken forms.", "The model's tokenization differs from the recognizer's, and score alignment errors give inconsistent results."],
    v: "Compare error rate and latency with and without the model on spoken-style held-out data; confirm accuracy gains justify the added compute and that tokenization alignment tests pass.",
    dep: ["subword-vocabulary", "lm-rescoring"]
  },
  "shallow-fusion": {
    s: "Combining the acoustic model's score and an external language model's score as a weighted sum during beam search, so text-only data improves an end-to-end recognizer.",
    d: "At each extension of a hypothesis, the recognizer's log probability for the next unit is added to a weighted log probability from the language model, plus a length reward. The weights are tuned on held-out data. The language model can be swapped without retraining the acoustic model, which makes domain and customer text easy to use. It is hard because the end-to-end model already has an implicit language model learned from its training transcripts, so the external model double counts and needs weight tuning, and weights are domain dependent.",
    k: ["Higher language model weight vs lower: higher weight leans on text priors and helps rare words and domain terms, but overrides the audio and causes deletions.", "Fusion at each step vs rescoring at the end: step-by-step fusion shapes the search itself, rescoring is cheaper but constrained to what the beam kept."],
    p: ["A weight tuned on one test domain makes another domain worse, since the language model dominates.", "Short hypotheses are favored because each added word costs score, so a length reward is needed and is forgotten."],
    v: "Sweep language model weight and length reward on in-domain and out-of-domain sets; confirm the chosen values improve in-domain error and cause no substantial regression elsewhere.",
    dep: ["neural-language-model", "ngram-language-model", "internal-lm-suppression"]
  },
  "lm-rescoring": {
    s: "A second pass that rescores the n-best list or lattice from the first pass with a larger or more specialized language model, and picks the best transcript.",
    d: "The first pass produces candidates quickly with a small model. The second pass computes new scores using a bigger model, which may be too slow to run on every extension, and combines them with the original scores. It runs after the utterance ends, or on segments, so it adds delay for finals but not for partials. It is hard because the best hypothesis may not be among the candidates, because weights need tuning, and because it applies only where there is time for it, so streaming systems often skip it.",
    k: ["Rescoring lattices vs n-best lists: lattices cover far more alternatives, n-best lists are easy to implement and to use with any model.", "Rescoring finals only vs also partials: finals only keeps live latency low, but partials and finals then disagree more often."],
    p: ["The second-pass model repairs rare errors, but cannot fix a case where the true word never entered the candidate set.", "Rescoring time grows with utterance length, and long utterances delay finals."],
    v: "Measure error and finalization delay with and without the second pass on utterances of varying length; confirm the accuracy gain and that delay on the longest utterances stays within budget.",
    dep: ["n-best-list", "word-lattice", "neural-language-model"]
  },
  "internal-lm-suppression": {
    s: "Estimating and subtracting the language preference built into an end-to-end model, so an external language model can be fused without double counting.",
    d: "An end-to-end model learns the language statistics of its training transcripts inside its prediction network. When an external model from other text is added, the internal one biases output toward the training domain. The internal model's contribution is estimated by running the prediction network without audio, or by a small learned model, then removed from the score with a weight. This lets domain text take effect more cleanly. It is hard because the internal model cannot be exactly isolated, and extra computation is needed per step.",
    k: ["Subtract an estimated internal model vs ignore it and tune weights: subtraction adapts better to new domains, ignoring is simpler but fusion weights are less transferable.", "Train the model with a separate language component vs estimate afterward: a built-in component is cleaner, but constrains the architecture and training."],
    p: ["The estimate is subtracted with too large a weight, and the model produces ungrammatical output.", "The correction improves a new domain but worsens accuracy on the original domain unnoticed."],
    v: "Evaluate fused decoding with and without suppression on source-domain and target-domain test sets; confirm target-domain error improves and source-domain error does not worsen beyond tolerance.",
    dep: ["transducer-prediction-network", "shallow-fusion"]
  },
  "pronunciation-lexicon": {
    s: "A dictionary mapping each word to one or more sequences of speech sounds, linking the vocabulary to the acoustic model's units.",
    d: "Entries are written by linguists or generated by a pronunciation model, with variants for dialects and reduced forms. In hybrid systems the lexicon is compiled into the decoding graph; in end-to-end subword systems it may not be needed, but is still used for biasing, alignment and synthesis of training audio. It is large for open vocabularies and needs continuous additions for new names. It is hard because pronunciations vary by accent and context, and one wrong or missing entry makes a word unrecognizable in a hybrid decoder.",
    k: ["Many variants per word vs one canonical pronunciation: many variants capture accents but add search ambiguity, one canonical form is simple but fails for non-standard speakers.", "Hand-curated vs automatically generated entries: curated entries are reliable for common words, generated entries scale to names but include errors."],
    p: ["A phoneme set mismatch between the lexicon and the acoustic model makes every entry for one sound unreachable.", "Added entries are not reviewed, and a typo in a pronunciation becomes a permanent recognition failure."],
    v: "Check that every vocabulary word has at least one entry, all symbols belong to the model's inventory, and that a sample of entries spoken by a synthesizer is recognized as the intended word.",
    dep: ["grapheme-to-phoneme"]
  },
  "grapheme-to-phoneme": {
    s: "A model that predicts pronunciation from spelling, used for words missing from the lexicon such as new names and loanwords.",
    d: "A sequence model reads letters and emits phoneme symbols, trained on the existing lexicon. It produces one or several candidates with scores. It serves customization, name recognition, and building lexicons for new languages. Language-specific rules and exceptions, such as borrowed words and silent letters, make accuracy vary widely by language: near regular spelling languages are easy, others are not. It is hard because names are the most important and the least regular input, and the same spelling can be pronounced several ways.",
    k: ["Generate several pronunciations vs only the most likely: several raise recall for ambiguous names, but add search ambiguity and false matches.", "Train on the whole lexicon vs separate models for names: whole-lexicon training is simpler, a name-specific model handles foreign origin better but needs name data."],
    p: ["A name of foreign origin is pronounced by native spelling rules, and is never recognized.", "Generated pronunciations are used without review for a high-value list, with no accuracy check."],
    v: "Hold out a set of lexicon words, generate their pronunciations, and measure phoneme error and word accuracy; separately measure on names, and confirm generated entries for a sample are recognized when spoken.",
    dep: ["pronunciation-lexicon"]
  },
  "framing-and-windowing": {
    s: "Slicing the continuous waveform into short overlapping frames, typically twenty-five milliseconds long every ten, and tapering each so it can be analyzed.",
    d: "Speech is steady enough over a few tens of milliseconds to analyze as a stable sound. Each frame is multiplied by a smooth window to avoid edge artifacts in the spectrum, and a pre-emphasis filter may boost high frequencies. The frame step sets the feature rate, usually one hundred frames per second. Parameters are fixed at training and must match at serving. It is hard because mismatched settings between training and serving give wrong features that the model cannot flag, and because frame length trades time against frequency resolution.",
    k: ["Short frames vs long frames: short frames follow fast changes such as consonant bursts, long frames resolve pitch and vowels better.", "Large overlap vs small overlap: large overlap gives smoother, more detailed features at higher cost, small overlap is cheaper and loses transitions."],
    p: ["Serving code uses a different frame step than training, and the model sees time-stretched input.", "Partial frames at chunk edges are dropped, creating small timing gaps in streaming."],
    v: "Pass a known tone and a clicking signal through the training and serving front ends and confirm the resulting features are numerically identical within tolerance.",
    dep: ["audio-ring-buffer", "sample-rate-conversion"]
  },
  "spectral-transform": {
    s: "The Fourier transform that converts each frame of samples into the strength of each frequency, the basis of nearly all speech features.",
    d: "Each windowed frame is transformed, giving magnitudes at hundreds of frequency bins, and the squared magnitudes form a power spectrum. Phase is usually discarded for recognition. The transform is fast, with cost growing slightly faster than the frame length, and runs on every frame of every stream, so efficient implementations and fixed-point versions matter on devices. It is hard because the details, such as window shape, padding and scaling, change feature values and must exactly match training, and because phase information is lost.",
    k: ["Magnitude only vs magnitude and phase: magnitude is sufficient and robust for recognition, phase can help in enhancement but complicates modeling.", "Floating-point vs fixed-point implementation: fixed-point saves power on embedded chips, but adds quantization noise in quiet signals."],
    p: ["A scaling mismatch between training and serving shifts all feature levels, and accuracy falls for quiet speakers.", "Zero-padding choices differ across implementations and give slightly different spectra."],
    v: "Feed a synthetic tone of known frequency and amplitude and confirm the peak appears in the expected bin with the expected magnitude in both training and serving code paths.",
    dep: ["framing-and-windowing"]
  },
  "mel-filterbank": {
    s: "A bank of overlapping filters spaced on a perceptual frequency scale that compresses the spectrum into a few dozen bands, the usual input to acoustic models.",
    d: "Triangular filters, closely spaced at low frequencies and wider at high ones, sum the power spectrum into 40 to 128 bands, matching human hearing's finer resolution at low pitch. The log of each band energy is the standard feature, called log-mel. Older systems applied a further transform to decorrelate them. Bands span a frequency range chosen to suit the audio bandwidth, narrower for telephone audio. It is hard because narrowband and wideband audio need different ranges, and a model trained on one performs poorly on the other.",
    k: ["More filters vs fewer: more bands keep detail useful for neural models, but increase input size and computation.", "Fixed filterbank vs learned filters: fixed filters are well understood and robust, learned filters can fit the data but may overfit to the recording conditions."],
    p: ["Telephone audio upsampled to wideband has empty high bands, which a wideband model treats as unusual and misrecognizes.", "Filter edges chosen for one sample rate are reused at another, shifting every band."],
    v: "Compute the filterbank for tones across the range and confirm each lands in the expected band with the expected energy; compare outputs from training and serving implementations on the same audio for numerical equality.",
    dep: ["spectral-transform"]
  },
  "feature-normalization": {
    s: "Scaling features per speaker, per utterance or per global statistics, so differences in microphone gain and channel do not change what the model sees.",
    d: "Global mean and variance normalization uses statistics from training data. Per-utterance mean subtraction removes constant channel effects but needs the full utterance, so streaming systems use running estimates that update as audio arrives. Per-channel energy normalization applies adaptive gain to each band. The estimates start poorly at the beginning of a stream. It is hard because streaming normalization must work from little data early on, and because errors at the start of an utterance cost the first words.",
    k: ["Whole-utterance normalization vs running estimates: whole-utterance is more accurate but cannot stream, running estimates add no delay but are poor in the first second.", "Normalize in features vs rely on the model's own normalization layers: feature normalization is explicit and inspectable, layer normalization is learned but harder to debug."],
    p: ["Running statistics are initialized at zero, and the first word of every utterance is distorted.", "Statistics carried over from a previous speaker on a reused session shift the new speaker's features."],
    v: "Scale the same recording by several gains and confirm normalized features and transcripts are nearly unchanged; check first-second error against the rest of the utterance for streaming.",
    dep: ["mel-filterbank", "gain-control"]
  },
  "spectrogram-augmentation": {
    s: "Randomly masking blocks of time and frequency in training features, which forces the model to rely on context and improves robustness with limited data.",
    d: "During training, a few bands of frequencies and a few spans of frames are set to zero or the average, and time warping may shift the features slightly. The model must infer the missing content from what remains, learning to use language context and avoiding reliance on any single band. It is applied only in training, never at serving. It is hard because mask sizes must suit the data, and overly strong masking harms accuracy, while too weak gives no benefit.",
    k: ["Strong masking vs mild: strong masking regularizes large models trained on small data, mild masking suits large datasets where overfitting is less of a risk.", "Augment features vs augment waveforms: feature masking is cheap and done in the training loop, waveform changes such as noise mixing add realism but cost more."],
    p: ["Augmentation left on at evaluation time makes measured error worse and confuses comparisons.", "Masks are too wide for short utterances and remove most of the words."],
    v: "Train with and without augmentation on a small set and compare error on clean and noisy held-out data; confirm the augmented model generalizes better and that evaluation code disables augmentation.",
    dep: ["mel-filterbank", "waveform-augmentation"]
  },
  "learned-front-end": {
    s: "A front end whose filters are learned from data, taking raw samples or simple spectra directly, instead of using hand-designed filterbank features.",
    d: "A convolutional stack or pretrained encoder reads waveform samples and produces features trained jointly with the rest of the network. It can discover representations tuned to the data and avoid fixed assumptions. Self-supervised pretraining on unlabeled audio is a common source. The cost is more compute per frame and larger models, and some loss of interpretability. It is hard because it may be sensitive to recording conditions that hand-designed features smooth over, and it ties training and serving to exact sample rates.",
    k: ["Learned vs handcrafted features: learned features can reach lower error with enough data, but cost more compute and generalize less predictably across channels.", "Joint training vs fixed pretrained front end: joint training specializes to the task, a fixed front end is reusable and cheaper to train."],
    p: ["A learned front end trained on one microphone type fails on another, because filters learned its quirks.", "Compute per stream is higher than planned, which lowers capacity on shared hardware."],
    v: "Evaluate a model with learned and fixed front ends across microphone types and sample rates; confirm accuracy is at least equal in each condition and that compute per second of audio fits the budget.",
    dep: ["pretrained-speech-representations", "sample-rate-conversion"]
  },
  "acoustic-encoder": {
    s: "The neural network that turns a sequence of feature frames into a sequence of high-level representations from which output units are predicted.",
    d: "Typical encoders use stacked convolution plus attention layers, recurrent layers or a mix, with sizes from a few million parameters for devices to hundreds of millions for servers. For streaming, attention is restricted to a window of past and limited future frames. The encoder does most of the model's computation and sets its accuracy and latency. It is trained with CTC, transducer or attention-decoder losses. It is hard because capacity, latency and streamability conflict, and a design that excels offline often degrades when constrained to stream.",
    k: ["Full-context attention vs limited context: full context gives the best accuracy but cannot stream and grows with utterance length, limited context bounds latency and memory.", "Large model with distillation vs small model trained directly: a distilled small model beats a directly trained one at equal size, but needs a teacher and more training."],
    p: ["An encoder trained on full utterances is run on chunks without training for it, and error jumps.", "Compute per second of audio is measured offline, and real-time streaming performance is far worse due to small batch sizes."],
    v: "Measure error and real-time factor for the encoder in the deployed streaming configuration, not just offline, on held-out sets; confirm both meet targets on target hardware.",
    dep: ["frame-subsampling", "mel-filterbank", "streaming-encoder-state"]
  },
  "frame-subsampling": {
    s: "Reducing the number of encoder frames, for example to one frame per forty or eighty milliseconds, so downstream computation and output sequences are shorter.",
    d: "Strided convolutions or frame stacking in the first layers reduce the frame rate by a factor of four to eight. The output rate must be high enough that every output unit can be given at least one frame, so rate and unit inventory interact. Coarser frames cut compute and speed decoding but blur timing and risk skipping fast speech. Word timestamps inherit the coarse resolution. It is hard because the best rate depends on language and speaking rate, and fast speakers can need more output units than frames.",
    k: ["Aggressive subsampling vs gentle: aggressive saves compute and decoding time, but reduces timing precision and can drop units in fast speech.", "Fixed rate vs adaptive rate: fixed is simple and batches well, adaptive saves compute on silence but complicates implementation."],
    p: ["Fast speakers produce more output units than frames, and words are dropped without warning.", "Timestamps carry a quantization error equal to the frame stride and subtitles look jumpy."],
    v: "Test with speech at increasing speaking rates and confirm error does not rise sharply; compare timestamp resolution to the stride and confirm it fits the application's needs.",
    dep: ["acoustic-encoder"]
  },
  "subword-vocabulary": {
    s: "The inventory of output pieces, such as characters or word fragments learned from text, that the model predicts instead of whole words.",
    d: "A tokenizer learns a few thousand pieces from training text by merging frequent character sequences. Smaller inventories make output sequences longer and decoding slower, but handle any word. Larger inventories give shorter sequences and sharper acoustic modeling for common words but weaker coverage of rare ones. The same tokenizer must be used by the language model and decoder. It is hard because changing it means retraining everything that depends on it, and because languages differ: some need characters, others word-like pieces.",
    k: ["Few pieces vs many: few pieces keep the output layer small and cover everything, but slow decoding and make errors in spelling more likely.", "One shared multilingual inventory vs per-language: shared supports code-switching and one model, per-language is more precise for each language."],
    p: ["The tokenizer is retrained on new text, and old models and language models silently disagree on units.", "A multilingual inventory favors the largest language, and small languages get fragmented into characters."],
    v: "Tokenize and detokenize a large text sample from each language and confirm the roundtrip is lossless; check average pieces per word per language and that no language is badly over-fragmented.",
    dep: []
  },
  "ctc-output": {
    s: "An output layer and loss that predicts one unit or a blank for each frame, letting the model learn alignment between audio and text without frame-level labels.",
    d: "At every encoder frame the model outputs a probability over units plus a blank. A valid output collapses repeats and removes blanks. Training sums over all alignments consistent with the transcript. Decoding can be greedy or beam search. Outputs are independent across frames, so it has no built-in language knowledge and benefits from external language models. It is simple, streams naturally and gives timing for free. It is hard because independence assumptions cause errors that a model with a prediction network would avoid, and spikes occur at unpredictable frame positions within a word.",
    k: ["CTC vs transducer or attention decoders: CTC is simple, fast and streams easily, but needs an external language model for the best accuracy.", "Greedy decoding vs beam search with a language model: greedy is nearly free, beam search with a language model gains accuracy at higher cost."],
    p: ["Peaky outputs put a word's spike far from its actual time, so timestamps taken from them are offset.", "Repeated letters in words such as double letters need a blank between them, and are collapsed incorrectly if decoding is wrong."],
    v: "Compare greedy output with a collapse of the model's frame output on test audio; confirm repeated letters survive and timestamps from spikes fall within tolerance of an independent alignment.",
    dep: ["acoustic-encoder", "subword-vocabulary"]
  },
  "attention-decoder": {
    s: "An autoregressive network that generates the transcript one piece at a time, attending to the encoder output and to its own earlier output.",
    d: "At each step the decoder looks at the whole encoded audio through attention, together with the pieces generated so far, and predicts the next piece. It learns language knowledge jointly with acoustics and gives strong accuracy for offline transcription. Output ends with an end-of-sequence token. Streaming requires monotonic or chunked attention variants. It is hard because it can loop, repeat or hallucinate text not present in the audio, particularly on silence or very long input, and standard attention needs the full utterance.",
    k: ["Attention decoder vs transducer: attention gives top offline accuracy and long context, but needs the whole utterance and risks hallucination, transducers stream naturally.", "Joint training with CTC vs attention alone: the CTC loss stabilizes alignment and reduces looping, at the cost of a combined training setup."],
    p: ["On silent or noisy segments the decoder emits fluent text with no basis in the audio.", "Very long audio exceeds the length it was trained on, and output repeats a phrase endlessly."],
    v: "Feed segments of silence, noise and music and confirm output is empty or flagged; test on utterances longer than training length and confirm output length matches speech duration with no repetition.",
    dep: ["acoustic-encoder", "subword-vocabulary"]
  },
  "transducer-prediction-network": {
    s: "The part of a transducer model that reads the transcript so far and produces a summary used to predict the next piece, acting as a small built-in language model.",
    d: "It consumes previously emitted non-blank units, using a small recurrent or attention network with limited history, and outputs a vector for each position. Combined with an encoder frame in the joint network, it makes the next-unit distribution depend on the text already produced. Limiting its history to a few units, called a stateless predictor, cuts compute and reduces overfitting to training text. It is hard because it learns the training text's statistics, which biases the output toward the training domain and complicates adaptation.",
    k: ["Recurrent predictor vs stateless predictor with short context: recurrent captures longer context, stateless is faster, easier to adapt and nearly as accurate.", "Larger predictor vs smaller: larger memorizes more language, but costs compute and overfits the training domain."],
    p: ["A predictor fitted to training transcripts pushes output toward training phrases when new-domain speech is heard.", "Predictor state is not reset at an utterance boundary and carries earlier text into the next."],
    v: "Check that state resets at utterance boundaries by decoding the same audio after different preceding utterances and confirming identical output; measure domain shift by comparing error on new-domain text.",
    dep: ["subword-vocabulary"]
  },
  "joint-network": {
    s: "The small network in a transducer that combines an encoder frame with the predictor state to produce probabilities for the next piece or for advancing to the next frame.",
    d: "For each pair of audio frame and text position it projects both inputs, adds them, applies a nonlinearity and outputs a distribution over pieces plus a blank. The grid of all pairs makes training memory expensive, so implementations prune it or use small output sizes. At decoding, the joint runs once per candidate per frame, so its cost dominates decode time in large beams. It is hard because training memory scales with frames times labels times vocabulary, and fast approximate versions are needed.",
    k: ["Full joint grid vs pruned grid in training: the full grid is exact, but memory limits batch size, pruning cuts memory with small approximation error.", "Large vs small joint hidden size: larger gives richer interaction between audio and text, but increases per-step decode cost."],
    p: ["Training runs out of memory on long utterances with large vocabularies, and engineers shorten data and bias against long audio.", "Joint computation per beam candidate makes real-time decoding impossible at wide beams."],
    v: "Measure peak memory in training at maximum utterance length, and decode time per frame at the production beam width; confirm both fit the budget and error matches the unpruned loss within tolerance.",
    dep: ["acoustic-encoder", "transducer-prediction-network"]
  },
  "pretrained-speech-representations": {
    s: "Encoders trained on large unlabeled or weakly labeled audio, then fine-tuned with a small amount of transcribed data to give strong accuracy where labeled data is scarce.",
    d: "Self-supervised training hides parts of the audio and asks the model to predict them, learning general sound structure from thousands of hours without transcripts. Fine-tuning adds an output layer and trains on the labeled data. Weak supervision uses large collections of noisily transcribed audio. This is the main route to low-resource languages and domains. It is hard because pretrained models are large, their pretraining data determines which languages and conditions they handle, and fine-tuning can forget or overfit.",
    k: ["Fine-tune a pretrained model vs train from scratch: pretraining gives large gains with little labeled data, but ties the system to a big model and its biases.", "Self-supervised vs weakly supervised pretraining: self-supervised needs no transcripts, weak supervision can give better recognition directly but inherits label noise."],
    p: ["Pretraining audio lacks a language or accent, and fine-tuning on a little data cannot fully fix its absence.", "Fine-tuning on a narrow domain erases robustness the pretrained model had."],
    v: "Fine-tune with progressively less labeled data and plot error against labeled hours for pretrained and scratch models; confirm the pretrained model's advantage in the low-data range and check performance on conditions outside the fine-tuning set.",
    dep: ["training-corpus", "learned-front-end"]
  },
});
