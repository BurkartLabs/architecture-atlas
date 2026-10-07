// Details for the unikernel plate, part 1: build and delivery, debugging, security.
ATLAS.details("unikernel", {
  "library-selection": {
    s: "The step that decides which operating system libraries an image contains, based on what the application declares it needs, so the OS is assembled per program instead of shipped whole.",
    d: "The application, or its build description, names the capabilities it needs: a network stack, a filesystem, a scheduler, a memory allocator, a C library. A resolver maps each to a library and pulls in that library's own dependencies. Alternatives for one role, such as two allocators or two TCP implementations, are chosen here. The hard part is transitive reach: a convenient helper can drag in a whole subsystem, and a missing declaration shows up as a link error or, worse, a runtime fault.",
    k: ["Explicit dependency declarations vs inference from imports: explicit lists are predictable and reviewable; inference is convenient but can silently pull in large libraries.", "One library per role vs several swappable ones: swapping lets each image tune itself; a single choice halves the test matrix."],
    p: ["A transitive dependency quietly enables a subsystem the image was meant to omit, growing the attack surface and the image.", "Two libraries are selected for the same role and both initialize, fighting over one device."],
    v: "Build the image and list the linked libraries from the link map. Confirm each one is justified by a declared need and that the filesystem and shell libraries are absent from an image that has none.",
    dep: []
  },
  "build-configuration": {
    s: "The set of build-time options, such as feature flags, sizes and limits, that fixes how every library behaves, replacing runtime configuration files the image will not carry.",
    d: "Options are declared by each library with types, defaults and dependencies on other options, then resolved into a single configuration that is compiled in. Choices include the number of threads, buffer pool sizes, whether to enable checksums offload, log level and which drivers to build. The result is stored with the image so it can be audited. It is hard because options interact across libraries and because a wrong value is not an error message later; it is a different program.",
    k: ["Compile-time constants vs boot parameters: constants allow the compiler to remove code and size structures exactly; boot parameters allow one image to serve several deployments.", "Per-library option namespaces vs a global flat set: namespaces avoid collisions but make cross-library tuning harder to express."],
    p: ["A debug option left on in a release configuration adds logging and checks that slow the hot path.", "The configuration used for the build is not saved, so the image cannot be rebuilt or explained later."],
    v: "Rebuild from the stored configuration file and compare image hashes. Flip one option, confirm the code it guards is gone from the link map and the size changes as expected.",
    dep: ["library-selection"]
  },
  "whole-program-linking": {
    s: "Linking the application and all selected libraries into one program, so calls between them are direct and the compiler can optimize across what would be a kernel boundary.",
    d: "Every library is compiled as relocatable objects or an archive and linked with the application into one executable with a single symbol table and a fixed layout. Because there is no system call boundary, a socket write becomes a function call into the stack. Link-time optimization can inline across these seams. The cost is that nothing is loadable later: all addresses are known at link time, symbol clashes between libraries must be resolved by the build, and one oversized object grows every image that includes it.",
    k: ["Static linking of everything vs allowing loadable modules: static gives the smallest, most analyzable image; modules add flexibility but need a loader and run-time symbol resolution.", "Cross-library inlining vs stable library boundaries: inlining is faster, but makes each build unique and complicates debugging."],
    p: ["Symbol collisions between a shim and an application's own copy of a function link successfully but call the wrong one.", "Link-time optimization hides a crash behind inlined frames, so stack traces no longer match library boundaries."],
    v: "Inspect the linked output with a symbol dump. Confirm one executable contains application and library symbols, and that a call from the application into the network library appears as a direct call.",
    dep: ["library-selection","build-configuration"]
  },
  "dead-code-elimination": {
    s: "Removing functions, data and whole libraries that no execution path reaches, at compile and link time, which keeps images small and shrinks what can be attacked.",
    d: "Each function and datum is placed in its own section, and the linker discards sections unreachable from the entry point and any registered handlers. Build options remove entire features before compilation. Some systems also analyze the application's use of library calls and prune further. The difficulty is indirection: function pointers, registration tables and constructor lists keep code alive that is never called, and reflection-style tricks defeat analysis. Teams measure results by size and by the count of linked symbols.",
    k: ["Section-level removal vs whole-library selection: sections catch fine waste; library selection removes initialization code and data that sections cannot.", "Aggressive pruning vs safety: a smaller image is better, but removing a handler that is only reached on an error path turns a recoverable fault into a crash."],
    p: ["A registration table references every driver, so all of them stay in the image despite never being used.", "Pruning removes a function reached only through a dynamic lookup and the failure appears in production."],
    v: "Compare the image with and without a feature disabled and diff the symbol lists. Confirm the disabled feature's symbols are absent and that the functional test suite still passes.",
    dep: ["whole-program-linking"]
  },
  "cross-toolchain": {
    s: "The compiler, assembler and linker set that produces code for the target virtual machine, plus the headers and runtime pieces that replace the host system's.",
    d: "The image targets a bare environment, so the toolchain is configured with no host operating system, a freestanding runtime and a custom linker script that sets the image layout. Compiler flags disable features that need an OS, such as the red zone or vector registers in interrupt paths. The toolchain version is part of the image's identity. Difficulties include getting the language runtime and exception handling to work without a host, and keeping builds identical across developer machines and continuous integration.",
    k: ["A pinned in-repository toolchain vs the host's installed one: pinning gives repeatable images; host toolchains are easier to adopt but drift.", "Custom linker script vs default layout: the script gives exact control over sections and entry, but must be maintained as libraries change."],
    p: ["Compiler flags suited to normal programs emit instructions that fault in early boot before state is saved.", "A toolchain upgrade changes code generation in a way that only shows up on one hypervisor."],
    v: "Build in a clean container with the pinned toolchain and boot the result on the target hypervisor. Confirm the entry symbol and section layout match the linker script.",
    dep: []
  },
  "image-packaging": {
    s: "Wrapping the linked program into a format a hypervisor or boot loader can start, often together with an initial filesystem, boot parameters and metadata.",
    d: "The linked executable is turned into one of several formats: a direct-boot kernel image, a disk image with a minimal boot sector, or a format a specific host launcher accepts. Optional payloads, such as an in-memory filesystem or configuration, are appended. Metadata records the build configuration, libraries and expected memory. Compression can shrink transfer size but costs boot time. Packaging is where portability suffers, because each hypervisor accepts slightly different formats and boot conventions.",
    k: ["Direct-boot kernel format vs disk image: direct boot is fastest and simplest; a disk image works on more platforms but adds a boot sector and storage dependency.", "Compressed vs uncompressed images: compression saves network and storage, but spends boot time decompressing."],
    p: ["An image that boots on one hypervisor fails on another because of a different assumed load address or boot protocol.", "A payload appended after build is not covered by the signature, so it can be swapped."],
    v: "Produce the image and boot it on each supported hypervisor. Confirm the first console line appears within the expected time and that metadata inspection shows the right configuration.",
    dep: ["whole-program-linking","cross-toolchain"]
  },
  "reproducible-builds": {
    s: "Making the same inputs always yield a byte-identical image, so anyone can rebuild an image and check it matches what was deployed.",
    d: "Sources, library versions, toolchain and configuration are pinned and recorded. Embedded timestamps, absolute paths, randomized ordering and build host details are removed or normalized. The build runs in a controlled environment. Because the image is the only deployable artifact, identical output is the basis for trusting it: a hash can be compared across builders. The hard cases are libraries that embed dates, parallel link ordering, and toolchain features that are not deterministic.",
    k: ["Hermetic builds with pinned inputs vs a best-effort fixed environment: hermetic gives real byte equality; best-effort is cheaper and fails mysteriously.", "Normalizing metadata vs stripping it: normalizing keeps useful provenance; stripping is simpler but loses information needed to audit."],
    p: ["A build timestamp compiled into the banner makes every build differ, so comparison is abandoned.", "An unpinned library tag moves between builds and the same configuration yields a different image."],
    v: "Build the same commit twice on two different machines and compare image hashes. They must be identical; differing sections must be traceable to a named input.",
    dep: ["cross-toolchain","build-configuration"]
  },
  "image-signing": {
    s: "Attaching a cryptographic signature and provenance record to an image so a launcher or registry can refuse anything not built and approved by a trusted party.",
    d: "After packaging, the image digest is signed with a key held by the build system, and a record of inputs, configuration and builder identity is stored beside it. The launcher or registry verifies the signature before booting or distributing. Since an image is a complete machine, signing it covers the operating system and the application together. Difficulties are key custody, rotation and revocation, and ensuring that everything the image loads at boot, such as configuration payloads, is covered too.",
    k: ["Signing at build vs verifying only at deploy: build-time signing gives provenance from the source; deploy-time checks alone only prove what was approved later.", "Short-lived keys with transparency logging vs long-lived keys: short-lived limits damage from a leak but requires more infrastructure."],
    p: ["The launcher skips verification on a debugging path that stays enabled in production.", "A signed image combined with unsigned boot configuration lets an attacker change behavior without touching the signature."],
    v: "Flip one byte in a signed image and try to launch it. Confirm the launcher refuses with a signature error, and that the untampered image boots and its provenance record is retrievable.",
    dep: ["image-packaging","reproducible-builds"]
  },
  "boot-image-formats": {
    s: "The concrete file formats hypervisors can start, such as direct-boot kernels and bootable disk images, and the conventions each uses to hand control to the image.",
    d: "A direct-boot format specifies where to load the code, what machine state to hand over and how to pass boot parameters; the host launcher reads the file itself. A disk image format instead contains a boot sector and uses firmware to load the program. Cloud environments want a specific disk image type. Choosing a format fixes where the image can run, how fast it starts and what the boot stub must parse. Supporting several formats multiplies testing.",
    k: ["Direct kernel load vs firmware boot: direct load skips firmware and starts in milliseconds; firmware boot runs almost anywhere but adds hundreds of milliseconds.", "One universal image vs per-target builds: one image is simpler to manage; per-target builds can be smaller and faster."],
    p: ["A format change in the host launcher shifts the handed-over state and the image faults before printing anything.", "Treating the image as a disk lets the platform attach a second disk and enumerate it, which the image never expected."],
    v: "Boot the same build in each format on each target and capture the console. Confirm the memory map and parameters that the image prints are correct and that time-to-first-output is within budget.",
    dep: ["image-packaging"]
  },
  "image-registry": {
    s: "A store for built images with names, versions, digests and access control, so deployment pulls an exact artifact and can roll back to a previous one.",
    d: "Images are stored by content digest and tagged with human-readable versions. Each entry carries signatures, build metadata and, ideally, the configuration it was built with. Launchers pull by digest, not by mutable tag. Retention rules decide how many versions are kept for rollback. Because images are small, transfer is cheap, but a registry still has to handle access control, garbage collection of unreferenced images and replication across regions.",
    k: ["Pull by digest vs by tag: digests guarantee the exact bytes; tags are friendlier but can move under a running rollout.", "Central registry vs distribution to each host ahead of time: a registry is simple; pre-distribution speeds cold starts and avoids a dependency at launch."],
    p: ["A mutable tag is overwritten and hosts in the same fleet end up running different builds under the same name.", "Garbage collection deletes the previous image that a rollback needed."],
    v: "Publish an image, pull it by digest on a fresh host and confirm the hash matches the build. Retag a new image and check running deployments are unchanged.",
    dep: ["image-signing"]
  },
  "instance-launcher": {
    s: "The host-side tool that creates a virtual machine for an image: allocates memory and processors, attaches virtual devices, and starts it.",
    d: "Given an image and a description of resources, the launcher asks the hypervisor for a machine with a stated memory size, virtual CPUs, network interfaces and any block devices, passes the boot parameters, and starts it. It watches the machine and reports exit status. For unikernels, which boot in milliseconds, launch overhead on the host (creating network interfaces, setting up devices) can exceed guest boot time. Reliability means cleaning up devices and addresses when an instance dies.",
    k: ["Launcher per instance vs a long-running daemon: per-instance tools are simple and isolated; a daemon can pre-create resources and start faster.", "Minimal device model vs the hypervisor's full defaults: a minimal model reduces host attack surface and start time but supports fewer images."],
    p: ["Leaked network interfaces or addresses from crashed instances exhaust the host over time.", "The launcher passes memory settings in different units than the image expects and it boots into a corrupted layout."],
    v: "Launch an image, measure time from command to first console output, then kill it and confirm the host's interfaces, memory and device files return to their prior state.",
    dep: ["boot-image-formats","hypervisor-isolation"]
  },
  "orchestrator-integration": {
    s: "The adapter that lets a cluster scheduler place, start, monitor and stop images as workloads, treating each image like a container-sized unit.",
    d: "General-purpose cluster orchestrators schedule containers, so a unikernel needs a runtime shim that translates their launch, health and stop requests into hypervisor operations, and exposes the image's network address and metrics. Nodes need hypervisor support and enough device access. Scheduling by memory and CPU works naturally, since both are fixed at launch. The hard parts are networking, because each image is a virtual machine with its own interface, and mapping container concepts like exec and shell attach, which do not exist.",
    k: ["Using the orchestrator's container model through a shim vs a native scheduler for images: a shim reuses existing tooling; native scheduling avoids concepts that do not apply.", "Mixed nodes running containers and images vs dedicated nodes: mixed uses capacity better but couples failure and security domains."],
    p: ["Operators try to exec into an instance and the tooling reports confusing errors, because no process or shell exists.", "Node-level hypervisor limits are not visible to the scheduler and it overcommits."],
    v: "Deploy three replicas through the orchestrator, delete one and confirm it is restarted elsewhere, that traffic still reaches the other two, and that scheduling accounts for each image's memory.",
    dep: ["instance-launcher","image-registry"]
  },
  "boot-time-configuration": {
    s: "How an image receives per-instance settings, such as addresses, endpoints and credentials, at launch without a filesystem or a login to edit files on.",
    d: "Settings arrive as boot parameters on the command line, a small configuration blob attached to the virtual machine, a metadata service reached over the network, or an attached read-only disk. The image parses them early and hands values to libraries. Which channel to use depends on size, sensitivity and who can read it. Good images validate configuration and refuse to start on missing or malformed values, since nobody can log in to fix it afterward.",
    k: ["Command line vs metadata service: the command line is simple and available immediately; a metadata service allows larger and updatable data but needs the network first.", "Fail on bad configuration vs fall back to defaults: failing loudly exposes mistakes; defaults keep the service up but can run with wrong settings."],
    p: ["Credentials passed on a visible command line show up in launcher process listings and logs.", "A typo in a parameter is ignored and the image runs with a default that points at production."],
    v: "Launch with deliberately missing and malformed settings and confirm the image prints a clear error and exits; then launch with valid settings and confirm the console reports each effective value.",
    dep: ["boot-parameters","instance-launcher"]
  },
  "redeploy-updates": {
    s: "The update model in which a running image is never patched: a new image is built, started beside the old, and traffic moves across.",
    d: "Because the image holds code and operating system together and has no package manager or shell, change means replacement. A rollout starts new instances, waits for health checks, shifts traffic and stops old ones, with the previous image kept for rollback. Fast boot makes this cheap, so blue-green and canary releases are routine. The hard parts are state that lived inside the instance, in-flight connections during the cutover, and database or protocol compatibility between versions during the overlap.",
    k: ["Replace-and-drain vs in-place update: replacement is clean and testable; in-place avoids duplicate capacity but is not possible without a mutable system.", "Canary share of traffic vs all at once: canaries limit blast radius; they need traffic splitting and good health metrics."],
    p: ["Connections are cut at cutover because old instances are stopped before they finish draining.", "Two versions run concurrently and write incompatible data formats to a shared store."],
    v: "Roll out a new build under constant traffic and confirm zero failed requests, that old instances drain and exit, and that rolling back restores the previous digest within the stated time.",
    dep: ["orchestrator-integration","health-endpoints","image-registry"]
  },
  "service-discovery": {
    s: "How images find each other and how clients find them, using addresses handed in at boot, DNS, or a registry, since there is no host configuration to rely on.",
    d: "Each instance gets an address from the hypervisor's network, a DHCP service or boot parameters. Other services reach it through DNS records, a service registry that instances join at startup or load balancers whose back ends are updated by the orchestrator. The image needs only a resolver library and a client for whichever mechanism is used. Hard parts are caching stale addresses, short lifetimes of instances and registering and deregistering promptly on start and stop.",
    k: ["DNS with short lifetimes vs an explicit registry API: DNS is universal and needs no client code; a registry gives faster, richer updates at the cost of a dependency.", "Client-side lookup vs a fronting load balancer: client-side avoids a hop; a balancer keeps logic out of every image."],
    p: ["A resolver cache holds a dead instance's address long after it is gone.", "An instance registers before its listener is ready and receives traffic it drops."],
    v: "Start and stop instances while a client runs, and confirm the client's lookups follow within the record lifetime and that no request is routed to an instance that has not finished starting.",
    dep: ["udp-and-dns","orchestrator-integration"]
  },
  "scale-out-and-to-zero": {
    s: "Adding instances under load and removing all of them when idle, relying on image boot times short enough that a request can wait for a cold start.",
    d: "A controller watches request rate or queue depth and launches or stops instances. With boot times of tens of milliseconds, instances can be started on demand when a connection arrives, and none need run while idle. This needs a front end that holds the request during start, an image with no warm-up and memory sized small. Hard parts are state that must be rebuilt at start, outbound connection pools, and the fact that hypervisor-side setup, not the guest, often dominates cold start time.",
    k: ["Scale to zero vs keeping a warm minimum: zero saves resources; a warm floor removes cold start latency from the tail.", "Starting on the first request vs predictive scaling: on demand is simple and exact; prediction hides latency but wastes capacity when wrong."],
    p: ["Cold start time is measured in the guest only, and the host's device setup hides most of the real delay.", "Scaling out multiplies connections to a database that cannot take them."],
    v: "Send a request to an idle service and measure end-to-end latency from request to response including instance start. Then load it and confirm instance count rises and falls with the load.",
    dep: ["instance-launcher","orchestrator-integration","boot-time-configuration"]
  },
  "serial-console-output": {
    s: "A text channel from the image to the host through a virtual serial port or console device, used for boot messages, panics and last-resort diagnostics.",
    d: "The console driver writes bytes to a virtual device that the hypervisor forwards to a file, terminal or log collector. It is available from the first instructions of boot, long before the network stack, and is often the only way to see why an image failed to start. It is synchronous and slow on some hypervisors, so heavy logging through it can distort timing. Input is rarely used. The hard part is keeping it useful but cheap and not leaking secrets into it.",
    k: ["Synchronous console writes vs buffered output: synchronous output survives a crash; buffering is faster but loses the last lines before a fault.", "Always-on console vs disabled in production: always-on aids support; disabling saves time and removes an exfiltration channel."],
    p: ["Verbose logging through a slow console stalls the application during a traffic burst.", "Panic output is lost because the console is flushed asynchronously and the machine halts first."],
    v: "Boot an image with an injected early fault and confirm the console shows the fault and a stack trace before the machine halts, with timestamps in order.",
    dep: ["console-driver"]
  },
  "structured-logging": {
    s: "Emitting log records as structured events with levels and fields, and shipping them off the instance over the network, since nothing local will be kept.",
    d: "The application and libraries write records to a logging interface; sinks send them to the console, a remote collector over UDP or TCP, or a host channel. Records carry a timestamp, level, component and key-value fields, and often an instance identifier and build version added by the image. Because instances are short-lived and have no disk, anything not shipped is gone. Hard parts are back-pressure when the collector is slow, clock accuracy, and deciding what to drop under load.",
    k: ["Remote shipping vs console capture by the host: remote works in any environment with a network; host capture does not depend on the guest network being up.", "Blocking vs lossy sinks under pressure: blocking preserves every record but can stall the service; lossy keeps serving but loses data."],
    p: ["The log collector is unreachable and the image blocks on write, turning a logging outage into a service outage.", "Records carry no instance or version, so logs from replaced instances cannot be told apart."],
    v: "Generate each log level, confirm records arrive at the collector with correct fields, then cut the collector and confirm the service keeps responding while dropped records are counted.",
    dep: ["serial-console-output","udp-and-dns","timers-and-clock"]
  },
  "metrics-export": {
    s: "Publishing counters, gauges and histograms from inside the image, by serving them over a network endpoint or pushing them to a collector.",
    d: "Libraries and the application register metrics: packet and byte counts, connection states, heap usage, scheduler latency, request timings. An HTTP endpoint serves them in a text format a collector scrapes, or a periodic push sends them out. Since there is no process list and no system tools, these numbers are the only view of the operating system's behavior, so library authors expose internals deliberately. Cardinality and update cost on hot paths are the main difficulties.",
    k: ["Pull endpoint vs push to a collector: pull is simple and keeps control with the monitor; push works for very short-lived instances that may exit before being scraped.", "Rich internal metrics vs minimal: rich metrics make problems diagnosable; each one adds code, memory and update cost on the hot path."],
    p: ["High-cardinality labels, such as per-connection identifiers, grow memory without bound.", "A short-lived instance exits between scrapes and its final numbers are never collected."],
    v: "Drive known traffic and compare the exported packet, byte and connection counters to the traffic generator's totals. Check heap gauges move when memory is allocated and freed.",
    dep: ["socket-layer","heap-allocator","timers-and-clock"]
  },
  "trace-hooks": {
    s: "Instrumentation points that record spans and events across the application and libraries, so a request can be followed through the whole image and to other services.",
    d: "Hooks wrap request handling, network sends and receives, allocator calls and scheduler switches with identifiers and timestamps. Records go to a ring buffer in memory, read on demand, or are exported with request context propagated in protocol headers to other services. Because the library OS is ordinary code in the same program, a trace can show time spent in the TCP engine and not just the application. The cost is overhead and size, so compile-time switches turn hooks into no-ops when unused.",
    k: ["Compile-time tracing vs always compiled in with a runtime switch: compile-time has zero cost when off but needs a rebuild to look; runtime switches allow live diagnosis at a small constant cost.", "In-memory ring buffer vs immediate export: a ring is cheap and survives network trouble; export gives a durable record."],
    p: ["Tracing enabled during an incident changes timing enough that the problem disappears.", "Trace identifiers are not propagated through a library boundary and requests appear to end halfway."],
    v: "Send a request with a known trace identifier and confirm spans appear for application, socket and driver layers with consistent identifiers and durations that add up to the observed latency.",
    dep: ["timers-and-clock","network-device-layer"]
  },
  "sampling-profiler": {
    s: "A timer-driven sampler that records where execution is, built into the image or driven from the host, to show hot code without a conventional profiling tool.",
    d: "On a periodic timer interrupt, the profiler records the instruction pointer and, with frame pointers, the call stack into a buffer. The data is read out over a debug channel, the network or the console, and mapped to symbols using the build's symbol file. Alternatively the host samples the guest from outside using the hypervisor's introspection. Everything is in one address space, so samples cover library and application code together. Frame pointers and symbol files must be kept from the build.",
    k: ["In-guest sampler vs host-side sampling: in-guest sees exact stacks but costs guest time; host-side is non-intrusive but resolves less detail.", "Frame pointers vs unwinding tables: frame pointers are cheap and robust; tables recover more compilers' output but need larger images."],
    p: ["The symbol file from the build is not kept, and a profile from production cannot be interpreted.", "Sampling at too high a rate perturbs the thing being measured."],
    v: "Run a workload with a known hot loop and confirm the profile attributes most samples to it. Check that library functions also appear with correct names.",
    dep: ["timers-and-clock","interrupt-dispatch"]
  },
  "remote-debug-stub": {
    s: "A small debugging server in the image, or provided by the hypervisor, that lets a debugger on the host inspect memory and registers and set breakpoints.",
    d: "The hypervisor can expose the guest's CPU state over a standard debug protocol, or the image links a stub that speaks the protocol over a serial port or network socket. The debugger loads the image's symbol file and then reads variables, steps and sets breakpoints across application and library code alike. Typical difficulties are timing behavior while stopped, symbol and source matching for optimized code, and the risk that an enabled stub in production gives full memory access to anyone who reaches it.",
    k: ["Hypervisor-provided debugging vs in-image stub: hypervisor access needs no image code and works from first instruction; a stub works where the hypervisor offers none.", "Debug builds with the stub vs production builds without it: separate builds keep production small and safe; they also mean the failing build is not the one debugged."],
    p: ["A debug stub left reachable on a network port exposes all memory and secrets.", "An optimized build makes variables unavailable and steps jump unpredictably."],
    v: "Attach a debugger to a running test image, set a breakpoint in a library function, trigger it with a request and read a known variable. Confirm the production build rejects the same attach.",
    dep: ["serial-console-output","paravirtual-transport"]
  },
  "crash-dump-capture": {
    s: "Preserving state at the moment of a fault, via a hypervisor memory dump or a dump written by the image, so the cause can be analyzed after the instance is gone.",
    d: "A fault handler prints registers and a stack trace to the console and halts. For deeper analysis the hypervisor saves guest memory to a file, or the image writes a core to a block device or ships it to a collector before stopping. The dump is read with the build's symbols. Memory is a single flat space, so one dump holds everything, including secrets and keys. Hard parts are doing useful work after a fault when the stack or allocator may be corrupt, and protecting the dump.",
    k: ["Hypervisor memory dump vs in-guest core: hypervisor dumps work even when the guest is badly corrupted; in-guest cores can be selective and smaller.", "Always capture vs capture on demand: always gives evidence for rare faults; on demand limits storage and exposure of secrets."],
    p: ["The fault handler uses the heap or stack that is corrupt and recursively faults, so nothing is printed.", "Dumps contain private keys and are stored with ordinary log permissions."],
    v: "Trigger a deliberate null dereference in a test image and confirm a trace is printed, a dump is produced, and the dump opened with the build's symbols shows the faulting function and arguments.",
    dep: ["serial-console-output","interrupt-dispatch"]
  },
  "health-endpoints": {
    s: "Network endpoints or probes that report whether an image is started, ready for traffic and still making progress, used by orchestrators and load balancers.",
    d: "A listener answers liveness and readiness checks, usually over HTTP or a TCP connect. Readiness means configuration was loaded, dependencies are reachable and the listener is accepting; liveness means the event loop or scheduler is still turning. Since a failed instance cannot be repaired in place, the response to failure is replacement, so checks must be accurate. A check served by a separate thread can say healthy while the main work is stuck.",
    k: ["Shallow checks vs checks that exercise dependencies: shallow checks are cheap and do not cascade; deep checks catch real failures but can take down a fleet when a shared dependency blips.", "Probe from the orchestrator vs from the load balancer: orchestrator probes drive restarts; balancer probes drive traffic, and each wants different thresholds."],
    p: ["The health thread keeps answering while the worker thread is deadlocked, so a dead instance stays in rotation.", "A dependency outage makes every instance fail readiness at once and the service goes fully dark."],
    v: "Block the application's main loop deliberately and confirm liveness fails within its timeout. Make a dependency unreachable and confirm readiness fails without triggering restarts.",
    dep: ["socket-layer","event-loop"]
  },
  "attack-surface-reduction": {
    s: "The security gain from leaving code out: every library, driver, protocol and syscall not linked is a flaw that cannot be exploited.",
    d: "A conventional host carries a kernel with hundreds of interfaces, system services, shells and utilities. An image carries only what the build selected. There are no unused network services, no package manager and no helper programs to chain together. This is measured by counting linked symbols, listening ports and reachable interfaces. It does not remove bugs in what remains: the application and its libraries still receive hostile input. The risk is false comfort, since smaller is not the same as safe.",
    k: ["Minimal image vs feature-rich image: minimal reduces exposure and review cost; rich images ship faster but each included feature must be defended.", "Removing unused protocol features vs leaving them for compatibility: removal shrinks exposure; compatibility keeps clients working."],
    p: ["A debugging or management library is left in the production configuration and opens a port nobody knew about.", "Teams assume the small size means no vulnerabilities and skip fuzzing of the parsers that remain."],
    v: "Scan the running image from the network for open ports, and list its linked symbols. Confirm only the intended listener exists and no debugging, management or unused protocol code is present.",
    dep: ["dead-code-elimination","library-selection"]
  },
  "no-shell-or-users": {
    s: "The absence of any interactive shell, login, user accounts or privilege levels, which removes the usual tools an intruder uses after a first foothold.",
    d: "There is no program to run commands, no ability to start another program, no users to compromise and no privilege escalation path, because there is only one privilege domain. An attacker who executes code inside the image can read and write all of its memory but cannot easily download tools, pivot through a shell or persist across a redeploy. What remains is control of the one application. The cost is the same absence for administrators: troubleshooting needs built-in tooling.",
    k: ["No shell at all vs a locked-down management interface: no shell removes the tool entirely; a restricted interface helps operations but is another surface to attack.", "Single privilege level vs internal separation: one level is simple and fast; separating components costs speed and complexity but limits a bug's reach."],
    p: ["A convenient remote administration endpoint is added for debugging and becomes a shell in all but name.", "Responders cannot inspect a compromised instance because nothing exists to inspect it with, and evidence is lost on redeploy."],
    v: "Try to start a program, open a login or list processes from inside a running test image. Confirm no such interface exists and that exploit payloads that need a shell fail.",
    dep: ["attack-surface-reduction","entry-point"]
  },
  "stack-protection": {
    s: "Compiler-inserted guards, such as canaries and bounds checks, that detect buffer overflows before a corrupted return address is used.",
    d: "Canary values are placed between local buffers and return addresses and checked on function exit; a mismatch halts the image. Additional checks catch fortified string and memory functions overflowing a known size. With one address space and no kernel, a stack overflow in the application can reach the library OS, so these defenses cover all code in the image. Costs are small but real on hot paths. The hard part is that early boot code, interrupt handlers and assembly run before or outside the guard setup.",
    k: ["Canaries on all functions vs only functions with arrays: all gives wider coverage at a measurable cost; selective is cheaper but misses patterns.", "Halt on detection vs attempt to continue: halting stops exploitation but turns an attack into denial of service; continuing is unsafe."],
    p: ["The canary value is fixed at build time and an attacker who reads it once can reuse it.", "Interrupt and boot paths run without the guard, leaving a gap in a code region that handles external input."],
    v: "Run a test program with a deliberate stack overflow and confirm the image halts with a stack-check message instead of jumping to attacker-controlled data. Check the canary differs between boots.",
    dep: ["cross-toolchain","entropy-driver"]
  },
  "page-permissions": {
    s: "Marking code pages non-writable and data pages non-executable in the single address space, so injected data cannot run as code.",
    d: "At boot the image maps its code read-and-execute, constants read-only and data and stacks read-and-write without execute, then enforces them using the processor's page protections. This restores some of the separation a kernel would provide. It is harder than it sounds: without paging protections turned on, which some very small unikernels skip for speed, any write goes anywhere. Just-in-time compilation or self-modifying code needs deliberate exceptions.",
    k: ["Strict write-xor-execute vs one flat read-write-execute mapping: strict stops code injection; flat is simpler and avoids page table overhead.", "Fine-grained 4 KB mappings vs large pages: fine grain allows exact permissions; large pages reduce translation overhead but coarsen protection."],
    p: ["The image maps everything writable and executable for simplicity and code injection is trivial.", "A language runtime that generates code at runtime fails because executable pages are never writable."],
    v: "From a test build, attempt to write into code and to execute from the heap. Confirm each raises a fault and is reported on the console, while normal operation is unaffected.",
    dep: ["static-memory-map","cpu-mode-setup"]
  },
  "layout-randomization": {
    s: "Placing code, heap and stacks at different addresses on each boot or build, so an attacker cannot rely on knowing where anything is.",
    d: "Position-independent code lets the boot stub choose a random base; heap and stack placement can also be randomized from an entropy source. Alternatively, each build can shuffle the link order of functions, so addresses differ between images. Because there is a single fixed layout and no process creation, randomization happens once per boot at best. It needs entropy early in boot, before the usual sources are ready, and position-independent code costs some speed.",
    k: ["Per-boot randomization vs per-build: per-boot varies every run but needs early entropy and relocation; per-build is simpler and requires no runtime work but one leak breaks all copies of an image.", "Randomizing whole regions vs individual functions: regions are cheap; function-level shuffling resists information leaks better."],
    p: ["The random generator is seeded from a constant or the boot time, and addresses are predictable.", "One memory disclosure bug reveals the base and removes the benefit entirely."],
    v: "Boot the same image several times and record the base addresses of code, heap and stack from the console. Confirm they differ across boots, and that entropy was available when they were chosen.",
    dep: ["entropy-driver","static-memory-map"]
  },
  "in-app-tls": {
    s: "A TLS library linked into the application that terminates encrypted connections inside the image, since no outer proxy or host-level service does it.",
    d: "The library performs handshakes, certificate validation, session management and record encryption on top of the socket layer. It needs a good entropy source, an accurate clock for certificate validity, a trust store and current protocol versions. Because it lives in the same address space as the application, a bug in it exposes keys directly, and updating it means redeploying. Hardware crypto offload depends on the paravirtual device, and many images terminate TLS in a front proxy instead.",
    k: ["Terminate TLS in the image vs in a front proxy: in-image keeps traffic encrypted end to end; a proxy centralizes certificates and keeps key material out of the image.", "Linking a full library vs a small purpose-built one: full libraries cover more cases; small ones reduce attack surface and size."],
    p: ["The clock is wrong at boot, so certificate checks fail or, worse, are skipped.", "Poor early entropy produces predictable session keys."],
    v: "Connect with a standard client and verify the handshake negotiates the expected protocol version and cipher. Present an expired and a wrong-host certificate and confirm both are rejected.",
    dep: ["socket-layer","entropy-driver","clock-calibration","secret-delivery"]
  },
  "secret-delivery": {
    s: "The way keys, tokens and passwords reach an image at boot, without being baked into the image or written to any persistent store.",
    d: "Secrets are fetched at start from a secrets service over an authenticated channel, handed in through an encrypted configuration payload, or injected by the launcher through a host-guest channel. They live only in memory and vanish when the instance stops. Images themselves are widely stored and copied, so embedding secrets is unsafe. The hard part is bootstrapping trust: the image must prove who it is to receive a secret, usually by its signed identity or a one-time token.",
    k: ["Pull from a secrets service vs push through the launcher: pull gives auditability and rotation; push needs no network dependency at start but spreads secrets to launchers.", "Memory only vs encrypted at rest on an attached disk: memory only leaves nothing behind; an encrypted disk survives restarts but needs a key anyway."],
    p: ["A secret is compiled into the image for convenience and is then in every copy of the registry and build cache.", "A crash dump captures keys and is stored without protection."],
    v: "Inspect the image file and its registry copy for known secret values and confirm none are present. Launch it and confirm the service authenticates using a secret delivered at boot.",
    dep: ["boot-time-configuration","host-guest-channel"]
  },
  "hypervisor-isolation": {
    s: "The isolation between images and from the host, enforced by hardware virtualization and a small virtual device model instead of an operating system's process boundaries.",
    d: "Each image runs in its own virtual machine with its own memory, and cannot see other guests or the host except through the devices offered. The security of the whole arrangement rests on the hypervisor and its device implementations, a smaller and more intensely reviewed trusted base than a general-purpose kernel with many drivers and system calls. Minimal device models reduce host exposure further. The risk moves to escape bugs in device emulation, side channels between guests and misconfiguration.",
    k: ["Hardware virtual machine isolation vs container-style process isolation: virtual machines give a narrower, harder boundary; containers start faster but share a large kernel.", "Minimal device model vs compatibility with many images: minimal reduces escape risk; compatibility needs more emulated hardware."],
    p: ["A host-side device implementation has a memory bug that lets a guest escape, bypassing every in-image defense.", "Guests sharing a physical core leak data through timing."],
    v: "Run a hostile guest that tries invalid device accesses and out-of-range memory requests. Confirm the hypervisor refuses or terminates it and that neighboring guests and the host stay unaffected.",
    dep: ["paravirtual-transport"]
  },
});
