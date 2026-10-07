// Details for the retrieval-augmented generation plate, part 3: retrieval, access control, indexes.
ATLAS.details("rag-system", {
  "dense-retrieval": {
    s: "Finds passages whose embedding vectors lie closest to the query's vector, matching meaning rather than exact words.",
    d: "The query is embedded with the same model used for the chunks, and the vector index returns the nearest neighbors under a similarity measure such as cosine. It handles paraphrase and vocabulary mismatch well, and fails on exact identifiers, rare names, numbers and negation, where vectors blur distinctions. It returns a candidate list, usually a few hundred, for fusion and re-ranking. Recall depends on the index's approximation settings and on how well the embedding model fits the domain.",
    k: ["Large candidate pool vs small: a large pool gives later stages more to rescue, at higher search and re-ranking cost; a small pool is fast but loses borderline hits.", "Similarity threshold vs top-k only: a threshold avoids returning junk for unanswerable questions, but score scales differ by query and model, so it needs tuning."],
    p: ["Searching with a different embedding model than the index used returns plausible but meaningless neighbors.", "Treating similarity scores as comparable across queries produces thresholds that work for some questions only."],
    v: "Query with a paraphrase that shares no words with the target passage and confirm it appears in the top results; query an exact error code and observe whether it is found, documenting the limit.",
    dep: ["vector-index", "query-embedding"]
  },
  "lexical-retrieval": {
    s: "Matches query terms against an inverted index and scores passages by term frequency and rarity, finding exact words, names, codes and phrases.",
    d: "A scoring function such as BM25 weighs how often a term appears in a chunk against how common it is across the collection and normalizes for length. It supports phrases, fields, boosts and wildcard matching. It excels at identifiers, rare terms and quoted strings, which vectors handle poorly, and fails when the query uses different words than the document. It is fast, cheap and explainable, so it remains a core retriever even in systems built around embeddings.",
    k: ["Tune scoring parameters per collection vs defaults: tuning fits document lengths and vocabulary, but needs test sets and can overfit them.", "Stemming and synonyms on vs exact terms: broader matching raises recall, but conflates distinct terms and makes results harder to explain."],
    p: ["Dropping common words as stop words breaks queries like 'to be or not' and short product names.", "Chunk length variation lets very short chunks win scores through length normalization."],
    v: "Search for a ticket number and a rare product name and confirm the exact documents rank first, then inspect the score explanation to see which terms contributed.",
    dep: ["inverted-index", "query-normalization"]
  },
  "hybrid-fusion": {
    s: "Combines ranked lists from lexical and dense retrieval into one list, using rank-based or score-based merging so each method covers the other's weaknesses.",
    d: "Lists from different retrievers are not directly comparable since their scores have different scales. Reciprocal rank fusion merges by rank position, needing no calibration; weighted score fusion normalizes scores and sums them, giving tunable weights. Fusion is cheap, and usually improves recall over either method alone. Weights can vary by query type, favoring lexical for identifiers. The difficulty is tuning without overfitting, and the fact that a mediocre retriever can drag down a good one when given equal weight.",
    k: ["Rank-based fusion vs weighted scores: rank fusion needs no tuning and is robust, but discards how confident each retriever was; weighted scores use that, but need normalization.", "Fixed weights vs per-query-type weights: fixed is simple, while per-type matches strengths of each method at the cost of depending on classification."],
    p: ["Fusing a high-recall dense list with a noisy lexical list at equal weight buries exact matches.", "Differing candidate pool sizes between retrievers skew rank fusion toward the longer list."],
    v: "On a test set mixing identifier queries and paraphrase queries, confirm fused recall at k exceeds that of each retriever alone, and per-slice results show neither slice regressed.",
    dep: ["dense-retrieval", "lexical-retrieval"]
  },
  "metadata-filtering": {
    s: "Restricts candidates by structured fields such as source, date, type, language or permissions, applied inside the search so results come only from eligible chunks.",
    d: "Filters can be applied before the vector search (pre-filtering), after it (post-filtering), or integrated into the index traversal. Pre-filtering guarantees enough eligible results but can slow search or break graph connectivity when the filter is very selective. Post-filtering is simple but can return fewer than k results, or none, when most neighbors are excluded. The system chooses a strategy by estimated selectivity. Permissions are the most important filter and must never be post-hoc only.",
    k: ["Pre-filter vs post-filter: pre-filtering returns full result sets but can be slow on very selective filters; post-filtering is fast but risks returning too few results.", "Filter in the vector index vs in a separate store then intersect: integrated filtering is efficient, but ties you to its filter features; intersection is flexible but slower."],
    p: ["Post-filtering a top-10 list with a restrictive filter returns two results, none relevant.", "Filters on fields that are missing or null silently exclude every document lacking the field."],
    v: "Apply a filter matching one percent of chunks and confirm the engine still returns the requested number of results, all matching the filter, within the latency budget.",
    dep: ["attribute-index", "vector-index", "inverted-index"]
  },
  "cross-encoder-reranking": {
    s: "Rescoring the best candidates with a model that reads the query and each passage together, giving a more accurate order than the first-stage retrievers.",
    d: "First-stage retrieval compares precomputed representations, which is fast but approximate. A cross-encoder takes the query and a passage as one input and outputs a relevance score, capturing interactions that independent embeddings miss. It is applied to the top few dozen to few hundred candidates, since it costs one model pass per candidate. Gains are often the largest single quality improvement after hybrid search. The cost is latency and compute, and its input length limits the part of a long passage it can read.",
    k: ["Re-rank many candidates vs few: more raises the chance of rescuing the right passage, but latency and cost rise linearly with the count.", "A general pretrained re-ranker vs one fine-tuned on your data: general is available immediately, while fine-tuning fits domain notions of relevance but needs labeled pairs."],
    p: ["Passages truncated to the model's input limit are scored without their relevant half.", "Re-ranking cannot recover a passage the first stage never returned, so low recall upstream caps the gain."],
    v: "Compare ranking metrics on the test set before and after re-ranking and confirm the right passage moves up, then measure added p95 latency and confirm it fits the budget.",
    dep: ["hybrid-fusion", "model-serving-gateway"]
  },
  "late-interaction": {
    s: "Scores passages by comparing the query's per-token vectors with the passage's per-token vectors, preserving fine detail that a single vector per chunk loses.",
    d: "Instead of one vector per chunk, the index stores a vector for each token. A query's tokens are each matched to their best passage tokens and the matches are summed. This captures exact terms and word-level meaning with precomputed passage representations, sitting between single-vector search and full cross-encoding in cost and quality. The cost is storage, often tens of times larger than single-vector indexes, and more complex index structures. It is chosen when precision on detailed queries justifies the footprint.",
    k: ["Token-level vectors vs single vector per chunk: token-level is more precise on detailed queries, but costs far more storage and compute.", "Use as first-stage retriever vs as re-ranker over candidates: first-stage maximizes recall, but needs a specialized index; re-ranking reuses existing retrieval but caps at its candidates."],
    p: ["Storage grows with the number of tokens, so a large collection can exceed memory budgets unexpectedly.", "Mixing token vectors from different model versions in one index produces meaningless scores."],
    v: "On queries with specific multi-word constraints, confirm it ranks the matching passage above the one a single-vector search ranks first, and record the index size ratio and query latency.",
    dep: ["vector-index", "embedding-model-selection", "vector-quantization"]
  },
  "result-diversification": {
    s: "Reorders or selects results so the final set covers different sources and aspects instead of many near-identical passages.",
    d: "A diversification step trades relevance against novelty, for example maximal marginal relevance: it picks the best passage, then repeatedly picks the passage that scores well but differs from those already chosen. It can also cap results per document or per source. It helps broad questions with several facets and prevents one verbose document from filling the window. For narrow factual questions it can push out a second passage that confirms the first, so it is applied conditionally.",
    k: ["Strong diversity vs relevance first: strong diversity covers more facets, but may admit weaker passages; relevance first is best for narrow questions.", "Per-document cap vs similarity-based novelty: a cap is simple and predictable, while novelty adapts to content but needs pairwise similarity computation."],
    p: ["Applied to a factual lookup, it drops the second passage that corroborates the answer.", "A similarity threshold tuned on one embedding model misbehaves after the model is replaced."],
    v: "On a broad question with ten passages from one long document, confirm diversification yields sources from at least three documents; on a narrow lookup confirm the top passages are unchanged.",
    dep: ["passage-dedup-selection", "cross-encoder-reranking"]
  },
  "federated-retrieval": {
    s: "Searches several separate indexes or external systems in parallel and merges their results, when content cannot or should not live in a single index.",
    d: "Some content sits behind systems with their own search: a ticketing tool, a wiki, a database. The system sends the query to each, in parallel with per-source timeouts, then normalizes results and fuses them. Scores from different engines are not comparable, so merging relies on ranks or a re-ranker. Permissions must be passed through to each source. The difficulty is latency set by the slowest source, uneven quality, and sources that return summaries rather than full passages.",
    k: ["Federate live queries vs copy everything into one index: federation avoids duplication and stays fresh, but is slower and depends on each source's search; a central index is faster and uniform.", "Wait for all sources vs return when enough respond: waiting maximizes recall, while early return bounds latency but may skip the one that held the answer."],
    p: ["One slow source with no timeout holds the entire request.", "Merging by raw scores from different engines lets whichever scales highest dominate."],
    v: "Query across three sources with one artificially delayed, and confirm the response returns within the time limit using the others, with the delayed source's absence recorded in the trace.",
    dep: ["index-routing", "hybrid-fusion", "cross-encoder-reranking", "query-time-filtering"]
  },
  "retrieval-cutoffs": {
    s: "Decides how many passages to keep after ranking, by count, score threshold or score drop-off, so weak matches do not enter the prompt.",
    d: "A fixed top-k is simple but keeps weak passages when few are relevant and drops good ones when many are. Cutoffs by absolute score, by gap between consecutive scores, or by fraction of the best score adapt to the query. Calibrated re-ranker scores work best, because first-stage scores vary by query. The cutoff also feeds the abstention decision: if nothing clears the bar, the system should say so. It is hard because thresholds must be fit per ranker and shift when models change.",
    k: ["Fixed count vs adaptive threshold: fixed is predictable for budgeting, while adaptive avoids junk but gives varying amounts of evidence.", "Threshold on re-ranker score vs first-stage score: re-ranker scores separate relevant from irrelevant better, but exist only after the expensive stage."],
    p: ["A threshold fit on one model silently admits junk or rejects everything after the ranker is upgraded.", "A fixed top-k with several relevant documents drops the third needed passage."],
    v: "Run questions with one, three and zero relevant passages and confirm the number kept matches each case and zero relevant passages triggers the abstention path.",
    dep: ["cross-encoder-reranking", "retrieval-metrics"]
  },
  "graph-retrieval": {
    s: "Answers questions that depend on relationships by traversing a graph of entities and links, then supplying the connected passages or summaries as evidence.",
    d: "Entities and relations extracted from the corpus form a graph linking to their source chunks. Retrieval finds starting entities in the question, expands along relations to a limited depth, and collects associated chunks or community summaries. It helps with multi-hop questions such as who reported to whom, and with corpus-wide themes that no single chunk states. It is expensive: extraction needs model calls over every chunk, and the graph goes stale and wrong as documents change.",
    k: ["Graph traversal vs plain vector search: traversal answers relational and global questions, but has high build cost and extraction errors; vector search is cheap and good for local facts.", "Precomputed community summaries vs live traversal: summaries answer broad questions quickly, but must be regenerated as content changes."],
    p: ["Extraction merges two people with the same name into one node, linking unrelated documents.", "A deep traversal on a densely linked entity returns thousands of irrelevant chunks."],
    v: "Ask a two-hop question whose answer needs facts from two documents linked only through a named entity, and confirm the graph path retrieves both while plain vector search misses one.",
    dep: ["knowledge-graph-index", "query-classification", "chunk-store"]
  },
  "permission-model": {
    s: "The representation of who may read each document: owners, groups, roles, shares and inheritance from folders, kept in a form retrieval can evaluate quickly.",
    d: "Source systems express access differently: folder inheritance, group membership, explicit shares, public links, labels. The system normalizes these into access control entries attached to each document and chunk, such as lists of principals or group ids, plus deny rules where the source has them. The model must support evaluating a user's access at query time. The difficulty is fidelity: source semantics such as nested groups and inheritance are intricate, and any simplification either hides documents or leaks them.",
    k: ["Store allow-lists on each chunk vs look up permissions at query time: stored lists filter inside the index quickly, but go stale; live lookup is current, but adds a call per candidate.", "Mirror source semantics exactly vs a simplified model: exact mirroring avoids leaks, but is complex per source; simplified is manageable but risks over- or under-exposure."],
    p: ["Ignoring a deny rule or inherited restriction exposes documents that the source system hides.", "Public-link sharing is treated as ordinary access, exposing documents to users who never had folder access."],
    v: "Create documents with direct share, group share, inherited folder access and a deny, then confirm each of several test users sees exactly the documents the source system shows them.",
    dep: ["metadata-database", "identity-resolution"]
  },
  "identity-resolution": {
    s: "Maps the person asking to the principals used in each source system, including their groups, so one user's access can be evaluated across everything indexed.",
    d: "The caller authenticates with the identity provider; the system then resolves their identifier to the accounts in each connected source, which often use different usernames or emails, and expands group memberships including nested groups. The resulting principal set is attached to the request. Resolutions are cached briefly. It is hard because identities are messy: aliases, contractors, renamed accounts and users with no account in some source, which should see nothing from it instead of failing the request.",
    k: ["Resolve at query time vs ahead of time: query-time is current but adds latency; precomputed is fast but misses recent group changes.", "Fail closed vs fail open when a source cannot resolve: failing closed protects data but may hide documents; failing open serves results with leakage risk."],
    p: ["Matching users by display name rather than a stable identifier maps one person to another's access.", "Long group-cache lifetimes keep a departed employee's access active after offboarding."],
    v: "Remove a user from a group in the identity provider and confirm that within the stated cache window the documents granted by that group disappear from their results.",
    dep: ["metadata-database", "secrets-and-config"]
  },
  "permission-sync": {
    s: "Keeps stored access information current as sources change who can see what, including fast propagation of revocations.",
    d: "Permissions change independently of content: a folder is re-shared, a group is edited, a user leaves. The system receives events or polls for access changes, recomputes affected entries and updates the index metadata or the lookup tables. Revocations are prioritized over grants. A hybrid approach checks live permissions at query time for the final results as a backstop. The difficulty is volume and ordering: changing a top-level folder's access touches millions of chunks, and queries run during the update.",
    k: ["Event-driven updates vs periodic full resync: events are fast but can be missed; full resync is complete but slow, so most systems use both.", "Update index metadata in place vs re-index: in-place is quick but needs partial update support; re-indexing is simple but expensive for broad permission changes."],
    p: ["A missed revocation event leaves a document visible indefinitely until the next full sync.", "Applying grants before revocations during a bulk update briefly exposes content to the wrong people."],
    v: "Revoke a user's access to a folder in the source and measure the time until a query by that user no longer returns its documents, confirming it is within the stated revocation target.",
    dep: ["permission-model", "change-detection", "job-orchestrator", "attribute-index"]
  },
  "query-time-filtering": {
    s: "Applies the asking user's permissions to every search so only chunks they may read can be retrieved, ranked or shown to the model.",
    d: "The request's principal set becomes a filter condition in each index search, so excluded chunks never appear as candidates and never reach re-ranking or the prompt. A final check against live permissions for the chosen passages guards against sync lag. Filtering must apply to every path: vector, lexical, graph, cached results and any summaries. Enforcement inside retrieval is far safer than asking the model to withhold content. The difficulty is performance, since large principal sets and selective filters slow search.",
    k: ["Filter in the index vs filter results afterward: in-index is efficient and complete, but needs index support; afterward filtering is simple but leaks via counts and returns too few results.", "Principal lists on chunks vs per-user materialized access sets: chunk lists scale to many users, while per-user sets are fast to apply but costly to maintain."],
    p: ["A path added later, such as a summary index, skips the filter and exposes content.", "Showing result counts or facets computed before filtering reveals the existence of restricted documents."],
    v: "As a restricted user, search for terms found only in a forbidden document and confirm no snippet, count, citation or cached answer reveals it; repeat on every retrieval path.",
    dep: ["permission-model", "identity-resolution", "metadata-filtering", "attribute-index"]
  },
  "tenant-isolation": {
    s: "Keeps different customers' or business units' data separated in storage, indexes, caches and logs, so no query can cross the boundary.",
    d: "Isolation can be physical, with separate indexes and databases per tenant, or logical, with a tenant id that every record and query carries and every layer enforces. Embeddings, caches, logs, evaluation sets and fine-tuning data must also be partitioned. Keys can be per tenant to support deletion by key destruction. The difficulty is completeness: one shared cache or global re-ranking feature that ignores tenancy leaks data, and per-tenant indexes become costly at thousands of small tenants.",
    k: ["Separate index per tenant vs shared index with tenant filter: separate is strongest isolation and simplifies deletion, but costs more per tenant; shared scales efficiently, but one filter bug leaks data.", "Per-tenant encryption keys vs shared: per-tenant keys allow clean deletion and limit breach scope, at added key management cost."],
    p: ["A shared embedding cache keyed on text alone lets one tenant's cached content surface for another.", "Debug logs written to a common store hold tenants' queries and passages together."],
    v: "Index identical-looking secret documents in two tenants and confirm queries from one never return, cache, log or count the other's content, including after cache warm-up.",
    dep: ["query-time-filtering", "vector-index", "response-cache", "secrets-and-config"]
  },
  "access-audit-log": {
    s: "Records which user retrieved which documents, when and through which query, for security review, compliance and investigation of leaks.",
    d: "Each request logs the principal, query, retrieved document ids and versions, the passages supplied to the model and the answer. Logs are append-only, access controlled and retained per policy, and may store hashes or identifiers instead of full text to reduce exposure. They support questions such as 'who saw this document after it was reclassified'. The difficulty is volume and sensitivity: full logs duplicate protected content, while sparse logs cannot answer investigators.",
    k: ["Log full passage text vs identifiers only: full text enables exact reconstruction, but duplicates sensitive content; identifiers keep exposure small but depend on documents still existing.", "Retain long vs short: long retention supports investigations and compliance, but increases breach impact and storage cost."],
    p: ["Audit logs readable by a wider group than the documents defeat the access model.", "Logging only the final cited documents misses passages the model saw but did not cite."],
    v: "Pick one restricted document, query as a permitted user, and confirm the log shows user, time, query and document version; then show the log lets you list everyone who retrieved it in a date range.",
    dep: ["metadata-database", "identity-resolution"]
  },
  "redaction-and-pii": {
    s: "Finds and removes or masks personal and sensitive data in documents, queries and answers according to policy, before it is stored, indexed or shown.",
    d: "Detectors use patterns and models to find names, identifiers, financial and health data. Policy decides per field: mask in the stored chunk, tokenize reversibly, drop the document, or allow for authorized roles. It can run at ingestion, shaping what is indexed, and at answer time, shaping what is shown. Redaction also affects retrieval: masked text cannot be matched. The difficulty is recall and context, since missed identifiers leak and over-masking destroys answerable content.",
    k: ["Redact at ingestion vs at answer time: ingestion keeps sensitive data out of indexes entirely, but loses it for authorized users; answer time retains data and masks per viewer, at the cost of leakage risk throughout.", "Reversible tokenization vs irreversible masking: tokenization allows authorized unmasking, but needs secure token storage; masking is simpler and safer."],
    p: ["Detection patterns tuned for one country's identifiers miss formats from another.", "Embeddings computed before redaction still encode the personal data that was later removed from the text."],
    v: "Run a corpus seeded with known test identifiers of several formats through the pipeline and confirm none appear in chunks, vectors' source text, answers or logs for an unauthorized user.",
    dep: ["text-extraction", "document-store"]
  },
  "vector-index": {
    s: "The data structure that stores chunk embeddings and returns the nearest ones to a query vector quickly, trading exactness for speed and memory.",
    d: "An index holds millions to billions of vectors with ids pointing to chunks and metadata. Exact search compares against everything and does not scale; approximate indexes organize vectors into graphs, clusters or compressed codes so a query examines a small fraction. Settings control the recall-versus-latency trade. It supports inserts, deletes and filtered search. The difficulty is that recall is not guaranteed and degrades silently, and updates, deletes and filters can interact badly with the structure.",
    k: ["Exact search vs approximate: exact guarantees the true nearest neighbors but only scales to small collections; approximate scales at a measured loss in recall.", "In-memory vs disk-resident index: memory gives lowest latency but costs more per vector; disk-based handles larger collections at higher and more variable latency."],
    p: ["Recall that is never measured against exact search quietly falls as the index grows and parameters stay fixed.", "Heavy deletion without rebuilding leaves tombstones that slow search and leave stale neighbors."],
    v: "Compare approximate results with exact brute-force on a sample of queries and confirm recall at k meets the target, then repeat after a large batch of inserts and deletes.",
    dep: ["ann-graph", "vector-quantization", "chunk-store"]
  },
  "ann-graph": {
    s: "A navigable proximity graph over the vectors, where search walks from node to neighbor toward the query, reaching close matches while visiting few points.",
    d: "Each vector is a node linked to nearby vectors, often in layers with sparse upper layers for long jumps. A search starts at an entry point, greedily moves to neighbors closer to the query, and keeps a candidate list whose size sets the recall-latency trade. Construction parameters set connectivity. It gives high recall at low latency but uses substantial memory for links, builds slowly, and handles deletions and strict filters poorly because removed or excluded nodes break paths.",
    k: ["Higher connectivity and search breadth vs lower: higher improves recall, but increases memory, build time and latency.", "Graph index vs partition-based index: graphs give better recall per query cost, while partitions use less memory and update more easily."],
    p: ["Strongly selective filters leave the walk stranded in excluded regions and return few or no results.", "Rebuilding the graph for a corpus-wide embedding change takes hours and doubles memory during the switch."],
    v: "Sweep the search breadth setting and plot recall against latency on a sample, then confirm the production setting sits on the chosen target point and holds after the collection doubles.",
    dep: ["vector-quantization"]
  },
  "vector-quantization": {
    s: "Compresses stored vectors into smaller codes, such as fewer bits per dimension, to cut memory and speed up distance computation at some loss of accuracy.",
    d: "Scalar quantization stores each dimension in fewer bits; product quantization splits vectors into parts and stores codes from learned codebooks; binary quantization keeps one bit per dimension. Compressed vectors give fast approximate distances for the candidate stage, and the original vectors are optionally used to rescore the top candidates. Memory falls several-fold or more. The difficulty is accuracy loss that depends on the data and model, and codebooks that must be retrained when the distribution shifts.",
    k: ["Aggressive compression with rescoring vs light compression alone: aggressive saves most memory and recovers quality by rescoring, but needs the originals stored and read from disk.", "Learned codebooks vs fixed scalar codes: learned codebooks compress better, but require training and retraining; scalar codes are simple and stable."],
    p: ["Codebooks trained on an early sample perform badly after the corpus changes character.", "Evaluating recall only after compression-aware tuning hides loss on rare query types."],
    v: "Build compressed and uncompressed indexes over the same vectors and confirm memory falls by the expected ratio while recall at k on the test set drops by no more than the agreed margin.",
    dep: ["embedding-model-selection"]
  },
  "inverted-index": {
    s: "A mapping from each term to the list of chunks containing it, with positions and counts, enabling fast keyword, phrase and field search and scoring.",
    d: "Text is analyzed into tokens by case folding, splitting and optional stemming, and each token points to a postings list of chunk ids with frequencies and positions. Queries intersect or merge postings lists and score with term statistics. Fields allow separate treatment of titles and bodies. Segments are written immutably and merged in the background, so new documents appear after a refresh. Analyzer choices, fixed at index time, determine what can ever match, and changing them requires a rebuild.",
    k: ["Rich analysis with stemming and synonyms vs minimal: rich analysis raises recall on varied wording, but conflates terms and complicates exact matching; minimal is exact and predictable.", "Frequent refresh vs batched: frequent refresh makes new content searchable quickly, but creates many small segments and extra merge work."],
    p: ["Changing the analyzer without reindexing makes old and new chunks tokenized differently and match inconsistently.", "Deleted chunks remain in segments until merges, so counts and scores include them."],
    v: "Add a chunk, wait the stated refresh interval, and confirm it is searchable by a unique term; delete it and confirm it no longer appears in results or scoring statistics after a merge.",
    dep: ["chunk-store", "language-detection"]
  },
  "learned-sparse-index": {
    s: "An inverted index whose terms and weights come from a model, which expands chunks and queries with related terms and weights each, combining keyword speed with learned meaning.",
    d: "A model assigns weights to vocabulary terms for each chunk, including terms not present in the text that capture its meaning. Queries are expanded the same way. The result is stored in an ordinary inverted-index structure and scored by dot product. It offers better recall than plain keyword search on vocabulary mismatch while remaining explainable and efficient on inverted-index hardware. The cost is model inference at ingestion and query time, and postings lists that are longer than keyword ones.",
    k: ["Learned sparse vs dense vectors: sparse is explainable and reuses inverted-index infrastructure, but is less flexible across languages; dense captures broader semantics with opaque scores.", "Expansion on both sides vs documents only: both sides give best quality but add query-time inference; document-only expansion is cheaper with smaller gains."],
    p: ["Expansion terms produce unexplained matches that are hard to debug when a result seems irrelevant.", "Postings lists grow large with expansion, raising memory and slowing queries."],
    v: "Search with a term absent from a target chunk but semantically related and confirm the chunk is found; inspect the chunk's weighted terms and confirm the match is explained by them.",
    dep: ["inverted-index", "embedding-model-selection", "model-serving-gateway"]
  },
  "attribute-index": {
    s: "A structured index over chunk metadata such as source, type, date, owner, tags and permissions, supporting fast filtering, sorting and faceting.",
    d: "Each chunk carries fields indexed for equality, range and set membership. It is consulted for filtering during vector and lexical search, for facet counts in interfaces, and for permission checks. It may live inside the search engine, the vector index, or a database, with the planner choosing the order of operations by selectivity. Fields are typed and need consistent vocabularies. The challenge is keeping it in step with chunks: a metadata update must be reflected without re-embedding.",
    k: ["Metadata stored with each vector vs in a separate database: co-located metadata filters efficiently, but updates may require rewriting vector records; separate is flexible but needs joins.", "High-cardinality fields indexed vs not: indexing speeds filters on them, but increases memory and slows writes."],
    p: ["Inconsistent field values such as 'HR', 'hr' and 'Human Resources' split documents so a filter matches only some.", "Updating permission fields requires rewriting millions of records when stored inside the vector index."],
    v: "Update one metadata field for a thousand chunks and confirm filtered queries reflect it within the refresh time without any re-embedding and with unchanged vector search results otherwise.",
    dep: ["metadata-database", "chunk-store"]
  },
  "hierarchical-summary-index": {
    s: "A tree of summaries built over chunks, sections and documents, letting broad questions retrieve at the right level of detail instead of only fine-grained passages.",
    d: "Chunks are grouped by document structure or similarity, and a model writes a summary for each group, then summaries of summaries, up to the whole collection. Retrieval can start at the top and descend, or search all levels at once. It serves questions like 'what are the main themes in these reports', where no single chunk states the answer. The cost is generation across the corpus and re-summarization when documents change, and summaries may omit or distort details.",
    k: ["Search all levels together vs top-down traversal: all-levels is simple and parallel, but mixes granularities; top-down is efficient, but errors at upper levels hide the right branch.", "Summaries regenerated on each change vs lazily: eager keeps summaries accurate but costs model calls; lazy saves cost with stale summaries."],
    p: ["A summary built before an update continues to describe the old content and is retrieved with confidence.", "Summarizing across unrelated documents produces vague text that matches many queries and answers none."],
    v: "Ask for the main themes across a set of fifty reports and confirm the retrieved evidence includes summary nodes covering all of them; edit a report and confirm its summary chain updates.",
    dep: ["chunk-store", "synthetic-questions-summaries", "model-serving-gateway"]
  },
  "knowledge-graph-index": {
    s: "A store of entities and relationships extracted from documents, each linked to the chunks it came from, supporting relational queries and entity-centered retrieval.",
    d: "Extraction identifies entities and relations in each chunk, resolves duplicates into canonical nodes, and stores them with provenance. Queries traverse edges or match entity names to find connected evidence. Optional community detection groups related nodes for summarization. It adds precision on relational questions and disambiguation of names. Building costs a model pass over all text, and quality is limited by extraction and entity resolution errors that are difficult to see at scale.",
    k: ["Open-ended extraction vs a fixed schema of entity types: open-ended finds more but produces inconsistent labels; a fixed schema is cleaner but misses what it did not anticipate.", "Eager graph building vs on demand: eager makes queries fast but costs upfront and goes stale; on demand is flexible but slow per query."],
    p: ["Entity resolution that merges two distinct organizations connects documents that have nothing to do with each other.", "Edges whose source chunk is later deleted remain, asserting facts with no remaining evidence."],
    v: "Pick fifty extracted relations at random, check each against its source chunk, and confirm precision meets target; delete a source document and confirm its edges disappear.",
    dep: ["chunk-store", "metadata-database", "model-serving-gateway"]
  },
  "index-sharding": {
    s: "Splits an index across several machines or partitions by size, tenant or key, and combines their results, so large collections stay within memory and latency limits.",
    d: "Shards hold subsets of chunks and each answers the query for its subset; a coordinator merges the top results. Partitioning by tenant, source or hash balances load and isolates data; replicas add availability and read throughput. Ranking statistics may be local to a shard, which skews scores unless shared. The challenge is operations: rebalancing moves large volumes, uneven shards create hot spots, and tail latency is set by the slowest shard.",
    k: ["Shard by tenant or source vs by hash: key-based sharding enables isolation and skipping shards, but creates uneven sizes; hash sharding balances evenly but queries every shard.", "More shards vs fewer, larger: more shards parallelize and fit memory, but raise the cost of merging and tail latency."],
    p: ["Per-shard term statistics make the same chunk score differently depending on which shard holds it.", "A hot tenant on one shard drives its latency up for every other tenant there."],
    v: "Load a collection across shards and confirm merged results equal those from a single index on a sample of queries, then kill one replica and confirm queries still succeed within latency limits.",
    dep: ["vector-index", "inverted-index", "job-orchestrator"]
  },
  "index-snapshots": {
    s: "Point-in-time copies of an index and its metadata, used for rollback, evaluation against a fixed state, replay of past queries and blue-green switches.",
    d: "A snapshot captures index segments, vectors, metadata and the manifest of which document versions and embedding model it contains. New indexes are built in the background from the pipeline, evaluated against a snapshot of the old one, and promoted by switching an alias. Old snapshots are retained for a period for rollback and for reproducing past answers. The difficulty is size and consistency: snapshots must be consistent across lexical, vector and metadata stores, and hold sensitive data that deletion requests must also reach.",
    k: ["Full snapshots vs incremental: full are simple to restore, but large; incremental are small, but chain restores depend on every earlier piece.", "Long retention vs short: long retention allows reproduction of old answers, but conflicts with deletion obligations and storage cost."],
    p: ["Snapshotting the vector and lexical indexes at different moments creates an inconsistent pair that disagree on content.", "A deleted document survives in retained snapshots and returns when one is restored."],
    v: "Promote a new index, then switch the alias back and confirm the previous answers for a set of test questions reproduce exactly, including citations and document versions.",
    dep: ["vector-index", "inverted-index", "attribute-index", "raw-object-store"]
  },
});
