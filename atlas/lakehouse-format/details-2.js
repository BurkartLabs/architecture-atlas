// Details for the lakehouse table format plate, part 2: catalog, commits and concurrency.
ATLAS.details("lakehouse-format", {
  "catalog-interface": {
    s: "The small API every catalog implements: list and create namespaces and tables, load a table's current metadata location, and commit a change by swapping that location.",
    d: "Whatever the backing technology, a catalog answers a few questions: which tables exist, where is the current metadata file for this one, and can this location be replaced by a newer one only if it is still what I last saw. Implementations include a relational database table, a metastore service, a file-system convention and a standard network protocol. The format's client library talks to this interface and does not care which is behind it. The hard part is that the swap must be atomic and linearizable, since it is the only point where concurrent writers are serialized.",
    k: ["Database-backed vs file-convention catalog: a database gives atomic compare-and-swap and rich features, but is a service to run; a file convention needs nothing, but depends on storage-level atomic operations.", "Thin interface vs rich service: a thin interface is easy to implement in any system, while a rich one can enforce policy, but couples engines to it."],
    p: ["A catalog implementation whose swap is not truly atomic lets two writers both succeed and one commit vanish.", "Different engines configured to different catalogs for the same table silently fork its history."],
    v: "Start two writers against one table that both try to swap from the same base location: exactly one must succeed, the other must receive a conflict, and loading the table must show only the winner's changes.",
    dep: ["current-metadata-pointer", "atomic-swap", "namespaces-and-tables"]
  },
  "current-metadata-pointer": {
    s: "The single mutable reference from a table name to the location of its latest metadata file. Moving it is the act of committing.",
    d: "Everything else in a table is immutable: a new commit writes a new metadata file, and only then does the pointer move to it. Readers load the pointer once and read a consistent tree from there, no matter what commits afterwards. The pointer can be a row in a database, an entry in a service, or a small file overwritten by conditional write. The compare-and-swap checks that the current value is the base the writer started from. The hard part is that a failure between writing metadata and swapping the pointer leaves an unreferenced file, which is harmless but must be cleaned up.",
    k: ["Pointer in a service vs pointer in object storage: a service gives reliable compare-and-swap and can add policy, but is another dependency; storage-only is simpler but needs conditional writes.", "Store only the location vs the metadata itself: location-only keeps the catalog small, but readers need one more read."],
    p: ["Updating the pointer without compare-and-swap lets a stale writer overwrite a newer commit.", "Manual edits to the pointer in the catalog database point at a metadata file that is later expired."],
    v: "Commit, then read the pointer: it must name the new metadata file, that file must exist, and a reader that loaded the previous pointer must still read the previous snapshot unchanged.",
    dep: ["atomic-swap", "table-metadata-file", "conditional-put"]
  },
  "namespaces-and-tables": {
    s: "The naming hierarchy the catalog manages: nested namespaces containing tables and views, with properties and rules about renaming and dropping.",
    d: "A table is identified by a namespace path and a name, and the catalog maps that identity to a metadata location. Operations include create, drop, rename and list, and namespaces carry properties such as a default storage location. Dropping can remove only the catalog entry or also purge the data. Renames are catalog-only, since the files do not move. Views and other objects may share the namespace. The hard part is that name-based identity is fragile: a dropped and recreated table with the same name is a different table, but caches and permissions may treat them as one.",
    k: ["Name-based identity vs stable table id: names are what users know, but a stable id lets caches and grants survive rename and detect recreation.", "Drop with purge vs drop pointer only: purging reclaims space, but permanently destroys history that a catalog-only drop would let you recover."],
    p: ["A table is dropped and recreated under the same name, and a cached plan reads files of the old table.", "A purging drop removes data still referenced by a clone or by another table registered at the same path."],
    v: "Create, rename and drop a table, and confirm each change is reflected for a second client's listing, that a renamed table reads identical data, and that a drop without purge leaves files in place.",
    dep: ["catalog-interface", "current-metadata-pointer"]
  },
  "rest-catalog-protocol": {
    s: "A standard HTTP interface for catalogs, so any engine can talk to any catalog service by one protocol instead of embedding a catalog-specific client.",
    d: "The protocol defines endpoints to list, create, load, update and drop namespaces and tables, with JSON bodies and a commit endpoint that carries requirements (assertions about the base state) and updates (changes to apply). The server applies the updates atomically if the requirements still hold. It also lets the server vend credentials, enforce access and evolve behavior without client upgrades, and advertises its capabilities in a configuration call. The hard part is that servers take on commit logic, so a bug there affects all clients, and capability negotiation must cover differing server and client versions.",
    k: ["Server-side commit vs client-side commit: server-side commit centralizes validation and policy, but makes the service a scaling and availability bottleneck.", "Standard protocol vs native client per catalog: a protocol means one client and many servers, but limits features to the common denominator."],
    p: ["A client sends an update the server does not recognize and the server drops it instead of rejecting the request.", "A large commit payload times out at a proxy, leaving the client unsure whether it committed."],
    v: "Point two different engines at one protocol server, create a table from the first and commit from the second, and confirm both see the same snapshot list and that an unsupported request gets an explicit error.",
    dep: ["catalog-interface", "credential-vending", "table-access-control", "atomic-swap"]
  },
  "credential-vending": {
    s: "The catalog hands a client short-lived, scoped storage credentials for one table's location, so engines never hold broad storage access.",
    d: "When a client loads a table, the catalog service checks the caller's permission and returns temporary credentials limited to the table's path and to read or write as allowed. The client uses them to access files directly. This puts access control at the catalog while data movement stays in the engine. Credentials expire, so long jobs must refresh them. The hard part is that anything outside the table path, such as a data file registered from elsewhere, is not covered, and misconfigured scopes either block valid access or grant too much.",
    k: ["Vended scoped credentials vs engine-held storage keys: vending enforces least privilege and central audit, but adds a dependency on the catalog during every job.", "Short vs long credential lifetime: short limits damage from leaks, but forces refresh logic and fails long-running tasks."],
    p: ["Credentials expire mid-job and tasks that were healthy fail on the next file read.", "The scope covers the whole bucket prefix rather than the table, so one table's credentials expose its neighbors."],
    v: "Load a table through the catalog with read-only rights, then attempt a write and a read of a different table's path using the vended credentials: both must be denied by storage.",
    dep: ["rest-catalog-protocol", "table-access-control", "storage-encryption"]
  },
  "table-access-control": {
    s: "Rules for who may read, write, alter or drop each table, column or row set, enforced at the catalog or the engine.",
    d: "Permissions are held as grants on namespaces and tables, and sometimes on columns and row filters. Enforcement is either in the catalog, which refuses to vend metadata or credentials, or in the engine, which trusts the catalog's answer and applies masks and filters. Because files are readable by anyone with storage access, the catalog is only a real boundary if storage access is restricted to it. The hard part is column and row policies: they live outside the files, so every engine must apply them identically or a policy is silently skipped.",
    k: ["Catalog-enforced vs engine-enforced: catalog enforcement protects against any client, but engine enforcement is needed for fine-grained row and column rules.", "Grants on tables vs on tags and classifications: tag-based rules scale to thousands of tables, but depend on consistent labeling."],
    p: ["A client with direct storage keys bypasses all table grants because the data files are plainly readable.", "A row filter is honored by one engine but ignored by a second that reads files directly."],
    v: "Grant a user access to one table, then have them query it, query another table, and attempt direct file access: only the first must succeed, and each denial must be logged with the user and object.",
    dep: ["catalog-interface", "credential-vending", "namespaces-and-tables"]
  },
  "multi-table-transactions": {
    s: "Committing changes to several tables as one atomic unit, which requires the catalog to apply all the pointer updates together or none.",
    d: "Single-table commits are atomic through one pointer swap. Across tables, the catalog must coordinate: it validates every table's requirements and then applies all updates in a single transaction of its own, which is simple when the catalog sits on a transactional database. Without catalog support, there is no atomicity and cross-table consistency is approximate. This is useful for dimensional loads and for publishing related tables together. The hard part is contention: one hot table in the set can abort the whole transaction, and larger sets lengthen the window for conflicts.",
    k: ["Catalog-level transactions vs staged publish by convention: catalog transactions give real atomicity, but need a transactional backend; conventions are portable but leave a window of inconsistency.", "All-or-nothing vs best-effort ordered commits: all-or-nothing is simple to reason about, but fails entirely on one conflict."],
    p: ["Readers see the new fact table and the old dimension table because the commits were separate.", "A batch of many tables retries forever because one busy table keeps conflicting."],
    v: "Commit changes to two tables in one transaction while a reader loads both repeatedly: the reader must never see one table updated and the other not, and an injected conflict on one must leave both unchanged.",
    dep: ["catalog-interface", "atomic-swap", "conflict-detection"]
  },
  "table-registration": {
    s: "Adding an existing table to a catalog by pointing at its metadata file, or importing existing plain data files into a new table without rewriting them.",
    d: "Registration creates a catalog entry whose pointer is an existing metadata location, which is how tables move between catalogs or are shared. Import builds a new table over files that already exist: the tool reads file footers to get statistics, assigns field ids by name, and writes manifests that reference them in place. Neither moves data. After import, the original files must not be altered by the old system. The hard part is that imported files may lack field ids and partition values may need to be reconstructed from paths.",
    k: ["In-place import vs copy: in-place is instant and free, but the table then depends on files another system may still modify; copying isolates it at a high cost.", "Register the same table in two catalogs vs migrate: dual registration is convenient, but two catalogs can then commit divergent histories."],
    p: ["A table registered in two catalogs gets commits from both, and each loses the other's changes.", "Name-based column mapping maps a renamed column to the wrong data in imported files."],
    v: "Import a directory of existing files, compare row counts and a column checksum against the original, then confirm the import created no new data files and old files are referenced by path.",
    dep: ["current-metadata-pointer", "field-id-mapping", "file-footer", "partition-tuples"]
  },
  "catalog-events": {
    s: "Notifications emitted when tables are created, altered or committed, so downstream systems can react, invalidate caches or trigger pipelines without polling.",
    d: "A catalog that mediates all commits can publish an event per change: table, new snapshot id, operation and affected partitions. Consumers include schedulers that run dependent jobs, search indexes, cache invalidators and audit stores. Without a service, consumers poll the metadata location. Events must be ordered per table and must not be lost on catalog failure, which in practice means they are written in the same transaction as the commit. The hard part is delivery: at-least-once delivery means consumers must be idempotent, and ordering across tables is usually unspecified.",
    k: ["Push events vs polling the pointer: events give low latency and fewer reads, but require a delivery system; polling is simple and robust but wasteful.", "Events carry full change detail vs just a reference: detail saves a read, but couples consumers to payload shape."],
    p: ["An event is emitted before the commit becomes visible, and a consumer reads the old snapshot.", "A consumer assumes exactly-once delivery and double-processes a snapshot after a redelivery."],
    v: "Commit to a table and confirm exactly one event arrives per commit with the right snapshot id; kill the consumer mid-way, restart it, and confirm no snapshot is skipped.",
    dep: ["catalog-interface", "snapshot-summary", "snapshot-creation"]
  },
  "staged-data-files": {
    s: "Data files a writer has written to storage but not yet committed. They are invisible to every reader until a commit references them.",
    d: "Tasks write files under unique names in the table's data location and report back their metadata. Because no snapshot lists them, readers never see them, and a failure leaves them as garbage rather than as partial data. The coordinator assembles the report of file path, size, row count, partition values and column statistics into manifest entries. This staging-by-immutability is what makes writes atomic without locks. The hard part is garbage: aborted and retried tasks leave staged files that need later cleanup, and only files the coordinator explicitly adds may be committed.",
    k: ["Write directly to the final location vs a temporary area: direct writes avoid a rename on stores where renaming is a copy, but mix garbage with live files.", "Collect statistics in the writer vs after the fact: writer-side statistics are free as data streams past, but writers must implement them correctly."],
    p: ["A retried task leaves a duplicate staged file that a naive directory-based job then includes in the commit.", "Staged files accumulate after failed jobs and no one cleans them."],
    v: "Write files and stop before commit: readers must return exactly the pre-write rows, and the files must be absent from all manifests. Then commit and confirm the same rows appear at once.",
    dep: ["unique-file-names", "columnar-data-file", "file-io-abstraction"]
  },
  "snapshot-creation": {
    s: "Building the new table state for a commit: a manifest for the added and removed files, a manifest list for the whole snapshot, and a new metadata file that names it.",
    d: "The writer creates a manifest listing the files it added or deleted, reuses unchanged manifests from the parent snapshot by reference, and writes a manifest list that names all manifests with their partition summaries. It then writes a new table metadata file that adds the snapshot, updates the current snapshot id and records a summary. All of these are new immutable files. Reusing parent manifests makes a commit write only a small amount of metadata even for huge tables. The hard part is that if the commit fails, the files written are wasted and must be rebuilt from a new base.",
    k: ["Reuse parent manifests vs rewrite all: reuse makes commits cheap and proportional to the change, but fragments manifests over time.", "Write metadata before vs after the swap: writing before is required for the pointer to name a real file, which leaves orphans on a failed swap."],
    p: ["A writer builds the snapshot from a stale parent and the commit rebases incorrectly.", "A large manifest list is rewritten for every small commit, making metadata I/O dominate latency."],
    v: "Commit a small change to a table with many files and confirm only a few new metadata files were written, while the manifest list of the new snapshot still enumerates every live file.",
    dep: ["manifest-file", "manifest-list", "table-metadata-file", "snapshot-summary"]
  },
  "optimistic-commit": {
    s: "A commit protocol that takes no locks: the writer does its work against a base version, then publishes only if that base is still current, and otherwise detects conflict and retries.",
    d: "Writers read the table's current metadata, produce files, and build a new version expecting the pointer to still name the base. The compare-and-swap succeeds if no one else committed; if someone did, the writer reloads, checks whether its changes still make sense against the new state, and either rebases or fails. This gives high throughput when conflicts are rare and requires no coordination service beyond the atomic pointer. The hard part is that cost of a failed attempt is a whole job's work for large writes, so abort-prone workloads need partitioned or serialized writers.",
    k: ["Optimistic vs pessimistic locking: optimistic is simple and scales for disjoint writes, but wastes work under contention; locks avoid waste but need a lock service and handle crashes poorly.", "Fail on any concurrent commit vs validate and rebase: failing is simplest, while validation lets non-overlapping writers coexist."],
    p: ["Many writers target the same partitions and spend most of their time retrying.", "A long job's base is so old that rebase cost equals rewriting the job."],
    v: "Run two writers on disjoint partitions concurrently and confirm both commit with no data loss; run two on the same rows and confirm one is told of the conflict rather than overwriting the other.",
    dep: ["atomic-swap", "conflict-detection", "snapshot-creation"]
  },
  "atomic-swap": {
    s: "Replacing the pointer to the current metadata with a new value only if it still holds the expected old one. It is the single operation that makes commits atomic and ordered.",
    d: "The swap is a compare-and-swap against the catalog. A database catalog does it in a transaction; a service does it internally; a file-based design does it with a conditional write that fails if the target exists. Everything before the swap is invisible and everything after is complete, so readers never see a half-commit. It also defines the total order of commits on a table. The hard part is stores that cannot do conditional writes: they need an external lock or a catalog, because plain overwrite loses concurrent commits.",
    k: ["Catalog compare-and-swap vs storage conditional write: catalog swap is robust and flexible, while storage-only commit removes a dependency but needs specific storage features.", "External lock around read-modify-write vs true compare-and-swap: locks work on any store, but a stalled holder blocks everyone and expiry can allow a double commit."],
    p: ["A lock-based swap expires during a pause and two writers commit the same version number.", "A network timeout leaves the writer unsure whether its swap applied, and a naive retry applies it twice."],
    v: "Run many concurrent swaps from the same base against the real catalog backend: exactly one must succeed, the table's version count must rise by one, and no committed metadata may be lost.",
    dep: ["current-metadata-pointer", "conditional-put", "catalog-interface"]
  },
  "conflict-detection": {
    s: "On a failed swap, checking whether the concurrent commits touched anything this writer read or changed, which decides whether it can safely rebase.",
    d: "The writer compares its operation to the snapshots committed since its base. An append conflicts with almost nothing. A delete or overwrite conflicts if a concurrent commit added data matching its filter, or removed a file it also changed. Under serializable isolation even reads count: a concurrent append to a range that the writer's decision was based on is a conflict. Validation inspects manifests and statistics of the intervening snapshots. The hard part is precision: validating by whole partition is cheap but over-conservative, and by row is exact but expensive.",
    k: ["Coarse validation by partition vs fine validation by file or expression: coarse is cheap and safe but causes spurious conflicts; fine is precise but reads more metadata.", "Abort on first overlap vs collect all conflicts: abort is fast to fail, but collecting gives actionable errors."],
    p: ["Validation misses a concurrent delete of a file the writer was rewriting, and the rewrite resurrects deleted rows.", "Partition-level validation makes every writer of a daily partition conflict with each other."],
    v: "Run concurrent commits that overlap on a file and commits that do not, and confirm the first set is rejected with a conflict naming the file while the second set all succeed with identical final data.",
    dep: ["snapshot-lineage", "manifest-entry", "isolation-levels", "optimistic-commit"]
  },
  "commit-retry": {
    s: "After a conflict, reloading current metadata, re-applying the writer's changes on top, and trying the swap again, with backoff and a bounded number of attempts.",
    d: "When validation passes, the writer rebuilds its snapshot from the new base. Appends are trivially rebased: add the same manifest to the new manifest list. Rewrites must re-verify that the files they replace are still live. Retries use exponential backoff with jitter to avoid lock-step collisions, and a total timeout. Data files are not rewritten, only metadata, so a retry is cheap. The hard part is that unbounded retries under heavy contention livelock, while too few cause avoidable job failures.",
    k: ["Many retries with backoff vs fail fast: persistence survives bursts of contention but delays failure signals; failing fast pushes the problem to the job scheduler.", "Rebuild from scratch vs incremental rebase: scratch is simple and always correct, while incremental saves metadata writes."],
    p: ["Retries without jitter cause synchronized collisions and the same writers keep losing.", "A retry reuses a manifest whose entries refer to files that a concurrent commit has since removed."],
    v: "Inject a conflicting commit during a writer's attempt and confirm the writer succeeds on retry with its data intact, the retry count is logged, and the final snapshot includes both changes.",
    dep: ["conflict-detection", "snapshot-creation", "optimistic-commit"]
  },
  "isolation-levels": {
    s: "The guarantees readers and writers get against concurrent commits: snapshot isolation for reads, and serializable or weaker validation for writes.",
    d: "Every read sees one snapshot, so readers are isolated from writers without locks. For writers, snapshot isolation allows write skew: two commits that each read overlapping data and write disjoint data both succeed. Serializable mode adds read-set validation to reject those. Many tables default to the weaker level for throughput, with serializable chosen per operation or table. Isolation applies to a single table only, unless the catalog supports multi-table transactions. The hard part is that the right level depends on the application, and few users know which they have.",
    k: ["Snapshot vs serializable writes: snapshot isolation commits more often and costs less validation, but permits write skew; serializable prevents anomalies at the price of conflicts.", "Per-table default vs per-statement setting: per-table is easy to govern, but per-statement lets critical operations be stricter."],
    p: ["Two jobs each check that no row exists before inserting it and both succeed, creating duplicates.", "A team assumes serializable semantics across two tables that only have snapshot isolation per table."],
    v: "Run two transactions with a write-skew pattern under each level: under snapshot isolation both commit, under serializable the second is rejected with a conflict, and the final data differs accordingly.",
    dep: ["conflict-detection", "snapshot-lineage", "multi-table-transactions"]
  },
  "idempotent-commit": {
    s: "Making a repeated commit attempt harmless, by tagging each commit with a unique id or progress marker that the table remembers, so retries and restarts do not apply changes twice.",
    d: "A writer includes an identifier in the snapshot summary, such as a job id and checkpoint number. Before committing, it checks whether a snapshot with that identifier already exists; if so, the earlier attempt succeeded and the retry does nothing. This resolves the ambiguous case where a swap times out and the client does not know whether it applied. Streaming writers use a monotonic checkpoint to skip already published input. The hard part is that identifiers must be unique per logical operation and cannot be reused, and checking requires reading snapshot history that may have been expired.",
    k: ["Identifier in snapshot summary vs external transaction log: in-table identifiers commit atomically with the data, but rely on history staying around long enough.", "Check before commit vs check after failure only: checking first prevents duplicates on every path, but adds a metadata read to every commit."],
    p: ["A job reuses an identifier across runs, and a legitimate new commit is skipped as a duplicate.", "Expiry removes the snapshot that recorded the identifier, and a late retry applies the data again."],
    v: "Force a commit timeout after the swap applied, retry, and confirm the table holds one snapshot for that identifier and the rows appear exactly once.",
    dep: ["snapshot-summary", "optimistic-commit", "snapshot-lineage"]
  }
});
