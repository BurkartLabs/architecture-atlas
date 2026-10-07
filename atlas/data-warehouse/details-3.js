// Details for the data warehouse plate, part 3: caching, semi-structured data, history, sharing, compute.
ATLAS.details("data-warehouse", {
  "result-cache": {
    s: "Stores the final result of a query so an identical later statement returns it immediately without using any compute cluster, as long as the underlying data is unchanged.",
    d: "The services layer fingerprints the normalized statement together with the role context and the table versions it read. If the same fingerprint reappears while the versions and policies are unchanged and the entry is within its retention time, it returns the stored result, typically from the result files already written for delivery. No cluster resumes. Non-deterministic functions and policy changes prevent reuse. The challenge is correctness: reuse must never cross privilege boundaries, and a result must be invalidated the moment any input table changes.",
    k: ["Cache keyed on text and table versions vs on semantic equivalence: text plus versions is exact and cheap; it misses reuse among queries that differ trivially.", "Serving a cached result across roles vs per role: sharing saves compute; it is only safe when every role would see identical data under its policies."],
    p: ["A masking policy change is not reflected because a result computed under the old policy is returned.", "Dashboards that add a timestamp column to every statement defeat the cache entirely."],
    v: "Run a query twice and confirm the second returns in milliseconds with no cluster used and the profile marked as served from cache; insert a row and confirm the third run recomputes and shows the new row.",
    dep: ["result-delivery","metadata-store"]
  },
  "local-data-cache": {
    s: "Keeps recently read column data on each worker's local SSD and memory, so repeat scans avoid slow object storage requests.",
    d: "As the scan operator reads column ranges from object storage, it writes them into a local cache keyed by file and byte range, evicting by recency. Because files are immutable, entries never go stale; a changed table simply references new files. Task placement tries to send the same files to the same workers so the cache is effective. The cache disappears when a cluster suspends. The hard part is the working set: if it exceeds the SSD size, the cache thrashes and each query pays storage latency.",
    k: ["Cache raw file bytes vs decoded columns: raw bytes are simple and share across query types; decoded columns skip repeated decompression but use more space.", "Local SSD cache vs central shared cache: local is fast and scales with workers; shared survives cluster restarts but adds a network hop."],
    p: ["A cluster that suspends every few minutes always starts cold, so the cache never helps.", "One large scan of a cold table evicts the hot data used by interactive dashboards."],
    v: "Scan a table twice on the same cluster and confirm the second profile shows most bytes read from the local cache and an elapsed time much lower; suspend and resume and confirm the cache starts empty.",
    dep: ["local-disk-tier","cache-affinity","scan-operators"]
  },
  "materialized-views": {
    s: "Precomputed and stored results of a query over a base table, which the optimizer can use transparently to answer matching queries faster.",
    d: "A materialized view stores the output of a defined aggregation or filter as its own set of micro-partitions. Queries against the view read the stored result; the optimizer can also rewrite queries on the base table to use it when the view covers them. The service keeps it current in the background as the base table changes, and queries merge unrefreshed changes at read time so results are consistent. Definitions are restricted to what can be maintained incrementally. The cost is storage, background compute and write amplification on base tables.",
    k: ["Automatic rewrite to a view vs explicit references only: rewrite speeds existing queries without edits; it makes plans harder to predict and debug.", "Always-consistent reads vs eventual refresh: consistent reads never show stale data; they cost merge work at query time when the view lags."],
    p: ["A view over a rapidly changing table costs more in maintenance than it ever saves in queries.", "A restricted definition silently stops matching after a column is added, and queries quietly return to the slow path."],
    v: "Create a view aggregating a large table, run an eligible query and confirm the plan reads the view with far fewer bytes; insert rows and confirm the next result includes them.",
    dep: ["mv-maintenance","micro-partitions","cost-based-optimizer"]
  },
  "mv-maintenance": {
    s: "The background service that updates materialized views and similar derived structures incrementally from changes in the base table, using serverless compute.",
    d: "When a base table commits a new version, the maintenance service examines which partitions were added or removed and recomputes only the affected portion of the view's result, writing new partitions and committing a new view version. It runs on serverless compute billed to the account. It batches changes to avoid refreshing on every tiny commit. If the base table is changed by a large rewrite, maintenance may recompute everything. The difficulty is backlog: heavy write rates outpace maintenance, and queries must reconcile the gap.",
    k: ["Incremental maintenance vs full recompute: incremental is cheap for small changes; it constrains the queries a view can contain.", "Maintain immediately vs batch: immediate keeps queries cheap; batching cuts the maintenance bill but increases read-time merging."],
    p: ["Frequent small updates to a base table cause continuous maintenance charges with little benefit.", "A large delete or reclustering of the base table triggers a complete recompute of every dependent view."],
    v: "Update one percent of a base table and confirm maintenance rewrites a proportional number of view partitions, charges a small serverless amount and the view reflects the update within the documented lag.",
    dep: ["serverless-compute","change-tracking","transaction-manager"]
  },
  "search-index": {
    s: "A maintained index structure that makes highly selective equality or substring lookups on large tables fast, where pruning on min and max ranges cannot help.",
    d: "For columns with many distinct values, such as identifiers or log text, range metadata cannot narrow the file list. A background service builds a compact structure, often a probabilistic filter or inverted map, per column or partition, which the planner consults to find the few partitions that may contain a value. It is maintained incrementally and billed for both storage and compute. It pays off for point lookups returning few rows and offers little for scans and aggregations. The trade-off is maintenance cost against selective-query speed.",
    k: ["Probabilistic filters vs exact indexes: filters are small and cheap to maintain; they allow false positives that cause unnecessary file reads.", "Index on all columns vs chosen columns: all is convenient; chosen columns avoid large storage and build bills for columns never searched."],
    p: ["Enabling it on a table that is only scanned adds cost with no query speedup.", "A table with heavy writes keeps the index permanently behind, so lookups fall back to full scans."],
    v: "Look up one identifier in a table of ten billion rows with and without the index and confirm partitions scanned drops from most of the table to a handful, with elapsed time falling from seconds to subsecond.",
    dep: ["partition-metadata","serverless-compute","pruning-planner"]
  },
  "variant-type": {
    s: "A column type that stores nested, schema-flexible documents with typed values, so JSON-like data can be loaded as is and queried with SQL.",
    d: "A variant value holds objects, arrays and scalars in an internal binary form that preserves types such as numbers, strings and booleans. It is stored in the same columnar files as other columns, compressed together. Queries reach into it with path expressions and cast results to SQL types. Loading requires no schema, and new fields appear in data without a migration. The difficulty is that the optimizer sees an opaque value: without extra work, there are no statistics, no pruning and no typed columnar compression for fields inside it.",
    k: ["Store documents flexibly vs model them as columns up front: flexible loads anything and absorbs change; typed columns are faster, smaller and enforce quality.", "One variant column per record vs several: one is simple; several allow separate treatment for hot and cold parts."],
    p: ["The same field arrives as a number in some records and a string in others, and the cast fails on a late row.", "Queries on large documents read the whole value even when one field is needed."],
    v: "Load documents with differing fields, query a path across all rows, and confirm the result types after casting, nulls for missing fields and no load failure from the schema change.",
    dep: ["columnar-format","micro-partitions"]
  },
  "path-extraction": {
    s: "Reading a nested field by path expression at query time and casting it, giving schema-on-read access without declaring a schema in advance.",
    d: "A path such as a.b[0].c is resolved by walking the binary document structure to the field. If the engine has materialized the path into its own column in the file, the read goes straight to that column and skips parsing the rest. Otherwise it parses the value for every row. Casts convert the extracted value into the needed type, with null on mismatch or an error depending on function. It makes exploration quick. The hard part is performance: unmaterialized paths are far slower and cannot prune.",
    k: ["Schema-on-read at query time vs extract at load: query-time keeps raw fidelity and adapts to change; load-time extraction pays once and makes every query faster.", "Error on bad cast vs null on bad cast: error exposes data problems quickly; null keeps queries running but hides them."],
    p: ["A typo in a path returns null for every row instead of an error, and the dashboard shows blanks.", "Repeatedly extracting the same fields from huge documents in every report is slow and expensive."],
    v: "Extract a nested field across a million rows, compare its elapsed time and bytes scanned against a typed column holding the same value, and confirm both return the same results.",
    dep: ["variant-type","subcolumn-stats"]
  },
  "subcolumn-stats": {
    s: "Automatically shredding frequently present fields of semi-structured values into hidden typed columns, with their own encodings and range statistics, so pruning and compression work inside documents.",
    d: "While writing a micro-partition, the engine samples documents, finds paths that appear often with consistent types, and stores them as separate columns beside the remaining document. Each gets its own min, max and null counts in metadata. Queries on those paths read only the hidden column and prune files by range. Paths with inconsistent types or rare appearance stay in the generic form. It is mostly invisible to users, so the difficulty is explaining its behavior: performance varies by how regular the data is.",
    k: ["Automatic shredding vs user-declared columns: automatic needs no effort and adapts; declared columns give predictable performance and typing.", "Shred few frequent paths vs many: few keeps files compact; many speeds more queries but bloats metadata and write time."],
    p: ["A field that is a number in ninety percent of rows and a string in the rest is not shredded, so queries on it are slow.", "A document layout change splits one path across versions, and statistics from old files no longer help."],
    v: "Load regular documents, query a filter on one field and confirm partitions are pruned; load the same data with inconsistent types for that field and confirm pruning disappears.",
    dep: ["variant-type","column-statistics","partition-metadata"]
  },
  "flatten-nested": {
    s: "Expanding arrays and nested objects into rows with a lateral operation, so nested data can be joined, filtered and aggregated like ordinary tables.",
    d: "A flatten table function takes a nested value and emits one row per element or key, with the path and index, which can be joined laterally to the originating row. Recursive options descend into deeper levels. It is how arrays of line items or event properties become relational. It multiplies rows, so a document with a thousand elements yields a thousand rows. The difficulty is volume and ordering: flattening early in a query can inflate intermediate data, and filters on elements should be applied after flatten rather than assumed to prune files.",
    k: ["Flatten at query time vs pre-flatten into child tables: query time keeps one source; child tables make joins and filters cheap and typed but duplicate and need a pipeline.", "Outer flatten that keeps empty arrays vs inner: outer preserves parent rows; inner is smaller but drops records with no elements."],
    p: ["Flattening an array inside a large table produces a row explosion that overwhelms a small cluster.", "An inner flatten drops parents with empty arrays and a count of orders changes unexpectedly."],
    v: "Flatten an array of line items for ten thousand orders, confirm the row count equals the sum of array lengths, and that an outer flatten also returns orders with empty arrays.",
    dep: ["variant-type","path-extraction","vectorized-execution"]
  },
  "time-travel": {
    s: "Querying or restoring a table as it existed at an earlier timestamp or before a statement, by reading an older metadata version that still references retained files.",
    d: "Each commit creates a new table version that lists its files; superseded versions remain readable until retention expires. A query specifying a timestamp or statement identifier resolves the version current at that point and reads those files. Restoring a dropped or damaged table is a metadata operation. It costs storage for the retained files, proportional to the change rate over the retention window, not to the table size. The limits are the retention period and objects whose files have since been removed by cleanup.",
    k: ["Version-based history vs separate backups: versions are instant and near free to keep for short windows; they are not a substitute for backups across failures or long retention.", "Long retention vs short: long gives wider recovery; it keeps every rewritten file and storage grows with churn."],
    p: ["A table rewritten daily with a long retention window carries dozens of full copies in storage.", "Teams discover the retention was lowered only after an error that needs to be undone is outside it."],
    v: "Delete rows from a table, query it as of a timestamp before the delete and confirm the original rows return; restore it and confirm counts match, then check that a timestamp beyond retention is refused.",
    dep: ["transaction-manager","retention-cleanup","metadata-store"]
  },
  "failsafe-window": {
    s: "A final period after time-travel retention expires during which the provider, not the customer, can still recover data for disaster recovery, at storage cost.",
    d: "After retention ends, files are not deleted immediately but held in a non-queryable state for a fixed period such as seven days. Customers cannot access them directly; only the provider can recover them through a support process. It protects against catastrophic operator error and provider-side failures. The files keep consuming storage and appear as a separate line in storage accounting. It is not an operational recovery tool, since recovery is slow and not self-service, and it is often absent on temporary or transient tables.",
    k: ["Provider-held recovery vs customer-controlled: provider-held adds a safety net customers cannot misconfigure; it is slow and not under their control.", "Applying it to all tables vs allowing transient ones without it: skipping it for scratch data saves storage; accidentally using a transient table for important data removes the net."],
    p: ["Teams count it as a backup when recovery requires a support request and may take days.", "Heavily rewritten staging tables carry post-retention recovery storage long after they have any value."],
    v: "Drop a table, let time-travel expire in a test account, and confirm it is not queryable but still appears in the post-retention recovery storage accounting for the documented period.",
    dep: ["retention-cleanup","orphan-cleanup"]
  },
  "zero-copy-clone": {
    s: "Creating a table, schema or database copy instantly by duplicating metadata that points at the same immutable files, so no data is copied and no storage is used until the copy diverges.",
    d: "Cloning copies the table version's file list into a new object. Both objects reference the same micro-partitions. When either is changed, new files are written for that side, and the old files remain shared until all referrers drop them. Clones can be taken at an earlier time using history. They are used for development copies, testing pipelines and branching data. The cost appears gradually as changes accumulate. The difficulty is reference accounting, so cleanup must track every referrer before deleting a file, and understanding which storage is attributable to whom.",
    k: ["Metadata clone vs physical copy: metadata cloning is instant and free until change; it couples the lifecycle of files across objects and complicates storage attribution.", "Cloning with privileges vs without: copying grants keeps behavior identical; omitting them avoids exposing a test copy to production audiences."],
    p: ["A clone of a production database includes sensitive data into a test environment with weaker access.", "Dropping the original does not free storage because a long-lived clone still references the files."],
    v: "Clone a one terabyte table, confirm it completes in seconds with no storage increase, update one percent of the clone and confirm only that fraction of additional storage appears and the original is unchanged.",
    dep: ["transaction-manager","micro-partitions","transaction-manager"]
  },
  "retention-cleanup": {
    s: "The background process that deletes data files and metadata versions that are outside retention and no longer referenced by any table, clone or share.",
    d: "A garbage collector scans metadata for files whose last referencing version has expired past both the time-travel and post-retention recovery windows, checks that no clone, stream or share still points at them, and issues deletes to object storage. It runs continuously at low priority. Retention per object can be set at account, schema or table level. The difficulty is safety: a premature delete is unrecoverable, so references must be exact, and deletes must tolerate in-flight queries that opened an old version moments ago.",
    k: ["Immediate deletion vs deferred with grace period: immediate saves storage; a grace period protects in-flight readers and recoveries.", "Reference counting vs mark and sweep: counting frees quickly but is fragile to bugs; sweep is simpler to verify but runs periodically."],
    p: ["A long-running query holds an old version while cleanup deletes its files, producing a read failure mid-query.", "Misconfigured retention of zero on a critical table removes any chance to undo a mistake."],
    v: "Drop a table with retention set, wait past retention and post-retention recovery, and confirm the object store shows its files removed and the storage accounting returns to its prior level, while a clone's files remain.",
    dep: ["metadata-store","orphan-cleanup"]
  },
  "change-tracking": {
    s: "A record of row-level inserts, updates and deletes between two table versions, exposed as a change stream that pipelines consume incrementally.",
    d: "Because every commit adds and removes whole files, the system can compute changes by comparing two file lists and diffing the rows only in files that differ. A stream object stores an offset, a table version, and returns the rows changed since that offset, labeled with an action and an update flag. Consuming it in a transaction advances the offset. This powers incremental transformation without timestamp columns. It requires retaining history for the span since the last consumption, and an offset that falls outside retention becomes unusable.",
    k: ["Diff of table versions vs write-time change log: diffing needs no extra writes and works on any table; it must read changed files to find the row-level differences.", "Standard stream with updates vs append-only stream: standard handles updates and deletes; append-only is cheaper and sufficient for event tables."],
    p: ["A consumer that stops for longer than retention loses its offset and must rebuild the target.", "A stream read outside a transaction advances without the target write succeeding, silently dropping changes."],
    v: "Insert, update and delete rows, read the stream and confirm each change appears once with its action, then consume it in a transaction and confirm the next read is empty.",
    dep: ["transaction-manager","retention-cleanup","transaction-manager"]
  },
  "secure-shares": {
    s: "Granting another account read-only access to selected tables and views by sharing metadata, so consumers query the provider's live data with their own compute and without copies.",
    d: "A provider creates a share object, adds databases, schemas and secure views, and names consumer accounts. The consumer creates a read-only database from the share. Its queries run on the consumer's clusters, but metadata resolves to the provider's files in object storage, read through delegated access. Changes by the provider appear immediately and transactionally. Revoking the share cuts access at once. The challenges are governance, such as exposing only intended columns and rows, and the fact that providers have limited insight into how consumers use the data.",
    k: ["Sharing live data vs exporting extracts: live is always current and has no copies to track; the provider cannot easily limit usage once access is granted.", "Provider pays for storage, consumer for compute: consumers do not need to copy data; heavy consumers impose no compute cost on providers but providers pay for any retained history."],
    p: ["Sharing a table directly instead of through a secure view exposes columns that were never meant to leave.", "Dropping a shared object breaks every consumer's queries without any warning to them."],
    v: "Create a share of a secure view, mount it in a second account, query it and confirm results match; insert into the provider table and confirm the consumer sees it; revoke and confirm the next query is refused.",
    dep: ["secure-views","catalog-namespaces","object-store-layer"]
  },
  "reader-accounts": {
    s: "Provider-managed accounts for consumers who have no account of their own, so a provider can share data with a customer while paying for that customer's compute.",
    d: "A provider creates a managed consumer account, a separate managed tenant, and shares data into it. The consumer logs in with credentials the provider issues and queries using compute that is billed to the provider. The provider can set resource monitors, create roles and see activity. It is a way to serve customers who do not use the platform. The difficulty is control and cost: the provider is effectively running a tenant, must secure and meter it, and cannot let consumers load their own data into it without extra rules.",
    k: ["Provider-paid managed consumer accounts vs consumers with own accounts: managed consumer accounts remove friction for non-customers; they hand the provider the compute bill and operations burden.", "Strict resource quotas vs open usage: quotas cap the bill; they can degrade the customer's experience."],
    p: ["An uncapped managed consumer account runs expensive queries and the provider receives the invoice.", "Managed consumer accounts accumulate for customers long gone, each with live credentials."],
    v: "Create a managed consumer account, share a view into it, log in as the consumer and confirm queries work, appear in the provider's usage reports under the reader, and stop when its quota is reached.",
    dep: ["secure-shares","resource-monitors","authentication-sso"]
  },
  "listings": {
    s: "A catalog of datasets offered for discovery and access, public or private, with descriptions, sample queries and request or purchase flows backed by secure shares.",
    d: "A listing wraps a share with metadata: title, description, example queries, refresh cadence, terms and pricing. Consumers browse, request or get instant access, and the platform creates the share mount. Providers see consumers and usage. Listings can be available in other regions through automatic replication of the underlying data. It turns sharing into distribution. The difficulty is quality and trust: stale or mislabeled data, unclear licensing, and ensuring consumers cannot pass on the data further than allowed.",
    k: ["Public exchange vs private listings: public maximizes reach and discovery; private controls who sees the dataset and its terms.", "Free and instant vs approval-based access: instant lowers friction; approval allows vetting and agreement before data flows."],
    p: ["A listing's data stops refreshing and consumers keep building on stale tables.", "A listing exposes personal data because the underlying secure view was not reviewed."],
    v: "Publish a private listing, request it from a second account, approve it and confirm the share mounts, the sample query works, and the provider's usage report lists the consumer.",
    dep: ["secure-shares","cross-region-replication"]
  },
  "cross-region-replication": {
    s: "Copying databases and shares to accounts in other regions or clouds, with scheduled refreshes, so data is available locally for disaster recovery, latency and cross-region sharing.",
    d: "A replication group names objects and target accounts. A refresh computes the difference in files since the last sync and copies only changed files across regions, then applies the metadata changes atomically. Secondary copies are read-only until promoted by failover. Schedules set the lag. It also carries users, roles and policies in some configurations. Costs include transfer and double storage. The hard parts are consistency across objects, failover procedures that people have actually rehearsed and conflicts when a secondary is promoted with stale data.",
    k: ["Scheduled replication vs continuous: scheduled is simple and bounds transfer cost; it permits data loss up to the interval on failover.", "Replicating account metadata with data vs data only: including roles and policies makes failover usable; it requires keeping security configuration identical across regions."],
    p: ["Failover works in a drill but the connection strings in applications still point at the old region.", "A refresh that fails silently leaves the secondary days behind without any alert."],
    v: "Replicate a database, change data in the primary, run a refresh and confirm the secondary matches; fail over, confirm writes succeed on the promoted copy and the recovery point is within the schedule interval.",
    dep: ["object-store-layer","metadata-store","transaction-manager"]
  },
  "secure-views": {
    s: "Views whose definition and internals are hidden from consumers and which are optimized in a way that cannot leak filtered data through side channels, used to expose controlled subsets.",
    d: "A secure view restricts visibility of its text and prevents the optimizer from pushing user-supplied predicates or functions below the view's own filter, since that could reveal values the view hides through errors or timing. Combined with row and column policies, it defines exactly what a consumer sees. They are the standard unit of sharing. The cost is performance: disabling certain optimizations may make queries slower than with ordinary views, so providers must test the access path.",
    k: ["Secure view vs ordinary view for sharing: secure prevents information leaks through optimization; it forgoes some pushdown and can be slower.", "View per consumer vs one view with a context function: per-consumer is explicit and auditable; one view with a function is easier to maintain but harder to reason about."],
    p: ["Sharing an ordinary view lets consumers infer hidden rows using functions that error on specific values.", "A secure view becomes slow after a dataset grows because its filter cannot be pushed into the scan."],
    v: "Query a secure view with a predicate that would error on a hidden row; confirm the error never reveals that row, and confirm that the view text is not visible to the consumer.",
    dep: ["row-access-policies","masking-policies","rewrite-rules"]
  },
  "node-pool": {
    s: "A standing reserve of pre-provisioned machines that clusters draw from in seconds, so starting or growing a cluster does not wait for virtual machines to boot.",
    d: "The provider keeps warm nodes of the supported sizes in each region, with the platform software already installed. When a cluster starts or scales out, the services layer allocates nodes from the pool, attaches them to the account's context and starts workers. Released nodes are wiped and returned, so no data persists between tenants. Pool size is a forecast: too small and starts wait or fail in capacity crunches, too large and idle capacity is a cost. The hard parts are demand forecasting, hardware failures and clean wiping.",
    k: ["Warm pool vs boot on demand: warm gives second-scale starts; idle machines cost money even when nobody uses them.", "Reuse nodes across tenants after wiping vs dedicated hardware: reuse is cheaper and fast; dedicated gives stronger isolation for customers who require it."],
    p: ["A regional capacity shortage leaves start requests queued while the pool is exhausted.", "Insufficient wiping of local disk between tenants would leak cached data across customers."],
    v: "Start a cluster from suspended state and confirm workers are ready within seconds, and that a node released from one account and allocated to another has an empty local cache.",
    dep: ["local-disk-tier","services-layer"]
  },
  "task-scheduler": {
    s: "Splits a query plan into parallel tasks, assigns them to workers, tracks their progress and moves intermediate data between stages.",
    d: "The coordinator divides each plan fragment into tasks, one per slice of input files or partitions, and assigns them to workers based on slot availability and cache affinity. Stages run when their inputs are ready, in a pipelined manner where possible. The scheduler monitors task heartbeats, reassigns tasks from slow or failed workers, and splits skewed tasks. It also enforces memory and slot reservations. The hard parts are balancing load when file sizes and complexity vary, and avoiding head-of-line blocking by one huge task.",
    k: ["Static assignment of files to workers vs dynamic work stealing: static is simple and favors cache hits; dynamic balances skew but breaks locality.", "Large tasks vs many small tasks: large reduce overhead; small balance load and limit the cost of retries."],
    p: ["One oversized file becomes a straggler task while the rest of the cluster sits idle.", "The coordinator is a single point per query, so its failure kills a long query at ninety percent."],
    v: "Run a scan over files of very different sizes, confirm the profile shows tasks distributed across all workers and that the slowest worker finishes within a small multiple of the average.",
    dep: ["cache-affinity","exchange"]
  },
  "cache-affinity": {
    s: "Placement of tasks on the workers that already hold the needed files in local cache, using consistent hashing of file names to workers.",
    d: "The scheduler maps each file to a preferred worker using consistent hashing, so repeated queries touching the same files go to the same node and find them cached. When the cluster resizes, consistent hashing moves only a fraction of assignments. If the preferred worker is busy, the scheduler may send the task elsewhere, trading a cache miss for balance. It makes caching effective without a coordination service. The difficulty is skew: popular files concentrate on a few workers and become hot spots.",
    k: ["Strict affinity vs allowing stealing: strict maximizes cache hits; stealing prevents idle workers at the cost of cold reads.", "Consistent hashing vs explicit directory of cached files: hashing needs no state; a directory is more precise but must be kept in sync with evictions."],
    p: ["Resizing a cluster invalidates a share of the cache and the first queries after it are slower.", "A hot table always hashes to the same few workers and they become the bottleneck."],
    v: "Run the same query twice and confirm the profile shows the same workers handled the same files with the cache hit rate near total on the second run; resize and confirm only a fraction of files move.",
    dep: ["local-data-cache","task-scheduler"]
  },
  "node-failure-retry": {
    s: "Detecting that a worker has died or become very slow during a query and re-running just the lost tasks elsewhere, so most queries survive node loss.",
    d: "Workers send heartbeats to the coordinator, and tasks that stop reporting are declared lost. The coordinator re-executes them on another worker, re-reading inputs from object storage, which is durable. Work whose outputs reached downstream consumers may need re-running if those outputs were only in memory; designs that materialize exchange data retry less. Speculative execution starts duplicates of stragglers. The hard parts are deciding when slow means failed, non-deterministic tasks that give different results on retry, and giving up when failures repeat.",
    k: ["Retry lost tasks vs fail the whole query: retrying saves long queries; it complicates the coordinator and needs deterministic or idempotent tasks.", "Speculative duplicate tasks vs waiting: duplicates cut tail latency; they waste capacity and double side effects if not idempotent."],
    p: ["A bad node that is slow rather than dead drags every query without being flagged.", "A retried task writing results to a shared location produces duplicate output when idempotency is missed."],
    v: "Kill one worker during a multi-minute query and confirm the query completes with correct results, the profile shows retried tasks and the elapsed time increases by only the lost work.",
    dep: ["task-scheduler","object-store-layer"]
  },
  "serverless-compute": {
    s: "Compute that the platform allocates and sizes itself for maintenance and background features, billed by usage rather than from a named cluster the customer manages.",
    d: "Features such as automatic reclustering, materialized view maintenance, continuous ingestion, search indexes and some tasks run on a platform-managed pool. The platform picks the size from the work and bills serverless credits at a rate that often includes a multiplier. The customer cannot choose or pause the nodes, but can usually cap spend with budgets. It removes idle cost and sizing decisions. The difficulty is opacity and cost surprise: background work can grow with data change rates without any explicit user action.",
    k: ["Platform-managed sizing vs customer-chosen cluster: managed removes tuning and idle time; it hides cost drivers and can surprise.", "Per-use multiplier pricing vs flat cluster pricing: per-use is efficient for sporadic work; sustained work can cost more than a dedicated cluster."],
    p: ["Enabling reclustering on a table with constant churn produces a steady serverless bill for little benefit.", "Serverless charges are reported in a different view than cluster charges, so total cost is under-counted."],
    v: "Enable a serverless feature on a test table, apply a known change volume and confirm the metering view shows serverless credits attributed to the table and the feature, with no named cluster involved.",
    dep: ["node-pool","usage-metering"]
  },
  "local-disk-tier": {
    s: "Fast local SSDs on each worker used for cache and spill, which survive for the life of the cluster but never hold the only copy of any data.",
    d: "Workers have local NVMe drives sized in proportion to memory. They hold the file cache and spill partitions for large operators. Because they are lost with the node, nothing authoritative is ever stored on them. Capacity is shared between cache and spill, so a heavy spill evicts cache. Encryption at rest with per-node keys protects the data left on them. The challenge is sizing and balance: more memory per node helps joins, while more disk helps repeated scans, and the ratio is fixed by the instance type.",
    k: ["Shared cache and spill area vs separate: shared uses capacity flexibly; separate prevents a spill from evicting the working set.", "Ephemeral local disk vs network-attached volumes: local is faster and cheaper; network volumes survive node loss but add latency and cost."],
    p: ["A spill-heavy query wipes the cache that interactive users relied on.", "Disks that fail silently return corrupt cache entries unless checksums verify every read."],
    v: "Fill the cache with a scan, run a spilling query and confirm both cache hit rate and spill volume are visible in the profile; verify a corrupted cached block is detected and refetched from object storage.",
    dep: ["storage-encryption"]
  },
});
