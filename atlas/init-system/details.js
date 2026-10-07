// Details for the init system plate, part 1: control API, boot analysis, definitions, configuration layering.
ATLAS.details("init-system", {
  "control-protocol": {
    s: "The local socket and message format through which clients ask the manager to start, stop, reload and describe units, authenticated by the peer credentials the kernel supplies.",
    d: "The manager listens on a privileged local socket and answers requests such as start, stop, list and set-property. Each request carries the caller's user, group and process identity from the kernel, so no passwords are involved, and an authorization layer decides whether that caller may act on that unit. Replies are asynchronous: a job is queued and its completion is signaled later. It is hard because the manager is single-threaded and is the most trusted process, so the interface must stay responsive while it parses input from less trusted callers.",
    k: ["Kernel-supplied peer credentials vs tokens or passwords: nothing to steal or rotate; authorization is only as strong as the local account model.", "Asynchronous job replies vs blocking calls: clients can wait or stream progress; every client must handle completion, failure and timeout events itself."],
    p: ["A client that sends a request and exits before reading the reply leaves a job nobody observes, so failures go unnoticed.", "A malformed or huge message handled in the manager's own loop can stall every other operation."],
    v: "As an unprivileged user, attempt to stop a system service and confirm it is refused with an authorization error, then start a harmless unit as the administrator and confirm a job reply arrives.",
    dep: ["event-loop", "pid1-role"]
  },
  "cli-client": {
    s: "The administrator's command-line tool: a thin front end that turns subcommands into control requests, formats unit state and waits for jobs to finish.",
    d: "The client parses a subcommand such as start, status, enable or show, sends the matching request over the control protocol and prints the result. By default it waits for the queued job to finish and reports failure with a hint at where logs are. Output is formatted for people, with machine-readable property dumps for scripts. It also works offline against a root directory for image building. The difficulty is that it is the face of the system: any ambiguity in its exit codes or wording becomes an operational mistake.",
    k: ["Blocking by default vs fire-and-forget: scripts get a meaningful exit status; a stuck dependency makes the command hang until a timeout.", "Human-formatted output with a separate property interface: pleasant for operators and safe for scripts to parse only if they use the stable form."],
    p: ["Scripts parsing the pretty status text break when wording or column widths change between versions.", "Exit code zero after queueing a job can be read as success even though the service failed moments later."],
    v: "Run start on a service that fails immediately and confirm the command exits non-zero and prints a pointer to its log; run it on a healthy one and confirm exit zero after the service is active.",
    dep: ["control-protocol", "bus-api"]
  },
  "bus-api": {
    s: "A typed object interface on the system message bus that exposes every unit and the manager itself as objects with properties, methods and change signals.",
    d: "Programs such as login managers, desktop tools and orchestrators call the manager through a message bus. Each unit is an object with typed properties, such as active state and main process id, methods to start or stop it and signals when properties change. Introspection is built in, so clients discover the interface at runtime. The hard part is bootstrapping: the bus daemon is itself a service the manager starts, so early boot needs the private control socket, and the bus API only exists once the bus is up.",
    k: ["Rich typed interface vs a minimal text protocol: other programs integrate easily and get change notifications; the interface becomes a compatibility surface that must be versioned carefully.", "Bus access with a private fallback socket: early boot and recovery work without the bus, at the cost of two code paths."],
    p: ["Tools that poll properties rather than subscribe to change signals add steady load to the single-threaded manager.", "Code assuming the bus is available in early boot or rescue mode fails when it is not."],
    v: "Subscribe to property-change signals for one unit, restart it, and confirm signals arrive for each transition with the new main process id; then stop the bus and confirm the private socket still answers.",
    dep: ["control-protocol", "state-machine"]
  },
  "status-introspection": {
    s: "Commands and properties that show a unit's load state, active state, main process, resource use, recent log lines and the dependencies that explain why it did or did not start.",
    d: "Status gathers the unit's states, its definition file and fragments, the process tree from its control group, memory and CPU counters and the last journal entries into one view. Further commands print the dependency tree in either direction and dump every property. The data comes from the manager's in-memory graph, not from the files, so it shows what is loaded, including edits not yet reloaded. It is hard to get right because several different states, such as loaded, active and enabled, mean different things and operators confuse them.",
    k: ["Showing loaded state rather than file contents: reveals what is actually running; operators must notice a stale-definition warning after editing a file.", "Combining process, resource and log data in one view: faster diagnosis, but each piece can fail independently and a partial view looks like a complete one."],
    p: ["Reading enabled as running, or active as healthy, leads to wrong conclusions about a unit that is enabled but failed.", "Editing a file and checking status without reloading shows old behavior and wastes time."],
    v: "Edit a service file without reloading and run status; confirm it reports the definition changed on disk. Reload and confirm the new command line is shown in the property dump.",
    dep: ["state-machine", "process-tracking", "journal-store"]
  },
  "enable-disable": {
    s: "Persistent selection of which units start at boot, implemented as symbolic links that realize each unit's install section, plus preset rules that set defaults for new units.",
    d: "A unit's install section names the targets that should pull it in. Enabling creates links in those targets' wants directories; disabling removes them. Nothing is stored in a database, so the state is visible in the filesystem and survives copying an image. Presets are ordered pattern rules applied when packages are installed or first boot runs, deciding whether a new unit starts enabled. The tricky part is that enabling does not start anything, and the link set can drift from what a package intended.",
    k: ["Symbolic links instead of a registry: state is inspectable and image-friendly; removing a unit file leaves dangling links to clean up.", "Preset policy applied at install or first boot: new units get consistent defaults; later changes to presets do not touch already-installed units."],
    p: ["Assuming enable also starts the service, or that disable also stops it, leaves a running service that returns after reboot.", "A unit enabled by hand and absent from presets is silently reverted by a preset reset."],
    v: "Enable a service, list the target's wants directory and confirm a link exists, reboot and confirm the service is running; disable it and confirm the link is gone while the running instance continues.",
    dep: ["unit-file-format", "targets"]
  },
  "reload-reexec": {
    s: "Two operations that apply changes without rebooting: reload rereads definitions and rebuilds the graph, while re-execute replaces the manager's own program image and keeps its state.",
    d: "Reload rescans definition files, regenerates generated units and rebuilds the dependency graph while leaving running services alone; changed settings apply to the next start or are pushed live where supported. Re-execute serializes the manager's state, executes the new binary in place as the same process and deserializes, which is how the manager itself is upgraded. Both must preserve running state exactly, because services keep running throughout. The difficulty is compatibility: the new image must understand state written by the old one.",
    k: ["Reload does not restart running services: no downtime from an edit; a running service keeps old settings until restarted, which hides drift.", "Re-execute in place vs reboot for a manager upgrade: services keep running; a serialization bug can lose track of processes or sockets."],
    p: ["Upgrading the manager package without re-executing leaves old code running next to new unit files.", "A reload that fails halfway can leave the old graph active while the operator believes the edit applied."],
    v: "Change a service's description, reload, and confirm status shows the new text while the main process id is unchanged; then re-execute and confirm every service and socket is still tracked with the same ids.",
    dep: ["state-serialization", "unit-file-format", "transaction-and-jobs"]
  },
  "boot-timing-analysis": {
    s: "Measurement of when each unit started and finished during boot, with a critical-chain view that shows which sequence of dependencies set the total boot time.",
    d: "The manager timestamps each unit's activation phases and the boot stages from kernel start, early ramdisk and user space. Analysis tools print a ranked list of slow units, the critical chain of ordering dependencies that bounded the boot, and a plot with every unit as a bar. Because ordering is explicit, the chain identifies exactly which waited on which. The hard part is interpretation: a unit that takes long may be waiting for hardware, not working, and shortening a non-critical unit changes nothing.",
    k: ["Time attributed along the critical chain vs by unit duration: points at what actually delays boot; a short unit on the chain can matter more than a long one beside it.", "Always-on timestamping vs optional tracing: costs nothing noticeable and is available after the fact; fine-grained syscall detail needs separate tooling."],
    p: ["Optimizing the slowest unit in the list while it is not on the critical chain gains nothing.", "Comparing boots with different hardware states or cold versus warm caches misleads."],
    v: "Boot, run the critical-chain report and confirm it ends at the default target; disable the first unit in the chain, reboot and confirm total time to that target changes.",
    dep: ["transaction-and-jobs", "ordering-deps", "state-machine"]
  },
  "unit-verification": {
    s: "A static checker that loads definitions and reports syntax errors, unknown settings, missing executables, unsafe ordering and dependency cycles before they cause a failed boot.",
    d: "The verifier loads units the way the manager would, without starting them, and reports unknown keys, bad values, referenced units that do not exist, commands that are not found or not executable, and ordering cycles. It can check one file or the whole default target. It exists because a typo in a rarely used unit otherwise surfaces only at the worst time, during shutdown or recovery. The difficulty is that some correctness depends on runtime facts the checker cannot see, such as paths created by earlier units.",
    k: ["Static checking vs dry-run execution: safe on any machine and fast; runtime-created paths or generated units can produce false warnings.", "Warnings that do not block loading: old definitions keep working; real mistakes can stay unnoticed because nothing fails loudly."],
    p: ["Reading unknown-setting warnings as noise lets a misspelled restriction silently disable a security option.", "Verifying on a development machine with a different unit set misses missing dependencies."],
    v: "Misspell a sandboxing option and reference a missing executable in a copy of a unit, run the verifier and confirm both are reported with file and line; fix them and confirm clean output.",
    dep: ["unit-file-format", "ordering-deps", "cycle-breaking"]
  },
  "rescue-mode": {
    s: "A reduced boot target that brings up the base system and a root shell on the console, with most services and networking left off, for repairing a machine that otherwise boots badly.",
    d: "Rescue mode isolates to a small target: local filesystems are mounted, basic services run and a single-user login prompt appears, usually after asking for the administrator credential. Other services do not start, so a broken one cannot interfere. It is selected from the boot loader or by command. It is useful only if the base system works: a damaged root filesystem or missing authentication data defeats it, which is why a deeper emergency mode also exists.",
    k: ["Mounting local filesystems in rescue mode: repairs can use the full tree; a failed mount may make the mode itself fail.", "Requiring the administrator credential: protects a stolen machine; locks out a legitimate owner who forgot it, who then needs the kernel command-line route."],
    p: ["Assuming the network is up in rescue mode and trying to fetch tools with no connection.", "Services left running from an earlier target keep files open and block a filesystem check."],
    v: "Boot with the rescue option, confirm a shell prompt appears with only the minimal set of services active in the unit list, and confirm a failing application service is not started.",
    dep: ["targets", "default-target", "boot-parameters"]
  },
  "emergency-mode": {
    s: "The most minimal boot: a shell on the console with only the root filesystem mounted read-only and almost no services running, used when even rescue mode cannot start.",
    d: "Emergency mode starts a shell as soon as the manager is up and the root filesystem is mounted read-only. No other local mounts, no sockets and few units run. It is also the automatic fallback when a required early mount fails or a critical unit fails during boot. An operator can then remount read-write and repair. It is limited by design: with so little running, tools that depend on the logging service, the bus or user sessions do not work.",
    k: ["Read-only root in the fallback shell: protects a possibly damaged filesystem from further writes; fixes require an explicit remount.", "Automatic fall-back to emergency mode vs continuing the boot: forces a visible fix for a missing mount; a remote machine with no console is stranded."],
    p: ["A headless server lands in emergency mode on a mistyped mount entry and is unreachable until someone attaches a console.", "Editing files before remounting read-write fails with confusing errors."],
    v: "Add a bogus required mount to the mount table in a test machine, reboot, and confirm it stops at an emergency prompt with root read-only; remount, fix the entry and confirm normal boot.",
    dep: ["early-mounts", "mount-units", "pid1-role"]
  },
  "boot-parameters": {
    s: "Options on the kernel command line that the manager reads at start to change its behavior: default target, log level, recovery shell, unit masking and debug output.",
    d: "The kernel passes its command line to the first process, which parses the options it recognizes: a target to boot into, a log level and destination, a request for a debug shell, units to mask, whether to use read-only root and more. Setting them from the boot loader lets an operator change behavior with no working system, which makes them the main recovery lever. Hard because each option is an unauthenticated override that anyone with console access can use, and because options accumulate with version-specific meaning.",
    k: ["Command-line overrides vs only on-disk configuration: recovery works when the disk configuration is broken; physical access gives an attacker the same lever unless the boot loader is protected.", "Many fine-grained options vs few: precise diagnostics without rebuilding images; long lines are copied between machines and forgotten."],
    p: ["A leftover debug or masking option copied into the permanent boot entry degrades every later boot.", "Assuming an option is honored by an older manager that ignores it silently."],
    v: "Boot once with the option that selects the rescue target and a debug log level, and confirm the reached target and the verbose messages; reboot without it and confirm the normal target returns.",
    dep: ["default-target", "pid1-role"]
  },
  "boot-counting": {
    s: "A scheme that counts failed boot attempts of a new system image or kernel and falls back to the previous one when the new one never reaches a good state.",
    d: "A boot entry carries a remaining-tries counter that the boot loader decrements on each attempt. When the system reaches a designated success target, a small unit marks the entry good and removes the counter. If tries run out first, the loader picks the previous entry. This turns a bad update into an automatic rollback instead of a dead machine. It is hard because success must be defined carefully: reaching the default target does not prove the application works.",
    k: ["Success defined as reaching a target vs an application health check: simple and uniform; a machine can boot into a broken service and still be marked good.", "Automatic rollback with a retry counter vs manual recovery: unattended devices heal; a transient fault can discard a good update."],
    p: ["Marking the boot good too early, before the network or storage is confirmed, hides a bad image.", "Counter state stored on a filesystem the failed image corrupts makes the fallback unreliable."],
    v: "Install an image that hangs before the success target, power-cycle until the counter reaches zero, and confirm the previous entry boots; install a good one and confirm the counter file is removed.",
    dep: ["targets", "boot-parameters"]
  },
  "unit-file-format": {
    s: "The declarative text format for definitions: named sections of key-value settings, with comments, line continuation, multi-value lists and a reset-by-empty-assignment rule.",
    d: "A file has sections such as Unit, Service and Install, each a list of key = value lines. Settings that repeat accumulate into lists, and assigning an empty value clears what earlier fragments set, which makes drop-in overrides possible. Time spans, sizes and booleans accept several spellings. The parser must be strict but forgiving: unknown keys produce warnings so old files keep loading under newer or older managers. It is hard because the format is a long-term compatibility contract: every key is permanent and every default is behavior that thousands of files rely on.",
    k: ["Declarative settings vs shell scripts: the manager can analyze, order and sandbox without running code; logic needing conditions must be pushed into a helper program.", "Warn on unknown keys vs reject: files stay portable across versions; typos are tolerated and may silently drop a security setting."],
    p: ["Appending to a list setting in an override when the intent was to replace it leaves both the old and new values active.", "Quoting and escaping rules differ from a shell, so copied command lines behave differently."],
    v: "Write a unit with a repeated setting and a reset to empty, load it, and confirm the property dump shows exactly the values after the reset, not the earlier ones.",
    dep: []
  },
  "unit-types": {
    s: "The kinds of object the manager controls: services, sockets, targets, timers, paths, mounts, automounts, swap areas, devices, slices and scopes, each with its own settings and state machine.",
    d: "All types share the common dependency, condition and lifecycle machinery, and add type-specific behavior. A service runs processes; a socket owns listening endpoints; a timer fires another unit; a path watches the filesystem; mount, automount, swap and device mirror kernel objects; a target is a pure synchronization point; a slice is a node in the resource tree; a scope groups processes the manager did not start itself. Having one graph for all of them is the design's main idea, and its cost is a large, intertwined set of states to keep consistent.",
    k: ["One graph for every kind of object vs separate subsystems: ordering across services, mounts and devices is uniform; each type pulls the whole manager's complexity along with it.", "Externally created objects, such as devices and scopes, mirrored as units: dependencies can wait on hardware; state is only as fresh as the kernel event that updates it."],
    p: ["Treating a target as something that runs; it has no process and only groups other units.", "Adding a dependency on a device or mount without ordering it can start a service before it is ready."],
    v: "List units by type on a running system and confirm at least services, sockets, targets, mounts, devices and slices appear, each with an active state; stop a socket and confirm its service is unaffected.",
    dep: ["unit-file-format", "state-machine"]
  },
  "service-definition": {
    s: "The settings that describe how to run one service: its commands, start type, user, working directory, environment, restart behavior, timeouts and limits.",
    d: "The service section names the command to run and how the manager should treat it: whether it blocks, forks or signals readiness, which account runs it, which directories it gets, what happens when it exits and how long each phase may take. Common patterns are one-shot tasks, long-running daemons and templates. It is where most operator mistakes occur, because the defaults must suit many cases and a wrong start type makes the manager misjudge the service's state.",
    k: ["Many small orthogonal settings vs a few presets: precise control over each behavior; every service author must understand the combinations.", "Defaults tuned for typical daemons: short files for most services; surprising behavior for unusual ones, such as a restart that never happens."],
    p: ["Declaring a daemon that forks as a simple service makes the manager think it exited and kill its children.", "A command line relying on shell features such as pipes or globbing fails because no shell is involved."],
    v: "Start a service defined with a distinctive user and working directory and confirm from its process listing that it runs as that user in that directory, with the environment variables set in the file.",
    dep: ["unit-file-format", "exec-directives", "service-types", "restart-policies"]
  },
  "exec-directives": {
    s: "Settings that run commands at lifecycle points: before start, the main command, after start, reload, stop and after stop, each with its own timeout and failure rule.",
    d: "A service can have several commands in a row before start, a main command, a reload command, a stop command and cleanup commands. Each is executed without a shell, directly with arguments, with variable substitution done by the manager. A prefix on the command can ignore a failing exit status or run it with elevated privileges. If a pre-start command fails, the service does not start; stop and cleanup commands run even after failures. The hard part is semantics around failure, because a cleanup that fails halfway can leave resources behind.",
    k: ["Ordered lists of commands vs one wrapper script: the manager sees each step and can time it out; sequences needing shared shell state become awkward.", "Tolerant-failure prefixes vs strict checks: optional steps do not block startup; ignored failures can hide a broken precondition."],
    p: ["A post-stop cleanup that depends on files the main process already deleted fails and leaves the service in a failed state.", "Assuming one failing pre-start command is skipped when it actually aborts the start."],
    v: "Define a service with a failing pre-start command and confirm it never reaches active and reports the failed step; add the ignore prefix and confirm it starts normally.",
    dep: ["service-definition", "child-spawn", "specifiers-variables"]
  },
  "specifiers-variables": {
    s: "Placeholders expanded by the manager inside definitions, such as the unit name, instance, home directory or machine identity, plus environment variables available to commands.",
    d: "Percent-prefixed specifiers expand at load time to facts about the unit and the system: its name, template instance, runtime directory, user home and more. Dollar-prefixed variables expand at execution time from the service's environment, and a separate braced form controls word splitting. Because there is no shell, this is the only substitution available. It matters for templates, where one file serves many instances. It is hard because three expansion mechanisms with different timing and quoting live in the same string.",
    k: ["Expansion by the manager rather than a shell: predictable and safe from injection; nothing like conditionals or loops is available.", "Load-time specifiers vs run-time variables: names and paths are fixed early for analysis; values that change after load cannot use specifiers."],
    p: ["Using a variable where a specifier was needed yields an empty string and a command that silently does the wrong thing.", "A literal percent sign must be doubled and is forgotten, breaking a date format string."],
    v: "Use the instance specifier and an environment variable in a template's command line, start two instances, and confirm each process shows its own substituted arguments.",
    dep: ["unit-file-format", "templates-instances"]
  },
  "templates-instances": {
    s: "A single definition file whose name ends with an at-sign that can be started many times with a different suffix, each running as its own unit.",
    d: "A template such as a per-device or per-connection service is named with an empty instance slot. Starting a name with a suffix creates an instance, and the suffix is available in the file as a specifier. Instances have independent state, control groups and logs but share one definition. It is the mechanism behind per-connection socket activation and per-device services. The difficulty is tracking: hundreds of instances can exist, dependencies can name them dynamically, and removing the template does not stop instances already running.",
    k: ["One template for many instances vs generating many files: a single place to fix; instances cannot differ in structure, only in their parameter.", "Instance name carried as free text vs a structured key: easy to use; escaping rules matter when it contains slashes or spaces."],
    p: ["An instance name containing a path separator or space must be escaped, and unescaped names create the wrong unit.", "Editing a template and expecting existing instances to change without a restart."],
    v: "Start the template with two different suffixes, list the units and confirm two independent active instances with separate main process ids; stop one and confirm the other continues.",
    dep: ["unit-file-format", "specifiers-variables"]
  },
  "generators": {
    s: "Small programs run very early at each boot and reload that read other configuration, such as the mount table or kernel command line, and write unit files for the manager.",
    d: "Before loading definitions, the manager executes every program in the generator directories, each given three output directories of different priority. A generator might convert mount table entries into mount units, create a service for each configured encrypted volume or add a unit named on the kernel command line. This lets foreign configuration formats participate in the graph without a second code path. They run with almost nothing available: no logging, almost no filesystems and no dependencies, so they must be fast and simple.",
    k: ["Translate foreign formats to units vs teach the manager each format: the core stays small; a generator bug stops boot or produces an unexplained unit.", "Generators run at every reload vs once: output follows configuration changes; their cost adds to every reload."],
    p: ["A slow or hanging generator delays the entire boot, and it runs before the logs are available.", "Editing a generated file instead of the source configuration, which is overwritten at the next reload."],
    v: "Add a mount table entry, reload, and confirm a generated mount unit appears under the generator output directory with the same options; remove the entry and confirm the unit disappears.",
    dep: ["unit-file-format", "precedence-order", "mount-units"]
  },
  "drop-ins": {
    s: "Small fragment files in a directory named after a unit that add to or override its settings, so an administrator changes behavior without editing the vendor's file.",
    d: "For each unit the manager also reads every file in a directory with the unit's name plus a suffix, in alphabetical order, and merges it over the main file. Fragments can also be placed on a type or hierarchy prefix to apply to many units, such as all services in one slice. Assigning empty clears a list before adding. A package upgrade can replace the main file and leave local changes intact. The difficulty is that the effective definition is spread over several places, so the real behavior is only visible through the merged view.",
    k: ["Fragments that merge over the main file vs copying the full file: upgrades keep local changes and still receive fixes; behavior is spread over files and harder to read.", "Alphabetical load order decides conflicts: simple and predictable; authors encode priority in file names such as numeric prefixes."],
    p: ["Overriding a list setting without first clearing it appends instead of replacing, running both commands.", "Fragments with the wrong suffix or in the wrong directory are ignored without any warning."],
    v: "Add a fragment that clears and redefines the start command, reload, and confirm the merged view lists the fragment path and shows only the new command, while the vendor file is untouched.",
    dep: ["unit-file-format", "precedence-order"]
  },
  "precedence-order": {
    s: "The ordered list of directories the manager searches for definitions, from transient runtime files to administrator files to vendor files, where the first match wins.",
    d: "Definitions live in several locations: a generated or transient area, runtime configuration, administrator configuration and vendor-supplied directories under the system tree. A unit name found in a higher-priority place hides the same name in a lower one, while fragments from all places merge. This lets a package ship defaults, an administrator override them and the system generate temporary ones. The difficulty is that precedence applies per file name, so a copy placed in a higher directory freezes the unit and stops it receiving later vendor fixes.",
    k: ["Whole-file replacement by name vs always merging: an admin can substitute a unit completely; the copy silently stops tracking upstream fixes.", "A fixed small set of locations vs configurable paths: every machine behaves alike and tools find files; unusual layouts need generators or links."],
    p: ["An old full copy in the administrator directory masks an updated vendor unit for years after a bug is fixed upstream.", "Placing a file in a runtime directory expecting it to survive reboot."],
    v: "Place a differing copy of a unit in a higher-priority directory, reload and confirm the status output names that path as the source; delete it, reload and confirm the vendor path returns.",
    dep: ["unit-file-format"]
  },
  "masking": {
    s: "A way to make a unit impossible to start by pointing its name at an empty target, so neither a dependency nor an operator can bring it up.",
    d: "Masking replaces a unit's name in a high-priority directory with a link to nothing. The manager then reports the unit as masked and refuses to start it by any route, including as another unit's dependency or by activation. This is stronger than disabling, which only removes the install links and still allows dependencies to start it. It is used to forbid a service that a vendor package enables. The risk is invisibility: a masked unit has no error beyond the load state, and dependents just fail.",
    k: ["Masking vs disabling: nothing can start a masked unit, including dependencies; dependents may fail with an obscure message instead of working around it.", "Mask by link in a directory vs a config flag: visible in the filesystem and survives upgrades; easy to forget during later debugging."],
    p: ["Forgetting a service was masked while debugging why a dependent unit fails to start.", "Masking a unit that other required units depend on makes the whole target fail."],
    v: "Mask an optional service, try to start it by name and as a dependency, and confirm both are refused with a masked message; unmask and confirm it starts.",
    dep: ["precedence-order", "requirement-deps"]
  },
  "transient-units": {
    s: "Units created at runtime through the control interface, with no file on disk, for running a one-off command under supervision with chosen resource limits, or changing a running unit's properties temporarily.",
    d: "A client can ask the manager to start a command as a unit it creates on the fly, with properties passed as arguments. It then has a control group, logs and limits like any service and vanishes when it finishes. Runtime property changes adjust limits of a running unit and can be marked temporary, so they last only until reboot. Session managers and container tools create their scopes and slices this way. It is hard because there is nothing to inspect on disk, so state is visible only through the manager.",
    k: ["Runtime creation instead of files: scripts get supervision, limits and cleanup in one call; nothing is left to audit later.", "Properties set at runtime that are lost at reboot vs persisted: safe experiments; operators forget the change was never saved."],
    p: ["A tuned limit applied live and never written to a fragment disappears at the next reboot.", "A transient unit that fails is garbage-collected before anyone reads its exit status."],
    v: "Run a command as a transient unit with a memory limit, inspect it while it runs, confirm the limit and control group exist, and confirm the unit is gone after the command exits.",
    dep: ["control-protocol", "control-groups", "state-machine"]
  },
});
