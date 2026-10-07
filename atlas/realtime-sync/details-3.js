// Details for the real-time sync plate, part 3: sync protocol, conflict resolution, data model, server functions.
ATLAS.details("realtime-sync", {
  "message-framing": {
    s: "How messages are delimited, typed and encoded on the wire, including binary versus text formats and compression, so both sides can parse a stream of mixed requests and updates.",
    d: "Each message carries a type, an identifier for matching responses to requests, a subscription id and a payload. Text encodings such as JSON are easy to debug and larger; compact binary encodings cut size and parse cost at the price of tooling. Streams are length-prefixed or use the transport's own frames, and large payloads may be split and reassembled. Compression across messages helps a lot on repetitive documents, but costs memory per connection. The challenge is evolving the format without breaking old clients.",
    k: ["Binary encoding vs JSON text: binary is smaller and faster to parse, but harder to inspect and needs schema tooling; text is universal and verbose.", "Per-connection compression context vs per-message compression: shared context compresses repetitive streams far better, but holds tens of kilobytes of state per connection."],
    p: ["A message type is added without a fallback and old clients drop the connection on seeing it.", "Compression state for 500,000 connections consumes more memory than the data being sent."],
    v: "Capture a session and replay it through an independent parser of the documented format. Compare bytes on the wire for a representative update stream under each encoding and confirm the chosen one meets the bandwidth target.",
    dep: ["protocol-versioning"]
  },
  "subscription-handshake": {
    s: "The opening exchange in which a client names a query and its last known position, and the server validates, authorizes and registers it and replies with how it will catch the client up.",
    d: "The client sends the query, parameters, the subscription id and, if resuming, a cursor. The server checks the query against allowed shapes and rules, registers it and decides whether to send a snapshot or a delta from the cursor. It replies with the starting position and any errors, such as a rejected query or an expired cursor. Making this a single round trip matters on slow links. The difficulty is idempotence: a handshake repeated after a reconnect must not create a duplicate subscription.",
    k: ["Client picks the subscription id vs server assigns it: client ids let requests be pipelined and retried safely, but need uniqueness rules; server ids are simple and need a round trip.", "Validate queries against a declared set vs allow any query: declared queries are cheap to authorize and optimize, but restrict developers; arbitrary queries are flexible and harder to defend."],
    p: ["A retried handshake after a timeout registers the subscription twice and every change arrives in duplicate.", "An error reply is lost and the client waits forever for a result that was never going to arrive."],
    v: "Send the same handshake twice with the same id and confirm one subscription exists. Send an invalid query and confirm an error is returned with its reason within the timeout.",
    dep: ["subscription-registry", "sync-cursors", "authorization-rules"]
  },
  "initial-snapshot": {
    s: "The first full result of a subscription, delivered consistently as of one position in the change feed, so deltas can be applied on top without gaps or duplicates.",
    d: "The server evaluates the query at a known position and sends the result, often in chunks for large sets, tagged with that position. Changes after the position are buffered and sent after the snapshot completes. If the query runs for a while, the feed advances meanwhile, and the snapshot must still be consistent. Systems get consistency by reading from a point-in-time view, or by running the query then replaying the feed from the starting position. Large snapshots strain memory, bandwidth and the client's main thread.",
    k: ["Read from a consistent point-in-time view vs query live and reconcile via the feed: point-in-time views are simple to reason about, but need storage support; reconciling works on any store and needs careful deduplication.", "Send results in chunks vs one message: chunks bound memory and let the screen fill progressively, but the client must handle partial results."],
    p: ["A change made while the snapshot was being built is missed by both the snapshot and the buffered deltas.", "A million-document snapshot arrives in one message and freezes a mobile client."],
    v: "Write continuously to a collection while 100 clients subscribe, and confirm each client's final state after its snapshot plus deltas equals the server's state at the same position, with no missing or duplicated documents.",
    dep: ["live-query-engine", "snapshots-checkpoints", "sync-cursors"]
  },
  "delta-messages": {
    s: "Messages that describe one change to a subscription's result, such as add, update or remove, tagged with positions so a client can apply them in order.",
    d: "After the snapshot, each message carries a position, the subscription it concerns and the operations to apply. Operations name the document and give either a full new body or a patch. Positions let a client detect a missed message: a jump means a gap, and the client asks the server to replay or restarts. Messages may be batched and are applied atomically so the client never sees half of a multi-document transaction. Evolving the operation set without breaking clients is the hard part.",
    k: ["Whole-document updates vs field patches: whole documents are simple and robust to missed messages, but waste bandwidth; patches are small and depend on the client having the previous version.", "One message per change vs batches per transaction: batches preserve atomic visibility, but delay the first change until the batch completes."],
    p: ["A transaction touching three documents arrives as three messages and the interface shows an impossible intermediate state.", "A patch is applied twice after a retry and a list field gets the same element appended again."],
    v: "Run a transaction that updates three documents and confirm every subscriber receives one atomic message. Drop a message from the stream and confirm the client detects the gap and recovers to the correct state.",
    dep: ["sync-cursors", "result-diffing", "transactions"]
  },
  "sync-cursors": {
    s: "Positions in the ordered change history, expressed as sequence numbers, timestamps or version vectors, that tell both sides exactly which changes have been seen.",
    d: "A server with one ordered log can use a single increasing number. With several partitions or writers, a cursor is a vector with one component per source, and comparing two cursors tells whether one has seen everything the other has. Clients store the cursor with their data and send it on reconnect. Cursors must be compact and opaque enough to change internally. Hard parts are cursor growth with the number of sources, validity across partition splits, and cursors from before a data migration.",
    k: ["Single global sequence number vs per-partition version vectors: one number is tiny and simple, but needs a single ordering point that limits scale; vectors scale and grow with partitions.", "Server-issued opaque cursors vs client-visible structure: opaque cursors let the server evolve, but are not diagnosable by clients."],
    p: ["A repartition changes the vector's components and old cursors become unusable, forcing every client to resync at once.", "Cursors are compared as strings instead of by their structure and an old position looks newer."],
    v: "Record a cursor, make changes across partitions, and resume from it. Confirm the replayed set equals exactly the changes after the cursor, including across a partition split performed in between.",
    dep: ["write-ahead-log", "partitioning"]
  },
  "acks-and-flow-control": {
    s: "Acknowledgements that tell the server what the client has applied and windows that limit how much can be in flight, so slow clients are not flooded and lost data is found.",
    d: "Clients ack positions periodically instead of per message. The server uses acks to free its retransmit buffers, to know where to resume, and to measure client lag. A window limits unacknowledged data per connection; when it is full the server stops sending or coalesces. Acks for writes are separate and confirm durability, not delivery. The hard part is that acking on receipt is not the same as acking after applying and persisting locally, and the difference decides what gets lost on a client crash.",
    k: ["Ack after local persist vs on receipt: acking after persist prevents loss on a crash, but delays the ack and the release of server buffers.", "Cumulative acks vs per-message acks: cumulative acks are cheap and cannot report single gaps; per-message acks are precise and heavy."],
    p: ["The client acks messages it has only buffered in memory, crashes, and the server believes they were applied.", "No window is enforced and one slow client makes the server hold gigabytes of unacknowledged data."],
    v: "Crash a client between receipt and local persistence and confirm on restart it requests the unpersisted range and ends consistent. Throttle a client and confirm server buffering stays inside the window.",
    dep: ["backpressure", "sync-cursors"]
  },
  "idempotency-keys": {
    s: "Unique identifiers on writes that let the server recognize a retry and return the original result instead of applying the change a second time.",
    d: "The client generates a key per write, usually a random id or a client id plus a sequence number, and stores it with the queued write. The server records the key with the outcome, atomically with the write itself, for some retention period. A repeated key returns the stored outcome. With per-client sequence numbers the server can also detect gaps and enforce order. The hard parts are storage and retention: remembering every key forever is costly, while forgetting early lets a very late retry be applied twice.",
    k: ["Random keys vs per-client sequence numbers: random keys are simple and need a lookup table; sequences are compact and also detect gaps and reordering, but need client state to be reliable.", "Retain keys for a fixed window vs forever: a window bounds storage, but retries beyond it are unsafe."],
    p: ["The key is checked and the write applied in two steps, so two concurrent retries both pass the check.", "A client reinstall resets its sequence counter and the server rejects its new writes as duplicates."],
    v: "Send the same write 50 times concurrently and confirm exactly one change is committed and all callers receive the same result. Replay a key after the retention window and confirm the documented behavior.",
    dep: ["transactions", "primary-store"]
  },
  "protocol-versioning": {
    s: "The rules for changing the wire protocol while old and new clients coexist, covering negotiation, optional features and how long old versions stay supported.",
    d: "Mobile and embedded clients upgrade slowly, so a server may talk to a dozen protocol versions at once. The handshake exchanges versions and capability flags, and both sides use the highest common set. New fields are additive and optional, and unknown ones are ignored. Breaking changes need a new version and a deprecation period with usage telemetry. The costs are test matrices and compatibility code in the hot path, and the discipline of never changing the meaning of an existing field.",
    k: ["Capability flags vs a single version number: flags let features roll out independently, but combinations multiply test cases; a number is simple and forces all-or-nothing upgrades.", "Support old versions for a long period vs force upgrades: long support keeps users working, but keeps old code and its bugs alive."],
    p: ["A field is reinterpreted in a new release and old clients silently misread updates.", "Nobody measures old-version usage, so removal is delayed indefinitely or breaks a quiet but real customer."],
    v: "Run a matrix of the oldest supported client against the newest server and each version between, executing connect, subscribe, write and resume, and confirm all pass. Check usage telemetry before removing a version.",
    dep: []
  },
  "last-writer-wins": {
    s: "A resolution rule that keeps the change with the latest timestamp and discards the other, the simplest policy and the one that quietly loses edits.",
    d: "Each write carries a timestamp, and on conflict the larger one is kept per document or per field. It needs no merge logic, no history and tiny metadata. Its flaws are clocks and loss: client clocks can be wrong, so server-assigned or hybrid timestamps are used, and a concurrent edit that loses is simply gone without any notice. Applied per field, it preserves non-overlapping edits. It is a good fit for settings and status values, and a poor one for text and lists.",
    k: ["Per-document LWW vs per-field LWW: per-document is simplest and discards a whole edit on conflict; per-field keeps edits to different fields and can combine them into states no one intended.", "Server timestamps vs client timestamps: server time is trustworthy and needs a round trip; client time works offline and can be skewed or forged."],
    p: ["A client with a clock set a year ahead wins every conflict until its changes are manually corrected.", "Two users edit different parts of one text field offline and one user's whole paragraph silently disappears."],
    v: "Make two clients edit the same field offline with known timestamps, reconnect them in either order, and confirm both converge on the same value, the one with the later timestamp, regardless of arrival order.",
    dep: ["hybrid-logical-clocks", "document-model"]
  },
  "hybrid-logical-clocks": {
    s: "Timestamps combining physical time with a logical counter, so they stay close to real time yet always respect cause and effect even when device clocks disagree.",
    d: "Each node keeps a clock value of physical time plus a counter. On a local event it advances; on receiving a message it takes the maximum of its own and the sender's value and increments the counter. The result is monotonic, orders causally related events correctly, and stays within a bound of wall time. Timestamps are comparable across nodes without coordination and serve as version stamps. Hard parts are guarding against a single wildly wrong clock pulling every other node forward, and counter overflow under bursts.",
    k: ["Hybrid clocks vs pure physical time: hybrid clocks never order an effect before its cause and need a few extra bytes; physical time is simple and breaks with skew.", "Hybrid clocks vs vector clocks: hybrid is compact and gives a total order, but cannot detect concurrency; vectors detect it and grow with participants."],
    p: ["A node with a clock far in the future poisons every peer's timestamps because they all advance to match it.", "Timestamps are generated by the client and trusted, so a modified client can always win conflicts."],
    v: "Generate events on nodes whose physical clocks differ by minutes, exchange messages, and confirm that every effect carries a later timestamp than its cause and no timestamp exceeds real time by more than the configured bound.",
    dep: []
  },
  "operational-transform": {
    s: "A technique for collaborative editing in which each edit is a small operation and concurrent operations are rewritten against one another so everyone's intent is preserved.",
    d: "Operations such as insert at position or delete range are sent to a central server that gives them a total order. When an operation was made against an older state, the server transforms it over the operations it missed, adjusting positions, before applying and broadcasting it. Clients do the same for operations they have not yet had confirmed. The result is that all replicas converge. It is fast and compact but intricate: transform functions must satisfy convergence properties for every pair of operations, and bugs are subtle.",
    k: ["Central server ordering vs peer-to-peer: a server simplifies transform correctness and enables authorization, but is a single ordering point; peer-to-peer needs much harder algorithms.", "Operation-based OT vs state-based CRDTs: OT keeps metadata small and needs a central sequencer; CRDTs work without one and carry more per-character state."],
    p: ["A transform function that is wrong for one rare operation pair makes replicas diverge permanently.", "The server restarts and loses the operation history needed to transform late clients' edits."],
    v: "Run a randomized test with several simulated clients applying concurrent insertions and deletions through the server for thousands of rounds, and confirm every replica holds an identical document at the end.",
    dep: ["server-arbitration", "causal-ordering"]
  },
  "crdts": {
    s: "Data types designed so that replicas applying the same updates in any order converge to the same state, enabling merging without a central coordinator or locks.",
    d: "State-based types merge by a join that is commutative, associative and idempotent; operation-based types require each operation to commute. Common types include counters, sets with add and remove tags, registers, maps and sequences for text. Replicas can edit offline and exchange updates peer-to-peer or through a server. The cost is metadata: sequences keep identifiers for every element and tombstones for deletions, so memory and history grow, and compaction needs agreement that no replica still needs old entries.",
    k: ["CRDTs vs operational transformation: CRDTs need no central sequencer and work offline and peer-to-peer, but keep per-element metadata and complicate garbage collection.", "Whole-document CRDT vs CRDT only for hot fields: whole-document merging gives a uniform model with high storage cost; targeted use limits metadata to fields that really get concurrent edits."],
    p: ["Tombstones for deleted elements are never collected and a long-lived document grows to many times its visible size.", "Merging produces results that are consistent but surprising, such as interleaved text from two people typing in the same place."],
    v: "Apply the same set of updates to several replicas in different random orders and confirm all end in an identical state. Measure document size after a million edits and confirm it is within the planned bound after compaction.",
    dep: ["causal-ordering", "history-compaction", "hybrid-logical-clocks"]
  },
  "field-level-merge": {
    s: "Merges concurrent edits to different fields of one document, instead of choosing one whole document, so that independent changes by two people both survive.",
    d: "The system tracks changes per field, or per path in nested data, rather than per document. When two changes are concurrent, those that touch distinct fields are combined; those that touch the same field go through a rule such as latest wins or a type-specific merge like add-wins for sets. Clients send field patches instead of full documents. The difficulty is invariants that span fields: two valid field edits can combine into an invalid document, such as a start date after an end date.",
    k: ["Field-level merge vs whole-document last-writer-wins: field merge keeps independent edits and loses less data, but can produce combinations no user saw or validated.", "Per-field metadata vs per-document version: per-field timestamps enable precise merging and multiply metadata size."],
    p: ["Two valid edits combine into a document that violates a cross-field rule and breaks code that assumed the rule.", "Patches use positions in arrays, so concurrent array edits merge into nonsense."],
    v: "Edit field A on one offline client and field B on another, reconnect both, and confirm the document has both edits on all replicas. Edit the same field on both and confirm the documented rule decides.",
    dep: ["last-writer-wins", "schema-validation", "delta-messages"]
  },
  "server-arbitration": {
    s: "Letting the server decide the outcome of conflicting writes using application logic, so rules like inventory limits or balances are enforced and clients are told when they lose.",
    d: "Rather than merging blindly, writes are submitted as intents to a server function that sees the current state and either applies, adjusts or rejects them. The decision is serialized per document or per partition, which gives strong invariants. Clients predict the outcome optimistically and are corrected when the server disagrees. It fits data with real constraints, such as stock counts or seat bookings. It is slower than merge-based approaches, needs connectivity to finalize, and shifts the burden of conflict design onto application code.",
    k: ["Server arbitration vs automatic merge: arbitration enforces business rules exactly, but needs the server for every final decision; automatic merge works offline and cannot know the rules.", "Reject conflicting writes vs rebase and retry them: rejection is predictable and pushes retry to users; rebase retries invisibly and may surprise them."],
    p: ["Two offline users both book the last seat, both see success locally, and one is rejected hours later with no good way to explain it.", "The arbitrating function is slow and serializes all writes on a hot document, collapsing throughput."],
    v: "Submit 100 concurrent purchases against 10 units of stock and confirm exactly 10 succeed, the rest are rejected with a clear reason, and every client's final view shows stock zero.",
    dep: ["mutation-handlers", "transactions"]
  },
  "causal-ordering": {
    s: "Ensures that a change is applied only after the changes it depended on, so replicas never show an effect before its cause, such as a reply before the message it answers.",
    d: "Updates carry metadata naming what the sender had seen, such as a version vector or a set of dependency ids. A receiver holds an update back until its dependencies have been applied, then releases it. This guarantees cause precedes effect without forcing a single global order. Concurrent updates may still arrive in different orders on different replicas, which is acceptable for commutative types. The costs are metadata that grows with participants and buffering of out-of-order updates, which can stall if a dependency never arrives.",
    k: ["Causal delivery vs total order: causal order is cheaper and available offline, but replicas can see concurrent changes in different orders; total order needs a sequencer.", "Explicit dependency lists vs version vectors: lists are precise and can grow large; vectors are bounded by participants and over-approximate."],
    p: ["An update waits forever for a dependency that was garbage collected and everything behind it stalls.", "Version vectors grow with every device ever used and dominate the size of small updates."],
    v: "Deliver a generated set of causally related updates to replicas in random order and confirm that none is ever applied before its dependencies and all replicas finish with the same state.",
    dep: ["sync-cursors", "hybrid-logical-clocks"]
  },
  "history-compaction": {
    s: "Discards or merges old operations, tombstones and version metadata once every replica has moved past them, keeping merge-capable data from growing without bound.",
    d: "Conflict-free data accumulates history: deleted elements, per-field timestamps, operation logs. Compaction rewrites that history into a smaller equivalent, usually a snapshot plus recent operations. It is only safe when no replica could still send an update that refers to the removed part, so it needs a stable point agreed by all replicas, or a rule that offline clients past a certain age must resync from scratch. The trade is between storage savings and the ability to merge with long-offline clients.",
    k: ["Compact at an agreed stable point vs on a time limit: a stable point is safe and can be blocked by one offline replica; a time limit always makes progress and forces very old clients to resync.", "Keep history for audit and undo vs minimal state: history enables undo and forensics at a high storage cost."],
    p: ["Compaction removes a tombstone that a long-offline client later references and its update resurrects deleted data.", "A device that was offline for six months pushes changes against a compacted base and corrupts the document."],
    v: "Edit a document a million times, compact, and confirm size falls to the target while all replicas still read identically. Then merge a client last seen before the cutoff and confirm it is forced to resync instead of merging.",
    dep: ["crdts", "snapshots-checkpoints"]
  },
  "document-model": {
    s: "The shape of stored data: self-contained records with nested fields, identified by a key, which suits subscriptions because one document is one unit of change and access.",
    d: "A document is a structured value of scalars, arrays and nested maps, stored under an id within a collection. Reads and writes are per document, and a change event describes one document. Nested data lets related fields be updated atomically and read together. Limits on size and depth keep updates cheap. The model is hard to get right because it ties together what can be queried, what can be secured at once, and what is rewritten on each change: a very large document makes every small edit expensive to send and conflict-prone.",
    k: ["Nest related data inside one document vs reference separate documents: nesting reads and updates atomically in one unit, but grows documents and widens conflicts; references keep documents small and need joins.", "Schemaless values vs typed fields: flexible shapes speed early work, and typed fields enable validation, indexing and safe client code."],
    p: ["A chat room stored as one document with all messages inside makes every message conflict with every other.", "Fields are added without any plan and queries and rules fail on documents missing them."],
    v: "Write a document, read it back through each interface, and confirm identical content. Edit two different nested fields from two clients concurrently and confirm both edits persist and one change event per document is emitted.",
    dep: ["collection-hierarchy", "identifier-generation"]
  },
  "collection-hierarchy": {
    s: "How documents are grouped and nested into collections and sub-collections, which determines both how queries are scoped and how access rules and storage are partitioned.",
    d: "Documents live in named collections, optionally nested under a parent document, giving paths such as a user's collection of notes. A query targets one collection, or the same name across parents. Paths drive security rules, which can be written at each level, and often drive partitioning, since data under one parent tends to be stored together. The hierarchy is hard to change later, because paths are embedded in rules, indexes, clients and links.",
    k: ["Deep hierarchy vs flat collections with parent fields: hierarchy gives natural scoping and security and makes cross-parent queries awkward; flat collections query anywhere and need explicit ownership fields.", "Collection-scoped queries only vs queries over all same-named collections: scoped queries are cheap and predictable; group queries are powerful and need special indexes."],
    p: ["A path layout chosen for one screen blocks a later screen that needs the data grouped differently.", "Moving a document to another parent changes its path and breaks every stored reference to it."],
    v: "Create documents under two parents, query each parent's collection, and confirm only that parent's documents are returned. Run the grouped query and confirm both are returned only where rules allow.",
    dep: ["document-model"]
  },
  "schema-validation": {
    s: "Checks that a document matches declared types and constraints on every write, so bad data is rejected at the server before it reaches other clients.",
    d: "A schema declares fields, types, required values, ranges and allowed shapes. The server validates each write after applying it to the current document and before commit, so partial updates are checked in their final form. Because older client versions write older shapes, the schema evolves through additive changes and migrations. Validation runs on the hot write path and must be fast. Its value is large for live data, since one invalid document can crash every client that renders it.",
    k: ["Enforced server-side schema vs client-side checks only: server enforcement protects every client including old and hostile ones, but needs migrations; client checks are easy and unenforceable.", "Strict rejection vs accept and flag: strict rejection keeps data clean and blocks old clients; flagging keeps writes flowing and leaves bad data to clean up."],
    p: ["A new required field rejects every write from clients that have not updated and the app seems broken.", "Validation runs on the patch and not the merged document, so combined changes slip through."],
    v: "Submit a write with a wrong type, a missing required field and an out-of-range value and confirm each is rejected with a specific error and no change event is emitted. Submit a valid one and confirm it commits.",
    dep: ["document-model"]
  },
  "references-and-relations": {
    s: "How documents point to each other and how those links are followed, including whether subscriptions can follow a reference or must fetch the target separately.",
    d: "A reference stores another document's path or id. Following it is a second read, and subscribing to both means two subscriptions, or a query that includes the related data. Some systems offer server-side joins whose results are kept live; most prefer denormalization, copying needed fields into the referring document and updating copies when the source changes. Each choice trades read cost against write cost and consistency. The hard part is that a live join must watch every document involved.",
    k: ["Denormalize by copying fields vs follow references at read time: copies make reads and subscriptions simple, but updates must fan out to every copy; references stay consistent and cost extra reads.", "Live server-side joins vs client-side joins: server joins return one coherent result, and need dependency tracking across collections; client joins are simple and can show mismatched states."],
    p: ["A user renames themselves and old copies of their name remain in thousands of documents because the update fan-out was never written.", "A reference points to a deleted document and the client shows an error instead of a graceful blank."],
    v: "Change a source document that is copied into 1,000 others and confirm all copies update within the target time and subscribers to any of them see the new value. Delete a target and confirm referrers handle it without errors.",
    dep: ["document-model", "change-triggers"]
  },
  "identifier-generation": {
    s: "How document ids are created, typically by clients without asking the server, so that records can be made offline and written without collisions.",
    d: "Clients generate identifiers locally using random values or time-ordered values with a random suffix, large enough that collisions are negligible. Time-ordered ids sort roughly by creation and keep index inserts append-like, while fully random ids spread writes across the key space. Sequential ids from the server are small and need a round trip and a single counter. Ids also appear in paths, urls and rules, and are visible to users, so they must not leak counts or allow guessing of neighboring records.",
    k: ["Client-generated random ids vs server-issued sequential ids: client ids allow offline creation and optimistic updates, but are long and unordered; sequential ids are compact and need the server.", "Time-ordered ids vs fully random ids: time order gives efficient range scans and a hot write end; random ids spread load and give no useful order."],
    p: ["A weak random number source on some devices generates colliding ids and one user's write overwrites another's.", "Sequential ids exposed in urls let anyone enumerate other users' records when rules are loose."],
    v: "Generate ten million ids across simulated offline clients and confirm there are no collisions. Create a document offline with a client id and confirm it syncs under that same id.",
    dep: ["document-model"]
  },
  "transactions": {
    s: "Groups several reads and writes into one all-or-nothing unit that sees a consistent state, so invariants hold even with many concurrent writers.",
    d: "A transaction reads documents, computes, and writes them back, and the server commits only if nothing it read has changed, otherwise it retries or fails. Optimistic concurrency avoids holding locks across slow client round trips. Some systems restrict transactions to documents on one partition, or to a single document, to stay fast. Committed transactions appear as one atomic unit in the change feed. Hard parts are contention, retries that are not safe if the function has side effects, and cross-partition coordination.",
    k: ["Optimistic transactions with retry vs pessimistic locks: optimistic avoids lock waits and wasted work under contention; locks suit hot rows and risk deadlock and blocking.", "Single-partition transactions only vs distributed transactions: single-partition is fast and simple, and limits designs; distributed transactions allow any grouping at higher latency and failure risk."],
    p: ["A transaction function that sends an email runs on every retry and the user gets several.", "A hot counter inside a transaction retries continuously and throughput collapses under contention."],
    v: "Run 100 concurrent transactions each incrementing a counter and transferring between two documents, and confirm the final counter equals 100, totals are conserved, and no subscriber ever sees a half-applied transfer.",
    dep: ["write-ahead-log", "primary-store"]
  },
  "server-timestamps-counters": {
    s: "Values the server assigns at commit, such as the commit time or an increment amount applied to the current value, so clients cannot supply wrong time or overwrite totals.",
    d: "A write may include a placeholder meaning the commit time, replaced by the server with its clock or a hybrid clock value. Counters are expressed as increment operations applied atomically on the server rather than as new totals, so concurrent increments add up instead of overwriting. Clients show an estimate until confirmed. Hot counters are a scaling problem, since every increment goes through one document, and are sharded. Both mechanisms exist because naive last-writer-wins on these values loses information.",
    k: ["Server-resolved placeholders vs client-supplied values: placeholders give a trusted time and need a display estimate before confirmation; client values are instant and untrustworthy.", "Increment operations vs read-modify-write: increments commute and never lose updates, while read-modify-write needs a transaction and can lose updates without one."],
    p: ["A counter updated by reading and writing the total from clients loses a share of increments under concurrency.", "The interface shows an estimated timestamp that moves by seconds when the real value arrives."],
    v: "Run 1,000 concurrent increments from 50 clients and confirm the final total is exactly 1,000. Write with a server timestamp placeholder and confirm the stored value is the commit time, not the client's.",
    dep: ["hybrid-logical-clocks", "transactions"]
  },
  "tombstones": {
    s: "Markers that record that a document was deleted, instead of removing it outright, so offline clients and replicas learn about the deletion rather than seeing the document reappear.",
    d: "If a delete simply erased the record, a client that was offline would still hold the document and on reconnect might send it back as new. A tombstone keeps the id and deletion version for a retention period, so the delete propagates and later writes against it can be rejected. Change feeds emit a delete event. Tombstones are removed after all clients are presumed to have seen them. Privacy is the hard part: real erasure obligations conflict with keeping markers, and data inside must actually be removed.",
    k: ["Tombstones for a retention window vs immediate physical delete: tombstones make deletion reliable for offline clients but cost storage and a policy; immediate deletion is clean and lets stale clients resurrect data.", "Soft delete flag in the document vs a separate tombstone: a flag keeps data and its history queryable, but leaves personal data in place; a tombstone drops content."],
    p: ["Tombstones are purged before a client that was offline for a month returns, and it re-uploads deleted records.", "A soft-deleted document with personal data is retained after the user asked for erasure."],
    v: "Delete a document while a client is offline, reconnect it, and confirm the client removes the document rather than re-uploading it. After the retention period, confirm the tombstone is gone and the content was erased from storage and backups per policy.",
    dep: ["change-feed", "feed-retention"]
  },
  "server-functions": {
    s: "Code deployed with the backend that clients can call by name, running next to the data with secrets and privileges that clients must never hold.",
    d: "A function receives arguments and the caller's identity, reads and writes data with elevated access, and returns a result. Typical uses are payment calls, sending notifications, validating against external systems and performing multi-document logic. Functions run in short-lived isolated environments scaled with load, and cold starts add latency. They must be stateless between calls and time-bounded. The difficulty is that they become the real API: versioned, authorized, rate-limited and tested like one.",
    k: ["Callable functions vs direct client writes governed by rules: functions can hold secrets and enforce complex logic, but add latency and a code surface to maintain; direct writes are fast and limited by rules.", "Run in-process with the data tier vs separate compute: in-process is low latency and risks noisy neighbors; separate compute isolates and adds a network hop."],
    p: ["A function trusts an argument naming the acting user instead of the authenticated caller and any user can act as any other.", "A cold start adds a second of latency to the first action each user takes."],
    v: "Call a function as an anonymous user, an ordinary user and an administrator and confirm each is allowed or rejected correctly. Measure p99 latency at warm and cold start and confirm both meet the budget.",
    dep: ["function-sandboxing", "authentication-tokens", "transactions"]
  },
  "mutation-handlers": {
    s: "Server-side implementations of named write operations that both the client and server run, so the client predicts the result and the server's execution is the final authority.",
    d: "A mutation is a named, versioned procedure taking arguments, instead of a raw document patch. The client runs it locally for the optimistic result and sends the name and arguments, and the server runs it against authoritative state, possibly getting a different answer. Since only intent is sent, conflicts are resolved by re-running on current data. Mutations must be deterministic and free of outside effects when run on the client. The challenge is keeping two implementations equivalent and managing versions as the code changes.",
    k: ["Named mutations vs raw document patches: mutations carry intent, allow server logic and merge by re-execution, but need maintained handlers; patches are generic and lose why the change happened.", "Shared code on both sides vs separate implementations: shared code prevents drift and ties client and server release schedules."],
    p: ["Client and server implementations drift and the server's result silently differs from what users saw.", "A mutation handler is changed while old clients still have queued calls to the previous behavior."],
    v: "Run each mutation with the same inputs on client and server over a recorded corpus and confirm identical results. Deploy a new version and confirm queued calls from the old version still execute correctly.",
    dep: ["server-functions", "optimistic-updates", "transactions"]
  },
  "change-triggers": {
    s: "Functions that run automatically when data changes, driven by the change feed, used to maintain copies, send notifications and call other systems.",
    d: "A trigger registers interest in a collection or path and event type. The platform reads the change feed, invokes the function with the before and after values, and records progress. Delivery is at least once, so functions must be safe to run twice. Triggers run after commit, so they cannot veto the write. They can write back to the data, which can fire further triggers. The hard parts are loops, ordering, failure handling and backlog: a slow trigger falls behind, and a poison event can block a partition.",
    k: ["Asynchronous triggers after commit vs synchronous hooks before commit: asynchronous triggers keep writes fast and cannot reject them; synchronous hooks enforce rules and slow every write.", "At-least-once with idempotent handlers vs exactly-once claims: at-least-once is achievable and needs careful handlers; exactly-once is rarely real."],
    p: ["A trigger that updates its own collection fires itself endlessly and runs up cost.", "One failing event is retried forever and blocks all later events for that partition."],
    v: "Write 1,000 documents, force the trigger to fail on some and the platform to redeliver others, and confirm each event's effect ends exactly once, a poison event is quarantined, and the backlog drains.",
    dep: ["change-feed", "function-retries"]
  },
  "scheduled-jobs": {
    s: "Functions run at set times or intervals, used for cleanup, digests, expiring records and periodic recalculation that no user action triggers.",
    d: "A scheduler stores job definitions and fires them at the right time, usually by writing a task to a queue. Jobs may be recurring, delayed one-offs or deadlines on a record, such as expiring a session. Several scheduler nodes run for availability, so jobs must fire once. Long jobs are split into pieces so they stay under function time limits. Hard parts are missed runs after outages, overlapping runs, time zones and daylight changes, and many jobs landing on the same second.",
    k: ["Central scheduler with leader election vs distributed timers on each node: a central scheduler fires each job once and is a component to keep available; distributed timers survive failures and need deduplication.", "Catch up missed runs vs skip them: catching up preserves completeness and can overload after an outage; skipping is safe for idempotent periodic work."],
    p: ["Midnight jobs for every tenant fire together and swamp the database.", "A job that takes longer than its interval runs concurrently with itself and corrupts shared state."],
    v: "Create a job due every minute, kill the scheduler leader during a run, and confirm that after failover each minute's run happens exactly once and no run overlaps another.",
    dep: ["server-functions", "primary-store"]
  },
  "outbound-webhooks": {
    s: "Signed HTTP calls the backend makes to external systems when data changes, with retries and delivery tracking, letting other services react without polling.",
    d: "Subscribers register an endpoint and event types. When a matching change commits, the platform creates a delivery, signs the body so the receiver can verify the sender, and posts it. Failures are retried with backoff and eventually dead-lettered, and each attempt is logged. Because delivery is at least once, each event has an id the receiver can use to deduplicate. Hard parts are slow or hostile endpoints, which must not hold up other deliveries, and requests to internal addresses, which must be blocked.",
    k: ["Per-endpoint queues vs a shared delivery queue: per-endpoint queues stop one slow receiver from blocking others at the cost of more queues; a shared queue is simple and vulnerable to head-of-line blocking.", "Send full payloads vs notification with a fetch link: full payloads need no callback and can leak data in transit logs; links are small and need the receiver to authenticate back."],
    p: ["A customer registers an internal address as a webhook target and the backend is used to probe its own network.", "A receiver that is down for a day causes a huge retry backlog that overwhelms it when it returns."],
    v: "Point a webhook at an endpoint that fails the first three calls and confirm backoff retries, a single successful delivery with the same event id, a valid signature on each attempt, and no delay to other endpoints.",
    dep: ["change-triggers", "function-retries", "load-shedding"]
  },
  "function-sandboxing": {
    s: "Runs server functions in isolated, resource-limited environments so one customer's code cannot read other tenants' data, exhaust the host or reach internal systems.",
    d: "Functions execute in lightweight isolates or containers with limits on CPU time, memory, wall-clock duration, outbound network and file access. Credentials given to a function are scoped to what it needs. Isolation uses process boundaries, language-level sandboxes or virtual machines, trading startup time against strength. Egress is filtered, and resource accounting attributes usage to tenants. The difficulty is that stronger isolation costs cold-start latency and memory, and a single weakness in the sandbox exposes every tenant.",
    k: ["Strong isolation with virtual machines vs lightweight language isolates: virtual machines contain hostile code well and start slowly; isolates start fast and share more of the host.", "Pre-warmed pools vs on-demand creation: pools hide cold starts and cost idle capacity; on-demand is cheap and slow on the first call."],
    p: ["A function reads the instance metadata endpoint and obtains the host's credentials.", "An infinite loop without a CPU limit starves other tenants' functions on the same host."],
    v: "Run functions that try to read another tenant's data, call internal addresses, allocate unlimited memory and loop forever, and confirm each is blocked or killed within its limit without affecting neighbors.",
    dep: ["tenant-isolation"]
  },
  "function-retries": {
    s: "Runs failed functions again with limits and backoff while making side effects safe to repeat, so transient errors heal without duplicating emails, charges or writes.",
    d: "Platform retries rerun a function with the same event or request id after a failure or timeout. Safety comes from idempotency: external calls pass the event id as an idempotency key, database effects use conditional writes, and results are recorded keyed by id. Retries are bounded, with exponential delay, and exhausted ones go to a dead-letter store for inspection. The difficulty is partial failure: a function may have performed some effects before it failed, and the platform cannot tell which.",
    k: ["Automatic platform retries vs caller-driven retries: platform retries heal quietly and require idempotent functions; caller retries are explicit and leave events unprocessed if the caller disappears.", "Record effects in a ledger keyed by event id vs rely on the external service's keys: a ledger works with any service and costs a write; external keys are cheap and not universally supported."],
    p: ["A retry after a timeout charges a customer a second time because the first charge had succeeded.", "The dead-letter store is never looked at and failed events pile up unnoticed."],
    v: "Inject failures after each side effect of a function that charges, writes and notifies, run it to completion through retries, and confirm each effect occurred exactly once, and exhausted retries land in the dead-letter store with their cause.",
    dep: ["idempotency-keys", "transactions"]
  },
});
