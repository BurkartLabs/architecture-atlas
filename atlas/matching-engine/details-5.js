// Details for the matching engine plate, part 5: network and hardware, cross-cutting concerns.
ATLAS.details("matching-engine", {
  "kernel-bypass-networking": {
    s: "Network I/O that lets the application read and write packets directly from the adapter's memory, skipping the operating system's network stack and its copies, interrupts and context switches.",
    d: "The application polls receive rings mapped from the adapter and writes to transmit rings, using a user-space stack or vendor libraries for the transport protocol. Packets arrive in the application's memory with no system call. It cuts several microseconds and removes much of the jitter. It is hard because the application owns the whole stack behavior: connection handling, retransmission, congestion and offloads. Standard tools such as packet capture and firewalls no longer see the traffic, and every adapter needs a validated driver.",
    k: ["User-space stack with polling vs. the kernel stack: user space is far faster and steadier at a cost of a core and a custom stack, while the kernel stack is general and slower.", "Own the transport implementation vs. use a vendor library: owning gives control, and vendor libraries save effort and tie the venue to the hardware."],
    p: ["A rarely used transport corner case, such as a window update or a reordered segment, is mishandled and appears once a month.", "Standard diagnostics do not see the traffic and an outage takes hours to explain."],
    v: "Compare round-trip latency and its 99.99th percentile for a loopback test across the bypass and kernel paths on the production hardware, and confirm no system calls occur on the hot path during a run.",
    dep: ["server-tuning","hardware-offload"]
  },
  "colocation-cross-connects": {
    s: "Placing members' servers in the same facility as the engine, connected by equal-length dedicated fiber, so physical distance does not decide who is faster.",
    d: "The venue's data center offers racks and cages near the matching engine. Each member is connected with a cross-connect, a direct fiber between the member's rack and the venue's network, cut to the same length for everyone and checked after any change. Power, cooling and ports are provisioned per member. Some venues also provide a proximity tier for those who want it. It is hard because fairness is an engineering promise that has to be measured, and because capacity for racks and power constrains growth.",
    k: ["Equal-length fiber for all vs. nearest placement: equal length is provably fair and wastes fiber and space, while nearest placement is simple and rewards those who arrive first.", "Venue-owned hosting vs. third-party facility: venue-owned gives control of the physical layer, while a third party has more connectivity and less control of fairness."],
    p: ["A technician swaps a patch cord for a different length and one member's delay changes by hundreds of nanoseconds.", "A cage fills its power budget and the member cannot add servers."],
    v: "Measure round-trip time from each member port to the gateway with a calibrated tester and confirm that all values are within the published tolerance, after every physical change.",
    dep: ["hardware-timestamping"]
  },
  "hardware-timestamping": {
    s: "Adapters and switches that stamp each packet in hardware as it crosses the wire, giving nanosecond-accurate times without operating system or software delay.",
    d: "A timestamp unit on the adapter records a packet's arrival or departure against its own clock, which is disciplined by the time protocol. Software later reads the stamp from the packet's metadata. Switches with timestamping give independent edge records. These values feed audit, latency measurement and fairness checks. It is hard because stamp accuracy depends on how the clock is set, on cable and transceiver delays that must be calibrated, and on knowing exactly which point of the packet is stamped.",
    k: ["Stamp at the adapter vs. at the switch edge: adapter stamps are close to the application, while switch stamps are independent of the server under test.", "Hardware stamps everywhere vs. software stamps for internal stages: hardware is exact and costs equipment, while software is free and adds jitter to the measurement."],
    p: ["Uncalibrated fiber lengths differ between ports and a constant offset of dozens of nanoseconds is read as unfairness.", "A firmware update changes which point of the frame is stamped and the audit trail shifts silently."],
    v: "Send packets through a splitter to two independent timestamping devices and confirm both stamps agree within the specified tolerance. Repeat after any hardware or firmware change.",
    dep: ["low-latency-switching"]
  },
  "low-latency-switching": {
    s: "Network switches chosen and configured for the lowest and most uniform delay, usually cut-through, with shallow buffers, no unneeded features and a flat topology.",
    d: "Cut-through switches forward a frame after reading its header, giving fixed delays of a few hundred nanoseconds, against microseconds for store-and-forward. Topologies minimize hops between members, gateways and the engine, and multicast replication occurs in hardware. Buffers, queue rules and rate limits are set conservatively. It is hard because microbursts, where many packets arrive at one port at once, cause queueing and loss even at low average load, and because multicast scaling depends on the switch's replication limits.",
    k: ["Cut-through vs. store-and-forward: cut-through is faster and lets damaged frames propagate, while store-and-forward is safer and slower.", "Deep buffers vs. shallow buffers: deep buffers absorb microbursts and add variable delay, while shallow buffers keep delay low and drop under bursts."],
    p: ["Replication of a heavy multicast group saturates a switch's replication engine and delays the feed.", "A switch feature, such as spanning tree or a logging agent, adds periodic latency spikes."],
    v: "Send a calibrated burst of line-rate traffic to one port and measure per-hop delay and loss, and confirm that delay stays within the stated bounds and no feed packets are lost at peak.",
    dep: []
  },
  "hardware-offload": {
    s: "Moving selected tasks from software onto programmable chips or adapters, such as packet parsing, risk checks, feed handling or time stamping, to reach delays that general processors cannot.",
    d: "Programmable logic on the network adapter can decode protocol headers, apply simple checks, filter, and in extreme designs run the matching of a simple book itself. The control path and complex rules stay in software. Development uses hardware description languages and a long verification flow. It is hard because the logic is far harder to change and test than software, resources are limited, and the software and hardware versions of a rule have to agree exactly.",
    k: ["Offload fixed simple functions vs. offload matching itself: simple offload gives large gains at low risk, while full offload gives the lowest delay and limits order types and flexibility.", "Hardware rules duplicated in software vs. hardware only: duplication allows fallback and cross-checks and can drift apart, while hardware only is single-sourced and hard to change."],
    p: ["A rule implemented in hardware is updated in software only and the two disagree for a week.", "A bug found in production needs a long rebuild and verification cycle to fix."],
    v: "Run the same recorded input through the hardware path and a software reference implementation and compare all outputs for exact equality, including malformed and boundary packets.",
    dep: ["hardware-timestamping"]
  },
  "server-tuning": {
    s: "Configuration of processors, memory, firmware and the operating system to remove sources of jitter: power states, interrupts, timers, memory pages and background services.",
    d: "Typical settings disable deep power states and frequency scaling, fix clock speeds, turn off features that cause system management interrupts, use large memory pages, disable background services and set processor affinity. Firmware, kernel and driver versions are pinned and tested as a set. Hardware is identical between active and standby. It is hard because settings must be consistent across a fleet and survive updates, and because a single missed setting appears as an occasional microsecond-scale spike that takes weeks to trace.",
    k: ["Pin versions and update rarely vs. keep current for security: pinning gives a validated and stable system and accumulates vulnerabilities, while updating is safe and risks latency regressions.", "Identical hardware on active and standby vs. diverse hardware: identical hardware gives equal behavior after failover, while diversity protects against a common fault."],
    p: ["A firmware update re-enables a power-saving state and the tail latency doubles.", "A management controller interrupt fires on an isolated core every few minutes."],
    v: "Run a jitter test that spins on an isolated core for hours and records every gap longer than a microsecond. The distribution must stay within the stated limit on every machine in the fleet.",
    dep: []
  },
  "determinism": {
    s: "The decision that the engine's behavior is a pure function of its logged input, so any copy fed the same inputs produces the same state and the same outputs.",
    d: "This is chosen first because it enables replication by replay, exact standby behavior, bug reproduction, audit derived from the log and regression testing on real traffic. It constrains every component: no clock reads, no random numbers, defined iteration order, exact integer arithmetic and explicit inputs for all external data. It affects the sequencer, book, risk, auctions and snapshots alike. The cost is discipline everywhere in the core, and a violation tends to show only when a standby diverges after a release.",
    k: ["Deterministic engine with all inputs logged vs. non-deterministic engine with state copied to replicas: determinism is cheap to replicate and test, while copying tolerates sloppiness and costs bandwidth and latency.", "Pure integer arithmetic vs. floating-point: integers give identical results everywhere, while floats are convenient and differ across compilers."],
    p: ["A new feature reads the clock in the core and replay quietly diverges from live.", "Differences between compiler versions change evaluation order and the standby computes a different result."],
    v: "Run the same day's log through two builds on different machines and compare output hashes at fixed sequence intervals, in continuous integration, and fail the build on any difference.",
    dep: ["deterministic-state-machine","sequencer","logical-time"]
  },
  "fairness": {
    s: "The commitment that all members are treated by published rules and equal conditions: same priority rules, same data timing, same path to the engine, and no undisclosed advantages.",
    d: "Fairness shows up in priority rules, in order types, in the physical layer, in feed distribution and in gateway design, and its definition is a venue decision, since equal access, equal outcomes and best price for investors can conflict. It must be measurable, so the venue records evidence: edge timestamps, arrival-time tests, per-member latency. Regulators and members audit these claims. The cost is performance and flexibility: equalizing paths and delays gives up speed and features that could be sold as tiers.",
    k: ["Equal access for all vs. paid tiers of speed: equal access is simple to defend and gives up revenue, while tiers monetize speed and invite disputes about who is disadvantaged.", "Speed bump delay on all orders vs. none: a delay reduces the value of raw speed and adds latency for everyone, while no delay rewards the fastest."],
    p: ["A venue-privileged feature, such as an order type used only by affiliated members, is found in an inspection.", "Fairness claims rest on design intent with no continuous measurement and degrade unnoticed."],
    v: "Publish and continuously monitor per-member measured latency to the engine and from the feed, with edge hardware timestamps, and confirm the spread across members stays inside the published tolerance.",
    dep: ["equal-latency-distribution","arrival-order-fairness","price-time-priority"]
  },
  "durability-vs-latency": {
    s: "The trade-off between making each order certain to survive failures and answering as fast as possible, decided as a failure model: what the venue promises to survive, and for which orders.",
    d: "Every durability step adds time to the path of an order: writing to persistent memory, replicating to a standby, acknowledging from another site. The venue chooses the failure it will survive without loss, such as a process crash, a machine loss or a site loss, and the point at which it tells the member the order was accepted. It shapes the journal, replication, failover and disaster recovery. The cost is paid in latency on every order, and the benefit is felt rarely and very expensively when it matters.",
    k: ["Acknowledge after replication vs. before: after replication guarantees no acknowledged order is lost, while before is faster and risks orders the member believes exist.", "Same durability for all messages vs. tiers by message type: uniform is simple and safe, while tiers let cancels and market data skip costs and make the system harder to reason about."],
    p: ["The venue promises survival of a site loss and measures only the single-machine case.", "A fast path is added that acknowledges before replication for speed, and an incident loses orders silently."],
    v: "Kill machines and sites in a test at peak load and compare the orders acknowledged to clients with the orders in the recovered state. The failure model's promise must hold with zero acknowledged orders missing.",
    dep: ["journal-storage","input-replication","disaster-recovery"]
  },
  "time-and-ordering": {
    s: "The decisions about which clock, which timestamp and which sequence define what happened first, and how accurately that can be proven.",
    d: "A venue has several times: when a packet hit the edge, when it was sequenced, when matched and when published. One order, the sequence, decides priority, and one clock, traced to a recognized standard, provides evidence. Synchronization accuracy, the stamping points and the rules for ties follow from these choices. They touch the gateway, sequencer, log, feed and audit trail. The cost is hardware for time distribution, calibration work and constraints on where timestamps may be taken.",
    k: ["Sequence number as the arbiter of order vs. timestamps: the sequence is exact and unique, while timestamps are for evidence and tie in bursts.", "Stamp at the network edge vs. at the sequencer: edge stamps measure arrival fairly and need hardware and a holding delay, while sequencer stamps are simple and carry path jitter."],
    p: ["Timestamps from different stages are compared as if they shared a clock and show effects before causes.", "A tolerance is claimed for the clock without a measured error budget, and an inspection finds drift."],
    v: "Reconstruct the order of events on a busy day from sequence numbers and from timestamps, and confirm they agree everywhere outside documented ties, with clock offsets within tolerance all day.",
    dep: ["sequencer","clock-synchronization","logical-time"]
  },
  "partitioning-and-scale": {
    s: "The decision of how to divide instruments and members among engines, threads and sites, and which guarantees, such as total order across instruments, are given up for it.",
    d: "A single-threaded book scales by running many of them: one per instrument or group. Splitting follows traffic and dependencies: spreads, shared risk and index-linked rules pull instruments together. A single global sequencer gives one order across everything and caps throughput; per-partition sequencers scale and drop cross-partition order. The choice affects gateways, risk, the feed, failover and operations. The cost is complexity at partition boundaries and uneven load, and moving instruments between partitions is a risky operation.",
    k: ["One global sequence vs. per-partition sequences: global gives a simple total order and a throughput ceiling, while per-partition scales and needs rules for cross-instrument events.", "Vertical scale of one fast engine vs. horizontal partitions: one engine is simplest to operate and has a limit, while partitions scale and multiply operations work."],
    p: ["Load is spread by instrument count and the three busiest instruments land together on one core.", "A market-wide event must reach all partitions and arrives at different points in each."],
    v: "Replay the heaviest recorded day at double volume against the real partition plan and confirm that each partition keeps its latency budget, and the market-wide events land at one logical point in every partition.",
    dep: ["instrument-partitioning","sequencer","market-wide-circuit-breakers"]
  },
  "regulatory-obligations": {
    s: "The legal duties that shape the design: record keeping, clock accuracy, fair access, market integrity controls, resilience and reporting, which differ by jurisdiction and change over time.",
    d: "Rules require complete audit trails, synchronized clocks, pre-trade risk controls, halts and circuit breakers, equal access, testing of changes, business continuity and incident reporting. They determine what the engine must record, where it must stamp, which controls must exist and how changes are made. These requirements cut across audit, risk, phases, feed and operations, and a new rule can force changes to the core. The cost is data volume, process overhead and delay in releasing features.",
    k: ["Build to the strictest regime everywhere vs. per-jurisdiction variants: strictest is simple to maintain and over-delivers in some markets, while variants fit each rule and multiply testing.", "Compliance controls in the engine vs. in surrounding systems: in-engine controls are enforced and cost latency, while external ones are flexible and can be bypassed."],
    p: ["A rule change with a firm deadline arrives and the data needed was never recorded.", "A control exists on paper but is disabled in production for performance and nobody notices until inspection."],
    v: "Walk through each obligation with a regulator-style test: produce the record, show the control firing in a test, and demonstrate the evidence for clock accuracy, each from live systems rather than documents.",
    dep: ["order-audit-trail","record-retention","regulatory-reporting","clock-synchronization"]
  },
});
