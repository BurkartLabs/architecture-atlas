// Details for the supply-chain signing plate, part 2: provenance, attestations and bills of materials.
ATLAS.details("supply-chain-signing", {
  "provenance-statement": {
    s: "A signed record of how an artifact was produced: which source, which builder, which steps and which inputs, bound to the artifact by its digest.",
    d: "The statement names the subject digests, a build type that defines how to read it, the builder identity, the source repository and revision, the entry point and parameters, and the materials consumed. The builder generates it from its own knowledge, not from anything the build script wrote, then signs it. Consumers use it to check that a release came from the official pipeline and not a developer laptop. The difficulty is what it can prove: it is only as honest as the component that wrote it, so fields controlled by the build itself are not evidence.",
    k: ["Builder-written fields versus build-script-written fields: builder-written facts are trustworthy evidence, script-written ones are claims by the thing being judged.", "Detailed statements versus minimal ones: detail enables strong policy and incident search, but larger statements leak internals and cost more to store and parse."],
    p: ["Letting the build script supply fields in the statement lets a compromised build forge any history.", "Statements naming a repository but not a revision prove nothing about which code was built."],
    v: "Build a release, fetch its provenance by digest and confirm the source revision, builder identity and input digests match an independent record of the pipeline run that produced it.",
    dep: ["attestation-envelope","subject-digest-binding","builder-identity-claims","build-input-capture"]
  },
  "attestation-envelope": {
    s: "The signed wrapper that carries a statement of any type, naming its content type so the signature covers both the payload and how to interpret it.",
    d: "The envelope holds a payload type, the serialized statement and one or more signatures. The signature is computed over an encoding that includes the type, which prevents an attacker re-labelling a payload as a different kind of statement. It is independent of key type and statement format, so one verifier handles many predicate kinds. Because verifiers parse before trusting, the encoding must be canonical and unambiguous. The difficulty is parser disagreement: two implementations that read the same bytes differently can each be tricked in different ways.",
    k: ["Signing encoded bytes versus signing a canonical form of structured data: signing exact bytes avoids canonicalization bugs, but requires everyone to keep the original bytes.", "Including the payload type in the signature versus not: including it blocks type confusion and costs a type registry."],
    p: ["Verifying a signature over bytes and then parsing a re-serialized version lets differences between the two be exploited.", "Accepting any payload type allows a signed statement of one kind to be presented as another."],
    v: "Change the payload type label in a signed envelope without touching the body. Verification fails because the signature covers the type, and the error says the signature did not match rather than that the payload was unreadable.",
    dep: ["signature-envelope-format","content-digest"]
  },
  "subject-digest-binding": {
    s: "The link from a statement to the exact artifact bytes it describes, by cryptographic digest rather than by name or tag.",
    d: "Each statement lists subjects as a name plus one or more digests. A verifier computes the digest of the artifact it holds and requires it to appear in the subject list. Names and tags are labels that can be moved; digests cannot. For multi-artifact releases, each artifact is a subject, or a single digest of a manifest covers a tree. Stronger digests and multiple algorithms are recorded for agility. The difficulty is deciding what the digest covers: a container manifest digest covers layers by reference, while a file digest covers only that file.",
    k: ["Digest of a manifest versus digest of each layer or file: a manifest digest is compact and covers everything it references, per-file digests give finer evidence but need larger statements.", "Single algorithm versus several: several protect against a weakened algorithm, at the cost of larger statements and more checks."],
    p: ["Binding a statement to a tag lets someone repoint the tag and inherit the old statement.", "Computing the digest of a transformed copy, such as a recompressed archive, yields a value that matches nothing signed."],
    v: "Take the digest of the deployed artifact straight from the node and confirm it appears in the subject list of its signed provenance. Alter one byte and confirm no statement lists the new digest.",
    dep: ["content-digest"]
  },
  "predicate-types": {
    s: "The registry of statement kinds, such as provenance, test results, vulnerability scans and review approvals, each with a defined schema and meaning.",
    d: "A predicate type is a name, usually a versioned URI, that tells verifiers how to read the predicate body. Each type defines required fields and their semantics. Policies refer to types: require provenance of this type and a scan result of that type. New types let teams attest to new facts without changing the verification machinery. The difficulty is governance: if every team invents types, policies cannot be shared, and a verifier that guesses at unknown types may misread them.",
    k: ["Few standard types versus many custom ones: standard types let policy and tools be shared, custom types fit local needs but isolate them.", "Versioned type names versus mutable schemas: versioning makes changes explicit and breaks old verifiers cleanly, mutation avoids churn and silently changes meaning."],
    p: ["Two teams using the same type name for different schemas produce statements that pass each other's checks and mean different things.", "A verifier that treats unknown types as informational accepts a missing required attestation."],
    v: "Present a statement with an unregistered predicate type to a policy that requires provenance. It is rejected as not satisfying the requirement, and the verdict lists the types actually found.",
    dep: ["attestation-envelope"]
  },
  "builder-identity-claims": {
    s: "The facts a statement makes about who ran the build, and the identity evidence that lets a verifier tie that claim to an approved builder.",
    d: "A statement names the builder by identifier, and the signing certificate or key proves which signer produced the statement. The verifier checks both and that the signer is on the approved builder list with the right scope. Higher assurance requires the builder identity to be separate from anything the build's code can control, so a malicious build step cannot sign as the builder. The hard part is the boundary: if user code and the signing step share a trust domain, the claim cannot be trusted.",
    k: ["Builder identity per service versus per build: per service is easy to list in policy, per build identities show exactly which run signed but need richer matching.", "Builder-held signing credentials versus delegating signing to a separate service: separation resists compromised builds and adds a component that must scale and stay up."],
    p: ["Signing credentials readable by the build script let a malicious dependency sign its own forged provenance.", "Trusting a builder named in the statement body without checking the signer lets anyone claim to be that builder."],
    v: "Attempt to sign a provenance statement from inside the build job, using only what the job can reach. The attempt fails or yields a signer that policy rejects, while the platform-signed statement from the same run is accepted.",
    dep: ["trusted-build-service","certificate-identity-extensions","build-isolation-boundary"]
  },
  "provenance-generator": {
    s: "The component that creates provenance statements automatically from the build platform's own records, so no developer writes them by hand.",
    d: "It runs in or beside the build service, collects the run's source reference, parameters and consumed materials from platform metadata, formats the statement and has it signed with the builder identity. It may be built into the build service or run as an isolated reusable workflow. It must be impossible for the build steps to alter what it records. Adoption depends on it being the default: if provenance needs per-project work, coverage stays low. The hard parts are capturing inputs accurately and making output identical across build systems.",
    k: ["Built into the build platform versus a bolt-on step: built-in has the strongest isolation but ties provenance to one platform, bolt-on works anywhere and shares a trust domain with the build.", "Generate for every build versus only for releases: every build gives complete history, releases only is cheaper but cannot explain a past test artifact."],
    p: ["A generator running as a normal build step can be altered by earlier steps in the same job.", "Output that records the requested parameters but not the resolved inputs misses what actually went in."],
    v: "Run a build whose script tries to edit the recorded source revision. The generated provenance still shows the real revision, taken from platform metadata and confirmed against the pipeline run record.",
    dep: ["trusted-build-service","build-input-capture","provenance-statement","signing-client"]
  },
  "build-assurance-levels": {
    s: "A graded scale describing how strongly a build's provenance resists forgery, from unsigned records to isolated, hardened builders with non-forgeable statements.",
    d: "Levels state concrete requirements: provenance exists, it is signed by the platform and not the user, builds run in isolated environments, and secrets used for signing are not reachable by build steps. Organizations set a minimum level per environment. Levels let policy express how much to trust a builder without listing every property. The difficulty is that a level is a claim about a platform that someone must assess, and teams are tempted to read the level as a statement about the artifact's quality rather than about the process.",
    k: ["Requiring a high level everywhere versus per-risk tiers: uniform strictness is simple and slows low-risk projects, tiers focus effort but need someone to assign risk.", "Self-assessed level versus independently assessed: self-assessment scales and flatters, independent assessment is credible and slow."],
    p: ["Treating the level as a guarantee of safe code confuses how it was built with what it does.", "Platforms advertising a level they only partly meet make policy depend on a false premise."],
    v: "For each builder on the approved list, show the evidence for its claimed level, such as a test that a build step cannot read the signing credential, and re-run that test on a schedule.",
    dep: ["provenance-generator","build-isolation-boundary","hermetic-build"]
  },
  "attestation-attachment": {
    s: "Storing signed statements alongside the artifact they describe so any verifier can discover them from the artifact's digest alone.",
    d: "Attestations are stored as separate objects linked to the subject by digest in the same registry, or in a standalone index keyed by digest. A verifier asks what is attached to this digest and receives a list of statement types. Linking by reference means the artifact itself is unchanged, so its digest stays stable. The difficulty is discovery and garbage collection: lookups must be fast and complete, and deleting an artifact or moving it to another registry must not orphan or lose its statements.",
    k: ["Attach in the same registry versus a separate index: the registry keeps everything together and depends on its support, an index works across stores but is another service to run.", "Embed statements in the artifact versus link them: embedding travels with the bytes but changes the digest and cannot add statements later."],
    p: ["Copying an image to another registry without its attached statements leaves it unverifiable there.", "Cleanup jobs that remove untagged objects delete signatures and statements that look orphaned."],
    v: "Given only an image digest, list its attached statements and confirm provenance, bill of materials and scan result are all returned, then copy the image to a second registry and repeat.",
    dep: ["signature-referrers","artifact-registry","subject-digest-binding"]
  },
  "sbom-generation": {
    s: "Producing a bill of materials for an artifact by analyzing the source, the resolved dependencies or the final built contents.",
    d: "Generators run at several points: from the manifest and lockfile at build time, from the resolved dependency graph, or by scanning the finished image or binary. Each point sees different truth: lockfile-based output misses vendored code, scan-based output can miss statically linked components. Output lists components with identifiers, versions, hashes and relationships. The difficulty is completeness and accuracy: any generator misses things, so consumers must know how it generated the list and whether to trust it for vulnerability matching.",
    k: ["Generate at build time versus scan afterwards: build-time sees the real dependency graph, scanning sees what shipped and catches content added late, so both disagree usefully.", "One bill per artifact versus a merged bill per product: per artifact is precise and numerous, a merged one is easier to consume and hides which artifact holds a component."],
    p: ["A list generated from the lockfile omits components copied into the source tree, giving a false sense of coverage.", "Regenerating a bill after the build, from a fresh dependency resolution, can differ from what was built."],
    v: "Build a test artifact with a known set of fifty dependencies, including one vendored copy, and compare the generated list against that known set. Confirm every component is found or the gap is listed.",
    dep: ["dependency-graph-capture","component-identifiers","sbom-formats"]
  },
  "sbom-formats": {
    s: "The standard document formats for bills of materials, each defining how components, relationships and metadata are written so tools can exchange them.",
    d: "Several open formats exist, with different strengths: some emphasize components and vulnerabilities, others license and file-level detail. Tools usually read more than one. A format defines fields for supplier, version, hashes, identifiers, dependency relationships and the tool that made it. Profiles define minimum fields to be useful. The difficulty is fidelity in translation: converting between formats loses fields, and many generators fill in only the fields the format requires, leaving documents valid but not useful.",
    k: ["Supporting one format versus several: one reduces conversion loss, several meets customers and regulators where they are but needs translation and testing.", "Strict minimum-field profile versus permissive: a profile makes documents useful, permissive formats pass validation with almost no information."],
    p: ["Documents that validate but lack versions or identifiers cannot be matched to vulnerability data.", "Round-tripping through another format silently drops relationships, leaving a flat list."],
    v: "Validate a generated document against its format schema and the minimum-field profile, then feed it to a consumer tool and confirm that all components resolve to identifiers present in a vulnerability database.",
    dep: ["component-identifiers"]
  },
  "component-identifiers": {
    s: "The naming scheme that identifies each component uniquely enough to match it against vulnerability records, license data and other bills of materials.",
    d: "Identifiers are structured strings combining ecosystem, name, version and sometimes qualifiers such as architecture. Alternatives include dictionary-based names assigned by a registry and content hashes. Consumers match identifiers across lists and databases, so differences in spelling or version syntax break matching. Hashes are exact but tie to one build. The difficulty is that no scheme is complete: components renamed, forked or repackaged by distributions often have several valid identifiers and no authoritative mapping between them.",
    k: ["Ecosystem-native identifiers versus dictionary names: native names are precise within their ecosystem and tie to its package index, dictionary names cross ecosystems but are assigned slowly and ambiguously.", "Identifier only versus identifier plus content hash: adding the hash lets consumers confirm exactly what was meant, at the cost of fragility when the file is rebuilt."],
    p: ["A version string compared as plain text mis-orders versions, hiding that a vulnerable one is present.", "A distribution's patched package carrying the upstream version looks vulnerable or fixed depending on which identifier is used."],
    v: "Take twenty components from a real bill and resolve each to a record in the vulnerability database through its identifier alone. Report how many resolve and examine each miss to find whether the naming or the data is at fault.",
    dep: []
  },
  "dependency-graph-capture": {
    s: "Recording not only which components are present but which component pulled in which, direct and transitive, with the resolution that selected each version.",
    d: "Build tools resolve a tree of requirements into a concrete set. Capture records each edge: this package requires that one at this constraint, and resolved to that version. The graph answers why a component is present and what removing a direct dependency would drop. It differentiates build-only and runtime-only dependencies. Capturing it requires hooks into the package manager or analysis of the lockfile. The difficulty is dynamic loading, optional dependencies and platform-specific resolutions, which make the graph depend on the environment it was resolved in.",
    k: ["Capture at resolution time versus infer from final contents: resolution time has real edges, inference works for any build and guesses relationships.", "Include build-only dependencies versus runtime only: including build tools exposes the compromise route of the build, but makes the list long and confusing for runtime vulnerability decisions."],
    p: ["A graph taken on one operating system omits dependencies that only appear on another.", "Flattening to a list loses which direct dependency to upgrade to remove a vulnerable transitive one."],
    v: "For a chosen vulnerable transitive component, query the graph for every path that introduces it and confirm each path corresponds to a real requirement in the manifests.",
    dep: ["lockfile-integrity","component-identifiers"]
  },
  "sbom-signing-and-attachment": {
    s: "Signing a bill of materials as an attestation about a specific artifact and attaching it so the list cannot be swapped for a different one.",
    d: "The bill is wrapped as a statement whose subject is the artifact digest, signed by the builder or the generating pipeline, and stored beside the artifact. Verification checks the signature, the subject match and the signer's eligibility. This stops a consumer being handed a flattering list for different software. It also lets a policy require a bill to exist. The difficulty is trust: a signed bill is only as accurate as its generator, and the signature says who made the list, not that the list is complete.",
    k: ["Sign the bill as an attestation versus sign the file only: an attestation binds it to the artifact digest, a bare file signature says nothing about which artifact it describes.", "Sign at build versus after later enrichment: signing at build is trustworthy about origin, enrichment such as added vulnerability data needs fresh signatures."],
    p: ["A bill that is signed but attached to a tag, not a digest, can end up describing a different build.", "Policy that checks only for the presence of a bill accepts an empty one."],
    v: "Fetch the bill for a deployed image by digest, verify its signature and subject, and confirm the component count is above a minimum threshold and that a known dependency appears.",
    dep: ["attestation-envelope","attestation-attachment","sbom-generation"]
  },
  "vulnerability-exploitability-statements": {
    s: "Signed statements, issued by the supplier, saying whether a known vulnerability in a listed component actually affects this product, and why.",
    d: "A bill shows that a vulnerable component is present; many such findings are not exploitable because the vulnerable function is never reached or is mitigated. The supplier publishes a statement per vulnerability and product: not affected with a justification, affected, fixed or under investigation. Consumers combine these with scan output to cut noise. The statements must be signed and versioned, since they can change as analysis proceeds. The difficulty is credibility: a not-affected claim is a judgment, and consumers must decide how much to trust the supplier's reasoning.",
    k: ["Machine-readable justification codes versus free text: codes let consumers filter automatically, free text carries nuance but must be read by a person.", "Supplier-issued versus consumer-evaluated: supplier statements know the code best, consumer evaluation trusts nobody and cannot see inside binaries."],
    p: ["A not-affected statement issued once and never revisited becomes false when the product changes.", "Consumers suppressing every finding on any not-affected claim hide ones that were incorrect."],
    v: "Scan an artifact with a known present-but-unreachable vulnerable library. The raw scan flags it, and with the signed statement applied the finding moves to not affected, with the justification text visible in the report.",
    dep: ["sbom-signing-and-attachment","predicate-types"]
  },
  "license-metadata": {
    s: "License and copyright information for each component, carried in the bill of materials so legal checks run on facts about the artifact and not on guesses.",
    d: "Each component lists declared licenses and, where analyzed, the licenses found in its files, using standard identifiers and expressions for combined licenses. Policies flag licenses a product may not ship, and obligations such as notices are generated from the data. It rides with the same signed bill, so it is bound to the artifact. The difficulty is accuracy: declared and detected licenses disagree, expressions are complex, and a component's license can change between versions.",
    k: ["Declared versus detected license: declared is cheap and sometimes wrong, detection finds what files actually say but produces false matches that need review.", "Standard identifiers versus free-form text: identifiers can be checked by policy, free text is faithful and cannot be evaluated automatically."],
    p: ["Treating an empty license field as acceptable ships components that have no license at all.", "A dual-licensed component recorded under only one option hides a choice the legal team must make."],
    v: "Run the license policy over a bill containing a component under a forbidden license and one with no license. Both are flagged by name and component, and a compliant bill passes.",
    dep: ["sbom-formats","component-identifiers"]
  },
  "sbom-ingestion-and-diff": {
    s: "Collecting bills of materials into a searchable store and comparing versions, so questions about which products contain a component, or what changed, have answers.",
    d: "The ingest service verifies each bill's signature and subject, parses it into a normalized model and indexes components by identifier and version. Queries answer which running artifacts contain this component, and diffs between consecutive releases show added, removed and upgraded components, which reviewers use to spot suspicious additions. Joined with vulnerability feeds, it produces affected lists within minutes of an advisory. The difficulty is scale and normalization: millions of components, varying identifiers and bills that disagree with deployment reality.",
    k: ["Index at ingest versus compute at query time: indexing makes advisories answer instantly but requires reprocessing on schema changes, query-time is flexible and slow.", "Store only signed bills versus any bill: signed only gives trustworthy answers and leaves gaps for unsigned products, accepting any gives coverage and mixed trust."],
    p: ["Bills for builds that never deployed pollute answers about what is actually exposed.", "A diff that only compares names misses a silent version change of one dependency."],
    v: "Publish a test advisory for a component known to be in three deployed artifacts. The store returns exactly those three, with owners, within the target time, and a diff of the last release shows the same component's version.",
    dep: ["sbom-signing-and-attachment","verification-result-record","component-identifiers"]
  },
});
