// Details for the password manager plate, part 4: key derivation and hierarchy, vault encryption, sync.
ATLAS.details("password-manager", {
  "master-key-derivation": {
    s: "Turns the master password and a per-account salt into a fixed-size key using a deliberately slow, memory-hard function, so each password guess costs an attacker real time.",
    d: "The client feeds the password, the salt and cost parameters into a password-hashing function that consumes many iterations or large amounts of memory. The output is the master key, from which other keys are derived. The salt is unique per account so precomputed tables fail. The cost is set so one derivation takes a noticeable fraction of a second on a typical device. The challenge is balance: stronger settings slow every unlock, especially on phones, and weak ones leave a stolen vault open to offline guessing.",
    k: ["Memory-hard function vs iteration-count function: memory-hard costs more per guess on parallel hardware, but strains small devices and browsers; iteration-only runs everywhere and is cheaper to attack.", "Higher cost with slower unlock vs usable speed: each doubling doubles attacker cost, but also doubles the wait on every login."],
    p: ["Parameters tuned on a fast laptop make unlock take many seconds on an old phone, and people switch to a weaker password.", "A salt derived from the email address makes precomputation across accounts with the same address possible."],
    v: "Derive a key from a fixed password, salt and parameters, compare to published test vectors, and time it on the slowest supported device, confirming it falls within the target range.",
    dep: ["kdf-parameters", "random-generation"]
  },
  "kdf-parameters": {
    s: "The stored cost settings for key derivation, such as iterations, memory and parallelism, and the process for raising them as hardware gets faster.",
    d: "Parameters are stored with the account in plain form since the client needs them before it can derive anything. They are chosen at account creation and can be raised on the next login, when the client holds the password: it derives with the new settings, rewraps the account key and uploads the new parameters. Lowering them by a malicious server is the dangerous direction, so clients enforce minimums. The challenge is migrating millions of accounts with old settings, and avoiding a downgrade attack where the server returns weak parameters.",
    k: ["Client-enforced minimums vs trusting server values: minimums block a server-driven downgrade, but need a release to raise and may lock out accounts with legacy settings.", "Upgrade on next login vs forced migration: opportunistic upgrade is transparent, but inactive accounts stay weak indefinitely."],
    p: ["A server, or an attacker in the path, returns weak parameters and the client derives with them, giving a fast offline guess target.", "Raising memory cost past what a browser tab allows makes web login fail on some machines."],
    v: "Point a client at a test server that returns a below-minimum iteration count and confirm the client refuses to log in. Log in to an account with old parameters and confirm they are raised and the account still unlocks.",
    dep: ["master-key-derivation", "account-database"]
  },
  "key-separation": {
    s: "Derives distinct keys for distinct purposes from one master key, so that learning the key used for login reveals nothing about the key used for encryption.",
    d: "A key derivation function with a fixed context label expands the master key into an encryption key and an authentication value. Each label produces an independent-looking output, so exposing one does not help compute the other. The same practice applies to every wrapping, such as separate keys for item encryption and for authentication of the envelope. The server may see the authentication value but never the encryption key. The challenge is discipline: each new feature must receive its own label, and a single reused key across purposes quietly breaks the separation.",
    k: ["Labeled derivation of subkeys vs one key for everything: labeled subkeys contain damage and prevent cross-protocol attacks, but add derivation steps and rules developers must follow.", "Fixed labels in the code vs stored in the vault: fixed labels are simple and testable, but cannot be changed without a format version."],
    p: ["The same key encrypts items and signs tokens, so an oracle on one is used against the other.", "A copied snippet reuses an existing label for a new purpose and ties two keys together."],
    v: "Derive subkeys for each defined label from a fixed master key, compare against published vectors, and confirm no two labels yield the same bytes and no key used for authentication decrypts a vault item.",
    dep: ["master-key-derivation", "authenticated-encryption"]
  },
  "key-hierarchy": {
    s: "The tree of keys from master key down to the items: a master key wraps a random account key, which wraps item and organization keys, so changes at the top stay cheap.",
    d: "The master key, derived from the password, encrypts a random account key generated on the device. The account key encrypts items, or per-item keys, and the private half of the account key pair. Changing the password rewraps only the account key. Each layer limits what a leak exposes and what a rotation costs. The hierarchy is also the recovery model: any new way to unlock, such as a recovery key or trusted device, simply adds another wrapping of the account key. The challenge is keeping the tree consistent while devices work offline.",
    k: ["Random account key wrapped by the master key vs encrypting items with the master key directly: the extra layer makes password change cheap and enables other unlock methods, but adds a key to protect.", "Deep hierarchy vs shallow: more layers allow finer sharing and rotation, but each wrap is another place for a version or integrity bug."],
    p: ["A wrapped key is stored without authentication and an attacker substitutes another valid-looking key.", "A rotation updates some wrapped copies but not all, and part of the vault stays under the old key."],
    v: "Change the password and confirm only the wrapped account key changed, and a recovery key, device key and master password each independently unwrap the same account key to decrypt the same item.",
    dep: ["master-key-derivation", "authenticated-encryption", "per-item-keys", "account-key-pair"]
  },
  "account-key-pair": {
    s: "A public-private key pair created for each account, whose public half is published for others to wrap keys to, and whose private half stays encrypted under the account key.",
    d: "The pair is generated on a client at account creation. The public key is uploaded and used by others to send shared keys, invitations and emergency access grants. The private key is encrypted under the account key and downloaded to each device. A fingerprint of the public key lets people compare it out of band. The challenge is trust in the directory: the server supplies other users' public keys, so it could substitute its own unless clients pin keys or show fingerprints, which they seldom do.",
    k: ["Server as the directory of public keys vs verified keys: a directory makes sharing easy, but gives the server a chance to substitute keys without detection.", "Long-lived pair vs periodic rotation: long-lived keys keep sharing simple, but a leaked private key exposes every past wrapped secret."],
    p: ["The server substitutes a public key during sharing and gets a wrapped key it can decrypt.", "Losing the account key makes the private key irrecoverable and shared access wrapped to it is stranded."],
    v: "Fetch another member's public key, compare its fingerprint with the one displayed on their device, and confirm they match. Wrap a test key and confirm only the holder of the private key can unwrap it.",
    dep: ["key-hierarchy", "random-generation", "authenticated-encryption"]
  },
  "secret-key-factor": {
    s: "An extra high-entropy secret generated on the person's device and mixed into key derivation, so a stolen server database cannot be attacked by guessing the master password alone.",
    d: "At sign-up the client creates a random secret and combines it with the master password during derivation. The server never receives it, and it is stored on each of the person's devices and in the recovery kit. An attacker who steals the ciphertext must guess both. It raises the cost of offline attack beyond what the password allows. The challenge is that a new device needs the secret entered by hand or scanned from an existing one, and losing it everywhere without a kit means losing the vault.",
    k: ["Device-held secret mixed into derivation vs password only: it defeats offline guessing of weak passwords, but adds an enrollment step for every new device.", "Showing the secret in the interface vs hiding it: showing allows copying to new devices, but is another thing to capture in screenshots."],
    p: ["People lose all devices and the printed kit, and the secret cannot be reconstructed.", "The secret is included in a cloud backup of the device, and the second factor of the derivation falls with the cloud account."],
    v: "Copy the vault ciphertext and the account's public data to a test machine and attempt to unlock with the correct master password but without the secret, and confirm decryption fails. Add the secret and confirm success.",
    dep: ["master-key-derivation", "recovery-kit", "key-hierarchy"]
  },
  "vault-format": {
    s: "The byte layout of an encrypted vault record: a version marker, a nonce, ciphertext and authentication tag, wrapped in a self-describing envelope.",
    d: "Each encrypted value is stored as a string or binary with a leading type that names the algorithm and key kind, then the nonce, the ciphertext and a tag. The envelope lets a client decide how to decrypt without out-of-band knowledge, and lets old and new formats coexist during migration. Fields are encrypted individually or as one JSON blob per item. The challenge is the length of the commitment: formats written now must be readable for decades, so ambiguity, unauthenticated fields and parsing quirks become permanent liabilities.",
    k: ["Per-field encryption vs one blob per item: per-field allows searching names without opening notes and partial sharing, but adds overhead and leaks field counts and sizes.", "Self-describing envelope vs a global version: self-description allows gradual migration, but each reader must parse and validate many type tags safely."],
    p: ["A parser accepts an unknown algorithm tag and falls back to a weaker mode or none at all.", "Field sizes visible to the server reveal secrets such as password length through ciphertext length."],
    v: "Decrypt a corpus of vault records written by every historical format version using the current client, and confirm each decrypts to the expected plaintext. Mutate the type tag and confirm the client rejects the record.",
    dep: ["authenticated-encryption", "format-versioning", "random-generation"]
  },
  "authenticated-encryption": {
    s: "A cipher mode that encrypts and authenticates in one step, so any change to the ciphertext, nonce or associated data is detected before a single plaintext byte is used.",
    d: "Each value is encrypted with a key and a unique nonce, producing ciphertext and a tag over both the ciphertext and optional associated data such as the item identifier. Decryption verifies the tag first and rejects on mismatch. Binding associated data to the context stops an attacker from moving a valid ciphertext into another field or item. The challenge is nonce management: reusing a nonce with the same key can reveal plaintext and break authentication, so the nonce comes from a secure random source or a strict counter, and limits on volume per key are observed.",
    k: ["Random nonces vs counters: random needs no state across devices, but has a collision limit at very large volume; counters are collision-free and break when state is lost or shared offline.", "Binding item identifiers as associated data vs leaving them out: binding blocks swapping ciphertexts between items, but makes moving or duplicating an item require re-encryption."],
    p: ["A nonce is reused after a restored backup resets a counter, and the key stream or authentication key leaks.", "Decryption returns plaintext before verifying the tag in a streaming path and acts on forged data."],
    v: "Flip each bit of a ciphertext, nonce and associated data in turn, and confirm decryption fails every time and returns no plaintext. Encrypt one million values and confirm no nonce repeats under one key.",
    dep: ["random-generation", "key-separation"]
  },
  "per-item-keys": {
    s: "A fresh random key for each vault item, wrapped by the account or collection key, so one item can be shared, rotated or revoked on its own.",
    d: "When an item is created, the client generates a random key and encrypts the item content with it. The item key is stored beside the item, encrypted under the account key or a collection key. Sharing an item then means wrapping its key for a recipient, without exposing the rest of the vault. Rotating the account key means rewrapping one small value per item instead of re-encrypting all content. The challenge is storage and complexity: every item carries a wrapped key, and a missing or damaged wrapper makes a single item unrecoverable.",
    k: ["Per-item keys vs one vault key: per-item keys allow fine-grained sharing and cheap rotation, but add a wrapper that can be lost or corrupted per item.", "Wrapping under the account key vs under a collection key: account keys keep personal items private, while collection keys let members read without access to the whole account."],
    p: ["A wrapped item key is overwritten during sync and the item becomes unreadable while its ciphertext remains.", "Item keys generated with a weak or reseeded random source collide across items."],
    v: "Share one item to a test user by wrapping only its key and confirm they decrypt that item and no other. Rotate the account key and confirm only the wrappers changed.",
    dep: ["key-hierarchy", "authenticated-encryption", "random-generation"]
  },
  "plaintext-metadata": {
    s: "The fields the server can read, such as account identifier, item type, timestamps and sizes, chosen to be as few as possible and understood as a privacy cost.",
    d: "Some data must be visible for the service to work: which user owns a record, its revision, modification time, an opaque identifier and sometimes the type, collection or whether it is deleted. Everything else, including names, addresses and field counts, can be encrypted. Each visible field leaks something: modification times show activity patterns, sizes hint at content, and collection membership reveals structure. The challenge is the line itself, since moving a field into ciphertext breaks server features that relied on reading it, such as search or per-type quotas.",
    k: ["Minimal plaintext vs convenient plaintext: minimal limits what a breach exposes, but pushes sorting, search and quotas into every client.", "Padding sizes to buckets vs exact lengths: padding hides password and note length, but increases storage and bandwidth cost."],
    p: ["Match addresses stored in plaintext let a database leak reveal every site a person has accounts on.", "Counts and timing of updates reveal when someone changed a password after a known incident."],
    v: "Take a database dump of a test account's records and confirm only the documented plaintext fields appear, and that item names, addresses, usernames and field counts cannot be recovered without the key.",
    dep: ["vault-format", "ciphertext-store", "account-database"]
  },
  "format-versioning": {
    s: "The scheme for moving data and keys from an older encryption format to a newer one without losing data or leaving some clients unable to read the vault.",
    d: "Each record carries a version or algorithm identifier. A new client reads old and new versions, and writes new ones. Migration happens lazily when an item is next saved or in a background job that re-encrypts everything. Server and clients must agree on a minimum supported version, and a period when both versions exist. It is hard because rollout is uneven: some devices run old code for months, and a premature switch to the new format makes shared items unreadable for part of an organization.",
    k: ["Lazy migration at next write vs a one-time bulk upgrade: lazy spreads the load and risk, but leaves old formats lingering; bulk finishes the job but needs every device online and updated.", "Keep reading old formats forever vs retire them: forever protects old data, but keeps weak algorithms and parsing code alive."],
    p: ["A new client writes the new format before older clients in the same organization can read it, and sharing breaks.", "A bulk migration is interrupted partway, leaving a vault where some items need a different key path than others."],
    v: "Prepare a vault with items at every historical version, run the migration, and confirm every item decrypts to identical plaintext. Interrupt the migration at random points and confirm the vault is still readable on retry.",
    dep: ["vault-format", "cryptographic-agility", "sync-protocol"]
  },
  "integrity-and-rollback": {
    s: "Detects tampering with, deletion of, or replay of old versions of vault data by a server or an attacker, which authenticated encryption of single items alone does not stop.",
    d: "Item tags catch modification of one record. They do not catch the server hiding an item, returning an old version, or showing different vaults to different devices. Defenses include signed or chained revision counters, a manifest with a hash of the item list held by each client, and refusing revisions lower than the last one seen. Shared collections need agreement among members. The challenge is cost and coverage: full vault consistency checks need extra metadata, and many managers protect single items but not the set of items.",
    k: ["Authenticating individual items only vs also the whole item set: per-item tags are simple, while a manifest detects omissions and rollbacks but costs bookkeeping and complicates sync.", "Clients remember the latest revision seen vs trust the server: remembering catches rollback, but a restored or new device has no memory to compare against."],
    p: ["A malicious or restored server returns an older vault and a stolen password change silently disappears.", "A deleted item is hidden from one device, and nothing in the protocol lets that device notice."],
    v: "Make a test server return an older revision of the vault and confirm the client warns or refuses. Remove an item on the server only, and confirm a client holding the manifest flags the missing record.",
    dep: ["revision-tracking", "authenticated-encryption", "sync-protocol"]
  },
  "random-generation": {
    s: "The source of unpredictable bytes for keys, salts, nonces, passwords and recovery codes, taken from the operating system's cryptographic generator, never from time or a general-purpose function.",
    d: "Clients call the platform's cryptographic random interface, which mixes hardware noise and is reseeded continuously. Every secret in the system depends on it: a predictable generator makes every key guessable regardless of cipher strength. The interface must be called in the right context, since early boot, virtual machines cloned from snapshots and some embedded environments can have poor entropy. Wrappers must not truncate, reuse or seed from time. The challenge is that failure is invisible: weak randomness produces perfectly valid-looking keys.",
    k: ["Operating system generator vs a library's own: the system one is audited and well fed, while a library one adds portability but one more place to be wrong.", "Failing hard when randomness is unavailable vs degrading: failing prevents weak keys but breaks the client; degrading keeps working while quietly creating bad secrets."],
    p: ["A virtual machine snapshot is restored and generates the same keys as its earlier run.", "A fallback to a time-seeded generator is enabled for old environments and goes unnoticed."],
    v: "Generate a large sample of keys and nonces, run a standard statistical test suite, and confirm no duplicates. Inspect the code path to confirm every call uses the system interface and nothing seeds from time.",
    dep: []
  },
  "sync-protocol": {
    s: "The API exchange by which a client sends its encrypted changes and receives others', carrying opaque ciphertext and revision metadata the server can order but not read.",
    d: "A client requests changes since a revision marker, applies them, and uploads local changes with the revision they were based on. The server accepts or rejects each write, stores ciphertext and assigns a new revision. Full syncs return everything; incremental syncs return only changes and deletions. Authentication is by session token. The protocol must be idempotent, since mobile networks drop and retry. The challenge is correctness without reading the data: ordering, deletion and conflict signaling must work using only identifiers and revision counters.",
    k: ["Server-assigned revisions vs client timestamps: server revisions give a total order, while client clocks are skewed and let a wrong clock overwrite newer data.", "Full sync on open vs incremental only: full sync is simple and self-healing, but heavy for big vaults; incremental is light and needs careful handling of missed deletions."],
    p: ["A retried upload applies twice and creates a duplicate item or a revision conflict.", "A client skips a change window after an outage and permanently misses a deletion."],
    v: "Make two devices edit disjoint items, sync both and confirm each ends with the union. Drop the network after upload but before the reply, retry, and confirm exactly one copy of the change exists.",
    dep: ["revision-tracking", "session-tokens", "ciphertext-store", "api-gateway"]
  },
  "revision-tracking": {
    s: "Counters or timestamps the server assigns to every change, letting each client ask for exactly what happened since it last synced.",
    d: "Each write increments a revision for the account or collection and records the item's revision. Clients store the last revision they have seen. A request for changes since that marker returns items with higher revisions and tombstones for deletions. Tombstones must be kept long enough that an offline device returning later still learns of the deletion. Conditional writes carry the base revision so stale edits are detected. The challenge is retention: tombstones accumulate, and purging them too early lets deleted items reappear from devices that missed the deletion.",
    k: ["Per-account counter vs per-item versions: an account counter orders everything simply, but is a hot spot; per-item versions scale and make cross-item consistency harder.", "Long tombstone retention vs short: long keeps old devices correct, but grows storage; short is lean and resurrects deleted secrets from a device offline for months."],
    p: ["A device offline past the tombstone window uploads a deleted item and it returns to every other device.", "A client crash after saving the revision but before applying changes loses updates permanently."],
    v: "Delete an item, keep one device offline beyond a normal period but within retention, bring it online and confirm the deletion applies. Compare behavior beyond retention against the documented rule.",
    dep: ["sync-protocol", "account-database"]
  },
  "delta-sync": {
    s: "Sends only the items that changed since the last sync, instead of the whole vault, to save bandwidth and battery on large vaults and slow networks.",
    d: "The server computes the set of items whose revision exceeds the client's marker and returns just those, plus tombstones. The client merges them into its local store. Large attachments sync separately and on demand. Because the data is ciphertext, the server cannot diff inside an item, so the unit of change is a whole item. The challenge is correctness at the edges: items moved between collections, permission changes that remove access, and clients whose marker is too old to trust must trigger a full resync.",
    k: ["Item-level deltas vs field-level: item granularity is simple and fits opaque ciphertext, but a small edit uploads the whole record; field deltas need structure the server cannot see.", "Fall back to full sync on suspicion vs trust the marker: falling back heals errors, but makes unusual cases expensive for large vaults."],
    p: ["An item removed from a collection is not in a changed set, and the client keeps showing it.", "A server-side restore lowers revisions and the client's marker is now ahead of the server, so changes are missed."],
    v: "Change one item in a thousand-item vault and confirm only that item and its revision cross the network. Revoke a collection from a member and confirm their client removes its items on the next delta.",
    dep: ["sync-protocol", "revision-tracking", "collections-permissions"]
  },
  "conflict-resolution": {
    s: "Rules for reconciling two edits to the same item made on different devices, performed on the clients because the server cannot read what it would be merging.",
    d: "When an upload names a base revision that is no longer current, the server rejects it. The client downloads the winning version, compares it to its own, and either takes the newer by modification time, merges field by field, or keeps both as separate items. Merging works on decrypted fields. For passwords the safest rule is to keep both, since discarding the wrong one locks the person out of the site. The challenge is that clocks disagree, and automatic merges can produce a value that matches neither device's intent.",
    k: ["Last writer wins vs field-level merge: last-writer is simple and predictable, but silently discards an offline edit; merging keeps more, but can combine incompatible changes.", "Keep both copies for conflicting passwords vs pick one: keeping both avoids losing a working password, but creates duplicates people must clean up."],
    p: ["Two devices change the password at different sites offline, and the older edit overwrites the newer because of clock skew.", "A merge produces a username from one edit and a password from another that no site accepts."],
    v: "Edit one item's password on two offline devices, bring both online and confirm that neither value is lost, the conflict is surfaced or both copies kept, and the results are identical on both devices.",
    dep: ["revision-tracking", "item-history", "sync-protocol"]
  },
  "offline-mode": {
    s: "Lets a client read the vault, and queue edits, without a network, using the encrypted local cache and syncing when connectivity returns.",
    d: "The client unlocks the cached ciphertext with locally held keys and decrypts items as usual. Edits are stored in a pending queue with the base revision they were made against. On reconnect the queue is replayed through the sync protocol and conflicts are resolved. Read-only offline use is common, while offline editing is riskier. Policies may limit how long a device may stay offline before requiring a refresh. The challenge is staleness: an old cache can fill a password changed elsewhere, and a revoked member may keep reading cached shared items.",
    k: ["Allow offline edits vs read-only offline: edits keep people productive, but multiply conflicts; read-only is simple and safe but blocks saving a new password during a flight.", "Cache expiry for organizations vs unlimited offline use: expiry limits what a revoked member can read from a cache, but locks out legitimate travelers."],
    p: ["A cached password was changed on another device, and offline fill uses the old one and triggers a lockout.", "A removed employee keeps reading shared items from the cache of a laptop that never reconnects."],
    v: "Disable the network, unlock, fill a login and add a new item, then reconnect and confirm the new item syncs and no existing item was altered. Set an offline limit and confirm the vault locks after it expires.",
    dep: ["local-vault-cache", "sync-protocol", "conflict-resolution"]
  },
  "change-notifications": {
    s: "A push or long-lived connection by which the server tells devices that something changed, so they sync promptly without polling.",
    d: "Clients hold a connection or register with the platform push service. After a write, the server sends a small message naming the type of change and the account, never contents. The client then performs an incremental sync. Notifications also announce logout and device approval requests. Messages pass through third-party push infrastructure, so they must carry nothing sensitive. The challenge is reliability: pushes are best effort, connections drop silently, and a client that depends on them without a periodic sync fallback drifts out of date.",
    k: ["Push with a content-free payload vs sending data in it: content-free reveals only that something changed, but forces a round trip to fetch the change.", "Persistent connection vs platform push: a connection is faster and reaches desktop clients, but mobile systems limit background connections, so push is needed there."],
    p: ["Push messages carry item names and a third-party push provider can read them.", "A dropped connection is never detected, and the client shows an old vault until restarted."],
    v: "Edit an item on one device and confirm the other receives a notification within seconds and syncs. Inspect the push payload and confirm it holds no item names, addresses or values. Block pushes and confirm periodic sync catches up.",
    dep: ["sync-protocol", "device-registry", "api-gateway"]
  },
  "device-registry": {
    s: "A list of the devices and sessions tied to an account, with names, last activity and the ability to revoke any of them.",
    d: "At login each client registers a device identifier and a name, and the server associates tokens, push endpoints and trusted-device keys with it. The account page lists devices with last seen time and approximate location. Revoking a device kills its tokens and removes its trusted status, so the next sync fails. Alerts can notify the person of a new device. The challenge is trust in the data: device names are chosen by the client, and an attacker's device can pick an innocent label, so signals such as first-seen time matter more.",
    k: ["Show every device with revoke vs only the current session: a full list lets people find and remove an intruder, but needs honest naming and enough metadata to be recognized.", "Notify on every new device vs only risky ones: always notifying catches takeovers early, and trains people to ignore the message when it is frequent."],
    p: ["Revoking a device removes its token but leaves its wrapped keys and cached vault on that device.", "An attacker names their device after the person's laptop and the notification looks routine."],
    v: "Log in from a second test device, confirm it appears with a name and time, revoke it, and confirm its next request is rejected and its trusted-device approval no longer works.",
    dep: ["session-tokens", "account-database", "mail-service"]
  },
});
