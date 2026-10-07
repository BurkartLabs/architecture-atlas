// Details for the package manager plate, part 4: registry protocol, registry service, integrity and supply chain.
ATLAS.details("package-manager", {
  "registry-metadata-api": {
    s: "The read interface that returns, for a package name, every published version with its dependency lists, hashes, tags and download locations.",
    d: "A client requests a document per package name over HTTP and receives a list of releases, each with its manifest-derived dependencies, archive location, integrity hash, publication time and status such as yanked or deprecated. Responses are cacheable and served from a CDN. The same data feeds resolution, outdated checks and audit. It is hard because popular packages have thousands of versions, so a naive full document is large, and because every field becomes part of a protocol that old clients depend on.",
    k: ["One document per package versus per version: one document answers resolution in a single request, while per-version documents are small and immutable but need many requests.", "Embedding full manifests versus only dependency fields: full manifests serve every need, but inflate every response."],
    p: ["A very large package document is downloaded in full for every resolution and slows installs.", "A new field with a changed meaning breaks older clients that parse the document strictly."],
    v: "Request a package document and verify it lists each published version with a hash that matches the archive, a dependency list equal to the manifest inside that archive, and marks yanked releases.",
    dep: ["package-index","compact-metadata","download-endpoints","protocol-versioning"]
  },
  "package-index": {
    s: "The registry's authoritative table of package names to release records, built from every accepted upload and used to answer metadata, search and download requests.",
    d: "Each accepted publish appends a release record to the index: name, version, dependency summary, hash, size, publication time and flags. The index is derived data that can be rebuilt from stored archives. It may be a database behind an API, or a versioned set of static files. Changes must be visible consistently: a release must appear in the index only after its archive can be downloaded. It is hard because index and storage are updated separately and can disagree.",
    k: ["Database-backed index versus static index files: databases support rich queries and instant updates, while static files are trivially cacheable and mirrorable.", "Appending release records versus rewriting package documents: appends make updates cheap and ordered, but need compaction for reading."],
    p: ["A release appears in the index before its archive is replicated, and clients get not-found errors on download.", "An index rebuilt from archives drops yank flags that existed only in the old index."],
    v: "Publish a release to a test registry and, in a loop, poll the index and the archive URL; the release never appears in the index before its archive is downloadable, and a rebuilt index equals the live one.",
    dep: ["registry-storage","publish-protocol"]
  },
  "compact-metadata": {
    s: "A reduced metadata representation containing only fields resolution needs, selected by content negotiation, so clients download far less per package.",
    d: "The registry offers a compact form that omits long text such as descriptions, readmes and maintainers, keeping versions, dependencies, hashes and flags. Clients ask for it through a media type or version header, and fall back to the full form for display commands. Compact documents compress well and can be cached longer. It is hard because the two representations must stay consistent, and caches must key on the negotiated type or they serve the wrong one.",
    k: ["Content negotiation versus separate URLs: one URL per package is tidy, but caches must handle variants correctly.", "Compact form with only dependency data versus including all version metadata: smallest downloads, but any command needing more falls back to a second request."],
    p: ["A cache stores a compact response and serves it to a client expecting the full document.", "The compact form omits a field that a newer resolver needs and silently resolves wrongly."],
    v: "Request one package in both forms and compare sizes; the compact one is much smaller, lists the same versions and hashes, and a shared cache returns the right form for each request header.",
    dep: ["registry-metadata-api","http-cache","protocol-versioning"]
  },
  "sparse-index": {
    s: "An index organized as small static files, one per package, fetched individually on demand, instead of one large index cloned or downloaded up front.",
    d: "Files are placed at paths derived from package names and served over plain HTTP. The client fetches only the files for packages in its graph, using conditional requests. There is no clone step and no server logic, so any static host or CDN can serve it. Each file lists releases one per line, so appends are cheap. It is hard because resolution then needs many small requests, which need HTTP multiplexing, and because path layout is a permanent contract.",
    k: ["Per-package static files versus a full index download: only needed packages are fetched, but many requests are made instead of one bulk transfer.", "A versioned bulk snapshot as a fallback versus sparse only: snapshots help cold starts, but require both forms to be kept consistent."],
    p: ["A cold resolution makes thousands of requests and is throttled by a proxy that limits concurrent connections.", "A CDN serves stale files for a package after a new release, so the client cannot see it."],
    v: "Resolve a project from an empty cache and count requests; they equal the number of distinct packages reached, each file carries validators, and a second run issues only conditional requests returning not-modified.",
    dep: ["package-index","http-cache","resolution-metadata-cache"]
  },
  "download-endpoints": {
    s: "The URLs, usually behind a content delivery network, from which archives are served, with stable paths, long cache lifetimes and redirects to object storage.",
    d: "Each release's archive has a URL derived from name and version, or taken from the metadata. The registry redirects or serves through a CDN that caches the immutable file at the edge. Archives are served with long lifetimes and the hash in the metadata, so any cache can be trusted only after verification. Bandwidth dominates registry cost. It is hard because popular releases generate huge traffic spikes, because URLs must remain valid for years, and because clients behind restrictive networks need predictable hostnames.",
    k: ["URL derived from name and version versus URL stored in metadata: derived URLs are cacheable and predictable, while stored URLs allow moving storage without changing clients.", "Serving directly versus redirecting to object storage: redirects offload bandwidth, but add a hop and a second hostname to allow in firewalls."],
    p: ["A change of storage hostname breaks every corporate firewall rule that allowed the old one.", "A redirect to a host that clients do not trust forwards credentials sent to the registry."],
    v: "Request an archive twice through the CDN with logging; the second response is served from cache, its hash matches the metadata and the response headers declare a long, immutable cache lifetime.",
    dep: ["registry-storage","integrity-hashes"]
  },
  "search-api": {
    s: "The query interface clients use to find packages by name, keyword or description, returning ranked results with summary metadata.",
    d: "A request carries a text query and filters and receives a page of results with names, latest versions, short descriptions and popularity signals. It is separate from the resolver's metadata path and may be served from an independent index with looser freshness. Command-line search and web pages share it. It is hard because results must be fast and rate-limited, and because the ordering decides which packages get adopted, making it a target for manipulation.",
    k: ["Search on a separate index versus querying primary storage: separate indexes scale and can lag slightly, while primary queries are always current but compete with installs.", "Public ranking signals versus hidden ones: published signals are predictable for honest authors, but easier to game."],
    p: ["Search results lag a new release by hours, so a user concludes a package does not exist.", "A scraper that issues unlimited queries slows down the interface for everyone."],
    v: "Publish a package with a distinctive keyword and query for it; it appears within the documented delay, with its latest version and description matching the metadata API.",
    dep: ["search-ranking","registry-metadata-api"]
  },
  "protocol-versioning": {
    s: "How the registry protocol evolves without breaking old clients: version numbers or media types in requests, capability flags and rules for ignoring unknown fields.",
    d: "Clients announce which protocol versions and document formats they understand through headers or URL prefixes, and the registry responds in a compatible form. New optional fields are added without removing old ones, and clients ignore what they don't know. Deprecation windows last years because installed clients are slow to update. It is hard because a registry serves clients released over a decade, and a mistaken change breaks installs everywhere at once.",
    k: ["Additive evolution with unknown-field tolerance versus explicit versioned endpoints: additive keeps one surface, while versioned endpoints allow clean breaks at the price of running several.", "Long support windows versus forcing upgrades: protects old tools, but the registry carries legacy code forever."],
    p: ["A client that rejects unknown fields fails when the registry adds a harmless field.", "Removing a legacy endpoint breaks build systems that nobody has touched in years."],
    v: "Replay recorded requests from clients of several past versions against the current registry; each receives a response it parses correctly, and unknown request versions are answered with a clear, documented error.",
    dep: ["registry-metadata-api"]
  },
  "publish-protocol": {
    s: "The write interface that accepts an archive and its metadata, validates them and either records a new immutable release or rejects it with a reason.",
    d: "The client uploads the archive and manifest-derived metadata with credentials. The registry checks authentication and permission, validates name, version and manifest, confirms the version does not already exist, verifies the declared hash, scans content and stores the archive. The release is then written to the index and caches are invalidated. Responses report the outcome and any warnings. It is hard because the steps must be atomic from a reader's view, and uploads can be large, interrupted or malicious.",
    k: ["Synchronous publish that returns after indexing versus asynchronous processing: synchronous gives immediate feedback, while asynchronous allows slower scanning but leaves a pending state to explain.", "Server-side validation of the whole manifest versus trusting client checks: server checks are mandatory for safety, but must track client behavior."],
    p: ["A retry after a timeout finds the version already present and the author cannot tell if the first upload succeeded.", "A crash between storing the archive and writing the index leaves an orphaned file or a missing release."],
    v: "Publish a test release, interrupt a second attempt mid-upload, and confirm: the first release is fully visible and downloadable, the second leaves no index entry, and republishing the same version is rejected.",
    dep: ["authentication-and-tokens","ownership-and-permissions","manifest-validation","registry-storage","package-index","abuse-prevention"]
  },
  "authentication-and-tokens": {
    s: "How publishers prove who they are: accounts with strong authentication and scoped, expiring tokens that automation can hold without the owner's password.",
    d: "People sign in with a password plus a second factor. For tools they create tokens limited to particular packages, actions such as publish only, and a short lifetime. The registry stores only hashes of tokens, supports revocation, and logs use. Automation can instead exchange a short-lived identity assertion for a token. It is hard because long-lived broad tokens leak through logs and configuration files, and a stolen publish token is a direct route to compromising every downstream user.",
    k: ["Scoped short-lived tokens versus long-lived account-wide ones: smaller blast radius, but more rotation work for maintainers.", "Mandatory second factor for maintainers of popular packages versus optional: much stronger against account takeover, but burdens volunteers and complicates recovery."],
    p: ["A token committed to a public repository is scraped and used to publish a malicious release within minutes.", "A recovery flow that bypasses the second factor lets attackers take over an account through email."],
    v: "Create a token limited to one package and the publish action; confirm it publishes that package, is refused for another package and for account changes, and stops working immediately after revocation.",
    dep: ["ownership-and-permissions","trusted-publishing"]
  },
  "ownership-and-permissions": {
    s: "The registry's record of which accounts may publish, yank or transfer each package, with roles, organization membership and rules for handing over abandoned names.",
    d: "Each package has owners with roles such as publisher or administrator, directly or through an organization. Changes to the owner list are logged and may require approval from existing owners. Transfers and name disputes follow a published policy. Permission checks run on every write. It is hard because ownership is both a security boundary and a social one: maintainers disappear, accounts are abandoned, and deciding who may take over a popular name affects thousands of dependents.",
    k: ["Individual owners versus organization-owned packages: individual ownership is simple, but organizations survive staff changes and can enforce policies.", "Strict transfer rules versus flexible takeover of abandoned packages: strict rules protect users from hijacking, while flexibility lets ecosystems recover from abandonment."],
    p: ["A departed maintainer remains an owner with a working token long after leaving.", "A transfer of an abandoned popular name hands a new party control of an installed base."],
    v: "Add an owner to a test package, publish with that owner, remove the owner, and confirm their previously valid token is refused; the audit log shows each change with actor and time.",
    dep: ["authentication-and-tokens","package-identity"]
  },
  "immutability-and-unpublish": {
    s: "The rule that a published version's contents never change and a name-version pair is never reused, with a narrow, controlled process for removing content.",
    d: "Once accepted, a release's archive and hash stay fixed. Corrections require a new version. Removal is limited to legal or safety cases, or short windows after publication, and leaves a tombstone so the version number cannot be reused with different content. Dependents' lockfiles rely on this. It is hard because deleting a package that many others depend on breaks every build, while keeping malicious or legally problematic content is also unacceptable.",
    k: ["Strict immutability versus allowing deletion: immutability keeps every lockfile valid, while deletion lets authors correct mistakes at the cost of broken installs.", "Tombstones preventing reuse versus freeing names: tombstones block substitution attacks, but permanently consume version numbers."],
    p: ["An author deletes a tiny package and thousands of dependent builds fail at once.", "A removed version number is republished with different content and lockfile hashes no longer match."],
    v: "Publish a version, remove it through the permitted process, and try to publish different content under the same version; the registry refuses, and a lockfile with the original hash fails with a clear message instead of installing something else.",
    dep: ["registry-storage","package-index","integrity-hashes"]
  },
  "yanking-and-deprecation": {
    s: "Two soft ways to discourage a release: yanking hides it from new resolutions while keeping it downloadable for existing lockfiles, and deprecation attaches a warning message.",
    d: "A yank sets a flag on a version in the index. The resolver skips yanked versions unless a lockfile already pins one, so existing installs keep working while new ones avoid it. Deprecation adds a message shown at install time, often naming a replacement, without changing selection. Both are reversible and recorded in metadata. It is hard because the flag must propagate through caches and mirrors quickly, and because users ignore warnings that appear on every install.",
    k: ["Yank keeping content available versus delete: existing builds stay reproducible, but a malicious yanked file remains downloadable to those who pinned it.", "Warning at install time versus only on the package page: install-time warnings reach users who matter, but repeated noise trains them to ignore it."],
    p: ["A mirror serves a stale index without the yank flag and clients keep resolving the bad version.", "A deprecation message appears for every transitive dependency and people silence all warnings."],
    v: "Yank a test version and run a fresh resolution; it picks another version. A project locked to the yanked version still installs it with a visible notice, and a stale-mirror run shows how long the flag takes to reach clients.",
    dep: ["package-index","version-selection-heuristics","lockfile"]
  },
  "registry-storage": {
    s: "The durable store for every archive and metadata file ever accepted, with replication, integrity checking and a plan for growth that never stops.",
    d: "Archives live in replicated object storage keyed by name, version and hash. Metadata and index data live in a database or files derived from them. Backups, cross-region replication and periodic integrity scrubs protect against loss and corruption. Storage only grows, since releases are immutable, so deduplicating identical files and compressing archives matter at scale. It is hard because loss is irreversible for the ecosystem, and a bad write can corrupt a version permanently.",
    k: ["Object storage plus a separate metadata database versus everything in one store: separation lets each scale independently, but they must be kept consistent.", "Storing original uploads untouched versus re-compressing: originals preserve hashes exactly, while recompression saves space but changes bytes."],
    p: ["A bucket misconfiguration allows deletion of archives by a leaked key.", "Silent corruption in one replica is served to a fraction of downloads until a scrub finds it."],
    v: "Run a scrub that recomputes the hash of a sample of stored archives and compares each against its index record; every one matches, and a deliberately corrupted test object is detected and repaired from a replica.",
    dep: ["integrity-hashes"]
  },
  "search-ranking": {
    s: "Builds the searchable index from package metadata and scores results using text relevance, popularity, recency and quality signals.",
    d: "A pipeline consumes release events, extracts names, descriptions, keywords and readme text, and updates a full-text index. Scoring combines text match with download counts, dependents, maintenance recency and flags such as deprecated. Spam and typosquats are demoted or removed. Index updates are asynchronous and idempotent. It is hard because popularity signals are manipulable, because new good packages need exposure, and because ranking changes can redirect millions of installs.",
    k: ["Popularity-weighted ranking versus pure text relevance: popularity surfaces trusted packages, but entrenches incumbents and rewards inflated downloads.", "Near-real-time indexing versus batch rebuilds: fresh results, but more complexity and load."],
    p: ["Inflated download counts push a low-quality or malicious package to the top of results.", "A deprecated package outranks its replacement because its history is longer."],
    v: "Publish a new package and its replacement-marked predecessor, query by keyword, and confirm both appear, the deprecated one is flagged or lower ranked, and index lag stays within the documented bound.",
    dep: ["package-index","abuse-prevention"]
  },
  "abuse-prevention": {
    s: "Defenses against malicious or abusive uploads: name squatting, typosquats, malware, spam, resource exhaustion and account takeover.",
    d: "Layers include rate limits on signup and publish, reserved and similar-name checks, automated scanning of uploads for known malicious patterns and suspicious install scripts, size limits, reporting channels and a staff process for takedown. Signals such as sudden new install scripts or ownership changes trigger review. Quarantine can hold suspicious releases. It is hard because attackers adapt quickly and speed matters: a malicious release can be installed thousands of times in an hour, while false positives block legitimate authors.",
    k: ["Blocking at publish time versus removing after the fact: blocking protects users first, but delays honest authors and invites evasion.", "Automated scanning versus human review: scanning scales to every upload, while human review catches subtle cases at far lower volume."],
    p: ["A typosquat of a popular name collects installs for days because the similarity check only considered one edit distance.", "A scanner flags a legitimate native build step as malware and blocks an important release."],
    v: "Attempt to publish names one character from a popular package, an archive with a known test signature, and a burst of rapid uploads on a test registry; each is blocked or quarantined and logged.",
    dep: ["publish-protocol","package-identity","install-scripts"]
  },
  "integrity-hashes": {
    s: "Cryptographic digests of every archive, recorded in metadata and the lockfile, that the client verifies after download to confirm the bytes are exactly those expected.",
    d: "Each release has a digest computed with a collision-resistant hash. The registry publishes it, the resolver copies it into the lockfile, and the downloader checks every fetched archive against it before accepting. Strings carry an algorithm prefix so the algorithm can change. Hashes catch corruption, tampering by mirrors and substitution after the lockfile was written. It is hard because a hash proves sameness, not trustworthiness: the first hash a client sees comes from the registry.",
    k: ["Hash recorded at first resolution versus only trusting the registry each time: the lockfile hash catches later substitution, but protects nothing against the first fetch.", "Algorithm-prefixed digests versus a fixed algorithm: allows migration when an algorithm weakens, but clients must support several."],
    p: ["A lockfile edited to drop the hashes turns off verification without any warning.", "A weak legacy digest remains accepted and an attacker produces a colliding archive."],
    v: "Alter one byte of a stored archive on a test mirror and install from a lockfile; the install aborts with a hash mismatch naming the package and expected and actual digests, and installs nothing from it.",
    dep: []
  },
  "package-signatures": {
    s: "Digital signatures over archives or metadata made by a publisher or registry key, letting clients verify who produced content independent of where it was fetched.",
    d: "A signer creates a signature with a private key over the archive digest or over the index. The client holds or fetches the corresponding public key and verifies before trusting the content. Signing the index protects against mirrors and CDNs, signing releases protects against registry compromise. Detached signatures travel as separate files. It is hard because everything depends on key management: who holds keys, how clients learn them, and what happens when one is lost.",
    k: ["Registry signs the index versus publishers sign releases: registry signing is simple and covers everything, while publisher signing survives a registry compromise but needs identity infrastructure.", "Detached signatures versus embedded: detached files leave archives unchanged, but require two downloads and care to keep them together."],
    p: ["Clients skip verification when no signature is found, so stripping it defeats the check.", "A private key kept on a build server is stolen and used to sign malicious releases that verify perfectly."],
    v: "Install a release whose signature was made with a revoked or unknown key and confirm the client refuses it; a correctly signed release installs and the client reports the key identity it verified.",
    dep: ["integrity-hashes","key-distribution"]
  },
  "key-distribution": {
    s: "How clients learn which public keys to trust, and how those keys are rotated or revoked: pinned roots, delegated keys with thresholds and expiry.",
    d: "A client ships with, or first fetches, a small set of root keys. Roots delegate to keys for specific roles, such as signing the index or specific packages, with expiry times and thresholds requiring several signatures. Rotation publishes a new key signed by the old. Revocation lists let clients drop compromised keys. It is hard because a client that has been offline for long may hold expired keys, and because recovery from a root compromise needs a trust path that does not depend on the compromised root.",
    k: ["Threshold signatures from several people versus a single key: much harder to compromise, but operationally heavy.", "Short key expiry versus long: limits the window of a stolen key, but requires reliable refresh or clients stop working."],
    p: ["Clients with stale metadata cannot verify new keys and fail closed, blocking installs until updated.", "A root key stored on one laptop is lost, leaving no safe way to rotate."],
    v: "Rotate a delegated test key and confirm a client with the old trust state accepts the new key through the chain, then revoke the old one and confirm releases signed with it are rejected.",
    dep: ["package-signatures","transparency-log"]
  },
  "transparency-log": {
    s: "An append-only, publicly auditable log of signatures or releases, so anyone can detect if the registry or a key issued something it should not have.",
    d: "Every signed statement, such as a release's hash or a certificate, is appended to a Merkle tree log. The log returns an inclusion proof, and clients check it. Independent monitors watch the log and alert owners to entries they did not make. Consistency proofs show the log never rewrote history. It is hard because it only detects problems after the fact, depends on watchers actually looking, and adds a service that must stay available for installs.",
    k: ["Requiring log inclusion for trust versus optional: required inclusion prevents secret substitution, but ties installs to the log's availability.", "A public log versus a registry-private audit trail: a public log is checkable by anyone, but reveals metadata about every release."],
    p: ["Nobody monitors the log, so a malicious entry is present and visible for months without detection.", "An unreachable log blocks installs or, if clients fail open, silently removes the protection."],
    v: "Publish a test release, fetch its inclusion proof, and verify it against the log's current root with an independent tool; then ask for a consistency proof between two roots and confirm it checks.",
    dep: ["integrity-hashes","key-distribution"]
  },
  "provenance-attestations": {
    s: "Signed statements describing how and where an artifact was built: source repository, revision, build workflow and inputs, which consumers can verify against policy.",
    d: "The build system produces an attestation naming the source commit, the build definition and the output hash, signs it with an identity bound to the build environment, and uploads it beside the release. Clients or policy tools check that the artifact's hash matches the attestation and that the source and workflow are expected. It is hard because provenance proves where a build ran, not that the source is benign, and because verification policy has to be written and maintained.",
    k: ["Attesting builds versus signing artifacts only: attestation links code to source and process, while plain signatures only show a key holder approved the file.", "Enforcing provenance at install versus only recording it: enforcement blocks unattested releases, but most existing packages have none."],
    p: ["Attestations are published but nobody checks them, so a release built elsewhere installs unchallenged.", "A policy trusting any workflow in a repository accepts a malicious pull-request workflow."],
    v: "Fetch a release and its attestation, recompute the archive hash, and verify the attestation's subject matches; then confirm the stated source repository and commit exist and the build workflow named is the one the policy allows.",
    dep: ["integrity-hashes","package-signatures","trusted-publishing","transparency-log"]
  },
  "trusted-publishing": {
    s: "Lets an automated build publish using a short-lived identity token issued to a specific repository and workflow, with no stored long-lived registry credential.",
    d: "The maintainer registers with the registry that a given repository and workflow may publish a package. At publish time the build platform issues a signed identity token naming that repository and workflow, the registry verifies it against the registration and issues a short-lived publish token. Nothing secret is stored in the repository. Provenance can be attached automatically. It is hard because the trust now sits in the build platform and in precise claim matching.",
    k: ["Identity-token exchange versus stored secrets in CI: no leaked credentials to steal, but dependence on the identity provider's claims.", "Matching repository only versus repository plus workflow and environment: narrower matching limits which jobs can publish, at the cost of configuration to keep current."],
    p: ["A registration that matches only the repository lets any workflow in it, including one from a fork-triggered job, publish.", "A repository transferred or renamed keeps a registration that now matches a stranger's repository."],
    v: "Configure a test registration, run a workflow that exchanges its identity token and publishes, and confirm success; run the same publish from a different workflow and confirm the exchange is rejected.",
    dep: ["authentication-and-tokens","publish-protocol"]
  },
  "advisory-database": {
    s: "A curated collection of known vulnerabilities and malicious packages, each mapped to affected name and version ranges and fixed versions, published for tools to consume.",
    d: "Reports from researchers and maintainers are reviewed, assigned identifiers, and recorded with affected ranges, severity, fixed versions and references. The database is exposed through an API or downloadable files, so audit tools can match it against lockfiles locally or through the registry. It is hard because ranges must be accurate, because the same flaw has several identifiers and sources, and because severity depends on how the vulnerable function is used.",
    k: ["Ranges expressed in the ecosystem's own version order versus free text: machine matching is exact, but authors must get ranges right.", "Central registry database versus federated sources: one source is consistent, while several give more coverage and conflicting answers."],
    p: ["An advisory with a wrong upper bound flags a safe version or misses a vulnerable one.", "A flood of low-severity advisories in transitive dependencies trains teams to ignore the report."],
    v: "Add a test advisory for a version range and run audit on a lockfile containing a package inside and another outside the range; only the vulnerable one is reported, with the fixed version listed.",
    dep: ["version-constraints","package-index"]
  },
  "audit-command": {
    s: "Matches the locked dependency tree against advisories and reports vulnerable and malicious packages, their paths from the root and the upgrades that would fix them.",
    d: "The command reads the lockfile, sends package names and versions to the registry's advisory endpoint or consults a local copy, and prints findings with severity, the dependency path that brought each in and the lowest fixed version. Options set a failure threshold for CI and may apply fixes automatically by upgrading or overriding. It is hard because transitive findings often have no direct fix, because the vulnerable code may never be reached, and because sending a full dependency list to a server leaks information.",
    k: ["Server-side matching versus local database: server matching is always current, while a local copy keeps the dependency list private and works offline.", "Failing builds on any advisory versus a severity threshold: strictness maximizes safety, but blocks releases over issues unrelated to how the code runs."],
    p: ["Audit reports a vulnerability whose only fix is a major upgrade of an unrelated package and teams suppress the whole check.", "Automatic fix mode upgrades a dependency across a breaking version boundary."],
    v: "Run audit on a lockfile with a known vulnerable transitive package; the report names the advisory, shows the path from the root and the fixed version, and exits nonzero at the configured threshold.",
    dep: ["advisory-database","lockfile","dependency-graph","dependency-overrides"]
  },
});
