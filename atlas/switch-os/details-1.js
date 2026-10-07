// Details for the network switch OS plate, part 1: management plane, telemetry, cross-cutting concerns.
ATLAS.details("switch-os", {
  "cli": {
    s: "The interactive text shell operators use to inspect and change a switch, with context-sensitive help, completion and a mode hierarchy mapped onto the configuration model.",
    d: "The shell parses commands against a grammar, usually generated from the same data models that the programmatic interfaces use, so a setting exists in one place. Show commands read operational state from the state database; configuration commands edit a candidate and hand it to the datastore. Sessions have modes, history, pipes and per-user privilege. What makes it hard is that operators memorize its exact text, scripts screen-scrape it, and every release must keep output stable while adding features.",
    k: ["Hand-written command grammar vs grammar generated from data models: handwritten commands read naturally, but generated ones stay consistent with the API and cannot drift from it.", "Structured output option vs text only: structured output makes automation robust, while text-only output forces scripts to parse screens that change between releases."],
    p: ["Scripts screen-scrape formatted output, and an innocent column change in a new release breaks automation across the fleet.", "Long-running show commands hold locks on shared state and stall protocols on a busy box."],
    v: "Enter a configuration through the CLI, then read it back through the programmatic interface and confirm both views show identical content, and that a bad command is rejected with a pointer to the offending token.",
    dep: ["config-data-models","config-datastore","aaa-and-rbac"]
  },
  "config-data-models": {
    s: "Machine-readable schemas describing every configurable and observable item on the switch, giving the CLI, API servers, validation and documentation a single source of truth.",
    d: "A model defines containers, lists, types, ranges, defaults, and constraints between fields, for both configuration and read-only operational state. Standards bodies publish common models and vendors add extensions for features the common ones lack. Code is generated from the models for validation, the CLI and the APIs. The difficulty is coverage and drift: models for one feature may be split between common and vendor forms, and every release adds, deprecates and renames nodes that existing automation depends on.",
    k: ["Common standardized models vs vendor-specific models: common ones let one tool manage many vendors, but lag new features, so most deployments mix both.", "Generating interfaces from models vs hand coding them: generation prevents drift, but constrains how natural the resulting interface can be."],
    p: ["A model node whose meaning differs subtly between implementations makes the same configuration behave differently on two platforms.", "Deprecating a node without a compatibility period breaks automation silently at upgrade."],
    v: "Load the model files into a validator, push a configuration with an out-of-range value, and confirm it is rejected with the path to the failing node before anything reaches the datastore.",
    dep: []
  },
  "config-datastore": {
    s: "The persistent store of the switch's intended configuration, kept apart from running state, holding a candidate, the running version and the startup version.",
    d: "Configuration is held as a tree validated against the models. A running copy is what protocols act on; a startup copy is what boots; a candidate lets changes be staged. Writers acquire locks or work optimistically, and subscribers are told which paths changed so each daemon applies only its own portion. It is hard because many writers at once, such as a person and automation, must not interleave half-applied changes, and because a copy on disk must survive power loss mid-write.",
    k: ["Single running store vs separate candidate and running stores: a candidate allows review before applying, but doubles the states operators must reason about.", "Whole-tree locking vs path-level locking: whole-tree locks are simple and safe but block concurrent automation, while finer locks permit parallel work and invite deadlock."],
    p: ["A startup copy that was never saved leaves a switch booting into old configuration after a power cycle.", "Out-of-band edits to files on disk bypass validation and leave the store and daemons disagreeing."],
    v: "Stage a change, confirm the running view is unchanged, commit, power-cycle with the startup copy saved, and confirm the switch boots with exactly the committed configuration.",
    dep: ["config-data-models","flash-storage"]
  },
  "commit-and-rollback": {
    s: "Applies a staged configuration atomically, with validation first, an automatic revert if the operator loses access, and a history of earlier versions that can be restored.",
    d: "Commit validates the whole candidate against models and cross-feature rules, computes the difference from running, and pushes it to each daemon in dependency order. A confirmed commit starts a timer and reverts if the operator does not confirm, protecting against changes that cut off management. Each commit is stored as a numbered version for diff and restore. The difficulty is partial failure: when one daemon rejects its part after others applied, the system must roll the rest back without a window of inconsistent forwarding.",
    k: ["Two-phase apply with rollback vs best-effort apply: two-phase keeps the box consistent on failure, at the cost of slower commits and daemons that must support prepare and abort.", "Automatic revert timer vs manual rollback only: the timer rescues operators who lock themselves out, but can undo a deliberate change that merely took too long to verify."],
    p: ["A rollback restores configuration but not state created in between, such as learned entries or session resets, so the box differs from its earlier self.", "Large commits hold the datastore for seconds and starve other writers."],
    v: "Commit a change that disables the management interface with a revert timer, wait without confirming, and confirm the previous configuration is restored and the switch is reachable again.",
    dep: ["config-datastore","orchestration-agents"]
  },
  "management-api-servers": {
    s: "Network-facing servers that expose configuration and state to automation over standard remote procedure and web protocols, with sessions, authentication and encoding handled in one place.",
    d: "Servers accept requests over TLS, authenticate and authorize each one, translate paths into datastore and state database operations, and return structured data in JSON or compact binary. Some serve configuration transactions, others serve queries and subscriptions. Capabilities are advertised so clients know which models exist. It is hard because the same server must remain responsive while serving many clients, enforce per-path permissions, and never let a slow client or a huge query starve protocol processes on the same CPU.",
    k: ["One server for all protocols vs separate servers per protocol: a single server shares authorization and model logic, but couples availability, and a defect in one encoding can take all interfaces down.", "Synchronous request handling vs asynchronous with limits: asynchronous handling keeps the box responsive, but needs explicit per-client quotas and cancellation."],
    p: ["Unbounded queries for a full routing table pin a CPU core and delay protocol keepalives.", "Certificates expiring on the box silently cut off all automation at once."],
    v: "Open a TLS session from an automation client, read a model path and set a value, then confirm the same change in the CLI and that a read-only user's write is refused.",
    dep: ["config-data-models","config-datastore","aaa-and-rbac","state-database"]
  },
  "aaa-and-rbac": {
    s: "Authenticates who is connecting, authorizes what they may do with role-based rules, and records what they did, using local accounts or central authentication servers.",
    d: "Every interface asks the same module to verify credentials: local users, keys, certificates, or remote directory and token services. Roles map to permitted commands or model paths, and an accounting record is written for each session and change. Remote servers can be unreachable, so a defined fallback order is needed. It is hard because the box must still be reachable during an outage of the very system that authenticates it, without leaving an unaudited backdoor.",
    k: ["Remote authentication with local fallback vs remote only: fallback keeps the box reachable during outages, but a forgotten local account becomes a permanent weak point.", "Command-level authorization vs model-path authorization: command rules are easy to read, but model-path rules apply identically to every interface that edits the same data."],
    p: ["Authorization rules written for the CLI do not apply to the API, leaving a second route to the same change.", "Accounting logs lost on reboot erase who made the change that caused an outage."],
    v: "Log in as a read-only role and attempt a configuration change through every interface; confirm each is refused and logged with user, source address and attempted action.",
    dep: ["syslog-and-event-log"]
  },
  "management-port-and-vrf": {
    s: "A dedicated out-of-band Ethernet port and separate routing context so management traffic stays reachable and isolated even when the forwarding plane is misconfigured or down.",
    d: "The port connects to the control CPU directly, bypassing the switching silicon, and lives in its own routing instance with its own default route. Management services bind to that instance, while data-plane routing cannot reach it. Some boxes allow management over in-band ports as well, with the same service reachable in both contexts. The difficulty is leakage and ordering: services started before the instance exists bind to the wrong one, and a bad route can misdirect management traffic.",
    k: ["Out-of-band port only vs in-band management too: out-of-band survives fabric outages, but needs a second network and cabling; in-band is cheaper but fails when the fabric does.", "Dedicated management routing instance vs shared default table: isolation prevents data routes from capturing management, but each service must be told which instance to use."],
    p: ["A service started before the management instance is configured binds to the global table and becomes reachable from the data network.", "Both a management route and a data route cover the same prefix, so replies leave on the wrong interface."],
    v: "Withdraw all data-plane routes and take every front-panel link down, and confirm an operator can still reach the box through the management port and run a command.",
    dep: ["vrf-manager","kernel-network-stack"]
  },
  "zero-touch-provisioning": {
    s: "Lets a newly racked switch obtain its address, software image and configuration automatically from the network on first boot, with no console visit.",
    d: "On first boot with no configuration, the switch requests an address and receives pointers to a provisioning server. It downloads a script or configuration, verifies its signature or checksum, installs the required image if needed, applies configuration and reports success. The state machine must handle interrupted downloads, wrong images and servers that never answer. It is hard because it runs before any hardening exists, so the exchange must establish trust from nothing, and a mistake lands a misconfigured box in a remote location.",
    k: ["Signed provisioning payloads vs trust the local network: signatures stop a rogue server from installing code, but require key distribution that must exist before the box ever boots.", "Pull from a central server vs push by the controller: pulling works for boxes that boot anywhere, while pushing requires the box be known and reachable first."],
    p: ["A box that fails provisioning loops forever, and in the meantime accepts traffic with a blank configuration.", "Factory-default credentials remain active between first boot and the first configuration being applied."],
    v: "Wipe a lab switch, boot it with only a management cable attached, and confirm it fetches its image and configuration and reaches a state the controller reports as in-service with no console input.",
    dep: ["image-management","config-datastore","management-port-and-vrf"]
  },
  "streaming-telemetry": {
    s: "Pushes selected counters and state changes from the switch to collectors continuously at configured intervals or on change, replacing slow periodic polling.",
    d: "Collectors subscribe to model paths. The switch samples values on a timer or sends them when they change, encodes them compactly and streams them over a long-lived connection. Internally it reads from the state database and from hardware counters through the abstraction layer. It is hard at scale: thousands of counters across thousands of ports at one-second intervals can consume real CPU and bandwidth, so the system needs sampling rules, batching, back pressure and a way to drop data without blocking forwarding.",
    k: ["Streaming on change vs periodic sampling: on-change is cheap for rare events but misses rates, while periodic sampling gives a regular series at a constant cost.", "Compact binary encoding vs readable text: binary cuts CPU and bandwidth considerably, but is harder to debug by hand."],
    p: ["Hundreds of subscriptions at one-second intervals pin the CPU and delay protocol timers.", "A stalled collector with no back-pressure policy makes the switch buffer data until memory runs out."],
    v: "Subscribe to one port's byte counter at one-second intervals while sending a known traffic rate, and confirm the received series matches the generator's rate within one counter interval.",
    dep: ["state-database","counters-and-drop-reasons","management-api-servers"]
  },
  "syslog-and-event-log": {
    s: "Collects timestamped messages from every process into a persistent local log and forwards them to remote servers, with severity levels and rate limiting.",
    d: "Each daemon writes events with a severity, facility and structured fields to a local logging service. The service keeps a bounded on-box log in flash or memory, filters by severity, and forwards matching messages to remote collectors over reliable or best-effort transport. Critical events such as link flaps, protocol changes and hardware faults are also exposed as notifications. It is difficult because logging must never block the process that is failing, while still keeping the messages that explain a crash.",
    k: ["Log to flash vs log to memory only: flash retains evidence across reboot but wears out under heavy logging, while memory loses the most interesting logs exactly when the box restarts.", "Rate limiting at source vs at the collector: source limits protect the CPU in a storm but may drop the very first, most informative message."],
    p: ["A flapping link produces thousands of messages a second that bury the root cause and exhaust flash writes.", "Clocks that were wrong at boot stamp early messages with the wrong time, breaking correlation with other devices."],
    v: "Pull a cable and confirm a link-down message appears locally and at the remote collector within a second, carrying the correct port name and a timestamp matching a reference clock.",
    dep: ["time-sync","flash-storage"]
  },
  "port-mirroring": {
    s: "Copies traffic from selected ports, VLANs or filters to a monitoring port or tunnel so analyzers can inspect it without sitting inline.",
    d: "A session defines sources, direction, optional filters and a destination, which may be a local port or a tunnel to a remote analyzer. The abstraction layer programs the silicon to replicate matching packets, optionally truncating or sampling them. Mirroring uses replication bandwidth and queue space. It is hard because mirrored copies compete for egress capacity, so a busy source can overrun the destination, and the copy can distort the production traffic if both share the same buffers.",
    k: ["Mirror at ingress vs at egress: ingress shows what arrived, including packets later dropped; egress shows what was actually sent, after rewriting and queueing.", "Local destination port vs tunneled remote destination: local is simple and lossless, remote lets one analyzer serve many switches but adds encapsulation overhead and path dependency."],
    p: ["Mirroring a full-rate uplink to a slower port drops most copies and gives an analyst a misleading picture of loss.", "Forgotten sessions keep consuming resources and exposing traffic long after troubleshooting ended."],
    v: "Mirror one port to an analyzer while sending a numbered packet stream, and confirm every sequence number appears at the analyzer, at truncation length if set, and that production traffic is unaffected.",
    dep: ["packet-buffer","switch-abstraction-api"]
  },
  "flow-sampling-and-export": {
    s: "Samples a fraction of packets in hardware and exports their headers and interface context to collectors, giving statistical visibility of traffic mix with bounded overhead.",
    d: "The silicon selects one packet in N at an interface or flow and sends a truncated copy with ingress and egress port metadata to the CPU, which wraps batches in an export format and sends them to collectors along with periodic counter snapshots. Collectors scale the samples back to traffic estimates. It is hard because sampling rates must balance accuracy against the CPU's capacity to process samples, and a sudden burst can overwhelm the punt path and starve protocol traffic.",
    k: ["Sampling in hardware vs full flow records: sampling needs little memory and scales with port speed, but gives estimates, while full flow tracking is exact but limited by table size.", "High sample rate vs low: a high rate finds small flows, but at 100G the CPU cannot process the stream."],
    p: ["Samples share the CPU port with protocol traffic, so a high rate causes keepalive loss.", "Collectors that forget to multiply by the sampling rate underreport traffic by orders of magnitude."],
    v: "Send a known flow of fixed rate, collect samples for a minute, scale by the configured sampling rate, and confirm the estimate lies within the expected statistical error of the real byte count.",
    dep: ["cpu-port","packet-trap-manager","switch-abstraction-api"]
  },
  "drop-and-path-tracing": {
    s: "Records where and why a packet was dropped, or which queues and hops it crossed, to explain loss that counters alone only count.",
    d: "Hardware can report a drop reason, such as table miss, TTL expiry or buffer exhaustion, along with the packet's headers and the stage that dropped it. Some silicon also stamps packets with ingress time, queue depth and device identity as they cross each hop, in-band, so the path and its delays can be reconstructed at the destination. It is hard because dropped packets in hardware are not visible to software unless a trap or mirror is specifically configured, and in-band stamping changes packet size.",
    k: ["Capturing dropped packets vs counting them: capture gives full evidence for a specific loss but is expensive, while counters are always on and cheap but unspecific.", "In-band per-hop stamping vs off-path probes: stamping measures real traffic, whereas probes avoid touching production packets but may not follow the same path."],
    p: ["Tracing a drop reason in one chip family and not another leads to inconsistent troubleshooting across a mixed fleet.", "In-band stamps grow packets past the path's maximum size and cause the very loss under investigation."],
    v: "Configure an ACL to drop a test flow, send it, and confirm the drop record names the ACL stage, the ingress port and the packet's headers, and that the matching drop counter increments by the same amount.",
    dep: ["counters-and-drop-reasons","hal-event-notifications","cpu-port"]
  },
  "health-monitoring": {
    s: "Continuously checks processes, resources, sensors and forwarding sanity, and reports a single health status that automation and operators can trust.",
    d: "A monitor collects liveness from the supervisor, CPU and memory pressure, storage wear, temperature, table occupancy and protocol states, and compares them to thresholds. It combines them into a status per subsystem, raises alerts and may trigger recovery, such as restarting a service or isolating the box. It is hard to avoid noisy alarms, and to detect gray failures: a box that passes every local check but silently drops a subset of traffic.",
    k: ["Local self-checks vs external probing: local checks are quick and detailed, but cannot see what the network sees, so external probes remain necessary for end-to-end proof.", "Automatic remediation vs alert only: automatic restart fixes common faults quickly, but can hide a recurring defect or turn a transient fault into a flap storm."],
    p: ["A health check that reads only process liveness reports green while forwarding tables are corrupted.", "Thresholds copied from one platform alarm constantly on another with less memory."],
    v: "Inject a fault by killing one daemon and filling a table past threshold, and confirm the health report changes to degraded naming each cause within the configured interval, then clears after repair.",
    dep: ["process-supervisor","state-database","fan-and-thermal-control"]
  },
  "tech-support-bundles": {
    s: "Gathers logs, state snapshots, configuration and crash dumps into one archive on demand or on failure, so engineers can diagnose a problem after the fact.",
    d: "A collection framework runs registered scripts from each component: logs, database dumps, hardware register reads, counters, process lists and core files from crashed daemons. It compresses them into a bundle, redacts secrets, and optionally uploads it. Cores are captured by the kernel with limits on size and number. It is hard because the box that needs diagnosis is often already overloaded, and the bundle must complete quickly, stay bounded in size, and never expose credentials.",
    k: ["Collect everything vs collect per symptom: everything makes triage possible without a second visit, but is large and slow; targeted bundles are faster but may omit the clue.", "Automatic collection on crash vs manual only: automatic capture preserves volatile evidence, but may fill flash with repeated bundles from a crash loop."],
    p: ["A crash loop produces core files until flash fills, and the box then cannot save its configuration.", "Bundles include configuration with embedded keys and are uploaded without redaction."],
    v: "Kill a daemon with a fatal signal and confirm a bundle appears containing its core file, log tail and a state snapshot, with credentials masked, and that the total size stays within the configured cap.",
    dep: ["syslog-and-event-log","flash-storage","state-database"]
  },
  "control-data-plane-split": {
    s: "The boundary between software that decides what to do with packets and silicon that does it at line rate, and the interface by which one programs the other.",
    d: "The control plane runs on a modest CPU and handles protocols, learning and configuration. The data plane forwards every packet in hardware using tables the control plane fills in. Few packets should reach the CPU, and none of the common ones. This split shapes every other decision: what must be programmable, how fast tables can change, how much the CPU can be asked to do, and what happens to forwarding when software is slow or down. Features that need per-packet decisions only software can make are costly.",
    k: ["Hardware forwarding of everything common vs software forwarding for flexibility: hardware gives line rate and low latency, but any new behavior must fit what the chip implements.", "Tight coupling with chip pipelines vs a generic model: tight coupling exposes every capability, but ties software to one silicon generation."],
    p: ["A feature the chip cannot do in hardware silently falls to the CPU and collapses under load.", "Assuming a table update is instant, protocols advertise routes before the chip can forward on them."],
    v: "Stop every control-plane process on a lab switch with established flows and confirm forwarding of existing flows continues at line rate until their table entries age out or are changed.",
    dep: []
  },
  "scale-and-resource-limits": {
    s: "The finite sizes of tables, queues, memory and CPU on the box, and the policies that decide who gets what and what happens at the limit.",
    d: "Every resource has a hard ceiling: MAC entries, routes, next hops, ACL rows, tunnels, buffers, process memory and CPU time. Software must publish those limits, divide them among features, signal approaching exhaustion and degrade predictably. A fabric with one box at its limit behaves differently from the rest, and the failure often appears at a distance, as a route that is not installed. Capacity planning needs the numbers from real silicon, not the datasheet.",
    k: ["Fixed partition of table memory vs dynamic sharing: fixed partitions are predictable, but waste space, while sharing uses memory fully and lets one feature starve another.", "Fail closed vs fail open at exhaustion: refusing new entries protects existing ones, but drops new flows, while evicting old entries keeps accepting new state and breaks what worked."],
    p: ["A table fills quietly, and routes are accepted by software but never reach hardware.", "Limits measured with one feature enabled do not hold once several features share the same memory."],
    v: "Fill each table to its published limit with synthetic entries, then add one more, and confirm software reports the failure explicitly, existing traffic is unaffected and a counter shows the rejected install.",
    dep: []
  },
  "convergence-and-failure-handling": {
    s: "How quickly and safely the switch and network reach a consistent forwarding state after a link, node or process fails, and how much traffic is lost in between.",
    d: "Convergence time is the sum of detection, propagation, computation and hardware reprogramming. Each stage has choices: fast hardware link signals or probes, protocol timers, incremental route computation, pre-installed backup paths. The same pressure shapes every layer: failures must be detected in milliseconds without making the network flap on transient noise, and software must change tables in bulk without blocking forwarding. Process failures inside the box matter as much as link failures.",
    k: ["Aggressive detection timers vs conservative timers: fast timers cut outage time but cause false positives and flaps when the CPU is busy.", "Precomputed backup paths vs reactive recompute: backups switch in microseconds in hardware, but consume table space and cover only anticipated failures."],
    p: ["Timers tuned for a lab are too tight for a loaded CPU, and a brief stall tears down every session.", "Hardware reprogramming lags behind protocol convergence, so routes are announced before the chip forwards on them."],
    v: "Fail one link under steady traffic from a precision generator and measure packets lost between the failure and recovery, then repeat with the control CPU loaded to confirm the figure holds.",
    dep: []
  },
  "hardware-portability": {
    s: "How much of the stack runs unchanged across different silicon, boards and vendors, and where the differences are confined.",
    d: "A portable stack defines a stable abstraction for switching, with vendor adapters beneath and platform descriptions beside it. Everything above uses generic objects and learns capacity and features through discovery. Portability is never complete: chips differ in table layout, buffer architecture, counters and supported actions, and the abstraction must either expose the least common set or let capabilities show through. The cost of choosing wrongly appears when a feature works on one platform and silently does nothing on another.",
    k: ["Lowest common denominator abstraction vs exposing chip features: the common set keeps behavior identical, but hides useful hardware, while exposure invites platform-specific code in every layer.", "One image for all platforms vs an image per platform: one image simplifies operations, but grows large and couples release cycles of unrelated hardware."],
    p: ["A feature supported on the reference chip is assumed everywhere and fails only at deployment on another.", "Subtle counter semantics differ by chip, so the same dashboard means different things on different boxes."],
    v: "Run the same configuration and test suite on two different chip families and confirm identical forwarding results, with any unsupported feature reported as a capability error rather than silently ignored.",
    dep: []
  },
  "upgrade-without-traffic-loss": {
    s: "The set of design choices that let software be replaced or restarted while the box keeps forwarding, and which failures an upgrade is allowed to cause.",
    d: "Hitless upgrade needs forwarding to continue from hardware while control software restarts, which means state must be reconstructable, protocols must tell peers to wait, tables must be re-verified without being cleared, and interfaces between components must be versioned. It constrains design from the start: schemas must evolve compatibly, daemons must tolerate old and new peers, and hardware programming must be idempotent. The cost is testing every pair of old and new versions.",
    k: ["Full hitless upgrade vs a short, planned outage with fast reboot: hitless protects traffic but multiplies complexity and test matrices, while a fast reboot is simple but needs redundant paths.", "Strict version compatibility windows vs unrestricted upgrades: windows bound the test matrix but force operators through intermediate releases."],
    p: ["Schema changes that are not backward-compatible make the new software unable to read state saved by the old.", "The upgrade path was tested from the previous release only, and fails when the field is two versions behind."],
    v: "Run a full upgrade under a line-rate packet stream with sequence numbers, and confirm the number of lost packets is zero or within the documented bound, and that all neighbors stayed established.",
    dep: []
  },
  "observability-by-design": {
    s: "Making the box inspectable from the start: every table, queue and decision exposes counters, state and reasons, so failures can be explained, not just detected.",
    d: "Observability is a design property, not an added tool. Each component exposes its inputs, outputs and the reason for each decision: why a route was chosen, why a packet was dropped, why a link went down. These need stable names, consistent semantics and a cheap way to read them in hardware and in software. Without it, operators resort to guessing and to disruptive experiments in production.",
    k: ["Always-on counters vs enabling on demand: always-on provides history for events that already happened, but costs hardware resources, while on-demand saves resources and misses the first occurrence.", "Reasons recorded at the source vs inferred later: source records are accurate but need more storage and design effort, while inference is cheaper and sometimes wrong."],
    p: ["A counter exists but its definition differs between software and hardware, so totals do not add up.", "Diagnostic output is added late and uses names that do not match the configuration model, so operators cannot connect them."],
    v: "Induce each class of loss one at a time and confirm that for every case a counter, event or record names the specific cause, with no case reported only as unknown.",
    dep: []
  }
});
