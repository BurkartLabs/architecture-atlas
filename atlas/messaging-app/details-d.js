// Details for the messaging plate, part 4: server services, infrastructure, specification and release, cross-cutting.
ATLAS.details("messaging-app", {
  "account-service": {
    s: "Server component that owns account records, credentials, device registrations and settings, and issues the tokens other services check.",
    d: "It stores the account identifier, the verified identifier or its hash, device entries with their public keys and push tokens, and registration lock state. It authenticates clients, issues short-lived credentials for relays and uploads, and processes registration, linking and deletion. It keeps as little as possible: no names, contacts or message data. It is hard because it is the system of record that every other service trusts, the identifier it holds is personal data, and it must handle both takeover defense and the lost-phone recovery case.",
    k: ["Store identifier in plaintext vs hashed: plaintext enables verification and discovery and leaks on breach; hashes of small spaces protect little and complicate lookup.", "Long-lived device credentials vs short-lived tokens: long-lived credentials are simple and valuable if stolen; short tokens limit exposure and need renewal logic."],
    p: ["Storing contact lists or names here turns a breach into a social graph disclosure.", "Credentials that never expire stay valid on devices that were sold or stolen."],
    v: "Register, link, rotate credentials and delete an account. After deletion no record, token or push registration remains, and a database dump contains no names, contacts or message content.",
    dep: ["message-store","cache-layer"]
  },
  "sender-authorization": {
    s: "Checks that a request to deliver a message is permitted, through an authenticated account, a delivery token or a group credential, before it enters any queue.",
    d: "For authenticated sends, the service verifies credentials and block status. For sealed sends it validates the delivery token, or a group token, and applies the limit class for anonymous traffic. Recipients may require that the sender be known or allowed; the server enforces what it can without reading anything. Failures return generic errors so they do not reveal whether an account exists. It is hard because enforcing recipient policies while not knowing the sender requires cryptographic capabilities, and error responses leak account existence.",
    k: ["Authenticated sends vs anonymous tokens: authentication allows precise controls and exposes the sender; anonymous tokens hide the sender and need credential infrastructure.", "Distinct vs uniform error responses: distinct errors help debugging and reveal account state; uniform responses hide it."],
    p: ["Different errors for unknown and blocked accounts let attackers enumerate users.", "Skipping checks for internal calls lets a bug in one service bypass all policy."],
    v: "Send with valid, expired, wrong and missing credentials to existing and non-existing recipients. Only valid ones are accepted, and the rejected responses for existing and missing recipients are indistinguishable.",
    dep: ["delivery-tokens","account-service","rate-limiter"]
  },
  "rate-limiter": {
    s: "Limits request rates per account, device, token and network address across all endpoints, using shared counters that survive across servers.",
    d: "Token bucket or sliding window counters are kept in a fast shared store keyed by the limited dimension. Limits differ by endpoint cost: verification requests, key bundle fetches, sends to new recipients and attachment uploads each get their own budgets. It supports proof of work or captcha challenges for suspicious clients. Responses carry a retry delay. It is hard to set limits that stop abuse without harming bursts in legitimate use such as group chats, and shared counters must not become a hot spot or a metadata log.",
    k: ["Strict limits per dimension vs adaptive limits by reputation: strict limits are predictable and hit real power users; adaptive limits are fairer and harder to reason about.", "Challenge suspicious clients vs block: challenges let legitimate users continue at a cost; blocking is simple and creates support burden."],
    p: ["Limits keyed only by IP address punish whole mobile carriers sharing one address.", "Counters stored with identifiers and kept long become an access log of who contacted whom."],
    v: "Exceed each limit with a scripted client and observe refusal with a retry delay, then confirm a burst of normal group traffic passes and counters expire on schedule.",
    dep: ["cache-layer"]
  },
  "spam-detection": {
    s: "Finds unwanted bulk messaging and fake accounts using behavior and metadata signals available without reading message content.",
    d: "Signals include registration patterns, rates of first messages to new recipients, recipient reports, block rates, key bundle fetch volume, device characteristics and attestation results. A scoring service combines them and feeds the rate limiter, challenges or suspension. Client-side classification of message requests, with user reports, adds a content signal under the user's control. It is hard because sealed sender removes the sender signal, spammers adapt quickly, and false positives silence real people who have no easy appeal.",
    k: ["Server behavior signals vs client-side content filters: server signals scale and miss content; client filters see content and each user bears the cost and trust.", "Aggressive auto-suspension vs review: automatic action is fast and punishes false positives; review is accurate and slow."],
    p: ["Models trained on a leaky signal, such as number prefixes, block entire countries unfairly.", "A signal collected for spam, like per-recipient send counts, kept long becomes a social graph record."],
    v: "Replay a labeled set of spam and normal traffic through the pipeline. Spam accounts are limited within the target time, false positives stay under the stated rate, and no content is read.",
    dep: ["rate-limiter","abuse-reporting","verification-fraud-defense"]
  },
  "abuse-reporting": {
    s: "Lets a recipient report a message or account, with the report carrying the evidence the reporter chooses to reveal, since the server cannot read the conversation.",
    d: "The client packages selected recent messages, decrypted locally, and the sender's identifiers into a report and submits it. Cryptographic franking can bind the content to the sender so a forged report is detectable: the sender's message carries a commitment the server can check against revealed plaintext. Reports lead to review, warning or removal, and feed spam scoring. Reporting also blocks and optionally deletes. It is hard because the reporter can fabricate, the server needs verifiable authorship, and reports themselves reveal private conversations to a reviewer.",
    k: ["Franking commitments for verifiable reports vs unverified reports: franking proves what the sender wrote and adds fields and some deniability loss; unverified reports are simple and forgeable.", "Report with context vs single message: context improves decisions and exposes more of the conversation."],
    p: ["Accepting unverifiable screenshots lets people frame others by fabricating chats.", "Sending the whole conversation by default discloses far more than the reporter intended."],
    v: "Report a message and verify the server can confirm it came from the accused account without access to other messages. A fabricated report with altered text fails verification.",
    dep: ["moderation-under-encryption","message-envelope","account-service"]
  },
  "moderation-under-encryption": {
    s: "The set of controls available when content is unreadable to the operator: reports, account-level actions, limits on virality and on group size, and user-side filtering.",
    d: "Moderators act on reported content and account behavior, not on scanning. Tools include suspending accounts, removing public group links, restricting forwarding chains, warning labels on frequently forwarded messages, and limiting group invitations from strangers. Client-side lists of known harmful media, matched on the device, are debated. Transparency reports describe actions. It is hard because every content-aware mechanism weakens the guarantee, legal demands conflict with technical design, and attackers use the same limits as shields.",
    k: ["No content scanning vs client-side matching: no scanning preserves the guarantee and limits what can be stopped; client matching catches known material and creates a pressure point for expansion.", "Limit forwarding and group sizes vs unlimited: limits slow viral abuse and constrain legitimate use."],
    p: ["Reviewing reports without a record of who accessed them makes moderator access an unaudited back door.", "Forward limits easily evaded by copy and paste give a false sense of control."],
    v: "Run a tabletop and test: a reported account is suspended using only report data, forwarded messages beyond the limit show the label, and an audit log records every moderator access.",
    dep: ["abuse-reporting","spam-detection","group-membership"]
  },
  "account-deletion": {
    s: "Removes an account and its server-side records, tells contacts the device keys are gone, and wipes local data on the device.",
    d: "The client requests deletion with authentication and the account service deletes the account entry, device records, prekeys, profile ciphertext, push tokens, queues and stored attachments within a defined period. Backups of the database cycle out on a schedule. Contacts will see the account as unregistered and sessions fail. The client clears its database and keystore entries. It is hard because deleted data lives in replicas, caches and backups, identifiers may be reused by another person later, and deleted sessions on contacts' devices should not confuse a new owner of the number.",
    k: ["Immediate hard delete vs soft delete with grace period: hard delete honors the request and cannot be undone; a grace period recovers mistakes and keeps data longer.", "Release the identifier at once vs quarantine: immediate release is simple and allows takeover of a stale identity; quarantine delays it."],
    p: ["Replicas and backups retaining the account long after deletion contradict what users were told.", "Reusing an identifier immediately lets a new holder receive messages meant for the old one."],
    v: "Delete a test account and query every service, cache and backup index by its identifier after the stated window. No record remains, and a new registration of the identifier starts with fresh keys and no inherited sessions.",
    dep: ["account-service","message-store","object-storage"]
  },
  "verification-fraud-defense": {
    s: "Defenses against abuse of the verification channel: bulk registration, paid-message pumping, number recycling and carrier-level interception.",
    d: "Measures include attestation of genuine devices, proof-of-work, per-region and per-carrier limits, monitoring conversion rates from code sent to code entered, blocking unusual number ranges, and routing codes through more than one provider. Cost is the main lever, since each code costs real money. The client must never reveal the identifier to the wrong party. It is hard because strong checks block users with older devices or in regions with poor delivery, and attackers can buy real devices and numbers cheaply.",
    k: ["Device attestation required vs optional: required attestation stops emulated farms and excludes devices without support; optional keeps access broad.", "Alert on low conversion rates vs block upfront: monitoring finds new attacks and acts late; blocking is immediate and risks false positives."],
    p: ["A single messaging provider outage stops all new registrations in a region.", "Hard country blocks stop real users while attackers shift to another range."],
    v: "Simulate a registration burst from emulated devices and rotating numbers. Sending falls back to challenge or blocking within minutes, cost per attempt stays within budget, and real devices still register normally.",
    dep: ["rate-limiter","identifier-verification"]
  },
  "connection-sharding": {
    s: "Partitions connected devices across many gateway servers and routes work to the shard holding a device's connection.",
    d: "Devices are assigned to gateways by connection time, and the registry records where each is. Queue ownership is sharded by account or device identifier using consistent hashing, so a queue has one writer at a time. Requests that need delivery find the owner, then forward to the holding gateway. Adding capacity moves ownership of a fraction of keys. It is hard because rebalancing must not drop messages, hot accounts such as large groups concentrate load, and ownership changes must be fenced so two nodes never write the same queue.",
    k: ["Single owner per queue vs multi-writer with conflict resolution: single owner keeps ordering simple and needs failover fencing; multi-writer is available and complicates order.", "Shard by account vs by device: by account keeps device lists together and makes a many-device account a hot spot; by device spreads load and scatters queries."],
    p: ["Two owners briefly writing the same queue during failover reorder or duplicate messages.", "Consistent hashing without virtual nodes leaves some servers with several times average load."],
    v: "Add and remove shard nodes under load. Ownership transfers within seconds, no queue has two writers at any time in the logs, and message loss and duplication rates stay at zero.",
    dep: ["presence-registry","message-store"]
  },
  "message-store": {
    s: "The durable storage for undelivered envelopes, prekey pools, account records and group state, built for many small writes with short lifetimes.",
    d: "Workloads are write-then-delete: an envelope lives for seconds to weeks. Storage uses a partitioned key-value or wide-column store keyed by device queue, with time-to-live on entries, and a fast tier in memory in front for connected devices. Replication across failure domains gives durability. Compaction must handle huge deletion volume without read slowdowns. It is hard because tombstones from constant deletes degrade reads, hot partitions form around busy accounts, and storage must not become a log of conversations.",
    k: ["Write to memory tier with asynchronous persistence vs synchronous durable write: async is fast and can lose recent messages on crash; synchronous is safe and slower.", "Time-to-live expiry vs explicit deletion jobs: TTL is simple and delays reclamation; jobs are precise and add load."],
    p: ["Tombstone buildup from mass deletes makes reading an empty queue slow.", "Backups of the store retain ciphertext and routing data beyond the stated retention."],
    v: "Run a week of simulated traffic with the production churn pattern. Read latency stays flat, space usage tracks live data, and deleted envelopes are absent from storage and from backups after the retention period.",
    dep: ["cache-layer","multi-region-failover"]
  },
  "presence-registry": {
    s: "A fast shared map from each device to the gateway currently holding its connection, used to route pushes and decide between live delivery and wakeup.",
    d: "On connect, a gateway writes the device's location with an expiry and refreshes it with keepalives; on disconnect it removes it. The delivery service reads it to find where to send, or to see that the device is offline and call the push gateway. Entries are in memory, replicated for availability, and tolerate staleness. It is hard because it changes constantly with millions of devices, stale entries cause misrouted or dropped pushes, and the registry itself is a live map of who is online.",
    k: ["Expiring entries refreshed by keepalives vs explicit removal only: expiry cleans up after crashes and adds refresh load; explicit removal is cheaper and leaves ghosts.", "Strongly consistent registry vs eventually consistent: strong consistency avoids misrouting and costs latency and availability; eventual is fast and tolerates occasional redundant wakeups."],
    p: ["Ghost entries after a gateway crash route messages to a dead connection until expiry.", "Exposing registry data to any internal service lets it become a real-time activity feed."],
    v: "Crash a gateway holding fifty thousand connections. Entries expire within the bound, deliveries to those devices fall back to push, and no message waits longer than the expiry plus the wakeup time.",
    dep: ["cache-layer","connection-gateway"]
  },
  "object-storage": {
    s: "Scalable blob storage for encrypted attachments, backups and profile data, fronted by a content delivery layer, holding only ciphertext under random names.",
    d: "Objects are written once with an expiry and read by capability. A delivery layer caches popular ciphertext near users, with cache keys that do not reveal who is downloading. Lifecycle rules delete expired objects, and multipart uploads are assembled server-side. Access uses signed, short-lived URLs scoped to one object. Storage spans zones for durability. It is hard because cost is dominated by bandwidth, caches and logs can reveal access patterns, and deletion has to propagate through caches and replicas.",
    k: ["Cache ciphertext at the edge vs bypass cache: caching cuts cost and latency and exposes download patterns to the edge operator; bypass hides them and costs more.", "Signed URLs per request vs bearer identifiers: signed URLs limit sharing and need an issuance step; bearer identifiers are simple and replayable."],
    p: ["Edge logs of object names and client addresses reconstruct who received which attachment.", "Lifecycle rules that miss multipart leftovers silently accumulate gigabytes of orphan data."],
    v: "Upload, fetch through the cache, expire and delete an object. After expiry the origin and edge both return not-found, and storage counters show the space reclaimed, including partial uploads.",
    dep: []
  },
  "cache-layer": {
    s: "In-memory stores that hold rate-limit counters, session data, hot queue heads and registry entries, so the hot path rarely touches disk.",
    d: "Clusters of memory-resident key-value nodes sit beside services, keyed by account or device. They offer atomic increment and compare-and-set operations that rate limiting and one-time prekey popping depend on. Data has expiry, replication gives failover, and eviction policies protect critical keys. It is hard because correctness-sensitive data, such as prekey pops and counters, must not be lost or duplicated on failover, and a cold cache after restart can overload the backing store.",
    k: ["Replicated cache with automatic failover vs single node with rebuild: replication keeps the service up and can lose a few writes; rebuild is simple and causes outages.", "Cache as source of truth for counters vs backing database: cache-only is fast and loses state on failure; database-backed is durable and slow."],
    p: ["A cold cache after restart sends every request to the database at once.", "Evicting a one-time prekey counter entry under memory pressure re-issues used keys."],
    v: "Fail over a cache node during sustained load. Atomic operations remain correct, rate-limit counters lose at most the stated window, and the backing store sees no spike beyond its capacity.",
    dep: []
  },
  "observability": {
    s: "Metrics, traces and logs designed to diagnose the service without recording who talks to whom, or retaining identifiers longer than needed.",
    d: "Services emit aggregated counters, latency histograms and sampled traces with identifiers removed or truncated. Alerts watch delivery latency, queue depth, connection counts and error rates. Logs follow an allow-list of fields, with short retention and no recipient, sender or address pairs. Debug access to production data needs approval and an audit entry. It is hard because debugging delivery bugs often wants exactly the per-user detail that privacy forbids, and third-party monitoring tools can silently capture request fields.",
    k: ["Aggregate metrics only vs per-request traces: aggregates protect privacy and hide individual failures; traces find them and need strong scrubbing.", "Allow-listed log fields vs deny-listed: allow-listing prevents new fields leaking by default; deny-listing is convenient and misses new ones."],
    p: ["A new log line capturing request headers records addresses and tokens across the fleet.", "Alerting only on averages misses a regional delivery failure affecting one percent of users."],
    v: "Search a day of logs, traces and metrics for test account identifiers and addresses. None are found beyond the allowed fields, and an injected delivery delay triggers the latency alert within the target.",
    dep: ["metadata-minimization"]
  },
  "multi-region-failover": {
    s: "Runs the service in several regions so a data center loss reroutes clients with bounded message loss, and keeps data placement within legal limits.",
    d: "Gateways and delivery services run in every region; queues are owned in one region with replicas elsewhere, and clients are directed by DNS or a front door to a healthy region. Failover promotes replicas, accepting a small window of data loss or delay for queues. Some data may be pinned to regions for legal reasons. Connection state is rebuilt by client reconnect. It is hard because replication lag causes lost or duplicated messages, failback is as risky as failover, and regional pinning conflicts with global group chats.",
    k: ["Single-writer regional queues with async replicas vs multi-region synchronous writes: async is fast and may lose the last moments; synchronous is safe and adds cross-region latency to every send.", "Automatic failover vs human-approved: automatic limits downtime and can flap or split the brain; manual is deliberate and slow."],
    p: ["Failover with unreplicated queue entries drops messages that were already acknowledged to senders.", "Split-brain promotion produces two live copies of a queue with different histories."],
    v: "Take down a region under load in a drill. Clients reconnect elsewhere within the target, the count of lost acknowledged messages stays within the documented bound, and failback completes without duplicates.",
    dep: ["message-store","connection-sharding"]
  },
  "protocol-specification": {
    s: "The written, versioned description of every message, state machine and key derivation, precise enough for an independent team to build a compatible client.",
    d: "It defines wire formats, derivation labels, state transitions, error handling and security properties with the assumptions behind them. It includes explicit test vectors and notes on what is deliberately left unspecified. It is revised through public review, and each version is dated and archived. A good specification reads as a contract, separating normative rules from commentary. It is hard to keep in step with the code, to cover edge cases such as concurrent session creation, and to state security claims in terms that can be checked.",
    k: ["Specification first vs code as the reference: spec first forces precision and slows iteration; code-as-spec is quick and hides undocumented behavior.", "Public review vs closed: public review finds flaws and slows changes; closed is faster and relies on in-house expertise."],
    p: ["An ambiguous derivation step is implemented two ways, so clients interoperate only until a rare path appears.", "A specification that drifts from the shipped code gives a false impression of what is analyzed."],
    v: "Give the specification and vectors to a team that has not seen the code. Their client completes handshake, ratchet steps, groups and out-of-order delivery against the reference with no clarifying questions.",
    dep: ["interop-test-vectors"]
  },
  "formal-verification": {
    s: "Machine-checked analysis of the protocol's security properties against a defined attacker, using symbolic and computational models.",
    d: "The handshake, ratchet and group schemes are modeled in tools that explore attacker actions and prove secrecy, authentication, forward secrecy and post-compromise security under stated assumptions, or give a counterexample trace. Computational proofs bound the attacker's advantage given assumptions about primitives. Models must cover compromise of long-term keys, ephemeral keys and state at chosen times. It is hard because models abstract away implementation, group and multi-device behavior makes the state space large, and the properties proven must match the properties users believe they have.",
    k: ["Symbolic models vs computational proofs: symbolic tools are automated and find logic flaws; computational proofs bound probability and take expert effort.", "Verify the protocol vs the implementation: protocol proofs are tractable and miss coding errors; verified implementations close the gap at high cost."],
    p: ["A proof under an attacker model that omits state compromise says nothing about healing after theft.", "Proof results that are never updated when the protocol changes certify a protocol that no longer exists."],
    v: "Re-run the models after each protocol change and confirm secrecy and authentication queries still verify, then introduce a known flaw into the model and confirm the tool returns an attack trace.",
    dep: ["protocol-specification"]
  },
  "interop-test-vectors": {
    s: "Fixed inputs and expected outputs for every cryptographic and encoding step, shared by all implementations so they stay bit-compatible.",
    d: "Vectors cover key derivation, handshakes with and without one-time prekeys, ratchet sequences with reordering and skipped messages, group message encryption, envelope parsing and sealed-sender wrapping. They are generated from the reference and run in each client and server's test suite, as well as in cross-implementation runs where real binaries talk to each other. Negative vectors confirm rejection of tampering. It is hard because vectors cannot cover every state, long sessions behave differently from short ones, and randomness must be injectable to make outputs deterministic.",
    k: ["Static vectors vs live cross-implementation runs: static vectors are cheap and fast in every pipeline; live runs find integration bugs and need infrastructure.", "Deterministic injected randomness vs captured traces: injection tests flows exactly; captured traces test real behavior and are hard to extend."],
    p: ["Vectors that only exercise the happy path let each client reject different malformed inputs differently.", "A shared vector file edited to fit one implementation's bug hides the incompatibility."],
    v: "Run the vector suite on every client and server build. All pass, and a cross-run of an old release and the current one completes a long session with reordering and group changes.",
    dep: ["protocol-specification"]
  },
  "fuzzing-and-simulation": {
    s: "Feeding random and adversarial inputs to parsers and state machines, and running whole networks of clients in simulation with injected loss, delay and reordering.",
    d: "Fuzzers target envelope parsing, attachment decryption, call packets and group state decoding with coverage guidance. Simulation runs many virtual clients and servers on a controllable network with clock control to reproduce races: simultaneous session creation, crashes between decrypt and acknowledge, device list changes during sends. Failures replay deterministically from a seed. It is hard to model the real network's behavior, to explore state spaces large enough to find rare orderings, and to turn found failures into small regression tests.",
    k: ["Coverage-guided fuzzing of parsers vs property-based tests on state machines: fuzzing finds memory and parsing flaws; property tests find logic and ordering faults.", "Deterministic simulation vs real-network soak tests: simulation is reproducible; soak tests catch platform effects it cannot model."],
    p: ["Fuzzing only the happy-path decoder never reaches code that handles malformed group state.", "Simulations that assume reliable clocks miss every bug caused by skew."],
    v: "Run a seeded simulation of fifty clients with crashes and partitions for a million steps. All delivered messages match sent ones exactly once, and a replayed seed reproduces any failure identically.",
    dep: ["protocol-specification","interop-test-vectors"]
  },
  "protocol-versioning": {
    s: "The rules for changing message formats and cryptographic behavior while old and new clients keep talking, including how versions are identified and retired.",
    d: "Messages and bundles carry a version number. Receivers accept a range and reject below a floor; senders choose the highest version both sides support, learned from capabilities. Breaking changes ship as a new version with a long overlap, then the floor is raised and old clients are told to update. Downgrade attacks are prevented by authenticating the version in the handshake. It is hard because users never update on schedule, old versions linger for years, and every supported version is attack surface and test burden.",
    k: ["Authenticated version negotiation vs unauthenticated: authentication prevents forced downgrade and ties versions into key derivation; unauthenticated is simpler and exploitable.", "Long overlap vs hard cutoff: overlap avoids stranding users and keeps weak versions alive; a cutoff forces updates and breaks old clients."],
    p: ["A version number outside the authenticated data lets an attacker downgrade a session to a weaker version.", "Raising the minimum version without enough notice locks out users with old phones."],
    v: "Attempt a downgrade by modifying the version field in transit and confirm the handshake fails. Raise the floor in a test environment and confirm old clients show an update prompt and not silent failure.",
    dep: ["capability-negotiation"]
  },
  "capability-negotiation": {
    s: "How devices advertise optional features, such as new group types or call versions, so senders use only what every recipient supports.",
    d: "Each device registers a set of capability flags with the server, or includes them in its prekey bundle. A sender sending to several devices takes the intersection, falling back to older formats if needed, or refuses to use a feature when any member lacks it. Flags are set only after the code is shipped and stable. It is hard because capabilities change as users update, group features need the minimum across all members, and a stale advertisement leads to messages a device cannot read.",
    k: ["Advertise in bundle vs fetch separately: bundle advertisement is one round trip and goes stale with the bundle; separate fetches are fresh and cost more calls.", "Group uses lowest common feature set vs per-member formats: lowest common is simple and holds back everyone; per-member formats are rich and multiply encoding work."],
    p: ["A device advertising a capability before its code path works silently loses messages.", "One old device in a large group blocks a new feature for all members indefinitely."],
    v: "Mix devices with different capabilities in one group. Messages use the best format each can read, a device that lacks a feature still decrypts everything, and a capability change takes effect on the next send.",
    dep: ["protocol-versioning","prekey-bundle-service"]
  },
  "client-update-pipeline": {
    s: "How new client versions reach users: build, sign, staged rollout, forced-update floors and rapid fixes for security flaws.",
    d: "Releases go through automated tests and signing, then to stores in staged percentages while crash and error rates are watched. The server can announce a minimum supported version, and old clients show a blocking prompt. Security fixes can bypass staging. Desktop and web clients have their own update channels. The server also needs to know client versions to apply protocol floors. It is hard because stores control timing, many users update slowly, and every update channel is also a delivery channel for malicious code if compromised.",
    k: ["Staged rollout vs immediate release: staging catches regressions with limited harm and delays fixes; immediate release patches flaws quickly and exposes everyone to new bugs.", "Server-enforced version floor vs advisory: enforcement guarantees an upgrade path and strands users; advisory is friendly and leaves old versions."],
    p: ["Signing keys kept on a shared build server let anyone with access ship a backdoored client.", "A faulty update that breaks login cannot be fixed by an update users cannot reach."],
    v: "Ship a build to one percent, observe crash and message-failure rates, and halt the rollout on a seeded regression. Raise the floor and see old clients prompt without losing data.",
    dep: ["protocol-versioning","reproducible-builds"]
  },
  "reproducible-builds": {
    s: "Builds that let anyone compile the published source and obtain the same binary, so users can verify that a distributed client matches the open code.",
    d: "Builds run in pinned environments with fixed toolchains, dependency versions, paths and timestamps so outputs are bit-identical. A verification script compiles the source and compares it to the published package, ignoring only the signature. Dependency lock files and vendored sources prevent drift. For stores that re-sign, comparison skips the signature block. It is hard because toolchains embed nondeterminism, platform stores rewrite binaries, and verification is only meaningful if someone actually runs it.",
    k: ["Fully pinned hermetic builds vs convenience builds: hermetic builds are verifiable and costly to maintain; convenience builds are easy and unverifiable.", "Independent verifiers vs self-verification: independent verifiers give real assurance and need outside effort; self-checks catch drift only."],
    p: ["Embedded build timestamps or paths make every build differ and kill verification.", "A verification script nobody runs offers no defense against a malicious release."],
    v: "Build the tagged source on two clean machines and compare to the shipped package. They match byte for byte except the signature block, and a changed dependency version makes the comparison fail.",
    dep: ["protocol-specification"]
  },
  "threat-model": {
    s: "The explicit statement of who the attacker can be, what they control and what the system promises against them, including a malicious server and compromised devices.",
    d: "It lists adversaries: a passive network observer, a compromised or compelled server, a malicious contact, a thief with a device, malware on the device and an attacker with a stolen backup. For each it states what remains protected and what does not. The server is treated as untrusted for confidentiality and trusted only for availability. It sets which metadata may exist, what verification protects against and which attacks are out of scope, such as a fully compromised endpoint. Every component's design traces back to it.",
    k: ["Untrusted server vs honest-but-curious server: assuming malice drives sealed sender, transparency and verifiable state at high complexity; assuming curiosity is simpler and fails under compromise.", "Document out-of-scope threats vs leave implicit: documenting sets honest expectations; leaving implicit overpromises."],
    p: ["An unwritten threat model lets each team assume a different attacker, leaving gaps between layers.", "Marketing language that claims protection against attackers the design does not cover misleads users."],
    v: "Pick each listed adversary and trace the documented protection through a concrete test or inspection; for out-of-scope cases confirm the user-facing documentation states the limit.",
    dep: []
  },
  "compromise-recovery": {
    s: "How the system limits damage when keys or devices are stolen: forward secrecy for the past and ratchet-based healing for the future.",
    d: "Forward secrecy comes from deleting old chain keys, ratchet keys and prekey private parts, so a later theft reveals only current state. Post-compromise security comes from fresh Diffie-Hellman input at each ratchet turn, so an attacker who copied state is locked out after one exchange, unless they keep up with active interception. Group schemes heal more slowly. Backups, indexes and caches sit outside this guarantee unless they are handled. Every component that stores a key decides how long it lives, and the whole property is only as strong as the weakest copy.",
    k: ["Aggressive deletion of old keys vs retaining for reordering and recovery: deletion maximizes forward secrecy and drops late messages; retention serves poor networks and widens exposure.", "Per-message healing vs periodic healing: per-turn healing is strongest and needs two-way traffic; periodic healing works for one-way streams at higher cost."],
    p: ["Backups that store message keys or session state quietly void forward secrecy for everything in them.", "A group scheme that rarely rotates leaves a stolen device able to read for months."],
    v: "Snapshot a device, continue the conversation for two turns and confirm the snapshot cannot decrypt new messages, and confirm it cannot decrypt anything from before the snapshot's key deletion point.",
    dep: ["dh-ratchet","symmetric-ratchet","skipped-key-store"]
  },
  "metadata-exposure": {
    s: "Deciding, field by field and log by log, what the servers, network and push providers can learn about who talks to whom, when and how much.",
    d: "Content encryption leaves a large residue: addresses, timing, sizes, device lists, group membership and contact graphs. Each design choice moves it: sealed sender hides senders, padding hides sizes, short retention hides history, private discovery hides address books, relays hide addresses. Some exposure is unavoidable, such as the destination of a message and the user's network location. The decisions interact, because convenience features add fields. It is a ledger kept for the whole system: every new feature needs an entry stating what it adds to what an observer can see.",
    k: ["Minimize metadata at the cost of features and cost vs maximize function: fewer fields limit damage and block presence, search and server-side convenience; richer features are pleasant and permanent records.", "Hide from the server vs hide from the network: server hiding is achievable in protocol; network hiding needs relays or anonymity layers with latency cost."],
    p: ["A feature added late, such as read receipts or link previews, quietly sends a new signal in the clear.", "Treating encryption as the whole privacy story leaves the social graph exposed."],
    v: "Maintain a table of every field each party can observe for each operation, regenerate it from captured traffic and server storage after each release, and confirm it matches the approved table.",
    dep: ["metadata-minimization","sealed-sender","queue-expiry"]
  },
  "multi-device-consistency": {
    s: "Making several devices of one person show the same conversations, read state and settings, although each has its own keys, sessions, clocks and connectivity.",
    d: "Every device is a full participant with its own sessions, so state must be kept equal through explicit sync messages: sent messages, read marks, group changes, settings and deletions. History is not stored centrally and a new device starts empty unless transferred. Order can differ by device, device lists change, and sync messages can arrive out of order. The decisions here are which state is synchronized, how conflicts resolve, which device is authoritative and how a device that was gone for months catches up.",
    k: ["Eventually consistent sync messages vs a server-held canonical state: sync messages keep the server blind and diverge on loss; canonical state converges easily and the server must be trusted with it.", "Peer symmetric devices vs a primary device: symmetric devices work when any is offline; a primary simplifies authority and creates a single point of failure."],
    p: ["Sync messages sent only to currently connected devices leave a device that was offline permanently out of date.", "Treating each device's local clock as authoritative for edits lets devices disagree on the final state."],
    v: "Make a set of changes on three devices while two are offline, then bring all online. Conversations, read state, groups and settings are identical on all within a minute.",
    dep: ["linked-devices","read-state-sync","offline-sync-engine"]
  },
  "unreliable-networks": {
    s: "Designing for connections that drop, lag, reorder and change address, so that messages are neither lost nor duplicated and the app behaves sensibly offline.",
    d: "Mobile links fail constantly. The design answers with a durable outbox, at-least-once delivery with deduplication, acknowledgments after commit, cursors for resuming, reconnection with backoff and jitter, ratchets that tolerate reordering and bounded buffers for skipped keys. Calls adapt bitrate and switch paths. Each layer assumes the one below can fail at any moment. The decisions are where state is made durable, when to retry, when to give up and how to show uncertainty to the user truthfully.",
    k: ["At-least-once with deduplication vs at-most-once: at-least-once never loses messages and demands idempotent handling; at-most-once is simple and drops messages on failure.", "Hide failures behind retries vs show status: hiding keeps the interface calm and misleads; showing pending and failed states is honest and noisier."],
    p: ["A send that fails after the server accepts it but before the client hears is retried as a new message.", "Retry loops without caps keep a phone awake and drain the battery on a dead network."],
    v: "Run the client through a network emulator with loss, reordering, outages and address changes for an hour of traffic. Every message arrives once, in order within each sender, and the interface status matches the true state.",
    dep: ["outbox","ack-and-redelivery","reconnection-backoff","skipped-key-store"]
  },
  "abuse-versus-privacy": {
    s: "The standing tension between stopping spam, fraud and harm and keeping the operator unable to read, link or profile users.",
    d: "Every abuse control wants information the privacy design removes: sender identity, content, social graph and history. The system answers with limits and costs instead of inspection: rate limits, delivery tokens, verification cost, report franking, forwarding limits, group invitation controls and client-side filters under user control. Each choice moves the balance, and some content-aware measures cannot be added without weakening the guarantee for everyone. The decisions are which signals the server may keep, which controls live on the client and what harm is accepted to keep the guarantee.",
    k: ["Behavior and cost controls vs content inspection: behavior and cost controls keep encryption intact and miss targeted harm; content inspection catches more and breaks the guarantee for all users.", "User-held controls vs operator-held controls: user-held controls respect privacy and depend on user effort; operator-held controls act at scale and need data."],
    p: ["A signal kept for abuse purposes, like send counts per recipient, is later demanded as a record of social ties.", "Over-reliance on reports lets coordinated false reports silence legitimate accounts."],
    v: "Run an abuse campaign in a test environment and confirm limits, tokens and reports stop it, while a data audit confirms the server still cannot read content or reconstruct sender-recipient pairs.",
    dep: ["spam-detection","moderation-under-encryption","sealed-sender","rate-limiter"]
  }
});
