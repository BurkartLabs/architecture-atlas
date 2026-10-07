// Details for the endpoint detection and response plate, part E: update channel and performance and offline operation.
ATLAS.details("edr-agent", {
  "update-manifest": {
    s: "A signed description of what the agent should be running: component and content versions, hashes, sizes, download locations, dependencies and rollout conditions for this device.",
    d: "The agent asks for its manifest at intervals and after policy changes. The backend resolves which versions apply to the device from its ring, platform, OS version and hardware, and returns a document listing each artifact with its hash and signature. The agent compares with what is installed, downloads differences and applies them in dependency order. It is hard because the manifest encodes every rollout decision, so an error in resolution sends the wrong build to a class of machines.",
    k: ["Backend decides per device vs agent decides from a global feed: per-device resolution allows precise rings and holds; a global feed is simple, cacheable and gives no per-device control.", "Pin exact versions vs allow ranges: exact pins make behavior reproducible; ranges let the cloud steer without manifests changing."],
    p: ["A resolution bug assigns a build for one OS version to machines running another.", "A manifest cached by an intermediary serves an old version after a withdrawal."],
    v: "Request manifests as three devices in different rings and OS versions, and confirm each receives the correct versions and hashes, and a withdrawn version no longer appears within the cache lifetime.",
    dep: ["signed-policy-verification","secure-transport","staged-rollout-rings"]
  },
  "update-signature-verification": {
    s: "Checking that every downloaded binary and content package is signed by the vendor and matches the manifest hash before it is installed or loaded.",
    d: "Downloads are written to a staging area the agent controls, hashed and verified against the manifest, whose own signature is verified against embedded trust anchors. Only after verification are files moved into place, atomically, and loaded. Verification protects against a malicious mirror, a corrupted download and a downgrade. The difficulty is time-of-check to time-of-use: a verified file must not be replaceable before it is loaded, so staging directories are protected and verification is repeated at load.",
    k: ["Verify at download only vs again at load: once is cheap and exposed to swapping; repeating closes the gap and costs time at start.", "Delta packages vs full packages: deltas save bandwidth and need a verified base; full packages are self-contained and large."],
    p: ["The staging directory is writable by other users, so a verified file is replaced before installation.", "A delta applied to the wrong base produces a corrupted binary that still passes a weak check."],
    v: "Alter one byte of a staged package and a manifest hash in separate tests, and confirm both are rejected before any file is installed, nothing in the install directory changes, and the failure is reported.",
    dep: ["update-manifest","signed-policy-verification","binary-integrity-checks"]
  },
  "staged-rollout-rings": {
    s: "Releasing each change to progressively larger groups of machines, such as vendor test hosts, volunteers, a small share of customers and then everyone, with gates between stages.",
    d: "A release moves through rings, each with a minimum population and soak time. Gates check health signals: crash rate, boot failures, resource use, detection rate, false-positive reports and update success. A failed gate halts the release and can trigger rollback. Customers may choose slower rings for critical machines or hold versions. The difficulty is that problems appear only on rare configurations a small ring does not contain, and that urgent detection content competes with the slow, careful path.",
    k: ["Slow rings for all changes vs fast path for urgent content: slow rings catch more defects; a fast path protects against active attacks at higher risk.", "Vendor-chosen rings vs customer-chosen: vendor control gives uniform safety data; customer control matches their risk and fragments the telemetry."],
    p: ["The early rings contain only common hardware, and a driver conflict on rare hardware appears only at general release.", "An emergency content update skips all rings and reaches every machine within minutes."],
    v: "Release a build with a deliberately injected boot failure to the first ring on a lab fleet, and confirm the gate trips on the failure signal, the rollout halts before the next ring and the affected devices are listed.",
    dep: ["update-manifest","agent-health-reporting","agent-crash-reporting"]
  },
  "content-updates": {
    s: "Frequent data-only updates of detection rules, indicators, model files and configuration that change what the agent detects without replacing its executable code.",
    d: "Content packages are signed, versioned, small and fast to load, and arrive in minutes, not weeks. The agent validates structure and semantics (does every rule compile, is every reference resolvable) in a safe parser before activating, and keeps the previous version for rollback. Content is how vendors respond to a new attack quickly. The difficulty is that content is code in all but name: a malformed or over-broad rule can crash a parser, spike CPU or block critical software on every machine at once.",
    k: ["Frequent content updates vs infrequent binary updates: frequent content keeps detections current and moves risk into the content parser; binary-only updates are slow to respond to new attacks.", "Validate in the agent vs only in the pipeline: agent-side validation is the last defense against a bad file; pipeline-only validation is cheaper and trusts the vendor's tests."],
    p: ["A content file passes the pipeline's checks and triggers an out-of-bounds read in the agent's parser.", "A rule that is correct but matches a ubiquitous system process is released to everyone at once."],
    v: "Deliver valid, malformed and oversized content packages to a lab host, and confirm the valid one activates and changes detection, the others are rejected without crash, and the previous version remains active.",
    dep: ["update-signature-verification","kernel-trust-and-stability","local-rule-engine"]
  },
  "automatic-rollback": {
    s: "Detecting that an update made the agent or host unhealthy and reverting to the previous known-good version without waiting for a person.",
    d: "Before applying an update the agent preserves the old version and marks the new one as pending. After restart it must complete a health check within a window: services up, sensors loaded, backend contact made, system boots. If it fails or the host crashes repeatedly, the boot logic or the supervisor restores the previous version and reports. The backend halts the rollout on the same signals. The difficulty is the case where the failure prevents the agent from running at all, so the rollback logic must live in something that still starts.",
    k: ["Local self-rollback vs backend-ordered rollback: local rollback works when the network is down and the machine is isolated; backend rollback has fleet context and needs connectivity.", "Roll back on any failed check vs on repeated failures: any failure is safe and may revert on a transient glitch; repeated failures avoid flapping and extend exposure."],
    p: ["The new version crashes the host at boot before the rollback logic can run.", "The old version is deleted to save space, so there is nothing to roll back to."],
    v: "Install a build that fails its health check on a lab host, and confirm after the health window the previous version is restored, the host reports the rollback with reason, and the rollout stops for later machines.",
    dep: ["service-supervisor","staged-rollout-rings","local-state-store","boot-time-protection"]
  },
  "os-compatibility-gating": {
    s: "Preventing an agent or content version from reaching operating system builds, drivers or hardware it has not been validated against.",
    d: "The manifest carries compatibility rules per artifact: supported OS versions, kernel builds, architectures and conflicting software. The agent evaluates them locally before installing and reports unsupported states. New OS releases and updates are tested in advance, and until a version is validated, the agent runs in a restricted mode or holds its kernel component on the previous build. The difficulty is the speed of OS release channels, early-access builds on a developer's machine and kernels with unannounced changes in structure layout.",
    k: ["Block unvalidated OS versions vs run with reduced features: blocking is safe and leaves machines unprotected; reduced mode keeps user-space protection and loses kernel visibility.", "Allow-list known kernels vs rules by version range: lists are precise and need constant maintenance; ranges are low effort and assume future builds behave."],
    p: ["A kernel update from the OS vendor lands the day before validation finishes, and fleets crash on boot.", "Compatibility data lags behind a distribution's custom kernel builds."],
    v: "Simulate an unvalidated kernel version on a lab host, and confirm the agent does not load the kernel component, runs in reduced mode, and the console shows the gating reason.",
    dep: ["update-manifest","kernel-component-safety","degraded-and-safe-mode"]
  },
  "update-distribution": {
    s: "How update files physically reach millions of machines: content delivery networks, regional mirrors, peer sharing inside a site and bandwidth limits.",
    d: "Artifacts are hosted on edge caches by hash, so every request is cacheable and verifiable regardless of who serves it. Sites may designate a local peer that downloads once and shares on the network, or use a customer's own proxy. The agent resumes partial downloads, throttles during business hours and picks mirrors by latency. The difficulties are bursts when a critical update must reach everyone quickly, branch offices on slow links and customers who allow only specific destinations through firewalls.",
    k: ["Peer sharing inside the site vs direct download only: peer sharing saves wide-area bandwidth and adds a lateral channel an attacker can abuse; direct download is simple and costly.", "Content addressed by hash vs by version name: hash addressing is cacheable and verifiable; version names are easy to read and can be overwritten."],
    p: ["Ten thousand machines in one office pull a large update simultaneously and saturate the site link.", "A firewall allowlist contains the old download hostname and the update silently never arrives."],
    v: "Release a test artifact and measure on a lab site that only one machine fetches it from the wide area, peers receive it from that machine, all verify the hash and a throttled download stays under the bandwidth cap.",
    dep: ["update-manifest","update-signature-verification","secure-transport"]
  },
  "resource-governor": {
    s: "The agent's internal controller that measures its own CPU, memory, disk and network use and slows, defers or sheds work to stay within its limits.",
    d: "Each module registers its costs and priorities. The governor samples usage, compares with budgets and host load, and applies actions: lowering scan thread priority, pausing hashing, widening batching intervals, dropping low-priority events and delaying inventory. Kernel paths cannot be throttled by waiting, so they use fast-path shortcuts such as skipping trusted programs. It aims for the user never noticing, even in a build or video encode. The difficulty is deciding priority honestly: protection work must continue under load, and attackers can create load to induce shedding.",
    k: ["Throttle by host load vs fixed rate limits: load-based throttling stays invisible and ties protection to machine state an attacker can influence; fixed limits are predictable and wasteful.", "Shed detection work vs shed telemetry first: shedding telemetry keeps blocking intact and loses investigation data; shedding detection saves more and weakens protection."],
    p: ["An attacker starts a CPU-heavy process to push the governor into a low-protection mode.", "Throttling a scan until it never finishes leaves files permanently unscanned."],
    v: "Run a heavy compile on a lab host, and confirm agent CPU stays under its cap, user-visible latency does not change measurably and the governor reports which work was deferred and for how long.",
    dep: ["self-measurement","module-framework"]
  },
  "self-measurement": {
    s: "Continuous measurement of the agent's own cost and latency, per module and per event type, reported to the backend and used to catch performance regressions before customers do.",
    d: "Instrumentation records CPU time, memory, I/O, event rates, queue depths and the latency the agent adds to file opens and process starts, as histograms rather than averages. Samples are sent as health data and compared across versions in the early rings, so a release that adds ten percent CPU is stopped there. Profiles identify the processes and paths causing expense, which feeds exclusions and filters. The difficulty is the measurement's own overhead and getting representative workloads.",
    k: ["Histograms of latency vs averages: histograms expose tail latency that users feel; averages are smaller and hide the worst cases.", "Always-on lightweight counters vs on-demand profiling: counters give a continuous fleet picture; profiling gives detail and is run only when asked."],
    p: ["An average CPU figure looks fine while a few machines run the agent at a full core.", "Instrumentation overhead exceeds the cost of the feature being measured."],
    v: "Introduce a known extra cost of one millisecond in one hook on a lab build, and confirm the per-version latency histogram shows the shift and the rollout gate flags the regression.",
    dep: ["agent-health-reporting","module-framework"]
  },
  "scan-throttling": {
    s: "Limits how fast and when the agent scans files and memory, by priority, user activity, power state and per-file cost, so scanning completes without hurting interactive work.",
    d: "On-access scans are cached by file identity and modification time, so unchanged files are not rescanned. Full-disk scans run at low priority, pause during activity, skip files the policy marks trusted, and resume from a checkpoint. Large archives and databases are limited by size and depth. Scheduled scans avoid battery use and busy hours. The difficulty is covering everything eventually while never blocking the user, and the weak point that skipped or truncated scanning gives attackers, who may hide in oversized files.",
    k: ["Cache verdicts by file identity vs rescan on every access: caching is the main performance win and can be fooled by timestamp manipulation; rescanning is thorough and slow.", "Scan only on write and execute vs full scans: event-driven scanning is cheap and misses dormant files; full scans find them with a heavy periodic cost."],
    p: ["A size limit skips a large file, and an attacker pads their payload past the limit.", "A scheduled full scan starts at the beginning of a shift on every machine at once."],
    v: "Start a full scan during a lab workload, and confirm interactive latency stays within target, scan progress pauses when the user is active and resumes from its checkpoint after a reboot.",
    dep: ["resource-governor","file-system-filter","local-verdict-cache"]
  },
  "offline-operation": {
    s: "How the agent keeps protecting and recording while disconnected: local detection, cached verdicts, a bounded queue of events and a safe procedure for reconnecting.",
    d: "With no network the agent continues local rules, the classifier, cached reputation and allow and block lists. Events go to the persistent queue and local history. Response commands cannot arrive, so local automatic prevention matters more. On reconnection the agent re-authenticates, uploads priority items first, receives missed policy and handles stale commands. Laptops spend much of their life in this state. The difficulty is bounded storage, the staleness of intelligence and handling long clock drift while offline.",
    k: ["Protect with local intelligence only vs restrict actions when offline: local-only keeps users productive; restrictive offline modes are safer for high-risk hosts and block work.", "Ship large intelligence sets to the agent vs query on demand: large sets work offline and use space and update bandwidth; on demand is lean and fails offline."],
    p: ["A laptop offline for a month returns with intelligence that is a month old and a queue that dropped the first week.", "Offline machines go unnoticed because the console only alerts on active ones."],
    v: "Disconnect a lab host for two hours, run a benign attack simulation, and confirm local detection fires, events queue in order, and on reconnect all arrive once with correct original timestamps.",
    dep: ["persistent-event-queue","local-verdict-cache","local-rule-engine","batch-and-upload"]
  },
  "local-verdict-cache": {
    s: "A bounded on-disk and in-memory store of recent verdicts for files, signers, addresses and domains, answering repeated and offline decisions without asking the cloud.",
    d: "Entries map a content hash or other key to allow, block or unknown with a source, a confidence and a time to live. Memory holds a hot set for the fast path, disk holds a larger set that survives reboot. Entries expire so that reclassifications reach the machine, and a push can invalidate a hash fleet-wide. It removes most cloud calls and most latency. The difficulty is correctness over time: a stale allow is a security hole, a stale block an outage, and a cache that is corruptible is a bypass.",
    k: ["Long lifetimes vs short: long lifetimes improve offline behavior and cut load; short lifetimes make new classifications take effect quickly.", "Cache negative verdicts (unknown) vs only definite ones: caching unknowns avoids repeated lookups for new files; it delays the effect of a later classification."],
    p: ["A file cleared as benign is later found malicious, and the cached allow keeps it running for days.", "An attacker poisons the cache by writing entries to the store file."],
    v: "Classify a test file as benign, cache it, then push a block for its hash, and confirm the next launch is denied within the invalidation interval and the cache records the new verdict with source.",
    dep: ["local-state-store","indicator-matching","reputation-and-enrichment"]
  },
  "software-coexistence": {
    s: "Working beside other security tools, backup software and developer tools that also hook the same file, process and network paths, without conflicts, double scanning or deadlocks.",
    d: "Two filters in the same stack can each trigger the other's scans, producing loops and large slowdowns, or fight over exclusive resources. Mitigations include registering at defined positions in the filter order, using the OS's official security-provider registration, recognizing and skipping other scanners' I/O, exchanging exclusion recommendations and detecting known conflicting products at install. Vendors publish compatibility guidance. The difficulty is that conflicts appear only in combination, and the support burden falls on the vendor whose agent is blamed.",
    k: ["Detect and step aside for another security product vs run both: stepping aside avoids conflict and creates a gap; running both doubles protection and cost and risks deadlock.", "Fixed filter position vs dynamic placement: fixed positions are predictable; dynamic placement adapts and is harder to test."],
    p: ["Two products scan each other's reads, producing recursion and a machine that takes minutes to boot.", "Backup software holds files open and the agent's scan of them stalls the backup window."],
    v: "Install a second filter-based product on a lab host, run file-copy and boot benchmarks, and confirm no recursion, boot time and copy throughput stay within the documented overhead and the agent reports the other product.",
    dep: ["file-system-filter","exclusion-management","resource-governor"]
  },
  "degraded-and-safe-mode": {
    s: "Predefined reduced modes the agent enters when a component fails, a resource is exhausted or the OS is unsupported: it keeps what it safely can and says plainly what it lost.",
    d: "Levels may include: full; kernel sensor unavailable, running on user-space sensors and tracing probes only; no cloud, local only; and a minimal mode that keeps self-protection and the heartbeat. Entry and exit conditions are explicit, the state is reported to the backend, and policy says what to do with each condition, such as whether to isolate a server that has lost its sensor. The difficulty is making each mode genuinely tested, since modes entered rarely tend to be broken when they are needed.",
    k: ["Degrade gradually vs a single safe state: gradual modes keep as much protection as possible and multiply the states to test; a single safe state is simple and loses more.", "Report degraded state loudly vs quietly: loud reporting gets it fixed and creates alert volume; quiet states hide a protection gap."],
    p: ["A degraded mode that is never tested crashes on first use during a real failure.", "A machine stays in degraded mode for months because the alert is treated as informational."],
    v: "Force each failure condition on a lab host, and confirm the agent enters the documented mode, keeps the listed protections working with a test attack for each, and the console shows the mode and reason.",
    dep: ["service-supervisor","agent-health-reporting","kernel-component-safety"]
  },
  "boot-time-protection": {
    s: "Protection that starts early enough to see and stop activity from the first moments of boot, before ordinary services run, and the work to keep boot time and reliability intact.",
    d: "Components register as early-start drivers or services so sensors load before most software and before user logon. Early-launch hooks let the agent vet other drivers before they load. Everything on this path adds to boot time, so initialization is deferred and parallel, and heavy work such as cache loading waits until after logon. The difficulty is that an early-start component that fails can prevent the machine from booting, which is why failure handling there is conservative, with a boot-failure counter that disables it after repeated crashes.",
    k: ["Start as early as possible vs after core services: early start sees bootkits and driver loads; later start is more stable and misses the earliest activity.", "Disable the early component after repeated boot failures vs retry always: disabling restores the host and removes protection; retrying keeps protection and may loop."],
    p: ["An early driver waits on a service that has not started, and boot stalls.", "A bootkit loads before the agent and hides from every later check."],
    v: "Measure cold boot time to logon with and without the agent on a lab host and confirm the added time is under the budget; force three consecutive failures of the early component and confirm the host boots with it disabled and reports why.",
    dep: ["service-supervisor","module-load-monitor","kernel-component-safety","automatic-rollback"]
  },
});
