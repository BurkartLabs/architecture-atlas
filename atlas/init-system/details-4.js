// Details for the init system plate, part 4: timers, devices, mounts, sessions.
ATLAS.details("init-system", {
  "timer-units": {
    s: "Units that activate another unit on a schedule or after a delay, replacing a separate scheduled-job daemon so jobs share logging, limits and dependencies with services.",
    d: "A timer unit names the unit to activate and conditions for when: a calendar time, a delay after boot, after the manager started, after the unit last ran or last finished. The activated unit is an ordinary service with all of its sandboxing, resource limits and journal. The timer's own state records the last and next run. Because jobs are units, they can depend on others and fail visibly. Hard because overlapping runs, missed runs during downtime and many timers firing at once each need a policy.",
    k: ["Jobs as units vs entries in a table: logging, limits, ordering and status apply uniformly; each job needs two small files.", "Trigger relative to the previous run vs to the clock: spacing is guaranteed even after long jobs; runs drift away from wall-clock times."],
    p: ["A job that runs longer than its interval is skipped, not overlapped, and nobody notices missed runs.", "Assuming the job runs in the user's environment, which it does not."],
    v: "Create a timer to fire every minute, wait for two firings, and confirm the list of timers shows the last and next trigger and the activated unit's logs show two runs one minute apart.",
    dep: ["unit-types", "calendar-expressions", "transaction-and-jobs"]
  },
  "calendar-expressions": {
    s: "A text syntax for wall-clock schedules, with weekdays, date ranges, lists, steps and shorthand like daily or weekly, and a tool that shows the next occurrences.",
    d: "An expression specifies weekdays, year-month-day and time of day, with wildcards, comma lists, ranges and repeat steps. Shorthand names cover common cases. A time zone can be named. A normalizing tool prints the canonical form and the next several trigger times so the author can check intent before deploying. Hard because of calendar edge cases: daylight-saving gaps and overlaps, months with different lengths, and the difference between local time and universal time for machines that move.",
    k: ["Calendar expression vs fixed field table: readable and one string covers complex schedules; the parser is a larger surface than five numeric fields.", "Local time zone vs universal time: matches human intent such as a morning report; jobs skip or repeat at daylight-saving changes."],
    p: ["A job scheduled in the hour skipped at the spring clock change never runs that day.", "Assuming the expression is evaluated in the user's time zone when the system's is used."],
    v: "Run the normalizing tool on a monthly expression and confirm the next five dates match the intended days, including a short month and a clock-change date.",
    dep: ["timer-units"]
  },
  "persistent-catchup": {
    s: "Storing the last trigger time of a calendar timer on disk, so a job missed because the machine was off runs once shortly after the next boot.",
    d: "When enabled, the manager records the timestamp of each trigger in a file named for the timer. At start, if a scheduled time has passed since that stamp, it fires once immediately rather than waiting for the next slot. This suits laptops and desktops that are asleep at night, where a daily cleanup would otherwise never run. Only one catch-up occurs regardless of how many periods passed. Hard because catch-up bursts on every boot compete with the startup work, and it hides outages from anyone who only checks the schedule.",
    k: ["Run once on catch-up vs skip missed runs: infrequently powered machines still do maintenance; the run happens at a busy moment right after boot.", "State kept on disk per timer vs derived from logs: cheap and reliable; the stamp is lost on a fresh image and the job runs at first boot."],
    p: ["A heavy catch-up job starting at boot slows the machine exactly when the user logs in.", "Several missed periods collapsing into one run when each period should have processed its own data."],
    v: "Enable persistence, power off across a scheduled time, boot and confirm the timer fires once shortly after startup and updates its stamp; boot again and confirm no extra run.",
    dep: ["timer-units", "mount-units"]
  },
  "timer-jitter": {
    s: "Deliberately spreading timer firings across an accuracy window and adding a random delay, so many machines or units do not all trigger at the same instant.",
    d: "By default a timer may fire within a minute of its target so the machine can coalesce wakeups and save power. A random delay setting adds a per-machine offset chosen from a range, with a fixed option that keeps a given machine's offset stable. Both stop thundering herds against shared servers at the top of an hour. Tight accuracy can be requested for work that needs it. Hard because the right window depends on whether the work is latency-sensitive or contended, and randomness makes debugging a schedule harder.",
    k: ["Coalescing wakeups with a wide window vs exact times: saves energy and avoids bursts; jobs run up to a minute late.", "Random delay per boot vs a stable per-machine offset: good spreading either way; a stable value lets operators predict and compare runs."],
    p: ["Fifty thousand machines all contacting one update server at midnight because no delay was set.", "Expecting second-level precision from a timer left at the default accuracy."],
    v: "Set a one-hour random delay on a daily timer across many test machines and confirm the next-run times are spread across that hour rather than identical.",
    dep: ["timer-units", "calendar-expressions"]
  },
  "device-units": {
    s: "Units that represent hardware or kernel devices announced by the device manager, so services can wait for a disk, network interface or other device through ordinary dependencies.",
    d: "The device manager receives kernel events as hardware appears, applies its rules and tags the device; the manager creates a device unit for each tagged node and marks it active. A service or mount can then require or be ordered after it. Removal makes the unit inactive and can stop dependents. Units are created from external events, not definition files, so the set changes constantly. Hard because hardware arrival is not ordered, and a unit that waits for a device that never appears holds boot until its timeout.",
    k: ["Devices modeled as units vs service-level polling: a dependency says what to wait for and the boot is event-driven; a missing device blocks until timeout.", "Device removal stopping dependents: no service runs against missing hardware; a briefly detached device restarts services unexpectedly."],
    p: ["A mount waiting on a disk that never appears delays the boot by the full device timeout.", "Depending on a network interface name that changes between boots or kernels."],
    v: "Attach a removable storage device, list device units and confirm a new one becomes active; run a service that wants it and confirm it starts, then remove the device and confirm the service stops.",
    dep: ["kernel-notifications", "unit-types", "requirement-deps"]
  },
  "mount-units": {
    s: "Units that represent mounted filesystems, created from the mount table or written by hand, ordered after their devices and parent mount points, with options and timeouts.",
    d: "A mount unit gives the source, mount point, type and options. The manager orders it after the device and after mounts of every parent path, and orders services that need a path after the mount that provides it. The unit tracks the actual kernel mount list, so changes made by hand are seen. Network filesystems are ordered after the network. Hard because a failed required mount can block or fail boot, and mounts and unmounts at shutdown have to follow the opposite order or data is lost.",
    k: ["Mounts as units in the shared graph vs a script that mounts all: services order against the mount they need and mounts run in parallel; a bad entry affects the whole transaction.", "Required vs optional by option: a boot fails safely when a critical volume is missing; a nonessential volume should not stop the boot."],
    p: ["A missing network share marked as required drops a server into emergency mode.", "Services started before their data mount, creating files on the underlying directory that are hidden once the mount appears."],
    v: "Add a mount entry for a second volume, reload, start it and confirm the mount unit is active with the right options in the kernel's mount list; unmount by hand and confirm the unit becomes inactive.",
    dep: ["device-units", "generators", "ordering-deps", "kernel-notifications"]
  },
  "automount": {
    s: "A placeholder mount point that triggers the real mount on first access and can unmount again after being idle, so boot does not wait for slow or optional filesystems.",
    d: "An automount unit sets up a special filesystem at the path that intercepts access. The first process that touches it blocks while the manager starts the matching mount unit, then proceeds. After a configured idle period the mount can be removed. This avoids boot delays from network or removable volumes and avoids ordering problems for services that may or may not use them. Hard because the first access has latency and can time out, and programs that scan the filesystem tree can trigger mounts they never wanted.",
    k: ["Mount on demand vs at boot: faster boot and no dependency on slow storage; first access is delayed and may fail at an unexpected time.", "Idle unmount timeout: frees resources and detaches stale network volumes; a program that holds a path open blocks the unmount."],
    p: ["A scanner or indexer walking the tree mounts every automount point and keeps them busy.", "A first access that hangs on an unreachable server blocks the calling process in uninterruptible sleep."],
    v: "Define an automount for a slow volume, boot and confirm the path exists but the mount is inactive; list the directory and confirm the mount becomes active, then wait past idle timeout and confirm it unmounts.",
    dep: ["mount-units", "kernel-notifications"]
  },
  "fsck-integration": {
    s: "Running filesystem consistency checks as units ordered before the mount they protect, driven by the mount table's check flag and a stamp of the last clean unmount.",
    d: "For a filesystem marked for checking, a generated check unit runs before the mount unit and the mount depends on it. A clean flag or journal may allow it to be skipped. Output goes to the console and journal. A failure that cannot be auto-repaired drops the machine to emergency mode for manual repair. Checks are ordered across disks so they run in parallel on different devices. Hard because a check of a large volume can take hours at boot, and the order of root and other volumes matters.",
    k: ["Check before mount vs trust the journal: catches corruption before it spreads; large volumes can delay boot dramatically.", "Automatic repair vs stopping for an operator: unattended recovery of common faults; a repair can discard data an operator would have kept."],
    p: ["An unattended check running for hours on a large volume that looks like a hung boot.", "Skipping checks globally so an unclean shutdown goes unrepaired until it corrupts something."],
    v: "Mark a volume for check, unmount it uncleanly, reboot and confirm the log shows a check unit run and finish before the mount unit starts; confirm a clean unmount skips it.",
    dep: ["mount-units", "emergency-mode", "ordering-deps"]
  },
  "session-registration": {
    s: "A login service that tracks each user session from login to logout, assigns an identifier, groups the session's processes and tells the manager when to start or stop per-user services.",
    d: "At login, the authentication stack registers a session with a small service, which creates a scope unit for its processes and records its type, seat and tty. The service watches for the last process leaving, handles idle and lid events and applies per-user limits. It tells the manager to start the user's manager on first login. Querying sessions lists who is logged in and how. Hard because sessions end in many ways: a crash, a network drop or a forced kill, and cleanup has to run in all of them.",
    k: ["Sessions as scopes in the control-group tree vs tracking by terminal: all processes are accounted and killable together; remote sessions rely on the login program to register.", "Killing user processes at logout vs leaving them: no leaked processes; background jobs the user wanted to continue end."],
    p: ["Background processes killed at logout, surprising users who started a long job.", "Sessions created by a program that bypasses the authentication stack are never registered."],
    v: "Log in remotely, list sessions and confirm one with the user, type and scope; log out and confirm the scope and its processes are gone.",
    dep: ["transient-units", "control-groups", "user-manager"]
  },
  "seats-devices": {
    s: "Grouping hardware, such as a display, keyboard and mouse, into named seats and granting the active session on a seat access to those devices without making it privileged.",
    d: "Device events tag input, graphics and sound devices with a seat. The login service decides which session is active on each seat and, on a switch, revokes the device from the old one and passes access to the new one through file descriptors or access-control entries. This allows a desktop to run without root and prevents a background session from reading the keyboard. Multi-seat setups give each seat its own user. Hard because switching must happen without gaps or races, and some devices cannot be revoked once opened.",
    k: ["Access follows the active session vs permanent group membership: inactive sessions cannot snoop input; display servers need a handoff protocol.", "Passing opened descriptors vs adjusting file permissions: revocation is precise and immediate; programs must request devices through the login service."],
    p: ["A background session still holding a device that could not be revoked and capturing input.", "Display servers that open devices directly fail once permissions no longer allow it."],
    v: "Switch between two sessions on a seat and confirm the inactive one's attempt to read input events is denied while the active one's succeeds, with no stale access afterwards.",
    dep: ["session-registration", "device-units"]
  },
  "user-manager": {
    s: "A separate instance of the service manager, run for each logged-in user with that user's own units, targets and sockets, started and supervised by the system manager.",
    d: "The system manager starts a user manager as a service under the user's identity at first login. It reads user unit files from the user's home and shared locations, has its own default target and its own journal view, and uses a runtime directory and bus for that user. Per-user services, timers and socket activation all work. It can act as a subreaper for the user's processes. Hard because there are two managers with different privileges and sandbox options that do not all apply without privilege.",
    k: ["Per-user instance vs everything in the system manager: users manage their own services without privileges; each logged-in user costs another manager process.", "Unprivileged manager with fewer sandbox options: safe by default; some restrictions need user namespaces or are unavailable."],
    p: ["A sandboxing option copied from a system unit silently fails in the user manager for lack of privilege.", "Expecting user services to start at boot without anyone logged in."],
    v: "Log in, list user units and confirm a user manager is running as that account with its own target; start a user service and confirm its process is owned by the user in a user control group.",
    dep: ["session-registration", "runtime-dir", "pid1-role"]
  },
  "user-linger": {
    s: "A per-user setting that keeps the user's manager and services running after the last logout and starts them at boot, for background services owned by unprivileged accounts.",
    d: "With lingering enabled the login service holds a reference on the user's manager, so it starts at boot without a login and stays up after the final session ends. Without it, the user manager and everything it runs stops when the last session closes. It is how a user runs a long-lived service without a system unit. The setting is a file under a state directory. Hard because it grows resource use for each such account and bypasses the usual expectation that logging out ends a user's activity.",
    k: ["Lingering on vs off: user services run without a session; every lingering account holds memory and processes permanently.", "A state file set by the administrator vs user-controlled: policy stays with the owner of the machine; users must ask for background services."],
    p: ["Forgetting to enable lingering, so a user's service dies when the SSH session closes.", "Leaving lingering on for retired accounts whose services keep running."],
    v: "Enable lingering for a user, reboot with no one logged in, and confirm that user's manager and its enabled service are running; disable it and confirm they stop after the next logout.",
    dep: ["user-manager", "session-registration"]
  },
  "runtime-dir": {
    s: "A per-user temporary directory in memory, created at the first login and removed at the last logout, holding sockets and runtime files with strict ownership and mode.",
    d: "The login service creates a directory for each user on a memory-backed filesystem, owned by that user and mode restricted to them, and sets an environment variable that points at it. Programs place sockets, locks and the user bus there. It is deleted when the user has no more sessions, unless lingering keeps it, and has a size limit. Hard because programs that store state there lose it at logout, and because cleanup while a program still uses it causes confusing failures.",
    k: ["Memory-backed directory removed at the last logout vs a persistent one: stale sockets never survive; programs wanting persistence must use another location.", "A size limit vs unbounded: one user cannot exhaust memory; a program writing large files fails with a full-disk error."],
    p: ["A program that keeps important state in the runtime directory loses it when the last session ends.", "A stale environment variable pointing at a removed directory in a long-lived process."],
    v: "Log in, confirm the runtime directory exists with mode 0700 owned by the user and contains the user bus socket; log out of all sessions and confirm the directory is gone.",
    dep: ["session-registration", "early-mounts"]
  },
});
