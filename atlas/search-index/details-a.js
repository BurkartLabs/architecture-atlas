// Details for the full-text search index plate, part 1: interface, results, distribution.
ATLAS.details("search-index", {
  "search-api": {
    s: "The request endpoint that accepts a query, paging, sorting and result-shaping options, fans it out over the target indexes and returns hits plus aggregations in one response.",
    d: "A search request names one or more indexes or aliases, a query, a page size and offset, optional sort, highlight, aggregation and field-selection sections, and a timeout. The receiving node validates it, resolves names to shards, runs the distributed query and merges the answers. The response carries total hit counts, scores, requested fields and per-shard success counts. It is hard because the request is a small program: any section can be expensive, and partial failure must be reported rather than hidden.",
    k: ["Structured request body vs. query-string parameters: bodies express nested queries and aggregations precisely, but cannot be bookmarked or cached by simple HTTP intermediaries.", "Partial results on shard failure vs. failing the whole request: partial answers keep search available, but callers must read the failure counts or silently receive incomplete data."],
    p: ["Clients ignore the shard-failure section and treat a response built from half the shards as complete.", "Requesting exact total hit counts on every query forces full matching and defeats early termination."],
    v: "Send one query to an index with three shards while one shard is offline. Confirm the response lists the failed shard, returns hits from the other two, and the total reflects only searched shards.",
    dep: ["query-dsl", "coordinating-node", "request-limits"]
  },
  "ingest-api": {
    s: "Endpoints that add, replace or delete documents singly or in batches, returning a per-document result so callers can retry only what failed.",
    d: "A single-document call names an index and optional identifier. A bulk call carries many actions in one request, which amortizes network and per-request overhead and lets the server group work by shard. Each action succeeds or fails independently and appears in the response with its version and result. The server assigns an identifier when none is given. The difficulty is backpressure: a client that sends batches faster than segments can be flushed and merged sees queue rejections, and an oversized batch can pressure memory on the coordinator.",
    k: ["Large bulk batches vs. small ones: large batches raise throughput, but increase memory pressure and the size of what must be retried after a failure.", "Server-generated vs. client-supplied identifiers: generated ids skip the existence check and index faster, but make idempotent retries and updates by key impossible."],
    p: ["A bulk response with HTTP 200 still contains item-level failures that callers never inspect.", "Retrying a whole batch after a timeout duplicates documents when ids were server-generated."],
    v: "Send a bulk of one hundred actions with five malformed documents. Confirm the response flags exactly those five items, the other ninety-five are searchable after refresh, and the count matches.",
    dep: ["shard-routing", "indexing-buffer", "document-model"]
  },
  "query-dsl": {
    s: "A structured, nested JSON-style language for describing queries as trees of typed clauses, which separates intent from the textual syntax of any single parser.",
    d: "Each clause names a query type and its parameters: a match on a field, a range, a boolean combination of sub-clauses, a geo shape, a vector search. The tree is parsed into an internal query object tree and later compiled per shard into index iterators. Because it is structured, programs can build and modify queries without string escaping, and each clause carries its own boost and options. The hard part is the surface area: many clause types interact, and subtle differences between analyzed and exact clauses cause surprising results.",
    k: ["Structured tree vs. a single text syntax: trees are unambiguous and composable by programs, but verbose to hand-write and harder for end users to type.", "Many specialized clause types vs. few general ones: specialized clauses optimize well, but the learning curve and the number of ways to express one intent grow."],
    p: ["An exact-match clause applied to an analyzed field matches nothing because the stored term was lowercased.", "Deeply nested boolean trees built by code explode into thousands of clauses and hit clause limits."],
    v: "Express the same intent as a match clause and as an equivalent boolean of term clauses. Confirm both return the same documents, and that the explain output shows the same underlying term queries.",
    dep: ["query-parser", "boolean-query", "term-query"]
  },
  "query-parser": {
    s: "Turns user-typed text such as quoted phrases, plus and minus operators and field prefixes into the internal query tree, applying the field's analyzer to each piece.",
    d: "A grammar recognizes terms, quoted phrases, required and prohibited markers, grouping, field qualifiers, wildcards, fuzziness suffixes and boosts. Each text fragment is passed through the field's search analyzer, which may yield several tokens that become a phrase, a boolean of terms or a synonym group. A lenient mode ignores type errors on individual fields. The difficulty is that user input is hostile to grammars: unbalanced quotes, stray operators and reserved characters must degrade gracefully instead of raising errors on a search box.",
    k: ["Strict grammar with errors vs. a lenient parser that always produces something: strict catches mistakes in programmatic use, but errors on a public search box lose users.", "Default operator OR vs. AND: OR maximizes recall and ranks the best first, while AND gives predictable precision but returns nothing for long queries."],
    p: ["Passing raw user input into the full syntax lets users trigger expensive wildcard or regex queries.", "A single apostrophe or unmatched bracket causes a parse error and an empty page."],
    v: "Submit unbalanced quotes, a lone minus sign and a leading wildcard to a public search box. Confirm each returns a result page or controlled message, never a server error, and the leading wildcard is rejected or limited.",
    dep: ["analyzer-chain", "query-dsl"]
  },
  "query-rewriting": {
    s: "Transforms a parsed query into a cheaper or more effective equivalent before execution: expanding terms, flattening nesting, replacing multi-term queries and substituting constant-score forms.",
    d: "Rewriting runs per shard, because the term dictionary differs. A prefix or wildcard query is expanded into the set of matching terms, then into a boolean or a bitset. Nested booleans are flattened, redundant clauses removed, and queries that match nothing are replaced by an empty query. Application-level rewriting adds spelling correction, synonym expansion and intent rules. The difficulty is correctness and explosion: expanding a broad pattern can yield thousands of terms, and a rewrite that changes scoring changes ranking.",
    k: ["Expanding multi-term queries into term lists vs. automaton-driven iteration: expansion is simple and cacheable, but caps and memory limits apply for broad patterns.", "Rewriting in the application vs. in the engine: application rules are easy to change and test, but cannot use per-shard term statistics."],
    p: ["A single-character prefix expands to a large share of the dictionary and exceeds the clause limit.", "A rewrite that silently drops a clause changes recall for a class of queries nobody checks."],
    v: "Run a prefix query on a field with known term counts and read the profile output. Confirm it reports the rewritten form and the number of terms it expanded to on each shard.",
    dep: ["query-dsl", "term-dictionary", "boolean-query"]
  },
  "pagination": {
    s: "Mechanisms for reading beyond the first page of results: offset and size, search-after cursors on sort values, and scroll or point-in-time snapshots for exports.",
    d: "Offset paging asks each shard for offset plus size candidates and discards most at the coordinator, so cost grows with depth. A search-after cursor passes the last hit's sort values, so every shard skips directly past them at constant cost. A point-in-time handle pins a set of segments so consecutive pages see one consistent view while writes continue. A hard cap on offset protects the cluster. The challenge is consistency: without a pinned view, documents indexed between page requests shift results and cause duplicates or gaps.",
    k: ["Offset paging vs. cursor paging: offsets allow jumping to page N and are simple, but cost rises with depth and results shift with writes; cursors are cheap but sequential.", "Pinned point-in-time views vs. live views: pinning gives consistent exports, but holds old segments on disk and delays their deletion."],
    p: ["Allowing arbitrary deep offsets lets one request pull millions of candidates from every shard into memory.", "A forgotten point-in-time handle keeps merged-away segments on disk until it expires, filling the volume."],
    v: "Page through ten thousand hits with a cursor while another process indexes new documents. Confirm every original hit appears exactly once and the memory cost of the last page equals that of the first.",
    dep: ["sorting", "segment-readers", "top-k-collection"]
  },
  "request-limits": {
    s: "Protective limits on a request's time, memory, clause count and result size, enforced during execution so one expensive query cannot starve the cluster.",
    d: "A timeout is checked cooperatively as collectors advance, and the shard returns what it has with a flag. Circuit breakers estimate memory for aggregations, field data and in-flight requests, and reject work before the process runs out. Limits also cap boolean clause counts, regex complexity, result window size and aggregation bucket counts. Thread pools with bounded queues reject excess load with a retryable error. The difficulty is estimation: breakers use approximate accounting, so they trip late or early, and timeouts cannot interrupt a single long non-checking operation.",
    k: ["Soft timeouts returning partial results vs. hard cancellation: partial results keep latency bounded and still useful, but callers must handle truncated output.", "Rejecting at queue limits vs. queuing unboundedly: rejection sheds load early and keeps latency predictable, but surfaces errors to clients that must retry with backoff."],
    p: ["A timeout that is only checked between segments never fires on one huge segment.", "A breaker threshold set too close to the process limit trips after memory pressure already causes stalls."],
    v: "Run a deliberately expensive aggregation with a 100 ms timeout. Confirm the response arrives near that time with a timed-out flag, and that a followup normal query is not slowed.",
    dep: ["search-api", "metric-aggregations", "bucket-aggregations"]
  },
  "sorting": {
    s: "Ordering hits by field values, distance or script instead of relevance score, using columnar per-document values and tie-breakers for stable order.",
    d: "Each shard keeps a priority queue ordered by the sort keys, reading values for matching documents from columnar doc values rather than from stored fields. Multiple keys apply in order, and a missing-value policy places documents lacking a value first or last. A final tiebreak on an internal document identifier or a unique field makes order stable for cursor paging. Text fields cannot be sorted directly because they hold many terms, so a separate un-tokenized or normalized copy is used. The hard part is cost: sorting disables score-based pruning unless the index is pre-sorted.",
    k: ["Sort on doc values vs. on analyzed text: doc values are fast and exact, but need an extra single-valued field; analyzed text has many terms per document.", "Index-time sort order vs. query-time sort: pre-sorting lets queries stop early on the sort key, but slows indexing and fixes one order per index."],
    p: ["Sorting on a field with no stable tiebreaker makes cursor paging skip or repeat documents.", "Sorting by a multi-valued field picks min or max implicitly and surprises users."],
    v: "Sort one thousand products by price with identical prices present. Confirm the order is the same on repeated requests and across a cursor walk, with documents lacking a price at the declared end.",
    dep: ["doc-values", "top-k-collection", "index-sorting"]
  },
  "highlighting": {
    s: "Marks and extracts the passages of a matched field that contain the query terms, so result pages can show why a document matched.",
    d: "A highlighter takes the document's field text, the analyzed query terms and a fragment size. It finds match locations either by re-analyzing the text, by reading stored offsets from the postings, or from term vectors. It scores fragments, selects the best few, and wraps matched terms in markers. Phrase queries should highlight only complete phrases, not each word. The difficulty is cost: re-analysis on long text is slow, offsets bloat the index, and highlighting must run only on the final page of hits rather than all candidates.",
    k: ["Re-analyzing text vs. stored offsets: re-analysis needs no extra index space, but costs CPU per hit; offsets make highlighting fast at the price of a larger index.", "Highlighting from the stored source vs. from a dedicated field: reading source is convenient, but forces loading and decompressing whole documents."],
    p: ["Highlighting a field with a different analyzer than the query used marks the wrong words or none.", "Highlighting very large documents makes pages slow, and the cost grows with page size."],
    v: "Query for a two-word phrase on a long document. Confirm the response contains a fragment with the whole phrase marked, no fragment marking only one word separately, and latency stays within the page budget.",
    dep: ["offsets", "stored-fields", "analyzer-chain", "term-vectors"]
  },
  "bucket-aggregations": {
    s: "Groups matching documents into buckets by term, numeric range, date interval or geographic cell, giving the counts used for facets and drill-down navigation.",
    d: "While collecting matches, each document's value from columnar doc values is mapped to a bucket and a counter incremented. Term buckets on a high-cardinality field use per-segment ordinals, translated to global ordinals so counts merge across segments. Sub-aggregations nest inside buckets. In a cluster each shard returns its top buckets and the coordinator merges them. The difficulty is accuracy and memory: top-N per shard can miss a term that is big overall but never in any shard's top, and high-cardinality grouping consumes memory proportional to distinct values.",
    k: ["Per-shard top-N then merge vs. exact global counts: top-N is cheap and nearly accurate, but counts can be off and rare terms missing; exact needs more candidates from each shard.", "Global ordinals vs. string comparison: ordinals make counting fast on arrays, but must be rebuilt on refresh after the data changes."],
    p: ["Faceting on a field with millions of unique values exhausts memory and trips a breaker.", "Facet counts shown to users differ slightly between reloads because of shard-level approximation."],
    v: "Facet a category field over an index of known composition, then compare each bucket count with a filtered count query for that category. Confirm they match, or report the documented error bound.",
    dep: ["doc-values", "scatter-gather", "filter-context"]
  },
  "metric-aggregations": {
    s: "Computes statistics over matching documents: counts, sums, averages, minimums, maximums, percentiles and distinct counts, from columnar values rather than stored fields.",
    d: "Each shard streams doc values of matching documents into an accumulator and returns partial state, such as sum and count for an average. The coordinator combines the states. Multi-level pipelines compute derivatives or moving averages over bucketed results. Percentiles and cardinality use mergeable summaries instead of exact lists. The hard part is that partial state must be mergeable: a mean of means is wrong, and exact distinct counts cannot be merged without shipping every value, which is why sketches are used.",
    k: ["Exact metrics vs. mergeable approximations: exact needs all values at one place, whereas sketches merge cheaply with a bounded relative error.", "Computing at query time vs. precomputing rollups: query time always reflects current data, but scanning is costly; rollups are fast but fix the dimensions chosen."],
    p: ["Averaging the per-shard averages weights shards equally and gives the wrong answer.", "Metrics over a field mapped without doc values fail or fall back to loading text into heap memory."],
    v: "Compute average, sum and ninety-fifth percentile on a dataset with a known distribution across several shards. Confirm sum and average are exact and the percentile lies within its documented error.",
    dep: ["doc-values", "approximate-aggregations", "scatter-gather"]
  },
  "approximate-aggregations": {
    s: "Probabilistic summaries, such as cardinality and quantile sketches, that give bounded-error answers using fixed memory and merge across shards.",
    d: "A distinct-count sketch hashes each value and keeps compact register state, from which cardinality is estimated with a known relative error. A quantile sketch keeps clustered centroids, more precise at the tails. Both serialize to a small fixed size, are sent from each shard and merged at the coordinator regardless of input size. Precision parameters trade memory for accuracy. The difficulty is explaining the error: results look exact, but small cardinalities and unusual distributions behave differently, and merging sketches built with different settings is invalid.",
    k: ["Fixed memory with error vs. exact counting: sketches never run out of memory and merge cleanly, but cannot answer when the error matters, such as billing.", "Higher precision setting vs. lower: more registers shrink error, but multiply per-bucket memory when nested under many buckets."],
    p: ["Using an approximate distinct count as an exact figure in a report that is later audited.", "Nesting a high-precision sketch under a large number of buckets multiplies memory unexpectedly."],
    v: "Count distinct values on a field with a known ten million unique values. Confirm the estimate is within the documented error and the shard responses stay the same small size regardless of data volume.",
    dep: ["metric-aggregations", "doc-values"]
  },
  "term-suggester": {
    s: "Proposes corrections for misspelled query words by finding dictionary terms within a small edit distance and ranking them by frequency.",
    d: "For each query term not found in the index, the suggester walks the term dictionary with an edit-distance automaton to collect candidates within one or two edits, then ranks them by document frequency and similarity. A phrase-level variant scores whole-query corrections with a language model built from word sequences, so it does not correct each word in isolation. The result feeds a did-you-mean line or an automatic retry. The challenge is precision: suggesting corrections for valid rare words or proper names annoys users more than a miss.",
    k: ["Word-by-word suggestion vs. phrase-level correction: per-word is cheap and fast, but ignores context; phrase-level uses word sequences and is more accurate but needs extra index data.", "Suggest only on zero results vs. always: limiting avoids noise, but misses cases where a misspelling matches an unrelated rare document."],
    p: ["Correcting product codes or names toward common words makes valid searches return the wrong thing.", "Candidates drawn from a dictionary polluted with misspellings suggest other misspellings."],
    v: "Submit twenty known misspellings plus twenty correct rare words. Confirm at least most misspellings get the right correction, and none of the correct rare words are changed.",
    dep: ["fuzzy-query", "term-dictionary", "fst-term-index"]
  },
  "completion-suggester": {
    s: "Serves as-you-type suggestions from an in-memory prefix automaton built at index time, returning ranked completions in a few milliseconds.",
    d: "Suggestion inputs and weights are indexed into a finite-state structure per segment that supports ordered lookups by prefix, optionally filtered by context such as category or location. Queries walk the automaton and return the highest-weighted entries. Fuzzy prefix matching tolerates typos in the first characters. Because the structure is loaded into memory and merged with segments, updates appear after refresh. The difficulty is relevance and freshness: static weights ignore trends, and deleted documents may linger as suggestions until segments are merged.",
    k: ["Dedicated automaton vs. edge n-grams on a normal field: the automaton is smaller and much faster, but supports only prefix, whereas n-grams match anywhere in the text.", "Static weights vs. weights from query logs: logs reflect real demand, but need a pipeline and can amplify popular queries into a feedback loop."],
    p: ["Suggestions for documents that were deleted or unpublished continue to appear until segments merge.", "Suggestion structures held in memory grow with entries and compete with the page cache."],
    v: "Type each character of a known title into the box. Confirm the full title appears by the third character, p99 latency stays under twenty milliseconds, and a deleted item disappears after refresh and merge.",
    dep: ["fst-term-index", "immutable-segments", "analyzer-chain"]
  },
  "reranking": {
    s: "Reorders the top few hundred candidates with a more expensive model after the cheap first-stage retrieval has already narrowed the field.",
    d: "First-stage retrieval, lexical or vector, returns a candidate window per shard that the coordinator merges. A second stage then scores each candidate with an expensive function: a learned model over many features, or a cross-encoder reading the query and document together. It reorders only the window, so cost is proportional to window size, not corpus size. Features may include text scores, freshness, popularity and click signals. The difficulty is the ceiling: reranking cannot recover a relevant document the first stage missed, and a slow model must stay inside the latency budget.",
    k: ["Rerank a small window vs. a large one: small windows are fast, but cap recall; large windows find more, but cost latency linearly.", "Rerank in the engine vs. in the application: in-engine reuses fetched fields and avoids a hop, but ties model deployment to the search cluster."],
    p: ["Training the reranker on clicks from the old ranking reinforces whatever the old ranking already showed.", "A candidate window smaller than the page depth makes deep pages inconsistent."],
    v: "Compare an offline judged query set with and without the reranker at a fixed window size. Confirm the quality metric improves, p99 latency stays within budget, and no query returns fewer than the page size.",
    dep: ["top-k-collection", "relevance-evaluation", "hybrid-scoring"]
  },
  "explain-and-profile": {
    s: "Diagnostic output showing how one document's score was computed, and how much time each part of a query spent in each shard.",
    d: "An explain call returns the tree of score components for one document: per-term weights, term frequency, document frequency, length normalization and boosts, and how they combined. A profile option records, per shard and per clause, the time spent in creating iterators, advancing, matching and scoring, plus collector times. Together they answer why a document ranked where it did and which clause makes a query slow. The difficulty is overhead and interpretation: profiling slows queries, and the numbers show cost inside one shard, not network or queue time.",
    k: ["Always-on profiling vs. on-demand: on-demand has no cost in production, but a slow query seen by a user cannot be inspected after the fact.", "Explaining one document vs. whole result lists: single explains are cheap, but cannot show why a missing document was not returned without checking it separately."],
    p: ["Profiling in production on every request adds measurable latency and hides the problem it was meant to find.", "Reading explain output from one replica assuming other shards have the same statistics ignores per-shard idf differences."],
    v: "Run a slow query with profiling and read the per-clause timings. Remove the most expensive clause and confirm total latency drops by about the amount profiling attributed to it.",
    dep: ["bm25-scoring", "query-iterators", "search-api"]
  },
  "coordinating-node": {
    s: "The node that receives a client request, works out which shards to ask, sends the work to them and assembles the single response.",
    d: "Any node can coordinate. It resolves index names and aliases through the cluster state, picks one copy of each target shard, sends shard-level requests, then merges per-shard top-k lists and aggregation states into the final answer. For writes it routes each document to its primary shard. Dedicated coordinating nodes hold no data and absorb merge cost. The difficulty is that it is a fan-in point: the merge uses memory proportional to shards times page depth, and one slow shard delays every response.",
    k: ["Any data node coordinates vs. dedicated coordinators: simple operation and no extra hosts, but heavy merges compete with shard work; dedicated nodes isolate cost at the price of more machines.", "Waiting for all shards vs. responding after a deadline: waiting returns complete results, but latency becomes that of the slowest shard."],
    p: ["Clients all connect to a single node, which becomes the merge and memory bottleneck for the cluster.", "Requests spanning hundreds of shards use large coordinator memory for response merging."],
    v: "Send queries to every node of a cluster in turn. Confirm identical results from each, and that a node with no data shards still answers correctly and shows the merge work in its own stats.",
    dep: ["scatter-gather", "cluster-state", "shard-routing", "request-limits"]
  },
  "scatter-gather": {
    s: "Sends the same query to one copy of every relevant shard in parallel, then merges the partial results into one globally ordered answer.",
    d: "The coordinator issues parallel shard requests. Each shard runs the query on its own segments and returns a top-k list plus partial aggregation state. The coordinator merge-sorts the lists, combines aggregation states and applies the global page offset. Shards that fail or time out are recorded, and the rest of the response is still returned. Latency is the maximum across shards, so tail latency compounds with shard count. Each shard must return offset plus size candidates to guarantee a correct global order.",
    k: ["Fewer, larger shards vs. many small shards: fewer shards cut fan-out and merge cost, but limit parallelism within an index and slow recovery of a single shard.", "Hedged requests to a second copy vs. single attempt: hedging cuts tail latency, but multiplies load on the cluster."],
    p: ["Fan-out to hundreds of shards makes p99 latency follow the slowest shard on any query.", "A page deep into the results forces every shard to return many candidates only to be discarded."],
    v: "Time the same query on an index with one shard and with twenty shards holding the same data. Confirm results are identical in order, and that latency matches the slowest shard in the profile.",
    dep: ["query-then-fetch", "shard-routing", "top-k-collection"]
  },
  "query-then-fetch": {
    s: "The two-phase search protocol: first collect only identifiers and sort keys from every shard, then fetch full documents just for the final page.",
    d: "In the query phase each shard returns document identifiers with scores or sort values, not content. The coordinator picks the global top results for the requested page. In the fetch phase it asks only the shards owning those documents for stored fields, source and highlights. This keeps the network and decompression cost proportional to page size, not shards times page size. It requires that shards keep a consistent view between the phases, which a held reader provides. The difficulty is the second round trip and the case where a document changes between the phases.",
    k: ["Two phases vs. returning documents in the first pass: two phases move far less data for deep or wide pages, but add a network round trip to every request.", "Holding the reader between phases vs. reacquiring: holding keeps the same hits, but pins segments for the duration of the request."],
    p: ["Fetching more fields than needed makes the fetch phase dominate latency for large documents.", "A shard copy that fails between phases forces a retry or a missing hit on the page."],
    v: "Trace a request with page size ten across five shards. Confirm the query phase returns identifiers only, the fetch phase touches only shards owning the ten hits, and total bytes fetched match ten documents.",
    dep: ["scatter-gather", "segment-readers", "stored-fields"]
  },
  "shard-routing": {
    s: "The rule that decides which shard owns a document, usually a hash of the routing key modulo the shard count, so reads and writes find it without a lookup table.",
    d: "By default the routing key is the document identifier. The hash picks one of a fixed number of primary shards, so a get by id goes to exactly one shard. A custom routing value, such as a tenant id, sends related documents to one shard, letting queries touch only that shard. The shard count is fixed at creation because changing it moves every document; resizing creates a new index. The difficulty is skew: a hot routing key creates an oversized shard, and the fixed shard count constrains future scaling.",
    k: ["Hash by id vs. custom routing key: id hashing spreads load evenly, but queries must fan out to all shards; custom routing localizes queries but risks hot shards.", "Fixed shard count vs. consistent hashing with splits: a fixed count makes routing a pure function, but requires choosing correctly up front or reindexing."],
    p: ["A single large tenant routed to one shard grows far beyond the others and cannot be split in place.", "Changing routing values on update leaves the old copy on one shard and a new copy on another."],
    v: "Index ten thousand documents with the tenant as routing key. Confirm a routed query touches one shard, returns all tenant documents, and the same unrouted query touches every shard.",
    dep: ["cluster-state", "coordinating-node"]
  },
  "distributed-term-stats": {
    s: "Optionally gathers document and term frequencies from all shards before scoring, so the same term gets the same weight everywhere instead of a per-shard value.",
    d: "BM25 weights depend on how rare a term is, which each shard computes from only its own documents. With balanced data these local statistics are close, but with small or skewed shards the same query scores differently in different shards, and merged rankings are unfair. A pre-phase asks every shard for its statistics, the coordinator sums them and sends global values with the query. It adds a round trip. The difficulty is the trade: global statistics fix skew only when it matters, and with large shards they cost latency for no visible gain.",
    k: ["Local per-shard statistics vs. a global pre-phase: local is faster and adequate for large balanced shards, but misranks on small or skewed ones; global is consistent at the cost of latency.", "Computing statistics per query vs. caching them: caching removes the extra round trip, but allows stale values after large changes."],
    p: ["Tests on a one-shard index look right, and the ranking differs only when production data is spread over shards.", "Deleted documents still count toward statistics until segments merge, nudging scores."],
    v: "Index identical documents unevenly across two shards. Confirm that with local statistics the same document scores differently by shard, and with the global pre-phase the scores become equal.",
    dep: ["bm25-scoring", "scatter-gather", "norms"]
  },
  "cluster-state": {
    s: "The versioned, cluster-wide record of nodes, index settings, mappings and shard locations that every node holds and the elected master changes.",
    d: "It holds node membership, index metadata, mappings, aliases and the routing table mapping each shard copy to a node and state. Only the master modifies it, publishing each new version to all nodes, which apply it and acknowledge. Nodes use it to route requests without asking anyone. Large mappings and many indexes make it big, and publishing it becomes slower. To stay small, diffs are sent instead of full copies. The danger is that every mapping change goes through one serial update path, and a bloated state slows the whole cluster.",
    k: ["Replicated state on every node vs. a central lookup service: local copies make routing fast and survive master loss, but every change must be pushed to all nodes.", "Publishing diffs vs. full state: diffs save bandwidth, but a node that missed versions needs a full resend to catch up."],
    p: ["Thousands of tiny indexes or fields inflate the state, so every update is slow and nodes run out of memory.", "A mapping update storm from dynamic fields queues behind itself on the master."],
    v: "Add a node and an index, then read the state version on every node. Confirm all nodes show the same version and routing table within seconds, and requests sent to any of them reach the right shards.",
    dep: ["master-election", "node-roles"]
  },
  "master-election": {
    s: "The consensus procedure by which master-eligible nodes agree on one leader, requiring a majority vote so a partitioned minority can never accept changes.",
    d: "Master-eligible nodes keep a persisted term and last accepted cluster state. When the master is lost, a node starts an election, requests votes, and wins with a majority of the voting configuration, which adjusts as nodes join or leave. The master then publishes states in two phases: a majority accepts, then commit. A minority side cannot elect or commit, so there is never a split brain. The challenge is sizing: an even number of master-eligible nodes gains nothing, and losing a majority halts all metadata changes, though searches on existing shards continue.",
    k: ["Majority quorum vs. any-single-node master: quorum prevents conflicting state under partitions, but halts changes when a majority is lost; single master is simple and unsafe.", "Dedicated master nodes vs. shared with data: dedicated nodes keep elections stable under load, but add three more machines to run."],
    p: ["Two master-eligible nodes in two zones means losing either one blocks the other from forming a majority.", "Master nodes under heavy garbage collection or I/O miss heartbeats and trigger repeated elections."],
    v: "Stop the master node and time the election. Confirm a new master appears within seconds, state version continues rising, and isolating a minority of masters stops their writes.",
    dep: ["node-roles", "cluster-state"]
  },
  "node-roles": {
    s: "Specialization of nodes into master-eligible, data, ingest, coordinating and tiered roles, so each kind of work runs on suitably sized hardware.",
    d: "A node's roles are set in configuration. Master-eligible nodes hold cluster state and vote. Data nodes hold shards and do the search and indexing work, possibly specialized by hot, warm or cold tier. Ingest nodes run document-transforming pipelines. Coordinating nodes have no other role and merge results. Roles can be combined on small clusters and separated on large ones so that heavy queries cannot starve election heartbeats. The difficulty is capacity planning: each role has a different bottleneck, whether memory, disk or CPU, and mistakes appear only under load.",
    k: ["Combined roles vs. separated roles: combining minimizes machines for small clusters, but a busy data node can delay the master heartbeats that keep the cluster stable.", "Few large nodes vs. many small nodes: fewer nodes simplify operations, but increase the blast radius and recovery time when one fails."],
    p: ["Putting ingest pipelines on data nodes lets heavy transformations steal CPU from searches.", "Fewer than three master-eligible nodes leaves a production cluster one failure from losing metadata changes."],
    v: "List nodes with their roles and stop one of each kind in a test cluster. Confirm search stays available when a coordinating or ingest node dies, and only a majority loss of masters blocks changes.",
    dep: ["cluster-state"]
  },
  "shard-allocation": {
    s: "Decides which node hosts each shard copy, balancing count and size, keeping primaries and replicas apart, honoring zones and disk limits, and moving shards as the cluster changes.",
    d: "The allocator, running on the master, evaluates each unassigned or movable shard against a chain of deciders: never place a replica on its primary's node, respect rack or zone awareness, disk watermarks, tier rules and per-node limits. A balancer then scores layouts by shard count and disk use and relocates shards, throttled to limit recovery traffic. Delayed allocation waits briefly after a node leaves in case it returns. The difficulty is stability: aggressive rebalancing floods the network, and a full disk blocks allocation cluster-wide.",
    k: ["Rebalancing aggressively vs. lazily: aggressive evens load quickly, but consumes network and disk copying shards; lazy tolerates imbalance and saves I/O.", "Immediate re-replication vs. a delay after node loss: immediate restores redundancy fast, but wastes work when the node returns after a brief restart."],
    p: ["A node crossing the disk watermark stops receiving shards, and cascading relocations fill the others.", "Zone awareness with unequal nodes per zone leaves replicas unassignable after a failure."],
    v: "Fill a node's disk past the high watermark. Confirm the allocator moves shards off it, new shards avoid it, and when the disk is freed the balance recovers without manual commands.",
    dep: ["cluster-state", "node-roles", "replica-recovery"]
  },
  "replication-protocol": {
    s: "Writes go to the primary shard first, which assigns sequence numbers and forwards the operation to every in-sync replica before acknowledging success.",
    d: "The primary validates and applies an operation, assigns a sequence number, and sends it to replicas in the in-sync set. Each replica applies it to its own index and translog and replies. The primary tracks a global checkpoint, the highest sequence number every in-sync copy holds, and advertises it. Copies failing to acknowledge are removed from the in-sync set via the master. Replicas do their own indexing, which costs CPU on each copy. The difficulty is that on primary failure, a promoted replica must reconcile with others, by replaying operations above the checkpoint.",
    k: ["Replicas index independently vs. copying segment files: independent indexing keeps copies as fast as the primary for reads, but duplicates CPU; segment copying saves CPU and delays freshness.", "Waiting for all in-sync copies vs. a majority: all gives strong durability on failover, but one slow replica slows writes."],
    p: ["A slow replica remains in the in-sync set and drags down write latency for the whole shard.", "Reading from replicas that lag behind the primary returns different results on consecutive requests."],
    v: "Write one thousand documents, kill the primary during the writes, and read from the promoted copy. Confirm every acknowledged document is present and sequence numbers have no gaps above the checkpoint.",
    dep: ["sequence-numbers", "translog", "cluster-state"]
  },
  "replica-recovery": {
    s: "Brings a new or returning shard copy up to date by replaying missing operations from the primary's log when possible, or copying segment files when not.",
    d: "A recovering copy contacts its primary with its last known checkpoint. If the primary's history still holds every operation since then, only those are replayed. Otherwise the primary sends its segment files, then the operations indexed while copying, so no writes are lost. Throttling limits bandwidth so recovery does not hurt live traffic. Once caught up, the copy joins the in-sync set. The difficulty is retention: keeping operation history long enough makes recovery cheap, but costs disk, and concurrent merges change the files being copied.",
    k: ["Operation replay vs. full file copy: replay is fast after short outages, but needs retained history; file copy always works but moves the whole shard.", "Throttled recovery vs. as-fast-as-possible: throttling protects search latency, while unthrottled restores redundancy sooner at the cost of foreground traffic."],
    p: ["A replica offline longer than the retained history window needs a full copy and stresses the network.", "Starting many recoveries at once after a rack failure saturates links and slows queries."],
    v: "Stop a replica node for one minute while writing, then restart it. Confirm recovery replays only operations since its checkpoint, finishes quickly, and the copy then returns identical document counts.",
    dep: ["sequence-numbers", "translog", "commit-points", "replication-protocol"]
  }
});
