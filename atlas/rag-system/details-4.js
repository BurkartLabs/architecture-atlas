// Details for the retrieval-augmented generation plate, part 4: embeddings, ingestion, chunking.
ATLAS.details("rag-system", {
  "embedding-model-selection": {
    s: "Choosing the model that turns text into vectors, weighing retrieval quality on your own data against dimension, speed, language coverage, input length, cost and hosting.",
    d: "Public leaderboards give a starting shortlist, but quality varies by domain, so candidates are run on the system's own test set and compared on recall at k. Dimensionality sets index size and speed; maximum input length limits chunk size; language coverage decides multilingual support. Hosted models add cost and send text out of the environment; self-hosted ones need serving capacity. The decision is sticky because every chunk must be re-embedded to switch, so it deserves a real evaluation rather than a default.",
    k: ["Larger higher-dimension model vs smaller: larger usually retrieves better, but multiplies storage, index memory and query latency.", "Hosted service vs self-hosted: hosted is quick to adopt, but adds per-call cost, external data flow and a dependency; self-hosted gives control at an operating cost."],
    p: ["Picking by leaderboard rank alone yields a model that underperforms on the domain's jargon and document style.", "A hosted model deprecated by its provider forces an unplanned full re-embedding."],
    v: "Run three candidate models over the same chunks and test set, report recall at k, index size and p95 query time for each, and confirm the chosen one meets the targets on all three.",
    dep: ["retrieval-test-sets", "model-serving-gateway"]
  },
  "document-embedding-jobs": {
    s: "The batch and incremental jobs that embed every chunk, track which model version produced each vector, retry failures and write results to the index.",
    d: "Chunks are queued, grouped into batches sized for the model's throughput, and sent to the embedding service. Each result is stored with the chunk id, model version and a content hash so unchanged chunks are not recomputed. Rate limits, timeouts and partial failures are handled with retries and a dead-letter queue for chunks that repeatedly fail. Throughput matters most during initial loads and re-embeddings. The difficulty is idempotence: a retried batch must not duplicate or leave half-written state.",
    k: ["Large batches vs small: large batches use accelerators efficiently, but one failure wastes more work and delays visibility of new content.", "Embed on ingestion vs lazily at first query: on ingestion keeps queries fast, while lazy saves cost for chunks never searched, but adds latency to unlucky queries."],
    p: ["Silently skipped failed chunks leave documents that exist in the store but can never be retrieved.", "Truncation of over-length chunks drops the end of the text from the vector without any error."],
    v: "Ingest a thousand chunks with a deliberately failing subset and confirm failures land in the dead-letter queue, all other chunks have vectors tagged with the model version, and rerunning produces no duplicates.",
    dep: ["embedding-model-selection", "job-orchestrator", "chunk-store", "embedding-cache"]
  },
  "query-embedding": {
    s: "Turns the user's query into a vector with the same model and settings used for chunks, including any query-specific instruction prefix the model requires.",
    d: "Many embedding models treat queries and documents differently, adding an instruction or using a separate query mode. The service embeds the normalized or rewritten query, often several variants, and returns vectors in tens of milliseconds. It sits on the interactive path, so it needs low latency, a short timeout and a fallback to lexical-only search. The common failure is a mismatch: wrong prefix, different model version or different normalization from indexing produces vectors that are silently misaligned.",
    k: ["Same service for queries and documents vs separate serving: shared is simpler and consistent, while separate serving isolates interactive latency from bulk batch load.", "Embed raw query vs rewritten: rewritten usually retrieves better, but depends on the rewriter's accuracy."],
    p: ["Bulk re-embedding saturates the shared service and pushes interactive query latency over budget.", "A model upgrade applied to queries before the index is rebuilt makes all dense results nonsense."],
    v: "Embed a stored chunk's own text as a query and confirm that chunk is the top result with near-maximal similarity, which proves query and document paths are aligned.",
    dep: ["embedding-model-selection", "embedding-cache", "model-serving-gateway"]
  },
  "multilingual-embeddings": {
    s: "Handles collections and questions in several languages, so a query in one language can find relevant passages written in another.",
    d: "A multilingual model maps text in many languages into a shared space, allowing cross-language retrieval. Lexical search needs per-language analysis: tokenization differs, and some languages have no spaces between words. Language detection routes text to the right analyzers, and answers must respond in the user's language. Quality varies widely across languages, with low-resource languages retrieving worst. The challenge is evaluating each language separately, since an overall average hides poor performance on smaller ones.",
    k: ["One multilingual model vs per-language models: one model supports cross-language search and is simpler to operate, but may trail specialist models within a single language.", "Translate documents at ingestion vs rely on multilingual vectors: translation lets one language's tools run everywhere but costs and loses nuance; multilingual vectors keep originals."],
    p: ["A single test set in one language hides that other languages retrieve far worse.", "Mixed-language documents get one language label and are analyzed wrongly for half their text."],
    v: "Query in Spanish for content that exists only in an English document and confirm it is retrieved and answered in Spanish; report recall per language rather than a single average.",
    dep: ["embedding-model-selection", "language-detection", "retrieval-test-sets"]
  },
  "embedding-versioning": {
    s: "Records which model, settings and preprocessing produced every vector and keeps old and new indexes separate during a migration, so versions are never mixed.",
    d: "Each vector carries a model identifier, dimension, normalization and chunking version. A model change builds a new index alongside the old, re-embeds the collection in the background, evaluates it, and switches queries over atomically, keeping the old one for rollback. Queries use the version matching the index they hit. The difficulty is cost and time: a full re-embedding of a large collection takes hours to days and must run while documents continue to change.",
    k: ["Parallel new index then cut over vs in-place update: parallel is safe and reversible but doubles storage temporarily; in place saves space but exposes mixed versions.", "Re-embed everything vs re-embed lazily on access: everything ends consistent, but is costly; lazy spreads cost but leaves a long mixed state."],
    p: ["Documents updated during migration are embedded with the old model only, missing from the new index.", "Vectors of different dimension or normalization in one index cause errors or silent mis-ranking."],
    v: "Run a migration to a new model, and confirm during it that every query hits exactly one consistent index version, then after cut-over that no vector in the live index carries the old version tag.",
    dep: ["document-embedding-jobs", "index-snapshots", "backfill-reembedding"]
  },
  "embedding-fine-tuning": {
    s: "Adapting an embedding model with the organization's own query-passage pairs so that its notion of similarity matches the domain's vocabulary and relevance judgments.",
    d: "Training pairs come from logged clicks, labeled test cases, or synthetic questions generated from chunks, with hard negatives that look relevant but are not. The adapted model is trained for a short run and evaluated on held-out queries. It can lift recall noticeably in specialized fields with unusual terminology. The costs are the labeled data, the training pipeline, and the re-embedding of the whole collection with each new model, and it may overfit to the training style.",
    k: ["Fine-tune the embedding model vs improve chunking and re-ranking first: fine-tuning gives gains on specialized language, but is costly and sticky; the other steps are cheaper and reversible.", "Synthetic pairs vs human-labeled: synthetic scale easily but mirror their own source phrasing; human pairs are realistic but scarce."],
    p: ["Training on queries that also appear in the test set inflates measured gains that vanish in production.", "A fine-tuned model degrades on general queries it was not trained for."],
    v: "Evaluate the tuned and base models on held-out real queries that were never used in training and confirm recall improves on domain queries without falling on a general-purpose sample.",
    dep: ["embedding-model-selection", "feedback-capture", "retrieval-test-sets", "backfill-reembedding"]
  },
  "multimodal-embeddings": {
    s: "Embeds images, charts, tables or audio into the same vector space as text, so a text question can retrieve a figure or a slide directly.",
    d: "A multimodal model embeds page images, figures or screenshots alongside text chunks, allowing retrieval of content whose meaning is visual: a chart, a diagram, a scanned form. Alternatively images are converted to text by captioning or OCR and embedded as text. Retrieved images must be passed to a model that can read them, or described first. The difficulty is cost and the mismatch between modalities: image vectors and text vectors may not rank against each other well, so they are often searched separately.",
    k: ["Embed page images directly vs extract text then embed: direct image embedding keeps layout and figures, but needs a vision-capable generator; extraction is cheaper and works with text-only models, but loses visual information.", "One shared index vs separate per modality: shared allows simple mixed queries, but score scales across modalities are poorly matched."],
    p: ["A retrieved chart is passed to a text-only model, which answers without ever seeing it.", "Image embeddings of text-heavy pages match on layout rather than on what the text says."],
    v: "Ask a question whose answer appears only in a bar chart and confirm the chart is retrieved, passed to a model that can read it, and the answer matches the plotted values.",
    dep: ["embedding-model-selection", "layout-table-parsing", "vector-index"]
  },
  "embedding-cache": {
    s: "Stores computed vectors keyed by text hash and model version so identical chunks or repeated queries are not embedded again.",
    d: "Before calling the embedding service, the system hashes the normalized text together with the model version and looks it up. Hits skip the call. For documents, it saves cost when only part of a document changed or when the same text appears in many files. For queries it speeds repeated and popular questions. Entries are keyed to model version and evicted by size or age. The risk is serving stale vectors after a model or preprocessing change, and holding content that deletions must also remove.",
    k: ["Cache vectors durably vs in memory only: durable cache survives restarts and re-embeds cheaply, but is another store holding derived sensitive data; memory-only is simple and ephemeral.", "Key on text only vs text plus settings: text-only hits more, but returns wrong vectors after a settings change; the fuller key is safe."],
    p: ["Cache keys that omit the model version return old vectors after an upgrade and corrupt the index.", "Deleted documents' vectors remain in the cache and persist content that should be gone."],
    v: "Embed a chunk, embed it again and confirm no service call is made; switch model version and confirm the cache misses and a fresh vector is computed.",
    dep: ["metadata-database"]
  },
  "source-connectors": {
    s: "Adapters that read documents, metadata, permissions and change notifications from each source system, such as file shares, wikis, ticketing tools, databases and websites.",
    d: "Each connector authenticates to its source, lists items, fetches content and returns a normalized record: text or file bytes, identifier, title, URL, timestamps, owner and access control information. It paginates, respects rate limits and handles source-specific quirks. Incremental modes use cursors or change feeds. Connectors are the largest source of operational toil, because every source has its own schema and failure behavior. The difficulty is fidelity: lost permissions or timestamps make downstream filtering and freshness wrong.",
    k: ["Build a generic framework with per-source plug-ins vs one-off scripts: a framework standardizes retries, state and monitoring, but takes up-front effort; scripts are fast to write and costly to operate.", "Pull on a schedule vs receive push events: scheduled pulls work with any source, while events give low latency but need source support and a backup poll."],
    p: ["A connector that drops access-control data indexes everything as public to all users.", "Hitting source rate limits causes silent partial syncs that look successful."],
    v: "Sync a test source containing known documents, shares and deletions and confirm the normalized records match the source in content, timestamps and permissions, and that a second sync fetches only changes.",
    dep: ["crawl-scheduler", "raw-object-store", "secrets-and-config", "permission-model"]
  },
  "crawl-scheduler": {
    s: "Decides which sources and documents to fetch and when, balancing freshness targets against source rate limits, cost and politeness.",
    d: "It maintains per-source schedules, such as hourly for support tickets and weekly for archives, and per-document priorities based on change frequency and importance. It limits concurrency, backs off on errors, and spreads load. Web sources honor robots rules and conditional requests. State records the last cursor and last success. The difficulty is fairness and recovery: one huge source can starve others, and after an outage the backlog must drain without overwhelming the source or the embedding service.",
    k: ["Uniform schedule vs adaptive by change rate: uniform is simple and predictable, while adaptive saves fetches and keeps volatile content fresher, but needs change statistics.", "Shared worker pool vs per-source limits: a shared pool uses capacity fully, but lets one source monopolize it; per-source limits protect fairness."],
    p: ["After an outage, the full backlog is requested at once and the source blocks the account.", "A source that fails permanently keeps retrying forever and hides in the noise."],
    v: "Pause a source for an hour then resume it, and confirm the backlog drains at the configured rate limit without errors from the source and without starving other sources' scheduled crawls.",
    dep: ["source-connectors", "job-orchestrator", "change-detection"]
  },
  "format-detection": {
    s: "Identifies each file's real format from its content rather than its name, and routes it to the right parser or rejects it.",
    d: "Files arrive with wrong or missing extensions, compressed archives, nested attachments and password protection. Detection inspects signatures and structure to pick a parser for text, office documents, PDF, images, spreadsheets, markup or email, and unpacks containers recursively with limits on depth and size. Unsupported or encrypted files are recorded as skipped, with a reason, rather than dropped quietly. The difficulty is safety: archives that expand enormously and malformed files are common ways to exhaust resources or exploit parsers.",
    k: ["Detect by content signature vs trust the extension: signatures are reliable, but cost a read; extensions are free, but are often wrong.", "Recursive unpacking vs treating archives as opaque: unpacking finds content in attachments, but needs strict limits against decompression bombs."],
    p: ["A parser run on a malicious file inside the main process can crash or compromise the ingestion worker.", "Skipped encrypted files go unreported, so users assume their content is searchable."],
    v: "Submit files with wrong extensions, a nested archive, an encrypted file and an oversized archive, and confirm each is parsed correctly or recorded as skipped with a reason, without exhausting memory.",
    dep: ["source-connectors", "raw-object-store"]
  },
  "text-extraction": {
    s: "Converts parsed files into clean text with a map from each piece of text back to its location in the original, such as page, coordinates or element.",
    d: "Extraction reads the text layer of PDFs and office documents, strips boilerplate such as headers, footers and navigation, handles columns and reading order, and decodes character sets and ligatures. It records offsets and page locations for citations and highlighting. Results are normalized for whitespace and hyphenation. The difficulty is that extraction errors are silent: scrambled column order, missing text boxes or garbled encodings produce chunks that look plausible but cannot answer questions.",
    k: ["Strip boilerplate aggressively vs keep everything: stripping reduces noise and duplicate matches, but risks removing meaningful headers or notes; keeping is lossless but pollutes retrieval.", "Layout-preserving vs plain text output: layout-preserving helps tables and columns, but produces text full of spacing that complicates chunking."],
    p: ["Two-column pages extracted line by line interleave the columns and make sentences unreadable.", "Repeated page headers and footers appear in every chunk and match unrelated queries."],
    v: "Extract a sample set of two-column, scanned and slide documents, and compare extracted text with a human-checked transcript on reading order and completeness, reporting a per-document error rate.",
    dep: ["format-detection", "ocr-fallback", "layout-table-parsing"]
  },
  "layout-table-parsing": {
    s: "Detects page structure such as columns, headings, lists, tables and figures, and extracts tables in a form that preserves rows, columns and headers.",
    d: "Layout models or rules find regions on a page and classify them. Tables are converted to a structured form such as rows of cells or markdown, keeping header associations and merged cells, and may be stored both as text for search and as structured data. Figures are captioned or linked. Without this, a table flattens into a stream of numbers whose meaning is lost. It is computationally heavy and imperfect, especially on borderless tables, rotated pages and complex financial layouts.",
    k: ["Model-based layout analysis vs rule-based: models handle varied layouts but are slower and occasionally wrong in odd ways; rules are fast and predictable, but break on unfamiliar formats.", "Flatten tables to text vs keep structured: flat text is easy to chunk and embed, but loses cell relationships; structured keeps meaning but needs special handling in chunking and prompts."],
    p: ["A table split across two pages becomes two unrelated fragments, the second lacking column headers.", "Merged header cells shift values into the wrong columns, so answers cite wrong numbers confidently."],
    v: "Parse ten complex tables with merged headers and spanned pages, and confirm cell-by-cell accuracy against ground truth; ask a question whose answer is one cell and confirm it is correct.",
    dep: ["text-extraction", "ocr-fallback", "structure-recovery"]
  },
  "ocr-fallback": {
    s: "Applies optical character recognition to scanned pages and images that have no text layer, and flags low-confidence text instead of passing it on silently.",
    d: "Pages with little or no extractable text are rendered to images and passed through text recognition, optionally with layout analysis and language hints. Each recognized word carries a confidence score; low-confidence regions can be sent to a stronger model or queued for review. Output is merged with any existing text layer. It is slow and costly at scale. The difficulty is quality: recognition errors in names, numbers and codes produce text that retrieval cannot match, and nothing in the text shows that it is wrong.",
    k: ["Run OCR on every page vs only on pages lacking text: always running catches pages with bad embedded text, but costs far more; fallback only is cheaper but trusts poor text layers.", "Fast general recognizer vs slower high-accuracy one: fast suits bulk volume, while accurate suits forms and identifiers; many systems escalate by confidence."],
    p: ["Digits misread in an invoice number make an exact-match lookup impossible without any visible error.", "Scans at low resolution or skew are recognized as gibberish that gets embedded and indexed."],
    v: "Run a set of scanned pages with known text and confirm character error rate is within target; confirm pages below the confidence threshold are flagged in the document's status rather than indexed unmarked.",
    dep: ["format-detection", "raw-object-store"]
  },
  "structure-recovery": {
    s: "Reconstructs the document's hierarchy of titles, sections, lists and cross-references from layout or markup, so chunks can follow real boundaries.",
    d: "From fonts, numbering, indentation, markup tags or the document's own outline, the step builds a tree: title, chapters, sections, paragraphs, list items. Each text unit receives a path such as 'Policy > Refunds > Exceptions'. The tree guides chunk boundaries, supplies contextual headers and enables expansion to parent sections at answer time. It is difficult for documents without explicit markup, such as PDFs from word processors, where heading levels must be inferred from visual cues.",
    k: ["Use the document's declared structure vs infer from appearance: declared structure is accurate where present, but is often missing or wrong; inference works on any file but can mislabel emphasis as headings.", "Full tree vs flat section labels: a tree supports parent expansion and precise paths, while flat labels are simpler and enough for many collections."],
    p: ["Bold paragraphs mistaken for headings fragment the tree and split sections at random places.", "Heading levels that skip or repeat make section paths misleading in citations."],
    v: "Parse documents with known outlines and confirm the extracted tree matches the real table of contents on a sample, and that chunks inherit the correct section path.",
    dep: ["layout-table-parsing", "text-extraction"]
  },
  "deduplication": {
    s: "Detects exact and near-duplicate documents and chunks across sources, keeping one canonical copy and linking the rest, so results are not filled with repeats.",
    d: "Exact duplicates are found by content hash; near duplicates by shingling and similarity hashing or embedding comparison. The system keeps a canonical document, records where copies exist, and merges their permissions so that access to any copy grants access to the canonical text only if allowed. It also catches boilerplate repeated across many documents. The difficulty is deciding what is duplicate: versions, translations and templated documents with a few changed values look identical but differ in meaning.",
    k: ["Collapse duplicates at ingestion vs at query time: ingestion saves index space and embedding cost, but loses per-copy context; query time keeps everything and costs more.", "Exact-hash only vs near-duplicate detection: exact is safe and cheap, while near-duplicate removes more redundancy but risks merging distinct versions."],
    p: ["Merging near-identical contracts that differ only in a figure leaves only one version retrievable.", "Dropping a copy together with its permissions hides the document from users who could only reach that copy."],
    v: "Ingest a file in three folders and a version with one number changed, and confirm the identical copies collapse to one canonical chunk set while the changed version stays separately retrievable.",
    dep: ["metadata-database", "chunk-store", "document-versioning"]
  },
  "language-detection": {
    s: "Identifies the language of each document and passage so the right tokenization, analyzers and models are used, including for mixed-language text.",
    d: "A detector scores short text spans against language profiles and returns labels with confidence. It runs at ingestion, per document or per passage, and on queries. Labels select the analyzer for lexical indexing, enable language-specific stop words and stemming, and guide the answer language. Short strings and code-mixed text are error-prone. The result is stored as chunk metadata for filtering. The difficulty is low confidence on very short or technical text, which should fall back to a neutral analyzer.",
    k: ["Per-document vs per-chunk detection: per-document is cheap and stable, but mislabels bilingual files; per-chunk is accurate, but noisy on short chunks.", "Hard language label vs a probability list: a single label is simple to act on, while probabilities allow fallback handling for uncertain cases."],
    p: ["A short query containing a product name is labeled in the wrong language and analyzed with the wrong rules.", "Technical text full of identifiers is misdetected, so stemming mangles the identifiers."],
    v: "Run a labeled multilingual sample including short, mixed and technical passages, and confirm detection accuracy per length bucket; confirm low-confidence items use the neutral analyzer.",
    dep: ["text-extraction"]
  },
  "fixed-size-chunking": {
    s: "Splits text into pieces of a set token or character length, optionally breaking at sentence boundaries, as the simplest and most predictable chunking method.",
    d: "The text is cut every N tokens, preferring to end at a sentence or paragraph break within a small tolerance. It requires no structure, runs on any text and gives uniform sizes that fit the embedding model's input and make batch costs predictable. Chunk size trades precision against context: small chunks match specific facts but lack surroundings; large ones carry context but dilute the embedding. Its weakness is blindness to meaning: a cut can separate a question from its answer or a list from its heading.",
    k: ["Small chunks vs large: small ones give precise matches and low prompt cost, but lose context; large ones keep context, but blur the vector and waste window space.", "Count in tokens vs characters: tokens match model limits exactly, while characters are simpler but misjudge size across languages."],
    p: ["Cuts through the middle of a table row or code block make both halves unusable.", "A chunk size tuned for one collection is reused on a different one without evaluation."],
    v: "Chunk a sample at three sizes and run the retrieval test set against each, then confirm the chosen size has the best recall at the prompt budget and no chunk exceeds the embedding model's limit.",
    dep: ["text-extraction", "retrieval-metrics"]
  },
  "structural-chunking": {
    s: "Splits documents at their natural boundaries, such as sections, headings, paragraphs, list items, slides, messages or code definitions, and keeps each unit whole.",
    d: "Using the recovered structure, chunks follow sections and paragraphs, merging very small neighbors and splitting oversized sections by sub-structure. Each chunk keeps its heading path. Different content types need different rules: a chat log by thread, a slide deck by slide, a table as its own unit, source code by function, a FAQ by question and answer. Boundaries match how authors organized ideas, so chunks tend to be self-contained. It depends on good structure recovery and produces variable chunk sizes.",
    k: ["Structure-aware boundaries vs uniform size: structural chunks are coherent but vary in size, complicating budgets; uniform chunks are predictable, but ignore meaning.", "Per-content-type chunkers vs one general method: specialized chunkers give better chunks, but need maintenance for each type."],
    p: ["A single enormous section with no sub-headings becomes one chunk too long to embed accurately.", "A one-line section heading becomes its own tiny chunk that matches queries and answers nothing."],
    v: "Chunk a sample of documents, and confirm no chunk crosses a section boundary, none exceeds the embedding limit, and tiny fragments are merged with a neighbor.",
    dep: ["structure-recovery", "layout-table-parsing"]
  },
  "semantic-chunking": {
    s: "Places boundaries where the meaning of the text shifts, found by comparing embeddings or similarity of adjacent sentences, so each chunk covers one topic.",
    d: "Text is split into sentences, each embedded, and the similarity between neighbors is tracked; a boundary is placed where similarity drops below a threshold or a topic model detects a change. Chunks are then bounded by minimum and maximum sizes. It suits unstructured text such as transcripts and long prose, where no headings exist. It costs an embedding pass per sentence at ingestion, and results depend on the threshold, which behaves differently across documents and rarely beats structural chunking where structure exists.",
    k: ["Semantic boundaries vs structural: semantic works on flat text without headings, but is costlier and less predictable; structural is cheap, and better when structure is real.", "Fixed similarity threshold vs adaptive per document: fixed is simple, but over-splits some documents and under-splits others; adaptive handles variation at the cost of complexity."],
    p: ["A noisy threshold creates chunks of a single sentence that lack enough context to be retrieved usefully.", "Embedding every sentence on a large archive multiplies ingestion cost for little retrieval gain."],
    v: "Chunk a meeting transcript with several known topic changes and confirm boundaries fall near them; compare retrieval recall against fixed-size chunking on the same questions.",
    dep: ["document-embedding-jobs", "fixed-size-chunking"]
  },
  "chunk-overlap": {
    s: "Repeats a few sentences from the end of one chunk at the start of the next, so facts spanning a boundary appear whole in at least one chunk.",
    d: "An overlap of ten to twenty percent is typical. It protects against boundary cuts that split a statement from its context, at the cost of larger indexes, more embedding work and duplicate passages in results that later stages must collapse. Overlap helps most with fixed-size chunking and little with structural chunking, where boundaries already fall at meaning breaks. It must be tracked in offsets so that merging adjacent hits and building citations does not repeat text.",
    k: ["Larger overlap vs smaller: larger protects boundary-spanning facts, but inflates index size, embedding cost and near-duplicate results.", "Overlap vs expanding neighbors at query time: overlap needs no extra fetch, but is fixed at build time; expansion is flexible, but adds retrieval work."],
    p: ["Heavy overlap fills the top results with near-identical chunks, wasting the context window.", "Offsets that ignore the overlap produce citations whose highlighted text repeats."],
    v: "Place a two-sentence fact across a chunk boundary and confirm at least one chunk contains it whole and is retrievable; confirm duplicate-heavy results are collapsed before the prompt.",
    dep: ["fixed-size-chunking", "passage-dedup-selection"]
  },
  "parent-child-chunks": {
    s: "Indexes small child chunks for precise matching but returns their larger parent sections to the model, combining retrieval precision with enough surrounding context.",
    d: "Documents are split into large parents, such as sections, and each parent into small children, such as paragraphs or sentences. Only children are embedded and indexed; each stores a link to its parent. A match on a child brings back the parent text, deduplicated when several children of the same parent match. The design fixes the weakness of small chunks at generation time. It needs a store holding both levels, and returning parents costs more window space per hit.",
    k: ["Return the parent vs the child plus neighbors: parent return is simple and coherent, but cannot adapt in size; neighbor expansion is adjustable, but needs positional metadata.", "Two levels vs multiple levels: two is simple, while more levels fit very long documents at higher complexity."],
    p: ["A parent that is a whole long chapter is returned for any small match and fills the window.", "Updating a parent without regenerating its children leaves the index matching on text no longer present."],
    v: "Query for a fact in one sentence of a long section and confirm the matching child is found, the whole section is supplied to the model once, and the citation points to the child's location.",
    dep: ["structural-chunking", "chunk-store", "neighbor-expansion"]
  },
  "contextual-headers": {
    s: "Prefixes each chunk with context such as document title, section path and a short generated situating sentence before embedding, so isolated chunks keep their meaning.",
    d: "A chunk reading 'The limit is 50 per day' says nothing about what it limits. Adding 'Refund Policy > Chargebacks' or a model-written sentence situating the chunk in its document gives the embedding and the lexical index the missing subject. The header is added to the indexed text, and often shown to the model too. It substantially improves retrieval for context-dependent chunks. The cost is a model call per chunk for generated context and larger chunks, and headers can bias matches toward the title rather than the content.",
    k: ["Cheap structural headers vs model-generated context: structural headers cost nothing and are consistent, while generated context captures meaning beyond the title but adds cost and variability.", "Embed header with the text vs store separately: embedding it improves matching, but dilutes the content vector; separate fields allow weighting."],
    p: ["A generated context sentence that hallucinates details becomes indexed text that is retrieved and presented as source content.", "Long titles dominate short chunks and make every chunk of a document match the same queries."],
    v: "Compare recall on context-dependent questions with and without headers, and confirm it improves; read fifty generated context sentences against their documents and confirm none states unsupported facts.",
    dep: ["structure-recovery", "model-serving-gateway", "chunk-store"]
  },
  "synthetic-questions-summaries": {
    s: "Generates likely questions and short summaries for each chunk with a model and indexes them, bridging the gap between how users ask and how documents are written.",
    d: "For each chunk, a model writes several questions it answers and a one-line summary. These are embedded and indexed pointing back to the chunk, so a user's question matches a stored question closely. Summaries serve broad queries. It improves recall on question-like searches and on terse or technical chunks. It costs model calls for every chunk, expands the index several times over, and risks generated questions that the chunk does not truly answer, creating false matches.",
    k: ["Index generated questions vs the chunk text only: questions match user phrasing better, but multiply index size and ingestion cost.", "Generate at ingestion vs on demand for popular chunks: ingestion is uniform, while on demand targets cost to chunks that matter, but adds a lag."],
    p: ["Generated questions the chunk does not actually answer pull in the chunk for off-topic queries.", "Regenerating questions on every minor edit costs more than the retrieval gain justifies."],
    v: "Sample a hundred chunks and have a reviewer confirm each generated question is answered by its chunk; measure recall on a question-style test set with and without the generated entries.",
    dep: ["chunk-store", "model-serving-gateway", "vector-index"]
  },
  "metadata-enrichment": {
    s: "Attaches useful fields to each chunk, such as source, type, dates, owner, product, version and extracted entities, which later power filtering, ranking and citation.",
    d: "Fields come from the source system, from file properties, and from extraction by rules or models: document type, effective dates, jurisdiction, product names, authors, status such as draft or approved. Values are normalized to controlled vocabularies. The fields drive filters, freshness ranking, conflict resolution and the labels shown in citations. The difficulty is quality and consistency: inferred fields are sometimes wrong, and a typo in a value splits a category and silently hides documents from filters.",
    k: ["Extract with a model vs rules and source fields: models infer missing fields from content, but vary and cost money; source fields are reliable but incomplete.", "Controlled vocabulary vs free text: controlled values filter reliably, but need maintenance when new categories arise."],
    p: ["Wrong effective dates inferred from file modification time make old policies look current.", "Free-text tags with many spellings make filters match only a fraction of the documents."],
    v: "Check a random sample of two hundred chunks' fields against the source documents and confirm accuracy per field meets target; confirm a filter on each key field returns all and only matching documents.",
    dep: ["structure-recovery", "attribute-index", "metadata-database"]
  },
});
