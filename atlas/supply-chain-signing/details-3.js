// Details for the supply-chain signing plate, part 3: source and dependency integrity, build integrity, artifact signing.
ATLAS.details("supply-chain-signing", {
  "source-provenance": {
    s: "Evidence that a build's source is the exact revision the policy expects, from the repository it expects, on a branch with the protections it expects.",
    d: "The builder resolves the source reference to an immutable revision identifier and records the repository, revision and any fetched submodules in provenance. Verification compares those to the release record. Without it, a build can claim to come from a reviewed revision while compiling something else. The platform, not the build script, does the checkout, so the recorded revision is what was actually fetched. The difficulty is mutability: branch names and tags move, repositories can be deleted and recreated under the same name, and history can be rewritten.",
    k: ["Record revision identifiers versus branch names: identifiers are exact and unreadable, names are readable and can point elsewhere tomorrow.", "Platform performs checkout versus build script performs it: platform checkout is trustworthy evidence, script checkout is flexible and unverifiable."],
    p: ["Recording a tag rather than the revision it pointed to loses which code was built after the tag moves.", "A repository deleted and recreated with the same name makes old provenance appear to refer to the new one."],
    v: "Take a released artifact's provenance, check out the recorded revision from the recorded repository, rebuild the checked-out tree's file listing and confirm it matches the source inventory the build logged.",
    dep: ["build-input-capture","trusted-build-service","signed-commits"]
  },
  "signed-commits": {
    s: "Cryptographic signatures on commits and release tags that tie changes to an author identity, checked by the repository host or by the verifier.",
    d: "Authors sign commits with a personal key or through an identity-based flow, and the host marks signatures verified when they match a registered key or identity. Release tags are signed by release managers. Policy can require signed commits on protected branches and signed tags for releases. Signatures show who authored a change, not that the change is safe or reviewed. The difficulty is key hygiene for individuals: lost keys, unmanaged laptops, and developers who sign with whatever works, so the signature proves little about the person.",
    k: ["Personal keys versus identity-based signing: personal keys are independent of any provider and hard to manage at scale, identity-based flows need no key storage and rely on the provider.", "Sign every commit versus sign only release tags: every commit gives fine attribution and friction, release tags are practical and say nothing about intermediate changes."],
    p: ["A verified badge for a key anyone can register proves only that someone with that key signed.", "Rebased or squashed commits lose the original signatures, so the merged history is signed only by the merge actor."],
    v: "Push an unsigned commit to a protected branch and confirm the host rejects it. Then push a signed commit from a registered identity and confirm it is accepted and shown as verified.",
    dep: ["signing-client","trusted-signer-allowlist"]
  },
  "branch-protection-evidence": {
    s: "Recorded proof that the branch a build came from enforced required reviews, required checks and restricted pushes at the time of the change.",
    d: "The repository host holds settings: who may push, how many approvals are needed, which checks must pass and whether administrators are bound too. A collector captures those settings, and the approval history for the merge, as a signed statement tied to the revision. Policy can then say production releases only come from revisions merged under these rules. The difficulty is time: settings change, and evidence collected later describes the current rules, not the rules in force when a given commit landed.",
    k: ["Capture settings at build time versus audit them separately: build-time capture ties rules to each revision, separate audits are simpler but cannot answer what applied then.", "Rules that bind administrators versus exempt them: binding them closes the biggest bypass and makes emergency fixes slower."],
    p: ["Reading current settings after the fact certifies rules that were weaker when the change merged.", "Administrator bypass flags let one account merge unreviewed code while all evidence shows protection enabled."],
    v: "Merge a change that skipped required review using an administrator override. The evidence collector records the bypass in the statement, and the release policy rejects the revision with that reason.",
    dep: ["review-attestation","source-provenance","attestation-envelope"]
  },
  "review-attestation": {
    s: "A signed record that an identified reviewer other than the author examined a specific revision and approved it, usable in a threshold policy.",
    d: "Review tooling emits a statement naming the revision, reviewer identity, time and outcome, signed by the review system. Policy can require one or more such statements from distinct people before a release. It makes two-person control checkable after the fact, not just a habit. The difficulty is meaning: an approval click may reflect no actual reading, and approvals attached to an earlier version of a change must not carry over to a later one that altered the code.",
    k: ["Approval bound to an exact revision versus to a change request: exact binding resists late edits and requires re-approval after every update, request-level binding is convenient and can approve code nobody saw.", "Count any approvals versus require code-owner approvals: owner approvals bring relevant knowledge and slow work when owners are unavailable."],
    p: ["An approval that survives a force-push of different code approves content the reviewer never saw.", "Self-approval through a second account of the same person satisfies a count while providing no independence."],
    v: "Approve a change, then push an additional commit that modifies a file. The prior approval no longer satisfies policy for the new revision, and the release check requires a new review of the final revision.",
    dep: ["attestation-envelope","threshold-policy"]
  },
  "dependency-pinning": {
    s: "Referring to dependencies, base images and build tools by immutable digest or exact version rather than by moving labels or ranges.",
    d: "A pinned reference names exact content: a digest for an image, a hash for a package, an exact commit for a source dependency. Builds are then repeatable, and a changed upstream cannot alter a build without a visible edit to the pin. Automation proposes updates as reviewable changes, with provenance of the new version. The difficulty is staleness: pins stop receiving security fixes unless someone updates them, so pinning without an update process trades one risk for another.",
    k: ["Pin everything versus pin only critical items: full pinning gives reproducibility and creates a constant stream of update changes, partial pinning is manageable and leaves moving parts.", "Pin by version versus by content hash: a version can be re-published upstream with different content, a hash cannot."],
    p: ["Pinned dependencies that nobody updates keep shipping known vulnerabilities for years.", "Pinning the application but not the base image lets the unpinned layer change under the pinned one."],
    v: "Change the upstream content behind a tag used by an unpinned reference and by a pinned one. The unpinned build picks up the change, the pinned build fails its digest check, and the difference is visible in the build logs.",
    dep: ["lockfile-integrity","content-digest"]
  },
  "lockfile-integrity": {
    s: "A committed file recording the exact resolved version and content hash of every dependency, so the install reproduces what was reviewed.",
    d: "The lockfile stores resolved versions, source locations and hashes for the whole transitive set. Installers in a locked mode refuse to deviate: a mismatch between manifest and lockfile, or between download and hash, fails the install. Review of lockfile changes catches unexpected additions or changed sources. The difficulty is review fatigue and trust in the file itself: large lockfile changes are rarely read, and a lockfile can be edited to point a hash at an attacker's source, so changes to source locations need explicit scrutiny.",
    k: ["Locked install mode in builds versus resolving fresh: locked builds are repeatable and slow to pick up fixes, fresh resolution is current and unreviewed.", "Hashes recorded per file versus per version: per file catches substitution of a single file, per version is smaller and misses it."],
    p: ["Developers regenerating the lockfile to silence a conflict accept whatever versions resolve today.", "A lockfile entry changed to a different download location is missed in a diff of thousands of lines."],
    v: "Tamper with a dependency's hash in the lockfile and run the build in locked mode. The install fails naming the dependency and mismatch. Restore it and confirm the build succeeds.",
    dep: ["content-digest","dependency-mirror-vetting"]
  },
  "dependency-mirror-vetting": {
    s: "An internal mirror that serves approved third-party packages, applying checks and delay before new versions become visible to builds.",
    d: "Builds fetch dependencies only from the mirror, which proxies upstream indexes. New versions pass through scanning, signature or provenance checks where the ecosystem offers them, license checks and optionally an age delay, so very new releases are not consumed instantly. Names reserved for internal packages are blocked from the public index to prevent confusion attacks. The mirror is also a record of what has been used. The difficulty is the maintenance burden and the blind spot: vetting cannot read every package, so it is a filter and not a proof.",
    k: ["Cooling-off delay for new versions versus immediate availability: a delay lets the community find malicious releases first, and slows legitimate urgent fixes.", "Allowlist of approved packages versus open proxy with scanning: allowlist is strong and slows adoption, an open proxy is convenient and relies on detection."],
    p: ["Internal package names not reserved on the public index get replaced by a public package with higher version.", "Builds that can reach upstream directly bypass the mirror whenever it is slow."],
    v: "Try fetching a package version published an hour ago under a delay policy, and an approved older one. The new one is not served, the old one is, and the mirror's log shows both requests with reasons.",
    dep: ["dependency-pinning","package-manager-verification"]
  },
  "hermetic-build": {
    s: "A build that cannot reach the network and receives all inputs declared up front, so what it consumed is fully known and fixed.",
    d: "A hermetic build starts with a declared set of inputs, fetched and checked beforehand, and runs with no network access and no undeclared host files. Outputs depend only on declared inputs, so recording the inputs fully describes the build. This prevents a build step downloading something unrecorded or exfiltrating secrets. It makes reproducibility possible. The difficulty is effort: many projects fetch during the build, rely on host tools and generate versions from the clock, and making them hermetic means declaring every tool and data file.",
    k: ["Fetch-then-build in two phases versus network-allowed builds: two phases record every input and require declaring them, open builds are simple and unrecorded.", "Hermetic for releases only versus every build: releases only is pragmatic and lets development drift away from what ships."],
    p: ["Builds that appear hermetic but still read host-installed tools silently depend on the builder image state.", "A network namespace that permits one internal address lets an unrecorded fetch through."],
    v: "Run the build with network access removed and confirm it completes, then run a build with an injected download step. The injected build fails at that step and the run's input record is unchanged for the first.",
    dep: ["build-isolation-boundary","build-input-capture","dependency-pinning"]
  },
  "ephemeral-builders": {
    s: "Build environments created fresh for a single job and destroyed afterwards, so one build cannot leave anything behind for the next.",
    d: "Each job gets a new virtual machine or container started from a known image, with no cache or workspace left from earlier jobs unless explicitly restored from a verified store. At the end the environment is destroyed. This prevents persistence by a compromised build and cross-contamination between projects. Startup time and caching become the cost: fresh environments are slower, so caches are tempting, and caches are the route by which poisoned content survives between builds.",
    k: ["Fresh environment per job versus reused workers: fresh removes persistence and costs startup time, reuse is fast and carries state between unrelated builds.", "Verified cache restore versus no cache: verified restore recovers speed while checking integrity, no cache is safest and slow."],
    p: ["A shared build cache that any job can write lets one project's build poison another's inputs.", "Workers kept alive to save startup time accumulate credentials and files from earlier jobs."],
    v: "Write a marker file in one job and run another job immediately after on the same builder pool. The second job's environment contains no marker and its start log shows a new instance identifier.",
    dep: ["build-isolation-boundary","trusted-build-service"]
  },
  "build-isolation-boundary": {
    s: "The separation between untrusted build steps and the signing and metadata functions of the build platform, enforced by the platform and not by convention.",
    d: "Build steps run user-chosen code, including third-party tools, so they are untrusted. The signing credential, the provenance generator and the log of what ran live outside that boundary, in a separate process, machine or service, and are reachable only through a narrow interface. Isolation is typically by separate virtual machines or kernels. The boundary determines what a compromised build can forge: if it holds, the worst case is a bad artifact with honest provenance. The difficulty is leaks through shared caches, shared network and mounted credentials.",
    k: ["Separate machine for the signing function versus a separate process on the same machine: a separate machine resists kernel-level escape, a process is cheaper and shares a failure domain.", "Narrow request interface versus mounted shared directory: a narrow interface exposes little, a shared directory is simple and lets the build write the inputs to signing."],
    p: ["A signing token passed to the build as an environment variable is readable by every step, including compromised dependencies.", "Shared writable storage between the build and provenance steps lets the build rewrite what is recorded."],
    v: "From within a build step, attempt to read the signing credential and to modify the provenance generator's output. Both attempts fail, and the platform's log records the denied access.",
    dep: ["trusted-build-service"]
  },
  "build-input-capture": {
    s: "Recording every input a build consumed, with digests, so the provenance lists what was actually used and not what was requested.",
    d: "The platform observes or controls fetches: source checkout, dependencies, base images and tools, and records name, location and digest for each. Observation can be through a proxy, a filesystem monitor or controlled pre-fetch for hermetic builds. The record becomes the materials list in provenance. It enables later questions such as which builds used a now-compromised package. The difficulty is completeness: inputs read from the environment, from the clock or from the network outside the observed path are missed, and the record is only as good as its coverage.",
    k: ["Observe during the build versus declare beforehand: observation catches the unexpected and may miss indirect reads, declaration is exact for what is declared and silent about the rest.", "Record hashes of everything versus names and versions: hashes allow exact later search and cost storage, names are compact and ambiguous."],
    p: ["Inputs fetched by a tool through its own connection bypass the recording proxy.", "Recording the requested version of a dependency rather than the resolved content misreports what built."],
    v: "Build a test project known to use forty inputs. The captured materials list contains exactly those forty digests, and an additional download added to the script appears in the list or causes the build to fail.",
    dep: ["hermetic-build","content-digest"]
  },
  "reproducible-build": {
    s: "A build whose output is bit-for-bit identical every time from the same source and inputs, regardless of who builds it, where or when.",
    d: "Reproducibility removes variation: timestamps, file ordering, absolute paths, locale, randomized identifiers and parallelism effects are normalized or set from the source revision. Two independent builds then produce the same digest, so a published binary can be checked by anyone who rebuilds it. This reduces trust in a single builder to agreement among several. The difficulty is thoroughness: tool and library nondeterminism is pervasive, and a build that is reproducible today can regress with one new dependency.",
    k: ["Bit-for-bit identical versus functionally equivalent: bit-for-bit is checkable by a digest compare, equivalence needs complex comparison and tolerates differences that may hide changes.", "Fix the toolchain exactly versus allow minor updates: exact toolchains reproduce but need constant update work, flexible ones drift and break equality."],
    p: ["An embedded build timestamp makes every rebuild differ, so nobody can tell benign from malicious differences.", "Reproducibility tested once at release stays true only until a new dependency introduces randomness."],
    v: "Build the release twice on two different machines at different times and compare output digests. They are equal. Then change the build path or time of one run and confirm the digest remains the same.",
    dep: ["hermetic-build","toolchain-bootstrap","build-input-capture"]
  },
  "reproducibility-verifier": {
    s: "An independent service that rebuilds published artifacts from provenance and compares the result to the published digest, flagging any mismatch.",
    d: "A verifier takes a release's provenance, fetches the same source and inputs, builds in its own environment and compares the digest. Several verifiers run by different parties give agreement that does not rely on one builder's honesty. Results are published as signed statements. A mismatch triggers investigation: either an honest nondeterminism bug or a compromised build. The difficulty is cost and coverage: rebuilding everything is expensive, so verifiers often sample, and any attacker who knows the sampling rule can avoid it.",
    k: ["Rebuild every release versus a sample: every release is stronger and costs compute, sampling is cheaper and detectable by timing.", "Verifiers under separate control versus the same organization: separate parties give independent evidence and require coordination, same-organization verification shares compromises."],
    p: ["Verifiers that run the same builder image share the same compromise as the builder.", "Mismatches treated as known flakiness and ignored hide the one real compromise."],
    v: "Publish a release built with one injected difference. The verifier's rebuild produces a different digest, raises an alert naming the artifact within the schedule, and publishes a signed mismatch result.",
    dep: ["reproducible-build","provenance-statement","attestation-envelope"]
  },
  "trusted-build-service": {
    s: "A build platform operated to a higher standard than ordinary build jobs, which runs builds and signs provenance with an identity the build itself cannot use.",
    d: "It receives a build request, performs the checkout, runs the steps in an isolated environment, generates provenance from its own records and signs it with a platform identity. Customers trust its statements because its isolation and operation are reviewed. It is usually a managed service, and a hardened self-run one is possible. It is the biggest trust anchor in the chain, and so the biggest target. The difficulty is staying trustworthy under change: new features, plugins and customer-supplied runners each add ways in.",
    k: ["Managed platform versus self-operated: managed has expert operation and a shared fate, self-operated gives control and puts the hardening burden on your team.", "Closed build definitions versus arbitrary scripts: closed definitions limit what can happen and are less flexible, arbitrary scripts fit every project and widen the attack surface."],
    p: ["Customer-supplied runners connected to the platform extend the trusted boundary to machines the operator does not control.", "Plugins that run inside the platform's own process give third parties access to the signing function."],
    v: "Review the platform's isolation test results and confirm that a build designed to attack the signer, such as reading its credential or editing provenance, fails, and that the failure is reproducible on demand.",
    dep: ["build-isolation-boundary","ephemeral-builders","issuing-authority"]
  },
  "toolchain-bootstrap": {
    s: "Establishing trust in the compilers and tools that build everything else, by building them from verified source with known earlier tools.",
    d: "A compromised compiler can insert flaws into everything it builds, and into new copies of itself, with no trace in the source. Bootstrapping addresses this by building the toolchain from minimal, auditable seed tools in stages, and by checking that independent chains produce the same compiler. The resulting tool images are pinned by digest and signed. It is a long-term, foundational effort. The difficulty is that modern toolchains need themselves to build, so trust in the starting point can never be complete, only reduced.",
    k: ["Bootstrap from minimal seed versus trust a prebuilt toolchain: a minimal seed is auditable and slow to maintain, prebuilt is practical and trusts its publisher.", "Diverse double compilation versus a single chain: diversity detects a self-propagating compromise and requires a second independent compiler."],
    p: ["Updating the toolchain image without a signed record leaves builds depending on an unreviewed compiler.", "Treating a signed toolchain as trustworthy because it is signed ignores how it was built."],
    v: "Build the toolchain from the seed in two independent environments and compare the output digests of the resulting compilers. Then use each to build a reference program and confirm equal digests.",
    dep: ["reproducible-build","package-and-binary-signing"]
  },
  "content-digest": {
    s: "A cryptographic hash of artifact bytes that serves as its unforgeable identity, used everywhere signatures, statements and registries refer to it.",
    d: "A collision-resistant hash is computed over the exact bytes of the artifact, or over a manifest listing the hashes of its parts. Signing a digest signs the content it names. The digest is the key for storage, lookup, attestation subject and policy. Because all trust hangs on it, what it covers matters: a hash of a manifest covers parts by reference, and a hash of an archive depends on its internal ordering. The difficulty is canonical form, since tools that decompress, normalize or re-pack produce different bytes with the same meaning.",
    k: ["Hash the artifact versus hash a normalized form: hashing the artifact is exact and brittle to re-packing, a normalized form tolerates re-packing and requires a precisely defined normalization.", "One strong algorithm versus an agile set: one is simple, an agile set can migrate when an algorithm weakens and complicates every verifier."],
    p: ["Verifying a digest of the downloaded copy and then using a different file path executes unverified content.", "Truncated or short digests used for convenience weaken the guarantee that identity cannot be forged."],
    v: "Compute the digest independently with two different tools over the same file and compare. Change one bit and confirm the digest differs completely, and that the registry refuses a push whose content does not match its declared digest.",
    dep: []
  },
  "signing-client": {
    s: "The tool that a developer or pipeline runs to sign an artifact or statement, handling digest computation, key or certificate use, envelope creation and upload.",
    d: "The client computes or accepts the digest, obtains a signing key or an ephemeral certificate, signs, assembles the envelope and uploads it, usually along with a log entry. It runs on developer machines and in pipelines, so it must be a single static tool that behaves the same in both. It validates what it signs: refusing to sign by tag, and warning when the digest changed since the last step. The difficulty is the safe default: a client that makes signing easy for the wrong thing, such as a mutable tag, makes unsafe signing the normal path.",
    k: ["Sign by digest only versus allow tags: digest only is unambiguous and forces a resolve step, tags are convenient and sign whatever the tag points to at that moment.", "Client does everything versus delegate to a signing service: the client works offline and holds credentials, a service centralizes control and adds a dependency."],
    p: ["Signing a tag resolves at signing time to content that may differ from what was tested.", "Pipelines that continue after a failed signing step publish unsigned artifacts the later checks happen to skip."],
    v: "Sign an artifact by digest in a pipeline, then verify it from a different machine with only the policy. The result is accepted, and signing a tag produces the digest it resolved to in the output.",
    dep: ["content-digest","signature-envelope-format","detached-signature"]
  },
  "detached-signature": {
    s: "A signature stored as a separate object from the artifact it covers, so the artifact bytes and their digest stay unchanged.",
    d: "The signature object contains the signature value, the digest or manifest identity it covers, and verification material such as a certificate or key identifier. It is stored next to the artifact, in the registry, or distributed in a file with a conventional name. Because the artifact is not altered, one artifact can have several signatures, added over time by different parties. The difficulty is linkage: verifiers must find the right signature, and nothing prevents a signature being attached to the wrong artifact unless the covered digest is checked.",
    k: ["Detached versus embedded signature: detached keeps the digest stable and allows many signers, embedded travels with the file and changes its bytes.", "Signature over the digest versus over the entire content: over the digest is small and fast to verify, over entire content binds metadata at the cost of re-reading large files."],
    p: ["A signature copied beside a different file looks present and fails verification only if the covered digest is compared.", "Detached signatures omitted when artifacts are copied leave the copy unverifiable."],
    v: "Attach two signatures from different signers to one digest, verify each independently, and confirm a signature copied to another artifact fails with a digest mismatch.",
    dep: ["content-digest","signature-envelope-format"]
  },
  "signature-envelope-format": {
    s: "The agreed byte layout for signatures and their metadata, so every verifier reads a signed object the same way.",
    d: "A format defines the payload, the signature algorithm identifier, the verification material (certificate chain, key identifier or log proof) and any signed attributes. Bundle formats combine a signature, certificate and log proof in a single file so verification can run offline. Version fields allow evolution. Because the format is the contract between signers and every verifier, ambiguity is dangerous. The difficulty is canonicalization and algorithm agility: parsers that accept several encodings invite confusion, and algorithm fields can be abused to select weak or no verification.",
    k: ["Self-contained bundle versus separate parts: a bundle verifies offline and is larger, separate parts are flexible and need online lookups.", "Algorithm named in the signature versus fixed by policy: signature-named algorithms are flexible and let an attacker pick the weakest, policy-fixed algorithms are safe and hard to migrate."],
    p: ["Accepting the none algorithm or an unexpected weak one from the envelope itself turns verification into a no-op.", "Two parsers disagreeing on duplicate fields lets one verify content the other uses differently."],
    v: "Feed the verifier a bundle with an algorithm field set to none and another with a duplicated payload field. Both are rejected with a format error, and a well-formed bundle verifies offline.",
    dep: []
  },
  "container-image-signing": {
    s: "Signing a container image by its manifest digest, covering all layers and configuration by reference, and storing the signature beside it in the registry.",
    d: "The signer resolves the tag to a manifest digest, signs that digest, and pushes the signature as a separate object linked to the manifest. Because a manifest lists layer digests, one signature covers every byte of the image. For multi-platform images, the index digest is signed and optionally each platform manifest. Verification at pull compares the signed digest to the pulled one. The difficulty is choosing what to sign: signing only one platform's manifest leaves the others unsigned, and signing a tag means signing a moving target.",
    k: ["Sign the index versus each platform manifest: signing the index is one operation and trusts its children by reference, signing each is stricter and multiplies work.", "Signature stored in the registry versus in a separate service: the registry keeps it with the image and copies move together, a separate service decouples from registry features."],
    p: ["Signing one architecture's manifest leaves another variant of the same tag unsigned yet apparently covered.", "Pulling by tag after verifying by digest at an earlier time gets a different image than the one checked."],
    v: "Pull an image by digest on a clean node, verify its signature, and confirm that pulling a sibling platform from the same index is covered. Then replace one layer in a test registry and confirm verification fails.",
    dep: ["content-digest","detached-signature","signature-referrers","signing-client"]
  },
  "package-and-binary-signing": {
    s: "Signing language packages, system packages, executables and firmware images, using the format and trust model each ecosystem or platform expects.",
    d: "Package ecosystems sign the package archive or its index metadata, operating systems check code signatures on executables and drivers, and device makers check firmware signatures in boot ROM or update logic. The mechanics differ: some embed the signature in the file, others use index metadata that lists hashes. Each has its own trust store and revocation story. The difficulty is heterogeneity: a single release may produce a dozen formats, and each needs signing and verification wired up, which leaves gaps wherever a format is skipped.",
    k: ["Sign each artifact versus sign the index: signing artifacts is direct and is stored separately from the metadata, signing the index covers everything listed and is one point of compromise.", "Platform-native signature formats versus one common format: native works with existing verifiers, a common format simplifies tooling and needs adapters."],
    p: ["Signing the installer but not the update channel's metadata leaves updates unauthenticated.", "Signing releases with a key shared across every product widens the damage from one stolen key."],
    v: "For each format a release ships, run that ecosystem's own verifier on the published file in a clean environment, and attempt to alter a byte and confirm each verifier rejects it.",
    dep: ["content-digest","signature-envelope-format","managed-key-service"]
  },
  "countersignature": {
    s: "A second signature over an existing signature or artifact by a different party, adding an independent assertion such as approval, scanning or timestamping.",
    d: "A countersigner verifies the first signature and signs again, over the same digest or over the first signature's bytes. Examples: a security team approving a build, a registry adding a signature when promoting to production, a timestamp service confirming the time. Policy can require specific countersignatures. This composes separate duties without sharing keys. The difficulty is meaning: what the countersignature claims must be explicit, or readers will assume it means more, such as that the code was reviewed.",
    k: ["Countersign the artifact digest versus the original signature: signing the digest is independent of the first signer, signing the signature proves the countersigner saw that signature and depends on it.", "Many countersigners with distinct roles versus one approver: roles divide duties and add steps to every release."],
    p: ["A countersignature that does not state what was checked is read as a full security review.", "Countersigning automatically on every push turns an independent check into a rubber stamp."],
    v: "Promote an artifact from staging to production and confirm the promotion step added a signature from the promotion identity. A policy requiring that signature rejects an artifact copied to production without it.",
    dep: ["detached-signature","threshold-policy","artifact-promotion"]
  },
  "trusted-timestamping": {
    s: "Evidence from an independent party that a signature or object existed at a given time, so later key expiry or compromise does not invalidate old signatures.",
    d: "A timestamp authority receives a digest, signs it together with the current time and returns a token. Verifiers check the token's signature and compare its time with certificate validity. Transparency logs can serve the same purpose by recording integration time. Timestamps let a signature remain valid after its certificate expires, and allow the question of whether it was made before a key was revoked. The difficulty is trusting the clock: the authority must have an accurate, protected time source, and the signer must not control the timestamp.",
    k: ["Dedicated timestamp authority versus time from the transparency log: a dedicated authority is a standard with its own trust, log time comes for free and ties trust to the log operator.", "Timestamp every signature versus only long-lived ones: timestamps everywhere are uniform and add a dependency, short-lived certificates make a log time sufficient."],
    p: ["Accepting signer-supplied time lets an attacker with a stolen key backdate a signature to before revocation.", "A timestamp authority outage blocks all signing when timestamps are mandatory."],
    v: "Verify a signature made with a certificate that has since expired, using its timestamp token. It passes. Remove the token and confirm verification fails for lack of time evidence.",
    dep: ["signed-tree-head","content-digest"]
  },
});
