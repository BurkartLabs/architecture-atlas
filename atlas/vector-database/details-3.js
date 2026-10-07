// Details for the vector database plate, part 3: collections, write path, index lifecycle.
ATLAS.details("vector-database", {
  "collection-schema": {
    s: "The definition of a collection: its vector fields with dimension, element type and metric, its payload fields and types, its index settings and its sharding and replication.",
    d: "A schema is stored in the cluster metadata and versioned. It tells every component how to interpret bytes: the dimension fixes the stride of the vector file, the metric fixes the kernels and the index geometry, payload types fix the payload indexes. Some parts, such as adding a payload field or changing search defaults, can change in place; others, such as dimension, metric or element type, need a new collection. The difficulty is that the schema is both a contract with applications and a layout for files, and changing it online means building a second copy of the data.",
    k: ["Strict schema versus flexible: strict catches errors at write time and makes some changes costly, flexible accepts anything and moves errors to query time.", "Schema changes applied in place versus by creating a new collection: in place avoids a copy for safe changes, a new collection is the only safe route for layout-affecting ones."],
    p: ["Creating a collection with the wrong metric because defaults differ from the model's training, which is not discovered until quality is measured.", "A schema change that applies on some nodes before others, so replicas interpret data differently."],
    v: "Create a collection, change a payload type and add a field, then restart all nodes; confirm every node reports the same schema version and writes violating the schema are rejected.",
    dep: ["dimension-and-type-config", "embedding-model-binding"]
  },
  "embedding-model-binding": {
    s: "Records which embedding model, version and settings produced a collection's vectors, so queries are embedded identically and mismatches are detected.",
    d: "Vectors are only comparable when produced by the same model with the same preprocessing, truncation and normalization. The binding stores the model name, version, dimension and options in the schema, and optionally lets the database call the model on write and query. Queries from clients that supply a model identifier are checked against it. It also drives reindexing: moving to a new model means a new binding and a new collection or named vector. The difficulty is that a mismatch gives no error, only worse results, so the binding is the only guard.",
    k: ["Database calls the model versus client supplies vectors: database-side embedding keeps writes and queries consistent and adds a dependency and latency, client-side keeps the database simple and relies on discipline.", "Enforce the binding versus record it for information: enforcement stops mismatched writes and blocks legitimate experiments."],
    p: ["Writing vectors from a new model version into an old collection because the dimension happened to match.", "Updating the tokenizer or preprocessing in the application, which changes embeddings without a model version change."],
    v: "Attempt a write and a query tagged with a different model version than the collection's binding; confirm both are rejected or flagged and the binding appears in the schema export.",
    dep: ["collection-schema", "model-version-tracking"]
  },
  "dimension-and-type-config": {
    s: "Fixes the number of components per vector and their element type, such as 32-bit float, 16-bit float, 8-bit integer or bit, which determines storage, speed and accuracy.",
    d: "All vectors in a field have the same dimension, which lets storage be a fixed-stride array and kernels run with known loop sizes. Element type sets precision: half-precision floats halve memory with small loss, integers suit pre-quantized vectors, bits suit binary embeddings. Dimensions are padded to multiples the vector units like, usually without exposing it. The difficulty is that both settings are fixed at creation, so choosing 32-bit floats for a collection that would have been fine at half precision means a full rewrite later.",
    k: ["Higher precision versus lower: higher is safe and costs memory and bandwidth, lower saves resources and needs a quality check.", "Single dimension per field versus variable: fixed enables fast layout and requires separate fields for different models."],
    p: ["Sending vectors with the wrong dimension and having them accepted because padding hides the mismatch.", "Choosing a low-precision type that cannot represent the model's small values, flushing them to zero."],
    v: "Write vectors of the wrong dimension and type and confirm each is rejected with a specific error; compare retrieval quality in half precision against full on a labeled set.",
    dep: ["collection-schema", "float-precision-formats"]
  },
  "id-mapping": {
    s: "Maintains the mapping from the application's point IDs to compact internal numbers used in indexes and bitmaps, in both directions.",
    d: "Applications use strings, UUIDs or large integers, while indexes want dense small integers for arrays, bitmaps and graph links. The mapping table assigns an internal number when a point is first written and resolves hits back to external IDs at the end of a search. When a point is updated it may receive a new internal number in a new segment, while the old one is tombstoned. The table must survive restarts and be updated atomically with the data. The difficulty is size and lookup cost for billions of IDs, and keeping the mapping consistent with segments during compaction.",
    k: ["Dense internal numbers versus using application IDs directly: dense IDs shrink indexes and bitmaps and need a mapping to maintain, direct use is simple and bloats structures.", "One mapping per segment versus a global mapping: per segment composes with immutable files, global makes lookups simple and forms a hot, contended structure."],
    p: ["A mapping that lags behind a segment after a crash, returning internal numbers that resolve to nothing.", "Reusing internal numbers after delete while old index entries still refer to them."],
    v: "Upsert a point with a given ID several times, compact, restart and look it up; confirm exactly one live point resolves for the ID and search results return the same external ID.",
    dep: ["immutable-segments", "write-ahead-log"]
  },
  "named-vectors": {
    s: "Allows several vector fields per point, such as text, image and summary embeddings, each with its own dimension, metric and index, searched independently or together.",
    d: "A point holds a payload and a map from field name to vector. Each field has its own index and quantization, since dimensions and models differ. A search names the field to use, or searches several and fuses the results. This supports multimodal data, multiple models during a migration, and different granularities. Storage and index cost multiply by the number of fields. The difficulty is keeping all fields of a point consistent on update and making hybrid queries across fields efficient and meaningful.",
    k: ["Several vectors in one point versus separate collections joined by ID: one point keeps writes atomic and filters shared, separate collections allow independent scaling and need a join.", "Index every field versus only searchable ones: indexing everything wastes memory on fields used only for rerank."],
    p: ["Updating one vector field and leaving another from an old version of the content, so fields disagree.", "Fusing scores from fields that use different metrics as if they were comparable."],
    v: "Write points with two vector fields, search each field and a fused query, and update only the text field; confirm each search uses its own index and the image field remains unchanged.",
    dep: ["collection-schema", "hybrid-score-fusion"]
  },
  "collection-aliases": {
    s: "Stable names that point to a collection and can be re-pointed atomically, so applications keep using one name while the underlying collection is replaced.",
    d: "An alias resolves to a collection at request time. During a reindex, the new collection is built and verified in the background, then the alias is switched in one metadata operation, so applications see either the old or the new collection and never a mixture. A rollback is another switch. Aliases can also point to a set of collections for search across them. The difficulty is in-flight requests and caches that still hold the old target, and making the switch visible on every node at the same moment.",
    k: ["Alias switch versus application-side configuration change: an alias flips atomically for all clients and needs metadata support, configuration needs deploys and is not simultaneous.", "Alias to one collection versus a set: sets allow gradual migration and complicate scoring and deletion."],
    p: ["Dropping the old collection immediately after the switch, leaving no rollback if quality problems appear.", "Clients that cache the resolved collection ID and keep writing to the old one."],
    v: "Switch an alias under continuous query load; confirm no request fails, results flip from the old collection's to the new one's at the switch, and switching back restores the old results.",
    dep: ["collection-schema", "cluster-membership"]
  },
  "schema-validation": {
    s: "Checks every write and query against the schema: vector dimension and type, payload field types, ID format and size limits, before anything is stored or searched.",
    d: "On write, each vector is checked for dimension, finite values and optionally a norm, and each payload field for type and size. Invalid points are rejected with an error naming the point and field, and batches either fail whole or report per-point results. Queries are checked the same way. Validation runs before the write-ahead log so bad data never reaches storage. The difficulty is performance, because checking every component of every vector costs time on large uploads, and policy: a few bad points should not block a million-point load.",
    k: ["Reject the entire batch versus skip bad points: whole-batch rejection is atomic and annoying at scale, per-point reporting keeps loads moving and requires clients to handle partial success.", "Check for non-finite values versus trust the client: checks protect indexes from corruption at a small per-vector cost."],
    p: ["A vector containing NaN accepted into the index, silently breaking every distance that involves it.", "Validation applied on the API path but skipped by the bulk loader."],
    v: "Upload a batch with a NaN vector, a wrong-dimension vector and a mistyped payload; confirm each is reported with its index in the batch and valid points are handled as the batch policy states.",
    dep: ["collection-schema", "dimension-and-type-config"]
  },
  "write-ahead-log": {
    s: "An append-only record of every accepted write, flushed to disk before acknowledgment, so buffered data and in-progress changes survive a crash.",
    d: "Each write is serialized with its sequence number and appended; the node acknowledges after the log reaches the configured durability level, such as flushed to the operating system or synced to disk. On restart, the log after the last flushed segment is replayed into the in-memory buffer. Replicas receive the same log. Old log files are removed once their data is in durable segments. The difficulty is throughput versus durability: syncing every write limits speed, so writes are batched into group commits, and large vectors make logs big.",
    k: ["Sync on every write versus group commit: per-write sync is the safest and slowest, group commit trades a short window of possible loss or latency for throughput.", "Log full vectors versus references to bulk-loaded files: full logging is simple and doubles write volume, references are cheaper and need coordination."],
    p: ["Acknowledging after buffering in memory only, then losing acknowledged writes in a power failure.", "A log that grows without bound because truncation waits on a slow replica."],
    v: "Write acknowledged points, kill the process with a hard stop, restart and confirm every acknowledged point is present and searchable, and that log files shrink after the next flush.",
    dep: ["checksums-and-integrity", "vector-file-layout"]
  },
  "memtable-buffer": {
    s: "A small in-memory set of recently written points that is searched by exact scan alongside the main segments, so new data is searchable immediately.",
    d: "Writes go to the log and then into the buffer, a plain array of vectors with their payloads and a small index or none at all. Because the buffer is small, thousands to a few hundred thousand points, a flat scan over it is fast, and its results are merged with those from segments. When it reaches a size or age limit it is flushed into an immutable segment with a proper index. The difficulty is the boundary: searches must see a consistent view across buffer and segments during a flush, and updates to points already in a segment must hide the old version.",
    k: ["Flat scan of the buffer versus building an index incrementally: scan is simple and bounded, incremental indexing keeps latency low for a large buffer and costs write throughput.", "Small buffer with frequent flushes versus large buffer: small makes many segments, large uses memory and lengthens recovery."],
    p: ["Letting the buffer grow because flushes are throttled, which slows every query by the size of the scan.", "A query during flush that sees a point in neither the buffer nor the new segment."],
    v: "Write a point and search for it immediately; confirm it is returned from the buffer before any flush, then trigger a flush under concurrent queries and confirm it never disappears from results.",
    dep: ["write-ahead-log", "flat-scan", "segment-flush"]
  },
  "segment-flush": {
    s: "Turns the in-memory buffer into an immutable on-disk segment with its vector file, payload files and index, then retires the log entries it covers.",
    d: "The flush sorts or assigns internal numbers, writes vectors and payloads, builds the payload indexes and often a small or lazy vector index, and writes a manifest. Files are written to a temporary name, synced and renamed so a segment appears whole or not at all. Once the segment is registered, the buffer is cleared and the log position advances. Queries switch from buffer to segment atomically. The difficulty is the cost of building an index on every flush, so small segments are often left unindexed and scanned until a merge builds a real index.",
    k: ["Index at flush versus defer to merge: indexing at flush makes search fast sooner, deferring keeps flush cheap and leaves small segments scanned.", "Many small segments versus fewer larger flushes: small flushes shorten recovery and multiply per-segment search overhead."],
    p: ["A crash between writing files and registering the segment leaving orphan files that are never cleaned.", "Releasing log entries before the segment is durable."],
    v: "Flush under load, kill the process at random moments across several runs and restart; confirm each time the point counts equal the acknowledged writes with no duplicates and no orphan files remain.",
    dep: ["memtable-buffer", "immutable-segments", "checksums-and-integrity"]
  },
  "immutable-segments": {
    s: "Self-contained, read-only units of data, each with its own vectors, payload, indexes and tombstones, which queries search in parallel and background jobs merge.",
    d: "Once written, a segment's files never change except for its deletion marks. This makes concurrent reads lock-free, caching straightforward, snapshots and replication a matter of copying files, and crash recovery simple. A collection is a list of segments, and a query fans out across them and merges. Segments vary in size, from tiny recent flushes to huge merged ones, and have different index types. The difficulty is segment count: too many makes each query pay per-segment overhead and fan-out, and merging them rewrites data.",
    k: ["Immutable segments versus in-place updatable indexes: immutable gives simple concurrency and cheap snapshots with write amplification from merges, in-place avoids rewrites and needs fine-grained locking.", "Few large segments versus many small: large ones search efficiently and merge slowly, small ones adapt quickly and add per-segment overhead."],
    p: ["Unbounded growth in segment count from steady small writes when merging falls behind.", "Treating a segment's delete marks as immutable, so deletes appear not to work."],
    v: "Run a write-heavy workload and confirm segment count stays under its configured ceiling, query latency stays flat, and a copy of the segment files taken mid-run opens as a consistent collection.",
    dep: ["vector-file-layout", "tombstones-and-deletes", "checksums-and-integrity"]
  },
  "incremental-graph-insert": {
    s: "Adds new points directly into an existing graph index by searching for neighbors and linking them in, avoiding a rebuild for small amounts of new data.",
    d: "The insert follows the construction procedure: search the current graph for candidate neighbors, choose links with the selection rule and add reverse links, possibly pruning old links. It needs write locks on touched nodes or a copy-on-write scheme, which conflicts with lock-free reads. Quality can drift as many inserts follow the initial distribution less closely. Systems often restrict incremental inserts to a mutable segment and leave large segments immutable. The difficulty is concurrency with searches and the slow degradation of graph quality over many inserts.",
    k: ["Insert into a live graph versus buffer and rebuild: live insert makes data searchable in the main index quickly and complicates concurrency, buffering keeps the large index immutable at the cost of scanning the buffer.", "Lock per node versus copy-on-write: locks use less memory and can block readers, copy-on-write keeps reads smooth and uses more memory."],
    p: ["A reader following a link to a node that has been half updated and seeing an invalid neighbor list.", "Recall decay after a long run of incremental inserts that was never measured."],
    v: "Insert a million points incrementally into a graph built on another million and compare recall with a graph built from scratch on all two million; confirm the gap is within the stated bound and readers never fail.",
    dep: ["graph-construction", "neighbor-selection-heuristic", "memtable-buffer"]
  },
  "tombstones-and-deletes": {
    s: "Marks points as deleted without removing them from index structures, with the mark checked during search, until a merge physically drops them.",
    d: "A delete sets a bit in the segment's deletion bitmap and records the delete in the log. Searches skip marked points, but graph traversal still walks through them as stepping stones so connectivity is not broken. As the deleted fraction grows, searches waste work and recall can fall. Compaction rewrites the segment without deleted points and repairs or rebuilds the graph. An update is a delete plus a new insert. The difficulty is that deletes are cheap to apply and expensive to clean up, and physical removal lags logical removal.",
    k: ["Bitmap tombstones versus eager graph repair: tombstones are fast and leave the graph in place, repair keeps quality and slows deletes.", "Compact at a deleted-fraction threshold versus on a schedule: a threshold bounds waste per segment, a schedule is predictable and can leave heavy segments too long."],
    p: ["Deleted points still occupying the top-k slots when the filter is applied after the merge.", "Believing deleted data is gone from disk, when it persists in segments and backups until compaction."],
    v: "Delete half of a segment's points and confirm none appear in any query, then compare recall and latency before and after compaction and confirm the files shrink.",
    dep: ["immutable-segments", "write-ahead-log"]
  },
  "segment-merge-compaction": {
    s: "A background job that combines small or heavily deleted segments into new larger ones with a fresh index, then swaps them in and deletes the old files.",
    d: "A policy picks segments by size tier and deleted fraction. The job reads the live points, rebuilds the vector index, payload indexes and quantization, writes a new segment and registers it atomically, replacing the inputs. Merging reduces segment count, drops deleted data and improves graph quality. It is CPU, memory and I/O heavy, so it is rate-limited and often placed on separate resources. The difficulty is write amplification, since the same vectors are indexed repeatedly, and keeping merge from starving queries or falling behind writes.",
    k: ["Size-tiered merging versus merging by deleted fraction: tiers bound segment count and rewrite data repeatedly, deleted-fraction targets reclaim space and can leave many small segments.", "Merge on the serving node versus a dedicated builder: on-node is simple and competes with queries, dedicated isolates load and needs file transfer."],
    p: ["Merge storms right after a bulk load that evict hot data from caches and slow queries.", "Disk filling because a merge needs space for both the inputs and the output."],
    v: "Under steady writes and deletes, confirm segment count and deleted fraction stay within configured bounds, merge CPU stays under its cap, and p99 query latency does not exceed target during merges.",
    dep: ["immutable-segments", "tombstones-and-deletes", "index-build-pipeline"]
  },
  "update-as-delete-insert": {
    s: "Implements replacement of a point as a tombstone for the old version plus an insert of the new one, since indexed vectors cannot be changed in place.",
    d: "When an upsert arrives for an existing ID, the engine locates the old internal number, marks it deleted and writes the new vector to the buffer, atomically in the log. For a short time both versions exist, and searches must hide the old one. Payload-only updates can edit payload in place without involving the vector index. Frequent updates of the same points generate many tombstones and heavy merges. The difficulty is atomicity across the two steps and efficient lookup of the old version.",
    k: ["Delete plus insert versus in-place vector edits: delete plus insert keeps segments immutable and creates garbage, in-place edits save space and break the graph's geometry.", "Updating payload separately from vectors versus together: separate is cheap for metadata changes and needs version tracking."],
    p: ["A crash between the delete and the insert making the point vanish unless both are in one log record.", "A workload that rewrites the same points constantly turning most of the index into tombstones."],
    v: "Upsert the same ID with a new vector under concurrent queries; confirm each query returns either the old or the new version and never both or neither, and the final search finds the new vector.",
    dep: ["tombstones-and-deletes", "write-ahead-log", "id-mapping"]
  },
  "bulk-load": {
    s: "A fast path for loading a large dataset by writing segments directly and building the index once, instead of sending each point through the write path.",
    d: "The loader reads files from object storage or a stream, partitions the data, trains quantization codebooks on a sample, builds indexes in parallel on many cores or other machines, and registers finished segments. Skipping the log and the incremental insert saves a large factor in time and yields a better graph than inserting one at a time. During the load the collection may be hidden or read-only. The difficulty is atomicity and cleanup: a failed load must leave nothing visible, and the data must be searchable only when the index is complete.",
    k: ["Offline build then attach versus live ingestion: offline is much faster and yields better indexes, and data is not searchable until it completes.", "Bypass the log versus log everything: bypass is faster and needs the source data to be retained for recovery."],
    p: ["A load that aborts at ninety percent and leaves partial segments that appear in results.", "Loading with default parameters and discovering after hours that the index settings were wrong."],
    v: "Bulk load ten million vectors and compare time, recall and memory with inserting them one by one; confirm the data is invisible until completion and a forced failure leaves no partial segments.",
    dep: ["index-build-pipeline", "codebook-training", "object-storage-tier"]
  },
  "index-build-pipeline": {
    s: "The sequence that turns raw vectors into a searchable index: sample, train codebooks, build the graph or lists, quantize, write files and verify, runnable in parallel and resumable.",
    d: "Stages read vectors, optionally train quantization and partition centroids on a sample, assign vectors, build graph or list structures, encode compressed copies and write segment files with metadata that records parameters and versions. Builds are parallel over cores and sometimes across machines, with checkpoints so a long job can resume. A verification step samples queries against exact search to check recall before the index is accepted. The difficulty is resource use: builds need memory beyond the final index size and many cores, and must not disturb serving.",
    k: ["Build on serving nodes versus dedicated builders: serving nodes need no transfer and risk contention, builders isolate load and add file movement.", "Verify recall before accepting versus trust the build: verification catches bad parameters and costs a pass of exact search."],
    p: ["A build with a bad sample producing codebooks that give poor recall but a successful exit status.", "Peak memory during build exceeding the machine and the job being killed after hours."],
    v: "Run a build, kill it midway, resume and confirm the result equals an uninterrupted build in parameters and recall; confirm the verification step reports measured recall against exact search.",
    dep: ["graph-construction", "codebook-training", "recall-measurement"]
  },
  "background-index-builder": {
    s: "A scheduler that builds, rebuilds and optimizes indexes for segments that need them, on spare resources and without blocking reads or writes.",
    d: "It watches for unindexed segments, segments built with outdated parameters, and collections whose settings changed. It queues build jobs with priorities, limits concurrency, and throttles CPU and disk use against live traffic. Finished indexes are attached to segments atomically; until then the segment is scanned or uses its previous index. In a cluster, builders may be separate workers that read from object storage and write results back. The difficulty is staying behind the write rate without hurting queries, and the visible state: operators need to know that a collection is serving but not yet optimized.",
    k: ["Eager building as soon as a segment is full versus idle-time building: eager keeps queries fast and competes with them, idle-time protects latency and leaves slow segments longer.", "Share builders across tenants versus dedicated: sharing improves use and lets one tenant delay another's index."],
    p: ["Builder backlog growing until most data is in unindexed segments scanned by every query.", "A tenant's large reindex monopolizing builder capacity and delaying everyone's new data."],
    v: "Write data faster than one builder can index, then observe the backlog metric, query latency and the share of unindexed data; confirm the throttle keeps p99 within target and the backlog drains when writes slow.",
    dep: ["index-build-pipeline", "quotas-and-rate-limits", "immutable-segments"]
  },
  "model-version-tracking": {
    s: "Records which embedding model version produced each collection, segment or vector field, so mixed or stale data can be found and migrated.",
    d: "The version appears in the schema binding and in segment metadata. During a model upgrade, old and new vectors coexist in separate fields or collections, and the system must route queries embedded with the new model only to data from the new model. Reports show the fraction of data on each version and block queries that would compare across versions. Some systems tag each point. The difficulty is that most failures here are silent: comparing vectors from different models gives numbers, just meaningless ones.",
    k: ["Version per collection versus per point: per collection is simple and requires a whole-copy migration, per point allows gradual migration and complicates search.", "Block cross-version queries versus warn: blocking prevents silent errors and stops legitimate comparisons for experiments."],
    p: ["Treating two versions with the same dimension as compatible, because nothing fails when they are mixed.", "Losing track of which version a collection holds after a restore from an old snapshot."],
    v: "Tag two collections with different model versions, send a query tagged with a third version and confirm it is refused; confirm the version report shows the right counts per collection.",
    dep: ["embedding-model-binding", "collection-schema"]
  },
  "shadow-reindex": {
    s: "Builds a complete new index, with a new embedding model or new parameters, alongside the live one while serving continues, then compares the two before switching.",
    d: "Source content is re-embedded with the new model and written to a shadow collection, while ongoing writes are applied to both. When complete, the shadow is evaluated: recall against exact search, quality on a labeled query set, latency and memory. Sampled live queries can be sent to both and compared. The cost is double storage and the compute of re-embedding the entire corpus. The difficulty is keeping the two in sync during a long build and having the original content available, because stored vectors cannot be converted from one model to another.",
    k: ["Dual-write during the build versus snapshot and replay: dual-write keeps shadow current and doubles write cost, replay is cheaper and needs a change log.", "Re-embed from source versus transform old vectors: source is always correct and expensive, learned transforms are cheap and approximate."],
    p: ["No stored source content, so re-embedding is impossible.", "Switching based on average relevance while a subset of queries, such as rare languages, got much worse."],
    v: "Build a shadow with a new model while writes continue, then compare it to the live collection on a labeled set and on sampled live queries; confirm point counts match and the report lists quality and latency differences.",
    dep: ["embedding-ingest-hook", "model-version-tracking", "bulk-load"]
  },
  "blue-green-cutover": {
    s: "Moves traffic from the old index to the new one in a single atomic step or by gradually shifting a fraction of queries, with the old index kept for instant rollback.",
    d: "After validation, an alias switch directs queries to the new collection. A gradual variant sends a growing percentage to the new index and watches quality and latency signals. Writes continue to both until the old one is retired. The old collection is retained for a set period. Applications see one name throughout. The difficulty is the quality signal: fast signals such as latency are available immediately, while relevance feedback arrives slowly, so rollback criteria must be set in advance.",
    k: ["Atomic switch versus gradual shift: atomic is simple and risks the whole user base, gradual limits blast radius and runs two indexes longer.", "Keep the old index for a week versus delete after the switch: retention is costly and makes rollback safe."],
    p: ["Retiring the old index before the new one has seen peak traffic.", "Stopping dual writes at cutover, so a rollback loses the writes made since."],
    v: "Shift ten percent of queries to the new index, compare click or relevance feedback and latency against the control, then roll back and confirm results and write state return to the old collection with no lost writes.",
    dep: ["collection-aliases", "shadow-reindex"]
  },
  "embedding-ingest-hook": {
    s: "An optional step that calls an embedding model on text or other content at write and query time, so clients can send raw data instead of vectors.",
    d: "On write, the hook batches content, calls the configured model service, handles rate limits and retries, and stores the vector together with the source or a pointer to it. On query, it embeds the query text with the same model and options. It records the model version in the binding. Batching and caching amortize the cost, since model calls are far slower than the database write. The difficulty is failure handling: a model outage must not lose data or block unrelated operations, and the hook must produce identical embeddings for queries and documents.",
    k: ["Embed inside the database versus in the client application: inside guarantees consistency and couples availability to the model service, outside decouples and relies on clients.", "Synchronous embedding on write versus a queue: synchronous is simple and slow, a queue smooths spikes and makes data searchable later."],
    p: ["Model service rate limiting causing partial batches and duplicate writes on retry.", "Different preprocessing, such as truncation lengths, on the write and query paths."],
    v: "Write raw text points, query by text and by the vector the model returns for the same text; confirm identical scores, then disable the model service and confirm writes queue or fail cleanly with no partial points.",
    dep: ["embedding-model-binding", "write-endpoints"]
  },
  "drift-detection": {
    s: "Monitors whether the distribution of incoming vectors or queries has moved away from what the index and its quantization were built for, signaling when to retrain or rebuild.",
    d: "It compares statistics of recent vectors with those of the training sample: distribution of distances to centroids, list sizes, norms, quantization reconstruction error and the recall measured on a fixed query set. A rising reconstruction error or an unbalanced partition suggests that codebooks or centroids are stale. Drift in queries, such as new topics, can be detected by comparing query vectors with the corpus. The difficulty is separating harmless change from real degradation, and setting thresholds that trigger rebuilds rarely enough to be affordable.",
    k: ["Distribution statistics versus recall measurements: statistics are cheap and indirect, recall is direct and costs exact searches.", "Automatic retraining on trigger versus alert a human: automatic keeps quality and risks surprise rebuild costs."],
    p: ["Codebooks trained on last year's data degrading recall with no error anywhere.", "A seasonal burst of unusual content triggering needless rebuilds."],
    v: "Insert a batch of vectors from a different distribution and confirm the drift report shows rising reconstruction error and list imbalance, and that retraining on the new mix restores measured recall.",
    dep: ["recall-measurement", "codebook-training", "coarse-quantizer"]
  }
});
