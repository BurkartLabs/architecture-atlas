// Details part 5: poll-mode drivers, NIC queues & offloads, kernel coexistence & capture.
ATLAS.details("user-space-network-stack", {
  "poll-mode-driver": {
    s: "A device driver running in the application that reads and writes the card's queues by checking descriptors in memory in a loop, with no interrupt handler and no system call per packet.",
    d: "The driver maps the card's registers and queue memory into user space. Receive checks whether the next descriptor has been marked complete by the card, takes completed buffers, and replenishes the ring with fresh ones. Transmit fills descriptors and writes a doorbell. All of it runs in the caller's context and returns immediately if there is nothing to do. It is hard because the driver owns the hardware without the kernel's protections: a wrong descriptor or register write can hang the card or corrupt memory, and every card needs its own driver or a vendor-specific path.",
    k: ["User-space driver vs. kernel driver with a fast interface: user-space removes every kernel crossing and context switch, and takes on the full burden of hardware support and fault handling.", "Replenishing receive buffers per burst vs. per packet: per burst is cheap and delays the card's view of free buffers slightly; per packet is timely and costs a write each."],
    p: ["A card whose queue stops advancing after an error looks the same as an idle link until counters are compared.", "Driver bugs corrupt memory through DMA with no kernel to catch them."],
    v: "Receive and transmit at line rate on each supported card with minimum-size packets: confirm zero loss, descriptor ring counts consistent with packet counters, and a recovery after unplugging and replugging the cable.",
    dep: ["userspace-device-access", "descriptor-rings", "queue-pairs", "packet-buffer-pools"]
  },
  "device-abstraction": {
    s: "A uniform interface to network devices (configure, start, receive burst, transmit burst, read statistics, report capabilities) implemented by each driver, so the stack is written once.",
    d: "Applications and the stack call generic operations on a port and queue. The abstraction exposes what each device can do (offloads, queue limits, supported rule types) so the stack can adapt, and falls back to software when a capability is missing. Drivers register through the same table, whether hardware or virtual. The difficulty is the lowest common denominator: card differences leak through (descriptor limits, hash support, offload combinations), and an interface rich enough to expose them tends to expose every difference to the caller.",
    k: ["A narrow common interface vs. exposing device-specific features: narrow keeps the stack portable and leaves card features unused; wide extracts performance and fills the stack with conditionals.", "Capability discovery at startup vs. feature flags at compile time: discovery adapts to the actual card, while compile-time removes branches from the fast path."],
    p: ["Code assumes an offload that one card lacks, and the stack works in test and fails on that hardware.", "A feature reported as supported works only in a combination the abstraction does not mention."],
    v: "Run the same stack binary against each supported card and a virtual device, and confirm the capability report matches measured behavior and every missing feature takes the software fallback with correct results.",
    dep: ["poll-mode-driver", "bus-probe"]
  },
  "userspace-device-access": {
    s: "The mechanism that lets an unprivileged process own a card: map its registers, receive its interrupts as events and set up DMA safely, through a kernel framework.",
    d: "A small kernel stub binds to the device in place of its normal driver and exposes it as a file: the application maps register regions, queries interrupt lines and registers memory for DMA. When the IOMMU is in use, the framework confines the card to the memory the process registered. The process takes the device by opening the file, and the kernel releases it if the process exits. The difficulty is the trust model: without an IOMMU, a process with device access can read or overwrite any memory, so access is effectively root-equivalent.",
    k: ["IOMMU-protected access vs. direct physical access: protected access isolates the device to the process's memory and costs translation lookups; direct is faster and removes protection.", "Per-device files for unprivileged users vs. root-only: delegating access allows least-privilege service accounts, and widens who can influence the hardware."],
    p: ["Releasing the device when the process crashes while descriptors are active lets the card keep writing to freed memory.", "The kernel's own driver rebinds after a reset or hot-plug, taking the card away from the stack."],
    v: "Start the stack as an unprivileged user with delegated access, kill it with a signal mid-traffic, and confirm the card is quiesced, no memory is corrupted, and a restarted instance regains the device.",
    dep: ["iommu-isolation", "device-ownership", "dma-mapping"]
  },
  "bus-probe": {
    s: "Discovers devices on the system's buses at startup, matches each to a driver, reads its capabilities and brings it to a known state.",
    d: "The stack scans the bus for devices by identifier, filters by an allow list the operator supplies, and matches each to a driver. Probing reads configuration space, maps regions, resets the device and reads the capability set that the abstraction layer reports. Virtual devices register through a different path with arguments. The challenge is determinism and safety: device naming can change between boots, probing the wrong device (such as the card carrying management traffic) can cut off the machine, and probing order affects which queues land on which node.",
    k: ["Explicit allow list vs. scanning everything: an allow list protects the management interface and requires configuration; scanning is convenient and risks claiming the wrong device.", "Stable names by bus address vs. by enumeration order: addresses are stable across reboots and awkward to read; order is simple and changes when hardware does."],
    p: ["The stack claims the interface carrying the administrator's connection and the machine becomes unreachable.", "A device identifier that moves after a firmware update is no longer matched by the saved configuration."],
    v: "Start with an allow list containing one device and confirm only that device is claimed, the management interface remains under kernel control, and the probe log shows capabilities for each claimed card.",
    dep: ["userspace-device-access", "runtime-configuration"]
  },
  "vectorized-paths": {
    s: "Receive and transmit routines written with wide vector instructions that handle several descriptors per instruction, raising packets per second at the price of restricting which features can be used.",
    d: "The vector path loads and decodes many descriptors at once, assembles buffer metadata in registers and writes it back in bulk. It is selected at startup based on processor features and enabled offloads. Gains are largest for small packets where per-packet instruction counts dominate. The difficulty is restrictions: vector paths often support only some offload combinations and no chained buffers, so enabling one feature silently selects the slower scalar path, and a bug in bulk code corrupts many packets together.",
    k: ["Vector paths vs. scalar flexibility: vector paths give higher packet rates, and require limiting features and offloads to the supported set.", "Selecting the path by detected capabilities vs. by operator choice: detection works out of the box but can change behavior with a configuration tweak; explicit choice is predictable."],
    p: ["Enabling one offload quietly selects the scalar path and halves small-packet throughput with no warning.", "Using wide instructions can lower processor frequency on some hardware and slow neighboring cores."],
    v: "Report which receive and transmit path each queue chose, and measure small-packet rate with each path: confirm the vector path is selected under the intended configuration and its rate exceeds scalar by the expected margin.",
    dep: ["poll-mode-driver", "burst-batching", "power-and-frequency"]
  },
  "virtual-device-drivers": {
    s: "Drivers for software and virtualized network devices (guest paravirtual cards, shared-memory channels, loopback rings) that present the same interface as a physical card.",
    d: "A virtual device's queues are shared memory between the stack and a hypervisor, host switch or another process. Receive and transmit follow the same burst interface, with notification by memory flag or a kick. They let the same stack run in virtual machines and containers, connect stacks to each other on one host, and test without hardware. The difficulty is that offload and ordering semantics differ: copies may happen on the host side, notification costs are high, and behavior under host overload is outside the stack's control.",
    k: ["Paravirtual device vs. passing through a physical function: paravirtual allows migration and sharing and costs host cycles and latency; passthrough is fast and ties the guest to hardware.", "Polling the shared queue vs. relying on notifications: polling lowers latency and burns a core; notifications save the core and add a kick cost per batch."],
    p: ["A host that is descheduled leaves the guest's queue unserviced and latency spikes with no cause in the guest.", "Features negotiated at startup differ after live migration, and the device behaves differently."],
    v: "Run the same test between two stacks over a shared-memory device and over a physical loopback, and confirm identical correctness and report the throughput and latency of each, with no packet duplication or loss.",
    dep: ["device-abstraction", "lockless-rings", "poll-mode-driver"]
  },
  "link-management": {
    s: "Tracks and controls link state: up or down, negotiated speed and duplex, flow control, and recovering the device after faults or cable events.",
    d: "The driver reads link status periodically or through an event, applies speed and mode settings, and reports changes to the stack, which updates routes, neighbor entries and application state. After a fault (fatal error, reset request) the driver quiesces queues, resets the device and reconfigures all queues and filters, which the stack must replay. The difficulty is that a reset loses state in the card: queues, flow rules and offload settings all need reinstalling, and packets in flight at that moment are lost.",
    k: ["Polling link state vs. using events: polling is simple and detects change slowly; events react immediately and need an interrupt path in an otherwise polling design.", "Automatic reset on fault vs. reporting and waiting: automatic reset restores service and can mask a failing card; waiting is safe and extends outages."],
    p: ["A reset reinitializes queues but leaves hardware flow rules uninstalled, so traffic silently lands on the default queue.", "Link flaps are not debounced, causing a storm of route and neighbor invalidations."],
    v: "Unplug and replug the cable and trigger a device reset under load, and confirm link events are reported within a second, all queues and rules are restored, and traffic resumes at line rate without restart.",
    dep: ["poll-mode-driver", "hardware-flow-rules", "health-and-watchdog"]
  },
  "queue-pairs": {
    s: "Independent receive and transmit queues on one card, each with its own descriptor ring, so many cores can use the same port in parallel without locking.",
    d: "A card exposes tens to thousands of queues. Each core is assigned its own receive and transmit queue on every port, and the card distributes incoming packets among receive queues by hash or rule. Because a queue has exactly one user, no synchronization is needed. Queue count is limited by the card, by interrupt and memory resources, and by cores. It is hard to size: too few queues leave cores idle, too many spread traffic thinly and fill the card's on-chip resources.",
    k: ["One queue pair per core vs. fewer queues with software distribution: per-core pairs scale with no locking, while fewer queues need handoff rings but save card resources.", "Large rings vs. small: large rings absorb bursts and use more cache and memory; small rings stay hot in cache and drop sooner."],
    p: ["More polling cores than queues leaves some cores with nothing to do and others overloaded.", "Using a different number of queues than the card's hash table was built for gives uneven distribution."],
    v: "Configure one queue pair per core, send traffic with many flows, and confirm every queue receives a similar share, no lock contention appears in profiles, and throughput scales with queue count until the link saturates.",
    dep: ["descriptor-rings", "receive-side-scaling", "core-pinning"]
  },
  "descriptor-rings": {
    s: "Circular arrays in memory shared with the card, where each entry describes one buffer to receive into or transmit from, with ownership passed by status bits and index registers.",
    d: "Software fills receive descriptors with buffer addresses and advances a tail register; the card writes packets and marks descriptors done. For transmit, software writes address, length and flags, and advances the tail; the card sends and writes back completion. Descriptors have a fixed format per card, often 16 bytes, with extended forms for offload metadata. The difficulty is subtle protocol rules: stale status bits, wraparound, write-back batching and ordering between descriptor writes and the tail update must be exact or the card reads half-written entries.",
    k: ["Large rings vs. small: large rings tolerate pauses of the polling loop, and use more memory and cache; small rings drop sooner and stay in cache.", "Completion write-back per descriptor vs. batched: per descriptor lets buffers be reused immediately and writes more; batched cuts bus traffic and delays freeing."],
    p: ["Updating the tail register before the descriptor writes are visible lets the card send stale memory.", "A ring sized less than the polling interval's worth of packets drops under bursts even though average load is low."],
    v: "Inspect ring state under load: confirm ownership alternates correctly, no descriptor is written twice before consumption, and the card's missed-packet counter stays zero at the target rate with the chosen ring size.",
    dep: ["dma-mapping", "queue-pairs", "packet-buffer-pools"]
  },
  "receive-side-scaling": {
    s: "The card hashes each incoming packet's tuple and uses an indirection table to choose a receive queue, spreading flows across cores while keeping each flow on one queue.",
    d: "The hash key and the fields it covers are configured per protocol, and the result indexes a table of queue numbers (commonly 128 or 512 entries). Changing table entries moves hash buckets between queues, which rebalances load. The hash value is passed to software in the descriptor. The difficulty is the quality of the spread: a poor or default key clusters flows, tunneled and fragmented packets hash on too few fields, and a symmetric requirement (both directions on one core) needs a special key.",
    k: ["Hash by four-tuple vs. by addresses only: four-tuple spreads flows within one host pair, while address-only keeps fragments and all flows between two hosts together.", "A large indirection table vs. a small one: large tables allow finer-grained rebalancing and use more card memory."],
    p: ["Using the default key across a fleet lets observers predict and target queue placement.", "Hash fields differing between TCP and UDP split a request and its response across cores."],
    v: "Send a million random flows and confirm queue loads are within a few percent of each other, both directions of a symmetric flow reach one queue, and rewriting the table moves the expected buckets only.",
    dep: ["queue-pairs", "tuple-hashing"]
  },
  "checksum-offload": {
    s: "The card verifies the checksums of received packets and computes them for transmitted packets, so the CPU never sums the payload bytes.",
    d: "On receive, the card checks IP and transport checksums and sets flags in the descriptor: good, bad, or not checked. On transmit, software sets flags and header offsets, and the card inserts the final values (the stack writes the pseudo-header partial sum). Inner and outer checksums for tunnels need separate flags. Support depends on protocol and encapsulation. The difficulty is correct metadata handling: every code path that modifies a packet must keep flags consistent, and packets forwarded between ports need flags recomputed.",
    k: ["Trusting hardware-verified receive checksums vs. always verifying in software: trusting saves a pass over the data, and leaves corruption between the card and memory undetected.", "Per-packet offload flags vs. a fixed per-port setting: per-packet allows selective use at metadata cost; per-port is simple and all-or-nothing."],
    p: ["Packets modified by the stack but sent with stale offload flags are transmitted with wrong checksums.", "A tunnel layer the card cannot parse is marked unchecked, and the code treats it as good."],
    v: "Send traffic with corrupted checksums at each layer and verify detection with offload on, then compare wire captures of transmitted packets with offload on and off: confirm identical checksum values.",
    dep: ["descriptor-rings", "buffer-layout", "device-abstraction"]
  },
  "segmentation-offload": {
    s: "Lets the stack hand the card one very large buffer that the card cuts into network-sized packets, with headers copied and checksums and sequence numbers filled in per packet.",
    d: "Software builds a template header, sets the segment size and passes a payload of tens of kilobytes. The card replicates headers, advances sequence numbers and recomputes lengths and checksums for each packet it emits. One descriptor chain thus stands for many packets, cutting CPU work and ring use by a large factor. The difficulty is coupling with the rest of the stack: pacing, retransmission and tunnels interact with large units, and cards differ in the headers and options they handle correctly.",
    k: ["Large segmentation units vs. standard packets: large units cut per-packet cost and make bursts of back-to-back line-rate packets; standard-size sends are smoother and CPU-heavier.", "Offloaded segmentation vs. software segmentation: hardware is free of CPU cost and is limited by card capabilities; software handles any case and costs cycles per packet."],
    p: ["A sudden burst of dozens of packets emitted back to back overflows a switch buffer and causes loss.", "Options the card cannot replicate correctly (such as a changing timestamp) are corrupted in later segments."],
    v: "Send a large buffer with offload and capture on the wire: confirm each packet has valid headers and checksums, sequence numbers advance by segment size, and CPU use per gigabit falls versus software segmentation.",
    dep: ["descriptor-rings", "scatter-gather-dma", "checksum-offload", "packet-pacing"]
  },
  "receive-coalescing": {
    s: "The card merges consecutive in-order segments of one flow into a single larger buffer before passing it up, so software processes fewer, bigger packets.",
    d: "The card or the stack's own software logic recognizes back-to-back segments of the same connection with contiguous sequence numbers and combines their payloads, rewriting the header with the total length. The stack then runs protocol processing once for many segments. Gains are large for bulk transfers. The difficulty is that merging changes what monitors and forwarders see: merged packets exceed path limits and cannot be forwarded without resegmentation, and merging delays delivery of the first segment while waiting for the next.",
    k: ["Coalescing in hardware vs. in software: hardware saves the most cycles and varies by card; software works everywhere and costs a flow-table lookup per segment.", "Aggressive merge window vs. short: a long window merges more and adds latency; a short one lowers latency and merges less."],
    p: ["A merged packet forwarded onward exceeds the next link's size and is dropped.", "Merging delays acknowledgments that a latency-sensitive peer expects promptly."],
    v: "Receive a bulk transfer and confirm buffers carry many segments, processing rate per second falls compared with coalescing off, byte-exact payload is delivered, and single-packet latency on an idle flow is unchanged.",
    dep: ["descriptor-rings", "segmentation-reassembly", "chained-buffers"]
  },
  "scatter-gather-dma": {
    s: "Lets the card gather one packet from several memory fragments on transmit and scatter one packet into several buffers on receive, driven by descriptor chains.",
    d: "A packet is described by consecutive descriptors, each pointing to a fragment, with an end-of-packet flag on the last. On transmit, the stack can send a small header buffer plus payload from elsewhere without copying. On receive, large frames are spread across fixed-size buffers. Cards limit the number of descriptors per packet, and the device abstraction tells the stack the limit. The challenge is the edge cases: a chain exceeding the card's limit must be linearized, and a hang from a malformed chain can take the whole queue.",
    k: ["Gathering fragments in hardware vs. copying into one buffer: gathering avoids copies and uses more descriptors per packet; copying uses one descriptor and spends memory bandwidth.", "Small receive buffers with scatter vs. large contiguous buffers: small buffers waste less memory and make every large frame a chain; large buffers keep frames contiguous."],
    p: ["A chain longer than the card's descriptor limit is rejected or hangs the queue.", "Receive buffers sized below the frame size produce chains the parser does not expect."],
    v: "Transmit packets built from one to the maximum number of fragments with random lengths, and confirm every packet arrives byte-exact, that over-limit chains are linearized, and that no queue hang occurs in a soak.",
    dep: ["descriptor-rings", "chained-buffers", "dma-mapping"]
  },
  "virtual-functions": {
    s: "Splits one physical card into several lightweight virtual devices, each with its own queues, assignable to different applications, containers or virtual machines.",
    d: "The physical function configures the card and creates virtual functions that appear as separate devices on the bus. Each has isolated queues and a share of rules; an embedded switch in the card forwards traffic between them and to the wire by address or tag. This lets a user-space stack and the kernel share one port, or several stacks share one card. The challenge is the limits: the number of functions, queues and rules is finite, the embedded switch has its own table, and bandwidth between functions is shared.",
    k: ["Virtual functions per application vs. one stack sharing a port: virtual functions give isolation and hardware-enforced separation and consume queues and switch entries; sharing uses fewer resources and depends on software discipline.", "Hardware switching between functions vs. through software: hardware switching is line rate and limited by table size; software is flexible and costs cores."],
    p: ["Exhausting the card's switch table sends local traffic out to the wire and back.", "A misconfigured address or tag filter on one function lets it see another's traffic."],
    v: "Create several functions, assign each to a separate stack instance and send traffic between them and the wire: confirm isolation (no cross-delivery), rates within the configured shares, and recovery of one function after reset without affecting the others.",
    dep: ["queue-pairs", "hardware-flow-rules", "iommu-isolation"]
  },
  "inline-crypto-offload": {
    s: "Encrypts, decrypts or authenticates packets in the card as they pass, so tunnels and secured sessions run at line rate without per-byte CPU work.",
    d: "The stack installs a security association (keys, algorithm, sequence state) into the card, linked to a flow. Outgoing packets matching it are encrypted on the way out; incoming ones are decrypted and verified, with a status flag in the descriptor. Crypto accelerators on the side of the data path offer a similar service through a separate queue. It is hard because keys now live in hardware: rekeying, replay windows and failure of the offload need handling, and the offload may support only some modes and header positions.",
    k: ["Inline offload vs. software crypto with vector instructions: inline frees cores entirely and limits algorithms and flow counts; software is flexible and uses cores on every byte.", "Lookaside accelerator vs. inline: lookaside works with any packet path and adds a round trip through its queue; inline adds no hop and constrains placement."],
    p: ["Replay-window state kept in the card diverges from the stack's after a reset, accepting or rejecting valid packets.", "A flow evicted from the card's association table silently falls back to unencrypted handling or drops."],
    v: "Pass encrypted traffic at line rate with offload on, and confirm a software peer decrypts every packet correctly, tampered packets are rejected with the right counter, and a rekey during traffic loses no packets.",
    dep: ["hardware-flow-rules", "descriptor-rings", "device-abstraction"]
  },
  "exception-path": {
    s: "Sends packets the stack does not handle itself (unknown protocols, management traffic, unconfigured addresses) to the kernel, so the machine still behaves like a normal host.",
    d: "Classification marks a packet as exception traffic and copies or moves it into a queue or virtual interface the kernel reads. Replies the kernel generates come back the same way and are transmitted by the stack. It covers things such as routing protocol messages, remote administration, and anything the stack has not implemented. The challenge is cost and safety: exception traffic can be orders of magnitude slower, so a flood of it can saturate the slow path, and the stack must apply rate limits so the fast path stays unharmed.",
    k: ["Forwarding unknown traffic to the kernel vs. dropping it: forwarding keeps the host fully functional and exposes the kernel's slow path to attack; dropping is safe and breaks whatever the stack does not implement.", "Copy to the kernel vs. move: copy leaves the stack able to also process the packet and costs bandwidth; move is cheaper and gives the stack no further role."],
    p: ["A flood of unhandled packets saturates the kernel path and starves management traffic of the same queue.", "Replies produced by the kernel for the stack's own address take a different route and arrive with the wrong source."],
    v: "Send packets of an unhandled protocol and confirm the kernel answers them through the exception path, then flood that path and confirm its rate limit holds and fast-path throughput is unchanged.",
    dep: ["virtual-kernel-interface", "software-classifier", "rate-limiting"]
  },
  "virtual-kernel-interface": {
    s: "A kernel-visible network interface backed by the stack, so ordinary tools and the kernel's own stack can send and receive through the card the stack owns.",
    d: "The stack creates a virtual interface in the kernel and copies packets between it and the card's queues. The kernel sees an ordinary device with addresses, routes and statistics, so remote login, routing daemons and monitoring work as usual. A user-space thread usually does the copying or a shared memory ring is used. The difficulty is synchronization of state: addresses and routes configured in the kernel must be mirrored into the stack, or the two views diverge, and copying through the interface runs far below line rate.",
    k: ["Virtual interface with copying vs. none: the interface keeps tools and routing daemons working and runs at kernel-bound speed; none is simple and loses compatibility.", "Mirroring kernel configuration into the stack vs. configuring the stack separately: mirroring keeps one source of truth and needs a change feed; separate configuration is simple and drifts."],
    p: ["An address added in the kernel is not known to the stack, so it never answers neighbor requests for it.", "The interface's maximum size differs from the card's, and large packets are silently truncated or dropped."],
    v: "Log in remotely through the virtual interface while the stack carries heavy traffic on the same card, change a route in the kernel, and confirm the stack's table follows within a second and the session never drops.",
    dep: ["exception-path", "control-channel", "route-lookup"]
  },
  "flow-bifurcation": {
    s: "Uses card-side rules to send selected flows to the user-space stack and everything else to the kernel's own driver, on the same physical port.",
    d: "The card is shared between the kernel driver and the stack's queues, or between virtual functions. Rules match addresses, ports or tags and steer matching packets to the stack's queues; the rest reach the kernel as normal. The kernel keeps its address and daemons, with no copying or exception path. The difficulty is rule limits and consistency: a flow whose rule is missing falls to the kernel, a conflict between kernel and stack rules is resolved by the card in a way that is not always visible, and not all cards support the sharing.",
    k: ["Bifurcation in the card vs. software exception path: card steering costs nothing per packet and is bounded by rules and card support; software handles anything and burns cycles on every packet.", "Steering by port vs. by address: port rules are simple and take whole services; address rules isolate by tenant and consume more entries."],
    p: ["When rules are lost after a reset, flows silently go to the kernel and appear to work at a tenth of the speed.", "An overlapping kernel rule captures traffic meant for the stack."],
    v: "Run kernel-handled and stack-handled flows on one port at the same time: confirm each flow reaches its owner, kernel services stay available, and after a reset the rules return and the split is restored.",
    dep: ["hardware-flow-rules", "virtual-functions", "device-ownership"]
  },
  "packet-capture": {
    s: "Records packets seen by the stack for analysis, since normal kernel capture tools cannot see traffic that never enters the kernel.",
    d: "A capture facility copies packets (or headers) at chosen points into rings read by a capture process, with filters applied early to limit volume. Receive and transmit sides are tagged, timestamps may come from hardware, and drops at capture are counted separately. The capture process runs on its own core. It is hard because it must not disturb the data path: copying every packet at line rate doubles memory traffic, and capture of encrypted or offloaded traffic shows what is on the wire only if taken at the right point.",
    k: ["Capturing in the stack vs. mirroring at a switch: in the stack sees post-offload and internal state, and costs cores; a switch mirror is zero-load and loses internal context.", "Header-only capture vs. full packets: headers cut volume and cost by an order of magnitude and lose payload for diagnosis."],
    p: ["Capturing at full rate causes the capture ring to overflow, and the file silently misses packets.", "Packets captured before segmentation offload show a large unsent buffer rather than the wire's packets."],
    v: "Capture one flow while running at line rate and compare with a switch-side mirror: confirm packet counts and bytes match for that flow, drop counters show zero, and data-path throughput changes by less than the documented margin.",
    dep: ["packet-trace-points", "lockless-rings", "software-classifier", "hardware-timestamps"]
  },
  "capture-export": {
    s: "Writes captured packets in a standard file format, or streams them to analysis tools, with timestamps and interface information so existing tools can read them.",
    d: "A writer thread drains the capture ring, encodes packets in a common capture file format with per-packet timestamps and link type, and writes to disk, a pipe or a network stream. Files rotate by size or time, and compression or snapshot lengths limit space. Interface and drop statistics go in file metadata. The difficulty is throughput: line-rate capture produces gigabytes per second, beyond most disks, so it needs sampling, filtering or fast storage, and ordering across several capture cores must be merged by timestamp.",
    k: ["Writing all packets vs. sampling or truncating: all packets give complete evidence at storage and bandwidth cost; sampling is cheap and cannot prove absence.", "Merging multi-core captures by timestamp vs. per-core files: merging gives one coherent timeline and needs synchronized stamps; per-core files avoid merging work and push it to the analyst."],
    p: ["Timestamps differ between cores, so a merged file shows replies before the requests.", "Disk speed below the capture rate backs up the ring and silently drops packets during the interesting burst."],
    v: "Capture a known synthetic stream and open the file in a standard analyzer: confirm packet count, timestamps and ordering match the generator's log, and the file's recorded drop count equals the ring's.",
    dep: ["packet-capture", "hardware-timestamps", "control-threads"]
  },
  "device-ownership": {
    s: "Rules for which software owns each network card at a given time, and how a card moves between the kernel driver and the user-space stack without loss of the machine's connectivity.",
    d: "At startup the stack unbinds a chosen device from the kernel driver and binds it to the user-space access stub; at shutdown it can hand it back. During operation the kernel must not touch it. Operators typically reserve a separate management interface for the kernel. Ownership changes reset the card and drop its address and routes. The difficulty is operational: a mistaken binding cuts the machine off, automated rebinding on hot-plug can fight the stack, and a crashed process leaves the card in an unknown state.",
    k: ["Dedicated card for the stack vs. sharing a card with the kernel: a dedicated card is simple and strongly separated and costs a port; sharing saves ports and depends on rules and virtual functions.", "Automatic rebind at start and stop vs. manual setup: automatic is convenient and risky if the wrong card is selected; manual is explicit and error-prone to repeat."],
    p: ["Binding the interface carrying the administrator's connection locks the operator out of the machine.", "After a crash, the card stays bound to the stub with queues active and drops all traffic until reset."],
    v: "Bind a spare card, run traffic, kill the process, and confirm the card returns to a clean idle state, the kernel interface that carries management remains reachable throughout, and a restart reacquires the card.",
    dep: ["userspace-device-access", "bus-probe"]
  },
  "iommu-isolation": {
    s: "Uses the system's I/O memory management unit to restrict each device to the memory regions it was given, so a faulty card or driver cannot read or overwrite other memory.",
    d: "Each device or virtual function gets its own translation table, mapping the I/O addresses it uses to host memory pages. Pool memory registered by the stack is mapped read-write for the device, and nothing else is reachable. Faults (accesses outside the mapping) are reported and blocked. It adds a translation per DMA access, mostly cached. The difficulty is its cost and its absence: translation misses at high packet rates reduce throughput, and without it, direct access offers no protection.",
    k: ["IOMMU enabled with large pages vs. disabled: enabled gives containment and costs translation lookups, reduced with huge pages; disabled is fastest and leaves the card able to touch any memory.", "Mapping once at startup vs. per packet: one-time mapping is fast and means memory stays pinned; per-packet mapping isolates more tightly and is far too slow."],
    p: ["Small-page mappings for pool memory overflow the translation cache and throughput drops by a visible fraction.", "A device assigned to the wrong protection domain can see another tenant's memory."],
    v: "Attempt a DMA from the card to an unmapped address with a test tool and confirm it is blocked and logged, then run line-rate traffic and confirm zero faults with the translation-miss rate low.",
    dep: ["dma-mapping", "huge-page-backing"]
  },
});
