// Details for the full-text search index plate, part 3: index structures and vectors.
ATLAS.details("search-index", {
  "term-dictionary": {
    s: "The sorted list of every distinct term in a field of a segment, each with its document frequency and a pointer to its postings.",
    d: "Terms are stored in byte order, grouped into blocks of a few dozen entries. Within a block, shared prefixes are stored once, and each entry holds statistics and file offsets for its postings and positions. A lookup first uses the in-memory term index to find the right block, then scans inside it, reading one disk block. Sorted order makes range, prefix and automaton queries possible. The difficulty is size and cache behavior: fields with huge numbers of unique terms, such as ids, make the dictionary large and lookups touch cold disk pages.",
    k: ["Block-based prefix-compressed terms vs. a plain sorted array: blocks save much space and need one disk read per lookup, but require a scan within the block.", "Indexing unique identifiers as terms vs. only storing them: indexing gives fast exact lookup, but adds one dictionary entry per document."],
    p: ["A field holding free-form unique values, such as raw log lines, creates a dictionary as large as the data.", "Dictionary lookups on a cold page cache cause disk reads that dominate query latency."],
    v: "Look up a term that exists and one that does not, in a segment with a million terms. Confirm that the dictionary returns the frequency and postings offset for the first, nothing for the second, and reads at most one block.",
    dep: ["fst-term-index", "immutable-segments"]
  },
  "fst-term-index": {
    s: "A compact finite-state transducer, kept in memory, that maps each term prefix to the dictionary block containing it, and supports automaton intersection.",
    d: "The transducer shares both prefixes and suffixes of the indexed block-start terms, so it is far smaller than a trie and often fits entirely in memory or the page cache. Given a term, it walks the states and outputs the file offset of the block where the term would be. Because it is an automaton, fuzzy, wildcard and regular expression queries can be intersected with it directly, skipping unmatched branches. It is built in one pass from sorted input and is immutable. The difficulty is memory: it scales with the number of blocks, so very high-cardinality fields still make it large.",
    k: ["A transducer over block starts vs. over every term: indexing only block starts keeps memory small, but each lookup needs an in-block scan; indexing every term is faster per lookup and much larger.", "In-heap vs. memory-mapped term index: heap makes access predictable, but competes with other data; mapping lets the operating system decide what stays resident."],
    p: ["Huge unique-valued fields make the term index too large to stay in memory, and every query pays for disk reads.", "Building it requires sorted input, so out-of-order bulk terms must be sorted first."],
    v: "Run a fuzzy and a prefix query against a segment and read the profile. Confirm the number of dictionary blocks visited is a small fraction of the total, and that term lookups perform no disk read when the index is resident.",
    dep: ["term-dictionary"]
  },
  "postings-lists": {
    s: "For each term, the ascending list of document numbers containing it, together with term frequencies, which is the data intersected during search.",
    d: "Each list stores document numbers as differences from the previous one, which are small and compress well, plus the frequency of the term in each document. Lists are divided into blocks of fixed size, with a separate tail for the remainder, so that readers can decode one block at a time. Documents are numbered inside a segment from zero in arrival order. Optional data for each entry is positions, offsets and payloads. Lists of rare terms are tiny, and those of common terms have millions of entries, which is why skipping matters. The difficulty is merge time: renumbering documents rewrites all lists.",
    k: ["Delta-encoded document numbers vs. absolute ones: deltas compress well and decode fast, but a reader must decode from a block start rather than seek to any position.", "Storing frequencies with every posting vs. only presence: frequencies enable scoring, but cost space; presence-only fields suit filters and identifiers."],
    p: ["Indexing a boolean-like field with frequencies stores extra data that no query ever uses.", "Very common terms produce enormous lists that slow a query unless they are skipped over."],
    v: "Index documents containing a known term and decode its postings. Confirm document numbers ascend, frequencies match the counts in the source, and the entry count equals the term's document frequency.",
    dep: ["term-dictionary", "postings-compression", "skip-lists"]
  },
  "positions": {
    s: "The ordered word offsets of each term within each document, stored beside the postings so phrase and proximity queries can check adjacency.",
    d: "For every posting, if the field is indexed with positions, a list of token positions is stored in a separate file, again delta-encoded and packed in blocks. Positions are token counts from the start of the field, not characters, and gaps can be inserted between values of a multi-valued field to prevent phrases spanning values. They are read only for documents surviving the intersection. They typically make up a large share of index size on text fields. The difficulty is the size and the tie to analysis: stop-word removal and synonyms change which positions exist.",
    k: ["Indexing positions vs. frequencies only: positions enable phrase, proximity and some highlighting, but can double the postings size; frequencies suffice for plain keyword matching.", "A position gap between multi-valued entries vs. none: a gap stops phrases from matching across separate values, but needs the right gap configured."],
    p: ["Phrase queries over a multi-valued field match across two unrelated values when no position gap is set.", "Positions indexed on fields never used in phrase queries waste a large share of disk."],
    v: "Index a field with two values and query a phrase made of the last word of the first and the first word of the second. Confirm it does not match with a gap configured, and a phrase inside one value does.",
    dep: ["postings-lists", "analyzer-chain"]
  },
  "offsets": {
    s: "The character start and end positions of each term occurrence, optionally indexed in postings or term vectors, which let highlighting skip re-analysis.",
    d: "Offsets are byte or character indexes into the original field text, written next to positions when the field is mapped to record them. A highlighter then finds exactly where each matching term was without re-tokenizing the text. Payloads are separate, arbitrary bytes attached to a term occurrence, used for custom scoring such as per-term weights or part of speech tags. Both are optional and increase index size. The difficulty is correctness through analysis: filters that change text or position must preserve offsets for them to be useful.",
    k: ["Offsets in postings vs. re-analysis at highlight time: offsets make highlighting fast for long fields, but add index size; re-analysis costs nothing in the index and CPU per hit.", "Payloads for per-occurrence weights vs. separate fields: payloads keep weights next to the term for fast scoring, but need custom scoring code and are not widely supported."],
    p: ["Offsets recorded from an analysis chain that rewrites text point into the wrong place in the source.", "Enabling offsets on every text field increases index size for fields that are never highlighted."],
    v: "Index a sentence with offsets enabled and fetch the highlight for one word. Confirm the marked span's start and end match the character positions in the original text, with no re-analysis in the profile.",
    dep: ["postings-lists", "positions"]
  },
  "postings-compression": {
    s: "Packs the document-number deltas and frequencies of each block with a fixed number of bits per value, or a run-length form for dense lists, to cut size and decode fast.",
    d: "Within a block of, typically, one hundred and twenty-eight values, the encoder finds the largest value and uses just enough bits for all of them, so the block is a bit-packed array that decodes with vectorized instructions at very high speed. Values that do not fit, such as the odd large gap, go in a small exception area. Dense lists, where most documents match, switch to bitsets or run-length ranges. The tail shorter than a block uses variable-length bytes. The difficulty is a balance between decode speed, which sets query latency, and compression ratio.",
    k: ["Bit-packing in fixed blocks vs. variable-byte encoding: block packing decodes faster and compresses uniform data well, but wastes bits in blocks with outliers; variable-byte is flexible and slower.", "Bitsets for dense lists vs. always lists: bitsets make dense intersections trivial, but are wasteful for sparse ones, so the threshold must be tuned."],
    p: ["A few huge gaps inside a block inflate the bit width for all values unless exceptions are handled.", "Compression choices that favor size over decode speed make hot common-term queries CPU bound."],
    v: "Compress a postings list of one million entries and compare the size with the raw integers. Confirm the compressed size is a fraction of raw, decoding reproduces the exact values, and decode throughput meets the target.",
    dep: ["postings-lists", "skip-lists"]
  },
  "skip-lists": {
    s: "Multi-level pointers inside long postings lists that let an iterator jump forward to a target document without decoding every entry between.",
    d: "A skip structure stores, for every block of postings, the last document number in it and the file offset, with higher levels pointing every few blocks. An advance-to-target operation climbs the levels to find the right block, then decodes just that block. They also hold, per block, the maximum score impact used for early termination. Skip data is built when the segment is written and costs a small amount of extra space. The difficulty is interplay: skipping pays only when one clause is much sparser than the others.",
    k: ["Skip pointers per block vs. none: skipping makes selective conjunctions cheap, but adds a little index size and needs a level structure maintained at write time.", "Storing score bounds in skip data vs. computing them: stored bounds enable pruning with no extra decoding, but couple the format to a scoring model."],
    p: ["Skip data is of no use on short lists, so tiny segments gain nothing and carry the overhead.", "Changing the similarity formula requires bounds to be recomputed, which means reindexing."],
    v: "Intersect a term with a million entries and a term with a hundred. Confirm that the long list's decoded block count in the profile is near one hundred, not thousands, and the result equals a full scan.",
    dep: ["postings-lists", "postings-compression"]
  },
  "term-vectors": {
    s: "A per-document store of that document's own terms with frequencies, positions and offsets, enabling fast highlighting and similarity queries between documents.",
    d: "While the inverted index maps terms to documents, a term vector maps one document to its terms, written when a field is mapped to store them. It can include frequencies, positions and offsets. Highlighters read the vector to locate matches precisely, and more-like-this queries pick the most informative terms of a source document from it. It is stored with the per-document data and compressed in chunks. The difficulty is cost: it duplicates positional information already in the inverted index and adds substantial size, so it is used on few fields.",
    k: ["Stored term vectors vs. computing terms on demand: stored vectors make highlighting and similarity fast, but duplicate index data; on-demand analysis costs CPU per request.", "Full vectors with offsets and positions vs. frequencies only: full ones support highlighting, but cost much more space than frequencies alone."],
    p: ["Enabling full term vectors on all large text fields roughly doubles their storage.", "Using stale vectors after changing the analyzer gives terms that no longer match query-time analysis."],
    v: "Fetch the term vector of one indexed document. Confirm the listed terms, frequencies and positions match the analyzed text, and that a highlight using the vector marks the same spans as one built by re-analysis.",
    dep: ["positions", "offsets", "stored-fields"]
  },
  "stored-fields": {
    s: "The row-oriented per-document store of original field values, read after ranking to return the actual content of the few documents on a result page.",
    d: "Each document's stored values are written together, in document-number order, in a data file with an index file for direct lookup by document number. A fetch reads one document's chunk, decompresses it and extracts the requested fields. Because access is by document, not by field or term, it is slow for scanning and quick for retrieving a handful. Only fields marked stored, or the entire source, are kept. The difficulty is placement in the request: reading stored fields for thousands of candidates, instead of only the final page, dominates latency.",
    k: ["Stored fields vs. the source document: individually stored fields allow cheap retrieval of a few, but need configuration per field; the source keeps everything in one blob.", "Fetching fields from stored data vs. from doc values: doc values read one field across many documents quickly, whereas stored fields read many fields of one document."],
    p: ["Fetching all fields for a large result window loads and decompresses the full documents without need.", "Marking every field stored multiplies disk size without a retrieval need."],
    v: "Request ten documents with two stored fields and then ten thousand. Confirm the fetch time scales with the number of documents decompressed, and the page of ten does not touch any other document chunk.",
    dep: ["stored-fields-compression", "immutable-segments"]
  },
  "source-document": {
    s: "The original submitted document, stored whole and returned with hits, which also serves as the base for updates, reindexing and highlighting.",
    d: "On ingest the engine keeps the exact JSON as sent, compressed, in the stored-field area as one special field. Search results return it by default, partial updates read it, merge changes and index the result, and reindex operations replay it. It is not used for searching. Excluding or trimming it saves much disk, but disables updates, reindexing and some highlighting. Synthetic variants rebuild source from doc values at fetch time. The difficulty is that source is both the convenience and the largest part of storage.",
    k: ["Storing source vs. rebuilding it from doc values: stored source is exact and simple, but typically the largest part of the index; reconstruction saves space but loses exact formatting and ordering.", "Excluding large fields from source vs. keeping all: excluding saves space for blobs, but those fields cannot be returned, updated or reindexed."],
    p: ["Disabling source to save disk later blocks reindexing, forcing a rebuild from the original system.", "Storing large attachments in the source makes every fetch decompress them."],
    v: "Index a document and fetch it by id. Confirm the returned source matches the original exactly, a partial update changes one field and keeps the rest, and the stored size fits the capacity estimate.",
    dep: ["stored-fields", "document-model", "updates-and-versioning"]
  },
  "stored-fields-compression": {
    s: "Groups documents into chunks that are compressed together, trading some fetch speed for a large reduction in the size of stored data.",
    d: "Documents accumulate in a buffer until a size or count threshold. The chunk is then compressed as one unit, with the dictionary of repeated strings built across documents, which compresses far better than per-document compression. A small in-memory index maps document number to chunk. A fetch decompresses the whole chunk to read one document. Two profiles exist: a fast one with light compression and a high-ratio one for storage-heavy archives. The difficulty is chunk size: larger chunks compress better and make single-document reads slower.",
    k: ["Large compressed chunks vs. small ones: large chunks give high ratios, but a fetch decompresses neighbors it does not need; small chunks fetch faster and compress worse.", "High-ratio profile vs. fast profile: the high-ratio one saves disk for logs and archives, but costs CPU on every fetch and merge."],
    p: ["Random fetches across a large high-ratio index decompress many chunks and make result pages slow.", "Switching profiles needs a force merge or reindex to affect old segments."],
    v: "Index a thousand similar documents with both profiles. Confirm the high-ratio one is measurably smaller, single-document fetch is slower, and results are byte-identical.",
    dep: ["stored-fields", "merge-policy"]
  },
  "doc-values": {
    s: "A column-oriented, on-disk store of one field's value per document, used for sorting, aggregations and scripts, because it reads many documents of one field efficiently.",
    d: "At index time each field with doc values writes a dense array of values by document number: fixed-width for numbers, sorted dictionary ordinals for keywords, and sets for multi-valued fields. Readers memory-map them and access by document, which makes sorting and aggregating a matching set a sequential scan over one column. Numeric columns use bit packing and table encoding. The structure is the inverse of the inverted index and cannot be searched by value. The difficulty is that the choice is per field at mapping time, and text fields have none.",
    k: ["Doc values on disk vs. loading values into heap at query time: on disk uses the page cache and survives restarts without a warm-up, but needs index-time cost; heap loading is flexible and risks memory exhaustion.", "Enabling doc values by default vs. only when needed: defaults make sorting and facets always work, but add size for fields only searched."],
    p: ["A field mapped without doc values cannot be sorted or aggregated, and the error shows up only in production.", "Multi-valued fields are exposed as sets, so sorting by them picks min or max implicitly."],
    v: "Sort and aggregate on a keyword field and a numeric field after a restart. Confirm both work with no heap growth, the first request after restart pays only page-cache misses, and values match the source.",
    dep: ["immutable-segments", "mmap-and-page-cache"]
  },
  "norms": {
    s: "A one-byte-per-document-per-field encoding of the field's length, read during scoring so shorter fields get a higher weight for the same term match.",
    d: "At index time the number of tokens in each text field of each document is encoded into a single byte on a coarse scale and stored in a dense array by document number. During scoring, the length is decoded and the formula's normalization uses it with the average field length. Fields not used for scoring, such as identifiers and filters, can drop norms to save space. Norms are loaded through the page cache, not heap. The difficulty is loss: the byte has coarse precision, so small length differences vanish.",
    k: ["Keeping norms vs. disabling: keeping them lets short titles outrank long bodies, but costs a byte per document per field; disabling saves space and removes length normalization.", "Coarse one-byte encoding vs. exact lengths: one byte is compact and quick to read, but close lengths score alike."],
    p: ["Norms left enabled on thousands of sparse fields cost one byte per document in each segment.", "Disabling norms on a field later used for ranked search leaves it unable to prefer concise matches."],
    v: "Index two documents with the same term in a short and a long field. Confirm explain shows different normalization values, the short field scores higher, and the norms file size equals documents times one byte.",
    dep: ["bm25-scoring", "immutable-segments"]
  },
  "point-trees": {
    s: "A block k-d tree over one or more numeric dimensions, indexing numbers, dates, IP addresses and coordinates so range and spatial queries visit few documents.",
    d: "Values for a field are sorted and recursively split across dimensions into leaf blocks of a few hundred points, with each internal node recording its bounding range. A query descends only into nodes that overlap its range, and includes whole subtrees fully inside without checking points. It is written when the segment is flushed and is immutable. Merging rebuilds it from the sources. For one dimension it behaves as a sorted-range index. The difficulty is multi-dimensional skew and write cost: the build is a sort and costs time at flush and merge.",
    k: ["Tree over raw values vs. numeric terms with prefixes: trees give fast ranges with a compact size and multiple dimensions, but cannot score; prefix terms reuse postings machinery, but are bigger.", "More dimensions per field vs. separate fields: joint dimensions answer spatial boxes in one pass, but become less selective beyond a few dimensions."],
    p: ["Heavy ingest of values with a wide spread makes tree construction a visible cost at each refresh.", "A range filter on a field mapped without points falls back to scanning and is slow."],
    v: "Run a range query that covers one percent of values on ten million documents. Confirm the profile shows the visited leaf blocks are a small fraction of the total and matches equal a brute-force count.",
    dep: ["immutable-segments", "range-query", "geo-queries"]
  },
  "index-sorting": {
    s: "Keeps the documents inside each segment ordered by chosen fields, so queries sorting on those fields can stop early and related documents compress together.",
    d: "At flush and merge, documents are renumbered in the order of the configured sort keys, and all structures are written in that order. A query sorted by the same key can stop collecting after the first k matches in each segment, since later ones cannot rank higher. Ordering by a low-cardinality field also groups similar documents, improving compression and filter speed. Writing costs more because segments must be sorted at flush. The difficulty is rigidity: the order is fixed at index creation, helps only matching sorts, and disables some early termination by score.",
    k: ["Pre-sorted segments vs. sorting at query time: pre-sorting makes sorted queries nearly free, but slows indexing and fits only one order; query-time sorting is flexible and scans more.", "Sort by a time or key field vs. a grouping field: sorting by time speeds range queries and recent-first reads, whereas a grouping field improves compression for filters."],
    p: ["Configuring a sort that matches no real query adds indexing cost with no benefit.", "The sort order cannot be changed in place, so a wrong choice means reindexing."],
    v: "Create an index sorted by timestamp and query newest ten. Confirm the profile shows collection stopping after a few documents per segment, results equal an unsorted index, and flush time increase is within budget.",
    dep: ["sorting", "immutable-segments", "doc-values"]
  },
  "vector-fields": {
    s: "A field type holding a fixed-length array of numbers per document, the embedding, indexed for similarity search with a chosen distance function.",
    d: "The mapping declares the dimension count, element type and similarity function: cosine, dot product or Euclidean distance. Vectors are written to a raw data file in document order and, for approximate search, into a graph. Documents without a vector are skipped. The raw vectors are kept for reranking and exact computation even when the graph uses compressed forms. The difficulty is size: a vector of hundreds of floats per document is often larger than the text it represents, and dimension and similarity cannot be changed later.",
    k: ["Higher dimensions vs. lower: higher-dimensional embeddings capture more nuance, but cost memory and time per comparison linearly; lower dimensions are cheaper and lose recall.", "Normalizing vectors at ingest vs. at query time: normalizing once makes dot product equal cosine and saves compute, but requires every client to do so."],
    p: ["Using a similarity function different from the one the embedding model was trained for degrades results.", "Mixing embeddings from two models in one field returns meaningless neighbors."],
    v: "Index vectors produced by one model and query with a known pair of similar and dissimilar texts. Confirm the similar one ranks first with a higher similarity, and indexing a wrong-dimension vector is rejected.",
    dep: ["field-mappings", "hnsw-graph"]
  },
  "embedding-generation": {
    s: "Produces the vectors for documents and queries with a learned model, run at ingest or query time, and keeps the two sides on the same model and version.",
    d: "A model maps text, or other content, to a vector so that similar meaning gives nearby points. Documents are embedded at ingest, often split into passages to fit the model's input length, with each passage indexed as its own vector. The query is embedded at search time by the same model. Hosting may be in an ingest pipeline inside the cluster or in an external service. The difficulty is operational: model changes require re-embedding the whole corpus, and embedding calls add latency and cost to both indexing and queries.",
    k: ["Embedding at ingest inside the engine vs. in the application: in-engine is convenient and keeps versions aligned, but loads inference onto search nodes; application-side isolates cost and spreads versioning.", "Chunking documents into passages vs. one vector per document: passages retrieve precisely and multiply vectors, whereas one vector blurs long documents."],
    p: ["Upgrading the embedding model for queries but not documents makes the two live in different spaces.", "Truncating long texts to the model's limit silently drops everything after the cutoff."],
    v: "Embed a document and a paraphrase of it with the deployed model version. Confirm the stored version identifier matches the query-time version, the paraphrase is a top neighbor, and an unrelated text is not.",
    dep: ["vector-fields", "ingest-api"]
  },
  "hnsw-graph": {
    s: "A layered proximity graph where each vector links to nearby vectors, searched greedily from a coarse top layer down, giving approximate nearest neighbors in logarithmic-like time.",
    d: "Each vector is inserted at a random top level and connected to a limited number of close neighbors on each level it occupies. Search starts at an entry point on the sparsest layer, walks greedily toward the query, and descends layer by layer, keeping a candidate queue of configurable width at the bottom. Width trades recall for time. The graph is built per segment, so a query searches each segment's graph and merges. Building is slow, and merging segments rebuilds or extends graphs. The difficulty is memory: the graph and the vectors want to stay in memory.",
    k: ["More neighbors per node and wider search vs. fewer: more links and a wider beam raise recall, but make build, memory and query time larger.", "One graph per segment vs. a global graph: per-segment graphs keep segments immutable and independent, but queries search several graphs and merging costs time."],
    p: ["A graph larger than available memory pages from disk and query latency becomes unpredictable.", "Many small segments mean many small graphs searched per query, with poor recall per unit time."],
    v: "Compare graph results with an exact scan on a sample of queries over a million vectors. Confirm recall at the configured width meets the target, such as ninety-five percent, and latency is a small fraction of the scan.",
    dep: ["vector-fields", "immutable-segments", "mmap-and-page-cache"]
  },
  "vector-quantization": {
    s: "Stores vectors in a lower-precision form, such as bytes or single bits per dimension, to cut memory several times at a small loss of recall.",
    d: "Each float component is mapped to a smaller integer using scale factors learned from the data, or reduced to its sign, shrinking vectors four to thirty-two times. The graph search compares the compressed forms, which also speeds distance calculations, and a final rescoring step re-reads the full-precision vectors for the best candidates. Product quantization instead splits vectors into sub-vectors and stores codebook indexes. The original vectors are kept on disk. The difficulty is the recall cost, which varies by model and data, and the need to oversample then rescore.",
    k: ["Aggressive quantization with rescoring vs. full precision: compression makes large collections fit in memory, but requires oversampling and a rescoring pass, and loses recall on some models.", "Scalar quantization vs. product quantization: scalar is simple and predictable, but saves less; product quantization compresses more and needs training and codebooks."],
    p: ["Skipping the rescoring step makes quantization noise visible as wrong order in the top results.", "Quantization ranges learned from early data drift as the distribution changes."],
    v: "Measure recall and memory of the index with full precision and with quantization plus rescoring on the same queries. Confirm memory drops by the expected factor and recall stays within the agreed tolerance.",
    dep: ["hnsw-graph", "vector-fields"]
  },
  "filtered-vector-search": {
    s: "Combines a nearest-neighbor search with metadata conditions so that only vectors from documents matching a filter are returned, without losing result count.",
    d: "Applying the filter after the graph search can leave fewer than k results. Instead, the filter is evaluated first as a bitset, and the graph traversal only accepts matching vectors while still using non-matching ones to navigate. When the filter is very selective, matching documents are few and the engine switches to an exact scan of just those. The approach is chosen from cost estimates at query time. The difficulty is the middle range, where selectivity makes both the graph walk and the scan slow, and recall drops.",
    k: ["Filtering during traversal vs. after: during traversal returns a full k with correct matches, but visits more nodes; post-filtering is cheap and returns too few results for selective filters.", "Switching to exact scan below a threshold vs. always the graph: scan is exact and fast for tiny filtered sets, but needs an accurate cardinality estimate."],
    p: ["Post-filtering a top-k list returns only a handful of results when the filter is restrictive.", "A mis-estimated filter cardinality picks the slow strategy and latency spikes for some tenants."],
    v: "Run a vector query with filters matching ninety, one and one hundredth percent of documents. Confirm each returns k results that satisfy the filter and the one-percent case switches to exact scanning in the profile.",
    dep: ["hnsw-graph", "exact-scan-fallback", "filter-context"]
  },
  "exact-scan-fallback": {
    s: "A brute-force distance computation over all candidate vectors, used when the candidate set is small, for ground-truth evaluation, or when exact results are required.",
    d: "Every candidate vector is compared with the query using the configured similarity and the best k are kept. The candidate set is the whole segment or just a filter's matches. It is exact and has no build cost, and the work is proportional to candidates times dimensions, so it is fast for thousands and slow for millions. It also gives the baseline for measuring the approximate graph's recall. Script-based scoring uses the same path. The difficulty is knowing when it wins, because the crossover with the graph depends on hardware and data.",
    k: ["Exact scan vs. graph search: exact scan guarantees perfect recall and needs no graph, but its cost grows linearly with candidates; the graph scales and may miss true neighbors.", "Scanning with SIMD over raw vectors vs. over quantized ones: raw is exact and memory hungry, but quantized is faster and approximate."],
    p: ["Using the scan on a full large index for every request makes latency proportional to corpus size.", "Treating graph results as exact without ever comparing them to a scan hides recall loss."],
    v: "Compute the exact top ten for a thousand sample queries and compare them with graph results. Confirm the scan returns the true top ten, and report measured recall and time for each method.",
    dep: ["vector-fields", "doc-values"]
  },
  "hybrid-scoring": {
    s: "Combines a lexical score and a vector similarity score into one ranking, so documents that match by keywords and by meaning rise above those that match one way.",
    d: "A request carries a text query and a vector query. Each retrieves candidates, and the two scores are combined, usually as a weighted sum after normalizing each onto a comparable scale, or by treating the vector query as one more should clause in a boolean query. Weights express how much meaning matters versus exact words. Text scores are unbounded while similarities are bounded, so normalization is the hard part. The difficulty is that weights tuned on one query set do not transfer, and the lexical side still catches the exact names and codes that vectors miss.",
    k: ["Weighted score combination vs. rank-based fusion: weighted sums use score magnitude and need careful normalization; rank fusion ignores magnitudes and is robust, but discards confidence.", "Lexical first stage then vector rerank vs. both in parallel: sequential is cheaper, but limits recall to lexical candidates; parallel retrieval finds more and costs both."],
    p: ["Adding unnormalized scores lets BM25's larger range swamp the similarity every time.", "Weights tuned on natural-language questions hurt exact code or name queries."],
    v: "Evaluate lexical only, vector only and hybrid on a judged query set containing both natural-language and exact-name queries. Confirm hybrid is at least as good as the better single method on each class.",
    dep: ["bm25-scoring", "hnsw-graph", "rank-fusion"]
  },
  "rank-fusion": {
    s: "Merges several ranked lists by each document's position in them, with a reciprocal-rank formula, avoiding any need to make their scores comparable.",
    d: "Each retriever, lexical, vector or others, returns its own ranking. A document's fused score is the sum over lists of one divided by a constant plus its rank in that list, so documents appearing high in several lists rise to the top. Because only ranks matter, no normalization of incompatible scores is needed, and adding another retriever is trivial. It is applied at the coordinator on each list's candidate window. The difficulty is that discarding scores throws away confidence, and a small window drops documents that a deeper list would have placed well.",
    k: ["Rank fusion vs. tuned weighted scores: rank fusion works out of the box across any retrievers, but cannot express that one score is very confident; weighted sums can, at the cost of tuning.", "Large candidate windows vs. small: larger windows fuse more accurately, but cost more on each retriever and at the merge."],
    p: ["A window smaller than the page depth causes documents to vanish from deeper pages after fusion.", "Fusing a strong and a weak retriever equally drags down results below the strong one alone."],
    v: "Fuse two ranked lists with overlapping and unique documents. Confirm documents in both lists outrank those in one, the fused order matches a hand calculation, and the result is stable under score rescaling.",
    dep: ["hybrid-scoring", "top-k-collection", "scatter-gather"]
  },
  "immutable-segments": {
    s: "The unit of the index on disk: a complete, self-contained, write-once set of files covering a batch of documents, never modified after it is written.",
    d: "A segment holds its own term dictionary, postings, doc values, norms, stored fields, point trees and vector graphs, numbered from document zero within itself. Once written it is never changed, except that a separate small file marks deleted documents. Searches run over all segments and combine results. Immutability makes caching, concurrent reads and backups simple, since there are no locks on data. The cost is that updates and deletes are indirect and many small segments slow queries until merged. The difficulty is keeping the segment count in a healthy range.",
    k: ["Write-once segments vs. in-place updates: immutability gives lock-free reads, simple caching and cheap snapshots, but updates become deletes plus inserts and need merging to reclaim space.", "Few large segments vs. many small ones: few large segments search faster and cache better, but merging costs I/O; many small ones are cheap to write and slow to query."],
    p: ["Hundreds of tiny segments from a very short refresh interval slow every query and consume file handles.", "Assuming a segment can be edited in place leads to designs that fight the format."],
    v: "Index in several batches and list the segment files. Confirm each batch produced a new set of files, existing files are unchanged by later writes, and a search returns documents from every segment.",
    dep: ["indexing-buffer", "live-docs-bitset", "directory-abstraction"]
  },
  "indexing-buffer": {
    s: "The in-memory structure where newly indexed documents accumulate, analyzed and organized, until a refresh or flush writes them out as a new segment.",
    d: "Each indexing thread owns a writer holding a partial in-memory index: terms with in-progress postings, doc values and stored fields. Documents are searchable only after the buffer is turned into a segment. A total memory budget triggers a flush of the largest writer when exceeded. Document-level concurrency lets many threads index at once with little locking. The difficulty is memory: the buffer is limited by a heap budget shared across all shards on the node, so many active shards each get small buffers and create many small segments.",
    k: ["Larger buffers vs. smaller: larger buffers make fewer, bigger segments and faster indexing, but use more memory and lose more unflushed data on a crash, which the log must cover.", "Per-thread writers vs. one shared writer: per-thread writers allow parallel indexing without locking, but produce several segments per flush."],
    p: ["Hundreds of actively written shards on one node each get a tiny buffer and flush constantly.", "Memory pressure from the buffer competes with caches and aggregations on the same heap."],
    v: "Index at a steady rate and watch the memory counter and flush events. Confirm memory rises to the budget, a flush writes a segment of roughly that size, and searches do not see documents before refresh.",
    dep: ["analyzer-chain", "near-real-time-refresh", "flush-and-commit"]
  },
  "near-real-time-refresh": {
    s: "Periodically writes the buffer into a new searchable segment without a full durable commit, so new documents become visible within about a second.",
    d: "A refresh turns the in-memory buffer into a new segment, opens a new reader that includes it, and swaps it in for searches. It does not need fsync, because durability comes from the transaction log, so it is cheap. The default interval is one second, and it can be lengthened for bulk loads or disabled. A refresh makes recent writes visible, while a flush makes them durable and truncates the log. The difficulty is the trade-off: frequent refreshes create many small segments and invalidate caches.",
    k: ["Short refresh interval vs. long: short gives fresh results, but produces many small segments and clears caches; long saves work and delays visibility.", "Refresh on every write vs. periodic: per-write refresh gives read-your-writes, but costs heavily; periodic needs callers to wait or tolerate delay."],
    p: ["Tests that search immediately after indexing fail intermittently because the refresh has not happened.", "Forcing a refresh after every bulk request makes indexing slow and fragments the index."],
    v: "Index a document and search it at once, then again after one second. Confirm it is absent first and present after the refresh interval, and that a manual refresh makes it visible immediately.",
    dep: ["indexing-buffer", "immutable-segments", "segment-readers"]
  },
  "flush-and-commit": {
    s: "Writes all in-memory segments to disk with a durable commit point and then discards the transaction log entries it makes redundant.",
    d: "A flush finishes any pending segments, calls fsync on their files and writes a commit point listing the live segments. Once the commit is durable, the log up to that point is no longer needed for recovery and can be rolled over and trimmed. Flush runs when the log grows to a size limit or periodically. It is heavier than a refresh because of the sync. The difficulty is ordering: the commit file must be written last and atomically, since a crash between steps must leave either the old commit or the new one, never a mix.",
    k: ["Frequent flushes vs. infrequent: frequent flushes keep the log small and recovery fast, but add fsync cost and small segments; infrequent flushes allow a long log and slow recovery.", "Flush on log size vs. on time: size-based limits bound recovery work, whereas time-based adds predictability for idle shards."],
    p: ["A log never flushed on a low-traffic shard grows without bound and recovery takes minutes.", "Skipping fsync of segment files before writing the commit lets a crash leave a commit pointing at missing data."],
    v: "Index data, flush, kill the process and restart. Confirm the commit lists all segments, recovery replays no log entries since the flush, and the document count matches.",
    dep: ["commit-points", "translog", "immutable-segments"]
  },
  "merge-policy": {
    s: "The rule choosing which segments to combine, when, and into how many, so that the segment count and wasted space from deletes stay bounded at the lowest I/O cost.",
    d: "Segments are grouped by size into tiers. When a tier holds too many segments, the policy selects a set of similar size, preferring those with many deleted documents, and proposes a merge into one larger segment, within a maximum merged size. Merging reads the sources, drops deleted documents, renumbers and rewrites all structures. Write amplification is the cost: each document is rewritten at every tier it passes. The difficulty is tuning: aggressive merging keeps queries fast and uses I/O, lazy merging saves I/O and leaves many segments.",
    k: ["Tiered merging with many segments per tier vs. few: more per tier means less rewriting and write amplification, but more segments at query time.", "A maximum merged segment size vs. unbounded: a cap prevents enormous segments that are costly to merge and recover, but leaves a minimum segment count that grows with data."],
    p: ["A cap that is too low on a large index leaves many mid-sized segments, slowing every query.", "Heavy update workloads leave segments mostly deleted documents until the policy selects them."],
    v: "Index in many small batches and watch segment counts over time. Confirm the count stays within the policy's bound, merged segments are larger, deleted documents disappear from them, and total document counts are unchanged.",
    dep: ["immutable-segments", "merge-scheduler", "live-docs-bitset"]
  },
  "merge-scheduler": {
    s: "Runs the merges the policy proposes on background threads, throttling their I/O so indexing and queries keep their latency.",
    d: "Merges execute concurrently up to a configured thread count. Each reads multiple segments and writes one, using sequential I/O. If merges fall behind, the scheduler first throttles incoming indexing threads so the segment count does not grow without bound. I/O rate limiting adjusts to the merge backlog, running faster when the debt is high. On spinning disks fewer concurrent merges are used; on fast storage, more. The difficulty is contention: merge I/O competes with queries and flushes for the same disk and page cache, and falling behind shows up as indexing stalls.",
    k: ["Throttling indexing when merges lag vs. letting segments pile up: throttling protects query performance and stability, but slows ingest; unbounded segments hold throughput, and degrade searches.", "Higher merge concurrency vs. lower: more threads clear backlog faster on fast storage, but thrash slower disks."],
    p: ["Merges starting during a peak query period raise search latency through disk and cache contention.", "A single merge thread on a fast array leaves the disk idle while the backlog grows."],
    v: "Bulk-load faster than merges can keep up and watch indexing latency. Confirm indexing slows when the merge backlog grows, segment count stays bounded, and normal throughput returns when the backlog clears.",
    dep: ["merge-policy", "directory-abstraction"]
  },
  "live-docs-bitset": {
    s: "A per-segment bit array marking which documents are still alive, consulted by every query so deleted documents never appear in results.",
    d: "When a document is deleted or replaced, its number in the segment holding it is cleared in a live-documents bitset written to a small file next to the segment, with a generation number so the segment's other files stay untouched. Queries treat the bitset as an additional filter, skipping cleared documents during iteration. Merging drops them physically. A segment with no deletions has no such file. The difficulty is read cost and reader reopening: every delete creates a new bitset generation, and deletes pile up until merges reclaim space.",
    k: ["Bitset of live documents vs. a list of deleted ones: a bitset gives constant-time checks and a fixed size, but costs one bit per document; a list is smaller when deletes are rare.", "Per-segment delete files vs. rewriting segments: separate files keep segments immutable, but mean deletes cost until a merge removes them."],
    p: ["A heavy-delete workload leaves segments with a large share of dead documents that still occupy space and slow scans.", "Statistics such as document frequency still count deleted documents until merge, nudging scores."],
    v: "Delete half the documents in one segment and run a query. Confirm none of the deleted documents appear, a new live-docs file exists for the segment, and a merge later shrinks the segment's size.",
    dep: ["immutable-segments", "deletes-and-tombstones"]
  },
  "deletes-and-tombstones": {
    s: "A delete buffers a marker that clears the document from every older segment at the next refresh, and in distributed form is kept as a tombstone so replicas and recovery can replay it.",
    d: "A delete records the document's id in a buffer. At refresh, the engine looks up the id in each segment, using the id term's postings, and clears the matching bits in the live-documents sets. Updates are a delete plus an index of the new version. In a replicated system, the delete operation is logged with a sequence number and a short-lived tombstone is retained so that an out-of-order older index operation cannot resurrect the document. The difficulty is that space is not freed until merge, and tombstones must live long enough for slow replicas.",
    k: ["Retaining tombstones for a window vs. removing immediately: retention prevents resurrecting deleted documents on delayed replicas, but costs space and needs a time limit.", "Delete by id vs. delete by query: by id is cheap, and by query must find and mark every match, costing a search and a delete per segment."],
    p: ["Expiring tombstones too early lets a replayed old write bring a deleted document back.", "Deleting by query on a huge index takes long and holds snapshots of segments open."],
    v: "Delete a document, refresh and search for it, then replay its original index operation out of order. Confirm it is absent in both cases and the tombstone's sequence number rejects the stale write.",
    dep: ["live-docs-bitset", "sequence-numbers", "updates-and-versioning"]
  },
  "updates-and-versioning": {
    s: "A document update is a delete of the old version plus an index of the new one, guarded by version or sequence-number checks so concurrent writers cannot overwrite each other silently.",
    d: "The engine finds the current document by its id, reads its source, applies the change, and indexes the result as a new document, while marking the old one deleted. Each write carries a sequence number and primary term; a conditional write is rejected if the current values differ from those the client read. This gives optimistic concurrency without locks. Partial updates are done on the primary, and the resulting full document is replicated. The difficulty is cost: updating one field reindexes everything, and a hot document produces constant deletes.",
    k: ["Optimistic concurrency checks vs. last-write-wins: checks prevent lost updates for read-modify-write clients, but require retry logic; last-write-wins is simple and overwrites silently.", "Partial update in the engine vs. replace from the client: partial update saves bandwidth, but runs reindexing on the shard; client replacement is simpler and sends the whole document."],
    p: ["A counter field updated on every event rewrites its whole document each time and produces massive delete debt.", "Read-modify-write clients without a version check lose updates under concurrency."],
    v: "Run two clients that read the same version and both write a change. Confirm the second is rejected with a conflict, a retry succeeds, and the final document contains both changes.",
    dep: ["deletes-and-tombstones", "sequence-numbers", "source-document"]
  },
  "segment-readers": {
    s: "A point-in-time view over a fixed set of segments and delete bitsets, used by queries so they see a consistent index even while writes and merges continue.",
    d: "A reader holds references to specific segments and their live-document sets as of one refresh. Queries run against it without locks. A refresh opens a new reader reusing unchanged segment readers and releases the old one when its last query finishes; a segment's files are deleted only when no reader references them. The same mechanism implements held views for scrolling and snapshots. Readers cache per-segment data such as file maps and filter bitsets. The difficulty is resource retention: long-lived readers pin old files, and disk use can double during merges.",
    k: ["Reference counting segment files vs. deleting immediately: counting makes concurrent reads safe, but delays disk reclamation until readers close.", "Sharing segment readers across refreshes vs. reopening everything: sharing keeps caches warm for unchanged segments, but needs careful lifetime handling."],
    p: ["A leaked long-running scroll holds old segments, and the disk fills after merges.", "Many open readers across thousands of shards use many file handles and memory maps."],
    v: "Open a reader, merge segments and index new documents. Confirm the open reader's results do not change, new queries see new data, and old files are deleted only after the reader closes.",
    dep: ["immutable-segments", "near-real-time-refresh"]
  },
  "force-merge": {
    s: "An explicit operation that merges an index down to a target number of segments, usually one, for indexes that will not be written to again.",
    d: "The caller asks for merging to at most a stated segment count. The engine rewrites segments repeatedly until the target is reached, dropping all deleted documents. A single segment gives the fastest reads, the smallest size, and the best statistics. It is heavy in I/O and temporarily needs disk space equal to the index. On an index still receiving writes it is counterproductive, because the huge segment will be rarely merged again and deletes then accumulate in it. The difficulty is timing: it belongs after rollover, in the warm phase.",
    k: ["Merging to one segment vs. leaving it to the policy: one segment gives the best read speed and size for static data, but costs a large I/O burst; the policy spreads the cost.", "Force merging live indexes vs. only read-only ones: live indexes lose the tier structure, so the giant segment is never merged and its deletes pile up."],
    p: ["Forcing a merge on an index still receiving updates leaves a giant segment with lingering dead documents.", "A force merge started without free disk equal to the index size fails halfway."],
    v: "Make an index read-only with forty segments and force merge to one. Confirm one segment remains, deleted documents are gone, disk use fell, and query results are identical but faster.",
    dep: ["merge-policy", "lifecycle-policies"]
  },
  "translog": {
    s: "An append-only log of every acknowledged write, kept until a commit makes it redundant, so operations since the last commit can be replayed after a crash.",
    d: "Each indexing or delete operation is appended to the transaction log, with its sequence number, before being acknowledged. After a crash, the engine opens the last commit and replays log operations beyond it into the in-memory buffer. After each commit, older log generations can be deleted, though some are retained for replica recovery. The log is also read by replicas catching up and serves real-time get by id for documents not yet in a segment. The difficulty is the cost of durability: each fsync adds latency, and a log that is never trimmed grows large.",
    k: ["Write-ahead log vs. committing every change: the log makes writes cheap and durable, with sequential I/O, but needs replay logic at startup; committing every write is simple and very slow.", "Keeping extra log history for replicas vs. trimming at commit: extra history makes short outages cheap to recover, but uses disk."],
    p: ["Log corruption at the tail after a crash must be detected and truncated, or recovery fails.", "A log retained for a lagging replica grows without limit when that replica never returns."],
    v: "Index documents, kill the process before a flush, and restart. Confirm every acknowledged document is recovered by replay, none is duplicated, and the log is trimmed after the next commit.",
    dep: ["sequence-numbers", "flush-and-commit", "checksums-and-corruption"]
  },
  "translog-sync-modes": {
    s: "The policy for when log writes reach stable storage: fsync before every acknowledgment for safety, or on a timer for throughput, with a stated loss window.",
    d: "In request mode, the log is flushed and fsynced before the write is acknowledged, so an acknowledged operation survives a power loss, and group commit lets concurrent requests share one sync. In async mode, writes are acknowledged after being appended to the operating system's buffer, and a timer syncs every few seconds, so a crash can lose that window. With replication, a copy on another node can cover a single machine failure even in async mode. The difficulty is understanding: the setting controls a documented risk window and is often changed for benchmarks and left in place.",
    k: ["Sync before acknowledging vs. periodic sync: syncing first gives no acknowledged loss on single-node failure, but adds latency per request; periodic sync is faster and risks the interval's writes.", "Relying on replicas for durability vs. local sync: replicas avoid per-request fsync cost, but fail together in a correlated outage such as a power cut."],
    p: ["Async sync left on after a bulk-load test, and a power failure then loses seconds of acknowledged writes.", "Group commit is wasted by clients sending one request at a time with strict sync."],
    v: "Write with each mode while repeatedly cutting power on a test machine. Confirm request mode loses no acknowledged write, async mode loses at most the configured window, and measure latency for each.",
    dep: ["translog", "replication-protocol"]
  },
  "sequence-numbers": {
    s: "A per-shard, monotonically increasing number assigned by the primary to every operation, which orders history and defines checkpoints for replication and recovery.",
    d: "The primary assigns each operation a number and the current primary term, which increases on every failover. Replicas apply operations and report their local checkpoint, the highest number below which they have everything. The global checkpoint is the minimum across in-sync copies, so everything at or below it is known to be on all of them. Recovery then replays only operations above a copy's checkpoint, and out-of-order or stale operations from an old primary are rejected by term. The difficulty is gaps: concurrent operations complete out of order, so the checkpoints advance only through contiguous ranges.",
    k: ["Sequence numbers with checkpoints vs. file-based recovery only: checkpoints allow short, operation-based recovery and reliable failover reconciliation, but need persistence and retention of history.", "Primary term in every operation vs. relying on cluster state: the term rejects stale primaries at the operation level, but needs it carried through every message."],
    p: ["A gap from a lost operation stalls the checkpoint and makes recovery fall back to full copies.", "A deposed primary still accepting writes is possible without term checks."],
    v: "Write on a primary, partition it and promote a replica, then heal. Confirm the old primary's operations are rejected by term, checkpoints are consistent, and no gaps remain after recovery.",
    dep: ["replication-protocol", "translog"]
  },
  "commit-points": {
    s: "A small file listing exactly which segment files make up the index at a durable moment, written last and atomically so a crash always leaves one complete, valid state.",
    d: "The commit point names all live segments, their delete generations and user metadata such as the last sequence number. It is written to a new generation file after all referenced files are synced, and older commit points can be deleted unless a snapshot holds them. On startup, the newest valid commit defines the index, and any files it does not list are leftovers deleted. Keeping a commit point protects its files from deletion, which is how snapshots obtain a stable file set. The difficulty is crash ordering and cleanup of unreferenced files.",
    k: ["Write a new commit file vs. overwrite in place: a new generation is atomic and keeps the previous state valid, but requires cleanup of old ones.", "Retaining old commit points vs. only the latest: retaining supports snapshots and rollback, but pins segment files that merges would free."],
    p: ["A snapshot or held commit point keeps merged-away files on disk until released.", "Leftover files from a crash that no commit references accumulate if cleanup is skipped."],
    v: "Kill the process between writing segment files and the commit. Confirm restart opens the previous commit, the unreferenced files are removed, and document counts equal the previous commit's.",
    dep: ["flush-and-commit", "immutable-segments", "directory-abstraction"]
  },
  "directory-abstraction": {
    s: "A thin interface between the index code and storage that provides named, write-once files with sequential writes and random reads, whatever medium holds them.",
    d: "The index code writes files through output streams and reads them through inputs supporting seeks. Implementations map these to memory-mapped files, buffered reads, an in-memory store for tests, or remote object storage. Files are created once and never modified, and deletion and sync are separate operations. Keeping the interface narrow means segments can be stored in new places without changing the index code. The difficulty is performance semantics: random-access patterns that are fine on local disk are costly on remote storage, so a different layout or caching layer is needed.",
    k: ["Write-once files with a narrow interface vs. a general file system API: a narrow interface makes new storage backends easy and safe, but forbids in-place edits.", "Local disk vs. remote object storage backend: remote storage separates compute from data and cuts cost, but needs a local cache to avoid slow random reads."],
    p: ["A remote backend with no cache turns each skip and block read into a network request.", "Forgetting to sync a file before referencing it in a commit makes a crash recovery unsafe."],
    v: "Swap the directory implementation between mapped files and an in-memory store and run the same test suite. Confirm identical results, and that a remote backend with a warm cache is within an agreed factor of local.",
    dep: ["mmap-and-page-cache", "immutable-segments"]
  },
  "mmap-and-page-cache": {
    s: "Maps segment files into the process address space so the operating system's page cache holds hot index data, with no copy into the application heap.",
    d: "Term indexes, postings, doc values and norms are read directly from mapped memory. The operating system loads pages on demand and evicts the least recently used under pressure, so hot data sits in memory and cold data costs a disk read. This avoids heap garbage and uses all free memory as cache. It also means memory is shared with other uses: leaving a large fraction of RAM free for the cache matters more than a large heap. The difficulty is invisible cost: page faults are not tracked by the application, and swapping or too little free memory causes erratic latency.",
    k: ["Memory mapping vs. application-managed buffers: mapping lets the OS cache everything with no heap pressure, but gives little control and page faults appear as latency spikes.", "Small heap, large page cache vs. large heap: a small heap leaves memory for cached index files and shorter pauses, but limits heap-based structures like caches and aggregations."],
    p: ["Giving most of the memory to the heap leaves little for the page cache, and every query reads from disk.", "Swapping activity on a search node causes seconds-long latency spikes."],
    v: "Restart a node and run queries repeatedly. Confirm the first run shows page-fault and disk-read activity and later runs show near-zero reads and lower latency, with heap use unchanged.",
    dep: ["directory-abstraction"]
  },
  "checksums-and-corruption": {
    s: "Every index file ends in a checksum verified on open and on copy, so bit rot or truncated files are detected before they return wrong results.",
    d: "Each segment and log file carries a footer with a checksum of its contents. Verification runs when files are copied during recovery or snapshot, when a segment is merged, and optionally on open. A failed check marks the shard copy corrupted and triggers recovery from another copy. A store is also marked corrupt so it will not be reopened by accident. The difficulty is cost and coverage: full verification reads every byte, so it runs mostly at copy and merge time, and silent corruption in memory is not caught by file checksums.",
    k: ["Verify on every open vs. at copy and merge only: every open catches problems early, but delays startup on big shards; copy-time checks are cheaper and miss a file that is never copied.", "Failing hard on a checksum mismatch vs. serving what is readable: failing prevents wrong answers, but loses a shard copy; partial serving risks silent wrong results."],
    p: ["A corrupt replica copied to a new node by file recovery spreads the damage unless the checksum is verified.", "Checksums confirm the file is intact, but not that the data written was correct, so bad hardware memory still corrupts."],
    v: "Flip a byte inside a segment file and open the index, then run recovery. Confirm the shard copy is marked failed, a healthy copy is used to rebuild it, and queries never return data from the damaged file.",
    dep: ["directory-abstraction", "replica-recovery", "snapshots"]
  },
  "relevance-vs-latency": {
    s: "How much work each query may do to rank well: the choice of scoring model, rerank depth, vector search width and exact totals all trade result quality against response time.",
    d: "Every ranking improvement costs time. Richer analysis expands query clauses, function scores defeat early termination, wide vector beams and large rerank windows add work, and exact hit counts need full matching. Each layer must be given a budget, and the total must fit the latency target at the high percentiles, not the average. Caches, filters, pre-sorted indexes and approximate methods buy time back. The decision shapes analyzers, mappings, shard counts and hardware, and is judged by measuring both quality and tail latency on real query mixes.",
    k: ["Pruned approximate retrieval vs. exhaustive scoring: pruning gives large speedups with an exact top-k for additive scores, but loses exact totals and some flexibility; exhaustive is exact and slow.", "A cheap first stage with an expensive reranker vs. one rich scorer: staged ranking spends cost only on candidates, but caps quality at first-stage recall."],
    p: ["Optimizing average latency hides tail queries, such as long disjunctions, that violate the user-visible target.", "Quality gains measured offline are shipped without measuring their latency cost on production traffic."],
    v: "For each ranking change, record a quality metric and p50 and p99 latency on a replayed production query sample. The change passes only if both stay within their agreed budgets.",
    dep: ["early-termination", "reranking", "hnsw-graph", "function-score"]
  },
  "freshness-and-consistency": {
    s: "How soon a write becomes visible to search and how replicas agree: refresh intervals, replica lag and in-sync tracking decide what a reader sees and when.",
    d: "Search is eventually consistent by design. A write is durable when the log is synced and replicated, searchable at the next refresh, and visible on each replica when it has applied the operation. Reads from different copies can differ by a refresh interval. Gets by id can read the log for real-time results. Applications that need read-your-writes wait for a refresh or accept delay. The interval trades freshness against segment churn and cache loss. The decision affects user expectations, test design and how replicas are chosen for queries.",
    k: ["Short refresh with fresh results vs. long refresh with efficient indexing: short intervals serve live data, but fragment segments; long intervals favor bulk throughput and show stale results.", "Searching any replica vs. pinning a user to one copy: any replica balances load, but results can move backward in time; pinning gives monotonic reads and uneven load."],
    p: ["Users refresh a page, hit a different replica and see an older result set that looks like data loss.", "Application tests assume immediate visibility and pass only on a lightly loaded cluster."],
    v: "Write a document and poll each shard copy until it appears. Confirm visibility arrives within the refresh interval plus replication lag on every copy, and a get by id sees it before refresh.",
    dep: ["near-real-time-refresh", "replication-protocol", "translog-sync-modes"]
  },
  "shard-sizing": {
    s: "The number and size of primary shards per index, which sets parallelism, recovery time, fan-out and overhead, and is expensive to change after data exists.",
    d: "Each shard is a full index with its own memory structures, file handles and thread work. Too many small shards waste memory, bloat cluster state and increase fan-out per query. Too few large ones limit parallelism, slow recovery and make merges and relocation heavy. Common guidance targets shards in the tens of gigabytes with a bounded count per node. Routing with a fixed shard count ties documents to shards. Rollover and time-based indexes let sizing be revisited for each new index. The decision should be made from measured data volume, growth and recovery objectives.",
    k: ["Few large shards vs. many small ones: large shards cut overhead and fan-out, but recover and rebalance slowly; small shards balance well and multiply memory and coordination cost.", "Over-allocating shards for future growth vs. resizing later: extra shards avoid early reindexing, but waste resources until the data arrives."],
    p: ["Creating a thousand tiny indexes with five shards each swamps the cluster state and heap.", "One enormous shard takes hours to recover after a node loss and cannot be split in place."],
    v: "Load a representative dataset into candidate shard counts and measure query p99, indexing rate, recovery time after a node kill and heap use per shard. Choose the smallest count that meets all four targets.",
    dep: ["shard-routing", "scatter-gather", "shard-allocation", "rollover"]
  },
  "memory-budget": {
    s: "How machine memory is split among the managed heap, the operating system page cache, caches, indexing buffers and vector graphs, which decides whether queries run from memory or disk.",
    d: "The heap holds cluster state, caches, aggregation state, indexing buffers and request data. The rest of memory is the page cache for segment files, which serves most query reads. A large heap lengthens garbage collection pauses and starves the cache; a small one limits aggregations and caches. Vector graphs and doc values want to be fully resident for steady latency. Circuit breakers guard heap, and swap should be off. The decision applies to every node role and is verified under real load, not estimated from data size alone.",
    k: ["Heap sized small vs. large: a small heap with a big page cache gives short pauses and fast reads, but limits caches and aggregation memory; a large heap does the opposite.", "Keeping all hot index data in cache vs. paying disk reads: all in cache gives low, stable latency, but costs RAM; partial caching saves memory and adds tail latency."],
    p: ["A heap set to most of the RAM leaves no page cache, and latency doubles with no error.", "Capacity planned from disk size alone ignores the working set needed in memory."],
    v: "Run production-like queries and record page-fault rate, heap use after collection, collection pause times and p99. Confirm disk reads are near zero for the hot set and no breaker trips.",
    dep: ["mmap-and-page-cache", "request-limits", "hnsw-graph", "filter-caching"]
  },
  "schema-evolution": {
    s: "How fields, analyzers and mappings change over time, given that most index structure is fixed at write time and a change to it means reindexing into a new index.",
    d: "New fields can be added to a live mapping, but types, analyzers and structural options of existing fields cannot be changed in place, because data was encoded under them. Changes are applied by creating a new index with the new mapping, copying data through reindexing and switching an alias. For time-based indexes, a new template takes effect on the next rollover, and the old data ages out. Queries across old and new indexes must tolerate differing mappings. The decision is a process: versioned mappings, a tested reindex path and aliases from the start.",
    k: ["Reindex into a new index vs. adding multi-fields to the existing one: reindexing gives a clean result and costs a full copy; adding a sub-field is cheap, but only covers new documents until backfilled.", "Strict mappings vs. flexible: strict mappings surface changes deliberately, but slow teams down; flexible ones evolve silently and risk type conflicts."],
    p: ["No alias in front of the index makes the cutover a client change coordinated across teams.", "A mapping change applied by template only affects new indexes, and old data silently keeps the old behavior."],
    v: "Change an analyzer through the documented path on a copy: new index, reindex, alias swap. Confirm queries work throughout, the new behavior appears afterwards, and the old index can be restored by swapping back.",
    dep: ["reindexing", "aliases", "field-mappings", "index-templates"]
  },
  "multi-tenancy-and-security": {
    s: "How data from different customers or teams shares a cluster: separate indexes, shared indexes with filters, or separate clusters, with permissions and noisy-neighbor limits enforced across every layer.",
    d: "Isolation can be by cluster, by index or by filtered view of a shared index, in descending strength and ascending efficiency. Each choice affects shard counts, mapping flexibility, caching and the blast radius of mistakes. Authorization must be applied inside the engine at index, field and document level, not left to application code. Resource limits, such as thread pool quotas, query timeouts and rate limits, stop one tenant from degrading the others. Encryption, audit and retention rules add requirements. The decision is made early because moving tenants between models means reindexing.",
    k: ["Index per tenant vs. shared index with tenant filter: separate indexes give isolation and per-tenant tuning, but multiply shards; shared indexes are efficient and depend on filters never being missed.", "Soft quotas vs. hard isolation: quotas share hardware cheaply, but a heavy tenant can still affect others; dedicated clusters isolate completely and cost more."],
    p: ["One tenant's expensive aggregation slows every other tenant in a shared cluster.", "Tenant scoping done only in the application is bypassed by a single forgotten code path."],
    v: "Run a heavy query load as one tenant while measuring another tenant's latency, and attempt cross-tenant reads with a restricted credential. Confirm latency stays within its target and every cross-tenant read is denied.",
    dep: ["security-and-tenancy", "shard-sizing", "request-limits", "filter-context"]
  }
});
