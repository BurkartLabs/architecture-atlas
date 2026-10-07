// Details for the messaging plate, part 1: client experience, calls, local data, attachments.
ATLAS.details("messaging-app", {
  "conversation-list": {
    s: "The home screen listing every conversation with its latest message preview, unread count, mute and pin state, ordered by recent activity.",
    d: "It is a live query over the client database, joined with per-conversation state such as drafts, mute timers and archived flags. Rows update as the sync engine commits new messages, and previews are computed from decrypted local content, never from the server. Ordering by last activity needs a stable sort key that survives edits, deletions and disappearing messages. It is hard at scale: thousands of conversations must scroll smoothly while background writes arrive, and previews must respect privacy settings such as hidden content on a lock screen.",
    k: ["Stored denormalized preview per conversation vs computed join on read: stored previews scroll fast but must be repaired when a message is deleted or expires; joins stay correct and cost CPU.", "Sort by last message time vs last interaction time: message time is simple, interaction time handles drafts and pins but needs extra state."],
    p: ["A preview not refreshed when the latest message disappears keeps showing text that should be gone.", "Unread counts computed separately from read state drift apart across linked devices."],
    v: "Receive a message while the list is open, expire the newest message, then delete it on another device. The row's preview, order and unread badge update each time without a restart.",
    dep: ["client-database","read-state-sync"]
  },
  "message-composer": {
    s: "The input surface where users write text, attach files, record voice notes and mention people, producing a draft that becomes an encrypted outgoing message.",
    d: "It manages rich text and mentions, drafts saved per conversation, attachment staging and quote or reply references. On send it builds a plaintext content structure with a client-generated message id and timestamp, writes it to the outbox and returns control immediately, so the interface never waits on the network. Drafts are stored locally and, being plaintext, fall under database encryption. The hard parts are input method edge cases, large paste handling and making a send idempotent when the user taps twice or the app is killed mid-send.",
    k: ["Write to outbox before encrypting vs encrypt then queue: queuing plaintext keeps retries cheap and survives key changes, but the outbox must itself be encrypted at rest.", "Optimistic local display vs wait for server acceptance: instant display feels responsive but needs visible failed and retry states."],
    p: ["Generating the message id at send time on each retry produces duplicate messages for recipients.", "Drafts left in platform keyboard caches or clipboard history leak text outside the encrypted store."],
    v: "Type text and attach a file in airplane mode, tap send twice, kill the app, reconnect. The recipient receives exactly one message with the attachment and the sender's bubble moves from pending to sent.",
    dep: ["outbox","client-database","attachment-encryption"]
  },
  "timeline-renderer": {
    s: "Draws a conversation's messages as a scrolling timeline, grouping them, loading history in pages, and keeping position stable as new items and media arrive.",
    d: "It reads message pages from the database by sort key, groups adjacent items by sender and time, and renders text, media, quotes, reactions and system events. It keeps scroll anchored when items above the viewport change height, for example when a thumbnail loads or a message expires. Media decrypts lazily and is cached. System events, such as a safety number change or a member joining, are inserted as timeline items from protocol state. Hard problems are virtualization with variable heights, right-to-left and mixed-script text, and rendering safely when content is untrusted.",
    k: ["Windowed pagination from the database vs loading whole history in memory: windows bound memory for years of history but complicate jump-to-message and search results.", "Render from decrypted rows vs decrypt on display: decrypting once at receive time is fast to draw but makes the database the sensitive asset."],
    p: ["Untrusted formatting or very long unbroken strings freeze the renderer for every participant.", "Late-loading media shifts the viewport, so a user who is reading is thrown to a different message."],
    v: "Open a conversation with 50,000 messages, jump to a search hit near the beginning, and scroll while new messages and thumbnails arrive. The anchor message stays still and memory stays under the target.",
    dep: ["client-database","media-download","message-ordering"]
  },
  "reactions-and-replies": {
    s: "Lightweight message interactions such as emoji reactions, quoted replies and edits, carried as small encrypted messages that refer to an earlier message.",
    d: "A reaction or reply is its own encrypted payload naming a target by sender and original timestamp or message id. Receivers attach it to the target locally; if the target is missing, it waits until the target arrives. Edits and deletions follow the same pattern and must be authorized: only the original author may change a message. Groups fan these out like any message. The difficulty is referencing across devices and clients that do not share a database, and handling interactions that arrive before, or without, their target.",
    k: ["Reference target by sender plus timestamp vs server-assigned id: client-chosen references work across devices with no server help, but collisions and spoofing need checks.", "Last-writer-wins reactions vs per-reaction add and remove events: last-writer-wins is compact, events preserve intent under reordering."],
    p: ["Accepting an edit or delete from any group member instead of the original author lets others rewrite history.", "A reaction arriving before its target is dropped and the reaction count never converges."],
    v: "Have two members react to the same message while one device is offline, and let a delete race an edit. After sync, all devices show the same reaction set and the same final message state.",
    dep: ["message-envelope","client-database","message-ordering"]
  },
  "receipts-and-typing": {
    s: "Delivery receipts, read receipts and typing indicators: small status messages that tell a sender what happened to a message and what the other person is doing now.",
    d: "Delivery and read receipts are encrypted messages sent back to the sender's devices, referencing the original message. Typing indicators are ephemeral and may be sent with no storage or retry. Each is optional and controlled by privacy settings, and read receipts are batched to save traffic. Receipts also propagate to the reader's own other devices so unread state converges. They are hard because they reveal behavior: timing leaks when someone is awake, and in groups a receipt per member multiplies traffic and exposes who has read.",
    k: ["Receipts as normal reliable messages vs best-effort ephemeral signals: reliable receipts survive offline gaps but cost queue space; typing only makes sense when ephemeral.", "Per-message receipts vs batched cursor receipts: batching cuts traffic by orders of magnitude but loses per-message precision."],
    p: ["Sending read receipts while the setting is off, because a code path forgot to check it, discloses behavior the user refused.", "Typing events sent through the reliable queue pile up and arrive minutes late."],
    v: "Turn read receipts off, read a message, and confirm no receipt reaches the sender. Turn typing on and confirm indicators appear within a second and are never stored in any queue.",
    dep: ["message-envelope","receipt-routing","ephemeral-relay","read-state-sync"]
  },
  "presence": {
    s: "Showing whether a contact is online or was last seen, which is often omitted or limited because it leaks behavior to anyone who can ask.",
    d: "Presence can be inferred by the server from open connections, then shared either with all contacts, with selected ones, or not at all. When provided it usually travels as an ephemeral signal subscribed to per conversation, with coarse last-seen buckets to blunt timing analysis. Many designs omit it entirely and show only typing and receipts. It is hard because the signal is a surveillance primitive: an unauthorized observer who can subscribe learns sleep schedules and whether a message was seen, and per-contact subscriptions generate heavy fan-out.",
    k: ["No presence vs mutual presence for contacts: none leaks nothing but removes a useful cue; mutual presence needs a contact graph and subscription checks.", "Exact last-seen vs bucketed values: exact is more useful, buckets reduce what an observer can correlate."],
    p: ["Letting anyone who knows an identifier subscribe turns presence into a stalking tool.", "Presence updates to large groups cause a fan-out storm whenever one user reconnects."],
    v: "As an unrelated account, try to subscribe to a user's presence and get refused. As a contact with presence enabled, see online status within seconds and a bucketed last-seen after disconnect.",
    dep: ["presence-registry","ephemeral-relay","metadata-minimization"]
  },
  "disappearing-messages": {
    s: "Per-conversation timers that delete messages and their attachments from every participant's device after a set time, enforced by the clients.",
    d: "The timer setting is itself a protocol message so both sides agree and changes are visible in the timeline. Each message carries its expiry duration; the countdown starts at send or at first read depending on policy. A local scheduler deletes the row, attachment files, thumbnails and search index entries, and notifies other linked devices. Because the server cannot read or enforce it, this is a cooperative promise, not a guarantee against screenshots or modified clients. Hard parts are clock skew, cleaning derived data such as indexes and caches, and expiring while the app is not running.",
    k: ["Timer starts at send vs at first read: sending is simple and bounded; reading respects unread messages but needs read state to propagate and can keep data indefinitely.", "Sender-enforced deletion request vs per-device local timers: local timers work offline, request-based deletion cannot be sure it arrived."],
    p: ["Deleting the message row but leaving the search index, notification or thumbnail cache keeps content readable.", "Relying on device wall-clock time lets a user change the clock to prevent expiry."],
    v: "Send a message with a one-minute timer, then inspect the database, attachment directory, search index and notification history on both devices after expiry. No trace of the content remains.",
    dep: ["client-database","full-text-index","message-envelope","message-ordering"]
  },
  "notification-presenter": {
    s: "Builds the visible notification from locally decrypted content, applying mute rules, preview settings and grouping, after the app wakes up from a content-free push.",
    d: "A push wakeup starts a short background task that fetches and decrypts new messages, then the presenter decides what to show: sender and text, sender only, or a generic line. It honors per-conversation mute, mentions-only mode, hidden previews on the lock screen and notification grouping per conversation. It also removes notifications when a message is read on another device. It is hard because the platform gives a tiny time and memory budget, notifications may be stored by the operating system in plaintext, and a missed wakeup shows nothing at all.",
    k: ["Show message text in the notification vs a generic alert: text is useful but is stored and visible outside the app; generic alerts protect content and reduce usefulness.", "Decrypt in a separate extension process vs in the main app: an extension works when the app is dead but needs shared, locked access to key material."],
    p: ["Two processes decrypting concurrently advance the same ratchet and corrupt the session.", "Notifications left on screen after the message is read elsewhere reveal stale content."],
    v: "With the app force-quit, send a message and see a notification within seconds that respects the preview setting. Read it on a linked device and confirm the first device's notification is removed.",
    dep: ["background-fetch-handler","content-free-wakeup","read-state-sync","session-state-store"]
  },
  "call-signaling": {
    s: "The messages that offer, answer, ring, hang up and exchange network candidates for a call, carried over the encrypted message path or a dedicated authenticated channel.",
    d: "A caller sends an offer describing media capabilities; the callee's devices ring; one device answers and the others stop. Candidates and codec parameters flow as further signals. Signaling is usually encrypted end to end through existing sessions so the server cannot tell the media parameters, though it must route to the right devices. It handles busy, timeout, glare when both sides call each other, and switching networks mid-call. It is hard because it is a distributed state machine over unreliable, delayed messaging, with ringing needing a fast path that ordinary queues do not give.",
    k: ["Signaling over the normal message queue vs a dedicated low-latency channel: reusing the queue reuses encryption and delivery but ringing arrives late; a dedicated channel is faster and needs separate authorization.", "Ring all devices vs one device: all-device ringing matches expectations but needs reliable answered-elsewhere cancellation."],
    p: ["Glare, where both users call at once, leaves two half-open calls and no audio.", "A hangup signal that is delayed behind a queue backlog leaves the other phone ringing for a minute."],
    v: "Call a user with three linked devices while one is on a poor network. All ring within two seconds, answering one stops the others, and a simultaneous mutual call resolves to a single connected call.",
    dep: ["device-fanout","ephemeral-relay","session-state-store","call-key-exchange"]
  },
  "call-key-exchange": {
    s: "Establishes the secret that encrypts call media, delivered inside end-to-end encrypted signaling so relays and the signaling server never learn it.",
    d: "The caller generates fresh key material for the call and sends it, or a public share of it, in an encrypted signaling message to each callee device. Keys are per call and per direction, and may be rotated on a timer or when a participant joins or leaves a group call. Both parties may also show a short authentication string so users can verify the media is not intercepted. It is hard because keys must reach every participant before media starts, group calls need rekeying on membership change, and late joiners must not decrypt earlier media.",
    k: ["Key delivered through existing message sessions vs a separate handshake in the media channel: reusing sessions inherits identity checks, a separate handshake works without message infrastructure but needs its own authentication.", "Static key for the call vs periodic rekeying: static is simple, rekeying limits exposure and removes departed members."],
    p: ["Reusing a call key across calls lets a recorded earlier call be decrypted after a later compromise.", "Sending the key before verifying the callee device list leaks it to a newly added rogue device."],
    v: "Capture relay traffic of a call and attempt to decrypt it with every key the server has seen. It stays opaque. Add a participant mid-call and confirm the new key does not decrypt earlier packets.",
    dep: ["session-state-store","device-fanout","safety-numbers"]
  },
  "ice-negotiation": {
    s: "Finds a network path between two call participants by gathering candidate addresses, testing pairs, and choosing a working route, preferring direct connections.",
    d: "Each side gathers host addresses, server-reflexive addresses learned from a discovery server, and relayed addresses allocated on a relay. Candidates are exchanged through signaling and pairs are tested with connectivity checks, in priority order. The first working pair is used and the agent keeps watching so it can switch when a network changes. Hard problems are symmetric address translation, firewalls that block datagrams, dual-stack networks, and moving between wifi and cellular mid-call without a long silence.",
    k: ["Gather all candidates up front vs trickle them as found: trickling starts calls sooner but needs signaling that tolerates many small messages.", "Prefer direct paths vs always relay: direct paths give low latency and expose both IP addresses to each other; always relaying hides addresses at a cost in latency and infrastructure."],
    p: ["Exposing a peer's real address to a caller who is not a contact lets any stranger locate them.", "Giving up after the first failed check on cellular networks causes calls that connect only on wifi."],
    v: "Place calls between two devices behind different address-translation types, then switch one from wifi to cellular. Each call connects, and the second recovers audio within a few seconds with no new ring.",
    dep: ["call-signaling","turn-relays"]
  },
  "turn-relays": {
    s: "Relay servers that forward call packets between peers who cannot connect directly, seeing only encrypted media and network metadata.",
    d: "A client requests an allocation with short-lived credentials issued by the account service, then peers send to the relay's address and the relay forwards to the other side. Relays are deployed in many regions to keep latency low and are chosen by measured proximity. Because media is end-to-end encrypted, a relay sees packet sizes, timing and addresses, not content. They are expensive: bandwidth is the largest media cost. Hard problems are abuse, since open relays can proxy attacks, and credential design that limits who may allocate and for how long.",
    k: ["Time-limited credentials per call vs long-lived account credentials: short credentials limit abuse and theft but need an issuing round trip before each call.", "Always relay for privacy vs relay as fallback: always relaying hides addresses and costs far more bandwidth."],
    p: ["Relays that accept unauthenticated allocations get used as free traffic amplifiers or proxies.", "A relay region outage with no failover makes calls fail for everyone who was routed there."],
    v: "Block direct paths between two test devices and confirm the call completes via a relay. Inspect relay logs and captured packets and confirm no key, content or account identifier appears.",
    dep: ["account-service","media-encryption"]
  },
  "media-encryption": {
    s: "Encrypts and authenticates each real-time audio and video packet with the call's key, so relays and servers handle only opaque payloads.",
    d: "Packets are protected using a secure real-time transport profile or an equivalent frame-level scheme. Keys derive from the call key, with separate keys per direction and per stream, and a sequence counter forms the nonce so each packet is unique. Replay windows reject duplicates. Frame-level encryption lets a forwarding server read only the headers it needs for routing. It is hard because packets arrive out of order and lost, encryption adds bytes to every small packet, and a server that selects streams needs routing information without seeing media.",
    k: ["Packet-level encryption vs whole-frame encryption: packet-level matches standard transports; frame-level lets relays forward without decrypting and needs a protected header design.", "Authenticate every packet vs sample: full authentication blocks injection, and costs CPU on weak devices."],
    p: ["Reusing a nonce across a key rotation boundary breaks confidentiality of those packets.", "Not binding the header to the authentication tag lets a relay reroute or reorder streams undetected."],
    v: "Flip single bits in captured packets and confirm they are rejected, replay old packets and confirm they are dropped, and confirm a packet capture shows only ciphertext after the header.",
    dep: ["call-key-exchange"]
  },
  "group-call-topology": {
    s: "How multi-party calls move media: a full mesh of peers for small calls, or a forwarding server that routes selected streams for larger ones.",
    d: "A mesh sends each participant's media to every other, which is simple and private but scales badly in upload bandwidth. A selective forwarding server receives each stream once and forwards chosen streams to each receiver, choosing by active speaker and by receiver bandwidth. With end-to-end encryption the server sees headers but not media. Participants share a group call key rotated on join and leave. It is hard because forwarding decisions depend on estimated bandwidth, membership changes need prompt rekeying, and every participant must be authorized without the server knowing the group.",
    k: ["Mesh vs forwarding server: mesh needs no server media capacity and breaks past about four participants; forwarding scales to dozens and adds server cost.", "Server knows group membership vs server sees only anonymous call tokens: membership knowledge simplifies authorization; tokens preserve privacy and complicate abuse control."],
    p: ["Rekeying only on leave and not on join lets a joiner decrypt media sent before they arrived.", "Forwarding all streams to everyone saturates mobile downlinks and collapses quality for the whole call."],
    v: "Run a twenty-person call with two participants on poor networks. The server forwards only a few streams to each, and a removed participant can no longer decrypt media after the rekey.",
    dep: ["call-key-exchange","media-encryption","group-membership"]
  },
  "call-quality-adaptation": {
    s: "Adjusts bitrate, resolution, frame rate and redundancy during a call in response to measured loss, delay and available bandwidth.",
    d: "The sender estimates bandwidth from receiver feedback on delay trends and loss, then picks audio and video encoding parameters inside that budget. Audio gets priority; video layers are dropped first. Forward error correction and retransmission repair loss, and jitter buffers on the receiver smooth arrival times at the cost of delay. Encrypted media still carries enough header information for feedback. It is hard because networks change within seconds, estimation errors cause oscillation, and telling congestion from random wireless loss changes the right response.",
    k: ["Delay-based vs loss-based congestion control: delay-based reacts before loss and is fooled by variable wireless links; loss-based is robust and reacts only after quality has dropped.", "Larger jitter buffer vs lower latency: larger buffers hide jitter and make conversation feel laggy."],
    p: ["Slow reaction to a bandwidth drop freezes video and causes audio to cut out as queues fill.", "Aggressive probing for more bandwidth starves other traffic on the same connection."],
    v: "Throttle a test link from 2 Mbit/s to 150 kbit/s and back during a call. Audio stays continuous, video drops layers within seconds and recovers on restoration, with no sustained oscillation.",
    dep: ["media-encryption","ice-negotiation"]
  },
  "client-database": {
    s: "The on-device store of messages, conversations, contacts, sessions and settings, which is the only complete copy of the user's history.",
    d: "An embedded transactional database holds tables for messages, attachments metadata, conversations, groups, receipts, reactions and protocol state. Writes group a received message, its session state update and its acknowledgment into one transaction so a crash cannot lose or replay it. Schema migrations run on app update and must be reversible or safe to interrupt. It is hard because the same file is touched by the app, a notification process and background tasks, and because years of history must stay fast to query and open.",
    k: ["Single database file shared by app and extensions vs separate stores per process: a shared file is simple and needs careful locking; separate stores avoid contention and need a merge path.", "Normalized schema vs denormalized message rows: normalized is compact and flexible, denormalized renders faster."],
    p: ["Committing the ratchet state and the message in separate transactions loses messages or reuses keys after a crash.", "A migration interrupted halfway leaves a database no version of the app can open."],
    v: "Kill the process at random points during receipt of one thousand messages and replay. After restart every message appears exactly once and every session still decrypts the next message.",
    dep: ["database-encryption","session-state-store"]
  },
  "database-encryption": {
    s: "Encrypts the client database and attachment files on disk with a key protected by device hardware and, optionally, a user secret.",
    d: "The database engine encrypts pages with a symmetric key generated at install. That key is wrapped by a keystore key that is hardware-backed where available and released only after the device is unlocked, or after the user's passcode when an app lock is set. Attachments and caches use separate file keys. Backups made by the platform are excluded or encrypted. It is hard because background processes need access while the device is locked, deriving access policy that is neither too open nor breaks notifications, and key loss means total data loss.",
    k: ["Key available after first unlock vs only while unlocked: first-unlock lets background decryption work and is exposed to an attacker who has a running locked device; while-unlocked is stronger and breaks wakeups.", "Hardware-wrapped key vs key derived from a user passphrase: hardware wrapping is invisible to the user, passphrases protect against hardware compromise and can be forgotten."],
    p: ["Storing the database key in plain preferences makes encryption decoration, defeated by copying two files.", "Search index and thumbnail caches written outside the encrypted store leak content."],
    v: "Copy the database, attachment and cache directories off a locked test device and search them for known message text. Nothing is found; the files cannot be opened without the keystore.",
    dep: ["secure-key-storage"]
  },
  "full-text-index": {
    s: "A search index built and queried entirely on the device over decrypted message text, because the server cannot see messages to search them.",
    d: "As messages are stored or edited, their text is tokenized and added to an inverted index inside the encrypted database, with normalization for case, accents and scripts without spaces. Queries support prefixes, phrases, filters by conversation, sender and date, and ranking by recency. Deletions and expiry must remove entries. The index can roughly equal the text size, and rebuilding after restore from backup takes time. It is hard because tokenizing many languages correctly is difficult, and the index becomes a second copy of everything that must follow the same deletion rules.",
    k: ["Index at receive time vs build lazily in background: immediate indexing keeps search current and slows ingestion; background building delays results after bulk restore.", "Full content index vs index of titles and names only: full content is what users expect and doubles storage and exposure."],
    p: ["Index entries that survive message deletion or expiry make deleted text searchable.", "Searching before a restore-time rebuild finishes silently returns incomplete results as if complete."],
    v: "Import ten years of messages, search for a rare word in two scripts and see results ranked within a second. Delete one message and confirm the word no longer finds it.",
    dep: ["client-database","database-encryption"]
  },
  "outbox": {
    s: "A durable queue of outgoing messages that are written locally first and sent when the network allows, with retries and a visible pending, sent or failed state.",
    d: "Each outgoing item is stored with its plaintext content, recipients, client message id and attempt state. A sender worker takes items in order per conversation, encrypts per recipient device, submits to the server and marks success on acknowledgment. Failures are classified: network errors retry with backoff, a stale device list triggers refresh and retry, a permanent rejection surfaces to the user. Ordering within a conversation is preserved. It is hard because retries must be idempotent, work must resume after a crash mid-fan-out, and encryption advances ratchet state that cannot be rolled back.",
    k: ["Encrypt at enqueue time vs encrypt at send time: encrypting early fixes the ciphertext for retries but pins the device list; encrypting late uses current keys at the cost of redoing work.", "Strict per-conversation order vs maximum parallelism: strict order matches expectations and a stuck item blocks the rest."],
    p: ["Retrying a send that actually succeeded, without a stable id, delivers duplicates.", "A permanently failing head item blocks every later message in the conversation silently."],
    v: "Send ten messages with the connection dropping at random. All ten arrive once, in order, and the failed-send state shows for any that were rejected, with a working retry action.",
    dep: ["client-database","device-fanout","delivery-service"]
  },
  "offline-sync-engine": {
    s: "Reconciles local state with what happened elsewhere: draining server queues on reconnect, applying changes from linked devices, and sending whatever was queued while offline.",
    d: "On connect the engine fetches pending envelopes in queue order, decrypts and applies each in a transaction, acknowledges them, then flushes the outbox. Linked devices also exchange state changes such as read marks, group updates and settings as encrypted sync messages. Because only clients hold history, a newly linked device cannot fetch it from the server and needs a transfer. It is hard because messages arrive out of order, sync messages can conflict, and a device offline for weeks may return after queues have expired.",
    k: ["Event-style sync messages vs state snapshots: events are small and ordered-dependent; snapshots converge easily and cost bandwidth.", "Resume from a server cursor vs refetch everything and deduplicate: cursors are efficient and break on server loss; full refetch is robust and expensive."],
    p: ["Applying a read mark before the message it refers to arrives leaves unread counts permanently wrong.", "Queues expire while a device is offline and nothing tells the user that messages were lost."],
    v: "Take a device offline for three days with activity on a linked device and in two groups, then reconnect. Conversation contents, read state and group membership match the other device within a minute.",
    dep: ["client-database","outbox","delivery-service","read-state-sync"]
  },
  "message-ordering": {
    s: "Decides the order messages appear in a conversation, using sender timestamps, server receive order and local rules, because no global clock exists.",
    d: "Each message carries a sender-supplied timestamp, and the receiver notes its own receipt time and the server's sequence. Display order commonly sorts by sender time for a sense of conversation flow, with ties broken by receipt order, and rejects timestamps far in the future. Per-sender order is preserved by protocol counters. Logical clocks give causal order for replies and edits. It is hard because device clocks are wrong, offline messages arrive late and different devices may disagree, and users notice any reordering immediately.",
    k: ["Order by sender timestamp vs by arrival: sender time reflects intent and can be wrong or forged; arrival order is consistent per device and differs between devices.", "Wall-clock plus logical counter vs wall-clock alone: hybrid clocks keep causality when clocks are skewed and add a field to every message."],
    p: ["Trusting a sender's far-future timestamp pins its messages to the bottom of the conversation forever.", "Sorting by arrival time gives linked devices different orders, breaking quote and edit references."],
    v: "Set one sender's clock one hour ahead, exchange replies in both directions with delays, and view on two devices. Both show the same order and no message is pinned to the future.",
    dep: ["message-envelope","server-sequencing"]
  },
  "read-state-sync": {
    s: "Keeps read marks, unread counts and conversation state such as mute and archive consistent across a person's linked devices.",
    d: "When one device reads a conversation, it sends an encrypted sync message to the account's other devices containing a read cursor or a set of message references. Receivers advance their own marks, clear notifications and recompute badges. Settings such as pinned and muted use the same path. Cursor-based marks are cheap and idempotent, and merging takes the maximum. It is hard because devices may be offline or ordered differently, a cursor over unsynchronized order can mark unseen messages as read, and badge counts must match everywhere.",
    k: ["Read cursor per conversation vs per-message read set: cursors are tiny and mask messages that arrived out of order; sets are precise and grow with volume.", "Sync through encrypted device messages vs server-held state: device messages hide state from the server; server state is simpler and learns who reads what."],
    p: ["A cursor ahead of messages still in transit marks them read before the user has seen them.", "Clearing notifications on a read from a device that never displayed the message hides a message."],
    v: "Read a conversation on one device while another is locked. Within seconds the other shows no badge or notification, and a message that arrives afterward from earlier in time still shows as unread.",
    dep: ["client-database","linked-devices","message-ordering"]
  },
  "encrypted-backup": {
    s: "A copy of message history and settings encrypted on the device with a key the server never sees, stored remotely so a lost phone does not erase everything.",
    d: "The client serializes the database and attachments, optionally in increments, compresses and encrypts with a key derived from the recovery key, then uploads the blob to storage the provider cannot read. Restore downloads, decrypts and merges into a new install, then re-registers keys because session state is not restored. Backups can include message keys for old media but should never include live ratchet state. It is hard because backup is a long-lived weak point: an old backup undoes disappearing messages, and key loss makes it unreadable.",
    k: ["Backup everything including old attachments vs recent history only: full backups are what users expect, and enlarge both storage cost and the exposure window.", "Incremental append-only backup vs periodic full snapshots: incremental uploads are cheap and slow to restore; snapshots are simple and costly."],
    p: ["Restoring live ratchet state from backup reuses message keys and breaks sessions with every contact.", "Backups that keep messages past their expiry defeat disappearing messages without the user knowing."],
    v: "Back up, wipe the device, restore with the recovery key on a new install. History and media reappear, new sessions work, and a restore with the wrong key fails without revealing any plaintext.",
    dep: ["client-database","recovery-key","object-storage"]
  },
  "recovery-key": {
    s: "A long random secret, shown to the user once, that unlocks backups and account recovery and is never available to the server.",
    d: "The client generates a high-entropy key, usually presented as a grouped string of characters, and derives the backup encryption key and a backup identifier from it. The user stores it offline or in a password manager. Alternatives wrap a key with a short PIN using server-side rate limiting inside hardware-isolated memory, so guesses are limited even though the PIN is short. It is hard because users lose or never record it, short PINs are guessable offline unless guesses are throttled by something the attacker cannot bypass, and recovery must not become a back door.",
    k: ["Long random key held by the user vs short PIN stretched by a rate-limited remote service: a random key is unbreakable and easily lost; a PIN is memorable and depends on the throttling service staying secure.", "Show once and require confirmation vs allow later viewing: confirmation reduces loss and later viewing needs the key stored somewhere."],
    p: ["Accepting a PIN of 1234 unlimited times offline turns the recovery system into a trivial brute-force target.", "Users who skip saving the key discover on a new phone that history is gone for good."],
    v: "Create a backup, then try one hundred wrong key attempts against the recovery service. They are throttled and fail; the correct key restores history on a fresh install.",
    dep: ["hardware-isolated-lookup","secure-key-storage"]
  },
  "attachment-encryption": {
    s: "Encrypts each attachment on the sender's device with a fresh random key and an integrity tag, so storage and network see only ciphertext.",
    d: "For every file the client generates a new symmetric key, encrypts in a streaming fashion, and computes a keyed integrity value over the ciphertext plus a plain digest used by the receiver to confirm what was downloaded. The key, digest, size and content type travel inside the end-to-end encrypted message together with the storage pointer. It is hard to do for large files without holding them in memory, to authenticate before releasing any decrypted data, and to keep content type and filename out of anything the server stores.",
    k: ["Fresh key per attachment vs derived from conversation key: fresh keys isolate each file and are simple to forward without exposing others; derived keys save bytes and tie files to a session.", "Authenticate whole file before use vs per-chunk authentication: whole-file is simplest and delays playback; per-chunk enables streaming and needs a chunk-binding construction."],
    p: ["Releasing decrypted bytes to a media decoder before the tag is verified exposes it to maliciously crafted files.", "Reusing a key and nonce across a re-upload after failure lets an attacker compare ciphertexts."],
    v: "Upload a file, flip one byte in storage, and download it from a recipient. Decryption fails before any plaintext is shown, and the stored object contains no readable type or filename.",
    dep: ["message-envelope"]
  },
  "chunked-upload": {
    s: "Splits large attachments into parts uploaded in parallel and resumable pieces, so poor connections do not force a restart from zero.",
    d: "The client requests an upload session from the server, then sends encrypted parts, each with its own length and checksum, and finalizes with an object identifier. Interrupted uploads query which parts exist and continue. Authorization is by short-lived signed upload credentials issued per session. Background upload continues when the app is suspended where the platform allows. It is hard because parts must be reassembled byte-exactly, partial objects must be garbage collected, and progress and cancellation have to remain correct across app restarts.",
    k: ["Fixed part size vs adaptive size: fixed parts are simple to resume and may be wasteful on slow links; adaptive parts speed good connections and need negotiation.", "Direct upload to storage with signed credentials vs proxying through the app servers: direct is cheaper at scale and needs careful signing scope; proxying centralizes control."],
    p: ["Abandoned uploads that are never cleaned up fill storage with orphan ciphertext.", "Credentials not scoped to one object let a client overwrite another user's file."],
    v: "Upload a 500 MB file, cut the network at 60 percent and resume after an app restart. Only the missing parts are sent, the final object matches the digest, and the orphaned partial is removed on cancel.",
    dep: ["attachment-encryption","media-server"]
  },
  "media-server": {
    s: "Storage and delivery service holding encrypted attachment blobs under random identifiers, with expiry, size limits and no ability to read content.",
    d: "It accepts uploads and serves downloads of opaque objects identified by unguessable names, usually over object storage with a content delivery layer. Objects expire after a retention period and are deleted. Download is authorized by knowing the identifier and a capability that the recipient got inside an encrypted message. It records size and times but not content type or sender where design allows. It is hard because delivery caching must not turn identifiers into trackable user links, retention has to match message expiry, and abuse scanning is not possible on ciphertext.",
    k: ["Capability URL with no login vs authenticated download: capability links are simple and cacheable but anyone with the link downloads; authenticated downloads limit leakage and tie fetches to accounts.", "Short retention vs long: short retention minimizes stored ciphertext and breaks late-opening users; long retention serves them and increases exposure."],
    p: ["Sequential or guessable object identifiers let outsiders enumerate and download ciphertext.", "Retention expiring before the recipient's device syncs leaves a message with a dead attachment link."],
    v: "Request random and incrementing identifiers directly and get not-found. Fetch a valid blob, confirm it is ciphertext, and confirm it is deleted after its retention period.",
    dep: ["object-storage","rate-limiter"]
  },
  "thumbnail-generation": {
    s: "Creates small previews and blurred placeholders on the sender's device, so recipients can see something at once without server-side image processing.",
    d: "Because the server cannot read files, thumbnails are made by the sender: images are scaled, videos get a poster frame, and a tiny blurred preview is embedded directly in the message. Metadata such as location in photos is stripped. The receiver shows the embedded placeholder at once and fetches the full thumbnail or file when needed. It is hard because sender devices vary in capability, formats are numerous, and decoding untrusted images on the receiver is a major attack surface that must be sandboxed.",
    k: ["Sender generates thumbnails vs receiver generates after download: sender generation costs upload bytes and allows instant previews; receiver generation saves bandwidth and shows nothing until download.", "Embedded tiny blur in the message vs separate fetch: embedding is instant and enlarges every message slightly."],
    p: ["Leaving location and device data in the preview image discloses what the user meant to strip.", "Decoding a malformed image in the main process turns a received attachment into a code execution path."],
    v: "Send a photo with location data and confirm both the thumbnail and the file lack it. Open the conversation on a slow connection and see the placeholder immediately, then the sharpened image.",
    dep: ["attachment-encryption","media-download"]
  },
  "media-download": {
    s: "Fetches, verifies, decrypts and caches attachments on the recipient's device, with auto-download rules and storage limits.",
    d: "On receiving a message, the client reads the pointer, key and digest, downloads from the media server, checks the digest and tag, then decrypts into an encrypted local cache. Rules govern auto-download by network type, size and conversation trust, and users can purge. Partial downloads resume. Linked devices each download separately from the same blob. It is hard because disk use grows without bound, expired blobs leave messages with media that can never be fetched, and every decoder reached from a download must treat the file as hostile.",
    k: ["Auto-download for known contacts vs always manual: auto-download is convenient and exposes the device to files and the sender to address leakage; manual protects against both with friction.", "Cache decrypted media on disk vs decrypt on each view: caching is fast and needs encrypted storage; per-view decryption saves risk and costs CPU."],
    p: ["Auto-downloading from unknown senders reveals the recipient's IP address and fetches hostile files.", "Cache that is never trimmed fills the device and makes the operating system kill the app."],
    v: "Receive media from a stranger and from a contact on cellular. The stranger's file waits for a tap, the contact's loads automatically, the digest mismatch case is rejected, and clearing cache frees the stated space.",
    dep: ["attachment-encryption","media-server","database-encryption"]
  },
  "link-previews": {
    s: "Shows a title and image for a link in a message, fetched by the sender's device, not by any party that would learn who shares what.",
    d: "When a user pastes a link, the sender's client fetches the page through a privacy-preserving path, extracts the title, description and image, and embeds that preview into the encrypted message. Receivers show it without contacting the site. Fetching on the receiver would reveal the receiver's address and read time to the site; fetching on the server would reveal links to the provider. It is hard because pages are untrusted, previews can lie about the destination, and the fetch itself still discloses the sender's interest to the site.",
    k: ["Sender-side fetch vs receiver-side fetch: sender fetch hides receivers and costs sender bandwidth; receiver fetch is simple and leaks reading and address.", "Proxy fetches through the service vs direct: a proxy hides the user address from the site and shows links to the proxy."],
    p: ["A preview image or title that does not match the real destination aids phishing.", "Server-side fetching of every link lets the provider read the content users thought was encrypted."],
    v: "Paste a link, observe a single request from the sender's device or proxy and none from the receiver at open. The receiving device shows the preview and the actual domain.",
    dep: ["thumbnail-generation","message-envelope"]
  }
});
