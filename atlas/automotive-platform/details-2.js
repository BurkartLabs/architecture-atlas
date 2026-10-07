// Details for the automotive platform, part 2: software-defined services, adaptive platform, diagnostics, updates.
ATLAS.details("automotive-platform", {
  "vehicle-abstraction-layer": {
    s: "A stable set of interfaces to vehicle capabilities such as set cabin temperature or read wheel speed, hiding which controller, bus and message format provide them.",
    d: "Applications call named operations and subscribe to named signals. The layer maps each to the current implementation: a bus message to a legacy controller, a service call to a zonal one, or a simulated value in a test. When a function moves between computers or a supplier changes, only the mapping changes. It adds permission checks and rate limits. The difficulty is choosing abstractions general enough to survive hardware change but concrete enough to be useful, and keeping latency low for control-adjacent uses.",
    k: ["Capability-level interface vs raw signal access: applications survive hardware changes; some uses need details the abstraction hides.", "Generated bindings from a catalog vs hand-written adapters: consistent and checkable; the generator becomes critical tooling."],
    p: ["An abstraction that mirrors one supplier's signals leaks that supplier's quirks into every application.", "Hiding the real update rate makes an application treat a once-a-second value as live."],
    v: "Swap a controller for a different supplier's unit behind the layer, leave an application unchanged, and confirm it still reads and commands the capability with the same documented behavior.",
    dep: ["vehicle-signal-catalog","service-oriented-communication"]
  },
  "vehicle-signal-catalog": {
    s: "The machine-readable definition of every vehicle signal and service: name, type, unit, range, update rate, owner and access rules.",
    d: "A single catalog generates the bus databases, service interface descriptions, documentation and test stubs, so a signal has one definition rather than a copy per tool. Names follow a hierarchical scheme so partners and apps find them. Each entry has an owner and a version, and changes follow compatibility rules. The difficulty is governance across many teams and suppliers: a signal renamed on one side silently breaks every consumer unless the catalog is enforced in the build.",
    k: ["One catalog with generated artifacts vs separate databases per bus and tool: no drift; requires toolchain investment and discipline.", "Standard signal vocabulary vs proprietary names: partners and third parties adapt faster; loses signals specific to a vehicle."],
    p: ["Units left implicit lead to a consumer reading miles per hour as kilometers per hour.", "Deleting a signal from the catalog without a deprecation period breaks an unlisted consumer in the field."],
    v: "Rename a signal in the catalog and run the build, and confirm every consumer that referenced the old name fails to compile or flags a deprecation, and generated bus and service definitions are regenerated.",
    dep: []
  },
  "vehicle-data-broker": {
    s: "A local publish-subscribe and query service that gives applications current and historical values of vehicle signals, with permission checks and rate control.",
    d: "Sources publish values from controllers via bus gateways or services. Consumers subscribe with a filter, rate and tolerance, or query the latest value. The broker enforces access policy per application, applies conflation so slow consumers do not stall fast producers, and timestamps data. It may keep a short history. It must remain light enough for the cockpit computer yet scalable to thousands of signals. Hard parts are timing semantics, back-pressure and ensuring that a stale value is marked stale instead of repeated.",
    k: ["Subscription with change thresholds vs fixed-rate streaming: less load and fewer wakeups; consumers must handle irregular updates.", "Central broker per computer vs direct peer subscriptions: policy and auditing in one place; an added hop of latency and a single failure point."],
    p: ["A consumer that subscribes to everything at full rate saturates the computer and starves other applications.", "A value cached after its source stopped publishing is served as live."],
    v: "Stop a source controller and confirm subscribers receive a stale or unavailable status within the defined timeout rather than the last value, and that an unauthorized subscriber is refused.",
    dep: ["vehicle-abstraction-layer","access-control-policy","service-oriented-communication"]
  },
  "function-orchestrator": {
    s: "Starts, stops, moves and monitors vehicle functions across computers according to the vehicle's state and available resources, including failover to another computer.",
    d: "Functions are described with their resource needs, dependencies, criticality and permitted hosts. The orchestrator places them at startup, restarts failed ones, and relocates them when a computer fails or enters a low-power mode. It coordinates with each machine's execution manager and with the health monitors. The difficulty is determinism: a safety function must not be moved by a heuristic, and moving stateful functions requires state transfer within a tight deadline.",
    k: ["Static placement with defined fallbacks vs dynamic scheduling: predictable and certifiable; poor use of spare compute.", "Hot standby on a second computer vs cold restart: seamless failover; doubles resource use."],
    p: ["Restarting a failed function repeatedly in a tight loop hides the root cause and consumes the remaining resources.", "Failover to a computer that lacks the same sensor inputs produces a running function with no data."],
    v: "Power off one computer in a test rig and confirm the specified functions start on the fallback host within their deadline and report their new location, while functions without a fallback enter their degraded mode.",
    dep: ["execution-management","platform-health-monitoring","service-discovery"]
  },
  "app-sandbox": {
    s: "Runs untrusted or lower-assurance applications inside restricted environments with limited files, network, CPU, memory and vehicle access.",
    d: "Each application runs as an isolated process or container with its own file view, a syscall allow-list and resource quotas. Access to vehicle data goes through brokered interfaces with permissions, and network access is filtered per application. Updating a sandboxed app does not require the vehicle's platform to be revalidated. The difficulty is making isolation strong enough to support a safety case while keeping applications performant, and managing permissions so they do not accumulate over time.",
    k: ["Container-style isolation vs full virtual machine: low overhead and quick start; a kernel flaw breaks isolation.", "Deny by default with explicit grants vs broad defaults: smaller attack surface; developers need more effort to get their app working."],
    p: ["A sandbox that shares a kernel with safety functions cannot support a freedom-from-interference claim by itself.", "Resource limits tuned for a test device are too high for a vehicle under memory pressure."],
    v: "Run a deliberately hostile test app that tries to read another app's files, open a raw socket and exhaust memory, and confirm each is blocked or limited and the platform keeps meeting its deadlines.",
    dep: ["posix-operating-system","access-control-policy","execution-management"]
  },
  "feature-activation-runtime": {
    s: "The on-vehicle component that reads signed entitlements and switches software features on or off, including trials, subscriptions and regional rules.",
    d: "At start and on change it verifies entitlement records and publishes feature flags that applications and controllers consult. Features are delivered in the software image and activated by flags, avoiding a separate build per option. It handles grace periods and falls back safely when the entitlement cannot be read. It sits between the cloud entitlement service and the vehicle abstraction layer. The difficulty is tamper resistance and making sure a flag flip is applied atomically across controllers.",
    k: ["Flags checked at use vs flags applied at start: immediate effect; applications must check consistently, and one that does not leaks a locked feature.", "Verification in a secure module vs in application software: harder to bypass; limited throughput and more integration."],
    p: ["One controller sees the feature enabled and another disabled, producing contradictory behavior.", "Defaulting to disabled on a read error turns off a feature the customer paid for during a storage fault."],
    v: "Install a signed entitlement, confirm all consumers see the feature on after the same event, tamper with the record to break the signature, and confirm the feature is disabled and the attempt is logged.",
    dep: ["vehicle-data-broker","secure-onboard-communication","feature-entitlements"]
  },
  "virtual-ecu-test-bench": {
    s: "Runs controller software on a server or developer computer against simulated signals and virtual buses, so software is tested long before hardware exists.",
    d: "The same code that ships is compiled for a host, linked to simulated hardware abstractions and connected to a virtual network and plant models. Tests run in parallel in continuous integration and replay field recordings. Fault injection can be done without damaging hardware. The challenge is fidelity: timing, memory and peripheral behavior differ from silicon, so virtual results qualify logic but not real-time behavior, which still needs hardware in the loop.",
    k: ["Virtual simulation at scale vs hardware-in-the-loop only: thousands of scenario runs per night; cannot reveal timing and electrical effects.", "Instruction-accurate emulation vs functional models: closer to the target; much slower and costlier to build."],
    p: ["Passing in simulation is read as passing on the vehicle even though timing and peripheral faults were not modeled.", "Plant models drift from the real vehicle and the tests keep passing against a fiction."],
    v: "Replay a recorded field log through the virtual controller and confirm its outputs match the recorded vehicle's outputs within tolerance, then run the same regression on hardware and compare results.",
    dep: ["vehicle-signal-catalog","runtime-environment"]
  },
  "execution-management": {
    s: "Starts and stops adaptive applications in the correct order, assigns them resources and restarts or reports them when they fail, according to a declared manifest.",
    d: "Each application ships with an execution manifest naming its processes, start-up dependencies, resource groups, scheduling priority and the machine states in which it runs. The manager reads machine state changes, launches processes with the configured limits, tracks their lifecycle through a reporting interface and reacts to failure per policy. It works with health monitoring and state management. The difficulty is deterministic startup ordering across dozens of applications, with bounded start time after ignition.",
    k: ["Declarative manifest vs imperative startup scripts: verifiable and analyzable; less flexible for unusual cases.", "Restart on failure vs report and wait: availability returns quickly; a crashing function may restart into the same fault repeatedly."],
    p: ["A startup dependency cycle between two applications deadlocks boot and appears only on some hardware.", "Resource limits omitted from a manifest let one application take all memory."],
    v: "Kill a running application process and confirm the manager restarts it within the configured time, reports the event, and stops retrying after the configured limit.",
    dep: ["posix-operating-system","machine-state-management"]
  },
  "machine-state-management": {
    s: "Tracks the computer's overall state, such as off, startup, driving, charging, update or shutdown, and coordinates every application's transition through it.",
    d: "Requests from vehicle logic, such as ignition off, move the machine through states defined by the platform. Each state lists which applications must run. The manager sends transition requests, waits for readiness and handles timeouts, then tells the execution manager to apply the new set. It coordinates with network management to allow sleep. The hard parts are partial failures, where one application never confirms, and keeping several computers' states consistent.",
    k: ["Centralized state authority vs per-application state: consistent transitions; a bug in the authority affects the whole machine.", "Waiting for all confirmations vs a timeout: orderly shutdown with data saved; slow or stuck applications delay sleep and use battery."],
    p: ["An application that ignores the shutdown request keeps the vehicle awake and drains the battery.", "State requests arriving during a transition are queued in the wrong order."],
    v: "Request ignition off, and confirm every application acknowledges, state data is stored, and the machine reaches its low-power state within the allowed time, with the sleep current at its target.",
    dep: ["execution-management","network-management-and-sleep"]
  },
  "service-discovery": {
    s: "Lets applications find which service instances currently exist, on which computer and with which version, so they can connect without fixed addresses.",
    d: "Providers announce an offered service with its identifier, version, address and lifetime; consumers search or listen for announcements and receive notice when a provider appears or disappears. Announcements are periodic multicast or directed queries on the Ethernet backbone. Security policy limits who may offer or find what. The difficulty is start-up timing, so consumers handle a provider that is not yet there, and bounded discovery time after a failover.",
    k: ["Decentralized announcements vs a central registry: no single point of failure; more network chatter and slower convergence.", "Strict version matching vs tolerant matching: avoids wrong interface use; requires coordinated releases."],
    p: ["A rogue node that announces a service name gets traffic meant for the real provider.", "Short announcement lifetimes combined with packet loss make healthy services appear to vanish."],
    v: "Stop a service provider and confirm consumers are notified within the announced lifetime, then start a replacement and confirm consumers reconnect within the specified discovery time.",
    dep: ["automotive-ethernet","access-control-policy"]
  },
  "service-oriented-communication": {
    s: "Remote method calls, event subscriptions and field access between applications over Ethernet, with typed interfaces generated from service descriptions.",
    d: "A service interface defines methods, events and fields. Generated proxies and skeletons serialize data into a defined wire format and send it over UDP or TCP with defined timing, using a communication binding such as SOME/IP or a data-distribution protocol. Quality of service settings control reliability and deadlines. It runs on the adaptive platform and increasingly on classic controllers through gateways. The difficulty is latency and jitter, serialization compatibility across versions, and secure communication without adding too much overhead.",
    k: ["Typed generated interfaces vs generic message passing: compile-time checking and clear contracts; coordinated regeneration across teams.", "Event notification vs polling a field: lower latency and bus load; consumers must handle missed events."],
    p: ["Adding a field to a message without versioning breaks older consumers in vehicles not yet updated.", "Large events sent over the control network starve time-critical traffic."],
    v: "Send ten thousand method calls between two computers under load and confirm that the latency distribution stays within the interface's deadline at the ninety-ninth percentile with no lost events.",
    dep: ["automotive-ethernet","tsn-switching","secure-onboard-communication"]
  },
  "adaptive-persistency": {
    s: "Reliable storage of application data such as settings and learned values as key-value stores and files, surviving power loss and updates.",
    d: "Applications declare storage needs in a manifest and use a key-value or file API. The service manages quotas per application, journaling or copy-on-write for crash safety, integrity checks and optional encryption. Data schemas migrate on update, and backup and restore cover replacement of a computer. Flash wear limits write rates. The difficulty is correctness across sudden power loss during the write, and migrating stored formats through updates and rollbacks.",
    k: ["Write-through on every change vs batched writes: minimal data loss on power cut; more flash wear and slower calls.", "Per-application encryption keys vs shared platform key: isolation between applications; more key handling and recovery cases."],
    p: ["A rollback to older software finds data in a newer format it cannot read.", "An application writing every second wears out flash within the vehicle's life."],
    v: "Cut power at random points during a write loop, reboot, and confirm the store is consistent and holds either the old or new value of each key, never a partial one.",
    dep: ["posix-operating-system","hardware-security-module"]
  },
  "platform-health-monitoring": {
    s: "Supervises the liveness and timing of applications and platform services and triggers recovery when they stop or run late.",
    d: "Applications report alive checkpoints, deadlines and logical sequences. The monitor compares them with the expected pattern and reports failures to the state or orchestration layers, which decide whether to restart, degrade or reset. A hardware watchdog backs the monitor so a hung monitor is also caught. Results feed safety goals through a defined fault reaction. Challenges include avoiding false alarms under load, covering failures that leave a process running but useless, and keeping the monitor itself simple.",
    k: ["Supervision by alive pulses vs by output plausibility: cheap and generic; plausibility catches a running but wrong function and costs design effort.", "Local recovery vs escalating to a reset: faster restoration for minor faults; risks hiding a recurring problem."],
    p: ["A function that sends alive signals from a separate thread continues reporting healthy while its main logic is stuck.", "Thresholds set tightly on a lightly loaded bench cause resets in a hot, busy vehicle."],
    v: "Block the main loop of a monitored application while its heartbeat thread runs, and confirm the logical-sequence check flags it and triggers the specified recovery within the supervision time.",
    dep: ["execution-management","watchdog-manager"]
  },
  "adaptive-logging-tracing": {
    s: "Collects structured log messages and timing traces from applications and the platform, filtering by level and routing them to storage, a diagnostic tester or the cloud.",
    d: "Applications log through a common API with severity and context identifiers. A logging daemon filters according to a runtime configuration, buffers in memory, and forwards to a tester over Ethernet or writes to protected storage. Tracing adds timestamps for function entry and exit to reconstruct timing. Remote configuration lets engineers raise levels on a specific vehicle. The difficulty is bounded overhead on real-time paths and privacy, since logs can capture personal data.",
    k: ["Ring buffer in memory vs persistent log: negligible overhead; a crash or power cut can lose the most interesting lines.", "Structured binary logs vs text: compact and parseable; need a message catalog to read them."],
    p: ["Debug logging left on in production fills storage and slows a time-critical task.", "Logs containing destination addresses are uploaded without consent."],
    v: "Raise the log level for one application remotely, reproduce a fault, and confirm the retrieved log shows ordered, timestamped entries for it with no measurable change to that application's deadline misses.",
    dep: ["posix-operating-system","time-synchronization"]
  },
  "application-package-manager": {
    s: "Installs, upgrades, versions and removes adaptive application packages on a computer, checking signatures, compatibility and dependencies.",
    d: "A package contains application binaries, manifests and data. The manager verifies the signature, checks the required platform version and dependencies, installs into a staging area and activates it, keeping the previous version for rollback. It integrates with the update client for download and with execution management for process swaps. The difficulty is keeping the system consistent during an interrupted install and enforcing which combinations of packages are allowed.",
    k: ["Atomic switch between installed versions vs in-place replacement: instant rollback; needs double storage for large applications.", "Per-application updates vs whole-image updates: smaller and faster; more combinations to validate."],
    p: ["An application updated independently of a service it depends on fails to start after the update.", "Package storage fills because old versions are never cleaned up."],
    v: "Install a new application version, kill power halfway through activation, and confirm after reboot that the old version runs or the new one is fully active, and the manager reports which.",
    dep: ["package-verification","execution-management","adaptive-persistency"]
  },
  "uds-diagnostic-services": {
    s: "The standardized request and response protocol through which testers read data, write settings, run routines and reprogram controllers, organized into sessions with security levels.",
    d: "A tester sends a service request, identified by a service code, and the controller answers positively or with a negative response code. Sessions such as default, extended and programming unlock progressively more dangerous services, and security access uses a seed and key challenge. Common services read and write data by identifier, read fault codes, control outputs and download software. Timing rules limit how fast the tester may request. The difficulty is the huge variety in how suppliers implement the details.",
    k: ["Session and security gating vs open access: protects safety-relevant services; makes service tools more complex.", "Manufacturer-specific data identifiers vs standard ones: richer data; each vendor's tool must learn them."],
    p: ["A weak seed and key algorithm lets anyone unlock programming services.", "A controller that keeps an extended session open after the tester vanishes can be left in a state with disabled protections."],
    v: "Request a protected service in the default session and confirm a negative response, then enter the extended session, pass security access and confirm the same request succeeds, then wait out the session timeout and confirm it reverts.",
    dep: ["diagnostic-data-description","access-control-policy","fault-memory"]
  },
  "diagnostics-over-ip": {
    s: "Carries diagnostic requests over Ethernet with vehicle announcement, routing to individual controllers and activation of the diagnostic network.",
    d: "A tester connects to a diagnostic port or wirelessly, finds vehicles through announcement messages, activates the diagnostic interface, and then sends requests through a gateway that routes them to the right controller on another network. It is much faster than bus-based diagnostics, which makes large software downloads practical. Authentication and activation lines limit access. The difficulty is secure remote use, routing across several networks with different protocols and handling many simultaneous testers.",
    k: ["Ethernet-based diagnostics vs bus-based: much higher throughput for reprogramming; a larger network attack surface.", "Gateway-routed vs direct connection to each controller: one connection point; the gateway becomes a bottleneck."],
    p: ["An open diagnostic port reachable from the infotainment network exposes reprogramming services.", "Two testers working at once send conflicting commands to the same controller."],
    v: "Connect a tester, discover the vehicle, activate routing, read an identifier from a controller on a slow bus, and confirm the answer returns through the gateway within the specified time.",
    dep: ["uds-diagnostic-services","central-gateway","automotive-ethernet"]
  },
  "fault-memory": {
    s: "The non-volatile record of detected faults, with each fault code's status, occurrence counters and aging, used by technicians and by the cloud.",
    d: "Software monitors report a pass or fail result for each check. A fault manager debounces the results, sets status bits such as pending, confirmed and warning-indicator-requested, increments counters and ages out faults after enough clean cycles. Each fault has a code and extended data. Storage survives power loss. The hard parts are debouncing so that transients do not set codes, deciding when to light a warning, and tracking operating cycles consistently across variants.",
    k: ["Debounce by counter vs by time: simple and deterministic per cycle; the same fault can take different wall time in different conditions.", "Few coarse fault codes vs many specific ones: simpler repair guidance; less ability to isolate the failing part."],
    p: ["A fault that sets only after the technician has left, with no freeze frame, cannot be reproduced.", "Aging counters reset by software updates erase the history that mattered."],
    v: "Inject a fault for the debounce time on a test controller, confirm the code becomes pending then confirmed with the right status bits, then drive clean cycles and confirm it ages out at the specified count.",
    dep: ["nv-memory-manager","freeze-frames-and-snapshots"]
  },
  "freeze-frames-and-snapshots": {
    s: "A capture of selected signal values at the moment a fault is detected, stored with the fault code to help reproduce what the vehicle was doing.",
    d: "When a fault is confirmed, the diagnostic software copies configured values such as speed, temperature, voltage and operating mode into non-volatile storage tied to the fault. Extended snapshots may hold a history window before the event. The selection is chosen per fault at design time. These records are the main evidence for repair and are uploaded to the cloud. Limits on storage and write time mean the set of signals is a compromise made early and hard to change later.",
    k: ["A fixed snapshot list per fault vs a configurable one: simple and deterministic; useful signals may be missing when a new problem emerges.", "Pre-trigger ring buffer vs capture at trigger: shows what led to the fault; costs RAM continuously."],
    p: ["Values read from different tasks at different times produce a snapshot that never actually existed.", "Overwriting the oldest fault's frame by a flood of minor faults loses the important one."],
    v: "Trigger a known fault at a defined speed and temperature and confirm the stored snapshot shows those values, a correct timestamp, and survives a power cycle.",
    dep: ["nv-memory-manager","runtime-environment"]
  },
  "emissions-diagnostics": {
    s: "The legally mandated monitoring of emission-related systems with standardized codes and readiness indicators that any inspection tool can read.",
    d: "Monitors check catalysts, sensors, evaporation systems and, on electric vehicles, battery and charger parameters. Results appear as standardized codes through a defined connector and protocol, alongside readiness flags that show whether every monitor has completed since the last clear. Regulations set thresholds and the time to illuminate a malfunction lamp. Hard parts are completing each monitor under real driving, avoiding false positives and keeping data tamper-resistant. Recent rules extend to remote and in-use data reporting.",
    k: ["Monitors run whenever conditions allow vs scheduled monitor windows: less intrusive; some monitors rarely complete in certain usage.", "Standardized scan tool access vs manufacturer-only access: serves independent workshops and inspectors; a larger interface to protect."],
    p: ["Clearing codes right before inspection resets readiness flags and gives a misleading pass.", "A monitor that never finishes under a driver's typical trip leaves the vehicle permanently 'not ready'."],
    v: "Clear codes on a test vehicle, run the standard drive cycle, and confirm all readiness flags set, then inject a catalyst fault and confirm the lamp turns on within the regulated number of cycles.",
    dep: ["fault-memory","uds-diagnostic-services","powertrain-control"]
  },
  "routine-and-io-control": {
    s: "Diagnostic functions that start a test routine or temporarily take over an output, such as running a pump or opening a valve, from a tester.",
    d: "A tester requests a routine by identifier with start, stop and result operations, or overrides an actuator with a defined value for a defined time. Controllers check preconditions such as standstill before they allow it and restore normal control on timeout or on session end. These functions support assembly-line checks, workshop tests and calibration. The difficulty is safety: unconstrained actuator overrides on a moving vehicle are dangerous, so every routine needs its own conditions and a guaranteed exit.",
    k: ["Controller-enforced preconditions vs tester-trusted use: safe against tool errors; each routine needs extra logic.", "Time-limited overrides vs overrides until cancelled: a lost tester cannot leave an actuator forced; long tests need repeated keep-alive."],
    p: ["An output override that persists after the tester disconnects leaves a pump or lamp forced on.", "A routine reachable in the wrong session lets a remote attacker move an actuator."],
    v: "Start a pump test at standstill and confirm it runs, then start driving or disconnect the tester, and confirm the override ends and normal control is restored within the specified time.",
    dep: ["uds-diagnostic-services","access-control-policy"]
  },
  "diagnostic-data-description": {
    s: "The machine-readable description of every diagnostic service, data identifier, fault code and routine of a controller, used to generate tester and ECU software.",
    d: "Suppliers deliver a description in a standard exchange format listing services, parameters, units, conversions, session rules and fault texts. Tools generate the controller's diagnostic configuration and the tester's database from it, so both sides agree. The same data drives workshop tools, the remote backend and test automation. Difficulty comes from consistency across dozens of controllers and variants and from keeping the description in step with the software, since errors surface only when a tester reads a wrong value.",
    k: ["One description generating both sides vs separate manual implementations: no mismatch; generator limits can block unusual behavior.", "Per-variant description files vs one parametric file: exact for each variant; many files to maintain."],
    p: ["A scaling factor wrong in the description makes workshops read a temperature ten times too high.", "Descriptions delivered after software freeze get adapted by hand and diverge from the code."],
    v: "Generate the tester database from the description and read every data identifier from a test controller, comparing each value to a reference measurement and unit.",
    dep: ["vehicle-signal-catalog"]
  },
  "update-client": {
    s: "The on-vehicle agent that downloads packages, schedules installation and reports results, working with the cloud campaign manager and the vehicle's state.",
    d: "It checks in with the backend, receives an update plan, downloads packages in resumable pieces, stores them in staging and waits for suitable conditions. It then hands installation to the orchestrator, monitors results, and reports each stage with versions and failures. It must work through poor coverage, low storage and interrupted power. Consent and notification to the user are part of the flow. The challenge is robustness: the client must always be able to recover itself and report problems.",
    k: ["Resumable chunked download vs whole-file download: tolerates weak links; adds bookkeeping and integrity checks per chunk.", "User consent before install vs silent update: respects use and law in some regions; many updates wait indefinitely."],
    p: ["A client that cannot update itself is the one component that turns a fixable problem into a workshop visit.", "Downloading over a roaming cellular link generates a large unexpected bill."],
    v: "Interrupt the connection halfway through a download on a test vehicle, restore it, and confirm the download resumes from the last verified piece and completes with a matching hash.",
    dep: ["package-verification","update-preconditions","multi-ecu-update-orchestrator","connected-services-gateway"]
  },
  "package-verification": {
    s: "Checks that an update package is authentic, intact, intended for this vehicle and not older than what is installed, before and during installation.",
    d: "The package manifest is signed by the manufacturer's key, and each payload has a hash. The client verifies the signature chain, the target hardware and software compatibility, a version counter to block downgrades, and optionally a second signature for sensitive controllers. Verification repeats on the receiving controller, so a compromised gateway cannot inject code. Keys are stored in secure hardware. The difficulty is key rotation over fifteen years and handling controllers without much processing power.",
    k: ["Controller verifies the signature itself vs trusting the gateway: strong end-to-end guarantee; each controller needs crypto support and keys.", "Anti-rollback counters vs allowing downgrades: blocks reinstalling known-vulnerable software; a legitimate recovery then needs a signed override."],
    p: ["Verifying only the outer package leaves inner payloads replaceable.", "A signing key lost or compromised with no rotation plan means no more trusted updates for the fleet."],
    v: "Tamper with one byte of a payload, and then try an older signed version, and confirm both are rejected by the target controller with distinct recorded reasons, while the correct package installs.",
    dep: ["hardware-security-module","in-vehicle-key-management","secure-boot"]
  },
  "delta-updates": {
    s: "Updates built from the difference between an installed version and a new one, so only changed data is transmitted and applied.",
    d: "The build system computes a binary patch between two known versions. The client applies it to the installed image in staging, checks the result against the expected hash, and installs. It reduces transmitted data by an order of magnitude for typical releases. Patches only apply to an exact base, so the backend must know the version in each vehicle and keep patches for each source version. Applying a patch needs memory and time on small controllers.",
    k: ["Delta from exact installed version vs full image: much smaller download; many patches to build and a wrong base fails the patch.", "Block-level binary diff vs file-level diff: small and format-agnostic; ignores structure so can be larger when code shifts."],
    p: ["A vehicle on an unexpected base version fails to apply the patch, and no full-image fallback is prepared.", "Patch application consumes more RAM than a small controller has free."],
    v: "Apply a delta to a controller at the expected base and confirm the resulting image hash equals the full release's hash, then apply it at the wrong base and confirm a clean failure with the original image intact.",
    dep: ["software-inventory-registry","package-verification"]
  },
  "dual-bank-flash": {
    s: "Keeping two copies of software in flash so a new version is written to the inactive copy while the vehicle runs, then activated with a switch.",
    d: "The active bank runs the vehicle; the update writes and verifies the inactive bank. At the next restart the bootloader switches to the new bank and starts a trial. If the software does not confirm health within a limit, the bootloader reverts to the old bank. It avoids long downtime during programming. The cost is flash: it needs roughly double storage or hardware that swaps address ranges. Difficulty is shared data that must stay compatible with both versions.",
    k: ["Two full banks vs a single bank with a backup loader: fast, safe rollback and no downtime; doubles flash cost.", "Trial boot with confirmation vs immediate commit: catches bad software; requires reliable health checks that do not confirm too early."],
    p: ["Both banks end up corrupted by an update that writes to the wrong region, leaving the controller unbootable.", "Persistent data written by the new version cannot be read after reverting to the old one."],
    v: "Install a deliberately faulty version, restart, and confirm that the bootloader falls back to the previous bank after the trial limit and that the controller reports the failed update.",
    dep: ["bootloader","rollback-and-recovery","nv-memory-manager"]
  },
  "multi-ecu-update-orchestrator": {
    s: "Coordinates the installation of dependent software across many controllers so the vehicle ends in a consistent, tested combination or returns to the previous one.",
    d: "An update plan lists controllers, order, dependencies and the target set of versions. The orchestrator distributes packages over the network, asks each controller to install, waits for results, and activates all together or in the required order. Some controllers cannot function mixed. If any step fails, it restores earlier versions. The difficulty is partial failure: controllers with different update mechanisms, some in a different network, finish at different times, and power can fail at any point in the sequence.",
    k: ["Atomic activation of all controllers vs sequential: no mixed states; requires staging space and synchronized restart.", "Central orchestration in the gateway vs distributed coordination: single place for rules and logs; the gateway must be the most trusted and reliable component."],
    p: ["Updating the gateway first breaks the path to the controllers that still need packages.", "A plan written for the factory configuration fails on a vehicle with an aftermarket accessory."],
    v: "Fail the installation on the last of five controllers, and confirm the orchestrator restores the other four to their previous versions and the vehicle reports a consistent, drivable set.",
    dep: ["update-client","dual-bank-flash","central-gateway","rollback-and-recovery"]
  },
  "rollback-and-recovery": {
    s: "Restores a working software set after a failed or harmful update, and recovers controllers that no longer boot.",
    d: "Rollback uses the retained previous version, the bootloader's fallback and health confirmation. Recovery covers worse cases: a bootloader that accepts a signed recovery image over the network or a diagnostic connection, or a minimal safe mode that allows driving at reduced function. Telemetry tells the backend what failed. The difficulty is deciding what is safe to roll back, since data formats may have changed, and defining who can force a recovery.",
    k: ["Automatic rollback on failed health check vs manual workshop decision: quick restoration for the customer; the health check may be wrong and revert a good update.", "A minimal recovery loader in protected flash vs full image redundancy: small and cheap; limited functionality until a full update completes."],
    p: ["A rollback that restores code but not the data schema leaves the older software crashing on newer data.", "A recovery path that is never tested fails the first time it is needed."],
    v: "Brick a test controller's main image on purpose, and confirm the recovery loader accepts a signed image over the diagnostic network and the controller returns to normal operation without hardware replacement.",
    dep: ["bootloader","package-verification","secure-boot"]
  },
  "update-preconditions": {
    s: "The conditions a vehicle must satisfy before an update starts: parked, enough battery, safe temperature, and no drive or charge in progress.",
    d: "The client checks vehicle state through the data broker: gear in park, battery state above a minimum or charger connected, ambient temperature in range, and no other update or diagnostic session. Different controllers add their own rules. Conditions are rechecked during the install and the update pauses when one fails. Users may be asked to confirm. The difficulty is balancing safety against the chance to ever update; too strict and fleets never get patched.",
    k: ["Strict conditions vs relaxed ones: avoids a vehicle that is unusable during an update; leaves some customers perpetually unpatched.", "Checks by the client only vs by each controller as well: defends against a faulty client; adds logic in every controller."],
    p: ["An update started at low battery drains the vehicle halfway and strands the car in an unbootable state.", "A precondition that depends on a signal missing in some variants means those variants never update."],
    v: "Start an update with the battery just below the minimum and confirm the install does not begin, then connect a charger and confirm it proceeds, with each decision logged with the signal values used.",
    dep: ["vehicle-data-broker","machine-state-management"]
  },
});
