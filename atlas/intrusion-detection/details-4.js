// Details for the intrusion detection plate, part 4: performance, deployment, foundation, cross-cutting concerns.
ATLAS.details("intrusion-detection", {
  "threading-model": {
    s: "How packet processing is divided among threads: capture, decoding, stream handling, detection and output, arranged as a pipeline, as identical workers, or a mix.",
    d: "In a worker model each thread runs the whole path for the flows assigned to it, with no handoff and no sharing. In a pipeline, stages run on different threads connected by queues, which suits slow stages but adds copies and latency. Management threads handle rule loading, statistics and output. Flow state is owned by one thread, so no locks guard it. Shared structures, such as the compiled rules, are read-only. The hard part is balance: one elephant flow pins one core, and queues between stages hide where time is going.",
    k: ["Run-to-completion workers versus a staged pipeline: workers have the best cache behavior and no queues, while pipelines isolate slow stages and balance better at a cost of handoffs.", "Dedicated cores versus shared with the operating system: dedicated cores give predictable latency, while sharing uses hardware better and risks interference."],
    p: ["One very large flow overloads its worker while the others sit idle.", "More threads than cores plus other services leaves capture threads preempted, and the ring overflows."],
    v: "Run a representative load and confirm per-thread CPU is balanced within tolerance, no thread exceeds the budget, and a single large flow's thread is identifiable in the metrics and stays within its limit.",
    dep: ["flow-to-core-affinity", "memory-pools"]
  },
  "flow-to-core-affinity": {
    s: "Ensures every packet of a conversation, in both directions, reaches the same worker thread on the same core, so its state stays local and lock-free.",
    d: "The adapter or a software distributor hashes the endpoints and protocol, and sends packets with the same hash to the same queue. The hash must be symmetric so both directions agree, and must include inner headers in tunnels. Each queue maps to a thread pinned to a core, ideally in the memory domain of the adapter. Fragments, which lack port numbers, need special handling to land with their flow. When affinity fails, flow state is split, which breaks reassembly and detection quietly.",
    k: ["Hardware hashing in the adapter versus software distribution: hardware is free of CPU cost but limited in fields it hashes, while software is flexible and consumes a core.", "Strict affinity versus load rebalancing: strict affinity preserves locality and risks hot cores, while rebalancing moves flows and needs state transfer."],
    p: ["Asymmetric hashing sends each direction to a different thread, so no thread sees a complete conversation.", "Remote memory access across processor sockets doubles the cost per packet without any visible error."],
    v: "Generate bidirectional flows and confirm in per-thread flow counters that each flow appears in exactly one thread, fragments are with their parent flow, and tunnel traffic hashes on inner addresses.",
    dep: ["nic-receive-path", "hardware-filtering", "tunnel-decapsulation"]
  },
  "offload-handling": {
    s: "Deals with adapter features that merge, split or alter packets for efficiency, which give the sensor a view different from what is on the wire.",
    d: "Adapters can coalesce received segments into large ones, verify or compute checksums, and split large sends into wire-sized packets. A sensor capturing after these features sees oversized packets, unfinished checksums or merged data that no host on the wire saw. The usual practice is to disable receive offloads on capture interfaces so packets appear as sent, and to tell the decoder how to treat checksums. The hard part is where capture occurs: on the sensor's own interface it matters, while on a tap it does not.",
    k: ["Disable offloads on capture interfaces versus accept merged packets: disabling shows true packet boundaries at some CPU cost, while accepting saves CPU and distorts size-based rules and reassembly.", "Trust checksums versus ignore them: trusting finds corrupted packets and breaks under offload, while ignoring avoids false drops and lets bad packets in."],
    p: ["Merged segments larger than the maximum frame size exceed fixed buffers in the decoder.", "Settings applied by hand are lost at reboot, and drops return weeks later."],
    v: "Check adapter settings after boot and confirm receive merging is off, send a stream of known-size packets and confirm the sensor sees exactly the same sizes and count as on the wire.",
    dep: ["nic-receive-path", "os-tuning"]
  },
  "hardware-filtering": {
    s: "Uses adapter or switch hardware to steer, drop or bypass traffic before it reaches software, offloading the simplest decisions at line rate.",
    d: "Programmable adapters match packets against rules, by header fields, and perform actions: drop, steer to a queue, count or mark. Some can bypass whole flows once software decides they need no more inspection, such as the rest of an encrypted session after its handshake. Hardware keeps work off the cores entirely, but tables are small and rules limited. The difficulty is coordination: state in hardware must follow decisions in software, and a stale entry can bypass a flow that should have been inspected.",
    k: ["Bypass after the handshake versus inspect the whole flow: bypass saves large amounts of CPU on bulk encrypted sessions, but removes visibility for the rest of those flows.", "Hardware steering versus software distribution: hardware saves CPU and is limited in table size and fields, while software is flexible and costs cycles."],
    p: ["A bypass entry that outlives its flow applies to a new connection using the same endpoints.", "Hardware table overflow silently falls back to software and the cost jumps."],
    v: "Mark a large flow for bypass and confirm its remaining packets stop reaching the engine, a counter records the bypass, and an unrelated new flow with the same addresses but different ports is still inspected.",
    dep: ["nic-receive-path", "tls-handshake-parser"]
  },
  "memory-pools": {
    s: "Preallocated, fixed-size blocks for packets, flows and stream segments, taken and returned in constant time without calling a general allocator in the hot path.",
    d: "General-purpose allocation costs time and fragments memory, and it can take locks. A sensor reserves pools at startup for packet buffers, flow entries, stream segments and per-protocol state, sized by configuration, with per-thread caches. Components take an object, use it and return it. When a pool is empty, the system must degrade: drop packets, evict flows or skip optional analysis, and count it. Large pages reduce translation misses. The difficulty is sizing: pools too small drop traffic, and too large waste memory the rules and tables also need.",
    k: ["Fixed preallocated pools versus on-demand allocation: pools are fast and bounded and require sizing in advance, while on-demand adapts and risks fragmentation and exhaustion.", "Per-thread pools versus a shared pool: per-thread pools avoid contention and strand free memory in idle threads, while a shared pool balances use at a cost of locking."],
    p: ["Pools sized for average load are exhausted by a burst, and packets are dropped at the allocation point.", "A leak of one object per flow shrinks the pool slowly until the sensor stalls."],
    v: "Run a long soak test at peak load and confirm pool usage plateaus, free counts return to baseline when traffic stops, and exhaustion events, if any, appear in metrics.",
    dep: ["os-tuning"]
  },
  "drop-accounting": {
    s: "Counts, at every point where a packet or event can be lost, how many were dropped and why, so blindness is measured instead of assumed.",
    d: "Loss can occur at the switch, in the adapter, in the kernel, in a ring, in the flow table, at the stream memory limit, in the output queue and at an inline bypass. Each component keeps its own counters with distinct reasons: ring full, no memory, over limit, filtered by policy. A consolidated view relates them to packets received. The goal is one trustworthy figure: what percentage of the monitored traffic was actually analyzed. The hard part is coverage: any untracked drop point makes the figure optimistic.",
    k: ["Count in every component versus total only: component counters point at the cause, while a total is easy to show and tells nobody where to fix.", "Alert on any loss versus a threshold: alerting on any loss is safest and noisy at high rates, while a threshold accepts small unavoidable loss."],
    p: ["Loss upstream of the sensor, such as on a mirror port, is invisible to the sensor's own counters.", "Counters reset on reload make loss across the reload invisible."],
    v: "Overload a test sensor with a known packet count and confirm sensor counters plus adapter counters sum to the number sent, with each loss assigned to a reason and the analyzed percentage reported.",
    dep: ["runtime-metrics", "ring-buffers"]
  },
  "load-shedding": {
    s: "Deliberate, ordered reduction of analysis when traffic exceeds capacity: skipping low-value traffic first so the important traffic is still fully inspected.",
    d: "When queues fill or CPU saturates, a controlled policy replaces random loss. Steps can include stopping optional detectors, skipping the rest of large encrypted flows, reducing logging detail, inspecting only the start of long flows, and dropping lowest-priority traffic classes. Each step is announced by an event and metric. Entering and leaving shed mode uses hysteresis to avoid oscillation. The difficulty is deciding what is safe to skip, since any skipped traffic is a place for an attacker to hide, and choosing priorities needs knowledge of the network.",
    k: ["Controlled shedding versus uncontrolled drops: controlled shedding keeps the most valuable inspection, but needs priorities defined and tested in advance.", "Shed by flow depth versus by traffic class: depth-based shedding keeps beginnings of connections where exploits usually are, while class-based protects named critical systems."],
    p: ["Shedding that drops the first packets of flows instead of the later ones misses the handshake and exploit.", "A sensor that sheds constantly goes unnoticed because the reports are only in a log nobody reads."],
    v: "Offer twice the sensor's rated traffic and confirm shedding starts at the configured threshold, critical traffic stays fully inspected, an event and counter record each step, and normal operation returns with hysteresis.",
    dep: ["drop-accounting", "flow-table", "hardware-filtering"]
  },
  "passive-tap": {
    s: "A device on the monitored link that copies traffic both ways to the sensor without being in the path of the traffic or able to affect it.",
    d: "Optical taps split a fraction of light to a monitor port; electrical taps copy signals with power, and keep passing traffic if power fails. The sensor connects to the monitor ports in receive-only mode, often as two interfaces for the two directions, which are merged by the sensor or the tap. Since the tap cannot be addressed and has no effect on the link, it cannot introduce an outage. It also cannot block. Its difficulty is cost and placement: one per monitored link, and the split ratio must leave enough signal for the main path.",
    k: ["Passive tap versus mirror port: a tap is complete, independent of switch load and costs a device per link, while mirrors are free and may drop or alter traffic.", "Aggregate both directions into one interface versus keep them separate: aggregation is simple but can exceed capacity at full duplex, while separate interfaces require merging."],
    p: ["Using a tap with a split ratio unsuited to the optics lowers signal on the production path.", "Two directions merged onto one interface exceed its capacity at high utilization and drop packets."],
    v: "Install the tap, send a measured stream in both directions and confirm the sensor sees all packets of both, link error counters on the production path do not change, and the link stays up with the sensor powered off.",
    dep: ["tap-and-span-input"]
  },
  "mirror-port": {
    s: "A switch feature that duplicates selected ports, VLANs or whole switch traffic to a port where the sensor listens, with no extra hardware.",
    d: "The switch copies frames from source ports to a destination port. Local mirroring uses one switch; remote mirroring encapsulates the copy and sends it across the network to a collection point, where it competes with production traffic. Mirroring shares the switch's resources: if the combined source rate exceeds the destination's capacity, frames are dropped silently, and mirrored copies may be delayed or reordered. The difficulty is trust in the copy: switches may omit errored frames, strip or alter labels, and give the mirror lower priority than forwarding.",
    k: ["Mirror many ports to one versus one tap per link: mirroring is cheap and covers much with one sensor, while loss under load means undetected blind spots.", "Local versus remote mirroring: local mirroring is simple, while remote reaches distant segments and puts monitoring traffic on the production network."],
    p: ["The mirror silently drops during peak hours because the destination port is slower than combined sources.", "Mirroring both directions of a link to one port at full duplex needs twice the destination capacity."],
    v: "Generate traffic across the mirrored ports near their capacity and compare the sender's frame counts with the sensor's, confirming no silent loss and that frame contents including VLAN labels are preserved.",
    dep: ["tap-and-span-input"]
  },
  "inline-bridge": {
    s: "A sensor placed in the path of traffic, forwarding each packet only after inspection, so it can drop attacks but also becomes a point of failure.",
    d: "The sensor has two interfaces joined as a transparent bridge, or is a routed hop. Each packet is received, inspected within a latency budget, and forwarded or dropped. It preserves ordering within flows and must not change packets beyond what policy requires. Inline operation allows prevention, but adds delay, and any fault, overload or reboot interrupts the traffic path unless a bypass exists. The challenge is the budget: a rule that takes long or a flood that fills queues increases latency for all traffic, not just the suspicious part.",
    k: ["Inline prevention versus passive detection: inline stops attacks before delivery, while passive cannot cause an outage and acts after the fact.", "Bridge versus routed placement: a bridge needs no addressing changes and is transparent, while a routed hop integrates with existing routing and adds a visible device."],
    p: ["A rule update that raises per-packet time pushes latency past application timeouts across the whole link.", "A false positive on a drop rule blocks a business-critical application."],
    v: "Measure added latency at idle and peak rate through the sensor, confirm it is within the budget, then send a staged exploit and verify only it is dropped while concurrent legitimate sessions are unaffected.",
    dep: ["fail-open-bypass", "inline-drop-and-reset", "kernel-bypass-capture"]
  },
  "fail-open-bypass": {
    s: "Hardware or software that keeps the link carrying traffic when an inline sensor fails, loses power or becomes overloaded, at the cost of leaving traffic unchecked.",
    d: "A bypass switch, built into the adapter or as a separate unit, electrically joins the two ports when it stops receiving a heartbeat from the sensor or when power is lost, so traffic flows uninspected. Some designs are fail-closed, cutting the link instead. The sensor can also request bypass itself when overloaded. Heartbeat intervals trade detection time against false triggers. The difficulty is the policy decision behind the hardware: fail-open keeps the business running while attackers may time their traffic to a failure, and fail-closed protects at the price of an outage.",
    k: ["Fail-open versus fail-closed: fail-open protects availability and drops protection during faults, while fail-closed protects the network and turns any sensor fault into an outage.", "Short heartbeat timeout versus long: short timeouts restore traffic fast after a fault but may trigger on a busy sensor, while long ones tolerate load and extend the outage."],
    p: ["Bypass triggered by load spikes goes unnoticed, leaving the link uninspected for long periods.", "An untested bypass fails to close the circuit during a real fault."],
    v: "Pull power and kill the sensor process in turn during traffic, and confirm the link recovers within the stated time, an alert records that bypass is active, and inspection resumes when the sensor returns.",
    dep: ["inline-bridge", "runtime-metrics"]
  },
  "sensor-placement": {
    s: "The choice of network locations where sensors observe traffic: perimeter, between internal zones, in front of critical servers, at cloud boundaries.",
    d: "Each location sees a different slice. At the perimeter, a sensor sees inbound attacks and outbound command traffic, though often after address translation and on encrypted traffic. Between internal zones, it sees lateral movement. In front of critical services, it sees all access to them. Placement also decides path symmetry: a sensor must see both directions of a flow to reassemble it. Decisions follow a threat model and what can be afforded. The difficulty is that every blind spot is chosen by omission, and networks change faster than placement plans.",
    k: ["Perimeter-only versus inside the network too: perimeter sensors are few and cheap, while internal sensors find what already got through and multiply cost and management.", "Before versus after address translation: before translation shows real internal hosts, while after it shows what the outside sees and hides which client acted."],
    p: ["A sensor on one of two redundant paths sees half of each conversation and generates false alerts or none.", "A new network segment is added and no one extends the monitoring."],
    v: "Generate test attacks from each zone toward each other and the internet, and confirm each is detected by at least one sensor that sees both directions, with a map showing which paths are unmonitored.",
    dep: ["passive-tap", "mirror-port", "tunnel-decapsulation"]
  },
  "sensor-clusters": {
    s: "Several sensors sharing one high-volume link, each handling a share of the flows through a splitter that keeps every conversation on one sensor.",
    d: "When a link exceeds one sensor's capacity, a broker or switch splits traffic by flow hash across several sensors, so each sees complete conversations. Hash symmetry and tunnel awareness matter, as in a single sensor. Capacity scales close to linearly. Detections that need a global view, such as scans across many hosts, no longer see all traffic, so they run centrally on logs or flows. The challenge is failure and imbalance: a failed sensor's share must be redistributed without splitting existing flows, and a few large flows can overload one member.",
    k: ["Flow-hash splitting versus per-host splitting: flow-hash balances evenly and breaks cross-flow detections, while per-host keeps all of a host's traffic together and balances worse.", "Hot spare versus rebalancing on failure: spares restore capacity with no flow movement, while rebalancing uses all hardware and breaks live sessions."],
    p: ["A scan spread across many flows is split among sensors, and none sees enough probes to alert.", "A sensor failure rehashes everything, and every active session loses inspection state."],
    v: "Send test flows across a cluster, confirm each lands on exactly one member in both directions, then remove one member and confirm affected flows resume on another and the failure is reported.",
    dep: ["flow-to-core-affinity", "central-management"]
  },
  "virtual-and-cloud-sensors": {
    s: "Sensors that run as virtual machines or containers and receive traffic through virtual switch mirroring, cloud traffic mirroring or in-guest agents, where no physical tap exists.",
    d: "In virtualized networks, traffic between guests never touches a physical wire. Options are mirroring at the virtual switch to a sensor guest, using the cloud provider's mirroring service that encapsulates copies to a sensor, or running a capture agent inside each workload that forwards to a collector. Throughput is limited by virtual networking, encapsulation adds overhead, and workloads that scale automatically need sensors that do the same. The difficulty is coverage: instances are short-lived, and mirroring has per-instance limits and cost.",
    k: ["Network mirroring versus in-guest agents: mirroring needs no change to workloads and may be limited or costly, while agents see decrypted application data and need installing everywhere.", "Dedicated sensor instances versus shared inspection service: dedicated sensors isolate tenants and cost more, while a shared service scales and mixes data."],
    p: ["New instances launch without mirroring configured, forming an unmonitored segment.", "Encapsulated mirror traffic exceeds the sensor's capacity, and the provider drops the excess silently."],
    v: "Launch a new workload in the monitored network, send test attacks, and confirm detection within the expected time of the instance starting, and that mirror configuration appears automatically for it.",
    dep: ["tunnel-decapsulation", "central-management"]
  },
  "central-management": {
    s: "The service that configures, updates and monitors the fleet of sensors: policies, rule sets, versions, health and the inventory of what each sensor is watching.",
    d: "A manager holds the desired configuration per sensor group: rule sources and overrides, variables, enabled detectors and output targets. Sensors pull or are pushed their configuration, apply it and report status: version, load, drops, last update and rule counts. Changes are staged, audited and reversible. The manager shows which sensors are out of date or unhealthy. It is a high-value target, since control of it controls detection on every sensor. The difficulty is drift: sensors that differ from intent by manual edits silently diverge.",
    k: ["Push from a manager versus pull by sensors: push gives immediate control and needs inbound access to sensors, while pull works through outbound connections and is slower to roll out.", "Fully centralized versus local autonomy: central control keeps consistency, while local autonomy lets a sensor keep working when disconnected."],
    p: ["A compromised manager disables detection fleet-wide with a valid-looking configuration change.", "Hand edits on a sensor are overwritten, or worse, preserved unseen by the manager."],
    v: "Change a policy, confirm each sensor in the group reports the new version within the interval, that an offline sensor is flagged as stale, and that the audit trail records who changed what.",
    dep: ["sensor-configuration", "rule-versioning", "runtime-metrics"]
  },
  "time-synchronization": {
    s: "Keeps the sensor's clock accurate and consistent with other systems, so alert times can be compared and combined with logs from elsewhere.",
    d: "The sensor runs a time client against reliable sources, or a hardware reference over the network with hardware timestamps when high precision is needed. The clock should be disciplined smoothly rather than stepped. Accuracy requirements range from milliseconds, enough to order alerts, to microseconds when timing features are used. The offset and any step are monitored and reported. The difficulty is dependence: if time sources are lost or tampered with, all timestamps drift, and correlation across sensors and with other logs silently fails.",
    k: ["Network time protocol versus hardware precision protocol: the former is easy and accurate to milliseconds, while the latter achieves far finer accuracy and needs supporting hardware and network.", "Slew the clock versus step it: slewing keeps time monotonic and takes a long time to fix large offsets, while stepping is immediate and breaks timeouts."],
    p: ["A sensor with a clock hours off produces alerts that fall outside every investigation window.", "A source unreachable after a firewall change leaves the sensor free-running for months."],
    v: "Compare the sensor's clock with the reference, confirm offset is within the stated bound, and send a timestamped event from another system and confirm the correlated times differ by no more than that bound.",
    dep: []
  },
  "os-tuning": {
    s: "Operating system settings that determine whether a sensor keeps up: core isolation, interrupt placement, huge pages, buffer sizes, power states and service minimization.",
    d: "General-purpose defaults waste a sensor's resources. Typical changes are dedicating cores to capture and worker threads, moving interrupts and unrelated services off them, enabling large memory pages, enlarging adapter and socket buffers, disabling power-saving states that add wake-up latency, and aligning threads with the processor socket nearest the adapter. Settings are kept in configuration management and checked at boot. The difficulty is silent regression: an operating system update resets a value, performance drops a little, and no alert fires.",
    k: ["Isolated cores versus shared scheduling: isolation gives steady per-packet time, while sharing uses all cores for other work and creates interference.", "Tuned image versus runtime scripts: a tuned image is repeatable, while scripts are easier to change and may fail at boot."],
    p: ["Power-saving states cause latency spikes that look like random packet loss.", "An update restores default buffer sizes, and loss returns weeks later."],
    v: "After each boot, run a script that reads the live settings and compares them with the expected values, failing the health check on any mismatch, and confirm zero drops under the reference load.",
    dep: ["sensor-configuration"]
  },
  "sensor-configuration": {
    s: "The files that define a sensor's behavior: interfaces, thread layout, memory limits, enabled parsers, detectors, outputs, variables and policy per network.",
    d: "A structured configuration, versioned in source control, sets everything the engine needs at start: capture method and interfaces, worker count, pool and table sizes, protocol settings and timeouts, overlap policies per address range, rule file locations, output targets and limits. The sensor validates it before starting and reports which values are in effect. Many settings are interdependent, such as pool sizes and thread counts. The hard part is safe change: a plausible but wrong value, like a tiny table or the wrong home network, degrades detection without failing.",
    k: ["Generated from templates versus hand-edited: generated configuration is consistent across the fleet, while hand edits fit special cases and drift.", "Validate and refuse versus start with defaults: refusing prevents a misconfigured sensor from running unnoticed, while defaults keep monitoring and hide the mistake."],
    p: ["A mistyped variable name expands to nothing, and a set of rules silently stops applying.", "Memory limits tuned for one hardware model are copied to a smaller one and cause exhaustion."],
    v: "Start the sensor with the production configuration and confirm the effective-settings dump matches the version-controlled file, and that a deliberately invalid value is rejected with a message naming it.",
    dep: ["local-storage"]
  },
  "local-storage": {
    s: "Disk space on the sensor for logs, alerts, extracted files, packet captures and buffers during outages, with quotas and rotation so it never fills.",
    d: "Different data have different value and volume: alerts are small and precious, protocol logs are large, packet captures and extracted files are huge. The sensor assigns each its own area and quota, rotates by size and age, compresses old data and deletes it at the end of retention. Storage speed matters when writing captures at line rate. A full disk should degrade by dropping the least valuable data first, not by halting the sensor. The challenge is shared fate: logs, captures and forwarding buffers on one volume let a flood in one starve the others.",
    k: ["Separate volumes per data type versus one pool: separate volumes isolate failures, while one pool uses space efficiently and fails together.", "Local retention long versus ship and delete quickly: long local retention helps when the central system is down, while quick deletion limits sensitive data held on exposed devices."],
    p: ["Captured traffic fills the volume and the sensor stops writing alerts.", "Deleted data remains recoverable on a sensor that is later decommissioned."],
    v: "Fill the capture area deliberately and confirm rotation removes the oldest data, alert logging continues, quotas hold, and a retention job removes data older than the policy.",
    dep: ["os-tuning"]
  },
  "privilege-separation": {
    s: "Runs the sensor with the least authority it needs, so a flaw in a parser, which handles hostile input, does not hand an attacker control of the host.",
    d: "The process starts with privileges to open the capture device, then drops to an unprivileged user and restricts what system calls and files it can use through a sandbox. Parsers, which read attacker-controlled bytes, run with no network or write access beyond their outputs. Management access is on a separate interface, authenticated, and capture interfaces have no address at all. The sensor is a rich target, with access to all traffic. The challenge is tension with function: restrictions break features such as file extraction, rule reload or active response if set too tight.",
    k: ["Sandbox with strict system call filter versus broad permissions: strict filters contain exploits and break on new features and libraries, while broad permissions are easy to maintain and offer little containment.", "Separate processes per function versus one process: separate processes isolate failures and cost copying, while one process is fast and one bug affects all."],
    p: ["The process keeps root after startup, so a parser bug yields full control.", "A management interface exposed on the monitored network lets an attacker reach the sensor itself."],
    v: "Inspect the running process and confirm it runs as the unprivileged user with the filter active, then attempt a forbidden operation from within a test hook and confirm it is blocked and logged.",
    dep: ["os-tuning"]
  },
  "runtime-metrics": {
    s: "Counters and gauges exported by the sensor: packets seen, bytes, drops by reason, flows, memory use, rule hits and latency, for dashboards and alerting.",
    d: "The sensor keeps per-thread counters that are cheap to update and aggregates them for export on request or at intervals. They cover the capture path, decoder, flow table, stream memory, parsers, detection time, output queues and rule loading. A monitoring system reads them, stores history and alerts on thresholds: rising drops, a stale rule set, high memory, zero traffic. The sensor is itself a system that can silently fail. The difficulty is knowing what normal is, and alerting on a sensor that stopped seeing traffic, not only on one that loses it.",
    k: ["Push versus pull export: pull lets the monitoring system control rate and detect a dead sensor by failure to answer, while push works behind firewalls and needs a separate silence check.", "Per-thread detail versus aggregates: per-thread detail finds imbalance, while aggregates are smaller and hide a single overloaded core."],
    p: ["A sensor that receives no traffic shows zero drops and looks healthy.", "Metrics collected at long intervals miss the short bursts where drops occur."],
    v: "Stop the traffic feed, then overload the sensor, and confirm separate alerts fire for received-traffic-zero and for drops above threshold, each within a minute, with graphs showing per-thread values.",
    dep: ["drop-accounting"]
  },
  "evasion-resistance": {
    s: "Cross-cutting: a sensor sees the network through its own interpretation, and an attacker can exploit any difference between it and the target's, in fragmentation, reordering, encoding or timing.",
    d: "Every layer from decoding to parsing involves interpretation choices. An exploit sent so that the sensor and the target reconstruct different bytes passes unseen. Defenses include target-matched policies, normalization, protocol identification not tied to ports, alerting on ambiguity itself, and in inline mode rewriting traffic into an unambiguous form. Test suites of known evasions are run against each release. It is a design constraint, since each performance shortcut, such as skipping reassembly for speed, creates a new gap. The difficulty is that complete coverage means modeling every implementation on the network.",
    k: ["Match each target versus normalize everything: matching is faithful and needs host knowledge, while normalization removes ambiguity at the price of changing traffic and added latency.", "Alert on ambiguity versus resolve and continue: alerting exposes attacks, and produces noise on faulty software."],
    p: ["Optimizations such as skipping stream reassembly for flows that appear benign create paths attackers can use.", "Tests with only textbook evasions miss techniques that mix several tricks in one flow."],
    v: "Run a published evasion test suite, including fragment, segment, encoding and timing variants, against the configured sensor, and confirm the exploit is detected in every variant or an ambiguity alert is raised.",
    dep: ["overlap-policy", "tcp-reassembly", "ip-defragmentation", "decompression-normalization"]
  },
  "false-positive-cost": {
    s: "Cross-cutting: every alert costs analyst time and, with enforcement, can break legitimate traffic, so the cost of false alarms must be weighed against missed attacks in every design choice.",
    d: "A sensor producing thousands of alerts a day does not protect; analysts stop reading, and the real attack hides among the rest. The cost shows up differently by mode: in detection mode it is attention, in prevention mode it is outages. This shapes rule selection, thresholds, tuning workflow, severity scales, enrichment and the decision of what may block. Teams measure it with alerts per analyst per day and the share closed as benign. The difficulty is the asymmetry: a missed attack is rare and costly, a false positive is constant and cheap, and teams drift toward silence.",
    k: ["Few high-confidence rules versus broad coverage: few rules are quiet and trusted, while broad coverage detects more and requires tuning capacity to stay useful.", "Alert-only versus enforce: alert-only is safe to experiment with, while enforcement is the only way to stop an attack in progress and makes errors costly."],
    p: ["Teams disable noisy rules wholesale to cope and lose detection with no record of what was lost.", "Success is measured by alert counts, so a sensor that sees nothing looks best."],
    v: "Track the benign-closure rate and median time to triage per rule over a month, and confirm every rule above the noise limit has an owner and a tuning decision recorded.",
    dep: ["false-positive-analysis", "suppression-and-thresholds", "rule-overrides"]
  },
  "encryption-visibility": {
    s: "Cross-cutting: most traffic is encrypted, so payload inspection sees less every year, and the design must decide where to decrypt, where to rely on metadata and where to accept blindness.",
    d: "Encryption removes the content that signatures match and, in newer protocol versions, hides certificates and server names. Responses include decrypting at controlled points, shifting inspection to endpoints, analyzing handshakes, sizes and timing, and collecting logs from the services themselves. Each has a cost in complexity, privacy and risk. The decision affects sensor placement, rule strategy, capacity planning and legal review. It is hard because the trend is toward less visibility, and any plan built on today's plaintext decays over time.",
    k: ["Decrypt in the network versus inspect at endpoints: network decryption is central and breaks pinned clients, while endpoint inspection sees plaintext and requires agents on every host.", "Metadata analysis versus content analysis: metadata works on all traffic and detects behavior with less certainty, while content gives exact evidence only where visible."],
    p: ["Rules written for plaintext continue to be deployed and report no alerts, because the traffic is now encrypted.", "Decryption keys or inspection devices become a single store of every user's secrets."],
    v: "Measure the share of monitored traffic by visibility class: clear, decrypted, metadata only, and report which detections apply in each class, reviewed each quarter against the observed trend.",
    dep: ["tls-decryption", "tls-fingerprinting", "size-and-timing-features"]
  },
  "fail-open-or-closed": {
    s: "Cross-cutting: what happens to traffic and to detection when something fails or is overloaded, and who decided that in advance.",
    d: "Every component has a failure mode. A passive sensor failing causes lost visibility but no outage. An inline sensor failing either passes traffic uninspected or blocks it. Overload can be handled by dropping packets, shedding analysis or delaying traffic. Rule updates, memory exhaustion and parser crashes all need a stated behavior. The choice depends on what the network protects: a hospital and a bank choose differently. It must be written down, tested by inducing the failure, and visible in monitoring when it triggers. The difficulty is that failure paths are exercised rarely and so remain wrong the longest.",
    k: ["Availability first versus protection first: availability first keeps business running at risk of unmonitored periods, while protection first accepts outages to avoid them.", "Per-component policy versus one global stance: per-component policy allows tuning to each risk and is harder to audit, while a global stance is simple and wrong somewhere."],
    p: ["A fail-open path is never tested and does not open when needed.", "A sensor falls into bypass during an attack because the attack's load triggered it, and nobody is paged."],
    v: "Induce each failure in a test environment in turn: process crash, memory exhaustion, bad rule update, power loss, overload; confirm traffic and alerting behave as documented and a page is generated.",
    dep: ["fail-open-bypass", "load-shedding", "inline-bridge"]
  },
  "sensor-self-protection": {
    s: "Cross-cutting: the sensor parses hostile input at line rate with privileged access to all traffic, so it is itself a prime target and must be hardened and made resistant to resource attacks.",
    d: "Attackers can target the sensor with crafted packets that crash a parser, expensive patterns that exhaust CPU, floods of unique flows that fill tables, or by compromising its management channel or update feed. Defenses include memory-safe or fuzz-tested parsers, resource limits on every stage, privilege separation, authenticated and signed updates, a separate management network and watching the sensor's own health. The sensor's failure or takeover blinds the defender or gives the attacker a view of the whole network. Hard part is that the fast path is the least defensible: speed tempts shortcuts in input checking.",
    k: ["Hard resource limits versus unlimited: limits keep the sensor alive under attack and cause some missed detections, while unlimited processing is complete until it falls over.", "Fuzz and isolate parsers versus trust them: isolation and fuzzing cost effort and bound the damage of the unavoidable bug, while trust is cheap until it is exploited."],
    p: ["A vulnerability in a parser, which handles every attacker's bytes, gives remote code execution on the sensor.", "Management interfaces share credentials across the fleet, so one breach spreads to all sensors."],
    v: "Run a fuzzing campaign over every parser and a resource-exhaustion test against tables, regular expressions and queues, and confirm no crash, hang or unbounded memory growth, with limit counters visible.",
    dep: ["privilege-separation", "update-integrity", "regex-engine", "flow-table"]
  },
  "data-retention-privacy": {
    s: "Cross-cutting: a sensor sees the traffic of every user, so what it records, who can read it and how long it is kept is a legal and ethical decision as well as a storage one.",
    d: "Packet captures, extracted files, URLs, names and connection logs reveal what people read, send and whom they contact. Policy has to decide what is captured by default, what only on alert, who has access, how long each type is kept, how it is protected and how deletion is proven. Decryption raises the stakes. Regulations and works agreements may restrict content collection or require notice. Short retention limits risk and also limits investigation of intrusions found months after they began. The difficulty is that detection value and privacy exposure grow together.",
    k: ["Metadata only by default versus content on demand: metadata limits exposure and supports most investigations, while content gives proof and increases what could leak.", "Long retention versus short: long retention supports late discovery and expands breach impact, while short retention limits both."],
    p: ["Evidence kept indefinitely because deletion was never scheduled becomes a liability after a breach.", "Analysts with unrestricted access to payloads can read personal data unrelated to any investigation."],
    v: "Audit one sample of each data type: confirm its documented purpose, access list and retention period, that access is logged, and that data older than its period is verifiably gone.",
    dep: ["payload-capture", "local-storage", "tls-decryption", "connection-logs"]
  },
});
