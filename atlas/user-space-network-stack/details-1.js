// Details part 1: application interfaces, observability & control.
ATLAS.details("user-space-network-stack", {
  "socket-compatible-api": {
    s: "A layer that offers the familiar socket calls (create, bind, connect, send, receive, close) on top of the user-space stack, so existing programs can run with little or no change.",
    d: "Each socket call maps to an operation on a stack-owned connection object instead of a kernel file descriptor. The layer keeps its own descriptor table, translates option calls into stack settings, and copies data between application buffers and packet buffers. It must preserve behaviors programs rely on: error codes, partial writes, shutdown semantics and readiness reporting. It is hard because the original contract assumes a kernel that can sleep a thread, share descriptors across fork and hand them to other processes, none of which a polling stack provides cheaply.",
    k: ["Full socket fidelity vs. a documented subset: fidelity lets unmodified programs run, but every edge case (fork, descriptor passing, obscure options) costs complexity and often a copy.", "Copying at the API boundary vs. exposing buffers: copying keeps the contract simple and safe, but spends the memory bandwidth the stack was built to save."],
    p: ["A program that forks after opening sockets shares a descriptor the stack cannot split, producing hangs or corrupt connection state.", "Unsupported options return success silently, so tuning that looks applied has no effect on the wire."],
    v: "Run an unmodified client and server over the layer, send a transfer of a few gigabytes with a known checksum, and confirm bytes match, error codes match the kernel's on refused and reset connections, and no kernel socket was created.",
    dep: ["connection-handles", "connection-state-machine", "event-loop-integration"]
  },
  "native-burst-api": {
    s: "An interface designed for the stack rather than borrowed from sockets: applications poll for bursts of packets or events, process them in place and submit replies in batches.",
    d: "The application owns a polling loop and calls a receive function that returns an array of packet or event descriptors, then a transmit function that takes an array. No call blocks, no call copies unless asked, and per-call overhead is amortized across the burst. State such as which core owns which connection is explicit, so the program is structured around cores. This gives the best speed but a rewrite of the application, and it hands the programmer ownership rules (who frees a buffer, when it may be reused) that sockets hid.",
    k: ["Burst arrays vs. one-call-per-packet: bursts amortize call and cache costs, but programs must restructure around batches and handle partial sends.", "Explicit core ownership vs. a shared pool of connections: ownership removes locking, but the application must route work to the right core itself."],
    p: ["Freeing a buffer after handing it to transmit leaves the card reading memory the application has already reused.", "A burst loop that does slow work per packet stalls every packet behind it in the same burst."],
    v: "Write a loop that echoes packets in place and measure it with a generator at line rate: confirm zero loss at the target packet size, constant buffer-pool occupancy over ten minutes and no per-packet allocation in a profile.",
    dep: ["run-to-completion", "burst-batching", "buffer-lifetime"]
  },
  "preload-interposition": {
    s: "Replaces the socket calls in an unmodified program at load time, redirecting selected descriptors into the user-space stack while leaving every other descriptor with the kernel.",
    d: "A shim library loaded ahead of the standard one intercepts calls such as create, connect, read, write and the readiness calls. For each descriptor it decides whether the stack or the kernel owns it, usually by address family, address or an environment setting, and forwards accordingly. Mixed readiness sets (some descriptors in the stack, some in the kernel) need merging. It is hard because interception sees only the C interface: statically linked programs, direct system calls and some runtimes bypass it, and thread and signal semantics must still be respected.",
    k: ["Interposition vs. recompiling against a new library: interposition needs no source, but statically linked or direct-call programs are invisible to it.", "Per-address routing vs. per-process routing: per-address lets one program use both stacks, at the cost of a mixed readiness wait that must merge two event sources."],
    p: ["A program that issues raw system calls for some operations splits one connection's calls between the stack and the kernel, failing mysteriously.", "Library updates change which internal calls exist, silently disabling interception for a function."],
    v: "Launch a program that has never been modified with the shim and confirm from stack counters that its connections appear in the flow table, that kernel socket statistics show none for them, and that a statically linked binary is reported as not intercepted.",
    dep: ["socket-compatible-api", "connection-handles"]
  },
  "event-loop-integration": {
    s: "Connects the stack's readiness and completion events to the application's own event loop, so a program can wait on stack connections alongside timers, files and kernel sockets.",
    d: "The stack tracks per-connection readiness (data to read, space to write, connection closed) and exposes it either as a pollable set with the usual semantics, as callbacks fired from the polling loop, or as a file-descriptor-like handle the kernel can wait on. Edge-triggered and level-triggered modes both appear. The hard part is composition: the stack's loop wants to spin on the card while the application's loop wants to sleep in the kernel, and neither may starve the other or miss a wakeup when the card goes quiet.",
    k: ["Callbacks from the polling loop vs. a pollable readiness set: callbacks are fastest and need no extra pass, but run application code inside the stack's loop, where slow handlers stall packet processing.", "Level-triggered vs. edge-triggered readiness: level is forgiving of missed events, while edge is cheaper but loses data if the program does not drain until empty."],
    p: ["An application that waits in the kernel while the stack's connections have data never wakes, because nothing signals the kernel.", "Edge-triggered events lost during a partial drain leave a connection stuck with unread data and no further notification."],
    v: "Run one loop that waits on a stack connection, a kernel socket and a timer. Send data to each in random order and confirm every one wakes the loop within a bounded time with no busy spin when all three are idle.",
    dep: ["connection-handles", "hybrid-interrupt-mode", "busy-polling"]
  },
  "zero-copy-app-api": {
    s: "Lets applications read received data and fill outgoing data directly in packet buffers, avoiding the copies that otherwise cost memory bandwidth on every byte.",
    d: "On receive, the stack hands the application references to buffer segments holding in-order payload, and the application returns them when done. On transmit, the application asks for buffers, writes into them and submits them, and the stack frees them once the data is acknowledged. Segments may be scattered across a chain. The ownership protocol is the difficulty: a buffer cannot be recycled until retransmission is impossible and the application is finished, and payloads are no longer contiguous, which many parsers assume.",
    k: ["Lending buffers vs. copying into application memory: lending removes a full pass over every byte, but ties buffer-pool capacity to how quickly applications return segments.", "Contiguous delivery vs. scatter lists: contiguity keeps parsers simple but forces a copy when data spans segments; scatter lists avoid it and push complexity into the application."],
    p: ["An application holding received segments for long periods drains the pool and stalls all receive on that core.", "Reusing a transmit buffer before the final acknowledgment corrupts a retransmission with new data."],
    v: "Transfer a large file with the zero-copy interface and a profiler running: confirm the stack performs no payload copy, memory bandwidth per delivered byte drops to about one read and one write, and pool occupancy stays flat.",
    dep: ["chained-buffers", "buffer-lifetime", "packet-buffer-pools", "retransmission"]
  },
  "connection-handles": {
    s: "The identifiers and ownership records through which applications refer to connections, replacing kernel file descriptors and defining which core and thread may use each connection.",
    d: "A handle indexes a table of connection objects, usually with a generation counter so a stale handle fails cleanly. Each handle records an owning core, since protocol state is not locked across cores. Operations from other threads either fail, are forwarded to the owner through a ring, or require explicit migration. Handles also tie into closing, error reporting and the application's event registration. The difficulty is safe reuse: a handle freed while events or in-flight packets still refer to it must never alias a new connection.",
    k: ["Owner-core affinity vs. any-thread access: affinity needs no locks and keeps state in one cache, but constrains how applications distribute work across threads.", "Generation-tagged handles vs. plain indexes: tags catch use-after-close at the price of a few bits and a check on every call."],
    p: ["A handle reused immediately lets a late event from a closed connection be delivered to an unrelated new one.", "Calls from a thread that does not own the connection race with the owner's packet processing unless forwarded."],
    v: "Open and close a million connections while a second thread deliberately uses stale handles: confirm every stale use returns an error, no event reaches the wrong connection, and no state is accessed from a non-owning core.",
    dep: ["connection-state-machine", "flow-to-core-mapping", "lockless-rings"]
  },
  "blocking-emulation": {
    s: "Provides blocking semantics (wait until connected, until data arrives, until sent) on a stack that never sleeps, by spinning, parking the thread or yielding to other work.",
    d: "A blocking call becomes a loop: poll the stack, check the condition, repeat until it holds or a timeout expires. Variants park the thread on a condition variable signaled by the polling thread, or switch to another user-level task. Timeouts, signals that should interrupt the wait, and non-blocking flags must all behave as programs expect. The trade is plain: spinning gives the lowest latency and wastes a core, while parking saves power and adds the wakeup latency the stack was avoiding.",
    k: ["Spin-wait vs. park-and-signal: spinning wakes in tens of nanoseconds but holds a core fully busy; parking frees the core and adds microseconds of wakeup latency.", "Dedicated polling thread vs. polling inside each blocking call: a dedicated thread serves all callers, while inline polling means a blocked caller must also drive the stack for others."],
    p: ["A blocked thread that is also the only one polling the card starves its own connection and deadlocks.", "Signals arriving during a spin are ignored, so a program cannot be interrupted while waiting."],
    v: "Call a blocking receive on an idle connection with a 200 ms timeout and confirm it returns a timeout error between 200 and 210 ms. Then deliver data and confirm wake latency matches the chosen mode's documented figure.",
    dep: ["busy-polling", "event-loop-integration", "timer-wheel"]
  },
  "per-core-counters": {
    s: "Counters of packets, bytes, drops and events kept separately for each core and summed only when read, so counting adds no contention on the data path.",
    d: "Every core owns a cache-aligned block of counters it increments with plain stores, never atomics. A reader sums them across cores on demand and may see a slightly inconsistent snapshot. Counters exist for devices (received, transmitted, missed), protocol layers (segments, retransmissions, resets) and pools (allocations, failures). The challenge is the cost of readers and of coverage: false sharing between adjacent counters can erase the speed gained, and anything uncounted becomes an invisible failure.",
    k: ["Per-core counters summed on read vs. shared atomics: no contention on the fast path, but totals are approximate during the read and a stalled core's value lags.", "Fixed counter set vs. dynamically registered counters: fixed is faster and simpler, while dynamic lets modules add their own at a lookup cost on registration."],
    p: ["Two counters sharing a cache line across cores cause constant invalidations that slow packet processing by a visible fraction.", "A counter read as a rate without allowing for wrap or reset produces nonsense spikes in dashboards."],
    v: "Send a known number of packets at a fixed size and confirm the summed received, bytes and per-queue counters match the generator's totals exactly, and that enabling counting changes throughput by less than the documented margin.",
    dep: ["cache-line-discipline", "core-pinning"]
  },
  "drop-reason-accounting": {
    s: "Counts every discarded packet under a named reason (no buffer, bad checksum, unknown flow, ring full), so a loss can be attributed to a cause rather than guessed at.",
    d: "At each point where a packet can be discarded, the code increments a reason-specific counter before freeing it. Reasons are grouped by layer: device missed packets, malformed headers, no matching flow, resource exhaustion, policy. Some drops happen in the card and are only visible through its own statistics, which must be merged in. The challenge is completeness: a path that frees a buffer without counting is a silent loss, and a very high drop rate makes the accounting itself a hot path.",
    k: ["A reason code at every drop site vs. one generic drop counter: reasons cost a line at each site, but make loss diagnosable without a debugger.", "Counting card-side drops through its statistics vs. host-side only: card counters expose losses before software sees them, but each card names and defines them differently."],
    p: ["A new code path that frees buffers without a counter creates loss that no dashboard shows.", "Merging card and software counts double-counts packets the card dropped and the driver also reported as missed."],
    v: "Inject packets with a bad checksum, an unknown destination and a flood beyond ring capacity, and confirm each shows up under its own reason with counts that sum to injected minus delivered.",
    dep: ["per-core-counters", "device-abstraction"]
  },
  "latency-histograms": {
    s: "Distributions of per-packet or per-request latency kept in compact buckets, so the tail (99.9th percentile and above) is visible rather than hidden by an average.",
    d: "Timestamps taken at receive, at stack handoff and at transmit are subtracted and the result goes into a logarithmic bucket array, per core. Readers merge arrays into percentiles. Hardware timestamps give card-to-card times; cycle-counter stamps give in-software times. The difficulty is that measurement perturbs what it measures: reading a clock per packet adds cost, coarse buckets hide spikes, and averaging across cores merges a bad core's tail into a good-looking whole.",
    k: ["Logarithmic buckets vs. exact samples: buckets use fixed memory and constant time per record, but lose precision inside a bucket.", "Sampling one packet in N vs. timing every packet: sampling keeps overhead negligible, but can miss rare spikes that matter most."],
    p: ["Reporting only the mean and median hides a stall of a few hundred microseconds that hits one packet in ten thousand.", "Timestamping with a clock that is not synchronized across cores produces negative or inflated latencies."],
    v: "Inject a known 50 microsecond delay into one packet in a thousand and confirm the 99.9th percentile reflects it within one bucket while the median stays unchanged.",
    dep: ["hardware-timestamps", "clock-source", "per-core-counters"]
  },
  "packet-trace-points": {
    s: "Named hooks along the data path where packets can be sampled, filtered and recorded on demand, giving a view of what each stage received and emitted.",
    d: "Trace points sit at device receive, after classification, after protocol processing and before transmit. Each is disabled by default and costs a predictable branch; when enabled with a filter, matching packets are copied or referenced into a bounded ring for a reader. Records carry the point name, timestamp, core and flow. The challenge is cost and safety: enabling a trace at line rate can itself cause loss, and a trace that holds buffer references can drain the pool.",
    k: ["Copying packet headers into a trace ring vs. holding buffer references: copying is safe for the pool but costs bandwidth; references are free but pin memory.", "Always-compiled disabled hooks vs. compile-time removal: always-compiled lets operators trace production, while removal gives the fastest build."],
    p: ["Enabling an unfiltered trace at full rate overflows the ring and perturbs the very behavior being studied.", "A trace holding references past a pool's recycle threshold causes allocation failures elsewhere."],
    v: "Enable a trace on one flow, send a mixed load, and confirm only that flow's packets appear at each stage in order, with timestamps that increase monotonically and the overall drop count unchanged.",
    dep: ["lockless-rings", "tuple-hashing", "flow-table"]
  },
  "flow-introspection": {
    s: "Commands that list and describe live connections and flows: state, addresses, queue depths, retransmission counts and which core owns each.",
    d: "A request is sent to the owning core, which fills a snapshot from its connection table and returns it, so the reader never takes locks on the data path. Output covers state, endpoints, send and receive queue depth, round-trip estimate, window, retransmissions and age. Filters narrow the set. The challenge is scale and consistency: millions of connections cannot be dumped in one pass without stalling a core, and a snapshot is stale the instant it is taken.",
    k: ["Snapshot through the owning core vs. direct memory read: messaging is safe and consistent per core, but delays the answer by a polling interval; direct reads are instant and may be torn.", "Paged iteration vs. one full dump: paging bounds the pause a core takes, while a full dump gives a single consistent view."],
    p: ["A full dump of a large table pauses packet processing on that core long enough to trigger retransmission timeouts elsewhere.", "Operators mistake a snapshot for the present and chase a connection that has already closed."],
    v: "With a million idle connections, request a filtered listing for one address and confirm it returns in milliseconds, matches the application's own view, and that packet latency on the owning core does not rise.",
    dep: ["flow-table", "control-channel", "connection-state-machine"]
  },
  "control-channel": {
    s: "A separate management path (a socket, shared memory or message queue) through which tools query and change a running stack without being in the data path.",
    d: "A control thread listens for requests from command-line tools, an orchestration agent or a monitoring exporter. Requests are validated and turned into messages to the cores that own the relevant state, and replies come back the same way. It covers statistics, route and neighbor changes, flow rules, device settings and capture control. It must never block a polling core, so work is queued, and it must be authenticated, since it can reconfigure the network path of the machine.",
    k: ["A separate process talking over shared memory vs. a thread inside the stack: shared memory isolates tool bugs from the stack, while a thread is simpler and faster to answer.", "Synchronous request and reply vs. asynchronous commands: synchronous is easy to script, but a slow core delays every caller."],
    p: ["An unauthenticated control socket lets any local user reroute or drop production traffic.", "A command that takes a long path on the polling core adds a latency spike that appears unrelated to any packet."],
    v: "Issue a route change through the channel while a generator runs at line rate, and confirm the new route takes effect within a defined interval with no packet loss and no latency step beyond the normal tail.",
    dep: ["control-threads", "inter-core-messaging", "runtime-configuration"]
  },
  "runtime-configuration": {
    s: "The settings that determine cores, queues, pools, offloads and protocol limits, and which of them can change while traffic flows.",
    d: "Settings are read at startup from a file or arguments and cover core lists, queue counts, pool sizes, huge-page allocation, enabled offloads, protocol limits and routing. A subset can be changed live through the control channel: routes, filters, rate limits, log levels. Startup validation compares requested features to what each card reports. It is hard because many settings are structural: queue count or pool size cannot change without stopping the device, and a wrong value shows up as degraded speed rather than an error.",
    k: ["Static structural settings vs. live reconfiguration of everything: static is simple and fast, but resizing needs a restart; live reconfiguration needs quiescing queues and is rarely worth it.", "Strict validation that refuses to start vs. warning and degrading: refusing prevents silent slowness, but can block startup on a card quirk."],
    p: ["Requesting more queues than the card supports silently falls back to fewer, halving throughput without an error.", "A pool sized for the old packet size fails allocation after jumbo frames are enabled."],
    v: "Start with a deliberately oversized setting and confirm startup reports the effective value it got, and that a live-changeable setting alters behavior within seconds while a structural one is refused with a clear message.",
    dep: ["device-abstraction", "packet-buffer-pools", "huge-page-backing"]
  },
  "health-and-watchdog": {
    s: "Checks that the polling loops are alive and the device queues are moving, restarting or failing over when a core stalls or a card stops responding.",
    d: "Each polling core updates a heartbeat counter every loop; a watchdog thread notices one that stops advancing. Device checks watch link state, queue progress and error registers. Responses range from logging, to resetting one queue, to marking the instance unhealthy so a load balancer or peer stack takes over. It is hard because a polling loop that does legitimate long work looks like a stall, and recovering a card from the user side can interrupt every other core using it.",
    k: ["Heartbeat per loop iteration vs. per time period: per iteration catches any stall immediately but costs a store each pass; per period is cheaper and slower to detect.", "Automatic reset vs. reporting only: reset restores service quickly, but may hide a hardware fault and briefly drop all traffic on the device."],
    p: ["A long garbage-free table walk on one core is mistaken for a hang and triggers an unnecessary device reset.", "The watchdog thread itself is starved on a fully busy core set and never runs."],
    v: "Pause one polling core with a debugger for two seconds and confirm the watchdog reports it within its configured deadline, health status flips, and normal state returns after the core resumes.",
    dep: ["per-core-counters", "link-management", "control-threads"]
  },
});
