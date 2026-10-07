// Details for the SDN controller plate, part 3: network state, update coordination, telemetry and failure handling, clustering.
ATLAS.details("sdn-controller", {
  "network-state-model": {
    s: "The controller's unified, queryable representation of devices, ports, links, hosts, flows and policy, from which every service reads and to which every device update is reflected.",
    d: "State is stored as typed objects and relations, held in memory for speed and replicated for durability. It has an operational side (what is observed) and a configured side (what is intended), and keeps them separate. Subscribers receive change notifications. Reads must be consistent enough that path computation does not mix an old topology with new rules. The difficulty is size and freshness: millions of entries must be updated at event rates without readers seeing torn updates.",
    k: ["In-memory graph with replicated log versus external database: in-memory is fast for path computation, an external database simplifies durability and costs latency on every read.", "Separate observed and intended state versus one merged record: separation enables reconciliation and drift detection, merging is simpler and hides disagreement."],
    p: ["A reader that sees a link removed but its attached rules still present computes paths over inconsistent state.", "Unbounded growth from stale entries for devices that were decommissioned slows every query."],
    v: "Remove a device and confirm within the documented time that its ports, links, hosts and rule mirror are removed from the model, change notifications were emitted, and queries return a consistent result throughout.",
    dep: ["consensus-store","event-bus"]
  },
  "topology-store": {
    s: "The graph of switches, ports and links, with attributes such as capacity and delay, that path computation and verification operate on.",
    d: "Nodes are devices and hosts, edges are directed links with attributes and an operational status. The store offers snapshot reads, so a computation sees a stable graph while updates continue, and publishes deltas. Link entries are created by discovery and kept alive by liveness checks, so they expire if not refreshed. Administrative overrides can hide or add links. The difficulty is that discovery is eventually correct only: a link is believed up until evidence says otherwise, and each decision must tolerate that lag.",
    k: ["Immutable snapshots versus locks on a mutable graph: snapshots let long computations run unblocked at a memory cost, locks are cheaper and stall readers during updates.", "Expiry of unrefreshed links versus explicit removal only: expiry heals missed events, explicit removal avoids flapping entries from lost discovery packets."],
    p: ["A one-way link failure, with traffic flowing only in one direction, is stored as a healthy bidirectional link.", "A duplicate device identity after replacement merges two nodes into one graph vertex."],
    v: "Cable two switches, confirm both directions appear with correct port numbers within the discovery interval, then unplug one end and confirm both directions are removed within the liveness timeout.",
    dep: ["network-state-model","link-discovery"]
  },
  "device-inventory": {
    s: "A registry of every managed device with identity, role, model, software version, capabilities, site and management address, used for placement and compatibility decisions.",
    d: "Entries are created on onboarding and enriched from capability negotiation: number of tables, supported match fields and actions, queue counts and limits. Roles such as leaf, spine or border drive policy. The inventory ties to external sources of truth for sites and ownership. The difficulty is correctness over time: software upgrades change capabilities, hardware is replaced under the same name, and a stale capability record leads the compiler to produce rules the device cannot take.",
    k: ["Device identity by hardware serial versus by name or address: serials survive renaming and re-addressing, names are readable and break when devices are swapped.", "Capabilities discovered at connect versus declared by operators: discovery is accurate and lags a software upgrade, declarations are explicit but drift."],
    p: ["A replaced switch inherits the old record's capabilities and rejects rules that fit its predecessor.", "Devices running mixed software versions in one role make a single policy compile differently per device."],
    v: "Upgrade a lab switch to a version with a different table size and confirm after reconnect the inventory shows the new limit and the compiler uses it on the next change.",
    dep: ["network-state-model","capability-negotiation"]
  },
  "link-port-state": {
    s: "The live status of every port and link, including up or down, speed, utilization and error rates, which path computation and failure handling consume.",
    d: "Port status arrives as asynchronous events from devices and as periodic polls. Link state combines both ends and the discovery view: a link is usable only if both ports are up and discovery frames pass. Utilization and error counters are smoothed to avoid reacting to noise. Operators can administratively drain a link. The difficulty is flap damping: a link bouncing every second must not trigger a recompute each time, yet a real failure must not be delayed.",
    k: ["Immediate reaction to every state change versus hold-down timers: immediate gives the fastest recovery and amplifies flapping, hold-down is stable and delays real failure response.", "Utilization from polling versus device-pushed telemetry: polling is universal and coarse, pushed telemetry is finer and needs device support."],
    p: ["Treating the local port state as link state misses a failure in the middle of a long cable or optical span.", "Counters read at inconsistent times produce negative or spiking utilization after a counter reset."],
    v: "Flap a lab link ten times in a second and confirm the controller applies the hold-down and recomputes once, then take it down for good and confirm paths move within the stated recovery time.",
    dep: ["topology-store","streaming-telemetry"]
  },
  "installed-rule-mirror": {
    s: "The controller's record of what each device actually holds in its tables, built from acknowledgments and read-backs, separate from what the controller intended to install.",
    d: "Every rule sent is tracked through states: pending, acknowledged, confirmed by read-back, failed, removed. Devices report removals by timeout and by deletion, and these update the mirror. Periodic audits refresh it from the device. The mirror feeds reconciliation, verification and quota accounting. The difficulty is that it is always a belief about a remote system: acknowledgments can be lost, devices can restart empty, and rules can be modified by other agents.",
    k: ["Trust acknowledgments versus confirm by reading back: acknowledgment is cheap and misses silent failures, read-back is certain and costs device and channel capacity.", "Full mirror of every rule versus summaries and hashes: a full mirror enables exact diffs, summaries save memory and need a re-read to find what differs."],
    p: ["A device that restarts and silently loses its table leaves the mirror full of rules that no longer exist.", "A rule acknowledged then evicted under table pressure still counts as installed."],
    v: "Install a thousand rules, power-cycle the switch, and confirm the mirror marks them missing after reconnect and that a subsequent audit matches the device's own table dump.",
    dep: ["network-state-model","control-channel"]
  },
  "host-table": {
    s: "The record of end hosts and workloads: addresses, attachment point, virtual network, and last seen time, learned from the orchestrator and from observed traffic.",
    d: "Each entry binds hardware and network addresses to a device and port, plus tenant and group labels. Entries are created by discovery or by integration with a workload orchestrator, and aged out when silent. Moves update the attachment and notify subscribers. Entries drive forwarding, policy group membership and endpoint tracking. The difficulty is volume and ambiguity: a host with several addresses, a host seen through two ports, or a link-layer loop produces conflicting entries that must be arbitrated.",
    k: ["Learn hosts from traffic versus from authoritative sources: learning works anywhere and can be spoofed, authoritative sources are trustworthy and only cover managed workloads.", "Aging timeouts short versus long: short ones clear stale hosts and force relearning, long ones keep state and misdirect traffic to departed hosts."],
    p: ["A host reachable through two ports flaps between them and generates a stream of update events.", "Entries for departed hosts keep group membership alive, leaving policy exceptions open."],
    v: "Move a host from one port to another, confirm the table shows the new attachment within the documented time, subscribers get one move event, and traffic follows to the new port.",
    dep: ["network-state-model","host-discovery"]
  },
  "desired-vs-actual-state": {
    s: "A deliberate separation between the configuration the controller intends and the state devices report, with the gap between them treated as first-class data.",
    d: "Intended state comes from intents, policy and operator input, after compilation. Actual state is whatever devices report through events, polling and read-back. The controller stores both and computes the difference continuously. The difference drives reconciliation, drift alarms and the status shown for each intent. The difficulty is the transient: during any change the two states legitimately differ, so the system needs a notion of in-flight and an expected convergence time before it calls a difference a fault.",
    k: ["Explicit two-state model versus single state with a dirty flag: two-state makes the gap queryable and testable, a flag is simpler and loses what exactly differs.", "Convergence deadline per change versus global timeout: per-change deadlines catch stuck updates precisely and need estimates for each kind of change."],
    p: ["No in-flight concept, so every change raises a false alarm until it completes.", "A device whose reported state cannot be trusted, such as during a software bug, corrupts the actual-state record that reconciliation relies on."],
    v: "Submit a change and confirm the status goes from pending to converged, with the difference shown per device in between. Block one device and confirm the status shows it stuck after the deadline.",
    dep: ["network-state-model","installed-rule-mirror"]
  },
  "consistent-update-planning": {
    s: "Works out an ordering and packaging of rule changes across devices such that no packet sees a harmful mixture of old and new rules during the transition.",
    d: "The planner takes a current and target configuration and produces steps with dependencies. For some changes an order exists, such as installing a new path from the far end backward before switching ingress. For others it uses a two-phase scheme or temporary rules. It also checks capacity during transition, since old and new rules coexist and can overflow a table. The difficulty is that finding a safe order can be impossible without extra mechanisms, and plans are only valid if the network behaves as modeled.",
    k: ["Order-based safe sequences versus versioned two-phase updates: ordering needs no extra table space and does not always exist, versioning always works at the cost of doubled rules during the change.", "Plan once up front versus step-by-step with checks: up-front plans are verifiable in advance, adaptive stepping reacts to failures in flight."],
    p: ["Ignoring peak table use during the transition makes the update fail midway when old and new rules coexist.", "A plan assumes instantaneous device response, but a slow device leaves a window in which packets loop."],
    v: "Update a path through five switches under constant traffic and confirm from packet captures that no packet is lost, duplicated or looped during the change, and that table occupancy stays under the capacity limit.",
    dep: ["topology-store","table-capacity","installed-rule-mirror"]
  },
  "versioned-two-phase-update": {
    s: "Updates the network by installing new rules tagged with a new version everywhere, then switching ingress to stamp the new version, so each packet is handled entirely by one configuration.",
    d: "Phase one installs rules matching a new version tag on every device along the new paths while old rules stay active. After all confirm, phase two changes the ingress rules to stamp packets with the new version. When old-version traffic has drained, the old rules are deleted. Each packet sees only old or only new rules, never a mix. The cost is double table use during the change and a header field for the tag, and the difficulty is determining confirmation and drain correctly.",
    k: ["Per-packet consistency with version tags versus per-flow consistency: per-packet is the stronger guarantee and uses a tag field, per-flow is cheaper and lets one flow's packets straddle the change.", "Wait a fixed drain time versus track outstanding packets: fixed waits are simple and guess, tracking counters is precise and requires counter support."],
    p: ["Deleting old-version rules before in-flight packets have drained drops those packets.", "The version field collides with another use of the same header bits, such as a tenant identifier."],
    v: "Change a route under a continuous sequence-numbered stream, then confirm no packet arrives out of the old-or-new set and that the old-version rules are gone afterward.",
    dep: ["consistent-update-planning","match-fields","table-capacity"]
  },
  "ordered-rule-updates": {
    s: "Applies rule changes in an order and with barriers so that each step's preconditions already hold on the devices before the next step starts.",
    d: "Updates are grouped into rounds. Within a round, messages go to devices in parallel, and a barrier request is sent after them: the device replies only when all earlier messages are applied. The controller advances to the next round when every barrier reply arrives. This turns an unordered, pipelined channel into reliable ordering. The difficulty is that barrier replies mean the device software processed the message, and not necessarily that hardware tables changed, which on some devices happens later.",
    k: ["Barriers between rounds versus pipelining without waits: barriers give correct order and cost a round trip per round, pipelining is fast and unsafe for dependent rules.", "Per-device ordering only versus network-wide rounds: per-device is cheap and cross-device dependencies need the global rounds."],
    p: ["A device that acknowledges before hardware programming completes breaks the order the controller relied on.", "A single slow device stalls the barrier and holds up the whole round."],
    v: "Install a chain of rules in dependency order on devices with different latencies while sending probes, and confirm no probe is dropped because a downstream rule was missing when an upstream rule went live.",
    dep: ["control-channel","consistent-update-planning","flow-protocol"]
  },
  "network-transactions": {
    s: "Groups changes across many devices into a unit that either completes everywhere or is undone, with isolation from concurrent changes.",
    d: "A transaction collects rules and configuration for multiple devices, validates them against capacity and invariants, then prepares and commits them, with a defined recovery if some device fails midway. Locks or optimistic version checks prevent two transactions from working on overlapping state. A write-ahead record in the replicated store allows a new leader to finish or undo work after a crash. True atomicity across devices is impossible, so the guarantee is eventual completion or rollback.",
    k: ["Lock affected resources versus optimistic validation at commit: locks avoid wasted work and can deadlock or serialize operators, optimistic proceeds freely and may reject at the end.", "Roll forward versus roll back after partial failure: roll forward finishes the intent, rollback restores a known good state and discards work."],
    p: ["A controller crash mid-commit leaves devices half-updated with nobody knowing the transaction exists.", "Long transactions holding locks block unrelated urgent changes."],
    v: "Kill the leader during a transaction affecting ten devices and confirm the new leader finds the record and drives the transaction to a complete or fully undone state, verified by comparing every device.",
    dep: ["consensus-store","ordered-rule-updates","rollback"]
  },
  "rollback": {
    s: "Restores the network to a previous known-good state after a failed or harmful change, either automatically or on operator command.",
    d: "Before a change, the controller records the previous rules and configuration of every affected device. Rollback inverts the change by reinstalling that state, applying the same ordering rules in reverse, since a careless rollback can itself cause an outage. Triggers include failed health checks after commit, invariant violations and manual request. Confirmed commits require the operator to confirm within a time, or the change is undone. The hard part is that the old state may no longer be valid if the network changed in between.",
    k: ["Automatic rollback on a failed health check versus manual decision: automatic limits outage time and can undo a change that was needed for other reasons, manual is deliberate and slow.", "Restore by snapshot versus compute the inverse: snapshot is exact for those devices and can overwrite unrelated later changes, inverse touches only what the change touched."],
    p: ["Rolling back to a snapshot overwrites an unrelated change made by another operator in the meantime.", "Rollback triggered by a transient probe failure oscillates the network between two states."],
    v: "Commit a deliberately harmful change with a confirmation timer, do not confirm, and verify that at expiry every device returns to its previous rules and traffic recovers.",
    dep: ["installed-rule-mirror","ordered-rule-updates"]
  },
  "update-pacing": {
    s: "Controls how fast and how large the controller's changes to devices are, so that bulk updates and recovery storms do not overload device CPUs or control channels.",
    d: "Updates are queued per device with limits on messages per second, outstanding unacknowledged messages and batch size. Priorities let failure recovery overtake routine changes. Feedback from device latency and error replies slows the sender. Devices vary: hardware programming rates range from hundreds to tens of thousands of rules a second, so limits are learned or configured per model. The difficulty is balancing speed against stability, as slow updates lengthen recovery and fast ones can crash the agent.",
    k: ["Static per-model rate limits versus adaptive feedback: static is predictable and wrong for unusual loads, adaptive follows device health and can oscillate.", "Large batches versus single-rule messages: batches amortize overhead and make failures harder to attribute to one rule."],
    p: ["After a site-wide power event every device is flooded with reinstall requests simultaneously, and several agents crash.", "A low-priority bulk change at a fixed rate delays an urgent failure reroute behind it."],
    v: "Install fifty thousand rules to a lab switch with a pacing limit and confirm the observed rate stays below the limit, device CPU stays below its threshold, and a high-priority update inserted midway is applied first.",
    dep: ["control-channel","device-inventory"]
  },
  "counter-polling": {
    s: "Periodically requests packet and byte counters for ports, flows and queues from devices, giving the controller a measured view of load and rule activity.",
    d: "A scheduler issues statistics requests at an interval per device and object type and spreads them over time so they do not arrive together. Replies are converted to rates by differencing successive samples, handling resets and wraparound. Data feeds utilization, traffic matrices and rule hit analysis. The difficulty is cost and accuracy: large tables take long to read and burden the device CPU, and the polling interval sets a hard limit on how quickly bursts and failures are seen.",
    k: ["Short polling intervals versus long: short intervals catch microbursts and load devices and channels, long ones are cheap and average away short congestion.", "Poll all rules versus poll only tagged ones: polling everything gives full visibility and doesn't scale, tagged sets track what matters at the cost of blind spots."],
    p: ["Reading a counter after a device restart as a huge negative delta produces absurd traffic spikes.", "Synchronized polls from many controllers or tools to the same device slow its forwarding agent."],
    v: "Send a constant 1 Gbps stream through a switch and confirm the computed rate from polled counters is within the documented error of 1 Gbps, across a forced counter reset.",
    dep: ["control-channel","device-drivers"]
  },
  "streaming-telemetry": {
    s: "Device-initiated continuous export of state and counters over a long-lived connection, on a schedule or on change, replacing repeated polling requests.",
    d: "The controller subscribes to paths in the device's data model, choosing sample intervals or on-change delivery. The device encodes updates in a compact format and pushes them over a persistent connection. This gives finer time resolution at lower cost than polling and delivers changes such as interface down right away. The difficulty is volume and heterogeneity: thousands of devices producing millions of values per second need parsing and normalization into a common model, and devices differ in which paths they support.",
    k: ["On-change subscription versus periodic sampling: on-change is quick and cheap for rare events and misses slow drift, sampling gives uniform series at constant volume.", "Device-side aggregation versus raw export: aggregating reduces volume and discards detail needed for later investigation."],
    p: ["A subscription that silently stops without any error leaves the controller treating old values as current.", "Clock differences between devices misorder events and corrupt correlation across them."],
    v: "Subscribe to interface state on a lab device, take the port down, and confirm the update arrives within the target latency with a device timestamp, then verify the sample rate on a counter path matches the interval.",
    dep: ["control-channel","data-models","telemetry-collectors"]
  },
  "packet-sampling": {
    s: "Copies one in every N packets, or packets matching a rule, with their headers and metadata to a collector for traffic analysis, security and flow-level accounting.",
    d: "Devices sample in hardware at a configured rate and export headers plus input and output port, aggregated into flow records or sent raw. Collectors rebuild flow-level statistics by scaling counts with the sampling rate. The controller sets rates per port and rule, and may raise them on demand when investigating. The difficulty is statistical: low rates miss small flows entirely, and error bars on estimates grow for rare traffic, so decisions based on samples need to account for sampling error.",
    k: ["Uniform sampling versus adaptive: uniform is unbiased and simple, adaptive samples more where traffic changes but needs correction for the varying rate.", "Sample on the device versus mirror to the controller: sampling is scalable, full mirroring gives exact data at a cost no network can bear for long."],
    p: ["Treating sample counts as exact flow sizes creates false alarms on small flows.", "Samples sent to the controller's own channel compete with control traffic and delay rule updates."],
    v: "Send a known flow of one million packets at a 1-in-1000 sampling rate and confirm the collector estimates close to one million within the stated statistical error, and that port attribution is correct.",
    dep: ["telemetry-collectors","control-channel"]
  },
  "telemetry-collectors": {
    s: "Services that receive, decode and normalize the streams of telemetry and samples from devices, then forward the clean results to storage and consumers.",
    d: "Collectors terminate device connections, authenticate them, decode multiple formats and map device-specific names to model paths. They attach device identity and a trusted receive timestamp, batch, and publish to the event pipeline and time-series store. They scale horizontally, with devices assigned to collector instances, and failover reassigns them. The difficulty is back pressure: when downstream storage slows, collectors must drop or buffer deliberately, with an accounting of what was lost.",
    k: ["Collectors co-located with the controller versus a separate tier: co-located is simple, a separate tier scales independently and keeps telemetry load from affecting control.", "Drop on overload versus buffer to disk: dropping protects the process and loses data, buffering keeps data and risks filling storage."],
    p: ["Silent drops under load make graphs look calm exactly when the network is stressed.", "Device-supplied timestamps are trusted without checking, so one wrong clock distorts the series."],
    v: "Overload a collector in a lab and confirm it reports a dropped-sample count matching the shortfall at the consumer, and that data resumes with correct device identity after the load stops.",
    dep: ["event-pipeline","device-inventory"]
  },
  "event-pipeline": {
    s: "An ordered, buffered path that carries telemetry, alarms and state changes from collectors to the services that act on them, with filtering, enrichment and correlation.",
    d: "Events flow through stages: parse, enrich with inventory and topology, deduplicate, correlate related events such as one failed device producing many link-down events, then route to subscribers. Partitioning by device preserves per-device order. Durable buffers decouple producers from consumers and allow replay. The difficulty is correlation under delay: a root-cause event may arrive after its symptoms, so correlation windows trade latency against accuracy.",
    k: ["Partition by device versus by event type: by device keeps each device's events in order, by type balances load by kind and loses cross-event order.", "Correlate in the stream versus after the fact: streaming correlation is fast and may mislead on partial data, after-the-fact analysis is accurate and late."],
    p: ["A flood of symptom events from one failure hides the root cause in an alarm storm.", "An enrichment stage reading stale inventory labels events with the wrong site or role."],
    v: "Fail a switch with forty links and confirm the pipeline emits one correlated device-failure event naming the root cause, with forty link events grouped under it, within the correlation window.",
    dep: ["event-bus","network-state-model"]
  },
  "time-series-store": {
    s: "A database tuned for timestamped numeric measurements, keeping counters, rates and latency series with downsampling and retention for dashboards, alerts and planning.",
    d: "Writes are append-heavy and batched by series and time. Data is compressed in blocks, indexed by labels such as device, port and tenant, and downsampled into coarser rollups as it ages. Queries compute rates, percentiles and aggregates over windows. Retention drops old raw data. The difficulty is cardinality: labels with many distinct values, such as per-flow identifiers, multiply the series count and can exhaust memory and indexes, so label design is a core decision.",
    k: ["Keep raw data long versus downsample early: raw preserves detail for investigations at high storage cost, rollups are cheap and lose peaks.", "Store per-flow series versus per-port: per-flow answers detailed questions and its cardinality grows without bound, per-port is bounded and coarse."],
    p: ["Downsampling by averaging hides short bursts that caused drops.", "A label with unbounded values, such as a flow identifier, makes the index grow until queries time out."],
    v: "Write a series with a known one-second burst, query it after downsampling, and confirm the maximum rollup preserves the burst while the average does not, and that retention deletes data past its age.",
    dep: ["telemetry-collectors"]
  },
  "failure-detection": {
    s: "Notices that a link, port, device or controller connection has failed, combining device reports, rapid liveness checks and loss of the control channel.",
    d: "Several signals are combined: a port's loss-of-signal event, bidirectional forwarding checks between neighbors at millisecond intervals, discovery frame timeouts, and heartbeat loss on the control channel. Detection speed trades against false positives, so signals are given weights and hold-down times. Fast detection is pushed to devices, which act locally, while the controller detects slower, gray failures. The difficulty is gray failures: partial loss, one-way breaks and slow devices that stay up yet drop traffic.",
    k: ["Detection in devices versus in the controller: devices detect in milliseconds and see only locally, the controller sees the whole network and reacts in seconds.", "Aggressive timers versus conservative: aggressive recovers faster and flaps on transient loss, conservative is stable and prolongs outages."],
    p: ["A link dropping five percent of packets stays up in every status check and degrades every flow over it.", "Control channel loss to a device is treated as device failure, rerouting traffic off a switch that is still forwarding."],
    v: "Inject one-way loss on a link in a lab and confirm that bidirectional liveness checks flag it within the configured detection time, and that the controller marks the link degraded while the port stays up.",
    dep: ["link-port-state","control-channel","link-discovery"]
  },
  "reroute-engine": {
    s: "Reacts to detected failures by recomputing affected paths and reprogramming devices, prioritizing the traffic and devices closest to the fault.",
    d: "When a failure event arrives, the engine finds the flows and intents using the failed element, activates precomputed backups or computes new paths with constraints, and sends updates in priority order with ordering and pacing rules. It also handles recovery, shifting traffic back only after the restored element is stable, to avoid oscillation. The difficulty is scale: one failed core link can affect thousands of flows, and the order and speed of fix-up determine how much traffic is lost.",
    k: ["Reroute everything at once versus by priority class: all at once is simplest and floods devices, class order recovers the critical traffic first and takes longer overall.", "Revert to the original path on recovery versus stay on the new path: reverting restores the intended design and causes a second disruption, staying is stable and drifts from plan."],
    p: ["Recovery traffic shifting back to a link that is still flapping causes a repeating cycle of loss.", "Reroute computed on topology that does not yet include a second simultaneous failure sends flows into another dead link."],
    v: "Fail a core link carrying a thousand flows, measure per-flow loss time from probes, and confirm critical-class flows recover first, within the target, with no flow left on the failed link.",
    dep: ["failure-detection","backup-paths","shortest-path","update-pacing"]
  },
  "event-bus": {
    s: "The internal publish and subscribe channel on which controller components exchange topology, state, packet and timer events, in order and without direct coupling.",
    d: "Producers publish typed events and consumers register handlers, possibly with filters and priorities. Delivery is in-process for speed and extended across cluster members for distributed events. Events for one device are dispatched in order on one thread. The bus provides back pressure and metrics on queue depth. The difficulty is handler behavior: one slow or blocking handler delays everything behind it, and ordering guarantees must be explicit, because components silently depend on them.",
    k: ["Single ordered dispatch thread per device versus parallel handlers: ordered dispatch is predictable and limits throughput, parallelism scales and loses ordering unless handled explicitly.", "Bounded queues that drop versus unbounded queues: bounded protect memory and lose events, unbounded never lose events and eventually exhaust memory."],
    p: ["A handler that calls a remote service synchronously stalls event delivery for the whole device.", "Events dropped from a full queue are never detected, leaving state permanently out of date."],
    v: "Publish a burst of 100,000 events for one device and confirm every consumer sees them in order with no loss, and that queue depth and handler latency metrics show the burst and drain.",
    dep: []
  },
  "module-runtime": {
    s: "The container that loads, starts, orders and stops controller services and applications, resolving their dependencies and enforcing their resource limits.",
    d: "Modules declare the services they provide and require, and the runtime builds a dependency graph, starts them in order and stops them in reverse. It supports hot loading of applications, configuration injection, health checks and per-module accounting for CPU and memory. Isolation levels range from shared address space to separate processes. The difficulty is fault containment: a leaking or looping module must be detected and restarted without taking the controller with it, and state it owned must be cleaned up.",
    k: ["Dynamic loading at runtime versus fixed build-time composition: dynamic allows live upgrades and third-party apps, fixed is simpler to test and secure.", "Shared process versus separate processes: shared has the lowest call overhead, separate processes contain crashes and cost serialization."],
    p: ["A module that spawns unbounded threads exhausts the controller process, taking all applications down.", "Cyclic service dependencies hang startup with no useful message."],
    v: "Start the controller with a deliberately looping module, confirm the runtime flags and isolates or restarts it within its limit, and verify other modules' event handling latency stays within its normal range.",
    dep: ["event-bus"]
  },
  "cluster-membership": {
    s: "Tracks which controller instances are alive and part of the cluster, detects failures and changes in membership, and tells every component who is present.",
    d: "Instances discover each other through configuration or a registry, exchange heartbeats, and agree on a membership view. A failure detector with tunable timeouts suspects slow nodes, and consensus on view change prevents split decisions. New nodes join, catch up on replicated state and then take on load. The difficulty is partitions: members cannot tell a dead peer from an unreachable one, so safety rules must make both sides behave correctly without knowing which it is.",
    k: ["Short failure-detector timeouts versus long: short ones fail over quickly and cause spurious elections under load, long ones are stable and slow to recover.", "Odd-sized voting group versus larger groups with observers: small voting groups keep commit latency low, observers add read capacity without joining quorum."],
    p: ["A node paused by a long garbage collection or VM stall returns believing it is still a member, and acts on stale state.", "A cluster split into two even halves has no majority on either side, and everything stops."],
    v: "Isolate one member of a three-node cluster by blocking its network, and confirm the majority elects continues serving, the isolated node stops writing, and the node rejoins and catches up after the block is removed.",
    dep: ["consensus-store"]
  },
  "consensus-store": {
    s: "A replicated, strongly consistent store, built on a consensus protocol, that holds the controller's authoritative configuration, intents and critical state across all members.",
    d: "Writes go through a leader, are appended to a log replicated to a majority, and are applied in the same order everywhere, so any member can take over with identical state. Snapshots and log compaction bound storage and recovery time. Reads are served by the leader or by followers with a bounded staleness choice. The difficulty is throughput and latency: every write waits for a majority round trip, so high-rate state such as counters must not be put in it.",
    k: ["Strongly consistent store for configuration versus eventually consistent for observed state: strong consistency avoids conflicting decisions and limits write rate, eventual scales and requires conflict handling.", "Linearizable follower reads versus leader-only reads: leader-only is simple and loads one node, follower reads scale and need read-index coordination."],
    p: ["Putting per-packet or per-counter data in the replicated log saturates it and delays real configuration changes.", "Snapshots taken during heavy writes stall the leader long enough to trigger an election."],
    v: "Write a configuration change, stop the leader immediately after commit acknowledgment, and confirm the new leader serves the change and no acknowledged write is missing.",
    dep: ["cluster-membership"]
  },
  "leader-election": {
    s: "Chooses one controller instance to perform tasks that must have a single owner, such as global optimization, and replaces it quickly and safely when it fails.",
    d: "Election uses leases or terms in the consensus store: the holder renews periodically and loses leadership if it cannot. A fencing token, incremented on each change, accompanies the leader's actions so that devices and storage reject commands from a stale leader. Multiple independent elections can exist, one per task or partition. The difficulty is overlap: for a brief time two instances may both think they lead, and fencing is the only reliable protection.",
    k: ["Lease-based leadership versus continuous heartbeat quorum: leases are simple and rely on bounded clock drift, heartbeats avoid clock assumptions and need more messages.", "One global leader versus a leader per partition: one leader is simple and a bottleneck, per-partition spreads load and complicates cross-partition tasks."],
    p: ["A leader that lost its lease keeps sending updates to devices that cannot tell it is stale.", "Election timeouts shorter than the leader's pause times cause leadership to bounce between nodes."],
    v: "Freeze the leader process, confirm another is elected within the lease time, then unfreeze it and confirm devices reject its commands via the fencing token and it steps down.",
    dep: ["consensus-store","cluster-membership"]
  },
  "device-mastership": {
    s: "Assigns each device to one controller instance that is the sole writer to it, with standby instances ready to take over if the master fails.",
    d: "Every device has a master and one or more standbys, recorded in the replicated store. Only the master sends rule updates, which prevents conflicting writes, while all instances may read. On master failure, a standby is promoted, reconnects with a higher generation number which the device records, and the new master reconciles device state before accepting changes. Balancing spreads devices evenly across members. The difficulty is handover safety, as old and new masters must never both write.",
    k: ["Single master per device versus multiple writers with conflict resolution: single master is simple and safe, multiple writers give no failover gap and need merge rules.", "Static assignment versus dynamic balancing: static is predictable, dynamic evens load and causes handovers that each risk a transient gap."],
    p: ["A deposed master still holding an open connection writes stale rules after the new master has taken over.", "After failover the new master assumes the old master's mirror was complete and misses rules in flight."],
    v: "Kill the master of a device under traffic, and confirm a standby takes over within the stated time, forwarding continues, device-side generation numbers increment, and a delayed message from the old master is rejected.",
    dep: ["consensus-store","leader-election","control-channel"]
  },
  "state-partitioning": {
    s: "Divides the network's state and the work of managing it among controller instances, by device, region or tenant, so capacity grows by adding instances.",
    d: "Partitions follow natural boundaries: devices and their local state to an instance, tenants to shards, regions to separate controllers in a hierarchy. Cross-partition information, such as links between devices owned by different instances, is replicated or exchanged. Global computations use a merged read-only view. The difficulty is boundaries: path computation and updates spanning partitions need coordination, and badly chosen partitions put most traffic of the controller's own messaging across them.",
    k: ["Partition by device versus by tenant: by device matches control channel ownership, by tenant isolates customers and spreads each tenant's rules over all devices.", "Flat peers versus hierarchy of controllers: flat peers are simpler, a hierarchy limits each member's scope and adds a slow top level."],
    p: ["A single hot partition, such as a core device with a huge flow count, caps throughput regardless of cluster size.", "Cross-partition links are owned by neither side, so failures on them are noticed late or by both."],
    v: "Add a controller instance to a running cluster, confirm devices rebalance, aggregate event throughput increases, and cross-partition path requests still complete with correct rules on both sides.",
    dep: ["device-mastership","consensus-store","network-state-model"]
  },
  "rolling-upgrade": {
    s: "Upgrades controller instances one at a time while the cluster keeps managing the network, so software changes do not interrupt forwarding or management.",
    d: "Each instance is drained of device mastership, upgraded and rejoined, then the next. Mixed-version operation is supported for a window: the replicated state format, internal protocols and APIs must be compatible across adjacent versions, with feature flags enabling new behavior only after all members are upgraded. Schema migrations are run in steps that can be reversed. The difficulty is compatibility, as every persisted structure and message is a promise to the previous version.",
    k: ["Rolling upgrade with mixed versions versus full-cluster restart: rolling avoids downtime and demands strict compatibility discipline, restart is simple and interrupts management.", "Feature flags enabled after all members upgrade versus enabled per member: after-all is safe and delays features, per member risks members disagreeing on semantics."],
    p: ["A new version writing a state format the old version cannot read breaks rollback and any still-running old members.", "Draining mastership all at once during an upgrade leaves devices without a master."],
    v: "Upgrade a three-node cluster one member at a time while running continuous API calls and a traffic stream, and confirm no API call fails permanently, no packet is lost and every member reports the new version at the end.",
    dep: ["cluster-membership","device-mastership","consensus-store"]
  },
});
