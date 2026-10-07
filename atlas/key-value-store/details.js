// Details for the key-value store plate, part 1: API and keys.
ATLAS.details("key-value-store", {
  "point-lookup-api": {
    s: "Reads the newest visible value for one key, or a batch of keys in one call, returning found, not found or an error as distinct outcomes.",
    d: "A get takes a key and optional read settings, then searches the memtables and files and returns the value or a not-found status. Multi-get sorts the keys, groups those that fall in the same file or block, and issues the reads together so filter and index lookups are shared and I/O can be parallel. Values can be returned by copy or pinned in the block cache to avoid a copy. The difficulty is that not found must mean no live version exists, which requires ruling out every source, including tombstones in newer ones.",
    k: ["Copying the value out versus returning a pinned reference: copies are simple and safe, while pinning saves memcpy for large values but holds cache blocks until the caller releases them.", "Batched multi-get versus a loop of gets: batching amortizes index and filter work and overlaps I/O, but needs sorted internal processing and returns results with more complex per-key status."],
    p: ["Treating an I/O error as not found silently turns a failing disk into apparent data loss.", "Holding pinned values across slow caller work starves the block cache of evictable space."],
    v: "Write one thousand keys, flush, delete half, and call multi-get on all of them: confirm deleted keys return not-found and the rest return their values, with fewer file reads than one thousand separate gets.",
    dep: ["get-path","per-call-options"]
  },
  "put-delete-api": {
    s: "Writes a value for a key, or marks a key deleted, as a new version rather than modifying anything in place. Single delete is a cheaper delete for keys written once.",
    d: "Put and delete each build a one-entry batch and go through the normal write path, so they are as atomic and durable as any batch. A delete writes a tombstone that hides older versions until compaction removes both. Single delete promises the key was put exactly once since its last delete, which lets the tombstone and that one put annihilate each other at compaction instead of persisting to the bottom level. The difficulty is that this promise is unchecked; breaking it resurrects old values.",
    k: ["Normal delete versus single delete: normal is always safe, while single delete clears space far sooner but corrupts visibility if the key was overwritten.", "Tombstones versus in-place removal: tombstones keep files immutable and writes sequential, but deleted data keeps occupying space and slowing scans until compaction reaches it."],
    p: ["Using single delete on a key that was updated twice makes an old value reappear after compaction.", "Deleting millions of keys one by one creates tombstone piles that make scans slower than before the delete."],
    v: "Put a key, single-delete it, compact to the bottom level, and confirm the key is absent and no tombstone remains in the table properties. Then put twice, single-delete once, and confirm the documented resurrection is the only outcome.",
    dep: ["write-batch","tombstones"]
  },
  "write-batch": {
    s: "A serialized list of puts, deletes and merges applied atomically and recorded in the log as a single record.",
    d: "The batch is a byte buffer: a header with a sequence number and entry count, then each entry as a type tag, optional column family id, key and value. The writer sees the whole buffer, so the log append and the memtable insert reuse the same bytes. Atomicity comes from the batch getting one contiguous sequence range and one log record, so recovery replays all of it or none. It is hard to size: a huge batch holds back other writers in the group and needs memory twice, once in the buffer and once in the memtable.",
    k: ["One record per batch versus per entry: one record gives all-or-nothing recovery and one checksum, but a very large batch blocks the write queue while it is logged.", "Embedding column family ids in the batch versus separate batches per family: embedding gives atomicity across families, but replay must resolve ids that may have since been dropped."],
    p: ["Unbounded batches cause long write stalls for unrelated writers and memory spikes at flush time.", "Assuming a batch is isolated from readers: entries become visible together only when the last sequence is published."],
    v: "Apply a batch of one hundred puts, kill the process mid-log-write by truncating the log inside that record, restart, and confirm none of the hundred keys exist. Truncate after the record and confirm all do.",
    dep: ["wal-format","sequence-assignment","varint-coding"]
  },
  "range-scan-api": {
    s: "Creates an iterator positioned by seek, with optional lower and upper bounds and a prefix hint, that walks keys in comparator order forward or backward.",
    d: "An iterator pins a consistent view, then supports seek to a key, seek for the last key at or before a key, next, prev and reading the current key and value. Bounds let the engine stop opening files outside the range and let it skip whole files at seek time. Prefix mode tells the engine only keys sharing a prefix are wanted so prefix filters can skip files. It is hard because backward movement is more expensive than forward: entries are stored with versions in reverse sequence order, so prev must skip multiple versions.",
    k: ["Explicit upper bounds versus checking keys in the caller: bounds let the engine avoid reading blocks beyond the range, but a wrong bound silently truncates results.", "Total-order scans versus prefix-mode scans: prefix mode uses filters and is much cheaper, but results beyond the prefix are undefined."],
    p: ["Forgetting an upper bound on a scan makes the iterator touch files past the range and lengthens tail latency.", "Reverse scans over keys with many versions or tombstones are several times slower than forward scans."],
    v: "Load ten million keys, run one thousand bounded range scans of one hundred keys each, and confirm the files opened per scan stays near the number of files overlapping the range, not the total file count.",
    dep: ["db-iterator","per-call-options","comparator"]
  },
  "merge-operator": {
    s: "A user-supplied associative function that combines stacked update operands into a value, letting counters, sets and appends be written without reading first.",
    d: "A merge writes an operand, not a value. At read or compaction time the engine collects the operands above the newest base value or delete and calls the operator, in full-merge mode with the base value or in partial-merge mode combining only adjacent operands. Partial merges at compaction shrink the stack even without a base. It is hard because the operator becomes part of the on-disk contract: it must be deterministic, associative where partial merge is used, and available at every open, or reads fail.",
    k: ["Merge operands versus read-modify-write: merges make writes blind and cheap, but reads and scans pay to resolve long operand stacks.", "Associative partial merge versus full merge only: partial merge bounds stack depth at compaction, but demands an associativity property that is easy to get subtly wrong."],
    p: ["Operand stacks growing unbounded on keys that are never read or compacted make the first read very slow.", "Changing operator behavior between versions corrupts previously written operands without any checksum failing."],
    v: "Apply ten thousand increment operands to one counter across several flushes, then read it before and after a full compaction. Both reads must return ten thousand, and the file holds a single entry after compaction.",
    dep: ["multi-version-entries","compaction-job","get-path"]
  },
  "per-call-options": {
    s: "Settings passed with each operation: snapshot, checksum verification, cache fill, readahead, bounds, whether to log and whether to sync.",
    d: "Read options choose the snapshot, whether to verify block checksums, whether blocks read are inserted in the cache, scan readahead, and timeouts. Write options choose whether to sync the log, whether to skip the log entirely, and whether to fail rather than wait during a write stall. Keeping these per call lets one instance serve a latency-critical write and a bulk load at once. The hazard is that a few options, such as skipping the log, change the durability contract for that write alone and are easy to leave on by accident.",
    k: ["Per-call durability versus an instance-wide default: per-call lets critical writes sync while bulk writes do not, but makes the guarantee depend on call-site discipline.", "Cache fill on versus off for scans: off protects hot data from a large scan, but repeated scans of the same range then always read from storage."],
    p: ["A bulk-load option copied into normal code paths disables the log and loses acknowledged writes on crash.", "Scans that fill the cache evict the working set and cause a latency spike for point reads."],
    v: "Write with the log disabled, crash the process, and confirm that write is gone while a synced write issued earlier survives. Run a full scan with cache fill off and confirm the block cache hit rate is unchanged.",
    dep: ["wal-sync-policy","block-cache","snapshots"]
  },
  "open-and-close": {
    s: "Brings an instance up from a directory: takes the lock, reads the manifest, replays the log, starts background threads, and on close flushes or abandons memory state.",
    d: "Open acquires an exclusive lock on the directory, reads the current manifest pointer, rebuilds the version, replays unflushed logs into memtables, then makes a fresh log and starts workers. Options decide whether to create the database if missing and which column families to open; opening with a subset is refused so no family's logs are skipped. Close waits for running jobs, optionally flushes memtables, and releases the lock. It is hard because every earlier failure mode, torn log, missing file, wrong comparator, shows up here first.",
    k: ["Requiring all column families at open versus allowing a subset: requiring all prevents silently dropping their log data, but forces callers to list families they may not use.", "Flush on close versus rely on log replay: flushing makes next open fast, but adds shutdown latency that process supervisors may cut short."],
    p: ["Two processes opening one directory corrupt it when the lock is advisory only or the file system ignores it.", "Slow log replay on open after a crash delays service restart by minutes when the log is very large."],
    v: "Open, write one million keys, kill the process, and reopen: confirm recovery replays the log, every acknowledged key reads back, and a second concurrent open on the same directory fails with a lock error.",
    dep: ["crash-recovery","manifest","file-locking","column-families"]
  },
  "comparator": {
    s: "The total order on keys, fixed when the database is created, that decides sort order in memory, in blocks, in indexes and across file boundaries.",
    d: "A comparator provides compare, a name, and optional hooks to shorten separators and successors used in index blocks. Bytewise order is the default; others reverse the order, compare numbers embedded in keys, or ignore a suffix. Every sorted structure, skip list, data block, index, and the manifest's file bounds, depends on it, so it cannot change after data exists. It is hard because the function must be a strict total order; any inconsistency produces files that look fine but cannot be searched.",
    k: ["Bytewise order versus a custom comparator: bytewise is fast and portable, while custom lets keys sort by meaning but costs a function call per comparison and ties data to code.", "Shortening separators in the index versus using full keys: shortening shrinks the index and cache footprint, but a buggy shortening function breaks block lookup for adjacent keys."],
    p: ["A comparator that is not transitive makes lookups miss keys that are present.", "Changing comparator behavior without changing its name defeats the open-time identity check and corrupts order."],
    v: "Insert one hundred thousand random keys, flush and compact, then scan and confirm each key is strictly greater than the previous under the comparator. Reopen with a differently named comparator and confirm open is refused.",
    dep: ["internal-key"]
  },
  "key-encoding": {
    s: "The application's rules for turning structured identifiers into byte strings so that comparator order equals the order scans need, and related items sit adjacent.",
    d: "Ordered storage makes the key layout the primary index. Integers are stored big-endian with the sign bit flipped so bytes sort numerically; composite keys concatenate fields with a terminator or fixed widths; a table or index id leads the key so each entity occupies its own contiguous range. Descending order is obtained by complementing bytes. It is hard because the layout is permanent: changing it means rewriting all data, and a poor choice makes scans random or creates one hot range.",
    k: ["Entity prefix on every key versus separate column families: prefixes are cheap and share one log, but families allow separate tuning and fast drop of a whole entity.", "Fixed-width fields versus delimiters: fixed width is simple and sorts correctly, but wastes space; delimiters save space but need escaping when fields hold arbitrary bytes."],
    p: ["Little-endian integers sort in the wrong order and make range scans return scrambled results.", "Monotonic keys such as timestamps at the front concentrate all writes in one range and compaction work in one spot."],
    v: "Encode integers from negative one thousand to positive one thousand, insert them in random order, scan, and confirm the numeric order is exactly ascending. Scan one entity prefix and confirm no key from another entity appears.",
    dep: ["comparator","prefix-extractor"]
  },
  "internal-key": {
    s: "The stored form of a key: the user key followed by an eight-byte tag packing a sequence number and an entry type, ordered so newer versions come first.",
    d: "Every entry in a memtable or table is an internal key plus a value. The tag holds a 56-bit sequence number and an 8-bit type such as value, deletion, single deletion, merge or range deletion. Comparison orders by user key ascending, then by tag descending, so the newest version of a key is found first. A lookup key is built with the snapshot's sequence number so a seek lands on the newest visible version. The difficulty is that sequence numbers have a hard ceiling and the tag's byte order must not interfere with user key comparison.",
    k: ["Sequence number in the key versus a separate version column: in the key keeps versions adjacent and sortable with no extra index, but every entry pays eight bytes.", "Descending sequence order versus ascending: descending lets a forward seek hit the newest version immediately, but makes backward iteration traverse versions oldest to newest."],
    p: ["A user key that ends with bytes resembling a tag can confuse tools that parse internal keys without the length.", "Exhausting the sequence space is unrecoverable without rewriting; instances must watch for it on very long-lived databases."],
    v: "Write the same key three times, dump the table file, and confirm three entries appear with sequence numbers descending. Read at a snapshot taken after the second write and confirm the second value is returned.",
    dep: ["comparator","sequence-numbers"]
  },
  "prefix-extractor": {
    s: "A function that maps a key to its prefix, so the engine can build prefix filters, bucket memtable entries and answer within-prefix scans cheaply.",
    d: "The extractor returns a fixed-length or delimited leading part of a key, and declares which keys it applies to. The table builder adds prefixes to the filter, the memtable can hash on the prefix, and iterators in prefix mode stop at the prefix boundary. It makes common queries like all rows for an entity much faster than total-order scans. It is hard because it is a promise about the key space: the comparator order must keep keys with one prefix contiguous, and keys without a prefix need defined behavior.",
    k: ["Fixed-length versus delimiter-based prefixes: fixed is trivial and fast, but forces one key shape; delimiter-based fits variable keys but requires every key to contain the delimiter.", "Prefix filters versus whole-key filters: prefix filters serve scans and lookups together, but cannot rule out a specific missing key within a present prefix."],
    p: ["Changing the extractor on existing data makes old filters give wrong answers, producing false negatives.", "Scans that cross a prefix boundary in prefix mode return arbitrary results instead of an error."],
    v: "With a four-byte prefix, load a million keys over ten thousand prefixes, then scan one prefix with prefix mode on and confirm the filter skips most files, visible in filter-useful counters.",
    dep: ["comparator","key-encoding"]
  },
  "key-timestamps": {
    s: "An optional fixed-width timestamp appended to each user key and compared separately, giving versioned reads by time without the application encoding it.",
    d: "The comparator is told how many trailing bytes are the timestamp. Ordering by user key ignoring the timestamp, then timestamp descending, makes the newest version at or before a read timestamp findable by an ordinary seek. Reads supply a timestamp; writes supply the timestamp of the new version. Compaction can discard versions older than a configured floor. It is hard because timestamps must be monotonic per key for correctness, and garbage collection needs a cutoff chosen so no reader still needs older data.",
    k: ["Engine-managed timestamps versus application-encoded versions in the key: engine-managed keeps the user key stable for filters and prefixes, but ties the file format to the feature.", "Eager version cleanup versus keeping history: cleanup bounds space, but any read below the cutoff then silently returns not-found."],
    p: ["Out-of-order timestamps for one key hide newer data behind older versions on read.", "Raising the cleanup cutoff past an active reader's timestamp makes that reader see missing keys."],
    v: "Write one key at timestamps 10, 20 and 30, then read at 25 and confirm the version from 20. Raise the cutoff to 25, compact, and confirm a read at 15 now reports not-found.",
    dep: ["comparator","internal-key","compaction-job"]
  },
  "varint-coding": {
    s: "Compact integer encodings used throughout the file formats: variable-length integers for lengths and offsets, fixed-width little-endian for fields needing random access.",
    d: "A variable-length integer stores seven bits per byte with a continuation flag, so small values take one byte. Lengths in data block entries, offsets in index handles, batch entry sizes and manifest fields use it. Checksums, footers and block-count fields use fixed widths so they can be read at known offsets. Decoders must bounds-check: a truncated or corrupted buffer can lead a varint decode off the end of the data. Format compatibility depends on these encodings never changing for existing record types.",
    k: ["Varint versus fixed-width fields: varint saves space where values are small, but prevents random access and costs a branch per byte on decode.", "Little-endian fixed-width versus network order: little-endian matches common hosts and avoids swaps, but the format is then defined by that choice forever."],
    p: ["Decoding without a limit pointer reads beyond a corrupt block and crashes or returns garbage lengths.", "Overlong varints, five bytes for a 32-bit value, are accepted by lax decoders and then break strict ones."],
    v: "Encode every value from zero to two million and boundary values such as 2^32 minus one, decode them, and confirm round trip. Feed truncated buffers to the decoder and confirm each returns an error, not a value.",
    dep: []
  },
});
