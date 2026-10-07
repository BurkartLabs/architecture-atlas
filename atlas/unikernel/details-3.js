// Details for the unikernel plate, part 3: threading, memory, boot, drivers, cross-cutting.
ATLAS.details("unikernel", {
  "cooperative-scheduler": {
    s: "A scheduler in which threads run until they voluntarily yield or block, the default for many images because it needs no preemption machinery and no locking.",
    d: "Threads sit in a run queue; the scheduler switches only when the running thread waits for I/O, sleeps, or calls yield. Context switches are cheap function-like transitions, and data shared between threads needs no locks because nothing interrupts a critical section. It matches the single event loop model. The cost is that one runaway thread starves everything and that code written for preemption, such as spin waits, can hang.",
    k: ["Cooperative vs preemptive scheduling: cooperative is smaller, faster and lock-free; preemptive tolerates misbehaving threads and fairness needs.", "Run-to-block FIFO vs priority queues: FIFO is predictable and simple; priorities help latency-sensitive work but invite inversion."],
    p: ["A long computation never yields and the health check, timers and every connection stall.", "A spin-wait on a flag set by another thread loops forever."],
    v: "Run a thread that computes without yielding and measure the delay to a timer-driven thread. Confirm the figure matches the design and that yielding thread tests show round-robin order.",
    dep: ["timers-and-clock","interrupt-dispatch"]
  },
  "preemptive-scheduler": {
    s: "A scheduler that interrupts running threads on a timer and switches among them by priority or time slice, needed by runtimes and software that assume time-sliced threads.",
    d: "A periodic timer interrupt invokes the scheduler, which saves registers and picks the next thread. It requires per-thread kernel-like stacks, interrupt-safe locking, priority rules and sleeping queues. Language runtimes and multithreaded software expect it. The cost is code, latency jitter from interrupts and lock contention inside libraries that previously needed none. Hard parts are priority inversion, interrupt-safe data structures and making library code reentrant.",
    k: ["Time-slice round robin vs priorities: round robin is fair and simple; priorities favor urgent work and risk inversion and starvation.", "Tick-based vs tickless timers: ticks are simple; tickless saves wakeups when idle and complicates timekeeping."],
    p: ["A library not written for preemption corrupts shared state when interrupted mid-update.", "A high-priority thread waits on a lock held by a low-priority one and the system looks hung."],
    v: "Run CPU-bound threads of equal priority and confirm each gets a similar share. Then run a priority inversion test and confirm the configured protocol bounds the delay.",
    dep: ["timers-and-clock","interrupt-dispatch","synchronization-primitives"]
  },
  "synchronization-primitives": {
    s: "Mutexes, condition variables, semaphores and atomic operations that let threads protect shared data and wait for each other inside the image.",
    d: "On a single core with cooperative scheduling, many primitives reduce to flags. With preemption or multiple cores they use atomic instructions, spin briefly and then block through the scheduler, and interrupt handlers use variants that disable interrupts instead of blocking. The libraries use them internally for queues, buffers and allocators, so a lock choice in one library affects all. Hard parts are lock ordering across library boundaries and correctness of wakeups.",
    k: ["Real locks everywhere vs compile-time no-op locks in single-core builds: no-ops remove cost and are safe only if the build truly is single-threaded.", "Spin then block vs always block: spinning avoids switches for short holds; always blocking wastes less CPU for long holds."],
    p: ["A no-op lock build is later given a second thread and corrupts data without any error.", "A lock is taken in an interrupt handler and by a thread, deadlocking the core."],
    v: "Stress contended locks across threads or cores for long periods with a checker for ordering and lost wakeups, and run the same test with the build configured single-threaded to confirm it still passes.",
    dep: ["interrupt-dispatch"]
  },
  "single-core-mode": {
    s: "A configuration in which the image uses exactly one virtual CPU, which removes cross-core coordination from nearly every library.",
    d: "With one CPU, there is no need for atomic instructions in many paths, no cache line contention, no interrupt steering and no inter-processor signaling. The scheduler and allocators are simpler and faster per request. Scaling is by adding instances instead of cores, which fits the replace-and-scale model and keeps each instance small. The trade-off is that one slow request or garbage collection pause stalls the instance, and a single instance cannot use a large host.",
    k: ["Many small single-core instances vs fewer multicore instances: small instances isolate failures and scale simply; multicore instances share memory and caches efficiently.", "Idle halt vs busy polling: halting saves host CPU; polling lowers latency at the price of a fully used core."],
    p: ["A long handler occupies the only core and the health check fails, causing a restart under load.", "Memory duplicated across many instances makes the fleet larger than the equivalent multicore design."],
    v: "Run the load test against a single-core build and a multicore build with the same total CPU. Compare throughput, tail latency and memory, and confirm the single-core library build has no atomic operations in hot paths.",
    dep: ["cooperative-scheduler","build-configuration"]
  },
  "multicore-support": {
    s: "Starting additional virtual CPUs, giving each a stack and per-core data, and coordinating them with locks, interrupts and inter-processor signals.",
    d: "At boot the first processor brings up the others through the hypervisor's start protocol, and each sets up its own stack, timers and interrupt handling. Run queues are per core or shared, and allocators need per-core caches to avoid contention. Libraries must be thread-safe, and the network stack ideally spreads connections or queues across cores. Hard parts are cache coherence costs, lock contention in shared libraries and testing races that only appear on real parallel execution.",
    k: ["Shared run queue vs per-core queues: shared queues balance automatically; per-core queues avoid contention and need work stealing.", "Spread connections by hashing to cores vs a single network core: hashing scales; a single core is simple and becomes the limit."],
    p: ["A library assumed single-threaded is used from several cores and corrupts its state intermittently.", "All interrupts arrive on the boot core and it becomes the bottleneck."],
    v: "Boot with several virtual CPUs and confirm each reports in. Run a parallel workload and verify throughput scales with core count until the expected limit, with a race detector pass on a debug build.",
    dep: ["preemptive-scheduler","synchronization-primitives","interrupt-controller-driver"]
  },
  "timers-and-clock": {
    s: "The sources of time and delay: a wall clock, a monotonic clock and timer events, all derived from hypervisor-provided clocks.",
    d: "At boot the image reads the hypervisor's clock sources, calibrates a counter frequency, and sets wall time from a host value. Timer events are kept in a sorted structure and the next one is programmed into the virtual timer device. The monotonic clock is used for timeouts and measurements, and wall time for logs and certificate checks. Hard parts are drift, jumps when the host resumes or migrates a machine, and the cost of programming timers on virtualized hardware.",
    k: ["Tickless one-shot timers vs a fixed periodic tick: tickless saves wakeups and power; a tick is simpler and adds jitter.", "Trust host wall time vs synchronize over the network: host time is available at boot; network time corrects drift and needs a protocol and trust."],
    p: ["The wall clock jumps after a host pause and every timeout, lease and certificate check misfires.", "A timer wheel with coarse resolution makes short timeouts late."],
    v: "Compare image timestamps with host time across hours and across a paused and resumed machine. Measure timer accuracy for 1 ms and 100 ms requests and confirm drift and error stay within bounds.",
    dep: ["clock-calibration","interrupt-dispatch"]
  },
  "interrupt-dispatch": {
    s: "The mechanism that routes hardware and virtual interrupts to handlers, runs them briefly and hands deferred work to threads.",
    d: "The boot stub installs a table of vectors; the interrupt controller driver acknowledges each interrupt and calls the registered handler. Handlers do the minimum, such as marking a queue as having work, and wake a thread or set an event for the rest. Faults and exceptions share the machinery. It must be correct before almost anything else, and is unforgiving: a handler that allocates memory or takes a held lock hangs the machine. Masking and nesting rules need care.",
    k: ["Short handlers with deferred work vs doing everything in the handler: deferring keeps latency low and handlers safe; doing everything is simpler for tiny images.", "Interrupt-driven vs polling devices: interrupts save CPU when idle; polling is faster under load and avoids interrupt cost."],
    p: ["A handler calls the allocator while the interrupted code holds its lock and the machine hangs.", "An unhandled vector halts the machine with no information."],
    v: "Trigger each handled interrupt source and fault in a test image and confirm each reaches its handler with correct state. Confirm an unexpected vector prints a diagnostic before halting.",
    dep: ["interrupt-controller-driver","cpu-mode-setup"]
  },
  "io-readiness-polling": {
    s: "The facility that tells the event loop which sockets, timers and devices are ready, so a single thread can wait on many sources at once.",
    d: "Ready-state flags are set by the stack and drivers when data arrives or space frees. The poll call collects them, blocking on the hypervisor's halt-until-interrupt operation when none are ready. Select and poll style interfaces in the compatibility layer are built on it. Scanning every descriptor costs time at high counts, so efficient designs keep ready lists. The hard part is avoiding lost wakeups when an event arrives between checking and sleeping.",
    k: ["Ready lists maintained by the stack vs scanning all descriptors: lists scale with active sockets; scanning is simpler and slows with large counts.", "Level-triggered vs edge-triggered notification: level is forgiving of missed handling; edge is cheaper and demands reading until empty."],
    p: ["A wakeup arrives just before the machine halts and the event is not processed until the next interrupt.", "Edge notification is used and a partly read buffer never wakes the application again."],
    v: "Hold many idle connections and send data to one at a time. Confirm that only the active one is reported, latency is flat as idle count grows, and the machine halts while nothing is ready.",
    dep: ["interrupt-dispatch","socket-layer"]
  },
  "physical-page-allocator": {
    s: "The allocator that tracks which frames of the virtual machine's memory are free and hands out pages and runs of pages to the heap, stacks and buffers.",
    d: "At boot it takes the memory map discovered from the hypervisor, subtracts the image itself and reserved areas, and manages the rest with a bitmap, free lists or a buddy structure. Higher allocators carve fixed-size pools and the heap from it. Because there is no swapping, running out is final. Fragmentation matters for requests needing contiguous memory, such as device rings. Memory ballooning from the host can remove pages from it.",
    k: ["Buddy allocator vs bitmap: buddy gives fast power-of-two runs with some internal waste; bitmaps are simple, compact and slower to search.", "Reserve contiguous regions at boot vs allocate on demand: reserving guarantees device buffers; on demand uses memory better and can fail later."],
    p: ["Memory is fragmented and a large contiguous allocation for a device queue fails after hours of running.", "A leak in a library exhausts all pages with no swap to absorb it."],
    v: "Print the free page count at boot and after a long soak test. Confirm it returns to its baseline after load, and that a contiguous request of the configured maximum still succeeds.",
    dep: ["memory-map-discovery","static-memory-map"]
  },
  "static-memory-map": {
    s: "The single fixed virtual address layout, set up at boot, of code, data, heap, stacks and device regions, with typically one mapping for all code.",
    d: "At boot the image builds page tables, often as a flat identity mapping of all memory, with permissions per region from the linker's section layout. There are no per-process spaces and no demand paging, so memory is resident and translation faults are bugs. This saves context switch costs and simplifies drivers, since physical and virtual addresses coincide. It also means any stray pointer can touch any memory unless permissions and guard pages are set, which is why the map is a security feature as well.",
    k: ["Identity mapping vs a separate virtual layout: identity is simple and fast for devices; a separate layout allows randomization and guard areas at more complexity.", "Mapping all memory upfront vs on demand: upfront is predictable with no faults; on demand reduces startup cost for large memory."],
    p: ["A flat mapping with all pages writable lets a stray write change code and no fault occurs.", "The map is built before the memory size is known and later memory is unusable."],
    v: "Dump the page table regions from the console or debugger and compare permissions with the linker's section layout. Confirm accesses outside mapped regions fault with a diagnostic.",
    dep: ["cpu-mode-setup","memory-map-discovery"]
  },
  "heap-allocator": {
    s: "The general allocator behind malloc-style calls, tuned to one application's pattern and the instance's fixed memory.",
    d: "It manages a heap carved from physical pages using size classes, free lists or a tree, sometimes with per-core caches. Without paging or a kernel, it returns memory to the page allocator rather than to an operating system. Different workloads favor different allocators, so images choose one at build time. It must be safe against concurrency, reasonably fast and resistant to fragmentation across weeks of uptime. Hardened variants add canaries and metadata checks.",
    k: ["Size-class allocator vs general-purpose best fit: size classes are fast and predictable; best fit wastes less memory with uneven sizes.", "Hardened allocator with checks vs the fastest one: checks catch overflows and double frees at a modest cost; fast allocators trust the caller."],
    p: ["Long-running fragmentation grows the heap until allocation fails although total free memory looks adequate.", "A double free is not detected and corrupts the free list, which the attacker can exploit."],
    v: "Run a representative workload for days and plot heap size and free blocks over time. It should plateau; confirm a deliberate double free is caught on the hardened build.",
    dep: ["physical-page-allocator","synchronization-primitives"]
  },
  "fixed-size-pools": {
    s: "Allocators that hand out equal-sized objects from preallocated arrays, used for packet buffers, connections and other hot-path structures.",
    d: "Each pool is an array with a free list, sized at build or boot, with constant-time allocate and free and no fragmentation. Libraries use them for connection state, timers, buffers and request objects. They give predictable latency and bound memory use. They fail hard when full, so limits must be sized for peaks and exhaustion needs a defined behavior. They also make leaks visible, since a pool that never returns to full is a bug.",
    k: ["Many small pools vs one general heap: pools are fast and bounded; the heap is flexible and risks fragmentation.", "Fail on exhaustion vs grow dynamically: failing gives clear limits and protects the instance; growth hides sizing errors until memory is gone."],
    p: ["A pool sized for average load runs out in a burst and the library drops work.", "An object freed twice enters the free list twice and two users share one object."],
    v: "Expose pool usage as metrics. Run load to peak and confirm the high-water mark is below capacity, then stop load and confirm every pool returns to zero in use.",
    dep: ["physical-page-allocator"]
  },
  "stack-allocation": {
    s: "How thread stacks are sized and placed, which in a single address space is a fixed choice made per thread rather than grown on demand.",
    d: "Each thread receives a stack from the page allocator at creation, with a size fixed in configuration. There is no automatic growth, so a deep call chain or large local array overflows into neighboring memory unless a guard page stops it. Small stacks save memory when thousands of threads or connections exist; large stacks protect recursive code. Interrupt and exception handlers use separate stacks to avoid depending on the interrupted thread's. Finding right sizes takes measurement.",
    k: ["Small fixed stacks vs large generous ones: small stacks allow many threads and risk overflow; large stacks are safe and consume memory per thread.", "A separate interrupt stack vs borrowing the thread's: separate is safer; borrowing saves memory and can overflow a small thread stack."],
    p: ["A thread overflows its stack into another thread's memory and the corruption appears far from the cause.", "Stack size set for the main thread is reused for thousands of workers and memory is exhausted."],
    v: "Fill each stack with a known pattern at creation and report the high-water mark after a load test. Confirm every thread stays within its size and that a deliberate overflow hits a guard page.",
    dep: ["physical-page-allocator","guard-pages"]
  },
  "guard-pages": {
    s: "Unmapped or no-access pages placed around stacks and heap regions so an overflow causes an immediate fault instead of silent corruption.",
    d: "When page protections are enabled, a page next to each stack and between regions is left inaccessible. Touching it triggers a fault that the handler reports with the address and thread. They cost virtual space and a page of memory each, plus page table entries. Without a memory protection unit, nothing stops overflows, which is why some images pay for page tables despite the single address space. Guard pages catch linear overflows but not writes that jump over them.",
    k: ["Guard pages on every stack vs only on the main one: all stacks gives full coverage at memory cost per thread; main only is cheaper and leaves others exposed.", "Large page mappings vs fine mappings with guards: large pages reduce translation cost; fine mappings allow guards."],
    p: ["Guard pages are omitted on thread stacks created by a library path nobody tested.", "A large array index skips over the guard page into valid memory."],
    v: "Overflow a stack and a heap region deliberately in a test image and confirm each faults at the guard page with a diagnostic naming the region and thread.",
    dep: ["static-memory-map","page-permissions"]
  },
  "large-page-mappings": {
    s: "Mapping memory in large page sizes, which reduces translation overhead and page table memory for the big, always-resident regions an image has.",
    d: "Since all memory is mapped at boot and none is swapped, large pages cover the heap and buffers with far fewer table entries and fewer translation misses. The cost is coarse permissions and alignment requirements, and the hypervisor must back them with large host pages to gain the full benefit. Benefit shows for memory-intensive services and in nested virtualization, where translation cost is multiplied. The code and guard regions still use small pages.",
    k: ["Large pages for data vs small pages everywhere: large pages cut translation misses; small pages give fine protection and less waste.", "Rely on host backing vs ignore it: aligned guest large pages only help when the host backs them too; otherwise the benefit shrinks."],
    p: ["A guard region is placed inside a large page and cannot be enforced.", "The host backs memory with small pages and the guest's large pages give no speedup."],
    v: "Run a memory-bound benchmark with large and small mappings and compare throughput and translation miss counters from the host. Confirm the layout printed at boot shows the intended page sizes.",
    dep: ["static-memory-map","physical-page-allocator"]
  },
  "memory-ceiling-and-ballooning": {
    s: "The fixed memory size chosen at launch and the optional host mechanism for taking back or giving memory from a running guest.",
    d: "Memory is set when the instance is created, and the image sizes pools, caches and the heap from it. Exceeding it means failure, not swapping. Some hypervisors support ballooning, where a guest driver hands pages back to the host on request, allowing overcommit at the price of the guest losing memory it might need. Right-sizing is central to density: the whole benefit of small instances disappears if each is given more than it uses. Measurement of actual need is the hard part.",
    k: ["Fixed size set at launch vs ballooning: fixed is predictable; ballooning raises density and creates memory pressure the image must handle.", "Generous headroom vs tight sizing: headroom is safe; tight sizing packs more instances and fails on a spike."],
    p: ["Instances are sized for the worst imaginable case and the host runs out of memory far below real utilization.", "Ballooning removes pages the heap believed it owned and the image crashes."],
    v: "Run peak load and record the minimum free memory the image reports. Confirm configured memory exceeds peak use by the chosen margin and that low-memory behavior is a clean, logged failure.",
    dep: ["physical-page-allocator","instance-launcher","paravirtual-transport"]
  },
  "boot-entry-stub": {
    s: "The first instructions the hypervisor runs, a small assembly routine that sets up a stack and a minimal environment and jumps to the initialization code.",
    d: "It starts in whatever processor state the boot protocol defines, which can be an early mode with paging off. It establishes a stack, clears uninitialized data, saves the boot information pointer and calls into the next stage. It runs before anything works: no console, no allocator, no exceptions. Because errors here give no output, it is tiny and heavily tested. Different boot protocols need different stubs, so images with several targets carry more than one.",
    k: ["Small stub per boot protocol vs one generic stub: per-protocol stubs are simple and fast; a generic one adapts but is larger and more error-prone.", "Early console output as soon as possible vs after setup: early output eases debugging at the cost of writing device-specific code in the first instructions."],
    p: ["The stack is set up with the wrong alignment and a later instruction faults with no output.", "Uninitialized data is not cleared and behavior differs from boot to boot."],
    v: "Boot a build that writes a character to the console from the first instruction and confirm it appears. Boot under each supported protocol and confirm the same banner follows.",
    dep: ["boot-image-formats"]
  },
  "boot-protocol-parsing": {
    s: "Reading the structure the hypervisor or loader passes at boot, which carries the memory map, command line, modules and device information.",
    d: "Protocols hand a pointer to a table or tree: a list of memory regions, a command line string, initial modules, and sometimes a description of devices. The image validates the structure, copies what it needs before reusing the memory that holds it, and passes values onward. Different hypervisors and loaders use different formats, so support for several is needed to run in several places. Mistakes here corrupt later setup, for example by allocating memory the structure itself occupies.",
    k: ["Supporting several protocols vs one: several run on more platforms at the price of code; one keeps the stub small and limits portability.", "Copy boot data early vs reference it in place: copying avoids overwriting it later; referencing saves memory and risks reuse."],
    p: ["The boot information area is overwritten by the page allocator before the command line is read.", "An unvalidated length field in the boot structure leads to reading past it."],
    v: "Boot with unusual memory layouts and long command lines and compare the memory map and parameters the image prints with what the launcher passed.",
    dep: ["boot-entry-stub"]
  },
  "cpu-mode-setup": {
    s: "Switching the processor into the mode the image runs in and setting up descriptor tables, paging, floating point state and exception vectors.",
    d: "Depending on the entry state, the image may need to enable a wider addressing mode, load tables that define segments and interrupt vectors, turn on paging, and enable floating point and vector instructions. It also configures per-CPU data and enables features such as write protection and no-execute. This code is delicate and processor-specific. Errors cause immediate resets or silent misbehavior. Starting in a modern mode directly, as some boot protocols allow, removes much of it.",
    k: ["Enter in the final mode directly vs transition from an early mode: direct entry removes code and risk; transitions support older loaders.", "Enable vector and floating point state always vs on demand: always is simple; on demand saves switch cost and needs trap handling."],
    p: ["A missing feature enable causes a fault only on a particular host processor model.", "Vector state is used by a library before it is enabled and faults at an unrelated point."],
    v: "Boot on each host processor family and virtual machine configuration the image supports, run a floating-point and vector test, and confirm exception handlers fire for a deliberate fault.",
    dep: ["boot-entry-stub"]
  },
  "memory-map-discovery": {
    s: "Learning which ranges of the guest's physical address space are usable memory, reserved, or devices, from the boot information or by probing.",
    d: "The boot structure lists regions with types. The image excludes its own code, the boot data and device windows, and gives the remainder to the page allocator. In simple environments it may read a size parameter instead. Holes, regions above 4 GB and memory added later by the host need handling. Getting this wrong either wastes memory or lets the allocator hand out addresses belonging to a device, which is a hard-to-trace failure.",
    k: ["Trust the boot map vs probe memory: the map is fast and authoritative; probing can find memory the map omits and risks touching devices.", "Use all memory vs leave a reserve: using all maximizes capacity; a reserve helps with host-side limits and later needs."],
    p: ["The allocator treats a device window as free memory and a write goes to the device.", "Memory above a hole is ignored and the instance has less than configured."],
    v: "Launch with several memory sizes and layouts and compare usable memory reported at boot to the launcher's setting. Confirm no allocation lies in a reserved or device range.",
    dep: ["boot-protocol-parsing"]
  },
  "device-discovery": {
    s: "Finding which virtual devices the hypervisor attached, by enumerating a bus, reading a device tree or using fixed addresses, and binding drivers to them.",
    d: "Some platforms expose a bus that the image scans for device identifiers; others describe devices in a tree passed at boot or place them at documented addresses. The image matches identifiers to compiled-in drivers and initializes each. Unlike a general operating system, only the few device types the build includes are recognized, so unknown devices are ignored. Order and timing matter: a driver may need interrupts and memory already working. Hot-plug is usually unsupported.",
    k: ["Bus scanning vs fixed addresses: scanning adapts to the host configuration; fixed addresses are simpler and break with different launchers.", "Probe all and ignore unknown vs fail on unknown: ignoring tolerates host variety; failing exposes unexpected devices early."],
    p: ["A device the host adds in a newer version is ignored and the feature silently does not work.", "Two drivers claim one device, both initialize it and neither works."],
    v: "Launch with a mix of devices, then print the discovered list and bound drivers on the console. Confirm it matches the launcher's configuration and that an unexpected device is reported.",
    dep: ["boot-protocol-parsing","interrupt-controller-driver"]
  },
  "boot-parameters": {
    s: "The command line or key-value block given to an image at launch, parsed early to set addresses, log levels and application arguments.",
    d: "The launcher places a string or block in boot information. The image splits it into options for the library OS, such as memory limits, network addresses and debug switches, and arguments for the application's main function. Quoting, size limits and encoding differ across launchers. It is the simplest per-instance configuration channel and arrives before any device works, so it is also the channel for choosing early behavior. Anything placed here can be seen by whoever can view the launcher's records.",
    k: ["Library OS options and application arguments in one string vs separate channels: one string is easy; separate channels avoid confusing option ownership.", "Strict parsing vs ignoring unknown options: strict catches typos; ignoring tolerates version differences between launcher and image."],
    p: ["A parameter with spaces is split by the launcher and the image sees the wrong values.", "Secrets are passed here and recorded in host process listings."],
    v: "Launch with quoted, empty and very long parameters and compare what the image prints as parsed with the values given. Confirm an unknown option is reported.",
    dep: ["boot-protocol-parsing"]
  },
  "library-init-ordering": {
    s: "The sequence in which libraries initialize, which must follow their dependencies: allocator before network, clock before timers, devices before stack.",
    d: "Each library registers an init function with a stage or dependency. The boot code runs them in order, usually by sorted tables built at link time. Early stages cannot allocate memory, later ones can. Because libraries are chosen per image, the order is computed per build. Errors appear as use of uninitialized state or deadlocks at startup. Making the order explicit and printing it at boot lets problems be spotted instead of inferred.",
    k: ["Declared stages vs explicit dependency graph: stages are simple and coarse; a graph is exact and requires every library to declare dependencies.", "Initialize everything linked vs initialize on first use: eager initialization is predictable; lazy saves boot time and hides ordering bugs."],
    p: ["A library initializes before the allocator and takes an invalid pointer that works only until memory layout changes.", "Two libraries each initialize the same device."],
    v: "Boot with init tracing and confirm each library's init runs once, after those it depends on. Reorder two stages in a test build and confirm the build or boot reports the violation.",
    dep: ["boot-parameters","heap-allocator","device-discovery"]
  },
  "clock-calibration": {
    s: "Determining the frequency of the processor's counter and the initial wall time at boot, so later timers and timestamps are accurate.",
    d: "The image reads clock information from the hypervisor, such as a reported counter frequency and a shared time structure, or measures the counter against a reference timer. It then converts counter values to nanoseconds with fixed-point arithmetic and sets wall time from the host's clock. Errors in frequency become drift for every timeout. Early boot has no timers, so calibration may use busy waits, which add to boot time. Migration or host changes can invalidate the result.",
    k: ["Read frequency from the host vs measure it: reading is instant and precise; measuring works where the host reports nothing and costs boot time.", "Fixed-point conversion vs floating point: fixed-point is safe in early boot; floating point needs enabled state."],
    p: ["Frequency is measured over too short a window and every duration is off by a fixed percentage.", "The image is moved to a host with a different counter rate and timers drift."],
    v: "Compare image time to the host over a long run and across live migration. Confirm drift stays within the tolerance, and that boot reports the frequency source it used.",
    dep: ["cpu-mode-setup","paravirtual-transport"]
  },
  "paravirtual-transport": {
    s: "The standard device interface between guest and hypervisor, with feature negotiation, configuration space and shared-memory queues, over which every paravirtual device runs.",
    d: "A device is found on a bus or at a memory address, and the driver negotiates features by reading offered bits and writing accepted ones, then configures queues and starts the device. A common transport lets one queue implementation serve network, block, console, entropy and other devices. Because the interface is specified openly, the same image runs on many hypervisors. The host implements the other side, and is the part of the system that must be trusted most.",
    k: ["Paravirtual devices vs emulated legacy hardware: paravirtual is fast and simple for the guest; emulated hardware needs complex drivers and is slower but runs anywhere.", "Negotiating all offered features vs a minimal set: more features give speed and add code and risk; a minimal set is robust and slower."],
    p: ["A feature is accepted that the driver does not fully handle and breaks only under particular traffic.", "The driver trusts host-supplied lengths and reads outside its buffers."],
    v: "Boot against several hypervisors and print negotiated features per device. Run traffic through each device and confirm correct operation, including with a host that offers a reduced feature set.",
    dep: ["device-discovery"]
  },
  "virtqueue-rings": {
    s: "Shared-memory ring buffers through which the guest posts buffers to a device and the device returns them, the core data structure of paravirtual I/O.",
    d: "A queue has descriptor tables, an available ring where the guest posts requests, and a used ring where the host reports completions. The guest writes entries, then notifies the host, which may suppress notifications while polling. Memory ordering is critical, because both sides read and write the same memory concurrently. Batching reduces notifications, and event suppression reduces interrupts. Hard parts are ordering barriers, queue sizing and handling of malicious or buggy hosts.",
    k: ["Notify on every post vs batch notifications: per-post gives low latency; batching cuts expensive host exits at the cost of delay.", "Interrupts for completions vs polling the used ring: interrupts save CPU when idle; polling gives lower latency under load."],
    p: ["A missing memory barrier makes the host see a descriptor before its contents are written.", "A full queue is not handled and the driver drops requests."],
    v: "Push requests through the queue at high rates and verify every request is completed exactly once. Run on a host with weak memory ordering or a race detector to expose missing barriers.",
    dep: ["paravirtual-transport","physical-page-allocator"]
  },
  "paravirtual-net-driver": {
    s: "The network driver for the paravirtual network interface: it exchanges packets with the host through queues and reports addresses, link state and offload features.",
    d: "It sets up receive and transmit queues, fills receive queues with buffers from the pool, and submits transmit buffers with a header describing offload requests. Interrupts or polling signal completion. Offloads such as checksum calculation and segmentation are negotiated; multiqueue spreads load across cores. The host's switch and network setup decide the real behavior, so differences between hosts show up here. The driver is small, but tuning it determines most of the image's network performance.",
    k: ["Single queue vs multiqueue: single is simple and sufficient for small instances; multiqueue scales across cores and needs per-core structures.", "Rely on host offload vs compute in the guest: offload saves cycles and relies on host correctness; guest computation is portable and slower."],
    p: ["Receive buffers are not refilled when the pool is low and the host drops packets silently.", "Checksum offload is assumed but the host path does not provide it, and packets are corrupted."],
    v: "Run a throughput and latency test between the image and a host peer with offloads on and off. Confirm counters match the generator and no checksum errors appear at the receiver.",
    dep: ["paravirtual-transport","virtqueue-rings","packet-buffer-pool","interrupt-dispatch"]
  },
  "paravirtual-block-driver": {
    s: "The driver for the paravirtual disk: it submits read, write and flush requests through a queue and reports capacity and completion status.",
    d: "Requests are descriptors with a header, data buffers and a status byte, posted to a queue. The driver supports multiple outstanding requests, queue depth tuning and flush for durability. Configuration reports size, sector size and whether the disk is read-only. The host's backing store, which may be a file, a network volume or a raw device, determines actual speed and durability. Errors from the host must propagate to filesystems and applications instead of being swallowed.",
    k: ["Deep queues vs shallow ones: deep queues use host parallelism; shallow queues keep latency low and memory small.", "Write cache enabled vs forced write-through: a cache is faster and loses data on host failure; write-through is slower and safer."],
    p: ["An I/O error status is ignored and the filesystem believes a write succeeded.", "Read-only attachment is not honored by the layer above and writes are retried forever."],
    v: "Write a pattern with flushes, restart the host and read it back from the image file. Inject an I/O error at the host and confirm the application receives it.",
    dep: ["paravirtual-transport","virtqueue-rings","interrupt-dispatch"]
  },
  "console-driver": {
    s: "The simplest device driver, which writes bytes to the virtual serial or console port and reads them back, working earlier in boot than any other.",
    d: "It may be a legacy serial port with a few registers, a memory-mapped UART, or a paravirtual console. Output can be polled, writing each byte after waiting for the device, which is the one thing that always works early. Buffered, interrupt-driven output is added later for speed. It carries boot messages, logs and panic output, and optional input for a debug interface. Slow console paths can hurt throughput if logging is verbose.",
    k: ["Polled output vs interrupt-driven buffered output: polled works from the first instruction and blocks; buffered is faster and available only after interrupts work.", "Console input enabled vs output only: input permits interactive debugging and is a control channel; output-only is safer."],
    p: ["Polled writes to a slow console stall the whole instance during verbose logging.", "Console input left enabled lets anyone with host access send commands."],
    v: "Write 1 MB of output and measure time and dropped bytes. Confirm early boot messages appear before interrupts are enabled and that the final panic message appears.",
    dep: ["device-discovery"]
  },
  "entropy-driver": {
    s: "The driver and pool providing random numbers from the host or a hardware source, needed for session keys, port numbers, layout randomization and canaries.",
    d: "A paravirtual device returns random bytes on request; a processor instruction offers another source. The image mixes sources into a pool and seeds generators for libraries. Early boot is the problem: protections that want randomness, such as layout and canary values, run before the device driver has started. Images with a poor source produce predictable keys, and a snapshot taken after seeding and restored many times repeats the same sequence.",
    k: ["Host-provided entropy vs in-guest sources: host entropy is high quality and early if the device is present; in-guest sources work anywhere and are weaker in virtual machines.", "Block until seeded vs continue with weak randomness: blocking is safe and delays boot; continuing is fast and risks predictable keys."],
    p: ["Many instances cloned from one snapshot generate identical random sequences.", "Canary and layout randomization use a seed available only after they were needed."],
    v: "Boot many instances and compare early random values for repeats. Confirm that cryptographic requests wait for seeding and that restoring a snapshot reseeds the generator.",
    dep: ["paravirtual-transport","virtqueue-rings"]
  },
  "host-guest-channel": {
    s: "A message channel between the image and the host, used for control commands, shutdown requests, secrets and status reports without using the network.",
    d: "It can be a socket-like device in the hypervisor, a small shared-memory mailbox or a serial line with a framing protocol. The host launcher uses it to request shutdown, pass configuration and collect status. It avoids the guest network, so it works before the network is up and with no network at all. It is also a trust boundary: messages come from the host, which has full power over the guest, and a bug in parsing them is reachable by anyone controlling the host side.",
    k: ["A dedicated host channel vs using the guest network: a channel works early and is independent; the network is more flexible and exposes more.", "A rich command protocol vs a minimal set: a rich protocol serves operations; a minimal one reduces parsing surface."],
    p: ["Messages are parsed without length checks and a malformed one crashes the image.", "Several instances on one host share a channel and receive each other's commands."],
    v: "Send each defined message type from the host and confirm the expected action. Send malformed and oversized messages and confirm they are rejected without crashing.",
    dep: ["paravirtual-transport","virtqueue-rings"]
  },
  "interrupt-controller-driver": {
    s: "The driver for the virtual interrupt controller and local timer interface, which enables, masks and acknowledges interrupts for each virtual processor.",
    d: "It programs the controller to deliver device interrupts to chosen processors, acknowledges them, and signals end of handling. For multicore images it also sends inter-processor interrupts for wakeups and cross-core requests. Newer virtual controllers reduce costly exits to the host. The driver is small and exactness matters: a missed acknowledge blocks all further interrupts of that kind, and a wrong mask loses events. Different hypervisors present different controller models.",
    k: ["Message-signaled interrupts vs legacy lines: message-signaled interrupts are precise and scale across queues; legacy lines are universal and shared.", "Interrupt affinity pinned to cores vs left to the host: pinning gives locality and predictability; leaving it is simple."],
    p: ["An interrupt is not acknowledged and that device is dead until reboot.", "All interrupts land on one core and it saturates while others idle."],
    v: "Generate interrupts from each device and a timer and confirm counts per processor match expectations. Mask and unmask a source and confirm events are held, then delivered.",
    dep: ["cpu-mode-setup","device-discovery"]
  },
  "device-passthrough": {
    s: "Giving the image direct control of a physical device, such as a network card, through the hypervisor, bypassing the paravirtual path for maximum performance.",
    d: "The host assigns a physical device to the guest and maps its registers and memory. The image then needs a real driver for that hardware, an interrupt setup and protection from device-initiated memory access by an address translation unit. It gives near-native speed for network and storage-heavy workloads. It also ties the image to specific hardware, complicates migration and moves a bug in the driver from the host to the guest, which now controls real hardware.",
    k: ["Passthrough vs paravirtual device: passthrough gives the best throughput and latency; paravirtual keeps images portable and migratable.", "Polling-mode driver in the image vs interrupts: polling reaches line rate and consumes a core; interrupts save CPU at lower peak."],
    p: ["The device can read any guest memory because address translation protection is not enabled.", "The image is moved to a host without the device and fails at boot."],
    v: "Run a line-rate packet test with passthrough and paravirtual devices and compare throughput and latency. Confirm the host's translation unit blocks a deliberate access outside permitted regions.",
    dep: ["device-discovery","interrupt-controller-driver","packet-buffer-pool"]
  },
  "specialization-and-minimalism": {
    s: "The principle that each image contains only what its one application needs, which drives size, speed and security together and shapes every layer below.",
    d: "The system gains by omission: fewer libraries, drivers, options and code paths. Every layer is built to be left out, with separable libraries, compile-time features and no mandatory core beyond boot and memory. The cost is that each configuration is a distinct system: it needs its own testing, and behavior varies between images. Tooling must make leaving things out the default and make the result inspectable. The risk is that an omitted component turns out to be needed only under rare conditions.",
    k: ["Many small configurable libraries vs a fixed core with options: small libraries allow exact images; a fixed core is simpler to test and carries unneeded code.", "Per-application tuned images vs a few shared standard images: tuned images are the smallest and fastest; shared ones are easier to certify and patch."],
    p: ["The test matrix explodes, because each configuration combination behaves differently and few are tested.", "An omitted component is needed by a rare error path and the failure is discovered in production."],
    v: "Compare a minimal and a default image for the same application on size, boot time and linked symbols. Confirm every omitted component is justified, and that tests exist for each shipped configuration.",
    dep: []
  },
  "single-address-space-model": {
    s: "The property that the application and operating system share one address space and privilege level, which removes system call and context switch costs and also removes internal isolation.",
    d: "Calls into the OS are function calls; data moves without copying; there are no user and kernel modes in practice. This simplifies everything from drivers to allocators and speeds up I/O. It also means a memory error anywhere can corrupt anything, and the application can break the OS libraries. Defenses are added back selectively: page permissions, guard pages, hardening and the hypervisor boundary outside. Design choices in every library assume this trust, so adding separation later is difficult.",
    k: ["One privilege level for speed vs internal separation for containment: one level is fastest and simplest; separation limits a bug's reach and brings back costs.", "Direct library access vs mediated interfaces: direct access allows zero-copy and tuning; mediated interfaces protect library invariants."],
    p: ["An application bug overwrites library state and the crash appears inside a library, misleading the investigation.", "Code is added from an untrusted source on the assumption of isolation that does not exist inside the image."],
    v: "Deliberately corrupt library memory from application code in a test image and confirm that the effect is as the model predicts, then confirm only the hypervisor boundary contains it.",
    dep: []
  },
  "compatibility-versus-purity": {
    s: "The standing choice between running existing software through POSIX-like shims and building new software against native interfaces, which decides size, speed and the cost of adoption.",
    d: "Compatibility lets existing programs and libraries run, which is what makes unikernels usable beyond new code. It brings translation layers, stubs and larger images, and reintroduces concepts like descriptors and threads that the model does not need. Purity keeps images small and fast but needs rewriting, and fewer libraries exist. Most systems offer both. The decision affects the build, the shim layers, the runtime and the testing effort for every layer that must pretend to be something it is not.",
    k: ["Compatibility by default vs native by default: compatibility speeds adoption; native gives the best images and demands new code.", "Wide POSIX coverage vs a small tested subset: wide coverage runs more software; a subset is reliable and easy to verify."],
    p: ["A stubbed behavior makes ported software appear to work and fail in production.", "Native interfaces diverge across library OS projects and applications get locked in."],
    v: "Port a representative existing application and measure the work, image size and behavior against a native rewrite of its core. Record every stub the port hits.",
    dep: []
  },
  "immutability-and-redeploy": {
    s: "The rule that an image is never modified after build: change means a new image and a new instance, which makes state, rollout and rollback explicit.",
    d: "There is no package manager, shell or login, so patching in place is not possible. Every change goes through build, test, signing and redeploy. This gives reproducible, auditable systems and clean rollback. It requires that state live outside the instance, that deployment be fast and automated, and that configuration be injected at boot. It also means a security patch to a library needs a rebuild of every image that includes it, so inventory of what is in each image is essential.",
    k: ["Replace instances vs patch in place: replacement is clean and testable; patching is faster for a single fix and not available here.", "Rebuild everything on a library fix vs rely on shared libraries: rebuilding is explicit and traceable; shared libraries patch once and break isolation of images."],
    p: ["A vulnerable library lives in forty images and nobody has a list of which ones.", "State kept in the instance is lost at each deploy and is noticed only after an outage."],
    v: "Publish a library fix and measure the time from commit to every affected image running the new build. Confirm an inventory query lists all images containing the library.",
    dep: []
  },
  "observability-without-a-shell": {
    s: "The need to see inside systems that have no shell, process list or filesystem to inspect, by compiling logs, metrics, traces and debug access into the image.",
    d: "Familiar tools do not exist, so visibility is designed in: structured logs shipped off the instance, metrics endpoints, trace spans, dumps and a debug connection from the host. These are chosen at build time, and each costs size and runtime overhead. Problems that need an unplanned question cannot be answered on the live instance, so teams reproduce them in a debug build or use host-side introspection. The practice is to make questions answerable beforehand and to keep symbols for every deployed build.",
    k: ["Rich built-in telemetry vs a lean image with host-side tools: rich telemetry answers more at the cost of size and overhead; lean images rely on host introspection.", "Debug build for investigation vs one build for all environments: a debug build is powerful but differs from production; a single build is faithful and limits the tools."],
    p: ["An incident needs a metric nobody exported and the instance is gone before anyone can add it.", "Symbols for a deployed build are lost and dumps cannot be read."],
    v: "Run an incident drill: introduce a fault in a staging image and diagnose it using only logs, metrics, traces and dumps exported by the image. Record any question that could not be answered.",
    dep: []
  },
  "trust-boundary-placement": {
    s: "Deciding where isolation actually lives: with no process boundary, protection comes from the hypervisor outside and from hardening inside, and every design choice must be checked against that.",
    d: "In a conventional system the kernel separates programs from each other and from itself. Here, one image trusts all its own code, and the boundary is the virtual machine. Anything that must be separated, such as tenants, secrets handlers or untrusted parsers, needs a separate image, not a library. Choices follow: how many images per host, which share networks, what the host channel can do, and how the hypervisor is configured. The model is strong at the edge and weak inside.",
    k: ["One image per trust domain vs several components in one image: separate images give strong isolation and cost memory and network hops; one image is efficient and shares fate.", "Trusting the host fully vs treating it as hostile: trusting is simple; treating it as hostile needs encryption and attestation and is costly."],
    p: ["Untrusted plug-in code is loaded into the image and has full access to keys and memory.", "The host channel is treated as trusted and gives a compromised host a path into secrets."],
    v: "Draw each image's trust boundary and test it: compromise one component in a test image and confirm which secrets and neighbors can be reached, and that this matches the diagram.",
    dep: []
  },
});
