// Details for the certificate authority plate, part 2: profiles, issuance pipeline, transparency logging, revocation.
ATLAS.details("certificate-authority", {
  "certificate-profiles": {
    s: "Machine-readable templates, one per certificate type, that define every field, extension and constraint a certificate may or must contain.",
    d: "A profile lists the issuing key, allowed name types, required and forbidden extensions, key usages, maximum validity and any policy identifiers. The issuance pipeline builds each certificate strictly from its profile and the validated request, never from the request alone. Profiles are versioned and reviewed like code. Hard part is tracking external rules: the profile must match the baseline requirements and what clients actually accept, and a field that is wrong in one profile is wrong in every certificate issued from it.",
    k: ["Few strict profiles vs many flexible ones: few profiles are easy to audit and lint; many profiles fit more customers but multiply the rules to verify.", "Profile as data vs as code: data is reviewable and testable by non-authors; code allows complex logic that is harder to audit."],
    p: ["A profile change deployed without lint updates issues thousands of certificates with a field that is now noncompliant.", "Profiles copied between hierarchies carry along constraints that no longer match the new issuer."],
    v: "Issue a certificate from each profile in a test environment and diff the parsed fields against the profile definition, confirming nothing extra or missing appears.",
    dep: ["extensions-policy", "name-policy", "key-requirements", "validity-policy"]
  },
  "extensions-policy": {
    s: "Rules for which extensions appear in a certificate and with what values: key usage, extended usage, basic constraints, identifiers, policy identifiers and status locations.",
    d: "Each extension has a rule: required, forbidden or optional, and its allowed values, along with whether it is marked critical. End-entity profiles forbid signing capability; intermediate profiles require it and may limit usage purposes. Locations of status services and issuing certificates are included so clients can find them. Hard because extensions interact: an unexpected usage purpose lets a server certificate act as something else, and clients treat unknown critical extensions differently.",
    k: ["Restricting extended usage to one purpose vs permitting several: single purpose limits misuse; multiple purposes reduce certificates but widen what a stolen key can do.", "Marking extensions critical vs non-critical: critical forces correct handling; non-critical is accepted by more legacy clients but may be ignored."],
    p: ["Leaving a client-authentication usage in server certificates lets them authenticate users to unrelated systems.", "A wrong status location extension makes revocation checks silently unreachable."],
    v: "Parse issued certificates from each profile and confirm only the permitted usage purposes and constraints appear, and that the listed status and issuer locations return valid responses.",
    dep: ["certificate-profiles"]
  },
  "name-policy": {
    s: "Rules for what may appear as a certificate's subject and alternative names: allowed types, wildcard handling, internationalized names, reserved ranges and the form of organization fields.",
    d: "Names must be validated before use and normalized: lowercase, no trailing dots, internationalized names in a single canonical form. Wildcards are limited to the leftmost label and cannot cover public suffixes. Internal-only names and private address ranges are refused by public profiles. Subject fields are populated only from validated data. Difficult cases include lookalike characters, names at registry boundaries and the public suffix list, which changes continually.",
    k: ["Subject fields from validation records vs from the request: the first prevents tampering; the second is simpler but trusts the requester.", "Allowing wildcards vs forbidding them: wildcards simplify operations; they widen the damage of a compromised key to every host under the name."],
    p: ["An outdated public suffix list lets a wildcard cover names owned by unrelated parties.", "Mixed-script lookalike names pass checks and are used for phishing."],
    v: "Request certificates for a wildcard over a public suffix, an internal address and a mixed-script lookalike; confirm each is refused, while a legitimate wildcard is accepted.",
    dep: ["certificate-profiles", "blocklist-screening"]
  },
  "key-requirements": {
    s: "The accepted key types, sizes and parameters for subscriber and authority keys, and the checks that reject keys known to be weak or compromised.",
    d: "Policy lists acceptable algorithms and minimum strengths, and refuses keys with known flaws: small sizes, bad parameters, keys that share factors with others, and keys previously revealed as compromised. Checks run at request intake and again before signing. The list changes as cryptanalysis and standards advance. Hard because rejecting a key type affects the whole customer base at once, and detecting weak keys needs a database of every key the authority has seen.",
    k: ["Narrow list of allowed algorithms vs broad: narrow limits risk and testing; broad supports older systems that cannot change.", "Checking against known-compromised key lists vs not: checking blocks reuse of leaked keys; it needs a maintained dataset and costs time per request."],
    p: ["An old customer system that generates predictable keys fails only after a policy update, with no warning.", "Accepting a key that was revealed publicly issues a certificate that an attacker can already use."],
    v: "Submit keys that are too small, malformed, and previously published; confirm each is rejected with a specific reason, and a modern key passes.",
    dep: ["algorithm-agility"]
  },
  "validity-policy": {
    s: "The maximum lifetime for each certificate type, the timestamps used for start and end, and the rules for how lifetimes are shortened over time.",
    d: "Maximum lifetime is set per profile, driven by baseline requirements and risk: shorter lifetimes reduce exposure to compromise and stale information. Start times are set slightly early to tolerate clock skew, and issuance clamps to the lifetime of the issuing certificate. Policy changes are scheduled with notice. The difficulty is customer impact: shorter lifetimes mean more frequent renewals, so every manual process becomes a recurring failure.",
    k: ["Short lifetimes vs long: short limits exposure and shrinks revocation needs; long reduces renewal effort but keeps stolen keys useful.", "Fixed clamping to the issuer's expiry vs allowing overrun: clamping keeps chains valid; overrun would make the certificate fail when the issuer expires."],
    p: ["A certificate lifetime that exceeds its issuing certificate's remaining life fails earlier than expected.", "Backdating the start time too far is treated as suspicious or breaks audits."],
    v: "Issue a certificate near the end of an issuing key's life and confirm its expiry is clamped. Check the start and end dates of every profile against its maximum.",
    dep: ["certificate-profiles"]
  },
  "cp-cps": {
    s: "The published documents that state what a certificate means and exactly how the authority operates, and that auditors and relying parties hold it to.",
    d: "A policy document states what the certificates are for and what is promised; a practice statement describes how the authority actually does it: validation methods, key handling, personnel, revocation and audit. They follow a standard outline and are updated at least yearly. Everything in them must match reality, because the audit tests the practice against the text. Difficult because documents drift behind systems, and a mismatch is a finding even when the system is secure.",
    k: ["Detailed practice text vs high-level: detailed text is verifiable but needs update for every change; high-level avoids churn but gives auditors less to test.", "One document for all hierarchies vs one per hierarchy: one is easier to maintain; separate documents are clearer when practices truly differ."],
    p: ["A new validation method deployed before the document is updated is a compliance violation from day one.", "Text copied from a template promises controls the authority does not run."],
    v: "Pick ten statements at random from the practice document and trace each to a configuration, log or record that shows it is true today.",
    dep: ["baseline-compliance", "profile-approval"]
  },
  "profile-approval": {
    s: "The review and approval process for any change to a profile or policy, with testing, sign-off and a scheduled rollout before it affects issuance.",
    d: "A proposed change is written as a diff, tested in a staging environment against the linters and a sample of real requests, reviewed by roles with compliance and engineering responsibility, and approved by more than one person. Rollout is staged, and the practice document is updated with it. A record ties each issued certificate to the profile version used. Hard because the urgent cases, such as responding to a new rule, are when pressure is highest and review is most tempting to skip.",
    k: ["Two-person approval for every change vs risk-tiered approval: always two catches mistakes everywhere; tiering is faster but depends on classifying correctly.", "Staged rollout vs all at once: staged limits the number of bad certificates; all at once ends dual running of old and new rules."],
    p: ["An emergency change applied directly to production skips testing and issues noncompliant certificates until the next scan.", "Changes recorded after the fact make the audit trail unreliable."],
    v: "Pick a recent profile change and confirm it has a diff, test results, two approvals, a rollout record and a matching practice document update, in that order by timestamp.",
    dep: ["certificate-profiles", "change-management"]
  },
  "issuance-orchestrator": {
    s: "The service that takes a validated order and drives it through checks, signing and publication, recording each step and refusing to continue if any check fails.",
    d: "It gathers the validated names, the profile and the public key, then runs the sequence: recheck policy, assemble the certificate, lint it, create a precertificate when logging is required, obtain log receipts, sign the final certificate, store and deliver it. Each step is recorded with identifiers so the whole path can be reconstructed. It is the one component that must not be bypassed. Hard because it coordinates slow external calls and must be restartable without issuing twice or leaving a signed certificate unrecorded.",
    k: ["Durable workflow with retries vs fire-and-forget: durable steps survive restarts and give audit trails; they are more complex to build.", "Single orchestrator path for every channel vs per-channel paths: one path guarantees identical checks; per-channel paths are faster to build and diverge over time."],
    p: ["A crash between signing and recording leaves a certificate that exists but is missing from the database and revocation data.", "A bypass path added for a special customer skips lint and becomes a misissuance source."],
    v: "Kill the orchestrator process after the signing step in a test, restart it, and confirm exactly one certificate exists, recorded in the database and delivered once.",
    dep: ["preissuance-linting", "tbs-assembly", "signing-service", "issued-cert-db", "ct-submission"]
  },
  "preissuance-linting": {
    s: "Automated checks run on the unsigned certificate that compare it with all known rules and refuse to sign if any rule is violated.",
    d: "A linter parses the assembled certificate or precertificate and runs hundreds of checks against standards and baseline requirements: field lengths, encodings, name forms, extension values, lifetimes and algorithm choices. A failure blocks signing and raises an alert. The rule set is updated continually as requirements change, and results are logged. Hard because a bug in the issuance code is repeated in every certificate, and linting is the control that stops a single mistake becoming an incident.",
    k: ["Blocking on any lint error vs warning only: blocking prevents misissuance; it also means a new, over-strict rule can halt all issuance.", "Independent linter implementation vs one shared with the issuer: independence catches shared parsing mistakes; sharing is less work and shares the blind spots."],
    p: ["A linter running only on a sample after signing detects problems after they are already public.", "Disabling a failing rule to restore issuance without a record hides a real compliance gap."],
    v: "Feed the linter a certificate with a known error in a name field and confirm issuance stops with the error identified. Confirm the rule set version in logs matches the current release.",
    dep: ["certificate-profiles", "tbs-assembly"]
  },
  "precertificate-flow": {
    s: "A deliberately unusable twin of the certificate is signed and logged first; the log receipts then go into the real certificate, which is signed afterwards.",
    d: "The precertificate contains the same fields as the final certificate plus a poison extension that makes it invalid for use. It is signed by the issuing key or a special key and submitted to logs. The returned receipts are embedded in the final certificate, which is signed. This ensures the certificate cannot exist without being logged. The hard part is exact equality: any difference between the two beyond the allowed ones makes the log entry fail to match, and one signature happens before the other.",
    k: ["Precertificate with embedded receipts vs delivering receipts separately: embedding needs no server support but requires two signings; separate delivery is simpler to issue and harder to deploy.", "Special precertificate signing key vs same key: a separate key limits misuse; the same key is simpler but a precertificate then carries the issuer's authority."],
    p: ["Fields that differ by even one byte between precertificate and final certificate make receipts invalid.", "A precertificate logged but never followed by a certificate is mistaken for misissuance by monitors."],
    v: "Fetch a precertificate from a log and the final certificate, remove the poison and receipt extensions, and confirm the remaining fields are byte-identical.",
    dep: ["ct-submission", "sct-embedding", "tbs-assembly", "signing-service"]
  },
  "serial-generation": {
    s: "Produces certificate serial numbers that are unique and unpredictable, using a secure random source with enough entropy to resist attacks on the signature hash.",
    d: "Each serial is generated from a secure random generator, with a fixed minimum number of random bits, and checked for uniqueness within the issuing key. Unpredictability matters because a chosen-prefix attack on the hash needs the attacker to predict the signed content. Serials are never sequential or derived from time alone. The record of every serial is kept for revocation lists. Hard in the details: sign bit and length rules, and collision handling across distributed issuers.",
    k: ["Random serials vs sequential: random defeats prediction attacks; sequential is easy to audit and index but exposes issuance volume and aids hash attacks.", "Uniqueness enforced by database constraint vs probabilistic: a constraint guarantees it and adds a dependency; probabilistic is faster but needs enough bits."],
    p: ["A weak or seeded generator on a cloned virtual machine produces duplicate serials.", "A serial that encodes the sign bit incorrectly is rejected by strict parsers."],
    v: "Generate a million serials in a test and confirm zero duplicates, minimum length met and no discernible pattern; confirm two issuers started from the same image diverge.",
    dep: []
  },
  "tbs-assembly": {
    s: "Builds the exact certificate content to be signed from the profile, validated data, key, serial and dates, in strict canonical encoding.",
    d: "The builder takes only validated inputs, never raw request fields, and encodes each into the required binary structure with fixed rules for ordering, string types and lengths. The result is the to-be-signed portion, which is then lint-checked and signed. Subject, names, validity, issuer identity and extensions all come from separate trusted sources. Hard because binary encoding rules are strict and there are many ways to produce a valid-looking but incorrect structure.",
    k: ["Typed builder from validated structures vs templating strings: a typed builder prevents injection and wrong encodings; templates are easier to start with and easier to break.", "Rebuilding from stored data vs reusing the precertificate bytes: rebuilding is clean; reuse ensures the pair match exactly."],
    p: ["Building a name from untrusted text lets special characters inject extra fields into the subject.", "Locale-dependent formatting of dates produces certificates with invalid time encodings."],
    v: "Assemble certificates from hostile inputs including control characters and extremely long names, and confirm the output is either valid, or refused, and never contains injected fields.",
    dep: ["certificate-profiles", "serial-generation", "name-policy"]
  },
  "manual-approval": {
    s: "A human approval step for requests that automation cannot decide: high-risk names, unusual profiles and exceptions, with a second reviewer for sensitive cases.",
    d: "Requests flagged by screening or profile rules enter a queue with the evidence attached. Approvers with the right trusted role review it, record a decision with reasoning, and the orchestrator continues or refuses. Some profiles need two approvers. The queue has service levels and escalation. Hard because the approver is a social-engineering target, and because queues quietly encourage approving quickly, which means the interface must show the evidence rather than just a button.",
    k: ["Dual approval vs single: dual limits fraud and errors; single is faster and lets one coerced person cause misissuance.", "Approver sees evidence in line vs separate tools: in line improves review quality; separate tools reduce interface complexity."],
    p: ["A queue with a long backlog leads to approvals without reading the evidence.", "An approver with the right to both request and approve can approve their own request."],
    v: "Create a flagged request and try to approve it as the requester and as a single approver on a dual-approval profile; confirm both are refused until two distinct qualified approvers act.",
    dep: ["trusted-roles", "blocklist-screening"]
  },
  "issued-cert-db": {
    s: "The authoritative record of every certificate ever signed, with its serial, names, profile version, validation evidence, issuance time and revocation state.",
    d: "Each issued certificate is stored with the evidence that supported it and the exact bytes, indexed by serial, names and issuer. The revocation components read it to produce lists and responses; monitoring reads it to compare with logs; incident response queries it to find affected certificates. It is replicated and retained long after expiry. Hard because it must be complete: a certificate that exists but is missing from the database cannot be revoked or counted.",
    k: ["Write database record before signing vs after: before guarantees a record exists but may hold unsigned entries; after risks signed certificates with no record.", "Immutable append-only history vs updatable rows: append-only gives audit integrity; updatable rows are simpler for revocation state."],
    p: ["A restore from backup loses recently issued certificates, which are still valid in the world.", "Queries across hundreds of millions of rows time out in the middle of an incident."],
    v: "Compare the set of serials in public logs for the issuing key with the database, and confirm every logged certificate appears and every database row has a matching log entry or a documented reason.",
    dep: ["serial-generation"]
  },
  "chain-delivery": {
    s: "Delivers the signed certificate with the intermediate chain the client needs, in the right order and format, from stable locations.",
    d: "The certificate is returned to the requester with its issuing intermediates, ordered leaf first. Alternative chains may be offered for compatibility, for example one through a cross-signed root. The authority also hosts the intermediate certificates at the addresses embedded in each certificate, so clients can fetch missing ones. Hard because chain choice affects which clients work, and a chain bundle that changes under existing automation can silently break it.",
    k: ["Delivering the full chain vs leaf only: the full chain avoids fetching; leaf only gives smaller responses and relies on clients to locate issuers.", "Default chain shortest vs most compatible: shortest is faster; most compatible serves old clients but includes expiring cross-certificates."],
    p: ["Changing the default chain without notice breaks pinned or cached configurations.", "Wrong ordering in a bundle is accepted by some servers and clients and rejected by others."],
    v: "Download the bundle, verify ordering with a strict validator, then fetch each issuer address embedded in the certificate and confirm the response matches the bundle's intermediate.",
    dep: ["intermediate-ca", "cross-signing"]
  },
  "short-lived-certs": {
    s: "Certificates valid for days or less, so that expiry replaces revocation: no status checking is needed because a stolen key becomes useless quickly.",
    d: "A very short lifetime means a compromised key is usable for only a few days, so revocation infrastructure is unnecessary for these certificates and profiles may omit status locations. This depends on fully automated issuance and renewal at high volume, since renewals happen every day or every few days. The signing and validation systems must sustain that rate. Hard because every dependency on the issuance path becomes a production dependency for the subscriber's availability.",
    k: ["Short-lived with no revocation vs longer with revocation: short removes a whole infrastructure and its failure modes; it makes issuance availability critical to uptime.", "Pre-validated long authorizations vs validation per renewal: reuse supports high rates; fresh validation each time is stronger and costs capacity."],
    p: ["An authority outage of a day or two takes down every subscriber using the shortest lifetimes.", "Clients with clock skew reject certificates whose entire validity window is brief."],
    v: "Issue a certificate with a short lifetime, stop its renewals, and confirm it is rejected by clients after expiry without any revocation entry being published.",
    dep: ["validity-policy", "acme-server", "client-automation"]
  },
  "ct-submission": {
    s: "Sends precertificates and certificates to public logs, handling timeouts and failures, and collecting the signed receipts that prove each entry was accepted.",
    d: "The issuer submits to several logs in parallel over HTTPS and waits for signed promises of inclusion. A log may be slow, rate-limited, down or in a read-only state. The submission layer applies timeouts, retries and falls back to other logs. Receipts are verified before use. It sits directly in the issuance path, so log performance becomes issuance latency. Hard because logs are operated by others and their outages directly stall certificate issuance.",
    k: ["Parallel submission to many logs vs sequential: parallel is fast and tolerant of one failure; it multiplies load on logs and requires deciding which receipts to keep.", "Blocking issuance on logs vs issuing and logging later: blocking guarantees visibility; deferred logging keeps availability but breaks the guarantee."],
    p: ["A log that accepts submissions slowly makes all issuance slow.", "Submitting to logs that are about to be retired produces receipts that clients soon stop trusting."],
    v: "Submit a test precertificate, verify each returned receipt's signature with the log's public key, then query each log and confirm the entry appears within the promised merge delay.",
    dep: ["log-selection"]
  },
  "sct-embedding": {
    s: "Collects signed receipts from several logs and places them in the final certificate as a single extension, meeting each client's required number and diversity.",
    d: "After precertificate submission, the receipts are verified and ordered, then encoded into an extension of the final certificate. Policies require a minimum number from distinct operators, scaled by certificate lifetime, and sometimes at least one from a log of a particular kind. If too few arrive, the pipeline retries or picks other logs. The final certificate is signed only when the policy is satisfied. Hard because policies differ across clients and change over time.",
    k: ["Embedded receipts vs receipts at handshake: embedded works with every server unchanged; handshake delivery can add logs after issuance but needs server changes.", "Minimum receipts only vs extra for safety: minimum is cheap; extras survive a log being distrusted later."],
    p: ["Receipts from two logs run by the same operator satisfy a count but not a diversity rule.", "A log distrusted after issuance invalidates certificates that carried only its receipt."],
    v: "Parse issued certificates, extract the receipts, and check each against a client policy simulator for count, operator diversity and a valid signature.",
    dep: ["ct-submission", "log-selection"]
  },
  "log-selection": {
    s: "Chooses which logs each certificate goes to, based on operator diversity, log status, expected expiry range, capacity and past reliability.",
    d: "Logs are sharded by the expiry date of the certificates they accept and have lifecycles: pending, usable, read-only, retired. The selector uses the certificate's expiry to choose usable shards, ensures the receipts come from different operators, and prefers logs with good recent availability. It follows client program lists of qualified logs. Hard because the list changes, logs fail and are removed, and a mistake in selection leaves certificates with receipts that clients reject.",
    k: ["Static log list vs dynamic selection by health: static is predictable and easy to audit; dynamic maintains availability but adds failure modes.", "Own logs vs only third-party: own logs control performance; independence is lost if all receipts come from the authority's own operator."],
    p: ["Using a log that has just become read-only returns errors for a whole batch.", "Ignoring client program updates keeps submitting to logs that clients no longer trust."],
    v: "Compare the selector's active log set with each client program's current list and confirm every selected log is currently usable and covers the certificate's expiry date.",
    dep: []
  },
  "ct-monitoring": {
    s: "The authority watches public logs for certificates issued under its keys or for its customers' names, to find misissuance, shadow issuance and compromised issuing keys.",
    d: "A monitor reads log entries continuously, filters for the authority's issuer names and keys, and compares each entry with the internal database. Entries with no matching internal record signal key misuse or an unlogged issuing path. Customers can be notified of certificates for their names. Hard because logs are large and busy, the matching must be fast, and false matches from naming conventions or lookalikes require careful logic.",
    k: ["Monitoring only own issuer vs wider lookalike names: own-issuer is precise and cheap; wider monitoring finds fraud against customers but needs care to avoid noise.", "Real-time alerts vs daily reconciliation: real-time shortens detection windows; daily is simpler and catches slow issues."],
    p: ["A monitor that falls behind a busy log misses the window in which a rogue certificate could be revoked.", "Mismatch alerts that fire constantly teach the team to ignore the one that matters."],
    v: "Sign a test certificate through a path that skips the database and confirm the monitor raises an unmatched-issuance alert within the target time.",
    dep: ["issued-cert-db", "inclusion-proofs"]
  },
  "inclusion-proofs": {
    s: "Cryptographic proofs that a given certificate is in a log, and that the log has only appended since it last looked, used by auditors and, optionally, by clients.",
    d: "A log is a Merkle tree; a proof is the path of hashes from an entry to a signed root. Anyone can verify it without trusting the log operator. A consistency proof shows a newer tree contains the older. The authority and independent auditors fetch and check these, and gossip signed roots to detect a log presenting different views to different parties. Hard because verifying at scale needs storage and bandwidth, and client-side checking raises privacy concerns.",
    k: ["Authority audits its own receipts vs relies on others: self-audit directly protects the certificates; it needs infrastructure and does not catch split views alone.", "Client fetches proofs vs server delivers them: client fetch leaks which sites are visited; server delivery requires new server behavior."],
    p: ["Receipts verified but never checked for later inclusion allow a log to promise and not deliver.", "A proof checked against a root from the same log gives no protection against a split view."],
    v: "For a sample of recent certificates, fetch an inclusion proof from the log and recompute the root hash locally; confirm it equals the log's signed root.",
    dep: ["ct-submission"]
  },
  "revocation-intake": {
    s: "Receives revocation requests from subscribers, third parties and automated sources, verifies who is asking, and creates a revocation case with a deadline.",
    d: "Requests arrive through the portal, the protocol interface, a public reporting address and automated feeds. The subscriber can prove control with the certificate's key or the account. Others, such as researchers, submit evidence of compromise or misissuance which staff must verify. A case records the reason, evidence and deadline. Hard because revocation is a denial-of-service lever: forged requests would take down real sites, and the deadline clock starts when the request arrives, not when someone reads it.",
    k: ["Accept key-compromise proof from anyone vs only the subscriber: accepting proofs from anyone protects the public; it needs automatic verification to resist abuse.", "Automated revocation for proven cases vs manual: automated meets deadlines; manual allows judgment and misses time limits."],
    p: ["A request that sits unread over a weekend misses a revocation deadline.", "Weak identity checks on requests let an attacker revoke a competitor's certificates."],
    v: "Submit a revocation with a signature from the certificate's private key, and one from an unrelated key; confirm the first becomes a case with a deadline and the second is declined.",
    dep: ["reason-codes", "issued-cert-db"]
  },
  "reason-codes": {
    s: "The standard reasons attached to each revocation and the time limits the baseline rules set for acting on each, which differ by reason.",
    d: "Reasons include key compromise, affiliation change, superseded, cessation of operation and others; some are required to be used when specific conditions are met. Policy states how fast the authority must revoke for each: a day or so for compromise or misissuance, a few days for others. The reason is published in revocation data, and clients may treat reasons differently. Hard because it requires classifying real incidents consistently, and because a later reason change must not be allowed to hide that a key was compromised.",
    k: ["Strictly mapped reasons to deadlines vs staff discretion: mapping makes audits simple; discretion handles odd cases and invites inconsistency.", "Publishing the reason vs omitting it: publishing aids relying parties; omitted reasons hide detail but are permitted for some cases."],
    p: ["Choosing a mild reason to avoid a short deadline is a compliance failure when evidence shows compromise.", "Reason code changes after the fact lose the date the key was first known to be compromised."],
    v: "Open test cases for each reason and confirm each is assigned the deadline in policy, and that the published list carries the reason and a timestamp.",
    dep: ["revocation-intake"]
  },
  "crl-generation": {
    s: "Builds and signs lists of revoked certificate serials at regular intervals, with sequence numbers, validity windows and issuer identification.",
    d: "A job reads revocation state for each issuing key, builds a list of serial numbers with times and reasons, adds the number and next-update time, and signs it using the issuing key or a delegated one. Lists are published to fixed addresses. Entries for expired certificates may be dropped to keep size down. Hard part is size and freshness: lists for busy authorities reach hundreds of megabytes, and a list that is late or unreadable breaks clients that depend on it.",
    k: ["Frequent full lists vs deltas: full lists are simple and robust; deltas save bandwidth but need clients that can merge them.", "Removing expired entries vs keeping them: removing shrinks lists; keeping is simpler and never hides a past revocation."],
    p: ["A generation job that fails silently lets the previous list expire, after which clients reject every certificate.", "Lists signed with a key that is not authorized to sign them fail verification."],
    v: "Revoke a test certificate and confirm it appears in the next list with correct reason and time, the number increases, the signature verifies, and the next-update field is in the future.",
    dep: ["issued-cert-db", "signing-service", "crl-sharding"]
  },
  "crl-sharding": {
    s: "Splits one issuer's revocation data into many smaller lists, each covering a fixed slice of certificates, so clients download only what they need.",
    d: "Certificates are assigned to a partition when issued, by serial range, time or a hash, and the partition address is written into the certificate. Each partition is a separate signed list with a pointer to the others. Clients fetch the one list relevant to a certificate. Partitions must stay balanced, and the assignment cannot change after issuance. Hard because the partition layout is frozen into issued certificates, so a bad choice persists for the full lifetime of those certificates.",
    k: ["Many small partitions vs few large: small lists are fast to fetch; many partitions raise the number of publication jobs and files to track.", "Partition by time vs by hash: time makes expiry cleanup easy; hash balances size evenly."],
    p: ["An unbalanced layout produces a few lists that are still huge.", "Partition counts fixed in certificates cannot be changed without reissuing everything."],
    v: "Issue certificates, confirm the partition address in each resolves, and that the union of all partitions equals the full set of revoked serials for the issuer.",
    dep: ["issued-cert-db"]
  },
  "ocsp-responder": {
    s: "A service that answers whether a specific certificate is good, revoked or unknown, with a signed response that clients can verify.",
    d: "Clients send a request identifying the certificate by issuer hash and serial. The responder looks up the state, builds a signed response with a validity window, and returns it over HTTP. Responses can be generated on demand or served from a pre-signed set. It must answer unknown for serials never issued, rather than good, to avoid certifying forged serials. Hard because it receives traffic from every client for every connection, and downtime is directly visible to users.",
    k: ["Answer from live data vs from pre-signed responses: live data is current; pre-signed is fast and keeps keys off the serving tier.", "Reporting never-issued serials as unknown vs good: unknown is correct; good would be convenient and would endorse forgeries."],
    p: ["Responding good for any serial that is not on the list lets an attacker with a stolen key get a forged one approved.", "A cache serving expired responses makes clients fail hard or ignore the answer."],
    v: "Query for a valid serial, a revoked serial and one never issued; confirm answers of good, revoked and unknown, each signed and with a current validity window.",
    dep: ["issued-cert-db", "ocsp-presigning", "delegated-responder-keys"]
  },
  "ocsp-presigning": {
    s: "Responses are signed in batches ahead of time and stored, so the serving tier needs no signing key and can handle large request volumes cheaply.",
    d: "A background job signs a good response for every active certificate on a rolling schedule, and signs revoked responses immediately when revocation happens. Responses go to storage and the distribution cache. The serving tier only returns stored bytes. The batch must keep up with issuance and renewal, regenerating well before each response expires. Hard because millions of signatures per cycle consume hardware capacity, and revocation must propagate within a time limit even though cached good responses are still valid.",
    k: ["Pre-signing everything vs signing on demand: pre-signing scales and isolates keys; on-demand is simpler and needs a key near the internet.", "Long response validity vs short: long reduces signing load and cache churn; short narrows the time a revoked certificate may appear good."],
    p: ["A revoked certificate with a cached good response keeps passing checks until that response expires.", "A job that stops silently leaves responses to expire, causing outages for stapling servers."],
    v: "Revoke a certificate and measure the time until every serving node returns the revoked response; confirm it is under the published limit.",
    dep: ["signing-service", "delegated-responder-keys", "issued-cert-db"]
  },
  "status-cdn": {
    s: "A caching layer that distributes revocation lists and status responses worldwide, absorbing client traffic without touching the authority's core systems.",
    d: "Lists, intermediate certificates and responses are published as static objects at stable addresses and served by a cache network with long edge capacity. Cache lifetime must be shorter than object validity, and purge or short lifetimes handle urgent revocation. Request logs feed monitoring. Hard because this is the part of the authority every client touches, so it must withstand traffic spikes, such as a revocation event that makes millions of clients fetch a new list at once.",
    k: ["Third-party distribution network vs own servers: third-party offers scale and locations; own servers keep control and cost more to build for peaks.", "Longer cache time vs fresh objects: longer improves hit rates and resilience; shorter propagates revocation faster."],
    p: ["A cache holding an expired list for hours causes clients to reject certificates that are in fact fine.", "Origin overwhelmed after a cache purge because every edge refetches at once."],
    v: "Publish a new list and measure the time until edges in several regions serve it, then take the origin offline and confirm the edges continue to serve until objects expire.",
    dep: ["crl-generation", "ocsp-presigning"]
  },
  "mass-revocation": {
    s: "The procedure and tooling for revoking very large numbers of certificates quickly, for example after a validation bug, and for coping with the resulting renewal wave.",
    d: "After a finding, queries identify every affected certificate, a bulk operation revokes them within the deadline, and lists and responses are regenerated. Customers are notified and urged to renew; the issuance system sees a sharp rise in requests. Plans include temporary capacity, prioritized queues and coordination with relying parties. Hard because deadlines of a day or so are not negotiable even when revoking will break many sites, and many customers have no automation to replace certificates.",
    k: ["Revoke on time even when it causes outages vs delay for customer safety: on-time follows the rules and preserves trust; delay protects customers and risks removal.", "Pre-built bulk tooling vs ad hoc scripts: tooling is tested and quick; ad hoc scripts are written under pressure and make errors."],
    p: ["A renewal wave hitting rate limits stops customers from replacing revoked certificates.", "A bulk revocation query that is slightly wrong revokes certificates that were fine."],
    v: "In a rehearsal, revoke a hundred thousand test certificates and measure time to updated lists and responses, and the issuance system's ability to replace them in the allowed window.",
    dep: ["issued-cert-db", "crl-generation", "ocsp-presigning", "rate-limits"]
  },
});
