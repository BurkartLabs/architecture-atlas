// Details for the secrets manager plate, part 4: storage, replication, audit, rotation, recovery, cross-cutting.
ATLAS.details("secrets-manager", {
  "storage-interface": {
    s: "The small contract that every storage backend implements: put, get, delete and list by key, so the rest of the service is independent of where bytes are kept.",
    d: "The interface exposes keys as hierarchical strings with byte values, listing by prefix, and in some backends transactions or locks. Everything above, from the barrier to leases, writes through it. Keeping it tiny makes backends swappable and testable. It is hard because backends differ in consistency, listing cost and atomicity, and the service must stay correct on the weakest one, or restrict which backends it supports for high availability.",
    k: ["A minimal key-value contract vs a rich query interface: minimal works on anything and is easy to verify; the service must build its own indexes, such as lease expiry, on top.", "Support many backends vs few: many fit existing infrastructure; each needs testing for consistency and failure behavior."],
    p: ["A backend with eventual consistency causes lost writes or phantom reads that look like random corruption.", "Listing a large prefix in one call times out, and lease expiry or mount enumeration stalls."],
    v: "Run the contract test suite against the backend: write, overwrite, delete and list concurrently from two nodes and confirm all reads reflect the latest write in order.",
    dep: []
  },
  "consistent-store": {
    s: "An external distributed key-value store that provides strong consistency and locks, used as the backend so several service nodes can share one dataset and elect an active node.",
    d: "The service connects to a separate cluster with its own operations: certificates, backups and upgrades. The backend provides linearizable writes and a lock for leader election. Data in it is already encrypted by the barrier. It is a common choice where such a store exists. The cost is a second distributed system whose health determines yours, and whose operators can read, copy and delete encrypted data.",
    k: ["External backend vs integrated storage: external reuses existing operations skills; two systems must be sized, secured and upgraded in step.", "Share the backend with other applications vs dedicate it: sharing saves hardware; a noisy neighbor or a broad administrator can affect secret availability."],
    p: ["The backend is restored to an old snapshot and the service loses recent writes and leases without any error.", "A backend administrator with no access to secrets still deletes the encrypted data and causes a total outage."],
    v: "Kill the backend leader node and measure service recovery while issuing writes; confirm no acknowledged write is missing afterward and the service resumed within the stated objective.",
    dep: ["storage-interface"]
  },
  "integrated-log": {
    s: "A replicated log and state machine built into the service nodes themselves, so no external database is needed and storage and availability are managed together.",
    d: "Nodes form a cluster using a consensus protocol. Writes are appended to a replicated log, committed on a majority, applied to a local embedded store and snapshotted. The leader of the log is the active node. It simplifies deployment to one kind of node with local disks. In exchange the secret service now owns the disk performance, snapshots and quorum behavior, and losing a majority requires careful manual recovery.",
    k: ["Integrated consensus vs external store: fewer moving parts and one set of nodes; the team takes responsibility for disk speed, log size and quorum recovery.", "Three nodes vs five: three tolerate one failure with lower cost; five tolerate two but add write latency and hardware."],
    p: ["Slow disks make the leader miss heartbeats, triggering repeated elections and brief outages.", "Two of three nodes are lost, there is no quorum, and the service stays down until a documented manual recovery."],
    v: "Stop the leader and confirm another node takes over within the target time, then stop a second node and confirm writes are refused rather than accepted, and that recovery restores service without data loss.",
    dep: ["storage-interface", "leader-election", "snapshots"]
  },
  "storage-encoding": {
    s: "How logical entries become backend keys and values, including prefixes per mount, per namespace and per subsystem, and the format of each ciphertext entry.",
    d: "Each subsystem owns a prefix: the mount table, tokens, leases, policies and each engine's data. Keys are derived from paths, sometimes hashed to hide names. Values are barrier ciphertext with a header naming the key term. A stable layout enables selective replication, cleanup and migration. Hard problems arise on format changes during upgrades and on prefixes that mix data with different replication or retention needs.",
    k: ["Readable key names vs hashed: readable names make debugging easy; hashed names hide paths and secret names from the storage operator.", "Per-mount prefixes vs a shared keyspace: prefixes let replication filter and unmount clean up; they mean many small keyspaces to enumerate."],
    p: ["Secret names and paths are readable in the backend, leaking organizational structure to its administrators.", "An upgrade changes the entry format and a rollback to the older version cannot read new entries."],
    v: "List raw backend keys after writing a secret named with a distinctive string and confirm whether the name appears; confirm each entry's header identifies its key term and nothing else.",
    dep: ["storage-interface", "barrier-encryption"]
  },
  "read-cache": {
    s: "An in-memory cache of decrypted-on-demand storage entries on each node that reduces backend reads, invalidated when another node changes the underlying data.",
    d: "Frequently used entries such as policies, mounts and tokens are kept in memory, often as ciphertext decrypted on use, to avoid a backend round trip per request. Invalidation messages from the active node or from replication clear stale entries. The hard part is correctness on standbys and replicas, where a missed invalidation serves old policy, and memory size, since a large cache holds many secrets resident.",
    k: ["Large cache vs small: large lowers latency and backend load; more secret material lives in process memory, and invalidation matters more.", "Cache plaintext vs ciphertext: plaintext is faster; ciphertext limits what a memory disclosure reveals but repeats decryption."],
    p: ["A missed invalidation leaves a standby serving a deleted policy after the active node removed it.", "The cache is sized for steady state, and a cold start sends a flood of reads to the backend."],
    v: "Delete a policy on the active node and confirm a read on another node reflects the change within the documented interval, and measure backend reads before and after warming the cache.",
    dep: ["storage-interface", "barrier-encryption"]
  },
  "snapshots": {
    s: "Consistent point-in-time copies of all service data, taken on a schedule and stored elsewhere, used for recovery after corruption, operator error or loss of a cluster.",
    d: "A snapshot captures the encrypted storage at a log position, including leases, tokens, mounts and secrets. It is useless without the keys to unseal it. Snapshots are stored off-cluster, ideally immutable and encrypted a second time. Restore replaces the state, which also resurrects deleted secrets and expired tokens. The key problem is proving that a snapshot restores: untested backups and mismatched seal keys are the usual failure.",
    k: ["Frequent snapshots vs infrequent: frequent ones reduce lost writes; they store more copies of secrets and increase exposure.", "Snapshot only vs snapshot plus log shipping: snapshots are simple; shipping the log allows recovery to a precise point at the cost of more machinery."],
    p: ["A restore brings back credentials revoked after the snapshot, so rotated and deleted secrets work again.", "Snapshots are kept in an ordinary bucket with broad read access, giving an attacker offline copies to attack."],
    v: "Restore the latest snapshot into an isolated instance, unseal it with the documented procedure, read a known recent secret, and compare the time since the snapshot with the recovery point objective.",
    dep: ["storage-interface", "barrier-encryption"]
  },
  "leader-election": {
    s: "The protocol by which nodes agree on exactly one active node that handles writes, using a lock in the backend or a consensus election.",
    d: "Nodes contend for a lock or vote with a lease; the winner becomes active and others stay on standby. The active node renews the lock periodically. If it fails to renew, standbys elect a replacement. Fencing prevents an old leader that is merely slow from continuing to write. The hard problems are timing: tuning timeouts against network jitter and pauses, and ensuring two nodes never act as active.",
    k: ["Short election timeouts vs long: short recover quickly; they cause needless elections during brief stalls.", "Lock in an external store vs consensus built in: external reuses a proven lock; integrated avoids a dependency but must be implemented correctly."],
    p: ["A garbage-collection pause or disk stall makes the leader miss renewal and trigger an unnecessary failover.", "Without fencing, the old leader finishes a write after a new leader started, corrupting state."],
    v: "Pause the active node's process and confirm a standby takes over, then resume the old node and confirm it steps down and does not accept writes.",
    dep: ["storage-interface", "standby-nodes"]
  },
  "standby-nodes": {
    s: "Unsealed nodes that hold the data and wait to take over, redirecting or forwarding requests to the active node, and providing capacity for reads in some modes.",
    d: "A standby shares the same storage and is unsealed with the same keys. It watches the lock and takes over on failure. It answers clients by forwarding to the active node or returning a redirect. Some designs allow standby reads of eventually consistent data. They provide availability, not throughput: ordinary writes still go through one node. They must be unsealed and healthy to help, so a sealed standby gives no protection.",
    k: ["Idle standbys vs serving reads: idle standbys give clean failover; serving reads adds capacity but returns possibly stale data.", "Standbys in the same zone vs spread: spreading survives zone loss; cross-zone latency slows consensus and writes."],
    p: ["All standbys are sealed after a maintenance restart, so the next failure is a full outage.", "A load balancer sends traffic to standbys that must forward every request, doubling latency."],
    v: "List nodes and confirm each standby reports unsealed, then stop the active node and confirm a standby becomes active within the failover objective and clients continue after a retry.",
    dep: ["leader-election", "request-forwarding"]
  },
  "request-forwarding": {
    s: "The ability of a standby to relay a client request to the active node over an authenticated cluster channel, so clients need not know which node is active.",
    d: "A request arriving at a standby is sent through a separate cluster port using mutual TLS with certificates derived inside the cluster, executed by the active node, and the response is returned to the client. Alternatively the standby returns a redirect. Forwarding lets any node sit behind a load balancer. It is hard because forwarded requests lose client address information unless carried, and because forwarding failures during failover produce confusing errors.",
    k: ["Forward vs redirect: forwarding is transparent to clients; redirects keep standbys simple but require clients and balancers to follow them.", "Cluster channel with its own certificates vs the client listener: separate channel keeps the trust internal; it needs its own addressing and firewall openings."],
    p: ["Audit logs record the standby's address as the client, not the real caller.", "Large responses or streaming requests do not survive forwarding and fail only through standbys."],
    v: "Send the same write to a standby and to the active node and confirm identical results, and check the audit log records the original client address for the forwarded request.",
    dep: ["standby-nodes", "listener-tls"]
  },
  "performance-replication": {
    s: "Copying configuration and secrets from a primary cluster to secondary clusters in other regions so clients read locally, while tokens and leases stay local to each cluster.",
    d: "Secondaries receive a stream of changes to mounts, policies and static secrets, and serve reads from their own copy. Writes to replicated paths are forwarded to the primary. Tokens and leases created on a secondary stay there. Filters can limit which paths replicate. It lowers latency and spreads load. The cost is lag and the split between replicated data and local state, which is a frequent source of surprise.",
    k: ["Replicate secrets across regions vs keep each region separate: replication gives one source of truth and local reads; it spreads secrets to more places and accepts lag.", "Forward writes to the primary vs allow local writes: forwarding keeps one history; local writes are fast and conflict."],
    p: ["A secret is updated on the primary, and secondary readers see the old value for seconds or minutes.", "Dynamic credentials are issued on a secondary but revoked only if that secondary is reachable, so a regional loss orphans them."],
    v: "Write a secret on the primary, poll a secondary until it appears and record the delay, then cut the link and confirm the secondary continues to serve reads and queues writes or refuses them as documented.",
    dep: ["wal-streaming", "storage-encoding"]
  },
  "dr-replication": {
    s: "A warm copy of everything, including tokens and leases, kept in another site that does not serve clients until an operator promotes it after the primary is lost.",
    d: "A disaster recovery secondary receives the full change stream, so it holds all state needed to take over. It stays passive and rejects client requests. On a disaster the operator promotes it, which requires an authorization such as a one-time operation token, and clients are redirected. It aims at low data loss. It cannot be tested without promoting, so drills are essential, and failing back is its own operation.",
    k: ["Passive warm standby vs active-active: passive is simple and consistent; capacity is idle, and promotion takes human time.", "Replicate tokens and leases vs only secrets: complete state lets clients continue without relogin; it replicates sensitive session state too."],
    p: ["Promotion is attempted for the first time during a real outage and fails because nobody holds the authorization token.", "The secondary lags during a regional failure and the latest writes, including new revocations, are missing."],
    v: "In a drill, promote the secondary, confirm clients with existing tokens continue to read the latest secrets, measure the write loss against the recovery point objective, and then demote and rejoin.",
    dep: ["wal-streaming", "failover-promotion", "storage-encoding"]
  },
  "wal-streaming": {
    s: "Shipping the ordered log of changes from a primary to its secondaries, with an initial full copy and then a continuous stream, so each secondary reproduces the primary state.",
    d: "A new secondary first takes a snapshot of the primary, then replays log entries from the snapshot position onward. Entries are encrypted in transit and applied in order. If the secondary falls too far behind and the log has been truncated, it must resynchronize from a fresh snapshot. This is the mechanism under both replication modes. Hard problems are bandwidth, long catch-up for large datasets, and keeping log retention long enough.",
    k: ["Stream entries continuously vs batch periodically: continuous gives low lag and exposure of changes; batching reduces overhead and increases loss.", "Long log retention vs short: long permits recovery of a lagging secondary; it consumes primary disk and keeps old entries longer."],
    p: ["A slow link makes a secondary fall behind past the retained log and trigger a full resync that saturates the network.", "Replication stalls silently while the secondary appears healthy and reports a stale position."],
    v: "Monitor the position of each secondary relative to the primary under load, then pause the link for longer than normal and confirm catch-up or an alarm, not silent divergence.",
    dep: ["storage-interface", "snapshots"]
  },
  "failover-promotion": {
    s: "The controlled change of which cluster or node is primary, including authorization, redirecting clients, fencing the old primary and rejoining it afterward.",
    d: "Within a cluster, failover is automatic through election. Across clusters, promotion is deliberate: an operator authorizes it, the secondary becomes primary and clients are pointed to it by DNS or a load balancer. The old primary must not accept writes when it returns, or two primaries diverge. After the event, the old site is rebuilt as a secondary. The hard parts are deciding to fail over, and the clients' behavior during the switch.",
    k: ["Automatic cross-cluster promotion vs human decision: automatic reduces downtime; it risks two primaries when a partition rather than a disaster occurred.", "Redirect with DNS vs a global load balancer: DNS is simple; clients cache answers and hold connections to the old site."],
    p: ["The old primary returns after a partition and resumes accepting writes, creating a divergent history.", "Clients cache the old address for a long TTL and keep failing for hours after promotion."],
    v: "Run a promotion drill, confirm the old primary is fenced from writes, measure the time until clients succeed against the new primary, and confirm the old site rejoins as a secondary.",
    dep: ["dr-replication", "leader-election", "root-token"]
  },
  "audit-devices": {
    s: "Configured destinations such as files, sockets or log pipelines that receive a record of every request and response, written before the response is returned.",
    d: "Each request produces a record with time, identity, path, operation, and the request and response bodies with sensitive values hashed. Several devices can run at once; a request proceeds only if at least one device accepts the record. Logs are shipped to a store the secrets operators cannot alter. The difficulty is volume and integrity: busy deployments generate large logs, and the audit trail is only credible if it cannot be edited or silenced by the people it monitors.",
    k: ["Several devices vs one: redundancy keeps service up when one device fails; each device must be monitored and consistent.", "Log full request and response vs metadata only: full records allow detailed investigation; they hold more sensitive hashes and are bigger."],
    p: ["The audit file fills the disk and every request is refused because the service cannot write its record.", "Administrators who can disable a device can also hide their own actions."],
    v: "Perform a read and a failed login, find both in the shipped log with identity, path and result, and confirm the log store rejects modification by the service's own operators.",
    dep: ["hmac-redaction", "request-router"]
  },
  "hmac-redaction": {
    s: "Replacing sensitive strings in audit records with keyed hashes, so an investigator can check whether a given value appears without the log exposing it.",
    d: "Token values, secret contents and similar strings are hashed with a key held by the service before logging. Given a suspected leaked value, an authorized operator asks the service to hash it and searches the log for the result. Different log destinations can share the key or not. The design leaves structure visible and values hidden. Mistakes include logging fields that were not marked sensitive, and low-entropy secrets that a hash still reveals by guessing.",
    k: ["Keyed hash vs plain hash: a key stops offline guessing by anyone with the logs; correlating across systems requires access to the key.", "Hash all string values vs a named list of fields: hashing all is safe by default; named lists keep readable logs and miss new fields."],
    p: ["A new engine returns a secret in a field the redaction rules do not cover, and plaintext appears in audit logs.", "A short numeric secret is hashed but the log reader brute-forces it from the hash in seconds."],
    v: "Write a secret with a distinctive value, search every audit destination for the plaintext and find nothing, then hash the value using the service and find the matching record.",
    dep: ["audit-devices"]
  },
  "audit-failure-policy": {
    s: "The rule that the service refuses to handle requests when it cannot record them in any audit device, choosing assurance over availability.",
    d: "If every configured device fails to accept a record, the router returns an error instead of proceeding. This ensures no action occurs unrecorded, which regulators and incident response require. Operators accept the trade-off by running several independent devices and monitoring them. It is a deliberate fail-closed design. The difficulty is that a logging pipeline outage becomes a full secrets outage, with applications unable to renew leases.",
    k: ["Block on audit failure vs continue and log locally: blocking guarantees a complete trail; a logging fault stops every application.", "Several devices with at least one required vs all required: one required is resilient; all required gives full replication of the trail and more ways to fail."],
    p: ["A log shipping outage blocks all requests and applications fail at once, including those that would restore logging.", "The failure is not noticed until a request fails because device health was never monitored."],
    v: "In a test cluster, make the only audit device unwritable and confirm requests are refused with a clear error, then restore it and confirm service resumes and no unrecorded request succeeded.",
    dep: ["audit-devices", "request-router"]
  },
  "metrics": {
    s: "Numeric time series about request rates, latency, lease counts, token counts, storage latency and replication lag, exported to a monitoring system for dashboards and alerts.",
    d: "The service emits counters, gauges and timings with labels for mount and operation. Typical signals are request latency, errors by type, active leases, lease expirations, storage operation time, leader changes and seal status. Alerts on these detect trouble before users do. It is hard to pick signals that predict failure, and to avoid labels with high cardinality, such as per-token or per-path labels, which overwhelm the monitoring system.",
    k: ["Detailed per-mount metrics vs aggregate: detail points to the cause of a problem; it grows cardinality and cost.", "Pull-based collection vs push: pull is simple and shows failures of the target; push suits short-lived nodes and firewalls."],
    p: ["Lease count grows steadily from a leak and nobody sees it until storage latency degrades the whole service.", "Metrics expose path names that reveal secret names to anyone with monitoring access."],
    v: "Generate load and confirm request rate and latency series respond, then trigger a leader change and a seal and confirm both events appear in metrics and fire configured alerts.",
    dep: ["request-router", "lease-manager"]
  },
  "health-checks": {
    s: "An unauthenticated endpoint that reports whether a node is initialized, sealed, active or standby, with distinct status codes for load balancers and orchestrators.",
    d: "The endpoint returns codes for active, standby, sealed, uninitialized and replication states, plus version and cluster details. Load balancers use it to send traffic only to the active node or any healthy node. It must be cheap and not leak sensitive information. The subtlety is that different probes want different meanings: liveness means the process runs, readiness means it can serve, and a sealed node is alive but not ready.",
    k: ["Distinct status codes per state vs a single ok: distinct codes let balancers route precisely; every probe must be configured to the right codes.", "Unauthenticated health vs authenticated: unauthenticated works with simple infrastructure; it reveals state and version to anyone on the network."],
    p: ["An orchestrator treats a sealed node as failed and restarts it repeatedly, preventing it from ever being unsealed.", "A balancer treats standby status as unhealthy and sends all traffic to one node, losing redundancy."],
    v: "Query the endpoint on each node in each state and confirm the documented code, then check the load balancer's pool contains only nodes it should send traffic to.",
    dep: ["standby-nodes", "unseal-process"]
  },
  "operational-logs": {
    s: "The service's own diagnostic log of startup, errors, elections, replication and storage warnings, separate from the audit trail and free of secret values.",
    d: "Logs record events useful to operators: configuration loaded, seal status, leader changes, failed renewals, plugin errors and slow storage calls. Levels control volume. Unlike audit logs they are not a compliance record, but they are the first place to look in an incident. The care needed is to avoid ever writing secret values, tokens or request bodies at debug level, which operators enable under pressure.",
    k: ["Debug logging available in production vs disabled: debug speeds diagnosis; bodies and identifiers risk leaking.", "Structured logs vs text: structured logs can be searched and alerted on; text is readable on a terminal and fragile to parse."],
    p: ["Debug level is turned on during an incident and left on, writing request details into a logging system with broad access.", "Errors from a plugin embed a connection string with a password in the message."],
    v: "Enable debug level in a test cluster, perform requests with a marker secret and search logs for the marker; it must not appear. Confirm elections and seal changes are logged with timestamps.",
    dep: ["configuration"]
  },
  "static-role-rotation": {
    s: "Periodically changing the password of one fixed account in a target system and storing the new value, for systems that cannot create a new account for each request.",
    d: "A static role binds a name to an existing account. At the rotation period the engine generates a new password, applies it to the target, and stores it so readers fetch the current one. Applications read at connection time. It gives rotation where dynamic credentials are impractical, such as shared accounts. The difficulty is that connections using the old password break at rotation unless the application re-reads, and failure halfway leaves the target and the store different.",
    k: ["Static rotated account vs dynamic per-request accounts: static suits legacy systems with fixed accounts; it loses per-consumer attribution and independent revocation.", "Rotate on a schedule vs on demand: schedules keep age bounded; on-demand rotation after a suspected leak must also be quick."],
    p: ["The password changes in the target but the write to storage fails, locking everyone out of the account.", "Applications cache the password for days and fail all at once at the next rotation."],
    v: "Trigger a rotation, confirm the old password no longer works in the target and the new password read from the service does, and that a connection pool recovers without a restart.",
    dep: ["kv-store", "rotation-schedules", "root-credential-rotation"]
  },
  "root-credential-rotation": {
    s: "Changing the privileged credential the service itself uses to create and revoke accounts in a target, so no human knows or retains it.",
    d: "At setup an administrator provides a powerful credential. The service then rotates it, replacing it with one only the service knows. Later rotations happen on demand or on schedule. This removes the standing human-known credential from the loop. The risk is lock-out: if rotation succeeds in the target but the new value is lost, no one can recover the integration without separate administrative access to the target.",
    k: ["Rotate the root credential immediately vs keep the original: rotating removes human knowledge of it; a lost new value leaves the integration unrecoverable without target-side access.", "Dedicated service account for the engine vs a shared administrator: a dedicated account limits damage and is easier to rotate."],
    p: ["The engine's own credential is never rotated and has been valid for years with broad rights.", "Rotation fails after the target accepted the change and the store still holds the old value."],
    v: "Rotate the root credential in a test target, confirm the original value is rejected, then create a dynamic credential to prove the engine still works, and verify the integration is documented as recoverable.",
    dep: ["database-credentials", "cloud-credentials", "barrier-encryption"]
  },
  "rotation-schedules": {
    s: "Configured intervals or windows at which secrets are rotated automatically, with jitter and retries so a fleet of rotations does not all happen at once.",
    d: "A scheduler tracks next rotation time per static role, key or root credential. When due, it triggers rotation, records the result and retries with backoff on failure. Windows let operators avoid business hours. Schedules are persisted so they survive restarts and failover. The difficulty is that every rotation is a change to production: schedules need alerts for failures, and dependent systems must tolerate the change.",
    k: ["Short rotation periods vs long: short limits exposure from unnoticed leaks; every rotation is a risk of an outage.", "Rotation windows vs any time: windows align with staff on duty; they concentrate load and delay rotation after a missed window."],
    p: ["A rotation fails repeatedly with no alert and secrets stay unrotated for months while everyone believes they are rotated.", "All rotations are scheduled at midnight and overload the target systems and the service."],
    v: "Check that every rotatable secret has a last-rotated time within its interval, force a failure in a test target and confirm an alert fires and retries occur.",
    dep: ["lease-manager", "static-role-rotation"]
  },
  "dual-credential-rotation": {
    s: "A rotation approach that keeps two valid credentials at once, switching which one is active, so consumers still holding the old one keep working until it is retired.",
    d: "The target supports two credentials at a time, such as two API keys or two database users. At rotation the inactive credential is replaced and becomes active; the previous stays valid for a grace period. Consumers read the current value on their own schedule and cross over without an outage. Retiring the old one completes the cycle. It needs target support and careful tracking of which is which and when the old one is revoked.",
    k: ["Overlap with two live credentials vs a hard cutover: overlap avoids outages; for the grace period a leaked old credential still works.", "Long grace period vs short: long is forgiving of slow consumers; short limits exposure but breaks laggards."],
    p: ["The old credential is never revoked after the grace period and both stay valid indefinitely.", "Consumers pin the old credential in a file that is never re-read and fail when it is finally retired."],
    v: "Rotate and confirm both credentials work during the overlap, confirm clients move to the new one, then after the grace period confirm the old one is rejected and no client errors occur.",
    dep: ["static-role-rotation", "rotation-schedules"]
  },
  "staleness-alerts": {
    s: "Reports and alerts on secrets that are old, unused, near expiry or past their rotation interval, so ownership gaps are found before an expired credential causes an outage.",
    d: "The service or an adjacent tool reads metadata and access times: when each secret was written, last read and expires. It flags credentials never rotated, secrets with no readers and certificates close to expiry. Owners are notified. It turns rotation from a hope into a measurable property. The difficulty is noise and ownership: without clear owners and thresholds, alerts are ignored.",
    k: ["Alert on age vs on actual expiry: age catches forgotten secrets; expiry alerts prevent outages and need accurate expiry data.", "Alert owners vs a central team: owners can act and know context; a central team gives consistency and can chase."],
    p: ["A certificate expiry alert goes to a shared mailbox nobody reads and the outage is the first sign.", "Secrets that are never read are deleted as unused, but they were a break-glass credential."],
    v: "List secrets older than their policy interval and confirm each has a notified owner; create a test certificate close to expiry and confirm an alert reaches the owner within the target time.",
    dep: ["secret-metadata", "rotation-schedules"]
  },
  "leak-detection": {
    s: "Searching code, logs, tickets and images for live secret values issued by the service, and treating any match as an incident with automatic revocation or rotation.",
    d: "A scanner looks for known issued values or recognizable formats, since tokens often carry a prefix and checksum that make them detectable. When a match is found in a repository or log, the owner is alerted and the secret revoked. The audit log's keyed hashes allow checking a suspected value without exposing it. It is hard to avoid both false positives and misses, and a leak is only closed when the secret is actually rotated.",
    k: ["Recognizable token formats vs opaque tokens: recognizable formats make scanning accurate; they also make a leaked token easy for attackers to identify.", "Automatic revocation on detection vs alert only: automatic limits exposure at once; a false positive causes an outage."],
    p: ["A leaked secret is removed from a repository but never rotated, so history and caches keep it usable.", "Scans cover source code but not build logs and chat, where secrets leak most often."],
    v: "Plant a canary secret in a test repository, confirm the scanner detects it and the secret is revoked, and measure the time from commit to revocation against the target.",
    dep: ["hmac-redaction", "prefix-revocation", "token-store"]
  },
  "root-token": {
    s: "A token with unlimited privilege, created only at initialization or by a quorum process, used for setup or emergency repair and then revoked.",
    d: "Initialization yields one root token for configuring auth and policies. Normal operation should never use it; it is revoked afterward. If needed later, a new one is generated by a process requiring the threshold of key holders, which creates it from a nonce and one-time password. It is the sharpest tool in the system. Problems come from root tokens left in automation or shell history, with no expiry.",
    k: ["Revoke after setup, regenerate by quorum vs keep one: revoking removes a standing target; emergencies need the quorum to be available.", "Root token with expiry vs without: expiry limits forgotten use; it can run out before a long recovery is finished."],
    p: ["The initial root token is saved in a ticket or script and still works a year later.", "During an emergency nobody can assemble the quorum, and recovery is delayed."],
    v: "List tokens by accessor and confirm none is a root token; run the quorum generation procedure in a test cluster, use the token, revoke it and confirm the audit log shows all steps.",
    dep: ["key-shares", "token-store", "recovery-keys"]
  },
  "recovery-keys": {
    s: "Key shares, distinct from the root key, that authorize sensitive administrative operations on an auto-unsealed cluster, such as generating a root token, but cannot decrypt data.",
    d: "With auto-unseal the root key is held by an external service, so there are no unseal shares. Recovery keys are generated at initialization as shares with a threshold, and approve actions like generating a root token, rekeying or changing the seal. They are not able to unwrap data. They keep humans in the loop for privileged actions. The hazard is neglect: they are used so rarely that custodians and procedures are forgotten.",
    k: ["Recovery keys held by people vs by an automated escrow: people give real separation of duties; automation is available when people are not.", "Same custodians as other duties vs distinct: overlap is convenient; distinct custodians prevent a small group from holding every privileged key."],
    p: ["Nobody has verified the recovery keys exist since the day of initialization, and some custodians are gone.", "Recovery keys are stored together with the cloud credentials, so one compromise yields both."],
    v: "Run a drill where the threshold of custodians generate a root token using recovery keys, and confirm that fewer custodians cannot, and that the keys cannot decrypt stored data on their own.",
    dep: ["key-shares", "auto-unseal"]
  },
  "emergency-seal": {
    s: "An operation that immediately seals the service, wiping keys from memory, to stop all access when compromise is suspected, at the price of complete unavailability.",
    d: "A privileged request, or a small number of authorizations, causes the node to forget its data key, refuse every request, and optionally step down. Other nodes in the cluster can be sealed in turn. It trades availability for containment. It is hard to use responsibly because sealing takes down every dependent application, and unsealing requires the full process, so it is a last resort practiced in advance.",
    k: ["A single holder can seal vs needing quorum: a single holder can act within seconds; abuse or accident can cause outages.", "Seal one node vs the whole cluster: one node limits impact; a compromised active node needs the whole cluster sealed."],
    p: ["Someone seals during a false alarm and no one is available to unseal for hours.", "Only the active node is sealed, and a standby takes over with the keys still in memory."],
    v: "In a test cluster, run the emergency seal, confirm every node reports sealed and refuses requests, then perform the unseal procedure and measure time to full service.",
    dep: ["unseal-process", "capabilities", "policy-evaluation"]
  },
  "break-glass-policy": {
    s: "A pre-written elevated policy and process that grants an on-call person temporary broad access when normal paths fail, with approvals, short lifetime and heavy audit.",
    d: "The policy is attached to a separate identity or granted through multi-party approval. A request creates a short-lived token, alerts the security team and starts a review clock. Afterward, the use is reviewed and any changes made are reconciled. It exists because outages happen when the identity provider or approvers are unavailable. The design challenge is making it usable in a crisis but rare, and ensuring it is not the everyday path.",
    k: ["Short-lived token with alert vs standing break-glass account: temporary access limits exposure and creates a review trail; a standing account is available but is a permanent target.", "Offline credentials vs online approval: offline works when systems are down; its custody and secrecy are a risk of their own."],
    p: ["The break-glass account is used routinely because it is more convenient than the normal workflow.", "The process depends on the identity provider that is down in the emergency it is meant for."],
    v: "Run a break-glass exercise during a simulated identity provider outage, confirm access is granted within the target time, that alerts fire, and that the token expires and the review is opened.",
    dep: ["approval-groups", "token-store", "audit-devices"]
  },
  "disaster-restore": {
    s: "The documented and rehearsed procedure to rebuild the service from backups and key material in a new environment after loss of the clusters and their storage.",
    d: "It starts with new infrastructure, restores the latest snapshot, unseals with shares or the external key, and checks leases, tokens and mounts. Clients are repointed and credentials issued since the snapshot are reconciled. Revoked secrets reappear in the restored state and need cleanup. It is hard because it exercises every dependency at once and is almost never done: untested restores fail on missing keys, changed endpoints or expired certificates.",
    k: ["Rebuild from snapshot vs fail over to a replica: rebuild survives loss of everything and replication bugs; failover is far faster but depends on the replica being intact.", "Rehearse regularly vs document only: rehearsal finds missing pieces; it costs staff time and an isolated environment."],
    p: ["The snapshot restores but the key shares or external key needed to unseal it were lost with the original site.", "After restore, secrets revoked since the snapshot work again until someone reconciles them."],
    v: "Perform a full restore into an empty environment from stored backups and documented keys only, time the process against the recovery objective, and confirm applications authenticate and read secrets.",
    dep: ["snapshots", "unseal-process", "recovery-keys"]
  },
  "mass-revocation": {
    s: "The ability to revoke all tokens and leases of a class, namespace or the whole service quickly after a breach, and force every client to authenticate again.",
    d: "Operators revoke by prefix, by auth method, by namespace or by identity, and can disable a login method to stop new tokens. Credentials in targets are removed as leases are revoked. After mass revocation, clients re-authenticate and obtain new credentials. Planned in advance it limits damage. Unplanned it causes a thundering herd of logins and credential creation that can overload the service and the targets.",
    k: ["Revoke everything at once vs by stages: all at once removes an attacker immediately; staging protects availability but leaves a window.", "Disable the auth method first vs revoke tokens first: disabling stops new access while you work; revoking first lets the attacker log in again."],
    p: ["Revocation succeeds but the attacker's access came through a still-enabled login method and returns at once.", "Thousands of clients re-authenticate in the same second and the service rate-limits them, extending the outage."],
    v: "In a test cluster, revoke all tokens under a class during load, confirm every old token fails within seconds, and measure how quickly clients re-authenticate and recover.",
    dep: ["prefix-revocation", "lease-manager", "auth-method-framework"]
  },
  "trust-boundary": {
    s: "The decision about what is trusted when storage, backups, networks or operators are compromised, which fixes where encryption happens and who can see what.",
    d: "A secrets manager usually assumes the storage backend, its backups and the network are hostile, and trusts only the running unsealed process and the people holding key shares. Everything else follows: the barrier, sealing, audit and separation of duties. The boundary must also cover operators with host access, who can read process memory, so some designs add hardware protection. Each choice states which attacker the design defeats and which it does not.",
    k: ["Untrusted storage vs trusted storage: untrusted storage allows cheap shared backends and backups; it requires encryption everywhere and a key ceremony.", "Defend against host administrators vs assume they are trusted: defending needs hardware isolation and separated roles; assuming trust is simpler and weaker against insiders."],
    p: ["The threat model is never written down, so different teams assume different protections and gaps open between them.", "Memory dumps and swap files are outside the model, and keys leak through them."],
    v: "Take a copy of storage and a full backup, attempt to extract any secret or key without the unseal ceremony, and confirm the attempt fails; list the attackers explicitly out of scope.",
    dep: ["barrier-encryption", "root-key"]
  },
  "secret-zero": {
    s: "The problem that the first credential a workload uses to get its secrets must itself arrive safely, and the choices of platform identity, wrapped delivery or trusted orchestrator that answer it.",
    d: "Every login needs something to present, and that something cannot itself be a stored secret without recreating the problem. Solutions push the trust onto something else: the platform's signed identity, a trusted orchestrator that delivers a wrapped single-use value, or a certificate issued at provisioning. Each is only as safe as what it trusts. The aim is that no long-lived credential is baked into images or repositories.",
    k: ["Platform-signed identity vs orchestrator delivery: platform identity needs nothing delivered; orchestrator delivery works anywhere but makes the orchestrator a trusted party.", "Single-use bootstrap values vs long-lived: single-use reduces replay; the delivery step must be reliable and fast."],
    p: ["A bootstrap token is placed in the image or a config repository and works long after deployment.", "Any process on a host can request the host's identity, so identity attaches to the machine, not the workload."],
    v: "Inspect an image, its configuration and its source repository for any credential that logs in to the service; none should exist, and a freshly started workload should obtain access using only platform-provided identity.",
    dep: ["platform-attestation", "role-secret-login", "request-wrapping"]
  },
  "short-lived-vs-static": {
    s: "The choice, per secret, between creating credentials on demand with minutes of life and storing long-lived values with rotation, which sets the work done by every other layer.",
    d: "Dynamic secrets are unique and expire by themselves, so leaks matter less and attribution is exact; they require engines, lease management and applications that renew or reconnect. Static secrets work with any system and any client but need rotation, ownership and leak response. Most real deployments mix both, and the dividing line is set by what the target system can do and what the application can tolerate.",
    k: ["Dynamic credentials vs rotated static secrets: dynamic bounds leak damage and attributes access; static is compatible with any system and needs rotation discipline.", "Very short lifetimes vs moderate: very short ones give near-zero exposure; they raise load and make the service a runtime dependency."],
    p: ["Teams choose static everywhere for convenience and never build the rotation that was promised.", "Applications cannot handle credential changes mid-run and are given long TTLs, defeating dynamic secrets."],
    v: "For each secret class, list its lifetime and last rotation; confirm that classes labeled dynamic expire without human action and that static ones have been rotated within their interval.",
    dep: ["lease-manager", "static-role-rotation"]
  },
  "blast-radius": {
    s: "How much one stolen token, one compromised node or one policy mistake can expose, controlled by path design, namespaces, scoped tokens and separate clusters for separate trust domains.",
    d: "Every layer can narrow or widen the damage. Narrow policies and short tokens limit what a stolen token reads. Namespaces and mounts divide data. Separate clusters per environment or sensitivity stop compromise from crossing. The cost of isolation is operations, since more clusters mean more to run, so decisions balance risk against effort and are best made by sensitivity, such as production versus development.",
    k: ["Separate clusters per environment vs one shared: separate clusters contain breaches and mistakes; they cost more to run and keep consistent.", "Per-workload policies vs team-wide: per-workload limits what a stolen identity reads; broader policies are easier to manage and expose more."],
    p: ["A development token can read production secrets because both live in one cluster with a shared wildcard policy.", "Shared administrative tokens mean one leaked token has access to every team's data."],
    v: "Take one low-privilege production token and enumerate everything it can read and list; the result should be only that workload's own paths, and the audit log should show every denied attempt.",
    dep: ["namespaces", "policy-evaluation", "mount-paths"]
  },
  "availability-vs-security": {
    s: "The tension that a service every application depends on must stay up, while its safest behaviors, such as sealing, blocking on audit failure and requiring approval, deliberately stop work.",
    d: "Applications fetch secrets at startup and renew them continuously, so an outage spreads. Caching, standbys, replication and auto-unseal improve availability; each also extends trust or leaves secrets longer-lived in more places. Fail-closed settings protect assurance and make failures loud. The design question is for each failure which side wins and who decides, and it should be settled, written and tested, not discovered during an outage.",
    k: ["Fail closed vs fail open on each failure: failing closed preserves security guarantees; failing open keeps applications running and silently weakens them.", "Cache and tolerate outages vs always check: caching rides through outages; revocation then reaches clients late."],
    p: ["A dependency, such as a key service or a logging pipeline, makes the secrets service fail along with it, and nobody listed it as a dependency.", "Teams add caching to fix an outage and revocation no longer works for hours."],
    v: "Inject each failure in turn, such as backend loss, audit sink loss, key service loss and one-node loss, and record whether the service stays up or stops, comparing each result with the written decision.",
    dep: ["audit-failure-policy", "client-caching", "auto-unseal"]
  },
  "consistency-model": {
    s: "The guarantees about when a write, a revocation or a policy change becomes visible to every node and cluster, from immediate on the active node to eventual on remote replicas.",
    d: "Within a cluster, writes go through one active node and are committed in order, so reads on the active node are current. Standbys and cluster replicas lag. Revocation, the change that matters most for security, is only as fast as the weakest path: caches, replicas and offline clients can honor a revoked secret for seconds or minutes. Designers must know these windows and design around them.",
    k: ["Strong consistency on one active node vs read scaling: strong consistency makes revocation immediate; reads cannot scale beyond that node.", "Local reads in remote regions vs always reading the primary: local reads are fast and resilient; they may return stale secrets or policy."],
    p: ["Teams assume a revocation is instant but a replica cluster honors the old policy for minutes.", "An application reads a secret right after writing it from another node and gets the previous version."],
    v: "Change a secret, revoke a token and edit a policy, then measure on each node, replica and client cache how long each old value or permission still works, and compare it with documented bounds.",
    dep: ["performance-replication", "read-cache", "wal-streaming"]
  },
});
