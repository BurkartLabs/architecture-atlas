// Details for the device driver framework plate, part 4: power, firmware, trust, diagnostics, cross-cutting.
ATLAS.details("device-drivers", {
  "power-states": {
    s: "The set of low-power states a device can enter, from fully on to powered off, with the context each state loses and the time to leave it.",
    d: "Devices define a small ladder of states. Each saves more power than the last, loses more internal state, and takes longer to resume. Some bus standards define the states and a standard way to enter them; others are driver-specific. The driver chooses a target state for each transition, saves registers that will be lost, and restores them on resume, then reinitializes what cannot be restored. It is hard because the exit latency and the state lost vary per device, a state that loses state needs complete restore code, and wake events must stay armed.",
    k: ["Deep state with full restore versus shallow state that keeps context: deep saves the most power, but restore code is long and rarely exercised.", "Bus-defined states versus driver-defined: bus states are uniform and generic, but real devices often have finer and quirky modes."],
    p: ["Restore code misses one register that is lost in the deep state, and the device misbehaves only after the tenth suspend.", "Exit latency exceeds what the driver assumed and the first access after resume fails."],
    v: "Cycle a device through every supported state a thousand times, with traffic after each exit. The device must pass a full functional test each time and its measured power must match the stated figure.",
    dep: ["device-object","bus-type"]
  },
  "system-sleep": {
    s: "The ordered sequence by which every device saves state and powers down when the whole machine suspends, and powers up and restores state when it resumes.",
    d: "Suspend runs in phases over the device tree: prepare, suspend, late suspend and noirq, quiescing devices from leaves to root, stopping interrupts, then entering the platform's sleep state. Resume reverses the order. Each phase has a callback so drivers can do work at the right moment, for example sleeping operations early and interrupt-masked work late. It is hard because one failing device must abort the whole suspend cleanly, ordering must honor dependencies, and any device that does not restore correctly shows up as a hang at resume.",
    k: ["Phased callbacks versus a single suspend call: phases let drivers do work with the right services available, but multiply the interface and the ways to get ordering wrong.", "Abort on failure versus continue past a failed device: abort preserves a working system, but one broken driver can block sleep entirely."],
    p: ["A driver tries to sleep in a callback after interrupts are disabled and the system hangs.", "A device is suspended before a consumer that still needs it and a late I/O faults."],
    v: "Suspend and resume a thousand times with devices active, logging each callback. Every device must be called in a valid order, every resume must succeed, and a deliberate failure in one device must abort cleanly and leave all others running.",
    dep: ["device-hierarchy","power-states","supplier-links","wakeup-sources"]
  },
  "runtime-pm": {
    s: "Automatic power saving while the machine runs: a usage count per device lets the framework suspend idle devices and resume them on demand, and the parents in turn.",
    d: "A driver brackets each use with get and put calls on a usage count; when it reaches zero and an autosuspend delay passes, the framework calls the driver's runtime suspend and propagates to the parent when all its children are idle. A get on a suspended device resumes it, synchronously or asynchronously. Wake-up signals can request resume. It is hard because resume may be requested from contexts where sleeping is not allowed, counts must balance on every path, and interrupts or timers that arrive while suspended need a defined way to wake the device.",
    k: ["Autosuspend delay versus immediate suspend: a delay avoids thrash for bursty use, but keeps the device powered after use.", "Synchronous resume in the caller versus deferred resume: synchronous is simple, but cannot be used in atomic contexts, where the work must be deferred."],
    p: ["A usage count is not released on an error path and the device stays awake forever, draining the battery.", "A register access in an interrupt handler hits a suspended device and the bus hangs."],
    v: "Leave a device idle past its delay and confirm its power state and its parent's change to suspended. Issue one request and confirm the device resumes, completes it and returns to suspended, with counts back at zero.",
    dep: ["power-states","device-hierarchy","wakeup-sources","power-domains"]
  },
  "wakeup-sources": {
    s: "The record of which devices may wake the system or a suspended device, and the bookkeeping that keeps the machine awake while a wake event is being handled.",
    d: "A device that can generate wake events is marked capable, and an operator or the driver may enable it. During suspend, the framework arms the wake mechanism for enabled sources, such as a line on the interrupt controller or an in-band signal on a bus. When an event arrives, a wake source holds the system awake until the event has been delivered to user space. It is hard because an event during the suspend sequence can be lost, arming mechanisms differ per bus, and the system must not sleep again before the program consuming the event has run.",
    k: ["Wake sources holding the system awake versus a fixed timeout: holding is exact and avoids lost events, but a bug leaves the machine awake, while timeouts are simple and sometimes too short.", "Per-device wake enable versus global: per-device lets the operator limit spurious wakes, but each device needs a correct arming path."],
    p: ["A wake event arrives during the suspend sequence and the system sleeps through it.", "A source is armed on a line that is shared, and an unrelated device wakes the machine."],
    v: "Enable one wake source and suspend. A real event must wake the machine and keep it awake until the user-space reader has consumed it; with the source disabled, the same event must not wake it.",
    dep: ["system-sleep","interrupt-domains","runtime-pm"]
  },
  "latency-constraints": {
    s: "Limits placed by drivers or programs on how long a device or CPU may take to respond, which the power framework respects when choosing sleep depth.",
    d: "Drivers and programs register constraints, such as maximum resume latency for a device or maximum wake latency for the system. The framework takes the strictest of all constraints and rejects power states whose exit time exceeds it. Per-device limits also affect parent domains. Devices like audio and radio set constraints while streaming. It is hard because constraints are global, one forgotten request pins the machine at shallow states, and a constraint set too late has no effect on a state already entered.",
    k: ["Aggregate strictest constraint versus per-use arbitration: strictest is simple and safe, but one demanding user prevents savings for everyone.", "Constraints scoped to a device versus the whole system: device scope saves power elsewhere, but needs correct propagation through parents."],
    p: ["A program sets a latency request and never releases it, so the machine never reaches deep sleep.", "A constraint is added after the device entered a state that already violates it."],
    v: "Set a tight latency request, confirm through counters that deep states are no longer entered and wake latency stays within it, then release the request and confirm deep states return.",
    dep: ["runtime-pm","power-states","power-domains"]
  },
  "power-domains": {
    s: "Groups of devices that share a power rail or clock gate and so switch on and off together, tracked so the domain powers down only when all its members are idle.",
    d: "A domain driver implements power on and power off for a block of silicon. Devices are attached by the description; the framework keeps the domain on while any member is active and runs the driver's callbacks when the last one goes idle. Domains nest, with parent domains held on by active children. It is hard because power-up must follow dependencies such as clocks and resets, device state is lost on power-off so each member must save and restore, and shared domains couple the behavior of unrelated drivers.",
    k: ["Domain-level control versus per-device control: domains match the hardware and save more power, but one stuck member keeps the whole domain on.", "Saving state in the domain callbacks versus in each driver: domain-level saving is generic, but only drivers know what to restore."],
    p: ["A domain powers off while a member still has an outstanding DMA, and the transfer corrupts memory.", "The domain is powered on before its parent, causing a bus fault on the first access."],
    v: "Idle every member of a domain and confirm it powers off, measured by rail. Then wake one member and confirm the domain, its parent, then the device resume in order and the device passes a register test.",
    dep: ["runtime-pm","clock-regulator","device-hierarchy"]
  },
  "device-frequency-scaling": {
    s: "Adjusting a device's clock and voltage to match load, with governors that pick operating points for graphics, memory, buses and accelerators.",
    d: "A device exposes a table of operating points, each a frequency and the voltage it needs. A governor samples utilization or receives requests and selects a point; the framework changes voltage and frequency in a safe order, raising voltage first for a speed-up and lowering it last for a slow-down. Constraints from other users, such as thermal limits and bandwidth requests, bound the choice. It is hard because switching takes time, the right point depends on workload patterns, and a request from a subsystem such as a display must be satisfied within a deadline.",
    k: ["Load-based governor versus explicit requests from consumers: load-based works without cooperation, but reacts late, while requests are timely but need every consumer to participate.", "Fewer wide operating points versus many fine ones: fewer points are easy to validate, but waste power between them."],
    p: ["The governor drops frequency at the instant a burst begins and the device misses a display deadline.", "Voltage is lowered before frequency, and the device glitches."],
    v: "Run a ramping workload and log chosen operating points, then confirm frequency rises before deadlines are missed and voltage always leads frequency on increases. Drop the load and confirm return to the lowest point.",
    dep: ["clock-regulator","thermal-class","runtime-pm"]
  },
  "firmware-loader": {
    s: "The service by which a driver requests a named firmware image, receives it in memory, passes it to the device, and releases it after the device has copied it.",
    d: "A driver calls the loader with a file name; the loader locates the image in the filesystem or an initial image, optionally decompresses it, and returns a buffer. The driver writes it to the device, which executes it. Requests can be synchronous or asynchronous, and some are optional. If the image is missing the request fails or waits. It is hard because the filesystem may not be available at probe time during early boot, images carry a version that must match the driver, and a missing file turns a working device into a failed probe.",
    k: ["Load in probe versus on first use: loading in probe fails early, but delays boot and needs the filesystem, while first use lets probe finish at the cost of a delayed first access.", "Firmware in the kernel image versus separate files: built-in is always available, but makes images big and ties updates to kernel updates."],
    p: ["Probe requests firmware before the root filesystem is mounted and the device fails permanently.", "The image on disk is older than the driver expects and the device malfunctions in unclear ways."],
    v: "Remove the image and confirm probe reports a clear error naming the file. Restore it and confirm the device loads it, reports the image version and passes a functional test. Boot with the image in the early image and confirm no filesystem is needed.",
    dep: ["firmware-search","probe-and-bind"]
  },
  "firmware-search": {
    s: "The ordered list of places the loader searches for an image, and what happens when none holds it: wait, ask user space, or fail.",
    d: "The loader searches paths in a fixed order: images built into the kernel, the early image, directories under the system root that are versioned by kernel release, and shared directories. A fallback path asks a user-space helper to supply the file through a temporary interface. Compressed variants are tried by extension. Search results are cached for the driver's later requests. It is hard because order determines which version wins, a helper may not be running yet, and extra paths added by an operator can supply untrusted code to a privileged device.",
    k: ["Fixed search path versus a custom path set by the operator: fixed is predictable and secure, but a custom path lets images be supplied from non-standard locations.", "User-space fallback versus fail: fallback supports on-demand or generated images, but needs a helper and timeout, while failing is simpler and immediate."],
    p: ["Two versions exist in different directories and the wrong one is silently chosen.", "The fallback waits for a helper that is not running, and probe stalls for a long timeout."],
    v: "Place different versions in two search directories and confirm the loader picks the one by documented order and logs its path. Remove both and confirm the failure arrives within the stated timeout.",
    dep: ["firmware-loader"]
  },
  "firmware-cache": {
    s: "Keeping needed firmware images in memory across suspend, so devices can reload code on resume before storage is available again.",
    d: "Before system sleep, the loader records the names of images devices have used and keeps copies in memory. On resume, a driver reloading its image gets the cached copy at once, without touching storage that is not yet running. After the system is fully up, the cache is released. Devices that lose their loaded code in sleep need this. It is hard because the cache must be filled before the filesystem goes away, and memory is held for every image whether or not the device resumes.",
    k: ["Cache across sleep versus reload from storage: cache makes resume fast and independent of storage, but holds memory during sleep and needs a prefill step.", "Cache only images in use versus all known: in-use keeps memory small, but misses images needed by devices first used after resume."],
    p: ["The cache is built after storage is already suspended and the capture fails.", "Cache entries are not freed after resume and hold memory for the rest of the run."],
    v: "Suspend a machine with a device that loses its code, resume with storage artificially delayed, and confirm the device reloads from the cache and works before storage returns, with the cache freed afterward.",
    dep: ["firmware-loader","system-sleep"]
  },
  "firmware-update": {
    s: "A driver-supported path to replace the firmware stored on a device, with version reporting, authenticated images and recovery if the update is interrupted.",
    d: "Devices expose their current version and accept a new image through a class interface or a control node. The driver streams the image to the device's flash, the device validates its signature, and the new code activates after a reset. Dual-bank layouts keep the old image until the new one proves itself. It is hard because a power loss during writing can leave a device unusable, images must be authenticated against a key in hardware, and an update changes device behavior under a driver that was tested against the old version.",
    k: ["Dual-bank with rollback versus single image: dual-bank survives interrupted updates, but needs twice the flash and a way to confirm that the new image is good.", "Device verifies the signature versus host verifies: device-side checks protect against any path, but host-side checks give clearer errors earlier."],
    p: ["Power is lost mid-write on a single-bank device and it never boots again.", "An update changes a command format and the driver on the machine still uses the old one."],
    v: "Apply an update and confirm the reported version changes after reset. Cut power at random points in repeated trials and confirm the device always boots either the old or new image, and an unsigned image is rejected.",
    dep: ["firmware-loader","driver-signing","device-reset"]
  },
  "driver-isolation": {
    s: "Limiting what a driver can touch: whether it runs in the kernel's address space with full privilege, in a restricted kernel domain, or in a separate process with specific rights.",
    d: "Isolation ranges from none, where a driver is kernel code and can read or write anything, through language and verification techniques and hardware memory domains inside the kernel, to separate address spaces with capabilities to specific registers, interrupts and memory windows. Every step adds a boundary to cross for each request. DMA bypasses CPU-side isolation, so the IOMMU is needed for any of it to hold. It is hard because stronger isolation costs performance and engineering, and weaker isolation means one bug is a system compromise.",
    k: ["Drivers in the kernel versus in separate processes: in-kernel is fastest and simplest, but a driver bug is a system bug, while separate processes contain faults at the cost of crossings.", "Isolation of CPU access only versus including DMA: CPU-side isolation is cheap, but without the IOMMU a driver's device can still write anywhere."],
    p: ["A driver is run in a user process with CPU isolation, but its device is not confined by the IOMMU and still writes to kernel memory.", "A crossing costs so much that the isolated driver cannot reach the device's rated speed."],
    v: "Make a test driver deliberately write to a wild address and program a wild DMA. The write must fault inside the driver's domain and the DMA must be blocked, with the rest of the system unaffected.",
    dep: ["iommu-domains","uspace-io-mapping","trust-boundary"]
  },
  "fault-containment": {
    s: "Detecting that a driver or device has failed and limiting the damage to that device, instead of letting a panic, hang or corrupted memory spread through the system.",
    d: "Detection comes from watchdog timers on requests, checks of device status, bus error reports, and faults inside the driver. Containment decides the response: fail the request, disable the device, reset it, restart the driver, or in the worst case halt. Counters track repeated failures to stop crash loops. Resources the driver held are reclaimed. It is hard because most drivers share the kernel's memory, so a faulting driver may already have corrupted shared state, and detecting a hang requires bounded time on every wait.",
    k: ["Timeouts on every device wait versus trusting the hardware to respond: timeouts turn hangs into recoverable errors, but choosing values is hard and short ones cause false failures.", "Disable a repeatedly failing device versus retry forever: disabling protects the system, but loses a device that a retry might have saved."],
    p: ["A wait loop polls a bit that never sets and locks up a CPU with interrupts off.", "A crash loop restarts a driver continuously and consumes the system."],
    v: "Inject a hang, a stuck status bit and an all-ones read into a test device. Each must be detected within the configured bound, produce an error to the caller and leave other devices operating.",
    dep: ["bus-error-reporting","device-reset","driver-isolation"]
  },
  "driver-recovery": {
    s: "Restarting a failed driver and restoring service transparently where possible: reinitializing the device, replaying or failing outstanding requests, and telling clients.",
    d: "A supervisor notices a failure, stops the driver, resets the device, starts a fresh instance with a clean state and reconnects clients. Stateless request-response devices recover easily; ones with device-held state need the clients to replay. In-kernel drivers use reset-and-reprobe with the same effect. Recovery of the storage that holds the root filesystem needs special care. It is hard because requests in flight may have partly happened, clients must be written to retry safely, and a device that always fails recovers into the same failure.",
    k: ["Transparent recovery versus reporting the failure: transparent hides faults from clients, but non-idempotent requests that may have been done twice need care.", "Fresh instance versus repair in place: a fresh instance clears corrupted driver state, but loses any state that was valid."],
    p: ["A write is replayed after recovery although it had already completed, and data is duplicated.", "The recovery path itself needs the failed driver, such as for storage holding the driver image."],
    v: "Kill the driver during sustained I/O and confirm service resumes within the stated time, every request either completes exactly once or returns a defined error, and a data checksum over the workload matches.",
    dep: ["device-reset","fault-containment","probe-and-bind","unbind-remove"]
  },
  "device-reset": {
    s: "Returning a device to a known state, at several scopes from a function-level reset to a full link or power cycle, used in probe, recovery, reassignment and error handling.",
    d: "Resets differ by scope: a device-level reset command, a function reset in the bus protocol, a link reset that affects everything below a bridge, or a power cycle. Each takes time and may need state saved first and restored after. Reset is the first step in probe, ensuring no earlier owner's state remains. It is hard because the methods are not all available on a given device, waiting for the device to become ready needs bounded timeouts, and a reset that affects siblings must be coordinated with their drivers.",
    k: ["Narrow function reset versus wide link reset: narrow disturbs only one device, but may not clear a wedged state, while the wide reset is thorough at the cost of siblings.", "Reset at probe versus trusting the previous state: resetting guarantees a clean start, but takes time and is skipped in fast-boot paths at some risk."],
    p: ["The reset method is not supported and the driver proceeds as if it worked, inheriting a previous owner's state.", "The driver accesses the device before it becomes ready after reset and reads garbage."],
    v: "Dirty a device's state, reset it with each supported method and read back every register. Values must equal their documented defaults and the device must pass a function test, with sibling devices undisturbed.",
    dep: ["bridge-topology","probe-and-bind"]
  },
  "stable-abi": {
    s: "A promise that compiled drivers keep working across kernel versions, so vendors can ship a driver once and it runs without rebuilding as the kernel is updated.",
    d: "A stable binary interface fixes the layout of structures and the meaning of calls the driver uses, versioned and extended compatibly. Drivers can then be built separately from the kernel and loaded by any compatible version. It requires the kernel to keep old interfaces working, including internals that would otherwise change freely, and to translate or shim calls. It is hard because every internal detail a driver can reach becomes permanent, which slows the kernel's evolution, and a driver that uses an undocumented detail breaks anyway.",
    k: ["Stable binary interface versus changing internals freely: stable allows separately distributed drivers, but the kernel carries its old interfaces forever and cannot fix poor designs.", "Narrow stable interface for a class versus the whole kernel: narrow limits the maintenance cost, but drivers needing more must be rebuilt for each version."],
    p: ["A driver relies on a structure field that was documented as internal and breaks on the next update.", "Compatibility shims hide a semantic change, and a driver built for an old version behaves incorrectly."],
    v: "Load a driver built against version N into versions N+1 through N+k without rebuilding. It must bind, pass its functional suite and report any unsupported interface use rather than crashing.",
    dep: ["driver-object","interface-stability"]
  },
  "in-tree-model": {
    s: "Keeping all drivers in the kernel's own source and build, so interface changes are made by the people who change the interface, and drivers are updated together.",
    d: "Drivers live in the same repository, are built by the same system and are reviewed by the same maintainers. When an internal interface changes, the change author updates every user in one commit. Out-of-tree vendors must rebuild for each version or upstream their driver. The model removes the need for a stable binary or source interface. It is hard because it demands a large and active maintainer community, orphaned drivers for old hardware rot, and a vendor with an unreleased driver has no way to run it on new kernels.",
    k: ["Everything in one tree versus separate driver releases: in-tree lets internal interfaces evolve and all drivers be fixed together, but forces every driver through the kernel's review and release cycle.", "Removing unmaintained drivers versus keeping them: removal reduces burden, but strands users of old hardware."],
    p: ["An interface change breaks a driver that nobody tests, and it remains broken until the hardware's owner reports it.", "A vendor ships an out-of-tree driver that fails on every kernel update."],
    v: "Change an internal interface and build every driver in the tree. The build must succeed with all users converted, and a boot test on representative hardware or simulators must show each class still working.",
    dep: ["driver-object","interface-stability"]
  },
  "driver-signing": {
    s: "Cryptographic proof of who built a driver and that it has not changed, with a policy that decides which signatures the kernel accepts before loading it.",
    d: "A driver image is signed at build with a private key; the kernel holds trusted public keys in protected storage and verifies the signature before mapping the code with full privilege. Policy can require signatures for all modules, allow only certain signers, or log only. Revocation lists block known-bad drivers. Hardware roots of trust anchor the keys. It is hard because a signed driver can still be buggy or malicious, key management and revocation are operational burdens, and signature checks must cover the loading path, not just the file.",
    k: ["Mandatory signature enforcement versus optional: mandatory blocks unauthorized code, but makes development and third-party drivers harder to load.", "Revocation list versus short-lived keys: a list blocks specific known-bad drivers, but must be distributed and kept current, while short-lived keys expire on their own."],
    p: ["A signed but vulnerable driver is loaded by an attacker to gain kernel access, because it was never revoked.", "A loading path skips verification, such as a firmware or option-ROM route."],
    v: "Try to load an unsigned driver, one with a modified byte and one signed by an untrusted key under enforcement. All three must be refused with logged reasons, and a correctly signed driver must load.",
    dep: ["driver-object","trust-boundary"]
  },
  "untrusted-devices": {
    s: "Treating the device itself as hostile: restricting DMA, validating everything it returns, and deciding whether external or removable hardware may bind to a driver at all.",
    d: "A malicious device on a hot-pluggable port can send malformed descriptors, lie about sizes, issue DMA to arbitrary addresses, or impersonate another class. Defenses include IOMMU confinement for external ports, authorizing devices before binding, restricting classes allowed on a port, validating lengths and indices from device-written memory, and bounce buffers that keep device-visible memory separate. It is hard because drivers were written assuming honest hardware, device-written memory can change between a check and its use, and user convenience pulls against restrictive defaults.",
    k: ["Authorize on connect versus allow by default: authorization stops unknown devices from probing drivers, but needs a user or policy step for each new device.", "Validate each field read from the device versus trust the protocol: validation is the only defense against hostile hardware, but takes effort in every driver."],
    p: ["A driver reads a length from a device-owned buffer twice, and the device changes it between the check and the copy.", "A device claims to be a keyboard and a user-space policy lets it inject keystrokes."],
    v: "Attach a test device that sends oversized lengths, changes values mid-read and issues out-of-window DMA. The driver must reject bad input without a fault, and the IOMMU must block the DMA with no memory changed.",
    dep: ["iommu-domains","usb-host-stack","peripheral-interconnect","trust-boundary"]
  },
  "simulated-devices": {
    s: "Software models of devices that present the same register or queue interface to a driver, so drivers run, and are tested, with no hardware at all.",
    d: "A model implements the device's behavior in software, either inside the kernel as a test driver, in a virtual machine monitor, or in an emulator that models a bus. The driver binds to it through the normal model and cannot tell the difference. Models can be exact or simplified and can follow a specification, so they test conformance. It is hard because a model reflects its author's understanding, the real device's quirks are not in it, and a passing test proves only agreement with the model.",
    k: ["Model written from the specification versus recorded from hardware: spec-based models test conformance, but miss real quirks, while recorded behavior is accurate and narrow.", "Model in the kernel versus in a virtual machine monitor: in-kernel is fast and simple to run, but a model bug can crash the host."],
    p: ["The model and the driver share the same misreading of the specification, and the test passes while real hardware fails.", "The model responds instantly, hiding timing bugs the real device exposes."],
    v: "Run the driver's full functional suite against the model in continuous integration, then run the same suite on one real device. Any result that differs between them must be explained by a documented model limit.",
    dep: ["virtual-buses","probe-and-bind","register-mocks"]
  },
  "register-mocks": {
    s: "Test doubles that replace the register accessors so a driver's logic can be run in isolation with scripted device responses, including errors the hardware rarely produces.",
    d: "The driver's register access goes through a layer that tests can replace. A mock records each write, returns scripted values for reads, and can fire interrupts at chosen points. Tests assert the exact sequence of accesses to the device, such as the order of initialization writes. Tests run as ordinary programs or in the kernel's test framework, quickly and in large numbers. It is hard because tests of exact sequences break on harmless refactoring, and they check the driver against the scripter's idea of the device.",
    k: ["Assert exact access sequence versus assert resulting state: sequence catches ordering errors the hardware depends on, but breaks on harmless changes.", "Replace accessors per driver versus a generic bus mock: per-driver mocks are exact, but a bus mock is reusable across many drivers."],
    p: ["A test asserts the old sequence and fails after a correct optimization, and people stop trusting it.", "Mocked reads always return success and the error handling is never exercised."],
    v: "Script the device to fail at each step of initialization in turn and confirm the driver unwinds every time, leaving no resources held, with the accessor mock recording the expected cleanup writes.",
    dep: ["accessors-barriers","simulated-devices"]
  },
  "fault-injection": {
    s: "Deliberately making allocations, transfers, interrupts and device responses fail at chosen points, to exercise the error paths drivers almost never run.",
    d: "Hooks in allocation, mapping, bus transfer and request paths fail on a schedule or at random with configured probability and filters. Combined with simulated devices, a test can make the device time out, return garbage, vanish mid-operation, or lose an interrupt. Systematic modes fail the nth call in turn, covering every failure site once. Failures are logged so they can be reproduced. It is hard because many error paths are untested and can crash on first use, and finding which failure caused a later symptom needs good logs.",
    k: ["Systematic nth-call failure versus random injection: systematic gives complete coverage of every site, but is slow, while random finds interactions between failures.", "Inject in the framework versus in the simulated device: framework injection covers all drivers at once, but device-level injection produces realistic protocol failures."],
    p: ["Error paths crash on first execution because they were never run, which tests find only after shipping.", "A failure injected in an unrelated subsystem masks the one under test."],
    v: "Fail each allocation and each transfer in probe and in a request path in turn. Every run must end with an error return, nothing leaked and no crash, and a repeat with injection off must succeed.",
    dep: ["simulated-devices","managed-resources","dma-mapping-api"]
  },
  "hardware-rigs": {
    s: "Test setups with real devices attached to controllable fixtures, for power cycling, unplugging, signal faults and long-duration runs that simulations cannot cover.",
    d: "A rig holds actual hardware with remote power control, switchable connections that can insert and remove devices, traffic generators, and measurement of latency and power. Automation runs the driver suite against each device, reports results, and repeats under load, temperature or noise. It finds timing, electrical and quirk problems that models lack. It is hard because rigs are expensive and shared, tests are slow, hardware wears out and varies across batches, and flakiness needs the rig itself to be ruled out as the cause.",
    k: ["Dedicated rig per device versus shared pool: dedicated rigs run continuously with no contention, but multiply cost, while shared pools are cheaper and need scheduling.", "Run on every change versus nightly: every-change catches regressions early, but hardware time is limited, so a nightly run is the usual compromise."],
    p: ["A flaky cable is mistaken for a driver bug and sends developers on a long chase.", "A rig is out of date and passes on firmware that no customer runs."],
    v: "Run the hotplug cycle test on the rig for a thousand cycles with power-cycling at random points. Pass criteria are no leaked objects, no crash and a working device after each cycle, with the rig's own self-test passing before and after.",
    dep: ["simulated-devices","hotplug-events","device-reset"]
  },
  "conformance-suites": {
    s: "Standard test programs per device class that exercise the class interface and report violations, so any driver can be checked against what user space expects of the class.",
    d: "A suite opens the class node, issues every defined control call and edge case with valid and invalid arguments, checks returned values and state changes, and tests concurrency, removal during use, and power transitions. The same suite runs against every driver in the class, real or simulated. Results are reported with identifiers so regressions are tracked. It is hard because classes have ambiguous behavior at the edges, drivers legitimately support subsets, and the suite must tell a missing optional feature from a failure.",
    k: ["One suite for the whole class versus per-driver tests: a class suite finds inconsistencies between drivers, but per-driver tests can cover hardware-specific behavior.", "Strict failure on any deviation versus allowing documented variations: strictness keeps drivers uniform, but may reject legitimate hardware limits."],
    p: ["A suite treats optional behavior as required and reports false failures for valid drivers.", "A driver passes the suite yet fails a program that uses an unusual call order the suite never covers."],
    v: "Run the class suite against every driver in the class and a known-bad driver. The good ones must pass, the bad one must fail with the specific violation named, and results must be stable across repeated runs.",
    dep: ["simulated-devices","control-calls"]
  },
  "driver-tracing": {
    s: "Low-overhead trace points inside the framework and in drivers that record events with timestamps, so the sequence of calls, interrupts and transfers can be reconstructed afterward.",
    d: "Trace points sit at interrupt entry and exit, probe and remove, power transitions, register accesses, DMA maps, and request submission and completion. When disabled they cost almost nothing; when enabled they write structured records to per-CPU buffers read by tools, with filters and triggers. Dynamic probes can attach to functions that have no trace point. It is hard because tracing at high rates changes timing, buffers overflow, and the records need enough identity, such as device and request, to join events across layers.",
    k: ["Static trace points versus dynamic probes: static points have stable names and low overhead, but only exist where authors put them, while dynamic probes reach anywhere and can break across versions.", "Per-CPU ring buffers that overwrite versus ones that stop when full: overwriting keeps the latest events before a failure, but loses the earliest."],
    p: ["Tracing every register access slows the system enough that the timing bug disappears.", "A buffer wraps before the failure is noticed and the events leading to it are gone."],
    v: "Enable tracing on one device, run a known request sequence, and confirm the trace shows submit, interrupt and completion for each request with matching identifiers and monotonic timestamps. Disabled, confirm no measurable overhead.",
    dep: ["top-half","probe-and-bind","dma-mapping-api"]
  },
  "device-introspection": {
    s: "Interfaces that expose a device's current internal state to developers and operators: registers, queue positions, counters, power state and binding, without a debugger.",
    d: "Attribute files and a debug filesystem present the model's own state, such as bound driver, power status and resources, and driver-published state such as ring indices, error counters, register snapshots and firmware logs. Tools dump and compare state, and statistics counters expose rates and errors. Some devices keep their own event log that the driver can read. It is hard because reading registers can change state or wake a device, debug interfaces are not stable or secure to expose in production, and state read in pieces is inconsistent.",
    k: ["Always-on counters versus on-demand dumps: counters give history for free, but cost cycles and memory in hot paths, while dumps cost nothing until used and show only the present.", "Debug interface compiled in versus separate build: compiled in allows inspecting production systems, but exposes internals and a security surface."],
    p: ["A register dump reads a clear-on-read status and erases the evidence of the fault being investigated.", "Dumping a suspended device wakes it, changing the behavior under study."],
    v: "Read the device's state while it is idle and under load. Counters must change consistent with the traffic, a dump must not alter device state or power state, and the interface must be absent when disabled.",
    dep: ["attribute-files","device-object","runtime-pm"]
  },
  "hang-diagnostics": {
    s: "Tools that turn a hung or crashed driver into evidence: watchdogs that detect stalls, stack and lock dumps, memory checkers and captured state saved across a reset.",
    d: "Soft and hard lockup detectors report CPUs stuck in a driver, with stack traces. Lock-dependency checkers show ordering violations, memory checkers catch use after free and out-of-bounds in driver code, and sleeping-in-atomic checks catch context violations. After a crash a dump of memory and logs is saved for analysis, and devices can be told to save their own state. It is hard because failures are rare and timing dependent, evidence can be lost in the reset, and checkers slow the system enough to need separate builds.",
    k: ["Checkers always enabled versus only in test builds: always-on finds field bugs, but costs performance, while test builds are free in production and miss what only real use triggers.", "Panic on first fault versus continue: panic preserves evidence and avoids corruption, but takes a machine down that might have survived."],
    p: ["A stuck device holds a lock and the watchdog reports a stack that shows only the victim, not the cause.", "The reset after a crash wipes the device's own log before it is collected."],
    v: "Cause a deliberate hang in a test driver and confirm the detector reports within its timeout with a stack naming the driver, and that a saved dump can be opened afterward to inspect the device's state.",
    dep: ["driver-tracing","fault-containment","device-introspection"]
  },
  "execution-context-rules": {
    s: "The rules for what code may do in each context, interrupt, atomic or process, which determine whether a driver can sleep, allocate memory or take a lock at each point.",
    d: "A driver entry point runs in a specific context. Interrupt handlers and code holding spin locks must not sleep, so they cannot wait for a bus transaction, allocate with blocking, or take a mutex. Process context may do all of these. The same driver therefore splits work across contexts, and every helper it calls has a context contract. These rules shape every layer, from the top half to the class interface. The difficulty is that violations often work in testing and fail under contention, so checks need to be systematic.",
    k: ["Strict context rules enforced by checkers versus conventions documented only: enforcement finds violations at once, but needs debug builds and annotated code.", "Do more work in process context versus inline for speed: process context is flexible and safe, but adds latency and scheduling."],
    p: ["A helper that sleeps is called from an interrupt handler on a path that was only tested with no contention.", "A callback is documented as process context but is called with a lock held."],
    v: "Run the driver's full test suite with sleeping-in-atomic checks, lock-dependency checking and preemption debugging enabled, under heavy load. No context violation may be reported.",
    dep: ["top-half","bottom-halves","threaded-irq","device-locking"]
  },
  "concurrency-and-ordering": {
    s: "The races a driver faces: between interrupts and process code, between several CPUs, between hardware and software, and between framework events such as removal and use.",
    d: "A driver runs on many CPUs while the device runs on its own. Shared state needs locks or lock-free structures; device-visible memory needs barriers; removal and suspend can arrive at any time; and interrupts can preempt everything. Each layer chooses a locking scheme, but they must compose without inversions. The decisions made here, such as per-queue locks or one big lock, determine scalability and correctness of all components. It is hard because concurrency bugs are rare, timing dependent, and often only appear on weakly ordered hardware.",
    k: ["Per-queue fine-grained locks versus a single device lock: fine-grained scales on many CPUs, but multiplies ordering rules and bugs.", "Lock-free rings with barriers versus locks around ring access: lock-free is fast, but depends on correct fences that vary by platform."],
    p: ["Two CPUs complete the same request, one from a timeout and one from an interrupt, and free it twice.", "Code is correct on strongly ordered hardware and corrupts data on weakly ordered hardware."],
    v: "Stress simultaneous submit, complete, timeout, reset, suspend and remove from many threads on a weakly ordered platform with race detection enabled. Run for hours with no corruption, lost request or lockup.",
    dep: ["device-locking","accessors-barriers","descriptor-rings","reference-counting"]
  },
  "trust-boundary": {
    s: "The decision about which code and which hardware are trusted: whether drivers share the kernel's privilege, whether devices are trusted, and where each request is validated.",
    d: "Every system chooses a line. In the traditional design drivers are trusted kernel code and devices are trusted hardware, so validation happens only at the user boundary. Stricter designs treat drivers as untrusted processes and devices as hostile, which adds the IOMMU, capability checks, input validation and signing. The choice determines the cost of every crossing and the damage a bug can do. It is hard to move later, because code written under one assumption relies on it in thousands of places.",
    k: ["Trust drivers and devices versus treat both as hostile: trusting is fast and simple, but one flaw is a total compromise, while distrust costs performance and design effort.", "Validate at the class interface versus in each driver: class-level validation is uniform, but cannot know device-specific limits."],
    p: ["A design that assumes honest devices is later exposed to untrusted removable hardware with no validation.", "Isolation is added to drivers, but a shared helper library remains in the trusted core."],
    v: "Attack each boundary with a test: malformed control-call arguments from user space, a driver wild write, a device wild DMA. Each must be stopped at the boundary the design claims, with a logged event and no change outside it.",
    dep: ["driver-isolation","iommu-domains","control-calls","driver-signing"]
  },
  "hardware-untrustworthiness": {
    s: "The assumption that hardware misbehaves: registers lie, devices hang, interrupts are lost or spurious, documents are wrong, and revisions differ, so every layer has to defend itself.",
    d: "Real devices have errata, return garbage after reset, stop responding, raise interrupts with no cause, and reorder events. Drivers carry quirk tables keyed by identity and revision, timeouts on every wait, defensive reads of status and bounded loops. Bus layers report errors and frameworks provide reset and recovery. The whole stack is built so that a misbehaving device degrades one function rather than the machine. It is hard because the faults are rare, undocumented and differ across batches, and testing finds them only on the failing unit.",
    k: ["Quirk tables per device revision versus generic code with defensive checks: quirks fix known faults precisely, but need a field report first, while defensive code tolerates unknown faults at a cost in every path.", "Distrust all status reads versus trust documented behavior: distrust is robust, but complicates every driver."],
    p: ["A new silicon revision fixes one erratum and breaks the workaround for it, so a quirk is applied to the wrong revision.", "A wait loop trusts a status bit that the device never sets after an error."],
    v: "Run each driver against devices modified by a test fixture that returns all ones, drops interrupts, raises spurious ones and stalls responses. The driver must detect each, recover or fail the device, and never hang a CPU.",
    dep: ["fault-containment","device-reset","bus-error-reporting","fault-injection"]
  },
  "interface-stability": {
    s: "The decision about which interfaces are promised not to change: the user-space contract, the driver-to-kernel interface, and the device-to-driver protocol, and what is allowed to break.",
    d: "Three interfaces have different lifetimes. The user-space interface, nodes, control calls and attribute files, is permanent, because programs outlive kernels. The driver-to-kernel interface is either frozen, so drivers can be built separately, or changed freely with all drivers updated together. The device protocol is fixed by hardware and so lives forever in driver code. This decision determines where complexity accumulates: in frozen layers, in the maintainers' work, or in vendors' build matrices.",
    k: ["Permanent user-space interface with a free internal interface versus both frozen: freezing only the outside keeps the kernel evolvable, but requires all drivers to be in the tree.", "Extensible control calls versus new calls per feature: extensible structures keep one entry point growing compatibly, but need discipline around size and unknown fields."],
    p: ["An attribute file's format changes and breaks scripts that parsed it for years.", "An internal helper is used by an out-of-tree driver and removed, breaking a product."],
    v: "Run a set of old user programs against a new kernel's driver interfaces. They must work unchanged, and any removed or altered interface must appear in a compatibility check run in the build.",
    dep: ["control-calls","attribute-files","stable-abi","in-tree-model"]
  },
  "resource-lifetime": {
    s: "The rule that every resource a driver holds has an owner and an end: memory, mappings, interrupts, DMA buffers, references and power requests all released in order on every path.",
    d: "A driver acquires resources across probe, open, requests and power transitions, and each acquisition has a matching release at unbind, close, completion or resume. Lifetimes nest and cross: a user handle outlives the device, a mapping outlives a request, an interrupt must stop before its data is freed. Frameworks provide counting, managed release and ordering rules. These choices appear in every component, and a single leak or early free is the commonest driver bug.",
    k: ["Automatic scoped release versus explicit manual release: automatic prevents most leaks on error paths, but hides ordering that hardware needs, such as stopping DMA before freeing buffers.", "Counting every holder versus tying lifetime to binding: counting is safe for any user, but lets forgotten references pin objects."],
    p: ["An interrupt handler stays registered while its data is freed on unbind, and a late interrupt crashes the system.", "A DMA buffer is freed while the device still writes to it."],
    v: "Bind and unbind a driver a thousand times with load and with injected failures, then check that memory, mappings, interrupts and IOMMU entries return exactly to the starting counts, with leak detection reporting nothing.",
    dep: ["managed-resources","reference-counting","unbind-remove","dma-mapping-api"]
  },
});
