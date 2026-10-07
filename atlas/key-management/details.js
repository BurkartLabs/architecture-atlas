// Details for the key management plate, part 1: clients and interfaces.
ATLAS.details("key-management", {
  "client-libraries": {
    s: "Language-level libraries that wrap the service's API, handle authentication, retries and envelope encryption, and give application code a simple encrypt and decrypt call.",
    d: "A client library signs requests with the caller's identity, picks the regional endpoint, retries transient failures with backoff and parses the ciphertext format. Higher-level calls perform envelope encryption locally so applications never write the data-key dance themselves. The library is where safe defaults live: authenticated modes, context binding and limits on how much data one key may encrypt. It is hard because it ships into thousands of codebases that upgrade slowly, so every mistake it makes lasts for years, and its format must stay readable across versions.",
    k: ["Thick libraries that encrypt locally vs thin wrappers over the API: thick ones cut service load and latency and enforce good defaults, but their bugs and format choices are frozen into every caller.", "One library per language maintained centrally vs generated bindings: central ownership keeps behavior identical across languages, at the cost of slower coverage of new languages."],
    p: ["Callers pin an old library version, so a fix to a unsafe default never reaches them.", "A library that silently falls back to a weaker mode when the service is unreachable turns an outage into a quiet downgrade."],
    v: "Encrypt a record with the newest library, decrypt it with the oldest supported one, and confirm identical plaintext. Then cut the network and confirm the call fails with an error instead of returning unprotected data.",
    dep: ["envelope-client","caller-authentication","retries-idempotency","ciphertext-format"]
  },
  "envelope-client": {
    s: "The client-side routine that asks the service for a data key, encrypts bulk data locally with it, and stores the wrapped copy of the key beside the ciphertext.",
    d: "The client requests a fresh data key and receives it twice: in plaintext for immediate use and wrapped under a named key. It encrypts the payload with an authenticated cipher, discards the plaintext key and writes the wrapped key into the object header. To read, it sends the wrapped key back for unwrapping, then decrypts locally. This keeps large data off the service and gives each object its own key. The difficulty is hygiene: plaintext keys must be wiped, and headers must bind the algorithm and context so they cannot be swapped.",
    k: ["Data key per object vs one key per batch or file set: per-object limits damage from a leaked key but multiplies service calls, while batching saves calls and widens exposure.", "Local encryption vs sending data to the service: local scales and keeps plaintext private, but moves correctness of the cipher usage onto every client."],
    p: ["Plaintext data keys left in memory, swap or crash dumps defeat the whole scheme.", "Reusing a nonce under one data key breaks authenticated encryption; long-lived cached keys make reuse more likely."],
    v: "Encrypt a one-gigabyte file and confirm the service saw only a data key request and an unwrap request, never the file. Flip one header bit and confirm decryption fails instead of producing output.",
    dep: ["generate-data-key","decrypt-api","ciphertext-format","encryption-context"]
  },
  "data-key-cache": {
    s: "A bounded in-memory store of unwrapped data keys on the client, reused across requests to avoid a service round trip per object, with limits on age, use count and bytes.",
    d: "Entries are keyed by the wrapped key or by the key identifier plus context. A cache hit skips the network call; a miss fetches and stores. Policy limits cap how long an entry lives, how many messages it protects and how much plaintext it encrypts, after which it is evicted and wiped. This trades some security for large throughput and survival of short service outages. It is hard because the bounds interact with cipher limits, and because a cached key keeps working after the service has disabled the key or revoked access.",
    k: ["Cache with age and usage limits vs no cache: caching cuts latency and cost by orders of magnitude and rides out blips, but delays the effect of revocation by the cache lifetime.", "Caching decrypt results vs encrypt keys only: caching both is fastest, but retains more plaintext keys for more time in process memory."],
    p: ["Unbounded caches let one key encrypt more data than the cipher safely allows.", "Operators disable a compromised key and assume it is dead, while running processes keep using cached copies for minutes or hours."],
    v: "Disable a key, then time how long until a running client's next call fails. The failure must arrive within the configured cache lifetime, and the cache must show a miss and a service denial.",
    dep: ["generate-data-key","decrypt-api"]
  },
  "caller-authentication": {
    s: "Verifies who is calling, using signed requests, short-lived tokens or mutual TLS, and produces the identity that authorization and audit later rely on.",
    d: "Callers present a credential bound to a workload identity: a request signature derived from a secret, a token issued by an identity system, or a client certificate. The service validates freshness, scope and issuer, then maps the result to a principal that policy can reference. Short lifetimes limit theft. The service must also reject replays and clock-skewed requests. It is hard because every later control, including audit attribution, is only as trustworthy as this step, and because credentials in application config are common targets.",
    k: ["Short-lived federated tokens vs long-lived static credentials: short-lived tokens limit the value of theft and need no rotation, but require an identity system on the critical path.", "Mutual TLS vs signed requests: mutual TLS authenticates the channel and hides bodies, while signing survives proxies and works per request."],
    p: ["Static credentials copied into images or repositories outlive the workload and are never revoked.", "Accepting requests with loose clock tolerance enables replay of captured calls."],
    v: "Send the same signed request twice outside its validity window and confirm rejection. Use an expired token and confirm denial, and check the audit entry names the real principal.",
    dep: ["identity-policy-evaluation"]
  },
  "retries-idempotency": {
    s: "Rules that make retried requests safe: client retry with backoff, request tokens that deduplicate state changes, and server-side behavior when the same call arrives twice.",
    d: "Cryptographic operations such as encrypt or decrypt are naturally repeatable, but generating a key, scheduling deletion or rotating are not. Callers attach a token to state-changing calls; the service stores the result against the token for a window and returns it again. Clients retry on throttle and server errors with exponential backoff and jitter, and honor a retry budget. The hard part is the unknown outcome: a timed-out create may have succeeded, and a naive retry makes two keys or loses the first.",
    k: ["Client-supplied idempotency tokens vs server-detected duplicates: tokens are exact and cheap, but every caller must remember to supply them.", "Aggressive retry vs a retry budget: fast retry hides small blips but turns a partial outage into a flood that prevents recovery."],
    p: ["Retrying without jitter makes many clients hit a recovering service at once and knock it down again.", "Retrying a create after timeout leaves orphaned keys that cost money and appear in inventory forever."],
    v: "Issue a create with a token, drop the response, retry with the same token and confirm one key exists. Then retry without a token and confirm two, showing why the token matters.",
    dep: ["quotas-throttling"]
  },
  "storage-integrations": {
    s: "Connectors that let storage, database and messaging services encrypt their data with customer keys, calling the service on the caller's behalf under a delegated identity.",
    d: "A storage service holds a grant or role allowing it to request data keys and unwrap them for a customer's objects. It stores the wrapped key with each object or block and asks the key service to unwrap on read. The context names the resource so a key unwrapped for one object cannot be used for another. This puts the key service under every read path of the platform. It is hard because the dependency is invisible to users, and disabling a key makes whole datasets unreadable.",
    k: ["Service-side encryption through delegation vs client-side encryption: delegation is turnkey and works for every client, but the provider's service handles plaintext and needs standing access to the key.", "Per-object data keys vs per-volume keys: per-object isolates damage but multiplies unwrap calls; per-volume keeps traffic low and widens exposure."],
    p: ["Disabling a key during a cleanup silently breaks backups, queues and databases that use it through integrations.", "Grants to service identities outlive the resource they were created for."],
    v: "Create an encrypted object, disable the key, and confirm reads fail with a key-state error in the audit log naming the storage service as caller. Re-enable and confirm reads succeed.",
    dep: ["grants","decrypt-api","encryption-context","generate-data-key"]
  },
  "edge-proxy": {
    s: "A local daemon or sidecar that exposes the key service to workloads on one host or network edge, terminating authentication and caching to reduce latency and credential spread.",
    d: "Applications call a loopback or socket endpoint with a simple protocol. The proxy holds the host's identity, signs upstream requests, keeps a short key cache and may batch requests. It also lets workloads that cannot embed a library, such as legacy software, use envelope encryption through a uniform interface. The difficulty is trust: the proxy is a privileged component on every host, so it widens the attack surface, and its local endpoint must be restricted so any process on the machine cannot ask for any key.",
    k: ["Shared host proxy vs a library in each process: a proxy centralizes identity and caching and serves any language, but any local process may reach it unless carefully isolated.", "Proxy-side caching vs none: caching hides service latency and outages, at the cost of stale authorization after a revocation."],
    p: ["A proxy listening on a network interface instead of a local socket exposes decryption to the whole subnet.", "Proxy and service versions drift, and a protocol change fails only on hosts that missed the upgrade."],
    v: "From an unprivileged process on the host, request a key the host's identity may not use and confirm denial. From another host, try to reach the proxy port and confirm the connection is refused.",
    dep: ["caller-authentication","data-key-cache"]
  },
  "encrypt-api": {
    s: "Encrypts a small plaintext under a named key and returns ciphertext that identifies the key version and carries what is needed to decrypt it later.",
    d: "The caller sends a key identifier, plaintext up to a small size limit, and optional context. After authentication and policy checks, the engine picks the current primary version, generates a fresh nonce, runs authenticated encryption and returns a self-describing blob with the key identifier, version and algorithm. The plaintext size is capped because the service is not a bulk data pipe. Hard parts are that nonce handling must never repeat for a key, that the limit forces callers into envelope encryption, and that logs must never capture request bodies.",
    k: ["Small direct encrypt vs envelope-only: direct is simple for secrets and short fields, but its size cap and per-call cost make it unsuitable for bulk data.", "Service-chosen nonce vs caller-supplied: service-chosen removes a catastrophic misuse, while caller-supplied allows deterministic encryption that the service must guard separately."],
    p: ["Using direct encrypt for large files saturates quotas and makes the service a bottleneck.", "Request bodies written into debug logs turn the key service into a plaintext store."],
    v: "Encrypt the same plaintext twice and confirm the ciphertexts differ and both decrypt correctly. Send a payload over the limit and confirm a size error, not truncation.",
    dep: ["aead-engine","key-policies","encryption-context","ciphertext-format","key-versions"]
  },
  "decrypt-api": {
    s: "Takes ciphertext produced by the service, finds the right key and version from its header, checks authorization and context, and returns the plaintext.",
    d: "The service parses the ciphertext header to learn the key identifier and version, so callers need not name the key. It verifies that the key is enabled, that policy allows the caller to decrypt, and that the supplied context matches the one used at encryption. Then the engine decrypts and authenticates. Any mismatch returns one generic error to avoid giving an oracle. It is hard because decrypt is the highest-volume, most latency-sensitive call, and each failure mode, such as wrong context, disabled key or tampered data, must be distinguishable in logs but not to attackers.",
    k: ["Key inferred from ciphertext vs named by caller: inference simplifies rotation and migrations, but a caller must then be authorized for whatever key the header names.", "Distinct error messages vs one generic failure: distinct errors help debugging, while generic ones deny padding-oracle style probing."],
    p: ["Returning different errors for bad padding and bad tag lets an attacker decrypt chosen ciphertext byte by byte.", "A decrypt with a key policy change in flight succeeds on one replica and fails on another."],
    v: "Decrypt valid ciphertext with correct context and confirm plaintext. Then change one byte, change the context, and disable the key, and confirm each fails and shows its true cause only in the audit log.",
    dep: ["aead-engine","key-policies","encryption-context","ciphertext-format","key-lookup-index"]
  },
  "generate-data-key": {
    s: "Creates a new random data key and returns it both in plaintext and wrapped under a named key, in one call, so the caller can encrypt locally and store only the wrapped copy.",
    d: "The engine draws a random key from the approved random source, wraps it under the requested key's current version with the given context, and returns both. A variant returns only the wrapped key for callers that encrypt later, such as a backup process that must not hold plaintext now. The key length and algorithm are parameters. It is hard because the plaintext key crosses the boundary once and then is the caller's problem, so response handling, memory wiping and size of the random request all matter.",
    k: ["Return plaintext and wrapped together vs wrapped only: returning both saves a call for immediate encryption, while wrapped-only keeps plaintext out of processes that never need it.", "Service-generated vs caller-generated data keys: service generation guarantees quality randomness, but caller generation avoids a call per key."],
    p: ["Plaintext key in a response logged by a tracing middleware is a leaked key.", "Generating keys with an oversized request count exhausts the entropy pool and slows other tenants."],
    v: "Call it, unwrap the wrapped copy through the decrypt path, and confirm the bytes equal the returned plaintext. Call it 1,000 times and confirm no two plaintext keys repeat.",
    dep: ["entropy-rng","wrap-unwrap-api","key-encrypting-keys","encryption-context"]
  },
  "reencrypt-api": {
    s: "Decrypts ciphertext and re-encrypts it under a different key or version entirely inside the service, so the plaintext never reaches the caller.",
    d: "The caller supplies ciphertext, the source context and a destination key and context. The service authorizes both sides, decrypts in memory, and encrypts under the new key without returning plaintext. This is the tool for migrating data between keys, moving ownership, or finishing a rotation. Both operations are logged as one action with two keys. It is hard because the call needs permission on two keys, which are often owned by different parties, and because bulk migrations at scale must be throttled and resumable.",
    k: ["In-service re-encryption vs decrypt then encrypt at the client: in-service keeps plaintext off the network and out of the client, but costs service capacity and caps throughput.", "Re-encrypt data keys only vs the full data: wrapping new keys around the same data is cheap and fast, while re-encrypting data truly removes the old key's access."],
    p: ["A migration job that fails halfway leaves data under mixed keys with no record of which is which.", "Missing permission on the destination key is found only after thousands of objects are done."],
    v: "Re-encrypt a ciphertext from key A to key B, confirm the old key can no longer decrypt the output and key B can, and confirm the caller never received plaintext.",
    dep: ["decrypt-api","encrypt-api","identity-policy-evaluation"]
  },
  "sign-verify-api": {
    s: "Creates and checks digital signatures with asymmetric keys held in the service, so private keys never leave and callers sign digests or messages by reference.",
    d: "A caller sends a message or a digest and a key identifier; the engine signs inside the protected boundary with the chosen scheme and returns the signature. Verification can run in the service or offline with the public key, which the service exports on request. Key usage is restricted to signing, so the same key cannot decrypt. The difficulty is volume and latency, since asymmetric operations are slow, and misuse: signing a caller-chosen digest means the service cannot see what is being signed.",
    k: ["Sign digests vs sign full messages: digests avoid sending large data, but the service cannot inspect or log what was signed.", "Online verification vs distributing public keys: online is simple and revocable, while public keys scale verification to any system with no service dependency."],
    p: ["A signing key used for both documents and code signing lets a signature for one purpose be replayed as the other.", "Callers verify with a cached public key after the key was rotated out or revoked."],
    v: "Sign a message, verify it with the exported public key using an independent library, then alter one byte and confirm verification fails. Try to decrypt with the signing key and confirm refusal.",
    dep: ["asymmetric-engine","usage-constraints","key-policies","key-versions"]
  },
  "mac-api": {
    s: "Generates and verifies message authentication codes with a symmetric key held in the service, for integrity checks where no confidentiality is needed.",
    d: "The caller sends a message and a key identifier and receives a short tag; verification recomputes and compares in constant time. A MAC key is separate from encryption keys, with usage restricted. It suits tokens, cookies, webhooks and deduplication hashes where the verifier is also the creator. Because MAC keys are symmetric, anyone who can verify can forge, so permissions must keep creators and verifiers deliberately the same party. Hard parts are choosing the algorithm and length and deciding what to do when a rotated key invalidates outstanding tags.",
    k: ["MAC in the service vs a local HMAC key: service-held keys never appear in application memory, while a local key avoids a network call on every token check.", "Verifying against all active versions vs only the newest: all versions allow smooth rotation, but widen the window a retired key still works."],
    p: ["Short truncated tags make forgery feasible at high request volume.", "Rotating a MAC key without an overlap invalidates every outstanding signed cookie at once."],
    v: "Generate a tag, verify it, change one byte of the message and confirm verification fails. Rotate the key and confirm old tags verify during the overlap and fail after it.",
    dep: ["key-types","usage-constraints","key-versions"]
  },
  "wrap-unwrap-api": {
    s: "Encrypts and decrypts other keys, with metadata binding them to a context, so key material can be stored or moved outside the service while protected by a key inside it.",
    d: "Wrapping uses an authenticated mode designed for key material, with the key's purpose and context included in the integrity check. It is the primitive under data key generation, key export to a partner, and import of external key material. The service exposes it separately from general encrypt to permit tighter policy: a principal that may unwrap a data key may not decrypt arbitrary data. The hard part is that wrapped keys are long-lived, so formats and algorithms must remain decodable for the lifetime of the data they protect.",
    k: ["Dedicated key-wrap algorithm vs general encryption of key bytes: purpose-built wrapping is deterministic and misuse-resistant, but is a separate code path to maintain.", "Wrap with context binding vs without: binding prevents a wrapped key being used outside its intended resource, but makes cross-system sharing need the exact context."],
    p: ["Allowing arbitrary callers to unwrap lets any holder of a wrapped key obtain plaintext, bypassing per-object checks.", "Wrapped keys stored without version information cannot be unwrapped after the algorithm is retired."],
    v: "Wrap a test key, unwrap it with the same context and compare bytes. Unwrap with a different context and confirm failure, and confirm a principal lacking unwrap permission is denied.",
    dep: ["aead-engine","key-encrypting-keys","usage-constraints"]
  },
  "random-bytes-api": {
    s: "Returns cryptographically strong random bytes generated inside the protected boundary, for callers that lack a trustworthy local source.",
    d: "The engine reads from the hardware-backed random generator, mixes with other sources, and returns up to a small cap per call. It is used by constrained devices, virtual machines with poor entropy and by workloads that must show a certified source. Output is never stored. The challenge is cost and abuse: a random source is a shared resource, a request for large amounts starves key generation, and a caller cannot verify the quality of what they receive, so trust rests on the service's certification.",
    k: ["Service randomness vs the operating system source: the service can be certified and audited, while the local source avoids latency and a network dependency.", "A strict cap per call vs streaming: a cap protects the shared pool, but callers needing more must make many calls."],
    p: ["Using the call as the source for all application randomness adds latency to hot paths and burns quota.", "Treating returned bytes as secret and then logging them for debugging."],
    v: "Request 32 bytes ten thousand times and confirm no repeats and a passing statistical test suite. Request above the cap and confirm a clear refusal.",
    dep: ["entropy-rng","quotas-throttling"]
  },
  "encryption-context": {
    s: "Non-secret key-value pairs bound to a ciphertext as authenticated data, which must be supplied again at decrypt and let policy and audit reason about what the data is.",
    d: "At encryption the caller names context such as tenant, table or object path. The context is included in the authenticated data, not stored inside the ciphertext, so decrypt fails unless the same pairs are presented. Policy conditions can require or match specific pairs, and the audit log records them. It makes ciphertext non-transferable between resources and gives investigators the meaning of each use. It is hard because context must be reproducible at read time, and developers put secrets or high-cardinality noise in it.",
    k: ["Mandatory context with policy matching vs optional: mandatory context blocks confused-deputy and swapping attacks, but breaks callers that cannot reconstruct it.", "Rich context vs minimal context: rich context improves audit, but is logged in plaintext and must never contain sensitive values."],
    p: ["Context containing a changing value such as a timestamp makes data undecryptable once it is lost.", "Placing personal data in context copies it into every log and trail."],
    v: "Encrypt with a table-and-tenant context, decrypt with the same pairs and confirm success. Decrypt with a different tenant and confirm failure, and confirm the audit entry shows the supplied context.",
    dep: ["aead-engine","policy-conditions"]
  },
  "ciphertext-format": {
    s: "The versioned binary layout of everything the service returns: header with format version, key identifier and version, algorithm, nonce, ciphertext and authentication tag.",
    d: "A self-describing header lets decrypt find the right key and algorithm without a side database, and lets the format evolve. Every field that affects interpretation is covered by the authentication tag, so a header cannot be edited to downgrade the algorithm. Data lives longer than software, so decoders must remain for every format ever issued. It is hard because there is no recall: a mistake in a format used at scale is permanent, and fields added later must be optional to older readers.",
    k: ["Self-describing header vs an external metadata record: a header keeps data portable and independent of a database, but exposes key identifiers and costs bytes per object.", "Authenticating the header vs only the body: authenticating prevents downgrade and swap attacks, at the price of rejecting any edit, including legitimate migration tools."],
    p: ["Parsing code that accepts unknown versions leniently lets an attacker select the weakest decoder.", "Dropping support for an old format strands data that still exists in archives."],
    v: "Decode a sample of every format version ever issued with the current decoder and confirm round-trip. Modify the algorithm field of one and confirm authentication fails.",
    dep: ["aead-engine","algorithm-agility"]
  },
  "key-creation": {
    s: "Creates a new key with a chosen type, usage, policy, origin and metadata, returning its identifier but never the material.",
    d: "A request names the key type and permitted usage, the initial policy, whether the material is generated in the service or imported, optional tags and the region. The service validates and records the key, generates material in the protected boundary, assigns an identifier and writes the audit event. Defaults matter: most keys keep their initial settings forever. Hard parts are that creation permission is powerful, since a key can hold data hostage, and that keys created for tests accumulate with no owner.",
    k: ["Safe defaults with few knobs vs full configurability: defaults prevent weak keys, while many options serve specialists but invite misconfiguration.", "Create-and-use immediately vs a waiting state: immediate use is convenient, but a pending state lets policy and replication settle before data depends on the key."],
    p: ["Keys created without an owner tag cannot be attributed and are never deleted.", "A default policy that grants the creating account broad access silently over-shares the key."],
    v: "Create a key with minimal options, then confirm the stored policy, usage, origin and tags match the request and that an audit event records creator and region, with no material in the response.",
    dep: ["key-generation","key-policies","key-types","metadata-store","audit-log"]
  },
  "key-administration": {
    s: "Operations that change a key after creation: update policy, enable or disable, schedule deletion, enable rotation, and change description or aliases, each separately permissioned.",
    d: "These calls manage the key and never use it, which lets a security team administer keys they cannot decrypt with. Each change is validated against rules such as not removing the last administrator, then versioned and logged. Changes propagate to all serving replicas, with a delay that has to be bounded and documented. It is hard because administrative permission over a key is nearly equivalent to using it, since a policy edit can grant usage, so the separation holds only if policy changes are themselves tightly controlled.",
    k: ["Admin without use permission vs combined roles: separation reduces insider risk, but requires two roles to do routine work and may block emergency response.", "Immediate propagation vs eventual: immediate gives revocation guarantees, while eventual is cheaper and cross-region friendly."],
    p: ["A policy edit that removes all administrators locks the key permanently.", "Admins assume a disable takes effect instantly, while replicas serve the old state for seconds."],
    v: "Disable a key, then immediately call decrypt from every region and record the time until every call is denied. Confirm that time is inside the documented propagation bound.",
    dep: ["key-policies","key-states","metadata-store","audit-log"]
  },
  "aliases": {
    s: "Stable, human-readable names that point to a key, so applications and configuration refer to a purpose such as an application name while the underlying key can change.",
    d: "An alias is a mutable pointer from a name in a namespace to a key identifier. Callers use the alias in API requests, and the service resolves it before authorization. Repointing an alias is how a team swaps a key without redeploying code. Aliases are scoped to a tenant and region and have their own permissions. It is hard because resolution adds a lookup to every request, and because repointing changes what existing code encrypts to without changing the code.",
    k: ["Aliases in application config vs raw identifiers: aliases decouple code from key identity and ease migration, but add an indirection that can be repointed by someone with alias permission.", "Alias resolved at call time vs pinned at deploy: call-time follows changes at once, pinned makes behavior reproducible."],
    p: ["Permission on an alias is treated as less sensitive than permission on the key, and repointing sends data to an attacker's key.", "Deleting an alias breaks configuration that nobody tracked."],
    v: "Repoint an alias from key A to key B and confirm new encrypts use B while older ciphertext still decrypts through A. Confirm that a principal without alias permission cannot repoint.",
    dep: ["key-lookup-index","identity-policy-evaluation"]
  },
  "tags-labels": {
    s: "Key-value metadata attached to keys for ownership, cost allocation, environment and policy conditions, searchable and changeable without touching the key.",
    d: "Tags are stored with key metadata, indexed for search and exposed in billing, inventory and audit. They can also drive policy: allow access where the key's team tag matches the caller's team, which scales authorization to thousands of keys without editing each policy. Limits on count and size keep them cheap. It is hard because tags that control access are a security surface, since anyone who can change a tag can change who has access, and because naming discipline decays without enforcement.",
    k: ["Tag-based access control vs per-key policies: tags scale to large fleets with few policies, but permission to edit tags becomes equivalent to permission to grant access.", "Free-form tags vs enforced schema: enforcement keeps inventory usable, while free-form is easy and drifts."],
    p: ["Anyone allowed to tag keys can add the tag that unlocks them.", "Missing owner tags make orphaned keys indistinguishable from critical ones at deletion time."],
    v: "Write a policy that allows decrypt only where tag team equals the caller's team. Change the tag on a key and confirm access moves with it, then confirm a principal without tag permission cannot do so.",
    dep: ["metadata-store","policy-conditions"]
  },
  "describe-list": {
    s: "Read-only calls that return key metadata, state, policy, rotation status and aliases, and list keys with filters, without exposing key material.",
    d: "Describe returns a record: identifier, creation time, usage, origin, state, versions, rotation settings, region and tags. List pages through keys in a tenant with filters on state, alias, tag or age. These calls feed inventory, scanners and consoles, so they see far more traffic than creation does. They need their own permission and rate limits, since metadata leaks the shape of a customer's infrastructure. Hard parts are consistency, because a just-changed key may describe stale, and pagination over a large changing set.",
    k: ["Strongly consistent describe vs eventually consistent: strong shows the true state after a change but costs more, while eventual scales for scanners.", "Rich metadata exposure vs minimal: rich records power inventory, but reveal ownership and usage to anyone with list permission."],
    p: ["Inventory tools poll every key frequently and consume the quota meant for production calls.", "Listing by a broad permission reveals key names that disclose project secrets."],
    v: "Create a key, then list with a filter on its tag and confirm it appears. Change its state and confirm describe shows the new state within the documented consistency bound.",
    dep: ["metadata-store","key-lookup-index","quotas-throttling"]
  },
  "bulk-provisioning": {
    s: "Declarative and scripted creation of many keys with consistent policy, tagging and rotation, so fleets of keys are made by pipelines rather than by hand.",
    d: "Infrastructure definitions describe keys, aliases, policies and grants as code. A provisioning tool reconciles the desired state with the service by calling the control plane, using idempotency tokens so reruns do nothing. Policy templates stamp the same separation of duties on every key. This is how teams reach hundreds of keys with uniform control. It is hard because reconciliation can destroy: a changed definition may replace a key, and a deleted definition may schedule deletion of one still protecting live data.",
    k: ["Keys managed as code vs created interactively: code gives review, history and uniformity, but turns a bad commit into a mass change.", "Replace-on-change vs update in place: replacement is simple for the tool, while update in place is the only safe behavior for keys with data."],
    p: ["A refactor renames a resource and the tool plans to delete and recreate the key.", "The pipeline's identity holds both create and delete permissions on every key it manages."],
    v: "Apply a definition twice and confirm the second run changes nothing. Rename a resource in a dry run and confirm the plan flags a key replacement for human approval.",
    dep: ["key-creation","key-administration","retries-idempotency"]
  },
});
