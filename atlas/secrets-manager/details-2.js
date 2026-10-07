// Details for the secrets manager plate, part 2: dynamic secrets, cryptographic services, authentication.
ATLAS.details("secrets-manager", {
  "lease-manager": {
    s: "The component that gives every dynamic secret and token a lifetime, records it, and revokes the secret in the target system when the lifetime ends or an operator asks.",
    d: "When an engine issues a credential it registers a lease with an identifier, a time to live, the issuing path and the data needed to undo the grant. A timer wheel or sorted index expires leases, calling the engine to revoke each. Leases persist in storage so they survive restarts and failover. It is hard at scale: millions of leases mean expiry storms, and a revocation that fails against an unreachable target must be retried without being forgotten.",
    k: ["Persist every lease vs keep leases in memory: persistence survives restarts and enables revocation; it adds write load and storage per issued credential.", "Expire eagerly vs lazily: eager revocation limits exposure; a slow target then builds a backlog of failed revocations."],
    p: ["A lease backlog after an outage floods the target database with drop-user commands when service resumes.", "A lease record is lost or corrupted, leaving a live credential in the target that nothing will ever revoke."],
    v: "Issue a credential with a one minute lease, then confirm the account exists in the target, and after one minute confirm it is gone and the lease record has been deleted from storage.",
    dep: ["storage-interface", "token-store", "barrier-encryption"]
  },
  "lease-renewal": {
    s: "Extending a lease before it expires within a hard ceiling, so long-running processes keep working without receiving a credential that lives forever.",
    d: "A client asks to renew a lease, optionally with a requested increment. The engine may refuse, grant less, or extend, but never beyond the maximum TTL set at issue time; after that the client must obtain a new credential. This pattern bounds the lifetime of any leaked value while avoiding churn for stable processes. The hard part is client behavior: renewing too late, handling refusal, and swapping connections to a new credential without dropping requests.",
    k: ["Short TTL with renewal vs long TTL: short limits exposure after a leak; it makes the service a runtime dependency of every renewal.", "Hard maximum TTL vs unlimited renewal: a ceiling forces periodic re-authentication and re-issue; applications must handle credential changes during operation."],
    p: ["An application renews until the maximum, then keeps using the dead credential because it never requested a replacement.", "Renewal requests from thousands of clients cluster at the same instant after a restart."],
    v: "Renew a lease repeatedly and confirm each extension is granted until the maximum TTL, then confirm the next renewal is refused and the credential stops working in the target on schedule.",
    dep: ["lease-manager"]
  },
  "prefix-revocation": {
    s: "Revoking every lease and token under a path prefix in one operation, used to cut off an entire application, role or compromised engine at once.",
    d: "Leases are indexed by the path that issued them, so a prefix lookup finds all of them. The server revokes each, calls the engine to remove the credential in the target and invalidates tokens whose identity derives from the same source. Revoking a token revokes its children too, forming a tree of authority. It is hard at scale because the operation touches many entries and targets, and partial failure must be reported and retried rather than assumed complete.",
    k: ["Revocation by prefix vs per lease: prefix is the only response that works in an incident; its blast radius can take down healthy consumers.", "Cascade to child tokens vs leave them: cascading removes the whole derived tree; it also kills legitimate jobs started by a parent that was merely rotated."],
    p: ["An operator revokes a broad prefix during an incident and an unrelated production workload loses its credentials.", "Revocation reports success while some targets were unreachable, leaving live credentials behind."],
    v: "Issue several credentials under one role, revoke the role prefix, then log in to the target with each credential and confirm every one is rejected, and that the failure count is reported as zero.",
    dep: ["lease-manager", "token-store"]
  },
  "database-credentials": {
    s: "An engine that creates a unique database account with defined privileges for each requester, with a lease, and drops the account when the lease ends.",
    d: "An administrator configures a connection with a privileged account and a role holding creation and revocation statements as templates. On request the engine generates a username and password, runs the creation template and returns them with a lease. Revocation runs the drop statements. The trouble is in the target: accounts own objects, held connections survive a drop, and the privileged connection credential is itself a long-lived secret that needs rotation.",
    k: ["A unique account per request vs a shared rotated account: unique accounts give attribution and independent revocation; they multiply accounts and connection setup cost.", "Role statements written by administrators vs fixed templates: flexibility fits any schema; badly written statements grant too much or fail to drop."],
    p: ["Dropping a user fails because it owns objects, so the account silently stays alive past its lease.", "Applications pool connections and keep using a credential that was revoked, failing only on reconnect."],
    v: "Request credentials, connect and run a query, wait for lease expiry and confirm the account is absent from the target's user list and that the existing connection is terminated or rejected.",
    dep: ["lease-manager", "root-credential-rotation", "plugin-runtime"]
  },
  "cloud-credentials": {
    s: "An engine that exchanges the service's own permissions for temporary access keys or tokens in a cloud provider, scoped to a role and expiring on its own.",
    d: "Given a role definition, the engine calls the provider's token or identity API to create short-lived credentials, or creates a temporary user and policy attachment. It returns the keys with a lease. Providers also expire tokens themselves, so the lease mostly mirrors it. The challenge is that the root permission the engine holds is extremely powerful, provider rate limits apply to issuance, and propagation delays mean a fresh credential may not work for seconds.",
    k: ["Provider-issued temporary tokens vs generated long-lived users: tokens expire by themselves and cannot outlive the provider's limit; users can be revoked immediately but leave cleanup work.", "One engine root credential vs per-role roots: one is simple; per-role limits damage if the root leaks and multiplies what must be rotated."],
    p: ["Provider-side consistency delays make newly issued credentials fail for several seconds, so applications fail on first use.", "The root credential has broad rights and is never rotated, making the engine the best target in the cloud account."],
    v: "Request credentials for a role, call the provider as that role and confirm only the intended actions succeed, then confirm the token stops working at expiry without any action from the service.",
    dep: ["lease-manager", "root-credential-rotation", "plugin-runtime"]
  },
  "ssh-signing": {
    s: "An engine that signs short-lived host or user SSH certificates, so servers trust a certificate authority key rather than a list of individual public keys.",
    d: "A user submits a public key and receives a certificate valid for minutes to hours, restricted to named principals, commands and source addresses. Servers are configured once to trust the signing key. Access then expires without anyone editing authorized key files. The hard parts are distributing and rotating the trusted signing key to every server, and the fact that an already issued certificate cannot be revoked before expiry without a revocation list on each host.",
    k: ["Signed short-lived certificates vs authorized key lists: certificates remove per-host key management and expire automatically; every host must trust the signing key.", "Very short validity vs hours: minutes make revocation nearly unnecessary; users and automation must request a certificate for every session."],
    p: ["The signing key is rotated but some hosts still trust only the old key and lock out everyone.", "A broad principal list lets a certificate for one user log in as an administrator account."],
    v: "Obtain a certificate, log in to a configured host and confirm success, wait past the validity period and confirm the same key is rejected, and check the audit log lists the principal and expiry.",
    dep: ["lease-manager", "policy-evaluation", "named-key-versions"]
  },
  "certificate-issuance": {
    s: "An engine that acts as an internal certificate authority, issuing short-lived certificates for services under configured roles, with revocation lists and tidy-up of expired records.",
    d: "A role restricts the names, key types and lifetimes allowed. A requester supplies a signing request or asks for a generated key, and receives a certificate chained to an intermediate held by the engine. The root usually stays offline. Revocation is by list or by short lifetimes. It is hard because issuance volume stores records, because chains must be distributed to relying parties, and because certificate lifecycle is its own large discipline.",
    k: ["Many short-lived certificates vs fewer long-lived ones: short life removes revocation work; storage and issuance throughput grow with every renewal.", "Intermediate in the engine, root offline vs root in the engine: an offline root survives compromise of the service; online roots are simpler and unrecoverable if leaked."],
    p: ["Role patterns are too permissive and a service obtains a certificate for another team's hostname.", "Issued certificates are stored forever, slowing the service and bloating storage."],
    v: "Request a certificate for an allowed name and verify it chains to the intermediate and presents correct lifetime, then request a disallowed name and confirm refusal with an audit entry.",
    dep: ["named-key-versions", "lease-manager", "policy-evaluation", "storage-interface"]
  },
  "transit-encrypt": {
    s: "An API that encrypts and decrypts data submitted by applications using a named key that never leaves the service, returning only ciphertext and keeping no copy of the data.",
    d: "The application sends plaintext and a key name; the service encrypts it with the current key version and returns ciphertext prefixed with the version. Decryption reverses it. The service stores keys, not data, so the application owns where ciphertext is kept. Latency and throughput become design limits: every operation is a network call, so large payloads are better encrypted by a data key generated and wrapped by this API.",
    k: ["Send data to the service vs fetch a key and encrypt locally: sending keeps keys inside the boundary; each call adds latency and makes the service a runtime dependency.", "Authenticated encryption with context vs plain encryption: binding ciphertext to context prevents moving it between records; callers must supply the same context to decrypt."],
    p: ["Applications send large blobs and the service becomes a throughput bottleneck.", "The key is deleted or disabled by mistake and all ciphertext becomes unreadable with no recovery."],
    v: "Encrypt a value, store the ciphertext, rotate the key, and confirm the old ciphertext still decrypts, then deny decrypt rights to the caller and confirm the request is refused.",
    dep: ["named-key-versions", "barrier-encryption", "policy-evaluation"]
  },
  "transit-sign": {
    s: "An API that signs and verifies digests or messages with keys held inside the service, so signing authority can be controlled and audited without distributing private keys.",
    d: "A client submits data or a hash and a key name, and receives a signature with the key version. Verification checks a signature against the key. Supported algorithms vary by key type. Keys can be marked as non-exportable. Hard parts include choosing hash and padding consistently with verifiers elsewhere, and ensuring the service is not used as an oracle for signing arbitrary attacker-chosen content.",
    k: ["Signing inside the service vs a local library: central keys give audit and revocation; every signature is a network round trip and an availability dependency.", "Pre-hashed input vs raw message: hashing locally reduces transferred data; the service cannot see what is really being signed."],
    p: ["Any caller allowed to sign can sign anything, so a stolen token yields valid signatures for forged artifacts.", "Verifiers hard-code the old public key and reject signatures after a rotation."],
    v: "Sign a message, verify it with the exported public key outside the service, then alter one byte and confirm verification fails, and confirm the private key cannot be exported.",
    dep: ["named-key-versions", "policy-evaluation"]
  },
  "data-key-generation": {
    s: "Returning a fresh data encryption key in two forms, plaintext for immediate use and wrapped by a named key, so large data is encrypted locally while key custody stays central.",
    d: "The service generates random bytes, encrypts them under the named key and returns both. The application encrypts its data with the plaintext, discards it, and stores the wrapped form beside the ciphertext. To read the data later it asks the service to unwrap. This is envelope encryption. The hard parts are the application handling plaintext keys safely in memory, and the number of unwrap calls when each record has its own key.",
    k: ["A data key per object vs per batch: per object limits exposure and allows fine-grained deletion; it multiplies unwrap calls and stored wrapped keys.", "Plaintext key returned vs wrapped only: returning plaintext enables local encryption; the plaintext exists in application memory, logs or dumps."],
    p: ["The plaintext key is logged or written to swap before being discarded.", "Wrapped keys are stored without the key version and context, and rotation or tenant checks become impossible to verify."],
    v: "Request a data key, encrypt a file locally, discard the plaintext, then unwrap the stored copy and confirm the file decrypts, and confirm the audit log shows one generate and one unwrap.",
    dep: ["named-key-versions", "transit-encrypt"]
  },
  "named-key-versions": {
    s: "A key object with a name, a type, a policy and numbered versions, where new data uses the latest version and older ciphertext remains readable by the version that made it.",
    d: "Each named key holds versions generated or imported with a minimum decryption version and a latest encryption version. Rotation adds a version; old ones can be retired or archived. Settings control whether the key can be exported, deleted or used for each operation. The difficulty is lifecycle: deleting a key destroys the data it protects, and old versions must stay long enough for all ciphertext to be re-encrypted.",
    k: ["Rotate and keep old versions vs re-encrypt everything: keeping is cheap and online; old key compromise still exposes old data until it is rewritten.", "Deletion protection vs flexibility: forbidding deletion prevents catastrophic loss; keys for retired systems then linger."],
    p: ["Raising the minimum decryption version before data is re-encrypted makes it permanently unreadable.", "Import of a key from outside leaves a copy elsewhere that is never rotated."],
    v: "Rotate a key, encrypt new data, confirm ciphertext carries the new version, rewrap old ciphertext to the latest version without exposing plaintext, then retire the old version and confirm decrypt fails for it.",
    dep: ["barrier-encryption", "storage-interface"]
  },
  "tokenization": {
    s: "Replacing a sensitive value, such as a card or national number, with a format-preserving surrogate that can be reversed only by an authorized call to the service.",
    d: "The engine applies format-preserving encryption or keeps a mapping, so the surrogate has the same shape as the original and flows through systems that validate format. Masking returns partial values to callers without full rights. Only the service and its policies can detokenize. It is hard because format-preserving schemes have small input spaces and need strong tweaks, and stored mappings become a high-value database in their own right.",
    k: ["Format-preserving encryption vs a stored mapping: no table to protect or sync; short inputs weaken security. Mappings allow random tokens at the cost of a lookup store.", "Deterministic tokens vs random: deterministic enables joins and deduplication; it also reveals equal values and allows guessing."],
    p: ["Deterministic tokens of low-entropy values such as short numbers are reversed by trying every candidate.", "Detokenize permission is granted to a whole analytics team, so tokenization offers no real protection."],
    v: "Tokenize a sample value and confirm the result passes the downstream format check, then confirm a caller without detokenize rights cannot recover it and that each detokenize call appears in the audit log.",
    dep: ["named-key-versions", "policy-evaluation"]
  },
  "auth-method-framework": {
    s: "The mechanism that lets many login methods plug in at mounted paths, each verifying a caller's proof of identity and returning the policies and token properties to grant.",
    d: "Each method is enabled at a path and configured with the trust data it needs, such as a signing key set, a directory address or a platform's identity service. A login request goes to the method, which returns an identity alias, policies and a lifetime. The core then creates a token. Several methods can coexist. The hard part is mapping external identities to internal policies safely, since that mapping is where over-broad trust enters.",
    k: ["Many pluggable methods vs a single login standard: pluggability fits every platform; each method has its own trust configuration to get right and keep current.", "Policies attached to roles vs attached to identities: roles keep policy near the use case; identities allow per-person control but multiply objects."],
    p: ["A role bound only to an issuer, with no audience or subject conditions, lets any workload from that issuer log in.", "Old methods are left enabled after migration and remain a quiet way in."],
    v: "Log in through each enabled method with a valid and an invalid proof, and confirm only the valid one yields a token whose policies match the role and whose alias appears in the audit log.",
    dep: ["token-store", "identity-entities", "policy-language"]
  },
  "token-store": {
    s: "The registry of every issued token with its policies, lifetime, parent, usage count and accessor, which the server consults on each request to decide who is calling.",
    d: "A token is a random value; the store keeps a hashed form with its metadata. Each request looks up the token, checks expiry and use limits, and loads its policies. Tokens form a tree: revoking a parent revokes children. An accessor lets operators manage a token without knowing its value. It is hard because every request hits it: performance, replication of tokens across clusters and cleanup of expired entries all constrain design.",
    k: ["Stored tokens vs self-contained signed tokens: stored tokens can be revoked instantly; signed tokens need no lookup and cannot be recalled before expiry.", "Hash the token at rest vs store plaintext: hashing means a storage leak yields no usable tokens; operators cannot show a lost token."],
    p: ["Tokens created with no expiry accumulate and one leaked token has permanent access.", "A root-level token is shared among automation and never rotated."],
    v: "Create a token, use it, look it up by accessor, revoke by accessor and confirm the next request fails, and confirm no plaintext token value appears in storage or audit logs.",
    dep: ["barrier-encryption", "storage-interface", "read-cache"]
  },
  "token-types": {
    s: "Two token forms: stored service tokens with full features such as renewal and children, and lightweight batch tokens that are encrypted blobs needing no storage.",
    d: "A service token writes a record on creation and supports renewal, revocation and child tokens. A batch token carries its identity and expiry inside an encrypted blob that any node can verify without looking anything up, so it adds no write load and works on standby and replica clusters. They cannot be renewed or individually revoked. The choice matters for high-volume workloads where creating millions of stored tokens would overwhelm storage.",
    k: ["Batch tokens vs service tokens: batch scales and works anywhere with no storage writes; they lack renewal, revocation by accessor and child tokens.", "Short fixed lifetime batch tokens vs renewed service tokens: re-login is simple and bounds exposure; each re-login repeats authentication cost."],
    p: ["Using service tokens for short serverless invocations floods storage and slows every other operation.", "A batch token is leaked and cannot be revoked, so it works until it expires."],
    v: "Create thousands of each type and compare storage growth and request latency; confirm a batch token works on a replica cluster while a service token does not unless replicated.",
    dep: ["token-store", "barrier-encryption"]
  },
  "platform-attestation": {
    s: "Logging in with a signed identity document that the hosting platform gives to a workload, so the workload proves what it is without carrying any stored credential.",
    d: "The platform issues a signed document or token describing the instance, account or service account. The workload sends it to the login endpoint. The method verifies the signature against the platform's published keys, optionally calls the platform to confirm the instance is live, and maps its attributes to a role. This solves secret zero for workloads on that platform. The weakness is binding: the role must name enough attributes that only the intended workload matches.",
    k: ["Platform identity vs a pre-shared secret: no secret to distribute or leak; trust in the platform and in the attribute mapping becomes the whole security.", "Verify the document offline vs call the platform: offline is fast and works during platform outages; live checks catch terminated instances at the cost of a dependency."],
    p: ["Any process on the host can fetch the identity document, so a compromised container steals the host's identity.", "Roles bind to an account but not an instance or service account, so every workload in that account matches."],
    v: "From an approved workload, log in and obtain a token with the expected policies. From an instance in another account, repeat and confirm the login is refused and logged with the mismatched attribute.",
    dep: ["auth-method-framework", "token-store"]
  },
  "oidc-login": {
    s: "Login using signed tokens from an identity provider, either through a browser redirect for people or by presenting a JWT directly for machines and pipelines.",
    d: "For people, the method redirects to the provider, receives an authorization code and validates the returned identity token. For machines, a signed token from a pipeline or workload issuer is verified against the issuer's published keys. Claims such as subject, audience and group are matched against role bounds and mapped to policies. It is hard because validation has many easy mistakes: wrong audience, unchecked expiry, and unbounded claim mappings.",
    k: ["Delegate to the identity provider vs local accounts: single sign-on and central deprovisioning; the provider's outage or misconfiguration affects every login.", "Bound claims on every role vs issuer trust alone: bounds restrict each role to one subject; they add configuration per workload."],
    p: ["Audience is not validated, so a token issued for another application is accepted.", "Group claims map to administrative policies, and anyone who can edit a group gains administration."],
    v: "Present a valid pipeline JWT and confirm a token with the expected policies, then change the audience, subject or expiry in turn and confirm each variant is rejected with a specific logged reason.",
    dep: ["auth-method-framework", "identity-entities"]
  },
  "certificate-login": {
    s: "Authenticating a client by the X.509 certificate it presents in the TLS handshake, matched against trusted authorities and constraints on name or other fields.",
    d: "The listener requests a client certificate; the method validates its chain to a configured authority, checks validity dates and optionally revocation, and matches subject or alternative names against role constraints. A token is then issued. It suits systems that already have a certificate infrastructure, including the service's own issued certificates. It is hard because TLS termination at a load balancer hides the certificate unless it is forwarded and trusted.",
    k: ["Direct TLS to the service vs terminating at a proxy: direct preserves the certificate and its proof of possession; proxies need trusted header forwarding that attackers could forge.", "Match on exact names vs on authority alone: exact names make each role specific; authority-only trusts every certificate that authority issues."],
    p: ["A proxy passes the client certificate in a header that a direct caller can set to impersonate anyone.", "Revocation is not checked, so a stolen certificate works until it expires."],
    v: "Connect with a certificate for an allowed name and confirm login, then connect with another certificate from the same authority but a different name and confirm refusal in the audit log.",
    dep: ["auth-method-framework", "listener-tls"]
  },
  "role-secret-login": {
    s: "A machine login using two parts, a role identifier that can be baked into configuration and a secret identifier that is delivered separately and can be single-use.",
    d: "An administrator creates a role with policies and constraints. The role identifier is placed in the deployment; a trusted orchestrator fetches a secret identifier, ideally wrapped, and delivers it to the workload at start. Login needs both, optionally from an allowed network. It suits systems with no platform identity. It is hard because delivering the second part is the secret-zero problem again, moved to the orchestrator.",
    k: ["Two-part credential vs a single static token: a theft of one half is useless; delivery needs an orchestrator trusted to hold both.", "Single-use secret identifiers vs reusable: single-use limits replay; a failed start burns the identifier and needs a new one."],
    p: ["Both halves are placed in the same environment file, which restores a single static credential.", "Secret identifiers are issued with no expiry or use limit and are copied between environments."],
    v: "Deliver a wrapped single-use secret identifier, log in successfully, then replay it and confirm the second login is refused and the audit log shows the original use and the failed replay.",
    dep: ["auth-method-framework", "request-wrapping"]
  },
  "directory-login": {
    s: "Logging in with a username and password checked against an enterprise directory, then mapping the user's group memberships to policies.",
    d: "The method binds to the directory with the supplied credentials or looks up the user and verifies the password, then reads group membership and maps groups to policies. It is mainly for people and legacy tools. Hard parts are secure connections to the directory, handling nested groups and referrals, and the fact that passwords pass through the service, so it becomes a place where they could be logged.",
    k: ["Directory passwords vs identity provider login: directory is simple and available on-premises; it lacks modern phishing resistance and requires the service to see passwords.", "Group-to-policy mapping vs per-user policies: groups follow the organization's own offboarding; mapping errors grant whole groups broad access."],
    p: ["Connections to the directory are unencrypted or unverified, exposing passwords to the network.", "Departed users keep access because the token outlives the directory account's removal."],
    v: "Log in as a member of a mapped group and confirm the policies, remove the user from the group, log in again and confirm the new token no longer holds those policies.",
    dep: ["auth-method-framework", "mfa-step-up"]
  },
  "mfa-step-up": {
    s: "Requiring a second factor, such as a one-time code or push approval, before a token for sensitive paths is granted or a specific request is allowed.",
    d: "A policy marks paths as needing a second factor. On the first request the server returns a challenge; the user completes it with a registered method and the request is retried or a token is upgraded. Factors can be time-based codes or an external service. It is mostly for human administrators. The difficulty is automation: machine callers cannot respond to a challenge, so these paths must be reachable only by people.",
    k: ["Require MFA at login vs per sensitive request: login-time is simple; per-request step-up limits the damage of a stolen session token to low-risk paths.", "Built-in factors vs an external provider: built-in has fewer dependencies; external providers give richer enrollment and recovery."],
    p: ["Enrollment is self-service for the same factor, so an attacker with a token enrolls their own device.", "A pipeline account is exempted from MFA and becomes the weakest route to the same paths."],
    v: "Request a protected path with a token lacking the second factor and confirm a challenge and refusal, complete the factor and confirm access, and check both steps in the audit log.",
    dep: ["policy-evaluation", "token-store"]
  },
});
