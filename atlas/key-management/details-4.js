// Details for the key management plate, part 4: regions, audit, operations, cross-cutting concerns.
ATLAS.details("key-management", {
  "regional-isolation": {
    s: "Each region runs a self-contained copy of the service with its own keys, storage and hardware, so a failure, outage or legal demand in one region cannot reach another.",
    d: "A key created in a region is stored, wrapped and used only there. Regions share no data plane dependencies: no cross-region calls on a request path, separate domain keys and separate hardware. Control-plane operations that need global state, such as account creation, are kept off the data path. Customers choose regions to meet residency and latency needs. It is hard because pure isolation conflicts with global services: global names, account state and billing want to cross, and every shared piece is a way for one region's failure to become many.",
    k: ["Strict regional isolation vs a global key namespace: isolation caps blast radius and fits residency rules, but a global namespace lets applications use one key identifier anywhere.", "Region-local hardware and roots vs shared roots: local roots ensure no cross-region exposure, at the cost of ceremonies and custody per region."],
    p: ["A hidden dependency on a global component makes a regional outage global.", "Support tooling that reads keys across regions breaks the isolation the architecture claims."],
    v: "Block all network traffic between two regions in a test and confirm each continues to serve encrypt and decrypt for its own keys with no errors and no rising latency.",
    dep: ["domain-keys","cell-deployment","data-residency"]
  },
  "multi-region-keys": {
    s: "Keys that exist in several regions with the same identifier and material, so data encrypted in one can be decrypted in another and applications can fail over without re-encrypting.",
    d: "A customer designates a primary key, and the service creates replicas in chosen regions, each wrapped under its own region's hierarchy. All share the same key material and identifier prefix but are managed independently once created, except for rotation and policy sync. This supports global databases and disaster recovery. It is hard because the key is now only as safe as the weakest region, replication lag may leave the new version unreadable in one place, and deletion needs coordination everywhere.",
    k: ["Replicated multi-region key vs separate keys per region with re-encryption: replicated is simple and lets ciphertext move, while separate keys retain isolation and need re-encryption on transfer.", "Primary-controlled changes vs independent replicas: primary control keeps policy consistent, but a primary outage blocks administration."],
    p: ["A new key version written in region A is not yet in region B, and region B receives data encrypted under it.", "Customers replicate to many regions by default, widening exposure without a need."],
    v: "Encrypt in region A, decrypt in region B with the replica and confirm equal plaintext. Rotate the primary and measure time until the new version is usable in every replica region.",
    dep: ["key-replication","regional-isolation","rotation","consistency-model"]
  },
  "key-replication": {
    s: "The mechanism that copies key material and metadata between regions in wrapped form over authenticated channels, for multi-region keys and backups.",
    d: "The source engine unwraps nothing; it re-wraps the key for the destination under a transport key negotiated between hardware modules, sends it, and the destination wraps it under its own domain key. Metadata changes follow a replicated log. Each hop is authenticated and audited, and both regions' operators see the transfer. Replication is asynchronous and tracked with lag metrics. It is hard because it deliberately breaks an isolation boundary, so it must be narrow, explicit and observable, and its failures must not block local operation.",
    k: ["Hardware-to-hardware transport wrapping vs software re-encryption: hardware transfer never exposes plaintext, while software is simpler and puts material in host memory.", "Push on change vs periodic reconcile: push gives low lag and can miss events, reconcile corrects drift and adds delay."],
    p: ["A replication failure stays silent and a failover region lacks the newest key version.", "A transport key shared across all pairs widens the compromise from one link to all."],
    v: "Create a replicated key, confirm the destination logs a receive event and holds the same material by encrypting a vector in each and comparing outputs. Break the link and confirm alerts on lag appear.",
    dep: ["hsm-fleet","domain-keys","metadata-store","audit-log"]
  },
  "failover-routing": {
    s: "Directing callers to a healthy region or cell when theirs fails, within the limits that keys live in specific places and that most requests cannot move.",
    d: "Clients use regional endpoints and fall back to another region only when the key is replicated there. Within a region, traffic shifts away from unhealthy cells and nodes using health checks and load-aware routing. For single-region keys, failover is impossible and availability depends on the region's redundancy. Routing changes are slow and deliberate, since sending decrypts elsewhere requires that the other side can serve the key. It is hard because failover paths are rarely exercised and fail when needed, and because retries amplify load on the survivor.",
    k: ["Client-driven failover vs service-driven: client-driven is simple and puts logic in every client, while service-driven centralizes control and keeps clients thin.", "Active-active across regions vs active-passive: active-active keeps replicas warm and tested, while active-passive is cheaper and unproven until used."],
    p: ["The failover region is sized for its own traffic and collapses under both.", "Failover tested only in drills that skip the replication lag that real events have."],
    v: "Fail a region in a game day with production-like load and confirm clients with replicated keys continue, measure the error spike and recovery time, and confirm single-region keys fail as documented.",
    dep: ["multi-region-keys","static-stability","regional-isolation"]
  },
  "data-residency": {
    s: "The controls that keep keys and key operations within a legal or contractual geography: region pinning, staff access limits, backup placement and evidence that nothing crossed.",
    d: "Keys are pinned to regions; replication to others is opt-in and visible. Operations staff for a sovereign region may be located and cleared accordingly, with access via approved paths only. Backups and logs remain in region. The service produces reports showing where each key's material and metadata reside and where operations occurred. It is hard because the guarantee covers more than storage: support tooling, telemetry, logs and error reports each may copy sensitive metadata abroad.",
    k: ["Region pinning by default vs opt-in: pinning by default prevents accidental export, while opt-in is easier for global applications and shifts responsibility to customers.", "Local operator staff vs remote administration: local staff satisfy strict sovereignty rules, and increase cost and reduce follow-the-sun coverage."],
    p: ["Logs or metrics from a restricted region are shipped to a central system abroad.", "A backup placed in another country for convenience voids the residency claim."],
    v: "For a pinned key, trace every storage and network destination for its create, use and delete operations, including logs and backups, and confirm every one is inside the region.",
    dep: ["regional-isolation","backup-restore","audit-log","compliance-reporting"]
  },
  "cell-deployment": {
    s: "Splitting a region into independent cells, each serving a subset of tenants with its own stack, so a bad deploy or overload affects only one cell.",
    d: "Tenants are assigned to cells by a stable mapping. Each cell has routers, engines, caches and its own metadata partition, sharing only hardware pools and the control plane. A deploy goes to one cell, then the next, with automatic stop on error. A hot or malicious tenant can be moved or quarantined. Cells bound outages to a fraction of customers. It is hard because the mapping layer is itself a single point, cells need rebalancing, and cross-cell operations such as shared keys complicate the model.",
    k: ["Many small cells vs few large: small cells shrink blast radius and cost more overhead, while large cells are efficient and fail bigger.", "Tenant-to-cell mapping fixed vs dynamic: fixed is simple and predictable, while dynamic balances load and can strand a tenant mid-move."],
    p: ["The cell router is a shared dependency that fails everyone at once.", "A tenant with a key shared across cells breaks isolation for both."],
    v: "Inject a fault into one cell and confirm only its assigned tenants see errors, while the others' success rates are unaffected. Confirm the routing layer itself stayed healthy.",
    dep: ["request-router","metadata-store","rollout-safety"]
  },
  "audit-log": {
    s: "A complete, structured record of every administrative and cryptographic operation: who, from where, which key and version, which action, what context, what outcome and why.",
    d: "Each request produces an event with the authenticated principal, source, key identifiers, operation, encryption context, decision and the rule that decided it, and the request identifier. Events are written in the request path or reliably queued, and delivered to the customer's own log store as well as the provider's. Volume is large since every decrypt is logged. Failures to log must be treated carefully. It is hard because the log must be complete and tamper-evident without leaking secrets, including plaintext, key bytes and sensitive context values.",
    k: ["Log every decrypt vs sample data-plane events: complete logs answer who read what, and cost storage and delivery capacity at high volumes.", "Fail the request when logging fails vs proceed: failing keeps the record complete and turns a log outage into an availability outage."],
    p: ["Events omit the encryption context, so investigators cannot tell what a call was for.", "Log pipeline backlog during an incident delays the evidence when it is needed most."],
    v: "Perform one encrypt, one denied decrypt and one policy change, then retrieve events by request identifier and confirm each has principal, source, key, context, decision and rule. Break the log sink and confirm the stated failure behavior.",
    dep: ["caller-attribution","log-integrity","encryption-context"]
  },
  "log-integrity": {
    s: "Mechanisms making audit records tamper-evident: chained hashes or signed batches, write-once storage and independent copies, so deletion or edits are detectable.",
    d: "Events are batched, hashed into a chain or tree and signed periodically by a key held separately from the operators who run the service. Digests are published or stored in a write-once location. Verifiers recompute the chain and detect gaps or changes. Copies go to customer-controlled storage the provider cannot modify. It is hard because an attacker with operator rights targets the log first, so integrity must rely on independent parties and keys, and because verification has to actually be run.",
    k: ["Signed hash chains vs relying on access control of the log store: chains detect tampering even by administrators, while access control only prevents it and trusts them.", "Delivery to the customer's store in near real time vs batch: near real time shrinks the tampering window, and makes the customer part of the pipeline."],
    p: ["The signing key for the chain sits on the same hosts as the logs it protects.", "Nobody runs the verification, so tampering would be found only by accident."],
    v: "Alter one record in a test copy of the log and run the verifier; it must name the position of the break. Delete a record and confirm the verifier reports a gap.",
    dep: ["audit-log","hsm-fleet"]
  },
  "usage-anomaly-alerts": {
    s: "Detection of unusual key use from the audit stream: new callers, new regions, spikes in decrypts, use of keys pending deletion, failures and policy edits outside change windows.",
    d: "A stream processor compares events against per-key baselines and rules. Some alerts are cheap and certain, such as any use of a key scheduled for deletion; others are statistical, such as a tenfold rise in decrypt rate from a new principal. Alerts route to security teams with the key, caller and context. Rules are tuned per customer to limit noise. It is hard because legitimate use is bursty, so thresholds either miss quiet exfiltration or page constantly, and alerts depend on a complete, timely log.",
    k: ["Rule-based alerts on known bad patterns vs statistical baselines: rules are precise and miss the unknown, while baselines catch novelty and produce false positives.", "Central detection vs customer-configured: central scales protection for everyone, while customer rules know what normal looks like."],
    p: ["Alert fatigue leads responders to mute the channel that later carries the real incident.", "A baseline learned while an attacker was already active treats the attack as normal."],
    v: "In a test tenant, decrypt from a never-seen principal at ten times normal rate and attempt use of a pending-deletion key; confirm both alerts reach the destination within the target time.",
    dep: ["audit-log","scheduled-deletion","metrics-slos"]
  },
  "metrics-slos": {
    s: "Service-level indicators and objectives for the key service: availability, latency percentiles per operation, error classes, cache hit rate, hardware saturation and replication lag.",
    d: "Metrics are emitted per operation and region, separating customer errors from service faults, and tracked against objectives such as decrypt availability and p99 latency. Dashboards show cache hit rate, hardware queue depth, throttle counts and invalidation delay. Alerts fire on burn rate of the error budget. Because the service sits under callers' read paths, its objectives are stricter than most. It is hard because aggregated averages hide a tenant's outage, and because measuring from inside the service misses what clients experience.",
    k: ["Per-tenant metrics vs aggregates: per-tenant reveals who is affected and multiplies cardinality, while aggregates are cheap and hide small victims.", "Server-side measurement vs client probes: server-side is detailed, while probes show what callers experience including network paths."],
    p: ["Customer-caused denials counted as outages inflate error rates and train people to ignore them.", "A metric with a changed definition breaks all long-term comparisons."],
    v: "Inject latency into one hardware module and confirm that p99 and the module's queue depth rise on the dashboard, and that the burn-rate alert fires within its design time.",
    dep: ["request-router","hsm-throughput","material-cache"]
  },
  "compliance-reporting": {
    s: "Evidence and reports mapping controls to requirements: key inventory, rotation status, access reviews, custodian records, certification status and the logs that prove each.",
    d: "Auditors ask for proof that keys are generated and stored in approved hardware, rotated on schedule, accessed only by authorized roles, and destroyed when required. The service assembles reports from inventory, policy, audit and ceremony records and exposes them to customers for their own audits. Reports must come from the system's actual state, not from documents. It is hard because requirements differ by sector and country, and because evidence needs years of retention and consistent definitions.",
    k: ["Continuous automated evidence vs point-in-time audit: continuous catches drift as it happens, while point-in-time is cheaper and shows a good day.", "Standard reports vs customer-specific: standard reports scale across customers, while custom ones fit individual regulators and consume engineering time."],
    p: ["A report generated from configuration rather than observed behavior certifies a control that is not running.", "Evidence retained for less time than the audit lookback."],
    v: "Pick one control, such as rotation within twelve months, and independently recompute it from raw key records; confirm it matches the report for every key, including exceptions listed.",
    dep: ["key-inventory","audit-log","fips-validation"]
  },
  "key-inventory": {
    s: "A queryable catalog of every key with owner, purpose, state, age, rotation, usage and last use, which turns millions of keys into something that can be reviewed and cleaned.",
    d: "The inventory joins metadata with usage from the audit stream: last use, callers, regions and operations per key. It flags keys with no owner, no recent use, missing rotation, broad policies or approaching expiry. Customers query it and the service uses it for deletion warnings. Data keys are not in it, because the service does not keep them. It is hard because last use is a lagging, sampled signal, and a key that looks idle may protect an archive that is read once a year.",
    k: ["Inventory built from audit events vs from metadata only: events show real use and cost pipeline effort, while metadata alone shows configuration but not reality.", "Automatic cleanup of idle keys vs reports only: automatic cleanup saves cost and risks deleting rare-use keys, while reports leave the decision to owners."],
    p: ["A key unused for a year is deleted before its once-a-year archive restore.", "Ownership tags are free text, so the owner field cannot be trusted."],
    v: "Select ten random keys from the inventory and confirm owner, state, last use and policy summary match the audit and metadata sources. Check one idle key and confirm the idle flag appears at the stated threshold.",
    dep: ["audit-log","metadata-store","tags-labels"]
  },
  "caller-attribution": {
    s: "Tying each operation to the real actor behind it, including a service acting on a user's behalf, so a decrypt traces to a person, role or workload and not just an infrastructure account.",
    d: "Requests carry the immediate principal and, where delegated, the original caller and the resource involved, for example a storage service acting for a named role on one volume. The router records the chain, plus session identity and source address. Without this, the audit log would name only the platform service for every read. It is hard because chains lose information across hops and proxies, shared roles hide individuals, and encryption context is the only record of which resource was meant.",
    k: ["Recording the full delegation chain vs only the immediate caller: the chain answers who ultimately caused a read, and needs every hop to pass identity honestly.", "Per-workload identities vs shared roles: per-workload identities give precise attribution, while shared roles are easy and make investigations ambiguous."],
    p: ["A shared role used by fifty services makes it impossible to tell which one read the data.", "A proxy that replaces the source address in logs hides the true origin."],
    v: "Perform a read through a storage integration as a named role and confirm the audit event contains the service principal, the original role, the resource and the context.",
    dep: ["caller-authentication","audit-log","encryption-context","storage-integrations"]
  },
  "bootstrap-unseal": {
    s: "How the service starts from nothing: authenticating to hardware, loading root and domain keys, and reaching a serving state without a key service to ask for help.",
    d: "At cold start there is no running service to supply keys, so startup relies on hardware holding the roots and on operator or automated credentials to unlock it. Engines then fetch wrapped keys from storage, unwrap domain keys inside the hardware and begin serving. Dependencies are deliberately ordered and minimal: storage, hardware and a small configuration source must come up without needing the key service itself. It is hard because circular dependencies hide, such as storage encryption that needs keys, and because full-region cold start is rare and untested.",
    k: ["Automated unseal with stored credentials vs manual quorum at each start: automated recovers fast and stores a credential that must be protected, while manual needs people during an outage.", "Serving before caches warm vs waiting: serving early restores availability and slams hardware, waiting protects hardware and extends the outage."],
    p: ["Storage that is encrypted by this service cannot start until this service starts.", "Unseal credentials kept in a place that is itself down in a regional outage."],
    v: "Power off a full test region, then start it with only the documented dependencies and time the path to serving traffic, with no manual steps beyond the documented ones.",
    dep: ["hsm-fleet","operator-quorum","wrapped-key-store","domain-keys"]
  },
  "rollout-safety": {
    s: "The discipline for changing code, configuration and hardware firmware without taking down decryption for anyone: staged deploys, canaries, automatic rollback and change freezes.",
    d: "Changes go through cells and regions in order, starting with internal traffic and a small cell, with health gates on error rate, latency and decrypt success. Configuration, policy engines and cryptographic code are treated as code with the same gates. Format and protocol changes use compatibility steps: write new readers first, then writers. Deployments avoid clearing caches everywhere at once. It is hard because the cost of a bad deploy is every customer's data becoming unreadable, and some changes, like format changes, cannot be rolled back after data is written.",
    k: ["Slow staged rollout vs fast global push: staged limits damage and delays urgent security fixes, while global is quick and unforgiving.", "Compatibility in two releases vs one: two steps allow rollback at each point, and take longer to ship."],
    p: ["A deploy that restarts every node at once empties caches and swamps the hardware.", "A new format written before all readers understand it makes rollback destroy readability."],
    v: "Deploy a deliberately faulty build to a canary cell and confirm the gate halts the rollout and rolls back automatically before the next cell receives it.",
    dep: ["cell-deployment","metrics-slos","algorithm-agility"]
  },
  "disaster-recovery": {
    s: "The tested ability to rebuild the service and its keys after loss of a region, a storage system or the whole hardware fleet, within stated time and data-loss objectives.",
    d: "Plans cover failure classes: single node, zone, region, corruption and root loss. Recovery uses replicated multi-region keys, backups of wrapped key material, custodian shares for the roots and a runbook for each class. Exercises restore into an empty environment and prove customers' data can be decrypted afterward. Recovery objectives are published per tier. It is hard because the worst scenarios involve the very secrets needed to recover, and because documents drift while systems change.",
    k: ["Rehearsed full restores vs analysis of backups: full restores find the missing piece, and cost days of engineering per exercise.", "Tight recovery time objective vs data-loss objective: fast recovery needs hot replicas, while minimal data loss needs synchronous replication and slower writes."],
    p: ["The runbook assumes a tool that lives in the failed region.", "Restores verified by file counts rather than by decrypting real test data."],
    v: "Destroy a test region, rebuild from backups and custodian shares following only the runbook, then decrypt a set of pre-encrypted canary values and confirm all succeed within the objective.",
    dep: ["backup-restore","root-of-trust","multi-region-keys","bootstrap-unseal"]
  },
  "compromise-response": {
    s: "The playbook for a suspected exposure of a key, a credential, a host or a hardware module: contain, assess what was reachable, rotate or revoke, and re-encrypt what must be protected.",
    d: "Responders first limit use by disabling or restricting the affected key, then use the audit log to find every operation and data set it touched. Depending on scope they rotate versions, re-wrap, re-encrypt or retire a whole domain. Customer notification follows rules and needs precise statements of what was exposed. Tooling lists everything under a key and what cached copies remain. It is hard because containment competes with availability, and because the service does not know what customer data sits under data keys.",
    k: ["Disable at once vs investigate first: disabling stops the exposure and may break production, while investigating first keeps running with the risk.", "Re-encrypt exposed data vs rotate going forward: re-encrypting removes the old exposure and takes hours to weeks, while rotation protects only new data."],
    p: ["Disabling a key does not stop clients using cached data keys for the cache lifetime.", "The audit log needed to scope the incident is in the system that was compromised."],
    v: "Run a tabletop and a live drill with a simulated stolen credential: confirm responders can list every key and operation it used within the target time and complete rotation of the affected keys.",
    dep: ["disable-enable","audit-log","rewrap-sweep","key-inventory"]
  },
  "capacity-planning": {
    s: "Forecasting and provisioning hardware, nodes, cache memory and quotas for peak decrypt demand, including the cold-start load that appears after a restart or failover.",
    d: "Demand comes from customer growth, new integrations that put the service under every read, and rare large events such as fleet restarts. The plan covers hardware operations per second by type, memory for caches, storage and network. It also sets default quotas and reviews top consumers. Lead times for hardware are months, so forecasts drive purchases. It is hard because the peak is not the average: a cold cache after an incident multiplies hardware demand, and a single customer's change can double load overnight.",
    k: ["Provisioning for the cold-cache worst case vs for steady state: worst case survives recoveries and costs idle hardware, steady state is cheaper and fails when it matters.", "Customer-visible quotas vs internal limits only: visible quotas encourage caching and planning, while hidden limits surprise customers."],
    p: ["A new integration enabled by default shifts a million reads a second onto decrypt.", "Hardware lead time makes a forecast miss take months to fix."],
    v: "Restart a test region's engines at once under peak replay load and confirm hardware queues and latency stay within objectives. Compare the measured peak with the last quarter's forecast.",
    dep: ["hsm-throughput","material-cache","quotas-throttling","metrics-slos"]
  },
  "break-glass": {
    s: "A tightly controlled, fully logged emergency path that lets named people act outside normal procedure, for example to restore access to a key whose administrators are gone.",
    d: "The path requires multiple approvers, a stated reason and a time limit, grants narrow temporary permissions, and records everything. It exists because every normal control can fail at once: a policy edit can lock out all administrators, and a custodian group can be unreachable. Use triggers an immediate review and an alert. Credentials are held offline. It is hard because it is a deliberate hole: attackers target it, convenience pulls people to use it routinely, and its rarity means its steps are forgotten.",
    k: ["A real emergency path vs none: a path lets a locked-out customer recover, but is a standing attack target and a risk of insider misuse.", "Technical quorum with time limit vs procedural approval: technical limits cannot be skipped under pressure, and slow a real emergency."],
    p: ["The break-glass account used for routine work because it is easier than the normal path.", "Credentials in a safe whose location only one departed person knew."],
    v: "Execute a break-glass recovery on a locked test key: confirm approvals are required, the access expires on schedule, every action is logged and a review ticket is opened automatically.",
    dep: ["quorum-approval","audit-log","operator-quorum"]
  },
  "static-stability": {
    s: "Designing the data path so it keeps working when its dependencies fail: caches, local copies of policy and keys and no control-plane calls on the request path.",
    d: "Serving nodes hold what they need to decrypt locally: metadata, policy, unwrapped keys and the hardware session. The control plane, identity system, storage and metrics may be down for a while without affecting existing keys. Changes stop propagating, and that is the accepted cost. Dependencies are classified and each has a stated failure behavior. It is hard because convenience adds runtime dependencies, and each new one silently reduces availability to the product of all of them.",
    k: ["Serving from local state during dependency failure vs failing closed: local state keeps customers running with stale authorization, while failing closed is safest and turns every dependency failure into an outage.", "Extending cache lifetimes during an outage vs fixed: extending prevents mass failure and widens the revocation delay."],
    p: ["A newly added call to a global service on the request path ties data-plane availability to it.", "Stale policy served during an outage allows a user who was just removed."],
    v: "Take down the control plane, identity system and metadata store in a test region and confirm decrypts for cached keys and existing policies keep succeeding, while control-plane writes fail with a clear error.",
    dep: ["material-cache","metadata-store","identity-policy-evaluation","fail-closed"]
  },
  "latency-availability": {
    s: "The budget for how fast and how reliably decrypt must answer, because the service sits on the read path of every system that stores encrypted data.",
    d: "Callers cannot read their data unless the service answers, so its availability bounds theirs: a service at 99.9 percent caps every dependent system at or below that. Latency adds to every storage read unless caches absorb it. This pushes design toward caching at the client and the engine, local state, over-provisioned hardware and quotas that protect the shared pool. It also decides which checks run per request. Every added check costs time and a dependency, so the budget forces choices between thoroughness and speed.",
    k: ["Cache aggressively vs check every time: caching meets the budget and lengthens revocation delay, while checking each time is current and hard to scale.", "Fail fast under load vs queue: failing fast protects the fleet and surfaces errors to callers, while queueing hides blips and spirals under sustained load."],
    p: ["Stacking several remote checks in the request path makes tail latency the sum of all their worst cases.", "Availability promised without accounting for client-side retries that multiply load."],
    v: "Measure end-to-end decrypt latency percentiles and success from client probes in each region over a month, and compare with the objective, including the period of any deploy or failover.",
    dep: ["material-cache","static-stability","quotas-throttling","metrics-slos"]
  },
  "blast-radius": {
    s: "The question of how much one failure or compromise can reach: one key, one tenant, one cell, one region, one root. Every boundary in the design exists to answer it.",
    d: "Isolation is applied at several scales: per-object data keys, per-tenant domains, cells within regions, regions with separate roots and separate hardware partitions. Each boundary has a cost in complexity and capacity, and each stops a class of failure or attack from spreading. The same question applies to people and to deployments: one operator, one change, one release. It is hard because boundaries erode through shared tools, shared credentials and shared dependencies, and no diagram shows the sharing that actually exists.",
    k: ["Many small boundaries vs few large: small boundaries bound damage and multiply what operators must manage, while large boundaries are simple and fail wide.", "Cryptographic isolation vs logical access control: cryptographic isolation holds through software bugs, and costs keys, hardware and latency."],
    p: ["A shared automation credential that can touch every region makes all boundaries one.", "Boundaries drawn in design documents and never tested by deliberately attacking across them."],
    v: "Pick a boundary, such as a cell, and attempt in a test to cause harm across it by fault injection and by a simulated compromise; confirm what actually spread matches what the design claims.",
    dep: ["tenant-key-domains","cell-deployment","regional-isolation","hierarchy-levels"]
  },
  "trust-boundaries": {
    s: "Where trust changes: between the caller and the service, the service and its operators, the software and the hardware, and between provider and customer, and what each side is assumed unable to do.",
    d: "The design states what an application, an administrator, a provider operator and a hosting platform can each do and see. Keys never leave hardware unwrapped; operators cannot read keys but can affect availability; customers trust the provider's isolation or add their own root. Assumptions are written and tested. Each stronger boundary costs flexibility or money. It is hard because the model must hold across every path, including support access, debugging, backups and telemetry, and because customers hear a stronger promise than the one the design makes.",
    k: ["Provider-held keys with strong controls vs customer-held keys: provider-held is operable and trusts the provider, while customer-held removes that trust and adds customer responsibility.", "Operators with no key access and limited availability powers vs broad support access: limited power protects data, and slows incident handling."],
    p: ["A support tool with read access to production state quietly widens the trust boundary.", "Marketing language promises that even the provider cannot read keys when the design allows it under some conditions."],
    v: "Write the list of who can do what for operators, support and software, then attempt each forbidden action in a test with real credentials; every attempt must fail and be logged.",
    dep: ["hsm-fleet","separation-of-duties","service-vs-customer-keys","audit-log"]
  },
  "crypto-agility": {
    s: "The ability to replace algorithms, key sizes and formats across a service whose data outlives its cryptography, without losing data or breaking callers.",
    d: "Every artifact names its algorithm; decoders are kept for every version ever issued; the service chooses algorithms by policy; and migration tools re-wrap and re-encrypt at scale. Weakening of a primitive, a new standard or a quantum threat all trigger the same process. The work spans the format, the engine, hardware support, client libraries and customer data. It is hard because migration touches data the service does not hold, and because the cost of agility is paid constantly while the need arrives rarely and suddenly.",
    k: ["Building agility early vs when needed: early costs complexity for years, and late means a rushed migration without the headers or tools.", "Server-controlled algorithm policy vs client-controlled: server control upgrades everyone at once, while client control respects local compatibility and lets weak choices persist."],
    p: ["A format with no algorithm field makes any future change a breaking one.", "Migration tooling written in the middle of an emergency."],
    v: "Run a full dry-run migration of a test dataset from one algorithm to another using only the shipped tools, with callers continuing to read during the migration, and verify zero data unreadable at the end.",
    dep: ["algorithm-agility","ciphertext-format","rewrap-sweep","client-libraries"]
  },
  "fail-closed": {
    s: "The rule for what the service does when it cannot be sure: deny. If policy, state or hardware cannot be checked, refuse the operation rather than guess, and accept the outage that follows.",
    d: "Every decision point has a defined unsafe-failure behavior: unreadable policy means deny, unknown key state means deny, failed audit write may mean deny, a failed random source means halt. This protects confidentiality and integrity and converts dependency failures into availability loss, so it conflicts with the latency and availability budget. The compromise is local state with bounded staleness, which lets the service be sure enough without calling out. It is hard because fail-open paths arrive as convenience fallbacks added during incidents and never removed.",
    k: ["Fail closed everywhere vs fail open for read paths: closed never leaks data and makes outages total, while open for reads preserves service and lets revoked access work.", "Bounded staleness before denying vs deny at once: bounded staleness rides out blips, while immediate denial gives exact enforcement."],
    p: ["A fallback to a default-allow policy during an identity outage, added for convenience and never removed.", "A software fallback when hardware fails that silently weakens key protection."],
    v: "For each dependency, disable it in a test and record whether operations are denied or allowed; compare the table with the documented behavior, and treat any unexpected allow as a defect.",
    dep: ["identity-policy-evaluation","static-stability","audit-log","entropy-rng"]
  },
  "data-lifetime": {
    s: "The fact that data often outlives its keys, software and algorithms, and so key destruction, backups and recovery decide whether it can ever be read or ever be truly erased.",
    d: "Destroying a key erases all data under it, which makes deletion a privacy tool and a data-loss risk. Keeping keys preserves the data, and also its exposure. Backups, replicas and caches extend how long material persists. The design must make accidental loss recoverable through waiting periods and backups, and intentional erasure real, through coordinated destruction in all copies. It is hard because the two goals conflict, and because no one knows all the places data and keys have been copied.",
    k: ["Retain old key versions for recoverability vs destroy for erasure: retention protects against loss, and destruction supports privacy promises and shortens exposure.", "Crypto-shredding by key deletion vs deleting every data copy: shredding is fast and complete if no copy of the key survives, while data deletion is slow and unverifiable."],
    p: ["A deleted key survives in a backup, so erased data can be read again.", "A key destroyed on schedule while an archive still depends on it."],
    v: "Delete a test key after its window, then try to restore it from every backup, replica and cache within retention; confirm none produces material, and confirm data under the key is unreadable.",
    dep: ["scheduled-deletion","backup-restore","key-versions","disaster-recovery"]
  },
});
