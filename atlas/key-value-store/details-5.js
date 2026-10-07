// Details for the key-value store plate, part 5: versions, levels and compaction.
ATLAS.details("key-value-store", {
  "sequence-numbers": {
    s: "A monotonically increasing counter stamped on every write entry, defining the total order of writes, the meaning of snapshots, and which versions compaction may drop.",
    d: "The counter is persisted implicitly: recovery takes the highest sequence found in the manifest and logs. Every entry gets one number, unique across the instance, so any two versions of any key are ordered. Snapshots hold a number, readers ignore anything above theirs, and compaction compares numbers to the oldest snapshot to decide what is garbage. Ingested files get a single global number replacing their internal ones. It is hard because the number must never go backward or repeat across crashes, and the width limits lifetime.",
    k: ["One global counter versus per-family counters: global gives cross-family consistent snapshots and atomic batches, but is one contention point for all writers.", "Sequence in the entry versus a separate version column: in the entry sorts naturally, but costs bytes on every entry that compaction later zeroes at the bottom level."],
    p: ["After a crash, recovering to a sequence lower than data already in files lets old versions shadow new ones.", "Zeroing sequence numbers at the bottom level while a snapshot still needs them breaks that snapshot."],
    v: "Crash during heavy writes, recover, write again, and confirm every new sequence number is greater than the highest present in any file or log, and that reads never return an older version of any key.",
    dep: ["internal-key"]
  },
  "multi-version-entries": {
    s: "The property that updates and deletes add new entries instead of replacing old ones, so several versions of one key coexist across memtables and files until compaction.",
    d: "A key updated three times has three entries with distinct sequence numbers, possibly in different files and levels. Reads find the newest visible; compaction later merges them and keeps only what snapshots require. Deletes add a tombstone version. Merge operands add stacked versions. The number of live versions per key drives space amplification and the cost of iteration, since every version must be stepped over. It is hard to bound: a hot key rewritten constantly can have thousands of versions before compaction reaches them.",
    k: ["Keep every version until compaction versus update in place: keeping gives lock-free readers and sequential writes, but spends space and iteration time on obsolete entries.", "Collapsing versions at flush versus only at compaction: flush-time collapsing shrinks level-zero files cheaply, but must respect snapshots that need older versions."],
    p: ["Hot keys with thousands of retained versions make seeks and scans on them slow.", "Counting stored bytes as live data overstates the database size when many versions are obsolete."],
    v: "Overwrite one key a million times with snapshots released, check file contents before compaction to see many versions, compact, and confirm exactly one entry remains.",
    dep: ["internal-key","sequence-numbers","compaction-job"]
  },
  "levels": {
    s: "The organization of table files into tiers of increasing size, where in each deeper level files are sorted and disjoint, and the first level may overlap.",
    d: "Flushes produce files at level zero, where key ranges can overlap since each covers whatever was in a memtable. At level one and below, files are non-overlapping and the whole level forms one sorted run. Each level is about a fixed multiple, typically ten, larger than the previous. Data moves down through compaction, so the oldest data is at the bottom and holds most bytes. The structure bounds read cost to one file per level plus level zero. It is hard because the size ratio sets both write and space amplification.",
    k: ["Large size ratio versus small: a large ratio means fewer levels and cheaper reads, but each compaction rewrites much more next-level data, raising write amplification.", "Few overlapping runs per level versus many: one run per level is read-friendly, but costs rewrite work each time data moves down."],
    p: ["Level sizes tuned for a small dataset give far too many or too few levels at production size.", "A large level zero makes every read probe many files."],
    v: "Load a database to one hundred gigabytes and confirm the levels table shows each level near ten times the previous, with no overlapping files at level one and below, checked by a boundary scan.",
    dep: ["file-metadata","version-set"]
  },
  "file-metadata": {
    s: "For every live file: its number, size, smallest and largest keys, sequence range, entry counts and reference counts, held in memory and recorded in version edits.",
    d: "The manifest and the in-memory version store for each table file its number, size, boundaries, smallest and largest sequence, number of deletions and age hints. Level lookup and compaction picking use the boundaries without opening files. The oldest key time guides expiry. Blob file references are recorded alongside. File metadata is small per file but multiplied by millions of files in a large instance. It is hard to keep exact: boundaries must include range tombstone extents, or reads miss deletions.",
    k: ["Boundaries in the manifest versus read from files: in the manifest allows planning without I/O, but grows the manifest and memory with file count.", "Larger files versus more files: larger files shrink metadata and open-file counts, but make each compaction coarser."],
    p: ["Boundary keys that ignore range tombstones let a lookup skip a file that holds a covering delete.", "Millions of small files make manifest replay at open take minutes."],
    v: "For every live file, scan it and confirm its first and last keys equal the recorded boundaries, extended by tombstone extents, and that file numbers are unique across all levels.",
    dep: ["levels","version-edit"]
  },
  "version-edit": {
    s: "A single record describing an atomic change to the file set: files added or removed per level, log numbers, next file number and last sequence.",
    d: "Flush adds a file and advances the log number; compaction removes its inputs and adds its outputs in one edit. Each edit is a tagged list of fields encoded with varints. Applying an edit to a version yields the next version. Edits are appended to the manifest and made visible in memory only after the append succeeds. Because one edit covers all the changes of a job, a crash leaves either the old file set or the new one. It is hard to make atomic across column families: an atomic flush edit must cover them all.",
    k: ["One edit per job versus several: one edit gives atomic installation of outputs and removal of inputs, but is larger and holds the manifest lock longer.", "Tagged fields versus fixed records: tags let new fields be added and old readers skip unknown ones, but ordering and defaults must be defined carefully."],
    p: ["Installing outputs in memory before the manifest append succeeds exposes files that vanish after a crash.", "An edit that removes inputs but fails to add outputs loses data."],
    v: "Run a compaction, kill the process at every step by fault injection, and confirm after recovery that the file set is either exactly the pre-edit set or exactly the post-edit set, and key contents are identical.",
    dep: ["manifest","file-metadata","varint-coding"]
  },
  "manifest": {
    s: "An append-only log of version edits recording every change to the file structure, with a small current pointer naming the active manifest file.",
    d: "At open the manifest is read and every edit replayed to rebuild the current file set. New edits are appended and synced before they take effect. When the file grows past a size limit, a new manifest is written beginning with a snapshot of the whole state, and a pointer file is updated atomically by rename to name it. The manifest uses the same record format as the log. Losing or corrupting it makes the database unopenable without repair, since the files themselves do not say which are current. It is hard to rewrite safely without a window where no valid manifest exists.",
    k: ["Rolling to a new manifest with a state snapshot versus growing forever: rolling bounds replay time and file size, but needs an atomic pointer switch.", "Syncing every edit versus batching: syncing every edit never loses structure changes, but adds a sync to every flush and compaction."],
    p: ["Deleting the old manifest before the pointer is durably updated leaves no valid state after a crash.", "A manifest never rolled grows into gigabytes and slows every open."],
    v: "Force a manifest roll, kill the process between writing the new manifest and updating the pointer, and confirm that reopening uses the old manifest and that no files are lost or duplicated.",
    dep: ["version-edit","wal-format","file-locking"]
  },
  "version-set": {
    s: "The in-memory chain of immutable versions, each a complete file set, plus superversions bundling a version with its memtables so a read can use one stable reference.",
    d: "Each version lists the live files per level. A flush or compaction creates a new version by applying an edit; old versions stay alive while any reader or iterator references them, which keeps their files from being deleted. A superversion adds the active and immutable memtables, giving a read a single reference-counted object to fetch. A thread-local cache of the current superversion avoids a global lock on the hot path. Obsolete files are purged when the last version referencing them is released. It is hard to reason about lifetimes: long-lived iterators retain old versions and hence space.",
    k: ["Immutable versions with reference counts versus a lock around the file list: references give readers lock-free stable views, but delay file deletion until every holder releases.", "Thread-local superversion caching versus a shared pointer: caching removes atomic contention on reads, but each thread must notice and refresh after changes."],
    p: ["An iterator held for days keeps every file in its version alive, blocking space reclamation.", "Forgetting to release a superversion reference leaks a version and its files."],
    v: "Open an iterator, compact all data twice, and confirm the old files still exist on disk while the iterator is open, and are deleted within one purge cycle after it is closed.",
    dep: ["levels","version-edit","immutable-memtables"]
  },
  "tombstones": {
    s: "Entries marking a key deleted at a sequence number, kept to hide older versions in lower levels until compaction can prove nothing older remains.",
    d: "A delete writes a tombstone entry with the key and a deletion type. It shadows every older version, wherever they live. A tombstone can be dropped only when compaction writes to the bottom level, or when no deeper level could hold an older version of the key, and no snapshot needs the data. Until then it consumes space and slows scans, which step over it. Single-delete tombstones are paired with the single put and vanish together. It is hard because deleting is not freeing: space comes back only after compaction reaches the bottom.",
    k: ["Keeping tombstones until bottom level versus dropping early: keeping is always correct, but long-lived tombstones inflate files and scans; dropping early resurrects old values.", "Triggering compaction on tombstone density versus size only: density triggers reclaim space and scan speed sooner, but add compaction work not driven by size."],
    p: ["Queues and sliding windows that delete as fast as they insert leave scans walking huge piles of tombstones.", "Dropping a tombstone when a deeper level still holds an older version brings deleted data back."],
    v: "Delete one million keys, scan from the start and record skipped entries, run a manual compaction to the bottom level, and confirm tombstones and the skipped count both fall to zero.",
    dep: ["internal-key","compaction-job","levels"]
  },
  "range-deletes": {
    s: "A single entry that deletes every key in a half-open range at a sequence number, avoiding one tombstone per key when dropping large spans.",
    d: "A range delete records a start key, an end key and a sequence number. It goes into the memtable's separate range list and then into files' range tombstone blocks. Reads and scans consult it: an entry is hidden if a covering tombstone is newer. Compaction applies it, dropping covered entries from its inputs. It is far cheaper than millions of point deletes, and the space frees as compaction reaches the covered files. It is hard because covering tombstones complicate file boundaries, make reads check an extra structure, and interact poorly with ingestion and snapshots.",
    k: ["Range delete versus point deletes: range delete costs one entry and is instant to write, but slows reads that must check it and needs compaction to free space.", "Dropping whole files wholly inside a range versus compaction: file dropping frees space immediately, but is only valid when no snapshot needs the data."],
    p: ["Thousands of overlapping range deletes accumulate and slow every read in that range.", "A range delete issued while ingestion is in progress can cover or miss newly ingested files, depending on sequence."],
    v: "Insert ten million keys, range-delete eighty percent, confirm scans skip them, then compact and confirm file sizes fall to about twenty percent and the tombstone is gone once it reaches the bottom.",
    dep: ["internal-key","range-del-block","compaction-job"]
  },
  "leveled-compaction": {
    s: "The default strategy: keep one sorted run per level below zero, and when a level exceeds its target merge a file into the overlapping files of the next level.",
    d: "Level zero files are merged into level one when their count reaches a trigger. For deeper levels, when a level's size exceeds its target, the picker chooses a file, finds the files in the next level that overlap it, and merges them all into new files in the next level. Reads stay cheap, space overhead is about ten percent, but each byte is rewritten roughly the size ratio times per level it passes through, giving high write amplification. It is hard because write amplification can reach twenty or more, which consumes device bandwidth and endurance.",
    k: ["Leveled versus tiered: leveled gives low read and space amplification, but pays high write amplification from repeated merging into the next level.", "Picking the file with the least next-level overlap versus the oldest: least overlap minimizes write work per compaction, but may leave cold files that never compact."],
    p: ["Write amplification of ten to thirty turns a modest user write rate into saturated storage.", "Compactions that cannot keep up let level zero grow and trigger stalls."],
    v: "Write at a steady rate and compare bytes written to storage by compaction against user bytes: confirm the ratio matches the expected level count times size ratio estimate, and read amplification stays near one file per level.",
    dep: ["compaction-picker","compaction-job","levels"]
  },
  "tiered-compaction": {
    s: "Lets several sorted runs accumulate in each level and merges them together only when enough similar-sized runs exist, trading higher read cost for much lower write cost.",
    d: "Instead of merging into an existing run of the next level, tiered compaction waits until a level holds a set number of runs of similar size and merges them into one larger run placed in the next level. Each byte is rewritten about once per level, so write amplification is roughly the number of levels, not levels times the ratio. Reads must check every run in a level, and space amplification rises because duplicates in older runs persist. It is hard because the run count bounds read cost, and merges are bursty, producing large single compactions.",
    k: ["Tiered versus leveled: tiered cuts write amplification several-fold, but raises read amplification by the run count and space amplification to near the level count.", "Fixed run count threshold versus size-ratio triggers: a count threshold is simple and predictable, but a ratio trigger adapts to skewed run sizes."],
    p: ["Merging many large runs at once needs temporary space equal to the combined size.", "Point lookups that miss probe every run and need very good filters to stay cheap."],
    v: "Run the same write workload under leveled and tiered settings and confirm tiered shows lower bytes written to storage and a higher count of files checked per read, matching the configured run counts.",
    dep: ["compaction-picker","compaction-job","levels"]
  },
  "universal-compaction": {
    s: "A tiered-style strategy treating all files as a time-ordered list of sorted runs, merging neighbors by size ratio and space amplification triggers.",
    d: "Runs are ordered from newest to oldest. The picker first checks whether total size beyond the oldest run exceeds a space amplification limit, in which case it merges everything into one run. Otherwise it looks for a sequence of newer runs whose sizes are within a ratio of each other and merges them. Merges only combine adjacent runs, preserving recency order. It gives low write amplification for write-heavy loads, at the price of a full-merge spike that needs up to double the space. It is hard to provision for those spikes.",
    k: ["Universal versus leveled: universal gives lower write amplification and simpler ordering, but needs transient free space up to the database size during full merges.", "Tight space amplification limit versus loose: tight limit triggers full merges often and costs write work; loose saves I/O but lets obsolete data pile up."],
    p: ["A full merge on a nearly full disk fails for lack of space and halts compaction.", "Long chains of runs keep read amplification high until a size-ratio merge triggers."],
    v: "Fill a database to sixty percent of disk, trigger a full universal merge, and confirm peak usage rises by about the database size, and that after completion only one sorted run remains.",
    dep: ["compaction-picker","compaction-job","levels"]
  },
  "fifo-compaction": {
    s: "A strategy that never merges files: when total size or file age exceeds a limit it deletes the oldest file, suiting caches and time-series data with natural expiry.",
    d: "Each flush adds a file at level zero. The picker checks total size or the age of each file's newest entry; when over the limit, it deletes the oldest files whole, with no rewriting. Write amplification is one, plus the log. Reads must check every file, so filters matter, and an optional light merge of small files bounds the file count. Updates and deletes do not reclaim space; old versions vanish only when their file expires. It is hard to apply to data that needs updates, since overwritten keys persist until expiry.",
    k: ["FIFO versus merging strategies: FIFO has near-zero write amplification and instant space reclaim, but gives no deduplication and read cost grows with file count.", "Size-based versus age-based deletion: size bounds disk use predictably, but data retention then varies with write rate; age keeps retention fixed but usage varies."],
    p: ["Using FIFO for data that must be retained loses it silently once the limit is reached.", "Many small flush files with no merging make reads probe dozens of files."],
    v: "Set a one gigabyte limit, write five gigabytes, and confirm total size stays below the limit, the oldest keys are gone, newest keys are all present, and compaction bytes written are zero.",
    dep: ["compaction-picker","file-metadata","version-edit"]
  },
  "compaction-picker": {
    s: "Decides what to compact next: scores each level, selects input files and the target level according to the configured strategy, and avoids conflicts with running jobs.",
    d: "For leveled strategy, each level gets a score of its size over its target, level zero uses file count over trigger, and the highest score above one is picked. It then selects a file, expands to all overlapping files in the next level, and checks that none are being compacted. Other strategies apply their own rules. It also considers compactions triggered by tombstones, expiry age or periodic refresh. Picks must be disjoint to run in parallel. It is hard because choices interact: a poor pick increases write amplification, and a stuck pick blocks higher-priority work.",
    k: ["Picking by highest score versus round-robin by key: score reacts to pressure fastest, but can repeatedly work the same hot range; round-robin spreads work and ages files evenly.", "Expanding inputs to reduce later overlap versus minimal inputs: larger inputs reduce future work, but make each job longer and hold more files busy."],
    p: ["Two jobs picking overlapping inputs corrupts level ordering unless the picker tracks files in use.", "A very large picked job blocks smaller urgent compactions behind it."],
    v: "Construct a state with level one over target by two times and level zero at its trigger, and confirm the picker chooses level zero first, then the oldest eligible file in level one, with inputs disjoint from running jobs.",
    dep: ["levels","file-metadata","compaction-priority"]
  },
  "compaction-job": {
    s: "Reads input files through a merging iterator, drops obsolete versions and dead tombstones, writes output files through the table builder, and installs the result atomically.",
    d: "The job opens the input files, merges them in internal key order, and for each user key decides which entries to keep: the newest, any needed by a snapshot, merge operands to resolve, and tombstones that cannot yet be dropped. Compaction filters may drop or change entries. It writes output files, cutting at a target size, syncs them, then applies one version edit removing inputs and adding outputs. Inputs are deleted after the edit and once no reader holds them. It is hard because correctness requires exact version retention rules, and failure mid-job must leave the inputs intact.",
    k: ["Cutting output files at size only versus at overlap boundaries: size only is simple, but boundary-aware cuts reduce later write work into the next level.", "Sync outputs before the edit versus after: before ensures the manifest never points at lost files, but makes the job wait on durable writes."],
    p: ["Discarding a version that an open snapshot still needs makes that snapshot return wrong data.", "A crash after deleting inputs but before the edit is durable would lose data, so the order must be edit first."],
    v: "Compact files containing known overwrites, deletes and snapshot-pinned versions, and verify via an independent model that the output contains exactly the versions the retention rules require.",
    dep: ["merging-iterator","table-builder","version-edit","tombstones"]
  },
  "subcompactions": {
    s: "Splits one large compaction by key range into pieces run by several threads in parallel, each writing its own output files.",
    d: "The job picks boundary keys, from file boundaries or index samples, dividing the input range into roughly equal parts. Each subcompaction merges only its slice and writes separate outputs. All outputs are installed in one version edit when every piece finishes. It shortens the time of large compactions, notably level zero to level one, which can otherwise be a single-threaded bottleneck. It is hard to balance: poor boundaries leave one thread doing most of the work, and total concurrency competes with other jobs for the thread pool.",
    k: ["Subcompactions versus more concurrent whole compactions: subcompactions parallelize a single big job that otherwise serializes, but add boundary logic and per-slice overhead.", "Fine versus coarse split points: finer splits balance load, but produce more small output files."],
    p: ["Range boundaries cutting through a key's versions would separate them, so splits must fall between user keys.", "Using many subcompactions from one job starves other pending compactions of threads."],
    v: "Compact a level zero set of ten gigabytes with one and four subcompactions and confirm elapsed time drops by close to the thread count and the resulting files hold the same keys.",
    dep: ["compaction-job","file-metadata","background-scheduler"]
  },
  "compaction-filter": {
    s: "A user callback invoked for each entry during compaction that may keep, drop or change it, letting application rules like expiry or cleanup run at no extra read cost.",
    d: "For each live key-value pair the filter is called with its level, key and value and returns keep, remove or a changed value. It sees only the newest visible version in the output, not entries retained for snapshots. Uses include expiry by embedded timestamp, dropping a deleted tenant's data and rewriting values for format migration. Because it runs during background work, it adds no foreground cost. It is hard because it changes data outside the write path: results differ between replicas, and a filter bug destroys data irrecoverably.",
    k: ["Filter at compaction versus delete via the write path: the filter reclaims space for free, but removals are not logged, not visible to snapshots consistently, and not replicated.", "Per-entry filter versus whole-file decisions: per-entry is fully general, but forces reading and rewriting files that whole-file drops could skip."],
    p: ["A nondeterministic filter produces different data in replicas that compacted at different times.", "A filter that drops entries below a snapshot's sequence changes what that snapshot sees."],
    v: "Install a filter dropping keys with a given prefix, run a full compaction, and confirm none remain, while a snapshot taken earlier still reads them because retained versions are not passed to the filter.",
    dep: ["compaction-job","ttl-expiry"]
  },
});
