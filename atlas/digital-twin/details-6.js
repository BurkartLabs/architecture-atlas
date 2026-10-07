// Details for the digital twin plate, part 6: connectivity, governance and cross-cutting concerns.
ATLAS.details("digital-twin", {
  "field-protocol-adapters": {
    s: "Drivers that speak the many industrial and building protocols used by devices and controllers, reading values and exposing them to the platform in one common form.",
    d: "Each adapter implements one protocol, such as a fieldbus, a serial register protocol or a vendor interface, handling connection, polling or subscription, address ranges, data types and error codes. It normalizes values and timestamps into a common message and reports connection health. Adapters run at the edge, close to the devices, because many protocols are not routable and are timing sensitive. The hard part is the long tail: devices implement protocols loosely, and polling too aggressively can slow a controller.",
    k: ["Polling vs subscription or report-by-exception: polling works with every device and loads the controller; subscription is efficient and not always available.", "Own adapters vs third-party protocol suite: own adapters are lean and cost maintenance across many devices; a suite saves effort and adds dependencies."],
    p: ["Aggressive polling pushes an old controller past its scan time and degrades control.", "A device returns a stale or error value coded as a normal number."],
    v: "Connect the adapter to a device simulator and a real device, compare values with the device's local display, and confirm the polling rate stays within the controller's documented limit with failure shown as connection loss.",
    dep: ["device-registry", "ot-it-boundary"]
  },
  "edge-gateway": {
    s: "A computer near the equipment that collects data from local devices, pre-processes it, buffers it during outages and forwards it securely to the platform.",
    d: "The gateway hosts protocol adapters, decodes and filters readings, applies compression, computes local indicators for high-rate signals, and keeps a local buffer. It connects outward only, authenticates with its own identity and receives configuration and software updates from the platform. Some run local rules for autonomy when the link fails. The hard part is operating thousands of small remote computers: updates, certificates, clocks and disks all need management with no one on site.",
    k: ["Thin collector vs smart edge: thin is simple and manageable but depends on the link; smart edge works offline and multiplies software to maintain.", "Outbound-only connections vs inbound access: outbound-only is safer for the plant network and makes remote support harder."],
    p: ["A failed update leaves hundreds of gateways offline with no remote recovery.", "A gateway's clock drifts and all its data is stamped wrongly."],
    v: "Cut the link for an hour, restore it, and confirm buffered data arrives in order with correct timestamps, then push a configuration change and an update and confirm the gateway applies it and reports its version.",
    dep: ["field-protocol-adapters", "store-and-forward", "device-registry", "ot-it-boundary"]
  },
  "store-and-forward": {
    s: "Local buffering of readings and events when the link is down, with bounded storage and ordered, throttled delivery once the link returns.",
    d: "Data is written to local durable storage before acknowledgment, tagged with sequence numbers, and sent when the uplink is available; the platform acknowledges and the gateway releases space. When storage fills, a policy decides what to drop: oldest, lowest priority or compressed. Replay is rate limited so fresh data is not delayed. The hard part is sizing and correctness: a long outage fills any buffer, and duplicates after partial acknowledgment need deduplication on the platform side.",
    k: ["Drop oldest vs drop newest when full: dropping oldest keeps recent data useful for state; dropping newest preserves a continuous history up to the outage.", "Send backlog first vs live first: backlog first gives complete order and delays current state; live first keeps views current and delays history."],
    p: ["Buffered data flooded at reconnect overwhelms the platform and the live feed.", "Sequence numbers reset after a gateway reinstall and data is rejected as duplicates."],
    v: "Disconnect for longer than the buffer size, reconnect, and confirm what was dropped follows the stated policy, the remainder arrives in order without duplicates, and live data is not delayed beyond limits.",
    dep: []
  },
  "control-system-read-interface": {
    s: "A read-only path to the plant's control and supervisory systems for values, alarms and configuration, designed so the twin cannot disturb the process it observes.",
    d: "The interface connects through a standard industrial interface or historian to read tags, alarm states and, where available, the control logic's configuration. Access is read-only by permission, rate-limited and often through a replica or data diode. It also imports tag lists to help build mappings. The hard part is respecting the controller's priorities: control networks are sized for control, and an enthusiastic twin reading thousands of tags can cause real delays.",
    k: ["Read from the historian vs read from the live controller: historian reads are safe and delayed; live reads are timely and load the controller.", "Subscription to changes vs scheduled bulk reads: subscription saves traffic and needs support in the system; bulk reads are universal and heavier."],
    p: ["A mis-set polling rate overloads the control network and slows operator screens.", "Write permission is left on a read credential after commissioning."],
    v: "Read a defined tag list while monitoring controller load and network traffic, confirm values match the operator screen, load stays inside the agreed limit, and an attempted write with the credential is refused.",
    dep: ["field-protocol-adapters", "ot-it-boundary", "twin-access-control"]
  },
  "write-back-gateway": {
    s: "The single, controlled path through which the twin may send commands or setpoints to the physical asset, enforcing limits, authorization and acknowledgment on every write.",
    d: "A write passes through validation of value, rate and mode, authorization of the requester, optional approval, and finally transmission to the control system through a defined interface. The gateway confirms the control system accepted it, reads back the resulting value and records everything. Many deployments disable write-back entirely, keeping the twin advisory. The hard part is that it turns software errors into physical actions, so it must be narrow, auditable and unable to bypass the control system's own protections.",
    k: ["Advisory twin only vs closed-loop write-back: advisory is safe and leaves benefits to human action; write-back captures them and carries safety obligations.", "Setpoints within a narrow band vs direct actuator commands: setpoints keep the control system in charge; direct commands are fast and bypass its logic."],
    p: ["A bug in an optimization sends a valid-looking setpoint that the plant is not ready for.", "A retried command is applied twice because writes are not idempotent."],
    v: "Send an in-limit, an out-of-limit and an unauthorized command in a test plant, and confirm only the first is applied, read back and logged, while the others are refused with reasons.",
    dep: ["command-approval-workflow", "safety-interlock-boundary", "control-system-read-interface", "audit-and-change-history"]
  },
  "command-approval-workflow": {
    s: "Routes proposed changes to the asset through the right people, with review of the predicted effect, approvals by role, time limits and a record of who decided what.",
    d: "A proposal carries the intended change, the simulation or analysis behind it and the expected effect. Rules decide who must approve based on asset criticality and size of change; some low-risk changes are auto-approved within limits. Approvals expire so a stale one cannot be applied later. Outcomes feed back into the twin's records. The hard part is balance: too much friction and people go around the system, too little and the twin becomes an unchecked controller.",
    k: ["Human approval for every change vs auto-approve within limits: human approval is safest and slow; auto-approve is fast and depends on well-chosen limits.", "Approve the action vs approve the analysis and the action: approving the analysis too gives context and lengthens the process."],
    p: ["An approval granted for yesterday's conditions is applied today.", "People share a login to speed up approvals and the record loses meaning."],
    v: "Submit a change needing two roles, confirm it cannot be applied after one, applies after both, expires after its limit, and the record lists requester, approvers, evidence and the applied result.",
    dep: ["twin-access-control", "what-if-comparison", "audit-and-change-history"]
  },
  "safety-interlock-boundary": {
    s: "The line the twin must never cross: safety functions and protective logic stay in independent systems that the platform can observe but not alter or override.",
    d: "Safety instrumented systems and protective interlocks are separate, certified and typically not reachable from the twin's network. The platform may read their states and log trips, and writes are checked against a list of forbidden targets and ranges. Design reviews assess every write path against the plant's hazard analysis. The hard part is organizational: nothing in software prevents someone adding a convenient route, so the boundary must be enforced by network design, permissions and review.",
    k: ["Physical or network separation vs software checks only: separation cannot be bypassed by a bug and limits integration; software checks are flexible and can fail.", "Fail-safe default on loss of twin vs continue last command: fail-safe is safe and may interrupt production; continuing is smooth and holds an unmonitored setpoint."],
    p: ["A write path added for convenience reaches a protective setpoint.", "Loss of the twin leaves a last commanded setpoint held with nobody watching it."],
    v: "Attempt writes to a protected tag through every interface, including a privileged account, and confirm each fails at the network or gateway level and the attempt is logged and alerted.",
    dep: ["ot-it-boundary", "twin-access-control"]
  },
  "device-registry": {
    s: "The authoritative list of physical devices and gateways, with identities, credentials, firmware, location, configuration and the asset each one reports for.",
    d: "Each device or gateway has a unique identity and credentials, a record of type, firmware, last contact and configuration, and a link to the asset it serves. Onboarding issues credentials, replacement transfers the asset link to a new device, and decommissioning revokes them. The registry drives mappings, desired-state delivery and fleet health views. The hard part is lifecycle at scale: devices are swapped in the field, cloned, or moved without anybody telling the platform.",
    k: ["Per-device credentials vs shared site credentials: per-device limits damage from one compromise and needs a provisioning process; shared is easy and exposes everything.", "Automatic registration vs approved onboarding: automatic is easy and accepts rogue devices; approved is safe and slows rollout."],
    p: ["A replaced device starts reporting under a new identity and its history is split.", "Revoked devices keep working because their credentials were never expired."],
    v: "Onboard a device, replace it with a new unit, and confirm the asset link transfers, the old identity is revoked and rejected, and history for the asset is continuous.",
    dep: ["twin-access-control", "audit-and-change-history"]
  },
  "ot-it-boundary": {
    s: "The network and policy separation between plant control networks and business or cloud networks, with controlled, minimal, one-direction-by-default crossings.",
    d: "Control networks are segmented into zones with conduits between them. The twin's data crosses through brokers, demilitarized zones, one-way gateways or outbound-only connections, with each crossing documented, authenticated and inspected. Inbound access into the plant is minimal and brokered. Patching and change processes differ on each side. The hard part is that the twin's purpose is to connect these worlds, and every connection added for a good reason widens the attack surface of a system that was designed to be isolated.",
    k: ["One-way transfer vs bidirectional with filtering: one-way is very strong and prevents write-back; bidirectional enables control and needs rigorous inspection.", "Data pulled by the plant side vs pushed from outside: plant-initiated connections keep inbound ports closed; external pull is simpler and exposes the plant."],
    p: ["A temporary remote access path installed for commissioning is never removed.", "Flat networks inside a plant let a compromised gateway reach controllers."],
    v: "Run a boundary test from the business side and a gateway host, confirming that only the documented flows pass, inbound connections to controllers fail, and every crossing appears in the network inventory.",
    dep: []
  },
  "twin-access-control": {
    s: "Decides who and what may read, change or command each part of the twin, by role, asset scope and purpose, applied uniformly across views, APIs and analytics.",
    d: "Identities come from a central provider for people and from certificates for services and devices. Permissions are granted on subtrees of the hierarchy, such as read for a site and command for one line, and checked on every request, including queries across assets. Sensitive properties, such as process recipes, can be masked. The hard part is consistency: the same restriction must hold in the 3D view, the API, exports and analytics, and hierarchy moves must not leak or revoke access unintentionally.",
    k: ["Role-based vs attribute-based rules: role-based is easy to audit and rigid; attribute-based expresses site, shift and asset rules and is harder to review.", "Check at the API only vs at every layer: API only is simple and misses internal paths; every layer is safe and costly."],
    p: ["An export or report path skips the permission check that the interactive view enforces.", "A contractor's access to a site is never removed after the contract ends."],
    v: "Log in as a user limited to one line, then try the view, the API, a bulk export and a query across assets, and confirm every route shows only that line's data.",
    dep: ["asset-hierarchy", "tenant-isolation"]
  },
  "tenant-isolation": {
    s: "Keeps separate customers, plants or business units from seeing or affecting each other's data and workloads, in storage, compute, queues and caches.",
    d: "Isolation is enforced by tenant identifiers on every record and request, separate encryption keys, partitions or databases, and quotas on compute, bandwidth and storage. Large or sensitive tenants may get dedicated infrastructure. Simulation and analytics workloads run with the tenant's scope. The hard part is the shared layers: caches, queues, search indexes and logs all need the tenant dimension, and one forgotten filter exposes everything.",
    k: ["Shared infrastructure with logical isolation vs dedicated stacks: shared is efficient and one bug exposes data; dedicated is strongly separated and costly to operate.", "Per-tenant encryption keys vs a platform key: per-tenant allows revocation and deletion by key; a platform key is simple and all-or-nothing."],
    p: ["A cache keyed without tenant returns another customer's value.", "One tenant's heavy simulation sweep starves others because quotas are missing."],
    v: "Create two tenants with overlapping asset names, query every interface as each, and confirm no result, count, log line or cache entry crosses, and that exceeding a quota affects only the offender.",
    dep: ["platform-observability"]
  },
  "audit-and-change-history": {
    s: "A tamper-evident record of who changed what and when: model edits, configuration, commands, approvals and access, kept apart from the operational data it describes.",
    d: "Every administrative and operational change writes an entry with identity, time, object, old and new values, and reason. Entries are append-only, signed or chained so alteration is detectable, and stored separately with its own retention and access rules. Auditors and incident reviewers query it. The hard part is completeness and signal: entries must cover every path including automated ones, and be searchable enough that the answer to who changed this setting is found in minutes.",
    k: ["Log everything vs log changes only: everything supports forensics and costs storage and review time; changes only is lean and cannot show who looked.", "Tamper-evident chain vs ordinary log table: chaining detects edits and adds engineering; an ordinary table is easy and trusted only as far as admins."],
    p: ["Automated services act under a shared account, so the record names nobody accountable.", "Audit entries expire sooner than the incident investigations that need them."],
    v: "Make a model edit, a configuration change and a command, then find each in the audit trail with identity, old and new values, and confirm altering a stored entry is detected by verification.",
    dep: ["twin-access-control", "retention-and-tiering"]
  },
  "twin-lifecycle": {
    s: "Governs a twin from commissioning through changes to decommissioning: how it is created, validated, versioned, retired and archived alongside the physical asset.",
    d: "At commissioning the twin is built, mapped, validated against the real asset and declared in service. During operation, physical changes, such as new equipment or rewiring, trigger management of change steps that update the twin and re-validate. At decommissioning, data is archived or deleted by policy and mappings are closed. The hard part is process: the physical plant changes by many hands and the twin only stays true if its updates are part of the same change procedure.",
    k: ["Twin update as part of management of change vs separate task: part of the change guarantees currency and slows engineering; separate is easy to postpone and forget.", "Formal validation gates vs continuous divergence monitoring: gates give clear approval and go stale; monitoring is continuous and less decisive."],
    p: ["A modification is made in the plant and the twin is updated months later, or not at all.", "Retired assets keep receiving data and polluting fleet statistics."],
    v: "Pass a physical modification through the change process and confirm the twin is updated, re-validated against measurements before sign-off, and that a decommissioned asset stops appearing in roll-ups.",
    dep: ["schema-versioning", "twin-divergence-detection", "retention-and-tiering", "audit-and-change-history"]
  },
  "multi-site-federation": {
    s: "Connects twins of many plants into one fleet view, with local autonomy at each site and consistent models, queries and policies across them.",
    d: "Each site runs its own twin, near its equipment, so it keeps working through link loss. A central layer holds shared types, fleet models, aggregated history and cross-site analytics, and queries fan out to sites or read replicated summaries. Type definitions and policies flow downward, and data flows upward. The hard part is balance and drift: sites model the same equipment differently, clocks and units differ, and a fleet comparison is only as good as the weakest site's data.",
    k: ["Centralize all data vs keep data at sites and query on demand: centralizing makes analytics simple and costs bandwidth and sovereignty; federation keeps data local and makes fleet queries slower.", "Enforced common model vs site extensions: enforced gives comparability; extensions allow local fit and fragment the fleet."],
    p: ["Fleet benchmarks compare sites with different definitions of the same measure.", "A site loses its link and the central view silently shows its old values."],
    v: "Run a fleet query across three sites, one disconnected, and confirm results show per-site freshness, the disconnected one is marked stale and the same definition produces comparable numbers at each site.",
    dep: ["asset-type-library", "twin-query-api", "tenant-isolation", "schema-versioning"]
  },
  "platform-observability": {
    s: "Monitoring of the platform itself: ingestion lag, data freshness per asset, pipeline errors, storage health and cost, so operators know whether the twin can be believed.",
    d: "Metrics, logs and traces from every component are collected and shown, with the key signals being freshness of each asset's data, consumer lag, rejection rates and the age of the oldest unprocessed message. Alerts target the platform team, separate from asset alarms. Health is exposed to users too, so a stale view is labeled. The hard part is that the twin hides its own failure: a dead pipeline looks like a calm plant unless freshness is monitored as carefully as values.",
    k: ["Monitor freshness per asset vs aggregate pipeline health: per asset finds the one silent device and produces many signals; aggregate is calm and hides local loss.", "Separate platform alerts from plant alarms vs one console: separate keeps focus; one console shows everything and mixes audiences."],
    p: ["A broken pipeline leaves the last good values on screen, and the plant looks stable.", "Platform alerts go to nobody on call at night."],
    v: "Stop one data source and one pipeline stage in a test, and confirm freshness alerts name the affected assets within the stated time and views carry a stale indicator.",
    dep: ["message-broker"]
  },
  "time-and-clocks": {
    s: "The rules for how time is stamped, synchronized, stored and ordered across devices, gateways and the platform, since correlation and causality depend on it.",
    d: "Decisions include which clock is authoritative, whether devices are disciplined to a network time source, what resolution timestamps need, how to store both event time and arrival time, and how to treat time zones and daylight changes. Simulation adds its own virtual time. These choices affect alignment, late data handling, event ordering, replay and reconstruction. They cannot be retrofitted cheaply: data stamped at ingest instead of at source cannot later be corrected.",
    k: ["Stamp at source vs at ingest: source time reflects the real instant and depends on device clocks; ingest time is reliable and shifts by unknown delay.", "Store UTC only vs also local plant time: UTC avoids ambiguity; local time matches shifts and reports and needs conversion rules."],
    p: ["Unsynchronized device clocks reverse the apparent order of cause and effect.", "A daylight change duplicates or drops an hour in reports."],
    v: "Trigger a physical event seen by two devices and confirm their stored timestamps agree within the stated skew, and that a daylight change day produces correct 23- and 25-hour totals.",
    dep: ["time-alignment", "device-registry"]
  },
  "fidelity-vs-cost": {
    s: "The choice of how detailed each model, sensor set and update rate should be, balancing the value of better answers against build, compute and maintenance cost.",
    d: "More detail means more parameters to calibrate, more sensors to buy and keep healthy, more compute and more places to be wrong. Each use of the twin needs only enough fidelity to answer its question: a dashboard needs state, a maintenance decision needs trends, an optimization needs a dynamic model. Fidelity can differ per asset by criticality. Deciding it early shapes data rates, storage, models and team size.",
    k: ["Uniform fidelity vs by criticality: uniform is simple to operate and wastes effort on minor assets; by criticality focuses effort and creates inconsistent coverage.", "Start simple and add detail vs build detailed first: simple delivers value early and may need rework; detailed is rich and risks never finishing."],
    p: ["A very detailed model is built for an asset whose decisions never needed it and nobody maintains it.", "Fidelity is cut to save cost and the twin cannot answer the question it was bought for."],
    v: "For each use case, state the decision supported and the accuracy it needs, then check by experiment that the chosen fidelity meets it and that a cheaper level measurably fails.",
    dep: ["physics-based-models", "reduced-order-models", "scale-and-granularity"]
  },
  "uncertainty-propagation": {
    s: "The rule that every value carries an estimate of how wrong it might be, and that analytics, models and decisions pass that uncertainty on instead of discarding it.",
    d: "Sensors have accuracy, estimates have covariance, models have error, and filled values have assumed errors. Treating these as first-class data means storing them with values, combining them correctly in derived calculations and showing ranges to users. The alternative is false precision at every step. It touches schemas, storage, models and the interface, and is much cheaper to include at the start than to add after consumers assume exact numbers.",
    k: ["Carry uncertainty everywhere vs only in decision-critical paths: everywhere is consistent and heavy; critical paths only is practical and leaves unexplained confidence elsewhere.", "Probabilistic outputs vs a point value with a margin: probabilistic supports risk decisions and is harder to read; a margin is simple and crude."],
    p: ["A chain of calculations multiplies small errors and reports a precise-looking result.", "Users treat a displayed number as exact because the interface never shows a range."],
    v: "Take a derived quantity with known input errors, compare the platform's reported range with a Monte Carlo reference, and confirm it agrees and the interface displays it.",
    dep: ["uncertainty-quantification", "quality-flags", "calibration-drift-tracking"]
  },
  "safety-and-write-authority": {
    s: "The decision of how far the twin may act on the physical world, who is accountable when it does, and which functions must always remain outside its reach.",
    d: "Choices range from view-only through advisory to supervised and closed-loop control. They determine network layout, which interfaces exist, how approvals work, what must be certified, and who carries liability. A twin that can only inform has modest risk; one that can write to the plant inherits the standards of control engineering. Decisions about authority must be made before write interfaces are built, because adding a write path later without redesign tends to bypass the reviews that protect the plant.",
    k: ["Advisory by design vs closed-loop by design: advisory limits benefit to what humans act on; closed-loop captures more value and requires safety engineering at every layer.", "Central authority policy vs per-site policy: central is consistent and strict; per-site fits local risk and varies in practice."],
    p: ["A convenient write path is added during a project, and no one reviews it against the hazard analysis.", "Accountability for an automated change is unclear, and the first incident turns into a dispute."],
    v: "List every interface capable of a write, show for each the approval, limits, audit record and independent safety layer, and test that none can change a protected setting.",
    dep: ["write-back-gateway", "safety-interlock-boundary", "command-approval-workflow"]
  },
  "scale-and-granularity": {
    s: "How finely the physical world is modeled and sampled, from a few headline signals per plant to thousands of components, and what that means for storage, compute and effort.",
    d: "Granularity covers the number of assets and components modeled, signals per asset, sampling rates and history depth. Each step up multiplies ingest volume, storage, mapping work and the number of things that can be wrong. Rare high-rate signals, such as vibration, may be processed at the edge and summarized, while slow process values are kept in full. Choosing it per use case early keeps costs predictable and avoids a model that is too coarse to answer questions or too large to maintain.",
    k: ["Model at component level vs at machine level: component level supports detailed diagnosis and costs far more to build and maintain; machine level is manageable and hides root causes.", "Keep raw high-rate data vs keep features: raw allows new analysis later and is very expensive; features are compact and fix the questions in advance."],
    p: ["A pilot at ten assets works, and at ten thousand the mapping effort and storage costs are unaffordable.", "The model is too coarse to separate two failure modes, discovered after deployment."],
    v: "Project volume, storage and mapping effort for the target asset count and rates, then load-test ingestion and queries at that scale and confirm they meet latency and cost limits.",
    dep: ["time-series-store", "instance-provisioning", "deadband-and-compression"]
  },
  "semantic-consistency": {
    s: "The discipline of making the same thing mean the same thing everywhere: shared vocabularies, units, identifiers and definitions across sources, models, analytics and sites.",
    d: "Plants contain data named by different vendors, eras and teams. Consistency requires a common vocabulary for asset types, properties and states, agreed identifiers for physical items, and single definitions for measures such as availability. Without it each integration becomes a one-off translation, and fleet analytics compares unlike things. It is mainly governance work backed by schemas, import rules and review. Retrofitting meaning after thousands of mappings exist is far costlier than imposing it at provisioning.",
    k: ["Adopt a shared industry vocabulary vs custom: shared eases exchange and tools and rarely fits perfectly; custom fits and isolates you from partners.", "Central ownership of definitions vs federated: central gives consistency and becomes a bottleneck; federated is fast and drifts."],
    p: ["Two sites define downtime differently and fleet reports compare them as equals.", "Identifiers reused after equipment replacement merge two assets' histories."],
    v: "Pick ten measures and ten asset types, trace each across three sources and two sites, and confirm one definition, unit and identifier is used everywhere or each variation is documented and mapped.",
    dep: ["units-and-semantics", "asset-type-library", "engineering-data-import"]
  },
});
