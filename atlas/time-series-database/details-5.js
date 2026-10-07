// Details for the time-series database plate, part 5: chunk encoding, blocks, columnar events.
ATLAS.details("time-series-database", {
  "chunk-format": {
    s: "The container for a run of samples from one series: a small header, an encoding tag and a compressed bit stream, sized so a query decodes only what it needs.",
    d: "A chunk holds roughly 120 to a few hundred consecutive samples of one series. A header records the encoding and sample count, followed by the bit-packed timestamps and values. Chunks are append-only while open, then sealed and referenced from the index by minimum and maximum time, so a query can pick chunks overlapping its window without decoding them. Different value types use different encodings under the same container. The difficulty is that reading is sequential within a chunk, so format choices balance compression, decode speed and seek cost.",
    k: ["Small chunks vs large: small chunks reduce wasted decoding for narrow queries and limit loss; large chunks compress better and cut index and header overhead.", "One generic format with encoding tags vs separate types: tags allow adding encodings later and mixed types per series; separate formats are simpler to optimize."],
    p: ["A chunk format change without a version tag makes old blocks unreadable after an upgrade.", "Chunks cut at irregular times produce odd overlaps that defeat time-range pruning."],
    v: "Write a series, close the chunk, and read it back by time window, confirming only the overlapping chunk is decoded in the statistics and every sample round-trips exactly.",
    dep: ["delta-of-delta-timestamps", "xor-float-compression"]
  },
  "delta-of-delta-timestamps": {
    s: "Encodes timestamps as the difference between successive intervals, so evenly spaced samples cost one bit or less each.",
    d: "The first timestamp is stored in full, the second as a delta, and each later one as the change in delta from the previous interval. Regular scraping makes that second difference zero, which is stored as a single bit. Small deviations use short variable-width codes in a few buckets; large jumps use a longer escape. Decoding replays the sums. Typical series spend around a bit per timestamp. The difficulty is irregular timing: jitter or event-driven timestamps produce non-zero second differences and the gain shrinks, and decoders must handle negative deltas.",
    k: ["Delta of delta vs plain delta: delta of delta exploits regular intervals and gets close to zero bits; plain delta is simpler and does better for erratic timing.", "Bucketed variable-width codes vs a fixed width: variable widths adapt to jitter; fixed widths decode faster but waste bits on the dominant zero case."],
    p: ["Timestamps with unstable jitter, such as clock-skewed agents, push the encoding into wide buckets and double the chunk size.", "An overflow in the delta arithmetic on huge gaps produces a wrong timestamp if not guarded."],
    v: "Encode ten thousand timestamps at exact intervals and confirm about one bit each; add random jitter and confirm cost rises accordingly while decoding returns every timestamp exactly.",
    dep: ["chunk-format"]
  },
  "xor-float-compression": {
    s: "Encodes each float value as the XOR with the previous one, storing only the changed middle bits, which makes slowly changing values very small.",
    d: "Consecutive values in a metric are often identical or share sign, exponent and high mantissa bits. XOR with the previous value gives zero when equal, stored as one bit; otherwise, the encoder stores the position and length of the non-zero bit window, reusing the previous window when it fits. Counters that increase by small integers and gauges that hold steady compress to a few bits per sample. Decoding XORs back. The difficulty is noisy data, such as random latencies, where every mantissa bit changes and the encoding barely compresses.",
    k: ["XOR on raw bits vs delta on values: XOR needs no arithmetic and handles any float losslessly; delta works well for integer-like counters but needs exact representability.", "Lossless vs lossy rounding at ingest: lossless keeps exact values; rounding low bits first improves compression and changes data."],
    p: ["High-precision noisy gauges use about 64 bits per sample, so storage estimates based on averages fail.", "Special values such as not-a-number have multiple bit patterns that XOR treats as changes, and staleness markers rely on a specific one."],
    v: "Compress a constant series, a linear counter and random noise, and confirm bits per sample are near one, a few, and near 64 respectively, with exact value recovery for all.",
    dep: ["chunk-format"]
  },
  "integer-run-length-encoding": {
    s: "Compact encodings for integer and repeated values: variable-length integers, deltas for counters and run-length coding for long stretches of one value.",
    d: "Integer fields are often better stored as integers than as floats: counters, flags and enumerations compress with zigzag-coded deltas and variable-length bytes or bit packing. Boolean and state fields that stay constant for long periods compress to a count and a value with run-length encoding. Strings use a dictionary and are covered under columnar storage. The encoder picks per chunk or per block from a few schemes by trying them or by statistics. The difficulty is selecting cheaply and decoding quickly without making random access slower.",
    k: ["Choose the encoding per chunk vs per series: per chunk adapts to changing behavior; per series is cheaper to decide and misses shifts.", "Run-length vs bit packing: run-length is excellent for stable values and bad for alternating ones; packing has predictable size on every pattern."],
    p: ["A flag that flaps every sample makes run-length encoding larger than raw storage.", "Integers stored as floats lose exactness above 2^53 and cannot use integer encodings."],
    v: "Encode a field that is constant for an hour, one that counts up by one, and one that alternates each sample, and confirm sizes follow the scheme's expectation and decode back identically.",
    dep: ["chunk-format"]
  },
  "histogram-chunk-encoding": {
    s: "A chunk encoding for histogram samples that stores bucket layout once and each sample's bucket counts as deltas, with the sum and count compressed like floats.",
    d: "A histogram sample has a schema, a zero bucket, spans describing which buckets are populated, bucket counts, a count and a sum. The chunk stores the layout of spans once and rewrites it only when it changes, then stores each sample's bucket counts as delta from the previous sample, with a second-order delta for counters. Resets and schema changes are detected and cut a new chunk. The difficulty is handling layout changes between samples, and the extra decode work for thousands of buckets per sample.",
    k: ["Store layout per chunk vs per sample: per chunk saves space when buckets are stable; per sample is simpler and wastes bytes on every point.", "Integer histograms vs float histograms: integers compress better and suit counters; floats are needed for results of operations such as rates and averages."],
    p: ["A layout change every few samples fragments chunks into tiny ones and loses compression.", "A counter reset in a native histogram must be detected from bucket counts, not just the total count."],
    v: "Ingest a histogram with a stable layout and one with a layout that changes each sample, and compare chunk size per sample; confirm both decode to the original buckets exactly.",
    dep: ["chunk-format", "native-histograms"]
  },
  "chunk-sizing": {
    s: "Rules for when an open chunk is closed and a new one started: sample count, time span and size, tuned so chunks are neither tiny nor too wide to skip.",
    d: "An open chunk is cut when it reaches a target sample count, often 120, or covers a maximum time span, or when its data has shifted the head across a chunk boundary. Cutting at the same time across series, by aligning to the head's time range, lets chunks of one series fit neatly into blocks and avoids many partial chunks at compaction. Smaller chunks bound memory per series; larger ones increase compression. The difficulty is series with sparse samples, where waiting for the count makes a chunk span days and defeats time pruning.",
    k: ["Cut by count vs by time span: count gives uniform compression; time span bounds the range a chunk covers and keeps pruning effective for sparse series.", "Align chunk boundaries across series vs independent: alignment simplifies blocks and queries; independence avoids bursts of simultaneous chunk cuts."],
    p: ["Sparse series produce chunks covering many hours, so every query overlapping any part decodes the whole chunk.", "Aligned cuts make every series finish a chunk at the same moment, producing a periodic write spike."],
    v: "Write a dense series and a series with one sample per hour, and confirm both produce chunks bounded by the configured count and time span, with no chunk covering more than the span limit.",
    dep: ["chunk-format", "head-block"]
  },
  "chunk-checksums": {
    s: "Checksums over chunks, index and log records that detect corruption from bad disks, partial writes and bugs, so damaged data is reported instead of served.",
    d: "Each chunk in a file is followed by a checksum of its bytes, and the index and log records carry their own. Readers verify when they read the bytes, and a background verifier can scan whole blocks. A mismatch fails the read for that chunk, marks the block, and raises a metric rather than returning garbage as data. Checksums catch torn writes after a crash and silent disk errors. They do not repair. The difficulty is the cost of verification on the hot read path, and what to do after detection.",
    k: ["Verify on every read vs only in a scrubber: verifying always catches corruption before it reaches a user at CPU cost; scrubbing is cheap and detects late.", "Fail the query vs skip the chunk: failing is honest and never gives wrong numbers; skipping keeps dashboards up but returns holes."],
    p: ["Corruption in a block with no replica or backup copy cannot be repaired and the range is lost.", "Checksums computed over the compressed bytes miss bugs in the encoder that produced bad data."],
    v: "Flip a byte inside a stored chunk, query the range, and confirm the read fails with a checksum error naming the block and the corruption metric increments; the rest of the data remains readable.",
    dep: []
  },
  "block-layout": {
    s: "The on-disk directory for a time range: a metadata file, an index, a set of chunk files and a tombstone file, written once and then only read.",
    d: "A block directory holds a meta file with time range, statistics and provenance; an index with the symbol table, series entries, postings and their table of contents; chunk segment files of limited size referenced by offset; and tombstones recording deletions. Once written, the block is never modified except for tombstones, which makes it safe to cache, copy and upload. A block covers a fixed range such as two hours, later merged into larger ranges. The difficulty is the write order: the directory must appear atomically, through a temporary name and a rename.",
    k: ["Immutable blocks with an external tombstone file vs rewriting on delete: immutability allows simple concurrency, caching and copies; deletes then cost nothing until compaction rewrites the data.", "Separate index and chunks vs interleaved: separation allows the index to be loaded and cached on its own; interleaving is simpler and reads one file per series."],
    p: ["A crash before the final rename leaves a partial directory that must be recognized and deleted at startup.", "Copying a block while it is being written produces an unusable copy."],
    v: "List a block directory and confirm the meta, index, chunks and tombstones files exist; kill the process during a block write and confirm startup removes the partial directory and no block with the temporary name is loaded.",
    dep: ["chunk-format", "postings-index", "symbol-table"]
  },
  "block-metadata": {
    s: "A small file describing a block: its ULID, minimum and maximum time, sample, series and chunk counts, compaction level and the source blocks it was built from.",
    d: "The meta file is read first when the database opens a block. The time range lets queries skip blocks quickly; the counts support statistics and retention by size; the compaction level and parent list record history so the planner knows what has been merged and so that an interrupted compaction can be recovered by removing parents or children. Block ids are sortable by creation time. External systems add labels, such as the tenant or the downsampling resolution. The difficulty is keeping it consistent with the actual block.",
    k: ["Track parents in metadata vs infer from time ranges: parent lists make crash recovery exact; inference needs no extra fields and can misjudge overlaps.", "Store extra labels in the meta file vs in an external catalog: in the file the information travels with the block; an external catalog allows queries without opening files."],
    p: ["After a crash during compaction both parents and result exist, and without parent tracking both are queried and values double.", "Wrong time bounds in metadata hide data from queries or include a block that has none of the range."],
    v: "Open the meta file of a compacted block and confirm the min and max times match the actual first and last samples, the counts match the index, and its parents appear in the sources list.",
    dep: ["block-layout"]
  },
  "head-compaction": {
    s: "Converts the oldest stretch of the in-memory head into a new on-disk block, writing chunks and a complete index for the series in that range.",
    d: "At a fixed cadence, the head writes a block covering its oldest range, typically two hours. It iterates series in order, writes their chunks to segment files, builds the symbol table and postings in a temporary directory, writes the meta and index, and renames it into place. Reads continue from the head during the write. After success the head is truncated. It is mostly sequential I/O but can use significant memory for the index of a large head. The difficulty is doing it while ingest continues, without stalls from I/O or lock contention.",
    k: ["Write blocks at fixed boundaries vs when memory is full: fixed boundaries make blocks aligned and predictable; memory-triggered flushes protect the node but create odd-sized blocks.", "Compress index and chunks during head compaction vs defer: doing it now gives the smallest first block; deferring keeps flush fast and lets compaction do the work."],
    p: ["A head compaction that lags behind ingest lets the head grow until memory runs out.", "Heavy flush I/O on the same disk as the write-ahead log makes commits slow."],
    v: "Under steady load, trigger a head compaction and confirm a block appears with the expected range and series count, ingest latency does not rise measurably, and queries return identical results before and after.",
    dep: ["head-block", "block-layout", "chunk-format"]
  },
  "block-compaction": {
    s: "Background merging of several adjacent blocks into one larger block, rewriting chunks and index, dropping deleted data and reducing the number of blocks a query must open.",
    d: "A compactor selects blocks by time range, merges their series by label order, concatenates or re-encodes chunks, and writes a new block with merged index and postings. It applies tombstones, removing the deleted samples, and records the parent blocks in the metadata. After the new block is in place, the parents are deleted. Larger blocks have lower per-block overhead and fewer index lookups per query. The difficulty is resource use: compaction reads and writes much of the dataset, competing with ingest and queries for I/O and memory.",
    k: ["Compact into geometrically larger blocks vs a fixed size: geometric levels keep write amplification logarithmic; a fixed size is simple but rewrites data more often.", "Run compaction at low priority vs on a schedule: low priority protects queries and can fall behind; scheduled runs bound backlog and can compete at bad times."],
    p: ["Compaction that falls behind leaves hundreds of small blocks, and query latency rises with the block count.", "A merged block that is much larger than the retention granularity delays deletion of expired data."],
    v: "Create twelve small blocks, run compaction, and confirm one block replaces them with the sum of series and samples, the parents are gone and results of a fixed query are identical.",
    dep: ["block-layout", "block-metadata", "compaction-planner", "tombstones"]
  },
  "compaction-planner": {
    s: "Chooses which blocks to merge next from their time ranges, sizes and levels, avoiding blocks that are too large, overlapping ones that need special handling, and blocks being deleted.",
    d: "The planner looks at the sorted list of blocks and finds groups that together fill a target range, such as three adjacent blocks forming the next level up. It prefers to compact blocks with many tombstones, skips blocks beyond a maximum size, and detects overlaps to schedule vertical compaction first. In a shared setup, multiple compactors split work by tenant and time range with a lock or a hash. The difficulty is plans that remain valid while ingest adds blocks and retention removes them.",
    k: ["Time-range based levels vs size-tiered: ranges give aligned, predictable blocks and easy pruning; size tiers adapt to uneven data and make ranges ragged.", "Prioritize tombstone-heavy blocks vs oldest-first: tombstone priority reclaims space promptly after deletions; oldest-first keeps compaction orderly."],
    p: ["Two compactors given the same range both merge it and produce duplicate output blocks.", "A planner that ignores a block under upload merges it away before it reaches object storage."],
    v: "Give the planner a set of blocks with gaps, overlaps and one oversized block, and confirm the chosen groups are adjacent, non-overlapping unless vertical, and never include the oversized block.",
    dep: ["block-metadata"]
  },
  "vertical-compaction": {
    s: "Merging blocks whose time ranges overlap, caused by late data, backfill or replicas, deduplicating samples so each series has one coherent stream.",
    d: "When two blocks cover the same time range, a series can have samples in both. A vertical compaction reads them together, merges series by labels, interleaves chunks by time and drops duplicate timestamps, and writes one block for the range. In clustered setups, replicas produce overlapping blocks that this step merges, using a penalty rule to prefer one copy. It must not be enabled carelessly, as overlap handling is more expensive than normal compaction. The difficulty is the choice of winner when duplicates disagree.",
    k: ["Enable vertical compaction vs forbid overlap: enabling makes backfill and replicas workable; forbidding keeps compaction simple but rejects or leaves overlap unresolved.", "First-wins vs last-wins on a duplicate timestamp: first-wins is deterministic and protects stored history; last-wins allows corrections but changes data silently."],
    p: ["Overlapping blocks that are never merged make every query read and deduplicate both, slowing it permanently.", "Duplicates that differ in value cause unstable results depending on which block is read first."],
    v: "Import a backfill block overlapping an existing one, run vertical compaction, and confirm one block replaces both with no duplicate timestamps and values equal to the preferred copy.",
    dep: ["block-compaction", "series-iterators"]
  },
  "tombstones": {
    s: "Records of time ranges deleted for a series, stored beside an immutable block and applied at read time until compaction removes the data physically.",
    d: "A delete request for a matcher and time range finds the matching series in each overlapping block and appends an interval to the block's tombstone file. Readers consult tombstones when iterating chunks and skip the deleted ranges. In the head, deletion removes data directly from open chunks or marks it. Space is not reclaimed until the block is compacted, which rewrites the series without the deleted samples. The difficulty is that deletes are lazy: data is hidden but still on disk, and backups made before compaction still contain it.",
    k: ["Tombstone then compact vs rewrite blocks immediately: tombstones make a delete fast and cheap; rewriting frees space at once and is very costly for large blocks.", "Tombstones per block vs a global log: per-block files travel with the block and survive copying; a global log is simpler to update and easy to lose."],
    p: ["A delete done for privacy reasons leaves the data on disk and in snapshots until compaction and backup rotation complete.", "Large numbers of tombstones slow reads of that series until compaction clears them."],
    v: "Delete a series for a time range, confirm queries return nothing for it, check the block still contains the bytes, then compact and confirm the bytes are gone and the block shrinks.",
    dep: ["block-layout", "series-deletion"]
  },
  "block-reader": {
    s: "Opens a block and serves index and chunk reads through memory-mapped files, keeping only small structures on the heap and relying on the page cache for data.",
    d: "On open, the reader maps the index and chunk files, reads the table of contents and the symbol table, and may keep a sampled subset of the postings offsets in memory. Lookups binary-search the symbol table, jump to postings by offset, and then to series entries and chunks by offset. The page cache handles locality, so hot blocks remain in memory without a separate cache. Many open blocks mean many mappings and file handles. The difficulty is behavior under memory pressure and with cold blocks on slow disks.",
    k: ["Memory-map files vs read into the heap: mapping uses the page cache and keeps heap small; explicit reads give control of caching and are not affected by operating system paging.", "Open all blocks at startup vs lazily: opening all makes queries uniform and slows startup; lazy opening speeds startup but adds latency on first access."],
    p: ["Too many small blocks exhaust file handles or mapping limits.", "A page fault on a cold block mid-query turns a microsecond read into milliseconds."],
    v: "Open a node with a thousand blocks, confirm startup time and heap use are within budget, and measure the first and second query of an old range to see the cold-versus-warm difference.",
    dep: ["block-layout", "chunk-checksums"]
  },
  "columnar-segments": {
    s: "Event data stored in segments where each column is a separate contiguous, compressed array, so queries read only the columns they reference.",
    d: "Incoming events are buffered in memory as rows, then sealed into a segment: each column is encoded and compressed on its own, and a footer records column offsets, row counts and statistics. A query with a filter and a group-by reads only those columns, and decodes them in vectorized batches. Segments are time-ordered and immutable, merged in the background like blocks. Because values of one column are alike, compression is far better than for rows. The difficulty is write buffering: small segments are inefficient, large buffers risk loss unless logged.",
    k: ["Columnar segments vs row storage: columns make scans, filters and aggregates fast and compact; fetching a whole event costs reads from every column.", "Large segments vs small: large segments compress better and prune well; small segments make events queryable sooner and increase file count."],
    p: ["Segments sealed every second create many tiny files, and queries spend most of their time opening them.", "A wide query selecting every column loses the benefit and reads more than a row store would."],
    v: "Store one million events with fifty columns and run an aggregate on two; confirm bytes read are about two fiftieths of the segment and the result equals a row-by-row computation.",
    dep: ["column-dictionary-encoding", "sort-keys-and-zone-maps"]
  },
  "column-dictionary-encoding": {
    s: "Compresses columns by replacing repeated strings with small integer codes from a dictionary, then run-length or bit-packing the codes.",
    d: "For a string column with few distinct values, the segment builds a dictionary and stores each row as an integer index, packed into the minimum number of bits. Sorted or clustered data makes long runs of the same code, which run-length encoding collapses to pairs of value and count. Numeric columns use delta and frame-of-reference encodings. Filters on a dictionary column can be evaluated on codes without decoding strings. The difficulty is high-cardinality columns, where the dictionary grows as large as the data and a fallback to plain or prefix compression is needed.",
    k: ["Per-segment dictionaries vs a global dictionary: per-segment dictionaries need no coordination and compress locally; a global one shrinks repeats across segments but needs synchronization.", "Dictionary-encode adaptively vs always: adaptive choice avoids waste on unique values; always encoding is simpler and bloats high-cardinality columns."],
    p: ["A column of unique identifiers builds a dictionary the size of the column and uses more space than plain storage.", "Comparing codes across segments with different dictionaries without translation returns wrong rows."],
    v: "Encode a column of 100 distinct values across a million rows and confirm size matches the packed width estimate; then a unique column and confirm the encoder falls back to a plain encoding.",
    dep: ["columnar-segments"]
  },
  "sparse-columns": {
    s: "Handling events whose attributes vary: columns are created on first use, absent values are stored cheaply, and type changes are detected or isolated.",
    d: "Events from different sources carry different fields. The writer adds a column when a new field appears, and rows that lack it record a null in a bitmap that costs a bit each. Schema is inferred from the data and stored per segment, so older segments need not be rewritten when a field is added. A field that arrives with a conflicting type is rejected, coerced, or placed in a separate column. A query over a column missing from some segments treats those rows as null. The difficulty is column explosion from dynamic field names.",
    k: ["Schema on write with automatic columns vs a fixed schema: automatic columns accept anything and make exploration easy; fixed schemas catch mistakes and bound column count.", "Unnested maps stored as one column vs one column per key: a map column bounds columns but makes keys slow to filter; separate columns are fast and can grow without limit."],
    p: ["Field names generated from data, such as one per user, create thousands of columns that slow every segment.", "A type change in a field splits history so one query returns different types for the same column."],
    v: "Write events with ten different field sets and confirm each segment records only the columns it saw; query a field present in half of them and confirm the rest return null and no rewrite occurred.",
    dep: ["columnar-segments"]
  },
  "sort-keys-and-zone-maps": {
    s: "Ordering rows within segments by chosen keys and keeping per-block minimum and maximum values, so queries can skip ranges that cannot match a filter.",
    d: "Rows in a segment are sorted by time and often by one or more tag columns, so that rows with the same tag are adjacent, improving run-length compression and making range filters on those columns narrow. Each column chunk records its minimum and maximum, called a zone map, and the planner skips any chunk whose range excludes the predicate. Time is always the first pruning dimension. The difficulty is choosing the sort key: it helps queries on those columns and does nothing for others, and re-sorting costs write throughput.",
    k: ["Sort by time only vs by a tag first: time-only keeps writes append-friendly; sorting by tag helps selective filters at the cost of buffering and re-sorting.", "Fine-grained zone maps vs coarse: fine ones skip more and use more metadata; coarse ones are cheap and less selective."],
    p: ["Filtering on a column that is unsorted means every chunk's min and max span the whole domain, and nothing is skipped.", "A sort key chosen at launch fits the early queries and not the ones that matter a year later."],
    v: "Run a selective filter on the sort-key column and on an unsorted column, and confirm via statistics that most chunks are skipped for the first and almost none for the second.",
    dep: ["columnar-segments"]
  },
  "skip-indexes": {
    s: "Small auxiliary structures, such as bloom filters or inverted sets per chunk, that say whether a value could be present, so point lookups on unsorted columns skip most data.",
    d: "For columns that are not in the sort key, each chunk can carry a bloom filter of its values, or a small set when there are few distinct values. A lookup for a specific identifier checks each filter and reads only chunks that might contain it, accepting a small false-positive rate. Text-like columns may have token filters for substring search. Filters are built when a segment is sealed and stored in its footer. The difficulty is size and false positives: a large filter for a high-cardinality column can approach the size of the data it indexes.",
    k: ["Bloom filter vs exact set: a bloom filter is small and fixed-size with false positives; an exact set has none and grows with distinct values.", "Index many columns vs few: indexing many speeds more queries and slows writes and enlarges segments; indexing few keeps overhead low and leaves other lookups as scans."],
    p: ["A filter sized for the wrong number of values saturates and passes every chunk, giving cost with no benefit.", "A skip index on a column with ranges queried, not points, does nothing for those queries."],
    v: "Look up a single request id across a day of segments and confirm only chunks reported by the filter are read, the true match is found, and the false-positive rate is near its configured value.",
    dep: ["columnar-segments"]
  },
});
