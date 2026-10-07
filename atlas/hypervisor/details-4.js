// Details for the hypervisor plate, part 4: memory virtualization, isolation, host foundation, cross-cutting concerns.
ATLAS.details("hypervisor", {
  "guest-memory-map": {
    s: "The layout of the guest's physical address space and its backing in host memory: RAM regions, device windows, firmware areas and holes.",
    d: "The device model registers regions: RAM slots backed by host memory (anonymous or file-backed, possibly huge-page), device memory-mapped windows with no backing, and read-only firmware. The monitor builds its translation structures from this map and answers faults against it. Regions can be added or removed for hot-plug and are tracked for dirty logging and migration. Both the monitor and the device model read and write guest memory through it. It is hard because the map changes while the guest runs, and every user must see changes consistently.",
    k: ["Host virtual memory regions mapped into the guest vs memory owned by the monitor: mapping lets ordinary host mechanisms (swap, sharing, migration) apply, but ties guest memory to host policy.", "Large contiguous slots vs many small ones: few slots make lookups cheap, but hot-plug and fine-grained dirty tracking want smaller units."],
    p: ["A region is removed or resized while a device thread is still reading it, causing a stale access.", "Two overlapping registrations make the guest see different memory depending on which structure answers."],
    v: "Dump the map, check that RAM regions and device windows have no overlaps, add a hot-plugged region while a test guest runs, and confirm it appears in the guest and in the dirty-tracking set.",
    dep: ["huge-page-backing", "host-memory-allocator"]
  },
  "nested-page-tables": {
    s: "Hardware that translates guest physical addresses to host physical addresses in a second table, so the guest manages its own page tables without monitor intervention.",
    d: "The guest's page tables map guest virtual to guest physical addresses; the processor walks them and for each guest physical address walks a second, monitor-owned table to find the host page. Guest page-table updates cause no exits. A miss costs up to a two-dimensional walk, much longer than a native one, so caches of partial walks and large pages matter. Permissions are enforced by the second table as well. It is the foundation of efficient memory virtualization, and of dirty tracking and sharing.",
    k: ["Nested tables vs shadow tables: nested removes page-table exits and simplifies the monitor, but TLB misses are costlier; shadow tables make misses native-speed but make updates exit.", "Large pages in the second table vs small: large pages shorten walks and save table memory, but make sharing, swapping and dirty tracking coarser."],
    p: ["A workload with poor locality sees a large slowdown from two-dimensional walks that a native run would not.", "A stale second-level mapping stays after the host reclaims a page, and the guest touches freed memory."],
    v: "Run a pointer-chasing benchmark in a guest with small and large pages in the second table, and confirm the measured TLB miss cost matches the expected difference and no guest page-table write causes an exit.",
    dep: ["guest-memory-map", "tlb-management", "hw-virt-extensions"]
  },
  "shadow-paging": {
    s: "The older technique where the monitor builds combined tables mapping guest virtual straight to host physical, tracking every change the guest makes to its own tables.",
    d: "The hardware walks only the shadow table. The monitor write-protects the guest's page-table pages, so every guest update faults; the monitor then updates the shadow entry to match. Context switches in the guest, which change the table root, also exit. It runs at native speed for TLB misses and works on processors without a second translation level. It is expensive for workloads that change mappings often, such as process creation, and complex to keep consistent across virtual processors.",
    k: ["Shadow tables vs nested tables: shadow needs no second-level hardware and has cheap walks, but update-heavy guests slow badly and the code is intricate.", "Cache shadow tables across context switches vs rebuild: caching saves work on switching back, but memory and invalidation complexity rise."],
    p: ["A missed invalidation leaves a shadow entry mapping a page the guest has since unmapped.", "A fork-heavy workload takes an exit for each page-table write and runs several times slower than native."],
    v: "Run a process-creation benchmark with shadow and nested tables, and compare exit counts and runtime; verify via a test guest that unmapping a page makes the next access fault in the guest.",
    dep: ["guest-memory-map", "nested-fault-handler", "tlb-management"]
  },
  "nested-fault-handler": {
    s: "Handles accesses to guest physical addresses that have no valid mapping: faulting in memory, resolving swapped or shared pages, and forwarding device accesses.",
    d: "When the second-level walk fails, the processor exits with the address and access type. The handler consults the memory map. For RAM it allocates or locates the host page, fills the entry and resumes; for a swapped or compressed page it brings it back; for a write to a shared page it copies the page first; for a device window it forwards to the device model; otherwise the guest is stopped. In post-copy migration it requests the page from the source. It is hard because it runs under locks that racing faults and invalidations also need.",
    k: ["Map one page per fault vs map ahead: single pages keep memory use exact, but read-ahead of neighbors cuts fault counts for sequential access.", "Fault into large pages when possible vs always small pages: large pages cut faults and table size, but need contiguous host memory."],
    p: ["A fault races with an invalidation and maps a page the host has just freed.", "The first touch of a large guest after start takes millions of faults and makes boot slow."],
    v: "Start a guest with large unfaulted memory, touch pages in a pattern, and confirm each first touch produces exactly one fault with the expected address, and a second touch produces none.",
    dep: ["nested-page-tables", "guest-memory-map", "host-memory-allocator"]
  },
  "tlb-management": {
    s: "Keeps cached address translations correct as mappings change, and uses address-space tags so switching between guest and host does not flush them all.",
    d: "Translation caches hold guest and host results. Tags per virtual machine (and per guest address space) let entries from different contexts coexist, so entry and exit need no full flush. When the monitor changes a second-level mapping, it must invalidate the affected entries on every processor that may hold them, by inter-processor interrupt or a broadcast instruction. These shootdowns are costly on large machines. It is hard because a missed invalidation is a silent security bug and an excess is a performance bug.",
    k: ["Tagged translations vs flush on every switch: tags keep caches warm across transitions, but tag space is limited and must be recycled carefully.", "Batch invalidations vs flush immediately: batching amortizes inter-processor cost, but leaves stale entries live a little longer."],
    p: ["A shootdown misses a processor on which the virtual processor last ran, and the guest accesses a page that now belongs to another machine.", "Frequent mapping changes cause shootdown storms that stall all virtual processors."],
    v: "Unmap a page that a guest processor has recently used, then access it from that processor, and confirm the access faults (never uses the stale translation) on every processor that had cached it.",
    dep: ["nested-page-tables", "vcpu-control-state"]
  },
  "ballooning": {
    s: "A driver inside the guest that allocates and hands back memory to the host on request, so the host can reclaim pages the guest is not really using.",
    d: "The host sets a target size; the guest's balloon driver allocates pages (forcing the guest to evict caches or swap its least valuable memory) and tells the host their addresses; the host unmaps and reuses them. Deflating returns pages. The guest decides what to give up, using its own knowledge of which pages are cheap to lose, which is better than the host guessing. It is hard because the guest may refuse or be slow, and an aggressive balloon pushes the guest into swapping, hurting its performance severely.",
    k: ["Guest-cooperative ballooning vs host-level swapping: ballooning picks cheap pages using guest knowledge, but depends on a driver and a responsive guest.", "Free-page reporting vs target-driven inflation: reporting reclaims only idle pages continuously, at small performance cost, while targets reclaim more but pressure the guest."],
    p: ["A guest without the driver, or with it stopped, cannot be reclaimed from and the host runs out of memory.", "Inflating too far makes the guest kill its own processes through its out-of-memory handling."],
    v: "Inflate a guest's balloon by one gigabyte while it is mostly idle and confirm host free memory rises by that amount and guest free memory falls, then deflate and confirm both return.",
    dep: ["guest-drivers", "overcommit-manager", "guest-memory-map"]
  },
  "page-sharing": {
    s: "Finds guest pages with identical contents and maps them to one read-only host page, copying on the first write, so duplicate data costs memory once.",
    d: "A scanner hashes candidate pages, compares full contents when hashes match, and then replaces the duplicates with mappings of a single page marked copy-on-write. Zero pages and common library or kernel images shrink the most. A write fault allocates a private copy. Savings depend on how similar guests are. It is hard because scanning costs processor time and memory bandwidth, and because shared pages create timing and write side channels between tenants.",
    k: ["Content-based sharing vs explicit sharing of a common base image: content-based finds more without cooperation, but scans cost cycles and open side channels; explicit sharing is cheap and predictable.", "Share only within one tenant vs across all: restricting sharing closes cross-tenant leaks, but saves less."],
    p: ["Cross-tenant sharing lets one guest detect by write timing whether another holds specific data.", "A sudden break of sharing (many guests rewriting pages at once) increases memory use faster than the host can reclaim elsewhere."],
    v: "Boot identical guests, run the scanner, and confirm host memory used drops by the expected amount with shared-page counters rising; write to a shared page in one guest and confirm the other guest's copy is unchanged.",
    dep: ["nested-page-tables", "nested-fault-handler", "overcommit-manager"]
  },
  "overcommit-manager": {
    s: "Allows the total memory given to guests to exceed physical memory, and decides when and how to reclaim pages as the host comes under pressure.",
    d: "It tracks each machine's configured size, actual resident size and recent working set, and compares host free memory against thresholds. Reclaim steps escalate: page sharing, ballooning, compression, then swapping guest pages to disk. It applies reservations and limits from resource pools, and picks victims by shares and idle memory. It is hard because guest memory demand changes in seconds and reclaim takes longer, and because the last resort, swapping, hurts both performance and predictability.",
    k: ["Allow overcommit vs reserve all memory: overcommit packs more machines per host, but risks pressure events that hurt every guest; reservation is predictable and wastes idle memory.", "Reclaim early at low cost vs late at high cost: early reclaim keeps headroom, but takes memory from guests that would have used it."],
    p: ["Memory demand spikes across many guests together, and reclaim cannot keep up before the host starts killing processes.", "Idle-memory estimates are wrong and the manager takes pages from a guest's active set."],
    v: "Start guests whose configured memory is double physical memory with a known idle fraction, confirm all run, drive host pressure up gradually, and verify the reclaim steps fire in the defined order with a log entry for each.",
    dep: ["ballooning", "page-sharing", "host-swap-compression", "resource-pools"]
  },
  "host-swap-compression": {
    s: "The last-resort reclaim methods in the host: compressing cold guest pages in memory, or writing them to a swap device, without the guest's cooperation.",
    d: "The host selects cold guest pages (by access bits in the second table), compresses them into a smaller pool, or writes them to swap, and unmaps them. A later guest access takes a nested fault, and the handler decompresses or reads the page back, stalling the virtual processor. Compression is far cheaper than disk. The guest cannot see which of its pages are gone and may itself page them, causing double paging. It is hard because choosing cold pages without guest knowledge is inaccurate.",
    k: ["Compress before swapping vs swap only: compression returns memory cheaply with small latency, but spends processor; swap frees more, with a large stall per page.", "Swap on fast local device vs shared storage: local is fast and predictable, but consumes capacity per host, while shared storage adds a dependency and tail latency."],
    p: ["The guest's and the host's paging both evict the same cold pages, and each fetch costs two disk reads.", "A swap device on the same storage as guest disks creates a feedback loop under pressure."],
    v: "Force host pressure on a machine with a known cold region, read that region back, and confirm the fault count and fault latency match compression or swap, and contents are identical to what was written.",
    dep: ["nested-fault-handler", "overcommit-manager", "host-drivers"]
  },
  "huge-page-backing": {
    s: "Backs guest memory with large host pages so translations are fewer, TLB reach is larger and page walks are shorter.",
    d: "Host memory is reserved in large contiguous units (megabytes or gigabytes) at boot or allocated and merged at run time. Using them for guest RAM shortens two-dimensional walks and cuts table memory. They can be pinned in a pool so allocation is predictable. They are less flexible: reclaim, sharing, swapping and dirty tracking work on the large unit unless it is split. It is hard because fragmentation makes large contiguous blocks unavailable after a host runs for a while.",
    k: ["Preallocated pool vs transparent promotion: a pool gives deterministic availability and speed, but reserves memory whether used or not; transparent promotion adapts, but is subject to fragmentation and background compaction cost.", "Split on demand for tracking and sharing vs keep intact: splitting restores fine granularity when needed, but loses the speed gain for that region."],
    p: ["Fragmentation prevents a large allocation and the machine silently falls back to small pages and runs slower.", "A reserved pool is sized once and wastes memory when the guest mix changes."],
    v: "Start a guest with large-page backing and read host counters to confirm the guest memory is mapped in large pages; compare a random-access benchmark against small-page backing and confirm the difference.",
    dep: ["host-memory-allocator", "guest-memory-map"]
  },
  "side-channel-mitigations": {
    s: "Hardware and software measures against leaks through speculation, timing and shared microarchitectural state between guests and between a guest and the host.",
    d: "Mitigations include flushing predictors and buffers on switching between guests, clearing the level-one cache before entry, restricting speculation, and hiding precise timers. Each costs cycles on the hot entry and exit path, with the cost depending on processor generation. Some are invoked only by processors that report themselves vulnerable. Guests need to know which mitigations apply, and the monitor reports it. It is hard because new variants appear after deployment, each needing a firmware, monitor or guest change.",
    k: ["Mitigate on every transition vs only for cross-tenant switches: always flushing is safe, but costs most; conditional flushing saves cycles where machines trust each other.", "Disable simultaneous multithreading vs schedule only trusted threads together: disabling removes a whole class of leaks, but loses a large share of throughput."],
    p: ["A new variant is announced and the fleet runs vulnerable until microcode and monitor updates roll out.", "Mitigation flags are not passed to a guest, so its kernel runs without the protection it thinks is host-provided."],
    v: "Run a published leak test from one guest against another on the same core with mitigations on and off, and confirm leaked bytes are recovered only with them off; record exit cost with each setting.",
    dep: ["vm-entry-exit", "core-cache-isolation", "cpuid-msr-virtualization"]
  },
  "core-cache-isolation": {
    s: "Keeps different tenants off the same core, cache partitions or memory channels, so shared hardware cannot carry information or contention between them.",
    d: "Core scheduling allows threads of only one trust domain on the sibling hardware threads of a core at a time. Cache partitioning hardware assigns each domain a share of the last-level cache, and bandwidth controls bound memory use. Dedicated hosts or cores give the strongest separation. These also reduce noisy-neighbor interference, which is a performance concern as well as a security one. It is hard because isolation lowers utilization, and hardware partitions are coarse and few.",
    k: ["Core-level isolation vs host-level isolation: core-level allows mixing tenants on one host, while host-level removes shared hardware at higher cost.", "Cache partitioning vs unmanaged sharing: partitioning gives predictable performance and reduces leakage, but fixes cache sizes and wastes capacity."],
    p: ["Core scheduling leaves sibling threads idle when no matching thread is runnable and throughput drops.", "A partition count lower than tenant count forces unrelated tenants to share a partition."],
    v: "Run a cache-timing probe in one guest while another tenant runs a known pattern on the sibling thread, and confirm that with core isolation on no signal exists, and that off it is measurable.",
    dep: ["fair-share-scheduler", "cpu-affinity"]
  },
  "device-model-sandbox": {
    s: "Confines the device-model process so that a bug in emulated hardware gives an attacker as little as possible on the host.",
    d: "The process runs as an unprivileged user in its own namespace, with a filter on the system calls it may make, a restricted file system view and limited access to the network. Handles for its disks and display are passed in already open, so it needs no path access. Resource limits cap memory and descriptors. The aim is that a guest which takes over the process still cannot read other machines' disks or reach the management network. It is hard because the process legitimately needs many capabilities, so filters are broad.",
    k: ["Tight syscall filter vs permissive: a tight filter limits escape routes, but breaks on new features and must be maintained with the device set.", "One user per machine vs shared user: per-machine users stop cross-machine reads of files, but need account management at scale."],
    p: ["The filter is loosened to make one feature work and stays loose for every machine.", "The process inherits an open handle to another machine's disk from the launcher."],
    v: "From a debugger attached to the device model, attempt to open another machine's disk file, execute a program and connect to the management network, and confirm each attempt is blocked and logged.",
    dep: ["device-model-process", "hypervisor-hardening"]
  },
  "confidential-guests": {
    s: "Hardware-encrypted guest memory and register state that the host and monitor cannot read or modify, protecting a tenant from the operator.",
    d: "The processor encrypts guest memory with a per-machine key kept inside the hardware, and keeps guest registers hidden on exit. The monitor still schedules and allocates, but cannot inspect contents; device access works only through memory the guest marks shared. A measured launch lets the guest prove what was loaded. It changes everything the host used to do: no inspection, no page sharing, constrained migration, restricted debugging. It is hard because many hypervisor features rely on reading guest memory.",
    k: ["Confidential guests vs ordinary guests: confidentiality removes the operator from the trust base, but costs features such as sharing, inspection and simple migration.", "Bounce buffers for I/O vs trusted devices: bounce buffers work with any device, but copy data and cost speed."],
    p: ["A guest that does not validate host-supplied values still trusts the host through shared memory and I/O.", "Migration or snapshot support is missing and operators discover it only when they need maintenance."],
    v: "Dump host memory belonging to a confidential guest and confirm only ciphertext is visible, then have the guest request an attestation report and confirm its measurement matches the expected value.",
    dep: ["attestation", "hw-virt-extensions", "iommu-remapping"]
  },
  "attestation": {
    s: "Lets a guest or a remote verifier check that a machine runs the expected firmware and software on genuine, correctly configured hardware.",
    d: "Hardware or the virtual TPM produces a signed statement of measurements: launch digest, firmware version, configuration flags, security level. A verifier compares it with known-good values and checks the signature chain back to a manufacturer or operator root. Only after success does it release secrets such as disk keys. Evidence includes a freshness value to prevent replay. It is hard because the set of acceptable measurements changes with every update, and verifiers must tolerate that without trusting stale values.",
    k: ["Verify before release of secrets vs verify only at boot: a gate on every secret release is strong, but needs an always-available verifier.", "Allow-list of exact measurements vs signed policy by version: exact lists are strict but break at updates; signed policy lets updates flow, but trusts the signer."],
    p: ["Replay of an old quote makes a compromised machine look genuine.", "A verifier outage prevents every machine from receiving its keys at boot."],
    v: "Present a quote from a machine with modified firmware to the verifier and confirm the secret is withheld, and a quote from an unmodified machine releases it; replay the old quote and confirm rejection.",
    dep: ["virtual-tpm", "host-boot-measured"]
  },
  "nested-virtualization": {
    s: "Lets a guest run its own hypervisor and virtual machines by emulating the hardware virtualization extensions for it.",
    d: "The outer monitor presents the extension instructions and control structures to the guest. When the inner hypervisor enters its guest, the outer monitor merges the inner and outer control state into a real structure and runs the inner guest directly. Exits from the inner guest are either handled by the outer monitor or reflected to the inner one. Memory uses a combined translation of two nested levels. It is hard because every inner exit can cost several outer exits, and the combination surface is large.",
    k: ["Support nested guests vs refuse: support enables cloud-in-cloud, testing and sandboxed containers, but widens the attack surface and costs performance.", "Shadow the inner second-level tables vs rely on hardware nesting: shadowing works on current hardware but is costly; hardware nesting is faster where present."],
    p: ["A single inner exit multiplies into dozens of outer exits, making I/O-heavy inner guests very slow.", "A bug in control-structure merging gives the inner guest the outer machine's privileges."],
    v: "Run a hypervisor inside a guest, start a small machine in it, run an I/O benchmark, and compare exits and throughput against a single level; check the inner guest cannot read outer memory.",
    dep: ["hw-virt-extensions", "vcpu-control-state", "nested-page-tables", "exit-handlers"]
  },
  "hypervisor-hardening": {
    s: "Reduces the chance and impact of bugs in the monitor itself: minimal code, memory-safety measures, privilege separation, fuzzing and fast patching.",
    d: "Practices include a small kernel-resident component with most logic outside it, stack and control-flow protections, address randomization, checks on every guest-supplied value, and continuous fuzzing of exit handlers and device models. Operators add live patching or fast migration off a host before a restart. Measures cost little individually. The monitor's attack surface is every guest-controlled input, and the consequence of a bug is crossing all tenant boundaries. It is hard because the code runs at the highest privilege and in performance-critical paths.",
    k: ["Small trusted base vs full-featured monitor: small has fewer bugs and is auditable, but pushes features to components that need their own isolation.", "Live patching vs migrate and reboot: live patching avoids moving guests, but is limited to certain changes; reboot is complete, but needs spare capacity."],
    p: ["A fuzzer coverage gap leaves one rarely used exit path untested, and it holds a guest-to-host escape.", "A security fix waits for a maintenance window and exposes the fleet in the meantime."],
    v: "Run a guest-driven fuzzer against every exit reason and device for a fixed period with sanitizers enabled, and confirm zero crashes and zero unhandled reasons; then apply a patch to a host and confirm guests stay up.",
    dep: ["exit-handlers", "instruction-emulator", "hypervisor-core"]
  },
  "hypervisor-core": {
    s: "The privileged component that owns the processors and memory, runs the virtualization instructions and arbitrates among all machines.",
    d: "In a bare-metal design it is its own small kernel: boot code, a memory allocator, a scheduler, interrupt handling, and the monitor's vCPU and memory logic, with other services in a control partition. In a hosted design the same logic is a module inside the host kernel and uses its scheduler and allocator. It exposes a narrow interface (create machine, add memory, run vCPU, inject interrupt) to user space. It is hard because nearly every other component trusts it and it must be correct under concurrency.",
    k: ["Own small kernel vs module in a general kernel: a dedicated kernel has a small trusted base and its own policies, but must write drivers and a scheduler; a module reuses them and inherits their size.", "Narrow stable interface vs rich one: narrow interfaces are easier to secure and version, but force logic into user space and more transitions."],
    p: ["A bug in the interface lets an unprivileged process create machines that read arbitrary host memory.", "The interface changes between releases and breaks user-space components that were built against it."],
    v: "Use only the interface to create a machine, add memory, run one vCPU on a halt-and-exit program, and confirm the sequence works and that invalid arguments (bad addresses, sizes, flags) are rejected without effect.",
    dep: ["hw-virt-extensions", "host-memory-allocator", "host-boot-measured"]
  },
  "hosted-integration": {
    s: "How a hypervisor that runs as a module or application inside a general-purpose operating system borrows its scheduling, memory, drivers and security model.",
    d: "The module registers with the host kernel and exposes a device node through which a user-space process creates and runs machines. Virtual processors are host threads, guest memory is host process memory, device backends are ordinary programs, and the host's file system, network stack and drivers provide I/O. Permissions on the device node decide who may run machines. It is easy to deploy and share a desktop with the guest. It is hard to guarantee isolation, since the whole host kernel is in the trust base.",
    k: ["Hosted vs bare-metal: hosted reuses the host's drivers, tools and ecosystem and is easy to adopt, but inherits the host's size, latency and attack surface.", "Run as a regular process vs a privileged service: a regular process limits damage, but may lack access to resources needed for passthrough."],
    p: ["Another host process or an update of the host kernel disturbs latency-sensitive guests.", "Permission on the device node is set too widely, and any local user can run machines with host resources."],
    v: "Run machines as an unprivileged user through the device node, confirm host tools see their threads and memory, and confirm that a user without permission is refused.",
    dep: ["hypervisor-core", "host-drivers", "host-memory-allocator"]
  },
  "control-partition": {
    s: "A privileged virtual machine that runs the management software and device drivers on a bare-metal hypervisor, so the monitor itself stays small.",
    d: "At boot the hypervisor starts a first machine with special rights: it may create other machines, map their memory, and own physical devices. It runs a general-purpose kernel with the host agent, storage and network drivers, and serves paravirtual backends for other machines. Driver faults crash it rather than the monitor. It can be split into several driver or service machines for isolation. It is hard because it is critical to every guest's I/O and is the most privileged target after the monitor.",
    k: ["Single control partition vs split service machines: one is simple and uses fewer resources, but compromise yields everything; splitting contains faults at the cost of more components.", "Drivers in the control partition vs in the monitor: control-partition drivers keep faults away from the monitor, but guest I/O passes through an extra machine."],
    p: ["The control partition is overloaded and every machine's I/O slows, though the guests themselves are idle.", "A driver crash in the control partition takes down every machine's storage and network until it restarts."],
    v: "Restart the control partition's network service machine and confirm guests keep running, lose connectivity for only the expected seconds, and reconnect without restart.",
    dep: ["hypervisor-core", "host-drivers", "host-agent"]
  },
  "host-boot-measured": {
    s: "The chain from power-on to a running monitor, with each stage verified and recorded, so the host's software can be trusted and later attested.",
    d: "Firmware verifies and measures the boot loader; the loader verifies and measures the monitor, its configuration and the control kernel. Measurements go into a hardware module and are used to unseal host secrets and prove state to remote verifiers. A dynamic launch can restart the chain at a trusted point. The monitor then initializes processors, enables virtualization and builds memory structures. It is hard because configuration changes alter measurements, and recovery from a failed verification must be possible without exposing secrets.",
    k: ["Secure boot (verify signatures) vs measured boot (record only): verification stops bad code from running, but measurement allows any code and reports it for remote decision.", "Static chain from power-on vs dynamic launch late in boot: dynamic launch excludes firmware from the trust base, but needs more hardware support."],
    p: ["A routine configuration change alters a measurement and the host cannot unseal its disk keys.", "Firmware updates are not reflected in expected measurements and every host fails attestation."],
    v: "Boot a host, read the measurement registers, boot again with an altered monitor configuration and confirm the registers differ and sealed secrets are not released.",
    dep: ["hardware-dependence"]
  },
  "host-drivers": {
    s: "The drivers for the host's own network, storage and other devices that carry all guest I/O that is not passed through.",
    d: "Storage controllers and network cards are driven by the control partition or the host kernel. Their queues, interrupt moderation, offloads and firmware limits set the ceiling for guest performance. For passthrough, the driver is a thin stub that only binds the device for assignment. Device errors, resets and hot removal must be survivable without crashing every guest. It is hard because the driver set is large, vendor-specific and a major source of host crashes.",
    k: ["Few well-tested drivers vs wide hardware support: a narrow list reduces crashes and testing, but restricts purchasing; wide support adds risk and work.", "Kernel drivers vs user-space polling drivers: user-space polling drivers can be faster and isolated, but dedicate processors and need IOMMU setup."],
    p: ["A driver bug on error recovery hangs the host when a storage path fails.", "Firmware on the device is outdated and causes rare data corruption across all guests on the host."],
    v: "Pull one path of a multipath storage device during guest I/O and confirm the driver fails over without guest errors, and confirm the error and recovery appear in the host log.",
    dep: ["hypervisor-core", "host-memory-allocator"]
  },
  "host-memory-allocator": {
    s: "The host's allocator for physical pages: for guest RAM, translation tables, device buffers and the monitor's own structures, with NUMA and large-page awareness.",
    d: "It hands out pages from per-node free lists, can allocate contiguous large blocks, and supports pinning for devices and the monitor's critical structures. Guest memory is usually the bulk. Metadata per guest page (status, sharing counts, dirty bits) can consume noticeable memory. Pressure triggers the reclaim policy. Failures of allocation inside the monitor's own critical paths must be handled without bringing down the host. It is hard because fragmentation and allocation in atomic contexts conflict with large allocations.",
    k: ["Reserve guest memory up front vs allocate on demand: reserving removes allocation failure at runtime, but wastes idle memory; on demand packs tighter and risks failure.", "Per-node allocation preferred vs interleaved: per-node gives locality for each machine, but one node can fill while another is free."],
    p: ["An allocation failure inside the monitor's fault path stops a guest for lack of a page table page.", "Metadata overhead for very large guests is forgotten and a host runs out of memory before guest memory is used."],
    v: "Start machines until memory is nearly full, confirm the allocator reports per-node usage matching guest sizes plus metadata, and verify the last start either succeeds or fails cleanly without affecting running guests.",
    dep: ["host-boot-measured"]
  },
  "host-power-thermal": {
    s: "Management of frequency, idle states, thermal limits and power capping on the host, balanced against the performance and latency guests need.",
    d: "The host controls processor frequency and sleep depth. Deep idle states save power but lengthen wake-up for a halted guest processor. Guests cannot see the host's frequency; steal time and clock scaling hide it. Power capping and thermal throttling reduce performance for all guests at once. Consolidation moves machines off lightly loaded hosts so they can sleep. It is hard because power policy and latency goals conflict, and the guest has no way to request a trade-off.",
    k: ["Performance governor vs power saving: constant high frequency gives predictable latency, but uses more energy; power saving varies frequency with load and adds wake delays.", "Consolidate to power down hosts vs spread for headroom: consolidation saves energy, but leaves less spare capacity for spikes and failover."],
    p: ["Deep idle states add enough wake latency to break a latency-sensitive guest's service level.", "Thermal throttling cuts one host's speed and its machines slow without anything in the guests explaining it."],
    v: "Run a request-latency test in a guest under different host idle-state limits and confirm latency changes as expected; confirm the host reports frequency and throttle events in the metrics.",
    dep: ["host-drivers", "hypervisor-core"]
  },
  "trust-boundary": {
    s: "The decision about which components must be trusted with all guests' secrets and which are only trusted with one guest's, and therefore how much code sits inside the boundary.",
    d: "A guest is untrusted code that controls every input to the monitor: instruction streams, device registers, ring contents, timing. Each component sits inside or outside the line that, if crossed, exposes other tenants. Moving device emulation to a sandboxed process, using hardware encryption, or refusing a feature are all boundary decisions. They shape the performance paths (fewer shortcuts), the management plane (who can read memory) and what to patch first. It must be set before components are written, since moving it later changes interfaces.",
    k: ["Small trusted core with services outside vs everything in the monitor: small cores are auditable and contained, but more crossings cost performance and complexity.", "Trust the operator vs exclude the operator: excluding the operator protects tenants from provider staff, but removes inspection, sharing and simple recovery."],
    p: ["A convenience feature adds a guest-controlled input to privileged code without anyone reviewing the boundary.", "Management paths such as consoles and dumps bypass the boundary that guest paths respect."],
    v: "List every guest-controlled input into code at each privilege level, and confirm for each one that validation exists and a failure results in stopping only that guest; attempt a guest-to-host escape against each emulated device.",
    dep: ["hypervisor-hardening", "device-model-sandbox", "confidential-guests"]
  },
  "overhead-budget": {
    s: "The agreed cost, in exits, cycles, memory and latency, that each virtualized path may add compared with running natively, and what is cut when it is exceeded.",
    d: "Virtualization costs appear as exits per second, cycles per exit, extra translation levels, copies in I/O paths, per-guest memory metadata and scheduler waiting. Budgets are set per path (timer, interrupt, network packet, disk request, fault) and measured with exit traces and synthetic benchmarks. They explain why shortcuts exist: in-kernel interrupt controllers, shared rings, passthrough. A budget forces trade-offs, such as dropping a feature, or accepting less isolation for speed. It is hard because costs interact and vary by hardware generation.",
    k: ["Optimize the common path hard vs keep paths uniform: tuned fast paths give big gains where it matters, but duplicate logic and add bugs.", "Budget in worst-case latency vs in throughput: latency budgets protect interactive and real-time guests, but throughput budgets are easier to hit and measure."],
    p: ["A feature adds one exit to the hot path and nobody notices until a benchmark shows a large regression.", "Budgets measured on one processor generation do not hold on the next."],
    v: "Run a standard set of microbenchmarks (empty exit, interrupt round trip, one-packet round trip, 4K disk read) natively and in a guest, and confirm each is within its documented budget.",
    dep: ["exit-tracing", "vm-entry-exit", "virtqueue-rings"]
  },
  "hosted-vs-bare": {
    s: "The choice between a hypervisor that is its own small kernel and one that runs inside a general-purpose operating system, with consequences for every other layer.",
    d: "A bare-metal design owns the processors and memory directly and runs management in a control partition; a hosted design is a module and uses the host's scheduler, memory manager, drivers and tools. Bare-metal gives a smaller trust base and tighter control of latency; hosted gives rapid hardware support, easy debugging and desktop convenience. A hybrid puts the monitor in a general kernel but treats the rest of that kernel as part of the management plane, and the choice sets the cost of updating and the shape of the interface between the layers.",
    k: ["Own kernel vs borrow a kernel: owning gives control and a smaller attack surface, but requires drivers and tools; borrowing gives hardware support quickly and a large trusted base.", "Management inside the host vs in a separate machine: inside is simple and fast, while a separate machine contains faults and exposes less."],
    p: ["A hosted design is deployed where predictable latency matters, and the host kernel's activity causes jitter.", "A bare-metal design lacks drivers for new hardware and delays purchases."],
    v: "Run the same latency-sensitive guest while the host performs a heavy file copy, on both designs, and compare the worst-case timer latency observed inside the guest.",
    dep: ["hypervisor-core", "hosted-integration", "control-partition"]
  },
  "hardware-dependence": {
    s: "How tightly the design binds to specific processor, IOMMU and device features, and what happens on hosts that lack them or differ in generation.",
    d: "Hardware assists change what is fast and what is possible: nested translation, posted interrupts, dirty logging, encryption, tagged translations, virtual functions. Code paths branch on capability bits, and clusters mix generations. Features not common to all hosts either go unused, as in feature masking, or restrict where a machine can run. Each new generation changes exit costs and sometimes semantics. It is hard because tests must cover the matrix of hardware, and a design built on a specific assist may have no fallback.",
    k: ["Require a feature vs support a fallback: requiring keeps the code simple and fast, but excludes older hosts; fallbacks widen support and double the paths to test.", "Expose new features to guests quickly vs wait for fleet-wide support: quick exposure helps new workloads, but ties them to newer hosts."],
    p: ["Code assumes a feature that a processor model lacks, and the monitor fails only on that hardware.", "A new generation changes the cost of an exit and silently breaks a tuned overhead budget."],
    v: "Run the full test suite on one host of each supported processor generation and IOMMU type, and confirm identical guest-visible behavior except for documented feature differences.",
    dep: ["hw-virt-extensions", "cpu-feature-masking", "iommu-remapping"]
  },
  "guest-compatibility": {
    s: "The range of guest operating systems the hypervisor must run unmodified, from very old to current, and the quirks it keeps to support them.",
    d: "Guests depend on exact hardware behavior: device registers, firmware tables, timer details, interrupt routing and undocumented reset states. Supporting a new guest sometimes means adding a quirk; removing a quirk risks breaking an old one. Machine types freeze the virtual hardware definition per release so guests see the same machine after upgrade. Paravirtual interfaces reduce dependence on emulation fidelity, but need guest drivers. It is hard because old guests cannot be fixed and cannot be tested without keeping their images.",
    k: ["Versioned machine types vs always the newest hardware: versioned types protect existing guests across upgrades, but accumulate old behaviors to maintain.", "Emulate old hardware for unmodified guests vs require paravirtual drivers: emulation runs anything, but is slow and a security risk; paravirtual is fast and requires guest support."],
    p: ["An upgrade changes a default in the virtual hardware and a guest licensed to its hardware identity demands reactivation.", "A quirk added for one guest breaks the behavior another guest relied on."],
    v: "Boot a library of representative guest images (old and new) on the current release with their pinned machine types, and confirm each boots, networks and shuts down, and sees the same device list as on the previous release.",
    dep: ["emulated-legacy-devices", "paravirtual-spec", "acpi-tables"]
  },
  "state-ownership": {
    s: "Which component owns each piece of state (machine definition, running state, disk locks, device registers) and what survives when a process, host or management service fails.",
    d: "State lives in several places: the definition store, the host agent's cache, the device-model process, the monitor's structures, the datastore's locks and the guest itself. Ownership rules say who may change what and who is authoritative after a crash. Failure domains are drawn so that a management outage leaves running guests alone, a device-model crash stops only one machine, and a host failure triggers restart elsewhere. It must be decided early, since recovery, migration and consistency all depend on it.",
    k: ["Single owner per piece of state vs replicated state: single owners avoid conflicts, but need recovery rules when the owner dies; replication tolerates failures and requires agreement protocols.", "Guests independent of management vs guests dependent on it: independence keeps workloads up during outages, but means management must rediscover and reconcile on return."],
    p: ["Two components each believe they own a machine's state and both act after a partition.", "A crash in the middle of a multi-step update leaves state in two places that disagree."],
    v: "Kill, one at a time, the management service, the host agent, a device-model process and a host, and for each confirm only the documented set of machines is affected and state is reconciled consistently after recovery.",
    dep: ["vm-state-machine", "vm-definition-store", "datastore-locking", "ha-manager"]
  },
});
