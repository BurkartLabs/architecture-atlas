// Details for the key management plate, part 2: authorization, tenancy, hierarchy, lifecycle.
ATLAS.details("key-management", {
  "key-policies": {
    s: "A document attached to each key that states who may use it, who may administer it and under what conditions, and which is the first thing evaluated on every request.",
    d: "The policy lists statements of principal, action, resource and condition. Most services make it the root of authority: if the key policy does not allow the caller, or delegate to identity policies, the request is denied no matter what else is configured. It is versioned, validated on write and protected against edits that would remove all administrators. Policies are evaluated on the hot path, so they are compiled and cached. The challenge is expressiveness: rules rich enough for real organizations are also rich enough to misread.",
    k: ["Key-attached policy as the root of authority vs identity-only permissions: key policies let the key owner stay in control even when the caller's account is compromised, but add a second place to look when debugging denials.", "Deny by default vs a permissive starting policy: default deny is safe, while permissive starts make adoption easy and quietly over-share."],
    p: ["A wildcard principal in a policy intended to be temporary becomes the permanent exposure.", "Policy edited in one region but not yet visible in another gives different answers to the same caller."],
    v: "Attach a policy allowing only one role to decrypt, call decrypt as that role and as another, and confirm allow and deny with the matching policy statement named in the audit entry.",
    dep: ["metadata-store","policy-conditions"]
  },
  "grants": {
    s: "Narrow, revocable permissions issued programmatically to a specific principal for specific operations on a key, usually by a service acting for a customer.",
    d: "A grant names a grantee, the allowed operations and optional constraints, and takes effect without editing the key policy. It suits automated delegation: a storage service gets a grant when a volume is created and loses it when the volume is deleted. Grants can be retired by the grantee or revoked by an admin, and expire on their own if configured. They are listed per key. The difficulty is volume and visibility: a busy key can hold millions, and each is an extra check on the hot path.",
    k: ["Grants for service delegation vs editing the key policy: grants are cheap to create and revoke at scale, but permissions spread over many objects that are hard to review.", "Time-limited grants vs open-ended: expiry caps stale access but requires renewal logic in the grantee."],
    p: ["Grants created per resource and never retired accumulate until evaluation slows.", "An engineer reviewing only the key policy believes access is narrow while grants hold wide permissions."],
    v: "Create a grant for a role limited to decrypt, confirm decrypt succeeds and encrypt is denied. Revoke it and confirm the next call is denied, with both actions in the audit log.",
    dep: ["key-policies","metadata-store"]
  },
  "identity-policy-evaluation": {
    s: "Combines the key policy, the caller's own identity permissions, grants, boundaries and conditions into one allow or deny, with explicit deny winning.",
    d: "The evaluator gathers every applicable rule: the key policy, policies attached to the principal, organization-level limits and any grants. Explicit denies override allows. Cross-account callers need allow on both the key side and the caller side. Evaluation must be fast, since it runs per request, and fully explainable, since users ask why a call was denied. It is hard because rule sources live in different systems with different update speeds, so a stale copy of one source produces wrong decisions in one direction or the other.",
    k: ["Fetching identity policies per request vs caching: fetching is current but adds a dependency and latency, while caching bounds speed and risks stale allows after revocation.", "Rich decision traces vs minimal reasons: traces ease debugging, but tell attackers exactly which control stopped them."],
    p: ["An outage of the identity system turns every decrypt into a failure, or worse, a fail-open default.", "A cached allow outlives the role removal by the whole cache lifetime."],
    v: "Remove a permission from a role and measure the time until a call is denied. Add an explicit deny and confirm it wins over an allow, with the deciding rule shown in the audit trail.",
    dep: ["key-policies","grants","policy-conditions","caller-authentication"]
  },
  "policy-conditions": {
    s: "Constraints on when a statement applies: encryption context values, calling service, network origin, time, tags, multi-factor state and the resource being protected.",
    d: "Conditions compare request attributes with values in a statement. The most useful bind a key to its purpose: allow decrypt only through a named service, only for a context pair, only from a private network, only within business hours. They are evaluated after the principal matches and before an allow takes effect. The service supplies attributes it can trust, such as the calling service name, as distinct from ones the caller states. It is hard because attributes differ in trustworthiness, and a condition on a value the caller can set offers no protection.",
    k: ["Conditions on service-asserted attributes vs caller-stated ones: service-asserted ones are dependable, while caller-stated ones can be forged and give only a guard against mistakes.", "Many fine conditions vs a few coarse ones: fine conditions narrow exposure but make policies fragile and hard to audit."],
    p: ["Conditions on a source network fail when traffic goes through a proxy or private link that changes the observed address.", "Time-based conditions disagree with clock skew between regions."],
    v: "Write a policy requiring a context pair and a service origin. Call with the pair from the named service and confirm allow, then omit the pair or call directly and confirm deny each time.",
    dep: ["encryption-context","key-policies","tags-labels"]
  },
  "separation-of-duties": {
    s: "The rule that people who administer a key cannot use it, and people or services that use it cannot change its policy, state or lifetime.",
    d: "Roles split into administrators, users, auditors and rotators, each with disjoint actions. The service enforces it by treating administrative and cryptographic permissions as different action sets, and by supporting policy checks that reject a grant mixing them. Security teams then control keys without seeing data, and developers use keys without being able to widen access. It is hard because the split must survive real work: emergencies, small teams and automation accounts tend to collect both sets of permissions back together.",
    k: ["Strict role split vs combined admin and use roles: the split limits insider and compromised-account damage, but adds handoffs and slows small teams.", "Policy linting that rejects mixed roles vs advisory warnings: rejection holds the line, while warnings are ignored under pressure."],
    p: ["A single automation identity given both sets of rights negates the separation while appearing compliant.", "An administrator can still grant themselves use through a policy edit, so the control is cosmetic without approval."],
    v: "As an administrator, attempt to decrypt and confirm denial. As a user, attempt to edit the policy and confirm denial. Then have the administrator grant themselves use and confirm the change triggers an alert or needs approval.",
    dep: ["key-policies","quorum-approval","usage-constraints"]
  },
  "cross-account-access": {
    s: "Lets principals in one tenant use a key owned by another, which requires explicit permission on both the key's side and the caller's side.",
    d: "The owning tenant adds the foreign account to the key policy; the foreign tenant then attaches permissions to the specific role that will call. Both must agree, so neither side can grant access alone. Audit entries appear in both tenants' trails. This is used for shared encryption between business units, vendors that process data and central security teams that own keys for many accounts. It is hard because the trust path is long, and because removing the foreign principal from only one side leaves confusing partial states.",
    k: ["Central key owner with many consumers vs a key per consumer: central ownership simplifies governance and rotation, but concentrates risk in one key and one policy.", "Granting an entire account vs a specific role: whole-account is easy and gives access to every identity inside it, while per-role is narrow and needs coordination."],
    p: ["Granting an entire foreign account delegates trust to that account's administrators forever.", "The consumer's service role is deleted and recreated, and the new role silently lacks access."],
    v: "Grant account B decrypt in the key policy, call from B before and after attaching B's own permission, and confirm denial until both exist. Check both tenants' trails show the call.",
    dep: ["key-policies","identity-policy-evaluation","tenant-model"]
  },
  "usage-constraints": {
    s: "Fixed purpose restrictions set at key creation, such as encrypt-decrypt only, sign-verify only or MAC only, which the service enforces and which cannot be widened later.",
    d: "Each key carries a usage that determines which engine operations may reference it. A signing key cannot decrypt; a wrapping key cannot encrypt user data. Constraints are immutable because a change would let a key be used in a way its data were never protected for. They prevent cross-protocol attacks where a signature is reinterpreted as a decryption oracle. The hard part is anticipating needs: creators who choose too narrowly must make a new key and migrate data.",
    k: ["Immutable usage vs changeable: immutable usage blocks a class of cross-use attacks and is easy to audit, but forces migration when needs change.", "One key per purpose vs one key reused: separate keys isolate failures and simplify rotation, but multiply objects to manage."],
    p: ["A key reused for encryption and for signing allows an attacker to pose a signing request as a decryption.", "Choosing the broadest usage at creation to avoid future work removes the constraint's value."],
    v: "Create a sign-only key, request encryption with it and confirm a usage error. Try to update its usage and confirm the API refuses.",
    dep: ["key-types","metadata-store"]
  },
  "quorum-approval": {
    s: "Requires two or more distinct people to approve a dangerous action, such as deleting a key, changing its policy or exporting wrapped material, before it takes effect.",
    d: "A request for the action opens a pending change that names the requester and the target. Approvers authenticate separately, review and approve; when the threshold is reached, the service performs it. Requests expire if unattended. The thresholds can differ by action and key class. The mechanism belongs in the control plane, not in out-of-band process, so it cannot be skipped. It is hard because approvals must be meaningful: reviewers shown only a key identifier rubber-stamp, and an emergency still has to be possible.",
    k: ["Technical quorum enforced by the service vs a process rule: technical quorum cannot be bypassed by one administrator, but adds delay and needs available approvers.", "Quorum for all changes vs only destructive ones: all-changes covers more risk but trains approvers to click through."],
    p: ["Approvers are the same two people for everything, so collusion or shared credentials defeat it.", "A pending request approved days later after the context changed executes against a different situation."],
    v: "Request deletion of a test key as person A and confirm nothing happens. Approve as person A again and confirm refusal. Approve as person B and confirm the action now proceeds and is logged with both names.",
    dep: ["key-administration","caller-authentication","audit-log"]
  },
  "tenant-model": {
    s: "The definition of who owns resources in the service: accounts, organizations and projects, their hierarchy, their limits and their billing and administrative boundaries.",
    d: "Every key, alias and grant belongs to a tenant account, and requests are authenticated into one. Organizations group accounts so central teams set guardrails over many tenants. The model determines default policy scope, quota pools, billing and what deleting an account does to its keys. Isolation checks start from the tenant identifier on every storage lookup. It is hard because the tenant boundary is the line cross-customer bugs cross, so it must be enforced in code at every access, not left to convention.",
    k: ["Organization-level guardrails vs only per-account control: guardrails let central security forbid risky settings everywhere, but add a layer of rules that overrides local intent.", "Tenant identifier in every key of storage vs a per-tenant database: identifier-in-key shares infrastructure cheaply, while per-tenant stores give physical separation at higher cost."],
    p: ["A query path that forgets the tenant filter returns another customer's key metadata.", "Closing an account deletes its keys while another tenant's data still depends on them through sharing."],
    v: "Using two test tenants, request tenant A's key identifier as tenant B and confirm identical responses for nonexistent and foreign keys. Confirm storage queries in the trace always carry the tenant field.",
    dep: ["metadata-store","caller-authentication"]
  },
  "tenant-key-domains": {
    s: "Cryptographic separation of tenants: each tenant's keys are wrapped under a key domain unique to it, so a flaw in routing or storage cannot make one tenant's keys decrypt for another.",
    d: "Beyond access checks, each tenant gets its own domain key in the hierarchy, wrapped by the regional root. Stored tenant keys are wrapped under that domain key, and the tenant identifier is bound in as authenticated data. Even if a bug returns the wrong row, unwrapping fails because the domain differs. High-assurance tenants can get a dedicated partition in the hardware. It is hard because per-tenant domains multiply keys to rotate and cache, and because each isolation layer costs performance.",
    k: ["Cryptographic separation per tenant vs access control alone: cryptographic separation survives logic bugs, but adds keys, cache entries and unwrap steps.", "Shared hardware partitions vs dedicated per tenant: shared is cheap and dense, while dedicated meets strict requirements at far higher cost."],
    p: ["A cache keyed only by key identifier serves one tenant's unwrapped key to another.", "Domain key loss makes every key of that tenant unrecoverable."],
    v: "Copy tenant A's wrapped key record into tenant B's namespace in a test store and confirm unwrap fails with a domain mismatch rather than returning key material.",
    dep: ["domain-keys","tenant-model","hsm-partitions","key-encrypting-keys"]
  },
  "quotas-throttling": {
    s: "Per-tenant and per-key request limits with fair shares of expensive resources, so one customer's burst or runaway loop cannot degrade others.",
    d: "Limits apply by operation type and tenant, often with separate budgets for hardware-backed operations, which are scarce, and software-backed ones. Token buckets allow bursts, then shed load with a retryable error. Shared limits can include a key-level cap to protect one hot key. Counters are approximate across fleets so the rate is enforced with small error. It is hard because the key service is on the critical path of customers' own storage reads, so throttling is an outage for them, and limits must be chosen from real usage.",
    k: ["Per-tenant limits vs global limits only: per-tenant protects neighbors, while global alone lets one tenant exhaust everything.", "Hard rejection vs queueing: rejection is predictable and cheap, but queueing absorbs bursts at the risk of building latency and retries."],
    p: ["A cache disabled by accident multiplies decrypt calls by a thousand and hits the limit, taking down storage reads.", "Limits sized for average load fail on the first full-fleet restart."],
    v: "Run a tenant above its limit and confirm throttling errors for that tenant only, while a second tenant's latency and success rate stay unchanged. Confirm the throttle counter appears in metrics.",
    dep: ["metrics-slos","tenant-model"]
  },
  "service-vs-customer-keys": {
    s: "The ownership spectrum from keys the provider creates and controls, through keys that exist in the customer's tenant, to keys whose root the customer holds.",
    d: "Provider-owned keys are invisible, free and have no controls. Provider-managed keys in a customer's tenant appear in inventory, accept policy and are audited per use, but the provider holds them. Customer-controlled options add customer-supplied material or an external root. More control brings more cost, more latency and more ways to lose data. Many services let each integration select the level. It is hard because customers conflate being able to see and revoke with the provider being unable to read.",
    k: ["Provider-owned default keys vs customer-managed keys: defaults need no setup and cannot be lost, while customer-managed give audit and revocation at operational cost.", "Per-resource key choice vs one key per account: per-resource limits blast radius and eases deletion, while one key is simple and creates a single point of failure."],
    p: ["Teams choose customer-managed keys for compliance and never staff the rotation, policy and recovery work they imply.", "A customer disables a key during a cost review and takes its own production offline."],
    v: "For one dataset, encrypt under each option and compare what the customer can observe: audit entries per use, ability to disable, and what a disable does. The observed differences must match the documentation.",
    dep: ["byok","key-creation","audit-log"]
  },
  "byok": {
    s: "A customer generates key material on its own systems and imports it, wrapped for transport, into the service, which then uses it like any other key.",
    d: "The service issues a one-time wrapping public key with an import token, bound to a target key and a short lifetime. The customer wraps its material under it and uploads. The service unwraps inside the hardware and creates a key marked as externally originated. The customer keeps its own copy. Imported keys cannot be rotated by the service because it does not own the source, and can have an expiry. It is hard because the customer holds the only other copy, and losing both or mishandling the source is unrecoverable.",
    k: ["Customer-held source material vs service-generated: holding the source preserves a recovery path and some sense of control, but the customer carries custody and rotation work.", "Expiring imports vs permanent: expiry forces regular re-import and limits exposure, while permanent is simpler and weaker."],
    p: ["Customers believe import means the provider cannot read the key, though the service must hold it to use it.", "Material destroyed on the customer side while data remains encrypted under the imported copy is data loss."],
    v: "Import a known test key, encrypt a value, independently decrypt it with the customer-held copy using a separate implementation and confirm they agree. Let the import expire and confirm decrypt fails.",
    dep: ["key-import","hsm-attestation","wrap-unwrap-api"]
  },
  "external-key-store": {
    s: "A mode where the root key never enters the provider at all: the service forwards wrap and unwrap operations over an authenticated channel to a customer-operated key manager.",
    d: "The service calls the customer's endpoint on every operation that needs the root, with request signing and a proxy that translates between protocols. The customer sees and can refuse each call, and can cut access at once by stopping its endpoint. Data keys are still cached to bound call volume. This answers requirements that keys remain in a specific jurisdiction or organization. It is hard because availability becomes the customer's: an outage in their system stops decryption of their data, and every operation pays a network round trip.",
    k: ["External root vs provider-held root: external gives strongest control and independent revocation, but the customer's uptime and latency become the data's uptime and latency.", "Caching wrapped-key results vs calling out each time: caching survives short outages and cuts cost, while calling out gives true instant revocation."],
    p: ["The external endpoint is deployed on a single host without backups, making a routine reboot an application outage.", "Timeouts tuned too tightly cause the service to mark the store failed during normal load."],
    v: "Block the customer endpoint and confirm decrypt for data under that store fails with a clear unavailable error within the timeout, while keys under other stores stay unaffected. Unblock and confirm recovery without manual action.",
    dep: ["key-encrypting-keys","caller-authentication","failover-routing"]
  },
  "root-of-trust": {
    s: "The small set of keys, held in hardware and quorum-controlled, from which every other key's protection derives, and whose compromise would expose everything below.",
    d: "A root key is generated inside secure hardware by a witnessed process, is never exported except as shares held by separate custodians, and wraps the next level. It is used rarely, which makes it practical to keep offline copies and to apply the strictest controls. The service trusts nothing without a chain back to it. Everything depends on it, so its design emphasizes small count, long life, geographic backup and a tested restore. It is hard because it must never be lost and never be exposed, which are opposing requirements.",
    k: ["Few roots with strong custody vs many roots: few roots are easier to protect and audit, but a compromise or loss is catastrophic.", "Shares held by several custodians vs a single sealed backup: shares resist a single bad actor, while a sealed backup is simpler to store and restore."],
    p: ["Custodians change jobs and shares are lost, discovered only when a restore is needed.", "A restore procedure never rehearsed fails on the first real attempt because tokens or firmware differ."],
    v: "In a rehearsal environment, restore the root from custodian shares onto fresh hardware, then unwrap a known sample domain key and confirm it matches. Time the full drill and record who participated.",
    dep: ["hsm-fleet","key-ceremony","operator-quorum","hierarchy-levels"]
  },
  "hierarchy-levels": {
    s: "The layered design in which a root wraps domain keys, which wrap key-encrypting keys, which wrap data keys, with each level more numerous and shorter-lived than the one above.",
    d: "The top levels are few and stay inside hardware; the lower ones are many and are used in software that has fetched them unwrapped for a short time. A decrypt walks the chain: unwrap the key-encrypting key, then the data key. Levels give fast rotation at the bottom without touching the top, and let a cache hold lower keys without exposing higher ones. Each level adds a lookup and a failure mode. The hard question is depth: too few levels expose too much per compromise, too many add latency and moving parts.",
    k: ["Deep hierarchy vs shallow: deep limits what any one compromise reveals and allows cheap rotation, but each added level is a dependency and a unwrap on the miss path.", "Wrapping keys by tenant vs by region only: per-tenant isolates customers cryptographically, while regional-only is leaner and shares fate."],
    p: ["Design reviews count the levels in the diagram while production skips one for a hot path, collapsing the protection.", "A level whose rotation cadence is slower than its policy states."],
    v: "Trace one decrypt through the chain with debug on in a test environment and confirm each level is unwrapped in order, with the highest levels touched only inside hardware.",
    dep: ["root-of-trust","domain-keys","key-encrypting-keys","data-keys"]
  },
  "domain-keys": {
    s: "Intermediate keys, one per region, tenant or cell, wrapped by the root, that scope how far any key under them can reach and how far a compromise can spread.",
    d: "A domain key partitions the key space along an isolation boundary. All key-encrypting keys in a region are wrapped under that region's domain key, so a region's keys decrypt only there. Domain keys are loaded into hardware at service start and held in memory of the module, and rotated on a long schedule by re-wrapping what is below. They are the technical enforcement of regional residency and tenant separation. The hard part is rotation: re-wrapping a domain's full contents is a large background job that must not interrupt traffic.",
    k: ["Domains aligned to regions vs aligned to tenants: regional domains enforce residency and limit outages, while tenant domains enforce customer isolation; large services use both.", "Rotating the domain key by re-wrapping vs versioning only: re-wrapping removes old versions eventually, while versioning only is cheap and leaves old material valid."],
    p: ["A domain key backup stored outside its region breaks the residency promise it was designed for.", "Rotation of a domain key paused partway leaves two generations in use with no one tracking it."],
    v: "Copy a region A wrapped key to region B in a test and confirm unwrap fails. Rotate the domain key and confirm all sampled wrapped keys now name the new version and still unwrap.",
    dep: ["root-of-trust","hsm-partitions","regional-isolation"]
  },
  "key-encrypting-keys": {
    s: "The customer-visible keys, the ones with identifiers, policies and versions, whose job is to wrap data keys and sometimes to encrypt small data directly.",
    d: "This is the level people create and manage. The key's material is stored wrapped under a domain key and loaded into hardware or protected memory when needed. Each key carries versions, so ciphertext remains decryptable after rotation. Policy, state and usage attach here. The number of keys can be millions. The hard part is the working set: loading material per request is slow, and keeping everything resident is impossible, so a cache with eviction and strong memory protection sits between the request and storage.",
    k: ["Keys unwrapped in software memory vs operated entirely in hardware: software is fast and scales to millions of keys, hardware-resident keys protect better and limit throughput and count.", "One key per resource vs shared key: per resource limits damage, and a shared one limits operations burden."],
    p: ["Millions of keys with identical default policy make an access review impossible.", "A cache that holds material after the key is disabled keeps serving it."],
    v: "Create a key, use it, disable it and confirm that the next request is refused and that the material is evicted from the cache within the documented time, by inspecting the cache entry state.",
    dep: ["domain-keys","wrapped-key-store","material-cache","key-versions"]
  },
  "data-keys": {
    s: "Short-lived working keys, one per object or batch, generated by the service, wrapped under a key-encrypting key, and used by clients to encrypt actual data.",
    d: "A data key exists in plaintext only in the memory of the client or service that is encrypting, and otherwise as a wrapped blob stored with the data. Each can protect one record, one file or a time window of messages. Because they are numerous and cheap, they can be rotated by replacement. The service never stores them, and the wrapped copy lives in the caller's storage. The hard part is that the service has no record of them, so inventorying, revoking or counting data keys is impossible without the callers' help.",
    k: ["Unique key per object vs shared key per dataset: unique limits damage and simplifies deletion by destroying one wrapped key, but costs a call and storage per object.", "Service not storing data keys vs storing them: not storing keeps the service small and stateless, but it cannot answer what a key protects."],
    p: ["A data key reused beyond cipher limits weakens every object it protects.", "Wrapped data keys deleted from storage by a cleanup job make the data permanently unreadable."],
    v: "Encrypt ten objects, confirm ten distinct wrapped keys, delete one object's wrapped key and confirm only that object becomes unreadable while the other nine decrypt.",
    dep: ["key-encrypting-keys","generate-data-key","aead-engine"]
  },
  "key-ceremony": {
    s: "The scripted, witnessed procedure for creating or restoring root keys, with named roles, hardware that is verified and a recorded outcome, so the root's origin can be trusted.",
    d: "Participants in a controlled room follow a written script: verify tamper seals and firmware, initialize hardware, generate the root, split it into shares for custodians, store shares in separate sealed locations and record hashes and signatures. Everything is recorded and later reviewed. A shorter version runs for each regional bring-up. It is hard because humans are the weak part: scripts drift from practice, witnesses sign without watching, and the evidence is needed years later by auditors who were not there.",
    k: ["Full witnessed ceremony vs automated generation in hardware: ceremony gives auditable human assurance, while automation is repeatable and removes people from reach of the key.", "Fixed script with sign-offs vs flexible procedure: a fixed script prevents improvisation, but cannot cover a failed device without an amendment process."],
    p: ["A ceremony script never updated for new hardware is bypassed informally.", "Recordings and logs retained too briefly to answer an audit years later."],
    v: "Dry-run the ceremony with test hardware, then have an independent reader reconstruct from the records alone what was generated, by whom and where each share is held. Any gap in the record is a failure.",
    dep: ["hsm-fleet","operator-quorum","root-of-trust"]
  },
  "key-types": {
    s: "The catalog of supported key kinds and sizes: symmetric, RSA-style, elliptic-curve, MAC and wrapping keys, each with a defined purpose and a security level.",
    d: "Each type specifies the algorithm family, length or curve, permitted operations and whether it can be exported as public material. The catalog is intentionally small, since every entry is a permanent maintenance and review obligation. Types are marked with their security strength so policy can require a minimum. New types are added, old ones deprecated for creation but kept for decryption. The hard part is saying no: customers request legacy or exotic types, and each yes widens the code that handles key material.",
    k: ["Small curated set vs every requested algorithm: a small set is reviewable and safer, while a large set satisfies compatibility needs and increases attack surface.", "Deprecating for creation but keeping for use: preserves data access, but old algorithms linger in the codebase for decades."],
    p: ["A weak type kept for one customer remains selectable by everyone through defaults.", "Retiring a type without a migration path leaves data that cannot be decrypted."],
    v: "Attempt to create a key of every listed type and of one unlisted type; confirm each listed type works for its permitted operations only and the unlisted type is refused with a clear error.",
    dep: ["algorithm-agility","usage-constraints"]
  },
  "key-generation": {
    s: "Producing new key material from a strong random source inside the protected boundary, and recording its origin, so that no human or log ever sees it.",
    d: "On creation the engine requests random bits from the certified source in the hardware, derives or generates the key of the requested type, wraps it under the domain key and writes only the wrapped form to storage. Public components are extracted and returned. For asymmetric keys, generation can take noticeable time, so it is done ahead of need in a pool in some designs. It is hard because quality is invisible: a flawed random source produces keys that look fine and are predictable, so verification depends on certified hardware and health tests.",
    k: ["Generation inside hardware vs in software then wrapped: hardware gives the best randomness and no exposure, while software generation scales to volume and relies on host trust.", "Pre-generated pools vs on demand: pools hide slow generation, but hold unused keys that must be tracked and protected."],
    p: ["A virtual machine cloned after seeding yields the same random output on two hosts.", "Health-test failures on the random source ignored or logged only as warnings."],
    v: "Generate ten thousand symmetric keys and confirm no duplicates and passing randomness tests. Trigger the source's health test failure in a test unit and confirm generation stops instead of continuing.",
    dep: ["entropy-rng","hsm-fleet","key-encrypting-keys"]
  },
  "key-import": {
    s: "Bringing externally generated key material into the service under a transport-protected, attested process, and marking the key as imported so its origin is never mistaken.",
    d: "The service returns a transport public key and an import token. The caller wraps its material, uploads it, and the engine unwraps it inside the boundary, validates length and type, and stores it wrapped like any other key. The key's origin is recorded as external, which disables some features such as automatic rotation. The same path serves migration from other systems. It is hard because the key was exposed before it arrived, and because the same material imported twice, into two regions or services, silently creates two copies to protect.",
    k: ["Allowing import vs generating only: import supports migration and sovereignty needs, but accepts keys with unknown history and quality.", "Single-use import tokens vs reusable: single-use limits replay, but forces a new handshake per attempt."],
    p: ["Importing a key that was previously exposed in a script or ticket makes the whole chain only as good as that copy.", "Importing the same material into several services and forgetting to rotate all of them."],
    v: "Import a test key, encrypt, and decrypt with an independent implementation using the original material. Try reusing the import token and confirm refusal.",
    dep: ["byok","wrap-unwrap-api","hsm-attestation","key-encrypting-keys"]
  },
  "key-versions": {
    s: "Successive generations of the material behind one key identifier, so new data uses the latest version while old ciphertext still decrypts under the version that made it.",
    d: "A key has an identifier and a list of versions, each with its own material, creation time and state. Encrypt always uses the primary version; decrypt reads the version from the ciphertext header. Rotation adds a new version and makes it primary. Old versions remain until disabled or destroyed. Policy and aliases attach to the identifier, not a version. The challenge is accumulation and visibility: a key with years of versions must keep them all while data exists, and no one can easily tell which data uses which version.",
    k: ["Versions under one identifier vs a new key per rotation: one identifier means callers never change configuration, while new keys per rotation are explicit but force references to be updated.", "Keeping all old versions vs expiring after a period: keeping all preserves data access, and expiring limits exposure but makes old data unreadable."],
    p: ["Old versions are retained forever and the exposure window of a leaked early version never closes.", "No one knows which versions are still needed, so none are ever retired."],
    v: "Encrypt under version one, rotate, encrypt under version two, and confirm both decrypt. Disable version one and confirm only the first ciphertext fails while the second continues to work.",
    dep: ["key-encrypting-keys","ciphertext-format","wrapped-key-store"]
  },
  "rotation": {
    s: "Creating a new key version on a schedule or on demand, so new encryptions use fresh material while existing data remains readable.",
    d: "Automatic rotation adds a version at a fixed period, commonly a year, and on demand when someone suspects exposure. Only newly encrypted data uses the new version, so rotation alone does not remove old key exposure from old data. Real exposure removal needs a re-wrap or re-encrypt sweep. Rotation for imported or external keys is manual because the service does not own the source. It is hard because teams believe rotation is protection, when it mostly limits future exposure and bounds usage counts.",
    k: ["Frequent automatic rotation vs rare manual: frequent rotation limits how much data a key version covers and exercises the machinery, but multiplies versions to keep.", "Rotation by new version vs full re-encryption: new version is cheap and instant, while full re-encryption is the only way to make an old compromised key useless."],
    p: ["Rotation assumed to fix a leak, while years of data still sit under the leaked version.", "Rotation failure goes unnoticed for months because nothing alerts on a missing new version."],
    v: "Trigger rotation, confirm a new primary version exists and new ciphertexts name it, and confirm old ciphertexts still decrypt. Check an alert fires if a scheduled rotation is skipped.",
    dep: ["key-versions","key-generation","rewrap-sweep"]
  },
  "key-states": {
    s: "The defined states a key moves through, such as pending, enabled, disabled, pending deletion and destroyed, with strict rules for which operations are allowed in each.",
    d: "State is part of key metadata and is checked on every request. Enabled keys serve all permitted operations. Disabled keys refuse use but remain recoverable. Pending-deletion keys refuse use during a waiting period and can be restored. Destroyed keys are gone. Some states restrict encryption but allow decryption, which helps with deprecation. Transitions are logged and some require approval. It is hard because state changes must propagate to every replica and cache promptly, and because the destroyed state is unrecoverable by design.",
    k: ["Explicit state machine vs a set of flags: an explicit machine makes illegal combinations impossible and audit clear, but new states need migration work.", "Decrypt-only state vs disable-all: decrypt-only supports retirement of a key from new use with no outage, while disable-all is the stronger revocation."],
    p: ["A disabled key quietly breaks a backup process that runs monthly and is noticed weeks later.", "Cached state serves a key for a while after its state changed."],
    v: "Walk a test key through each state, calling encrypt and decrypt in each, and compare the results with the written table of allowed operations. Any difference is a defect.",
    dep: ["metadata-store","consistency-model"]
  },
  "scheduled-deletion": {
    s: "Deleting a key only after a mandatory waiting period, during which it cannot be used but can be restored, because deleting a key destroys all data it protects.",
    d: "A delete request moves the key to pending deletion for a minimum number of days, commonly seven to thirty. The key is unusable immediately, and any attempt to use it is logged and can raise an alert, which reveals forgotten dependencies. After the period the service destroys the material in all regions and backups according to a retention rule. Cancel at any time before. The hard parts are propagation to every copy, including backups, and the pressure from cost and compliance to shorten the wait.",
    k: ["Mandatory waiting window vs immediate delete: the window turns an irreversible mistake into a recoverable one, but delays legitimate erasure for regulations.", "Alerting on attempted use during the wait vs silence: alerts expose hidden dependencies before it is too late, at the cost of noise from retries."],
    p: ["The window passes with nobody watching the denials, and a still-needed key is destroyed.", "Backups keep the material long after deletion, so data deemed erased is recoverable."],
    v: "Schedule deletion of a test key, confirm use is denied and logged, restore it and confirm decrypt works. Let another test key reach the end and confirm material is absent from storage and backups after their retention.",
    dep: ["key-states","audit-log","backup-restore","usage-anomaly-alerts"]
  },
  "disable-enable": {
    s: "A reversible switch that stops a key being used for new requests while keeping its material, as a fast first response to suspected misuse and a safe step before deletion.",
    d: "Disabling sets the key's state and publishes it to serving nodes and caches; every operation is refused until the key is enabled again. It does not remove data or versions. It is both an incident control, to cut off a possibly misused key, and a routine test of dependencies before deletion. Version-level disable allows retiring one generation. The hard part is speed and certainty: callers with cached data keys may continue to decrypt, so the effect is not instantaneous.",
    k: ["Disable as a first response vs rotate: disable stops use immediately but breaks the legitimate users, while rotation keeps service running and leaves the old version usable.", "Disable at key level vs version level: key level is blunt and quick, version level limits the outage to data from one generation."],
    p: ["A disable during an incident takes down production data paths that nobody had mapped to this key.", "Client caches keep decrypting after the disable, giving false confidence of containment."],
    v: "Disable a key in use, record the time until the last client fails, then enable and confirm all clients recover without restart. The failure time is the real containment delay.",
    dep: ["key-states","data-key-cache","key-administration"]
  },
  "expiry-deprecation": {
    s: "Scheduled end of a key's or version's useful life: no new encryption after a date, decryption allowed longer, then retirement, following the algorithm's and the policy's crypto period.",
    d: "Each key can have a validity window. After the encryption period, the key is decrypt-only so that no new data uses it but old data remains readable, and later it becomes eligible for retirement once nothing depends on it. Policy-driven deprecation of algorithms follows the same shape. Inventory and alerts tell owners when keys approach their dates. The challenge is knowing when nothing depends on a key, since the service sees decrypt calls only, and a rarely read archive can depend on it silently.",
    k: ["Separate encryption and decryption periods vs one lifetime: the split follows standard practice and prevents surprise outages, but means keys outlive their active use.", "Automatic enforcement of expiry vs warnings only: enforcement keeps the fleet clean, and warnings avoid outages caused by a forgotten date."],
    p: ["An expiry hits during a holiday for a key nobody owns, and data paths stop.", "Decrypt-only keys remain for years because no usage data says they are idle."],
    v: "Set a short validity on a test key, confirm encryption is refused after the date while decryption continues, and confirm owners receive the advance notice at the configured lead time.",
    dep: ["key-states","key-inventory","usage-anomaly-alerts"]
  },
  "rewrap-sweep": {
    s: "A background job that walks stored ciphertext or wrapped keys and re-wraps them under the current key version, so old versions can be retired without waiting for data to be rewritten.",
    d: "For wrapped data keys, the job reads a batch, sends each through re-encrypt, and writes the result back, leaving the underlying data untouched. For tenant data, it is run by the owner against its own stores. Progress is tracked per batch and the job is throttled to protect foreground traffic. Completion means no stored item names the old version, which can be verified by scanning headers. It is hard because the data is spread across systems the key service does not control, and partial progress is common.",
    k: ["Re-wrapping data keys vs re-encrypting data: re-wrapping touches small objects and is fast, but does not help if the data key itself was exposed.", "Eager sweep after rotation vs lazy on read: eager gives a firm end date for old versions, while lazy costs nothing until data is touched and never finishes for cold data."],
    p: ["The sweep is declared complete from the service side, while a store the service does not know about still holds old versions.", "An unthrottled sweep consumes the quota needed by production decrypts."],
    v: "After the sweep, scan stored headers and count items naming the old version, expecting zero. Disable the old version and confirm no decrypt failures appear in the following week.",
    dep: ["reencrypt-api","key-versions","quotas-throttling","rotation"]
  },
});
