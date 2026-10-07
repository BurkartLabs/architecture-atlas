// Bootloader details, part 3: firmware services and tables, platform initialization and discovery.
ATLAS.details("bootloader", {
  "boot-services": {
    s: "The set of calls firmware offers to loaders before the kernel starts: memory allocation, file and block access, console, timers, protocol lookup and image loading.",
    d: "A loader receives a table of function pointers on entry. Through it, it allocates pages, locates devices by protocol, reads files, prints to the console, waits on events, and loads other images. These services depend on drivers firmware loaded, and exist only until the loader declares the end of boot. They give loaders portability across hardware, at the cost of trusting the quality of vendor drivers. The hard part is the surprising edge behavior: event ordering, memory type rules and services that misbehave on specific hardware.",
    k: ["Rich firmware services vs. minimal ones: rich services make loaders small and portable, but expand the firmware's code and bug surface.", "Single-threaded cooperative model vs. concurrent tasks: single-threaded is simple and predictable; concurrency can overlap device waits and complicates every driver."],
    p: ["A loader calls a service in the wrong order and corrupts firmware's internal lists.", "A vendor's file service returns short reads on large files and the loader treats them as complete."],
    v: "Run a loader that lists the protocols and memory types the firmware exposes, then loads a file and prints it; the output should match the actual file and the documented service set.",
    dep: ["protocol-handle-database", "driver-dispatcher", "memory-map-construction"]
  },
  "runtime-services": {
    s: "The small set of firmware calls that stay available after the kernel boots: reading and writing variables, the real-time clock, reset, and applying update capsules.",
    d: "The kernel maps the firmware's runtime code and data into its own address space and calls through a table of entry points. These calls reach into firmware code that executes in the kernel's context, so errors and slowness affect the whole system. The kernel serializes calls and often avoids them in sensitive paths. They are hard because firmware code was written assuming particular address mappings, some calls take milliseconds with interrupts disabled, and the code remains a privileged, rarely updated part of the running system.",
    k: ["Use runtime services vs. native drivers: services avoid platform-specific drivers and need trust in firmware code; native drivers are fast and need hardware knowledge.", "Keep runtime code resident vs. minimize it: resident code is flexible, but is a persistent attack surface and timing hazard."],
    p: ["A variable write blocks all cores for tens of milliseconds and causes dropped interrupts under load.", "The kernel's mapping does not match what firmware expects, and a call crashes the machine."],
    v: "From the running system, read the clock and a variable through the services, and time a write; compare latency with the budget and confirm values match what firmware shows in settings.",
    dep: ["runtime-address-mapping", "firmware-variables", "boot-services"]
  },
  "protocol-handle-database": {
    s: "Firmware's registry that maps devices and software objects to the interfaces they provide, so drivers and loaders find services by type instead of by address.",
    d: "Each object, such as a disk, a file system on it, a network adapter, gets a handle, and interfaces are attached to handles by globally unique identifiers. A driver binds to a handle by testing whether it offers a given interface, then adds a higher interface; a block device gains a filesystem interface, which gains file access. This layering makes drivers composable and replaceable. It is hard because ordering and connection rules are subtle, and a missing or duplicated registration produces a device that exists but cannot be used.",
    k: ["Registry of interfaces vs. fixed driver tables: a registry allows dynamic stacking, at the price of lookup complexity; fixed tables are fast and rigid.", "Drivers binding automatically vs. on demand: automatic binding gives a complete device tree and slows boot; on-demand is fast and misses devices."],
    p: ["Two drivers claim the same device, and the second silently fails to bind.", "A driver removes its interface while a loader still holds a pointer to it."],
    v: "List all handles and their interfaces from a firmware shell, and confirm each attached disk shows a block interface and a file interface chain consistent with its partition layout.",
    dep: ["driver-dispatcher", "bus-enumeration"]
  },
  "firmware-variables": {
    s: "Named, typed, attributed values stored by firmware and readable by loaders and the running system: boot entries, order, secure boot keys, and settings.",
    d: "A variable has a name, a vendor namespace identifier, attributes (persistent or volatile, readable at runtime, requires authentication) and a data blob. Boot entries, the boot order, the one-shot next entry and the key databases live here. Access is through firmware calls, with writes to security variables checked against signatures. The hard parts are size limits, garbage collection in the backing flash, differing quirks per vendor, and the fact that deleting or corrupting the wrong variable can make a machine unbootable.",
    k: ["Namespaced variables vs. a single settings blob: namespaces let independent components coexist, but need a defined lifecycle and cleanup.", "Runtime-writable vs. boot-only: runtime writes let the OS manage boot entries, and widen the attack and wear surface."],
    p: ["Variable store fills up with stale entries and writes fail, including those needed to record a new boot entry.", "A buggy tool deletes a variable with an unexpected attribute and makes the machine refuse to boot."],
    v: "Create, read, change and delete a test variable from the running system, reboot, and confirm a persistent one survived and a volatile one did not; confirm an authenticated variable rejects an unsigned write.",
    dep: ["variable-store-persistence", "runtime-services"]
  },
  "variable-store-persistence": {
    s: "How variables are written to flash safely: an append-style log, redundant regions and garbage collection that survives power loss.",
    d: "Flash can only be erased in large blocks and has limited erase cycles. The store appends new versions of a variable to a log, marks old ones deleted, and when the region is full, copies live data into a spare region and erases the old one. Each step must be recoverable if power fails. Writes from the running system must reach a flash chip that the operating system must not be able to modify freely, so a protected path inside firmware performs them. It is hard because of reclaim time, wear and write protection.",
    k: ["Append log with reclaim vs. update in place: logs spread wear and need reclaim passes; in-place updates are simple and wear hotspots.", "Writes through protected firmware vs. direct access: protection keeps the store trustworthy, at a latency cost and a larger privileged component."],
    p: ["Reclaim runs during boot when the store is full, adding seconds and exposing a window for power loss.", "Frequent counter updates wear out the same flash block."],
    v: "Write a variable one thousand times, cut power during several of these, and confirm after each restart the store opens with a consistent latest value and no lost older variables.",
    dep: ["flash-image-mapping", "system-management-mode"]
  },
  "firmware-volume-storage": {
    s: "The structured container in flash that holds firmware modules, drivers and data files with headers, checksums and compression, found by the earliest code at a known place.",
    d: "Flash is divided into regions, each holding a volume of named files: early code, drivers, the settings application and static data. Files carry types, GUIDs, optional compression and integrity data. The early boot code parses the volume to locate the next phase, and a dispatcher later walks it to load drivers. A volume layout lets vendors add or replace modules at build time. The hard parts are finding the volume from the reset vector, and updating one module without rewriting an entire region.",
    k: ["Self-describing volumes vs. fixed offsets: self-describing volumes allow flexible layout and need a parser in the first code; fixed offsets are tiny and brittle.", "Compress modules vs. store raw: compression lets more fit in flash, and adds decompression time and code early in boot."],
    p: ["A corrupted file header makes the dispatcher skip a driver without any message, and a device disappears.", "Compressed modules decompress slowly on a small core and dominate boot time."],
    v: "Dump the volume with a build-side tool, compare the file list and checksums against what the dispatcher reports loading on the serial log, and confirm every module's checksum validates.",
    dep: ["flash-image-mapping", "driver-dispatcher"]
  },
  "hardware-description-tables": {
    s: "Standard tables firmware builds in memory listing processors, interrupt routing, devices, power states and clocks, plus methods for platform-specific control.",
    d: "Firmware constructs a root table pointing to others that describe the CPU topology, interrupt controllers, memory layout, timers and devices, and carries small bytecode methods for operations like power control. The kernel parses these and runs the methods in an interpreter. They exist so that one kernel can run on many boards without per-board code. It is hard because the tables are written by firmware vendors against a long specification, and errors, such as wrong interrupt routing, show up as devices that work only on some machines.",
    k: ["Description tables with bytecode methods vs. static data only: methods allow rich platform control, but put an interpreter and vendor code in the kernel path.", "Generate at boot vs. ship static tables: generating adapts to installed hardware, and static tables are simpler and may lie about optional devices."],
    p: ["A table method assumes a particular operating system behavior and hangs under another.", "Wrong interrupt routing causes a storage controller to lose interrupts under load."],
    v: "Dump the tables from the running system, check checksums, and compare the processor and memory counts with what hardware reports; disassemble methods and confirm no errors on load.",
    dep: ["platform-init-phases", "bus-enumeration", "resource-assignment"]
  },
  "device-tree-blob": {
    s: "A compact binary tree of nodes and properties describing a board's devices, addresses, interrupts and clocks, used where hardware is fixed and not discoverable.",
    d: "A compiler turns a text description into a flat blob with a header, a structure block, a strings block and a memory reservation list. The loader hands it to the kernel, which matches node identifiers to drivers. Unlike discovery on enumerable buses, the tree states what is wired where. It is simple, static and easy to review, which suits embedded boards. The hard parts are keeping it in step with the kernel's expectations across versions, and describing optional or removable hardware.",
    k: ["Static tree per board vs. discovery at runtime: static trees are exact and need maintenance per board; discovery adapts and fails when buses cannot be probed.", "Tree shipped with the kernel vs. with the board's firmware: shipped with firmware keeps older kernels working, and shipped with the kernel stays in step with its drivers."],
    p: ["A kernel update renames a property, and the older tree silently loses a device.", "The reservation list omits a region the firmware still uses."],
    v: "Decompile the blob and compare nodes and addresses with the board schematic for three peripherals; on the running system confirm each node is bound to a driver.",
    dep: ["firmware-volume-storage", "flash-image-mapping"]
  },
  "runtime-address-mapping": {
    s: "The step where the kernel tells firmware the virtual addresses at which its runtime code and data are mapped, so those services keep working after paging changes.",
    d: "Before the kernel enables its own address space, firmware's runtime code uses physical addresses. The kernel allocates a virtual range, maps each runtime region, then calls a firmware function to convert internal pointers to the new addresses, once. After that, only runtime services work, using the new mapping. It is hard because it is a one-time conversion, pointers firmware forgot to register break afterward, and the kernel must choose a layout that avoids its own regions and keeps executable and writable mappings separate.",
    k: ["Map firmware runtime into the kernel's address space vs. call it in a special context: shared mapping is simple and fast, and makes firmware code a part of kernel memory; special contexts isolate it and cost switches.", "Early conversion vs. none, with an identity mapping: identity mapping avoids conversion and constrains kernel layout."],
    p: ["Firmware keeps a stale internal pointer, and the first variable call after conversion crashes.", "Mappings are writable and executable, which gives firmware code a path to attack the kernel."],
    v: "Boot, then call a runtime service repeatedly, including during memory pressure, and confirm it returns correct data and the kernel's page tables show firmware regions with the permissions it chose.",
    dep: ["runtime-services", "exit-boot-services", "memory-map-handoff"]
  },
  "option-roms-and-drivers": {
    s: "Driver code carried on add-in cards or loaded from storage, executed by firmware to initialize devices such as network and storage adapters it has no built-in support for.",
    d: "A card carries a small image in its expansion memory. During enumeration, firmware maps it, validates its header and runs it, and the code registers services for its device, such as a boot disk or a network interface. This lets new hardware work in old firmware and lets cards offer boot support. It is an extension point with a trust problem: the code comes from a device, not the platform vendor, and runs with full privilege before any kernel. Slow ones also add noticeable boot time.",
    k: ["Run card code vs. use only built-in drivers: running enables unknown hardware, and is a way for a device to execute privileged code; built-in drivers are controlled and limited.", "Verify card images against policy vs. run all: verification stops rogue cards and blocks legitimate ones from unlisted vendors."],
    p: ["A card's image is unsigned and a modified card persists an implant before the operating system starts.", "A slow card initialization adds fifteen seconds to every boot."],
    v: "With secure boot enforced, install a card whose image is not signed by a trusted key and confirm firmware refuses to run it and logs the decision, while a signed card runs.",
    dep: ["bus-enumeration", "driver-dispatcher", "signing-key-databases"]
  },
  "platform-init-phases": {
    s: "The ordered phases firmware goes through, from the first code in flash, to memory ready, to drivers dispatched, to a boot device selected, each with defined inputs and outputs.",
    d: "An early phase runs from flash with no memory. A second phase runs once memory exists and prepares the handoff list of resources. A driver phase loads and starts drivers in dependency order. A boot phase selects and runs a loader. A runtime phase stays resident. Dividing into phases lets chip vendors, board vendors and firmware authors contribute modules at defined points. The hard parts are cross-phase data handoff, dependencies between drivers and failures that depend on order.",
    k: ["Strictly layered phases vs. one monolithic image: phases enable modular supply chains and structured handoff, but add overhead and interfaces to keep stable.", "Statically ordered modules vs. dependency-driven: static order is predictable and breaks on changes; dependency-driven adapts and needs correct declarations."],
    p: ["A module reads data produced by a later phase and gets zeros.", "Phase interface changes between vendors' modules cause failures that appear only in combination."],
    v: "Boot with phase tracing enabled and confirm each phase start and end appears in order in the log, with durations, and the handoff list matches the hardware present.",
    dep: ["reset-vector", "memory-map-construction", "driver-dispatcher", "firmware-volume-storage"]
  },
  "driver-dispatcher": {
    s: "The firmware component that loads driver modules from storage and starts each one when its declared dependencies are satisfied.",
    d: "Each driver declares the interfaces it requires before it can run, in a small expression. The dispatcher scans the volumes for drivers, evaluates the expressions repeatedly, and runs each driver once all its dependencies are present, which makes it register new interfaces and so enables others. It repeats until no more can run. This yields a boot order without a fixed list. It is hard because circular or missing dependencies leave drivers never started, with no error, and the time spent scanning grows with the number of modules.",
    k: ["Dependency expressions vs. a fixed load order: expressions adapt to what is installed and hide ordering bugs; fixed order is explicit and breaks whenever a driver is added.", "Load all drivers vs. only those needed for the boot path: loading all gives complete devices, and loading less speeds boot."],
    p: ["A driver's dependency is never satisfied, and the driver never runs without any log entry.", "Two drivers each wait for the other and neither starts."],
    v: "Enable dispatcher tracing and confirm every driver in the volume is either started or reported as unsatisfied with the missing interface named; confirm the started count matches the log.",
    dep: ["firmware-volume-storage", "protocol-handle-database"]
  },
  "bus-enumeration": {
    s: "Walks the platform's discoverable buses, finds every attached device and bridge, reads identifiers and capabilities, and builds the device tree firmware and the kernel use.",
    d: "Firmware scans each bus segment, reading identifiers from each possible slot, recurses through bridges, and records class codes and capabilities. It then connects drivers to matching devices. Hot-plug and large topologies make it slow: a server with many switches and devices can spend seconds here. Non-discoverable devices come from tables or a device tree instead. The hard parts are devices that respond late after reset, broken devices that hang the scan, and numbering buses so that bridges have enough range.",
    k: ["Full scan every boot vs. cached topology: a full scan is always right and slow; caching speeds boot and misses changes.", "Wait for devices to become ready vs. scan immediately: waiting finds late devices and adds delay on every boot."],
    p: ["A faulty card hangs the configuration read, and the entire machine stalls at enumeration.", "A device that needs a long reset time appears only after the scan has passed it."],
    v: "Compare firmware's device list with the running system's list of devices on a machine with several bridges and cards: every identifier, class and bus address should match.",
    dep: ["platform-init-phases", "resource-assignment"]
  },
  "resource-assignment": {
    s: "Allocates address ranges, interrupt lines and bus numbers to discovered devices so they do not overlap, and programs each device's registers accordingly.",
    d: "Each device reports how much address space it needs and alignment. Firmware totals the needs per bridge, packs them into windows that fit the platform's available ranges, and writes base addresses into devices. It also assigns interrupt lines or message targets. Large devices, such as accelerators with big memory windows, need very large ranges above the 4-gigabyte line. The hard part is running out of space in a window, bridges with fixed limits, and the kernel either keeping or redoing the assignment.",
    k: ["Firmware assigns resources vs. kernel reassigns: firmware assignment makes early boot work; kernel reassignment can fix poor choices and needs more kernel code.", "Pack tightly vs. leave room for hot-plug: tight packing preserves address space; spare room allows later devices without renumbering."],
    p: ["A device with a very large memory window is left unassigned because the platform's high range is disabled.", "Overlapping ranges make two devices answer one address."],
    v: "Dump all assigned ranges from the running system and confirm none overlap, every device's range lies inside its bridge's window, and large devices received their full requested size.",
    dep: ["bus-enumeration", "memory-map-construction"]
  },
  "input-and-display-init": {
    s: "Brings up keyboard, pointer and display devices so firmware settings and menus can be used, from a text console to a graphical mode.",
    d: "Firmware initializes a display controller or an add-in graphics card, chooses a mode that the panel's identification data allows, and sets up a framebuffer and text console. Input devices on external buses need that bus's stack running first, which can take seconds. Both are needed only if a person interacts, so fast boot paths skip them unless a key is held. The hard parts are display mode selection with unusual panels, input stacks that miss keys pressed early, and headless machines.",
    k: ["Initialize console devices always vs. only on demand: always gives the best chance of seeing errors, and costs boot time; on demand is fast and hides early failures.", "Text console vs. graphical mode: text is robust and plain; graphics supports logos and settings screens and fails on more displays."],
    p: ["The USB stack comes up after the key press window, and the setup key is ignored.", "No panel identification data is returned and a fallback mode produces a blank screen."],
    v: "Boot to the firmware settings screen using keyboard only on a machine with an external display and confirm all menus display and respond, then repeat headless over the serial console.",
    dep: ["bus-enumeration", "driver-dispatcher"]
  },
  "interrupt-and-timer-init": {
    s: "Sets up the interrupt controller, a time base and exception handlers so firmware can handle faults, delays and device events.",
    d: "Firmware installs handlers for exceptions, programs the interrupt controller for the devices it uses, and starts a periodic timer that drives timeouts and events. Handlers print a register dump and stop instead of recovering. Before handoff, the interrupt state is quieted so the kernel starts from a known point. It is hard because the clock source frequency may be uncalibrated, calibration depends on another unreliable clock, and timers misreport on virtual machines. A wrong delay breaks hardware initialization sequences quietly.",
    k: ["Interrupt-driven firmware vs. polling: interrupts allow concurrent waits and add handler complexity; polling is simple and wasteful.", "Calibrate the timer against a reference vs. trust the declared frequency: calibration finds the truth and takes time; trusting is instant and wrong on some boards."],
    p: ["Timer frequency assumed from a table is off by a factor, and delays shorten, causing flaky device resets.", "Interrupts left enabled at handoff arrive at the kernel before its handlers exist."],
    v: "Measure a one-second firmware delay against an external reference with a probe or the serial timestamps, and confirm interrupt state is masked at kernel entry.",
    dep: ["early-cpu-mode-setup", "platform-init-phases"]
  },
  "multiprocessor-startup": {
    s: "Wakes the additional processor cores, gives each a stack and entry point, and either parks them for the kernel or leaves them for the kernel to start.",
    d: "Only one core runs at reset. Firmware sends a wake request to the others, each executes a small trampoline, initializes its own state, and either does work such as memory test in parallel or waits. At handoff, the cores are parked in a defined loop or shut off, and the kernel starts them through a defined mechanism listed in the hardware description. It is hard because each core needs identical configuration, a trampoline in memory reachable in its early mode, and a clean way to hand it to the kernel.",
    k: ["Wake all cores in firmware vs. leave them off: waking allows parallel init and costs complexity; leaving them off is simple and the kernel does the work.", "Park cores in firmware memory vs. return them to reset: parking is fast to restart, and ties up reserved memory; reset is clean and slower."],
    p: ["A core fails to respond and is silently skipped, so the system boots with fewer cores than installed.", "Parked cores keep running firmware code in memory that the kernel then reuses."],
    v: "Compare the number of cores the kernel brings online with the number reported by the hardware description and the socket count; each core should run a test task.",
    dep: ["reset-vector", "cpu-state-at-entry", "interrupt-and-timer-init"]
  },
  "firmware-settings-interface": {
    s: "The interactive program, entered with a key at power-on, where a person changes boot order, security options, device settings and updates firmware.",
    d: "It reads a description of each setting that firmware modules supplied, draws menus, validates input, and writes choices back to variables or flash. Some platforms also expose it remotely over serial or a management controller. It is the point where an owner's policy becomes stored configuration. The hard parts are consistency between settings that interact, passwords protecting it, resetting to defaults, and recovering when a bad setting prevents the screen from appearing at all.",
    k: ["Modules provide their own settings pages vs. one central list: modular pages scale across vendors, but the interface can be inconsistent and slow; central lists are uniform and hard to extend.", "Password-protected vs. open: protection prevents casual changes, and a lost password needs a hardware reset path."],
    p: ["A setting that disables the only display output makes the interface unusable and requires a jumper reset.", "Changes are written to a variable the running system can also modify, which weakens the password protection."],
    v: "Enter settings, change the boot order and a security option, save, and confirm after reboot that the loader boots from the new order and the option is reflected in a variable dump.",
    dep: ["firmware-variables", "input-and-display-init", "boot-device-selection"]
  },
  "system-management-mode": {
    s: "A privileged firmware execution mode, entered by a hardware event, that handles tasks such as flash writes and power events while hidden from the operating system.",
    d: "On supporting hardware, a special interrupt switches the CPU into a mode with its own protected memory region. Firmware code there handles events like power button presses, thermal faults and, importantly, writes to protected flash on behalf of the variable service. The operating system cannot see or interrupt it. This is both a security tool, keeping flash writes in trusted code, and a risk: bugs in the handlers give an attacker the highest privilege on the machine. It is hard to audit and impossible for the kernel to inspect.",
    k: ["Handle flash writes in the hidden mode vs. a hardware-controlled path: hidden mode works on existing hardware, and bugs in it are catastrophic; hardware paths are smaller and need chip support.", "Many services in the hidden mode vs. a minimal set: many services centralize platform control, and a smaller set cuts attack surface."],
    p: ["A handler trusts a pointer from the operating system and copies data into its protected memory.", "Long-running handlers stall all cores and cause missed deadlines in the running system."],
    v: "Run a firmware test that passes malformed buffers to each handler's entry point from the operating system and confirm each is rejected without a crash or any write into the protected region.",
    dep: ["variable-store-persistence", "runtime-services", "debug-port-lockdown"]
  },
});
