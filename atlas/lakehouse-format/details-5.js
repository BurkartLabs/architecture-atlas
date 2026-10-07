// Details for the lakehouse table format plate, part 5: statistics and pruning, columnar data files.
ATLAS.details("lakehouse-format", {
  "column-bounds": {
    s: "The lowest and highest value of each column in a file, kept in its manifest entry, which lets planners prove a file cannot match a range or equality filter.",
    d: "Writers compute minimum and maximum per column as they write each file and store them, keyed by field id, in the manifest entry. For a filter such as a range, the planner skips any file whose bounds do not overlap it. Bounds on strings and binary values are often truncated to a fixed length, with the upper bound rounded up so it remains valid. Their value depends on clustering: if every file spans the full range, nothing can be skipped. The hard part is exactness of comparison rules: ordering of strings, floats with NaN, and timestamps must be identical in writers and planners.",
    k: ["Exact vs truncated bounds: exact bounds prune best, but long strings inflate manifests; truncation bounds size and loosens pruning slightly.", "Bounds in manifests vs only in file footers: manifest bounds avoid opening files, but must be duplicated and kept consistent."],
    p: ["A writer orders strings differently from the planner and a file with matching rows is skipped.", "Unsorted data gives every file nearly the full range, so bounds prune nothing."],
    v: "For a sample of files compare the recorded bounds with an independent min and max over the file's actual values for each column, and run a filter at the boundary to confirm the right files are kept.",
    dep: ["manifest-entry", "file-footer", "sort-order"]
  },
  "value-counts": {
    s: "Per-column counts of values, nulls and NaNs for each file, which allow IS NULL filters to prune and let some aggregates be answered from metadata alone.",
    d: "Each manifest entry records, per field id, how many values the file holds and how many are null or not-a-number. A planner can skip files with no nulls for an IS NULL filter, or with all nulls for IS NOT NULL. Counting queries and minimum or maximum aggregates on unfiltered data can be answered by summing entries without reading any file. NaN counts are separate because NaN is unordered and breaks bounds. The hard part is that these values must be exact for that use: if they are approximate or missing for some files, answers from metadata are wrong.",
    k: ["Answer aggregates from metadata vs always scan: metadata answers are instant, but only valid when counts are complete and no deletes apply.", "Track counts for every column vs selected columns: all columns is simpler, but widens manifests for tables with thousands of columns."],
    p: ["A table with deletes answers COUNT from metadata and includes deleted rows.", "NaN values are lumped with nulls and a filter on NaN skips matching files."],
    v: "Compare a metadata-only COUNT, minimum and null count against a full scan on a table without deletes: they must match exactly. Then add deletes and confirm the engine falls back to scanning.",
    dep: ["manifest-entry", "file-footer", "delete-file-application"]
  },
  "partition-summaries": {
    s: "For each manifest, the lowest and highest value of every partition field among its entries, so a whole manifest can be skipped by one comparison.",
    d: "While writing a manifest list, the writer aggregates its manifests' entries into per-field bounds and flags for null and NaN. A planner converts the user's filter to a partition filter and evaluates it on those bounds first, discarding manifests that cannot contain matches. This is the first and cheapest level of pruning, and it is only as good as the manifests' clustering. Different specs have different fields, so summaries are per spec. The hard part is keeping manifests partition-aligned as commits add files from many partitions into one manifest.",
    k: ["Partition-aligned manifests vs commit-aligned: alignment makes summaries sharp and pruning fast, but each commit then touches many manifests.", "Summaries in the list vs recomputed: stored summaries are free at read time, but must be derived correctly each commit."],
    p: ["A manifest spanning a year of partitions has a summary that covers every query.", "Summaries are computed for the current spec only, and files from older specs are never pruned."],
    v: "Plan a query for one partition on a table with many manifests: the number of manifests opened must equal those whose summary overlaps that partition, and the results must match an unpruned scan.",
    dep: ["manifest-list", "partition-spec", "partition-tuples"]
  },
  "manifest-pruning": {
    s: "The first planning step: evaluate the filter against manifest-level summaries and open only manifests that might hold matching files.",
    d: "The planner reads the manifest list, projects the user's filter onto each manifest's partition spec, and drops manifests whose partition bounds cannot satisfy it. Delete manifests are pruned the same way. The remaining manifests are read in parallel. For huge tables this step decides whether planning takes milliseconds or minutes, because it avoids reading most of the metadata. The hard part is that it works only for filters on partition fields; a filter on an unpartitioned column prunes nothing at this level.",
    k: ["Prune by partition bounds only vs also by column bounds: partition pruning is cheap and available now, while column bounds at manifest level would help more filters but cost per commit.", "Parallel manifest reads vs sequential: parallel cuts latency, but can overload the coordinator and storage on very wide tables."],
    p: ["A query filters on a non-partition column and every manifest is opened.", "Planning on a very large table runs sequentially and takes minutes before the first task starts."],
    v: "Run a partition-selective query and a non-selective one, and compare manifests opened and planning time: the selective query must open a small fraction, and both must return correct results.",
    dep: ["partition-summaries", "manifest-list", "predicate-pushdown"]
  },
  "file-pruning": {
    s: "The second planning step: within the opened manifests, test the filter against each entry's partition values and column bounds, and keep only files that might match.",
    d: "For each entry the planner evaluates the filter against its partition tuple and its column bounds and counts, using three-valued logic: the file definitely has no match, might have, or has only matches. Files with no possible match are dropped. A file in which every row matches can skip row filtering. The result is the task list. This works for any column with statistics, so it covers filters on non-partition columns if data is clustered. The hard part is the logic's conservative handling of expressions, such as functions, NaN and nulls.",
    k: ["Three-valued evaluation vs boolean: tracking might-match lets the engine skip row-level filtering for fully matching files, but complicates the evaluator.", "Evaluate per entry vs per-manifest: per entry is precise, but costs CPU proportional to file count."],
    p: ["Null semantics are mishandled and a file with only null values is wrongly kept or dropped.", "Statistics missing for newly added columns make every old file kept."],
    v: "Build a table whose files have disjoint value ranges, run an equality filter, and confirm exactly the one file whose range contains the value is selected and the result matches a full scan.",
    dep: ["column-bounds", "value-counts", "manifest-entry", "partition-tuples"]
  },
  "row-group-pruning": {
    s: "Inside a selected file, the reader skips row groups and pages whose own statistics prove they cannot match, reading only the byte ranges that remain.",
    d: "The reader fetches the file footer, then evaluates the filter against each row group's column statistics and, where present, page-level indexes. Row groups that cannot match are not fetched at all. With range reads on object storage, this saves bytes and requests, not just CPU. It repeats at a finer granularity what the planner did per file. The hard part is that benefit depends on sorted or clustered data within the file, and on footers being cached so that one extra request is not paid for every file.",
    k: ["Row group statistics vs page indexes: row group statistics are cheap and always present, while page indexes prune finer but add footer size and read cost.", "Many small vs few large row groups: small groups prune more precisely, but add overhead and weaker compression."],
    p: ["Random data order makes every row group span the full range, so no row group is skipped.", "Footers are re-read for every query because nothing caches them."],
    v: "Run a selective filter on a sorted file and compare bytes fetched with the file size: only the matching row groups' ranges should be requested, with results equal to a full scan.",
    dep: ["row-groups", "file-footer", "range-reads", "column-chunks-pages"]
  },
  "bloom-filters": {
    s: "Compact probabilistic sets stored per column per row group that answer whether a value is definitely absent, which prunes equality filters that min and max bounds cannot.",
    d: "A writer adds each value of a chosen column to a filter, sized for a target false-positive rate. A reader tests the filter value before fetching the data: a no means the row group cannot contain it. This helps for high-cardinality columns such as identifiers where bounds span everything. Filters cost space and write time, so they are enabled per column. They never give false negatives, only false positives, so correctness holds. The hard part is choosing which columns and sizes, since filters on unqueried columns waste space.",
    k: ["Bloom filters vs sorting for point lookups: filters add pruning without reordering data, while sorting gives better pruning and compression but costs a rewrite.", "Low vs high false-positive rate: a lower rate prunes better but enlarges the file and slows writes."],
    p: ["Filters are enabled on every column and inflate files with no benefit.", "A filter built over hashed values with a different function than the reader's rejects present values."],
    v: "Query for a value that is present and for ten values that are absent in a high-cardinality column: the present value must always be found, and nearly all absent values must prune row groups.",
    dep: ["row-group-pruning", "file-footer", "table-properties"]
  },
  "distinct-sketches": {
    s: "Small approximate summaries of distinct values, stored as table-level statistics, which help planners estimate join and filter selectivity without scanning.",
    d: "A job scans the table, builds a sketch per column that estimates the number of distinct values, and stores it in a statistics file linked from the snapshot. Engines read these to choose join orders and broadcast decisions. Sketches from different files can be merged, so they update incrementally. They are tied to a snapshot and become stale as data changes. The hard part is staleness and ownership: every engine computes its own statistics differently, and a stale sketch makes the optimizer choose a bad plan with confidence.",
    k: ["Mergeable sketches vs recomputing from scratch: mergeable sketches update cheaply with new files, but accumulate error and cannot reflect deletes.", "Statistics files tied to a snapshot vs floating: tying makes staleness explicit, but means each commit invalidates them until recomputed."],
    p: ["An optimizer uses statistics from months ago and picks a broadcast join of a now enormous table.", "Two engines write different statistics formats and neither reads the other's."],
    v: "Compute sketches for a column with a known distinct count and confirm the estimate is within the expected error, then add data and confirm the stored statistics are marked as belonging to the older snapshot.",
    dep: ["manifest-entry", "snapshot-entry", "stats-policy"]
  },
  "stats-policy": {
    s: "Settings that choose which columns get statistics and at what granularity, such as counts only, bounds, or full bounds with truncation length, balancing planning benefit against metadata size.",
    d: "Tables with hundreds of columns cannot afford full statistics on all of them in every manifest entry. A policy picks the first N columns by default, or names columns, or selects a mode per column: none, counts, truncated bounds, full bounds. Choosing columns that appear in filters yields most of the benefit. Changing the policy affects only new files, so old files may lack statistics for newly important columns. The hard part is that a policy set when the table is created reflects guesses about queries, and fixing it later requires rewriting files.",
    k: ["Statistics on all columns vs a chosen subset: all columns is safe, but bloats metadata for wide tables; a subset is lean, but misses filters on unlisted columns.", "Truncation length: short truncation saves space, but loosens bounds for strings with long common prefixes."],
    p: ["The first columns are chosen by default and the most filtered column is not among them.", "A policy change leaves old files without statistics and queries over history slow down."],
    v: "Set statistics for one column, write files, then check entries: that column has bounds and others do not, and a filter on the unlisted column shows no file pruning in the plan.",
    dep: ["column-bounds", "value-counts", "table-properties"]
  },
  "columnar-data-file": {
    s: "An immutable file that stores each column's values together, in row groups, with a footer describing layout and statistics. It is the unit the format adds, removes and tracks.",
    d: "The file is written once and never modified. Rows are divided into row groups, each holding one chunk per column, compressed and encoded, and a footer records the schema, row group offsets and statistics. Reading a few columns fetches only their chunks. The format's metadata refers to files by path, size and statistics and never reads inside them to answer planning questions. Engines produce these files independently. The hard part is that the choice of row group size, encoding and compression must serve scans, point lookups and writers simultaneously.",
    k: ["Columnar vs row-based files: columnar reads only needed columns and compresses well, but is poor for single-row access and streaming writes.", "Large vs small files: large files cut metadata and request counts, but make rewrites costly and parallelism coarser."],
    p: ["A writer produces files with one huge row group, so memory use and read parallelism both suffer.", "Different engines write nonstandard variants of the file layout that others read incorrectly."],
    v: "Write a file and read it back with a different engine: all columns, nulls and nested values must be identical, and projecting two columns must fetch only those columns' byte ranges.",
    dep: ["row-groups", "column-chunks-pages", "file-footer", "immutable-files"]
  },
  "row-groups": {
    s: "A horizontal slice of a file holding a set number of rows, with one chunk per column. It is the unit of statistics, pruning and parallel reading.",
    d: "Writers buffer rows up to a target size, often tens or hundreds of megabytes, then flush a row group with all its column chunks. The footer lists each group's byte offsets, row count and column statistics. The scan planner splits files at row group boundaries to make parallel tasks, and readers skip groups that statistics rule out. Memory use during writing scales with the group size and the number of columns. The hard part is the trade between memory, compression and skipping: larger groups compress better but prune coarsely.",
    k: ["Large vs small row groups: large groups give better compression and fewer requests, but need more writer memory and prune coarsely.", "Row group size by rows vs by bytes: bytes bound memory predictably for wide rows, but give uneven row counts."],
    p: ["A table with very wide rows exceeds writer memory because the row group size was set by row count.", "Tiny row groups from frequent flushes make files that are slow to scan."],
    v: "Inspect a file's footer: each row group must hold roughly the target bytes, offsets must be contiguous and non-overlapping, and the sum of group row counts must equal the file's row count.",
    dep: ["columnar-data-file", "column-chunks-pages", "file-footer"]
  },
  "column-chunks-pages": {
    s: "Within a row group, each column's values are stored in a chunk, divided into pages that are encoded and compressed separately and are the smallest unit read.",
    d: "A chunk starts with an optional dictionary page followed by data pages of a few thousand values each. Each page has a header with its size and statistics, and an offset index may list them. A reader requests a chunk's byte range, decompresses pages in turn and decodes them. Definition and repetition levels in the page record nulls and nesting. Because pages are independently decodable, readers can skip pages that page statistics exclude. The hard part is the coupling of dictionary, encoding and page size, which determines both compression ratio and decoder speed.",
    k: ["Small vs large pages: small pages allow finer skipping, but increase header overhead and lower compression.", "Dictionary per chunk vs per file: a per-chunk dictionary keeps chunks independently readable, but repeats shared values."],
    p: ["A dictionary grows beyond its limit mid-chunk and the writer falls back to plain encoding for the rest.", "Readers decode whole chunks although only a few pages were needed."],
    v: "Read a single column of a row group and confirm the requested byte range covers only that column's chunk, and decoded values match the source for the first, last and null positions.",
    dep: ["row-groups", "column-encodings", "compression-codecs"]
  },
  "column-encodings": {
    s: "The schemes that turn values into compact bytes before compression: dictionary, run-length, bit-packing and delta, chosen by the writer per column from the data's shape.",
    d: "Dictionary encoding replaces repeated values with small integers; run-length stores repeated runs as a count; bit-packing uses just enough bits for small integers; delta stores differences between sorted or sequential values. Writers choose per column chunk, often trying dictionary and falling back. Readers must implement decoding for every scheme the files use. Good encodings often compress better than generic compression alone and are faster to decode. The hard part is that encoding choice interacts with sort order: sorted data encodes tiny, random data barely at all.",
    k: ["Aggressive encoding choice vs simple defaults: choosing per column saves storage and scan time, but costs writer CPU and compatibility risk.", "Newer encodings vs widest reader support: newer encodings are smaller and faster, but older readers cannot decode the files."],
    p: ["A writer uses a newer encoding and a reader in another engine fails on those files.", "High-cardinality text is dictionary encoded and the dictionary exceeds memory budgets."],
    v: "Write the same data sorted and shuffled and compare chunk sizes and encodings: sorted data should use run-length or delta forms and be much smaller, and both must decode to identical values.",
    dep: ["column-chunks-pages", "sort-order", "compression-codecs"]
  },
  "compression-codecs": {
    s: "General-purpose compression applied to each page after encoding, with a codec chosen for the balance of ratio, speed and CPU cost.",
    d: "Fast codecs give moderate ratios with very quick decompression and suit hot data. Heavier codecs give smaller files and suit cold data, at higher CPU on both ends. Compression applies per page, so a reader only decompresses what it needs. Table properties set the default and each file records the codec used, so a table can mix them across rewrites. On object storage, smaller files mean fewer bytes transferred, so the break-even favors compression more than on local disk. The hard part is selecting by workload: write-heavy streams and read-heavy archives want different codecs.",
    k: ["Fast vs high-ratio codec: fast codecs keep CPU low and scans quick, but use more storage and bandwidth; high-ratio ones do the opposite.", "Per-table vs per-column codec: per-column tuning shaves storage for text, but adds configuration and is rarely supported across engines."],
    p: ["A high-ratio codec on a streaming writer makes commits slow and falls behind input.", "A reader lacks a codec used by a newer writer and cannot open the files."],
    v: "Write the same data with two codecs and compare file size, write time and scan time; both files must read back identically, and the footer must name the codec used.",
    dep: ["column-chunks-pages", "column-encodings", "table-properties"]
  },
  "file-footer": {
    s: "The metadata block at the end of a data file with its schema, row group locations and per-column statistics. Readers fetch it first to plan reads inside the file.",
    d: "Because the footer is written last, it is found from the end of the file: a reader requests the final bytes, learns the footer length, and reads it. It lists each row group's column chunk offsets and sizes, statistics, encodings and the schema with field ids. Many readers then issue targeted range requests. On object storage, the footer fetch costs one or two requests per file, so engines cache footers or read them speculatively with a larger tail request. The hard part is footers on wide tables, which can reach megabytes.",
    k: ["Tail read of fixed size vs exact length: a larger first read often fetches the whole footer in one request, but wastes bytes on small footers.", "Cache footers vs re-read: caching removes a request per file, but needs invalidation logic, though files are immutable and so keyed by path."],
    p: ["Every query fetches thousands of footers because nothing caches them.", "A wide table's footer is huge and slow to parse for a query that needs three columns."],
    v: "Open a file's footer and check that its row count, schema ids and chunk offsets agree with the manifest entry and that each chunk range lies within the file size.",
    dep: ["columnar-data-file", "row-groups", "range-reads"]
  },
  "nested-data-shredding": {
    s: "Storing nested structures, lists and maps as separate columns per leaf field, with levels that record nulls and repetition, so a query reads only the leaves it needs.",
    d: "Each leaf of a nested type becomes its own column chunk. Definition levels say how many optional ancestors are present and repetition levels say where a new list element begins, which together allow exact reconstruction of the nested value. Statistics and bounds apply per leaf, and field ids are assigned to every nested field. Semi-structured data can be shredded by a chosen set of paths while the rest is stored as a binary blob. The hard part is reassembly cost for queries that need whole records and the cost of schema changes inside nested types.",
    k: ["Shredded leaf columns vs opaque nested blob: shredding gives column pruning and statistics on inner fields, but costs write complexity and reassembly work.", "Shred chosen paths vs all paths: chosen paths keep schema bounded for variable data, but unlisted paths lose pruning."],
    p: ["A deeply nested column is read in full to access one inner field because the engine does not push projection down.", "Rows with variable inner structure create thousands of leaf columns."],
    v: "Write records with lists, maps and nulls at several depths, read back and compare every value including empty versus null lists, then query one inner field and confirm only its chunk was fetched.",
    dep: ["column-chunks-pages", "field-ids", "column-bounds"]
  },
  "field-id-mapping": {
    s: "Linking a data file's own column identifiers to the table's field ids, either from ids embedded in the file or from a name mapping kept in table metadata.",
    d: "Files written by format-aware writers carry field ids in their schema, so a reader matches table columns to file columns by id. Files created before the table, or by other tools, have only names, so the table stores a name mapping that associates each field id with the names it may have in files lacking ids. The reader falls back to it when the file has no ids. Without either, projection would rely on names or position. The hard part is that mappings must be maintained as columns are renamed, or old files read the wrong data.",
    k: ["Embedded ids vs external name mapping: embedded ids are self-describing and robust, while mappings let existing files be adopted without rewriting.", "Strict failure on missing ids vs name fallback: failing prevents wrong reads, but makes imports harder."],
    p: ["A name mapping is not updated after a rename and files with old names return nulls.", "A foreign tool rewrites a file and drops its ids, and positions silently differ."],
    v: "Read a file with embedded ids after renaming a column and confirm correct values; then read an imported file without ids using the mapping and compare against the source column by column.",
    dep: ["field-ids", "file-footer", "table-registration"]
  },
  "file-size-targets": {
    s: "The intended size of each data file, a compromise between per-file overhead and rewrite cost, commonly hundreds of megabytes, enforced by writers and maintenance.",
    d: "Writers roll to a new file when the current one reaches the target, and compaction merges undersized files toward it. Small files raise manifest size, planning time, request counts and open costs. Very large files make updates under copy-on-write expensive and parallelism coarse. The target is a table property, and tasks may produce smaller files because data is spread across many partitions or tasks. The hard part is that the target is rarely met by streaming and by wide partitioning, so maintenance must catch up.",
    k: ["Larger vs smaller target: larger lowers metadata and request overhead, but increases rewrite cost for row-level changes and reduces parallelism.", "Enforce in writer vs fix in compaction: writer enforcement keeps tables healthy at once, but needs shuffles that slow ingestion."],
    p: ["A job with thousands of tasks each writes a small file per partition and the table fills with tiny files.", "The target is set above engine memory and writers fail on wide tables."],
    v: "Write a large dataset and list file sizes: most files should lie near the target, the count should be near total bytes over target, and the distribution tail of undersized files should be small.",
    dep: ["table-properties", "write-distribution", "small-file-problem"]
  }
});
