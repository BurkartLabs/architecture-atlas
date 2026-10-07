// Details for the document OCR plate, part 2: recognition, handwriting, layout.
ATLAS.details("document-ocr", {
  "recognizer": {
    s: "The model that reads a cropped line image and outputs the character sequence it shows, together with a score for each position.",
    d: "A convolutional or attention-based encoder turns the line image into a sequence of feature vectors; a head predicts a distribution over the character set at each step. Training uses real and synthetic lines with augmentation for blur, noise and fonts. Inference runs on batches of lines padded to a common width. The model decides most of the system's accuracy and cost. Its hard parts are domain gaps such as unusual fonts, degraded print, rare symbols and languages with thousands of characters.",
    k: ["Line-level recognition vs whole-page models: line models are cheap, easy to batch and debug, but depend on good segmentation; whole-page models avoid segmentation errors and cost far more per page.", "Large general model vs small specialized model: general models cover more but cost more; specialized ones are cheap and accurate on one population and brittle elsewhere."],
    p: ["Accuracy collapses on a font or paper type absent from training, with no warning in the confidence values.", "Long lines are truncated or compressed by a fixed input width, dropping characters at the end."],
    v: "Evaluate on a held-out set of lines from the target population, and on a deliberately hard slice of small, faded and unusual-font lines, reporting character error for each slice separately.",
    dep: ["line-segmenter", "model-serving"]
  },
  "sequence-decoder": {
    s: "Turns the recognizer's per-step probabilities into the final text, choosing among alternative readings by greedy selection or beam search.",
    d: "Alignment-free training loss means output frames do not map one-to-one to characters, so the decoder collapses repeats and blanks to produce text. Beam search keeps several candidate strings and can combine the recognizer score with a language model or lexicon constraint. It also yields alternatives with scores, used for confidence and review suggestions. Wider beams give modest accuracy gains at higher cost. The difficulty is that decoding choices silently interact with constraints: a strict lexicon can force plausible but wrong words.",
    k: ["Greedy decoding vs beam search: greedy is fastest and nearly as good on clean print; beam search recovers ambiguous characters and enables rescoring at several times the cost.", "Unconstrained output vs lexicon-constrained: constraints fix typos in ordinary words but corrupt names, codes and identifiers that are not in any list."],
    p: ["A wide beam with a strong language weight turns an unusual surname into a common word.", "Repeat collapsing merges doubled letters or repeated digits, so 1001 becomes 101."],
    v: "Decode a set of lines containing doubled letters and repeated digits with greedy and beam settings; confirm repeats survive and measure the accuracy change per setting.",
    dep: ["recognizer"]
  },
  "language-model-rescoring": {
    s: "Rescores candidate transcriptions with a model of likely text, so ambiguous shapes resolve toward words and phrases that make sense in context.",
    d: "An n-gram or neural language model scores each beam candidate; the final choice combines recognizer and language scores with a tuned weight. Domain-specific models trained on invoices, legal text or addresses give large gains for those documents and little for others. The model can be integrated during beam search or applied afterward to the n-best list. Its risk is overcorrection: text that is unusual but correct is pulled toward the common, which is the worst behavior for names, numbers and codes.",
    k: ["Domain-specific model vs general: domain models resolve ambiguity much better in the target documents, but fail on anything outside the domain and need retraining as vocabulary changes.", "Heavy weight vs light: a heavy weight cleans noisy scans but overrides correct unusual text; a light weight preserves what the image says and leaves more errors."],
    p: ["Product codes are 'corrected' into dictionary words, and the corrections are fluent and wrong.", "The language model was trained on text that overlaps the evaluation set, so reported accuracy is inflated."],
    v: "Compare error rates with weight zero and the chosen weight, separately on ordinary prose, and on names, numbers and codes; the codes slice must not get worse.",
    dep: ["sequence-decoder", "lexicon"]
  },
  "lexicon": {
    s: "Word lists, name lists, patterns and domain vocabularies that bias recognition and validate results, such as city names, part numbers or product catalogs.",
    d: "A lexicon can constrain decoding, rescore candidates, or check output after the fact. Sources include dictionaries, customer master data, gazetteers and regular expressions for formats such as dates and identifiers. Per-customer lists are powerful: a known vendor list converts a probabilistic name into a near-certain match. They need maintenance as data changes and careful handling of case, accents, abbreviations and spelling variants. Too restrictive a list turns every new name into an error.",
    k: ["Hard constraint vs soft bias: hard constraints guarantee valid values but fail on anything new; soft bias raises the chance of known values while still allowing new ones.", "Global lexicon vs per-customer: per-customer lists are far more precise but multiply what must be stored, updated and protected."],
    p: ["A stale master list rejects a new vendor, and its invoices all go to manual review.", "Fuzzy matching against a large list snaps a misread name to the nearest wrong entry with high apparent confidence."],
    v: "Add a new vendor to the master list and confirm the next document with that name is recognized correctly; also confirm a name not on the list still comes out as written.",
    dep: []
  },
  "multilingual-models": {
    s: "Recognition models and character sets for many scripts and languages, either as one shared model or as a set routed by detected script.",
    d: "Scripts differ in character count, direction, joining behavior and diacritics: some need thousands of classes, some read right to left, and some change glyph shape by position in a word. A single model covers many scripts but spends capacity on each; a set of models gets better accuracy per script and requires routing. Training data is the limit: low-resource scripts have few real examples and rely on synthetic text. Mixed-direction lines need correct logical ordering when output.",
    k: ["One shared model vs per-script models: one model simplifies deployment and handles mixed text, while per-script models are smaller, faster and more accurate each, but need detection and routing.", "Synthetic training text vs real scans: synthetic data covers any script cheaply but misses real degradation and handwriting styles."],
    p: ["Right-to-left lines come out in visual order, and the text reads backward when it is displayed.", "Combining marks are dropped, so distinct words become identical strings."],
    v: "Run a labeled test set per supported script, including a mixed-direction line and one with combining marks, and publish error rates per script, not one average.",
    dep: ["recognizer", "script-detector"]
  },
  "char-confidence": {
    s: "A score for each character and word from the recognizer, indicating how sure the model is, which feeds field confidence and review decisions.",
    d: "Scores come from the recognizer's output probabilities along the chosen path, or from the gap between the best and second-best alternative. Word and field scores aggregate character scores by minimum, product or a learned combiner. Raw model probabilities are usually overconfident and are not comparable across models or document types without calibration. The challenge is that the most damaging errors, such as a clean-looking 8 read for a 3, often come with high confidence.",
    k: ["Raw model probability vs learned confidence head: raw scores are free but miscalibrated; a trained head predicts correctness better and needs labeled data.", "Aggregate by minimum vs average: the minimum flags any weak character in a number; the average hides one bad digit in a long string."],
    p: ["Users interpret a 0.95 score as 95 percent chance of being right when it is not.", "Confidence falls for rare but correct text and rises for common but wrong text."],
    v: "Bucket recognized words by confidence and plot actual accuracy per bucket; the curve should follow the diagonal, and the lowest bucket should hold a disproportionate share of the errors.",
    dep: ["recognizer", "sequence-decoder"]
  },
  "post-correction": {
    s: "Cleans up recognized text after the fact, fixing systematic errors such as common character swaps, broken words and hyphenation, using rules, context or a correction model.",
    d: "Rule-based passes fix known confusions and rejoin words split across lines by hyphens. Statistical or neural correction models use surrounding context to repair misspellings. Domain checks can fix values using format rules, such as digit-only fields. Corrections should be recorded with the original so they can be audited and undone. The difficulty is that any correction is a guess: it cannot know whether the odd spelling was an error or what the document actually says.",
    k: ["Correct automatically vs suggest to reviewers: automatic correction raises throughput but hides errors it creates; suggestions keep the original visible and cost review time.", "Generic vs field-specific correction: field-specific rules, such as digits only, are safe and effective; generic fixes risk changing correct text."],
    p: ["An aggressive spelling fixer rewrites a person's name, and the original is not stored.", "Dehyphenation joins a real hyphenated compound into one non-word."],
    v: "Compare output with and without the pass on a labeled set, count text changed from correct to wrong as well as wrong to correct, and confirm the original is retained for every change.",
    dep: ["language-model-rescoring", "lexicon"]
  },
  "glyph-ambiguity": {
    s: "Special handling for characters that look alike, such as zero and capital O, one and lowercase l, and five and S, using field type, context and font cues.",
    d: "These confusions are inherent in the image, not a model defect, so they are resolved with context. A field known to be numeric converts O to 0; a word known to be alphabetic does the opposite. Check digits, formats and positions in identifiers constrain the choices. Fonts matter: some fonts distinguish zero with a slash, others do not. The challenge is mixed content, such as an alphanumeric code where either reading is valid and only a database lookup can decide.",
    k: ["Apply field-type rules vs rely on the model: rules fix the most common confusions with certainty in typed fields, but need an accurate field type from earlier stages.", "Emit the best guess vs emit alternatives: alternatives let validation pick the one that passes a check digit, and complicate the result schema."],
    p: ["A numeric field is typed as text, so an O stays an O and fails downstream validation.", "An overly eager swap changes a letter in a legitimate alphanumeric code."],
    v: "Prepare identifiers with deliberately ambiguous characters and confirm that field-typed digits are read as digits and that check-digit validation passes for the corrected value.",
    dep: ["recognizer", "field-detector", "validation-rules"]
  },
  "handwriting-recognizer": {
    s: "A recognition model trained for handwritten text, which varies by writer, connects letters and has no fixed font.",
    d: "Handwriting models read lines or fields as sequences like print models do, but they face enormous style variation, cursive joins, slant, overwriting and ink bleed. Training data is expensive because it needs human transcription, so models are often fine-tuned from print models and use heavy augmentation. Accuracy depends strongly on field type: digits in boxes and short constrained answers are much easier than free prose. Errors are higher and confidence is less reliable, so handwriting is a main driver of human review.",
    k: ["Separate handwriting model vs one joint model: a separate model specializes and is easier to measure, but needs a classifier to route; a joint model is simpler to run and may underperform on both.", "Free-text recognition vs constrained fields: constraints with lexicons and formats raise accuracy dramatically but only work where valid answers are known."],
    p: ["A model trained on neat block capitals fails on cursive and returns confident wrong words.", "Corrections written over printed text are read as part of the original value."],
    v: "Measure error on a test set stratified by writer and field type, and confirm that the confidence of handwritten fields is calibrated separately from printed fields.",
    dep: ["line-segmenter", "model-serving", "char-confidence"]
  },
  "print-hand-mixing": {
    s: "Separates printed form text from handwritten entries on the same page and sends each to the right recognizer, so labels and filled-in values are not confused.",
    d: "A form carries printed labels and handwritten answers, sometimes overlapping or written in the margin. A region or line classifier labels each as print or handwriting using stroke regularity and learned features. Printed template content can also be subtracted using a blank form as reference, leaving only the entries. The routing result affects both recognition and field pairing. The difficulty is typed values on forms, handwritten annotations on printed contracts and stamps that are neither.",
    k: ["Classify regions then recognize vs one model reads both: routing allows specialist accuracy, but a wrong label sends text to the wrong model; one model avoids routing errors and is weaker at both tasks.", "Subtract a blank template vs classify: subtraction is precise when the template is known and registration is exact, and unavailable for unknown forms."],
    p: ["A handwritten date written over a printed label is read as one garbled string.", "Registration error of a few pixels leaves ghost remains of the template that look like handwriting."],
    v: "On filled forms with overlapping entries, check that printed labels are never reported as answers and that each handwritten value is assigned to the right field.",
    dep: ["handwriting-recognizer", "recognizer", "template-matcher"]
  },
  "signature-detector": {
    s: "Detects whether a signature is present and where it is, without reading it, and can compare it against stored specimens when identity checking is required.",
    d: "Detection finds a handwritten mark in a signature region, either at a known template position or anywhere on the page, using a trained object detector. The output is presence, location and a crop. Verification, comparing against a reference, is a separate and much harder biometric task with legal and fairness implications. Most document systems only report presence so a reviewer can check. Challenges include initials, stamps, scribbled lines and signatures overlapping printed text.",
    k: ["Presence only vs verification: presence is reliable and low risk; verification adds fraud control but carries error rates that need legal and operational handling.", "Template position vs full-page search: known positions are precise on fixed forms, and full-page search is needed for contracts with variable layout."],
    p: ["A struck-through line is reported as a signature and the document passes a completeness check.", "A cropped signature image is stored and shared like any other output, although it is biometric data."],
    v: "Run signed, unsigned, stamped and initialed pages; confirm presence results and locations, and that no signature crop is retained beyond the policy period.",
    dep: ["text-detector", "access-privacy"]
  },
  "checkmark-reader": {
    s: "Decides whether checkboxes, radio buttons and bubbles are marked, handling ticks, crosses, fills, scribbles and erasures, and reports a state with confidence.",
    d: "The box is located from the template or a detector, cropped, and classified as empty, checked or ambiguous. Marks vary: a cross, a tick, a dot, a filled square, a partially erased mark. Pixel-based fill measures work for printed bubble sheets, while a trained classifier handles human marks. Radio groups add a constraint that one choice is expected. The hard parts are lines of the box itself, stray marks, and values the writer changed.",
    k: ["Pixel-ratio threshold vs trained classifier: a threshold is simple and transparent for bubble forms, a classifier copes with ticks, crosses and corrections but needs labeled marks.", "Force a decision vs allow ambiguous: forcing keeps data complete; allowing ambiguous sends unclear boxes to review instead of guessing."],
    p: ["Printed box edges are counted as fill after small misregistration, so every box seems ticked.", "An erased mark leaves a gray smudge, and the answer reads as selected."],
    v: "Run a set of forms with every mark type, partial erasures and blank boxes, and compare box states with the ground truth, listing ambiguous results separately.",
    dep: ["field-detector", "template-matcher"]
  },
  "math-and-symbols": {
    s: "Recognition of formulas, chemical structures, musical or technical symbols, which need two-dimensional structure and a symbol vocabulary text models lack.",
    d: "Mathematics is laid out in two dimensions with fractions, subscripts, roots and matrices; output must be structured markup, not a flat string. Models read a cropped region and produce a tree or markup sequence. Other symbol domains, such as circuit diagrams or notation, need separate recognizers. Detection of the region is half of the problem, because inline formulas sit inside text lines. The tail of rare symbols is long, and one wrong subscript changes the meaning.",
    k: ["Markup sequence output vs structure tree: sequences are easy to train and display, trees allow structural checks but need a more complex model.", "Inline-formula detection vs treat as text: detection gives correct structure but adds a stage; treating as text is simple and garbles any non-trivial expression."],
    p: ["A fraction is flattened to a string, so the numerator and denominator run together.", "Symbols outside the training vocabulary map to the nearest known one with high confidence."],
    v: "Render known expressions in several fonts, scan them, and compare recognized markup to the source after rendering both; check structure, not only symbols.",
    dep: ["recognizer", "region-classifier"]
  },
  "page-segmenter": {
    s: "Divides a page into homogeneous regions such as text blocks, tables, figures and margins, giving later stages a map of what is where.",
    d: "Classical methods recursively split the page by whitespace and projection profiles; learned methods detect and label regions directly as objects. Output is a set of polygons with types, later grouped and ordered. It is the structural backbone of layout analysis, and its errors propagate: a table cut in half becomes two bad tables, and a caption merged into body text loses its meaning. The hard cases are dense multi-column layouts, magazines, forms with boxes and pages with overlapping elements.",
    k: ["Whitespace and rule-based splitting vs learned detection: rules are fast, explainable and work on regular print; learned detection handles irregular layouts but needs labeled pages of each style.", "Run on the image vs on recognized words: image-based is independent of recognition quality; word-based can use text and font cues but depends on a first recognition pass."],
    p: ["A sidebar is merged with the main column, so its text appears in the middle of a paragraph.", "A model trained on articles splits an invoice's totals block into three unrelated pieces."],
    v: "Overlay predicted regions on a sample of pages from each layout family, and compute region-level precision and recall against labeled pages; inspect the worst ten by eye.",
    dep: ["text-detector", "non-text-filter"]
  },
  "region-classifier": {
    s: "Labels each segmented region as paragraph, heading, list, table, figure, caption, footnote, page number or other, which drives how each region is processed.",
    d: "Features come from geometry, font size and weight, position on the page, text content and neighbors. Learned models use the image and the recognized words together. The label determines handling: tables go to structure recognition, figures to figure handling, headers and footers are removed from body text. The taxonomy is a product decision: more labels give more control and require more training data and agreement among annotators. Ambiguity between, for example, a caption and a short paragraph is constant.",
    k: ["Small label set vs fine-grained: a small set is easy to label and accurate; a fine set drives richer output and has lower agreement even between humans.", "Image-only features vs image plus text: adding text improves labels such as footnote or heading, but ties classification to recognition quality."],
    p: ["Page numbers are classified as body text and appear at the end of every page's content.", "Taxonomy changes without relabeling old data, and metrics across versions are no longer comparable."],
    v: "Compute a confusion matrix between predicted and annotated region types on held-out pages, and read the largest off-diagonal pair, such as caption versus paragraph, against real examples.",
    dep: ["page-segmenter", "recognizer"]
  },
  "column-detector": {
    s: "Finds columns and block groupings on multi-column pages, so lines are grouped into the right column before reading order is determined.",
    d: "Columns appear as vertical channels of whitespace or as consistent left edges across text blocks. Detection must tolerate ragged edges, pull quotes spanning columns, full-width headings and columns of different widths on the same page. The result is a set of blocks in a layout tree: page, column groups, blocks, lines. Mistakes here lead directly to text from adjacent columns interleaved line by line, the classic failure of naive text extraction.",
    k: ["Whitespace analysis vs learned block model: whitespace is deterministic and cheap, but breaks with dense layouts; learned models cope with irregular pages and cost more and drift.", "Page-level column count vs local: page-level is simple, but pages that change from one to two columns mid-page need local detection."],
    p: ["A full-width table inside a two-column article is split down the middle.", "Left-aligned lists with wide gaps are mistaken for separate columns."],
    v: "Run a corpus of one-, two- and three-column pages and mixed pages, and verify with a reader's eye that concatenated text follows the logical sequence without line interleaving.",
    dep: ["page-segmenter", "line-segmenter"]
  },
  "reading-order": {
    s: "Determines the sequence in which blocks and lines should be read, such as left column then right column, with sidebars, footnotes and captions placed sensibly.",
    d: "Rules sort blocks top-to-bottom and left-to-right with column awareness, or use a graph or learned model that predicts successor relations between blocks. Right-to-left and vertical scripts change the rules. The answer is not always unique: a caption can be read before or after its figure. Errors are hard to see in structured output yet devastating for search, summarization and language models consuming the text, because words are correct but in the wrong sequence.",
    k: ["Geometric sort rules vs a learned order model: rules are predictable and enough for simple pages; models handle complex magazines and forms, at the cost of occasional strange orderings.", "A single linear order vs a graph: a single order is what most consumers want; a graph represents genuine ambiguity but is harder to use."],
    p: ["Footnotes are read at the point where their blocks happen to appear, splitting a sentence in the middle.", "Slight tilt in block positions causes the sort to alternate between two columns."],
    v: "Compare the output text of each test page with a human-ordered transcript using an order-sensitive metric such as edit distance over blocks, not only word counts.",
    dep: ["column-detector", "region-classifier"]
  },
  "header-footer": {
    s: "Identifies repeating page headers, footers, running titles and page numbers, so they can be removed from body text or captured as metadata.",
    d: "Repeated content appears at similar positions across pages with small variations such as incrementing page numbers. Detectors compare regions across pages in a document or use a trained region classifier. Removing them prevents their text from interrupting sentences that cross page breaks; keeping them as metadata preserves useful data such as dates, document ids and confidentiality notices. Single pages have no neighbors to compare, so reliability falls for one-page documents.",
    k: ["Cross-page comparison vs single-page classifier: comparison is precise for long documents and impossible for one page; a classifier works anywhere and is less exact.", "Drop vs keep as metadata: dropping makes clean body text; keeping preserves information that may be the key field."],
    p: ["A header containing an invoice number is dropped, and the field is not found later.", "The first line of a page is removed because it resembles a header."],
    v: "On a multi-page report, confirm headers and footers are removed from the body on every page and appear exactly once in metadata with page numbers parsed.",
    dep: ["region-classifier", "cross-page-continuity"]
  },
  "heading-hierarchy": {
    s: "Infers the outline of a document, assigning heading levels and list nesting from font size, weight, numbering and position.",
    d: "Heading detection uses typographic cues, numbering patterns such as 1.2.3, indentation and learned models over text and style. Levels are assigned relative to other headings in the document, not absolute font size. The outline supports navigation, chunking for search and structured output such as nested sections. Documents with inconsistent style, scanned originals with lost font information and tables of contents that duplicate headings make the result uncertain.",
    k: ["Typography-based rules vs learned classification: rules are explainable and work for consistent documents; models handle varied styles but are harder to debug.", "Use the table of contents as ground truth vs infer from the body: the table is often accurate when present and may be incomplete or inconsistent with the text."],
    p: ["Bold run-in labels like 'Note:' are promoted to headings and fragment the outline.", "A level is skipped because one heading was missed, so every later section is nested under the wrong parent."],
    v: "Generate the outline for a long structured document and compare it with the source's table of contents, counting missing, extra and wrongly leveled entries.",
    dep: ["region-classifier", "reading-order"]
  },
  "cross-page-continuity": {
    s: "Connects content that spans page boundaries: paragraphs, lists, sentences, tables and headings that continue on the next page.",
    d: "Pages are processed in parallel, so joining happens afterward. Continuity cues include a paragraph ending without terminal punctuation, a hyphenated word at the bottom, repeated table headers and numbering that continues. The joiner merges regions into one logical unit, and removes artifacts such as repeated headers. It matters for retrieval and extraction: a field label at the bottom of one page and its value at the top of the next are otherwise lost. False joins are as harmful as missed ones.",
    k: ["Join eagerly vs conservatively: eager joining recovers more continuations but risks merging unrelated blocks; conservative joining keeps order exact and loses split content.", "Join per document vs per batch: per document needs reliable document separation first and avoids false joins across files."],
    p: ["Last paragraph of one document is joined with the first paragraph of the next in a combined scan.", "A table repeated header is read as data on page two."],
    v: "Take documents with a paragraph and a table deliberately split across a page break, and check the output contains one paragraph and one table with no duplicated header row.",
    dep: ["reading-order", "document-separation"]
  },
  "figure-handling": {
    s: "Detects figures, charts, photos and diagrams, links them with captions, and decides whether to keep them as images, describe them or extract their data.",
    d: "Figure regions are cropped and stored, and captions are paired by proximity and numbering such as 'Figure 3'. Optional steps include running recognition on text inside the figure, describing the image with a captioning model, or reading data from charts. The output schema must place the figure in the reading order and refer to it by id from the text. The difficulty is deciding how much to extract: a chart's underlying numbers are valuable, and recovering them is unreliable.",
    k: ["Keep as image with caption vs extract content: images are faithful and cheap; extraction makes content searchable but can invent details.", "Run text recognition inside figures vs skip: recognizing labels aids search and clutters body text unless clearly separated."],
    p: ["A caption is paired with the figure above it instead of below because the two are equally close.", "Text inside a chart's axes is merged into the body text."],
    v: "Check pages with several figures and captions: each figure has exactly one caption id, appears at the right place in output order, and no axis labels leak into the paragraph text.",
    dep: ["region-classifier", "reading-order"]
  },
});
