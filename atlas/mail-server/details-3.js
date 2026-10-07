// Details for the mail server plate, part 3: queue, delivery, bounces, outbound reputation.
ATLAS.details("mail-server", {
  "queue-store": {
    s: "The durable storage of accepted messages and their delivery state, where a message lives from acceptance until delivery, bounce or expiry.",
    d: "Each message is stored with its envelope, content and per-recipient status: pending, deferred, delivered or failed. The store must survive crashes, support millions of entries and give the scheduler fast access to what is due. Typical designs use one file per message plus an index, or a database. Writes are synchronous because the acceptance reply promises durability. It is hard to keep fast: directories with huge file counts, fsync costs, and recipient-level updates all become bottlenecks.",
    k: ["File per message versus a database: files are simple, robust and easy to inspect, databases make queries and large queues efficient and add a dependency that can corrupt.", "Storing message content once versus per recipient: once saves space and requires reference counting, per recipient is simple and multiplies storage for large lists."],
    p: ["A single directory holding millions of files makes every scan and cleanup slow.", "Per-recipient status updates rewrite the whole message file, so large lists create heavy disk traffic."],
    v: "Accept a message, then hard-power-off the host. After reboot the message is in the queue, intact, with its per-recipient state, and is delivered exactly as scheduled.",
    dep: ["spool-filesystem", "queue-ids"]
  },
  "queue-ids": {
    s: "A unique identifier assigned to each message at acceptance, used in logs, traces, bounces and administration, and used as the file name in the queue.",
    d: "The ID must be unique across restarts and across servers in a cluster, short enough to type and safe as a file name. It appears in the trace header and in the success reply, so remote administrators can quote it. It differs from the Message-ID header, which the sender chose and may be reused or missing. Some designs encode time or node in the ID, which helps debugging and leaks information. Collisions are rare and destructive when they happen.",
    k: ["Random IDs versus time-ordered IDs: random avoids guessing and spreads storage load, time-ordered helps sorting and ranges and reveals volume.", "One ID per message versus per recipient delivery: per message ties logs together, per delivery attempt identifies each handoff and needs two levels."],
    p: ["Two cluster nodes generate the same ID after a restart with a reset counter and overwrite each other's files.", "Support staff search by Message-ID and find nothing because the sender omitted it."],
    v: "Generate a hundred thousand IDs from two nodes restarted mid-run. No collisions occur, and a given ID found in the success reply appears in every later log line for that message.",
    dep: []
  },
  "queue-tiers": {
    s: "Separate queues for new, in-delivery and deferred messages, plus a hold area, so fresh mail is not stuck behind a backlog of messages that keep failing.",
    d: "New arrivals enter an incoming tier, move to active when a delivery slot is available, and drop to deferred after a temporary failure. Deferred messages are rescanned on a slower schedule. Hold is for administrator-parked messages. The split keeps the scheduler's working set small and lets new mail attempt delivery immediately. Moving messages between tiers has to be cheap and atomic, and the policies for each tier differ: size limits, scan interval, priority.",
    k: ["Separate tiers versus one queue with a state field: tiers keep working sets small and cost moves between structures, a single queue is simple and scans more.", "Priority classes (interactive versus bulk) versus first in first out: priorities protect urgent mail and risk starving bulk senders."],
    p: ["A huge deferred backlog is rescanned too often and starves delivery of new mail.", "Without a separate bulk tier, a newsletter occupies every slot and password resets wait behind it."],
    v: "Fill the deferred tier with messages to a dead destination, then send a message to a healthy one. It is delivered within seconds, unaffected by the backlog.",
    dep: ["queue-store", "queue-scheduler"]
  },
  "queue-scheduler": {
    s: "The component that picks which messages to attempt next, grouping them by destination, honoring retry times and concurrency limits, and handing batches to delivery agents.",
    d: "It reads due messages, groups recipients by next hop so one connection carries many messages, and starts delivery workers up to per-destination and global limits. It reschedules failures per the retry policy and records results. The scheduler decides fairness: one customer's burst must not starve others. Its hard problems are the cost of scanning a large queue, the delay before a destination that recovered is noticed, and avoiding thundering herds at restart.",
    k: ["Batching by destination versus strict arrival order: batching is efficient and reorders mail, strict order is predictable and wastes connections.", "Event-driven wake-ups versus periodic scanning: events react quickly and need careful bookkeeping, scanning is simple and wastes work."],
    p: ["After an outage, every deferred message is retried at once and the burst gets the server throttled by the remote.", "Fairness is by message count, so one sender with huge recipient lists consumes all slots."],
    v: "Queue ten thousand messages to ten destinations, one slow. Delivery to the nine healthy ones completes at full rate while the slow one stays within its own concurrency limit.",
    dep: ["queue-store", "per-destination-concurrency", "retry-schedule"]
  },
  "retry-schedule": {
    s: "The timetable for re-attempting deferred mail: short intervals at first, lengthening with each failure, until a maximum age is reached.",
    d: "A temporary failure (a 4xx reply, a timeout, a connection refusal) means try later. Typical schedules start at minutes and back off toward hours, with jitter, so a day has a handful of attempts and a message lives for days. Each message and each destination track failures; a destination that has been failing may be marked dead for a window to skip attempts. The schedule balances speed of recovery against load on a struggling remote server and queue growth.",
    k: ["Exponential backoff versus fixed intervals: backoff reduces load on failing destinations and slows delivery after a short outage, fixed intervals are fast and hammer a struggling host.", "Per-message backoff versus per-destination: per-destination notices recovery for everyone together, per-message is independent and wastes attempts."],
    p: ["A destination that recovered stays quiet for hours because every message backed off separately.", "Without jitter all deferred messages align and retry in synchronized waves."],
    v: "Make a test destination return temporary errors for two hours. The log shows attempts at the configured growing intervals with jitter, and after the destination recovers, the backlog drains at the concurrency limit.",
    dep: ["queue-scheduler", "message-expiry"]
  },
  "per-destination-concurrency": {
    s: "Limits on simultaneous connections and on messages per connection to each destination domain or address, to avoid being throttled or blocked for being aggressive.",
    d: "Receiving servers dislike many parallel connections from one source. The scheduler caps concurrent sessions per destination, and per recipient domain, and sends several messages down one connection. Limits are tuned per large provider, since each has different tolerances, and they back off when the remote replies with throttling codes. Too low a limit makes mail slow, too high gets the address rate-limited or blocked, and the safe value moves over time.",
    k: ["Static limits per domain versus adaptive limits: static is predictable and needs hand tuning, adaptive finds each remote's tolerance and oscillates.", "Limits per destination domain versus per destination host: per domain respects policies keyed to the domain, per host matches how remotes count connections."],
    p: ["A single global limit is shared by all destinations, so one slow provider uses all slots.", "Limits applied per outbound process rather than globally multiply with the number of processes."],
    v: "Send a large batch to one provider-like test destination with a limit of five. The destination never sees more than five simultaneous connections, and throughput matches the limit times messages per connection.",
    dep: ["queue-scheduler", "adaptive-throttling"]
  },
  "message-expiry": {
    s: "The maximum time a message may remain undeliverable before the server gives up and returns it to the sender as a failure.",
    d: "After several days of failed attempts (commonly five), the server stops retrying and generates a failure notice. A shorter limit helps time-sensitive mail, a longer one rides out extended outages. A warning is often sent partway. Expiry converts a transient state to a definite one, so the sender can react, and it must be recorded exactly once. Clock changes and administrators editing the schedule can cause early or never-ending expiry.",
    k: ["Long lifetime versus short: long rescues mail across long outages and delays bad news, short informs senders quickly and loses mail the remote would have accepted tomorrow.", "Different lifetimes per class: bulk mail can expire in hours and critical mail in days, at the cost of configuration and surprises."],
    p: ["A clock set back lets undeliverable mail outlive the limit by days, and set forward expires everything immediately.", "Bounces for expired mail go to a forged sender and become backscatter."],
    v: "Queue a message to a destination that always defers, and shorten lifetime for the test. At expiry exactly one failure notice is generated to the real sender, and the message leaves the queue.",
    dep: ["retry-schedule", "dsn-generation", "clock-sync"]
  },
  "crash-recovery": {
    s: "How the queue restores a consistent state after a crash or power loss: finding half-written messages, orphaned locks and messages in unknown delivery state.",
    d: "On start the server scans for incomplete queue files and discards or repairs them, releases locks held by dead processes and returns messages that were mid-delivery to the pending state. The important question is what happened to a message whose delivery was in flight: it may have been accepted by the remote just before the crash. The only safe answer is to retry, which can create a duplicate, so recovery is where at-least-once behavior is introduced.",
    k: ["Retry in-flight messages after a crash versus mark as failed: retry never loses mail and may duplicate it, failing loses messages the remote may never have received.", "Journaled recovery versus scanning files: journals are fast and complex, scanning is simple and slow on large queues."],
    p: ["A half-written file is delivered with a truncated body because it passed an existence check.", "Stale lock files from a previous run block the scheduler from touching any message."],
    v: "Kill the server repeatedly during heavy load, restart, and compare queue contents with a record of acknowledged messages. Every acknowledged message is present and intact, with at most duplicate deliveries, never missing ones.",
    dep: ["queue-store", "spool-filesystem"]
  },
  "backpressure": {
    s: "Slowing or refusing new mail when queue size, disk space or downstream capacity is near exhaustion, so the server fails gracefully instead of losing accepted mail.",
    d: "Signals include free spool space, queue depth, memory and the age of the oldest message. When thresholds pass, the listener replies with temporary failures, reduces concurrency, or pauses acceptance for certain sources first. Refusing is safe because the sender keeps the message. What is unsafe is accepting a message and then losing it. Priority matters: submission from known users and role mailboxes may keep flowing while bulk or unknown sources are deferred.",
    k: ["Refuse new mail versus accept and shed load later: refusing keeps the promise and annoys senders, accepting then dropping breaks the promise.", "Global thresholds versus per-sender fairness: global is simple and lets one source consume the headroom, per-sender protects others and tracks more state."],
    p: ["Disk fills during a burst and the final write fails after the success reply had been sent.", "Thresholds apply equally to everyone, so a spam wave blocks legitimate mail from important senders."],
    v: "Fill the spool to the threshold in a test. New external connections receive temporary refusals, authenticated submission continues for a reserved share, and no accepted message is lost when space returns.",
    dep: ["queue-store", "spool-filesystem", "smtp-listener"]
  },
  "smtp-client": {
    s: "The program that opens connections to remote mail servers and transfers queued messages, interpreting each reply as success, retry or permanent failure.",
    d: "It resolves the destination, connects, greets, negotiates encryption, authenticates if needed, and transmits envelope and data. Each reply code is mapped to an action: 2xx done, 4xx defer, 5xx fail. It sends several recipients per transaction and splits them when the remote refuses some. Timeouts at each stage prevent hangs. It is hard because remote servers misbehave: they accept data and close, reply with the wrong class of code, or tarpit.",
    k: ["Treating every 5xx as permanent versus classifying: trusting the code is the standard, classifying text handles misconfigured remotes and risks wrong guesses.", "Many recipients per transaction versus one: many is efficient and one failing recipient complicates results, one per transaction is simple and slow."],
    p: ["A remote that closes after the data command is read as a failure and the message is retried, creating duplicates.", "Timeouts too long hold slots on dead hosts, too short fail slow but healthy hosts."],
    v: "Deliver to test servers that accept, defer, reject, close mid-data and stall. Each case produces the documented queue state, and only the closed-mid-data case may produce a second delivery on retry.",
    dep: ["mx-selection", "outbound-tls-policy", "dns-resolver", "queue-scheduler"]
  },
  "mx-selection": {
    s: "Choosing which of a destination's mail exchangers to contact, ordered by preference, falling back to the next on failure and to address records if none are published.",
    d: "The client queries the destination's MX records, sorts by preference, shuffles equal ones, and tries addresses in order, over both IP families. With no MX it uses the address record. A destination that publishes a null MX declares it takes no mail, so the message fails at once. A temporary failure of the first choice moves to the next, and a permanent reply from any server ends the attempt. Hard parts are lookups failing partway and bounding total time.",
    k: ["Trying every address versus stopping after a few: all addresses maximize delivery and cost time on dead destinations, a cap bounds latency.", "Preferring IPv6 versus IPv4: IPv6 is the future and some paths are broken or have poor reputation."],
    p: ["A lowest preference host accepts connections and always defers, and the fallback is never tried.", "A destination's MX points at a name that resolves to the sender's own server, creating a mail loop."],
    v: "Publish test MX records with a dead primary, a deferring second and a working third. The client tries them in order, delivers through the third, and logs each address attempt.",
    dep: ["dns-resolver", "smtp-client"]
  },
  "outbound-tls-policy": {
    s: "Deciding when to require encryption and certificate verification on outbound connections, using opportunistic defaults and published policies that make encryption mandatory for specific domains.",
    d: "By default the client uses TLS if offered and does not verify the certificate, which stops passive listening and not an active attacker. Stronger policies are discovered per destination: a policy fetched over HTTPS that names acceptable MX hosts and demands verification, or DNS records that pin certificates to the DNS-signed zone. When a policy requires TLS and the connection cannot meet it, mail is deferred, not sent in plaintext. Failures are reported through a standard reporting mechanism.",
    k: ["Opportunistic versus enforced TLS: opportunistic always delivers and can be downgraded by an attacker, enforcement protects and delays mail when a peer's certificate expires.", "Policy via HTTPS versus DNS-signed records: HTTPS needs only web hosting and trusts first fetch, signed DNS resists tampering and needs signed zones."],
    p: ["A cached policy outlives a destination's migration, so all mail defers until the cache expires.", "Falling back to plaintext after a handshake failure silently defeats the policy."],
    v: "Test a destination with a policy requiring valid TLS, first with a valid certificate and then an expired one. The first delivers encrypted, the second defers with a clear reason and no plaintext attempt appears on the wire.",
    dep: ["certificate-management", "dns-resolver", "smtp-client"]
  },
  "dkim-signing": {
    s: "Adding a cryptographic signature to outbound messages with a key whose public half is published in DNS, so receivers can verify the domain took responsibility for the content.",
    d: "At the last point before leaving the server, the signer picks the key by sender domain, canonicalizes selected headers and body, computes the hash and signature, and adds the header. Keys are rotated by publishing a new selector, switching signing to it, and retiring the old one later. Private keys are among the server's most sensitive assets. The signer must run after every modification, and cover the From header, and it should not sign mail it should not vouch for.",
    k: ["Signing at the submission point versus at the last hop before sending: submission signs early and later rewrites invalidate it, last hop signs the final bytes.", "One key per domain versus per customer or stream: separate keys isolate compromise and reputation, and multiply DNS records to manage."],
    p: ["A signing key leaks from a shared server and anyone can send signed mail as the domain until DNS is changed.", "A rotation removes the old DNS key while mail signed with it is still in the queue, which then fails verification."],
    v: "Send to an external verifier and read its result: pass with the correct domain and selector. Then rotate keys and confirm queued older messages still verify during the overlap period.",
    dep: ["queue-store", "certificate-management", "address-rewriting"]
  },
  "source-ip-selection": {
    s: "Choosing which local address a message leaves from, by sender, customer, stream or reputation class, so traffic classes build separate reputations.",
    d: "A server with several addresses assigns each outbound connection to one of them according to rules: marketing mail from one pool, transactional from another, new customers from a probation pool. The chosen address must have matching reverse DNS, a greeting name that resolves to it, and sender policy records that list it. Selection interacts with warm-up and throttling. Failures show up as a single pool's mail suddenly deferred or blocked while others deliver normally.",
    k: ["Dedicated addresses per customer versus a shared pool: dedicated isolates reputation and requires warm-up and volume, shared is easier and lets one customer harm everyone.", "Static assignment versus dynamic balancing: static keeps reputation predictable, dynamic spreads load and mixes behaviors."],
    p: ["A new address is used for full volume before warm-up and receivers throttle everything it sends.", "The routing rule falls through to the default pool for an unrecognized customer, putting new bulk mail on the best reputation addresses."],
    v: "Send test messages from three streams. Logs and received headers at a test destination show each leaving from its assigned address, with reverse DNS and sender policy records matching that address.",
    dep: ["transport-maps", "helo-and-ptr-identity", "ip-pool-segmentation"]
  },
  "adaptive-throttling": {
    s: "Adjusting sending rate to each destination based on its replies: slowing on throttling codes, speeding up while all is accepted.",
    d: "Remote servers signal limits through temporary replies that carry text such as too many connections or rate limited. The sender recognizes these by code, enhanced status and sometimes by provider-specific text, reduces concurrency and message rate for that destination, and probes upward after a quiet period. A control loop like this must not oscillate, and must not treat a sender-specific block as a transient limit and keep pushing.",
    k: ["Parsing reply text versus using codes only: text catches provider-specific signals and breaks when wording changes, codes are stable and coarse.", "Slowing per destination versus per source address: per destination protects relationships, per address matches how many remotes meter."],
    p: ["A reply that means blocked by policy is treated as a temporary rate limit and the server keeps trying, deepening the block.", "Rate reductions are never relaxed, and delivery to one provider stays slow for weeks."],
    v: "Make a test destination reply with a rate-limit code after ten messages a minute. Observed send rate falls to that level within a few minutes without errors, then rises again once the limit is lifted.",
    dep: ["smtp-client", "enhanced-status-codes", "per-destination-concurrency"]
  },
  "connection-reuse": {
    s: "Keeping established connections to destinations open to send several messages, saving handshakes and satisfying remote servers that prefer fewer, longer sessions.",
    d: "After a delivery, the client holds the TLS session open for a short time and sends the next message to the same destination through the same connection, with a reset between transactions. A shared cache across delivery processes lets any of them reuse a connection. It improves throughput for high-volume destinations, and cuts costly handshakes. It needs care with idle timeouts, remote limits on messages per connection and one failure poisoning the shared connection.",
    k: ["A connection cache shared across processes versus per process: shared reuses more and needs coordination, per process is simple and spreads load across more connections.", "Long idle hold versus closing at once: holding saves handshakes and ties up slots on both sides."],
    p: ["The remote closes an idle connection and the client discovers it only on the next send, causing a spurious failure.", "A message that corrupted the session state is followed by others on the same connection, which then fail."],
    v: "Send a hundred messages to one test destination. The destination sees far fewer connections than messages, each carrying many transactions, and the delivery log shows no failures from reused but closed connections.",
    dep: ["smtp-client", "per-destination-concurrency"]
  },
  "local-delivery-agent": {
    s: "The final agent for local recipients, which runs user filter scripts, enforces quotas and writes the message into the mailbox store.",
    d: "Given a queued message and a resolved recipient, the agent reads the user's filter scripts and settings, decides the target folder, checks quota, and appends to the store atomically. It tells the index and notification systems about the new message. A result of success means the message is durable in the mailbox. A temporary failure (store busy, quota in grace) returns it to the queue. It runs with the user's privileges or through a store service, to keep one user's data out of another's reach.",
    k: ["Delivering via a store protocol versus writing files directly: a protocol decouples agent and store and adds a hop, direct writes are fast and tie the agent to the format.", "Over quota as temporary versus permanent failure: temporary lets users free space, permanent informs senders and can bounce important mail."],
    p: ["A crash between writing the message and updating the index delivers a message that clients cannot see until reindex.", "A filter script that loops or forwards back to the same address generates a mail loop."],
    v: "Deliver a message to a user with a filter script and a nearly full quota. It lands in the scripted folder when space allows, and defers with a clear status when over quota, never partially stored.",
    dep: ["queue-store", "message-index", "mailbox-quotas", "user-filter-scripts", "mailbox-locking"]
  },
  "user-filter-scripts": {
    s: "A restricted scripting language that users or administrators use to file, forward, reject or auto-reply to mail on the server, safely and without running arbitrary code.",
    d: "The standard sieve language is declarative and has no loops or file access, so a script cannot damage the server. Tests look at headers, size and envelope; actions file into folders, flag, redirect, reject, or send vacation replies at limited frequency. Scripts run at delivery and are uploaded through a management protocol, with validation. The hard parts are loop prevention for redirects and replies, rate limits on auto-replies, and conflicting actions when several scripts or rules apply.",
    k: ["A restricted declarative language versus arbitrary scripts: restricted is safe and limited, arbitrary code is powerful and a security risk.", "Server-side rules versus client-side rules: server rules apply to every device and before sync, client rules are more flexible and need an open client."],
    p: ["A vacation reply is sent to mailing lists and automated senders, creating floods or backscatter.", "A user redirect to an external address forwards spam and damages the server's reputation."],
    v: "Install a script that files by sender, redirects one subject and sets a vacation reply. Matching mail lands in the right folder, redirects apply once, and the vacation reply is sent once per sender in the window and never to list mail.",
    dep: ["local-delivery-agent", "forwarding-and-srs"]
  },
  "dsn-generation": {
    s: "Producing a machine-readable failure, delay or success notice for the sender, containing the reason, the affected recipients and the original message headers.",
    d: "When delivery fails permanently or expires, the server builds a notice message with a human-readable part, a structured status part listing each recipient with action and status code, and the original message or its headers. It is sent with a null envelope sender so a failing bounce cannot itself bounce. Success notices are sent only when requested. It is hard because the notice goes to an address that was claimed, not verified, so a careless server sends mail to victims.",
    k: ["Returning the full original versus headers only: full helps the sender diagnose and can leak content to a forged address, headers only is safer and less useful.", "Generating bounces after acceptance versus rejecting at the session: after acceptance is unavoidable for downstream failures and creates backscatter risk."],
    p: ["Notices go to forged senders and are reported as spam, damaging reputation.", "A notice with a non-null sender can itself bounce, producing a loop between two servers."],
    v: "Force a permanent failure for a test recipient. A notice with a null envelope sender reaches the sender, listing the recipient, the status code and the remote's text, and a failure of that notice produces no further message.",
    dep: ["enhanced-status-codes", "backscatter-prevention", "queue-store"]
  },
  "enhanced-status-codes": {
    s: "A structured three-part status number, such as class.subject.detail, that precisely names why a delivery succeeded, was deferred or failed, alongside the basic reply code.",
    d: "The first digit repeats the class: success, persistent transient failure or permanent failure. The second groups the subject (address, mailbox, system, network, policy) and the third gives detail. Servers return them in replies, and DSNs carry them. Senders classify and act on them: a mailbox-full code behaves differently from a bad destination address. They are inconsistent in practice, and some servers use generic or mismatched codes, so classification must tolerate surprises.",
    k: ["Mapping reply codes strictly versus heuristics on text: strict is predictable, heuristics recover information from nonstandard replies and can misfire.", "Emitting precise codes versus generic: precise codes help senders and expose internal policy, generic codes reveal less."],
    p: ["A server returns a permanent class for what is really a temporary condition, and senders delete valid addresses.", "Applications branch on text instead of codes and break when the wording changes."],
    v: "Trigger each condition on a test server: unknown user, full mailbox, policy rejection, relay denied and greylist. Each returns the documented enhanced code, and the sender logs and acts on the code.",
    dep: ["smtp-session-state"]
  },
  "bounce-classification": {
    s: "Interpreting incoming failure notices to decide whether an address is dead, temporarily unreachable or blocking the sender, so lists and reputation reflect real outcomes.",
    d: "A bounce from a remote server arrives as a message to the envelope sender. The classifier parses its structured part or falls back to text patterns, and sorts it into hard failure (bad address), soft (mailbox full, server down) or block (policy, reputation). Hard failures update the suppression list; blocks signal reputation trouble. Notices from many systems differ in format, and auto-replies and challenge messages look similar, so classification mistakes either keep sending to dead addresses or suppress live ones.",
    k: ["Structured parsing only versus text pattern fallbacks: structured is reliable and misses non-standard senders, text patterns catch more and need constant upkeep.", "Suppress after one hard bounce versus after several: one is cautious for reputation and removes addresses with a typo-like error, several tolerates transient misreporting."],
    p: ["Out-of-office replies are classified as bounces and live users are suppressed.", "Reputation blocks are classified as bad addresses, so a delisting issue empties the mailing list."],
    v: "Feed a labeled corpus of real bounce messages through the classifier. Hard, soft and block categories match the labels at the target rate, and misclassified samples are reviewed before rules are deployed.",
    dep: ["dsn-generation", "enhanced-status-codes", "suppression-list"]
  },
  "backscatter-prevention": {
    s: "Avoiding bounce messages to forged senders: refusing undeliverable mail during the session and validating that a bounce is real before generating or accepting one.",
    d: "Backscatter is the stream of notices sent to people whose address was forged on spam. Prevention puts recipient checks at the front, so there is nothing to bounce later; verifies that inbound bounces carry a valid signed token proving the original message was sent from here; and discards bounces without one. Gateways must have the recipient list or ask the backend at session time. It is a cost when there is no way to know validity early.",
    k: ["Reject at the gateway versus accept and bounce: reject needs reliable recipient data and avoids all backscatter, accept is easy to deploy and generates abuse.", "Dropping unsigned bounces versus accepting them: dropping blocks backscatter and loses a few real notices from servers that strip the token."],
    p: ["A gateway accepts mail for addresses it cannot verify and then bounces to forged senders, landing on blocklists.", "Unsigned legitimate bounces are dropped, and users never learn their messages failed."],
    v: "Send spam with a forged sender and an invalid recipient through the gateway. It is refused in the session with no bounce generated, and an unsigned fake bounce arriving at the server is discarded and counted.",
    dep: ["recipient-validation", "verp"]
  },
  "verp": {
    s: "Encoding the recipient in the return address of each outgoing copy so a bounce identifies exactly which address failed, even when its text is unhelpful.",
    d: "Each message to a list or a bulk set uses a different envelope sender like a unique local part carrying the recipient address and sometimes a signature and a timestamp. When any notice returns, its destination address tells which recipient failed, without parsing the text. It also authenticates bounces: those lacking a valid token can be discarded. The cost is one transaction per recipient and that the return domain must receive mail and handle many addresses.",
    k: ["One transaction per recipient versus batching: per recipient gives exact attribution and loses batching efficiency, batching is cheaper and relies on parsing.", "Signed tokens versus plain encoding: signed tokens prevent forgery and need key management, plain is simple and spoofable."],
    p: ["Special characters in the recipient address are encoded inconsistently and bounces cannot be decoded.", "Tokens expire before a very late bounce and are discarded."],
    v: "Send to a test list with one bad address. The bounce arrives at the tagged return address, decodes to that recipient with a valid signature, and the address is flagged without any text parsing.",
    dep: ["queue-store"]
  },
  "suppression-list": {
    s: "A list of addresses that must not be mailed again because of hard bounces, complaints or opt-outs, checked before each send.",
    d: "Entries come from classified hard bounces, spam complaints, unsubscribes and administrator action, each with a reason and date. Before accepting a message for an external recipient, the submission path checks the list and drops or rejects. Continued sending to dead addresses and complainers harms reputation quickly. Hard cases are expiring temporary entries, allowing a user to re-subscribe, and scope: per sender, per customer or global.",
    k: ["Global versus per-customer suppression: global protects reputation for everyone and one customer's mistake blocks others, per customer is isolated and repeats the same bounce.", "Permanent versus expiring entries: expiry recovers from mistakes and re-sends to dead addresses, permanent is safe and holds errors forever."],
    p: ["A bounce caused by a temporary mailbox-full condition permanently suppresses a valid address.", "The suppression check applies only to bulk mail, so transactional messages keep bouncing."],
    v: "Cause a hard bounce for a test address, then submit again. The second message is refused at submission with the suppression reason, before any connection to the remote is attempted.",
    dep: ["bounce-classification", "submission-service"]
  },
  "delay-warnings": {
    s: "A notice sent to the sender when delivery is still being retried after some hours, so they know the message is delayed, not lost.",
    d: "After a threshold such as four hours without delivery, the server sends a delay notice listing the affected recipients, the last error and when it will give up. It uses the same structured format as failure notices. It is helpful for human senders and noise for automated ones, and it carries the same backscatter risk as bounces. Many large operators disable them for that reason, preferring a final failure notice only.",
    k: ["Sending warnings versus silence until failure: warnings reassure and allow action, silence reduces noise and surprises people with a failure days later.", "Warning per message versus aggregated: per message is simple, aggregated limits volume for bulk senders and needs batching."],
    p: ["Delay notices to forged senders add backscatter at times when the queue is already stressed.", "The warning promises delivery attempts that expiry later cuts off, with inconsistent timing."],
    v: "Make a test destination defer for longer than the threshold. One delay notice arrives at the sender at the right time, listing the recipient and reason, and the later outcome matches what it stated.",
    dep: ["dsn-generation", "retry-schedule"]
  },
  "sender-rate-limits": {
    s: "Limits on how fast an account, domain or application may submit messages and recipients, enforced at submission to contain mistakes and stolen credentials.",
    d: "Counters per authenticated account and per source track messages and recipients over sliding windows (per minute, per hour). Exceeding a limit yields a temporary refusal to the sender or holds the account. Limits differ by plan and age: a new account starts low. A rate limit is the earliest defense against a compromised account sending a flood, so it must be enforced where authentication is known. The hard part is setting numbers that do not throttle a legitimate announcement.",
    k: ["Counting messages versus recipients: messages is simple and misses one message to ten thousand, recipients tracks real volume and needs expansion first.", "Hard refusal versus queue and slow release: refusal is clear and breaks workflows, slow release keeps mail flowing and conceals the limit."],
    p: ["Limits are enforced per server in a cluster, so an attacker spreads connections to multiply the allowance.", "A legitimate announcement to a large list is blocked with no one aware until users complain."],
    v: "Authenticate as a test account and submit beyond the limit. Excess is refused with the documented code, the counter resets after the window, and the event appears in monitoring for that account.",
    dep: ["submission-service", "compromised-account-detection"]
  },
  "sender-quotas": {
    s: "Longer-horizon caps on the total messages or recipients an account or customer may send per day or month, tied to plan, reputation and verification status.",
    d: "Where rate limits stop bursts, quotas bound total volume. Counters persist across restarts and are shared across nodes. They grow with account age and a clean record, and shrink after complaints. Quotas protect outbound reputation and billing. Accurate counting is hard when messages can fail after counting, bounce, or expand to many recipients. Users need to see their remaining allowance, and exceeding it needs a path to request more.",
    k: ["Counting on submission versus on successful delivery: submission is immediate and over-counts failures, delivery is exact and lags and allows overshoot.", "Fixed plan quotas versus reputation-adjusted: fixed is predictable, adjusted rewards good senders and is harder to explain."],
    p: ["Counters held in memory reset on restart, giving attackers a fresh allowance.", "Quota exhaustion is silent and customers discover it when mail stops."],
    v: "Send up to a test quota, then past it. Messages beyond are refused with a quota-specific reply, usage shown to the customer matches counters, and a restart does not reset the count.",
    dep: ["submission-service", "sender-rate-limits"]
  },
  "ip-warmup": {
    s: "Gradually raising the volume sent from a new address over weeks, so receivers can observe good behavior before seeing large amounts of mail.",
    d: "A new address has no history, and sudden volume looks like spam. Warm-up begins with a few hundred messages a day to the most engaged recipients and increases by a set ratio, watching delivery, deferral and complaint rates at each large receiver. The schedule is enforced by the server, which holds excess mail on another pool. If rates deteriorate it pauses or steps back. It takes time, and every receiver has its own tolerance, so the schedule is tuned from feedback.",
    k: ["Strict schedule versus feedback-driven ramp: strict is predictable and ignores signals, feedback adapts and needs reliable measurements.", "Warm with real customer mail versus a seed list: real mail has real engagement and risks it, seeds are safe and do not behave like real recipients."],
    p: ["A customer's large first campaign is sent from a cold address and is throttled and junked.", "Warm-up counts all destinations together, so a small share of volume at one strict provider hits that provider's limits."],
    v: "Track a new address over its ramp: daily volume rises along the schedule while deferral and complaint rates at each major receiver stay under thresholds, and a degraded day triggers the automatic step back.",
    dep: ["ip-pool-segmentation", "source-ip-selection", "complaint-monitoring"]
  },
  "ip-pool-segmentation": {
    s: "Dividing sending addresses into pools by mail type or customer risk, so that a problem in one class does not contaminate the reputation of the others.",
    d: "Transactional mail, marketing, new or probationary customers and internal mail each use their own pool, and customers move between pools as their record changes. Segmentation limits the blast radius of a complaint wave. It increases cost since each pool needs enough steady volume to maintain reputation, and enough addresses to rotate. Policies decide how much a customer can send before moving up, and how a bad customer is isolated without enough evidence yet.",
    k: ["Many small pools versus few large: small pools isolate harm and carry too little volume for a stable reputation, large pools are stable and share risk.", "Automatic promotion and demotion versus manual: automatic reacts quickly and can be gamed, manual is safe and slow."],
    p: ["Transactional and marketing mail share addresses, and a complaint spike delays password reset mail.", "A pool with sparse traffic looks inactive and then suspicious when a burst arrives."],
    v: "Induce a complaint rate in the probation pool of a test setup. Deliverability metrics for the transactional pool stay unchanged, and the offending customer is moved or limited per policy.",
    dep: ["source-ip-selection", "complaint-monitoring"]
  },
  "helo-and-ptr-identity": {
    s: "Ensuring each sending address presents a greeting name that resolves back to it, has a matching reverse DNS record and is listed in sender policy.",
    d: "Receivers compare the greeting name, reverse DNS of the connecting address, forward resolution of that name and the sender policy for the envelope domain. A consistent set is a basic sign of a managed sender. Addresses with generic residential or provider-assigned names are suspect. The operator controls reverse DNS only through the address's owner, which may need a request to the network provider, and every addition of a sending address needs all of these records changed together.",
    k: ["A unique greeting name per address versus one name for the fleet: unique names help trace problems and need more records, one name is simple and obscures which node sent.", "Matching reverse and forward names exactly versus broader name matching: exact is what checks expect and takes record work."],
    p: ["A new address enters service with the default provider name as reverse DNS, and large receivers refuse it.", "Greeting names are changed in configuration while the DNS record is not, and checks fail intermittently."],
    v: "For every sending address, run a lookup chain: reverse record, forward record of that name, and the name presented in the greeting. All three agree, and the sender policy lists the address.",
    dep: ["dns-resolver", "source-ip-selection"]
  },
  "blocklist-monitoring": {
    s: "Regularly checking whether any sending address or domain is on public blocklists, and alerting before delivery problems appear.",
    d: "A monitor queries many lists for each sending address and domain on a schedule, records listings, and alerts with the list's identification of the cause. Operators then fix the cause (a compromised account, a bad customer) and request delisting. Listings follow reputation: some come from spam traps, others from policy rules about residential address ranges. A listing's impact depends on how many receivers consult that list, so tracking prioritizes by influence.",
    k: ["Checking all known lists versus those consulted by major receivers: all is thorough and noisy, major lists focus effort on those that matter.", "Requesting delisting immediately versus fixing the cause first: immediate restores flow and is relisted fast, fix first takes longer and lasts."],
    p: ["A listing is discovered from customer complaints days after delivery began failing.", "Delisting is requested while the compromised account is still sending, and the address is listed again, sometimes permanently."],
    v: "Use a list's published test entry for one of your addresses. The monitor raises an alert within one polling interval, names the list and reason, and clears after the entry is removed.",
    dep: ["dns-resolver", "metrics-and-alerting"]
  },
  "provider-feedback": {
    s: "Data that large receivers give back to senders: complaint reports, delivery and reputation dashboards, and error text, used to understand how others see this server.",
    d: "Some receivers send a copy of a message a user marked as spam to a registered address, others expose reputation scores and delivery errors through a portal or API, and some publish aggregate reports on TLS and authentication failures. The server registers its addresses and domains, ingests the reports, and maps each to a customer and message. Coverage is uneven: the largest receivers offer tools and many others offer nothing.",
    k: ["Registering with each provider versus relying on bounces: registration gives early, specific data and takes setup and upkeep, bounces need nothing and arrive late and vague.", "Automatic action on complaints versus review: automatic is fast and mistakes remove good customers, review is accurate and slower."],
    p: ["Complaint reports arrive at a mailbox nobody monitors and the complainer keeps receiving mail.", "Reports identify a message by a header that the outbound path stripped, and nothing can be attributed."],
    v: "Mark a message from a test sender as spam at a provider with a feedback channel. The report arrives, is matched to the sender through the tagging header, and adds the recipient to suppression.",
    dep: ["suppression-list", "complaint-monitoring"]
  },
  "complaint-monitoring": {
    s: "Tracking per customer and per address the rates of bounces, spam complaints and deferrals, and acting when they cross thresholds that receivers treat as abuse.",
    d: "Rates are computed over windows from delivery logs, classified bounces and complaint reports. Bounce rates above a few percent and complaint rates above a fraction of a percent are typical danger levels for large receivers. Crossing a threshold triggers a warning, rate reduction, move to a probation pool or suspension. The measure is noisy for small senders, so thresholds need minimum volume. Attribution to the right customer is essential, because a shared pool punishes everyone for one sender.",
    k: ["Automatic enforcement versus alerting humans: automatic limits damage fast and may suspend legitimate senders, human review is slow and accurate.", "Per message-stream thresholds versus per account: per stream is precise and needs tagging, per account is simple and mixes different behaviors."],
    p: ["Windows too long react after the reputation damage is done, and too short fire on small samples.", "Complaints from one large receiver are not representative, and rates computed over all mail hide a problem at one provider."],
    v: "Simulate a rising bounce rate for a test customer. Thresholds trigger the defined escalation at the expected volume and rate, and rates in the dashboard equal rates recomputed from raw logs.",
    dep: ["bounce-classification", "mail-logging", "metrics-and-alerting"]
  },
  "compromised-account-detection": {
    s: "Spotting an account that has been taken over to send spam, by sudden changes in volume, recipients, source locations and content, and stopping it quickly.",
    d: "Signals include a login from a new country followed by high volume, many distinct recipients not in the account's history, a spike in bounces, content matching spam, and submission outside the user's usual pattern. Detection feeds sender limits, forced password reset and temporary holds on the account's queued mail. It must be fast: a compromised account can send thousands of messages in minutes and put the addresses on blocklists. False positives lock out users traveling or running legitimate campaigns.",
    k: ["Automatic suspension versus alert only: suspension stops damage in minutes and locks out some real users, alerting depends on a person responding.", "Behavioral baselines per account versus global rules: baselines catch subtle takeovers and need history, global rules are simple and miss low-volume abuse."],
    p: ["Outbound scanning runs after the message has left, so the damage is done before the verdict.", "Held mail from a suspended account is released automatically after the timeout and the spam continues."],
    v: "Using a test account, log in from a new region and send to many new recipients. The system flags the account within minutes, holds queued mail, and requires a reset, with the actions in the audit trail.",
    dep: ["sender-rate-limits", "client-authentication", "audit-trail"]
  },
});
