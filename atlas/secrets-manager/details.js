// Details for the secrets manager plate, part 1: client interfaces, delivery, static secrets.
ATLAS.details("secrets-manager", {
  "http-api": {
    s: "The single request-and-response interface over HTTP and TLS through which every client, tool and console performs every operation, with the path naming the engine and the verb naming the action.",
    d: "Each request carries a token in a header, a path such as a mount plus a secret name, and a JSON body. The server maps the verb to a capability, authenticates the token, checks policy and routes to the engine mounted there. Responses carry data, a lease identifier and warnings. Because everything including administration goes through this one surface, there is no side door, but the API also becomes the compatibility contract that every client library and automation script depends on.",
    k: ["One uniform path-and-verb API vs per-engine endpoints: policy and audit work identically everywhere; engine authors must fit their features into read, write, list and delete.", "Token in a header vs credentials in each request: tokens limit exposure of long-lived credentials; clients must manage token lifetime and renewal."],
    p: ["Secrets placed in URL query strings end up in proxy and load balancer logs, outside the audit trail.", "Idempotency is unclear on retries: a repeated write to a dynamic engine can mint a second credential."],
    v: "Issue a read with curl using a valid token and confirm the JSON body, then repeat with a token whose policy lacks read and confirm a 403 and an audit entry for each call.",
    dep: ["listener-tls", "request-router", "token-store"]
  },
  "cli-client": {
    s: "A command-line program that wraps the HTTP API for operators and scripts, handling address, token lookup, output formatting and the most common multi-step workflows.",
    d: "The client reads its address and token from environment variables or a token helper, sends the same API calls any program could, and formats results as tables or JSON. Convenience commands combine several calls, such as initializing a cluster, unsealing with shares, or logging in through a method and storing the token. It is hard because it is trusted with powerful tokens on shared workstations, so storage of the token and handling of shell history matter.",
    k: ["Cached token file vs prompt on every command: a file is convenient and survives sessions; it persists a bearer credential on disk until it expires or is deleted.", "Thin wrapper vs rich workflows: a thin client stays in sync with the API; workflows save time but can hide what calls are being made."],
    p: ["Secrets typed as command arguments land in shell history and process listings visible to other users.", "An old client against a new server silently ignores fields it does not know."],
    v: "Write a secret using a value read from standard input, then check shell history and the process list to confirm the value never appears, and read it back to confirm it is stored.",
    dep: ["http-api"]
  },
  "client-libraries": {
    s: "Language-specific packages that wrap the API with typed calls, automatic login, lease renewal and retries so application authors do not reimplement the protocol.",
    d: "A library performs the login for the configured method, holds the token, renews it before it expires, retries on transient errors and standby redirects, and exposes calls for each engine. Better ones also track leases so a dynamic credential is renewed or replaced before it dies. The difficulty is the long tail: certificate trust, proxies, token expiry in the middle of a request, and keeping dozens of language bindings consistent with the server.",
    k: ["Library-managed renewal vs application-managed: libraries remove a common outage cause; they hide failure and can keep using a revoked credential until the next call.", "Official bindings for few languages vs community bindings for many: official ones track the API closely; the rest lag and diverge in error handling."],
    p: ["A renewal thread that dies silently leaves the process running with an expired token until requests start failing.", "Retries without backoff turn a short outage into a request storm against the recovering cluster."],
    v: "Run an application with a short token lifetime for an hour and confirm from the audit log that renewals occurred on schedule and no request failed for authentication reasons.",
    dep: ["http-api", "token-store", "lease-renewal"]
  },
  "request-wrapping": {
    s: "A way to return a response not directly but as a single-use token that can be unwrapped once by the intended recipient, so a secret is never exposed to the intermediary that carried it.",
    d: "The server stores the real response in a private area keyed by a short-lived wrapping token and returns only that token. The recipient presents it to an unwrap call, which returns the content and invalidates the token. If it was already used, the recipient knows it was intercepted. This solves the introduction problem for distributing a first credential, and is hard because the wrapping token itself must still travel safely and expire quickly.",
    k: ["Single-use wrapped delivery vs sending the secret directly: interception becomes detectable and the carrier never sees content; the unwrap step adds a failure point and a timing window.", "Short wrapping TTL vs long: a short window limits exposure; slow delivery pipelines then expire tokens before use."],
    p: ["A CI system logs the wrapping token, and anyone with log access unwraps it before the real recipient does.", "Nobody checks unwrap failure, so an already-used token is retried as an ordinary error rather than treated as a security event."],
    v: "Wrap a secret, unwrap it once and confirm the content, then unwrap again and confirm it fails and the audit log shows both attempts with the second flagged as an invalid token.",
    dep: ["token-store", "kv-store"]
  },
  "admin-console": {
    s: "A browser interface for browsing mounts, editing policies, inspecting leases and performing guided operations, built on the same API and subject to the same policies as any other client.",
    d: "The console is a client of the HTTP API served by the node itself or a separate front end. It logs in through the configured methods, then lists mounts, secrets, auth methods and policies the token can see. It exists mostly for discovery and occasional administration. Its risk is that a browser holds a token and renders secret values, so session handling, content security headers and clipboard behavior need care.",
    k: ["Built-in console vs separate management plane: built-in is easy to deploy and cannot bypass policy; it expands the attack surface of the secret-serving process.", "Display secrets by default vs click to reveal: reveal-on-demand limits shoulder-surfing; routine work gets slower."],
    p: ["Secret values remain in browser memory or history after the tab is left open on a shared machine.", "The console shows only what the token may list, which hides objects from administrators and leads to wrong conclusions about what exists."],
    v: "Log in with a limited policy and confirm only permitted mounts appear. Reveal a secret, then check that the audit log shows the read under the user identity, not a service identity.",
    dep: ["http-api", "oidc-login"]
  },
  "local-agent": {
    s: "A process beside each workload that performs login, keeps the token alive, fetches secrets and renders them to files or a local listener, so the application needs no knowledge of the service.",
    d: "The agent authenticates using the platform identity, caches the resulting token, renews it and re-authenticates when needed. It reads configured secret paths, writes results through templates and signals the application when content changes. It can also expose a local proxy that adds the token to requests. Hard parts: the agent is now a critical dependency per host, and its own startup order, restart and sink file permissions are where secrets leak.",
    k: ["Sidecar agent vs library in the application: sidecar works for any program and centralizes renewal; it consumes resources on every host and adds a process to supervise.", "Local caching vs always going to the server: caching survives short outages and reduces load; it keeps serving a secret after revocation until the cache expires."],
    p: ["Rendered files are left world-readable or on persistent disk, so a secret outlives the pod or host.", "Agent and application start out of order and the application reads an empty or stale file."],
    v: "Stop the secret service for a minute and confirm the application still works from the agent cache. Then revoke the token, restart the agent and confirm it re-authenticates and the audit log shows a fresh login.",
    dep: ["auth-method-framework", "template-rendering", "client-caching", "platform-attestation"]
  },
  "template-rendering": {
    s: "A templating step that fetches several secrets and writes them as a configuration file in the application's own format, re-rendering when values or leases change.",
    d: "A template names secret paths and fields and is evaluated with the fetched data to produce a file, such as a connection string or a certificate bundle. The renderer watches lease times and rewrites the file before expiry, then runs a command or sends a signal so the application reloads. The hard part is atomicity and ordering: partial writes, multiple files that must change together, and applications that cannot reload and need a restart.",
    k: ["Render to files vs to environment: files can change while running and have permissions; they exist on a file system the process might share.", "Re-render on lease expiry vs on change: lease-driven keeps dynamic credentials fresh; it re-renders needlessly for static secrets."],
    p: ["A non-atomic write lets the application read a half-written file and fail to parse it.", "A template error after a rotation leaves the old secret in place and nobody notices until it expires."],
    v: "Rotate a secret and confirm the rendered file changes within the expected interval, the application reload command ran once, and the file was replaced atomically with permissions unchanged.",
    dep: ["local-agent", "kv-store", "lease-manager"]
  },
  "secret-volume": {
    s: "A memory-backed volume mounted into a workload that is populated by the platform with secrets for that workload only and discarded when the workload ends.",
    d: "A driver on the host authenticates on behalf of the workload using its platform identity, fetches the listed secrets and presents them as files on a temporary in-memory file system. When the workload is deleted the volume vanishes with it. This keeps secrets out of images, manifests and an orchestrator's cluster store. It is hard because the driver must prove which workload is asking, and mounting runs before the workload starts, so failures block startup.",
    k: ["Mounted volumes vs secrets stored in the orchestrator: volumes keep secret material out of the cluster store; they add a node-level component with privileged access.", "Fail the mount when the secret is unavailable vs start without it: failing is safe and visible; it turns a secret outage into an application outage."],
    p: ["The driver caches fetched values on the node disk, defeating the point of an in-memory volume.", "Any workload that can mount the volume type with a different path request reads another workload's secrets."],
    v: "Start a workload, read the mounted file, delete the workload and confirm the file is gone and no copy exists on the node disk. Check the audit log for a fetch under the workload's identity.",
    dep: ["platform-attestation", "http-api"]
  },
  "env-injection": {
    s: "Placing secret values into a process's environment at launch, the most portable delivery method and the one most easily exposed through process inspection and child processes.",
    d: "A wrapper command or launcher fetches secrets, sets them as environment variables, and executes the real program, which then reads them like any other configuration. It needs no changes to the application, which is why it is common for legacy software. The cost is exposure: variables are inherited by every child process, appear in crash dumps and debug endpoints, and cannot be changed without restarting.",
    k: ["Environment variables vs files: variables are universally supported; they leak through children, dumps and diagnostics, and cannot rotate live.", "Wrapper at launch vs platform feature: wrapper works anywhere; the launcher must itself authenticate, bringing the bootstrap problem back."],
    p: ["A diagnostics page or crash reporter prints the whole environment, writing every secret to logs or a ticket.", "Secrets rotate but the process keeps the old value until restarted, so rotation causes delayed failures."],
    v: "Launch the program, then dump its environment through the debug or process interface and confirm only intended names exist, and that a child process spawned for a helper does not inherit them.",
    dep: ["http-api", "kv-store"]
  },
  "external-secret-sync": {
    s: "A controller that copies selected secrets into the native secret stores of other platforms so software that can only read those stores keeps working.",
    d: "A reconciler periodically reads source secrets and writes them into a target system such as an orchestrator's secret objects or a cloud provider's store, and removes them when the source is deleted. It exists because not every consumer can integrate directly. The tradeoff is that the secret now exists in a second place with different encryption, access control and audit, so the central system's guarantees stop at the sync boundary.",
    k: ["Sync to target stores vs workloads pulling directly: sync supports existing tooling; it duplicates the secret and its exposure.", "Poll vs event-driven updates: polling is simple; propagation delay after rotation must be shorter than the old value's remaining lifetime."],
    p: ["Deleting the source leaves the copy in the target, so a revoked secret keeps working there.", "The sync identity has read access to far more paths than any single consumer needs."],
    v: "Update a source secret and measure time until the target copy changes, then delete the source and confirm the target copy is removed and the sync identity's reads appear in the audit log.",
    dep: ["kv-store", "token-store", "policy-evaluation"]
  },
  "client-caching": {
    s: "Holding fetched tokens and secret values in client memory for a bounded time so that load on the service stays low and short outages do not stop applications.",
    d: "Clients and agents keep responses keyed by path and token, and respect lease durations and a configured maximum age. Caches can be persistent across restarts when stored encrypted. Dynamic secrets are cached with their leases and revoked when the cache entry is evicted. It is hard because every cache is a second place where a revoked or rotated secret is still valid, so its lifetime has to be chosen against how fast revocation must take effect.",
    k: ["Longer cache lifetime vs shorter: long survives outages and cuts load; revocation and rotation take longer to reach every client.", "Persistent encrypted cache vs memory only: persistence speeds restarts; its encryption key then needs its own protection."],
    p: ["A cache keyed only by path serves one tenant's secret to another when tokens differ.", "After an incident, operators revoke a secret but caches keep honoring it for the full lifetime, unnoticed."],
    v: "Take the service down and confirm reads succeed from cache until the lifetime ends, then fail. Rotate a secret and measure how long until every client returns the new value.",
    dep: ["http-api", "lease-manager"]
  },
  "kv-store": {
    s: "A general-purpose engine that stores arbitrary key-value data under a path, encrypted at rest, for secrets that a human or system supplies and an application later reads.",
    d: "Writes pass authentication, policy and the barrier, then the engine serializes the data and hands it to storage. Reads return the latest version. The engine does not interpret values, so it holds API keys, passwords, certificates and small files alike. It is simple, which is why it is the first engine most teams use and the one that accumulates thousands of unmanaged long-lived secrets nobody rotates.",
    k: ["Static storage vs dynamic issuance: static works for any secret including third-party keys; it shifts rotation and exposure tracking onto people.", "Many small secrets vs few large documents: small secrets give fine-grained policy and versions; large documents make one read return fields a caller does not need."],
    p: ["Values grow unbounded because there is no size limit, and large writes stall replication and snapshots.", "Teams store a secret and forget it, leaving credentials with no owner or rotation date."],
    v: "Write a secret, read it back, then take a storage snapshot and search it for the plaintext value to confirm it appears nowhere unencrypted.",
    dep: ["barrier-encryption", "storage-interface", "policy-evaluation", "secret-versioning"]
  },
  "secret-versioning": {
    s: "Keeping previous values of each secret under numbered versions so a bad write can be rolled back and so readers can pin to a known value during a rotation.",
    d: "Each write creates a new version with a timestamp and writer identity; reads default to the latest and can request an earlier one. A configured limit prunes the oldest versions. Versions allow a two-step rotation where consumers move to the new value gradually. The hard parts are cost, since every version is stored and replicated, and the fact that old versions are old secrets, still valid in the target system unless explicitly revoked there.",
    k: ["Keep many versions vs few: many give rollback and audit history; each is a retained credential that must be protected and eventually destroyed.", "Latest by default vs explicit version: defaults make clients simple; a pinned reader stays on an old value after rotation unless something moves it."],
    p: ["A leaked password is changed in the store but the previous version stays readable by anyone with access to history.", "Pruning removes the version a slow consumer still uses, causing an outage."],
    v: "Write three values, read version 1 and confirm it returns the first, then lower the retention limit and confirm the oldest version is removed from storage and from backups after the next cycle.",
    dep: ["kv-store", "storage-encoding"]
  },
  "soft-delete": {
    s: "Marking a secret version as deleted without destroying it, so accidental removals can be undone, with a separate permanent destroy operation for when data must really go.",
    d: "A delete sets a flag and a time on a version; reads then fail but the ciphertext remains. An undelete clears the flag. A destroy removes the stored bytes. These are separate capabilities in policy, so a user may delete but not destroy. The difficulty is that removal for compliance or after a leak requires destroy, and replicated and backed-up copies mean destroy is only eventually complete.",
    k: ["Soft delete as the default vs immediate destroy: soft delete forgives mistakes; data persists longer than people expect when they ask for removal.", "Separate destroy capability vs one delete right: separation prevents accidents and sabotage; it complicates least-privilege design for owners."],
    p: ["Someone deletes a secret believing it is gone, and a later audit finds it fully recoverable.", "Destroy runs on the primary but a replica and an old snapshot still contain the value."],
    v: "Delete a version, confirm reads fail and undelete restores it, then destroy it and confirm a restore from a fresh snapshot of storage no longer contains the value.",
    dep: ["secret-versioning", "capabilities"]
  },
  "secret-metadata": {
    s: "Non-secret information stored beside each secret, such as owner, purpose, contact and custom labels, that lets people find, review and rotate it responsibly.",
    d: "Metadata is stored with the secret path but readable under separate permissions from the value, so a catalog or scanner can list what exists and who owns it without seeing contents. Common fields are owner, expiry date, system of record and rotation interval. The difficulty is keeping it honest: it is free text edited by people, so without enforced fields it is empty or wrong, and the discovery value disappears.",
    k: ["Required fields enforced by the engine vs convention: enforcement keeps the catalog useful; it makes automated writes fail when a field is missing.", "Metadata readable by auditors without value access: oversight without exposure; it needs a policy structure that distinguishes the two."],
    p: ["Owner fields name people who left, so alerts about expiring secrets go nowhere.", "Metadata itself contains sensitive hints such as a system hostname or account name."],
    v: "As an auditor policy with metadata-only access, list all secrets with their owners and confirm values are denied, and that every secret older than the review interval has a named, active owner.",
    dep: ["kv-store", "capabilities"]
  },
  "check-and-set": {
    s: "A conditional write that succeeds only if the secret is still at the version the writer last read, preventing two writers from silently overwriting each other.",
    d: "The write request includes the expected current version. The engine compares it to the stored version while holding the write lock for that path and rejects the write if they differ. The client re-reads, merges and retries. This turns last-writer-wins into optimistic concurrency. It is hard to apply consistently: tools that write without the flag bypass the protection, and in replicated clusters the version seen must come from the node that applies writes.",
    k: ["Required check-and-set vs optional: required prevents lost updates; every simple script must read before it writes.", "Per-secret versions vs per-field merging: whole-secret versions are simple; two people editing different fields still conflict."],
    p: ["A pipeline overwrites a manually updated secret because it never reads the version first.", "Reading from a lagging replica yields an old version and the write is wrongly rejected, or wrongly accepted elsewhere."],
    v: "Start two writers from the same version, let one succeed, and confirm the second receives a version-mismatch error and that the stored value contains only the first writer's change.",
    dep: ["secret-versioning", "kv-store"]
  },
  "namespaces": {
    s: "Isolated virtual instances inside one deployment, each with its own mounts, auth methods, policies and tokens, so different teams or tenants can administer themselves without seeing each other.",
    d: "A namespace prefixes every path and gives its administrators full control inside that prefix. Policies, identities, tokens and leases are scoped to the namespace, and its data is stored under its own storage prefix. Child namespaces can nest. The cost is real: they share one cluster's capacity and failure domain, and global operations like seal, replication and audit remain at the parent, so tenants are isolated logically but not physically.",
    k: ["Namespaces in one cluster vs separate clusters per tenant: namespaces cut operating cost and give central control; a noisy or compromised tenant shares fate with the rest.", "Delegated administration vs central policy: delegation scales to many teams; central security loses the ability to see uniform rules."],
    p: ["A policy written at the root accidentally grants access to every child namespace.", "One namespace creates millions of leases and slows renewal and revocation for all."],
    v: "As an administrator of namespace A, attempt to read a path and list tokens in namespace B and confirm both fail, then confirm the audit log records the attempts with namespace A's identity.",
    dep: ["mount-table", "policy-evaluation", "storage-encoding"]
  },
  "mount-paths": {
    s: "The hierarchical naming scheme in which every engine, auth method and secret lives at a path, which is also the unit that policies, quotas and audit entries refer to.",
    d: "Engines are mounted at chosen paths, and secrets are nested beneath them, so a path such as a team, application and environment forms a readable address. Policies match prefixes of these paths. The design of the hierarchy is therefore a security design: a flat or inconsistent layout makes policies either too wide or too many. Renaming is painful because policies, templates and clients embed the paths.",
    k: ["Hierarchy by team then application vs by environment first: team-first aligns ownership with policy; environment-first makes it easier to restrict production uniformly.", "Deep paths vs flat names: deep paths let a single prefix rule cover a subtree; deep trees increase listing cost and typo risk."],
    p: ["Inconsistent naming forces wildcard policies that cover other teams' secrets by accident.", "Moving a mount requires rewriting every client, and teams keep the poor layout for years."],
    v: "Pick any secret path, derive the policy path that governs it from the naming convention alone, and confirm the derived rule matches exactly that team's secrets and no other team's.",
    dep: ["mount-table", "path-matching"]
  },
});
