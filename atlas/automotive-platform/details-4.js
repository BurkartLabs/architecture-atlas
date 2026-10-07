// Details for the automotive platform, part 4: network, virtualization, hardware, cross-cutting concerns.
ATLAS.details("automotive-platform", {
  "can-bus": {
    s: "A two-wire multi-node broadcast bus with priority-based arbitration, carrying short control messages at up to a few megabits per second, still the backbone for most signals.",
    d: "Every node sees every frame; the identifier sets priority and meaning, and arbitration lets the lowest identifier win without collisions. Classic frames carry eight bytes; the flexible-data-rate variant carries sixty-four at a faster data phase. Errors are detected by CRC and counters, and faulty nodes disconnect themselves. Bus load is planned so worst-case latency stays bounded. The difficulty is bandwidth, no built-in security and the many hand-maintained message databases.",
    k: ["Event-triggered priority arbitration vs time-triggered schedules: low latency for urgent messages and simple design; worst-case latency analysis depends on load.", "Flexible data rate vs classic frames: far more data per frame; requires new transceivers and tighter signal quality."],
    p: ["Bus load above about half the capacity makes low-priority messages miss deadlines under error retransmission.", "Any node can send any identifier, so a compromised node can impersonate a brake controller."],
    v: "Load a test bus to its design maximum with error injection and confirm every message meets its worst-case latency in a measurement with a bus analyzer.",
    dep: ["microcontroller-abstraction"]
  },
  "lin-bus": {
    s: "A low-cost single-wire master-slave bus for slow, simple devices like switches, seats, mirrors and rain sensors.",
    d: "One master controls a schedule table and polls each slave in turn, and the slave replies in its slot. Rates are up to twenty kilobits per second and slaves can use simple clock sources. The master is usually a body or door controller bridging to a faster bus. Its value is cost and wiring simplicity for many small nodes. The difficulty is limited diagnostics, no collision handling because of the schedule, and long schedule tables that delay response.",
    k: ["Master-driven schedule vs peer-to-peer arbitration: very cheap slaves and predictable timing; slow reaction and a master that is a single point of failure.", "Many simple LIN nodes vs fewer smart devices on CAN: lowest part cost; more nodes to supply and diagnose."],
    p: ["A slave that holds the bus low blocks all nodes on that segment.", "A schedule table that polls rarely used slaves at high rate wastes the limited bandwidth."],
    v: "Disconnect a slave on a test segment and confirm the master detects its missing response within the schedule period, reports the fault code and keeps polling the rest.",
    dep: ["microcontroller-abstraction","central-gateway"]
  },
  "flexray-bus": {
    s: "A deterministic time-triggered bus with a static schedule and fixed slots, used in some chassis and powertrain systems before Ethernet took over.",
    d: "Communication proceeds in fixed cycles divided into static slots, each owned by one node, and a dynamic segment for event messages. Two channels allow redundancy. Nodes share a precise clock, giving jitter in microseconds. It was adopted for safety-critical X-by-wire function groups. It is being replaced because of cost, a complex tool chain and limited bandwidth compared with Ethernet. The difficulty is global schedule design, since any change affects all nodes.",
    k: ["Time-triggered static schedule vs event-triggered arbitration: guaranteed latency and jitter; any change reconfigures the whole network.", "Dual redundant channels vs single: tolerates a channel loss; doubles wiring and transceivers."],
    p: ["A schedule change by one supplier invalidates timing assumptions of all the others on the bus.", "Few engineers and tools remain, so maintenance of old platforms becomes costly."],
    v: "Cut one channel on a test network and confirm the nodes continue to communicate on the other within the specified time and report the redundancy loss.",
    dep: ["time-synchronization"]
  },
  "automotive-ethernet": {
    s: "Switched Ethernet over a single twisted pair, at one to ten gigabits, carrying cameras, service traffic, diagnostics and software downloads.",
    d: "Point-to-point links connect nodes to switches, with a physical layer designed for vehicle noise and cable. Higher layers are standard: IP, VLANs for separation, and protocols for service communication. Traffic classes share links with bandwidth reservation and priority. Switches enforce segmentation and may filter. It scales bandwidth for sensors and centralized compute. The difficulty is the real-time guarantees, the switch configuration and testing of every combination of cable, connector and electrical conditions.",
    k: ["Switched Ethernet backbone vs shared buses: bandwidth and standard tools; more cost per node and a heavier network to configure.", "VLANs and policing per traffic class vs a flat network: contains faults and attacks; configuration complexity rises quickly."],
    p: ["A flood of non-critical traffic on a shared link delays control messages without time-sensitive switching.", "Cable and connector degradation causes intermittent link drops that are hard to reproduce."],
    v: "Saturate a link with background video while a control stream runs, and measure that the control stream's latency and loss remain within its specification across thermal and vibration conditions.",
    dep: ["tsn-switching","central-gateway"]
  },
  "multidrop-ethernet": {
    s: "A ten megabit Ethernet variant on a shared two-wire bus for cheap sensors and small nodes, bringing IP communication to the edge of the network.",
    d: "Several nodes attach to a single twisted pair, with transmit opportunities assigned by a coordinator for predictable latency. It replaces slow buses where more bandwidth is needed and carries IP all the way to simple devices, removing protocol gateways. Typical use is a zone's sensors, lighting or door modules. It is hard because the technology is new, the supplier base is small, and mixed bus and point-to-point design rules are still settling.",
    k: ["A shared multidrop segment vs point-to-point links: less wiring and cheap ports; shared bandwidth and a bus to analyze.", "IP at the sensor vs gateway-translated signals: uniform software and diagnostics; more processing and code at tiny nodes."],
    p: ["Too many nodes on the segment reduce the signal quality and give intermittent failures.", "Assuming all node types support the same security features leaves some devices unprotected."],
    v: "Attach the maximum number of nodes at the longest specified stub length and confirm that frame loss stays under the limit and each node meets its latency bound.",
    dep: ["zonal-controller","automotive-ethernet"]
  },
  "tsn-switching": {
    s: "Standards extensions that give Ethernet bounded latency: scheduled transmission windows, traffic shaping, frame preemption and redundant paths.",
    d: "Switches and end stations share a synchronized clock and a schedule that opens gates for each traffic class, so a control frame never waits behind a large frame. Other mechanisms limit the rate of each stream, preempt long frames and send duplicates over separate paths. A configuration tool computes schedules for all links. It makes Ethernet usable for control and safety loops. The difficulty is computing and updating the schedule across the whole network and verifying it with measurement.",
    k: ["Time-aware scheduling vs priorities only: provable worst-case latency; a central schedule that must be recomputed with every change.", "Redundant streams on disjoint paths vs a single path: survives a link failure with no gap; doubles bandwidth use."],
    p: ["Clock sync lost on one switch opens gates at wrong times and delays the protected traffic.", "A late-added stream not in the schedule ends up in a best-effort class and misses its deadline."],
    v: "Run protected control streams together with maximum background load across a multi-switch path, and measure that the end-to-end latency and jitter of each stream stay within the computed bounds.",
    dep: ["time-synchronization","automotive-ethernet"]
  },
  "time-synchronization": {
    s: "Distributes a common clock across controllers and networks so timestamps, sampling and scheduled actions line up.",
    d: "A grandmaster, usually fed by satellite time or the cellular network, sends timing messages over Ethernet using a precision protocol, and each hop corrects for its delay. Bridges convert this to time on other buses with a time-base manager. Applications then read synchronized time. Uses include sensor fusion, scheduled switching, logging and security freshness. The difficulty is accuracy through many hops, holdover when the master is lost, and handling jumps when the master changes.",
    k: ["Network-wide synchronized clock vs local clocks with offset estimates: sub-microsecond precision for fusion and scheduling; added hardware timestamping and failure modes.", "Satellite-based grandmaster vs a vehicle-internal master: absolute time with a global reference; unavailable in tunnels and garages."],
    p: ["A time jump when the master switches causes applications to see negative intervals.", "Software timestamps taken in an interrupt handler add jitter that destroys the precision."],
    v: "Compare timestamps for a common pulse on two controllers on different networks and confirm the offset is below the specified bound, including after the grandmaster is disconnected for ten minutes.",
    dep: ["automotive-ethernet"]
  },
  "central-gateway": {
    s: "The controller that connects the vehicle's separate networks, forwarding allowed messages between them, isolating domains and mediating external access.",
    d: "It terminates buses and Ethernet segments, routes signals between them with translation of formats, and applies filters so that, for example, infotainment cannot send chassis messages. It hosts the diagnostic port and the link to the telematics unit, runs part of the update orchestration and intrusion detection, and often has a hardware security module. It must stay robust since every function passes through it. The difficulty is throughput, latency and being the most attractive target in the vehicle.",
    k: ["Central gateway with strict filters vs flat network: strong domain isolation and one place for policy; a bottleneck and single point of failure.", "Signal-level routing vs frame forwarding: translation across protocols and rates; more processing and a larger configuration."],
    p: ["A routing table error forwards a body message into the chassis network.", "Gateway failure takes down diagnostics, updates and every cross-domain function at once."],
    v: "Send forbidden and permitted messages from the infotainment domain toward the chassis domain, and confirm only the permitted ones appear on the target bus, with the denied ones counted and logged.",
    dep: ["can-bus","automotive-ethernet","access-control-policy"]
  },
  "zonal-controller": {
    s: "A controller placed in a physical region of the vehicle that connects nearby sensors and actuators and aggregates them onto a high-speed backbone to central computers.",
    d: "Instead of running wires from each device to a function-specific controller, devices connect to the nearest zone controller, which acts as a gateway and power distributor and may host simple functions. It reduces harness length and weight and lets functions move to central compute. It carries power switching, protection fuses in electronic form and local I/O. The difficulty is that it concentrates many functions, so its failure has a larger effect, and software must be generic across what is attached.",
    k: ["Zonal wiring with central compute vs domain controllers per function: shorter and lighter harness, flexible function placement; a more complex software and safety architecture.", "Zone controllers with smart power distribution vs separate fuse boxes: remote diagnosis and reconfiguration; adds heat and software to the power path."],
    p: ["A zone controller failure disables unrelated functions that share it, including redundant ones if wired together.", "Moving a function to central compute adds network latency its control loop cannot tolerate."],
    v: "Disconnect a zone controller's backbone link in a test vehicle and confirm local safety functions continue in their defined mode and the central system reports the zone lost within the specified time.",
    dep: ["automotive-ethernet","smart-sensors-and-actuators","power-supply-and-wake"]
  },
  "network-management-and-sleep": {
    s: "Coordinates which controllers on a network must stay awake, and when the whole network may enter low-power sleep and how it wakes.",
    d: "Each node announces that it needs the network while it has work, using a heartbeat message or a pin. When no node requests the network for a time, all nodes enter a ready-to-sleep phase and then switch off their transceivers, drawing microamps. A wake-up comes from a bus signal, a pin or a timer. Partial networking lets only needed nodes wake. The difficulty is that a single node holding the network awake drains the battery, and finding it is a lab-intensive search.",
    k: ["Distributed network management messages vs a master that decides: robust to any node leaving; more traffic and cases to analyze.", "Partial networking vs whole-network wake: lower energy; more complex configuration and testing of wake reasons."],
    p: ["A node that wakes the network by mistake, or never releases it, causes a flat battery after a few days.", "Wake-up reasons are not recorded, so field returns for battery drain cannot be diagnosed."],
    v: "Park a test vehicle, measure the total standby current after the network sleep time, and confirm it is under the limit, then wake it by each defined source and confirm the correct nodes wake.",
    dep: ["ecu-state-manager","can-bus"]
  },
  "hypervisor": {
    s: "A thin software layer that runs several operating systems on one processor, each in its own virtual machine with isolated memory and assigned devices.",
    d: "A type-one hypervisor runs on the bare processor with hardware virtualization support. It assigns cores, memory regions and peripherals to guests, handles interrupts and provides a minimal set of services. A safety guest and a general-purpose guest can coexist, with the hypervisor preventing one from reading or crashing the other. It is itself part of the safety argument and kept small. The difficulty is overhead, latency of interrupts, sharing a GPU or network and building a tiny, verifiable layer.",
    k: ["Static partitioning with fixed cores and memory vs dynamic resource sharing: strong isolation and predictable timing; wastes capacity.", "Small certified hypervisor vs general-purpose virtualization stack: fits a safety case; fewer features and device models."],
    p: ["Interrupt routing through the hypervisor adds latency that violates a driver's real-time deadline.", "Shared devices like the GPU or flash become a covert channel for interference between guests."],
    v: "Crash one guest operating system deliberately, and confirm the other guests keep running with no missed deadlines and the hypervisor restarts or reports the failed guest.",
    dep: ["central-compute","mixed-criticality-partitioning"]
  },
  "mixed-criticality-partitioning": {
    s: "The allocation of functions with different safety and security levels to separate partitions with budgets for time and memory enforced by the platform.",
    d: "Each partition receives a fixed memory region, a processor time window or a share of cores, and a defined list of communication channels. The hypervisor or kernel enforces them, so a runaway guest consumes only its own budget. High-criticality functions such as the instrument cluster run in protected partitions while an app environment runs freely beside it. The difficulty is deciding how to divide the machine and what the partitions can share, since each shared resource weakens the separation.",
    k: ["Time-partitioned schedule vs priority-based sharing: guaranteed windows and simple analysis; a fixed schedule wastes idle slots.", "Many small partitions vs few large ones: finer fault containment; more communication overhead and configuration."],
    p: ["Partition budgets set from average use fail in a worst-case moment when two partitions spike together.", "A shared cache lets one partition slow another even with perfect memory isolation."],
    v: "Run a worst-case load in every partition at once and confirm each critical partition gets its configured budget, and the monitoring shows no budget violation or deadline miss.",
    dep: ["hypervisor","inter-vm-communication"]
  },
  "virtual-device-sharing": {
    s: "Lets several guests use one physical device such as a network port, storage or audio hardware through virtual interfaces mediated by a backend driver.",
    d: "A privileged service owns the hardware and offers a standardized virtual device to each guest, which uses a front-end driver. Data moves through shared memory queues with notifications. The backend multiplexes requests, enforces limits and can fall back when a guest is slow. Some hardware supports direct assignment with hardware partitioning of the device. The difficulty is performance overhead, fairness and keeping a faulty guest from corrupting the shared device.",
    k: ["Paravirtual standard devices vs passthrough of hardware: portable guests and sharing; some overhead and a trusted backend.", "Hardware-partitioned devices vs software multiplexing: near native speed and isolation; limited to hardware that supports it."],
    p: ["A backend driver crash takes the shared device away from every guest at once.", "A guest that floods the virtual network queue starves the other guests of bandwidth."],
    v: "Run two guests that each stream at full rate through one physical network port, and confirm each gets its configured share, then crash one and confirm the other keeps its throughput.",
    dep: ["hypervisor","inter-vm-communication"]
  },
  "gpu-virtualization": {
    s: "Shares the graphics processor among guests so the instrument cluster and the infotainment display can both render without interfering.",
    d: "Approaches include assigning the GPU's hardware contexts to guests, time-slicing the whole device, or running rendering in one guest that serves others through remote buffers. Safety content needs guaranteed share and a way to reset the GPU without affecting everyone. Buffers pass to the display controller through the compositor. The difficulty is that GPUs are complex and weakly isolated, so a hung shader from one guest can stall all and a safety case is hard to build.",
    k: ["Hardware GPU partitioning vs software time-slicing: isolation and predictable share; depends on silicon support.", "A separate GPU for safety displays vs sharing: independent failure and simple argument; extra silicon, power and cost."],
    p: ["A shader that never finishes in the infotainment guest freezes the cluster's frame.", "Resetting the GPU after one guest's hang blanks every display for seconds."],
    v: "Run a deliberately endless shader in the infotainment guest and confirm the cluster's refresh stays at its rate, the offending context is killed, and other contexts continue within a bounded stall.",
    dep: ["hypervisor","virtual-device-sharing"]
  },
  "inter-vm-communication": {
    s: "Message and shared-memory channels between guests, and between guests and the hypervisor, with controlled endpoints and bounded copying.",
    d: "Channels are declared statically, each with a source, destination, queue size and permitted direction. Data moves via shared memory rings with notification by virtual interrupt, or through the hypervisor. They carry vehicle signals from the safe partition to the apps partition, display buffers, audio and diagnostic traffic. Checks validate sizes and contents on the receiving side. The difficulty is a safe interface: the lower-integrity side must never be able to corrupt or stall the higher-integrity side through it.",
    k: ["One-way channels with validation vs bidirectional general channels: simple argument that the safe side is protected; some use cases need workarounds.", "Zero-copy shared buffers vs message copies: low latency and CPU load for video and audio; complex ownership and error handling."],
    p: ["A receiver that trusts a length field from another partition is exploitable by it.", "A full queue blocks the sender in the safety partition, turning an apps problem into a safety fault."],
    v: "Send malformed and oversized messages from the low-integrity guest and confirm the receiving side rejects them, counts them, and never blocks or crashes.",
    dep: ["hypervisor","mixed-criticality-partitioning"]
  },
  "posix-operating-system": {
    s: "A general-purpose multi-process operating system with files, sockets and threads, run on high-performance computers for applications that need a full software ecosystem.",
    d: "It provides process isolation, scheduling with real-time classes, a network stack, filesystems and drivers, using a standard interface so large bodies of software run on it. Variants for vehicles trim the kernel, harden configuration and may have a microkernel structure for safety. It runs as a guest under the hypervisor or directly on the hardware. The difficulty is determinism and bounded latency, a large codebase to secure and keeping up with security fixes for a decade.",
    k: ["Full general-purpose kernel vs microkernel with user-space drivers: rich ecosystem; larger trusted code and weaker timing guarantees.", "Long-term supported fixed version vs rolling upgrades: stability and a bounded validation scope; accumulating vulnerabilities."],
    p: ["A real-time thread with default scheduling gets delayed by a background job holding a lock.", "Kernel security fixes backported for years by a small team fall behind published vulnerabilities."],
    v: "Measure the scheduling latency of a real-time thread under heavy CPU, storage and network load for several hours, and confirm the maximum latency stays below the budget.",
    dep: ["hypervisor","boot-chain"]
  },
  "boot-chain": {
    s: "The ordered sequence from power-on to a running system: silicon ROM code, bootloaders, hypervisor, operating systems and applications, each verified and started by the previous.",
    d: "ROM code initializes the minimum hardware and loads the first stage from flash after verification. Later stages set up memory, security configuration and devices, then start the hypervisor and guests. Start order matters for deadlines: a rear camera or a cluster warning must appear within about two seconds while the rest continues to boot. Techniques include snapshot boot and parallel start. The difficulty is meeting time targets with signature checks and keeping each stage's configuration consistent.",
    k: ["Staged fast boot of critical guests vs sequential full start: the safety display is up immediately; more complex dependencies and testing.", "Suspend-to-memory vs cold boot every time: instant resume; keeps power draw and leaves memory contents at risk."],
    p: ["An update changes one stage's size and pushes the cluster's first frame past the legal limit.", "A stage that fails verification without a recovery path leaves a black screen."],
    v: "Measure from ignition to first cluster frame and to rear camera image across a hundred cold starts at low temperature, and confirm every one meets the specified time.",
    dep: ["secure-boot","bootloader","central-compute"]
  },
  "ecu-hardware": {
    s: "The circuit board and enclosure of a controller: processor, memory, power supply, bus transceivers, drivers and connectors, designed for heat, vibration and a decade of use.",
    d: "A typical unit has a microcontroller, voltage regulators, communication transceivers, signal conditioning for sensors and power stages for actuators, with protection against load dump, reverse polarity and electrostatic discharge. Parts are qualified for automotive temperature ranges and long supply. The software team depends on documented hardware behavior and diagnostics such as open-load detection. The difficulty is cost at volume, component shortages that force changes, and hardware revisions that software must support.",
    k: ["Single-source custom part vs multiple compatible parts: best fit and price; supply risk when one source fails.", "Specification margin vs cost-optimized design: robust to temperature and aging; adds cost across millions of units."],
    p: ["A substitute part with slightly different timing breaks software that was validated on the original.", "Thermal limits reached only inside a closed enclosure on a hot day cause throttling and resets."],
    v: "Run the unit through a thermal cycling and vibration test while exercising all functions, and confirm there are no unexpected resets, communication errors or out-of-tolerance outputs.",
    dep: ["power-supply-and-wake","safety-microcontroller"]
  },
  "central-compute": {
    s: "A high-performance computer combining powerful application processors, accelerators, memory and networking, hosting many functions that used to run on separate controllers.",
    d: "It contains a multi-core application processor with a graphics unit and neural accelerators, plus an integrated safety microcontroller for monitoring and hard real-time work, connected to Ethernet switches. It runs a hypervisor and several guests, drawing tens to hundreds of watts and needing liquid or large passive cooling. Several may share a vehicle for redundancy. The difficulty is thermal design, power, supply of advanced chips, and software migration from many small units.",
    k: ["One or two central computers vs several domain computers: fewer boxes, flexible placement; a bigger blast radius and harder supplier split.", "Fixed accelerator architecture vs upgradeable modules: lower cost per vehicle; cannot follow faster machine learning progress."],
    p: ["Thermal throttling in a hot parked cabin degrades functions only in summer conditions.", "A chip family goes end-of-life before the vehicle line does, and the software must be ported."],
    v: "Run the full function load at the maximum ambient temperature in a climate chamber for hours, and confirm that clocks, latency and function outputs remain within specification without throttling that breaks deadlines.",
    dep: ["safety-microcontroller","power-supply-and-wake"]
  },
  "safety-microcontroller": {
    s: "A microcontroller with built-in safety features such as lockstep cores, error-correcting memory, a memory protection unit and a security module, for real-time and safety-relevant control.",
    d: "It combines real-time cores, flash, RAM, converters, timers and bus controllers with diagnostic features that detect hardware faults and a safety manual describing what the manufacturer guarantees. Multicore variants run separate integrity levels with protection between cores. Software must configure and use the diagnostics correctly. The difficulty is long-term supply, vendor-specific features that tie software to the chip, and errata discovered after launch.",
    k: ["Safety-certified microcontroller vs general part with software diagnostics: hardware does the detection and eases the argument; higher part price and fewer choices.", "Multiple cores with mixed integrity vs separate chips: lower cost and faster communication; interference between cores must be proven absent."],
    p: ["Safety mechanisms that are present in silicon but not enabled in the initialization code provide no protection.", "An erratum in a flash controller appears only after fleet-scale use."],
    v: "Enable and trigger each hardware safety mechanism on a test unit using fault injection and confirm the error is detected, signaled and handled by the software within the safety manual's specified time.",
    dep: ["power-supply-and-wake"]
  },
  "smart-sensors-and-actuators": {
    s: "Sensors and drivers with their own electronics that condition signals, self-diagnose and communicate over a serial link, rather than delivering raw analog values.",
    d: "A smart sensor digitizes, calibrates and linearizes a measurement, adds error checks and reports it over a serial bus with a status field. Smart actuators accept commands and report position, current and temperature, protecting themselves from overload. Smart power switches replace fuses and relays with diagnostic feedback. They reduce wiring and load on the controller. The difficulty is the many protocols, firmware inside the devices that must be supplied, versioned and updated, and trusting what their internal diagnostics say.",
    k: ["Smart devices with serial links vs analog sensors on the controller: better diagnostics and less wiring; more firmware to maintain and update.", "Redundant sensor elements within one device vs two separate devices: compact; a common-cause fault in the package affects both."],
    p: ["A sensor's own firmware defect is outside the vehicle maker's tooling and update process.", "A status field ignored by the receiver lets a degraded value be used as if it were good."],
    v: "Disconnect a sensor and inject out-of-range values on a test unit, and confirm the controller reads the status, flags the signal invalid and uses its substitute value.",
    dep: ["ecu-hardware","microcontroller-abstraction"]
  },
  "power-supply-and-wake": {
    s: "Power distribution, voltage regulation and low-power modes for controllers, including supervision of voltage and clean power-up and shutdown.",
    d: "The low-voltage network is fed by a battery and a converter, and distributed through fuses or electronic switches. Each controller has regulators and supervisors that reset it on under-voltage and protect against spikes. Wake-up lines and bus transceivers allow near-zero current in sleep. Redundant supplies feed safety functions such as braking and steering. The difficulty is cold-cranking voltage dips, standby current budgets across dozens of nodes and keeping the safety functions powered after a single fault.",
    k: ["Redundant power paths for safety functions vs single feeds: tolerate a supply fault; extra cost and wiring.", "Electronic fuses with software control vs conventional fuses: remote reset and diagnostics; the software becomes part of power safety."],
    p: ["A voltage dip during engine start resets controllers at the moment functions are needed.", "A small standby current in each of fifty controllers adds up and empties the battery over weeks."],
    v: "Apply the standard cold-crank and load-dump voltage profiles to a unit, and confirm it keeps operating or resets cleanly and restarts to a valid state within the specified time without corrupting data.",
    dep: ["wiring-harness-topology"]
  },
  "wiring-harness-topology": {
    s: "The physical layout of cables, connectors, power and data links between all controllers, sensors and actuators, which fixes the network and zone structure.",
    d: "The harness is among the heaviest and costliest parts of a vehicle and is mostly assembled by hand. Its topology, domain-based, zonal or hybrid, decides how many controllers there are and where, how long cables run and how failures propagate. Network and power layout are designed together. Connectors and routing affect electromagnetic compatibility and reliability. The difficulty is that it is fixed early and changing it late means retooling, while software requirements keep changing.",
    k: ["Zonal topology vs domain topology: shorter and lighter harness with simpler assembly; more complex software and a concentrated failure mode.", "Redundant ring links vs single links: survive a cut or connector failure; extra weight, cost and design."],
    p: ["A late function that needs a new signal path forces a harness revision across every variant.", "A connector with too many pins on the same node concentrates a single mechanical fault."],
    v: "Check the physical harness against the design with an automated continuity and insulation test on every unit, and compare a vehicle's measured network topology with the intended one.",
    dep: []
  },
  "variant-and-configuration-management": {
    s: "The way options, markets, hardware revisions and supplier versions are expressed and combined so each vehicle gets a valid, tested software set.",
    d: "A vehicle's configuration is a product of options, regions, hardware and software versions. Teams control it through feature models, option codes, coding data, calibration sets and compatibility matrices, and generate builds and test plans from them. Valid combinations are stated explicitly. The effect reaches every layer: the signal catalog, diagnostics, updates and safety cases all depend on it. The difficulty is that combinations multiply faster than anyone can test and records drift from reality.",
    k: ["Feature model with generated variants vs hand-managed branches: scalable and checkable; needs a modeling culture and tooling.", "Run-time configuration of one binary vs build-time variants: one artifact to validate; unused code ships and every combination is reachable."],
    p: ["An invalid combination permitted by the configuration tool is first found in a customer's vehicle.", "Variant records edited by hand in workshops diverge from the backend registry."],
    v: "Generate the complete list of valid configurations from the model, sample combinations across the coverage criteria, and confirm each builds and passes its derived test set, with no invalid combination buildable.",
    dep: ["variant-coding","software-inventory-registry","calibration-data-sets"]
  },
  "long-lifecycle-support": {
    s: "Keeping a platform buildable, secure and updatable for fifteen years or more, long after components, tools and suppliers have changed or disappeared.",
    d: "Vehicles are developed for years, produced for several more, and driven for over a decade, with legal requirements for spare parts and security updates. It affects component choice, archiving of toolchains, certificate and key lifetimes, long-support operating systems, storage of calibration and test evidence, and the ability to patch a controller whose vendor no longer exists. The difficulty is that technology and attack techniques move much faster than the product does.",
    k: ["Long-support frozen components vs frequent upgrades: fewer validation cycles; accumulating unpatched vulnerabilities.", "Own the toolchain archive vs rely on suppliers: can rebuild any release; costs storage, licenses and effort."],
    p: ["A compiler or tool that can no longer run on current computers makes an old release impossible to rebuild.", "A certificate chain expiring before the vehicles' end of life stops secure updates."],
    v: "Take a release from ten years ago, rebuild it from the archive on a clean machine, and confirm the binary hash matches the archived one, then sign and install it on a vintage test unit.",
    dep: ["software-inventory-registry","vehicle-identity-pki"]
  },
  "timing-and-determinism": {
    s: "The decision to guarantee that control functions meet deadlines in every operating condition, by analysis and monitoring rather than by testing average behavior.",
    d: "Control loops, bus messages and service calls have deadlines tied to physics, such as braking or injection timing. Teams assign each function a timing budget, analyze task schedules and network latency end to end, use time-triggered or priority-ceiling designs, and monitor deadlines at run time. The decision shapes the OS, the buses, the use of caches and multicore, and how much dynamic behavior is allowed. The difficulty is that shared resources in modern chips make worst cases hard to bound.",
    k: ["Static scheduling and analysis vs dynamic adaptive scheduling: provable bounds; wasted capacity and rigid change.", "End-to-end latency budgets vs per-component limits: reflect what the function needs; need cross-team ownership of the chain."],
    p: ["A cache or bus contention effect shows only with a certain combination of loads, so the analysis based on isolated measurements is wrong.", "A service call on Ethernet silently replaces a bus signal and adds latency that breaks the control loop."],
    v: "Trace a function from sensor to actuator across all computers and networks under maximum load, and confirm the measured end-to-end latency stays under its budget with the margin specified.",
    dep: ["static-real-time-os","time-synchronization","tsn-switching"]
  },
  "mixed-criticality-isolation": {
    s: "The decision of how functions of different safety and security levels share hardware, networks and software without harming each other.",
    d: "Consolidating many functions onto fewer computers puts brakes, displays and apps on the same silicon. The architecture must set which resources are shared, which are duplicated, and where checks sit, using partitions, memory protection, network segmentation and validated interfaces. It governs the hypervisor, the gateways, the safety case and the update process. The difficulty is that every shared resource, from caches to power rails to a software library, is a path for interference and must be argued separately.",
    k: ["Strong isolation by hardware and hypervisor vs trust in one qualified software stack: independent arguments for each level; cost and complexity of partitions.", "Segmented networks with gateways vs a flat network with authentication: containment of a breach; gateways limit flexibility and add latency."],
    p: ["An isolation argument that covers memory but forgets shared timing resources fails at assessment.", "A convenience interface added between domains for a feature quietly bridges the separation."],
    v: "Attempt a documented set of cross-domain attacks and interference tests, from memory writes to bus floods, and confirm each is contained with the critical functions staying within their requirements.",
    dep: ["hypervisor","central-gateway","freedom-from-interference"]
  },
  "regulatory-compliance": {
    s: "The decision to build to the laws and standards that govern vehicle approval, covering safety, emissions, cybersecurity, software updates, data protection and market-specific rules.",
    d: "Type approval in each market requires evidence about safety systems, emissions, cybersecurity management, and a managed process for software updates. Data protection law controls collection of location and driver data. Rules differ by region, and change while vehicles are in production. Compliance drives logging, update recording, diagnostic access for independent workshops, and documentation. The difficulty is that approvals attach to a specific configuration, so each software change may need an assessment of whether it affects a type approval.",
    k: ["A process certified once vs per-release assessment: low effort for each routine update; needs discipline to classify changes correctly.", "One global baseline vs region-specific builds: one validation; the strictest region sets the cost for all."],
    p: ["An update that changes behavior covered by approval ships without notifying the authority.", "Region lock rules coded in application logic rather than configuration are missed when a car is exported."],
    v: "Pick a recent release and produce its approval evidence pack, and confirm it lists every changed approved function, links each to its re-verification results and the update record for the vehicles that received it.",
    dep: ["safety-case","software-inventory-registry","security-event-reporting"]
  },
  "cost-weight-and-power": {
    s: "The decision to treat every wire, chip, byte of memory and milliamp as a cost multiplied by millions of vehicles, and to design the architecture around it.",
    d: "A cent per unit across millions matters, so choices such as the number of controllers, wiring, memory sizes, processor class and sleep current are made by explicit budgets. Weight affects range, and power affects both range and thermal design. These budgets decide zonal versus domain topology, whether to share a computer, how much software overhead is allowed and what security hardware is affordable. The difficulty is that software growth keeps eating margins sized years earlier, and hardware cannot be added after launch.",
    k: ["Tight memory and processor sized to the plan vs generous margin: lowest unit cost; no room for later features or updates.", "Fewer larger computers vs many small ones: lower wiring and parts count; higher cost per computer and concentrated heat."],
    p: ["A feature added after hardware freeze needs more memory than the controller has, forcing a hardware change.", "Software that prevents sleep adds milliamps that no part-level budget accounted for."],
    v: "Track the budgets for flash, RAM, processor load, bus load and standby current against the plan at each release, and confirm every one stays within its limit with the margin agreed for future updates.",
    dep: ["zonal-controller","central-compute","power-supply-and-wake"]
  },
});
