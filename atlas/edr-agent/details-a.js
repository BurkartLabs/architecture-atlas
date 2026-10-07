// Details for the endpoint detection and response plate, part A: response actions, forensics collection, management and policy.
ATLAS.details("edr-agent", {
  "host-isolation": {
    s: "Cuts a machine off from the network except for the agent's own channel to the console, so a compromised host cannot spread or exfiltrate while an analyst investigates.",
    d: "The agent installs network filter rules that drop all traffic except to the management backend, and optionally to named allowlisted addresses such as the analyst's remote tooling. The rule set is persisted so it survives reboot and a stopped service. Isolation must be reversible from the console and also by a local timeout, because an isolated machine that loses its backend path cannot be released. The hard part is leaving exactly enough connectivity: name resolution, proxies and certificate checks the agent itself needs can be blocked by its own rules.",
    k: ["Block everything but the agent channel vs allow a broader allowlist: tight isolation is safer for containment; a wider list keeps remote tools and domain authentication working but leaves paths open.", "Persistent rules vs rules held in the running service: persistent rules survive an attacker stopping the agent; they also strand a machine if the agent is later removed without releasing them."],
    p: ["A backend address resolved by name is blocked by the isolation itself, so the host can never be released remotely.", "Isolating a server that hosts authentication or storage for other machines turns one incident into an outage."],
    v: "Isolate a test host, then confirm that an outbound connection to an arbitrary address fails, the console still shows it online, and release from the console restores connectivity within one check-in interval.",
    dep: ["network-filter","command-channel","secure-transport"]
  },
  "process-kill-and-suspend": {
    s: "Terminates or freezes a running process, and optionally its descendants, on command or by prevention rule, to stop an attack in progress.",
    d: "The agent resolves a process by a stable identity (identifier plus start time, never the identifier alone), checks it is not a protected system process, then terminates it or suspends its threads. Killing the whole tree stops children that would carry on the attack. Suspension keeps memory intact for acquisition. Races are the difficulty: the target may have exited and its identifier been reused, may respawn through a service or scheduled task, or may be a process whose death crashes the machine.",
    k: ["Kill vs suspend: killing ends the damage immediately; suspending preserves memory and state for analysis but leaves a hung process that an attacker can detect.", "Kill the tree vs kill the single process: tree kills stop launchers and watchers, but can terminate legitimate parents such as a management tool that happened to spawn the malware."],
    p: ["Acting on a bare process identifier after reuse kills an unrelated program.", "Killing a payload without removing its persistence lets it return at the next logon."],
    v: "Start a benign process that spawns two children, issue a tree kill from the console, and confirm all three are gone, the result reports each identity, and an unrelated process with a recycled identifier is untouched.",
    dep: ["process-entity-table","action-dispatch","process-creation-hooks"]
  },
  "file-quarantine": {
    s: "Moves a malicious file into a protected store, stripped of execute rights and recoverable only by an authorized restore, so it can no longer run but is still available for analysis.",
    d: "The agent records the file's path, hash, owner and permissions, then moves or encrypts it into an access-controlled vault and leaves a marker. Open handles and memory mappings mean the file may be in use, so the move can be deferred until the owning process is stopped. A restore command returns it with its original metadata. The hard part is consistency: quarantining a file that other software expects breaks that software, and a restored file can immediately be re-detected.",
    k: ["Move into a vault vs delete: the vault allows restore after a false positive and sample upload; deletion leaves no live copy for an attacker or a bug to reach.", "Encrypt the quarantined content vs rename only: encryption prevents accidental execution and scanner re-trigger; it adds key handling and slower restore."],
    p: ["A false positive on a system file quarantines something the machine needs to boot.", "Quarantine of a file in use fails silently and the console reports it as handled."],
    v: "Quarantine a harmless test file, confirm it cannot be opened from its old path, appears in the vault listing with hash and original path, and restores byte-identical with its original permissions.",
    dep: ["file-system-filter","action-dispatch","local-state-store"]
  },
  "remote-shell": {
    s: "An interactive command session opened from the console on a managed machine, used by analysts to investigate and remediate without network access to the host.",
    d: "The agent opens an outbound session to the backend, which relays the analyst's keystrokes to a shell it launches under a restricted identity, and relays output back. Because the host may be isolated, the session rides the existing agent channel. Every command and output is logged centrally. The risk is that this is remote code execution by design, so access needs strong authentication, scoping per device group, approval for destructive commands and a hard time limit on each session.",
    k: ["Free shell vs a constrained command set: a free shell handles unforeseen situations; a curated command set limits blast radius and is easier to audit but frustrates analysts.", "Session recording on the server vs on the host: server-side logs cannot be erased by an attacker on the host; host-side logs keep working when the backend path is down."],
    p: ["An analyst account takeover becomes code execution on every machine the role can reach.", "A session left open after a dropped connection keeps a privileged shell alive with no one watching."],
    v: "Open a session to a test host, run a command, and confirm the output returns, the full transcript appears in the audit log with the analyst identity, and the session closes itself at its time limit.",
    dep: ["command-channel","action-audit-trail","secure-transport"]
  },
  "remediation-rollback": {
    s: "Undoes the changes an attack made, such as dropped files, persistence entries and altered settings, using what the agent recorded at the time, and restores files the attack encrypted.",
    d: "The agent keeps a short history of file and configuration changes tied to each process tree. Once an attack is confirmed, it replays that history in reverse: removing created files and autostart entries, restoring modified settings, and recovering overwritten files from snapshots or protected shadow copies. It reports each step. The difficulty is knowing what is attack-caused and what is the user's own concurrent work, and that rollback data costs disk and write overhead to keep.",
    k: ["Targeted undo of recorded changes vs full system restore: targeted undo keeps the user's other work; full restore is simpler and certain but loses legitimate changes.", "Keep recovery copies for all files vs only for protected folders: full coverage costs space and write amplification; scoping leaves unprotected folders unrecoverable."],
    p: ["The history window is shorter than the attack's dwell time, so early changes are not recorded.", "Rolling back a setting that other software has since changed overwrites the newer legitimate value."],
    v: "Run a harmless script that creates a file, adds an autostart entry and encrypts a test file, trigger remediation, and confirm all three are reverted and the test file hashes match the originals.",
    dep: ["file-system-filter","config-store-monitor","process-lineage-analysis","local-state-store"]
  },
  "action-dispatch": {
    s: "Receives response commands from the backend, validates and authorizes them, runs them on the right module, and returns a structured result for every attempt.",
    d: "A command carries a target, an action, parameters, an issuer, an expiry and a signature. The agent verifies the signature and that the issuer's role allows the action on this device, queues it, executes it, and reports success, failure or partial completion with details. Commands are idempotent where possible and carry an identifier so a replay does nothing. It is hard because commands arrive late, twice or after the situation changed, and a stale command that executes on a recovered machine is itself an incident.",
    k: ["Signed, expiring commands vs trusting the channel: signatures protect against a compromised relay and replays; they require clock tolerance and key distribution.", "Fire-and-forget vs acknowledged results: acknowledgments let playbooks branch on real outcome; they require a durable result queue when the host is offline."],
    p: ["A command queued while the host was offline runs hours later against a state it was never meant for.", "A result reported as success when the action only started leads analysts to stop watching."],
    v: "Send the same signed command twice and an expired one, and confirm the first runs once, the duplicate is rejected as already handled, the expired one is refused, and each produces a result record.",
    dep: ["command-channel","signed-policy-verification","module-framework"]
  },
  "indicator-blocking": {
    s: "Denies execution, connection or file access matching a supplied indicator such as a hash, domain, address or path, pushed from the console as an immediate response.",
    d: "An analyst adds an indicator with an action (block or alert) and a scope. The backend distributes it as a policy delta, and the agent loads it into compact matching structures that the file, process and network sensors consult on each event. Expiry and removal are first-class. The tricky parts are speed of distribution, matching cost across millions of entries, and the false-positive hazard: a block on a shared address or a common file hash can disable legitimate services across the fleet.",
    k: ["Hash-based vs behavior-based indicators: hashes are precise and cheap to match but trivially evaded; behavior matches survive recompilation but risk broader false positives.", "Allow immediate fleet-wide push vs staged scope: immediate is the point in an emergency; staging catches a mistaken block before it reaches everyone."],
    p: ["Blocking a content delivery address because malware used it takes down unrelated software for every user.", "Indicators never expire, so the match table grows until lookups slow every event."],
    v: "Add a block for a test file's hash scoped to one device, confirm launch is denied there within the distribution interval and allowed on an unscoped device, then remove it and confirm launch works.",
    dep: ["policy-engine","indicator-matching","pre-execution-verdict","network-filter"]
  },
  "triage-collection": {
    s: "Runs a defined set of collectors on a machine and packages the output, giving an investigator the first evidence within minutes and without physical access.",
    d: "A collection job names artifacts: running processes, network connections, autostart locations, scheduled tasks, recent files, user sessions, event logs and browser history. The agent runs each collector with a size and time budget, writes results in a structured format, hashes the package and uploads it, or holds it for later retrieval. Collections run read-only. The challenge is volatility order, since the most perishable data (connections, memory) must be taken first, and keeping the package small enough to ship from a slow link.",
    k: ["Predefined collection profiles vs ad hoc selection: profiles are fast, consistent and safe to automate; ad hoc selection reaches unusual artifacts but depends on analyst skill under pressure.", "Collect then upload everything vs upload on request: eager upload is faster for responders; on-request limits personal data leaving the machine until needed."],
    p: ["Collecting from a heavily loaded machine at full speed degrades the very business service under investigation.", "Collectors that follow links or open files can alter timestamps and modify the evidence."],
    v: "Run the standard profile on a test host and confirm the package contains each named artifact class, every file has a recorded hash, and the collection finished within its time budget with CPU under the cap.",
    dep: ["host-state-snapshot","disk-artifact-parsing","evidence-integrity","resource-governor"]
  },
  "memory-acquisition": {
    s: "Captures the contents of physical or process memory to a file so that in-memory malware, keys and injected code can be analyzed after the process is gone.",
    d: "The agent reads memory through a kernel component or an OS debugging interface, either for the full machine or for chosen processes, and writes a raw or structured image with a map of regions and permissions. Full captures are as large as installed memory, so they are compressed and sent in chunks, or taken only for suspicious processes. The hard parts are consistency, since memory changes while it is read, protected regions that cannot be read, and the stability risk of reading memory from a kernel component.",
    k: ["Full capture vs targeted process dump: full capture holds everything including the kernel; targeted dumps are fast and small but miss other processes involved.", "Kernel-assisted acquisition vs OS debug interface: kernel access reads more and resists evasion; it adds a driver to trust and can crash a busy host."],
    p: ["A full capture on a large server fills the disk or saturates the uplink during business hours.", "Reading a region that is being unmapped yields a smeared image that analysis tools misparse."],
    v: "Run a test process holding a known marker string, acquire its memory, and confirm the marker appears in the dump, the region map lists the process's modules, and the capture hash matches the uploaded copy.",
    dep: ["kernel-component-safety","evidence-integrity","resource-governor"]
  },
  "disk-artifact-parsing": {
    s: "Reads on-disk structures, such as the file system's metadata, registry-style configuration stores and event logs, directly, including deleted or hidden entries a normal listing hides.",
    d: "Parsers interpret raw structures: file system tables for creation, modification and deletion records, configuration hives, execution-history caches, prefetch-style records and logs. Reading raw storage bypasses an attacker's file hiding and shows timestamps the API would not. Each parser must handle partial, corrupt and changing data. The difficulty is correctness over many OS versions, since formats change silently, and that parsers on untrusted input are an attack surface of their own.",
    k: ["Parse on the host vs upload raw artifacts for server-side parsing: host parsing gives immediate answers but must ship and update parsers; raw upload keeps the agent small and lets parsers improve retroactively.", "Raw device reads vs API reads: raw reads reveal hidden and deleted data; they are slower and can read inconsistent data from a live volume."],
    p: ["A malformed record crashes the parser inside the privileged agent, giving attackers a way to disable it.", "Timestamps read as local time rather than universal time produce a wrong timeline by hours."],
    v: "Create, run and delete a test program on a lab host, collect artifacts, and confirm the output shows its creation time, an execution record with correct universal time, and the deletion entry.",
    dep: ["triage-collection","evidence-integrity","os-abstraction-layer"]
  },
  "host-state-snapshot": {
    s: "A point-in-time record of the machine's live state: processes with command lines and parents, open connections, loaded modules, users, services and scheduled work.",
    d: "The agent enumerates OS objects and joins them with its own process entity table, so that each entry carries lineage, hash and signer. A snapshot taken from the agent's own bookkeeping reflects what it observed, while one taken by enumeration shows what exists now, and the two differing reveals hidden processes. It must be taken quickly because the state is changing. The hard part is volume on busy servers and avoiding enumeration calls an attacker has hooked.",
    k: ["Agent bookkeeping vs fresh enumeration: bookkeeping is instant and historical; enumeration is authoritative for the present. Comparing both exposes hiding techniques.", "Full snapshot vs delta from the last one: deltas are small and frequent; full snapshots are self-contained and easier to reason about."],
    p: ["Enumeration through an API a rootkit has altered returns a clean-looking list.", "Snapshots on a host with tens of thousands of connections take long enough that the state changes underneath them."],
    v: "Start a test process with a distinctive command line and a child, take a snapshot, and confirm both appear with parent links, image hashes and the open connection of the child.",
    dep: ["process-entity-table","os-abstraction-layer","module-load-monitor"]
  },
  "file-retrieval": {
    s: "Pulls a specific file from a machine to the backend on request, for malware analysis or evidence, within size limits and with the file's metadata.",
    d: "An analyst names a path or hash. The agent locates the file, checks policy limits on size and sensitivity, reads it without changing timestamps where possible, compresses and uploads it in resumable chunks with its hash, owner and times. Retrieved files are often live malware, so the backend stores them in a handling format that prevents accidental execution. Difficulty comes from locked files, large files over slow links, and the privacy of a file that is not malware at all.",
    k: ["Upload automatically on detection vs only on request: automatic upload speeds analysis; on request keeps documents and personal files from leaving the machine without a person deciding.", "Resumable chunked transfer vs single upload: chunking survives bad links and gives progress; it needs reassembly state on both ends."],
    p: ["An analyst typo retrieves a customer database from the wrong path, creating a data leak from the security tool.", "Opening a file to read it updates its access time and alters the evidence."],
    v: "Request a known test file by hash, and confirm the uploaded copy hash matches, the metadata includes original path and times, and the request is recorded in the audit log with the requester.",
    dep: ["action-dispatch","evidence-integrity","batch-and-upload"]
  },
  "evidence-integrity": {
    s: "Hashing, signing and recording every collection step so that evidence can be shown later to be complete, unaltered and tied to a person and a time.",
    d: "Each collected item gets a content hash at acquisition; the package manifest lists items, tool version, collector identity, host identity and time, and is signed by the agent's key or sealed by the backend. Transfers are verified by hash at the receiver, and every access to the evidence is logged. This is not cosmetic: evidence used in legal or disciplinary action must survive challenge. The difficulty is host clock accuracy, key protection on a compromised host, and proving the agent was not itself subverted during collection.",
    k: ["Seal at the host vs seal at the backend on receipt: host sealing protects the path; backend sealing avoids trusting a possibly compromised host key but leaves the transfer unproven.", "Collect minimal evidence vs everything available: less data limits privacy and storage cost; more data supports questions nobody asked yet."],
    p: ["A wrong host clock puts every timestamp in the manifest out of order with other systems.", "A package edited after upload by an administrator with storage access cannot be shown intact because no hash was held elsewhere."],
    v: "Collect a package, alter one byte of one item on the backend copy, and confirm verification fails and names the item, while the original manifest signature still validates.",
    dep: ["secure-transport","action-audit-trail","local-state-store"]
  },
  "on-host-history-query": {
    s: "Lets an analyst query the recent history the agent keeps locally, such as process starts, connections and file writes, even when the cloud copy is missing or filtered.",
    d: "The agent keeps a rolling local store of recent events and entity data, indexed by time, process and path. A query language or a set of canned queries runs against it and returns matches. This answers questions when events were sampled out of the upload, the host was offline or the incident is too new for the cloud to have processed it. The challenge is storage cost, since history grows with activity, and query load that must not disturb the host, so queries run under a CPU and time cap.",
    k: ["Keep history locally vs rely on cloud history: local history survives an offline host and costs no upload; it uses disk and can be erased by an attacker who gets administrator access.", "Rich query language vs fixed queries: a language answers new questions; fixed queries are cheaper to secure and bound."],
    p: ["An expensive query on a busy host consumes enough CPU to affect users.", "The local store is sized for days but the dwell time is weeks, so the beginning of the attack is gone."],
    v: "Generate a known sequence of events, query by process and time window across a reboot, and confirm all events return in order, and a query that exceeds its time cap is stopped with a partial-result flag.",
    dep: ["persistent-event-queue","local-state-store","event-schema","process-entity-table"]
  },
  "enrollment-and-identity": {
    s: "How a new agent proves it belongs to a customer, receives a unique device identity and credentials, and keeps them safe across cloning, reimaging and reinstalls.",
    d: "The installer carries a tenant token or the machine is given one at deployment. On first start the agent presents it, generates a key pair, receives a device identifier and a certificate, and stores the private key in hardware-backed storage if present. Later connections authenticate with that key. The hard part is duplicates: a machine cloned from a golden image would share an identity, so the agent detects identity changes in hardware or image and re-enrolls. Tokens in installers leak and have to be revocable.",
    k: ["Per-device key in hardware-backed storage vs a shared tenant secret: per-device keys let one stolen machine be revoked alone; shared secrets are simpler to deploy but one leak exposes the tenant.", "Auto-enroll on install vs approval queue: automatic is frictionless for large rollouts; approval prevents rogue agents from joining at the cost of delay."],
    p: ["Imaging a machine after enrollment produces dozens of hosts with one identity, merging their telemetry into one confusing timeline.", "An installer with an embedded token is posted publicly and anyone can enroll devices into the tenant."],
    v: "Enroll a test machine, clone its disk to a second one, boot it, and confirm the clone is detected, gets a new device identity, and the original's identity and history are unchanged.",
    dep: ["secure-transport","local-state-store","policy-engine"]
  },
  "policy-engine": {
    s: "Defines per-device configuration for what to collect, detect, block and report, evaluates it on the agent, and applies changes safely and with a clear record.",
    d: "A policy is a versioned document of settings: sensor toggles, detection modes, exclusions, throttles, update rings and allowlists. The console resolves the effective policy for each device from groups and priorities and sends it, signed. The agent validates, stores the last known good copy, applies it without restart where possible and reports the version in effect. It is hard because a single wrong setting reaches the whole fleet instantly, and conflicts between overlapping policies must resolve predictably.",
    k: ["Centrally resolved effective policy vs agent-side merging: central resolution gives the console an exact picture of each device; agent-side merging lets devices adapt offline but diverges.", "Apply immediately vs stage by group: immediate application is needed for emergency blocks; staging catches errors before the whole fleet gets them."],
    p: ["A policy that disables a sensor is pushed to all groups and detections silently stop everywhere.", "The agent rejects a malformed policy but reports it as applied, so the console shows a configuration that is not in force."],
    v: "Change one setting for a test group, confirm the console shows the new version only on those devices, and confirm the agent's reported version and a measured behavior change match within the interval.",
    dep: ["signed-policy-verification","groups-and-tags","local-state-store"]
  },
  "groups-and-tags": {
    s: "Organizes devices into sets by role, location, risk or owner so that policy, response permissions and reporting can be applied to a group instead of machine by machine.",
    d: "Membership can be manual, rule-based on attributes like OS version, hostname pattern or directory group, or assigned by tags from deployment tooling. Groups carry policies, update rings and role scopes. Dynamic membership is recalculated as attributes change, so a machine can change policy without anyone touching it. The difficulty is precedence when groups overlap, and that group definitions double as an access boundary: a device landing in the wrong group is both misconfigured and wrongly exposed to operators.",
    k: ["Dynamic rule-based groups vs static manual groups: dynamic groups keep up with a changing fleet; static groups are predictable and auditable but go stale.", "One policy per device vs layered inheritance: layering reuses common settings; a single policy is simpler to reason about when something goes wrong."],
    p: ["A hostname rule matches test and production alike, so production servers receive an aggressive prevention policy.", "A device whose attribute changes moves silently to a group with weaker protection."],
    v: "Create a rule-based group by hostname prefix, enroll a matching and a non-matching device, and confirm membership, effective policy and role scope differ accordingly within one evaluation interval.",
    dep: ["enrollment-and-identity"]
  },
  "exclusion-management": {
    s: "Declares what the agent must not scan, block or alert on, such as paths, processes or signers, to avoid conflicts with trusted software and the false positives they cause.",
    d: "An exclusion names a file path, process, hash, signer or network destination, and what it suppresses: scanning, prevention, telemetry or alerts. The agent checks the exclusion list on the hot path of every relevant event, so the structure has to be fast. Exclusions are the most common source of blind spots: attackers look for excluded folders to run from. Good management scopes narrowly, expires entries, records an owner and a reason and reports which exclusions actually matched.",
    k: ["Exclude by path vs by signer or hash: paths are easy but any file dropped there inherits the exemption; signer or hash is tighter but breaks on updates.", "Exclude from scanning only vs from all telemetry: scanning-only exclusions keep visibility; full exclusions solve performance more but create complete blindness."],
    p: ["A wildcard exclusion on a writable directory lets malware run from it undetected.", "Exclusions added during an incident for a performance problem remain for years with no owner."],
    v: "Add a path exclusion for scanning only, drop a test detection file there, and confirm it is not scanned but its process creation still appears in telemetry; then confirm the console lists the exclusion with match count and owner.",
    dep: ["policy-engine","local-rule-engine"]
  },
  "command-channel": {
    s: "The persistent, authenticated connection the backend uses to reach a host with commands, policy changes and wake-ups, usually opened outbound by the agent.",
    d: "The agent holds a long-lived outbound connection, or polls at a short interval, to a backend endpoint. Because machines sit behind translation devices and firewalls that block inbound traffic, the backend cannot connect to them; it queues a message and the agent collects it. Heartbeats show the host is alive and keep the path open through idle timeouts. The difficulty is scale (millions of open connections), proxy environments that interfere with long-lived streams, and reaching machines that are online only briefly.",
    k: ["Persistent stream vs periodic polling: streams deliver commands within a second and show liveness; polling is simpler through proxies and uses less server state but adds delay.", "Single endpoint vs regional endpoints with fallback: fallbacks improve availability and latency; they multiply certificates, allowlists and ways to misconfigure."],
    p: ["A corporate proxy terminates idle connections every minute, so the stream flaps and commands arrive late or twice.", "An emergency isolation waits for the next poll while the attacker keeps moving."],
    v: "Send a no-op command to a connected host and measure delivery latency, then kill the connection mid-flight and confirm the host reconnects, resumes, and the command is delivered once.",
    dep: ["secure-transport","enrollment-and-identity"]
  },
  "agent-health-reporting": {
    s: "Reports each agent's version, mode, sensor status, resource use, update state and errors, so operators can tell protected machines from machines that only appear to be.",
    d: "At intervals and on change, the agent sends a compact health record: running version, policy version, which sensors are active, queue depth, drop counters, last successful upload, last update result, CPU and memory use and any detected tampering. The backend derives states such as healthy, degraded, stale and offline. This is the only evidence that coverage exists. The difficulty is choosing signals that detect real blind spots rather than only process liveness, and avoiding alert noise from machines that are legitimately powered off.",
    k: ["Report sensor-level status vs only agent liveness: sensor status reveals a silently failed driver; liveness alone claims protection that is not there.", "Frequent heartbeat vs infrequent: frequent beats find outages quickly but cost backend load at fleet scale; infrequent beats are cheap and slow to notice."],
    p: ["The agent process is running but its kernel sensor failed to load, and the console shows green.", "Laptops asleep for a week trigger thousands of stale alerts that bury real problems."],
    v: "Disable one sensor on a test host and confirm the console flags that host as degraded with the specific sensor named within two reporting intervals, while a host that is simply powered off shows offline instead.",
    dep: ["service-supervisor","backpressure-and-loss","sensor-blind-detection","secure-transport"]
  },
  "action-audit-trail": {
    s: "A tamper-resistant record of who changed what in the console and what each agent did in response, covering logins, policy edits, response actions and evidence access.",
    d: "Every administrative action records the actor, role, source address, target, parameters, time and result. Agent-side actions are logged with the command identifier that caused them, so a kill can be traced from process to analyst. Logs are append-only, exported to external retention and searchable. Requirements come from audits and from distrust of insiders: this record is how you tell an attack on the console from normal use. The difficulty is completeness, since an unlogged path defeats the purpose, and protecting the log from those it is meant to watch.",
    k: ["Log at the console vs also on the agent: console logs record intent; agent logs record what really executed and can reveal commands that bypassed the console.", "Immutable external storage vs the product's own database: external storage resists the administrators of the system; the product database is simpler to query and cheaper."],
    p: ["Service accounts used by automation appear as one anonymous actor, hiding who triggered an action.", "Logging the full command output of remote shell sessions captures secrets the analyst typed."],
    v: "Perform a policy edit, a host isolation and a file retrieval as a test user, and confirm three entries with actor, target and result exist, cannot be edited through the console, and appear in the exported copy.",
    dep: ["command-channel","policy-engine"]
  },
  "kernel-trust-and-stability": {
    s: "Deciding how much of the agent runs with kernel privilege, how it is kept from crashing the host, and how risky changes are rolled out. The choice shapes sensors, updates and incident impact.",
    d: "Kernel code sees all activity and resists tampering, and a single fault in it halts the machine. Decisions here include which logic is allowed in the kernel at all, how memory and pointers from user programs are validated, how long callbacks may run, and whether new kernel code can be loaded without a signed vendor and OS review. Moving parsing and detection to user space shrinks the kernel footprint at the cost of latency. Every kernel update carries the possibility of a fleet-wide crash loop.",
    k: ["Thin kernel component vs rich kernel detection: a thin component is easier to prove safe and update; rich in-kernel logic is faster and harder to bypass but a bug there crashes everything.", "Content updates outside the kernel module vs binary updates: data-driven content ships fast without kernel review; it needs a loader that is itself robust against malformed content."],
    p: ["A content file with an unexpected shape makes the kernel parser read past a buffer, and every machine that receives it crashes on boot.", "A kernel module blocks while waiting on user space, hanging the system whenever the service stops."],
    v: "Feed the kernel component deliberately malformed content and oversized inputs on a lab host, and confirm it rejects them, logs the rejection, and the host stays up through ten forced service restarts.",
    dep: ["kernel-component-safety","kernel-user-channel","content-updates"]
  },
  "performance-budgets": {
    s: "Setting explicit limits on CPU, memory, disk, I/O and network the agent may consume, and holding every sensor and detection to them. Without them, protection costs more than users tolerate.",
    d: "Budgets are expressed per resource and per component, for example a share of one core averaged over a minute, a memory ceiling, a daily upload size, and a latency allowance on file open and process start. Every hot-path decision, including which events to collect, how deep to scan and how often to parse, trades coverage for cost. The agent measures itself, throttles under load and reports overruns. The trouble is that costs depend on workload: a build server and a laptop generate very different event rates.",
    k: ["Fixed budget vs adaptive budget: fixed limits are predictable for customers; adaptive limits use spare capacity but make behavior hard to reproduce.", "Budget by averages vs by worst-case latency: averages permit efficient batching; worst-case caps protect interactive latency but force simpler, cruder checks."],
    p: ["A scan triggered during a software build multiplies file open latency and makes builds take twice as long, so teams demand exclusions.", "Averages hide a rare multi-second stall in process creation that users feel as a freeze."],
    v: "Run a standard workload benchmark with and without the agent and confirm CPU, memory and file-operation latency overhead stay inside the documented limits, including during a synthetic event burst.",
    dep: ["resource-governor","self-measurement","scan-throttling"]
  },
  "fail-open-vs-fail-closed": {
    s: "What the agent does when it cannot decide: a timeout, a missing cloud verdict, a failed update, a corrupt policy. It either allows and risks a miss, or blocks and risks an outage.",
    d: "The answer differs by situation. A file open that waits on a cloud lookup cannot wait indefinitely, so it times out and allows, usually with a local fallback. A corrupt policy keeps the last known good one. A failed sensor load may leave the host running unprotected with an alert. Blocking on uncertainty is the safe default for security and the dangerous default for availability. Each decision point should have an explicit, documented, tested fallback, and the choice should be configurable for high-risk and critical hosts separately.",
    k: ["Fail open vs fail closed on lookup timeout: open keeps work moving and lets some threats pass; closed is safe for the endpoint and can stop whole workflows when the network blips.", "Last known good policy vs a built-in strict default: last known good preserves expected behavior; a strict default is safe but may block business software."],
    p: ["A fail-closed path on an unavailable backend halts every program launch on a fleet during a cloud outage.", "A fail-open path is triggered deliberately by an attacker who makes the lookup time out."],
    v: "Cut the backend connection on a test host and confirm each decision point behaves as documented: unknown files allow after the timeout with a local verdict, a known-bad hash still blocks, and the console later shows the fallback events.",
    dep: ["pre-execution-verdict","local-verdict-cache","offline-operation"]
  },
  "data-scope-and-privacy": {
    s: "Deciding what the agent collects and uploads, who can see it, and how long it is kept. An endpoint sensor sees document names, command lines, URLs and typed commands that can be personal data.",
    d: "Command lines, file paths, user names, domains and sometimes content are collected because they are the substance of detection. Limits include redacting known secret patterns, excluding personal folders from content upload, not collecting keystrokes or screen contents, region-specific storage, short retention for raw events and role-based access for analysts. Works councils and privacy law in some regions require declared purposes and consultation. The tension is that investigations want everything and employees expect restraint.",
    k: ["Collect broadly and restrict access vs collect narrowly: broad collection supports unforeseen investigations; narrow collection reduces exposure but leaves blind spots.", "Redact on the agent vs in the backend: agent redaction means sensitive data never leaves; backend redaction preserves raw evidence but exposes the data in transit and at rest."],
    p: ["Command lines contain passwords passed as arguments, and they are stored in plain text for a year.", "An analyst browses events about colleagues out of curiosity because access is not scoped or audited."],
    v: "Run a test command containing a fake password argument and confirm it is masked in the uploaded event, document upload is refused for the personal-folder path, and the analyst's access to the event appears in the audit trail.",
    dep: ["event-filtering","action-audit-trail","policy-engine"]
  },
  "cross-platform-parity": {
    s: "Keeping detection coverage, behavior and policy consistent across operating systems, versions and architectures that expose very different interfaces and restrictions.",
    d: "Each OS offers different hooks: some give a supported event interface, some require kernel components, some restrict third-party kernel code entirely and push vendors to user-space frameworks. A shared event schema and policy model hides the differences from analysts, but detections written against one platform's concepts do not translate. Parity decisions are about which events are the same, which are platform-only and how to say so honestly. Test matrices across versions are large and each OS release can break sensors.",
    k: ["One shared detection language vs per-platform rules: shared rules multiply analyst reach; per-platform rules express real differences and avoid false equivalences.", "Same collection depth everywhere vs best available per platform: uniformity eases reasoning; best-available uses everything each OS offers and makes coverage uneven."],
    p: ["A rule written for one platform silently never fires on another because the event field is empty there.", "A major OS release changes an interface and sensors stop on early-adopter machines before support is announced."],
    v: "Run the same attack simulation on each supported platform and confirm each produces the equivalent normalized events, with the console listing which fields are unavailable on which platform.",
    dep: ["os-abstraction-layer","event-schema","local-rule-engine"]
  },
  "adversary-awareness": {
    s: "Designing on the assumption that the attacker knows the agent exists and will try to evade it, disable it, feed it misleading data or abuse it as a privileged tool.",
    d: "Evasion goes after every layer: unhooking user-space hooks, using direct system calls, running from excluded paths, exhausting event queues, stopping services, loading vulnerable drivers to gain kernel access, and tampering with updates. Defenses include redundant sensors at different levels, integrity checks, detecting missing telemetry, hardened communication and treating the agent's own privileges as a prize. The agent is a high-value target, because it runs as the highest-privilege code on every machine in the fleet.",
    k: ["Redundant sensors at several layers vs a single deep sensor: redundancy makes evasion require several bypasses at greater cost; it also multiplies overhead and reconciliation work.", "Hide agent internals vs assume they are known: obscurity buys little time; designing for a knowledgeable attacker makes protections hold up when details leak."],
    p: ["The agent's own remote shell is turned into a ready-made backdoor after a console credential is stolen.", "A sensor that only looks at user-space API calls is bypassed by an attacker who calls the kernel directly."],
    v: "Run a red-team tool that unhooks user-space hooks, stops the service and floods events, and confirm the agent detects each attempt, keeps kernel telemetry flowing, and the console raises a tamper alert.",
    dep: ["self-protection-driver","sensor-blind-detection","injection-defense","kernel-trust-and-stability"]
  },
});
