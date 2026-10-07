// Details for the endpoint detection and response plate, part D: user-space sensors, agent core, tamper protection.
ATLAS.details("edr-agent", {
  "in-process-api-hooks": {
    s: "Small code stubs injected into running programs that intercept calls to system libraries, letting the agent see arguments and results that kernel sensors cannot interpret.",
    d: "The agent loads a library into target processes and patches entry points of selected functions so that a stub runs first, records the call, and may block it. This shows memory allocation with executable rights, process injection calls and decoded network buffers. It is easy to ship but sits in the attacker's own address space, where it can be removed. The difficulty is stability, since patching code in other people's processes crashes applications, and evasion by direct system calls or by restoring the original bytes.",
    k: ["User-space hooks vs kernel callbacks: user hooks see rich arguments and are easy to update; kernel callbacks are harder to evade and see less meaning.", "Hook everywhere vs a targeted process list: everywhere maximizes coverage and multiplies crash risk; a list limits risk and leaves the rest unseen."],
    p: ["A hooked function is called by an application with an unexpected calling convention and the application crashes.", "Malware reads a clean copy of the library from disk and restores the original bytes, removing the hook."],
    v: "Load a test application and call a monitored function with a known argument, and confirm a hook event with that argument; then remove the hook from inside the process and confirm the agent detects the missing hook.",
    dep: ["module-framework","sensor-blind-detection","event-schema"]
  },
  "dns-and-tls-metadata": {
    s: "Observations of name lookups and encrypted-connection setup, including names, certificates and handshake fingerprints, that reveal where programs connect without reading encrypted content.",
    d: "The agent captures DNS queries and answers, either from the resolver service, from network hooks or from a local proxy, and records process, name and returned addresses. For secure connections it reads the unencrypted handshake: requested server name, certificate details and client fingerprint, which identifies the program's network library. These feed indicator matching and beaconing detection. The difficulty is encrypted name resolution, which hides lookups from the network layer, and attributing queries made by a shared resolver to the real requester.",
    k: ["Collect at the resolver vs at the network layer: resolver collection gives names and the requester; network-layer collection sees all lookups and misses encrypted ones and attribution.", "Handshake fingerprinting vs certificate inspection only: fingerprints identify tools even with benign certificates; they are less stable across library versions."],
    p: ["Encrypted resolution inside a browser bypasses every name-based indicator.", "A shared local resolver reports its own identity as the source of every lookup."],
    v: "Resolve a test name from two different processes and open a secure connection, and confirm events attribute each lookup to its process and carry the server name and certificate fields.",
    dep: ["network-filter","indicator-matching","event-schema"]
  },
  "auth-and-session-events": {
    s: "Records of logons, privilege changes, credential use and session activity, giving the identity context that ties actions to a user and shows lateral movement.",
    d: "The agent subscribes to the OS's security event source and local authentication APIs to capture successful and failed logons by type (interactive, network, service), elevation events, account changes and remote session starts. Each event carries user, source address and logon identifier, which links it to the processes that follow. These are the raw material for lateral movement and credential misuse detections. The challenge is volume on servers, differing event semantics across OS versions and identity changes that obscure who really acted.",
    k: ["Read the OS audit log vs hook authentication directly: the audit log is stable and reflects what the OS decided; hooks see attempts earlier and cost more to keep correct.", "Collect all logon events vs only anomalous ones: all events enable later hunting; selective collection saves volume on servers and loses baselines."],
    p: ["Audit settings are off by default, so the events the detections need are never produced.", "A service account logging on thousands of times a minute floods the stream."],
    v: "Perform an interactive, a network and a failed logon on a lab host and confirm three events with correct type, user and source, and that processes started in the session carry its logon identifier.",
    dep: ["system-log-ingestion","process-entity-table","event-schema"]
  },
  "script-content-interface": {
    s: "A scanning interface offered by script hosts that passes the final, decoded script text to security software before it runs, defeating most obfuscation.",
    d: "Interpreters such as shells and macro engines can call a registered provider with the script buffer and its source name before executing it. The agent's provider scans the buffer with rules and models and returns allow or block. Because the text arrives after decoding, layered encoding and string tricks are undone. It covers dynamic evaluation too. Limits are the interpreters that do not support it, attackers who disable the interface in their own process, and size and speed constraints for large scripts.",
    k: ["Use the interpreter's interface vs hook the interpreter: the interface is supported and stable and only covers cooperating hosts; hooking covers more and is fragile.", "Block on match vs log and continue: blocking prevents the script; logging avoids disrupting administrators' legitimate scripts."],
    p: ["An attacker patches the interface in the interpreter's memory before running the payload.", "Legitimate administration scripts contain the same commands as attack tools and are blocked."],
    v: "Run a benign script that decodes and evaluates a string containing a test marker, and confirm the provider receives the decoded text with the marker and the event records the script source and host.",
    dep: ["module-framework","script-and-memory-detection"]
  },
  "system-log-ingestion": {
    s: "Reads the operating system's and applications' own logs, such as security audit, service and scheduler logs, and forwards relevant records as normalized events.",
    d: "A reader subscribes to log channels or tails log files, applies filters by source and identifier, parses records into the event schema and tracks a bookmark so it resumes without gaps or duplicates after restart. Logs add facts no sensor sees, like service installs and scheduled task creation. The difficulty is rotation and truncation, different formats and locales, log tampering by attackers (clearing logs is a detection itself) and the volume of verbose logs.",
    k: ["Subscribe to events vs tail files: subscription is structured and reliable; tailing is the only option for application logs and handles rotation badly.", "Forward raw lines vs parse on the agent: raw forwarding is simple and moves parsing cost to the cloud; parsing locally cuts volume and requires parser updates."],
    p: ["Bookmark loss after a crash causes thousands of old records to be re-sent as new events.", "An attacker clears the log and the only evidence is the missing records."],
    v: "Generate a service install and a log clear on a lab host, restart the agent mid-stream, and confirm each appears once as events, no duplicates after resume, and the clear raises its own detection.",
    dep: ["local-state-store","event-schema","os-abstraction-layer"]
  },
  "software-inventory": {
    s: "A periodic listing of installed software, versions, services, drivers, browser extensions and running agents on each machine, used for exposure and attack-surface queries.",
    d: "Collectors read package databases, uninstall registries, application directories and service lists, and send a compact diff against the previous inventory. The backend answers questions such as which machines run a vulnerable version. It is lower priority than detection and runs at low priority on a schedule. The difficulty is accuracy: software installed outside package managers, portable programs and renamed binaries are missed, and versions are parsed inconsistently across vendors.",
    k: ["Inventory by package records vs by file scan: package records are quick and miss manual installs; file scans find more and cost I/O.", "Send full inventory vs diffs: diffs save bandwidth and need sequence discipline; full inventory is robust and large."],
    p: ["A portable copy of a vulnerable tool in a user folder never appears in inventory.", "Version strings are parsed differently by two collectors and exposure queries miss machines."],
    v: "Install a test package and drop a portable program, run inventory, and confirm the package and version appear in the console, the portable program appears if file scanning is enabled, and removal produces a diff.",
    dep: ["os-abstraction-layer","batch-and-upload","resource-governor"]
  },
  "posture-collector": {
    s: "Gathers security configuration facts about the host, such as disk encryption, firewall state, patch level and local administrators, for compliance and risk views.",
    d: "Periodic checks read configuration and status APIs and report results as facts with timestamps: encryption on, firewall enabled, last patch date, secure boot state, remote access services, local administrator membership. Results feed dashboards and conditional access decisions elsewhere. They are cheap and non-intrusive. The difficulty is that these facts can be wrong or spoofed on a compromised host, and different platforms express them differently, so a single compliant flag hides distinctions.",
    k: ["Report raw facts vs a compliance verdict: raw facts let policy change without agent releases; a verdict on the agent is simple for consumers and bakes in rules.", "Check at intervals vs on change events: intervals are simple and miss short windows; change events are timely and need a subscription per fact."],
    p: ["A compromised host reports a healthy firewall state by answering through a hooked API.", "A posture check passes because it tests whether a service exists, not whether it is running."],
    v: "Turn off the firewall on a lab host, and confirm the posture fact changes in the console within the check interval with a timestamp, and that the dependent compliance view updates.",
    dep: ["os-abstraction-layer","batch-and-upload"]
  },
  "service-supervisor": {
    s: "The long-running process that starts the agent early at boot, launches its components, restarts them when they fail and exposes their state.",
    d: "Registered as a protected system service, the supervisor starts before most user software, loads policy, starts sensors, the pipeline and transport in dependency order and monitors each by heartbeat. Failed components restart with backoff, and repeated failure enters a degraded mode and reports. It handles shutdown, upgrades and signals from the OS. The difficulty is startup ordering, since the agent must be ready before attacker code, but cannot slow boot, and restart loops that eat resources.",
    k: ["Many small processes vs one large service: separate processes isolate crashes and cost memory and coordination; one process is simpler and a single fault takes everything.", "Restart forever vs give up after a limit: endless restarts maximize uptime and can spin; giving up avoids loops and leaves the host unprotected."],
    p: ["A crash loop in one component consumes a core on every machine after a bad content update.", "The service starts late and misses processes launched during boot."],
    v: "Kill each component in turn on a test host, and confirm it is restarted within the backoff schedule, health reports the restart count, and a component forced to fail repeatedly enters degraded mode instead of looping.",
    dep: ["module-framework","watchdog","local-state-store"]
  },
  "module-framework": {
    s: "A uniform way for the agent to load, version, isolate and update its functional parts, such as sensors, detectors and response handlers, as separate modules.",
    d: "Each module declares what events it consumes, what it produces, its resource needs and its version. The framework loads modules, routes events between them, enforces budgets, isolates failures and swaps versions on update. This lets new capabilities ship without rebuilding the whole agent and lets one module crash without ending the rest. The design difficulty is interfaces that stay compatible across versions and that crossing between modules does not cost more than the work they do.",
    k: ["Out-of-process modules vs in-process plug-ins: out-of-process modules isolate faults and cost serialization; in-process plug-ins are fast and a fault ends the host process.", "Strict versioned interfaces vs flexible message passing: strict interfaces catch mismatches at load time; flexible messages evolve easily and fail late."],
    p: ["Two modules at incompatible versions load together and silently drop each other's events.", "A module with no resource limit starves the others."],
    v: "Update one module while the agent runs, and confirm events continue to flow from others, the old version unloads cleanly and health reports the new version number.",
    dep: ["service-supervisor","event-schema","resource-governor"]
  },
  "local-state-store": {
    s: "The agent's small durable database for configuration, caches, identity, queues' metadata and quarantine records, protected against corruption and tampering.",
    d: "An embedded transactional store holds the last known good policy, device identity and keys, verdict and hash caches, indicators, bookmarks and the quarantine index. Writes are journaled so power loss does not corrupt it, access is restricted to the agent and sensitive values are encrypted with keys sealed to hardware where available. Size limits and compaction keep it small. The difficulty is crash safety on varied file systems, protecting it from administrator-level tampering and migrating its format across versions.",
    k: ["Embedded database vs flat files: a database gives transactions and queries and adds a dependency; flat files are simple and fragile under crash and concurrency.", "Encrypt with a key stored locally vs sealed to hardware: local keys are portable and recoverable by an attacker on the host; hardware-sealed keys resist theft and complicate image restore."],
    p: ["Corruption after power loss makes the agent fail to start, and it has no safe default configuration.", "Cache growth without compaction fills a small disk over months."],
    v: "Kill the agent at random points during heavy writes one hundred times, and confirm it starts each time with a consistent store, the last known good policy intact and no entries torn.",
    dep: ["os-abstraction-layer"]
  },
  "secure-transport": {
    s: "The authenticated, encrypted connection between agent and backend, with certificate pinning, proxy support and replay protection, over which telemetry and commands travel.",
    d: "Mutual authentication uses the device certificate from enrollment and a pinned set of backend trust anchors so a forged intermediary cannot impersonate the cloud. The agent works through corporate proxies, detects interception by the network, rotates credentials before expiry and records connection failures. Messages carry sequence numbers and expiry to stop replay. It is hard because enterprise networks inspect and rewrite traffic, certificate rotation can strand offline agents and clock errors break validity checks.",
    k: ["Pin to specific keys vs trust the system store: pinning stops forged certificates and complicates rotation; the system store is flexible and trusts every installed authority.", "Direct connection vs through the customer's proxy: direct is simple and often blocked; proxy support is required in enterprises and adds failure modes."],
    p: ["A pinned key rotates while a laptop is offline for months, and it can never reconnect without reinstall.", "A wrong system clock makes every certificate look expired, and the agent goes silent."],
    v: "Connect through an intercepting test proxy with a different certificate, and confirm the agent refuses; then rotate the backend key with the overlap procedure and confirm agents reconnect without intervention.",
    dep: ["local-state-store","os-abstraction-layer"]
  },
  "os-abstraction-layer": {
    s: "A thin interface that hides platform differences in processes, files, networking, threads and services, so most agent code is shared across operating systems.",
    d: "The layer defines portable functions for operations the agent needs, with implementations per platform and version. It translates paths, identifiers, permissions and error codes, and exposes capability flags where a platform cannot provide something. Sensors sit under it and the event schema above it. It keeps the test matrix tractable. The difficulty is the lowest-common-denominator trap: abstractions that cannot express a platform's unique strengths either lose detection value or leak platform concepts back upward.",
    k: ["Wide abstraction vs thin abstraction: wide abstractions share more code and hide useful differences; thin ones keep details and duplicate logic.", "Capability flags vs pretending parity: flags state honestly what a platform cannot do; pretending parity simplifies code and misleads analysts."],
    p: ["A path-handling difference makes an exclusion match on one platform and not another.", "An error code mapped to a generic failure hides why a sensor did not load."],
    v: "Run the shared test suite of file, process and network operations on every supported platform and version, and confirm identical results, with each unsupported capability reported by its flag.",
    dep: []
  },
  "watchdog": {
    s: "An independent, minimal monitor that restarts the agent if it hangs or dies, and alerts if it cannot, serving as the last line against silent failure.",
    d: "The watchdog is separate from the main service, with its own small code base, expecting regular heartbeats and checking more than process existence: whether events are moving, whether sensors are loaded, whether the queue is draining. On failure it restarts the service, collects a diagnostic and sends an alert through a separate path. It must itself be protected, or attackers kill it first. The challenge is false restarts when the host is heavily loaded and ensuring the watchdog does not cause the outages it prevents.",
    k: ["Heartbeat only vs progress checks: heartbeat only is simple and misses a live but stuck agent; progress checks catch hangs and need careful thresholds.", "Separate process vs a thread in the service: a separate process survives a crash of the service; a thread is simpler and dies with it."],
    p: ["A heavily loaded machine misses heartbeats, and the watchdog restarts the agent repeatedly, making the load worse.", "The watchdog is killed first by an attacker because it is unprotected."],
    v: "Suspend the main service's threads on a lab host, and confirm the watchdog detects no progress within the threshold, restarts it, records a diagnostic, and an alert appears in the console.",
    dep: ["service-supervisor","self-protection-driver","agent-health-reporting"]
  },
  "agent-crash-reporting": {
    s: "Captures crash dumps and diagnostics from the agent itself and sends them, minimized and scrubbed, to the vendor so defects are found before they spread.",
    d: "A crash handler writes a minidump with stack and module list, adds version, platform and recent log lines, strips memory that may hold customer data and queues it for upload under a size and rate cap. The backend groups crashes by signature and tracks the rate per version and ring. This is the early-warning signal for a bad release, so ring promotion gates on crash rate. The difficulty is privacy of dumps, handling crashes in kernel components (where a reporter cannot run), and noise from crashes caused by other software.",
    k: ["Full dump vs minimal dump: full dumps help root cause and carry sensitive memory; minimal dumps are safe and sometimes insufficient.", "Automatic upload vs customer approval: automatic upload speeds detection of a bad release; approval satisfies strict data rules and delays signals."],
    p: ["Dumps contain document contents or credentials from nearby memory.", "A crash of the kernel component takes the machine down with no report ever sent."],
    v: "Force a crash in a test build, and confirm a dump arrives with version and stack, is grouped under one signature, contains no sample of planted secret strings, and increments the rate counter for that ring.",
    dep: ["secure-transport","staged-rollout-rings","agent-health-reporting"]
  },
  "self-protection-driver": {
    s: "A kernel-level guard that prevents other processes, including administrators, from killing the agent, altering its files, memory, services or configuration stores.",
    d: "The component registers callbacks on process handle opens, file operations in the agent's directories, configuration key changes and service control, and strips dangerous rights or denies access unless the caller is the agent or a signed updater. It can mark the agent's processes as protected using OS facilities. It is the backbone of tamper resistance. The difficulty is leaving legitimate paths for installers, updates and support tools, and that a vulnerability in the guard itself gives an attacker a route to the kernel.",
    k: ["Deny at the kernel vs detect and restore: denial prevents the damage; detect and restore tolerates more and leaves a window of blindness.", "Protect everything under the install directory vs only binaries: full protection avoids config attacks and complicates updates and support."],
    p: ["A legitimate uninstall or updater is blocked and leaves the agent half removed.", "The protection allows any process with a certain name and attackers rename their tool."],
    v: "From an elevated administrator shell, attempt to kill the agent service, delete its files and edit its configuration store, and confirm each is denied, logged with the caller, and the agent keeps running.",
    dep: ["kernel-component-safety","process-creation-hooks","file-system-filter","config-store-monitor"]
  },
  "uninstall-protection": {
    s: "Requires a one-time code or console approval to remove, disable or downgrade the agent, so a local administrator or script cannot quietly take it off a machine.",
    d: "Uninstall, stop and some settings changes require proof, such as a per-device passphrase issued by the console with an expiry, checked by the installer and the protection component. Approval is logged. Without it, the operation is refused even for the highest local privilege. The difficulty is operations: support teams need a workable recovery path for broken machines and for decommissioning, and codes must be revocable and not reusable, because a leaked master password defeats the whole fleet.",
    k: ["Per-device one-time codes vs a shared passphrase: per-device codes limit damage when one leaks; a shared passphrase is easy for support and a single point of failure.", "Block removal entirely vs allow with approval: blocking stops all tampering and makes decommissioning impossible without console action; approval gives control and requires process."],
    p: ["Boot into a different OS or safe mode and delete the files, bypassing the check.", "A shared uninstall password written in a runbook spreads and is used by an insider."],
    v: "Attempt uninstall without a code and with an expired code, and confirm both are refused and logged; then use a valid one-time code and confirm removal works exactly once.",
    dep: ["self-protection-driver","policy-engine","action-audit-trail"]
  },
  "binary-integrity-checks": {
    s: "Verification that the agent's own executables, drivers and content files are unmodified, by checking signatures and hashes at load time and periodically afterward.",
    d: "At start and on a schedule the agent verifies each component against signatures and a signed manifest, and checks that its in-memory code pages have not been patched. A mismatch triggers an alert, a repair from a protected copy or a safe mode. Content files are checked before use. The difficulty is that the checker is itself code that can be patched, so checks come from several places (kernel, watchdog, backend attestation), and the cost of rehashing large files must stay small.",
    k: ["Check on load only vs continuously: load-time checks are cheap and miss later tampering; continuous checks catch patching and add cost.", "Self-check vs remote attestation: self-checks work offline and can be fooled by a compromised agent; remote attestation is stronger and needs connectivity."],
    p: ["An attacker patches the checking routine so it always reports success.", "Antivirus or backup tools alter file timestamps and trigger false tamper alerts."],
    v: "Modify one byte in an agent binary and one content file on a lab host, and confirm each is detected at next check, reported as tamper with the file named, and the component is repaired from the protected copy.",
    dep: ["signed-policy-verification","local-state-store","watchdog"]
  },
  "signed-policy-verification": {
    s: "Requires every policy, content package and command to carry a valid signature from keys the agent trusts, so a compromised network path cannot change what the agent does.",
    d: "Documents are signed by the backend with keys held in hardware modules, and the agent embeds the trust anchors and verifies the signature, version number and expiry before applying anything. Rollback of versions is refused unless allowed explicitly. Key rotation uses overlapping validity and signed trust-anchor updates. The difficulty is that the keys are the crown jewels: compromise lets an attacker push malicious content to every machine, so signing is isolated and audited and keys have limited scope.",
    k: ["Sign everything vs rely on the channel's authentication: signing protects against a compromised relay or storage; channel authentication alone is simpler and trusts every hop.", "Separate keys per content type vs one key: separate keys limit what a compromised key can do; one key is simpler to operate."],
    p: ["An old validly signed policy is replayed to turn off a protection, because versions are not enforced.", "The signing key expires and agents reject all new content until a manual fix."],
    v: "Present the agent with a tampered policy, an expired one and an older valid version, and confirm each is rejected with a distinct reason while a correctly signed newer one is applied.",
    dep: ["local-state-store"]
  },
  "injection-defense": {
    s: "Detects and blocks attempts to inject code into the agent's processes or tamper with their memory, threads and loaded modules.",
    d: "The agent restricts which processes can open its own with write or thread rights, validates loaded modules against an allowlist of signed ones, enables OS mitigations (code integrity enforcement, no dynamic code outside approved regions) for itself and checks its threads' start addresses. Debugger attachment is refused. These measures stop an attacker running code inside the most privileged process on the machine. The difficulty is compatibility with other security software and accessibility tools that inject legitimately.",
    k: ["Strict allowlist of modules vs blocklist: an allowlist closes unknown paths and breaks well-meaning injectors; a blocklist is compatible and misses new tools.", "Run the agent in a protected process mode vs normal: protected mode raises the bar sharply and limits who can debug and support; normal mode is easier to troubleshoot."],
    p: ["An accessibility tool injects a library into the agent's user interface and is blocked, and support tickets follow.", "A debugger attaches before the protection starts during early boot."],
    v: "Attempt to inject a test library and create a remote thread in the agent process from an administrator tool, and confirm both are blocked, the attempt is logged with the source process, and the agent continues unaffected.",
    dep: ["self-protection-driver","module-load-monitor"]
  },
  "sensor-blind-detection": {
    s: "Notices when the agent has stopped seeing, as opposed to stopped running: unloaded sensors, removed hooks, cleared logs, silent event streams and gaps in sequence numbers.",
    d: "Canary events, known to be generated by the host, are checked end to end: a probe process starts and the agent must see it, a probe file write must appear. Sequence gaps, unexpected counter resets, a sensor that reports zero events for a busy host and hooks that no longer match their expected bytes all trigger alerts. This catches the attacker's best move, which is not to fight the agent but to blind it. The difficulty is distinguishing genuine quiet from blindness, especially on idle machines.",
    k: ["Synthetic canary events vs statistical silence checks: canaries are definitive and cost a little work; statistical checks need no activity and are ambiguous on idle hosts.", "Alert locally vs rely on the backend noticing: local alerts are immediate and can be suppressed by the attacker; backend detection is robust and slower."],
    p: ["A sensor is disabled and the heartbeat still reports healthy, because it checks only the service.", "An idle server legitimately produces no events, and every silence check fires."],
    v: "Unload one kernel sensor and remove a user-space hook on a lab host, and confirm the canary probes miss, a blind alert names each sensor within two minutes, and the console shows the host as degraded.",
    dep: ["agent-health-reporting","process-creation-hooks","in-process-api-hooks"]
  },
  "tamper-alerting": {
    s: "Turns every blocked or detected attempt to disable, modify or evade the agent into a high-priority alert that reaches analysts even if the host is later silenced.",
    d: "Tamper events are produced by protection components, integrity checks and blind detection, and are sent immediately on a priority path, with a copy held in the persistent queue. The backend treats them as high severity because attackers usually act on the agent early in an intrusion, and escalates when a host stops reporting soon after one. They carry the acting process and identity. The difficulty is distinguishing malicious tampering from administrator maintenance, and ensuring the alert escapes before the attacker finishes.",
    k: ["Send immediately vs batched: immediate send gets the alert out before silence; batching saves bandwidth and risks the alert dying with the host.", "Alert on every attempt vs only on a pattern: every attempt gives the earliest warning and many false alarms during maintenance; patterns reduce noise and delay."],
    p: ["Planned maintenance by the platform team triggers dozens of tamper alerts that analysts learn to ignore.", "The attacker blocks the agent's network first, so the alert never leaves the host."],
    v: "Attempt to stop the agent service on a lab host and confirm a tamper alert with the actor reaches the console within seconds, and that cutting the network afterwards makes the console escalate on silence.",
    dep: ["self-protection-driver","sensor-blind-detection","batch-and-upload","action-audit-trail"]
  },
});
