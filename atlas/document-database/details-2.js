// Details for the document database plate, part 2: query processing, document model, indexes.
ATLAS.details("document-database", {
  "query-parser-validator": {
    s: "Turns a request document into an internal query tree, checking operators, field paths and argument types before any data is touched.",
    d: "Filters are documents whose keys are field paths or operators. The parser walks them, builds a tree of match expressions, normalizes it (flattening nested and/or, simplifying negations) and rejects unknown operators or wrong argument types. Pipelines are parsed into stage objects. It also derives a query shape, the filter with values stripped, used by the plan cache and profiler. It is hard because the language is open-ended and mixes operators and field names in the same document.",
    k: ["Strict validation up front vs lenient parsing: strict parsing catches typos before they silently match nothing; it rejects queries older clients relied on.", "Normalizing the tree vs planning it as written: normalization gives the planner fewer equivalent forms; it must preserve semantics for odd cases such as missing fields."],
    p: ["A misspelled field name is valid and matches nothing, so a bad query returns an empty result instead of an error.", "Comparing a number to a string field matches nothing because types are compared separately."],
    v: "Submit queries with an unknown operator and a wrong argument type and confirm precise errors; submit equivalent filters written differently and confirm they yield the same query shape.",
    dep: ["type-system", "command-dispatch"]
  },
  "filter-and-projection": {
    s: "Evaluates match conditions against documents and returns only requested fields, including conditions on nested paths and array elements.",
    d: "The execution engine tests each candidate document against the match tree: comparisons, existence, type, regular expressions and element matching in arrays. A projection then selects or excludes fields, and can compute new ones, so the reply is smaller. The semantics around arrays are the subtle part: a condition on an array field matches if any element matches, and several conditions may match different elements unless element matching is used.",
    k: ["Filter in the server vs in the application: server filtering saves bandwidth and uses indexes; complex predicates cost CPU on the database tier.", "Projection to few fields vs fetching whole documents: small replies cut network and decode cost; covered queries become possible only when every field comes from an index."],
    p: ["Two conditions on array elements match different elements, returning documents the author expected to exclude.", "Returning whole large documents when only two fields are used."],
    v: "Query a collection with arrays using combined conditions with and without element matching, and confirm the results differ exactly as documented; confirm the reply size drops when a projection is added.",
    dep: ["query-parser-validator", "binary-encoding", "array-and-nested-fields"]
  },
  "update-operators": {
    s: "Modify parts of a document in place with operators like set, increment, push and unset, without sending the whole document back.",
    d: "An update names the operators and fields. The server reads the document, applies each operator to the in-memory tree, validates the result and writes the new version atomically as a single operation. Array operators append, remove or match elements by position. Upserts insert when nothing matches. Pipeline-style updates compute from existing fields. It is hard because an update on a growing document may relocate it, and concurrent updates on the same document serialize.",
    k: ["Partial update operators vs replace whole document: operators merge concurrent changes to different fields without lost updates; replacement is simple but overwrites other writers' changes.", "Upsert vs separate insert-or-update logic: upsert is atomic on one key; it can insert duplicates if the filter is not backed by a unique index."],
    p: ["Read, modify and write back the whole document in the application, so concurrent edits silently overwrite each other.", "An unbounded push into one array grows the document toward its size limit."],
    v: "Run one hundred concurrent increments of a counter field and confirm the final value is exactly one hundred more than the start; do the same read-modify-write in the client and observe lost updates.",
    dep: ["single-document-atomicity", "binary-encoding"]
  },
  "aggregation-pipeline": {
    s: "A sequence of stages that each transform a stream of documents, used for filtering, grouping, reshaping, sorting and joining in the server.",
    d: "Each stage consumes documents from the previous one and emits new ones: match, project, group, sort, unwind, lookup, facet and more. Stages stream where possible, and blocking stages such as group and sort buffer data, spilling to disk past a memory limit. Pipelines can write results to a collection. On a sharded collection, early stages run on shards and a merge stage combines partial results. The difficulty is memory use and keeping stages that cannot use indexes late.",
    k: ["Pipeline in the database vs fetching and processing in the application: in-server avoids moving data; it competes with transactional load for CPU and memory.", "Allow disk use vs fail at the memory limit: spilling completes big groupings; it can be orders of magnitude slower and hit disk contention."],
    p: ["Putting a match after a group so the whole collection is processed before it can be filtered.", "Unwinding a large array and grouping again, which multiplies the number of documents in flight."],
    v: "Run a grouping on a large collection with explain, confirm early filter stages use an index, and watch that memory stays under the limit or that spilling is reported and the result matches a client-side computation.",
    dep: ["pipeline-optimizer", "filter-and-projection", "query-planner"]
  },
  "pipeline-optimizer": {
    s: "Rewrites an aggregation pipeline into an equivalent cheaper one by reordering, merging and pushing stages toward indexes and shards.",
    d: "The optimizer moves match stages as early as possible, combines adjacent stages such as sort and limit into a top-k operation, drops unused fields, merges consecutive projections and converts group-then-sort patterns where it can. It decides which stages can run on each shard and which must run on the merger. Rules are conservative: a rewrite is applied only when semantics are provably unchanged. It is hard because users write pipelines for readability, not for the optimizer.",
    k: ["Automatic rewrite vs trust the written order: rewrites rescue naive pipelines; they can surprise authors whose explain output no longer matches the source.", "Conservative rules vs aggressive reordering: conservative rules never change results; they leave some savings unrealized."],
    p: ["Assuming the optimizer will move a match above a computed-field stage when it cannot because the match uses that field.", "A stage that blocks pushdown placed early without noticing."],
    v: "Write a pipeline with a match placed late and confirm in explain that the optimizer moved it earlier and uses an index; confirm results are identical to the unoptimized form.",
    dep: ["aggregation-pipeline", "query-planner", "explain-output"]
  },
  "lookup-and-joins": {
    s: "Combines documents from two collections inside a pipeline by matching a local field to a foreign one, a limited form of join.",
    d: "A lookup stage takes each input document, queries another collection for matches, and attaches the matches as an array. Implementations use nested loops with index lookups into the foreign collection, hash-based joins for small foreign sets, or a join on the shard that owns the data. A foreign collection that is sharded may restrict how it can be joined. It is hard because it is not as efficient as a relational join, so the data model is meant to avoid needing many.",
    k: ["Lookup at read time vs embed at write time: lookup keeps data normalized and current; embedding avoids repeated joins but duplicates data to update.", "Indexed lookup vs hash join: indexed lookup is cheap per document when selective; hash join wins when most of the foreign collection is touched."],
    p: ["A lookup against a foreign field with no index scans the foreign collection once per input document.", "Joining many large collections as in a relational schema, producing slow multi-stage pipelines."],
    v: "Run a lookup with explain and confirm the foreign side uses an index and examines about one key per input document; remove the index and confirm per-document collection scans appear.",
    dep: ["aggregation-pipeline", "secondary-btree-index", "embedding-vs-referencing"]
  },
  "query-planner": {
    s: "Chooses how to run a query by building candidate plans from available indexes, trial-running them and keeping the one that returns results with the least work.",
    d: "From the filter, sort and projection, the planner enumerates which indexes could serve each predicate and sort, forms candidate plans including a full scan, then runs them in parallel for a short trial. The first to produce a batch of results, or the best by work per result, wins and is cached. There are no persistent statistics; it learns by experiment. It is hard because trial results depend on the data skew at that moment, and a plan good for one value can be terrible for another.",
    k: ["Trial-based selection vs statistics-based cost model: trials adapt to real data without maintaining statistics; they spend work on losing plans and can choose differently run to run.", "Plan reuse by query shape vs replan every time: reuse saves planning cost; it applies a plan chosen for one parameter value to all."],
    p: ["A plan cached for a rare value gets reused for a common one and reads most of the collection.", "Two similar indexes both serve a query and the planner flips between them as data changes."],
    v: "Run a query with two possible indexes, read the explain output for rejected and winning plans, then change the data distribution and confirm the winning plan changes after a replan.",
    dep: ["secondary-btree-index", "compound-index", "plan-cache", "query-parser-validator"]
  },
  "plan-cache": {
    s: "Remembers the winning plan for each query shape so later queries of the same shape skip candidate trials.",
    d: "After a trial picks a plan, it is stored under the query shape and the set of available indexes. Later queries with the same shape reuse the plan, while monitoring its work: if it examines far more than the trial did, the entry is evicted and planning runs again. Index changes and large data changes invalidate entries. It is hard because performance depends on parameter values that are not part of the shape.",
    k: ["Cache by shape vs by shape and value: shape-only caching has a high hit rate; value-sensitive caching avoids bad reuse at the cost of more planning.", "Evict on observed regression vs fixed lifetime: regression-based eviction fixes the bad cases directly; it needs per-query bookkeeping."],
    p: ["After a restart or an index change, every shape replans at once, causing a brief latency bump.", "A stale entry persists for a skewed query until the monitor evicts it."],
    v: "Run a query repeatedly and confirm the cache has one entry with a recorded winning plan and that later runs skip trials; drop the used index and confirm the entry disappears.",
    dep: ["query-planner", "explain-output"]
  },
  "explain-output": {
    s: "A structured report of the plan a query used: stages, indexes, keys and documents examined, rows returned and time, with rejected alternatives.",
    d: "Explain runs the query, or just plans it, and returns a tree of execution stages such as index scan, fetch, sort, collection scan and shard merge. At the execution level it reports counters per stage and total time. In a cluster it lists the shards used and per-shard stats. The key comparison is keys examined, documents examined and documents returned. It is hard because the plan shown is not always the plan an application later gets, if parameter values or cached plans differ.",
    k: ["Planning-only vs execution statistics: planning-only is cheap and safe on large queries; real counters show actual work, but run the query.", "Verbose output with rejected plans vs summary: verbose is needed for diagnosing choices; it is long and format-specific."],
    p: ["Running explain on a query with different literal values than the slow production one.", "Reading only the winning plan and missing that a sort stage is done in memory."],
    v: "Explain a query that should use a given index and confirm an index scan with keys examined close to documents returned and no in-memory sort stage; remove the index and confirm a collection scan appears.",
    dep: ["query-planner", "secondary-btree-index"]
  },
  "document-model": {
    s: "Data is a tree of named fields holding scalars, arrays and nested documents, each document independent and able to have a different shape from its neighbors.",
    d: "A document maps field names to values, which may themselves be documents or arrays. There is no required set of fields, no enforced types per field and no fixed row layout. Related data is often nested inside the parent so it is read and written in one operation. Documents are the unit of storage, atomicity, replication and indexing. It is hard because flexibility moves schema responsibility into the application, and a document's size limit and growth pattern constrain how much can be nested.",
    k: ["Nested documents vs separate collections: nesting reads related data in one fetch and one atomic write; it duplicates shared data and has a size ceiling.", "Free-form shape vs enforced schema: free shape speeds change; every reader has to cope with variants."],
    p: ["Treating flexibility as no schema, so five slightly different shapes of the same entity accumulate.", "Unbounded nested arrays make a hot document that grows without limit."],
    v: "Insert two documents with different fields into one collection, query on a field present in only one, and confirm only that document returns; read a parent with its nested children in a single round trip.",
    dep: ["binary-encoding", "type-system"]
  },
  "binary-encoding": {
    s: "A compact, traversable binary serialization of documents that stores field names, types and lengths so the server can read single fields without parsing the rest.",
    d: "Each document starts with its total length and then lists elements as a type byte, a null-terminated name and a value; nested documents and arrays repeat the pattern. Lengths allow skipping over fields cheaply. It supports more types than text JSON: dates, binary, exact integer widths, decimals and object ids. The same format is used on disk, in memory and on the wire. It is hard because field names are repeated in every document, which costs space, and element lookup is linear in the number of fields.",
    k: ["Self-describing binary vs schema-referenced encoding: self-describing needs no schema registry and tolerates any shape; every document repeats its names.", "Linear field scan vs offset tables: linear scanning is simple and compact; large documents pay to reach late fields."],
    p: ["Long field names on billions of documents add gigabytes of overhead that compression only partly recovers.", "Assuming key order is irrelevant when the encoding preserves it and equality comparisons depend on it."],
    v: "Encode a document with nested arrays, decode it and compare field by field including types; measure bytes per document against a text encoding and confirm a field can be read without decoding earlier siblings.",
    dep: ["type-system"]
  },
  "type-system": {
    s: "The set of value types a document can hold, with defined comparison and sort order across types so mixed-type fields behave predictably.",
    d: "Types include strings, several numeric widths and decimals, booleans, dates, null, binary, object ids, arrays and embedded documents. Comparison within a type follows natural order, and across types follows a fixed ranking, so a field holding mixed types still sorts. Numbers of different widths compare by value. Indexes store this ordering. The hard parts are numeric conversion, string collation rules and the difference between a missing field and a null.",
    k: ["Distinct numeric types vs one number type: distinct types preserve exact money and counters; comparisons and indexes must treat 1 and 1.0 as equal.", "Binary string comparison vs locale collation: binary is fast and deterministic; locale collation matches user expectations and costs more and must be fixed per index."],
    p: ["Storing the same quantity as a number in some documents and a string in others, so queries match half the data.", "Treating a null value and a missing field as the same in a query where they differ."],
    v: "Store the same value as integer, double and string, query for it as a number, and confirm only the numeric forms match; sort a mixed-type field and confirm the documented type order.",
    dep: []
  },
  "collections-and-databases": {
    s: "A database is a namespace holding collections; a collection is a named set of documents that shares indexes, options and a storage unit.",
    d: "Collections are created implicitly on first insert or explicitly with options such as validation rules, capped size or collation. Each has its own storage files or tables and its own indexes. A database groups collections for access control and administration. Views present a stored pipeline as a read-only collection. It is hard to decide the grain: too many tiny collections cost file handles and metadata, and one giant mixed collection forces every document through the same indexes.",
    k: ["Many collections vs one collection with a type field: separate collections isolate indexes and retention; one collection simplifies queries across types and keeps file counts low.", "Implicit creation vs explicit creation with options: implicit is convenient; collections created by typos or without validation or sharding setup are hard to fix."],
    p: ["A misspelled name in code creates a new empty collection that silently receives writes.", "Thousands of per-tenant collections exhaust open file and metadata limits."],
    v: "List collections with their options after a deployment and confirm every expected collection exists with the intended validation, indexes and sharding, and none unexpected appeared.",
    dep: ["record-store", "schema-validation"]
  },
  "primary-key": {
    s: "Every document has a unique, immutable identifier field that the collection indexes automatically; if the client does not supply one, one is generated.",
    d: "The identifier can be any unique value but is commonly a generated object id: a few bytes of timestamp, a machine or random component and a counter, so ids are mostly increasing and can be created on the client without coordination. A unique index on it enforces uniqueness and supports lookups. In a sharded collection it may or may not be the shard key. It is hard because the choice shapes insert locality and index growth.",
    k: ["Generated time-ordered ids vs natural keys: generated ids need no coordination and sort by creation time; natural keys avoid a second index for lookups but must truly be unique and immutable.", "Monotonic ids vs random ids: monotonic ids append to the end of the index efficiently; on a sharded collection they concentrate all inserts on one shard."],
    p: ["Using a mutable business value such as an email as the identifier, then needing to change it.", "Monotonic ids as a shard key create a hot shard."],
    v: "Insert documents without an identifier and confirm each is assigned a unique value that sorts by creation time; insert a duplicate identifier and confirm a duplicate key error.",
    dep: ["unique-index", "binary-encoding"]
  },
  "array-and-nested-fields": {
    s: "Fields can hold lists and subdocuments, addressed by dotted paths, with query, update and index behavior defined for each element.",
    d: "A path like address.city descends into subdocuments; a numeric segment addresses an array position. Queries on array fields match if any element matches, updates can target a positional element or all elements, and indexes can store each element separately. Arrays make one-to-few relationships easy. They are hard when they grow: large arrays are expensive to rewrite and to index, and element-wise semantics surprise people used to one value per column.",
    k: ["Embedded array vs child collection: arrays give one-read access and atomic updates; they cap out in size and make independent querying of children awkward.", "Positional updates vs rewriting the array: positional updates are cheap and atomic; they depend on knowing the position or a matching filter."],
    p: ["An array that is appended forever, eventually approaching the maximum document size.", "Updating an array element by index while another writer reorders the array."],
    v: "Update one element of an array using a matching filter and confirm only that element changes; index the array and confirm a query on one element value uses the index.",
    dep: ["document-model", "multikey-index"]
  },
  "embedding-vs-referencing": {
    s: "The modeling choice between nesting related data inside a document and storing it separately with a stored identifier, trading read cost against duplication.",
    d: "Embedding places child data in the parent so one read returns everything and one write is atomic. Referencing stores a key to another document and joins at read time or in the application. The decision follows access patterns: embed what is read together and bounded in size; reference what is large, shared across parents, or changes independently. Hybrid patterns copy a few frequently needed fields into the parent. It is hard because patterns change over time and refactoring live data is expensive.",
    k: ["Embed vs reference: embedding gives atomicity and one-round-trip reads; referencing avoids duplication and size growth at the price of extra queries.", "Duplicating a field for fast reads vs one source of truth: duplication speeds reads; every update must fan out and can leave copies out of date."],
    p: ["Embedding a high-write child list into a parent that is also read constantly, causing contention on one document.", "Referencing everything and recreating a relational model with many slow lookups."],
    v: "For each main screen or API call, count the queries it issues; the common paths should need one or two reads, and any duplicated field should have a tested update path that keeps copies consistent.",
    dep: ["document-model", "lookup-and-joins", "single-document-atomicity"]
  },
  "schema-validation": {
    s: "Optional rules attached to a collection that reject or warn about documents whose fields, types or values violate a declared schema.",
    d: "A collection can carry a validator expressed as a schema document or a query expression, with a level (strict for all writes, moderate for new and already-valid documents) and an action (error or warn). The server evaluates it on insert and update. Validation guarantees shape without losing the flexibility of other collections. It is hard to introduce on existing data: old documents may violate the new rule, and rules must change over time without blocking writes.",
    k: ["Server-side validation vs application-only checks: server rules protect against every writer; they add per-write cost and must be deployed with the code.", "Error vs warn action: errors enforce quality; warnings let teams find violations in production before enforcing."],
    p: ["Turning on strict validation with existing invalid documents, which makes updates to those documents fail.", "A validator duplicated in app code and server that drift apart."],
    v: "Attach a validator requiring a typed field, attempt an insert missing it and confirm rejection with an error naming the rule; run in warn mode and confirm the write succeeds with a logged warning.",
    dep: ["collections-and-databases", "type-system", "filter-and-projection"]
  },
  "schema-versioning": {
    s: "A pattern of storing a schema version number in each document so code can read old shapes and migrate them lazily or in bulk.",
    d: "Each document carries a version field. Readers branch on it or upgrade documents in memory, and writers always write the newest shape. Migrations run either lazily when a document is touched, in background batches, or both. Validators can accept the set of live versions. It is hard because mixed versions exist for as long as migration takes, so every reader must understand all of them, and rollback of application code must handle new-version documents.",
    k: ["Lazy migration vs bulk migration: lazy has no downtime and no load spike; old versions linger forever for cold data. Bulk finishes cleanly but loads the cluster.", "Version field per document vs per collection: per document supports gradual change; per collection is simpler but forces an all-at-once cutover."],
    p: ["Deploying code that writes a new shape before all readers can read it, breaking older instances during rollout.", "Never finishing the migration, and keeping decades of version branches."],
    v: "Count documents per version value while a migration runs and confirm older versions decrease to zero; read a sample of each version through the current code and confirm the same logical result.",
    dep: ["schema-validation", "document-model"]
  },
  "large-value-handling": {
    s: "Limits and strategies for documents and binary values that exceed the maximum document size, such as splitting files into chunks stored in separate documents.",
    d: "A single document has a size cap (commonly in the tens of megabytes). Larger objects are split into fixed-size chunk documents plus a metadata document, with an index on file and chunk number, and streamed in order. Alternatively, large payloads live in object storage and the document stores a reference. The cap exists so one document cannot monopolize memory, network buffers and cache. It is hard to keep chunked data consistent: deleting a file touches many documents and orphan chunks accumulate.",
    k: ["Chunked storage in the database vs object storage reference: chunking keeps data in one backup and transaction domain; object storage is cheaper and serves downloads directly.", "Large chunks vs small chunks: large chunks mean fewer operations; small chunks allow range reads and avoid big memory buffers."],
    p: ["Orphan chunks after a failed upload, taking space with no metadata pointing at them.", "Storing multi-megabyte documents that are read by queries needing only a few fields, flooding the cache."],
    v: "Upload a file much larger than the document size limit, download it and compare a checksum; delete it and confirm no chunk documents remain for that file id.",
    dep: ["binary-encoding", "collections-and-databases"]
  },
  "secondary-btree-index": {
    s: "An ordered tree of field values pointing to the documents that contain them, used for equality, range and sorted queries without scanning the collection.",
    d: "The index stores keys derived from a field, sorted by value (with type ordering), each paired with a locator for the document. Queries descend the tree to the first match and scan forward. Every insert, update of an indexed field and delete also updates the tree, so each index slows writes and uses memory and disk. The hard part is the cost: each additional index is paid on every write, and the indexes that matter should fit in memory.",
    k: ["Index a field vs scan: an index gives logarithmic lookup and ordered output; it adds write cost and storage proportional to the data.", "More indexes vs fewer: more indexes serve more query shapes; write throughput and cache pressure both degrade."],
    p: ["Creating an index for every field and then finding that writes are slow and the working set no longer fits in memory.", "Indexes on low-cardinality fields that the planner does not even use."],
    v: "Time a range query before and after creating the index and confirm explain shows an index scan with examined keys near the number returned, then measure insert throughput change.",
    dep: ["record-store", "page-cache", "type-system"]
  },
  "compound-index": {
    s: "An index on several fields in order, supporting queries that filter by a prefix of those fields and sorts that follow the same order.",
    d: "Keys are tuples sorted by the first field, then the second, and so on, each with an ascending or descending direction. A query can use the index for equality on leading fields, a range on the next, and sorting on the following. The order of fields therefore decides what it can serve. A common guide is equality fields first, then sort, then range. It is hard because one index serves many shapes only if prefixes align, so design is driven by the real query list.",
    k: ["Equality-sort-range field order vs selectivity-first order: equality, sort, range avoids in-memory sorts; selectivity-first can reduce keys examined for single queries.", "One wide compound index vs several narrow ones: wide indexes cover more and avoid fetching; they cost more writes and only help prefix queries."],
    p: ["Fields in the wrong order, so the index cannot serve the sort and the server sorts large result sets in memory.", "Redundant indexes where one is a prefix of another."],
    v: "Run the target query and sort with explain and confirm one index scan with no sort stage and keys examined near returned; change field order and confirm a sort stage appears.",
    dep: ["secondary-btree-index", "query-planner"]
  },
  "multikey-index": {
    s: "An index over an array field that stores one entry per array element, so queries on any element can use the index.",
    d: "When the indexed path contains an array, the index creates a key for each element, all pointing to the same document. Equality or range on an element then finds all documents containing it. Compound indexes may contain at most one array field to avoid combinatorial key growth. The cost is index size and write amplification proportional to array length, and bounds on bounds computation for combined conditions.",
    k: ["Index each element vs index the whole array: element indexes answer contains queries; whole-array indexes only match exact arrays.", "Allowing one array field per compound index vs several: one array bounds growth; several would produce a cross product of keys."],
    p: ["Updating a document with a long array rewrites hundreds of index entries for a small change.", "Expecting range conditions on separate array elements to be satisfied by the same element."],
    v: "Insert a document with an array of ten tags, create the index and confirm ten entries for it, and that a query for one tag uses the index and returns the document once.",
    dep: ["secondary-btree-index", "array-and-nested-fields"]
  },
  "text-index": {
    s: "An inverted index of normalized words from string fields, supporting keyword search with stemming, stop words and relevance scoring.",
    d: "Text fields are split into tokens, lowercased, stemmed per language and stripped of stop words; each term maps to documents with a weight. Queries match terms, phrases or negations and can sort by score. Full-text indexes are bigger and slower to maintain than value indexes. They cover basic search but are limited in ranking, fuzzy matching and analysis compared with a dedicated search engine.",
    k: ["Built-in text index vs external search engine: built-in has no extra system to run and stays consistent with writes; ranking and analysis features are limited.", "Index several fields with weights vs one field: weights tune relevance; every field adds index size and write cost."],
    p: ["Assuming fuzzy or typo-tolerant matching that stemming does not provide.", "A text index in the wrong language gives poor stemming and unexpected results."],
    v: "Insert documents with different word forms, search by a stem and confirm matches, then check that results are ordered by score and a stop word alone returns nothing.",
    dep: ["secondary-btree-index", "binary-encoding"]
  },
  "geospatial-index": {
    s: "An index over coordinates or shapes that answers nearest, within-area and intersection queries.",
    d: "Locations are stored as coordinate pairs or standard geometry objects. The index divides the plane or sphere into cells (a grid, or a hierarchical cell id scheme) and stores cell ids as keys in an ordered tree. A query computes covering cells for the search area, scans those key ranges, and then checks exact geometry on the candidate documents. It is hard because of the geometry: edges, the dateline, and the difference between planar and spherical distance.",
    k: ["Spherical vs planar model: spherical distances are correct over large areas; planar math is simpler and faster for small local regions.", "Fine vs coarse cells: fine cells reduce false candidates; they produce more keys per shape and larger indexes."],
    p: ["Storing coordinates as latitude then longitude when the format expects longitude first, placing every point in the wrong location.", "Large polygons covered by thousands of cells make the index huge."],
    v: "Insert known points, run a within-radius query and confirm exactly the points inside the computed distance are returned in order of distance, including one near the dateline.",
    dep: ["secondary-btree-index", "type-system"]
  },
  "wildcard-index": {
    s: "An index that covers every field path matching a pattern, for collections where queries filter on unpredictable keys.",
    d: "For documents with user-defined attributes, a wildcard index creates an entry for each field path and value under a prefix, or for all paths. A query on any such path can use it. It trades flexibility for size: it indexes many values that are never queried and cannot support all compound uses. It is hard to control growth, and queries needing sort or multi-field conditions often still need dedicated indexes.",
    k: ["Wildcard vs targeted indexes: wildcard supports unknown query fields; targeted indexes are smaller and faster for the known hot queries.", "Include vs exclude path lists: include lists limit growth; exclude lists are easier to maintain but allow accidental big fields."],
    p: ["Wildcard on every path in a collection of wide documents, multiplying index size beyond the data size.", "Assuming it supports compound conditions as a compound index would."],
    v: "Insert documents with different attribute names, query on an attribute that exists in one, confirm an index scan, and check index size relative to data size.",
    dep: ["secondary-btree-index", "multikey-index"]
  },
  "partial-index": {
    s: "An index that includes only documents matching a filter, or only those that contain the field, keeping it small.",
    d: "A partial index stores keys only for documents satisfying an expression, such as status equal to active. A sparse index skips documents lacking the field. Queries can use the index only when their filter implies the index filter. This reduces size and write cost when most documents are not interesting, for example only open orders. It is hard because an index that is not usable for a query shape is skipped silently.",
    k: ["Partial vs full index: partial indexes are small and cheap to maintain; they serve only queries that include the filter condition.", "Sparse vs partial: sparse is a shorthand for field presence; partial can express any supported condition."],
    p: ["A query that omits the condition the index depends on ignores it and scans.", "A unique partial index lets duplicates exist among documents outside the filter."],
    v: "Create a partial index for active records, confirm explain uses it for queries that include the condition and does not for ones that omit it, and compare its size with a full index.",
    dep: ["secondary-btree-index", "query-planner"]
  },
  "ttl-index": {
    s: "A single-field index on a date that marks documents to be deleted automatically once they are older than a configured time.",
    d: "The index is an ordinary ordered index on a date field with an expiry setting in seconds. A background task finds entries older than now minus the expiry and deletes the documents. The date can be set to a future time per document by giving a zero expiry. It removes the need for cleanup jobs for sessions, tokens and logs. It is hard because expiry is approximate, applies only to date-typed fields and runs only on primaries.",
    k: ["Per-document expiry date vs fixed age from creation: a stored date allows individual retention; fixed age is simple but identical for all.", "TTL index vs partitioned collections: TTL needs no management; it deletes document by document, which is slower and noisier than dropping a partition."],
    p: ["The indexed field holds a string or number, so nothing ever expires.", "Updating the timestamp on every read keeps data forever by accident."],
    v: "Insert a document with a date in the past, wait for one task period, and confirm it is gone on all members; insert one with a string date and confirm it persists.",
    dep: ["secondary-btree-index", "ttl-deletion-task"]
  },
  "unique-index": {
    s: "An index that rejects any write that would create two documents with the same indexed value, enforcing uniqueness in the database.",
    d: "When a write adds a key already present in a unique index, the insert or update fails with a duplicate key error. Uniqueness can apply to a compound key. Documents missing the field count as null, so only one such document is allowed unless the index is partial or sparse. In a sharded collection a unique index must include the shard key, since each shard only checks locally. It is hard to add to data that already has duplicates.",
    k: ["Database-enforced uniqueness vs application check: database enforcement is race-free; the check-then-insert pattern in an application races under concurrency.", "Unique with the shard key vs globally unique: including the shard key keeps checks local; global uniqueness across shards then needs a different design."],
    p: ["Multiple documents missing the indexed field collide as nulls.", "Trying to build a unique index on existing duplicates and having the build abort after a long time."],
    v: "Insert two documents with the same value concurrently from many clients and confirm exactly one succeeds and the rest return duplicate key errors.",
    dep: ["secondary-btree-index", "shard-key"]
  },
  "hashed-index": {
    s: "An index on a hash of a field's value, supporting equality lookups and even distribution but no range queries.",
    d: "The index stores a hash of the value as the key, so equal values go to the same place and different values spread randomly. It is mainly used as a shard key to spread inserts of monotonically growing values evenly. It supports equality and in-list queries, but not ranges or sorting by the original value. It is hard to reason about because locality is deliberately destroyed.",
    k: ["Hashed vs ranged key: hashing spreads writes evenly; range queries must go to every partition.", "Hash index for lookups vs a regular index: the regular index serves ranges and sorting; the hash index only saves space for very long values."],
    p: ["Using a hashed shard key then running range reports that scatter to all shards.", "Hash collisions assumed impossible while the index treats them as equal matches and re-checks the real value."],
    v: "Insert sequential ids into a collection sharded on a hashed key and confirm the chunk and document counts per shard are close to equal; confirm a range query scans all shards.",
    dep: ["secondary-btree-index", "shard-key"]
  },
  "index-build": {
    s: "The process of constructing a new index on an existing collection while the database keeps serving reads and writes.",
    d: "The builder scans the collection, sorts keys externally if needed, and bulk-loads the tree. Writes during the build are captured in a side buffer and applied at the end. Commit is coordinated across replica set members so all have the index. On a sharded collection each shard builds its own copy. It is hard because it uses I/O, memory and cache, can run for hours on large data, and a primary and secondaries may finish at different times.",
    k: ["Online build vs offline rebuild: online keeps the service available; it takes longer and competes for resources.", "Build on all members together vs one at a time: together is simple and fast to finish; rolling one at a time limits impact but requires stepping down the primary."],
    p: ["Starting an index build at peak traffic and watching latency spike.", "Aborting a build near the end, which discards all the work."],
    v: "Build an index while a write workload runs and confirm no write errors, that progress is visible in operation listings, and that the finished index matches a reference scan of all documents.",
    dep: ["secondary-btree-index", "oplog", "record-store"]
  },
  "covered-query-execution": {
    s: "Answers a query using only the index entries, without fetching the documents, when every needed field is in the index.",
    d: "If the filter fields and the requested output fields are all part of one index, and the projection excludes the identifier unless it is in the index, the executor reads keys and returns them. This skips the document fetch, which is often the dominant cost. It cannot be used with multikey fields in some cases or when documents could be missing from an index. The hard part is that the benefit is lost silently if a projected field is added that is not in the index.",
    k: ["Covered wide index vs narrow index plus fetch: covering removes fetches for hot queries; the wider index is bigger and costs more on every write.", "Covering for one query vs shared use: a tailored covering index is fastest for its query; it is wasted if the query changes."],
    p: ["Adding a field to the response that is not indexed, silently turning a covered query into a fetching one.", "Forgetting to exclude the identifier from the projection."],
    v: "Run explain on the query and confirm the stage list has no fetch stage and documents examined is zero while keys examined equals returned.",
    dep: ["compound-index", "filter-and-projection", "explain-output"]
  }
});
