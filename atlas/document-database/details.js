// Details for the document database plate, part 1: lifecycle, administration, clients, security.
ATLAS.details("document-database", {
  "logical-export": {
    s: "Reads documents through the normal query path and writes them to a portable file, so data can be moved between versions, clusters or other systems.",
    d: "An export tool opens a cursor per collection and writes each document in an extended JSON or binary stream, plus index definitions and options. Import reverses it, inserting in batches and rebuilding indexes afterward. Because it goes through the query layer, it works across versions and storage formats. It is hard at scale: it competes with live traffic for cache, it is slow for large data, and without a snapshot read concern it captures a moving target that was never a consistent state.",
    k: ["Logical export vs snapshot copy: logical output is portable across versions and selectable by collection; it is far slower to take and restore, and rebuilds every index.", "Extended JSON vs raw binary: text keeps type fidelity readable and diffable; it is larger and slower to parse than the native encoding."],
    p: ["Exporting a busy collection without a snapshot gives a file that mixes states from different moments, which no real point in time ever had.", "Type information lost in plain JSON turns dates and integers into strings on import."],
    v: "Export a collection, import it into an empty cluster, and compare document counts, a per-collection checksum of sorted documents, and the list of index definitions.",
    dep: ["cursor-management", "document-model"]
  },
  "snapshot-backup": {
    s: "A copy of the data files taken at one moment from the storage layer or a disk snapshot, restorable by starting a server on the copy.",
    d: "The storage engine can be quiesced or can expose a consistent checkpoint, after which a volume snapshot or file copy captures all data and journal files. Restoring starts a server on those files and lets recovery replay the journal. Backups are normally taken from a secondary to spare the writer. The hard part is consistency across shards: each shard snapshots at a slightly different time, so a cluster-wide restore needs a coordinated cut or a later operation log replay to align them.",
    k: ["Volume snapshots vs file copy: snapshots are near instant and cheap; they depend on the platform and need journal and data on the same consistent volume.", "Back up a secondary vs the primary: the secondary spares the writer; it may lag, so the backup can be older than expected."],
    p: ["Snapshotting each shard independently produces a cluster state that never existed, with chunk migrations half done.", "Data and journal on separate volumes snapshotted at different instants restore as corruption."],
    v: "Take a snapshot, restore it on a new host, start the server, and confirm it opens cleanly, journal recovery completes, and a count and checksum query match the source at the snapshot time.",
    dep: ["checkpoints", "write-ahead-journal", "replica-set"]
  },
  "point-in-time-recovery": {
    s: "Restores a database to an exact earlier moment by loading a snapshot and replaying logged operations up to the chosen timestamp.",
    d: "Recovery starts from the latest snapshot before the target time, then applies archived operation log entries in order, stopping at the requested timestamp. Operations are idempotent, so replaying over a slightly later snapshot is safe. It is used after human errors such as a dropped collection or a bad migration. It is hard because the log must be unbroken from the snapshot onward, and in a sharded cluster every shard must stop at the same logical time.",
    k: ["Snapshot plus log replay vs frequent full snapshots: replay gives second-level granularity for little storage; restore time grows with the log to be applied.", "Stopping by timestamp vs by operation id: timestamps are easy to choose from an incident; ties and clock differences make exact boundaries fuzzy."],
    p: ["A gap in the archived log makes every restore past the gap impossible, usually discovered only during an incident.", "Replaying past the destructive command because the chosen time was a few seconds late."],
    v: "Insert marker documents, drop a collection, then restore to a timestamp between them in a scratch cluster and confirm the collection exists with exactly the markers inserted before that time.",
    dep: ["snapshot-backup", "oplog-archive", "oplog"]
  },
  "oplog-archive": {
    s: "Continuously copies the replication log to durable external storage so there is an unbroken record of changes between snapshots.",
    d: "Because the operation log is a capped collection, old entries are overwritten. An archiver tails it, batches entries and uploads them to object or file storage with sequence checks, keeping a manifest of covered time ranges. The archive is what makes point-in-time recovery possible. The difficulty is continuity: if the archiver falls behind the operation log window, entries are lost, and entries that were rolled back on a primary must not be archived as if they were committed.",
    k: ["Tailing the live operation log vs periodic operation log dumps: tailing leaves small gaps in recovery; dumps are simpler but widen the recovery point and can miss entries when the window is short.", "Archive only majority-committed entries vs everything: committed-only avoids rolled-back writes; it adds a small delay."],
    p: ["Archiver downtime longer than the operation log window silently breaks the chain of recoverable time.", "Archiving writes later rolled back puts phantom operations into a restore."],
    v: "Compare the archive manifest with the operation log's first and last timestamps: every interval between snapshots must be covered with no gaps, and a test replay must reach the latest archived time.",
    dep: ["oplog", "majority-commit-point"]
  },
  "restore-validation": {
    s: "Routinely restores backups into an isolated environment and checks them, because an untested backup is an unproven claim.",
    d: "A scheduled job picks the latest snapshot and archive, restores to scratch machines, starts the server, runs integrity validation on collections and indexes, compares counts and checksums with the source, and measures how long recovery took. Results are recorded against recovery-time targets. It is hard because it consumes real infrastructure, requires production-sized storage, and must also exercise keys and credentials the restore depends on.",
    k: ["Full restore test vs metadata-only verification: a full restore finds real faults; it costs time and storage equal to the data set.", "Automated schedule vs manual drills: automation catches silent decay; manual drills exercise human procedures that automation skips."],
    p: ["Backups that restore but whose encryption keys have been rotated away cannot be read.", "Measuring only that the restore started, not that the data validates."],
    v: "A scheduled restore completes in the target time, collection validation reports no errors, and sampled documents plus counts match the source captured at the snapshot time.",
    dep: ["snapshot-backup", "point-in-time-recovery"]
  },
  "ttl-deletion-task": {
    s: "A background task that periodically scans TTL indexes and deletes documents whose expiry time has passed.",
    d: "Once a minute or so, the task walks each TTL index from the oldest value, deleting documents older than the index's expiry. Deletes are ordinary writes: they are logged, replicated and visible to change streams. Only the primary runs the deletions. It is hard because deletion is not instant, may fall behind under load, and generates write and journal volume that competes with foreground traffic when many documents expire at once.",
    k: ["Delete in batches per pass vs delete everything due: batching bounds latency impact; expiry then lags behind during bursts.", "Time-based expiry vs dropping whole time-bucketed collections: TTL deletes are simple but expensive per document; dropping a bucket is nearly free but needs bucket management."],
    p: ["Treating the expiry time as exact: expired documents remain readable until the task reaches them.", "A mass expiry at one instant causes a spike of deletes and replication lag."],
    v: "Insert documents with expiry in the past and confirm they disappear within about one task period on the primary and then all secondaries, and that a change stream shows the delete events.",
    dep: ["ttl-index", "oplog"]
  },
  "time-series-collections": {
    s: "A collection type that groups measurements by source and time into compact buckets, optimized for append-heavy sensor and event data.",
    d: "Incoming measurements with a time field and a source key are packed into bucket documents covering a time span, with columnar-style arrays per field and an automatically maintained index on source and time. Queries unpack buckets transparently. Older buckets can expire by policy. It is hard because bucketing is invisible: out-of-order inserts reopen buckets, high-cardinality sources create many tiny buckets, and updates to individual measurements are limited.",
    k: ["Bucketing by source and time vs one document per measurement: buckets cut storage and index size sharply; point updates and deletes become awkward.", "Fixed bucket span vs adaptive span: fixed spans are predictable; adaptive spans fit irregular rates at the price of complexity."],
    p: ["Using a source key with millions of distinct values creates near-empty buckets and wipes out the savings.", "Backfilling old data out of order forces repeated bucket rewrites."],
    v: "Insert one million measurements for a thousand sources, then compare on-disk size with a plain collection of the same data and confirm a time-range query for one source returns correct results.",
    dep: ["binary-encoding", "block-compression", "ttl-deletion-task"]
  },
  "capped-collections": {
    s: "A fixed-size collection that keeps insertion order and automatically overwrites the oldest documents when it fills.",
    d: "Space is preallocated as a circular buffer. Inserts append, and when the limit is reached the oldest documents are removed to make room. Reads return documents in insertion order, and tailable cursors can wait for new data. The replication log itself is of this kind. It is hard because it forbids operations that change a document's size, restricts deletes, and cannot be sharded, so it only suits bounded logs and queues.",
    k: ["Size-bounded circular storage vs unbounded growth with deletion jobs: capped is simple and predictable; data you still need is lost silently when it wraps.", "Tailable cursor vs polling: tailing delivers new items quickly; the cursor dies if its position is overwritten."],
    p: ["Sizing for average rate rather than burst rate lets a burst overwrite data before consumers read it.", "Expecting to update documents to larger sizes, which is rejected."],
    v: "Insert documents beyond the capacity and confirm only the newest remain in insertion order, and that a tailable cursor receives a new insert without polling.",
    dep: ["record-store", "cursor-management"]
  },
  "server-status-metrics": {
    s: "A command and metric stream exposing counters for operations, connections, memory, cache, locks and replication, used to chart and alert on server health.",
    d: "Each server keeps in-memory counters updated on hot paths and returns them as a structured document on request. Agents poll it periodically and compute rates from deltas. Replica set and shard status commands add lag, member state and chunk counts. It is hard to interpret: cumulative counters reset on restart, averages hide spikes, and the same symptom, such as slow queries, has many causes visible only across several metrics.",
    k: ["Cumulative counters vs preaggregated rates: counters are cheap and exact; consumers must handle restarts and wrap.", "Pull polling vs push export: polling is simple and uniform; short spikes between polls are missed."],
    p: ["Alerting on a raw cumulative counter rather than its rate.", "Monitoring only the primary and missing a secondary that is falling behind."],
    v: "Run a known workload of one thousand inserts and confirm the insert counter rises by exactly one thousand, then confirm replication lag and cache usage metrics change plausibly.",
    dep: ["thread-model", "page-cache"]
  },
  "query-profiler": {
    s: "Records the plans, timings and documents examined for operations above a threshold into a system collection that can be queried afterward.",
    d: "At operation end the server compares elapsed time to a threshold, or samples a fraction, and writes a profile entry with the filter shape, plan summary, keys and documents examined, rows returned and lock or cache waits. Entries live in a capped collection per database. The ratio of examined to returned is the key signal. It is hard because profiling adds write load, is per-database, and logging full filters can expose sensitive values.",
    k: ["Threshold profiling vs sampling: a threshold finds every slow operation; sampling bounds overhead but may miss rare offenders.", "In-database profile collection vs external logs: queryable with the normal language; the data is lost when the capped collection wraps."],
    p: ["Leaving level 2 profiling on in production adds a write for every operation.", "Reading only duration and ignoring examined-to-returned ratio, which identifies missing indexes."],
    v: "Run a query with no supporting index and confirm a profile entry shows a collection scan with documents examined far above returned; add the index and confirm the ratio drops to about one.",
    dep: ["query-planner", "explain-output"]
  },
  "slow-operation-log": {
    s: "A text log of operations that exceeded a duration threshold, with query shape, plan summary and resource usage, written by every node.",
    d: "When an operation finishes above the threshold the server writes a structured line to its log with namespace, command shape, duration, keys examined and queue times. Logs are shipped to central storage and searched. They exist on every node, including routers, so slow cluster-wide queries can be correlated by operation id. It is hard because volume is large under load and parameter values may be redacted, making similar shapes hard to attribute.",
    k: ["Always-on slow log vs on-demand profiling: the log is free of extra writes and persistent; it has less structure than profile entries.", "Redacting literal values vs keeping them: redaction protects data; it removes the very values that make a query slow."],
    p: ["Log rotation discarding the incident window before anyone reads it.", "Setting the threshold so low that logging itself slows the server."],
    v: "Issue a deliberately slow query and confirm one structured log line appears on the executing node with its duration above the threshold and a plan summary.",
    dep: ["command-dispatch", "explain-output"]
  },
  "operation-control": {
    s: "Commands to list running operations with their age and state, and to terminate a chosen operation safely.",
    d: "Every running command registers itself in an operation table with its client, namespace, elapsed time, lock state and a stable id. Operators list them, filter long-running ones and ask the server to kill one, which sets a flag checked at yield points so execution unwinds and releases resources. In a cluster the router forwards a kill to each shard. It is hard because kill is cooperative, so stuck operations may linger, and killing writes mid-way can leave partial effects.",
    k: ["Cooperative kill at yield points vs forceful termination: cooperative kill is safe for internal state; it may not act quickly in code that never yields.", "Server-side maximum execution time vs operator kill: automatic limits protect against runaway queries; they can cut off legitimate long reports."],
    p: ["Killing a multi-step index build or migration without understanding that it must be cleaned up.", "Killing the router-side cursor while shard-side work continues."],
    v: "Start a long scan, list operations to find it, kill it by id, and confirm the client receives an interruption error and the operation disappears from the list within one yield interval.",
    dep: ["command-dispatch", "thread-model"]
  },
  "config-system": {
    s: "The set of startup options and runtime parameters that control memory, networking, security and behavior, with rules about which can change live.",
    d: "Settings come from a configuration file, command-line options and runtime commands, with a defined precedence. Each parameter either applies live or needs a restart. The server reports the effective value. Replica set and cluster membership configurations are separate, versioned documents agreed through the replication protocol. The risk is divergence: nodes in one set started with different options silently behave differently.",
    k: ["Static file vs runtime commands: files are reviewable and reproducible; runtime changes are instant but are lost on restart unless also written to the file.", "Per-node config vs replicated cluster config: node settings tune hardware; replicated config stays consistent but changes only through a majority-agreed update."],
    p: ["A runtime change that never reaches the file reverts at the next restart.", "Cache size tuned for one machine size is copied to a smaller one and causes memory pressure."],
    v: "Change a live parameter, read it back from the server and confirm the new value with its source, then restart and confirm whether it persisted as documented.",
    dep: []
  },
  "rolling-upgrades": {
    s: "Upgrading a cluster one member at a time so it stays available, using feature compatibility settings to keep old and new versions interoperable.",
    d: "Secondaries are upgraded first, one by one, then the primary is stepped down and upgraded. Sharded clusters upgrade metadata servers, then shards, then routers. A compatibility version flag stays at the old value until all members run the new binary, then is raised to enable new on-disk and protocol behavior. It is hard because raising the level can be irreversible in practice, and downgrade requires removing features that use new formats.",
    k: ["Rolling upgrade vs full-cluster restart: rolling keeps the service available; it needs a compatibility window and careful ordering.", "Raising the compatibility level immediately vs waiting: immediate unlocks new features; waiting keeps downgrade possible."],
    p: ["Raising the compatibility level before all nodes are upgraded makes the old nodes reject operations.", "Upgrading the primary before secondaries, causing an election into a version mismatch."],
    v: "Upgrade members one by one while a test client keeps writing with majority write concern and confirm no acknowledged write is lost and failover completes within the election timeout.",
    dep: ["replica-set", "primary-election", "config-system"]
  },
  "client-driver": {
    s: "The library inside an application that builds commands, serializes documents, manages connections and implements the client side of consistency and retry rules.",
    d: "The driver exposes a language-native API, converts native objects to the binary encoding, keeps a monitor per server, maintains pools, selects servers, attaches session and concern options and decodes replies into cursors. Most semantic behavior, from retry to read preference, is defined by a published specification so all languages agree. It is hard because it holds distributed-systems logic in application processes, and an outdated driver can misbehave against a newer cluster.",
    k: ["Smart driver vs thin proxy: a smart driver connects directly and avoids a hop; every application inherits topology logic and upgrade burden.", "Convenience object mapping vs raw documents: mapping speeds development; it hides query shapes and can encourage fetching whole documents."],
    p: ["Creating a new client per request, so each call pays for discovery and connection setup.", "Running a driver version that lacks support for the server's current protocol features."],
    v: "Start the application, run an operation, and confirm in server logs one connection per pool member, a handshake with the driver version, and the expected command with its concerns attached.",
    dep: ["connection-pool", "topology-discovery", "server-selection", "wire-protocol", "client-side-retries"]
  },
  "connection-pool": {
    s: "A bounded set of reusable server connections per node that applications borrow for each operation instead of reconnecting.",
    d: "The pool opens connections lazily up to a maximum, hands them to operations, and returns them afterward, closing idle ones after a timeout. Each connection is authenticated and encrypted once. When the pool is exhausted, operations wait in a queue with a timeout. It is hard because the server spends memory and a thread or task per connection, so many application instances multiplied by pool size can exhaust the server, and pool waits are easily mistaken for slow queries.",
    k: ["Large pool vs small pool: large pools absorb bursts; they multiply server connection load and hurt tail latency under contention.", "Eager warm-up vs lazy creation: warm pools avoid first-request delay; they hold connections that may never be used."],
    p: ["A fleet of many small services each with a default-size pool overruns the server's connection limit.", "A long-running operation holding a connection for a whole transaction starves other requests."],
    v: "Under load, confirm the server's current connection count stays below the product of instances and pool size, and that pool wait time metrics stay near zero at expected concurrency.",
    dep: ["authentication", "transport-encryption", "network-layer"]
  },
  "topology-discovery": {
    s: "Continuously learns which servers exist, which is the writer and how fast each responds, by monitoring them in the background.",
    d: "From a seed list, the driver opens a monitoring connection to each server and sends periodic hello commands. Replies list members, roles, tags, wire version and the election term. Streaming monitors receive pushed changes. The driver maintains a topology description that is updated as members join, leave or change role. It is hard because it must tolerate stale or contradictory replies during elections, and use the election term to ignore old primaries.",
    k: ["Streaming monitoring vs polling: streaming detects changes immediately; it needs a persistent connection and server support.", "Seed list only vs service-name lookup: lookup lets operators change membership without touching clients; it adds a naming dependency."],
    p: ["Seed addresses that are not reachable from the application network, though members advertise internal names.", "Trusting a reply from an old primary after a new election."],
    v: "Step down the primary and confirm the driver's topology description shows the new primary within about the monitoring interval, with the higher election term, while writes resume.",
    dep: ["replica-set", "primary-election", "wire-protocol"]
  },
  "server-selection": {
    s: "The driver rule that picks one eligible server for each operation based on role, tags, staleness and measured latency.",
    d: "For each operation the driver filters servers by the read preference mode (primary, secondary, nearest and variants), tag sets and a maximum staleness, then chooses among those within a latency window of the fastest, randomly or with load-aware picking. If none is eligible it waits and retries until a selection timeout. In a sharded cluster the same logic selects among routers. The hard part is behavior during failovers and partitions, when no server may qualify.",
    k: ["Nearest vs primary: nearest cuts latency and spreads load; reads may be stale.", "Strict tag requirements vs fallbacks: strict tags keep data local to a region; if that region is down, reads fail instead of falling back."],
    p: ["Secondary reads with no staleness bound serve data minutes old during a replication backlog.", "Selection timeout shorter than an election makes every failover surface as errors."],
    v: "Run reads with a secondary preference and confirm from server logs they hit secondaries; stop the primary and confirm writes fail within the selection timeout until a new primary is elected.",
    dep: ["topology-discovery", "read-preference"]
  },
  "wire-protocol": {
    s: "The message format over TCP in which commands and replies travel as binary documents, with compression and flags negotiated at connection time.",
    d: "Each message has a header with length, request id and an operation code, followed by sections: a command document and optionally bulk document sequences. A handshake advertises version range, compression algorithms and features. Replies carry the status, the result document or a cursor id. It is a stable boundary between drivers and servers, so evolution must remain backward compatible. It is hard to trace: a single slow reply may be waiting on the network, a queue or the engine.",
    k: ["Binary encoded commands vs a text protocol: binary parses faster and preserves types; it is harder to inspect by hand.", "Optional compression vs always off: compression saves bandwidth across regions; it burns CPU on both ends and hurts small low-latency messages."],
    p: ["Messages larger than the maximum size are rejected unexpectedly because a batch of large documents was not split.", "Mismatched version ranges after a partial upgrade cause obscure handshake failures."],
    v: "Capture traffic or enable command tracing for one insert, and confirm the message contains the expected command document, a request id echoed in the reply, and a status that matches the client result.",
    dep: ["binary-encoding", "network-layer"]
  },
  "command-dispatch": {
    s: "The server component that receives each request, finds the named command, checks authorization and runs it on a worker with the right session and concerns.",
    d: "After decoding, the dispatcher identifies the command, validates arguments, resolves the session and any transaction, applies authorization checks, sets read and write concerns and then invokes the command's handler. Replies are encoded with status and timing. Cross-cutting rules such as maximum execution time, failpoints and operation tracking live here. It is hard because every command shares this path, so a small slowdown or a missed check affects all traffic.",
    k: ["One generic dispatch path vs per-command shortcuts: one path makes security and observability uniform; it adds a fixed cost to the cheapest operations.", "Checking authorization before vs after parsing the full body: early checks fail fast; some checks need the parsed target namespace."],
    p: ["A new command added without declaring its required privileges, becoming callable by any authenticated user.", "A hung handler holding its worker, with no deadline set."],
    v: "Send a command as a user without the required privilege and confirm an unauthorized error, then as an authorized user and confirm it runs, with both visible in the operation log and audit trail.",
    dep: ["role-based-access", "wire-protocol", "thread-model"]
  },
  "cursor-management": {
    s: "Server-side state that remembers where a query stopped so clients can fetch results in batches, with timeouts that clean up abandoned cursors.",
    d: "The first reply returns a batch and a cursor id when more results remain. The server keeps the execution plan, its position and a snapshot in memory. The client fetches subsequent batches with that id, which is bound to the session and user. Idle cursors expire after a timeout. In a cluster the router keeps a cursor that merges shard cursors. The cost is memory and open snapshots: a cursor can pin old versions in the storage engine.",
    k: ["Server-held cursor vs stateless range queries: cursors are cheap for the client and see a consistent view; the server pays memory and must clean up.", "Short idle timeout vs long: short timeouts reclaim resources quickly; slow consumers see cursor-not-found errors."],
    p: ["Application reads half of a large result set and abandons it; the cursor holds a snapshot until it times out.", "Batch sizes too small cause chatty round trips on high-latency links."],
    v: "Open a cursor, read one batch, wait past the idle timeout and confirm the next fetch fails with cursor-not-found; confirm the open-cursor count metric returns to its prior level.",
    dep: ["command-dispatch", "mvcc-versioning"]
  },
  "client-side-retries": {
    s: "Automatic resending of safe operations after transient errors such as network failures or elections, within a time budget.",
    d: "When an operation fails because the connection dropped or the primary stepped down, the driver can select a server again and resend once. For writes it attaches a session and transaction number so the server can recognize a repeat and not apply it twice. Reads are retried because they are naturally repeatable. Time budgets bound total waiting. The hard part is knowing what is safe: an unacknowledged write may or may not have been applied.",
    k: ["Retry once automatically vs surface every error: one retry hides routine failovers from applications; it hides error rates that may point to real instability.", "Retrying only idempotent operations vs everything: restricting avoids duplicates; it leaves some write types exposed to failover errors."],
    p: ["Application-level retry loops layered on top of driver retries multiply load during an outage.", "Retrying an update that is not idempotent when the server did apply the first attempt."],
    v: "Force a primary step-down during a stream of writes with retries enabled and confirm no errors reach the application, every write applied exactly once, and total documents match the count sent.",
    dep: ["retryable-writes", "server-selection", "topology-discovery"]
  },
  "authentication": {
    s: "Proves who a connecting client is, using mechanisms such as challenge-response passwords, certificates or tokens from an external identity service.",
    d: "During or after the handshake the client runs an authentication exchange. Password mechanisms use salted challenge-response so the secret is never sent. Certificate mechanisms identify the client by the subject of its TLS certificate. External mechanisms validate tokens or directory credentials. Servers within a cluster authenticate each other with keys or certificates. It is hard to operate: rotating secrets across many drivers, and keeping internal member authentication consistent during upgrades.",
    k: ["Password challenge-response vs certificates: passwords are easy to start; certificates avoid stored shared secrets and rotate with the PKI at higher setup cost.", "Local users vs external identity provider: external providers centralize joiner and leaver handling; the database then depends on their availability."],
    p: ["Running with authentication disabled because it was off in development and nobody turned it on.", "Shared service credentials that cannot be rotated without redeploying every client."],
    v: "Connect without credentials and confirm commands beyond the handshake are rejected; connect with valid credentials and confirm success; connect with a revoked identity and confirm failure.",
    dep: ["transport-encryption"]
  },
  "role-based-access": {
    s: "Grants each identity a set of roles, each role a set of privileges on resources, so access is limited to what the work needs.",
    d: "A privilege names a resource, such as a database, collection or the cluster, and the actions allowed on it. Roles bundle privileges and can inherit from other roles. Users hold roles. The command dispatcher checks privileges for every operation, including those inside pipelines. Collection-level rules and views allow finer access. It is hard because aggregation stages that read other collections need separate privileges, and custom roles accumulate until nobody can say what they permit.",
    k: ["Built-in roles vs custom roles: built-ins are well understood; custom roles fit least privilege but drift without review.", "Views as access filters vs document-level security in the application: views hide fields on the server; they do not give per-user row filtering without per-user logic."],
    p: ["Granting a broad built-in role to a service for convenience, so a leaked credential can read everything.", "Forgetting that an aggregation lookup can read a collection the user has no direct access to."],
    v: "Create a user with read-only on one database and confirm reads there succeed, writes fail, and a read on another database is rejected, with each denial recorded in the audit log.",
    dep: ["authentication"]
  },
  "transport-encryption": {
    s: "Encrypts every connection between clients and servers, and between cluster members, with TLS and certificate validation.",
    d: "Servers present certificates, and clients validate the chain and the host name. Mutual TLS also validates client certificates. Cluster members use their own certificates for internal traffic. Protocol versions and cipher suites are restricted by policy. It is hard operationally: certificates expire, host names must match what members advertise, and a rotation must reload certificates on every member without dropping connections.",
    k: ["Require TLS everywhere vs allow plaintext on private networks: requiring it protects against internal threats; it adds CPU cost and certificate operations.", "Mutual authentication vs server-only: mutual TLS gives strong client identity; it requires issuing and rotating client certificates."],
    p: ["An expired certificate takes down all connections at once, often at night.", "Disabling host name verification to get past an error, which removes protection against impersonation."],
    v: "Attempt a plaintext connection and confirm refusal; connect with a client lacking the trusted authority and confirm a handshake failure; capture traffic and confirm no readable document content.",
    dep: ["network-layer"]
  },
  "encryption-at-rest": {
    s: "Encrypts data files and journals on disk with a master key held in an external key manager, so stolen disks or backups are unreadable.",
    d: "The storage engine encrypts each page or block before writing, using per-database data keys that are themselves encrypted by a master key from a key management service or local file. Journals and backups are also protected. Keys are fetched at startup and can be rotated by re-wrapping data keys or re-encrypting data. It is hard because losing the key means losing the data, and the server sees plaintext in memory, so it protects only against theft of storage.",
    k: ["Engine-level encryption vs volume encryption: engine-level keys are per database and travel with backups; volume encryption is transparent but protects only the volume.", "Rotating the master key vs rotating data keys: master rotation is quick (re-wrap keys); data key rotation rewrites all data."],
    p: ["Key manager outage at startup prevents a node from opening its data after a restart.", "Backups copied out with their data but without the key reference, which makes them unrestorable."],
    v: "Inspect raw data files with a hex viewer and confirm known document text is absent; restart with the key service reachable and confirm normal startup, then unreachable and confirm a clean startup failure.",
    dep: ["storage-engine-interface", "block-compression"]
  },
  "client-side-field-encryption": {
    s: "Encrypts chosen fields in the driver before they leave the application, so the server and its administrators only ever see ciphertext.",
    d: "The driver encrypts configured fields with data keys stored in a key vault collection, wrapped by a key from an external manager. Deterministic encryption allows equality lookups; randomized encryption does not. Some designs support limited range or prefix queries through special index structures. The server stores opaque binary values. It is hard because queries and indexes are limited by what ciphertext reveals, and changing which fields are encrypted needs migration.",
    k: ["Deterministic vs randomized encryption: deterministic lets the server match equal values; it leaks equality and frequency patterns.", "Client-side vs server-side encryption: client-side removes the server from the trust boundary; the server can no longer filter, sort or aggregate on those fields."],
    p: ["Encrypting a field that later needs range queries, forcing a full re-encryption.", "Losing access to the key vault makes the fields permanently unreadable."],
    v: "Insert a document with an encrypted field, read it through the driver and confirm plaintext, then read it through a plain connection and confirm only binary ciphertext is returned.",
    dep: ["client-driver", "binary-encoding"]
  },
  "audit-logging": {
    s: "A tamper-resistant record of security-relevant events: logins, failed access, privilege changes, schema changes and optionally reads and writes.",
    d: "The server emits structured events from the dispatcher and the authentication and authorization layers, filtered by configurable rules, to a file, system log or collector. Each event has the user, source address, command, target namespace and result. It is kept apart from ordinary logs so retention can be set by compliance. It is hard because auditing every read and write is expensive, and high-volume filters need thought to capture what matters.",
    k: ["Audit all operations vs only administrative actions: full capture satisfies strict rules; it multiplies log volume and slows hot paths.", "Local file vs forwarded stream: local is simple; forwarding protects the record from an attacker with node access."],
    p: ["Logs stored on the same host that an intruder controls can be edited or deleted.", "Filtering too narrowly, so a data leak by a legitimate role is never recorded."],
    v: "Create a user, fail a login and drop a collection, then confirm each appears in the audit stream with user, source, timestamp and result, and cannot be altered by a database user.",
    dep: ["authentication", "role-based-access", "command-dispatch"]
  }
});
