// Details for the automotive platform, part 3: classic platform, calibration, functional safety, cybersecurity.
ATLAS.details("automotive-platform", {
  "runtime-environment": {
    s: "The generated layer that connects application software components to each other and to basic software, so applications call ports rather than drivers or buses.",
    d: "Components declare ports that carry data or operations. The generator, given the system configuration, produces the code that moves values between components in the same task, across tasks, or out through the communication stack, handling copying and consistency. It also triggers component functions from timing or events. Because everything is generated, components can move between controllers by regeneration. The difficulty is the size of the configuration, build times, and understanding the generated code during debugging.",
    k: ["Generated glue code vs hand-written interfaces: application code is portable; debugging goes through generated layers.", "Implicit communication with buffered copies vs explicit shared data: consistent values within a run; extra memory and copy time."],
    p: ["Changing a task mapping changes data consistency semantics for components that assumed they shared a task.", "Large generated files slow every build so developers skip full configuration builds."],
    v: "Move a component from one task to another in the configuration, regenerate, and confirm the system tests still pass and measured end-to-end latency stays within its budget.",
    dep: ["static-real-time-os","signal-and-pdu-stack"]
  },
  "static-real-time-os": {
    s: "A small statically configured kernel with fixed priorities and tasks, interrupts, alarms and resources, where everything is defined at build time and there is no dynamic allocation.",
    d: "Tasks, their priorities, activation alarms and shared resources are defined in a configuration and generated into the kernel. Scheduling is priority-based with deterministic overhead, and a priority-ceiling protocol bounds blocking. Higher integrity variants add memory protection per application and execution-time monitoring, so a task overrunning its budget is detected. It is hard because schedulability must be proven across tens of tasks on shared cores, and multi-core use adds spinlocks and cross-core calls.",
    k: ["Static configuration vs dynamic task creation: analyzable timing and tiny footprint; every change requires regeneration and retesting.", "Memory protection between applications vs a single address space: contains faults; adds context switch cost and configuration."],
    p: ["Priority inversion through an unprotected shared resource causes an occasional deadline miss that tests never reproduce.", "Interrupt service routines that run longer than assumed break every analysis above them."],
    v: "Measure worst-case execution times on target for every task under maximum load, run the schedulability analysis, and confirm measured response times stay under their deadlines with the margin required.",
    dep: ["microcontroller-abstraction","safety-microcontroller"]
  },
  "microcontroller-abstraction": {
    s: "The lowest software layer, giving standardized access to the chip's timers, converters, communication peripherals, memory and ports regardless of which chip is used.",
    d: "Drivers for analog-to-digital converters, PWM outputs, digital I/O, serial and bus controllers, flash and clocks are configured from a chip-specific description and exposed with a uniform API to the layers above. They run in privileged mode, handle interrupts and sometimes with safety mechanisms such as reading back outputs. The layer is chip-specific and comes from the semiconductor vendor. The difficulty is that errata, timing differences and configuration constraints vary between chips and even silicon steppings.",
    k: ["Standardized driver API vs chip-specific optimized code: application portability between chips; some peripheral features are unreachable.", "Driver code from the chip vendor vs written in-house: faster start and vendor support; limited ability to fix defects."],
    p: ["A chip errata work-around missed in the driver causes rare corrupted conversions in production batches.", "A configuration for one pin multiplexing choice silently conflicts with another peripheral on the same pin."],
    v: "Drive every configured output and read every input on a hardware test fixture, comparing electrical results to the configuration, on each supported chip and silicon revision.",
    dep: ["safety-microcontroller","ecu-hardware"]
  },
  "ecu-state-manager": {
    s: "Controls the controller's mode from power-up to shutdown, coordinating start-up of basic software, running, sleep and wake-up sources.",
    d: "At reset it runs the early initialization, starts the OS and drivers, and then calls initialization of each module in order. Applications and bus network managers request run or sleep states, and the manager keeps the controller awake until nobody needs it, then runs shutdown including storing data to non-volatile memory. It tracks wake sources such as bus activity, a pin or a timer. The difficulty is leaving no component unready and finishing the shutdown before power drops.",
    k: ["Run requests with reference counting vs a single master decision: any user can keep the controller awake; one forgotten release prevents sleep.", "Fast start with deferred initialization vs full initialization first: meets timing requirements such as a camera image in two seconds; late initialization needs care."],
    p: ["A module that never releases its run request keeps the controller awake and drains the battery.", "Shutdown that starts storing data after power fails loses the last records."],
    v: "Wake a controller from sleep by bus message, confirm it reaches the running state within its start-up deadline, release all requests and confirm it stores data and enters sleep at the specified current.",
    dep: ["nv-memory-manager","network-management-and-sleep","watchdog-manager"]
  },
  "signal-and-pdu-stack": {
    s: "The layers that turn application signals into bus messages and back, handling packing, timing, routing between buses and transport of large payloads.",
    d: "Signals are packed into protocol data units with defined cycle times and transmission modes, passed through a router that can forward between buses, and handed to the bus driver. Transport protocols segment larger data for diagnostics and software download. Signal groups keep related values consistent, and timeouts give receivers an invalid substitute value. A configuration generated from the network database defines everything. Hard parts are timing of transmissions, load on buses and consistency between tools.",
    k: ["Generated stack from a network database vs hand-coded messages: consistent and checked; requires toolchain and database discipline.", "Periodic vs event-driven transmission: predictable bus load and timeout detection; slower reaction than sending on change."],
    p: ["A signal added to the database but sent at the wrong cycle makes receivers' timeout monitors fire in the field.", "Endianness or bit-order mismatch between sender and receiver gives a plausible but wrong value."],
    v: "Capture bus traffic from a test vehicle, decode it with the network database, and confirm every message appears at its configured period with signal values equal to the controller's internal values.",
    dep: ["can-bus","automotive-ethernet","microcontroller-abstraction"]
  },
  "nv-memory-manager": {
    s: "Stores and retrieves persistent data blocks in flash or EEPROM with redundancy, checksums and wear management.",
    d: "Applications declare blocks with size, redundancy and write policy. The manager writes them through a flash driver, often in two copies with a checksum, and on read validates and restores from the second copy or defaults on error. Writes are queued and happen in the background or at shutdown. Flash needs wear leveling and cannot be written while code runs from the same bank. The difficulty is data loss on power failure and keeping total writes within the endurance of the cells.",
    k: ["Redundant blocks with checksums vs single copy: survives interruption mid-write; doubles space and write time.", "Write at shutdown vs write on change: fewer erases; data is lost if power drops before shutdown completes."],
    p: ["Frequent small writes of a counter wear out flash years before the vehicle's end of life.", "Block layout changed by an update makes old data unreadable, silently reset to defaults."],
    v: "Cut power at random moments while the manager writes a block under test, and confirm that after restart each block contains either the complete old value or the complete new value.",
    dep: ["microcontroller-abstraction"]
  },
  "watchdog-manager": {
    s: "Supervises that tasks run alive, on time and in the expected sequence, and triggers the hardware watchdog only when everything checks out.",
    d: "Supervised entities report checkpoints. The manager checks heartbeats within windows and the order of checkpoints against a graph of allowed sequences, and refreshes the hardware watchdog, ideally an external one with its own clock and a window, only if all checks pass. A failed check triggers a configured reaction, such as a reset or entering a safe state. Safety mechanisms rely on it. The difficulty is setting tolerances that catch real faults without causing resets under legitimate jitter.",
    k: ["External windowed watchdog vs internal timer: independent of the main chip's clock; extra component and wiring.", "Reset on first failure vs counted escalation: fast reaction to real faults; transient glitches cause visible resets."],
    p: ["A task that refreshes the hardware watchdog unconditionally from a timer defeats supervision entirely.", "Tolerances measured on an idle bench cause resets during bus load peaks."],
    v: "Stop one supervised task from reaching its checkpoint on a test unit and confirm the watchdog reset or safe state occurs within the specified time, and the reason is stored in fault memory.",
    dep: ["static-real-time-os","safe-state-and-degradation"]
  },
  "bootloader": {
    s: "The first code to run on a controller, which checks the application image, starts it or accepts a new image through a diagnostic or update interface.",
    d: "After reset the bootloader validates the application with a checksum or signature, then jumps to it or stays in programming mode. In programming mode it accepts diagnostic requests, erases and writes flash, and checks the written image. A protected primary bootloader is rarely changed; a secondary loader may be updatable. With secure boot it verifies signatures against keys in hardware. The challenge is that it must be small, reliable and almost never changed, while the rest of the vehicle changes around it.",
    k: ["Small immutable first stage vs updatable bootloader: cannot be bricked by a bad update; bugs in it are permanent.", "Programming over diagnostic services vs a vendor protocol: standardized tools work; limited throughput and features."],
    p: ["A bootloader with a bug in its flash routine bricks controllers across the fleet and cannot be updated.", "A programming mode reachable from an unauthenticated message lets anyone replace the application."],
    v: "Power off during a flash write on a test unit, restart, and confirm the bootloader detects the invalid image, stays in programming mode, and accepts a complete reflash through diagnostics.",
    dep: ["secure-boot","uds-diagnostic-services","microcontroller-abstraction"]
  },
  "complex-device-drivers": {
    s: "Custom drivers for hardware with tight timing needs that the standard drivers cannot serve, such as injector control, motor commutation and sensor protocols.",
    d: "They access peripherals directly, often through interrupts and timers synchronized to engine angle or rotor position, and may implement a sensor's proprietary serial protocol in software. They bypass the standard driver layers for speed, so they carry their own timing and safety responsibilities. Application software sees them as ordinary components through the runtime environment. The difficulty is that they are tied to a chip and a part, hard to test in isolation and a common source of timing faults and defects.",
    k: ["Direct peripheral access vs standard driver API: meets microsecond deadlines; ties software to a chip and bypasses protection.", "Software protocol implementation vs dedicated hardware peripheral: lower cost and flexible; consumes processor time and is jitter-sensitive."],
    p: ["An interrupt that takes longer than its assumed bound delays injection timing and damages an engine.", "A driver written for one chip revision breaks when the supplier changes silicon."],
    v: "Measure the output timing with a logic analyzer across the full speed range and compare it with the specified windows, including the worst-case interrupt load from other drivers.",
    dep: ["microcontroller-abstraction","static-real-time-os"]
  },
  "calibration-data-sets": {
    s: "The tunable parameters, maps and curves that configure a controller's behavior for a vehicle variant, stored separately from the program code.",
    d: "Control functions read thousands of numbers, such as gains, thresholds and characteristic maps, from a calibration area in flash that can be reflashed without changing code. Calibration engineers tune them on test benches and vehicles, and the final set is released per variant and region. The data is versioned with the software and checked against it by a description file. The difficulty is volume and traceability: knowing which set is in which vehicle and that it matches the software that reads it.",
    k: ["Calibration separate from code vs compiled into code: tune without rebuilding or revalidating code; a wrong set is a silent, unreviewed behavior change.", "Per-variant sets vs one set with variant switches: each variant is simple; many sets to maintain and release."],
    p: ["A set built for an earlier software layout loads without error and gives wrong behavior.", "Last-minute calibration changes bypass the review that code changes receive."],
    v: "Flash a calibration set onto a test controller and confirm the checksum, the version identifier and a sample of read-back parameters match the release record, and the matching software version accepts it.",
    dep: ["nv-memory-manager","measurement-and-calibration-protocol"]
  },
  "measurement-and-calibration-protocol": {
    s: "A standard protocol that lets a tool read internal variables and change calibration parameters on a running controller through a bus or debug interface.",
    d: "A description file lists variable and parameter names with memory addresses and conversions. The tool connects through a bus or debug port, then reads values periodically or synchronized to events and writes parameters in an online copy of the calibration page. Measurements can be recorded at high rates with timestamps. Page switching lets the engineer swap between working and reference sets. The difficulty is not disturbing real-time behavior and keeping the description file in step with every software build.",
    k: ["Measurement by memory address vs through an instrumented API: access to everything, no code changes; address maps change with every build.", "Over a production bus vs a dedicated debug interface: works on vehicles in the field; limited bandwidth and exposure."],
    p: ["A description file from the wrong build reads other variables and produces plausible nonsense.", "The protocol left active in production gives anyone with a connector write access to parameters."],
    v: "Connect the tool to a test controller, measure a variable at the configured rate while changing a parameter, and confirm the value changes in the logged data and the controller's timing is unchanged.",
    dep: ["calibration-data-sets","can-bus","automotive-ethernet"]
  },
  "bypass-and-rapid-prototyping": {
    s: "A way to replace part of a controller's function with an experimental version running on external hardware, to test a new algorithm on a real vehicle before it is implemented in production code.",
    d: "At prepared hooks in the production software, values are exchanged with a prototyping system, which computes new outputs and returns them, while the original code remains as a fallback. The exchange runs through a fast interface. Engineers can iterate on algorithms in a model environment and test in the vehicle within hours. The difficulty is keeping the bypass out of production, handling the latency and ensuring a safe fallback when the prototyping hardware fails.",
    k: ["Bypass with original code as fallback vs full replacement: safe if the experiment fails; limited to what hooks allow.", "External prototyping hardware vs running prototype on the controller: no effect on its resources; extra interface and cost."],
    p: ["A bypass hook left enabled in a production build lets an external device command an actuator.", "The experiment's latency differs from the final implementation, so tuning does not transfer."],
    v: "Enable the bypass in a test vehicle, run an altered control law, then disconnect the prototyping unit and confirm the original code takes over within the specified time with no output glitch.",
    dep: ["measurement-and-calibration-protocol","runtime-environment"]
  },
  "variant-coding": {
    s: "Configuring a controller for the options, market and equipment of a specific vehicle by writing coding data rather than loading different software.",
    d: "At the factory or workshop, a coding tool writes parameters such as engine type, region, installed options and lamp type into each controller. Software reads them at start and enables the relevant functions. A central record holds the intended configuration, and controllers check each other's. Replacing a controller requires recoding. The difficulty is the number of combinations and keeping consistent coding across dozens of controllers, since an inconsistent set produces faults and unavailable features.",
    k: ["Coding data on one common software vs software per variant: one build to validate and release; every combination must still be tested.", "Central coding record pushed to controllers vs per-controller manual coding: consistent vehicle; relies on the record being correct."],
    p: ["A replacement controller shipped with default coding disables features until someone recodes it.", "Impossible option combinations in the record cause start-up faults found only after delivery."],
    v: "Code a controller with a specific option set, confirm the corresponding features are enabled and others are not, then replace it with a blank unit and confirm the vehicle recodes it from the central record.",
    dep: ["calibration-data-sets","uds-diagnostic-services","software-inventory-registry"]
  },
  "data-logging-recorder": {
    s: "Records selected signals, events and bus traffic in the vehicle for development, test and field analysis, with limited storage and bandwidth.",
    d: "A recorder subscribes to defined signals or raw frames and writes them with synchronized timestamps into circular buffers or files, compressing where possible. Triggers freeze a window around an event for upload. Test fleets log everything to large drives; production vehicles log small windows under strict privacy controls. It depends on a common time base across networks. The difficulty is deciding what to capture before knowing the problem, and keeping personal data out.",
    k: ["Continuous circular buffer with event freeze vs scheduled sampling: full context around a rare event; constant memory and processing cost.", "Raw bus capture vs decoded signals: allows later re-decoding with corrected databases; larger and harder to anonymize."],
    p: ["Logs timestamped by different clocks on different controllers cannot be aligned for root-cause analysis.", "A trigger set too sensitively fills storage with uninteresting events and misses the real one."],
    v: "Trigger a defined event on a test vehicle and confirm the recorded file covers the specified time before and after it, with aligned timestamps on bus and Ethernet signals.",
    dep: ["time-synchronization","vehicle-data-broker"]
  },
  "safety-goals-and-integrity-levels": {
    s: "The top-level safety requirements from hazard analysis, each with an integrity level that determines the rigor of development, verification and hardware measures.",
    d: "Teams identify hazardous events such as unintended acceleration, rate their severity, exposure and controllability, and assign an integrity level from lowest to highest. Each hazard gets a safety goal, refined into functional and technical safety requirements allocated to hardware and software elements. Decomposition can split a high level into lower levels on independent elements. Requirements flow down into the architecture. The difficulty is rating consistently, keeping traceability through changes and avoiding over-rating that makes everything expensive.",
    k: ["Conservative high ratings vs precise analysis: simpler argument and fewer disputes; more cost for every element at that level.", "Decomposition across independent elements vs one high-integrity element: cheaper parts; independence must be proven, which is hard in shared hardware."],
    p: ["A new feature added late reuses a function without redoing the hazard analysis that its new use requires.", "Requirements that cannot be traced to a verification are discovered at the audit."],
    v: "Pick a safety goal and trace it from hazard through requirement, architecture element, code unit and test result, and confirm every link exists in the tool with a passing, versioned test.",
    dep: []
  },
  "end-to-end-protection": {
    s: "Adds counters, checksums and data identifiers to safety-relevant messages so receivers detect corruption, loss, repetition, delay and misrouting anywhere on the path.",
    d: "The sender attaches a sequence counter, a data identifier and a CRC to the protected data. The receiver checks all three on every message, and reports a status such as valid, repeated, lost or corrupt. The application decides what to do with each. It protects against faults in any part of the communication path, including software in the middle that is not itself safety-rated. The difficulty is choosing a CRC with enough strength for the message length, and handling startup and wrapped counters.",
    k: ["End-to-end checks in the application vs relying on bus protection: covers every layer in between; costs bandwidth and computing on each message.", "Strict rejection on any error vs tolerance for occasional loss: safer; transient bus errors cause avoidable degradation."],
    p: ["A gateway that recomputes the checksum after modifying the data hides corruption from the receiver.", "A receiver that treats missing messages as repeats of the last value keeps acting on stale data."],
    v: "Inject corrupted, duplicated, delayed and dropped messages on a test bus and confirm the receiver flags each class correctly and the application enters the specified reaction within its time.",
    dep: ["signal-and-pdu-stack","safe-state-and-degradation"]
  },
  "program-flow-and-memory-monitors": {
    s: "Mechanisms that detect software running wrong: deadline and sequence monitors, stack and memory checks, and periodic tests of the processor's own protection.",
    d: "Logical supervision checks that checkpoints occur in the expected order, timing monitors compare runtime with a budget, and memory protection catches writes outside a component's region. Periodic tests exercise the processor's registers and the protection unit and check code in flash against a checksum. Stack watermarks detect overflow. Failures trigger the safe state reaction. The difficulty is covering enough faults without consuming too much processing time, and proving that coverage to an assessor.",
    k: ["Runtime monitors on every task vs sampling: high fault coverage; overhead on tight control loops.", "Hardware memory protection vs software checks: strong and cheap at run time; requires hardware support and careful configuration."],
    p: ["Monitoring code that shares memory and runtime with the code it monitors fails for the same reasons.", "Periodic self-tests scheduled so rarely that a fault exists for longer than the fault tolerance time."],
    v: "Corrupt a stack pointer and skip a checkpoint in a test build, and confirm the monitors detect each within the fault tolerance time and trigger the reaction recorded in fault memory.",
    dep: ["watchdog-manager","static-real-time-os","safety-microcontroller"]
  },
  "safe-state-and-degradation": {
    s: "The defined behavior a function takes after a detected fault: shut off, hold, run at reduced capability or hand over, chosen to keep the vehicle safe.",
    d: "For each safety goal the design states a safe state and how long the system may take to reach it, the fault tolerance time. Some functions go to a passive state, others keep a reduced version or switch to a backup channel, such as steering with less assistance. The state is announced on the network so other functions adapt and the driver is warned. Fail-operational designs for automated driving need redundancy. The difficulty is that the safe state of one function can be hazardous for another.",
    k: ["Fail-silent vs fail-operational: simple and cheap; the driver or a backup must take over, and automated functions need more than that.", "Immediate shutdown vs staged degradation: a clear, quick reaction; staged degradation preserves mobility but needs more design and verification."],
    p: ["Disabling steering assist on a fault while the driver is mid-turn makes the safe state dangerous in itself.", "A degradation that is announced only on a bus that has failed never reaches the driver."],
    v: "Inject each specified fault in a test vehicle and confirm the system reaches its safe state within the fault tolerance time, the driver warning appears and neighboring functions react as specified.",
    dep: ["end-to-end-protection","program-flow-and-memory-monitors","safety-goals-and-integrity-levels"]
  },
  "lockstep-and-ecc": {
    s: "Hardware that detects random faults: two cores running the same instructions and comparing results, and memory with error-correcting codes.",
    d: "Lockstep pairs execute the same program a few cycles apart and a comparator flags any difference, detecting transient faults in the processor. Error-correcting codes in memory and buses fix single-bit errors and detect double-bit ones. Additional blocks monitor clocks, voltages and temperature. Faults are reported to a fault collection unit that triggers an interrupt or a reset. The difficulty is cost and performance, since the second core adds no throughput, and avoiding common-cause faults that affect both cores equally.",
    k: ["Lockstep cores vs software-only diagnostics: high coverage with no software overhead; half the cores are redundant and cost area.", "Delayed lockstep vs cycle-exact: tolerates common disturbances like voltage glitches; more complex comparison and recovery."],
    p: ["Both cores affected by the same clock glitch compute the same wrong result, passing the comparison.", "Ignoring corrected-error counts misses a failing memory cell that will soon produce an uncorrectable error."],
    v: "Use fault injection on a test chip to flip bits in memory and core registers and confirm single-bit errors are corrected and counted, and lockstep mismatches raise the error signal within the specified time.",
    dep: ["safety-microcontroller"]
  },
  "freedom-from-interference": {
    s: "The demonstrated absence of cascading faults between software of different integrity levels sharing one processor, in memory, timing and communication.",
    d: "A lower-integrity component must not be able to corrupt a higher one's memory, starve it of processor time or block shared resources and communication. Mechanisms include memory protection units, execution-time budgets, separate partitions, and checked communication through protected interfaces. The arguments cover each class of interference and must be verified. The difficulty is shared hardware such as caches, buses and GPUs, which cause timing interference that software protection alone cannot remove.",
    k: ["Partitioned hypervisor vs one OS with protection: strong separation that is easy to argue; overhead and virtualization complexity.", "Integrate everything at the highest level vs prove independence: simple argument; every line gets expensive treatment."],
    p: ["Cache and bus contention from a low-priority partition causes a deadline miss in a safety partition.", "A shared driver written to the lower integrity level sits in the path of a safe function."],
    v: "Run a hostile workload in the low-integrity partition that overwrites memory, loops forever and floods the bus, and confirm the high-integrity partition meets every deadline and keeps its data intact.",
    dep: ["mixed-criticality-partitioning","static-real-time-os","hypervisor"]
  },
  "safety-case": {
    s: "The organized argument and evidence that a function meets its safety goals, accepted by an independent assessor before release.",
    d: "It contains the hazard analysis, requirements, architecture, safety analyses such as failure modes and effects, test and verification reports, tool qualification evidence and confirmation reviews. It claims that residual risk is acceptable and links each claim to evidence in versioned form. Each change must be assessed for impact. For software-defined vehicles it must be maintained across updates. The difficulty is volume and traceability, and keeping it correct when suppliers deliver parts with their own partial cases.",
    k: ["A living case updated with each release vs one assessment at launch: remains valid over updates; needs process and tooling effort continuously.", "Reusing supplier evidence vs reassessing integration: saves effort; the gaps between components remain the integrator's responsibility."],
    p: ["A change classified as minor invalidates assumptions behind a safety claim and no one rechecks it.", "A supplier's case assumes an integration condition that the vehicle maker never meets."],
    v: "Change one requirement and confirm the traceability tool lists every dependent claim, test and review that must be re-run, and that the release is blocked until they have been.",
    dep: ["safety-goals-and-integrity-levels","freedom-from-interference"]
  },
  "secure-boot": {
    s: "Verifies each stage of startup code against a trusted signature before running it, so only authorized software executes on the controller.",
    d: "An immutable first stage in silicon verifies the next, which verifies the next, using public keys held in one-time programmable memory or the security module. The chain covers the bootloader, operating system and sometimes applications. Failure leads to recovery mode or a safe state. A measured variant records hashes for later attestation. Verification time adds to start-up, which has deadlines. The difficulty is key management, rollback protection and balancing full verification with fast boot.",
    k: ["Verify the full image at every boot vs verify at update time: strong protection against tampering at rest; slower boot.", "Boot failure stops the controller vs boots in limited mode: no unauthorized code; a bad update can immobilize the vehicle."],
    p: ["A debug interface left open in production lets an attacker bypass the verified chain.", "Keys shared across all vehicles mean one extracted key compromises the fleet."],
    v: "Change one bit of the application image on a test unit and confirm the chain refuses it, enters recovery mode and logs the failing stage, and that the genuine image boots within the start-up deadline.",
    dep: ["hardware-security-module","in-vehicle-key-management","boot-chain"]
  },
  "hardware-security-module": {
    s: "A protected processor or block on the chip that stores keys, runs cryptography and enforces policy so the main software never sees secret keys.",
    d: "It has its own isolated processor and memory, a random number generator and cryptographic accelerators. It performs signing, verification, message authentication and encryption on request, and holds keys that cannot be read out. Application software calls it through a driver and may wait for results. Variants differ widely in capability, from simple message authentication to full public-key support. The difficulty is throughput for bus-rate authentication, key provisioning in the factory and the limited, vendor-specific interfaces.",
    k: ["Hardware key storage vs software key storage: extraction resistance; limited memory, vendor interfaces and provisioning constraints.", "Dedicated module vs secure partition on the main core: stronger isolation; extra area and cost."],
    p: ["Using a low-capability module that cannot meet the message rate forces authentication to be dropped from some messages.", "Side-channel weaknesses in the implementation let keys leak by measuring power."],
    v: "Request a signature through the driver, confirm it verifies with the public key, then attempt to read the private key by every available interface and confirm none returns it.",
    dep: ["safety-microcontroller"]
  },
  "secure-onboard-communication": {
    s: "Authenticates, and where needed encrypts, messages between controllers so a node that injects or replays frames is detected.",
    d: "On buses with tiny frames, a truncated message authentication code and a freshness counter are added to selected messages. On Ethernet, transport security or link-layer encryption protects service traffic. Keys are provisioned to each group of communicating controllers and rotated. Receivers drop or flag unauthenticated messages. Time and counter synchronization are needed for freshness. The difficulty is the small payload, hardware speed, key distribution and avoiding the extra latency that breaks control loops.",
    k: ["Authenticate only critical messages vs everything: lower load and latency; unprotected messages remain attackable.", "Symmetric keys per group vs asymmetric per node: fast, small, works on weak controllers; a compromised node reveals group keys."],
    p: ["Freshness counters that desynchronize after a reset cause valid messages to be rejected until reboot.", "A shared group key extracted from one weak controller lets an attacker forge messages to all others."],
    v: "Replay a captured authenticated message and send one with a bad authentication code on a test bus, and confirm the receiver ignores both, counts them and raises a security event.",
    dep: ["hardware-security-module","in-vehicle-key-management","signal-and-pdu-stack"]
  },
  "intrusion-detection": {
    s: "Monitors network traffic and controller behavior for anomalies such as unexpected messages, timing changes and unauthorized diagnostic requests, and reports them.",
    d: "Sensors in gateways and controllers check rules: message identifiers not allowed on a network, rates outside normal, invalid authentication, and unusual diagnostic sessions. Some use learned models of normal traffic. Events carry a context and are sent to a manager that aggregates, filters and forwards to the cloud. Reaction may be to log, to block at the gateway or to degrade a function. Difficulty is false positives in a fleet of millions and limited resources on controllers.",
    k: ["Rule-based detection vs learned anomaly models: explainable and predictable; blind to novel attacks and tied to the network design.", "Detect and report only vs automatically block: no risk of blocking legitimate traffic; slower response to an active attack."],
    p: ["Normal workshop diagnostic traffic raises alerts and the reports are ignored as noise.", "Learned thresholds drift after a software update and either flood or silence the detector."],
    v: "Inject a message with an identifier not defined for that bus, and confirm a security event with the bus, identifier and time reaches the manager and is forwarded to the cloud within the target latency.",
    dep: ["central-gateway","security-event-reporting","signal-and-pdu-stack"]
  },
  "access-control-policy": {
    s: "The rules that decide which application, tester or remote service may call which vehicle function, read which data or reach which network.",
    d: "Identities come from certificates or platform-assigned application identifiers. Policies map identities to permitted interfaces, signals and operations and are enforced at several points: the gateway between networks, the service layer, diagnostic services and the application sandbox. They are signed and updatable. Reviewing them requires tooling because they are many and interact. The difficulty is least privilege over a long vehicle life, as new apps and features keep asking for more.",
    k: ["Centrally managed signed policy vs per-component local rules: auditable, one place to fix; the policy engine is critical and must be correct.", "Deny by default vs allow by default for internal traffic: limits lateral movement after a compromise; every new interface needs a policy entry."],
    p: ["Permissions granted broadly in development ship to production unchanged.", "Rules enforced only at the gateway leave traffic inside one network unrestricted."],
    v: "Attempt a diagnostic write from the infotainment network and from an unauthorized application, and confirm both are blocked and logged while the authorized tester succeeds.",
    dep: ["vehicle-identity-pki","central-gateway"]
  },
  "in-vehicle-key-management": {
    s: "Creates, distributes, stores, rotates and revokes the cryptographic keys that controllers use for boot, messages, storage and updates.",
    d: "Keys are derived or injected during production and assigned to controller groups. A key master distributes session and group keys over protected links, and the security module stores them. Rotation changes keys on schedule or after a suspected leak, and replacement of a controller needs controlled re-provisioning. The backend PKI sets the roots. The difficulty is life: fifteen years, offline periods, workshop repairs and second owners, all while no key may ever appear in plain text outside secure hardware.",
    k: ["Derived keys from a master key vs unique random keys per node: no per-node storage in the backend; compromise of the master exposes everything.", "Frequent rotation vs long-lived keys: limits exposure; vehicles missing rotations fall out of sync."],
    p: ["A replacement controller provisioned with keys from an uncontrolled workshop tool breaks the trust chain.", "A key stored in the application area for convenience is extracted from a scrapped vehicle."],
    v: "Rotate a group key on a test vehicle with one controller asleep, wake it and confirm it receives the new key and resumes authenticated communication, while an old key is rejected.",
    dep: ["hardware-security-module","vehicle-identity-pki"]
  },
  "security-event-reporting": {
    s: "Collects security-relevant events from controllers, filters and signs them and sends them to a backend operations center for analysis and response.",
    d: "Events from intrusion detectors, failed authentications, tamper indicators and unexpected updates are stored in a protected log with timestamps and sent when connectivity allows. A security operations team correlates them across the fleet to find campaigns and decides on responses such as an update or a policy change. Regulations require monitoring and incident handling through the product's life. The difficulty is volume, privacy limits, trust in reports from possibly compromised vehicles and having a response process ready.",
    k: ["Rich event detail vs minimal event: better analysis; more data and personal information leave the vehicle.", "Immediate upload vs batched upload: faster response; cost and the risk of a flood during an attack."],
    p: ["Reports signed by a compromised controller are trusted as accurate.", "An operations process that is not staffed turns collected events into a log nobody reads."],
    v: "Trigger a test security event, and confirm it appears in the operations console with vehicle pseudonym, source controller and time, and that a drill response, such as pushing a policy update, reaches the vehicle.",
    dep: ["intrusion-detection","connected-services-gateway","fleet-data-ingestion"]
  },
});
