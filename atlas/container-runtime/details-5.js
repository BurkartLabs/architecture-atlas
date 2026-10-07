// Details for the container runtime plate, part 5: networking, volumes, kernel interfaces, cross-cutting concerns.
ATLAS.details("container-runtime", {
  "netns-wiring": {
    s: "The sequence that gives a new container network connectivity: create the namespace, create interfaces, move one end in, assign addresses, set routes and bring links up.",
    d: "Before the user program runs, a network plugin or built-in code is invoked with the namespace handle and the container id. It creates a virtual pair, moves one end into the namespace, names it, assigns an address from the allocator, adds a default route, sets the maximum packet size, brings loopback and the interface up, and attaches the host end to a bridge. On delete it reverses the steps. It is hard because partial failure leaves interfaces and address leases behind, so teardown must be idempotent and run even after a crash.",
    k: ["Wire networking in a hook between create and start vs inside the user's process: a hook sets everything before user code runs, but must run reliably with host privilege.", "Reuse the namespace across container restarts vs a fresh one: reuse keeps the address stable, but carries over stale state from the previous run."],
    p: ["A crash between creating the pair and attaching it leaves orphan interfaces on the host that accumulate.", "Teardown never runs after a hard kill, so addresses stay leased and the pool eventually runs out."],
    v: "Start and stop a container and diff the host's interface list and address leases before and after. Confirm the pair and lease appear while running and are both gone after delete.",
    dep: ["network-plugins", "veth-pairs", "network-namespace", "address-management", "lifecycle-hooks"]
  },
  "veth-pairs": {
    s: "A virtual ethernet cable: two connected devices where whatever enters one end exits the other, used to join a container's namespace to the host.",
    d: "The pair is created as two linked devices in one namespace and one end is moved into the container's namespace. Frames sent into one end appear at the other, with no real hardware. The host end is attached to a bridge, a router or a forwarding rule, and offloads such as checksum and segmentation settings must match the path. Statistics on the host end show the container's traffic. It is hard because many parts of the stack see them: name length limits, hardware address generation, packet size mismatches and offload bugs cause rare failures.",
    k: ["Pair to a bridge vs direct routed pair per container: bridges allow container-to-container switching on one segment, while routed pairs give per-container control and no broadcast domain.", "Generated host-side names vs derived names: derived names are easy to trace to a container, but must fit the length limit."],
    p: ["Mismatched packet size between the pair and the bridge silently drops large packets while small ones work.", "A random host-side name cannot be traced to its container, which makes debugging slow."],
    v: "Create a pair, move one end into a namespace, assign addresses to both, and ping across. Send a packet of full size and confirm it arrives. Delete one end and confirm the other disappears.",
    dep: ["network-namespace", "kernel-packet-filter"]
  },
  "bridge-network": {
    s: "A virtual switch on the host that connects containers' host-side interfaces on one subnet and, with address translation, lets them reach external networks.",
    d: "The default network creates a bridge device with its own subnet and gateway address. Each container's host-side interface joins the bridge, which learns hardware addresses and forwards frames, and containers use the bridge address as their default route. Outbound traffic is translated to the host's address, and replies are matched back. User-defined bridges add name-based discovery and isolation between networks. It is hard because the subnet can collide with real networks, and forwarding depends on host settings.",
    k: ["Default shared bridge vs user-defined networks: a shared bridge needs no setup, but gives all containers one flat segment, while defined networks isolate groups and add name lookup.", "Address translation outward vs routable container addresses: translation hides containers and needs no routing changes, while routable addresses need network configuration and show real sources."],
    p: ["The bridge subnet overlaps a corporate range and traffic to internal servers goes to local containers instead.", "Host forwarding is disabled by a hardening setting, so containers have a link but no connection to the outside."],
    v: "Start two containers on one bridge and confirm they reach each other by address. From a container reach an external address and confirm the source seen by the destination is the host's address.",
    dep: ["veth-pairs", "address-management", "packet-filter-rules"]
  },
  "network-plugins": {
    s: "A standard interface where the runtime invokes configured programs to add or remove a container from a network, passing a namespace handle and receiving addresses back.",
    d: "A configuration file names a plugin type and its options. To attach, the runtime runs the plugin executable with an add command, the container id, the namespace path and the configuration on standard input. The plugin does the wiring and prints a result with interfaces, addresses and routes. Plugins can be chained, so one sets up the interface and another adds port mapping or bandwidth limits. A delete command removes everything. It is hard because plugins run privileged and each failure mode must be handled by the caller.",
    k: ["External executable plugins vs built-in drivers: executables let vendors add networks without changing the runtime, but each attach costs a process spawn and trusts external code.", "Chained plugins vs one monolithic plugin: chains compose small features, but ordering and result passing must be exactly right."],
    p: ["A plugin hangs and the container stays in the created state because no timeout was configured.", "A chain is ordered incorrectly so port mapping is installed before the interface exists and silently does nothing."],
    v: "Attach a container using the plugin interface with a test plugin that logs its calls, and confirm one add call with the namespace path, and one delete call at removal with the same container id.",
    dep: ["netns-wiring", "address-management"]
  },
  "address-management": {
    s: "Allocating and releasing container addresses from the pools configured for a network, remembering them across runtime restarts.",
    d: "Each network has one or more subnets and ranges. When a container attaches, the allocator picks a free address, records it with the container id and returns it with the gateway and routes. On detach the address is released. State is stored in files or a database so restarts do not reuse addresses held by running containers. Some allocators support fixed addresses requested by the user. It is hard because crashes leak leases, and because address pools across hosts must not overlap if containers talk across hosts.",
    k: ["Local allocator per host vs shared cluster allocator: local allocation is simple and fast, while shared allocation gives unique addresses across hosts but needs a coordinating service.", "Reuse released addresses at once vs delay reuse: immediate reuse conserves the pool, but stale connections and caches may reach the wrong container."],
    p: ["Leaked leases from killed containers exhaust a small pool, so new containers cannot start.", "A released address is reused at once and other hosts' caches still send traffic for the old container to the new one."],
    v: "Start and delete containers repeatedly, confirm each gets an address from the pool, that released addresses are reusable and that no leases remain after all containers are removed.",
    dep: []
  },
  "port-mapping": {
    s: "Publishing a container's port on the host by redirecting packets arriving at a host address and port to the container's address and port.",
    d: "For each published port the runtime installs destination translation rules in the packet filter, matching traffic arriving on the host and rewriting its destination to the container. Replies are translated back by connection tracking. Traffic from the host itself to localhost needs separate handling, so a user-space proxy may be started as well. Binding to specific addresses limits exposure. It is hard because rules interact with the host's own firewall, and published ports are reachable from outside unless bound to loopback.",
    k: ["Kernel translation rules vs user-space proxy: rules are fast and keep client addresses, but depend on host packet-filter state, while proxies work anywhere but add copying and hide sources.", "Publish on all addresses vs a specific address: all addresses is convenient, but exposes the service to every network the host is on."],
    p: ["A published port bypasses the host's own firewall rules because translation happens before filtering.", "Two containers publish the same host port and the second fails only at start."],
    v: "Publish a port, connect to the host's address from another machine, and confirm the container receives the request with the client's real source address. Bind to loopback and confirm remote access is refused.",
    dep: ["packet-filter-rules", "bridge-network"]
  },
  "container-dns": {
    s: "Giving each container working name resolution: a generated resolver configuration, an embedded resolver for container names, and forwarding to upstream servers.",
    d: "The runtime writes resolver and hosts files into the container's root, pointing at either the host's servers or an embedded resolver on the network's gateway address. The embedded resolver answers names of containers on the same network and forwards all others upstream. Search domains and options come from daemon or per-container settings. File contents are generated at start from the current host configuration. It is hard because upstream servers on loopback addresses are unreachable from a separate network namespace.",
    k: ["Embedded resolver vs copying host resolver settings: an embedded resolver gives name lookup between containers, but adds a component and a point of failure.", "Generate files at start vs bind-mount the host's file: generating isolates containers and allows overrides, but the files go stale when host settings change."],
    p: ["The host's resolver listens only on loopback, so containers inherit an address that does not work inside their namespace.", "Host resolver changes after start are not reflected, so name resolution fails after a network change."],
    v: "Start two containers on a defined network and confirm each resolves the other by name to its address. Resolve an external name and confirm it succeeds through the forwarded upstream.",
    dep: ["bridge-network", "bind-mounts"]
  },
  "packet-filter-rules": {
    s: "The host packet-filter entries the runtime installs and removes: address translation, port redirection, forwarding permissions and isolation between networks.",
    d: "The runtime adds rules in its own named chains, referenced from the main chains, so they can be listed and flushed without touching administrator rules. It adds translation for outbound traffic, destination redirection for published ports, accept rules for established connections and drop rules between different bridges. Rules are created at network or container start and removed at delete. It is hard because several tools share one rule set and the order of references determines outcomes, and a firewall reload can wipe the runtime's rules.",
    k: ["Own chains referenced from main chains vs inserting rules directly: own chains allow clean teardown and listing, but one misplaced jump changes global order.", "Runtime manages rules vs a separate network plugin does: runtime management is automatic, but conflicts with a firewall service that expects to own the rule set."],
    p: ["A host firewall service reloads and removes the runtime's chains, so published ports stop working until restart.", "Stale redirect rules remain after a crash and send traffic for a port to a container that no longer exists."],
    v: "List the chains before and after starting a container with a published port and confirm the redirect and forward rules appear. Delete it and confirm they are removed, leaving the base rule set unchanged.",
    dep: ["kernel-packet-filter"]
  },
  "bind-mounts": {
    s: "Making a host file or directory appear inside the container at a chosen path, with the same underlying files rather than a copy.",
    d: "The runtime mounts the source path onto the destination inside the container's root using the bind mount type, with flags for read-only, no-execute and propagation. Writes inside are writes to the host path. The source must exist or be created, and ownership and permissions are those of the host files, which may not match the container's user. It is hard because a bind mount couples the container to the host's layout and gives it real host data, so one writable bind of a sensitive directory defeats isolation.",
    k: ["Bind a host path vs use a managed volume: binds are direct and good for development, but depend on host paths and permissions, while volumes are portable and managed.", "Read-only vs read-write: read-only prevents damage, but breaks programs that write logs or locks alongside their inputs."],
    p: ["Binding the host's root or the runtime socket gives the container control of the host.", "Files created by the container's root user on the host are owned by root and hard for ordinary users to delete."],
    v: "Bind a directory read-only, try to create a file inside and confirm failure. Bind it read-write, create a file, and confirm it exists on the host with the expected owner.",
    dep: ["mount-syscalls", "mount-propagation", "mount-table-setup"]
  },
  "named-volumes": {
    s: "Storage created and managed by the runtime under its own data directory, identified by name, that outlives any single container and can be shared.",
    d: "A volume is created on first use or explicitly, stored in a directory under the runtime's root, and mounted into containers by name. When first mounted over a path in the image holding files, those files are copied into the empty volume. It persists after containers are deleted until removed on request, and the runtime can list unused ones. It is hard because volumes hold the data that matters, but are easy to delete with a bulk cleanup command, and permissions follow the first container that used them.",
    k: ["Named volumes vs bind mounts: names decouple the container from host layout and allow drivers, but data sits in an opaque runtime directory.", "Copy image content into an empty volume on first mount vs leave it empty: copying seeds defaults, but surprises users when a later image version changes those files and the volume keeps the old ones."],
    p: ["A cleanup of unused volumes deletes a database volume because its container was stopped at the time.", "A new image version ships changed files in a volume path but the old volume content hides them."],
    v: "Create a volume, write a file from one container, delete that container, mount the volume in a new one, and confirm the file persists. Remove the volume and confirm its directory is gone.",
    dep: ["bind-mounts", "volume-drivers"]
  },
  "volume-drivers": {
    s: "Plugins that implement volume creation, mounting and removal against other storage: network filesystems, block devices, or cloud disks.",
    d: "The runtime talks to a driver over a local socket using a small protocol: create, mount, path, unmount and remove. The driver does the real work, such as attaching a disk or mounting a remote filesystem, and returns a host path that the runtime bind-mounts into the container. Options are passed through opaquely. It is hard because failure modes are those of the remote storage, and mount and unmount calls must be paired exactly once per container.",
    k: ["Out-of-process driver plugins vs built-in support: plugins let storage vendors integrate without changing the runtime, but add a dependency that must be running before containers start.", "Driver mounts per container vs shared mount per volume: per-container mounts isolate failures, while a shared mount saves operations but must be reference counted."],
    p: ["The driver is not running at boot and containers that need its volumes fail to start.", "An unbalanced unmount detaches a disk still used by another container."],
    v: "Use a test driver that logs calls, start two containers with one volume, and confirm mount is called per use, unmount balances after both stop, and remove is called only on explicit deletion.",
    dep: ["named-volumes", "bind-mounts"]
  },
  "tmpfs-mounts": {
    s: "Memory-backed filesystems mounted into a container for scratch space and secrets, which never touch disk and vanish when the container stops.",
    d: "A tmpfs mount stores files in page cache and swap with a size limit and optional mode and owner. The runtime uses it for temporary directories, shared memory and secret delivery. Because contents are charged to the container's memory limit, a large tmpfs can cause out-of-memory kills. It is hard because tmpfs usage is memory use, easily overlooked when sizing limits, and the default size can be half of host memory when not set.",
    k: ["Memory-backed scratch vs a directory in the writable layer: tmpfs is fast and leaves no residue, but consumes memory against the limit.", "Explicit size limit vs default: an explicit limit stops runaway writes consuming memory, while the default is large and unsafe for untrusted workloads."],
    p: ["A program fills an unbounded tmpfs and the container is killed for memory without any disk being used.", "Secrets placed in tmpfs are readable by other processes in the container because of loose file modes."],
    v: "Mount a tmpfs with a small size, write past it, and confirm the write fails with no space. Check the memory accounting of the container and confirm it includes the tmpfs contents.",
    dep: ["mount-table-setup", "memory-limits"]
  },
  "mount-propagation": {
    s: "The setting that decides whether mounts made later on one side of a bind mount appear on the other: shared, slave, private or unbindable.",
    d: "Mounts belong to peer groups. A shared mount sends and receives events with its peers, a slave only receives, and a private mount does neither. When a bind mount is created, the runtime chooses the mode for the container's view, and the mode of the host-side mount constrains what is possible. Recursive variants apply to everything beneath. It is hard because the host's mount modes decide the result and are often unexpected, and shared propagation from a container can alter the host's mounts.",
    k: ["Private by default vs slave or shared: private is safest and predictable, while slave lets containers see later host mounts such as removable disks.", "Recursive vs single mount propagation: recursive covers nested mounts under a directory, but may expose or change more than intended."],
    p: ["A shared bind mount lets the container unmount or hide host mounts underneath it.", "A mount made on the host after start does not show inside because the container's view was private."],
    v: "Bind a directory with slave propagation, mount a tmpfs under it on the host and confirm it appears inside, then mount one inside and confirm it does not appear on the host.",
    dep: ["mount-namespace", "mount-syscalls"]
  },
  "secrets-injection": {
    s: "Delivering credentials and configuration to a container as files in memory-backed storage, rather than in the image or environment variables.",
    d: "The orchestrator or user supplies secret data to the runtime, which writes it into a tmpfs and mounts it read-only at a path in the container with a set owner and mode. Environment variables are visible in process listings, image history and child processes, so files are preferred. Updates replace the files while running when the source changes. After stop the data disappears with the tmpfs. It is hard because the secret is plaintext in memory on the host, and any process in the container with read access can leak it.",
    k: ["Files in memory vs environment variables: files avoid leakage through process listings and logs, but require the application to read a path.", "Mount read-only with strict mode vs permissive: strict modes restrict which user inside can read it, but break programs that run as another user."],
    p: ["A secret passed as an environment variable appears in crash reports and the runtime's inspect output.", "A secret file is created with default permissions and is world-readable inside the container."],
    v: "Start a container with a secret and confirm it is readable at the path with the right mode, absent from inspect output and the environment, and that it is gone from the host after the container stops.",
    dep: ["tmpfs-mounts", "bind-mounts"]
  },
  "readonly-rootfs": {
    s: "Mounting the container's root filesystem read-only so only declared volumes and scratch mounts are writable, and keeping the writable layer for what remains.",
    d: "By default writes go to the container's writable layer on top of the image layers and are lost when the container is deleted. A read-only root forbids all writes there, so malware cannot persist or modify binaries, and the application must write only to mounts. Temporary directories are mounted as tmpfs. The writable layer is also where copy-up cost and disk use come from, and its size can be limited on some storage. It is hard because many programs assume they can write anywhere.",
    k: ["Read-only root with explicit writable mounts vs a writable root: read-only blocks tampering and shows what a program writes, but needs every write path found and mounted.", "Writable layer size limit vs none: a limit stops one container filling the disk, but needs storage support and breaks programs that write more."],
    p: ["A program that writes a pid file or cache into the root fails at start and is blamed on the image.", "Without a size limit, a container writing logs into its writable layer fills the host disk."],
    v: "Start with a read-only root and attempt to write a file in the root; confirm failure. Write to a declared tmpfs path and confirm success. Delete the container and confirm its writable layer data is gone.",
    dep: ["mount-table-setup", "tmpfs-mounts", "snapshotter"]
  },
  "process-syscalls": {
    s: "The system calls that create processes in new namespaces, move the caller into new ones, or join existing ones by handle: clone, unshare and setns.",
    d: "Clone creates a child with flags choosing which namespaces are new. Unshare gives the calling process new namespaces. Setns joins a process to an existing namespace through a file descriptor opened from its process directory or a pinned handle, and is how exec reaches into a running container. Some namespaces can only be joined by a single-threaded process, and a user namespace must be joined first to gain the right to join others. It is hard because namespace creation is per thread, so multi-threaded programs need care.",
    k: ["Create namespaces at clone vs unshare afterwards: clone applies them from the start of the process, while unshare allows staged setup, but changes only later children for process namespaces.", "Join by process directory handle vs by pinned handle file: process handles need no files but vanish with the process, while pinned handles outlive it."],
    p: ["Calling the join call from a multi-threaded process fails or affects only one thread.", "The pid namespace takes effect only for children after unshare, so the caller itself stays in the old one."],
    v: "Use a tracing tool on container creation and confirm clone is called with the flags for the namespaces in the spec. Run exec and confirm a join call for each namespace of the target container.",
    dep: []
  },
  "cgroup-filesystem": {
    s: "The pseudo-filesystem through which control groups are created, populated and tuned, with a directory per group and a file per setting or statistic.",
    d: "Making a directory creates a group. Writing a process id to a membership file moves it. Controller files take limits and report usage, pressure and event counters, and an events file can be watched for notifications such as out-of-memory. Removing the directory deletes an empty group. Controllers must be enabled for subtrees by the parent. It is hard because two versions of the hierarchy exist with different semantics, and a group can only be removed when empty.",
    k: ["Unified hierarchy vs multiple hierarchies: the unified one gives consistent accounting and delegation, but needs a recent kernel and updated tools.", "Delegating a subtree to an unprivileged user vs keeping all under administrators: delegation enables rootless limits, but needs the service manager's cooperation."],
    p: ["Removing a group with live processes fails, and cleanup code that ignores it leaves stale groups.", "A controller is not enabled for the subtree, so limit files are missing and writes silently have no effect."],
    v: "Create a group by hand, write a limit and a process id, and confirm usage files report that process and the limit is enforced. Kill the process, remove the directory and confirm success.",
    dep: []
  },
  "overlay-driver": {
    s: "The kernel filesystem that merges several directories into one view with a writable top layer, handling lookup, copy-up and whiteouts below the snapshotter.",
    d: "The driver is mounted with lower directories, an upper directory and a work directory on the same filesystem as the upper. A lookup searches layers in order, a write to a lower file copies it up first, and deletions are recorded as special entries. Options allow extended attribute handling, index and redirects for directory renames. Unprivileged mounts are possible in a user namespace with limits on features. It is hard because some filesystems cannot serve as upper layers and behavior around hard links and renames differs.",
    k: ["Whole-file copy-up vs block-level copy-on-write: whole-file copy is simple and uses ordinary files, but is costly for large files with small changes.", "Rename redirects enabled vs disabled: redirects make directory renames cheap, but add metadata that older kernels or tools do not understand."],
    p: ["An upper directory on an unsupported filesystem fails at mount with an unclear error.", "Hard links broken by copy-up make two names refer to different files after a write."],
    v: "Mount an overlay by hand with two lower directories and an upper, write to a lower file through the merged view, and confirm the file now exists in the upper directory while the lower is unchanged.",
    dep: []
  },
  "mount-syscalls": {
    s: "The calls that create, move, remount and detach mounts: mount, bind and move operations, pivot of the root, and the newer descriptor-based mount interface.",
    d: "Classic mount takes a source, target, type, flags and options string. Bind and move variants reuse existing trees, remount changes flags in place, and detach removes a mount lazily. A root swap exchanges the root with a new one. The newer interface builds a mount through descriptors in steps, which allows attaching a tree with id mapping and avoids path races. It is hard because mount flags interact in ways that fail only at remount, such as read-only bind mounts needing a second call.",
    k: ["Path-based mount calls vs descriptor-based calls: paths are simple and universal, but race with changes to the path, while descriptors are safe but need newer kernels.", "Lazy detach vs fail if busy: lazy detach always succeeds in hiding a mount, but leaves the filesystem alive until the last user leaves."],
    p: ["A read-only bind mount needs a separate remount step, and without it the mount remains writable.", "Lazy detach hides a mount while a process still holds files on it, and the device cannot be removed."],
    v: "Bind-mount a directory read-only and confirm writes fail. Trace a container start and confirm the sequence of mount calls produces the table described in the spec.",
    dep: []
  },
  "kernel-packet-filter": {
    s: "The kernel's packet processing hooks and tables for filtering, address translation, connection tracking and forwarding between interfaces.",
    d: "Packets traverse hooks at prerouting, input, forward, output and postrouting, where rules in tables can accept, drop, rewrite addresses or mark them. Connection tracking remembers flows so replies are translated back and established traffic is allowed. Forwarding must be enabled for packets to pass between interfaces. Bridges can also pass bridged frames through the same rules. It is hard because rule order, tracking table limits and interactions between several managers produce failures that appear only under load.",
    k: ["Connection tracking for translation vs stateless rules: tracking makes translation and reply handling simple, but its table is a finite resource that can fill.", "Filter bridged frames vs bypass: filtering enforces policy between containers on one bridge, but costs per-packet work."],
    p: ["The connection tracking table fills under many short connections, and new connections are dropped.", "Forwarding disabled by default silently drops container traffic leaving the host."],
    v: "Start a container, make a connection to an external host, and inspect the tracking table for the flow with translated addresses. Disable forwarding and confirm the connection stops working.",
    dep: []
  },
  "security-module-hooks": {
    s: "The kernel's framework that lets loadable policies approve or deny operations, and the filter mechanism for system calls, both used to confine container processes.",
    d: "Security modules register hooks at sensitive points such as file open, socket creation and signal sending, and each returns allow or deny based on labels or paths and the process's policy. Several modules can be stacked. The system call filter is separate: it runs a small program at system call entry. Both are inherited across fork and exec and cannot be loosened by the confined process. It is hard because enabling is a boot-time kernel choice and policies are tied to the host.",
    k: ["Mandatory policy through a module vs only discretionary permissions: modules add enforced rules even for root inside, but need policy authoring and host support.", "Stacked modules vs one module: stacking lets the host and a container workload each have a policy, but their interaction is hard to reason about."],
    p: ["A host kernel built without the module leaves every container profile reference unenforced.", "A permissive audit-only mode is left enabled in production and violations are logged but allowed."],
    v: "Check the list of active security modules in the kernel, load a profile that denies one operation, run a confined process attempting it and confirm denial and an audit record naming the profile.",
    dep: []
  },
  "isolation-strength": {
    s: "How strong a boundary containers must provide: a shared kernel with namespaces and filters, a user-space kernel, or a virtual machine per container.",
    d: "Containers on a shared kernel are separated by features, not by hardware, so a kernel vulnerability can cross the boundary. Layering namespaces, limits, capabilities, filters, profiles and user namespaces reduces the chance, and stronger runtimes replace the shared kernel entirely at a cost in start time and memory. The decision depends on how much the workload is trusted and what a breach costs. Every layer, from spec defaults to volumes, either keeps or breaks the boundary.",
    k: ["Shared kernel vs virtual machine boundary: shared kernels are fast and dense, while machines resist kernel flaws at higher cost.", "Defense in depth with several profiles vs one mechanism: layers add protection when one fails, but each needs maintenance."],
    p: ["Untrusted workloads share a host kernel with sensitive services on the assumption that containers are a security boundary.", "Granting broad privileges to fix one failure silently removes several layers at once."],
    v: "Run a test workload that attempts the known escape paths for the configured boundary, such as mounting host disks and reading kernel memory, and confirm every attempt is denied.",
    dep: ["alternate-runtimes", "user-namespace", "syscall-filter"]
  },
  "daemon-or-daemonless": {
    s: "Whether a long-running service owns all containers and state, or each command is a standalone process that supervises its own container with a small monitor.",
    d: "A daemon centralizes state, serves an API, caches data in memory and reacts to events, but is a privileged single point of failure and ownership for every container. A daemonless design runs each container under a small per-container monitor, records state in files and needs no resident service, which suits rootless and service-manager integration but makes events and shared services harder. Most stacks mix both: a daemon with per-container shims.",
    k: ["Resident daemon vs per-command processes: a daemon gives an API and shared caches, while per-command processes avoid a privileged service and fit service managers.", "Shim processes surviving the daemon vs containers dying with it: survival allows upgrades without downtime, but needs recovery logic."],
    p: ["A daemon crash or upgrade restarts all containers because their parent was the daemon itself.", "Daemonless tools race on shared state files when invoked concurrently."],
    v: "Restart or kill the managing service and confirm running containers continue and are rediscovered afterward. For daemonless tools, run concurrent commands against one container and confirm state remains consistent.",
    dep: []
  },
  "privilege-model": {
    s: "Which user owns the runtime and its helpers: an administrator, an unprivileged user through user namespaces, or a mix with delegated rights.",
    d: "A privileged runtime can do everything, so a bug anywhere becomes host takeover. A rootless runtime moves every operation into the user's rights, replacing privileged features with substitutes. Intermediate designs keep a privileged helper for narrow tasks such as id range writes. This choice shapes storage location, networking, limits and available features, and it affects every layer from the API socket to volume ownership.",
    k: ["Privileged runtime vs rootless: privileged has full features and speed, while rootless limits the damage from any compromise.", "Narrow privileged helpers vs fully unprivileged: helpers recover features such as wide id ranges, but add small privileged programs to audit."],
    p: ["A team enables privileged mode for one feature and every container inherits the setting through a shared template.", "Rootless is adopted, and limits and low-port binding silently stop working."],
    v: "List the owner of every process and open socket in a running setup and confirm none belongs to an administrator account for rootless mode, or only the expected helpers for mixed mode.",
    dep: []
  },
  "content-identity": {
    s: "Naming images, layers and manifests by the hash of their bytes, so identity, integrity, deduplication and signing all rest on one value.",
    d: "Digests make a name a precise pointer, let storage deduplicate, let any mirror serve content safely and let signatures bind to exactly what runs. The price is that anything which rewrites content changes its identity: recompression, repacking and re-serialization. Tags remain mutable pointers on top. Build caches, registries, stores and policy engines must agree on what is hashed and when it is verified.",
    k: ["Pin by digest vs follow tags: digests give reproducible deployments, while tags give automatic updates but unpredictable content.", "Verify at every hop vs trust the local store: verifying everywhere catches corruption and tampering, but costs reads."],
    p: ["Deployments reference mutable tags, and the same name starts different code after a repush.", "A tool recompresses layers on push and breaks signatures tied to the original digests."],
    v: "Pull an image by digest through a mirror, hash every stored blob, and confirm each matches its descriptor. Retag and push a changed image and confirm the original digest still resolves to the original content.",
    dep: []
  },
  "startup-latency": {
    s: "The time from a start request to the user's first instruction, which is the sum of image availability, storage setup, networking, runtime setup and hooks.",
    d: "Start time depends on whether the image is already local, whether layers are unpacked, how many layers must be mounted, how slow networking and hooks are, and how many processes the runtime spawns. Pre-pulling, lazy pulling, snapshot reuse, lighter runtimes and fewer hooks cut it, while stronger isolation and many layers raise it. Fleet autoscaling and function platforms are bounded by it, so each layer needs a budget.",
    k: ["Pre-pull and cache images vs pull on demand: pre-pulling gives fast starts, but consumes disk on every node.", "Stronger isolation vs faster start: machine isolation costs boot time, while shared kernel starts in tens of milliseconds."],
    p: ["Only warm starts are measured, so cold start on a fresh node is many times slower than planned.", "A slow network hook adds seconds to every container start and nobody notices because it is hidden inside create."],
    v: "Time start of the same image on a node with and without it cached, with timestamps at pull, snapshot, runtime create and first program output, and confirm each stage's share of the total.",
    dep: []
  },
  "runtime-failure-recovery": {
    s: "What happens to running containers, mounts, interfaces and records when the runtime, a shim or the host crashes, and how the stack converges afterward.",
    d: "Containers are processes, so they outlive the daemon only if something else is their parent. State is split across records, shims, kernel objects, mounts, interfaces and address leases, and a crash can leave any subset behind. Recovery means rediscovering live containers, finishing half-done creates and deletes, and removing leaks. Every operation must be idempotent and ordered so that the worst case is a leak, not a lost container.",
    k: ["Record intent first vs result last: intent allows cleanup of half-finished work, but needs a recovery pass at start.", "Garbage-collect leaked resources at start vs only on demand: automatic cleanup keeps hosts healthy, but may delete what a slow operation still needs."],
    p: ["A host crash leaves stale mounts and interfaces that block the next start of the same container name.", "Recovery at start races with a restart policy and starts the same container twice."],
    v: "Kill the runtime, a shim and the host in turn during container creation and deletion, then confirm after restart that no orphan processes, mounts, interfaces or leases remain and every container is either running or cleanly absent.",
    dep: []
  },
});
