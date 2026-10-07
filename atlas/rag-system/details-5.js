// Details for the retrieval-augmented generation plate, part 5: freshness, storage and serving, cross-cutting concerns.
ATLAS.details("rag-system", {
  "change-detection": {
    s: "Finds which documents were added, modified, moved or deleted in each source since the last sync, using change feeds, timestamps or content hashes.",
    d: "Sources offer different signals: change feeds with cursors, modification times, version numbers, ETags, or nothing but a full listing. The system compares these against its own record of each document's last seen state and emits events: created, updated, moved, deleted. Content hashes confirm real changes, since many touches alter only metadata. Moves are detected to avoid delete and re-add. The difficulty is sources whose signals are unreliable: clocks drift, deletes may not be reported, and a full listing is the only way to notice them.",
    k: ["Change feed vs periodic full comparison: feeds are fast and cheap but can miss events; full comparison is slow but complete, so many systems run both.", "Trust modification time vs hash content: timestamps are cheap, but trigger needless re-embedding or miss edits; hashes are exact, but require fetching the content."],
    p: ["Sources that never report deletions leave removed documents answering questions for months.", "Hashing the raw file triggers re-embedding for edits that changed only formatting or metadata."],
    v: "In a test source, add, edit, rename and delete one document each and confirm the next sync emits exactly four matching events, and that a metadata-only touch emits none that cause re-embedding.",
    dep: ["source-connectors", "metadata-database", "document-versioning"]
  },
  "incremental-reindexing": {
    s: "Updates only the chunks and index entries affected by a change, instead of rebuilding the collection, so new and edited documents become searchable quickly.",
    d: "On a change event the pipeline re-parses the document, re-chunks it, compares new chunks to old by content hash, embeds only new or changed chunks, writes them, and removes obsolete ones in the vector, lexical and metadata indexes together. Writes should be atomic from a query's point of view, or at least ordered so a document is never absent between delete and insert. It must be idempotent and safe to replay. The difficulty is consistency across several stores and the unstable chunk boundaries: one edit may shift every following chunk.",
    k: ["Replace whole document's chunks vs diff chunk by chunk: replacing is simple and consistent, but re-embeds everything; diffing saves cost, but is fooled by shifted boundaries.", "Write new before deleting old vs delete first: new first avoids gaps in search results, but briefly serves duplicates."],
    p: ["A failure between deleting and inserting leaves a document missing from the index until the next full run.", "Index stores updated in different orders briefly disagree, so lexical search finds chunks the vector index lacks."],
    v: "Edit one paragraph of a long document and confirm only the affected chunks are re-embedded, the new text is searchable within the target delay, and the old text never appears in any index.",
    dep: ["change-detection", "document-embedding-jobs", "chunk-store", "vector-index", "inverted-index"]
  },
  "deletion-propagation": {
    s: "Ensures that when a source document is deleted, restricted or expired, every derived copy is removed: chunks, vectors, summaries, caches, graph edges and snapshots.",
    d: "A deletion event triggers removal from the raw store, chunk store, all indexes, entity graph, embedding cache, response cache and generated summaries, with a record of completion per store. Because derived data is spread widely, the pipeline tracks lineage from each document to everything built from it. Legal and privacy requests set time limits. Retained snapshots and logs need a policy too. The difficulty is completeness: one forgotten store or cache means deleted content still answers questions.",
    k: ["Immediate hard delete vs mark deleted and sweep later: immediate hard delete minimizes exposure, but is complex in several stores; marking hides it from queries now and removes physically later.", "Lineage tracking vs search by identifier in each store: lineage is exact, but needs discipline when writing derived data; search is simpler and misses derived data lacking the id."],
    p: ["Summaries or answers generated from the document survive in caches and keep stating its content.", "Restored snapshots bring deleted documents back into the live index."],
    v: "Delete a document with a unique phrase, then search for that phrase across every retrieval path, answer cache and summary, and confirm no trace remains in live stores within the stated deadline.",
    dep: ["change-detection", "chunk-store", "vector-index", "response-cache", "index-snapshots"]
  },
  "document-versioning": {
    s: "Keeps track of each document's successive versions and which one every chunk belongs to, so answers cite the correct version and history can be queried.",
    d: "Each ingestion of a changed document creates a new version record with identifier, timestamp and content hash; chunks reference their version. By default only the current version is searchable, but older versions may be retained for audit or for questions about what a policy said earlier. Citations include the version. Source systems with their own versioning are mapped onto this. The difficulty is deciding what is current when documents carry effective dates, drafts and approval states that differ from file timestamps.",
    k: ["Index only current versions vs all: current-only avoids stale answers and halves the index, but cannot answer historical questions; all versions support history, but require version-aware ranking.", "Version by source revision vs by content hash: source revisions match what users know, while content hashes work everywhere but treat reverts as new versions."],
    p: ["Older versions retrievable by default cause answers that cite superseded rules.", "Draft versions indexed alongside approved ones are cited as official."],
    v: "Update a policy, then ask about its limit and confirm the answer cites the new version; ask what the limit was last year and confirm it retrieves and cites the older version.",
    dep: ["metadata-database", "raw-object-store"]
  },
  "freshness-ranking": {
    s: "Adjusts ranking so recent or currently effective documents are favored where recency matters, without burying older authoritative material on questions where it does not.",
    d: "Signals include modification date, effective and expiry dates, version status and the recency language in the query, such as 'latest' or 'current'. The adjustment may be a score boost with decay, a filter excluding expired documents, or a sort among near-equal results. Query classification decides how much recency counts: news-like questions want recent, legal definitions do not. The difficulty is that modification time is a poor proxy for relevance in time, since trivial edits refresh old documents.",
    k: ["Recency boost with decay vs hard cutoff: decay is gentle and handles uncertainty, but never fully excludes stale items; a cutoff is clear, but can hide a relevant old document.", "Use modification date vs a curated effective date: modification date is always available, but misleading; effective dates are accurate, but need data entry or extraction."],
    p: ["A boost applied to every query pushes a freshly edited unrelated document above the authoritative older one.", "Expired documents remain in results because expiry dates were never extracted."],
    v: "Ask for the 'current' travel limit with versions from three years, and confirm the effective one ranks first; ask a historical question and confirm older documents are not suppressed.",
    dep: ["metadata-enrichment", "attribute-index", "query-classification", "cross-encoder-reranking"]
  },
  "backfill-reembedding": {
    s: "Reprocesses the whole collection, or a large part of it, when the chunking, parsing, enrichment or embedding model changes, without disrupting live search.",
    d: "A new pipeline version writes into a fresh index in the background, reading from the preserved raw documents, so every change is applied consistently. It runs rate-limited to protect live traffic and embedding capacity, checkpoints progress, and tracks documents that changed in the meantime. When complete and evaluated, queries switch to it. Backfills are frequent in young systems, as parsing and chunking improve repeatedly, so reprocessing must be cheap enough to do regularly. Keeping raw originals makes this possible.",
    k: ["Full rebuild into a new index vs rolling in-place update: a rebuild is clean and reversible, but needs double capacity; in place saves capacity, but exposes inconsistent states.", "Rate-limit to protect live traffic vs run at full speed: limiting is safe but slow; full speed finishes sooner, and may degrade interactive queries."],
    p: ["Documents edited during a long backfill are processed with the old pipeline and missing from the new index.", "A backfill that reads from the chunk store instead of raw files cannot apply a parser fix."],
    v: "Change the chunking rules, run a backfill on a copy, and confirm the new index reaches the full document count, includes a document edited mid-run, and scores at least the old index on the test set before switching.",
    dep: ["raw-object-store", "job-orchestrator", "embedding-versioning", "index-snapshots", "document-embedding-jobs"]
  },
  "index-consistency-checks": {
    s: "Periodically compares the source, chunk store, vector index, lexical index and metadata to find missing, orphaned or stale entries, and repairs them.",
    d: "A reconciler lists documents in each source and in each store, and compares counts, identifiers and version hashes. It reports documents missing from an index, entries without a source, chunks whose vectors have the wrong model version, and permissions that differ from the source. Repairs enqueue re-ingestion or deletion. It is the safety net behind event-driven updates, catching what events missed. The difficulty is scale: full comparisons of very large collections need sampling or checksum ranges to finish.",
    k: ["Full comparison vs sampled checks: full is thorough, but slow on large collections; sampling is cheap and finds systemic faults, but can miss rare ones.", "Automatic repair vs report only: automatic repair fixes drift without people, but can propagate a bad source state; report-only is safe, but slow."],
    p: ["A source outage that returns an empty listing makes the reconciler delete everything it sees as orphaned.", "Checking counts only misses entries that exist but hold stale content."],
    v: "Manually delete a vector and add an orphan chunk in a test index, then run the checker and confirm it reports both and that repair restores consistency with the source.",
    dep: ["metadata-database", "chunk-store", "vector-index", "inverted-index", "job-orchestrator"]
  },
  "document-store": {
    s: "The system of record for parsed documents: normalized text, structure, metadata, versions and links to raw files, from which chunks and indexes can be rebuilt.",
    d: "After parsing, each document's normalized content, section tree, location map and metadata are stored, keyed by id and version. It separates parsing from chunking, so changes to chunking rules do not require reparsing, and serves the original text for citation display and neighbor expansion. It is typically a database or object store, with large blobs held outside the rows. The difficulty is size and consistency with the indexes, which are derived and can be rebuilt, while this store must be backed up and kept correct.",
    k: ["Store parsed output vs reparse from raw each time: stored output saves expensive reparsing, but adds a layer to keep consistent; reparsing is simple, but slow for large backfills.", "Relational rows vs document or object storage: rows allow queries and constraints, while object storage handles large content cheaply."],
    p: ["Treating indexes as the only copy makes it impossible to rebuild after corruption or a pipeline change.", "Parsed text stored without its location map breaks citation highlighting after any change."],
    v: "Drop the vector and lexical indexes in a test environment and confirm they can be fully rebuilt from the document store and raw files alone, with identical retrieval results on the test set.",
    dep: ["raw-object-store", "metadata-database"]
  },
  "raw-object-store": {
    s: "Durable storage of the original files exactly as fetched, kept so documents can be reparsed, shown to users, audited and re-ingested after pipeline improvements.",
    d: "Each fetched file is stored immutably under a key with its hash, source, fetch time and version, in cheap, durable object storage with encryption and lifecycle rules. Parsers and backfills read from it. The viewer opens it when a user follows a citation. Retention follows policy, and deletion requests must reach it. The difficulty is cost and governance: it holds the full original content, including material not worth indexing, and so is the most sensitive store in the system.",
    k: ["Keep every fetched version vs latest only: every version supports audit and exact reproduction, but grows storage; latest only saves cost, and loses history.", "Copy files in vs reference them at the source: copying guarantees availability and reproducibility, but duplicates data; referencing avoids copies, and breaks when the source moves or deletes."],
    p: ["Referencing source URLs instead of keeping copies makes citations dead links after a reorganization.", "Broad read access to the raw store bypasses the permission filtering applied at query time."],
    v: "Fetch a document, change it at the source, and confirm both versions are stored and addressable by hash, then delete it through the deletion path and confirm both are removed.",
    dep: ["secrets-and-config"]
  },
  "chunk-store": {
    s: "The store of final chunk text with identifiers, positions, parent links, metadata and version, from which indexes are built and from which prompts get their passages.",
    d: "Each chunk record has an id, the document and version, text, offsets in the source, ordinal position, parent id, section path, language, enrichment fields and permission data. Indexes hold only ids and derived forms and look text up here, so the same text is not stored repeatedly. It must support fetching by id in bulk, neighbors by ordinal, and children by parent, quickly, since each query fetches dozens. The difficulty is keeping it exact with the indexes as chunks are added and removed.",
    k: ["Store text in the index vs only in the chunk store: in the index is convenient, but duplicates data and complicates updates; a separate store keeps one copy, and adds a lookup per query.", "Immutable chunk records with new ids vs updating in place: immutable is simple to reason about and cache, but creates garbage that must be collected."],
    p: ["Ids that change on every re-chunking break saved citations, evaluation labels and feedback links.", "Slow bulk lookups add hundreds of milliseconds to every query when the store is not indexed for ids."],
    v: "Fetch fifty chunk ids from a query in a single bulk request and confirm the latency is within the stage budget, and neighbors by ordinal and children by parent return correct, ordered text.",
    dep: ["metadata-database", "document-store"]
  },
  "metadata-database": {
    s: "A transactional database holding document and chunk metadata, sync state, permissions, versions, job status, conversations, feedback and traces.",
    d: "It keeps the relational facts the pipeline and serving depend on: per-source cursors, per-document state and hashes, access entries, group memberships, embedding versions, evaluation results and logs of requests. Constraints and transactions keep the pipeline's state consistent, which search indexes cannot do. Queries from the admin interface and monitoring read it. The difficulty is load: per-request logging and per-chunk permission rows grow large, so partitioning, retention and separating operational from analytical use become necessary.",
    k: ["One database for everything vs separate for operational state and analytics: one is simple, but analytical scans compete with pipeline writes; separate adds replication but protects the pipeline.", "Normalized permission rows vs denormalized arrays on documents: normalized is flexible and correct, but slow to join per query; arrays are fast, and harder to update."],
    p: ["Request traces kept forever in the same database as pipeline state slow every sync.", "Missing transactions leave a document marked processed though its chunks never reached the index."],
    v: "Kill a worker mid-document in a test run and confirm the document's state remains non-complete, so the next run reprocesses it, and no partial chunk set is visible to queries.",
    dep: []
  },
  "job-orchestrator": {
    s: "Schedules, runs, retries and monitors the pipeline's jobs: fetching, parsing, chunking, embedding, indexing and reconciliation, with dependencies and rate limits between them.",
    d: "Work is expressed as tasks with inputs and outputs, queued, and run by workers that scale with the backlog. The orchestrator enforces ordering, such as parse before chunk before embed, retries transient failures with backoff, sends poison items to a dead-letter queue, and exposes progress. Tasks must be idempotent because retries and duplicate deliveries happen. It also applies priorities, so a permission revocation overtakes a bulk backfill. The difficulty is observability and fairness, since a stuck stage looks like a quiet system.",
    k: ["Event-driven queues vs scheduled batch workflows: queues give low latency and continuous flow, while batch workflows are simpler to reason about and rerun.", "Strict ordering vs parallel independent tasks: ordering preserves consistency, but limits throughput; parallelism is fast, but needs idempotence and conflict handling."],
    p: ["A poison document retried forever blocks its queue or burns capacity without anyone noticing.", "Priorities missing from the queue make an urgent revocation wait behind a million-item backfill."],
    v: "Inject one failing document and one urgent revocation into a loaded queue, and confirm the failure moves to the dead-letter queue after the configured retries and the revocation completes ahead of the backlog.",
    dep: ["metadata-database", "secrets-and-config"]
  },
  "model-serving-gateway": {
    s: "The single access point through which the system calls embedding, re-ranking and language models, applying credentials, rate limits, retries, timeouts, fallbacks and usage accounting.",
    d: "Components call a uniform interface instead of each model provider directly. The gateway holds credentials, enforces per-feature quotas, retries transient errors, fails over to alternative models, batches compatible requests, records tokens and latency per call and applies content and data-handling rules, such as removing identifiers before sending text out. It supports pinning model versions. It is a critical dependency: when it degrades, everything above does, so it needs timeouts, circuit breakers and graceful degradation paths.",
    k: ["Central gateway vs direct calls from each component: a gateway gives one place for limits, logging and policy, but is a shared dependency; direct calls avoid it, and scatter credentials and accounting.", "Automatic failover to another model vs fail clearly: failover keeps service up, but changes behavior silently; failing clearly is honest, and interrupts users."],
    p: ["Silent failover to a model with a different context limit truncates prompts and changes answer behavior.", "Retries without budgets multiply load during a provider outage and extend it."],
    v: "Simulate a provider outage and confirm calls time out within limits, the circuit breaker opens, fallback behavior matches the documented policy, and per-call usage records still reconcile with the provider's invoice.",
    dep: ["secrets-and-config"]
  },
  "secrets-and-config": {
    s: "Holds credentials for sources and model providers, encryption keys and system settings, and delivers them to components with scoped access, rotation and an audit trail.",
    d: "Connector credentials, API keys and encryption keys live in a managed secret store, not in code or configuration files. Components receive only what they need, through short-lived tokens where possible. Configuration such as chunk size, thresholds, model versions and prompt versions is versioned and changed through review, since each setting changes system behavior. Rotation must be routine. The difficulty is that source credentials are powerful: a connector account that can read everything makes the ingestion system a high-value target.",
    k: ["Least-privilege read-only source accounts vs broad service accounts: narrow accounts limit the damage of a leak, but need setup per source; broad accounts are easier and dangerous.", "Configuration in version control vs a live settings service: version control gives review and rollback, while a live service allows instant change with less traceability."],
    p: ["Embedding a key in a prompt, log line or evaluation file leaks it into places with wide access.", "Threshold or prompt changed live without a record makes quality shifts impossible to explain."],
    v: "Rotate a source credential and a model key in a test environment and confirm ingestion and serving continue without redeploy, and that the old credentials are rejected.",
    dep: []
  },
  "freshness-vs-cost": {
    s: "How current answers must be versus what it costs to detect, re-parse, re-embed and re-index changes, which differs by source and by question.",
    d: "Keeping everything minutes-fresh means frequent polling, constant embedding and cache invalidation, which costs compute and can overload sources. Letting everything lag by a day is cheap and wrong for support tickets or incident notes. The decision is per source and sometimes per document type: a freshness target, a mechanism that meets it, and a measurement of actual lag. It shapes the crawler, queues, cache lifetimes, index refresh intervals and whether live federated search is used instead of copying data.",
    k: ["Per-source freshness targets vs one global target: per-source matches cost to need, but needs explicit classification; a single target is simple, and wastes money or misses needs.", "Live queries to the source vs periodic copy: live is always current but slow and dependent; copying is fast and stale between syncs."],
    p: ["A global daily refresh leaves incident or ticket answers hours behind without any alert.", "Frequent refresh of rarely changing archives burns embedding budget with no benefit."],
    v: "Edit a document in each source class and measure time until the change is searchable and answerable, and confirm each class meets its stated target, with lag charted continuously.",
    dep: ["crawl-scheduler", "incremental-reindexing", "response-cache", "change-detection"]
  },
  "permission-propagation": {
    s: "How quickly and how faithfully each document's access rules reach every place its content or derivatives live: indexes, caches, summaries, logs and the prompt.",
    d: "Access control cannot be bolted on at the end. Source permissions must be captured with the content, carried onto every chunk and derived artifact, evaluated on every retrieval path, and updated when sources change, with revocations treated as urgent. Derived products such as summaries, graph edges, cached answers and embeddings of multi-document content mix permissions: a summary of restricted and open documents is itself restricted. The target should be stated as a delay and a failure mode: how long a revoked user may still see content, and whether uncertainty fails closed.",
    k: ["Fail closed vs fail open on unknown permissions: closed protects content, but hides documents when sync lags; open keeps answers available, and risks exposure.", "Filter at retrieval only vs also verify live at answer time: retrieval-only is fast but trusts stored lists; a live check closes the lag window, at an extra call per result."],
    p: ["A derived summary built from mixed-permission documents is served to users who can see only some of them.", "Permission changes handled slowly mean revoked users keep access for days."],
    v: "Take a user through a grant, a revocation and a group change across several sources, and measure the time for each to show in retrieval, caches and summaries, confirming nothing outlives the stated target.",
    dep: ["permission-sync", "query-time-filtering", "response-cache", "hierarchical-summary-index"]
  },
  "quality-latency-cost": {
    s: "The trade-offs among answer quality, response time and spend: every added stage, larger model or bigger candidate list improves one at the expense of the others.",
    d: "Rewriting, hybrid search, re-ranking, multi-step retrieval, verification and larger models each add accuracy and each add time and cost. A budget per request, set by use case, decides which stages run, perhaps conditionally by query difficulty. Interactive chat may allow two seconds to first token; batch research may allow minutes. Measurements of the marginal quality per added second and per added unit of cost guide what to keep. Without explicit budgets, systems grow stages until they are too slow and expensive to operate.",
    k: ["Run all stages on every query vs conditional stages by difficulty: all is simple and uniformly good, but costly; conditional saves money, and depends on difficulty estimates that can be wrong.", "Optimize median latency vs the slowest percentile: the median reflects typical use, while the tail determines timeouts and reputation."],
    p: ["Stages added one at a time, each justified alone, together push latency beyond what users tolerate.", "Quality measured on easy questions justifies a cheap path that fails the hard ones."],
    v: "For each pipeline configuration, record quality metrics, p50 and p95 latency and cost per thousand requests on the same test set, and confirm the production choice lies on the efficient frontier.",
    dep: ["cost-latency-tracking", "model-routing", "cross-encoder-reranking", "multi-step-retrieval"]
  },
  "reproducibility-and-versioning": {
    s: "The ability to explain and reproduce any past answer by knowing exactly which documents, chunking, models, prompts and settings produced it.",
    d: "An answer depends on the content and version of documents, parsing and chunking versions, embedding model, index state, retriever settings, prompt template, model version and generation parameters. Each must be versioned and recorded in the request trace so the same inputs can be replayed against a retained snapshot. Without this, quality regressions cannot be bisected and incidents cannot be investigated. Models served by third parties may change underneath, so pinning and recording versions matters. Exact repeatability is limited by sampling, but traceability is not.",
    k: ["Retain full snapshots for replay vs record versions only: snapshots enable exact replay, but cost storage and conflict with deletion duties; versions allow approximate reproduction at far lower cost.", "Pin model versions vs follow the latest: pinning gives stability and comparability, but needs planned upgrades; following gets improvements and surprise changes."],
    p: ["Unrecorded configuration changes make a regression a mystery that no one can bisect.", "A provider updates an unpinned model and answer behavior shifts overnight."],
    v: "Pick an answer from last month, replay its trace against the recorded snapshot, template and model version, and confirm retrieved passages match exactly and the answer matches within sampling variation.",
    dep: ["index-snapshots", "prompt-templates", "embedding-versioning", "document-versioning"]
  },
  "privacy-and-data-residency": {
    s: "Where documents, queries and answers may be stored and processed, and what personal or regulated data may be sent to external model providers.",
    d: "Documents often contain personal, contractual or regulated data, and queries reveal intent. Decisions include which regions hold the stores and the models, whether text may leave the organization's boundary for hosted models, what is logged and for how long, how deletion requests reach derived data, and how tenants are separated. Self-hosted models avoid sending text out, at operating cost. Providers' retention and training terms must be checked. Each choice limits other options, such as which embedding service can be used for which sources.",
    k: ["Hosted models with data controls vs self-hosted models: hosted gives quality and less operations, but exposes content to a third party; self-hosted keeps data in, at higher cost and typically lower model quality.", "Log full text vs minimal: full text speeds debugging, but multiplies copies of sensitive data; minimal is safer, and slows diagnosis."],
    p: ["Embedding calls to an external provider send restricted text outside the allowed region without anyone noticing.", "Deletion requests cover the store but miss vectors, logs and evaluation sets."],
    v: "Trace one document containing test sensitive data through every stage and store, listing each location and region, and confirm each is permitted by policy and removed by a deletion request.",
    dep: ["redaction-and-pii", "model-serving-gateway", "deletion-propagation", "tenant-isolation"]
  },
  "evaluation-driven-change": {
    s: "The practice of changing any component only when measured on test sets and live signals, so improvements are shown rather than assumed and regressions are caught before users see them.",
    d: "Every tunable piece, from chunk size to prompt wording to re-ranker choice, interacts with the rest, and intuition about which change helps is often wrong. The system keeps stage-level retrieval metrics and answer-level quality measures, runs them on each proposed change against a fixed snapshot, and feeds production failures back into the test sets. Teams decide thresholds in advance. It requires investment in labeled data and tooling early, before there are obvious problems, and discipline to keep the sets current as the collection and the users change.",
    k: ["Invest in evaluation before tuning vs tune by inspection first: early evaluation prevents wasted work and wrong conclusions, but delays visible progress; inspection is fast, and misleads easily.", "Offline test sets vs online experiments: offline is fast and repeatable, but unrepresentative; online reflects real users, and needs traffic and time."],
    p: ["Tuning on a small fixed set until it scores well produces a system that fails on new questions.", "Evaluation sets never refreshed from production failures drift away from what users actually ask."],
    v: "Make a deliberate change known to help and one known to hurt, and confirm the evaluation harness reports the first as an improvement and the second as a regression, with the affected query slices identified.",
    dep: ["regression-gates", "retrieval-test-sets", "failure-triage", "online-monitoring"]
  },
});
