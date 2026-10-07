// Details for the document OCR plate, part 1: ingestion, preprocessing, text detection.
ATLAS.details("document-ocr", {
  "scan-capture": {
    s: "The point where paper becomes pixels: flatbed and sheet-fed scanners, multifunction devices and phone cameras, each with its own resolution, color, compression and distortion.",
    d: "Capture sets the ceiling for everything downstream. Scanners deliver flat, evenly lit pages at a known resolution; phone cameras deliver perspective, glare, motion blur and uneven focus. Capture software may crop, auto-rotate and compress before the file ever leaves the device. The system usually cannot change this stage, only publish guidance and reject bad input. Its difficulty is that quality problems are cheap to prevent at capture and expensive or impossible to fix afterward.",
    k: ["Controlled scanners with fixed settings vs open camera upload: predictable quality and simple tuning, but users must visit a device instead of using the phone in their pocket.", "Lossless or high-quality capture vs small files: aggressive compression saves bandwidth but blurs thin strokes and merges small characters."],
    p: ["Scanner firmware applies its own sharpening and lossy compression, producing artifacts that look like text to the detector.", "Users photograph documents on a dark table at an angle, so a third of the page is shadow."],
    v: "Capture the same page on the scanner and on a phone at three angles, run both through the pipeline and compare character error rates; the gap should match the documented capture guidance.",
    dep: []
  },
  "format-intake": {
    s: "Accepts uploads in the many container formats real users send, identifies each by content rather than file name, and rejects or quarantines what cannot be processed safely.",
    d: "Inputs include multi-page image containers, fixed-layout documents, office files converted to pages, email attachments and compressed archives. The intake step sniffs the real type from bytes, enforces size and page limits, unpacks archives and decodes the image codecs involved. Parsers for complex formats are a classic attack surface, so decoding usually runs in a sandbox with time and memory caps. The hard parts are malformed files, password protection and formats that look alike but behave differently.",
    k: ["Strict type allowlist vs accept everything: a short list is easy to secure and test, but every rejected format becomes a support request.", "Decode inside the pipeline vs in an isolated sandbox: isolation contains parser exploits and decompression bombs, at the cost of copying data and added latency."],
    p: ["A file with the wrong extension is sent to the wrong decoder and fails halfway through a batch.", "A small archive expands to gigabytes and exhausts memory on the intake worker."],
    v: "Upload a renamed file, a truncated file and a deliberately oversized archive; each must produce a clear typed rejection within a bounded time without affecting other jobs.",
    dep: ["access-privacy"]
  },
  "text-layer-probe": {
    s: "Checks whether a file already carries a trustworthy embedded text layer, so born-digital documents skip recognition and scanned ones get it.",
    d: "Many fixed-layout files are born digital and contain exact characters with coordinates, while scans are only images, and some hold an old, wrong text layer from a previous recognition pass. The probe extracts the layer and tests it: coverage of the page area, character plausibility, language match and agreement with a quick recognition of a sample region. If the layer passes, its words and boxes are used directly. The risk is trusting garbage text or discarding a perfect layer.",
    k: ["Trust any embedded text vs verify it: trusting is fast and exact for digital files, but inherits earlier recognition errors; verifying costs a sample read per page.", "Per-document vs per-page decision: mixed files exist, so per-page is correct but complicates output assembly."],
    p: ["A stale text layer from a bad scan is trusted, so wrong text is delivered with full confidence.", "Text drawn as outlines or images has no layer, and the probe wrongly reports an empty digital page."],
    v: "Feed a born-digital file, a scan and a scan with a deliberately wrong layer; the probe must route them to extraction, recognition and recognition respectively, and the logs show why.",
    dep: ["format-intake"]
  },
  "rasterizer": {
    s: "Renders each page of a document or container into a bitmap at a chosen resolution and color mode so every later stage receives the same kind of input.",
    d: "Fixed-layout pages are drawn by a renderer; image containers are decoded frame by frame. The rasterizer picks a pixel density, usually a few hundred per inch of page size, and a color mode, and records the scale factor so detected boxes can be mapped back to page coordinates. It must handle rotation flags, transparency, embedded fonts that are missing and very large pages. Memory and time grow with the square of resolution, which makes the choice a real cost decision.",
    k: ["High resolution vs low: small print and thin strokes survive, but compute and memory climb quickly, and very large images need tiling.", "Render once and cache vs render per stage: caching avoids repeated work, but stores a large intermediate that may contain sensitive content."],
    p: ["Forgetting the page rotation flag produces sideways images that cost a full recognition attempt before orientation is corrected.", "Lost scale factors make output coordinates disagree with the original page by a fixed ratio."],
    v: "Rasterize a page with a known grid of marks, run the pipeline, and confirm output boxes overlay the original page marks to within a pixel after scale conversion.",
    dep: ["format-intake", "text-layer-probe"]
  },
  "page-splitter": {
    s: "Breaks multi-page inputs into independent page tasks and groups pages into batches for efficient parallel processing, while remembering page order.",
    d: "A thousand-page file is split into page jobs that can run on many workers at once, then reassembled in order. Batching groups pages so accelerators stay busy without making any one request wait too long. Page jobs carry document id, page index and parent job so partial results and failures can be tracked. The challenge is that some later stages, such as multi-page tables and reading order across pages, need neighbors, so pages are not truly independent.",
    k: ["Page-level parallelism vs document-level: pages scale across workers and finish sooner, but stages needing context must be rejoined afterward.", "Large batches vs small: large batches use accelerators well but delay the first result and magnify the cost of one bad page."],
    p: ["One page fails and the whole thousand-page job is reported as failed, with no partial output.", "Pages complete out of order and are stitched in completion order, scrambling the document."],
    v: "Submit a fifty-page file with page 17 corrupt; the result should contain forty-nine ordered pages and one typed page error, with total time near that of the slowest page.",
    dep: ["rasterizer", "pipeline-orchestrator"]
  },
  "document-separation": {
    s: "Finds where one document ends and the next begins inside a single continuous stack of scanned pages, using separator sheets, barcodes or content cues.",
    d: "Back-office scanning produces large batches with many documents in one file. Separation can use explicit markers such as barcode sheets, blank pages and patch codes, or learned signals: a new first page looks like a letterhead or a form title, page numbers reset, and the sender changes. The output is a set of page ranges, each treated as a document. The difficulty is ambiguity: a missing separator merges two documents, and a spurious one splits a document across two extractions.",
    k: ["Explicit separator sheets vs learned content cues: sheets are near-perfect but need operator discipline; content cues need no process change but make occasional mistakes.", "Split eagerly vs merge eagerly: eager splitting loses multi-page context; eager merging mixes fields from two customers."],
    p: ["Two invoices merge into one record, so the second invoice's total overwrites the first.", "A blank page in the middle of a document is treated as a separator and truncates it."],
    v: "Scan a stack of known mixed documents, including two-sided pages with blanks, and compare output page ranges with the known boundaries; report merge and split error counts.",
    dep: ["page-splitter", "barcode-reader", "page-classifier"]
  },
  "provenance-metadata": {
    s: "Records for every page where it came from, how it was captured and what was done to it, so any output value can be traced back to pixels.",
    d: "Each page carries source file, hash, page index, capture device and time, declared resolution, and a log of transformations such as rotation, scaling and cropping with their parameters. Every extracted value later references a page and a region in original coordinates. This supports audits, disputes, reprocessing and debugging. The hard part is keeping coordinates meaningful through many transforms and keeping the metadata consistent when pages are split, merged or reprocessed.",
    k: ["Store transform history vs only final coordinates: history lets you map exactly back to the original, but adds bookkeeping to every stage.", "Content hashes as identity vs assigned ids: hashes deduplicate and prove integrity, but identical pages from different customers then need separate ownership."],
    p: ["A crop step forgets to record its offset, so highlighted regions in the review screen sit in the wrong place.", "Metadata containing device owner names is exported alongside results and leaks personal data."],
    v: "Pick any extracted value in the output and click through to its source page and highlighted original-coordinate box; the box must surround the same characters on the unprocessed scan.",
    dep: ["page-splitter"]
  },
  "resolution-normalizer": {
    s: "Rescales page images so characters have a consistent height in pixels, the range recognition models were trained on, regardless of capture resolution.",
    d: "Recognizers work best when text height falls in a band, for example twenty to forty pixels for body text. The normalizer estimates the stroke or x-height from the image or the declared density and resizes accordingly, using interpolation that preserves edges. Very small text may need upscaling; oversized pages are downscaled or tiled. It must keep a scale factor for mapping coordinates back. The difficulty is that one page can hold both fine print and headlines.",
    k: ["Resize the whole page vs per-region: whole-page is simple and fast, but mixed sizes suffer; per-region adapts but adds complexity and seams.", "Interpolation quality vs speed: sharper filters keep thin strokes but cost time and can add ringing around edges."],
    p: ["Upscaling a low-quality fax makes it larger, not more readable, and recognition time rises for no gain.", "Downscaling a large scan below the minimum text height merges adjacent letters."],
    v: "Run the same page at 100, 200 and 400 dpi; after normalization the median text-line height measured by the detector should fall within the target band for all three.",
    dep: ["rasterizer", "provenance-metadata"]
  },
  "color-and-binarization": {
    s: "Converts color images to grayscale and optionally to pure black and white, separating ink from background with a global or locally adaptive threshold.",
    d: "Classical pipelines binarize because it simplifies segmentation; learned recognizers often take grayscale or color directly. Global thresholds fail when lighting varies across the page, so adaptive methods compute thresholds per neighborhood. Learned binarization models handle stained or faded paper better. The step is lossy: thin strokes can break and light handwriting can vanish. Its difficulty is choosing when not to do it, since modern models may perform worse on aggressively thresholded input than on the raw image.",
    k: ["Binarize vs keep grayscale: binary images are small and simple for rule-based segmentation, but discard stroke pressure and faint marks that neural models use.", "Global vs adaptive threshold: global is fast and stable on clean scans, while adaptive survives shadows but can turn paper texture into noise."],
    p: ["Aggressive thresholding erases pencil handwriting and light stamps entirely.", "Adaptive thresholding on a blank margin fills it with speckle that the detector reads as text."],
    v: "Compare recognition error on a set of shadowed and faded pages with global, adaptive and no binarization; the chosen setting should have the lowest error on that set, not on clean scans only.",
    dep: ["resolution-normalizer"]
  },
  "deskew": {
    s: "Measures the rotation of text lines on a page and rotates the image to make them horizontal, correcting small tilts from feeding paper or holding a camera.",
    d: "Skew angle is estimated from projection profiles, line fitting on connected components, or a small regression model, usually within a few degrees. Rotation uses interpolation, which slightly blurs. Detectors that handle rotated boxes can skip this, but line segmentation, table grids and form templates still assume near-horizontal rows. The challenge is pages with mixed content: a rotated stamp or a diagonal watermark can pull the estimate away from the true text direction.",
    k: ["Correct the image vs detect rotated boxes: correcting keeps later stages simple, while rotated detection avoids resampling blur but complicates every geometry rule.", "Estimate per page vs per region: a global angle is robust, but a book spread or a curled page has two different angles."],
    p: ["A diagonal watermark dominates the estimate and a straight page is rotated by twenty degrees.", "Repeated deskew in multiple stages compounds interpolation blur."],
    v: "Rotate a clean page by known angles from minus ten to ten degrees; the estimated angle should match within a quarter degree and recognition error should return to the unrotated baseline.",
    dep: ["resolution-normalizer"]
  },
  "dewarp": {
    s: "Corrects curved pages, book spines and camera perspective so that text lines become straight and the page looks as if scanned flat.",
    d: "Photographed pages show keystone distortion from the camera angle and curvature from paper that is not flat. Perspective correction finds the page corners or a quadrilateral and maps it to a rectangle. Curvature correction fits a surface model to text baselines and unwarps it. Learned dewarpers regress a dense displacement field. The difficulty is that errors in the estimate produce visible stretching of characters and can be worse than leaving mild curvature in place.",
    k: ["Geometric fit to page edges vs a learned displacement model: geometry is predictable and cheap but needs visible edges; learning copes with messy scenes but can invent distortions.", "Always dewarp vs only when quality scoring says so: selective use saves time and avoids damage to clean scans."],
    p: ["Page-edge detection locks onto the table edge, and the whole page is stretched into a trapezoid.", "Dewarping a finger holding the page creates smeared characters at the boundary."],
    v: "Photograph a page with printed grid lines on a curved surface; after dewarping, measure line straightness and angle error against the flat scan of the same page.",
    dep: ["quality-scoring", "deskew"]
  },
  "denoise": {
    s: "Removes speckle, compression artifacts and scanner noise from page images while keeping thin strokes and small marks like punctuation intact.",
    d: "Median and morphological filters remove isolated dots; non-local filters and learned denoisers handle texture and compression blocks. The risk is removing signal: periods, commas, accents and dotted letters are the same size as noise. Many pipelines denoise only when the quality score shows a problem, and tune strength per document type. Faxed pages and photocopies of photocopies have structured noise that simple filters amplify rather than remove.",
    k: ["Strong filtering vs gentle: strong filtering cleans noisy faxes but erases punctuation and accents, which can change meaning in numbers and names.", "Classical filters vs learned denoisers: classical filters are predictable and fast; learned ones handle realistic degradation but need validation on each document population."],
    p: ["Decimal points vanish, so a recognized amount of 12.50 becomes 1250.", "A filter tuned on fax noise is applied to clean scans and blurs small print."],
    v: "Add known noise to clean pages, denoise, and compare error rates on digits and punctuation specifically; the filtered result should not lose any more punctuation than the clean baseline.",
    dep: ["color-and-binarization"]
  },
  "border-removal": {
    s: "Detects and crops scanner borders, punch-hole shadows, finger marks and background around the page so those dark regions are not read as text.",
    d: "Scanned pages come with black borders where the page was smaller than the platen, shadows near spines, binder holes and edge noise. Page-boundary detection finds the paper region by color and edge contrast, then crops and masks. Large dark regions confuse thresholding and are detected as text blocks. The hard part is pages with legitimate dark content near the edge, such as a full-bleed photo or a shaded form header, which must not be cropped.",
    k: ["Aggressive cropping vs conservative: aggressive cropping removes border noise, but risks clipping page numbers or margin notes that sit near the edge.", "Mask in place vs crop: masking preserves coordinates; cropping saves memory but requires an offset to be recorded for mapping back."],
    p: ["A margin page number is cropped away and the page cannot be ordered later.", "Punch-hole shadows are recognized as a column of letter-like glyphs."],
    v: "Scan a page with a visible border and binder holes; the detection output should contain no regions in those areas, and every word inside the printed margin should still be found.",
    dep: ["resolution-normalizer", "provenance-metadata"]
  },
  "illumination-correction": {
    s: "Flattens uneven lighting, glare and shadows in photographed pages by estimating the background brightness and dividing it out.",
    d: "A background estimate is built by heavy blurring or morphological closing that removes thin text, then the image is divided by it so paper becomes uniformly white. Learned models can also reduce specular glare and cast shadows from the photographer's hand. The result raises contrast for later thresholding and recognition. The difficulty is separating illumination from content: large dark fills, photographs and stamps can be mistaken for shadow and washed out.",
    k: ["Background division vs a learned shadow remover: division is fast and deterministic but misreads large dark content; a model uses context but is harder to bound on unseen conditions.", "Correct always vs on demand: always-on correction adds a step on clean scans where it changes almost nothing."],
    p: ["A dark logo block is treated as shadow and bleached out of the page.", "Glare that fully saturates pixels cannot be recovered, and the correction produces plausible but wrong strokes."],
    v: "Photograph a page with a hand shadow across half of it; after correction, the text under the shadow should be read with an error rate near that of the lit half.",
    dep: ["color-and-binarization"]
  },
  "line-removal": {
    s: "Detects and erases ruling lines, form boxes and background patterns that touch text, so characters are separated from the structure drawn around them.",
    d: "Forms and ledgers have printed lines, boxes and security backgrounds that cut through handwriting and stamped values. Long horizontal and vertical lines are found with morphological operations or line detectors, then removed with inpainting that tries to rejoin strokes that crossed them. The removed lines are not discarded: they are kept as a separate structure layer for table and form analysis. The difficulty is repairing characters like the letter l or the digit 1 that look like short line segments.",
    k: ["Remove lines before recognition vs keep them: removal helps touching handwriting but can break strokes; keeping them preserves strokes and relies on the model to ignore the lines.", "Keep removed lines as a layer vs discard: keeping costs memory but gives table and field detection the geometry they need."],
    p: ["A vertical stroke in a digit 1 is removed along with the box line it touches.", "Table grid lines are removed and never passed to structure recognition, so cells cannot be found."],
    v: "Take a ruled form with handwriting crossing the lines, remove lines, and confirm recognition improves on crossing characters while the preserved line layer reproduces the original grid.",
    dep: ["color-and-binarization", "deskew"]
  },
  "quality-scoring": {
    s: "Estimates how readable a page image is, from blur, contrast, resolution, noise and skew, so the system can fix it, route it, or reject it before recognition.",
    d: "Measures include sharpness from edge energy, contrast, effective resolution from stroke width, skew, glare and the fraction of the page that is dark. A learned scorer can predict expected recognition error directly. The score drives decisions: pick preprocessing steps, send a page to a stronger model, ask the user to recapture, or lower downstream confidence. Its hard part is calibration, since a score is only useful if it predicts actual errors on this document population.",
    k: ["Handcrafted measures vs a model that predicts error: handcrafted measures explain themselves, while a predictor is more accurate but needs labeled outcomes and retraining.", "Reject bad pages immediately vs process and flag: rejecting gives users fast feedback, but processing anyway may still produce usable output for a human reviewer."],
    p: ["A threshold tuned on one scanner rejects every page from a newer model with different noise.", "Blur from a scanner glass smudge appears on every page and floods the review queue."],
    v: "Score a set of pages with known blur levels, then plot score against measured error rate; the relation should be monotonic and consistent on a held-out batch.",
    dep: ["rasterizer"]
  },
  "text-detector": {
    s: "Finds every region of an image that contains text and outputs its bounding box or polygon, at word, line or block granularity.",
    d: "Detectors are either segmentation-style, predicting a text probability for each pixel then grouping, or box-regression style, predicting boxes directly. Output may be rotated rectangles or free polygons for curved text. Inputs are typically resized and run in tiles for large pages. Outputs feed line segmentation and recognition, so a missed region is lost permanently, and extra regions cost compute and add garbage. The hardest cases are dense small text, text on busy backgrounds, vertical text and very large headlines.",
    k: ["Pixel-segmentation vs direct box detection: segmentation handles curved and irregular text but needs a grouping step; direct boxes are simpler and fast but struggle with extreme aspect ratios.", "Tuning for recall vs precision: high recall misses nothing but sends clutter to the recognizer; high precision is cheaper but silently loses text."],
    p: ["Tiling cuts through a line, producing two half-lines read as different words.", "Light gray text on a colored background falls below the detection threshold and is never recognized."],
    v: "Overlay detected boxes on a set of labeled pages and compute recall at an overlap threshold of 0.5; inspect misses visually for the lightest and smallest text on the page.",
    dep: ["resolution-normalizer", "color-and-binarization", "model-serving"]
  },
  "line-segmenter": {
    s: "Groups detected words or regions into text lines and crops each line into the strip image that the recognizer reads.",
    d: "Lines are assembled by clustering word boxes along a baseline, tolerating slope, curvature and varying font size. Output is an ordered list of line images with baseline geometry and sometimes a normalized height. Overlapping ascenders and descenders, touching lines in handwriting, and tightly set column text make clustering ambiguous. It sits between detection and recognition, so merging two lines produces nonsense text and splitting one line removes context needed by the language model.",
    k: ["Rule-based clustering vs a learned line model: rules are transparent and fast for clean print, but fail on handwriting and unusual layouts where a model generalizes.", "Crop tightly vs with margin: tight crops reduce clutter but can cut off descenders; margin gives context but admits neighboring lines."],
    p: ["Two adjacent columns are merged into one long line because their baselines happen to align.", "A superscript or subscript is split into its own line and appears detached from its word."],
    v: "On pages with two columns, small captions and rotated stamps, check that each recognized line corresponds to exactly one line in the ground truth, counting merges and splits.",
    dep: ["text-detector", "deskew"]
  },
  "word-segmenter": {
    s: "Splits lines into words and, for scripts or tasks that need it, into individual characters, so that each unit can be positioned, scored and aligned.",
    d: "Word boundaries come from whitespace gaps relative to character width, or from the recognizer's own alignment. Character segmentation is rarely done explicitly now; sequence models read the whole line, and boxes are recovered afterward from the alignment. Word boxes are still required for highlighting, redaction, table cell assignment and form fields. The difficulty is scripts without spaces, justified text with stretched gaps, kerned and tightly tracked type, and cursive writing.",
    k: ["Explicit segmentation vs alignment from the recognizer: explicit segmentation gives boxes independent of the model but breaks on cursive; alignment handles connected scripts but boxes are only as good as the model's timing.", "Word-level vs character-level boxes: character boxes allow precise redaction and highlighting but cost more to compute and store."],
    p: ["Letters in a justified line are separated by wide gaps and one word becomes four.", "Character-level highlights drift because boxes were interpolated from line width rather than measured."],
    v: "Highlight each recognized word on the page and verify on a sample of justified, tightly spaced and unspaced-script lines that each box covers exactly one word of the ground truth.",
    dep: ["line-segmenter", "recognizer"]
  },
  "orientation-detector": {
    s: "Determines whether a page or line is upright or turned by 90, 180 or 270 degrees and rotates it, including mixed orientations on one page.",
    d: "A small classifier looks at the page or at sampled text regions and predicts one of four rotations, sometimes using the recognizer's own confidence on each rotation as a tiebreaker. Pages from scanners fed in the wrong direction are common, and tables or labels may carry sideways text inside an upright page. Orientation should be settled before recognition because a model reading upside-down text returns confident nonsense. Pages with little text are the failure case.",
    k: ["Page-level vs region-level orientation: page-level is cheap and covers most scans, but side labels and rotated table headers need region-level handling.", "Classifier vs trial recognition at each rotation: a classifier is fast; trial recognition is reliable but costs up to four recognizer passes."],
    p: ["A mostly blank page is rotated upside down because the detector has no text to judge.", "Rotating a whole page to fit its heading turns a sideways table header into upright text and the table body sideways."],
    v: "Feed every page of a test set at all four rotations and confirm output text matches the upright baseline; list pages with few words separately since they are the likely failures.",
    dep: ["text-detector", "recognizer"]
  },
  "script-detector": {
    s: "Identifies which writing systems and languages appear in each region, so the right recognizer, dictionary and language model are used.",
    d: "Script classification looks at glyph shapes and can run on the image before recognition; language identification usually runs on recognized text, then feeds back to choose models or rescoring. Documents often mix scripts: a bilingual form, product names in another alphabet, numbers inside text. A page-level answer is rarely right, so detection works per line or per region. The difficulty is short strings, similar scripts and languages that share an alphabet, where evidence is thin.",
    k: ["Detect before recognition vs after: before is cheap and selects the model; after is more accurate on text but needs a first pass with a general model.", "One multilingual model vs routing to per-script models: one model is simpler to run, while routing gives better accuracy per script but needs reliable detection."],
    p: ["A Latin-script line containing a single foreign word is routed to the wrong model for the entire line.", "Languages sharing an alphabet are misidentified, so the wrong dictionary silently turns correct words into near-matches."],
    v: "Run a set of bilingual pages with labeled regions and confirm region-level script and language labels, including a short line of three words and a mixed-script line.",
    dep: ["text-detector"]
  },
  "non-text-filter": {
    s: "Rejects detected regions that are not text, such as logos, stamps, borders, patterns, photographs and decorative graphics, before they reach recognition.",
    d: "Detectors respond to anything with high edge density: ornamental borders, barcodes, guilloche backgrounds, charts, dotted lines and photos. A classifier or heuristic scoring of stroke regularity, aspect ratio and recognizer confidence rejects them. Passing non-text to the recognizer wastes time and produces confident-looking junk strings. Rejecting too much loses stylized text such as logos containing a company name, which can be useful data. The boundary between text and graphic is a product decision as much as a technical one.",
    k: ["Filter before recognition vs after: filtering before saves compute, while filtering after uses recognizer confidence and lexicon hits as evidence but pays for reading the junk.", "Drop rejected regions vs keep them as figures: keeping them lets layout and output show a logo or stamp in place."],
    p: ["A stylized logo is discarded although the business name in it is the key to classification.", "A decorative border is read as a string of the letters I and l and pollutes the output."],
    v: "Run pages containing stamps, logos and ornamental borders; count regions passed to recognition, and confirm that none of the output strings come from those graphics while real text remains.",
    dep: ["text-detector", "char-confidence"]
  },
});
