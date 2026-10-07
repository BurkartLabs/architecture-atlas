// Details for the lakehouse table format plate, part 1: engines and maintenance.
ATLAS.details("lakehouse-format", {
  "query-engine-connectors": {
    s: "Plugins that let a query engine see tables as ordinary tables: they resolve names through the catalog, plan scans from metadata and hand file reads to the engine's own readers.",
    d: "A connector implements the engine's table interface on top of the format's client library. For reads it loads current metadata, prunes manifests and files, and returns scan tasks for the engine to distribute. For writes it produces data files and a commit request. Each engine has its own type system, null semantics and function behavior, so the connector maps types and expressions carefully. The hard part is that engines differ in which features they support, such as row-level deletes, branches or new types, so a table one engine writes may be partly unreadable by another.",
    k: ["Shared client library vs per-engine reimplementation: one library keeps behavior identical but ties engines to its release cycle; reimplementation is flexible but drifts on edge cases.", "Engine-native readers vs library readers: native readers are faster and vectorized, but each must independently honor deletes and schema mapping."],
    p: ["A connector ignores delete files it does not understand and returns rows that were deleted.", "Type mapping silently truncates timestamp precision or decimal scale when moving between engines."],
    v: "Write a table with one engine, read it with a second, and compare row counts and a checksum over every column, including nulls, nested values and timestamps at their full precision.",
    dep: ["reader-library", "catalog-interface", "split-planning", "spec-conformance"]
  },
  "batch-writers": {
    s: "Jobs that write large sets of rows as new data files and then publish them in a single commit, either appending or replacing the affected partitions or rows.",
    d: "A batch write has tasks produce files in parallel, report their metadata (path, size, row count, statistics) to a coordinator, and the coordinator makes one commit that adds them. Nothing is visible until that commit, so a failed job leaves only unreferenced files. Overwrites commit a combined remove-and-add. Writers choose how to distribute rows to tasks so that files align with partitions and sort order. The hard part is that task retries and speculative attempts create duplicate files, and only files the coordinator names may enter the commit.",
    k: ["One commit per job vs per task: a single commit makes the job atomic and keeps history short, but all work is lost on failure and the final commit is a bottleneck.", "Dynamic partition overwrite vs explicit overwrite filter: dynamic is convenient but replaces whatever partitions appear, which can silently delete more than intended."],
    p: ["A speculative duplicate task attempt is included in the commit and rows appear twice.", "An overwrite with a stale filter removes partitions that another writer added concurrently."],
    v: "Kill a batch job halfway and confirm the table's row count and current snapshot are unchanged, then rerun it and confirm the count increases by exactly the input size.",
    dep: ["staged-data-files", "optimistic-commit", "write-distribution", "file-size-targets"]
  },
  "stream-writers": {
    s: "Continuous writers that commit small batches on a short interval, turning an event stream into table snapshots while tracking progress so a restart does not duplicate or lose data.",
    d: "A streaming writer buffers records, closes files at a checkpoint, and commits them with the checkpoint identifier stored in the snapshot summary. After a restart it reads the last committed identifier from the table and skips anything already published, which gives exactly-once results over at-least-once input. Frequent commits give low latency but create many small files and many snapshots, so streaming tables need steady compaction. Upserts from a change stream are usually written as equality deletes plus inserts. The hard part is the commit rate, since every commit is a contended pointer swap.",
    k: ["Short commit interval vs long: short intervals cut latency but multiply small files, snapshots and commit conflicts; long ones delay freshness.", "Writer-tracked progress in table metadata vs external offset store: storing it in the snapshot makes data and progress atomic, at the cost of a table-specific convention."],
    p: ["Two jobs with the same identifier commit interleaved checkpoints and each skips the other's data.", "Commit every few seconds produces millions of tiny files before maintenance catches up."],
    v: "Stop and restart the writer repeatedly during a run of known input, then count distinct keys and total rows in the table: both must equal the input with no duplicates and no gaps.",
    dep: ["idempotent-commit", "equality-deletes", "snapshot-summary", "optimistic-commit"]
  },
  "reader-library": {
    s: "The shared code that loads metadata, resolves snapshots, prunes and plans scans, and applies deletes, so engines can read tables without parsing the specification themselves.",
    d: "The library parses the metadata file, selects a snapshot by id, time, branch or tag, walks the manifest list and manifests with filter expressions, and emits scan tasks that each name a data file, byte range, associated delete files and a residual filter. It handles schema projection by field id and partition value reconstruction. It also provides metadata caches and parallel manifest reads. The hard part is staying consistent with the written specification across versions while still exposing a fast API for engines with different threading models.",
    k: ["Rich planning API vs thin file listing: returning tasks with residual filters helps engines skip work, but couples them to the library's evaluation semantics.", "Eager vs lazy manifest reading: eager is simpler, lazy lets planners stop early and bound memory for tables with millions of files."],
    p: ["Planning loads every manifest into memory for a huge table and runs the coordinator out of memory.", "A library upgrade changes the residual filter, and an engine that trusted it returns extra rows."],
    v: "Plan a scan with a selective filter on a table of many manifests and confirm the number of manifests read and files returned matches an independent count of files whose bounds can match.",
    dep: ["table-metadata-file", "manifest-pruning", "file-pruning", "delete-file-application", "field-id-mapping"]
  },
  "spec-conformance": {
    s: "The shared test suite and specification text that make independent implementations agree on reads and writes, including rarely used corners such as null ordering, time zones and delete semantics.",
    d: "The specification defines files, fields and the rules for evaluating them. Because implementations are written separately, the ecosystem relies on conformance tests: tables produced by one implementation are read by every other and compared. Test data covers evolved schemas, partition changes, every delete kind, empty tables and unusual values. When behavior is ambiguous the community clarifies the text and adds a case. The hard part is that new features are implemented unevenly, so conformance must be tracked per feature and not as one pass or fail.",
    k: ["Executable test corpus vs prose-only specification: a corpus catches disagreements early but must be maintained, while prose alone lets implementations diverge.", "Strict rejection of unknown fields vs ignoring them: rejecting is safe for correctness but blocks gradual rollout of extensions."],
    p: ["Two writers interpret an ambiguous rule differently and a table that each reads fine is corrupted by the other.", "A feature is declared supported after passing simple cases but fails on evolved schemas."],
    v: "Run the cross-implementation matrix: every writer's output tables are read by every reader, and all result checksums match for each feature in the corpus.",
    dep: ["format-version", "field-ids"]
  },
  "feature-compatibility": {
    s: "Declared minimum reader and writer requirements stored in the table, so an engine that lacks a needed feature refuses to touch the table instead of misreading or corrupting it.",
    d: "The table metadata records its format version and, in some designs, an explicit list of required features, split into those needed to read and those needed to write. A client compares that list to what it supports before planning. Reading a table with an unknown delete type or new column type would give wrong answers, so the check is a hard gate. Features can be added to a table only by upgrading it, which is a one-way operation for old clients. The hard part is that upgrade timing across many engines is a social process, not a technical one.",
    k: ["Version number vs feature list: a single version is simple to compare but forces all-or-nothing upgrades; per-feature flags allow finer adoption but complicate every client.", "Block unknown writers vs only unknown readers: blocking writers prevents corruption by silent omission of new metadata, but stops legacy jobs entirely."],
    p: ["A table is upgraded for one new engine and every older pipeline starts failing at the same moment.", "A writer without the feature drops metadata it does not understand, such as deletion vectors."],
    v: "Enable a new table feature, then attempt a read and a write from a client that lacks it: both must fail with a clear message naming the missing feature, and table data must be unchanged.",
    dep: ["format-version", "table-properties"]
  },
  "predicate-pushdown": {
    s: "Passing the query's filters down into planning and file reading so that manifests, files, row groups and pages are skipped before any unneeded data is fetched.",
    d: "The engine converts its filter into the format's expression form and binds it to field ids. Planning applies it first to partition values and manifest summaries, then to file statistics. Inside a file the reader applies it to row group statistics, bloom filters and page indexes. Whatever cannot be proven irrelevant remains as a residual filter that the engine evaluates on rows. Because evaluation must be conservative, pruning may keep a file that has no matches but must never drop one that does. The hard part is expressions with functions or casts, which cannot always be translated.",
    k: ["Conservative inclusion vs exact pruning: always keeping uncertain files guarantees correctness, but loose statistics make pruning less effective.", "Pushing function-wrapped predicates vs only plain column comparisons: translating more expressions prunes more, but each new rule risks incorrect skipping."],
    p: ["A cast on the filtered column prevents translation, so the whole table is scanned.", "Null handling in the pushed predicate differs from the engine's, and rows that should match are skipped."],
    v: "Run the same query with pushdown on and off and compare results exactly; then check the scan report shows the pushed-down run read far fewer files and bytes.",
    dep: ["manifest-pruning", "file-pruning", "row-group-pruning", "column-bounds"]
  },
  "split-planning": {
    s: "Turning the set of matching files into parallel tasks of balanced size, splitting large files at row group boundaries and bundling small files together.",
    d: "After pruning, the planner has a list of data files with sizes and delete associations. It splits big files at row group offsets, packs small ones into tasks by a target size and an open-file cost, and keeps each file with the delete files that apply to it. The result is a list of tasks the engine schedules across executors. Locality is irrelevant on object storage, so balancing by bytes and by estimated cost matters more. The hard part is skew: a few huge files or heavy delete files make one task far slower than the rest.",
    k: ["Split at row groups vs whole files: splitting improves parallelism for big files, but small row groups then raise per-task overhead.", "Planning on the coordinator vs distributed planning: coordinator planning is simple, but for tables with millions of files it becomes the bottleneck and a memory risk."],
    p: ["Thousands of tiny files each become a task and scheduling overhead dwarfs the read time.", "A file plus all its delete files lands in one task far larger than the rest and stalls the stage."],
    v: "Plan a scan over a skewed table and report task sizes: the largest task should be within a small multiple of the median, and no task should hold more than its target number of files.",
    dep: ["file-pruning", "row-groups", "file-size-targets", "delete-file-application"]
  },
  "table-sql-surface": {
    s: "The SQL statements and functions engines expose for tables: create, alter, merge, time travel clauses and metadata tables that list snapshots, files and manifests as rows.",
    d: "Users issue standard statements, and the engine translates them into format operations: ALTER becomes a schema update commit, MERGE becomes a planned rewrite or delete-file write, and a time travel clause selects a snapshot. Metadata is queryable as hidden tables, such as one listing every data file with its statistics, which operators use to diagnose layout. Procedures expose maintenance as callable commands. The hard part is that syntax for versions, branches and clones varies between engines, so scripts are rarely portable.",
    k: ["Metadata as queryable tables vs command output: tables compose with filters and joins and are easy to automate, but expose internal structure that then becomes an interface to keep stable.", "Maintenance as procedures vs a separate service: procedures are easy to call from any SQL client, but tie operations to a user session and its credentials."],
    p: ["A script uses engine-specific time travel syntax and fails when the engine is changed.", "Operators run an expensive metadata table query on a huge table during peak hours."],
    v: "Run create, insert, alter, merge and a snapshot-selecting query through the engine, then query the files and snapshots metadata tables and confirm each statement left the expected commit and file changes.",
    dep: ["query-engine-connectors", "merge-into-planning", "time-travel-reads", "schema-evolution"]
  },
  "maintenance-scheduler": {
    s: "The service or job runner that decides when each table needs compaction, expiry or cleanup, runs those jobs, and keeps them from colliding with each other and with writers.",
    d: "A scheduler reads health metrics such as small file count, delete file ratio and snapshot age, applies per-table policies, and launches maintenance jobs with a compute budget. It must avoid running two rewrites on the same partitions and should back off when writers are busy. Some deployments run it inside the catalog service; others use external orchestration. Results are commits like any other, so they can conflict with writers. The hard part is deciding the right frequency: too rare and reads degrade, too often and it wastes compute and causes commit conflicts.",
    k: ["Metric-triggered vs fixed schedule: metric triggers spend compute only where needed but require reliable measurements; schedules are simple but waste work on idle tables.", "Catalog-managed vs user-run maintenance: managed service removes toil and is consistent, but users give up control over cost and timing."],
    p: ["A compaction job runs continuously against a hot partition and starves writers through repeated conflicts.", "Maintenance is never scheduled for rarely noticed tables, which slowly become unusable."],
    v: "Let a table accumulate small files, then confirm the scheduler launches a compaction within its policy window, the file count drops, and no concurrent writer fails permanently.",
    dep: ["table-health-metrics", "compaction-planner", "snapshot-expiry", "orphan-file-cleanup"]
  },
  "compaction-planner": {
    s: "Chooses which files to rewrite together, by partition, size and delete count, so that each compaction yields files near the target size without rewriting more than necessary.",
    d: "The planner groups files by partition and by the spec that wrote them, selects those smaller than a threshold or carrying many deletes, and bundles them into jobs of bounded input size. It estimates the benefit against the rewrite cost, and may skip partitions still receiving writes. Output groups are processed independently so partial progress commits. Because a rewrite removes old files and adds new ones, the commit has to confirm the old files are still current. The hard part is picking inputs that do not conflict with active writers.",
    k: ["Rewriting everything vs only worthwhile groups: full rewrites give uniform layout but cost a lot; targeted groups save compute but leave residual fragmentation.", "Commit per group vs one at the end: per-group commits keep progress after failure, but produce many snapshots and more conflict chances."],
    p: ["The planner targets the newest partition under active writes and every attempt aborts on conflict.", "Files from several partition specs are mixed, and the rewrite produces a layout that matches neither."],
    v: "Plan on a table with a known file-size distribution and confirm the chosen groups contain only undersized or delete-heavy files, that each group stays under its byte limit, and that untouched files are unchanged.",
    dep: ["table-health-metrics", "file-size-targets", "partition-spec", "small-file-problem"]
  },
  "bin-packing-rewrite": {
    s: "A rewrite that merges many small files into fewer target-sized files without changing row order or content, which cuts file counts and per-file overhead.",
    d: "The job reads each group of small files, concatenates their rows into new files up to the target size, and commits a replace operation that removes the inputs and adds the outputs. Data content is identical, so readers see the same rows before and after. The commit declares the operation as a rewrite so conflict detection can treat it differently from a data change. Deletes that apply to the inputs are either applied during the rewrite or carried over. The hard part is a concurrent delete that targets a row in an input file: the rewrite must fail or reapply it.",
    k: ["Bin packing vs sorting during rewrite: packing is cheap and keeps order, but does not improve skipping; sorting costs a shuffle yet tightens statistics.", "Applying deletes during rewrite vs carrying them: applying removes read-time cost permanently, but turns a cheap metadata op into more data writes."],
    p: ["A concurrent row delete against an input file is lost when the rewrite commit wins.", "The target size is mismatched to the engine's memory, so rewrite tasks run out of memory on wide tables."],
    v: "Compute a content checksum over all rows before and after the rewrite, and confirm it is identical while the file count has dropped to roughly total bytes divided by the target size.",
    dep: ["compaction-planner", "staged-data-files", "conflict-detection", "delete-file-application"]
  },
  "sort-and-cluster": {
    s: "A rewrite that reorders rows by a sort key or space-filling curve so related values sit in the same files, which tightens statistics and lets queries skip more.",
    d: "The job reads a set of files, repartitions rows by range of the sort columns, sorts within each output file, and commits a replace. With a space-filling curve over several columns, filters on any of them can prune. The order is recorded as a sort order so that later writers and readers know what to expect. Because it shuffles all data it is the most expensive maintenance operation and is typically run on cold partitions. The hard part is skewed key distributions, which create oversized or empty ranges.",
    k: ["Single-column sort vs multi-column curve: sorting serves one dominant filter perfectly, while a curve gives moderate pruning for several at a lower peak.", "Rewrite on ingest vs after the fact: ingest sorting avoids a second pass, but slows writers and makes small batches ineffective."],
    p: ["Heavily skewed key values produce one giant file and many nearly empty ones.", "New writes arrive unsorted and quickly erode the benefit until the next rewrite."],
    v: "Compare bounds of the rewritten files on the sort column: ranges should overlap far less than before, and a selective query should read measurably fewer files with identical results.",
    dep: ["compaction-planner", "sort-order", "space-filling-clustering", "column-bounds"]
  },
  "delete-file-compaction": {
    s: "Folds accumulated delete files into data files by rewriting only the data they touch, so reads no longer pay the cost of merging deletes.",
    d: "The planner finds data files with many associated deletes or delete files covering many data files. The job reads each such data file, applies its deletes, and writes a new file without the removed rows, then commits removal of the old file and the delete files that are no longer needed. Alternatively it only merges small delete files into larger ones. Delete files must remain until no snapshot that needs them is retained. The hard part is equality deletes, which apply to many files by key and can only be dropped when all older data is rewritten.",
    k: ["Rewrite data files vs merge delete files: rewriting removes the read cost entirely, while merging delete files is cheaper but leaves per-read merge work.", "Eager vs threshold-triggered: eager keeps reads fast but rewrites often; thresholds save writes but let read latency creep up."],
    p: ["An equality delete is dropped while older files that it still applies to remain, and deleted rows reappear.", "Delete files stay referenced by an old retained snapshot, so storage does not shrink."],
    v: "Run the same query before and after on a table with heavy deletes: results match, the number of delete files read falls to zero for the rewritten partitions, and latency drops.",
    dep: ["merge-on-read", "position-deletes", "equality-deletes", "compaction-planner", "delete-file-application"]
  },
  "manifest-rewrite": {
    s: "Reorganizes manifest files so each covers a compact, well-clustered set of data files, which keeps planning fast as commits keep adding small manifests.",
    d: "Each commit adds a manifest listing its new files, so tables accumulate many small manifests and metadata reads slow down. A rewrite merges them, ideally grouping entries by partition so a filter can skip whole manifests. It does not touch data files. Manifests carry per-partition summaries, so well-clustered manifests prune effectively and badly mixed ones do not. Some writers merge automatically when manifests exceed a count. The hard part is concurrency: the rewrite creates a new snapshot that must agree with commits made meanwhile.",
    k: ["Merge on every commit vs separate rewrite: inline merging keeps metadata tidy but makes each commit slower; deferred rewrite keeps commits fast but needs a job.", "Cluster by partition vs by commit order: clustering helps pruning, but commit order keeps rewrites incremental."],
    p: ["Manifests mixing many partitions defeat pruning, so every query reads all of them.", "A rewrite races with a commit and must be retried repeatedly on a busy table."],
    v: "Count manifests read for a partition-filtered query before and after the rewrite; after it the count should fall to those covering the partition, with the same result set.",
    dep: ["manifest-file", "partition-summaries", "manifest-pruning", "optimistic-commit"]
  },
  "snapshot-expiry": {
    s: "Removes old snapshots from table metadata and deletes the data and metadata files that only those snapshots referenced, which bounds storage and metadata size.",
    d: "The job picks snapshots older than a retention age (keeping a minimum count and any referenced by branches or tags), removes them in a metadata commit, then computes which files were reachable only from the removed snapshots and deletes them. Expiry is what ends time travel to those points. Readers still using an expired snapshot may fail partway. The hard part is deleting safely: file reachability must be computed against all remaining snapshots, and a concurrent writer might still be about to reference a file.",
    k: ["Aggressive vs generous retention: short retention saves storage and speeds metadata, but shrinks the recovery and audit window and can break long queries.", "Delete files inline vs defer to orphan cleanup: inline reclaims space immediately, but a mistake in reachability deletes live data."],
    p: ["Retention shorter than the longest running query makes that query fail midway.", "Expiring too aggressively removes the only snapshot to roll back to after a bad write."],
    v: "Expire a snapshot older than the retention age, then confirm it can no longer be read, newer snapshots read identically, and every file still referenced by a retained snapshot exists in storage.",
    dep: ["retention-policy", "snapshot-lineage", "branches-and-tags", "orphan-file-cleanup"]
  },
  "orphan-file-cleanup": {
    s: "Finds and deletes files in the table location that no snapshot references, left behind by failed jobs, aborted commits and retried tasks.",
    d: "The job lists the table's storage location, builds the set of every file referenced by any retained metadata, and deletes unreferenced files older than a safety age. The age guard keeps it from deleting files that a running writer has staged but not yet committed. Listing is slow and costly on large tables, so it is run rarely. The hard part is that referenced-set computation must include all branches, metadata files and statistics files, and a table whose location is shared with other data risks deleting what is not its own.",
    k: ["Short vs long safety age: short reclaims space sooner but risks deleting files of slow in-flight writes; long is safe but leaves garbage longer.", "Listing-based discovery vs write-time tracking: listing needs no extra bookkeeping, but is expensive and relies on a clean location; tracking is exact but must be reliable."],
    p: ["A long-running write stages files, takes longer than the safety age, and its files are deleted before commit.", "Two tables sharing a prefix lose files to each other's cleanup."],
    v: "Create a failed write that leaves staged files, run cleanup past the age guard, and confirm exactly those files are removed while a full read of the table returns unchanged results.",
    dep: ["snapshot-expiry", "object-store-api", "list-consistency", "path-layout"]
  },
  "table-health-metrics": {
    s: "Measurements of a table's physical condition, such as file size distribution, delete ratio, manifest count, snapshot count and partition skew, used to trigger maintenance and spot problems.",
    d: "Metrics come from the metadata itself, since manifests list every file with size and counts. Hidden tables expose them per partition. Useful signals include the share of files below target size, deletes per data file, bytes per partition and the age of the oldest snapshot. They can be combined with query-side measurements such as files scanned per query. Because computing them means reading metadata, they are cheap compared with scanning data. The hard part is choosing thresholds that actually predict slow queries.",
    k: ["Metadata-derived vs query-derived metrics: metadata-derived metrics are cheap and always available, while query-derived ones show real pain but need instrumentation.", "Per-partition vs per-table granularity: per-partition metrics find hot spots, but cost more to compute and store."],
    p: ["Only table-level averages are watched, hiding one partition that has millions of tiny files.", "Thresholds are copied from another table with a different write pattern and trigger constant useless rewrites."],
    v: "Write a known number of small files into one partition and confirm the metrics report that partition's small-file count and ratio exactly, and that the alert for it fires.",
    dep: ["manifest-entry", "file-size-targets", "snapshot-lineage"]
  }
});
