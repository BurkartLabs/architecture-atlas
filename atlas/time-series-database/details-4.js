// Details for the time-series database plate, part 4: write path, head, series identity and index.
ATLAS.details("time-series-database", {
  "appender-transaction": {
    s: "The batch-oriented write interface: a caller adds samples to a transaction, then commits it once, making all of them durable and visible together or not at all.",
    d: "An appender looks up or creates the series for each label set, checks timestamp and type rules, and buffers the sample. On commit, the batch is written to the log as one record and then applied to the in-memory head, so readers never see half a batch. Rollback discards the buffer. Each appender is used by one writer, which avoids locks on the hot path while the shared series map handles contention. The difficulty is ordering: log first, then memory, and visibility must not run ahead of durability.",
    k: ["Commit per batch vs per sample: batch commits amortize log writes and locking; a failure then affects the whole batch.", "Log before head vs head before log: log first guarantees nothing visible is lost after a crash; head first is faster but can expose data that disappears on restart."],
    p: ["Holding an appender open across a slow operation delays visibility of everything written in it.", "A rollback after the log write leaves the record in the log, which replay then applies unless it is marked."],
    v: "Commit a batch of 1,000 samples and crash the process immediately after the commit returns; restart and confirm all 1,000 are present. Roll back another batch and confirm none appear.",
    dep: ["head-series-map", "write-ahead-log", "head-block"]
  },
  "head-block": {
    s: "The mutable, in-memory structure holding the most recent samples and the index of all active series, which serves queries for the newest data.",
    d: "The head holds, for each active series, its labels, the currently open chunk and recently completed chunks, plus an inverted index over those series. It covers a time range, typically the last few hours, then is cut into an immutable block. Writes append to open chunks; reads iterate them. Old chunks beyond a threshold are flushed to memory-mapped files. Memory use is dominated by series count, not sample rate. The difficulty is bounding that memory, and restoring the head quickly after a restart by replaying the log.",
    k: ["Keep the head wholly in memory vs a larger on-disk head: memory gives the fastest ingest and queries; a disk-backed head handles more series but slows both.", "Longer head window vs shorter: a longer window gives larger, better-compressed first blocks and fewer files; a shorter window uses less memory and loses less on a crash."],
    p: ["Series count growth makes memory climb until the process is killed, and every restart replays the full log slowly.", "Queries over the head contend with writes on shared series locks during bursts."],
    v: "Ingest steady load and confirm memory tracks active series count, not sample rate; restart the node and confirm head series and the latest samples are restored to the pre-restart values.",
    dep: ["head-series-map", "postings-index", "mmap-head-chunks"]
  },
  "head-series-map": {
    s: "The in-memory table from series identity to series state, striped across many locks so thousands of writers can look up and create series concurrently.",
    d: "Series are looked up by hash of their labels, with a collision check against the full label set, and by a numeric reference used by the log and chunks. The map is divided into stripes, each with its own lock, so unrelated series rarely contend. A lookup that finds an existing series is cheap; creating one allocates the state, writes the labels to the log, and adds postings. Series with no recent samples are garbage collected at truncation. The difficulty is correctness of concurrent creation and collision handling, and the memory overhead per series.",
    k: ["Striped locks vs a single lock-free map: striping is simple and predictable; lock-free structures reduce contention at the cost of complexity and harder memory reclamation.", "Cache series lookups in the writer vs look up each time: caching saves hashing and locking on repeat writes; it must be invalidated when series are deleted."],
    p: ["Two writers creating the same new series at once, without a recheck under the lock, create duplicates.", "A hash collision handled by comparing hashes only, not labels, merges two series."],
    v: "Run many concurrent writers all writing the same new label set and confirm exactly one series exists afterward, with every sample attributed to it.",
    dep: ["series-identity-hashing", "series-reference-ids"]
  },
  "write-ahead-log": {
    s: "An append-only log of series definitions and samples written before they reach the head, so a crash loses at most the unsynced tail and the head can be rebuilt.",
    d: "Records for new series and for batches of samples are appended to numbered segment files, usually with compression, and flushed according to a sync policy. After a crash the log is replayed to rebuild the head. Segments are fixed size, such as 128 megabytes, and old ones are truncated once their data is in a block. Records have checksums so a torn final record is detected and ignored. The difficulty is the durability and throughput tradeoff of sync frequency, and keeping replay time bounded when ingest is heavy.",
    k: ["Sync every commit vs periodically: syncing every commit loses nothing acknowledged but caps write rate at the disk's sync speed; periodic sync allows high rates and risks the last interval.", "Compressed records vs raw: compression saves disk and write bandwidth at CPU cost; raw is faster to write and replay."],
    p: ["A log on the same disk as blocks competes with compaction I/O and stalls ingest.", "Sample records replayed before the series records they refer to are dropped as unknown, losing data."],
    v: "Kill the process with a hard stop in the middle of a write load, restart, and confirm the replay reports the expected number of records, tolerates a torn final record, and queries match the acknowledged writes.",
    dep: ["chunk-checksums"]
  },
  "wal-checkpoint-replay": {
    s: "Periodically rewrites the log to keep only records for series still alive and samples not yet in a block, and replays it at startup to restore the head.",
    d: "When the head is truncated after a block is written, the log segments covering the old range are no longer needed. A checkpoint copies from those segments only the series records for series that remain and the samples newer than the cutoff, then deletes the old segments. Replay reads the latest checkpoint and then later segments, in parallel across series shards, to rebuild memory. The difficulty is startup time: replay speed bounds downtime after a restart, and the checkpoint must be consistent even if a crash interrupts it.",
    k: ["Checkpoint at truncation vs rely on segment deletion: a checkpoint preserves live series definitions and keeps replay short; deleting segments alone would lose labels for still-active series.", "Parallel replay vs sequential: parallel replay cuts restart time; it needs per-series ordering and more memory during replay."],
    p: ["A crash during checkpointing leaves a partial checkpoint that must be detected and discarded, or replay starts from bad state.", "Very large heads take many minutes to replay, so a restart looks like a long outage."],
    v: "Fill the head with a million series, restart, and measure replay duration; confirm all series and samples are present afterward and the time stays within the node's startup budget.",
    dep: ["write-ahead-log", "head-series-map"]
  },
  "mmap-head-chunks": {
    s: "Completed in-memory chunks are written to disk files and memory-mapped, keeping only the small open chunk per series in heap memory.",
    d: "When a chunk is full, it is appended to a head-chunk file and referenced by file and offset. The operating system's page cache then decides which chunk bytes stay in memory. This cuts the heap footprint of the head dramatically, since most of a series' recent data is no longer on the heap. After a crash, these files let replay skip rebuilding completed chunks and recover only the log tail. The difficulty is dependence on page cache behavior: a cold or thrashing cache makes head queries do disk reads.",
    k: ["Map completed chunks vs keep all in the heap: mapping lowers memory and speeds restart; reads then depend on the page cache and can pause on disk.", "Single append file vs many small files: appended files are efficient and sequential; many small files delete cleanly but add file-handle pressure."],
    p: ["A node with memory pressure evicts mapped pages and recent queries slow suddenly.", "Corrupted mapped chunk files are detected only when read unless verified at startup."],
    v: "Ingest until chunks complete, restart, and confirm head memory is lower than a baseline with all chunks in heap, and that queries for the previous hour return correct samples straight after startup.",
    dep: ["chunk-format", "head-block"]
  },
  "out-of-order-buffer": {
    s: "A separate structure in the head that holds late samples for a series, accepted within the allowed window, and merged with in-order data when read or compacted.",
    d: "Samples older than the newest in a series but inside the window are written to a per-series out-of-order chunk set, logged separately so replay can restore them. Reads merge the in-order and out-of-order streams by timestamp. When the head is compacted, the out-of-order data is sorted and merged into the block, creating overlapping blocks if needed. It leaves the hot path for normal data unchanged. The difficulty is memory, since out-of-order chunks are less compressible and sorted work is needed at flush time.",
    k: ["Separate out-of-order chunks vs inserting into the main chunk: separate chunks keep the common path append-only; inserts into compressed chunks would require rewriting them.", "A bounded time window vs unbounded: a window caps memory and merge work; unbounded acceptance supports any backfill but cannot be sized."],
    p: ["Enabling a wide window for one slow agent makes every series carry extra chunk overhead.", "Overlapping blocks from late data increase query merge work until vertical compaction runs."],
    v: "Write samples out of order within the window, query the range, and confirm all are returned in timestamp order exactly once; restart and confirm the late samples survive replay.",
    dep: ["out-of-order-ingest", "head-series-map", "write-ahead-log"]
  },
  "head-truncation": {
    s: "Cutting the oldest part of the head into an immutable block, then removing flushed chunks, series without recent data and the log segments covering them.",
    d: "At regular intervals the oldest portion of the head, usually two hours, is written to a block by the head compaction. Once the block is in place, the head drops chunks older than its end, deletes series with no samples left, removes their postings and truncates log segments through a checkpoint. A short overlap is kept so queries do not see a gap while the new block is registered. The difficulty is ordering: the block must be readable before head data disappears, and a crash at any step must leave a consistent state.",
    k: ["Truncate after the block is registered vs before: after is safe against crashes and gaps; before frees memory sooner but can lose data.", "Garbage-collect series at truncation vs continuously: at truncation is cheap and batched; continuous collection reclaims earlier but adds lock traffic."],
    p: ["A slow block write delays truncation, and the head grows beyond its configured window and memory.", "A series that stops and restarts every window churns memory by being created again each time."],
    v: "Run through a truncation cycle under write load and confirm queries spanning the cutover return continuous data with no gap and no duplicates, and head series count drops by the churned series.",
    dep: ["head-compaction", "wal-checkpoint-replay", "head-block"]
  },
  "series-identity-hashing": {
    s: "A stable hash of the sorted label set that serves as a series' identity for lookups, sharding and deduplication, with a collision check against the full labels.",
    d: "Labels are sorted by name and hashed together with their values into a 64-bit number, with separators so that different splits of the same characters do not collide. The hash picks the series map stripe, the ring position and, in a cluster, the owner nodes. Because a 64-bit hash can collide, the series map confirms equality with the real label set. Stability matters: the hash function and ordering must never change across versions, or data would be resharded and series split. The difficulty is speed, since the hash runs for every sample and per scrape.",
    k: ["A fast non-cryptographic hash vs a strong one: fast hashes keep ingest cheap and are fine for sharding; strong hashes resist adversarial collisions but cost CPU on every sample.", "Hash the tenant with the labels vs labels alone: including the tenant spreads each tenant evenly; omitting it keeps identical series together across tenants, which is never wanted."],
    p: ["Changing hash seed, label ordering or separator across versions reshards the cluster and splits history.", "Treating the hash as unique, with no equality check, silently merges two different series after a collision."],
    v: "Hash a million random label sets and check the observed collision count matches expectation, with the equality check catching every one; confirm the same label set gives the same hash across restarts and versions.",
    dep: ["series-and-labels"]
  },
  "series-reference-ids": {
    s: "Compact numeric ids assigned to series, used by the log, chunks and index instead of repeating label sets, and unique within a head or a block.",
    d: "When a series is created it gets a reference, typically an increasing integer in the head and an offset into the series section within a block. The log refers to it in sample records, postings lists contain these ids, and chunk metadata hangs off them. This saves repeated label strings and makes postings lists integer arrays that compress and intersect quickly. References are local: the head's id is different from the block's. The difficulty is ensuring they are never reused for a different series while old data still refers to them.",
    k: ["Monotonic integer ids vs hashes as ids: sequential ids make postings lists sorted by creation and compact; hashes are stable across restarts but make lists unsorted and larger.", "Block-local ids vs global ids: local ids are small and need no coordination; global ids simplify cross-block references but need a central allocator."],
    p: ["Reusing an id after garbage collection while a log record or cache still points at it attributes samples to the wrong series.", "Assuming ids are stable across blocks makes cross-block merging return wrong joins."],
    v: "Create and delete series repeatedly, then replay the log and confirm every sample maps to the series with the labels it was written with and no id is shared by two label sets.",
    dep: ["series-identity-hashing"]
  },
  "symbol-table": {
    s: "A deduplicated table of every distinct label name and value string, so series entries and postings store small integer offsets instead of repeating text.",
    d: "In a block, the symbol table is a sorted list of all unique strings used in labels. Series entries refer to name and value by symbol number. Because label names and many values repeat across millions of series, storing each once greatly shrinks the index, and comparisons become integer comparisons. Lookups binary-search the sorted table. In the head, an interning pool plays the same role. The difficulty is size and build cost: the table must fit in memory for large blocks and is built, sorted and written during compaction.",
    k: ["Sorted symbols with offsets vs a hash map: sorted order allows binary search and prefix scans at low memory; a map gives faster lookup at higher memory.", "Intern strings in the head vs keep copies per series: interning cuts memory a lot when values repeat; it needs reference counting or periodic cleanup."],
    p: ["A label with unique values per series makes the symbol table as large as the series count and removes any deduplication benefit.", "A very large symbol table loaded fully at block open delays startup and query warmup."],
    v: "Compare index size for one million series sharing a common set of label values against the same series with unique values, and confirm the shared case is smaller by roughly the repeated string bytes.",
    dep: ["series-and-labels"]
  },
  "postings-index": {
    s: "The inverted index mapping each label name and value pair to the sorted list of series ids that carry it, used to find series for a selector.",
    d: "For every pair such as region equals us-east there is a postings list: a sorted array of series references. To select, the engine fetches the list for each equality matcher and combines them. Lists are stored delta-encoded or as compressed bitmaps. A special list covers all series so negations can be computed. In the head, the index is mutable and updated as series are created; in a block it is written once, with a table of contents giving each list's offset. The difficulty is size and update cost for very large lists such as one covering every series.",
    k: ["Sorted integer lists vs bitmaps: sorted lists are compact for sparse labels and simple to merge; bitmaps intersect faster for dense labels but waste space on sparse ones.", "Index in the head in memory vs on disk: in memory gives instant updates and lookups; disk would allow more series but slows creation."],
    p: ["A label shared by every series has a postings list as long as the series count, and selecting on it alone reads everything.", "Postings lists that are not kept sorted when appended make intersection silently return wrong results."],
    v: "Select on two labels in a block with a million series and confirm the returned ids equal the brute-force intersection; verify the lists on disk are strictly increasing.",
    dep: ["series-reference-ids", "symbol-table"]
  },
  "postings-intersection": {
    s: "Combines postings lists for several matchers by intersection, union and difference, with the shortest list driving the work, to produce the final series set.",
    d: "For a selector with several matchers, each yields a postings iterator: equality gives one list, a regex gives a union of lists for each matching value, and a negation is the difference from the all-series list. The engine intersects them using merge or skip-ahead seeks, starting from the smallest list so large lists are mostly skipped. The result is an iterator of series ids, resolved lazily. The difficulty is ordering and avoiding materialization of huge intermediate sets, as a union over many values can be larger than the final answer.",
    k: ["Drive from the smallest list vs left-to-right order: smallest-first skips most of large lists; it needs list sizes known before starting.", "Lazy iterators vs materialized arrays: iterators bound memory and can stop early; arrays make repeated passes simple and cost memory."],
    p: ["A regex matching 100,000 values unions 100,000 lists before any intersection can reduce them.", "Intersecting without seek support walks every element of a very long list to find one match."],
    v: "Compare the number of postings elements read for a selector with one rare and one common matcher; it should be close to the rare list's size, not the common list's.",
    dep: ["postings-index"]
  },
  "label-value-index": {
    s: "Per-label-name lists of distinct values, used to answer label-value queries, power autocomplete and expand regex matchers into concrete values.",
    d: "For each label name the index keeps the sorted set of values it takes. A regex matcher scans this list to find matching values and then fetches the postings of each. Metadata queries, such as every region or every metric name, read it directly. In a block it is built from the symbol table and postings table of contents; in the head it is maintained as series arrive. The difficulty is size for high-cardinality labels, where the list is as large as the series count, and the scan cost of regexes over it.",
    k: ["Sorted value list with prefix lookup vs hash set: sorted lists support prefix and range matchers and compact storage; hash sets give faster exact lookups only.", "Compute values on demand from postings vs store them: on demand saves space and costs time for each query; stored lists are fast and need maintenance."],
    p: ["Listing values for a label with millions of values in an autocomplete box times out the query node.", "A stale value list in the head keeps values of deleted series, so regexes match nothing that exists."],
    v: "Query the values for a label with known contents and confirm they match exactly, and that a regex matcher expands to the same series set as an explicit list of those values.",
    dep: ["postings-index", "symbol-table"]
  },
  "regex-matcher-optimization": {
    s: "Reduces the cost of regex label matchers by extracting literal prefixes, recognizing alternations and anchored forms, and checking an upfront set of values before running a full match.",
    d: "A matcher such as a prefix followed by a wildcard can be answered by a range scan over the sorted value list. An alternation of literals becomes a set of equality lookups. Patterns that match everything or the empty string are simplified. For general patterns, a compiled automaton runs against each value, and cheap checks such as required substrings rule out most before it runs. Results may be cached per block. The difficulty is correctness: the optimization must give the same matches as the full pattern, including empty values and anchoring rules.",
    k: ["Rewrite patterns to literals vs always run the automaton: rewriting turns many queries into direct lookups; it adds a parser whose edge cases must be tested against the full engine.", "Cache matcher results vs recompute: caching helps repeating dashboards; the cache needs invalidation as new values arrive."],
    p: ["An optimization that treats a pattern as a prefix when it is not anchored returns too few series.", "Patterns with nested quantifiers cause exponential backtracking if the engine is not linear-time."],
    v: "Run each pattern in a large corpus through the optimized and unoptimized matchers over the same values and confirm identical match sets, and that literal and prefix patterns do fewer value comparisons.",
    dep: ["label-value-index", "selector-matching"]
  },
  "series-churn-handling": {
    s: "Dealing with series that appear and disappear quickly, such as per-pod or per-job labels, which bloat the index and head even though each lives briefly.",
    d: "Container restarts, short jobs and rolling deployments create new label values constantly, so the total number of series over a window far exceeds the number active at once. The head holds only recent series, but every block's index contains every series that had a sample in it, and queries over long ranges must consider all of them. Mitigations include dropping the volatile label at ingest, aggregating with recording rules, shorter compaction cycles, and head garbage collection. The difficulty is that churn is invisible in a count of active series.",
    k: ["Drop churning labels at ingest vs keep them: dropping stops the growth at the source; keeping them allows debugging individual instances but costs index size and query time.", "Aggregate away instance labels in rules vs query raw: aggregation gives cheap long-range views; raw series remain for short-term investigation and expire sooner."],
    p: ["Active series stays flat while total series per block grows daily, so only query latency over long ranges shows the problem.", "Deploying every hour with a version label makes each release a new set of series for every metric."],
    v: "Run a deployment simulation that replaces all instance labels every hour, and compare series per block and long-range query latency with and without the drop rule; the dropped case should stay flat.",
    dep: ["head-series-map", "cardinality-analysis"]
  },
});
