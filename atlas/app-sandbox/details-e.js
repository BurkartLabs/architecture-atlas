// Details for the application sandbox plate, part 5: kernel primitives, denials, audit and crashes.
ATLAS.details("app-sandbox", {
  "user-namespaces": {
    s: "A mapping that gives a process apparent administrative rights inside its own scope while it holds none on the host, letting unprivileged code build a sandbox.",
    d: "A user namespace maps identities inside to unprivileged identities outside. A process can be root inside and use that to create other namespaces and mounts, while the kernel treats its actions on host objects as those of the unprivileged outside user. This lets sandboxes be built without a privileged helper. It also exposes kernel code that was previously reachable only by root, which has produced many vulnerabilities. It is hard because behavior depends on exact mapping rules and kernel configuration, and some systems disable unprivileged use.",
    k: ["Unprivileged user namespaces vs a privileged setup helper: unprivileged creation is simple and widens the kernel surface to every user; a setup helper limits exposure and carries privileged code.", "Nest the app's own namespace vs forbid creating more inside: forbidding stops the app from building its own sandbox and removes a bug-rich surface."],
    p: ["The app is left able to create new user namespaces and use the extra capabilities inside to reach kernel bugs.", "Identity mapping is wrong, so files created inside belong to the wrong owner outside."],
    v: "Inside the sandbox print the identity mapping and confirm capabilities are limited to the namespace. Attempt to create another user namespace and a mount and confirm both are refused when policy forbids them.",
    dep: ["capability-dropping"]
  },
  "pid-namespace": {
    s: "A private numbering of processes, so the confined app sees only itself and its children and cannot signal or inspect anything else.",
    d: "Inside a new process-ID namespace the first process has the lowest identifier and acts as the reaper; when it exits, the kernel kills everything inside. The app's process listing shows only its own group. Together with a matching view of process information, this removes the ability to enumerate or target other processes and gives supervisors a reliable teardown. It is hard because the process information filesystem must be mounted from inside the namespace, and handles obtained from outside still refer to host processes.",
    k: ["Own the reaper in the sandbox vs have the host supervise: an in-sandbox reaper keeps zombies away and needs a minimal init; host supervision is simpler and leaves orphans.", "Share the host process view for diagnostics vs hide it: hiding prevents information leaks and complicates profiling and debugging."],
    p: ["The host's process information filesystem is mounted into the sandbox, exposing every process and its command line.", "The first process does not reap children, so zombies accumulate until a limit stops the app."],
    v: "From inside the sandbox list all processes and try to signal a host process by number. Only the app's own processes appear, the signal fails, and killing the first process ends all others.",
    dep: ["user-namespaces"]
  },
  "ipc-namespace": {
    s: "Separate tables of shared memory, semaphores and message queues, so apps cannot read or interfere with each other's shared objects.",
    d: "Classic shared-memory and message-queue interfaces use global tables identified by keys that any process of the same user can guess. A private namespace gives each sandbox its own tables with no overlap and automatic cleanup on exit. Shared memory is also a high-speed channel to helpers and the compositor, so where sharing is wanted it is done by passing handles, not by global keys. It is hard because applications that cooperate through these objects break, and because some objects live outside the namespace.",
    k: ["Private tables vs shared tables with per-key permissions: private tables remove the attack entirely; shared tables keep legacy software working and rely on every app setting permissions correctly.", "Named shared memory vs passed handles: handles cannot be guessed; names are convenient and exposed to any process that can open them."],
    p: ["Named shared memory in a world-accessible area leaks one app's data to another.", "Keys derived from predictable values let an app attach to a helper's segment."],
    v: "Create a shared memory object and a queue in one sandbox and try to open them by key from another. They must be invisible, and both disappear when the first sandbox exits.",
    dep: ["user-namespaces"]
  },
  "capability-dropping": {
    s: "Removing the fine-grained privileges that divide up what administrators can do, so the process holds none of them in any set and cannot regain them.",
    d: "Administrative power is split into capabilities such as mounting, changing ownership, binding low ports and loading modules. Each process has several sets: permitted, effective, inheritable, ambient and a bounding set that caps what can ever be gained. The sandbox clears all and tightens the bound so executed files cannot restore any. It is hard because the sets interact in non-obvious ways, because capabilities inside a user namespace are real within it, and because a few are so broad that holding one is nearly equivalent to administrator.",
    k: ["Empty sets plus a tight bounding set vs empty sets only: the bound prevents regaining through executables and costs nothing; sets alone depend on other flags.", "Keep a few narrow capabilities for the helper vs none: a narrow capability avoids a broker call and adds a thing to defend."],
    p: ["Ambient or inheritable sets remain populated and are inherited by children that gain rights on exec.", "A single broad capability is retained for one feature and is enough to defeat the rest of the sandbox."],
    v: "Read the capability sets of the running target and all helpers. All five must be empty or exactly the documented list, and a test executing a program with file capabilities must not gain any.",
    dep: ["user-namespaces"]
  },
  "mandatory-access-control": {
    s: "A kernel policy engine that checks operations against rules the process cannot change, on top of ordinary ownership permissions.",
    d: "Hooks placed at security-relevant points in the kernel, such as opening files, connecting sockets and sending signals, call a loaded policy module for a verdict. Rules are set by the administrator or platform and apply regardless of the process's own rights, which is why a compromised app with the file owner's permissions is still stopped. It covers operations namespaces do not, such as which executable may be run. It is hard because the policy is large, because coverage depends on which hooks the kernel provides, and because it adds an independent source of denials to debug.",
    k: ["Module-enforced policy plus namespaces vs namespaces alone: layering catches things the view missed and doubles the rules to maintain; namespaces alone are simpler and less complete.", "Enforcing from first boot vs permissive then enforcing: immediate enforcement is safe and breaks early mistakes; a permissive phase gives time to learn and often never ends."],
    p: ["Policy in permissive mode logs denials and enforces nothing, and is left that way in production.", "Hooks do not cover a newer kernel interface, so operations through it are unchecked."],
    v: "Confirm the module is in enforcing mode, then perform an operation the policy forbids using a file the process owns. It must be denied even though ordinary permissions allow it.",
    dep: ["kernel-audit-hooks"]
  },
  "resource-control-groups": {
    s: "Kernel groupings of processes with enforced limits and accounting for memory, CPU, I/O and process counts, applied to each sandbox as a unit.",
    d: "Each sandbox is placed in its own group with ceilings on memory, number of tasks, CPU share and disk bandwidth, plus accounting for monitoring. Limits cover every process in the group at once, including children, and the group can be frozen, killed as a unit or inspected for pressure. They stop denial of service from a runaway app and give per-app charts. It is hard because limits interact with page cache and shared memory accounting, and a group that exceeds memory may be killed in a way the app sees only as a crash.",
    k: ["Hard limits with kill vs soft limits with reclaim pressure: kills are certain and abrupt; soft limits keep apps alive and let them degrade other work.", "One group per app vs per helper: per app is simple; per helper allows different ceilings and more bookkeeping."],
    p: ["Group limits are set on memory but not on swap or the task count, so the machine thrashes or exhausts process slots.", "Shared memory created by one app is charged to a different group, so limits miss it."],
    v: "Run an allocation stress test and a fork storm inside the group. Memory use must plateau at the ceiling, process count must stop at its limit, and an unrelated app's latency must not degrade.",
    dep: ["user-namespaces"]
  },
  "kernel-surface-reduction": {
    s: "Making less of the kernel reachable from the sandbox, by removing features, unloading modules and disabling interfaces no confined app needs.",
    d: "Most escapes use kernel vulnerabilities, so anything the process cannot reach cannot be exploited. Measures: compile out unused drivers and filesystems, forbid loading modules, restrict information interfaces that leak addresses, deny unusual protocols and disable unprivileged access to risky features. It works together with the filter and mandatory rules. It is hard because the kernel is shared with the host and other uses, because features are useful to someone, and because an interface removed from the build cannot be restored by a policy mistake, but also cannot be offered later.",
    k: ["Remove at build time vs deny at run time: removal is permanent and removes bugs completely; run-time denial is flexible and depends on the denial being complete.", "Hide kernel addresses and details vs leave them for tooling: hiding makes exploitation harder and profiling harder."],
    p: ["A rarely used driver remains enabled because one device needs it and gives attackers a path into the kernel.", "Information files expose kernel addresses, defeating address randomization."],
    v: "List the kernel interfaces reachable from a sandboxed process using an attack-surface scanner or a call coverage trace. Each reachable interface needs a recorded reason, and unlisted ones must be unreachable.",
    dep: ["syscall-filter", "mandatory-access-control"]
  },
  "memory-protections": {
    s: "Hardening for process memory such as non-executable data, randomized layout, guard pages and control-flow checks, which make exploiting a bug harder.",
    d: "Data pages are not executable and code is not writable. Address layouts are randomized per process so attackers cannot hard-code addresses. Stack guards and forward-edge control-flow checks stop common hijacks. Kernel counterparts include zeroing freed memory and isolating user-space access. They do not stop bugs; they raise the cost of using them. It is hard because they cost performance and compatibility, because just-in-time code needs exceptions, and because each protection has known bypasses that only work in combination.",
    k: ["Enable all by default vs per profile: defaults protect everyone and break odd software; per-profile control fits needs and leaves some apps unprotected.", "Strict no write-and-execute rule vs allow for code generators: strict removes the easiest injection route; code generators then need isolated helpers."],
    p: ["Randomization is predictable because helper processes are cloned from one template and share a layout.", "An app disables protections on its own executable to run a legacy library."],
    v: "Check a running target's mappings and confirm no region is both writable and executable, that two launches have different layouts, and that a test overflow into a guard page faults.",
    dep: ["exec-and-loader-controls"]
  },
  "hardware-isolation-features": {
    s: "Processor and platform features that back software isolation, such as privilege rings, memory tagging, page-table isolation and isolated execution environments.",
    d: "The sandbox's guarantees ultimately rest on the processor enforcing separate address spaces and privilege levels. Newer features add pointer authentication, memory tagging to catch overflows, and virtualization-based isolation for the most sensitive helpers. Mitigations for speculative-execution leaks exist as well, and some are expensive. It is hard because hardware behavior changes between generations, because side channels leak between processes that are logically isolated, and because depending on a feature means refusing to run where it is missing.",
    k: ["Use virtualization for the most exposed helpers vs process isolation: virtualization has a smaller shared kernel surface and costs memory and start-up; process isolation is light and shares the whole kernel.", "Require a feature vs use it when present: requiring is safe and excludes older hardware; optional use gives uneven protection that is hard to reason about."],
    p: ["Speculative-execution mitigations are disabled for speed and the sandbox no longer separates secrets.", "A feature is assumed present on a device that lacks it, and protection silently does nothing."],
    v: "Query the platform for each feature the design depends on at start-up and refuse to run if one is missing. Run a published side-channel test between two sandboxes and confirm the mitigation reduces the leak to the documented level.",
    dep: ["memory-protections"]
  },
  "kernel-audit-hooks": {
    s: "Points in the kernel where security decisions are reported to a log, which provide the record of denials and sensitive actions.",
    d: "Hooks generate structured records for denied operations, changes to policy, process creation, and rule matches, including the process, object, operation and reason. Records go to a buffer read by a daemon, with rate limits to prevent flooding. The same hook points are where mandatory access rules attach. It is hard because logging every allowed action is too costly, because rate limits drop events during attacks, and because the records identify kernel objects in ways that need translation to app-level names.",
    k: ["Log denials only vs log allows too: denial-only is cheap and shows what failed; including allows enables learning and forensics at much greater volume.", "Rate limit to protect the system vs capture everything: limits keep the machine responsive and lose evidence in a burst."],
    p: ["The audit buffer overflows during a noisy denial storm and the relevant record is lost.", "Log records lack the app identity because only a process number is recorded and it was reused."],
    v: "Trigger a known denial and confirm a record appears within a second containing process, app identity, operation and object. Trigger a thousand quickly and confirm the count of dropped events is reported.",
    dep: []
  },
  "denial-logging": {
    s: "Recording every operation the sandbox refused, with enough context to tell a legitimate missing permission from an attack.",
    d: "Each denial yields a record with timestamp, app, process, operation, target and the rule or layer that decided. Records are deduplicated and counted, because a loop can emit millions. Developers read them to extend profiles, and the platform reads them to detect attacks. It is hard because the layers produce different formats, because the same missing rule can appear as different errors in different layers, and because logs can reveal user file names.",
    k: ["Structured records vs text lines: structured records are queryable and need a schema shared by layers; text is easy to emit and hard to analyze.", "Log in the denying layer vs aggregate in the broker: the layer knows the exact rule; aggregation gives one view with translation loss."],
    p: ["The error the app saw is generic, and the log is not consulted, so developers loosen the profile blindly.", "Denial records include full paths of user documents and are uploaded verbatim."],
    v: "Make an app attempt a forbidden open, a connect and a signal. Each must produce one record naming the layer and rule, deduplicated if repeated, and none may contain content from the files.",
    dep: ["kernel-audit-hooks", "syscall-filter"]
  },
  "audit-event-pipeline": {
    s: "The path denial and policy-change records take from kernel to storage and analysis, with ordering, integrity and retention rules.",
    d: "Kernel records reach a daemon, which enriches them with app names, signs or chains them for tamper evidence, forwards them to a local store, and sends summaries or alerts to central systems. Brokers add their own events: grants, revocations, prompts. Retention is bounded by size and privacy rules. It is hard to keep ordering across sources, to protect the pipeline from the app generating floods, and to keep logs of a compromised device trustworthy after the compromise.",
    k: ["Local tamper-evident chain vs remote streaming: a chain proves nothing was removed after the fact; streaming moves evidence off the device before an attacker can erase it.", "Full detail locally, summaries remotely: protects privacy and bandwidth and may omit exactly the detail an investigation needs."],
    p: ["Flooding the pipeline with benign denials pushes out the interesting event.", "Timestamps from different sources disagree and obscure the order of events."],
    v: "Generate a mix of denial and broker events, then verify the stored sequence is complete, ordered and chained. Delete one record from the store and confirm verification fails.",
    dep: ["denial-logging", "kernel-audit-hooks"]
  },
  "denial-triage-tooling": {
    s: "Tools that turn raw denial records into a readable cause and a suggested change, so developers fix profiles instead of disabling them.",
    d: "A tool groups records by app and rule, maps kernel objects to app terms, shows which layer denied, and proposes either an app change, a profile addition or a portal call. It warns when a proposed rule is broad. It can replay an app run against a candidate profile. It is hard because a single failure can produce a chain of denials from different layers, and because the easiest suggestion, allow it, is usually the wrong one.",
    k: ["Suggest the narrowest rule vs the working rule: narrowest preserves least privilege and may need several iterations; working rule unblocks quickly and widens the profile.", "Recommend a portal call vs a permission: portals fit the model and need code change; permissions are quick and permanent."],
    p: ["Developers accept every suggestion until the profile permits everything, which defeats the sandbox.", "The tool shows the last denial in a chain, not the first cause."],
    v: "Feed a recorded failing run and confirm the tool names the first denial, the layer, a narrow suggested rule, and flags a deliberately broad suggestion as such.",
    dep: ["denial-logging", "learning-mode"]
  },
  "sandboxed-crash-reporting": {
    s: "Capturing crashes of a confined process without giving the reporter rights to read the app's files or arbitrary memory.",
    d: "A crash handler inside the sandbox writes a minimal dump, only the crashing process's own registers and selected memory, to a place the broker can read, or hands the data to the broker through the channel. A separate process outside builds the report, strips data and uploads it. The handler must work when the process is corrupted and with the filter and view restricting what it can do. It is hard because a dump contains user data, because the usual debug interfaces are denied, and because a crash from a filter violation looks like any other.",
    k: ["In-process handler vs out-of-process observer: in-process is simple and unreliable after corruption; an observer survives but needs debug-like rights over the target.", "Full dump vs minimal report: full dumps help diagnosis and hold user data; minimal reports are privacy-safe and slow down fixing."],
    p: ["Handler needs a system call the filter blocks, so a crash while handling the first crash loses everything.", "Dump files are left in a location readable by other apps."],
    v: "Crash a confined test app deliberately and confirm the report arrives with the stack and signal, includes no files from the app's container, and records that a filter violation caused it when it did.",
    dep: ["broker-channel", "debug-attach-denial", "telemetry-privacy"]
  },
  "crash-symbolication": {
    s: "Turning raw addresses in crash reports into function names and lines, using symbol files matched to the exact build.",
    d: "Reports carry module identifiers, load addresses and offsets. A symbol server matches them to stored symbol data, and a processor groups reports by a signature built from top frames. In a sandbox, address randomization and a private view mean the reporter must record load addresses explicitly. It is hard because symbol files must be kept for every release, because inlining and optimization blur frames, and because reports from apps in a sandbox often show the same abort in the filter handler, hiding the real cause.",
    k: ["Symbolicate on the device vs on a server: device symbolication exposes symbols and costs space; server symbolication keeps builds private and requires uploaded symbols.", "Group by top frame vs full stack: top frame merges many causes; full stack splits one cause into many groups."],
    p: ["Symbol files for a hotfix build were not stored, and reports from it cannot be read.", "Reports are grouped by the handler's frames and every crash looks identical."],
    v: "Crash a known function in a release build and confirm the processed report shows that function and file, and that two crashes from the same cause land in one group.",
    dep: ["sandboxed-crash-reporting"]
  },
  "telemetry-privacy": {
    s: "Rules that keep diagnostics from the sandbox, such as paths, crash data and denials, from revealing what the person was doing.",
    d: "Records pass through filters that drop or hash file names, strip memory contents, round counters and aggregate over many devices before upload. Collection is opt-in or clearly disclosed, retention is bounded, and the app cannot read or write the telemetry channel. The sandbox's own telemetry can show which apps are used and what documents exist, so it needs the same care as app data. It is hard because useful debugging detail is exactly the sensitive detail, and because pseudonymous identifiers can often be linked back.",
    k: ["Collect less vs scrub after collecting: collecting less is the strongest protection and limits diagnosis; scrubbing keeps rich data briefly and relies on filters being right.", "Per-device identifiers vs aggregate-only counts: identifiers allow follow-up on a specific crash and enable tracking; aggregates are anonymous and cannot answer specific questions."],
    p: ["A path in a denial record contains a person's name or a document title and is uploaded.", "Telemetry allowed through the sandbox's channel can be used by the app as a covert channel."],
    v: "Run a session with a known sensitive file name and token, then inspect everything queued for upload. Neither the name nor the token may appear, and the user setting for opt-out must stop all upload.",
    dep: ["denial-logging"]
  },
  "violation-alerts": {
    s: "Notifications raised when the sandbox sees signs of an escape attempt, such as repeated blocked calls to dangerous interfaces, rather than ordinary missing permissions.",
    d: "Rules separate noise from attack signals: attempts to mount, load modules, attach to other processes, call known-vulnerable interfaces, or modify their own policy. Matching events raise alerts locally, may kill the app, and are sent to central analysis. Thresholds and context avoid alerting on benign libraries probing for features. It is hard because attacks and compatibility probes look alike, because alert volume decides whether anyone reads them, and because a clever attacker stays below thresholds.",
    k: ["Kill the app on a high-confidence signal vs alert only: killing stops an attack at once and punishes misfires; alert-only is safe and slower.", "Alert per event vs per pattern: per event is fast and noisy; per pattern is quiet and delays response."],
    p: ["A compatibility probe on startup in a popular library fires thousands of alerts and is muted.", "Alerts lack app version, so triage cannot tell old vulnerable builds from current ones."],
    v: "Run a script that mimics an escape attempt, with a mount, a module load and an attach, and confirm one alert appears with the app, version and attempt list, while a normal app startup raises none.",
    dep: ["audit-event-pipeline", "denial-logging"]
  },
  "sandbox-profiling": {
    s: "Measuring how much time and memory the sandbox's mechanisms cost per call, per launch and per request, so overhead can be found and reduced.",
    d: "Profiles break down launch time into namespace creation, mount setup, policy load and exec; and run time into filter evaluation, broker round trips and copies. Tracing tools must work despite the restrictions, so profilers run in the broker or with special profiles. Results guide choices such as caching compiled policy, reusing warm helpers and batching broker calls. It is hard because overhead is spread thin across millions of calls, because profilers themselves need denied rights, and because results depend on workload.",
    k: ["Profile in place with a relaxed profile vs in the real profile: relaxed profiles allow tooling and change the cost; real profiles are accurate and hard to instrument.", "Sampling vs tracing every call: sampling is cheap and misses rare slow calls; tracing finds them and distorts timing."],
    p: ["Measurement done with learning mode on includes logging costs and misstates the enforced overhead.", "Only median times are tracked and the long tail from prompts and cold starts is missed."],
    v: "Launch the same app ten times with and without the sandbox and compare start-up time distributions. Report median and 99th percentile of added time and a per-step breakdown that sums to the total.",
    dep: ["sandbox-bootstrap", "syscall-filter"]
  }
});
