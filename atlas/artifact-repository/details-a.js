// Details for the artifact repository plate, part 1: clients and interfaces.
ATLAS.details("artifact-repository", {
  "format-adapters": {
    s: "Pluggable modules that each implement one package ecosystem's URL layout, index files and upload rules on top of the repository's shared storage and metadata model.",
    d: "An adapter maps an ecosystem's requests to generic operations: store a blob, create a node at a path, read properties, list a folder. It also owns the format's rules, such as which files are required, how names are normalized and which indexes must be regenerated after a change. The core handles storage, permissions and replication once for every format. The difficulty is that ecosystems disagree about what an upload is, so the shared model has to be loose enough for all of them yet strict enough to enforce policy.",
    k: ["One adapter per format over a shared core vs a separate stack per format: new formats are cheap and policy applies uniformly; format quirks that do not fit the model need escape hatches.", "Strict validation on upload vs accept-and-store: strict rejects malformed packages early but breaks clients that rely on lenient servers."],
    p: ["A format adapter that normalizes names differently from the client makes a published package unfindable by the name its author typed.", "Adding a format without its index regeneration leaves uploads visible by path but invisible to resolvers."],
    v: "Publish a package with a real client of one format, then resolve and install it from a clean machine using only the repository URL, and confirm the installed content matches the published digest.",
    dep: ["blob-store-abstraction","node-tree","index-generator"]
  },
  "container-registry-api": {
    s: "The HTTP interface through which container runtimes push and pull image layers, manifests and tags, including the token challenge, cross-repository blob mounts and manifest lists.",
    d: "Clients first request a token from the challenge advertised by the server, then upload layers as blobs by digest, and finally put a manifest that references them. Pulls fetch the manifest, then each layer. Layers are shared across images, so the registry stores them once and lets one repository mount a layer from another without copying. Tags are mutable pointers to manifests, while manifests are addressed by digest. Hard parts are large concurrent uploads, resumable sessions that expire, and keeping tags, manifests and layers consistent when deletes race pushes.",
    k: ["Digest-addressed layers vs path-addressed files: layers deduplicate across images and verify themselves, but deletion needs reference tracking across every manifest.", "Mutable tags vs pinned digests: tags are convenient for humans and deployments that follow latest, but the same tag can mean different content tomorrow."],
    p: ["Deleting a manifest while a push is mid-flight can leave an image whose layers have been collected.", "A token lifetime shorter than a slow layer upload makes large pushes fail partway with an authorization error."],
    v: "Push a three-layer image, pull it from another host, and confirm every layer digest matches. Push a second image sharing a base and confirm the shared layer was not uploaded again.",
    dep: ["format-adapters","chunked-upload","content-addressed-store","access-tokens"]
  },
  "language-package-endpoint": {
    s: "The server side of programming-language package managers: serving per-package metadata, version indexes and archives, and accepting publishes with the format's own manifest rules.",
    d: "A resolver asks for the list of versions of a name, picks one by its constraint rules, then downloads an archive and its checksum. The endpoint serves these from generated index documents or per-version metadata files, and on publish validates the manifest, extracts fields such as dependencies and license, and updates the index. Some formats expect a flat path layout, others a JSON document per package. Hard parts are name normalization, yanked or deprecated versions that stay downloadable but hidden from resolution, and very large index files that every client re-reads.",
    k: ["Generated static indexes vs dynamic query responses: static files cache well and survive a database outage, but must be regenerated, atomically, after each change.", "Honoring yank flags vs deleting: yanked versions keep existing lockfiles working while steering new resolution away, at the cost of keeping the bytes forever."],
    p: ["A publish that updates the archive but fails to update the index leaves a version that exists yet never resolves.", "Case or separator differences in names create two packages that clients treat as one."],
    v: "Publish version 1.2.0, run the format's resolver against the repository and confirm it selects 1.2.0. Yank it, confirm new resolution skips it, and confirm a lockfile pinned to it still downloads.",
    dep: ["format-adapters","manifest-parser","index-generator","version-ordering"]
  },
  "system-package-endpoint": {
    s: "Serves operating-system package repositories: signed index files, package archives and release metadata organized by distribution, version, component and architecture.",
    d: "System package managers expect a fixed tree: a signed release file listing indexes, indexes listing packages with checksums, and archives under a pool. The endpoint stores uploaded packages, extracts control data, rebuilds the per-architecture indexes and signs the release file with a key the repository holds. Clients verify the signature chain before trusting any checksum. Difficulties are index rebuild cost on large repositories, key management for signing, and keeping the index consistent with the pool when many packages arrive at once.",
    k: ["Incremental index updates vs full rebuild: incremental is fast but can drift from the pool; a full rebuild is always correct but may take minutes on large repositories.", "Repository-held signing key vs signing at publish: a held key automates everything but makes the repository a high-value target."],
    p: ["Clients that fetch the index while it is half rewritten see checksum mismatches that vanish on retry.", "An expired or rotated signing key makes every client reject the repository at once."],
    v: "Add the repository to a clean machine with its public key, update its package list, install a published package, and confirm the signature check passes and the installed files match the archive.",
    dep: ["format-adapters","index-generator","index-signing","blob-store-abstraction"]
  },
  "generic-file-endpoint": {
    s: "A format-free repository that stores and serves arbitrary files at arbitrary paths, used for binaries, installers, models and anything with no package ecosystem.",
    d: "It is the plain case of the model: PUT a file to a path, GET it back, optionally attach properties, and list or delete by folder. Because nothing is parsed, the repository applies only generic checks: permissions, checksums, quota, retention. Teams use it for installers, data sets and build tools. The strength is flexibility, and the weakness is that nothing prevents inconsistent naming, so layout conventions must be enforced by policy or by the pipelines that publish.",
    k: ["Free-form paths vs enforced layout: free-form fits any file but invites chaos; enforced layout needs a pattern rule per repository and rejects unusual uploads.", "Checksum supplied by the client vs computed by the server: supplied checksums catch transport corruption, while server computation is authoritative but costs a full read."],
    p: ["Overwriting a path in place breaks anyone who cached it by name and leaves no way to find the previous content.", "Uploading without properties makes later retention and search rules unable to tell build output from release content."],
    v: "Upload a file with a known SHA-256, download it by path, and confirm the digest matches. Request an unauthorized path and confirm the response is a denial rather than the file.",
    dep: ["node-tree","blob-store-abstraction","permission-targets"]
  },
  "chunked-upload": {
    s: "Accepts large files as separate parts or resumable sessions so an interrupted transfer continues from the last confirmed byte instead of restarting.",
    d: "The client opens a session, sends numbered or offset-addressed parts, and finally commits, at which point the server assembles the parts, verifies the digest and creates the node. Parts live in temporary storage until commit. Sessions carry an expiry and an identity so only the creator can continue. The hard parts are cleaning abandoned sessions, handling two parts that overlap, and making commit atomic so a half-assembled file is never visible.",
    k: ["Server-side assembly vs client-declared manifest of parts: assembly hides complexity from clients but needs temporary space; a manifest lets storage assemble itself but exposes the protocol.", "Long-lived sessions vs short expiry: long sessions tolerate flaky links, but abandoned ones accumulate temporary data."],
    p: ["Abandoned sessions fill the staging area until uploads start failing for everyone.", "Committing without re-verifying the whole-file digest accepts a file assembled from the wrong parts."],
    v: "Upload a 5 GB file, kill the connection midway, resume, and confirm the final digest equals the original. List staging storage after commit and confirm no parts remain.",
    dep: ["upload-staging","integrity-verification","http-server"]
  },
  "range-requests": {
    s: "Support for partial downloads and conditional requests so clients can resume transfers, fetch pieces in parallel and avoid re-downloading unchanged files.",
    d: "The server honors byte ranges, returns validators such as a digest-based entity tag and a modification time, and answers conditional requests with a not-modified response. Because content is addressed by digest, the validator is cheap and stable. Index files change often and rely on this most. The hard part is making sure every layer in front, such as caches and edge proxies, preserves ranges and validators, and that a file replaced mid-download does not yield a response stitched from two versions.",
    k: ["Digest as entity tag vs timestamp: digests never lie about content, but computing or storing them for every path costs more than a modification time.", "Serving ranges from object storage directly vs through the server: direct is cheaper and faster, but bypasses audit logging and per-request authorization."],
    p: ["An intermediary that strips range support turns every resume into a full restart on slow links.", "A file overwritten between two range requests produces a client-visible file that matches neither version."],
    v: "Download half of a large file, resume with a range request, and confirm the result matches the digest. Repeat a conditional request with the returned tag and confirm a not-modified response with no body.",
    dep: ["http-server","content-addressed-store"]
  },
  "client-config-snippets": {
    s: "Generates ready-to-paste settings for each format's client, so users can point a build tool or runtime at the right repository URL with the right credentials.",
    d: "Given a repository and a format, the console or API produces the configuration text: the URL, the credential block, the mirror or registry setting, and any trusted-key instructions. For virtual repositories this is usually the only address clients need. The value is removing an entire class of misconfiguration, such as clients that bypass the proxy and reach public sources directly. It is hard to keep correct because client configuration syntax changes between client versions, and snippets must never embed long-lived secrets.",
    k: ["Generated per-repository snippets vs documentation: snippets are exact and always current, but require a template for each client version that is still in use.", "Embedding a token vs a placeholder: an embedded token is convenient but leaks into screenshots and tickets; a placeholder is safer and slower to use."],
    p: ["A snippet that omits the setting forcing all lookups through the repository silently lets clients fetch from public sources.", "Templates that lag a client release give users configuration that is accepted but ignored."],
    v: "Copy the generated snippet into a fresh client configuration with no other settings, run an install, and confirm from the access log that every request reached this repository and none went elsewhere.",
    dep: ["virtual-repository","access-tokens","format-adapters"]
  },
  "web-console": {
    s: "The browser interface for browsing repositories, inspecting artifacts and their properties, managing permissions and policies, and following builds.",
    d: "It is a front end over the management API: a tree of repositories and folders, a detail page per artifact showing digest, properties, download counts and scan results, and administration screens for repositories, users and policies. It adds little logic of its own; every action should be something the API can also do. Difficulties are listing very large folders without loading them all, showing permissions as an effective result rather than raw rules, and never exposing an action the user's role forbids.",
    k: ["Thin client over the public API vs privileged internal endpoints: a thin client keeps the API complete for automation, while internal endpoints ship features faster but split the contract.", "Lazy paged tree vs full load: paging scales to folders with millions of files but makes search within a folder a separate feature."],
    p: ["A folder with a million children loaded eagerly freezes both the browser and the database.", "Hiding a button without enforcing the check on the server leaves the action available to anyone who calls the API."],
    v: "Open a folder with a million files and confirm it renders within seconds in pages. Sign in as a read-only user and confirm both the missing controls and a refused direct API call for the same action.",
    dep: ["management-api","tree-browser","artifact-search"]
  },
  "management-api": {
    s: "The format-independent HTTP interface for everything an operator or script does to the repository: create repositories, query, copy, move, delete, set properties and manage users.",
    d: "Resources include repositories, nodes, properties, permission rules, tokens, builds and system settings, all as JSON over HTTP with the same authentication as clients. Bulk operations such as copy, move and delete are asynchronous or batched. A query language selects artifacts by property, path or age. It is the contract that automation depends on, so it must change carefully: every pipeline and policy script in the company calls it, often with assumptions about response shape that were never written down.",
    k: ["Versioned API with long support windows vs rapid iteration: stability protects automation but accumulates endpoints that must be maintained.", "Synchronous bulk operations vs background tasks with a status resource: synchronous is simple and times out; tasks survive long work but require polling and cleanup."],
    p: ["Changing a field's type or removing a default breaks pipelines that parse the response without validating it.", "A bulk delete with a mistyped path pattern removes far more than intended, because the API validates syntax and not intent."],
    v: "Create a repository, upload a file, set a property and query for it, all through the API alone with a token. Then run the same calls with a read-only token and confirm each write is refused.",
    dep: ["http-server","permission-targets","node-tree","metadata-database"]
  },
  "artifact-search": {
    s: "Finds artifacts by name, path, version or text across repositories, answering from an index rather than by walking storage.",
    d: "Names, paths, coordinates and extracted manifest text are indexed when an artifact is created and removed when it is deleted. Queries are filtered by what the caller may read before results are returned. Search powers the console, quick lookups and tooling. Hard parts are keeping the index in step with the database, ranking results sensibly for package names, and not leaking the existence of artifacts the caller cannot access through counts or suggestions.",
    k: ["Search engine index vs direct database queries: an index handles text and ranking and scales to large repositories, but can lag behind and needs rebuilding.", "Permission filtering at query time vs index time: query-time is always current but slower; index-time is fast but stale after permission changes."],
    p: ["An index that falls behind makes a just-published artifact appear missing and prompts duplicate uploads.", "Result counts or facets that include inaccessible artifacts reveal that a confidential package exists."],
    v: "Publish a new artifact and measure how long until search returns it. Search as a user without access to its repository and confirm it is absent from both results and result counts.",
    dep: ["search-index-store","permission-targets","metadata-database"]
  },
  "property-search": {
    s: "Queries artifacts by key-value properties and labels, such as build number, branch, quality status or environment, to find exactly what a pipeline produced.",
    d: "Properties are set at upload or later by automation, and recorded against nodes. A query selects by combinations such as status equals tested and branch equals main, optionally sorted by creation time to find the latest. It is how pipelines locate the artifact to promote or deploy without knowing a path. It is hard because property sets grow without schema, values must be indexed to stay fast, and queries that fetch the latest across millions of nodes need ordering support.",
    k: ["Free-form properties vs a declared schema: free-form lets teams adapt, but unindexed keys and inconsistent names make queries slow and unreliable.", "Properties on the artifact vs on a separate build record: artifact properties travel with the file, while build records keep history that does not change when the file is copied."],
    p: ["Two pipelines using different spellings of the same key make a promotion query miss half the candidates.", "Properties lost when an artifact is copied between repositories break downstream selection."],
    v: "Tag three artifacts with status tested, query for the latest tested one on a branch, and confirm the returned artifact is the newest. Copy it to another repository and confirm the property followed.",
    dep: ["metadata-database","node-tree","search-index-store"]
  },
  "checksum-lookup": {
    s: "Finds which artifact or artifacts have a given content digest, so a file found in a deployment can be traced back to its source repository and build.",
    d: "Because content is stored by digest, a lookup by SHA-256 or an older digest is a direct index probe on the metadata store, returning every path that references that content. It answers audit questions such as what a binary running in production came from, and lets clients skip uploads of content the server already has. The hard parts are supporting several digest algorithms, indexing legacy digests that the storage layer does not use, and respecting permissions when the same content appears in repositories the caller cannot see.",
    k: ["Index every supported digest vs only the storage digest: indexing all lets old clients find files, at the cost of computing and storing several digests per upload.", "Existence check before upload vs always upload: a check saves bandwidth, but tells the caller the content exists, which can leak information."],
    p: ["Returning matches from repositories the caller cannot read reveals where a confidential file is stored.", "A lookup by a weak legacy digest can return two different files that collide."],
    v: "Take a binary from a running deployment, compute its SHA-256, look it up, and confirm the response names the expected repository path and build. Look up a digest that was never uploaded and confirm an empty result.",
    dep: ["metadata-database","content-addressed-store","permission-targets"]
  },
  "where-used": {
    s: "Shows what depends on an artifact and what an artifact depends on, across builds and packages, so the impact of removing or changing it is visible.",
    d: "Dependency edges come from parsed manifests, container layer references and recorded build inputs. They are stored as relationships between nodes and queried in both directions. Before deleting a version or reacting to a vulnerability, an operator asks which builds and images include it. The hard part is completeness: edges exist only for what was parsed or recorded, so a missing manifest or an unrecorded build leaves a hole, and transitive closure over a large graph can be expensive.",
    k: ["Edges extracted at upload vs computed on demand: extraction makes queries fast but fixes the graph at one moment; on-demand is always current and slow.", "Recorded build inputs vs inferred dependencies: recorded inputs are exact for those builds, but only exist for builds that reported them."],
    p: ["Treating an empty where-used result as proof that nothing uses an artifact when the consumers simply never reported.", "Deleting a base layer shown as unused because its dependents' manifests were never parsed."],
    v: "Publish a library, build an application that depends on it and records its inputs, then query where the library is used and confirm the application build appears, and the reverse query lists the library.",
    dep: ["manifest-parser","build-info","metadata-database"]
  },
  "tree-browser": {
    s: "Presents a repository as folders and files by path, including the cached view of a proxy repository and the merged view of a virtual one.",
    d: "The underlying store is a tree of nodes keyed by repository and path. Browsing lists a folder's children with sizes, dates and digests, lazily and paged. For proxy repositories it shows only what has been cached, and some interfaces offer a view of what the remote would offer. Virtual repositories merge the listings of members in priority order. The hard parts are listing huge folders efficiently, computing folder sizes without scanning, and showing merged listings that match what a client resolving through the virtual repository would actually get.",
    k: ["Stored folder-level aggregates vs computed on demand: stored sizes and counts are instant but must be updated on each change; computing is correct and slow.", "Cached-only view of proxies vs live remote listing: cached-only is fast and honest about local state, while a live listing is misleading if the remote is unavailable."],
    p: ["Believing a proxy repository's folder listing is the full upstream catalog, when it holds only what has been requested.", "Folder sizes that drift from reality after bulk deletes because aggregates were never updated."],
    v: "Browse a virtual repository whose two members contain the same path and confirm the listing shows the member a client would be served. Compare a folder's displayed size with the sum of its children.",
    dep: ["node-tree","virtual-repository","proxy-repository"]
  },
  "build-info": {
    s: "A record of one build: its inputs, its produced artifacts with digests, its environment and its promotion history, stored alongside the artifacts it describes.",
    d: "At the end of a build, the pipeline sends a document naming each dependency used, each artifact produced with its digest, and facts such as the commit, builder and timestamps. The repository links the document to the nodes. Later it can show what went into a release, drive promotion of exactly that set, and answer which builds used a compromised library. It is hard because the quality depends entirely on the pipeline reporting accurately, and records can grow large for builds with thousands of dependencies.",
    k: ["Build record stored as a first-class object vs properties on files: a first-class record preserves full history and relationships, but requires pipelines to publish it deliberately.", "Trusting the pipeline's report vs verifying it: trusting is simple, but a compromised builder can describe a build that never happened."],
    p: ["A record naming digests that were later overwritten or deleted describes a build that can no longer be reproduced.", "Pipelines that publish files but skip the record leave releases with no traceable inputs."],
    v: "Run a build that publishes a record, open it, and confirm each listed artifact digest matches the stored file and each listed dependency resolves to a real node. Promote the build and confirm the same set moved.",
    dep: ["node-tree","metadata-database","ci-token-exchange"]
  },
  "ci-token-exchange": {
    s: "Lets a build job trade the identity assertion its pipeline platform issued for a short-lived repository token, so no long-lived secret is stored in CI.",
    d: "The pipeline platform signs a token stating which repository, branch and workflow is running. The repository verifies the signature against the platform's published keys, matches the claims to a mapping rule, and issues an access token scoped to the repositories that rule permits, expiring within minutes. This removes stored credentials and gives each job exactly the access its identity justifies. The hard part is writing mapping rules tight enough: a loose rule on repository name or branch lets any fork or pull request obtain publish rights.",
    k: ["Identity exchange vs stored secrets: exchange removes long-lived credentials and attributes access to a specific run, but depends on the platform's signing keys and a correct mapping.", "Narrow claim matching vs convenience: matching branch and workflow limits blast radius, but breaks every time pipelines are renamed."],
    p: ["A mapping rule that matches only the organization lets a pull request from an untrusted fork publish releases.", "Cached platform signing keys that never refresh reject valid tokens after the platform rotates them."],
    v: "Run a pipeline on the permitted branch and confirm it obtains a token and publishes. Run the same job from an unmapped branch and confirm the exchange is refused and logged.",
    dep: ["access-tokens","identity-federation","audit-log"]
  },
  "webhook-delivery": {
    s: "Sends signed HTTP callbacks to registered endpoints when events occur, with retries and a record of each attempt, so other systems can react to repository changes.",
    d: "Subscriptions name events such as artifact deployed, promoted or deleted, with filters by repository or path. When one occurs, the repository builds a payload, signs it with a shared secret and posts it, retrying with backoff on failure and recording each attempt. Receivers use it to start deployments, scans or notifications. It is hard because delivery is at least once, so receivers see duplicates, ordering is not guaranteed, and a slow endpoint must not block the event pipeline.",
    k: ["At-least-once with retries vs best-effort: retries make integrations dependable, but force receivers to be idempotent and tolerate reordering.", "Delivery from the request path vs from a queue: inline is simple and slows uploads when a receiver hangs; a queue isolates users from receivers but adds a component."],
    p: ["A receiver that treats every delivery as new runs a deployment twice after a retry.", "An unreachable endpoint that is retried forever consumes worker capacity and delays other subscribers."],
    v: "Register an endpoint, publish a file, and confirm one signed delivery arrives with a valid signature. Make the endpoint fail twice and confirm the repository retries and the attempt log shows both failures.",
    dep: ["event-stream","job-scheduler","audit-log"]
  },
  "event-stream": {
    s: "The internal ordered feed of changes to the repository, from which webhooks, replication, index updates and audit entries are all driven.",
    d: "Every create, move, delete and property change emits an event with the path, actor and digest. Consumers read the feed at their own pace and remember their position, so a slow consumer does not delay the others. Replication uses it to know what to send, search uses it to update the index, and webhooks use it to notify. The difficulty is durability and ordering: an event lost between the database commit and the feed leaves a replica or an index permanently wrong, and a replay must be harmless.",
    k: ["Events written in the same transaction as the change vs emitted after commit: same-transaction events are never lost, but couple the feed to the database's load.", "Per-path ordering vs global ordering: per-path order is cheap and enough for most consumers, while global order serializes everything."],
    p: ["An event emitted before commit tells a replica about a change that then rolls back.", "A consumer that falls behind past the retention of the feed must rebuild from scratch."],
    v: "Make a change, stop one consumer, make more changes, restart it, and confirm it receives every missed event in order without duplicating any it had processed.",
    dep: ["metadata-database","transaction-model","job-scheduler"]
  },
  "release-bundles": {
    s: "An immutable, signed collection of artifacts and metadata that represents one release, which can be distributed to other sites as a single verified unit.",
    d: "A bundle names a set of artifacts by digest, usually from a build record, and is signed so recipients can check it was not altered. Distribution sends the bundle and its content to downstream repositories, which verify digests before accepting. It turns a release into one object with a version, which can be audited and rolled back. The hard parts are bundling content that is large or shared across bundles, deciding which downstream sites receive it, and verifying the signature chain at sites with no connection to the origin.",
    k: ["Bundle of references plus content transfer vs full copy: references let sites fetch only what they lack, but need a reachable source.", "Signing the bundle vs signing each artifact: a bundle signature covers the set and its composition, while per-artifact signatures survive repackaging."],
    p: ["Distributing a bundle whose artifacts were deleted at the origin leaves downstream sites with a release they cannot complete.", "Skipping signature verification at the destination turns the bundle into an unauthenticated copy."],
    v: "Create a bundle from a build, distribute it to a second repository, and confirm the destination verifies the signature, holds every artifact digest in the bundle, and rejects a bundle with one byte altered.",
    dep: ["build-info","index-signing","push-replication","immutability-enforcement"]
  },
  "sbom-ingest": {
    s: "Accepts software bills of materials produced by builds, attaches them to the artifacts they describe, and makes their contents searchable and scannable.",
    d: "A bill of materials lists the components inside an artifact in a standard format. The repository stores it as an attachment keyed by the artifact's digest, parses out component names and versions, and links them into the dependency graph. That lets operators find every artifact containing a vulnerable component long after the build. It is hard because quality varies: generators miss nested or statically linked components, and a document that was accurate at build time says nothing about vulnerabilities discovered later.",
    k: ["Accept generator output as-is vs normalize on ingest: as-is preserves the original and is easy to sign; normalizing makes search uniform but loses fields.", "Attach by digest vs by path: a digest follows the content across copies and promotions, while paths break when files move."],
    p: ["Assuming an artifact with no bill of materials has no components, rather than that nobody supplied one.", "A document describing a different build than the file it is attached to gives false assurance."],
    v: "Upload an artifact with its bill of materials, search for one named component, and confirm the artifact is returned. Copy it to another repository and confirm the attachment is still found.",
    dep: ["manifest-parser","metadata-database","where-used","vulnerability-index"]
  },
});
