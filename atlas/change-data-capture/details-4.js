// Details for the change data capture plate, part 4: filtering and transforms, applying changes, sinks.
ATLAS.details("change-data-capture", {
  "table-and-column-filters": {
    s: "Include and exclude lists that decide which tables, and which columns of them, are captured at all, so unneeded data never leaves the capture side.",
    d: "Filters are patterns over schema, table and column names, evaluated when records are decoded or as early as the source allows. Excluding a table avoids decoding, serializing and shipping it, and saves transport and storage. Excluding a column removes it from event images and schema. The filter applies to schema history too, or the history grows with unrelated tables. It is hard because lists go stale: new tables are silently included or excluded depending on whether the list is an allow list or a deny list, and a removed column changes the event shape.",
    k: ["Allow list vs deny list: allow lists capture only reviewed tables and need updates for each new one, deny lists capture everything else by default and can leak new sensitive tables.", "Filtering at the source vs in the pipeline: source-side filtering reduces load, but is engine-specific; pipeline filtering is portable and the data was already read."],
    p: ["A deny list lets a newly created table with personal data flow to every consumer.", "A column filter is changed and downstream readers get a different schema without notice."],
    v: "Create a table outside the filter, change it, and confirm no event, no schema history entry and no stream appears for it, while a table inside the filter continues to flow.",
    dep: ["log-record-parser"]
  },
  "row-filters": {
    s: "Predicates over row values that drop or keep individual changes, such as only one tenant's rows or only rows in a given status.",
    d: "A filter expression is evaluated on the before and after images. The tricky part is updates: a row may move into or out of the filter, so the pipeline must decide whether an update that changes a row from not matching to matching is an insert, and from matching to not matching is a delete. Without handling this, sinks keep rows that no longer match. Filters need a before image for the old state, which depends on log detail settings. They are also costly when evaluated on every event.",
    k: ["Translating transitions into insert and delete vs passing only matching events: translation keeps the sink exactly equal to the filtered set, while passing only matches leaves stale rows.", "Filter at capture vs at the consumer: capture-time filtering saves bandwidth and hides data, consumer-time lets each consumer choose and ships everything."],
    p: ["A row changes status out of the filter and the sink keeps its last matching version forever.", "The filter reads a column not in the before image, so old state evaluates as null and the transition is misclassified."],
    v: "With a filter on status equals active, move a row from active to inactive and back, and confirm the sink shows delete then insert, and the final set matches the source query.",
    dep: ["before-after-images", "log-detail-settings"]
  },
  "single-message-transforms": {
    s: "Small per-event functions that reshape a message in flight: rename fields, flatten the envelope, cast types, add timestamps or change the key, with no state across events.",
    d: "A chain of transforms is applied after the event is built and before it is written. Typical ones unwrap the envelope into just the after image, copy a field into the key, convert timestamps, or drop tombstones. Each is stateless, so ordering is preserved and parallelism is trivial. Chains are configured declaratively and run inside the connector. The hazard is that transforms accumulate into business logic that nobody tests, and unwrapping the envelope throws away the operation and before image downstream consumers may need.",
    k: ["Declarative transform chain vs custom code: declarative is simple and limited, custom code can do anything and needs build, deploy and versioning.", "Flattening the envelope at capture vs at the consumer: flattening serves simple sinks and loses deletes and before images; keeping it serves everyone and burdens simple sinks."],
    p: ["Flattening drops delete events, since they have no after image, and the sink never removes rows.", "A chain of eight transforms is changed in one place and silently changes every table's output."],
    v: "Apply the chain to a corpus of recorded events and compare output against golden expected messages for insert, update, delete and snapshot events.",
    dep: ["event-envelope"]
  },
  "topic-routing": {
    s: "Rules that decide which stream, partition or destination each event goes to, usually by table name, with options to merge, split or rename.",
    d: "By default each captured table maps to its own stream named after it. Routing can merge sharded tables into one stream, split one table by a column such as tenant or region, or send certain events to a dead-letter stream. Routing keys affect ordering: events of one row must stay on one stream and partition. Routing is evaluated per event after filtering. The difficulty is that merging streams with different shapes yields a union schema, and consumer subscriptions are tied to stream names, so renames break them.",
    k: ["One stream per table vs merged streams: per table matches schemas and subscriptions, merged reduces stream count and mixes shapes.", "Routing by column value vs by table: by value separates tenants or regions for isolation and risks a row moving between streams on update, breaking order."],
    p: ["An update changes the routing column and a row's history is split across two streams.", "Sharded tables merged into one stream have colliding primary keys and compaction deletes real data."],
    v: "Route two sharded tables into one stream and confirm each event arrives once, with a key that is unique across shards and a shard identifier in the value.",
    dep: ["event-key"]
  },
  "masking-and-redaction": {
    s: "Hides or removes sensitive columns before events leave the capture side, by dropping them, replacing with a hash or token, or truncating.",
    d: "Masking rules apply to named columns: drop entirely, replace with a fixed string, one-way hash with a salt to preserve equality for joins, or tokenize through a vault. Rules run before serialization and before the transport so unmasked data is never stored in the stream. Hashed values keep equality but not order or format. It is hard because sensitive data also lives in places other than labeled columns, such as free text, JSON documents, before images and schema change statements, and because a rule gap exposes everything.",
    k: ["Masking at capture vs at the consumer: capture-side masking keeps raw data out of the stream and logs, while consumer-side masking leaves it stored in transit and everywhere upstream.", "Salted hash vs random token via vault: hash is stateless and deterministic and can be brute-forced for small domains; tokens are safe and need a lookup service."],
    p: ["A column is masked in after images but appears in before images and the dead letter stream.", "A new sensitive column is added to a table and flows unmasked until someone updates the rules."],
    v: "Insert rows with known sensitive values, then scan the stream, the dead-letter stream, the logs and the schema history for those values. None may appear.",
    dep: ["table-and-column-filters", "before-after-images"]
  },
  "key-assignment": {
    s: "Choosing or overriding the event key when the table's primary key is missing, unsuitable for partitioning, or different from what consumers want.",
    d: "The default key is the primary key. For tables without one, an operator names columns that are unique in practice, or the pipeline generates a surrogate. A custom key may group related rows to one partition, such as an order and its lines keyed by order identifier. Changing the key changes ordering scope and compaction behavior. It is hard because a configured key that is not truly unique makes compaction and upserts merge distinct rows, and a non-immutable key makes updates look like deletes and inserts.",
    k: ["Natural business key vs surrogate: a business key is meaningful and may change or collide, a surrogate is stable and meaningless to consumers.", "Grouping related rows by one key vs the row's own key: grouping gives cross-row order for the group but skews partitions and breaks per-row uniqueness for compaction."],
    p: ["The configured key is not unique and the sink overwrites one row with another.", "A key column is updated and consumers see the change as an unrelated delete and insert."],
    v: "Load ten thousand rows into a table with the configured key and check that no two rows share a key, and that updating a non-key column never changes the key.",
    dep: ["event-key"]
  },
  "stream-joins-and-aggregation": {
    s: "Stateful processing over the change stream, such as joining tables, aggregating counts or building denormalized documents, using the events as input.",
    d: "A stream processor reads several change streams, keeps keyed state, and emits derived streams: a join of orders and customers, a running count, a materialized document. Updates and deletes retract earlier results. State is checkpointed with offsets so recovery restores both together. Results depend on event ordering across tables, which is not guaranteed, so processors use transaction markers or time windows. Hard because state size grows with data, late events need policy, and recomputation after a fix needs replay.",
    k: ["Joining in the stream vs joining in the sink: in-stream makes derived results available to all consumers and carries state to manage; sink joins are simple and repeat work in each sink.", "Event-time windows with lateness vs processing time: event time is correct under delay and needs watermarks, processing time is simple and gives different results on replay."],
    p: ["A join sees an order event before its customer row and emits a result with a missing field that is never corrected.", "State grows without bound because deletes are not applied to the join state."],
    v: "Replay the same change history through the processor twice and confirm the derived output is identical, then compare a sample of derived rows to the same join run directly on the source.",
    dep: ["event-transport", "ordering-guarantees", "transaction-boundary-events"]
  },
  "outbox-routing": {
    s: "Capturing rows from a dedicated outbox table that an application writes in the same transaction as its own changes, and turning them into clean domain events.",
    d: "The application inserts an event row, with an aggregate identifier, a type and a payload, into an outbox table within its business transaction. The pipeline captures inserts on that table, and routes each to a stream chosen by the aggregate type, with the aggregate identifier as the key. The outbox row can then be deleted, since its insert is already in the log. This gives atomic publish of an event with the state change without a distributed transaction. It is hard to keep the payload stable as a public contract, and to avoid outbox growth.",
    k: ["Outbox event vs capturing business tables directly: the outbox publishes a designed contract and decouples from table structure, while direct capture exposes internal schema to consumers.", "Deleting outbox rows immediately vs later: immediate deletion keeps the table small and relies on the log, later deletion allows inspection and costs storage."],
    p: ["An application forgets to write the outbox row on one code path and that change is never published.", "The outbox table is never cleaned and grows to billions of rows."],
    v: "Execute a business operation and confirm the state change and the outbox event commit together; roll one back and confirm neither the state nor any event appears.",
    dep: ["topic-routing", "event-key", "single-message-transforms"]
  },
  "sink-connector-framework": {
    s: "The shared runtime for sink connectors: it reads from the stream, batches records, handles retries, tracks offsets and calls a destination-specific writer.",
    d: "The framework assigns partitions to tasks, polls batches, passes them to a connector's put function, flushes on batch size or time and commits offsets only after the destination has accepted them. It provides error handling policies: fail, skip, or send to a dead-letter stream. Connector authors implement only the write. Hard parts are partition rebalancing, which can move a partition mid-batch, backoff for slow destinations, and ensuring flush and offset commit happen in the right order.",
    k: ["Framework-managed offsets vs connector-managed: framework gives uniform semantics and loses connector-specific atomicity, while connector-managed enables exactly-once into a transactional store.", "Skipping bad records vs failing the task: skipping keeps flowing and loses data silently unless dead-lettered; failing preserves correctness and halts."],
    p: ["A rebalance moves a partition while a batch is flushing and two tasks write the same records.", "A poison record fails the task in a loop and blocks the partition behind it."],
    v: "Inject a malformed record and a destination outage into a running sink, and confirm the bad record lands in the dead-letter stream, writes retry with backoff, and offsets advance only after successful writes.",
    dep: ["event-transport", "offset-commit", "errors-and-dead-letters"]
  },
  "stream-sink": {
    s: "Writes events into another message stream, to fan out to other regions, systems or teams, or to feed stream processors.",
    d: "The sink republishes events, possibly transformed, to a destination stream, preserving keys and partitions where it can. Cross-cluster replication needs to translate offsets, since positions in the destination differ from the source. Ordering is retained per key if a single writer targets each partition. It is hard because replication across regions adds lag and duplicates, and because the destination's retention and partitioning may not match the source's.",
    k: ["Mirroring with the same partitioning vs repartitioning: same partitioning preserves ordering and offsets mapping simply, repartitioning adapts to different consumers and breaks the mapping.", "Active-passive vs active-active replication: active-passive is simple and idle on one side, active-active uses both and needs conflict and loop prevention."],
    p: ["Two-way replication loops events between clusters endlessly.", "Offsets are not translated and consumers failing over to the replica restart at the wrong point."],
    v: "Produce events with known keys at the source, then confirm the destination stream contains the same events in the same per-key order, with no loop under two-way replication.",
    dep: ["sink-connector-framework", "key-partitioning"]
  },
  "warehouse-sink": {
    s: "Loads changes into an analytical store, typically as micro-batches of files merged into tables, trading seconds of latency for efficient bulk writes.",
    d: "Events accumulate into batches, are written as files to staging storage, and applied with a bulk merge that applies inserts, updates and deletes by key. Alternatively the sink appends every event to a change log table and a periodic job builds the current state. Analytical stores favor large batches and are slow at single-row updates. Hard because merges are costly, schema drift needs table alteration, and deletes and late events must be reflected correctly in the current table.",
    k: ["Merge into the current table vs append-only change log plus view: merge gives a ready table and costs compute for every batch, append-only is cheap to write and costs at query time or a periodic rebuild.", "Small frequent batches vs large infrequent: small gives fresher data and many small files and expensive merges, large is efficient and stale."],
    p: ["Frequent tiny merges create costs far above the batch approach and still lag.", "A delete event arrives in a different batch than a re-insert and merge order produces the wrong final row."],
    v: "Apply a mixed run of inserts, updates, deletes and re-inserts of the same keys through the sink, and confirm the current table equals a direct copy of the source, row for row.",
    dep: ["sink-connector-framework", "upsert-and-merge", "batching-and-bulk-load"]
  },
  "search-index-sink": {
    s: "Keeps a text search index in step with the database by turning row changes into document writes and deletes.",
    d: "Each change is mapped to a document identifier from the key and a document body from the after image, possibly denormalized with data from related rows. Updates replace the document, deletes remove it. Bulk requests batch many changes. The index is eventually consistent with the database, with a refresh interval between a write and its visibility. Hard because relational data is normalized and documents are not: a change to a related row, such as a customer name, must update every document that embeds it.",
    k: ["Indexing one table row per document vs denormalized documents: one-to-one is simple and needs query-time joins, which search engines do poorly; denormalized serves queries and needs fan-out updates.", "Versioned writes using the source position vs last-write-wins: versions reject stale writes from reordering, last-write-wins is simpler and can regress a document."],
    p: ["A change to a customer row is not propagated to the thousands of documents embedding it.", "Retried bulk requests apply an older version after a newer one and the index shows stale text."],
    v: "Update a row, then query the index until the change is visible and record the time; delete the row and confirm the document is gone and no query returns it.",
    dep: ["sink-connector-framework", "idempotent-writes", "upsert-and-merge"]
  },
  "cache-invalidation-sink": {
    s: "Removes or refreshes cached entries when the underlying rows change, so caches stay correct without every writer remembering to invalidate.",
    d: "The sink maps a change event to cache keys, using the table and primary key, and issues a delete or sets the new value. Invalidation by delete is simpler and safe: the next read reloads from the database. Writing the new value saves a read and risks ordering races. Because it is driven by the commit, a cache never invalidates before the data is visible, a race that application-level invalidation has. It is hard because derived cache keys, such as list or aggregate entries, depend on several rows.",
    k: ["Delete on change vs write the new value: delete is robust against ordering, and costs a miss; writing saves a read and can write stale values if events reorder.", "Invalidating from the log vs in the application: log-based is complete and covers every writer, with seconds of delay; application-based is immediate and misses writes from other paths."],
    p: ["A list cache keyed by query is never invalidated because no event maps to its key.", "The sink lags by seconds and users read a stale value right after their own write."],
    v: "Update a cached row through a path that bypasses the application, and confirm the cache entry is gone or updated within the target delay, and that the next read returns the new value.",
    dep: ["sink-connector-framework", "event-key"]
  },
  "replica-database-sink": {
    s: "Applies changes to another database to keep a copy in step for migration, reporting or a different engine, translating types and schema as needed.",
    d: "The sink turns events into inserts, updates and deletes on destination tables, usually keyed by primary key, inside transactions that mirror source transactions when boundary events are available. It maps types and names between engines and creates or alters tables as schemas change. Used for zero-downtime migrations: initial load, then streaming until the lag is near zero, then cutover. Hard because the engines differ in types, collations and constraints, and because the destination's own constraints can reject changes that were valid at the source.",
    k: ["Applying per source transaction vs per row batches: transactional application preserves consistency for readers and limits parallelism, per row batches are fast and expose partial states.", "Disabling destination constraints during load vs enforcing: disabling is faster and hides integrity errors, enforcing finds them and can stall on order."],
    p: ["Foreign key checks fail because child rows are applied before parents from a different transaction order.", "Collation differences make unique keys that were distinct at the source collide at the destination."],
    v: "Run a full cutover rehearsal and compare the source and destination with row counts and per-table checksums at a point when writes are paused, expecting zero differences.",
    dep: ["sink-connector-framework", "apply-ordering", "sink-schema-mapping", "transaction-boundary-events"]
  },
  "object-store-sink": {
    s: "Writes batches of events as immutable files to cheap object storage, for long-term history, lake tables and later reprocessing.",
    d: "Events are buffered and written as files partitioned by time or table, in a columnar or row format, with a manifest of committed files. File closing is driven by size or time, so the latest events are visible only after the file is committed. File names are made deterministic from the offset range so a retry overwrites rather than duplicates. Consumers read the files later in bulk. Hard because small files accumulate, commits must be atomic across several files, and late events and schema changes affect partitions already written.",
    k: ["Time-based partitions vs key-based: time suits history and retention and scatters a key's changes, key-based groups rows and is bad for time-range scans.", "Deterministic file names from offset ranges vs random names: deterministic gives idempotent retries, random names are simple and duplicate on retry."],
    p: ["Thousands of tiny files are written during quiet periods and slow every later query.", "A retry writes a second file for the same range and downstream readers count events twice."],
    v: "Kill the sink mid-batch, restart, and confirm the set of committed files covers each offset range exactly once, with the event count equal to the source's change count.",
    dep: ["sink-connector-framework", "batching-and-bulk-load", "idempotent-writes"]
  },
  "upsert-and-merge": {
    s: "Turns an insert or update event into one write that creates the row if absent and replaces it if present, keyed by the event key.",
    d: "Upsert makes reapplying an event safe and removes the need to know whether the row exists. The writer uses the engine's native insert-or-update or a merge statement. For a stale event arriving after a newer one, a version check using the source position can reject it. Updates that carry only changed columns need a read-modify-write. Hard because an upsert on a table without a unique key cannot work, and because upserts that overwrite whole rows can erase columns a different process wrote.",
    k: ["Whole-row upsert vs column-level patch: whole-row is simple and idempotent, patch preserves other writers' columns and needs complete knowledge of what changed.", "Unconditional upsert vs version-guarded: unconditional is simple and can regress on reordering, guarded needs a version column and rejects stale writes."],
    p: ["A replay of an old update overwrites a newer value because the upsert has no version guard.", "The destination has no unique constraint and upserts create duplicates."],
    v: "Apply an event sequence, then replay a random earlier subset in any order, and confirm the final table content equals the state after the first full pass.",
    dep: ["event-key", "source-position-metadata"]
  },
  "delete-application": {
    s: "How delete events are carried out at the destination: physical removal, soft-delete markers, or retention in a history table.",
    d: "A delete event carries the key and the before image. The writer removes the row by key, sets a deleted flag with a timestamp, or writes to an archive. In a compacted stream a tombstone, a null value with the key, lets compaction drop the key later. Soft deletes preserve history and make every query filter them. Deletes are hard because they have no after image, they can race with a re-insert of the same key, and a missed delete leaves stale rows forever with nothing to prompt a fix.",
    k: ["Hard delete vs soft delete: hard delete mirrors the source and loses history, soft delete keeps history and requires every reader to filter.", "Emitting tombstones vs only delete events: tombstones let compaction clean up and break consumers that expect a value, delete events alone leave the key in the log."],
    p: ["A delete is applied after a later re-insert of the same key because of reordering, and the row vanishes.", "Soft-deleted rows are counted in reports because one query forgot the flag."],
    v: "Delete a row, re-insert the same key, replay the stream out of order, and confirm the destination ends with the re-inserted row; delete again and confirm absence or the soft-delete flag.",
    dep: ["upsert-and-merge", "operation-types"]
  },
  "batching-and-bulk-load": {
    s: "Groups many events into one write to the destination, because most targets are far faster per row in bulk than one at a time.",
    d: "The sink accumulates events up to a count, byte or time limit, then writes them in one request or file and commits offsets after success. Within a batch it may collapse multiple changes to the same key to the last one, which reduces writes and hides intermediate states. Larger batches improve throughput and raise latency and the replay window. Hard because one bad record can fail a whole batch, requiring splitting to find it, and because batch boundaries interact with transaction boundaries.",
    k: ["Collapsing changes per key within a batch vs preserving every event: collapsing reduces load and loses history and audit, preserving is faithful and heavier.", "Large batches vs small: large maximize throughput and lengthen replay and latency, small stay fresh and cost more per row."],
    p: ["One malformed row fails a thousand-row batch and the sink retries the whole batch forever.", "Collapsing hides a delete followed by an insert and the destination sees an update that triggers wrong logic."],
    v: "Send events at a steady rate, record end-to-end latency and write throughput at three batch sizes, and confirm throughput rises and latency stays under the target at the chosen size.",
    dep: ["sink-connector-framework"]
  },
  "apply-ordering": {
    s: "The rules for the order and parallelism in which events are written at the destination, keeping per-key order while running independent keys at once.",
    d: "A sequential writer is correct and slow. Parallel writers split events by key hash so each key has one writer and order holds per key. Dependencies across keys and tables, such as foreign keys, need stronger rules: apply by transaction, or by dependency ordering. Parallel apply may expose states that never existed at the source. It is hard because the safe degree of parallelism depends on the data model, and the destination's own locks can turn parallel writers into a queue.",
    k: ["Parallel by key hash vs sequential per partition: key hash scales with the writers and loses cross-key consistency, sequential is simple and caps throughput.", "Apply per source transaction vs per event: per transaction gives consistent reads and limits parallelism to transaction boundaries."],
    p: ["Parallel writers apply a child row before its parent and a constraint fails or the row is rejected.", "Two keys of one transaction are applied at different times and a report reads the mix."],
    v: "Run a workload with foreign-key dependencies under maximum parallelism and confirm no constraint failures occur, and that a consistent-read query during the run never sees a half-applied transaction when transaction mode is on.",
    dep: ["key-partitioning", "transaction-boundary-events"]
  },
  "idempotent-writes": {
    s: "Writes designed so applying the same event twice has the same result as once, which makes at-least-once delivery safe.",
    d: "Overwrite by key, set to value and delete by key are naturally idempotent. Increments and appends are not. The usual fix is to store the source position with each row or in a side table, and apply an event only when its position is greater than the stored one, atomically with the write. The check protects against duplicates and reordering. It is hard because it requires the destination to support conditional writes, and some destinations, such as append-only logs, cannot make appends idempotent without keys.",
    k: ["Position-guarded conditional write vs plain overwrite: guarded handles duplicates and reordering at the cost of an extra column and conditional logic, plain overwrite is simple and loses to stale replays.", "Natural idempotence by design vs deduplication on top: natural needs consumers to model state as overwrites, deduplication fits any operation and adds state."],
    p: ["An aggregate table that increments per event double-counts on every replay.", "The position guard is stored in a different transaction than the data and a crash leaves them disagreeing."],
    v: "Apply each event twice and in shuffled order and confirm the destination state matches the single in-order application of the same events.",
    dep: ["source-position-metadata"]
  },
  "conflict-resolution": {
    s: "The policy for when the destination also receives writes from elsewhere and a replicated change collides with a local one.",
    d: "In one-way replication conflicts should not occur, but any local write to a replicated table can create them. In two-way or multi-writer setups the rules are explicit: last write wins by timestamp, source priority, version vectors or merge functions per column. The pipeline must also avoid echo, applying a change that originated at the other side. Hard because timestamps from different nodes are unreliable and last-write-wins silently discards a user's update, and because loop prevention needs the origin carried on each event.",
    k: ["Last-write-wins vs application-defined merge: last-write-wins is automatic and drops one side's update, merge functions are correct for specific data and need design per table.", "Single writer per row or region vs multi-writer: single writer avoids conflicts by construction and constrains the application, multi-writer is flexible and needs resolution."],
    p: ["Two sites edit the same row and clock skew makes the older edit win.", "A change replicates to the other side and back, creating an infinite loop of updates."],
    v: "Update the same row at both sites within one second and confirm both converge to the same value following the documented rule, and that no event echoes back.",
    dep: ["source-position-metadata", "idempotent-writes"]
  },
  "current-state-view": {
    s: "A table or view that shows each row's latest version, built from a log of changes in the destination, hiding history and deleted rows.",
    d: "When the destination stores every change as an append, readers want the current rows. The view picks the latest event per key by position, filters keys whose latest operation was a delete, and returns the after image. Materialization can be incremental, periodic or at query time. Hard because the latest event must be chosen by source order, not arrival or load time, and because deletes and late events require a rebuild policy so that it stays correct.",
    k: ["Computing at query time vs materializing: query time is always fresh and costs every read, materialized is fast and lags by the refresh interval.", "Ordering by source position vs by load time: position is correct under reordering, load time is simple and wrong when batches arrive out of order."],
    p: ["Latest is picked by load timestamp and a delayed batch resurrects an old version.", "Deleted keys stay visible because the view does not filter delete operations."],
    v: "Load a shuffled history including deletes, and confirm the view equals the source table at the final position, with deleted keys absent.",
    dep: ["source-position-metadata", "operation-types", "delete-application"]
  },
  "sink-schema-mapping": {
    s: "Translating event fields and types into destination tables and columns: names, types, nested structures, keys and the handling of fields the destination lacks.",
    d: "Mappings cover table naming, column naming rules, type conversion, nested objects flattened or stored as documents, and defaults for missing fields. The sink either creates tables automatically from the event schema or requires them to exist. On schema changes it can alter tables or fail. Constraints at the destination, such as length limits and reserved words, shape the mapping. Hard because automatic evolution can widen tables unreviewed, and some changes, such as type narrowing, cannot be applied in place.",
    k: ["Auto-create and auto-evolve tables vs pre-created tables: auto-handling keeps flowing and drifts from design, pre-created is controlled and stalls on every change.", "Flattening nested values into columns vs storing as documents: flattened allows query and constraints, documents are flexible and hide structure."],
    p: ["A field name collides with a reserved word in the destination and writes fail.", "A widened source column is auto-evolved into a destination type that cannot hold older values."],
    v: "Capture a table with every supported type into a fresh destination, then compare destination column types to the expected mapping and a sample of values to the source with exact equality.",
    dep: ["value-type-mapping", "schema-change-events"]
  },
});
