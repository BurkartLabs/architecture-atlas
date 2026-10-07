// Details for the cluster orchestrator plate, part 5: node agent, node plugin interfaces, state store.
ATLAS.details("cluster-orchestrator", {
  "node-agent": {
    s: "The daemon on each machine that watches the API for workload units assigned to its node and drives the runtime, volumes and networking until they match.",
    d: "It registers the node, then watches for units bound to it, plus static definitions from local files. A sync loop per unit compares the spec with what the runtime reports, starts or stops containers, mounts volumes, runs probes and posts status upstream. It enforces resource limits, reclaims images and disk and evicts workloads under pressure. It keeps running what it already has if the API is unreachable. The hard part is that it is the only component with authority over a machine, so its bugs and credentials are high-impact.",
    k: ["Autonomous agent versus central control of each machine: autonomy survives control-plane outages and scales, but behavior must be consistent across thousands of independently running copies.", "Restricted node-scoped API credentials versus broad access: scoping limits a compromised node, but needs authorizers aware of which units belong to which node."],
    p: ["Restarting the agent on a loaded node briefly stops probes and status, and the control plane marks the node unhealthy.", "A node credential with broad rights turns one compromised machine into a cluster compromise."],
    v: "Disconnect a node from the API for ten minutes. Confirm its running workloads keep running and probes keep restarting failing containers, then reconnect and confirm status catches up without restarting healthy units.",
    dep: ["workload-sync-loop", "container-runtime-interface", "node-registration-heartbeat", "api-server"]
  },
  "node-registration-heartbeat": {
    s: "How a node announces itself, its capacity and labels to the API, and proves it is alive by periodically renewing a lease and posting status.",
    d: "At startup the agent creates or updates its node object with capacity, allocatable resources after reserving system overhead, labels, addresses and versions. Afterwards it renews a small lease object frequently, cheap enough for thousands of nodes, and posts full status much less often or on change. The node lifecycle controller watches the lease. Credentials are usually obtained through a bootstrap token and a signing request. The hard part is the tradeoff between detection speed and false alarms: a short grace period detects failure quickly but evicts workloads when the network flickers.",
    k: ["Small lease renewals versus whole status objects as heartbeats: leases are cheap and keep store writes low, but carry no detail on node health.", "Short versus long failure detection time: short recovers faster, but evicts through brief network blips."],
    p: ["Status updates every few seconds from thousands of nodes were the main load on the store before leases existed.", "A node that restarts with a changed name registers as a new node, leaving the old one stale."],
    v: "Watch a node's lease and confirm renewal at the configured interval. Stop the agent and confirm the node's ready condition changes after the grace period, not before.",
    dep: ["leases", "node-agent", "control-plane-pki", "node-lifecycle-controller"]
  },
  "workload-sync-loop": {
    s: "The per-unit reconcile in the node agent that compares the desired spec with the runtime's actual containers and takes the next step toward it.",
    d: "Triggered by spec changes, probe results, runtime events and a periodic resync, a worker per unit computes what to do: create the sandbox, pull images, run init containers in order, start containers, restart those that exited per policy, or kill extras. It updates unit status with container states and conditions. Per-unit workers are serialized so one unit is never changed by two threads. The hard part is crash safety: the agent can die at any step, so every step must be derived from runtime state, not from memory.",
    k: ["Per-unit worker serialization versus global lock: per-unit workers allow parallel progress across units, but need careful handling when a spec changes mid-operation.", "Relisting runtime state periodically versus relying on events: events are fast, but periodic relisting recovers from lost events at a cost proportional to container count."],
    p: ["A container restart loop with growing backoff looks like a hang until the backoff reaches its cap.", "Runtime relists on nodes with hundreds of containers become slow and delay status updates."],
    v: "Kill a container's process directly on the node. Confirm the loop observes the exit, restarts per policy with increasing backoff, and posts the new restart count to the API status.",
    dep: ["container-runtime-interface", "node-agent", "image-management", "probe-workers"]
  },
  "container-runtime-interface": {
    s: "The remote-procedure interface the node agent uses to create sandboxes, start and stop containers, pull images and fetch logs, so any compliant runtime can be plugged in.",
    d: "Two services are defined: one for runtime operations on sandboxes and containers, with streaming for exec and attach, and one for images. The agent calls them over a local socket. The runtime sets up namespaces, cgroups, the root filesystem and, through the workload network plugin, the sandbox's network. Capabilities and status are reported for resource accounting. The hard part is version evolution: the interface grew over many releases, and agent and runtime must agree on features such as sandbox statistics and user namespace support.",
    k: ["Narrow standard runtime interface versus agent-embedded runtime code: the interface frees the agent from runtime specifics and allows alternatives, but constrains features to what it models.", "Local socket versus network RPC: a socket is simple and secure by file permission, but anything with socket access controls all containers on the node."],
    p: ["Mismatched agent and runtime versions disable features silently or fail only on particular calls.", "Mounting the runtime socket into a workload gives it full control of the node."],
    v: "Call the runtime directly through the interface to create a sandbox, pull an image, start a container and list it. Confirm the agent, restarted afterward, adopts them and reports them in unit status.",
    dep: ["image-management", "network-plugin-interface", "runtime-classes", "qos-and-cgroups"]
  },
  "image-management": {
    s: "The agent's handling of container images: pulling with credentials on demand, garbage-collecting unused layers by disk pressure and limiting pull concurrency.",
    d: "Before starting a container the agent asks the runtime to pull per the pull policy: always, only if absent, or never. Registry credentials come from unit-level secrets or credential providers. Parallel pull limits and serialized options protect the node and the registry. Under disk pressure an image collector deletes least recently used unreferenced images down to a low threshold. The hard part is thundering herds: a rollout pulling a large image onto hundreds of nodes saturates the registry and delays startup.",
    k: ["Always-pull versus if-not-present: always-pull guarantees freshness for mutable tags, but adds latency and registry dependency to every start.", "Pre-pulling and peer distribution versus pulling on demand: pre-pull removes start latency, but needs extra tooling and disk."],
    p: ["Mutable tags like latest give different containers on different nodes because they pulled at different times.", "Image garbage collection under disk pressure deletes an image just before a restart needs it."],
    v: "Deploy a new image to ten nodes and measure pull time per node. Confirm each node pulls once and starts, then fill the disk past the threshold and confirm unused images are removed oldest first.",
    dep: ["container-runtime-interface", "secrets", "workload-sync-loop"]
  },
  "probe-workers": {
    s: "The node agent's schedulers that run startup, liveness and readiness probes at their periods and report results to the status manager and the restart logic.",
    d: "Each probe on each container gets a worker that waits for its period, runs the check and applies thresholds to flip state. HTTP and TCP probes run from the agent's network, command probes execute inside the container through the runtime, and a remote-procedure probe checks a health service. Results go to the status manager, which posts readiness to the API and triggers restart on liveness failure. The hard part is scale and honesty: thousands of probes on a node consume CPU, and a probe running from the agent may not take the path real clients take.",
    k: ["Probing from the node agent versus from sidecars or the application: agent probes are uniform and need no changes to images, but see the network only from the node.", "Command probes versus network probes: commands can check internal state, but spawn a process in the container for every check."],
    p: ["Command probes on a large number of containers add measurable CPU and process churn on the node.", "A probe that passes from localhost misses a listening address that real clients cannot reach."],
    v: "Configure an HTTP probe with a two-second period and three failures. Break the endpoint and confirm the container reports unready after about six seconds, the status reaches the API and endpoints drop it.",
    dep: ["workload-sync-loop", "container-runtime-interface", "health-probes"]
  },
  "node-pressure-eviction": {
    s: "The agent's defense against running out of memory, disk or process IDs: it watches thresholds and evicts workload units in a defined order to recover.",
    d: "The agent compares signals such as available memory, filesystem space, inodes and PIDs against soft thresholds with a grace period and hard thresholds with none. On crossing, it marks node conditions so the scheduler and taints react, reclaims images and logs first, then evicts units ranked by whether usage exceeds requests, then priority, then usage above requests. It sets the failed phase with a reason. The hard part is racing the kernel: the out-of-memory killer can act before the agent samples, and kills by its own criteria.",
    k: ["Proactive eviction at thresholds versus relying on the kernel killer: proactive eviction is orderly and priority-aware, but can act late or over-evict, while the kernel acts at the last moment and arbitrarily.", "Soft threshold with grace versus hard only: soft thresholds ride out brief spikes, but allow pressure to build."],
    p: ["Memory spikes faster than the sampling interval, so the kernel kills a process before the agent acts.", "Units without requests are evicted first and repeatedly, then recreated onto the same pressured node."],
    v: "Run memory-hungry units with different requests on a node until the threshold is crossed. Confirm the node condition appears, units whose usage exceeds requests are evicted first, and a taint stops new placement.",
    dep: ["qos-and-cgroups", "requests-and-limits", "taints-and-tolerations", "image-management"]
  },
  "resource-managers": {
    s: "Optional node agent components that give units exclusive CPUs, pinned memory and aligned devices on the same hardware topology for latency-sensitive or accelerated workloads.",
    d: "The CPU manager can assign whole cores exclusively to units with integer CPU requests and guaranteed class, removing them from the shared pool. The memory manager pins memory to specific NUMA nodes, and the device manager allocates accelerators through plugins. A topology manager merges hints from each so everything for one unit lands on the same node of the hardware, or rejects the unit. The hard part is fragmentation: exclusive assignment strands capacity, and alignment failures surface as rejected units on a node that looked free to the scheduler.",
    k: ["Exclusive pinned resources versus shared pools: pinning gives predictable latency and cache behavior, but strands capacity and complicates packing.", "Best-effort versus strict topology alignment: strict alignment guarantees locality, but rejects units that the scheduler already placed."],
    p: ["The scheduler places a unit that the node's topology manager then rejects, leaving it failed on a node with free resources.", "Exclusive cores reserved for a few units leave the shared pool too small for everything else."],
    v: "Run a guaranteed unit requesting four whole CPUs and confirm it is pinned to four cores on one hardware node, that no other unit's processes run on those cores, and memory comes from the same node.",
    dep: ["qos-and-cgroups", "device-plugins", "requests-and-limits", "node-agent"]
  },
  "qos-and-cgroups": {
    s: "The mapping of requests and limits onto kernel control groups, with three quality-of-service classes that decide CPU weight, memory limits and who is killed first.",
    d: "Each container gets cgroup settings: CPU shares proportional to requests, a CPU quota from the limit and a memory limit. Units whose requests equal limits for every container are guaranteed; those with some requests are burstable; those with none are best-effort. Units sit under a class-level group, so classes share the machine fairly. The kernel's out-of-memory killer prefers processes in lower classes by score adjustment. The hard part is that CPU limits throttle in short windows, hurting tail latency, and memory limits kill rather than slow.",
    k: ["Cgroup enforcement by the kernel versus user-space policing: the kernel enforces precisely and cheaply, but its semantics, like throttling and killing, are blunt.", "Three coarse classes versus fine-grained priorities: classes are simple and predictable, but cannot express nuance between workloads of the same class."],
    p: ["A best-effort workload on a loaded node is starved and then evicted without notice.", "Throttling from a low CPU limit raises latency even when the node's CPU is mostly idle."],
    v: "Inspect the cgroup tree for guaranteed, burstable and best-effort units. Confirm CPU shares, quota and memory limit match the spec, and the classes appear under separate parent groups.",
    dep: ["container-runtime-interface", "requests-and-limits"]
  },
  "streaming-endpoints": {
    s: "The agent's server for logs, command execution, attach and port forwarding, which the API server proxies so users never connect to nodes directly.",
    d: "A client request for logs or an exec session goes to the API server, which authorizes it and opens a connection to the node agent's server over a client-certificate-secured link. The agent asks the runtime for the stream and relays data, using multiplexed protocols for the interactive cases. Log files are written and rotated by the runtime or agent. The hard part is that these requests are long-lived, bypass the normal request-response model, and give shell-level access, so they need distinct authorization and are a target for abuse.",
    k: ["Proxying through the API server versus direct client connections: proxying gives one authenticated door and no node access for users, but adds load and a hop for every byte.", "Logs from node-local files versus a central collector: local files are simple and always available, but vanish with the node and cover only recent history."],
    p: ["Execution permission is granted casually, but it gives shell access to a container and its secrets.", "Logs are lost when a node is replaced, because they were only on its disk."],
    v: "Run exec and log retrieval through the API against a unit. Confirm both are authorized with distinct permissions, appear in audit logs, and that a user without the exec permission is denied.",
    dep: ["node-agent", "api-server", "rbac", "container-runtime-interface"]
  },
  "node-volume-manager": {
    s: "The agent component that mounts and unmounts volumes for the units on its node, formatting if needed, and refuses to start containers until required volumes are ready.",
    d: "A desired-state-of-world is built from assigned units and an actual-state-of-world from mounts on disk. A reconciler mounts what is missing and unmounts what is no longer needed, once containers have stopped. For network disks it waits for the attach, then stages the device to a global path and publishes it into each unit's directory through the storage plugin. Secrets and config are written into memory-backed volumes. The hard part is cleanup: unmounting a busy volume fails, and orphaned mounts after a crash must be rediscovered.",
    k: ["Reconciling desired and actual mounts versus imperative mount at start: reconciling survives crashes and finds orphans, but needs two models of the world to keep in sync.", "Waiting for volumes before starting containers versus starting and failing: waiting avoids application errors on missing data, but blocks the unit visibly in container-creating state."],
    p: ["A unit stuck terminating because its volume cannot unmount holds the disk and blocks the replacement on another node.", "A formatting step on a volume that already has data can destroy it if the check is wrong."],
    v: "Schedule a unit with a claim and confirm the volume mounts before any container starts. Delete the unit and confirm containers stop first, then the mount is removed and the device detached.",
    dep: ["storage-plugin-interface", "volumes", "volume-attach-and-bind", "node-agent"]
  },
  "network-plugin-interface": {
    s: "A small standard contract in which the runtime calls an executable or service to wire a new sandbox into the workload network and to tear it down.",
    d: "When a sandbox is created the runtime creates its network namespace and invokes the configured plugin with an add command and a JSON configuration naming the interface and parameters; the plugin creates a virtual interface, assigns an address through address management, sets routes and returns the result. A delete command reverses it. Plugins can be chained for features such as bandwidth limits. The hard part is idempotency and cleanup: leaked interfaces and addresses after crashes exhaust address space.",
    k: ["Plugin executables per call versus long-running daemons: executables are simple and stateless, while daemons keep state and respond faster, but are another component that must be running.", "A thin interface versus rich network integration: thin keeps plugins swappable, but features like network policy fall outside it and need their own channel."],
    p: ["Sandboxes deleted with a crashing plugin leak addresses until the pool is exhausted.", "Units start before the plugin is installed on a new node and remain stuck without networking."],
    v: "Create a sandbox and confirm the plugin was called with add, an interface exists with an address and routes, and the unit can reach another node's unit. Delete it and confirm the interface and address are released.",
    dep: ["pod-ip-management", "overlay-and-routing", "container-runtime-interface"]
  },
  "pod-ip-management": {
    s: "Allocation of a unique address to every workload unit from per-node ranges of a cluster-wide block, with release on deletion and no overlap.",
    d: "The cluster has a block of addresses; each node receives a range, either carved by a controller when the node registers or leased dynamically by the network plugin. A local allocator hands one address per sandbox and records it on disk. The invariant is that every unit has a unique, directly routable address, so no translation is needed between units. The hard part is planning: ranges must be sized for the maximum node and unit counts at creation, since they are difficult to change, and exhaustion stops scheduling on a node.",
    k: ["Fixed per-node ranges versus dynamic pooled allocation: fixed ranges are simple and route-aggregable, but waste addresses on lightly used nodes.", "One flat address space versus translation per node: flat is simple for applications and tools, but demands a large routable block and integration with the underlying network."],
    p: ["An undersized cluster block limits the maximum node count or unit density, found only when growing.", "Address ranges that overlap with the corporate network make some destinations unreachable from units."],
    v: "Create more units on one node than the range allows and confirm scheduling on it stops with an address exhaustion event. Delete units and confirm their addresses return to the pool and are reusable.",
    dep: ["network-plugin-interface", "node-registration-heartbeat"]
  },
  "overlay-and-routing": {
    s: "The data plane that carries traffic between units on different nodes, by encapsulating packets over the machine network or by routing unit addresses natively.",
    d: "An overlay wraps each packet in an outer packet addressed to the destination node, and unwraps it there, working over any network but adding header overhead and some CPU cost. Native routing advertises each node's address range to the underlying routers or sets cloud routes, avoiding encapsulation, but needs control of the network. Programmable kernel data paths can replace both with direct forwarding. The hard part is the interaction with the physical network: packet sizes, fragmentation and routing convergence cause the hard-to-find failures.",
    k: ["Overlay encapsulation versus native routing: overlay works anywhere, while native routing is faster and easier to debug, but needs cooperation from the network.", "Kernel-programmable forwarding versus rule-chain based: programmable paths scale and observe better, but depend on newer kernels."],
    p: ["Encapsulation overhead shrinks the usable packet size, so large packets are silently dropped or fragmented.", "Routing tables not updated after a node replacement send traffic to a machine that no longer exists."],
    v: "Send large packets between units on different nodes and confirm they arrive without fragmentation failure. Replace a node and confirm routes or tunnels to its range update within the stated convergence time.",
    dep: ["network-plugin-interface", "pod-ip-management"]
  },
  "device-plugins": {
    s: "An interface by which vendor daemons advertise special hardware such as accelerators to the node agent, which then offers it as a countable resource workloads can request.",
    d: "A plugin registers with the agent over a local socket, reports device identifiers and health, and answers allocation requests with the device files, mounts and environment variables a container needs. The agent surfaces the count as an extended resource that the scheduler counts like CPU, integer only. When a unit requests devices, the agent asks the plugin to allocate specific ones. The hard part is that devices are opaque to the scheduler: sharing, fractional use, and topology between devices need extra mechanisms.",
    k: ["Opaque countable resources versus first-class device modeling: counting is simple and works with the existing scheduler, but cannot express sharing, attributes or partial use.", "Vendor daemon per node versus built-in support: daemons support any hardware without core changes, but need installation and driver compatibility on every node."],
    p: ["A device that fails health checks after allocation leaves the unit running without its hardware.", "Requesting one device of a type when the model matters lands the unit on the wrong hardware generation."],
    v: "Register a plugin with four devices, run a unit requesting two, and confirm the node's allocatable shows four, the unit sees exactly two device files, and a second unit requesting three stays pending.",
    dep: ["node-agent", "resource-managers", "requests-and-limits"]
  },
  "runtime-classes": {
    s: "Named choices of container runtime configuration, such as a standard or a sandboxed virtual-machine runtime, that a workload selects to trade isolation for performance.",
    d: "A class names a handler that the runtime has configured, plus optional overhead and scheduling constraints. A unit referencing the class has its sandbox created with that handler; overhead is added to its requests for scheduling and accounting, and selectors send it to nodes that have the handler. Stronger-isolation handlers run each unit in a lightweight virtual machine. The hard part is heterogeneity: not every node supports every class, and the sandbox adds memory and start-up cost that must be accounted for.",
    k: ["Selectable per-workload runtime versus one runtime for the cluster: per-workload choice lets untrusted code use stronger isolation, but complicates node pools and testing.", "Declared overhead versus ignoring it: declared overhead keeps scheduling honest, but needs measured values per class."],
    p: ["A class used on nodes that lack the handler leaves the unit failing at sandbox creation.", "Unaccounted sandbox overhead overcommits nodes running many isolated units."],
    v: "Create a unit with a sandboxed class and confirm it lands on a supporting node, that its sandbox runs under the isolating runtime, and that its scheduling request includes the declared overhead.",
    dep: ["container-runtime-interface", "filtering", "workload-unit"]
  },
  "cloud-provider-interface": {
    s: "A standard interface that cloud-specific controllers implement to translate cluster concepts into infrastructure resources: node metadata, routes, load balancers and instance lifecycle.",
    d: "A separate controller process, released with the cloud provider, runs loops that look up each node's instance to set its zone, type and addresses, delete node objects when instances vanish, program routes for address ranges and manage external load balancers. It is called through a defined interface of instances, zones, load balancers and routes. Moving this out of the core let the core stay cloud-neutral. The hard part is eventual consistency of the cloud API: calls are rate-limited, slow and may be partially applied.",
    k: ["Out-of-tree provider controllers versus provider code inside the core: out-of-tree allows independent releases and a neutral core, but adds a component and migration work for existing clusters.", "Deleting node objects when instances disappear versus waiting: deleting reacts quickly and cleans up, but a mistaken lookup removes a healthy node."],
    p: ["Cloud API rate limits delay load balancer and route changes during large events.", "Nodes registering before the provider initializes them carry an uninitialized taint, which blocks scheduling until set."],
    v: "Terminate an instance outside the cluster and confirm its node object is removed within the expected time. Add an instance and confirm the node gains zone and type labels and loses the uninitialized taint.",
    dep: ["api-server", "informers-and-caches", "reconciliation-loops"]
  },
  "consensus-backed-store": {
    s: "A replicated, strongly consistent key-value store that holds every cluster object, ordering all writes through a leader and committing them by majority.",
    d: "A leader receives writes, appends them to a replicated log, and commits when a majority has persisted them to disk; reads can be linearizable or served from a replica. Each write bumps a global revision, which becomes resource versions, and the store offers transactions with compare-and-swap, range reads and watches from a revision. Only the API server talks to it. The hard part is its sensitivity to disk and network latency: slow fsyncs and large objects cause leader changes and cluster-wide stalls.",
    k: ["Strong consistency with majority commit versus availability under partition: strong consistency gives safe compare-and-swap and ordering, but a lost majority makes the cluster read-only or unavailable.", "Small, frequently-read objects only versus bulk data: limiting object size keeps latency predictable, but means large payloads go elsewhere."],
    p: ["Slow disks make commit latency spike, causing leader elections and API timeouts across the whole cluster.", "Running the store on a shared machine with noisy neighbors makes performance unpredictable."],
    v: "Write an object and read it from each member. Kill the leader and confirm a new one is elected, writes resume within seconds, and no acknowledged write is lost.",
    dep: ["quorum-and-members", "compaction-and-defrag", "control-plane-pki"]
  },
  "quorum-and-members": {
    s: "The membership of the store's replicas, typically three or five, and the rule that a majority must be alive and connected for any write to commit.",
    d: "An odd number of members tolerates failures up to a minority: three tolerate one, five tolerate two. Membership changes are made one at a time through the log itself, with new members starting as non-voting learners until caught up. Members are spread across failure domains, but each added distance raises commit latency. Larger sets do not scale writes; they only add fault tolerance and slow commits. The hard part is operations: replacing a failed member, restoring from backup and avoiding split decisions need exact procedure.",
    k: ["Three versus five members: five survive two failures or a failure during maintenance, but every write waits for more replicas and has more to operate.", "Learner stage versus direct voting join: a learner catches up without affecting quorum, while a direct join can stall commits if slow."],
    p: ["Losing a majority makes the store unwritable, and recovery requires restoring a snapshot and rebuilding.", "Adding two members at once in a cluster of two risks making quorum unreachable."],
    v: "In a three-member store, stop one member and confirm writes continue, then stop a second and confirm writes are refused and reads follow the configured mode. Restart one and confirm writes resume.",
    dep: ["consensus-backed-store", "failure-domains"]
  },
  "watch-cache": {
    s: "A cache inside the API server that follows the store's changes per resource type, serving most lists and all watches from memory rather than from the store.",
    d: "For each type the API server opens one watch on the store and keeps the latest state and a sliding window of recent events. Client watches resume from versions within the window and list calls with relaxed consistency are answered from memory, while strict reads go to the store. It fans events out to many watchers with per-watcher buffers. The hard part is memory and freshness: a type with huge objects or churn consumes memory, and the cache is slightly behind the store.",
    k: ["Serving from cache versus reading the store: cache gives scale to thousands of clients, but results can lag, and consistent reads must opt in at higher cost.", "Event window size: a bigger window lets slow clients resume without relisting, but costs memory in proportion to churn."],
    p: ["A cache that has not caught up serves a list that misses an object created moments ago.", "A flood of changes overruns the window, and every watcher must relist at once."],
    v: "Create an object and read it with relaxed and with strict consistency. Confirm the strict read always sees it, the relaxed read sees it within a bounded delay, and watches resume from a version within the window.",
    dep: ["consensus-backed-store", "resource-versions"]
  },
  "compaction-and-defrag": {
    s: "Periodic removal of old revisions from the store's history and reclamation of the freed disk space, to keep size and latency within limits.",
    d: "The store keeps every revision so watches and consistent reads can look back. Compaction discards revisions older than a chosen point, on a schedule or by the API server, which compacts every few minutes. It marks space free but does not shrink the file; defragmentation rewrites the data file to give space back, blocking that member while it runs. A quota on database size, when hit, makes the store reject writes. The hard part is that these are mandatory maintenance whose absence leads to an alarm and a write outage.",
    k: ["Frequent versus rare compaction: frequent keeps size small and load steady, but shortens how far back a lagging watcher can resume.", "Defragmenting one member at a time versus all at once: one at a time keeps quorum and availability, while all at once is faster but stalls writes."],
    p: ["Reaching the size quota raises an alarm that makes the store reject all writes until space is freed.", "Defragmenting the leader during peak load stalls commits and triggers an election."],
    v: "Fill the store with churn, record its size, run compaction and defragmentation one member at a time. Confirm file size shrinks, writes keep succeeding throughout, and old revisions are no longer readable.",
    dep: ["consensus-backed-store", "quorum-and-members"]
  },
  "store-snapshots": {
    s: "Point-in-time copies of the store's data, and the procedure to restore a cluster from one after the loss of a majority or accidental deletion.",
    d: "A snapshot is taken from a member's backend and saved off the machine, ideally on a schedule. Restoring builds a new cluster from the snapshot with fresh membership, discarding the old consensus identity so that members cannot rejoin with stale logs. The control plane is restarted against it, and controllers reconcile the real world to the recorded desired state. Objects created after the snapshot are gone and their resources may be orphaned. The hard part is that a backup is only proven by a restore: untested snapshots fail when needed.",
    k: ["Snapshots of the store versus per-resource export: store snapshots capture everything consistently and restore fast, but cannot restore one namespace without a full rebuild.", "Frequent snapshots versus rare: frequent shrinks lost work, but costs storage and may include corrupted state."],
    p: ["Snapshots kept on the same disk as the store are lost with it.", "Restoring a snapshot makes controllers delete real resources created after it, because the objects are gone."],
    v: "Take a snapshot, delete a namespace, restore into a fresh cluster on spare machines and confirm the namespace and its objects return. Check that workloads resume and orphaned volumes are accounted for.",
    dep: ["consensus-backed-store", "quorum-and-members", "control-plane-pki"]
  },
  "leases": {
    s: "Small objects holding a holder identity and a renew time, used as cheap heartbeats and as locks for leader election and node liveness.",
    d: "A lease records who holds it, the duration, acquire time, renew time and a transition count. Holders update it by compare-and-swap on the resource version, so only one wins a contest. Node agents renew one every few seconds; control-plane components use them to elect a leader. Because they are tiny and separate from large objects like node status, frequent renewal causes little store traffic. The hard part is that expiry is judged by observers' own clocks, so correctness relies on write conflict detection, not synchronized time.",
    k: ["Dedicated lease objects versus updating status fields: leases keep high-frequency writes small and isolated, but add another object type each consumer must know.", "Observer-side expiry versus server-side: observer-side is simple and needs no server timers, but depends on the observer's clock rate."],
    p: ["Renewal writes from thousands of leases per second still load the store in a very large cluster.", "A holder's clock stall keeps it believing it holds the lease after expiry."],
    v: "Watch a lease renewed by a holder and confirm the renew time advances. Make a second contender try to acquire it early and confirm the write is rejected until the duration has lapsed.",
    dep: ["consensus-backed-store", "resource-versions"]
  },
  "control-plane-pki": {
    s: "The certificate authorities and certificates that secure every connection between control-plane components, node agents, the store and aggregated services, plus the rotation of each.",
    d: "Separate authorities typically cover the API server and clients, the store, and the front proxy. Each component has a serving certificate and a client certificate; node agents get theirs through a signing-request flow approved by a controller. Certificates are short-lived where automatic rotation exists, but control-plane ones often have a year's lifetime. Service account tokens use their own signing key pair. The hard part is expiry: a forgotten certificate expiring brings down the control plane at a predictable date.",
    k: ["Short-lived auto-rotated certificates versus long-lived manual ones: short-lived limit exposure and force automation, but outage risk shifts to the rotation machinery.", "Separate authorities per trust domain versus one: separation limits what a stolen key can impersonate, at the cost of more material to manage."],
    p: ["Control-plane certificates created at install expire a year later with nobody tracking it, and the cluster stops.", "A leaked authority key lets an attacker mint a user with any identity."],
    v: "List every certificate with its issuer and expiry. Confirm each has automated renewal or a calendar date inside the alert window, and force a rotation in staging confirming components reconnect without restart failures.",
    dep: ["trust-boundaries"]
  },
});
