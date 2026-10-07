// Details for the mail server plate, part 1: logging and administration, client access, SMTP reception.
ATLAS.details("mail-server", {
  "mail-logging": {
    s: "Structured records of each connection, acceptance, delivery attempt and bounce, keyed by a queue identifier so one message's whole history can be reassembled.",
    d: "Every stage writes events: connection opened, command rejected, message accepted with its queue ID, each delivery attempt with remote response, final disposition. Logs go to a local file or a collector and are the primary forensic record. The hard part is correlation: one message produces lines from several processes, and one connection may carry many messages. Volume is high, so verbosity levels and sampling matter, and addresses in logs are personal data.",
    k: ["Free-text lines versus structured records: text is easy to read and grep, but structured fields survive aggregation and parsing without brittle patterns.", "Logging rejected connections at full detail versus counters only: detail helps abuse investigation but a flood can fill the disk and hide real events."],
    p: ["Logs rotated or truncated before a delayed bounce arrives leave no way to explain a message accepted days earlier.", "Different processes log with unsynchronized clocks or without the queue ID, so a message cannot be followed across stages."],
    v: "Send one test message to a remote address, then search by its queue ID and see the acceptance, every delivery attempt with the remote reply, and the final disposition, in order, from one query.",
    dep: ["queue-ids", "clock-sync"]
  },
  "message-tracing": {
    s: "A query interface that answers where a given message is and what happened to it, by sender, recipient, message ID or time window, without grepping raw logs.",
    d: "Tracing indexes the log stream or a dedicated event store by message ID, queue ID, envelope addresses and time. Support staff and users use it to answer why a message was not received. It joins events across hops inside the system: acceptance, filtering verdict, routing decision, each attempt, bounce. It cannot see past the last hop: once a remote server accepts, only that server knows what happened next. Retention and access control are the difficult parts, since traces expose who wrote to whom.",
    k: ["Self-service tracing for users versus operator-only: users resolve their own questions, but the tool exposes metadata about other people unless scoped carefully.", "Indexing everything versus on demand scanning of logs: an index answers fast but costs storage and ingest capacity."],
    p: ["Traces show accepted by the remote server and operators treat that as delivered, though the remote filtered it silently afterward.", "Traces keyed only by sender and recipient merge unrelated messages and make duplicates appear to be retries."],
    v: "Pick a message sent an hour ago and look it up by its Message-ID header. The trace should list acceptance, filter verdict, route, each attempt and result, with timestamps matching the raw logs.",
    dep: ["mail-logging", "queue-ids"]
  },
  "metrics-and-alerting": {
    s: "Counters and gauges for queue depth, age, delivery rates, deferral reasons and filter outcomes, with alerts that fire on trends before users report missing mail.",
    d: "The server exports counters (accepted, rejected, delivered, deferred, bounced) and gauges (queue size, oldest message age, active connections), split by destination domain and by reason. Alerts watch for rising oldest-message age, a destination whose deferral rate jumps, certificate expiry and rejected-by-remote spikes. Mail's difficulty is that failure is slow: a problem shows as age growing for hours, so thresholds need to be per-destination and rate-based, not a single queue-size line.",
    k: ["Per-destination metrics versus aggregate only: per-destination finds one provider throttling you, but high cardinality burdens the metrics store.", "Alerting on queue depth versus oldest-message age: depth is easy but misleads during normal bursts, while age reflects delay a sender actually experiences."],
    p: ["An alert on total queue size stays quiet while one large customer's messages to a single blocked destination age for days.", "Metrics derived from logs lag by the pipeline delay, so alerts fire after the queue has already overflowed."],
    v: "Block outbound port 25 to one test destination and send to it. Within the alert window the oldest-message-age metric for that destination rises and the alert fires, while other destinations stay flat.",
    dep: ["mail-logging", "queue-scheduler"]
  },
  "admin-api": {
    s: "Command-line tools and an authenticated API for inspecting and acting on the queue, reloading configuration, flushing or deleting messages, and managing accounts.",
    d: "Operators need to list queued messages by destination, show one message with its headers and attempt history, force a retry, hold or release, delete, and re-route. The API exposes the same operations to automation and to a control panel. It talks to the queue store, the scheduler and the directory. The risk is power: deleting a queue silently loses accepted mail, so destructive actions need confirmation, scoping by selector and a record of who did them.",
    k: ["Operate on the queue files directly versus through a running process: direct access works when the server is down but can race with the scheduler.", "Broad selectors such as delete all matching versus explicit IDs: selectors are fast during an incident but one typo removes legitimate mail."],
    p: ["A bulk delete matching a domain pattern also removes mail for subdomains nobody intended to touch.", "Admin credentials shared across staff leave no way to tell who flushed the queue."],
    v: "Hold one queued test message, confirm the scheduler skips it, release it, and confirm delivery proceeds. Then delete a second test message and see the action recorded in the audit trail with the operator identity.",
    dep: ["queue-store", "audit-trail"]
  },
  "provisioning": {
    s: "Creating and changing the domains, mailboxes, aliases and per-user limits the server serves, and keeping the directory, store and DNS expectations consistent with each other.",
    d: "Adding a domain means the server learns to accept for it, a signing key is generated, and the operator publishes DNS records for MX, SPF, DKIM and DMARC. Adding a user creates directory entries and a mailbox store location with a quota. Removing is harder than adding: mail already queued, forwards, aliases and shared access all reference the account. Provisioning is usually driven from a control panel or customer billing system, so the interface must be idempotent.",
    k: ["Publishing DNS records for customers versus asking them to do it: automation avoids mistakes but requires control of the zone, while manual steps leave domains half configured.", "Soft-delete with a grace period versus immediate purge: grace allows recovery from mistakes but keeps personal data longer than users expect."],
    p: ["A deleted account's address is reassigned to a new user who then receives mail meant for the previous owner.", "A domain added to the server before its DNS is ready accepts mail it cannot yet authenticate for outbound, so recipients reject replies."],
    v: "Provision a test domain and user, then send mail to it from an outside server and read it over the client protocol. The signing record lookup in DNS must match the key the server actually uses.",
    dep: ["user-directory", "admin-api"]
  },
  "audit-trail": {
    s: "A tamper-evident record of administrative and security-relevant actions: who changed configuration, deleted mail, logged in from where, or read another user's mailbox.",
    d: "The audit trail captures operator commands, directory changes, delegated mailbox access, failed and successful logins with source addresses, and message releases from quarantine. It is separate from the delivery log: its purpose is accountability, not debugging. Entries are append-only and shipped off the host so an intruder cannot erase them. It is hard to decide what to record without logging message content, which the audit itself must never become a copy of.",
    k: ["Local audit files versus shipping to a separate system: local is simple but an attacker with root can rewrite it.", "Recording each mailbox read versus only privileged access: complete records give accountability but grow quickly and expose reading patterns."],
    p: ["Audit entries include message subjects or addresses unnecessarily, turning the trail into a second sensitive data store.", "Support impersonation of a user is performed without a distinct audit event, so later review cannot distinguish it from the user's own session."],
    v: "Perform an admin deletion and a login from a new address. Both appear in the externally stored trail with actor, time and source within seconds, and editing the local file does not alter the remote copy.",
    dep: ["client-authentication"]
  },
  "postmaster-mailboxes": {
    s: "The role addresses that standards expect every mail domain to monitor: postmaster for operations questions and abuse for complaints, plus handling of reports sent there.",
    d: "Remote operators, blocklists and automated feedback systems write to these addresses. They receive bounce questions, abuse complaints, authentication failure reports and delisting replies. They must accept mail from anyone, including senders the server would normally reject, so they are exempt from some filters, which makes them an abuse target. Someone has to read them: unmonitored role mailboxes mean complaints go unanswered until a blocklist listing results.",
    k: ["Exempting role addresses from filtering versus filtering normally: exemption honors the standard and avoids missing complaints, but invites floods and malware.", "Routing to a shared inbox versus a ticketing system: tickets assign owners and track response time, at the cost of extra integration."],
    p: ["The mailbox is full or unrouted after a staff change, so a complaint from a large receiver bounces and the sender stays on a blocklist.", "Automated abuse reports are read by a person only, so the same offending account keeps sending for days."],
    v: "Send a message from an external test server to postmaster at the domain and abuse at the domain. Both arrive in a monitored mailbox or ticket queue, not the quarantine, and a human has an alert for new items.",
    dep: ["address-resolution", "mailbox-quotas"]
  },
  "imap-server": {
    s: "The access protocol that lets clients list folders, fetch and search messages, change flags and append messages while the mailbox stays on the server.",
    d: "IMAP keeps state on the server: folders, message flags and UIDs. A session authenticates, selects a folder, and issues commands that fetch headers or body parts, search and store flags. Clients hold several connections at once. The server talks to the message index and store and must serve partial fetches of large messages cheaply. Hard parts include the many optional extensions, tolerating client quirks, long-lived connections that hold memory and handing consistent views while other clients change the folder.",
    k: ["Server-side state versus download and delete: server state supports many devices and webmail, but costs the operator storage and indexing for years.", "Strict protocol conformance versus tolerance of client quirks: strictness catches bugs but breaks widely deployed clients that deviate."],
    p: ["A client re-fetching the whole mailbox after each reconnect saturates the index and slows every other user.", "Search commands run unindexed on a large folder and tie up a worker process for minutes."],
    v: "Connect with a client, select a folder with thousands of messages, fetch the header list, search by sender, set a flag on one message, and confirm a second client sees the change without a full resync.",
    dep: ["message-index", "uid-and-modseq", "client-authentication"]
  },
  "pop-server": {
    s: "A simple access protocol that downloads messages from a single inbox, optionally deleting them from the server, with no folders or server-side flags.",
    d: "POP3 authenticates, lists the messages in the maildrop with sizes and unique identifiers, transfers them, and applies deletions when the session ends. It is stateless between sessions except for the identifiers clients use to remember what they already fetched. It is far less demanding than IMAP and survives in embedded devices, old clients and migration tools. The risk is data loss: download-and-delete leaves the only copy on one device.",
    k: ["Offering POP3 at all versus IMAP only: POP3 serves legacy devices and migration tools, but adds a second authentication surface to defend.", "Leave-on-server versus delete-after-download: leaving keeps a backup but fills the quota, deleting saves space and strands mail on one device."],
    p: ["Unstable unique identifiers cause clients to download the same messages again, flooding users with duplicates.", "A client that polls every minute against large inboxes generates constant load for little new mail."],
    v: "Connect with a POP3 client against a mailbox of known messages. List and unique-identifier values are stable across two sessions, and a deletion takes effect only after a clean session end.",
    dep: ["message-index", "client-authentication"]
  },
  "submission-service": {
    s: "The authenticated port where users and applications hand outgoing mail to the server, kept separate from the public port that accepts mail from other servers.",
    d: "Submission requires authentication and encryption, then applies policies the public port cannot: the sender must be allowed to use the claimed From address, rate limits apply per account, and the server may fix up headers such as missing Message-ID or date. After acceptance the message enters the queue like any other. It is the choke point for compromised accounts, so it is where sender limits and abuse detection hook in.",
    k: ["A separate submission port versus accepting submissions on the public port: separation allows strict authentication and different policy, but needs another listener and client configuration.", "Rewriting headers on submission versus rejecting malformed mail: rewriting helps simple devices, rejecting prevents the server from vouching for bad input."],
    p: ["Authenticated users can send as any address in the domain, so one stolen password allows impersonation of executives.", "Applications submit with no rate limit and a bug in a loop sends a hundred thousand messages in an hour."],
    v: "Authenticate and submit a message with a From address the account does not own. The server must reject it, while the owned address is accepted and the message appears in the queue with the authenticated account recorded.",
    dep: ["client-authentication", "sender-rate-limits", "smtp-listener", "queue-store"]
  },
  "jmap-api": {
    s: "A JSON over HTTP protocol for mailboxes that batches operations, returns only requested properties and exposes state tokens so clients can ask for changes since last time.",
    d: "Instead of a long-lived text connection with many round trips, JMAP clients send one request containing several method calls, referencing results of earlier ones, and receive structured JSON. Every collection has a state string; asking for changes since a state returns created, updated and destroyed identifiers. It fits mobile networks and web apps. It needs a mapping from the same store the other protocols use, so semantics such as flags and folders must agree.",
    k: ["A new protocol versus extending the old one: a fresh design fixes round trips and sync, but servers must maintain a second access path with consistent semantics.", "Opaque state strings versus numeric counters: opaque values allow the server to change its internals, but clients cannot reason about ordering."],
    p: ["Two protocols write the same mailbox with different notions of deletion, so a message vanishes from one view but not the other.", "Large batched requests with no server-side limits let one client pin a worker for a long time."],
    v: "Request changes since a saved state after flagging a message in another client over the older protocol. The response lists exactly that message as updated and returns a new state, with no full refetch.",
    dep: ["message-index", "uid-and-modseq", "client-authentication"]
  },
  "webmail-gateway": {
    s: "A web application that talks to the mailbox over the standard access protocols on behalf of a browser, handling sessions, rendering and attachment upload.",
    d: "The gateway authenticates the user, keeps a session, and translates page requests into mailbox operations against the server. It sanitizes message HTML before display, streams attachments and submits composed mail through the submission service. It is the most exposed component, because attackers get to deliver content that its renderer will display. Session hijacking, cross-site scripting through message bodies and remote content tracking all land here.",
    k: ["Server-side rendering of message HTML versus sandboxed client rendering: server-side sanitization is easier to audit, while sandboxing contains bugs but is harder to build correctly.", "Proxying remote images versus blocking them: proxying hides the user's address from the sender and still allows open tracking per message."],
    p: ["A sanitizer that misses one HTML construct allows a crafted message to run script in the user's session.", "Sessions stay valid after password change, so a stolen cookie keeps working."],
    v: "Open a message containing script and an external image in the gateway. The script must not run, the image must be blocked or proxied as configured, and a request log shows no direct connection from the browser to the image host.",
    dep: ["imap-server", "submission-service", "client-authentication"]
  },
  "client-authentication": {
    s: "Verifying who a connecting client is, using passwords over encrypted channels, token-based mechanisms or per-device credentials, with throttling against guessing.",
    d: "Clients prove identity with a mechanism negotiated in the protocol: plain credentials inside TLS, challenge-response, or an OAuth-style bearer token. The server checks against the user directory, tracks failures per account and per source address, and issues per-application passwords where multi-factor is required. Hard cases include legacy clients that cannot do modern flows, credential stuffing at scale, and delegation so an application can read mail without the primary password.",
    k: ["Passwords versus bearer tokens: passwords work with every client but are phishable and reused, while tokens limit scope and can be revoked yet need client support.", "Locking an account after failures versus throttling by source: locking blocks guessing but lets an attacker lock out the owner, throttling by source is bypassed by distributed attempts."],
    p: ["Legacy protocol access bypasses multi-factor checks, so attackers use it for credential stuffing.", "Failure counters apply only to the account name, leaving password spraying across many accounts unnoticed."],
    v: "Make repeated wrong-password attempts from one address and from many addresses against a test account. Throttling or lockout engages in both cases, a correct login from a trusted device still succeeds, and every attempt appears in the audit trail.",
    dep: ["user-directory", "inbound-starttls"]
  },
  "idle-push": {
    s: "Mechanisms that tell a connected or sleeping client that new mail has arrived, so it fetches immediately instead of polling.",
    d: "A client can keep a connection open and ask the server to report changes; the server writes an untagged notification when the folder changes. For mobile devices that drop connections, the server instead calls a platform notification service or a web push endpoint with a small wake-up message. Notifications are triggered by the delivery agent through the store. The difficulty is scale: hundreds of thousands of idle connections cost memory, and notifications must not leak message content to third-party push services.",
    k: ["Idle connections versus mobile push services: connections need no third party but drain batteries and are dropped by networks, while push is efficient but depends on a platform vendor.", "Sending content in the push versus a bare wake-up: content shows previews instantly but exposes it outside the mail system."],
    p: ["Notifications are sent before the delivery commit finishes, so the client fetches and finds nothing.", "Idle sockets without keepalive appear healthy server-side long after a network path has silently died."],
    v: "Deliver a test message to an idle connected client and measure time to the notification arriving. Then change networks, deliver again, and confirm the client reconnects and receives it without polling.",
    dep: ["imap-server", "local-delivery-agent"]
  },
  "imap-sync-extensions": {
    s: "Protocol extensions that let a client resynchronize a large folder by transferring only changes since its last known state, instead of re-listing every message.",
    d: "Each message has a stable UID within a folder and a UID validity value that changes if UIDs are reassigned. A per-folder modification sequence increases on every change, so a client can ask for messages changed since a given value, and learn about expunged UIDs. The server must store enough history to answer, including deletions. It is hard to maintain correctness across folder moves, restores from backup and migrations, where UID validity must change.",
    k: ["Keeping change history for expunged messages versus truncating it: history allows cheap resync but must be bounded, and after truncation clients must resync fully.", "Per-message mod-sequences versus folder-level timestamps: per-message sequences are exact, timestamps are simpler and can miss changes in the same instant."],
    p: ["A restore from backup reuses UIDs without changing validity, so clients display wrong messages for existing UIDs.", "Unbounded history for a busy shared folder grows the index until resync costs more than a full fetch."],
    v: "Sync a client, flag and delete messages from another client, then reconnect the first. It receives only the changed and expunged items, and its transfer size is proportional to the changes, not the folder.",
    dep: ["uid-and-modseq", "imap-server"]
  },
  "autoconfiguration": {
    s: "Published descriptions that let a client find the right servers, ports and security settings from just an email address, without the user typing them.",
    d: "Clients look up a well-known configuration document on the domain or a provider database, and may use DNS service records to find the access and submission hosts. The server side publishes accurate records, with the right authentication method per protocol. This removes the largest source of support requests, but it makes the published record security sensitive: a wrong or spoofed record can direct a client to send credentials elsewhere.",
    k: ["Publishing configuration over HTTPS on the domain versus DNS-only records: HTTPS carries richer settings and is easier to authenticate, DNS needs less infrastructure.", "One generic setup for all users versus per-user hints: generic is simple, while per-user hints support migration but need a lookup."],
    p: ["A configuration document served over plain HTTP can be altered in transit to point at an attacker's server.", "Records go stale after a server migration and new clients configure themselves against the old host."],
    v: "On a fresh client enter only an address at the test domain. The client must find the access and submission servers, choose encrypted ports, and complete login with no manual settings.",
    dep: ["dns-resolver", "certificate-management"]
  },
  "smtp-listener": {
    s: "The network service that accepts TCP connections on the standard mail ports, hands each to a session, and bounds how many it will serve at once.",
    d: "The listener binds ports for server-to-server mail and often an implicit-TLS and a submission port. It accepts connections, applies connection-level limits, sends a greeting banner and starts a session handler. It is typically the only component directly reachable from the internet, so it runs with minimal privilege and hands accepted data inward. Its main engineering questions are concurrency model, how many idle slow connections it can hold, and graceful reload.",
    k: ["Process per connection versus an event loop: processes isolate bugs but cost memory, event loops hold many idle connections cheaply but share one failure domain.", "A fixed connection cap versus load-based admission: a cap is predictable, load-based admission adapts but is harder to reason about under attack."],
    p: ["Slow clients holding connections open exhaust the cap and block legitimate senders.", "A reload drops in-flight sessions, and remote servers record those as failures."],
    v: "Open the maximum number of idle connections from a test host, then confirm a new legitimate sender still gets a greeting or an immediate temporary refusal, not a hang, and that reload leaves existing sessions finishing.",
    dep: ["connection-limits", "process-model", "privilege-separation"]
  },
  "smtp-session-state": {
    s: "The ordered conversation of greeting, sender, recipients and data that a connection must follow, with strict rules about which command is allowed when.",
    d: "A session moves from greeting through identification, optional encryption and authentication, then one or more transactions, each with a sender, one or more recipients and the message data. The server enforces order, resets cleanly between transactions, and returns standardized numeric replies where the first digit says success, temporary failure or permanent failure. Hard parts include pipelining, which sends many commands before reading replies, and commands from broken clients that must be tolerated or refused deliberately.",
    k: ["Strict command order versus tolerant parsing: strictness stops request-smuggling style abuse, tolerance keeps odd but harmless senders working.", "Per-recipient replies versus one reply for the whole transaction: per-recipient replies give precise errors, but multiply the states the sender must track."],
    p: ["Treating a bare line feed as a line end lets a crafted message smuggle a second message past filters that look at the first.", "Not resetting state after a failed transaction leaks recipients from one message into the next."],
    v: "Send commands out of order, a pipelined batch, and an oversized line to a test session. Each gets the documented reply code, the session stays consistent, and a following valid transaction still succeeds.",
    dep: ["smtp-listener"]
  },
  "esmtp-extensions": {
    s: "Optional capabilities the server advertises in its greeting reply, such as encryption, authentication, size declaration, pipelining and internationalized addresses.",
    d: "After the first greeting, the client asks for capabilities and the server lists the ones it supports. Each is a small contract: a size extension lets the sender declare length before sending, a delivery-status extension asks for notifications, a UTF-8 extension allows non-ASCII local parts, a chunking extension replaces dot-stuffing. The server must only advertise what it implements across every path, including its relay hops, since a message accepted with an extension must remain valid downstream.",
    k: ["Advertising many extensions versus a minimal set: more extensions improve efficiency and features, but each is more code exposed to untrusted input.", "Accepting internationalized addresses versus not: acceptance serves more users, but if a later hop cannot carry them the message must bounce after acceptance."],
    p: ["Advertising encryption on a port where the TLS configuration is broken causes sessions to fail after the client commits to it.", "A downgrade of internationalized messages to ASCII at a later hop mangles addresses and produces bounces nobody can interpret."],
    v: "Connect and read the capability list. Every advertised extension must work when exercised, and every capability the server could not honor on its outbound path must be absent from the list.",
    dep: ["smtp-session-state"]
  },
  "inbound-starttls": {
    s: "Upgrading an existing plaintext SMTP connection to TLS on request, presenting a certificate, and applying a policy for what to do when the sender does not use it.",
    d: "The server advertises the capability, the client issues the upgrade command, and the two perform a TLS handshake on the same connection, discarding anything learned before it. Between servers this is opportunistic: most senders do not verify the certificate and many will continue in plaintext if refused. The server records the protocol and cipher in a trace header. Hard parts: the plaintext phase is open to stripping by a network attacker, and certificate and cipher choices decide which older senders can still connect.",
    k: ["Requiring TLS from every sender versus opportunistic: requiring protects content but rejects legitimate old servers, opportunistic maximizes delivery and leaves a downgrade gap.", "Old protocol versions allowed versus refused: allowing keeps compatibility, refusing removes known weaknesses and breaks some senders."],
    p: ["Commands read before the handshake remain in a buffer and are processed after it, allowing injection by a network attacker.", "An expired certificate makes strict senders defer all mail without a clear error on the receiving side."],
    v: "Connect with a test client, upgrade, and confirm the negotiated version and cipher show up in the received trace header. Send a command injected before the handshake and verify it is discarded.",
    dep: ["certificate-management", "esmtp-extensions"]
  },
  "recipient-validation": {
    s: "Checking at the recipient command whether the address exists and may receive mail, so unknown recipients are refused during the conversation instead of bounced afterward.",
    d: "For each recipient the server asks routing and the directory: is this a served domain, a real mailbox or alias, is the account enabled and under quota. A permanent refusal during the session makes the sending server responsible for reporting failure to its own user, which avoids generating bounces to forged senders. When the server is only a gateway in front of another system, it must query that system or keep a synchronized list. The cost is a lookup per recipient at attack rates.",
    k: ["Reject unknown recipients at the session versus accept then bounce: rejecting is safe against backscatter, accepting hides which addresses exist from probing.", "Live lookup of a backend versus a periodically synced list: live is accurate but couples availability, a list is fast and may be stale."],
    p: ["A gateway accepts all recipients because the backend is unreachable, then must bounce to forged senders later.", "Distinguishing unknown from over-quota recipients in replies lets attackers harvest valid addresses."],
    v: "Send to a nonexistent address and to a valid one. The unknown one is refused with a permanent code during the session, with no queue entry and no bounce generated, while the valid one is accepted.",
    dep: ["address-resolution", "user-directory", "backscatter-prevention"]
  },
  "message-size-limits": {
    s: "Maximum sizes enforced at several levels: declared message size, actual bytes received, recipients per transaction and per-line length.",
    d: "The size extension lets a sender declare length so the server can refuse early. The server also counts actual bytes, because declarations can lie, and enforces a hard cap per message, per header, and per line, plus a cap on recipients per transaction. Limits must be consistent along the path: accepting a message that the next hop will refuse produces a bounce after acceptance. Attachments inflate when encoded, so users hit the limit sooner than they expect.",
    k: ["A low limit versus a high limit: low protects memory and queue space and frustrates users with large attachments, high accommodates them and enlarges the cost of abuse.", "Enforcing at the declared size versus counted bytes: declared is early and cheap, counted is necessary since declarations are untrusted."],
    p: ["Limits that differ between inbound server and downstream mailbox store cause accepted mail to bounce at final delivery.", "Counting only body bytes lets an attacker send huge header blocks that consume memory."],
    v: "Send a message just under and just over the limit, once with an honest size declaration and once with a false one. Oversize messages are refused with the right code at the earliest point, and nothing is left in the queue.",
    dep: ["esmtp-extensions", "data-reception"]
  },
  "connection-limits": {
    s: "Caps on how many connections, messages, recipients and errors a single source may produce in a time window, and tarpitting for sources that misbehave.",
    d: "Counters keyed by source address or network track simultaneous connections, connection rate, messages per connection and failed commands. When a source exceeds a threshold the server refuses with a temporary code, delays replies or drops the connection. Large legitimate senders send from small address ranges, so limits must be tunable per source. Counters need shared state if several servers sit behind one load balancer, and the source address is the load balancer's unless the real one is passed along.",
    k: ["Per-address limits versus per-network limits: per-address is precise but attackers rotate within a range, per-network catches that and punishes shared hosting neighbors.", "Delaying replies versus refusing: delays cost the attacker time and hold your sockets too, refusal is cheap for you."],
    p: ["A load balancer hides client addresses, so one limit applies to everyone and a single sender locks out the world.", "Limits tuned for typical senders throttle a large legitimate provider's burst, delaying valuable mail."],
    v: "Open connections and send recipients from one test address beyond each limit. Each threshold produces the configured temporary refusal or delay, while a second address in the same period is unaffected.",
    dep: ["smtp-listener"]
  },
  "data-reception": {
    s: "Reading the message body until the end-of-data marker, writing it durably to the queue, and only then telling the sender it was accepted.",
    d: "After the data command the server reads lines, undoes dot-stuffing, enforces limits, and writes to a queue file. Once the end marker arrives it flushes the file to stable storage, assigns the queue ID and returns the success reply. That reply transfers responsibility: the sender deletes its copy. Filtering decisions that need the complete message run before this reply so rejection is still possible. The hard part is the window between reading the last byte and replying, which is where a crash creates duplicates.",
    k: ["Filtering before the final reply versus after queueing: before allows outright rejection with no bounce, after shortens the sender's wait and requires generating bounces.", "Flush to disk before replying versus a batched flush: flushing before is safe, batching raises throughput and loses acknowledged mail in a crash."],
    p: ["The server crashes after writing but before replying, so the sender retries and the recipient gets duplicates.", "A slow filter holds the final reply past the sender's timeout, so the sender retries a message already queued."],
    v: "Kill the server immediately after the acceptance reply is sent. After restart the message must be in the queue and delivered once. Kill it before the reply: the sender retries and exactly one copy results from the dedup logic.",
    dep: ["queue-store", "message-size-limits", "spool-filesystem"]
  },
  "header-sanitization": {
    s: "Normalizing and repairing incoming message structure: adding trace headers, stripping internal-only fields, limiting header counts and rejecting malformed MIME that downstream parsers could misread.",
    d: "On arrival the server prepends a trace header with the peer, time, protocol and queue ID, removes headers that only its own components may set, and checks header and MIME limits. Authentication results and filter scores are written for later stages and for the mailbox store. It must be conservative: different parsers split the same message differently, and an attacker can exploit disagreement between the filter's view and the client's view of the same bytes.",
    k: ["Rewriting malformed messages versus passing them unchanged: rewriting protects clients but can invalidate a signature, passing preserves signatures and trusts every downstream parser.", "Stripping all unknown internal headers versus trusting by name: stripping is safe, trust by name lets an outside sender forge verdicts."],
    p: ["Inbound mail carrying a forged authentication-results header is trusted by a client because the server did not remove it.", "Rewriting headers after a signature was verified lets the final message differ from the one that passed."],
    v: "Send a message that includes a forged internal verdict header, duplicate From headers and deep MIME nesting. The forged header is removed, the duplicates are rejected or handled consistently, and the nesting limit is enforced.",
    dep: ["authentication-results", "data-reception"]
  },
});
