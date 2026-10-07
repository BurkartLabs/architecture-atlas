// Details for the feature store plate, part 5: offline store, online store and sources.
ATLAS.details("feature-store", {
  "columnar-tables": {
    s: "Feature history stored as column-oriented files organized into tables, one row per entity and timestamp, which is the format training and backfills read.",
    d: "Each view has a table with entity keys, an event timestamp, optionally a creation timestamp and one column per feature. Column orientation lets a query read only the features it needs and compress them well. Tables are append-heavy, written by batch runs and stream sinks. A table format layered on files adds atomic commits, schema tracking and snapshots, which matter because readers and writers work at the same time.",
    k: ["Wide table per view versus narrow rows per feature: wide tables read fast and need schema changes for each new feature, narrow rows add features freely and make joins and pivots costly.", "Own tables versus reusing warehouse tables: reuse avoids copies, but ties feature timestamps and keys to tables designed for other purposes."],
    p: ["Writers produce thousands of tiny files per hour and every training query becomes slow.", "Tables lack a creation timestamp, so corrections overwrite what a model was trained on and cannot be distinguished later."],
    v: "Read a feature column for a thousand entities and confirm only that column's data was scanned in the query profile, and that a concurrent write during the read does not change the result.",
    dep: ["object-storage", "event-time-partitioning", "table-snapshots"]
  },
  "event-time-partitioning": {
    s: "Splits tables by the event date of their rows, so queries on a time range read only the relevant files and old partitions can be rewritten or dropped independently.",
    d: "Partitions follow event time, such as day or hour, and sometimes a hash of the entity key. Time pruning is what makes point-in-time joins and backfills affordable, since each spine row needs data from a bounded span before it. Partition size is a balance: too fine creates many small files and metadata overhead, too coarse forces large reads. Late events land in old partitions, so those must remain writable.",
    k: ["Event-time partitions versus ingestion-time partitions: event time prunes queries by when things happened, ingestion time is stable and appends cheaply and makes time queries scan more.", "Time only versus time plus entity hash: adding the hash balances file sizes and speeds key lookups, and complicates range queries."],
    p: ["Partitions are by ingestion date, so a point-in-time join for last March scans every partition.", "Hourly partitions for a low-volume view create thousands of near-empty files."],
    v: "Run a one-day-range query and confirm from the query plan that only that day's partitions were read; then write a late event into an older date and confirm it appears in that partition.",
    dep: ["columnar-tables", "event-time-and-watermarks"]
  },
  "table-snapshots": {
    s: "Immutable versions of a table identified by commit, which allow reading the table as it was at a past moment and reproducing a dataset exactly.",
    d: "The table format records each commit as a new snapshot listing the files that make up the table. Readers pin a snapshot, so they see a consistent state even while writers continue. Dataset snapshots record which table snapshot they used. Old snapshots hold files that cannot be deleted, so retention policies expire them, which is also the point where reproducibility ends. Snapshots protect against partial writes, since an uncommitted write is not visible.",
    k: ["Keeping many snapshots versus few: many allow exact reproduction and audits, few save storage and make old datasets impossible to rebuild.", "Snapshot per write versus per batch: per write gives fine-grained history and heavy metadata, per batch is lighter and coarse."],
    p: ["Snapshot expiry runs on a schedule that is shorter than the model's retraining cycle, so recipes cannot be replayed.", "Readers hold a snapshot for days, and cleanup is blocked, so storage grows unexpectedly."],
    v: "Record a snapshot identifier, write new data, then query by that identifier and confirm the result equals the earlier query; expire the snapshot and confirm the read fails with a clear error.",
    dep: ["columnar-tables", "object-storage"]
  },
  "compaction": {
    s: "Rewrites many small files into fewer large ones and removes superseded data, keeping scans fast and storage tidy as streaming writes and corrections accumulate.",
    d: "Frequent small commits from streaming sinks and late corrections leave tables fragmented. Compaction jobs merge files within partitions, sort by entity key or time for pruning, apply deletes and drop files no snapshot references. It competes with readers and writers, so it runs on a schedule or by trigger and uses commits that do not conflict with ongoing writes. Compaction is also where physical deletion for privacy requests finally happens.",
    k: ["Frequent small compactions versus rare large ones: frequent keep reads fast and cost continuous compute, rare ones are cheaper and leave periods of slow reads.", "Sorting by entity key versus by time: key sorting speeds lookups and updates, time sorting speeds range scans and as-of joins."],
    p: ["Compaction conflicts with a streaming writer, so commits fail repeatedly and the table is never compacted.", "Compaction removes files that an old snapshot still needs, breaking reproducible datasets."],
    v: "Write ten thousand small files, run compaction and confirm file count drops, query time improves and results are identical before and after.",
    dep: ["columnar-tables", "table-snapshots", "compute-cluster"]
  },
  "offline-query-engine": {
    s: "The distributed SQL or dataframe engine that executes training-set joins, backfills and statistics over the offline tables.",
    d: "It plans and runs the large as-of joins and scans that build datasets. Its optimizer's choices decide cost: broadcasting small tables, shuffling large ones, pruning partitions and pushing filters down. Training joins are unusual workloads, wide, time-conditioned and skewed, since a few entities have far more rows than others. Different engines can read the same tables, which lets feature data be used by analysts, though results from different engines may differ in time zone and null handling.",
    k: ["Using the warehouse engine versus a dedicated cluster engine: the warehouse is managed and already approved, a dedicated engine gives control over join strategy and costs more to run.", "Shared engine for analysts and builds versus separate: sharing is cheap and lets large builds starve interactive work."],
    p: ["Skewed entities cause one task to process most of the join and the job runs for hours.", "The engine silently converts timestamps to local time, shifting rows across partition and point-in-time boundaries."],
    v: "Run a representative dataset build, inspect the plan for partition pruning and join strategy, and confirm the runtime stays within the stated budget when data volume doubles.",
    dep: ["compute-cluster", "columnar-tables", "event-time-partitioning"]
  },
  "schema-evolution": {
    s: "The rules for adding, renaming, retyping and removing columns in feature tables without breaking readers or rewriting history.",
    d: "Features are added often, so tables must accept new columns, with older rows reading as null. Renames and type changes are riskier. Table formats can track columns by identifier, which makes renames safe for readers, while files that identify columns by name need rewrites. The registry's definitions and the physical schema must stay aligned, or training queries fail or return wrong columns. Narrowing a type, from decimal to integer, can lose data.",
    k: ["Additive-only changes versus full evolution: additive-only is safe and accumulates dead columns, full evolution keeps tables clean and risks breaking readers.", "Identifier-based columns versus name-based: identifiers make renames metadata-only, names are simple and need rewrites or aliasing."],
    p: ["A column is dropped and re-added under the same name with different meaning, and old rows are read as the new feature.", "The registry schema updates before the table does, so queries fail until the table catches up."],
    v: "Add a column and confirm old partitions read null and new ones read values; rename it and confirm queries through the registry still work and old snapshots remain readable.",
    dep: ["columnar-tables", "definition-versioning", "metadata-registry"]
  },
  "retention-tiering": {
    s: "Moves old feature history to cheaper storage or deletes it after a set period, balancing the ability to retrain on long history against storage cost and privacy exposure.",
    d: "Most training uses a bounded window, but some needs years. Policies keep recent partitions on fast storage, older ones in cheaper tiers, and drop the oldest. Retention differs per view according to sensitivity and use. Deleting history changes what can be reproduced, so retention must be consistent with snapshot expiry and with model retraining plans. Cheaper tiers have slower access, which affects backfill and join time when old data is needed.",
    k: ["Time-based retention versus value-based retention: time-based is simple and predictable, value-based keeps data that is still read and needs usage tracking.", "Tiering to cold storage versus deleting: cold storage keeps options open and costs, deletion cuts cost and exposure and is irreversible."],
    p: ["Retention is shorter than the longest backfill window, so recomputing a long-window feature is impossible.", "Cold-tier retrieval takes hours, and a training run times out."],
    v: "Check a view's oldest available partition against its stated retention, and confirm data past the limit is absent from the offline store and from storage listing.",
    dep: ["object-storage", "usage-tracking", "deletion-and-retention-requests"]
  },
  "storage-cost-controls": {
    s: "Mechanisms that limit offline storage growth: compression, deduplication, quotas, lifecycle rules and alerts on tables that grow faster than their value.",
    d: "Feature history grows with entities, features and time. Controls include column encodings and compression, dropping unused columns, quotas per project, and reports ranking tables by size and read rate. Wide float vectors and high-cardinality string features dominate cost. Many tables are written but never read, which usage tracking exposes. Controls must avoid breaking reproducibility, so what is removed is chosen deliberately.",
    k: ["Quotas that block writes versus soft limits with alerts: blocking caps cost and can stop production pipelines, alerts keep running and depend on humans responding.", "Aggressive compression versus read speed: stronger compression saves storage, and costs CPU on every scan."],
    p: ["A quota blocks a production write at midnight and the view becomes stale.", "Nobody owns a pile of experimental tables, so they accumulate with no deletion."],
    v: "List tables by size and last read time, and confirm those above the quota trigger the configured alert and appear in the owner's report with the amounts matching actual storage.",
    dep: ["usage-tracking", "cost-attribution", "object-storage"]
  },
  "key-value-store": {
    s: "The low-latency database holding the latest feature row per entity key, optimized for fast single-key and small batch reads at high request rates.",
    d: "Keys combine view and entity, values hold the feature row. The database can be an in-memory store, a distributed wide-column store or a managed key-value service. It must give millisecond reads at the tail, scale to the request rate and survive node loss. It is the most expensive storage in the system per byte, and its availability is the serving system's availability. Features of its consistency model decide whether a just-written value is visible everywhere.",
    k: ["In-memory store versus disk-backed store: memory is fastest and costs the most per entity, disk-backed is cheaper and has higher and less predictable tail latency.", "Managed service versus self-operated: managed reduces work and limits tuning, self-operated allows control at the cost of an on-call burden."],
    p: ["Hot keys concentrate load on one shard and its latency climbs while the cluster looks idle on average.", "Storage cost balloons because every entity ever seen is kept, including inactive ones."],
    v: "Run a read workload at peak rate with a realistic key skew and confirm p99 latency and error rate meet the objective, then fail one node and confirm reads continue.",
    dep: ["feature-row-layout", "sharding-and-replication", "versioned-writes"]
  },
  "feature-row-layout": {
    s: "How features are encoded into stored rows: one record per entity and view, with a schema-aware binary encoding that makes a single read return every feature in the view.",
    d: "Packing all features of a view into one value means one read per view, instead of one per feature. The encoding records feature types, optional presence and a schema version, and is compact because online storage is expensive. Adding a feature changes the layout, so readers must handle rows written under older versions. The tradeoff against per-feature columns is partial updates: streaming features that change at different rates would require rewriting the whole row.",
    k: ["One packed row per view versus one cell per feature: packed rows reduce reads and storage and require read-modify-write for partial updates, per-feature cells update independently and cost more reads.", "Self-describing encoding versus registry-described: self-describing survives schema loss and costs bytes on every row, registry-described is compact and depends on lookup."],
    p: ["The encoding changes with a client upgrade and older readers decode values as garbage.", "Streaming updates to one feature rewrite the entire row at a high rate, saturating write throughput."],
    v: "Write a row under schema version one, add a feature as version two, and confirm both readers decode old rows with the new feature missing and new rows completely.",
    dep: ["feature-definitions", "key-value-store"]
  },
  "versioned-writes": {
    s: "Attaches an ordering stamp to every online write and applies it only if newer than what is stored, so late or replayed writes cannot overwrite fresher values.",
    d: "Online writes arrive from batch syncs and streaming jobs, possibly out of order and repeated. Each carries the event timestamp or a sequence, and the store keeps the highest. Conditional writes need support from the store, or a read before write. Clock choice is critical: using event time orders by when things happened, which is right for features, but equal timestamps need a tiebreaker and clocks across producers must be comparable. Without it, stale data can win silently.",
    k: ["Conditional writes in the store versus read-before-write in the writer: store-side is atomic and requires support, writer-side is portable and racy.", "Event-time ordering versus arrival-order: event time is correct for features and needs a trusted timestamp, arrival order is simple and lets delayed events overwrite."],
    p: ["A batch sync finishing late overwrites newer streaming values with older batch values.", "Producers have skewed clocks, and one with a clock ahead permanently blocks updates from others."],
    v: "Write a value with timestamp 10, then 8, then 12 and confirm the stored value after each step is 10, 10 and 12, and equal-timestamp writes resolve deterministically.",
    dep: ["key-value-store", "event-time-and-watermarks"]
  },
  "ttl-eviction": {
    s: "The online store's mechanism for removing or hiding rows once they are older than their view's time-to-live, so storage stays bounded and expired values are never served.",
    d: "Some stores expire keys natively using a per-row time, others need a background sweeper, or the reader checks the timestamp. Native expiry reclaims space and keeps hot memory for active entities. Eviction is not instantaneous, so reads must still check the row's age. A write refreshes the expiry, so TTL measures time since the last update, not creation. Bulk expiry, when many rows share a deadline, can cause load spikes in the store.",
    k: ["Native expiry versus reader-side checks: native reclaims storage with no reader work, reader checks give exact semantics and keep storage until swept.", "Expiry spread by jitter versus exact deadlines: jitter smooths the load and makes expiry slightly imprecise."],
    p: ["Every row in a view was loaded at once, expires at once and triggers a cleanup storm that raises read latency.", "Refreshing the TTL on every write keeps rows alive for entities whose values stopped changing meaning."],
    v: "Write rows with a one-minute TTL, read them before and after it passes, and confirm the first reads succeed and the later ones return not found, with storage use dropping afterwards.",
    dep: ["key-value-store", "ttl-and-expiry"]
  },
  "sharding-and-replication": {
    s: "Distributes keys across nodes for capacity and copies each shard for availability, determining the store's scale, failure behavior and consistency.",
    d: "Keys are hashed to shards, so entities spread evenly, and each shard has replicas in separate failure domains. Reads can go to replicas to scale, which allows reading slightly stale data. Rebalancing when nodes are added moves data and must not disturb serving. A view's entity may have a very skewed popularity, in which case a hot key overloads its shard however well the data is balanced. Replica count balances durability, cost and read capacity.",
    k: ["Reading from replicas versus only the leader: replica reads scale and may return slightly stale values, leader reads are fresh and cap throughput.", "Hash sharding versus range sharding: hash balances load and cannot scan ranges, range supports scans and suffers from hotspots."],
    p: ["A popular entity's key produces a hot shard that throttles while others are idle.", "Adding nodes triggers rebalancing during peak traffic and tail latency spikes."],
    v: "Add a node during steady traffic and confirm data rebalances with latency within budget; take down a replica and confirm no read errors and no data loss.",
    dep: ["key-value-store"]
  },
  "memory-tier": {
    s: "A fast in-memory layer in front of or inside the online store that holds hot rows, trading memory cost for lower and steadier read latency.",
    d: "Entities follow skewed popularity, so a small fraction receives most requests. A memory tier caches or stores that hot subset, while the long tail lives on cheaper disk-backed storage. Eviction policies decide what stays. Misses fall through to the slower tier, so tail latency is set by the miss path. A memory tier must be sized by working set, which changes with traffic patterns and releases.",
    k: ["Whole dataset in memory versus tiered hot set: whole dataset is predictable and costly, a tiered approach is cheap and its tail is the miss path.", "Write-through versus write-around to memory: write-through keeps hot rows fresh and spends memory on rows that are never read, write-around caches only what is read."],
    p: ["A new model release shifts traffic to rarely seen entities and the hit rate drops sharply.", "The memory tier is lost on restart, and the cold start overloads the lower tier."],
    v: "Measure hit rate and p99 latency across a day of replayed traffic, then restart the tier and confirm the warm-up period stays within the latency budget.",
    dep: ["key-value-store", "sharding-and-replication"]
  },
  "vector-index": {
    s: "An approximate nearest-neighbor index over embedding features, supporting similarity lookups alongside the ordinary key-based reads.",
    d: "Retrieval models need the nearest items to a query vector. The index organizes vectors, with graph or clustering structures, to find neighbors without scanning everything, returning results that are approximate. Updates are harder than for key-value rows, since inserting and deleting vectors changes the structure, so many deployments rebuild indexes periodically. Index and embedding model version must match, and filters on other attributes interact poorly with approximate search.",
    k: ["Approximate search versus exact search: approximate is orders of magnitude faster and can miss true neighbors, exact is complete and costs scans.", "Updating incrementally versus rebuilding: incremental stays fresh and degrades the structure over time, rebuilding keeps quality and delays new items."],
    p: ["The index is rebuilt with a new encoder while queries still use the old one, and results become meaningless.", "Deleted entities remain searchable until the next rebuild, which breaks a deletion request."],
    v: "Query the index with vectors for which the true neighbors are known and confirm recall meets the target at the stated latency; delete an item and confirm it no longer appears.",
    dep: ["embedding-generation", "key-value-store"]
  },
  "snapshot-and-restore": {
    s: "Takes consistent copies of the online store and restores them, so a damaged or empty store can be repopulated quickly without waiting for a full recompute.",
    d: "Online data can be rebuilt from the offline store, but that takes hours for large views. Snapshots taken periodically or continuously let a replacement store start from recent state and catch up through streaming. Restore speed determines recovery time, and snapshots must be tested, because an untested backup is a hope. Consistency across views matters when features from different views must belong to one moment.",
    k: ["Restore from snapshot versus rebuild from the offline store: snapshot restore is fast and requires storing snapshots, rebuilding needs no extra storage and takes longer.", "Per-view snapshots versus whole-store snapshots: per-view is flexible, whole-store is consistent and heavy."],
    p: ["Snapshots are never test-restored, and the first real attempt reveals they are incomplete.", "Restoring brings back deleted entities that had been erased since the snapshot."],
    v: "Restore the latest snapshot into an empty staging store, replay the stream from the snapshot offset and confirm a sample of rows equals the production store, within the recovery time target.",
    dep: ["key-value-store", "object-storage", "offline-to-online-sync"]
  },
  "multi-region-replication": {
    s: "Copies online feature data to several regions, so models serve from nearby data with low latency and survive the loss of a region.",
    d: "Inference runs in several regions, and a cross-region read adds tens to hundreds of milliseconds. Replication ships writes from a primary region, or from each region's own pipelines, to the others, with a lag. Active-active writes need conflict rules, usually latest-timestamp wins, which versioned writes support. Data residency rules can forbid copying certain entities abroad, so replication is selective. Costs include transfer and storage in every region.",
    k: ["Replicate stores versus run pipelines per region: replicating is simple and lags and spends transfer, per-region pipelines are fresher and multiply compute and the risk of divergence.", "Active-passive versus active-active: active-passive is simple to reason about and wastes capacity, active-active uses all regions and needs conflict resolution."],
    p: ["Replication lag grows during an incident and a region serves hours-old values with no alert.", "Data that must stay in one jurisdiction is replicated by a default rule."],
    v: "Write a value in the primary region and measure time until it is readable in each other region; sever the link and confirm reads continue locally and lag alerts fire.",
    dep: ["key-value-store", "versioned-writes", "sensitive-data-tagging", "freshness-monitoring"]
  },
  "batch-sources": {
    s: "Warehouse tables, files and exports that supply bounded data for batch features, read in intervals with a declared timestamp column.",
    d: "A batch source declares its location, schema, timestamp column and the delay between event time and availability. Jobs read partitions by event time. Sources owned by other teams change without notice: columns are renamed, backfilled or reloaded, which alters history the features were computed from. Mutable tables are the worst case, since reading them later gives different data than at the time, making reproduction impossible without snapshots.",
    k: ["Reading source tables directly versus through a published, versioned dataset: direct is quick and brittle, published datasets add a contract and a hand-off step.", "Reading mutable dimension tables at job time versus history tables: job-time reads are simple and rewrite history, history tables are correct for as-of joins and rarely exist."],
    p: ["An upstream team reloads a table and every downstream feature silently changes for past dates.", "A declared timestamp column holds ingestion time instead of event time, and point-in-time joins leak."],
    v: "Read the same source interval on two days and compare; for immutable sources they must be identical, and for mutable ones the difference must be reported as a known risk.",
    dep: ["source-contracts", "event-time-and-watermarks", "object-storage"]
  },
  "event-streams": {
    s: "Ordered logs of events, such as clicks and transactions, read continuously by streaming features and often also landed to storage for batch use.",
    d: "Events are partitioned by key, retained for a limited time, and consumed by offset. The stream gives low-latency data and a replay buffer for recovery. Producers vary in delay and ordering, and schemas change. A landing job writes events to tables so batch and backfills can use the same data as streaming does, which is how both paths see the same inputs. Retention shorter than the longest recovery or backfill need makes replay impossible.",
    k: ["Streaming from the raw log versus from a cleaned topic: raw is fast and exposes consumers to bad records, cleaned topics are safer and add a stage and latency.", "Short retention with landing to tables versus long retention in the broker: short is cheap and relies on the landing job, long is simple replay and costly."],
    p: ["Consumers fall behind longer than the retention and permanently lose events.", "Two producers use different units for the same field in one topic."],
    v: "Produce a known number of events and confirm the streaming path and the landed table both contain exactly that count, and replay from an earlier offset reproduces identical feature values.",
    dep: ["stream-broker", "source-contracts", "event-time-and-watermarks"]
  },
  "change-feeds": {
    s: "Streams of inserts, updates and deletes from operational databases, used to keep features about current state, such as an account's balance, up to date.",
    d: "A change feed reads the database's log and publishes each row change with before and after images and a commit time. Features about entity state, rather than events, depend on it. It carries deletes, which matter for privacy and for keeping features accurate. Initial load of the existing data requires a consistent snapshot followed by the feed, without gaps or duplicates. Schema changes on the source propagate to consumers.",
    k: ["Change feed versus periodic table snapshots: feeds are fresh and complete and need log access, snapshots are simple and miss intermediate states.", "Interpreting changes as events versus as state: events preserve history for as-of features, state tracking is compact and loses what was true earlier."],
    p: ["The initial snapshot and the feed overlap incorrectly, so some changes are lost or applied twice.", "Deletes are ignored, and removed accounts keep their features."],
    v: "Update, then delete a row in the source database and confirm both changes reach the feature tables with commit times; restart the feed and confirm no duplicates.",
    dep: ["stream-broker", "source-contracts", "entity-key-mapping"]
  },
  "event-time-and-watermarks": {
    s: "The convention that every record carries the time something happened, plus a running estimate of how far the stream is complete, so windows and joins use real time, not arrival time.",
    d: "Event time comes from the producer and processing time is when the system sees the event. A watermark says that no events earlier than a given time are expected, letting windows close. Producers' clocks are imperfect, so the system validates timestamps and clamps outliers. The watermark's strategy, the delay it allows, decides the tradeoff between latency and completeness. Every point-in-time guarantee in the system rests on event timestamps being honest.",
    k: ["Producer event time versus ingestion time: event time is correct and needs trusted clocks, ingestion time is reliable and misplaces delayed events.", "Conservative versus aggressive watermarks: conservative waits for stragglers and increases latency, aggressive is fast and drops more late events."],
    p: ["A device clock is wrong by a year and its events create windows in the future that never close.", "A watermark advances based on the fastest partition, and slow partitions' events are all treated as late."],
    v: "Send events with timestamps in the past, present and far future, and confirm they are assigned to the right windows, that outliers are rejected and counted, and that watermark progress is visible in metrics.",
    dep: ["event-streams"]
  },
  "source-contracts": {
    s: "Agreements between data producers and the feature store on schema, semantics, timestamps, keys, volume and delay, enforced by checks and with change notice.",
    d: "A contract lists the columns, types, key and timestamp fields, expected arrival delay and quality guarantees, and who to contact. Producers publish changes through a process, and the feature store tests incoming data against the contract. Where there is no contract, each downstream team discovers changes by breakage. Contracts are most valuable for sources shared by many consumers, where one upstream change breaks dozens of features.",
    k: ["Enforced contracts versus documented expectations: enforced contracts block bad data and create friction with producers, documentation is easy and ignored under pressure.", "Producer-owned versus consumer-owned schemas: producer-owned is authoritative and changes without regard for consumers, consumer-owned protects features and needs constant mapping."],
    p: ["A producer changes a unit and tells nobody, and features shift while all pipelines remain green.", "The contract specifies the schema but not the delay, so downstream jobs run before the data is complete."],
    v: "Publish a change to a source that violates its contract, such as a renamed column, and confirm checks fail before the change reaches feature tables, and that the producer is notified.",
    dep: ["source-quality-checks", "metadata-registry"]
  },
  "push-ingestion-api": {
    s: "An endpoint for applications to write feature values or events directly, for data that has no existing pipeline, with validation, authentication and ordering.",
    d: "Some features are produced by applications or models, such as a score computed elsewhere. The API accepts records with entity key, timestamp and values, validates against the view's schema, authenticates the producer and writes to the stream or both stores. Throughput limits and backpressure protect the store. It risks becoming a shortcut around lineage and review, so writes are tied to a registered view and an owner.",
    k: ["Direct writes to the stores versus writes via the stream: direct is simple and fast and bypasses the log, via the stream gives replay and consistent derivation.", "Strict schema checks versus accepting anything: strict checks protect consumers and slow producers, accepting anything is quick and defers errors."],
    p: ["Producers write without timestamps, so the server assigns arrival time and ordering is wrong.", "A runaway client floods the API and exhausts the online store's write capacity."],
    v: "Push a valid record, a record missing a timestamp and one violating the schema, and confirm the first appears in both stores, and the others are rejected with specific errors and counted.",
    dep: ["stream-broker", "access-control", "versioned-writes", "source-contracts"]
  },
  "entity-key-mapping": {
    s: "Reference data that connects the identifiers various systems use for the same real-world entity, so events and tables from different sources join to one entity key.",
    d: "Clicks use cookies, purchases use account ids, support tickets use emails. A mapping table links them with validity periods, because relationships change: devices change owners, accounts merge. Joins must use the mapping valid at the event time, otherwise history is attributed to the wrong person. Building the mapping is its own data problem, with probabilistic matching and errors that propagate into every feature built through it.",
    k: ["Deterministic mapping versus probabilistic matching: deterministic is exact and incomplete, probabilistic raises coverage and adds errors that are hard to see.", "Time-valid mappings versus a current-only mapping: time-valid is correct for history and complex, current-only is simple and rewrites the past on each merge."],
    p: ["After an account merge, history of both accounts is credited to one, and the model's training data changes retroactively.", "The mapping is applied in streaming but not in batch, so the same event counts for different entities."],
    v: "Pick entities with a known merge, compute a feature before and after the merge date, and confirm values before the merge are attributed to the old keys and after to the merged key.",
    dep: ["entity-definitions", "batch-sources"]
  },
  "source-quality-checks": {
    s: "Validations on incoming data before features are computed: schema, volume, freshness, duplicates and value ranges, with the ability to hold a batch when it fails.",
    d: "Checks run on each arriving partition or stream window: row counts against expected ranges, null rates, duplicate keys, timestamp sanity and referential checks. Failures can stop dependent jobs, alert the producer or tag the data. Problems found at the source are cheaper to fix than problems found in a model's metrics weeks later. The thresholds need to follow seasonality, or checks flood alerts on every holiday.",
    k: ["Blocking downstream jobs versus warning: blocking prevents bad features and delays everything on a failed check, warning keeps freshness and spreads bad data.", "Static thresholds versus learned ranges: static is explicit and goes stale, learned adapts and can accept a gradual decline as normal."],
    p: ["A partition arrives with half its usual rows and the check allows it, because the threshold was set loosely.", "The check reads the table while it is still being loaded and fails or passes on partial data."],
    v: "Deliver a partition with a known defect, such as a duplicated key and a sudden halving of rows, and confirm the checks flag both, hold the dependent jobs and notify the source owner.",
    dep: ["batch-sources", "event-streams", "alert-routing"]
  },
});
