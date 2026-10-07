// Details for the lakehouse table format plate, part 3: row-level changes, schema and layout evolution.
ATLAS.details("lakehouse-format", {
  "copy-on-write": {
    s: "Row changes handled by rewriting each affected data file with the changes applied, so readers never see deletes and reads stay simple and fast.",
    d: "To update or delete rows, the writer finds the files that contain matching rows, reads them, writes new files with the rows changed or removed, and commits a replace of old files by new ones. After the commit, files hold only live rows and readers need no merging. The cost lands on the write: a single-row change rewrites a whole file. It suits tables that are read far more than written and batch updates that touch many rows per file. The hard part is write amplification and conflicts: rewriting large files for tiny changes is slow, and concurrent changes to the same file collide.",
    k: ["Copy-on-write vs merge-on-read: copy-on-write makes reads cheap and layout clean but amplifies writes; merge-on-read does the reverse.", "Smaller vs larger target files: smaller files cut the bytes rewritten per change but multiply file counts and metadata."],
    p: ["A nightly job updating a few rows in every file rewrites the entire table.", "Two writers modify different rows in the same file, and the later commit must fail and redo the rewrite."],
    v: "Update one row, then compare data files before and after: only the file containing it is replaced, the new file contains the changed value, and a read returns no deleted or stale version of the row.",
    dep: ["conflict-detection", "bin-packing-rewrite", "file-size-targets", "snapshot-creation"]
  },
  "merge-on-read": {
    s: "Row changes recorded as separate delete information beside unchanged data files, with the readers merging them at query time, so writes are small and fast.",
    d: "A delete or update writes a small file that names rows to remove, and updates add the new row versions to a new data file. The table now has data files plus delete files linked by sequence number: a delete applies only to data written before it. Readers fetch both and filter. Writes are cheap and conflicts are rarer, but reads get slower as delete files accumulate until compaction folds them in. It suits frequent small updates, such as streaming upserts. The hard part is bounding read cost and getting the delete application order exactly right.",
    k: ["Merge-on-read vs copy-on-write: merge-on-read cuts write latency and amplification, but taxes every read and demands compaction.", "Position vs equality delete representation: position deletes are exact and fast to apply, while equality deletes are cheap to write without reading data."],
    p: ["Delete files pile up and query latency creeps up until someone notices.", "A reader that does not implement delete application returns rows that were removed."],
    v: "Delete rows, then query: removed rows must be absent. Check the commit added only delete files and no data rewrite, and that compaction later removes the delete files with identical query results.",
    dep: ["position-deletes", "equality-deletes", "delete-file-application", "delete-file-compaction"]
  },
  "position-deletes": {
    s: "Delete files that list exact file paths and row positions to remove. They are precise and cheap to apply, but a writer must know where each row is.",
    d: "Each entry names a data file and the zero-based position of a row in it. At read time the reader loads the delete entries for the file it is scanning and skips those positions. They are sorted by file and position so the merge is a linear pass. Creating them requires scanning to locate the rows, which an engine doing a DELETE or MERGE already does. They only apply to data files older than the delete. The hard part is that a rewrite of the data file invalidates positions, so deletes must be rewritten or dropped at the same time.",
    k: ["Position vs key-based deletes: positions are fast to apply and exact, but writers must read data to find them; keys can be written blind but cost more to apply.", "Per-file delete files vs shared across files: shared files are fewer but each read must scan entries for other files."],
    p: ["A data file is rewritten and old positions are applied to the new file, deleting the wrong rows.", "Thousands of tiny delete files, one per commit, each opened by every scan."],
    v: "Delete selected rows by position, scan the table, and confirm exactly those rows are missing; then rewrite the data file and confirm the delete file was removed in the same commit.",
    dep: ["merge-on-read", "delete-file-application", "immutable-files"]
  },
  "equality-deletes": {
    s: "Delete files that name rows by column values, such as a primary key, so a writer can delete or upsert without first reading where the rows are.",
    d: "An equality delete holds the values of one or more columns, and removes every older row that matches. It suits streams of changes keyed by id, since the writer simply emits the key and a new row. Because the reader does not know which files hold matches, it must apply each delete to all older data files in the partition, typically by loading the keys into a hash set. Cost grows with the number of keys and files. The hard part is that these deletes cannot be dropped until all older data they match has been rewritten.",
    k: ["Equality vs position deletes: equality is write-efficient and blind, but read-expensive and hard to compact; position is the opposite.", "Equality field choice: using a primary key gives precise deletes, while a wider set of columns is safe but inflates the files."],
    p: ["A very large key set cannot fit in memory on readers and scans fail or spill heavily.", "A schema change to a key column leaves equality deletes comparing mismatched values."],
    v: "Upsert the same key several times through a stream, then query by that key: exactly one row with the latest values must appear, and removing its older versions must not affect rows added after the delete.",
    dep: ["merge-on-read", "delete-file-application", "stream-writers", "field-ids"]
  },
  "deletion-vectors": {
    s: "A compact bitmap per data file that marks deleted row positions, stored inline or as a small file, replacing larger position delete files.",
    d: "A deletion vector holds one bit per row of a specific data file, usually compressed. Each file has at most one, and a new delete produces a new merged vector instead of another delete file, so there is no pile-up and a reader fetches one small structure per file. Vectors are referenced from the file's manifest entry or log action. They make merge-on-read cheaper and bound the number of delete objects. The hard part is that each update rewrites the vector, so writers must merge with the existing one, and concurrent deletes of the same file conflict.",
    k: ["One vector per file vs many delete files: one vector bounds read cost and metadata, but turns concurrent deletes on a file into conflicts.", "Inline in metadata vs separate files: inline saves a read, but bloats the metadata that every reader loads."],
    p: ["Two writers delete different rows of the same file and the second is forced to retry as a conflict.", "A reader without vector support ignores them and returns deleted rows."],
    v: "Delete rows from a file twice in separate commits and confirm the file has exactly one current vector marking the union of both sets, and a scan skips every marked position.",
    dep: ["merge-on-read", "manifest-entry", "feature-compatibility", "delete-file-application"]
  },
  "delete-file-application": {
    s: "The reader step that merges deletes into a scan: for each data file, find the deletes that apply by sequence number and partition, and drop the matching rows.",
    d: "The planner associates each data file with the delete files that could affect it: same partition, delete sequence number at least the file's. At read time, position deletes and vectors are loaded as sets of positions, and equality deletes as key sets, and rows are filtered as they stream. Pruning applies to deletes too, using statistics to skip those that cannot match. Correctness depends on sequence numbers: a delete must not remove rows added after it. The hard part is performance with many deletes and applying them inside vectorized readers.",
    k: ["Apply in the file reader vs in the engine: reader-level application is faster and shared, but each reader implementation must replicate it correctly.", "Cache loaded delete sets vs reload per task: caching saves repeated reads, but costs memory and invalidation logic."],
    p: ["An equality delete is applied to rows with a later sequence number and removes new data.", "Residual filters are evaluated before deletes and an aggregation counts removed rows."],
    v: "Build a table with a delete followed by a re-insert of the same key and confirm the scan returns the new row and not the old one; compare against a fully rewritten copy.",
    dep: ["position-deletes", "equality-deletes", "deletion-vectors", "manifest-entry"]
  },
  "merge-into-planning": {
    s: "Turning a MERGE, UPDATE or DELETE statement into a plan that finds matching rows, produces new versions or delete records, and commits them together.",
    d: "The engine joins the target table with the source on the match condition to classify each row as matched or not. It then emits new rows for inserts and updates and, depending on the table's mode, either rewrites affected files or writes delete files and new data. To avoid scanning everything it prunes target files using the match condition's statistics. The result is committed as one snapshot. The hard part is that a source row matching several targets is ambiguous and must be an error, and that the join is a full shuffle on large tables.",
    k: ["Rewrite affected files vs write deletes: rewriting keeps reads clean, writing deletes keeps the merge cheap; modes are chosen per table or operation.", "Prune target by source statistics vs scan whole target: pruning cuts I/O massively but needs predicates on partition or sorted columns."],
    p: ["Duplicate source keys match one target row several times and the engine produces nondeterministic updates.", "The merge condition lacks a partition filter and rewrites the full table."],
    v: "Run a merge with inserts, updates and deletes against a known target, then diff the result with a reference computed independently, and confirm only files that contain matching rows were replaced.",
    dep: ["copy-on-write", "merge-on-read", "file-pruning", "optimistic-commit", "split-planning"]
  },
  "row-identity": {
    s: "A stable identifier and last-modified version for each row, assigned by the format, which lets engines track a row across updates and rewrites without a user key.",
    d: "When enabled, each row gets an id derived from its file's first-row id plus position, and a sequence number of the commit that last changed it. Rewrites preserve both, so compaction does not make every row look changed. This supports incremental processing, change tracking and engines that need to update without a primary key. Without it, row identity exists only if the user supplies a key. The hard part is that preserving ids through rewrites requires every writer, including compaction, to carry the metadata properly.",
    k: ["Format-assigned ids vs user-defined keys: format ids work for any table and survive rewrites, but cost storage and writer support; keys are explicit and portable.", "Store in file vs derive from metadata: stored values survive anything but add bytes; derived values are free but break if file layout metadata is lost."],
    p: ["A rewrite tool that does not carry ids forward makes every compacted row look new.", "Row ids are used as business keys though they change if rows are re-inserted."],
    v: "Compact a table and confirm each row's id and last-updated version are unchanged for unmodified rows, while an updated row keeps its id with a newer version.",
    dep: ["manifest-entry", "snapshot-lineage", "bin-packing-rewrite"]
  },
  "incremental-reads": {
    s: "Reading only what changed between two snapshots, as appended files or as row-level inserts, updates and deletes, so downstream jobs process deltas instead of full tables.",
    d: "For append-only history, the reader lists data files added between snapshots by diffing manifests, which is metadata only. For changes including updates and deletes, it must compute the net effect of added data files and delete files, or read recorded change data written by the writer. Consumers store the last snapshot id they processed and resume from it. The hard part is correctness over compaction and expiry: a rewrite commit changes files but not rows, so it must be recognized and skipped, and an expired start snapshot makes the range impossible.",
    k: ["Derive changes from file diffs vs write change files: deriving costs nothing at write time but is approximate for updates; change files are exact but double write volume.", "Snapshot-id bookmarks vs timestamps: ids are exact, while timestamps are readable but ambiguous when commits are close."],
    p: ["A compaction commit is read as thousands of new rows and a downstream table doubles.", "The consumer's bookmark snapshot was expired and the incremental read fails or silently starts over."],
    v: "Append, update and delete rows across several commits, run the incremental read over that range, and apply the output to a copy of the starting table: the copy must equal the final table.",
    dep: ["snapshot-lineage", "manifest-list", "row-identity", "snapshot-summary"]
  },
  "field-ids": {
    s: "Every column gets a permanent integer id at creation. Files, statistics and schemas refer to columns by that id, never by name or position, so renames and reorders are metadata-only.",
    d: "Ids are assigned monotonically, never reused, and stored in the schema and in each data file's own schema. Readers project by id: they look up which column in a file has the requested id, and fill nulls or defaults for ids missing from that file. Statistics keyed by id survive renames. Nested fields get ids too. The hard part is files written without ids, such as those imported from elsewhere, which require a name mapping, and the discipline that ids must never be recycled after a drop or old files would resurface.",
    k: ["Id-based vs name-based column resolution: ids make renames and drops safe, but need ids embedded in files; names are simple but break on rename and reuse.", "Reuse dropped ids vs never reuse: reuse keeps numbers small, but risks old files being read as the new column."],
    p: ["A dropped column's id is reused and old files return their stale values as the new column.", "Imported files without ids are read by name and a later rename detaches them."],
    v: "Rename a column, then read old and new files together: values appear under the new name, and statistics-based filters on it still prune old files. Drop and add a same-named column and confirm it reads as all null.",
    dep: ["field-id-mapping", "table-metadata-file"]
  },
  "schema-evolution": {
    s: "Adding, dropping, renaming, reordering and widening columns as metadata changes, with old files still readable and no rewrite of existing data.",
    d: "A schema change is a commit that adds a new schema to the metadata and makes it current. Files written under older schemas remain valid: a reader maps columns by id, returns null or a default for columns the file lacks, and ignores columns that were dropped. Each snapshot records the schema it was written under, so time travel can read old versions with their schema. Nested fields can evolve too. The hard part is semantics, not mechanics: what a dropped-and-readded column means, or what a type change does to the statistics and partition values already written.",
    k: ["Metadata-only evolution vs rewrite: metadata-only is instant and safe for old data, but the reader must handle every historical schema forever.", "Allowing incompatible changes with a flag vs forbidding: forbidding protects downstream consumers, but forces new-table migrations for legitimate corrections."],
    p: ["A column is renamed and downstream jobs that read it by name fail without warning.", "Adding a required column breaks writers that were not updated."],
    v: "Add, rename and drop columns across commits, then read the table at each snapshot: every read must use that snapshot's schema, and old data files must be returned without any file having been rewritten.",
    dep: ["field-ids", "table-metadata-file", "type-promotion", "column-defaults"]
  },
  "type-promotion": {
    s: "The small set of type changes that need no rewrite, such as widening an integer or increasing a decimal's precision, defined so that old file values read correctly as the new type.",
    d: "The specification lists allowed promotions: narrower integers to wider, single to double precision float, decimals with a larger precision and the same scale, and dates to timestamps in some versions. Readers convert on the fly when a file's type is older than the table's. Anything else, like string to number, is not an evolution and requires rewriting. Promotions also affect statistics and partition transforms, whose stored values must remain comparable. The hard part is lossy-looking cases, such as float to double, which gives visibly different decimal strings for the same stored bits.",
    k: ["Restrict to lossless widening vs allow general casts: restriction guarantees old data reads exactly, but forces rewrites for common corrections.", "Convert at read vs rewrite eagerly: read conversion is free at change time, but adds per-value work and complexity in every reader."],
    p: ["Float widened to double shows noisy digits that downstream comparisons treat as changes.", "A reader that does not know a newer promotion fails or returns garbage for old files."],
    v: "Widen an integer column, then read files written before and after: values must be identical to the originals, and filters on the column must prune both file generations correctly.",
    dep: ["schema-evolution", "column-bounds", "compression-codecs"]
  },
  "column-defaults": {
    s: "A value recorded in the schema that is used for existing rows when a column is added, and optionally for new rows that omit it.",
    d: "Two defaults exist conceptually: the initial default, applied when reading files that predate the column, and the write default, applied by writers when a row has no value. The initial default is stored in the schema, so no file is rewritten for a new column with a constant value. Without it, old rows read as null, which may be wrong for columns declared not null. The hard part is that a default is fixed forever for old rows, so changing the write default later must not change how old files read.",
    k: ["Initial default in metadata vs backfill by rewrite: metadata default is instant and free, but readers must apply it forever; backfill makes files self-describing at a high cost.", "Separate initial and write defaults vs one: two values keep history stable, but confuse users who expect a single setting."],
    p: ["Changing the default alters how old rows read because it was applied at read time from the wrong field.", "Engines that do not support defaults return null for old rows, giving different answers per engine."],
    v: "Add a column with a default, read a file written before it: every row must show the default; then write rows without it and confirm they receive the write default, with old files untouched.",
    dep: ["schema-evolution", "field-ids", "feature-compatibility"]
  },
  "partition-spec": {
    s: "The definition of how rows map to partitions: a list of source columns and transforms, with its own id so every file records which layout it was written under.",
    d: "A spec lists fields such as a day transform of a timestamp or a bucket of a key. Each data file stores the resulting partition values and the id of its spec. The table can hold many specs over its life, and a snapshot can contain files from several. Planning evaluates a filter against each spec separately. Partitioning here is a metadata concept used for pruning and organizing writes, not a directory convention. The hard part is that cardinality choices persist: too fine a partition produces tiny files, too coarse prunes nothing.",
    k: ["Fine vs coarse partitioning: fine partitions prune more but create many small files; coarse partitions keep files large but scan more.", "Partition spec in metadata vs directory names: metadata lets layout change and avoids path parsing, but readers need the format rather than just a file listing."],
    p: ["Partitioning on a high-cardinality column makes millions of tiny partitions.", "A planner evaluates a filter against only the current spec and skips files written under an older one."],
    v: "Write data under a spec, then list files with partition values: every file must have values matching its rows' source columns under the stated transform, and a filter on the source column must prune by them.",
    dep: ["partition-transforms", "partition-tuples", "table-metadata-file", "field-ids"]
  },
  "hidden-partitioning": {
    s: "Partition values are derived from ordinary columns by transforms, so users filter on the real column and the engine prunes partitions without anyone writing a partition predicate.",
    d: "In older layouts users added a separate partition column such as a date string and had to include it in every query, or the whole table was scanned. Here the table defines the partition as a transform of a source column, such as the day of a timestamp, and the planner translates a filter on the timestamp into a partition filter. Writers compute the values automatically. The partition column does not appear in the schema. The hard part is the transform's inversion: the planner must translate every predicate shape correctly or lose pruning or, worse, correctness.",
    k: ["Derived transform vs explicit partition column: transforms remove user error and let layout change, but require engines to implement predicate translation.", "Lossy transforms such as day vs exact values: lossy ones give manageable partition counts, but need a residual filter to be exact."],
    p: ["A query using a function on the source column bypasses translation and scans all partitions.", "Different time zone handling in two engines yields different partition values for the same timestamp."],
    v: "Query a timestamp range with no partition column mentioned and confirm via the scan report that only the partitions overlapping the range were read, and the result equals a full scan with the same filter.",
    dep: ["partition-spec", "partition-transforms", "predicate-pushdown", "partition-summaries"]
  },
  "partition-evolution": {
    s: "Changing a table's partitioning going forward, such as from monthly to daily, while old files keep their original layout and no data is rewritten.",
    d: "A change adds a new spec and makes it the default for future writes. Existing files retain their old spec id and partition values. Planning evaluates the filter once per spec present in the table, so a query spanning old and new data prunes each part appropriately. Optionally a later rewrite migrates old files. This lets a table adapt as data volume grows without a migration project. The hard part is that old data keeps its old, possibly bad layout, and plans must handle many specs, which complicates manifest grouping and compaction.",
    k: ["Evolve forward only vs rewrite history: forward-only is free and immediate, but old data stays poorly organized until compacted.", "Many specs coexisting vs single spec per table: coexistence avoids rewrites, but every tool must handle all specs correctly."],
    p: ["Compaction groups files across specs and writes files that match neither layout.", "A tool that reads only the current spec misses pruning data from old files and returns wrong results."],
    v: "Change partitioning from month to day, write new data, then query across the boundary: the plan must show both specs evaluated, results must match a full scan, and old files must be unchanged on storage.",
    dep: ["partition-spec", "manifest-file", "compaction-planner", "table-metadata-file"]
  },
  "sort-order": {
    s: "A declared ordering of rows within data files that writers should follow, recorded in the table and on each file so readers and planners know what to expect.",
    d: "A sort order lists columns, directions and null placement. Writers sort each file by it, which tightens min and max bounds and improves compression. Each file records the order id it was written with, so planners can tell which files are sorted, and engines can exploit it for merge joins or early termination. The order may change over time, like partition specs. It is advisory: writers that ignore it still produce valid files. The hard part is that benefit depends on all writers honoring it, which is rare across engines.",
    k: ["Sort on write vs sort in maintenance: write-time sorting keeps layout good continuously but slows ingestion; maintenance sorting is cheaper per write but lets data go unsorted.", "Advisory vs enforced: advisory is simple and compatible, but readers cannot rely on order for correctness."],
    p: ["A reader assumes files are sorted because the table declares it, but one writer ignored the order.", "Sorting on a high-cardinality column in a streaming writer produces tiny sorted files."],
    v: "Write with a declared order, then inspect each file's min and max on the first sort column: ranges across files must be mostly disjoint, and each file's rows must be nondecreasing in that column.",
    dep: ["sort-and-cluster", "column-bounds", "table-metadata-file"]
  },
  "table-properties": {
    s: "Key-value settings stored in table metadata that control behavior: file size targets, compression, delete mode, retention, and which optional features are enabled.",
    d: "Properties are read by every writer and by maintenance jobs, so they keep behavior consistent across engines that share a table. Typical settings are the write target file size, the row group size, the compression codec, whether updates use copy-on-write or merge-on-read, snapshot retention, and metadata cleanup. Changes are commits and take effect for later operations. Engines may also have their own settings that override them. The hard part is precedence: when table properties conflict with engine defaults, behavior differs by engine and users cannot tell why.",
    k: ["Table properties vs engine configuration: table properties apply to every writer consistently, but engines may ignore unknown ones, so the table setting is only a hint.", "Open key-value namespace vs typed fields: key-value is extensible without a spec change, but offers no validation of misspelled keys."],
    p: ["A misspelled property is accepted silently and the intended setting never applies.", "One engine ignores the table's delete mode and writes copy-on-write into a table that others expect merge-on-read."],
    v: "Set a target file size and delete mode in table properties, write and delete from two engines, and confirm file sizes and delete behavior follow the table's settings in both.",
    dep: ["table-metadata-file", "file-size-targets"]
  }
});
