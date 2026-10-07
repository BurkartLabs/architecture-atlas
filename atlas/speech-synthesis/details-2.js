// Details for the speech synthesis plate, part 2: text normalization, pronunciation, multilingual support.
ATLAS.details("speech-synthesis", {
  "input-sanitizer": {
    s: "Cleans raw input before anything else reads it: fixes character encoding, removes control characters and markup residue, collapses whitespace and bounds length.",
    d: "Text arrives from web pages, documents, chat messages and transcripts, so it carries invisible characters, mixed Unicode normalization forms, stray HTML, soft hyphens and line breaks inserted by layout. This stage converts to one canonical Unicode form, strips or replaces characters the system cannot speak, joins words broken across lines, and rejects input beyond size limits. It keeps a map from cleaned positions back to original offsets for timing output. The hard part is deciding what is noise: a line break may be a sentence end, a paragraph, or a layout artifact.",
    k: ["Aggressive cleanup vs preserve-then-handle: cleanup simplifies later stages and can delete meaningful characters, preservation keeps fidelity and burdens every stage.", "Reject bad input vs repair it: rejecting is predictable, repair serves messy sources at the risk of guessing wrong."],
    p: ["Collapsing all line breaks merges list items into one run-on sentence with no pauses.", "Zero-width and bidirectional control characters survive and make tokens that match no dictionary entry."],
    v: "Run a corpus of messy inputs with hidden characters, mixed encodings and layout line breaks. Every output is valid canonical text, offset maps round-trip to the original positions, and none produces a missing-word or garbled-word report.",
    dep: []
  },
  "sentence-segmenter": {
    s: "Splits text into sentences and phrases, which are the units that prosody, synthesis chunks and pauses are built from.",
    d: "A rule or learned segmenter decides where sentences end, using punctuation, capitalization, abbreviation lists and context. Output units are sized for the models: very long sentences are further split at clauses so synthesis stays stable, and very short fragments may be merged for natural intonation. Segment boundaries become pauses and chunk boundaries for streaming. It is hard because periods appear in abbreviations, decimals and URLs, because languages without spaces or capitals need other cues, and because conversational text often lacks punctuation entirely.",
    k: ["Rule-based vs learned segmentation: rules are transparent and brittle on noisy text, learned models handle messy input and fail unpredictably.", "Split long sentences at a fixed length vs at syntactic breaks: fixed length bounds cost, syntactic breaks sound better and cost parsing."],
    p: ["Splitting after an abbreviation period starts a new intonation contour in the middle of a name.", "A very long unpunctuated paragraph is synthesized as one unit and degrades or runs out of memory."],
    v: "Run a labeled set of tricky text with abbreviations, decimals, quotations and unpunctuated chat lines. Boundary precision and recall meet the target, and listening to joined output reveals no mid-phrase restarts.",
    dep: ["input-sanitizer"]
  },
  "token-classifier": {
    s: "Splits sentences into tokens and labels each as an ordinary word or as a special class such as number, date, time, money, measure, abbreviation, URL or letter sequence.",
    d: "Tokens are found by script-aware rules, then each is classified by patterns and, in many systems, by a sequence model that sees the neighbors. The class decides which verbalizer will expand it: a plain word goes to the lexicon, a cardinal to number expansion, a date to date grammar. Classification must keep the original span for offset mapping. It is hard because the same characters belong to different classes in different contexts, and because the set of classes and their formats differs per language and per domain.",
    k: ["Hand-written patterns vs learned tagger: patterns are auditable and miss unusual formats, a tagger generalizes and needs labeled data and testing for each language.", "Many specific classes vs few broad ones: specific classes enable precise expansion, and each adds rules and error modes."],
    p: ["A product code that looks like a date is expanded as a date.", "A new format introduced by a customer falls into a default class that reads it character by character."],
    v: "Run a labeled corpus covering every class in the supported languages and confirm per-class accuracy meets targets. Then synthesize unseen formats and verify, via round-trip text, that nothing falls into a silent default.",
    dep: ["sentence-segmenter"]
  },
  "number-expansion": {
    s: "Converts numerals, dates, times, ordinals, ranges and units into the words a speaker would say, following the grammar and conventions of the language.",
    d: "Verbalizers are grammars or rule sets: a cardinal grammar for 1,204 produces the words, an ordinal grammar for 3rd, a date grammar that knows locale field order, and unit expansion that chooses singular or plural. In inflected languages the word form depends on grammatical case and gender of the surrounding words, so the verbalizer needs neighbors. The same digits read differently as a year, a quantity, a phone number or an identifier. The challenge is volume of locale conventions and that errors, such as a wrong number, change meaning rather than just sound.",
    k: ["Finite-state grammars vs neural expansion: grammars cannot hallucinate numbers and require expert authoring, neural models are broader and can substitute a wrong digit.", "One grammar per locale vs per language: locale grammars are accurate for conventions like date order and grow in count."],
    p: ["A neural expander reads 1,500 as fifteen hundred in a dosage context where thousand five hundred was required, or drops a digit.", "Decimal comma and thousands point are swapped for a locale, reading prices off by a factor of a thousand."],
    v: "Expand a test set of numbers, dates, times and units for each locale, then compare the produced word sequence to expert-written answers exactly. Spot-check long numbers and negatives in the audio.",
    dep: ["token-classifier", "locale-conventions"]
  },
  "abbreviation-expansion": {
    s: "Decides whether an abbreviation or acronym is expanded to full words, spelled letter by letter or spoken as a word, and produces the right reading.",
    d: "Dictionaries list common abbreviations with their expansions and conditions: a title before a name, a unit after a number, a street designation in an address. Acronyms are classified as spelled out or pronounceable using lists, letter patterns and context. Domain lexicons add medical, legal and technical terms. Many abbreviations are ambiguous, such as one that is a title in one place and a direction in another. Coverage never ends, and a wrong guess is audible and sometimes harmful, so unknown ones need a defined fallback.",
    k: ["Expand to full words vs read as written: expansion sounds natural and risks wrong guesses, reading as written is safe and sounds stilted.", "Global dictionary vs per-customer overrides: a global list gives consistency, overrides handle domain terms and demand a precedence rule."],
    p: ["A directional or title abbreviation is expanded in the wrong sense, so Dr. in an address becomes doctor.", "An unknown acronym is read as a word with a plausible but wrong pronunciation."],
    v: "Synthesize a list of ambiguous abbreviations in disambiguating contexts and transcribe the output. Each reading matches the expected expansion, and an out-of-list acronym follows the documented fallback.",
    dep: ["token-classifier", "context-disambiguation", "user-lexicons"]
  },
  "symbols-and-urls": {
    s: "Verbalizes characters that are not ordinary words: punctuation with meaning, mathematical symbols, URLs, email addresses, hashtags, file paths and emoji.",
    d: "Each class has its own reading policy. A URL is read with spoken separators for dots and slashes, or shortened to the domain. An email reads the local part and the domain in chunks. Math symbols read as operators in context, so a hyphen is minus between numbers and nothing between words. Emoji may be read by name, skipped or turned into a style cue. The policy depends on use: a screen reader needs full detail, a voice assistant wants brevity. The hard part is that readers have strong expectations that differ by product.",
    k: ["Read everything literally vs summarize: literal is complete and tedious for long strings, summary is pleasant and hides information.", "Fixed policy vs caller-selectable verbosity: fixed gives consistent audio, selectable fits accessibility and assistant products with more options to test."],
    p: ["A long tracking URL is read character by character for half a minute.", "Emoji read by name in the middle of a serious message jars the listener."],
    v: "Synthesize messages with URLs, emails, paths, math and emoji under each verbosity setting and confirm the transcription follows the documented policy and the audio stays under the length limit for summarized settings.",
    dep: ["token-classifier"]
  },
  "context-disambiguation": {
    s: "Uses the surrounding words and document context to pick among readings of ambiguous text, such as 1/2 as date or fraction, or St. as saint or street.",
    d: "Many tokens have several valid expansions, and the right one depends on the neighbors, the domain and sometimes the whole document. Disambiguation scores candidates with context rules, language models or taggers trained on labeled readings and picks the best. Some systems defer: they carry alternatives into later stages and choose by a language model score on the resulting word sequence. It is hard because the context needed can be far away, such as a heading that says the table is in metric units, and because the system rarely knows the reader's locale.",
    k: ["Decide early vs carry alternatives forward: early decisions are simple and cannot be revisited, deferred ones use more evidence at more cost.", "Local context only vs document-level context: local is fast and stateless, document context resolves more and complicates streaming and chunked requests."],
    p: ["Each chunk is normalized alone, so one document reads the same abbreviation two ways.", "Locale defaults assumed from the account rather than the text give British date order to a US reader."],
    v: "Run a test set of contextually ambiguous items with the disambiguating context and with it removed. Accuracy with context meets target and without context falls back to the documented default rather than a random choice.",
    dep: ["token-classifier", "locale-conventions"]
  },
  "pronunciation-dictionary": {
    s: "A large table mapping words to phoneme sequences with stress, part of speech and variants, checked first for every word the front end sees.",
    d: "Entries are hand-verified or machine-generated and reviewed, keyed by word and optionally by part of speech or sense. Lookups are exact, with normalization of case and punctuation, and morphology rules can derive inflected forms from a base. Dialect variants are tagged so a voice gets the right set. The dictionary is the highest-precision source of pronunciations and always incomplete: new words, names and slang arrive daily. Maintaining consistency with the phoneme inventory and with what voice recordings actually contain is a continuing cost.",
    k: ["Large curated dictionary vs rely on the learned model: curated entries are exact and expensive to maintain, learned prediction covers everything and errs on irregular words.", "One dictionary per dialect vs shared with rules: separate ones are accurate and multiply upkeep, shared ones are cheaper and blur regional speech."],
    p: ["Entries use a phoneme the voice never saw in training, so the word is spoken with a smeared sound.", "A dictionary update changes pronunciation of a common word and every product's audio shifts without warning."],
    v: "Synthesize every entry in a sampled subset in a carrier sentence and run round-trip recognition. The recognized word matches the key at a rate near that of ordinary speech, and dictionary changes show up in a diff before release.",
    dep: ["phoneme-inventory"]
  },
  "g2p-model": {
    s: "A learned model that predicts phonemes from spelling for words not found in the dictionary, including new words, names and misspellings.",
    d: "A sequence-to-sequence model reads characters, often with word context and language tag, and emits a phoneme sequence with stress. It is trained on the dictionary and generalizes the spelling patterns of the language. Accuracy is high on regular words and lower on irregular ones and foreign names. Outputs are cached because the same unknown words recur. Hard cases are languages with opaque spelling, names of mixed origin, and strings that are not words at all, where any pronunciation is arbitrary and a confident guess may be worse than spelling out.",
    k: ["Character-level model with word context vs isolated word model: context resolves some ambiguity and complicates caching, isolated words cache perfectly.", "Rules for regular languages vs a learned model everywhere: rules are exact where spelling is regular, a model is uniform and needs more data."],
    p: ["A confident but wrong pronunciation of a common name repeats in every request because the result is cached.", "A random string such as an ID produces pronounceable nonsense where spelling out was expected."],
    v: "Evaluate on held-out dictionary words and on a list of recent names and coined words, reporting phoneme and word error. Confirm out-of-distribution strings are routed to a spelling-out fallback.",
    dep: ["pronunciation-dictionary", "phoneme-inventory"]
  },
  "phoneme-inventory": {
    s: "The defined set of phoneme symbols the system uses per language and voice, with their definitions, mappings between alphabets and which of them each voice can actually produce.",
    d: "All lexicons, the g2p model, markup and the acoustic model must share one inventory, so this is a contract. It lists symbols, their phonetic values, stress and tone marks, and rules for mapping to standard alphabets. Multilingual systems either keep language-specific sets or use a shared set of universal sounds. Voice training data must contain each phoneme in enough contexts to model it. Changes ripple everywhere: adding or splitting a symbol means retraining models and revisiting every lexicon entry and tag.",
    k: ["Language-specific inventories vs a shared universal set: specific sets are precise and unrelated across languages, a shared set enables cross-language transfer with approximations.", "Fine phone distinctions vs coarse ones: fine sets capture dialect and cost more data, coarse sets are robust and flatten accents."],
    p: ["Two teams add similar symbols independently and lexicons use both for the same sound.", "A phoneme in the inventory has no training examples for a voice, so it is rendered as another sound."],
    v: "Check every symbol appears in the lexicons, the training data of each voice with a minimum count, and the alphabet mapping table. Synthesize one example per phoneme per voice and confirm listeners identify it.",
    dep: []
  },
  "homograph-resolver": {
    s: "Chooses the pronunciation for words spelled alike but spoken differently, such as read in past and present or lead as verb and metal, from the sentence around them.",
    d: "The dictionary stores several pronunciations for these words, each tagged by part of speech or sense. A tagger or classifier looks at neighbors and picks the tag, which selects the entry. Some systems train a contextual model on a list of the common homographs. Coverage is a finite list per language, so rare cases remain. It is hard because the signal can be subtle, the decision is made with few words of context, and a wrong choice is a conspicuous error that listeners notice immediately.",
    k: ["Part-of-speech tagging then lookup vs a dedicated classifier per word: tagging reuses one model, per-word classifiers are more accurate on key words and need data for each.", "Resolve only listed words vs use a general contextual model for all: lists are predictable and incomplete, a general model covers more with less control."],
    p: ["Short or fragmentary text, such as a menu item, gives no context and picks the common reading.", "The tagger is trained on formal text and fails on chat and headlines."],
    v: "Synthesize a labeled sentence set where each homograph appears in each sense and verify the chosen phonemes against labels. Then run round-trip recognition on the audio and check the intended word is recovered.",
    dep: ["pronunciation-dictionary", "context-disambiguation"]
  },
  "name-pronunciation": {
    s: "Handles personal names, place names, brands and loanwords, whose pronunciation follows the rules of another language or an individual's own preference.",
    d: "Names break spelling rules, so systems add name-specific dictionaries, origin detection that selects the pronunciation rules of a likely source language, and mappings that adapt foreign sounds to the sounds the voice can say. Customers supply lists of the names that matter, such as staff or products. For personal names the person's own preference outranks any rule. Quality here is highly visible: users judge a system by whether it says their name right. It is hard because origin detection from spelling is unreliable and phonemes from other languages may not exist in the voice.",
    k: ["Detect origin and apply foreign rules vs anglicize everything: detection sounds respectful and errs on mixed origins, uniform rules are consistent and often wrong.", "Customer-maintained name lists vs a built-in gazetteer: customer lists are exact for their domain, a gazetteer works out of the box with gaps."],
    p: ["Origin detection labels a name as the wrong language and applies rules that distort it.", "A name list for one customer leaks into the shared dictionary and changes others' audio."],
    v: "Synthesize a test list of names from varied origins, including some listed by customers. Native speakers rate acceptability, and the customer's own names pass without manual phoneme work.",
    dep: ["g2p-model", "user-lexicons", "language-id"]
  },
  "user-lexicons": {
    s: "Customer-supplied pronunciation and replacement entries applied on top of the built-in dictionary, for product names, jargon and corrections.",
    d: "A lexicon is a file or API object of word-to-phoneme or word-to-text rules, with scope by voice, language and account. At synthesis time its entries take precedence over the dictionary and the g2p model. Entries can be alias replacements, which rewrite text before normalization, or phoneme entries, which bypass the rest. Standard lexicon formats exist for portability. The difficulty is validation and precedence: invalid phonemes, entries that loop, matches that are too greedy, and entries that behave differently when words are inflected or capitalized.",
    k: ["Alias rewriting vs phoneme entries: aliases are simple for authors and depend on the rest of the pipeline, phonemes give exact control and require phonetic expertise.", "Exact word match vs pattern match: exact is safe and needs many entries, patterns cover variants and cause accidental matches."],
    p: ["An alias that contains its own key is applied repeatedly and expands the text.", "A lexicon entry changes common words the customer did not intend because matching is case-insensitive."],
    v: "Upload a lexicon with phoneme, alias and invalid entries. The invalid one is rejected with a message, the others take effect on exact and inflected matches, and a request without the lexicon is unchanged.",
    dep: ["pronunciation-dictionary", "phoneme-inventory", "markup-parser"]
  },
  "stress-syllabification": {
    s: "Assigns syllable boundaries and stress positions to phoneme sequences, which determines rhythm, vowel quality and where pitch accents can fall.",
    d: "Dictionary entries carry stress marks, and for predicted or derived words rules or a model place syllable breaks and primary and secondary stress. Compound words and suffixed words shift stress according to language-specific patterns. The prosody models consume these as features. The hard parts are that stress is contrastive in some languages and a pitch or length pattern in others, that stress in running speech differs from citation form, and that function words are usually unstressed while content words are not.",
    k: ["Stress as a symbol on the phoneme vs as a learned hidden feature: symbols are explicit and editable, hidden features adapt to context and cannot be inspected.", "Citation-form stress vs reduced forms in connected speech: citation form is simple, reduced forms sound natural and need context rules."],
    p: ["Stress on a derived word follows the base word and sounds foreign.", "Function words carry full stress, making the sentence sound read word by word."],
    v: "Compare predicted stress and syllables on a labeled word list per language and measure accuracy. In listening, check that compound and suffixed words sound normal in sentences.",
    dep: ["pronunciation-dictionary", "g2p-model"]
  },
  "language-id": {
    s: "Detects the language of a text, and of spans within it, so the right normalization rules, lexicon and voice behavior are used.",
    d: "A classifier over characters and short word fragments labels a document or each sentence with a language, and optionally a script and locale. Callers can supply the language, which overrides detection. For mixed text, span-level detection finds quoted foreign phrases and names. Short texts, closely related languages and text in a transliterated script are hard to classify. Detection errors are costly because every later stage then applies the wrong rules, so confidence thresholds trigger a fallback to the stated or default language.",
    k: ["Trust the caller's language tag vs detect from text: tags are cheap and are often missing or wrong, detection works on its own and fails on short text.", "Per-document vs per-span detection: per-document is stable, per-span handles code-switching and flips on noise."],
    p: ["A two-word text is labeled as the wrong related language and read with its rules.", "Detection runs on every chunk of a streamed document and the language flips mid-document."],
    v: "Run labeled texts of varied length across the supported languages and measure accuracy by length bucket. Confirm low-confidence short inputs use the stated language and that spans in a mixed test are labeled correctly.",
    dep: ["input-sanitizer"]
  },
  "code-switching": {
    s: "Speaks text that mixes languages inside a sentence, switching pronunciation rules and phoneme sets at the span boundaries while keeping one voice.",
    d: "After span-level language identification, each span is normalized and pronounced under its own language rules. The phonemes of the foreign span are either rendered natively when the voice supports them, or mapped to the nearest native sounds. Prosody must stay continuous across the switch. Multilingual models trained on mixed-language data handle the transition more smoothly than switching between separate models. The hard part is deciding how foreign to sound: a native speaker would pronounce an inserted foreign word differently depending on how familiar it is.",
    k: ["Native rendering of foreign phonemes vs mapping to local ones: native sounds correct and may need training data from the speaker, mapping is always speakable and sounds accented.", "One multilingual model vs a switch between monolingual models: one model gives smooth speech and complex training, switching is simple and produces seams."],
    p: ["A voice that was never trained on the second language speaks it with garbled phonemes.", "A brand name is detected as foreign and switched to the wrong rules mid-sentence."],
    v: "Synthesize sentences that embed foreign phrases of different lengths and have bilingual listeners rate pronunciation and smoothness at the boundary. Check for no change in voice identity across the switch.",
    dep: ["language-id", "cross-lingual-sharing", "phoneme-inventory"]
  },
  "script-conversion": {
    s: "Converts text between writing systems or variants before pronunciation, for example transliterated text, alternative scripts for one language, or variants with and without vowel marks.",
    d: "Some languages are written in more than one script or in an informal Latin spelling. Others omit marks that carry vowel information, so text must be restored before it can be pronounced. Conversion uses rules or models, applied after language identification and before the lexicon. Hard cases include diacritic restoration, where one spelling maps to several words, and text typed on keyboards without native characters. Errors are often silent: the output is well formed and says a different word.",
    k: ["Convert to a canonical script for the voice vs train the models on each script: conversion keeps one model, an error early on propagates, direct training avoids it and multiplies data needs.", "Restore missing marks by model vs require marked input: restoration serves real text and can pick the wrong word, requiring marks is exact and rarely satisfied."],
    p: ["Restoring missing vowel marks selects a plausible but different word.", "Transliterated names are converted back to a native script that spells them in a way nobody pronounces."],
    v: "Convert a labeled set of informal and unmarked text to the canonical script and compare to references. Then synthesize and round-trip recognize to confirm the intended words were spoken.",
    dep: ["language-id", "input-sanitizer"]
  },
  "locale-conventions": {
    s: "The per-locale rules for how numbers, dates, times, currencies and addresses are written and read, as data used by normalization.",
    d: "Locale data covers decimal and grouping separators, date field order, 12 or 24 hour clocks, currency names and positions, units commonly used, and how to read telephone numbers in groups. It is selected by the request's locale or inferred from the language and defaults. Normalization grammars read it rather than hard-coding it. This is mostly a data problem of breadth: hundreds of locales, subtle differences between regions that share a language, and conventions that change over time.",
    k: ["Language-level defaults vs full locale data: language defaults are cheap and wrong for regional differences, full data is correct and larger to maintain.", "Infer locale from account settings vs from text: account settings are stable and wrong for travelers, text inference adapts and can misjudge."],
    p: ["A US voice reads a day-first date as month-first, changing the date it means.", "Currency symbols shared by several countries are read with the wrong currency name."],
    v: "Synthesize the same date, number and amount under several locales and confirm that each reading follows that locale's convention and that the transcription differs where the conventions differ.",
    dep: []
  },
  "cross-lingual-sharing": {
    s: "Training one set of model weights on many languages so they share data, which lets low-resource languages benefit and lets one voice speak several languages.",
    d: "A shared phoneme inventory or learned universal units, plus language embeddings, let the acoustic model use recordings from all languages. A voice recorded in one language can then be made to speak another, with the speaker's identity kept and the accent partly retained or removed. This reduces data needs for new languages. Costs are interference, where languages with different sound systems degrade each other, and capacity: one model must be larger. Evaluation must be done per language, since a good average hides a poor tail.",
    k: ["One multilingual model vs one model per language: one model transfers and needs shared capacity, separate models are simpler and cannot pool data.", "Retain the speaker's native accent in other languages vs a native accent: retaining preserves identity and is judged foreign, native accent sounds natural and drifts from the voice."],
    p: ["Adding a language lowers quality in an existing one because capacity was already used.", "Strong accent leakage from the training language makes a cross-lingual voice hard to understand."],
    v: "For each supported language, measure word error and listener-rated naturalness against that language's single-language baseline. No language regresses beyond the stated tolerance after adding another.",
    dep: ["phoneme-inventory", "speaker-conditioning", "training-pipeline"]
  },
});
