// Details for the init system plate, part 2: dependency graph, targets and activation, supervision.
ATLAS.details("init-system", {
  "requirement-deps": {
    s: "Relations that say one unit needs another: a strong form that fails or stops with its dependency, and weaker forms that pull it in without making failure fatal.",
    d: "Requirement relations come in strengths. The strict form starts the other unit and fails the dependent if it cannot start; a weaker form starts it but tolerates failure; a binding form also stops the dependent when the dependency stops; a reverse form lets a unit declare that something wants it, so a target can pull in plugins without editing the target. These relations only say what to start, never when. The hard part is choosing strength: too strict and one optional failure takes down a service; too weak and it starts without something it needs.",
    k: ["Strict requirement vs weak want: failure of the dependency stops the dependent, which is correct for hard needs; a weak want lets the system limp along but may run broken.", "Dependencies declared by the dependent vs the target: the service file stays self-contained; targets become implicit lists spread across link directories."],
    p: ["Declaring requirement without ordering starts both at once, so the dependent runs before the dependency is ready.", "Using the strict form for an optional helper makes one cosmetic failure stop the main service."],
    v: "Start a service that strictly requires a unit configured to fail and confirm the start is refused; change to the weak form and confirm the service starts while the dependency shows failed.",
    dep: ["unit-types", "transaction-and-jobs"]
  },
  "ordering-deps": {
    s: "Relations that say one unit must start after another is finished, and stop before it, independent of whether either is required.",
    d: "Ordering says before or after and does nothing else: it does not pull a unit in. When both units are in a transaction, the manager waits for the earlier one to reach its started state, which is defined by its start type, before starting the later one, and reverses the order at stop. Keeping ordering separate from requirement lets a unit say it must follow the network if the network is present, without forcing the network on. The difficulty is correctness: omitted ordering is the most common cause of intermittent boot failures that appear only under parallel startup.",
    k: ["Ordering separate from requirement: a unit can wait for something optional; two declarations are needed for the usual both-needed-and-first case.", "Ordering on named targets vs individual services: robust against renamed services; relies on targets being reached at the right moment."],
    p: ["Ordering after a unit that was never started in this transaction has no effect, and the author thinks it waited.", "Reaching started state is not readiness for a forking service, so ordering silently relies on timing."],
    v: "Make unit B ordered after unit A, start both with a slow A, and confirm from timestamps that B begins only after A reaches active; stop both and confirm B stops first.",
    dep: ["unit-types", "readiness-notification", "transaction-and-jobs"]
  },
  "conflicts": {
    s: "A relation that makes two units mutually exclusive: starting one stops the other, used for alternate services and for isolating states.",
    d: "When a unit conflicts with another, adding it to a transaction queues a stop job for the other. Conflicts are symmetric in effect even if declared one way. Targets use them so that switching from graphical to rescue stops what the first state ran. Shutdown works partly by making the shutdown target conflict with everything. The risk is cascades: a conflict declared carelessly can stop an unrelated critical service when a new unit is started, and the manager resolves the transaction before anyone sees the surprise.",
    k: ["Automatic stop of the conflicting unit vs refusing to start: switching states is easy; an accidental conflict takes down a running service with no prompt.", "Conflict declared on either unit vs both: less duplicate text; the cause of a stop is harder to find from the affected unit."],
    p: ["Conflicting with a unit that another critical unit requires makes the transaction contradictory and the start fails.", "Declaring a conflict instead of an ordering to avoid races, which stops one of the services entirely."],
    v: "Start two units declared as conflicting and confirm the first is stopped and logged as stopped by conflict; then confirm a transaction that requires both is rejected as contradictory.",
    dep: ["requirement-deps", "transaction-and-jobs"]
  },
  "default-deps": {
    s: "Dependencies the manager adds automatically based on unit type, such as ordering services after the basic system target and before shutdown, which authors can switch off.",
    d: "To keep files short, the manager adds standard relations unless told not to. A service gets an ordering after the basic system and a conflict with shutdown, so it stops when the machine goes down. A socket is ordered before its service, a mount after its device and its parent mount, a timer after the time-sync point. Early boot units that must run before these basics opt out. Hard because the implicit relations are invisible in the file and can create cycles when an early unit forgets to opt out.",
    k: ["Implicit relations by type: correct behavior from short files and consistent shutdown; the real graph is not visible in the file and must be queried.", "A per-unit opt-out vs none: early-boot units can exist at all; every opt-out gives up shutdown or ordering protection, which then must be written by hand."],
    p: ["An early-boot service that keeps default dependencies deadlocks, waiting for a unit that is waiting for it.", "Opting out and forgetting to add a conflict with shutdown leaves the service running into the final kill."],
    v: "Dump the dependency lists of a trivial service and confirm it contains an ordering after the basic target and a conflict with shutdown that its file never mentions; repeat with the opt-out.",
    dep: ["ordering-deps", "conflicts", "unit-types"]
  },
  "transaction-and-jobs": {
    s: "The step that expands a request to start or stop one unit into a consistent set of jobs for all affected units, then queues and runs them in dependency order.",
    d: "A request pulls in everything that unit requires, adds stop jobs for conflicts and merges jobs already queued for the same unit. The transaction is checked for ordering cycles and for contradictory jobs, such as start and stop for one unit, and may drop optional jobs to resolve a problem. Accepted jobs enter a run queue; a job runs when everything it is ordered after has finished. Each job ends with a result delivered to the caller. It is the core of the manager, and hard because it must be correct and fast while the graph changes under it.",
    k: ["Building one merged transaction vs starting dependencies one at a time: conflicts and cycles are found before anything runs; large graphs mean a bigger computation in the single main loop.", "Dropping optional jobs to resolve conflicts vs failing the whole request: the system comes up as far as it can; a missing service is only visible in the logs."],
    p: ["An ordering cycle can make a start request fail or silently drop a job, depending on whether the loop is breakable.", "Jobs for different unit states queue behind a stuck job and appear to hang."],
    v: "Request a target with one failing optional unit and one slow unit, and confirm the job list shows all jobs, the failure is reported while the rest finish, and no job remains queued afterwards.",
    dep: ["requirement-deps", "ordering-deps", "conflicts", "state-machine"]
  },
  "cycle-breaking": {
    s: "Detection of loops in ordering relations and a repair that removes a job from the loop when possible, with a logged warning, instead of failing the whole boot.",
    d: "Because ordering relations are spread across many files, packages and generators, loops appear. When the transaction builder finds one, it looks for a job in the loop that is not required by another unit and deletes it, then retries; if every job is required, the request fails. The deleted unit is named in the log. It is hard because deleting an arbitrary job makes the result depend on traversal order, so the same loop can break differently after an unrelated edit, and the missing unit may be one you needed.",
    k: ["Repair by deleting a job vs failing: the machine boots in spite of a packaging error; behavior is hard to predict and varies between boots.", "Reporting the loop path in the log: authors find the offending edge; the log line is easy to miss in a boot that otherwise looks successful."],
    p: ["A boot that works but silently skips a service because it was removed to break a loop.", "Fixing a loop by deleting an ordering line that was real, then moving the race elsewhere."],
    v: "Create two test units ordered after each other, request one, and confirm the log names the loop and the job removed; then confirm the verification tool reports the same cycle before boot.",
    dep: ["transaction-and-jobs", "ordering-deps", "unit-verification"]
  },
  "parallel-startup": {
    s: "Starting every unit whose ordering predecessors are complete at the same time, so independent services overlap and boot time follows the longest chain rather than the sum.",
    d: "The job queue releases a job the moment its ordering constraints are met, and the manager forks the processes without waiting for unrelated services. Socket activation extends this: consumers and providers can start together because the socket exists before either runs. Total boot time approaches the critical chain. It is hard because it exposes every missing ordering declaration, and because parallel starts compete for the same disk and CPU, so more concurrency can slow each service and give worse latency for the ones the user cares about.",
    k: ["Maximum parallelism vs a fixed sequence: faster boot and fewer fixed delays; races from missing ordering appear intermittently, and load spikes at the start.", "Unbounded concurrency vs a limit on simultaneous starts: simple and fast on big machines; small devices thrash disk and memory during the burst."],
    p: ["Intermittent boot failures that appear only on faster hardware because a missing ordering rule was hidden by sequential timing.", "A start storm of heavy services makes the critical one slower than if it ran alone."],
    v: "Boot with timestamps and confirm that units with no ordering relation have overlapping start times; add an ordering and confirm the later unit starts only after the earlier one is active.",
    dep: ["ordering-deps", "transaction-and-jobs", "socket-activation"]
  },
  "start-conditions": {
    s: "Checks a unit evaluates before starting: conditions silently skip it when false, while assertions make the start fail loudly, based on files, kernel features, hardware or the environment.",
    d: "A unit can require that a path exists, a kernel module or capability is present, a virtualization type is or is not in use, a first-boot flag is set, the machine is on AC power and more. A failed condition skips the unit and counts as success for dependents; a failed assertion marks the unit failed. Conditions let one image run on different machines without per-machine enabling. They are evaluated at start time, not load time, so they reflect the current state. Hard because a skipped unit looks like success.",
    k: ["Silent skipping vs failing: one image adapts to hardware without noise; a mistyped condition makes a service never start, and nothing indicates why.", "Evaluated at each start vs at boot only: current facts are used; the result can differ between runs and surprise debugging."],
    p: ["A path-existence condition that races with the unit creating the path skips the service at boot but not later.", "Dependents proceed as if a skipped service had run."],
    v: "Add a condition on a missing file, start the unit and confirm it reports skipped with the condition named while its dependents proceed; create the file and confirm it starts.",
    dep: ["unit-types", "state-machine"]
  },
  "targets": {
    s: "Named synchronization points that group units into system states such as basic, network up, multi-user and graphical, replacing numbered runlevels while remaining compatible with them.",
    d: "A target has no process; it is reached when everything it pulls in has started. Targets form a graph, so graphical includes multi-user, which includes basic. They are used as ordering anchors, such as the point after which the network is considered up, and as goals to select. Old numbered runlevels map onto targets. Their value is that services order against a stable name instead of against each other. Hard because some targets, such as network up, are ambiguous: they can mean a link exists or that the machine is reachable.",
    k: ["Targets as named milestones vs numbered levels: arbitrarily many states with meaningful names, and parallel starts; more concepts for administrators to learn.", "Pulling units into targets by link directories vs listing them in the target: packages add services without editing the target; membership is scattered."],
    p: ["Ordering after the network target when a service needs an address, not just a link, causes a race at boot.", "Mapping legacy runlevel numbers assumes they mean the same thing as in older systems."],
    v: "Isolate to a smaller target, confirm the services not part of it are stopped and those in it remain, then switch back to the larger one and confirm the stopped services return.",
    dep: ["unit-types", "requirement-deps", "ordering-deps"]
  },
  "default-target": {
    s: "The target the manager aims for at boot, set by a symbolic link, plus the isolate operation that switches a running system to another target by stopping everything outside it.",
    d: "At start the manager queues a start job for the default target, found as a link in the configuration directory or overridden on the kernel command line. Isolate starts a target and stops every unit it does not pull in, which is how switching between graphical and text states works. Unit types can opt out of being stopped by isolation. Hard because isolate is blunt: it stops anything not in the new target, including services a user started by hand.",
    k: ["Default selected by a link vs a config key: the same mechanism as other persistent selection and easy to inspect; changing it needs privileges and care on remote machines.", "Isolate stops everything outside the target vs only adding: guarantees a known state; manually started services are killed unexpectedly."],
    p: ["Setting the default to a target needing hardware absent on a server, which then fails to complete the boot.", "Isolating to a rescue target over a remote session stops the network and the session."],
    v: "Read the default target link, change it to a smaller target, reboot and confirm the system stops there with the expected units active; restore it and confirm the full boot returns.",
    dep: ["targets", "boot-parameters", "transaction-and-jobs"]
  },
  "socket-activation": {
    s: "The manager creates and listens on a service's sockets itself, starts the service on first connection, and passes it the open descriptors, so clients never see the service as down.",
    d: "A socket unit defines endpoints: stream or datagram sockets, local paths, network addresses, fifos or kernel interfaces. The manager binds them early, with the right owner and mode, and queues connections. When a connection arrives, it starts the matching service and hands over the listening descriptor, or one accepted connection per instance. Because the socket exists before the service, ordering between provider and client drops away and a service can restart without losing queued requests. Hard cases are services that need to know the descriptors, and backlog and exhaustion behavior.",
    k: ["Manager owns the socket vs service owns it: clients wait during restarts and start order stops mattering; the service must understand inherited descriptors.", "One service for all connections vs an instance per connection: simple isolation per client; process creation cost on each connection."],
    p: ["A service that crashes on every start under a stream of connections is restarted repeatedly until a rate limit is hit and the socket stops.", "A full backlog during a long start makes clients see refused connections after all."],
    v: "Stop a socket-activated service, connect to its socket from a client, and confirm the connection waits, the service starts, and the client receives a reply without a refused connection.",
    dep: ["fd-passing", "unit-types", "transaction-and-jobs", "parallel-startup"]
  },
  "fd-passing": {
    s: "The convention for handing activated descriptors to a service: a count and a starting number in the environment, with descriptors laid out consecutively from three, plus optional names.",
    d: "On start the manager places the open sockets at consecutive descriptor numbers beginning right after the standard streams and sets variables that give the count and the owning process id, so a stray inherited variable is ignored. Names can label each descriptor so the service tells them apart. Libraries wrap this as a small function. The convention is simple enough for any language. It is hard where the service forks or runs other programs first, because the variables must not leak to children and descriptors must not be closed or duplicated.",
    k: ["Environment variables and fixed numbers vs a protocol over a socket: trivial for services to read; any child process inherits the variables unless the service removes them.", "Named descriptors vs positional: the service can tolerate extra sockets in any order; the names are another thing to keep consistent."],
    p: ["A service that spawns a helper without clearing the variables lets the helper mistake the descriptors for its own.", "Reading the process id check as optional makes a service accept someone else's environment."],
    v: "Start a test service with two named sockets and print its environment and open descriptors; confirm the count is two, the owner id matches its own process and descriptors three and four are sockets.",
    dep: ["socket-activation", "child-spawn"]
  },
  "bus-activation": {
    s: "Starting a service when some client sends a message to a well-known name on the message bus, by mapping bus names to units.",
    d: "The bus daemon holds a list of names that can be activated, each mapped to a unit. When a message arrives for a name no one owns, the daemon asks the manager to start that unit and holds the message until the name is registered. This lets desktop and system daemons start on demand. Name ownership and unit state must agree; the service may fail to claim its name, and the bus then times out the caller. Hard because it is a second activation mechanism with its own timeouts and error reporting.",
    k: ["Start on first message vs at boot: idle services cost nothing; the first caller pays startup latency and can time out.", "Mapping bus names to units rather than commands: supervision, limits and logs apply; the bus daemon has to talk to the manager, which couples their startup."],
    p: ["A service that starts but registers a different name leaves the first caller waiting until the bus times out.", "Circular activation between the bus daemon and a service it depends on deadlocks early boot."],
    v: "Stop an on-demand service, send a bus call to its well-known name, and confirm the unit starts, owns the name and the reply returns within the timeout.",
    dep: ["bus-api", "transaction-and-jobs", "readiness-notification"]
  },
  "path-activation": {
    s: "Starting a unit when a file or directory appears, changes or becomes non-empty, watched through kernel file-event notifications.",
    d: "A path unit watches for existence, any change, writes closed or a non-empty directory, and starts a named unit when the condition holds. A spool processor is the classic example. The manager registers watches with the kernel and rechecks when events arrive. It must handle the path appearing before the watch is set, so it checks state first. It is hard because event notification is not a queue of reasons: bursts coalesce, and if the activated unit finishes without clearing the trigger the path unit fires again immediately.",
    k: ["Kernel file events vs polling: immediate and cheap when idle; events can be missed on some filesystems, such as network ones, so the trigger is not guaranteed.", "Start the unit on condition vs on each event: simple semantics; the handler must drain the whole directory because several changes merge into one start."],
    p: ["A handler that does not remove the triggering file is restarted in a tight loop until the start rate limit trips.", "Watching a path on a network filesystem never fires for changes made by other machines."],
    v: "Watch a spool directory, drop a file into it while the handler is stopped, and confirm the handler starts, empties the directory and returns to inactive with the path unit still waiting.",
    dep: ["unit-types", "kernel-notifications", "rate-limits"]
  },
  "idle-exit": {
    s: "A service pattern in which an activated daemon exits after a period without work and is started again by the next request on its still-open socket.",
    d: "Because the manager keeps the socket open, a service may exit when idle without clients noticing: the next connection starts it again. This frees memory on small machines and allows on-demand services for rarely used features. The service tracks its own idle time, since only it knows when work finished, and must handle the race in which a connection arrives as it exits. It is hard because the exit must leave no queued connection unread, and a service with slow start can make the first request after idle noticeably slower.",
    k: ["Exit when idle vs stay resident: memory is freed and the process count falls; first-request latency returns after every idle period.", "Idle detection inside the service vs by the manager: the service knows when real work stopped; each service must implement it correctly."],
    p: ["A service that exits while a connection is being accepted drops it, causing a rare client error.", "An idle timeout shorter than the service's own start time causes a start and exit loop under light traffic."],
    v: "Send one request to an idle-exit service, wait past the timeout and confirm the process is gone while the socket is still listening; send another request and confirm it is answered by a new process.",
    dep: ["socket-activation", "state-machine"]
  },
  "state-machine": {
    s: "The defined set of states each unit moves through, from inactive through activating, active, deactivating and failed, with a specific sub-state for each unit type.",
    d: "Every unit has a coarse active state and a type-specific sub-state, such as start-pre, running, reload or stop-sigterm for a service. Transitions are driven by process exits, timers and job requests, and each transition notifies dependents, which may then be released or stopped. Failed is sticky until reset, so a failure can be inspected. The machine handles overlapping events, such as an exit during a stop. It is the central abstraction, and hard because every combination of event and sub-state must have a defined result.",
    k: ["Coarse state plus sub-state vs a single flat state: dependents see a simple model while operators see detail; two levels must be kept consistent.", "Failed as a sticky state until reset: failures are not lost; stale failed units clutter the list and can block dependents until cleared."],
    p: ["Assuming a unit that is activating is available; callers must wait for active before using the service.", "Failed units left uncleared keep dependents stuck, because the failed state persists across restarts."],
    v: "Kill a service's main process and watch the state transitions, from running through deactivating to failed with the exit status shown; reset it and confirm it returns to inactive and can start.",
    dep: ["process-tracking", "unit-types"]
  },
  "service-types": {
    s: "How the manager decides a service has started: it runs in the foreground, forks and exits, signals readiness, takes a bus name, or is a one-shot task whose exit means done.",
    d: "The type tells the manager when to consider the service started and which process to follow. A simple service is started the moment it is forked; a forking one is started when the parent exits and the child becomes the main process; a notifying one is started when it sends a ready message; a bus one when its name appears; a one-shot when the command exits, with an option to remain active afterwards. Choosing wrongly makes ordering start too early or the service be killed. The notifying type is the most accurate.",
    k: ["Readiness by notification vs by fork or timing: dependents wait for a true signal; the program must be changed to send it.", "One-shot with remain-after-exit: setup tasks appear as active state for dependents; restarting them means an explicit stop first."],
    p: ["Declaring forking for a program that does not write a pid file makes the manager lose the real main process.", "A one-shot task without remain-after-exit becomes inactive and dependents treat it as not done."],
    v: "Define the same program under simple and notifying types, start a dependent of each, and confirm from timestamps that the dependent of the notifying one waits for the ready message while the other does not.",
    dep: ["service-definition", "readiness-notification", "process-tracking"]
  },
  "process-tracking": {
    s: "Following every process a service creates by keeping them in the service's control group, so none can escape supervision by forking or daemonizing.",
    d: "Each service gets a control group; the kernel puts every descendant into it and the manager can list, signal and count them without relying on parent-child links or pid files. When the last process leaves the group, the manager is notified and can mark the service finished. Stop signals can be sent to the whole group. The main process is identified separately and is the one whose exit drives restart. Hard because a service can create processes in other groups if allowed, and because kill-all semantics may take out helpers that were supposed to survive.",
    k: ["Control-group membership vs parent links or pid files: double-forking cannot escape; processes can only be moved by a privileged caller.", "Kill the whole group vs only the main process: no leftover children after stop; a deliberately detached helper is killed too."],
    p: ["A service that intentionally leaves a child running is killed with it unless the kill mode says otherwise.", "Without group tracking, a stale pid file points at an unrelated process, which then gets signaled."],
    v: "Start a service that double-forks a background child, stop it, and confirm the child is gone from the process list too; then repeat with a kill mode of main-only and confirm the child survives.",
    dep: ["control-groups", "kernel-notifications"]
  },
  "readiness-notification": {
    s: "A small message, sent over a datagram socket the manager provides, that tells it a service has finished starting, is reloading, is stopping or has a status string.",
    d: "The manager passes a socket path in the environment. The service writes lines such as ready, reloading, stopping, a free-text status and its main process id. The manager moves the unit state accordingly and releases dependents. Messages can also carry descriptors to store and a watchdog keepalive. The sender is checked against the unit's control group so another process cannot forge state. It is hard because the message must be sent at exactly the moment the service can accept work, and sending too early defeats the ordering.",
    k: ["A readiness message from the service vs inferring from the port or timeout: dependents wait for real readiness; the program must call it and an old one cannot.", "Access limited to the main process vs to the whole control group: forgery is harder; helper processes cannot report on behalf of the main one."],
    p: ["Signaling ready before the listening socket exists makes dependents connect and fail at boot.", "A service whose notification socket is blocked by a sandbox rule is considered failed after the start timeout."],
    v: "Run a service that sleeps ten seconds then sends ready, with a dependent unit, and confirm the dependent starts only after the message while the state reads activating until then.",
    dep: ["service-types", "process-tracking", "start-stop-timeouts"]
  },
  "restart-policies": {
    s: "Rules for what the manager does when a service's main process exits: never, always, on failure, on abnormal signals or on timeout, with a delay before each restart.",
    d: "On exit the manager inspects the cause: clean exit code, nonzero code, a signal, a core dump or a watchdog timeout. The policy chooses whether to schedule a restart after a delay, with exit codes that count as success listed per unit. A stop requested by an operator never restarts. A restarting unit passes through an auto-restart state visible to dependents. Hard because the policy must separate planned from unplanned exits and avoid turning a crash into a loop that hammers a failing dependency.",
    k: ["Restart always vs only on failure: a daemon recovers from any exit; a service that exits cleanly on purpose is relaunched when it should have stopped.", "A fixed short delay vs growing backoff: quick recovery from a transient fault; a persistent fault restarts rapidly until the rate limit stops it."],
    p: ["Restart-always on a task that finishes normally relaunches it forever.", "Restarting a service that corrupts data on crash repeats the corruption on each cycle."],
    v: "Kill a service with a signal under restart-on-failure and confirm it returns after the configured delay with a new process id; stop it as the operator and confirm it stays down.",
    dep: ["state-machine", "process-tracking", "rate-limits"]
  },
  "rate-limits": {
    s: "A cap on how many times a unit may be started within a time window; exceeding it puts the unit in a failed state and stops automatic restarts until reset.",
    d: "The manager counts start attempts per unit over an interval, by default a handful in ten seconds. When the count is exceeded the next start is refused and the unit is marked failed with a limit-hit result, which blocks both restart policy and manual starts until it is reset or the window passes. It protects the machine from crash loops and from socket-activated services under connection storms. Hard because the numbers suit some services and not others, and because hitting the limit stops the service that was meant to be most resilient.",
    k: ["A start limit that fails the unit vs unlimited restarts: protects CPU and logs from loops; a brief outage can become a permanent one needing manual reset.", "Per-unit limit vs system-wide throttle: tuned to each service's expected rate; no global protection against many units failing at once."],
    p: ["A service that crashes quickly during a dependency outage hits the limit and stays down even after the dependency returns.", "Raising the limit to infinite hides a crash loop that fills the journal."],
    v: "Configure a service that exits immediately with restart always, and confirm it is started a few times, then fails with a start-limit result; reset it and confirm a manual start is accepted.",
    dep: ["restart-policies", "failure-actions"]
  },
  "start-stop-timeouts": {
    s: "Time limits on starting, stopping and running each phase of a service, with a defined escalation when they pass: send terminate, then kill, then mark failed.",
    d: "Every phase has a deadline: a start that has not become active in time is failed, a stop that has not finished sends terminate then, after a second wait, kill. A runtime limit can end a service after a maximum lifetime. Pre and post commands have their own timers. Timeouts turn a hang into a state transition that dependents can react to. Hard because a correct timeout depends on the slowest legitimate case, such as a database replaying a log, and a value that is too short kills a service in the middle of recovery.",
    k: ["A bounded default timeout vs infinite: a hung start cannot block boot forever; slow legitimate recoveries get killed unless tuned.", "Extending the timeout from the service while it reports progress: slow work is tolerated; a service can keep extending forever."],
    p: ["A default start timeout shorter than a database crash recovery kills the database repeatedly during recovery.", "Infinite stop timeout lets one hung daemon block the whole shutdown."],
    v: "Run a service that ignores terminate with a short stop timeout, stop it, and confirm the log shows terminate, then kill after the second timeout, and the unit ends inactive with a timeout result.",
    dep: ["state-machine", "stop-escalation"]
  },
  "watchdog": {
    s: "A deadline the service must meet by sending keepalive messages; if none arrives in the interval, the manager treats it as hung and applies the restart policy.",
    d: "A unit sets a watchdog interval. The service reads it from its environment and sends a keepalive over the notification socket at a fraction of that period, ideally only after checking it can still do useful work. If the deadline passes, the manager sends an abort signal, producing a core dump if enabled, and treats it as a failure for restart. The manager can also feed a hardware watchdog so a hung manager resets the machine. Hard because a keepalive from a separate thread can keep arriving while the real work is stuck.",
    k: ["Keepalive tied to real work vs a timer thread: detects genuine hangs; a thread that always pings detects only a frozen process.", "Software watchdog plus hardware reset: covers a hung manager as well as services; a false trigger reboots the machine."],
    p: ["Sending keepalives from a background thread that never checks the main loop, so a deadlock goes undetected.", "A watchdog interval shorter than a garbage collection or disk stall restarts a healthy service."],
    v: "Start a service that stops sending keepalives after ten seconds and confirm the manager aborts it at the interval, records a watchdog result, writes a dump and restarts it under the policy.",
    dep: ["readiness-notification", "restart-policies", "state-machine"]
  },
  "failure-actions": {
    s: "Escalation when a unit ends in failure or hits its limits: trigger another unit, reboot, power off or crash the machine, instead of leaving it failed.",
    d: "A unit can name an action for the failed and start-limit cases: none, reboot, reboot-force, power off, exit the manager or similar, and can also activate a failure handler unit that sends a notification or collects data. This makes the most critical services fail upward: an appliance reboots if its main service cannot stay up. A success action works the same way for batch jobs. Hard because a reboot action on a persistent fault becomes a boot loop, and the manager must rate-limit that too.",
    k: ["Escalate to a reboot vs leave it failed: unattended devices recover themselves; a persistent fault becomes a reboot loop that loses diagnostics.", "A handler unit vs a built-in action: flexible notification and collection; the handler may itself fail when the system is in trouble."],
    p: ["Reboot-on-failure for a service that fails because of configuration produces an endless reboot cycle.", "A failure handler that depends on the failed service never runs."],
    v: "Configure a service with a failure handler unit that writes a marker file, make the service fail, and confirm the marker appears and the handler's log shows it was triggered once.",
    dep: ["rate-limits", "state-machine", "transaction-and-jobs"]
  },
});
