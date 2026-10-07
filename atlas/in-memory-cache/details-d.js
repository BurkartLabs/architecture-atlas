// Details for the in-memory cache plate, part 4: replication, failover and clustering, foundation, cross-cutting.
ATLAS.details("in-memory-cache", {
  "replica-handshake": {
    s: "The connection sequence in which a replica contacts its primary, authenticates, announces its capabilities and states the replication position it wants to continue from.",
    d: "A replica opens a connection to its configured primary, pings, authenticates if required, and sends its listening port and capabilities such as support for diskless transfer. It then sends a synchronization request carrying the replication id and offset it last knew. The primary decides between a partial resync, if it still has the missing data, and a full one. During the exchange the replica is in a connecting state and serves stale data or errors according to settings. TLS applies when configured. A failure at any step restarts the sequence after a delay.",
    k: ["Replica-initiated sync vs primary-initiated: replica-initiated lets a primary stay passive and survive replica restarts, but means replicas must keep retrying with backoff.", "Serve stale data during sync vs reject: serving stale keeps reads available, but readers may see old values with no sign of it."],
    p: ["A replica pointed at a primary whose password changed loops on failed authentication, with the only sign a log line.", "Many replicas reconnecting together after a network event all request full syncs and overload the primary."],
    v: "Start a replica against a running primary and confirm via the primary's replica list a connected replica with its port, state progressing to online, and an offset equal to the primary's.",
    dep: ["authentication", "replication-identity", "tls-transport"]
  },
  "full-resync": {
    s: "Bringing a replica from empty or too far behind to current by shipping a complete snapshot, then streaming the writes that happened during the transfer.",
    d: "The primary starts a snapshot child, or reuses one in progress for another replica, and records the replication offset at that point. While the snapshot is created, new writes are buffered per replica. When the file is ready it is sent, the replica discards its old data, loads the file, and then receives the buffered writes before joining the live stream. Cost is a fork, disk or network transfer, buffer memory on the primary and a load on the replica. It is the most expensive operation in replication, so the design avoids it with a backlog.",
    k: ["Full resync vs incremental catch-up: full resync is always correct, but expensive in time, memory and bandwidth; incremental is cheap and only possible within the backlog.", "Share one snapshot among waiting replicas vs one each: sharing saves forks and I/O, but newly arriving replicas must wait for the next snapshot cycle."],
    p: ["Replica buffers on the primary exceed their limit during a long transfer, the primary disconnects the replica, and the resync restarts in a loop.", "A full resync on a primary near its memory limit pushes it into eviction or an out-of-memory kill."],
    v: "Wipe a replica and connect it to a primary under steady writes, and confirm it loads a snapshot, applies the buffered writes, and ends with the same key count and a zero offset difference.",
    dep: ["snapshot-fork", "replication-stream", "buffer-budget", "replica-handshake"]
  },
  "diskless-transfer": {
    s: "Sending the snapshot directly from the child process to replicas over the network socket, skipping the write to and read from local disk.",
    d: "The child serializes the dataset and writes it to replica sockets, or to a pipe the parent forwards, rather than to a file. This helps where disks are slow or absent, and shortens resync time. The primary may wait a few seconds before starting so that several replicas arriving together can share one transfer. Replicas can load directly into memory or save to disk first. The trade-off is that a transfer is bound to the slowest replica in the group, and a failure restarts it with no file to reuse.",
    k: ["Diskless vs disk-backed transfer: diskless avoids disk I/O and is faster on slow disks, but cannot be reused for a later replica and runs at the pace of its slowest receiver.", "Replica loads into memory directly vs saves first: loading directly is faster, but a failed transfer leaves the replica with a partial or empty dataset."],
    p: ["A wait delay tuned for sharing slows the first replica, extending the time a cluster runs without redundancy.", "A transfer that fails halfway on a replica that already discarded its data leaves it empty until the retry succeeds."],
    v: "Connect two replicas within the delay window and confirm one child serves both with no snapshot file created on the primary, and both end with identical datasets.",
    dep: ["full-resync", "snapshot-format"]
  },
  "replication-stream": {
    s: "The ordered flow of write commands from the primary to each replica, replayed in the same order so the replica's dataset converges to the primary's.",
    d: "After executing a write, the primary appends it, in deterministic form, to a shared replication buffer and the backlog, and to each connected replica's output queue. Replicas apply the commands in order, advancing their offset by the number of bytes consumed, and periodically report their offset. The stream carries expiry deletes, script effects and transaction blocks as units. It is asynchronous: the primary replies to clients before replicas have applied, so acknowledged writes can be lost on failover. A heartbeat keeps idle links alive and lets replicas detect timeouts.",
    k: ["Asynchronous streaming vs synchronous replication: asynchronous keeps write latency at local speed, but acknowledged writes can be lost when the primary fails.", "Command replication vs value replication: command replication is compact, but needs deterministic commands; value replication is robust but larger."],
    p: ["A client reads from a replica right after writing to the primary and sees the old value, due to replication delay.", "A non-deterministic command that is not rewritten produces different results on replicas, so datasets silently diverge."],
    v: "Write a series of keys on the primary and confirm the replica's offset matches the primary's within a short lag, then compare dataset digests after writes stop to verify equality.",
    dep: ["replication-backlog", "expiry-propagation", "event-loop"]
  },
  "replication-backlog": {
    s: "A fixed-size in-memory ring holding the most recent part of the replication stream, so a briefly disconnected replica can resume instead of doing a full resync.",
    d: "The primary keeps the last several megabytes of the stream, indexed by offset. When a replica reconnects and asks to continue from an offset still in the ring, it is sent only the missing bytes. If the offset has been overwritten, a full resync is required. The size must cover the write volume during the longest expected disconnect. Backlog memory is shared with replica output buffers in recent designs. It is created with the first replica and freed some time after the last replica leaves.",
    k: ["Large backlog vs small: a large backlog tolerates longer outages without a full resync, but holds more memory on the primary all the time.", "Backlog tied to replicas vs always on: freeing it when no replicas exist saves memory, but a replica returning later cannot resume."],
    p: ["A backlog sized for average write rates is overwritten during a write burst, forcing full resyncs of every replica after a short blip.", "A very large backlog on a busy primary consumes memory the dataset needed, leading to evictions."],
    v: "Disconnect a replica for a period producing less data than the backlog size, reconnect, and confirm a partial resync with the stats showing no full sync; repeat with more data than the backlog and confirm a full one.",
    dep: ["replication-stream", "buffer-budget"]
  },
  "partial-resync": {
    s: "Resuming replication after a short disconnect by sending only the commands the replica missed, identified by replication id and offset, with no snapshot.",
    d: "The replica sends the id of the stream it was following and the next offset it needs. The primary accepts if the id matches its current or previous history and the offset is inside the backlog, replies that it will continue, and streams from that offset. The previous-id rule lets a newly promoted replica continue serving former siblings without a full sync after a failover. It is cheap and fast. If either condition fails, the primary falls back to a full resync. Correctness relies on the id and offset uniquely naming a position in one history.",
    k: ["Resume by id and offset vs always full sync: resuming turns blips into milliseconds, but requires careful history tracking to avoid resuming on divergent data.", "Accepting the previous id after promotion vs requiring a new one: accepting avoids resyncing all replicas on failover, but widens the cases where history identity must be right."],
    p: ["A replica that applied commands the old primary never replicated resumes against a new primary and holds divergent data, if the id logic is wrong.", "Frequent flapping links make many small resumes, each fine alone but together hiding a poor network."],
    v: "Pause a replica's connection briefly during writes, resume, and confirm the sync counter records a partial sync and the replica's dataset digest matches the primary's.",
    dep: ["replication-backlog", "replication-identity", "replica-handshake"]
  },
  "replication-identity": {
    s: "A random replication id naming one history of the dataset, plus a byte offset into it, so any node can state exactly where it is in the stream.",
    d: "Each primary generates a long random id when it starts a new history, and each byte of the stream increments an offset. A replica remembers the pair. When a replica is promoted, it creates a new id but keeps the old one as a secondary id up to the switch offset, so other replicas continuing the old stream can still resume. Comparing id and offset tells whether two nodes share history and how far apart they are. Offsets also drive the choice of which replica to promote, and the acknowledgments used by wait.",
    k: ["Random id plus offset vs a counter of epochs: random ids make independent histories distinguishable without coordination, but are opaque to humans.", "Keeping a secondary id after promotion vs a fresh start: keeping lets siblings resume without a snapshot, but needs a rule for how long the old identity stays valid."],
    p: ["Two nodes with the same offset but different ids hold different data, and treating offsets alone as equal causes divergence.", "Losing the saved id and offset on restart forces a full resync even after a brief outage."],
    v: "Promote a replica and confirm its id changes while its secondary id equals the old id, and that a sibling replica continues with a partial resync using the old id.",
    dep: ["replication-stream"]
  },
  "replica-reads-and-expiry": {
    s: "Rules for replicas serving reads: read-only by default, possibly stale, with expired keys hidden but not deleted until the primary says so.",
    d: "A replica rejects writes from normal clients by default, so its data only changes through the replication stream. Reads can be served to offload the primary, at the cost of reading data a little behind. Keys past their deadline appear missing to reads even though the replica waits for the primary's delete to remove them. Replicas can be configured to serve stale data or return errors while out of sync. Some commands that are read-only in effect are allowed. Writable replicas exist for scratch use, but their changes are lost on resync.",
    k: ["Read from replicas vs primary only: replica reads scale read throughput, but readers see stale data and may not see their own writes.", "Hide expired keys on read vs wait for delete: hiding gives correct reads from the first moment, but leaves the key's memory until the delete arrives."],
    p: ["Using a replica for read-after-write flows shows users their own changes missing, an intermittent bug that depends on lag.", "A writable replica used for temporary data loses it at the next full resync."],
    v: "Write on the primary and read the same key from the replica immediately and again after the lag, and confirm a write command sent directly to the replica is rejected with a read-only error.",
    dep: ["replication-stream", "lazy-expiry", "expiry-propagation"]
  },
  "min-replicas-guard": {
    s: "A setting that makes the primary refuse writes when too few replicas are connected and recently acknowledged, bounding how much data a failover can lose.",
    d: "The primary tracks the lag of each replica from their periodic acknowledgments. If fewer than a configured number have a lag below a threshold, it rejects write commands with an error. This limits the window in which acknowledged writes exist only on a primary that may be partitioned. It does not make replication synchronous or prevent loss entirely, since the last writes before the check may still be missing on replicas. It trades availability for safety: a primary isolated from its replicas stops accepting writes instead of diverging.",
    k: ["Refuse writes when replicas lag vs accept: refusing bounds data loss on failover, but makes replica failures cause write outages.", "Short lag threshold vs long: short thresholds detect trouble early but reject on brief hiccups; long ones tolerate hiccups and allow more loss."],
    p: ["Setting the minimum equal to the replica count means any single replica failure takes down writes.", "Assuming the guard gives zero loss; writes accepted just before the replicas fell behind are still lost."],
    v: "Configure a minimum of one replica, disconnect the replica, wait past the lag threshold, and confirm writes fail with an error while reads work; reconnect and confirm writes resume.",
    dep: ["replication-stream", "replication-identity"]
  },
  "wait-acknowledgment": {
    s: "A command letting a client block until a number of replicas have acknowledged all writes so far, or a timeout passes, to get stronger durability for specific writes.",
    d: "After writing, the client issues wait with a replica count and a timeout. The server asks replicas to report their offsets, and blocks the client until enough have reached the offset of the client's last write, then replies with the number that did. A companion form waits for persistence on the local log and on replicas. It converts asynchronous replication into acknowledged replication for the writes that need it, at the cost of latency for those writes, but does not make the cluster strongly consistent: after a timeout the write may or may not survive.",
    k: ["Wait per write vs always asynchronous: waiting gives confidence for important writes, but adds a round trip to the slowest needed replica.", "Reply count vs error on shortfall: returning the count lets the client decide what to do, but pushes the handling to every caller."],
    p: ["Treating a returned count equal to the request as a guarantee ignores later failover that may promote a replica that lacked the write.", "Blocking many clients on wait while replicas lag fills the server with waiting clients and increases latency."],
    v: "Write a key, call wait for one replica with a timeout, and confirm it returns one when the replica is healthy and zero after the timeout when the replica is paused.",
    dep: ["replication-stream", "blocking-operations", "replication-identity"]
  },
  "failure-monitor": {
    s: "A separate monitoring process, or set of them, that continuously pings primaries and replicas, decides when a primary is down, and reports the current primary's address to clients.",
    d: "Each monitor instance connects to the configured primaries, discovers their replicas and the other monitors, and pings them regularly. If a node does not answer within a timeout, that monitor marks it subjectively down. Monitors also publish hello messages that let them find each other and exchange views. Clients ask a monitor where the current primary is, instead of hard-coding an address. Monitors store their own configuration and rewrite it on changes. The design assumes several monitors on independent machines, since a lone monitor is a single point of failure.",
    k: ["Separate monitor processes vs failure detection inside the data nodes: separate monitors keep detection independent of the load on data nodes, but add processes to operate and secure.", "Short down timeout vs long: short detects failure quickly but triggers failovers on pauses; long avoids false alarms but extends outages."],
    p: ["Monitors placed on the same host or network segment as the primary all lose contact together and make wrong decisions together.", "Clients that cache the primary address and never ask the monitor again keep writing to a demoted node."],
    v: "Stop a primary and confirm each monitor marks it subjectively down after the timeout, and a client asking the monitors for the primary address gets the promoted node afterward.",
    dep: ["replica-handshake", "config-system"]
  },
  "monitor-quorum": {
    s: "Agreement among monitors that a primary is really down, followed by electing one monitor to carry out the failover, using a majority vote tied to a configuration epoch.",
    d: "When one monitor sees a primary as down it asks the others. If a configured quorum of them also see it down, it becomes objectively down. The monitors then elect a leader for that failover, each voting for one candidate per epoch, and the leader needs a majority of all monitors, not only the quorum. The leader picks a replica and promotes it. Quorum controls how readily failure is declared, while the majority requirement ensures only one failover happens in an epoch. A partition without a majority cannot fail over.",
    k: ["Low quorum vs high: a low quorum detects failure sooner but is easier to trip by a monitor-side network problem; a high one is conservative and may never reach agreement.", "Majority leader vote vs quorum alone: requiring a majority prevents two leaders in one epoch, but means failover is impossible when most monitors are lost."],
    p: ["Two monitors only means no majority can survive losing one, so failover is impossible exactly when needed.", "A quorum set larger than the number of reachable monitors means a down primary is never declared down."],
    v: "Run three monitors, stop the primary and one monitor, and confirm a failover still completes with the two remaining; stop a second monitor and confirm none is elected.",
    dep: ["failure-monitor", "config-epochs"]
  },
  "replica-promotion": {
    s: "Choosing the best replica after a primary fails, turning it into the new primary, and pointing the remaining replicas and clients to it.",
    d: "The leader monitor ranks replicas by priority, then by replication offset to prefer the most up-to-date, then by lowest id, and skips those disconnected for too long. It tells the chosen replica to become primary, waits for it to report that role, then instructs the other replicas to replicate from it, a few at a time to limit resync load. The old primary is marked as a replica and reconfigured when it returns. Writes accepted by the old primary after the split are lost when it rejoins, as it is resynced from the new one.",
    k: ["Most up-to-date replica vs highest priority: offset minimizes loss, while priority lets operators prefer particular machines; the order decides which wins.", "Reconfigure replicas in parallel vs one at a time: parallel finishes sooner, but triggers many resyncs against the new primary at once."],
    p: ["A partitioned old primary keeps accepting writes from clients that can still reach it, and those writes vanish when it rejoins.", "Promoting a replica that was lagging far behind loses a large window of writes."],
    v: "Kill a primary under steady writes and confirm the replica with the highest offset is promoted, the other replicas follow it, and the count of writes missing from the new primary is within the replication lag.",
    dep: ["monitor-quorum", "replication-identity", "partial-resync"]
  },
  "config-epochs": {
    s: "Monotonically increasing numbers that version the cluster or monitor configuration, so conflicting views are resolved in favor of the highest epoch.",
    d: "Each failover or slot-ownership change is stamped with an epoch that must be higher than any seen before. A node that learns of a higher epoch for the same primary or slot adopts that information. In elections, each voter votes once per epoch, so at most one candidate wins. After a partition heals, nodes with stale epochs yield to those with newer ones, and the highest epoch's view of who owns what wins. Epochs give a simple last-writer-wins ordering of topology changes without a log, but they do not make data consistent: writes accepted under the old epoch can still be lost.",
    k: ["Epoch numbers vs timestamps: epochs avoid clock synchronization and give a clear order, but need majority agreement to be incremented safely.", "Cluster-wide epoch vs per-slot epoch: per-slot epochs resolve each slot independently, but are more bookkeeping than one global counter."],
    p: ["Two nodes claiming the same slot with the same epoch need a tie-break rule, and a bug in it leaves slots flip-flopping.", "A node restored from an old backup with a stale epoch can briefly advertise a topology that the cluster has moved past."],
    v: "Force two failovers in sequence and confirm the reported epoch increases each time, and that a returning stale node adopts the newest epoch and role.",
    dep: ["cluster-bus"]
  },
  "hash-slots": {
    s: "A fixed number of slots, such as sixteen thousand, into which every key is hashed; each slot belongs to exactly one primary, and nodes own sets of slots.",
    d: "A key's slot is a checksum of the key name, or of the part inside braces if present, modulo the slot count. A cluster assigns each slot to a primary, and the map is gossiped between nodes. Because the unit of placement is the slot, not the key, adding or removing nodes means moving whole slots. Commands touching several keys work only when all keys share one slot. A fixed slot count keeps maps small enough for every node and client to hold, while being fine-grained enough to balance data.",
    k: ["Fixed slots vs consistent hashing: fixed slots give simple, explicit placement and easy migration, but a small fixed count limits how finely load can be balanced.", "More slots vs fewer: more slots balance better, but make gossip and the map larger; fewer are lean and coarse."],
    p: ["A single hot key or a hash tag shared by many keys puts all load into one slot, one node, whatever the cluster size.", "Multi-key commands and transactions across slots fail, which shows up only after moving to a cluster."],
    v: "Compute the slot of sample keys with an independent checksum implementation and confirm it matches the server's report; confirm a hash-tagged pair lands in one slot and a multi-key command on it succeeds.",
    dep: ["cluster-bus", "keyspace-table"]
  },
  "cluster-bus": {
    s: "A dedicated binary mesh between every pair of cluster nodes carrying gossip about membership, slot ownership, failure reports and election messages.",
    d: "Each node opens a second port, offset from the client port, and connects to every other node. It sends periodic pings with its own state and a sample of what it knows about other nodes, such as their flags, slots and epochs. Receivers update their view, so information spreads in a few rounds without a central coordinator. Failure reports, vote requests, replica promotion acknowledgments and published messages also use it. Traffic grows with the square of node count, which limits cluster size, and the bus needs its own firewall rules and encryption.",
    k: ["Gossip mesh vs central coordinator: gossip has no single point of failure and no external dependency, but converges eventually and traffic grows quickly with size.", "Separate bus port vs multiplexing on the client port: separate ports isolate node traffic from client traffic, but double the firewall and encryption setup."],
    p: ["A firewall that allows client ports but blocks the bus port leaves nodes unable to see each other, with a confusing partial failure.", "Large clusters spend noticeable bandwidth and CPU on gossip alone."],
    v: "List the cluster's nodes from two different members and confirm the same view of nodes and slots; capture traffic and confirm pings flow between every pair on the bus port at the configured interval.",
    dep: ["tls-transport", "event-loop"]
  },
  "cluster-failure-detection": {
    s: "Nodes mark peers as possibly failed after a timeout, then spread those reports by gossip, and declare a node failed when a majority of primaries agree.",
    d: "Each node pings peers and flags one as possibly failing if no reply arrives within the node timeout. That opinion travels in gossip. When a majority of primaries have reported the same node as possibly failing within a time window, it is marked failed and the fact is broadcast. A failed primary's replicas then run an election: the one with the best data, by offset, asks for votes from primaries and, with a majority, takes over the slots with a new epoch. A minority partition cannot reach a majority, so it stops serving to avoid split decisions.",
    k: ["Majority of primaries vs any report: requiring a majority prevents a single flaky link from causing failover, but delays real failures and fails without a quorum.", "Stop serving in a minority partition vs continue: stopping avoids divergence, but makes part of the keyspace unavailable until the partition heals."],
    p: ["A cluster with only two primaries can never reach a majority after losing one, so a failure is never confirmed.", "A node timeout set too low causes failover storms during garbage pauses or brief network hiccups."],
    v: "Stop one primary in a cluster of three, and confirm the other two flag it failed after the node timeout, its replica wins an election, and the slots are served by the promoted node.",
    dep: ["cluster-bus", "config-epochs", "replica-promotion", "hash-slots"]
  },
  "resharding": {
    s: "Moving hash slots, with the keys in them, from one primary to another while the cluster keeps serving requests, to add capacity, remove nodes or rebalance.",
    d: "For each slot, the destination is marked importing and the source migrating. Keys are moved in batches by an atomic transfer command that serializes a key, sends it, and deletes it on success. While a slot is in transit, a request for a key still on the source is served there; a request for a key already moved receives a temporary redirect to the destination. When the slot is empty, ownership is assigned to the destination with a new epoch and gossiped. Large keys block both nodes during transfer, and a crash mid-move needs a repair tool.",
    k: ["Move key by key vs bulk snapshot of a slot: key by key keeps the cluster serving throughout, but is slower and costs round trips; bulk is fast but harder to keep consistent with writes.", "Many slots in parallel vs few: parallel finishes sooner, but loads both nodes and increases redirects."],
    p: ["Migrating a slot containing a multi-gigabyte key blocks both nodes for the duration of that one transfer.", "An interrupted migration leaves a slot marked as in transit on two nodes until an operator repairs it."],
    v: "Move a slot with a million keys between nodes under client load, and confirm zero lost keys by comparing counts, bounded latency during the move, and clients ending up directed to the new owner.",
    dep: ["hash-slots", "slot-redirects", "slot-key-index", "config-epochs"]
  },
  "slot-redirects": {
    s: "Error replies telling a client which node owns a key: a permanent redirect when the slot has moved, and a one-time redirect while it is being migrated.",
    d: "A node that receives a command for a key it does not own replies with a moved error naming the slot and the owner's address; the client updates its map and retries there. During migration, a source node that no longer holds the key replies with an ask error, and the client sends an asking command followed by the retry to the importing node, without changing its map. Replicas redirect writes, and reads unless the client said it accepts replica reads. These replies let clients start with an incomplete map and still converge.",
    k: ["Redirect replies vs proxy forwarding: redirects keep nodes simple and add no hops on steady state, but clients must understand cluster rules; proxying hides it at the cost of an extra hop.", "Permanent vs temporary redirect: the permanent kind tells clients to update their map, while the temporary one avoids caching ownership that is about to change."],
    p: ["A client treating an ask redirect as a moved one updates its map to the importing node before the migration ends and misroutes later requests.", "Redirect loops occur between nodes with inconsistent maps during topology changes, if clients do not limit retries."],
    v: "Send a command for a key to the wrong node and confirm the moved reply names the correct slot and address; during a migration confirm an ask reply for an already moved key and success after asking.",
    dep: ["hash-slots", "command-table", "cluster-bus"]
  },
  "server-cron": {
    s: "A timer that fires many times a second inside the event loop and runs housekeeping: expiry sampling, table resizing, statistics, snapshot triggers, replication checks and client timeouts.",
    d: "The event loop schedules the cron function at a configured frequency, typically ten times per second. Each run updates the cached clock, samples statistics, checks whether a child process has finished, decides whether to start a snapshot or rewrite, resizes tables, closes idle clients, and checks replica health. Heavier jobs are split into slices, handled in a few databases or clients per run, so that no run is long. Increasing the frequency makes expiry and housekeeping more responsive at some CPU cost. Anything slow here delays all clients, so each task has a time or work budget.",
    k: ["Higher cron frequency vs lower: higher gives faster cleanup and timeouts, but spends more CPU on an idle server; lower is quiet and slower to react.", "Work sliced across runs vs everything per run: slicing keeps each pause short, but lengthens the time to finish a full pass."],
    p: ["Adding an unbounded task to the cron stalls the whole server on every run, with latency spikes at a regular period.", "Raising the frequency to speed up expiry on a busy server increases CPU use without clearing more expired keys."],
    v: "Observe the loop with tracing and confirm cron runs at the configured rate and that each run's duration stays within its budget even with a million expired keys pending.",
    dep: ["event-loop", "cached-clock"]
  },
  "background-threads": {
    s: "A few helper threads that perform slow operations away from the main thread: closing files, syncing the log to disk and freeing large objects.",
    d: "The main thread queues jobs by type to dedicated threads, each with its own queue: one for closing file descriptors, one for fsync of the log, and one for lazy freeing. The jobs touch no shared mutable data other than their own payload, which keeps the main thread's data single-threaded. Counters of pending jobs let the main thread wait or delay writing if the sync thread has fallen behind. Threads are started once at launch. They exist to remove blocking system calls from the loop, since a close or fsync can take milliseconds.",
    k: ["Dedicated queue per job type vs one shared pool: a queue per type keeps a slow fsync from delaying a free, but uses more threads for little work.", "Hand off slow system calls vs doing them inline: hand-off keeps the loop responsive, but adds hand-off cost and delays the effect of the operation."],
    p: ["A backlog in the sync thread's queue makes the main thread stall waiting, so a slow disk shows up as command latency.", "Handing a value that other code still references to the free thread causes a race and a crash."],
    v: "Delete a large collection asynchronously during a latency test and confirm the main thread's latency stays flat while the background thread's queue shows the job and drains.",
    dep: ["event-loop"]
  },
  "config-system": {
    s: "The set of named settings loaded from a file and command line, readable and mostly changeable at runtime, with some rewritten back to the file.",
    d: "Settings control memory limits, eviction policy, persistence, replication, networking, security and many thresholds. They load at startup from a file and overrides, can be inspected and many changed live by command, and can be written back to the file by a rewrite command. Each setting has a type, range, and a rule for whether it can change at runtime. Some changes, such as the listening port, rebind or restart parts of the server. Access to the configuration commands is a security-sensitive capability, since some settings can alter where files are written.",
    k: ["Runtime changes vs restart required: runtime changes avoid downtime and cold caches, but the running state can drift from the file.", "Allow configuration commands to clients vs file only: command access enables tuning and tooling, but exposes powerful settings to anyone authorized."],
    p: ["A setting changed at runtime and not persisted reverts at the next restart, undoing a fix at the worst time.", "A client able to change file paths with configuration commands can write files elsewhere on the host."],
    v: "Change a runtime setting by command, read it back, rewrite the file, restart, and confirm the new value persisted; attempt the same change as a restricted user and confirm denial.",
    dep: ["acl-engine"]
  },
  "cached-clock": {
    s: "A time value updated once per loop iteration and read from memory, so commands avoid a system call each time they need the current time.",
    d: "Reading the system clock costs a call that is cheap but not free, and commands read time often, for expiry checks, access clocks and statistics. The server keeps a cached millisecond time refreshed before each batch of commands and in cron, with a coarse access clock for eviction. All commands in one batch see the same time, making their behavior consistent and replicable. The trade-off is slight staleness: a long script or slow command sees an old time. Wall-clock changes affect deadlines, so a monotonic clock is used for durations.",
    k: ["Cached time vs fresh read per use: cached is faster and consistent within a command, but can be stale during long operations.", "Wall clock vs monotonic clock: wall clock is needed for absolute deadlines, but can jump; monotonic is safe for intervals and meaningless across restarts."],
    p: ["A script that runs for a long time sees an unchanging clock, so its time-based logic does not advance.", "A host clock jump forward expires keys early, and a jump backward extends them."],
    v: "Run a long script that records the time at start and end, and confirm the time seen inside stays constant during its run, while the next command sees a time advanced by its duration.",
    dep: []
  },
  "execution-model": {
    s: "The decision that one thread executes all commands against the data, which makes each command atomic and removes locks, and shapes every limit on command cost.",
    d: "Because one thread owns the data, there are no locks, no data races and no partially applied commands, and transactions are simple. The cost is that CPU for command work is bounded by one core and that any slow command is a pause for everyone. This drives other choices: incremental rehashing, sampled expiry and eviction, cursor scans, time-boxed scripts, lazy freeing, and background threads for anything blocking. Scaling beyond one core means sharding across processes or a cluster, or offloading only network I/O to helper threads.",
    k: ["Single-threaded data access vs fine-grained locking: single-threaded is simple, predictable and atomic, but cannot use more than one core for commands.", "Scale up with threads vs scale out with shards: threads share one dataset, but shards multiply capacity and add routing complexity."],
    p: ["Treating the server as multi-core capable leads to a single pegged core and idle machine, with no throughput gain from larger hardware.", "A feature added without a work bound becomes the next source of pauses across all clients."],
    v: "Check per-thread CPU during a heavy workload, confirming one thread saturates while others idle, and run a slow command to confirm all clients' latency rises by its duration.",
    dep: ["event-loop", "io-threads", "background-threads"]
  },
  "memory-budget": {
    s: "The decision about what the memory limit means: dataset only or everything, how much headroom to keep, and what happens at the limit, set before any data is stored.",
    d: "Real memory use is dataset plus per-key overhead plus fragmentation plus client buffers plus backlog plus copy-on-write copies during snapshots. The configured limit usually covers only part of that, so headroom must be planned: a rule of thumb sets the limit well below physical memory when persistence is on. The behavior at the limit, evict or refuse, depends on whether the store is a cache or the system of record. The same budget decides key design, encodings, and how large values may be, and it decides how quickly a traffic spike becomes an outage.",
    k: ["Tight limit vs generous headroom: a tight limit holds more data, but any spike, fork or buffer burst can trigger a kill; headroom wastes RAM but absorbs surprises.", "Evict at the limit vs refuse writes: evicting suits a cache that can be rebuilt, while refusing suits data that must not be discarded."],
    p: ["Sizing the limit to the dataset alone ignores overhead and snapshot copying, leading to kills at the first busy snapshot.", "Using a cache setting for data that exists nowhere else loses it silently when memory fills."],
    v: "Run peak write load with snapshots enabled and confirm peak resident memory, including copy-on-write growth and buffers, stays below the physical memory with the planned margin.",
    dep: ["maxmemory-limit", "memory-accounting", "buffer-budget"]
  },
  "durability-vs-speed": {
    s: "The decision on how much data may be lost on a crash: none, a second, a snapshot interval or everything, which sets the persistence and replication settings and the latency of writes.",
    d: "A pure cache can lose everything and rebuild from the database. Stronger settings cost speed: a log with fsync on every command limits throughput to disk speed, a log synced every second risks a second, snapshots risk minutes, and asynchronous replication risks the replication lag. Each layer adds its own failure mode and latency source, such as fork pauses and disk stalls. The right setting follows from whether the data exists elsewhere, how long a cold start takes, and what a user sees during recovery.",
    k: ["Durable writes vs lowest latency: durable writes protect against crash loss, but pay disk latency and complicate operations; no persistence is fastest and loses everything.", "Replication for durability vs disk for durability: replicas recover quickly and survive a machine loss, but lose acknowledged writes on failover; disk survives restarts and not machine loss."],
    p: ["Calling the store a cache and then keeping unique data in it makes a restart a data-loss event.", "Persistence added late brings fork pauses and disk contention to a latency-sensitive workload that was tuned without them."],
    v: "Kill the primary at random times under write load for each setting and count lost acknowledged writes, confirming they match the documented loss window of that setting.",
    dep: ["fsync-policy", "snapshot-scheduling", "min-replicas-guard"]
  },
  "consistency-model": {
    s: "The decision about what readers may see: a single node is consistent per key, while replicas, caches in front of a database and client-side copies add staleness the application must tolerate.",
    d: "On one node every command is atomic and sees all earlier ones. Once replicas serve reads, asynchronous replication means readers can see old data and a failover can drop acknowledged writes. In front of a database, the cache and the database can disagree after failed or reordered updates, and client-side caches add another copy. Expiry bounds how long any disagreement lasts. There is no cross-key isolation beyond transactions on one node, and in a cluster no transaction spans nodes, so the application must design for these windows.",
    k: ["Eventual consistency vs strong consistency: eventual keeps latency and availability high, but applications see stale data and must handle conflicts; strong would need synchronous coordination that the design avoids.", "Short TTL as the consistency mechanism vs explicit invalidation: a TTL bounds staleness with no coordination, but costs extra misses; invalidation is precise, and can fail silently."],
    p: ["Reading from a replica right after a write violates the writer's expectations in a way that appears only under load.", "Assuming a successful write survives failover loses data when the new primary lacked it."],
    v: "Write on the primary and read from a replica, a client-side cache and the database in a loop, recording how long each stays out of date, and compare the measured windows with the documented bounds.",
    dep: ["replication-stream", "invalidation-tracking", "cache-aside"]
  },
  "tail-latency": {
    s: "The decision to hold every operation to a short bounded time, since one slow command, fork, fsync or expiry burst delays every connected client, not just its caller.",
    d: "Median latency is easy; the tail is where design matters. Pauses come from slow commands on large collections, forks on big heaps, disk stalls in fsync, mass expiry, rehashing under copy-on-write, defragmentation, large replies, and garbage in the host. Each component therefore does bounded work per step and resumes later, and the latency monitor and slow log exist to find the exceptions. Clients add their own tail with retries and timeouts. Capacity planning has to include the worst pause, not only the average, since timeouts make a pause into a failure.",
    k: ["Bounded work per step vs simpler unbounded algorithms: bounded steps keep pauses short, but are more complex and take longer to finish a whole pass.", "Isolating slow work in other threads or processes vs doing it inline: isolation protects the loop, but adds hand-off cost and new failure modes."],
    p: ["Optimizing the average while ignoring the ninety-ninth percentile leaves timeouts and retry storms from rare pauses.", "A diagnostic command run in production, such as listing all keys, becomes the largest pause the system has."],
    v: "Record the latency distribution under peak load with persistence and replication on, and confirm the ninety-ninth and maximum latencies stay below the client timeout with the latency monitor showing no unexplained spikes.",
    dep: ["slow-log", "latency-monitor", "event-loop", "snapshot-fork"]
  },
  "backward-compatibility": {
    s: "The decision to keep old clients, files and replicas working across versions, which makes the protocol, snapshot format and command semantics hard to change and shapes every upgrade.",
    d: "Many applications use client libraries that are never updated in step with the server. So command behavior, reply shapes, error text and the wire protocol change slowly, with new versions negotiated per connection. Snapshot and log formats must be readable by newer versions, and replication must work between adjacent versions during a rolling upgrade. Defaults sometimes stay unsafe for years to avoid breaking users. The cost is carried code paths: dual reply formats, legacy commands, and compatibility flags.",
    k: ["Keep old behavior vs fix it: keeping avoids breaking deployed clients, but preserves misleading defaults and accumulates legacy code.", "Negotiated protocol versions vs flag day: negotiation lets old and new clients coexist, but every command must support both reply shapes."],
    p: ["Upgrading the primary before the replicas, or the reverse, can break replication if the order is wrong for the version pair.", "A snapshot written by a newer version cannot be loaded after a rollback, so rollback plans fail."],
    v: "Upgrade one node at a time in a test cluster with old clients attached, and confirm clients keep working, replication continues across the version pair, and a snapshot from the old version loads on the new one.",
    dep: ["protocol-negotiation", "snapshot-format", "replica-handshake"]
  },
});
