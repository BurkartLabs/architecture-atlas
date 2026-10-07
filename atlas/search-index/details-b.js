// Details for the full-text search index plate, part 2: lifecycle, query types, scoring, analysis.
ATLAS.details("search-index", {
  "index-templates": {
    s: "Stored rules that apply settings, mappings and aliases automatically to every new index whose name matches a pattern, so created indexes are consistent.",
    d: "A template holds a name pattern, a priority and a body of settings, mappings and aliases. When an index is created, explicitly or by a first write or rollover, the matching template with the highest priority is merged in. Reusable component templates let several index families share a mapping fragment. Templates apply only at creation, so they never change existing indexes. The difficulty is drift: a template edited today affects only future indexes, leaving older ones with different mappings that queries across the pattern must tolerate.",
    k: ["Explicit mappings in templates vs. dynamic mapping: templates give predictable types from the first document, but must be maintained as the data shape grows.", "Composable fragments vs. one monolithic template: fragments reuse common field definitions, but make the effective mapping harder to read at a glance."],
    p: ["Two templates with overlapping patterns and equal priority cause an arbitrary or rejected choice.", "Changing a template and expecting existing indexes to update leaves old indexes with the old mapping."],
    v: "Create a template for logs-*, then create logs-2026-01. Confirm the new index shows the template's mapping and settings, and that an older logs index created before the edit is unchanged.",
    dep: ["field-mappings", "aliases"]
  },
  "aliases": {
    s: "Named pointers to one or more indexes, optionally with a filter or routing value, letting applications use a stable name while indexes behind it change.",
    d: "A search against an alias fans out to all indexes it points to. A write alias designates one index as the write target. A filtered alias adds a query to every search, giving each tenant a view of a shared index. Swapping an alias from an old index to a new one is atomic, which is how reindexed or rolled-over data is cut over without downtime. The difficulty is that an alias hides several indexes: mapping differences between them show up as confusing query behavior, and a missing write target makes writes fail.",
    k: ["Alias-per-tenant filtered views vs. index-per-tenant: aliases save shard overhead and cluster state, but give no hard isolation or per-tenant tuning.", "Alias swap for cutover vs. in-place update: swap is atomic and reversible, but needs a complete second copy of the data during the switch."],
    p: ["A filtered alias gives a false sense of isolation, since anyone with access to the index bypasses the filter.", "Pointing a write alias at two indexes without a designated writer rejects every index request."],
    v: "Reindex into a new index and switch the alias in one atomic call while a reader loops over queries. Confirm no query errors or empty results occur at the switch and the reader sees the new data after it.",
    dep: ["cluster-state", "index-templates"]
  },
  "rollover": {
    s: "Creates a fresh index behind a write alias when the current one grows too large, too old or too full, keeping each index at a manageable size.",
    d: "A rollover check evaluates conditions on the current write index: maximum age, document count or primary shard size. When one is met, a new index is created from the template with the next name in sequence, and the write alias moves to it atomically. Old indexes stay searchable through a wildcard or read alias. Each index then ages independently, which makes deletion and tier moves a matter of whole indexes. The difficulty is choosing conditions: too small creates thousands of tiny shards, too large makes shards slow to recover and merge.",
    k: ["Size-based rollover vs. time-based: size keeps shards uniform whatever the traffic, but time gives predictable retention boundaries and simple deletion.", "Many small indexes vs. fewer large ones: small ones delete and move cheaply, but multiply shard count, cluster state and per-query fan-out."],
    p: ["Rolling over daily on a low-volume stream creates hundreds of nearly empty shards that slow every search.", "A rollover check that runs infrequently lets one index grow far past its target before it fires."],
    v: "Set a rollover at one hundred documents and ingest five hundred. Confirm several indexes exist, only the newest is the write target, and a search over the alias returns all five hundred.",
    dep: ["aliases", "index-templates", "lifecycle-policies"]
  },
  "lifecycle-policies": {
    s: "Declarative rules that move an index through phases as it ages: rollover, then compaction and moves to cheaper tiers, then deletion after a retention period.",
    d: "A policy lists phases with minimum ages and actions. In the hot phase it triggers rollover; in warm it may shrink shard count, force merge and reduce replicas; in cold it moves data to cheaper storage; at the end it deletes. A background service on the master checks each managed index periodically and runs the next action when conditions are met, recording progress in index metadata. The difficulty is silent stalls: an action that fails or waits for a condition that never becomes true leaves the index stuck while looking normal.",
    k: ["Policy-driven automation vs. manual operations: policies make retention consistent and cheap to run, but a mistake deletes data on schedule without further confirmation.", "Age counted from rollover vs. from creation: rollover-based timing is stable for slow streams, but delays retention for an index that rolled late."],
    p: ["A policy stuck on a failed step leaves the index in hot storage indefinitely and nobody is alerted.", "A retention period set in the wrong unit deletes recent data far earlier than intended."],
    v: "Apply a policy with short phase ages to a test index. Confirm each phase action occurs in order, the lifecycle explain output reports the current step, and the index is deleted at the end.",
    dep: ["rollover", "hot-warm-cold-tiers", "force-merge", "snapshots"]
  },
  "hot-warm-cold-tiers": {
    s: "Groups of nodes with different hardware for different data ages: fast storage for recent, heavily queried data and denser, cheaper storage for older, rarely queried data.",
    d: "Nodes carry a tier role. Allocation rules place new indexes on hot nodes, which have fast disks and more CPU for writing and merging. As data ages, lifecycle actions relocate indexes to warm nodes with larger, slower disks, then to cold nodes that may hold only replicas or mount snapshots from object storage. Searches span all tiers transparently. The difficulty is balance: queries over old data are slow on cold hardware, and moving a large index between tiers is a heavy recovery that competes with traffic.",
    k: ["Tiered hardware vs. uniform nodes: tiers cut storage cost for old data, but add operational complexity and make queries over old data slower and less predictable.", "Dropping replicas on cold data vs. keeping them: dropping halves cost, but makes a node failure rely on restoring from a snapshot."],
    p: ["Queries without a time filter touch cold indexes and are slowed to the speed of the slowest tier.", "Not enough warm capacity stalls tier moves, leaving hot disks filled with old data."],
    v: "Age an index through the policy and watch its shard locations. Confirm shards move from hot to warm nodes, searches continue uninterrupted during the move, and the data stays complete.",
    dep: ["shard-allocation", "node-roles", "lifecycle-policies"]
  },
  "snapshots": {
    s: "Backups of an index's segment files to a remote repository, taken incrementally by copying only files not already stored, and restorable to the same or a different cluster.",
    d: "A snapshot records the set of segment files for each shard at a point in time and uploads those not already in the repository. Because segments are immutable, an unchanged file is stored once and shared by later snapshots. The translog is not needed, since the snapshot is taken from a commit point. Restore downloads files and recovers shards as if from a local copy. The difficulty is repository care: deleting snapshots must keep files still referenced by others, and a snapshot taken without cluster metadata cannot recreate templates and settings.",
    k: ["Incremental file-level snapshots vs. full copies: incremental ones are fast and cheap after the first, but all snapshots depend on shared files and one repository corruption affects many.", "Snapshots vs. relying on replicas: replicas protect against node loss only, while snapshots also cover deletion, corruption and operator mistakes."],
    p: ["A snapshot schedule that never gets a restore test turns out unrestorable when finally needed.", "Two clusters writing to one repository corrupt its metadata."],
    v: "Take a snapshot, delete the index, and restore it into a new cluster. Confirm the document count, a sample of queries and the mapping all match the original.",
    dep: ["commit-points", "immutable-segments", "directory-abstraction"]
  },
  "reindexing": {
    s: "Copies documents from one index into another, optionally transforming them, which is how a mapping, analyzer or shard count is changed once data exists.",
    d: "A reindex reads every document, typically from the stored source, through a point-in-time view and bulk-indexes it into a destination with the new mapping. A script or pipeline can modify documents in flight. It runs in batches, can be throttled and parallelized by slicing, and is usually followed by an alias swap. A resize operation instead hard-links segment files into an index with fewer or more shards, which is much faster but restricted in shard counts. The difficulty is volume: it needs enough space and time, and writes during the copy must be captured.",
    k: ["Reindex through source vs. rebuilding from the system of record: reindexing is convenient, but depends on the source being stored and complete; rebuilding is slower but authoritative.", "Slice parallelism vs. throttling: parallel slices finish sooner, but compete with live query traffic for CPU and disk."],
    p: ["Documents indexed into the old index during the copy are missing from the new one after the alias swap.", "Reindexing from an index that stored no source cannot recover the original field values."],
    v: "Reindex an index with a changed analyzer while writing to the old one, then compare document counts and a set of queries on both. Confirm counts match after the final catch-up and the new analyzer takes effect.",
    dep: ["source-document", "field-mappings", "aliases", "ingest-api"]
  },
  "relevance-tuning": {
    s: "The ongoing work of adjusting analyzers, field weights, synonyms and scoring functions so that the results users want rank near the top.",
    d: "Tuning starts from observed failures: queries with no results, wrong top hits and queries users reformulate. Levers include boosts per field, synonym lists, stemming choice, phrase and proximity boosts, recency or popularity functions and filters on quality signals. Each change is tested against a judged query set before release. It is iterative because a change that fixes one query class degrades another, so changes ship with measured before and after numbers. The difficulty is the lack of ground truth: relevance is judged by people and varies.",
    k: ["Hand-tuned boosts vs. a learned model: boosts are transparent and quick to change, but do not scale to many signals; learned models use more signals, but are harder to debug.", "Global changes vs. per-query-class rules: global changes are simple, but regress some queries; targeted rules fix a case without side effects but accumulate."],
    p: ["Tuning on a handful of favorite queries makes them perfect and the long tail worse.", "Synonym additions that look harmless broaden the match set and push exact matches down."],
    v: "Run a fixed set of judged queries before and after a boost change. Confirm the quality metric improves overall, list the individual queries that got worse, and check those are acceptable.",
    dep: ["field-boosts", "synonyms", "function-score", "relevance-evaluation"]
  },
  "relevance-evaluation": {
    s: "Measures search quality against judged queries using ranking metrics, so that changes can be compared with numbers instead of impressions.",
    d: "A test set pairs sample queries with documents graded by people for relevance. Running the queries yields ranked lists that metrics score: precision at k, recall, mean reciprocal rank and graded measures that reward putting the best documents first. Online signals complement it: click-through, abandonment, reformulation rates and A/B experiments on live traffic. Offline tests are cheap and repeatable, and online tests reflect real behavior. The difficulty is bias: judged sets age, clicks favor what is already ranked high, and a single average hides regressions in query classes.",
    k: ["Offline judged sets vs. online experiments: offline is fast and repeatable, but covers only sampled queries; online reflects real use, but needs traffic and time.", "Human graded judgments vs. click-derived labels: humans give cleaner labels at a cost, clicks are plentiful, but biased by position and presentation."],
    p: ["Averaging across all queries hides a large drop on a small but important class such as product codes.", "A judged set from two years ago no longer matches current queries or catalog."],
    v: "Evaluate the current configuration against a judged set with at least a few hundred queries. Confirm that the report gives a metric per query class and that rerunning on unchanged data gives identical numbers.",
    dep: ["search-api", "explain-and-profile"]
  },
  "security-and-tenancy": {
    s: "Authentication, role-based permissions on indexes, fields and documents, and transport encryption, so that each user or tenant can search only what they should.",
    d: "Requests are authenticated against local users or an external identity provider, and mapped to roles. Roles grant privileges on index patterns, with optional field-level restrictions that hide fields and document-level restrictions that add a query filter to every search. Transport between nodes and clients is encrypted. Audit logs record access. Document-level security is applied as a filter inside the shard, so it affects caching and cost. The difficulty is leakage through side channels: aggregations, suggestions, scores and counts can reveal that restricted documents exist.",
    k: ["Index-per-tenant isolation vs. filtered shared index: separate indexes isolate and tune cleanly, but multiply shards; shared indexes are efficient but depend on a filter never being omitted.", "Field-level security vs. separate indexes for sensitive fields: field rules keep one copy, but complicate caching and every query path."],
    p: ["Tenant filter added in application code is skipped by one new endpoint, exposing every tenant's data.", "Facet counts or suggestions computed before the security filter reveal terms from hidden documents."],
    v: "Log in as a restricted user and run searches, facets, suggestions and a count over restricted content. Confirm none of them returns, counts or hints at documents outside the user's permission.",
    dep: ["filter-context", "aliases", "search-api"]
  },
  "term-query": {
    s: "Matches documents containing one exact, already-analyzed term in a field, by looking the term up in the dictionary and reading its postings.",
    d: "The query supplies the term exactly as stored, with no analysis. The shard finds it in the term dictionary via the finite-state index, then walks its postings list to produce matching document numbers in ascending order, with term frequency available for scoring. It is the primitive that other query types reduce to. A term missing from the dictionary matches nothing without reading any postings. The difficulty is that the stored term is the analyzed form, so a term query for the original-case text on a lowercased field silently returns zero.",
    k: ["Exact term lookup vs. analyzed match: term lookup is unambiguous and fast for identifiers and keywords, but unforgiving for free text where analysis changed the tokens.", "Scoring a term query vs. constant score: scoring ranks rarer terms higher, but constant score skips statistics and is cacheable for filters."],
    p: ["Looking up a capitalized value on a lowercased text field returns zero results with no error.", "Using term queries on a numeric field mapped as text fails to match because numbers are encoded differently."],
    v: "Index a document with the title Quick Fox and query the exact term Quick, then quick. Confirm only the lowercase term matches on an analyzed field, and both forms match through an analyzed query.",
    dep: ["term-dictionary", "fst-term-index", "postings-lists"]
  },
  "boolean-query": {
    s: "Combines sub-queries with must, should, must-not and filter clauses, producing the intersections, unions and exclusions that make up most real searches.",
    d: "Must clauses require a match and contribute score; filter clauses require a match without scoring; must-not clauses exclude; should clauses add score and, with a minimum count, can be required. The engine builds iterators for each clause and combines them: conjunctions advance the sparsest iterator and leapfrog the rest, disjunctions merge in docid order, exclusions skip. Clause cost estimates choose evaluation order. The difficulty is blowup, since nesting and large should lists create many iterators, and score semantics differ between clause types.",
    k: ["Filter clauses vs. must clauses for yes-or-no conditions: filters skip scoring and are cacheable, but add nothing to ranking; must clauses influence scores.", "Large should lists vs. a terms set query: should lists score each term independently, whereas a set lookup is compact, but loses per-term weights."],
    p: ["A should-only boolean with no minimum matches returns documents matching nothing useful if combined with a filter.", "Expanded synonym or wildcard clauses exceed the clause limit and the query is rejected."],
    v: "Query must a, filter b and must-not c on a fixture with known matches. Confirm exactly the expected documents return, filter clauses leave scores unchanged, and the profile shows leapfrog advancing.",
    dep: ["term-query", "query-iterators", "filter-context"]
  },
  "phrase-query": {
    s: "Matches documents where the query terms appear next to each other in order, by intersecting postings and then comparing stored word positions.",
    d: "First the postings of all terms are intersected to find documents containing every term. For each candidate, term positions are read and checked for consecutive offsets, optionally allowing a slop. This requires positions to be indexed for the field, which enlarges the index. Because it reads positions only for candidates that pass the intersection, cost depends on how rare the rarest term is. The difficulty is analysis: stop words removed at index time leave gaps that the query must account for, and synonyms at the same position complicate matching.",
    k: ["Indexing positions vs. omitting them: positions allow exact phrases and proximity, but make the index larger and indexing slower; omitting them saves space but disables phrase search.", "Phrase matching vs. shingles: shingles index word pairs as terms for very fast phrase lookup, but multiply dictionary size and only cover fixed lengths."],
    p: ["A phrase query on a field indexed without positions fails or returns nothing.", "Phrases with very common words are slow, since each candidate document needs a position check."],
    v: "Index the sentences quick brown fox and brown quick fox. Confirm the phrase quick brown matches only the first, a slop of two matches both, and the field's positions are present.",
    dep: ["positions", "postings-lists", "query-iterators", "analyzer-chain"]
  },
  "proximity-queries": {
    s: "Matches terms occurring within a given distance of each other, with or without regard to order, and supports nested spans such as a word within a phrase.",
    d: "Span-style queries represent matches as intervals of positions, not just document hits. A near query accepts matches whose intervals are within a window; containing and within queries relate one interval to another; ordered variants fix the sequence. They read positions for each candidate document and combine intervals recursively. A phrase with slop is the simple case. The difficulty is cost and scoring: interval algebra is more expensive than document-level matching, and the score of a span match is less natural than a term frequency.",
    k: ["Span and interval queries vs. a boolean plus proximity boost: span queries guarantee closeness, but run slower; a boost simply prefers close matches while still returning distant ones.", "Ordered vs. unordered proximity: ordered matches capture sentence structure, but miss natural variants like inverted word order."],
    p: ["A wide window on common terms matches most of a long document, and loses meaning.", "Position data from a field using multi-token synonyms produces overlaps that make intervals behave unexpectedly."],
    v: "Query for two terms within five positions on documents where they appear four and nine words apart. Confirm only the first matches, and unordered mode matches when the terms are reversed.",
    dep: ["positions", "phrase-query", "query-iterators"]
  },
  "fuzzy-query": {
    s: "Matches terms within a small edit distance of the query term, tolerating typos by walking the term dictionary with a Levenshtein automaton.",
    d: "The query term is compiled into an automaton accepting every string within a maximum number of insertions, deletions, substitutions or transpositions, usually one or two. The automaton is intersected with the finite-state term dictionary, which skips most branches and visits only candidates, producing a set of matching terms. Their postings are then combined like a boolean of terms, with scores scaled down by distance. A required exact prefix cuts the candidates. The difficulty is cost and noise: short terms with two edits match many unrelated words.",
    k: ["Edit distance one vs. two: distance one limits noise and candidate counts, but misses many real typos; distance two catches more and matches unrelated words in short terms.", "Automaton intersection vs. scanning all terms: intersection scales with matches, not dictionary size, but requires a term index structure that supports it."],
    p: ["Allowing two edits on three-letter words matches large numbers of unrelated terms.", "Fuzzy matching on a field with millions of terms and no prefix length is slow on every query."],
    v: "Query the misspelled word colour mistyped as colr on an index containing color and colour. Confirm both match within the edit limit, a three-letter query with distance one stays selective, and the profile shows the expanded term count.",
    dep: ["fst-term-index", "term-dictionary", "boolean-query"]
  },
  "prefix-query": {
    s: "Matches every term beginning with given characters by reading the sorted term dictionary range, often accelerated by indexing edge n-grams.",
    d: "Because terms are stored in sorted order, all terms with a prefix form a contiguous range that the term index locates directly. The postings of every term in that range are combined, as a bitset for broad prefixes. For autocomplete, an index-time edge n-gram filter stores every leading substring as a term, turning prefix search into a single term lookup at the cost of more terms and larger postings. The difficulty is breadth: a prefix of one character spans an enormous part of the dictionary and is expensive.",
    k: ["Range scan over the dictionary vs. indexed n-grams: range scans need no extra index space, but cost grows with the prefix's breadth; n-grams are fast but enlarge the index.", "Minimum prefix length vs. none: a minimum protects the cluster from one-character scans, but delays suggestions for the first keystrokes."],
    p: ["A one-letter prefix across a large field combines millions of postings and spikes latency.", "N-gram analysis applied at search time as well as index time makes every query term match everything."],
    v: "Run prefix queries of one, two and four characters on a large field. Confirm latency and the number of expanded terms in the profile fall sharply with length, and matches equal a direct dictionary range count.",
    dep: ["term-dictionary", "token-filters", "boolean-query"]
  },
  "wildcard-regex-queries": {
    s: "Matches terms against patterns with wildcards or regular expressions by running an automaton over the term dictionary, which is slow unless the pattern has a fixed prefix.",
    d: "The pattern is compiled into a finite automaton and intersected with the term dictionary. A pattern with a literal prefix lets the walk skip to a narrow range; a pattern starting with a wildcard must test every term. Matching terms are collected and their postings combined, with a limit on the number of states and clauses. Some engines store a reversed or n-gram field to accelerate leading wildcards. The difficulty is abuse: user-supplied patterns can be arbitrarily expensive, and complexity limits are needed.",
    k: ["Allowing leading wildcards vs. forbidding them: allowing them supports contains-style search, but scans the full dictionary; forbidding keeps queries bounded and surprises some users.", "Dedicated n-gram field vs. runtime pattern matching: n-grams make substring search fast, but multiply index size and only support certain lengths."],
    p: ["A regex with nested repetition builds an automaton so large that it exhausts memory.", "Leading wildcards over a large keyword field become the most common cause of slow-query alerts."],
    v: "Run the pattern ab*, then *ab on a field with millions of terms. Confirm the first is fast and narrow, the second is slower or rejected by policy, and complexity limits stop a pathological regex.",
    dep: ["fst-term-index", "term-dictionary", "query-rewriting"]
  },
  "range-query": {
    s: "Matches documents whose numeric, date or ordered text value lies between bounds, using a multi-dimensional point tree for numbers and a dictionary range for text.",
    d: "Numeric and date fields are indexed into a block-based k-d tree. A range query descends the tree, skipping blocks fully outside the range, accepting blocks fully inside without per-value checks, and testing individual values only in boundary blocks. Text ranges use sorted order in the term dictionary. Dates are stored as integers with a resolution, and bounds may use date-math expressions. The difficulty is precision: boundary inclusion, time zones, resolution rounding and fields mapped as text produce off-by-one and empty-result surprises.",
    k: ["Point tree vs. indexing numbers as terms: trees answer ranges in logarithmic work and support multiple dimensions, but are unsuited to scoring; terms are simple but slow for wide ranges.", "Rounding dates to a coarse resolution vs. exact timestamps: coarse values make filters cacheable and compact, but lose precision."],
    p: ["A date range using local time omits events near midnight because the stored values are in UTC.", "Range on a numeric value stored as text compares strings, so 10 sorts before 9."],
    v: "Query a range with inclusive and exclusive bounds on values exactly at the boundary. Confirm included documents match the bound semantics, and a range spanning most documents completes without per-value checks in the profile.",
    dep: ["point-trees", "filter-context", "query-iterators"]
  },
  "geo-queries": {
    s: "Finds documents whose location lies within a distance of a point, inside a bounding box or polygon, or intersects a shape, using spatial structures built on point trees.",
    d: "Coordinates are indexed into a multi-dimensional point tree. A distance or box query descends the tree, accepting and rejecting whole blocks by geometry and testing only boundary blocks exactly. Polygons and other shapes are decomposed into a triangle mesh stored in the same tree, so intersects and contains relations can be answered. Sorting by distance and aggregating by grid cell reuse doc values. The difficulty is correctness near edges: the antimeridian, poles, large polygons and coordinate order all cause silent errors.",
    k: ["Tree-based exact geometry vs. geohash terms: trees are exact and flexible, but need more code; geohash terms reuse the inverted index, but approximate and force a precision choice.", "Spherical vs. planar distance: spherical is correct at large scale, but costs more per comparison; planar is fast and fine for small areas."],
    p: ["Swapping latitude and longitude puts every point in the wrong place and queries find nothing.", "A polygon crossing the antimeridian is interpreted the long way around and matches half the world."],
    v: "Query points at known distances from a center with a radius between them. Confirm inside points return, outside ones do not, and sorting by distance returns the same order as a brute-force computation.",
    dep: ["point-trees", "doc-values", "bucket-aggregations"]
  },
  "nested-join-queries": {
    s: "Queries over documents that contain or relate to other documents: nested objects indexed as hidden block children, and parent-child joins across stored relations.",
    d: "Flattened arrays of objects lose the connection between fields of one object, so nested fields are indexed as separate hidden documents stored contiguously with their parent in a block. A nested query matches child documents and joins to the parent by block position, which is cheap. Parent-child relations keep documents separate but co-located on one shard, and join at query time using stored identifiers, which is slower. Updating one child requires reindexing the whole block. The difficulty is cost and consistency, as every nested object counts as a document.",
    k: ["Nested blocks vs. parent-child joins: blocks give fast joins and consistent updates, but force reindexing the whole block; joins allow independent updates at higher query cost.", "Denormalizing into one flat document vs. relations: denormalized is simplest and fastest, but duplicates data and requires many updates when a shared fact changes."],
    p: ["Using plain object arrays for fields that must match together returns documents where values come from different elements.", "Thousands of nested children per document inflate document counts and make updates very expensive."],
    v: "Index a document with two author objects, one named Ann aged thirty, one Bob aged forty. Confirm a nested query for Ann aged forty returns nothing, while a flattened mapping would wrongly match.",
    dep: ["document-model", "immutable-segments", "boolean-query"]
  },
  "bm25-scoring": {
    s: "The default relevance formula: a term's weight rises with its frequency in the document with diminishing returns, falls with how common the term is across documents, and is normalized for field length.",
    d: "The score of a term in a document is its inverse document frequency times a saturating function of term frequency. Saturation uses a parameter that sets how quickly repeats stop adding value, and a length parameter scales it by document length relative to the average. Length comes from norms, stored per document per field. Scores for each query term are summed across matching terms and fields. The formula needs document counts, term document frequencies and average field length, all per shard. The difficulty is that scores are relative, not comparable between queries or indexes.",
    k: ["BM25 saturation vs. raw term frequency weighting: saturation prevents keyword repetition from dominating, but needs tuning parameters; raw frequency is simpler and easy to game.", "Strong length normalization vs. weak: strong favors short, focused fields such as titles, but penalizes legitimately long and thorough documents."],
    p: ["Comparing raw scores across queries or indexes to set a quality threshold gives meaningless cutoffs.", "Tiny test indexes produce unstable idf values, so tuning done on them does not transfer."],
    v: "Index three documents of different lengths containing a term twice, once and once. Confirm the explain output shows the idf, saturated frequency and length normalization, and the shorter document scores highest for equal frequency.",
    dep: ["norms", "postings-lists", "distributed-term-stats"]
  },
  "field-boosts": {
    s: "Multipliers that make a match in one field, such as a title, count more than a match in another, combined across fields either by summing or by taking the best.",
    d: "A boost scales the score contribution of a clause or field, at query time or, less commonly, at index time. A multi-field query scores each field separately and combines them. A dis-max combination takes the highest field score plus a small fraction of the others, so one strong field match is not beaten by weak matches spread over several fields. Cross-field matching can treat several fields as one virtual field for statistics. The difficulty is calibration: scores from different fields have different scales, so boost numbers are not intuitive.",
    k: ["Dis-max best-field vs. summing fields: dis-max rewards a strong match in one field, but under-rewards documents matching partially everywhere; summing rewards breadth, but is easily dominated by repeats.", "Query-time boosts vs. index-time boosts: query-time can change without reindexing, but index-time costs nothing at search and is rarely used."],
    p: ["A boost of ten on one field is applied everywhere and swamps all other signals.", "Boosts tuned on one query set silently change ranking for short queries versus long ones."],
    v: "Query a term present in the title of one document and only the body of another. Confirm the title match ranks first with a boost, the order flips without it, and explain shows the boost multiplying the title score.",
    dep: ["bm25-scoring", "boolean-query"]
  },
  "function-score": {
    s: "Adjusts the text relevance score using document properties such as recency, popularity, distance or a script, combined multiplicatively or additively.",
    d: "After the text score is computed, one or more functions read values from doc values and transform them: a decay function reduces scores smoothly with age or distance, a field-value factor scales by a numeric field like sales, and a script computes anything. Results are combined with the text score by multiplication, sum or replacement, with a cap or boost mode. Filters can apply different functions to different document sets. The difficulty is balance and cost: functions evaluate for every scored candidate and can defeat early termination, and mis-scaled values drown out relevance.",
    k: ["Multiplicative combination vs. additive: multiplying keeps text relevance in control, but cannot rescue a poor text match; adding lets popularity lift weak matches.", "Script scoring vs. built-in functions: scripts can encode any rule, but are slower and harder to test; built-in functions are fast and constrained."],
    p: ["An unbounded popularity field makes a few huge documents rank first for every query.", "Per-document scripts on every candidate make an otherwise fast query slow and turn off pruning."],
    v: "Boost by a recency decay and compare two documents with identical text but different ages. Confirm the newer one ranks higher, the explain shows the decay value, and a very old one still returns.",
    dep: ["doc-values", "bm25-scoring", "early-termination"]
  },
  "query-iterators": {
    s: "The cursor-like objects that walk postings in ascending document order and are combined into conjunctions and disjunctions that can skip ahead efficiently.",
    d: "Each term or filter produces an iterator exposing the current document and an advance-to-target operation. A conjunction picks the iterator with the fewest documents as the leader and asks the others to advance to its position, so most documents are never visited. A disjunction keeps a heap of iterators positioned on the smallest document. Skip lists and block structure make advancing cheap, and bitsets act as iterators too. Evaluation is two-phase: cheap approximation first, then an expensive confirmation such as a position check. The difficulty is ordering the cost-estimated clauses well.",
    k: ["Leapfrog conjunction vs. materializing all postings: leapfrog reads little for selective clauses, but behaves poorly when all clauses are broad; materializing is simple and memory heavy.", "Two-phase matching vs. single-phase: deferring expensive checks avoids them for most documents, but needs careful estimation of cost."],
    p: ["A cost estimate that puts a position check ahead of a selective term makes the query many times slower.", "An iterator over a huge disjunction of terms spends most time on heap operations."],
    v: "Intersect a term of ten documents with a term of ten million. Confirm the profile shows advance calls close to ten and the time near that of the small term alone.",
    dep: ["postings-lists", "skip-lists", "live-docs-bitset"]
  },
  "top-k-collection": {
    s: "Keeps only the best k documents in a bounded priority queue as matches stream by, so memory and merge cost depend on page size rather than on match count.",
    d: "A collector receives each matching document with its score or sort key and keeps a min-heap of size k, rejecting any document that cannot beat the current worst. Per-segment collectors run, often in parallel across segments, and their queues are merged. Total hit counting runs separately: it can be exact, capped at a threshold or skipped. The queue's current minimum score becomes a threshold that early termination uses to skip documents. The difficulty is deterministic order: ties must break consistently, or paging and replica results differ.",
    k: ["Heap of size k vs. sorting all matches: the heap is linear in matches and constant in memory, but cannot answer ranks beyond k; full sort is wasteful.", "Exact total hits vs. capped counts: exact counts require visiting every match, but a capped count lets pruning skip most documents."],
    p: ["Ties broken by internal document number differ across replicas, so the same query shows different orders.", "Requesting exact totals on every query disables pruning and quietly multiplies latency."],
    v: "Run a query matching one million documents with k equal to ten. Confirm memory use is independent of match count, ties have a consistent order across repeated runs and replicas, and the tracked total reflects the setting.",
    dep: ["query-iterators", "early-termination"]
  },
  "early-termination": {
    s: "Skips documents and whole blocks of postings that provably cannot reach the current top-k score, by comparing stored upper bounds with the threshold.",
    d: "For each block of postings the index stores the maximum possible score contribution, called an impact. While collecting, the engine knows the lowest score in the top-k. It sums the bounds of the query terms for a block, and if the sum is below the threshold it jumps past the block without decoding or scoring. Disjunctions use this to ignore the long tail of low-value documents. It is exact for the top results, but total hit counts become approximate. The difficulty is that it only works with additive scoring, a good threshold early and no score-changing script.",
    k: ["Block-max pruning vs. scoring everything: pruning is many times faster on disjunctions with common terms, but makes total hits a lower bound.", "Pre-sorted index for sort-based termination vs. unsorted: sorting by the key lets collection stop after k matches, but fixes one order and slows indexing."],
    p: ["Adding a custom script that changes scores invalidates the bounds, so pruning silently turns off.", "Asserting an exact total count somewhere downstream gives wrong numbers when pruning is on."],
    v: "Run a disjunction of two common terms with and without pruning. Confirm the top-k list is identical, the pruned run decodes far fewer postings blocks in the profile, and the total is reported as a lower bound.",
    dep: ["postings-compression", "skip-lists", "bm25-scoring", "top-k-collection"]
  },
  "filter-context": {
    s: "Evaluates conditions that only include or exclude documents, with no score contribution, so they can be cached as bitsets and reused across queries.",
    d: "A clause in filter context answers yes or no. It is evaluated to a document set and, since no score is needed, executes in a cheaper mode and ignores term statistics. Typical filters are status, category, date range, permission and region. The engine orders filters by cost, uses the most selective one to lead the intersection, and may cache the result per segment. Moving conditions out of the scoring query into filters is the most common search speedup. The difficulty is choosing: a condition that should influence ranking, such as brand preference, belongs in scoring.",
    k: ["Filter context vs. scoring clauses: filters are faster and cacheable, but cannot influence ranking; scoring clauses rank, but cannot be cached and cost more.", "Many fine-grained filters vs. one combined filter: fine-grained filters each cache and reuse, but evaluate separately; a combined one is a single cache entry that reuses poorly."],
    p: ["Putting a date filter with a fresh timestamp for every request defeats caching because each value is unique.", "Using a scoring query for a permission check wastes cost and subtly changes ranking."],
    v: "Move a status condition from the must clause to the filter clause. Confirm the matching set is identical, scores are unchanged apart from the removed term, and latency drops with the second identical request showing a cache hit.",
    dep: ["boolean-query", "filter-caching", "live-docs-bitset"]
  },
  "filter-caching": {
    s: "Stores the document sets of frequently used filters as compact bitsets per segment, reused on later queries until the segment disappears.",
    d: "After a filter is used several times, its matching set for each segment is saved as a compressed bitset or sorted integer list in a bounded per-node cache, keyed by the filter and segment. Because segments are immutable, an entry stays valid until the segment is merged away, then it is evicted. Small segments are not cached because the cost exceeds the gain. A least-recently-used policy bounds memory. The difficulty is churn: frequent refreshes create new segments, so entries are lost and rebuilt, and unique filter values only waste memory.",
    k: ["Caching per segment vs. per index: per-segment entries survive refreshes of other segments, but are discarded on each merge; per-index entries would need invalidating on every change.", "Caching after repeated use vs. caching immediately: a use threshold avoids filling the cache with one-off filters, but makes the first few uses slower."],
    p: ["High-cardinality filters, such as one per user id, push useful entries out of the cache.", "A very short refresh interval keeps replacing segments, so the cache is nearly always cold."],
    v: "Run the same filter ten times and read the cache statistics. Confirm hits and a nonzero memory size appear after the threshold, then refresh with new documents and confirm entries remain for untouched segments.",
    dep: ["filter-context", "immutable-segments", "live-docs-bitset"]
  },
  "request-cache": {
    s: "Caches the complete shard-level response, including aggregations, for identical requests, and discards it whenever the shard's data changes at refresh.",
    d: "The key is the whole shard request body, such as the query and aggregation definitions, and the value is the serialized shard result, usually only for requests that return no hits. It is valid for the index's current reader, so any refresh that changes the data invalidates it. Dashboards that repeat the same aggregation every few seconds benefit greatly. Requests with relative time expressions such as now are not cached because each differs. The difficulty is that hit rate depends on identical bodies and data that rarely changes.",
    k: ["Caching the full shard result vs. cache parts of execution: full results save all work on a hit, but are useless if any detail differs; partial caching helps more queries a little.", "Invalidating on refresh vs. a time-to-live: refresh invalidation never serves stale data, but empties the cache on busy indexes."],
    p: ["Using now in a dashboard query makes every request unique so nothing is ever served from the cache.", "A frequently refreshing index invalidates entries faster than they are reused."],
    v: "Run an identical aggregation twice on a quiet index and then once after indexing a document and refreshing. Confirm the second is a cache hit with near-zero shard time and the third is a miss.",
    dep: ["near-real-time-refresh", "bucket-aggregations", "segment-readers"]
  },
  "document-model": {
    s: "The unit of indexing and retrieval: a flat or nested bag of named fields with typed values, identified by an id and versioned, with no joins and no enforced relations.",
    d: "A document is a JSON-like object with fields of text, keywords, numbers, dates, booleans, geo points, vectors and nested objects. Each field can hold one or many values. Each is indexed according to its mapping into one or more structures: inverted terms, doc values, stored value, points. The original source can be kept intact. Search is over the denormalized document, so data that would be joined in a relational store is copied in. The difficulty is modeling: the document is what a user sees as a result, and changing it later requires reindexing.",
    k: ["Denormalized documents vs. relations at query time: denormalizing makes searches fast and simple, but duplicates data and multiplies updates; joins avoid duplication, but cost speed and are limited.", "One index per type vs. one index with a type field: separate indexes allow tuned mappings, but a shared index lets one query search all types."],
    p: ["Modeling a document to mirror database tables creates huge fan-out when one parent is updated.", "Putting everything into one giant text field loses the ability to rank titles above bodies."],
    v: "Index a document with text, number, date and array fields, then query each field type. Confirm every type matches via its natural query, and fetching by id returns the original source unchanged.",
    dep: ["field-mappings", "source-document"]
  },
  "field-mappings": {
    s: "The schema that declares each field's type and how it is indexed, including analyzer, whether to store it, and whether it has doc values, positions or norms.",
    d: "A mapping lists fields with a type and options. For text it names the index-time and query-time analyzers and the index options, such as whether to record frequencies, positions and offsets. For keywords and numbers it controls doc values and whether the field is indexed. Fields can have sub-fields analyzed differently. Once data is indexed, most options cannot be changed, because the stored structures depend on them. The difficulty is that mistakes cost reindexing: a wrongly typed field or an analyzer chosen too early makes queries return nothing.",
    k: ["Explicit mappings vs. inferred ones: explicit mappings fix types and options before data arrives, but need design effort; inferred ones start instantly and guess wrong.", "Turning off unneeded structures vs. keeping defaults: disabling norms, positions or doc values saves large amounts of space, but permanently rules out the matching features."],
    p: ["A field first seen as a number in one document and text in another is typed by whichever came first.", "Mapping a long identifier as analyzed text splits it into pieces and breaks exact lookup."],
    v: "Read the mapping of a populated index and a test document of each type. Confirm each field's type and options match the design and an attempted type-changing update is rejected rather than applied.",
    dep: ["analyzer-chain", "document-model"]
  },
  "dynamic-mapping": {
    s: "Automatic detection of new fields in incoming documents and their addition to the mapping with guessed types, which can be allowed, restricted or turned off.",
    d: "When a document contains an unknown field, the engine infers a type from the first value: strings become text with a keyword sub-field, whole numbers become integers, date-looking strings become dates. Dynamic templates override the guess by field name or type. The new field enters the cluster state, so all nodes learn of it. Strict mode rejects documents with unknown fields. The difficulty is explosion: unbounded keys, such as user-provided names, create millions of fields, bloating cluster state and slowing the master, so a field-count limit exists.",
    k: ["Dynamic inference vs. strict schema: inference eases ingestion of unpredictable data, but guesses types and allows field explosion; strict rejects surprises and needs upfront design.", "Templates by pattern vs. per-field mappings: templates apply a rule to future fields, but can match unintended fields."],
    p: ["Log fields with user-controlled names create thousands of fields and hit the limit, rejecting documents.", "A date-like string in the first document makes an unrelated text value fail to index later."],
    v: "Ingest a document with a new field under dynamic mapping, then under strict. Confirm the field appears with the inferred type in the first case and the second rejects the document with a clear error.",
    dep: ["field-mappings", "cluster-state", "ingest-api"]
  },
  "multi-fields": {
    s: "Indexes one source value several ways under sub-fields, such as an analyzed text version for search and an exact keyword version for sorting and facets.",
    d: "A mapping declares additional representations of the same input: a text field also indexed as an exact keyword, as edge n-grams for autocomplete, or with a different language analyzer. Each sub-field has its own terms, doc values and norms, and queries select the one that matches the need. The values are derived at index time from the same source. The difficulty is cost and awareness: every sub-field adds index size and indexing time, and queries must name the right one for the job.",
    k: ["Several sub-fields from one value vs. duplicating the data in separate fields: sub-fields keep one source of truth and stay in sync, but are all-or-nothing in cost.", "Many analyzers per field vs. a single compromise analyzer: multiple representations give each query type what it needs, but multiply index size."],
    p: ["Sorting on the analyzed text field instead of its keyword sub-field raises an error or sorts by arbitrary term.", "Adding an n-gram sub-field to every text field multiplies index size several times."],
    v: "Map a title as text with a keyword sub-field and index mixed-case titles. Confirm text queries match case-insensitively, the keyword sub-field matches exactly and sorts by whole title, and sorting on text is refused.",
    dep: ["field-mappings", "doc-values", "analyzer-chain"]
  },
  "analyzer-chain": {
    s: "The pipeline turning a field's text into index terms: character filters rewrite the raw text, a tokenizer splits it, and token filters normalize, drop or add terms.",
    d: "An analyzer is a named combination of exactly one tokenizer, zero or more character filters before it and zero or more token filters after it. Each token carries its text, position and character offsets, which later become postings, positions and highlight data. The same chain, or a deliberately different one, runs on query text so that queries and documents produce the same terms. Analyzers are defined in index settings and referenced from mappings. The difficulty is that nearly every relevance problem traces back to analysis, and a change requires reindexing.",
    k: ["Custom chains per field vs. one default analyzer: custom chains fit each field's content, but multiply the number of things to test and keep consistent.", "Aggressive normalization vs. conservative: aggressive folding improves recall, but merges words that should stay distinct and cannot be reversed in the index."],
    p: ["Testing queries by eye without running text through the analysis endpoint hides why terms do not match.", "Changing the analyzer in the mapping without reindexing makes old and new documents inconsistent."],
    v: "Run a sample sentence through the analysis endpoint for each analyzer in use. Confirm the emitted tokens, positions and offsets match expectations, and that the query analyzer yields the same tokens for the same words.",
    dep: ["char-filters", "tokenizers", "token-filters"]
  },
  "char-filters": {
    s: "Rewrite the raw text before tokenization: stripping markup, mapping characters, or normalizing patterns, while keeping offsets pointing at the original text.",
    d: "A character filter reads the field's characters and emits a modified stream. Common ones strip markup tags and decode entities, map characters such as ligatures, replace by pattern, or convert full-width and half-width forms. They run before the tokenizer, so the tokenizer sees the cleaned text. Offsets are corrected back to original positions so highlighting still marks the right span. The difficulty is that they operate on characters, not words, so a pattern rewrite can span token boundaries, and a regular expression can be slow on long text.",
    k: ["Cleaning in a character filter vs. cleaning before ingest: in-engine filters keep the original source intact and reproduce at query time, but cost CPU on every document.", "Pattern replacement vs. a character map: patterns are flexible, but risk surprising matches and slow backtracking; maps are fast and predictable but limited."],
    p: ["Stripping markup shifts offsets, so highlights land on the wrong text unless offsets are corrected.", "A greedy pattern replacement removes more than intended in rare inputs."],
    v: "Index an HTML fragment with tags and entities. Confirm the terms contain only text content, an ampersand entity becomes the character, and highlight offsets still point at the right place in the original.",
    dep: ["analyzer-chain"]
  },
  "tokenizers": {
    s: "Split a character stream into tokens by whitespace, punctuation, language-specific rules or dictionary segmentation, setting the basic unit of search.",
    d: "Every analyzer has one tokenizer. Simple ones split on whitespace or non-letters. Standard ones apply Unicode word-boundary rules, so apostrophes, hyphens, numbers and email addresses are handled sensibly. Specialized ones keep the whole value as one token for keywords, split paths by separator, or emit n-grams. Languages without spaces need dictionary or statistical segmentation. Each token gets a position and offsets. The difficulty is that tokenization decides what can ever be searched: a split in the wrong place makes a product code or hyphenated name unfindable.",
    k: ["Unicode word-boundary rules vs. whitespace splitting: boundary rules handle punctuation and scripts well, but may split identifiers; whitespace keeps them whole but leaves punctuation attached.", "Dictionary segmentation for unspaced scripts vs. character n-grams: dictionaries produce real words and good precision, but need maintenance; n-grams need no dictionary, but bloat the index."],
    p: ["A tokenizer that splits on hyphens makes searches for a part number like AB-1234 match unrelated AB and 1234 documents.", "Applying a spaced-language tokenizer to unspaced text produces one huge token per sentence."],
    v: "Tokenize a sample with a hyphenated code, an email address and a contraction. Confirm the output tokens match the intended split for each, and a search for the code finds only documents containing it.",
    dep: ["analyzer-chain", "char-filters"]
  },
  "token-filters": {
    s: "Modify the token stream after tokenization: lowercasing, removing stop words, stemming, adding synonyms, splitting compounds and trimming, one transformation per filter.",
    d: "Filters run in order, each reading tokens and emitting new ones, with position information preserved or adjusted. They can change text, remove a token, or add tokens at the same position, as synonyms do. Order matters: lowercasing before synonym lookup, stemming after stop-word removal. Some filters are stateful, keeping dictionaries or compound word lists. Query-time and index-time chains often differ in which filters they include. The difficulty is interaction: the position changes caused by removed words and stacked tokens affect phrase matching.",
    k: ["Many small filters vs. one combined filter: small ones are reusable and testable, but order dependencies are easy to get wrong.", "Removing stop words vs. keeping them: removal saves index space and speeds common-word queries, but breaks phrases like to be or not to be."],
    p: ["Putting the stemmer before lowercasing leaves capitalized words unstemmed and unmatched.", "Removing stop words changes positions, so exact phrase searches containing them fail."],
    v: "Run a sentence with capitals, stop words and plural forms through the chain. Confirm the output tokens are lowercased, stop words are gone or kept as designed, and positions reflect the removal.",
    dep: ["analyzer-chain", "tokenizers"]
  },
  "case-and-accent-folding": {
    s: "Normalizes letter case and diacritics so that Resume, résumé and RESUME produce the same term, trading some distinctions for much better recall.",
    d: "A lowercase filter maps characters to a canonical case using Unicode rules, which are language dependent in a few cases. An accent-folding filter removes diacritics, or maps letters to base forms more generally, such as ligatures and special letters. Some chains keep the original token alongside the folded one so that exact searches can still be ranked higher. Normalization also applies to keyword fields used for exact matching, through a normalizer. The difficulty is that folding is lossy and language specific: in some languages an accent changes the word.",
    k: ["Fold accents vs. preserve them: folding lets users type without accents and still match, but merges words that differ by an accent in some languages.", "Keeping the original alongside the folded form vs. folded only: keeping both lets exact matches rank higher, but doubles terms and index size for that field."],
    p: ["Folding applied on index but not on query text causes accented documents to be unfindable by plain input.", "Lowercasing with the wrong locale breaks the dotted and dotless letters in some languages."],
    v: "Index documents spelled with and without accents and capital letters. Confirm a plain lowercase query finds all, an accented query finds all, and exact-match ranking, if configured, puts the identical spelling first.",
    dep: ["token-filters", "analyzer-chain"]
  },
  "stemming": {
    s: "Reduces words to a common root, by rules or a dictionary, so that running, runs and ran match one another, raising recall at some cost in precision.",
    d: "Algorithmic stemmers strip suffixes by a cascade of rules and are fast and language specific, sometimes producing non-words. Dictionary-based lemmatizers map each word to its dictionary form using a lexicon and part-of-speech, giving cleaner roots for irregular words, with more memory and maintenance. Light stemmers only fold plurals. A keyword-marker filter protects words from stemming. The same stemmer must run at index and query time. The difficulty is overstemming and understemming: universe and university can collapse together, while irregular verbs stay apart.",
    k: ["Aggressive stemming vs. light stemming: aggressive improves recall for inflected languages, but merges unrelated words; light keeps precision and misses variants.", "Rule-based stemmer vs. dictionary lemmatizer: rules are fast with no data to maintain, but handle irregular forms poorly; lemmatizers are accurate and heavier."],
    p: ["Product names and codes get stemmed into collisions unless protected by a keyword list.", "Changing the stemmer version silently changes index terms and breaks matching with older segments."],
    v: "Index running, runs, ran and runner and search each form. Confirm the stemmer yields the groups intended, a protected word is untouched, and the explain output shows the matched stem term.",
    dep: ["token-filters", "analyzer-chain"]
  },
  "synonyms": {
    s: "Maps different words with the same meaning to each other, expanding at index time or query time so that sofa also finds couch.",
    d: "A synonym filter reads a rules file of equivalent sets or one-way mappings and emits additional tokens at the same position. At query time expansion needs no reindexing when rules change, but turns one term into several, raising cost and complicating phrase queries. At index time, rules are baked into the postings, which is fast at search, but updates require reindexing. Multi-word synonyms need graph-aware handling. The difficulty is governance: lists grow, conflict and broaden matches, and changes silently alter ranking for many queries.",
    k: ["Query-time expansion vs. index-time expansion: query-time lets lists change without reindexing, but costs at search; index-time is faster, but requires rebuilding for every edit.", "Equivalent sets vs. one-way mappings: sets are symmetric and simple, but over-broaden; one-way maps send specific terms to general ones without the reverse."],
    p: ["A synonym that equates a brand with a generic word floods results with unrelated documents.", "Multi-word synonyms expanded at index time break phrase queries without graph-aware filters."],
    v: "Add the rule sofa, couch and search each word. Confirm both match all documents, update the rule and reload the search analyzer, and check that a changed rule takes effect without reindexing in query-time mode.",
    dep: ["token-filters", "analyzer-chain", "index-vs-search-analysis"]
  },
  "index-vs-search-analysis": {
    s: "Allows a field to use one analyzer when indexing and a different one when parsing queries, for cases such as synonyms or n-grams where symmetric analysis misbehaves.",
    d: "The mapping can name an index-time analyzer and a search-time analyzer. The index one may emit extra tokens, such as edge n-grams for every prefix, while the search one keeps the user's typed text as a single token so that it matches the stored prefixes. Synonym expansion is commonly placed only on the search side. The pair must still produce compatible tokens, since a match requires identical terms. The difficulty is asymmetry bugs: a mismatch makes queries silently match nothing or too much.",
    k: ["Asymmetric analysis vs. identical analyzers: asymmetry enables n-gram autocomplete and updatable synonyms, but doubles the places a mismatch can hide; identical is simple and safe.", "Setting the search analyzer on the field vs. per query: per field is consistent for all clients, whereas per query is flexible and easy to forget."],
    p: ["Using an n-gram analyzer on the query side turns every query word into many prefixes and matches almost everything.", "Changing only the search analyzer after indexing leaves existing terms incompatible with new queries."],
    v: "Index with edge n-grams and search with a standard analyzer, then switch the search side to the n-gram one. Confirm the first returns the expected prefix matches and the second returns noisy matches.",
    dep: ["analyzer-chain", "field-mappings", "synonyms"]
  }
});
