// Details for the unikernel plate, part 2: application, compatibility, network, storage.
ATLAS.details("unikernel", {
  "application-code": {
    s: "The one program the image exists to run, linked directly with the libraries it uses and holding all the business logic, request handling and state.",
    d: "Application code calls library OS functions directly and owns everything above them: protocol handling, request logic and in-memory state. With no process boundary, it can reach into library internals, tune buffers and bypass layers, which is both the performance advantage and the hazard. It must be designed to be stateless or to keep state externally, since instances are replaced. It also must handle all failure itself, with no supervisor to restart it.",
    k: ["Writing to native interfaces vs to a compatibility layer: native interfaces are faster and smaller; compatibility keeps existing code and developer skills usable.", "Stateless instances vs state held in the image: stateless instances replace easily; local state is faster but lost on every redeploy."],
    p: ["Code reaches into library internals, and a library upgrade breaks it in a way the compiler does not report.", "An unhandled error ends the single program, and the whole machine halts with no supervisor to restart it."],
    v: "Run the application's functional test suite against the booted image through its network interface, then kill it mid-request and confirm the launcher or orchestrator replaces it with no manual step.",
    dep: ["native-library-api","c-library-shim","socket-layer"]
  },
  "language-runtime": {
    s: "The managed runtime, such as a garbage-collected virtual machine or interpreter, that some images carry so applications can be written in higher-level languages.",
    d: "The runtime provides memory management, threads, I/O and the standard library on top of the library OS, usually through the C library shim or a thin native layer. Because the OS below it is small, the runtime can use the hypervisor's memory directly and tune garbage collection to the fixed memory ceiling. Its size dominates the image. Hard parts are porting runtime assumptions about files, signals and processes, and the time spent starting the runtime itself.",
    k: ["Full runtime with a compatibility layer vs a purpose-built minimal runtime: full runtimes run existing programs; minimal ones start faster and are smaller but run fewer.", "Ahead-of-time compiled application vs interpreted: compiled starts faster and is smaller; interpreted allows dynamic loading, which images otherwise lack."],
    p: ["The runtime's collector assumes more memory than the instance has and the image is killed by the ceiling.", "Runtime startup dominates, and the claimed millisecond boot becomes seconds."],
    v: "Boot the image and print runtime version and heap limits. Run an allocation-heavy test and confirm collection keeps memory under the configured ceiling, and measure boot to first request served.",
    dep: ["c-library-shim","heap-allocator","preemptive-scheduler"]
  },
  "entry-point": {
    s: "The function where control passes from the platform and library initialization to the application, in place of the init system and process launch of a conventional system.",
    d: "After the boot stub and library initialization finish, the platform calls the application's main function with arguments built from boot parameters. There is no init system, no service manager and no loader. If main returns, the image shuts down. The entry point is where configuration is read, listeners are opened and the main loop starts. Hard parts are the order of library initialization before it and what happens to threads and listeners when it returns.",
    k: ["main returning ends the machine vs keeping the machine alive: ending is simple and clean for one-shot jobs; services must keep scheduling forever.", "Arguments from boot parameters vs a separate configuration step: arguments are immediate; a separate step handles larger or sensitive data."],
    p: ["A library that is initialized after main starts leads to calls into uninitialized state.", "Main returns after spawning threads, and the machine powers off before they finish."],
    v: "Boot with a known argument list and confirm main receives them, and that returning from main produces a clean power-off with the expected exit status reported to the launcher.",
    dep: ["library-init-ordering","boot-parameters"]
  },
  "event-loop": {
    s: "The single loop that waits for network, timer and device events and dispatches handlers, the typical structure of a unikernel service with one thread.",
    d: "The loop polls readiness for sockets and timers, then runs the associated callbacks to completion, yielding to the platform only when idle so the virtual CPU can halt. With cooperative scheduling there is no preemption, so a long handler delays everything. The design avoids locks, context switches and most per-connection memory, which is why it suits small images. Hard parts are keeping handlers short, handling back-pressure and spreading across several cores if one loop is not enough.",
    k: ["Single-threaded event loop vs thread per connection: the loop uses little memory and no locks; threads simplify blocking code but cost stacks and switches.", "One loop per core vs a shared loop: per-core loops scale without sharing; a shared loop is simpler but needs locking."],
    p: ["A handler does blocking work or a long computation and every connection stalls.", "Timers are checked only when I/O arrives, so an idle service misses deadlines."],
    v: "Open thousands of idle connections and confirm memory and CPU stay low. Then run one deliberately slow handler and measure how long other connections are delayed, verifying that figure is bounded as designed.",
    dep: ["io-readiness-polling","cooperative-scheduler","timers-and-clock"]
  },
  "application-configuration": {
    s: "How the application gets its tunable settings: compiled in, passed at boot, or fetched at start, with a defined way to validate them before serving.",
    d: "Settings include listening ports, upstream addresses, limits and feature switches. They arrive from build configuration, boot parameters or a configuration service, are parsed and validated once at start and held in memory. Changing them means a new instance, not an edit. Because the image cannot be logged into, validation must happen before the listener opens, and the effective configuration should be logged with secrets removed so operators can see what actually ran.",
    k: ["Immutable configuration per instance vs live reload: immutable configuration is simple to reason about; live reload avoids a restart but adds code and states.", "Compiled defaults vs required settings: defaults let the image boot anywhere; required settings avoid accidentally running with the wrong ones."],
    p: ["The effective configuration is never logged, so a wrong setting is invisible during an incident.", "Live reload is half-applied when a later value fails validation."],
    v: "Launch with each setting varied, and confirm the application reports the effective values and behaves accordingly. Supply an invalid value and confirm start is refused before any port is opened.",
    dep: ["boot-time-configuration","boot-parameters"]
  },
  "shutdown-handling": {
    s: "The orderly stop of an image on a host request: stop accepting work, finish or drop in-flight requests, flush data and power off the virtual machine.",
    d: "With no signals in the usual sense, the hypervisor asks for shutdown through a virtual power button, a host-guest message or an interrupt, and the image must translate that into application stop logic. The service closes listeners, drains connections within a deadline, flushes logs and metrics, and then requests power-off. If it does not exit in time, the launcher terminates it. Orderly shutdown matters for rolling updates. It is hard to test because it is rare and timing-dependent.",
    k: ["Graceful drain with a deadline vs immediate stop: draining avoids failed requests; stopping at once frees capacity faster and simplifies code.", "Handling the host request in the library OS vs the application: a library handler is uniform; the application knows what must be flushed."],
    p: ["The host's shutdown request is never wired up, so every stop is a hard kill and in-flight work is lost.", "The drain deadline is longer than the orchestrator's kill timeout and is never honored."],
    v: "Send a shutdown request during active traffic and confirm in-flight requests complete, new connections are refused, final logs arrive at the collector, and the instance powers off within the deadline.",
    dep: ["host-guest-channel","event-loop","structured-logging"]
  },
  "native-library-api": {
    s: "The direct programming interface to library OS components, such as sockets, buffers and timers, that bypasses POSIX for speed and a smaller image.",
    d: "Native interfaces expose the library OS in its own terms: handing a packet buffer to the stack without copying, registering a callback for a timer, or reading directly from a device queue. They avoid the translation, locking and file descriptor machinery of the compatibility layer. They tie the application to one library OS, and each library's interface is a smaller, less documented commitment than POSIX. The payoff is measured in throughput, latency and size.",
    k: ["Native interface vs standard interface: native gives zero-copy and smaller code; standard keeps the application portable across systems.", "Callback style vs blocking calls: callbacks suit event loops and avoid stacks; blocking calls are easier to write and need threads."],
    p: ["An application written to one library OS's native interface cannot be moved when that project changes direction.", "A callback that blocks on a lock held by the stack deadlocks the only thread."],
    v: "Write the same echo service against the native interface and the compatibility layer. Measure throughput, latency and image size, and confirm the native version is smaller and faster as expected.",
    dep: ["network-device-layer","packet-buffer-pool","timers-and-clock"]
  },
  "c-library-shim": {
    s: "A C standard library implementation that runs inside the image and translates standard calls such as memory, string, time and I/O into library OS operations.",
    d: "It supplies the functions existing programs expect: allocation, string handling, formatted I/O, time, random numbers, and file and socket calls routed to the other shims. Where an operation has no meaning, such as fork or user lookups, it returns an error or a stub. Choosing a library trades size for completeness. It is the point at which most existing software becomes portable, and also where subtle differences, such as locale data or thread safety, appear.",
    k: ["A small library vs a full-featured one: small keeps images tiny but breaks programs using obscure features; full runs more software at a larger size.", "Implementing calls natively vs forwarding to a syscall layer: native is faster; forwarding is uniform and lets binaries run unmodified."],
    p: ["A stubbed function silently returns success, so the application proceeds as though an operation happened.", "Locale and time zone data are absent and formatted output differs from the original platform."],
    v: "Run a conformance test of the standard library against the shim and list every function that is stubbed or returns not-implemented. Compare output of representative programs with a conventional system.",
    dep: ["heap-allocator","syscall-translation","timers-and-clock"]
  },
  "syscall-translation": {
    s: "A table that maps system call numbers and arguments from unmodified programs to library OS functions, turning the usual kernel boundary into ordinary calls.",
    d: "Code built for a conventional OS issues system call instructions or calls wrapper functions. The translation layer intercepts them, either by providing the wrappers at link time or by handling the trap instruction at run time, and dispatches to implementations. Covered calls number in the tens or low hundreds; the rest return an error. Behavior is the hard part: edge cases of flags, error codes and blocking semantics must match what programs rely on. Trapping costs some speed that linked wrappers avoid.",
    k: ["Link-time wrappers vs run-time trapping: wrappers are fast and need source or object files; trapping runs prebuilt binaries but costs cycles on every call.", "Broad coverage vs a small tested set: broad runs more software; a small set is easier to verify and has less to defend."],
    p: ["An unimplemented call returns a generic error and the program takes an untested fallback path.", "Subtle differences in error numbers cause correct programs to misbehave."],
    v: "Run a call-tracing test harness over target applications to list the system calls they use. Confirm each used call is implemented and returns the same results as a conventional system for a set of cases.",
    dep: ["c-library-shim"]
  },
  "thread-api-shim": {
    s: "An implementation of the standard threading interface, covering threads, mutexes, condition variables and thread-local storage, over the library OS scheduler.",
    d: "Programs call create, join, lock and wait functions; the shim maps them onto scheduler threads and synchronization primitives. Thread-local storage needs a per-thread area and a register or lookup to find it. On a single-core cooperative scheduler, many operations become trivial, while a preemptive multicore scheduler needs real atomics and wakeups. Difficulties include cancellation, signals mixed with threads, and subtle ordering guarantees that programs depend on.",
    k: ["Full threading semantics vs a cooperative approximation: full semantics run existing multithreaded code; an approximation is smaller but can deadlock programs that assume preemption.", "Real thread-local storage vs emulation by lookup: real storage is fast; emulation is portable and slower."],
    p: ["Code relying on preemption spins on a flag forever under a cooperative scheduler.", "Thread cancellation is unsupported, so cleanup handlers never run."],
    v: "Run a multithreaded stress test with contended locks and condition variables for several minutes and confirm no deadlocks or lost wakeups, with identical results to a conventional system.",
    dep: ["preemptive-scheduler","synchronization-primitives"]
  },
  "socket-api-shim": {
    s: "The standard socket interface, with descriptors, connect, accept, send, receive and options, implemented over the library network stack.",
    d: "Socket calls become operations on stack connections. The shim maintains a descriptor table, blocking and non-blocking modes, and readiness polling through select-style calls. Because the stack is in the same program, data can move without crossing a kernel, but standard semantics require copying into caller buffers unless zero-copy extensions are used. Hard parts include supporting the full set of options, handling the many corner cases in shutdown and error reporting, and mapping descriptors shared with files.",
    k: ["Faithful semantics vs a subset: faithful behavior runs servers unchanged; a subset is smaller but breaks programs using less common options.", "Shared descriptor table with files vs separate tables: sharing matches expectations; separate tables are simpler but break code that mixes them."],
    p: ["A socket option is accepted but ignored, and timeouts or keepalives silently do not work.", "Descriptor numbers are reused while another thread still holds the old one."],
    v: "Run a server written for standard sockets against the image and exercise accept, non-blocking I/O, half-close and timeouts with a test client. Compare behavior with a conventional system.",
    dep: ["socket-layer","c-library-shim"]
  },
  "file-api-shim": {
    s: "The standard file interface, with open, read, write, seek and directory calls, mapped onto whichever filesystem the image has, or onto memory when there is none.",
    d: "The shim presents paths and descriptors to the program and routes them to an embedded filesystem, an in-memory tree or a shared mount. Special paths such as random and null devices, and process or system information files, are often synthesized. With no filesystem, calls return errors cleanly. Real programs touch a surprising number of files at startup: configuration, certificates and locale data. Finding them is the practical difficulty, along with permissions and timestamps that have no real owner.",
    k: ["Synthesized system files vs failing the opens: synthesizing keeps programs running; failing exposes unsupported behavior sooner.", "One virtual filesystem layer vs direct calls to one filesystem: a layer allows mixed mounts at a cost in code; direct calls are smaller."],
    p: ["A program silently fails to find a certificate bundle because it was not packaged into the image.", "Write calls to a read-only in-memory root appear to succeed and lose data on exit."],
    v: "Trace file opens made by the application during startup, then boot the image and confirm every opened path exists or is intentionally absent, and that written data persists where expected.",
    dep: ["embedded-filesystem","ramdisk-image","c-library-shim"]
  },
  "process-api-stubs": {
    s: "Placeholder implementations of process creation, signals, users and groups, which cannot exist in a single-program image, so they fail in defined ways.",
    d: "Calls such as fork, exec, wait, kill, getuid and setuid have no meaning when there is one program and one privilege level. Stubs return fixed values, such as a single user and process identifier, or errors for creation. Some programs rely on process creation for concurrency or isolation and cannot be ported without change. Others only query identity and run fine. Choosing the stub behavior is a compatibility decision, and a wrong choice makes software appear to work while it does not.",
    k: ["Return errors vs return fake success: errors are honest and help porting; fake success runs more programs but hides unsupported behavior.", "Emulating fork with threads vs refusing it: emulation runs some legacy servers; refusal avoids semantics that cannot be made correct."],
    p: ["A server that forks a worker per request gets an error and drops every connection.", "A stubbed permission check always succeeds, so the application believes an access control passed."],
    v: "Call each stubbed function from a test program and compare results with the documented stub behavior. Run the target application and confirm it takes the intended code path.",
    dep: ["c-library-shim"]
  },
  "binary-compat-loader": {
    s: "A loader that reads an existing executable file and runs it inside the image, mapping its segments and routing its system calls to the translation layer.",
    d: "Instead of recompiling, the image carries a loader for a standard executable format. It maps the program's segments into the single address space, builds the initial stack with arguments and environment, and starts it with system calls trapped and translated. This allows prebuilt programs to run, at a cost: the image gains a loader, the application is no longer linked into the image, and cross-layer optimization is lost. It narrows the gap with containers while keeping a single-program virtual machine.",
    k: ["Loading unmodified binaries vs recompiling against the library OS: loading is easiest for adoption; recompiling gives smaller, faster and more analyzable images.", "Relocating into the shared space vs reserving fixed addresses: relocation is flexible; fixed addresses are simple but can collide."],
    p: ["A binary uses an instruction or call the translation layer does not support, and fails only on a rare path.", "Loaded code is mapped writable and executable and escapes the hardening applied to the rest of the image."],
    v: "Run an unmodified prebuilt program in the image and compare its output and exit status with a conventional system. Confirm its memory mappings carry the same permissions as natively linked code.",
    dep: ["syscall-translation","dynamic-linking-support","static-memory-map"]
  },
  "dynamic-linking-support": {
    s: "Run-time loading of shared libraries and resolution of symbols, which many existing programs need and which a statically linked image otherwise lacks.",
    d: "A dynamic loader reads library files, maps them, applies relocations and resolves symbols, either at start or on first use. It requires a filesystem or embedded files, a lookup path and thread-local storage setup. Static linking avoids all of that, which is why most images do not support it; the support exists to run binaries prepared for conventional systems. Each loaded library adds to attack surface and start time, and symbol interposition makes behavior depend on search order.",
    k: ["Supporting dynamic loading vs static only: support runs more software; static only keeps the image small and fully analyzable.", "Eager binding vs lazy binding: eager catches missing symbols at start; lazy starts faster and fails later."],
    p: ["A missing shared library is found only when a rarely used path is run.", "Search order lets an unexpected library in the image override a safe one."],
    v: "Launch a dynamically linked program, list loaded libraries and resolved symbols, and confirm a deliberately missing library causes a clear start error rather than a later crash.",
    dep: ["file-api-shim","static-memory-map"]
  },
  "network-device-layer": {
    s: "The abstraction between the network stack and whatever device provides packets, so the same stack runs over a paravirtual NIC, a loopback or a passthrough device.",
    d: "It defines the operations the stack needs: transmit a buffer, receive buffers, report link state, offload capabilities and hardware address. Drivers register with it. Queues, interrupts and polling are managed here, along with batching of packets to amortize cost. Multiple interfaces and virtual local interfaces are supported if the image needs them. The trade-off is overhead of the abstraction on the fastest path versus keeping drivers and the stack independent.",
    k: ["Interrupt-driven receive vs polling: interrupts save CPU when idle; polling gives lower latency and higher rate when busy.", "Thin abstraction vs rich one with offloads: thin is fast and easy to implement; rich allows checksum and segmentation offload when the device supports it."],
    p: ["Offload features are advertised by the device but behave differently in the host, and corrupted packets pass unnoticed.", "Receive buffers are not replenished fast enough and the device drops packets silently."],
    v: "Send a stream of packets of varied sizes through the device and compare transmitted and received counts and checksums at the host. Confirm link state changes are reported when the host interface goes down.",
    dep: ["paravirtual-net-driver","packet-buffer-pool","interrupt-dispatch"]
  },
  "packet-buffer-pool": {
    s: "A preallocated pool of fixed-size buffers for network packets, shared between drivers and the stack so packets can move without allocation or copying.",
    d: "Buffers are carved from memory at boot, with headroom for headers and a reference count or ownership token. The driver fills receive buffers; the stack passes them up and the application reads or takes them; transmit buffers return to the pool when the device reports completion. Preallocation gives predictable latency and avoids running the general allocator in interrupt context. The hard parts are sizing the pool, avoiding leaks on error paths and handling exhaustion without deadlock.",
    k: ["Fixed pool vs dynamic allocation: a fixed pool has bounded, predictable behavior; dynamic allocation adapts but can fail or stall under load.", "Chained small buffers vs large contiguous ones: chains avoid waste for small packets; contiguous buffers are simpler and faster to process."],
    p: ["A buffer is not returned on a rare error path, and the pool drains slowly until the network stops.", "The pool is too small for bursts and the stack drops packets that the application would have handled."],
    v: "Run sustained traffic for hours while watching free buffer count. It should return to its baseline when traffic stops; confirm bursts above pool size are counted as drops, not stalls.",
    dep: ["fixed-size-pools","physical-page-allocator"]
  },
  "ethernet-and-arp": {
    s: "The link-layer handling of frames, addresses and address resolution, which maps IP addresses to hardware addresses on the virtual network.",
    d: "The stack builds and parses frames, filters by destination address, and keeps a cache mapping neighbor IP addresses to hardware addresses, populated by request and reply messages. Neighbor lookups happen before the first packet to a host can be sent, so queued packets wait for resolution. IPv6 uses a related neighbor discovery protocol. Details to get right are cache lifetime, queueing during resolution, duplicate address detection and behavior when the host switch changes addresses.",
    k: ["Short vs long neighbor cache lifetime: short lifetimes track changes quickly but add traffic; long lifetimes save traffic and keep stale entries.", "Dropping vs queueing packets during resolution: queueing avoids losing the first packet; dropping is simpler and relies on retransmission."],
    p: ["A stale neighbor entry sends traffic to a hardware address that no longer exists.", "Unsolicited replies are accepted without checks and traffic can be redirected."],
    v: "Capture traffic on the host side as the image contacts a new neighbor. Confirm a resolution request precedes the first data frame, and that the entry expires and refreshes as configured.",
    dep: ["network-device-layer","packet-buffer-pool"]
  },
  "ip-layer": {
    s: "Addressing, routing and fragmentation for IP packets, including the image's addresses, routes, and the checks applied to every inbound datagram.",
    d: "The IP layer validates headers, delivers local packets to transport protocols and forwards or drops others. It holds interface addresses, a small routing table with default gateway, and handles fragmentation and reassembly, path size discovery and error messages like unreachable and time exceeded. Most images are leaf hosts that never forward. Reassembly buffers and malformed packets are classic sources of vulnerabilities, so the defaults and limits matter.",
    k: ["Dual stack vs a single IP version: dual stack reaches all clients but doubles code; a single version is smaller and has half the surface.", "Supporting fragmentation vs refusing it: support interoperates with old paths; refusal removes a class of attacks and requires clients to behave."],
    p: ["Reassembly state is unbounded and a stream of fragments exhausts memory.", "Path size discovery messages are dropped and large transfers stall."],
    v: "Send oversized, fragmented and malformed packets from a test host and confirm valid ones are delivered, malformed ones are dropped and counted, and memory use stays flat.",
    dep: ["ethernet-and-arp"]
  },
  "tcp-engine": {
    s: "The TCP implementation: connection state machines, retransmission, congestion control, window management and timers, linked in as a library the application drives.",
    d: "Each connection holds sequence state, send and receive windows, timers for retransmission and keepalive, and congestion control state. The engine decides when to acknowledge, resend and open the window. It runs in the same context as the application, so it competes for the same thread under cooperative scheduling. Performance comes from tuning to the workload: fewer features, preallocated state and batching. The difficulty is correctness under loss, reordering and adversarial peers, which took decades to get right in general-purpose stacks.",
    k: ["Mature complete stack vs minimal purpose-built stack: mature stacks handle odd networks; minimal ones are smaller and may suit a single workload but have gaps.", "Per-connection preallocated state vs dynamic allocation: preallocation bounds memory and speeds up; dynamic scales to more connections."],
    p: ["A simplified implementation mishandles loss, and throughput collapses on real networks that the test lab never reproduced.", "Half-open connections accumulate and exhaust the connection table."],
    v: "Transfer a large file across a network emulator with controlled loss, delay and reordering and confirm throughput matches a reference stack. Flood with half-open connections and confirm limits hold.",
    dep: ["ip-layer","timers-and-clock","packet-buffer-pool"]
  },
  "udp-and-dns": {
    s: "Connectionless datagram transport and a resolver that turns names into addresses, which most images need to find the services they call.",
    d: "UDP delivers datagrams with minimal state. The resolver builds queries, sends them to configured name servers, retries, and caches answers with respect to their lifetimes. It also handles search lists, multiple records and falls back to TCP for large answers. Resolution is on the critical path for startup and every outbound call, so the resolver's timeouts and caching strongly affect latency. Random source ports and transaction identifiers need a sound entropy source.",
    k: ["A built-in caching resolver vs delegating to a local forwarder: built-in avoids a dependency; a forwarder centralizes cache and policy.", "Strict vs lenient parsing of answers: strict rejects malformed data and breaks with odd servers; lenient interoperates and widens the attack surface."],
    p: ["Predictable transaction identifiers make cache poisoning possible.", "A single slow name server blocks lookups, because the resolver retries serially with long timeouts."],
    v: "Resolve names against a test name server returning delayed, truncated and malformed answers. Confirm the resolver retries, falls back to TCP, rejects bad records and uses random ports and identifiers.",
    dep: ["ip-layer","entropy-driver"]
  },
  "dhcp-client": {
    s: "A client that obtains the image's address, gateway and resolver settings from the virtual network at boot, instead of reading them from configuration files.",
    d: "At startup it broadcasts a discovery, accepts an offer, requests the address and applies the lease, then renews before expiry. Alternatively addresses are fixed in boot parameters, which removes the exchange and its delay. The client must configure the IP layer, routes and resolver before the application starts using the network. Lease loss mid-run needs a policy. In large fleets, address assignment delays can dominate boot time and a shared server can become a dependency.",
    k: ["Dynamic leases vs static addresses from boot parameters: leases need no per-instance setup; static addresses avoid the exchange and a dependency but need orchestration.", "Block the application until configured vs start and wait: blocking is simple and safe; starting early overlaps work but needs retry logic."],
    p: ["The server is slow or absent and the application starts with no address and fails confusingly.", "A lease expires and renewal fails while connections are active, dropping traffic."],
    v: "Boot with the lease server delayed, then absent, and confirm the image waits, retries and logs the reason. Confirm the address and routes shown on the console match the server's record.",
    dep: ["udp-and-dns","ip-layer"]
  },
  "socket-layer": {
    s: "The programming interface of the network stack: handles for endpoints, listen and accept queues, buffers and readiness notification the application builds on.",
    d: "It keeps endpoint objects with their buffers and state, and implements listen backlogs, accept, connect, send and receive. It tells the event loop which sockets are ready and wakes blocked threads. In native form it allows handing buffers over without copying; in compatibility form it is wrapped to look like standard sockets. Limits on connections, buffer sizes and backlog protect memory. Performance depends on how cheaply readiness is determined and how few copies the data path makes.",
    k: ["Fixed per-socket buffers vs adaptive buffers: fixed sizes bound memory; adaptive sizing improves throughput on fast, long paths.", "Bounded accept backlog vs unbounded: bounded drops excess connections early; unbounded wastes memory under attack."],
    p: ["A listener's accept queue fills during a stall and clients see resets with no log entry.", "Socket buffers are sized for peak and memory runs out at high connection counts."],
    v: "Open the maximum configured connections and confirm memory use matches the computed budget and the next connection is refused cleanly. Verify readiness events fire for each socket under load.",
    dep: ["tcp-engine","udp-and-dns","io-readiness-polling"]
  },
  "zero-copy-io": {
    s: "A data path in which packet buffers pass from the device to the application, and back, by reference, without being copied between layers.",
    d: "The application receives pointers to buffers owned by the pool, processes them in place and either releases them or hands them back for transmission. Because the stack and application share one address space with no boundary, no copy is required for protection. This requires an interface that exposes buffer ownership and lifetime, which standard sockets do not. Gains are largest for small messages at high rates. The difficulty is ownership: a buffer held too long starves the pool, and one used after release corrupts packets.",
    k: ["Ownership-passing interface vs copying interface: ownership gives peak performance; copying is the standard semantics and is safer.", "Scatter-gather transmit vs linear buffers: scatter-gather avoids assembling messages; linear buffers are simpler for the device and checksums."],
    p: ["An application keeps references to receive buffers and the pool is exhausted, stopping all traffic.", "A buffer is modified after being queued for transmit and the wrong bytes go on the wire."],
    v: "Run a high-rate echo test and count byte copies with a counter or profiler. Confirm zero copies on the data path, no pool growth, and payload checksums match end to end.",
    dep: ["packet-buffer-pool","native-library-api","network-device-layer"]
  },
  "block-device-layer": {
    s: "The abstraction that presents storage as numbered blocks to filesystems and caches, with queuing, ordering and flush semantics, over a paravirtual disk.",
    d: "It accepts read, write and flush requests, queues them to the driver, and signals completion through callbacks or events. It reports capacity and sector size and may enforce read-only attachment. Request merging and ordering barriers are handled here. Durability is the subtle part: a write is complete only after the host acknowledges it, and a flush may be needed to reach stable storage. The layer exists only in images that have a disk.",
    k: ["Asynchronous requests with completion events vs synchronous calls: asynchronous overlaps I/O with work; synchronous is simpler and stalls the single thread.", "Pass flush through to the host vs ignore it: passing keeps durability; ignoring is faster and loses data on a crash."],
    p: ["Flush is treated as a no-op and committed data disappears when the host fails.", "A synchronous disk call blocks the only thread and the network stalls with it."],
    v: "Write blocks with flush, kill the instance and the host and read back from the disk image. Confirm acknowledged data is intact and that I/O latency appears in metrics.",
    dep: ["paravirtual-block-driver","interrupt-dispatch"]
  },
  "embedded-filesystem": {
    s: "A small filesystem linked into the image for the few services that need persistent files, chosen for size, simplicity and crash safety rather than features.",
    d: "It implements files and directories over the block layer, with a compact on-disk format, and often a log or copy-on-write design to survive abrupt power-off. Features such as permissions, extended attributes and large directories are left out. It is the usual answer when an image needs a database file, uploaded content or logs on a volume. Difficulties include recovery after a crash, wear and fragmentation on long-lived volumes, and keeping the format readable by host tools for backup.",
    k: ["Log-structured or copy-on-write vs update-in-place: log designs recover simply after a crash; update-in-place wastes less space and is faster for random writes.", "A custom format vs a widely supported one: custom formats are smaller; a common format can be mounted and inspected by host tools."],
    p: ["A crash during metadata update leaves the volume unmountable and no tool in the image can repair it.", "Two instances mount the same writable volume and corrupt it."],
    v: "Run a write workload and cut power at random points many times, then mount and check the filesystem each time. Confirm it recovers to a consistent state with only the last unflushed writes lost.",
    dep: ["block-device-layer","block-cache"]
  },
  "ramdisk-image": {
    s: "A filesystem held entirely in memory and populated at boot from data packaged inside the image, used for configuration, certificates and static content.",
    d: "The packaging step builds a read-only archive that the image contains; at boot it is exposed through the file shims as a tree. Content is part of the signed image, so it is immutable and versioned with the code. A writable in-memory area may be layered on top for temporary files, lost at shutdown. Size counts against memory and image size, so large datasets are a poor fit. It removes the need for a block device and storage drivers.",
    k: ["Content embedded in the image vs attached read-only disk: embedded content is covered by the signature and needs no device; an attached disk allows large content without rebuilding.", "Writable overlay vs read-only: an overlay supports programs that write temporary files; read-only is safer and simpler."],
    p: ["Content is much larger than expected, so every instance holds a duplicate copy in memory.", "The writable overlay fills memory and the application is killed by the ceiling."],
    v: "List the files visible in the booted image and compare their hashes with the packaged source. Write to the overlay until full and confirm the failure is a clean error, not a crash.",
    dep: ["image-packaging","heap-allocator"]
  },
  "shared-directory-mount": {
    s: "Access to a directory on the host through a shared filesystem channel, so an image can read configuration or exchange files without owning a disk.",
    d: "The hypervisor exposes a host directory through a paravirtual filesystem protocol; the image has a client that translates file calls into requests over a shared-memory channel. It suits development, log collection and passing large inputs. It breaks isolation boundaries on purpose, since the guest now touches host files, so scope, permissions and symlink handling must be tight. Performance and semantics, such as locking and cache coherence, differ from a local disk.",
    k: ["Shared directory vs private block device: sharing is convenient and easy to inspect from the host; a private device keeps the guest isolated.", "Read-only vs read-write mounting: read-only limits damage; read-write is needed for output and increases host exposure."],
    p: ["A path traversal or symlink lets the guest read host files outside the shared directory.", "Multiple instances write the same file with no coordination."],
    v: "Mount a test directory, create a file from the guest and confirm it appears on the host. Attempt access outside the directory through relative paths and links and confirm refusal.",
    dep: ["paravirtual-transport","file-api-shim"]
  },
  "remote-storage-client": {
    s: "A client for a network storage service, such as an object store or networked filesystem, which lets an image keep its state outside the instance.",
    d: "Instead of a local disk, the application uses a protocol over the network to read and write objects or files. The client handles authentication, retries, caching and consistency. This fits the replace-not-patch model: any instance can be discarded without losing data. It adds latency and a dependency, and the library adds code and memory. The main difficulty is failure behavior when the remote service is slow or unavailable, which a local disk never had.",
    k: ["Remote object storage vs a local disk volume: remote lets instances be disposable and scale; local is faster and needs no network service.", "Client-side caching vs always fetching: caching cuts latency and cost; fetching always avoids stale data and cache memory."],
    p: ["Retries with no limit overload a struggling storage service and keep all instances busy.", "Cached data is stale after another instance wrote an update."],
    v: "Write and read objects while injecting delay and failures into the storage service. Confirm timeouts and retries are bounded, errors reach the caller, and data written is readable from another instance.",
    dep: ["tcp-engine","in-app-tls","block-cache"]
  },
  "block-cache": {
    s: "A memory cache of recently used storage blocks that speeds reads and batches writes, sized from the instance's fixed memory.",
    d: "Blocks are kept in a table keyed by device and block number, with a replacement policy and dirty tracking. Writes may be held and flushed later, which improves speed but risks loss. Without paging and demand loading, the cache is the only buffer between the application and the disk, and memory spent on it is memory the application lacks. Cache size is chosen at build or boot. The hard parts are flush ordering for consistency and avoiding unbounded growth.",
    k: ["Write-back vs write-through: write-back is faster and can lose recent writes; write-through is slower and safe.", "Fixed cache size vs sharing memory dynamically with the heap: fixed is predictable; dynamic uses memory better and can starve the application."],
    p: ["The cache grows to fill memory and the heap runs out under load.", "Dirty blocks are not flushed on shutdown and recent data is lost."],
    v: "Read a dataset twice and compare latency to confirm cache hits. Write, request shutdown, and confirm all dirty blocks are flushed before power-off and visible on the host.",
    dep: ["block-device-layer","heap-allocator"]
  },
  "storage-free-mode": {
    s: "The common configuration with no disk, no filesystem and no storage drivers, where all state lives in memory or in remote services.",
    d: "Storage libraries and drivers are left out. Configuration comes from boot parameters, certificates from the packaged image, and data from the network. File calls from shims return clean errors. The image is smaller, boots faster and has no persistent place for an attacker to leave anything. State disappears with the instance, so durability becomes someone else's job. Many network services run this way, and moving to it is a design decision, not just a build flag.",
    k: ["No storage vs a minimal volume: no storage is the simplest and safest; a volume allows local caches and spools at the cost of drivers and recovery.", "Treating the instance as disposable vs preserving local state: disposable scales and redeploys easily; preserved state needs backup and migration."],
    p: ["A library silently tries to write a temporary file and fails in a rare path.", "Teams keep in-memory sessions and lose them on every redeploy."],
    v: "Inspect the link map to confirm no block driver or filesystem is linked. Exercise every feature and confirm none depends on a local file, and that redeploy loses no business data.",
    dep: ["library-selection","file-api-shim"]
  },
});
