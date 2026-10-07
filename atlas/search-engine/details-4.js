// Details for the search engine plate, part 4: document intake, parsing, index building and updates.
ATLAS.details("search-engine", {
  "crawler-interface": {
    s: "The boundary where fetched documents arrive from the crawler, with their URL, headers, fetch time, status and body, plus the feedback that tells the crawler what to fetch next.",
    d: "The crawler delivers records to a durable intake queue: final URL, redirect chain, response headers, body bytes, fetch timestamp and status. Going the other way, the engine supplies signals the crawler schedules by: page importance, change history, link discovery and freshness needs. Crawling itself is covered in the web-crawler plate. It is hard because the two systems run on different cadences, because duplicates arrive constantly, and because intake must absorb bursts without losing documents or ordering.",
    k: ["Push through a durable queue vs shared storage handoff: queues decouple rates and give backpressure, while shared storage is simpler and gives weaker ordering.", "Engine decides crawl priority vs crawler decides: engine-driven priority uses ranking knowledge, while crawler-driven priority keeps the crawler autonomous and politeness-aware."],
    p: ["A crawler burst fills the queue and intake falls behind, so fresh content arrives hours late.", "Fetch timestamps are lost or overwritten, so freshness decisions use the wrong time."],
    v: "Feed a test page through the crawler and confirm the intake record contains the final URL, headers, time and body, and that the page is visible in the pipeline within the intake latency target.",
    dep: ["raw-document-store","distributed-storage","freshness-scheduling"]
  },
  "raw-document-store": {
    s: "Durable storage of fetched bytes and fetch metadata, keyed by URL and time, so any later stage can be rerun when parsers, models or policies change.",
    d: "Documents are written in large compressed batches with their fetch metadata and several recent versions per URL. Later stages read from here rather than refetching, so a new boilerplate remover can be run over the whole corpus. Retention balances storage cost against the ability to reprocess and to examine history. It is hard because the store is petabytes in size, because deletion requests and takedowns must reach it, and because reprocessing the full web is a large scheduled job.",
    k: ["Keep several versions per URL vs only the latest: history supports change analysis and debugging, while latest-only is far cheaper.", "Store raw bytes vs rendered output too: raw bytes are authoritative and cheap, while storing renders avoids repeating expensive rendering at higher storage cost."],
    p: ["A legal removal is applied to the index but the raw store keeps the content and a rebuild brings it back.", "Compaction drops old versions and a cloaking investigation loses the evidence it needs."],
    v: "Reprocess a sample of stored documents with a changed parser and confirm output differs as expected; then process a removal and confirm the raw store no longer returns the document.",
    dep: ["distributed-storage","crawler-interface","removals-and-tombstones"]
  },
  "charset-detection": {
    s: "Determines how a document's bytes map to text, from headers, markup declarations and statistical analysis, so the content is decoded correctly before anything reads it.",
    d: "Evidence comes in order of reliability: byte-order marks, the HTTP header, the markup declaration, and finally byte-frequency analysis for the many pages that declare nothing or declare wrong. The decoder converts to a single internal text encoding, replacing invalid sequences and recording the confidence. Declared encodings that disagree with the bytes are corrected. It is hard because legacy encodings of the same language look alike, because short pages carry little evidence, and because a wrong guess produces unreadable text that is still indexed.",
    k: ["Trust the declared encoding vs trust the bytes: declarations are cheap and often wrong, while statistical detection is robust and can overrule a correct declaration on short pages.", "Replace invalid bytes vs reject the document: replacement keeps content that is mostly good, while rejection avoids indexing damaged text."],
    p: ["A page in one legacy encoding is decoded as another and indexed as mojibake that matches nothing.", "Detection runs after truncation cut a multi-byte sequence, producing an error on a good page."],
    v: "Run a corpus of pages in many encodings with correct, missing and wrong declarations, and confirm the decoded text matches the known original for each.",
    dep: ["raw-document-store"]
  },
  "html-parsing": {
    s: "Turns markup, often broken, into a document tree with the fields the engine needs: title, headings, text blocks, links, images, metadata and language hints.",
    d: "The parser follows the standard's error-recovery rules, so malformed pages produce the same tree a browser would. A walker extracts structured fields, preserves block structure and positions for later passes, and records signals such as hidden text, nofollow attributes, canonical hints and meta directives. Extremely large or deeply nested pages are bounded. It is hard because the web's markup is wildly inconsistent and because parsing differences between the engine and browsers lead to different content being indexed than people see.",
    k: ["Browser-compatible error recovery vs a lenient custom parser: compatible recovery matches what people see, while a custom parser is faster and diverges on broken markup.", "Keep the full tree vs only extracted fields: keeping the tree allows reprocessing, while keeping fields only saves storage and loses information for new extractors."],
    p: ["Unclosed tags in a template swallow the rest of the page into one element and main content extraction fails.", "Hidden text is extracted as normal content and keyword stuffing is rewarded."],
    v: "Parse a corpus of malformed pages and compare the extracted title, headings, links and text against the browser's rendered result, requiring agreement above the target.",
    dep: ["charset-detection","raw-document-store"]
  },
  "javascript-rendering": {
    s: "Runs a page's scripts in a headless browser to produce the final document tree and links for pages whose content is built on the client.",
    d: "A render service loads the page in a sandboxed browser, fetches its resources, waits for the page to settle within a time budget, and captures the resulting tree and network requests. Rendering costs orders of magnitude more than parsing, so it is applied to pages that need it, detected by the amount of content in the initial markup, and is often done in a second wave. It is hard because scripts can run forever, depend on cookies and user events, fetch blocked resources and be abused, and because render results vary run to run.",
    k: ["Render every page vs only pages that need it: rendering all is simplest and expensive, while selective rendering saves orders of magnitude and risks missing content on pages misjudged as static.", "Snapshot after a fixed wait vs wait for network quiet: fixed waits bound cost and may capture half-loaded pages, while quiet detection captures more and may never end."],
    p: ["A page loads its text after a user interaction and the rendered snapshot has none of it.", "A sandboxed renderer is fed a hostile page that tries to reach internal addresses."],
    v: "Render pages built entirely by scripts and confirm the indexed text and links match what a browser shows after load, while a static page is never sent to the renderer.",
    dep: ["html-parsing","raw-document-store","cluster-scheduling","cloaking-detection"]
  },
  "boilerplate-removal": {
    s: "Separates the main content of a page from navigation, ads, footers and repeated template text, so that only content is indexed and used for signals.",
    d: "Methods combine block-level features (text density, link density, position, tag structure), site-level template detection that finds blocks repeated across pages of one host, and learned models over rendered layout. The output labels or removes non-content blocks, but keeps the removed blocks' links for graph use. It is hard because layouts vary endlessly, because comment sections, tables and short pages blur the boundary, and because a mistake either indexes ads and menus or drops the actual article.",
    k: ["Per-page heuristics vs site-level template learning: heuristics need no history, while template learning is precise for sites with many pages and fails on small ones.", "Remove boilerplate vs down-weight it: removal keeps the index clean, while down-weighting keeps recall for queries that match navigation or footers."],
    p: ["A site-wide menu containing a product name makes every page of the site match that product.", "A short article is mostly links and is classified entirely as boilerplate and emptied."],
    v: "Run on a labeled set of pages from varied sites and confirm extracted main text matches annotated content above a target overlap, and that site menus no longer produce matches for their words.",
    dep: ["html-parsing","javascript-rendering"]
  },
  "language-detection": {
    s: "Identifies the language, and the script, of a document and of each section, so the right analyzers, models and locale filters are applied.",
    d: "Detectors use character n-gram statistics or small neural models over the main content, combined with hints from headers, markup, domain and links. Multilingual pages are split by section. The result selects the tokenizer and stemmer, the serving locale and which language-specific ranking models apply. It is hard because closely related languages share vocabulary, short texts give little signal, and code-switching within one page is common.",
    k: ["Content-based detection vs declared language: content is reliable and costs computation, while declarations are free and often wrong.", "One label per page vs per section: one label is simple for filtering, while per-section labels handle multilingual pages and complicate the index."],
    p: ["A page in a closely related language is labeled with the wrong one and analyzed with the wrong stemming.", "Pages with mostly code or numbers are labeled randomly and filtered out of all locales."],
    v: "Test on labeled samples of short and long pages across many languages including close pairs, and confirm accuracy per language meets targets, with an explicit unknown label for undecidable pages.",
    dep: ["boilerplate-removal","charset-detection"]
  },
  "structured-data-extraction": {
    s: "Reads machine-readable markup embedded in pages, such as product, recipe, event and review data, validates it against the visible content and stores it as fields.",
    d: "Pages carry embedded data in standard vocabularies, in attributes or script blocks. The extractor parses it into typed fields, checks it against the page's visible text, since markup is easy to fake, and keeps what verifies. Fields feed rich result display, vertical indexes and the knowledge graph. It is hard because markup is frequently invalid, because mismatch between markup and page is a common spam tactic, and because vocabularies evolve.",
    k: ["Accept all markup vs only verified markup: accepting all maximizes coverage and invites fake ratings, while verification against visible text is safer and drops valid markup that is hard to match.", "Strict validation vs tolerant parsing: strict validation yields clean fields, while tolerant parsing recovers value from common mistakes."],
    p: ["Markup claims a high rating that the page does not display, and rich results show fabricated reviews.", "A vocabulary version change makes valid markup unreadable by the extractor."],
    v: "Parse pages with valid, invalid and deliberately mismatched markup and confirm valid fields are extracted, invalid fields are repaired or dropped, and mismatched claims are rejected.",
    dep: ["html-parsing","boilerplate-removal","spam-classification"]
  },
  "non-html-format-conversion": {
    s: "Extracts text, structure and metadata from documents in other formats, such as portable documents, office files, plain text and feeds, so they can be indexed like pages.",
    d: "Format-specific converters transform each type into the same internal document representation: text with headings, page numbers, metadata and links. Scanned documents need character recognition. Converters run in sandboxes with strict time and memory limits since files are untrusted. It is hard because layout-based formats lose reading order and tables, because files can be enormous or deliberately malformed, and because each format needs its own maintained converter.",
    k: ["Convert in a hardened sandbox vs in-process: sandboxes contain malicious files at the cost of startup overhead, while in-process conversion is faster and exposes the pipeline.", "Run recognition on scanned files vs skip them: recognition adds searchable content and costs heavy compute, while skipping leaves image-only files unsearchable."],
    p: ["A malformed file crashes or hangs the converter and a poison document stalls a worker repeatedly.", "Two-column layouts are read straight across and the extracted text is interleaved nonsense."],
    v: "Convert a corpus of files in each supported format including malformed ones, confirm text and metadata match references, and confirm a hostile file is killed at its limits without affecting other work.",
    dep: ["raw-document-store","charset-detection","cluster-scheduling"]
  },
  "text-analysis": {
    s: "Splits main content into tokens and applies language-specific normalization, stemming and phrase detection, producing the terms and positions the index stores.",
    d: "Analyzers are selected by language and script. They segment text into words (with dictionary or model support for scripts written without spaces), fold case and accents, apply stemming or lemmatization, drop or flag very common words, and detect phrases and compounds. Positions and field boundaries are kept for proximity scoring. The same analysis must run at query time. It is hard because each language has different rules, because analysis changes require reindexing, and because the choices decide which queries match which documents.",
    k: ["Aggressive stemming vs light normalization: aggressive stemming raises recall and merges unrelated words, while light normalization preserves precision and misses inflections.", "Remove common words vs keep them: removal shrinks the index and breaks phrase queries made of common words."],
    p: ["An analyzer version changes without a rebuild and old documents no longer match the terms new queries produce.", "Word segmentation errors in an unspaced script split names into meaningless pieces."],
    v: "Analyze the same text with the index and query pipelines and confirm identical term sequences; run a labeled set of inflected and compound queries and confirm they retrieve the documents containing the related forms.",
    dep: ["language-detection","boilerplate-removal"]
  },
  "index-build-pipeline": {
    s: "The batch pipeline that turns analyzed documents and their signals into index files: inverted index, forward data, field data and metadata, built by sorting and merging at scale.",
    d: "Stages read the processed documents, assign dense identifiers, emit term-to-document postings, sort and group them by term and shard, compress, attach per-document signals and write immutable segment files with checksums. Jobs run on a batch framework over distributed storage and take hours to days. Output is a versioned index ready for validation. It is hard because inputs come from many pipelines that finish at different times, because the job is huge and any stage can fail, and because a defect in the build ships to every query.",
    k: ["Rebuild the full index each cycle vs incremental merges: full builds are simple and always consistent, while incremental merging is faster and accumulates complexity and drift.", "One monolithic job vs staged jobs with stored intermediates: monolithic jobs are simpler to schedule, while staged jobs allow restart from a stage and repeated storage of intermediates."],
    p: ["One input pipeline is late and the index is built without its signals, silently ranking those documents low.", "A sorting bug orders postings wrongly in one shard and only queries touching those terms fail."],
    v: "Build an index from a fixed small corpus and confirm that counts, a sample of postings and a set of golden queries match expected output, with checksums validated on every output file.",
    dep: ["text-analysis","document-sharding","tier-assignment","batch-compute","document-entity-annotation"]
  },
  "document-sharding": {
    s: "Assigns each document to one of many shards so each machine holds a slice of the corpus, and every query is evaluated on all shards in parallel.",
    d: "Sharding by document keeps all information about a document together, so a shard can score its documents fully and return a local top list. Assignment is typically by hash of the document identifier, sometimes with locality for tier or language. Shard counts are chosen so a shard fits in memory or on fast storage and responds fast. It is hard because the number of shards sets fan-out and per-query cost, because skew creates hot shards, and because resizing means moving data.",
    k: ["Shard by document vs by term: document sharding keeps scoring local and makes every query touch every shard, while term sharding touches few machines and moves large lists across the network.", "Hash placement vs locality-aware placement: hashing balances load, while locality-aware placement improves caching and risks skew."],
    p: ["A cluster of very large documents or a language concentrated in one shard makes it slower than the others and it sets tail latency.", "Changing the shard count requires rebuilding everything and cannot be done during a busy period."],
    v: "Compare document counts, index sizes and query latency across all shards of a build and confirm the spread is within tolerance; confirm a document appears in exactly one shard.",
    dep: ["index-build-pipeline","distributed-storage"]
  },
  "tier-assignment": {
    s: "Decides which tier each document belongs in, using quality, authority, usage and freshness, so the small high-value tier can answer most queries cheaply.",
    d: "A scoring step combines query-independent signals with how often the document has appeared in results and been clicked. Documents above thresholds enter the top tier, with the rest divided into lower tiers by decreasing value, and obviously worthless pages are excluded from the index altogether. Assignment reruns each build and sometimes in between for fast promotion. It is hard because tier membership is a bet about future queries, because documents that are never shown never earn usage signals, and because exclusion decisions cannot be undone without a rebuild.",
    k: ["Static signals only vs including observed usage: static signals are available for new documents, while usage adapts to demand and favors what is already shown.", "Exclude low-value documents from the index vs keep in the bottom tier: exclusion saves large cost, while keeping them preserves long-tail recall."],
    p: ["A new page on an obscure topic is placed in a low tier and the only person searching for it never sees it.", "A scoring change moves many documents between tiers at once and the top tier suddenly exceeds its capacity."],
    v: "Compare the share of queries answered by the top tier and the loss of judged relevant results from lower tiers before and after a tier policy change, within the agreed limits.",
    dep: ["page-quality-model","link-authority-scoring","click-models","index-build-pipeline"]
  },
  "embedding-index-build": {
    s: "Computes vectors for documents or passages with an encoder and builds the nearest-neighbor structures per shard that dense retrieval searches.",
    d: "Documents are split into passages, encoded in large batches on accelerators, optionally compressed, and written into per-shard approximate-search structures with identifiers mapping back to documents. Encoder versions are tracked, since vectors from different versions cannot be compared. Updates for changed documents are handled by rebuild or by a delta structure. It is hard because encoding the whole corpus is expensive, because a model change forces full re-encoding, and because the structure needs a build step that is slow to update incrementally.",
    k: ["Encode whole documents vs passages: whole documents give a small index and blur topics, while passages retrieve exact sections and multiply index size.", "Re-encode on every model change vs keep old vectors for old documents: re-encoding keeps one comparable space, while mixing versions saves compute and breaks scores."],
    p: ["Documents are indexed with one encoder version and queries use another, and retrieval quality collapses unnoticed.", "A delta structure grows without limit and degrades search until the next rebuild."],
    v: "Encode a sample, build the structure, and confirm nearest-neighbor recall against exact search at serving settings, and confirm the build records one encoder version consistent with the query encoder.",
    dep: ["index-build-pipeline","document-sharding","batch-compute","dense-vector-retrieval"]
  },
  "index-publish-and-rollout": {
    s: "Validates a newly built index, copies it to serving machines and switches traffic over region by region, with the ability to roll back to the previous version.",
    d: "A candidate index is checked for size, counts, golden query results and score distributions, then served to a small canary fraction and compared against the current version on metrics. If the canary passes, files are copied to replicas, loaded, warmed and added to rotation gradually. Old versions remain until the new one is proven. It is hard because index files are large and take hours to move, because all shards of a serving group must switch together, and because problems may only appear under real traffic.",
    k: ["Atomic switch of all shards vs rolling replica upgrade: atomic switching keeps every query on one version and needs double storage, while rolling upgrades save space and allow mixed-version results.", "Automated gates vs human sign-off: automated gates run every cycle and miss new kinds of damage, while human sign-off is slow and catches strange cases."],
    p: ["A validation check passes a structurally valid but empty or truncated shard and results from it vanish.", "Rollback needs the old version, which has been deleted to save space."],
    v: "Publish a deliberately damaged index to a canary and confirm the gates reject it before user traffic is affected, then publish a good one and confirm traffic moves region by region and rollback restores the old version within minutes.",
    dep: ["index-build-pipeline","index-serving-replication","config-and-rollout","distributed-storage"]
  },
  "incremental-index-updates": {
    s: "Applies changes between full builds by adding a small delta index for new and changed documents and masking superseded ones, merged into the main index periodically.",
    d: "Between builds, changed documents flow through intake, analysis and signal lookup into a delta segment. At query time each shard consults the main index and the delta, with a deletion filter hiding documents replaced or removed. Periodic merging folds deltas into the base. The path uses the same analyzers and feature definitions as the base build. It is hard because scores must be comparable between main and delta, because deltas slow queries as they grow, and because partial signals for new documents can be missing.",
    k: ["Query main and delta separately vs merge them frequently: separate querying makes updates cheap and costs extra work per query, while frequent merging keeps queries fast and spends build effort.", "Compute full signals before indexing vs index first and enrich later: complete signals are consistent, while early indexing makes content searchable sooner with weaker ranking."],
    p: ["A delta document is scored with default signals and ranks far above or below comparable base documents.", "A replaced document remains visible because the mask was written to one replica only."],
    v: "Change a document and confirm the new version is searchable within the freshness target and the old version no longer appears, and check scores for delta and base documents with equal quality are comparable.",
    dep: ["index-build-pipeline","index-serving-replication","feature-assembly","removals-and-tombstones"]
  },
  "real-time-index": {
    s: "A fast in-memory index that makes breaking and rapidly changing content searchable within seconds to minutes, for topics where hours-old results are failures.",
    d: "A stream pipeline takes documents from fast crawls, feeds and partner publishers, runs a reduced analysis and writes them to an in-memory index partitioned by time. Queries flagged as freshness-sensitive search it alongside the main index, and its results are blended using freshness and source trust. Entries age out into the main index or are dropped. It is hard because less time means fewer signals, so spam and wrong content get through, and because the index is small, memory-resident and must survive restarts.",
    k: ["Trust only vetted publishers vs accept anything fresh: vetted sources are safe and miss unknown reporters, while open intake is complete and attracts manipulation.", "Reduced analysis for speed vs full analysis: reduced analysis meets the latency target, while full analysis gives better ranking later."],
    p: ["A breaking event attracts spam pages that exploit the low-signal path and appear at the top of freshness results.", "A restart loses the in-memory index and the last hour of content disappears until replayed."],
    v: "Publish a test item on a vetted source and confirm it is searchable for a freshness query within the target seconds, then restart a replica and confirm recovery from the log within the stated time.",
    dep: ["stream-compute","incremental-index-updates","freshness-scheduling","intent-classification"]
  },
  "freshness-scheduling": {
    s: "Decides how often each page is recrawled and reindexed by predicting how fast it changes and how much a stale copy would hurt, within a fixed recrawl capacity.",
    d: "A model estimates each page's change rate from past fetches and its importance from authority and query demand. The scheduler assigns recrawl intervals to maximize expected freshness value per fetch, boosting pages tied to current events. Signals flow to the crawler, and updated pages are routed to real-time or incremental paths by priority. It is hard because capacity is fixed, because change detection from sparse samples is noisy, and because importance for freshness changes suddenly with news.",
    k: ["Maximize average freshness vs weight by query demand: average freshness is simple and wastes crawls on unseen pages, while demand weighting focuses effort on what people search.", "Poll by predicted change rate vs rely on push notifications: polling works for any site, while push is timely and available for few publishers."],
    p: ["A page that changes on every fetch only through ads is recrawled constantly and wastes capacity.", "A major event raises demand for pages that were scheduled for monthly recrawl and the index serves old coverage."],
    v: "Track staleness, defined as the age of the indexed copy against the live page, for sampled pages by importance class, and confirm it meets the target for each class while total fetches stay under budget.",
    dep: ["crawler-interface","click-models","link-authority-scoring","real-time-index"]
  },
  "removals-and-tombstones": {
    s: "Removes pages from every copy of the index when they are gone, blocked or ordered removed, by writing tombstones that take effect quickly and persist until builds catch up.",
    d: "A removal request is recorded as a tombstone with a reason and scope. Serving shards apply a deletion filter at once, the document store and caches are purged, and the next builds exclude the document and its derived data, including the raw store and signals. Tombstones are retained until all older index versions are gone. It is hard because many stores hold copies, because speed matters for legal and safety removals, and because a missed copy resurfaces in the next rebuild.",
    k: ["Apply as a query-time filter first vs wait for the next build: a filter acts within minutes and costs a lookup per result, while waiting is free and leaves content live for days.", "Tombstones kept indefinitely vs expired: indefinite retention prevents resurrection and grows without bound, while expiry risks bringing content back from old data."],
    p: ["A removal reaches the index but not the result cache and the page is served for another hour.", "A rebuild from raw data ignores tombstones recorded after the snapshot and the removed page returns."],
    v: "Remove a test page and confirm it disappears from live results, caches and snippets within the target time and stays absent after the next full index build and from a raw-store reprocess.",
    dep: ["index-serving-replication","result-cache","raw-document-store","legal-removals"]
  },
});
