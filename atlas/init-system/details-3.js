// Details for the init system plate, part 3: resource control, sandboxing, logging.
ATLAS.details("init-system", {
  "control-groups": {
    s: "A kernel mechanism that groups processes into a tree so a manager can account for and limit their resources together; every service gets its own node.",
    d: "The manager creates a group for each unit and starts the service's processes inside it, so the kernel keeps all descendants there. Controllers attached to the group enforce CPU, memory, I/O and process-count rules, and report usage. The group also enables reliable kill-all and an event when it becomes empty. The manager owns the tree and must not share it with other writers. Hard because controller availability and the delegation rules differ between kernel versions and between single-hierarchy and older multi-hierarchy layouts.",
    k: ["One group per service vs a shared group: accurate accounting and limits per service; hundreds of groups add bookkeeping cost.", "Single owner of the hierarchy vs sharing with other tools: consistent limits; programs that also create groups, such as container runtimes, must use delegation."],
    p: ["Another tool moving processes between groups behind the manager's back breaks accounting and kill-all.", "Assuming a controller exists on an older kernel and having the limit silently ignored."],
    v: "Start a service, read its group's process list and confirm it equals the service's process tree; stop it and confirm the group directory is removed.",
    dep: ["kernel-notifications", "state-machine"]
  },
  "slices": {
    s: "Nodes in the control-group tree that group services so a limit or weight applies to a whole class, such as system services, user sessions and virtual machines.",
    d: "A slice unit is a named node. Services and scopes are placed under a slice, and a setting on the slice bounds the sum of everything below it, while weights divide a resource between siblings. By default there are slices for system services, per-user sessions and machines. Names encode the hierarchy. This lets an administrator say that background jobs may use at most a quarter of memory without touching each job. Hard because limits at several levels interact, and a tight parent limit can starve a child whose own limit looks generous.",
    k: ["Hierarchical limits vs per-service limits only: one setting protects a whole class; reasoning about the effective limit needs walking the tree.", "Weights for sharing vs hard caps: idle capacity is not wasted; no guaranteed ceiling for a noisy neighbor."],
    p: ["Setting a parent memory cap lower than the sum of its children's reservations starves the important child first.", "Placing a service in the wrong slice by omission, so it competes with interactive sessions."],
    v: "Put two services in a slice with a CPU weight ratio of two to one, run both busy, and confirm measured CPU time splits about two to one while idle capacity is still used when one stops.",
    dep: ["control-groups", "unit-types"]
  },
  "cpu-control": {
    s: "Settings that divide processor time between services by relative weight or cap it with a quota per period, plus affinity and scheduling policy.",
    d: "A weight sets a service's share relative to siblings when the CPU is contended. A quota sets a hard maximum as a percentage of one CPU over a short period, after which the group's threads are throttled even if the machine is idle. Further settings select allowed CPUs, a scheduling class or a nice value. Accounting reports total CPU time. Hard because quotas produce periodic latency spikes when a bursty service is throttled, and weights have no effect at all on an uncontended machine.",
    k: ["A proportional weight vs a hard quota: weight uses spare capacity and protects important work; quota gives predictability but throttles a bursty service while the machine is idle.", "Pinning to chosen processors vs letting the scheduler decide: cache locality for latency work; unused cores are not available when it is busy."],
    p: ["A quota set too low makes a request-serving service stall in short bursts that look like random latency.", "Expecting weights to limit a service on a machine with idle capacity."],
    v: "Cap a busy service at fifty percent of one processor and confirm its measured CPU usage settles near half, then remove the cap and confirm it uses a full core.",
    dep: ["control-groups", "slices"]
  },
  "memory-control": {
    s: "Per-service memory limits with distinct thresholds: a protected minimum, a soft level where the kernel reclaims aggressively, and a hard maximum that triggers the out-of-memory killer.",
    d: "A low or minimum setting protects memory from reclaim; a high setting makes the kernel reclaim and throttle allocation above it; a max setting is a hard cap that invokes the out-of-memory response in that group; swap use has its own limit. Accounting includes page cache, so a service can appear large for harmless reasons. The service's own allocator must tolerate allocation failure. Hard because choosing numbers requires knowing working set, and a cap too close to normal use causes thrashing before it causes a kill.",
    k: ["Soft high threshold vs hard maximum: gradual slowdown gives the service a chance to adapt; a hard cap alone causes sudden kills.", "Counting page cache in the group: it reflects real pressure; a service doing heavy file reads seems to leak memory."],
    p: ["A hard cap equal to typical usage makes the service thrash in reclaim long before it is killed.", "Reading cache-inclusive usage as a leak and raising limits unnecessarily."],
    v: "Set a high threshold below a test program's working set and confirm it slows without being killed and that the group's event counters show high-limit breaches; lower the max and confirm a kill is recorded.",
    dep: ["control-groups", "oom-handling", "slices"]
  },
  "io-control": {
    s: "Block I/O weights, bandwidth and operation-rate limits per device for a service, and a latency target for important work.",
    d: "Weights divide disk throughput between groups, either overall or per device. Limits cap bytes per second or operations per second for a named device. A latency target tells the kernel to throttle other groups when this one is delayed. Accounting shows bytes and operations by device. Effectiveness depends on the device and scheduler, and buffered writes are only attributed correctly when the filesystem supports it. Hard because limits applied to the wrong device name have no effect, and a limit on a logical volume may not reach the physical device.",
    k: ["Proportional weight vs absolute limit: a backup uses spare bandwidth yet yields to the database; an absolute cap wastes a quiet disk.", "A latency target for a priority service vs static caps: adapts to load; behavior depends on the device and is harder to predict."],
    p: ["Setting a limit on a partition or mapped device that the kernel does not enforce, so nothing changes.", "Cached writes that complete in memory evade the limit and flush later as a burst."],
    v: "Limit a copy job to ten megabytes per second on the underlying device and confirm sustained throughput from the group's I/O statistics stays near that value.",
    dep: ["control-groups", "slices"]
  },
  "device-access": {
    s: "An allow list of device nodes a service may open and in what mode, enforced by the kernel and combined with a private view of the device tree.",
    d: "A service can be limited to named devices, such as a null or random device, or to classes like block or character devices, with read, write and node-creation flags. With the default policy closed, anything not listed fails to open. Combined with a private device directory, the service sees only what it was given. Rules are compiled into a kernel filter attached to the group. Hard because applications open devices indirectly, such as through libraries that probe hardware, and a missing entry shows up as an unexplained permission failure.",
    k: ["Closed policy with explicit allows vs open with denies: a new device is never reachable by accident; each service needs a deliberate list.", "Kernel-enforced rules vs file permissions only: they apply even to root inside the service; they bypass the usual tools for understanding access."],
    p: ["A service silently failing because a library probes a device that is not allowed.", "Allowing a whole class of block devices where one device was meant."],
    v: "Run a service with only a null device allowed, try opening a disk device from it, and confirm permission is denied even as root; then add the device and confirm it opens.",
    dep: ["control-groups", "private-tmp"]
  },
  "oom-handling": {
    s: "Policy for what happens when a service runs out of memory: let the kernel kill a process, kill the entire group, or have a user-space daemon act earlier on pressure signals.",
    d: "The kernel's response picks one process in the group. A unit setting can make it kill the whole group so no half-dead service remains, or stop picking certain units, such as critical daemons, which are given a score adjustment. A user-space daemon watches pressure stall information and memory use and kills the worst offender in a chosen slice before the machine locks up. The result becomes a unit failure that restart policy sees. Hard because the late kernel response can arrive after the machine has been unusable for minutes.",
    k: ["Kill the whole group vs one process: the service restarts cleanly; a long-lived worker pool loses all its children for one runaway process.", "Early user-space killer vs the kernel's last-resort one: the machine stays responsive; the early killer may kill something that would have recovered."],
    p: ["A kill of one helper process leaves the service running in a half-working state that the manager reports as healthy.", "Protecting too many units from the killer leaves nothing safe to kill."],
    v: "Run a service that allocates until it exceeds a memory cap and confirm the log records an out-of-memory kill of the whole group, a failure result with the oom reason and a restart per policy.",
    dep: ["memory-control", "restart-policies", "control-groups"]
  },
  "filesystem-restrictions": {
    s: "Settings that give a service a read-only or hidden view of the host filesystem: read-only system directories, inaccessible home directories, and explicit lists of writable paths.",
    d: "Before executing the service the manager builds a private mount namespace and remounts parts of the tree: system directories read-only, home and runtime directories empty or inaccessible, and some paths replaced by empty tmpfs. Only listed paths remain writable. A strict level makes the whole tree read-only except what is whitelisted. This blocks a compromised service from changing binaries or reading user data. Hard because services write to unexpected places such as caches and sockets, and the failure appears only on that code path.",
    k: ["Read-only by default with a write allow list vs open with a deny list: small attack surface and an explicit inventory; each missing path breaks at runtime.", "Mount namespace per service vs relying on file permissions: restrictions apply even to root inside the service; the service sees a different filesystem from the one operators inspect."],
    p: ["A service writes a cache or pid file to a now read-only path and fails only on an infrequent code path.", "Debugging from a shell in the host filesystem shows files the service cannot see."],
    v: "Run a service with strict protection and a single writable directory, try writing into the system directory and into its writable one, and confirm the first fails with read-only error while the second succeeds.",
    dep: ["namespace-isolation", "private-tmp", "child-spawn"]
  },
  "private-tmp": {
    s: "A per-service temporary directory and runtime directory, created fresh and removed at stop, so services do not share predictable paths or see one another's files.",
    d: "With private temporary storage, the service sees its own empty directories where the shared ones would appear, backed by a directory created when it starts and deleted when it stops. Separate options create and own state, cache, log and runtime directories with correct ownership and mode. This removes a class of attacks via predictable names and link tricks in shared directories and removes the need for install scripts. Hard because processes that need to exchange files through shared temporary space no longer can, and a restart wipes the contents.",
    k: ["Private temporary directory vs the shared one: no cross-service interference or name-guessing; helpers started elsewhere cannot share files with the service.", "Manager-created state directories vs install scripts: correct ownership at every start, even on a new machine; the directory layout is fixed by the manager's rules."],
    p: ["Two cooperating services that exchanged files in the shared temporary directory stop working after one is sandboxed.", "Relying on temporary files surviving a restart when the private directory is removed at stop."],
    v: "Start two services with private temporary directories, create a file in one, and confirm the other cannot see it and the file is removed after the first stops.",
    dep: ["namespace-isolation", "filesystem-restrictions", "dynamic-users"]
  },
  "namespace-isolation": {
    s: "Placing a service in separate kernel namespaces, such as mounts, process ids, hostname, users, networking and inter-process communication, so it sees a smaller private system.",
    d: "The manager calls the kernel to create new namespaces for the service before it runs. A private process-id space hides other processes; a private network namespace leaves only a loopback device; a private user namespace maps identities; separate inter-process communication and hostname spaces stop interference. Each is one setting, and they combine with the filesystem view. It is the same mechanism a container runtime uses, at lower cost and applied to ordinary services. Hard because some namespaces change what tooling shows, and sharing with other services needs explicit joins.",
    k: ["Isolate by namespace vs full container: cheap and uses the host's files and tools; weaker boundary than a runtime that also controls the image.", "A private network namespace vs filtered access: nothing can leak out; the service cannot be reached unless a socket is passed in."],
    p: ["A private process-id space hides the processes a monitoring agent expects to see, so it reports the service as missing.", "A service isolated from the network cannot reach a local resolver it needs."],
    v: "Start a service with a private network namespace and list its interfaces from inside, confirm only loopback exists, then confirm a socket passed in by activation still receives connections.",
    dep: ["child-spawn", "socket-activation"]
  },
  "capability-bounding": {
    s: "Limiting the kernel privileges a service and everything it starts can ever hold, so even root inside the service cannot perform actions outside the listed set.",
    d: "Administrative power is split into capabilities such as binding low ports or changing ownership. A bounding set removes capabilities from the service permanently and its children, while an ambient set grants specific ones to an unprivileged user so it can run without root. A no-new-privileges flag stops setuid programs from regaining them. A typical network daemon needs only the right to bind a low port. Hard because knowing the minimal set takes trial: a missing capability produces a permission error far from its cause.",
    k: ["Run as an unprivileged user with one ambient capability vs run as root and drop later: smaller window of exposure and nothing to forget; startup tasks needing more power must happen elsewhere.", "A strict allow list vs deny list: new capabilities are excluded by default; upgrades that need a new one break."],
    p: ["A service that needs one more capability for a rare operation fails only when that operation runs.", "Dropping capabilities but leaving setuid helper programs reachable defeats the restriction without the no-new-privileges flag."],
    v: "Run a service as an unprivileged user with only the low-port capability, bind port eighty, and confirm it works; try changing file ownership and confirm it is refused.",
    dep: ["child-spawn", "dynamic-users"]
  },
  "syscall-filters": {
    s: "A kernel filter attached to a service that allows only named groups of system calls and blocks or kills on others, reducing the kernel attack surface it can reach.",
    d: "The manager installs a filter before the service runs; each call is checked against an allow or deny list. Predefined groups, such as basic system services, file system and network, make lists short. A violation returns an error or kills the process, and there is an option to log them. Architecture checks prevent bypass via a second call convention. Hard because the real set a program uses depends on libraries and code paths, and a missed call causes a crash at runtime.",
    k: ["Allow list of groups vs deny list: unknown new calls are blocked; lists need updating as libraries evolve.", "Return an error vs kill the process: error lets the program degrade gracefully; kill gives certainty an attacker stops."],
    p: ["An allow list built from a short test run kills the service the first time it hits a rare code path.", "Allowing a broad group such as all privileged operations makes the filter ineffective."],
    v: "Run a service that attempts a blocked call, such as changing the system clock, and confirm the process is terminated or the call fails and the violation appears in the log with the call name.",
    dep: ["child-spawn", "capability-bounding"]
  },
  "dynamic-users": {
    s: "Allocating a temporary user and group at service start from a reserved range and releasing them at stop, so a service needs no permanent account and cannot share identity.",
    d: "With this option the manager picks an unused numeric identity, creates a transient name for it and starts the service under it, together with its private state directories. When the service stops, the account disappears and files left behind are owned by a number only. The identity is derived deterministically from the name where persistent data exists. This avoids package scripts that create accounts and prevents two services sharing one. Hard because files outside the service's own directories end up with unmapped owners, and long-lived data needs stable allocation.",
    k: ["Transient identities vs permanent accounts: no leftover users and no collisions; files outside managed directories become orphaned by number.", "Deterministic mapping from the unit name vs random allocation: persisted data stays owned across restarts; the range limits how many services can use it."],
    p: ["Data written to a shared path becomes owned by a number no account has after the service stops.", "Looking up the service's account name from another program that cannot resolve a transient one."],
    v: "Start a service with a dynamic user, read its process owner and confirm a number in the reserved range resolves to a name; stop it and confirm the name no longer resolves.",
    dep: ["private-tmp", "child-spawn"]
  },
  "network-restrictions": {
    s: "Settings that limit a service's network reach: allowed address families, address allow and deny lists enforced in the kernel, and per-service traffic accounting or marking.",
    d: "A service can be limited to local sockets, or to specific address families so it cannot open raw sockets. Allow and deny lists on address ranges are attached to its control group and checked in the kernel, regardless of the program. Accounting counts bytes sent and received and can mark packets for later firewall rules. Combined with a private network namespace this gives strong containment. Hard because name resolution and discovery use sockets a naive list forbids, and rules on address ranges do not catch a hostname that resolves to many.",
    k: ["Per-service address filters vs a host firewall only: policy sits with the unit definition and applies to any process in it; two places hold network policy.", "Restricting address families vs filtering addresses: removes whole attack classes cheaply; coarse, with no control within the permitted families."],
    p: ["Forbidding a family that the resolver library uses makes name lookups fail in a way that looks like a network outage.", "Allow lists written as addresses break when a provider changes them."],
    v: "Run a service with only local sockets allowed, try an outbound network connection and confirm it fails while a local socket connection works.",
    dep: ["control-groups", "namespace-isolation"]
  },
  "log-capture": {
    s: "Connecting each service's standard output and error, its syslog-style messages and kernel messages to the log system, tagged with the unit and process that produced them.",
    d: "When starting a service, the manager points its output descriptors at a stream socket owned by the logger, so every line is attributed to the service via the socket's peer identity. Programs that call the system log interface reach a datagram socket, and the kernel ring buffer is read too. Lines are split on newline, given a priority and stored with metadata. A partial line at exit is flushed. Hard because output at a high rate can stall the writer if the logger is slow, and during early boot the logger may not be up yet.",
    k: ["Capture through a socket vs files owned by the service: reliable attribution and no log rotation per service; a service that expects a file path must be adapted.", "Buffered early messages replayed when the logger starts: nothing from early boot is lost; the ordering relative to later messages needs timestamps."],
    p: ["A service that prints binary or very long lines without newlines is split in confusing places.", "Messages from the final seconds before a crash lost when the pipe buffer is not flushed."],
    v: "Run a service that prints one line to output and one to error, then query its logs by unit and confirm both appear with their priorities and the right process id.",
    dep: ["child-spawn", "journal-store"]
  },
  "journal-store": {
    s: "A binary, indexed log database that stores entries as sets of fields, supports queries by field and time without a separate indexing service, and detects tampering with sealing.",
    d: "Entries are appended to files with hash tables per field, so lookups by unit, priority, boot or process do not scan everything. Each entry holds a realtime and monotonic timestamp, the boot id and arbitrary key-value fields. Files can be sealed periodically with a rolling key to make deletion or alteration detectable. Entries from several sources merge in time order at read. Hard because the format is a compatibility contract and a crash must leave a file readable, so writers are carefully ordered.",
    k: ["Binary indexed storage vs plain text: fast filtered queries and rich fields; standard text tools cannot read it directly.", "Sealing with a forward-secure key vs none: tamper evidence after a compromise; the verification key must be kept elsewhere."],
    p: ["A corrupted file after a hard power loss can hide recent entries until it is repaired or rotated.", "Assuming text tools can search the binary file directly."],
    v: "Write a distinctively tagged message through the logger, query by that field and confirm it appears with timestamps and boot id; run the verification command and confirm the files are intact.",
    dep: ["structured-fields", "journal-persistence"]
  },
  "structured-fields": {
    s: "The key-value fields attached to each log entry, both automatic, like unit, process id, user and priority, and custom ones that programs add for later filtering.",
    d: "Trusted fields, prefixed to mark them as set by the logger, record the unit, command, executable, user, control group and boot from kernel-verified facts. Programs can add their own fields through the native protocol, including multiline or binary values. Queries combine fields with and and or. Structured logging lets an error carry a stable code, request id and component instead of encoding them in prose. Hard because fields from untrusted programs must not be mistaken for the trusted ones, and high cardinality fields grow the indexes.",
    k: ["Trusted and untrusted fields separated: filters on unit and user cannot be spoofed; programs cannot choose their own identity.", "Rich arbitrary fields vs free text: precise queries and counts; every program must agree on names, or fields fragment."],
    p: ["Filtering on a field a program sets itself and trusting it as proof of origin.", "Putting a unique value, such as a request id, in a field everyone indexes, which inflates index size."],
    v: "Log an entry with a custom error-code field from a test program, query using that field alone and confirm exactly that entry returns, with the trusted unit field set by the logger.",
    dep: ["log-capture", "control-groups"]
  },
  "journal-persistence": {
    s: "Choosing where logs live and how they are bounded: memory only or on disk, size and age limits, rotation of files, and vacuuming of the oldest entries.",
    d: "By default logs may be kept in a volatile directory and lost at reboot, or stored persistently if the directory exists. Size limits are set as a share of the filesystem and a free space floor, and files rotate by size and age; older archives are deleted to meet the limits. Previous boots are listed by identifier. Hard because disk filling from verbose services forces deletion of the very history needed to debug, and persistence on a small flash device wears it out.",
    k: ["Persistent storage vs memory only: a crashed or rebooted machine has its logs for diagnosis; flash devices pay in writes and space.", "Size limits that delete oldest first vs time limits: the disk is bounded; a burst can push out older entries from the incident being investigated."],
    p: ["Volatile logs lost at the reboot that followed the crash, so the cause is gone.", "A noisy service filling the budget and evicting the earlier history of other services."],
    v: "Enable persistent storage, reboot twice, and confirm that previous boots are listed and their messages are readable; set a small size limit and confirm old archives are removed to stay within it.",
    dep: ["journal-store", "mount-units"]
  },
  "log-rate-limit": {
    s: "Per-service limits on how many messages are accepted in an interval; extra messages are dropped and counted, so a runaway service cannot flood the log or the disk.",
    d: "For each source unit the logger counts messages in a time window and drops those above a burst limit, then writes a single line saying how many were suppressed. The limit can be raised or disabled per unit. This protects the disk, the I/O of other services and the readable portion of the log. It is hard because the dropped lines may include the important one, and limits that suit normal operation lose detail exactly during an incident when output spikes.",
    k: ["Rate limiting per service vs unbounded logging: a flood cannot starve the system; detail is lost during bursts.", "A suppression summary line vs silent drops: operators know data was lost; the count says nothing about what the lines contained."],
    p: ["A crash loop with detailed errors is truncated by the limit just as the useful lines are written.", "Disabling limits to debug and leaving them off, so one service fills the disk later."],
    v: "Run a service that prints thousands of lines in one second, query its logs, and confirm only the burst limit worth of lines appear followed by a message stating how many were suppressed.",
    dep: ["log-capture", "journal-store"]
  },
  "log-querying": {
    s: "Reading logs by unit, priority, boot, time range and field, following live output, and exporting in structured or text formats for other tools.",
    d: "The query tool filters by matching fields, such as a unit or process, by priority threshold, by a time window or relative boot, and prints in several formats: short text, verbose with all fields, structured exports for forwarding and streams for tools. Follow mode shows new entries as they arrive. A remote gateway can serve or receive entries from other machines. Hard because queries reading large archives can be slow without the right filter, and timestamps from several boots need the monotonic clock to order events.",
    k: ["Field-based filters vs text search: precise, cheap results; people accustomed to text patterns must learn the fields.", "Exporting entries for forwarding vs reading in place: central collection is possible; the transport needs its own security and back-pressure."],
    p: ["Reading only the current boot while the problem started in the previous one.", "A broad query without a time bound on a large archive that takes minutes and loads the disk."],
    v: "Query for errors from one unit in the last boot, and confirm only that unit's priority error and higher entries appear in time order; follow mode prints a new entry within a second of it being logged.",
    dep: ["journal-store", "structured-fields"]
  },
});
