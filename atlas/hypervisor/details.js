// Details for the hypervisor plate, part 1: management plane, monitoring and guest tools, lifecycle and migration.
ATLAS.details("hypervisor", {
  "management-api": {
    s: "The network interface through which tools and people create, configure, start, move and delete virtual machines and the resources they use.",
    d: "A request-response interface, usually over HTTP with structured bodies, plus an event stream. Every call names an object (machine, disk, network, host), is authenticated, validated against the object's current state, recorded as a task and handed to the engine. Long operations return a task handle instead of blocking. It is hard because it must stay stable across versions for years while the objects behind it gain fields, and because partial failure across hosts must be visible to callers rather than hidden.",
    k: ["Declarative desired state vs imperative commands: declarative calls let a controller retry and reconcile, but make one-shot actions such as a hard reset awkward to express.", "Asynchronous task handles vs blocking calls: handles survive client disconnects and long migrations, but force every client to poll or subscribe."],
    p: ["A client retries a create after a timeout and gets two machines because the call carried no idempotency key.", "Schema changes break old automation silently when unknown fields are dropped instead of rejected."],
    v: "Create a machine through the API, kill the client mid-call, and confirm the task still completes and exactly one machine exists in the inventory with a task record showing its result.",
    dep: ["task-engine", "access-control", "vm-definition-store"]
  },
  "access-control": {
    s: "Identifies callers and decides which operations on which objects they may perform, from per-machine console rights to cluster-wide administration.",
    d: "Credentials arrive as tokens or certificates and map to a principal; roles bundle permissions; permissions attach to a node in the object tree (cluster, pool, host, machine) and are inherited downward. Every API call and every host-agent call is checked, and every decision that changes state is audited. The hard parts are delegation (letting a tenant manage only their pool), service accounts for automation, and making sure the check also covers paths that bypass the main API, such as direct console access.",
    k: ["Permissions on a hierarchy vs per-object lists: inheritance keeps administration small, but a broad grant high in the tree is easy to forget and hard to audit.", "Short-lived tokens vs long-lived keys: short tokens limit theft, but automation needs a refresh path that is itself a secret to protect."],
    p: ["A console or serial endpoint is checked less strictly than the API and becomes the easiest route to a guest.", "Host-to-host calls trust any caller on the management network, so one compromised host reaches all."],
    v: "Log in as a user with rights on one pool only, attempt to open the console of a machine in another pool, and confirm the call is refused and an audit entry names the user and the object.",
    dep: ["event-audit-log"]
  },
  "inventory-and-placement": {
    s: "Tracks every host, machine, disk and network in the cluster, and decides which host should run a new or recovering machine.",
    d: "The inventory is built from agent reports and the definition store, with a freshness stamp on each record. Placement filters hosts that cannot run the machine (missing CPU features, no access to its storage, wrong network), then ranks the rest by free memory, CPU load, anti-affinity rules and cost of moving. The same engine drives rebalancing. It is hard because data is stale by the time it is used, and because bin-packing with constraints has no clean optimum.",
    k: ["Reserve on decision vs check on arrival: reserving capacity stops two placements picking the same hole, but leaks reservations when the start fails.", "Spread vs pack: spreading reduces blast radius and contention, but packing frees whole hosts for maintenance or power saving."],
    p: ["Placement runs on a stale snapshot and starts several machines on one host that had room for one.", "Anti-affinity is expressed but not rechecked after recovery, so replicas end up together."],
    v: "Start twenty machines at once against a cluster with room for exactly twenty, and confirm none fails for capacity and the memory reservation on each host matches the machines actually running there.",
    dep: ["host-agent", "vm-definition-store", "resource-pools"]
  },
  "vm-definition-store": {
    s: "The durable record of each machine's configuration: processors, memory, devices, disks, networks and boot settings, held independently of whether it is running.",
    d: "A versioned document per machine, kept in a replicated database or on shared storage so any management node can read it. Starting a machine renders the document into the concrete arguments for the device model and the monitor; editing it while running records pending changes applied at the next boot or by hot-plug. The hard parts are keeping the document, the running process and the host-agent's cache consistent, and migrating the schema without breaking old machines.",
    k: ["One document per machine vs normalized tables: a document moves and snapshots atomically, but cross-machine queries need a separate index.", "Applying edits live vs at next boot: live is convenient, yet few devices support it, so the store must track which changes are pending."],
    p: ["The stored configuration drifts from the running process after a live change that never reached the document.", "A schema upgrade writes fields an older host cannot parse, stranding machines during a rolling update."],
    v: "Change a machine's memory size while it runs, confirm the document shows it as pending, reboot the guest, and read the new size from inside the guest.",
    dep: []
  },
  "host-agent": {
    s: "The service on each host that receives management requests and carries them out by driving the local monitor, device models, storage and network.",
    d: "It holds a local copy of the configuration of every machine on its host, starts and supervises device-model processes, mounts storage, configures switch ports and reports state and statistics upward. It must keep working when the central service is unreachable, so running machines are never stopped because management is down. On restart it adopts machines already running instead of restarting them. Hard parts are crash recovery, resource leaks across thousands of start-stop cycles and strict ordering of side effects.",
    k: ["Agent as the supervisor of machines vs a separate process manager: one owner is simpler, but an agent crash then risks orphaning or killing guests.", "Pull reconciliation vs pushed commands: reconciliation recovers from missed messages, but delays response to urgent actions."],
    p: ["After an agent restart it fails to find a running machine and starts a second copy against the same disks.", "A stuck storage mount blocks the agent's single worker and every operation on the host stalls."],
    v: "Restart the agent while machines run and confirm the guests keep running without a pause, the agent reports the same machines afterward, and no second device-model process appears for any of them.",
    dep: ["hypervisor-core", "device-model-process", "block-backends", "virtual-switch"]
  },
  "task-engine": {
    s: "Queues, orders and tracks management operations as tasks with state, progress and results, and serializes those that would conflict.",
    d: "Each request becomes a task with an owner, a target object, a lock set and a state (queued, running, succeeded, failed, canceled). Tasks on the same machine run one at a time; tasks on different machines run in parallel up to a limit. Multi-step operations such as migration are workflows with compensation steps for rollback. The hard parts are cancellation of operations already in flight on a host, and resuming tasks after the engine itself restarts.",
    k: ["Per-object locks vs a global queue: per-object locks allow parallelism, but a lock held by a dead task blocks the object until it is cleared.", "Rollback by compensation vs by forward retry: compensation leaves a known state, but some steps, such as a completed memory copy, cannot be undone cheaply."],
    p: ["A task's lock outlives the task after a crash and the machine can no longer be stopped or edited.", "Retries replay a non-idempotent step and create a second snapshot or disk."],
    v: "Start a migration, restart the management service in the middle, and confirm the task resumes or is marked failed with the machine left running on exactly one host and no lock still held.",
    dep: ["vm-state-machine", "host-agent"]
  },
  "resource-pools": {
    s: "Groups of machines with shared limits and shares for processor, memory, storage and network, used to divide a cluster among tenants or teams.",
    d: "A pool is a tree node carrying reservations (guaranteed minimum), limits (hard cap) and shares (relative weight under contention). Admission control checks the sum of children against the parent before a machine may start. The scheduler, memory manager and I/O throttles read the effective values, so a tenant's pool setting becomes a host-level cgroup-like control. The difficulty is that guarantees must hold across hosts while the pool's machines can live on any of them.",
    k: ["Hard reservations vs shares only: reservations give predictable performance but strand capacity, while shares use it all but give no guarantee.", "Pool limits enforced centrally vs per host: central enforcement is exact, but per-host enforcement is what actually stops a noisy machine in time."],
    p: ["Reservations are admitted against the pool but not the hosts, so a machine starts on a host where its guarantee cannot be met.", "Nested pools with conflicting limits produce effective values nobody can predict."],
    v: "Fill a pool to its limit with busy machines, start another, and confirm admission is refused with the reason, while measured CPU use of the pool stays at or below its cap.",
    dep: ["inventory-and-placement", "fair-share-scheduler", "overcommit-manager"]
  },
  "ha-manager": {
    s: "Detects failed hosts and restarts their machines elsewhere, using fencing to be sure the failed host is no longer running them.",
    d: "Hosts exchange heartbeats over the network and through shared storage. When a host is declared lost, the manager fences it (power off through a management controller, or revoke its storage access), then restarts the affected machines on survivors in priority order. A quorum of managers prevents a partitioned minority from acting. It is hard because a slow host looks identical to a dead one, and restarting a machine that is still alive on another host corrupts its disk.",
    k: ["Fence before restart vs restart on timeout: fencing is slow and needs hardware support, but it is the only way to rule out two copies writing one disk.", "Aggressive vs conservative failure detection: fast detection shortens outages, but flapping networks cause unnecessary restarts."],
    p: ["A network partition makes the manager restart machines that are still running, and both copies write to shared storage.", "Restart storms overload surviving hosts because failover capacity was never reserved."],
    v: "Cut power to one host in a test cluster and confirm that its machines are running on other hosts within the stated recovery time, with the fencing log showing the dead host was fenced first.",
    dep: ["inventory-and-placement", "task-engine", "datastore-locking"]
  },
  "metrics-collector": {
    s: "Samples per-machine and per-host counters (processor time, memory, disk and network rates, exits) and stores them for dashboards, alerts and capacity planning.",
    d: "Counters come from the monitor (run time, steal, exit counts), the device model (bytes and operations per device), the host kernel and the guest agent. A collector samples at fixed intervals, converts cumulative counters to rates, and rolls samples up into coarser buckets for long retention. The host's view of a guest can differ from the guest's own: guest-reported CPU use excludes time the host did not schedule it, so both are needed. Hard parts are cheap sampling at scale and handling counter resets after a migration.",
    k: ["Host-side measurement vs guest-reported: host-side numbers need no guest cooperation and cannot be falsified, but cannot see which guest process is responsible.", "Fine intervals vs long retention: short intervals catch microbursts, but storage grows quickly unless rolled up."],
    p: ["A counter resets when the machine migrates and the rate calculation shows an enormous spike.", "Averages over one-minute buckets hide a ten-second stall that users noticed."],
    v: "Run a known load of fixed disk operations per second inside a guest and confirm the host-side per-device rate matches within a few percent, before and after a live migration.",
    dep: ["host-agent", "steal-time"]
  },
  "guest-agent": {
    s: "A small program inside the guest that talks to the host over a private channel to report state and carry out requests the monitor cannot do from outside.",
    d: "It uses a virtual serial or socket channel not reachable from the guest network. The host can ask it for addresses, file system usage and the logged-in users, to set a password, run a command, freeze file systems before a snapshot, synchronize the clock, or shut down cleanly. It runs with high privilege inside the guest, which is its main risk. It is hard because it must be installed and kept current in guests the operator does not control, and must degrade gracefully when absent.",
    k: ["Rich command set vs minimal reporting: a rich agent automates more, but every command is privileged code reachable from the host side of the channel.", "Agent-assisted shutdown vs hardware power button: the agent gives clean exits, but only works when installed and healthy."],
    p: ["The agent is missing or hung and the platform assumes its silence means the machine is idle.", "A command channel left open to arbitrary commands lets a compromised management node run code in every guest."],
    v: "Ask the host for the guest's IP addresses through the channel and compare them with the addresses reported by the guest's own network tool; then stop the agent and confirm the host shows the channel as down.",
    dep: ["guest-drivers"]
  },
  "guest-drivers": {
    s: "The driver bundle installed in guests that lets them use paravirtual disks, network cards, balloons and clocks instead of slow emulated hardware.",
    d: "Most modern guest kernels include drivers for the common paravirtual device specification; others need a separately supplied package. It also contains the balloon driver, a guest clock source, and sometimes a time-sync service and a frame buffer driver. Installing it changes the device a guest sees, which can change boot device names and network interface names. The hard parts are drivers for old or closed guests, signing requirements, and booting a guest whose disk driver is not yet installed.",
    k: ["Install drivers before switching device types vs after: before is safe but needs a staged procedure, after leaves an unbootable machine if the driver is missing.", "Drivers shipped inside the guest vs a package from the host: in-guest drivers update with the guest, but a package keeps old guests usable."],
    p: ["Changing a disk's bus type to a paravirtual one before the driver is installed gives a guest that cannot find its boot disk.", "A driver package falls behind the host's device version and silently disables new features."],
    v: "Boot a freshly installed guest on emulated devices, install the package, switch to paravirtual devices, reboot, and confirm the guest lists the paravirtual disk and network device and boots without intervention.",
    dep: ["paravirtual-spec"]
  },
  "quiesce-hooks": {
    s: "Steps run inside the guest just before a snapshot or backup so that applications and file systems are in a consistent state on disk.",
    d: "The host asks the guest agent to freeze file systems, and application-specific hooks flush databases or pause writers first. Once the snapshot point is taken, the host asks for a thaw. The freeze must be short, because writes block while it lasts. Without these hooks a snapshot is crash-consistent (as if power was cut); with them it is application-consistent. The difficulty is a freeze that never ends if the thaw message is lost, and applications that cannot be flushed in time.",
    k: ["Application-consistent vs crash-consistent snapshots: consistency makes recovery clean, but the freeze pauses guest I/O and needs an agent.", "Freeze timeout and automatic thaw vs waiting for an explicit thaw: automatic thaw protects the guest, but may release it before the snapshot point is taken."],
    p: ["The thaw is lost after a failed snapshot and the guest's file systems stay frozen until someone notices.", "A database hook takes longer than the freeze timeout and the snapshot captures a half-flushed state."],
    v: "Snapshot a guest running a database under write load, restore the snapshot into a new machine, and confirm the database starts without running crash recovery and passes its own consistency check.",
    dep: ["guest-agent"]
  },
  "event-audit-log": {
    s: "An append-only record of who did what to which object and when, plus significant system events such as machine crashes, migrations and fencing.",
    d: "Management and agent components write structured events with a timestamp, actor, target, result and task id. Events are stored centrally, forwarded to external collectors and exposed through the API with filtering. Operational events (a guest triple-faulted, a disk filled) share the stream with administrative ones. It is hard because clocks differ between hosts, because event volume bursts during failures, and because the log must not be editable by the people it records.",
    k: ["Central write on every event vs local buffer with forwarding: central is simpler and ordered, but a network partition loses events that buffering would keep.", "Structured fields vs free text: structure makes queries and alerts reliable, but forces every component to agree on a schema."],
    p: ["Hosts with skewed clocks produce events that appear to precede their causes.", "An event storm during a failure fills the log disk and the audit trail stops exactly when it matters."],
    v: "Perform a stop, a snapshot and a migration as a named user, and confirm three entries show that user, the machine, the result and the task id, ordered consistently across hosts.",
    dep: ["task-engine"]
  },
  "remote-console": {
    s: "Gives an operator a screen, keyboard and serial view of a running guest through the management network, independent of the guest's own network or software.",
    d: "The device model exposes the virtual display and input device through a remote-framebuffer protocol or a web-based gateway, and exposes the serial port as a stream. A proxy on the management node authenticates the user and relays the stream to the right host with a short-lived ticket. It works when the guest has no network, which makes it the recovery path. It is hard because the stream carries everything the guest displays, so access control and encryption matter.",
    k: ["Proxy through the management node vs connect directly to the host: proxying centralizes authentication and firewall rules, but adds a hop and a single point of load.", "Graphical console only vs serial console too: serial is scriptable and tiny, but only helps guests configured to use it."],
    p: ["A console ticket is reusable or long-lived and leaks through a browser history or log.", "The console connects to the wrong machine after a migration because the proxy cached the old host."],
    v: "Disable the guest's network, open the console from a client elsewhere, type a command on the guest's login prompt, and confirm the output appears; then reuse the ticket and confirm it is rejected.",
    dep: ["virtual-display-input", "access-control"]
  },
  "crash-dump-capture": {
    s: "Preserves the memory and state of a failed guest, or of the hypervisor itself, so the cause can be examined after the machine is gone.",
    d: "For a guest, the host can pause the machine and write its memory and register state to a file when it crashes, hangs, or on request, without cooperation from the guest kernel. For the hypervisor, a reserved memory region and a small dump kernel capture state before reboot. Dumps are large and contain every secret the guest held, so storage and access are controlled. The hard parts are capturing a hung machine consistently and keeping dumps from filling storage.",
    k: ["Host-side dump vs guest-initiated dump: host-side works even when the guest kernel is dead, but gives raw memory that needs matching symbols to read.", "Automatic capture vs on request: automatic never misses a failure, but fills storage and spreads sensitive data."],
    p: ["Automatic dumps of a crash-looping machine fill the datastore and take other machines down with it.", "Dumps are kept in a world-readable location and expose the guest's keys and credentials."],
    v: "Trigger a non-maskable interrupt in a guest, confirm a dump file of the guest's memory size appears, and open it with the guest kernel's debugging tool to read the crashed task list.",
    dep: ["vm-state-machine", "guest-memory-map"]
  },
  "exit-tracing": {
    s: "Records why and how often a guest leaves guest mode, and how long each exit takes, to find where virtualization overhead is spent.",
    d: "Every exit has a reason code (page fault, port access, interrupt, halt). The monitor counts them per virtual processor and can emit timestamped records into a ring buffer for a user-space tool to read. Aggregated, they show whether a workload is bound by emulated device access, interrupt delivery or nested faults. The cost of tracing itself matters, since exits are among the hottest paths. The difficulty is correlating exits with guest activity that the host cannot see.",
    k: ["Always-on counters vs on-demand per-exit records: counters are nearly free and always present, but per-exit records are needed to see latency and ordering.", "Sampling vs full tracing: sampling keeps overhead small, but misses rare slow exits that cause tail latency."],
    p: ["Tracing is enabled on a production host and its overhead is mistaken for a guest performance problem.", "Exit counts are compared across hosts with different hardware assist features, which change what counts as an exit."],
    v: "Run a guest doing a known number of port writes, and confirm the exit counter for port access increases by that number, with a per-exit latency histogram available from the tracing tool.",
    dep: ["exit-handlers", "vm-entry-exit"]
  },
  "vm-state-machine": {
    s: "The defined set of states a machine can be in (stopped, starting, running, paused, migrating, stopping, failed) and the transitions allowed between them.",
    d: "The state is owned by the host agent that runs the machine and mirrored to the management plane. Each operation checks the current state, performs steps, and commits the new one; invalid requests (resuming a stopped machine) are rejected. Transient states cover the time while work is in progress. It is hard because the process state, the recorded state and the guest's own view can disagree, for instance when the guest powers itself off or the device-model process crashes.",
    k: ["Single owner of state on the host vs shared in a database: a single owner avoids races, but a dead host leaves the recorded state unknown.", "Few coarse states vs many fine ones: coarse is easier to reason about, fine states let tools show precisely what is stuck."],
    p: ["The recorded state says running after the device-model process died, so tools offer actions that cannot succeed.", "A transient state is never cleared after a crash and the machine can neither start nor stop."],
    v: "Kill the device-model process of a running machine and confirm the state becomes failed or stopped within a few seconds, with an event recorded, and that a start request is then accepted.",
    dep: ["device-model-process"]
  },
  "vm-creation": {
    s: "Turns a stored definition into a running machine: allocates memory, creates the monitor's virtual-machine object, launches the device model, attaches devices and starts the first processor.",
    d: "Steps run in a fixed order: reserve host memory and processor entries, open disks and check locks, create switch ports, start the device-model process with generated arguments, create the monitor's objects (memory regions, vCPUs), load firmware, and release the vCPUs. Any failure must unwind everything before it. The hard parts are the amount of state that must be torn down on failure and keeping start time low when thousands of machines start together.",
    k: ["Create everything then start vs start incrementally: creating first makes failures clean and early, but costs memory for machines that never run.", "Pre-initialized template vs cold create: a template boots in a fraction of the time, but couples every machine to the template's contents."],
    p: ["A failed start leaves a switch port, a lock or a memory reservation behind, and the next start fails on it.", "Device model arguments are built from untrusted fields without escaping, allowing host command injection."],
    v: "Start a machine, then force each step in turn to fail in a test, and confirm after every failure that no process, lock, port or memory reservation remains and a later start succeeds.",
    dep: ["vm-definition-store", "hypervisor-core", "guest-firmware", "device-model-process"]
  },
  "power-and-reset": {
    s: "The operations that change a machine's power state: start, graceful shutdown, forced stop, reset, suspend and resume, each with a defined effect on guest and devices.",
    d: "Graceful shutdown sends a virtual power-button event through firmware tables or asks the guest agent, then waits for the guest to power off, falling back to a forced stop after a timeout. Reset reinitializes virtual devices and processors without tearing down the machine. Suspend writes state to disk or stops scheduling vCPUs. It is hard because guests may ignore the button, because devices must be reset consistently, and because forced stop risks disk corruption.",
    k: ["Graceful with timeout then force vs force immediately: graceful protects data, but timeouts of minutes hold up automation and maintenance windows.", "Reset of devices only vs recreating the machine: resetting is fast and keeps identifiers, but leaves hidden state in an emulated device that fresh creation would clear."],
    p: ["A shutdown request is ignored by a guest that has no handler and the operation hangs until a human forces it.", "A reset leaves a device model's internal queue state intact, and the guest driver restarts into a hung device."],
    v: "Send a shutdown to a guest with its power handler disabled, confirm the guest stays up until the timeout, that a forced stop then succeeds, and that the disk image passes a consistency check at next boot.",
    dep: ["vm-state-machine", "acpi-tables", "guest-agent"]
  },
  "device-hotplug": {
    s: "Adds or removes processors, memory, disks and network cards while the guest runs, using bus signals that guest drivers handle as real hardware events.",
    d: "For a device, the device model creates it on a hot-pluggable bus slot and raises a notification through the platform tables; the guest scans the bus and loads a driver. Removal needs a request first, so the guest can stop using the device before it vanishes. Memory and processor hot-add work through firmware-described slots. It is hard because removal depends on guest cooperation, because device state must be fully released, and because some guests do not support it at all.",
    k: ["Two-step removal with guest acknowledgement vs surprise removal: two-step is safe, but a guest that never answers keeps the device allocated.", "Hot-plug capable buses by default vs on demand: reserving slots and ranges up front allows later additions, but costs address space and some boot time."],
    p: ["A disk is removed while the guest still has it mounted, causing errors and filesystem damage.", "The bus has no free slot or memory window left for a hot-add, and the operation fails after the guest booted."],
    v: "Attach a disk to a running guest, confirm the guest lists a new block device within seconds, write to it, request removal, and confirm the guest unmounts it and the host releases the backing file.",
    dep: ["virtual-bus-topology", "acpi-tables", "vm-state-machine"]
  },
  "snapshot-manager": {
    s: "Captures a machine's disk state, and optionally its memory and device state, at one instant, and tracks a tree of snapshots that can be reverted to or deleted.",
    d: "A disk-only snapshot freezes the current disk layer and redirects new writes to a fresh overlay; a full snapshot also saves memory and device state so the machine resumes exactly where it was. The manager keeps the tree, reference counts shared layers, and merges layers when a snapshot is deleted. Quiescing the guest gives consistent contents. It is hard because long chains slow reads, deletion requires copying data between layers, and snapshots are not backups, since they share the same storage.",
    k: ["Disk-only vs full snapshots: disk-only is fast and small, but resumes as a crash; full resumes exactly, at the cost of writing all of memory.", "Long-lived snapshot chains vs flattening early: chains make branching cheap, but read latency and the risk of one broken layer grow with their length."],
    p: ["A snapshot kept for months grows until the datastore fills and every machine on it stops.", "Deleting a snapshot triggers a long layer merge that stalls guest I/O at the worst time."],
    v: "Take a snapshot, write a marker file in the guest, revert, and confirm the marker is gone; then delete the snapshot and confirm the chain length returns to its starting value and space is reclaimed.",
    dep: ["cow-overlays", "state-save-restore", "quiesce-hooks", "vm-state-machine"]
  },
  "state-save-restore": {
    s: "Serializes everything about a running machine (vCPU registers, device state, memory contents) to a stream and reconstructs it later, on the same or another host.",
    d: "Each component implements a save and a load function with a versioned schema: vCPU state from the monitor, device registers and queue pointers from the device model, memory page by page. The stream is the shared format for suspend, snapshot and migration. Restoring must verify that the destination offers the same devices and processor features. It is hard because every device must expose all of its state, including state hidden in firmware, and versions must stay compatible across upgrades.",
    k: ["Self-describing versioned stream vs fixed layout: versioning allows migration between releases, but obliges the code to carry old formats for years.", "Save everything vs save only what changed: complete state is simple to reason about, but large and slow for big machines."],
    p: ["A device omits a field from its saved state and the restored guest sees a hung or confused device.", "The destination host has a different processor feature set and the guest crashes on its first use of a missing instruction."],
    v: "Save a guest running a network transfer, restore it, and confirm the transfer continues without a reset, all device registers match before and after, and the guest's clock shows no unexplained jump.",
    dep: ["vcpu-control-state", "device-model-process", "guest-memory-map"]
  },
  "live-migration-controller": {
    s: "Coordinates moving a running machine between hosts: checks compatibility, drives memory transfer, decides when to switch over, and cleans up the source.",
    d: "The controller prepares the destination (a paused, empty machine with identical devices and storage access), starts memory transfer, watches the rate of new dirtied pages, and when the remaining data can be sent within the allowed downtime, pauses the source, sends final state, resumes on the destination and redirects the network. It can abort cleanly at every step before switchover. It is hard because convergence is not guaranteed and because the final switch cannot be rolled back after the destination starts running.",
    k: ["Pre-copy, post-copy or hybrid: pre-copy keeps the source authoritative and aborts safely, while post-copy converges always but a source failure then loses the machine.", "Throttling the guest to force convergence vs allowing long migration: throttling finishes, at the cost of guest performance during migration."],
    p: ["A write-heavy guest never converges and the migration runs for hours until someone cancels it.", "Source and destination both resume after a lost acknowledgement, and two copies write the same disk."],
    v: "Migrate a machine running a continuous ping and disk writes, and confirm the reported downtime is within its limit, no ping is lost beyond that window and the disk check passes on the destination.",
    dep: ["precopy-migration", "postcopy-migration", "migration-transport", "state-save-restore", "task-engine"]
  },
  "precopy-migration": {
    s: "Copies all of guest memory to the destination while the guest runs, then repeatedly resends pages dirtied in the meantime until the remainder is small enough to stop for.",
    d: "The first pass sends every page; later passes use the dirty bitmap to send only pages changed since the previous pass. Zero pages and duplicates are sent as short markers, and data may be compressed. When the dirty set shrinks below what the link can transfer in the permitted downtime, the guest is paused for the last pass. The source holds the only valid copy until then. The hard limit is the guest's write rate versus link bandwidth.",
    k: ["Compression and zero-page elimination vs raw copy: they save bandwidth on idle memory, but cost processor time that competes with the guest.", "Many fast passes vs a few long ones: more passes send fewer redundant pages overall, but give a hot working set more chances to keep changing."],
    p: ["Pages are sent, dirtied and sent again forever because the guest's hot set exceeds link capacity.", "Compression consumes a processor shared with the guest and slows the very workload being moved."],
    v: "Migrate a guest while it dirties memory at a controlled rate, and confirm the per-pass dirty count falls pass to pass and total transferred bytes are close to memory size plus the dirtied amount.",
    dep: ["dirty-page-tracking", "migration-transport"]
  },
  "postcopy-migration": {
    s: "Moves the machine to the destination first and fetches memory pages on demand from the source as the guest touches them, guaranteeing completion.",
    d: "After a short pre-copy phase, the guest is paused, minimal state is sent, and it resumes on the destination with most pages absent. Access to a missing page raises a fault; a fault handler asks the source for the page over a priority channel while a background transfer pushes the rest. Total time is bounded, even for heavy writers. It is hard because the destination now holds the only up-to-date state: a network failure mid-way loses guest memory with no way back.",
    k: ["Post-copy vs pre-copy: post-copy always finishes and moves write-heavy guests, but any failure during it is fatal for the machine.", "On-demand paging plus background push vs on-demand only: background push shortens the slow tail, but competes with demand pages on the same link."],
    p: ["The link drops during post-copy and the machine cannot be recovered from either side.", "A guest thread stalls for the whole round trip on each missing page and tail latency becomes terrible."],
    v: "Migrate a write-heavy guest with post-copy, confirm it resumes on the destination before memory transfer completes, completes within bounded time, and report the count and latency of remote page faults.",
    dep: ["nested-fault-handler", "migration-transport", "guest-memory-map"]
  },
  "dirty-page-tracking": {
    s: "Finds which guest pages were written since the last check, so migration and snapshots copy only what changed.",
    d: "Two mechanisms exist. Write protection: pages are mapped read-only, the first write faults, the page is marked dirty and made writable. Hardware logging: the processor sets dirty bits in the nested page table, or appends written addresses to a buffer, and the monitor harvests them. Both feed a bitmap per memory region, read and cleared by user space. The costs are faults or buffer-full exits and the time to scan a large bitmap. Huge pages make tracking coarse unless split.",
    k: ["Write-protect faults vs hardware dirty logging: faults work everywhere, but slow every first write; hardware logging is cheap, but needs processor support.", "Tracking at huge-page vs small-page granularity: huge pages cut tracking cost, but resend two megabytes for a one-byte change."],
    p: ["A page written through a device's DMA is never marked dirty, and the destination gets stale data.", "The bitmap is cleared before a copy finishes, losing writes that happened between harvest and send."],
    v: "Write a unique value to one known page of an otherwise idle guest, harvest the bitmap, and confirm exactly that page is set; then harvest again and confirm it is clear.",
    dep: ["nested-page-tables", "nested-fault-handler", "huge-page-backing"]
  },
  "migration-transport": {
    s: "The connection and wire format that carry machine state between hosts: framing, encryption, multiple streams, bandwidth limits and optional direct memory transfer.",
    d: "State travels over a stream connection, possibly several in parallel to use more links and processors, and optionally through remote direct memory access to avoid processor copies. The stream is authenticated and encrypted, since it contains all of guest memory. A bandwidth cap protects other traffic; separate channels carry urgent page requests. It is hard because a connection that stalls looks the same as one that is slow, and because encryption of tens of gigabits needs hardware offload.",
    k: ["Encrypt always vs trust the network: encryption protects guest secrets in flight, but cuts throughput unless offloaded.", "Multiple parallel streams vs one: parallelism fills fast links, but breaks ordering assumptions and needs a final synchronization."],
    p: ["A migration network shared with storage traffic saturates and both migration and guest I/O stall.", "An unencrypted migration across a shared network exposes guest memory contents."],
    v: "Capture traffic on the migration link during a transfer, confirm no guest memory pattern appears in plaintext, and confirm the measured rate stays within the configured bandwidth cap.",
    dep: ["uplink-bonding"]
  },
});
