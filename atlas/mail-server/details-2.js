// Details for the mail server plate, part 2: sender authentication, filtering, routing.
ATLAS.details("mail-server", {
  "spf-evaluation": {
    s: "Checking whether the connecting IP address is authorized by the sending domain's published list of permitted senders, evaluated against the envelope sender or greeting name.",
    d: "The server takes the envelope sender domain (or the greeting identity for null senders), fetches its sender policy record from DNS, and evaluates mechanisms such as address ranges, MX hosts and includes of other domains. The result is pass, fail, softfail, neutral, none or an error. The standard caps DNS lookups at ten per evaluation, so deep include chains produce errors. It authenticates the path, not the visible From address, and breaks when mail is forwarded because the forwarder's address is not on the list.",
    k: ["Rejecting on fail versus only recording the result: rejecting stops forgeries early but blocks legitimate forwarded mail, recording leaves the decision to DMARC and scoring.", "Following all includes versus stopping at the lookup limit: full evaluation is more accurate, the limit protects against amplification and returns an error for large senders."],
    p: ["A sender's record exceeds the lookup limit and every receiver returns a permanent error, silently weakening protection.", "Forwarded mail fails the check, and rejecting on it bounces mail from mailing lists and forwards."],
    v: "Send test messages from an authorized, an unauthorized and a lookup-limit-exceeding configuration. The recorded results are pass, fail and permerror respectively, visible in the authentication results header.",
    dep: ["dns-resolver", "policy-record-cache"]
  },
  "dkim-verification": {
    s: "Verifying a cryptographic signature in the message header against a public key published in DNS by the signing domain, proving the signed parts were not altered.",
    d: "The signature header names the signing domain, a selector, the signed headers, a body hash and the algorithm. The server canonicalizes the headers and body per the declared rules, recomputes the hash, fetches the public key from DNS and checks the signature. A pass proves a domain took responsibility for the content, not that the message is wanted. Hard parts: messages modified in transit (list footers, rewrites) break the body hash, and key records are fetched from untrusted DNS at message rates.",
    k: ["Relaxed versus strict canonicalization: relaxed tolerates whitespace changes by intermediaries and slightly weakens integrity, strict breaks on harmless modification.", "Verifying every signature versus the first valid: all signatures cost more CPU and DNS but let a stronger signer rescue a weaker one."],
    p: ["Signatures that do not cover the From header let an attacker add a second From and pass verification.", "Large messages are verified in memory, so a flood of big signed messages becomes a resource attack."],
    v: "Send a signed test message, then one with the body altered by one byte. The first yields pass with the signing domain, the second yields fail on body hash, and both results appear in the trace header.",
    dep: ["dns-resolver", "policy-record-cache", "data-reception"]
  },
  "dmarc-evaluation": {
    s: "Combining the SPF and DKIM results with alignment to the visible From domain, then applying the domain owner's published policy: none, quarantine or reject.",
    d: "The server looks up the policy record for the From domain (falling back to the organizational domain), checks whether SPF or DKIM passed with an identifier aligned to that domain, and acts on the policy if neither did. It also notes the reporting addresses for aggregate reports. The decision protects the domain people see. Hard parts: finding the organizational domain requires a public suffix list, and mailing lists and forwarders legitimately break both mechanisms.",
    k: ["Honoring reject policies versus overriding them for known lists: honoring blocks phishing in the domain's name, overrides keep mailing lists working and weaken protection for that traffic.", "Evaluating at SMTP time versus after queueing: at SMTP time can reject so no bounce is needed, later evaluation delays the verdict and cannot refuse."],
    p: ["A stale suffix list treats a shared-hosting suffix as an organization and applies one tenant's policy to another.", "A domain publishes reject without covering all its legitimate senders, so its own mail is blocked."],
    v: "Send three messages for a test domain with a reject policy: aligned pass, passing with a mismatched domain, and unauthenticated. Only the first is delivered, and the others are refused with the policy reason recorded.",
    dep: ["spf-evaluation", "dkim-verification", "identifier-alignment"]
  },
  "identifier-alignment": {
    s: "The rule that the domain authenticated by SPF or DKIM must match the domain in the visible From header, in strict or relaxed form.",
    d: "SPF authenticates the envelope sender and DKIM the signing domain, neither of which is what a person reads. Alignment compares those domains with the From domain: strict requires an exact match, relaxed accepts the same organizational domain. This is what makes the visible address trustworthy. It depends on a correct organizational-domain computation and on consistent parsing of the From header, where multiple addresses, comments and encoded names create ambiguity.",
    k: ["Relaxed versus strict alignment: relaxed allows subdomains to send for the parent and fits most deployments, strict limits abuse by sibling subdomains and breaks third-party senders.", "One alignment mode for both mechanisms versus separate modes: separate lets a domain tighten the cryptographic path alone, at a cost of more configuration."],
    p: ["Parsing differences between the filter and the client mean the aligned domain is not the one displayed.", "Third-party senders use their own domain in the envelope and signing, and fail alignment until the owner delegates a signing key."],
    v: "Test with an envelope domain that differs from the From domain, then with a subdomain, under relaxed and strict settings. Results match the documented outcome for each of the four combinations.",
    dep: ["spf-evaluation", "dkim-verification", "header-sanitization"]
  },
  "arc-validation": {
    s: "Validating a chain of signed records added by intermediaries that record the authentication results they saw, so a receiver can trust results from forwarders it knows.",
    d: "A forwarder that modifies a message (list footer) breaks the original signature and SPF. Under ARC each hop adds a sealed set recording the results it observed and a signature over the chain so far. The final receiver verifies that the chain is intact and decides whether to trust the first hop's recorded results, usually based on a list of trusted intermediaries. It does not prove the message is wanted; trust depends on who sealed the chain.",
    k: ["Trusting chains from a configured list versus all valid chains: a list resists spammers building valid chains, but requires maintenance as forwarders change.", "Using ARC as an override of DMARC failure versus a scoring input: override rescues list mail, scoring is safer and recovers less of it."],
    p: ["An attacker constructs a valid chain of their own and gains trust if all valid chains are accepted.", "A broken link in one intermediary invalidates the chain for every later hop with no clear error."],
    v: "Pass a message through a test forwarder that modifies the body. The original DKIM fails, the chain validates, and with the forwarder on the trusted list the final result is accepted despite DMARC failure.",
    dep: ["dkim-verification", "dmarc-evaluation", "authentication-results"]
  },
  "reverse-dns-check": {
    s: "Looking up the name of the connecting address and confirming that name resolves back to the same address, a basic sign of a properly managed sending host.",
    d: "The server asks DNS for the pointer record of the peer IP, then resolves the returned name forward and checks that the original address is among the results. Mismatch or absence is a weak spam signal, commonly scored rather than rejected, since many small legitimate senders lack it. The greeting name is compared too. It adds two DNS lookups per connection, so results are cached, and failures from slow resolvers must not stall the session.",
    k: ["Rejecting on missing reverse DNS versus scoring: rejection cuts a lot of botnet traffic and blocks some real small senders, scoring blends it with other evidence.", "Checking at connection time versus after the greeting: early checking saves work on bad hosts, later checking lets the greeting name be compared too."],
    p: ["Slow reverse lookups hold the greeting past the client's timeout, so legitimate senders retry.", "Matching on a name resolved from attacker-controlled DNS gives the check no value on its own."],
    v: "Connect from test hosts with matching, mismatched and absent reverse records. Results are recorded correctly and the session greeting arrives within the limit even when the reverse resolver is slow.",
    dep: ["dns-resolver", "smtp-session-state"]
  },
  "authentication-results": {
    s: "A header the server adds recording every check it ran and its outcome, which later stages and mail clients use to make decisions without redoing the checks.",
    d: "After SPF, DKIM, DMARC, ARC and reverse DNS checks the server writes one header with the server's identity and a result for each method, with the properties tested. Filters read it, and clients display warnings from it. Its security depends on trust boundary: any header of this name arriving from outside must be removed before the server adds its own. It must also be placed so signing does not cover it and later forwarding does not confuse it with a downstream result.",
    k: ["Writing results as headers versus passing out of band: headers travel with the message and reach every consumer, out-of-band data is private but lost on storage or forwarding.", "Verbose properties versus minimal results: detail helps debugging and exposes internal policy to the recipient."],
    p: ["Headers claiming to be from this server are not stripped on arrival, so a client trusts a forged pass.", "Results are added after a rewrite that changed the message, recording a pass for content that no longer matches."],
    v: "Receive a message with a forged result header from an outside source. The delivered message contains only the server's own header, naming the server and showing real results matching what the logs show.",
    dep: ["spf-evaluation", "dkim-verification", "dmarc-evaluation", "header-sanitization"]
  },
  "policy-record-cache": {
    s: "A cache of the DNS records that authentication needs, such as sender policies, DKIM keys and DMARC policies, honoring record lifetimes and caching failures briefly.",
    d: "Authentication causes several TXT lookups per message, often to the same few domains. The cache stores answers and negative answers with their time to live, deduplicates concurrent lookups for the same name and bounds total recursion. Records are attacker-chosen content from arbitrary domains, so the cache must limit sizes and cap lookup depth. Staleness is the main tension: a key rotated by the sender must be seen promptly, a lookup failure must not turn into an accept or a reject without a policy.",
    k: ["Caching to the record's lifetime versus a floor and ceiling: respecting lifetimes follows the owner's intent, bounds keep misconfigured zero or very long values from hurting.", "Temporary DNS failure as temporary refusal versus ignore the check: refusal protects but delays mail during outages, ignoring keeps flow and lets forgeries through."],
    p: ["A cached failure outlives the outage and keeps a domain's legitimate mail deferred after DNS is healthy.", "A cache without per-message lookup budgets lets one crafted message trigger hundreds of queries."],
    v: "Rotate a test domain's signing key and wait one record lifetime. Mail signed with the new key verifies, a simulated resolver outage produces temporary refusals, and recovery restores normal results without restart.",
    dep: ["dns-resolver"]
  },
  "dmarc-aggregate-reporting": {
    s: "Collecting the authentication results of mail claiming each domain and sending daily summary reports to the addresses those domains publish.",
    d: "For each message evaluated, the receiver records the source address, the domain, the SPF and DKIM outcomes, and the policy applied. Once a day it groups these by domain and sends a compressed report to the domain's reporting address. Domain owners use the reports to find unauthorized senders and legitimate ones missing from their records. It is optional for receivers and costs storage and mail volume. Report contents expose source addresses but not message content.",
    k: ["Sending reports versus not: sending helps the ecosystem and earns goodwill, but needs storage, scheduling and a way not to become a destination for abuse.", "Verifying the report destination versus sending where told: verification stops a domain from pointing reports at a victim, and adds a DNS check per destination."],
    p: ["Report addresses in a published record point to a third party who never agreed, so the server mails them large reports as a harassment tool.", "Reports built from a sampled subset mislead the domain owner about volume."],
    v: "Send a mix of passing and failing test messages for a domain publishing a reporting address. After the daily cycle, one report arrives whose counts match the logged evaluations exactly.",
    dep: ["dmarc-evaluation", "dns-resolver"]
  },
  "filter-hook-interface": {
    s: "A protocol through which external filter programs examine each connection, envelope and message, and answer accept, reject, defer, quarantine or modify.",
    d: "At defined points (connect, greeting, sender, recipient, headers, body, end of message) the server calls filters over a local socket and waits for a decision, with a timeout. This lets spam, virus and policy tools be developed and updated separately from the transfer agent. Filters can also add headers or change the body. The difficulty is latency and failure: a slow or crashed filter stalls the session, so each filter needs a defined failure mode.",
    k: ["Fail open versus fail closed when a filter is down: open keeps mail flowing and lets spam and malware through, closed protects and defers all mail.", "Many small filters versus one combined engine: small ones are replaceable, one engine avoids repeated parsing and sees the whole picture."],
    p: ["A filter timeout is shorter than its worst-case scan, so large messages are repeatedly deferred and eventually bounced.", "A filter that modifies bodies runs before signature verification and breaks signatures that would have passed."],
    v: "Stop the filter process and send mail. The server follows the configured failure mode within the timeout, logs the error, and resumes normal filtering when the filter restarts, with no in-flight message lost.",
    dep: ["smtp-session-state"]
  },
  "content-scoring": {
    s: "A rule engine that adds weighted points for suspicious headers, phrases, structure, links and authentication results into a spam score compared with thresholds.",
    d: "Hundreds of rules test headers, body text, MIME structure, embedded URLs and results from other checks; each hit adds or subtracts points. The total maps to actions at thresholds. Rules are updated frequently as spammers change tactics, so they ship separately from the code. Score weights are tuned against labeled mail. The hard part is false positives: a small change in weights moves thousands of legitimate messages to the junk folder, and evasion adapts within days.",
    k: ["Hand-written rules versus learned weights: hand-written rules are explainable and quick to patch, learned weights fit the data better and are harder to audit.", "A single global threshold versus per-user thresholds: global is simple, per-user respects different tolerance at the cost of more state and support."],
    p: ["A rule update with a typo or overbroad pattern marks a flood of legitimate mail as spam within minutes.", "Scores computed with DNS-dependent rules change when lookups time out, so the same message gets different verdicts."],
    v: "Run a labeled sample of known spam and legitimate mail through the engine after each rule update. The false-positive rate on the legitimate set stays under the agreed bound before the update is deployed.",
    dep: ["filter-hook-interface", "authentication-results", "dnsbl-lookups"]
  },
  "statistical-classifier": {
    s: "A learned model, usually based on token frequencies, that estimates the probability a message is spam from words and features seen in previously labeled mail.",
    d: "Training counts how often each token appears in spam and in legitimate mail, per site or per user. At scoring time the model combines token probabilities into one estimate. It adapts to the mail a particular site gets, catching patterns no rule describes. It needs trustworthy labels: user reports, spam traps and manual review. Poisoning is a real risk, because an attacker can include legitimate words to dilute spam signal, and retraining on its own verdicts reinforces mistakes.",
    k: ["Per-user models versus shared models: per-user fits individual mail, shared models learn faster from more data and mislabel mail one user wants.", "Training on everything versus only on errors: training on everything is simple and drifts, error-only training is efficient and needs reliable feedback."],
    p: ["A user who marks newsletters as spam trains the shared model against legitimate mail for others.", "A model trained before a campaign misses it entirely until labels arrive, and new accounts have no data at all."],
    v: "Measure the classifier on a held-out labeled set that postdates its training. Accuracy and false-positive rate are within bounds, and a retrain with a flood of mislabeled samples is detected by comparison before deployment.",
    dep: ["filter-hook-interface", "feedback-training"]
  },
  "dnsbl-lookups": {
    s: "Querying DNS-based lists of addresses, domains and URLs that other parties have flagged for sending spam or hosting abuse, reversed into a DNS name and answered by a code.",
    d: "The server reverses the peer address into a name under the list's zone and checks for an answer; the returned value signals the reason or severity. Domains and links found in the message body are checked the same way. Lists are cheap and fast, run by volunteers and companies with different policies. Hard parts: quality varies widely, some lists charge or throttle heavy users, and a list outage or a policy change can suddenly block or pass large volumes of mail.",
    k: ["Rejecting on a listing versus adding score: rejection is cheap and risks collateral blocks, scoring blends lists with other evidence and costs a content scan for each message.", "Using many lists versus few trusted ones: many lists catch more and amplify one list's mistakes, few lists are predictable."],
    p: ["Queries sent through a public resolver exceed the list's free quota, which then returns a code that is read as a listing for everyone.", "A list expands to include a major provider's address range and your server refuses mail from millions of users."],
    v: "Query a list's published test entries for a listed and an unlisted address. The server's logged decision matches each, and when the list is unreachable the session proceeds within the timeout.",
    dep: ["dns-resolver", "filter-hook-interface"]
  },
  "reputation-store": {
    s: "A local database of how each sending address, network and domain has behaved toward this server: volume, spam rate, bounce rate and complaints, used to adjust scores.",
    d: "Every verdict and every user report updates counters for the source address, its network, the authenticated domain and sometimes the sending account. At the next connection the store provides a trust adjustment: new senders are neutral, long-term clean senders get lower scores, recent abusers higher ones. It needs aging so history decays, bounded memory for sources seen once, and a way to share across servers, since reputation learned on one node is useless to the next.",
    k: ["Keying on IP address versus authenticated domain: addresses are all that is known at connect time, domains survive provider changes and require authentication to trust.", "Local-only versus shared reputation: local reflects your users' view, shared learns faster and can propagate a poisoned entry."],
    p: ["A shared hosting address inherits the reputation of its worst tenant and good senders on it are penalized.", "A spammer builds clean history over weeks, then sends a burst, and the store scores it as trusted."],
    v: "Feed a test source a series of clean messages then a burst of messages marked as spam. Its trust adjustment rises, then falls within the configured window, and the change is visible in the next connection's score.",
    dep: ["verdict-actions", "feedback-training"]
  },
  "greylisting": {
    s: "Temporarily refusing mail from an unfamiliar sender and accepting only after a retry, because many spam sources do not retry as a real mail server does.",
    d: "The server records the triple of peer network, sender and recipient. On first sight it answers with a temporary failure; a legitimate server retries after its normal delay and is then accepted and remembered. Many bulk senders never retry. It costs no content scanning but delays first mail from every new source, often by minutes, and some legitimate senders use a different address on each retry, which defeats the triple match. Its value has fallen as spammers added retry logic.",
    k: ["Matching on the full address versus the network block: full address is precise, network matching handles senders that rotate addresses within a pool.", "Applying to everything versus only suspicious senders: universal delay stops more spam, delaying only borderline mail avoids annoying users with one-time codes and receipts."],
    p: ["Verification and one-time-code emails are delayed past their expiry and users cannot sign in.", "Large providers retry from different hosts each time, and the message is deferred repeatedly until it expires."],
    v: "Send from a new test host and watch the first attempt get a temporary refusal, the retry after the minimum delay be accepted, and a later message from the same triple pass immediately.",
    dep: ["reputation-store", "smtp-session-state"]
  },
  "virus-scanning": {
    s: "Scanning message bodies and attachments, including inside archives, for known malicious code and exploit patterns using signatures and heuristics.",
    d: "The scanner receives the message stream, decodes attachments, unpacks nested archives within limits, and matches against a signature database that updates several times a day. Verdicts reach the server through the hook interface. Scanning is expensive in CPU and memory and must be bounded: archive bombs and deeply nested files are a denial-of-service attack on the scanner itself. Detection lags new malware, so signature scanning is one layer beside attachment policy and sandboxing.",
    k: ["Scanning before acceptance versus after: before allows rejection with no bounce, after protects capacity at the cost of delivering or bouncing later.", "Deep unpacking versus a depth and size cap: deep finds hidden malware, caps stop archive bombs and let some pass unscanned."],
    p: ["Signature updates fail silently and the scanner runs for weeks on a stale database.", "A password-protected archive cannot be scanned and is passed through as clean by default."],
    v: "Send the standard antivirus test file directly, inside a nested archive, and with a deliberately oversized archive. The first two are detected and handled, the third is handled according to the configured limit policy.",
    dep: ["filter-hook-interface", "verdict-actions"]
  },
  "attachment-policy": {
    s: "Rules by file type, name and structure that block, rename or quarantine attachments regardless of whether a scanner found anything in them.",
    d: "Policies refuse executables and script files, double extensions, macro-bearing documents from unknown senders, and encrypted archives that cannot be inspected. File type is detected from content, not name, since extensions are trivially falsified. Policy is applied after decoding and unpacking, and differs by recipient group. It catches new malware that signatures lack, at the price of blocking legitimate files that users have a real need to send.",
    k: ["Block by type versus scan only: blocking is predictable and catches unknown malware, scanning only avoids interrupting work and trusts the signatures.", "Strip the attachment and deliver the message versus reject it entirely: stripping preserves the text and surprises senders, rejection tells them clearly."],
    p: ["A type check by file extension lets a renamed executable pass.", "Blocking all archives stops a business's routine file exchange, and the workaround becomes personal file-sharing links."],
    v: "Send a renamed executable, an encrypted archive and a normal document to a recipient under the policy. The first two are handled per policy by content type, the document is delivered, and the sender sees a clear reply for refusals.",
    dep: ["virus-scanning", "verdict-actions"]
  },
  "quarantine": {
    s: "A holding area for messages judged suspicious but not certain, where administrators or users can review, release or delete them before they expire.",
    d: "Quarantined messages are stored apart from mailboxes with the verdict reason and score, and optionally notified in a digest. Releasing re-injects the message so it follows delivery, usually bypassing the filter that held it. Retention is short, since it contains unwanted and often malicious content. Access must be controlled: a quarantine viewer that renders HTML is another way for malware to reach staff. Release must also not let users pull genuinely dangerous items.",
    k: ["User self-release versus administrator-only release: self-release scales and lets users free dangerous items, admin-only is safer and becomes a help desk queue.", "Digest notifications versus a portal: digests are convenient and train users to click links in mail, a portal keeps the action authenticated."],
    p: ["Release re-injects through the full pipeline and the message is re-quarantined repeatedly.", "Quarantine storage fills during a campaign, and when full the server must choose between rejecting and deleting."],
    v: "Trigger a quarantine verdict on a test message, find it with its reason, release it, and confirm it is delivered once to the mailbox. After the retention period, an unreleased test message is gone.",
    dep: ["verdict-actions", "queue-store", "audit-trail"]
  },
  "verdict-actions": {
    s: "The mapping from filter results to what happens to a message: reject during the session, accept and file as junk, tag the subject, quarantine, or drop.",
    d: "Scores and signals from authentication, content scoring, reputation and scanning reduce to a few outcomes per recipient group. Rejecting during the session is cleanest because the sender learns and no bounce is generated. Filing as junk keeps a recoverable copy. Silent drop is dangerous because neither side learns. Per-recipient actions need care: a message to ten recipients may deserve different handling for each, which conflicts with the single response given at end of data.",
    k: ["Reject versus accept and file as junk: rejecting is clear and loses recoverability, junk filing allows rescue and lets the server carry the cost of the message.", "Uniform policy versus per-recipient settings: uniform is predictable, per-recipient lets users choose strictness and complicates the one reply for the whole data."],
    p: ["Rejections for multi-recipient messages must be all or nothing, so one strict recipient blocks delivery to the rest.", "Silently dropping mail with a high score hides false positives for months."],
    v: "Send messages scoring in each band to a test mailbox. Each lands where policy says, rejects carry a clear reason code, and a message to two recipients with different thresholds is handled per recipient.",
    dep: ["content-scoring", "statistical-classifier", "reputation-store", "quarantine"]
  },
  "feedback-training": {
    s: "The loop that turns user reports and spam trap hits into labeled examples, retrains models, adjusts reputation and corrects mistakes.",
    d: "Users move messages to or from the junk folder; the server records those as labels. Dedicated spam trap addresses add pure spam samples. Reviewed reports update classifier tokens and sender reputation. The loop needs protection: attackers can submit false labels, new users may mark newsletters as junk, and unreviewed retraining magnifies mistakes. Retraining runs on a schedule, with evaluation against held-out data before a new model replaces the current one.",
    k: ["Learning from all user reports versus trusted reporters: all reports use more data and accept poisoning, trusted reporters are cleaner and sparser.", "Immediate online learning versus scheduled batches: online adapts quickly and propagates a bad label at once, batches allow evaluation before deployment."],
    p: ["A mass unsubscribing event is labeled as spam and the model starts filing a major sender's mail to junk for all users.", "Training data includes messages the user has already seen filtered, so the labels reflect the filter, not the user."],
    v: "Mark a batch of test messages as spam from several accounts, run the scheduled training, and check that similar new messages score higher while a held-out legitimate set shows no rise in false positives.",
    dep: ["flags-and-keywords", "reputation-store"]
  },
  "address-resolution": {
    s: "Turning a recipient address into a concrete outcome: a mailbox, an alias, a list, a forward, a remote destination or an error, by consulting the directory and lookup tables.",
    d: "The resolver splits the address, normalizes case and sub-address tags, determines the domain class, and looks up the local part in maps, directories or databases. It can recurse through aliases and must detect loops. Answers feed recipient validation at SMTP time and delivery after queueing, and both must agree. Hard parts: ambiguous precedence between tables, wildcard and catch-all behavior, and the cost of a directory lookup for every recipient.",
    k: ["Resolving at SMTP time only versus again at delivery: once is fast and cannot follow changes, resolving again follows updates and can disagree with what was promised.", "Catch-all addresses versus exact matching: a catch-all never loses mail and receives every dictionary attack."],
    p: ["Mixed-case or tagged addresses are looked up differently by validation and delivery, so mail is accepted then bounced.", "Alias loops multiply messages until the hop limit cuts them off."],
    v: "Resolve a set of test addresses: mailbox, tagged variant, alias to alias, list, forward and unknown. Each gives the documented outcome, and an alias loop is detected and rejected rather than delivered repeatedly.",
    dep: ["domain-classes", "user-directory", "alias-expansion"]
  },
  "domain-classes": {
    s: "The categories of domains a server distinguishes: those it delivers to locally, hosts virtually, relays for others, or does not serve at all.",
    d: "Each domain is configured as local (system accounts), virtual (accounts in a database with no system users), relay (accept and forward onward to another server) or unrelated. The class decides which recipient checks apply and which transport is used. It is the base of relay policy: confusing the classes turns the server into an open relay, or refuses mail it should accept. Changes must take effect together in recipient validation and delivery.",
    k: ["Virtual domains in a database versus system accounts: virtual scales to many domains and users, system accounts reuse operating system permissions and do not scale.", "Backup MX for a domain versus none: a secondary absorbs outages and is a spam target that accepts mail it cannot validate."],
    p: ["A domain listed under two classes behaves differently between the SMTP front end and delivery.", "A secondary server for a domain has no recipient list and accepts every address, then bounces to forged senders."],
    v: "Send test mail to one domain in each class. Local and virtual deliver, a relay-class domain forwards to its configured host, and an unrelated domain is refused from outside as relay denied.",
    dep: ["user-directory", "config-management"]
  },
  "alias-expansion": {
    s: "Replacing one recipient address with the list of addresses it stands for, applied recursively, with limits on depth and duplicates.",
    d: "An alias maps an address to one or more targets: mailboxes, other aliases, pipes to programs or remote addresses. Expansion produces one recipient set with duplicates removed and loops detected. Each resulting recipient gets its own delivery and status, so a single accepted message can have mixed outcomes. The envelope sender is retained so bounces go to the original sender, not the alias owner. Complexity comes from nested aliases and from rewriting policy applied at each step.",
    k: ["Expanding once at acceptance versus at delivery: acceptance fixes the set early, delivery picks up changes and makes an in-queue message take an unexpected path.", "Returning bounces to the sender versus the alias owner: sender is correct for the message, owner can fix the alias and may receive mail meant for others."],
    p: ["A large alias expands inside a single transaction and exceeds recipient limits downstream.", "An alias that delivers to a program runs attacker-influenced input through a shell."],
    v: "Send to an alias with nested aliases and a duplicate target. Each distinct final recipient gets exactly one copy, per-recipient status is logged, and an alias pointing at itself is cut off with a logged loop error.",
    dep: ["address-resolution"]
  },
  "mailing-list-expansion": {
    s: "Distributing one message to the subscribers of a list, managing membership, applying posting rules, and rewriting headers so replies and bounces behave.",
    d: "The list receives a message, checks the poster against membership or moderation rules, adds footers and list headers, and sends individual copies, each with the list as the envelope sender so bounces return to the list manager, not the poster. Since content and headers change, the original signature breaks and alignment fails, so lists often rewrite the From address. Bounce handling must remove dead addresses. Large lists need batching to avoid overwhelming the queue and outbound reputation.",
    k: ["Rewriting the From header versus preserving it: rewriting survives strict domain policies and hides the author's real address, preserving shows it and fails alignment.", "Sending one message to many recipients versus one per subscriber: one per subscriber is customizable and costs more transactions, batching is cheaper and leaks bounce handling."],
    p: ["A list posts bounces from a subscriber back to the whole list because the envelope sender was not set.", "Reply-all storms between two auto-responders and a list exhaust the queue."],
    v: "Post to a test list with one dead subscriber. All live subscribers receive one copy with list headers, the poster's domain policy is satisfied, and the dead address's bounce goes to the list manager and is counted.",
    dep: ["alias-expansion", "verp", "dkim-signing"]
  },
  "forwarding-and-srs": {
    s: "Passing a received message on to another mailbox while rewriting the envelope sender so the forwarded copy passes the next receiver's sender policy.",
    d: "A forward preserves the message and sends it onward, but the original domain's sender policy does not list the forwarder, so the next receiver sees a failure. Sender rewriting replaces the envelope sender with an address in the forwarder's own domain that encodes the original and a signed hash, so bounces can be mapped back and cannot be forged. It adds state: decoding bounces requires keeping the key and a validity period.",
    k: ["Rewriting the envelope sender versus leaving it: rewriting makes the sender policy pass and complicates bounce handling, leaving it breaks authentication at strict receivers.", "Forwarding as an alias versus a mailbox rule: aliases are simple and preserve everything, rules allow filtering before forwarding and risk loops."],
    p: ["Forwarding spam to a major provider damages the forwarder's reputation and gets its address range listed.", "Rewritten addresses past their validity window bounce, so late failure reports from the destination are lost."],
    v: "Forward a message from a domain with a strict policy to an external mailbox. The forwarded copy passes sender policy at the destination, and a bounce to the rewritten address is decoded and returned to the original sender.",
    dep: ["address-rewriting", "spf-evaluation", "verp"]
  },
  "relay-policy": {
    s: "The rules deciding which senders may use this server to send mail to destinations it does not serve: authenticated users and trusted networks, and nobody else.",
    d: "At each recipient the server checks: is the domain served locally, is the client authenticated, is the client address in a trusted range. If none, relaying is refused. An open relay lets anyone send spam through the server, which results in blocklisting within hours. Hard parts: trusted ranges that include shared or translated addresses, forwarded authentication state through proxies, and legacy devices that cannot authenticate and are therefore trusted by address.",
    k: ["Authentication required versus trusted by network address: authentication is strong and needs client support, address trust works for old devices and is exposed to anything on that network.", "Rejecting at recipient time versus at end of data: recipient time is early and cheap, end of data allows policy on content."],
    p: ["A proxy or NAT puts every outside client at a trusted internal address, so the server becomes an open relay.", "A relay rule that checks only the From domain lets forged internal senders relay."],
    v: "From an outside host without credentials, try to send to an external domain. It must be refused at the recipient command. The same transaction with valid credentials, or from a trusted address, is accepted.",
    dep: ["domain-classes", "client-authentication", "connection-limits"]
  },
  "transport-maps": {
    s: "Tables that choose how each destination is reached: direct delivery, a particular smarthost, a local agent, or a specific port and credentials, matched by domain, address or sender.",
    d: "After resolution, the router matches the destination against ordered rules to pick a transport: which delivery program, which next hop, which authentication and which source address. Rules can depend on sender for per-customer routing or reputation separation. Misordering is the common problem: a broad pattern placed before a specific one captures mail meant for a special route, and no error appears. Changes apply to messages already queued, which can surprise.",
    k: ["First match versus most specific match: first match is simple and order-sensitive, most specific is intuitive and costs more lookup logic.", "Routing tables in files versus a database: files are reviewable and require reload, a database allows live changes and is harder to review."],
    p: ["A default route sends internal-only domains to the public internet, leaking mail.", "A table edit takes effect on queued messages and sends them via a route that lacks required credentials, deferring them all."],
    v: "Create a rule for one test domain via a special host and send to it and to another domain. Logs show each message took the intended route, and a queued message reflects an edit after the next scheduling run.",
    dep: ["address-resolution", "config-management"]
  },
  "address-rewriting": {
    s: "Changing addresses in the envelope or headers according to rules: canonicalizing domains, adding a default domain, mapping internal names to public ones.",
    d: "Rewriting runs at defined points: on receipt (add domain to bare names), on submission (internal to public address) and on delivery (canonical forms). Rules match patterns and substitute. It makes legacy systems and migrations workable, and it is a source of subtle bugs because changing headers after signing invalidates signatures, and rewriting envelope addresses changes where bounces go and what policies see.",
    k: ["Rewriting at receipt versus at delivery: receipt keeps one canonical form through the system, delivery preserves the original in logs and risks policy applied to the wrong form.", "Rewriting headers versus envelope only: envelope-only is safe for signatures and leaves recipients seeing old names."],
    p: ["Rewriting after DKIM signing makes outgoing mail fail verification at the destination.", "A rule that is too broad rewrites addresses inside the quoted text of replies."],
    v: "Send messages with a bare local name and an internal alias through the rewrite points. Envelope and headers match the rules, logs show before and after, and an outgoing signed message still verifies at the receiver.",
    dep: ["address-resolution", "dkim-signing"]
  },
  "smarthost-routing": {
    s: "Sending all or selected outbound mail through one designated relay host, often with credentials, instead of delivering directly to each destination.",
    d: "Small or restricted networks send everything to a provider's relay that has the good reputation, DNS identity and bandwidth. The server authenticates to the smarthost and hands over the message, which then owns delivery. Mail leaves the server fast and is the smarthost's problem afterward. It makes the smarthost a single point of failure and a central observer, and the original server loses control over source address, signing and detailed bounce information unless explicitly arranged.",
    k: ["Direct delivery versus a smarthost: direct gives control and full diagnostics and demands an address with reputation, a smarthost lends reputation and gives up visibility.", "One smarthost versus several with failover: failover survives outages and complicates ordering and duplicates across attempts."],
    p: ["Credentials to the smarthost are stored in plaintext configuration readable by other local users.", "The smarthost accepts and later silently refuses, so the origin believes mail was delivered."],
    v: "Route a test domain via a smarthost, stop the smarthost, and send. The message defers with the smarthost error logged and delivers after restart, with the remote receiving exactly one copy.",
    dep: ["transport-maps", "smtp-client", "outbound-tls-policy"]
  },
});
