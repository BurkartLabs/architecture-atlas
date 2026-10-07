// Details for the IoT fleet plate, part 2: shadows and twins, commands and jobs, firmware updates.
ATLAS.details("iot-fleet", {
  "device-shadow": {
    s: "A cloud-held document per device that stores the state it last reported and the state applications want it to have, readable and writable while the device is offline.",
    d: "Applications write desired values to the shadow and read reported values from it, instead of talking to the device. The device subscribes to its shadow, receives desired changes when it connects, applies them and reports the result. Shadows decouple the lifetimes of the app and the device: either can be offline. A shadow can be split into named parts such as configuration and status. The difficulty is that it is a convenience copy, not the device: reported state is only as true as the last report.",
    k: ["Shadow as the control interface vs direct commands: shadows give durable intent and reads while offline, but express only state, not one-time actions.", "One large document vs several named shadows: named parts limit write contention and message size, but multiply the objects to manage."],
    p: ["Treating reported state as live truth leads to decisions based on a reading hours old.", "A very large shadow document exceeds the device's memory or message limit and stops syncing."],
    v: "Write a desired value while a test device is offline, bring it online, and confirm it receives the change, applies it and the shadow shows reported equal to desired with an updated version.",
    dep: ["shadow-store","topic-namespace","shadow-versioning"]
  },
  "desired-reported-delta": {
    s: "The three-part model of device state: what applications ask for, what the device says it holds, and the difference the device must act on.",
    d: "The desired section is written by applications, the reported section by the device. The delta is computed by the platform as the fields where desired differs from reported, and is sent to the device. When the device applies a change it updates reported, and the delta shrinks to nothing. The device may also clear a desired field it cannot honor. The difficulty is semantic: removing a key, nesting objects, and a device that applies half the delta must all produce a delta that converges rather than loops.",
    k: ["Delta computed by the platform vs by the device: platform-computed deltas keep devices simple and small, but lock in one definition of difference for all firmware.", "Merge-patch semantics vs full replacement on write: patches are small and avoid overwriting concurrent edits, but cannot express deletion of a field without a convention."],
    p: ["A device that cannot apply a value never reports it, so the delta persists and the device is re-sent the same change forever.", "Two applications writing different desired values to one field silently overwrite each other."],
    v: "Set desired to a value the test device rejects, and confirm the device reports an error or clears the field and the delta stops being re-sent, rather than repeating at every reconnect.",
    dep: ["device-shadow","shadow-versioning"]
  },
  "shadow-versioning": {
    s: "A monotonically increasing version on each shadow, used to detect stale writes and to let devices and applications order changes correctly.",
    d: "Every accepted write increments the version, and messages carry it. A writer can say update only if the version is still N, which turns a lost-update race into a visible conflict. Devices compare the incoming version to the one they last applied and ignore older messages arriving late. Versions are per shadow and per section as needed. The difficulty is that a device which loses its stored version after a reset must re-sync from the platform, and one that jumps backwards must not be treated as an attack or a bug.",
    k: ["Optimistic version checks vs last write wins: version checks prevent silent overwrites, but force writers to retry on conflict.", "Version per document vs per field: per-document is simple to reason about, but busy shadows conflict more often than necessary."],
    p: ["Devices that ignore the version apply an older delayed message over a newer one.", "A shadow restored from backup has a lower version than devices remember, so devices reject all new changes."],
    v: "Send two writes with the second delivered first, and confirm the device ends in the state of the higher version. Submit a write with a stale expected version and confirm it is rejected with a conflict.",
    dep: ["shadow-store"]
  },
  "twin-schema-validation": {
    s: "Rules that define which fields a device's state may contain, with types, ranges and units, enforced when state is written so bad values never reach applications.",
    d: "Each device type links to a schema for its shadow or twin and for its commands. Writes from applications and reports from devices are validated, and failures are rejected or flagged, with the reason returned to the writer. Schemas are versioned and compatible with older firmware that reports a subset. Some systems extend this to a richer model describing relationships between assets. The difficulty is evolution: a stricter rule breaks old devices at the moment it deploys.",
    k: ["Reject invalid state vs accept and flag: rejecting protects consumers, but a device with a bug cannot report anything, even its error; flagging keeps the data and the problem visible.", "Strict schemas vs open ones with extension fields: strict schemas catch mistakes early, but slow experimentation with new device features."],
    p: ["Tightening a range check rejects the valid reports of older firmware, making healthy devices look silent.", "Validation of every report at ingestion peak adds latency and becomes the bottleneck."],
    v: "Report an out-of-range value from a test device, confirm it is rejected or flagged with a specific reason, and confirm that a report from older firmware using the previous schema version is still accepted.",
    dep: ["device-types-and-models","telemetry-schema-registry"]
  },
  "shadow-store": {
    s: "The durable, highly available storage holding millions of small, frequently updated shadow documents with low-latency reads and atomic versioned writes.",
    d: "Shadows are stored as documents keyed by device id and partitioned across nodes. Reads are served at connection time and from applications, writes arrive from devices and operators, and each write is a conditional update on the version. A cache holds the hottest documents. The store supports a change stream consumed by the event system and the search index. The difficulty is hot keys and write amplification: one device updating every second, or a million devices updating after an outage, concentrates load on single partitions.",
    k: ["Partition by device id vs by tenant: device partitioning spreads load evenly, but tenant-wide queries need the search index instead.", "Synchronous replication vs asynchronous: synchronous replication prevents losing an acknowledged write, but adds latency to every device report."],
    p: ["A device reporting in a tight loop overloads a partition and slows neighbors on the same node.", "Restoring from backup rolls back shadows, so devices and cloud disagree on what was applied."],
    v: "Update 100,000 shadows at once and confirm p99 write latency stays within target, no acknowledged write is lost after killing a node, and the change stream delivers every update exactly in version order per device.",
    dep: ["encryption-and-tenant-isolation"]
  },
  "shadow-change-events": {
    s: "A stream of notifications emitted when a shadow changes, so other systems react to device state without polling the store.",
    d: "On every accepted update the shadow store emits an event with device id, old and new values or a diff, the version and a timestamp. Consumers include the search index, rules, alerts and customer webhooks. Events are published after the write is durable and delivered at least once, so consumers deduplicate by version. The difficulty is volume and order: a device that flaps produces a stream no consumer wants, and consumers must handle events for one device arriving out of order across partitions.",
    k: ["Emit full state vs diffs: full state is easy for consumers to apply safely, but large; diffs are small but break if one is lost.", "Publish every change vs coalesce within a window: coalescing tames flapping devices, but consumers miss short-lived states."],
    p: ["Publishing before the write commits sends events for changes that are later rolled back.", "A consumer that falls behind during an outage replays millions of events and overloads downstream systems."],
    v: "Update a shadow 100 times quickly and confirm consumers see the final state, no version gap undetected, and each event carries a version so a replayed event is recognized and ignored.",
    dep: ["shadow-store","shadow-versioning"]
  },
  "command-service": {
    s: "Accepts a one-time instruction for a device, such as reboot or open valve, delivers it over the connection and tracks it to a result.",
    d: "The service validates the command against the device type's allowed commands and the caller's permissions, stores it with an id and expiry, and publishes it to the device's command topic. If the device is offline, the command waits in a queue until it returns or expires. The device acknowledges receipt and later reports the outcome. Unlike shadow state, a command is an event: running it twice is not the same as once. The difficulty is knowing what happened when the link drops mid-command.",
    k: ["Commands as events vs expressing everything as desired state: events fit actions like reboot, but desired state is naturally idempotent and recoverable after missed messages.", "Fire and forget vs tracked to a result: tracking gives certainty and audit, but needs state, acknowledgements and timeouts for every command."],
    p: ["A command delivered twice after a reconnect reboots or actuates equipment twice.", "A reboot command queued for a week executes long after its reason has gone."],
    v: "Send a reboot to an online device and confirm it reboots once with a completed result; send one to an offline device, let it expire, and confirm it never runs and is recorded as expired.",
    dep: ["command-queueing-and-ttl","command-acknowledgement","topic-namespace","topic-authorization"]
  },
  "command-queueing-and-ttl": {
    s: "Holds commands for unreachable devices and discards them after a time to live, so stale instructions never run.",
    d: "Each command has an expiry set by the caller or defaulted by device type. Queued commands are stored per device in order, with a cap on queue length. On reconnect the platform delivers pending commands that have not expired, sometimes only the newest of a kind. Queued commands can be canceled or superseded. The difficulty is deciding what a device should do on return: replaying a long backlog in order may be wrong, while delivering only the last may skip a necessary step.",
    k: ["Strict ordered replay vs latest-wins per command type: ordered replay preserves sequences, but a long offline period turns into a flood; latest-wins is cheap but loses intermediate steps.", "Per-command expiry vs a global one: per-command expiry is precise, but callers must remember to set it sensibly."],
    p: ["A door-unlock command queued while a device is offline executes hours later when conditions have changed.", "Unbounded queues for devices that never return use storage until the store fills."],
    v: "Queue five commands for an offline device with one already past its expiry. On reconnect, confirm only the four unexpired ones arrive in the documented order and the expired one is recorded as expired.",
    dep: ["command-service","shadow-store"]
  },
  "command-acknowledgement": {
    s: "The protocol steps by which a device confirms it received, started and finished a command, including failure reasons, with timeouts for each step.",
    d: "A command moves through states: queued, delivered, acknowledged, running, succeeded, failed, timed out. Delivery acknowledgement comes from the transport, while acknowledged and succeeded come from the device's application. Each transition is time-stamped. If the device does not confirm in time, the platform marks the command as unknown rather than failed, because the action may have happened. The difficulty is exactly that unknown state, and designing commands so that asking the device again is safe.",
    k: ["Transport-level acknowledgement vs application-level: transport acknowledgement is automatic but proves only receipt; application acknowledgement proves intent to act and needs device code.", "Marking timeouts as failed vs unknown: failed is simple for users, but retried commands may then run twice."],
    p: ["A device acknowledges before it persists the command and loses it in a power cut.", "Counting delivered as succeeded shows a clean report while devices ignored the command."],
    v: "Cut a test device's power after it acknowledges but before it finishes, and confirm the command ends as unknown or timed out, not succeeded, and a retry using the same command id is not applied twice.",
    dep: ["command-service","session-and-qos"]
  },
  "job-orchestrator": {
    s: "Runs one operation across many devices over time, tracking each device's progress and handling targets that are offline, slow or failing.",
    d: "A job holds a target set, a document describing the action, rollout limits, timeouts and abort rules. The orchestrator creates a per-device execution, notifies the device, records the device's status updates and moves it to a terminal state. It paces notifications, retries, and stops when too many fail. Jobs may run for weeks because devices come online irregularly. The difficulty is the sheer count of small state machines and the need to make job state agree with what each device actually did.",
    k: ["Platform pushes to devices vs devices poll for jobs: pushing is faster, but fails for devices behind restrictive networks; polling works anywhere at the cost of latency and load.", "Continuous jobs for new members vs fixed target jobs: continuous jobs keep newly added devices current, but make completion open-ended."],
    p: ["A job with no abort rule keeps delivering a broken action to the rest of the fleet while failures accumulate.", "Executions stuck in progress after a device reset never time out and inflate in-progress counts forever."],
    v: "Run a job over 1,000 test devices with 100 offline. Confirm the offline ones run when they return, per-device statuses sum to 1,000, and exceeding the abort failure rate stops new notifications.",
    dep: ["rollout-rate-control","command-service","fleet-groups","device-shadow"]
  },
  "rollout-rate-control": {
    s: "Limits how fast a job or update reaches devices, using ramps, concurrency caps and failure thresholds, so a bad change is stopped before it spreads.",
    d: "The controller releases work in waves: a small canary, then growing percentages per minute, with a cap on in-flight devices. After each wave it reads failure and health signals and either continues, pauses or aborts. Limits also protect shared resources: the firmware download service and the broker, which would otherwise face every device at once. The difficulty is choosing thresholds that fire early on a real problem but not on the ordinary background failures of any fleet.",
    k: ["Time-based ramp vs health-gated ramp: time ramps are predictable, but continue blindly; health gates stop on signals, but need trustworthy measurements.", "Per-job limits vs global limits across jobs: per-job limits are simple, but simultaneous jobs together can still overload the platform."],
    p: ["A failure threshold expressed as a percentage of started devices is meaningless in the first wave of ten devices.", "Rate limits applied only to notifications let devices that poll bypass the ramp completely."],
    v: "Launch a rollout with a 1 percent canary, inject failures above the abort threshold, and confirm the rollout stops before the second wave starts and fewer than 2 percent of devices were touched.",
    dep: ["job-orchestrator","fleet-health-metrics"]
  },
  "scheduled-jobs": {
    s: "Jobs set to start at a future time or on a recurrence, often within a per-device maintenance window such as local night time.",
    d: "A schedule defines when a job begins to roll out and optionally the window in which each device may act, using the device's own time zone from its metadata. The scheduler creates the job at the due time and the orchestrator then paces it. Maintenance windows keep updates away from peak use of equipment. The difficulty is time: daylight saving transitions, devices with wrong clocks and fleets across many zones make when mean something different for each device.",
    k: ["Device-local windows vs a single global time: local windows respect each site's quiet hours, but spread one job over a full day and complicate monitoring.", "Schedule evaluated by the platform vs by the device: platform scheduling is controllable and auditable; device-side scheduling works offline but is hard to cancel."],
    p: ["A recurring job created at a daylight saving change runs twice or not at all on that day.", "A device with a wrong clock acts in the middle of the workday because it thinks it is night."],
    v: "Schedule a job for 02:00 local time across test devices in three zones, and confirm each starts within its own window, and that a device with a skewed clock is held until its time is verified.",
    dep: ["job-orchestrator","time-synchronization","device-metadata-and-tags"]
  },
  "remote-session-tunnel": {
    s: "A short-lived, authenticated channel from an operator to a device's local service, such as a shell or web interface, opened through the outbound connection the device already holds.",
    d: "Because devices sit behind firewalls, the tunnel is initiated by the device after a signed request, connecting outward to a relay that pairs it with the operator's session. Traffic is encrypted end to end and the session has a time limit, an allowed destination port and an audit record. The tunnel is a powerful capability, so it is off by default and needs explicit approval per device. The difficulty is making it useful for support while ensuring it cannot become a permanent back door.",
    k: ["Device-initiated tunnels vs inbound access: outbound connections cross firewalls and need no open ports, but need a relay with capacity for many simultaneous sessions.", "Tunnel to any port vs allow-listed services: any port is flexible, but turns the device into an entry point to its local network."],
    p: ["A tunnel without an idle timeout stays open after the technician leaves.", "Allowing the tunnel to reach the device's local network gives an attacker a path into the customer's site."],
    v: "Open a session to a test device's diagnostic service, confirm it closes at its time limit, refuses a non-allow-listed port, and appears in the audit trail with operator and device identifiers.",
    dep: ["command-service","mutual-tls-termination","command-audit-trail"]
  },
  "command-audit-trail": {
    s: "An append-only record of who issued which command, job or update to which devices, when, with what parameters and with what result.",
    d: "Every control action writes an entry with the actor, tenant, target set, payload hash and outcome, in a store that operators cannot edit. Per-device results link back to the originating action. The trail answers what changed on this device and who asked for it. It is the basis for incident review, compliance and dispute resolution. The difficulty is size and sensitivity: large jobs create millions of entries, and parameters may contain secrets that must be recorded in redacted form only.",
    k: ["Recording full parameters vs a hash and reference: full parameters give complete evidence, but may store secrets; hashes protect them but require the originals to be kept elsewhere.", "Synchronous audit write vs asynchronous: synchronous writes ensure no action goes unrecorded, but add latency and a failure dependency to every operation."],
    p: ["Audit entries written asynchronously are lost when the service crashes, leaving an action with no record.", "Operators with database access can alter entries, which makes the trail worthless as evidence."],
    v: "Issue a command and a job, then confirm each has an entry with actor, targets and result. Attempt to modify or delete an entry with an administrator credential and confirm the store refuses.",
    dep: ["security-audit-log"]
  },
  "firmware-repository": {
    s: "Stores every firmware image and its metadata: version, target models, size, checksum, release notes, signature and status such as draft, approved or withdrawn.",
    d: "Images are uploaded by the build system, never by hand, stored immutably and referenced by version. The metadata records which device types and hardware revisions the image supports and what it requires, such as a minimum bootloader. Devices download through short-lived signed links from a content delivery layer so the origin is not hit by millions of requests. A withdrawn image stays stored but cannot be assigned. The difficulty is provenance: knowing exactly which source and build produced the bits on a device.",
    k: ["Immutable versions vs mutable tags: immutability makes every device's running image reproducible, but a bad image requires a new version rather than an edit.", "Download through a delivery network vs from the origin: a network absorbs rollout peaks and cuts cost, but needs signed, expiring links so images are not public."],
    p: ["Reusing a version number for different bits makes support unable to say what a device runs.", "Publicly guessable download links expose proprietary firmware and let anyone analyze it for flaws."],
    v: "Upload an image, then confirm its recorded checksum equals an independent hash of the downloaded file, a link expires after its lifetime, and a withdrawn image cannot be selected in a new campaign.",
    dep: ["release-signing","device-types-and-models"]
  },
  "release-signing": {
    s: "Cryptographic signing of firmware images with keys held outside the build servers, so devices accept only images from the manufacturer.",
    d: "The release process signs the image or its manifest with a private key kept in a hardware security module, after approval by more than one person. Devices hold the matching public key in protected storage and verify the signature, version and target model before installing. Keys are organized in a hierarchy so a signing key can be replaced without recalling devices, using a longer-lived root. The difficulty is key management: a leaked signing key lets an attacker install anything, and a lost one blocks every future update.",
    k: ["Signing the whole image vs a signed manifest with hashes: whole-image signing is simple, but a manifest allows verifying chunks while streaming on constrained devices.", "One signing key vs a hierarchy with a root and delegated keys: a hierarchy allows rotation and compromise recovery, at the cost of a more complex verification chain on the device."],
    p: ["Signing on a general build server leaves the key exposed to anyone who compromises the pipeline.", "Without version checks in the signed data, an attacker replays an old signed image with known flaws."],
    v: "Flip one byte in a signed image and confirm the device rejects it before installation. Present an older validly signed image and confirm the device refuses it as a downgrade.",
    dep: ["secure-boot-and-attestation"]
  },
  "compatibility-matrix": {
    s: "Rules stating which firmware versions can install on which hardware revisions and from which starting versions, so impossible or unsafe updates are never offered.",
    d: "Each release records the hardware revisions it supports, the earliest version it can upgrade from, and any mandatory intermediate versions. The campaign service checks every target device against these rules before scheduling it and reports the devices excluded and why. Dependencies between components, such as bootloader and application, are handled as a set. The difficulty is that the matrix grows with the product's history and the actual hardware in the field often deviates from what records say.",
    k: ["Enforce in the platform vs only on the device: platform checks avoid wasted downloads and report clearly, but the device must still verify itself since records can be wrong.", "Direct upgrade from any version vs required stepping stones: stepping stones keep each image simpler, but multiply the number of updates a stale device needs."],
    p: ["A device never updated for two years skips a mandatory migration step and fails on the new image.", "Registry records of hardware revision are wrong for a batch, so the wrong image is offered."],
    v: "Target a group containing an unsupported hardware revision and a too-old version, and confirm both are excluded with specific reasons, while compatible devices proceed, and the device itself refuses an incompatible image if forced.",
    dep: ["firmware-repository","device-types-and-models","device-registry"]
  },
  "update-campaigns": {
    s: "The managed process of moving a defined group of devices to a chosen firmware version, with targets, schedule, rollout policy and tracked outcome per device.",
    d: "A campaign ties a firmware release to a target group and a rollout policy, uses the job orchestrator to notify devices, and records each device's stage: notified, downloading, verifying, installing, rebooting, confirmed. It exposes progress, failures with reasons and the option to pause, resume or roll back. Completion means a device reported the new version after a successful boot, not that it downloaded the file. The difficulty is the long tail: the last few percent of devices may take weeks to come online.",
    k: ["Mandatory campaigns vs user-approved updates: mandatory campaigns keep the fleet uniform and patched, but can interrupt devices in use; approval respects the user but leaves old versions in the field.", "Define done at install vs at confirmed healthy boot: confirmed health is truthful but delays completion, and it is the only definition that detects boot failures."],
    p: ["A campaign marked complete when downloads finish hides devices that failed to boot the new version.", "Devices added to the group during the campaign are never updated, and fleet versions drift."],
    v: "Run a campaign over 1,000 test devices including 20 that fail verification. Confirm those show a failed stage with a reason, the rest report the new version after reboot, and the campaign does not claim completion.",
    dep: ["job-orchestrator","firmware-repository","compatibility-matrix","staged-rollout"]
  },
  "staged-rollout": {
    s: "Releasing a firmware version in rings, such as internal devices, a small canary and then progressively larger fractions, observing health between steps.",
    d: "Rings are groups defined by attributes, for example employee devices, a few customers who opted in, then a percentage per region. Each stage has a size, a minimum observation time and criteria for proceeding. The observation window must be long enough for slow failures, such as a memory leak that takes two days, to appear. Canary devices should resemble the fleet in hardware and use. The difficulty is a canary that is not representative: a ring of lab devices never meets bad cellular coverage.",
    k: ["Few large stages vs many small ones: many small stages limit exposure at each step, but lengthen the rollout and need more monitoring attention.", "Canary selected randomly vs chosen to cover diversity: random selection is unbiased, but a diverse sample finds the hardware- and region-specific faults sooner."],
    p: ["Advancing after one hour misses a fault that appears only after a day of uptime.", "A canary made entirely of one hardware variant hides a failure on the others."],
    v: "Release to a canary ring built from three hardware variants and hold for the stated observation time. Confirm promotion needs the health criteria met and that holding the ring keeps later rings untouched.",
    dep: ["update-campaigns","rollout-rate-control","update-health-gating","fleet-groups"]
  },
  "update-health-gating": {
    s: "Automated checks that compare devices on the new version with those on the old one and stop or roll back a rollout when health degrades.",
    d: "Gates read health metrics from the monitoring layer for the updated cohort and a control cohort: boot success, connection rate, crash counts, error rates, battery drain and telemetry completeness. A gate passes if the updated cohort is not meaningfully worse, and fails otherwise, pausing the campaign and alerting the owner. Some gates run on the device itself, which must confirm health before committing the new image. The difficulty is statistical: with few devices and noisy metrics, a good release can look bad and a bad one can look fine.",
    k: ["Comparing against a control cohort vs against fixed thresholds: control cohorts adjust for ordinary variation, but need enough devices on the old version to be a fair comparison.", "Automatic halt vs alert and manual decision: automatic halts react in minutes, but a noisy metric can stop good releases and erode trust in the gate."],
    p: ["A gate that measures only connection success misses a firmware that connects but stops reporting sensor data.", "Insufficient sample sizes in early stages make the comparison meaningless, so the gate passes by default."],
    v: "Ship a build with an injected 10 percent crash rate to a canary cohort and confirm the gate fails within the observation window and pauses the campaign before the next ring begins.",
    dep: ["fleet-health-metrics","staged-rollout","alert-rules"]
  },
  "delta-updates": {
    s: "Updates that ship only the difference between two firmware versions, reducing download size on slow, costly or battery-powered links.",
    d: "The build produces a patch from a specific source version to a target version. The device applies it to its current image to reconstruct the new one, then verifies the hash of the result against the signed manifest. A fleet has many versions, so the platform generates patches for common pairs and falls back to the full image otherwise. Patches may be generated on demand and cached. The difficulty is correctness: a patch applied to a slightly different base produces garbage, so the device must check the base hash before it starts.",
    k: ["Delta updates vs full images: deltas cut data by large factors, but need per-pair generation, storage and a fallback path, and device memory to apply them.", "Patching the compressed image vs the decompressed one: decompressed patching yields smaller patches, but needs more device RAM and CPU."],
    p: ["Applying a patch to a base that was modified by a prior failed update corrupts the image.", "Generating patches for every version pair explodes storage and build time."],
    v: "Apply a delta on a device at the exact source version and confirm the resulting image hash equals the target manifest hash. On a device at another version, confirm the agent rejects the patch and requests a full image.",
    dep: ["firmware-repository","device-update-agent"]
  },
  "device-update-agent": {
    s: "The device-side component that downloads an image, verifies it, writes it to the inactive slot, switches to it and reports the result back to the platform.",
    d: "The agent receives an update notice, checks compatibility and power and storage conditions, then downloads in resumable chunks, which matters on links that drop. It verifies the signature and hashes while streaming, writes to the inactive partition, marks it for trial boot and reboots. After boot it runs health checks and either commits or reverts. Progress is reported at each stage. The difficulty is doing all this with limited memory, flaky links, and a power cut possible at any instant.",
    k: ["Resumable chunked download vs one request: resuming survives dropped links on large images, but needs ranges and per-chunk verification on the device.", "Verify before writing vs after: verifying first protects the flash from bad images, but needs enough temporary storage or a streaming hash and signature check."],
    p: ["A power cut during the write of a single-slot image leaves a device that cannot boot.", "An agent that has a bug cannot be fixed by an update, because it is the thing that applies updates."],
    v: "Cut power at random points during ten update attempts on a test device. Confirm each ends either on the old version or fully on the new one, never unbootable, and the platform records the outcome.",
    dep: ["dual-bank-and-rollback","release-signing","connection-manager"]
  },
  "dual-bank-and-rollback": {
    s: "Keeping two firmware slots so a new image is written beside the running one and the device reverts automatically if the new image fails to prove itself.",
    d: "The device has an active and an inactive slot. The updater writes to the inactive slot, then tells the bootloader to try it once. After booting, the new firmware must reach a defined health point, such as connecting to the platform, and mark itself good. If it hangs or resets before that, the bootloader's trial counter or watchdog sends the device back to the old slot. The cost is flash: two images plus data. The difficulty is health definition: a firmware that boots but cannot connect passes a weak check.",
    k: ["Dual slots vs a single slot with a recovery image: dual slots make updates safe and quick to revert, but cost twice the flash; a recovery image saves space and leaves a degraded fallback.", "Commit on boot vs commit after reaching the cloud: committing after cloud contact catches connectivity regressions, but a device with a flaky network may roll back a good image."],
    p: ["A new image that corrupts shared configuration data breaks the old image too, so rollback does not recover the device.", "A trial boot that marks itself good before testing the network leaves unreachable devices permanently on a bad version."],
    v: "Install an image built to hang after boot and confirm the device reverts to the previous version on its own within the timeout and reports the rollback. Install a good image and confirm it commits only after reaching the platform.",
    dep: ["secure-boot-and-attestation","watchdog-and-recovery"]
  }
});
