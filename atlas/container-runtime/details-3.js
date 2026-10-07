// Details for the container runtime plate, part 3: runtime spec, process setup, namespaces and rootless.
ATLAS.details("container-runtime", {
  "runtime-spec": {
    s: "The standard configuration document that fully describes one container to a low-level runtime: process, root, mounts, hooks, and the namespaces, limits and security settings to apply.",
    d: "The document is JSON with sections for the process (arguments, environment, working directory, user, capabilities, terminal), the root filesystem path, mounts, hooks and a platform section listing namespaces, control group resources, device rules, system call filters, masked and read-only paths and access-control profile names. The low-level runtime applies it literally and makes no decisions. It is hard because defaults matter: any field omitted means no restriction, so a spec generator must emit every protection explicitly.",
    k: ["A declarative document vs a procedural API: a document is portable, diffable and lets runtimes be swapped, but cannot express conditional logic.", "Explicit security fields with permissive omission vs secure defaults in the runtime: explicit fields keep the runtime simple and predictable, but one missing field silently removes a protection."],
    p: ["A generator omits the system call filter section and the container runs with no filter and no error.", "Fields valid for one platform are silently ignored on another, and the author assumes they took effect."],
    v: "Generate a spec, then run the container and compare the live process's namespaces, capability sets and filter mode in the kernel's process files against the document field by field.",
    dep: []
  },
  "bundle-layout": {
    s: "The directory a low-level runtime is given: a configuration file and a root filesystem directory, assembled by the high-level runtime from the image.",
    d: "A bundle contains the spec file and the root filesystem directory, typically a mount of the container's snapshot. The high-level runtime builds it by creating the snapshot, mounting it, writing the spec and passing the directory path to the runtime's create command. The bundle is not an image: it is a per-container, per-run directory that lives only as long as the container does. It is hard because the root path must be valid, stable and removable, and a leftover mount inside it makes cleanup fail.",
    k: ["Root filesystem mounted by the caller vs by the low-level runtime: caller mounting lets any snapshotter be used, but the caller must unmount reliably.", "Bundle on a temporary filesystem vs on persistent storage: temporary storage is cleaned on reboot, while persistent storage lets containers survive restarts."],
    p: ["A crash leaves the snapshot mounted under the bundle, and later deletion of the directory removes real data through the mount.", "The bundle directory lives on a filesystem mounted with options that block execution, so every container fails."],
    v: "Create a container and confirm the bundle directory has the spec file and a populated root. Delete the container and confirm the directory and its mounts are gone from the host's mount table.",
    dep: ["runtime-spec", "snapshotter"]
  },
  "spec-generation": {
    s: "Merging image defaults, user options, daemon defaults and network and volume decisions into the final runtime spec for one container.",
    d: "The generator starts from the image config's entrypoint, environment and user, overlays command-line options and daemon defaults, then adds mounts for volumes, secrets and special filesystems, the namespaces for the chosen modes, the control group limits and the default security profiles. It resolves names to ids, for example a user name to a numeric id using the image's own account files. Hooks for networking are added last. It is hard because precedence rules are subtle and the result must be inspectable to be trusted.",
    k: ["Secure defaults applied by the generator vs left to the user: generator defaults protect careless users, but make deliberate exceptions harder and less visible.", "Resolve user names at create time vs at start time: create time catches errors early, but the image files may differ from what is mounted later."],
    p: ["A user option overrides the default system call filter entirely instead of adding to it, removing protections wholesale.", "A user name is resolved against the host's account file instead of the image's, giving the wrong numeric id."],
    v: "Generate specs for the same image with different options and diff them. Confirm the environment, user, mounts and profile names appear exactly as the precedence rules predict.",
    dep: ["image-config", "runtime-spec", "capability-sets", "syscall-filter"]
  },
  "lifecycle-hooks": {
    s: "Programs the low-level runtime executes at defined points, such as after namespaces exist or before the process starts, used mainly to wire networking and devices.",
    d: "The spec lists hooks for stages: create runtime, create container, start container, post-start and post-stop. Each hook is an executable with arguments, environment, a timeout and a copy of the container's state on standard input. A network hook configures interfaces after the namespace exists but before the user program runs. The runtime aborts container creation if a mandatory hook fails. It is hard because hooks run with host privilege, in a specific namespace context depending on the stage, and an unbounded hook blocks every start.",
    k: ["Hooks as external programs vs built-in features: external programs let administrators add behavior without changing the runtime, but run privileged code from a configuration file.", "Fail container creation on hook failure vs continue: failing is safe, while continuing keeps availability but starts containers without their network or device setup."],
    p: ["A hook with no timeout hangs and blocks the container forever in the created state.", "A hook runs in the wrong namespace for its stage and configures the host's network instead of the container's."],
    v: "Add a hook that records its stage, namespace identifiers and the state it received, and confirm it runs at the stated stage inside the stated namespaces. Make it fail and confirm creation is aborted.",
    dep: ["runtime-spec", "network-plugins"]
  },
  "runtime-command-contract": {
    s: "The standard command-line interface every low-level runtime implements: create, start, state, kill, delete, with defined options, exit codes and state output.",
    d: "The caller invokes the runtime binary with a verb, a container id and a bundle path. Create sets up everything but does not run the user program. Start lets it run. State prints a JSON record of id, status and process id. Kill sends a signal, delete removes runtime state. Options pass a pidfile path, a console socket and a log file. Because the contract is fixed, runtimes written in different ways are interchangeable. It is hard because semantics such as what delete does to a running container are specified loosely.",
    k: ["Command-line contract vs a linked library: a command contract isolates crashes and permits any runtime, but costs a process spawn per operation.", "Separate create and start vs one run command: separate verbs let the caller attach streams and networking in between, but demand state handling for the created phase."],
    p: ["A runtime exits successfully from create before its container's processes are fully set up, and start races.", "The pidfile is read before it is written, so the caller records the wrong or no process id."],
    v: "Run create, state, start, state, kill, delete against a bundle with raw commands and confirm status goes created, running, stopped and the process id from state matches the host's process list.",
    dep: ["runtime-spec", "bundle-layout", "process-creation"]
  },
  "alternate-runtimes": {
    s: "Low-level runtimes that implement the same contract with stronger isolation, running the workload inside a lightweight virtual machine or behind a user-space kernel.",
    d: "These runtimes accept the same bundle and commands but do not share the host kernel with the workload. One boots a minimal virtual machine and runs an agent inside that creates the container, another implements system calls in a user-space process and forwards a reduced set to the host. They are selected per container by name. It is hard because they add start-up time, memory overhead and compatibility gaps: networking, volumes and device access must cross the machine boundary.",
    k: ["Virtual machine per container vs shared host kernel: a machine gives a much stronger boundary against kernel bugs, but costs memory, boot time and some features.", "User-space kernel vs hardware virtualization: user-space kernels avoid needing virtualization support, but implement only part of the system call surface."],
    p: ["Workloads depending on an unsupported system call or device fail only under the stronger runtime.", "Host paths shared into the machine are slower by an order of magnitude, surprising I/O-heavy workloads."],
    v: "Run the same image under the default and the alternate runtime and compare the kernel version reported inside. A different version confirms the workload does not share the host kernel.",
    dep: ["runtime-command-contract", "runtime-spec"]
  },
  "process-creation": {
    s: "How the low-level runtime creates the container's first process: clone with namespace flags, a setup phase inside the new namespaces, and a staged hand-off before the real program.",
    d: "The runtime creates a child with the requested namespace flags. Namespaces that need a different process context are joined by additional stages: for example, a user namespace must exist before others so privileged operations inside it are allowed. The child performs setup, then waits at a synchronization point until the parent has written id maps and control group membership, and finally executes the user program. Because the first process becomes process one in a new process namespace, it carries special signal rules. It is hard because the ordering of these stages is fragile.",
    k: ["Multiple stages across processes vs one process doing everything: stages allow joining namespaces that need a fresh process, but add synchronization complexity.", "Re-execute the runtime binary vs use fork only: re-execution gives a clean address space and avoids sharing state, but needs a safe way to pass the setup data."],
    p: ["A race between the parent writing id maps and the child using them yields permission errors that appear only under load.", "Setup code running in a multi-threaded runtime process cannot safely change namespaces of just one thread."],
    v: "Run create under a tracing tool and confirm the clone call carries the expected namespace flags, and that the process id seen inside the container for the program is 1 while the host shows a larger id.",
    dep: ["process-syscalls", "setup-sync-channel", "pid-namespace", "user-namespace"]
  },
  "setup-sync-channel": {
    s: "A pair of pipes or sockets between the runtime's parent and child processes that carries setup data and coordinates who does which step in what order.",
    d: "The parent sends a configuration message to the child, containing namespace paths, id mappings and options. The child reports when it has created namespaces, and the parent then performs steps only it can, such as writing id maps, placing the process in a control group and moving a network interface. The parent signals back and the child continues. Errors are sent as messages so the caller gets a real reason, not just a failed exit. It is hard because a crash of either side while the other blocks must not hang the runtime.",
    k: ["Explicit message protocol vs shared memory and signals: messages are ordered and debuggable, while signals and memory are faster but easy to race.", "Fail fast on any channel error vs retry: failing keeps the state clear, but spurious interruptions then abort container creation."],
    p: ["The parent dies mid-setup and the child blocks forever on a read, leaving a stuck process in a half-built container.", "An error message is lost, and the caller sees only an exit code with no cause."],
    v: "Inject a failure in the parent after the child's first report and confirm the child exits promptly, no process remains, and the returned error describes the failing step.",
    dep: ["process-creation"]
  },
  "root-switch": {
    s: "Replacing the process's view of the filesystem root with the container's root directory, so host paths become unreachable.",
    d: "Inside a new mount namespace, the runtime marks existing mounts private so changes do not propagate to the host, bind-mounts the root directory onto itself, and switches roots by moving the old root underneath and detaching it. Once the old root is detached nothing in the container can name it. A simple change-root call alone leaves the old root reachable, so it is not used. It is hard because every step must happen before the user program and any inherited open descriptor can still point at the host.",
    k: ["Swap the root and unmount the old one vs a change-root call: swapping removes the old tree from the namespace, while change-root can be escaped by privileged processes.", "Mark mounts private before changes vs leave inherited propagation: private marking protects the host, but breaks intentional sharing."],
    p: ["Skipping the private marking causes mounts made inside the container to appear on the host.", "A descriptor to a host directory left open across the switch gives the container a path back out."],
    v: "From inside a started container, list the mount table and confirm no host path remains, and that an attempt to access the old root's location fails. From the host, confirm no extra mounts appeared.",
    dep: ["mount-namespace", "mount-syscalls", "mount-table-setup"]
  },
  "mount-table-setup": {
    s: "Building the container's mounts from the spec: the process filesystem, device nodes, shared memory, volume bind mounts and read-only or masked paths.",
    d: "The runtime mounts the standard pseudo-filesystems, creates a minimal device directory with a fixed set of nodes such as null, zero, random and terminal devices, then adds each mount from the spec. Mount types, flags and propagation modes are applied in order, and paths are resolved safely so a symbolic link inside the root cannot redirect a mount to the host. Sensitive kernel paths are masked with empty files or made read-only. It is hard because path resolution races: a container process could swap a directory for a link between check and mount.",
    k: ["Create a minimal device set vs bind in host devices: a minimal set limits exposure, but some workloads need real devices to be added explicitly.", "Resolve mount targets in the root with a safe resolver vs plain path joins: safe resolution defeats link tricks, but costs complexity and kernel support."],
    p: ["A mount destination that follows a symbolic link in a volume lets the container overwrite host files.", "Mounts applied in the wrong order hide earlier ones, such as a volume mounted over a path later mounted as a pseudo-filesystem."],
    v: "Start a container and read its mount table. Confirm each spec mount appears in order with the right flags, masked paths are empty or read-only, and only the listed device nodes exist.",
    dep: ["runtime-spec", "mount-namespace", "bind-mounts", "masked-paths", "device-access-rules"]
  },
  "container-init": {
    s: "A minimal program run as process one inside the container, which starts the real program, forwards signals and reaps orphaned children.",
    d: "Process one in a process namespace gets no default handling for most signals and must adopt every orphan in the namespace. A small init either is built into the runtime's flag or is bundled into the image. It starts the target as a child, forwards received signals to it, reaps any zombies, and exits with the child's status. Without it, an application that never expected to be process one can ignore termination signals and leak zombies. It is hard because it has to be tiny, correct and present without changing images.",
    k: ["Run a dedicated init vs the application as process one: an init gives correct signals and reaping for any program, but adds a process and a binary.", "Forward signals to the child only vs to its whole process group: group forwarding reaches helper processes, but can signal children that should outlive the parent."],
    p: ["A shell script used as the entrypoint becomes process one and ignores termination signals, so stop always waits for the full timeout.", "Zombie processes accumulate under a program that spawns children and never waits for them."],
    v: "Run a program that spawns short-lived children without waiting, once with and once without the init, and count defunct entries in the container's process list. Send a stop signal and compare how fast each exits.",
    dep: ["zombie-reaping", "signal-forwarding", "pid-namespace"]
  },
  "zombie-reaping": {
    s: "Collecting the exit status of terminated child processes so the kernel can free their entries, a duty that falls to process one for every orphan in a process namespace.",
    d: "When a process exits, its entry remains until its parent waits for it. When a parent exits first, its children are reparented to the namespace's process one, which must wait on them in a loop. If it never does, defunct entries accumulate and exhaust the process table or the process-count limit. Reaping must be non-blocking and loop until no children are ready, because several signals can coalesce into one. It is hard because the reaper must not steal the status the real application wants from its own child.",
    k: ["Reap everything vs reap only unknown children: reaping all is simple and safe against leaks, but may consume a status the parent application waits on.", "Reap on child-exit signal vs on a timer: signal-driven reaping is prompt, but coalesced signals require a loop that drains all ready children."],
    p: ["A reaper that handles one child per signal misses coalesced exits and leaves zombies behind.", "Zombies fill the container's process-count limit, so new processes fail to start even though little is running."],
    v: "Run a container whose program forks one thousand children that exit at once and confirm the number of defunct processes returns to zero within a second, while the pids limit usage returns to baseline.",
    dep: ["pid-namespace", "io-and-pid-limits"]
  },
  "signal-forwarding": {
    s: "Relaying signals received by the supervising process, such as terminate, interrupt and hangup, to the container's real program so graceful shutdown works.",
    d: "A signal sent to the container from outside arrives at process one. Process one in a namespace ignores signals for which it installed no handler, to protect the system, so a program not written for that role does nothing. The init or shim installs handlers for the common signals and re-sends them to the child, possibly to its process group. Stop commands rely on this to deliver a graceful termination. It is hard because signals have different meanings for terminals, job control and stop timeouts.",
    k: ["Forward to the process group vs just the child: groups reach descendants started by shells, but also deliver signals to unrelated helper processes.", "Translate the stop signal per image vs a fixed signal: per-image stop signals respect programs that expect another signal, but need image metadata and users to set it."],
    p: ["The stop signal is delivered to a shell that does not forward it, so the program never shuts down gracefully.", "A hangup signal forwarded to a daemonized program makes it reload configuration instead of ignoring it."],
    v: "Run a program that logs on receiving terminate and then exits, issue stop, and confirm the log line appears and the exit takes less than the grace timeout, not the full timeout.",
    dep: ["container-init", "pid-namespace"]
  },
  "final-exec": {
    s: "The last step in setup: set the numeric user and groups, apply capabilities and filters, then replace the setup code with the user's program.",
    d: "After mounts, root switch and limits are in place, the runtime sets supplementary groups, group and user ids, trims the bounding, effective, permitted and inheritable capability sets, sets the no-new-privileges flag, loads the system call filter and applies the access-control profile. The order is deliberate: dropping privilege too early prevents later steps, and loading the filter too early blocks the runtime's own calls. Finally an exec call replaces the process image. It is hard because every close-on-exec descriptor and environment variable must be correct at that instant.",
    k: ["Load the filter last, right before exec vs early: loading last lets setup use any call, but the filter must allow the exec call itself.", "Drop capabilities before changing user vs after: the order determines whether capabilities survive the user change, and a mistake leaves root-like powers."],
    p: ["A descriptor opened by the runtime without close-on-exec leaks into the user program and exposes host files.", "The profile is applied before exec, so the program load is itself denied with an unclear error."],
    v: "From inside a started container, read the process's status file and confirm user ids, all four capability sets, the no-new-privileges flag and the filter mode match the spec, and list open descriptors to confirm only standard ones exist.",
    dep: ["capability-sets", "syscall-filter", "mac-profiles", "masked-paths", "process-syscalls"]
  },
  "pid-namespace": {
    s: "Gives a group of processes their own process id numbering, in which the first process is id one, and which hides processes outside it.",
    d: "Inside a new process namespace, process ids start at one, and only processes in that namespace or its children are visible. The same process has a different id in each ancestor namespace. When process one exits, the kernel kills every other process in the namespace. A process-listing tool only shows the right view if the process filesystem is mounted from inside the namespace. It is hard because process ids appear in many interfaces, and sharing the host's namespace by choice exposes every host process to the container.",
    k: ["Own namespace vs sharing the host's: an own namespace hides the host and gives a contained process tree, while sharing helps debugging and monitoring tools at a security cost.", "Shared namespace between containers of one group: sharing lets sidecars signal and inspect each other, but weakens isolation between them."],
    p: ["Mounting the host's process filesystem into the container reveals every host process despite the namespace.", "The exit of process one kills all other processes, surprising applications that daemonized helpers."],
    v: "Inside a container list processes and confirm the main program is id one and no host processes show. From the host, find the same process and confirm it has a different, larger id.",
    dep: ["process-syscalls"]
  },
  "mount-namespace": {
    s: "Gives a group of processes a private mount table, so mounts and unmounts inside do not affect the host and the host's later mounts do not appear inside, by default.",
    d: "A new mount namespace starts as a copy of the parent's table. Each mount has a propagation setting: shared, slave or private, controlling whether events cross to peers. The runtime makes its mounts private, builds the container's table and then replaces the root. It is the namespace that makes pivoting the root possible. It is hard because propagation settings interact with bind mounts and volumes, and a shared mount leaked into a container can unmount host mounts.",
    k: ["Private propagation by default vs shared: private blocks events both ways, while shared or slave propagation lets later host mounts, such as removable media, appear in containers.", "Fresh table from the root vs copying the host's table first: copying then trimming is the kernel default, but leaves a window where host mounts are visible."],
    p: ["A recursively shared bind mount of a host directory lets a container unmount host filesystems.", "A mount made on the host after the container started does not appear inside because propagation was left private."],
    v: "Mount a tmpfs inside a container and confirm the host's mount table has no new entry. Mount on the host and confirm whether it appears inside, matching the configured propagation.",
    dep: ["process-syscalls", "mount-syscalls"]
  },
  "network-namespace": {
    s: "Gives a group of processes their own network devices, addresses, routing tables, firewall rules and port numbers, initially holding only a loopback device.",
    d: "A new network namespace has no connectivity but an inactive loopback. Devices are created inside or moved in from outside by id. Each namespace has independent routing, neighbor tables, sockets and packet filter state, so two containers can both listen on the same port. The namespace is kept alive by a process or a bind mount of its handle, which lets networking be set up before any container process exists. It is hard because the setup must happen in a window between namespace creation and the user program.",
    k: ["Own namespace vs host networking: own namespaces isolate ports and traffic, while host networking removes translation overhead at the cost of exposing the host's stack.", "Namespace pinned by a handle file vs by the first process: a handle lets networking be configured early and survive process restarts, but must be removed explicitly."],
    p: ["Host-network containers bind a port the host already uses and break unrelated services.", "A pinned namespace handle is not removed on delete and leaks namespaces until the host runs out."],
    v: "From inside a fresh container with no networking attached, list interfaces and confirm only loopback exists. Attach networking and confirm a separate interface with its own address and routing table appears.",
    dep: ["process-syscalls"]
  },
  "uts-ipc-namespaces": {
    s: "UTS gives a container its own host and domain name; the IPC namespace gives it separate shared memory segments, semaphores and message queues.",
    d: "Setting the host name in a new name namespace changes it only for that group. The IPC namespace separates System V objects and POSIX message queues, so programs using fixed keys do not collide or read each other's data. Sharing the IPC namespace between containers lets cooperating programs use shared memory directly. Shared memory file systems are mounted per container. It is hard because sharing either with the host quietly removes isolation that most users assume exists.",
    k: ["Private IPC vs shared with the host: private avoids key collisions and data leaks, while sharing supports tightly coupled host services at a security cost.", "Container host name equals container id vs a user-chosen name: ids are unique, but a chosen name matches what applications and certificates expect."],
    p: ["Containers sharing host IPC read each other's shared memory segments created with predictable keys.", "An application caches the host name at start and keeps the old one after a rename."],
    v: "Create a shared memory segment with a fixed key in one container and confirm a second container with private IPC cannot see it, while one sharing the namespace can.",
    dep: ["process-syscalls"]
  },
  "cgroup-time-namespaces": {
    s: "The cgroup namespace hides the host's control group paths behind a virtual root; the time namespace gives a container its own monotonic and boot clock offsets.",
    d: "Inside a cgroup namespace, a process sees its own group as the root of the tree, so paths do not reveal the host's layout and nested management tools work. A time namespace sets offsets for the monotonic and boot clocks, mainly so a restored checkpoint continues with a consistent clock. The offsets are set before the first process starts. It is hard because these are rarely needed, easy to forget in the spec, and a container without a cgroup namespace sees full host paths in its process files.",
    k: ["Enable the cgroup namespace by default vs leave shared: enabling hides host layout and supports nesting, but breaks old tools that read absolute host paths.", "Time offsets set at restore vs not virtualized: offsets keep restored workloads consistent, but only the monotonic and boot clocks are covered, not wall time."],
    p: ["A monitoring tool inside the container reads paths that reveal the host's control group names, leaking naming and layout.", "A restored process sees its monotonic clock jump backwards because no time offset was applied."],
    v: "Read the process's control group file inside a container and confirm the path starts at the root, not the host's full path. Read it from the host and confirm the full path.",
    dep: ["cgroup-hierarchy", "process-syscalls"]
  },
  "user-namespace": {
    s: "Maps user and group ids inside a namespace to different ids outside, so a process can be root inside while being an ordinary user on the host.",
    d: "Inside a user namespace a process can hold full capabilities over resources owned by that namespace, such as other namespaces created within it, while having none over the host. Ids are translated using mapping tables, and files owned by unmapped ids appear as an overflow user. A new user namespace is the unprivileged route to creating all other namespaces. It is hard because it widens the kernel's attack surface, since unprivileged code can now reach privileged kernel paths, and because file ownership on shared storage must be translated.",
    k: ["User namespaces for every container vs only when rootless: always using them contains a container escape, but complicates volumes and file ownership.", "Disable unprivileged creation vs allow it: disabling reduces kernel exposure, but prevents rootless operation for ordinary users."],
    p: ["Files in a volume are owned by an overflow id because the mapping does not include the file's owner.", "Disabling unprivileged namespace creation in the kernel breaks every rootless user without a clear error."],
    v: "Run a container as root inside a user namespace and confirm the process shows user zero inside but a high unprivileged id on the host. Try to write a root-owned host file and confirm denial.",
    dep: ["process-syscalls", "id-mapping"]
  },
  "id-mapping": {
    s: "The tables that translate ranges of user and group ids inside a namespace to ranges on the host, written once by a privileged helper or by the runtime.",
    d: "A mapping is lines of inside start, outside start and length. A process may write its own map once, covering only its own id, unless a helper program with file capabilities writes a wider range from an administrator-controlled list of allowed ranges per user. Layers in an image have fixed file owners, so snapshotters either recursively change ownership into the mapped range or use a mount that translates ids on the fly. It is hard because the ranges are a finite shared resource, and overlap between users breaks isolation.",
    k: ["Single-id mapping vs a full range: a single id needs no privileged helper but cannot run images that use several users, while a range needs helper setup.", "Recursive ownership change vs id-mapped mounts: changing ownership works anywhere but is slow and duplicates storage, while mapped mounts are instant but need kernel support."],
    p: ["Two users given overlapping ranges can read each other's files from containers.", "A recursive ownership change of a large image on every start adds minutes to container start."],
    v: "Start a rootless container, read its uid map and confirm the range matches the administrator's allowance. Create a file as a non-root user inside and confirm the host owner is the mapped id.",
    dep: ["user-namespace"]
  },
  "rootless-mode": {
    s: "Running the entire stack, from image storage to container processes, as an ordinary user with no real privilege, so a compromise yields that user's rights only.",
    d: "The runtime and its helpers run under the user's account, store images in the home directory, place the socket in the user's runtime directory and rely on a user namespace for apparent root inside. Operations that need real privilege are replaced: a user-space overlay or the kernel's unprivileged overlay mount for layers, user-mode networking for connectivity, delegated control groups for limits. Binding low ports and some devices need extra configuration. It is hard because each feature that needed privilege needs a substitute with different performance and limits.",
    k: ["Rootless vs a privileged daemon: rootless removes the largest class of host takeover, but gives up some features and speed.", "Per-user storage vs shared storage: per-user storage keeps users separate, but duplicates images and cannot share layers between users."],
    p: ["Resource limits silently do nothing because control group delegation to the user was never configured.", "Images are pulled again per user and fill the home directory quota."],
    v: "As an ordinary user, run a container, then inspect its processes from the host and confirm they run under that user. Confirm no process or file in the setup belongs to the administrator account.",
    dep: ["user-namespace", "rootless-networking", "overlay-snapshotter", "cgroup-hierarchy"]
  },
  "rootless-networking": {
    s: "Connectivity for containers started without privilege, where the user cannot create bridges or firewall rules, so a user-space program forwards traffic instead.",
    d: "Without the right to configure host networking, the runtime creates a network namespace inside the user namespace and connects it to the host through a tap device handled by a user-space network stack. Outgoing connections are made by that program on the host side as ordinary sockets, and published ports are forwarded by proxy. Address and port handling is entirely in user space. It is hard because throughput and latency are worse than kernel forwarding, and the source address of incoming connections is often lost.",
    k: ["User-space network stack vs kernel bridge with privilege: the user-space stack works unprivileged anywhere, but is slower and loses some addresses.", "Port forwarding by userland proxy vs packet filter rules: a proxy needs no privilege, but adds copying and hides client addresses."],
    p: ["All clients appear as one local address to the service, which breaks per-client logging and rate limiting.", "Throughput-sensitive workloads, such as database replication, fall far short of expected speed."],
    v: "Run a rootless container serving a web page on a published port, fetch it from another host, and confirm it works. Check the service log to see which client address it recorded.",
    dep: ["network-namespace", "user-namespace", "port-mapping"]
  },
});
