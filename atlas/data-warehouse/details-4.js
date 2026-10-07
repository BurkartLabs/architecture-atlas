// Details for the data warehouse plate, part 4: metadata, storage, cross-cutting concerns.
ATLAS.details("data-warehouse", {
  "metadata-store": {
    s: "A transactional, replicated store holding all catalog state: object definitions, table versions, file lists with statistics, grants, sessions and history.",
    d: "A highly available key-value store, replicated across zones, keeps every piece of control state. A table version is a list of file entries, each with its path, size, row count and per-column ranges. Reads are served from memory-heavy caches in the services layer; writes are small transactions. It is tiny compared with the data but sits on every query path, so its latency and availability bound everything. The hard parts are scaling to billions of file entries, keeping read latency low during heavy commits and restoring it consistently after a disaster.",
    k: ["A separate transactional store vs metadata in object storage files: a store gives fast small transactions and cheap listing; it is another system to run and recover.", "One metadata store per region vs per account: shared is efficient; per-account bounds the blast radius and noisy-neighbor effects."],
    p: ["A table with tens of millions of tiny files makes planning slow because the planner must scan its metadata.", "A metadata outage stops all queries even though storage and compute are healthy."],
    v: "Run a query while failing over the metadata store's primary, and confirm it completes or fails cleanly and that planning latency for a table with a million files stays within its target.",
    dep: ["object-store-layer"]
  },
  "catalog-namespaces": {
    s: "The hierarchy of accounts, databases, schemas and objects, with their definitions, owners, comments and dependencies, resolved by name for every statement.",
    d: "Objects live in a three-part namespace, and each has an identity that survives renames and drops, so a recreated table is distinguishable from the old one for history and recovery. The catalog resolves names, tracks dependencies between views and tables, and stores owners and comments. Information-schema views present it through SQL. It is versioned so DDL is transactional and time travel can restore the older definition. The difficulty is dependency handling: dropping or altering an object can break views, shares and policies that reference it.",
    k: ["Stable object identifiers vs name-based references: identifiers survive renames and make recovery exact; they complicate tools that assume names are identity.", "Transactional DDL vs auto-committed DDL: transactional allows safe multi-object changes; it widens lock scope and complicates the catalog."],
    p: ["Replacing a table by dropping and recreating it breaks views that referenced the old object identity.", "Altering a column type in a shared table breaks consumers' views without warning."],
    v: "Rename a table that views depend on, confirm the views still resolve, then drop and recreate it and confirm the views fail with a clear error and that undrop restores the original.",
    dep: ["metadata-store"]
  },
  "partition-metadata": {
    s: "For each micro-partition, the recorded path, row count, size and per-column minimum, maximum, null count and distinct estimate, used for pruning and planning.",
    d: "When a file is written, the writer computes ranges and counts for every column while it has the data and stores them in the metadata, not in a separate scan. The planner reads these entries to prune files and to estimate selectivity without opening any data. Metadata for very large tables can reach many gigabytes, so entries are cached and organized to read only the relevant ones. Some queries, such as counts and min or max, can be answered from the metadata alone. Hard parts are size, staleness after deletes and precision for strings.",
    k: ["Compact fixed statistics per file vs rich indexes: compact is cheap and nearly free to maintain; it prunes less well on high-cardinality columns.", "Truncated string bounds vs full values: truncation keeps metadata small; it makes ranges looser and weakens pruning on long strings."],
    p: ["A table of many small files has more metadata than the planner can process quickly.", "Statistics reflect a file's content before a delete and overestimate rows until a rewrite."],
    v: "Count rows, find the maximum of a numeric column and run both with the profile; confirm no data files were read and the result matches a full scan done with metadata use disabled.",
    dep: ["metadata-store","micro-partitions"]
  },
  "column-statistics": {
    s: "Aggregated per-column facts, such as distinct counts, value ranges, null ratios and clustering depth, that the optimizer and clustering service read to make decisions.",
    d: "Statistics roll up from per-file records into table-level summaries without extra scans. Distinct-value counts use sketches that merge across files. The clustering information measures how many files overlap on a given column's range and how deep the overlap goes. These numbers feed cardinality estimates, join planning, classification and recommendations. Because they come from write-time computation, they track data changes immediately. The limits are accuracy: sketches have error, there are no histograms for some columns, and correlations between columns are invisible.",
    k: ["Write-time sketches vs periodic analyze jobs: write-time stats are always current and free to ask for; they are less detailed than a dedicated sampling pass.", "Single-column statistics vs multi-column: single is cheap and enough for most filters; multi-column captures correlation at a large metadata cost."],
    p: ["Distinct count errors make the optimizer choose the wrong build side for a join.", "Statistics on a heavily skewed column hide that one value covers most rows."],
    v: "Compare the reported distinct count for a column with an exact count and confirm it is within the documented error; check that the clustering depth of a freshly sorted table is near one.",
    dep: ["partition-metadata"]
  },
  "transaction-manager": {
    s: "Provides atomic commits and snapshot isolation by writing new file lists as new table versions, and by detecting conflicting concurrent changes before committing.",
    d: "A transaction reads a snapshot, the table versions current at its start, and writes new files that are invisible until commit. At commit it checks that no other transaction changed the same files or table in a conflicting way, then records the new version atomically in the metadata store. Readers never block writers. Concurrent inserts commit side by side; concurrent updates or deletes touching the same files conflict, and one must retry. The hard parts are write contention on hot tables, long transactions and the cost of rewriting entire files for single-row changes.",
    k: ["Optimistic conflict detection at commit vs locks: optimistic never blocks readers and scales; it wastes work for the loser on contended tables.", "File-level conflict granularity vs row-level: file-level is simple and cheap in metadata; unrelated rows in the same file cause false conflicts."],
    p: ["Many small concurrent updates to one table keep aborting each other and retries pile up.", "A long transaction holds an old snapshot so cleanup cannot remove superseded files."],
    v: "Run two concurrent updates on different rows of the same file, confirm one aborts and the retry succeeds, and run two inserts concurrently and confirm both commit with all rows visible.",
    dep: ["metadata-store","micro-partitions"]
  },
  "services-layer": {
    s: "The always-on coordination tier that handles authentication, parsing, optimization, metadata, security and cluster management, shared by all customers and independent of any compute cluster.",
    d: "A fleet of stateless-ish services in each region owns the control plane: sessions, query compilation, transaction coordination, access checks, cluster lifecycle, background services and billing. They keep hot caches of metadata. Query compilation happens here, so a statement that needs no compute, such as a metadata query or a cached result, never wakes a cluster. It is multi-tenant and must apply tenant limits. The hard parts are noisy neighbors, rolling upgrades without interrupting queries and keeping compile latency low as metadata grows.",
    k: ["Multi-tenant shared services vs per-customer control plane: shared is efficient and gives instant provisioning; it needs rigorous isolation and rate limiting.", "Compile in the services layer vs on the cluster: services-side compile enables caching and metadata-only answers; cluster-side keeps compute self-contained."],
    p: ["One tenant sending thousands of compile-heavy statements slows planning for others without limits.", "A rolling upgrade changes plan behavior and a regression appears only for particular query shapes."],
    v: "Run a metadata-only count and a cached query while all clusters are suspended and confirm they return without starting a cluster, and that compile time for a typical query stays within its target.",
    dep: ["metadata-store","catalog-namespaces"]
  },
  "object-store-layer": {
    s: "The durable, replicated, effectively unlimited storage service that holds all table files, results and staged data, accessed over HTTP with eventual or strong object consistency.",
    d: "Data files, result chunks, internal stages and staged files live as objects in buckets. The service replicates across zones, provides high durability, and charges per byte stored and per request. Access is by key, so there are no in-place updates: an object is written whole and then immutable. Latency per request is tens of milliseconds, with high aggregate throughput when reads are parallel. The warehouse hides these properties with caching, prefetching and large files. Hard parts are request rate limits, cost per request, listing performance and region-specific behavior.",
    k: ["Immutable objects with metadata-managed versions vs update in place: immutability enables caching, snapshots and cheap clones; it makes small changes rewrite whole files.", "One bucket per account vs shared buckets with prefixes: per account gives clear isolation and deletion; shared buckets simplify operations but concentrate risk."],
    p: ["Request throttling on a hot prefix slows a scan that otherwise has plenty of bandwidth.", "Cross-region reads accidentally charged per gigabyte turn a cheap query into an expensive one."],
    v: "Read a one gigabyte file with parallel range requests and confirm throughput of hundreds of megabytes per second, and confirm an overwrite of a key never alters a version a running query has already opened.",
    dep: []
  },
  "micro-partitions": {
    s: "The unit of storage: immutable files of tens of megabytes holding a few hundred thousand rows each in columnar form, created automatically in the order data arrives, with metadata for each.",
    d: "As rows are loaded or written by queries, the engine groups them into files of a target compressed size, typically tens of megabytes, organizes values by column within each file and writes a footer with offsets and statistics. Users never define partitions; the layout follows insertion order or a clustering key. Changes write new files and mark old ones as removed in the next table version. The size is a trade-off: small files give finer pruning, large files give fewer requests and better compression.",
    k: ["Automatic fixed-size files vs user-defined partitions: automatic removes tuning and skew from partition design; it gives users less control over layout except through clustering.", "Smaller files vs larger: smaller prune more finely; larger reduce metadata size, request counts and per-task overhead."],
    p: ["Frequent single-row updates rewrite a whole file each time, producing heavy write amplification.", "Trickle inserts create many tiny files that slow planning and scans until compaction merges them."],
    v: "Load a table of known size, list its partitions and confirm file sizes fall near the target and row counts per file are roughly even; update one row and confirm exactly one file is replaced.",
    dep: ["columnar-format","object-store-layer","partition-metadata"]
  },
  "columnar-format": {
    s: "The file layout that stores each column's values contiguously, with a footer of offsets and statistics, so a query can read only the columns it needs.",
    d: "Within a file, rows are split into row groups, and each column in a group is stored as a chunk with its own encoding and compression. The footer lists the chunk offsets, types and ranges. A scan reads the footer, then fetches only the needed chunks by byte range. Nested data is flattened into repetition and definition levels or the equivalent. Many engines use a proprietary internal format, and interoperate through open formats at the edges. The hard part is evolving the format without rewriting existing data and tuning row group size.",
    k: ["Proprietary internal format vs open standard format: proprietary is tuned to the engine and free to change; open is readable by other engines but constrains evolution.", "Larger vs smaller row groups: larger compress and scan better; smaller allow finer filtering and lower memory on writes."],
    p: ["A schema change that reinterprets stored bytes without a rewrite corrupts reads of older files.", "Very wide tables with thousands of columns make footers large and slow every query's metadata read."],
    v: "Read two columns of a fifty-column file by range request and confirm only those chunks plus the footer are fetched, by comparing the bytes transferred with the file size.",
    dep: ["encoding-compression"]
  },
  "encoding-compression": {
    s: "Per-column encodings, such as dictionaries, run-lengths, deltas and bit-packing, followed by general compression, chosen per chunk based on the data.",
    d: "For each column chunk the writer inspects values and picks an encoding: dictionaries for low-cardinality strings, delta for sorted integers, run-length for repeated values, frame-of-reference for narrow ranges. A general-purpose compressor then reduces the result. Good encodings make data smaller and let scans filter without full decompression. Sorted or clustered data compresses far better. Choices trade CPU for size, and the best one depends on the data, so writers sample. A hard part is high-entropy data such as random identifiers, which barely compresses at all.",
    k: ["Lightweight encodings vs heavy compression: lightweight is fast to decode and allows filtering in the encoded form; heavy squeezes more at greater CPU cost.", "Choosing encodings per chunk vs per column: per chunk adapts to data changes; per column is simpler and gives consistent behavior."],
    p: ["Random identifiers stored as strings dominate storage and compress poorly.", "Switching to heavier compression saves storage but makes scans CPU-bound."],
    v: "Write the same column sorted and unsorted and compare compressed sizes: the sorted version should be markedly smaller; confirm a filter on a dictionary-encoded column runs faster than on its decoded form.",
    dep: ["columnar-format"]
  },
  "clustering-keys": {
    s: "A declared set of columns by which data should be physically ordered, so values close together sit in the same files and range pruning can skip most of them.",
    d: "Without a key, files reflect load order, so a filter on date works if data arrives by date but not for other columns. Declaring a clustering key tells the engine to organize micro-partitions so each covers a narrow, mostly non-overlapping range of the key. A depth metric measures overlap. Good keys are columns frequently used in filters, with enough but not too many distinct values. Multi-column keys put the least selective first. The hard part is choosing: wrong keys cost maintenance without benefit, and very high-cardinality keys are expensive to maintain.",
    k: ["Cluster a table vs rely on natural load order: natural order is free where data arrives sorted by the filter column; clustering helps other access patterns at a maintenance cost.", "Key on raw column vs on an expression: expressions such as truncating a timestamp reduce cardinality and cost; they require queries to filter in matching terms."],
    p: ["Clustering a small table or a rarely filtered column costs compute and storage with no query benefit.", "A key on a high-cardinality column like a user identifier needs constant reorganization."],
    v: "Cluster a large table on its common filter column and compare partitions scanned for a representative query before and after: the share scanned should fall by an order of magnitude and the depth metric approach one.",
    dep: ["micro-partitions","column-statistics"]
  },
  "auto-reclustering": {
    s: "A background service that rewrites files so data stays ordered by the clustering key as new rows arrive, using serverless compute and creating new table versions.",
    d: "As inserts and updates add files that overlap existing ranges, clustering degrades. The service measures clustering depth, picks the worst-overlapping files, sorts and rewrites them into new files with narrower ranges and commits the swap atomically in a transaction. Old files go to retention. It runs incrementally rather than sorting the whole table. Cost scales with the rate of change and the clustering key's spread. The difficulty is write amplification and cost: tables with constant churn can spend more on reclustering than the queries save.",
    k: ["Continuous automatic reclustering vs manual periodic rewrites: automatic keeps queries consistently fast; manual lets teams schedule cost but leaves gaps.", "Partial rewrites of the worst files vs full sort: partial is cheaper per run; full gives the ideal layout but rewrites everything."],
    p: ["Reclustering on a table that is overwritten daily wastes credits redoing work the next load erases.", "Rewritten files stay in retention, so storage cost rises along with compute cost."],
    v: "Load shuffled data into a clustered table, let the service run and confirm the depth metric falls, partitions scanned for a key filter drops, and metering shows the serverless credits it used.",
    dep: ["clustering-keys","serverless-compute","transaction-manager","retention-cleanup"]
  },
  "storage-encryption": {
    s: "Encrypting every file and result with per-file keys, protected by a hierarchy of table, account and root keys, with rotation and optional customer-held root keys.",
    d: "Each file is encrypted with its own data key; data keys are wrapped by table keys, which are wrapped by account keys, which are wrapped by a root key in a hardware-backed key service. Keys rotate on a schedule by re-wrapping, and old data can be rekeyed in the background. Customer-managed keys allow a customer to revoke access by disabling their root key. Because workers need keys to read files, they request them from the key service with short-lived grants. The hard parts are key availability, rekeying costs and what revocation does to running queries.",
    k: ["Hierarchical keys vs one key per account: hierarchy limits blast radius and makes rotation cheap; it adds layers to manage and cache.", "Provider-managed keys vs customer-managed keys: customer-managed gives revocation control; an unavailable key service makes all data unreadable."],
    p: ["A customer disables their key by mistake and every query on the account fails until it is restored.", "Keys cached on workers outlive revocation, so access continues after the customer revoked it."],
    v: "Inspect an object directly in storage and confirm it is unreadable ciphertext, rotate the table key and confirm queries still work, then disable a customer-held key in a test account and confirm queries fail within the documented time.",
    dep: ["object-store-layer"]
  },
  "orphan-cleanup": {
    s: "Finding and deleting files in object storage that no metadata version references, left by failed or aborted writes, so storage cost matches live data.",
    d: "Writers upload files before committing their metadata. If the writer crashes, the query is cancelled or the commit conflicts, those files remain unreferenced. A sweeper lists storage prefixes, compares keys to the set referenced by any live version, clone, stream or share, and deletes unreferenced objects older than a safety age so it never deletes files of in-flight writes. Listing and comparing at petabyte scale is expensive, so it runs incrementally. The hard parts are the safety margin and avoiding deletion of files whose references are still being committed.",
    k: ["Age-based safety margin vs tracking in-flight writes: age is simple but must exceed the longest write; tracking is exact but needs a registry of in-flight work.", "Frequent listing sweeps vs write-ahead intent records: sweeps need no change in the write path; intent records locate orphans directly and avoid scans."],
    p: ["Margin shorter than a long load deletes files that a still-running load is about to commit.", "Orphans from repeatedly failing jobs accumulate for months and nobody notices the storage growth."],
    v: "Abort a large load midway, confirm unreferenced files exist in storage, wait past the safety age and confirm they are removed while all referenced files remain and every table reads correctly.",
    dep: ["object-store-layer","metadata-store"]
  },
  "storage-compute-separation": {
    s: "Keeping all durable data in object storage and all processing in stateless clusters, so each scales, fails and is paid for independently.",
    d: "Compute nodes hold only cache and transient state; the source of truth is object storage plus the metadata store. This lets many clusters read the same data at once, lets compute be suspended entirely, and makes storage cost depend on bytes rather than on provisioned machines. It shapes every layer: caching becomes essential because storage is remote, files must be immutable, metadata must be fast and consistent, and fault recovery is re-reading rather than repair. The cost is network latency and request overhead on every cold read.",
    k: ["Remote shared storage vs local storage in the compute nodes: remote gives elasticity, sharing and cheap recovery; local gives lower latency and simpler cost on steady workloads.", "Cache on compute vs cache in a shared tier: on compute is simple and fast; a shared tier survives cluster restarts and costs an additional hop."],
    p: ["A cold cluster scanning remote data is much slower than a warmed one, and benchmarks run cold mislead.", "Cross-region reads of shared storage are slow and charged for transfer."],
    v: "Start two clusters on the same table at once, confirm both read correct data without copying it, suspend one and confirm storage cost is unchanged and the other is unaffected.",
    dep: ["object-store-layer","node-pool","metadata-store","local-data-cache"]
  },
  "multi-tenant-isolation": {
    s: "How many customers share services and infrastructure while being unable to read or slow each other, through separate keys, namespaces, compute and rate limits.",
    d: "Isolation operates in layers: data separated by per-account encryption keys and storage prefixes, metadata separated by account identifiers on every key, compute isolated by dedicated clusters that are wiped between tenants, and the control plane protected by limits on compile rate and concurrency. Stronger tiers add dedicated services or private network paths. The decision determines cost: more sharing is cheaper, more isolation is safer. The hard parts are noisy neighbors in the shared layers, and bugs where an account identifier is missing from one code path.",
    k: ["Shared multi-tenant services vs dedicated deployments: shared is efficient and gets fixes instantly; dedicated reduces blast radius and meets strict requirements at far higher cost.", "Isolation by logical identifiers vs physical separation: logical is cheap and flexible; physical stops whole classes of bugs but fragments capacity."],
    p: ["A missing account filter in one metadata query exposes another tenant's object names.", "A tenant's expensive compile workload degrades planning latency for everyone in the region."],
    v: "Create two accounts with similarly named objects, attempt cross-account access through every interface and confirm denial, and run a noisy workload in one while the other's query latency stays within its target.",
    dep: ["services-layer","storage-encryption","node-pool"]
  },
  "transaction-isolation": {
    s: "What concurrent readers and writers can observe: snapshot reads that see a consistent version, and conflict rules for concurrent writes, which together define the isolation level offered.",
    d: "Each statement reads a consistent snapshot of table versions as of its start, so long scans are never torn. Writes are serialized per table or file by conflict detection at commit. Typically the system offers read committed or snapshot-like behavior and does not provide full serializability across tables. Multi-statement transactions extend the snapshot across statements. This choice drives how pipelines handle concurrent loads, deletes and merges, and what an incremental job can safely assume. It rarely appears in the interface but dominates correctness.",
    k: ["Statement-level snapshot vs transaction-level snapshot: statement-level is simple and has fewer conflicts; transaction-level gives repeatable reads across statements at the cost of more aborts.", "Weaker isolation with simple conflicts vs serializable: weaker is faster and easier to scale; serializable prevents anomalies such as write skew but needs more checking."],
    p: ["Two pipelines read the same stale snapshot, each decides to insert a missing key and both succeed, creating duplicates.", "An assumption of serializable behavior is carried over from a transactional database and breaks silently."],
    v: "Start a long scan, commit a delete from another session during it and confirm the scan returns the pre-delete snapshot consistently; then repeat in a new statement and confirm it sees the delete.",
    dep: ["transaction-manager","metadata-store"]
  },
  "pricing-and-cost-model": {
    s: "How usage turns into money: compute billed by cluster size and time, storage by bytes, serverless features by consumption, plus transfer, and what that implies for design.",
    d: "Because compute and storage are billed separately and compute is elastic, cost follows behavior: idle clusters, over-sized clusters, unpruned scans and rebuilding large tables all convert directly into spend. Design choices such as clustering, materialized views and incremental builds trade one bill for another. Cost governance features exist because the model makes overspend easy and fast. The model also drives architecture decisions, such as consolidating clusters to share cache, or splitting them to attribute spend. The difficulty is that cost is an emergent result of many small decisions.",
    k: ["Pay per use vs committed capacity: per use matches variable demand; commitments give discounts but penalize unused capacity.", "Few shared clusters vs many dedicated: shared use capacity and caches better; dedicated make cost attribution and isolation exact."],
    p: ["A scheduled full rebuild of a large model runs daily where an incremental one would cost a tenth.", "Teams optimize compute while storage of retained history and clones quietly grows to match it."],
    v: "Take a month of metering data, attribute it to teams and workloads, and confirm that the top five cost drivers are known by name and each has an owner, a budget and a trend.",
    dep: ["usage-metering","resource-monitors","budgets-chargeback"]
  },
  "security-and-trust-model": {
    s: "The boundaries of trust in the system: who can reach it, what is encrypted and with whose keys, how policies are enforced, and what the provider's own staff can see.",
    d: "Layers include network controls, authentication and federation, role-based grants, row and column policies, encryption at every stage and audit logging. The trust model decides which party holds the keys and whether provider operations can read data, and which controls sit in the platform versus in the customer's tooling. Sharing and clones add paths that must preserve policy. The hard part is consistency across all paths: every new feature must go through the same policy checks, or it becomes a bypass.",
    k: ["Platform-enforced policies vs application-enforced: platform enforcement protects every client including ad hoc SQL; application enforcement is flexible but easy to bypass.", "Customer-held keys vs provider-held: customer-held gives revocation power and compliance comfort; provider-held is simpler and more resilient."],
    p: ["A new export or clone path skips masking and exposes raw columns.", "Broad administrator roles used for convenience make an account takeover a total compromise."],
    v: "Attempt to reach a protected column through every path, including views, clones, shares, exports and the profile, as a restricted role, and confirm each returns masked data or an error.",
    dep: ["role-hierarchy","masking-policies","storage-encryption","access-history"]
  },
  "elasticity-vs-predictability": {
    s: "The tension between resources that grow and shrink with demand and the stable latency and cost that users and finance expect.",
    d: "Elastic compute gives fast queries under load and zero cost when idle, but each change has side effects: new clusters have cold caches, suspended ones restart slowly, scale-out raises the bill and queues grow if scaling is conservative. Predictable setups, with fixed clusters and caps, give stable latency and budgets but waste capacity or queue under peaks. Each workload gets its own point on the spectrum: dashboards want stable low latency, batch jobs want cheap and eventually done, ad hoc work wants whatever is available.",
    k: ["Elastic auto-scaling vs fixed capacity: elastic matches demand and saves cost; fixed gives stable latency, warm caches and a predictable bill.", "Isolating workloads on separate clusters vs sharing: isolation makes behavior predictable per workload; sharing raises utilization but couples their performance."],
    p: ["A cluster suspended for savings makes the first dashboard load of every morning unacceptably slow.", "Auto-scaling hides an inefficient query for months until the bill exposes it."],
    v: "Run a morning dashboard burst against warm and cold clusters and compare p95 latency and credits; confirm each workload class has a documented configuration with its measured latency and cost.",
    dep: ["multi-cluster-scaling","auto-suspend-resume","local-data-cache","queueing-limits"]
  },
});
