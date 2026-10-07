// Details for the change data capture plate, part 3: offsets, delivery and the event format.
ATLAS.details("change-data-capture", {
  "source-position": {
    s: "The identifier of a place in the source log, such as a sequence number or file and offset, that says exactly where capture stands.",
    d: "Positions are engine-specific values with a total order on one log: a monotonically increasing number, a segment name plus byte offset, or a set of per-node counters. They are carried on every event so any consumer can say how far it got. Comparing positions tells which change is newer. On a cluster or after failover, positions may not be comparable between nodes, and a position can be valid on one replica and meaningless on another. It is hard because the pipeline's correctness depends on treating the value as opaque yet ordered.",
    k: ["Opaque string positions vs structured positions: opaque is safe to pass around and store, while structured allows range checks and arithmetic but ties code to one engine.", "Global transaction identifiers vs file and offset: global identifiers survive failover and replica changes, file and offset are simpler and node-local."],
    p: ["A position from one node is used on another after failover and points to different data.", "Positions are compared as strings and a rollover from nine to ten sorts wrongly."],
    v: "Capture ten commits and confirm each event's position is strictly greater than the previous, that restarting at event five's position yields events six to ten and none earlier.",
    dep: ["source-log-format"]
  },
  "offset-store": {
    s: "Durable storage for the pipeline's progress: the last source position fully processed, plus any state needed to resume mid-transaction or mid-snapshot.",
    d: "Offsets are written to a replicated log, a table or a key-value store, keyed by connector and source. The record contains the position, snapshot progress and the transaction in progress. Writes are batched and made after downstream acknowledgment. Reads happen at start. The store must survive the loss of the capture process and ideally be on different infrastructure than it. It is hard because it is a single point whose corruption or loss makes the pipeline either restart from scratch or resume at the wrong place.",
    k: ["Offsets in the destination log vs a separate store: the same log gives atomic commit with the data, while a separate store is simple but makes data and offset two writes that can disagree.", "Committing every event vs periodically: every event minimizes replay, but is expensive; periodic commits are cheap and replay up to an interval after a crash."],
    p: ["The offset store is wiped by a cleanup job and the pipeline silently restarts from the beginning.", "Two instances of one connector write the same offset key and overwrite each other's progress."],
    v: "Process a thousand events, kill the process, and confirm the stored offset equals the last acknowledged event's position, and that a fresh process resumes at it and emits no event before it.",
    dep: []
  },
  "offset-commit": {
    s: "The rule for when the pipeline persists progress: only after downstream has durably accepted the events, so a crash replays instead of losing data.",
    d: "The capturer sends events and keeps them in an unacknowledged set. The transport confirms durable writes, and only then does the commit step advance the stored offset to the highest contiguous acknowledged position. It also acknowledges that position to the source, releasing log. With batching, failure inside a batch means the whole batch is replayed. Exactly-once setups commit the offset in the same atomic operation as the data. The difficulty is contiguity: positions with a gap, acknowledged out of order, must not advance the offset past the missing one.",
    k: ["Commit after downstream acknowledgment vs before: after gives at-least-once with duplicates on crash, before is faster but loses events on crash.", "Atomic commit with data vs separate commit: atomic gives exactly-once into that store but requires it to support transactions; separate is universal and needs consumer deduplication."],
    p: ["Offsets advance on send rather than on acknowledgment and a broker outage drops an hour of events.", "Acknowledgments arrive out of order and the committed offset skips an unacknowledged event."],
    v: "Block the transport, send events, and confirm the stored offset and the source acknowledgment do not advance. Release the transport and confirm both advance to the last acknowledged event.",
    dep: ["offset-store", "at-least-once-delivery", "source-position"]
  },
  "resume-logic": {
    s: "What the pipeline does on start: reads its stored position, checks the source still has that log, restores schema history, and continues exactly where it stopped.",
    d: "Startup reads the offset, then the schema history up to that position, then verifies the position exists in the source log. If the position is mid-transaction, it re-reads from the transaction's start and skips already delivered events. If the position is gone, it follows the snapshot mode policy: fail, or take a new snapshot. If the snapshot was unfinished, it resumes the snapshot. Hard because every combination of state, partial snapshot, mid-transaction and lost position needs a defined behavior and a test.",
    k: ["Resuming mid-transaction by replaying the transaction vs persisting buffer state: replay is simple and uses the log as the source of truth, while persisted state avoids re-reading long transactions at the cost of a recovery format.", "Fail on a lost position vs auto-recover: failing surfaces the gap to a human, auto-recovery keeps data flowing and hides how much was missed."],
    p: ["After a crash mid-transaction, the resume point is after the first events of that transaction and those events never appear.", "Auto-recovery re-snapshots a huge table during business hours without anyone deciding to."],
    v: "Kill the process mid-transaction at five points in turn, restart each time, and confirm the sink ends with every event once in order, with duplicates only inside the documented replay window.",
    dep: ["offset-store", "schema-history-store", "snapshot-modes", "log-retention-interaction"]
  },
  "replication-slot-management": {
    s: "Creating, monitoring and dropping the named server-side markers that hold log for a consumer, so the source retains what the pipeline has not yet read.",
    d: "A slot is a registration on the source recording the oldest position a consumer still needs. The server will not delete log beyond it. The pipeline creates the slot at first start, before the snapshot, so no change between the snapshot and streaming is lost. It must be dropped when the pipeline is retired. Slots are tied to a database and a plugin, and are not carried to replicas on some engines, which complicates failover. The hazard is orphaned slots that retain log forever.",
    k: ["Slot-protected retention vs retention by time: a slot is gap-free but risks source disk; time-based is safe for the source and loses data after long outages.", "Pipeline-managed slot lifecycle vs operator-managed: automatic is convenient but a mistaken deletion or leak is silent; operator-managed is explicit and easy to forget."],
    p: ["A test pipeline is deleted and its slot stays, retaining a month of log until disk fills.", "After promoting a replica the slot does not exist and the pipeline cannot resume."],
    v: "List slots on the source and confirm each corresponds to a live pipeline, with retained size per slot below the alert threshold. Stop one pipeline and confirm its slot's retained size grows and the alert fires.",
    dep: ["replication-protocol", "source-position"]
  },
  "rewind-and-replay": {
    s: "Deliberately moving the pipeline's position backward to re-emit past changes, to recover from a consumer bug or to feed a new consumer.",
    d: "Because offsets are just stored positions, an operator can set them to an earlier point within the log's retention, or consumers can reset their reading position in the stream. The pipeline re-reads and re-emits the events, with schema history rewound to match. Consumers must tolerate duplicates. Replay is bounded by the log's retention and the stream's retention, whichever is shorter. Hard because side effects such as emails or payments triggered by events must not be repeated, and because partial replays can mix old and new data at sinks.",
    k: ["Replaying from the source log vs from the stream's retained history: the stream is cheap and does not touch the source, but is limited by its retention; the source log reaches further and loads the source.", "Replaying into the live stream vs a separate stream: live reaches all consumers but disturbs those who did not ask for it; a separate stream isolates the replay and needs reconciliation."],
    p: ["A replay triggers customer notifications a second time for events already processed.", "The target position is older than the earliest schema history and old events cannot be decoded."],
    v: "Set the position to ten minutes ago, restart, and confirm events from that point are re-emitted in order with their original positions, and that a sink with idempotent writes ends in an identical state.",
    dep: ["offset-store", "schema-at-position", "idempotent-writes"]
  },
  "resnapshot-trigger": {
    s: "The decision and mechanism for reloading data when incremental progress can no longer be trusted: lost log, corrupt state, a new sink or a faulty consumer.",
    d: "A re-snapshot can be triggered by an operator command, a signal table entry, or automatically on a detected gap. It may cover everything or selected tables, and may run incrementally alongside streaming. Sinks must handle reloaded rows that they already have, which means upserts. Deletes that happened during the gap are not reproduced by reading current rows, so sinks may keep rows that no longer exist. Hard because a snapshot repairs missing inserts and updates but not missing deletes unless the sink is truncated first.",
    k: ["Truncate the sink then reload vs reload over existing data: truncating guarantees no stale rows but makes the sink empty during the load; reloading over keeps data available and can keep deleted rows.", "Whole-database re-snapshot vs per-table: whole is simple and large, per-table is targeted and needs tracking which tables are affected."],
    p: ["A re-snapshot over existing data leaves rows deleted at the source during the gap.", "The trigger signal is written twice and the reload runs twice concurrently."],
    v: "Delete a row at the source while the pipeline is stopped past its retention, trigger a re-snapshot with truncation, and confirm the sink matches the source row for row including the missing deleted row.",
    dep: ["snapshot-coordinator", "incremental-snapshot", "delete-application"]
  },
  "internal-event-queue": {
    s: "A bounded in-memory buffer between the thread that reads the log and the thread that sends events downstream, which smooths bursts and carries backpressure.",
    d: "The reader enqueues decoded changes and the sender dequeues in batches. The queue is bounded by count and bytes. When full, the reader blocks, which slows log consumption and propagates backpressure to the source connection. It also decides the unit of acknowledgment, since events leave the queue only after the sender has delivered them. The challenge is sizing: too small and bursts stall the reader, too large and a crash discards a lot of unacknowledged work and consumes memory.",
    k: ["Bounded blocking queue vs unbounded queue: bounded applies backpressure and protects memory, while unbounded never stalls the reader and can exhaust the process.", "Limit by event count vs by bytes: count is simple, bytes handles wide rows and large values and needs size estimation per event."],
    p: ["A queue limited by count fills with huge rows and the process runs out of memory.", "An unbounded queue hides a slow sink for hours until the process is killed."],
    v: "Stall the sender and confirm queue depth rises to its limit and the reader then blocks, with the source-side acknowledged position stopping and process memory staying flat.",
    dep: []
  },
  "event-transport": {
    s: "The durable channel that carries events from capture to consumers, usually a partitioned append-only stream, but sometimes direct calls or a file drop.",
    d: "The pipeline writes events to a stream with a topic or channel per table or per database, many partitions per topic, and a retention period. Consumers read at their own pace and keep their own positions. The transport decouples capture speed from consumer speed and lets several consumers read the same changes. It offers per-partition ordering, durability through replication and a write acknowledgment. Hard decisions are partition counts, retention length, the number of streams and the cost of replication.",
    k: ["Durable stream with independent consumers vs direct push to each sink: a stream decouples and allows replay, adding a system to run; direct push is simple and couples capture to the slowest sink.", "One stream per table vs one for the database: per table enables selective subscription and parallelism, but multiplies streams and splits cross-table transaction order."],
    p: ["Stream retention is shorter than the longest consumer outage and a consumer returns to find its position expired.", "Too few partitions cap consumer parallelism and cannot be increased without breaking key ordering."],
    v: "Write one thousand events, read them with two independent consumers, and confirm both receive all events in per-key order, and that a third consumer started later can read from the earliest retained position.",
    dep: ["internal-event-queue"]
  },
  "key-partitioning": {
    s: "Choosing the partition for each event from the row's key, so all changes to one row stay together and in order while different rows spread across consumers.",
    d: "A hash of the event key maps to a partition. Within a partition, order is preserved, so every change to one row is seen in sequence. Different keys may be processed in parallel. The number of partitions limits consumer parallelism. Key choice matters: a skewed key such as a tenant identifier creates hot partitions, and changing the partition count remaps keys, breaking order across the change. Transactions spanning several keys are split across partitions and lose atomic visibility.",
    k: ["Row primary key as the partition key vs a business key such as a tenant: primary key spreads load evenly but separates related rows; a business key keeps related rows together and risks hot spots.", "More partitions vs fewer: more allow parallel consumers and bigger scale, but cost memory and make rebalancing and ordering across tables harder."],
    p: ["A single large tenant's changes land in one partition that falls behind while others sit idle.", "Partition count is increased and keys move, so the same row is processed on two consumers out of order."],
    v: "Update one row a thousand times and confirm every event is on one partition in the same order as the source. Spread ten thousand distinct keys and confirm partition sizes are within a small factor of each other.",
    dep: ["event-key", "event-transport"]
  },
  "ordering-guarantees": {
    s: "What order consumers can rely on: usually per-key order and commit order within a partition, but not a single global order across partitions or tables.",
    d: "The source's commit order is total, but spreading events across partitions retains only per-partition order. Within a key, order is preserved if the pipeline never reorders on retries and uses one writer per partition. Across keys and tables, order is lost unless consumers use event positions or transaction markers to reconstruct it. Retries that pass newer events while retrying older ones can break order unless the transport has bounded in-flight writes. The difficulty is making the guarantee explicit and testing it under retry and failover.",
    k: ["Per-key ordering vs global ordering: per-key scales across partitions and is enough for most state mirroring, while global order needs one partition and a throughput ceiling.", "Allowing multiple in-flight writes vs one at a time: multiple raise throughput, but a failed write can be retried after a later one, reordering events unless the transport enforces sequence."],
    p: ["A retry places an older update after a newer one and the sink ends with stale data.", "Consumers join two tables across partitions and assume cross-table order that does not exist."],
    v: "Under injected write failures and retries, update one row ten thousand times with a counter, and confirm the consumer sees the counter strictly increasing with no inversion.",
    dep: ["key-partitioning", "commit-order-sequencing"]
  },
  "transaction-boundary-events": {
    s: "Begin and end markers, carrying a transaction identifier and an event count, that let consumers re-group changes into the source's original transactions.",
    d: "The pipeline emits a marker before and after each transaction's changes, on a dedicated stream or inside the data events, and tags each change with the transaction identifier and its order within it. A consumer buffers events until the end marker arrives with a count that matches what it received, then applies them as a unit. Partitions complicate this because events of one transaction land on different partitions, so a consumer must collect from several. It is hard because it adds latency and state for consumers, and because markers can be filtered out.",
    k: ["Markers plus per-event transaction metadata vs row events only: markers allow atomic application and consistent reads, but force buffering; row events are simple and show intermediate states.", "Dedicated marker stream vs inline markers: dedicated keeps data streams clean, inline preserves exact order with the data."],
    p: ["Filtering drops tables from a transaction and the end marker's count no longer matches, so consumers wait forever.", "A consumer on one partition receives only part of a transaction and applies it as complete."],
    v: "Commit a transaction across four tables and confirm the markers bracket all events with a matching count, and that a consumer reading all partitions reconstructs the transaction identically.",
    dep: ["transaction-reassembly", "event-envelope"]
  },
  "at-least-once-delivery": {
    s: "The default guarantee: every committed change is delivered one or more times, never lost, with duplicates possible after a failure and replay.",
    d: "Because offsets advance only after downstream acknowledgment, a crash between delivery and acknowledgment leads to a replay of the unacknowledged tail. The result is no loss, with duplicates inside a bounded window. Consumers must be idempotent, or deduplicate using the event's source position. Transport-level retries add more duplicates. This is the practical baseline because it needs no distributed transaction between source and stream. The difficulty is that duplicates are rare, so consumer bugs with them are discovered in production.",
    k: ["At-least-once with idempotent consumers vs at-most-once: at-least-once never loses data and needs idempotent processing; at-most-once is simple and drops events on failure.", "Short acknowledgment batches vs long: short batches limit duplicate windows but cost throughput; long batches are faster and replay more."],
    p: ["A consumer that increments a counter per event double-counts after each pipeline restart.", "Duplicates appear only after crashes, so tests that never crash never see them."],
    v: "Kill the pipeline repeatedly during a stream of ten thousand changes, and confirm every change is present at the sink at least once, with duplicates only for events after the last acknowledged position.",
    dep: ["offset-commit", "event-transport"]
  },
  "exactly-once-processing": {
    s: "The effect of each change being applied exactly once at the destination, achieved by making delivery atomic with the offset commit or by making the writes idempotent.",
    d: "True exactly-once delivery across systems does not exist; exactly-once effect is built from at-least-once plus deduplication. Options: transactional writes to the stream with the offset committed in the same transaction; a sink that stores the source position with the data atomically and ignores replays; or idempotent keyed upserts. Each has scope limits: it holds only between the components that share the transaction. Hard because the guarantee silently weakens at any hop that lacks the mechanism.",
    k: ["Transactional writes tied to offsets vs idempotent sink writes: transactional gives clean semantics inside one system with a throughput cost, while idempotent writes work anywhere but only for overwriting operations.", "Storing source position at the sink vs relying on keys: position gives exact dedup for any operation, keys only dedup state-overwriting writes."],
    p: ["Exactly-once is enabled between capture and the stream, and the sink still double-applies increments.", "A transactional producer is fenced after a restart and the pipeline stalls until timeouts expire."],
    v: "Inject failures at every stage during a ten-thousand event run with non-idempotent operations such as increments, and confirm the final sink totals exactly equal the source totals.",
    dep: ["offset-commit", "idempotent-writes", "consumer-deduplication"]
  },
  "consumer-deduplication": {
    s: "A consumer-side check that discards events already applied, using the event's source position or an identifier to recognize a replay.",
    d: "Each event carries a position and a transaction identifier, so a consumer can store the highest position applied per source and per partition, and skip anything at or below it. Alternatively it keeps a bounded set of recent identifiers. The check and the state change must be one atomic action. Deduplication state itself is hard: it grows, must be durable and must be reset on a re-snapshot or position change, or else all new events are discarded.",
    k: ["High-water-mark per partition vs set of identifiers: a mark is tiny and exact when order is guaranteed, while an identifier set handles out-of-order delivery and costs memory.", "Dedup in the consumer vs in the pipeline: consumer-side is the only place that knows what was applied, pipeline-side cannot cover duplicates from consumer crashes."],
    p: ["After a re-snapshot the position resets and the consumer drops every new event as old.", "The mark is updated before the write and a crash loses the event permanently."],
    v: "Replay the last one hundred events to a consumer and confirm none are applied twice, then rewind to before the mark deliberately with a reset and confirm events are applied again.",
    dep: ["source-position-metadata", "idempotent-writes"]
  },
  "backpressure": {
    s: "How a slow consumer or transport slows capture instead of losing events or exhausting memory, by blocking at each bounded stage back to the source connection.",
    d: "Each stage has a bounded buffer. When the stream rejects writes or the sink is slow, the sender stops draining the internal queue, the queue fills, and the log reader stops reading, so the source's send buffer fills. The consequence is lag, which is visible, not loss. The cost is that log retention grows on the source. Pipelines may add rate limits or shed lower-priority tables. It is hard because backpressure stops the whole pipeline, one slow table delays every other table sharing the single log reader.",
    k: ["Blocking the reader vs dropping or spilling events: blocking is lossless and moves the cost into source retention; spilling to disk absorbs bursts but needs a recovery path and disk space.", "One shared pipeline vs one per table group: a shared pipeline reads the log once and one slow sink stalls everything, separate pipelines isolate sinks and read the log several times."],
    p: ["One slow consumer's table stalls capture for all tables and lag rises everywhere.", "Backpressure on the source connection triggers the source's timeout, which closes the stream."],
    v: "Throttle one sink to ten percent of the event rate and confirm queue depth rises to the limit, lag grows steadily, no events are lost, and recovery after unthrottling drains at a rate above the arrival rate.",
    dep: ["internal-event-queue", "log-reader"]
  },
  "event-envelope": {
    s: "The standard wrapper around every change: operation, before and after images, source metadata, timestamps and transaction information, in a fixed structure consumers can rely on.",
    d: "Each event has a key and a value. The value contains an operation code, the row state before and after, a source block (database, table, position, transaction identifier, commit time) and a timestamp for when the pipeline processed it. The structure is the same for every table, so generic consumers can route and apply without per-table code, while the row images carry the table-specific schema. It is hard to evolve: adding a field is easy, but changing semantics of a field already in use breaks every consumer.",
    k: ["A uniform envelope vs flat table-shaped events: an envelope serves generic tooling and carries metadata, but every consumer must unwrap it; flat events are simple and lose operation and position.", "Including full source metadata on every event vs only a position: full metadata aids debugging and auditing at the cost of bytes per event."],
    p: ["A consumer reads the after image of a delete event, which is null, and fails with a null reference.", "The timestamp of processing is confused with the commit time, so lag is computed wrongly."],
    v: "Capture one insert, update and delete and confirm each event has an operation code, correct before and after images, the table name, a position and a commit timestamp equal to the source's commit time.",
    dep: ["operation-types", "before-after-images", "source-position-metadata"]
  },
  "before-after-images": {
    s: "The row's state before and after a change, carried in the event, which lets consumers see exactly what changed and handle updates and deletes without looking the row up.",
    d: "An insert has no before image, a delete has no after image, and an update has both. Whether the before image is complete depends on the source's log detail settings. Consumers use it to compute differences, to remove old index entries or to undo. Large unchanged values may be omitted by the source and appear as a placeholder, which breaks consumers that need every column. Images double event size. It is hard because completeness varies by source configuration without visible warning.",
    k: ["Full before image vs key only: full enables diffs and audit and doubles size and log cost, key only is cheap and forces lookups for old values.", "Sending only changed columns vs the whole row: changed-only is smaller and consumers cannot reconstruct state without prior rows; whole row is self-contained."],
    p: ["Unchanged large columns arrive as placeholders and are written to the sink as literal placeholder text.", "The before image is empty for tables with no log detail setting and downstream audit shows blank old values."],
    v: "Update one column in a wide row and confirm the event's before and after images differ in exactly that column and are otherwise identical, including large text columns.",
    dep: ["log-detail-settings"]
  },
  "operation-types": {
    s: "The kinds of change an event describes: create, update, delete, plus snapshot reads, truncates and sometimes messages, each with its own consumer handling.",
    d: "The core operations are insert, update and delete. A snapshot read is distinguished from a live insert so consumers can tell initial load from new data. Truncate removes all rows at once without row events and is either emitted as one event or not captured. Some pipelines emit a tombstone after a delete so a compacted stream can drop the key. Primary-key updates may be split. It is hard because consumers must handle every type, and treating a snapshot read as an insert breaks counts and triggers.",
    k: ["Distinct snapshot-read operation vs reusing insert: distinct lets consumers suppress notifications for the initial load, but every consumer must know a fourth operation.", "Emitting truncate as an event vs not capturing: emitting lets sinks clear tables, while not capturing silently leaves them full."],
    p: ["A truncate on the source is not captured and the sink keeps millions of rows that no longer exist.", "A consumer sends welcome emails for every snapshot read it treats as a new insert."],
    v: "Insert, update, delete and truncate a table and confirm each is emitted with a distinct operation code, and that snapshot rows carry the read code and not the create code.",
    dep: ["event-envelope"]
  },
  "source-position-metadata": {
    s: "Fields on every event that identify where it came from in the source log: position, transaction identifier, commit time and sequence within the transaction.",
    d: "The metadata lets consumers deduplicate, order and audit events, and lets operators map any event back to the exact log record. It includes the log position, transaction identifier, ordinal within the transaction, source table, the commit time on the source, and a flag for snapshot events. Positions are comparable only within one source. It is hard because consumers come to depend on these fields, so changing their format is a breaking change, and because commit time depends on the source's clock.",
    k: ["Exposing positions to consumers vs hiding them: exposing enables dedup and auditing but couples consumers to source internals; hiding keeps the contract clean.", "Source commit time vs pipeline time: commit time measures true latency and relies on source clocks, pipeline time is local and cannot show the delay before capture."],
    p: ["Consumers parse the position string and break when the source is upgraded and the format changes.", "Commit times from a skewed source clock yield negative lag."],
    v: "Pick an event, use its position and transaction identifier to find the corresponding record in the source log, and confirm they refer to the same row change.",
    dep: ["source-position"]
  },
  "event-key": {
    s: "The identity of the changed row, built from its primary key columns, which determines partitioning, compaction and the destination's merge key.",
    d: "The key contains the primary key columns, or a configured set of columns if the table has no key. Equal keys mean the same logical row. The stream uses it for partition placement and compaction, which keeps only the latest event per key. Sinks use it as the upsert key. Keys must be stable: if a row's key changes, the identity changes. Tables with no key are the problem case, since without identity, updates and deletes cannot be applied downstream except by full-row matching.",
    k: ["Primary key as the event key vs a custom key: primary key is automatic and unique, a custom key can group related data but may not be unique.", "Including key column names in the key vs value only: names make keys self-describing and larger, values only are compact and need the schema."],
    p: ["A table without a key uses all columns and an update looks like a delete plus an insert of an unrelated row.", "Compaction on a non-unique key silently drops distinct rows."],
    v: "Update one row's non-key column ten times and confirm all ten events share the same key bytes, and a compaction leaves exactly one event for that key.",
    dep: []
  },
  "serialization-format": {
    s: "The binary or text encoding of events on the wire, chosen for size, speed and the ability to evolve its schema.",
    d: "Common choices are a self-describing text encoding such as JSON, or a compact binary encoding that needs a schema. Text is easy to inspect and large; binary is small and fast but needs the writer's schema to read. Schema-based formats pair with a registry: each message carries a schema identifier instead of the full schema. The format defines how nulls, decimals, timestamps and binary values appear. Hard because the encoding must handle every source type without loss, and consumers in several languages must read it identically.",
    k: ["Self-describing text vs schema-based binary: text is easy to debug and bulky with no enforced schema, while binary is compact and enforces compatibility but needs tooling.", "Embedding the schema in each message vs a registry reference: embedding is self-contained and wasteful, a registry is compact and becomes a dependency."],
    p: ["Large integers are encoded as numbers and silently lose precision in a consumer that uses floating point.", "Different consumers decode timestamps with different assumptions about zone and precision."],
    v: "Round-trip a row containing the extreme value of each type through the encoder and a consumer in a different language, and compare each field exactly to the source.",
    dep: ["value-type-mapping"]
  },
  "schema-registry": {
    s: "A service that stores every version of each event schema, assigns identifiers and checks compatibility, so producers and consumers agree on structure without embedding it.",
    d: "When the pipeline sees a new table shape it registers the schema under a subject and gets an identifier. Each event carries that identifier. Consumers fetch the schema by identifier and cache it. The registry enforces the compatibility policy at registration. It is a runtime dependency: if it is down, the pipeline cannot register new schemas, and consumers cannot decode unknown identifiers. It needs replication and its own durable store. The difficulty is treating a small service as critical infrastructure.",
    k: ["Central registry vs schemas in code: a registry lets teams evolve independently and checks compatibility, but adds a critical service; in code is simple and drifts between teams.", "Subject per table vs per stream: per table matches the data model, per stream is simpler and mixes versions."],
    p: ["The registry is unavailable during a restart and the pipeline cannot start, though the data path is healthy.", "Identifiers differ between registries in different environments, so replayed events cannot be decoded."],
    v: "Register a schema, publish events, delete the consumer's cache and confirm it refetches by identifier. Then register an incompatible schema and confirm it is rejected under the configured policy.",
    dep: ["serialization-format"]
  },
  "value-type-mapping": {
    s: "The rules for converting the source's data types to the event format's types, including decimals, timestamps with and without zones, binary, enumerations and geometric types.",
    d: "Each source type is mapped to a portable type with defined precision and representation: exact decimals as strings or scaled integers, timestamps as integers with unit, binary as bytes or encoded text, enumerations as strings, composite types as nested structures. Mappings may be configurable to trade fidelity for convenience. Unsupported types are skipped, stringified or fail. The difficulty is silent loss: timestamp precision truncated to milliseconds, zones dropped, floating point shown differently, and special values such as infinity or zero dates.",
    k: ["Lossless but awkward representations vs convenient native types: lossless keeps exact values and needs conversion in consumers, native is easy to use and can drop precision.", "Failing on unknown types vs emitting as strings: failing is safe and stops capture, stringifying keeps flowing with weaker types."],
    p: ["A decimal column is mapped to floating point and sums at the sink drift from the source.", "A zero date from the source breaks every consumer that parses timestamps."],
    v: "Insert rows with boundary values for every type and compare the event values and the sink values to the source with an exact comparison, including precision, zone and special values.",
    dep: []
  },
});
