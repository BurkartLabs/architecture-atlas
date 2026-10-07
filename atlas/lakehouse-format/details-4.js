// Details for the lakehouse table format plate, part 4: versions and time travel, the metadata tree.
ATLAS.details("lakehouse-format", {
  "snapshot-lineage": {
    s: "The chain of snapshots, each pointing to its parent, that records every committed state of the table and the order in which they were made.",
    d: "Each commit creates a snapshot with an id, a parent id, a timestamp, an operation type and a manifest list. Following parents gives the table's history, and conflict detection, incremental reads and rollback all use it. Snapshots are immutable, and the current one is just a pointer to one of them. Branches create separate lineages sharing a common ancestor. Expiry removes old snapshots from the front of the chain. The hard part is that the chain is a record only as long as it is retained, and timestamps come from writer clocks that can be skewed.",
    k: ["Linear history vs branching lineage: linear is simple to reason about and diff, while branches allow isolated work at the cost of merge logic.", "Writer-supplied vs catalog-supplied timestamps: writer clocks avoid a service call but can go backwards; catalog time is monotonic but needs the catalog."],
    p: ["Clock skew makes snapshot timestamps non-monotonic and a time-based read picks the wrong version.", "Expiry cuts the chain and an incremental consumer can no longer find its starting snapshot."],
    v: "Commit several changes and walk the parent chain from the current snapshot: it must visit every retained snapshot exactly once, in reverse commit order, ending at the oldest retained one.",
    dep: ["snapshot-entry", "table-metadata-file", "metadata-log"]
  },
  "time-travel-reads": {
    s: "Reading the table as of an earlier snapshot id or timestamp, using that snapshot's manifests and the schema it was written with.",
    d: "The reader resolves the requested point to a snapshot, by id directly or by finding the latest snapshot at or before the timestamp, then plans a scan from that snapshot's manifest list. No data is copied; the old files are still on storage. The schema used is the one current at that snapshot, not today's. Time travel supports audits, reproducing a report, comparing before and after, and recovering from mistakes. The hard part is that it works only until expiry or cleanup removes the files, and long-lived access expectations clash with storage cost.",
    k: ["Timestamp lookup vs explicit snapshot id: timestamps are natural for users but ambiguous across clock skew; ids are exact but opaque.", "Read with the old schema vs the current schema: the old schema reproduces what was seen then, while the current one gives continuity but may misinterpret old files."],
    p: ["A report is reproduced by timestamp after expiry and silently resolves to a newer snapshot.", "Time travel to a point before a column rename shows the old name and breaks the query."],
    v: "Record a snapshot id and the row count, change the table repeatedly, then read as of that id: the result must match the recorded count and values exactly, and the read must plan from the older manifests.",
    dep: ["snapshot-lineage", "manifest-list", "schema-evolution", "retention-policy"]
  },
  "branches-and-tags": {
    s: "Named references to snapshots: a tag marks one fixed point, and a branch is a movable line of commits that can diverge from the main history.",
    d: "References are stored in the table metadata as a name, a snapshot id and optional retention settings. Tags pin a snapshot so that expiry will keep it, which is useful for audit points and releases. Branches accept commits independently, so a writer can stage a large change, validate it and then fast-forward the main reference to it. Readers can select a branch by name. The hard part is lifecycle: branches are retained like snapshots, can be forgotten, and divergent branches need an explicit merge or fast-forward rule since data changes cannot be merged automatically.",
    k: ["Branches in table metadata vs separate table copies: branches share files and are cheap, but add reference logic to every engine.", "Fast-forward only vs real merges: fast-forward is simple and safe, while merging diverged data needs conflict rules that are rarely general."],
    p: ["A branch stays open for months and holds old snapshots, blocking expiry and growing storage.", "Main moves on while the branch is being validated, so fast-forward is impossible and the work must be redone."],
    v: "Create a branch, commit to it, and read both branch and main: they must differ. Fast-forward main to the branch and confirm main then reads identically to what was validated.",
    dep: ["snapshot-lineage", "table-metadata-file", "retention-policy"]
  },
  "rollback": {
    s: "Restoring the table's current state to an earlier snapshot by moving the current pointer, without copying or deleting any data.",
    d: "A rollback commits new metadata whose current snapshot id is an earlier snapshot, so subsequent reads see that state. Later snapshots remain in history until they are expired, which means a rollback can itself be undone. Some systems instead create a new snapshot that has the old state's content. It is the fastest recovery from a bad write or a faulty job. The hard part is that rollback affects everyone: downstream tables already fed from the bad state are not rolled back, and files from the undone commits become unreferenced by current state but still referenced by history.",
    k: ["Pointer move to old snapshot vs new snapshot copying old state: moving is instant and exact, while a new snapshot keeps history strictly linear and monotonic.", "Rollback by snapshot id vs by time: ids are precise and auditable, while time is easier in an emergency but risks choosing the wrong point."],
    p: ["The table is rolled back but downstream tables built from the bad data are left inconsistent.", "Rollback target was expired earlier, so no valid snapshot exists to return to."],
    v: "Make a bad write, roll back to the previous snapshot, and confirm reads return the pre-write content exactly, storage was not modified, and the bad snapshot is still listed in history.",
    dep: ["snapshot-lineage", "atomic-swap", "retention-policy"]
  },
  "retention-policy": {
    s: "Rules for how long snapshots, branches and tags are kept, by age and minimum count, which set how far back time travel works and when storage is reclaimed.",
    d: "Defaults apply to the table and can be overridden per branch or tag: keep the latest N snapshots, keep any younger than an age, and keep tagged ones for a named period. Expiry jobs read these rules. Retention must exceed the longest-running query and the incremental consumers' lag, or those fail. It is a trade between recoverability, audit needs and storage cost, and in some cases legal erasure requirements demand shorter retention. The hard part is that the policy is evaluated only when a maintenance job runs, so it is a promise only if maintenance actually runs.",
    k: ["Age-based vs count-based retention: age maps to business needs, while counts guard against a burst of commits wiping out useful history.", "Per-table defaults vs per-reference overrides: overrides let audit tags live long and scratch branches die fast, but multiply settings."],
    p: ["Retention is shorter than a weekly job's runtime and its reads begin to fail intermittently.", "A policy is configured but expiry never runs, so storage grows without bound."],
    v: "Set a short retention, run expiry, and confirm that snapshots beyond it are gone while tagged ones and the minimum count remain, and that storage used drops by the unique files of the removed snapshots.",
    dep: ["snapshot-expiry", "branches-and-tags", "table-properties"]
  },
  "write-audit-publish": {
    s: "A pattern where a change is written to an isolated branch, validated by quality checks, and only then published to the main table in one atomic step.",
    d: "The writer commits to a staging branch, so consumers of the main branch see nothing. Automated checks then run against the branch: row counts, null rates, key uniqueness, referential rules. If they pass, main is fast-forwarded to the branch snapshot in one atomic pointer update, or the branch's files are added to main. If they fail, the branch is dropped. This replaces after-the-fact quarantine tables. The hard part is that main may advance during validation, and checks that are slow hold the branch open and old snapshots with it.",
    k: ["Branch-based staging vs staging tables: branches share storage and publish atomically, but depend on every consumer engine supporting branches.", "Fast-forward publish vs re-apply changes onto main: fast-forward is exact but needs main unchanged; re-applying is flexible but can differ from what was audited."],
    p: ["Validation runs against the branch, but another writer changes main before publish, so the checked state is not what ships.", "Failed branches are never dropped and retain files indefinitely."],
    v: "Write bad data to a branch, run the audit and confirm it fails and main is unchanged; write good data, publish, and confirm consumers see it in a single snapshot transition.",
    dep: ["branches-and-tags", "atomic-swap", "snapshot-creation"]
  },
  "table-clone": {
    s: "Creating a new table that starts from another table's snapshot by referencing the same data files, so it takes seconds and no extra storage until the two diverge.",
    d: "A clone writes new metadata that points to the source's existing manifests and data files, then the clone evolves independently. New data goes to the clone's own location. It supports test environments, experiments and backfills without copying terabytes. Because files are shared, deleting or expiring the source's files can break the clone unless the system tracks references or the clone copies metadata and protects shared files. The hard part is file ownership: cleanup jobs on either table must know that a file is still referenced by the other.",
    k: ["Shared files vs copy: sharing is instant and free, but couples the lifetimes of both tables; copying isolates them at full cost.", "Clone by snapshot vs by branch: snapshot clones are independent tables, while branches share one table's history but not its access scope."],
    p: ["Orphan cleanup on the source removes files only the clone still references.", "The clone's growth is mistaken for a standalone table, and the source's files are never reclaimed."],
    v: "Clone a table, then write to each separately and confirm each sees only its own changes while storage grows only by new files; run cleanup on the source and confirm the clone still reads fully.",
    dep: ["snapshot-lineage", "manifest-list", "orphan-file-cleanup", "table-registration"]
  },
  "snapshot-summary": {
    s: "A map of facts stored with each snapshot, such as the operation, counts of added and removed files and rows, the writer's job id and any checkpoint marker.",
    d: "The writer fills the summary at commit time with the operation type (append, overwrite, delete, replace) and totals. Planners and tools use it to understand a commit without opening manifests: the incremental reader skips rewrite commits by their operation, an audit tool lists who changed what, and streaming writers record checkpoints. Totals are cumulative so that the table size is readable from the current snapshot. The hard part is that it is a free-form map with conventions rather than enforcement, so different engines fill it differently or not at all.",
    k: ["Free-form key-value summary vs typed fields: free-form lets any writer add context without a spec change, but tools can rely only on the keys everyone writes.", "Cumulative vs per-commit totals: cumulative totals answer table-size questions instantly, but drift if any commit fails to update them correctly."],
    p: ["Totals drift because one engine does not maintain them and the table size shown is wrong.", "A tool depends on a custom key that other writers never set."],
    v: "Commit an append, a delete and a rewrite, then read each snapshot's summary: the operation, added and removed counts and cumulative totals must match an independent count from the manifests.",
    dep: ["snapshot-entry", "manifest-entry"]
  },
  "metadata-log": {
    s: "A list inside table metadata of previous metadata file locations and when each became current, which provides a backward trail of table states.",
    d: "Every commit writes a new metadata file that includes the list of earlier ones, up to a configured count. The list lets operators and tools find prior versions even if the catalog only knows the latest, and supports recovering by pointing the catalog at an older metadata file. It is separate from the snapshot list: metadata changes such as schema and property updates produce new metadata files without new snapshots. The hard part is bounding size, since a long log in every metadata file grows it, and old files can be deleted by cleanup so the entries then dangle.",
    k: ["Keep long vs short log: a long log helps recovery and forensics, but grows every metadata file read on every access.", "Delete old metadata files vs keep forever: deleting bounds storage and listing, but removes the ability to recover from catalog loss."],
    p: ["Pointer corruption occurs after the log was trimmed and the right file is already deleted.", "Log entries refer to files cleaned up long ago, so recovery tooling fails."],
    v: "Make several metadata-only changes, then read the log: it must list each prior metadata file with its timestamp, each file must exist, and loading the oldest one must show the schema of that time.",
    dep: ["table-metadata-file", "snapshot-lineage"]
  },
  "table-metadata-file": {
    s: "The root file of a table: it holds the schema, partition specs, sort orders, properties, snapshot list and the id of the current snapshot, and is replaced whole on every change.",
    d: "It is a single JSON document (or equivalent) that is written once and never edited. A reader fetches it from the location given by the catalog, and from it knows everything needed to begin planning. Every commit, whether data or metadata, writes a new one with a version number and links to its predecessor in the log. Because it is read on every query, it must stay small, which means bounding the snapshot and log entries it carries. The hard part is size and rewrite cost on tables with long history, and the requirement that all writers produce it identically.",
    k: ["Single root file vs incremental log: a single file is trivial to read and cache, but rewritten fully on each commit; a log appends but needs checkpoints.", "Embed all snapshots vs reference them: embedding makes the root self-contained, but large histories inflate it."],
    p: ["Thousands of retained snapshots make the root file megabytes and every query slow to open the table.", "Two writers with different serialization produce metadata another engine cannot parse."],
    v: "Load the root file for a table and check that its current snapshot id resolves to a manifest list that exists, its schema ids match the partition spec source ids, and the previous version is in its log.",
    dep: ["snapshot-entry", "partition-spec", "schema-evolution", "format-version"]
  },
  "snapshot-entry": {
    s: "One record in the root file for a snapshot: its id, parent, timestamp, the location of its manifest list, the schema it used and its summary.",
    d: "The entry is small. It names the manifest list, which is where the real content begins, and carries the facts needed to decide whether to open that list at all: the operation, the sequence number and the timestamp. The sequence number orders changes across the table and determines which deletes apply to which data. Readers selecting by id, time or reference scan these entries. The hard part is the sequence number: assigning it must be atomic with the commit, and it determines delete correctness, so a mistake corrupts query results in a subtle way.",
    k: ["Sequence numbers vs timestamps for ordering: sequence numbers are exact and monotonic, but require the commit to assign them correctly; timestamps are easy but skewed.", "Per-snapshot schema id vs table-wide schema: per-snapshot schema enables correct time travel, but adds bookkeeping."],
    p: ["A writer assigns a stale sequence number and a delete fails to apply to data it should remove.", "An entry references a manifest list that cleanup deleted."],
    v: "Read every snapshot entry in a table and confirm sequence numbers strictly increase along the parent chain and each referenced manifest list exists and opens.",
    dep: ["manifest-list", "snapshot-summary"]
  },
  "manifest-list": {
    s: "A file per snapshot listing its manifests, each with partition-level summaries and counts, so planning can skip entire manifests before opening them.",
    d: "The list has one record per manifest: its location, size, the spec id it belongs to, the sequence numbers, counts of added, existing and deleted files and, for each partition field, the lower and upper bound of values in that manifest. A planner evaluates a filter against these summaries and opens only the manifests that can contain matches. Unchanged manifests from the parent are carried over by reference. The hard part is that if a manifest mixes widely different partitions, its summary is useless, which is why manifests should be clustered.",
    k: ["Summaries in the list vs only inside manifests: list-level summaries avoid opening manifests at all, but add per-commit work to compute them.", "One list per snapshot vs shared structure: per-snapshot lists are simple and immutable, but are rewritten in full on each commit."],
    p: ["Summaries missing for a partition field force the planner to open every manifest.", "The list grows with thousands of manifests and itself becomes slow to read."],
    v: "Read a manifest list and verify each manifest's partition bounds contain the actual partition values found inside it, and that its file counts equal its entries' statuses.",
    dep: ["manifest-file", "partition-summaries", "snapshot-entry"]
  },
  "manifest-file": {
    s: "A file listing data or delete files, one entry each, with partition values, sizes and per-column statistics. It is the leaf of the metadata tree and what planning reads most.",
    d: "A manifest holds entries describing files added, existing or deleted by a commit. It is written in a row-oriented or columnar layout and typically covers a few thousand files. Data manifests and delete manifests are kept separate. Entries from many commits live in one manifest after merging, and each carries the sequence number it was added at. Readers fetch only the manifests the list leaves relevant. The hard part is size balance: huge manifests are slow to parse and rewrite, tiny ones multiply requests.",
    k: ["Large vs small manifests: large manifests mean fewer requests and a smaller list, but slower planning for selective queries and costly rewrites.", "Separate data and delete manifests vs combined: separation lets planners read deletes only when needed, but doubles the structure."],
    p: ["A manifest accumulates millions of entries and every planner reads and parses all of it.", "Entries for deleted files are kept for history and quietly bloat manifests."],
    v: "Open a manifest and check each entry: the file exists with the recorded size, the row count matches its footer, and its partition values conform to the spec named in the manifest.",
    dep: ["manifest-entry", "partition-tuples", "column-bounds"]
  },
  "manifest-entry": {
    s: "The record for one file: status, path, format, size, record count, partition values, column statistics, sort order and split offsets.",
    d: "Status says whether the file was added, still present or removed in this manifest, with the snapshot id and sequence number. The rest is what planning needs without opening the file: its partition tuple, lower and upper bound, null and NaN counts per column, byte sizes and the offsets of row groups so scans can split it. For delete files it adds the delete type and the data file it targets. The hard part is that entries duplicate what is in the file footer for speed, so a mismatch between the two corrupts planning silently.",
    k: ["Statistics in the entry vs reading footers: entries make planning a metadata-only operation, but inflate manifests and must be computed and kept accurate at write.", "Truncate long values in bounds vs store exact: truncation bounds entry size but loosens pruning on long strings."],
    p: ["An entry's recorded row count differs from the file, and count queries answered from metadata are wrong.", "Bounds computed in a writer with different string ordering mis-prune files."],
    v: "For a sample of entries compare the recorded size, row count and column bounds to the actual file; any mismatch means the writer's statistics are wrong.",
    dep: ["column-bounds", "value-counts", "partition-tuples", "file-footer"]
  },
  "transaction-log": {
    s: "An alternative metadata design: an ordered series of numbered commit files, each recording the actions that add or remove files, replayed to reconstruct the table state.",
    d: "Each commit is a file named by its version number, written with a put-if-absent so that only one writer can claim a version. A reader replays the actions from the last checkpoint to the latest version to learn the current file set. Actions include adding or removing a data file, changing the schema and setting properties. This design needs no catalog for ordering if storage supports conditional create. The hard part is that replay cost grows with the log, which checkpoints bound, and listing the log directory is needed to find the latest version.",
    k: ["Log of actions vs tree of snapshots: a log makes appends tiny and commit ordering explicit, but replaying and checkpointing add work; a tree makes reads direct, but each commit rewrites more.", "Storage-ordered versions vs catalog pointer: storage ordering removes a service, but requires atomic conditional creation and reliable listing."],
    p: ["Two writers try to create the same version on storage without conditional writes and one commit is lost.", "A long log without checkpoints makes opening the table slow."],
    v: "Run concurrent writers claiming the next version number: each version file must exist exactly once, and replay of the log must yield the same file set as a listing of live files derived from the writers' records.",
    dep: ["conditional-put", "log-checkpoints", "atomic-swap"]
  },
  "log-checkpoints": {
    s: "Periodic files that summarize the full table state at a log version, so readers start replay from the checkpoint rather than from the first commit.",
    d: "Every N commits a writer or a maintenance job writes a checkpoint holding the complete list of live files and settings at that version, often in a columnar layout. A small pointer file records the latest checkpoint. Readers load it and then replay only later commits. Large tables split the checkpoint into parts. It bounds open time, but a checkpoint is a copy of state, so it must be exactly right. The hard part is concurrent checkpointing and cleanup: removing log files before a checkpoint is durable loses history.",
    k: ["Frequent vs infrequent checkpoints: frequent ones make opens fast but cost writes and storage; infrequent ones save work but slow every open.", "Single-file vs multi-part checkpoints: multi-part parallelizes writes and reads for big tables, but needs a manifest of parts."],
    p: ["Old log files are deleted before the checkpoint covering them is complete, and the table cannot be reconstructed.", "A stale checkpoint pointer makes readers replay thousands of commits."],
    v: "Replay the log from version zero and from the latest checkpoint and compare the resulting file sets: they must be identical, and open time from the checkpoint must be bounded by recent commits.",
    dep: ["transaction-log", "manifest-entry", "table-metadata-file"]
  },
  "format-version": {
    s: "A number in the table metadata naming which revision of the specification the table uses, which sets what features it may contain and what clients must support.",
    d: "Each version adds capabilities, such as delete files, row lineage or new types, and may change how existing fields are interpreted. A reader refuses versions newer than it understands. Upgrading a table writes a new metadata file with a higher version, and is normally one-way because old clients cannot read the result. Writers may only use features allowed by the version. The hard part is coordination: the upgrade breaks any client that has not yet been updated, so versions are raised only when all users are ready.",
    k: ["Single version number vs per-feature flags: one number is simple to check, but bundles unrelated features into the same upgrade.", "In-place upgrade vs migrate to a new table: in-place is fast but breaks old readers at once; migrating lets consumers switch gradually."],
    p: ["A table is upgraded and an old engine used for reports can no longer open it.", "A writer produces version-specific structures into a lower-version table and corrupts it for other engines."],
    v: "Open a table with a client that supports only an older version: it must fail with an explicit version error before any data is read, while a current client reads it normally.",
    dep: ["table-metadata-file", "spec-conformance"]
  },
  "metadata-cache": {
    s: "A memory or disk cache of parsed metadata files in engines and catalogs, which is safe because those files are immutable and keyed by their unique location.",
    d: "Because metadata files never change after writing, a cache keyed by path never goes stale: a new commit produces new paths. Engines cache manifests and manifest lists, so repeated queries on a table skip most metadata reads. The only mutable lookup is the current pointer, which must be refreshed from the catalog. Cache size matters for tables with many manifests, and cached parsed forms can be large. The hard part is that deleted files may still be cached, and the pointer refresh interval creates a window in which readers see older but consistent data.",
    k: ["Cache keyed by path vs time-to-live: path keys are always correct for immutable files, while TTL is needed only for the pointer and trades freshness for catalog load.", "Cache parsed vs raw bytes: parsed objects save CPU on every query, but use much more memory."],
    p: ["A long pointer refresh interval makes a dashboard show data minutes old with no signal.", "The cache holds parsed manifests for every table and exhausts the coordinator's memory."],
    v: "Run a repeated query and confirm metadata requests to storage fall to near zero after the first; commit a change and confirm the next query after refresh reads only the new metadata files.",
    dep: ["manifest-file", "current-metadata-pointer", "file-io-abstraction"]
  }
});
