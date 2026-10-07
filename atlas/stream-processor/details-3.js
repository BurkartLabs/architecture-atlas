// Details for the stream processor plate, part 3: task execution, data exchange, state and backends.
ATLAS.details("stream-processor", {
  "task-manager": {
    s: "The worker process that hosts task slots, runs tasks as threads, owns the network stack and local state, and reports its resources and task status to the coordinator.",
    d: "A worker registers with the resource manager, advertising a number of slots and its memory layout. It receives task deployments from job coordinators, downloads job code, and runs each task in a dedicated thread. It also runs the shuffle service, the state backend instances, the heartbeat to coordinators and the metric reporters. Memory is split into heap for user code, managed memory for backends and sort buffers, network buffers, and overhead. The difficulty is that one process hosts tasks from the same job, and sometimes several jobs, so one fault can take down all of them.",
    k: ["Many tasks in one process vs one task per process: low overhead and cheap data handoff, but a crash or leak affects every task sharing it.", "Fixed memory pools per category vs one shared heap: predictable limits and no out-of-memory surprises from buffers, at the cost of manual sizing."],
    p: ["Memory categories sized by default for a state-heavy job exhaust managed memory and get the process killed by the container runtime.", "A thread leak in user code survives task restarts because the process lives on."],
    v: "Deploy a job with a known slot count and view the worker's status: slots, memory pools and running tasks must match the configuration, and killing the process must lead the coordinator to declare its tasks lost within the heartbeat timeout.",
    dep: ["task-slots", "managed-memory", "network-buffer-pool"]
  },
  "task-slots": {
    s: "The unit of resource a worker offers: a fixed share of its managed memory in which one parallel pipeline of tasks runs, with threads not isolated by CPU.",
    d: "A worker divides its managed memory into equal slots. Each slot can hold one task of each operator chain from a job, a pipeline slice, so a job needs as many slots as its highest operator parallelism when slot sharing is used. Slots isolate managed memory, not CPU or heap. Slots belong to the resource manager's accounting: a job requests them, and the worker offers them. The number of slots per worker sets the density and failure blast radius. Too many slots on a small worker starve each other of CPU.",
    k: ["Many small slots per worker vs few large: more parallel tasks sharing network and state caches cost less overhead, but there is less memory per slot and shared CPU contention.", "Slots as memory-only isolation vs full resource isolation: simple scheduling, but a CPU-hungry task slows co-located tasks."],
    p: ["More slots than cores leaves tasks fighting for CPU, which looks like random latency.", "Equal slot sizing wastes memory when operators have very different needs."],
    v: "Run a job at parallelism 8 on two workers with four slots each: the status view should show all eight slots occupied, one pipeline slice per slot, and a ninth parallel instance should wait for resources.",
    dep: ["task-manager", "managed-memory"]
  },
  "slot-sharing": {
    s: "Lets tasks of different operators from one job run in the same slot, so a slot holds a whole pipeline slice and the job needs only as many slots as its maximum parallelism.",
    d: "By default, all operators of a job belong to one sharing group, and each slot receives one parallel instance of every operator. Slot count therefore equals the highest parallelism, and the load is spread evenly. Users can define groups to isolate heavy operators from each other, which then need slots in proportion to their own parallelism. It improves utilization, since light and heavy stages share a slot, and shortens the data path as neighbors are co-located. The cost is that a heavy stage and a light one compete in one slot.",
    k: ["One sharing group for all operators vs separate groups: simple sizing and good utilization, but a heavy operator can starve its neighbors, whereas separate groups give isolation at the cost of more slots.", "Co-location for locality vs spreading stages: co-located tasks exchange data locally, spread tasks use more network."],
    p: ["A memory-hungry operator and a CPU-hungry one sharing a slot slow each other in ways metrics attribute to the wrong operator.", "Isolating every operator in its own group multiplies slot needs."],
    v: "Submit a three-stage job at parallelism 4 with sharing on, then off: with sharing the job uses four slots, without it twelve, and the status view should show the assignments.",
    dep: ["task-slots", "job-graph"]
  },
  "parallelism-and-max-parallelism": {
    s: "Parallelism is the number of parallel instances of an operator now; max parallelism fixes the number of key groups and therefore the upper limit for later rescaling.",
    d: "Each operator runs as many parallel instances as its parallelism. Keyed state is split into a fixed number of key groups, which is the max parallelism, and each instance owns a contiguous range of them. The max can be left to a default derived from the first parallelism or set explicitly. Changing parallelism redistributes key groups; changing the max invalidates existing state. A larger max costs a little in metadata and state-backend overhead and avoids a painful migration later.",
    k: ["High max parallelism chosen up front vs derived default: leaves room to scale out later, but adds small per-group overhead, while a low default silently caps scaling.", "Per-operator parallelism vs one job-wide value: matches each stage's cost, but creates more exchanges and complicates reasoning about key locality."],
    p: ["A job started at parallelism 4 with a default max of 128 can never scale beyond 128, discovered only when traffic grows.", "Changing max parallelism makes old snapshots unusable."],
    v: "Start at parallelism 4, take a snapshot, restore at parallelism 12: it must restore and each instance must hold a contiguous key-group range; restoring above the max must be refused with a clear error.",
    dep: ["key-groups", "rescaling"]
  },
  "mailbox-thread-model": {
    s: "Runs all work of a task, records, timers, barriers and callbacks, on one thread that takes turns draining a queue of actions, so user code never needs locks.",
    d: "The task thread loops over a mailbox of pending actions; the default action is processing the next input record or batch. Timers, checkpoint barriers, asynchronous results and control events are enqueued as mails and run between record batches. Because there is a single writer, state access needs no synchronization. The cost is that any long-running or blocking call stalls everything on the task, including checkpoint barriers and watermarks. Priority mails let urgent actions such as aborting a checkpoint run first.",
    k: ["Single-threaded task loop vs multi-threaded operators: no locking and simple semantics, but one blocking call stalls the whole task and CPU use per task is capped at one core.", "Mail-based callbacks vs direct calls from other threads: callbacks are serialized and safe, but a flood of mails can starve record processing."],
    p: ["A blocking network call in a map function delays barriers, causing checkpoint timeouts that look like infrastructure faults.", "Calling operator state from another thread corrupts it."],
    v: "Add a one-second sleep to one operator and observe: throughput on that task drops to about one record per second and the checkpoint barrier alignment time metric rises by the same amount.",
    dep: ["operator-lifecycle", "task-slots"]
  },
  "operator-lifecycle": {
    s: "The fixed sequence of calls an operator receives: open and restore state, process, snapshot at barriers, finish when input ends, and close, which user code relies on for resources.",
    d: "On deployment, an operator is created, given its restored state, and opened, at which point user code can initialize connections and caches. During running, it processes elements, watermarks and timers, and on each barrier it snapshots. When input ends it receives a finish call to flush buffers, then close to release resources. On failure, close is called but finishing is skipped. The order matters for sinks that must flush before the final snapshot. It is hard because cleanup and flushing paths run less often than the main path and are therefore poorly tested.",
    k: ["Explicit finish before close vs only close: records can be flushed and committed on normal end, but failure paths must not assume it was called.", "Initialization in open vs in constructors: open runs on the worker with state restored and non-serializable resources allowed, but errors surface later."],
    p: ["Resources created in the constructor are serialized with the job and fail on submission or leak across restarts.", "Flushing only in close loses the buffer when the job fails."],
    v: "Log every lifecycle call, run, cancel and restore: open must precede the first record, snapshot must be called at each barrier, and finish must appear only on normal termination.",
    dep: ["mailbox-thread-model", "state-backend-interface"]
  },
  "managed-memory": {
    s: "A pool of off-heap memory the engine allocates and tracks for operators that need large buffers, such as embedded key-value state and sort-based batch operators.",
    d: "A fraction of worker memory is set aside as managed memory and divided among slots. Consumers, like the embedded key-value backend or batch sorters and hash tables, reserve from the slot's share and release at the end. Because the memory is allocated off-heap in pieces the engine controls, garbage collection does not scan it and total use stays within a known limit. Backends that rely on native libraries are configured to stay inside that limit. Hard parts are right-sizing and consumers that overshoot their reservation.",
    k: ["Engine-managed off-heap memory vs plain heap objects: avoids collection pauses and enforces limits, but needs explicit serialization and careful sizing.", "Fractional configuration vs absolute sizes: fractions scale with the worker, whereas absolute sizes are easier to reason about for a particular job."],
    p: ["A native library allocating beyond its share makes the container exceed its memory limit and be killed with no application error.", "Managed memory reserved but unused by stateless jobs is wasted."],
    v: "Run a state-heavy job and compare worker resident memory with configured pools: it must remain under the container limit for a day, and the managed memory metric must show the backend's usage within its share.",
    dep: ["task-manager", "embedded-kv-backend"]
  },
  "partitioners": {
    s: "The strategies deciding which downstream instance receives each record: forward, rebalance, rescale, broadcast, hash by key, or a custom function.",
    d: "Between two operators, each output record is routed through a partitioner chosen at graph build time. Forward keeps one-to-one routing and allows chaining. Rebalance cycles over all targets for even load. Rescale cycles within a local group, saving network. Broadcast sends to all. Hash maps a key to a key group and then to a target. Custom partitioners handle application knowledge. Choice affects ordering, skew, state placement and network cost, and the wrong choice for a stateful operator breaks correctness.",
    k: ["Rebalance vs hash: rebalance evens load and breaks key locality, whereas hash keeps keys together and can create skew.", "Forward vs rebalance on equal parallelism: forward keeps order and avoids network, but passes a skewed distribution on unchanged."],
    p: ["A rebalance before a keyed aggregate without a key selector scatters one key's records across instances and splits state.", "Broadcast to a high parallelism multiplies network traffic."],
    v: "Count records per target subtask for each partitioner on a skewed key set: rebalance should be almost uniform, hash should match the key distribution, and forward must preserve input order.",
    dep: ["stream-graph", "key-groups", "result-partitions"]
  },
  "keyed-shuffle": {
    s: "The all-to-all exchange that routes each record by hashed key to the instance owning that key's group, so keyed state and timers are local.",
    d: "Each upstream task serializes a record into the buffer for the target instance computed from the key's hash, then maps to a key group and to the owning task. Every upstream task connects to every downstream task, so the channel count grows with the product of the parallelisms. Order within a key is preserved per upstream sender but not across senders. The shuffle is where backpressure, skew and network cost concentrate. It is the most expensive exchange.",
    k: ["Hash by key group vs hash by instance: key groups allow redistribution of state on rescale, with one extra mapping step at routing time.", "All-to-all connections vs hierarchical aggregation: all-to-all is simple, while pre-aggregating locally reduces volume for aggregates but adds an operator."],
    p: ["Channel count for large parallelism uses a great deal of buffer memory, so shuffle between two 1000-way stages needs a million channels.", "A hot key saturates one downstream instance's network input."],
    v: "Run a keyed aggregation at two parallelisms and verify that each key's records are processed on one instance only; check per-channel metrics show buffers consumed on all channels, not just a few.",
    dep: ["partitioners", "key-groups", "input-gates", "network-buffer-pool"]
  },
  "record-serialization": {
    s: "Turns records into bytes packed into fixed-size network buffers on the sender and reconstructs them on the receiver, including records that span several buffers.",
    d: "The sender's serializer writes a record with a length prefix into the current buffer; if it does not fit, the record continues in the next buffer. Control events, such as watermarks and barriers, are interleaved in the same stream. The receiver reassembles records across buffer boundaries. Serializer choice dominates CPU cost for small records. Large records stress buffers and can be a source of latency spikes. Buffers are flushed when full or after a timeout, trading latency for throughput.",
    k: ["Flush on full buffer vs short flush timeout: full buffers give high throughput and efficiency, a short timeout lowers latency at the cost of many small packets.", "Compact binary formats vs self-describing formats: compact is faster and smaller, self-describing makes evolution and debugging easier."],
    p: ["A record larger than the buffer size spans many buffers and delays barriers behind it.", "A serializer change between versions breaks in-flight data in unaligned snapshots."],
    v: "Send records of 10 bytes and 10 MB through one exchange: both must arrive intact, and flush timeout settings must show the latency difference at low rates.",
    dep: ["type-system", "network-buffer-pool"]
  },
  "result-partitions": {
    s: "The sender-side structure of a task's output: one subpartition per consumer, holding queued buffers until the consumer has credit to receive them.",
    d: "A task writes serialized records into subpartitions, one per downstream channel. Pipelined partitions hand buffers to the network layer as soon as they exist, and the consumer reads them while the producer still writes. Blocking partitions write the full output to storage first, then serve it to consumers later, used for batch. Subpartitions track backlog, which is the count of buffers queued, and send it to the receiver so it can request buffers. Lifecycle, release and failure of partitions are coordinated with the scheduler.",
    k: ["Pipelined partitions vs blocking: pipelined gives low latency and small storage use, but all producer and consumer tasks must run at the same time, while blocking decouples them and survives consumer failure.", "One subpartition per consumer vs shared buffers: separate queues isolate consumers and backpressure per channel, at the cost of many more queues."],
    p: ["A consumer that never starts leaves a pipelined partition full and blocks the producer.", "Releasing partitions too early forces the producer to re-run on consumer failure."],
    v: "Inspect a running exchange: the backlog per subpartition must grow when the receiver is paused and shrink when resumed; a blocking partition must be complete and readable after the producer finishes.",
    dep: ["partitioners", "network-buffer-pool", "credit-based-flow-control"]
  },
  "input-gates": {
    s: "The receiver-side structure that gathers records from all upstream channels into one stream for a task, aligns barriers and combines watermarks across channels.",
    d: "An input gate owns one channel per upstream subpartition and, in a worker, takes buffers from local queues or from the network. It hands the next available buffer to the task, tracks the watermark per channel and takes the minimum, and implements barrier handling: blocking channels that delivered a barrier until all have, or forwarding it for unaligned snapshots. For multiple inputs it chooses which input the task reads next. Hard parts are fairness between channels and handling a failed channel.",
    k: ["Reading from any ready channel vs strict round-robin: any-ready uses data as soon as it exists, whereas round-robin is fairer and tighter in time alignment.", "Blocking channels for alignment vs buffering them: blocking is simple and bounded but can slow the upstream, while buffering needs memory."],
    p: ["A skewed channel with large backlog starves others of attention and delays watermarks.", "An upstream task that reconnects after failure delivers duplicate data when its sequence handling is broken."],
    v: "Send barrier n on one of four channels and delay the others: the gate must hold the first channel until all four arrive, and the alignment time metric must record the wait.",
    dep: ["watermark-propagation", "barrier-alignment", "credit-based-flow-control"]
  },
  "network-buffer-pool": {
    s: "A fixed pool of memory segments from which all network buffers are drawn, with exclusive buffers per channel and a shared floating pool, bounding total memory used for shuffles.",
    d: "At worker start, the pool allocates segments of a fixed size, for example 32 KB. Each input channel is assigned some exclusive buffers, which it announces to the sender as credit, plus access to floating buffers shared among channels of the gate. Output uses pools sized per partition. When no buffer is free, writers wait: that is where backpressure begins. Sizing depends on channel counts, which grow with parallelism, and on the desired in-flight data for throughput.",
    k: ["Many small buffers vs few large ones: small buffers lower latency and per-channel memory, large buffers raise throughput and need fewer system calls.", "Exclusive per-channel buffers vs only a shared pool: exclusive buffers guarantee progress for every channel, whereas a shared pool uses memory better but allows starvation."],
    p: ["Raising parallelism without raising the pool size causes buffer starvation and a start-up failure with insufficient buffers.", "Too much in-flight buffer data inflates checkpoint size under unaligned snapshots."],
    v: "Monitor pool usage during a load test: queues in-use must stay at or below the pool size, and halving the pool must lower the in-flight data and raise backpressure metrics rather than cause errors.",
    dep: ["task-manager", "credit-based-flow-control"]
  },
  "credit-based-flow-control": {
    s: "The receiver tells each sender how many buffers it can accept, and the sender transmits only that many, so one slow channel never blocks other channels sharing the connection.",
    d: "Each input channel announces credit equal to the number of free buffers. The sender sends a buffer only when it has credit for that channel and tells the receiver its backlog so the receiver can claim floating buffers. Multiple channels share one connection between two workers, so credit stops a stalled channel from filling the connection and blocking others. As consumers process, buffers are released and new credit is sent. Compared with plain transport-level pressure, it localizes slowdowns to the affected channel and keeps latency low.",
    k: ["Application-level credit vs relying on the transport window: per-channel control and no head-of-line blocking on shared connections, at the cost of protocol complexity and credit messages.", "Backlog announcement vs fixed credit: the receiver can assign buffers where data is, while fixed credit wastes buffers on idle channels."],
    p: ["Credit messages lost or mishandled leave a channel with zero credit forever and an apparently idle job.", "Too few exclusive buffers per channel throttle throughput at high latency links."],
    v: "Stall one downstream task and watch the others on the same connection: their throughput must be unaffected, while the stalled channel's credit drops to zero and its sender's queue grows.",
    dep: ["network-buffer-pool", "input-gates", "result-partitions"]
  },
  "backpressure": {
    s: "When a consumer cannot keep up, its input buffers fill, credit runs out and senders wait, so slowness propagates upstream all the way to the sources instead of dropping data.",
    d: "Backpressure is not a component but an emergent behavior of bounded buffers: a slow operator stops releasing input buffers, so upstream output buffers fill and upstream tasks block when asking for a buffer. At the source, reading slows or stops, and the external system accumulates backlog. It is safe, since nothing is lost, but it raises latency and delays checkpoint barriers. Finding the cause means locating the first slow task from the sink side, since everything upstream shows as pressured.",
    k: ["Propagating pressure to the source vs dropping or buffering without bound: no data loss and bounded memory, but latency grows and sources must tolerate pausing.", "Reacting to slow operators vs scaling out: backpressure is automatic, while fixing the cause needs parallelism, tuning or removal of the bottleneck."],
    p: ["Engineers fix the pressured operator, which is a victim, instead of the slow one downstream of it.", "Long backpressure grows checkpoint duration until checkpoints time out and the job fails."],
    v: "Slow the sink deliberately and check metrics: operators from the sink backwards should report backpressured time rising, the source read rate should fall to the sink rate, and the memory use must stay flat.",
    dep: ["credit-based-flow-control", "network-buffer-pool", "mailbox-thread-model"]
  },
  "blocking-shuffle": {
    s: "A batch exchange where producers write complete, sorted or hashed output to local storage and consumers read it later, so stages run one after another and recover independently.",
    d: "Used in batch mode, each producer writes its output into files, one logical section per consumer, and marks the partition finished. Consumers are scheduled after producers complete and fetch their sections, using the shuffle service on the worker that holds the files. This decouples stages, allows resources to be released between them, and limits recovery to missing partitions. It needs disk space and has latency. Hash and sort variants differ in file counts and read patterns, which matter at high parallelism.",
    k: ["Blocking exchange vs pipelined: stages can restart independently and need fewer concurrent resources, but nothing downstream starts early and disk is used.", "Sort-based vs hash-based layout: sort-based writes few files and reads sequentially, hash-based is simpler and creates many small files."],
    p: ["Losing the worker that holds finished partitions forces the producing stage to re-run.", "Hash-based shuffle at large parallelism produces millions of tiny files and exhausts file handles."],
    v: "Run a batch job, kill a worker after the first stage finished, and confirm only the lost partitions are recomputed and the final output matches an uninterrupted run.",
    dep: ["result-partitions", "execution-mode-selection", "task-manager"]
  },
  "value-state": {
    s: "A single value per key, readable and replaceable by user code, the simplest keyed state and the basis of counters, latest-value caches and flags.",
    d: "Within a keyed operator, a handle declared with a name and a type serves the value for the current key. Reading returns the last stored value or empty; updating writes a new one; clearing removes it. The backend serializes values, so every access through an embedded store pays serialization, while the in-memory backend holds objects. Names identify the state across versions of the job. The value type is part of snapshot compatibility, which makes changing it later a migration.",
    k: ["Small values replaced often vs large values: small is cheap, while updating a large value on each record rewrites it entirely in an embedded store.", "One state per concern vs one composite object: separate states can be added or dropped independently, a composite is one read and write but harder to evolve."],
    p: ["Mutating a read object without writing it back works on the in-memory backend and loses data on the embedded store.", "Never clearing the state for finished keys grows the store forever."],
    v: "Count records per key with value state, restart from a snapshot, and send more records: counts must continue from the restored values for every key, for both backends.",
    dep: ["state-backend-interface", "keyed-stream-api", "key-groups"]
  },
  "list-state": {
    s: "An append-oriented list of values per key, supporting add, bulk update and iteration, used to buffer records or keep recent history.",
    d: "Appending to a list is cheap in an embedded store, since it can be implemented as a merge operation without reading the existing list. Reading returns the whole list, so cost grows with its size. It is useful for buffering records until a condition holds, keeping the last N events, or window contents. There is no random access or removal of single elements, so trimming means rewriting the list. Lists that grow without limit become the largest state in a job and a source of slow reads.",
    k: ["List per key vs one entry per element in a map: a list appends cheaply but is read whole, while a map can fetch and delete individual items.", "Bounded rewrite on trim vs unbounded append: keeping a fixed number of elements costs a rewrite, but leaving it unbounded costs memory and reads."],
    p: ["Reading a list with millions of entries on each record turns a cheap operation into a major stall.", "Appending forever without a timer to clear it for finished keys grows without bound."],
    v: "Append ten thousand elements to one key and time a read against appending to ten thousand keys: the single large list read should be visibly slower, showing the cost model.",
    dep: ["state-backend-interface", "embedded-kv-backend"]
  },
  "map-state": {
    s: "A map from user key to value inside each stream key, allowing individual entries to be read, written, removed and iterated without loading the rest.",
    d: "Entries are stored as composite keys of stream key, namespace and map key in the backend, so single reads and writes are efficient and the full map is never loaded unless iterated. In an embedded store, iteration over one stream key's entries uses a prefix scan in key order. It is the right structure for per-key indexes, join buffers and sets. Serialization of the map key affects ordering and therefore scan behavior. Maps with huge entry counts per key still make a hot key a hot spot.",
    k: ["Map state vs value state holding a map: individual access without deserializing everything, but each entry is a separate store entry with its own overhead.", "Ordered map-key serialization vs hash-friendly: ordered keys enable range scans, but only if serialized bytes sort in the intended order."],
    p: ["Iterating a map with many entries on each record reads the whole thing and kills throughput.", "A map key serializer whose bytes do not sort as the logical values break range scans."],
    v: "Store a million entries under one key and read one by key: latency must be independent of map size, whereas full iteration time grows with it, as measured by the backend metrics.",
    dep: ["state-backend-interface", "embedded-kv-backend"]
  },
  "operator-state": {
    s: "State owned by an operator instance rather than a key, such as source offsets or buffered sink data, redistributed by a declared scheme when parallelism changes.",
    d: "Each parallel instance holds a list of state items. When snapshotted, items are written per instance; when restored at a different parallelism, items are redistributed either by splitting the combined list evenly across new instances, or by giving every instance the full union. Sources use this for their split positions; sinks use it for pending transactions. It is not tied to keys, so user code decides what an item means and how it can be split. The hard part is making items independent enough to move between instances.",
    k: ["Even split redistribution vs union: split moves each item to exactly one instance and scales well, while union gives all items to all instances and lets each choose, at the cost of size.", "Operator state vs keyed state: no key is needed and it fits connectors, but redistribution is coarse and not aligned with data routing."],
    p: ["Items that depend on the instance index break when parallelism changes.", "Union redistribution of a large state multiplies it by the parallelism at restore."],
    v: "Snapshot a source with eight splits across four instances, restore at six: every split must belong to exactly one instance and reading must continue from each saved position.",
    dep: ["state-backend-interface", "rescaling", "split-readers"]
  },
  "state-ttl": {
    s: "A per-entry expiration that hides and eventually deletes keyed state after a period of no update or access, bounding state growth for keys that go quiet.",
    d: "State is wrapped with a last-modified timestamp. On read, expired entries are treated as absent. Physical deletion happens lazily on access, on snapshot, or during backend compaction, depending on the backend. The expiration can refresh on write or on read and on creation. It uses processing time, so it is not reproducible and a long outage ages state. It is a hygiene mechanism, not a correctness one, unless the logic accepts that old keys are forgotten.",
    k: ["Expire on write vs on read and write: write-only is cheap and predictable, while refresh on read keeps hot keys alive but writes on every read.", "Lazy cleanup vs eager timers: lazy is cheap but expired data lingers in storage, eager is exact but costs a timer per entry."],
    p: ["Expired state is still counted in size until compaction, which confuses capacity planning.", "A job paused for an hour on processing time TTL resumes with all state already expired."],
    v: "Set a one-minute TTL, write a key, wait 61 seconds and read it: it must be absent, and after a compaction or snapshot the state size metric must have dropped accordingly.",
    dep: ["state-backend-interface", "processing-time"]
  },
  "key-groups": {
    s: "A fixed number of hash buckets of the key space, the atomic unit of keyed-state redistribution: each instance owns a contiguous range, and rescaling moves whole groups.",
    d: "A key is hashed into one of max-parallelism key groups. Each parallel instance is assigned a contiguous range of groups. State is written to snapshots grouped by key group, so on restore at a different parallelism each instance reads only the groups it now owns, without scanning others. The count is fixed for a job's life, which is why max parallelism is chosen early. Routing uses the same mapping, so data and state always meet at the same instance.",
    k: ["Key groups as indirection vs direct hashing to instances: rescaling moves whole ranges efficiently, at the cost of a fixed upper bound on parallelism.", "Contiguous ranges vs scattered assignment: contiguous ranges mean sequential reads and little metadata, while scattered assignment balances skew better."],
    p: ["A skewed hash leaves some groups much heavier, and contiguous ranges cannot rebalance them.", "Changing the hash function between versions invalidates all state."],
    v: "Restore a snapshot at a different parallelism and count the files or ranges each instance reads: only its owned key-group ranges must be fetched, and every key's value must be found on the instance the router selects.",
    dep: ["parallelism-and-max-parallelism"]
  },
  "state-backend-interface": {
    s: "The contract between operators and storage: create keyed or operator state, read and write by key and namespace, snapshot asynchronously, and restore from a snapshot at any parallelism.",
    d: "The backend creates state handles on request, scoped to the current key and a namespace such as a window. It provides a snapshot method that returns a handle to durable data, a restore method that rebuilds from handles, and timer queues. It decides where working state lives, how reads and writes are serialized, and how snapshots are produced. Operators and user functions are written against the interface, so the backend can be changed with configuration. Hard parts are consistent snapshots while writes continue, and efficient redistribution on restore.",
    k: ["Pluggable backend behind one interface vs a single built-in store: choose per job by state size and latency, but behavior such as object versus serialized access differs subtly.", "Snapshot returns a handle vs writes inline: handles allow asynchronous upload and incremental reuse, while inline writes are simpler and block the task."],
    p: ["Code that works on the in-memory backend breaks on the embedded one because objects are copies, not references.", "Switching backends requires a savepoint in a portable format, not a checkpoint."],
    v: "Run the same job with both backends and compare outputs: they must match, and a savepoint taken on one backend must restore into the other.",
    dep: ["key-groups", "snapshot-async-phase"]
  },
  "heap-state-backend": {
    s: "Keeps working state as objects in the worker's memory and serializes only when snapshotting, giving the fastest access but bounding state by memory.",
    d: "State is held in in-memory hash tables, keyed by key group, key and namespace. Reads and writes are object access with no serialization, so latency is lowest. Snapshots copy the structure, usually by copy-on-write so that the task can keep running, and then serialize it in the background. State size is limited by heap, and large heaps cause long collection pauses that stall tasks and heartbeats. It suits small to moderate state and low latency, and it needs no native memory tuning.",
    k: ["Objects in memory vs serialized in an embedded store: faster and simpler, but state must fit on the heap and large heaps pause.", "Copy-on-write snapshots vs a synchronous copy: the task keeps processing, at the cost of extra memory while the snapshot runs."],
    p: ["State growth leads to long pauses and then an out-of-memory failure that restarts the job into the same growth.", "Mutating a state object after reading it, without updating, changes it silently."],
    v: "Grow state steadily and watch pause times and heap usage: pauses should rise with state size, and a snapshot during load must complete while the task keeps processing records.",
    dep: ["state-backend-interface"]
  },
  "embedded-kv-backend": {
    s: "Stores state in an embedded, disk-backed ordered key-value store inside each worker, so state can exceed memory, with serialized access and background compaction.",
    d: "State is kept in a log-structured store: writes go to an in-memory table, then are flushed to sorted files on local disk and merged by background compaction. Each state name maps to a column family. Reads check memory, a block cache, then files, and every access serializes keys and values. It supports state far larger than memory, and its immutable files make incremental snapshots possible. Costs include read and write amplification, native memory outside the managed heap, and tuning of caches and compaction.",
    k: ["Disk-backed ordered store vs in-memory objects: state bigger than RAM and incremental snapshots, but every access pays serialization and potential disk reads.", "Aggressive compaction vs lazy: aggressive reduces read cost and space, lazy lowers background load but lets files accumulate."],
    p: ["Compaction falling behind causes write stalls that appear as sudden backpressure.", "Using the default block cache size on a small disk-bound job produces poor read performance."],
    v: "Load state ten times larger than memory and read random keys: the job must run, per-access latency should be milliseconds not microseconds, and local disk usage must stabilize after compaction.",
    dep: ["state-backend-interface", "managed-memory", "incremental-checkpoints"]
  },
  "state-schema-evolution": {
    s: "Changing the type of state, adding a field or replacing a serializer, while still restoring existing snapshots, by migrating bytes written under the old schema.",
    d: "Each state entry in a snapshot records its serializer's configuration snapshot. On restore the new serializer is asked whether it is compatible: identical, compatible after migration, or incompatible. Migration reads every entry with the old serializer and writes with the new one, which costs time proportional to state size. Formats with built-in evolution, for example field addition with defaults, make this routine; plain class serialization usually does not. Planning evolution means choosing evolvable formats before the first snapshot exists.",
    k: ["Evolvable schema formats vs fast class-based serialization: fields can be added safely, at the cost of slightly larger and slower records.", "Eager migration at restore vs lazy per-access: eager is simple and finished once, lazy starts faster but runs migration code in the hot path."],
    p: ["Using a serializer with no evolution support turns every field change into a stateful migration with downtime.", "A migration over terabytes of state delays recovery by hours."],
    v: "Take a savepoint, add a field with a default to the state type, and restore: the job must start, old entries must read with the default, and incompatible changes must be rejected before any records are processed.",
    dep: ["type-system", "state-backend-interface", "savepoint-upgrades"]
  }
});
