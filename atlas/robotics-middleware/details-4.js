// Details for the robotics middleware plate, part 4: security, real-time platform, cross-cutting concerns.
ATLAS.details("robotics-middleware", {
  "participant-authentication": {
    s: "Verification that each node joining the graph holds a certificate signed by a trusted authority, so unknown machines cannot participate in discovery or data exchange.",
    d: "Before two participants exchange data, they run a handshake: each presents a certificate chain, proves possession of its private key, and derives a shared secret. Participants with invalid or expired certificates are not matched. The authority's certificate is distributed to every node in advance. It protects against a rogue laptop on the robot's network. It is hard because it adds startup time per peer pair, and failure modes look like silent non-discovery rather than a clear refusal.",
    k: ["Mutual certificate authentication vs a shared network secret: certificates give per-node identity and revocation, while a shared secret is simple and one leak compromises everything.", "Authentication at discovery vs per message: at discovery is cheap per message, while per-message signing detects a hijacked session and costs CPU on every sample."],
    p: ["An expired certificate on one node makes it vanish from the graph with only a low-level log line.", "Clock skew makes valid certificates appear not yet valid at boot."],
    v: "Start a node with a certificate from an untrusted authority and confirm it is never matched and logs an authentication failure naming the cause. Start one with a valid certificate and confirm it joins and exchanges data.",
    dep: ["certificate-management", "participant-discovery", "node-clock"]
  },
  "access-control-policy": {
    s: "A signed document listing which participants may publish or subscribe to which topics, and which services and actions they may use, enforced when endpoints are matched.",
    d: "Policies map each node identity to allowed topics by name pattern and direction. They are signed by a permissions authority, and each node loads its own. When an endpoint is created, the middleware checks it against the policy, and a remote endpoint is checked against the remote node's policy. A denied endpoint is simply not created or matched. It limits the damage of a compromised node. It is hard to write: robots use many topics, including internal ones, and a policy too narrow breaks the system.",
    k: ["Allow-list policy per node vs one broad policy for the robot: per-node limits damage from a compromised node, while a broad policy is easy to maintain and allows lateral movement.", "Generating policies from the running graph vs writing by hand: generation is fast and complete, and risks encoding existing mistakes as permitted behavior."],
    p: ["A new topic is added in code but not in the policy, and the node fails at the first publish in the field.", "A wildcard policy for convenience grants every node the right to command the actuators."],
    v: "Run a node whose policy omits a command topic, try to publish to it, and confirm the endpoint is refused and no data reaches the actuator. Add the topic to the policy and confirm the publish succeeds.",
    dep: ["participant-authentication", "graph-names-and-resolution"]
  },
  "payload-encryption": {
    s: "Encryption and integrity protection of data in transit, using session keys derived per participant pair or per topic, so eavesdroppers learn nothing and tampering is detected.",
    d: "Each sample or packet is encrypted with an authenticated cipher and carries a tag so modification is detected. Keys are derived during the handshake and rotated, and may differ per topic or per reader. Encryption can protect the whole packet or only the payload while leaving headers readable for routing. It costs CPU on every message, which matters for images and clouds, and adds latency on small embedded processors. It also blocks zero-copy sharing.",
    k: ["Encrypt everything vs only sensitive topics: encrypting everything is simple and uniform, while selective encryption saves CPU for bulk sensor streams.", "Signing only vs signing and encrypting: signing proves origin and integrity at lower cost, while encryption also hides content that is private."],
    p: ["Encrypting a 4 MB image stream saturates one CPU core and the control loop starves.", "Encrypted traffic cannot be inspected by diagnostic captures, so network issues are harder to debug."],
    v: "Capture packets between two nodes with encryption on and confirm payloads are unreadable. Flip a byte in flight with a test proxy and confirm the receiver discards the sample and counts an integrity failure.",
    dep: ["participant-authentication", "wire-protocol", "certificate-management"]
  },
  "certificate-management": {
    s: "The process for issuing, distributing, renewing and revoking the keys and certificates that identify each node, kept in a secure store and rotated before expiry.",
    d: "An authority issues each node a key pair and a signed certificate with a validity period. Files are placed in a protected directory or hardware store on each machine, and renewal is scheduled. A compromised node must be revoked, which is difficult in a system with no central runtime server, so lifetimes are kept short instead. It is mostly an operational problem: a fleet of robots in the field needs an update path for keys and a plan for those that were offline past expiry.",
    k: ["Short-lived certificates with automated renewal vs long-lived ones: short lifetimes limit the damage of a leak, while long lifetimes need no renewal and make revocation impossible in practice.", "Keys in files vs in a hardware secure element: files are easy to deploy and copy, while hardware keys cannot be extracted and complicate provisioning."],
    p: ["A robot stored in a warehouse for a season boots with expired certificates and cannot join the network.", "A private key is committed into a repository with the robot's configuration."],
    v: "Issue a certificate valid for one day, run until it expires and confirm the node is rejected. Renew it before expiry with the renewal job and confirm the node stays in the graph without a restart.",
    dep: ["participant-authentication", "security-enclaves"]
  },
  "security-enclaves": {
    s: "Named groups of nodes, each with its own identity, keys and policy, so a robot can be divided into trust zones such as perception, control and external interfaces.",
    d: "An enclave is a directory of keys, certificates and policy shared by the nodes launched into it. Different nodes of one robot can have different enclaves, so a compromised remote interface node cannot publish to the drive controller. The launch description selects an enclave per node. It approximates least privilege inside a robot. It is hard because the finer the division, the more policies and keys to maintain, and the policies must match the real data flow between zones.",
    k: ["One enclave per node vs one per subsystem: per node gives the tightest isolation, while per subsystem is manageable and treats subsystem members as mutually trusted.", "Isolating the external interface in its own enclave vs a shared one: isolation contains a breach at the edge, and means every legitimate crossing needs an explicit allow rule."],
    p: ["All nodes launch with the default enclave and the isolation exists only on paper.", "A policy for a remote-interface enclave allows publishing to velocity topics, defeating its purpose."],
    v: "Launch the remote-interface node in its own enclave, try to publish from it to the drive command topic, and confirm the attempt is denied while its permitted status topics still flow.",
    dep: ["access-control-policy", "certificate-management", "launch-descriptions", "safety-boundary"]
  },
  "real-time-executor-design": {
    s: "Executor and node designs that guarantee bounded callback latency, with fixed thread priorities, preallocated resources, and deterministic ordering, for control loops with hard deadlines.",
    d: "A real-time executor runs callbacks from a dedicated high-priority thread, uses preallocated message and queue storage, and orders callbacks deterministically, for example by a fixed chain from sensor to actuator. Non-real-time work, such as logging and diagnostics, is moved to lower-priority threads. It is analyzed by worst-case, not average, execution time. It is hard because the general-purpose parts of the stack, such as discovery and logging, allocate and lock, and one slip in the loop invalidates the guarantee.",
    k: ["Static callback chains vs dynamic scheduling: static chains give analyzable worst-case latency, while dynamic scheduling adapts to load without a provable bound.", "Separating real-time and non-real-time nodes into processes vs a single process: separate processes isolate faults and interference, while a single process avoids a hop and shares one fault domain."],
    p: ["A logging call in the control callback takes a lock and misses the deadline once an hour.", "Using a general executor for a 1 kHz loop gives a good average and a long tail that trips safety limits."],
    v: "Run the control loop at 1 kHz for 24 hours under stress load and confirm the measured maximum latency stays below the budget, with a histogram that shows zero deadline misses.",
    dep: ["executor", "allocation-discipline", "thread-priorities-and-affinity", "latency-budget"]
  },
  "allocation-discipline": {
    s: "The practice of preallocating memory and avoiding dynamic allocation, blocking calls and page faults inside time-critical code, so execution time does not depend on the allocator or the kernel.",
    d: "Memory for messages, queues and working buffers is reserved at startup, using fixed-size types and pools. Memory is locked in RAM so that it cannot be paged out. Allocation, system calls that may block, and logging that formats strings are kept out of the loop. Tools check for violations by instrumenting the allocator. It is hard because libraries allocate implicitly, such as by growing a container or formatting a string, and violations hide until a rare slow path occurs.",
    k: ["Preallocated pools vs a general allocator: pools make allocation time bounded and constant, while a general allocator is flexible and has an unbounded worst case.", "Locking all memory vs allowing paging: locking removes page-fault latency and consumes physical memory, while paging saves memory and makes timing unpredictable."],
    p: ["A container grows once during a rare event, calls the allocator and stalls the loop for milliseconds.", "Memory is not locked, and the first touch of a page after a quiet period costs a page fault."],
    v: "Run the loop under an allocation tracer for an hour and confirm zero allocation or lock calls inside the time-critical section, and that page-fault counters for the thread stay at zero after startup.",
    dep: ["loaned-and-zero-copy-messages", "interface-definition-language"]
  },
  "thread-priorities-and-affinity": {
    s: "Assigning scheduling policies, priorities and processor cores to the threads of a node, so time-critical work preempts everything else and is not disturbed by other work.",
    d: "Control threads run under a real-time scheduling policy with a high fixed priority, and are pinned to cores that are isolated from general work and interrupts. Middleware threads, such as receive and discovery threads, get their own, lower priorities. Misassignment inverts priorities: a high-priority thread waits for a lock held by a lower one that is itself preempted. It is hard because the middleware creates internal threads whose priorities are easy to forget.",
    k: ["Pinning to isolated cores vs letting the scheduler balance: pinning gives consistent latency and wastes cores that could absorb load, while balancing is efficient and variable.", "Strict real-time priority vs normal priority with a high nice value: strict priority gives deadlines, and a runaway thread at that priority can lock the whole machine."],
    p: ["A real-time thread spins in a bug and starves the network thread so the robot cannot be reached to stop it.", "The middleware's receive thread runs at default priority and delays the control data it carries."],
    v: "Run a CPU stress test on all other cores and confirm the pinned control thread's wakeup latency histogram stays below the budget, with the distribution unchanged from the idle baseline.",
    dep: ["preemptive-kernel-configuration", "executor"]
  },
  "preemptive-kernel-configuration": {
    s: "Operating system settings and kernel builds that make the kernel interruptible and predictable: preemption models, interrupt handling, timer resolution and power management choices.",
    d: "A fully preemptive kernel lets high-priority threads interrupt almost any kernel code, and threaded interrupt handlers prevent a device from blocking the loop. Settings include disabling deep processor sleep states, fixing frequency, isolating cores, and tuning timer slack. Latency is measured with a cyclic test under load. It is hard because defaults are tuned for throughput and power, and each driver can add its own long non-preemptible section that spoils the result.",
    k: ["A real-time kernel build vs a standard kernel with tuning: a real-time build bounds latency tightly and supports fewer drivers, while a tuned standard kernel is easier to deploy and has a longer tail.", "Disabling power saving vs enabling: disabling removes wakeup delays and uses more power and heat, which matters on battery robots."],
    p: ["A graphics or network driver update adds a long interrupt-off section and latency doubles with no change in application code.", "Frequency scaling lowers the clock during an idle moment and the next control cycle runs slow."],
    v: "Run a cyclic latency test on the target for 24 hours with the robot's normal load and confirm the maximum wakeup latency stays below the control period's budget, and repeat after every driver or kernel update.",
    dep: ["driver-interface-layer"]
  },
  "lock-free-queues": {
    s: "Queues for passing data between threads or processes without locks, using atomic operations and fixed buffers, so a producer never waits on a slow or preempted consumer.",
    d: "A ring buffer with atomic head and tail indices lets one thread write and another read without taking a mutex. Variants support multiple producers or consumers. They connect receive threads to executors and are the basis of shared-memory transports. Full queues either drop the oldest or fail the push, by policy. They are hard to implement correctly: memory ordering mistakes cause rare corruption, and real-time safety requires bounded retries, not just absence of locks.",
    k: ["Lock-free queue vs mutex-protected queue: lock-free gives bounded latency and no priority inversion, while a mutex is simpler and risks a high-priority thread waiting on a lower one.", "Single-producer single-consumer vs multi-producer queues: single-producer is the fastest and simplest, while multi-producer supports fan-in at higher cost and complexity."],
    p: ["A missing memory barrier corrupts one message in a billion on a weakly ordered processor.", "A full queue drops silently, and the loss shows up as a mysterious gap in sensor data."],
    v: "Run a stress test with one producer and one consumer exchanging 10 billion numbered items on the target processor and confirm no lost, duplicated or reordered items and a bounded worst-case enqueue time.",
    dep: ["allocation-discipline"]
  },
  "driver-interface-layer": {
    s: "The boundary between the middleware and hardware drivers, defining how a sensor or actuator is read and commanded by a node, often as a real-time control framework with a fixed update loop.",
    d: "A hardware abstraction exposes each device as named command and state interfaces, such as joint position and effort. A controller manager runs a periodic loop that reads state, calls controllers, and writes commands, and controllers can be loaded and switched at run time. Drivers talk to fieldbuses, serial and USB devices. It decouples controller code from specific hardware. It is hard because the loop must be real-time and drivers often block on devices.",
    k: ["A fixed-rate control loop with all drivers in one process vs separate driver nodes: one loop gives deterministic order and tight timing, while separate nodes isolate faults and add message latency.", "Switching controllers at run time vs restarting: runtime switching allows mode changes without stopping, and requires safe handover between controllers."],
    p: ["A driver call blocks on a slow device and delays the whole loop, including every other joint.", "Two controllers claim the same joint command interface and the last writer wins."],
    v: "Load a joint position controller, command a step, and confirm the measured joint reaches the target in the expected time with loop jitter within bounds. Switch to an effort controller and confirm no jump in the command.",
    dep: ["thread-priorities-and-affinity", "microcontroller-bridge", "managed-node-states"]
  },
  "microcontroller-bridge": {
    s: "A lightweight client and a link that let a small microcontroller act as a graph participant, exchanging messages with the main computer over a serial, USB or network connection.",
    d: "The microcontroller runs a minimal client library with static memory and a small set of endpoints. It talks over a compact link to an agent on the main computer, which represents it in the graph and translates to the full protocol. The microcontroller handles fast loops such as motor control and sensor sampling. It is hard because resources are tight, the link can fail, and reconnection must restore state without a restart of the whole robot.",
    k: ["An agent that proxies the device vs the device speaking the full protocol: a proxy keeps the device small and adds a dependency on the agent, while the full protocol needs more memory and removes the extra hop.", "Best-effort topics on the serial link vs reliable streams: best-effort suits fast sensors and loses data on noise, while reliable gives completeness with added latency."],
    p: ["The serial link drops, the agent holds stale endpoints, and the graph shows a healthy device that has stopped.", "The device's clock is not synchronized to the computer and its stamps are meaningless."],
    v: "Unplug the link for two seconds while the microcontroller publishes at 100 Hz and confirm the node disappears from the graph, reconnects on replug, and that stamps after reconnection align with the host clock within tolerance.",
    dep: ["driver-interface-layer", "serialization-format", "network-time-synchronization"]
  },
  "latency-budget": {
    s: "The allocation of a maximum end-to-end delay across stages from sensor to actuator, with a stated worst-case allowance for each node, queue and transport hop.",
    d: "A budget starts from a physical requirement, such as stopping before an obstacle, and divides it among capture, transport, processing, planning and actuation. Each stage gets a deadline and is measured against it. It determines architectural choices: which nodes are composed, which links use shared memory, which topics use depth one. It is hard because latency adds across layers, the average hides the tail, and no single node can see the whole chain.",
    k: ["Budget the worst case vs the average: the worst case gives a safe system and wastes capacity, while the average is efficient and fails at the tail where accidents happen.", "End-to-end measurement vs per-stage measurement: end-to-end shows the result, while per-stage shows where the time went and needs consistent timestamps."],
    p: ["Every stage meets its average and the combined worst case exceeds the stopping time.", "A new node added to the pipeline takes ten milliseconds nobody budgeted for."],
    v: "Inject a timestamped event at the sensor and measure the delay to the actuator command over a long run, then confirm the 99.99th percentile stays within the budget and compare each stage's measured share against its allowance.",
    dep: ["message-timestamps", "deadline-and-lifespan", "real-time-executor-design"]
  },
  "failure-containment": {
    s: "The design rule that a fault in one node, link or machine must be detected quickly and prevented from spreading, with each failure having a defined, safe system response.",
    d: "Containment is built from process boundaries, supervision, liveliness and deadline detection, bounded queues and safe defaults at the actuator. Each node declares what it does when an input goes silent: hold, stop, or degrade. A watchdog at the lowest layer enforces the stop. It is hard because most failures are partial: a node that is alive and sending stale or wrong data is worse than one that is dead, and the middleware cannot tell the difference.",
    k: ["Fail-stop on any lost input vs degrade and continue: fail-stop is the safest and interrupts the mission often, while degrading keeps working with reduced capability and needs analysis of each mode.", "Detection in each node vs one health monitor: per-node detection reacts fastest with local knowledge, while a monitor sees system-wide patterns and adds a hop and a single point."],
    p: ["A perception node hangs and keeps publishing its last obstacle list, and the planner drives into a new obstacle.", "A restart loop hides a recurring crash because the system recovers each time."],
    v: "Kill each node in turn during a mission and confirm the robot reaches its defined safe response within the stated time every time, recorded in a fault-injection test with pass criteria per node.",
    dep: ["process-supervision", "liveliness", "deadline-and-lifespan", "safety-boundary"]
  },
  "deployment-topology": {
    s: "The decision of which nodes run on which computers, over which networks, and where recording, simulation and operator tools connect, which fixes every hop's cost.",
    d: "Choices include one computer for everything, several computers on a wired network, a microcontroller tier for fast loops, and a remote operator or cloud connection over wireless. Each boundary changes transport, discovery, clock accuracy and failure behavior. Data-heavy nodes are kept together, and control loops are kept on one machine. It is hard because the topology evolves with the robot, and code that was written for one machine meets the network, with its latency and loss, for the first time in deployment.",
    k: ["Everything on one computer vs distributed across several: one computer has the lowest latency and a single failure domain, while several computers add compute and isolation and a network in the loop.", "Wired links for robot-internal traffic vs wireless: wired is deterministic and bulky to install, while wireless is flexible and has variable delay and loss."],
    p: ["A design tested on one machine fails in deployment because large messages now cross a network.", "Operator tools on the same domain as the robot flood its network with introspection traffic."],
    v: "Deploy the nodes across the intended machines, measure the traffic on each link and the end-to-end latency, and confirm that no link exceeds 60 percent utilization and the control path stays on one machine.",
    dep: ["domain-partitioning", "network-time-synchronization", "transport-abstraction"]
  },
  "message-copying-and-ownership": {
    s: "The rules for who owns a message buffer, when it is copied, and how long it stays valid, which decide both performance and the risk of one node corrupting another's data.",
    d: "A message passes through the sender, possibly through serialization, the transport, a queue and the receiver's callback. At each step it is copied, moved or shared. Unique ownership allows cheap moves, while sharing needs immutability or reference counts. Large messages such as images make a single extra copy per hop visible as CPU load. It is hard because the rules differ by path: intra-process, shared memory and network behave differently, and code that works on one can corrupt data on another.",
    k: ["Copy on every hop vs share with immutable messages: copying is safe and costs bandwidth and CPU, while sharing is cheap and requires the discipline not to modify what is received.", "Callbacks given a borrowed message vs an owned one: borrowed is cheap and forbids keeping it, while owned lets code keep it and may force a copy."],
    p: ["A callback mutates a shared received image, and another subscriber in the process sees the changed pixels.", "A pointer to a borrowed message is stored and read after the buffer was recycled."],
    v: "Publish an image to two in-process subscribers, have one try to modify it, and confirm the other sees unmodified data. Count copies per hop with a memory tracer and confirm it matches the documented path.",
    dep: ["loaned-and-zero-copy-messages", "intra-process-delivery", "serialization-format"]
  },
  "interface-compatibility": {
    s: "The policy that governs how message, service and parameter definitions may change without breaking nodes built at different times, across a fleet that is never updated all at once.",
    d: "Types are contracts shared by independently built nodes, recordings and tools. Rules specify which changes are allowed, such as adding a new type, and which require a new name. Releases bundle interface packages so all nodes use the same version, and compatibility checks run in continuous integration against stored definitions. It is hard because the middleware matches strictly by type identity, so any change breaks matching and old recordings, while fleets run mixed versions during a rollout.",
    k: ["Never change a type, only add new ones, vs allow in-place evolution: add-only is safe for mixed fleets and leaves old types to maintain, while evolution is tidy and breaks old nodes.", "Versioned topic names vs fixed names with versioned types: versioned names allow two generations to run side by side and double the traffic and documentation."],
    p: ["A field is added to a status message and half the fleet stops receiving it after a partial update.", "Replaying last year's recording fails because the definitions it used no longer exist."],
    v: "Run a compatibility check in CI that compares each interface definition against the last release and fails on any incompatible change, then confirm an old-version node and a new-version node still exchange the unchanged types.",
    dep: ["type-identity-and-versioning", "interface-definition-language", "recording-container-format"]
  },
  "safety-boundary": {
    s: "The line separating software that may be trusted to keep people safe from software that may not, with the middleware's guarantees and failure modes stated at that line.",
    d: "General-purpose middleware, with dynamic memory, discovery and a general kernel, is not itself certifiable for safety functions. A safety design therefore puts an independent monitor, such as a certified controller or hardwired emergency stop, below the middleware, and treats everything above as untrusted input to it. The boundary defines which messages may reach the actuator, with limits applied below it. It is hard because the monitor must be simple and independent enough to analyze, and must still understand what the robot is doing.",
    k: ["A separate safety controller below the middleware vs safety in the application nodes: separate hardware is analyzable and independent of the stack, while application-level safety is flexible and inherits every software fault.", "Hardwired emergency stop vs software stop: hardwired works when the software has failed, while software stop can be graceful and fails with the system it protects."],
    p: ["The emergency stop is a topic message, and a stalled network leaves the robot moving.", "The safety controller relies on the same clock or driver as the application it supervises and fails with it."],
    v: "Crash the entire middleware stack during motion and confirm the independent safety controller brings the robot to a stop within the specified distance without any message from the software.",
    dep: ["driver-interface-layer", "access-control-policy", "failure-containment"]
  },
});
