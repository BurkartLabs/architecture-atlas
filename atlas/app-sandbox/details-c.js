// Details for the application sandbox plate, part 3: broker and launch, system call limits.
ATLAS.details("app-sandbox", {
  "broker-process": {
    s: "The trusted, privileged process that holds real authority, performs actions for confined apps, and decides each request against policy.",
    d: "One broker typically serves one app instance or one app family. It starts before the target, owns the channel, holds the handles and files the target may eventually receive, and outlives it for cleanup. It runs with more rights than the target, so it is kept small, and often itself confined to what it needs. It is hard because every feature moves code into the most trusted place, and the pressure to add convenience there works against the whole point of the split.",
    k: ["One broker per app vs one shared broker: per-app brokers isolate failures and cost memory and start-up; a shared broker is efficient and a compromise there reaches every app.", "Broker in-process helper vs separate service: separate processes have a real boundary; a helper thread shares memory and offers no isolation."],
    p: ["Broker code grows convenience features until it contains a full parser for each format the app uses.", "The broker keeps credentials or open handles from earlier requests and leaks them to later ones."],
    v: "List the broker's own permissions and open handles at runtime. Confirm each has a reason in the design, and that a crash of the target leaves the broker serving no one and cleaning up, rather than keeping handles.",
    dep: ["broker-minimal-surface", "broker-channel"]
  },
  "target-launcher": {
    s: "The component that creates the confined process: it prepares restrictions, starts the app's code inside them, and hands over only the channel and the permitted handles.",
    d: "The launcher forks or spawns a child in a prepared state, applies namespaces, drops privileges, loads the filter, then executes the application. Ordering matters: restrictions that need privilege must be applied before the drop, and none may be removable afterward. Arguments, environment and inherited descriptors are scrubbed. It is hard because there are many steps, each depending on kernel features, and one skipped step must produce a failed launch rather than a normal one.",
    k: ["Apply restrictions before exec vs after the runtime starts: before exec means no untrusted code runs unconfined; after is easier for runtimes that need privileged start-up and opens a window.", "Spawn fresh vs fork from a warm template: fresh processes are clean; templates start faster and share address layout and state."],
    p: ["A file descriptor left open across exec gives the app access to something never intended.", "Environment variables from the broker, such as library paths, are inherited and let the app alter loading in a privileged helper."],
    v: "Launch a test app that dumps its own open descriptors, environment, credentials and mounts. Compare against an expected minimal list; any extra descriptor or variable is a failure.",
    dep: ["sandbox-bootstrap", "privilege-drop", "policy-loading"]
  },
  "sandbox-bootstrap": {
    s: "The ordered sequence of steps that turns a plain process into a confined one before any untrusted instruction executes.",
    d: "Typical order: create namespaces, build the filesystem view, set resource limits, drop capabilities, set the no-new-privileges flag, load the syscall filter, close extra descriptors, then execute. Some steps must run in the new process, some in the parent. The bootstrap code runs while still privileged and operates on attacker-influenced inputs such as the app's manifest, so it must be minimal and carefully ordered. It is hard because a failure at any step must abort, and some steps do not report failure clearly.",
    k: ["Single early-stage binary vs steps spread across the launcher: a dedicated bootstrap is small and auditable; spreading steps is flexible and makes the order hard to verify.", "Fail hard on any error vs best effort: hard failure is safe and brittle across kernel versions; best effort keeps apps running with unknown protection."],
    p: ["A step that fails silently, such as a mount that did not happen, leaves the process confined less than the tests assumed.", "Filter loaded before the final exec blocks calls the exec itself needs, causing intermittent launch failures that get fixed by loosening the filter."],
    v: "After bootstrap, from inside the process, run a self-check that tries each forbidden action: a mount, a raw socket, an unlisted file, a trace attach. Every one must fail before the app's own code starts.",
    dep: ["user-namespaces", "capability-dropping", "syscall-filter", "filesystem-view-construction"]
  },
  "privilege-drop": {
    s: "Permanently removing the rights the launcher held, so the confined process runs as an unprivileged identity with no way to get them back.",
    d: "The launcher switches to a dedicated user and group, clears supplementary groups, empties the capability sets, and prevents regaining privilege through executable files. All of this must happen in the right order and irreversibly. Per-app user identities also let ordinary file permissions separate apps. It is hard because partial drops are common bugs, such as dropping the user but not the groups, and because user mapping inside namespaces makes identity differ between views.",
    k: ["Per-app unique identity vs shared sandbox identity: unique identities give ordinary permissions between apps and need identity allocation; a shared identity is simple and lets apps touch each other's files.", "Drop capabilities by clearing sets vs relying on a non-root user: explicit clearing is robust against setuid surprises; a non-root user alone is not enough."],
    p: ["Supplementary groups from the broker's identity remain attached, granting file access the app should not have.", "The process keeps the right to change its identity, so a flaw lets it become privileged again."],
    v: "Inside the confined process print real, effective and saved identities, group list and capability sets. All must be the app's own, with empty capabilities, and an attempt to change identity must fail.",
    dep: ["capability-dropping", "no-new-privileges"]
  },
  "target-identity-binding": {
    s: "Tying a running process to the application identity it was launched as, so the broker knows who is on the other end of a channel without trusting claims.",
    d: "The identity is recorded at launch and obtained at request time from the kernel through the channel's peer credentials, not from message contents. Process identifiers can be reused, so identity is bound to something stable, such as a kernel handle to the process or the channel itself. It lets the broker find the right profile and grants. It is hard because identity must follow helper processes, survive forks, and not be spoofable by a process that is a different app with the same user identity.",
    k: ["Peer credentials from the kernel vs identity sent in messages: kernel-supplied identity cannot be forged; message fields are easy to implement and trivial to fake.", "Bind to process id vs to a stable handle: process ids are simple and reusable after exit; handles are exact and not available everywhere."],
    p: ["A process id is checked and the process exits and is replaced before the action, so the broker acts for the wrong app.", "A helper started by the app is treated as the app and receives its grants without being confined the same way."],
    v: "Have a malicious test app connect and claim another app's identifier in the message. The broker must use the kernel-reported identity and ignore the claim. Restart the target repeatedly to confirm no identity reuse.",
    dep: ["broker-channel", "app-identity-and-signing"]
  },
  "helper-process-types": {
    s: "Distinct kinds of confined helper process, such as renderers, decoders and plugin hosts, each with a profile fitted to what it needs.",
    d: "Rather than one large confined app, a design splits it: a network helper, a decoder, a renderer, a plugin host, each with a different policy. The most exposed work, parsing untrusted input, runs with the least rights, and privileged work stays in a different process reached through the broker. This limits the damage from one flaw. It is hard because splitting adds IPC, memory and complexity, the helpers need to cooperate, and each needs its own tested profile.",
    k: ["Many specialized helpers vs few general ones: specialization gives tight profiles and costs processes and design effort; general helpers are simple and carry the union of their needs.", "Helpers brokered by the main app vs by the platform broker: platform brokering is stricter; app brokering is flexible and trusts app code."],
    p: ["All helper kinds share one profile for convenience, so the decoder holds the network permission it never needed.", "Helpers trust the main process's messages, so a compromised main process drives them."],
    v: "Enumerate helper kinds and their profiles. For each, run its documented attack test, such as a decoder opening a socket, and confirm denial, and confirm no two kinds share an identical profile without justification.",
    dep: ["profile-templates", "target-launcher"]
  },
  "resource-limit-setup": {
    s: "Setting ceilings on memory, processes, file descriptors, CPU time and file size for the confined process so it cannot exhaust the machine.",
    d: "Limits are applied at launch through per-process limits and resource control groups, and cover memory, number of threads, open files, disk quota and CPU share. They protect other apps and the broker from runaway or malicious consumption, and they bound the damage of an exploited process. Limits that kill the process are blunt; softer limits throttle. It is hard to size limits: too low breaks legitimate peaks, too high protects nothing, and some resources, such as GPU memory, have no good limit mechanism.",
    k: ["Hard kill on limit vs throttle: killing is predictable and loses work; throttling keeps the app alive and can hide runaway behavior.", "Static limits per profile vs adaptive limits from observed use: static limits are simple and reviewable; adaptive ones fit better and are harder to reason about."],
    p: ["A limit on processes but not threads, or on memory but not shared memory, leaves an easy way to exhaust the system.", "Limits are set after the process has started and may already have exceeded them."],
    v: "Run a test that allocates memory, spawns processes and opens files in a loop inside the sandbox. Each resource must stop at its configured ceiling with a clean error, and the broker and other apps keep running.",
    dep: ["resource-control-groups", "sandbox-bootstrap"]
  },
  "process-supervision": {
    s: "Watching confined processes for exit, crash and misbehavior, and cleaning up their grants, handles and files when they end.",
    d: "The broker or a supervisor tracks each target and its helpers as a group. On exit it closes channels, revokes temporary grants, releases devices, removes scratch space and records the status. It can restart, kill or freeze the group. Killing must cover every child, including double-forked ones, which process groups and namespaces make reliable. It is hard because cleanup must be complete even on crashes, and a supervisor that crashes itself must not leave a sandbox without a watcher.",
    k: ["Group kill through the process-ID namespace vs tracking children individually: namespace teardown kills everything inside reliably; tracking depends on never missing a fork.", "Automatic restart vs leaving the app down: restart is friendlier and can loop on a crash that is really an attack."],
    p: ["A child escaping the process group survives the app and keeps a device open.", "Scratch directories from crashed apps accumulate until the disk fills."],
    v: "Kill the target abruptly while it holds a camera stream, a temporary file and a child process. Confirm all three are gone, the indicator clears and the supervisor records the cause.",
    dep: ["pid-namespace", "grant-revocation"]
  },
  "broker-minimal-surface": {
    s: "The discipline of keeping the broker's code, dependencies and message types as small as possible, since it is the part that must be trusted.",
    d: "Every line in the broker is code that runs with authority on attacker-influenced input. Minimizing it means few message types, no parsing of complex formats, few dependencies, memory-safe or heavily checked code, and the broker itself confined to the least it needs. Complex jobs go to separate lower-privileged helpers. It is hard because convenience features keep arriving, and because a smaller broker pushes complexity into helpers and the app, which must then interoperate.",
    k: ["Move work out of the broker into confined helpers vs keep it central: helpers contain bugs and add IPC; central code is faster to build and enlarges the trusted base.", "Accept fewer features vs a rich service API: fewer features keep review feasible and frustrate app developers."],
    p: ["A third-party library with a broad parser is linked into the broker for one small feature.", "Debug endpoints added during development remain reachable in release builds."],
    v: "Measure the broker's code size, dependency count and message types per release and compare to a recorded budget. Any increase requires a written reason, and a review confirms each message is reachable only from permitted callers.",
    dep: ["message-schema-validation"]
  },
  "syscall-filter": {
    s: "A program loaded into the kernel that inspects each system call the process makes and allows, denies or traps it, shrinking the kernel code the process can reach.",
    d: "The filter runs on every call entry with the call number and arguments. A policy lists permitted calls, usually a few dozen of hundreds, with argument constraints for dangerous ones. Denied calls return an error, kill the process or raise a signal. It cuts reachable kernel code and removes whole classes of vulnerability. It is hard because runtimes and libraries use calls in version-specific ways, so allow lists break across updates, and the filter cannot dereference memory pointed to by arguments.",
    k: ["Allow list vs deny list: allow lists fail safe and break when libraries change; deny lists are easy to start and miss any call not named.", "Kill on violation vs return an error: killing exposes attacks and breaks probing code; returning an error lets the app's fallbacks run and hides attempts."],
    p: ["Filter allows a call with a wide argument range, such as an arbitrary control request, that reaches a driver with known flaws.", "A library update adds a new system call and every app using it crashes in the field."],
    v: "From inside the sandbox attempt a call outside the allow list, such as a mount or a module load. The attempt must fail in the stated way and produce an audit record naming the call.",
    dep: ["filter-program-compiler", "abi-and-arch-checks", "no-new-privileges"]
  },
  "filter-program-compiler": {
    s: "Generates the filter program from a readable list of allowed calls and argument rules, optimizing it so the check stays cheap.",
    d: "The compiler takes high-level rules, resolves call names to numbers per architecture, orders checks so common calls match first, builds jump tables or binary search trees, and emits the kernel's filter bytecode. It validates that the result is within kernel limits and has a default action. It is hard because filter programs are tiny, strictly limited machine code where an off-by-one changes policy, and performance depends on layout since the filter runs on every call.",
    k: ["Hand-written filter code vs generated from rules: generated is reviewable and uniform; hand-written can be faster in a specific case and is easy to get wrong.", "Optimize for common calls vs flat evaluation: ordering and trees cut overhead on hot calls and make the program harder to read when debugging."],
    p: ["Optimizer reorders rules in a way that changes which rule matches first for overlapping conditions.", "Call numbers differ between architectures and the table for one is reused for another."],
    v: "Test the compiled filter against a reference evaluator over every call number and a set of argument values per call for each supported architecture. All verdicts must be identical.",
    dep: ["policy-compiler"]
  },
  "argument-inspection": {
    s: "Constraining the numeric arguments of allowed system calls, such as flags and control request codes, so a permitted call cannot be used for a forbidden purpose.",
    d: "Some calls are safe in one mode and dangerous in another: memory mapping with execute rights, socket creation of a certain family, control requests to a device. The filter compares register arguments against allowed values or masks. It cannot follow pointers, so strings and structures in memory are out of reach, which is why path rules belong in other layers. It is hard because the set of dangerous values is large, flags combine, and checking a pointer argument is subject to races since memory may change after the check.",
    k: ["Constrain values tightly vs allow the call broadly: tight constraints cut attack surface and break when libraries use new flags; broad allowance is stable and weak.", "Filter in the kernel vs trap and check in a supervisor: kernel filters are fast and limited to registers; supervisor checks can read memory and are slower and race-prone."],
    p: ["Check on a pointed-to structure is made, then the app changes it before the kernel reads it.", "Flag mask allows a harmless value and also the bit that enables a dangerous behavior."],
    v: "For each constrained call, run one case with an allowed argument and several adjacent forbidden values, such as executable memory mapping flags. Only the allowed case may succeed.",
    dep: ["syscall-filter"]
  },
  "abi-and-arch-checks": {
    s: "Verifying that a call arrives through the architecture and calling convention the filter was written for, so another entry mode cannot bypass it.",
    d: "Processors can run code in several modes, such as legacy compatibility modes, and each has its own call numbers. A filter keyed on numbers from one mode can be bypassed by switching to another where the same number means a different, forbidden call. The filter first checks an architecture identifier and rejects anything unexpected, and sometimes rejects flag bits that select alternate conventions. It is hard because a new mode added to a kernel, or a new architecture, silently reopens the hole.",
    k: ["Reject unknown architectures vs support all with separate tables: rejecting is strong and breaks emulated or compatibility software; separate tables support more and quadruple the maintenance.", "Check in every filter vs rely on kernel configuration: per-filter checks protect against configuration; kernel configuration is global and invisible to the sandbox."],
    p: ["Filter tested only on the native mode is bypassed by a 32-bit entry mode on a 64-bit kernel.", "Reserved bits in call numbers select alternate tables the filter does not map."],
    v: "Run an exploit-style test that issues a forbidden call number through each supported alternate entry mode. Every attempt must be denied exactly as in the native mode.",
    dep: ["syscall-filter"]
  },
  "trap-and-emulate": {
    s: "Sending selected calls to a supervisor that decides on the app's behalf, so cases too complex for a static filter can be handled with full context.",
    d: "The filter can route a call to the broker, which examines arguments, including memory contents, and either performs the action itself, returns a result to the app, or refuses. This allows path-aware file opens and flexible policies without giving the app the rights. It is slower, and because the supervisor and the kernel do not see the same state at the same time, it has a classic check-then-use race. It is also hard to make the emulation faithful, since the app expects normal call semantics including errors and signals.",
    k: ["Supervisor emulates the call vs allows after approval: emulation closes the race by acting itself and must replicate semantics; approval is simple and unsafe against changed arguments.", "Use for few rare calls vs for hot paths: rare calls are fine; hot paths pay a context switch per call."],
    p: ["Supervisor reads the path from the app's memory, approves, and the kernel reads a different path after the app rewrote it.", "Emulated result differs subtly from the real one, so programs misbehave in ways hard to trace."],
    v: "Run a racing test where one thread flips a path argument between the supervisor's check and its use. The final action must always follow the approved value or be refused, never the swapped one.",
    dep: ["syscall-filter", "request-authorization", "broker-channel"]
  },
  "debug-attach-denial": {
    s: "Preventing the confined process from attaching a debugger to, tracing or reading the memory of other processes, including its own helpers or the broker.",
    d: "Debug interfaces let one process read and write another's memory and registers, making them a powerful escalation. Sandboxes deny the calls, restrict who may attach to whom through the access-control rules, and make confined processes non-dumpable so others cannot inspect them. Same-user processes are the main concern, since ordinary permissions allow attaching to them. It is hard because developer tools and crash handlers legitimately use these interfaces, so exemptions must be narrow and never ship in release profiles.",
    k: ["Deny debug interfaces entirely vs allow for the same sandbox: denying is safe and blocks in-process crash tools; allowing in-group helps debugging and expands what a flaw can reach.", "Developer override via profile vs a build flag: a profile override is flexible and easy to leave on; a build flag is harder to enable by accident."],
    p: ["Same-user apps can read each other's memory because only the user identity was checked.", "A crash reporter given debug rights is used as a general memory reader."],
    v: "From one confined app, try to attach to a second running app and to read its memory by process identifier. Both must be denied, and the audit log must record each attempt.",
    dep: ["syscall-filter", "mandatory-access-control"]
  },
  "no-new-privileges": {
    s: "A one-way process flag that stops executed programs from gaining rights through special executable bits or file capabilities.",
    d: "Once set, it is inherited by every child and cannot be cleared. Programs with elevated-execution bits, or file-attached capabilities, run without those rights. It makes loading an unprivileged filter safe, since otherwise a filter could be used to confuse a privileged program, and it removes a whole route to escalation. It is cheap and nearly always correct. It is hard only because it breaks legitimate in-sandbox use of privileged helpers, which must instead live outside and be reached through the broker.",
    k: ["Always set vs set only for untrusted profiles: always setting is uniform and breaks intentional use; selective setting is flexible and a place for mistakes.", "Rely on it alone vs combine with an empty capability set: the flag blocks gaining rights at exec, and an empty set removes rights held already; both are needed."],
    p: ["The flag is applied after a privileged program already ran inside the sandbox, so the state was already compromised.", "Order mistake: the filter is loaded without the flag and requires privilege that the sandbox then has to keep."],
    v: "Inside the sandbox, run an executable with an elevated-execution bit set and confirm it runs with the caller's rights only. Then try to clear the flag and confirm it fails.",
    dep: ["capability-dropping"]
  },
  "exec-and-loader-controls": {
    s: "Rules on which programs the confined process may run and how the dynamic loader finds libraries, closing paths that load attacker-chosen code.",
    d: "Policies can forbid executing anything outside the app bundle, require executable pages to come from signed or read-only files, and block library search paths and preload variables controlled by the app. Memory mappings with both write and execute permission can be denied. This stops downloaded code from running and limits the use of the app as a launcher for tools. It is hard because just-in-time compilers and plugin systems need writable-then-executable memory, and because loaders look in many places.",
    k: ["Execute only from the signed bundle vs allow downloaded code: bundle-only blocks a class of malware and prevents legitimate plugins; allowing downloads supports extension and any payload.", "Forbid write-plus-execute mappings vs allow for compilers: forbidding stops simple code injection and breaks code generators, which then need a separate helper."],
    p: ["Library search path includes a user-writable directory so an app loads a planted library.", "Loader environment variables are honored in a helper that runs with more rights than the app."],
    v: "Place an executable in the app's own data directory and try to run it, then try to map a file as executable from there. Both must fail while code from the signed bundle runs normally.",
    dep: ["read-only-binds", "syscall-filter", "app-identity-and-signing"]
  },
  "credential-restrictions": {
    s: "Limits on the process changing its identity, groups, scheduling priority or other attributes that affect other processes or the system.",
    d: "Even unprivileged processes can adjust some attributes: signals to others of the same user, priorities, limits, session membership. The sandbox restricts which processes can be signaled, forbids changing identity, fixes the session and process group, and locks personality settings. These rules prevent a confined process from affecting its siblings or the supervisor. It is hard because the list of attributes is long, because signals are used legitimately between an app's own helpers, and because the process-ID namespace helps only if it is set.",
    k: ["Isolate by identity and namespace both vs just namespace: both give two independent protections; namespace alone fails if a process is given a handle outside.", "Allow signals within the app group vs deny all: group signals support helper management; denying all is tight and breaks standard shutdown patterns."],
    p: ["The app sends signals to processes of the same user outside its sandbox, terminating them.", "Scheduling priority raised by the app starves the broker and the interface."],
    v: "From the sandbox, send a signal to a process outside it, change process priority and try to join another session. All must be denied or have no effect, and permitted in-group signals must work.",
    dep: ["pid-namespace", "capability-dropping"]
  }
});
