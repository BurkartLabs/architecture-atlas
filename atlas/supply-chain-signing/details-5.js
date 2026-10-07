// Details for the supply-chain signing plate, part 5: key management, trust roots, revocation, cross-cutting concerns.
ATLAS.details("supply-chain-signing", {
  "signer-key-generation": {
    s: "Creating a signing key pair with enough entropy, in the place and form where the private key will live, so it never exists unprotected elsewhere.",
    d: "A key is generated inside the hardware module or key service that will hold it, so the private part never leaves. The algorithm and size follow current guidance, and the public key is exported and registered with its owner, purpose and validity. Generation on an ordinary laptop, then copied into a vault, leaves copies behind. The difficulty is provenance of the key itself: a verifier trusting a public key is trusting that someone generated and guarded the private key properly, and nothing in the key proves that.",
    k: ["Generate inside the protected module versus import: inside means the key was never exposed and cannot be backed up, importing allows backup and requires a trusted generation step.", "Modern elliptic-curve versus older large-integer algorithms: elliptic-curve keys are small and fast, older ones have wider legacy support."],
    p: ["Keys generated on an unmanaged machine and then moved leave copies in backups and shell history.", "Weak random sources at generation time yield keys that can be reconstructed."],
    v: "Generate a key in the module, attempt to export the private part and confirm the module refuses. Check that the registered public key matches the one the module reports and its attributes mark it non-exportable.",
    dep: ["hardware-key-protection"]
  },
  "hardware-key-protection": {
    s: "Holding private signing keys in tamper-resistant hardware that performs signing internally and never reveals the key.",
    d: "Hardware modules accept data, return signatures and enforce access control, so malware on the host can request signatures while present but cannot copy the key. Forms include network appliances, cloud-hosted modules and small personal tokens. Operations are logged by the module. Protection is against theft, not misuse: whoever can call the module can sign. The difficulty is operational: availability, backup of key material by wrapping to other modules, firmware updates and the cost of scaling signing throughput.",
    k: ["Dedicated modules versus cloud-managed key services: dedicated gives exclusive control and operations work, managed gives scale and trust in the provider.", "Presence-required operations versus automated use: requiring a person touch gives strong control for rare signings and cannot work in pipelines."],
    p: ["Protecting the key but leaving the signing interface open to every pipeline job turns theft into authorized misuse.", "No backup of the wrapped key means a failed module destroys the ability to sign."],
    v: "Attempt key extraction through the module's interface and confirm it fails. Run a signing request from an unauthorized account and confirm it is refused and logged by the module.",
    dep: ["signer-key-generation"]
  },
  "managed-key-service": {
    s: "A hosted or internal service that stores keys, performs signing on request and enforces who may use each key, with an audit trail of every operation.",
    d: "Callers authenticate with their identity, and the service checks a policy that says which identities may use which key for which operation. It signs inside protected hardware and returns the signature. Keys are versioned, rotated and disabled centrally. It lets pipelines sign without holding keys. The difficulty is that the service concentrates risk: a broad access policy gives many callers the power to sign anything, and the audit log is only valuable when someone reads it.",
    k: ["Remote signing versus local keys: remote keeps keys out of jobs and adds a network dependency, local is fast and exposes the key to the job.", "One key per project versus a shared team key: per project limits damage and increases management, shared is easy and makes one compromise broad."],
    p: ["An access policy that lets any pipeline use the production key makes the key's protection moot.", "Signing requests that pass only a hash let a caller sign data without the service knowing what it covers."],
    v: "Request a signature as a build identity not on the key's policy. It is refused and the denial appears in the audit log. Request it as the release workflow and confirm the signature verifies against the registered public key.",
    dep: ["hardware-key-protection","signing-access-control","signing-audit-trail"]
  },
  "signer-key-ceremony": {
    s: "A scripted, witnessed procedure for generating and activating an important signing key, with recorded evidence that it was done correctly.",
    d: "Participants follow a written script in a controlled room: verified hardware, multiple witnesses, recorded steps, key generation inside the module, backups sealed to custodians and a signed record of the outcome. The goal is to show later that the key was never exposed. It is used for keys whose compromise would be hard to recover from. The difficulty is cost and rarity: ceremonies happen infrequently, scripts go stale and participants are unfamiliar, so rehearsal and review matter.",
    k: ["Full ceremony versus lightweight automated generation: ceremony gives strong evidence for rare, high-value keys and is expensive, automation scales to many keys and offers weaker proof.", "Many witnesses versus few: many give independent assurance and are harder to schedule."],
    p: ["A script not rehearsed fails midway, and improvisation leaves gaps in the record.", "Custodians of backup shares leaving the organization without handover make recovery impossible."],
    v: "Review the ceremony record: signed script, witness attestations, hardware serial numbers and the public key. Confirm the key in service matches the one in the record and no other copy of the private key exists.",
    dep: ["signer-key-generation","threshold-key-sharing"]
  },
  "threshold-key-sharing": {
    s: "Splitting control of a key among several holders so that a set number must cooperate to use or recover it, and fewer cannot.",
    d: "A secret is divided into shares, any threshold of which can reconstruct it or jointly produce a signature, while fewer reveal nothing. Shares live with different people or on different devices. Used for root keys and recovery. In signing schemes, parties produce partial signatures without ever combining the key. It protects against a single lost or corrupt holder. The difficulty is coordination: holders must be reachable, shares need secure storage and rehearsal, and reconstructing a key in one place recreates the single point of exposure.",
    k: ["Reconstruct the key versus signing jointly without reconstruction: reconstruction is simple and exposes the key at the moment of use, joint signing never exposes it and needs protocol support.", "Higher threshold versus lower: higher resists collusion and risks being unable to gather enough holders."],
    p: ["Shares kept together in one safe provide no threshold in practice.", "Holders who never test their shares discover them unreadable only during an emergency."],
    v: "Run a recovery drill with the threshold number of holders and confirm a test signature verifies. Repeat with one fewer holder and confirm it cannot be produced.",
    dep: ["signer-key-generation","hardware-key-protection"]
  },
  "key-rotation": {
    s: "Replacing signing keys on a schedule or after an event, with overlap so verifiers learn the new key before the old one stops being used.",
    d: "A new key is generated, its public part is published through the trust distribution channel and added to policy, then signing switches to it and the old key is retired after verifiers have updated. Overlap prevents a window in which signatures are rejected. Rotation limits the exposure of any one key and exercises the recovery process. Short-lived certificates make rotation continuous. The difficulty is verifier lag: verifiers that do not update stop accepting new signatures, and ones that never remove the old key keep trusting it.",
    k: ["Scheduled rotation versus on-demand only: scheduled rotation keeps the process practiced and creates regular disruption, on-demand is quiet until the day it must work.", "Long overlap versus short: long overlap tolerates slow verifiers and leaves the old key trusted longer."],
    p: ["Verifiers that cache the key list for months reject new signatures after rotation.", "Retiring a key without removing it from trust lists leaves it usable by anyone who stole it."],
    v: "Rotate a test key. Confirm artifacts signed with the new key verify on every verifier within the overlap window, and after retirement artifacts signed with the old key are rejected.",
    dep: ["trust-root-update","trusted-signer-allowlist","signer-key-generation"]
  },
  "signing-access-control": {
    s: "Rules deciding which people, workflows and services may request signatures with each key, evaluated at signing time and kept as narrow as the release process allows.",
    d: "Each key or signing identity has a policy: eligible callers, allowed artifact namespaces, required approvals and time windows. The policy is evaluated by the key service or by the issuing authority's identity mapping. Production keys are limited to the release workflow on protected branches. Changes to the policy are reviewed like code. Access control is the real protection, because anyone allowed to ask can obtain a signature. The difficulty is drift: access granted for a project accumulates, and nobody notices a service account that no longer needs it.",
    k: ["Per-workflow grants versus per-team grants: per-workflow contains a compromise to one pipeline and needs more grants, per-team is simple and lets any team job sign.", "Require an approval at signing time versus rely on branch protection upstream: signing-time approval is a second gate and delays automated releases, upstream-only is faster and trusts earlier controls."],
    p: ["Broad grants made for a deadline stay in place and let unrelated jobs sign production artifacts.", "Service accounts shared among pipelines make it impossible to tell which one requested a signature."],
    v: "List every identity able to sign with the production key, and for each confirm a current owner and a reason. Attempt signing from an identity absent from the list and confirm it is denied and logged.",
    dep: ["managed-key-service","identity-matching-rules"]
  },
  "signing-audit-trail": {
    s: "An append-only record of every signing request, with caller, key, digest and outcome, held where the callers and signers cannot alter it.",
    d: "Key services, issuing authorities and signing clients emit structured events for each request: who asked, which key or identity, the digest, the approval used and the result. Events go to a separate store with its own access control, possibly the public transparency log for certificates. The trail supports incident response: which artifacts did this key sign, and from where. The difficulty is separation and review: logs written by the system being audited can be edited by its administrators, and logs nobody reads detect nothing.",
    k: ["Internal append-only store versus the public log: internal keeps details private and trusts the operator, the public log is independently auditable and exposes metadata.", "Log requests versus log only successes: logging requests records attempts that failed and suggest an attack, successes-only is smaller and hides probing."],
    p: ["Administrators of the signing service also administering the log can erase their own activity.", "Logs lacking the digest cannot answer which artifacts a compromised key signed."],
    v: "Sign three artifacts and then query the trail for the key. All three requests appear with caller and digest. Try to delete one record with signing-service credentials and confirm it is refused.",
    dep: ["managed-key-service","transparency-log"]
  },
  "root-of-trust-ceremony": {
    s: "The rare, witnessed procedure that creates the root keys every verifier ultimately trusts, and signs the first delegations from them.",
    d: "Root keys are generated offline in hardware, with multiple custodians, a recorded script and independent witnesses. The ceremony signs the initial trust metadata that lists the keys allowed to sign each role. Root keys are then stored offline and used only for rotation of lower keys. The record lets outsiders audit that the process was followed. The difficulty is that a root is almost impossible to replace once embedded in verifiers, so mistakes made here persist for years, and rehearsal and independent review matter more than anywhere else.",
    k: ["Offline root with online delegated keys versus an online root: an offline root is far harder to steal and slow to use, an online root is convenient and the biggest possible target.", "Several root keys with a threshold versus one: a threshold survives loss and compromise of some keys and needs multiple custodians."],
    p: ["A root key backed up carelessly during the ceremony exists in a copy nobody tracks.", "Embedding the root in verifiers before reviewing the ceremony record bakes in an unaudited foundation."],
    v: "Check the ceremony transcript against the root metadata: the keys listed are exactly those generated, the threshold matches the plan, and each custodian can independently confirm their key fingerprint from a separate channel.",
    dep: ["threshold-key-sharing","hardware-key-protection","signer-key-ceremony"]
  },
  "trust-root-distribution": {
    s: "How verifiers first obtain the trust roots they depend on: built in, shipped with the tooling or fetched through a channel secured by something already trusted.",
    d: "A verifier needs at least one authentic starting key. Options include embedding the root in the verifier software, distributing it with the operating system image or configuration management, or fetching it over a secured channel and checking against a fingerprint obtained out of band. After the initial root, updates arrive signed by the root itself. The difficulty is the first step: if an attacker can swap the initial root, every later check is theirs, so the starting point needs the best protection of any file.",
    k: ["Root embedded in the verifier versus fetched at install: embedded ties trust to the software's own integrity and updates with it, fetched is flexible and relies on the fetch channel.", "One root for all verifiers versus per-organization roots: one shared root simplifies public use, per-organization gives independence and makes mixing artifacts across organizations harder."],
    p: ["Fetching the root over an unauthenticated channel on first use lets an attacker on the network supply their own.", "Verifier images built long ago carry roots that have been rotated out upstream."],
    v: "On a fresh verifier image, compare the installed root fingerprint to the value published in the ceremony record and in a separately obtained copy. All three agree, and the image build log shows where the root came from.",
    dep: ["root-of-trust-ceremony"]
  },
  "trust-root-update": {
    s: "The signed process by which verifiers replace expired or compromised roots and delegated keys without a manual reinstall.",
    d: "New root metadata is signed by enough of the current root keys, and each verifier checks that the new version is signed by the old one before adopting it. Chains of updates let a verifier that was offline catch up one version at a time. Expiry dates force periodic renewal, which proves the signers are still reachable. The difficulty is a total loss: if the threshold of keys is lost or compromised, verifiers cannot be moved automatically and need an out-of-band reset, which is slow.",
    k: ["Verifier walks every intermediate version versus jumping to the latest: walking each version proves a continuous chain and takes more fetches, jumping is quick and trusts the latest root alone.", "Short root expiry versus long: short forces regular practice and risks lapses, long is low-maintenance and keeps a stolen root useful longer."],
    p: ["A root that lapses because nobody renewed it halts verification across an organization.", "Verifiers that accept any newer root without checking the signature by the previous one accept a hostile replacement."],
    v: "Publish a new root version signed by the old one and confirm verifiers adopt it. Publish a version not signed by the old root and confirm every verifier rejects it and keeps the previous one.",
    dep: ["trust-root-distribution","delegated-metadata","rollback-protection"]
  },
  "delegated-metadata": {
    s: "Signed metadata in which a root delegates limited signing authority to other keys for specific roles or artifact paths, each with its own threshold.",
    d: "The root signs a statement listing which keys may sign targets, snapshots and timestamps, and for which names. Lower roles sign more often with online keys. Compromising a delegated key gives access only to the names it was delegated, and the root can revoke it. Verifiers walk the delegation chain from root to the signer of the target. The difficulty is delegation structure: too flat and a single key controls everything, too deep and verification and key management become hard to reason about.",
    k: ["Many narrow delegations versus few broad ones: narrow delegations contain compromise and require much more key administration, broad ones are simple and powerful.", "Online delegated keys versus offline: online keys sign frequently and are exposed, offline are protected and cannot sign on every release."],
    p: ["A delegation covering every path makes the delegated key as powerful as the root.", "Delegated keys left in place after a team disbands remain valid signers indefinitely."],
    v: "Attempt to sign a target outside a delegated key's path scope. Verification rejects it because the delegation does not cover that path, and the same key signing inside its scope passes.",
    dep: ["root-of-trust-ceremony","trusted-signer-allowlist"]
  },
  "rollback-protection": {
    s: "Preventing an attacker from serving older, legitimately signed metadata or artifacts to make a verifier accept known vulnerable or revoked content.",
    d: "Metadata carries version numbers that only increase, and verifiers remember the highest version seen per role and refuse anything lower. The same idea applies to artifacts: a minimum acceptable version, or a signed index of current versions. A signed old release remains a valid signature, so signature checks alone cannot stop a downgrade. The difficulty is state: verifiers must persist what they last saw, a new or reset verifier has no history, and legitimate emergency rollbacks need a signed path.",
    k: ["Verifier remembers last seen version versus stateless checks: remembered state defeats replays and has to survive restarts and be shared across replicas, stateless is simple and open to downgrade.", "Hard no-rollback rule versus signed rollback permission: a hard rule is safest, and a signed rollback path handles bad releases without disabling the check."],
    p: ["Ephemeral verifier containers that start with no history accept any old signed metadata.", "Signatures that include no version or time allow an old valid artifact to be re-served indefinitely."],
    v: "Serve a verifier the previous version of signed metadata after it has seen the current version. It rejects the older version with a rollback error and continues to use the current one.",
    dep: ["delegated-metadata","freshness-and-expiry-checks"]
  },
  "freeze-attack-protection": {
    s: "Detecting that a verifier is being fed stale but unexpired data, such as an old snapshot of what is current, by requiring frequent short-lived signed timestamps.",
    d: "A timestamp role signs a small file every few minutes or hours containing the hash of the current metadata snapshot, with a short expiry. A verifier that cannot get a fresh, valid timestamp knows it may be frozen on old data and stops trusting its view of current versions. This keeps an attacker from hiding a new security release by replaying old data. The difficulty is availability: the timestamp signer must be online and highly reliable, and verifiers must decide what to do when freshness cannot be established.",
    k: ["Short timestamp lifetime versus long: short detects freezes within minutes and makes the signer a critical service, long tolerates outages and lengthens the hiding window.", "Fail when stale versus warn: failing protects and blocks installs during outages, warning keeps work moving and can be ignored."],
    p: ["A timestamp key held online and unprotected becomes the easiest key to steal and replay.", "Verifiers that ignore the expiry field treat an old timestamp as current forever."],
    v: "Block a verifier from the metadata server beyond the timestamp lifetime. It reports that freshness cannot be established and refuses to treat its stored view as current, then recovers once connectivity returns.",
    dep: ["delegated-metadata","freshness-and-expiry-checks"]
  },
  "log-and-issuer-key-pinning": {
    s: "Configuring verifiers with the specific public keys of the transparency log and issuing authority they accept, with a dated history of valid keys.",
    d: "Verifiers hold the issuing authority's certificates and the log's public keys with their validity periods, delivered as part of the trust roots. When the log or issuer rotates a key, the new key arrives through the update process. Keeping old keys with validity ranges lets verifiers check old signatures made when those keys were valid. The difficulty is choosing which to trust: a verifier that accepts any log or issuer will accept a malicious one, and one that pins too tightly breaks when the operator rotates keys.",
    k: ["Pin specific keys versus pin the operator's domain: keys are exact and need update distribution, domain-based trust is flexible and depends on web infrastructure.", "Keep historical keys with validity ranges versus only the current key: history verifies old signatures, current-only is simpler and invalidates earlier evidence."],
    p: ["Dropping an old log key breaks verification of all signatures logged while it was current.", "Accepting any log signed by any key lets an attacker run their own log and produce inclusion proofs."],
    v: "Verify an old signature made under a rotated log key and a new one under the current key. Both pass. Present a proof signed by an unlisted log key and confirm it is rejected.",
    dep: ["trust-root-distribution","trust-root-update"]
  },
  "signature-revocation": {
    s: "Marking specific signatures or signed artifacts as no longer acceptable, even though they remain cryptographically valid, and getting verifiers to honor that.",
    d: "A signature stays mathematically valid forever, so withdrawing trust needs a separate signal. Options include a deny list of digests, a signed statement that supersedes the earlier one, or removal of the signer's authorization from policy. Verifiers check the signal on each verification or at refresh. Reasons include a vulnerability, a malicious release or a mistake. The difficulty is propagation speed and scope: revoking one digest is precise and slow to repeat across thousands, revoking a signer is broad, and offline verifiers learn nothing until their next refresh.",
    k: ["Revoke by digest versus by signer: digest revocation is precise, signer revocation is fast for incidents and invalidates everything that signer produced.", "Verifier checks a list on every verification versus on refresh: every check is current and a dependency, refresh-based is fast and leaves a window."],
    p: ["A revoked artifact already deployed keeps running because enforcement only applies at admission.", "Revocation lists that grow without pruning become too large for small verifiers to hold."],
    v: "Revoke one released digest and measure time until every verifier rejects it. Confirm that other digests from the same signer still verify and that the revocation entry appears in the audit record.",
    dep: ["deny-list-distribution","verification-policy"]
  },
  "certificate-revocation-handling": {
    s: "How verifiers deal with certificates that should no longer be trusted, noting that short-lived signing certificates usually need none while issuing authority certificates do.",
    d: "For signing certificates valid for minutes, expiry replaces revocation: a compromise window is the lifetime. For longer-lived certificates and for the issuing authority's own certificates, revocation lists or online status checks apply, and verifiers choose how to behave when status cannot be obtained. For an issuing authority compromise, trust roots are updated to remove it, and the transparency log helps determine which certificates were issued. The difficulty is soft-fail behavior: status checks that pass on timeout provide no protection against an attacker who blocks them.",
    k: ["Rely on short lifetimes versus run revocation checks: short lifetimes need no checks for signers and nothing helps after a compromise within the window, revocation covers longer-lived certificates at a cost.", "Hard-fail versus soft-fail on unreachable status: hard-fail is safe and breaks during outages, soft-fail keeps working and is bypassed by blocking the request."],
    p: ["A soft-failing check that the attacker can block offers no protection.", "Issuing authority revocation that is not distributed through trust root updates never reaches offline verifiers."],
    v: "Revoke a test intermediate certificate and confirm verifiers reject signatures chained to it after the next update, and that a status service outage causes the configured fail behavior.",
    dep: ["short-lived-signing-certificate","issuing-authority","trust-root-update"]
  },
  "key-compromise-response": {
    s: "The rehearsed plan for when a signing key or identity is stolen: contain, revoke, find what it signed, rotate and tell consumers.",
    d: "Steps are: disable the key or identity, publish revocation, query the log and audit trail for everything it signed since the earliest possible compromise, check those artifacts, rebuild and re-sign clean ones with a new key, rotate trust and notify downstream users with specific digests. A runbook assigns roles and decision rights. Speed matters because every minute more malicious artifacts can be signed. The difficulty is establishing the start time of the compromise, and rehearsal, since real incidents expose gaps in tooling and contact lists.",
    k: ["Assume earliest plausible time versus evidence-based window: assuming earliest is safe and forces large rebuilds, evidence-based is cheaper and risks missing early activity.", "Revoke immediately versus investigate first: immediate revocation cuts exposure and may disrupt production, investigating first preserves evidence and lets abuse continue."],
    p: ["No inventory of what the key signed turns recovery into guessing.", "Rotating the key without removing the old from trust leaves the thief able to continue signing."],
    v: "Run a drill: declare a test key compromised. Measure time to revoke, to produce the list of signed artifacts from the log and audit trail, and to ship a clean rebuild, and compare each to its target.",
    dep: ["signature-revocation","retroactive-impact-search","key-rotation","signing-audit-trail"]
  },
  "deny-list-distribution": {
    s: "Delivering signed lists of revoked digests, signers and certificates to every verifier quickly and verifiably, including those with intermittent connectivity.",
    d: "The list is itself signed and versioned, with a short expiry so verifiers know it is fresh. Verifiers poll or are pushed updates, apply them atomically, and report the version they hold. Compact encodings keep it small. Verifiers check the list during every decision and evict cache entries it affects. Offline sites receive it with each transfer. The difficulty is the tradeoff between propagation speed and load, and what to do when a verifier has an out-of-date list: continue, warn or refuse.",
    k: ["Push versus poll: push is fast for emergencies and needs a reliable channel, poll is simple and bounded by the polling interval.", "Whole list versus incremental diffs: the whole list is simple and large, diffs are small and complicate recovery from missed updates."],
    p: ["Verifiers that silently keep an expired list continue approving what was just revoked.", "Unsigned deny lists let an attacker remove entries or deny legitimate software."],
    v: "Add an entry and track the version each verifier reports. All reach the new version within the target interval, and a verifier cut off past the list's expiry follows its configured stale-list behavior.",
    dep: ["policy-distribution","signature-verification-cache"]
  },
  "retroactive-impact-search": {
    s: "Finding every artifact, deployment and downstream consumer affected by a compromised key, identity, builder or dependency, after the fact.",
    d: "The search joins signing records, log entries, provenance, bills of materials and deployment inventory. Questions: what did this identity sign in this window, which builds used this compromised input, where is each digest running now. Results drive revocation, rebuilds and notices. It depends on having kept the data: provenance and bills stored by digest, verification records retained and a current inventory of what runs where. The difficulty is data completeness and speed, and the answer is only as good as the records kept before the incident.",
    k: ["Keep detailed records for long periods versus minimal: detailed records make impact quick to find and cost storage and privacy exposure, minimal records make incidents slow and uncertain.", "Central index versus federated queries: a central index answers fast and is another sensitive store, federation leaves data with owners and is slow and uneven."],
    p: ["Records retained for thirty days cannot answer a compromise discovered after six months.", "Inventory that lists images but not digests cannot tell which exact build is running."],
    v: "Pick a past build input and ask which production deployments consumed it. Compare the answer with a manual trace through three sample deployments and confirm all three are in the result with their owners.",
    dep: ["sbom-ingestion-and-diff","verification-result-record","build-input-capture"]
  },
  "signer-identity-recovery": {
    s: "Restoring a legitimate signer after loss or takeover of its identity, with a controlled process that proves it is the real owner and invalidates the old one.",
    d: "When a maintainer account is taken over, a signing key is lost or a repository is transferred, the signer's trust must move to a new identity without opening a route for impostors. Steps include verifying the owner through independent channels, issuing new keys or identity bindings, updating policies and publishing a signed notice that supersedes the old identity. Consumers pin the new identity. The difficulty is that recovery is an attack surface: an attacker claiming to be the real owner will use the same process.",
    k: ["Strict multi-party verification versus quick recovery: strict resists impostors and takes days, quick restores service and is the easiest social engineering target.", "Continuity by a key signed by the old identity versus a fresh start: continuity proves the same owner and cannot work when the old key is lost or stolen."],
    p: ["A recovery process that relies on email alone lets anyone controlling the mailbox take over the signer.", "Old identity left trusted in downstream policies after recovery keeps the stolen identity valid."],
    v: "Run a recovery for a test signer: the new identity is accepted by policy after documented checks, the old identity is rejected on every verifier, and the transfer notice is published with a signature chain consumers can check.",
    dep: ["key-compromise-response","trusted-signer-allowlist","policy-distribution"]
  },
  "threat-model-and-trust-boundaries": {
    s: "The explicit list of what attackers can do, what each component is trusted to do, and which compromises the system is designed to survive.",
    d: "A threat model for signing names the attackers: a compromised dependency, a stolen developer account, a malicious insider, a hostile registry, a compromised builder or issuing authority. For each component it states what it is trusted for and what happens if it fails. Boundaries are drawn where trust changes, for example between build steps and the signer. It decides which controls matter. The difficulty is honesty: a signature protects against tampering after signing and says nothing about what was signed, so claims must not exceed what the checks can show.",
    k: ["Assume the builder is trustworthy versus assume it can be compromised: trusting it is simpler and makes it the single point of failure, assuming compromise adds independent verification and cost.", "Narrow stated guarantees versus broad promises: narrow guarantees are accurate and sound unambitious, broad ones sell well and mislead users."],
    p: ["Treating a valid signature as a statement that software is safe confuses authenticity with quality.", "A model written at design time and never updated misses new components added since."],
    v: "Pick three attacks from the model, such as a stolen maintainer account, and walk each through the real system with a test. For each, confirm the documented control stops or detects it, and record the test result.",
    dep: []
  },
  "identity-versus-key-trust": {
    s: "The choice between trusting specific long-lived keys and trusting identities that are checked each time and bound to short-lived keys.",
    d: "Key trust lists public keys: simple to verify, and each key must be protected, rotated and revoked. Identity trust lists who may sign, such as a workflow, and relies on an identity provider and issuing authority to bind keys to those identities briefly. The latter removes key storage, adds dependencies and shifts risk to identity provider configuration. Most organizations mix them: keys for roots and offline needs, identities for pipelines. The decision affects revocation, offline operation, logging requirements and what an attacker must steal.",
    k: ["Key trust versus identity trust: keys work offline and shift risk to storage, identities remove key custody and add online dependencies and rely on logs.", "One model everywhere versus a mix: one model is easier to reason about and fits some cases badly, a mix fits each case and doubles the verification logic."],
    p: ["Choosing identity trust without monitoring the log gives up key custody and gains no replacement detection.", "Mixing models without a clear mapping leaves policies where a weak path satisfies a requirement meant for a strong one."],
    v: "For each artifact class, state the model in use and demonstrate its failure scenario: steal a key and show detection or limits under key trust, and compromise a workflow under identity trust. Confirm both are covered by documented controls.",
    dep: ["identity-matching-rules","trusted-signer-allowlist"]
  },
  "fail-open-versus-fail-closed": {
    s: "What the system does when verification cannot complete, because a log, registry or service is unreachable, or evidence is missing: allow the artifact or block it.",
    d: "Every check can fail for reasons unrelated to attack: timeouts, outages, new artifacts with no signature yet. Failing closed blocks deployment and stops an attacker who induces failure, and it turns a verifier outage into a production outage. Failing open keeps availability and hands attackers a way to disable checks by blocking them. Most systems decide per environment and per check, with explicit timeouts, caches and break-glass paths. The decision should be written down and tested, not discovered during an incident.",
    k: ["Closed in production and open in development versus closed everywhere: split behavior is practical and means development does not exercise the production failure path.", "Cache last good verdicts versus hard dependency: caches keep working through outages and delay revocation, hard dependency is fresh and fragile."],
    p: ["A verifier that treats a timeout as success is disabled by anyone who can drop packets.", "Fail-closed with no override leaves operators unable to deploy the fix during the very outage that caused the failure."],
    v: "Block each dependency in turn in a test environment, including the log, registry and policy store. Confirm each produces the documented outcome, and that a malicious unsigned artifact is not admitted in any case configured as closed.",
    dep: ["admission-controller","signature-verification-cache","break-glass-override"]
  },
  "offline-and-air-gapped-operation": {
    s: "Designing so that verification, signing and trust updates can run without network access, for isolated sites and for resilience when services are unavailable.",
    d: "Offline operation needs evidence that travels with the artifact: bundles with signatures, certificates and log proofs, plus locally held trust roots and deny lists. It changes what freshness means, because the verifier cannot learn of revocation until the next transfer. Signing offline needs local keys and hardware, and its timestamps must come from a local source. The decision affects format choice, log usage and update cadence everywhere. The difficulty is staleness: the longer an isolated site goes without updates, the more its trust decisions rest on old information.",
    k: ["Self-contained evidence versus online lookups: self-contained works anywhere and ages, online is fresh and requires connectivity.", "Strict refresh deadlines for isolated sites versus indefinite trust: deadlines bound staleness and cause failures when transfers slip, indefinite trust never breaks and drifts."],
    p: ["Isolated sites that miss refreshes keep running with trust roots that were rotated out months ago.", "Signing offline with keys outside the audited process creates signatures nobody else can account for."],
    v: "Cut a test site off for the maximum allowed period. It verifies artifacts with its bundled evidence, refuses material past the staleness limit, and recovers after an import of fresh roots and deny lists.",
    dep: ["offline-verification-bundle","air-gapped-transfer","trust-root-update"]
  },
  "adoption-and-rollout-strategy": {
    s: "How an organization moves from unsigned software to enforced verification without breaking deployments: scope, order, exemptions, ownership and deadlines.",
    d: "A typical path is to inventory what is built and run, sign new releases, generate provenance, observe in audit mode, then enforce for the most critical environments first. Teams get tooling that makes the right path the default, such as signing built into the pipeline template. Exemptions are tracked with owners and expiry. Metrics show coverage by artifact and by environment. The difficulty is the long middle: coverage rises from sixty to ninety percent and stalls on awkward cases, and the remainder is where attackers look.",
    k: ["Enforce on critical systems first versus broad coverage first: critical-first protects what matters most early, broad-first builds habits and leaves key systems exposed longer.", "Centrally provided pipeline templates versus per-team integration: templates make adoption consistent, per-team fits unusual builds and creates variety to audit."],
    p: ["Declaring victory at high coverage leaves the unsigned remainder running with no plan or owner.", "Exemptions granted to meet a date never expire, so enforcement exists on paper only."],
    v: "Report coverage as signed and verified artifacts over all deployed artifacts, by environment, along with the list and age of every exemption, and confirm the numbers match a direct scan of what runs.",
    dep: ["audit-mode-rollout","verification-result-record"]
  },
  "cost-and-latency-of-verification": {
    s: "The compute, network and delay that signing and verification add to builds and deployments, and the decisions that keep them acceptable at scale.",
    d: "Verification involves fetching signatures and attestations, building certificate chains, checking log proofs and evaluating policy, per image and per deployment. At fleet scale this multiplies. Techniques include caching results, bundling evidence, verifying at admission once and not at every node, and limiting which attestations are checked where. Signing adds issuance round trips and log writes to builds. The difficulty is that shortcuts to save time are the places attackers look, so each saving must keep its guarantee intact and be measured.",
    k: ["Verify once centrally versus on every node: once is cheap and has a time gap and a single point, every node is thorough and multiplies load.", "Full evidence for every deployment versus risk-based depth: full is uniform and slow, risk-based is quick for low-risk and relies on correct classification."],
    p: ["Adding a verification step that doubles deployment time leads teams to route around it.", "Caching without invalidation buys speed at the price of continuing to approve revoked artifacts."],
    v: "Measure added time at build, at admission and at node start, at the fleet's peak deployment rate, and confirm each is within the stated budget and that a cold-cache run still completes correctly.",
    dep: ["signature-verification-cache","offline-verification-bundle"]
  },
});
