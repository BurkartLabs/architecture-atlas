// Details for the secrets manager plate, part 3: access policy, request core, seal and barrier.
ATLAS.details("secrets-manager", {
  "policy-language": {
    s: "A small declarative language in which each policy lists paths and the capabilities granted on them, forming the only authorization mechanism in the system.",
    d: "A policy is a document of rules, each naming a path pattern and a set of capabilities, with optional constraints on parameters. Tokens carry one or more policy names; their rules combine. There is no implicit access: whatever is not granted is denied. Policies are stored and versioned like data and changed through the API. The difficulty is human: reviewing rules for unintended overlap and keeping hundreds of them understandable.",
    k: ["Allow-only rules with default deny vs explicit deny rules: allow-only is easy to reason about; explicit deny is needed to carve exceptions and makes evaluation order matter.", "Policies as code in version control vs edited live: code gets review and history; live edits are fast and drift from the repository."],
    p: ["A wildcard at the wrong level grants a team access to every other team's secrets.", "Policies are changed in the console during an incident and never recorded in version control."],
    v: "Apply a new policy to a test token, confirm each intended path succeeds and each neighboring path is denied, and confirm the policy change is recorded in the audit log with the author.",
    dep: ["path-matching", "capabilities"]
  },
  "path-matching": {
    s: "The rules by which a request path is compared with policy patterns: exact paths, trailing wildcards and single-segment wildcards, with the most specific match taking precedence.",
    d: "Policy paths are matched segment by segment. An exact path outranks a prefix with a trailing wildcard, and a segment wildcard matches one level. Matching also sees the namespace prefix. Because paths are the unit of authorization, small details matter: normalization of repeated slashes, trailing slashes on list operations, and the distinction between data and metadata paths for the same secret in a versioned engine.",
    k: ["Most specific match wins vs union of all matches: specificity lets narrow rules restrict broad ones; unioning is simpler but cannot express a restriction.", "Segment wildcard vs prefix wildcard: segment wildcards fit uniform layouts; prefix wildcards are easier to write and cover more than intended."],
    p: ["A policy covers the data path of a versioned engine but not its metadata or delete paths, giving partial or surprising access.", "A path is not normalized before matching, so a crafted request with extra slashes slips past a deny rule."],
    v: "Test a table of requests against one policy, including doubled slashes, trailing slashes and similar prefixes, and confirm each is allowed or denied exactly as the table predicts.",
    dep: ["policy-language"]
  },
  "capabilities": {
    s: "The named actions a policy can grant on a path, such as read, create, update, delete, list and sudo, each mapped from the HTTP verb and the operation.",
    d: "Every request is translated into one required capability for its path. Create and update are distinct so a writer can add but not overwrite. List is separate from read so users can see names without values. A privileged capability protects dangerous paths such as seal or policy edits. Engines add their own semantics. The challenge is that versioned and special engines expose several paths for what feels like one operation, so one logical action needs several capabilities.",
    k: ["Fine-grained capabilities vs read and write only: fine control supports least privilege and separation of duties; policies get longer and easier to get wrong.", "A separate privileged capability vs treating admin paths as normal: it isolates the dangerous operations from ordinary rights; it must be tracked and rarely granted."],
    p: ["Granting update without create or the reverse produces confusing failures that push people to grant everything.", "Sudo is given broadly to unblock a task and never removed."],
    v: "With a token holding only create, write a new path and confirm success, then try overwriting it and confirm refusal. With only list, confirm names are visible and values are denied.",
    dep: ["policy-language"]
  },
  "policy-evaluation": {
    s: "The step that takes the caller's tokens policies, the request path and the needed capability, and returns allow or deny before the engine sees the request.",
    d: "The server resolves the token's policies, including those from identity groups, merges their rules for the request path, and checks that the needed capability is present and constraints hold. Evaluation happens on every request before routing to the engine, with results often cached. Denial is the default and reasons are logged. It must be fast and deterministic; its complexity comes from group inheritance, namespaces and overlapping rules.",
    k: ["Evaluate on every request vs cache the decision: evaluation per request reflects policy edits instantly; caching saves time but lets a removed permission linger.", "Merge all policies vs first match: merging is predictable for additive rules; it makes it hard to see which policy granted an action."],
    p: ["A cached policy lets a removed permission continue to work for minutes after an emergency change.", "Group-derived policies are not included in the debugging view, so operators cannot see why access was granted."],
    v: "Remove a capability from a policy used by a live token and confirm the very next request is denied, then compare an effective-permissions query with the actual outcomes for a sample of requests.",
    dep: ["policy-language", "token-store", "identity-entities"]
  },
  "templated-policies": {
    s: "Policies containing placeholders filled from the caller's identity, so one rule gives each workload access only to its own subtree.",
    d: "A path might contain an identity name or metadata value that is substituted at request time with the caller's entity name, alias metadata or group. One policy then covers every application in the organization, each seeing only its own secrets. It reduces thousands of policies to a few. It is hard because the substituted values must be trustworthy and well formed: an identity name containing path separators or wildcards can escape the intended subtree.",
    k: ["Templated policies vs one policy per workload: templates scale and cannot drift; a mistake in one template affects every workload.", "Substituting names vs stable identifiers: names are readable in paths; identifiers never change when something is renamed."],
    p: ["An attacker who controls their own identity name chooses a value that expands to another workload's path.", "Renaming an application changes the substituted path and silently removes access to its secrets."],
    v: "Create two identities, confirm each reads only the path built from its own name, then try a name containing a slash or wildcard and confirm creation is refused or the match is escaped.",
    dep: ["policy-language", "identity-entities", "path-matching"]
  },
  "identity-entities": {
    s: "A canonical identity that ties together all the logins a person or workload uses across methods, carrying metadata, group memberships and policies that apply regardless of how they log in.",
    d: "Each successful login produces an alias in an auth method; aliases are linked to one entity. Policies can be attached to the entity or to groups it belongs to, internal or mapped from external groups. This gives one view of who did what across methods and allows the same person to have consistent rights. It is hard to keep clean: automatic creation of entities generates many, merging duplicates is manual, and stale entities hold stale policies.",
    k: ["Automatic entity creation vs explicit registration: automatic entities give full audit attribution at once; clutter and accidental duplicate identities follow.", "Policies on groups vs entities: groups scale and follow organization changes; entity policies are precise but accumulate."],
    p: ["The same person gets two entities through different methods, so rights and audit trails are split.", "Entities of departed people stay with their policies and can be reached through any method still mapped to them."],
    v: "Log in through two methods as one person, confirm both map to a single entity, and that the audit log shows the same entity identifier for actions through either login.",
    dep: ["auth-method-framework", "token-store"]
  },
  "parameter-constraints": {
    s: "Rules inside a policy that restrict which fields or values a request may send, such as allowed values for a role name or a forbidden field.",
    d: "A path rule can list required, allowed or denied parameters and permitted values. A request that carries a disallowed parameter or value is refused even though the capability exists. This enables patterns such as letting a team create certificates but only with short lifetimes. Constraints are powerful but fragile: they depend on how each engine names and parses fields, so they must be tested per engine.",
    k: ["Constraints in policy vs in the engine role: policy constraints are central and visible; engine roles are closer to the semantics and harder to bypass.", "Allow-list of values vs deny-list: allow-lists fail closed; deny-lists miss forms of values nobody thought of."],
    p: ["A parameter is supplied in a different form or case than the constraint expects and passes unchecked.", "Engine upgrades add a new parameter that the old constraint does not know to restrict."],
    v: "Attempt a request with an allowed value, a disallowed value and an extra undeclared field, and confirm only the first is accepted while the others are refused with logged reasons.",
    dep: ["policy-language", "path-matching"]
  },
  "approval-groups": {
    s: "A requirement that one or more named approvers authorize a request before it runs, applied to dangerous operations so no single credential can perform them alone.",
    d: "A policy marks a path as needing approval. The first request returns a pending token and creates an authorization record; approvers from named groups add approvals through their own logins; when the threshold is met the original requester can complete the action. It enforces separation of duties for things like policy change or key destruction. The difficulty is human latency and usability, and making sure approvers cannot be the requester.",
    k: ["Multi-party approval vs a single privileged role: approval prevents unilateral action and insider risk; operations take longer and need available approvers.", "Approval per request vs time-boxed grant: per request is tightest; time-boxed reduces interruptions but widens the window for misuse."],
    p: ["The requester is also in the approver group and approves their own request, defeating the control.", "No approver is reachable during an outage and the fix waits on people or bypass."],
    v: "Request a protected operation, confirm it is held pending, have a second identity approve it, and confirm it completes only after the threshold with both identities in the audit log.",
    dep: ["policy-evaluation", "identity-entities", "token-store"]
  },
  "listener-tls": {
    s: "The network endpoint that accepts client connections, terminates TLS with a server certificate, optionally requests client certificates, and passes decoded requests to the pipeline.",
    d: "One or more listeners bind to addresses with certificates, minimum protocol versions and cipher choices. They apply timeouts and size limits and may forward client certificate information. Certificate rotation must happen without dropping connections. It is hard because the listener is the exposed surface, and clients trusting it depend on certificates the service itself may issue, a circularity that complicates bootstrap and recovery.",
    k: ["Terminate TLS at the service vs at a proxy: end-to-end TLS keeps the service identity and client certificates intact; proxies add features and a trusted hop.", "Short-lived listener certificates vs long: short limit damage from key theft; reloading and distribution of trust must work reliably."],
    p: ["The listener certificate expires and every client, including the recovery tooling, refuses to connect.", "A listener without a request size limit lets a single client exhaust memory."],
    v: "Connect with a current TLS client and confirm the expected certificate chain and protocol version, then connect with an old protocol version and confirm refusal, and replace the certificate on a live listener and confirm no dropped connections.",
    dep: ["configuration"]
  },
  "request-router": {
    s: "The core dispatcher that authenticates a request, evaluates policy, finds the engine mounted at the path and calls it, then wraps the response with leases and audit.",
    d: "For each request it extracts the token, looks it up, checks policy, writes an audit record before processing, then consults the mount table to find the handler. The result passes back through response filtering and, if a lease was created, lease registration. Sealed or standby nodes short-circuit with an error or a forward. The difficulty is the strict ordering of these steps, since an error in order exposes data or loses audit.",
    k: ["Audit before the handler vs after: logging first guarantees a record of attempts; the record exists even if the engine fails.", "A single serialized path for all engines vs engine-specific middleware: uniformity makes behavior consistent; unusual engines need hooks that complicate the core."],
    p: ["An engine handles a request before audit succeeds, so an action is performed with no record.", "Errors from the engine include secret material in the message that is then logged in plain text."],
    v: "Send requests to each state, sealed, standby and active, and confirm they return the documented error, forward or result, and that each outcome has an audit entry written before the response.",
    dep: ["mount-table", "policy-evaluation", "token-store", "audit-devices"]
  },
  "mount-table": {
    s: "The persistent map from path prefixes to engines and auth methods, with their configuration, so the router knows where each request goes and which settings apply.",
    d: "Mounting an engine records its type, path, options and a unique storage prefix. Unmounting revokes its leases and removes its data. The table is stored encrypted and replicated. Mount options include default and maximum TTL. It is hard because mount operations affect many requests: unmounting a path destroys data under it, and tuning options affects all callers of the mount at once.",
    k: ["Separate storage prefix per mount vs shared storage: separate prefixes isolate engines and make unmount clean; many small mounts cost more to enumerate.", "Mount tuning at the mount level vs per role: mount-level limits are a safety ceiling; roles need finer control within them."],
    p: ["Unmounting the wrong path deletes all secrets under it with no soft delete to recover them.", "A mount's maximum TTL is set high for convenience, weakening every role beneath it."],
    v: "Mount an engine on a test path, write data, then unmount it and confirm all its leases are revoked and its storage prefix is empty, and that other mounts are unaffected.",
    dep: ["storage-interface", "barrier-encryption"]
  },
  "plugin-runtime": {
    s: "The mechanism for loading engines and auth methods as separate programs, verified by checksum and run with limited privileges, so extensions cannot corrupt the core.",
    d: "A plugin is a binary registered with its checksum. The server launches it as a child process, communicates over a local authenticated channel and restricts what it can reach, sometimes in a sandbox or container. Plugins implement a fixed interface for requests and storage access. Isolation protects the core from crashes and memory errors, but plugins handle raw secrets, so supply chain and version compatibility become operational concerns.",
    k: ["Out-of-process plugins vs in-process: crashes and memory faults stay contained; each call crosses a process boundary and costs latency.", "Pinned checksums vs trust on first use: pinning prevents swapped binaries; every upgrade requires a deliberate registration step."],
    p: ["A plugin is upgraded across an incompatible interface version and fails to start, breaking everything mounted on it.", "A plugin runs with the same privileges as the server and a bug in it reads the unseal key."],
    v: "Register a plugin with a wrong checksum and confirm it will not load, register the right one, kill its process during a request and confirm the core stays up and restarts the plugin.",
    dep: ["mount-table", "configuration"]
  },
  "quotas-and-limits": {
    s: "Limits on request rate, concurrent leases and request size, per path, namespace or client address, that keep one noisy caller from exhausting the service.",
    d: "Rate limit quotas count requests per time window by mount, namespace or source; lease count quotas cap how many active leases a mount may hold. When exceeded the service returns a rate-limit error. Limits protect shared infrastructure and shield backends that cannot take unlimited credential creation. They are hard to set: too low and legitimate startup bursts fail, too high and they protect nothing, and clients must back off correctly.",
    k: ["Per-client limits vs global limits: per client isolates tenants; a global limit protects the process but lets one client starve others.", "Fail fast with errors vs queue requests: errors give clients a clear signal; queuing smooths bursts but hides overload and raises latency."],
    p: ["A fleet restart sends every instance to log in together, hits the limit, and retries without jitter in lockstep.", "A lease-count limit is reached by leaked leases from a buggy client and blocks new legitimate credentials."],
    v: "Drive requests above the configured rate from one client and confirm refusals begin at the limit while another client is unaffected, then stop and confirm normal service resumes within the window.",
    dep: ["request-router", "configuration"]
  },
  "configuration": {
    s: "The file and runtime settings that define listeners, storage, seal mechanism, telemetry and defaults, loaded at startup and partly reloadable without restart.",
    d: "A configuration describes storage backend, listener addresses and certificates, the seal type, cluster addresses, log level, and default lease durations. Most changes require a restart or an unseal; some can reload by signal. Secrets in configuration, such as storage credentials or cloud key references, are themselves a bootstrap problem. It is hard because a bad configuration can lock the service out of its own storage or key, and settings differ between nodes.",
    k: ["Configuration in files vs stored dynamically in the service: files are available before unseal and under change control; dynamic settings avoid restarts but need a working service.", "Identical configuration on all nodes vs per-node: identical is easy to validate; per-node settings are needed for addresses and drift easily."],
    p: ["One node is restarted with an outdated seal configuration and cannot unseal.", "A storage credential is placed in the configuration file in plain text and read by anyone with host access."],
    v: "Start a node from a candidate configuration in a test environment, confirm it unseals and serves, change a reloadable setting by signal and confirm it takes effect without dropping connections.",
    dep: []
  },
  "barrier-encryption": {
    s: "The layer that encrypts every value before it reaches storage and decrypts on read, so the storage backend only ever holds authenticated ciphertext.",
    d: "All engines and subsystems write through the barrier, which encrypts each entry with the data encryption key using authenticated encryption and binds it to its storage path. When sealed, the key is not in memory and every call fails. The barrier makes the storage backend untrusted. It is hard because it must be fast, because nonce management over billions of writes has limits that force key rotation, and because anything stored outside it is unprotected.",
    k: ["Encrypt every entry vs encrypt only selected secrets: encrypting everything means no metadata leaks and no mistakes; it costs CPU on every read and write.", "Bind ciphertext to its path vs no binding: binding stops an attacker moving valid ciphertext between keys; renaming entries requires re-encryption."],
    p: ["Nonce reuse after a very large number of writes under one key breaks the encryption's guarantees.", "A subsystem writes directly to the storage backend and bypasses the barrier, leaving plain text on disk."],
    v: "Write a distinctive value and search a raw dump of the storage backend for it and for the path name; neither should be found. Seal the service and confirm reads fail.",
    dep: ["data-encryption-key", "storage-interface"]
  },
  "data-encryption-key": {
    s: "The symmetric key that actually encrypts all stored entries, held only in memory while unsealed and stored on disk only in a form wrapped by the root key.",
    d: "The key is generated at initialization, wrapped by the root key and written to storage. At unseal the root key unwraps it and it lives in memory. Periodic rotation adds a new key term; old terms stay to read old data. Because it is wrapped, changing the root key (rekey) only re-wraps one small object rather than all data. It is critical: losing the wrapped copy or the root key means all data is gone.",
    k: ["Two-level keys vs encrypting data directly with the root key: rekeying becomes cheap and the root key never touches bulk data; there is one more layer to protect and back up.", "Automatic rotation by write count vs manual: automatic prevents hitting usage limits; operators must understand the retained old terms."],
    p: ["Memory of the unsealed process is dumped to disk by swap or a crash dump and contains the key.", "Backups of storage are kept but the wrapped key is excluded, so they cannot be restored."],
    v: "Rotate the key, write new data, and confirm both old and new entries read correctly; examine storage to confirm the wrapped key is present and that no unwrapped copy exists on disk.",
    dep: ["root-key", "storage-interface"]
  },
  "root-key": {
    s: "The key that wraps the data encryption key, never stored whole anywhere: it is reconstructed from shares or unwrapped by an external key service at each unseal.",
    d: "At initialization the root key is generated, used to wrap the data key, then split into shares or encrypted by an external service, and the plaintext is discarded. To unseal, it must be reassembled in memory. Whoever can reconstruct it can decrypt a stolen copy of storage. It is hard because it sits at the center of every trust decision: who holds shares, where they are kept, and what happens when holders leave.",
    k: ["Root key held in shares by people vs delegated to an external key service: shares need no outside dependency; the external service allows unattended restarts and ties security to its access control.", "Never persist the root key vs cache sealed copy: never persisting is strongest; a restart always needs the unseal ceremony."],
    p: ["Shares are collected from one person's laptop for convenience, so one theft reconstructs the root key.", "The root key is exported once during setup and left in a ticket or chat message."],
    v: "Initialize a test instance, confirm no file or log holds the root key, then seal, and confirm it can be recovered only by supplying the threshold of shares or the external key service's decryption.",
    dep: ["key-shares", "auto-unseal"]
  },
  "key-shares": {
    s: "The pieces of the root key produced by a secret sharing scheme, of which any threshold number reconstruct the key and fewer reveal nothing, held by separate people.",
    d: "Initialization splits the key into n shares with threshold k using polynomial secret sharing. Each share goes to a different custodian, ideally encrypted to their personal key. Fewer than k shares carry no information. Custodians submit shares at unseal. The design splits trust among people. Practical difficulties are operational: custodians change jobs, shares get lost, and a threshold that is too high makes unsealing a crisis while one too low weakens the control.",
    k: ["A higher threshold vs a lower one: higher resists collusion and theft; lower tolerates absent custodians and speeds recovery.", "Shares encrypted to each custodian vs handed out in clear: encryption protects them in transit and storage; it needs custodian key management."],
    p: ["Enough custodians leave the company that fewer than the threshold remain and the service cannot be unsealed.", "Custodians store shares in the same password vault, which makes one compromise equal to all."],
    v: "Run an unseal drill with exactly the threshold number of custodians and confirm success; repeat with one fewer and confirm failure, and check which custodians still hold valid shares.",
    dep: ["root-key"]
  },
  "unseal-process": {
    s: "The procedure that takes a sealed node holding only ciphertext to a serving node, by supplying key shares or invoking an external key service until the root key is reconstructed.",
    d: "A sealed node accepts unseal requests, accumulates shares in memory until the threshold, reconstructs the root key, unwraps the data key and starts serving. Standbys must also be unsealed. After restart or crash, every node repeats this. The difficulty is that it is a manual, availability-critical step; at scale a cluster-wide restart means many nodes to unseal and a window of total unavailability.",
    k: ["Manual unseal with shares vs automatic: manual keeps the secret out of any machine's control; every restart or failover node needs a person.", "Unseal each node separately vs distribute the key: separate unsealing limits exposure; it multiplies operational work and recovery time."],
    p: ["An unattended node restart after a power event leaves the node sealed and out of rotation until someone notices.", "Partial share submissions from an abandoned attempt linger and confuse the next operator."],
    v: "Restart a node, confirm its status reports sealed and refuses reads, submit shares until the threshold, and confirm status becomes unsealed and a read request succeeds.",
    dep: ["key-shares", "root-key", "data-encryption-key", "auto-unseal"]
  },
  "auto-unseal": {
    s: "Delegating protection of the root key to an external key service or hardware module, so nodes unseal themselves at start by asking it to decrypt the stored key.",
    d: "At initialization the root key is encrypted by the external service and stored. At startup the node authenticates to that service using its platform identity and asks it to decrypt, then proceeds without human input. Recovery keys, separate from the root key, remain for administrative approval. Restarts are fast and automatic. The cost is a hard dependency and a changed trust boundary: whoever controls the external key can unseal.",
    k: ["Auto-unseal vs shares held by people: nodes restart unattended; the external service becomes the root of trust and a point of failure.", "Cloud key service vs hardware module: the cloud service is simple to run; a local module gives physical control and needs operations and redundancy."],
    p: ["The external key is scheduled for deletion or its access removed and the whole cluster cannot restart.", "The node identity that calls the key service is also granted to unrelated workloads, which can then decrypt the stored root key."],
    v: "Restart a node and confirm it unseals without input; then, in a test environment, revoke its access to the external key and confirm it stays sealed with a clear error in logs.",
    dep: ["root-key", "platform-attestation", "recovery-keys"]
  },
  "seal-wrapping": {
    s: "An extra layer that encrypts especially sensitive stored values, such as keys and critical configuration, directly with the external key or hardware module in addition to the barrier.",
    d: "Selected entries are wrapped by the external seal before the barrier encrypts them. Even a party who obtained the unsealed data key still cannot read them without the external module. It is used where compliance requires a hardware-protected key for particular data. Costs are performance and dependency: reading a wrapped value needs a call to the external module, so it applies to a few entries, not bulk secrets.",
    k: ["Wrap selected entries vs all data: selective wrapping keeps the module off the hot path; unwrapped data depends only on the barrier.", "A hardware module vs software seal for wrapping: hardware gives non-exportable keys and compliance evidence; it adds cost, latency and a specialized dependency."],
    p: ["The module is unreachable and reads of wrapped entries fail while everything else works, confusing diagnosis.", "Operators assume all data is hardware protected, but only the designated entries are."],
    v: "Identify a wrapped entry, confirm that reading it triggers a call to the external module in the module's own logs, and that disabling module access makes that entry unreadable while others remain readable.",
    dep: ["auto-unseal", "barrier-encryption"]
  },
  "barrier-rekey": {
    s: "Replacing the root key or the data key and re-wrapping accordingly, as a controlled operation requiring the threshold of key holders, to change who can unseal or to retire key material.",
    d: "A rekey generates a new root key, re-wraps the data key and produces new shares, requiring the existing threshold to authorize it. A barrier rotation introduces a new data key term for new writes. Rekey changes custodians without touching bulk data. It is hard because a failure mid-operation can leave old and new shares in confusion, and because old shares remain valid against any backup that holds the old wrapped key.",
    k: ["Rekey roots only vs also re-encrypt data: rekeying roots is quick and changes custodians; re-encrypting data is the only way to retire a leaked data key.", "Require the threshold to rekey vs allow a single administrator: threshold approval prevents unilateral change; it makes custodian turnover an event needing coordination."],
    p: ["Backups taken before a rekey still unseal with the old shares, so a departed custodian retains access to them.", "The new shares are distributed but nobody tests an unseal with them before the old ones are destroyed."],
    v: "Rekey a test cluster, distribute new shares, seal and unseal using only the new shares, and confirm that old shares are rejected.",
    dep: ["root-key", "key-shares", "data-encryption-key"]
  },
});
