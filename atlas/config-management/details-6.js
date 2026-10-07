// Details for the configuration management plate, part 6: providers, platform and cross-cutting concerns.
ATLAS.details("config-management", {
  "provider-selection": {
    s: "Chooses which implementation of a resource type to use on a given node, based on facts and what tools are present, so one declaration works across platforms.",
    d: "A resource type has several providers, each suitable for some platforms or tools: different package tools, different service managers. The engine tests each provider's suitability using facts and checks for executables, then picks the default or the one the code names. This is what lets one line of code manage a package everywhere. It is hard because detection is heuristic: a node with two package tools installed can match two providers, and a wrong choice is a silent mismatch.",
    k: ["Automatic selection vs explicit provider in code: automatic keeps code portable; explicit is unambiguous and loses portability.", "Provider per tool vs per operating system: per tool follows reality; per OS is simple and breaks when tools are installed beside the default."],
    p: ["Two providers both claim suitability, and nodes pick different ones depending on the order of detection.", "An unsupported platform falls through to a default provider that fails with a confusing message."],
    v: "Ask the engine which provider it selects for each resource type on test nodes of each supported platform, and confirm each matches the platform's native tool.",
    dep: ["os-abstraction", "facts-collector"]
  },
  "package-provider": {
    s: "Installs, upgrades, holds and removes software packages by calling the node's native package tool, and reports the installed version.",
    d: "The provider queries installed packages, compares with the requested state (present, a specific version, latest, absent) and runs the native tool to change it. It must handle repositories, dependencies resolved by the tool, version pinning and non-interactive operation. It is among the most failure-prone providers: tools lock a database, mirrors are unreachable, and a latest setting causes uncontrolled upgrades that restart services. The provider depends on the tool's output format, which varies by version.",
    k: ["Pin exact versions vs ensure present: pinning is reproducible and demands constant updates; present is easy and leaves versions to drift.", "Track latest vs deliberate upgrades: latest gets fixes automatically and surprises production; deliberate upgrades are safe and slow."],
    p: ["A latest setting upgrades a package during business hours and restarts a service unexpectedly.", "The package database is locked by an automatic update, and the run fails for reasons outside the configuration."],
    v: "Request an exact version on a clean test node, confirm the installed version from the package tool equals it, then run again and confirm no change and no tool invocation that modifies anything.",
    dep: ["package-manager-interface", "provider-selection"]
  },
  "file-provider": {
    s: "Manages files, directories, links and their content, owner, group and mode, writing content only when it differs and replacing files atomically.",
    d: "It compares checksum, owner, group and mode with the target, and writes new content to a temporary file in the same directory, sets metadata and renames it into place, so readers never see a partial file. It can take content from a literal, a template or a file served from the server, and can validate content with a command before replacing. Options cover backups, recursion and purging unmanaged files. It is hard because files are shared surfaces: other software edits them, and the metadata model differs between filesystems.",
    k: ["Replace the whole file vs edit lines in place: whole-file replacement is deterministic and takes ownership; in-place edits coexist with other writers and are fragile.", "Validate before replacing vs trust the content: validation prevents installing a config that breaks the service; trusting is simpler and risks outages."],
    p: ["A non-atomic write leaves a half-written configuration that the service reads after a crash.", "Recursive ownership changes on a huge directory take minutes and lock out the application."],
    v: "Apply a file with a known owner and mode, confirm the node matches, introduce a syntax error in the template, and confirm validation prevents the broken file from replacing the working one.",
    dep: ["filesystem-semantics", "templating-engine"]
  },
  "service-provider": {
    s: "Ensures a service is running or stopped, and enabled or disabled at boot, by driving the node's init system, and restarts or reloads it when notified.",
    d: "The provider asks the init system for the service's status and enablement, starts or stops it as required, and performs restart or reload on refresh events. Some services report running while unhealthy, so some providers support a custom status command. It translates the abstract service state into the commands of each init system. The hard part is that running is a weak statement: a service can be running and not serving, and a restart can succeed while the new configuration fails to load.",
    k: ["Restart on change vs reload: restart is universal and interrupts; reload is gentle and not supported by every service.", "Trust the init system's status vs a custom health check: init status is available everywhere; a custom check reflects whether the service really works."],
    p: ["A service is reported running while its worker processes are crashing, and the resource shows as converged.", "Enabling a service at boot without starting it leaves it down until the next reboot."],
    v: "Stop a managed service by hand, run convergence, and confirm it starts and answers on its port, then change its config and confirm a single reload happens and the service remains up.",
    dep: ["init-system-interface", "notifications-and-restarts"]
  },
  "account-provider": {
    s: "Manages users, groups, memberships, shells, home directories and authorized keys so that accounts across the fleet match the declared set.",
    d: "The provider reads the account database through system tools, compares attributes, and creates, modifies or removes accounts with the platform's utilities. It also manages key files and password hashes, and can purge accounts not declared. Identity decisions such as numeric IDs must be consistent across machines, particularly when files are shared. It is sensitive: removing an account can orphan files or kill running processes, and purging undeclared accounts on a node that also uses a directory service can lock out legitimate users.",
    k: ["Manage accounts locally vs rely on a central directory: local accounts work without a network and need synchronizing; a directory gives one source and a dependency.", "Purge undeclared accounts vs leave unknown ones: purging enforces policy and is risky; leaving them is safe and hides unauthorized accounts."],
    p: ["Purging unmanaged accounts removes an account that a vendor installed and a service depends on.", "Different nodes assign different numeric IDs to the same user, which breaks shared storage permissions."],
    v: "Declare a user with a fixed numeric ID and a key, apply on two test nodes, and confirm the ID, home directory and authorized key are identical, and that removing the declaration with absent removes the account cleanly.",
    dep: ["file-provider", "os-abstraction"]
  },
  "mount-and-disk-provider": {
    s: "Manages filesystems, mounts, partitions and volume settings, so storage layout and mount options match the declaration.",
    d: "The provider reads mounted filesystems and the persistent mount table, and ensures entries and mount state match, including options. Some implementations also create partitions, volumes and filesystems, and resize them. Errors here are costly: a wrong mount option can make a node unbootable, and formatting a device destroys data. For that reason, providers for creation are conservative and usually refuse to act on a device that already holds a filesystem. They are among the least portable providers.",
    k: ["Manage the mount table only vs also create filesystems: mount-only is safe; creation automates provisioning and puts data at risk.", "Mount immediately vs only record for next boot: immediate is consistent with declaration; recording only avoids disrupting running workloads."],
    p: ["A bad entry in the mount table prevents the node from booting after the next restart.", "A device name changes between boots, and the provider formats the wrong disk."],
    v: "Declare a mount for a test volume, apply, confirm it is mounted with the declared options, reboot the node, and confirm the mount returns and the node boots normally.",
    dep: ["filesystem-semantics", "os-abstraction"]
  },
  "network-and-firewall-provider": {
    s: "Manages addresses, routes, names, interface settings and packet filter rules so that the node's network behavior matches the declared policy.",
    d: "The provider writes network configuration and firewall rules through the platform's tools and applies them, often as an ordered rule set rather than independent resources. Rule order and completeness matter, so many designs build the whole rule set from fragments and replace it atomically. It is the riskiest area, because a mistake cuts the connection that the configuration system uses, and a rule change that cannot be reached cannot be corrected. Safe designs apply with automatic rollback if connectivity is lost.",
    k: ["Replace the entire rule set vs manage individual rules: replacing is deterministic and removes unknown rules; individual rules coexist with other managers and drift.", "Apply with a rollback timer vs apply immediately: a timer recovers from lockout; immediate application is simple and unforgiving."],
    p: ["A firewall change blocks the management channel and the node can no longer be reached or corrected.", "Rule fragments are assembled in an unstable order, so each run rewrites the set and reports changes."],
    v: "Apply a rule change that would sever the management connection on a test node with rollback enabled, and confirm that connectivity is restored automatically within the timer and the failure is reported.",
    dep: ["os-abstraction", "timeouts-and-cancellation"]
  },
  "scheduled-task-provider": {
    s: "Manages recurring jobs, such as entries in the node's scheduler, so periodic tasks exist exactly where and when declared.",
    d: "The provider reads the scheduler's entries for each user or the system, and adds, changes or removes jobs identified by a name or marker comment. Declared jobs live beside jobs added by hand or by other software, so identification and ownership are central. Scheduling is a classic place for fleet-wide timing mistakes: if every node runs a heavy job at midnight, shared services buckle, so jobs often need randomized times.",
    k: ["Identify jobs by marker or name vs replace the whole table: markers coexist with hand entries; replacing the whole table guarantees the state and deletes foreign jobs.", "Same time on every node vs randomized offsets: same time is predictable and creates load spikes; randomized offsets spread load."],
    p: ["Every node starts a backup at the same minute and overloads the backup server.", "A renamed job is added as new and the old entry stays, so the task runs twice."],
    v: "Declare a job, apply, list the node's scheduler to confirm exactly one entry, change its time, apply again, and confirm the old entry is gone and the new one present.",
    dep: ["os-abstraction"]
  },
  "command-execution-provider": {
    s: "Runs arbitrary commands as a resource, with guards that decide whether to run, so tasks without a proper resource type can still be managed.",
    d: "A command resource names the command, working directory, user, environment and conditions: run only if a file is absent, only if a check command fails, or only when notified. Guards are what keep it idempotent, because the engine cannot see what a command changes. It is the escape hatch for anything unsupported. It is also the largest source of non-idempotent, unreportable changes, since the report can only say it ran, and dry runs cannot predict its effect.",
    k: ["Command with guards vs writing a proper resource type: guards are fast to write and fragile; a type is reusable, comparable and reportable.", "Run on every run vs only on refresh: every run is simple and wasteful; on refresh runs only when its trigger changed."],
    p: ["A command without a guard runs on every run and repeats its side effect.", "Commands run through a shell with unquoted values, and a variable with a space or semicolon changes the command."],
    v: "Declare a command with a guard that checks its result, apply twice on a test node, and confirm it runs once and the second run reports it skipped because the guard was satisfied.",
    dep: ["privilege-escalation", "timeouts-and-cancellation"]
  },
  "custom-resource-types": {
    s: "The extension mechanism for adding a new resource type with its own attributes and provider, so teams can manage things the built-in set does not cover.",
    d: "A custom type defines its attributes, how to identify an instance, and a provider with read and write operations. Once registered it behaves like a built-in: it has reports, dry runs, dependencies and notifications. Types are written in the system's extension language and shipped inside modules. They are better than command resources for anything reused, but need real engineering: correct reads, idempotent writes and tests. The common mistake is a type whose read does not match what its write produces, so it never converges.",
    k: ["Write a type vs wrap commands in a defined type: a type compares and reports exactly; wrapped commands are fast to write and opaque.", "Type distributed with the module vs a central library: with the module keeps versions together; a central library gives one reviewed implementation."],
    p: ["The read operation returns a value in a different format from the target, and the resource changes on every run.", "A type is installed on the server and not the agents, and only some nodes fail."],
    v: "Apply a custom resource on a test node, confirm the external state exists, run again and confirm zero changes, then delete the state by hand and confirm the next run recreates it.",
    dep: ["resource-abstraction", "provider-selection", "module-testing"]
  },
  "os-abstraction": {
    s: "A layer that hides differences between operating systems and versions, such as paths, command names, file formats and facility availability, behind uniform calls used by providers.",
    d: "It supplies the engine with the platform's name and version, path conventions, user databases and the available tools, and wraps platform-specific calls. Providers call the abstraction rather than testing the operating system themselves. This is what lets a fleet mix servers, appliances and workstations. It is a permanent cost: each platform release changes a path or a tool output, and rarely used platforms receive less testing, so portability claims are strongest where tests run.",
    k: ["Broad platform support vs a small supported set: broad support serves mixed fleets and dilutes testing; a small set is reliable and excludes machines.", "Abstract away differences vs expose them in code: abstraction keeps code portable and hides real differences; exposing them gives control and duplicates logic."],
    p: ["A new platform release changes a tool's output format, and the provider misreads state on those nodes only.", "Portable code is tested on one platform, and breaks on the others."],
    v: "Run the same module's acceptance tests on every supported platform release in a matrix and confirm all pass with zero changes on the second run.",
    dep: []
  },
  "privilege-escalation": {
    s: "The way unprivileged connections or processes gain the rights needed to change system state, and the controls that limit which actions they may perform.",
    d: "Agents typically run with full system rights. Agentless transports connect as an ordinary user and escalate through the platform's delegation tool or a privileged login. Policies define who may escalate and to what, ideally limited to specific commands. It is hard because configuration management exists to make privileged changes everywhere, so the rights it holds are broad, and attempts to narrow them tend to be bypassed by a single command that can run anything.",
    k: ["Direct privileged login vs delegated escalation: direct is simple and gives broad access; delegation allows limits and logging and is harder to set up.", "Full rights for the agent vs a restricted set of commands: full rights are workable; restricted rights reduce harm and rarely stay accurate."],
    p: ["The delegation policy allows a command that can launch a shell, so the limits mean nothing.", "A password prompt appears during a non-interactive run, and the task hangs until timeout."],
    v: "Run a task as the unprivileged connection user, confirm a permitted action succeeds with escalation, and a not-permitted action is refused and recorded in the node's authentication log.",
    dep: []
  },
  "package-manager-interface": {
    s: "The thin adapter that wraps each package tool's commands and output so providers can ask for installed versions, available versions and installs in one form.",
    d: "Each package tool has its own commands for query, install, remove and hold, its own output format, and its own lock behavior. The adapter normalizes these: it runs non-interactively, parses results, handles repository metadata refresh and maps exit codes to success, failure and retryable. It isolates the rest of the system from tool churn. The hard part is parsing text meant for humans, and the fact that tools change their output and behaviors between versions without notice.",
    k: ["Parse human-readable output vs use machine-readable interfaces: parsing works everywhere and breaks on changes; machine interfaces are stable where available and not everywhere.", "Refresh metadata every run vs on demand: every run is current and slow; on demand is fast and may install from stale metadata."],
    p: ["A tool update changes its output wording, and the parser reports installed packages as absent and reinstalls them.", "Metadata refresh fails silently and the system installs an outdated version."],
    v: "Query a test node for a package's installed and candidate versions through the adapter and compare with the native tool's own output, confirming they match for several packages.",
    dep: ["os-abstraction"]
  },
  "init-system-interface": {
    s: "The adapter for the node's service manager, translating start, stop, enable, disable and status operations into the calls each init system understands.",
    d: "Init systems differ in how they define services, report state and handle dependencies, and some offer both a script model and a declarative unit model. The adapter gives providers one set of operations and also writes unit files when the system manages them. It must treat state precisely: active, enabled, masked and failed are distinct. It is hard because a service's reported state can lag its real state, and because restarting is asynchronous so success has to be observed, not assumed.",
    k: ["Control services through the init system's API vs through its command tool: an API is structured and needs a library; the command tool works everywhere and needs parsing.", "Manage unit definitions vs only service state: managing units gives full control and more to maintain; state only is simple and relies on packages."],
    p: ["A service is reported started while it is still starting, and a following resource that needs it fails.", "A failed unit stays in a failed state and later start requests are refused until reset."],
    v: "Start, stop and restart a test service through the interface and after each confirm the state from the init system itself and from a connection to the service's port.",
    dep: ["os-abstraction"]
  },
  "filesystem-semantics": {
    s: "The behaviors of the file layer that providers must handle correctly: atomic rename, permissions and ownership, links, extended attributes, case rules and cross-device moves.",
    d: "File changes must survive crashes and concurrent readers, so providers write to a temporary file on the same filesystem and rename. They must preserve or set modes, owners, security labels and attributes, follow or refuse links deliberately, and handle special files. Filesystems differ: some do not support ownership, some are case-insensitive, network filesystems have weaker guarantees. Mistakes here are rarely visible until a crash or a race exposes them, and tests on one local filesystem do not reveal them.",
    k: ["Atomic rename in the same directory vs write in place: rename never exposes partial content; in-place writes are simpler and unsafe.", "Follow links vs refuse them: following is natural and exposes link attacks; refusing is safe and surprises legitimate use."],
    p: ["A managed path is a link that an attacker replaced, and a privileged write follows it to a sensitive file.", "A temporary file is created on another filesystem, and the rename silently becomes a copy that is not atomic."],
    v: "Kill the agent in the middle of rewriting a large managed file on a test node, and confirm that the file on disk is entirely the old version or entirely the new one, never a mixture.",
    dep: []
  },
  "local-cache-and-state": {
    s: "The directory on each node where the agent keeps its identity, cached plans, run state, locks and downloaded files, protected from other users.",
    d: "It holds the node's private key and certificate, the last plan and report, checksums, lock files, and cached files from the server. Its permissions must exclude ordinary users, and its location must survive reboots but not images: cloning a machine must not clone its identity. Cache contents are rebuildable except for the key. It is hard because it is mutable state beside declarative code, and corruption or a stale copy produces odd behavior that is solved by deleting it, and deleting it loses identity.",
    k: ["Keep identity with the cache vs separate directories: together is simple; separate lets the cache be cleared safely without re-enrolling.", "Store state on persistent disk vs memory: persistent survives reboot and offline starts; memory is clean at boot and loses the cache."],
    p: ["A machine image captured with the state directory yields clones sharing one identity.", "Cleaning up the directory to fix a glitch also deletes the node's key, and it must re-enroll."],
    v: "Inspect the state directory of a test node and confirm the key is readable only by the agent's account, then clear only the cache portion and confirm the next run succeeds without re-enrollment.",
    dep: []
  },
  "clock-and-timezone": {
    s: "The node's clock and timezone settings, and the dependence of certificates, schedules, logs and ordering on them being right.",
    d: "Certificate validity, token lifetimes, scheduled jobs and report timestamps all depend on a correct clock. Nodes with a skewed clock fail authentication with errors that look like certificate problems. The configuration system usually manages time synchronization itself, which creates a bootstrapping problem: a node with a wrong clock cannot connect to fetch the plan that fixes its clock. Timezone handling is easier to get wrong than clocks: servers should keep a single standard zone.",
    k: ["Manage time synchronization through the system vs assume the platform does it: managing it guarantees consistency; assuming it leaves clock bugs unowned.", "One zone for all nodes vs local zones: one zone simplifies logs and schedules; local zones suit users and confuse operations."],
    p: ["A node's clock is days off, and every connection fails with a certificate error that points away from the real cause.", "Daylight saving changes make a scheduled job run twice or not at all."],
    v: "Set a test node's clock ten minutes ahead, attempt a run, and confirm the failure is reported as clock skew; restore synchronization and confirm the next run succeeds.",
    dep: []
  },
  "bootstrap-and-provisioning": {
    s: "How a new machine gets from an installed image to a managed node: installing the agent, setting its identity and name, and running the first convergence.",
    d: "Provisioning tools create the machine, then a startup script installs the agent or enables the transport, passes an enrollment token and role, and triggers the first run. A good first run is a complete one: from a base image to fully configured without manual steps. Images may embed the agent to cut time. It is hard because the first run happens in the worst conditions: no state, perhaps no DNS or package access yet, and it must succeed without an operator watching.",
    k: ["Configure from a bare image at first boot vs bake the configuration into the image: first boot is flexible and slow; baked images start fast and need rebuilding to change.", "Pass the role in provisioning data vs derive it from the name: provisioning data is explicit; name derivation needs no extra channel and is easy to get wrong."],
    p: ["The first run needs a service that the first run itself is supposed to configure, and it fails in a loop.", "The enrollment token is stored in the image, and every machine built from it can enroll as anything."],
    v: "Provision a machine from a clean image with only a token and role, and confirm that without manual steps it enrolls, completes its first run, and reports zero changes on the second run.",
    dep: ["enrollment-and-signing", "node-agent", "os-abstraction"]
  },

  "idempotence-and-convergence": {
    s: "The property that applying the same desired state repeatedly yields the same result, changing only what differs, and that a node reaches the declared state however far from it it starts.",
    d: "Idempotence means a second run changes nothing, and convergence means that from any starting state repeated runs reach the target. Every layer contributes: the language states outcomes, resources compare before acting, providers write only on difference, and commands carry guards. Without it, the system cannot be run on a schedule, dry runs are meaningless and drift cannot be told from noise. Convergence can need several runs when ordering or one-time actions interact, so a first run that is not clean is normal and one that never settles is a defect.",
    k: ["Strict single-run convergence vs allowing several runs: single-run is easier to reason about and constrains design; several runs tolerate awkward ordering and hide bugs.", "Declare outcomes vs declare actions: outcomes make repeated runs safe; actions are easy to write and do the same thing twice."],
    p: ["A resource includes a timestamp or random value and changes on every run, which makes real changes invisible.", "A command without a guard repeats its side effects each run."],
    v: "Apply the full configuration to a clean node until it settles, then run twice more and confirm both later runs report zero changed resources and zero failures.",
    dep: ["state-comparison", "apply-loop", "command-execution-provider", "module-testing"]
  },
  "push-versus-pull": {
    s: "Whether a central controller pushes changes to nodes when told, or each node pulls its plan on a schedule, and what each choice implies for reach, timing, security and drift.",
    d: "Pull has agents that call in: it works through firewalls, scales by spreading checks over time, and corrects drift continuously, but changes arrive within an interval and agents must be installed. Push has a controller that connects out: it gives immediate, ordered control and needs no agent, but requires reachability and credentials to every node and does nothing between pushes. Many deployments combine them, using pull for steady state and push for orchestrated changes and emergencies. The choice shapes network design, credential storage and what is trusted.",
    k: ["Pull only vs push only: pull keeps convergence continuous and changes slow; push is immediate and leaves nodes unmanaged between runs.", "Hybrid with triggers vs a single mode: hybrid covers both needs and doubles the mechanisms to secure and understand."],
    p: ["A fleet managed purely by push drifts for weeks after a failed batch no one reran.", "Pull agents cannot be told to stop quickly during an incident because no trigger path exists."],
    v: "Make a change, record the time it takes to reach all nodes by schedule, and then by trigger, and confirm that both stay within the stated limits and that drift is corrected within one interval.",
    dep: ["node-agent", "push-orchestrator", "run-triggers", "pull-schedule"]
  },
  "trust-and-blast-radius": {
    s: "The decisions that determine who and what is trusted to change machines, and how far a mistake or compromise in the configuration system can reach.",
    d: "The system can change every node as the highest-privileged user, so whoever controls the code, the data, the server or the signing key controls the fleet. Trust boundaries run through the repository, the review process, the server, proxies, the secret store and the agents. Limiting blast radius means scoping credentials per node, separating environments, staging rollouts, restricting who can merge and keeping the signing authority apart from the compiler. The tension is always between the convenience of one powerful system and the damage if it is misused.",
    k: ["One central system for all environments vs separate systems per environment: central is easier to maintain and gives broad reach; separate limits blast radius at the cost of duplicated operations.", "Nodes trust the server completely vs verify signed code: complete trust is simple; signing protects against a compromised server and needs key management."],
    p: ["A single compromised merge account can push code that runs as the highest-privileged user on every node.", "Test and production share a server and a signing authority, so a test node can request production secrets."],
    v: "Using credentials for a test environment, attempt to read production data and secrets and to start a run on production nodes, and confirm every attempt is refused and logged.",
    dep: ["operator-access-control", "node-identity", "change-review-workflow", "secret-delivery"]
  },
  "determinism-and-ordering": {
    s: "The requirement that the same code, data and facts always produce the same plan and the same order of changes, so runs can be cached, compared and reproduced.",
    d: "Determinism covers compilation, where lookups, functions and templates must not depend on the clock or random values, and execution, where order must follow from the graph and not from an accident such as file order. It makes plan caching valid, lets reviewers preview changes, and makes failures reproducible. It conflicts with real inputs: external lookups, timestamps and generated passwords are all nondeterministic. A system keeps determinism by isolating those inputs, naming them explicitly and storing generated values.",
    k: ["Strict deterministic compilation vs allowing time and randomness: strictness enables caching and exact previews; allowing them is convenient and makes every run a change.", "Total order of independent resources vs leaving it unspecified: a total order is reproducible; unspecified order allows parallelism and varying behavior."],
    p: ["A resource that depends on unspecified order works for a year and fails after an unrelated change reorders the plan.", "A generated value is not stored, and every compile produces a different one, changing files fleet-wide."],
    v: "Compile the same inputs on two different servers and confirm the plans are identical, then run the node with the order of independent resources randomized and confirm the end state is the same.",
    dep: ["plan-compiler", "dependency-graph", "plan-cache"]
  },
  "ownership-and-manual-change": {
    s: "The decision about which parts of a node the system owns completely, which it shares with other tools and people, and what happens when someone changes an owned setting by hand.",
    d: "A file can be owned fully, with every manual edit overwritten; owned in part, as a line or a block; or merely ensured to exist. Each level answers who wins when systems disagree. Without a clear answer, the configuration system, applications, package upgrades and operators fight, and flapping results. Policies can forbid hand changes, tolerate them and report drift, or detect them and alert. The right choice depends on how fast people need to act in emergencies and how much a hidden difference costs.",
    k: ["Own whole files vs manage fragments: whole files are deterministic and take everything; fragments coexist and are fragile to ordering and conflicts.", "Overwrite manual changes vs report them: overwriting enforces the standard and can destroy an emergency fix; reporting preserves it and lets drift accumulate."],
    p: ["An incident fix applied by hand is overwritten ten minutes later by the next run, and the outage returns.", "Two tools each own the same file and rewrite it alternately, so both report constant changes."],
    v: "Edit one fully owned file and one reported-only file by hand on a test node, run convergence, and confirm the first is restored, the second is left in place, and both are named in the drift report.",
    dep: ["file-provider", "drift-detection", "drift-reports"]
  },
  "failure-isolation-at-scale": {
    s: "The measures that keep a failure on one node, one change or one server from becoming a failure of the whole fleet.",
    d: "At scale something is always failing, so the design limits its spread: staged rollouts and halting rules limit a bad change; per-node failure handling keeps one failed resource from stopping a run; queues and caches absorb a server outage; splay prevents synchronized load; separate environments and groups limit the reach of data errors. Nodes keep running with their last good plan when the server is down. The principle is that the central system must degrade gradually and the nodes must not depend on it for their normal operation.",
    k: ["Fail closed when the server is unreachable vs continue with the cached plan: failing closed is safe for secrets and stops all convergence; cached operation keeps nodes steady and applies stale policy.", "Uniform fleet-wide changes vs always staged: uniform is fast and risks everything; staged is slower and contains mistakes."],
    p: ["One shared data file is wrong, and every node fails its run in the same minute.", "A server restart triggers every agent to retry together, and the thundering herd prevents recovery."],
    v: "Stop the central server for an hour on a test fleet and confirm nodes keep running on cached plans, that reports are queued, and that after restart the load returns to normal without sustained overload.",
    dep: ["batched-rollouts", "canary-and-halt-rules", "splay-and-jitter", "run-state-persistence"]
  }
});
