// Details for the artifact repository plate, part 4: security and storage.
ATLAS.details("artifact-repository", {
  "scan-integration": {
    s: "Sends stored artifacts to a vulnerability or malware scanner, receives the findings and attaches them to the artifact so policy and people can act on them.",
    d: "On upload or cache fill, a job submits the artifact, or its list of components, to a scanner and records the result against the digest: findings, severity, and the time and scanner version. The scanner may be built in or external. Results appear in the console and feed promotion and download rules. Hard parts include scanning very large images in reasonable time, tolerating scanner outages, and handling the fact that a clean result is only a statement about what was known when scanning ran.",
    k: ["Scan on arrival vs scan on demand: on arrival has results ready when policy needs them, while on demand saves effort for artifacts nobody uses.", "Built-in scanning vs external service: built-in is simple and tied to one data source; external allows specialist tools and adds an integration to maintain."],
    p: ["Treating a clean scan from last year as current when new vulnerabilities have since been published.", "A scan queue that backs up during the nightly build wave delays every promotion."],
    v: "Upload an artifact containing a component with a known vulnerability, wait for the scan and confirm a finding with severity is attached to its digest and visible through the API and console.",
    dep: ["vulnerability-index","job-scheduler","metadata-database","sbom-ingest"]
  },
  "vulnerability-index": {
    s: "A local copy of vulnerability advisories, matched against component names and versions, which lets the repository answer which stored artifacts are affected without calling out.",
    d: "Advisories from public and commercial feeds are downloaded on a schedule, normalized to affected name and version ranges, and indexed. When a component list is available, matching is a lookup. When a new advisory arrives, the repository can find every stored artifact containing the component. Hard parts are the quality of feed data, with ranges that are wrong or ambiguous, matching package names across formats, and doing the reverse search over millions of artifacts quickly.",
    k: ["Local index vs per-query lookup of a remote service: local is fast and works offline and requires feed management; remote is current and adds a dependency on every scan.", "Matching by declared component vs by content analysis: declared is fast and misses vendored code, while content analysis finds more at much higher cost."],
    p: ["A feed that stops updating leaves the index stale while reports continue to say all clear.", "Version range mismatches produce false positives that train teams to ignore findings."],
    v: "Import a test advisory naming one version of a component, then query for affected artifacts and confirm exactly the artifacts containing that version are returned, within seconds.",
    dep: ["metadata-database","search-index-store","job-scheduler"]
  },
  "license-policy": {
    s: "Rules on which software licenses are acceptable, evaluated against the licenses declared by stored components, to flag or block content that conflicts.",
    d: "License identifiers are extracted from manifests and bills of materials, normalized to standard names and checked against allow, review and deny lists. A result is a warning, a block on promotion or a block on download. It protects the company from obligations it cannot meet. The data is hard: declared licenses are often missing, vague or wrong, compound expressions need parsing, and legal meaning depends on how the component is used, which the repository cannot see.",
    k: ["Block on deny vs report only: blocking prevents entry and risks stopping builds over a mistaken license field; reporting keeps flow and relies on someone reading it.", "Declared licenses vs detected licenses: declared is cheap and unreliable, and detection reads the files and costs more."],
    p: ["A component with no license declared passing a rule that only denies listed licenses.", "A policy decision based on an exact string match failing for the same license written two ways."],
    v: "Upload a component declaring a denied license, request promotion and confirm refusal naming the license. Upload one with a compound expression of allowed licenses and confirm it passes.",
    dep: ["manifest-parser","sbom-ingest","policy-gates"]
  },
  "curation-rules": {
    s: "Controls which external packages may enter through proxy repositories, by name, version, age, maintainer or reputation, before they are ever cached.",
    d: "A request to a proxy passes through rules before any remote fetch: block a named package, require a minimum age for new versions so a freshly published malicious release is not pulled at once, require a license or a scan result, or allow only an approved list. Curated proxies shrink the external attack surface. The challenge is friction: teams need new dependencies quickly, so the process for adding exceptions must be fast, and rules that are too tight push developers to bypass the repository.",
    k: ["Allow-list of approved packages vs block-list of bad ones: an allow-list is the strongest control and slow to maintain; a block-list is permissive and only catches what is already known.", "Delay on brand-new versions vs immediate availability: a delay lets the community find malicious releases first, and slows legitimate urgent updates."],
    p: ["Rules so strict that teams configure builds to reach public sources directly and bypass all controls.", "A block-list update lagging an incident by days, because nobody owned adding the entry."],
    v: "Publish a test package version to a remote source, request it through the proxy within the age delay and confirm refusal citing the rule, then after the delay confirm it is served.",
    dep: ["proxy-repository","policy-gates","upstream-routing"]
  },
  "dependency-confusion-guard": {
    s: "Prevents an attacker from substituting a malicious public package for a private one by publishing a same-named package with a higher version.",
    d: "The attack works when a resolver consults a public source for a name that is meant to be internal. Defenses are structural: reserve internal namespaces so public sources are never asked for them, give each name a single source, and warn when a name exists in both an internal and an external repository. The repository applies these at the virtual and proxy layers, independent of client settings. The difficulty is knowing the set of internal names, which grows continuously and is rarely listed anywhere.",
    k: ["Reserved namespace patterns vs a registry of every internal name: patterns need discipline in naming and no upkeep; a registry is exact and needs updating with each new package.", "Blocking on conflict vs alerting: blocking is safe and may stall a legitimate name; alerting keeps builds moving and relies on a response."],
    p: ["Internal packages published without the reserved prefix, so the guard never covers them.", "Protection configured on the virtual repository while some clients still query a proxy directly."],
    v: "Publish a public package with the same name as an internal one and a higher version, run a clean install through the virtual repository, and confirm the internal version installs and the conflict is logged.",
    dep: ["upstream-routing","virtual-repository","audit-log"]
  },
  "signature-verification": {
    s: "Checks signatures on uploaded or proxied artifacts against trusted keys, and records whether each artifact is signed and by whom.",
    d: "Publishers sign packages or images, and the repository verifies the signature against a configured set of trusted keys or identities, rejecting or flagging what fails. For proxies it may verify what the remote signed before caching. Results are stored as properties for policy and clients. The hard parts are trust management, such as which keys are trusted for which repositories, key rotation and revocation, and the fact that a valid signature proves who signed, not that the content is safe.",
    k: ["Verify at upload vs leave verification to clients: upload verification blocks bad content once for everyone, while client-side verification is the only check that does not trust the repository.", "A single trusted key set vs per-repository keys: per-repository limits what a stolen key can sign, with more configuration."],
    p: ["Trusting any valid signature, so a stolen key of any publisher counts as acceptable.", "Revoked keys not distributed, so signatures from compromised keys continue to verify."],
    v: "Upload an artifact signed with a trusted key and confirm it is marked verified. Upload one signed with an unknown key and confirm it is rejected or flagged as the repository policy requires.",
    dep: ["index-signing","metadata-database","configuration-system"]
  },
  "policy-gates": {
    s: "Enforcement points that decide, at download or promotion time, whether an artifact may be served based on its scan results, licenses, signatures and age.",
    d: "A gate evaluates policy against the metadata gathered about an artifact and returns allow, warn or deny, with a reason recorded for the client and the log. Policies attach to repositories, so release repositories can be strict while development ones only warn. Gates are consulted on every request, so they must be fast and use cached verdicts. The difficulty is blast radius: a new deny rule applied broadly stops builds across the company, so rollout needs a warn-only phase and an exception path.",
    k: ["Warn-only phase before enforcement vs immediate enforcement: a warn phase shows impact before anyone is blocked, and delays protection by weeks.", "Evaluate on every download vs cache verdicts: evaluating is always current and slow; cached verdicts are fast and lag behind new findings until rescanned."],
    p: ["A new deny rule enabled globally on a Monday stops every build that uses a widely shared library.", "Error messages that say only blocked, leaving developers with no way to find the policy responsible."],
    v: "Enable a rule in warn mode, download an affected artifact and confirm success with a warning logged. Switch to deny and confirm the same request is refused with a message naming the rule.",
    dep: ["scan-integration","license-policy","signature-verification","metadata-cache"]
  },
  "rescan-scheduler": {
    s: "Periodically re-evaluates stored artifacts against newly published advisories, so something clean when stored is flagged when a vulnerability is disclosed later.",
    d: "New advisories arrive daily and apply to old content. The scheduler either rescans all artifacts at intervals or, more efficiently, matches the new advisory against the stored component lists and rescans only those affected. Results update the stored verdicts and can trigger notifications or quarantine of artifacts already deployed. The cost is large for big repositories, so prioritization matters: artifacts recently downloaded or in release repositories come first, and rarely used old snapshots last.",
    k: ["Advisory-driven targeted rescans vs full periodic rescans: targeted is cheap and depends on accurate component lists; full catches what the lists missed and costs hours.", "Alerting owners of affected artifacts vs only marking them: alerts lead to fixes and generate noise for old unused content."],
    p: ["A rescan run weekly leaving a critical vulnerability unflagged for six days after disclosure.", "Verdicts updated without notifying anyone, so a deployed artifact quietly becomes vulnerable and no owner knows."],
    v: "Import a new advisory affecting a stored component, and confirm within the configured window that every artifact containing it changes verdict and the owner receives a notification.",
    dep: ["scan-integration","vulnerability-index","job-scheduler","webhook-delivery"]
  },
  "blob-store-abstraction": {
    s: "A uniform interface to storage backends offering put, get, exists and delete by digest, so everything above is independent of where bytes physically live.",
    d: "The interface hides whether content sits on a local disk, a network file system or an object store. It supports streaming reads and writes, existence checks, deletion and often ranged reads and multipart writes. Multiple stores can be configured, with repositories assigned to one. It is the seam that enables migrating storage without changing anything above. Difficulty comes from backends that differ in consistency, in maximum object size, in latency, and in how they report partial failures.",
    k: ["Lowest-common-denominator interface vs exposing backend features: a minimal interface keeps all backends interchangeable, while exposing features such as server-side copy gains speed and ties code to some backends.", "One store per repository vs a single shared store: per-repository isolates cost and failure and loses deduplication across repositories."],
    p: ["Assuming immediate read-after-write on a backend that offers only eventual consistency, causing sporadic missing-file errors.", "Writing to storage without checking the reported length against what was sent, so truncation goes unnoticed."],
    v: "Write a file through the interface to each configured backend, read it back and compare digests, then delete it and confirm existence checks return false on every backend.",
    dep: ["filesystem-backend","object-store-backend"]
  },
  "content-addressed-store": {
    s: "Stores each distinct file once under the digest of its bytes, so identical content from different paths, repositories or uploads shares one stored copy.",
    d: "On upload the bytes are hashed while being received; if a blob with that digest exists, the new node simply references it and the upload is discarded. Reads translate a node to its digest and fetch the blob. Because the name is derived from the content, a stored blob cannot be altered without detection. The design makes copying, promotion and replication cheap, and it makes deletion the hard problem: removing a node cannot remove the blob while any other node references it.",
    k: ["Digest as the storage key vs path as the key: digest keys give deduplication, safe copies and integrity checks, but make deletion a reference-counting problem.", "Strong digest only vs also keeping weak legacy digests: strong is secure and simple, and legacy digests are needed only by old clients."],
    p: ["A hash collision attack against a weak digest letting an attacker substitute content under a known name.", "Deleting a blob on the last visible reference while another repository still points to it."],
    v: "Upload the same 1 GB file to two repositories and confirm storage grew by one copy and both nodes report the same digest. Delete one node and confirm the other still downloads correctly.",
    dep: ["blob-store-abstraction","integrity-verification","metadata-database"]
  },
  "deduplication": {
    s: "Avoids storing the same content twice, whether as identical files or as shared pieces of different files, saving space and transfer.",
    d: "Whole-file deduplication comes free from addressing by digest. Finer-grained deduplication splits files into chunks addressed separately, which helps for large archives that differ slightly between builds, at the price of reassembling reads and an index of chunks. Checking by digest before upload lets a client skip sending content the server already has. Savings depend heavily on the format: container layers dedupe well, compressed archives that differ in a byte do not, and the accounting of who pays for shared content is a policy question.",
    k: ["Whole-file dedupe vs chunk-level: whole-file is simple and fast and misses near-duplicates; chunk-level finds more and costs index size and read complexity.", "Skip-if-exists protocol vs always upload: skipping saves bandwidth, and tells the client the content exists, which needs a permission check."],
    p: ["Assuming dedupe saves space for archives that embed timestamps, so every build differs entirely.", "A skip-if-exists check that reveals other tenants' content by probing for digests."],
    v: "Upload two builds of a large archive differing by a few files, and compare storage growth with total uploaded size. Report the ratio, and confirm both builds still download with correct digests.",
    dep: ["content-addressed-store","compression"]
  },
  "filesystem-backend": {
    s: "Stores blobs as files on a local or network file system, usually in a directory tree derived from the digest.",
    d: "Each blob becomes a file at a path built from its digest prefix, so no single directory grows without bound. Writes go to a temporary file and are renamed into place, which gives atomic visibility on local disks. Network file systems offer shared access across nodes but differ in locking, rename and caching behavior. It is the simplest backend and performs very well locally. Its limits are capacity of one volume, inode counts with millions of small files and the consistency quirks of shared mounts.",
    k: ["Local disk per node vs shared network file system: local is fast and needs replication between nodes; shared gives one copy for the cluster and exposes you to its locking and latency.", "Deep digest-prefix directories vs a flat directory: depth bounds directory size and costs more lookups, while flat is simple and degrades past millions of entries."],
    p: ["Exhausting inodes with small files while the volume still shows free space.", "A network mount whose cached directory listing hides a blob just written by another node."],
    v: "Write ten thousand files of mixed sizes, kill the process during a write, and confirm that no partial file is visible under a final path and all completed files verify against their digests.",
    dep: ["blob-store-abstraction"]
  },
  "object-store-backend": {
    s: "Stores blobs in a remote object storage service through its HTTP interface, giving large capacity and built-in durability without managing disks.",
    d: "Each blob is an object keyed by digest, written with multipart upload for large files and read with ranged requests. Capacity is effectively unlimited and durability is the service's. Clients may be redirected to download directly from the service using time-limited URLs, which removes the repository from the data path. Trade-offs are request cost, latency per call, and consistency behavior. Listing is slow, so the repository relies on its own metadata rather than listing buckets to know what exists.",
    k: ["Proxy downloads through the repository vs redirect to signed URLs: proxying keeps access control and audit on the server, while redirects offload bandwidth and bypass it.", "One bucket vs several: one is simple; several allow different retention, regions and access boundaries."],
    p: ["Millions of tiny requests running up a bill because index files are read from storage on every client call.", "Signed URLs with long expiry that leak and permit download long after permission is revoked."],
    v: "Upload a 2 GB file through multipart, download a middle range, and confirm bytes match. Request a signed URL, wait past its expiry and confirm the service refuses it.",
    dep: ["blob-store-abstraction","chunked-upload"]
  },
  "storage-tiering": {
    s: "Moves content between fast and cheap storage according to how recently it was used, keeping hot artifacts close and cold ones inexpensive.",
    d: "Recent builds and popular dependencies sit on fast storage, while old releases move to cheaper object tiers or archives with slower first-byte time. A tiering job uses last-download data to select candidates and moves blobs while keeping the metadata pointing at one logical location. Reads of cold content are slower and sometimes require a restore step. It is valuable when most storage holds rarely read releases, and dangerous when a build suddenly needs thousands of cold files.",
    k: ["Move by age vs by last access: age is simple, while last access keeps genuinely used old content hot at the cost of tracking.", "Transparent slow reads vs explicit restore: transparent keeps clients unaware and risks timeouts; explicit restore is honest and requires tooling."],
    p: ["A build that pulls a year-old base image timing out because the layers sit in an archive tier.", "Tiering by upload age moving a still-popular library to slow storage."],
    v: "Move a test blob to the cold tier, request it and measure the first-byte time, confirming the download succeeds with the correct digest. Confirm the metadata still reports a single logical path.",
    dep: ["usage-tracking","blob-store-abstraction","job-scheduler"]
  },
  "compression": {
    s: "Reduces the size of stored or transferred content, applied where the data is not already compressed and where the saving justifies the processing.",
    d: "Many artifacts are already compressed archives and gain nothing. Text-heavy files such as indexes and metadata compress well. The repository may compress stored blobs, negotiate compressed responses for index files, or leave data untouched. Compressing stored content complicates range requests and digest verification, which refer to the original bytes. The decision depends on content type, so applying compression blindly spends processor time for little benefit.",
    k: ["Compress at storage vs only in transit: storage compression saves disk and complicates ranges and checksums; transit compression is transparent and saves only bandwidth.", "Fast light compression vs high ratio: light compression barely slows uploads, while high ratios cost processor time on every write."],
    p: ["Compressing already-compressed archives and spending processor time for a zero percent saving.", "Computing digests over compressed bytes, so identical content stored with different compression no longer deduplicates."],
    v: "Store a text index and a compressed archive, compare stored size with original for each, and confirm both download with the original digest and a range request returns the correct bytes.",
    dep: ["content-addressed-store","range-requests"]
  },
  "upload-staging": {
    s: "A temporary area where incoming bytes are written and verified before being moved into permanent storage and linked to a node.",
    d: "Uploads stream into a staging file or multipart session while the digest is computed. Only after the full content arrives, passes size and digest checks and clears policy is it committed to the content store and the node created. Failures delete the staging data. This keeps half-written files out of the store and lets the repository reject content cheaply. It needs capacity planning, since many concurrent large uploads consume temporary space, and cleanup for sessions that never complete.",
    k: ["Local disk staging vs streaming straight to the final store: local staging is fast and simple and consumes node disk; streaming avoids staging and complicates verifying before commit.", "Verify before commit vs after: before keeps bad content out of the store; after is faster and needs removal when it fails."],
    p: ["Staging space on a small system volume filling up under a burst of parallel uploads.", "Abandoned staging files kept forever because the cleanup job only knew about completed uploads."],
    v: "Start fifty parallel large uploads, abort ten, and confirm staging space returns to baseline after the timeout and that the forty completed artifacts are present with correct digests.",
    dep: ["blob-store-abstraction","integrity-verification","cleanup-scheduler"]
  },
  "blob-gc": {
    s: "Removes stored content that no node references any more, reclaiming space after deletes, retention runs and trash purges.",
    d: "After nodes are deleted, the blobs they referenced may still be shared by others. The collector determines which digests have no remaining references, typically by comparing the set of referenced digests in the database with what storage holds, and deletes the difference after a safety delay. It must not run against an incomplete view: a bug or a restore from an old database backup can make live content look unreferenced. It can be expensive on large stores and is usually throttled.",
    k: ["Mark and sweep against the database vs reference counts: reference counts are fast to answer and drift under bugs; mark and sweep is expensive and self-correcting.", "Minimum age before deletion vs immediate: age protects blobs being uploaded or restored, and delays reclaiming space."],
    p: ["Restoring an older metadata backup and running collection deletes blobs referenced by newer nodes that the old backup does not know.", "Collection running while an upload is committing, deleting the blob it just stored."],
    v: "Delete a node that holds the only reference to a large blob, run collection, and confirm storage shrinks by that size after the age delay. Confirm a blob shared with another node remains.",
    dep: ["content-addressed-store","metadata-database","cleanup-scheduler"]
  },
  "integrity-verification": {
    s: "Computes and checks digests on upload, at rest and on read, so corrupted or truncated content is detected rather than served.",
    d: "On upload the server hashes the stream and compares it with any digest the client supplied. At rest, a background job periodically reads blobs and compares them with their addressed digests to catch silent corruption. On download it may verify before or while streaming. It turns a durability claim into a measurement. The costs are real: scrubbing a petabyte reads a petabyte, so schedule and rate matter, and a mismatch needs a repair source, a replica or a re-fetch from upstream, or the corruption is simply known and unfixable.",
    k: ["Scrub all content on a schedule vs verify on read only: scheduled scrubbing finds rot before anyone needs the file, at continuous read cost; read-time checks cost nothing until a client hits the problem.", "Fail the download on mismatch vs serve and warn: failing prevents spreading corruption and breaks a build; serving keeps flow and ships bad bytes."],
    p: ["Corruption found on one copy with no replica to repair from, so the artifact is permanently lost.", "Scrubbing at full speed in business hours saturating storage and slowing builds."],
    v: "Flip one byte in a stored blob on a test instance, run the scrub, and confirm the blob is reported with its digest and path, a download is refused and a repair from a replica restores it.",
    dep: ["content-addressed-store","job-scheduler","pull-replication"]
  },
  "metadata-database": {
    s: "The relational database that records repositories, nodes, properties, relationships, users and permissions, mapping every path to the digest of its content.",
    d: "It holds a row per node with its repository, path, digest, size and times, plus properties, dependency edges, build records and configuration. Nearly every request reads it, and every write changes it, so its performance is the repository's performance. Index design supports lookups by path, by digest and by property. It is smaller than the content store but far more critical: losing it leaves blobs that nobody can name, so backups, replication and recovery of the database are the real durability story.",
    k: ["Embedded database vs external server: embedded is simple to run and limits scale and clustering; an external server scales and adds a service to operate.", "Normalized schema vs denormalized aggregates: normalized is clean and slow for folder sizes; aggregates are fast and need maintenance on every write."],
    p: ["Treating blob storage backups as sufficient when the database holding all names and properties is not backed up.", "Property tables growing without bound until queries for the latest build take minutes."],
    v: "Restore the database from backup into a clean instance with the blob store attached, then download ten random artifacts by path and confirm each matches its recorded digest.",
    dep: ["transaction-model","schema-migration"]
  },
  "node-tree": {
    s: "The model of repositories as trees of folders and files, each node carrying a path, digest, size, times, properties and a repository membership.",
    d: "A node is a file or folder at a path in one repository. File nodes point to a blob by digest, and any number of nodes can share one. Folders exist implicitly or as rows, depending on the design. Operations such as copy, move and delete work on subtrees. Listing, aggregate sizes and cascading changes are the costly parts. A move of a large folder is many row updates and must appear atomic to clients, and path length and character rules must hold for every format.",
    k: ["Rows with full path strings vs parent-child links: full paths make lookups and prefix scans direct but make folder moves rewrite every descendant; parent links move cheaply and need joins to resolve.", "Explicit folder rows vs implicit folders: explicit supports properties and empty folders, and implicit is leaner and has no place to keep folder data."],
    p: ["A recursive move of a large tree holding locks long enough to stall uploads to the same repository.", "Case-different paths treated as distinct on one backend and identical on another."],
    v: "Move a folder of ten thousand files and, while it runs, request files from both old and new paths, confirming every request sees either the complete old tree or the complete new one.",
    dep: ["metadata-database","transaction-model","content-addressed-store"]
  },
  "search-index-store": {
    s: "A text and attribute index kept beside the database, enabling fast queries by name, property and extracted content without scanning nodes.",
    d: "An indexing component consumes change events and writes documents for names, coordinates, properties and manifest fields. Queries combine text matching with filters and sorting. It is separate from the transactional database so heavy searches do not slow uploads. Because it is derived, it can always be rebuilt from the database, but a rebuild of a large repository takes hours. The difficulty is staying consistent: lag makes new artifacts invisible, and permission changes must reach the index or results leak.",
    k: ["Separate index service vs database-native full-text: a separate service searches richer and faster and adds a system to run; database search is simple and slows at scale.", "Near-real-time updates vs batched indexing: near-real-time shows new artifacts promptly and costs write load; batching is cheaper and lags."],
    p: ["An index corrupted by a crash and rebuilt over a day while search returns incomplete results.", "Indexed documents that retain a deleted artifact's name, so its existence leaks through search."],
    v: "Publish and delete artifacts in quick succession, wait for the documented lag, and confirm the index contains exactly the surviving ones. Rebuild from the database and compare document counts.",
    dep: ["metadata-database","event-stream"]
  },
  "metadata-cache": {
    s: "An in-memory cache of hot metadata such as nodes, permissions and tokens, which lets most requests avoid a database round trip.",
    d: "Entries for recently used nodes, resolved permissions, repository configuration and validated tokens are kept in memory for short periods. In a cluster each node has its own cache, with invalidation messages sent on change so others drop stale entries. It makes index fetches and downloads cheap. It is also the usual source of confusing behavior: a permission revoked or a file deleted still works for as long as some node holds a stale entry, so the bound on staleness has to be known and acceptable.",
    k: ["Time-based expiry vs explicit invalidation: expiry is simple and bounds staleness by a number, while invalidation is prompt and fails silently if a message is lost.", "Per-node cache vs shared cache service: per-node is fast and inconsistent between nodes; shared is consistent and adds a network hop and a dependency."],
    p: ["A revoked token or deleted artifact still honored by one node for the cache lifetime.", "A cache sized for ordinary load collapsing under a burst of distinct keys, shifting all load to the database."],
    v: "Revoke a permission and, from every node, request the previously allowed resource until refused; confirm the time to refusal everywhere is within the documented cache lifetime.",
    dep: ["metadata-database","event-stream"]
  },
  "transaction-model": {
    s: "The rules for making a multi-step change, such as creating a node and its properties, or promoting a build, atomic and visible all at once.",
    d: "Changes that touch several rows run in one database transaction so readers see either the old state or the new one. Content is written to storage before the transaction that references it commits, so a failure leaves at worst an unreferenced blob rather than a node pointing at nothing. Long operations such as promotion of thousands of files are split into batches or use staging visibility flags. The challenge is coordinating the database with storage and the search index, which cannot join its transaction, and handling concurrent writers to the same path.",
    k: ["Write content first, then commit metadata vs the reverse: content first never yields a dangling node, and leaves orphans for cleanup to remove.", "Optimistic conflict detection vs row locks: optimistic works well when conflicts are rare, while locks serialize writers to hot paths and risk waiting."],
    p: ["Committing the node before the blob is durable, so a crash leaves a path that always fails to download.", "Long transactions on a large promotion holding locks and blocking all uploads to that repository."],
    v: "Kill the process between the content write and the metadata commit on a test instance, restart, and confirm no node exists for the file, the blob is reported orphaned, and a client retry succeeds.",
    dep: ["metadata-database"]
  },
  "schema-migration": {
    s: "The versioned changes to the metadata database structure applied during upgrades, which must run safely against very large tables while the service stays available.",
    d: "Each release may add columns, indexes or tables, and sometimes convert data. Migrations are scripted, recorded in the database and run at startup or in a separate step. On large installations a naive change locks the table for hours, so changes are made in phases: add the new structure, write to both, backfill in the background, then switch reads. Rollback is hard once data is converted, so the supported path is usually forward, with a backup before upgrade.",
    k: ["Run at startup vs separate offline step: startup is automatic and can block service for a long migration; a separate step is controllable and requires an operator.", "Expand-then-contract in multiple releases vs one-step change: multiple releases allow rolling upgrades with mixed versions, at the cost of longer upgrade paths."],
    p: ["An index build on a billion-row table taking the service offline during a routine upgrade.", "A migration that cannot be reversed discovered only after the new version shows a defect."],
    v: "Copy a production-sized database to a test instance, run the migration with a timer, confirm the service answers requests throughout, and compare row counts and sample records before and after.",
    dep: ["metadata-database","online-upgrade"]
  },
});
