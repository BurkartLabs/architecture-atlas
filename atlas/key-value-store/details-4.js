// Details for the key-value store plate, part 4: filters, caches and table files.
ATLAS.details("key-value-store", {
  "bloom-filter": {
    s: "A compact bit array per file or block that answers whether a key is definitely absent or possibly present, letting reads skip files without touching data blocks.",
    d: "Each key is hashed to several bit positions, set at build time and tested at lookup. A negative answer is certain; a positive may be false. At about ten bits per key the false positive rate is near one percent. Filters are built when a table is written, stored in a filter block, and loaded into the block cache or pinned in memory. A cache-local variant confines all probes for a key to one cache line to speed tests. It is hard to size: bits per key set memory cost against wasted reads, and the benefit differs by level.",
    k: ["More bits per key versus less memory: more bits cut false positives and wasted block reads, but cost memory proportional to the key count.", "Skipping filters on the bottom level versus building them everywhere: skipping saves most filter memory since the last level holds most data, but a miss then always reads one block there."],
    p: ["Filters evicted from the cache make every lookup read the filter from disk first.", "Whole-key filters give no help to range scans or prefix queries."],
    v: "Insert one million keys, then look up one million absent keys and confirm the measured false positive rate matches the configured bits per key within a factor of about one and a half, and block reads drop correspondingly.",
    dep: ["filter-block","block-cache","table-builder"]
  },
  "ribbon-filter": {
    s: "A filter built by solving a banded linear system, reaching the same false positive rate as a Bloom filter with roughly thirty percent less memory at higher build cost.",
    d: "Keys are hashed to a row of a sparse binary matrix with its ones in a narrow band, and the filter stores the solution of the system whose right-hand side is a short fingerprint of each key. A lookup recomputes the row and checks the fingerprint. Space is close to the theoretical minimum, but construction takes more CPU and memory and can fail for an unlucky hash seed, requiring a retry. It suits the largest, coldest levels where memory matters more than build time, with Bloom filters kept for hot levels.",
    k: ["Ribbon versus Bloom: ribbon saves about a third of filter memory, but costs several times more CPU to build and is slightly slower to query.", "Using ribbon only on deep levels: deep levels are built less often and hold most keys, so savings are large, but upper levels still use the cheaper-to-build Bloom filter."],
    p: ["Building ribbon filters in flush of small files increases flush latency for little memory gain.", "A failed construction attempt must be retried with another seed or falling back to Bloom, or the file is written without a filter."],
    v: "Build both filter types over ten million keys, and confirm ribbon uses about thirty percent fewer bytes at the same measured false positive rate, with build time reported for both.",
    dep: ["filter-block","table-builder"]
  },
  "partitioned-filters": {
    s: "Splits the index and the filter of a large file into a top-level index plus many small partitions, loading only the partitions a lookup needs.",
    d: "A multi-gigabyte file's single index and filter could be hundreds of megabytes, too large to pin or to load for each lookup. Partitioning cuts both into blocks of a few kilobytes, with a small top-level index pointing to each. A lookup reads the top-level block, then one filter partition and one index partition, which are cached like data blocks. Memory use then scales with the working set, not file size. The hard part is the extra block reads on a cold cache and complexity in cache priority management.",
    k: ["Partitioned versus monolithic index and filter: partitioning bounds memory and cache churn for huge files, but adds up to two extra block reads on a cold lookup.", "Pinning the top-level index only versus all partitions: pinning the top level costs little and avoids reading it, but partitions can still be evicted."],
    p: ["Cache pollution when partitions have the same priority as data blocks causes the filters to be evicted under scan load.", "Very small partitions multiply metadata and cache entry overhead."],
    v: "Build a file with a hundred megabyte monolithic index, partition it, and confirm resident index memory falls to the top-level size plus hot partitions while lookup latency on a warm cache stays equal.",
    dep: ["index-block","filter-block","block-cache"]
  },
  "prefix-filter": {
    s: "A filter over key prefixes rather than whole keys, so prefix scans and prefix-bounded seeks can skip files that hold no key with that prefix.",
    d: "At build time the prefix extractor's output for each key is added to the filter, usually together with whole keys. A prefix seek tests the prefix and skips files that report absence. This makes scans of one entity cheap in a database with many files, where the merging iterator would otherwise seek in every file. Prefix filters can also serve point lookups when whole keys are not added, saving memory. It is hard because it only works if scans declare prefix mode and the extractor is stable.",
    k: ["Prefix-only versus whole-key plus prefix filters: prefix-only saves memory, but cannot rule out a specific absent key under a present prefix.", "Short versus long prefixes: short prefixes group many keys and lower filter size, but filter positives become common and skip fewer files."],
    p: ["Seeks without prefix mode bypass the prefix filter and probe every file.", "A prefix shared by most keys makes the filter always positive and useless."],
    v: "With prefixes covering one percent of keys each, run prefix scans and confirm perf counters show over ninety percent of files skipped by the prefix filter, then repeat in total-order mode and confirm none are skipped.",
    dep: ["prefix-extractor","filter-block","bloom-filter"]
  },
  "block-cache": {
    s: "A shared in-memory cache of uncompressed data, index and filter blocks keyed by file and offset, bounded in bytes and sharded to limit lock contention.",
    d: "Reads check the cache before the file; a miss reads, verifies and decompresses a block and inserts it. Blocks are reference counted so an iterator can hold one while it is read. The cache is split into shards, each with its own lock and eviction list. Index and filter blocks can be given high priority so scans of data do not evict them. One cache can be shared by several column families and instances. Its size is the main memory knob of the engine. It is hard to tell whether misses are capacity misses or the result of pollution by scans.",
    k: ["One shared cache versus per-family caches: sharing adapts to whichever family is hot, but one noisy family can evict another's working set.", "Caching uncompressed versus compressed blocks: uncompressed avoids decompression on every hit, but holds fewer blocks in the same memory."],
    p: ["A big scan with cache fill enabled evicts the hot point-lookup working set.", "A cache larger than free memory competes with the operating system page cache and double caches data."],
    v: "Run a Zipfian point workload with a cache sized at ten percent of data and confirm hit rate near the model's prediction. Run a full scan with cache fill disabled and confirm the hit rate does not drop.",
    dep: ["cache-eviction","data-block","index-block","filter-block"]
  },
  "cache-eviction": {
    s: "The policy that picks which cached blocks to drop when full: usually least-recently-used with priority tiers, or clock-based variants with less locking.",
    d: "An LRU keeps a recency list per shard; hits move entries to the head. A priority-tiered version reserves a fraction for high-priority entries such as index and filter blocks so they survive scans. Clock-based designs avoid reordering on every hit by setting a bit, scaling better across many threads. Entries pinned by an iterator are not evictable. Hit rate depends on workload and sharding. The hard part is lock contention on the recency list and the choice of how much memory to give high-priority blocks.",
    k: ["Strict LRU versus clock approximation: LRU gives better hit rates at low concurrency, but a lock per hit limits scaling; clock scales but evicts a little less precisely.", "Reserving a fraction for index and filter blocks versus uniform treatment: reservation protects lookups from scans, but wastes memory when few such blocks exist."],
    p: ["Too few shards put all threads behind one lock and cap read throughput.", "Pinned blocks exceeding capacity cause insertions to fail or the cache to overshoot its limit."],
    v: "Run a multi-threaded read benchmark over one, sixteen and sixty-four shards and confirm throughput rises with shard count and then flattens, with hit rate unchanged within a percent.",
    dep: ["block-cache"]
  },
  "table-cache": {
    s: "Keeps recently used table files open with their parsed footer, index and filter, so a lookup does not reopen the file or reparse its metadata.",
    d: "Opening a table means opening the file, reading the footer, then the properties, index and filter blocks. The table cache maps file numbers to open readers, bounded by a maximum number of open files. A lookup first fetches the reader from the cache, then proceeds into the file. Eviction closes the file and releases the in-memory metadata. With a limit lower than the number of files, each lookup may reopen files. It is hard because open file limits are set by the operating system and metadata memory is not counted in the block cache unless configured.",
    k: ["Unlimited open files versus a bounded cache: unlimited avoids reopen cost, but exhausts file descriptors and memory for very large databases.", "Counting index and filter memory in the block cache versus outside: inside gives one budget, but evictions then force their reload."],
    p: ["A descriptor limit lower than the file count makes the engine thrash opening files on every read.", "First reads after restart are slow because every file must be opened and parsed."],
    v: "Set the cache to a tenth of the file count, run a uniform random read workload, and confirm the file open rate per second tracks the miss rate, then raise the limit and confirm opens drop to near zero.",
    dep: ["footer","index-block","file-system-abstraction"]
  },
  "row-cache": {
    s: "An optional cache of whole key-value results above the block cache, serving repeated point lookups without touching blocks, invalidated by writes to the key.",
    d: "On a lookup the cache is checked by key and sequence-compatible state; on a hit the value is returned directly. On a miss the normal path runs and the result is inserted. Writes must invalidate or make stale entries unusable, which is done by keying entries with the file or memtable generation. It saves block decoding and memory for hot small values, but it duplicates data that the block cache may also hold. It is hard because correctness under snapshots and concurrent updates requires precise invalidation.",
    k: ["Row cache versus larger block cache: a row cache holds only hot rows, so it is far more memory efficient for tiny hot values, but misses for any scan or snapshot read.", "Invalidate on write versus versioned keys: invalidation is simple, but versioned keys let snapshot reads still hit at the cost of stale entries."],
    p: ["Returning a cached row after a newer write committed gives a stale read.", "Caching rows for workloads that rarely repeat lookups wastes memory and adds insertion cost."],
    v: "Read the same one thousand keys repeatedly and confirm block cache accesses drop to zero after the first pass, then update one key and confirm the next read returns the new value, not the cached one.",
    dep: ["point-lookup-api","block-cache","visibility-rules"]
  },
  "sst-layout": {
    s: "The overall arrangement of a table file: data blocks first, then meta blocks, index, and a fixed-size footer at the end that points to everything else.",
    d: "A table builder appends data blocks in key order as it receives entries, each followed by a compression type byte and checksum. After the last data block it writes filter, range tombstone, properties and metaindex blocks, then the index, and finally the footer. A reader opens the file, reads the footer from the last bytes, follows its handles to the index and metaindex, and can then find any block with a single read. The file is written once and never modified. Designing for append-only writes is why the index comes last.",
    k: ["Index at the end versus at the start: at the end allows streaming writes with no knowledge of the final size, but a reader must read the tail first.", "Larger versus smaller files: larger files mean fewer files and less metadata, but each compaction rewrites more and sources are coarser to move."],
    p: ["A file truncated by a crash before the footer is unreadable and must be detected and ignored.", "Files with extremely large indexes load slowly and consume memory per open reader."],
    v: "Build a table, dump it with the inspection tool, and confirm the block order is data, meta blocks, index, footer, and that cutting the last byte makes open fail with a footer error, not a wrong result.",
    dep: ["data-block","index-block","footer","meta-blocks"]
  },
  "data-block": {
    s: "A unit of a few kilobytes holding consecutive sorted entries, read and cached as a whole, and the granule of I/O for point lookups.",
    d: "The builder fills a block until it reaches the target size, usually four to sixteen kilobytes, then flushes it. Entries are stored with shared-prefix compression and a trailing array of restart offsets enabling binary search. A reader finds the block through the index, fetches and verifies it, then binary-searches restarts and scans linearly within one restart interval. Block size trades read granularity against index size and compression ratio. It is hard because small blocks lower read cost per lookup yet enlarge the index and hurt compression.",
    k: ["Small blocks versus large: small blocks read less data per lookup and cache more precisely, but grow the index and compress worse.", "A hash index inside the block versus binary search: a hash lookup speeds point reads, but costs space and does not help scans."],
    p: ["Block size larger than the typical value size makes each point lookup read and decompress far more than needed.", "Entries larger than the block size produce a block per entry and give no compression."],
    v: "Build files at four, sixteen and sixty-four kilobyte block sizes from the same data and report index size, compressed size and bytes read per point lookup to confirm the expected tradeoff.",
    dep: ["prefix-compression","block-compression","block-checksums"]
  },
  "prefix-compression": {
    s: "Stores each key as the length of the prefix shared with the previous key plus the differing suffix, with periodic restart points holding full keys.",
    d: "Within a block, sorted neighbor keys often share long prefixes. Each entry records shared length, unshared length and value length, then the unshared key bytes and value. Every N entries, commonly sixteen, is a restart point where the key is stored whole and its offset is appended to the block trailer. Lookup binary-searches the restart keys, then scans forward. Reading an entry before its predecessor has been decoded is impossible, so backward iteration is harder. Larger restart intervals save space but lengthen the linear scan.",
    k: ["Large versus small restart interval: large saves space on long keys, but lengthens the linear scan and slows seeks.", "Delta-encoding index keys versus full keys: delta saves space in large indexes, but makes binary search across entries require restart points as well."],
    p: ["Keys without common prefixes gain nothing and still pay the entry header overhead.", "Backward iteration re-decodes from the restart point each step if not cached."],
    v: "Store a million keys sharing a twenty-byte prefix and confirm block size drops by about the shared bytes per entry, and that seeks to every key return correct results using the restart search.",
    dep: ["data-block","comparator"]
  },
  "index-block": {
    s: "Maps the last key of each data block to that block's offset and size, so a lookup can binary-search to the one block that could hold a key.",
    d: "For each data block the builder records a separator key at least as large as the block's last key and smaller than the next block's first key, with a handle of offset and size. The shortened separator keeps the index small. A reader searches the index for the first separator at or above the target key and reads that block. Index blocks are cached with high priority. Large files split the index into partitions behind a top-level index. It is hard to keep the index small without breaking ordering: separators must be strictly between neighboring blocks.",
    k: ["Shortened separators versus full last keys: shortened shrink the index and cache cost, but depend on a correct comparator hook.", "Index storing values as handles versus delta encoded handles: delta handles save bytes per entry, but require sequential decoding."],
    p: ["An index separator equal to the next block's first key can send a lookup to the wrong block.", "A monolithic index for a huge file consumes a large amount of resident memory."],
    v: "Verify for every adjacent pair of blocks that the separator is greater than or equal to the previous block's last key and less than the next block's first key, then look up every key and confirm the correct block is read.",
    dep: ["data-block","comparator","block-cache"]
  },
  "filter-block": {
    s: "The stored filter bits for a file, either one whole-file filter or one per data block, located through the metaindex and loaded into the block cache or pinned.",
    d: "A full filter covers every key in a file, built after the last entry and written as one block, so a lookup checks one filter then reads at most one data block. Per-block filters were the older design and required mapping a block offset to its filter. The block records which filter type was used so readers choose the matching decoder. A prefix filter or whole-key filter or both can be stored. It is hard because a corrupted or missing filter must not cause false negatives: treat it as absent, never as always-negative.",
    k: ["Whole-file filter versus per-block filters: whole-file needs one lookup and is simpler, but large files make a large filter block to load and cache.", "Pinning filters in memory versus caching them: pinning removes filter read latency, but takes memory regardless of use."],
    p: ["Decoding a filter with the wrong policy returns false negatives and loses visible keys.", "Filters stored with a different prefix extractor than the reader uses give silently wrong skips."],
    v: "For every key in a table, confirm the stored filter reports possibly-present. Replace the filter with all zeros in a test copy and confirm the checksum or policy check refuses it rather than using it.",
    dep: ["sst-layout","meta-blocks","block-cache"]
  },
  "range-del-block": {
    s: "A block in the table file holding that file's range tombstones in fragmented, sorted form, separate from the point entries.",
    d: "Range tombstones inserted during a memtable's life are collected, fragmented into non-overlapping pieces carrying sequence numbers, and written to a dedicated block at flush or compaction. The reader loads it with the table and applies it to lookups and scans in that file and the files below it. It extends the file's key range boundaries because a tombstone may cover keys beyond the file's point entries. Compaction truncates fragments at output file boundaries. It is hard because tombstones must be preserved across file splits without covering keys they should not.",
    k: ["Separate block versus interleaved with point entries: separate allows a binary-searchable list per file, but needs loading before any read can be answered.", "Truncating tombstones at file boundaries versus whole-range duplication: truncation keeps files self-contained, but needs careful sequence handling so no key is wrongly uncovered."],
    p: ["Output files whose boundaries ignore tombstone extents make neighboring files overlap and break the sorted-run invariant.", "A tombstone block loaded for each read of a file with thousands of fragments is slow."],
    v: "Create a range delete covering three output files of a compaction and confirm each file's range block covers exactly its slice, and that every key inside the range is absent on read at every level.",
    dep: ["range-deletes","sst-layout","file-metadata"]
  },
  "meta-blocks": {
    s: "The properties and metaindex blocks: names of optional blocks and their locations, plus statistics such as entry count, raw size, compression and creation time.",
    d: "The metaindex maps names such as the filter, range tombstones and properties to block handles. The properties block stores entry count, deletion count, data size, index size, filter size, key and value sizes, oldest key time, comparator name, filter policy and compression, plus user-defined collectors' output. Compaction and tuning read these without scanning the file. Readers check the comparator name against the instance. The hard part is evolving the set: unknown properties must be ignorable by older readers.",
    k: ["Properties in the file versus in the manifest: in the file travels with it and survives rebuilds, but needs a read to access; in the manifest is fast but bloats the log.", "User-defined property collectors versus fixed statistics: collectors enable custom compaction triggers, but run code on every entry during file creation."],
    p: ["Using the entry count as exact when merges and deletions make it an estimate.", "A collector that throws or is slow can fail or stall every flush and compaction."],
    v: "Write a file with known counts of puts and deletes and confirm the properties block reports them. Open with a different comparator name and confirm the reader refuses the file.",
    dep: ["sst-layout","varint-coding","comparator"]
  },
  "footer": {
    s: "The final bytes of every table file: handles for the metaindex and index blocks, a format version, checksum type, and a magic number identifying the format.",
    d: "The footer has a fixed length so a reader can read it without knowing the file size beforehand beyond the end. It holds the metaindex and index block handles as varints padded to a fixed width, the format version, checksum type, and a magic number. The reader checks the magic number first, then the version, which decides how blocks are encoded. Files from a newer incompatible version are refused with a clear error. It is hard to extend because the layout is fixed and tail bytes are where a truncated file shows itself.",
    k: ["Fixed-size footer versus a variable trailer with length: fixed is trivially located from the end, but leaves little room for new fields.", "Magic number only versus magic plus version: a version lets the reader pick decoders, but forces old readers to reject newer files wholesale."],
    p: ["Opening files from the wrong software generation gives obscure parse errors unless the version is checked first.", "A partially written footer from a crash can pass a weak check and point to garbage."],
    v: "Truncate a table at several byte offsets and flip each footer byte in turn, confirming every case is rejected at open with a specific error, and never yields silently wrong results.",
    dep: ["varint-coding","block-checksums"]
  },
  "block-compression": {
    s: "Compresses each data block independently with a chosen codec, trading CPU for smaller files, with a type byte stored per block so codecs can differ by level.",
    d: "A block is compressed after it is filled; if the saved space is below a threshold, it is stored uncompressed. The type byte following the block says which codec was used. Fast light codecs suit the upper levels, written often, while stronger ones suit the bottom level, written rarely and holding most data. Decompression happens on every cache miss. Because blocks are independent, point reads need not decompress anything else. A trained dictionary shared across a file raises ratios on small blocks. It is hard to choose per-level codecs that balance CPU and space.",
    k: ["Light codec on upper levels and strong on the bottom: this saves CPU where data is rewritten often and space where most data lives, but needs per-level tuning.", "Dictionary compression versus none: a dictionary greatly improves small-block ratios, but must be trained, stored and loaded with each file."],
    p: ["Compressing already compressed values wastes CPU for no space saving.", "A corrupt compressed block can make the decompressor consume huge memory if the declared size is trusted."],
    v: "Compress the same dataset with each codec and report ratio, flush time and read latency. Confirm that blocks that compress poorly are stored raw and the type byte reflects it.",
    dep: ["data-block","block-checksums"]
  },
  "block-checksums": {
    s: "A checksum stored after every block, verified when the block is read, so bit rot and torn writes are caught before bad data is parsed.",
    d: "After compressing each block the builder computes a checksum over the block bytes and the compression type byte, and appends it. A reader recomputes it after reading and before decompressing, and returns a corruption status on mismatch. Hardware-accelerated checksum algorithms keep the cost low. The same mechanism covers log records and the manifest. Verification can be turned off for speed on reads but that gives up detection. The hard part is covering everything: a checksum over data alone misses a corrupted type byte or a misplaced block.",
    k: ["Verify on every read versus periodic scans: every read catches corruption at first use, but costs CPU on every cache miss.", "Checksum inside the block versus whole-file: per block localizes damage and allows partial reads, but cannot detect a block that is valid yet in the wrong place."],
    p: ["Disabling read verification for speed lets corrupted data be returned to callers or compacted forward.", "A checksum that omits the compression type byte lets a flipped byte pick the wrong decoder."],
    v: "Flip one bit in each of data block, index block and filter block of a test file in turn, and confirm each read touching that block returns a corruption status naming the file and offset.",
    dep: ["varint-coding"]
  },
  "table-builder": {
    s: "Streams sorted entries into a new table file, cutting blocks, building index and filter, and finishing with the footer, sharing one code path for flush, compaction and ingestion.",
    d: "The builder accepts entries in internal key order. It adds each to the current data block, adds the key to the filter, and when the block is full compresses, checksums and writes it, recording the handle in the index. Properties are collected on the way. Finish writes the meta blocks, index and footer, then syncs the file. It can also cut output files at a target size or at key boundaries given by the caller. Errors mid-file abandon the file. It is hard because the output must match exactly what the reader expects and be crash safe.",
    k: ["Writing blocks directly versus buffering the whole file: direct streaming uses bounded memory, but cannot know the final index and filter sizes until the end.", "Cutting at a target size versus at grandparent overlap boundaries: size-only is simple, but overlap-aware cuts limit later compaction cost."],
    p: ["Syncing the file after installing it in the manifest leaves a manifest pointing at a file that can be lost in a crash.", "A bug that writes unsorted keys produces a file that looks valid but returns wrong answers."],
    v: "Build files from random sorted input with a checker iterating the output, asserting strict key order, entry count equal to input, and that every key's filter and index lookup succeed.",
    dep: ["sst-layout","data-block","index-block","filter-block","block-compression"]
  },
});
