// Details for the supply-chain signing plate, part 4: keyless signing, storage and distribution, transparency logs.
ATLAS.details("supply-chain-signing", {
  "oidc-identity-token": {
    s: "A short-lived signed token from an identity provider asserting who a person or workload is, presented to the issuing authority as proof of identity.",
    d: "A person logs in interactively, or a workload such as a build job requests a token from its platform. The token carries an issuer, a subject, an audience naming the intended recipient and claims about the context, such as repository and workflow. It expires in minutes. The issuing authority validates its signature against the provider's published keys and uses its claims to fill the certificate. The difficulty is claim trust: the subject must be a stable, non-reusable name, and claims chosen by users, such as branch names, must not be the basis for trust.",
    k: ["Machine workload identity versus human identity: workload tokens need no password and bind to a pipeline, human tokens attribute to a person and require interaction.", "Audience restricted to the issuing authority versus general-purpose tokens: restricting the audience stops a token stolen from one service being replayed at the issuer."],
    p: ["Trusting a token claim that the job's own code can influence lets any job mint an identity it should not have.", "Long token lifetimes turn a leaked token from a minutes-long risk into a hours-long one."],
    v: "Request a token from a build job, decode its claims and confirm issuer, subject, audience and expiry match expectations. Present a token with a different audience to the issuer and confirm it is refused.",
    dep: ["workload-identity-federation"]
  },
  "workload-identity-federation": {
    s: "Letting a workload in one system obtain credentials in another by proving its identity with a token, with no stored long-lived secret.",
    d: "The receiving system is configured to trust an identity provider and to map particular token claims to a role or certificate identity. A workload exchanges its token for what it needs. The mapping rules decide which workloads get which identity, so they are the real security policy. This replaces stored secrets that can leak. The difficulty is writing mappings narrowly: a rule that trusts any repository in an organization gives every repository the signing identity, including forks and new ones.",
    k: ["Narrow claim mapping versus broad: narrow mappings contain a compromise to one workflow, broad ones require less configuration and extend the identity to unrelated workloads.", "Federation versus stored credentials: federation has nothing to steal at rest, stored credentials work anywhere and need rotation and storage."],
    p: ["A mapping that matches by repository name alone lets a forked or renamed repository obtain the identity.", "Trusting pull request contexts as well as protected branches lets an outsider's change sign as the project."],
    v: "Attempt the token exchange from a job in a fork or an unprotected branch. It is refused, and the same exchange from the protected release workflow succeeds and yields the expected identity.",
    dep: ["oidc-identity-token","certificate-identity-extensions"]
  },
  "ephemeral-keypair": {
    s: "A signing key pair generated for a single signing session, held in memory, and never stored or reused.",
    d: "The client generates a new key pair at the start of signing, sends only the public key to the issuing authority and keeps the private key in memory. After one or a few signatures it is discarded. Because no key persists, there is nothing to steal later, no rotation to run and no revocation to chase: a leaked key has already expired. The cost is that trust moves entirely to the identity binding and the log, because a signature by an unknown key means nothing without its certificate.",
    k: ["Fresh key per signing versus per day or per project: per signing minimizes exposure and costs a certificate issuance each time, longer reuse lowers load and widens the window.", "Memory-only key versus hardware-protected: memory-only is simple and exposes the key to the host during its short life, hardware is stronger and not available to most jobs."],
    p: ["Writing the ephemeral key to a debug log or crash dump turns it back into a stored secret.", "Reusing the key across several jobs for speed brings back the long-lived key problem."],
    v: "Sign two artifacts in separate runs and compare the public keys in their certificates. They differ, and a search of the job's disk and logs after exit finds no private key material.",
    dep: ["proof-of-possession"]
  },
  "proof-of-possession": {
    s: "A challenge showing that the requester controls the private key matching the public key submitted for certification, before the authority issues a certificate.",
    d: "The requester signs a value, often the identity token's subject or a nonce, with the private key and sends the signature along with the public key. The issuer verifies it. Without this step, someone could request a certificate for another party's public key and later claim their signatures. It binds identity and key within one request. The difficulty is subtlety: the signed value must be bound to this request and identity, or an attacker can replay or reuse proof for a different binding.",
    k: ["Sign the identity subject versus sign a fresh server nonce: signing the subject needs no extra round trip, a nonce proves freshness and costs a round trip.", "Check at issuance only versus at verification too: issuance-only is standard and trusts the issuer, also checking at verification adds cost and defends against a faulty issuer."],
    p: ["Issuing a certificate for any submitted public key lets an attacker obtain certificates for keys they cannot use and later disputes arise.", "A proof signed over a constant is replayable by anyone who observes it."],
    v: "Submit a public key with a proof signed by a different private key. The issuing authority rejects the request, and the audit log shows the failed possession check.",
    dep: ["ephemeral-keypair","oidc-identity-token"]
  },
  "short-lived-signing-certificate": {
    s: "A certificate that binds a public key to a verified identity and is valid for only minutes, so a stolen key quickly becomes useless.",
    d: "The issuing authority creates a certificate with the identity from the token, the submitted public key, a lifetime of minutes and a usage restricted to code signing. It is returned to the client and recorded in the transparency log. By the time anyone verifies a signature the certificate has expired, so verifiers rely on the log's record that the signature was created during its validity. This removes the need for revocation of ordinary signing certificates. The difficulty is the verification model, which differs from ordinary certificate checks and is easy to implement wrongly.",
    k: ["Minutes of validity versus hours: minutes minimize misuse and require time evidence from the log, hours tolerate clock skew and give attackers more time.", "Log-recorded issuance versus unlogged: logging makes every certificate publicly searchable and creates a dependency on the log for signing."],
    p: ["Verifiers that apply ordinary expiry checks reject every legitimate signature once its certificate has expired.", "Certificates issued with a long lifetime by a misconfigured issuer reintroduce the stolen-key problem."],
    v: "Inspect a certificate from a real signing and confirm the lifetime is minutes, the usage is restricted to code signing, and a matching entry exists in the log with a time inside the validity window.",
    dep: ["issuing-authority","certificate-identity-extensions","transparency-log"]
  },
  "certificate-identity-extensions": {
    s: "Fields in the certificate that record the identity and context of the signer, such as issuer, subject and build details, which policies match against.",
    d: "Standard fields and defined extensions carry the identity provider's issuer, the subject, and context claims such as source repository, revision, workflow and trigger. The issuing authority copies them from the validated token. Policy then states: signed by this workflow of this repository on this branch. It is what turns a signature into a statement about who. The difficulty is the semantic gap: the same field means different things for different providers, and the authority must copy exactly what was validated and nothing supplied by the requester.",
    k: ["Many context fields in the certificate versus the minimum: more fields let policy be specific and make the certificate depend on more provider details, the minimum keeps it portable and coarse.", "Subject as a URI naming the workflow versus a free-form name: a URI is structured and matchable, free-form names are easier to spoof by lookalike."],
    p: ["Copying a field that the requester can influence lets them place chosen text into a trusted position.", "A provider that reuses a subject after account deletion lets a new owner inherit the signing identity."],
    v: "Parse a certificate from a release and confirm each extension value equals the corresponding claim in the identity token logged for the same job, and that no extension contains a value from the request body.",
    dep: ["oidc-identity-token","issuing-authority"]
  },
  "issuing-authority": {
    s: "The service that validates an identity token and a proof of possession and issues a short-lived signing certificate, logging each issuance.",
    d: "It verifies the token against provider keys, checks the audience and expiry, verifies the possession proof, builds the certificate from validated claims and signs it with its own intermediate key, held in protected hardware. It writes the certificate to a transparency log and returns it with the log's inclusion promise. It runs as a high-availability public service when shared, or inside an organization when private. It is the root of every signer's identity, so it is a prime target. The difficulty is protecting that key and keeping the issuance rules exactly right.",
    k: ["Public shared issuing service versus private organization-run: public gives free adoption and public logging, private keeps identities and policies internal and takes operation work.", "Intermediate keys online versus root offline: online keys serve requests and risk exposure, an offline root signs the intermediate rarely and must be present for rotation."],
    p: ["An issuing rule that trusts a new identity provider without scoping lets that provider assert any identity.", "An authority that issues before logging creates certificates that silently skip the transparency record."],
    v: "Request certificates with an invalid token, expired token and wrong audience. All three are refused with distinct errors. A valid request returns a certificate whose log entry is findable within a few seconds.",
    dep: ["oidc-identity-token","proof-of-possession","managed-key-service","transparency-log"]
  },
  "key-discard": {
    s: "Destroying the ephemeral private key immediately after signing, so only the signatures, the certificate and the log entry remain.",
    d: "After signing completes the client zeroes the key in memory and ends the process, so the key never reaches disk, backups or snapshots. Pipelines run signing in a short-lived step for the same reason. The effect is that the evidence of signing lives in public records, not in anything an attacker can steal later. The difficulty is verifying discard: memory can be swapped, core dumps can be written and managed runtimes copy buffers, so discard is a best effort unless the environment is controlled.",
    k: ["Explicit zeroing versus relying on process exit: explicit zeroing limits the window inside long-running processes, exit is simple and leaves memory to the operating system.", "Dedicated short signing step versus signing within the build: a dedicated step bounds the key's life and needs an extra stage, signing in the build exposes it to build code."],
    p: ["Crash dumps and swap files can retain the key after the process claimed to discard it.", "Keeping the key around to retry a failed upload recreates a long-lived key by accident."],
    v: "Run a signing step with crash dump capture enabled and force a failure after signing. The dump contains no key bytes matching the public key in the certificate.",
    dep: ["ephemeral-keypair"]
  },
  "artifact-registry": {
    s: "A content-addressed store that holds artifacts, their signatures and their attestations, and serves them by name and digest.",
    d: "The registry stores blobs by digest and manifests that reference them, with tags as movable names. Signatures and attestations are manifests that reference the subject, so a query for those attached to a digest returns them. Access control, replication and retention policies apply. It is the shared place verifiers and builders meet. The difficulty is that it is both a trust target and a trust-free component: a verifier must work even if the registry is malicious, which means checking every digest and signature it returns.",
    k: ["Verify at pull versus trust the registry's own checks: client-side verification survives a compromised registry, trusting the registry is cheaper and extends trust to it.", "Immutable tags versus mutable: immutable tags prevent silent replacement and block legitimate re-tagging workflows."],
    p: ["Retention policies that delete untagged objects remove signatures and attestations still needed.", "Write access granted widely lets any pipeline overwrite a tag that production pulls by."],
    v: "Push an image and its signature, delete the tag, and confirm the digest, signature and attestations remain resolvable by digest. Confirm a user with read-only access cannot push or overwrite.",
    dep: ["content-digest","signature-referrers"]
  },
  "signature-referrers": {
    s: "The registry mechanism that lists every signature, attestation and bill of materials linked to a given digest, so verifiers can discover them.",
    d: "Each signature or attachment is stored as a manifest with a subject field pointing at the artifact digest. A referrers query returns all manifests that point at a digest, filtered by type. Older registries lack the query and fall back to a naming convention that encodes the digest in a tag. Verifiers use it to find evidence without being told where it is. The difficulty is registry variance: fallbacks, rate limits and incomplete support mean discovery can silently return fewer results than exist.",
    k: ["Native referrers query versus tag-naming convention: native is clean and requires registry support, tag naming works everywhere and clutters the tag list and races on concurrent writes.", "Return all attachments versus filtered by type: returning all is simple and heavy, filtering reduces data and relies on correct type labels."],
    p: ["A fallback that silently returns an empty list makes a signed image appear unsigned.", "Concurrent writers updating the same fallback tag overwrite each other, losing a signature."],
    v: "Attach three signatures and two attestations to one digest. A referrers query on the digest returns all five, and the same query against a registry using the fallback returns the same five.",
    dep: ["artifact-registry","subject-digest-binding"]
  },
  "digest-versus-tag-pinning": {
    s: "The discipline of deploying and verifying by immutable digest and treating tags only as human-friendly labels that point somewhere at the moment.",
    d: "A tag is a pointer that publishers can move, so verification of a tag proves nothing about what a later pull returns. Deployment manifests refer to digests, a resolver converts tags to digests at a defined moment and records the result, and admission rewrites or rejects tags. Release tooling updates the digest reference when a new version is promoted. The difficulty is ergonomics: digests are unreadable, so humans want tags, and tooling must supply both without a gap between check and use.",
    k: ["Resolve tag to digest at admission versus require digests in manifests: admission resolution keeps manifests readable and has a time-of-check gap, required digests close the gap and cost readability.", "Digest in the manifest with the tag as a comment: both visible and kept in sync only by tooling."],
    p: ["Verifying a tag and deploying by tag allows the tag to move between the two operations.", "Automated tools that pin a digest but never refresh it freeze a vulnerable version in place."],
    v: "Move a tag to a new image after admission and confirm the running workload still uses the originally verified digest, while a new deployment resolving the tag gets verified afresh.",
    dep: ["content-digest","artifact-registry"]
  },
  "mirrors-and-replication": {
    s: "Copies of artifacts, signatures and attestations in other registries or regions, which must be kept complete and verifiable independent of the original.",
    d: "Replication copies manifests, blobs and linked signatures to regional or customer registries, either on push or on demand through a pull-through cache. Because digests and signatures are location-independent, a copy verifies the same as the original. Replication jobs must copy the attachments, not only the image, and must preserve digests. The difficulty is that conversion by an intermediary, such as recompression or manifest rewriting, changes the digest and breaks the signature, and incomplete copies verify as unsigned.",
    k: ["Replicate all attachments versus the image only: full replication keeps every consumer verifiable and uses more storage, image-only is smaller and leaves mirrors unable to verify.", "Push-based versus pull-through replication: push has the content ready everywhere, pull-through is lazy and delays the first request."],
    p: ["A mirror that rewrites manifests changes digests, so signatures made on the original no longer match.", "Replication that skips newly added attestations leaves remote sites with older, thinner evidence."],
    v: "Replicate a release to a second registry and verify it there using only its policy and trust roots. The verdict equals the original's, and the digest list is identical on both sides.",
    dep: ["artifact-registry","signature-referrers","attestation-attachment"]
  },
  "artifact-promotion": {
    s: "Moving an artifact between environments, such as test to staging to production, by copying the same digest and adding signatures that record each gate passed.",
    d: "Rather than rebuilding for each environment, one built artifact is promoted. Each gate verifies the prior evidence, runs its checks, then adds an attestation or countersignature and copies the artifact into the next registry or namespace. Production policy requires the full chain. This guarantees that what was tested is what ships. The difficulty is the copy: promotion tooling must preserve digests and carry every attachment, and gates must be enforced by the promotion system, not by whoever invokes it.",
    k: ["Promote the same digest versus rebuild per environment: promoting guarantees identity of tested and shipped bytes, rebuilding allows environment-specific builds and breaks the evidence chain.", "Gate evidence as signed statements versus pipeline state: signed statements travel with the artifact and can be verified later, pipeline state is local and lost when systems change."],
    p: ["Promotion by retagging within the registry may leave the signature attached only to the old tag's location.", "A gate that can be skipped by running the promotion tool directly means the evidence says less than it appears to."],
    v: "Promote a release through all environments, then verify in production that it carries a statement from each gate and that its digest equals the one tested in the first environment.",
    dep: ["mirrors-and-replication","countersignature","attestation-predicate-checks"]
  },
  "air-gapped-transfer": {
    s: "Moving artifacts, signatures, trust roots and log evidence into an isolated network on physical media, with everything verifiable offline.",
    d: "An export step collects the artifact, its signatures, attestations, the certificate chain, log inclusion proofs and current trust roots into a signed bundle. Media is scanned and carried across the boundary. An import step verifies the bundle against roots already inside and loads it into an internal registry. The inside must verify without calling out. The difficulty is freshness: with no live log or revocation feed, the inside needs periodic transfers of signed tree heads and deny lists, and a long gap quietly widens the window for stale trust.",
    k: ["Offline verification with bundled proofs versus periodic online sync: bundled proofs work with no connection and are only as fresh as the last transfer.", "Re-sign on import with an internal key versus keep original signatures: re-signing simplifies internal policy and drops the external chain of evidence."],
    p: ["Trust roots transferred once and never refreshed cause verification to fail or accept revoked material after a rotation.", "Import tooling that skips verification because the media was scanned trusts the carrier."],
    v: "Disconnect a test enclave from all networks, import a bundle and verify an artifact inside. It verifies using only bundled evidence. Tamper with the bundle and confirm import refuses it.",
    dep: ["offline-verification-bundle","trust-root-update","deny-list-distribution"]
  },
  "transparency-log": {
    s: "A public, append-only record of signing events that anyone can query and audit, making hidden or retroactive signing detectable.",
    d: "Signers, or the issuing authority on their behalf, submit entries containing signatures, certificates and digests. The log appends each, updates a Merkle tree and returns a signed receipt. Anyone can query entries by artifact or identity. Because the log cannot quietly alter or drop history, misuse of a stolen identity becomes visible to the owner who watches for it. It provides time evidence for short-lived certificates. The difficulty is that it is only useful if watched, and a log operator can show different views to different people without witnesses.",
    k: ["Public shared log versus private log: public gives broad auditing and exposes metadata, private keeps data in-house and loses outside scrutiny.", "Log every signature versus only certificates: every signature supports detailed forensics and creates a larger log and privacy exposure."],
    p: ["A log nobody monitors detects nothing; entries for a stolen identity sit unnoticed.", "Entries that leak internal repository or workflow names expose private structure through a public log."],
    v: "Sign an artifact, then query the log by its digest. The entry appears with its certificate and time, and the inclusion proof verifies against the current signed tree head.",
    dep: ["merkle-tree","signed-tree-head","log-entry-types"]
  },
  "merkle-tree": {
    s: "A tree of hashes over log entries whose root summarizes the entire log, allowing short proofs that an entry exists and that history was not altered.",
    d: "Each entry is hashed as a leaf, then pairs of hashes are combined upward to one root. The root changes if any entry changes. To prove an entry is included, the log provides the sibling hashes along the path, logarithmic in the log size. To prove the log only grew, it provides hashes linking the old root to the new. Domain separation between leaf and interior hashing prevents confusing one for the other. The difficulty is correctness of the tree algorithms and storing them at large scale.",
    k: ["Balanced append-only tree versus a sparse tree keyed by identity: append-only is simple and proves history, a sparse tree answers current-state lookups and costs more.", "Store the full tree versus recompute from entries: storing makes proofs fast and takes space, recomputing saves space and slows proofs."],
    p: ["Hashing leaves and interior nodes the same way allows an interior node to be passed off as a leaf.", "Implementation errors at tree-size boundaries produce valid-looking proofs that fail in rare sizes."],
    v: "For a log of one thousand entries, compute the root independently from the raw entries with a separate implementation and confirm it equals the root in the signed tree head.",
    dep: ["content-digest"]
  },
  "log-entry-types": {
    s: "The defined kinds of record the log accepts, each specifying what is hashed, what is stored and how a verifier checks it.",
    d: "An entry kind defines a schema: a signature entry holds the signed digest, signature and certificate; an attestation entry holds the statement's digest and envelope; a timestamp entry holds a hash and time. The log validates each submission against its kind before accepting it, so only well-formed, verifiable entries are recorded. Typed entries allow indexed search by digest or identity. The difficulty is evolution: adding kinds requires updating every verifier that must understand them, and a log that accepts malformed entries becomes a storage for junk.",
    k: ["Validate entries on submission versus accept opaque data: validation keeps the log meaningful and costs the operator compute, opaque is cheap and unsearchable.", "Store full entries versus only hashes: full entries support search and expose content, hashes protect privacy and make later lookups require the original."],
    p: ["Accepting entries whose signature does not verify fills the log with records that mislead anyone searching.", "Dropping the entry kind from the hashed content lets one entry be reinterpreted as another kind."],
    v: "Submit one valid entry of each kind and one malformed entry. The valid ones are accepted and searchable by digest, and the malformed one is rejected with a schema error and not recorded.",
    dep: ["merkle-tree","signature-envelope-format"]
  },
  "signed-tree-head": {
    s: "The log's signed statement of its current size, root hash and time, which verifiers and monitors use as the anchor for every proof.",
    d: "At regular intervals the log signs a record containing the tree size, root hash and a timestamp. Inclusion and consistency proofs are checked against a signed tree head. Clients keep the latest head they have seen and require new heads to be consistent with it. Signed tree heads from witnesses add independent confirmation. The difficulty is split view: a malicious log could show different heads to different clients, which only comparing heads between parties detects.",
    k: ["Frequent heads versus infrequent: frequent heads give tighter time evidence and cost signing load, infrequent are cheap and delay when entries become provable.", "Log-signed heads only versus witness cosigned: log-only is simple and trusts the operator, cosigning adds independent assurance and needs witnesses."],
    p: ["Verifiers that fetch a head and never store it cannot detect a log that later rewrites history.", "Heads accepted without checking the time lets an attacker replay an old head from before an entry was removed."],
    v: "Fetch two signed tree heads an hour apart and verify the signatures, confirm the second size is not less than the first, and check that a consistency proof links the two roots.",
    dep: ["merkle-tree"]
  },
  "inclusion-proof": {
    s: "A short proof that a particular entry is part of the log whose root is in a signed tree head, checkable without downloading the log.",
    d: "The log returns the sibling hashes on the path from the entry's leaf to the root. The verifier hashes the entry, combines it with the siblings in order and compares the result to the signed root. A match shows the entry was in the tree at that head. Verifiers store the proof with the signature, so verification can be offline. A promise issued at submission time precedes the actual proof, and the real proof should be fetched later. The difficulty is treating a promise as a proof.",
    k: ["Require a full inclusion proof versus accept a signed promise: full proofs are verifiable evidence and require waiting for integration, promises are instant and trust the log to honor them.", "Store the proof with the signature versus fetch it at verification: storing enables offline checks, fetching keeps bundles small and needs the log online."],
    p: ["Accepting the log's promise of inclusion as the proof lets a log that never integrated the entry pass verification.", "A proof checked against a head the verifier never authenticated proves only agreement with an attacker."],
    v: "Verify an entry's inclusion proof against a freshly authenticated signed tree head, then modify one entry hash and confirm the recomputed root no longer matches.",
    dep: ["merkle-tree","signed-tree-head"]
  },
  "consistency-proof": {
    s: "A proof that a newer log state contains every entry of an older state unchanged, which shows the log was only appended to.",
    d: "Given an old tree size and root and a new size and root, the log provides a set of hashes that link the two. The verifier recomputes both roots from them. If both match, the new tree extends the old with no change to earlier entries. Monitors and clients run this check each time they see a new head. The difficulty is that it is only useful when someone actually performs it and when heads are compared across observers, as a single client's check cannot reveal a log that shows others a different history.",
    k: ["Check consistency on every new head versus occasionally: every head catches tampering quickly and costs a request each time, occasional checks are cheap and delay detection.", "Client-side checks versus monitor-side only: client checks protect each client directly, monitor-only concentrates the work and trusts the monitor."],
    p: ["A verifier that stores no previous head has nothing to check consistency against.", "Checking consistency only against the log's own claim of its previous head repeats the log's story."],
    v: "Request a consistency proof between two heads and verify it. Then request one against a tampered copy of the log with an earlier entry changed and confirm the proof fails to verify.",
    dep: ["merkle-tree","signed-tree-head"]
  },
  "log-witnessing": {
    s: "Independent parties that check log consistency and countersign tree heads, so a verifier can trust a head only if enough witnesses saw the same one.",
    d: "Each witness keeps the last head it saw for a log, checks that each new head is consistent with it and, if so, adds its own signature. A client requires a quorum of witness signatures on a head before relying on it. This closes the split-view attack: a log cannot show different histories to different clients without one witness refusing. It adds independent operators. The difficulty is deploying witnesses with real independence and clients that actually require the cosignatures.",
    k: ["Quorum of independent witnesses versus a single log signature: a quorum defeats a lying log and requires running and trusting several witnesses, a single signature is simple and trusts one operator.", "Witnesses that check only consistency versus those that also verify entries: consistency-only is cheap and scalable, entry checking is deeper and heavier."],
    p: ["Witnesses run by the same operator as the log provide no independence.", "Clients configured without a quorum requirement ignore cosignatures entirely."],
    v: "Present a tree head signed by the log but by fewer than the required witnesses. The client refuses it, and presenting one with the full quorum is accepted.",
    dep: ["signed-tree-head","consistency-proof"]
  },
  "log-monitor": {
    s: "A process that reads the log continuously and alerts owners to unexpected entries, such as a signature by their identity they did not make.",
    d: "Monitors follow new entries, verify consistency and filter by identity, repository or artifact name. An owner subscribes to alerts for their identities, which turns a stolen identity from silent into noticed. Organizations run monitors for their own namespaces, and third parties run general ones. Findings feed incident response. The difficulty is signal: a high-volume log needs precise filters, alerts need an owner who responds, and monitors must verify the log, not simply believe what it serves.",
    k: ["Self-hosted monitor versus a third-party service: self-hosted keeps filters private and needs operation, third-party is easy and sees your interests.", "Alert on every signing by an identity versus only unexpected ones: every alert gives a full audit and numbs responders, unexpected-only needs a correct list of expected signings."],
    p: ["A monitor that does not verify consistency can be fed a doctored log.", "Alerts sent to an unmonitored mailbox leave a compromise visible in the log and unseen by anyone."],
    v: "Sign a test artifact with an identity under watch, outside the release pipeline. The monitor raises an alert naming the entry within the target time, and the on-call responder receives it.",
    dep: ["transparency-log","consistency-proof","identity-matching-rules"]
  },
  "offline-verification-bundle": {
    s: "A single file holding the signature, certificate chain, inclusion proof and signed head, so an artifact can be verified with no network access.",
    d: "At signing time, the client waits for the log's inclusion proof and then packs it with the signature, certificate and the signed tree head into a bundle. A verifier needs only the bundle and its local trust roots. This avoids online lookups on every verification, tolerates registry and log outages and works in isolated networks. The difficulty is staleness: an offline verifier cannot learn of later revocation or compromise, so bundle age limits and periodic refreshes of deny lists bound the exposure.",
    k: ["Bundle with proof versus fetch evidence online: bundles verify fast and offline and can be stale, online lookups are current and depend on availability.", "One bundle per signature versus per release: per signature is precise and many files, per release is compact and requires re-bundling when a signature is added."],
    p: ["Bundles created before the inclusion proof is available omit it and verify only if the verifier then goes online.", "A bundle accepted without checking the head's age verifies old signatures long after the log has moved on."],
    v: "Verify an artifact on a machine with no network using only its bundle and local roots. It passes. Remove the inclusion proof from the bundle and confirm verification fails.",
    dep: ["inclusion-proof","signature-envelope-format","short-lived-signing-certificate"]
  },
});
