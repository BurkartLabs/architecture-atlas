// Details for the hypervisor plate, part 3: guest platform, CPU virtualization, vCPU scheduling.
ATLAS.details("hypervisor", {
  "guest-firmware": {
    s: "The first code a guest runs: it initializes virtual hardware, finds a boot device and hands control to the guest's loader.",
    d: "Either a legacy firmware that reads the first sector of a disk, or a modern firmware with a driver model, a variable store, a boot manager and network boot. It runs in guest mode, sees the virtual devices as hardware, reads the machine description through the firmware config channel and builds platform tables for the guest. Its variable store must persist across reboots, which makes it per-machine state to snapshot and migrate. It is hard because boot-order and device naming bugs show up as machines that will not start.",
    k: ["Modern firmware vs legacy firmware: modern supports large disks, secure boot and network boot, but is bigger and needs a variable store; legacy is small and universally understood.", "Firmware image shared by all machines vs a copy per machine: sharing saves space and updates once, but a per-machine variable store must stay separate."],
    p: ["The variable store is lost or not migrated, so the machine forgets its boot order and fails to boot after a move.", "A firmware update changes device enumeration and the guest's boot loader no longer finds its disk."],
    v: "Boot a machine with no OS on its disk and confirm the firmware's boot manager attempts the configured devices in order, reports each, and falls through to network boot; then set a boot variable and reboot to confirm it persists.",
    dep: ["firmware-config-channel", "acpi-tables", "virtual-tpm"]
  },
  "firmware-config-channel": {
    s: "A simple host-to-guest channel through which firmware reads configuration: memory size, processor count, boot order, tables and files.",
    d: "A small device exposes a directory of named items that the firmware reads through a few registers or a bulk transfer path. The device model fills it from the machine definition: tables to install, boot-order text, address ranges for hot-plug, and a random seed. It is the contract between the device model and firmware, and so is part of the guest-visible interface that must stay compatible across versions. The difficulty is that any change in item layout can change what the guest sees.",
    k: ["Host-generated tables over a config channel vs tables built by firmware: host-generated tables stay in sync with the device model, but couple firmware to one device model.", "Versioned machine types vs always newest layout: versioned types keep guests stable across upgrades, but multiply the combinations to test."],
    p: ["A new release changes a default in the channel and every existing machine sees changed hardware after a reboot.", "The channel carries unchecked sizes and the firmware reads past the item."],
    v: "List the items the firmware reads for a machine, compare them against its definition, and change a boot-order entry in the definition and confirm the guest firmware shows the new order after reboot.",
    dep: ["device-model-process", "vm-definition-store"]
  },
  "acpi-tables": {
    s: "Platform description tables that tell the guest what devices, processors, interrupts and power events exist, built by the host to match the virtual machine.",
    d: "The device model generates tables listing processors and their interrupt controller IDs, memory ranges, the bus tree, interrupt routing, embedded devices, and power-button and sleep events. They carry hot-plug notifications as well. A guest reads them once at boot and again on notifications. Wrong tables give a guest that misses processors, mis-routes interrupts or cannot power off. It is hard because every guest kernel parses them slightly differently and bugs depend on the guest version.",
    k: ["Fully generated per machine vs a fixed template with patches: generated tables always match the configuration, but have more code and more edge cases.", "Describe all devices at boot vs only present ones: describing everything allows hot-plug without a reboot, but advertises hardware that does not exist."],
    p: ["A table error causes a guest kernel to ignore all but one processor, and the machine boots with poor performance.", "The shutdown event is not described and graceful shutdown never reaches the guest."],
    v: "Dump the tables from inside the guest, confirm the processor count, memory ranges and device list match the definition, and send a power-button event and confirm the guest begins shutdown.",
    dep: ["virtual-bus-topology", "vm-definition-store"]
  },
  "virtual-interrupt-controller": {
    s: "The emulated interrupt controllers (per-processor local controller and a shared I/O controller) that deliver interrupts and inter-processor signals to guest processors.",
    d: "Each virtual processor has a local controller with registers for priority, end-of-interrupt, a timer, and inter-processor interrupts. A shared controller routes device lines to processors with masks and vectors. Message-signaled interrupts bypass it by writing a message to an address. Accesses to these registers are very frequent, so hardware assistance and in-kernel implementation matter. It is hard because state must be exact for migration and because delivery races with guest masking produce lost or spurious interrupts.",
    k: ["In-kernel controller vs user-space: in-kernel is much faster for timer and inter-processor interrupts, but enlarges the privileged code; user space is safer and slower.", "Hardware-virtualized controller registers vs emulated: hardware handles most accesses without exits, but limits what can be intercepted or customized."],
    p: ["An interrupt is lost when a processor is migrated or when the guest masks and unmasks at the wrong moment.", "Interrupt routing state is not saved and a restored guest sees a device that never fires."],
    v: "Send ten thousand inter-processor interrupts between guest processors and confirm each is received exactly once, count exits per interrupt, and repeat after a migration.",
    dep: ["interrupt-injection", "kernel-fast-paths", "vcpu-control-state"]
  },
  "interrupt-injection": {
    s: "The mechanism that makes a pending virtual interrupt arrive in the guest at the next moment it can accept it, and lets devices deliver interrupts with few or no exits.",
    d: "The monitor writes a pending vector into the virtual processor's control state; the hardware delivers it on entry when the guest's flags allow, or requests an exit as soon as the guest can take it. Posted interrupts let a device, or another processor, mark an interrupt pending in a memory descriptor, and the hardware delivers it into a running guest without an exit. For assigned devices, interrupt remapping routes straight to the guest's processor. It is hard because a target processor may be descheduled and must be woken.",
    k: ["Posted delivery vs exit-and-inject: posting avoids exits on delivery to running guests, but needs hardware support and careful descriptor updates.", "Deliver to the processor that last ran the guest vs the one with the least load: affinity avoids cross-core wakeups, but may pile interrupts onto a busy core."],
    p: ["The target virtual processor is not running when an interrupt is posted and it sits unhandled until scheduled.", "Interrupt remapping tables are stale after a virtual processor moves to another physical one."],
    v: "Pin a guest processor, send timed interrupts from an assigned device, and confirm in exit counters that deliveries to the running processor cause no exit, while delivery to a halted processor wakes it quickly.",
    dep: ["vm-entry-exit", "iommu-remapping", "vcpu-control-state"]
  },
  "virtual-timers": {
    s: "Emulated timers (programmable interval and per-processor deadline timers) that fire guest interrupts at the times the guest asked for.",
    d: "A guest programs a deadline in its own time base. The monitor converts that into a host timer and, when it fires, injects an interrupt, waking the processor if it is halted. Hardware can run a guest-timer offset directly. Timer writes and reads are frequent, so cost matters. When a machine is paused, descheduled or migrated, guest time and deadlines must be adjusted so timers do not all fire at once. It is hard because the guest's idea of time and the host's differ.",
    k: ["Hardware-assisted guest timers vs software timers: hardware timers need no exit to program or fire, but their state must be saved and restored with care.", "Tick-based guests vs tickless: tickless guests wake rarely and save host power, but depend on precise one-shot timers."],
    p: ["After a long pause all queued timers fire immediately and the guest stalls handling a storm of ticks.", "Timer slack in the host makes guest timers late and breaks real-time workloads."],
    v: "Program a guest timer for one millisecond intervals and measure the actual interval distribution from inside the guest, and again after pausing and resuming the guest for a minute.",
    dep: ["virtual-interrupt-controller", "guest-clock-sync"]
  },
  "guest-clock-sync": {
    s: "Keeps the guest's clock and cycle counter correct as it moves between processors and hosts, including scaling the counter when frequencies differ.",
    d: "The guest reads a hardware cycle counter. The monitor sets an offset and, where supported, a scale factor, so the counter appears continuous and at the same frequency after migration to a host with a different clock. A shared page published by the host gives the guest a paravirtual clock source that is fast to read. The guest agent or a host device can correct wall-clock time after a pause. It is hard because jumps backward or stalls confuse software that measures intervals.",
    k: ["Counter scaling in hardware vs software trapping: hardware scaling is exact and cheap, but absent on older processors, where trapping makes every read slow.", "Step the clock after a resume vs slew it: stepping is immediate and fixes large gaps, but breaks applications that cannot handle jumps."],
    p: ["After migration to a host with a different counter frequency, guest time runs fast or slow until corrected.", "A guest that suspended for a day resumes with an old wall-clock time and fails certificate checks."],
    v: "Migrate a guest between hosts with different counter frequencies and confirm its cycle counter rate and wall clock stay within a small tolerance of a reference time source for the following hour.",
    dep: ["vcpu-control-state", "guest-agent"]
  },
  "virtual-tpm": {
    s: "An emulated trusted platform module and firmware variable store that let guests measure their boot, keep keys and enforce signed-boot policy.",
    d: "The module is a software device with registers, platform configuration registers, key storage and a command interface, backed by persistent state the host must protect. Firmware measures each boot stage into it; the guest can seal secrets to those measurements. Secure-boot variables hold the keys and revocation lists the firmware enforces. State is per machine, and must move with it. It is hard because the module's secrets must stay confidential from the host administrators if it is to mean anything for confidential workloads.",
    k: ["Software module with host-stored state vs hardware-backed: software supports migration and cloning, but the host can read the secrets; hardware binds secrets to one host.", "Per-machine key databases vs a shared default: per-machine keys give control, but shared defaults make guests boot out of the box."],
    p: ["A cloned machine copies the module's state and two machines hold identical keys and identity.", "Module state is stored unencrypted on a shared datastore and is readable by other tenants' administrators."],
    v: "Boot a guest with measured boot, read the platform registers, and confirm they match expected values; change the boot loader and confirm a secret sealed to the old measurements can no longer be unsealed.",
    dep: ["guest-firmware", "state-save-restore", "attestation"]
  },
  "trap-and-emulate": {
    s: "The classic technique of running guest code at reduced privilege, so that each privileged instruction faults into the monitor, which emulates its effect on the virtual state.",
    d: "The guest kernel runs in a lower privilege ring than it expects. Privileged instructions, such as writing a control register, fault; the monitor decodes the instruction, applies it to the virtual processor's saved state, and resumes at the next instruction. This works only if all sensitive instructions fault. On processors where some do not, they silently behave differently, and virtualization needs binary translation or paravirtual changes. It is the conceptual basis of everything in this group, including the hardware modes.",
    k: ["Pure trap-and-emulate vs patched guests: pure keeps guests unmodified, but fails on processors with non-trapping sensitive instructions.", "Eager emulation vs lazy state switching: lazy switching of rarely used state saves cycles, but must catch the first use."],
    p: ["A sensitive instruction that does not trap lets the guest observe or change real privileged state.", "A workload making frequent privileged accesses spends most of its time in the monitor."],
    v: "Run a test guest that executes each privileged instruction in turn and confirm that every one either faults into the monitor or has its result match the virtual state, and none changes host state.",
    dep: ["instruction-emulator", "exit-handlers"]
  },
  "hw-virt-extensions": {
    s: "Processor modes and instructions that add a guest mode with its own full privilege levels, so the guest kernel runs unmodified while the monitor keeps control.",
    d: "The processor has a root mode for the monitor and a guest mode for the machine. Entering guest mode loads the guest's state from a control structure; running it, the guest has all its normal privilege rings. A configurable set of events (instructions, accesses, interrupts) cause an exit to root mode, which saves guest state back. The monitor chooses what exits. It must check that the feature exists and is enabled in firmware, and enable the mode on every processor. The difficulty is differences between processor generations.",
    k: ["Intercept few events vs many: fewer intercepts run faster, but expose more hardware behavior to the guest and make migration between processor models harder.", "Enable the mode permanently on all processors vs on demand: permanent is simple and fast to enter, but leaves the monitor resident and the feature unavailable to other users."],
    p: ["Firmware disables the feature and the monitor starts but cannot run any guest.", "Processors in one host with different feature levels make a migrated guest see features vanish."],
    v: "Query the processor's capability bits, enable the mode on every core, start a trivial guest that executes a halt instruction, and confirm an exit with that reason reaches the monitor on each core.",
    dep: ["vcpu-control-state", "vm-entry-exit", "hypervisor-core"]
  },
  "vm-entry-exit": {
    s: "The code path that loads guest state and enters guest mode, and on return saves it and finds out why the guest stopped, all as fast as possible.",
    d: "Entry loads guest registers and control state, restores or swaps extended state such as vector registers lazily, and resumes. Exit saves registers, reads the reason, restores host state and dispatches to a handler. A round trip costs hundreds to thousands of cycles, and exits happen constantly, so the common ones are handled in a short path with interrupts disabled, and the rest in a longer path. It is hard because exactness matters: any state mishandled across transitions is a guest or host corruption bug.",
    k: ["Short fast path vs a general path for all exits: a fast path for the top few reasons cuts latency, but is duplicated logic that can drift from the general path.", "Switch extended register state eagerly vs lazily: lazy saves work for guests that rarely use it, but must trap the first use and complicates the exit path."],
    p: ["A register left unsaved across an exit leaks one guest's values into another or into the host.", "An interrupt arriving between exit and handler is delivered with the wrong context loaded."],
    v: "Measure round-trip cycles of an empty exit (a no-operation instruction that exits), record it as a baseline, and run a guest register-integrity test that sets and verifies every register around ten million exits.",
    dep: ["hw-virt-extensions", "vcpu-control-state", "exit-handlers"]
  },
  "exit-handlers": {
    s: "The per-reason routines that deal with each cause of a guest exit: memory faults, device access, control register writes, halts, hypercalls and interrupts.",
    d: "A dispatch table maps an exit reason to a handler. Many handlers finish inside the monitor and resume the guest; some, such as device access to unclaimed ranges, return to user space for the device model. The handler for a fault examines the guest's page tables and nested tables. Unknown or unhandled reasons stop the guest rather than guess. Because exits are the unit of overhead, the handler set determines performance and also attack surface. It is hard to keep each handler both short and complete.",
    k: ["Handle in kernel vs return to user space: kernel handling is fast, but more kernel code is exposed to hostile guests; user space is slower and safer.", "Fail closed on unknown exit vs ignore: failing stops a guest that hits a missing case, but ignoring risks silent guest corruption."],
    p: ["A handler trusts a guest-provided value (pointer, index) and reads host memory out of range.", "An exit reason added by a new processor generation is unhandled and guests crash only on new hardware."],
    v: "For each exit reason the processor can report, run a guest that triggers it and confirm a handler runs and the guest either continues correctly or is stopped with that reason logged.",
    dep: ["vm-entry-exit", "instruction-emulator", "nested-fault-handler", "mmio-pio-dispatch"]
  },
  "instruction-emulator": {
    s: "A software decoder and executor for single guest instructions, used when hardware cannot complete an access itself or the guest's state is not directly runnable.",
    d: "On a device access the hardware may give only the faulting address, not the decoded operation, so the monitor fetches the instruction from guest memory, decodes operands, reads or writes the device, updates registers and advances the instruction pointer. It also emulates instructions during mode transitions that hardware cannot run directly. It must implement a subset exactly, including faults and flags. It is hard because the guest controls the bytes being decoded, which makes it a long-standing source of security bugs.",
    k: ["Small subset emulated vs complete emulation: a small subset is easy to audit, but fails on guests that use unusual instructions for device access.", "Use hardware decode when provided vs always decode in software: hardware decode is faster and exact, but varies by processor generation."],
    p: ["The emulator mishandles a rarely used addressing mode and lets the guest read or write outside its permitted region.", "A guest modifies the instruction being decoded between fetch and execute, causing time-of-check problems."],
    v: "Execute a set of instruction encodings both natively in a guest and through the emulator, comparing the resulting registers, flags and memory byte for byte, including the faulting cases.",
    dep: ["guest-memory-map"]
  },
  "binary-translation": {
    s: "Rewrites guest kernel code on the fly into safe equivalents, replacing sensitive instructions with calls into the monitor, when the processor gives no hardware help.",
    d: "The monitor scans guest code before running it, in small blocks, and emits translated copies stored in a cache. Sensitive instructions become direct emulation calls; most instructions are copied unchanged, so user code runs at nearly native speed. Translated blocks are invalidated when the guest rewrites its code. It was the way to virtualize processors without hardware extensions, and remains useful for emulating a different instruction set entirely. It is hard because correctness of translation and self-modifying code are difficult.",
    k: ["Binary translation vs hardware virtualization mode: translation works on older processors and can mix guests, but is complex; hardware mode is simple and faster for most workloads.", "Translate whole blocks vs single instructions: blocks amortize cost and run faster, but invalidation and exception reporting become harder."],
    p: ["Self-modifying guest code runs a stale translated copy of itself.", "Exceptions raised inside translated code report the wrong guest instruction address."],
    v: "Run a guest that rewrites its own code in a loop and confirm each new version executes; compare register state after identical runs under translation and under direct execution.",
    dep: ["trap-and-emulate", "instruction-emulator"]
  },
  "vcpu-control-state": {
    s: "The per-processor structure in memory that holds a guest's registers and the settings that say what causes exits, plus the monitor's own bookkeeping.",
    d: "The hardware defines a control structure (or several) per virtual processor: guest register state, host state to restore on exit, execution controls selecting intercepts, entry and exit controls, and an event-injection field. The monitor writes it, the hardware reads and updates it, and some fields can only be changed while it is loaded. Shadowing allows a nested monitor to see its own copy. It is hard because rules for valid combinations are strict and invalid combinations fail entry with an obscure reason.",
    k: ["Cache the structure and write fields lazily vs write on every entry: lazy writes avoid slow field accesses, but risk running with stale values after a missed update.", "One structure per virtual processor vs reuse across processors: per-processor is simple, but migrating a virtual processor across physical processors needs the structure cleared and reloaded."],
    p: ["A control combination the hardware rejects causes entry failure only on some processor models.", "State not saved to the structure at migration time makes a restored guest resume with stale registers."],
    v: "Read back the structure after exit and compare guest registers to values the test guest set before the exit; run entries with each documented control combination and confirm invalid ones are rejected before entry.",
    dep: ["hw-virt-extensions"]
  },
  "cpuid-msr-virtualization": {
    s: "Intercepts the instructions that report processor features and read or write model-specific registers, so the guest sees a consistent, controlled processor.",
    d: "A feature query returns identifiers, supported instruction sets, topology and the presence of a hypervisor. The monitor intercepts it and returns values from a per-machine table. Reads and writes of model-specific registers are filtered by a bitmap: allowed, emulated, ignored or rejected. Some registers need real hardware access for speed, others are always emulated. It is hard because guest software relies on exact answers, and any visible change after migration or restart can break it.",
    k: ["Intercept every query vs pass through selected leaves: intercepting gives full control, but each query is a slow exit; passing through is fast for harmless data.", "Fail unknown register accesses vs ignore them: failing exposes missing support, but guests that probe registers then crash instead of being tolerated."],
    p: ["A feature bit reports an instruction set the virtual machine cannot actually provide after migration.", "A rarely used register is passed through and lets the guest change a host-wide setting."],
    v: "Run a guest feature-listing tool, confirm it matches the machine's configured feature table exactly, and write to a restricted register and confirm the monitor rejects or ignores it without changing host state.",
    dep: ["exit-handlers", "cpu-feature-masking"]
  },
  "cpu-feature-masking": {
    s: "Chooses a common set of processor features that all hosts in a pool can provide, so a machine can move between hosts of different generations.",
    d: "A baseline model is defined as the features present on every host in the cluster. Each machine is started with a table exposing only that set (or a named model such as an older generation), regardless of the host it starts on. The cost is that newer instructions, though present, go unused. Masking must also cover feature-related registers, vector register widths and extended state sizes. It is hard because software may cache features at boot and cannot cope when they change under it.",
    k: ["Lowest common denominator vs per-host features: a common baseline allows free migration, but wastes newer hardware; per-host features run faster but pin machines to hosts.", "Named baseline models vs automatic computation: named models are predictable and testable, but need updates as new processors arrive."],
    p: ["A new host with fewer features than the baseline joins the pool and every machine on it needs a restart.", "Masking a feature but not its related state leaves the guest with state it cannot use or save."],
    v: "Start a machine on hosts of two processor generations with the same baseline, confirm identical feature listings in the guest on both, and live-migrate between them without a guest-visible error.",
    dep: ["cpuid-msr-virtualization", "inventory-and-placement"]
  },
  "vcpu-threads": {
    s: "Each virtual processor is a host thread that runs guest code until an exit, which is how the host scheduler sees and controls guest processors.",
    d: "The thread calls the monitor to enter guest mode and returns when the guest exits and the monitor cannot handle it in the kernel. While in guest mode it consumes a physical processor like any thread, so ordinary priorities, affinities and control groups apply. A thread blocks when its guest halts and wakes when work arrives. Device and I/O work run in separate threads. It is hard because the host cannot see inside the guest to know whether a virtual processor is doing useful work or spinning.",
    k: ["Treat virtual processors as ordinary threads vs a dedicated scheduler: ordinary threads reuse the host's mature scheduler, but it knows nothing about guest synchronization.", "Real-time priority for vCPU threads vs normal priority: real-time bounds latency, but a runaway guest can starve host services."],
    p: ["A runaway guest at high priority starves the host agent and the host becomes unmanageable.", "A guest holding a spinlock is descheduled and other virtual processors spin waiting for it."],
    v: "Start a guest with four virtual processors and confirm the host shows four threads whose combined run time matches the guest's own accounting, and that stopping one guest processor idles its thread.",
    dep: ["vm-entry-exit", "fair-share-scheduler"]
  },
  "fair-share-scheduler": {
    s: "Divides physical processor time among virtual processors by shares, limits and reservations, so that machines get what they are entitled to under contention.",
    d: "Each machine or pool has a weight, an optional cap and an optional minimum; the scheduler tracks time used against entitlement and runs those furthest behind. Latency-sensitive guests may get priority boosts on wakeup. Hosts commonly run many more virtual processors than physical ones, so waiting time is normal. Accounting includes time spent in host work done on the guest's behalf (device emulation, exit handling). It is hard to balance fairness, wake-up latency and cache warmth.",
    k: ["Strict caps vs work-conserving sharing: caps give predictable limits, but leave processors idle; sharing uses everything, but gives no ceiling.", "Charge host work done for a guest to the guest vs to the host: charging keeps tenants honest, but is hard to attribute for shared device threads."],
    p: ["A cap is set below what a guest needs to answer interrupts, and it appears to hang for periods.", "Heavy device emulation done by host threads is not charged to the guest, so it gets more than its share."],
    v: "Run busy guests with weights two to one on one physical processor and confirm they receive close to two thirds and one third of its time; add a cap to one and confirm it does not exceed it while the other uses the rest.",
    dep: ["vcpu-threads", "resource-pools"]
  },
  "cpu-affinity": {
    s: "Restricts a virtual processor to a set of physical processors, trading flexibility for cache locality, predictable latency and isolation.",
    d: "A thread's allowed set is a bitmask; pinning to one processor eliminates migration and keeps its caches warm and its interrupts stable. Latency-critical machines get dedicated cores with host work moved away from them; other machines share the remaining pool. Pinning interacts with hyperthreads, memory locality and power management. It is hard because static pinning wastes idle cores and does not survive host changes unless management recomputes it.",
    k: ["Dedicated cores vs shared pool: dedicated cores give stable latency and isolation, but waste capacity when idle and cannot be overcommitted.", "Pin virtual processors one to one vs allow a set: one to one gives predictable behavior, but a failed or throttled core stalls that guest processor."],
    p: ["Pinned virtual processors land on two hyperthreads of one core and each runs at half speed.", "Host interrupts or kernel threads are not moved off the dedicated cores and cause latency spikes."],
    v: "Pin a guest processor to one core, run a timer-latency test for an hour, and confirm worst-case latency is lower than for an unpinned run, with host counters showing no migrations of the thread.",
    dep: ["vcpu-threads", "numa-placement"]
  },
  "numa-placement": {
    s: "Places a machine's virtual processors and memory on the same node of a multi-socket host so that memory accesses stay local.",
    d: "The host knows the distance between nodes. The scheduler prefers running a virtual processor near the memory that backs its guest, and memory is allocated on the node where the machine starts, or spread by policy. A machine larger than a node spans several, and may be told the topology so the guest can place its own tasks. Misplacement costs memory bandwidth and latency invisibly. It is hard because loads shift, and moving memory between nodes is expensive.",
    k: ["Expose the host's node layout to the guest vs hide it: exposing allows the guest to optimize, but ties its layout to one host type and complicates migration.", "Migrate memory to follow processors vs move processors to memory: moving pages is costly but fixes things permanently; moving threads is cheap but constrained by load."],
    p: ["A machine's memory is on one node while its virtual processors run on another and every access crosses the interconnect.", "Memory left on a node that fills up forces new machines to allocate remotely."],
    v: "Run a memory-bandwidth test in a guest placed local versus remote and confirm the host's per-node counters show the expected traffic, with local placement showing higher bandwidth and lower latency.",
    dep: ["guest-memory-map", "host-memory-allocator", "cpu-affinity"]
  },
  "halt-polling": {
    s: "Decides what a physical processor does when a guest processor halts: yield it at once, or spin briefly in case work arrives in microseconds.",
    d: "When the guest executes a halt, it exits. Blocking the thread frees the processor but costs a wakeup of tens of microseconds when an interrupt arrives. Polling for a short window avoids that cost for workloads with frequent short idle periods, and the window adapts to how often polls succeed. Power management states of the physical processor are also involved. It is hard because polling burns energy and processor time that other machines could have used.",
    k: ["Adaptive polling window vs always block: adaptive polling cuts latency for chatty workloads, but wastes processor on those that rarely wake quickly.", "Poll in the host vs let the guest poll: host polling serves all guests, but a guest that polls itself gives the host nothing to reclaim."],
    p: ["Polling is enabled on an overcommitted host and burns processors other guests were waiting for.", "A guest polling in its idle loop never halts, and the host sees it as fully busy."],
    v: "Run a request-reply test between two guests with polling on and off and confirm round-trip latency falls with polling, while host processor use at idle rises by the expected amount.",
    dep: ["vcpu-threads", "interrupt-injection", "host-power-thermal"]
  },
  "steal-time": {
    s: "Reports to each guest how much of its runnable time was spent waiting because the host ran something else, so the guest can account for it.",
    d: "The monitor accumulates time during which a virtual processor was ready but not running and publishes it in a per-processor shared record. The guest scheduler reads it, subtracts it from its own accounting and may avoid making decisions on skewed timing. Without it a guest sees time passing with no work done and blames its own tasks. The same data tells operators a host is overcommitted. It is hard because the measurement must be cheap and exact across migration.",
    k: ["Expose steal time to the guest vs hide it: exposing allows correct accounting and better scheduling, but tells tenants about their neighbors' load.", "Publish by shared page vs by an event: a shared page costs nothing to read, but needs an agreed layout between guest and host."],
    p: ["The guest does not read the record, and its accounting shows idle time that was actually waiting.", "Steal is sampled once a second and misses bursts that cause latency spikes."],
    v: "Overcommit a host with busy guests, and confirm the steal figure inside each guest rises in proportion to the contention and matches the host's measured run-queue waiting for that machine.",
    dep: ["fair-share-scheduler", "metrics-collector"]
  },
  "gang-scheduling": {
    s: "Runs all virtual processors of one machine at the same time, or avoids running a lock holder's siblings in a way that makes them spin.",
    d: "If one virtual processor holds a lock and is descheduled, others spin on it until it returns, wasting their time. Strict co-scheduling runs all processors of a machine together, at the cost of idle slots when not all are runnable. Relaxed forms let skew grow to a limit. Alternatively the guest and the processor yield hints: a spinning virtual processor exits when it detects a long pause loop, letting the host run the holder instead. It is hard because strictness wastes capacity and leniency wastes spinning time.",
    k: ["Strict co-scheduling vs relaxed skew limits: strict removes lock-holder preemption but fragments the processor schedule, while relaxed keeps utilization and allows some spinning.", "Detect spinning in hardware vs have the guest report it: hardware detection works with any guest, but guesses; guest hints are precise but need a paravirtual lock."],
    p: ["A large machine on a busy host waits for enough free processors to start together, and starves.", "Pause-loop exits trigger on legitimate short spins and add exit overhead without benefit."],
    v: "Run a lock-contention benchmark in a four-processor guest on an overcommitted host with and without co-scheduling or pause-loop handling, and compare throughput and the guest's spin time.",
    dep: ["vcpu-threads", "fair-share-scheduler", "exit-handlers"]
  },
});
