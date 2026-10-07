// Details for the messaging plate, part 2: identity, pairwise sessions, groups and devices.
ATLAS.details("messaging-app", {
  "registration-flow": {
    s: "The sequence that creates an account: submit an identifier, prove control of it, generate keys on the device, upload public keys and receive credentials.",
    d: "The client asks the server to start registration for a phone number or other identifier, receives a challenge through a separate channel, and submits the code. On success it generates identity and prekeys locally, uploads only public parts, and receives an account identifier and authentication credentials. Existing accounts on the identifier are replaced or the new device is linked, depending on policy. It is hard because it is the cheapest point for abuse at scale, must work across carrier and region quirks, and a takeover here defeats every later protection.",
    k: ["Registration replaces the previous device set vs adds a device: replacing recovers lost phones and enables takeover; adding needs the old device and fails when it is gone.", "Keys generated before verification vs after: before saves a round trip and uploads keys for an unproven identifier; after is cleaner and slower."],
    p: ["A registration that silently replaces an existing account without notifying contacts lets attackers impersonate quietly.", "Treating verification as complete on a client claim, not a server check, skips the proof entirely."],
    v: "Register a new identifier end to end on a clean device: challenge arrives, code is accepted, keys are uploaded, and a second registration of the same identifier produces a visible key change for existing contacts.",
    dep: ["identifier-verification","device-identity-keys","prekey-bundle-service","account-service"]
  },
  "identifier-verification": {
    s: "Proving that a registrant controls a phone number or other identifier by delivering a one-time code through text message, voice call or another channel.",
    d: "The server generates a short code, sends it through an external provider, stores a hashed copy with a short lifetime and attempt limit, and compares on submission. Alternatives include a call from a number whose last digits are the code, or a silent verification through the carrier. Requests are rate limited per number, per device and per network. It is hard because the transport is interceptable, delivery is slow or fails by region, providers charge per message, and attackers can trigger floods of paid messages.",
    k: ["Text-message code vs account-based or silent verification: codes work everywhere and are open to interception and swapping of numbers; silent checks are smoother and need carrier support.", "Allow resend freely vs strict limits: free resend helps real users and enables cost attacks and harassment."],
    p: ["Unlimited code requests let attackers run up the provider bill or flood a victim's phone.", "Codes valid for hours with unlimited guesses are brute-forced within minutes."],
    v: "Request ten codes in a minute for one number and get throttled, submit a wrong code more than the limit and see lockout, and verify a correct code works once and then cannot be reused.",
    dep: ["rate-limiter","verification-fraud-defense"]
  },
  "device-identity-keys": {
    s: "The long-term asymmetric key pair that identifies a device, whose public half other devices pin and whose private half never leaves it.",
    d: "At install the device generates an identity key pair. The public key is registered with the server and distributed in prekey bundles; it is the root of trust for signing prekeys and for authenticating key agreement. In some designs one account identity key is shared by all devices; in others each device has its own and an account-level key signs them. Contacts record the key they first saw and warn when it changes. It is hard because the key must be stored non-extractably, rotated rarely, and replaced safely when a device is lost.",
    k: ["One key per account vs per device: per-account is easy to verify and exposes every device if copied; per-device isolates compromise and multiplies verification.", "Signing and key-agreement from one key vs separate keys: one key is compact, separate keys avoid cross-protocol attacks and cost more storage."],
    p: ["Exporting the private key into backups makes every restore a cloning event that breaks forward secrecy.", "Silently accepting a changed identity key removes the one defense against server-side substitution."],
    v: "Register a device, then wipe and re-register it. Existing contacts see a changed key warning, and the old identity key can no longer sign valid prekeys on the server.",
    dep: ["secure-key-storage"]
  },
  "signed-prekeys": {
    s: "A medium-term public key signed by the identity key, uploaded in advance so senders can start a session while the owner is offline, and replaced on a schedule.",
    d: "The device generates a key pair, signs the public key with its identity key and uploads both. Senders verify the signature against the identity key in the bundle. The private key lasts days to weeks, long enough for offline initiators and short enough to limit exposure; after rotation old private keys are kept briefly for in-flight handshakes, then deleted. It is hard because deletion is what provides forward secrecy for the first messages, yet deleting too soon breaks messages sent by someone who fetched the old bundle.",
    k: ["Rotate weekly vs monthly: shorter rotation limits what a later compromise exposes and demands the device come online regularly.", "Keep old private keys for a grace period vs delete at once: grace tolerates in-flight handshakes and extends the exposure window."],
    p: ["Never deleting retired private keys turns the rotation into theater for forward secrecy.", "A server that serves a stale signed prekey after rotation causes handshake failures that look like random decryption errors."],
    v: "Rotate the signed prekey, send a message using a bundle fetched before rotation and one after, and confirm both decrypt. After the grace period, confirm the old private key no longer exists on the device.",
    dep: ["device-identity-keys","secure-key-storage","prekey-bundle-service"]
  },
  "one-time-prekeys": {
    s: "A batch of single-use public keys uploaded to the server, each handed out once, so each new session gets key material no one else has used.",
    d: "The device generates hundreds of key pairs and uploads the public keys. The server hands one to each initiator and deletes it from the pool. The initiator mixes it into the handshake so the first message has forward secrecy even if the signed prekey is later compromised. The device deletes the private key when it is consumed. The client monitors the pool size and refills it. It is hard because pools run out for popular accounts, attackers can drain them on purpose, and handshakes must still work, with weaker properties, when no one-time key exists.",
    k: ["Handshake without a one-time key when exhausted vs refuse: falling back keeps messaging working with slightly weaker replay and forward secrecy; refusing is stricter and breaks delivery.", "Large pools vs small with frequent refill: large pools survive offline periods; small pools expose less if the server is compromised."],
    p: ["A malicious sender fetching bundles repeatedly drains the pool so that every later session falls back.", "Handing out the same one-time key twice breaks the single-use property and allows replay."],
    v: "Fetch bundles until the pool is empty and confirm a handshake still succeeds in fallback mode, then let the device reconnect and confirm the pool is refilled and each earlier key was served once.",
    dep: ["device-identity-keys","prekey-bundle-service","rate-limiter"]
  },
  "prekey-bundle-service": {
    s: "The server component that stores each device's public identity key, signed prekey and one-time prekeys, and returns a bundle to authorized initiators.",
    d: "It exposes upload and fetch operations. Fetch returns the identity key, current signed prekey with its signature and at most one one-time prekey per device, atomically removing the one-time key. It limits fetch rates per requester, checks sender authorization such as an access token, and reports remaining one-time prekeys to the owner. It sees only public keys, but it is a high-value target: substituting keys would let it perform a man-in-the-middle, which key verification and transparency are designed to detect. Atomic pop under concurrency is the hard part.",
    k: ["Server picks a one-time prekey atomically vs returns a batch the client chooses from: server pop guarantees single use; client choice needs a separate consumption signal.", "Return bundles for all devices in one call vs one at a time: one call is fast for fan-out and reveals the whole device list to any requester."],
    p: ["Non-atomic pop under concurrent fetches hands the same one-time key to two senders.", "Returning bundles to anyone without authorization lets attackers scrape device lists and drain key pools."],
    v: "Issue five hundred concurrent fetches against a pool of two hundred keys. Every key is returned at most once, the rest fall back, and an unauthorized requester is refused.",
    dep: ["message-store","delivery-tokens","rate-limiter"]
  },
  "secure-key-storage": {
    s: "Holds private keys inside hardware-backed or operating-system protected storage so that application code and file copies cannot read them directly.",
    d: "Where hardware provides it, wrapping keys are generated inside a secure element or trusted execution environment, marked non-exportable and gated on device unlock or user presence. Long-term private keys are encrypted under them. Ratchet keys, which change constantly, live in the encrypted database rather than hardware. Software fallbacks protect with the operating system's file protection. It is hard because capabilities differ widely across devices, hardware-backed keys can be lost on factory reset or biometric changes, and frequent operations are too slow for hardware round trips.",
    k: ["Hardware-wrapped keys with non-exportable policy vs software keys: hardware resists extraction and breaks on restore or reset; software works everywhere and is weaker against a stolen device.", "Require authentication per use vs per session unlock: per use is safest and unusable for background decryption."],
    p: ["Tying keys to biometric enrollment makes adding a fingerprint destroy the account keys.", "Assuming every device has hardware protection silently stores keys in plain files on those that do not."],
    v: "On a hardware-backed device, attempt to export the wrapping key through the platform API and get a refusal. Copy the app's data to another device and confirm private keys cannot be used.",
    dep: []
  },
  "registration-lock": {
    s: "A user PIN or password that must be presented to re-register an identifier, blocking attackers who intercept the verification code from taking over the account.",
    d: "At setup the user chooses a PIN. The client derives a secret from it and stores a recovery blob in a hardware-isolated service with limited guess attempts, plus a registration lock token at the account service. A later registration must present the token, obtainable only with the PIN. Periodic prompts help users remember it. Locks can expire after inactivity, so lost PINs do not make accounts unrecoverable forever. It is hard because the balance is between takeover resistance and user lockout, and short PINs are only safe when guess counting is enforced by something the attacker cannot bypass.",
    k: ["Lock expires after inactivity vs never expires: expiry gives recovery to forgetful users and gives attackers a waiting game; never expiring can lose accounts permanently.", "PIN checked by the account service vs stretched in a rate-limited enclave: the service is simple and sees guess patterns; the enclave limits guessing even against the operator."],
    p: ["Allowing the lock to be skipped through a support path undoes the protection for social-engineering attackers.", "A weak PIN policy with unlimited guesses makes the lock decoration."],
    v: "Intercept a verification code and try to register the same number on a new device without the PIN. Registration is refused, and after the lockout limit further attempts are throttled.",
    dep: ["hardware-isolated-lookup","account-service","recovery-key"]
  },
  "key-agreement": {
    s: "The asynchronous handshake that gives two devices a shared secret from the recipient's published keys, even when the recipient is offline.",
    d: "The initiator fetches the recipient's bundle and combines several Diffie-Hellman results: its identity key with the signed prekey, a fresh ephemeral key with the recipient's identity key and signed prekey, and with a one-time prekey if present. A key derivation function merges them into the first root key. The first message carries the ephemeral public key and references the prekeys used so the recipient can repeat the computation. It gives mutual authentication and deniability. It is hard because of replay of the first message, identity binding and the unequal strength when no one-time key remains.",
    k: ["Several DH results mixed vs a single ephemeral exchange: mixing gives authentication, forward secrecy and offline initiation together; a single exchange is simpler and gives up some properties.", "Deniable authentication through DH vs signatures on the transcript: DH keeps messages repudiable; signatures prove authorship to third parties."],
    p: ["Omitting the identity key and prekey identifiers from the derived key allows cross-session confusion attacks.", "Accepting a replayed first message establishes duplicate sessions when no one-time key was used."],
    v: "Initiate a session to an offline device, deliver after it returns, and confirm both sides derive identical root keys. Replay the initial message and confirm it is rejected or leaves no usable second session.",
    dep: ["device-identity-keys","signed-prekeys","one-time-prekeys","prekey-bundle-service","root-key-chain"]
  },
  "post-quantum-hybrid": {
    s: "Adds a key encapsulation mechanism to the handshake and ratchet so that recorded traffic stays secret even if large quantum computers later break classical key exchange.",
    d: "The handshake mixes a classical shared secret with one from a quantum-resistant key encapsulation, so an attacker needs to break both. Prekey bundles carry the extra public keys, which are much larger, and the ratchet can periodically perform an additional encapsulation. Message size and bundle size grow, and some designs use compact derived signatures. It is optional but increasingly expected. Hard parts include signature and key sizes, the cost of fetching larger bundles, and making sure that a flaw in the new algorithm cannot weaken the classical protection.",
    k: ["Hybrid combination vs replacing the classical exchange: hybrid stays safe if either holds and carries more bytes; replacement is smaller and bets everything on newer algorithms.", "Post-quantum on the initial handshake only vs also in the ratchet: handshake-only blocks harvest-now attacks cheaply; ratchet inclusion also heals after later compromise at higher bandwidth cost."],
    p: ["Combining secrets without binding all public values lets an attacker downgrade to the classical part.", "Larger bundles exceed message or request size limits on some paths and fail only for upgraded clients."],
    v: "Establish a session with a post-quantum-capable pair and confirm both secrets enter the derivation; disable the classical secret in a test harness and confirm the root key still differs from an attacker's guess.",
    dep: ["key-agreement","prekey-bundle-service","root-key-chain"]
  },
  "root-key-chain": {
    s: "The evolving root key that each Diffie-Hellman ratchet step feeds, from which fresh sending and receiving chain keys are derived.",
    d: "The root key starts from the handshake output. Each time a new ratchet public key arrives, a Diffie-Hellman result is combined with the root key through a key derivation function, producing the next root key and a new chain key. Old root keys are overwritten. Because each step depends on a fresh random secret, a stolen state is useful only until the next successful ratchet step. It is hard to get the ordering exactly right on both sides, to store the state atomically with the messages and to avoid any path that retains superseded roots.",
    k: ["Root key mixed with each new DH output vs derived from the previous chain alone: mixing heals after compromise; chain-only derivation gives forward secrecy and no healing.", "Separate derivation labels per output vs one expansion split into parts: labels prevent misuse across contexts and need discipline to keep consistent."],
    p: ["Keeping previous root keys for convenience destroys forward secrecy for everything derived from them.", "Persisting the new root before the message is committed loses the old state if a crash intervenes."],
    v: "Run two parties through a long conversation with turn changes and compare derived chain keys at each step with a reference implementation's test vectors. Confirm superseded roots are overwritten in memory dumps.",
    dep: ["key-agreement","dh-ratchet"]
  },
  "dh-ratchet": {
    s: "The step where a party generates a fresh Diffie-Hellman key pair and includes its public key in messages, so each change of direction renews the shared secret.",
    d: "Each message header carries the sender's current ratchet public key. When a receiver sees a new one, it computes a DH with its own current private key, advances the root key, and starts a new receiving chain; on its next send it generates a new key pair and does another DH, starting a new sending chain. Fresh randomness at each turn provides post-compromise security. It is hard because it needs a message in each direction to advance, long one-way streams keep the same DH key, and header handling must tolerate lost and reordered messages.",
    k: ["Ratchet on every direction change vs on a timer or count: turn-based is natural and does not advance during one-sided streams; adding a timer forces healing and needs extra messages.", "Plain headers vs encrypted headers: plain headers are simple and expose the ratchet key and counters to the server; encrypted headers hide them and require trial decryption."],
    p: ["Reusing a ratchet key pair for several turns removes the healing property.", "Failing to delete the previous private ratchet key keeps old messages decryptable after compromise."],
    v: "Alternate messages between two clients and confirm each direction change shows a new public key in the header, then compromise a snapshot and confirm that messages after the next exchange are not decryptable from it.",
    dep: ["root-key-chain","symmetric-ratchet","skipped-key-store"]
  },
  "symmetric-ratchet": {
    s: "A one-way chain that derives a new message key and a next chain key for each message, deleting the previous chain key so past messages cannot be recomputed.",
    d: "Each chain key goes through a key derivation function that outputs a message key and the next chain key; the old chain key is discarded. Sender and receiver advance in lockstep by counters carried in message headers. Because the function is one-way, learning a chain key reveals future keys in that chain but not past ones. It is the source of forward secrecy between DH steps. It is hard because receivers must handle gaps, deriving and storing the skipped keys, while limiting how far ahead they will go.",
    k: ["Advance per message with immediate deletion vs batch advance: per-message deletion gives the strongest forward secrecy; batching saves CPU and keeps secrets longer.", "Accept any counter jump vs cap it: unlimited jumps tolerate loss and let an attacker force huge computation and storage."],
    p: ["Retaining the chain key after deriving the message key lets anyone with a state dump decrypt earlier traffic.", "Not bounding the number of skipped keys allows a single crafted header to exhaust memory."],
    v: "Send one thousand messages, dump session state at message 500, and confirm messages before 500 cannot be decrypted from the dump, while the receiver still decrypts 501 onward.",
    dep: ["dh-ratchet","message-key-derivation"]
  },
  "message-key-derivation": {
    s: "Expands each one-time message key into the cipher key, authentication key and nonce used to encrypt one message, with the header bound as associated data.",
    d: "A key derivation function turns the message key into separate encryption and authentication material, so no key is used for two purposes. The message is encrypted with an authenticated cipher; the header and the sender and receiver identity keys are authenticated as associated data so tampering or cross-session replay fails. Padding hides exact length. It is hard because any error in domain separation, nonce handling or associated data binding is silent and catastrophic, and because padding policy trades overhead against leakage.",
    k: ["Derive nonce from the message key vs random nonce: derived nonces cannot repeat since every key is used once; random nonces cost bytes and rely on a good random source.", "Pad to fixed buckets vs no padding: buckets hide message length and increase bandwidth; no padding is cheaper and leaks length."],
    p: ["Authenticating only the ciphertext and not the header lets an attacker alter counters or ratchet keys undetected.", "Compression before encryption leaks content through length changes."],
    v: "Modify any header field, identity binding or ciphertext bit and confirm decryption fails. Compare ciphertext lengths for different plaintexts in the same bucket and confirm they match.",
    dep: ["symmetric-ratchet"]
  },
  "skipped-key-store": {
    s: "Holds message keys for messages that were skipped over, so late or reordered messages can still be decrypted exactly once.",
    d: "When a message arrives with a counter ahead of the expected one, the receiver advances the chain and saves the intermediate message keys indexed by ratchet key and counter. When a late message arrives, it is decrypted with its stored key and the key is deleted. Entries are limited in number and age; beyond that, messages are lost. When the DH ratchet steps, remaining keys from the previous chain are also kept for stragglers. The tension is between tolerating real-world reordering and keeping secrets any longer than needed.",
    k: ["Large store with long retention vs small and short: large stores deliver more late messages and hold more secrets longer; small stores minimize exposure and drop messages after long outages.", "Store keys vs ask the sender to resend: stored keys work without the sender online; resend requests avoid holding keys and need a reliable signal."],
    p: ["Unbounded storage turns one forged counter into denial of service through memory and disk.", "Keys never expired survive for months and undermine forward secrecy for those messages."],
    v: "Deliver messages 5, 3, 4 in order after 1 and 2 and confirm all decrypt once; replay 3 and confirm refusal. Skip 2000 counters and confirm the cap triggers instead of storing everything.",
    dep: ["symmetric-ratchet","dh-ratchet","session-state-store"]
  },
  "session-state-store": {
    s: "Persists each pairwise session's root key, chain keys, counters, ratchet keys and the identity of the remote device, updated atomically with each message.",
    d: "State is keyed by remote account and device and held in the encrypted database. Decrypting a message loads the state, computes on a copy, and commits the new state with the plaintext in one transaction, so a failed decryption leaves old state intact. Multiple recent sessions per device are kept because both sides may start sessions at once. It is hard because concurrency across processes can duplicate use of a key, state must be forward-only, and backup restoration of old state is dangerous.",
    k: ["Compute on a copy and commit atomically vs mutate in place: copies tolerate failures and cost memory; in-place is faster and corrupts sessions on error.", "Keep several sessions per device vs only the newest: several tolerate simultaneous initiation and add archival state; newest is simple and loses messages in races."],
    p: ["Two processes loading the same state both advance it, causing key reuse and permanent desynchronization.", "Restoring session state from an old backup rewinds ratchets and breaks the session for both parties."],
    v: "Decrypt a corrupted message and confirm state is unchanged; decrypt a valid one while a second process attempts the same, and confirm exactly one succeeds and the other waits or retries.",
    dep: ["client-database","database-encryption"]
  },
  "session-repair": {
    s: "Detects that two devices have lost sync, through undecryptable messages or a missing session, and recovers by building a fresh session and asking for resends.",
    d: "When decryption fails, the client records the failure and, after verifying it is not an attack, sends a small encrypted retry notice. The sender discards the broken session and starts a new handshake, then resends recent undecrypted messages. Visible placeholders tell the user a message could not be read yet. Rate limits prevent loops. It is hard to tell corruption from forgery, to avoid two sides resetting at the same moment, and to resend without creating duplicates or revealing messages to a new, unverified key.",
    k: ["Automatic reset vs user-confirmed reset: automatic hides most problems and gives an attacker a way to force a new session; confirmation is safer and rarely used.", "Resend plaintext on new session vs ask the other side to resend: sender resend works when the original is stored; recipient request tolerates sender deletion."],
    p: ["Resetting sessions without limit lets a single bad message cause an endless handshake storm.", "Hiding a changed identity key during repair makes a real interception look like a glitch."],
    v: "Corrupt one side's session state, send a message, and confirm a repair completes within seconds, the failed message shows a placeholder then its content, and a changed identity key still produces a warning.",
    dep: ["key-agreement","session-state-store","key-change-warnings","outbox"]
  },
  "sender-keys": {
    s: "A group encryption scheme where each member has one sending chain and shares it once with every other member, so a group message is encrypted once, not per recipient.",
    d: "A member creates a sender key containing a chain key and signing key, and distributes it to each member over the pairwise sessions. Group messages are encrypted with the chain's next message key, signed, and sent once to the server for fan-out. Receivers keep each sender's chain and ratchet it forward. It is efficient for large groups and gives forward secrecy within chains but weaker post-compromise security than pairwise, because chains advance only symmetrically. Membership changes force new keys. The hard part is distribution state and recovering when a member misses one.",
    k: ["Sender keys vs pairwise fan-out to each member: sender keys send once and scale to large groups; pairwise gives full ratchet healing and costs linear encryption and bandwidth.", "Sign messages with a per-sender key vs MAC only: signatures stop other members impersonating a sender and add cost and lose deniability."],
    p: ["A member who missed the key distribution cannot decrypt and must be detected and sent the key again.", "Never rotating chains after a removal lets the removed member keep reading."],
    v: "In a 100-member group, send a message and confirm one encryption and one upload, all members decrypt it, and after removing a member, new messages cannot be decrypted by that member.",
    dep: ["session-state-store","group-membership","group-key-rotation","device-fanout"]
  },
  "tree-key-agreement": {
    s: "A group key agreement using a tree of keys, so a member change updates the shared secret with work proportional to the logarithm of group size, with strong healing properties.",
    d: "Members are leaves of a binary tree; each node holds a key pair, and the root yields the group secret. A member updating its leaf sends new keys along its path encrypted to the sibling subtrees. Adds and removes are handled by commits that all members apply in a single agreed order, producing a new epoch with fresh secrets. It provides forward secrecy and post-compromise security at group scale. It is hard because commits need a total order, members must process them in sequence, and tree state is complicated to store and keep in sync.",
    k: ["Tree-based vs sender keys: trees heal after compromise and handle removals cleanly with logarithmic cost; sender keys are simpler and cheaper per message.", "Server orders commits vs members reach consensus: a server orderer is simple and trusted for availability; decentralized ordering is harder and needs no trust."],
    p: ["Two concurrent commits against one epoch fork the group unless an orderer rejects one.", "Members who have been offline across many epochs cannot catch up without the missing commits or a fresh welcome."],
    v: "Run a group of 1000 with concurrent adds and removes and confirm all members converge to the same epoch secret, and confirm a removed member cannot decrypt any message from later epochs.",
    dep: ["group-membership","group-state-sync","key-agreement","server-sequencing"]
  },
  "group-membership": {
    s: "The authoritative list of who belongs to a group and who may add, remove or change settings, kept as signed state members can verify.",
    d: "Membership is kept as a versioned state containing members, roles, a title and settings, each change signed by the author and checked against permissions. Either a server holds the encrypted state for retrieval, never learning members in the better designs, or members relay changes among themselves. Invitations may require the invitee's acceptance. It is hard because members must agree on one history of changes, roles must be enforced by clients not trusted servers, and the server still needs minimal information to fan out messages.",
    k: ["Server stores encrypted group state vs peer-to-peer relay of changes: server storage lets offline members catch up and requires careful access tokens; relay hides more and fails for members who were away.", "Roles enforced client-side vs by server: client enforcement works when the server is untrusted and depends on every client being correct."],
    p: ["A client that applies membership changes without checking the author's permission lets any member remove admins.", "Two admins making conflicting changes at once leave members with different member lists."],
    v: "Have an admin and a non-admin each try to remove a member and change a setting. Only the admin's changes apply on every device, and a late device reaches the same state after sync.",
    dep: ["group-state-sync","delivery-tokens","profile-encryption"]
  },
  "group-key-rotation": {
    s: "Replaces group key material whenever membership changes or a device list changes, so removed members cannot read future messages and added members cannot read past ones.",
    d: "On removal, remaining members generate new sender keys or commit a new tree epoch, distributing them only to current members. On addition, history keys are not shared; the new member receives current keys only. Device additions to a member's account also trigger distribution to the new device. Rotation timing matters: messages sent before everyone has the new key must use the old one or wait. It is hard because rotation traffic is quadratic for sender keys, and clients are offline during the change.",
    k: ["Rotate on every removal vs batch periodically: immediate rotation gives the strongest guarantee and costs bandwidth for each change; batching lets a removed member read briefly.", "Share history with new members vs not: sharing helps usability and breaks the guarantee that joiners cannot read the past."],
    p: ["Sending new messages under the old key while rotation is in flight lets the removed member read them.", "Rotation to a stale member list distributes new keys to a device that was already removed."],
    v: "Remove a member while another is offline, send messages, and bring the offline one back. The removed member cannot decrypt any message after removal, and the returning member decrypts all of them after receiving the new key.",
    dep: ["sender-keys","tree-key-agreement","group-membership","device-fanout"]
  },
  "group-state-sync": {
    s: "Distributes group state changes, such as membership and settings, to all members, including those offline, with versioning that detects missed changes.",
    d: "Each change increments a group version and carries a reference to the previous one. Members who receive a message tagged with a newer version than they have fetch the missing state from the group service or from a peer. Notifications of changes are sent in the group message stream. Receivers apply them in order and verify signatures. It is hard because changes can arrive before the messages that depend on them, a member may be removed and not know, and state must be fetched without telling the server who is asking about which group.",
    k: ["Version number checked on each message vs periodic polling: per-message checks catch lag immediately at tiny cost; polling is simpler and slower.", "Full state snapshot on fetch vs deltas: snapshots are simple and bandwidth heavy for large groups; deltas are compact and need history."],
    p: ["Applying a change out of order produces a member list that never existed.", "A removed member who never fetches the update keeps sending to the old group state."],
    v: "Make five changes while a member is offline, then send a message. On reconnect the member sees the version gap, fetches state and arrives at the same member list and settings as everyone else.",
    dep: ["group-membership","delivery-service","message-envelope"]
  },
  "linked-devices": {
    s: "The set of additional devices belonging to one account, each with its own keys and sessions, receiving copies of messages and syncing state with the primary.",
    d: "Each linked device has its own identity key and its own pairwise sessions with every contact device, so there is no shared private key. The account holds a signed list of devices. Contacts see the list in bundle responses and encrypt to every device. Linked devices receive copies of sent messages as sync messages and maintain their own history. It is hard because each added device multiplies encryption work for every sender, history cannot come from the server, and a rogue device addition is the most direct way to read an account.",
    k: ["Independent keys per device vs one shared account key: independent keys isolate compromise and cost per-device sessions; a shared key is cheap and compromises everything at once.", "Primary-device-dependent vs fully independent linked devices: a primary simplifies recovery and fails when the phone is offline."],
    p: ["Adding a device without a visible notice to the user and contacts enables silent eavesdropping.", "Treating a device that has been offline for months as active makes senders encrypt to a dead device forever."],
    v: "Link a second device, send a message from a contact, and confirm it reaches both with independent sessions; confirm unlinking stops delivery and the contact's next send omits the device.",
    dep: ["device-identity-keys","device-linking","device-list-management","device-fanout"]
  },
  "device-fanout": {
    s: "Encrypts a message separately for each recipient device, and for the sender's own other devices, and submits all copies in one request.",
    d: "The sender looks up the recipient's device list, loads or creates a session with each, encrypts the same plaintext once per device and sends the set to the delivery service, which places each copy in that device's queue. A sync copy goes to the sender's own other devices. If the device list is stale, the server rejects with the current list and the client retries. It is hard because cost scales with devices times recipients, stale device lists cause silent loss, and partial failure must not leave some devices without a copy.",
    k: ["Server rejects stale device lists vs accepts and drops: rejection forces correctness and a retry; accepting is lenient and loses messages for new devices.", "Encrypt per device vs per user with shared key: per device preserves independent sessions at linear cost; shared key is cheaper and breaks isolation."],
    p: ["Sending to the cached device list without a freshness check misses a newly linked device for days.", "A failure on one device's encryption aborting the whole send blocks all other recipients."],
    v: "Add a device to a recipient and send immediately from a client with a stale list. The server rejects with the new list, the retry reaches all devices, and exactly one copy arrives on each.",
    dep: ["session-state-store","device-list-management","delivery-service","message-envelope"]
  },
  "device-linking": {
    s: "The protocol that adds a new device to an account by scanning a code or entering a short secret on the existing device, authenticating the new device's keys.",
    d: "The new device displays a code containing an ephemeral public key. The existing device scans it, establishes an encrypted channel with it, verifies the user's intent, and sends account credentials plus authorization to register the new device. The new device uploads its own identity and prekeys, and the signed device list is updated. Contacts are notified. It can optionally transfer settings and history. It is hard because linking is the highest-risk operation, must resist phishing codes shown by an attacker, and must work with users near each other.",
    k: ["Code scanned at close range vs code typed remotely: scanning proves proximity and resists remote phishing; typed codes work when the camera does not and can be socially engineered.", "Require explicit confirmation on the existing device vs automatic: confirmation stops silent additions and adds friction."],
    p: ["A user tricked into scanning an attacker's code links the attacker's device.", "Linking codes that never expire let a photographed code be used later."],
    v: "Scan a code to link a device and see an explicit confirmation on the primary and a notice in the timeline. Let a code age past its lifetime and confirm that scanning it is refused.",
    dep: ["device-list-management","device-identity-keys","prekey-bundle-service"]
  },
  "device-list-management": {
    s: "Maintains the authoritative, signed list of an account's devices and distributes changes so contacts encrypt to exactly the right set.",
    d: "The server stores device identifiers and identity keys per account, and the account signs a version of the list. Clients show and revoke devices, and inactive devices are pruned after a period. Senders fetch the list at send time or cache it with a version that the server checks. Revocation takes effect for future messages only. It is hard because the server controls the list unless signatures or transparency protect it, revoked devices may hold queued messages, and stale lists on any sender cause lost or leaked deliveries.",
    k: ["Account-signed device list vs server-asserted list: signing lets contacts detect a server adding a device; server assertion is simple and trusts the server.", "Prune idle devices automatically vs keep until revoked: pruning limits cost and stale exposure and surprises users who return after a long trip."],
    p: ["An unsigned list lets a compromised server add a device to every account and read future messages.", "Pruning a device that is merely offline desynchronizes its sessions without warning."],
    v: "Revoke a device and confirm that new messages from contacts omit it. Have the server inject an extra device in a test and confirm clients reject it for lacking a valid account signature.",
    dep: ["device-identity-keys","account-service","key-transparency"]
  },
  "account-transfer": {
    s: "Moves an account and optionally history from an old device to a new one, directly between them, without the server holding readable data.",
    d: "The devices establish an encrypted local channel using a scanned code over a direct network link or short-range wireless. The old device sends the database, attachments and settings, and may deactivate afterward. The new device generates fresh keys and sessions; contacts see a key change unless identity continuity is signed. Without the old device, restore falls back to an encrypted backup. It is hard because transfers are large, interrupted transfers need resuming, and copying live ratchet state would duplicate sessions on two devices.",
    k: ["Direct device-to-device transfer vs through cloud backup: direct transfer is private and needs both devices present; backup works after loss and depends on the recovery key.", "Transfer identity key vs generate new on the new device: transferring avoids contact warnings and clones a key; new keys are cleaner and alarm contacts."],
    p: ["Copying ratchet state to a new device while the old one stays active leads to duplicate keys and broken sessions.", "A transfer channel without an authenticated code can be intercepted by a nearby attacker."],
    v: "Transfer an account between two test phones with a large history, interrupt at half, and resume. The new phone shows all messages, the old phone is deactivated, and contacts' next message reaches only the new one.",
    dep: ["device-linking","client-database","encrypted-backup","device-identity-keys"]
  }
});
