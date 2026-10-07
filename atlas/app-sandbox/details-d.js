// Details for the application sandbox plate, part 4: filesystem views and network restrictions.
ATLAS.details("app-sandbox", {
  "mount-namespace": {
    s: "A private table of mounted filesystems for the confined process, so the tree it sees is one the broker built and not the host's.",
    d: "A new mount namespace starts with a copy of the host's mounts that the launcher then rearranges: mount selected directories, hide the rest, change the root to a prepared directory, and detach the old root. Changes inside do not propagate out, provided propagation is set to private. The process cannot undo this without the right to mount. It is hard because propagation flags, bind mounts and leftover references to the old root are subtle, and a single missed mount exposes the host.",
    k: ["Change root into a minimal tree vs hide paths on the host tree: a new root is clean and exact; hiding paths is easier to add and misses anything unlisted.", "Private propagation vs shared: private stops leaks both ways and cuts off legitimate mounts such as removable media; shared is convenient and leaks changes in."],
    p: ["Old root remains reachable through an open directory handle or a working directory left outside.", "Mount propagation set to shared makes the app's mounts appear on the host."],
    v: "Inside the sandbox read the mount table and the root directory listing. Only the intended entries may appear, and attempts to reach the host root through parent traversal or an old handle must fail.",
    dep: ["user-namespaces", "filesystem-view-construction"]
  },
  "filesystem-view-construction": {
    s: "Assembling the tree the app will see: its own bundle, libraries, data container and granted locations, mounted at expected paths and nothing else.",
    d: "The launcher builds the root from layers: read-only system runtime, the app's bundle, a private writable data area, a temporary directory, a minimal device directory and a process information view. Bind mounts attach real directories without copying. The goal is the smallest tree that lets the app run, laid out so existing code finds files where it expects them. It is hard because applications assume ordinary paths and host files such as configuration and fonts, and each extra mount is another leak.",
    k: ["Compose from shared runtime layers vs per-app copy: shared layers save space and update centrally; per-app copies are self-contained and cannot be patched in one place.", "Mirror host paths vs a different layout: mirroring helps compatibility and reveals system structure; a different layout hides it and breaks assumptions."],
    p: ["A convenience mount of the home directory for one feature exposes every file in it.", "Device directory includes nodes the app does not need, which reopen kernel interfaces the filter tried to block."],
    v: "Walk the app's whole visible tree and diff it against the manifest of intended mounts. Any extra directory, device node or readable host file is a failure to fix before release.",
    dep: ["read-only-binds", "scratch-space", "app-data-containers"]
  },
  "read-only-binds": {
    s: "Mounting directories into the sandbox read-only, with no-execute and no-device flags where fit, so the app can use shared files without changing them.",
    d: "Read-only bind mounts expose system libraries, fonts and shared data to many apps from a single copy. The read-only flag is applied to the mount, not the underlying files, so the host can still update them. Additional flags prevent device nodes and special execute bits. It is hard because remounts and sub-mounts may not inherit flags, because a writable mount of the same files elsewhere defeats it, and because some apps expect to write into directories that are now read-only.",
    k: ["Read-only mount flag vs file permissions: mount flags apply regardless of file owner and are enforced per view; permissions can be bypassed by an owner or a capability.", "Share system files vs copy: sharing is efficient and exposes the host's contents; copying isolates and delays patches."],
    p: ["A sub-mount inside a read-only tree is created writable, giving the app a way to alter shared content.", "The same underlying directory is also bound read-write for another feature, so read-only offers nothing."],
    v: "Attempt to create, modify, rename and execute files within each read-only mount, and to remount it writable. All must fail, while the host-side update of the same directory is visible inside.",
    dep: ["mount-namespace"]
  },
  "scratch-space": {
    s: "A private, size-limited temporary area the app can write to freely, which disappears when the sandbox ends.",
    d: "Temporary files go into a memory-backed or disk-backed directory unique to the app instance, with size and file-count quotas, no device or execute permissions, and removal on exit. Keeping scratch separate from persistent data means cleanup is simple and one app cannot fill another's space. It is hard because large temporary files stress memory-backed storage, because applications sometimes put data there that must survive, and because shared temporary directories are a classic source of name-guessing and symlink attacks.",
    k: ["Memory-backed scratch vs disk-backed: memory is fast and leaves no residue and competes with the app for RAM; disk is large and persists after crashes until cleaned.", "Per-instance vs per-app scratch: per-instance is clean on every launch; per-app preserves caches and leaves old state behind."],
    p: ["No quota is set, so one app fills the filesystem and breaks others.", "Cleanup on crash is skipped and sensitive temporary data lingers on disk."],
    v: "Write to scratch until the quota, confirm a clean error, then kill the app and confirm the directory is gone and its memory or disk space is returned.",
    dep: ["mount-namespace", "resource-limit-setup"]
  },
  "app-data-containers": {
    s: "A private persistent directory per app and user for its settings and files, which no other app can read.",
    d: "Created at install under a path derived from the app identity, owned by the app's own identity, and mounted only into that app's view. Backup, restore and migration treat it as a unit. The platform controls the quota and deletes it on uninstall. It gives each app a place to put data without any broader file permission. It is hard because data moves with updates and device changes, because apps want to share data between versions or siblings, and because attackers aim to plant files there before the first run.",
    k: ["One container per app vs shared groups: per-app containers are tight; shared containers let a publisher's apps cooperate and widen exposure to each of them.", "Encrypt at rest per app vs rely on device encryption: per-app keys limit exposure from a stolen store and complicate backup and migration."],
    p: ["Container path derived from a display name lets another app with the same name inherit it after uninstall.", "Restoring a backup creates a container with the wrong owner so the app silently falls back to broad paths."],
    v: "Write a file in one app's container and attempt to read it from another app and from a shell outside the sandbox without the platform tools. The first must fail; the second only as policy allows.",
    dep: ["app-identity-and-signing", "mount-namespace"]
  },
  "path-based-rules": {
    s: "Access rules written in terms of file paths, such as allow read of this directory, which are easy to write and read.",
    d: "The kernel hook resolves the path the process used, normalizes it against its own view, and matches rules, often as a compiled automaton. Rules are written in terms authors understand and apply to files not yet created. The weakness is that the same file has many names: hard links, bind mounts, symbolic links and different mount namespaces change the path. Rules can therefore over- or under-match, so path rules work best combined with a view in which unexpected paths do not exist.",
    k: ["Path-based vs label-based: paths need no labeling and are fooled by aliases; labels follow the object and need a maintained labeling scheme.", "Match the path as given vs the resolved path: resolved is safer against links and costs lookups; as-given is cheap and easy to evade."],
    p: ["A hard link to a protected file under an allowed directory lets the app read it through the permitted name.", "Rule written for the host path does not match inside the sandbox where the path differs."],
    v: "Create a hard link, a symbolic link and a bind-mounted alias of a protected file inside an allowed directory, and confirm access is denied through every alias, with the denial naming the rule.",
    dep: ["policy-language", "mandatory-access-control"]
  },
  "label-based-rules": {
    s: "Access rules that attach security labels to files and processes, so a decision depends on what the object is rather than what it is called.",
    d: "Every file, socket and process carries a label; a policy table says which process labels may perform which operations on which object labels. New files inherit labels by rule, and relabeling is a privileged action. Labels survive renames and links, which defeats alias tricks. It is hard because the label policy is large and subtle, because every object must be labeled correctly at creation and after restores, and because debugging a denial requires reading label rules, not paths.",
    k: ["Labels vs paths: labels are robust and require a labeling infrastructure, tools and expertise; paths are approachable and weaker.", "Fine-grained label types vs a few broad ones: fine types give least privilege and thousands of rules; few types are manageable and conflate different data."],
    p: ["Files restored from a backup lose their labels and fall into a permissive default.", "A broad label shared by app data and system data lets an exploited app read system files with no rule violation."],
    v: "Rename and hard-link a labeled file into an allowed directory and confirm the label, not the name, decides access. Restore a backup and verify the labels match the policy's expectation.",
    dep: ["mandatory-access-control", "policy-language"]
  },
  "file-handle-capabilities": {
    s: "Treating an open handle as the permission to act, so the sandbox lets the app operate on handles it holds and never resolve names it does not.",
    d: "In capability style, the app has no global namespace at all. It receives handles for directories and files and may open only relative to them, with the kernel refusing absolute paths and parent traversal beyond the handle. Rights are attached to the handle: read, write, create, list. This yields strong confinement without large rule sets. It is hard because existing programs use absolute paths and libraries use ambient authority, so they need adaptation, and a directory handle without a no-escape rule is a path back to the root.",
    k: ["Capability-style resolution vs path rules: capabilities remove ambient authority and require ported code; path rules fit existing software and rely on rule accuracy.", "Per-handle rights vs per-process rights: per-handle rights are precise and add bookkeeping; per-process rights are simpler and coarse."],
    p: ["Directory handle allows parent traversal through dot-dot segments, escaping the intended subtree.", "A library resolves names against the current directory, ignoring the capabilities passed in."],
    v: "Hold a handle to one directory, then try absolute paths, parent traversal and a symlink pointing outward. Every attempt to leave the subtree must fail with the same error.",
    dep: ["handle-passing", "symlink-and-race-defense"]
  },
  "symlink-and-race-defense": {
    s: "Defenses against links and time-of-check to time-of-use races that let a path appear safe when checked and point elsewhere when used.",
    d: "Attackers replace a checked path with a link to a sensitive file between the check and the open. Defenses: resolve and open in one step with flags that refuse links or stay under a base directory, avoid checking by path at all, keep writable directories off the broker's paths, and disallow hard links to files one does not own. It is hard because every layer that does path checking, including the broker, is vulnerable, and because filesystems differ in how they treat links and mounts.",
    k: ["Open with no-follow and beneath-base flags vs validate the path beforehand: open flags make the check atomic; validation is portable and racy.", "Block links wholesale vs resolve them safely: blocking is simple and breaks software that uses links; safe resolution costs lookups and keeps compatibility."],
    p: ["Broker checks a path under the app's directory then opens it, while the app replaces a component with a link to a protected file.", "Predictable temporary names in a shared directory let an app plant a link first."],
    v: "Run a race harness where one thread swaps a directory component between a file and a link in a loop while the broker opens it. Over many iterations, the broker must never open the link target.",
    dep: ["mount-namespace", "path-based-rules"]
  },
  "network-namespace": {
    s: "A private network stack for the confined process, with its own interfaces, routes and sockets, so it sees only the connectivity the broker gives it.",
    d: "A new network namespace has no interfaces except a loopback. The launcher can leave it that way for a fully offline app, or connect it through a virtual pair to a proxy or filtered bridge. The app cannot see host interfaces, addresses or listening ports. It is hard because it replaces the system's network configuration with one the launcher must build, because name resolution and local services need explicit plumbing, and because a handle to a socket from the host namespace carries its connectivity with it.",
    k: ["No network namespace plus a filter vs a separate namespace: separate stacks hide host details and need plumbing; filters are lighter and expose the host's interfaces.", "Offline by default vs connected by default: offline is safe and breaks any app that wants the network; connected is convenient and leaves exfiltration open."],
    p: ["A socket opened by the broker in the host namespace and passed in lets the app reach anything the host can.", "Loopback inside the namespace is mistaken for the host's loopback, so local service access fails confusingly."],
    v: "Inside the sandbox list interfaces, routes and listening sockets. Only the expected virtual interface and its peer may appear, and a connection to a host-local service must fail.",
    dep: ["user-namespaces", "egress-filtering"]
  },
  "socket-creation-limits": {
    s: "Restricting which socket families, types and protocols the app can create, so raw packet access and exotic protocols are never available.",
    d: "Through the system call filter or access-control hooks the sandbox allows only stream and datagram sockets of the internet and local families, if any. Raw sockets, packet sockets, kernel-interface sockets and obscure protocols are denied, because they often carry kernel flaws or privileged capabilities. Binding to low ports and listening can be limited too. It is hard because many network libraries open unexpected socket types, such as a kernel-interface socket to read interface information, so denials show up as obscure failures.",
    k: ["Deny by family and type at creation vs filter later at connect: creation limits shrink the kernel surface; connect-time filtering sees addresses and leaves more types available.", "Allow listening sockets vs client only: client-only blocks server abuse and breaks peer-to-peer and local helper designs."],
    p: ["Netlink-style sockets stay allowed for convenience and expose kernel interfaces.", "Applications retry silently after a socket creation error, hiding a policy problem until the network is needed."],
    v: "Try to create raw, packet and kernel-interface sockets from the sandbox, and then ordinary stream and datagram sockets. Only the permitted kinds may succeed.",
    dep: ["syscall-filter", "argument-inspection"]
  },
  "egress-filtering": {
    s: "Rules limiting which destinations, ports and protocols the app may reach, applied outside the app's control.",
    d: "Rules can sit in the namespace's own firewall, a filter on the virtual link, or a proxy on the other side. They allow by address, name, port and sometimes by app identity, and log connections. They stop exfiltration to arbitrary servers and lateral movement to local networks, including the host's loopback services and cloud metadata addresses. It is hard because modern services use shared addresses behind content delivery, because address-based rules go stale, and because tunneling through allowed destinations is always possible.",
    k: ["Allow by name vs by address: names express intent and need resolution control; addresses are enforceable at the packet layer and change without notice.", "Default deny with listed destinations vs default allow with blocked ranges: default deny is tight and fragile; blocked ranges are workable and leak to everything else."],
    p: ["Private and link-local address ranges are not blocked, so the app reaches internal services and metadata endpoints.", "Rules filter IPv4 and forget IPv6, leaving a parallel path open."],
    v: "From the sandbox connect to an allowed host, a disallowed public host, a private address, a link-local address, and an IPv6 destination. Only the allowed one should connect, and the denied attempts should be logged.",
    dep: ["network-namespace", "per-app-network-policy"]
  },
  "forced-proxy-routing": {
    s: "Forcing all of the app's network traffic through a mediating proxy that applies policy, logs, and can inspect or substitute connections.",
    d: "The only route out of the app's namespace leads to a broker-side proxy. The proxy sees destination names and can apply allow lists, authenticate the app, enforce rate limits, and terminate connections to unwanted places. It can resolve names itself so the app never needs a resolver. It is hard because many protocols do not proxy cleanly, because inspecting encrypted traffic is deliberately difficult and has its own risks, and because the proxy becomes a high-value, high-load target.",
    k: ["Transparent redirection vs explicit proxy settings: transparent routing cannot be skipped by apps and breaks protocol edge cases; explicit settings are simple and ignorable by hostile code.", "Terminate and inspect encrypted traffic vs pass it through by name: inspection sees content and weakens end-to-end security; pass-through preserves it and sees only destinations."],
    p: ["Applications ignore proxy configuration, and traffic that is not redirected finds a different route.", "The proxy follows redirects or name aliases to destinations the policy never listed."],
    v: "Run an app that ignores proxy settings and opens direct connections. They must either be transparently routed to the proxy or fail, and the proxy log must show every destination.",
    dep: ["network-namespace", "egress-filtering", "name-resolution-mediation"]
  },
  "name-resolution-mediation": {
    s: "Providing name lookups through a controlled resolver, so the app cannot use DNS itself as a channel or discover internal names.",
    d: "The app's resolver configuration points to a broker-side service, which can answer only for permitted names, return controlled results, cache answers, and log queries. It prevents lookups of internal hostnames and blocks name-based exfiltration to attacker-run servers. It also keeps local naming files and service discovery out of the sandbox. It is hard because applications and libraries use varied lookup methods including multicast and direct queries, and because blocking resolution breaks things that fail in unhelpful ways.",
    k: ["Resolve in the broker vs let the app query a filtered resolver: broker resolution gives full control and a heavier component; a filtered resolver is standard and leaves more query surface.", "Allow only listed names vs log and allow: listed names are strict and need maintenance; logging detects abuse after the fact."],
    p: ["Direct queries to an arbitrary address bypass the resolver when egress is not also restricted.", "Names resolved by the broker are cached too long and the app reaches a stale address."],
    v: "From the sandbox resolve a permitted name, an unlisted name, and an internal host name, and attempt a query directly to an outside resolver. Only the first succeeds, and the last fails at the network layer.",
    dep: ["network-namespace", "egress-filtering"]
  },
  "local-socket-restrictions": {
    s: "Controlling which local sockets and abstract names the app may connect to, since many system services listen locally with weak authentication.",
    d: "Local sockets are filesystem objects or names in a shared table, and many services trust any local connection. The sandbox hides filesystem sockets through the mount view, gives a private namespace for abstract names, and checks the connecting identity. Network namespaces separate the abstract name table too. It is hard because local services were designed for a trusted user session, because reaching one through a forwarded handle bypasses the view, and because some are very powerful, such as display servers and container managers.",
    k: ["Isolate with namespaces vs filter connects in the kernel: namespaces hide everything and need rebuilding for needed services; filters allow precise exceptions and miss unlisted names.", "Expose display and audio servers to the app vs mediate them: direct exposure gives performance and a large attack surface; mediation is safer and slower."],
    p: ["The display server socket is exposed and lets any app read other windows or inject input.", "A container-management socket is visible through a bind mount and gives full host control."],
    v: "List the sockets visible and connectable from the sandbox, and from each try to call a privileged operation. Only the brokered endpoints may answer, and the display server must apply isolation between clients.",
    dep: ["network-namespace", "filesystem-view-construction", "service-directory"]
  },
  "per-app-network-policy": {
    s: "Network rules tied to the app's identity, so each app gets its own allowed destinations and can be shown or cut off independently.",
    d: "Policy maps the app identity to a rule set: offline, local network only, specific services, or any destination. The rules attach to the app's namespace, a packet mark or a per-app cgroup, so the network layer can enforce them without knowing about apps. Users and managers can also block background network use. It is hard because identity needs to be known at the packet layer, because helper processes must inherit the policy, and because the person's expectation of an offline app may differ from what shares and updates do.",
    k: ["Enforce by app identity vs by address only: identity rules follow the app across networks and require marking; address rules are universal and cannot say which app.", "Per-app switch for network vs fine rules: a switch is understood by people; fine rules fit security and are rarely visible."],
    p: ["A helper in a different group does not carry the app's marks and goes unfiltered.", "Policy changes apply to new connections only, so existing long-lived connections continue."],
    v: "Block one app's network from settings and confirm new and existing connections of that app and its helpers end, while another app's connections are unaffected.",
    dep: ["egress-filtering", "consent-store", "resource-control-groups"]
  }
});
