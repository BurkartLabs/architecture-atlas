// Details for the matching engine plate, part 4: persistence, failover, latency engineering.
ATLAS.details("matching-engine", {
  "event-log": {
    s: "An append-only record of every sequenced input, in order, from which the entire state of the engine can be rebuilt by replay.",
    d: "Each entry holds a sequence number, a time, the message type and its payload. The log is written by the sequencer before or as the engine consumes the entry, and is read by the engine, standbys, the audit trail, the feed publisher and replay tools. Entries are never modified. Outputs can be logged as well, to check replays. It is hard because it is on the critical path of every order, its write cost sets part of the latency floor, and its format must stay readable for years.",
    k: ["Log inputs only vs. inputs and outputs: inputs are smaller and fully sufficient given determinism, while logging outputs lets replays be checked and doubles storage.", "Binary log with a versioned schema vs. text: binary is compact and fast, while text is easy to inspect and slow and large."],
    p: ["A log entry is acknowledged to the member before it is durable, and a crash loses an order the member believes is live.", "A change to the message format breaks reading older log segments."],
    v: "Kill the engine mid-run, restart from the log and confirm that every order acknowledged to members before the kill is present in the recovered state, and the next sequence number continues without a gap.",
    dep: ["journal-storage","binary-encoding"]
  },
  "journal-storage": {
    s: "The media and write path that make log entries durable: fast persistent memory, local solid-state disks or replication to other machines, chosen by how much delay each order can bear.",
    d: "Options range from memory-mapped files flushed asynchronously, to synchronous writes to persistent memory or fast disks, to acknowledgment by a quorum of replicas over the network. Writes are batched and aligned to block sizes, and the disk path is isolated from other I/O. Durability is defined as survival of the failure the venue designs for: a process crash, a machine loss or a site loss. It is hard because each stronger guarantee costs microseconds on every order, and the weak case loses orders silently.",
    k: ["Replicate to a second machine's memory vs. fsync to local disk: network replication is faster and survives machine loss, while local disk survives a power loss of both machines.", "Group commit across messages vs. one write per message: grouping raises throughput and adds a bounded wait, while per-message writes are simple and cost latency."],
    p: ["Write caches in the disk controller acknowledge before data is on stable media, and a power loss drops acknowledged orders.", "Journal disk shares a bus with logging and metrics traffic and shows periodic multi-millisecond stalls."],
    v: "Pull power from the active and standby simultaneously in a test rig during peak traffic and confirm that every order that was acknowledged to a client exists in the recovered log.",
    dep: ["server-tuning","hardware-offload"]
  },
  "state-snapshots": {
    s: "Periodic copies of the engine's complete in-memory state, tagged with the sequence number they reflect, which let recovery start from the snapshot instead of replaying the whole day.",
    d: "A snapshot captures books, resting orders, risk state, stop stores, phase, counters and reference data. It is written by a fork-like copy or by a background thread over a consistent point, so the matching thread is not paused for long. Recovery loads the newest valid snapshot and replays the log after its sequence number. It is hard because the snapshot must be consistent at one sequence number, its cost must not disturb the hot path, and every new state field must be added to it or recovery silently diverges.",
    k: ["Copy-on-write snapshot vs. stop briefly and copy: copy-on-write is nearly pause-free and uses extra memory, while a brief stop is simple and appears in tail latency.", "Frequent snapshots vs. rare: frequent ones shorten replay and add load, while rare ones are cheap and slow to recover."],
    p: ["A newly added field is left out of the snapshot and recovered engines differ from live ones in rare cases only.", "The snapshot thread competes with the core for memory bandwidth and delays matching."],
    v: "Take a snapshot at a random point, restore it in a fresh process, replay the log to the present and compare the state hash against the live engine. It must be identical.",
    dep: ["event-log","deterministic-state-machine"]
  },
  "replay-engine": {
    s: "The tool and mode that feeds a recorded input log through the engine to rebuild state, reproduce an incident or bring a restarted node back in line with the live stream.",
    d: "Replay runs the same engine binary with inputs read from the log instead of the live sequencer, at full speed or paced by the original timestamps. It can stop at any sequence number to inspect the book, emit outputs for comparison and run in a catch-up mode that switches to live input when it reaches the head. It is hard because it depends on determinism, because a replay must use the code version that matches the log, and because catch-up must handle a stream that moves while it runs.",
    k: ["Same binary for replay and live vs. a separate replay tool: the same binary guarantees identical logic, while a separate tool is easier to instrument and can drift.", "Replay at full speed vs. original pacing: full speed recovers fastest, while original pacing reproduces timing-related behavior."],
    p: ["Replaying with a newer binary changes behavior and the recreated state does not match what happened.", "Catch-up never reaches the head because new input arrives faster than replay consumes it."],
    v: "Replay a recorded incident hour to the exact sequence number at which it occurred and confirm that the book and output stream match the recorded production output byte for byte.",
    dep: ["event-log","state-snapshots","deterministic-state-machine"]
  },
  "log-archival": {
    s: "Moves closed log segments off the fast journal into compressed, checksummed, long-term storage while keeping them available for replay, disputes and regulators.",
    d: "At the end of the day, or at segment size limits, logs are sealed, compressed, hashed and copied to bulk storage and to a second site. An index maps sequence ranges and dates to files. Retrieval for a dispute decompresses and replays the relevant segment. It is hard because archives are written once and read rarely, often years later, so corruption or format drift is found only when it is needed, and because volume for a busy venue is large.",
    k: ["Compress aggressively vs. leave raw: compression saves substantial storage and costs time on retrieval, while raw is fast to read and expensive to keep.", "Archive in the engine's native format vs. a neutral format: native is exact and ties the archive to the version, while neutral survives upgrades and may lose detail."],
    p: ["Archives are never read back and silent corruption goes unnoticed until a regulator requests them.", "The archival job runs on the same disks as the next day's journal and slows the open."],
    v: "Each week, restore a random archived day from the second site, verify checksums and replay its first and last hour, and confirm the output matches the stored audit trail.",
    dep: ["event-log","journal-storage"]
  },
  "replay-testing": {
    s: "Using recorded production input logs as the main regression test for engine changes: replay them through a candidate build and compare outputs with what production produced.",
    d: "A test farm replays many days of real traffic through the candidate and diffs the output stream, the trades and the final state against recorded production results. Intentional behavior changes are expected to show up as diffs, which are reviewed and approved explicitly. Selected extreme days, such as crashes and auctions with big imbalances, are kept in a permanent set. It is hard because realistic inputs include sensitive member data that must be protected, and because a diff must be explained, not merely accepted.",
    k: ["Byte-exact output comparison vs. comparing key fields: byte-exact catches everything and flags harmless changes, while key-field comparisons are quieter and miss unintended differences.", "Replay production days vs. generate synthetic scenarios: production days are realistic and cover only what happened, while synthetic scenarios reach rare paths and look unreal."],
    p: ["Tests replay only the days with normal volume and miss the behavior on the rare day with a halt.", "Recorded orders carry member identifiers and the test environment is not protected like production."],
    v: "Run the previous release over the last thirty recorded days and confirm zero output diffs. Then run a candidate with a deliberate behavior change and confirm the diffs appear exactly where expected.",
    dep: ["replay-engine","event-log"]
  },
  "hot-standby": {
    s: "A second engine instance that applies the same input stream in real time, holding identical state, ready to take over as the active node within moments.",
    d: "The standby receives the sequenced input, either from the log replication or from the sequencer directly, and runs the same deterministic code to maintain its own copy of every book and the risk state. It produces outputs that are discarded or compared rather than sent. On failover, it begins emitting from the sequence number after the last output the active node published. It is hard because it must keep up without ever lagging, run on equivalent hardware, and be exercised regularly or it fails when needed.",
    k: ["Hot standby applying inputs vs. cold standby loading a snapshot: hot takes over in microseconds to seconds and doubles the hardware, while cold is cheaper and needs minutes.", "Standby suppresses output vs. both emit and downstream deduplicate: suppression is clean and needs a clear switch, while dual output is fast and pushes complexity to receivers."],
    p: ["The standby has lagged for hours without alarm and failover loses the recent orders.", "The standby runs on slightly different hardware and a timing difference makes it behave differently under load."],
    v: "Compare state hashes between active and standby every few seconds in production and alarm on any difference. Trigger a planned failover weekly and confirm that no order is lost or duplicated.",
    dep: ["input-replication","deterministic-state-machine","replay-engine"]
  },
  "input-replication": {
    s: "Carries the sequenced input stream from the sequencer to the standby and the log in the same order, with delivery guarantees, so every copy sees the same inputs.",
    d: "The sequencer, or a replicator behind it, sends each entry to the active engine, standby engines, and the log writers. Delivery is ordered and reliable, using either a reliable multicast with gap fill or point-to-point streams. Some designs require acknowledgment from a standby before the active node may act, which makes failover exact at a latency cost. It is hard because the replication path is on the critical path, and a lagging or partitioned replica must not slow the active node unboundedly.",
    k: ["Active waits for standby acknowledgment vs. does not: waiting gives zero loss on failover and adds a network round trip to every order, while not waiting is faster and may lose the last few messages.", "Replicate inputs vs. replicate resulting state: inputs are small and need determinism, while state replication tolerates nondeterminism and moves more data."],
    p: ["A replica falls behind quietly and the system continues, so its promotion would drop orders.", "A network partition leaves both sides running with their own view of input order."],
    v: "Inject packet loss between the sequencer and standby, then confirm the standby detects and fills every gap, ends with an identical log, and the active node's latency is unchanged within budget.",
    dep: ["sequencer","multicast-distribution","kernel-bypass-networking"]
  },
  "failure-detection": {
    s: "Finds out that the active engine, a gateway or a link has failed or become too slow, quickly enough to act, without declaring healthy nodes dead.",
    d: "Heartbeats flow between nodes at short intervals, and are supplemented by checks that the engine is making progress, such as advancing sequence numbers and a bounded output delay. A watchdog can also consider the hardware, such as a NIC or disk fault. Declared failure feeds the failover logic. It is hard because the trade-off is direct: a short timeout detects real failures fast and also triggers on pauses and bursts, causing needless failovers, which are themselves risky.",
    k: ["Aggressive timeouts vs. conservative: aggressive detection limits downtime and risks false failovers on a pause, while conservative avoids flapping and lengthens outages.", "Heartbeat only vs. progress-based checks: heartbeats are simple and can come from a thread that is alive while matching is stuck, while progress checks catch real stalls."],
    p: ["A heartbeat thread keeps running while the matching thread is deadlocked, and no failover occurs.", "A brief pause from a disk stall triggers failover and the new active node inherits the same cause."],
    v: "Freeze the matching thread, kill the process, drop the network and slow the disk in turn in a test, and confirm that each fault is detected within the stated time, with no false detection under peak load.",
    dep: ["monitoring-and-alerting","hot-standby"]
  },
  "leader-fencing": {
    s: "Decides which node is the single active engine and makes sure the old one can no longer act, so two nodes never publish conflicting results.",
    d: "A small consensus group or a dedicated arbiter grants leadership with a numbered term. A node acts only while it holds a valid term, and outputs carry the term so receivers reject stale ones. Fencing cuts the old node off physically, through a switch port, power control or a token checked by gateways. It is hard because a node that is slow rather than dead may continue to act after being replaced, and because the safe choice during a network split is sometimes to halt trading.",
    k: ["Consensus-based election vs. a static primary with manual promotion: consensus is automatic and adds machinery and latency in failure, while manual promotion is simple and slower.", "Fence by cutting power or ports vs. by tokens: physical fencing is absolute and requires hardware control, while tokens are cheap and depend on every receiver checking them."],
    p: ["A node that paused for a long garbage-free stall resumes and publishes with an old term after promotion.", "Both data centers promote themselves during a link outage and the venue splits into two markets."],
    v: "Partition the network between active and standby in a test and confirm that exactly one node continues publishing, the other stops within the bound, and no message from the old term is accepted afterwards.",
    dep: ["failure-detection","sequencer"]
  },
  "session-recovery": {
    s: "Restores member sessions and their state after failover, so connections come back with correct sequence numbers, and members learn exactly what their orders did.",
    d: "The new active node, with gateways, resumes session state from replicated sequence numbers and resends any unacknowledged messages. Members are told through reports and, where they reconnect, through status messages for working orders. Cancel-on-disconnect sessions are handled according to policy, since a failover may look like a disconnect. It is hard because gateways and members must agree on what was received, and because thousands of reconnects arrive at once.",
    k: ["Gateways reconnect to a new core transparently vs. members reconnect: transparent failover shields members and requires replicated session state, while reconnects are simple and visible.", "Mass cancel on failover vs. keep orders: canceling protects members from stale orders and costs them their queue positions, while keeping preserves positions and risks stale prices."],
    p: ["The new node restores sequence numbers from a lagging copy and members receive duplicate or missing reports.", "A reconnect storm overloads the logon path and members stay out through the first minutes."],
    v: "Fail over during heavy traffic with hundreds of sessions and confirm every session resumes with consistent numbers, every working order is reconciled in member reports, and no duplicates are created.",
    dep: ["session-layer","hot-standby","cancel-on-disconnect"]
  },
  "disaster-recovery": {
    s: "A complete secondary site that can run the venue if the primary data center is lost, with its own copies of the log, state and connectivity for members.",
    d: "The log is replicated to the recovery site continuously over a dedicated link, usually asynchronously because of distance, and a warm engine instance replays it. Members hold connections or ready credentials for the second site, and the feed's addresses are published for it. Switching involves a decision, reconciliation of what was lost in the replication lag, and agreed procedures. It is hard because distance adds latency to any synchronous design, so recovery point and recovery time are explicit trade-offs.",
    k: ["Asynchronous replication vs. synchronous: asynchronous keeps primary latency low and may lose the last orders, while synchronous loses nothing and adds the round trip to every order.", "Active recovery site always warm vs. started on demand: warm gives quick recovery at the full cost of a second venue, while on-demand is cheap and slow."],
    p: ["Orders acknowledged at the primary and lost in replication lag are not reconciled with members after the switch.", "The recovery site is never exercised and its configuration drifts from the primary."],
    v: "Run a full site-switch exercise at least annually: stop the primary, bring the venue up at the secondary and have members trade, then reconcile every order and trade against the primary's last log.",
    dep: ["log-archival","input-replication","replay-engine"]
  },
  "failback": {
    s: "Returning operations to the original node or site after a failover, by resynchronizing the repaired node and moving the active role back without losing or duplicating a message.",
    d: "The repaired node loads a snapshot, replays the log to the head, and runs as a standby until its state hashes match. A planned switch then promotes it, during a quiet period. Failback is often scheduled out of hours instead of done at once, since each switch is a risky event. It is hard because the node being returned has not been exercised under load, and the log diverged during its absence.",
    k: ["Fail back at once vs. stay on the new node until a quiet window: at once restores redundancy and design symmetry, while waiting avoids a second switch under stress.", "Rebuild the node from scratch vs. repair in place: rebuilding guarantees a clean state, while repair is quicker and trusts the old state."],
    p: ["The returned node joins as standby while still holding state from before the failure, and its log differs.", "Failback is done during a busy session to restore redundancy and causes a second outage."],
    v: "After a failover test, resynchronize the old node and confirm that its state hash equals the active node's at several sequence numbers before it is promoted. Then promote it with no order lost.",
    dep: ["hot-standby","state-snapshots","replay-engine"]
  },
  "latency-budget": {
    s: "A target for each stage of an order's path, from wire in to wire out, set as a high percentile rather than an average and tracked per release.",
    d: "The budget divides the total, for example a few microseconds at the median and a bounded tail, into network in, gateway, sequencer, matching, journal write and network out. Each component owner has a number and a measurement. Targets are in percentiles up to the 99.99th and include the worst bursts. Releases that exceed the budget do not ship. It is hard because latency gets worse in tiny steps with every feature, and because tail latency is dominated by rare events such as cache misses, page faults and interrupts.",
    k: ["Budget on the tail vs. on the median: the tail is what members experience in bursts and is hard to hold, while the median is easy and hides the slow orders.", "Per-stage budgets vs. one end-to-end target: per-stage budgets assign ownership and can be gamed, while end-to-end matches reality and hides where the time goes."],
    p: ["The median is improved while the 99.99th percentile gets worse and members complain about a few slow orders.", "A new check is added to the hot path and uses a quarter of the budget with no review."],
    v: "Run a standard replay at peak rate on every release candidate and publish the per-stage latency histograms, confirming each stage stays within its budget at the stated tail percentile.",
    dep: ["latency-measurement"]
  },
  "lock-free-queues": {
    s: "Queues that pass messages between threads without locks, usually a single-producer, single-consumer ring buffer, so handoffs cost a few nanoseconds and cannot block.",
    d: "A ring buffer in shared memory has a producer sequence and a consumer sequence on separate cache lines. The producer writes the slot and then publishes its sequence; the consumer reads up to it. Memory ordering rules make this safe without locks. Busy-polling consumers avoid sleeping and waking cost. It is hard because correctness depends on memory ordering that is easy to get wrong, because a full queue needs a policy, and because false sharing of the counters destroys the performance.",
    k: ["Single-producer single-consumer rings vs. a multi-producer queue: single-producer rings are fastest and need one ring per producer, while multi-producer queues are convenient and cost contention.", "Busy-polling vs. blocking wakeups: busy-polling gives the lowest latency and burns a full core, while blocking saves power and adds microseconds."],
    p: ["Producer and consumer counters share a cache line and throughput falls by an order of magnitude.", "A full queue silently overwrites the oldest entries and messages vanish."],
    v: "Run a stress test with a billion messages and verify every message arrives exactly once, in order, with latency histogram tails under the budget, and with counters on separate cache lines in a profiler.",
    dep: ["cache-aware-layout","cpu-isolation"]
  },
  "cpu-isolation": {
    s: "Dedicating specific processor cores to the hot path and keeping everything else, including the operating system, interrupts and other processes, off them.",
    d: "Critical threads are pinned to cores reserved from the scheduler, with interrupts redirected elsewhere, timer ticks suppressed and power-saving states disabled. Memory is allocated from the local memory node of that core. Hyper-threading siblings are left idle or used for non-critical work. It is hard because the reserved layout must be maintained across hardware and kernel changes, and because a stray task, such as a monitoring agent, landing on an isolated core shows up as a latency spike.",
    k: ["Isolated cores with busy polling vs. shared cores with the normal scheduler: isolated cores give flat tail latency at the cost of idle capacity and power, while sharing uses hardware well and has jitter.", "Disable sibling threads vs. use them for other work: disabling removes interference in shared core resources and halves the logical core count."],
    p: ["An operating system update changes interrupt routing and a network interrupt lands on the matching core.", "The thread runs on a core far from its memory and every access crosses a slow interconnect."],
    v: "Trace a full-speed run and confirm the hot thread was never descheduled, saw no interrupts and made no system calls, with the worst-case scheduling gap measured in nanoseconds.",
    dep: ["server-tuning"]
  },
  "allocation-free-hot-path": {
    s: "Avoiding any memory allocation, deallocation, system call or lazy initialization while processing an order, so there are no unpredictable pauses.",
    d: "Everything needed is allocated at start: pools, buffers, message objects and tables, then touched so pages are mapped. In the hot path, objects are reused and strings are avoided. Logging is done by writing binary records to a buffer drained by another thread. No exceptions, no dynamic dispatch where avoidable. It is hard because a single hidden allocation in a library can take a lock or call into the operating system, and these show up only as occasional tail latencies.",
    k: ["Preallocate everything vs. allocate on demand with a fast allocator: preallocation gives no surprises and fixed limits, while an allocator is flexible and has rare slow paths.", "Binary deferred logging vs. formatted logging inline: deferred logging costs nanoseconds and needs a decoder, while inline formatting is readable and costs microseconds."],
    p: ["A library used for formatting allocates in a rare error branch and stalls the engine for milliseconds.", "Pools are sized for average load and exhausted during a rare burst."],
    v: "Run a full-speed replay under a tool that counts allocations and system calls on the hot thread and confirm both are zero after warm-up, including during error and reject paths.",
    dep: ["book-memory-pools","single-writer-core"]
  },
  "cache-aware-layout": {
    s: "Arranging data so the fields touched together sit together in memory, to cut cache misses, which cost far more than the instructions around them.",
    d: "Order records are compact and aligned to cache lines, with hot fields such as price and remaining quantity together and cold ones, such as owner details, apart. Price levels near the market are stored contiguously. Arrays of small structures replace linked pointers where possible. Counters written by different threads are padded onto separate lines. It is hard because the right layout depends on the access pattern, which changes with features, and because layout gains are lost silently when a field is added.",
    k: ["Structure of arrays vs. array of structures: separate arrays make scans over one field fast, while one structure per order keeps whole-order access to a single line.", "Compact integer fields vs. natural-size fields: compact fields shrink the working set and need conversions and care about overflow."],
    p: ["A new field pushes the order record across a cache line boundary and matching slows by a fifth.", "Two threads write adjacent counters and cause constant cache-line transfers."],
    v: "Read hardware counters during a replay and confirm that last-level cache misses per order stay under the stated figure and that top-of-book operations touch the expected small number of lines.",
    dep: ["book-memory-pools"]
  },
  "binary-encoding": {
    s: "Compact, fixed-layout message formats that can be read directly from the buffer without parsing, used between gateways, core, log and feed.",
    d: "Fields have fixed offsets and sizes, integers are in a single byte order, and optional or variable parts sit at the end, so decoding is a pointer cast and a few loads. A schema generates encoders and decoders, with a version number and rules for adding fields at the end. The same encoding is used for the log, so replay needs no conversion. It is hard because the format is hard to change once the log and members depend on it, and because unaligned or mismatched layouts across languages cause subtle errors.",
    k: ["Fixed-offset binary with schema vs. a self-describing format: fixed-offset is the fastest to read and needs the schema to be understood, while self-describing is flexible and larger and slower.", "Append-only schema evolution vs. versioned incompatible formats: append-only keeps old data readable, while breaking changes are cleaner and cut off old consumers."],
    p: ["Two builds disagree on field padding and silently read garbage across the boundary.", "A field is reused with a new meaning and old log segments decode to wrong values."],
    v: "Round-trip a generated corpus of every message type through the encoder and decoder in each component and language, then decode last year's archived log with the current schema, and confirm identical results.",
    dep: []
  },
  "latency-measurement": {
    s: "The instruments that measure order latency from wire to wire, with hardware timestamps at the boundary and histograms of the full distribution, not just averages.",
    d: "Timestamps are taken by network hardware as packets enter and leave, and by the software at stage boundaries, all on one synchronized clock. Matching them per order yields the end-to-end and per-stage latency, recorded into histograms with enough resolution in the tail. Taps on the network can measure independently of the software under test. It is hard because measuring changes what is measured, because clock error can exceed the latency, and because coordinated omission, where slow orders delay the measurement of others, understates the tail.",
    k: ["Network taps with external timestamping vs. internal software timestamps: taps are independent and cost hardware, while internal stamps are cheap and include the system's own errors.", "Record every order vs. sample: recording every order captures the tail and needs fast storage, while sampling is light and misses rare events."],
    p: ["A load generator that waits for each reply hides the stalls of the slowest orders.", "Clock offset between two timestamp points is larger than the measured latency and gives negative values."],
    v: "Send a calibration signal with a known delay through a loop of the real hardware and confirm the measurement reports that delay within its stated error, then check the histogram tail against an independent tap.",
    dep: ["hardware-timestamping","clock-synchronization"]
  },
});
