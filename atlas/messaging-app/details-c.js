// Details for the messaging plate, part 3: verification and privacy, delivery, connections.
ATLAS.details("messaging-app", {
  "safety-numbers": {
    s: "A fingerprint derived from two parties' identity keys that users compare, by reading digits or scanning a code, to confirm no one is intercepting.",
    d: "Both clients compute the same value from the pair of identity keys and account identifiers, shown as a numeric string and a scannable code. Users compare in person or over another channel; a match marks the conversation verified. The value changes if either identity key changes. Some designs use a hash chain over devices. It is hard because almost no one verifies, comparison across screens is error-prone, and the value must remain stable across harmless events such as adding a linked device while changing on real key replacement.",
    k: ["Per-pair fingerprint vs per-account fingerprint: per-pair binds both parties and changes with either; per-account is shorter to verify and reveals less about which pair was checked.", "Numeric digits vs scannable code only: digits work over voice and are tedious; scanning is quick and needs proximity."],
    p: ["A fingerprint that changes whenever a linked device is added trains users to ignore warnings.", "Displaying the number without explaining what to do makes verification meaningless."],
    v: "Two users compare numbers in person and match; after one reinstalls the app, both see a changed number and a warning, and the verified mark is cleared.",
    dep: ["device-identity-keys","key-change-warnings"]
  },
  "key-change-warnings": {
    s: "Detects when a contact's identity key differs from the one first seen and informs the user, optionally blocking sends until accepted.",
    d: "The client stores the identity key for each contact on first use, then compares on every bundle fetch and every received session start. A change inserts a timeline notice and, depending on policy and verification state, pauses sending. Legitimate causes are reinstalls and new phones, so warnings are frequent. Verified contacts get a stronger warning and may require explicit acceptance. It is hard to word warnings so they are neither alarming noise nor ignorable, and to ensure no code path silently trusts a new key.",
    k: ["Trust on first use vs prior verification only: TOFU needs no effort and trusts the first server answer; verification-only is strong and unusable for most people.", "Block sending until accepted vs warn and continue: blocking prevents leaking to an interceptor and interrupts normal conversations."],
    p: ["Auto-accepting changed keys for convenience nullifies protection against substitution.", "A warning shown only in a rarely opened screen goes unseen while messages continue to the new key."],
    v: "Reinstall a contact's app and send them a message. The sender sees a visible notice in the conversation, sending to a verified contact pauses, and accepting records the new key.",
    dep: ["device-identity-keys","session-state-store","safety-numbers"]
  },
  "key-transparency": {
    s: "A public, append-only log of account-to-key bindings that clients audit, so a server cannot hand out fake keys to some users without leaving evidence.",
    d: "The server maintains a verifiable data structure of identifier-to-key mappings with each update appended. Clients receive proofs of inclusion for the keys they are given and consistency proofs that the log only grew, and may gossip tree heads to detect forks. Monitors check their own entries. Privacy constraints mean lookups should not reveal the queried identifier to others. It is optional and heavy: it needs auditors, efficient proofs and a way to show users a failure meaningfully. Hard parts are proofs for frequent key changes and keeping the structure private.",
    k: ["Transparency log vs manual safety-number checks: the log gives automatic, population-wide detection and needs auditors; manual checks need no infrastructure and almost no one does them.", "Private lookups through a verifiable map vs a public key list: private maps hide the social graph at higher cost; public lists are simpler and enumerable."],
    p: ["Clients that skip proof verification on error provide a log nobody checks and a false sense of safety.", "An absent auditor makes a split-view attack undetectable even with perfect proofs."],
    v: "Have the server present a different key for one user to one client. The client's proof check or the monitor's consistency check fails and reports it, and normal lookups verify within the latency budget.",
    dep: ["prekey-bundle-service","device-identity-keys","account-service"]
  },
  "sealed-sender": {
    s: "Hides the sender's identity from the server by encrypting it inside the message, authorizing delivery with a token the recipient derived, not with the sender's login.",
    d: "The sender wraps the message and a sender certificate in an outer layer encrypted to the recipient's identity key, and sends it without authenticating as itself. The server checks a delivery access token or a rate budget and queues it. The recipient decrypts the outer layer, verifies the certificate and then the inner message. The server then sees only the destination and a timestamp, not who sent it. It is hard because the server still sees network addresses, abuse control must work without sender identity, and certificates must expire quickly.",
    k: ["Sealed sender with access tokens vs authenticated sends: sealing hides the sender and makes abuse control rely on tokens and limits; authenticated sends make control easy and show the graph.", "Short-lived sender certificates vs long: short certificates limit replay and revocation needs; long ones are cheaper to renew."],
    p: ["Sending sealed messages from an identifiable IP address lets the server correlate sender and recipient anyway.", "Accepting sealed messages from anyone without tokens lets unknown senders spam without limit."],
    v: "Inspect server logs and requests for a sealed message. No sender account or number appears, the recipient still identifies and authenticates the sender, and an invalid token is rejected.",
    dep: ["delivery-tokens","device-identity-keys","delivery-service","metadata-minimization"]
  },
  "delivery-tokens": {
    s: "Capabilities, derived from a shared profile secret, that authorize an unauthenticated sender to deliver to a recipient, so strangers cannot reach a user who has not shared anything.",
    d: "A recipient derives an access key from their profile key and gives it to contacts through profile sharing. A sender presents a token computed from that key; the server stores only a verifier. Users can disable the requirement for unknown senders or rotate the key to cut off a contact. Groups use their own tokens. It lets servers enforce who may send without learning who sent. It is hard to rotate cleanly, to let new contacts reach a user who wants them, and to handle senders who have no token yet.",
    k: ["Token required unless disabled vs open delivery: required tokens block cold abuse at the cost of friction for legitimate first contact; open delivery is easy and invites spam.", "One shared key per user vs per-contact tokens: one key is simple and cannot revoke a single contact; per-contact tokens revoke precisely and multiply state."],
    p: ["Leaked tokens circulating on public lists give strangers permanent delivery rights.", "Rotating the key without redistributing it to current contacts silently cuts off friends."],
    v: "Send with a valid token and with none, with an expired one after rotation. Only the valid one is accepted, and disabling the requirement lets an unknown sender through as intended.",
    dep: ["profile-encryption","delivery-service"]
  },
  "metadata-minimization": {
    s: "The discipline of designing every protocol message, log and database so the server learns the least possible about who talks to whom, when and how much.",
    d: "It is a set of choices across layers: sealed sender, short retention of queues, no logs of recipient and sender pairs, padded message sizes, batched receipts, anonymous credentials, and private contact discovery. Servers keep only what delivery needs, such as an account identifier and a queue, and drop it on delivery. Network-level exposure, like IP addresses and timing, remains and can be reduced with relays. It is hard because each convenience feature adds a field or a log, and the pressure to debug and fight abuse pushes data collection up.",
    k: ["Collect nothing by default vs collect for abuse and debugging: minimal data limits what can be disclosed or stolen and limits investigations; richer logs help operations and expand legal exposure.", "Hide network addresses with relays vs accept them: relays remove the strongest identifier and add cost and latency."],
    p: ["A debugging log added during an incident quietly retains sender-recipient pairs for years.", "Message size and timing patterns reveal conversation partners to a network observer even when content is protected."],
    v: "Audit server storage, logs and traces after a day of test traffic. They contain no sender-recipient pairs, no message sizes beyond buckets, and queue data is gone after delivery.",
    dep: ["sealed-sender","observability","queue-expiry"]
  },
  "contact-discovery": {
    s: "Finds which entries in a user's address book use the service without uploading the address book in a form the server can read or store.",
    d: "The client derives lookup values from each contact identifier and queries a service that returns matches. Naive hashing is insufficient because phone numbers have few possibilities and are quickly reversed. Stronger designs use private set intersection, where neither side learns the other's non-matching entries, or have the client send queries to hardware-isolated code whose behavior is attested. Results are limited and refreshed periodically. It is hard because the identifier space is small, the lookup is costly at address book scale, and attackers can enumerate numbers by querying.",
    k: ["Private set intersection vs hardware-isolated lookup: set intersection relies only on cryptography and costs heavy bandwidth and compute; hardware lookup is efficient and trusts the hardware vendor and attestation.", "Discover automatically vs on demand: automatic is convenient and uploads book data repeatedly; on demand limits exposure."],
    p: ["Hashing phone numbers and sending the hashes lets the server recover the whole address book in minutes.", "Unlimited discovery queries let attackers enumerate every registered number."],
    v: "Run discovery with a test address book while capturing server-side storage and traffic. Matching works, the server cannot reconstruct non-matching entries, and a bulk enumeration attempt is throttled.",
    dep: ["hardware-isolated-lookup","rate-limiter","account-service"]
  },
  "hardware-isolated-lookup": {
    s: "A server-side program that runs in an attested isolated environment, so clients can verify the exact code processing their private queries and the operator cannot read them.",
    d: "The service runs inside a hardware-protected enclave whose memory is encrypted. It proves to clients, through a signed attestation, which code is running. The client establishes a secure channel bound to that attestation, then submits queries such as contact lookups or PIN guess counting. Access patterns are hidden with oblivious data structures, because memory addresses can leak. It underpins both contact discovery and recovery limits. It is hard because side-channel attacks have repeatedly broken such environments, code must be reproducible so users can audit it, and data must replicate across enclaves.",
    k: ["Trust attested hardware vs cryptography only: hardware enables efficient private computation and adds the vendor and side channels to the trusted base; cryptography-only removes them and costs more.", "Oblivious memory access vs plain lookups: oblivious access hides query patterns and multiplies compute and memory."],
    p: ["Skipping attestation verification on the client reduces the whole mechanism to trusting the operator.", "A side-channel flaw patched on the server but accepted by old clients leaves queries exposed."],
    v: "Verify an attestation against the published measurement of the open code, change the code and confirm clients reject the new measurement, and confirm a PIN guess counter survives a restart of the service.",
    dep: ["rate-limiter","account-service"]
  },
  "profile-encryption": {
    s: "Keeps names, photos and settings encrypted under a profile key shared only with chosen contacts, so servers store profiles they cannot read.",
    d: "Each user generates a profile key. Profile fields are encrypted with it and uploaded; the server stores ciphertext and a version commitment. The key is shared with contacts and group members through encrypted messages, and the server never receives it. Contacts fetch and decrypt profiles, and the same key derives delivery tokens. Credentials may prove group membership without revealing identity. It is hard because the key cannot be revoked per contact without rotating it, new contacts need the key before they can see anything, and profile fetches reveal social ties unless made anonymous.",
    k: ["Single profile key shared with contacts vs per-contact keys: a single key is simple and rotating cuts off everyone; per-contact keys revoke individually and multiply storage.", "Anonymous profile fetch vs authenticated: anonymous fetch hides who looks at whom and needs capability-style access control."],
    p: ["Sharing the profile key automatically with message requests from strangers exposes the name and photo.", "Unencrypted fallback fields, such as a photo thumbnail, defeat the scheme."],
    v: "Fetch a stored profile from the server and confirm all fields are ciphertext, share the key with a contact and confirm they decrypt, then rotate and confirm the old key no longer decrypts new versions.",
    dep: ["message-envelope","object-storage"]
  },
  "message-envelope": {
    s: "The wire format that wraps one encrypted payload with the minimum routing information the server needs, plus protocol version and message type.",
    d: "An envelope carries a type such as ordinary message, handshake, sealed or receipt, the destination device, a version, a server-assigned timestamp and id, and an opaque ciphertext. Inside, after decryption, a structured content record holds text, attachment pointers, quotes, timers and sync data, then padding. Serialization uses a compact binary schema with explicit field numbers for forward compatibility. It is hard because every field outside the ciphertext is visible to the server, unknown fields must be ignored safely, and parsing untrusted input is a main attack surface.",
    k: ["Few cleartext fields vs richer cleartext for routing: minimal cleartext limits metadata and makes routing features such as priority harder.", "Schema with explicit evolution rules vs free-form maps: schemas are compact and safe to evolve; free-form is flexible and hard to validate."],
    p: ["Adding a convenient cleartext field, like message type detail, silently leaks behavior to the server.", "A parser that fails on unknown fields breaks old clients the moment the protocol grows."],
    v: "Capture an envelope and list every cleartext field; confirm each is on the documented list. Feed fuzzed and future-version envelopes to a client and confirm safe rejection or graceful ignoring.",
    dep: ["protocol-versioning"]
  },
  "delivery-service": {
    s: "The server component that accepts encrypted envelopes for devices, places them in queues and delivers them over live connections or on the next connect.",
    d: "It validates the sender's authorization, checks the destination device list for freshness, writes each envelope to the target device's queue and, if the device is connected, pushes it immediately and triggers a wakeup otherwise. It removes entries on acknowledgment. It sees only routing data, never plaintext. It must be fast, since latency is the product, and durable enough that accepted messages are not lost. It is hard because it fans out groups, enforces quotas, and stays correct during failover without duplicating or losing deliveries.",
    k: ["Write to durable queue before acknowledging the sender vs acknowledge after delivery: durable first makes accepted messages safe and costs a write per message; later acknowledgment is fast and risks loss.", "Push to connected devices directly vs always via queue: direct push is lowest latency and needs reconciliation with the queue."],
    p: ["Acknowledging the sender before the queue write commits loses messages on a crash.", "Fan-out to a large group inline blocks the sender request for seconds."],
    v: "Kill a delivery node mid-burst of ten thousand messages. After failover every accepted message is delivered to its device once, and no message was acknowledged to a sender that was not queued.",
    dep: ["device-queues","connection-gateway","push-gateway","sender-authorization","rate-limiter"]
  },
  "device-queues": {
    s: "A durable first-in first-out queue per recipient device that holds encrypted envelopes until the device collects and acknowledges them.",
    d: "Each device has its own queue keyed by account and device, with entries ordered by server arrival and given an id. Writes append, reads stream from the oldest unacknowledged entry, and acknowledgment deletes. Queues have size caps and a retention time. Hot queues stay in memory with a persistence log behind them, and idle ones live on disk. It is hard because millions of mostly empty queues must be cheap, a few huge ones must not harm neighbors, and queue state must survive node failure with exact once semantics as seen by the client.",
    k: ["Queue per device vs per account with device cursors: per-device queues are simple and copy data per device; per-account is compact and complicates deletion and ordering.", "Cap by count vs by bytes: counts are simple and let large messages exhaust storage; bytes bound cost and reject varied loads."],
    p: ["Unbounded queues for devices that never return grow until they harm storage for everyone.", "Dropping the oldest entries on overflow silently loses messages without telling the recipient."],
    v: "Fill a queue to its cap, confirm the next send gets a defined error and the overflow policy fires, then drain it and confirm all entries arrive in server order and are deleted after acknowledgment.",
    dep: ["message-store","server-sequencing","queue-expiry"]
  },
  "server-sequencing": {
    s: "Assigns each envelope in a queue a monotonically increasing position and timestamp, giving clients a consistent order and a cursor for resuming.",
    d: "On accepting an envelope the service assigns the next sequence value within the destination queue and records the server time. Clients use sequence numbers to resume, detect gaps and deduplicate redelivery. The server timestamp helps clients order messages from different senders and bounds clock skew. Sequence is per queue, not global, so no global bottleneck exists. It is hard because assignment must stay monotonic across failover, timestamps from different servers disagree slightly, and exposing precise server time can feed timing attacks.",
    k: ["Per-queue sequence vs global timestamp ordering: per-queue sequence scales and gives only local order; global ordering is meaningless across devices.", "Exact server timestamps vs coarse: exact times help ordering and leak timing; coarse times reduce leakage and blur order."],
    p: ["Sequence numbers that reset after a failover make clients skip or repeat messages.", "Trusting server time for security decisions such as expiry lets a compromised server manipulate them."],
    v: "Send from two senders concurrently to one device and fail over the queue owner. Sequence numbers remain strictly increasing, with no repeats, and the device's resume cursor lands on the right entry.",
    dep: ["device-queues"]
  },
  "ack-and-redelivery": {
    s: "The handshake in which the client confirms each envelope was durably processed, and the server resends anything unacknowledged after reconnect or timeout.",
    d: "The client acknowledges after it has decrypted the envelope and committed the plaintext and state in one transaction. The server deletes the entry only on acknowledgment. If the connection drops first, the entry is delivered again, so the client must recognize duplicates by id or by the ratchet counter. Acknowledgments may be batched. It gives at-least-once delivery. It is hard because an acknowledgment sent before the commit loses messages on a crash, and one sent too late causes large redelivery storms after reconnect.",
    k: ["Acknowledge after commit vs on receipt: after commit is safe and slower; on receipt is fast and loses messages if a crash intervenes.", "Per-message acks vs cumulative: per-message acks are precise and chatty; cumulative acks are compact and require strict order."],
    p: ["Acknowledging before the database commit loses a message permanently when the app is killed.", "Failing to deduplicate redelivered envelopes shows duplicate messages or burns ratchet keys."],
    v: "Kill the client between decrypt and acknowledge for each message in a burst. After restart every message appears once, the server queue is empty, and no ratchet error occurs.",
    dep: ["device-queues","client-database","message-deduplication"]
  },
  "receipt-routing": {
    s: "Carries delivery and read receipts from the recipient back to the sender's devices, as encrypted messages that travel the same path as ordinary ones.",
    d: "A receipt is a small content record referencing original messages, wrapped and fanned out like any other message to every device of the sender. The server cannot distinguish it from a message. Delivery receipts can be generated automatically at commit; read receipts depend on user activity and settings. They may use lower priority queues and batching. It is hard because receipts double message counts, must not be generated for senders who are blocked, and the sender's queue accepting them must tolerate floods in big groups.",
    k: ["Receipts as full messages vs a lightweight server-visible signal: full messages hide the information from the server and double traffic; visible signals are cheap and leak read behavior.", "Disable receipts in large groups vs always send: disabling prevents fan-in floods and removes useful information."],
    p: ["Receipts sent to a blocked sender reveal that the blocked user's message was read.", "Group receipts from thousands of members overwhelm the sender's queue and their device."],
    v: "Send to a group of 500 and confirm receipt traffic stays within the configured cap, individual chats show delivery then read, and a blocked sender gets none.",
    dep: ["delivery-service","message-envelope","receipts-and-typing"]
  },
  "ephemeral-relay": {
    s: "A fast path for signals that need no storage or retry, such as typing indicators and call ringing, delivered to connected devices only.",
    d: "Ephemeral envelopes go to the delivery service flagged as non-durable. If the target device has a live connection, the service forwards at once; otherwise it drops, or for calls triggers a wakeup. Nothing is written to a queue. Payloads are still end-to-end encrypted. Rate limits are tighter because they bypass queue quotas. It is hard because some ephemeral messages, such as call offers, need delivery guarantees that conflict with the model, and because the path is easy to abuse for harassment.",
    k: ["Drop when offline vs queue briefly: dropping is cheap and loses signals such as call offers; brief queueing rescues them and reintroduces storage.", "Separate channel vs flag on the normal path: a separate path isolates load and duplicates auth code; a flag is simple and mixes workloads."],
    p: ["Treating call offers as ephemeral drops them whenever the recipient's connection has just dropped.", "Typing signals to large groups create unbounded fan-out when each keystroke is sent."],
    v: "Send typing events to an offline and an online device. The online device shows it within a second, the offline device never receives it later, and the server stores nothing.",
    dep: ["delivery-service","persistent-connection","rate-limiter"]
  },
  "queue-expiry": {
    s: "Rules that delete undelivered envelopes after a retention period and bound queue size, so the server never holds ciphertext indefinitely.",
    d: "Each queue entry has a time to live, often a few weeks. A sweeper removes expired entries; the queue also enforces maximum counts and bytes. When a device is gone for longer than retention, its undelivered messages are lost and the sender is not told unless a session reset happens. Dormant devices may be deregistered. The policy balances reliability for travelers against exposure and storage costs. It is hard because expiry must be invisible to well-behaved senders and visible enough for the recipient to know a gap exists.",
    k: ["Short retention vs long: short retention minimizes stored data and drops messages for long-offline devices; long retention helps them and enlarges the breach surface.", "Notify the sender of expiry vs silent drop: notice helps resend and reveals device inactivity."],
    p: ["A sweeper that lags creates queues far over their intended lifetime.", "Messages expiring without any signal leave conversations with silent gaps users never learn about."],
    v: "Leave a device offline past the retention period and verify the server holds no envelopes for it, the device shows a gap marker on return, and storage metrics drop at the expected rate.",
    dep: ["device-queues","message-store"]
  },
  "message-deduplication": {
    s: "Recognizes the same message arriving twice, through redelivery or retry, and processes it exactly once on the client.",
    d: "Clients check an envelope's server id and the message's client id before applying it, and the ratchet counter independently refuses to decrypt the same message key twice. The sender uses a stable client id across retries, and the server may reject duplicate submissions seen recently. Dedup records are kept for at least the retention window. It is hard because dedup state must be small and durable, because ids are only unique if clients generate them correctly, and because crashes can occur at any point between steps.",
    k: ["Rely on ratchet counters vs explicit id table: counters need no extra state and only catch encrypted-layer duplicates; an id table also catches retries with fresh ciphertexts.", "Server-side dedup window vs client-only: server dedup saves bandwidth and costs memory; client-only is sufficient and sees every copy."],
    p: ["An id table pruned shorter than the queue retention lets old redeliveries appear as new messages.", "Client ids generated per attempt instead of per message make every retry look unique."],
    v: "Submit the same message three times with the same client id and replay an acknowledged envelope. The recipient shows one message and the replay leaves state and ratchets unchanged.",
    dep: ["message-envelope","client-database"]
  },
  "persistent-connection": {
    s: "A long-lived authenticated channel from the app to the server over which new envelopes are pushed and acknowledgments, requests and ephemeral signals flow.",
    d: "The client opens a connection over a standard secure transport upgraded to a bidirectional stream, authenticates, and keeps it open while the app is in the foreground or permitted background. The server pushes envelopes as they arrive and the client sends acknowledgments and requests multiplexed on the same stream. Messages are framed with sizes and request ids. It is hard because mobile networks silently drop connections, operating systems suspend the app, middleboxes close idle flows, and each held connection costs server memory.",
    k: ["WebSocket-like stream vs request polling: a stream gives instant delivery and costs idle connections; polling is stateless and slow and battery heavy.", "One multiplexed connection vs several: one saves battery and handshakes; several isolate heavy transfers from latency-sensitive messages."],
    p: ["Treating an open socket as healthy when the network path is dead delays messages until the operating system notices.", "Holding connections in background on mobile drains battery and gets the app killed."],
    v: "Send messages to a foregrounded client and observe delivery under one second. Disable the network path without closing the socket and confirm the client detects the failure and reconnects within the liveness limit.",
    dep: ["connection-gateway","keepalive-liveness","reconnection-backoff"]
  },
  "connection-gateway": {
    s: "The server tier that terminates client connections, authenticates them, tracks which device is connected where, and bridges them to the delivery service.",
    d: "Gateways hold hundreds of thousands of connections each, run the secure transport handshake, validate credentials, register the device in the presence registry and subscribe to its queue. They parse frames, apply per-connection rate limits and forward requests to backends. They shut down gracefully during deploys by asking clients to reconnect elsewhere. It is hard because memory per connection must be tiny, deploys cause reconnection storms, and the gateway sees the network address of every user, making its logs sensitive.",
    k: ["Stateful gateways with registry vs stateless routing: stateful is efficient for push and requires registry accuracy; stateless is simple and slower for delivery.", "Graceful drain with reconnect hints vs hard restart: drain avoids storms and lengthens deploys."],
    p: ["A deploy that drops all connections at once triggers a reconnection storm that overloads authentication.", "Stale registry entries after a gateway crash send pushes to nowhere until they time out."],
    v: "Roll the gateway fleet during peak load and confirm connections migrate over minutes without an authentication spike, the registry shows correct locations and no accepted message is delayed beyond the limit.",
    dep: ["presence-registry","connection-sharding","delivery-service"]
  },
  "reconnection-backoff": {
    s: "Client logic that restores a dropped connection with randomized, growing delays and fast retry on network changes, so outages do not become stampedes.",
    d: "On disconnect, the client waits a short random delay, retries, and doubles the delay with jitter up to a ceiling. It resets after a stable connection. It resets immediately on signals such as network change or the app returning to the foreground. Servers may send retry hints. After reconnect, the client drains queues and flushes the outbox. It is hard because too aggressive retrying overloads servers after an outage, too passive makes messages late, and each platform has its own restrictions on background activity.",
    k: ["Exponential backoff with jitter vs fixed interval: jitter spreads the load after outages and delays recovery for unlucky clients; fixed is predictable and synchronizes a stampede.", "Retry immediately on network change vs wait for backoff: immediate retry restores delivery quickly and can hammer a dead server."],
    p: ["Backoff without jitter makes millions of clients retry on the same second after an outage.", "Never resetting the delay leaves a client stuck at the maximum interval long after the network recovered."],
    v: "Simulate a ten-minute outage with ten thousand test clients. Reconnects spread over the window without exceeding the server's connection rate limit, and each client resumes within seconds of a network change.",
    dep: ["persistent-connection","offline-sync-engine"]
  },
  "keepalive-liveness": {
    s: "Periodic small messages that keep idle flows open through middleboxes and let each side detect a dead peer within a bounded time.",
    d: "Each side sends pings at an interval chosen below typical network address translation timeouts and expects a reply within a deadline; missing replies mark the connection dead. Intervals adapt to network type and are longer in the background to save battery. Servers also use them to clean up connections. It is hard because there is no value that works everywhere: a short interval wastes power and radio wakeups, a long one lets flows be dropped, and detecting loss quickly risks false positives on slow links.",
    k: ["Short fixed interval vs adaptive: fixed is simple and burns battery; adaptive learns what the network tolerates and takes complexity.", "Application-level pings vs transport keepalives: application pings prove the whole stack is alive; transport keepalives are cheaper and only prove the socket."],
    p: ["Intervals longer than the carrier's timeout silently drop the flow and delay messages.", "Frequent pings on cellular keep the radio awake and drain the battery."],
    v: "Leave a client idle on a network with a short idle timeout for an hour. The connection stays up or reconnects within the target, battery use stays within budget, and a pulled cable is detected within the deadline.",
    dep: ["persistent-connection"]
  },
  "push-gateway": {
    s: "Server component that asks the platform push service to wake a device when messages are waiting, sending no message content or sender.",
    d: "When an envelope arrives for a device with no live connection, the delivery service calls the push gateway with the device's push token. The gateway sends a minimal payload, often just a wake flag, through the platform push service. Tokens are registered by the client and rotate; invalid-token responses cause removal. Notifications are coalesced so bursts produce a single wakeup. It is hard because the push service is a third party that sees timing and device identity, delivery is not guaranteed, and platforms throttle apps that wake too often.",
    k: ["Wake-only push vs encrypted content in push: wake-only leaks almost nothing and needs the app to fetch; encrypted content is faster and exposes more through third-party systems.", "Coalesce bursts vs one push per message: coalescing avoids throttling and delays individual alerts."],
    p: ["Putting sender names or text in push payloads sends them through third-party servers in readable form.", "Not removing invalid tokens wastes sends and leaves users without wakeups after a token change."],
    v: "Capture the outgoing push request for a message. The payload holds no sender, text or conversation, the device wakes and fetches, and a burst of fifty messages causes a bounded number of pushes.",
    dep: ["content-free-wakeup","delivery-service"]
  },
  "content-free-wakeup": {
    s: "The design rule and mechanism by which push notifications carry only a signal to connect, so third-party push infrastructure never sees message content or metadata.",
    d: "The push payload is empty or contains a random token with no meaning outside the device. On receipt, the client starts a background task, connects, drains its queue, decrypts and displays notifications locally. Platforms that require visible content in the payload to wake the app are handled with a placeholder the client replaces. Message priority is a single bit. It is hard because platform rules may demand a visible alert, wakeups can be delayed or dropped and the background time allowed is a few seconds.",
    k: ["Silent wake vs visible placeholder alert: silent wakeups are quiet and platforms may throttle them; placeholders are reliable and show a generic alert that is then replaced.", "Priority bit in the payload vs none: a bit lets urgent messages wake devices faster and leaks that the message was urgent."],
    p: ["A placeholder that is never replaced when the fetch fails leaves users with meaningless alerts.", "Including conversation identifiers in the payload leaks the social graph to the push provider."],
    v: "Inspect push provider traffic for a message sent to a locked, idle device. The payload has no readable identifiers, the notification appears with decrypted content within a few seconds, and no placeholder remains.",
    dep: ["push-gateway","background-fetch-handler"]
  },
  "background-fetch-handler": {
    s: "The short-lived code that runs when a wakeup arrives: connect, collect queued envelopes, decrypt, store, acknowledge and hand off to notifications within platform time limits.",
    d: "It runs in an extension or background task with strict time and memory budgets, often in a different process from the main app. It opens the database, takes a cross-process lock around session state, drains the queue, writes plaintext and updated sessions in transactions, acknowledges, and posts notifications. If time runs out it stops cleanly and lets the next wake finish. It is hard because the budget is small, concurrent access with the app risks corrupting ratchets, and failures are invisible to the user.",
    k: ["Extension process decrypts vs main app only: an extension works with the app dead and needs shared storage and locking; main-app-only is simpler and fails when the app is not running.", "Drain fully vs fetch a bounded batch: full drain finishes in one wake and may exceed the budget; batches are safe and need repeated wakes."],
    p: ["Both processes decrypting from the same session at once reuse keys and permanently break it.", "Exceeding the time budget gets the extension killed mid-transaction."],
    v: "Wake the extension with 500 queued messages while the app is also running. All messages decrypt once, sessions stay valid, the extension exits within its budget, and any remainder is picked up on the next wake.",
    dep: ["persistent-connection","client-database","session-state-store","notification-presenter"]
  }
});
