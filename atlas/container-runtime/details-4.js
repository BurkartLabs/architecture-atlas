// Details for the container runtime plate, part 4: limits and confinement, image storage.
ATLAS.details("container-runtime", {
  "cgroup-hierarchy": {
    s: "A tree of control groups in which each container gets a node; resource controllers attached to the tree account for and limit what its processes use.",
    d: "Control groups form a hierarchy where a child's limits are bounded by its parent's. The runtime creates one node per container under a parent chosen by the host's service manager or by the runtime itself, places the container's processes in it and writes controller settings. All processes in the node, including later children, are counted together. A container's node also gives a single place to freeze, kill or measure the whole group. It is hard because ownership of the tree must be agreed between the runtime and the service manager, or each rewrites the other's settings.",
    k: ["Runtime creates groups directly vs asks the service manager to create them: direct creation is simple, but two managers fighting over one tree produces unpredictable limits.", "One node per container vs per group of containers: per-container nodes give precise accounting, per-group nodes give a shared budget for sidecars."],
    p: ["A service manager reset removes limits set by the runtime because the runtime wrote them outside its own subtree.", "A container node is not removed after exit, and thousands of stale nodes slow accounting reads."],
    v: "Start a container, read its control group path, and confirm every process of the container, including children spawned later, is listed in the group's process file. Delete the container and confirm the node is gone.",
    dep: ["cgroup-filesystem"]
  },
  "memory-limits": {
    s: "Caps on the memory a container's processes can use, with a point at which the kernel reclaims, throttles or kills when the cap is reached.",
    d: "A hard limit bounds anonymous memory, page cache and kernel memory charged to the group. When usage nears the limit the kernel reclaims cache first, and if it cannot free enough it invokes the out-of-memory killer within the group, ending a process and recording the event. A soft threshold lowers pressure earlier, and a swap limit controls spill. The group's exit reason is reported to the runtime through an event file. It is hard because page cache counts toward the limit and the killer may pick any process, not the largest or the main one.",
    k: ["Hard limit with kill vs throttling only: a hard limit protects neighbors absolutely, but turns a memory spike into a lost process.", "Disable swap for the group vs allow some: no swap gives predictable latency, while some swap tolerates spikes with slow paging."],
    p: ["A container with a limit near its working set is killed during a traffic spike and restarts in a loop.", "A limit set below the program's runtime reservation, such as a heap setting, causes kills the program cannot predict."],
    v: "Run a program that allocates until stopped inside a container with a fixed limit and confirm it is killed near that value, the exit status shows kill by signal, and the memory event counter increments.",
    dep: ["cgroup-hierarchy", "exit-reporting"]
  },
  "cpu-limits": {
    s: "Controls how much processor time a container receives: relative weights under contention, a hard quota per period, and pinning to chosen processors.",
    d: "A weight decides proportional share when processors are busy and costs nothing when idle. A quota gives a number of microseconds per period, after which the group is throttled until the next period even if processors are idle. Pinning restricts the group to specific processors or memory nodes. Throttling statistics show how often a group hit its quota. It is hard because quotas affect latency in surprising ways: a multi-threaded program can use its whole period in a burst and then stall for the rest.",
    k: ["Weights vs hard quotas: weights use idle capacity fully, while quotas give predictable ceilings at the price of throttling latency.", "Pin to dedicated processors vs shared pool: pinning avoids interference and cache churn, but strands capacity when the pinned work is idle."],
    p: ["A quota set per period throttles a busy multi-threaded service for most of every period, doubling tail latency.", "Programs read the host's processor count and size thread pools to it, ignoring the quota, and thrash."],
    v: "Run a busy loop in a container with a half-processor quota and confirm usage stays near fifty percent and the throttled counter increases. Remove the quota and confirm usage rises to a full processor.",
    dep: ["cgroup-hierarchy"]
  },
  "io-and-pid-limits": {
    s: "Limits on disk throughput and operations per second per device, and on the number of processes and threads a container may create.",
    d: "The block I/O controller applies weights or throttles in bytes and operations per second per device, though buffered writes through the page cache are often charged imperfectly. The process-count controller caps the number of tasks in the group, which stops fork bombs from exhausting the host. When the limit is reached, process creation fails inside the container. Both limits are written to control group files. It is hard because I/O limits depend on device layout and accounting paths, and a pid limit is shared between processes and threads.",
    k: ["Throttle I/O per device vs weights: throttling gives a ceiling regardless of load, but wastes bandwidth when the device is otherwise idle.", "A low process limit vs none: a low limit contains a fork bomb, but a multi-threaded service may hit it under normal load."],
    p: ["Buffered writes bypass the throttle because they are flushed by a kernel thread outside the group.", "Thread creation fails with an obscure resource unavailable error because threads count toward the pid limit."],
    v: "Run a program that forks without limit in a container with a process cap and confirm fork fails at the cap while the host stays responsive. Run a sequential write with an I/O cap and compare measured throughput.",
    dep: ["cgroup-hierarchy"]
  },
  "device-access-rules": {
    s: "An allow list of device nodes a container may open and in what mode, enforced by the kernel on the container's control group.",
    d: "By default a container gets a short list: null, zero, random, terminal and a few others. Further devices must be added explicitly in the spec, which both creates the node in the container's device directory and adds an allow rule for its major and minor numbers in the control group's device filter. Rules distinguish read, write and node creation. It is hard because a device node file inside the container is useless without the rule, and a rule without a node file is invisible, so the two must be kept in step.",
    k: ["Deny by default with explicit additions vs allow all devices: deny by default stops access to disks and memory, but each hardware workload needs its device named.", "Privileged mode granting all devices vs per-device grants: privileged mode is easy and works for everything, but makes the container equal to root on the host."],
    p: ["A container started as privileged to get one device can read and write the host's disks.", "A node is created but the filter rule is missing, so open fails with permission denied despite correct file permissions."],
    v: "Start a container without extra devices and try to open a disk device node created inside it; confirm denial. Add the device to the spec and confirm the open succeeds only for the granted mode.",
    dep: ["cgroup-hierarchy", "mount-table-setup", "runtime-spec"]
  },
  "capability-sets": {
    s: "The kernel's division of root's powers into separate privileges, with the runtime giving the container's processes a reduced set instead of full root.",
    d: "Each process has permitted, effective, inheritable, ambient and bounding capability sets. The runtime drops everything outside an allow list, typically keeping powers like changing file owners and binding low ports and removing power over modules, raw devices and system time. The bounding set caps what any descendant can ever regain, even through a setuid program. Users add or drop specific entries per container. It is hard because some capabilities are close to full root, and an application's need for one is often found only by failure.",
    k: ["Drop all and add back the needed vs a default list minus a few: drop-all is safest, but requires understanding every need, while a default list is practical but broad.", "Bounding set limited vs only effective set: limiting the bounding set stops regaining powers through executables, but breaks legitimately privileged tools."],
    p: ["A container granted the power to administer the system can mount filesystems and escape in several ways.", "A program failing with permission denied is fixed by adding a broad capability instead of the specific narrow one."],
    v: "Read the process status file inside a container and confirm all five capability sets match the spec. Attempt an operation that needs a dropped capability and confirm it fails with permission denied.",
    dep: ["runtime-spec", "final-exec"]
  },
  "syscall-filter": {
    s: "A program loaded into the kernel that inspects every system call the container makes and allows, rejects or kills based on its number and arguments.",
    d: "The runtime compiles a profile, a list of rules by call name and argument, into a filter program and installs it just before the user program starts, with no-new-privileges set so it cannot be removed. The default profile allows several hundred common calls and blocks dangerous ones such as loading kernel modules, rebooting, and mounting. Blocked calls return an error or kill the process. Filters apply to all descendants. It is hard because filtering is by number, so new calls and aliases must be tracked, and an over-strict profile fails only when a rare code path runs.",
    k: ["Allow list vs deny list profile: an allow list denies everything new by default, but breaks applications on newer calls, while a deny list is easier but lets new dangerous calls through.", "Return an error vs kill the process on a violation: errors let programs degrade or log, while kills stop an attack immediately but hide the cause."],
    p: ["A newer library uses a newly added system call the profile does not list, and fails only on updated hosts.", "A custom profile copied from an old version omits calls required by the current runtime and breaks container start."],
    v: "Run a container and attempt a blocked call such as changing the system time; confirm it fails with a permission or not-permitted error. Read the process status and confirm the filter mode is active.",
    dep: ["runtime-spec", "final-exec", "security-module-hooks"]
  },
  "mac-profiles": {
    s: "Named policies enforced by a kernel security module that restrict files, networks and operations a container's processes can touch, beyond ordinary permissions.",
    d: "The runtime names a profile in the spec, and just before executing the program it asks the kernel to confine the process to that policy, which is checked on every relevant operation and cannot be lifted from inside. A default profile denies writes to sensitive kernel interfaces and mounting. Hosts load profiles from files, and profiles can be written per workload. Policy labels are also applied to the container's files so the confined process can read them. It is hard because policies are host-specific, and a missing profile is either fatal or silently unconfined.",
    k: ["Default generic profile vs per-workload profiles: a generic profile gives broad protection for no effort, while tailored profiles protect more tightly but need maintenance.", "Fail container start if the profile is missing vs run unconfined: failing preserves the security promise, but breaks portability to hosts with no such module."],
    p: ["The profile is named in the spec but the host has no module enabled, and the container runs fully unconfined with no warning.", "Disabling confinement to fix one denial leaves the container unprotected permanently."],
    v: "Read the confinement label of a container process and confirm the named profile is applied. Attempt a write to a protected kernel path and confirm the module denies it and logs the denial.",
    dep: ["runtime-spec", "final-exec", "security-module-hooks"]
  },
  "masked-paths": {
    s: "Hiding or making read-only the kernel interfaces that leak host information or allow control, and setting the flag that stops processes from gaining privilege through executables.",
    d: "Certain pseudo-files expose kernel memory, host-wide settings and hardware data. The runtime bind-mounts an empty file or directory over each masked path and remounts others read-only. The no-new-privileges flag makes execution of setuid programs ignore their elevated ids and stops file capabilities from adding powers. Both are applied late in setup. It is hard because the list of dangerous paths changes with kernel versions, and a mask can be undone by a process with the power to mount.",
    k: ["Mask by bind-mounting over paths vs rely only on the access-control profile: masking works with no security module, but is a list that must track kernel changes.", "No-new-privileges always vs per workload: always setting it blocks privilege escalation through setuid files, but breaks programs that rely on them such as some network tools."],
    p: ["A new kernel interface appears that leaks host data, and no mask covers it until the list is updated.", "A container with the power to mount removes the mask and reads kernel memory interfaces."],
    v: "Inside a container, read a masked kernel path and confirm it is empty or unreadable. Run a setuid program as an ordinary user and confirm its elevated user id is not applied.",
    dep: ["mount-table-setup", "capability-sets"]
  },
  "content-store": {
    s: "The local store of blobs addressed by digest: image manifests, configs and compressed layers, written atomically and verified before they become visible.",
    d: "A blob is written to a temporary location, hashed as it is received, and moved to a path derived from its digest only if the hash and size match. Ingest sessions can be resumed by reference. Readers open blobs by digest and may take ranges. Labels on blobs record references used by garbage collection. Because storage is immutable and deduplicated, the same layer is stored once however many images use it. It is hard because partial and concurrent writers must not expose half-written content.",
    k: ["Atomic rename after verification vs writing in place: rename guarantees readers only see valid blobs, but needs temporary space and the same filesystem.", "One shared store across namespaces of users vs separate stores: sharing saves disk and bandwidth, while separate stores prevent one tenant learning which images another holds."],
    p: ["A crash after writing but before renaming leaves orphan temporary data that fills the disk until cleaned.", "Tenants sharing a store can infer others' images by testing whether a digest is already present."],
    v: "Ingest a blob, then confirm it exists at the digest-derived path and its hash matches. Interrupt another ingest midway and confirm no blob with that digest is visible until it completes.",
    dep: ["content-addressing"]
  },
  "metadata-store": {
    s: "A transactional database of names and relationships: image names mapped to digests, container records, snapshot ownership, and labels, separate from bulk content.",
    d: "While blobs sit on the filesystem, the small structured facts live in an embedded transactional database: which names point to which manifests, which snapshots belong to which containers, and which labels pin which content. Operations such as creating a container record and taking its snapshot run in one transaction so a crash cannot leave one without the other. Garbage collection walks this graph to find unreferenced content. It is hard because metadata and files can drift apart if a file is deleted by hand.",
    k: ["Embedded transactional database vs files per object: transactions give atomic multi-object changes and fast queries, but corruption affects everything and files are harder to repair by hand.", "Namespaces for tenants within one database vs separate databases: namespaces share one process and store with logical separation, while separate databases give hard separation."],
    p: ["Someone deletes a blob directory by hand and the metadata still lists the image as present, causing runtime pull-skip failures.", "A long write transaction blocks all other metadata updates and stalls container creation."],
    v: "Remove an image name and confirm its metadata entry disappears while the blob remains until garbage collection. Kill the runtime during container creation and confirm either both the record and snapshot exist or neither does.",
    dep: ["content-store"]
  },
  "snapshotter": {
    s: "The interface that turns a stack of image layers into a mountable root filesystem and gives each container a writable layer on top.",
    d: "A snapshotter exposes prepare, commit, view, mount, remove and usage operations on named snapshots with a parent chain. Unpacking an image commits one snapshot per layer, each parented on the previous. Starting a container prepares an active snapshot on the top layer and returns mount instructions the runtime performs. Implementations differ: overlay of directories, copy-on-write volumes, per-layer block images or remote lazy snapshots. It is hard because it must be fast, correct under concurrency and able to report disk use per snapshot.",
    k: ["Pluggable snapshotter vs a built-in storage driver: pluggable lets a host choose by filesystem and workload, but each implementation has different failure and performance behavior.", "Mount instructions returned to the caller vs snapshotter mounting itself: returning instructions keeps the snapshotter unprivileged and portable, but the caller must mount and unmount correctly."],
    p: ["A snapshotter unsupported by the underlying filesystem fails at first container start, not at configuration.", "Removing a parent snapshot while children exist is refused, and cleanup logic that ignores the error leaks storage."],
    v: "Unpack an image and confirm one committed snapshot per layer with the right parent chain. Start two containers from it, write in one, and confirm the other does not see the change.",
    dep: ["layer-unpack", "metadata-store", "overlay-driver"]
  },
  "overlay-snapshotter": {
    s: "A snapshotter that stacks each layer as a directory and uses the kernel's overlay filesystem to present them as one tree with a writable upper directory.",
    d: "Each committed layer is a directory on a local filesystem. The overlay mount is given the lower directories, a writable upper directory and a work directory. Reads fall through to the first layer holding the file. A write to a lower file first copies the whole file up. Deletions create whiteout entries in the upper directory. It is fast to set up and shares layers by reference. It is hard because behavior depends on the underlying filesystem, copy-up of big files is slow, and the number of lower layers is limited by mount option length.",
    k: ["Directory layers with overlay mounts vs block-level snapshots: overlay is cheap and shares files, but copy-up copies entire files for small changes.", "Many lower layers vs squashed layers: many layers give sharing, while squashing avoids the limit on mount arguments but loses it."],
    p: ["A mount fails with an argument too long error on images with dozens of layers.", "Modifying one byte of a multi-gigabyte database file copies the whole file into the upper layer."],
    v: "Start a container, change one byte in a large lower file, and confirm the upper directory then contains a full copy. Delete a lower file and confirm a whiteout appears in the upper directory.",
    dep: ["snapshotter", "overlay-driver", "whiteouts-and-diffs"]
  },
  "layer-unpack": {
    s: "Applying each layer archive to a snapshot in order, translating deletions and ownership, and committing the result as an immutable layer.",
    d: "For each layer in manifest order the unpacker decompresses the blob, extracts entries into a prepared snapshot, handles hard links, device nodes, extended attributes and whiteouts for the chosen snapshotter, validates that no path escapes the target, and records the uncompressed digest to compare with the config. Then it commits the snapshot. Unpacking is CPU and disk bound and can overlap with downloads. It is hard because archive entries are untrusted input, and rootless mode cannot create device nodes or set arbitrary owners.",
    k: ["Unpack at pull vs unpack at first use: at pull moves work off the start path, while first use avoids unpacking images that never run.", "Strict path validation with rejection vs best-effort extraction: rejection prevents traversal, but fails on odd archives that old tools accepted."],
    p: ["A symbolic link entry followed by a file under it writes outside the snapshot during extraction.", "Unpacking as an ordinary user silently skips device nodes and the container later lacks a needed node."],
    v: "Unpack a layer containing a link pointing outside the target followed by a file beneath it and confirm extraction is rejected. Unpack a normal layer and confirm its uncompressed digest matches the config.",
    dep: ["layer-blobs", "snapshotter", "whiteouts-and-diffs", "content-store"]
  },
  "lazy-pulling": {
    s: "Starting a container before its image is fully downloaded, by fetching individual files from the registry on demand using a seekable layer format.",
    d: "A remote snapshotter mounts the layer through a user-space filesystem that maps file reads to ranged requests against chunked blobs, using an index of file offsets stored with the layer. Frequently used files are fetched first, and a background task downloads the rest. Containers start in seconds even for multi-gigabyte images. It is hard because the network is now in the read path of every file: a registry outage or slow link stalls the running application, and first-run behavior differs from later runs.",
    k: ["On-demand fetch vs full pull before start: lazy fetching cuts start time sharply for large images, but moves network latency and failure into running applications.", "Prefetch by recorded access pattern vs fetch only on demand: prefetching hides latency for known workloads, but needs profiling and wastes bandwidth if wrong."],
    p: ["A registry outage after start makes reads of not-yet-fetched files hang or fail inside a running program.", "A cold start benchmark looks fast, while the first requests to the application are slow because files are fetched then."],
    v: "Start a large image under lazy pulling and confirm the container runs before the blobs are fully downloaded. Block the registry and confirm reads of unfetched files fail while fetched files still work.",
    dep: ["snapshotter", "layer-compression", "registry-client"]
  },
  "image-gc": {
    s: "Removing images, blobs and snapshots that nothing references anymore, either on demand or when disk use crosses a threshold.",
    d: "Collection marks everything reachable from image names, containers, leases and labels, then deletes unmarked blobs, snapshots and metadata. Because layers are shared, removing an image deletes only layers no other image uses. Node agents trigger collection by disk thresholds, removing the least recently used images first. In-progress pulls hold temporary references so their content is not collected. It is hard because deletion races with pull and run: content not yet referenced may look unused.",
    k: ["Mark and sweep over references vs reference counts: sweeping finds cycles and fixes drift, but needs a consistent view of all roots to be safe.", "Threshold-triggered collection vs scheduled: thresholds react to real pressure, but can delete an image just before it is needed again and force a repull."],
    p: ["Collection removes layers a pull has just downloaded because the pull did not yet hold a reference.", "A node under disk pressure collects the image of a container about to be restarted, then fails to pull offline."],
    v: "Remove one image sharing a base with another, run collection, and confirm shared layers remain while unique layers are deleted from the content store and snapshot list and disk usage drops.",
    dep: ["leases", "metadata-store", "content-store", "snapshotter"]
  },
  "leases": {
    s: "Temporary or named holds on content and snapshots that protect them from garbage collection while an operation that references them is still in progress.",
    d: "An operation such as a pull, import or container creation takes a lease with an identifier and an optional expiry. Everything created under it, and anything it references, is treated as reachable until the lease is released or expires. This closes the window between writing a blob and adding the image name that points to it. Expiry handles crashed clients. It is hard because leases must always be released, and an unexpired lease from a dead process pins storage.",
    k: ["Leases with expiry vs explicit release only: expiry cleans up after crashed clients, but an operation slower than the expiry loses its protection.", "Lease per operation vs one global lock during collection: leases let collection run while work continues, but add bookkeeping to each operation."],
    p: ["A client that crashes after taking a lease with no expiry pins gigabytes of content forever.", "A very slow import outlasts its lease and has half its content collected."],
    v: "Start a pull, trigger collection while it is mid-flight, and confirm the downloaded blobs survive and the pull completes. Abandon a lease with an expiry and confirm its content is collected afterward.",
    dep: ["metadata-store", "content-store"]
  },
});
