// Details for the network switch OS plate, part 5: forwarding tables, buffers and queues, platform, base system.
ATLAS.details("switch-os", {
  "mac-table": {
    s: "The hardware hash table that maps a VLAN and destination MAC address to an egress port or group, learned dynamically or installed statically.",
    d: "Entries sit in a hash table with a few slots per bucket, keyed on VLAN and address. A hit yields the port, group or tunnel; a miss floods within the VLAN. Hardware sets hit bits that software uses for aging, and can learn new entries itself. Capacity ranges from thousands to hundreds of thousands, and it is often shared with other exact-match uses. It is hard because hash collisions mean a table can refuse new entries well before it is nominally full.",
    k: ["Learn in hardware vs install from software: hardware learning is fast and cheap, while software installation gives control and limits how quickly entries can be added.", "Single large shared exact-match memory vs a dedicated MAC table: shared memory flexes between uses, and a dedicated table protects MAC capacity from other features."],
    p: ["Hash collisions make the table reject an address at sixty percent occupancy, and the traffic floods.", "A burst of unique source addresses from a scan fills the table and evicts real hosts."],
    v: "Fill the table with random addresses until insertion fails, record the achieved occupancy, and confirm it matches the platform's published capacity and that software reports the failure rather than silently dropping.",
    dep: ["serdes-and-mac-ports"]
  },
  "route-table": {
    s: "The hardware longest-prefix-match memory that maps a destination address to a next hop or group, organized to hold many prefixes with fast lookup.",
    d: "Routes are stored in specialized memories such as trie structures, algorithmic memory or TCAM, usually split into sections by prefix length and by IPv4 and IPv6. Lookups complete in the pipeline in fixed time. Updates must insert prefixes without disturbing ones in use. Larger tables use more power and area. It is hard because capacity depends on the prefix mix: IPv6 and long prefixes use more space, and the practical limit differs from the headline number.",
    k: ["TCAM for routes vs algorithmic memory: TCAM is simple and fast to update, but costly and power-hungry, while algorithmic memory holds more routes per area and has slower, constrained updates.", "Install all routes vs a subset with default routing upward: all routes give exact paths, while a subset saves space and relies on a larger device above."],
    p: ["Capacity measured with IPv4 only is exceeded when the same table must also hold IPv6 routes.", "Inserting routes in an order that fragments the memory fails below the stated capacity."],
    v: "Install a realistic mix of IPv4 and IPv6 prefixes up to the published limit and send traffic to a sample from each prefix length, confirming correct next hops, and measure how many remain installable.",
    dep: ["table-resource-manager"]
  },
  "nexthop-table": {
    s: "The hardware table of next-hop entries, holding egress interface, rewrite information and links to groups, referenced by routes and neighbors.",
    d: "A next-hop entry holds the router interface, the neighbor's MAC address and outgoing port or tunnel, and possibly encapsulation data. Groups point to sets of entries. Routes store only an index, so one change to a next hop updates all routes that use it. Entries are shared where identical. It is hard because table size is finite and shared with tunnels and groups, and entry creation order must satisfy dependencies so a route is never installed pointing at an incomplete entry.",
    k: ["Indirection through shared next-hop entries vs inline next-hop data in each route: indirection makes updates fast and compact, while inline entries are simple and cost many writes on a change.", "Separate tables for groups and members vs unified: separate tables are simpler to manage, while unified tables share capacity more flexibly."],
    p: ["A route is installed pointing to an entry still being created and traffic goes to the wrong port.", "Next-hop entries with a stale neighbor address survive the neighbor's removal."],
    v: "Install a route to a next hop, change the neighbor's MAC address once, and confirm that all routes using that next hop forward to the new address after a single update and none are interrupted.",
    dep: ["table-resource-manager"]
  },
  "acl-tcam": {
    s: "A ternary content-addressable memory that matches packet fields against value and mask pairs in priority order, used for access rules, traps and classification.",
    d: "Each entry holds a key with masks, a priority and an action. All entries compare in parallel and the highest-priority hit wins. It is divided into slices by stage and key width, with some slices dedicated to ingress, egress or traps. Entries consume more space as keys get wider. It is expensive in area and power, so it is small. It is hard because priority order matters, so inserting an entry in the middle can need moves of many others, and hardware may not support that atomically.",
    k: ["Large wide keys with many fields vs several narrow slices: wide keys allow rich rules and use more memory per entry, while narrow slices fit more simple rules.", "Fixed slice allocation vs dynamic: fixed allocation is predictable, and dynamic allocation adapts to the feature mix at the risk of fragmentation."],
    p: ["Inserting a high-priority entry requires shifting many entries and traffic is briefly mis-matched.", "Enabling a feature silently consumes slices that an existing ACL needed, and the next update fails."],
    v: "Install overlapping rules with different priorities, send packets matching each combination, and confirm the highest-priority action applies, then fill the memory and confirm the failure is reported as capacity.",
    dep: ["table-resource-manager"]
  },
  "table-resource-manager": {
    s: "Allocates the chip's shared lookup memories among tables and features, tracks usage and rejects or reports requests that cannot fit.",
    d: "Software knows how much memory is available and divides it by profile: more for MACs in a layer 2 role, more for routes in a layer 3 one. It tracks occupancy per table, applies thresholds, and refuses installation when full. On chips with flexible memory it chooses how to carve the pool. It is hard because the true capacity depends on fragmentation, hash behavior and the feature mix, so software's estimate of free space differs from what the hardware accepts.",
    k: ["Reserve capacity per feature vs shared first-come: reservations guarantee each feature its space and waste the rest, while sharing uses memory fully and lets one feature crowd out others.", "Pessimistic accounting vs try and handle failure: pessimistic accounting refuses early and wastes space, while trying wins capacity and must handle failures from hardware."],
    p: ["Software's free-space estimate is optimistic and hardware refuses entries software thought would fit.", "A profile change requires a reboot that operators were not told about."],
    v: "Select each scale profile, fill every table to the limit software reports, and confirm the number of entries hardware accepts equals the reported capacity, with occupancy visible in the state database.",
    dep: ["capability-discovery","vendor-sdk-adapter"]
  },
  "table-scale-profiles": {
    s: "Named presets that tell the chip how to divide its memory among table types for a role, such as access, aggregation or data-center leaf.",
    d: "A profile fixes the allocation of memory banks to MAC, route, next-hop, tunnel and ACL tables, and may enable or disable features that need specific memory. Changing it usually needs a restart or at least a table rebuild. The choice determines the largest network a box can serve in its role. It is hard because customers find new needs after deployment, and capacity for one table is bought by shrinking another, so the wrong profile limits the whole fabric.",
    k: ["Few coarse profiles vs fine-grained tuning: coarse profiles are tested and simple to support, while fine-grained tuning serves unusual designs and multiplies configurations to validate.", "Profile change requiring a reboot vs live resize: reboot is simple and disruptive, while live resizing avoids outage and is difficult to make safe."],
    p: ["Boxes deployed with the default profile cannot hold the routes of a later design and need an unplanned reboot.", "A profile validated in the lab is never exercised with the production feature mix."],
    v: "Switch profiles on a lab device, confirm the capacity reported for each table changes as documented, and that a configuration exceeding the new capacity is rejected at apply time.",
    dep: ["table-resource-manager","capability-discovery"]
  },
  "packet-buffer": {
    s: "The shared on-chip memory that holds packets waiting for an output port, divided into pools and per-queue guarantees that decide who may use how much.",
    d: "Packet memory is a small fraction of what a router might have, typically megabytes per chip. It is organized into shared pools with reserved minimums per port or queue and dynamic thresholds that limit one queue's share when the pool is contended. Lossless classes are given headroom to absorb in-flight data after a pause. It is hard because buffer per port per gigabit is tiny, the right sizing depends on traffic patterns, and allocation errors cause either drops from unfair sharing or a pool wasted by reservations.",
    k: ["Shared buffer with dynamic thresholds vs static per-port partitions: shared memory absorbs bursts on any port and allows one hot port to take space, while static partitions are fair and waste space.", "Deep buffers vs shallow: deep buffers absorb bursts and add latency, while shallow ones keep delay low and drop on short congestion."],
    p: ["One congested port takes most of a shared pool and neighbors drop packets despite being idle.", "Lossless headroom is sized for a short cable and overflows on a long link, causing drops in a lossless class."],
    v: "Drive a controlled incast of many senders to one port, and confirm buffer occupancy reaches the configured thresholds, drops occur in the expected queues, and unrelated ports lose nothing.",
    dep: ["queues-and-scheduling","serdes-and-mac-ports"]
  },
  "queues-and-scheduling": {
    s: "Per-port output queues and the scheduler that picks which waiting packet to send next, using strict priority, weighted shares and shaping.",
    d: "Each output port has several queues, usually eight, assigned by traffic class. The scheduler serves strict-priority queues first, then divides the rest by weight, with optional rate shaping per queue or port. Queue depth and drop behavior follow from the buffer profile. Multicast and unicast may use separate queue sets. It is hard because strict priority can starve lower classes, weights are applied to bytes or packets with different results, and configuration must match across hops to behave end to end.",
    k: ["Strict priority vs weighted fair scheduling: strict priority gives minimal delay to critical traffic and can starve others, while weighted sharing guarantees a minimum to each and adds some delay.", "Few queues with coarse classes vs many with fine classes: few queues are simple to manage, while many allow finer isolation and exhaust queue resources."],
    p: ["A high-priority class with no rate limit starves everything below it during a flood.", "Scheduler weights are specified in packets on one platform and in bytes on another, so the same policy gives different shares."],
    v: "Congest a port with traffic in every class and confirm bandwidth shares match the scheduler configuration within a small error, and that strict-priority latency stays below the target.",
    dep: ["packet-buffer","traffic-classification"]
  },
  "traffic-classification": {
    s: "Maps each packet to an internal traffic class and drop precedence using header markings, ACL matches or port defaults, which later queueing stages use.",
    d: "At ingress the chip reads priority markings from the VLAN tag or IP header, looks them up in a map, and assigns an internal class. Policy can override by ACL match or by ingress port. The class selects queue, buffer pool and drop thresholds, and may be rewritten to a marking on egress. It is hard because maps must be consistent between devices, trust boundaries must be defined, and a mistake in the map misplaces traffic in a queue with the wrong behavior.",
    k: ["Trust the markings on ingress vs classify by policy: trusting preserves intent and requires a controlled edge, while policy classification is safe against untrusted hosts and needs rules everywhere.", "Separate maps per port vs one global map: per-port maps handle varied edges and are harder to audit."],
    p: ["Markings from a host are trusted on an access port and the host promotes its own traffic to a lossless class.", "Different devices map the same markings to different classes and policy breaks at the boundary."],
    v: "Send packets with each marking value into each port type and confirm the class and queue assigned from the chip's counters match the documented map, including re-marking on egress.",
    dep: ["acl-tcam","queues-and-scheduling"]
  },
  "pfc-and-flow-control": {
    s: "Link-level mechanisms that let a receiver pause a sender, per class or for the whole link, to avoid drops for traffic that cannot tolerate loss.",
    d: "When a lossless class's buffer use crosses a threshold, the switch sends a pause frame upstream for that class and the neighbor stops sending it until the pause expires or is cleared. Headroom absorbs packets already in flight. A watchdog detects queues paused for too long and drops or ignores pause to break stalls. It is hard because pauses propagate, and a circular dependency or one stuck receiver can freeze large parts of the network, a pause storm.",
    k: ["Lossless classes with pause vs lossy with end-host congestion control: pause avoids drops and risks congestion spreading and deadlock, while lossy designs tolerate loss and need well-behaved endpoints.", "Pause watchdog enabled vs disabled: a watchdog breaks stuck pauses and drops lossless traffic when it fires."],
    p: ["A faulty NIC sends pause continuously and stalls every switch it is reachable from.", "Headroom is miscalculated for cable length and packets are lost in a class that was promised to be lossless."],
    v: "Overload a lossless class in a lab and confirm zero loss with pause frames counted, then stall a receiver and confirm the watchdog triggers within its interval and the rest of the network recovers.",
    dep: ["packet-buffer","traffic-classification","queues-and-scheduling"]
  },
  "ecn-and-early-drop": {
    s: "Marks or randomly drops packets as a queue grows, before it is full, to signal senders to slow down and keep delay and loss low.",
    d: "Active queue management compares queue depth with minimum and maximum thresholds. Between them, packets are marked with a congestion flag, or dropped, with increasing probability. Endpoints that understand the marking reduce their rate. Thresholds are set per queue. It is hard because the right thresholds depend on link speed, traffic mix and endpoint behavior, and mistuned values either mark too late and overflow the buffer or mark too early and waste capacity.",
    k: ["Mark with congestion flags vs drop: marking signals without losing data, but needs capable endpoints, while dropping works with all senders and costs retransmission.", "Instantaneous queue depth vs averaged: instantaneous reacts quickly to microbursts and over-signals, while averaging smooths and responds late."],
    p: ["Thresholds set too high leave the queue full before marking begins and bursts are dropped.", "Endpoints ignore the marks and the switch has to fall back to drops under load."],
    v: "Run a congesting long-lived flow and confirm marking begins at the minimum threshold, the sender reduces its rate, and queue occupancy stabilizes between thresholds without tail drops.",
    dep: ["packet-buffer","queues-and-scheduling","traffic-classification"]
  },
  "counters-and-drop-reasons": {
    s: "Hardware counters per port, queue, table entry and stage that count packets and bytes, with separate categories explaining why packets were discarded.",
    d: "Counters live in on-chip memory and are read through the abstraction layer, then aggregated and exposed by software, often after polling to avoid wrap-around. Port counters include good and bad frames; queue counters show drops and occupancy; drop counters classify reasons such as table miss, ACL, buffer full and TTL exceeded. It is hard because reading thousands of counters is slow, counters have limited width and wrap, and semantics differ by chip, so comparison across platforms needs care.",
    k: ["Poll counters periodically into software vs read on demand: periodic polling provides history and rates, and costs CPU and bus time, while on-demand is cheap and gives no history.", "Fine-grained per-entry counters vs per-port only: per-entry counters explain behavior precisely and use scarce memory, while per-port is cheap and coarse."],
    p: ["A 32-bit byte counter wraps in seconds at high speed and rates computed from it are wrong.", "Different drop reasons on different chips are grouped differently and totals do not match."],
    v: "Send an exactly known number of packets and bytes per port, then confirm the counters show that figure, and that deliberately dropped packets appear under the correct reason with totals reconciling.",
    dep: ["serdes-and-mac-ports","switch-abstraction-api"]
  },
  "buffer-watermarks": {
    s: "Records the peak queue and buffer occupancy over an interval, exposing microbursts that periodic samples of depth would miss.",
    d: "Hardware tracks the maximum occupancy per queue or pool since the last read, and can raise an event when a threshold is crossed. Software reads and clears the values at intervals and exports them. Histograms of depth over time are available on some chips. It is hard because microbursts last microseconds, so only a hardware peak register catches them, and interpretation needs to account for how the window was cleared and who else reads it.",
    k: ["Peak register since last read vs sampled depth: peaks catch bursts that sampling never sees, but the clearing of the register changes what each reader sees.", "Threshold-triggered events vs polling: events point at the exact moment, while polling is simple and can miss it entirely."],
    p: ["Two collectors clear the same watermark register and each sees only part of the peaks.", "Averaged depth looks healthy while microbursts cause regular drops."],
    v: "Inject a short burst that exceeds a queue's threshold between two polls and confirm the watermark records the burst's peak while a sampled depth read shows an empty queue.",
    dep: ["packet-buffer","counters-and-drop-reasons","streaming-telemetry"]
  },
  "platform-description": {
    s: "Data files that describe a particular box: its ports, lane maps, sensors, fans, power supplies and device addresses, so one software image can run on many hardware designs.",
    d: "Each platform ships a description of port naming and lane assignments, breakout options, the bus addresses of sensors, fans and optics, thresholds, and the plugins that read them. At boot the software identifies the box from an EEPROM and loads the matching description. It is hard because the descriptions must be exact: a wrong lane map brings up the wrong port, and a wrong fan address leaves the box with no cooling control.",
    k: ["Data files read at runtime vs compiled per-platform code: data files let one image serve many platforms cheaply, while compiled code can express unusual hardware and multiplies images.", "Description supplied by the hardware vendor vs maintained by the software team: vendor-supplied ones are accurate and ship on their schedule, while team-maintained ones are consistent and drift from the hardware."],
    p: ["A revised board changes a lane polarity and the description from the older revision brings up links that do not train.", "A thermal threshold copied from a similar model is too high for the new chassis."],
    v: "Boot each supported platform and compare every port, sensor, fan and power entry in the description with the actual hardware, confirming each reads a plausible live value and each port links with a known peer.",
    dep: ["inventory-and-eeprom"]
  },
  "fan-and-thermal-control": {
    s: "Reads temperature sensors and adjusts fan speed to keep components within limits, with actions for rising heat such as warnings, power reduction or shutdown.",
    d: "A control loop reads chip, board and optic temperatures and sets fan duty by a curve or controller, accounting for airflow direction and fan failure. When temperatures climb despite full speed, thresholds trigger alarms, lower port power or shut down. Fans are hot-swappable, and a missing or stalled fan changes the curve. It is hard because cooling must keep working when the control CPU is busy or crashed, so a fallback lives in hardware or firmware, and sensors can read wrongly.",
    k: ["Software control loop vs hardware controller: software can use rich inputs and fails with the CPU, while a hardware controller keeps cooling alive independently and is less flexible.", "Quiet curve vs conservative curve: quiet saves noise and power at higher temperatures, while conservative extends component life at a cost in power and sound."],
    p: ["Fans spin the wrong direction for the airflow of the chassis and the chip overheats while sensors read normal.", "A crashed control process leaves the fans at their last, low speed."],
    v: "Block airflow in a lab chamber and confirm temperatures rise, fan speed increases per the curve, alarms fire at the thresholds, and the box shuts down safely before exceeding component limits.",
    dep: ["sensors-and-leds","board-controller-access","platform-description","hardware-watchdog"]
  },
  "power-supply-management": {
    s: "Monitors redundant power supplies for presence, input and output health, load and efficiency, and acts on failures such as removing a supply or reporting lost redundancy.",
    d: "Supplies report status and measurements through a management bus: input and output voltage, current, temperature and fan state. Software correlates them, raises alerts when redundancy is lost, and tracks power budget against the configured modules. Supplies can be hot-swapped, and mismatched airflow or type is detected. It is hard because status bits differ between supplies, a flaky bus can cause false failures, and a brownout can look like an input failure until the pattern is clear.",
    k: ["Alarm on first fault vs debounce: immediate alarms catch real failures quickly and create noise from transient glitches, while debouncing is quiet and delays notice.", "Enforce a power budget vs report only: enforcement prevents overload when a supply fails, but can refuse to power a line card or optic that would have worked."],
    p: ["A supply with the wrong airflow direction is accepted and raises chassis temperature.", "Bus errors are read as a failed supply and an alert wakes someone for a healthy unit."],
    v: "Pull one of two supplies under load and confirm the switch keeps running, reports lost redundancy with the supply identified, and clears the alert when it is reinserted.",
    dep: ["board-controller-access","platform-description","syslog-and-event-log"]
  },
  "optics-management": {
    s: "Detects pluggable transceivers, reads their identity and diagnostics, applies per-module settings and monitors power, temperature and signal quality.",
    d: "Modules have a small management memory read over a serial bus, giving type, vendor, capabilities, calibration and live diagnostics: transmit and receive power, bias current and temperature. Software matches the module to the port's speed, applies tuning and low-power mode, and raises alarms at warning thresholds. Insertion and removal are events. It is hard because module behavior varies, buses are slow and shared, and unsupported or counterfeit modules can fault in subtle ways.",
    k: ["Allow any module vs enforce an approved list: any module keeps costs low and shifts risk to the operator, while approved lists give tested behavior and restrict supply.", "Poll diagnostics often vs rarely: frequent polling catches degradation early and loads a slow bus, while rare polling is cheap and misses short events."],
    p: ["Frequent polling of many modules on one shared bus slows fan and sensor reads.", "A module that falsely reports its type is brought up in the wrong mode and the link never trains."],
    v: "Insert a module and confirm its identity, supported speeds and live power levels appear within seconds, then lower received power with an attenuator and confirm a warning fires at the threshold.",
    dep: ["board-controller-access","bus-drivers","port-manager","platform-description"]
  },
  "sensors-and-leds": {
    s: "Reads voltage, current and temperature sensors and drives the indicator lights that show port, system and fault status on the front panel.",
    d: "Sensors sit on the board and in chips, and are read over management buses through a monitoring daemon that applies scaling, thresholds and hysteresis. Indicator lights are set by software or by hardware logic to show link, activity, system state and locator patterns. Readings are published to the state database. It is hard because values from different chips need calibration, a failed sensor must be distinguished from a failed component, and light patterns must stay meaningful during a fault.",
    k: ["Software-driven lights vs hardware-driven link and activity: hardware-driven indications work even when software is down, while software-driven ones can show richer state.", "Static thresholds vs rate-of-change alarms: static thresholds are simple, while rate alarms catch a failing fan before the limit is reached."],
    p: ["A sensor that sticks at a plausible value hides an actual overheating chip.", "A locator light left on after a repair misleads a technician later."],
    v: "Heat one component in a lab and confirm its sensor reading rises and crosses thresholds in sequence, and that the matching alarms and front-panel indications appear and clear.",
    dep: ["board-controller-access","platform-description","bus-drivers"]
  },
  "board-controller-access": {
    s: "Software access to the small programmable logic and microcontrollers on the board that manage resets, power sequencing, fans, LEDs and presence signals.",
    d: "A board controller exposes registers through a bus such as I2C or a local memory interface. Drivers map them for presence of modules, reset lines, power control, firmware versions and watchdog kicks. It is also where firmware updates for the controller itself are performed. It is hard because these controllers hold the box's recovery behavior, a bad register write can power down a line card, and firmware updates must not be interrupted.",
    k: ["Direct register access from user space vs through a kernel driver: user space is quick to develop and unsafe if multiple processes write, while a driver serializes access and takes longer to change.", "Update controller firmware in service vs offline: in service avoids outage and risks bricking the board, while offline is safer and needs maintenance time."],
    p: ["Two daemons write the same register concurrently and a reset line is toggled unintentionally.", "An interrupted controller firmware update leaves the box unable to power on."],
    v: "Read each board register through the documented interface, toggle a safe output such as a locator light, and confirm the hardware responds, then verify the controller firmware version matches the one expected for the release.",
    dep: ["bus-drivers","platform-description"]
  },
  "inventory-and-eeprom": {
    s: "Reads the identity records stored in the box's memory chips: model, serial number, revision, MAC address range and manufacturing data, and exposes the inventory.",
    d: "Chassis, boards, power supplies, fans and optics each carry a small memory with a formatted record. At boot, software reads it to identify the platform, choose the matching description, assign management addresses and register parts in the inventory. The inventory is exposed for asset tracking and for support. It is hard because the contents are programmed at manufacture and sometimes wrong, and the base MAC address for the whole box comes from here, so errors cause duplicate addresses.",
    k: ["Trust the stored platform identifier vs probe the hardware: the identifier is simple and trusts factory programming, while probing is robust and slower.", "Read once at boot vs on every hot-swap event: once is simple and stale after a part change, while on events keeps inventory accurate and needs hot-plug handling."],
    p: ["Two units programmed with the same MAC range collide on a shared management network.", "A corrupted record is read as valid and the box loads the wrong platform description."],
    v: "Read the records on each part, confirm formats and checksums validate, compare serial numbers with the labels on the hardware, and verify a swapped fan appears in the inventory with its new serial.",
    dep: ["bus-drivers"]
  },
  "hardware-watchdog": {
    s: "A timer in hardware that resets the control CPU or the whole box if software stops refreshing it, recovering from hangs that software cannot recover from itself.",
    d: "Software refreshes the timer periodically, only when its own health checks pass. If the refresh stops, the hardware resets the CPU, with the reason recorded for later. Some designs have multiple stages, from a warning interrupt to a full power cycle. It is hard to pick the timeout and the conditions: too short and a busy box reboots, too long and a hang extends an outage, and the refresh must depend on real health and not only that a timer thread runs.",
    k: ["Refresh from a dedicated thread vs from the main control loop: a dedicated thread is simple and keeps the box alive during a deadlock, while the main loop proves useful work is happening.", "Reset only the CPU vs power-cycle everything: a CPU reset keeps forwarding running, while a full cycle clears more faults and interrupts traffic."],
    p: ["The refresh runs in a thread unrelated to the stuck service, so the watchdog never fires.", "A reboot loop starts because the watchdog fires before the boot finishes."],
    v: "Stop the refresh deliberately and confirm the CPU resets within the timeout, the reboot cause is logged as watchdog, and the box returns to service with forwarding resuming.",
    dep: ["board-controller-access","general-purpose-kernel"]
  },
  "boot-loader": {
    s: "The first software that runs, initializing the CPU and memory, verifying and loading the operating system image, and choosing between installed versions.",
    d: "It starts from read-only storage, configures memory and devices, checks signatures through a chain of trust, picks an image slot from stored markers, and passes control with kernel arguments. It also provides recovery: a prompt over the console, network boot and image install. A secure design keeps the first stage immutable. It is hard because it must be tiny, work with no operating system around, and be nearly impossible to update safely in the field, so mistakes in it are costly.",
    k: ["Verified boot with signature checks vs open boot: verified boot stops tampered images and requires key management and signed builds, while open boot is flexible and unprotected.", "Network boot recovery enabled vs disabled: it rescues a bricked box remotely and adds attack surface at the earliest stage."],
    p: ["The boot loader's configuration is lost and the box stops at a prompt in a remote site.", "A revoked key is still accepted because the revocation list lives in an updatable region that was never refreshed."],
    v: "Boot with a valid image, then an image with a bad signature, and confirm the second is rejected and the box falls back to the previous version, with both outcomes visible on the console.",
    dep: ["flash-storage"]
  },
  "general-purpose-kernel": {
    s: "The operating system kernel running on the control CPU: scheduling, memory, processes, filesystems, networking and device drivers, shared by all control-plane software.",
    d: "It provides the process and isolation primitives the supervisor and containers rely on, the drivers for the ASIC, buses and storage, and the network stack used for management. It is configured and trimmed for the platform, with a long-term maintained version. It is hard because kernel updates change behavior that routing and drivers depend on, real-time needs of protocols compete with background work, and a kernel panic takes down the entire control plane at once.",
    k: ["Stock general-purpose kernel with patches vs a custom kernel: stock is maintained and secure, while custom code fixes platform needs and falls behind on updates.", "Preemptible scheduling for responsiveness vs throughput-oriented: preemption keeps protocol timers on time and costs some throughput."],
    p: ["A kernel upgrade changes a network stack behavior and breaks a daemon that relied on the old one.", "Memory pressure invokes the out-of-memory killer, and it terminates a critical daemon."],
    v: "Boot the kernel on each platform, run a stress workload alongside protocol sessions and confirm timers stay within tolerance and a deliberate panic produces a core record and a clean automatic reboot.",
    dep: ["boot-loader","asic-driver-and-dma","bus-drivers"]
  },
  "kernel-network-stack": {
    s: "The operating system's own networking code, used by management traffic, local services and tools, and fed by punted packets through interfaces that mirror switch ports.",
    d: "Switch ports are represented as network interfaces, so packets trapped to the CPU enter the stack with their ingress port, and packets sent by local services leave through the CPU port. The stack runs the management interface, terminates secure shells and management APIs, answers pings and holds sockets for routing daemons. It has its own routing and neighbor tables. It is hard because it was designed for hosts, not for hundreds of ports, and its performance and table limits differ from the hardware's.",
    k: ["Use the kernel stack for control traffic vs a user-space stack: the kernel stack is mature and works with standard tools, while a user-space stack is fast and needs its own tooling.", "One interface per port vs a single interface with metadata: per-port interfaces are simple for tools and costly at hundreds of ports."],
    p: ["Hundreds of interfaces slow down enumeration and a tool that lists them times out.", "A kernel setting such as reverse-path filtering drops legitimate protocol packets arriving on an unexpected port."],
    v: "Ping the switch's address from a host on a front-panel port and confirm the reply arrives, the packet appears on the matching kernel interface, and the management and data stacks do not leak into each other.",
    dep: ["general-purpose-kernel","cpu-port","asic-driver-and-dma"]
  },
  "asic-driver-and-dma": {
    s: "The kernel driver that maps the chip's registers and memory into software, moves packets between the chip and host memory by DMA, and handles its interrupts.",
    d: "The chip appears on a high-speed peripheral bus. The driver maps its register space and sets up descriptor rings for packets to and from the CPU port, as well as event queues and interrupt vectors. The vendor adapter calls into it for table writes. It must survive restarts of user-space software without resetting the chip when warm restart is used. It is hard because a bug here corrupts memory or hangs the bus, DMA rings must be sized for bursts, and interrupt storms can freeze the CPU.",
    k: ["Kernel driver vs user-space driver with direct memory access: a kernel driver is safe and standard, while a user-space driver cuts latency and risks crashes that go undiagnosed.", "Interrupt-driven receive vs polling under load: interrupts are efficient at low rates, while polling avoids storms and burns CPU when idle."],
    p: ["DMA descriptors are freed early and the chip writes into reused memory.", "A user-space restart resets the driver state and the chip with it, destroying warm restart."],
    v: "Send packets to the CPU port at the maximum supported rate and confirm none are lost beyond the counted drops, and restart the user-space process while forwarding continues without resetting the chip.",
    dep: ["general-purpose-kernel"]
  },
  "bus-drivers": {
    s: "Drivers for the small serial buses and general-purpose pins that connect the CPU to sensors, optics, fans, EEPROMs and board controllers.",
    d: "Slow serial buses with addressing and multiplexers connect dozens of devices to the CPU, and the drivers provide transactions with timeouts and retries. Pins signal presence, interrupts and resets. Multiplexed buses must be selected before a device is reached, so access must be serialized. It is hard because a single misbehaving device can hold a bus line and block everything on it, and many daemons contend for the same bus.",
    k: ["One shared bus with arbitration vs separate buses for critical devices: shared buses save board space and let a slow reader delay everything, while separate buses isolate fan control from optics polling.", "Kernel-managed access vs direct user-space access: kernel access serializes safely, while direct access is easy and invites conflicts."],
    p: ["A module that holds the data line low blocks fan control reads, and the box loses cooling feedback.", "Concurrent access without locking reads another device's data after a multiplexer switch."],
    v: "Read every device on every bus repeatedly while another process polls optics, and confirm no read returns data from the wrong device and no transaction exceeds its timeout.",
    dep: ["general-purpose-kernel"]
  },
  "flash-storage": {
    s: "The persistent storage holding images, configuration and logs, with a filesystem and wear management suited to flash that has limited write cycles.",
    d: "Storage is flash or similar, partitioned into boot, image slots, configuration and log areas. Filesystems are chosen for power-fail safety and wear leveling, and logs may go to memory to save writes. Free space and health are monitored. It is hard because flash wears out under heavy writes, power loss during a write can corrupt data, and a full filesystem breaks configuration save and core capture just when needed.",
    k: ["Journaling filesystem on flash vs a flash-aware filesystem: journaling is widely tested and wears flash unevenly, while flash-aware designs level wear and are less common.", "Writing logs to flash vs keeping them in memory: flash keeps evidence across reboots and wears out, while memory is free of wear and loses it."],
    p: ["Debug logging at high volume exhausts write endurance within a year.", "A configuration write interrupted by power loss leaves a truncated file and the box boots with defaults."],
    v: "Cut power repeatedly during configuration saves and confirm the box always boots with either the old or new configuration, never a partial one, and check wear indicators stay within the projected budget.",
    dep: ["general-purpose-kernel","boot-loader"]
  },
  "time-sync": {
    s: "Keeps the switch's clock accurate using network time protocols or a hardware timestamping protocol, so logs, telemetry and security checks agree across devices.",
    d: "A time daemon synchronizes the system clock to servers over the network, with the real-time clock holding time across power loss. Precision protocols use hardware timestamps at the port and a hardware clock in the chip to reach sub-microsecond accuracy, and the switch can act as a boundary clock for neighbors. It is hard because time errors break log correlation and certificate validity, a switch whose clock jumps confuses timers, and hardware timestamping needs support from every device on the path.",
    k: ["Network time protocol vs precision hardware timestamping: network time is easy and good to milliseconds, while hardware timestamping reaches nanoseconds and needs support in every hop.", "Step the clock vs slew it gradually: stepping corrects quickly and breaks timers, while slewing is smooth and slow."],
    p: ["The clock starts at a default date and the first logs and certificate checks are wrong.", "An asymmetric path delay skews precision time by microseconds and nothing alerts."],
    v: "Compare the switch's clock with a reference after an hour and after a reboot, confirming offset is within the stated tolerance, and check log timestamps from two switches align on a shared event.",
    dep: ["general-purpose-kernel","kernel-network-stack"]
  }
});
