// Details for the stream processor plate, part 1: programming APIs, SQL and table layer, sources and sinks.
ATLAS.details("stream-processor", {
  "dataflow-operators": {
    s: "The core API: a program is a graph of typed streams connected by operators such as map, filter, flat-map, aggregate and union, each running in parallel across many task instances.",
    d: "Calling an operator on a stream does not process anything; it appends a node to a graph that is submitted later. Each operator wraps a user function and receives records one at a time on a task thread. Streams carry a type that fixes how records are serialized between tasks. Operators can be stateless or, after a keying step, stateful. Parallelism can be set per operator. The hard part is that user functions run inside a long-lived distributed runtime: they must be serializable, deterministic enough to replay, and careful with shared mutable state.",
    k: ["Lazy graph construction vs eager execution: the whole graph can be optimized, chained and placed before any record flows, but errors surface at submission and debugging means reasoning about a plan, not a call stack.", "Record-at-a-time functions vs batch-oriented vectors: simple per-record semantics and low latency, at the cost of per-record call overhead that vectorized engines avoid."],
    p: ["A function capturing a non-serializable or mutable object fails at submission, or worse, silently diverges between parallel instances.", "Assuming operators run in one process: static variables and singletons behave differently on every worker."],
    v: "Submit a graph with a map and a filter at parallelism 4, then read the plan view: it should show the operators, their parallelism and the exchange between them, and output counts should match a hand-computed result.",
    dep: ["type-system", "stream-graph"]
  },
  "keyed-stream-api": {
    s: "Partitions a stream by a key extracted from each record so that all records with the same key reach the same task and can share keyed state and timers.",
    d: "A key selector function maps each record to a key. The planner inserts a hash exchange so that equal keys land on one parallel instance, and the downstream operator gets access to per-key state and per-key timers. Downstream, every state access is implicitly scoped to the current record's key, so user code never names the key when reading state. Keyed streams are the entry point for windows, keyed joins and most aggregations. The difficulty is key design: the key set determines parallelism, state size and skew.",
    k: ["Implicit current-key scoping vs explicit key arguments: state code stays short and the runtime can shard it, but state touched outside a keyed context fails at runtime.", "Hash partitioning on the key vs range partitioning: hashing spreads load evenly but destroys ordering across keys and cannot support range scans."],
    p: ["A key with a few dominant values sends most traffic to one task while the rest idle, capping throughput.", "A key selector that is not deterministic or reads mutable fields routes the same logical key to different tasks and splits its state."],
    v: "Feed records with a skewed key distribution and view per-task input rates: all records for one key must appear on exactly one subtask, and a state value written for a key must be readable on the next record with that key.",
    dep: ["dataflow-operators", "keyed-shuffle", "key-groups"]
  },
  "process-functions": {
    s: "The lowest-level, most general operator: user code that receives records, reads and writes keyed state, registers timers and emits to multiple outputs, with full control over time.",
    d: "A process function is invoked for every record and, separately, whenever a registered timer fires. It sees the record's timestamp, the current watermark and a context for state, timers and side outputs. Higher-level constructs such as windows and joins can be expressed with it. Because it offers no built-in cleanup, authors must delete state themselves, usually by registering a timer that fires after the last record a key could receive. It is powerful and easy to misuse: nothing stops unbounded state growth or non-deterministic logic.",
    k: ["Process function vs ready-made window or join: complete control over emission and state layout, but the author owns cleanup, correctness under late data and recovery behavior.", "Event-time timers vs processing-time timers: event-time results are reproducible on replay, processing-time ones react to wall-clock silence but differ on every run."],
    p: ["State is created per key but never cleared, so the state grows with the number of distinct keys until the backend is exhausted.", "Registering a timer per record instead of per key and time bucket floods the timer queue."],
    v: "Write a function that emits a record after ten minutes of event-time silence per key. Replay a recorded input twice and confirm both runs emit identical output at identical event timestamps.",
    dep: ["timer-service", "value-state", "side-outputs", "operator-lifecycle"]
  },
  "side-outputs": {
    s: "Lets one operator emit records to additional tagged streams beside its main output, used for late data, errors and splitting a stream without running the input twice.",
    d: "An operator declares output tags and, inside user code, emits a record to a tag instead of the main collector. Downstream, the tagged stream is retrieved from the operator result and handled as an independent stream with its own type. The window operator uses this to expose records dropped as too late. Dead-letter streams for records that fail parsing use the same mechanism. Internally these are extra output edges of one operator, so the cost is an additional exchange, not a second pass over the input. The tradeoff is more graph edges to manage and type safety only by tag.",
    k: ["Side outputs vs filtering the same stream several times: the input is read and processed once, but outputs are unordered relative to each other.", "Tagged output with a distinct type vs a union record with a discriminator field: separate types are cleaner downstream, while one stream keeps ordering between the variants."],
    p: ["Late-data side output declared but never consumed, so dropped records vanish and totals drift without any alert.", "Error records sent to a side output with no sink attached are discarded silently."],
    v: "Send a record older than the allowed lateness through a window and confirm it appears on the late-data side output with its original timestamp, while the main output total excludes it.",
    dep: ["dataflow-operators", "late-data-policy"]
  },
  "broadcast-streams": {
    s: "Sends every record of a low-volume stream, such as rules or configuration, to all parallel instances of another operator so each can apply it locally to the main stream.",
    d: "A broadcast stream is connected to a keyed or non-keyed main stream. Every instance receives all broadcast records and stores them in broadcast state, a map identical on every instance. The main stream's function reads that state but may not modify it, so updates stay consistent across instances. The broadcast side and the main side are consumed in no guaranteed relative order, so a record may be processed before the rule that should apply to it. The tradeoff is memory: the full rule set is held by each parallel instance.",
    k: ["Broadcast state vs a lookup in an external store: local reads with no network hop, but every instance holds a full copy and updates arrive eventually, not atomically.", "Read-only main side vs writable on both sides: only the broadcast side writes, which keeps copies identical without coordination, at the cost of a more awkward programming model."],
    p: ["Main records arrive before the rule they depend on, so they are processed under old or missing rules after a restart.", "Large broadcast state is multiplied by parallelism and exhausts worker memory."],
    v: "Publish a rule update, then send a main record: every parallel instance must apply the new rule after receiving it, and after restore from a snapshot all instances must hold identical broadcast state.",
    dep: ["operator-state", "partitioners", "dataflow-operators"]
  },
  "async-io-operator": {
    s: "Issues non-blocking external requests per record and keeps many in flight, so slow lookups do not stall the task thread, while preserving ordering rules and exactly-once state semantics.",
    d: "The operator holds a bounded queue of in-flight requests. For each record it calls a user client that returns a future; results are emitted when complete, either in input order or as soon as ready. A timeout and capacity limit bound the queue; when full, the operator stops reading input, which creates backpressure. In-flight records are included in snapshots and re-issued on recovery, so external calls must tolerate repeats. Ordering modes trade latency for determinism, and event-time ordering needs extra bookkeeping against watermarks.",
    k: ["Ordered vs unordered emission: ordered output is deterministic and easier to reason about, but one slow request holds back every result behind it.", "Large in-flight capacity vs small: higher throughput hides latency, but a failure replays more requests and the external service sees larger bursts."],
    p: ["A request timeout with no fallback fails the whole job on one slow call.", "Non-idempotent external calls run again on recovery, so side effects happen twice."],
    v: "Point it at a service with 200 ms latency and compare throughput against a blocking call: with capacity 100 the job should sustain far more than 5 records per second per task, and queue-full should show as backpressure.",
    dep: ["mailbox-thread-model", "backpressure", "lookup-join"]
  },
  "type-system": {
    s: "Describes the type of every record and field so the runtime can pick compact serializers, compare and hash keys, and detect incompatible state after an upgrade.",
    d: "Types are extracted from function signatures or declared explicitly. Each type maps to a serializer that writes records to network buffers and state, and a comparator or hasher used for keys. Common cases such as tuples, rows and primitive arrays have specialized serializers; unknown types fall back to a generic, slower one. Serializers carry a snapshot of their configuration so a restored job can check compatibility and migrate. Type erasure of generics, nulls and schema evolution make extraction the fragile part.",
    k: ["Specialized serializers vs a generic fallback: compact binary formats with fast key comparison, but unrecognized types silently take the slower and less evolvable path.", "Serializer config stored with state vs relying on class identity: state can be migrated across versions, at the cost of extra format definition per type."],
    p: ["A type that falls back to generic serialization is slow and cannot be evolved, and nothing in the job output reveals it.", "Changing a field in a class used as state invalidates every existing snapshot."],
    v: "Disable the generic fallback in a test job: every stream and state type must resolve to a specialized serializer, and a snapshot taken before adding a field must restore afterward with the migration path.",
    dep: ["state-schema-evolution"]
  },
  "table-api": {
    s: "A relational, language-integrated API where streams are viewed as tables and queries are built from select, filter, group and join calls that compile to the same plan as SQL.",
    d: "Programs build expressions over tables, with column types known at construction. Tables convert to and from streams, so relational steps and low-level operators mix in one job. Each call extends a logical plan; nothing runs until a table is written to a sink or converted. Because it shares the planner with SQL, it benefits from the same rewrites. The difficulty is the boundary: converting between streams and tables must say how time attributes and changes (inserts versus updates) are carried.",
    k: ["Typed expression API vs SQL text: errors are caught at construction and refactoring tools work, but queries are less portable and harder to hand to analysts.", "Mixing streams and tables vs staying declarative: escape hatches handle unusual logic, though the optimizer treats converted streams as opaque."],
    p: ["Converting a table that produces updates into an append-only stream fails at runtime, not at plan construction.", "Losing the time attribute at a conversion makes later windows impossible."],
    v: "Express one aggregation in the table API and in SQL, then compare the printed logical plans: they should match, and both jobs should produce identical results on the same input.",
    dep: ["logical-plan", "dynamic-tables", "changelog-streams"]
  },
  "sql-parser": {
    s: "Turns query text into a validated tree: resolves names and types against catalogs, checks time and window rules, and rejects queries that cannot run on unbounded input.",
    d: "A parser builds a syntax tree from a standard SQL dialect extended with streaming constructs such as windowing functions, time attributes and row pattern matching. A validator resolves tables, columns and functions through the catalog, infers types, and applies streaming rules, for example that grouping on an unbounded input needs a window or accepts unbounded state. Errors should point to the offending clause. Hard parts include dialect extensions, implicit type coercion, and keeping validation errors understandable when the query was produced by a generator or notebook.",
    k: ["Extending a standard dialect vs inventing syntax: users bring existing knowledge and tools, but streaming semantics sometimes force awkward constructs that standard SQL has no word for.", "Strict validation up front vs permissive execution: unsupported combinations fail before deployment, though some valid-looking queries are rejected conservatively."],
    p: ["An unbounded aggregate with no window or retention setting validates, then grows state forever.", "Implicit casts differ from other systems and change results without an error."],
    v: "Submit a query referencing an unknown column and an unbounded join without a key: the first must fail at validation with the position of the column, and the second must warn or fail with a message about unbounded state.",
    dep: ["catalog", "logical-plan"]
  },
  "catalog": {
    s: "Stores definitions of tables, views, functions and connector options so queries can refer to external streams and files by name, with their schemas, time attributes and formats.",
    d: "A catalog maps a name to a table definition: columns and types, which connector reads or writes it, format and options, watermark declaration and primary key. Catalogs may be in memory for one session or backed by a durable metastore shared with other engines. The planner and validator consult it during resolution. The hard part is that the definition is a contract with an external system: a column change upstream is not seen by running jobs, and the catalog does not validate that the underlying topic or file still matches.",
    k: ["In-memory catalog vs shared durable metastore: zero setup for experiments, while only the shared store lets several engines and teams agree on one schema.", "Declaring watermarks in table definitions vs in program code: every query on the table gets consistent time handling, but changing the strategy changes every dependent job."],
    p: ["A shared table definition edited while jobs are running affects only newly submitted jobs, so versions silently differ.", "Credentials placed in table options end up in logs and plan dumps."],
    v: "Create a table with a watermark declaration, query it from two sessions, and confirm both resolve the same schema and watermark rule; dropping a column in the store should fail the next validation with a named column.",
    dep: ["sql-parser"]
  },
  "dynamic-tables": {
    s: "The model that treats a stream as a table that changes over time, so a continuous query is the evolving result of applying a relational query to a growing input.",
    d: "A dynamic table is conceptually a table with a history: every record of the stream changes it, and a query over it produces another dynamic table. A stream can be turned into a dynamic table by interpreting records as inserts, or as updates on a primary key. Results are converted back into streams of changes. This gives a precise meaning to a query over unbounded data, but the result may be updated, not only appended. The model hides state, which is the cost: a simple-looking aggregate keeps state for every group.",
    k: ["A table-over-time abstraction vs a stream-of-events abstraction: it reuses relational semantics and optimizers, but hides how much state a query holds.", "Append-only interpretation vs keyed updates: appends are cheap and parallel, while updates need a key and downstream operators that understand corrections."],
    p: ["A query that looks like a plain aggregate keeps state per group forever and fails after weeks.", "Treating an update-producing result as append-only duplicates rows downstream."],
    v: "Run a count-by-key query on three records for one key and print the result changelog: it should show an insert followed by two updates for that key, and the final table should equal a batch run over the same data.",
    dep: ["changelog-streams", "upserts-and-retractions", "logical-plan"]
  },
  "changelog-streams": {
    s: "Streams whose records carry a change kind (insert, update-before, update-after, delete), so downstream operators and sinks can apply corrections instead of seeing only new facts.",
    d: "Each row is tagged with its change kind. Operators declare which kinds they accept and produce; the planner checks the chain and fills gaps by adding a normalization step that reconstructs missing before-images from state. Sources such as database change logs, and operators like non-windowed aggregations, produce changelogs. Sinks either apply them to a keyed table or reject them. The difficulty is correctness of compaction and ordering: a delete reordered before its insert leaves a wrong row.",
    k: ["Full before and after images vs after-image only: before-images make retraction trivial and cheap for operators, but double the volume and need state to regenerate.", "Strict per-key ordering vs relaxed: strict order keeps results correct but limits shuffle choices and can serialize a hot key."],
    p: ["A shuffle between changelog operators that does not preserve per-key order produces a final table that differs from batch output.", "Sink receiving deletes it cannot represent drops them silently."],
    v: "Feed a database change log of inserts, updates and deletes into a keyed sink and compare the sink table with the source table: they must match after every checkpoint, including rows that were deleted and re-inserted.",
    dep: ["dynamic-tables", "changelog-mode-inference"]
  },
  "upserts-and-retractions": {
    s: "Two ways to publish updates: an upsert stream carries only the new value per key, a retraction stream first withdraws the old value, which is more general but heavier.",
    d: "Upsert streams need a unique key known to the consumer; each record replaces the previous value for the key and a delete removes it. They are compact and map directly to keyed stores. Retraction streams emit the old row as a retract followed by the new row as an add, and work for results with no key, such as aggregates of aggregates. The planner infers which form each result can use and whether the sink can apply it. Choosing wrongly shows up as duplicate or missing rows when the sink does not understand the change kind.",
    k: ["Upsert (key plus new value) vs retraction (old and new rows): upserts halve traffic but need a stable unique key, retractions need none and cost more.", "Emitting every intermediate update vs emitting only on a trigger: frequent updates are fresh but load the sink with churn, rate limiting adds latency."],
    p: ["A sink without a primary key receives an upsert stream and appends duplicates instead of replacing rows.", "High-frequency updates on a hot key overload the downstream store."],
    v: "Write a grouped count to a keyed table and to an append-only log: the table must hold one row per key matching a batch count, and the log must show retract and add pairs for each change.",
    dep: ["changelog-streams", "dynamic-tables"]
  },
  "source-framework": {
    s: "The unified interface connectors implement to read data, splitting responsibility between a coordinator that discovers work and parallel readers that fetch it, for both bounded and unbounded inputs.",
    d: "A source is described by its split type, an enumerator that runs on the coordinator and assigns splits, and readers that run in tasks and emit records. Readers are driven by the task's mailbox, report which splits they hold, and snapshot their position. The same interface covers files, log partitions and bounded data, with boundedness flag controlling whether the job ends. Hard parts include handing out splits fairly, reassigning on failure, applying watermarks per split and keeping the record reading loop non-blocking.",
    k: ["Coordinator-assigned splits vs readers picking work themselves: central assignment balances load and survives reader loss, but adds a coordinator round-trip and a single process to protect.", "Per-split watermarks vs per-reader: per-split avoids a fast partition advancing time past a slow one, at the cost of more bookkeeping."],
    p: ["A blocking read inside the reader loop stalls checkpoint barriers and the whole task.", "Split state not included in the snapshot causes duplicate or missed data after recovery."],
    v: "Run a source with four splits on two readers, kill one reader task, and confirm its splits move to the survivor and reading continues from the last checkpointed positions without gaps.",
    dep: ["split-enumerator", "split-readers", "replayable-offsets", "mailbox-thread-model"]
  },
  "split-enumerator": {
    s: "The coordinator-side component that discovers units of work (partitions, files, ranges), assigns them to readers, and tracks which are finished or must be re-assigned.",
    d: "The enumerator runs inside the job coordinator, receives reader registrations and split requests, and responds with split assignments. For unbounded sources it keeps discovering new splits, for example new partitions or files, on a timer. Its own state is snapshotted so assignment survives restarts. It is also where the source decides to signal that no more splits will arrive. Hard parts are fair assignment across heterogeneous readers, avoiding hot spots, and ensuring the enumerator is never blocked by slow external metadata calls.",
    k: ["Pull-based assignment on reader request vs eager push: pull adapts to speed differences so fast readers get more, while eager assignment is simpler and gives better data locality.", "Periodic discovery vs notification-driven: polling is simple but delays new partitions, notifications are faster but need the external system's cooperation."],
    p: ["Slow metadata calls on the coordinator thread delay every other job event.", "Enumerator state omitted from snapshots re-assigns already finished splits after a restart."],
    v: "Add a partition to the external system while the job runs: within the discovery interval it should be assigned to a reader, and a restart from a snapshot must not re-read splits already marked finished.",
    dep: ["source-framework", "job-master"]
  },
  "split-readers": {
    s: "Per-task readers that fetch records for their assigned splits, convert them into records with timestamps, and track a read position that goes into every snapshot.",
    d: "A split reader runs in an I/O thread separate from the task thread, hands batches of records through a queue, and the task thread emits them downstream. This separation keeps blocking network or disk reads away from checkpointing. Each split has a current position, such as a byte offset or log offset, which is the state restored on recovery. Readers may fetch several splits at once and must decide how to interleave them, which interacts with watermarks. The cost is handoff queue sizing and memory.",
    k: ["Separate I/O thread with a handoff queue vs reading on the task thread: blocking never stalls barriers, but queue memory and a thread switch cost latency.", "Interleaving splits round-robin vs draining one at a time: round-robin keeps timestamps aligned across splits, while draining is faster for bounded files."],
    p: ["An unbounded handoff queue lets a fast source outrun the pipeline and run out of memory.", "Emitting records before their position is recorded replays or skips records after restore."],
    v: "Pause the downstream operator and watch the reader: it must stop fetching once the handoff queue is full, and a snapshot taken then must restore to exactly the last emitted record.",
    dep: ["source-framework", "replayable-offsets", "backpressure"]
  },
  "replayable-offsets": {
    s: "The ability of a source to re-read data from a recorded position, which is what lets recovery restart from a snapshot and still produce exactly the same stream of input.",
    d: "Each source split exposes a position that identifies where reading stopped: a log offset, a file and byte offset, or a change-log sequence number. The position is stored in the snapshot, taken at the barrier, together with the state of downstream operators. On restore, the reader seeks to that position. This only works if the external system retains data that long and returns the same records on re-read. It fails for transient streams, sockets and sources whose retention is shorter than the recovery time.",
    k: ["Storing offsets in the engine's snapshots vs committing them to the external system: snapshot offsets give exact consistency with state, while external commits are only for monitoring and lag tracking.", "Source retention long enough to cover recovery vs unbounded retention: bounded retention is cheaper but turns a long outage into data loss."],
    p: ["Data retention expires while the job is down, so the restored offset points to deleted data and the source errors or silently jumps ahead.", "Committing offsets before the snapshot completes hides lag after a failure."],
    v: "Stop a job, produce data for the retention window minus a margin, restore from the last snapshot, and confirm the first record read is the one directly after the stored offset with no gap or duplicate.",
    dep: ["source-framework", "checkpoint-coordinator"]
  },
  "bounded-sources": {
    s: "Sources with a known end, such as files or table snapshots, which signal completion so a job finishes and the same program can run as a batch job.",
    d: "A bounded source reports that it has a finite split set and each reader signals end of input when its splits are done. The runtime then propagates a final watermark of infinite time, which fires all remaining windows and timers, and lets tasks finish in topological order. In batch mode the runtime can use blocking exchanges and sorting instead of streaming ones. Hard parts include mixing bounded and unbounded sources in one job and making sure final output is flushed and committed before the job is declared finished.",
    k: ["Treating batch as a bounded stream vs a separate batch engine: one set of operators and semantics, but batch-specific optimizations need a special execution mode.", "Hybrid sources that read history then switch to live: consistent backfill and live logic, but the handover point needs careful offset and watermark handling."],
    p: ["Final records are not committed because the job ends before the last checkpoint completes.", "A bounded source mixed with a never-ending source keeps the job running forever."],
    v: "Run a job on a fixed file: it must terminate by itself, fire every open window via the final watermark, and produce the same output as a streaming run on the same data.",
    dep: ["source-framework", "watermark-propagation", "execution-mode-selection"]
  },
  "sink-framework": {
    s: "The interface that connectors implement to write results, separating per-record writing in parallel tasks from commit steps that make output visible exactly when a snapshot completes.",
    d: "A sink has a writer, which runs in each parallel task and buffers or writes records, and an optional committer and global committer that make the written data visible. Writers flush at checkpoint barriers and pass pending commit information to the committer, which finishes once the checkpoint is confirmed complete. This splits data writing from publishing. Hard parts are small-file and small-batch problems, flush timing against checkpoint interval, and committers that must be retried safely.",
    k: ["Writer plus committer phases vs a single write call: output becomes visible atomically with a checkpoint, at the cost of latency equal to the checkpoint interval.", "Parallel committers vs one global committer: parallel is faster, while a global one can produce a single atomic publication such as one table version."],
    p: ["Short checkpoint intervals produce many tiny output files or transactions.", "A committer that is not idempotent applies the same commit twice after a restart."],
    v: "Kill the job after the writer has flushed but before the commit step, restart, and confirm the output contains each record exactly once and no uncommitted files remain visible.",
    dep: ["checkpoint-coordinator", "two-phase-commit-sink", "idempotent-sinks"]
  },
  "two-phase-commit-sink": {
    s: "Writes into an external transaction that is prepared at a barrier and committed only after the whole checkpoint is confirmed, so output appears exactly once even across failures.",
    d: "On each barrier the sink pre-commits: it flushes data and prepares its transaction, then stores the transaction handle in the snapshot. When the coordinator announces the checkpoint is complete, every sink commits. If a failure happens between the two, recovery restores the stored handles and commits or aborts them. The transaction mechanism is the external system's. The constraints are strict: the system must support prepare-and-commit, transactions must survive until recovery, and open transactions must not time out. Aborting stale transactions is part of correctness.",
    k: ["Transactional commit on checkpoint completion vs writing immediately: no duplicates and no uncommitted reads, but results lag by up to a checkpoint interval and readers must read only committed data.", "Many small transactions vs one long one: small ones limit lock and retention costs, a long one reduces overhead but risks timeout."],
    p: ["The external transaction timeout is shorter than the checkpoint interval plus recovery time, so committing after restart fails and data is lost.", "Consumers reading uncommitted data see duplicates that later vanish."],
    v: "Inject a failure between prepare and commit, restore, and read the sink as a read-committed consumer: each input record must appear once, and the transaction left open before the crash must be committed or aborted, never leaked.",
    dep: ["sink-framework", "checkpoint-coordinator", "snapshot-async-phase"]
  },
  "idempotent-sinks": {
    s: "Writes whose repetition has no further effect, such as upserts by key, so a sink can tolerate replay after recovery without transactions.",
    d: "If every output record has a deterministic key and the store applies the last write for a key, repeating a write after a restart overwrites with the same value. The sink needs no transaction support. Correct results require determinism upstream: replays must regenerate the same keyed values. Between failure and catch-up, readers may see temporarily regressed or newer values. This works for key-value stores and keyed tables, not for appends to logs. The tradeoff is visibility of intermediate, then corrected, values.",
    k: ["Idempotent keyed writes vs transactional commit: simpler and lower latency, but consumers can briefly see replayed older values and it only suits keyed outputs.", "Deterministic generated keys vs random identifiers: deterministic keys make replay safe, random ones turn every retry into a new row."],
    p: ["Non-deterministic upstream logic produces different values on replay, so the same key ends with a different result.", "Appending to a log-style sink with idempotent semantics assumed duplicates records."],
    v: "Force a restart from an earlier snapshot and let the job reprocess a segment: the final store contents for every key must equal an uninterrupted run, even though intermediate values were rewritten.",
    dep: ["sink-framework", "upserts-and-retractions"]
  },
  "end-to-end-exactly-once": {
    s: "The combined guarantee that each input record affects the external world exactly once, which needs a replayable source, consistent snapshots, and a transactional or idempotent sink working together.",
    d: "Inside the engine, snapshots make state updates exactly-once with respect to input positions. To extend this across the boundary, the source must replay from the stored position, and the sink must either commit atomically with the snapshot or tolerate repeats. A break in any link downgrades the end-to-end guarantee to at-least-once. Side effects in user functions, such as calls to external services, are outside the guarantee. Describing the guarantee requires saying which links are covered.",
    k: ["Exactly-once with transactions vs at-least-once with deduplication downstream: transactions cost latency and operational care, deduplication shifts burden to consumers but keeps output immediate.", "Aligned barriers vs at-least-once mode: skipping alignment lowers latency, but state may count a record twice after recovery."],
    p: ["Calling an external API from a map function repeats the call during replay, breaking the claimed guarantee.", "Claiming exactly-once while a sink only appends causes duplicates that nobody expects."],
    v: "Run a counting job with a kill every minute for an hour. The final committed output must equal a failure-free run record for record, and a read-committed consumer must never have seen a duplicate.",
    dep: ["replayable-offsets", "two-phase-commit-sink", "idempotent-sinks", "barrier-alignment", "checkpoint-coordinator"]
  }
});
