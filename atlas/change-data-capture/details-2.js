// Details for the change data capture plate, part 2: snapshots and schema evolution.
ATLAS.details("change-data-capture", {
  "snapshot-coordinator": {
    s: "Runs the initial load: decides which tables to copy, in what order, at which log position, and when the pipeline switches from copying rows to streaming changes.",
    d: "On first start, or when asked, the coordinator records the current log position, reads each captured table, emits every row as a read event, then begins streaming from the recorded position. It tracks per-table progress so a restart does not begin again, and it blocks schema changes or detects them during the run. It reports completion so consumers know the copy is done. The difficulty is correctness at the seam: changes committed during the copy must be neither missed nor applied out of order against the copied rows.",
    k: ["Locking tables for the copy vs using a consistent read: locks make the seam trivial but block writers on the source; a consistent read avoids blocking but needs the engine to supply a snapshot tied to a log position.", "Snapshot then stream vs stream concurrently with the snapshot: sequential is simple and safe, while concurrent shortens time to current but needs reconciliation logic."],
    p: ["A crash during a multi-day snapshot restarts from zero because progress was never persisted.", "A table is added to the capture list after the snapshot and its existing rows are never delivered."],
    v: "Seed a source with one million rows while a writer continues, run the snapshot, and confirm the sink row count and checksum match the source at the end, with no missing or duplicated primary keys.",
    dep: ["consistent-snapshot-point", "table-chunking", "offset-store"]
  },
  "consistent-snapshot-point": {
    s: "The single log position at which the copied rows are known to be consistent, so streaming can begin exactly there without gaps or overlap.",
    d: "The coordinator opens a read transaction with snapshot isolation and records the log position that corresponds to its view, usually by asking the engine for both together, or by briefly locking writes to read the position. All table reads use this transaction. Streaming then starts at the recorded position, so any change after the snapshot view is delivered once, as a change event. The difficulty is that the position and the view must correspond exactly, and long reads keep the engine's old row versions alive, which causes bloat.",
    k: ["Engine-provided exported snapshot vs a brief global lock: the exported snapshot has no write stall, but only some engines offer it; the lock works anywhere but pauses writers for seconds.", "One long transaction for all tables vs one per table: one gives a single consistent point, per table shortens long reads but needs reconciliation between tables."],
    p: ["The read transaction and the recorded position are taken at slightly different moments and a few changes are lost or doubled.", "A day-long read transaction prevents the source from cleaning old row versions and the table bloats."],
    v: "Commit a row immediately before and another immediately after the snapshot starts. Confirm the first appears once as a read event and the second appears once as a change event, never both and never neither.",
    dep: ["source-position", "replication-protocol"]
  },
  "table-chunking": {
    s: "Splits a large table into key ranges copied in separate, resumable reads so progress is saved often and one failure does not repeat the whole table.",
    d: "The coordinator chooses chunk boundaries from the primary key, by sampling key ranges or by reading the minimum and maximum, and selects rows in key order within each chunk. After each chunk, the last key is persisted. Chunks bound memory, transaction length and lock time. Tables without a stable, ordered key are hard: they need a surrogate, a synthetic row identifier, or a single full scan. Keys with skewed distribution produce uneven chunks. Composite and non-numeric keys complicate range arithmetic.",
    k: ["Keyset pagination on the primary key vs offset pagination: keyset is stable and fast at any depth, while offset slows and skips rows when data shifts during the copy.", "Fixed row-count chunks vs fixed key ranges: row counts give even work, but key ranges are cheaper to compute and parallelize without counting."],
    p: ["A table with no primary key is chunked by a non-unique column and rows are skipped at chunk boundaries.", "Very small chunks create millions of tiny queries and make the copy slower than a full scan."],
    v: "Copy a table with a skewed key distribution and confirm every chunk's row count is within the configured bound, the union of chunks equals the table, and killing the process mid-copy resumes from the last persisted key.",
    dep: ["offset-store"]
  },
  "incremental-snapshot": {
    s: "Copies existing rows in chunks while streaming continues, so the pipeline never pauses change delivery and the copy can be started at any time for any table.",
    d: "Instead of one blocking snapshot, the pipeline reads a chunk of rows between two watermarks written to the log, and then reconciles the chunk with change events observed in the same window: a row changed during the window is represented by its change event, not the stale read. The result is that chunks and the live stream interleave with correct final values. It lets operators backfill one table or recapture after a failure. It is hard because reconciliation logic must be exactly right, and it requires write access for the watermarks.",
    k: ["Incremental snapshot vs blocking snapshot: incremental never stops streaming and can be run ad hoc, but is more complex and requires a signal table; blocking is simple and stops the live feed.", "Reading chunks through the live connection vs a separate session: the same connection keeps ordering simple, a separate session parallelizes but needs careful watermark placement."],
    p: ["A chunk read straddles a delete and the stale row is emitted after the delete, resurrecting it downstream.", "Watermark rows cannot be written because of a permission gap, so the run never starts and appears hung."],
    v: "While a writer continuously updates and deletes rows, run an incremental snapshot of the table, and confirm the sink converges to the source with no resurrected deletes and no stale values.",
    dep: ["watermark-reconciliation", "table-chunking", "log-reader"]
  },
  "watermark-reconciliation": {
    s: "The logic that decides, for each chunk read during live streaming, which rows to keep and which to drop because a newer change event for the same key already covers them.",
    d: "The pipeline writes a low watermark, reads the chunk, writes a high watermark, and buffers the chunk. While streaming through the window between the two markers, it removes from the buffer any row whose key appears in a change event. When the high marker arrives, remaining buffered rows are emitted as read events. Keys changed in the window are delivered only by their change events. The buffer is keyed by primary key, so it needs one. Hard parts are ordering the markers correctly in the log and guaranteeing the chunk read happens fully between them.",
    k: ["Dropping conflicting chunk rows vs emitting everything and letting consumers reconcile: dropping gives correct streams to naive consumers, while emitting all moves complexity to consumers and risks stale writes.", "In-memory chunk buffer vs spilling: memory is fast, but wide rows and large chunks need sizing or spill to avoid exhaustion."],
    p: ["A chunk read begins before the low watermark commits, so changes in the gap are neither dropped nor delivered in order.", "Primary key updates in the window move a row to a new key and the old key's stale read survives."],
    v: "Update a row's key and value during a chunk window, and confirm exactly one final row exists for the new key at the sink, and no row remains under the old key.",
    dep: ["commit-order-sequencing", "event-key"]
  },
  "snapshot-parallelism": {
    s: "Copies several tables, or several chunks of one table, at the same time to shorten the initial load, within limits set to protect the source.",
    d: "Workers each take chunks from a shared queue. For one consistent point, all workers must read at the same snapshot, which needs an exported snapshot token that each session can adopt. Without it, each session reads at its own point and reconciliation must repair the differences. Parallelism helps when per-row latency dominates, and hurts when source I/O is the limit. Ordering inside a table is dropped during the copy, which is fine for upserts and wrong for append-only sinks. The challenge is balancing throughput against source impact and memory.",
    k: ["Parallel chunk workers vs a single sequential reader: parallel finishes in a fraction of the time, but multiplies source load and needs shared snapshot tokens; sequential is gentle and slow.", "Parallelism across tables vs within one table: across tables is simple, while within a table helps the one giant table but needs key range splitting."],
    p: ["Eight workers saturate the source's disk and application queries time out.", "Workers read at different points and the copy contains a state that never existed on the source."],
    v: "Run the same snapshot with one and with eight workers and confirm identical content at the sink, a shorter wall time with eight, and source query latency within the configured margin.",
    dep: ["snapshot-coordinator", "source-impact-limits"]
  },
  "snapshot-modes": {
    s: "The policies for when and how a snapshot happens: always, only on first run, never, only schema, or on demand when the stored position is no longer available.",
    d: "On startup the pipeline inspects its stored position and the source's log. In an initial mode it snapshots only when no position exists. In a recovery mode it re-snapshots when the position has been lost. A schema-only mode captures table shapes but not rows, useful when the sink was loaded some other way. A never mode starts at the log's current end. The right choice depends on whether the sink is empty, whether history is needed and how big the tables are. Mistakes here lose or duplicate data at scale.",
    k: ["Automatic snapshot on lost position vs requiring operator approval: automatic restores service unattended, but can trigger an enormous reload at a bad time; approval is safer for large tables.", "Schema-only start vs full snapshot: schema-only is fast and fine for new data only, but leaves the sink without existing rows."],
    p: ["A never mode is chosen for a new sink and it silently contains only changes made after the pipeline started.", "An always mode is left on and every restart reloads terabytes."],
    v: "Start with each mode against a seeded source and confirm the sink's content: initial loads all rows once, never contains none, schema-only has table definitions only, and a restart under initial does not reload.",
    dep: ["snapshot-coordinator", "resume-logic"]
  },
  "schema-history-store": {
    s: "A durable record of every table definition the pipeline has seen and the log position at which each took effect, so old log records can be decoded correctly after a restart.",
    d: "Log records identify tables and column positions but not column names or full types, so the capturer keeps its own model of each table. Each change to that model, derived from schema change records in the log, is appended to the history with its position. On restart it replays the history up to the resume position to rebuild the model. It lives in a durable log or table, separate from the offsets. It is hard because the history must be complete and ordered, and losing it makes the older log undecodable.",
    k: ["Own schema history vs reading the live catalog: own history decodes old records with the schema they were written under, while the live catalog is simple but wrong for any record older than the last change.", "Storing every DDL statement vs storing resulting table structures: statements are compact and re-parseable, structures are directly usable but larger and lose the original text."],
    p: ["The history store is lost or truncated and the connector refuses to start or decodes with a wrong shape.", "History includes tables outside the capture filter, so it grows without bound on busy multi-tenant servers."],
    v: "Change a table three times, restart from a position before the second change, and confirm records are decoded with the column set that existed at their positions.",
    dep: ["offset-store"]
  },
  "ddl-detection": {
    s: "Notices when the source's table definitions change, either from schema records in the log or by comparing catalog snapshots, so decoding keeps up with the schema.",
    d: "Some engines write DDL statements or structural change records into the log in order with data changes, and the capturer reacts at that position. Others never log DDL in a form capture can see, so the pipeline compares the catalog on a timer or when a record references an unknown column layout. The detection point matters: a change applied in the log before later data must be in effect for those rows. The difficulty is that catalog polling is not ordered with the log, so rows can arrive in a new shape before the change is noticed.",
    k: ["In-log DDL events vs catalog polling: in-log gives exact ordering with data, while polling works everywhere but can decode rows against a stale shape in the gap.", "Pausing capture on any unrecognized shape vs guessing from the record: pausing is safe and stalls the pipeline, guessing keeps going and can emit mislabeled values."],
    p: ["Polling notices a dropped column five minutes after rows without it arrive, so they are mapped to the wrong names.", "An unrelated schema in the same database changes constantly and the pipeline processes noise."],
    v: "Add a column and immediately insert a row using it. Confirm the event for that row carries the new column with the right value and that no event is decoded with the old shape.",
    dep: ["log-reader", "schema-history-store"]
  },
  "ddl-parser": {
    s: "Parses the source's data definition statements into structural changes: which table, which columns, what types, keys and defaults, covering the dialect's quirks.",
    d: "When the log carries DDL as text, the pipeline needs a parser for the engine's dialect to learn the effect: create, alter, rename, drop, truncate, index and constraint changes. It applies each to its table model. Dialects have many forms, such as multi-action alter statements, vendor extensions and statements that touch several tables. It is hard because a parser that rejects a rare statement halts the pipeline, and one that accepts it wrongly corrupts the model. Statements outside the capture scope must be skipped without breaking.",
    k: ["Full dialect parser vs parsing only the statement types needed: full coverage handles rare syntax, but is large and version-sensitive; a narrow parser is simpler and fails on unforeseen forms.", "Fail on unparseable statements vs ignore them: failing preserves correctness, ignoring keeps flowing with a model that may be wrong."],
    p: ["A new database version adds syntax that the parser rejects and capture halts on a harmless statement.", "A rename expressed through a combined statement is parsed as drop and add, losing the column's data lineage."],
    v: "Feed a corpus of real statements from the engine's documentation and a production DDL log, and confirm every statement either produces the expected model change or is skipped explicitly with a logged reason.",
    dep: ["ddl-detection"]
  },
  "schema-at-position": {
    s: "The lookup that returns a table's exact structure at any given log position, which the decoder uses so every record is read with the shape it was written under.",
    d: "The model is a time-indexed view over the history: for position P and table T it returns columns, types and key as they were just before P. During normal streaming it is simply the current model. During replay after a restart or a rewind, it is rebuilt from the history in order. The decoder asks this lookup for every record. It is hard because the lookup must be correct across renames, drops and re-creations that reuse a name, and efficient enough to run per record.",
    k: ["Keying structures by table identifier vs by name: identifiers survive renames and drop-recreate, names are readable but ambiguous across history.", "Caching the current structure vs looking up per record: caching is fast and correct while streaming forward, but any rewind needs invalidation."],
    p: ["A table is dropped and recreated with the same name and old records are decoded with the new columns.", "After a rewind the cache keeps the latest shape and old events get the wrong field names."],
    v: "Rewind the connector to a position before a column was dropped and confirm the replayed events still include that column, while events after the drop do not.",
    dep: ["schema-history-store"]
  },
  "column-add-drop": {
    s: "How adding and dropping columns flows through the pipeline: event shapes change at a position, and consumers must tolerate fields that appear or vanish.",
    d: "An added column appears in events after its position with a default or null for older rows; existing rows are not rewritten in the log, so a snapshot after the change differs from the stream before it. A dropped column vanishes from later events. The pipeline updates its model, registers a new schema version, and emits a schema change event. Downstream sinks must alter their destination tables or accept the new field. Handling is hard because adds with defaults may rewrite many rows on some engines and flood the log, and drops lose data downstream irrecoverably.",
    k: ["Propagating drops to the sink vs retaining the old column: propagating mirrors the source, while retaining preserves history and avoids data loss at the cost of nulls and a divergent schema.", "Automatic destination table alteration vs manual: automatic keeps sinks flowing but widens tables unreviewed; manual is controlled and can stall the pipeline."],
    p: ["A column added with a default rewrites a ten-billion-row table and the log volume buries the pipeline.", "A consumer with a strict reader schema rejects events that contain the new field."],
    v: "Add a nullable column, insert one row with a value and one without, and confirm events show the field present with a value and null respectively, and that a consumer on the old schema version still reads them.",
    dep: ["schema-change-events", "schema-compatibility-policy"]
  },
  "type-change-handling": {
    s: "What happens when a column's data type changes: widening, narrowing or conversion across type families, which can break decoding or consumers.",
    d: "A type change can be harmless, such as increasing a string length, or incompatible, such as changing text to a number. The log may record the change as a structural event followed by rewritten rows, which appear as a flood of updates. The pipeline updates its model so later values are decoded under the new type, and maps it to the serialization type. If the new type has no compatible mapping, it must either fail, emit as string or version the stream. The difficulty is that the destination often cannot change type in place.",
    k: ["Failing on incompatible changes vs coercing to a general type: failing protects consumers but stops capture; coercing to string keeps data flowing at the cost of type fidelity.", "Rewriting the whole table in the sink vs adding a new column: rewriting is clean but expensive, adding a column is cheap and leaves two columns to reconcile."],
    p: ["A change from integer to decimal is decoded with the old width and truncates values.", "The type change rewrites every row and the resulting update flood is treated as real business activity by downstream triggers."],
    v: "Change a column from a narrow integer to a wide integer, then insert a value outside the old range and confirm the event carries the exact value with the new type and that the old version of the schema is still registered.",
    dep: ["schema-at-position", "value-type-mapping", "schema-compatibility-policy"]
  },
  "primary-key-changes": {
    s: "Handles changes to a table's primary key, whether the key columns change or a row's key value is updated, both of which break assumptions about identity.",
    d: "If a row's key value is updated, a keyed destination sees it as a delete of the old key and an insert of the new one, and an ordered stream needs both events in the right order and on the right partition. If a table's key definition changes, the event key, the partitioning and the sink's merge key change with it. The pipeline emits a delete and a create, or an update with the old key in the before image. Hard because partitioning by key sends the two events to different partitions, losing their relative order.",
    k: ["Emitting key update as delete plus insert vs one update with before key: two events fit keyed sinks and compaction, while one update preserves the intent but needs consumers to read the before image.", "Failing on key redefinition vs adapting the event key: failing forces a re-snapshot, adapting keeps flowing but breaks consumers keyed on the old identity."],
    p: ["The delete and insert land on different partitions and consumers apply them in the wrong order.", "A table without a primary key falls back to all columns as the key and every update looks like a new row."],
    v: "Update a row's key value and confirm the sink ends with exactly one row under the new key and none under the old, under repeated runs with parallel consumers.",
    dep: ["event-key", "key-partitioning", "before-after-images"]
  },
  "schema-change-events": {
    s: "Events that announce structural changes on the stream, so consumers can adapt before the first row in the new shape arrives.",
    d: "On each applied change the pipeline emits a schema change event with the affected tables, the statement or new structure, and the log position. It is sent in order with data events, either on the same stream or on a dedicated one. Consumers use it to alter destination tables, flush batches or pause. Without it, consumers learn of changes from the first event that surprises them. It is hard because ordering with data events must be exact, and consumers may be partitioned so some see the change before others.",
    k: ["Schema events in the same stream vs a separate stream: the same stream keeps order exactly, but burdens every consumer to handle them; a separate stream is cleaner and loses ordering guarantees.", "Structure with the event vs statement text only: structure is directly usable, while statements preserve original intent and need parsing."],
    p: ["A partition-parallel consumer processes new-shape rows on one worker before another worker has applied the schema change.", "Schema events are dropped by a filter that was written for data events only."],
    v: "Alter a table while a consumer is running and confirm the consumer receives the schema event before any row in the new shape, and updates its destination without restart.",
    dep: ["ddl-detection", "event-envelope", "schema-registry"]
  },
  "schema-compatibility-policy": {
    s: "The rule set that says which schema changes are allowed on a stream, such as adding optional fields, so consumers are not broken by upstream changes.",
    d: "Compatibility is checked when a new schema version is registered: backward compatible means new readers can read old data, forward means old readers can read new data, and full means both. The pipeline either rejects a source change that violates policy, which stops capture, or maps it to something compatible, such as a nullable field. Policy is a contract between the database owners and consumers who never talk. The difficulty is that the source team makes changes without consulting consumers, and the pipeline is the only place the conflict is visible.",
    k: ["Enforce compatibility at registration vs only observe: enforcement protects consumers, but a blocked pipeline stops all data over one incompatible change; observation keeps flowing and lets consumers break.", "Per-stream policy vs a global policy: per-stream matches each contract, a global policy is easy to explain and too loose for some and too strict for others."],
    p: ["A source team renames a column and the pipeline halts at midnight because the new schema is incompatible.", "A policy of none lets an incompatible change silently corrupt a downstream job for days."],
    v: "Attempt an incompatible change in a test environment and confirm the registry rejects it with the offending field named, while a compatible change registers a new version and flows.",
    dep: ["schema-registry"]
  },
});
