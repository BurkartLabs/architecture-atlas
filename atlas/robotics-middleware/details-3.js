// Details for the robotics middleware plate, part 3: time, quality of service, discovery, transport.
ATLAS.details("robotics-middleware", {
  "node-clock": {
    s: "The clock a node reads for the current time, which can be the system wall clock, a steady monotonic clock or a simulated source, selected by configuration.",
    d: "The core offers several clock types. System time follows the wall clock and can jump when it is adjusted. Steady time only increases and measures durations. Simulated time is set by messages from a clock topic. Timers, stamps and sleeps all go through the node's clock, so one switch changes the time source for the whole node. It is hard because mixing types is easy: subtracting a wall-clock stamp from a steady-clock value yields nonsense that compiles.",
    k: ["Monotonic clock for durations vs wall clock for stamps: monotonic never jumps and is right for timing, while wall time is needed to relate events to the world and can move backward.", "One clock abstraction for all time use vs direct system calls: the abstraction supports simulation and replay, and requires discipline that no code bypasses it."],
    p: ["A system clock adjustment moves time backward by two seconds and timers stop or fire in a burst.", "A library reads the wall clock directly and breaks when the node runs in simulated time."],
    v: "Step the system clock back by five seconds while a steady-clock timer runs and confirm its period is unaffected. Switch to simulated time and confirm the same code follows the published clock.",
    dep: ["language-neutral-core"]
  },
  "simulated-and-replayed-time": {
    s: "A mode in which nodes take the current time from a published clock topic instead of the system clock, letting simulation or recorded data define the timeline.",
    d: "A clock source, a simulator or a playback tool, publishes time values. Nodes in this mode update their clock on each message and fire timers and wake sleepers as time passes. All nodes then share one consistent time, which can be paused, stepped or accelerated. It makes tests repeatable. The difficulty is initialization and coverage: before the first clock message, time is zero; clock rate determines timer granularity; and any component outside the clock model, such as a driver thread, keeps real time.",
    k: ["Time published by one source vs per-node time offset: one source guarantees a shared timeline, while offsets are local and drift between nodes.", "Fast-forward replay vs real-time replay: fast-forward shortens tests and breaks nodes with hardware timeouts, while real-time is faithful and slow."],
    p: ["Nodes start before the clock publishes and stamp their first messages with time zero.", "A simulator pauses and a node blocked on a wall-clock timeout takes the pause as a failure."],
    v: "Run two nodes in simulated time, publish a clock that advances at 2x for one minute, and confirm both nodes' timers fired 120 simulated seconds' worth of ticks and that their stamps agree to the clock step.",
    dep: ["node-clock", "timer-and-sleep-semantics"]
  },
  "network-time-synchronization": {
    s: "Protocols and services that keep the clocks of separate computers and sensors within a known offset of each other, so timestamps from different machines can be compared.",
    d: "Each machine runs a time protocol client that exchanges timestamped packets with a reference, estimates delay and offset and disciplines its clock. Precision protocols with hardware timestamping in network cards reach microseconds; ordinary ones reach milliseconds. Sensors may be stamped by their own device clocks and need conversion. It is hard because the error is invisible in the data: two machines can differ by 80 ms and every message looks well formed.",
    k: ["Hardware-timestamped precision protocol vs ordinary network time: precision gives microseconds and needs supporting network equipment, while ordinary time costs nothing and tolerates only slow robots.", "Stamping at the device vs at the driver: device stamps are accurate to the measurement and need clock mapping, while driver stamps are easy and include transport delay."],
    p: ["A computer loses its time source and drifts by a second per hour, silently skewing fused data.", "Multi-machine fusion assumes synchronized clocks and nobody ever measured the offset."],
    v: "Measure the offset between two machines with a ping-pong test stamped at each end, confirm it stays under the target bound over an hour, and confirm a deliberate 50 ms step is flagged.",
    dep: ["node-clock", "message-timestamps", "deployment-topology"]
  },
  "message-timestamps": {
    s: "The convention that stamped messages carry the time the measurement was taken, plus a frame id, in a standard header so that data can be aligned and transformed.",
    d: "Most sensor and state types begin with a header holding a stamp and the frame in which the data is expressed. The stamp should mark when the physical measurement occurred, not when the message was published. Consumers use it to match streams, look up transforms and compute latency. Everything downstream relies on drivers filling it in correctly, and drivers often cannot know the true capture time, so they estimate by subtracting a delay.",
    k: ["Capture time vs publish time as the stamp: capture time makes fusion and transforms right, while publish time is always available and shifts data by the unknown delay.", "Header in every message vs timestamps only where needed: universal headers make generic tools possible, and cost bytes on messages that do not need them."],
    p: ["A driver stamps with arrival time, adding 40 ms of variable delay that looks like sensor noise.", "A frame id left empty makes transform lookups fail or silently use the wrong frame."],
    v: "Trigger a camera with a flash and an inertial unit with a motion at a known instant, then confirm the stamps on both streams differ by less than the specified tolerance from the true event times.",
    dep: ["node-clock", "interface-definition-language"]
  },
  "timer-and-sleep-semantics": {
    s: "The precise rules for how timers, rates and sleeps behave when time jumps, slows down or is paused, and what a callback sees when it is late.",
    d: "A timer targets absolute deadlines on its clock. A sleep waits until a time or for a duration. Under simulated time, sleeps complete when the clock reaches the target, which may be much faster or slower in wall time. When the clock jumps backward, implementations either reset timers or wait for the old time to pass again. The reference of a duration, wall or steady, determines behavior. The difficulty is that these edge cases are rarely specified, and robots hit them exactly during recovery.",
    k: ["Deadline-based timers vs fixed-delay timers: deadline timers keep average rate without drift, while fixed delay is simpler and accumulates the callback's runtime as drift.", "Reset on a time jump vs wait it out: resetting recovers fast and loses periodicity, while waiting keeps order and can freeze a node for the jump's length."],
    p: ["A node sleeping on the wall clock freezes for an hour after a system time correction.", "A sleep in a simulated node never returns because the clock source stopped publishing."],
    v: "Create a 10 Hz timer, jump simulated time forward by 100 seconds and then back by 50, and confirm the observed behavior matches the documented policy: bounded catch-up on forward jump and reset on backward jump.",
    dep: ["node-clock", "simulated-and-replayed-time"]
  },
  "reliability-policy": {
    s: "A per-endpoint setting that chooses between retransmitting lost samples until acknowledged and sending each sample once with no guarantee that it arrives.",
    d: "Reliable mode adds sequence numbers, acknowledgments and retransmission, so every sample arrives in order unless the history overflows. Best-effort mode sends and moves on, which is lowest latency and loses data on a lossy link. Sensor streams usually want best effort, since a stale frame is worthless, and commands and configuration want reliable. A reliable publisher also blocks or queues when a subscriber is slow. The hard part is mismatch: a reliable subscriber cannot connect to a best-effort publisher.",
    k: ["Reliable delivery vs best-effort: reliable guarantees completeness and adds latency and memory under loss, while best-effort keeps latency flat and loses samples.", "Reliable for all topics as a safe default vs choosing per topic: a safe default avoids surprises and congests a wireless link when a retransmit storm competes with fresh data."],
    p: ["A reliable image stream over a weak link retransmits old frames and the newest data arrives seconds late.", "A reliable subscriber to a best-effort publisher receives nothing and no error is raised."],
    v: "Drop 20 percent of packets with a network emulator and confirm a reliable subscriber still receives every sample in order, with measured added latency, while a best-effort one reports about 20 percent missing.",
    dep: ["qos-compatibility-matching", "history-and-depth", "wire-protocol"]
  },
  "durability-policy": {
    s: "A setting that controls whether a publisher keeps old samples for subscribers that join later, so a new node receives the last map or configuration immediately.",
    d: "With volatile durability, a late joiner sees only samples published after it connects. With transient-local durability, the publisher retains the most recent samples, up to its history depth, and delivers them to each new matching subscriber. It is how static maps, transforms and latched configuration work. It uses publisher memory for the retained data. It is hard because retention is tied to the publisher's life: if it exits, the data is gone, and a restarted publisher may resend old data.",
    k: ["Transient-local retention vs the publisher resending periodically: retention serves late joiners with no traffic, while periodic resend survives a publisher restart and costs bandwidth.", "Retaining one sample vs a deep history: one sample is enough for state, and a deep history serves an event log at the price of memory."],
    p: ["A publisher restarts and the retained map is lost, and every late subscriber starts with nothing.", "A volatile subscriber to a retained topic misses the only message ever sent."],
    v: "Publish one map message, start a subscriber ten seconds later, and confirm it receives it at once with transient-local settings and never with volatile settings.",
    dep: ["history-and-depth", "qos-compatibility-matching"]
  },
  "history-and-depth": {
    s: "A setting for how many samples an endpoint buffers: keep only the latest few, or keep all until delivered, and what to drop when the buffer is full.",
    d: "Keep-last with a depth of N holds the N newest samples and discards the oldest on overflow, bounding memory and latency. Keep-all holds everything until delivery, which bounds nothing and can exhaust memory. Both publisher and subscriber have queues. A depth of one gives the freshest state, and larger depths absorb bursts and slow callbacks. It is hard because the right depth depends on rates and callback durations that change with load.",
    k: ["Small depth vs large depth: small keeps data fresh and bounds memory, while large survives bursts and lets stale data sit and age in the queue.", "Keep-last vs keep-all: keep-last bounds resources by design, while keep-all guarantees no loss and can grow without limit under overload."],
    p: ["A depth of ten at 100 Hz means the node acts on data a tenth of a second old when the callback is slow.", "Keep-all on a high-rate topic with a stalled reader consumes all memory and the OOM killer ends the node."],
    v: "Publish a burst of 100 messages to a subscriber blocked for one second, with depth 5, and confirm exactly the 5 newest are delivered afterwards. Repeat with depth 100 and confirm all arrive.",
    dep: ["reliability-policy", "subscriptions-and-callbacks"]
  },
  "deadline-and-lifespan": {
    s: "Settings for timing guarantees: the longest allowed gap between samples, and how long a sample stays valid before it is discarded as too old.",
    d: "A deadline says a publisher promises a new sample at least every period, and a subscriber expects one. If the period passes with none, both sides receive a missed-deadline event the application can act on. Lifespan marks each sample with an expiry, after which it is dropped from queues and retained history instead of being delivered late. Together they turn staleness from a silent fault into an event. They are hard to choose, since a deadline tight enough to catch faults also fires during normal jitter.",
    k: ["Deadline events handled by the application vs ignoring staleness: events enable a safe stop on lost data, and require handlers and thresholds tuned to real jitter.", "Lifespan expiry vs delivering everything: expiry prevents acting on old commands, while delivering everything keeps data complete for logging."],
    p: ["A deadline set equal to the nominal period fires constantly under normal jitter and is disabled by frustrated engineers.", "A command with no lifespan sits in a queue during a network stall and is executed seconds later."],
    v: "Set a 100 ms deadline, stop the publisher, and confirm a missed-deadline event reaches the subscriber within about 100 ms, then confirm a safe-stop handler runs.",
    dep: ["history-and-depth", "liveliness", "latency-budget"]
  },
  "liveliness": {
    s: "A setting by which a publisher asserts that it is alive, automatically or manually, so subscribers can detect a dead or hung node within a lease time.",
    d: "Automatic liveliness is maintained by the middleware as long as the process runs. Manual liveliness requires the application itself to assert periodically, so a hung node, whose process still exists, is detected. If the lease expires, subscribers get a liveliness-lost event. It underlies failure detection and diagnostics. The tension is the lease: too short and a busy network or a stalled thread raises false alarms, and too long and a dead node goes unnoticed while the robot acts on its last command.",
    k: ["Manual assertion by the application vs automatic by the middleware: manual detects a stuck control loop, while automatic only proves the process exists and misses a deadlocked thread.", "Short lease for fast detection vs long for stability: short lease shortens the fault reaction time, with false alarms during network or scheduling hiccups."],
    p: ["Automatic liveliness keeps reporting a node alive whose control thread deadlocked.", "A lease shorter than a garbage collection pause or a Wi-Fi roam causes spurious failovers."],
    v: "Freeze a publisher's control thread with a debugger while its process stays alive, and confirm subscribers see liveliness lost within the configured lease with manual assertion, but not with automatic.",
    dep: ["participant-discovery", "deadline-and-lifespan", "failure-containment"]
  },
  "qos-compatibility-matching": {
    s: "The rule set that decides whether a publisher and a subscriber can connect, based on whether each requested policy is satisfied by what the other offers.",
    d: "Policies follow request-versus-offer semantics: the subscriber requests, the publisher offers, and a connection forms only if the offer is at least as strong as the request. Reliable offers satisfy both modes, but best-effort satisfies only best-effort requests. If they do not match, no data flows and an incompatibility event is raised on both ends. It is a frequent cause of silent topics. Hard parts are discoverability, since the event is easy to miss, and defaults that differ per topic kind.",
    k: ["Strict matching with an event on mismatch vs automatic adaptation: strict is predictable and shows mistakes, while adaptation connects more but hides a weaker guarantee than the author assumed.", "Per-topic profiles named in a shared file vs ad hoc settings: profiles keep fleets consistent, and ad hoc settings suit one-off tools."],
    p: ["A topic shows both a publisher and a subscriber in the graph and yet no data flows because of one incompatible policy.", "Tools default to a different profile than the application and see nothing."],
    v: "Create a best-effort publisher and a reliable subscriber, confirm no data is delivered and that both sides receive an incompatible-policy event naming the reliability setting.",
    dep: ["endpoint-matching", "reliability-policy", "durability-policy"]
  },
  "participant-discovery": {
    s: "The process by which a node announces itself and learns of others on the network, typically by periodic multicast announcements or by registering with a known server.",
    d: "On startup, each participant sends announcements containing its identity, addresses and security information, and listens for others. Peers respond or are added to a table, and they exchange lists of their endpoints. Announcements repeat so late joiners are found and a lease detects departure. Discovery has no central point of failure, but its traffic grows with the square of the participants. It is hard on wireless or segmented networks, where multicast is filtered or lossy.",
    k: ["Peer-to-peer multicast discovery vs a central registry: peer-to-peer needs no infrastructure and survives any node failure, while a registry scales better and is a single point to run and protect.", "Fast periodic announcements vs slow: fast ones find peers quickly and flood a large graph, while slow ones keep traffic low and delay startup."],
    p: ["Multicast is blocked on a Wi-Fi access point and nodes on different machines never see each other.", "On a graph of hundreds of participants, discovery traffic consumes the wireless link at startup."],
    v: "Start a node on a second machine and confirm it appears in the first machine's graph within the configured discovery time, then pull its network cable and confirm it disappears after the lease.",
    dep: ["udp-multicast-transport", "domain-partitioning", "wire-protocol"]
  },
  "endpoint-matching": {
    s: "After participants meet, publishers and subscribers exchange descriptions of topic name, type and policy, and are paired when all three are compatible.",
    d: "Each endpoint advertises its topic, type identity and requested or offered policies. A matcher compares them on both sides and, when compatible, creates a connection and an entry in the remote endpoint tables, informing the application. It also tears down the pairing when either side leaves. Matching is the point where wiring mistakes surface: a name typo, a type mismatch or a policy mismatch each produce the same visible symptom, no data.",
    k: ["Matching by name, type and policy vs name only: stricter matching catches mismatches early, while name-only allows more connections and defers errors to decode time.", "Matching in each participant vs in a central server: local matching is symmetric and robust, while server matching reduces traffic and concentrates state."],
    p: ["A one-character topic name difference leaves a publisher and subscriber unconnected with no error.", "Endpoint information is delayed behind participant information, so a publisher sends its first messages before the match exists and they are lost."],
    v: "Create a publisher and subscriber with matching names, types and policies, and confirm both receive a matched event with the peer's identity. Change the type on one and confirm no match is made and a warning is logged.",
    dep: ["participant-discovery", "type-identity-and-versioning", "qos-compatibility-matching"]
  },
  "discovery-server": {
    s: "A central or replicated process that holds the directory of participants and endpoints, so nodes register with it directly instead of flooding the network with multicast.",
    d: "Each node is configured with the address of one or more servers, sends its description to them, and receives only the endpoints it needs. Servers can be replicated and chained across subnets. It suits wireless, cloud and large systems where multicast is unreliable or too chatty. It brings back a dependency: a node must know where the server is, and if every server is down, new nodes cannot join, though existing connections stay up.",
    k: ["Server-based discovery vs multicast: servers cut traffic and cross network boundaries, while multicast needs no configuration and no extra process.", "A single server vs replicated servers: one server is simple and a single point of failure, while replicas survive a failure and require consistent configuration."],
    p: ["The server's address is configured on only some nodes, splitting the graph into two groups that cannot see each other.", "The server restarts and nodes take minutes to re-register under load."],
    v: "Start three nodes against one server with multicast disabled and confirm all see each other. Stop the server and confirm existing pairs keep exchanging data while a new node cannot join.",
    dep: ["participant-discovery", "deployment-topology", "udp-multicast-transport"]
  },
  "domain-partitioning": {
    s: "A numeric identifier that splits one physical network into separate logical graphs, so groups of nodes sharing a network cannot see each other.",
    d: "Each participant joins one domain, selected by an identifier, and only discovers participants in the same domain. The identifier typically maps to the network ports used, so separate domains do not even receive each other's discovery packets. It is the simplest isolation between robots, test benches and developers on the same network. It is coarse: it separates everything, there is no per-topic scope, and cross-domain traffic needs an explicit bridge.",
    k: ["Domain per robot vs namespace per robot on one domain: domains isolate completely and cost a bridge to share anything, while namespaces share a graph and rely on discipline.", "Few domains vs one per developer: few domains are easy to administer, and per-developer domains stop colliding test runs on a shared lab network."],
    p: ["Two engineers run on the default domain on one lab network and each robot receives the other's velocity commands.", "The domain value is set in the shell and the launched node inherits a different one than intended."],
    v: "Run a publisher on domain 1 and subscribers on domains 1 and 2 on the same network, and confirm only the domain-1 subscriber receives data and the other sees no participants.",
    dep: ["participant-discovery", "deployment-topology"]
  },
  "graph-change-events": {
    s: "Notifications that tell an application when nodes, publishers or subscribers appear or disappear, so it can react to peers joining or leaving.",
    d: "The discovery layer maintains a graph of known endpoints, and signals a change whenever its state differs: a match, an unmatch, a departure or an incompatibility. Applications can wait on a graph guard, and query who is connected, including counts of publishers and subscribers per topic. Nodes use it to wait for a dependency before acting, and tools to refresh. It is hard because notification is asynchronous and eventually consistent across machines.",
    k: ["Wait for the graph event vs poll the graph: events react immediately and require callback handling, while polling is simple and wastes cycles or adds delay.", "Treating a match as proof the peer is ready vs a separate ready signal: a match shows the connection, and says nothing about whether the peer has finished its own initialization."],
    p: ["A node waits for a subscriber count of one, but the peer matched is a debugging tool, not the real consumer.", "A node acts as soon as it sees the match and the first messages are dropped on the other side."],
    v: "Start a subscriber, observe the publisher's matched count change from zero to one within the discovery time, then stop the subscriber and confirm the count returns to zero after the lease.",
    dep: ["endpoint-matching", "participant-discovery"]
  },
  "wire-protocol": {
    s: "The interoperable on-the-wire format that defines discovery packets, data samples, acknowledgments and heartbeats, so implementations from different makers can exchange messages.",
    d: "A standard protocol defines submessages for data, gaps, heartbeats and acknowledgments, plus a header with identity, and rules for the reliability state machine. Participants in different programming languages or from different implementations interoperate when both follow it. It sits on top of datagram or stream transports. It is hard because the standard leaves many parameters open, and implementations differ in defaults, so interoperating means matching timing parameters and extensions, not just the format.",
    k: ["A standard interoperable protocol vs a private one: standard gives mixed implementations and tools, while a private protocol can be tuned and lose all outside tooling.", "Heartbeat-driven retransmission vs positive acknowledgment of every sample: heartbeats scale to many readers and add repair latency, while per-sample acknowledgments repair quickly and cost traffic."],
    p: ["Two implementations interoperate in a simple test and drop data under load because their heartbeat timing differs.", "A vendor-specific extension is used and the other side silently ignores it."],
    v: "Run a publisher from one implementation and a subscriber from another, send 10000 samples at 1 kHz over a lossy link, and confirm all arrive in order with the expected number of repair messages in a packet capture.",
    dep: ["transport-abstraction", "reliability-policy", "serialization-format"]
  },
  "transport-abstraction": {
    s: "An interface between the protocol and the network that lets several transports, such as datagram, stream and shared memory, be used interchangeably or together.",
    d: "The protocol layer produces packets and hands them to a transport that knows locators, such as addresses, ports or shared segment names. A participant may enable several transports at once, and an endpoint chooses among those reachable by the peer. The abstraction defines how locators are advertised in discovery and how send and receive callbacks are driven. It is hard because the choice is automatic: an endpoint that quietly falls back to a slower path looks identical in the graph.",
    k: ["Several transports used automatically vs one explicit choice: automatic selection gives the best path per peer, while an explicit choice is predictable and easy to reason about.", "A transport plug-in interface vs built-in transports only: plug-ins allow new media such as serial links or custom radios, but each needs maintenance and testing."],
    p: ["Shared memory silently falls back to the network when the memory segment permissions differ, and CPU load triples.", "A peer advertises a locator reachable only on its own subnet and the connection retries forever."],
    v: "Enable shared memory and datagram transports, run two nodes on one machine, and confirm via the transport statistics that data flows over shared memory. Move one node to another machine and confirm it switches to datagrams.",
    dep: ["udp-multicast-transport", "stream-transport", "shared-memory-transport"]
  },
  "udp-multicast-transport": {
    s: "Delivery of messages and discovery packets in datagrams, with multicast used to reach many receivers with one send and unicast used for specific peers.",
    d: "The transport binds ports derived from the domain and sends packets to unicast or multicast addresses. Multicast avoids a separate send per subscriber, which matters for one-to-many sensor streams and for discovery. Datagrams are unordered and may be lost, so ordering and repair are the protocol's job. Kernel socket buffers, packet size limits and network equipment all matter. It is hard on wireless networks, where multicast is sent at the lowest rate and can slow the whole access point.",
    k: ["Multicast for data vs repeated unicast: multicast scales with many readers on a wired network, while on wireless, unicast to each reader is often faster and more reliable.", "Large kernel socket buffers vs defaults: large buffers absorb bursts and avoid drops at high rates, and require system configuration on every machine."],
    p: ["Default socket buffers overflow on a burst of image fragments and the receiver loses frames while the network is idle.", "Multicast data over a wireless access point cuts throughput for every client on the network."],
    v: "Send a 100 Mbit per second stream between two machines and confirm zero kernel receive drops in socket statistics. Then enable it over wireless and compare throughput for multicast and unicast.",
    dep: ["wire-protocol", "fragmentation-and-reassembly", "transport-abstraction"]
  },
  "stream-transport": {
    s: "Delivery over a connection-oriented byte stream, which gives ordered, retransmitted delivery and passes through firewalls and tunnels that block datagrams and multicast.",
    d: "The transport opens one connection per peer, frames messages with a length prefix, and relies on the stream for ordering and loss repair. It works across routers, wide-area links and gateways where multicast is not available, and is the usual choice for cloud connections. It adds head-of-line blocking: one lost segment stalls all later data on that connection, including fresh sensor samples. It also needs connection setup and reconnection logic.",
    k: ["Stream transport vs datagrams: streams cross firewalls and give ordering for free, while datagrams avoid head-of-line blocking and keep latency flat under loss.", "One connection per peer vs one per topic: one per peer saves resources, and one per topic keeps a slow topic from blocking a fast one."],
    p: ["A lossy cellular link stalls a stream, and a control topic waits behind a large image already in the send buffer.", "A half-open connection after a network change sits unnoticed until a long timeout fires."],
    v: "Send an image stream and a control topic over one stream connection with 5 percent loss and confirm the control topic's delivery latency rises behind the images, then confirm it recovers with separate connections.",
    dep: ["transport-abstraction", "wire-protocol", "deployment-topology"]
  },
  "shared-memory-transport": {
    s: "Delivery between processes on one machine through a memory region mapped into each, with only small descriptors passing through a queue, avoiding the network stack.",
    d: "The publisher writes the payload into a shared segment and posts a descriptor to each local reader's queue. Readers map the same segment and read in place, and a reference count frees it. This removes copies and kernel crossings, so latency stays at microseconds even for megabyte messages. Segments need permission and cleanup: a crashed process can leave locks and segments behind, and large messages need pre-allocated pool sizes.",
    k: ["Shared memory for same-machine peers vs loopback network: shared memory removes copies and wins on large data, while loopback is simpler, always available and works across containers.", "Segment sized at startup vs grown on demand: fixed size gives bounded, predictable behavior, while growth avoids a size guess and needs allocation at run time."],
    p: ["A crashed publisher leaves a locked segment and later nodes fail to open it until it is manually removed.", "Containers with separate memory namespaces cannot share the segment and silently use the network instead."],
    v: "Publish 8 MB messages at 30 Hz between two local processes and confirm CPU use and latency are far below the loopback path, and that kill and restart of the publisher leaves no stale segment.",
    dep: ["transport-abstraction", "loaned-and-zero-copy-messages", "lock-free-queues"]
  },
  "intra-process-delivery": {
    s: "Delivery between endpoints that live in the same process by handing over a pointer, bypassing serialization, discovery packets and the network stack entirely.",
    d: "When the publisher and a subscriber share a process, the middleware detects it and moves the message through an in-process queue. A unique-ownership message can be moved to a single reader without copying. Ordinary readers outside the process still receive it through the normal path. It gives the lowest possible latency, but is invisible to tools: introspection and recording see only the copy, if one is made, and policy handling can differ between the two paths.",
    k: ["Pointer handoff in process vs always serializing: handoff is far cheaper for large data, while always serializing is uniform and works with every tool and policy.", "Intra-process path disabled by default vs enabled: disabled is conservative and costs copies, while enabled risks surprising ownership and visibility differences."],
    p: ["A recorder in another process sees no messages because the pipeline was composed into one process and delivery stayed local.", "Qos settings behave differently on the in-process path than on the network path."],
    v: "Publish to one in-process and one remote subscriber, confirm that the in-process one receives the same buffer address and the remote one a copy, and that latency for the local one is a small fraction of the remote.",
    dep: ["composition-and-intra-process", "message-copying-and-ownership"]
  },
  "fragmentation-and-reassembly": {
    s: "Splitting messages larger than a packet into fragments, sending them, and rebuilding the original at the receiver, with repair of lost fragments for reliable endpoints.",
    d: "A sample larger than the datagram limit is divided into numbered fragments sharing a sample identifier. The reader keeps partial samples in a buffer and delivers once all fragments arrive. For reliable endpoints, missing fragments are requested again. Large images and clouds are the typical cases. It is hard because loss of a single fragment destroys the whole sample for best-effort, so large messages are much more fragile than small ones, and bursts of fragments can overflow buffers and switches.",
    k: ["Fragment large messages vs send over a stream: fragmenting allows datagram latency and best-effort semantics, while a stream hides loss and adds blocking delay.", "Pace fragments vs send as a burst: pacing avoids overflowing receiver and switch buffers, and lengthens the time to deliver a large sample."],
    p: ["With 1 percent packet loss and 100 fragments per image, most best-effort images arrive incomplete and are dropped.", "A burst of fragments from several publishers overflows a switch buffer at the same instant."],
    v: "Send 2 MB samples best-effort at 5 percent packet loss and compare delivered fraction with the prediction from the fragment count. Then enable reliable mode and confirm all arrive with the expected repair traffic.",
    dep: ["udp-multicast-transport", "reliability-policy", "wire-protocol"]
  },
});
