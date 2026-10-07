// Details for the change data capture plate, part 1: source database interfaces and log reading.
ATLAS.details("change-data-capture", {
  "source-log-format": {
    s: "The database's own durable record of every committed change, written for crash recovery and replication, which a capture pipeline reads instead of querying the tables.",
    d: "The log is an append-only sequence of records, each carrying a position, a transaction identifier, an operation and the changed bytes. Some databases write physical page changes, which are compact but need the engine's internals to decode. Others write row-level or statement-level records that are easier to read. The log is rotated into segments and deleted after a retention window or when no replica needs it. Capture is hard because the format is built for the engine, not for outsiders, and may change between versions.",
    k: ["Physical page-level log vs row-level log: physical is smaller and cheaper for the database to write, but decoding it requires a decoder that understands storage internals; row-level costs more space but is directly interpretable.", "Reading the raw log vs a decoded stream the engine provides: raw access is flexible and version-dependent, while the engine's decoder is stable across versions but adds load to the source."],
    p: ["A database upgrade changes record layout and the parser silently misreads values or stops.", "Log segments are deleted before the pipeline reads them, leaving an unrecoverable gap."],
    v: "Insert, update and delete one known row, then dump the log region for that transaction and confirm three records appear with the expected operation types, table identifier and a position greater than the previous one.",
    dep: []
  },
  "replication-protocol": {
    s: "The network protocol by which a client asks the database to stream log records from a chosen position, the same mechanism its own replicas use.",
    d: "The client connects, authenticates, identifies itself as a replication consumer and requests a stream starting at a position. The server sends log records or decoded changes as they commit and expects periodic acknowledgments with the highest position the client has durably processed. Keepalive messages keep the connection alive while the log is quiet. It is hard because the server holds log segments until acknowledgment, so a slow or stuck client ties up disk, and because streams are tied to specific server versions.",
    k: ["Push streaming over a long-lived connection vs polling a change table: streaming has low latency and no extra table writes, but the connection must be supervised and resumed on every network blip.", "Acknowledging on receipt vs after downstream commit: early acknowledgment frees log space sooner, but a crash after it loses events that were never stored."],
    p: ["A client that connects but never acknowledges makes the source retain log until its disk fills.", "A proxy that closes idle connections kills the stream during quiet periods and looks like random failure."],
    v: "Start a client at a known position, commit ten rows on the source, and confirm ten events arrive with increasing positions. Then stop acknowledging and confirm the source reports retained log growing for that client.",
    dep: ["source-log-format", "network-and-tls"]
  },
  "log-detail-settings": {
    s: "Database settings that determine how much each log record contains, such as full row images, primary key only, or no before image, and so what a capture pipeline can reconstruct.",
    d: "By default a log may record only what recovery needs, such as new values without the old row. Capture needs more: the before image of updated and deleted rows, the primary key of each changed row, and sometimes values of unchanged large columns. Operators raise a table or database to a higher level of detail, which increases log volume. Settings are per table or per instance and may require a restart. The pitfall is that capture appears to work while delete events carry only a key and updates lack old values.",
    k: ["Full row images vs key-only images: full images give consumers complete before and after state but can multiply log volume for wide tables; key-only is cheap but forces consumers to look rows up.", "Instance-wide setting vs per-table setting: instance-wide is simple and consistent, per-table limits cost to the tables that need capture but is easy to forget on new tables."],
    p: ["A new table is created without the setting and its deletes arrive with no before image, breaking downstream filters.", "Raising detail on a hot table doubles log volume and exhausts disk or replication bandwidth."],
    v: "Update one column of a captured row and confirm the event contains the complete before image and the complete after image. Delete a row and confirm the event contains every column of the deleted row, not only its key.",
    dep: ["source-log-format"]
  },
  "capture-user-and-grants": {
    s: "The database account the pipeline connects as and the minimal privileges it holds: replication access, read access to the captured tables and permission to create its own bookkeeping objects.",
    d: "A dedicated account is created with the replication attribute, read grants on selected tables for snapshots, and possibly rights to create a publication or a slot. It should not be able to write business data. Grants must be extended when tables are added, which is easy to forget. Some systems also need the account to read catalog tables for schema. The hard part is least privilege: capture touches sensitive data across many tables, so the account is a prime target and its scope must match the capture scope.",
    k: ["Dedicated minimal account vs reusing an application account: dedicated limits damage and lets audit logs identify the pipeline, but needs grants maintained as tables change.", "Pipeline creating its own database objects vs operators pre-creating them: self-service is convenient, but it requires broader rights than most security teams will grant a long-lived account."],
    p: ["A new table is added to the capture list without a read grant and the snapshot fails only at 3 a.m.", "The pipeline account is given owner rights for convenience and a bug or leak can alter production data."],
    v: "Connect as the capture account and confirm it can start a replication stream and select from captured tables, and that an attempted insert into any table is rejected with a permission error.",
    dep: ["replication-protocol"]
  },
  "replica-reading": {
    s: "Capturing from a read replica or standby instead of the primary, to keep load off the primary at the cost of extra lag and extra failure modes.",
    d: "The pipeline connects to a replica that replays the primary's log, and reads either the replica's decoded stream or the log it received. This moves snapshot and decoding work away from the primary. The replica must support the necessary log detail level and, for some engines, logical decoding at all. Positions on the replica may differ from the primary's, so failover requires a position translation. The challenge is that the replica can lag, be promoted, or lose the events being captured when it is rebuilt.",
    k: ["Capture from the primary vs from a replica: primary gives the lowest latency and simplest positions, while a replica protects primary load but adds replication delay and a second system to fail.", "Reusing the same position after replica promotion vs re-snapshotting: reuse avoids a large reload but is only safe when positions are globally comparable."],
    p: ["The replica falls behind during a bulk load and lag alerts blame the pipeline.", "A replica is rebuilt from backup and its position space changes, so the stored offset points nowhere."],
    v: "Pause replay on the replica, commit a row on the primary and confirm no event appears; resume replay and confirm the event arrives with the lag reported equal to the pause length.",
    dep: ["replication-protocol", "log-detail-settings"]
  },
  "source-impact-limits": {
    s: "Controls that bound the load the pipeline places on the source: throttled snapshots, read concurrency limits, rate limits on streaming and quiet-hour scheduling.",
    d: "Capture adds load in three ways: reading the log, decoding on the server when the engine decodes, and running snapshot reads against live tables. The pipeline limits chunk size, parallelism and read rate, and may pause during peak hours. It watches source indicators such as replication connection count, lock waits and disk read latency. The difficulty is that the safe level is workload-specific, and a limit that protects the primary can slow the pipeline enough to threaten log retention.",
    k: ["Throttling the snapshot hard vs finishing fast: throttling protects production latency, but the longer the snapshot runs the more log must be retained and the longer the first results are delayed.", "Fixed rate limits vs adaptive limits driven by source health: fixed is predictable, adaptive uses idle capacity but can oscillate or starve under constant load."],
    p: ["An unthrottled initial load saturates disk I/O and slows every customer query.", "Limits are set conservatively and the snapshot never finishes before log segments expire."],
    v: "Run a snapshot against a loaded test source and confirm query p99 latency stays within the agreed margin, and that scan concurrency never exceeds the configured limit in the source's session list.",
    dep: ["connection-management"]
  },
  "connection-management": {
    s: "How the pipeline opens, holds, validates and retries its connections to the source, separating the long-lived streaming connection from short-lived snapshot and metadata sessions.",
    d: "There is typically one streaming connection that must stay open for days and several short query sessions for snapshots, schema reads and heartbeats. Each has a connection timeout, a read timeout, a keepalive interval and a retry policy with backoff. Connection pools are small on purpose, because the source has limits. After a drop, the pipeline reconnects and requests the stream from the last acknowledged position, not the last position it received. Hard cases are half-open connections, where one side thinks the stream is alive, and credential rotation mid-stream.",
    k: ["One streaming connection with strict reconnect vs several parallel streams: one keeps ordering trivial, parallel streams raise throughput but need partitioning and add source load.", "Aggressive reconnect vs exponential backoff: fast reconnect recovers quickly from blips, but hammers a source that is failing over and can trip lockouts."],
    p: ["A half-open connection looks healthy while no events arrive, and nothing alerts until lag grows.", "Reconnect resumes from the last received position, skipping events that were never acknowledged."],
    v: "Kill the network path for thirty seconds mid-stream, restore it, and confirm the pipeline reconnects within the configured backoff and resumes from the acknowledged position with no gap or duplicate beyond the allowed replay window.",
    dep: ["network-and-tls", "capture-user-and-grants"]
  },
  "network-and-tls": {
    s: "The path between pipeline and source: routing, firewalls and tunnels, plus encryption and certificate verification so change data is not exposed in transit.",
    d: "Change events contain complete row data, so the link is as sensitive as the database itself. The pipeline connects over TLS with certificate validation and optionally client certificates, through private networking, peering or a tunnel. Timeouts and keepalives are set to survive idle periods on the path. Cross-region or cross-cloud capture adds latency that directly raises lag and cost per gigabyte. It is hard because failures look like database problems: an expired certificate or a stateful firewall dropping idle flows appears as repeated disconnects.",
    k: ["Encrypted private link vs public endpoint with TLS: a private link reduces exposure and latency variance, but needs network engineering and coordination between accounts.", "Verifying the full certificate chain vs accepting any certificate: verification prevents interception, but expiry and rotation then become outage causes that need monitoring."],
    p: ["A certificate expires on a weekend and the pipeline reconnects in a loop until someone notices the lag.", "A firewall drops idle connections after five minutes and keepalives are set longer than that."],
    v: "Capture a packet trace of the stream and confirm no row data is readable in plaintext, then present an invalid certificate and confirm the connection is refused rather than silently accepted.",
    dep: []
  },
  "log-reader": {
    s: "The component that connects to the source and pulls raw log records in order from a requested position, and hands them to parsing and decoding.",
    d: "It opens the streaming connection, requests records from a start position, tracks the highest position received and sends acknowledgments for the highest position durably handled. It runs a tight loop so the source's send buffer does not fill. It either receives decoded changes from the engine or raw physical records. Its main responsibilities are position bookkeeping, keepalive replies and handing records to the next stage in order. It is hard to get right because it must be fast, single-threaded to preserve order, and never advance the acknowledgment ahead of what is safely stored.",
    k: ["Single reader thread vs parallel readers per table: single preserves global log order and is simple, but a CPU-bound decoder caps throughput at one core.", "Reading ahead into a large buffer vs reading on demand: read-ahead keeps the source buffer drained, but increases memory use and the amount of work lost on a crash."],
    p: ["The reader stalls on a slow downstream stage, fills the source's send buffer and the source disconnects it.", "Acknowledging records still in the memory buffer lets a crash drop events permanently."],
    v: "Commit one thousand rows in one transaction and confirm the reader reports a received position at the end of that transaction, and the acknowledged position trails it until downstream confirms.",
    dep: ["replication-protocol", "internal-event-queue"]
  },
  "logical-decoding": {
    s: "A database-provided facility that converts physical log records into logical row changes on the server, through a pluggable output format, so clients need not parse storage internals.",
    d: "The server reads its own log, uses its catalog to map storage records to tables and columns, and emits row-level changes in committed order through an output plugin. The plugin chooses the encoding: text, binary or structured. The stream is bound to a named position holder that the server uses to retain log. Decoding costs source CPU and memory, especially for large transactions that the server must buffer until commit. The difficulty is that decoding shares the primary's resources and the plugin must be installed on the server.",
    k: ["Server-side decoding vs client-side log parsing: server decoding is stable across versions and handles the catalog for you, but spends source CPU and needs a plugin installed; client parsing offloads work but needs deep knowledge of the format.", "Text plugin output vs binary output: text is easy to debug, binary is smaller and faster but harder to inspect."],
    p: ["A very large transaction is decoded on the source, spills to disk and slows the primary.", "The output plugin is missing after a database upgrade, and the stream fails to start."],
    v: "Create a decoding session, commit a multi-row transaction and confirm the output shows a begin, one change per row in order, and a commit with a position, and that rolled-back changes never appear.",
    dep: ["source-log-format", "log-detail-settings"]
  },
  "log-record-parser": {
    s: "Decodes raw log records into typed row changes: it identifies the table, the operation and the column values, and converts engine-native binary values into portable types.",
    d: "Each record is read according to the engine's format version: header, transaction identifier, table identifier, then column values in binary. The parser looks up the table's column list and types as of that log position, decodes each value, and handles special cases such as unchanged large values stored out of line, compressed values and null bitmaps. It emits an internal row change object. It is hard because every type has edge cases, such as time zones, decimal scales and binary collations, and because it must use the schema in effect at the record's position.",
    k: ["Decode all columns eagerly vs lazily: eager is simple and validates everything, while lazy saves CPU when most columns are filtered out later but delays discovering corrupt values.", "Strict failure on unknown record types vs skipping them: strict never loses data silently, but a new engine feature can halt capture; skipping keeps flowing and risks missed changes."],
    p: ["A column is decoded with the current schema rather than the schema at the record's position and yields garbage after a type change.", "Out-of-line large values are missing from the record and appear as a placeholder rather than the real data."],
    v: "Replay a recorded log segment containing every supported column type and compare each decoded value against the source row read through a normal query; all values must match including nulls, decimals and timestamps.",
    dep: ["log-reader", "schema-at-position", "value-type-mapping"]
  },
  "in-flight-transaction-buffer": {
    s: "Holds the changes of transactions that have started but not yet committed, because the log interleaves records from many transactions and only commit tells you which to emit.",
    d: "As records arrive the buffer groups them by transaction identifier in memory. At commit it releases that transaction's changes as one ordered unit; at abort it discards them. Because the log is written in the order operations happen, not the order transactions commit, the buffer is the only way to emit committed order. Large transactions exceed memory, so the buffer spills to disk or switches to streaming mode. The difficulty is bounded memory against unbounded transaction size, and recovering the buffer after a crash.",
    k: ["Buffering until commit vs streaming in-progress changes: buffering gives atomic, rollback-free output, but latency for big transactions equals their whole duration; streaming reduces latency but pushes abort handling to consumers.", "Memory-only buffer vs spill to disk: memory is fast but one huge transaction can exhaust the process; spill is safe but adds I/O and a recovery path."],
    p: ["A bulk update of tens of millions of rows exhausts memory and the process is killed repeatedly at the same position.", "After restart the buffer is empty but the resume position is past the transaction's start, so its early changes are lost."],
    v: "Open a transaction, change one hundred rows, and confirm no events appear. Commit it and confirm all one hundred appear together. Repeat with a rollback and confirm none appear.",
    dep: ["log-record-parser"]
  },
  "transaction-reassembly": {
    s: "Combines buffered records of one transaction into a single ordered group with begin and end markers, so consumers can see an atomic unit.",
    d: "At commit, the capturer takes the transaction's buffered changes in log order, attaches its identifier, commit position and commit time, and passes them on as a group. If the pipeline exposes transaction boundaries, it emits explicit begin and end events with an event count so consumers can detect missing parts. Reassembly must handle changes to several tables and interleaved subtransactions. It is hard because the log splits one logical transaction into many pieces over time, and any piece lost means the unit is no longer atomic.",
    k: ["Emit transactions as groups with markers vs as independent row events: groups let consumers apply atomically, but force them to buffer; independent events are simple and may expose half-applied states.", "Including per-table event counts in the end marker vs only a total: counts allow detecting loss per table, at the cost of a more complex marker."],
    p: ["Consumers apply events from one source transaction in separate batches and users briefly see inconsistent data.", "The end marker is sent before all events are acknowledged and a crash leaves a transaction half delivered."],
    v: "Commit a transaction touching three tables with five changes, and confirm the output shows one begin, five ordered changes in log order and one end event reporting a count of five.",
    dep: ["in-flight-transaction-buffer", "commit-order-sequencing"]
  },
  "commit-order-sequencing": {
    s: "Ensures transactions are emitted in the order they committed, which differs from the order they started, so downstream state follows the same history as the source.",
    d: "Each commit record carries a position that totally orders commits on one source. The capturer releases transactions only when their commit record is seen, so output follows commit order automatically. Across multiple logs, such as sharded or multi-writer sources, there is no single order, so the pipeline either merges by commit timestamps with a tolerance or provides only per-shard order. The hard part is that wall-clock timestamps from different nodes disagree, and a safe merge must wait for the slowest source.",
    k: ["Total order on a single log vs partial order across shards: total order is easy to reason about, while per-shard order scales out but consumers must tolerate cross-shard interleaving.", "Merging shards by timestamp with a wait vs delivering immediately: waiting yields a near-global order at the cost of latency tied to the slowest shard."],
    p: ["Clock skew between shards reorders two dependent updates and a consumer ends with the older value.", "A silent shard stops advancing and the merge waits forever, stalling the whole pipeline."],
    v: "Start two transactions, commit the later-started one first, and confirm output order matches commit order. Then update the same row from both and confirm the final state at the sink equals the source.",
    dep: ["in-flight-transaction-buffer"]
  },
  "rollback-and-savepoints": {
    s: "Handles aborted transactions and partial rollbacks to a savepoint, so changes later undone never reach consumers.",
    d: "Rolled-back work appears in the log as records followed by an abort marker, or as records followed by a savepoint rollback that cancels only the later part. The buffer tracks subtransaction identifiers, and when a savepoint is rolled back discards only its records. At commit, remaining subtransaction records are merged in log order. Some engines write aborted changes only to the log and never mark them clearly; others undo them with compensating records. The danger is emitting early or misattributing a rollback, which shows consumers rows that never existed.",
    k: ["Discard aborted changes in the capturer vs forward them with an abort flag: discarding keeps consumers simple, but streaming mode needs the flag so consumers can undo.", "Tracking subtransactions explicitly vs treating a transaction as flat: explicit tracking is correct for savepoint-heavy code but adds state; flat handling mis-emits partial rollbacks."],
    p: ["An application that retries inside savepoints emits phantom rows that were rolled back.", "Subtransaction identifiers are reused after a restart and records are attributed to the wrong parent."],
    v: "Begin a transaction, insert a row, set a savepoint, insert a second row, roll back to the savepoint and commit. Confirm only the first insert is emitted. Repeat with a full rollback and confirm nothing is emitted.",
    dep: ["in-flight-transaction-buffer"]
  },
  "long-transaction-handling": {
    s: "Policies for transactions that stay open for minutes or hours, which hold back log retention, grow the buffer and delay every later transaction's visibility.",
    d: "The capturer cannot advance its safe position past the start of the oldest open transaction, because on restart it would need to re-read that transaction's early records. So one idle open transaction on the source can pin the resume position and the retained log. The pipeline tracks the oldest open transaction, alerts on age, and may use a streaming mode that emits changes before commit. Large batch jobs create the same pressure. The difficulty is the conflict between atomic output and bounded memory and retention.",
    k: ["Wait for commit vs stream in-progress changes: waiting preserves atomic delivery, while streaming bounds memory and latency but makes every consumer handle aborts.", "Killing long transactions on the source vs tolerating them: killing protects the pipeline, but it breaks applications that legitimately run batch work."],
    p: ["A forgotten session left idle in a transaction pins the log for days until disk is full.", "Restarting the pipeline during a long transaction replays it from the start and doubles the load."],
    v: "Open a transaction and leave it idle. Confirm the pipeline reports the oldest open transaction age rising, and that retained log size on the source grows until the transaction ends.",
    dep: ["in-flight-transaction-buffer", "log-retention-interaction"]
  },
  "log-retention-interaction": {
    s: "The coupling between how long the source keeps log segments and how far behind the pipeline is: if the log is deleted first, the pipeline cannot resume.",
    d: "Sources delete log segments by age, size or because every registered consumer has passed them. A pipeline's position is either protected by a slot that blocks deletion or unprotected and subject to retention. Protection prevents loss but means a stalled pipeline fills the source's disk. Without it, long outages lose the position. The pipeline must therefore compare its position to the oldest available log at startup and decide whether to resume or re-snapshot. The difficulty is choosing which resource to risk: source disk or pipeline completeness.",
    k: ["Protected retention via slot vs time-based retention only: a slot guarantees no gaps but can fill the source's disk; time-based retention is safe for the source but loses data after long outages.", "Alerting on retained size vs on lag: size tracks the source's real risk, lag tracks consumer experience, and both are needed."],
    p: ["A decommissioned pipeline leaves its slot behind and the source runs out of disk months later.", "Retention is shortened for cost reasons and a three-hour outage now exceeds it."],
    v: "Stop the pipeline for longer than the retention window while writing to the source, restart it, and confirm it detects that its position is gone and refuses to resume silently, requiring a snapshot.",
    dep: ["replication-slot-management", "source-log-format"]
  },
  "trigger-and-query-capture": {
    s: "Alternatives to reading the log: database triggers that write changes to a table, or timestamp and version columns polled by queries.",
    d: "Trigger capture installs triggers on each table that insert a change row into an outbox-style table, which the pipeline reads. Query-based capture polls with a predicate such as modified-after-timestamp. Both work on databases without accessible logs, but they add write cost to every transaction, miss deletes unless soft-deleted, and can miss changes with equal timestamps or in-flight transactions. They are simple to start and hard to make correct. They also change the schema and application behavior in ways log capture does not.",
    k: ["Log-based capture vs trigger-based capture: log capture leaves tables untouched and sees every change, while triggers work without log access but slow writes and require maintenance with each schema change.", "Polling a modified-timestamp column vs triggers: polling needs no schema changes beyond the column, but cannot see deletes or intermediate states between polls."],
    p: ["A bulk load disables triggers for speed and the changes are never captured.", "Polling with a timestamp misses rows committed with an earlier timestamp than the last poll's high-water mark."],
    v: "Insert, update and delete a row and compare the captured set to the source's actual sequence of changes. Any missed delete or collapsed intermediate update shows the method's limits.",
    dep: ["connection-management"]
  },
});
