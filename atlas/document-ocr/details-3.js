// Details for the document OCR plate, part 3: tables, forms and key-values, classification.
ATLAS.details("document-ocr", {
  "table-detector": {
    s: "Finds the regions of a page that hold tables, bordered or not, and separates them from lists, forms and aligned text that only look similar.",
    d: "A detector trained on page images outputs table boxes; rule-based methods look for ruling lines or aligned columns of text. Detection must separate tables from key-value lists, forms with boxes, columns of prose and charts. Boxes should include header rows and captions or notes as separate pieces. A missed table sends its text to the paragraph path, where it comes out as a scrambled line sequence; a false table pushes prose through an expensive structure model.",
    k: ["Image-based detector vs rule-based line finder: rules are exact on ruled tables and miss whitespace-aligned ones; detectors find both and need training pages from the target style.", "Tight box vs padded box: tight boxes give precise cells, while padding keeps header text and outer borders that sit just outside."],
    p: ["A two-column list of terms and definitions is detected as a table and chopped into cells.", "Table boundary cuts off the last row, which is typically the total."],
    v: "Overlay detected tables on a mixed corpus of ruled, borderless, nested and non-table lookalikes; count missed tables, false tables and boxes that cut off rows.",
    dep: ["page-segmenter", "line-removal"]
  },
  "table-structure": {
    s: "Recovers the rows, columns and cell boundaries of a detected table, which is the core step that turns an image of a table into a grid of cells.",
    d: "Models predict row and column separators, cell boxes or a markup sequence describing the structure. Ruled tables can use detected lines directly; unruled ones rely on alignment of text and learned cues. The output is a structure with no content yet, which is joined with recognized text afterward. Quality is measured by whether the adjacency relations between cells are correct, not by whether every word was read. Dense tables, rotated tables and nested tables are the hard cases.",
    k: ["Predict separators vs predict cells as a sequence: separators give a regular grid and struggle with irregular spans; sequence models express spans and need more data.", "Structure from image vs from word boxes: word boxes are exact and suffer from recognition errors; image evidence is richer and heavier."],
    p: ["Two close columns are merged into one, so every row's values are concatenated in a single cell.", "A faint or dashed grid line is ignored and the row is split in the wrong place."],
    v: "Compare predicted cell adjacency against labeled structure on a set of ruled, partly ruled and unruled tables, reporting each type separately.",
    dep: ["table-detector", "model-serving"]
  },
  "cell-grid": {
    s: "Builds a regular grid of rows and columns from the structure prediction, assigning every cell a row and column index and a bounding box.",
    d: "Raw predictions may overlap, leave gaps or disagree on alignment. The grid builder snaps separators to a consistent lattice, resolves overlaps and records each cell's start and end indices. Tilt and perspective in photographed tables are corrected using the lattice itself. The grid is then the coordinate system for every table operation: content, headers, export. The hard part is tolerating distortion without inventing structure the page does not have.",
    k: ["Snap to a strict lattice vs keep irregular boxes: a lattice allows simple export and rigid assumptions; irregular boxes follow the page and make downstream conversion harder.", "Fix distortion in the grid vs earlier at image level: grid-level fixes use table geometry directly, and image-level fixes help every other stage too."],
    p: ["A single wrong snap shifts all later cells by one column, so every value lands under the wrong header.", "Empty cells are dropped and rows come out with different lengths."],
    v: "Reconstruct grids for tables with known cell indices; check that for every cell the row and column index equals the labeled one, including empty cells.",
    dep: ["table-structure"]
  },
  "spanning-cells": {
    s: "Handles cells that cover several rows or columns, such as grouped headers and subtotal labels, preserving the hierarchy they express.",
    d: "A header 'Revenue' above 'Q1' and 'Q2' spans two columns, and data cells below inherit meaning from both levels. The structure model predicts span extents, and the grid records them as row span and column span. Flattening a multi-level header into one string such as 'Revenue Q1' preserves meaning for most consumers. Errors are subtle, since a span off by one still looks like a plausible table and attaches values to the wrong header.",
    k: ["Keep spans in the output vs flatten to repeated cells: keeping spans is faithful and complex for consumers; flattening duplicates the text into every covered cell and is easy to use.", "Compose header paths vs leave separate rows: composed paths make each column self-describing and can produce long, unreadable names."],
    p: ["A group header covering three columns is applied to two, and the third column inherits the wrong label.", "Vertically merged label cells leave blanks in later rows when exported."],
    v: "Check tables with two-level headers and merged row labels; for several data cells, confirm the composed header path matches what a reader would see.",
    dep: ["cell-grid"]
  },
  "borderless-tables": {
    s: "Infers table structure when there are no ruling lines, from alignment, spacing, repeated patterns and the type of values in each column.",
    d: "Financial statements, reports and many receipts align columns with whitespace alone. Detection uses vertical alignment of word boxes, consistent gaps, numeric columns aligned by decimal point, and row structure from repeated line spacing. Learned models combine these cues. It is the hardest table case because the evidence is statistical: wide gaps inside a cell, ragged rows and multi-line cells produce different but equally plausible structures.",
    k: ["Alignment heuristics vs learned structure models: heuristics are fast and work on clean text; learned models resolve ambiguity with context and need examples of unruled tables.", "Use value types to guide columns vs geometry alone: types such as currency and dates can confirm column breaks and fail on text-heavy columns."],
    p: ["A multi-line description is read as several rows, each with empty numeric cells.", "A wide gap between a label and a value is read as a column break inside a text cell."],
    v: "Test with borderless statements and receipts; check that numeric columns total to the printed totals after extraction, as an independent proof of structure.",
    dep: ["table-structure", "recognizer"]
  },
  "cell-content": {
    s: "Assigns recognized words to cells by position, assembling multi-line cell text, and flags words that straddle cell boundaries.",
    d: "Each word box is matched to the cell with the greatest overlap; words inside a cell are ordered by line and position and joined. Multi-line cells, text overflowing its cell, rotated headers and cells with numbers and units need care. When recognition runs per cell, crops use the grid boxes and each cell is treated as a small line or block. Cell-level recognition is more accurate on clean grids and sensitive to grid errors.",
    k: ["Recognize the page then assign words vs recognize each cell: page-level reuses one pass and works with imperfect grids; cell-level crops are cleaner and fail if the grid is wrong.", "Assign by maximum overlap vs by center point: overlap handles larger words, while center point is simpler and fails on words straddling lines."],
    p: ["A word overflowing into the next cell is assigned to the wrong one and the value changes.", "Text in a cell is joined without regard to line breaks, so a two-line address becomes a jumble."],
    v: "Compare extracted cell text to labeled cell text for a set of tables with multi-line, overflowing and rotated cells; report exact-match rates by cell type.",
    dep: ["cell-grid", "recognizer", "spanning-cells"]
  },
  "multipage-tables": {
    s: "Joins a table that continues over several pages into a single logical table, matching columns and removing repeated header rows.",
    d: "Continuation is detected by a table at the bottom of one page and the top of the next, with matching column positions and counts, a repeated header or a missing one. Columns may shift slightly between pages because of scan differences, so matching uses relative positions. The joined result needs headers applied to all rows and continuation markers removed. Wrong joins are costly: totals double-counted or two tables merged. Tables ending exactly at a page end are the natural trap.",
    k: ["Match by geometry vs by header text: geometry works when headers are missing on later pages; header matching is robust when the layout shifts.", "Join automatically vs flag for review: automatic joining recovers complete tables for downstream; flagging avoids silent wrong merges for important documents."],
    p: ["A subtotal row at the bottom of page one is treated as the end of the table, and the next page becomes a separate table.", "Repeated header rows are kept as data rows, and each page boundary adds a fake record."],
    v: "Run a table across four pages and confirm one table with the correct row count, one header, and a sum of the amount column equal to the printed grand total.",
    dep: ["cell-content", "cross-page-continuity"]
  },
  "table-schema": {
    s: "Maps a recovered table onto a business schema, deciding which column is quantity, which is price and which row is a total, and converting cell text into typed values.",
    d: "Column headers are matched to schema fields by exact text, synonyms or an embedding or classification model, and column contents are checked against expected types. Rows are classified as data, subtotal, total or note. The result is typed records ready for downstream systems. The challenge is that header wording varies by supplier and language, columns may be absent or reordered, and arithmetic checks, such as quantity times price equals amount, are the reliable proof that the mapping is right.",
    k: ["Header-text matching vs content-based inference: header matching is explainable and fails on unlabeled or unusual headers; content-based inference works without labels and can mistake similar numeric columns.", "Strict schema vs flexible fields: strict schemas reject unexpected tables loudly; flexible schemas keep everything and push the interpretation to consumers."],
    p: ["Unit price and line total columns are swapped because both are currency columns with similar ranges.", "A subtotal row is imported as a product line and inflates the order total."],
    v: "For a set of invoices from different suppliers, check that quantity times price equals amount for each mapped line and that line sums reproduce the printed total.",
    dep: ["cell-content", "field-normalizer", "validation-rules"]
  },
  "template-matcher": {
    s: "Recognizes that a page is an instance of a known form, aligns it to the stored template and gives every field its expected location.",
    d: "Fixed forms such as tax forms, ID cards and standard application sheets have stable layouts. Matching uses keypoints, anchor text or line patterns to find the best template, then estimates a transform that registers the scan to the template. With registration, field zones are known in advance, which allows precise and cheap extraction. Failure modes: new revisions, slightly changed layouts, partial scans and photos with strong perspective that break the alignment.",
    k: ["Template-driven vs template-free extraction: templates are accurate and cheap for known forms and need upkeep for every revision; template-free models generalize and are less exact.", "Strict registration vs tolerant matching: strict alignment gives tight field zones and rejects variants; tolerant matching accepts more and widens the zones."],
    p: ["A new revision of a form shifts a field by two centimeters, and values are read from the wrong zone.", "The registration locks onto a repeated pattern in the form and aligns it one row off."],
    v: "Scan the same form at several tilts and offsets and confirm that field zones, drawn over each page, fall on the correct fields, and that a changed revision is reported as no match.",
    dep: ["page-classifier", "template-registry", "deskew"]
  },
  "field-detector": {
    s: "Locates the places where values appear on a page, such as input boxes, underlines, comb fields and labeled blanks, without needing a stored template.",
    d: "A detector finds candidate fields from visual cues: underlines, rectangles, character combs, shaded areas, labels followed by empty space. Each field gets a type guess such as text, date, number, checkbox or signature. Fields are linked to labels in later stages. On unknown forms this is the entry point of extraction. Complexity comes from forms that pack many fields in one line, nested boxes and fields that exist only by convention, such as a blank after a colon.",
    k: ["Learn field shapes vs infer from labels and context: shape-based detection finds empty fields reliably; context from labels is needed for fields with no visible box.", "Detect empty and filled fields alike vs only filled: detecting empty ones supports completeness checks and costs more review."],
    p: ["A table cell is detected as a text field and extracted as a value with no label.", "Comb fields with one box per character are treated as one field per box."],
    v: "Overlay detected fields on forms never seen in training and count missing fields, spurious fields and wrong type guesses against a labeled set.",
    dep: ["page-segmenter", "line-removal", "text-detector"]
  },
  "kv-pairing": {
    s: "Pairs each key such as 'Invoice date' with its value, using proximity, direction, layout and learned relations between text blocks.",
    d: "Candidates for keys and values are recognized regions; a model scores pairs using relative position, alignment, font, text and graph relations to neighbors. Values may be to the right, below, in a following column or in a different block. Generative and span-extraction models can skip explicit pairing and directly read the answer for a named field. Pairing must handle multiple values per key and keys with none. It is the core of schema-free extraction and the main source of confident wrong values.",
    k: ["Pairing model with explicit geometry vs reading models that answer questions about the page: pairing is inspectable and traceable to boxes; reading models are flexible and can answer from the wrong place without noticing.", "One value per key vs several: one is simpler for downstream; several preserves repeated keys like 'Ship to' and 'Bill to' correctly."],
    p: ["Label and value are paired with the next label in the row instead of the value below.", "A blank value makes the key claim the next field's value."],
    v: "On documents with the same keys in different positions, check that the value for each key is extracted along with the box it came from, and that missing values stay empty.",
    dep: ["field-detector", "label-association", "reading-order"]
  },
  "label-association": {
    s: "Decides which printed label belongs to which field or cell by direction and distance, for example a label above a box, to the left of a line or in a table header.",
    d: "Rules or models consider candidate labels near each field, scoring by distance, alignment, direction convention of the language and whether the label is already taken. Multi-line labels and shared labels such as one prompt for three adjacent boxes complicate matters. The result supplies field names for forms with no template. A systematic error, such as attaching every label one row too low, may go unseen because the values are extracted correctly and named wrongly.",
    k: ["Nearest-label rule vs learned association: nearest is transparent and reasonable for tidy forms; learning handles dense forms and costs labeled examples.", "Assign globally vs per field: global assignment avoids using one label twice and needs a solver; per-field is simple and permits duplicates."],
    p: ["Two fields claim the same label while a nearby label is unused.", "Right-to-left forms are processed with left-to-right conventions, and labels attach to the wrong side."],
    v: "Draw label-to-field links over dense forms and verify each link; count labels attached to more than one field and fields with no label.",
    dep: ["field-detector", "text-detector"]
  },
  "entity-extractor": {
    s: "Finds typed values in recognized text, such as dates, amounts, names, addresses and identifiers, using patterns, models and surrounding context.",
    d: "Regular expressions catch formats with strong structure; sequence-labeling or language models find names, organizations and addresses. Layout features such as position and font help distinguish the invoice total from other amounts. Candidates are ranked and one is chosen for each schema field. The extractor outputs the value, its source box and a confidence. Difficulty arises from many candidates for one field, such as five dates on an invoice, and from text that is only meaningful with spatial context.",
    k: ["Text-only extraction vs layout-aware: text-only is simple and misses position cues; layout-aware models use where and how large text is, and need layout input from earlier stages.", "Extract then validate vs constrain extraction by validation: validating afterward keeps the extractor generic, constraining improves precision for known formats."],
    p: ["The due date is chosen as the invoice date because both are formatted the same and the closer one wins.", "Addresses split across lines are extracted as two entities."],
    v: "Run on documents with several amounts and dates; for each target field, check the chosen value, its source box and that the second-best candidate is available for review.",
    dep: ["recognizer", "kv-pairing", "reading-order"]
  },
  "field-normalizer": {
    s: "Converts extracted raw strings into canonical typed values, such as ISO dates, decimal amounts with currency, and standardized addresses and identifiers.",
    d: "Dates are parsed under the document's locale, amounts have thousands and decimal separators of different conventions, phone numbers and postal codes have per-country formats, and names have order conventions. The normalizer keeps both raw and canonical values. Locale is decided from the document, the sender or settings. Ambiguity is genuine: 03/04/2025 is two different days. A wrong decision is invisible after conversion, since the result is clean and valid.",
    k: ["Infer locale from the document vs use account settings: inference adapts to mixed sources and can guess wrong on short text; settings are predictable and wrong for foreign documents.", "Fail on ambiguity vs pick a default: failing sends the value to review; defaulting keeps flow moving and sometimes silently wrong."],
    p: ["European amount 1.234,56 parsed as 1.234 and the value is off by a factor of a thousand.", "Two-digit years are expanded into the wrong century."],
    v: "Test with a table of ambiguous dates and amounts in several locales and confirm the output either follows the documented rule or is flagged; raw strings are retained with each canonical value.",
    dep: ["entity-extractor"]
  },
  "validation-rules": {
    s: "Checks extracted values against each other and against external data, such as totals that add up, check digits, valid ranges and matches with master records.",
    d: "Rules include arithmetic consistency, date order, check-digit and format validation, required fields, and lookups against customer or vendor records. A failed rule lowers confidence or routes the document to review, and it can also identify which field is the likely culprit. Validation is the strongest evidence of correctness available, because it checks the result against facts independent of the image. The cost is rule upkeep and false alarms from legitimate unusual documents.",
    k: ["Hard rejection vs lowering confidence: rejection is clear and blocks legitimate oddities; lowering confidence keeps data flowing with a visible warning.", "Central rules vs per customer: central rules are maintained once; per-customer rules match each business and multiply upkeep."],
    p: ["A rounding difference of one cent fails every invoice and floods the review queue.", "A rule checks a field the extractor filled with a default, so a wrong value passes for the wrong reason."],
    v: "Feed documents with deliberately wrong totals, invalid check digits and out-of-range dates; each must produce a specific failed-rule message pointing at the field.",
    dep: ["field-normalizer", "entity-extractor"]
  },
  "barcode-reader": {
    s: "Decodes linear and two-dimensional barcodes and machine-readable zones on documents, which give exact data with built-in error checks.",
    d: "Barcodes are located and decoded by dedicated algorithms, not text recognition, and return exact strings with a check. Identity documents carry machine-readable zones with a fixed font and check digits that can be validated against printed fields. Barcode content provides document ids, separator signals and cross-checks for recognized text. Damaged, small or blurred codes may need the original resolution, so the reader often runs on the raw image before downscaling.",
    k: ["Trust the code over recognized text vs cross-check both: trusting is exact when decodable; cross-checking catches tampered or mismatched documents and doubles the work.", "Decode on raw image vs preprocessed: raw keeps fine bars; preprocessed images may have been resized or thresholded in ways that break the bars."],
    p: ["A barcode is decoded on a page that was downscaled and the narrow bars merge.", "A machine-readable zone is read by the general recognizer, and filler characters are treated as text."],
    v: "Decode barcodes and zones on clean and degraded samples; confirm check digits pass, and that decoded identifiers match the printed text of the same document.",
    dep: ["scan-capture"]
  },
  "line-items": {
    s: "Extracts repeating rows such as invoice lines, order items and transactions as a list of structured records, tied to the table or text that held them.",
    d: "Line items can arrive in a clean table or as loosely arranged rows of text. The extractor identifies the repeating unit, splits rows, assigns columns to fields and handles descriptions wrapped across lines, discounts and tax lines. It is built on table structure when there is a table and on row clustering when there is none. The output is a list with per-field confidence and an arithmetic reconciliation with the document total. It is where small errors multiply, since one wrong row changes totals.",
    k: ["Table-first vs row-clustering: table-first uses structure and fails when no table is detected; row clustering works for loose layouts and is less precise on columns.", "Reconcile with the printed total vs trust each row: reconciliation catches missing or extra rows, and cannot say which row is wrong."],
    p: ["A wrapped description line is read as a new row with an empty price.", "A discount row with a negative sign is read as positive."],
    v: "On invoices with wrapped descriptions, discounts and taxes, confirm row count and per-row amounts against labeled lines and that the sum of lines reconciles with the printed total.",
    dep: ["table-schema", "cell-content", "validation-rules"]
  },
  "doc-classifier": {
    s: "Assigns each document a type such as invoice, receipt, contract, identity card or letter, using the images, text and layout of its pages.",
    d: "Features come from the image, from recognized text, or both; models range from small image classifiers to layout-aware text models. A first-page classifier is fast, and a whole-document classifier is more accurate for documents whose type appears later. Output is a distribution over types, not just a label, so low-confidence documents can be routed to review or a general path. The challenges are taxonomy design, near-identical types such as invoice and credit note, and types that appear after deployment.",
    k: ["Image-only vs text-and-layout features: image-only classification is fast and needs no recognition; adding text separates look-alike types and requires reading first.", "Flat type list vs hierarchy: hierarchies allow coarse routing with fine detail later and complicate training and evaluation."],
    p: ["Credit notes are classified as invoices, and their amounts are added instead of subtracted.", "The accuracy figure is dominated by two common types and hides a failing rare type."],
    v: "Report a per-class confusion matrix on a held-out batch from the current intake, and confirm that classification confidence of misclassified documents is lower on average than for correct ones.",
    dep: ["recognizer", "page-segmenter", "model-serving"]
  },
  "page-classifier": {
    s: "Labels individual pages inside a document, such as first page, continuation, attachment, cover sheet, terms page or blank, to guide extraction and boundary decisions.",
    d: "Page-level labels tell later stages where to look: a first page holds the header fields, a last page the signature, a terms page nothing to extract. They also feed document separation by marking first pages. The model sees a page image plus text and sometimes neighbor context. Blank and nearly blank pages are labeled explicitly, because they carry bleed-through and noise that recognition would turn into text.",
    k: ["Independent per page vs sequence model over pages: independent labeling is simple and parallel; a sequence model uses neighbors and requires the document's pages together.", "Detailed page labels vs few: detailed labels enable targeted extraction at the cost of labeling effort."],
    p: ["A signature page with little text is labeled blank and skipped.", "Back sides of double-sided scans with bleed-through are processed as content."],
    v: "Run double-sided documents with blank backs and signature-only pages, and verify page labels against the labeled set, with blank detection tested at the lowest ink levels.",
    dep: ["doc-classifier", "recognizer"]
  },
  "schema-selector": {
    s: "Chooses which fields, rules and models apply to a document based on its type, issuer and language, so each document is extracted with the right expectations.",
    d: "The selector maps classification output and other signals, such as sender, template match or customer, to an extraction schema: the list of fields to find, their types, required status, validation rules and model versions. Schemas can be inherited and overridden per customer. Selection is a decision with consequences: the wrong schema produces a complete and plausible-looking output for the wrong document. Ties and low confidence should fall back to a generic schema or to review.",
    k: ["Deterministic mapping vs model-chosen schema: a mapping is auditable and rigid; a model adapts and is harder to explain when it chooses wrongly.", "Specific schema per issuer vs generic per type: specific is more accurate and multiplies schemas to maintain."],
    p: ["A new supplier falls through to a generic schema that lacks a required tax field.", "Schema changes are deployed without versioning, and old results cannot be reproduced."],
    v: "Submit documents of each known type, an unknown issuer and an ambiguous document; the log should show which schema was chosen, why, and what the fallback was.",
    dep: ["doc-classifier", "template-registry"]
  },
  "routing-rules": {
    s: "Rules that decide a document's path: which pipeline, model tier, queue or team handles it, based on type, priority, language, quality and customer.",
    d: "Rules combine classification, quality score, customer policy, deadlines and cost limits. A clean invoice may take a fast path with a small model; a poor scan takes a heavier path or goes to manual keying; sensitive documents stay in a restricted region. Rules are data, versioned and testable, and applied by the orchestrator. Complexity grows as rules multiply and interact, so unexpected paths appear without any single rule being wrong.",
    k: ["Declarative rules vs code: declarative rules can be audited and changed without deploys; code expresses complicated conditions and hides policy in source.", "First-match vs scored routing: first-match is predictable; scoring blends many signals and is harder to reason about."],
    p: ["Two overlapping rules send half of a customer's documents to the expensive path, and nobody notices until the bill arrives.", "A rule refers to a queue that was renamed, and documents wait forever."],
    v: "Replay a day of documents through the rule set in a test environment and compare the distribution of paths with expectations, with each document's matched rule in the output.",
    dep: ["schema-selector", "quality-scoring", "pipeline-orchestrator"]
  },
  "template-registry": {
    s: "The versioned store of known templates, schemas, field zones and extraction configurations, with owners, effective dates and test samples.",
    d: "Each entry has an identifier, a version, reference images or features for matching, field definitions, validation rules and sample documents with expected output. Changes pass through tests against stored samples before activation, and old versions remain addressable for reprocessing. In a multi-customer service it is also a tenancy boundary. The difficulty is organizational: forms change without notice, and someone must notice, update and test the template before accuracy falls.",
    k: ["Central shared registry vs per-customer: shared entries are maintained once and fit every customer imperfectly; per-customer entries match exactly and multiply work.", "Edit in place vs immutable versions: immutable versions keep old results reproducible and require version management."],
    p: ["A template edited in place changes the output of documents processed yesterday when they are reprocessed.", "A form revision is not in the registry, and it is matched to the older version with a silent field shift."],
    v: "Activate a new template version, run its stored samples and confirm expected output; then reprocess an old document under its original version and confirm identical results.",
    dep: ["model-registry"]
  },
  "unknown-handling": {
    s: "The defined behavior for documents the system cannot classify or does not support: generic extraction, human triage, or rejection, with feedback into new types.",
    d: "An open-world intake always brings new documents. The system detects them through low classification confidence, failed template matching or no schema, then routes them to a generic extractor that returns text and layout only, or to a person who names the type. Collected unknowns are clustered to show which new type is common enough to support. Without a designed path, unknown documents are forced into the nearest known type and produce confident wrong output.",
    k: ["Reject or triage unknowns vs force to nearest type: triage costs human time and prevents wrong structured data; forcing keeps the pipeline fully automatic and silently wrong.", "Generic layout-and-text output vs no output: generic output still has value for search; none avoids a misleading partial result."],
    p: ["Unknowns pile up in an unmonitored queue, and a customer's whole new document type waits weeks.", "A threshold set too low classifies everything and the unknown path never fires."],
    v: "Submit a document type never seen before and confirm it leaves through the unknown path, appears in the unknown report with a thumbnail, and is not written to any typed output.",
    dep: ["doc-classifier", "review-queue"]
  },
});
