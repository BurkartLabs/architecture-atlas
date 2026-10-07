// Details for the hypervisor plate, part 2: device model, virtual networking, storage, I/O virtualization paths.
ATLAS.details("hypervisor", {
  "device-model-process": {
    s: "The per-machine user-space process that implements the guest's emulated devices and connects them to host storage, network and display.",
    d: "It receives the machine definition as arguments or a control message, allocates guest memory, creates the monitor's machine object, builds the device tree and runs the vCPU threads or hands them to the monitor. Every device access the monitor cannot handle in the kernel is forwarded to it. Running devices in a separate unprivileged process keeps the large, bug-prone emulation code out of the most privileged component. The cost is a context switch for each forwarded access, and a process that must be supervised.",
    k: ["Devices in user space vs in the monitor: user space limits the damage of a device bug, but every emulated access pays a transition.", "One process per machine vs shared: per-machine isolates faults and memory, but multiplies fixed memory cost across thousands of small machines."],
    p: ["A bug in a rarely used emulated device gives a guest code execution in the host process.", "The process leaks memory over months of uptime and is killed by the host, taking the guest with it."],
    v: "Kill only the device-model process for one machine and confirm that machine is reported failed, its memory and disk locks are released, and all other machines on the host are unaffected.",
    dep: ["mmio-pio-dispatch", "virtual-bus-topology", "device-model-event-loop", "hypervisor-core"]
  },
  "virtual-bus-topology": {
    s: "The arrangement of buses, bridges and slots that gives each virtual device an address the guest enumerates just as it would on real hardware.",
    d: "The device model builds a tree: a root complex, bridges, slots, and devices at bus-device-function addresses, with address ranges allocated for each device's registers. The tree is described to the guest through firmware tables and discovered by enumeration. Layout determines device naming inside the guest, which hot-plug capability exists, and how interrupts are routed. It is hard because address assignment must be stable across restarts and versions, or guests rename their disks and network cards.",
    k: ["Stable explicit addresses vs automatic assignment: explicit addresses keep guest device names fixed, but require management to track them for every device.", "Flat bus vs bridged tree: a flat bus is simple, but a tree is needed for hot-plug and for more devices than one bus holds."],
    p: ["A new machine version assigns a different slot to the network card and the guest loses its network configuration.", "The bus has no spare windows for hot-plug and an add fails only on a machine that has been running a long time."],
    v: "Start the same definition twice on different hosts and releases and confirm the guest sees every device at identical bus addresses and keeps its interface names.",
    dep: ["config-space-emulation", "acpi-tables"]
  },
  "config-space-emulation": {
    s: "Emulates the standard configuration registers each virtual device exposes: identity, capabilities, address ranges and interrupt settings the guest reads and programs.",
    d: "On a bus that supports enumeration, each device has a small block of registers describing its vendor and class, its capabilities (message-signaled interrupts, power management, error reporting), and the address windows it wants. The guest writes the windows it picked; the device model then moves the device's registers there in the monitor's dispatch tables. Writes to some registers have side effects. It is hard because guests rely on exact behavior of reserved bits and capability chains, and quirks accumulate over years.",
    k: ["Faithful emulation of every register vs a minimal subset: faithful emulation runs unmodified guests, but each quirk is more code to maintain and secure.", "Passing through real config registers vs filtering: passing through is accurate for assigned devices, but allows the guest to program the device in unsafe ways."],
    p: ["A guest writes a reserved bit and the device model treats it as an error, though real hardware ignored it.", "Moving a device's address window leaves the old mapping in place and two devices respond to one address."],
    v: "Boot a guest, dump the device's config space from inside it, and compare against the defined layout; relocate a device window and confirm accesses reach the device only at the new address.",
    dep: ["mmio-pio-dispatch", "virtual-bus-topology"]
  },
  "mmio-pio-dispatch": {
    s: "Routes a guest's access to a device register, which exits to the monitor, to the handler that owns that address, in the kernel or in user space.",
    d: "The monitor keeps a sorted structure of port and memory-mapped address ranges, each registered by a device. When a guest access faults on an unbacked address or hits a port, the exit handler looks up the range, decodes the access and calls the handler, or forwards it to the device-model process and waits. Reads must return a value before the guest continues. It is hot: some workloads cause hundreds of thousands per second. Hard parts are lock contention and keeping address changes atomic.",
    k: ["In-kernel handlers for hot devices vs everything in user space: kernel handlers are fast, but widen what the privileged code must trust.", "Decode on fault vs predecoded accesses by hardware: hardware-provided decode is faster and exact, but not available for every instruction."],
    p: ["A device changes its address window while another thread dispatches to it and the guest reads from a half-updated range.", "An access spans two devices and one half is dropped."],
    v: "Register two devices on adjacent ranges, issue accesses to the edges of each from a test guest, and confirm every access reaches exactly the owning device with correct size and value.",
    dep: ["exit-handlers", "kernel-fast-paths"]
  },
  "emulated-legacy-devices": {
    s: "Software implementations of old, widely supported hardware (storage controllers, network cards, serial ports, timers) that let unmodified guests boot and run without special drivers.",
    d: "Each device is a state machine reproducing a real chip's registers, command queues and interrupt behavior. Guests that predate paravirtual drivers, firmware, and installers all depend on these, so they stay available as a fallback even when slower. Each register access exits, so a driver doing many small accesses per packet is slow. They are hard because fidelity matters more than speed: undocumented behavior that real drivers depend on must be reproduced exactly.",
    k: ["Keep legacy devices vs drop them: keeping runs old guests and installers, but retains a large, old and frequently attacked code base.", "Emulate a common card vs invent a simpler one: a common card needs no guest drivers, but its register protocol is costly to emulate."],
    p: ["Emulated device code is the most common source of guest-to-host escapes and is left enabled on machines that never use it.", "Throughput collapses because a driver reads a status register after every packet."],
    v: "Boot an old guest installer from an emulated controller and network card, complete an install and a file transfer, and confirm the exit counters show the expected high per-operation exit count.",
    dep: ["mmio-pio-dispatch", "device-model-process"]
  },
  "virtual-display-input": {
    s: "Provides the guest a virtual graphics adapter, keyboard, pointer and sometimes audio, and exposes them to remote consoles and clients.",
    d: "The display device presents a linear framebuffer and mode-setting registers; the device model reads changed regions and encodes them for the remote protocol. Input arrives as key and pointer events from the client and is delivered through a virtual input device. A paravirtual graphics device can send drawing commands or accelerated surfaces instead of pixels. It is hard because pixel streaming is bandwidth hungry, pointer behavior must feel local, and graphics acceleration can expose host drivers to guest commands.",
    k: ["Framebuffer streaming vs command forwarding: framebuffer is simple and safe, but wastes bandwidth, while command forwarding is efficient but exposes host graphics code.", "Absolute pointer device vs relative mouse: absolute avoids pointer drift and capture, but needs a guest driver."],
    p: ["Guest-supplied display dimensions drive an unchecked allocation in the device model.", "Input latency over a wide-area console makes the machine feel broken even though it is healthy."],
    v: "Open a remote console, change the guest's resolution, and confirm the client resizes; type a key combination and verify the guest receives the exact scan codes in an input test tool.",
    dep: ["device-model-process", "remote-console"]
  },
  "device-model-event-loop": {
    s: "The loop and worker threads in the device model that wait for guest kicks, file descriptors and timers, and run each device's callbacks without blocking each other.",
    d: "A main loop polls event sources: eventfds signaled by the monitor when the guest writes a doorbell, sockets, files, timers. Callbacks run on the loop or are handed to dedicated I/O threads, one per device or queue, so a slow disk cannot delay the network. Asynchronous I/O interfaces avoid blocking threads. The hard parts are locking between the loop, vCPU threads and I/O threads, and keeping a stuck callback from stalling the whole machine's control path.",
    k: ["One loop for everything vs dedicated I/O threads: one loop is simple and race-free, but serializes devices; threads scale, and need careful locking.", "Polling vs interrupt-driven wakeups: polling lowers latency, but burns a processor even when idle."],
    p: ["A blocking call inside a callback freezes the control channel and the machine appears hung to management.", "Two threads touch device state without a lock and corrupt a queue under load."],
    v: "Saturate one virtual disk while running a latency test on the network device in the same guest, and confirm network latency stays unaffected and thread profiling shows separate I/O threads per device.",
    dep: ["kernel-fast-paths", "device-model-process"]
  },
  "kernel-fast-paths": {
    s: "In-kernel shortcuts that complete common guest device accesses and notifications without waking the user-space device model.",
    d: "Two common shortcuts. A doorbell register write can be matched by address and value in the monitor and converted to a signal on a file descriptor, so the device model sees only the event. Some simple devices (interrupt controller, timer) are fully implemented in the kernel. This removes a transition and a context switch from hot paths. The trade is that kernel code is more privileged and harder to update, and that device state is split between kernel and user space.",
    k: ["Signal-only shortcuts vs full in-kernel devices: signal shortcuts keep logic in user space and speed up only the notify, while kernel devices are faster still but enlarge the trusted base.", "Fast path on by default vs opt-in: on by default speeds every guest, but exposes more kernel code to every guest."],
    p: ["State split between kernel and user space is saved inconsistently and a migrated guest loses an interrupt.", "A kernel device bug lets a guest crash the host rather than only its own process."],
    v: "Time a guest's doorbell write with and without the shortcut enabled and confirm the exit-to-wakeup latency drops, with counters showing no user-space exit for those writes.",
    dep: ["exit-handlers", "mmio-pio-dispatch"]
  },
  "virtual-switch": {
    s: "A software switch in the host that connects virtual NICs to each other and to physical uplinks, learning addresses and forwarding frames.",
    d: "It keeps a table mapping addresses and tags to ports, floods unknown destinations, and forwards known ones. It can run in the host kernel or in user space with polling. Policy objects (VLANs, filters, rate limits, mirroring) attach to ports. A control agent programs it from the management plane. It is hard because it sits on every packet of every machine, so it must be fast, and because loops, floods and broadcast storms can take the whole host's network down.",
    k: ["Kernel switch vs user-space polling switch: kernel is simple and shares processors well, while polling reaches higher packet rates at the price of dedicated cores.", "Learning switch vs controller-programmed forwarding: learning needs no controller, but programmed tables give exact, auditable behavior."],
    p: ["Two uplinks bridged without loop prevention create a broadcast storm that stops the host.", "A guest's forged source address poisons the learning table and redirects other machines' traffic."],
    v: "Send traffic between two machines on one host and out to an external peer, and confirm frames go only to the intended ports in a capture, and that the forwarding table shows each address on one port.",
    dep: ["tap-ports", "flow-cache", "uplink-bonding"]
  },
  "tap-ports": {
    s: "The host-side endpoint of each virtual NIC: a packet device the backend reads and writes, attached to a switch port.",
    d: "For each guest NIC the host creates a port that carries Ethernet frames between the guest-facing backend and the switch. Frames pass through a shared ring of buffers; larger buffers carry segmentation metadata so one large buffer can stand for many packets. The port has a stable name, an address, and attached policy. Hard parts are creating and removing ports in the right order during start, stop and migration, and keeping a port alive and rate limited when its machine is misbehaving.",
    k: ["Per-queue ports with several processors vs a single queue: multi-queue spreads load across cores, but costs memory and interrupts per queue.", "Kernel-created tap device vs a user-space socket to the switch: tap devices are universal, user-space sockets avoid a kernel crossing for each packet."],
    p: ["A port is not removed after a failed start and the next start reuses its name and fails.", "A guest sends at line rate through one queue and starves other machines' ports on the same thread."],
    v: "Start and stop a machine one hundred times and confirm no ports remain on the switch afterward, and that each start's first frame arrives at the expected peer.",
    dep: ["virtqueue-rings", "vhost-offload"]
  },
  "vlan-overlay": {
    s: "Tags and encapsulates frames so many isolated virtual networks can share the same physical network, including across hosts.",
    d: "VLAN tags divide one layer-2 network into numbered segments; the switch adds or strips tags per port. Overlay encapsulation wraps a guest frame inside an outer packet addressed between hosts, so a virtual network spans a routed fabric. A mapping from virtual network and address to host is distributed by a control plane. It is hard because encapsulation lowers the effective packet size, breaks offloads, and requires the mapping to be correct even while machines are migrating.",
    k: ["VLAN tags vs overlay encapsulation: tags are cheap and hardware-friendly but limited in number and tied to the layer-2 fabric, while overlays scale and cross routers at the cost of overhead.", "Learning mappings dynamically vs pushing them from a controller: learning is simple, but pushing converges faster after a migration."],
    p: ["Encapsulation overhead makes full-size frames exceed the path size and large transfers hang.", "After a migration, other hosts keep sending to the old location until their mapping expires."],
    v: "Place two machines on different hosts in the same virtual network over a routed fabric and confirm they ping each other, capture the outer headers on the wire, and migrate one and confirm traffic follows.",
    dep: ["virtual-switch", "uplink-bonding"]
  },
  "offload-segmentation": {
    s: "Lets the guest and host exchange very large buffers and skip per-packet checksum and splitting work, deferring it to the last point that can do it cheaply.",
    d: "The guest driver marks a buffer as needing checksum completion and as segmentable into packets of a stated size. The host switch passes the large buffer along; the physical NIC or the final software stage splits and checksums it. On receive, large receive offload merges packets. Traffic between guests on one host never needs real checksums. It is hard because every intermediate stage (filters, overlays, taps) must understand the metadata, and a stage that does not will corrupt or drop traffic.",
    k: ["End-to-end deferred segmentation vs segmenting at the guest: deferral saves work on every hop, but needs all stages to carry the metadata.", "Merging received packets vs delivering them as they come: merging cuts interrupts and cost, but adds latency and hides packet boundaries from filters."],
    p: ["Encapsulation drops the checksum metadata and the receiver sees corrupt packets only for large transfers.", "A filter inspects a merged giant packet and misses a rule that would match its parts."],
    v: "Transfer a large file between a guest and an external host with offloads on and off, confirm identical content by checksum, and that processor use per gigabit drops with offloads on.",
    dep: ["virtqueue-rings", "tap-ports"]
  },
  "packet-filtering": {
    s: "Rules applied at each virtual port that permit, drop or rewrite frames, enforcing tenant firewall policy and preventing address spoofing.",
    d: "Rules match on addresses, protocol and ports, and may track connections so replies are allowed without explicit rules. Anti-spoofing rules bind a port to the addresses the control plane assigned it. Rules are compiled into the switch and applied on both directions of the port, before packets reach the guest. Because the filter sits outside the guest, it works even if the guest is compromised. It is hard because rule counts grow quickly and connection tracking state must survive migration.",
    k: ["Stateful connection tracking vs stateless rules: stateful rules are far easier to write and safer, but cost memory per connection and must be moved on migration.", "Filtering at the port vs at a central appliance: port filtering scales with hosts and sees all traffic, but makes policy distribution a hard problem."],
    p: ["Connection state is not carried across a live migration and established connections are reset.", "A very large rule set is evaluated linearly and adds visible latency to every packet."],
    v: "Apply a rule that denies one destination port, confirm a guest cannot reach it and that a spoofed source address is dropped, then migrate and confirm an established allowed connection survives.",
    dep: ["virtual-switch", "flow-cache"]
  },
  "traffic-shaping": {
    s: "Limits and prioritizes each machine's network bandwidth so one tenant cannot saturate shared links.",
    d: "Token-bucket limiters at each port cap average and burst rates in both directions. Priority classes or weighted queues divide an uplink under contention. Hardware offloads of rate limiting exist on some NICs. Shaping can apply to traffic leaving a guest before it enters the switch, which is easiest; shaping inbound traffic requires dropping or delaying packets after they arrive. It is hard because limits interact with offloaded large buffers and with transport protocols that react to drops.",
    k: ["Limit at ingress from the guest vs at the uplink: ingress limits stop abuse early and cost little, but do not manage contention on the shared link.", "Hard caps vs guaranteed minimums with sharing: caps are predictable, but wasted when links are idle, while sharing needs a work-conserving scheduler."],
    p: ["A burst allowance is set too high and every machine can burst at once and saturate the uplink.", "Shaping a segmentable large buffer by packet count under-counts bytes and the limit is exceeded."],
    v: "Set a one gigabit limit on a machine on a ten gigabit link and measure sustained throughput, confirming it holds near the limit while a second machine still reaches its own full rate.",
    dep: ["virtual-switch", "resource-pools"]
  },
  "uplink-bonding": {
    s: "Combines the host's physical network ports into one logical uplink for the switch, for more bandwidth and for survival of a link failure.",
    d: "Several physical ports are grouped; the bond chooses a port per flow by hashing headers, or runs active-backup. Link state is detected by carrier or by an exchange with the physical switch. Hash choice determines whether one big flow can use more than one port (it cannot) and whether traffic is balanced. Failover must keep addresses visible to the physical network by announcing them. It is hard because the host's and physical switch's settings must agree.",
    k: ["Cooperating with the physical switch (aggregation protocol) vs host-only bonding: cooperating gives true load sharing, but needs configuration on both sides.", "Hash on addresses and ports vs addresses only: ports balance better, but fragmented traffic can reorder."],
    p: ["Mismatched settings between the host and the physical switch cause packets to loop or one direction to fail.", "After failover, the physical switch keeps forwarding to the dead port until addresses are re-announced."],
    v: "Unplug one of two uplinks during a sustained transfer and confirm traffic recovers within the expected seconds without resetting the connection, then restore it and confirm traffic spreads across both again.",
    dep: ["host-drivers"]
  },
  "flow-cache": {
    s: "A table of recently seen flows and the actions decided for them, so the first packet takes the slow, rule-based path and later ones are forwarded in a few lookups.",
    d: "The switch classifies a new flow against the full rule set and records an exact or masked match with the resulting actions (forward, tag, rewrite, drop). Later packets hit the cache without consulting rules. Entries expire when idle and are invalidated when rules, ports or mappings change. Hit rate drives performance; a workload with huge numbers of short flows defeats the cache. The hard part is invalidation: a stale entry applies an old decision.",
    k: ["Exact-match cache vs wildcarded entries: exact match is fast to look up, but needs an entry for each flow, while wildcards use fewer entries and slower matching.", "Eager vs lazy invalidation after a rule change: eager is correct immediately, but expensive with many entries."],
    p: ["A rule is changed but cached entries keep applying the old decision until they time out.", "A scan of many ports from one guest evicts everyone else's entries and slows the whole host."],
    v: "Send a stream of identical packets and confirm the first misses and the rest hit in the cache statistics; change a rule to drop them and confirm the very next packet is dropped.",
    dep: ["packet-filtering"]
  },
  "virtual-disk-formats": {
    s: "The on-disk layout that turns a file or volume into a block device the guest sees, from a raw array of sectors to formats with maps and metadata.",
    d: "A raw image maps guest sector n to byte n of the file. Richer formats keep a table that maps guest clusters to file locations, allowing sparse allocation, backing files, compression and encryption. Metadata (tables, reference counts) must be updated in an order that survives a crash. The format is a long-term compatibility commitment, because images outlive hosts. It is hard because correctness under power loss depends on the exact order of writes and flushes.",
    k: ["Raw vs a mapped format: raw is fastest and simplest, but gives no snapshots or thin allocation; mapped formats add features and extra metadata I/O.", "Cluster size large vs small: large clusters cut metadata and speed sequential access, but waste space and add cost for small random writes."],
    p: ["A crash between a data write and the table update leaks space or points a cluster at stale data.", "Two machines open the same image for writing and corrupt its tables."],
    v: "Write a pattern, kill the host process at random points many times, and run the format's consistency checker after each; confirm no corruption and no data loss for acknowledged flushes.",
    dep: ["block-backends", "thin-provisioning", "cow-overlays"]
  },
  "thin-provisioning": {
    s: "Allocates storage only when the guest first writes it, so a disk can look larger than the space reserved for it.",
    d: "A sparse image or a volume with on-demand extents records which regions are allocated and returns zeros for the rest. Allocation happens inside the write path, which adds latency to first writes and fragments the file. Together with discard, space can be returned. Total virtual size across disks may exceed physical space, so monitoring free space is essential. It is hard because running out of real space in the middle of a write cannot be reported to a guest as anything gentler than an I/O error.",
    k: ["Preallocated vs thin: preallocating gives predictable performance and no out-of-space surprise, but wastes capacity; thin saves space and risks exhaustion.", "Allocate in large extents vs small: large extents reduce fragmentation and metadata, but waste space for sparse writers."],
    p: ["The datastore fills as many thin disks grow at once, and every guest on it gets write errors.", "First-write latency spikes on a freshly cloned disk and looks like a storage fault."],
    v: "Create a ten gigabyte thin disk and confirm the file starts near empty; write two gigabytes in the guest and confirm file size grows by about that amount, and that unwritten regions read as zero.",
    dep: ["virtual-disk-formats", "discard-trim"]
  },
  "cow-overlays": {
    s: "A writable layer stacked on a read-only backing image that stores only the blocks the guest changed, used for snapshots and fast clones.",
    d: "Reads check the top layer first and fall through to the backing image for unmapped clusters. Writes allocate in the top layer, copying the surrounding cluster first if it is partly written. A new snapshot adds a layer; deleting one merges layers. Many machines can share one backing image, which is how clones are fast and cheap. It is hard because chains lengthen reads, because the base must never change under its overlays, and because commits and merges must be crash-safe.",
    k: ["Overlay chains vs full copies: chains clone in seconds and share space, but depend on every layer below staying intact.", "Copy-on-write at cluster granularity vs finer blocks: larger clusters make fewer metadata updates, but copy more data for each small write."],
    p: ["The backing file is modified or moved and every overlay above it becomes unreadable.", "A very long chain makes random reads several times slower than the base alone."],
    v: "Clone ten machines from one base, write in each, and confirm total space grows only by the written data, the base file's checksum is unchanged, and each machine reads only its own writes.",
    dep: ["virtual-disk-formats", "block-backends"]
  },
  "block-backends": {
    s: "The drivers that reach where bytes really live: local files, raw volumes, network block protocols and distributed object stores, behind one uniform interface.",
    d: "A common block layer exposes read, write, flush and discard, and implementations map them to files through asynchronous I/O, to devices directly, or to remote protocols. Filters (throttle, cache, encryption, format) are stacked above the driver in a chain. Requests complete out of order and the layer must preserve flush semantics. It is hard because failure behavior differs per backend: a remote store may stall for seconds, and the guest sees only a slow disk.",
    k: ["Asynchronous kernel I/O vs a thread pool of blocking calls: asynchronous interfaces use fewer threads and give lower latency, but are less portable and harder to debug.", "Direct access to a device vs through a file system: direct gives control of ordering and no double caching, but loses file-level tools."],
    p: ["A remote store stalls and every request thread blocks, freezing the machine's other disks and control path.", "A backend acknowledges a flush before data is stable and a power loss corrupts the guest."],
    v: "Run a synchronous write-then-flush loop against each backend type, cut power on a test host mid-run, and confirm every write acknowledged before the flush is present after reboot.",
    dep: ["host-drivers", "disk-io-throttling"]
  },
  "disk-io-throttling": {
    s: "Queues and limits each virtual disk's operations and bandwidth so tenants share a storage device fairly and noisy ones are contained.",
    d: "Limits are set per disk in operations per second, bytes per second and burst. Requests above the limit wait in a queue before reaching the backend. A proportional-share mode divides a device by weight under contention. Request size matters, since one large request is many small ones. Throttling at the monitor sees the guest's own request pattern but not other hosts' load on shared storage. It is hard because latency, not throughput, is what applications feel.",
    k: ["Operations limit vs bandwidth limit: operations limits stop small-request floods, while bandwidth limits stop sequential hogs; real policies need both.", "Throttle in the host vs rely on the storage system: host throttles are immediate and per machine, but do not coordinate across hosts."],
    p: ["Only bandwidth is limited, and a guest issues millions of tiny reads that overload the array.", "A burst allowance lets a snapshot merge or backup consume the device at the same moment as production reads."],
    v: "Set a limit of one thousand operations per second, run a guest benchmark at maximum rate, and confirm measured IOPS settle at the limit while a second guest's latency on the same device stays flat.",
    dep: ["block-backends", "resource-pools"]
  },
  "cache-modes": {
    s: "The policy for how guest writes are buffered in the host and when the guest's flush requests become real durability, from write-through to unsafe write-back.",
    d: "The host can cache through its page cache, bypass it with direct I/O, or hold writes in the device model until flushed. A guest flush command must make earlier writes durable before it completes; some modes honor that and some ignore it for speed. The mode determines read performance (host cache hit), double caching with the guest cache, and what survives a host crash. It is hard because the guest believes it has a disk with ordinary flush semantics.",
    k: ["Direct I/O vs host page cache: direct avoids double caching and memory pressure, but loses the benefit of a large shared cache for read-heavy guests.", "Honoring flushes vs ignoring them: honoring is safe, but slow on devices with expensive flush; ignoring makes benchmarks fast and databases unsafe."],
    p: ["An unsafe cache mode is left on for production and a host crash corrupts guest databases.", "Host page cache plus guest cache duplicate large amounts of memory and cause host memory pressure."],
    v: "Write and flush from the guest, power off the host abruptly, and confirm all flushed data is intact after restart in the safe mode, while observing the data loss in the unsafe mode on a test system.",
    dep: ["block-backends", "host-memory-allocator"]
  },
  "discard-trim": {
    s: "Passes the guest's notice that blocks are no longer used down to the backing store, so thin images shrink and shared storage can reclaim space.",
    d: "Guests send discard or write-zero commands when files are deleted. The virtual disk layer unmaps the corresponding clusters in the image or passes the command to the underlying volume or array. Zero detection can turn zero writes into unmaps. Reclaiming space needs the guest to issue commands, and the virtual device to advertise support. It is hard because discards can be slow, can fragment the backing store, and may leave deleted data readable if the layer does nothing with them.",
    k: ["Immediate discard vs periodic batch: immediate frees space at once, but adds load in the write path; periodic batches run when idle, but delay reclaim.", "Zero detection on writes vs relying on explicit discard: detection reclaims space from guests that never discard, but costs a scan of every write."],
    p: ["A large discard blocks the queue behind it and causes visible I/O latency in the guest.", "A virtual disk does not advertise discard support, so the guest never sends it and thin images only grow."],
    v: "Fill a thin disk, delete the files in the guest, run its trim command, and confirm the image file or volume allocation shrinks by about the deleted amount.",
    dep: ["thin-provisioning", "block-backends"]
  },
  "storage-mirroring": {
    s: "Copies a running machine's disk to another location while it keeps writing, then switches the machine to the copy, enabling storage migration and live backups.",
    d: "A mirror operation copies the disk in the background and, for every guest write during the copy, writes both locations or marks the region dirty to recopy. When both match, the machine pivots to the new target atomically. The same mechanism supports moving a disk to another datastore, taking a backup of an active disk, and replicating to a remote site. It is hard because the pivot must be crash-safe and because a write-heavy disk may never converge.",
    k: ["Write to both vs track dirty regions and recopy: write-to-both converges immediately, but doubles write latency; dirty tracking is cheaper but may loop.", "Pivot automatically at convergence vs wait for an operator: automatic is convenient, but a surprise switch of storage during peak load is not always welcome."],
    p: ["The target runs out of space after the copy is mostly done and the mirror fails with hours wasted.", "A crash during the pivot leaves the definition pointing at the old disk while the new one holds newer data."],
    v: "Mirror a disk under write load to another datastore, pivot, and confirm that checksums of the two disks match at the pivot point and the guest saw no I/O errors.",
    dep: ["block-backends", "dirty-page-tracking", "task-engine"]
  },
  "datastore-locking": {
    s: "Ensures that only one host at a time opens a virtual disk for writing on shared storage, and detects when a host that held a lock has died.",
    d: "Locks are leases kept as files or on-disk records on the shared datastore, renewed periodically by the holder. Another host seeing an expired lease can take it over after fencing. Locks are checked when a machine starts and when a migration hands over a disk, which has a brief dual-owner moment. The hard part is distinguishing a dead holder from a stalled one: taking over a disk still being written by a slow holder destroys it.",
    k: ["Leases on the datastore vs a separate lock service: datastore leases need nothing else and fail with the storage, while a lock service is faster but adds a dependency.", "Short vs long lease: short leases give quick failover, but a brief storage pause then causes false expirations."],
    p: ["A host stalls past its lease, another host takes the disk, and then the first resumes and writes.", "A migration drops the lock on the source before the destination holds it, leaving a gap in protection."],
    v: "Try to start the same machine on two hosts at once and confirm the second is refused with the owner named; kill the first host's agent and confirm takeover happens only after lease expiry and fencing.",
    dep: ["ha-manager"]
  },
  "paravirtual-spec": {
    s: "An open specification for devices designed to be virtualized: a small set of device types (block, network, console, balloon) with a common transport and feature negotiation.",
    d: "The guest sees a device on an ordinary bus, reads a set of feature bits offered by the device model, accepts the subset its driver understands, and sets up queues. Devices differ only in their configuration area and message formats; the transport, ring layout and notification are shared. Because the specification is public, guest drivers and host backends evolve independently. It is hard because feature negotiation must keep old drivers and new backends interoperable, and migration needs to preserve negotiated features.",
    k: ["A common ring and feature negotiation vs per-device protocols: a common layer lets one driver framework serve all devices, but constrains what any one device can do.", "Registers on the bus vs messages on a shared page: bus registers need no extra mechanism, but every access traps."],
    p: ["A backend offers a feature the guest accepts, then migrates to a host that lacks it, and the device breaks.", "A driver ignores a required negotiation step and works only with one backend."],
    v: "Boot guests of different ages against one backend and confirm each negotiates a different feature set, lists it, and transfers data correctly, and that the set is preserved after migration.",
    dep: ["virtqueue-rings", "virtual-bus-topology"]
  },
  "virtqueue-rings": {
    s: "Shared-memory rings through which the guest posts buffers and the host returns completions, with no register access per buffer.",
    d: "A queue has a descriptor table (address, length, flags for each buffer, possibly chained), an available ring the guest fills and a used ring the host fills. A packed layout combines them for fewer cache misses. The guest posts buffers and optionally kicks the host; the host processes them, writes results and optionally signals the guest. Both sides read memory the other writes, so the host must validate every guest-supplied address and length. Memory ordering matters on weakly ordered processors.",
    k: ["Split vs packed rings: split is simple and widely supported, while packed has fewer memory touches and better cache behavior but needs newer drivers.", "Indirect descriptor tables vs chained descriptors: indirect tables let one slot describe many fragments, but add a memory access."],
    p: ["The host trusts a descriptor length from the guest and reads or writes outside the buffer.", "A missing memory barrier on a weakly ordered processor lets the host see an index before the data it covers."],
    v: "Fuzz a device with malformed descriptors (loops, huge lengths, bad addresses) and confirm the host rejects them, marks the device broken, and never touches memory outside the guest's regions.",
    dep: ["guest-memory-map", "paravirtual-spec", "notification-suppression"]
  },
  "notification-suppression": {
    s: "Lets each side tell the other when it does not need to be signaled, so a busy ring is processed in batches without a signal per buffer.",
    d: "Each ring carries event indices or flags: the consumer states the position at which it wants the next notification. A running consumer that is already polling asks for none. This cuts guest exits (kicks) and host interrupts to a few per batch under load, and falls back to a signal per buffer when idle. It is a tuning surface: too little signaling adds latency, too much burns processor on transitions. Races between updating the threshold and checking for work are subtle.",
    k: ["Event-index thresholds vs on/off flags: thresholds give fine control over batch size, but are harder to get right than a simple flag.", "Poll first and signal later vs signal always: polling gives the lowest latency at high rates, but spends processor when load is light."],
    p: ["A race between enabling notification and checking the ring leaves a buffer unnoticed and the device stalls until the next unrelated event.", "Suppression with a slow consumer adds latency that tail measurements show but averages hide."],
    v: "Run a packet stream at rising rates and confirm exit and interrupt counts per packet fall as the rate rises, with latency staying within target at the lowest rate.",
    dep: ["virtqueue-rings", "interrupt-injection"]
  },
  "vhost-offload": {
    s: "Moves the data-moving part of a paravirtual device out of the device-model process into a dedicated kernel thread or separate user-space process that shares the rings.",
    d: "The device model sets up the rings and then hands their memory and signal channels to a backend. The backend polls the ring, moves data to the tap, disk or socket, and signals completion, with the device model out of the data path. In-kernel backends skip a kernel-to-user copy; user-space backends in a separate process keep isolation and can poll. The control path (feature negotiation, state) stays in the device model. It is hard because ring state is now shared by two programs and must be saved at migration.",
    k: ["Kernel backend vs separate user-space backend: kernel backends are simplest and fast, but run guest-influenced code in the kernel; user-space backends isolate it and need shared memory setup.", "Interrupt-driven vs busy-polling backend: polling gives lower latency, but dedicates a core."],
    p: ["Ring state is not synchronized with the device model at migration and requests are duplicated or lost.", "A busy-polling backend per machine consumes cores the scheduler needed for guest processors."],
    v: "Compare throughput and processor use of a guest network test with and without the backend offload, and confirm the device-model process shows no packet work while the backend runs.",
    dep: ["virtqueue-rings", "tap-ports", "kernel-fast-paths"]
  },
  "device-passthrough": {
    s: "Assigns a whole physical device to one guest, which drives it directly with its own driver, bypassing the host's data path.",
    d: "The host unbinds the device from its own driver, rebinds it to a stub, remaps its address windows into the guest's physical space, programs the IOMMU so the device's DMA reaches only that guest's memory, and routes its interrupts to the guest. Performance approaches native. The cost is that the machine is tied to that device: no live migration unless the device state can be saved, and no sharing. It is hard because devices may reset badly, share resources with neighbors in the IOMMU grouping, and trust whatever the guest writes.",
    k: ["Passthrough vs paravirtual: passthrough gives native speed and full device features, but gives up migration, snapshots and overcommit.", "Unbind and reset on release vs reuse as is: resetting prevents data leaks to the next owner, but some devices cannot reset reliably."],
    p: ["A device that cannot reset cleanly leaks a previous guest's data or hangs the host when reassigned.", "Devices in one IOMMU group cannot be split, so assigning one gives the guest its neighbor as well."],
    v: "Assign a device to a guest, run its native benchmark and confirm near-native results; stop the guest, reassign the device to another guest, and confirm it comes up with no state from the first.",
    dep: ["iommu-remapping", "host-drivers", "interrupt-injection"]
  },
  "iommu-remapping": {
    s: "Hardware that translates and restricts the addresses a device uses for memory access, confining device DMA to the owning guest's memory.",
    d: "The IOMMU has per-device page tables mapping device-visible addresses to host memory, plus an interrupt remapping table. For passthrough, the host maps the guest's whole memory (pinned) so the device can use guest physical addresses; for emulated or nested IOMMUs, the host shadows or nests the guest's own mappings. Without it a guest-controlled device can read any host memory. It is hard because pinning prevents overcommit and swapping, and the translation cache adds invalidation cost.",
    k: ["Pin all guest memory vs pin on demand: pinning everything is simple and fast, but defeats overcommit, while on-demand needs device page-fault support.", "Static identity mapping vs dynamic mappings: static is cheap and predictable, but a guest cannot protect itself from its own devices."],
    p: ["A missing or disabled IOMMU lets an assigned device write to host memory, defeating isolation entirely.", "Mapping and unmapping on each I/O in a guest with a virtual IOMMU adds large per-operation exits."],
    v: "From a guest with an assigned device, program the device to DMA to an address outside the guest's memory, and confirm the IOMMU blocks it and reports a fault attributed to that device.",
    dep: ["guest-memory-map", "host-drivers"]
  },
  "virtual-functions": {
    s: "Lightweight device instances carved out of one physical device by the hardware itself, each assignable to a different guest with its own queues and address space.",
    d: "A capable device exposes one privileged physical function and many virtual functions with restricted register sets. The host driver configures the device and gives each function to a guest through passthrough; the IOMMU separates their DMA. A network card can switch traffic between functions in hardware. This gives native performance with sharing. It is hard because migration needs device-specific state transfer or a bond with a paravirtual path, and because the number of functions and queues is limited.",
    k: ["Virtual functions vs software switch: hardware functions bypass the host entirely, but give up the switch's filtering, mirroring and migration.", "Pairing with a paravirtual device for migration vs refusing migration: pairing keeps mobility, but adds a switchover glitch and guest configuration."],
    p: ["Functions on one card share a link and a switch, so an overloaded neighbor or a broken guest can affect others.", "More guests than functions exist, and placement fails after the cluster has grown to depend on them."],
    v: "Create several functions, assign each to a different guest, run traffic between them and out of the host, and confirm each guest sees its own address and that a broken guest does not interrupt the others.",
    dep: ["device-passthrough", "iommu-remapping"]
  },
  "mediated-devices": {
    s: "A way to share one physical device among guests through the host driver, which presents each guest a partitioned slice that it validates and forwards.",
    d: "The vendor driver or a generic framework creates mediated instances, each with its own virtual register set and a share of device resources such as graphics memory or queues. Control operations trap into the host driver for validation, while the data path runs directly on hardware with address translation. It sits between emulation and passthrough: more sharing than passthrough, less overhead than full emulation. It is hard because the host driver becomes part of the trusted base and must handle each guest's mistakes.",
    k: ["Mediated slices vs whole-device passthrough: slices let several guests share one device, but rely on a trusted host driver for isolation.", "Time-sliced vs spatially partitioned sharing: time slicing is flexible and works on any device, but gives unpredictable latency, while partitioning gives guarantees and fixed shares."],
    p: ["A guest-submitted command crashes the shared device and every guest on it loses its work.", "Slices are sized at creation and cannot be changed without stopping the guest."],
    v: "Create two mediated instances on one device, run workloads in both guests at once, and confirm each sees only its own memory and that killing one guest's workload does not disturb the other.",
    dep: ["device-passthrough", "iommu-remapping", "host-drivers"]
  },
});
