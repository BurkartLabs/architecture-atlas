// Details for the mail server plate, part 4: mailbox store, foundations, cross-cutting concerns.
ATLAS.details("mail-server", {
  "mailbox-format": {
    s: "How messages are laid out on disk: one file per message, one file per folder, or a database, with an index beside them.",
    d: "A file-per-message layout makes appends and deletes cheap and independent, and gives backup tools simple units. A single-file-per-folder layout is compact and needs locking and rewriting for deletions. Database-backed stores keep messages in blocks with indexes and handle many small items better. The format sets locking needs, behavior on crashes, backup cost and performance with huge folders. Changing format later means migrating every mailbox while users are connected.",
    k: ["File per message versus packed files: per message is simple and robust and strains the filesystem with millions of small files, packed is dense and needs compaction.", "Index inside the format versus a separate index: inside is self-contained, separate is fast to query and must be rebuilt when lost."],
    p: ["A folder with hundreds of thousands of files makes listing and backup crawl.", "A crash during a rewrite of a single-file folder corrupts every message in it."],
    v: "Append, flag and delete messages while killing the process at random points. Afterward the folder opens, the index matches the files, and no message is truncated or lost.",
    dep: ["spool-filesystem", "mailbox-locking"]
  },
  "message-index": {
    s: "A compact per-folder index of message metadata, such as UID, flags, size, date and cached headers, so listing and common searches avoid reading the messages.",
    d: "Clients ask for a folder's contents constantly: lists, counts of unseen mail, sorted views. The index holds the data to answer these directly. It is updated with every delivery and flag change and can be rebuilt from the messages if lost or corrupt. The index is the performance heart of the store and also its most delicate part: if it disagrees with the files, clients see missing or phantom messages.",
    k: ["Caching headers in the index versus reading on demand: caching makes lists fast and enlarges the index, on-demand keeps it small and is slow.", "Updating the index synchronously versus lazily: synchronous is consistent and slower, lazy is fast and exposes stale views."],
    p: ["The index is updated before the message file is durable, and after a crash it references a message that is not there.", "An index rebuild on a large store runs during peak hours and stalls everything."],
    v: "Corrupt or delete the index of a test folder and open it. The server rebuilds from the messages, the list matches the original including flags that are stored in the message names or metadata, and counts agree.",
    dep: ["mailbox-format", "uid-and-modseq"]
  },
  "uid-and-modseq": {
    s: "Stable identifiers for each message in a folder, a validity value that signals when they were reset, and a counter that rises with every change for incremental sync.",
    d: "Each message receives the next unique identifier in its folder, never reused. A validity number changes if identifiers are ever reassigned (restore, migration), telling clients to discard cached state. A per-folder change counter increments on every flag change, delivery and removal, with each message recording the last counter that touched it. These three values let clients sync without comparing whole folders. Keeping them correct under concurrent writers and restores is the core store invariant.",
    k: ["Never reuse identifiers versus compact them: never reusing is simple and correct for clients, compaction saves nothing and breaks caches.", "A counter per folder versus per mailbox: per folder keeps writes independent, per mailbox allows account-wide sync and creates contention."],
    p: ["Restoring a folder from backup keeps the validity value, and clients associate cached bodies with the wrong messages.", "Concurrent delivery and flag updates read the same counter and issue duplicate values."],
    v: "Run concurrent deliveries and flag updates against a folder for a minute. All identifiers are unique and increasing, the counter strictly rises, and a restore changes the validity value.",
    dep: ["message-index", "mailbox-locking"]
  },
  "flags-and-keywords": {
    s: "The per-message state clients set: read, answered, flagged, deleted, draft, plus user-defined keywords, stored durably and synchronized across devices.",
    d: "System flags have standard meanings, and keywords are free-form labels some clients use as tags. Flag changes come from many clients at once and must merge without losing either update, so storage records changes with their counter and applies set and clear operations rather than overwriting the whole set. Flags drive visible behavior: unread counts, junk learning and retention. Permanent flag support varies by folder and client, and keywords may be limited.",
    k: ["Set and clear operations versus replacing the flag set: operations merge concurrent changes, replacement is simple and loses updates.", "Free-form keywords versus a fixed set: free-form supports tags and grows without bound, a fixed set is simple and limits clients."],
    p: ["Two clients mark the same message with different flags simultaneously and the last writer erases the other's change.", "Unbounded keywords from a misbehaving client bloat the index of a folder."],
    v: "From two clients, set different flags on one message at the same moment. Both flags appear, both clients receive the update, and the change counter shows two increments.",
    dep: ["message-index", "uid-and-modseq"]
  },
  "folder-hierarchy": {
    s: "The tree of folders in a mailbox, with names, delimiters, subscriptions and special-use roles such as sent, drafts, trash and junk.",
    d: "Folders are created, renamed and deleted by clients, with a separator character and Unicode names in a modified encoding. Roles tell clients which folder is for what, so devices agree on where sent mail and drafts go. Renaming a folder with children must move them atomically, and renaming must not reuse identifiers wrongly. Name rules, case sensitivity and reserved names differ between servers and cause migration failures. Shared folders add permissions per user.",
    k: ["Server-defined special folders versus client choice: server-defined agrees across devices, client choice is flexible and diverges.", "Folder hierarchy mapped onto filesystem directories versus a logical tree: filesystem mapping is simple and inherits path limits and character problems."],
    p: ["Two clients create sent folders with different names, and a user's sent mail is split across them.", "A rename operation interrupted halfway leaves children pointing at a missing parent."],
    v: "Create a nested folder, rename the parent and delete a subfolder from one client. A second client sees the same tree after sync, with roles intact and no orphaned folders.",
    dep: ["mailbox-format", "message-index"]
  },
  "full-text-index": {
    s: "A search index over message bodies and headers, including text extracted from attachments, so server-side search answers in milliseconds instead of scanning the mailbox.",
    d: "On delivery, a background indexer tokenizes headers and decoded body parts, extracts text from common attachment types, and stores terms with message references. Queries combine terms with header and flag filters. Indexing lags delivery slightly, so searches may miss the newest mail. Language handling, stemming and index size are the design questions: a full index can approach the size of the mail. Messages removed must be removed from the index, as well as the snippets.",
    k: ["Indexing at delivery versus on first search: at delivery makes search fast and spends work on mailboxes never searched, lazy saves work and the first search is slow.", "Indexing attachments versus bodies only: attachments find documents users want and expose parser bugs and large cost."],
    p: ["Text extractors run on untrusted attachments, and a malicious file crashes or exploits the indexer.", "Deleted messages remain searchable through the index for days."],
    v: "Deliver a message with a unique word in the body and one in a PDF attachment. Both words find it within the indexing delay. After deletion neither search returns it.",
    dep: ["message-index", "local-delivery-agent"]
  },
  "single-instance-storage": {
    s: "Storing one copy of identical message content delivered to many recipients, with reference counts, instead of a copy per mailbox.",
    d: "A message sent to a hundred local users is written once and linked into each mailbox, with a counter of references. Attachments can be deduplicated by content hash too. It saves space for internal mail and lists, and complicates deletion (last reference removes the content), quota accounting, per-user encryption and backup. With modern storage costs and different per-user processing, many designs now skip it.",
    k: ["Deduplicate versus store copies: deduplication saves space on bulk mail and complicates quotas and deletion, copies are simple and cost storage.", "Whole message versus attachment-level hashing: attachment-level saves more on replies and forwards and needs parsing and reassembly."],
    p: ["A hard-link-based dedup breaks when a user's mailbox is moved to another volume.", "Reference counts drift after crashes, leaking space or deleting content still in use."],
    v: "Deliver a large message to fifty mailboxes and measure storage: roughly one copy. Delete from forty-nine and the last user still reads it, and after the last deletion the space is reclaimed.",
    dep: ["mailbox-format", "mailbox-quotas"]
  },
  "mailbox-quotas": {
    s: "Limits on storage and message counts per mailbox, enforced at delivery and append, with warnings and a grace margin so mail is not lost at the edge.",
    d: "The store tracks usage per user and folder as messages change. At delivery it compares the new size with the limit; over quota yields a temporary or permanent failure, or a short grace overage. Notification when approaching the limit gives users a chance to act. Counting must agree across the delivery agent, the clients and any dedup, otherwise users see impossible numbers. Trash and deleted but not expunged mail often count, which confuses users.",
    k: ["Rejecting at the limit versus a soft limit with grace: hard is predictable and can bounce important mail, soft keeps mail flowing and enables overuse.", "Counting stored bytes versus message count and bytes: bytes bound disk, counts bound index size, both need enforcement."],
    p: ["Usage counters drift from reality after crashes and users are told they are full when they are not.", "Over-quota accounts bounce mail, and the bounce goes to forged senders."],
    v: "Fill a test mailbox to the limit. Delivery is deferred with the correct status, warnings were sent at the threshold, and after deleting and expunging mail the counter drops and delivery resumes.",
    dep: ["message-index", "single-instance-storage"]
  },
  "mailbox-locking": {
    s: "Coordination that lets the delivery agent, several client sessions and background tasks modify the same mailbox without corrupting it or blocking each other.",
    d: "Delivery appends while clients flag and expunge, and an indexer reads. Designs range from filesystem locks around whole folders to lock-free appends with atomic renames and optimistic checks. Network filesystems make advisory locks unreliable. Locks held too long make clients wait, held too short permit torn updates. The store's atomicity rules, such as new messages visible only after the index update, matter more than the mechanism.",
    k: ["Coarse folder locks versus fine-grained or lock-free schemes: coarse is easy to reason about and serializes everything, lock-free scales and demands careful design.", "Locking on a network filesystem versus a single owner node per mailbox: shared filesystems need fragile locks, one owner node serializes access and needs routing."],
    p: ["Two nodes access the same mailbox over a network filesystem and advisory locks silently do nothing.", "A client crashes holding a lock and every other session waits until a timeout."],
    v: "Run delivery, flag changes and expunges against one folder from multiple processes for several minutes. A consistency check afterward finds no duplicate identifiers, missing files or index disagreement.",
    dep: ["spool-filesystem"]
  },
  "expunge-and-retention": {
    s: "How deletion works in two steps, mark then expunge, and the policies that remove old mail automatically from trash, junk and archives.",
    d: "Clients mark messages deleted and later expunge them, which is when they leave the folder. Many clients move to a trash folder instead. Retention rules delete messages older than a set age in specified folders, or hold them for legal reasons. The store must keep identifiers unused after expunge and record the removal for sync. Backups and replicas still hold the messages after deletion, which is a privacy matter and a recovery feature.",
    k: ["Immediate purge versus recoverable deletion window: immediate meets privacy expectations, a window rescues mistakes and stores data longer.", "Per-folder retention versus global: per-folder suits junk and trash, global is simple and cannot express different needs."],
    p: ["A retention rule applied to the wrong folder removes years of archived mail.", "Legal hold is set on an account but the automatic purge job does not consult it."],
    v: "Set a retention rule on a test junk folder and age some messages. Only matching old messages are removed, other folders are untouched, clients receive expunge notifications, and a held account is skipped.",
    dep: ["uid-and-modseq", "mailbox-quotas", "audit-trail"]
  },
  "store-replication": {
    s: "Keeping a second copy of every mailbox on another node or site, and backups with point-in-time restore, so loss of a machine does not lose mail.",
    d: "Replication streams changes (new messages, flag changes, folder operations) to a peer, either asynchronously or synchronously before acknowledging. Conflicts happen when both sides change a message during a partition, and are merged by flag rules and counters. Backups add history and protection against deletion and corruption, which replication faithfully copies. A restore must preserve or reset identifiers correctly or clients get confused.",
    k: ["Synchronous versus asynchronous replication: synchronous never loses acknowledged mail and slows writes and fails with the peer, asynchronous is fast and can lose the last seconds.", "Active-active versus active-passive: active-active uses both sites and needs conflict resolution, active-passive is simple and idles capacity."],
    p: ["Replication copies a mass deletion instantly to the replica and the only copy is gone.", "A restore keeps old identifiers and validity, so clients keep cached state for different messages."],
    v: "Fail the primary node during writes. The replica serves the mailbox with every acknowledged message present, and a point-in-time restore of one deleted folder yields the messages with a changed validity value.",
    dep: ["mailbox-format", "uid-and-modseq", "spool-filesystem"]
  },
  "dns-resolver": {
    s: "The local recursive resolver mail components use for MX, address, text and pointer lookups, with caching, validation and limits on lookup volume.",
    d: "Mail leans heavily on DNS: routing, SPF, DKIM keys, DMARC, reverse lookups, blocklists, MTA policies and signed records. A dedicated local caching resolver absorbs the volume, avoids rate limits from public resolvers, and can validate signatures. Lookups run inside the session, so a slow resolver slows or fails delivery, and blocklist queries from a shared public resolver may be refused. Timeouts and retry behavior define how DNS outages turn into mail delays.",
    k: ["A local validating resolver versus the provider's: local gives control, caching and signature validation, provider's is free of maintenance and rate-limited for blocklists.", "Treat temporary DNS failure as defer versus as no data: defer is safe and delays mail, no data is permissive and can bypass checks."],
    p: ["Using a public resolver for blocklist queries returns refusals that are interpreted as listings.", "One slow authoritative server stalls dozens of sessions waiting on the same lookup."],
    v: "Measure lookup latency and hit rate under load, then stop upstream access. Cached names still resolve, new lookups fail fast as temporary errors, and mail already queued continues to attempt delivery for cached destinations.",
    dep: ["clock-sync"]
  },
  "certificate-management": {
    s: "Obtaining, installing, renewing and monitoring the certificates and keys used for TLS on every mail port, including per-domain names for hosted clients.",
    d: "The server needs certificates for its host names and sometimes for each customer domain used by client access. Renewal is automated and the services must reload without dropping connections. Server-to-server mail rarely verifies names, but many clients and policy-enforcing senders do, so an expired or mismatched certificate causes both user-visible errors and deferred inbound mail. Private keys must be protected and rotated.",
    k: ["Automatic issuance and renewal versus manual: automatic removes expiry outages and needs reachable validation and a trusted issuer, manual is controlled and forgotten.", "One certificate for all names versus per-domain: one is simple and exposes all names, per domain isolates customers and multiplies renewals."],
    p: ["Renewal succeeds but the mail services are never reloaded and keep serving the expired certificate.", "A certificate for the web name is used for the mail host and clients fail the name check."],
    v: "Check the served certificate on every mail port with a client that verifies names: validity period, chain and name are correct, and after a renewal the new certificate is served without restart-induced dropped sessions.",
    dep: ["config-management", "clock-sync"]
  },
  "spool-filesystem": {
    s: "The storage the queue and mailbox store live on: its filesystem, durability semantics, space accounting and behavior with millions of small files.",
    d: "Both queue and store do many small synchronous writes, renames and directory scans. The filesystem's journal mode, directory indexing, inode limits and flush behavior decide throughput and crash safety. Separate volumes for queue, store and logs prevent one from filling the others. Storage on network shares changes locking and atomic rename behavior. Disk full is a failure mode to design for, since running out of space mid-transaction is when mail is lost.",
    k: ["Local disks versus network storage: local is fast and simple with fewer failure modes, network storage enables failover and breaks locking assumptions.", "Separate volumes for queue and store versus one: separate contains disk-full damage and complicates capacity planning."],
    p: ["Inode exhaustion fills the volume while free space remains, and writes fail without a clear disk-full message.", "Write caching in the controller acknowledges data that a power loss then loses."],
    v: "Pull power during a write-heavy test and verify every acknowledged message is present after fsck and restart. Then fill the volume and confirm the server refuses new mail without corrupting existing data.",
    dep: []
  },
  "process-model": {
    s: "How the server splits into cooperating processes: listeners, queue manager, delivery workers, filters and store services, with a supervisor that restarts failures.",
    d: "A single large process is simple and fails entirely. A set of small single-purpose processes, each with limited access, localizes bugs and lets worker counts scale per stage. A master process starts, monitors and recycles workers, and routes work through local sockets and queue files. Limits on memory, open files and process counts matter in mail since concurrency is high. Reloading configuration without losing connections is a requirement.",
    k: ["Many small processes versus one multithreaded process: small processes contain failures and spend memory and overhead, one process is efficient and shares fate.", "Recycling workers after N messages versus long-lived: recycling bounds memory leaks and costs startup, long-lived is fast and accumulates state."],
    p: ["A worker leak grows memory until the kernel kills a random process, often the queue manager.", "Too many delivery processes exceed file descriptor limits and new connections fail."],
    v: "Kill a worker of each type under load. The supervisor restarts it, in-flight messages are retried, and the listener keeps accepting connections without a visible gap.",
    dep: ["config-management"]
  },
  "privilege-separation": {
    s: "Running each component with only the permissions it needs, in separate users, restricted directories and sandboxes, so a bug in the network-facing part cannot reach mailboxes or keys.",
    d: "The listener runs as an unprivileged user with no write access to mailboxes, hands messages through a queue directory, and the delivery agent runs as the mailbox owner or via a store service. The signing key is readable only by the signer. Operating system sandboxing limits system calls and file access. Mail software parses hostile input all day, so this is the main containment strategy. The cost is complexity in permissions and in handing data across boundaries.",
    k: ["Separate users per component versus one service user: separate users limit damage and complicate file ownership, one user is simple and a compromise reaches everything.", "System sandbox filters versus ownership alone: sandboxes limit even a compromised process and need maintenance per platform."],
    p: ["The signing key is readable by the filter user and a filter bug exposes it.", "A delivery agent running as root writes to a path controlled by a user and can be tricked into overwriting system files."],
    v: "From the context of the network-facing process, try to read a mailbox, the signing key and the queue manager's files. All attempts fail with permission errors, and the attempts appear in the sandbox audit log.",
    dep: ["process-model"]
  },
  "user-directory": {
    s: "The authoritative source of accounts, passwords or credentials, aliases, domains and quotas that authentication, routing and delivery query.",
    d: "It can be a database, a directory service or files. Authentication reads credential hashes, routing reads addresses and domain tables, and delivery reads mailbox locations and quotas. It is queried at every connection and recipient, so it needs caching and availability: when it is down, the server must decide whether to defer mail or reject. Schema changes affect many components at once, and password hash algorithm upgrades need gradual migration.",
    k: ["External directory shared with other systems versus mail-specific database: shared gives one identity and ties mail availability to it, mail-specific is isolated and duplicates accounts.", "Cache with short lifetime versus always live query: cache is fast and may serve stale deleted accounts, live is accurate and adds load and a dependency."],
    p: ["The directory is slow, so each recipient lookup stalls the SMTP session and connections pile up.", "Disabled accounts remain valid in caches and continue to receive and send mail for minutes."],
    v: "Disable a test account and measure how long until authentication, recipient validation and delivery all reflect it. Then stop the directory and verify the server defers mail and logs the dependency failure.",
    dep: []
  },
  "clock-sync": {
    s: "Keeping the host clock accurate, because retry timing, signature timestamps, certificate validity, log correlation and queue expiry all depend on it.",
    d: "A network time service disciplines the system clock. Mail is sensitive to it in several places: signatures carry creation and expiry times, certificates have validity windows, retry and expiry computations use elapsed time, and message dates on received mail are compared with local time. A clock jump is more dangerous than a constant offset: it can expire the whole queue or make every certificate appear invalid. Cluster nodes need agreement for log ordering.",
    k: ["Stepping the clock versus slewing: stepping is quick and risks jumps that break timers, slewing is gradual and takes time to correct big errors.", "Using the wall clock versus a monotonic clock for retry timing: monotonic is immune to jumps and does not survive restarts without stored times."],
    p: ["A virtual machine resumes with a stale clock and the queue is expired at once.", "Signatures created with a skewed clock are rejected as being from the future."],
    v: "Compare the host clock to several independent time sources, and in a test environment step the clock by an hour. Queue expiry, retry times and certificate checks behave sensibly, and an alert fires on the offset.",
    dep: []
  },
  "config-management": {
    s: "How settings for domains, routes, limits, policies and keys are stored, validated, reloaded and kept consistent across all nodes of the server.",
    d: "Configuration is files or a database with a validation step, and a reload that applies changes without dropping connections. In a cluster, all nodes must agree: a routing table changed on one node and not another gives inconsistent behavior. Changes should be versioned and reviewable, with a way to roll back. Secrets (credentials, keys) are separated. The hard cases are settings that apply to messages already in the queue and settings which different components read at different times.",
    k: ["Static files deployed by tooling versus a live database: files are reviewable and atomic with deploys, a database allows changes without deploys and invites unreviewed edits.", "Applying changes to queued mail versus only new mail: applying keeps behavior uniform and surprises users, new only is predictable and slow to take effect."],
    p: ["A syntax error in a reloaded file takes down the listener while the old process is already stopped.", "Nodes run different versions of a routing table for an hour during a rollout and send the same mail down different paths."],
    v: "Deploy a deliberately invalid configuration to a test node. Validation rejects it, the running server continues unchanged, and a valid change reaches all nodes with the same version identifier in their logs.",
    dep: []
  },
  "accept-means-responsibility": {
    s: "A success reply after end-of-data transfers responsibility for the message to this server, and everything about queueing, durability and failure notices follows from that promise.",
    d: "Until the success reply, the sender holds the message and can retry freely. After it, the sender discards its copy, so this server must either deliver, or produce a failure notice. Decisions to settle in advance: what is written durably before replying, which checks must run before replying (since afterward one can only bounce), how recipients are validated, and what happens when disk is full. Every shortcut here is paid for as lost mail or backscatter.",
    k: ["Do all rejection work before replying versus afterward: before keeps the promise simple and makes senders wait, afterward is fast and requires bounces.", "Synchronous durable write before reply versus batched flush: synchronous never loses acknowledged mail and costs throughput."],
    p: ["Acceptance happens before recipient validation, producing bounces to forged senders for every typo and attack.", "The success reply is sent when the data is in memory only, and a crash loses it silently."],
    v: "Kill the host at the instant after a success reply for a sequence of test messages. After restart, every acknowledged message is present in the queue or delivered, and none exist only in the sender's lost state.",
    dep: ["data-reception", "queue-store", "recipient-validation", "backpressure"]
  },
  "at-least-once-delivery": {
    s: "Because crashes and timeouts leave the outcome unknown, the system retries and accepts that a message may occasionally be delivered twice, rather than risk losing one.",
    d: "At each handoff (sender to server, queue to remote, agent to store) a failure can occur after the receiver acted and before the sender learned of it. The only safe response is to retry. The consequence is duplicates, and a design should localize them: use stable queue and message identifiers, deduplicate by Message-ID where cheap, and make mailbox appends idempotent where possible. Exactly-once is not achievable in an open network of independent servers.",
    k: ["Retry with possible duplicates versus never retry uncertain handoffs: retrying never loses mail, never retrying avoids duplicates and loses messages.", "Deduplicating at delivery by Message-ID versus accepting duplicates: dedup hides repeated copies and risks dropping legitimately repeated messages."],
    p: ["Dedup by Message-ID drops a valid message from a sender that reuses identifiers.", "Retry logic without bounds sends hundreds of copies when a remote accepts and then fails to acknowledge."],
    v: "Inject failures at each handoff in a test: kill after the remote accepted but before the acknowledgment, and verify the message is delivered at least once, with duplicates only in the expected windows and none missing.",
    dep: ["crash-recovery", "smtp-client", "local-delivery-agent"]
  },
  "sender-identity-and-trust": {
    s: "Every sender claim, whether the connecting address, the envelope sender, the visible From or a signature, is separate and unverified until a mechanism checks it, and policy must say which claim is trusted for what.",
    d: "The protocol has no built-in sender authentication. Layers added later each cover one identity: network path, envelope domain, signing domain, visible domain, and the human behind an account. Policy chooses which to trust for which decision: reputation keyed by signing domain, display warnings keyed by aligned From, relay permission keyed by authenticated user. A design that mixes these identities up creates spoofing opportunities, and one that trusts too few rejects legitimate mail that passes through forwarders.",
    k: ["Strict enforcement of authentication results versus using them as score inputs: strict stops spoofing and breaks forwarders and lists, scoring tolerates them and leaves gaps.", "Trusting results from known intermediaries versus verifying everything locally: trust handles forwarding and widens the attack surface."],
    p: ["A reputation keyed to the envelope sender is earned cheaply by a spammer using a throwaway domain.", "A client displays the From name as trusted while the server verified only the envelope domain."],
    v: "Send test messages that forge each identity separately: connecting address, envelope sender, From and signature. Each forgery is detected by exactly the layer responsible, and the resulting policy decision matches the documented table.",
    dep: ["dmarc-evaluation", "identifier-alignment", "authentication-results", "client-authentication"]
  },
  "adversarial-traffic": {
    s: "A public mail server is attacked continuously: floods, address harvesting, malformed input, resource exhaustion and abuse of its own reputation, so every component must assume hostile input and bounded cost.",
    d: "Attackers probe for open relays, guess addresses, send huge or deeply nested messages, hold connections open and exploit parsers. Defense is in layers: limits on connections and sizes, cheap checks before expensive ones, privilege separation, careful parsing and per-source accounting. The ordering of checks matters: DNS lookups and scanning are expensive and should come after cheap refusals. Each protection has a cost to legitimate senders, which must be measured, not assumed.",
    k: ["Cheap early rejection versus thorough late analysis: early rejection saves resources and risks false refusals with no recovery, late analysis is accurate and spends capacity on attackers.", "Strict limits versus legitimate bursts: strict limits contain abuse and delay large senders, loose limits accommodate them and widen the attack."],
    p: ["An expensive check, such as scanning, is placed before a cheap one, so an attacker's flood overloads the scanner.", "Error replies reveal valid addresses and internal policy to anyone who probes."],
    v: "Run a staged flood with slow connections, address guessing, huge messages and nested archives against a test server. Legitimate probe mail continues to be accepted within the target latency and resource use stays within the configured bounds.",
    dep: ["connection-limits", "privilege-separation", "message-size-limits", "backpressure"]
  },
  "privacy-and-retention": {
    s: "Mail contains the most personal data a service holds, so what is logged, stored, indexed, copied to backups and shown to staff has to be decided deliberately, with defined retention for each copy.",
    d: "Copies exist in the queue, logs, traces, quarantine, search index, replicas and backups, each with its own lifetime. Logs record addresses and sometimes subjects. Administrators can read mailboxes, and filters can read bodies. Policy defines what staff may access and under which audit, how long each copy lives, how deletion reaches every copy, and which jurisdiction holds the data. Encryption at rest and in transit reduces exposure and does not hide content from the server, which processes it.",
    k: ["Logging full addresses versus hashed or truncated: full supports tracing and holds personal data, hashed reduces exposure and complicates support.", "Long retention in backups versus short: long permits recovery and prolongs the life of deleted data."],
    p: ["Deleted mail persists in backups and indexes long after a deletion request.", "Support staff read user mail with no record of access."],
    v: "Delete a test message and request erasure of a test account, then check every store: mailbox, index, logs, quarantine, replicas and backup catalogs. Each shows removal or a scheduled expiry within the stated period, and staff access is in the audit trail.",
    dep: ["audit-trail", "expunge-and-retention", "mail-logging", "store-replication"]
  },
  "scaling-and-partitioning": {
    s: "How the server grows past one machine: splitting by function, by user or domain, and by destination, while keeping queues, mailboxes and reputation coherent.",
    d: "Stateless front ends can multiply behind a load balancer, with shared limits and a shared view of recipients. Mailboxes partition by user to a home node, so every protocol session and delivery for that user must route there. Queues partition by destination or customer so concurrency limits and warm-up stay meaningful. Reputation state, rate-limit counters and dedup need sharing or approximation. Failure of a node needs a defined owner for its mail and queue.",
    k: ["Partition mailboxes by user versus by domain: by user balances load and needs a directory lookup per connection, by domain is simple and creates hot spots.", "Shared global limit counters versus per-node approximations: shared is exact and costs a dependency and latency, per-node is fast and lets limits multiply with node count."],
    p: ["A load balancer hides client addresses, so per-source limits and reputation see only the balancer.", "A user's mail is delivered on one node while their client reads from another that has not yet seen the change."],
    v: "Add a node to a running test cluster and kill another. Traffic rebalances, each mailbox is served by exactly one owner at a time, queues drain, and global rate limits stay within a small margin of their configured values.",
    dep: ["user-directory", "queue-scheduler", "mailbox-locking", "connection-limits"]
  },
});
