// Details for the key management plate, part 3: cryptographic core, hardware, storage.
ATLAS.details("key-management", {
  "request-router": {
    s: "The front stage of the data plane: terminates connections, authenticates, resolves aliases, checks policy and quotas, then dispatches the operation to a node that can run it.",
    d: "Requests arrive over an authenticated, encrypted channel. The router parses and validates input, resolves the key identifier, loads metadata, evaluates authorization and quotas, and picks an engine node that holds or can fetch the key. It stamps a request identifier used in every later log. Responses are generic on failure. It is stateless so it scales out. It is hard because it is the one component every operation passes through, so latency, parsing bugs and overload behavior affect all customers, and it must shed load without dropping legitimate decrypts first.",
    k: ["Authorize before decrypt vs inside the engine: authorizing in the router keeps the engine small, but a bypass of the router reaches key material directly.", "Routing to a node with the key cached vs any node: affinity raises cache hit rates, while any-node simplicity costs more unwraps and misses."],
    p: ["Input parsing flaws in the router expose the whole fleet, so it needs the strictest fuzzing.", "Overload handling that rejects at random drops the high-value decrypts along with the low."],
    v: "Send malformed and oversized requests at high rate and confirm clean rejection with no crash, while a concurrent legitimate decrypt stream keeps its success rate and latency.",
    dep: ["caller-authentication","identity-policy-evaluation","quotas-throttling","key-lookup-index","crypto-provider"]
  },
  "crypto-provider": {
    s: "The module that exposes a uniform interface to cryptographic primitives and delegates to hardware or software back ends, so the rest of the service never calls an algorithm directly.",
    d: "Callers ask for an operation, such as authenticated encrypt with this key handle and these parameters. The provider selects the back end that holds that key, hardware for protected keys and software for cached ones, enforces approved algorithms and sizes, and returns the result. It hides differences in session handling and error codes. All key use funnels through it, which makes it the right place for mandatory logging and limits. It is hard to keep thin: each back end has quirks, and leaking them upward couples the service to one vendor's device.",
    k: ["Abstraction over several back ends vs coding directly to one: abstraction allows hardware changes and tiered protection, but hides performance differences and adds a layer to test.", "Allow-list of approved algorithms vs permitting any the back end offers: an allow-list prevents misuse, but needs a change for each new algorithm."],
    p: ["A back end quirk, such as different padding behavior, causes ciphertext from one back end to fail on another.", "A fallback to software when hardware errors out silently weakens the protection of keys."],
    v: "Run the same test vectors through each back end and confirm identical outputs. Fail the hardware back end and confirm the service reports errors for hardware-protected keys instead of using software.",
    dep: ["aead-engine","asymmetric-engine","hsm-fleet","software-protected-keys"]
  },
  "aead-engine": {
    s: "Performs authenticated encryption of data and keys with approved ciphers, binding associated data so tampering or context mismatch is detected before any plaintext is released.",
    d: "The engine takes a key handle, nonce, plaintext and associated data, and returns ciphertext and a tag; decrypt checks the tag first and returns plaintext only on success. Nonces are generated randomly or from a counter, with limits on how many messages a key version may encrypt before it must be retired. Tags are compared in constant time. It is hard because misuse is catastrophic and quiet: a repeated nonce under one key leaks plaintext relationships and, for some modes, the authentication key itself.",
    k: ["Random nonces vs counter-based: random needs no state across nodes but limits messages per key by birthday bounds, while counters need coordination and allow far larger volumes.", "Nonce-misuse-resistant mode vs the fastest mode: resistant modes survive a nonce error, at some speed and compatibility cost."],
    p: ["Two nodes with synchronized counters produce the same nonce under one key after a failover.", "Releasing partial plaintext before the tag check completes enables chosen-ciphertext attacks."],
    v: "Run published test vectors, then encrypt the same message ten million times under one key in a test and confirm no nonce repeats. Flip one bit anywhere in the output and confirm no plaintext is returned.",
    dep: ["entropy-rng","side-channel-hardening","key-types"]
  },
  "asymmetric-engine": {
    s: "Runs signing, verification and key agreement or encryption with public-key keys inside the protected boundary, with approved schemes and sizes.",
    d: "The engine holds private keys as handles and performs the expensive operations: signing a digest, decrypting a small key with the private half, or deriving a shared secret. It validates inputs, such as checking that a curve point is on the curve, before using them. Public keys are exported as standard encodings. Operations are an order of magnitude slower than symmetric ones, so capacity planning is dominated by them. It is hard because failure modes are subtle: bad padding checks, faulty randomness in signing and invalid-input attacks all recover private keys.",
    k: ["Deterministic vs randomized signing: deterministic removes dependence on good randomness per signature, while randomized is the established form and resists some fault attacks.", "Offering legacy padding schemes vs modern only: legacy supports old partners, but keeps known weak constructions available."],
    p: ["Accepting unvalidated public inputs enables attacks that extract the private key one query at a time.", "Throughput planned from symmetric benchmarks leaves signing queues overflowing at peak."],
    v: "Check signatures against an independent verifier, send malformed points and padding to confirm clean rejection with uniform timing, and measure peak signing rate against the planned figure.",
    dep: ["hsm-throughput","side-channel-hardening","entropy-rng","key-types"]
  },
  "key-derivation": {
    s: "Derives many independent subkeys from one parent key with a key-derivation function, so one stored key can yield separate keys per purpose, tenant or object.",
    d: "A derivation takes a parent key, a salt and context labels, and outputs keys of the requested length. Different labels give unrelated outputs, and the parent cannot be computed from a child. Services use it to produce per-tenant, per-record or per-session keys without storing them, and to extend a root's life without more hardware slots. Derivation is deterministic, so the same inputs recreate the same key. It is hard because the labels become part of the security design, and a collision or reuse of a label gives two purposes the same key.",
    k: ["Derive on demand vs store each key: derivation saves storage and allows recreating keys anywhere, but rotating needs the parent's version in the inputs and cannot revoke a single child.", "Domain-separating labels in a fixed format vs free text: fixed formats prevent collisions, free text is flexible and ambiguous."],
    p: ["Two features pick the same label string and silently share a key.", "Deriving from a parent with no version in the input makes parent rotation break every child."],
    v: "Derive keys with two different labels and confirm they differ, derive twice with the same inputs and confirm equality, and confirm the parent's value is not recoverable from outputs in a test harness.",
    dep: ["aead-engine","key-types"]
  },
  "entropy-rng": {
    s: "The random number generation chain: hardware noise sources, health tests, conditioning and a deterministic generator that produces the bits for keys, nonces and challenges.",
    d: "A physical noise source feeds a conditioner and a seeded generator. Continuous health tests watch for stuck or biased output and halt generation on failure. Output is partitioned per consumer so a request for random bytes cannot influence key generation. On virtual machines, the generator must be reseeded after a snapshot restore or clone. All keys are only as strong as this chain, and its failures are invisible in output. It is hard because verifying quality means trusting tests, certification and the hardware's design.",
    k: ["Dedicated hardware generator vs the host operating system's: dedicated is certifiable and isolated from host compromise, while host sources scale and depend on the platform being sound.", "Halting on a failed health test vs degrading: halting protects keys but is an outage, while degrading keeps service running with unknown-quality bits."],
    p: ["A cloned virtual machine image resumes with the same generator state and emits the same bits as its twin.", "Health test thresholds set so loose that real failures pass."],
    v: "Pull ten million bits from each node and run a standard randomness test suite. Simulate a stuck noise source on a test unit and confirm generation halts and an alarm fires.",
    dep: ["hsm-fleet"]
  },
  "algorithm-agility": {
    s: "The ability to change ciphers, key sizes and formats over time without breaking existing data: versioned algorithms, decoders for old ones and a managed path to retire them.",
    d: "Every ciphertext and key records its algorithm identifier in an authenticated header. The service maintains an allow-list for new operations and a longer one for decryption. When an algorithm weakens, it moves to decrypt-only, then to a migration campaign using re-encrypt, then to removal. Negotiation is by policy at the service, not by the caller, to prevent downgrade. It is hard because data outlives algorithms by decades, and because every supported algorithm is code that must be maintained and defended.",
    k: ["Service-chosen algorithm vs caller-chosen: service choice allows upgrades without client change, while caller choice gives control and permits downgrade or mistakes.", "Long decrypt-only tail vs early forced migration: a tail preserves data but keeps weak code live, early migration cleans up and risks stranded data."],
    p: ["A deprecated algorithm stays selectable by default because no one changed the default.", "Agility without header authentication allows an attacker to choose the weakest accepted algorithm."],
    v: "Mark a test algorithm decrypt-only, confirm encryption with it is refused and old ciphertext still decrypts, then run a re-encrypt campaign and confirm zero items remain on the old identifier.",
    dep: ["ciphertext-format","key-types","reencrypt-api"]
  },
  "side-channel-hardening": {
    s: "Techniques that stop secrets leaking through timing, cache behavior, power, faults or error messages: constant-time code, blinding, uniform errors and isolation from other workloads.",
    d: "Secret-dependent branches and table lookups are avoided or masked. Comparisons run in constant time. Asymmetric operations use blinding. Errors and response times are normalized so failures do not reveal which check failed. Hardware modules add physical countermeasures, and software engines run on dedicated hosts to avoid sharing caches with untrusted code. It is hard because correctness tests do not see the leak: code that passes every test can reveal a key to an attacker who measures microseconds, and compilers and processors may undo careful source code.",
    k: ["Dedicated hosts for software crypto vs shared multi-tenant hosts: dedicated hosts remove co-resident observers, but cost more and lower utilization.", "Constant-time implementations vs fast variable-time ones: constant-time is the only safe default for secrets, with a speed cost that is small today."],
    p: ["A compiler optimization reintroduces a branch on secret data after a version upgrade.", "Verbose errors during an outage reveal which step of decryption failed."],
    v: "Measure response time of decrypt across valid, tampered and wrong-context ciphertexts at nanosecond resolution and confirm no statistically significant difference between failure types.",
    dep: ["crypto-provider"]
  },
  "post-quantum": {
    s: "Support for algorithms believed to resist quantum attack, usually combined with classical ones in a hybrid so security holds if either is broken, and a plan for migrating stored keys.",
    d: "The service adds new key types and signature and key-establishment schemes through the same API, often as hybrids that run a classical and a new algorithm together. Larger keys and signatures change sizes in formats and in storage. Data encrypted today may be recorded and attacked later, so key wrapping and long-lived secrets matter first. Symmetric keys need only longer lengths. It is hard because the new schemes are young, performance and sizes differ, and the migration of every stored signature or wrapped key is a multi-year effort.",
    k: ["Hybrid construction vs new algorithm alone: hybrid stays safe if the new scheme is flawed, but costs size and speed and complicates verification.", "Migrating wrapping keys first vs all keys: wrapping keys protect long-lived data against recorded traffic, while signature migration can follow certificate lifetimes."],
    p: ["Fixed-size fields in formats or hardware cannot hold the larger keys and signatures.", "Assuming the new scheme is secure and removing the classical one before it has had years of analysis."],
    v: "Create a hybrid key, wrap a data key, and confirm unwrap succeeds only when both components are correct by corrupting each part in turn and seeing failure each time.",
    dep: ["algorithm-agility","asymmetric-engine","key-types","ciphertext-format"]
  },
  "hsm-fleet": {
    s: "The set of tamper-resistant hardware modules, in each region, that hold top-level keys and perform operations on them, managed as a pool with spares and health checks.",
    d: "Each module generates and stores keys in protected memory and refuses to export them except wrapped. Modules sit behind a local service that load-balances operations, tracks session counts and removes unhealthy units. Keys are synchronized between modules in a cluster by secure cloning, so any unit can serve. The fleet is sized for peak operation rate with spare units for failure and maintenance. It is hard because hardware is a scarce, slow, expensive and opaque dependency: a module failure loses nothing only if its keys were already cloned.",
    k: ["Many modules each holding all keys vs sharding keys across modules: replicas give availability and simple routing, while sharding scales key count at the cost of lost keys on failure.", "Own hardware vs rented partitions: owning gives control and the roots under your custody, while renting is flexible and has less visibility."],
    p: ["A new module is added to the pool before its key sync finishes and operations fail on it.", "Spare capacity is consumed by growth, so a single failure causes throttling."],
    v: "Remove one module from service during peak load and confirm no decrypt errors, rising latency within the target, and that its keys are available on the others. Restore it and confirm resync.",
    dep: ["hsm-partitions","hsm-attestation","hsm-throughput","entropy-rng"]
  },
  "hsm-partitions": {
    s: "Logical divisions of a module or cluster, each with its own authentication, key store and policies, used to separate roles, regions or high-assurance tenants.",
    d: "A partition is an isolated container inside the hardware with its own administrators and users and its own capacity limit. The service uses separate partitions for different purposes, such as one for domain keys and another for customer-dedicated keys. Dedicated partitions let a customer hold exclusive authentication credentials. Partition boundaries are enforced by the device, not by software. Hard parts are fixed resource limits per partition, which cap key count, and the credentials, which must be created, stored and rotated like any other secret.",
    k: ["Dedicated partitions per sensitive tenant vs a shared partition: dedicated gives cryptographic and credential separation, but uses scarce capacity and raises cost.", "Fewer large partitions vs many small: fewer are simpler to manage, many give finer blast-radius control."],
    p: ["A partition fills its key slots and refuses new keys in production.", "Partition credentials stored beside the service they protect."],
    v: "From a service identity assigned to partition A, attempt to use a key in partition B and confirm the device itself refuses, regardless of service-side checks.",
    dep: ["hsm-fleet","operator-quorum"]
  },
  "hsm-attestation": {
    s: "Cryptographic proof from a module that a key was generated or is held inside genuine, correctly configured hardware, verifiable by a third party using the manufacturer's certificate chain.",
    d: "The device signs a statement about a key, including its attributes and that it is non-exportable, with an attestation key chained to the manufacturer. A verifier checks the chain and statement. Services publish attestations so customers can confirm where their keys live, and use them to verify the transport key for imports. Attestation also covers firmware version and configuration. It is hard because it proves a state at a moment and relies on the chain's trust, and verifiers tend to check that a signature exists rather than what it says.",
    k: ["Publishing attestations for each key vs on request: publishing gives continuous assurance, while on request limits exposure of internal topology.", "Verifying the full chain and attributes vs only the signature: full checking is the point, and requires keeping revocation data current."],
    p: ["A verifier accepts an attestation whose key attributes allow export.", "Expired manufacturer certificates cause valid attestations to fail verification."],
    v: "Obtain an attestation for a test key, verify the chain with an independent tool, and confirm the statement says non-exportable. Tamper one byte and confirm the verification fails.",
    dep: ["hsm-fleet","hsm-firmware"]
  },
  "hsm-firmware": {
    s: "The signed software inside each module and the controlled process for updating it, since the firmware defines what the device will and will not do with keys.",
    d: "Firmware is signed by the manufacturer, and modules refuse unsigned images. Updates go through staged rollout: one module out of rotation, updated, tested against vectors, returned, then the next. Security fixes may require quorum authorization on the device. Version drift across the fleet is tracked because attestation exposes it. It is hard because an update can reset or wipe a module if mishandled, a defect in firmware is a defect in the root of trust, and the vendor's release cadence is outside the service's control.",
    k: ["Rapid patching vs conservative holding: rapid patching closes vulnerabilities, while holding keeps validated configurations and certification status.", "Rolling update with rollback vs update all together: rolling limits risk, and needs capacity for the module out of rotation."],
    p: ["An update clears device memory because key synchronization was not completed first.", "Firmware newer than the certified version quietly voids a compliance claim."],
    v: "Update one module in a test cluster, confirm vectors pass and keys remain, check attestation reports the new version, and confirm the service routed around the module throughout with no errors.",
    dep: ["hsm-fleet","operator-quorum","rollout-safety"]
  },
  "operator-quorum": {
    s: "Device-enforced authentication of administrators using physical tokens or cards held by separate people, with M-of-N approval for sensitive operations such as key export, restore and firmware update.",
    d: "Administrative actions on the hardware require several credential holders to authenticate in person or through a controlled path. The device itself checks the threshold, so software cannot skip it. Tokens are stored in separate safes and each holder has a PIN. Roles divide operators and security officers. It is used in ceremonies, bring-up, recovery and updates. It is hard because it depends on people being available, trained and honest, and because losing too many tokens permanently locks the device and its keys.",
    k: ["Higher quorum threshold vs lower: higher thresholds resist collusion and coercion, while lower thresholds keep operations possible when people are absent.", "Physical tokens in safes vs remote authentication: physical custody is harder to steal remotely, and slower for recovery across regions."],
    p: ["Custodians retire, travel or lose tokens, and the quorum is unreachable during an incident.", "PINs written on the token sleeve."],
    v: "Attempt a protected action with one fewer credential than the threshold and confirm the device refuses. Complete it with the threshold present and confirm the device log names each participant.",
    dep: ["hsm-fleet","key-ceremony"]
  },
  "hsm-throughput": {
    s: "The limits on operations per second and concurrent sessions per module, which set the capacity of every operation that must run in hardware and shape caching design.",
    d: "Hardware performs thousands of symmetric and hundreds of asymmetric operations per second, with limited concurrent sessions and fixed key slots. The service pools sessions, batches work, and keeps hot keys in a cache so most requests never reach the device. Capacity is planned by operation type, since signing with a large key costs far more than unwrapping. Overload shows as queueing and timeouts. It is hard because the device is a fixed, slowly scalable resource and a cache miss storm after restart sends the full demand at it.",
    k: ["Operate in hardware per request vs unwrap into software memory: per request keeps keys inside the boundary and caps throughput, while unwrapping scales and exposes keys to host memory.", "Session pooling vs session per request: pooling avoids setup cost and needs careful handling of device state."],
    p: ["A deploy that clears caches on every node sends a simultaneous burst to hardware and stalls it.", "Capacity measured on one operation type misses a mixed workload."],
    v: "Load test with a realistic mix until latency rises, record operations per second per module, and confirm production demand with the cache cold stays below that number.",
    dep: ["hsm-fleet","material-cache"]
  },
  "software-protected-keys": {
    s: "A lower-assurance tier where key material is protected by software isolation and encryption under a hardware-held key, trading some resistance to a host compromise for speed and scale.",
    d: "Keys are unwrapped into memory of hardened processes with no debug access, locked from swap and core dumps, in confidential compute environments where available. The top-level wrapping key remains in hardware. Throughput scales with ordinary servers. This tier serves most customer keys, while the hardware-resident tier is for those whose requirements demand it. It is hard because the guarantees differ and customers must understand how: a host compromise could expose software-protected keys that hardware keys would have resisted.",
    k: ["Software tier for volume vs hardware for everything: software handles high-rate workloads economically, and weaker against a compromised host.", "Memory isolation by process vs by hardware-assisted enclave: enclaves narrow the trusted code, at the cost of tooling and debugging difficulty."],
    p: ["Memory with key material written to a core dump during a crash.", "The assurance difference between tiers is not stated on the key, and customers assume the stronger one."],
    v: "Force a crash of an engine process in test and search the dump and swap for known test key bytes; none may be found. Confirm key metadata states the protection tier.",
    dep: ["material-cache","key-encrypting-keys","hsm-fleet"]
  },
  "fips-validation": {
    s: "Independent certification of the cryptographic modules, algorithms and random generation against published standards, which many regulated customers require before they will store keys.",
    d: "Hardware modules and software libraries are tested by accredited laboratories and listed with a certificate number, version and security level. The service uses only certified versions in approved mode and tracks when certificates expire or become historical. Validation covers the module, not the whole service, so the claim must be worded carefully. It restricts algorithm choices and update speed. It is hard because certification trails releases by months, so security fixes can conflict with staying certified.",
    k: ["Staying on certified versions vs applying the newest fix: certified versions satisfy contracts, while newest fixes close vulnerabilities sooner.", "Approved mode only vs allowing non-approved algorithms: approved mode keeps the claim valid, and excludes some modern algorithms."],
    p: ["A claim of validation for the service when only one module inside it was validated.", "A certificate moves to historical status and no one notices until a customer audit."],
    v: "List every module and library in the key-use path with its certificate number and status, check each against the laboratory's public listing, and confirm the running version matches the validated one.",
    dep: ["hsm-fleet","hsm-firmware","crypto-provider"]
  },
  "metadata-store": {
    s: "The durable database of key records: identifiers, states, policies, versions, aliases, tags, grants and rotation settings, which must be consistent and available for every request.",
    d: "Records are keyed by tenant and key identifier and replicated within the region. The data plane reads them on every request, usually through a cache with short expiry and invalidation on change. Writes are rare and go through the control plane with conditional updates to prevent lost edits. Policy and state live here, so correctness of this store is correctness of authorization. It is hard because it combines a very high read rate with a strict need for fresh state after a change.",
    k: ["Strongly consistent reads for state vs cached eventual reads: strong reads make revocation exact and cost latency and availability, cached reads are fast and delay changes.", "One store for metadata and key material vs separate stores: separate stores allow different protection and scaling, and add a join on the request path."],
    p: ["A policy update committed in the store but not yet invalidated in caches produces an authorization window.", "A schema change applied to the store before all service versions understand it breaks reads."],
    v: "Update a policy and measure from commit until every serving node denies the old behavior, across regions where applicable. Confirm the figure matches the published bound.",
    dep: ["consistency-model","storage-protection","key-lookup-index"]
  },
  "wrapped-key-store": {
    s: "Durable storage of each key version's material in wrapped form, encrypted under a domain key, with integrity checks and multiple copies so no single failure can lose a key.",
    d: "The store holds opaque blobs: the wrapped material, the identifier of the wrapping key and a checksum. It never holds plaintext keys. Writes are acknowledged only after being durably replicated to several failure domains. Reads feed the material cache. Because loss of a blob destroys data permanently for everyone depending on the key, it has the strictest durability goals in the service. It is hard because durability and secrecy pull against each other: more copies mean more places to protect, and deletion must reach all.",
    k: ["Synchronous replication across failure domains vs asynchronous: synchronous guarantees no acknowledged loss but costs write latency, while asynchronous is faster and can lose recent keys in a failure.", "Wrapped blobs beside metadata vs in a separate store: separation limits what a metadata compromise reveals, at the cost of coordination."],
    p: ["A key created and acknowledged but replicated to only one zone, which then fails.", "Deletion removes the primary blob while stale copies remain in replicas and backups."],
    v: "Create a key, destroy the primary copy in a test environment immediately after acknowledgment and confirm the key is still usable from the remaining copies with no data loss.",
    dep: ["domain-keys","storage-protection","consistency-model"]
  },
  "material-cache": {
    s: "A memory-resident cache of unwrapped key material or live hardware handles on engine nodes, sized and protected so that most operations skip storage and unwrapping.",
    d: "On a miss the engine fetches the wrapped key, unwraps it through the hierarchy and caches the result with a time limit. Entries live in locked memory excluded from dumps and are wiped on eviction. Invalidation messages from the control plane evict on disable, rotation or deletion. The hit rate decides latency and hardware load. It is hard because it is a security weakness by construction: plaintext keys sit in memory, and every invalidation path has to work or revoked keys continue to function.",
    k: ["Long cache lifetime vs short: long lifetimes cut hardware load and tail latency, while short lifetimes bound how long a revoked key keeps working.", "Push invalidation vs expiry only: push makes revocation near immediate and needs a reliable channel, while expiry is simple and slower."],
    p: ["A missed invalidation message leaves a deleted key usable until its entry expires or the process restarts.", "Cold cache after a restart wave causes a burst of hardware operations that cascades into failures."],
    v: "Disable a cached key and confirm every node refuses it within the invalidation bound, then drop the invalidation channel in a test and confirm entries still expire within the maximum lifetime.",
    dep: ["wrapped-key-store","key-encrypting-keys","hsm-throughput","software-protected-keys"]
  },
  "consistency-model": {
    s: "The rules for how fast a change to a key's state, policy or versions becomes visible everywhere, and what readers may see in between.",
    d: "Within a region the service chooses per data type: key creation, deletion and state changes use conditional writes with immediate read-after-write for the writer, while serving nodes see changes after cache invalidation within a documented bound. Across regions replication is asynchronous and the bound is longer. The guarantees are published, since customers build their revocation procedures on them. It is hard because stronger guarantees cost availability and latency in the hot path, and weaker ones make a disable not mean disabled yet.",
    k: ["Bounded staleness with published limits vs strict consistency everywhere: bounded staleness keeps decrypt fast and available, and means revocation has a defined delay.", "Read-your-writes for administrators vs global ordering: read-your-writes gives a good experience for the editor, and others may still see old state."],
    p: ["Operators assume disable is instantaneous and skip containment steps for the bound's duration.", "A rollback of a policy change races with caches and leaves nodes on different versions."],
    v: "Make a change in one region, poll the effect from nodes in every region with a timestamped log, and confirm the observed maximum delay is within the published bound across repeated runs.",
    dep: ["metadata-store","key-replication"]
  },
  "backup-restore": {
    s: "Encrypted, versioned copies of metadata and wrapped keys held in separate failure domains and tested restores, so the service can recover from corruption, operator error or loss of a region.",
    d: "Backups are encrypted under keys that are themselves protected by the hierarchy and recoverable only with custodian quorum. They are taken continuously for metadata and periodically for snapshots, retained according to policy and replicated to another region where law permits. Restores are rehearsed regularly into isolated environments. It is hard because backups multiply copies of the most sensitive data, deleted keys must eventually leave backups too, and an untested backup is an assumption.",
    k: ["Backups of wrapped keys in another region vs staying in-region: cross-region survives regional loss, and conflicts with residency promises.", "Long retention vs short: long retention gives recovery from slow-moving errors, while short retention makes deletion real sooner."],
    p: ["A restore fails because the backup's encryption key was in the failed region only.", "Retention outlives the deletion window, so a destroyed key can be restored from a backup by someone with access."],
    v: "Restore the latest backup into an isolated environment, compare key counts and a sample of decrypts against production, record time to restore and check the result falls within the recovery objective.",
    dep: ["wrapped-key-store","metadata-store","storage-protection","operator-quorum"]
  },
  "storage-protection": {
    s: "Layered protection of stored key records: encryption under the hierarchy, integrity checks, restricted network paths and access control that keep a storage compromise from yielding usable keys.",
    d: "The database's own encryption at rest is the last layer, not the first. Records are wrapped by the service before they are written, and carry authenticated identifiers that bind them to the tenant and key. Access from engines uses short-lived credentials over private paths, and operators have no standing read access. Integrity checks detect tampering or swapped rows. It is hard because the storage system itself depends on a key service in many deployments, so the design must avoid circular dependence on itself.",
    k: ["Application-layer wrapping vs relying on the database's encryption: wrapping keeps rows protected from administrators of the store, while database encryption alone trusts it entirely.", "Binding tenant and key identifier into authenticated data vs plain wrapping: binding detects a swapped row, and demands exact identifiers at each read."],
    p: ["The store's own encryption key is in the service it stores keys for, and a cold start cannot read either.", "Operator accounts with broad read access to storage copy raw rows."],
    v: "Swap two rows' wrapped blobs in a test store and confirm decrypt fails integrity rather than returning another key. Dump raw storage and confirm no plaintext key bytes appear.",
    dep: ["domain-keys","wrapped-key-store"]
  },
  "key-lookup-index": {
    s: "The fast index mapping aliases, identifiers and tenants to key records and versions, used on every request to find the key before authorization.",
    d: "A request arrives with an identifier, an alias, or only ciphertext that holds an identifier. The index resolves aliases, finds the record by tenant and identifier, and returns its current state and version pointers. It is cached in memory and replicated. Lookups for nonexistent and unauthorized keys must look the same to the caller. It is hard because it is hit by every request, and because correctness of alias resolution has security effect: a stale alias sends encryption to the wrong key.",
    k: ["In-memory index replicated to each node vs a remote lookup: local is fastest and must stay current, while remote is simpler and adds a network hop to every call.", "Resolving aliases before authorization vs after: before is simpler, while after avoids revealing alias existence."],
    p: ["Timing differences reveal whether a key identifier exists in another tenant.", "A stale index after a repoint sends new encryption to the previous key."],
    v: "Request a nonexistent key and a real key owned by another tenant and confirm identical responses and similar timings. Repoint an alias and measure time until every node resolves to the new key.",
    dep: ["metadata-store"]
  },
});
