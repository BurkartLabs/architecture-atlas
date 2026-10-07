// Details for the actor runtime plate, part 3: sharding, persistence, cluster.
ATLAS.details("actor-runtime", {
  "entity-id-extraction": {
    s: "A function that reads the entity id and shard key out of each incoming message, so senders address a logical entity and never a physical actor.",
    d: "The extractor maps a message to an entity id and the payload to deliver, and a second function maps the id, or the message, to a shard id, typically a hash modulo a fixed shard count. The shard count is fixed for the life of the data, because changing it moves every entity. Messages lacking an id are rejected. The choice of id and shard function decides load distribution, so a skewed key such as a tenant with a very large share creates a hot shard no balancing can fix.",
    k: ["Hash of the id vs explicit shard in the id: hashing spreads load automatically, while explicit shards give control and force clients to know them.", "Many small shards vs few large: many shards balance better and cost more coordination state, few are cheap and balance poorly."],
    p: ["Changing the shard count on a live system remaps entities and breaks routing to existing persisted state.", "A skewed key concentrates traffic on one shard and one node."],
    v: "Feed one million random entity ids through the extractor and confirm the shard counts are within a few percent of uniform; send a message without an id and confirm it is rejected with a clear error.",
    dep: ["typed-protocols", "message-envelope"]
  },
  "shard-allocation-strategy": {
    s: "The policy deciding which node hosts each shard, balancing shard counts or load and choosing where to move shards when membership changes.",
    d: "When a shard is first needed, the strategy picks a region, usually the one with the fewest shards. Periodically it can propose rebalancing, moving a few shards from the most to the least loaded node. Balancing by shard count is simple but ignores that shards differ in traffic; load-aware strategies use measured entity counts or message rates. Limits on simultaneous moves keep rebalancing from causing the disruption it is meant to cure.",
    k: ["Least-shards allocation vs load-aware: counting is stable and predictable, load-aware matches real pressure and chases noisy measurements.", "Aggressive rebalancing vs conservative: aggressive evens load fast and moves many entities, conservative keeps stability and tolerates imbalance."],
    p: ["Rebalancing on every membership flicker moves shards back and forth and stalls entities repeatedly.", "A strategy unaware of node roles places shards on nodes not configured to host the entity."],
    v: "Add a fifth node to a four-node cluster hosting one hundred shards and confirm shards migrate in limited batches until each node holds about twenty, without exceeding the concurrent-move limit.",
    dep: ["shard-coordinator", "node-roles", "gossip-membership"]
  },
  "shard-coordinator": {
    s: "A singleton that records which node owns each shard and answers location queries, making allocation decisions in one place so they cannot conflict.",
    d: "Regions ask the coordinator where a shard lives; if unallocated, it applies the allocation strategy and records the choice, then regions cache the answer. The coordinator's table must survive its own failover, so it is persisted or replicated, and it runs as a cluster singleton that moves to another node when its host fails. During that failover no new allocations can happen, though cached locations keep working. It is a control-plane component and must stay off the message hot path.",
    k: ["Single coordinator vs decentralized allocation: single is simple and consistent with a failover pause, while decentralized avoids the pause and needs conflict resolution.", "Persisted vs gossiped allocation table: persisted survives full restarts, gossip is faster and may briefly disagree."],
    p: ["A coordinator whose state store is slow stalls first-time allocations for every region.", "After a split, two coordinators allocating the same shard give two live copies of an entity."],
    v: "Kill the node hosting the coordinator and confirm it restarts elsewhere with its table intact, existing shards keep serving during the gap, and new shard allocations resume afterward.",
    dep: ["cluster-singleton", "shard-allocation-strategy", "durable-state-store"]
  },
  "shard-region-routing": {
    s: "The per-node proxy that receives messages for any entity, finds the owning node through cached shard locations, and forwards or delivers locally.",
    d: "Senders always send to their local region. It extracts the entity id, resolves the shard, and either delivers to the local entity actor, creating it if absent, or forwards to the region that owns the shard. Messages for shards whose location is not yet known are buffered while the region asks the coordinator. The buffer is bounded and drops beyond its limit, and during rebalancing messages are held until the handoff completes, so latency spikes there.",
    k: ["Region on every node vs a few routing nodes: a region everywhere gives local entry points and cache cost per node, dedicated nodes simplify scaling roles.", "Buffering unrouted messages vs rejecting them: buffering hides short allocation delays, rejection keeps memory bounded and requires retries."],
    p: ["A stale location cache sends messages to the former owner, which must forward them, adding a hop and sometimes a loss.", "Unbounded buffering during a long coordinator outage exhausts memory."],
    v: "Send a message for an entity from every node and confirm each is delivered once to the single owning node; move the shard and confirm messages sent during the move arrive after handoff, in order.",
    dep: ["entity-id-extraction", "shard-coordinator", "location-transparent-references"]
  },
  "virtual-actor-activation": {
    s: "Creating an entity actor on first message and treating it as always existing logically, so callers never create, locate or check for it.",
    d: "An entity is addressed by id from the moment anyone sends to it. If no instance is running, the owning shard creates one, possibly recovering its state from storage, and then delivers the message. When idle it is removed from memory but its identity remains valid. This turns lifecycle from a programming concern into a runtime concern and lets the working set exceed memory. The costs are activation latency on the first message and the need for entity code to be safe when started repeatedly.",
    k: ["Implicit activation vs explicit create calls: implicit removes boilerplate and race conditions, while explicit gives control over initial parameters and validation.", "Recover state eagerly on activation vs lazily: eager keeps handlers simple, lazy shortens activation and complicates the actor."],
    p: ["Typos in ids silently create new empty entities instead of failing.", "A flood of first messages to many cold entities causes an activation storm against the store."],
    v: "Send a message to an id that has never existed and confirm the entity is created, replies, and appears in the shard's entity list; send to it after passivation and confirm it reactivates with state.",
    dep: ["shard-region-routing", "recovery-and-replay", "passivation"]
  },
  "passivation": {
    s: "Stopping an idle entity actor to free memory, after first making sure no messages are in flight to it, with its state saved so it can return on demand.",
    d: "After an idle period, or when too many entities are active, the shard asks an entity to passivate. The entity's region first buffers new messages, lets the actor finish queued ones, stops it and then redelivers the buffered messages to a fresh incarnation. The buffering step prevents messages being lost to an actor that is mid-stop. Policies range from fixed idle timeouts to least-recently-used limits, trading memory against activation cost and recovery load.",
    k: ["Idle timeout vs LRU capacity limit: timeouts are predictable and can let memory grow with activity, while LRU bounds memory and cycles hot entities under pressure.", "Persisting on passivation vs on every change: saving at passivation is cheap and loses data if the node crashes, per-change is safe and slower."],
    p: ["A message arriving while the entity stops, without the buffering handshake, is lost.", "Entities with background timers never go idle and never passivate."],
    v: "Set a one-minute idle limit, send one message and wait: confirm the entity stops, memory falls, and a later message reactivates it with the same state, losing nothing that arrived during the stop.",
    dep: ["receive-timeout", "shard-region-routing", "recovery-and-replay"]
  },
  "rebalancing-and-handoff": {
    s: "Moving a shard from one node to another by stopping its entities, flushing state, updating ownership and restarting entities on the new node without losing messages.",
    d: "The coordinator tells all regions to stop sending to the shard and buffer instead, asks the owner to stop its entities, and once they end, allocates the shard to a new region and releases the buffers. The same handoff runs on a graceful node leave. During it, entities for that shard are unavailable for a short time, and messages are held. The protocol must withstand failures in the middle, such as the source node dying, without leaving two owners.",
    k: ["Stop-then-start handoff vs live state migration: stop-then-start is simple and consistent with a brief unavailability, while live migration shortens it with much complexity.", "Rebalance only on membership change vs continuously: change-only is stable and lags load, continuous adapts and adds churn."],
    p: ["A node that dies mid-handoff leaves buffers waiting until the coordinator times it out.", "Entities stopping slowly stretch the handoff and the pause extends for the whole shard."],
    v: "Trigger a handoff of one shard under constant traffic and confirm exactly one owner at every moment, zero lost messages, and a measured unavailability matching the entities' stop times.",
    dep: ["shard-coordinator", "shard-region-routing", "passivation"]
  },
  "remembered-entities": {
    s: "A record of which entities are active in each shard, so after a rebalance or restart the shard restarts them without waiting for a new message.",
    d: "Normally an entity exists only after a message arrives, which is wrong for entities with duties such as timers or subscriptions. With remembering, the shard writes an entity's start and stop to a store, and the new owner of the shard re-activates all remembered entities. The store can be a journal or a replicated data structure. It adds writes on every activation and a restart cost proportional to the number of entities, and entities that stay remembered but are no longer needed must be passivated explicitly.",
    k: ["Remember entities vs activate on message only: remembering suits entities with autonomous work, while message-only activation keeps the working set small.", "Journal-based vs replicated-memory store: journal survives full restarts, memory store is faster and lost when the cluster stops."],
    p: ["A million remembered entities all activate at once on a restart and stampede the storage.", "An entity remembered after its business ended keeps consuming memory forever."],
    v: "Activate fifty entities with timers, move their shard to another node, and confirm all fifty restart there and keep firing timers without any new message being sent to them.",
    dep: ["event-journal", "virtual-actor-activation", "rebalancing-and-handoff"]
  },
  "cluster-singleton": {
    s: "A pattern ensuring exactly one instance of an actor runs in the cluster at a time, on the oldest eligible node, moving to another node on failure.",
    d: "A manager actor runs on every eligible node, and only the manager on the oldest member starts the real singleton child. When that node leaves, the next-oldest takes over after a handover in which the old one stops first if reachable. A proxy on each node finds and buffers messages for the current instance. Uniqueness depends on the failure detector and downing decisions: during a partition two nodes may each think they are oldest unless a split-brain policy prevents it.",
    k: ["Oldest-node singleton vs lease-based election: oldest-node needs no external service and relies on membership agreement, while leases rely on an external store and tolerate partitions better.", "Graceful handover vs failover only: handover avoids overlap and needs the old node reachable, failover is faster with a chance of two instances."],
    p: ["Without a split-brain resolver, a partition produces two singletons that both act on shared resources.", "Singleton state not persisted is lost at each handover."],
    v: "Run a singleton on node A, kill A, and confirm exactly one instance starts on the next-oldest node after the detection and downing delay, with proxies delivering buffered messages to it.",
    dep: ["leader-selection", "split-brain-resolver", "node-roles"]
  },
  "event-journal": {
    s: "An append-only log of events per entity, written before an actor acts on them and read back in order to rebuild state after a restart.",
    d: "A persistent actor writes events with a persistence id and a strictly increasing sequence number to a pluggable store, which acknowledges after durable write. Only then are the state change and any replies applied. Writes may be batched across entities for throughput. The store contract needs per-entity ordering, atomic batches and fast reads by range. Hard parts are latency, since each command waits for a write, and unbounded growth, which snapshots and retention policies manage.",
    k: ["Write then apply vs apply then write: write first guarantees state never runs ahead of the log, while apply first is faster and loses the change if the write fails.", "Batched writes vs one at a time: batching raises throughput and latency for each command, individual writes keep latency low and cost throughput."],
    p: ["Two incarnations of an entity writing the same sequence numbers corrupt its history unless the store rejects the second.", "Unbounded retention makes recovery time grow with the age of the entity."],
    v: "Persist ten events for an entity, kill the process, and read the journal: confirm ten events with sequence numbers one to ten, in order, with no gaps or duplicates.",
    dep: ["serializer-registry", "journal-writer-fencing"]
  },
  "command-and-event-handlers": {
    s: "The split in a persistent actor between validating a command, which yields events, and applying an event to state, which must be pure and replayable.",
    d: "A command handler checks the command against current state and decides which events to persist, or rejects it. An event handler takes state and an event and returns new state, with no side effects, because it also runs during recovery from the journal. External effects such as sending emails run after the events are persisted, as separate steps, or are made idempotent. Keeping the event handler pure is what allows state to be rebuilt anywhere, and getting this wrong repeats effects on every restart.",
    k: ["Pure event handler with effects on commands vs effects inside handlers: purity makes replay safe, while effects inside handlers run again on every recovery.", "Events as facts vs events as commands: facts stay valid when logic changes, command-like events replay behaviors that may have since changed."],
    p: ["Sending a message from inside the event handler fires it again on every recovery.", "Handlers that read the clock or random values produce different state on replay."],
    v: "Persist events through a command, recover the actor twice, and confirm the final state is identical each time and that no external side effect was triggered during either replay.",
    dep: ["event-journal", "actor-definition", "recovery-and-replay"]
  },
  "recovery-and-replay": {
    s: "On start, loading the latest snapshot and replaying later events through the event handler, rebuilding exact state before any new command is processed.",
    d: "The actor starts in a recovering phase: incoming commands are stashed while the runtime reads the snapshot, then streams events after it from the journal into the event handler. Only when replay finishes does the actor accept commands. Recovery time is proportional to events since the last snapshot, so frequent snapshots shorten it. Errors during it, such as an unreadable event, must fail the actor loudly rather than start with partial state. Many entities recovering simultaneously load the store heavily.",
    k: ["Snapshot plus tail replay vs replay everything: snapshots bound recovery time and add storage and format concerns, full replay is simple and slows with age.", "Limit concurrent recoveries vs unrestricted: limiting protects the store and queues activations, unrestricted is faster at light load and stampedes at heavy."],
    p: ["Skipping an unreadable event to start anyway yields state that silently diverges from history.", "A cold restart of thousands of entities overloads the journal and times out recoveries."],
    v: "Write one thousand events, snapshot at five hundred, restart, and confirm the state equals a full replay, with only five hundred events read, and new commands were held until recovery completed.",
    dep: ["event-journal", "snapshot-store", "stash-and-unstash"]
  },
  "snapshot-store": {
    s: "Storage for periodic copies of an entity's whole state at a given sequence number, so recovery can skip most of the event history.",
    d: "After N events or on a schedule, the actor saves its serialized state with the sequence number it reflects. Recovery loads the newest snapshot and replays only later events. Old snapshots and the events they cover can be deleted, subject to retention and audit needs. Snapshots are optimizations, not the source of truth, so a failed or corrupt one should fall back to an earlier snapshot or full replay. The format is a long-lived contract, since snapshots written by old versions must still be read.",
    k: ["Snapshot every N events vs time-based: event counts bound replay length directly, time-based is simpler to reason about and uneven in cost.", "Deleting events after a snapshot vs keeping them: deleting saves storage and loses history, keeping preserves audit and replays for new projections."],
    p: ["A snapshot format change that older nodes cannot read breaks rolling upgrades and rollbacks.", "Snapshots taken after a failed event write capture state that was never persisted."],
    v: "Take a snapshot at event five hundred, corrupt it deliberately, and confirm recovery falls back to full replay or an older snapshot and produces the identical state.",
    dep: ["serializer-registry", "event-journal", "schema-evolution"]
  },
  "event-adapters-and-upcasting": {
    s: "Transformations applied when events are written or read, converting old event shapes into the current ones so history stays readable as the code evolves.",
    d: "Events stored years ago must still be understood. An adapter on the read path converts an old version into the latest, a process called upcasting, or splits one old event into several new ones. On the write path it can wrap domain events into a storage format. Because the journal is immutable, these adapters accumulate as a chain, and each must be tested against real old data. They are how schema changes are made without rewriting the log.",
    k: ["Upcast on read vs rewrite the journal: read-time upcasting keeps history intact and costs CPU on every replay, while rewriting is cheap later and risky.", "Domain events vs separate storage events: separate types decouple code from storage format and double the types to maintain."],
    p: ["Deleting an old event class from the code makes events of that type impossible to read.", "Adapters that are not idempotent corrupt events when applied twice."],
    v: "Store events in an old format, upgrade the code with an adapter, recover the entity and confirm state equals the state computed from the original event semantics.",
    dep: ["schema-evolution", "event-journal", "type-manifests"]
  },
  "event-tagging-and-queries": {
    s: "Labeling events with tags at write time and offering ordered, resumable streams of events by tag or by entity for read-side consumers.",
    d: "Writers attach tags such as a slice number, and the journal indexes them so consumers can read all events with a tag in a global or per-tag order, resuming from an offset. This is how read models, notifications and integrations follow the log without touching the entities. Ordering across entities is only as strong as the store provides, and offsets must be monotonic for resume to be safe. Tags should be chosen to divide the stream so many consumers can process in parallel.",
    k: ["Many tags by slice vs a single global stream: slices allow parallel consumers and per-slice order, a global stream is simplest and bottlenecks on one reader.", "Polling the journal vs push notification: polling is simple and adds latency and load, push is timely and needs a notification channel."],
    p: ["Events committed out of timestamp order can be skipped by a consumer resuming from the highest offset seen.", "Changing a tagging function later leaves old events untagged for new consumers."],
    v: "Write events from many entities with eight tags, run one consumer per tag, restart them mid-stream and confirm every event is seen exactly once per consumer, in order within each entity.",
    dep: ["event-journal", "projections"]
  },
  "projections": {
    s: "Processes that consume the event stream and build derived read models, such as tables or caches, with tracked offsets so they resume after failure.",
    d: "A projection reads tagged events, updates a read store and records the offset in the same transaction when possible, giving exactly-once effect on that store; otherwise it is at-least-once and handlers must be idempotent. Projections run as sharded actors across the cluster so each tag is processed by one instance. They are eventually consistent with the write side, and rebuilding one means replaying from the start into a new store.",
    k: ["Offset and read model in one transaction vs separate commits: one transaction gives exactly-once effect, separate commits are portable and require idempotence.", "Rebuild by replay vs migrate in place: replay is clean and slow for large logs, in place is fast and error-prone."],
    p: ["Readers expecting immediate consistency read stale data after a write.", "A poison event that always fails blocks the whole tag's projection behind it."],
    v: "Stop a projection mid-stream, restart it, and compare the read model to a full replay: confirm they are identical with no duplicate or missing rows and that lag returns to near zero.",
    dep: ["event-tagging-and-queries", "shard-region-routing", "at-least-once-delivery"]
  },
  "durable-state-store": {
    s: "Persisting the latest state of an entity directly, as one record updated in place, for cases where history is not needed and replay would be wasteful.",
    d: "The actor loads its state on activation and writes the full new state after each change, usually with a revision number for optimistic concurrency. It is simpler than an event log, uses familiar storage and keeps recovery constant time. In exchange there is no history, no replay for new views, and a conflict if two incarnations write the same record, which the revision check must detect. It suits cache-like or CRUD entities rather than ones with audit needs.",
    k: ["Durable state vs event sourcing: state storage is simple and fast to load, while event sourcing keeps history and audit trails at the cost of replay and schema care.", "Write on every change vs debounced writes: every change is safest, debouncing reduces load and risks losing recent changes on a crash."],
    p: ["Two incarnations after a partition overwrite each other when the revision check is missing.", "Writing large state on every small change multiplies storage load."],
    v: "Update an entity ten times, restart the process and confirm the loaded state matches the tenth update; write with a stale revision from a second instance and confirm the store rejects it.",
    dep: ["serializer-registry", "journal-writer-fencing"]
  },
  "journal-writer-fencing": {
    s: "Rules and checks that make sure only one live incarnation of an entity can write its log, so a stale duplicate cannot corrupt history.",
    d: "After a partition or a slow failure detection, two nodes may briefly run the same entity. Both attempt writes with the same next sequence number. The store accepts one and rejects the other with a conflict, and the loser must stop. This turns split-brain into a detectable error instead of a corrupted log. Stronger variants use lease or fencing tokens issued by the allocator. It relies on the store's atomic, conditional append, so stores without one cannot provide it.",
    k: ["Sequence-number conflict detection vs fencing tokens: sequence checks need no extra service and detect only on write, tokens block stale writers earlier.", "Stop on conflict vs retry: stopping prevents divergence, retry risks reapplying a stale view."],
    p: ["A store with non-atomic appends lets two writers interleave and silently fork history.", "A loser that keeps replying to clients after the conflict gives answers from a state that will be discarded."],
    v: "Start two incarnations of one entity, send both a command, and confirm exactly one write succeeds, the other receives a conflict and stops, and the journal has a single consistent sequence.",
    dep: ["event-journal", "shard-coordinator"]
  },
  "node-discovery-and-seeding": {
    s: "How a new node finds an existing cluster to join, through configured seed addresses, DNS records or an orchestrator's service discovery.",
    d: "A node needs at least one contact point. Static seed lists are simple; DNS or an orchestrator API return current peer addresses, which suits environments where addresses change. The first node, with no peers, must be told to form the cluster, and several nodes starting at once must not each create their own. Bootstrap strategies use a deterministic rule, such as the lowest address among contacted nodes, or an external lock. Mistakes here create two clusters that never merge.",
    k: ["Static seeds vs dynamic discovery: static is simple and brittle when addresses change, dynamic follows the environment and depends on its availability.", "Deterministic first-node rule vs external coordination: a rule needs no extra service and can fail under partition at startup, coordination is safer and adds a dependency."],
    p: ["All nodes starting together and each forming a cluster alone produces several disjoint clusters.", "A stale discovery record sends joining nodes to an address that now belongs to something else."],
    v: "Start five nodes simultaneously with the same discovery configuration and confirm every node ends in one cluster containing five members, repeated twenty times with different start orders.",
    dep: ["node-transport", "connection-handshake"]
  },
  "gossip-membership": {
    s: "A protocol in which nodes periodically exchange their view of the member list with random peers, so membership changes spread to everyone without a central registry.",
    d: "Each node keeps a versioned membership state with vector clock style version info. At intervals it picks a peer, compares versions and sends the differences. Changes spread in time roughly logarithmic in cluster size. When all reachable members have seen the same state, convergence is reached and leader actions can proceed. Gossip is cheap and tolerant of failure, but it provides eventual agreement only, so decisions needing certainty wait for convergence, and large clusters use biased peer selection to speed it.",
    k: ["Gossip vs a central membership service: gossip has no single point of failure and converges eventually, while a central service gives immediate agreement and a dependency.", "More frequent gossip vs less: frequent shortens convergence and costs bandwidth, infrequent saves traffic and slows reaction."],
    p: ["Acting on membership before convergence causes two nodes to make conflicting decisions.", "Very large clusters gossip full state and spend noticeable bandwidth on it."],
    v: "Add one node to a hundred-node cluster and measure the time until every node lists it: confirm convergence within the expected number of gossip rounds, and the membership state is identical everywhere.",
    dep: ["node-transport", "node-lifecycle-states", "failure-detector"]
  },
  "node-lifecycle-states": {
    s: "The defined states a cluster member passes through, such as joining, up, leaving, exiting, down and removed, with who may trigger each transition.",
    d: "A node starts as joining, is promoted to up by the leader once gossip converges, moves to leaving on a graceful exit request, then exiting and removed once shards and singletons are handed off. A node judged dead is marked down and eventually removed. Separating leaving from down matters: leaving is cooperative and preserves data, down is a verdict. Components subscribe to state changes to start work, such as hosting shards, only when a node is up.",
    k: ["Leader-driven transitions vs each node deciding: leader-driven keeps changes ordered and needs a leader, self-decision is faster and allows disagreement.", "Separate leaving and down states: separation allows clean handoff, and needs a protocol to complete it."],
    p: ["Treating joining nodes as ready sends traffic to a node that has not started its services.", "A node marked down that is actually alive must be forced to restart before it can rejoin."],
    v: "Join a node and record its state sequence, then request a graceful leave and record again: confirm joining, up, leaving, exiting, removed in order, and that shards moved before exiting completed.",
    dep: ["gossip-membership", "leader-selection"]
  },
  "failure-detector": {
    s: "A component that estimates whether a peer is alive from the timing of heartbeats, producing a suspicion level instead of a certain answer.",
    d: "Peers exchange heartbeats at a fixed interval. An accrual detector keeps a window of recent inter-arrival times and computes how unlikely the current silence is, giving a continuous suspicion value; crossing a threshold marks the node unreachable. It adapts to jitter better than a fixed timeout. No detector can distinguish a dead node from a slow link, so there is always a tradeoff between detection speed and false alarms, and long pauses in the process, such as garbage collection or a suspended virtual machine, look like failure.",
    k: ["Accrual detector vs fixed timeout: accrual adapts to network variance and needs tuning of a threshold, fixed timeout is simple and either slow or flappy.", "Heartbeat from every node to every node vs monitored subset: full mesh is thorough and scales quadratically, subsets scale and have gaps."],
    p: ["A pause longer than the threshold makes a healthy node unreachable and triggers failover of its entities.", "Heartbeats sharing a connection with bulk traffic are delayed behind it and cause false suspicion."],
    v: "Pause a node's process for five seconds with a three-second threshold and confirm peers mark it unreachable, then resume it and confirm it becomes reachable again before being downed if within the downing delay.",
    dep: ["node-transport", "clock-abstraction", "system-message-channel"]
  },
  "split-brain-resolver": {
    s: "A policy that decides which side of a network partition survives and which shuts down, preventing two halves from each running as the whole cluster.",
    d: "After nodes are unreachable for a stable period, the resolver applies a strategy: keep the majority, keep the side with the oldest node, keep a configured role, or use a lease from an external store. Losing sides terminate their cluster membership, and the rest remove them. The strategy must be identical on all nodes. Each option sacrifices something: majority fails if exactly half is lost, oldest-node can leave the larger side shut down. Waiting for stability delays recovery.",
    k: ["Keep-majority vs keep-oldest vs lease: majority needs an odd count and no extras, oldest keeps one deterministic survivor with a size caveat, lease is exact and needs the store.", "Long stable period vs short: long avoids deciding during flapping and prolongs outage, short recovers quickly and may down healthy nodes."],
    p: ["Auto-downing on a simple timeout creates two independent clusters during a partition.", "Different strategies configured on different nodes produce contradictory decisions."],
    v: "Partition a seven-node cluster into four and three, wait past the stable period, and confirm the four-node side continues, the three nodes shut down, and singletons exist exactly once.",
    dep: ["failure-detector", "gossip-membership", "node-roles"]
  },
  "leader-selection": {
    s: "A deterministic rule that names one member of the converged cluster as leader to perform membership changes, with no election messages needed.",
    d: "After gossip converges, each node independently computes the same leader, typically the member with the lowest address among the up ones, optionally per role. The leader performs actions like promoting joining nodes and removing exited ones, and publishes them through gossip. Because the choice is a pure function of membership, it needs no voting, and it changes automatically when the leader leaves. During unconvergence there may be no leader, which pauses these actions rather than risk conflicts.",
    k: ["Deterministic computation vs voting protocol: computation is cheap and needs convergence, voting works under divergence and costs messages and complexity.", "Per-role leaders vs one leader: per-role leaders spread work and increase the number of cases to reason about."],
    p: ["Treating the leader as a lock holder for application logic; it only exists to manage membership and may differ between nodes during a partition.", "Slow convergence leaves the cluster without a leader and joins stall."],
    v: "Stop the leader node and confirm every remaining node computes the same new leader after convergence, and a joining node is then promoted by it.",
    dep: ["gossip-membership", "node-lifecycle-states"]
  },
  "node-roles": {
    s: "Labels on nodes, such as frontend or storage, that restrict where shards, singletons and other features run, letting one cluster hold differently shaped nodes.",
    d: "Each node declares roles in configuration. Sharding, singletons and routers take a role as a filter, so entities live only on nodes with the role. This allows scaling parts independently, such as many web-facing nodes and a few heavy compute nodes, within one membership. Leaders and split-brain strategies can also be role-specific. Roles add configuration to keep consistent, and they complicate capacity reasoning since losing the only nodes with a role stops that feature.",
    k: ["Roles in one cluster vs separate clusters: one cluster is simple to operate and shares failure fate, separate clusters isolate faults and need extra integration.", "Fine-grained roles vs few: fine roles fit capacity exactly and multiply failure modes, few roles are simple and less flexible."],
    p: ["A shard region started on a node without the role never receives its shards, and messages wait forever.", "Losing the last node of a role silently disables its feature."],
    v: "Start nodes with two roles, deploy sharding with a role filter, and confirm every entity is hosted only on nodes with that role, including after rebalancing and a node loss.",
    dep: ["gossip-membership", "runtime-configuration"]
  },
  "replicated-data-types": {
    s: "Data structures such as counters, sets and maps that are replicated to nodes by gossip and merged automatically, with no coordination and eventual convergence.",
    d: "Each node holds a replica and updates it locally. Replicas exchange state or operations, and a merge function that is commutative, associative and idempotent guarantees all converge to the same value regardless of order or duplication. Used for registries, shared flags and counters. Writes and reads can request consistency levels, such as majority, for stronger results. Deletions and unbounded growth need careful design, since removal metadata, called tombstones, accumulates and must be pruned.",
    k: ["Merge-based eventual consistency vs coordinated writes: merges stay available under partition and allow conflicts to be resolved by type, coordination gives strict order and stops during partitions.", "State-based vs operation-based replication: state-based is robust to loss and sends more data, operation-based sends little and needs reliable ordered delivery."],
    p: ["A data type chosen without a sensible merge for the business rule, such as last-writer-wins on a balance, loses updates.", "Removed entries leave tombstones that grow without bound."],
    v: "Increment a replicated counter concurrently on three nodes during a partition, heal it, and confirm all replicas converge to the exact sum of increments.",
    dep: ["gossip-membership", "serializer-registry", "node-transport"]
  },
  "cluster-event-subscription": {
    s: "An API for actors to receive messages when members join, become reachable or unreachable, leave or are removed, so components react to topology.",
    d: "An actor subscribes with the event types it needs and typically first receives the current membership as a snapshot, then deltas. Services use it to start work on new nodes, update routers and drop caches. Events are derived from the local node's view, so different nodes see them at different times and may see unreachable and reachable flips. Handlers must be idempotent and tolerant of reordering relative to application messages, since the two travel through different channels.",
    k: ["Initial snapshot plus deltas vs deltas only: snapshots avoid missing history for late subscribers, deltas alone are simpler and miss earlier events.", "React to unreachable vs only to removed: unreachable acts quickly with false positives, removed acts after a firm decision."],
    p: ["Acting irreversibly on an unreachable event that is later reversed by a reachable event.", "A slow subscriber's event queue grows during membership churn."],
    v: "Subscribe an actor, add and remove nodes, and confirm the actor sees an initial snapshot followed by joined, up, left and removed events in the documented order that match gossip state.",
    dep: ["gossip-membership", "node-lifecycle-states", "failure-detector"]
  },
});
