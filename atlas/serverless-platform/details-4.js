// Details for the serverless platform plate, part 4: isolation, cold starts and warm reuse, state and connections.
ATLAS.details("serverless-platform", {
  "micro-vm-sandbox": {
    s: "A stripped-down virtual machine with minimal devices and its own guest kernel, giving each tenant hardware-enforced isolation with start-up times in the low hundreds of milliseconds.",
    d: "A small virtual machine monitor, running in user space on the host, creates a VM with a handful of paravirtual devices, a tiny boot path and no legacy hardware emulation. The guest runs its own kernel and the function runtime. Isolation relies on hardware virtualization plus a very small monitor, so the attack surface is narrow. The monitor itself is jailed and filtered. The cost is memory overhead per VM and boot time, which snapshots and memory sharing reduce.",
    k: ["Micro-VM vs. container: a micro-VM isolates with a separate kernel and a small interface, but costs more memory and start time than a shared-kernel container.", "Minimal device model vs. general-purpose: fewer emulated devices means fewer escape bugs, but limits what workloads can run unmodified."],
    p: ["A flaw in the virtual machine monitor is a tenant escape, so it must itself be sandboxed.", "Guest memory that is never reclaimed makes idle VMs hold more host memory than their limit suggests."],
    v: "Boot a micro-VM, measure time from create to first event delivered, and confirm from inside the guest that only the expected devices and kernel interfaces exist and the host's processes are not visible.",
    dep: ["hypervisor-layer","tenant-separation"]
  },
  "container-sandbox": {
    s: "Isolation using kernel namespaces, control groups and security filters on a shared host kernel, offering the fastest starts and lowest overhead at the cost of a larger shared attack surface.",
    d: "Each function runs in a set of namespaces for processes, mounts, network and users, constrained by cgroups for CPU and memory and by filters for system calls. All sandboxes share the host kernel, so a kernel vulnerability can cross tenants. To compensate, platforms add a user-space kernel that intercepts syscalls, or restrict containers to one tenant per host. Containers start in tens of milliseconds and pack densely, which suits trusted or single-tenant workloads.",
    k: ["Shared host kernel vs. separate guest kernel: sharing is fast and dense, but any kernel bug becomes a cross-tenant risk.", "Container per tenant per host vs. mixed tenants per host: dedicating hosts to a tenant removes the cross-tenant risk, but wastes capacity for small tenants."],
    p: ["A container configured with extra capabilities or a mounted host path gives code a route to the host.", "Unpatched host kernels leave known escapes open across every container on the machine."],
    v: "From inside a container sandbox attempt to list host processes, mount a file system, and call a blocked system call, and confirm each is denied and logged by the security filter.",
    dep: ["syscall-filtering","resource-limits","host-os-minimal"]
  },
  "isolate-runtime": {
    s: "Running many functions inside one process as separate language-level contexts with their own heaps, giving near-zero start time but limiting code to one runtime and a restricted API.",
    d: "A shared server process hosts multiple isolates, each with its own heap and execution state, created in a few milliseconds. The language engine enforces the boundary, not the operating system, and the process also applies limits for memory, CPU time and wall time per isolate. Code is restricted to a standard set of web-style APIs, with no direct file system or arbitrary native modules. It suits short, lightweight request handlers at the edge. The security case rests on the engine's own correctness, so platforms add layers such as process separation by tenant risk level.",
    k: ["Isolate vs. VM or container: isolates start almost instantly and use little memory, but allow only one language family and a narrower API.", "Many tenants per process vs. process per tenant: sharing is dense, but a single engine bug or runaway loop puts neighbors at risk."],
    p: ["A CPU-bound loop in one isolate degrades its neighbors until the watchdog terminates it.", "Timing side channels between isolates in one process are harder to rule out than between VMs."],
    v: "Run an isolate that allocates beyond its memory limit and one that spins forever, and confirm each is terminated at its limit while a neighboring isolate's latency stays within normal bounds.",
    dep: ["resource-limits","tenant-separation"]
  },
  "syscall-filtering": {
    s: "A restriction on which operating system calls sandboxed code may make, using an allowlist so that unused and dangerous kernel interfaces are unreachable.",
    d: "A filter, attached to the process before untrusted code runs, checks every system call against a list and kills the process or returns an error on a violation. The list is tight for each layer: the function runtime gets a broader set than the virtual machine monitor, which needs only a few dozen calls. The filter cannot be relaxed after installation. Maintaining the lists is work: new runtime versions or libraries begin using calls that the allowlist does not include, and the failure appears as a sudden crash in production.",
    k: ["Allowlist vs. denylist: an allowlist denies unknown calls by default, but needs updating when runtimes change, while a denylist is easier to maintain and misses new calls.", "Kill on violation vs. return an error: killing is safest and visible, but any legitimate use of a missing call fails hard."],
    p: ["A runtime upgrade starts using a new system call and sandboxes die with no error message in the function's logs.", "Filters that allow broad calls such as generic control calls on devices leave the escape routes open."],
    v: "Run a test program that attempts disallowed calls in the sandbox and confirm each terminates the process with a filter violation recorded in host logs, while the standard runtimes pass their full conformance tests.",
    dep: ["host-os-minimal"]
  },
  "resource-limits": {
    s: "Enforced ceilings on memory, CPU, processes, file descriptors, disk and network for each sandbox, so one function cannot take capacity from its neighbors.",
    d: "Memory is limited by the VM size or cgroup, CPU by a share proportional to the memory setting and usually capped over short periods, and process counts and open files by quotas. Network bandwidth is shaped per sandbox. The enforcement point depends on the isolation mechanism: virtual machine configuration, kernel control groups, or the engine's own accounting. The hard part is fairness at the edges: bursts above the baseline CPU, noisy neighbors for disk and cache, and what happens at the limit, which is usually a kill for memory and throttling for CPU.",
    k: ["Hard caps vs. burstable shares: hard caps give predictability and protection, but waste idle capacity, while bursting raises utilization at the cost of variable performance.", "Kill on memory limit vs. let the process swap: killing is deterministic and protects the host, but swapping would hide the spike at the price of severe slowdown."],
    p: ["A fork bomb inside a sandbox exhausts process slots and affects tools on the host without a process limit.", "CPU throttling in short periods produces latency stalls that look like application bugs."],
    v: "Run workloads that exceed each limit in turn, memory, CPU, processes, file descriptors, and confirm each hits its configured ceiling, with the expected kill or throttle, and neighbors on the same host see no latency change.",
    dep: ["resource-sizing","host-os-minimal"]
  },
  "tenant-separation": {
    s: "The set of controls that stop one customer's functions from affecting or observing another's: isolation boundaries, scheduling rules, network segmentation and clean reuse practices.",
    d: "Beyond the sandbox itself, separation covers which tenants may share a host, which sandboxes may be reused for which function, how local storage is wiped, how the network prevents lateral movement, and how side channels are mitigated, for example by disabling simultaneous multithreading across tenants. Reuse is only within the same function and version, never across tenants. The design assumes any single mechanism may fail and layers several. It is verified by adversarial testing, not by inspection alone.",
    k: ["Co-locating many tenants per host vs. dedicated hosts for sensitive ones: sharing is cheap, while dedicated hosts remove classes of attack for premium workloads.", "Reuse sandboxes within a function only vs. a generic pool: restricting reuse prevents state leaks between customers, but raises cold start rates."],
    p: ["Leftover data in a reused sandbox's temporary directory leaks between invocations of the same function, including different end users.", "A hardware side channel crosses a boundary the software layers were assumed to hold."],
    v: "Run adversarial test functions from two tenants on the same host that try to read the other's memory, files and network traffic and the host's metadata service, and confirm every attempt fails and is logged.",
    dep: ["micro-vm-sandbox","container-sandbox","overlay-network"]
  },
  "ephemeral-storage": {
    s: "Scratch disk space inside the sandbox for temporary files, which is local, fast, limited in size, and erased when the sandbox is destroyed.",
    d: "Each sandbox gets a writable area, backed by host disk or memory, with a size limit configurable up to a cap. Contents survive between invocations in a warm sandbox but not across sandboxes, and are invisible to concurrent sandboxes of the same function. The platform wipes or discards the area at destruction, so one tenant's data is never visible to another. It is a cache and a work area, never storage. Code that treats it as durable loses data without warning.",
    k: ["Disk-backed scratch vs. memory-backed: disk is larger and cheaper, while memory is faster but counts against the memory limit.", "Persist between warm invocations vs. wipe each time: persistence enables caching of downloaded files, but risks leaking data between users of the same function."],
    p: ["Temporary files from earlier invocations fill the area until later calls fail with no space errors.", "Code assuming a file written by one invocation exists in the next fails whenever a different sandbox serves the request."],
    v: "Write a file in one invocation and read it in 100 concurrent ones, confirm it appears only in the sandbox that wrote it, and confirm a destroyed sandbox's storage is wiped before reuse of the underlying space.",
    dep: ["sandbox-lifecycle","resource-limits"]
  },
  "cold-start-path": {
    s: "Every step between a request with no free sandbox and the handler running: placement, sandbox creation, code fetch, runtime boot, extension and function initialization.",
    d: "The path is a sequence of dependent stages: scheduler decision, host admission, creating the VM or container, attaching the network, fetching and mounting code, starting the runtime, running init, and delivering the event. Each stage has its own typical cost and tail. Optimizations attack each: warm pools remove creation, caches remove fetch, snapshots remove runtime boot and init. The hard part is the tail, not the median: a rare slow step, such as a cache miss or a congested network setup, sets the experience of the unlucky request.",
    k: ["Optimize the median vs. the tail: median improvements are easy to show, but users feel the worst cases, which need different fixes such as prefetching and hedging.", "Pre-create generic sandboxes vs. create on demand: pre-creation removes boot from the path, but needs pool management and spare capacity."],
    p: ["A new network attachment step that takes a second under load adds a second to each cold start in a VPC.", "Averaged cold start figures hide a bimodal distribution where some starts are five times slower."],
    v: "Trace 10,000 cold starts and plot each stage's duration. Confirm the sum of stage times matches the total reported, and that the p99 total is within the platform's target.",
    dep: ["placement-scheduler","code-fetch-and-cache","init-phase","sandbox-lifecycle"]
  },
  "snapshot-restore": {
    s: "Starting a sandbox by restoring a saved memory and device state taken after the runtime and function have been initialized, skipping boot and init work.",
    d: "At publish the platform boots a sandbox, runs init, and writes its memory and device state to a snapshot. Starts then map the snapshot lazily, paging memory in on demand, which is much faster than booting. Snapshots are shared read-only across many sandboxes on a host using copy-on-write. The cost is state hygiene: a restored sandbox starts from an identical memory image, so random seeds, unique identifiers, network connections and clocks captured at snapshot time must be refreshed after restore.",
    k: ["Snapshot after init vs. boot normally: restoring is much faster, but code with captured state, such as connections and random seeds, must handle being cloned.", "Lazy page loading vs. full load: lazy loading starts immediately, but the first requests suffer page faults while the working set loads."],
    p: ["A random number generator seeded before the snapshot produces identical values in every restored sandbox.", "Network connections opened in init are copied into snapshots and are dead on arrival."],
    v: "Restore 100 sandboxes from one snapshot and confirm start time is a fraction of a normal boot, and that identifiers, random values and clocks inside each differ and network connections are re-established.",
    dep: ["micro-vm-sandbox","init-phase","package-store"]
  },
  "lazy-image-loading": {
    s: "Reading a container image's contents on demand as blocks or files are first touched, so a large image can start before it has fully arrived on the host.",
    d: "The image is stored in a format with an index, such as chunked and content-addressed blocks. The host mounts it through a block device or file system layer that fetches missing chunks from caches, then the store, as the process reads them. Profiling data from earlier starts records which chunks are needed at start-up, and these are prefetched. Duplicate chunks across images are stored once. Only a small part of most images is read during a start, so lazy loading often reduces start time by an order of magnitude.",
    k: ["On-demand chunk fetching vs. whole image download: on-demand starts early and saves bandwidth, but pays a latency penalty on each first-touch of a chunk.", "Profile-guided prefetch vs. pure on demand: prefetch removes the stalls for known access patterns, but needs profile collection and degrades if code paths change."],
    p: ["A code path rarely used reads a chunk not in cache, and a request stalls for the fetch from the origin.", "Image formats that are not chunk-friendly, such as one giant compressed file, defeat the approach."],
    v: "Start a 5 GB image function cold, and confirm start completes after reading only the fraction of chunks touched, with a request touching a new path adding a short, visible fetch delay in traces.",
    dep: ["container-image-functions","code-fetch-and-cache","package-store"]
  },
  "warm-sandbox-reuse": {
    s: "Serving later invocations from a sandbox that has already finished init, so they skip the cold start and get the lowest latency.",
    d: "After an invocation finishes the sandbox is frozen and marked idle in the pool. A new request for the same version takes it, thaws it, and delivers the event. State in memory and ephemeral storage is still there, which allows caching, but also means one invocation can see another's leftovers. Reuse is the main reason serverless latency is mostly low, and the main reason code must be written carefully: globals persist, but are not guaranteed to.",
    k: ["Reuse for efficiency vs. fresh sandbox per request: reuse is faster and cheaper, but permits state leakage between requests and needs careful cleanup.", "Reuse only within the same version and function: strict scoping protects tenants, but wastes warm sandboxes after a deploy."],
    p: ["A global variable holding per-request data leaks one user's information into the next request served by the same sandbox.", "After a deploy, traffic hits cold sandboxes of the new version all at once."],
    v: "Invoke 100 times in sequence with a counter in a global variable, confirm it increments across calls while a new version's first call starts from zero, and no state crosses to a different function.",
    dep: ["freeze-and-thaw","warm-pool-manager"]
  },
  "keep-alive-policy": {
    s: "The rule for how long an idle sandbox is retained after its last request, balancing the chance of reuse against the memory it occupies.",
    d: "Idle sandboxes are kept for a time that is typically minutes but not guaranteed, and are evicted earlier under memory pressure, with a hard maximum age for hygiene. Platforms may adapt per function using observed inter-arrival times, keeping hot functions longer. The policy is deliberately undocumented as a promise: owners are told not to depend on it. Its cost is borne by the platform, since idle time is not billed, so it is a lever between customer experience and fleet efficiency.",
    k: ["Longer retention vs. shorter: longer lowers cold start rate, but ties up memory that earns no revenue.", "Per-function adaptive retention vs. one global timer: adaptive reduces waste on rare functions, but needs inter-arrival tracking and can be gamed by periodic pings."],
    p: ["Keep-warm pings sent by users to dodge cold starts create fake traffic and still miss concurrent bursts.", "Assuming a sandbox lives a fixed time leads to code that caches a value forever."],
    v: "Call a function at intervals from 1 to 30 minutes and record the interval at which cold starts begin, then compare with the policy's design target and its variation across hosts.",
    dep: ["warm-pool-manager","sandbox-lifecycle"]
  },
  "runtime-startup-tuning": {
    s: "Reducing the time the language runtime and function code take to become ready, through lighter runtimes, ahead-of-time compilation, class data sharing, and trimming what is loaded at init.",
    d: "Part of cold start is inside the function owner's control. Compiled or ahead-of-time forms avoid slow interpreter startup and just-in-time warm-up; smaller dependency trees mean less to read and parse; lazy imports defer work until needed; and platform-provided runtimes may include pre-warmed images or shared caches. Memory size matters too, because CPU scales with it and init is CPU-bound. The work is measured on the init duration in invocation records, and there are diminishing returns once other stages dominate.",
    k: ["Ahead-of-time compilation vs. interpreter or JIT: compiled artifacts start fast, but have build complexity and larger packages.", "Lazy imports vs. eager: lazy imports shorten init, but move the cost to the first request that needs them."],
    p: ["Optimizing the runtime while a network call in init takes ten times as long wastes the effort.", "Trimmed dependencies break a rarely used path that only fails in production."],
    v: "Compare init duration across 100 cold starts before and after each change, using the invocation records, and confirm a reduction beyond the run-to-run spread with correct behavior on every code path.",
    dep: ["init-phase","function-package","resource-sizing"]
  },
  "cold-start-measurement": {
    s: "Observing how often cold starts happen and how long they take, by function, version and phase, so that regressions and tuning effects can be seen.",
    d: "Platform records flag each invocation as cold and report init duration separately from handler duration. Traces split a cold start into stages such as fetch and boot. Aggregating by percentile and by rate lets owners see both how many requests pay and how much. Synthetic probes that call a function after long idle gaps measure the true worst case, since real traffic keeps pools warm. The pitfall is measuring the wrong thing: client-side timing includes the network and queueing that the platform cannot control.",
    k: ["Real traffic measurement vs. synthetic cold probes: real traffic reflects what users see but rarely produces cold starts, while probes force them and may not match the real mix.", "Report init time separately vs. folded into duration: separation shows where time goes, but customers must add the two to see request latency."],
    p: ["Looking only at average duration hides that one in fifty requests pays a multi-second cold start.", "Probes that run in one region at one hour miss variation by host type and time of day."],
    v: "Force 200 cold starts by publishing a new version and invoking concurrently, and confirm the cold-start rate and init-duration distribution computed from records matches the count of new sandboxes the platform reports creating.",
    dep: ["invocation-records","trace-propagation","cold-start-path"]
  },
  "stateless-contract": {
    s: "The rule that code must not depend on anything remembered in the sandbox between invocations, which lets the platform start, stop and scale sandboxes freely.",
    d: "Anything the function needs to remember belongs in an external store. Local memory and disk may act as a cache, valid only when it happens to be there, and never as the system of record. In exchange, the platform can run any invocation in any sandbox, add or lose sandboxes at any moment, retry elsewhere, and move work between hosts. The contract is also what makes scaling to zero safe. Violations are easy to commit because warm reuse makes local state appear reliable during testing.",
    k: ["Strict statelessness vs. sticky routing to one sandbox: statelessness scales and recovers trivially, while stickiness gives local state at the cost of hot spots and loss on failure.", "Cache in memory with an external fallback vs. always fetch: caching saves latency, but needs a correct miss path and invalidation."],
    p: ["A counter held in a global variable gives different answers depending on which sandbox serves the request.", "A local cache without expiry serves stale configuration after the source changed."],
    v: "Run the function behind concurrency of 50 and verify results are identical whichever sandbox serves each request, then destroy all sandboxes mid-run and confirm no data or correctness is lost.",
    dep: ["external-state-stores","warm-sandbox-reuse"]
  },
  "external-state-stores": {
    s: "The databases, object stores, caches and queues that hold state outside the function, chosen for per-request access patterns and for tolerating very many short-lived clients.",
    d: "Functions reach stores over the network on each invocation, so latency and connection behavior matter. Stores with HTTP-style, connectionless APIs and per-request authentication fit best, since they need no persistent connection. Traditional databases with long-lived connections and fixed connection limits fit poorly unless a pooling proxy sits between. Choosing a store defines what consistency, latency and cost per call the function inherits. The design problem is that thousands of concurrent sandboxes become thousands of concurrent clients.",
    k: ["Connectionless request-based stores vs. connection-oriented databases: request-based stores scale with the function without pooling, while connection-oriented ones offer richer queries but need a proxy.", "Store near the function in the same region vs. remote: same region cuts latency and egress cost, but reduces options for global data."],
    p: ["A burst of sandboxes opens more database connections than the server allows and every function fails.", "Cross-region calls from a function add 100 ms or more to every request."],
    v: "Scale the function to 1,000 concurrent invocations against the store and confirm the store's connection count and error rate stay within limits and per-call latency stays at the expected figure.",
    dep: ["connection-pooling-proxy","outbound-networking"]
  },
  "connection-pooling-proxy": {
    s: "A managed intermediary that holds a small pool of long-lived database connections and multiplexes the many short-lived function clients onto it.",
    d: "Each sandbox connects to the proxy, which maps client sessions to a limited number of backend connections, reusing them between requests. It handles authentication with the function's role, so credentials need not be embedded. It absorbs connection storms from scale-out and from sandbox churn. Session-level state, such as prepared statements, temporary tables and transaction settings, can pin a client to a backend connection and defeat multiplexing. The proxy also becomes a component whose own availability and latency matter.",
    k: ["Transaction-level multiplexing vs. session pinning: multiplexing gives high reuse, but breaks session features, while pinning is compatible and reduces sharing.", "Proxy in front of the database vs. app-side pooling: a proxy is shared by all sandboxes, while an in-sandbox pool cannot be shared across concurrent sandboxes."],
    p: ["Use of session variables silently pins connections and makes the pool as large as the number of clients.", "The proxy becomes a single point of failure and a hidden extra hop in every query."],
    v: "Run 2,000 concurrent short invocations that each run a query and confirm the database sees at most the pool size in connections, with query latency overhead from the proxy under the stated figure.",
    dep: ["external-state-stores","execution-role"]
  },
  "outbound-networking": {
    s: "How code in a sandbox reaches the internet and other services: addresses, DNS, connection reuse, timeouts and the transport rules the platform applies to outbound traffic.",
    d: "By default sandboxes get outbound access through the platform's shared network, with a managed DNS resolver. Connection reuse across warm invocations is a performance gain but the frozen state breaks idle connections. Clients need explicit timeouts shorter than the function timeout, or a hanging call consumes the whole deadline. Bandwidth is shaped per sandbox. The hard problems are tail behaviors: DNS stalls, TLS handshakes on every cold start, and retried calls that add to the function's duration and therefore its cost.",
    k: ["Reuse connections across invocations vs. connect each time: reuse saves handshake latency, but must handle connections that died during freeze.", "Short client timeouts with retry vs. long timeouts: short timeouts bound the damage of slow dependencies, but risk abandoning slow successes."],
    p: ["A client with no timeout waits for a hung dependency until the function itself is killed.", "DNS caching beyond record time-to-live sends traffic to retired addresses after a failover."],
    v: "Block a dependency so it accepts connections but never replies, and confirm the function's client timeout triggers well before the function timeout and the error is logged with the dependency name.",
    dep: ["overlay-network","egress-gateways"]
  },
  "private-network-attachment": {
    s: "Placing a function's sandboxes on a customer's private virtual network so they can reach private databases and services, using network interfaces mapped by the platform.",
    d: "The platform creates shared network interface resources in the customer's subnets and maps sandbox traffic to them through a translation layer, instead of giving each sandbox its own interface. Mapping setup used to dominate cold starts; sharing interfaces across many sandboxes of the same function moved it out of the request path. Security groups apply to those interfaces. The remaining hard issues are subnet address exhaustion, correct routing for internet access, and the interface setup time when a function is first deployed.",
    k: ["Shared interface per subnet-security group combination vs. one interface per sandbox: sharing removes setup from cold starts and saves addresses, but concentrates traffic on fewer interfaces.", "Private attachment vs. public endpoints with authentication: attachment keeps traffic private, but adds networking complexity and egress configuration."],
    p: ["Small subnets run out of addresses under scale-out, and new sandboxes fail to attach.", "An attached function loses internet access because no translation gateway route exists."],
    v: "Attach a function to a private subnet, call a database that has no public address, and confirm success, then scale to a high concurrency and confirm no address exhaustion and cold start time shows no per-sandbox interface setup.",
    dep: ["overlay-network","tenant-separation"]
  },
  "egress-gateways": {
    s: "Gateways through which sandboxes leave private or shared networks for the internet, supplying stable source addresses, translation, filtering and logging.",
    d: "A function on a private network needs a gateway to reach external services; the gateway translates internal addresses to a small set of public ones that third parties can allow-list. Gateways can enforce egress policy, such as permitted destinations, and record flows for audit. Capacity and port limits bound how many simultaneous connections a single address can sustain. The failure modes are exhaustion of translation ports under heavy parallel connections and the cost of per-gigabyte processing charges.",
    k: ["Fixed egress addresses via a gateway vs. dynamic shared addresses: fixed addresses allow partners to allow-list, but add a bottleneck and a cost line.", "Destination allow-listing at the gateway vs. none: allow-lists limit data exfiltration, but need maintenance as dependencies change."],
    p: ["A burst of parallel outbound connections exhausts the gateway's port allocations, and calls fail intermittently.", "Traffic to the provider's own services goes through the gateway when a private endpoint would be cheaper and faster."],
    v: "Open thousands of parallel outbound connections from many sandboxes and confirm they egress from the stated addresses with no translation failures, and a destination outside the allow-list is blocked and logged.",
    dep: ["overlay-network","private-network-attachment"]
  },
  "file-system-mounts": {
    s: "Attaching a network file system to a function, so many sandboxes can share durable files, large models or datasets beyond what the package and scratch disk allow.",
    d: "A shared file system is mounted into the sandbox at start over the private network, with access controlled by the execution role and network rules. It gives POSIX semantics, persistence and sizes far beyond the package limit, which suits models, shared caches and legacy file-based code. Costs are mount time on cold start, per-operation latency, throughput limits and the need for a private network attachment. Concurrent writers need explicit locking, since many sandboxes may update the same files.",
    k: ["Network file system vs. fetch from object storage at start: the file system offers lazy access and shared writes, but adds latency per operation and a mount step.", "Read-only shared data vs. read-write: read-only is safe and cacheable, while shared writes need locking and risk conflicting updates."],
    p: ["Many sandboxes writing the same file without locks corrupt it.", "Throughput limits on the file system throttle all functions mounting it when one scans a large dataset."],
    v: "Mount a file system in 100 concurrent sandboxes, have each read a large file and append to a shared one with locks, and confirm throughput meets the stated figure and the appended file contains every record intact.",
    dep: ["private-network-attachment","execution-role","external-state-stores"]
  },
});
