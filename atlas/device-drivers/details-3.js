// Details for the device driver framework plate, part 3: buses, registers and interrupts, DMA.
ATLAS.details("device-drivers", {
  "peripheral-interconnect": {
    s: "The driver for the main high-speed bus that connects controllers, storage, network and graphics devices, with self-describing configuration space, bridges and message interrupts.",
    d: "Each function exposes a configuration space with vendor and device identifiers, class code, address-window registers and capability lists. The bus driver walks the topology, assigns address windows and interrupt vectors, creates device objects and offers them to drivers by identifier. Capabilities add features such as message interrupts, power management, error reporting and virtualization. It is hard because resource assignment must satisfy alignment and bridge window limits, devices have quirks that violate the standard, and link training, speed negotiation and error recovery are separate state machines.",
    k: ["Kernel assigns address windows versus trusting firmware's assignment: kernel assignment handles hotplug and is uniform, but firmware's is already consistent with its own tables.", "Link-level error recovery in the bus driver versus in each device driver: central recovery is uniform, but device state recovery still needs driver callbacks."],
    p: ["A device quirk is missing and a bug in one revision corrupts data, discovered only in the field.", "Address windows are exhausted on a bridge and a hot-added device cannot be given resources."],
    v: "Enumerate the topology and compare identifiers, windows and capabilities with an independent dump. Hot-add a device behind a bridge and confirm it receives non-overlapping windows and a working interrupt.",
    dep: ["bus-enumeration","bridge-topology","msi","mmio-mapping"]
  },
  "usb-host-stack": {
    s: "The layered stack for the USB serial bus: host controller drivers, a core that enumerates and schedules transfers, and class and vendor drivers that use pipes.",
    d: "A controller driver implements scheduling of transfers in frames; the core resets a newly attached device, reads its descriptors, assigns an address and selects a configuration, then creates interface objects that class drivers bind to by class, subclass and vendor IDs. Drivers submit requests to endpoints and receive completions. Hubs create the tree. It is hard because the host schedules everything, devices are untrusted and often malformed, power budgets limit configurations, and disconnect can arrive at any moment, including during a transfer.",
    k: ["Host-scheduled bandwidth versus device-initiated transfers: host scheduling gives guaranteed periodic bandwidth, but costs polling overhead and limits concurrent devices.", "Binding per interface versus per device: per-interface lets composite devices use several drivers, but drivers must coordinate shared resets and power."],
    p: ["A malformed descriptor makes a parser read past its buffer, a recurring source of vulnerabilities.", "Disconnect during a control transfer leaves a driver waiting on a completion that never comes."],
    v: "Plug a composite device and confirm each interface binds the right class driver. Unplug during bulk transfers and confirm every pending request completes with an error and no object leaks.",
    dep: ["bus-enumeration","hotplug-detection","bridge-topology","untrusted-devices"]
  },
  "platform-bus": {
    s: "A pseudo-bus for devices that sit directly on the system interconnect and cannot be discovered, so they are created from firmware descriptions or board data and matched by name.",
    d: "Most embedded controllers, such as timers, serial ports and storage controllers integrated in the processor, have fixed addresses and no discovery mechanism. A description source creates a platform device with address ranges and interrupts, and platform drivers register match tables. The bus supplies no transport, since drivers access registers directly, but supplies lifecycle, resources and power hooks. It is hard because its simplicity makes it a catch-all, and drivers that need extra bus semantics invent their own conventions.",
    k: ["Catch-all pseudo-bus versus a bus type per integration style: one bus keeps the model small, but drivers cannot be told apart by how they are wired.", "Resources passed in the device versus read from properties: resources are generic and typed, but properties scale better to varied wiring."],
    p: ["Drivers assume a register layout from the platform name alone and misbehave on a revised chip with the same name.", "Order-dependent initialization between platform devices relies on registration order."],
    v: "Create platform devices from a description and check that each matching driver binds, that address ranges are claimed, and that the resource table shows no overlap or unclaimed device.",
    dep: ["device-tree","firmware-tables","board-data","bus-type"]
  },
  "serial-buses": {
    s: "Low-pin-count buses for talking to small peripherals, such as two-wire and four-wire serial peripheral buses, with controllers presented as adapters and chips as devices.",
    d: "A controller driver implements message transfers; the core represents each chip as a device by address or chip-select, normally declared by description tables because these buses cannot enumerate. Chip drivers use a register-access abstraction that works across several bus types, and sometimes shared caches of register values. It is hard because transfers sleep and so cannot happen in interrupt handlers, a stuck slave can hold the bus low, timing and clock stretching vary, and one controller is shared by many drivers that must not interleave transactions.",
    k: ["Message-based transfer API versus register-oriented helpers: messages express any protocol, but register helpers remove boilerplate and let one driver work over either bus.", "Bus reset on a stuck line versus giving up: reset restores other devices, but disturbs transactions in progress."],
    p: ["A driver issues a transfer from a top-half handler, which sleeps and causes a fault.", "A slave holds the data line low and every device on the bus stops responding."],
    v: "Read an identification register from each chip on the bus under concurrent load from several drivers, and confirm values are correct and transactions do not interleave. Hold a line low and confirm bus recovery.",
    dep: ["platform-bus","device-tree","threaded-irq"]
  },
  "bus-enumeration": {
    s: "Discovering the devices on a bus: walking topology, reading identity, allocating resources and creating device objects, either once at boot or again at every change.",
    d: "Enumeration begins at a root and visits each downstream port, reading identity from the device on self-describing buses or from description tables on others. For each device it assigns addresses, interrupt resources and sometimes power budget, creates the device object and registers it. Bridges and hubs recurse. Rescans after hotplug repeat it incrementally. It is hard because the process must tolerate devices that do not answer, answer wrongly, or change identity mid-scan, and it must not disturb devices already running.",
    k: ["Full rescan versus incremental update on events: rescan is simple and robust, but disturbs live devices and takes time, while incremental is fast but needs reliable events.", "Depth-first versus breadth-first resource assignment: depth-first assigns contiguous windows per subtree, but breadth-first can plan windows from totals."],
    p: ["A device that needs time after reset is read too early and enumerated as absent.", "A failed enumeration step abandons the subtree below it, hiding working devices."],
    v: "Enumerate a known topology and compare each node's identity and resources with a reference dump. Add a device behind a hub during a rescan and confirm it appears exactly once.",
    dep: ["bus-type","device-object","bridge-topology"]
  },
  "hotplug-detection": {
    s: "The hardware and software mechanisms by which a bus notices that a device arrived or left: presence pins, link-state changes, interrupts and periodic polling.",
    d: "Some buses signal presence in hardware through an interrupt on a port status change; others, such as chips on two-wire buses, never signal, so software polls or an operator declares the device. Detection usually debounces the signal and then schedules enumeration in a worker. Power-up sequencing delays the first access. It is hard because signals bounce and can be lost, a removal can occur between detection and enumeration, and polling trades latency against power use.",
    k: ["Debounce delay versus immediate reaction: a delay avoids flapping on bad contacts, but adds visible latency to every insertion.", "Hardware presence signal versus link-state inference: presence pins are definitive, but not all connectors have them, so link state must be relied on."],
    p: ["A port status interrupt is cleared before it is read, so a removal is never noticed.", "Polling interval is long and a quick unplug and replug of a different device is missed."],
    v: "Insert and remove a device with a scripted fixture at random intervals, including very short ones. The bus's presence state and object tree must match the physical state after each settling period.",
    dep: ["bus-enumeration","top-half","bottom-halves"]
  },
  "bridge-topology": {
    s: "Devices that connect one bus segment to another or fan a bus out into many ports, such as bridges, hubs and switches, and the topology they build.",
    d: "A bridge forwards transactions between segments and has address windows that must cover every downstream device. A hub or switch exposes several downstream ports. The kernel represents each as a device whose children are the devices behind it, and uses the tree for resource assignment, error containment, power ordering and path-based naming. It is hard because windows must be assigned bottom-up and fit alignment rules, a downstream failure can propagate upstream, and removing a bridge removes everything below it.",
    k: ["Hierarchy reflects physical topology versus flat device list: hierarchy gives containment, naming and ordering for free, but makes paths change when hardware is rearranged.", "Reserve window space for hot-add versus assign tightly: reserving allows later devices without renumbering, but wastes address space."],
    p: ["Bridge windows are sized for the devices present at boot, and a hot-added device cannot fit.", "A downstream error resets a bridge and takes unrelated sibling devices offline."],
    v: "Build a topology with two levels of bridges and compare each bridge's windows with the union of its children's ranges. Disable one downstream port and confirm only devices behind it disappear.",
    dep: ["bus-enumeration","device-hierarchy","bus-error-reporting"]
  },
  "virtual-buses": {
    s: "Buses with no physical wires: paravirtual transports in virtual machines, auxiliary buses that split one device among several drivers, and software-defined devices exposed through the same model.",
    d: "A paravirtual transport presents devices through shared-memory queues with a standard configuration area for identity, features and queue setup, so one driver works on any hypervisor. An auxiliary bus lets a multi-function device's main driver create child devices bound to other drivers. Both reuse matching, binding and hotplug unchanged. It is hard because the device is software on the other side that can be slow, malicious or restarted, and feature negotiation must keep both sides compatible across versions.",
    k: ["Standard paravirtual interface versus emulating real hardware: a standard interface is fast and simple for drivers, but needs guest support, while emulation works with old guests at a speed cost.", "Splitting multi-function devices into auxiliary children versus one large driver: children keep each function's code separate, but shared hardware needs a coordination interface."],
    p: ["A negotiated feature is used before the other side confirms it, and the device corrupts data.", "The host-side device is restarted and the guest driver keeps stale queue state."],
    v: "Attach a paravirtual device with a feature subset, confirm only negotiated features are used, then restart the backend and confirm the driver resets its queues and resumes service.",
    dep: ["bus-type","probe-and-bind","descriptor-rings"]
  },
  "bus-error-reporting": {
    s: "How a bus reports faults such as parity, timeouts, link errors and aborts, and how the framework contains them and tells the driver so it can recover or fail cleanly.",
    d: "The bus hardware classifies errors as correctable, uncorrectable and fatal and signals them by interrupt. The core logs correctable ones, and for the others walks to the affected devices, notifies drivers through recovery callbacks, resets the link if needed, and asks drivers to resume or fail. A read that cannot complete returns all ones, so drivers must sometimes treat that value as suspect. It is hard because the faulting access may be asynchronous, error sources get misattributed, and a recovery that cannot restore device state must give up cleanly.",
    k: ["Contain and attempt recovery versus fail the device immediately: recovery saves state for devices that can resume, but needs driver callbacks that are rarely tested.", "Report through a central handler versus raising a fault at the access: central handling can isolate the device, but the faulting driver sees corruption late."],
    p: ["A driver treats an all-ones read as a valid register and acts on garbage.", "Correctable errors flood the log and mask the one fatal error that follows."],
    v: "Inject a link error with a test fixture during traffic. The framework must log it, call the driver's recovery callbacks, reset the link, and either resume traffic with no corruption or remove the device.",
    dep: ["peripheral-interconnect","device-reset","fault-containment"]
  },
  "mmio-mapping": {
    s: "Making a device's registers and memory addressable by the kernel by mapping its physical address range into kernel virtual space with attributes that disable caching and reordering.",
    d: "A driver requests ownership of a physical range so two drivers cannot claim it, then maps it with a device attribute, which is typically uncached and strongly ordered, or write-combining for frame buffers. Reads and writes then go through accessor functions that compile to the right instructions. Mappings are released at unbind. It is hard because mapping the wrong attribute silently breaks ordering, a device that has gone away answers with all ones or faults, and some ranges are only valid while a power domain or clock is on.",
    k: ["Strict ordering versus relaxed mappings: strict is safe for control registers, but relaxed or write-combined mappings give much higher throughput for data windows.", "Map the whole region once versus per access: mapping once is fast, but keeps a window open that a buggy driver can scribble in."],
    p: ["Registers are mapped cacheable and a write sits in the cache while the device waits for it.", "A register is accessed while its clock is off, and the access hangs the bus."],
    v: "Map a region, write then read back a scratch register, and compare against the expected pattern with the device's clock on. Confirm a second claim of the same range fails and access with the clock off is refused or reported.",
    dep: ["resource-lookup","accessors-barriers"]
  },
  "port-io": {
    s: "A separate address space for device registers, reached with dedicated instructions, kept for legacy devices and some platform controllers that predate memory-mapped registers.",
    d: "Some architectures give a device a port number instead of a memory address. A driver requests the range and uses byte, word and double-word input and output functions, plus string forms that move blocks. Where hardware has no port space, the framework emulates it through a memory window so legacy drivers run unchanged. It is hard because port access is slow, serializing and often trapped in virtual machines, and because mapped and port accessors look similar but have different ordering and failure rules.",
    k: ["Port instructions versus memory-mapped windows: ports are what old devices expect, but memory windows are faster and work on architectures with no port space.", "Emulated port space versus per-driver rewrites: emulation preserves old drivers, but hides cost and ordering differences."],
    p: ["A driver uses block transfers on a device that needs a delay between accesses and loses data.", "In a virtual machine every port access traps, making a polled legacy device extremely slow."],
    v: "Read the identification register of a legacy device through the port range and compare it with the known value. Confirm an overlapping range request by another driver is refused.",
    dep: ["accessors-barriers"]
  },
  "accessors-barriers": {
    s: "The set of register read and write helpers, with defined ordering and endianness, that keep the compiler and processor from reordering, merging or dropping device accesses.",
    d: "Plain memory accesses can be reordered, cached, merged or removed by the compiler and CPU, so device registers are only touched through accessors that prevent that. Variants differ by width, byte order, whether they order against normal memory, and whether they are relaxed. Barriers order writes to memory, such as a descriptor, before the write that tells the device to look at it. It is hard because the required fence depends on the platform, posted writes can still be in flight when the code moves on, and bugs appear only under load on specific processors.",
    k: ["Fully ordered accessors by default versus relaxed with explicit barriers: ordered is safe and simple, but relaxed in hot paths avoids a fence per access.", "Read back after a write to flush it versus rely on ordering: the read forces completion, but costs a round trip."],
    p: ["A doorbell write is not ordered after descriptor writes and the device reads a stale descriptor.", "A driver assumes a posted write has taken effect and powers down the clock before it arrives."],
    v: "Run a descriptor-and-doorbell loop for hours on weakly ordered and strongly ordered hardware, with checksums on every descriptor. No stale or torn descriptor may be seen by the device.",
    dep: []
  },
  "interrupt-domains": {
    s: "The layer that maps a device's hardware interrupt number, as seen by its own controller, to a kernel-wide virtual number through a hierarchy of interrupt controllers.",
    d: "Interrupt controllers form a tree: a device line goes to a secondary controller, which feeds a primary one that signals the CPU. Each controller registers a domain that translates specifiers from the description into a virtual number and implements mask, unmask, acknowledge, type and affinity operations. Flow handlers for edge and level types are chosen from the specifier. It is hard because cascaded controllers have different acknowledge semantics, wakeup configuration crosses the tree, and a description with the wrong trigger type fails in subtle ways.",
    k: ["Hierarchical domains versus one flat interrupt table: hierarchy models real wiring and supports stacked controllers, but every level adds a translation and a place for a bug.", "Translate at lookup versus at request: lookup lets drivers get a stable number early, but depends on the controller being ready."],
    p: ["A level-triggered line is configured as edge and an interrupt is lost, leaving the device stuck.", "A controller driver loads after its consumers, so their lookups defer indefinitely."],
    v: "Trigger each interrupt line of a test device in turn and confirm the handler for that device runs exactly once, with the trigger type matching the description and counters in the interrupt table incrementing.",
    dep: ["resource-lookup","device-tree"]
  },
  "irq-request": {
    s: "The driver's call that attaches a handler to an interrupt number with flags for sharing, trigger type and threading, and that must be undone on unbind.",
    d: "The driver passes the virtual number, a handler, optional thread function, flags and a cookie. The core allocates a descriptor action, configures the controller, and unmasks the line. Shared lines call every handler, each of which must check its own device and report whether it handled it. Free removes the handler and waits for running instances to finish. It is hard because the handler may run as soon as it is registered, before initialization is done, and unmasked interrupts from a half-configured device can storm.",
    k: ["Request early in probe versus after hardware setup: early registration is convenient, but the handler can fire against uninitialized state.", "Shared versus exclusive lines: sharing is required on legacy wiring, but one bad handler affects everyone and spurious calls cost time."],
    p: ["The handler dereferences driver state that probe has not allocated yet.", "On a shared line, a handler returns handled without checking the device, hiding an interrupt storm."],
    v: "Register on a shared line with two devices, fire each in turn, and confirm each handler claims only its own interrupts. Free the handler during active firing and confirm no call occurs afterward.",
    dep: ["interrupt-domains","driver-object"]
  },
  "top-half": {
    s: "The part of an interrupt handler that runs immediately with interrupts masked or limited: it acknowledges the device, captures minimal state and schedules the rest.",
    d: "The top half runs in interrupt context, so it cannot sleep, take sleeping locks or call anything that might. It reads a status register, acknowledges or masks the source, copies out what would be lost, and defers the remainder. Time spent here delays every other interrupt and scheduling on that CPU, so it is kept to microseconds. It is hard because the device must be quieted to stop the line, shared lines require checking that this device caused the interrupt, and reading status over a slow bus is not possible in this context.",
    k: ["Do minimal work and defer versus handle everything inline: deferring keeps latency low for others, but adds a scheduling delay and more state to synchronize.", "Mask at the device versus at the controller: device masking is precise, but needs a register write that might be slow, while controller masking is generic."],
    p: ["The handler does not clear the interrupt cause, so the line re-fires immediately and the CPU locks up.", "It calls an allocation that can sleep and the system faults."],
    v: "Measure the handler's maximum execution time under load with a tracer and confirm it stays under the stated budget. Verify with sleeping-in-atomic checks enabled that no sleeping call occurs.",
    dep: ["irq-request","accessors-barriers"]
  },
  "bottom-halves": {
    s: "Mechanisms for running the deferred part of interrupt work soon but outside the top half: software interrupts, tasklets and work queues with different context and ordering rules.",
    d: "After the top half, remaining work runs in one of several contexts. Software interrupts run on the same CPU right after the hardware handler, in interrupt-like context, for high-rate paths. Tasklets build on them with per-instance serialization. Work queues run in process context on worker threads, so they can sleep. Choosing among them trades latency against what is permitted. It is hard because all share state with the top half, work can be queued again before it ran, and heavy work in the fast contexts starves the scheduler.",
    k: ["Software-interrupt context versus process context: software interrupts have the lowest latency, but cannot sleep and can monopolize a CPU, while process context can sleep at the cost of a scheduling delay.", "Per-CPU deferred work versus a shared queue: per-CPU keeps caches warm and avoids locks, but can load one CPU unevenly."],
    p: ["Work is re-queued continuously and the deferred-work handler spends all CPU time in deferred processing.", "A work item runs after the device was removed and touches freed state."],
    v: "Drive the maximum interrupt rate and confirm all deferred work completes in order with bounded delay, while a CPU-bound user task still gets its share of CPU time. On removal, confirm pending work is flushed or cancelled first.",
    dep: ["top-half","device-locking"]
  },
  "threaded-irq": {
    s: "A handler model where the top half only acknowledges the interrupt and the real handler runs in a dedicated kernel thread that can sleep, take mutexes and talk to slow buses.",
    d: "The driver registers a quick check function and a thread function. The check runs in interrupt context and decides whether to wake the thread; the thread runs at a scheduled priority, with the line masked until it finishes for level-triggered sources. The model suits devices behind slow buses, whose interrupts cannot be read from interrupt context, and it makes interrupt priority controllable. It is hard because masking the line for the whole thread run delays other users on shared lines, and the thread can be delayed by scheduling.",
    k: ["Threaded handler versus top half plus work queue: threading ties work to one interrupt with its own priority, but costs a thread per source and a scheduling delay.", "Oneshot masking until the thread completes versus unmasking early: oneshot is required for level lines to avoid storms, but extends the time the line is off."],
    p: ["A threaded handler on a shared line is oneshot and delays other devices on that line for as long as the thread runs.", "Thread priority is left default and the interrupt is serviced behind a busy user task."],
    v: "Fire interrupts from a device behind a slow bus and confirm the thread reads its status over that bus without fault. Measure handler latency under CPU load and compare it with the stated bound.",
    dep: ["irq-request","serial-buses"]
  },
  "msi": {
    s: "Interrupts delivered as memory writes by the device instead of through shared physical lines, giving each device many independent vectors that can target different CPUs.",
    d: "A device that supports it holds an address and data pair per vector; to interrupt, it writes the data to the address, which the interrupt controller turns into a CPU interrupt. The driver asks the framework for a number of vectors, which allocates them from the controller, programs the device and assigns affinity. Extended forms give thousands of vectors and a table in device memory. It is hard because vector counts are limited, allocation can fail and must fall back to fewer vectors or legacy lines, and the translation hardware must permit the device's writes.",
    k: ["One vector per queue versus a single shared vector: per-queue allows each CPU to service its own queue without contention, but uses scarce vectors and complicates fallback.", "Message interrupts versus legacy lines: messages avoid sharing and ordering problems with data, but need hardware and translation support on both ends."],
    p: ["Allocation of the full vector count fails on a crowded system and the driver has no fallback, so probe fails.", "The interrupt remapping hardware blocks the device's write and interrupts silently never arrive."],
    v: "Request a vector per CPU, confirm each shows in the interrupt table with the right affinity, and generate traffic on each queue. Interrupt counts must increment on the intended CPUs only.",
    dep: ["interrupt-domains","irq-affinity","iommu-domains"]
  },
  "irq-affinity": {
    s: "Choosing which CPU receives each interrupt and how often a device interrupts, so that handling stays close to the data and high-rate traffic does not drown the CPU.",
    d: "Each interrupt has a CPU mask. The kernel can spread a device's vectors across CPUs automatically, keep a queue's interrupt with the CPU that submits its work, and migrate away from CPUs being taken offline. Devices also moderate: coalescing several events into one interrupt by count or time, adaptively as load changes. It is hard because moving an interrupt is racy with in-flight delivery, high coalescing adds latency, and the best placement depends on cache and memory topology that drivers do not know.",
    k: ["Automatic spreading versus manual pinning: automatic gives good default balance, but cannot match a tuned layout for latency-sensitive workloads.", "Interrupt coalescing versus per-event interrupts: coalescing cuts CPU use at high rates, but adds latency that matters at low rates unless it adapts."],
    p: ["All vectors land on one CPU and it saturates while others sit idle.", "Static coalescing set for throughput makes small request-response traffic slow."],
    v: "Run multi-queue traffic and confirm the interrupt table shows each vector on a distinct CPU. Offline one CPU and confirm its interrupts migrate and no interrupt is lost.",
    dep: ["interrupt-domains","msi"]
  },
  "dma-mapping-api": {
    s: "One interface by which drivers make memory reachable by a device and get back the address the device must use, hiding translation, coherence and device addressing limits.",
    d: "A driver declares the device's address mask, then maps buffers: the call returns a bus address, which may equal the physical address, be an IOMMU-translated address, or point at a bounce buffer. Unmap releases it. Different calls cover long-lived coherent memory, per-transfer streaming buffers, and scatter-gather lists. The same driver code works on platforms with and without an IOMMU or cache coherence. It is hard because misuse often works on one machine and corrupts data on another.",
    k: ["Generic mapping API versus platform-specific code in drivers: the generic API makes drivers portable, but hides costs such as bounce copies and cache maintenance.", "Declaring the address mask versus assuming full width: declaring lets the layer bounce for limited devices, but drivers must know the true limit."],
    p: ["A driver passes a physical address to the device instead of the returned bus address, and it works until an IOMMU is enabled.", "A mapping is not unmapped on an error path and exhausts IOMMU space over time."],
    v: "Run the same transfers on a machine with the IOMMU off, on, and with a device limited to 32-bit addressing. Data must match in all three, and debug checks for unmapped or mismatched mappings must report nothing.",
    dep: ["iommu-domains","bounce-buffers","coherent-buffers","streaming-mappings"]
  },
  "coherent-buffers": {
    s: "Long-lived memory that the CPU and device both read and write without explicit cache management, used for descriptor rings and control structures.",
    d: "The allocator returns a CPU virtual address and a device address for a region whose cache attributes are set so that CPU and device see each other's writes without flushing: either through hardware coherence or by mapping the region uncached. It is allocated at setup and freed at teardown. Small allocations come from pools. It is hard because uncached memory is slow to access, so rings should be touched in few large accesses, and ordering between a descriptor write and the doorbell still needs a barrier even when the memory is coherent.",
    k: ["Coherent memory versus streaming mappings with sync: coherent is simple for control structures accessed in small pieces, but uncached access is slow, so data buffers use streaming.", "Pool of small blocks versus individual allocations: pools reduce waste for many small descriptors, but a pool pins its pages for the device's life."],
    p: ["A driver reads descriptor fields one by one from uncached memory in the hot path and halves throughput.", "Allocation fails late in a long-running system because contiguous memory is fragmented."],
    v: "Allocate a ring, have the device write completion records, and read them from the CPU without any sync call. Every record must be seen intact in order, and freeing must return the pages.",
    dep: ["dma-mapping-api","accessors-barriers"]
  },
  "streaming-mappings": {
    s: "Per-transfer mappings of ordinary memory for one DMA operation, with explicit ownership hand-off between CPU and device so caches are flushed or invalidated at the right moments.",
    d: "A driver maps a buffer for a direction: to device, from device or both. Between map and unmap the device owns it and the CPU must not touch it; to look at partial results, the driver syncs for the CPU and syncs back for the device. On coherent platforms syncs cost nothing, and on others they flush or invalidate caches. It is hard because the code is correct on coherent hardware even when it breaks the ownership rules, so errors appear only on other platforms as stale or corrupted data.",
    k: ["Streaming map per transfer versus a long-lived coherent buffer: streaming allows the cache for bulk data and zero-copy from user buffers, but requires strict ownership discipline.", "Map once and sync repeatedly versus map and unmap each time: reuse saves IOMMU work, but keeps the memory pinned and mapped longer."],
    p: ["The CPU reads a receive buffer before sync and sees stale cache contents on a non-coherent platform.", "The wrong direction is given, so a cache invalidate destroys data the CPU just wrote."],
    v: "Run transfers in each direction on a non-coherent platform, or with the debug layer that checks ownership. Data must match exactly, and any access outside the CPU-owned window must be reported.",
    dep: ["dma-mapping-api","bounce-buffers"]
  },
  "bounce-buffers": {
    s: "Temporary copies in memory the device can reach, used when the real buffer lies beyond the device's addressing limit or in a region the IOMMU cannot expose.",
    d: "If the device can address only low memory, or the platform treats a buffer as private, the mapping layer allocates a bounce buffer inside the reachable area, copies data in before a device read and out after a device write, and maps the copy. The caller sees nothing different. Bounce pools are sized at boot. It is hard because copying costs bandwidth and latency, the pool can run out under load, and confidential-computing guests use it deliberately to keep device-visible memory separate from private memory.",
    k: ["Transparent bounce versus failing the mapping: transparent keeps old devices working, but silent copying hides a large performance penalty.", "Fixed-size pool at boot versus allocating on demand: a pool guarantees availability under pressure, but reserves memory that is idle in normal use."],
    p: ["The pool is exhausted under a burst and transfers stall waiting for space.", "A copy is skipped for a write-only mapping that the device actually reads, giving stale data."],
    v: "Limit a device's address mask below the memory in use, run mixed-direction transfers, and confirm data integrity and that the bounce statistics count copies. Overload the pool and confirm transfers wait rather than fail or corrupt.",
    dep: ["dma-mapping-api"]
  },
  "scatter-gather": {
    s: "Describing a logically contiguous buffer as a list of physically separate segments, which the device walks or the IOMMU merges, avoiding a copy into contiguous memory.",
    d: "A list holds entries of page, offset and length. The mapping layer maps them all at once, merges adjacent entries where addresses allow, and returns the count of device-visible segments; the driver writes them into descriptors, or into a table the device reads. Limits on segment count and size are declared by the device. It is hard because the mapped count differs from the input count, devices have alignment and boundary-crossing rules, and chained lists complicate iteration.",
    k: ["Device walks a segment table versus driver coalesces to contiguous: tables allow zero-copy and large transfers, but devices must support them, while coalescing works anywhere at the price of a copy.", "Merge segments via the IOMMU versus keep them separate: merging reduces descriptors, but depends on translation hardware and its page granularity."],
    p: ["The driver iterates the original entry count instead of the mapped count and posts too many or too few descriptors.", "A segment crosses a boundary the device cannot handle and the transfer corrupts adjacent memory."],
    v: "Submit a transfer built from many small unaligned pages, confirm the descriptor list covers exactly the intended bytes, and compare the device's result with the source data byte for byte.",
    dep: ["dma-mapping-api","descriptor-rings"]
  },
  "iommu-domains": {
    s: "Translation tables that give each device, or group of devices, its own view of memory, so a device can reach only what it was given and addresses can be remapped.",
    d: "An IOMMU sits between devices and memory and translates device addresses through page tables per domain. The framework creates a domain, attaches devices to it, maps and unmaps ranges and flushes cached translations. The default domain gives each device a private view for ordinary drivers; assigned domains serve virtual machines and user-space drivers. Faults are reported with device and address. It is hard because flushing translations is costly and batched, so a device can briefly keep access to unmapped memory, and devices that cannot be told apart must share a domain.",
    k: ["Strict unmap with immediate flush versus lazy batched flush: strict closes the window for stale access, but costs throughput, while lazy batching is fast and leaves a short exposure.", "Passthrough or identity mapping versus translated: identity is fastest, but gives the device the whole address space, which removes the protection."],
    p: ["Lazy flushing lets a device write to a page after it was reused, corrupting unrelated data.", "Two devices behind a bridge that merges their identities share one domain and can read each other's buffers."],
    v: "Attach a device, issue a DMA to an address it has no mapping for, and confirm the IOMMU raises a fault naming the device and address with memory unchanged. Unmap a buffer and confirm later access also faults.",
    dep: ["dma-mapping-api","device-hierarchy"]
  },
  "descriptor-rings": {
    s: "Circular queues in shared memory through which driver and device exchange work and completions, with producer and consumer indices and a doorbell to signal new entries.",
    d: "The driver fills descriptors that point to buffers, advances a producer index and writes a doorbell register; the device consumes them and writes completion entries or flags. Receive rings are pre-filled with empty buffers, and transmit rings are reclaimed on completion. Ring size, ownership bits and index wraparound define the protocol. It is hard because correctness depends on ordering between descriptor contents, ownership flags and doorbell, an exhausted ring must stop the upper layer and restart it without a lost wake-up, and device resets must drain rings safely.",
    k: ["Ownership bit in each descriptor versus separate index registers: ownership bits make each entry self-describing, but indices are cheaper to poll and let the device batch.", "Large rings versus small: large rings absorb bursts, but hold more memory and raise latency under overload."],
    p: ["The doorbell is written before the last descriptor is visible and the device processes a stale entry.", "A ring empties, the stop and wake paths race, and the queue never restarts."],
    v: "Run producer and consumer at maximum rate while randomly pausing each side and resetting the device. Every submitted entry must complete exactly once or fail explicitly, with no stuck queue.",
    dep: ["coherent-buffers","accessors-barriers","dma-mapping-api"]
  },
  "shared-buffers": {
    s: "A mechanism to export a buffer as a handle that several drivers and processes can import and map, so a camera, GPU and display can exchange frames without copies.",
    d: "An exporter wraps its memory in a buffer object and returns a descriptor that can be passed between processes. Each importing device attaches and maps it into its own address space, and the framework creates the mappings in each device's IOMMU domain. Fences track when each device finishes reading or writing so users wait on completion rather than polling. It is hard because each device has different constraints on contiguity and addressing, the placement must satisfy all of them at once, and lifetime is shared across drivers that fail independently.",
    k: ["Buffer allocated by exporter versus by a shared allocator: the exporter knows its constraints, but a shared allocator can place memory that suits all attached devices.", "Explicit fences versus implicit synchronization: explicit fences give precise control and parallelism, but put correctness onto every user."],
    p: ["A consumer reads a buffer before the producer's fence signals and displays a half-rendered frame.", "The exporter's driver unbinds while importers still map the buffer, leaving device mappings dangling."],
    v: "Pass frames from a capture device to a display device through exported buffers for ten minutes. Every frame must display complete, with fences signaled in order and no copies in the trace.",
    dep: ["iommu-domains","dma-mapping-api","reference-counting"]
  },
});
