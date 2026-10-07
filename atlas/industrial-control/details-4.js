// Details part 4: industrial protocols, network segmentation and security.
ATLAS.details("industrial-control", {
  "fieldbus-segments": {
    s: "Digital buses that connect many field instruments and valves on one cable, carrying measurements, diagnostics and sometimes power, and allowing some control to run in the devices.",
    d: "A segment has a controller or linking device as master or scheduler, and tens of devices on a trunk with spurs. Communication follows a schedule so cyclic data has bounded delay, with acyclic slots for configuration and diagnostics. Intrinsically safe variants limit energy for hazardous areas. It is hard because wiring rules such as length, terminators, shielding and power budget decide whether it works, and a single bad device or connector can disturb the whole segment.",
    k: ["Digital fieldbus versus conventional point-to-point wiring: a bus saves cable and brings diagnostics, but one fault can affect many devices and needs commissioning skill.", "Control in field devices versus in the controller: field control keeps loops running if the bus master fails, but spreads logic across many devices."],
    p: ["A damaged spur or missing terminator causes intermittent communication loss that appears only when the plant vibrates or it rains.", "The segment power budget is exceeded after adding two devices and the farthest ones reset."],
    v: "Measure signal level and noise on a commissioned segment with a bus analyzer, and confirm each device meets its limits. Disconnect one device and confirm the others continue and the loss is alarmed.",
    dep: ["analog-with-digital-overlay","device-description-files","intrinsic-safety-barriers"]
  },
  "industrial-ethernet": {
    s: "Standard Ethernet adapted for plants: ruggedized switches, deterministic or prioritized real-time traffic classes and protocols that exchange process data cyclically with bounded delay.",
    d: "Controllers exchange input and output data with devices on a fixed update cycle using real-time frames, sharing the wire with ordinary traffic. Variants differ in how they reserve time: prioritization, time slots or scheduled windows driven by synchronized clocks. Switches are managed, with VLANs, quality of service and topology protocols. It is hard because determinism depends on design: an unmanaged switch, a broadcast storm or a rogue scanner can break cyclic timing.",
    k: ["Prioritized traffic on standard switches versus scheduled time slots: priority is simple and flexible, but latency varies with load, while scheduling gives tight bounds and needs synchronized, scheduled network design.", "One converged network versus separate control and information networks: convergence saves cabling and eases data access, but puts control traffic at risk from other loads."],
    p: ["A laptop running a network scan floods a device and its cyclic connection times out.", "A multicast stream is not filtered and consumes the capacity of every port."],
    v: "Under full information-network load, measure cycle time jitter of real-time I/O exchange on a test network, and confirm the worst case stays within the device timeout with margin.",
    dep: ["register-polling-protocols","ring-and-parallel-redundancy"]
  },
  "register-polling-protocols": {
    s: "Simple master-slave protocols that read and write numbered registers and bits in devices over serial lines or Ethernet, the common minimum denominator across equipment.",
    d: "A master sends a request naming a function, an address and a count, and the device replies with the data or an error. There is no data typing, so the meaning of each register, its scaling and its byte order come from a document. Serial lines share one pair among up to a few dozen devices, taking turns. It is hard because there is no authentication, no timestamps and no discovery, so correctness lives in a hand-built address map, and a misread document gives wrong values without any error.",
    k: ["Simple register polling versus self-describing protocols: polling works with nearly any device and is easy to debug, but all semantics live outside the protocol.", "Many devices on one serial line versus one gateway per few devices: fewer cables with many on a line, but one faulty device can stall all of them."],
    p: ["Two devices share an address and both answer, corrupting every reply on the line.", "A change in a device's firmware moves a register, and the master keeps reading the old address."],
    v: "Read a known register in each device, compare against the device's own display, and confirm scaling and units. Disconnect one device and confirm the others continue to answer within normal time.",
    dep: ["driver-layer","protocol-gateways"]
  },
  "unified-architecture-server": {
    s: "A vendor-neutral information-model service that exposes controller and device data as typed, named, browsable nodes with methods, subscriptions, history and built-in security.",
    d: "A server presents an address space of objects and variables with types, units and relationships; clients browse it, subscribe to changes and call methods. Sessions are authenticated and messages signed and encrypted with certificates. Companion models define standard structures for classes of equipment. It runs in controllers, gateways and servers. It is hard because the quality depends on the model: a server that exposes flat raw registers is not much better than polling, and certificate trust must be managed for every connection.",
    k: ["Rich information model versus flat tag list: a model carries meaning and lets clients work across vendors, but takes modeling work and a shared understanding of the standard model.", "Signed and encrypted sessions versus unsecured: security protects against tampering, but needs certificate distribution and renewal, which plants often leave undone."],
    p: ["Certificates expire and communication stops on a weekend.", "Security is set to none on every connection to avoid certificate work, and the protocol's protections are unused."],
    v: "Connect a client with a trusted certificate and confirm it can browse, subscribe and see typed values with units. Connect with an untrusted certificate and confirm the server refuses the session.",
    dep: ["industrial-ethernet","tag-namespace","zones-and-conduits"]
  },
  "pub-sub-telemetry": {
    s: "A lightweight publish-subscribe messaging layer that moves plant data to many consumers through a broker, typically for analytics, cloud services and edge applications.",
    d: "Devices or gateways publish values to named topics with a small payload and a delivery guarantee level; subscribers receive them through a broker. State messages mark a device as online or offline, using last-will messages. Payloads follow an agreed structure so consumers can interpret them. It is hard because brokers decouple producers and consumers, which hides who is receiving data, and because timing guarantees are weak compared with control networks, so it suits monitoring and not control.",
    k: ["Publish-subscribe versus client-server polling: publish-subscribe scales to many consumers with little device load, but lacks the timing and request semantics needed for control.", "Report on change with retained state versus fixed-interval publishing: on change saves bandwidth, but a late subscriber needs retained state to learn current values."],
    p: ["A subscriber misses messages during a reconnect and its model silently goes out of date.", "Topics are named freely by each site, and consumers cannot find or compare data."],
    v: "Publish a changing value from a test device, disconnect and reconnect a subscriber, and confirm it receives current state with correct timestamp and the device's online status, and that an unauthorized client cannot subscribe.",
    dep: ["industrial-dmz","tag-namespace"]
  },
  "utility-telecontrol-protocols": {
    s: "Protocols for electric, water and pipeline telecontrol that carry time-stamped events, quality flags and secure commands over slow and unreliable wide-area links.",
    d: "Outstations hold point lists of binary and analog values and counters. The master reads classes of data, accepts unsolicited event reports with source timestamps and sends select-before-operate controls. Link layers cope with errors and retransmit. Secure variants authenticate messages. Many variants coexist, each with a site-specific profile. It is hard because the same protocol can behave differently between vendors, and because wide-area links need careful timeout and retry settings.",
    k: ["Event-driven protocol with buffers versus polled snapshots: events preserve history and save bandwidth, but need buffer sizing and sequence handling.", "Authenticated messages versus plain: authentication prevents spoofed commands, but needs key management on remote sites that are rarely visited."],
    p: ["Master and outstation disagree on which point classes generate events, and changes never reach the master.", "Unauthenticated commands are accepted from anyone who can reach the radio network."],
    v: "Trigger a change at a test outstation during a link outage, restore the link, and confirm the event arrives with the original timestamp and quality. Send an unauthenticated command and confirm it is rejected.",
    dep: ["polling-and-report-by-exception","wide-area-telemetry"]
  },
  "analog-with-digital-overlay": {
    s: "A scheme that carries a digital signal on top of the classic 4 to 20 mA loop, giving access to instrument configuration and diagnostics without changing the analog wiring.",
    d: "The analog current still carries the main measurement. A small alternating signal added to it carries configuration, status and extra variables, read by a handheld communicator or an asset management system through a multiplexer. Existing wiring and I/O cards are reused. It is hard because only some I/O cards pass the digital signal, the data rate is slow, and the digital configuration can disagree with what the analog output actually represents.",
    k: ["Retrofitting digital access onto analog loops versus replacing with a fieldbus: overlay keeps wiring and cards and adds diagnostics gradually, but remains slow and point-to-point.", "Writes allowed over the digital channel versus read-only: writes ease remote tuning, but allow range changes that alter the control value without anyone seeing."],
    p: ["An instrument's range is reconfigured over the digital link and the controller still scales the analog signal with the old range.", "I/O cards that block the digital signal are installed and diagnostics are never available."],
    v: "Read an instrument's configured range and diagnostics through the overlay, compare with the controller's scaling for that point, and confirm that a simulated 12 mA produces the midpoint value in both.",
    dep: ["analog-io-modules","sensors-transmitters","calibration-management"]
  },
  "protocol-gateways": {
    s: "Devices or software that translate between protocols, such as serial register protocols to Ethernet or proprietary buses to a common model, so old and new equipment interoperate.",
    d: "A gateway polls devices on one protocol and republishes their data in another, mapping addresses, types and scaling, and sometimes buffering and time-stamping. It may also enforce simple filtering. Each mapping is a manual configuration. It is hard because a gateway adds latency, hides device failures behind stale values and becomes a single point of failure, and because translation loses information such as quality and timestamps.",
    k: ["Gateway at the edge of old equipment versus replacing the equipment: a gateway extends equipment life cheaply, but adds a layer to maintain and a place for subtle mapping errors.", "Gateway acting as a security boundary versus a plain translator: filtering adds protection for insecure protocols, but means the gateway needs patching and monitoring like a firewall."],
    p: ["The gateway keeps serving the last value after the device dies, and the supervisory system shows good data.", "A mapping spreadsheet is edited, but the running gateway is never reloaded."],
    v: "Unplug the downstream device and confirm the gateway marks its points bad within the timeout instead of repeating the last value, and that every mapped point matches the device's own display.",
    dep: ["register-polling-protocols","unified-architecture-server","real-time-tag-database"]
  },
  "zones-and-conduits": {
    s: "The security model that divides the plant into zones of similar risk and requires every connection between zones to pass through a controlled, documented conduit.",
    d: "Assets are grouped by function and criticality: safety systems, control cells, supervisory, plant operations and the business network. Each zone has a target security level, and each conduit lists allowed protocols and endpoints, enforced by firewalls or switches with access lists. The design starts from a risk assessment and an asset inventory. It is hard because plants grew flat, with many undocumented connections, and because segmentation that is too fine becomes unmanageable and too coarse protects nothing.",
    k: ["Fine-grained cell zones versus coarse area zones: cells limit the spread of an incident, but multiply rules to maintain, while coarse zones are simple and offer less containment.", "Allow-list rules versus deny-list rules: allow-lists limit traffic to what is known and need accurate documentation of flows, while deny-lists are easy and miss what nobody thought of."],
    p: ["A convenience link between the business and control networks bypasses every conduit.", "Firewall rules accumulate for years, and nobody knows which ones are still needed."],
    v: "From a host in one zone, test connections to another zone and confirm only the documented protocols and addresses pass. Compare the firewall rules to the conduit documentation and confirm they match.",
    dep: ["industrial-dmz","passive-network-monitoring"]
  },
  "industrial-dmz": {
    s: "A buffer network between the plant and the business networks, holding the servers that both sides need, so that no direct connection crosses into the control zone.",
    d: "Data servers, patch repositories, remote access gateways and historian replicas sit in the demilitarized zone. Firewalls on both sides allow only specific flows, ideally initiated from the plant side. Business users query the replica, not the plant source. Updates reach the plant through staged servers. It is hard because every new need seems to justify a hole in the firewall, and because services in the DMZ are exposed and must themselves be patched and watched.",
    k: ["Replica servers in the DMZ versus direct access to plant servers: replicas protect the source and handle load, but add a copy that may lag or differ.", "Plant-initiated connections only versus both directions: plant-initiated keeps inbound paths closed, but complicates some applications that expect to connect in."],
    p: ["A DMZ server with a known flaw is exploited and used as a stepping stone into the control zone.", "A temporary firewall rule for a vendor is never removed."],
    v: "Attempt a connection from the business network to a controller and to a plant server and confirm both fail, while a query to the DMZ replica succeeds. Review the open rules against their owners and expiry dates.",
    dep: ["zones-and-conduits","process-historian"]
  },
  "unidirectional-gateways": {
    s: "Hardware that passes data in one direction only, from the plant to outside, so a compromise outside cannot send anything back in.",
    d: "A transmit side and a receive side are joined by a physical link that can carry light or signals one way. Software on each side replicates the historian or a protocol session by sending data across and rebuilding it at the other end. No packets flow back, so acknowledgments are replaced by repeated or checked transfers. It is hard because replication of live state without a return channel needs careful design, and some applications need to write back and cannot use it.",
    k: ["Hardware one-way link versus a firewall rule: hardware cannot be reconfigured into two-way by software mistake or attack, but replication and loss handling are the application's job.", "Applying it to every outbound feed versus only the most critical: wide use gives strong isolation, but costs and cannot support command paths."],
    p: ["A bidirectional path is added for one application, undoing the one-way guarantee.", "Replication gaps after a packet loss go unnoticed because there is no acknowledgment."],
    v: "Send traffic from the outside side toward the plant and confirm nothing arrives. Confirm the replica on the outside matches the source record count after a day, including after a forced loss.",
    dep: ["industrial-dmz","process-historian"]
  },
  "remote-access-gateway": {
    s: "A single controlled entry point for vendors, engineers and support staff, with strong authentication, per-session approval, recording and limits on what they can reach.",
    d: "The user authenticates with a second factor to a gateway in the DMZ, is approved for a specific system and time, and works through a jump host or brokered session, never from a laptop directly on the control network. Sessions are logged and often recorded. File transfers are scanned. It is hard because vendors need access at inconvenient times, and the easy alternatives, such as cellular modems on machines, bypass every control.",
    k: ["Brokered sessions through a jump host versus VPN into the control network: brokering limits reach and records activity, but is slower to set up per task.", "Approval for each session versus standing access: per-session approval reduces exposure, but delays urgent support."],
    p: ["A vendor leaves a modem on a machine and it provides an unmonitored path around the gateway.", "Shared vendor accounts without a second factor are used by many people."],
    v: "Request access as a vendor for one machine, confirm the session reaches only that machine, is recorded and ends at the approved time, then confirm the same account cannot reach another zone.",
    dep: ["industrial-dmz","user-roles-and-access","audit-trail"]
  },
  "passive-network-monitoring": {
    s: "Observation of a copy of plant network traffic to inventory assets, learn normal communication patterns and flag new devices, unusual commands and changes, without sending anything on the network.",
    d: "Sensors attached to mirror ports or taps decode industrial protocols, build an inventory of devices with firmware and addresses, and learn which pairs talk and what commands they use. Alerts fire on a new device, a firmware download, a stop command or a scan. Passive operation avoids disturbing fragile devices. It is hard because encrypted traffic cannot be inspected, learning must be done during normal operation, and alert volume must stay low enough to be read.",
    k: ["Passive monitoring versus active scanning: passive is safe for fragile equipment, but only sees devices that talk, while active scans find silent ones and can crash old devices.", "Learned baseline versus fixed rules: a baseline adapts to each plant, but can learn an existing intrusion as normal."],
    p: ["The tap sits on one switch and misses traffic that stays inside another segment.", "Alerts are not triaged, and a real one is lost among hundreds of routine changes."],
    v: "Connect a new test device and confirm an alert with its address and type appears within minutes. Send an unusual command from an authorized station and confirm it is flagged as new behavior.",
    dep: ["zones-and-conduits","industrial-ethernet"]
  },
  "patch-management": {
    s: "The process for tracking, testing and applying software and firmware updates to control equipment, balancing known vulnerabilities against the risk and downtime of changing a verified system.",
    d: "An inventory of versions is checked against vendor advisories. Patches are assessed for relevance and tested on a staging system or the vendor's compatibility list, then applied during planned outages in a set order. Where a patch cannot be applied, compensating controls such as isolation and monitoring are recorded. It is hard because vendors certify only certain combinations, outages are scarce, and some equipment cannot be updated at all.",
    k: ["Prompt patching versus waiting for vendor certification: prompt closes holes sooner, but risks breaking verified behavior, while waiting is safe operationally and leaves exposure.", "Staging system for tests versus testing on the live plant: staging catches problems safely, but is costly and rarely matches production exactly."],
    p: ["A patch installed on a supervisory server breaks the driver for a controller and the plant loses its view.", "Equipment that cannot be patched is recorded nowhere, and no compensating control is applied."],
    v: "Compare the version inventory against current advisories and confirm every affected item is either patched, scheduled or documented with a compensating control and an owner.",
    dep: ["control-project-repository","passive-network-monitoring","change-management-workflow"]
  },
  "controller-hardening": {
    s: "Configuring controllers and engineering stations to reduce what an attacker or mistake can do: unused ports and services off, access passwords, mode switches and signed firmware.",
    d: "Settings include disabling unused protocols and web servers, requiring authentication for programming and downloads, setting the hardware key switch to run, restricting which hosts may connect, and allowing only signed firmware. Engineering stations use application allow-lists and limited accounts. Configuration is checked against a baseline. It is hard because controllers have a long list of features enabled by default, and some hardening, such as authentication, can lock out maintenance during an emergency.",
    k: ["Key switch in run position versus remote programming enabled: run mode blocks remote changes, but requires someone on site for every program change.", "Per-device passwords versus central credentials: central credentials give control and revocation, but many controllers cannot use them and need a vault for per-device secrets."],
    p: ["Default passwords remain on controllers, because changing them takes a download that nobody schedules.", "A password is lost and nobody can modify a controller without clearing its program."],
    v: "Scan a test controller from an unauthorized host and confirm only the required ports answer, a program download without credentials is refused, and the configuration matches the hardening baseline.",
    dep: ["controller-cpu","user-roles-and-access"]
  },
  "sensors-transmitters": {
    s: "Instruments that convert a physical quantity such as temperature, pressure, flow or level into an electrical signal, with the electronics to condition and send it to the controller.",
    d: "A sensing element responds to the process, a transmitter amplifies, linearizes and compensates it and outputs a current loop or digital value. Selection depends on accuracy, range, response time and the process, such as wetted materials, temperature and pressure. Installation quality, such as tapping points and impulse lines, decides how true the reading is. It is hard because measurements drift, foul and fail in ways that look like normal values, and a wrong reading drives the whole control stack.",
    k: ["Smart transmitters with diagnostics versus basic ones: diagnostics detect plugged lines and drift early, but cost more and need configuration tools and trained staff.", "Redundant measurement versus single measurement: redundancy catches a failed instrument, but costs more taps, wiring and logic to select between readings."],
    p: ["A sensor frozen at a plausible value goes unnoticed because no other reading is compared with it.", "An impulse line partly plugs, so pressure reads low and slow, and the control action drifts."],
    v: "Compare a transmitter's reading with a calibrated reference at three points across its range, and confirm the deviation is within the stated accuracy and the controller shows the same value.",
    dep: ["calibration-management","signal-conditioning-and-isolation"]
  },
  "analog-io-modules": {
    s: "Modules that convert analog signals such as 4 to 20 mA and temperature sensor inputs to digital numbers, and numbers to analog outputs, with channel isolation and diagnostics.",
    d: "An input channel measures current or voltage with an analog-to-digital converter, applies filtering and scaling to engineering units, and flags open wire, over-range and short. Output channels drive loops to valves and drives with a defined failure state. Update times range from milliseconds to a second. It is hard because accuracy depends on noise, grounding, filtering and calibration, and because converting at the module rather than in the logic hides scaling in a configuration screen.",
    k: ["Heavy input filtering versus fast response: filtering removes noise and gives stable readings, but adds delay to fast loops.", "Scaling in the module versus in the program: module scaling simplifies logic, but hides ranges in hardware configuration that must be recorded and checked after replacement."],
    p: ["A broken wire reads as zero percent, indistinguishable from a real low value, because open-wire detection is disabled.", "A replaced module has default scaling and every value on it is wrong."],
    v: "Inject 4, 12 and 20 mA from a calibrator into a channel and confirm the engineering value in the controller at each, then open the wire and confirm a fault flag appears.",
    dep: ["signal-conditioning-and-isolation","process-image"]
  },
  "digital-io-modules": {
    s: "Modules that read on-off signals such as switches and contacts and drive on-off outputs such as relays and solenoids, with isolation, filtering and short-circuit protection.",
    d: "Input channels sense voltage presence through an isolating circuit and a debounce filter; output channels switch loads with relays or solid-state devices, with fuses or current limiting. Diagnostics report wire break and overload. Fast channels support counting and time-stamping. It is hard because the contact types, normally open or closed, and the fail direction determine safe behavior, and a wire break is only visible if a line is wired to be monitored.",
    k: ["Normally closed wiring for critical inputs versus normally open: normally closed detects wire breaks as a trip, but needs more careful logic and wiring.", "Relay outputs versus solid-state: relays isolate and handle mixed loads, but wear out, while solid-state switches are fast and silent and can fail shorted."],
    p: ["An input wired normally open shows healthy when its wire is cut, and the trip never occurs.", "A relay contact welds closed under inrush current, and the load cannot be switched off."],
    v: "Open and close each input with a switch box and confirm the logic sees the correct state. Then cut the wire to a critical input and confirm it reads as tripped or raises a fault.",
    dep: ["signal-conditioning-and-isolation","process-image"]
  },
  "remote-io-and-backplanes": {
    s: "Racks and distributed I/O stations that gather signals near the equipment and connect them to the controller over a backplane or network, reducing field cabling.",
    d: "Local modules sit on a backplane with the controller; remote stations are placed in field cabinets and talk to it over a fieldbus or Ethernet. Adapters manage module identity, hot swap and failure states. Remote stations can hold their own safe output states for a communication loss. It is hard because the network becomes part of every signal, update times vary by topology, and replacing a module in a running rack must restore its configuration without disturbing neighbors.",
    k: ["Distributed I/O near the equipment versus centralized I/O in a control room: distributed cuts copper and installation, but puts electronics in harsh locations and relies on the network.", "Hot swap versus power-down replacement: hot swap keeps the plant running, but needs modules and wiring designed for it and a restore of configuration."],
    p: ["A network fault isolates a remote station and its outputs drive to a fail state that nobody checked.", "A swapped module comes up with a different address and silently takes another's identity."],
    v: "Disconnect a remote station from a test network and confirm outputs go to configured fail states and the controller flags every point as bad. Replace a module live and confirm it restores its channels automatically.",
    dep: ["industrial-ethernet","fieldbus-segments","power-and-ups"]
  },
  "signal-conditioning-and-isolation": {
    s: "Circuits that make field signals safe and clean for I/O: isolation from ground loops and surges, filtering, amplification, conversion and surge protection.",
    d: "Isolators separate the field circuit from the system electronics so a ground difference does not create a current through the signal. Converters change thermocouple, resistance or pulse signals into standard ranges. Surge arresters shunt lightning-induced energy. Shielded twisted cable, correct grounding at one end and separation from power wiring limit noise. It is hard because noise problems are intermittent and depend on installation: a good device wired badly gives bad data, and a second ground connection can create a loop.",
    k: ["Isolation on every channel versus group isolation: per-channel isolation prevents a fault from spreading, but costs more per point.", "Shield grounded at one end versus both ends: one end avoids ground loops and leaves high-frequency noise, while both ends reject more noise and can carry circulating current."],
    p: ["A shield grounded at both ends at different potentials adds mains-frequency noise to a low-level signal.", "Surge protection is omitted on a long outdoor cable and a lightning strike destroys a rack of modules."],
    v: "With the plant running, record a quiet channel and look for periodic noise at mains frequency. Confirm it is below the stated limit, and that an injected test surge on a spare channel does not reach the module.",
    dep: ["sensors-transmitters"]
  },
  "final-control-elements": {
    s: "The devices that act on the process under control commands: control valves with actuators and positioners, dampers, and on-off valves, including their fail positions.",
    d: "A control valve has a body, trim, actuator and a positioner that compares commanded and actual position and corrects it, often reporting travel and diagnostics. Sizing and characteristics decide how well flow follows position. Each valve has a defined fail-safe position on loss of air or signal. On-off valves have limit switches for feedback. It is hard because wear, stiction and backlash make the valve a poor actuator, and a valve that does not move is a common cause of poor loops and failed shutdowns.",
    k: ["Fail-open versus fail-closed: the position chosen defines what the process does on a loss of supply, and each is right for some services and wrong for others.", "Smart positioner with diagnostics versus plain positioner: diagnostics reveal stiction and wear before failure, but need a configuration and analysis workflow that plants must actually use."],
    p: ["A sticking valve produces a limit cycle in the loop that operators learn to live with.", "Feedback from a limit switch shows closed when the actuator stem has broken away from the valve plug."],
    v: "Step a valve through its range and record commanded versus measured position, checking linearity, hysteresis and stroke time. Remove the air and confirm it moves to the documented fail position.",
    dep: ["analog-io-modules","digital-io-modules","calibration-management"]
  },
  "motor-starters-and-drives": {
    s: "Electrical devices that start, stop, protect and vary the speed of motors: contactor starters, soft starters and variable frequency drives, with their control interfaces to the controller.",
    d: "A starter switches motor power and protects against overload and short circuit. A drive converts supply to variable frequency to control speed and torque, communicating setpoints and status over a network or hardwired signals. Motor control centers group them. Interlocks and safe torque off inputs allow safety stops. It is hard because drives generate electrical noise, their parameter sets must be backed up and consistent, and a commanded speed that is not reached must be detected by the logic.",
    k: ["Drive over a network versus hardwired control signals: network gives rich data and parameters, but depends on the network for start and stop, while wiring is simple and limited.", "Soft starter versus full drive: soft starters are cheaper for fixed-speed loads, but give no speed control or energy saving."],
    p: ["A drive parameter changed locally during maintenance is never recorded, and a replacement unit runs differently.", "Logic assumes a started motor is running, but a tripped overload leaves it stopped without feedback."],
    v: "Command a start from the controller and confirm run feedback and current rise within the expected time. Trip the overload and confirm the logic shows a fault and does not report running.",
    dep: ["digital-io-modules","industrial-ethernet","controller-cpu"]
  },
  "intrinsic-safety-barriers": {
    s: "Devices that limit electrical energy to field wiring in explosive atmospheres so a fault cannot create a spark able to ignite gas or dust, allowing instruments to be used inside hazardous areas.",
    d: "A barrier or isolator in the safe area limits voltage and current to the hazardous-area circuit and isolates it. Cable parameters and device parameters must together stay within the entity limits of the loop, calculated and documented for each loop. Alternatives are enclosures that contain explosions or purge systems. It is hard because the approval depends on exact combinations of parts and cable, so a casual substitution or modification invalidates it without any visible sign.",
    k: ["Intrinsically safe wiring versus explosion-proof enclosures: intrinsic safety allows live work and light wiring, but limits power available, while enclosures tolerate high power and are heavy to maintain.", "Galvanic isolators versus zener barriers: isolators need no grounding and are more tolerant, but cost more and need power."],
    p: ["A technician swaps an instrument for one with higher stored energy and the loop exceeds its limits.", "A zener barrier's ground connection degrades and the protection is lost without alarm."],
    v: "For one hazardous-area loop, check the loop document against installed devices and cable length: every stored-energy sum must be within the barrier's limits. Test the earth connection resistance.",
    dep: ["sensors-transmitters","analog-io-modules"]
  },
  "calibration-management": {
    s: "The program that schedules, performs and records the checking of instruments against references, adjusting them or flagging them when they drift beyond tolerance.",
    d: "Each instrument has a calibration interval, tolerance and procedure. Technicians apply known inputs at several points, record as-found and as-left readings and adjust. Reference standards are themselves traceable and calibrated. Records link to the asset, and an out-of-tolerance as-found result triggers review of product made since the last good check. It is hard because the work is laborious and easy to defer, and because a drifted instrument that nobody checks looks like a normal one.",
    k: ["Fixed-interval calibration versus condition-based checks using diagnostics: fixed intervals are simple and auditable, while condition-based reduces work but needs trusted diagnostics and regulator acceptance.", "Calibrating in place versus removing the instrument: in place checks the whole loop including wiring and I/O, but cannot reach every instrument."],
    p: ["Only the as-left value is recorded, so drift between checks is never visible.", "A reference standard is out of its own calibration date, and the results are unreliable."],
    v: "Select one instrument and pull its record: as-found and as-left values at multiple points, reference traceability, date and next due date. Verify that its loop reading in the controller matches the reference.",
    dep: ["sensors-transmitters","asset-model"]
  },
});
