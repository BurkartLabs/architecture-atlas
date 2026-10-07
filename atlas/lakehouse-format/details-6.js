// Details for the lakehouse table format plate, part 6: layout, object storage interface, cross-cutting concerns.
ATLAS.details("lakehouse-format", {
  "path-layout": {
    s: "Where a table's files live in storage: a base location with separate areas for data and metadata. Correctness never depends on it, since manifests give the paths.",
    d: "A table has a root location with a metadata area for root files, manifest lists and manifests, and a data area for data files. Because manifests hold full paths, files can be anywhere, including different buckets, and the layout is a convention for people and tools. A good layout spreads files across key prefixes to avoid request hot spots on stores that partition by key. Cleanup jobs and access policies commonly rely on the base location. The hard part is that layout conventions leak into permissions and cleanup safety, so files outside the root surprise those tools.",
    k: ["Hashed or random prefixes vs readable partition paths: random prefixes spread load across storage partitions, but make browsing and manual repair harder.", "Everything under one root vs files anywhere: one root simplifies access policy and cleanup, while free placement allows importing and sharing files."],
    p: ["Cleanup assumes all files live under the table root and ignores or deletes registered external files incorrectly.", "Sequential key prefixes concentrate requests and trigger throttling."],
    v: "List the table root and confirm every file referenced by the current snapshot resolves to an existing object, and that the metadata and data areas contain only files the table's own commits created.",
    dep: ["unique-file-names", "table-metadata-file", "object-store-api"]
  },
  "unique-file-names": {
    s: "Every file gets a globally unique name, usually with a random or time-based identifier, so concurrent writers and retries never overwrite each other.",
    d: "Names combine a partition or task identifier with a random component. A retried task writes a new file instead of replacing the old one, and two jobs cannot collide. Because files are immutable and never overwritten, caches keyed by path are always valid and a failed attempt cannot corrupt a visible file. The cost is garbage: attempts leave files that nothing references. Metadata files follow the same rule, with a version counter plus a random suffix. The hard part is deterministic naming schemes that tempt developers: they make overwrites possible and break the immutability assumptions of caches.",
    k: ["Random unique names vs deterministic names: random names make retries and concurrency safe, but orphans cannot be matched to attempts; deterministic names allow idempotent rewrite, but risk overwriting files readers use.", "Name includes partition values vs opaque: readable names help debugging, but add length and imply meaning."],
    p: ["A deterministic file name is overwritten by a retry while a reader has the old version cached.", "Two writers produce the same name from the same task id across runs and overwrite each other."],
    v: "Run the same job twice and confirm every data file name is distinct, that no existing object was overwritten (versions or etags unchanged), and that cache entries by path never held different content.",
    dep: ["immutable-files", "object-store-api", "staged-data-files"]
  },
  "partition-transforms": {
    s: "The functions that derive partition values from a column: identity, year, month, day, hour, bucket by hash and truncate. Each is defined so predicates can be translated.",
    d: "Time transforms map a timestamp to a coarser unit; bucket maps a value to one of N hash buckets, spreading load; truncate cuts a string or number to a width. Each transform defines how a filter on the source becomes a filter on the result, such as a range of timestamps becoming a range of days. The hash function and the time zone rules are fixed by the specification so every engine computes identical values. The hard part is exactness of the translation: ranges that cross a boundary must include both buckets, and bucket counts cannot change without a new spec.",
    k: ["Bucket vs identity on a key: bucketing bounds partition count and spreads skewed keys, but only helps equality filters, not ranges; identity prunes ranges but explodes on high cardinality.", "Fine time unit vs coarse: hour partitions localize reads, but multiply files for low-volume tables."],
    p: ["Engines apply different time zone rules and produce different partition values for the same timestamp.", "A bucket count chosen too small makes huge buckets that cannot be pruned further."],
    v: "Compute transform outputs for a fixed set of boundary values in each engine and compare to the specification's test vectors, including a timestamp at midnight and a negative number for truncation.",
    dep: ["partition-spec", "hidden-partitioning", "spec-conformance"]
  },
  "partition-tuples": {
    s: "The concrete partition values stored with each data file in its manifest entry, one per partition field of the spec the file was written under.",
    d: "When a writer produces a file, it records the partition value for each field: for example the day number and bucket number. The tuple is part of the manifest entry and is also used for grouping files. Planning evaluates filters against tuples, and a file whose rows do not all share the tuple is invalid, since pruning would give wrong answers. For data written without a partition column, the tuple is derived from the rows. The hard part is enforcing that every row in a file maps to that tuple, which depends on writers routing rows correctly.",
    k: ["Tuple stored in metadata vs derived from path: metadata tuples are exact and independent of layout, but increase entry size slightly.", "One tuple per file vs permitting mixed files: strict tuples allow exact pruning, but force writers to split output by partition."],
    p: ["A writer puts rows of two days into one file labeled with one day, and a query for the other day misses them.", "Null partition values are encoded differently across engines."],
    v: "For each file, scan its rows, recompute the transforms and confirm all rows produce exactly the tuple in the manifest entry, including files with null partition source values.",
    dep: ["partition-spec", "partition-transforms", "manifest-entry"]
  },
  "space-filling-clustering": {
    s: "Ordering rows along a curve that interleaves several columns, so that rows close in any of them land in nearby files, which gives useful bounds on multiple filter columns at once.",
    d: "Sorting by one column makes that column's bounds sharp and the others useless. A space-filling curve maps multi-column values to a single sortable key, trading sharpness on each column for moderate pruning on all of them. The rewrite shuffles by curve key ranges and writes files in that order. It works best on a few columns commonly filtered together. Effectiveness is measured by the share of files a typical filter can skip. The hard part is data skew and new writes: ranges unbalanced, and fresh data arriving unclustered until the next rewrite.",
    k: ["Multi-column curve vs single-column sort: a curve serves several filters moderately, while a sort serves one perfectly and others not at all.", "Cluster at write vs maintenance: write-time clustering keeps data tidy continuously, but slows ingestion and works poorly with small batches."],
    p: ["Too many columns are included and pruning on each becomes negligible.", "New data arrives unclustered, so the benefit decays until the next rewrite."],
    v: "Run filters on each curve column before and after clustering and compare files scanned: each should drop substantially, with identical results, and files' bounds on every curve column should be narrower.",
    dep: ["sort-and-cluster", "column-bounds", "sort-order"]
  },
  "write-distribution": {
    s: "How an engine routes rows to writer tasks, such as hashing by partition or ranges by sort key, so each partition's rows are grouped and files come out few and large.",
    d: "Without shuffling, each of many tasks sees rows of all partitions and writes a small file per partition, producing tasks times partitions files. Distributing by partition value or by sort range first sends each partition's rows to few tasks. This costs a shuffle before the write. Modes include none, hash by partition and range by sort order. Engines choose per table setting. The hard part is skew: a hot partition sent to one task makes it slower than all others, so large partitions need splitting.",
    k: ["Shuffle before write vs write directly: a shuffle yields large well-sorted files, but costs time and cluster resources; direct writes are fast but fragment.", "Hash vs range distribution: range supports sort order and clustering, but needs sampling and is sensitive to skew."],
    p: ["A hot partition is sent to a single task which becomes the long pole of the job.", "No distribution is used and a wide job writes a tiny file per partition per task."],
    v: "Write the same input with and without distribution and compare file counts and sizes per partition: distributed output should have far fewer files near target size, with the same rows.",
    dep: ["partition-spec", "sort-order", "file-size-targets"]
  },
  "small-file-problem": {
    s: "Tables fill with many tiny files from frequent commits, wide partitioning and parallel writers. Each file adds request, metadata and planning overhead out of proportion to its data.",
    d: "On object storage every file costs at least a request to open and, usually, another for its footer, plus a manifest entry. Thousands of tiny files make scans dominated by latency, planning slower and metadata larger. Causes are streaming with short intervals, high-cardinality partitioning, and many tasks writing few rows each. Fixes are writer-side batching and distribution and compaction after the fact. The hard part is that it is a steady state to manage, not a one-time fix: the problem returns as long as the write pattern does.",
    k: ["Prevent at write vs fix by compaction: prevention keeps tables healthy but delays data or needs shuffles; compaction is flexible but spends compute repeatedly.", "Coarser partitions vs more compaction: coarser partitions reduce fragmentation by design, but give up pruning."],
    p: ["Compaction is scheduled but cannot keep up with the commit rate and files accumulate.", "Over-partitioning by a high-cardinality column makes small files inevitable."],
    v: "Chart the file size histogram per partition over a week of writes: the share of files under a tenth of target should stay below a set limit, and query planning time should stay flat.",
    dep: ["file-size-targets", "compaction-planner", "stream-writers", "write-distribution"]
  },
  "immutable-files": {
    s: "Once written, a data or metadata file is never changed. All changes are made by writing new files and updating references, which is what makes snapshots, caching and concurrency safe.",
    d: "Immutability is the property everything relies on. Readers holding an old snapshot keep reading valid files while writers add new ones. Caches never need invalidation, and concurrent writers cannot corrupt each other, since they only create new objects. Object stores reinforce it, as objects are whole-write and cannot be edited in place. The price is write amplification for small changes and garbage that needs collecting. The hard part is discipline: any tool that overwrites an existing path, even with identical content, can break caches or readers in flight.",
    k: ["Immutable files vs in-place update: immutability gives safe concurrency and caching, but forces rewrite or delete-file mechanisms for row changes.", "Garbage collection of unreferenced files vs reference counting: collection by reachability is simple and robust, but delays space reclamation."],
    p: ["A repair script overwrites a data file in place and readers with cached footers see misaligned offsets.", "Old files stay forever because nothing deletes them."],
    v: "Record each referenced file's size and checksum at commit, then re-verify after a week of other commits: no referenced file may have changed, and no path may have been written twice.",
    dep: ["unique-file-names", "object-store-api"]
  },
  "file-io-abstraction": {
    s: "A small interface the format's library uses for all storage access: open for reading, create for writing, delete and list, with one implementation per storage system.",
    d: "The library never touches storage directly. It asks for an input file that supports length and ranged reads, an output file that writes once, and basic delete and listing. Implementations map these to object stores, distributed file systems or local disks, and may add retries, credentials and metrics. A narrow interface keeps the format portable and makes testing against fake storage easy. The hard part is that storage semantics differ in ways the interface hides: rename may be a copy, listing may be slow, and conditional writes may be missing.",
    k: ["Narrow interface vs full file-system semantics: narrow works on any object store, but cannot express rename or append that some commit schemes want.", "Library-level retries vs relying on the storage client: library retries add consistent policy, but can double with client retries and amplify load."],
    p: ["Retries at both client and library layers multiply under throttling and make an outage worse.", "An implementation silently emulates rename with copy and delete, breaking atomicity assumptions."],
    v: "Run the library's storage conformance tests against the real backend: write-once, ranged read, delete, list and a failure injection that confirms partial writes never become visible.",
    dep: ["object-store-api", "range-reads", "request-throttling"]
  },
  "object-store-api": {
    s: "The few operations the format actually needs from storage: whole-object put, get and ranged get, delete, list by prefix, and ideally conditional put. Everything else is built from these.",
    d: "Objects are written whole and appear atomically: a reader sees the complete object or none. There is no rename or append, and directories are only key prefixes. Strong read-after-write consistency for new objects is assumed; the format's design avoids listing to find current state for this reason. Costs are per request and per byte transferred, and latency per request is high, so the format batches work into large files and few requests. The hard part is that stores differ in conditional write support, listing consistency and throttling, and portable behavior needs care.",
    k: ["Rely on atomic whole-object writes vs staged rename: atomic put makes commits simple, while rename-based commits are slow and non-atomic on stores that copy.", "Assume strong consistency vs defensive checks: assuming keeps the library simple, but fails on stores with weaker guarantees."],
    p: ["A store with eventual listing causes a cleanup job to miss or mis-see files.", "The code assumes rename is cheap and a commit on an object store copies terabytes."],
    v: "Probe the backend: write an object and immediately read and list it, overwrite it and read from a second client, and attempt a conditional create twice. The results define which commit schemes are safe.",
    dep: ["conditional-put", "list-consistency", "range-reads"]
  },
  "conditional-put": {
    s: "A write that succeeds only if the object does not exist or still has an expected version. It gives storage-level compare-and-swap for committing without a separate service.",
    d: "With create-if-absent, a writer claims the next version file; the second writer of the same name fails. With match-on-version, a writer replaces a pointer object only if it has not changed. Either gives the atomic ordering the format needs at the one point of contention. Without it, a table needs a catalog or an external lock. Support arrived on many stores only recently, and semantics vary around retries and eventual propagation. The hard part is that code written for one store's semantics can lose commits silently on another.",
    k: ["Conditional write vs external lock service: conditional write removes a moving part and its failure modes, but only works on stores that support it.", "Create-if-absent vs match-on-version: create-if-absent fits an append-only log, while match-on-version fits a single mutable pointer."],
    p: ["A store ignores the condition header and both writers believe they succeeded.", "A client retry after timeout is rejected because the first attempt had actually succeeded."],
    v: "Launch many concurrent conditional creates of the same key: exactly one must report success, all others must report failure, and the stored object must be the winner's bytes.",
    dep: ["object-store-api", "file-io-abstraction"]
  },
  "range-reads": {
    s: "Requests for a byte range of an object. They let readers fetch a footer, a column chunk or a page without downloading the whole file.",
    d: "Every selective read of a data file is a handful of range requests: the tail for the footer, then the ranges of needed column chunks. Latency per request is tens of milliseconds, so engines coalesce nearby ranges, read ahead and issue them in parallel. Range reads are what make columnar files on object storage practical; a store without them would force full downloads. The hard part is request economics: too many small ranges are slower and costlier than one larger read that includes some unneeded bytes.",
    k: ["Coalesce nearby ranges vs exact reads: coalescing cuts request count and latency, but transfers some unneeded bytes.", "Parallel prefetch vs sequential: prefetch hides latency, but multiplies concurrent requests and memory."],
    p: ["Thousands of tiny ranges per file make a scan request-bound and trigger throttling.", "Read-ahead fetches whole files for queries that need two columns."],
    v: "Trace requests for a two-column projection on a wide file: the count of ranges and bytes should match the footer, the chunks for those two columns and little else.",
    dep: ["object-store-api", "file-footer"]
  },
  "multipart-upload": {
    s: "A storage feature for writing large objects in independently uploaded parts that become visible only when the upload is completed, giving atomic appearance of big files.",
    d: "A writer starts an upload, sends parts in parallel, and completes it with a list of parts; until completion nothing is visible. If the writer fails, incomplete uploads remain, consuming space but not appearing as objects. Data file writers use it to stream large files without buffering them entirely. It preserves the property that readers never see a partial file. The hard part is cleanup: abandoned incomplete uploads are invisible in listings and are charged for until aborted, so lifecycle rules should remove them.",
    k: ["Streaming multipart upload vs buffer then single put: multipart bounds memory and allows parallel parts, but adds requests and needs abort handling.", "Large vs small part size: large parts mean fewer requests, but increase memory and the cost of retrying a failed part."],
    p: ["Failed writers leave incomplete uploads that quietly accrue storage charges.", "A crash between the last part and completion loses the whole file."],
    v: "Abort a writer mid-upload and confirm no object appears, then list incomplete uploads and confirm your lifecycle rule removes them within its stated period.",
    dep: ["object-store-api", "lifecycle-rules", "staged-data-files"]
  },
  "list-consistency": {
    s: "What listing a prefix guarantees to show: modern stores list all committed objects, but listing is slow, paged and costly, so the format avoids relying on it.",
    d: "Older stores could omit new objects from listings for a time. Even with consistent listings, a directory listing of millions of files takes minutes and many requests. The format therefore finds files only through manifests and uses listing just for maintenance such as orphan cleanup and, in log-based designs, to find the latest version. Designs that scan a listing to find current state pay for it on every read. The hard part is that cleanup built on listings must tolerate objects created while it runs.",
    k: ["Metadata-based discovery vs listing: metadata is fast and consistent regardless of store, but needs commit machinery; listing is simple but slow and weaker.", "Single large listing vs partitioned prefix listing: partitioned listing parallelizes cleanup, but needs a known prefix structure."],
    p: ["A cleanup lists while a commit is in progress and deletes just-written files not yet referenced.", "A log-based reader lists a huge log directory on every query."],
    v: "Write a batch of objects, list the prefix from another client immediately, and confirm every object appears; time a listing of a large prefix to see whether a metadata-driven design would avoid it.",
    dep: ["object-store-api", "path-layout"]
  },
  "request-throttling": {
    s: "Storage limits requests per second per key prefix and returns errors under load. Wide scans and many small files can trigger them, so clients must back off and spread keys.",
    d: "Object stores partition keyspace and cap request rate per partition. Highly parallel scans, bursts of footer reads and heavy cleanups can exceed it, producing slow-down errors. Clients retry with exponential backoff and jitter, and good layouts spread files across many prefixes. Fewer, larger files reduce request counts directly. Throttling often appears first in maintenance jobs that delete or list at scale. The hard part is that retries add load, so an overloaded store gets worse unless the client throttles itself.",
    k: ["Client-side rate limiting vs reacting to errors: proactive limits avoid error storms, but need tuning; reactive backoff needs no configuration, but lets load spike first.", "Spread prefixes vs readable layout: spreading avoids hot partitions, but makes the layout opaque."],
    p: ["A mass delete in cleanup triggers throttling that also slows production queries on the same prefix.", "Retries without jitter synchronize and keep the store overloaded."],
    v: "Run a scan with high parallelism against a small-file table and record throttle errors and retry counts; after compaction the same query should show far fewer requests and no throttling.",
    dep: ["object-store-api", "path-layout", "small-file-problem"]
  },
  "storage-encryption": {
    s: "Protecting data at rest: storage-level encryption by the store, or format-level encryption of files and metadata with keys held outside the storage system.",
    d: "Store-side encryption protects against media theft but not against anyone with storage access. Format-level encryption encrypts each data file and metadata file with its own key, wrapped by a master key from a key service, so reading requires both storage access and key access. Some designs allow column-level keys for fine-grained access. Key references are stored in metadata. Rotating master keys re-wraps file keys without rewriting data. The hard part is that statistics in plaintext metadata can leak information, and all engines must support the same scheme.",
    k: ["Store-side vs format-level encryption: store-side is transparent and cheap, but trusts everyone with storage access; format-level separates data access from keys, but costs CPU and engine support.", "Per-file vs per-column keys: per-column keys allow fine access control, but raise key management and read cost."],
    p: ["Plaintext column bounds in manifests reveal sensitive value ranges of an encrypted column.", "Losing the key service makes the data unrecoverable."],
    v: "Read a table's data files directly from storage without keys and confirm they are unreadable; read through the engine with authorized keys and confirm results match, then rotate the master key and re-read.",
    dep: ["credential-vending", "file-io-abstraction", "manifest-entry"]
  },
  "lifecycle-rules": {
    s: "Storage-side policies that expire objects or move them to cheaper tiers by age or prefix. They are useful for abandoned uploads and logs, but dangerous for live table files.",
    d: "A lifecycle rule applies to objects by prefix and age, independent of what the table references. That is useful to abort incomplete multipart uploads and expire temporary staging areas. It is hazardous for table data: a rule deleting objects older than some days would remove files still referenced by the current snapshot, and moving to a cold tier makes reads slow or fail. Tables should be managed by snapshot expiry, which understands references. The hard part is coordination between the storage team's rules and the table owners' retention.",
    k: ["Table-aware expiry vs storage lifecycle rules: table-aware expiry is safe because it follows references, while storage rules are simple but blind to what is live.", "Tiering cold partitions vs keeping all hot: tiering saves cost, but metadata still lists those files and queries over them become slow."],
    p: ["A blanket age-based expiry rule deletes live data files and corrupts the table.", "Files are moved to an archive tier and queries fail on first read."],
    v: "Review rules against the table prefixes: none may expire objects under data or metadata areas; then confirm incomplete multipart uploads older than the set period are removed.",
    dep: ["multipart-upload", "snapshot-expiry", "path-layout"]
  },
  "consistency-model": {
    s: "What readers and writers can rely on: every read sees one complete snapshot, commits are totally ordered per table, and nothing spans tables unless the catalog says so.",
    d: "All guarantees derive from two facts: files are immutable, and the pointer swap is atomic. Readers get snapshot isolation without locks because they never see partial commits. Writers are serialized by the swap. Beyond one table, nothing is atomic by default, and caches add bounded staleness: a reader may see a snapshot that is a few minutes old. Multi-table atomicity, read-your-writes across clients and serializable semantics are additions that need catalog support or validation. The hard part is communicating exactly which guarantees hold, since users assume database-level behavior.",
    k: ["Per-table guarantees vs global transactions: per-table guarantees scale and need only one atomic pointer, but cross-table invariants must be handled by the application.", "Bounded staleness via cached pointer vs always-fresh: caching reduces catalog load, but readers may miss the latest commit."],
    p: ["Users assume a write is visible to a different engine at once, but its cached pointer is minutes old.", "Cross-table invariants are broken because two tables were committed separately."],
    v: "Commit in one session and read from another with caching on and off, and verify the reader sees either the old or the new snapshot in full, never a mixture, while the pointer refresh interval bounds staleness.",
    dep: ["atomic-swap", "immutable-files", "isolation-levels", "multi-table-transactions"]
  },
  "spec-evolution": {
    s: "The format changes over time through new versions of the specification; compatibility rules decide which old tables and clients keep working and which upgrades are one-way.",
    d: "New features arrive as new format versions or as optional features that old readers can ignore. Changes are classed by compatibility: adding optional fields is backward compatible, changing the meaning of existing fields is not. Tables record their version and required features, and clients check them before acting. The community specification process, conformance tests and long deprecation windows manage change across many engines. The hard part is that engines upgrade at different speeds, so the slowest engine in the ecosystem effectively sets when a feature can safely be used.",
    k: ["Additive evolution vs breaking redesign: additive changes keep every table usable, but accumulate legacy rules; breaking changes simplify, but strand old clients.", "Table-level opt-in upgrade vs automatic: opt-in lets owners wait for their readers, but lengthens the life of old versions."],
    p: ["A table is upgraded to use a feature that one critical reader does not support.", "An optional field is treated as ignorable by a reader but changes the meaning of other data."],
    v: "Open tables written under each supported version with the current library and compare results to the known data; open a newer-version table with an older library and confirm a clear refusal.",
    dep: ["format-version", "feature-compatibility", "spec-conformance"]
  },
  "request-cost-model": {
    s: "Object storage charges and delays per request and per byte, so every design choice is judged in requests: metadata reads, footer fetches, list calls and commit attempts.",
    d: "A query costs the metadata reads to plan, the footer and chunk reads to scan, and the bytes returned. A commit costs several writes and a pointer swap. Tables with millions of tiny files or manifests multiply requests until latency and charges dominate compute. Design responses include large files, manifest summaries, footer caching, range coalescing and partition pruning. Cloud pricing and rate limits differ across stores and change over time. The hard part is that cost is invisible in functional tests: a correct design can still be financially unsound.",
    k: ["Optimize for fewer requests vs fewer bytes: fewer requests help latency-bound small reads, while fewer bytes help bandwidth-bound scans; the balance depends on file size.", "Cache metadata aggressively vs fetch fresh: caching cuts requests sharply, but trades freshness."],
    p: ["A table with millions of small files makes request charges exceed compute costs.", "Frequent commits make metadata writes a significant share of the bill."],
    v: "Meter requests and bytes per query and per commit on a representative table, and set budgets: the count should scale with matched files and manifests, not with total table size.",
    dep: ["request-throttling", "range-reads", "small-file-problem", "metadata-cache"]
  },
  "write-amplification-tradeoff": {
    s: "Immutable files force a choice per workload: rewrite data on write, merge deletes on read, or rewrite later in maintenance. Each moves the cost between writers, readers and background jobs.",
    d: "Copy-on-write pays at write time with extra bytes and read-time simplicity. Merge-on-read pays at read time with delete application, and in maintenance with compaction. File size, sort order and clustering add further trade-offs: sorting costs writes and gains reads. The right balance depends on update rate, read rate and freshness needs, and may differ by partition: hot recent data merge-on-read, cold data compacted. The hard part is that the balance drifts as workloads change, and the metrics that reveal it are spread over writers, readers and jobs.",
    k: ["Pay at write vs pay at read: write-side work gives fast stable reads, but delays ingestion; read-side work gives fast ingestion, but taxes every query.", "Eager vs lazy maintenance: eager keeps performance steady at constant compute cost, while lazy saves compute but allows degradation."],
    p: ["A table tuned for batch loads is switched to streaming upserts without changing its delete mode and reads degrade.", "Maintenance cost grows unnoticed until it exceeds the original write cost."],
    v: "For one workload, measure write latency, bytes written, read latency and maintenance compute under each mode over a week, and pick the mode with the lowest total cost within the freshness requirement.",
    dep: ["copy-on-write", "merge-on-read", "compaction-planner"]
  },
  "governance-and-erasure": {
    s: "Rules about who may see data and when it must disappear: access control, auditing and legal deletion. They conflict with an architecture that keeps old versions and shares plain files.",
    d: "Deleting a row in a table format removes it from the current snapshot only. The old files still hold it until snapshots are expired and files deleted, so erasure requires a delete, expiry and physical cleanup chain with a bounded delay. Copies in clones, branches and caches add paths. Access control must reach the storage layer, since plain files are readable by any holder of credentials. Audit needs push the other way, keeping history. The hard part is proving erasure complete across files, metadata statistics and backups.",
    k: ["Short retention for erasure vs long retention for audit: short retention makes deletion real quickly, but loses history; long retention keeps audit, but delays erasure.", "Catalog-level vs storage-level access control: catalog-level is flexible but bypassable with direct storage access; storage-level is enforced but coarse."],
    p: ["A deleted person's data remains in old snapshots, a clone and a backup long after the legal deadline.", "Column statistics retain bounds that expose a deleted value."],
    v: "Delete a known record, run expiry and cleanup, and then search every data file, manifest bound, clone and cached copy for the value: it must be absent everywhere within the promised time.",
    dep: ["snapshot-expiry", "orphan-file-cleanup", "table-access-control", "storage-encryption"]
  },
  "engine-neutrality": {
    s: "The point of an open table format is that any engine can read and write the same table. That requires precise specification, shared tests and no engine-specific extensions that other engines cannot interpret.",
    d: "Neutrality is maintained by a public specification, shared libraries or reference implementations, cross-engine conformance tests and a catalog protocol that is not tied to one engine. Pressure runs the other way: each engine wants features faster than the standard evolves, and vendor extensions create tables that only one engine handles well. Common-denominator behavior limits what everyone can use. Metadata written by one engine for its own purposes must be preserved by others. The hard part is that neutrality is a property of the ecosystem, not of the code, and erodes through gradual divergence.",
    k: ["Strict standard features vs engine extensions: strict features keep tables portable, but delay useful capabilities; extensions deliver value now, but lock tables to one engine.", "Shared library vs independent implementations: a shared library keeps behavior identical, but concentrates control and release cadence."],
    p: ["An engine writes extension metadata that another engine drops on its next commit.", "A table works in the engine that created it and shows subtle differences in every other."],
    v: "Run the full matrix of writers against readers for the table's real features, and confirm checksums agree for every pair, and that an extension written by one engine survives a commit by another.",
    dep: ["spec-conformance", "feature-compatibility", "rest-catalog-protocol", "spec-evolution"]
  }
});
