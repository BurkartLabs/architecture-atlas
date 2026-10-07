// Details for the network switch OS plate, part 3: policy, state database, services, lifecycle.
ATLAS.details("switch-os", {
  "acl-manager": {
    s: "Accepts access-control rules from configuration and features, compiles them into ordered hardware entries and manages where they bind: ports, VLANs or the control plane.",
    d: "Rules match on headers and take actions such as permit, deny, mirror, count or redirect. The manager merges rules from multiple sources, expands ranges and object groups into the entries the chip understands, assigns priorities and installs them in the TCAM through the abstraction layer. It reports per-rule counters. It is hard because expansion can multiply entries, hardware imposes stage and key-width limits, and an update must not leave a gap during which traffic is unfiltered or wrongly blocked.",
    k: ["Make-before-break updates vs in-place rewrite: make-before-break never opens a hole, but needs spare entries, while in-place rewrite saves space and risks a window of wrong behavior.", "Compile in software to the chip's format vs expose rules directly: compiling lets software optimize and merge, while direct exposure is simpler and wastes the limited memory."],
    p: ["A port range expands to many entries and an apparently small rule set exhausts the TCAM.", "Rules apply in different stages on ingress and egress and the order operators expect does not hold."],
    v: "Apply a deny rule for one flow, confirm it drops while others pass, edit the list under line-rate traffic, and confirm no packets of permitted flows are lost during the update.",
    dep: ["acl-tcam","table-resource-manager","switch-abstraction-api","state-database"]
  },
  "qos-policy-manager": {
    s: "Translates quality-of-service configuration into classification maps, marking rules, queue and scheduler settings and per-port buffer profiles in the hardware.",
    d: "Operators define classes by header fields and markings, map them to internal priorities and queues, and choose scheduling weights, shaping and buffer thresholds. The manager validates the whole policy, resolves conflicts between port and global settings, and sends the objects to hardware, rebuilding them when speeds or breakouts change. It is hard because the policy must be consistent from ingress mapping to egress queueing, platforms have different numbers of queues, and a partial update can briefly send traffic to the wrong queue.",
    k: ["Global policy applied to all ports vs per-port policy: global is easy to audit, while per-port allows different link speeds and roles at the cost of many objects that can drift.", "Trust incoming markings vs re-mark at the edge: trusting preserves end-to-end intent, but lets any host claim top priority."],
    p: ["Marking is trusted from hosts and one tenant sends all traffic in the highest class, starving the rest.", "A speed change resets buffer profiles to defaults and a lossless class becomes lossy."],
    v: "Send traffic with each marking, confirm every flow lands in its intended queue by queue counters, then overload the port and confirm delivery proportions match the scheduler weights.",
    dep: ["traffic-classification","queues-and-scheduling","packet-buffer","switch-abstraction-api"]
  },
  "policers-and-rate-limits": {
    s: "Hardware meters that cap the rate of a class of traffic, marking or dropping packets that exceed a committed rate and burst, and reporting how many did.",
    d: "A policer uses token buckets with committed and peak rates, producing colors that later stages can drop, re-mark or queue differently. They attach to ports, flows or classes, and also to control-plane queues. The manager allocates meter resources and translates rates into the chip's rate granularity. It is hard because rate precision varies, bursts defined in bytes interact with packet sizes, and meter banks are scarce and shared with other features.",
    k: ["Single-rate policing vs dual-rate: single-rate is simple, while dual-rate separates guaranteed from excess traffic at the cost of more configuration.", "Drop excess immediately vs mark and drop under congestion: marking preserves unused capacity, but only works if downstream stages honor color."],
    p: ["Burst size set too small for large packets means a conforming flow is dropped.", "A rate rounded down to the chip's granularity gives a limit visibly lower than configured."],
    v: "Offer twice the configured rate and confirm the delivered rate matches the limit within the chip's stated tolerance, with the exceed counter equal to the packets that were discarded.",
    dep: ["switch-abstraction-api","counters-and-drop-reasons","table-resource-manager"]
  },
  "control-plane-policing": {
    s: "Protects the CPU by classifying packets sent to it and limiting each class's rate in hardware, so a flood of one kind cannot starve protocol traffic.",
    d: "Packets that must reach software, such as routing messages, address resolution and management, are classified into groups by protocol and destination. Each group gets its own queue on the CPU port with a rate limit and priority. Protocol traffic gets guaranteed share, while unknown or low-value traffic is limited tightly. It is hard to size: limits too low lose real protocol messages during convergence bursts, and too high expose the CPU to attack, so the numbers need measurement on the actual CPU.",
    k: ["Per-protocol queues vs a single shared queue: per-protocol queues isolate attacks and failures, but use limited CPU-port queues and need maintenance as protocols are added.", "Static policy vs adaptive limits: static limits are predictable, while adaptive ones fit varying load and are harder to reason about."],
    p: ["Resolution requests share a queue with routing traffic and a scan starves protocol sessions.", "Default limits are tuned for small networks and drop legitimate messages at scale."],
    v: "Flood the switch with each class of CPU-bound traffic in turn at high rate and confirm that established routing sessions stay up, and that per-class drop counters account for the excess.",
    dep: ["cpu-port","policers-and-rate-limits","packet-trap-manager","queues-and-scheduling"]
  },
  "packet-trap-manager": {
    s: "Defines which packets the hardware diverts to the CPU, such as protocol messages and exceptions, and delivers each to the right software consumer with its metadata.",
    d: "Trap rules in hardware match protocol frames, addresses of the switch, unresolved neighbors and error conditions, and assign each a trap group with its action: trap, copy or drop. The CPU port driver receives the packets with ingress port and reason attached, and a dispatcher hands them to daemons. It is hard because the set of traps defines what software sees and in what order, rules may overlap in the TCAM, and every punted packet costs CPU time.",
    k: ["Trap in hardware by protocol vs inspect all in software: hardware traps keep the CPU quiet, while software inspection is flexible, but easily overwhelmed.", "Copy to CPU vs redirect: a copy lets hardware keep forwarding the packet, while redirect avoids double processing but removes it from the path."],
    p: ["A trap rule shadowed by a higher-priority ACL means a protocol never receives its messages.", "A reason code mapped incorrectly delivers packets to the wrong daemon."],
    v: "Send one packet of each protocol to the switch and confirm each arrives at its daemon with correct ingress port and reason, while transit traffic of the same type is forwarded without reaching the CPU.",
    dep: ["cpu-port","acl-tcam","switch-abstraction-api","control-plane-policing"]
  },
  "port-security": {
    s: "Restricts which devices may use a port, by authenticating them or limiting their addresses, and applies per-device policy once they are admitted.",
    d: "Port-based authentication blocks all traffic except authentication frames until an identity server approves the device, then assigns VLAN, ACL or QoS from the result. Address-based security caps the number of learned addresses or allows only listed ones, with violation actions such as drop or shutdown. State per session lives in software with hardware entries for the authorized ones. It is hard because many devices cannot authenticate, needing fallbacks, and server outages must not lock out the whole floor.",
    k: ["Authenticate every device vs allow-list addresses: authentication gives strong identity, but needs client support, while allow-lists work for any device and are easy to spoof.", "Fail closed vs fail open when the server is unreachable: closed protects the network, while open keeps people working and gives up enforcement."],
    p: ["A phone and a PC share one port and the second device is treated as a violation, shutting the port.", "A transient server outage causes mass re-authentication and every client loses connectivity for minutes."],
    v: "Connect an unauthorized device and confirm all its traffic except authentication frames is dropped, then authorize it and confirm the assigned policy appears in hardware and traffic passes.",
    dep: ["mac-learning","acl-manager","port-manager","aaa-and-rbac"]
  },
  "state-database": {
    s: "A shared in-memory key-value store through which all switch processes publish intent and observed state, instead of calling one another directly.",
    d: "Data is organized into databases or tables by purpose: configuration, application-produced state, hardware-bound state and counters. Producers write entries and consumers subscribe to changes. A single server process holds the data in memory with an optional persistent copy. It is the choke point of the design and must handle bursts of writes at route-table scale without slowing protocols. It is hard because every component depends on it, so its availability, memory use and consistency guarantee decisions govern the whole system.",
    k: ["Central in-memory database vs direct process-to-process calls: a central store gives loose coupling, replay and inspection, but a single point of failure and a throughput limit.", "Eventual consistency between tables vs transactions across tables: eventual is fast and simple, while transactions give atomic multi-table updates and are costlier and rarer."],
    p: ["A runaway producer fills the database memory and every process that depends on it stalls.", "Readers assume writes are visible instantly and act on stale data during high load."],
    v: "Write ten thousand entries in a burst and confirm all subscribers receive every update in order, within a bounded delay, and that the dump of the database equals the set written.",
    dep: ["database-schema","pub-sub-notifications","ipc-messaging"]
  },
  "database-schema": {
    s: "The typed definitions of every table and field in the state database, including keys, formats and versioning, shared by all producers and consumers.",
    d: "Schemas name each table, its key and its fields with types, such as address, integer, list or enum. They are written in a definition language and used to generate code for readers and writers, validate input and dump or load data. They also carry version information so old and new components can coexist. It is hard because the schema is a cross-component contract: changing a field means coordinating every producer and consumer, and compatibility across upgrades must be maintained without freezing the design.",
    k: ["Strongly typed schema vs free-form fields: typed schemas catch errors early and make tools reliable, while free-form fields allow rapid experimentation and invite undetected mistakes.", "Append-only schema evolution vs breaking changes with migration: append-only keeps old software working, but accumulates deprecated fields, while migrations clean up at the price of upgrade complexity."],
    p: ["A field's meaning is reused for a different purpose in a later release and old consumers misbehave.", "Two components generate their code from different schema versions and disagree on a layout."],
    v: "Write an entry with the new schema and read it with the previous release's reader, and confirm known fields are decoded correctly and unknown fields ignored without error.",
    dep: []
  },
  "pub-sub-notifications": {
    s: "The mechanism by which consumers register interest in tables or keys and receive ordered change events as producers write them.",
    d: "Subscribers register with a table and optional key pattern, and the database queues each change for them. Delivery may be pushed over sockets or pulled in batches. Consumers apply changes in order and acknowledge progress. Coalescing of rapid updates to the same key reduces load. It is hard because slow subscribers cause queues to grow, ordering must be kept per key but may be relaxed across tables, and a consumer that misses events must be able to resynchronize from a full dump.",
    k: ["Coalesce updates to the same key vs deliver every change: coalescing is efficient and loses intermediate states, while full delivery lets consumers see every transition but is costly at scale.", "Push to subscribers vs pull by subscribers: push gives low latency, while pull gives consumers control over their pace and removes the need for back-pressure at the source."],
    p: ["A slow consumer causes queued events to pile up until memory is exhausted.", "Coalescing hides a create followed by a delete, and a consumer never learns that the entry briefly existed."],
    v: "Subscribe a consumer, pause it while a producer writes many updates, then resume, and confirm it ends in the same final state as the database and that memory use stayed within its cap.",
    dep: ["state-database","ipc-messaging"]
  },
  "orchestration-agents": {
    s: "Processes that watch intent tables and translate each change into abstraction-layer calls, one per feature area, then write the outcome back as state.",
    d: "An agent subscribes to the tables for a feature such as routes, neighbors or ACLs, converts entries into hardware object operations in batches, and records results or errors in a state table. It keeps a mapping from intent to hardware object identifiers and handles retries, dependencies and failures. It is hard because it is where intent meets a finite, failure-prone chip: calls can fail on capacity, order matters, and the agent must stay correct under partial failure and restart.",
    k: ["Batching hardware calls vs one call per change: batching greatly increases update speed, but delays the first change and complicates error attribution.", "Agent per feature vs one monolithic agent: per feature isolates faults and teams, but dependencies between features need explicit ordering."],
    p: ["A failed hardware call is logged but intent stays marked as applied, so the database and chip silently diverge.", "Stale hardware objects are left behind after the agent restarts without recovering its mapping."],
    v: "Write a route entry and confirm the agent programs hardware and sets an applied status, then inject a hardware failure and confirm the entry shows an error with the reason and is retried or reported.",
    dep: ["state-database","pub-sub-notifications","switch-abstraction-api","dependency-ordering"]
  },
  "dependency-ordering": {
    s: "Ensures hardware objects are created before things that reference them and removed after them, even though intent arrives from many independent writers in arbitrary order.",
    d: "A route needs a next hop, which needs a neighbor, which needs an interface. Agents hold entries whose prerequisites do not exist yet and release them when the prerequisite appears, and on removal tear down in reverse. Reference counts prevent deleting a shared object still in use. It is hard because the dependency graph spans agents and processes, events arrive out of order, and a cycle or a missed release leaves entries pending forever with no visible error.",
    k: ["Retry until the prerequisite exists vs explicit dependency tracking: retry is simple but wastes work and has no completion guarantee, while tracking is exact and requires every writer to declare its dependencies.", "Reference counting shared objects vs ownership by creator: counting allows sharing and risks leaks on a missed decrement, while ownership is simple and duplicates objects."],
    p: ["An entry waits for an object that was never created and nothing reports it as stuck.", "An object is deleted while a late-arriving entry still refers to it, causing a hardware error."],
    v: "Deliver a route, then its next hop, then the interface in reverse order, and confirm all three end up programmed with the route applied last, and removal happens in the opposite order with no leftover objects.",
    dep: ["orchestration-agents","hal-object-model"]
  },
  "state-reconciliation": {
    s: "Periodically compares what the database says should be in hardware with what is actually there, and repairs or reports any difference.",
    d: "An audit reads hardware tables through the abstraction layer and diffs them against the intent held in the database, identifying missing, extra and wrong entries. Repairs can be automatic or reported for an operator. The same process runs after a warm restart to adopt existing hardware state without clearing it. It is hard because hardware reads are slow and can disturb forwarding, tables are large, and entries change while the audit runs, so naive comparison produces false differences.",
    k: ["Continuous background audit vs on-demand audit: continuous catches drift soon, but uses CPU and hardware bandwidth, while on-demand is cheap and finds problems later.", "Automatic repair vs report only: automatic repair restores service quickly, but may hide a software defect or fight another writer."],
    p: ["The audit compares against a snapshot that is already stale and reports differences that are only in-flight updates.", "Automatic repair reinstalls an entry that an operator had deliberately removed in hardware during troubleshooting."],
    v: "Delete an entry directly from hardware through a debug tool, run the audit, and confirm it is reported as missing and restored, with a counter and log message recording the repair.",
    dep: ["state-database","switch-abstraction-api","orchestration-agents"]
  },
  "state-persistence-and-replay": {
    s: "Saves selected state to storage or retains it in memory across process restarts so components can recover without waiting for the network to repopulate it.",
    d: "Some tables are written to flash on change or on shutdown, while others live in memory that survives a process restart, and are replayed to subscribers as an initial dump when they reconnect. Replay lets a restarted agent rebuild its internal mapping. Tables are marked as persistent or volatile. It is hard because stale persisted state can be worse than none, schemas change across versions, and flash has finite write endurance.",
    k: ["Persist state for fast recovery vs recompute from protocols: persisted state shortens outages but may be stale or incompatible, while recomputation is always fresh and slower.", "Write-through to flash vs periodic snapshots: write-through loses nothing, but wears the flash, while snapshots reduce wear and lose the latest changes."],
    p: ["After an upgrade, persisted entries in an old format are read as valid and misprogram the chip.", "A frequently updated table is persisted on every change and wears out flash within months."],
    v: "Restart the database process with a known set of entries, and confirm subscribers receive a replay equal to the pre-restart state, and that persistent tables survive a full reboot while volatile ones are cleared.",
    dep: ["state-database","flash-storage","database-schema"]
  },
  "process-supervisor": {
    s: "Starts the control-plane processes in dependency order, watches them, restarts failed ones with back-off, and escalates when a critical service keeps failing.",
    d: "It reads a service graph that states what must start before what and which services are critical. It launches processes, tracks liveness by exit status and heartbeats, restarts with an increasing delay, and takes an action such as reboot after repeated failures of a critical one. It also stops services in order for shutdown or upgrade. It is hard because its decisions have to be right with the box already in trouble: restarting too eagerly causes loops, too slowly extends an outage.",
    k: ["Restart a failed service alone vs restart its dependents: restarting alone is fast, but dependents may hold stale state, while restarting dependents is safe and broader in impact.", "Reboot after repeated critical failure vs stay degraded: reboot clears many faults, but a persistent bug then makes the box loop forever."],
    p: ["A crash loop at full speed consumes CPU and floods the log, hiding the original error.", "A service passes liveness but is deadlocked, and the supervisor never restarts it."],
    v: "Kill each service in turn and confirm it restarts within the stated interval, dependent services respond as designed, and a service killed repeatedly triggers the documented escalation.",
    dep: ["general-purpose-kernel","service-health-restart","ipc-messaging"]
  },
  "service-containers": {
    s: "Packages each control-plane component with its libraries in an isolated container, so it can be upgraded, restarted and resource-limited independently of the base system.",
    d: "Components such as routing daemons, the database, telemetry and management servers run in separate containers sharing the host kernel. A container runtime pulls signed images, creates namespaces and resource limits, and connects them over local sockets and shared directories. Updating one component means replacing its image. It is hard because containers add startup time and memory overhead, must access the kernel network stack and hardware devices selectively, and share fate with the host kernel.",
    k: ["Containers per service vs monolithic image: containers allow independent upgrades and fault isolation, but cost memory and startup time and need careful device and network wiring.", "Pre-installed images vs pulled from a registry: pre-installed ones boot without network, while pulling gives flexibility and creates a boot-time dependency."],
    p: ["A container with host network access and elevated privileges removes the isolation it was meant to provide.", "Image version skew between database and agents leaves them unable to talk to each other after a partial update."],
    v: "Replace one service's image with a new version while the others run, and confirm only that service restarts, its peers reconnect, and forwarding is not disturbed.",
    dep: ["resource-isolation","general-purpose-kernel","image-management","ipc-messaging"]
  },
  "ipc-messaging": {
    s: "The local channels over which processes exchange events, requests and bulk updates, from sockets and shared memory to message queues.",
    d: "Components use local sockets, message buses or shared memory to talk. The state database uses one for subscriptions, others carry requests to daemons or large transfers of routes. Messages have framing, types, size limits and flow control. It is hard because routing-scale data produces bursts, so queues must be bounded with explicit behavior when full, and slow peers must not block fast ones or cause deadlock between components that wait on each other.",
    k: ["Socket-based messaging vs shared memory: sockets are simple, isolated and portable, while shared memory is faster for bulk data and has weaker isolation and harder lifetime rules.", "Bounded queues that drop vs unbounded queues: bounded queues protect memory but need a recovery path for lost messages, while unbounded ones lose nothing until memory runs out."],
    p: ["Two processes each block waiting for the other to read, and both hang indefinitely.", "A message size limit is exceeded by a large batch, and the sender silently truncates it."],
    v: "Send a burst larger than the queue limit to a deliberately slow receiver and confirm the system follows the documented behavior, such as back-pressure or a reported drop, and that the sender stays responsive.",
    dep: ["general-purpose-kernel"]
  },
  "resource-isolation": {
    s: "Caps the CPU, memory, file handles and I/O each service may consume, so one runaway component cannot exhaust the box and take down the others.",
    d: "Kernel control groups and process limits assign shares and ceilings: CPU weights prioritize protocol daemons over management and guest workloads, memory limits kill the offender rather than the supervisor, and I/O limits protect flash. Namespaces restrict visibility of files, processes and network interfaces. It is hard because the right numbers depend on scale and platform, limits that are too tight cause spurious kills, and the kernel's out-of-memory behavior chooses victims in ways that may differ from what operators want.",
    k: ["Hard limits vs soft shares: hard limits guarantee isolation but kill or stall services at the ceiling, while shares allow bursting and give weaker guarantees.", "Prioritize protocols over management under load: protects the network, and makes the box slow to configure in exactly the moments operators need it."],
    p: ["A memory limit sized for a small table kills a routing daemon in a large deployment.", "A guest application without a CPU cap starves protocol timers and sessions drop."],
    v: "Run a memory-hungry guest process and confirm it is terminated at its limit with a logged reason while routing sessions, the database and forwarding remain unaffected.",
    dep: ["general-purpose-kernel"]
  },
  "guest-app-hosting": {
    s: "Runs operator or third-party programs on the switch inside sandboxed containers with controlled access to state, interfaces and the network.",
    d: "Guests run in their own containers with resource limits and a restricted view. They can read selected state through the management interfaces, receive telemetry, or attach to a management or data interface, for custom monitoring, automation and agents. Packaging and signing control what gets installed. It is hard because guests share a small CPU with protocols, must not be able to reach hardware or the database directly, and a misbehaving guest must be stoppable remotely without affecting forwarding.",
    k: ["Access through the public management API vs direct state database access: the API is stable and safe, but limited, while direct access is powerful and ties guests to internals.", "Allow guests by default vs require signing: signing keeps unknown code out, while open hosting enables fast experimentation and expands the attack surface."],
    p: ["A guest is granted access to a data-plane interface and becomes a path around ACLs.", "A guest's logging fills flash and prevents the configuration from being saved."],
    v: "Install a guest that polls an interface counter, confirm it reads through the permitted interface only, and that attempts to reach the state database socket or hardware devices are refused.",
    dep: ["service-containers","resource-isolation","management-api-servers"]
  },
  "service-health-restart": {
    s: "Per-service liveness and readiness checks that decide when a component is healthy and what to do, restart or escalate, when it is not.",
    d: "Each service reports heartbeats or answers probes, and may declare itself ready only after it has loaded configuration and synchronized with the database. The supervisor treats missing heartbeats as failure. Restart policies include back-off, limits and dependencies. Readiness gates other services that wait for it. It is hard to separate slow from dead: during a convergence burst a healthy daemon may miss heartbeats, and a premature kill makes things worse.",
    k: ["Heartbeat from inside the service vs external probe: internal heartbeats show the main loop is running, while external probes verify that it can actually do useful work.", "Fixed timeouts vs adaptive: fixed timeouts are simple and predictable, while adaptive ones follow load and can mask a slow decline."],
    p: ["A deadlocked thread leaves the heartbeat thread running and the failure unnoticed.", "A watchdog timeout sized for an idle box kills the daemon during a legitimate route burst."],
    v: "Suspend a service's main loop without terminating it and confirm it is declared failed within the timeout, restarted, and returns to ready after synchronizing, with the event logged.",
    dep: ["process-supervisor","health-monitoring","ipc-messaging"]
  },
  "image-management": {
    s: "Installs, verifies, stores and selects boot images and their packages, keeps a fallback version and tracks which one is running.",
    d: "An image is a signed bundle containing the base system and service containers. Installation verifies signature and compatibility, writes it to a slot and marks it for next boot. Two or more versions can coexist, and the boot loader chooses based on markers and boot success. Package-level updates replace single components. It is hard because power can fail mid-install, the fallback must always remain bootable, and the box must refuse images that do not match its hardware or schema.",
    k: ["Whole-image replacement vs per-package updates: whole images are consistent and simple to test, but large, while per-package updates are small and risk combinations nobody tested.", "Automatic fallback on failed boot vs manual recovery: fallback restores service with no one present, and can mask a defect that rolls back repeatedly."],
    p: ["Installing a new image overwrites the only known-good copy before the new one is verified.", "A signature check is skipped for local installs and a modified image boots."],
    v: "Install a new image, boot into it, corrupt its startup, and confirm the boot loader falls back to the previous version after the configured number of failures and reports that it did.",
    dep: ["boot-loader","flash-storage"]
  },
  "warm-restart": {
    s: "Restarts the control software while hardware keeps forwarding with its existing tables, then re-adopts that state instead of reprogramming from scratch.",
    d: "Before restart, components save the state they will need and mark tables to be preserved. The control processes stop and start again, while the chip continues forwarding using the entries already in place. On return, agents reconcile their intent with the hardware, update differences and unfreeze changes. Protocols are asked to keep their peers waiting. It is hard because everything the software knew must be recoverable, hardware must not be reset by the driver, and any change made during the gap has to be queued.",
    k: ["Keep hardware tables during the restart vs clear and reprogram: keeping them avoids traffic loss, but needs reconciliation and a driver that survives, while clearing is simple and drops traffic.", "Save state to disk vs rebuild from protocols: saving shortens the gap but can carry stale data, while rebuilding is correct but slow."],
    p: ["The driver reinitializes the chip on startup and wipes the tables that were meant to be preserved.", "A topology change during the restart window is never processed, leaving stale forwarding entries."],
    v: "Warm-restart under line-rate traffic and confirm forwarding of existing flows continues with zero or bounded loss, neighbors stay established, and the reconciliation reports no differences afterward.",
    dep: ["state-persistence-and-replay","state-reconciliation","graceful-restart","asic-driver-and-dma"]
  },
  "fast-reboot": {
    s: "A full restart of the control plane and kernel that skips most hardware initialization and keeps traffic flowing for as long as possible, trading completeness for speed.",
    d: "The box saves selected state, direct kernel-to-kernel restarts into the new kernel and software, and keeps the chip running with its entries while the control plane returns. Data-plane outage is limited to a few seconds, even with a new kernel version. Protocols use graceful restart to stay up. It is hard because the new software must adopt a chip it did not program, firmware and driver versions must be compatible, and any failure falls back to a full reboot with longer outage.",
    k: ["Fast reboot vs warm restart of processes only: fast reboot allows kernel and driver updates, but has a longer gap and more to preserve, while warm restart is shorter and cannot change the kernel.", "Fast reboot vs full cold boot: fast reboot cuts outage to seconds, but skips hardware checks that a cold boot would run."],
    p: ["New software expects a table layout the old software did not create, so adopted state is misread.", "The control plane returns later than neighbor hold timers and sessions drop."],
    v: "Run a fast reboot under steady traffic from a sequence-numbered generator and measure the outage in lost packets, confirm it is within the documented figure and no neighbors reset.",
    dep: ["warm-restart","boot-loader","state-persistence-and-replay","asic-driver-and-dma"]
  },
  "graceful-restart": {
    s: "Protocol extensions that tell peers to keep forwarding on old routes while the switch restarts its control plane, and let the switch do the same for its restarting peers.",
    d: "Before restarting, a daemon advertises a restart time and capability. Peers hold the routes learned from it as stale, keep forwarding, and wait for the session to return and for it to signal that its initial update is complete, then delete what was not refreshed. The same helper role runs on the local box for neighbors. It is hard because it only works when the topology is stable during the window, and a real failure looks the same as a restart until timers expire.",
    k: ["Act as a helper for restarting peers vs treat restart as failure: helping avoids unnecessary route churn, but delays reaction to genuine failures until timers expire.", "Long restart timers vs short: long timers survive slow restarts, and prolong blackholing when the peer is actually dead."],
    p: ["A genuine link failure during a restart window is invisible, and traffic blackholes until stale timers expire.", "Capability is advertised but the forwarding state is actually cleared by the restart, so the promise is false."],
    v: "Restart a routing daemon under traffic and confirm peers keep the routes marked stale, forwarding continues, and the session re-establishes and clears stale marks within the advertised time.",
    dep: ["routing-protocol-daemons","route-manager"]
  },
  "in-service-upgrade": {
    s: "Replaces the running software version with a new one while traffic continues to flow, coordinating state hand-off, protocol hold timers and hardware adoption.",
    d: "The procedure checks compatibility, installs the new image, saves state, stops old services and starts new ones that adopt the hardware tables, using the warm restart mechanisms. Schemas are migrated and protocols stay up with graceful restart. Some designs upgrade one chassis of a pair at a time. It is hard because the new version has to read the old version's saved state and hardware layout, fail safely at every step, and finish before neighbor timers expire.",
    k: ["Hitless in-service upgrade vs scheduled maintenance with redundancy: in-service avoids operator effort and planned outages but needs thorough compatibility tests, while redundancy-based upgrades are simpler and need a spare path.", "Test only adjacent releases vs any pair: adjacent-only limits the test matrix and forces stepping through releases."],
    p: ["An upgrade that cannot read old state aborts halfway and the box is left running neither version cleanly.", "Hold timers shorter than the restart gap cause neighbors to withdraw routes."],
    v: "Upgrade a switch under line-rate traffic with a lab peer, and confirm the lost packet count stays within the documented bound, all sessions remain established, and the new version reports its identifier.",
    dep: ["warm-restart","fast-reboot","image-management","schema-migration","graceful-restart"]
  },
  "schema-migration": {
    s: "Converts saved configuration and persisted state from an older version's format to the new one during upgrade, with validation and a way to go back.",
    d: "Each release declares schema changes and ships conversion steps that rewrite renamed fields, split or merge tables, and add defaults. The migration runs on the saved configuration and on persisted state before the new services start, and fails the upgrade if the result does not validate. Downgrade needs reverse steps or a saved copy. It is hard because migrations must be correct for every older version supported, and a change that looks small can make a once-valid configuration invalid.",
    k: ["Automatic migration at upgrade vs manual conversion by operators: automatic is convenient and hides risk, while manual is explicit and slow at fleet scale.", "Reverse migrations for downgrade vs saved pre-upgrade copy: reverse steps are complex to write, while a saved copy is simple and loses changes made after the upgrade."],
    p: ["A renamed option is dropped by migration and the feature silently turns off after the upgrade.", "Downgrade after changes made in the new version fails because older software cannot read the new configuration."],
    v: "Feed saved configurations from each supported earlier release through migration and confirm each validates, produces the same forwarding behavior in a test, and that a failed case aborts the upgrade with a clear error.",
    dep: ["config-data-models","config-datastore","database-schema"]
  }
});
