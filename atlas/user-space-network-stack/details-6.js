// Details part 6: cores, NUMA & hardware; cross-cutting concerns.
ATLAS.details("user-space-network-stack", {
  "core-pinning": {
    s: "Binds each polling or service thread to one specific core, so it is never moved by the scheduler and its cache contents and queues stay put.",
    d: "At startup each thread is assigned to a core from a configured list and its affinity is set to that core alone. The assignment follows the topology: each polling core sits on the same node as the queue it serves. Per-core data structures assume the thread never migrates. The difficulty is that pinning is a promise the rest of the system must keep: other processes, kernel threads and interrupts can still land on the core unless it is isolated, and a thread pinned to a core that is also doing something else loses the point of pinning.",
    k: ["Static pinning vs. letting the scheduler place threads: static gives stable caches and predictable latency and needs manual planning; scheduler placement adapts and causes migration and jitter.", "One thread per core vs. oversubscribed cores: one per core keeps loops uninterrupted, while oversubscription uses fewer cores and lets one stall another."],
    p: ["A pinned thread shares its core with a kernel worker, and packet latency spikes every time the worker runs.", "The core list is copied from another machine with a different topology, putting threads on the wrong node."],
    v: "Read each thread's affinity and run-queue statistics under load: confirm every polling thread stays on its core with zero migrations over an hour, and the core's node matches its queue's card.",
    dep: ["numa-topology", "core-isolation"]
  },
  "core-isolation": {
    s: "Reserves cores exclusively for the stack by keeping the operating system's scheduler, timer ticks, interrupts and background work off them.",
    d: "The system is configured at boot or runtime to exclude chosen cores from general scheduling, stop periodic timer ticks when only one task runs, and move interrupts and kernel housekeeping elsewhere. A polling thread then runs without interruption. Remaining sources of noise (system management interrupts, page faults, rare kernel work) are measured. It is hard because isolation is system-wide configuration outside the stack's control, and the jitter that remains is small, rare and hard to attribute.",
    k: ["Isolating cores at boot vs. at runtime: boot isolation is the most complete and requires a reboot to change; runtime isolation is flexible and leaves some background work behind.", "Tickless mode on isolated cores vs. periodic ticks: tickless removes regular interruptions and complicates accounting and timers; ticks are simple and a steady noise source."],
    p: ["An interrupt for an unrelated device is still routed to an isolated core, adding a latency spike every few seconds.", "Isolation settings are lost after a kernel update, with no change in the stack's own reports."],
    v: "Run a loop on an isolated core that records the longest gap between iterations over an hour, and confirm the maximum stays within a few microseconds and no kernel interrupts are counted on that core.",
    dep: ["numa-topology", "sibling-thread-policy"]
  },
  "numa-topology": {
    s: "The map of which cores, memory and PCIe slots belong to which node, used to place threads, memory and cards so that traffic never crosses between sockets unnecessarily.",
    d: "At startup the stack reads the topology from the system: sockets, cores, shared caches, memory nodes and the node each PCIe device attaches to. Placement rules derive from it: a queue's core, its pool and its table live on the card's node. Latency and bandwidth between nodes are several times worse than local. The challenge is that topology is irregular: cards differ in node, some systems have multiple nodes per socket, and hardware changes between machines make hard-coded assumptions wrong.",
    k: ["Cards and cores on a single node vs. spreading over all nodes: one node keeps all traffic local and uses part of the machine; spreading uses all cores and pays cross-node cost for some traffic.", "Reading topology automatically vs. configuring by hand: automatic adapts to hardware and can misjudge virtualized systems; manual is explicit and breaks on new machines."],
    p: ["A virtual machine reports a flat topology, hiding which memory is actually remote.", "A card is installed in a slot attached to the other socket and halves throughput with no error."],
    v: "Print the discovered topology, then move one polling thread and its pool to the wrong node deliberately and confirm throughput drops by the expected margin, proving the placement logic matters and is correct otherwise.",
    dep: []
  },
  "cache-injection": {
    s: "Lets the card write received packets directly into the processor's last-level cache instead of main memory, so the first read of a packet header is a cache hit.",
    d: "The platform supports routing DMA writes into a portion of the cache. When the polling loop reads the descriptor and then the header moments later, the data is already close. The benefit is largest at high packet rates with small packets, where memory latency dominates. The difficulty is capacity: the injected region is a share of the cache, and if rings and in-flight buffers exceed it, packets are evicted to memory before they are read, which then costs extra memory traffic. Ring sizes must fit.",
    k: ["Direct injection vs. writing to memory first: injection saves a memory round trip per packet and works only while in-flight data fits in the cache share; memory writes are unaffected by size.", "Smaller rings to fit the cache vs. large rings for burst tolerance: small rings keep data in cache and drop sooner; large rings absorb bursts and spill to memory."],
    p: ["Rings sized to absorb bursts exceed the cache share, so injected packets are evicted before being read.", "Another workload on the same socket competes for the same cache share and silently reduces the benefit."],
    v: "Compare last-level cache miss counters and cycles per packet with injection on and off at line rate, and confirm misses fall when rings fit the injection region and rise when rings are made larger than it.",
    dep: ["numa-topology", "descriptor-rings", "cache-line-discipline"]
  },
  "pcie-bandwidth": {
    s: "The data-rate limit of the bus connecting card and host, which can be below the network line rate once descriptor and metadata traffic is counted.",
    d: "Each packet moves over the bus as data plus descriptor reads and write-backs, and overhead per transfer is fixed, so small packets use far more bus capacity than their size suggests. The card's link width and generation set the ceiling. Multi-port cards share one link. A 100-gigabit port on a slot with too few lanes cannot reach line rate. Techniques such as descriptor compression, batching write-backs and inline small packets reduce overhead. The difficulty is that the limit appears only as unexplained loss at specific packet sizes.",
    k: ["Batched descriptor write-backs vs. immediate: batching saves bus transactions and delays buffer reuse; immediate returns buffers sooner and costs bandwidth.", "Inlining small packets into descriptors vs. separate buffer fetch: inlining skips a fetch and enlarges descriptors; separate fetches keep descriptors small."],
    p: ["A slot negotiated at fewer lanes than the card needs caps throughput well below line rate with no warning.", "Two ports of a dual-port card each reach line rate alone but not together."],
    v: "Read the negotiated link width and generation, then send minimum-size packets on all ports together and confirm the achieved rate matches the computed bus limit, with no unexpected drops below it.",
    dep: ["queue-pairs", "descriptor-rings", "numa-topology"]
  },
  "power-and-frequency": {
    s: "The processor's power states and clock frequency policy, which affect latency and throughput of polling cores and must be configured deliberately.",
    d: "Deep sleep states add microseconds of wake delay and are avoided on cores serving latency-sensitive traffic. Frequency scaling can drop clocks when a core appears idle, and polling loops using pause instructions can look idle. Turbo behavior depends on how many cores are active, and heavy vector instructions can lower the maximum frequency. Settings live in firmware and the operating system. It is hard because the effects are probabilistic and platform-specific, and the first symptom is a latency tail rather than a visible failure.",
    k: ["Fixed high frequency and shallow sleep vs. power-saving defaults: fixed settings give steady latency and use more power continuously; defaults save energy and add wake jitter.", "Sleeping idle cores for efficiency vs. keeping all polling: sleeping saves power at off-peak and adds a wake cost to the first packet."],
    p: ["A deep power state on an idle polling core adds tens of microseconds to the first packet after a quiet period.", "Frequency scaling reduces clocks during a lull, so a burst arriving next is handled slowly."],
    v: "Measure latency after silent intervals of one millisecond to ten seconds and confirm no step appears at the wake threshold of any sleep state, and that core frequency stays at the configured value under varying load.",
    dep: ["clock-source", "core-isolation"]
  },
  "sibling-thread-policy": {
    s: "Decides whether the second hardware thread of each physical core runs stack work, other work or nothing, since sibling threads share execution units and caches.",
    d: "Two hardware threads on one core share the L1 and L2 caches and execution resources. Running a second polling thread on the sibling can add throughput, since one thread stalls on memory while the other computes, and can also double each thread's latency. Leaving the sibling idle or running low-priority work gives the polling thread the whole core. Security policy may disable siblings entirely. The difficulty is workload dependence: the benefit ranges from a gain of tens of percent to a loss, and must be measured.",
    k: ["Using both siblings for packet work vs. one per core: both siblings raise total throughput for memory-bound loops and raise per-packet latency; one per core gives lower latency and fewer packets per core.", "Idle sibling vs. background work on it: background work uses spare capacity and interferes through shared caches and execution units."],
    p: ["A background task on the sibling thread inflates the polling thread's tail latency in a way that its own profile does not show.", "Disabling siblings in firmware changes core numbering and invalidates the saved core list."],
    v: "Run the same workload with the sibling idle, with a second polling thread, and with a noisy neighbor on the sibling, and record throughput and 99.9th-percentile latency for each to choose and justify the policy.",
    dep: ["core-pinning", "core-isolation"]
  },
  "latency-vs-throughput": {
    s: "The standing tension between processing packets in large batches for peak rate and processing them immediately for the shortest delay, which shapes buffer sizes, loop design and offload choices.",
    d: "Batching, coalescing, deeper queues, offloaded segmentation and larger bursts all raise throughput by sharing fixed costs among packets and add waiting time. Immediate processing, small bursts and paced transmission cut delay and spend more cycles per packet. The right operating point depends on the application: a packet forwarder wants rate, a trading or control system wants the tail. Many parameters (burst size, ring depth, flush rule, coalescing window) must move together, and the right values change with load.",
    k: ["Optimize for peak rate vs. the 99.9th percentile delay: peak-rate tuning wins benchmarks and fails latency-sensitive uses; tail tuning costs maximum throughput.", "Fixed parameters vs. adaptive batching: fixed is predictable and wrong at some loads; adaptive follows the load and can oscillate."],
    p: ["Parameters tuned at saturation hurt low-load latency, which is where most production time is spent.", "Reporting throughput without delay percentiles hides a tuning that doubled the tail."],
    v: "Plot throughput against latency percentiles across offered loads from 1 percent to saturation, and confirm the chosen settings keep the tail within its target at the expected operating load and at the knee.",
    dep: ["burst-batching", "busy-polling", "descriptor-rings", "receive-coalescing"]
  },
  "core-and-memory-budget": {
    s: "How many cores, how much huge-page memory and how much cache the stack may take, and how they are divided between polling, services and the application.",
    d: "A user-space stack gives up cores permanently, since polling never sleeps, and reserves memory for pools at startup. A budget states the cores for data path, control and capture, the memory for each pool and table, and what remains for the host's other work. The cost per connection and per packet in cycles and bytes is measured against it. The difficulty is that budgets interact: more queues need more pool, more connections need more table and cache, and every added feature takes cycles from the per-packet allowance.",
    k: ["Dedicating cores to the stack vs. sharing with applications: dedication gives predictable performance and reduces cores for other work; sharing is efficient and introduces interference.", "Provisioning for peak vs. average load: peak provisioning avoids drops and idles most of the time; average provisioning is cheaper and degrades under bursts."],
    p: ["A new feature adds a few dozen cycles per packet and pushes a core past the budget at the smallest packet size.", "Memory reserved at startup for peak is unavailable to the host, causing pressure elsewhere."],
    v: "State the per-packet cycle budget at the target rate and measure each stage against it with a profiler under a minimum-size packet load, confirming the sum stays below the budget with headroom.",
    dep: ["core-pinning", "packet-buffer-pools", "flow-table", "run-to-completion"]
  },
  "safety-and-isolation": {
    s: "The consequences of running device drivers and protocol code in an application: a bug can corrupt memory, hang a card or expose traffic, and protections must be rebuilt without the kernel.",
    d: "In the kernel, a faulty driver is contained by privilege boundaries; here, the stack runs with direct device access. Isolation comes from the IOMMU, from unprivileged service accounts, from separating processes by device or virtual function, and from memory-safe practices in parsing code. Network-facing parsers see hostile input at line rate. Multi-tenant deployments need separation of traffic and keys. The difficulty is that failures are silent: DMA to a wrong address corrupts without a fault unless the IOMMU is on.",
    k: ["IOMMU-enforced isolation vs. trust in the driver: enforcement contains faults and costs some speed; trust is fast and leaves a single bug able to corrupt anything.", "One process for everything vs. separated processes per tenant: separation limits damage and needs more cores and more copying between them."],
    p: ["A parsing bug in a rarely used header crashes the process, which owns the machine's only data path.", "Running with root-equivalent device access means a compromise of the stack is a compromise of the host."],
    v: "Fuzz all packet parsers at line rate with a sanitizer build, and test the containment claim by making the card DMA to an unregistered address, confirming it is blocked and logged without affecting other memory.",
    dep: ["iommu-isolation", "userspace-device-access", "ip-processing", "dma-mapping"]
  },
  "hardware-portability": {
    s: "How well the same stack runs across different cards, drivers, processors and virtual environments, given that offloads, queue limits and performance traits vary widely.",
    d: "A portable design puts differences behind the device abstraction, discovers capabilities at startup, and keeps a software fallback for every offload. Performance, though, is not portable: vector paths, cache sizes, bus limits and queue counts change the best settings, and tuned configurations are per platform. Testing across a hardware matrix is expensive. The difficulty is that fallbacks silently turn a hardware feature into CPU work, so a portable stack can pass every functional test and still miss its rate on the new card.",
    k: ["Software fallback for every offload vs. requiring hardware support: fallbacks maximize reach and hide slow paths; requirements keep the design simple and exclude hardware.", "One binary adapting at runtime vs. builds per platform: runtime adaptation is convenient and costs branches; per-platform builds are fastest and multiply testing."],
    p: ["A new card silently falls back to software checksums and the stack's maximum rate drops by a third.", "Behavior differences in virtual devices are only found in production."],
    v: "Run an identical conformance and rate suite on every supported card and virtual device, and record per-device which features are hardware and which are fallback, failing the build when a fallback appears unexpectedly.",
    dep: ["device-abstraction", "vectorized-paths", "virtual-device-drivers", "checksum-offload"]
  },
  "failure-and-restart": {
    s: "What happens when the stack, a core or a card fails: which state is lost, how fast service returns, and whether connections survive.",
    d: "State lives in the process: connection tables, flow rules in the card, buffers in flight, timers. A crash loses every connection and leaves the card in an uncertain state. Options include fast restart, a hot standby that shares nothing, state replication for selected connections, or handing devices to a standby process. Peers see resets or timeouts. The difficulty is that recovery involves hardware: queues and rules in the card must be reset to a known state, and a restart that is faster than peers' timeouts can still leave them with dead connections.",
    k: ["Fast restart with lost connections vs. state replication: restart is simple and resets every connection; replication preserves sessions and costs bandwidth and per-packet work.", "Active-standby pair vs. a single instance with a supervisor: a pair gives near-instant failover at double the hardware; a supervisor is cheaper and slower."],
    p: ["A restarted stack reuses sequence numbers and ports, and peers accept stale packets from before the crash.", "A crashed process leaves flow rules installed in the card, steering traffic to queues no one polls."],
    v: "Kill the process under load and measure time to first forwarded packet after restart, confirm the card's rules and queues are cleared and rebuilt, and check what peers observe (resets or silence) matches the documented behavior.",
    dep: ["health-and-watchdog", "device-ownership", "link-management", "connection-state-machine"]
  },
  "upgrade-and-operability": {
    s: "How the stack is deployed, updated and debugged in production: versioning, rolling restarts, configuration drift, and the skills needed to operate something kernel tools cannot see.",
    d: "Updating a stack that owns the data path means draining traffic, restarting and reclaiming devices, so deployment is coordinated with load balancers or paired instances. Configuration is large and hardware-specific. Debugging needs the stack's own counters, traces and capture, plus knowledge of NUMA, offload and bus limits. The difficulty is that performance regressions show up as a few percent lost at one packet size, and only a standing benchmark on representative hardware catches them before release.",
    k: ["In-place restart vs. rolling replacement behind a balancer: in-place is simple and drops connections; rolling keeps service and needs spare capacity and a balancer.", "Configuration as code with validation vs. hand-tuned hosts: code is repeatable and reviewable, while hand tuning reaches the last few percent and drifts."],
    p: ["A kernel or firmware update changes interrupt routing or huge-page behavior, and performance falls with no change in the stack.", "A fix tested on one card regresses another because capability differences were never exercised."],
    v: "Run a line-rate regression benchmark on each target platform before every release and during a rolling upgrade in staging, confirming rate and tail latency stay within the stated band and drained instances lose no accepted connections.",
    dep: ["runtime-configuration", "control-channel", "per-core-counters", "health-and-watchdog"]
  },
});
