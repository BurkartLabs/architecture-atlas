// Details for the microkernel plate, part 3: drivers, naming, filesystem and network servers, policy.
ATLAS.details("microkernel", {
  "driver-process": {
    s: "A user-level process that controls one device or class of devices using only the registers, interrupt handler and DMA memory capabilities it was granted.",
    d: "The driver maps its device's register frames, waits on a notification for its interrupt, and exposes a request interface to clients through an endpoint or a shared ring. It holds no authority over other devices or the rest of memory. Because it is an ordinary process, it can be debugged, restarted and replaced without rebooting. It runs at a priority that matches its latency needs and has its own scheduling context. The hard part is that devices with DMA can still write anywhere unless an IOMMU confines them, so the capability story only holds if that control exists.",
    k: ["Driver in its own process versus linked into its client: a separate process contains faults and bugs, but adds IPC and context switching per request.", "One driver for a whole device class versus one per instance: a class driver shares code and state, but a fault takes down every device it serves."],
    p: ["A driver given a whole device region when it needed one block of registers can reprogram neighboring devices.", "Driver that handles requests inline blocks the interrupt thread and loses events."],
    v: "Kill the driver while a client is mid-request and confirm the kernel and other drivers stay up, and that a restarted driver serves the next request after reinitializing the device.",
    dep: ["device-memory-mapping","irq-handler-object","dma-and-iommu","endpoint-object"]
  },
  "device-memory-mapping": {
    s: "Giving a driver the frames covering a device's registers, as device-type untyped memory retyped into frames and mapped uncached into the driver's address space.",
    d: "Device memory regions appear at boot as device untypeds, separate from ordinary RAM, so they can never be retyped into kernel objects. A resource manager splits out the exact range for one device, retypes it as frames, and delegates them with the right rights. The driver maps them with attributes that disable caching and reordering. Granularity is a page, so two devices sharing a page cannot be separated. The difficulty is knowing the region addresses at all, which come from firmware tables or a bus enumerator.",
    k: ["Device regions as untypeds versus a special device capability: untypeds reuse the existing delegation and revocation, but demand page granularity that devices may not respect.", "Uncached mapping always versus per-driver choice: always uncached is safe, but slow for frame buffers that would benefit from write combining."],
    p: ["Two devices on one page force a driver to hold registers that belong to another device.", "Mapping registers with ordinary cached attributes makes writes appear late or reordered."],
    v: "Map a device's registers into a driver, read its identification register, and confirm the value is correct and that attempting to map an adjacent device's page with the same capability fails.",
    dep: ["frame-objects","untyped-memory","untyped-allocator"]
  },
  "dma-and-iommu": {
    s: "Confining device-initiated memory access: the driver gets a bounded memory window, and a user-level manager programs the IOMMU so the device can reach nothing else.",
    d: "A device that does DMA bypasses the processor's translation, so capability protection does not cover it unless hardware translation for devices is used. The kernel exposes IOMMU tables as objects, like page tables. A manager creates a device address space, maps only the frames the driver owns, and attaches it to the device. Without an IOMMU, a driver with DMA is effectively trusted with all memory. The hard parts are physical contiguity for devices without scatter-gather, cache coherency, and bounce buffers.",
    k: ["IOMMU-confined drivers versus trusted DMA drivers: confinement preserves isolation against a faulty driver, but costs setup per mapping and hardware support.", "Static DMA pool versus mapping per request: a static pool is fast and simple, but fixes the amount of memory a driver may expose."],
    p: ["On hardware without a translation unit for devices, a compromised driver can read or overwrite any memory.", "Unmapping a DMA buffer while the device still writes it corrupts the next owner of that frame."],
    v: "Program a device to DMA to an address outside its window and confirm the IOMMU blocks it and reports a fault, while a transfer inside the window completes with correct data.",
    dep: ["device-memory-mapping","page-table-objects","frame-objects"]
  },
  "bus-enumeration": {
    s: "A server that discovers devices on buses, reads their identifiers and resource requirements, and tells the resource managers which drivers should receive which regions and interrupts.",
    d: "At startup it walks the bus configuration space, or reads a firmware table, to list each device with its vendor and class, register ranges and interrupt lines. It consults a table matching devices to driver components, then asks the resource managers for the matching device frames and interrupt handlers and passes them to the driver instance. Hot-plug events arrive as interrupts, causing a new driver to start. It is trusted with the whole device map. The difficulty is firmware tables that are wrong, and devices that share interrupt lines.",
    k: ["Enumeration in one server versus per-bus servers: one server gives a single device tree, but is a larger trusted component; per-bus servers limit what each can see.", "Driver matching by table versus by driver self-registration: tables are auditable, but self-registration allows drivers to appear without a central change."],
    p: ["A device reporting a false identifier gets the wrong driver, which then misprograms it.", "A hot-plugged device that fails to start leaves its resources allocated and unrecoverable."],
    v: "Boot a machine with a known device set and confirm the enumerated list, regions and interrupts match the hardware's documentation, and that each driver received only its own resources.",
    dep: ["device-memory-mapping","irq-control","untyped-allocator"]
  },
  "virtual-device-rings": {
    s: "Shared-memory request and response rings between a client and a driver, following a standard layout so that virtualized or native drivers can be interchanged.",
    d: "Rather than call the driver for every operation, a client posts descriptors to a ring in shared memory and signals a notification. The driver consumes them, performs the device operation, posts a completion and signals back. Both native drivers and the virtual devices exposed to guests use the same ring format. Batching reduces the notifications and kernel entries per operation. The difficulty is that the shared memory is written by an untrusted peer, so the consumer must validate each descriptor, and flow control must handle a full ring.",
    k: ["Standard ring layout versus custom per device: a standard layout lets one client library work with many drivers, but may not fit every device's needs.", "Zero-copy buffers versus copying into the driver: zero-copy removes per-byte cost, but exposes client memory to a possibly faulty driver."],
    p: ["A driver that dereferences a descriptor address without checking it lies within the shared region can be made to read its own memory.", "A ring that fills while the consumer is waiting on a missed notification stalls permanently."],
    v: "Send a million block requests through a ring with random descriptors injected to be invalid, and confirm every valid request completes exactly once and every invalid one is rejected without a driver fault.",
    dep: ["shared-memory-channels","notification-object"]
  },
  "driver-restart": {
    s: "Detecting a failed driver, tearing down its resources, starting a fresh copy, and reinitializing the device, with clients retrying or being told the operation failed.",
    d: "A supervisor learns of failure through the fault endpoint, a missed heartbeat or a client report. It revokes the driver's capabilities, which unmaps its device memory and ends its DMA window, resets the device, starts a new instance with fresh capabilities, and informs the name server so clients can reconnect. In-flight requests are either replayed, if idempotent, or completed with an error. This is the main practical payoff of putting drivers in user space. The difficulty is state: a device or a client protocol that cannot be reset cleanly leaves an unrecoverable hang.",
    k: ["Transparent restart with replay versus fail and let clients retry: replay hides failures from applications, but is unsafe for operations that cannot be repeated.", "Restart on first fault versus after a diagnosis: immediate restart maximizes availability, but can loop on a persistent fault."],
    p: ["Restarting a driver whose device was left mid-operation without a hardware reset makes the new instance misread device state.", "A crash loop at full speed consumes all CPU and fills the logs."],
    v: "Inject a fault into a running block driver during a stream of writes, and confirm the supervisor restarts it within its target time, clients see either completion or a clear error, and the data written is consistent.",
    dep: ["driver-process","revocation","fault-reporting","service-registry"]
  },
  "name-server": {
    s: "A server holding a directory from service names to endpoint capabilities, from which authorized clients obtain the capability to talk to a given service.",
    d: "Services register their endpoint capabilities under names. A client sends a lookup request and gets back a send capability, which the server copies and often badges for the client. The name server decides whether a lookup is allowed, based on the caller's badge and a policy table. Because there is no global namespace in the kernel, this server and the initial capabilities are the only way to find anything. It is on the path of every new connection. The difficulty is its trust: whoever controls it controls which service a client reaches.",
    k: ["Central name server versus capabilities passed at setup only: a server allows dynamic lookup, but is a trusted component; static passing has no such component but cannot discover new services.", "Names handed out as endpoint capabilities versus as references to a broker: direct capabilities are fast after the first lookup, but cannot be revoked per use without revoking the endpoint."],
    p: ["A lookup that returns the same unbadged capability to every client prevents the service from telling clients apart.", "A registration from an untrusted component under an existing name hijacks that service."],
    v: "Register a service, look it up from an authorized client and an unauthorized one, and confirm the first receives a working badged capability and the second receives a denial.",
    dep: ["endpoint-object","badged-endpoints","delegation"]
  },
  "service-registry": {
    s: "The record of which services currently exist, their state and their dependencies, kept by supervisors so clients can find a live instance and be told when it changes.",
    d: "Where the name server maps a name to a capability, the registry tracks liveness: which instance is current, whether it is ready, and who depends on it. Services register when they start and are removed when they die or are revoked. Clients can subscribe for notification of restarts, so they can reconnect. The registry also feeds startup ordering and restart policy. It is hard because the information goes stale: an entry may name a service that died a moment ago, and clients must tolerate that.",
    k: ["Registry that pushes changes versus clients that poll: pushing makes reconnection fast, but the registry must hold per-client state and signal capabilities.", "Combined with the name server versus separate: combining saves a hop, but makes one component do directory and lifecycle roles."],
    p: ["A registry entry kept after a crash sends clients to a dead endpoint and they block.", "Notifications to a client that is not waiting coalesce, so it misses a restart."],
    v: "Kill a registered service and confirm subscribers are notified, the entry shows not ready, and after restart a new lookup returns a different endpoint than before.",
    dep: ["name-server","notification-object"]
  },
  "connection-broker": {
    s: "A service that sets up a communication channel between two components on request, creating endpoints or shared memory and delegating the matching capabilities to each side.",
    d: "A client asks the broker to connect it to a service. The broker checks policy, then creates what the connection needs: a badged endpoint for calls, shared frames for a ring, a notification pair for signaling. It passes one set of capabilities to the client and another to the server, and records the connection for later teardown. The server never sees a client's address space, and the client sees only its channel. The hard parts are cleanup when either side dies, and the broker's own authority, since it holds the ability to create channels between any two.",
    k: ["Broker creating channels per connection versus static channels created at boot: a broker supports dynamic clients, but holds broad authority and is a trusted component.", "Per-client shared memory versus a shared pool: per-client memory isolates clients, but cannot share capacity."],
    p: ["A connection not torn down when a client exits leaks endpoints, badges and shared frames.", "A broker that creates channels without checking policy lets any component connect to any service."],
    v: "Connect and disconnect 10,000 clients to a service and confirm the broker's object and slot counts return to baseline and a revoked client's capabilities no longer work.",
    dep: ["name-server","delegation","shared-memory-channels","quota-accounting"]
  },
  "interface-definition": {
    s: "A declarative language for describing a service's operations, argument types, capability parameters and error codes, from which stubs and documentation are produced.",
    d: "An interface file lists each operation with typed inputs and outputs, marks which arguments are capabilities or references into shared memory, and names the errors. It is the contract between client and server, shared by both builds. Tooling reads it to check compatibility between versions and to generate code. Because components are separate programs, possibly built and updated at different times, the definition is also what keeps them from disagreeing. The difficulty is evolving an interface without breaking existing clients.",
    k: ["Typed definitions versus an informal message protocol: typed definitions catch mismatches at build time, but need tooling and a versioning discipline.", "One interface per service versus several small ones: small interfaces let rights be split by purpose, but multiply capabilities to manage."],
    p: ["An interface that omits which arguments are capabilities leaves servers unprepared with slots to receive them.", "Changing the meaning of an existing operation without changing its identifier breaks old clients silently."],
    v: "Build a client from an old definition against a server built from a newer one, and confirm the version check detects the mismatch and refuses the connection.",
    dep: []
  },
  "namespace-per-domain": {
    s: "Giving each security domain its own view of names, so a component can look up only the services its domain has been granted and sees the same name map to different instances in different domains.",
    d: "Rather than one global directory, each domain receives its own name server instance or a filtered view. The same name, such as the storage service, can point at the shared filesystem for one domain and a private sandboxed copy for another. A component cannot attempt to open a service it is unaware of. The views are built from the policy at startup. The difficulty is administration across many domains, and making sure that a capability passed through IPC does not reveal a name the receiver should not know.",
    k: ["Private namespace per domain versus a global one with access checks: private namespaces hide existence, but multiply directories to maintain.", "Namespace built once at start versus modifiable at runtime: a static namespace is predictable, but domain changes require a restart."],
    p: ["Sharing a namespace capability between two domains for convenience merges their views permanently.", "A name that resolves differently by domain confuses debugging when a report cites only the name."],
    v: "From two domains, resolve the same service name and confirm they get different endpoints, and that a name not in a domain's view returns not found, not denied.",
    dep: ["name-server","domain-assignment"]
  },
  "capability-transfer-protocol": {
    s: "The agreed rules between a client and server for moving capabilities in messages: who prepares slots, who deletes, what happens on failure, and how ownership is tracked.",
    d: "Because the kernel only copies capabilities, the meaning is set by protocol. A server expecting a capability tells the kernel where to put it, and checks type and rights on arrival. It decides whether it keeps the capability for the life of a session or discards it. A client may lend a capability for one call, or give it to the server. Both sides also agree on the cleanup on disconnect. The difficulty is that a mismatch leaks slots, or leaves a capability alive past when the sender expected it to be gone.",
    k: ["Lend for one call versus transfer permanently: lending lets the client keep control and revoke, but the server cannot hold the capability across calls.", "Server validates type and rights on every receipt versus trusting the interface: validation prevents confused deputy errors, but costs a check on each message."],
    p: ["A server that stores a client's capability without checking its type can be invoked with the wrong object.", "A client that assumes the transfer was a move keeps using a slot that is now empty."],
    v: "Send capabilities of the wrong type, with too few rights, and with no free receive slot, and confirm the server rejects each with a documented error and holds no stray capability afterward.",
    dep: ["ipc-capability-transfer","delegation"]
  },
  "file-server": {
    s: "A user-level server that implements directories, files and metadata over a block device, offering open, read, write and mapping operations through IPC and shared memory.",
    d: "Clients send open and path operations as messages and receive a file handle capability or a session identifier. Data moves through shared buffers registered at open, so a read is a short message that names the buffer and range. The server talks to a block driver through a ring. It keeps its own caches and metadata in its own memory, funded by its quota. Being a process, it can be replaced, run per-domain, or crash without harming the kernel. The hard part is the cost of crossing servers for every file operation, and consistency when the server dies midway.",
    k: ["Filesystem as a server versus a library in each application: a server shares caches and enforces permissions centrally, but adds IPC to each operation.", "Handles as capabilities versus server-side numbers: capabilities can be delegated and revoked by the kernel, but cost a slot each."],
    p: ["A server that blocks on a slow disk request for one client stalls all others unless it has multiple threads.", "A path lookup that follows links without limits lets one client keep the server busy indefinitely."],
    v: "Write a file through the server, kill and restart it, then read the file back and confirm the data matches the last acknowledged write and the directory is consistent.",
    dep: ["block-cache","file-handle-capabilities","shared-memory-channels","volume-manager"]
  },
  "block-cache": {
    s: "A user-level cache of disk blocks held in the file server's or a separate cache server's memory, with write-back policy and eviction decided by that server.",
    d: "The cache keeps recently used blocks in frames from its own quota, serving repeated reads without disk access. Writes are buffered and flushed on a schedule or on sync. Because eviction is user-level policy, the cache can be sized per workload and aware of file semantics, such as read-ahead for sequential files. It sits between file logic and the block driver. The hard parts are keeping memory use bounded and ordering writes so that crash recovery finds a consistent state.",
    k: ["Write-back versus write-through: write-back is much faster, but loses recent data on a crash without journaling.", "Cache in the file server versus a shared cache server: one process is simpler and faster, but several filesystems cannot share capacity."],
    p: ["Cache memory growing without a quota cap pushes the server over its allowance and fails requests.", "Flushing dirty blocks out of dependency order leaves metadata pointing at unwritten data after a crash."],
    v: "Read the same file twice and confirm the second pass makes no disk requests, then cut power mid-write and confirm recovery finds a state matching a prefix of the acknowledged writes.",
    dep: ["quota-accounting","virtual-device-rings"]
  },
  "volume-manager": {
    s: "A server that presents partitions or logical volumes over physical disks, mapping volume addresses to device addresses and handing each filesystem only the range it owns.",
    d: "It reads partition tables, builds volumes, and offers each as a block interface through its own endpoint or ring. A filesystem sees a volume starting at zero. It can also implement mirroring, striping or encryption layers, each as a stackable server. By giving a filesystem only its volume, a bug in it cannot touch another volume. The difficulty is that every layer adds a hop, and layers must preserve ordering and flush semantics that the filesystem above depends on.",
    k: ["Volume layer as a separate server versus inside the filesystem: separate servers allow stacking and isolation, but add a hop per request.", "Encryption in the volume layer versus the file layer: volume-level encryption covers all data uniformly, but cannot protect per-file keys."],
    p: ["A layer that reorders writes without honoring flush requests breaks the filesystem's crash guarantees.", "Mapping errors at the volume boundary let a filesystem read another volume's blocks."],
    v: "Create two volumes on one disk, write a pattern to each from separate filesystems, and confirm neither can read or alter the other's blocks, and that offsets map as configured.",
    dep: ["virtual-device-rings","driver-process"]
  },
  "file-handle-capabilities": {
    s: "Giving each open file to a client as a capability to a server-side object, so access is delegated, narrowed or revoked through the same mechanisms as any other authority.",
    d: "On open, after checking permissions, the server mints a badged endpoint capability tied to that file and mode, and returns it. Read and write requests on it carry no path or identity, only the badge, so there is nothing to forge. A client can pass the handle to another component, and the server does not have to know. Revoking it closes the file. This replaces ambient user identifiers with explicit authority. The difficulty is tracking the number of outstanding handles, since each uses server state, and defining what closing means when a handle was passed on.",
    k: ["Capability handles versus identifier-based access control checks: capabilities cut confused deputy errors and allow delegation, but make auditing who can access a file harder.", "Handle per open versus per file: per-open handles carry their own mode and offset, but cost more server state."],
    p: ["A handle passed to an untrusted helper keeps working after the user expected access to end.", "Each open handle held by a client that never closes it leaks server memory."],
    v: "Open a file read-only, pass the handle to a second component, have it try to write, and confirm the write is refused; then revoke the handle and confirm reads fail.",
    dep: ["badged-endpoints","delegation","file-server"]
  },
  "journaling-and-recovery": {
    s: "Logging metadata changes before applying them, so that after a crash or a server restart the filesystem replays or discards the log and returns to a consistent state.",
    d: "Before changing directory or allocation structures, the server writes the intended change to a log region, flushes it, then applies it in place. At startup, it scans the log, replays completed entries and ignores partial ones. Since the file server is a restartable process, this is not only about power loss but about routine server restarts. Flush barriers have to pass through the volume layer and the driver to reach the disk. The difficulty is ordering and the cost of waiting for flushes.",
    k: ["Metadata-only journaling versus data journaling: metadata-only is much cheaper and keeps structure consistent, but file contents can be stale after a crash.", "Replay at start versus background check: replay is quick and bounded, but a damaged log needs a full check."],
    p: ["A flush that returns early because a lower layer ignored the barrier makes the log useless.", "A log too small for a large operation forces it to stall or fail partway."],
    v: "Crash the file server at random points during a directory-heavy workload 1,000 times, and confirm after each restart that the checker finds a consistent filesystem with no lost acknowledged operation.",
    dep: ["block-cache","file-server"]
  },
  "network-stack-server": {
    s: "A server implementing the protocol layers, such as IP, TCP and UDP, above a network driver, with its own memory and threads, offering sockets to clients over IPC.",
    d: "Packets arrive from a NIC driver through a ring in shared memory. The stack demultiplexes them, runs the protocol state machines, and delivers data into the client's receive buffer, signaling by notification. Transmit goes the reverse way. Because it is a user-level process, several instances can run, for example one per security domain or one per core, and it can be restarted. It uses its own timers and buffer pools. The hard part is the per-packet cost of crossing processes, and handling a restart without dropping every connection.",
    k: ["Stack as a shared server versus a library linked into each application: a server gives one place for policy and shared state, but adds an IPC hop per socket operation.", "Stack instance per domain versus one shared: per-domain instances isolate traffic and failures, but use more memory."],
    p: ["A stack restart drops all connection state, resetting every client's connections.", "Handling packets on one thread makes a single flood starve all sockets."],
    v: "Open a thousand TCP connections through the stack, transfer data at line rate, kill and restart the stack, and confirm clients detect the loss as a connection reset, not corrupted data.",
    dep: ["packet-buffer-pools","nic-driver-interface","socket-protocol"]
  },
  "packet-buffer-pools": {
    s: "Preallocated shared-memory regions holding packet buffers, passed by reference between NIC driver, network stack and applications to avoid copying.",
    d: "A pool is a set of frames divided into fixed-size buffers, mapped into the driver, the stack and sometimes the client with differing rights. Components pass buffer indices through rings, not data. Ownership moves with the index, so each buffer has one owner at a time, and rights prevent a producer from modifying a buffer after handing it over. Pools are funded from quota. The difficulty is leaks: a component that dies holding buffers strands them, and a pool that empties drops packets.",
    k: ["Shared pools with zero copy versus copying into each component: zero copy gives line rate, but mapping rights and ownership rules must be exact.", "One pool per interface versus per client: per-client pools isolate exhaustion, but fragment memory."],
    p: ["A buffer returned to the pool while the NIC still holds its address is overwritten by incoming data.", "A client holding buffers without releasing them starves the pool for everyone."],
    v: "Run a sustained packet flood while killing the client process, and confirm all its buffers return to the pool within a bounded time and the count at rest equals the pool size.",
    dep: ["shared-memory-channels","frame-objects","quota-accounting"]
  },
  "socket-protocol": {
    s: "The message protocol between an application and the network server for creating, binding, connecting, sending and receiving on sockets, with shared buffers for data.",
    d: "A client sends control requests, such as connect and listen, as short messages, and gets a socket handle capability. Data moves through a pair of rings in shared memory, one for transmit and one for receive, with notifications for readiness. Readiness waiting by many sockets is implemented over notifications. Compatibility layers can translate standard socket calls into this protocol. It is hard because the semantics of blocking, partial writes and close must be defined across a process boundary, with a server that may restart.",
    k: ["Rings and notifications per socket versus a call per send: rings batch and avoid per-packet calls, but cost memory per socket.", "Compatibility library versus native interface: a compatibility library runs existing programs, but hides the cost and failure modes of the crossing."],
    p: ["A client that sends while the ring is full and does not wait blocks forever if the notification is missed.", "A socket handle used after the server restarted refers to nothing and fails confusingly."],
    v: "Run a client that sends one gigabyte through a loopback socket with random pauses, and confirm the received bytes match exactly in order and the client survives a server restart with a defined error.",
    dep: ["shared-memory-channels","badged-endpoints","notification-object"]
  },
  "nic-driver-interface": {
    s: "The ring-based contract between a network driver and the stack: how receive buffers are posted, completions reported, and link and offload settings exchanged.",
    d: "The stack posts empty buffers to a receive ring and filled transmit buffers to a transmit ring. The driver fills or sends them and returns the indices with a status. A control endpoint carries link state, addresses and offload requests such as checksums. Because the driver is a separate process with an IOMMU window, it can touch only buffers in the pool. Replacing the driver for different hardware needs no stack change. The difficulty is matching the hardware's batching and interrupt moderation to the latency and CPU goals.",
    k: ["Polling rings versus interrupts per packet: polling gives the highest throughput and lowest per-packet cost, but occupies a core.", "Hardware offloads exposed to the stack versus done in software: offloads save CPU, but spread hardware quirks into the stack."],
    p: ["A driver that advertises an offload it implements incorrectly corrupts packets in ways the stack cannot detect.", "Interrupt moderation set too high adds latency that breaks time-sensitive traffic."],
    v: "Swap one NIC driver for another that implements the same ring interface and confirm the stack runs unchanged and passes the same throughput and loss test.",
    dep: ["virtual-device-rings","driver-process","packet-buffer-pools"]
  },
  "packet-filter": {
    s: "A component that inspects or rewrites packets between the driver and the stack or between domains, enforcing which flows may pass according to policy.",
    d: "Placed as its own server on the path, the filter receives packet descriptors, evaluates rules on headers, and passes, drops or modifies them. It sits between untrusted and trusted domains, such as between the driver and a stack inside a sandbox. Because it holds the only capability that connects the two sides, it is the enforcement point and can be small. Rules come from the policy server and can be updated at runtime. The difficulty is throughput: each packet crosses an extra hop, and rule sets that grow slow the whole path.",
    k: ["Separate filter server versus filtering inside the stack: a separate server is small and enforces even over a compromised stack, but adds a hop per packet.", "Rules compiled ahead versus interpreted per packet: compiled rules are fast, but updating them is more complex."],
    p: ["A filter that parses headers without bounds checks becomes the attack surface for the traffic it protects against.", "Rules updated non-atomically let packets through during a change."],
    v: "Send traffic matching and not matching a rule set through the filter, and confirm only permitted flows arrive at the stack, with drop counters matching the number of blocked packets.",
    dep: ["network-stack-server","packet-buffer-pools","security-policy-server"]
  },
  "security-policy-server": {
    s: "A user-level service that decides which security domains may obtain which capabilities, and answers or enforces those decisions when other servers ask.",
    d: "The kernel only checks that a capability is held. This server holds the rules about what should be held: which domains may talk to which services, and with what rights. It is consulted at setup, by the root task and brokers, and at runtime by servers that need a decision for a new request. It can be small and static, or load policy at runtime. Because its decisions turn into capability grants, mistakes in it become real authority. The hard part is expressing intent in rules that are both complete and checkable.",
    k: ["Policy decided centrally versus by each server: central policy is consistent and auditable, but is a trusted component and a bottleneck.", "Decide at grant time versus at every use: grant-time decisions are cheap and enforced by capabilities, but cannot respond to changing conditions without revocation."],
    p: ["A policy rule that is more permissive than intended becomes a standing capability grant that persists until revoked.", "A server that caches decisions after policy changes keeps enforcing the old policy."],
    v: "Change a rule to deny a service to a domain, then confirm the existing capability is revoked and a new lookup from that domain is refused, and the audit log shows both.",
    dep: ["domain-assignment","delegation","revocation"]
  },
  "domain-assignment": {
    s: "The mapping from each component to a security domain, which determines its label, namespace, quotas and the policy rules that apply to it.",
    d: "A domain groups components that trust each other or share a purpose, such as a driver domain, a network-facing domain and a user application domain. Assignment is part of the system description, so it is known at build time, or recorded by the process server when a component starts. Brokers and servers use the badge or the namespace to learn the caller's domain. Domains are the unit at which information flow is analyzed. The difficulty is granularity: too coarse a domain hides risk, too fine multiplies the rules.",
    k: ["Few coarse domains versus a domain per component: coarse domains are easy to administer, but one compromise reaches more; fine domains limit damage but multiply rules.", "Static assignment versus assigned at runtime: static is auditable, but dynamic workloads need a process server to label new components safely."],
    p: ["A component placed in a high-trust domain for convenience brings its whole attack surface with it.", "Domain labels carried in badges but never checked by the server that receives them provide no protection."],
    v: "List components with their domain, then check that each one's capabilities and namespace entries are exactly what the policy permits for that domain, with no extras.",
    dep: ["badged-endpoints","initial-capability-set"]
  },
  "access-control-checks": {
    s: "Checks that a server makes, on top of the kernel's capability check, to decide whether this client may do this operation on this resource.",
    d: "Holding an endpoint capability only means a client may send a message. The server then decides what it will do, using the badge and its own tables: owner, mode, domain, quota. For a file server this is permission bits; for a network stack it is port ownership. Servers can ask the policy server for a decision on novel cases. Most checks are local and fast, and the badge cannot be forged. The difficulty is consistency across servers and avoiding the confused deputy problem where a server uses its own authority on a client's behalf.",
    k: ["Authority carried only by capabilities versus extra checks in servers: capabilities alone are simple and strong, but cannot express rules that depend on attributes and context.", "Checks in each server versus a shared library: a shared library makes checks consistent, but a flaw in it affects every server."],
    p: ["A server that acts on a client-supplied path using its own broader rights lets the client reach files it should not.", "A check done at open and not on later operations misses a permission change."],
    v: "Have two clients with different badges request the same operation on one resource, and confirm the one without permission is refused and the one with it succeeds, as recorded in the audit log.",
    dep: ["badged-endpoints","domain-assignment","audit-log-server"]
  },
  "information-flow-policy": {
    s: "Rules about which domains may influence or learn from which others, enforced by controlling which capabilities connect them, and analyzed on the resulting graph.",
    d: "Flow rules describe, for example, that data from a high-sensitivity domain must not reach the network. Because all communication needs a capability, the allowed flows are exactly the edges of the capability graph plus timing and shared-resource channels. The policy is checked against the assembly description before boot, and for isolation proofs the kernel guarantees that no other flows exist. Declassifying through a trusted guard is the exception. The hard part is covert channels: shared caches, timers and scheduling can carry information the capability graph does not show.",
    k: ["Capability-graph enforcement versus label checks at runtime: graph enforcement is static, cheap and provable, but cannot express data-dependent decisions.", "Time-partitioned scheduling to close timing channels versus shared scheduling: partitioning blocks leaks, but wastes capacity and constrains design."],
    p: ["A shared driver or server connecting two domains becomes an unintended channel between them.", "Considering only direct messages ignores shared caches and time as channels."],
    v: "Check a candidate assembly against its flow policy with the analysis tool, and then attempt from the low domain to read a high-domain secret through every endpoint it holds, confirming none succeeds.",
    dep: ["isolation-proofs","assembly-description","domain-assignment"]
  },
  "sandbox-construction": {
    s: "Building a restricted environment for untrusted code by creating its address space, capability space and scheduling context with only a chosen set of capabilities and a quota.",
    d: "To run an untrusted program, a supervisor creates a fresh capability space, copies in a minimal set: a way to ask for memory within the quota, a connection to a few named services, and nothing else. Its fault handler is the supervisor. The program cannot even name other services. Because the sandbox is made from the same kernel objects as every process, no special mechanism exists; the strength comes from how little is granted. The difficulty is deciding the minimal set and handling a program that legitimately needs more later.",
    k: ["Whitelisting capabilities versus filtering system calls: capability whitelisting is simple and the default is no access, but each needed service must be granted explicitly.", "Supervisor mediates later requests versus a fixed grant: mediation allows growth on demand, but makes the supervisor a trusted gatekeeper."],
    p: ["A sandbox given a capability to the process server can spawn unrestricted children.", "A supervisor that dies leaves the sandbox blocked on its fault endpoint indefinitely."],
    v: "Run a hostile test program in the sandbox that probes every capability slot and tries to reach each other service, and confirm that only the granted services answer and its memory use stops at the quota.",
    dep: ["process-server","initial-capability-set","quota-accounting"]
  },
  "audit-log-server": {
    s: "A server that receives records of security-relevant events, such as capability grants, denials and restarts, from other components and stores them where the reporting components cannot alter them.",
    d: "Components send events over a write-only endpoint: they hold a capability that can append, but not read or delete. The server timestamps and stores each record, possibly to a separate storage server, and exposes read access only to an auditor domain. The root task, brokers and policy server are the main sources. Logging is deliberately outside the kernel, so the kernel stays small. The difficulty is volume and loss: a flood of events can fill the log, and a compromised sender can hide by not reporting.",
    k: ["Append-only endpoint versus shared log memory: an endpoint prevents tampering by senders, but each event costs a call.", "Synchronous logging versus asynchronous: synchronous guarantees the record exists before the action completes, but slows the action."],
    p: ["An audit log that blocks senders when full lets an attacker stall the system by flooding it.", "Relying on the audited component to report its own misbehavior misses exactly the cases that matter."],
    v: "Trigger a denied lookup, a grant and a revocation, and confirm each appears in the log with the right domain and time, and that the reporting component cannot read or modify earlier entries.",
    dep: ["endpoint-object","badged-endpoints"]
  },
  "attestation-and-measured-boot": {
    s: "Recording hashes of the kernel, root task and initial components as they load, so a remote or local verifier can check the system started from known code.",
    d: "Each stage measures the next before running it, extending a value kept in a hardware root of trust. The kernel image and the system image are measured by the boot loader, and the root task measures what it starts. An attestation service signs these measurements with a key bound to the hardware, on request. A small kernel and a static system description keep the measured set small and meaningful. The hard part is that the measurement only proves what was loaded, not that it behaves, and dynamic components make the set harder to reason about.",
    k: ["Measure everything including dynamic components versus the initial system only: full measurement is stronger, but the set of valid values becomes large.", "Local policy decision on measurements versus remote verification: local decisions work offline, but a compromised system can mislead itself."],
    p: ["Verifying only a hash of the kernel while the root task is unmeasured proves nothing about what authority exists.", "A measurement made before a component's configuration loads misses the configuration that determines its behavior."],
    v: "Boot the system with one byte of the root task image changed and confirm the attestation report shows a different measurement that a verifier rejects against the expected value.",
    dep: ["bootloader-handoff","root-task","trusted-base-assumptions"]
  },
});
