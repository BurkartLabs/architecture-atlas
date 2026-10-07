// Details for the artifact repository plate, part 2: repository model and metadata.
ATLAS.details("artifact-repository", {
  "hosted-repository": {
    s: "A repository that stores what your own builds publish: the authoritative copy of internal artifacts, with write access controlled and content kept until policy removes it.",
    d: "Clients upload to it and download from it by path. It holds the only copy of internal packages, so it is backed up and replicated and its deletion rules are conservative. Settings fix its format, layout, whether released versions may be overwritten and which retention rules apply. Teams usually split hosted repositories by stage, for example snapshots, candidates and releases, because the policies differ. The difficulty is that it is a source of truth: losing it loses software that cannot be rebuilt from anywhere else.",
    k: ["Separate repositories per stage vs one repository with status properties: separate repositories give clear permissions and policies, at the price of copying or moving files on promotion.", "Overwrite allowed vs forbidden: allowing it suits development builds, but it breaks the guarantee that a version names one content."],
    p: ["Using one hosted repository for development and release lets a developer's overwrite replace a shipped version.", "Leaving it out of backups because the build can recreate it, when old versions no longer build."],
    v: "Publish a version, restore the repository from backup into a clean instance, and confirm the artifact downloads with the same digest. Attempt to overwrite a release version and confirm it is refused.",
    dep: ["repository-config","node-tree","blob-store-abstraction","overwrite-policy"]
  },
  "proxy-repository": {
    s: "A repository that fetches artifacts from a remote source on first request, stores them locally, and serves later requests from that cache.",
    d: "On a miss it requests the file from the configured remote, streams it to the client while writing it to storage, verifies available checksums, and records the node. Later requests are served locally even when the remote is down. Indexes are cached for a short time and refreshed, so new versions appear after the cache expires. It reduces external traffic and shields builds from outages, and it is the main place external content enters the company, which makes it a security boundary as well as a cache.",
    k: ["Cache indefinitely vs expire and revalidate: indefinite caching guarantees reproducibility if the source disappears, while revalidation picks up corrections and removals.", "Streaming to client while caching vs completing the fetch first: streaming lowers latency, but a failed fetch must discard a partial file safely."],
    p: ["A cached partial file from an interrupted fetch is served to later clients as if complete.", "Upstream deletion of a malicious package leaves a cached copy that continues to be served."],
    v: "Request an artifact never seen before, confirm it is fetched and cached, block the network to the remote, request it again and confirm it is served locally with an identical digest.",
    dep: ["repository-config","upstream-routing","remote-credentials","negative-cache","content-addressed-store"]
  },
  "virtual-repository": {
    s: "An aggregate address that resolves a request across an ordered list of hosted and proxy repositories, so clients need one URL for everything.",
    d: "A request is tried against each member in priority order, and the first match is returned. Index files are merged from members. Clients configure only the virtual address, while administrators change membership without touching any client. It is also where precedence is decided: if an internal and a public repository both contain a name, order determines which wins. That makes it the main defense against, or the main cause of, dependency confusion, and it is hard because merged indexes must stay consistent with what a lookup would return.",
    k: ["Internal members first vs public first: internal first protects private names, but slows every request for public ones by trying internal sources before the cache.", "Merged indexes vs redirecting to the first member: merging presents every version, while redirecting is simpler and hides versions from lower-priority members."],
    p: ["Listing a public proxy ahead of the internal repository lets an attacker publish a higher version of an internal name.", "Index merging that drops a member's versions makes resolution succeed on a different version than a direct lookup."],
    v: "Put the same name in an internal and a public member and confirm the client receives the internal one. Change the order and confirm the answer changes, with the access log showing which member served it.",
    dep: ["hosted-repository","proxy-repository","upstream-routing","index-generator"]
  },
  "repository-config": {
    s: "The stored definition of a repository: its format, kind, layout, policies, members, remotes, retention and who may use it.",
    d: "Configuration is held as records the whole cluster reads, and many fields take effect immediately. It includes the format adapter, the layout, snapshot and release handling, overwrite rules, proxy remote and cache periods, virtual membership, and links to permission and retention rules. Teams keep it as code so repositories can be recreated. Changes are dangerous because they apply to existing data: switching a layout or a policy retroactively changes what clients see and what cleanup may delete.",
    k: ["Configuration as code applied by automation vs edited in the console: code is reviewable and reproducible, but requires the discipline to stop manual edits.", "Immutable repository kind and format vs editable: fixing them avoids impossible states, at the price of creating a new repository to migrate."],
    p: ["Changing a retention or layout setting on a populated repository can immediately delete or hide content.", "Configuration edited by hand on one site and not another leaves replicas behaving differently."],
    v: "Export the configuration of a repository, recreate it on an empty instance from the export, publish the same artifact and confirm identical behavior. Change a setting and confirm the audit log records who and when.",
    dep: ["metadata-database","audit-log","permission-targets"]
  },
  "layout-mapping": {
    s: "Rules that translate between the paths clients use and the paths the repository stores, and between layouts when a proxy fronts a source that uses another convention.",
    d: "Each format has a standard layout, such as group, name and version directories. A layout defines how to extract coordinates from a path and how to build a path from coordinates. Mapping handles legacy layouts, case differences and proxies of sources with unconventional trees. Layouts also let policy refer to fields instead of strings, so a rule can say the version is a release. Difficulty comes from ambiguity: a path may parse more than one way, and a bad mapping creates artifacts clients cannot find.",
    k: ["Parse coordinates from the path vs read them from the manifest: paths are available without opening the file, but can disagree with the content.", "Normalizing stored paths vs preserving what the client sent: normalizing prevents duplicates, while preserving keeps byte-identical behavior for legacy clients."],
    p: ["A layout that parses a path differently from the client stores the file where its own lookups can never find it.", "Case-insensitive duplicates created because two uploads differed only by capitalization."],
    v: "Upload a file by its standard path, then request it by the coordinates a client would compute, and confirm they hit the same node. Upload a path that violates the layout and confirm a clear rejection.",
    dep: ["coordinate-parser","repository-config"]
  },
  "version-policy": {
    s: "Rules for how a repository treats released and in-progress versions: whether a version may be republished, how snapshot builds are numbered and which ones are kept.",
    d: "Release versions are meant to be final. Snapshot or pre-release versions are expected to change, often with a timestamp or build number appended to each upload and a pointer to the latest. The policy decides which of these a repository accepts, whether a pointer is rewritten and how many builds to retain. It protects consumers by keeping the difference clear. It is hard because naming conventions vary between ecosystems, and because users blur the line, publishing a pre-release as if final.",
    k: ["Separate repositories for snapshots and releases vs a policy within one: separation makes the rule visible at the URL, but requires the client to know which one to ask.", "Rewriting a latest pointer vs creating a new version each time: a pointer is convenient but mutable; unique versions are traceable and need cleanup."],
    p: ["Accepting a release version twice with different bytes, so two builds both claim to be 1.4.0.", "Snapshot builds retained forever because nothing was set to expire them."],
    v: "Publish a release, publish it again with different bytes and confirm refusal. Publish ten snapshots and confirm the latest pointer resolves to the newest and older ones are removed after the configured count.",
    dep: ["repository-config","overwrite-policy","version-ordering"]
  },
  "upstream-routing": {
    s: "Rules deciding which remote source or member repository a request goes to, by name pattern, so internal names never reach public sources and public names are cached.",
    d: "A rule matches a path or package name by pattern and says which proxy or hosted repository may serve it. For example, everything under the company's own prefix is served only from internal repositories, and everything else may come from public proxies. Rules are evaluated before any remote request is made. They are the practical implementation of dependency confusion protection and of mirror-only builds. They are hard to maintain because the set of names is large and changes, and a rule that is too broad blocks legitimate dependencies.",
    k: ["Allow-list of names per source vs ordering alone: explicit rules prevent a wrong-source answer entirely, but need upkeep as new internal names appear.", "Blocking at the repository vs trusting client configuration: server-side rules protect all clients, while client rules can be bypassed or forgotten."],
    p: ["An internal package name not covered by any rule is requested from the public source, and whatever is there gets served.", "Patterns that overlap give different results depending on evaluation order nobody documented."],
    v: "Request an internal name through the virtual repository while the public source holds a package with the same name, and confirm from the access log that the public source was never contacted.",
    dep: ["proxy-repository","repository-config","dependency-confusion-guard"]
  },
  "negative-cache": {
    s: "Remembers for a short time that a remote source did not have a requested file, so repeated lookups for missing items do not each hit the remote.",
    d: "Build tools often ask for files that do not exist, such as optional metadata or versions tried in sequence. Each miss would otherwise travel to the remote and wait for a response. The proxy stores a not-found marker with a time limit and answers from it. This saves large amounts of traffic and shields a remote from stampedes. The hard part is expiry: too long, and a newly published version stays invisible; too short, and the saving disappears, and negative entries must be dropped when a local publish creates the path.",
    k: ["Longer negative lifetime vs shorter: longer cuts remote load but delays seeing a fresh release; shorter is more current and chattier.", "Caching all failures vs only definite not-found: caching errors hides outages from clients but masks transient faults as permanent absence."],
    p: ["Caching a timeout as not-found makes an available artifact appear missing for the whole lifetime of the entry.", "A new internal publish that does not clear a negative entry stays invisible until it expires."],
    v: "Request a missing path twice and confirm only one remote request in the log. Publish that path locally and confirm the next request succeeds immediately rather than after the entry expires.",
    dep: ["proxy-repository","metadata-cache"]
  },
  "remote-credentials": {
    s: "The stored identities and settings a proxy repository uses when contacting upstream sources: tokens, client certificates, proxies and trust anchors.",
    d: "Many upstream sources need authentication or sit behind a corporate network proxy. The repository holds credentials encrypted, presents them only to that remote, and never passes them to clients. It also holds the trust configuration needed to verify the remote's certificate. Rotation is the operational issue: expired or revoked credentials turn into build failures far from the cause, and stored secrets are a high-value target, so how they are encrypted and who can read them matters.",
    k: ["Encrypted at rest with a managed key vs plain configuration: encryption limits damage from a leaked backup, but adds key management and a startup dependency.", "One shared identity for all proxy traffic vs per-team identities: one is simple and attributes all requests to the repository, while per-team gives upstream accounting and revocation granularity."],
    p: ["An expired upstream credential makes proxies return errors only for uncached files, so the failure appears intermittent.", "Credentials copied into repository exports or support bundles leak outside the system."],
    v: "Point a proxy at a source requiring authentication, request an uncached file and confirm success. Revoke the credential and confirm a clear error in the log while cached files keep serving.",
    dep: ["proxy-repository","configuration-system"]
  },
  "coordinate-parser": {
    s: "Extracts an artifact's identity, such as namespace, name, version and classifier, from its path or filename according to the format's rules.",
    d: "Every format identifies a package differently, and policy, search, promotion and retention all need that identity as fields rather than strings. The parser applies the layout's pattern to a path and returns structured coordinates, or fails when the path does not fit. It runs on upload and on proxy cache fill. Complexity comes from historical exceptions: separators that can appear inside names, version strings that are not numeric, and sidecar files that share a name but are not packages.",
    k: ["Strict parsing that rejects unknown shapes vs permissive parsing: strict keeps the data clean, but turns an unusual yet valid file into an upload error.", "Parse once and store fields vs parse on every query: stored fields are fast and consistent, but need a migration when parsing rules change."],
    p: ["A parser that splits a name at the wrong hyphen records the wrong version, so version-based retention deletes the wrong files.", "Sidecar files treated as packages inflate counts and trigger policy actions meant for real packages."],
    v: "Feed a set of real paths from the format, including awkward names with hyphens and pre-release suffixes, and confirm the extracted fields equal what the format's own client reports for each.",
    dep: ["layout-mapping"]
  },
  "manifest-parser": {
    s: "Reads the metadata inside an uploaded package, such as its declared dependencies, license, description and entry points, and records it for policy and search.",
    d: "On upload the repository opens the archive or manifest document, extracts the fields it needs and stores them as properties or relationships. Those feed the dependency graph, license policy, search and index generation. It must read untrusted files safely: archives can be crafted to expand enormously, to contain paths that escape their directory, or to carry manifests that disagree with the filename. Format drift is the maintenance burden, because manifest versions keep adding fields.",
    k: ["Parse at upload time vs lazily on first need: upload-time costs every publish but makes later queries instant; lazy defers work and can fail late.", "Trust the manifest vs trust the path: a manifest is authoritative for the format's own clients, but may contradict coordinates and needs a defined winner."],
    p: ["A crafted archive that expands to many gigabytes exhausts memory in the parser on upload.", "Declared dependencies that differ from what the package actually needs make the dependency graph wrong in a way no one notices."],
    v: "Upload a package with a known dependency list and license, query the stored metadata, and confirm each field matches the manifest. Upload a deliberately oversized archive and confirm it is rejected without exhausting memory.",
    dep: ["coordinate-parser","metadata-database"]
  },
  "index-generator": {
    s: "Builds the index files clients download to resolve names and versions, and rebuilds them when artifacts are added, removed or changed.",
    d: "Indexes are derived data: a list of versions per package, or a catalog of every package in a repository, in the exact syntax of the format. They are generated from the metadata store after a change, sometimes immediately, sometimes batched, and written atomically so a client never reads a partial file. For virtual repositories they are merged from members. The hard parts are cost on large repositories, correctness when changes arrive concurrently, and getting byte-level details right, since many clients reject an index that is merely close.",
    k: ["Regenerate on every change vs batched asynchronous rebuild: immediate keeps clients current, while batching bounds cost but opens a window where an artifact exists and is not indexed.", "Incremental updates vs full rebuild: incremental is fast and can drift; periodic full rebuilds repair drift at a cost."],
    p: ["Two concurrent uploads each rebuild from the old state, and one version vanishes from the index.", "A rebuild written non-atomically lets a client read a half-written index and fail with a parse error."],
    v: "Publish ten versions concurrently, then fetch the index with a real client and confirm all ten are listed. Delete one and confirm the next index fetch no longer lists it.",
    dep: ["metadata-database","checksum-sidecars","version-ordering","transaction-model"]
  },
  "checksum-sidecars": {
    s: "Digest files stored next to artifacts, which clients download to verify integrity, generated and kept consistent with the content they describe.",
    d: "Some formats expect a separate file for each digest algorithm alongside every artifact, and index files embed digests of their own. The repository generates these at upload, serves them like any file and verifies client-supplied ones against its own. Because a digest file names its target by convention, it must be created, moved, copied and deleted together with the artifact. Trouble arises with several algorithms, with proxies that must pass through the remote's digests unchanged, and with files replaced without their digests.",
    k: ["Compute digests on the server vs trust uploaded ones: server computation is authoritative, while uploaded values catch transport corruption but are only as good as the client.", "Generate all algorithms vs only the strongest: all supports old clients, while only the strongest avoids maintaining weak digests."],
    p: ["Overwriting an artifact without refreshing its digest file makes every client's verification fail.", "Serving a proxy's own computed digest in place of the remote's hides tampering that the remote's digest would reveal."],
    v: "Upload an artifact, fetch it and its digest file, recompute the digest locally and confirm all agree. Corrupt the stored bytes in a test instance and confirm verification fails.",
    dep: ["integrity-verification","node-tree","content-addressed-store"]
  },
  "index-signing": {
    s: "Cryptographically signs the metadata clients rely on, using keys held by the repository or the publisher, so tampering with an index is detectable.",
    d: "Signature covers an index or a manifest that lists digests, so verifying one signature verifies everything beneath it. Keys may sit on the server for automatic signing, or be supplied by the publisher and verified on upload. Clients trust a public key, usually fetched out of band. Key hygiene is the hard part: protecting the signing key, rotating without breaking installed clients, expiring signatures so stale indexes cannot be replayed, and handling the moment when a key must be revoked.",
    k: ["Server-held signing key vs publisher-held keys: server-held automates signing for every format and concentrates risk; publisher keys give stronger provenance and need distribution.", "Short signature expiry vs long: short expiry limits replay of old indexes, but breaks clients whenever regeneration stops."],
    p: ["A signing key stored unprotected on the server lets anyone who compromises it sign malicious indexes.", "Rotation without overlap leaves existing clients rejecting every new index."],
    v: "Fetch a signed index, verify it with the published public key, then alter one byte and confirm verification fails. Rotate the key with overlap and confirm both old and new clients still verify.",
    dep: ["index-generator","configuration-system"]
  },
  "version-ordering": {
    s: "Compares version strings according to each format's rules, to decide which is newest, which satisfy a range and which a pointer such as latest should name.",
    d: "Versions look alike across formats and compare differently: numeric parts, pre-release tags, build metadata, epochs, letters. The repository needs ordering to pick latest, to sort indexes, to apply retention such as keep the newest ten and to evaluate promotion rules. It implements each format's rules rather than one general rule. Mistakes are subtle: an index sorted wrongly may serve a pre-release as latest, and retention built on the wrong order deletes the newest builds.",
    k: ["Implement each format's comparison vs one generic comparator: per-format is correct but a larger surface; generic is simple and wrong for some real versions.", "Order by version vs by upload time: version order matches what clients expect, but time order matches what retention usually means."],
    p: ["Treating 1.10 as lower than 1.9 by string comparison and serving the older release as latest.", "Retention keeping the newest by version while a hotfix with a lower number is deleted as old."],
    v: "Feed a list of real version strings including pre-releases and compare the computed order to the format's own client, confirming identical ordering for every pair in the list.",
    dep: ["coordinate-parser"]
  },
  "tag-index": {
    s: "Maps human-friendly mutable labels such as latest or stable to the specific versions or digests they currently point to, and records how they have moved.",
    d: "Container images and several package formats let a label point to a version, and the owner may move it. The repository stores the label-to-target mapping, serves the lookup to clients, and ideally records each change with who made it and when. That history is what allows an audit of what a deployment pulled at a given time. The difficulty is that labels are mutable by design, so the same name yields different content over time, and clients that cache the answer or deploy by label inherit that uncertainty.",
    k: ["Recording tag history vs only the current target: history supports audit and rollback, at the cost of storage and a retention rule of its own.", "Allowing any writer to move a tag vs restricting it: restriction protects release labels, but means pipelines need explicit permission."],
    p: ["A deployment configured by label silently picks up new content because the label was moved.", "Without tag history, nobody can say which image a past outage was actually running."],
    v: "Point a tag at one digest, move it to another, and confirm the repository returns the new target while the history lists both with actor and time. Attempt a move without permission and confirm refusal.",
    dep: ["metadata-database","audit-log","mutable-tag-handling"]
  },
  "provenance-records": {
    s: "Signed statements attached to an artifact saying who built it, from which source, on which builder and with which steps, so consumers can verify origin.",
    d: "A provenance statement names the artifact by digest, the source revision, the build definition and the builder identity, and is signed. The repository stores it as an attachment, links it to the digest and makes it available to policy and clients. Consumers check it before deploying: was this built by the trusted pipeline from the expected repository. It is hard because the statement is only as trustworthy as the builder that made it, and verification needs a chain of trusted keys and an agreed policy of what counts as acceptable.",
    k: ["Verify at publish vs at download vs at deploy: verifying at publish blocks bad artifacts early, but only deployment-time checks see the policy a consumer actually cares about.", "Attach to the digest vs to the path: digest attachment survives promotion and copying; path attachment is simpler and breaks on move."],
    p: ["Accepting any signature as proof of provenance, without checking it came from the trusted builder identity.", "Statements lost when an artifact is promoted by copy rather than by reference."],
    v: "Publish an artifact with a signed statement, run a verification that requires a specific builder identity, and confirm it passes. Re-sign with a different identity and confirm the policy rejects it.",
    dep: ["signature-verification","metadata-database","build-info"]
  },
});
