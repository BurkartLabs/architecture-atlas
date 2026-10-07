// Details for the init system plate, part 5: PID 1 core, shutdown, cross-cutting concerns.
ATLAS.details("init-system", {
  "pid1-role": {
    s: "The first user-space process, started by the kernel with process id one, which owns the rest of the process tree and is given special treatment by the kernel.",
    d: "The kernel executes one program after boot, from a path that can be overridden on the command line. Everything else descends from it. The kernel treats it specially: it ignores signals for which the process installed no handler, it adopts orphans and a panic follows if it exits. It starts with almost nothing: no standard streams guaranteed, no mounted filesystems except the root and no environment. Its job is to bring the rest up. Hard because every bug in it is a boot failure or a machine-wide hang, so it must be small, careful and self-supervising.",
    k: ["A full manager as process one vs a minimal init that launches the manager: one place knows all state; a bug anywhere in the large program risks the whole machine.", "Doing work in the process vs delegating to helpers: fewer failure points in the core; extra processes and a protocol between them."],
    p: ["Assuming standard streams, environment or a clock exist at start; they may not.", "A bug in a rarely used feature killing process one and panicking the kernel."],
    v: "Boot, read the name of the process with id one and confirm it is the manager; confirm that its parent id is zero and that every other user-space process descends from it in the process tree.",
    dep: ["initramfs-handoff"]
  },
  "zombie-reaping": {
    s: "Collecting the exit status of every child, including orphans adopted from dead parents, so finished processes do not remain in the process table as zombies.",
    d: "A process that has exited stays in the table until its parent reads its status. When a parent dies, the kernel reparents its children to process one, which must wait for them. The manager receives a child-exit signal or watches descriptors and calls wait for each pid, matching known service processes to units and silently discarding the rest. If reaping stops, zombies accumulate until the pid table is full and no process can be created. Hard because exit notifications coalesce, so the reaper must loop until no more children are ready.",
    k: ["Reap every child in a loop vs one per signal: signals coalesce, so a loop avoids missed exits; reaping must never block on a live child.", "Match exits to units vs discard unknown: services get accurate states; orphans are reaped even though no one will ever read their result."],
    p: ["Reaping one child per notification leaves zombies when two exit at the same time.", "A container running an ordinary program as its first process, which never reaps, fills the table with zombies."],
    v: "Start a process that forks a child and exits, leaving an orphan that then exits, and confirm no zombie remains in the process listing afterwards and the status was collected.",
    dep: ["signal-handling", "event-loop", "pid1-role"]
  },
  "signal-handling": {
    s: "Turning signals sent to process one into actions: reload, re-execute, shutdown or reboot requests, child exits and kernel-key combinations, delivered through a safe descriptor-based path.",
    d: "Because the kernel drops unhandled signals for process one, the manager installs handlers or blocks signals and reads them from a descriptor in its event loop. Specific signals map to actions: terminate to the default shutdown, interrupt to reboot request from the console key combination, user signals to reload or log dumps. Handlers do nothing but record the signal, avoiding unsafe calls in handler context. Hard because the interface is a stable external contract that older scripts rely on, and a signal at the wrong moment, during re-execute, must not be lost.",
    k: ["Signals read from a descriptor in the main loop vs run in asynchronous handlers: no unsafe code in handler context and simple ordering; a stuck loop also stops signal handling.", "Signals as a control channel vs only the socket API: compatible with old tools and emergencies without the bus; a second less capable interface."],
    p: ["Doing real work inside a signal handler, which deadlocks when it interrupts an allocation.", "Missing a shutdown signal that arrives during re-execute, because it was blocked and never read."],
    v: "Send the reload signal to process one and confirm the log shows a configuration reload; send the reboot-key signal on a test machine and confirm the shutdown sequence begins.",
    dep: ["event-loop", "pid1-role"]
  },
  "never-exit": {
    s: "The rule that process one must never terminate: errors are handled in place, a failed child is recoverable, and an unrecoverable internal fault freezes or re-executes rather than exits.",
    d: "If process one exits, the kernel panics. So the manager must treat any problem as something to survive: allocation failures are handled, a crash in a helper process is not fatal, and a fatal signal for itself is caught. On a truly unrecoverable error the options are to re-execute itself, freeze so the machine stays up with a console or reboot. Exit only happens deliberately, by handing the machine to the kernel at shutdown. Hard because the safe action when the state is corrupted is unclear and the code paths that run least often are the least tested.",
    k: ["Survive by re-execution or freeze vs crash and panic: the machine stays reachable; the manager may continue with corrupted state.", "Fail-safe handling for every call vs aborting on rare errors: no allocation failure kills the machine; code is full of rarely run error branches."],
    p: ["A failed memory allocation path that calls exit, panicking the kernel on a low-memory machine.", "Freezing silently with no console message, which looks like a hung machine."],
    v: "Trigger a deliberate internal fault in a test build, such as a segmentation fault in process one, and confirm the machine stays up showing a frozen or re-executed manager rather than a kernel panic.",
    dep: ["crash-handling", "state-serialization", "pid1-role"]
  },
  "event-loop": {
    s: "A single-threaded loop that waits on descriptors, timers and signals and dispatches each event to the unit or subsystem it belongs to, never blocking on any one task.",
    d: "The manager registers every source with a kernel readiness interface: control sockets, activation sockets, process-exit notifications, timers for timeouts and watchdogs, the kernel's event streams, signals and the notification socket. The loop wakes, processes ready events in priority order and runs queued jobs. No handler may wait: slow operations are forked out or made asynchronous. One thread avoids locking in the central state. Hard because a single blocking call, such as an unresponsive filesystem, freezes every service's supervision.",
    k: ["One thread with an event loop vs worker threads: no locks over the unit graph and deterministic ordering; one slow handler delays everything.", "Priority between event sources: shutdown and exit handling stay responsive under load; low-priority events can starve."],
    p: ["A handler that reads from a hung network filesystem blocks the loop, so no service can be restarted.", "A flood of events from one noisy socket starving timeouts of other units."],
    v: "Block one filesystem access in a test harness during start of a unit and confirm that other units still start, time out and restart on schedule while the first is pending.",
    dep: ["pid1-role", "kernel-notifications"]
  },
  "early-mounts": {
    s: "Mounting the pseudo-filesystems the rest of the system needs, such as process information, device nodes, kernel interfaces, control groups and shared memory, before any unit is loaded.",
    d: "The kernel provides filesystems that exist only in memory and describe or control itself. If the early ramdisk has not already done it, process one mounts them at fixed locations with specific options, creates the device directory entries and symbolic links expected by programs, sets up the control-group hierarchy and makes the root filesystem shared as propagation requires. Only after this can unit loading work. Hard because ordering is fixed by hand with no manager yet, and some options differ between kernel versions.",
    k: ["Hard-coded early mounts in the manager vs scripts: no dependence on tools that are not yet available; mount options change only with the program.", "Remounting root read-write in the manager vs in the early ramdisk: one place for policy; a failure here gives no recovery shell."],
    p: ["A missing kernel interface mount makes unit loading fail with an obscure error.", "Mounting the control-group hierarchy with options that conflict with another tool."],
    v: "Boot to rescue mode and list mounts; confirm the pseudo-filesystems are present with expected options and that the control-group tree has the manager's top-level slices.",
    dep: ["pid1-role", "initramfs-handoff"]
  },
  "initramfs-handoff": {
    s: "The transition from a temporary in-memory root used to find and mount the real root to the real root's init, which runs as process one with a state left by the early stage.",
    d: "The early ramdisk contains a small manager and tools to load drivers, assemble storage, unlock encrypted volumes and mount the real root. Once the real root is mounted, it switches root and executes the real manager as process one, preserving the process id; a stamp tells it that it is coming from an early stage and which units already ran. Timing information is passed on. Hard because the early stage and the real system must agree on what was done, and a mismatch repeats or skips steps.",
    k: ["Same manager in the early stage and real root vs separate init: shared units and logs, one mental model; the early stage image must be rebuilt for changes.", "Switching root by moving mounts vs reboot: a seamless boot; any process left in the old root keeps it in memory."],
    p: ["A process started in the early stage that is not killed at switch holds the old root and its memory.", "Boot timing figures from the early stage lost, making analysis blame the wrong phase."],
    v: "Boot with the early stage in debug mode and confirm the log shows the switch to the real root, the same process id one before and after and the real root's units starting afterwards.",
    dep: ["pid1-role"]
  },
  "state-serialization": {
    s: "Writing all of the manager's runtime state, including units, jobs, sockets and process ids, to a descriptor so a new program image can read it back after re-execution.",
    d: "On re-execute or when passing state to the next stage, the manager writes a text stream of each unit's state, its pids, open descriptors held for services, timers and pending jobs, and passes the descriptor across the exec. The new image parses it, rebuilds objects and then reloads definitions. Unknown keys are ignored so a downgrade works. This lets the manager upgrade while services keep running. Hard because every new field must be added to both writer and reader and tested across versions.",
    k: ["Text key-value serialization vs binary memory dump: tolerant of added and removed fields; slower and verbose for a large unit count.", "Reload definitions after deserializing vs keeping loaded ones: new files take effect; a failed load after the exec leaves the system running old state with new code."],
    p: ["A new field forgotten in the serializer, which loses that state at every upgrade.", "Descriptors held for services lost, closing sockets that clients are still connected to."],
    v: "Start a service with a held socket and an open client connection, re-execute the manager, and confirm the connection continues, the main pid is unchanged and the unit's state is intact.",
    dep: ["pid1-role", "reload-reexec"]
  },
  "crash-handling": {
    s: "What the manager does if it faults itself: catch the fatal signal, optionally log a stack, then freeze or re-execute so the machine stays up instead of the kernel panicking.",
    d: "Fatal signals such as invalid memory access are caught by a handler that runs on a separate stack. Policy chooses: write a core dump or backtrace, freeze with the process in a loop so the console stays usable, re-execute into a fresh copy or reboot. The crash is rarely recoverable in place since state may be corrupt, so a re-execute from the last serialized state is attempted where available. Hard because the handler itself must not fail, and a frozen manager cannot supervise anything.",
    k: ["Freeze vs re-execute vs reboot: freezing preserves running services and evidence; rebooting recovers fully but loses both.", "Core dump from process one vs a minimal log: full debugging data; dumping needs a writable filesystem and a handler that works during a fault."],
    p: ["A freeze with no message on the console, which is indistinguishable from a hang.", "Re-executing from corrupted state, which crashes again immediately in a loop."],
    v: "On a test build, send a segmentation fault signal to process one and confirm a backtrace in the log, a machine that stays up, and the chosen recovery action actually taken.",
    dep: ["never-exit", "state-serialization", "signal-handling"]
  },
  "child-spawn": {
    s: "The sequence that turns a service definition into a running process: fork, set up namespaces, sandboxing, identity, resource limits, descriptors and environment, then execute.",
    d: "The manager forks a short-lived child. In the child it joins the control group, creates mount and other namespaces, applies filesystem restrictions, drops capabilities, sets the user and group, resource limits, scheduling, working directory, standard streams and environment, installs syscall filters last and executes the target. Any failure is reported to the parent through a pipe with the step that failed. The code between fork and exec must avoid unsafe operations. Hard because the order matters for security, and an error message of just permission denied needs the failing step.",
    k: ["Many steps in the child after fork vs a helper executable: no extra exec before the service; the code must be careful to use only fork-safe calls.", "Reporting the failed step through a pipe vs generic exit code: operators see exactly which setting failed; each step needs its own message."],
    p: ["Installing the syscall filter before it is needed makes the setup steps themselves fail.", "A failing sandbox step reported as a bare exit status with no hint of which option caused it."],
    v: "Start a service with a nonexistent working directory and confirm the failure message names the failed step and path; fix it and confirm the process shows the configured user, limits and environment.",
    dep: ["control-groups", "pid1-role", "event-loop"]
  },
  "kernel-notifications": {
    s: "The kernel event channels the manager subscribes to: mount table changes, device events, control-group emptiness, file changes and timer expirations, which keep its model in step with the machine.",
    d: "The manager watches the mount list for changes made behind its back, a socket carrying device events from the device manager, an event on each control group when it becomes empty, file-change notifications for path units and descriptors for timers. Each notification updates the matching unit's state and may release jobs. It also reads the kernel log. Hard because the sources overlap, events can coalesce or be dropped under load and the manager has to reconcile with a full rescan when it cannot trust the stream.",
    k: ["Event-driven updates vs polling: instant and no idle cost; lost events leave a stale model that only a rescan fixes.", "Mirroring kernel state as units vs reading on demand: dependencies can wait on real events; the manager must keep the mirror consistent."],
    p: ["A missed mount-change event leaving a unit marked inactive while the filesystem is mounted.", "An event storm during hardware probing at boot taking much of the manager's time."],
    v: "Mount and unmount a filesystem manually and confirm the corresponding unit changes state within a second each time, without any request to the manager.",
    dep: ["event-loop", "pid1-role"]
  },
  "shutdown-transaction": {
    s: "A request to reboot, power off or halt is turned into a normal transaction that starts the shutdown target, which conflicts with and so stops all regular units.",
    d: "The control request, signal or key press queues a start job for a shutdown target. That target conflicts with the normal targets and, through default dependencies, with every service, so the transaction contains a stop job for each running unit. Dedicated units for syncing, unmounting and the final action are ordered at the end. A message is broadcast to logged-in users. Because it is an ordinary transaction, it uses the same ordering, timeouts and logging. Hard because it is irreversible once the point of no return is reached, and a stuck unit can delay it.",
    k: ["Shutdown as an ordinary transaction vs a special code path: tested constantly by normal stops; one mistake in a unit's conflicts shows up only at power-off.", "A scheduled shutdown with a countdown vs immediate: users can save work; remote machines may be left waiting on a pending request."],
    p: ["A service that opted out of default dependencies is never stopped and gets killed by the final sweep.", "A cancelled scheduled shutdown that leaves login blocked by the leftover marker."],
    v: "Request a reboot on a test machine with log timestamps and confirm each service gets a stop job, the target is reached, and the final action unit runs last.",
    dep: ["transaction-and-jobs", "conflicts", "default-deps", "targets"]
  },
  "reverse-ordering": {
    s: "Using the same ordering relations in reverse so that a service stops before everything it was started after, and dependents stop before the services they use.",
    d: "If A is ordered before B at start, then B stops before A at shutdown. The stop jobs therefore form the mirror of the start graph, and run in parallel where independent. A database stops after the services that use it, and network storage unmounts after the network is still up. The manager waits for each stop to finish, bounded by timeouts, before releasing the next. Hard because a missing ordering is invisible at boot when everything is up, and shows only as a service killed mid-write when its dependency vanishes first.",
    k: ["Stop order derived from start order vs separately declared: one declaration serves both; some services need a different stop order and must say so.", "Waiting for each stop vs signalling everything at once: data is flushed in the right sequence; shutdown time is the sum of the chain's stop times."],
    p: ["A service using a mount without ordering after it, which unmounts first and corrupts that service's last writes.", "Network filesystems unmounted after the network is down, hanging shutdown."],
    v: "Stop a database and a client that is ordered after it, and confirm the log shows the client fully stopped before the database begins stopping.",
    dep: ["ordering-deps", "shutdown-transaction", "state-machine"]
  },
  "stop-escalation": {
    s: "The sequence for ending a service: run its stop command or send terminate to its group, wait for a timeout, then send kill, and report how it ended.",
    d: "A stop first runs the configured stop command, or sends the terminate signal to the main process or the whole control group. The unit waits up to the stop timeout for the group to empty. If it does not, the manager sends a kill signal to the remaining processes, waits again and then marks the unit failed if processes still survive. Options select which processes receive which signal. Hard because a process stuck in uninterruptible I/O cannot be killed, so shutdown continues with an unkillable process and the final sweep eventually reaches the same wall.",
    k: ["Terminate then kill after a timeout vs kill immediately: services get a chance to flush; every hung service costs its full timeout.", "Signal to the whole group vs only the main process: no leftover helpers; a helper meant to outlive the service is killed too."],
    p: ["A service that traps terminate and ignores it delays every shutdown by the stop timeout.", "A process in uninterruptible I/O on a dead network mount that survives kill and stalls the machine."],
    v: "Stop a test service that ignores terminate, and confirm from the log and timestamps that terminate was sent, kill followed after the configured timeout, and the group emptied.",
    dep: ["start-stop-timeouts", "process-tracking", "reverse-ordering"]
  },
  "final-kill": {
    s: "After all units are stopped, terminating every remaining process so nothing holds files open, and then syncing data to storage before the filesystems are detached.",
    d: "A late step sends terminate to every remaining process except itself and kernel threads and waits briefly, then sends kill to what is left. Exemptions exist for processes that must survive, such as a storage daemon serving the root filesystem, marked by a special name prefix on their argument zero. Then dirty buffers are written to disk. This catches processes that were never part of a unit. Hard because the exemptions need care, and because the sweep is the last chance to fix what ordering missed.",
    k: ["Kill all processes, with an explicit exemption list vs only manager-started ones: nothing blocks unmounts; a storage helper must be marked or it is killed while in use.", "A short wait between terminate and kill vs a long one: fast shutdown; programs finishing a write may be cut off."],
    p: ["Killing a user-space storage daemon that serves the root filesystem, so the final sync hangs.", "Skipping the sync, so recent writes are lost on power-off."],
    v: "Shut down a test machine with a stray unmanaged process holding a file open on a volume, and confirm the process is killed, the volume unmounts cleanly and the next boot needs no filesystem repair.",
    dep: ["stop-escalation", "shutdown-transaction", "zombie-reaping"]
  },
  "unmount-detach": {
    s: "Unmounting every filesystem in reverse mount order, remounting what cannot be unmounted read-only, and detaching loop devices, mapped volumes and RAID sets.",
    d: "A late stage walks the mount table from the deepest mount up, unmounting each, retrying while busy. Mounts that stay busy are remounted read-only so that no further writes occur. Then devices layered below, such as encrypted or software-RAID volumes and loop devices, are detached in dependency order. The loop repeats until nothing changes. Hard because layers can depend on each other cyclically, and because busy mounts due to processes in other namespaces are invisible to the simple process scan.",
    k: ["Retry until no progress vs fail on first busy mount: most machines unmount completely; a stuck mount delays shutdown through every retry.", "Read-only remount fallback vs leaving it writable: a clean filesystem state even when unmount fails; open files may still hold dirty data."],
    p: ["A mount held open in a private mount namespace that the manager does not see, blocking the unmount.", "Detaching an encrypted volume before the filesystem on it is unmounted, causing errors."],
    v: "Stack an encrypted volume with a filesystem on it, shut down, and confirm from the log that unmount precedes detach and the next boot finds the filesystem clean without a check.",
    dep: ["final-kill", "mount-units", "shutdown-pivot"]
  },
  "shutdown-pivot": {
    s: "Switching into a small in-memory root before the last unmounts, so even the original root filesystem can be unmounted, then running the final action from there.",
    d: "Near the end, the manager copies a minimal shutdown program and tools into memory, moves into that root and re-executes there. From inside, it can unmount the real root, which had been in use by the manager itself, and detach the devices below. When nothing is left, it makes the final system call to reboot, power off, halt or jump to a new kernel. If the switch is not possible, it falls back to read-only remount and sync. Hard because the helper program must carry everything needed and the pivot must run when processes still use the old root.",
    k: ["A memory-based shutdown root vs staying in the real root: the root filesystem is cleanly unmounted; extra code and memory are needed and the path is exercised only at shutdown.", "Falling back to read-only remount when the pivot is impossible: shutdown still completes; the root is never fully unmounted."],
    p: ["A shutdown helper missing a tool because the image was built without it, which stops shutdown halfway.", "A process still running from the old root making the pivot fail silently."],
    v: "Shut down a test machine with the pivot enabled and confirm the log shows the switch into the memory root, the unmount of the real root, then the final system call, with a clean filesystem at next boot.",
    dep: ["unmount-detach", "state-serialization", "final-kill"]
  },
  "shutdown-inhibitors": {
    s: "Locks that programs take to delay or block a shutdown, sleep or lid action while they finish important work, with a maximum delay after which the action proceeds.",
    d: "A program holding a lock descriptor tells the login service not to proceed with a power action. The type decides whether it merely delays, giving a few seconds for cleanup, or blocks outright, which the administrator can override. The lock disappears when the descriptor closes, so a crash cannot keep one forever. Users and tools can list who holds what. Hard because it is a policy compromise: blocking locks held by a stuck program can stop a machine from shutting down, so a maximum delay and an override exist.",
    k: ["Lock tied to an open descriptor vs a registered flag: a crashed holder never blocks forever; holders must keep the descriptor open correctly.", "Delay locks with a bounded maximum vs unlimited blocking: shutdown always finishes; a long write may be interrupted."],
    p: ["A media tool taking a blocking lock and hanging, so an unattended machine cannot shut down.", "A user override forcing a shutdown during a firmware update."],
    v: "Take a delay lock from a test program, request a shutdown and confirm the shutdown is held until the program releases it or the maximum delay passes; list locks and confirm the holder is shown.",
    dep: ["session-registration", "shutdown-transaction", "bus-api"]
  },
  "ordering-and-parallelism": {
    s: "How much startup work runs at once and how order is expressed: explicit relations, activation that removes order or fixed sequences, a choice that shapes every unit file.",
    d: "A manager can start in a fixed sequence, in dependency order or all at once with sockets decoupling order. Each step toward parallelism cuts boot time and exposes missing declarations. Ordering also governs shutdown and recovery. The decision touches definitions, targets, activation and readiness: a service that signals readiness truthfully is worth more under parallel startup than one that guesses.",
    k: ["Explicit ordering relations vs numbered sequence: graphs allow parallelism and reverse shutdown order; authors must declare relations that numbers once implied.", "Activation to remove ordering vs strict ordering: clients and providers start together; every service must tolerate being started lazily."],
    p: ["A missing ordering rule that only fails on fast hardware, discovered after release.", "Treating boot speed as the goal and sacrificing a predictable order that services needed."],
    v: "Boot the same image repeatedly with randomized start timing and confirm every service reaches active each time; compare the critical chain to the total to confirm independent units overlap.",
    dep: ["ordering-deps", "parallel-startup", "socket-activation"]
  },
  "failure-semantics": {
    s: "What a failure means and how far it travels: whether a failed dependency stops its dependents, restarts, escalates to a reboot or is tolerated and only logged.",
    d: "Every relation, restart policy and limit encodes a view on failure. Strict requirements propagate failure to dependents, weak ones isolate it, restart policies and rate limits decide between recovery and stopping, and failure actions escalate. Conditions that skip silently look like success. The same choices determine whether a machine boots with a missing optional service or stops in emergency mode.",
    k: ["Propagate failure strictly vs tolerate it: broken systems fail visibly and early; small faults take down large functions.", "Recover automatically vs stop and wait: unattended systems self-heal; faults can be hidden or turn into loops that destroy evidence."],
    p: ["A critical failure being silently swallowed by a weak dependency, with the machine looking healthy.", "Automatic recovery masking a slow degradation until it becomes an outage."],
    v: "Inject a failure into an optional and a required unit in turn and confirm the optional case boots with a logged failure and the required case stops its dependents with a clear failure reason.",
    dep: ["requirement-deps", "restart-policies", "failure-actions", "rate-limits"]
  },
  "privilege-and-trust": {
    s: "How much authority the manager, each service and each caller holds: privileged process one, per-service sandboxes, authorization of control requests and the trustworthiness of log metadata.",
    d: "The manager runs with full power and parses input from many sources: definitions, sockets, notification messages and bus calls. Services are sandboxed to the minimum, control requests are authorized by caller identity and log fields from the kernel are separated from fields set by the program. Defaults decide whether safety is opt-in or opt-out for new services.",
    k: ["Sandboxing opt-in vs default: legacy services keep working; most services run with broad access that nobody reviewed.", "Authorizing by kernel-verified identity vs passwords: nothing to steal; trust depends on the local account model."],
    p: ["Assuming the sandbox applies when an option failed to load and was ignored with a warning.", "A privileged helper that trusts input from an unprivileged service."],
    v: "Audit a default service for the options in effect and confirm which restrictions apply; attempt an unauthorized control request as an ordinary user and confirm it is denied and logged.",
    dep: ["capability-bounding", "filesystem-restrictions", "control-protocol", "structured-fields"]
  },
  "compatibility-and-portability": {
    s: "How well the manager works with older script-based services, numbered runlevels and other environments: containers, different kernels and minimal systems.",
    d: "Most deployed software predates declarative units. The manager runs old init scripts through generators or wrappers, maps runlevels to targets, honors conventional signals and a legacy control interface. It also runs inside containers with limited privileges, on kernels lacking some control-group features and in early ramdisks. Each compatibility layer keeps old behavior alive and adds surface that must be supported.",
    k: ["Supporting legacy scripts vs requiring native definitions: existing software works unchanged; scripts lose dependency detail, readiness and sandboxing.", "Graceful degradation on missing kernel features vs hard requirements: runs everywhere; limits are silently not enforced."],
    p: ["A script wrapped as a service whose forking and pid file behavior the manager guesses wrong.", "A sandbox option silently ignored on an older kernel, so protection is absent."],
    v: "Run the same unit set on a container with reduced privileges and on a full machine, and confirm that unsupported options are reported clearly and services still reach active.",
    dep: ["generators", "targets", "service-types", "control-groups"]
  },
  "observability": {
    s: "How the system explains itself: unit state and failure reasons, logs with trusted metadata, timing of the boot, resource accounting and a way to inspect effective configuration.",
    d: "A manager that supervises everything knows why each thing happened. Exposing that knowledge requires consistent state names, result codes, a logging path set up before services, timestamps for analysis, per-service accounting and tools that show merged definitions. Early boot and shutdown, when logging is least available, are the hard cases, and the cost of collecting data is paid by every unit.",
    k: ["Always collecting state and timing vs on request: after-the-fact analysis is possible; every unit pays a small constant overhead.", "Structured logs with trusted fields vs plain text: reliable filtering; tools must understand the format."],
    p: ["Logs from early boot or shutdown missing because the logger was not yet or no longer running.", "Result codes that distinguish nothing, so every failure looks like exited non-zero."],
    v: "Cause a failure in early boot and one in shutdown on a test machine and confirm both are explained by the result codes and log lines available on the next boot, with timestamps.",
    dep: ["status-introspection", "journal-store", "boot-timing-analysis", "state-machine"]
  },
  "state-across-restarts": {
    s: "What survives a service restart, a manager re-execute and a reboot: held descriptors, stored state directories, runtime files, enablement links and which state is deliberately discarded.",
    d: "State lives at several lifetimes. A service restart may keep its sockets and stored descriptors, a re-execute keeps the manager's whole model, a reboot keeps only files on disk such as enablement links, logs, timer stamps and state directories. Private temporary directories and transient units vanish by design. Decisions about each lifetime shape how upgrades, crashes and rollbacks behave.",
    k: ["Keeping descriptors and state across restarts vs a fresh start: no client sees an outage; stale state can carry a fault through the restart.", "State kept on disk in simple files vs a database: visible and copyable with the image; no transactional guarantees across files."],
    p: ["A restart that preserves a corrupt held descriptor, so the new process inherits the bug.", "Assuming runtime changes survive reboot when they were transient."],
    v: "Restart a service holding a socket, re-execute the manager and reboot in turn, and confirm which items persist at each step match the documented lifetime of each.",
    dep: ["state-serialization", "socket-activation", "transient-units", "enable-disable"]
  },
});
