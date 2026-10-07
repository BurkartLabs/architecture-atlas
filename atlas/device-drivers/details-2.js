// Details for the device driver framework plate, part 2: control classes, device model, binding, description.
ATLAS.details("device-drivers", {
  "input-class": {
    s: "The class that turns keys, pointers, touch surfaces and controllers into a uniform stream of typed events, with capability descriptions so one policy layer serves all hardware.",
    d: "A driver reports what its device can do, such as which keys, axes and multitouch slots exist, then emits events: type, code and value, grouped into frames that end with a sync marker. The class routes frames to handlers: event nodes for user space, key mapping, repeat and console. Report-descriptor-based devices share a generic parser that turns self-describing reports into events. It is hard because devices lie or vary, ghost and phantom touches need filtering, wakeup from sleep must be a deliberate event, and a stuck key needs a defensive release.",
    k: ["Raw events with user-space interpretation versus kernel-side gesture and key policy: raw keeps the kernel small and flexible, but every program needs a shared library to interpret touch.", "Generic descriptor parser versus per-device drivers: the parser covers whole families, but quirky devices need patches to its tables."],
    p: ["A device resumes from sleep with a key pressed in its report, and the stale key repeats forever.", "A driver omits the sync marker and clients never see the frame complete."],
    v: "Press and release keys and drag on a touch surface while recording the event stream. Every press must be followed by a release, and each frame must end with a sync marker.",
    dep: ["device-nodes","bus-enumeration","top-half"]
  },
  "sensor-class": {
    s: "The class for measurement devices such as accelerometers, light and pressure sensors: channels with scales, buffered triggered capture, events on thresholds and shared calibration.",
    d: "Each device exposes channels with a type, a raw value, a scale and an offset. Single reads return one conversion; buffered mode pushes timestamped samples from a trigger such as a data-ready interrupt or a timer into a ring. Threshold events notify when a limit is crossed. Sensor hubs aggregate many chips behind one processor. It is hard because sample timing matters, a fast sensor behind a slow bus drops samples, and power management must keep sensors that provide wake events alive while the rest sleep.",
    k: ["Raw values with scale and offset versus processed units: raw keeps the driver simple and exact, but every consumer must apply scaling correctly.", "Hardware FIFO with batched interrupts versus per-sample interrupts: batching saves power, but adds latency and complicates timestamping each sample."],
    p: ["Timestamps are taken at interrupt handling rather than conversion time, so samples from two sensors do not line up.", "A slow bus read in the interrupt path drops samples at high rates."],
    v: "Sample at the maximum rate while the CPU is loaded and confirm sample counts equal rate times duration, timestamps are monotonic with the expected spacing, and no buffer overrun is reported.",
    dep: ["serial-buses","threaded-irq","runtime-pm"]
  },
  "serial-tty": {
    s: "The class for character streams over serial lines and terminals: a driver moves bytes while a line discipline applies echo, editing, flow control and signals above it.",
    d: "A low-level port driver sends and receives bytes through a hardware FIFO and reports modem lines. Above it a line discipline implements terminal behavior, buffers input, and delivers it to the reading program, and a session layer ties it to process groups and job control. Virtual terminals and pseudo-terminals share the same upper layers. It is hard because the layers have different timing: bytes arrive in interrupt context, flow control must stop the sender before buffers fill, and hangup handling must wake blocked readers exactly once.",
    k: ["Line discipline layered above the port driver versus per-driver terminal logic: layering gives uniform behavior for every port, but adds a locked buffer hand-off.", "Hardware flow control versus software: hardware handshakes are reliable at high rates, but need wired lines that many ports lack."],
    p: ["The receive FIFO overflows because the interrupt handler pushes bytes to a slow consumer under lock.", "A hangup races with a blocked read and wakes it twice or never."],
    v: "Send a megabyte at the highest baud rate with flow control on and a slow reader. The received data must match byte for byte, and dropping the carrier line must produce a hangup to the reader.",
    dep: ["top-half","bottom-halves","device-nodes"]
  },
  "gpio-pinctrl": {
    s: "Frameworks for general-purpose pins and for pin multiplexing: how pins are muxed to functions, configured for drive and pull, and used as inputs, outputs and interrupt sources.",
    d: "A pin controller driver describes pins, groups and functions, and applies named states to choose a function and electrical settings for each device. A line framework represents individual lines for reading, setting and interrupt use, and consumers look them up by name from the description tables. Expanders on slow buses appear as controllers too. It is hard because one pin can serve several functions, so a device's state change affects neighbors, and expanders cannot be used from contexts that must not sleep.",
    k: ["Named states applied automatically around probe and sleep versus drivers setting pins directly: automatic states keep board wiring out of drivers, but hide ordering that matters.", "Descriptor-based line lookup versus global numbers: descriptors survive controller renumbering, but code must obtain them through firmware data."],
    p: ["A driver requests a pin already muxed to another function and silently steals it.", "A handler toggles a line behind a slow bus expander from interrupt context and sleeps."],
    v: "Request a line, toggle it, and observe the level on a logic analyzer. Then request the same pin from a second driver and confirm the second request fails with a conflict error.",
    dep: ["device-tree","firmware-tables","serial-buses","interrupt-domains"]
  },
  "clock-regulator": {
    s: "Frameworks for the clocks and voltage rails that devices need: reference counted enable, rate setting, parent selection and constraint-checked voltage, shared among all consumers.",
    d: "Clocks form a tree. A consumer requests a clock by name, enables it, and may ask for a rate; the framework propagates to parents and sums requirements from all users. Regulators likewise hold rails with ranges and enable counts, and consumers declare voltage limits. Resets and power sequencing appear through similar providers. It is hard because the graph is shared and describes silicon, so one consumer's rate change affects others, and enable order matters: a device must have power, then clock, then be released from reset.",
    k: ["Reference-counted shared resources versus exclusive ownership: sharing saves power when unused, but one driver's rate request can disturb another's operation.", "Constraints declared by board data versus chosen by drivers: board limits keep rails safe, but require accurate data for each board."],
    p: ["A driver disables a clock that its parent bus still needs, and register access hangs the bus.", "Rate changes ripple through a shared parent and detune a neighboring device."],
    v: "Enable a device clock and read the actual rate back, then drop all users and confirm the clock and its unused parents turn off. Repeat with two consumers requesting different rates and check the conflict is reported.",
    dep: ["resource-lookup","device-tree","runtime-pm"]
  },
  "thermal-class": {
    s: "The class that reads temperature sensors, compares them against trip points and limits heat by throttling cooling devices such as fans, frequency governors and power caps.",
    d: "Sensor drivers register thermal zones with readings and trip points: passive, active and critical. A governor decides how hard to push each bound cooling device, using steps or a control loop. Cooling devices implement a state number, whether a fan speed or a frequency cap. Crossing a critical trip forces shutdown. It is hard because heat responds slowly while load changes fast, zones overlap, and the sensors themselves can be inaccurate, so the loop must be stable and the shutdown path must work even when the system is struggling.",
    k: ["Step-wise governor versus feedback control: steps are predictable and easy to reason about, but oscillate; feedback is smoother but needs tuning per product.", "Polling sensors versus interrupts on trip crossing: interrupts save power and react quickly, but need hardware that supports programmable thresholds."],
    p: ["A sensor reading stalls at its last value and the governor believes the chip is cool while it overheats.", "The critical shutdown path runs through a driver that is itself blocked."],
    v: "Load all cores and watch temperature, trip crossings and cooling states in the zone's attributes. Temperature must settle below the passive trip, and a simulated critical reading must trigger an orderly shutdown.",
    dep: ["sensor-class","device-frequency-scaling","runtime-pm"]
  },
  "battery-class": {
    s: "The class for batteries, chargers and power sources: reporting charge, voltage, current and health, and coordinating charging limits with the system and with power-path hardware.",
    d: "Drivers expose properties such as state of charge, capacity, cycle count, temperature and charge status, often read from a gauge chip that estimates them. Charger drivers accept limits for input current and charge voltage, and negotiate with source detection on connectors. Events notify user space of plug and low-battery. It is hard because estimates drift, the gauge is a separate processor with its own firmware, charge limits are safety-critical and depend on temperature, and a driver bug can overcharge a cell.",
    k: ["Gauge chip estimates versus host-side coulomb counting: the gauge knows the cell chemistry, but its learned parameters can be wrong, while host counting resets across power loss.", "Hardware-enforced charge limits versus driver-enforced: hardware limits protect even when the driver crashes, but may be less flexible."],
    p: ["A gauge reports a stale capacity after a battery swap and the system shuts down at forty percent.", "A driver bug raises the input current limit beyond what the cable can supply."],
    v: "Run a full charge and discharge cycle with a measurement rig. Reported charge must track the measured value within a stated error, and the charger must not exceed configured current in any step.",
    dep: ["serial-buses","power-states","wakeup-sources"]
  },
  "clock-watchdog": {
    s: "Small classes for hardware that keeps time and guards liveness: a battery-backed clock that survives power loss, and a watchdog timer that resets a machine that stops responding.",
    d: "A real-time clock driver reads and sets calendar time, programs alarms that can wake a sleeping machine, and sets the system clock at boot. A watchdog driver starts a countdown that user space or the kernel must keep refreshing, or the hardware resets the system. Both are simple devices whose value is in their guarantees. The hard parts are policy: an alarm must wake the system from the deepest sleep, and a watchdog must keep running through suspend and a closed node without being stopped by accident.",
    k: ["Watchdog stops when the node closes versus keeps running: stopping avoids a spurious reset after clean exit, but a crash that closes the node then removes the safety net.", "Treating hardware time as local versus universal time: a universal setting avoids daylight-saving errors, but needs an agreement with other operating systems on the same machine."],
    p: ["A watchdog keepalive is serviced by a thread that survives while the rest of the system is hung, hiding the failure.", "An alarm is programmed but the wake line is not enabled, so the machine sleeps through it."],
    v: "Set an alarm for 60 seconds, suspend, and confirm the machine wakes within a second of that time. Stop refreshing the watchdog and confirm a hardware reset occurs at the configured timeout.",
    dep: ["wakeup-sources","device-nodes","serial-buses"]
  },
  "device-object": {
    s: "The kernel's record of one piece of hardware or one logical device: its name, parent, bus, class, bound driver, resources, power state and attached driver data.",
    d: "A device object is created by a bus driver or by firmware parsing, filled with identity and resources, and registered, which adds it to its parent, publishes attributes, raises an event and triggers matching. Drivers attach private data to it and read its description. It embeds a reference count and a release function. It is hard because it is shared by many readers: the object must outlive every reference, registration is visible before the device is ready, and its lifetime is independent of whether any driver is bound.",
    k: ["Embedded object in the driver's structure versus separately allocated: embedding avoids a pointer hop and an allocation, but the release function must free the container, not just the member.", "Registering the device before it is fully initialized versus after: early registration lets matching begin sooner, but exposes half-built state to concurrent users."],
    p: ["A driver frees its structure on removal while another reference still holds the device, and the release function frees it a second time.", "Registering before attributes are ready lets user space read a field that is not yet initialized."],
    v: "Register and unregister a device in a loop while threads read its attributes and hold references. Reference counts must reach zero exactly once and the release function must run once per device.",
    dep: ["reference-counting","bus-type"]
  },
  "driver-object": {
    s: "The kernel's record of a driver: its name, supported identifiers, entry points for probe, remove, shutdown and power, and the set of devices it is bound to.",
    d: "A driver declares a bus type, a match table and a set of callbacks, then registers itself, which makes the bus try it against every unbound device on that bus. It carries default attributes and power operations that apply to each bound device. Registration of the driver and registration of devices are independent, so either may come first. It is hard because callbacks can run concurrently for different devices, unregistration must unbind everything first, and a driver is bound to devices it never searched for.",
    k: ["One driver object for many devices versus a driver instance per device: one object keeps shared code and tables small, but per-device state must live elsewhere and be found each call.", "Callbacks defined by the bus versus generic driver callbacks: bus-specific callbacks give typed arguments, but every bus defines a slightly different shape."],
    p: ["Module unload begins while a probe callback is still running on another CPU.", "Global state in the driver is shared across devices and corrupted when a second device binds."],
    v: "Load a driver with three matching devices present, confirm three probe calls with distinct state, then unregister it and confirm exactly three remove calls before the driver disappears.",
    dep: ["bus-type","match-tables"]
  },
  "bus-type": {
    s: "The object that defines how one kind of bus pairs devices with drivers and what operations it adds around them: match rules, probe wrapper, attributes and power hooks.",
    d: "A bus type provides the match function that compares a device's identity to a driver's table, a probe and remove wrapper that runs bus-specific setup such as power-up, default attributes, event variables and power operations. It owns the list of devices and drivers on that bus. New buses are added by defining one. It is hard because it sits between two lifetimes, so the match function runs with locks held and must not sleep, and the bus's own probe wrapper often changes device state that drivers then rely on.",
    k: ["Bus-defined match semantics versus a universal matcher: per-bus matching handles each bus's identifier format, but there is no common way to ask whether a driver supports a device.", "Bus wrapper doing power-up before probe versus drivers doing it: the wrapper makes drivers simpler and consistent, but hides a side effect that matters when debugging."],
    p: ["A match function sleeps while the bus lock is held and deadlocks hotplug.", "The bus wrapper powers a device up and probe fails, leaving it powered with no owner."],
    v: "Define a test bus with two drivers whose tables overlap and confirm the device binds to the preferred one, with the bus wrapper's power-up and power-down calls balanced after failed probes.",
    dep: ["device-object"]
  },
  "device-hierarchy": {
    s: "The tree of parent and child device objects mirroring physical topology, which determines the order of power transitions, removal and resource inheritance.",
    d: "Each device has one parent, such as the bridge or controller it hangs from; the root is a virtual device. Removing a parent removes its children first; suspending visits children before parents and resuming visits parents first. The tree also appears as paths in the attribute filesystem. It is hard because physical topology and logical dependencies differ: a device may need a clock from a part of the tree it does not hang from, so the tree alone cannot order everything, and hierarchy walks need locking against concurrent hotplug.",
    k: ["Strict single-parent tree versus a general graph: a tree is simple to walk and name, but cross-links such as shared clocks need separate dependency records.", "Order by tree walk versus by explicit dependencies: tree order is free and usually right, but wrong for devices coupled by resources outside the tree."],
    p: ["A device is resumed before a supplier outside its subtree and its first register access faults.", "A walk of the tree races with hotplug and visits a device that is mid-removal."],
    v: "Suspend and resume a machine with logging of every device callback. Children must suspend before parents, the order must reverse on resume, and no device may be called after its parent has suspended.",
    dep: ["device-object","supplier-links"]
  },
  "reference-counting": {
    s: "The lifetime rule for device-model objects: every holder takes a reference, and the object is released only when the last is dropped, whatever the hardware is doing.",
    d: "Objects embed a counter; getting a reference increments and putting decrements, and reaching zero calls the type's release function. Registration holds one reference, and so does each open file, mapping and in-flight request. Removing a device drops its registration reference but does not free it while others remain. It is hard because hardware removal and object lifetime are separate events: the device can be gone while the object lives, so code that holds a reference must still check that the hardware is present before touching it.",
    k: ["Counting references versus tying lifetime to driver binding: counting is safe against any holder, but encourages sloppy holds that keep objects alive indefinitely.", "Release function frees memory versus remove callback frees it: the release path runs only when nothing references it, but resource teardown must be split between remove and release."],
    p: ["A reference is taken in a path that never puts it, and a removed device leaks forever.", "Code frees an object directly instead of dropping a reference, leaving other holders with a dangling pointer."],
    v: "Open, map and queue requests on a device, remove it, then close everything. Memory tracking must show the object freed only after the last holder released, and leak detection must find nothing afterward.",
    dep: []
  },
  "managed-resources": {
    s: "Resources tied to a device's binding so they are freed automatically in reverse order on failure or unbind, removing most hand-written error paths from probe.",
    d: "A driver allocates memory, mappings, interrupts, clocks and registrations through managed variants that record a release action against the device. When probe fails or the driver unbinds, the framework runs the actions in reverse order of acquisition. Custom actions can be registered for anything else. It is hard because lifetime is the binding, not the device: a resource handed to something that outlives unbinding, such as a child object or a file, is freed too early, and mixing managed and manual release double-frees.",
    k: ["Automatic reverse-order release versus explicit cleanup labels: automatic removes whole classes of leak on error paths, but hides ordering that matters when hardware must be stopped first.", "Binding-scoped lifetime versus device-scoped: binding scope matches what a driver owns, but breaks for objects that must outlive an unbind."],
    p: ["A managed interrupt is released after the structure it uses is freed, and a late interrupt dereferences freed memory.", "A driver mixes manual free with a managed allocation and frees the same memory twice."],
    v: "Inject a failure at every step of probe in turn. After each failure, the device must hold no mappings, interrupts or memory, and a subsequent successful probe must work.",
    dep: ["device-object","probe-and-bind"]
  },
  "device-locking": {
    s: "The per-device lock and the rules about which operations hold it, so that probe, remove, suspend and attribute writes do not run against the same device concurrently.",
    d: "Each device has a lock held across bind, unbind and many control paths. Bus and class code take it in a hierarchy: parent before child. A driver callback usually runs with it held, so calling back into the framework to unbind the same device deadlocks. Asynchronous work must not hold it while waiting for something that needs it. It is hard because the lock order spans subsystems, a callback invoked with the lock held may trigger user-visible events that user space answers by calling in again, and hotplug of a parent needs its children's locks.",
    k: ["One coarse lock per device versus fine-grained locks in each driver: the coarse lock makes the lifecycle easy to reason about, but long operations under it block unrelated paths on that device.", "Lock held during callbacks versus released: holding gives callbacks exclusion for free, but invites lock-order inversions with other subsystems."],
    p: ["A remove callback waits for a work item that itself tries to take the device lock, which deadlocks.", "Locks taken in child-then-parent order by one path and parent-then-child by another."],
    v: "Stress simultaneous bind, unbind, suspend, attribute writes and hotplug on one device and its parent with lock-dependency checking enabled. No ordering violation or hang may be reported over a long run.",
    dep: ["device-hierarchy","probe-and-bind"]
  },
  "match-tables": {
    s: "Tables of identifiers by which a driver declares which devices it supports: vendor and product numbers, class codes, compatible strings or firmware names.",
    d: "Each bus defines its identifier form. Self-describing buses use numeric vendor, product and class fields with wildcards; description-table buses use name strings; some use both. A driver exports its table so the matching code, and the module tooling, can decide which driver supports which device without loading it. A device may match several drivers, ranked by specificity. It is hard because tables become the interface: an entry for hardware that the driver handles badly causes regressions, and an entry missing keeps a device without a driver.",
    k: ["Exact identifiers versus class-code wildcards: exact entries are safe and testable, but class-code entries cover unknown hardware at the risk of binding a driver to a device it handles poorly.", "Table exported for tooling versus matching only by trying probe: tables allow autoload without loading every module, but must be kept in sync with the code."],
    p: ["A driver's table claims a new revision it has never been tested on, and bricks the devices that match it.", "A compatible string typo means the device is silently never bound."],
    v: "For each entry in the table, instantiate a device with that identity and confirm the intended driver binds. Instantiate one identity just outside it and confirm nothing binds.",
    dep: ["bus-type","driver-object"]
  },
  "probe-and-bind": {
    s: "The sequence by which the core offers a device to matching drivers, a driver checks the hardware and claims it, and the device is marked bound and ready.",
    d: "When a device or driver registers, the core tries candidates in order. The bus matches; the core takes the device lock, calls the bus probe wrapper and then the driver's probe, which maps resources, resets and checks the hardware, allocates state, and registers with its class. Success records the binding and creates links; failure releases resources and tries the next candidate. It is hard because probe is where nearly all driver bugs live: it must be restartable after any failure, tolerate being retried, and not leave work running that references state about to be freed.",
    k: ["Probe checks the hardware versus trusts the match: checking tolerates wrong table entries and broken hardware, but slows start and complicates the driver.", "Synchronous probe versus asynchronous: synchronous order is deterministic and simple, but slow devices serialize the whole boot."],
    p: ["Probe registers with a class before finishing setup and a program uses a half-initialized device.", "An error path forgets to stop a timer started earlier in probe."],
    v: "Force every failure point in probe in turn and confirm the device ends unbound with nothing leaked, then probe again successfully. Check the class interface only appears after probe completes.",
    dep: ["match-tables","device-locking","managed-resources","driver-object"]
  },
  "deferred-probe": {
    s: "Retrying a probe that failed only because something it needs, such as a clock, a regulator or another device's driver, is not ready yet.",
    d: "A driver that cannot find a supplier returns a defer code. The core parks the device on a pending list and retries it whenever any other device successfully binds, plus once after the initial boot phase ends, with a timeout after which it gives up. This removes explicit init ordering. It is hard because retries can loop wastefully, a missing supplier looks the same as one that is slow, and messages from failed attempts clutter logs. Modern designs derive suppliers from the description tables so ordering is known up front.",
    k: ["Retry after any bind versus ordering from declared dependencies: retry needs no data and always converges, but wastes work and gives slow boot, while declared links are exact but need complete data.", "Timeout then report versus wait forever: timeout surfaces missing suppliers, but may give up on one that is only late."],
    p: ["A driver defers on an error that is not about readiness, so the device waits forever with no message.", "Circular dependencies between two devices leave both pending silently."],
    v: "Remove a supplier's driver and boot. The consumer must appear in the pending list with a reason, and loading the supplier later must cause the consumer to bind without a manual action.",
    dep: ["probe-and-bind","supplier-links","resource-lookup"]
  },
  "unbind-remove": {
    s: "The reverse of binding: detaching a driver from its device, whether the hardware disappeared, the driver is unloading, or an operator asked, with every use of the device ended first.",
    d: "The core takes the device lock, calls the driver's remove callback, releases managed resources, severs the binding and links, and emits events. Consumers via supplier links are unbound first. The driver must stop interrupts, DMA and timers, fail outstanding requests, and unregister its class interface. When hardware has been yanked, remove must work without touching the device. It is hard because users keep open handles, requests are in flight, and registers read back all ones; code must make progress without trusting hardware that no longer answers.",
    k: ["Stop hardware first then unregister interfaces versus the reverse: unregistering first stops new users, but the hardware may still be generating work until it is quiesced.", "Fail outstanding requests immediately versus wait to drain: failing is bounded and safe, but a graceful removal would let completed work finish."],
    p: ["Remove reads a status register from an unplugged device, gets all ones and loops forever waiting for a bit.", "An interrupt arrives after remove freed the handler's data."],
    v: "Yank the device under heavy I/O and confirm all outstanding requests fail within a bound, handles return errors, remove returns, and a later plug of the same device binds and works.",
    dep: ["probe-and-bind","reference-counting","device-locking","supplier-links"]
  },
  "hotplug-events": {
    s: "The chain from a hardware presence change to a bound driver and a usable device node: detection, enumeration, device creation, matching, events and user-space reaction.",
    d: "A bus notices a change through an interrupt, a link-state change or a periodic poll, creates or removes device objects, and the core matches and binds drivers while emitting events for managers. Removal can be orderly, announced by a button or request, or surprise. Coalescing avoids redoing work for bouncing contacts. It is hard because the same path runs on arbitrary threads while other threads use the devices, bus resources must be reassigned after insertion, and surprise removal must be survivable at every instruction.",
    k: ["Interrupt-driven detection versus polling: interrupts cost nothing when idle, but not every bus can signal presence, so some require polling and its delay.", "Orderly removal request versus surprise removal only: requests let software quiesce first, but drivers must handle surprise removal anyway, so both paths must work."],
    p: ["A contact bounce causes repeated add and remove events and the stack flaps through enumeration each time.", "Removal during enumeration leaves a device object registered with no hardware behind it."],
    v: "Plug and unplug a device a thousand times with random timing under load. Each cycle must end with a consistent presence state, no leaked objects and a working device after the last plug.",
    dep: ["hotplug-detection","bus-enumeration","uevents","probe-and-bind"]
  },
  "module-autoload": {
    s: "Loading a driver module on demand when a matching device appears, using aliases generated from each driver's match table so nothing needs to be loaded in advance.",
    d: "At build time, each module's match table is turned into alias strings stored in an index. When a device appears, its event includes an alias built from its identity. The manager looks it up in the index and loads the module, which registers and binds. Boot images include the modules needed to reach the root device. It is hard because the module may need firmware or other modules, load order matters, built-in and modular drivers can both claim a device, and a manager that loads too eagerly wastes memory on hardware nobody uses.",
    k: ["Autoload by alias versus a static load list: alias loading adapts to hardware without configuration, but depends on the manager being running and the index being current.", "Everything built in versus modular drivers: built-in is simpler and available at once, but makes images large and every driver always resident."],
    p: ["The index is stale after an update and the new hardware has no alias, so no driver loads.", "Two modules match one device and which one loads depends on event order."],
    v: "Boot from a minimal image, plug a device whose driver is a module, and confirm exactly that module loads and binds without manual commands. Plug an unsupported device and confirm nothing loads.",
    dep: ["match-tables","uevents","driver-object"]
  },
  "driver-override": {
    s: "Operator control over binding: forcing a device onto a chosen driver, preventing a driver from claiming a device, or manually unbinding and rebinding at run time.",
    d: "Attribute files on each device and driver let an operator set a driver name that overrides matching, write a device name to a driver's bind file to try it, or write to an unbind file to release it. Dynamic identifiers can be added to a driver's table at run time. These are used for passthrough, debugging and new hardware before a release. It is hard because overriding skips safety checks in matching, and unbinding a device while it is in use triggers the full removal path at a time the system did not plan.",
    k: ["Override per device versus blacklisting a driver: per-device is precise, but a blacklist is the only way to keep a driver from claiming hardware that appears later.", "Dynamic identifiers at run time versus rebuilding the driver: dynamic lets support be tested right away, but nothing guards against adding an identifier the driver cannot handle."],
    p: ["An operator unbinds the disk holding the root filesystem and the machine hangs.", "A forced bind attaches a driver to hardware with a different register layout."],
    v: "Set an override for one device of two identical ones, rebind, and confirm only that device switches driver while the other keeps its original binding and keeps working.",
    dep: ["probe-and-bind","unbind-remove","attribute-files"]
  },
  "supplier-links": {
    s: "Explicit records that one device depends on another, so the core binds suppliers before consumers, suspends consumers first and removes consumers before suppliers.",
    d: "Links are created from description tables, which say that a device refers to a clock, interrupt controller or regulator provided by another device, or by drivers asking for a dependency. A link has a state: dormant, available, active. Consumers are probed after suppliers, and unbinding a supplier unbinds its consumers. Links also order system power transitions and can keep a supplier powered while consumers need it. It is hard because descriptions can be incomplete or cyclic, and a wrong link blocks a device forever.",
    k: ["Links derived from firmware data versus declared by drivers: derived links cover all devices uniformly, but depend on complete descriptions, while declared links need driver changes.", "Link-based ordering versus retrying on deferral: links are deterministic and cheap, but only as good as the description of the hardware."],
    p: ["A cycle in the description makes two devices wait for each other with no diagnostic.", "A link to a supplier that has no driver blocks the consumer indefinitely."],
    v: "Describe a consumer that depends on a supplier and boot with the supplier's driver absent, then present. The consumer must stay unbound with the dependency listed, then bind right after the supplier does.",
    dep: ["device-hierarchy","resource-lookup","device-tree"]
  },
  "firmware-tables": {
    s: "Tables supplied by platform firmware that list devices, their resources and methods, with a bytecode interpreter for operations such as power control and event handling.",
    d: "At boot the kernel parses a namespace of devices that firmware provides: each has hardware identifiers, resource settings, status and optional methods in a small bytecode that the kernel interprets to power a device, query state or react to events. The kernel creates device objects from the namespace and drivers bind to them. It is hard because the tables are written by the platform vendor for another operating system, so they contain bugs and assumptions, interpreter methods can block or loop, and device behavior can differ between kernel versions.",
    k: ["Run firmware methods in the kernel versus replace them with native drivers: methods give vendor-specific control with no driver, but run opaque code with full privilege.", "Trust the tables versus quirk lists: trusting is simple and keeps up with new hardware, but real tables are wrong often enough that a growing list of per-platform workarounds is needed."],
    p: ["A firmware method busy-waits for a hardware bit and stalls a CPU for seconds.", "A table reports a device as present that the platform has actually disabled."],
    v: "Dump the namespace, then enumerate and bind a device from it. Invoke a power method and confirm the device draws power as expected, and that malformed tables are rejected without a crash.",
    dep: ["platform-bus","property-api"]
  },
  "device-tree": {
    s: "A data structure describing a board's hardware as a tree of nodes with named properties, handed to the kernel at boot so one image can run on many boards.",
    d: "Nodes name devices and carry properties such as register addresses, interrupt specifiers, clock and regulator references and compatible strings. The kernel unpacks the tree, creates platform devices for nodes that need them, and lets drivers read properties. Bindings document which properties each device class expects. It is hard because bindings are an interface between the board data and drivers that must stay compatible in both directions: new drivers must handle old data, and data written for a new binding must not break old kernels.",
    k: ["Description in data versus in code: data lets one kernel serve many boards and moves wiring out of drivers, but the schema becomes a long-lived interface to maintain.", "Strict schema validation versus tolerant parsing: validation catches board mistakes at build, but rejects tolerated variants that shipped."],
    p: ["A property is renamed in a new binding and boards with old data silently lose a feature.", "An interrupt cell count is wrong and the device receives the wrong interrupt."],
    v: "Compile the tree against the binding schemas with no errors, boot the board, and confirm each described device binds and its registers, interrupt and clocks match the values in the tree.",
    dep: ["property-api","platform-bus"]
  },
  "property-api": {
    s: "One accessor layer for device properties, so a driver reads a number or a reference the same way whether the data came from a tree, firmware tables or built-in board code.",
    d: "A driver asks for a named property of its device and gets an integer, string, array or reference to another node, regardless of source. The layer also walks graph links between devices, such as a camera sensor connected to a receiver. Built-in property sets can be attached in code for platforms with no firmware description. It is hard because the sources differ in types and semantics, absent properties must be handled by choosing sensible defaults, and the layer hides which source is in use, which matters when debugging.",
    k: ["Unified accessor versus source-specific calls: unified lets one driver serve every platform, but hides source-specific features and can obscure why a value is as it is.", "Defaults in the driver versus required properties: defaults let old data keep working, but hide board mistakes that would otherwise fail loudly."],
    p: ["A driver reads a 32-bit property where the data holds 64-bit values and gets half an address.", "A missing optional property is treated as zero and disables a feature with no log message."],
    v: "Run one driver unmodified against three descriptions of the same device, from a tree, firmware tables and built-in data, and confirm all three yield identical parsed values and device behavior.",
    dep: ["device-tree","firmware-tables"]
  },
  "resource-lookup": {
    s: "How a driver turns names in its description into usable handles: register ranges, interrupt numbers, clocks, regulators, pins, DMA channels and other devices.",
    d: "A driver asks for a resource by name or index and gets a handle or a deferral code if the provider is not ready. Register ranges become mappings, interrupts become virtual numbers translated through the controller's domain, and clocks and regulators come from their frameworks. Lookup is where a description is checked against reality. It is hard because the provider may not exist yet, a name may be absent for optional resources, and the interrupt translation depends on a controller that may itself be unbound.",
    k: ["Look up by name versus by index: names survive reordering of descriptions, but need every board to use identical names, while indices are brittle.", "Optional versus required resources: required ones fail early, but optional ones need careful handling so absent hardware is not mistaken for a deferral."],
    p: ["A lookup by index picks the wrong register block after a description gained an extra entry.", "A missing optional clock is treated as a deferral and the device never probes."],
    v: "For each resource named in the description, call lookup in probe and confirm the handle refers to the intended range, interrupt or provider. Remove the provider and confirm lookup defers and later succeeds.",
    dep: ["property-api","interrupt-domains","clock-regulator","deferred-probe"]
  },
  "tree-overlays": {
    s: "Fragments of description applied to a running system to add or change devices, used for pluggable boards, programmable logic and expansion headers.",
    d: "An overlay names target nodes and properties to add, change or remove. Applying it merges the fragment into the live tree and creates device objects for new nodes, which triggers matching and binding as if the hardware had been in the original description. Removing it reverses the changes, unbinding the devices. It is hard because the tree was designed to be static, so references to nodes, resource assignments and driver data must tolerate nodes appearing and vanishing, and a failed overlay must leave no partial change.",
    k: ["Runtime overlays versus a complete rebuilt tree at boot: overlays support hot-pluggable boards, but every consumer of the tree must handle change.", "Atomic apply with rollback versus best effort: atomic keeps the system consistent, but needs careful tracking of every change made."],
    p: ["Removing an overlay while its device is open leaves drivers holding pointers into freed nodes.", "Two overlays modify the same property and the result depends on the order they were applied."],
    v: "Apply an overlay that adds a device, confirm it binds and works, then remove it. The device must unbind, its nodes must disappear, and the tree must match its pre-overlay contents.",
    dep: ["device-tree","property-api","probe-and-bind"]
  },
  "board-data": {
    s: "Device descriptions compiled into the kernel as code for platforms with no firmware tables or trees, naming devices, resources and wiring that drivers cannot discover.",
    d: "Board code declares device objects with names, resource ranges, interrupts and platform data structures, and registers them at startup. Drivers match by name and read the platform data. The method predates tree-based description and persists on small systems and for devices that sit on buses with no discovery, such as a chip on a two-wire bus. It is hard because every board needs code in the kernel, platform data structures become driver interfaces, and the same chip wired differently needs a new entry.",
    k: ["Platform data structure versus properties: a typed structure is checked at build, but each driver defines its own and every board needs code.", "Declared in code versus supplied by firmware: code needs no firmware support, but ties a kernel image to specific boards."],
    p: ["A board declares a resource range that overlaps another device's range and both appear to work until used together.", "A platform data structure changes layout and old board files compile but misbehave."],
    v: "Boot a board using only declared data and confirm each device binds and passes a register read-back test, and that duplicate resource claims are reported at registration.",
    dep: ["platform-bus","property-api"]
  },
});
