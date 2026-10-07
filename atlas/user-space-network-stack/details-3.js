// Details part 3: flow classification & steering, execution model, timers & time.
ATLAS.details("user-space-network-stack", {
  "flow-table": {
    s: "A hash table mapping a packet's addressing tuple to its connection or flow record, consulted for every packet and sized for millions of entries.",
    d: "On each packet the stack hashes the tuple, probes a bucket, and compares keys to find the flow record holding state, statistics and the owning core. Open addressing or bucketed cuckoo schemes keep lookups to one or two cache lines. Tables are usually per core so no lock is needed. Insertion happens at connection creation, deletion at teardown or aging. It is hard because of scale and adversaries: hash collisions degrade lookups, and an attacker who can predict the hash can concentrate flows in one bucket.",
    k: ["Per-core tables vs. one shared table: per-core needs no locks and requires that all packets of a flow reach the same core; shared tolerates any steering and costs synchronization.", "Cuckoo or bucketed hashing vs. chained buckets: bucketed gives bounded cache lines per lookup at the cost of complex insertion; chaining is simple and unbounded."],
    p: ["An unseeded hash function lets an attacker craft tuples that collide, turning lookups into long scans.", "A table that resizes by rehashing everything pauses the core for milliseconds at a bad moment."],
    v: "Insert several million flows, run lookups at line rate, and confirm lookup cost stays within a few cache misses per packet, load factor stays under the design limit, and a crafted colliding set does not raise per-packet cost.",
    dep: ["tuple-hashing", "numa-aware-allocation", "cache-line-discipline"]
  },
  "tuple-hashing": {
    s: "Reduces a packet's addresses and ports to a fixed-size hash used for flow-table lookup and core selection, designed for speed, uniform spread and resistance to prediction.",
    d: "The hash covers source and destination addresses and ports plus the protocol, often computed by the card (Toeplitz-style with a secret key) and delivered in buffer metadata, or by software using hardware-assisted instructions. A symmetric variant makes both directions of a flow hash alike so they reach the same core. The hard part is consistency: the value the card uses to choose a queue must agree with the value software uses to find a flow, or packets arrive on a core that does not hold their state.",
    k: ["Using the card's hash vs. recomputing in software: the card's value is free but card-specific and absent on some paths; recomputing is portable and costs cycles per packet.", "Symmetric vs. directional hashing: symmetric keeps both directions on one core for stateful processing, while directional spreads asymmetric traffic more evenly."],
    p: ["Using a well-known default key lets anyone computing the hash aim traffic at a single queue.", "Software and card hashes differ for one protocol, so replies reach a core with no matching flow."],
    v: "Compare the card-supplied hash with a software calculation across a million random tuples, and confirm they match, that both directions of a flow land on one core when symmetric, and that queue load stays within a few percent of even.",
    dep: ["receive-side-scaling", "buffer-layout"]
  },
  "hardware-flow-rules": {
    s: "Programs the card to match packets by header fields and apply an action itself (steer to a queue, drop, mark, count) before software sees them.",
    d: "The stack installs rules through the device interface as match patterns and actions. Matched packets are delivered to specific queues, tagged with an identifier the stack reads from the descriptor, dropped, or sent to a virtual function. It lets exact connections go to a dedicated core or skips software classification altogether. The challenge is limits: tables hold thousands to millions of entries, rule insertion rates are finite, capabilities differ by card, and a rule that the hardware accepts but applies differently than documented is hard to notice.",
    k: ["Offloading classification to hardware vs. software only: hardware saves cycles per packet and is bounded by table size and insertion speed; software scales to any rule count and costs CPU.", "Installing a rule per connection vs. coarse rules: per-connection is precise and burns table space; coarse rules are cheap and cannot isolate individual flows."],
    p: ["A rule table that fills silently rejects later insertions, and traffic falls back to the default queue with no error.", "Rules are not removed on connection close, leaving stale entries that steer new flows wrongly."],
    v: "Install a rule for one flow, send mixed traffic, and confirm only that flow arrives on the target queue carrying the rule's tag, the rule's counter matches, and removing the rule returns the flow to default steering.",
    dep: ["device-abstraction", "queue-pairs", "flow-table"]
  },
  "software-classifier": {
    s: "Matches packets against rules in software when the card cannot, supporting richer patterns, larger tables and actions such as marking, redirecting or dropping.",
    d: "Rules combine header fields, prefixes, ranges and flags with a priority. Implementations use decision trees, tuple-space search with per-mask hash tables, or compiled matching code. Batches are classified together so each table's cache lines are reused across packets. The classifier feeds the later stages with an action. The difficulty is cost growth: rule counts, wildcard masks and overlapping priorities multiply the number of lookups per packet, and a rule-set change must apply atomically so a packet sees one version.",
    k: ["Tuple-space search vs. decision tree: tuple-space handles arbitrary masks and updates cheaply but scans each mask; decision trees are fast to match and costly to rebuild.", "Compiling the rule set vs. interpreting it: compiled code removes per-rule overhead, and an update becomes a slow build and swap."],
    p: ["A rule set update applied rule by rule lets packets match a half-updated policy.", "Wildcard-heavy rules increase lookups per packet until throughput falls below line rate for small packets."],
    v: "Load a rule set of tens of thousands of entries, run a mixed workload of small packets, and confirm every packet's action matches a reference matcher and the per-packet cost remains within its budget.",
    dep: ["flow-table", "burst-batching", "cache-line-discipline"]
  },
  "flow-to-core-mapping": {
    s: "Decides which core handles each flow and keeps that assignment stable, so all packets of a connection reach the one core that holds its state.",
    d: "Assignment is by hash through an indirection table in the card, by explicit rules for chosen flows, or by software dispatch that forwards packets to the owning core over rings. Rebalancing moves buckets of the indirection table between cores, which can reorder packets or strand state. The core owning a flow must also own the application endpoint that serves it, or data crosses cores. The difficulty is skew: a few heavy flows overload one core while hash-based placement cannot see it.",
    k: ["Hardware hash steering vs. software dispatch: hardware costs nothing per packet and ignores load; software can balance by observed load and spends a ring transfer per packet.", "Static mapping vs. dynamic rebalancing: static never reorders packets, while dynamic evens out heavy hitters and requires safe migration of connection state."],
    p: ["Changing the indirection table mid-flow sends later packets to a new core while earlier ones are still queued on the old one, causing reordering.", "One elephant flow pegs a single core at full load while neighbors sit at a few percent."],
    v: "Run thousands of flows plus a few heavy ones and confirm all packets of each flow arrive on one core, per-core load is reported, and a rebalance event produces no reordering visible at the receiver.",
    dep: ["receive-side-scaling", "hardware-flow-rules", "inter-core-messaging", "core-pinning"]
  },
  "flow-aging": {
    s: "Removes flows that have gone idle or finished, reclaiming table space and memory, and evicts the least useful entries when the table is full.",
    d: "Each flow records a last-seen time updated on packet arrival, often coarsely to avoid a clock read per packet. A sweep or timer wheel visits entries and removes those past their idle limit, which differs by state: established flows linger longer than half-open ones. When the table fills, a policy such as least recently used or lowest priority chooses victims. It is hard because removal must be consistent with the protocol layer, and because eviction under attack can throw away real connections to make room for bogus ones.",
    k: ["Coarse timestamp updates vs. exact: coarse stamping removes a clock read per packet, but expires entries up to one interval early or late.", "Evicting by recency vs. by state: recency is simple and can evict a quiet but valuable connection; state-aware keeps established flows and favors dropping unfinished ones."],
    p: ["Aging a flow that is merely quiet resets a long-lived connection the application still needs.", "A sweep that walks the whole table at once pauses packet processing for the duration."],
    v: "Create flows that stop at known times and confirm each is removed within one sweep interval of its limit, that active flows survive, and that a full table under a flood evicts bogus entries before established ones.",
    dep: ["flow-table", "timer-wheel", "connection-state-machine"]
  },
  "rate-limiting": {
    s: "Caps packet or byte rates per source, flow or class, dropping or delaying excess traffic to protect the stack and downstream systems.",
    d: "Token buckets or sliding windows are kept per limited key, refilled using the cycle counter and consulted per packet or per burst. Limits apply to new connections, control messages, tenants or service classes, and may be hierarchical. Placement matters: policing early, before expensive processing, saves cycles. The difficulty is state and accuracy at scale: millions of keys need compact state, and bursts across cores need either per-core shares of a limit or a shared counter that adds contention.",
    k: ["Per-core shares of a global limit vs. a shared counter: shares are contention-free and uneven when load skews between cores; a shared counter is exact and slow under contention.", "Dropping excess vs. queueing it: dropping is cheap and signals senders immediately; queueing smooths bursts and needs memory and timers."],
    p: ["A limit divided equally among cores blocks a legitimate flow that all lands on one core.", "Rate state keyed by source address grows without bound under a spoofed-source flood."],
    v: "Offer a source traffic at twice its limit and confirm delivered rate sits at the limit within a few percent across cores, other sources are unaffected, and limiter memory stays within its configured cap.",
    dep: ["clock-source", "per-core-counters", "flow-table"]
  },
  "run-to-completion": {
    s: "Each core takes a burst of packets from its queue and carries each through every stage (driver, protocol, application) before taking the next burst, with no handoffs.",
    d: "A single loop per core polls the receive queue, runs classification, protocol processing and application callbacks on each packet, and transmits results. Data stays in one core's cache and no locks or rings are involved. Scaling comes from running one loop per core with traffic steered between them. It is hard because everything is on the critical path: a slow handler delays all queued packets, and balance depends entirely on how well flows spread, because a core cannot borrow work from another.",
    k: ["Run-to-completion vs. pipeline: it keeps data hot in one cache and avoids handoff cost, but one slow stage stalls the whole loop and cores cannot specialize.", "Application code in the loop vs. in a separate thread: in-loop avoids a handoff for lowest latency, while a thread isolates slow application work at the cost of queueing."],
    p: ["An application callback that blocks on a lock or system call stalls the core and fills the receive queue.", "Uneven flow distribution leaves one core saturated while others idle, and the loop cannot shed work."],
    v: "Run at line rate with small packets and confirm each core's loop iteration time stays below the ring-fill budget, no drops occur at the device, and per-packet cycle counts match the design figure.",
    dep: ["poll-mode-driver", "burst-batching", "core-pinning", "busy-polling"]
  },
  "pipeline-stages": {
    s: "Splits packet processing into stages on different cores, linked by rings, so each core runs one specialized task such as receive, protocol, application or transmit.",
    d: "Stage cores pass packet references through lockless rings. Specialization keeps each core's instruction cache hot and lets heavy stages be given more cores. A stage can be fed by several upstream cores and can fan out by flow. The costs are handoff latency, cache transfers as packet data moves between cores, and balance: the slowest stage sets throughput, and the core split must match the workload, which changes. Pipelines suit work with stage-specific hardware locality, such as crypto or compression.",
    k: ["Pipeline vs. run-to-completion: pipelines allow specialization and ordered stages with heavy work, but pay a ring and cache-transfer cost per hop and need tuning of cores per stage.", "Fixed core allocation vs. dynamic rebalancing: fixed is simple and wastes cores when load shifts; dynamic adapts and complicates ordering and state ownership."],
    p: ["One overloaded stage fills its input ring, and the backlog propagates upstream into device drops.", "Packets of one flow taking different paths through parallel stages are delivered out of order."],
    v: "Offer a rising load and confirm throughput follows the slowest stage's capacity, ring occupancy reveals that stage, and adding a core to it raises throughput proportionally without reordering.",
    dep: ["lockless-rings", "inter-core-messaging", "backpressure-and-shedding", "core-pinning"]
  },
  "busy-polling": {
    s: "Cores check device queues in a continuous loop rather than sleeping until an interrupt, trading constant full CPU use for the lowest and most predictable latency.",
    d: "A loop calls the driver's receive function repeatedly; an empty return costs a few cycles and a non-empty one returns a burst. There is no interrupt entry, wakeup or scheduler delay. Idle cores still show as fully busy, so utilization stops measuring load, and the stack must report its own useful-work fraction. The difficulty is energy and fairness: polling cores draw peak power at all times, and a polling core shared with other tasks starves them or is starved by them.",
    k: ["Continuous polling vs. interrupts: polling gives microsecond-level steady latency and costs a core and its power when idle; interrupts free the core and add wakeup jitter.", "Pause or backoff instructions in empty polls vs. a tight spin: backoff lowers power and sibling-thread interference, but adds a small latency to the first packet after idle."],
    p: ["Operators read a fully busy core as saturation and add capacity when the stack is actually idle.", "A polling thread sharing a core with a management task gets descheduled, and packets queue unseen."],
    v: "Measure latency at idle and at load: confirm the median wake-to-first-packet time is steady in the microsecond range, and that the stack's own busy-fraction metric distinguishes idle from saturated while the OS reports 100 percent.",
    dep: ["poll-mode-driver", "core-isolation", "power-and-frequency"]
  },
  "hybrid-interrupt-mode": {
    s: "Polls while traffic is flowing and falls back to interrupts when queues stay empty, so idle machines sleep and loaded ones avoid interrupt overhead.",
    d: "After a threshold of empty polls the core arms a receive interrupt on its queue and sleeps. The first arrival wakes it, interrupts are masked again, and polling resumes until traffic stops. The wakeup path passes through the kernel via an event file descriptor the stack waits on. The challenge is the transition: arming the interrupt and sleeping must not miss a packet that arrives between the last poll and the sleep, and the wake latency of tens of microseconds makes the first packet slow.",
    k: ["Adaptive polling then sleep vs. always polling: adaptive saves power and frees the core for others, at the cost of a latency spike on the first packet after idle.", "Interrupt per queue vs. shared interrupt: per queue wakes only the owning core, but consumes many interrupt vectors on cards with many queues."],
    p: ["A race between the last empty poll and arming the interrupt loses a wakeup, leaving a packet unserved until the next arrival.", "A sleep threshold that is too short makes cores oscillate between modes under bursty traffic, adding jitter."],
    v: "Send single packets at long intervals and confirm each is delivered, the core sleeps between them (low CPU in the OS view), and under sustained load the core stays in polling mode with no interrupts counted.",
    dep: ["poll-mode-driver", "queue-pairs", "link-management", "control-threads"]
  },
  "cooperative-tasks": {
    s: "Runs many short tasks (protocol timers, application callbacks, housekeeping) on one core in a loop, each running until it yields, with no preemption and no thread switches.",
    d: "A task queue holds ready work: timer expiries, deferred protocol actions and application handlers. The core interleaves it with polling, giving each a time slice that tasks must respect. Tasks are small state machines or coroutines whose yields are explicit. The benefits are no locks and predictable costs. The difficulty is that fairness is entirely voluntary: one task that runs long delays packet polling and every other task, so budgets must be enforced by design and measured.",
    k: ["Cooperative vs. preemptive scheduling: cooperative needs no locks or context switch and depends on tasks behaving; preemptive protects against bad tasks and costs switching and synchronization.", "Fixed time budget per iteration vs. work-based budget: time budgets bound latency, while work counts are cheaper to check and less precise."],
    p: ["A task that loops over a large table without yielding adds milliseconds of latency to every packet on the core.", "A task that waits for another core's reply inside its slice can deadlock if that core waits for it."],
    v: "Run a mix of timers and application tasks at line rate, record the longest loop iteration over an hour, and confirm it stays under the latency budget, with a deliberately slow task flagged by the budget check.",
    dep: ["run-to-completion", "timer-wheel", "busy-polling"]
  },
  "backpressure-and-shedding": {
    s: "Decides what happens when work arrives faster than a stage can handle it: slow upstream senders, queue within bounds, or drop deliberately and by priority.",
    d: "Bounded rings between stages and finite buffer pools force a choice at every limit. Backpressure signals upstream to slow, shedding discards packets selected by policy (new connections first, bulk before interactive, oldest first), and the receive queue can drop at the card when software is behind. Policy must favor useful work, since dropping late means the cycles were already spent. The difficulty is that overload is the normal edge case: without defined shedding, behavior emerges from whichever ring happens to fill first.",
    k: ["Dropping early at the card vs. late in software: early dropping saves the processing cost of doomed packets, but gives the stack less information to choose which to drop.", "Dropping newest vs. oldest: dropping newest protects work in progress; dropping oldest keeps data fresh, which is better for real-time streams."],
    p: ["Letting rings fill in the middle of the pipeline wastes cycles on packets that are dropped later.", "Shedding without counters turns an overload into unexplained packet loss that looks like a network fault."],
    v: "Offer twice the stack's capacity and confirm goodput holds at capacity rather than collapsing, drops occur at the designed point and by the designed priority, and every drop appears in the reason counters.",
    dep: ["drop-reason-accounting", "lockless-rings", "rate-limiting"]
  },
  "control-threads": {
    s: "Threads that do slow or blocking work (configuration, logging, management requests, kernel communication) on cores kept separate from the packet-polling cores.",
    d: "Polling cores must never wait, so anything that might block moves to service threads, pinned to non-polling cores. They receive requests, talk to the kernel, write logs, run garbage cleanup and answer control commands, communicating with polling cores through rings and messages. It is hard to keep the boundary clean: a convenient direct call from a polling core into logging or a lock held by a service thread quietly puts a blocking operation on the fast path.",
    k: ["Dedicated service cores vs. sharing with polling cores: dedicated cores keep latency clean and cost hardware; sharing saves cores and lets background work interrupt polling.", "Asynchronous messages vs. shared data with locks: messages keep polling lock-free and add latency to management; locks are simple and risk priority inversion."],
    p: ["A polling core logging directly to a file takes a lock, and one slow disk write stalls packet processing.", "Service threads left unpinned wander onto polling cores and cause periodic latency spikes."],
    v: "Run a heavy management workload (large dumps, log bursts) while measuring packet latency on polling cores, and confirm the latency distribution is unchanged and service threads appear only on their assigned cores.",
    dep: ["core-isolation", "inter-core-messaging", "core-pinning"]
  },
  "timer-wheel": {
    s: "A circular array of time slots holding pending timers, so starting, stopping and expiring a timer costs constant time even with millions of connections.",
    d: "Time is divided into ticks; a timer set for a given expiry goes into the slot for that tick. Each loop advances the wheel to the current time and fires everything in passed slots. Hierarchical wheels cover long timeouts by cascading coarse slots into finer ones. Most timers (retransmission, keepalive) are canceled before they fire, so cheap cancellation matters. It is hard because of granularity and bursts: timers within a tick fire together, and a loop that falls behind has a large batch to run at once.",
    k: ["Timer wheel vs. heap-based timers: a wheel gives constant-time start and cancel at fixed resolution; a heap gives exact expiry and logarithmic cost per operation.", "Per-core wheels vs. one shared: per-core avoids locks and needs timers to be owned by the core that owns the connection."],
    p: ["A coarse tick fires a retransmission up to a tick late, inflating tail latency on short paths.", "Catching up after a pause fires thousands of timers in one iteration and stalls packet polling."],
    v: "Start a million timers with random expiries, cancel 95 percent, and confirm the rest fire within one tick of their time, start and cancel cost stays constant, and no single loop iteration runs more than its cap.",
    dep: ["clock-source", "cache-line-discipline", "numa-aware-allocation"]
  },
  "clock-source": {
    s: "The cheap, monotonic time reference used by the stack, normally a cycle counter read in a few nanoseconds without entering the kernel.",
    d: "The counter is read directly and converted to nanoseconds with a calibrated multiplier. The stack must confirm the counter is invariant, synchronized across cores and unaffected by power states, and recalibrate against a wall clock periodically. Many per-packet needs (timestamps, rate limiters, loop budgets) use it. The difficulty is correctness across hardware: counters on some platforms differ per socket or stop in deep sleep, and virtual machines may expose a counter that jumps on migration.",
    k: ["Reading the counter directly vs. a kernel clock call: direct reads cost nanoseconds, while a call can cost hundreds of nanoseconds but handles every platform quirk.", "One global calibration vs. per-core: global is simple and trusts cross-core sync; per-core handles skew and complicates comparing times between cores."],
    p: ["Counters out of sync across sockets give negative elapsed times when a flow moves cores.", "A frequency change that is not noticed makes all converted times drift."],
    v: "Compare the counter-derived time with the wall clock over an hour on every core, and confirm drift stays within the documented bound, no core shows a backward step, and cross-core timestamps differ by less than the sync tolerance.",
    dep: ["numa-topology", "power-and-frequency"]
  },
  "hardware-timestamps": {
    s: "Timestamps applied by the card at the moment a frame reaches or leaves the wire, free of software queueing and jitter.",
    d: "The card writes a time into the receive descriptor or a side register for transmitted frames, taken from its own clock. Software converts card time to host time using calibration. Hardware stamps are what precise measurement and synchronization protocols need, since host timestamps include queueing and polling delays of microseconds. Support varies: some cards stamp every packet, some only selected types, and resolution and clock quality differ. Calibrating card time to host time is the hard part, as the two drift apart.",
    k: ["Hardware stamps vs. software stamps at receive: hardware is accurate to nanoseconds and card-dependent; software works everywhere and includes polling delay.", "Stamping all packets vs. selected flows: all packets uses more descriptor space and bandwidth; selected saves resources and needs matching rules."],
    p: ["Treating card time as host time without conversion produces timestamps that appear years from the present.", "Transmit stamps delivered late through a separate queue are matched to the wrong packet."],
    v: "Loop two cards together by cable, send packets, and confirm the measured one-way time from hardware stamps is stable to tens of nanoseconds and agrees with a reference analyzer.",
    dep: ["clock-source", "device-abstraction", "descriptor-rings"]
  },
  "packet-pacing": {
    s: "Spaces transmitted packets over time at a chosen rate, instead of sending them in bursts at line speed, to avoid overflowing downstream buffers.",
    d: "Pacing computes a send time per packet or per flow from a target rate and releases packets through a timer wheel, a scheduling queue, or the card's own rate-limited queues. Congestion control uses it to smooth window-sized bursts, and real-time media uses it to match codec rates. It is hard because software timing is coarse at high rates (a 10 microsecond gap at 100 gigabits is a different problem from one at 1), and per-flow pacing for many flows needs scalable scheduling.",
    k: ["Software pacing vs. hardware rate limiting: software is flexible and limited by loop granularity and jitter; hardware is precise and offers a small number of limited queues.", "Pacing every flow vs. only large or long ones: all flows is uniform and costly; selective saves cycles but leaves small flows to burst."],
    p: ["A paced packet delayed by a long loop iteration is released late and arrives in a clump with the next.", "Pacing state for idle flows is never freed and accumulates."],
    v: "Pace a flow at one gigabit per second on a faster link and inspect inter-packet gaps with hardware timestamps: confirm the gaps cluster within a small percentage of the target with no bursts above a defined size.",
    dep: ["timer-wheel", "clock-source", "congestion-control", "queue-pairs"]
  },
  "time-synchronization": {
    s: "Keeps the machine's clocks, and the network card's clock, aligned with a reference using protocols that exchange timestamped messages.",
    d: "A synchronization daemon exchanges messages with a time source and adjusts the host clock; in precision setups, the card's hardware clock is disciplined directly from hardware-stamped packets and then shared with the host. In a user-space stack the packets are the stack's own, so it must give the protocol access to timestamps and let it send messages at exact moments. The difficulty is accuracy: tens-of-nanosecond results need hardware stamps, symmetric network paths and stable oscillators, and software queueing ruins them.",
    k: ["Disciplining the card clock vs. only the host clock: card discipline yields the most precise wire timestamps, but adds a second clock to keep consistent with the host.", "Running the protocol in the stack vs. in the kernel: in the stack it sees its own traffic and timestamps, while the kernel route requires bypass traffic to be shared."],
    p: ["Asymmetric path delay creates a constant offset that no filtering removes.", "A stack stall delays the sync message handling and degrades accuracy only during load."],
    v: "Synchronize two hosts and compare pulse-per-second outputs or hardware-stamped round trips: confirm offset stays within the claimed bound for an hour, including under full data-plane load.",
    dep: ["hardware-timestamps", "clock-source", "control-channel"]
  },
});
