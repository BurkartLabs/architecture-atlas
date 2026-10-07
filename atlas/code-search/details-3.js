// Details for the code search plate, part 3: index structures, sharding and replication, ingestion.
ATLAS.details("code-search", {
  "trigram-index": {
    s: "An index from every three-character sequence in the corpus to the files containing it, which lets any literal or regular expression be reduced to a small set of candidate files.",
    d: "At build time each document is scanned and every overlapping three-byte sequence is recorded against the document id. A query's required substrings are split into trigrams and their posting lists intersected. Three characters balance index size against selectivity: shorter sequences match almost everything, longer ones make the index vastly larger and cannot answer short queries. The hard parts are size, since the index can be as large as the source itself, and the fact that it only narrows candidates, so verification is still needed.",
    k: ["Trigrams vs longer n-grams or word tokens: trigrams answer any substring of three or more characters and tolerate code with no word boundaries, while words give smaller indexes but miss partial identifiers.", "Index every position vs only distinct trigrams per file: per-file presence is small and enough for filtering, while positions allow tighter matching at several times the size."],
    p: ["Queries shorter than three characters cannot use the index and either scan everything or are refused.", "Highly common trigrams, such as indentation or common keywords, produce huge posting lists that slow every query using them."],
    v: "Index a corpus with a known set of files, query a rare substring, and confirm the candidate set contains every file that has it. Compare candidate count to the verified match count for a few queries.",
    dep: ["posting-lists", "case-folding", "content-store"]
  },
  "posting-lists": {
    s: "The sorted lists of document ids stored for each index key, compressed so common keys fit in memory and can be intersected and skipped through quickly.",
    d: "For each trigram the list holds the ids of documents containing it, sorted ascending. Ids are stored as differences and packed with variable-width or block-based codes, with skip entries so a reader can jump ahead. Dense lists may become bitmaps. Lists are read from memory-mapped files, decoded in blocks and intersected shortest first. The hard part is balance: aggressive compression saves memory and increases decode time on the hot path, and a few huge lists dominate both size and query cost.",
    k: ["Delta-coded blocks vs bitmaps: blocks shrink sparse lists and support skipping, while bitmaps give fast boolean operations on dense ones, and the best systems pick per list.", "Document ids in ingestion order vs in importance order: importance order lets early termination keep the best results, but breaks append-only builds."],
    p: ["Renumbering documents after a deletion invalidates every list that mentions them.", "A decoder bug on a block boundary drops one id, causing rare, hard-to-reproduce missing results."],
    v: "Encode and decode millions of random lists and confirm exact equality, then intersect lists of known overlap and confirm the result equals a reference implementation.",
    dep: ["index-compression", "shard-file-format"]
  },
  "ngram-variants": {
    s: "Alternatives to plain trigrams, such as longer or variable-length sequences chosen by frequency, and sparse n-grams, that give more selective lookups for the same index budget.",
    d: "Variable-length schemes store grams whose length depends on how common they are: common sequences are extended until selective, rare ones are kept short. Sparse schemes index only some grams, using a rule that guarantees any query substring contains an indexed one. The planner picks grams from the query using the same rule. It is hard because the build must analyze corpus frequencies, the rule must be stable across shard versions, and a subtle mismatch between build and query breaks correctness.",
    k: ["Variable-length grams vs fixed trigrams: more selective lists for common code patterns, but a more complex builder and planner.", "Sparse indexing vs complete: smaller index and faster builds, with a rule that must be proven so no true match is missed."],
    p: ["A change in the gram selection rule makes new queries incompatible with old shards during a rollout.", "Frequency statistics from an unrepresentative sample choose poor grams."],
    v: "Compare candidate counts and index sizes between plain trigrams and the variant on a query set, and confirm via randomized tests that no true match is missed under the variant.",
    dep: ["trigram-index", "regex-to-index-plan"]
  },
  "case-folding": {
    s: "The treatment of upper and lower case in the index and in matching, so case-insensitive queries find all variants without storing every spelling.",
    d: "The common approach is to lowercase text before building the index, so keys are case-free, and then verify case-sensitive queries against the original text afterward. Folding follows Unicode rules, which include special cases such as characters that fold to multiple characters. Queries are folded the same way. The cost of the single folded index is that case-sensitive queries get weaker candidate filtering. The hard part is making build, query and verifier agree on one folding definition across versions.",
    k: ["One folded index with verification vs separate case-sensitive index: the first halves the size, while the second answers case-sensitive queries with tighter candidates at double the storage.", "Full Unicode folding vs ASCII only: Unicode is correct for international text, while ASCII is faster and simpler for code that is mostly ASCII."],
    p: ["Different Unicode versions in indexer and verifier give mismatches for a few characters.", "Case-sensitive searches for acronyms return many more candidates than needed and run slowly."],
    v: "Search for a mixed-case identifier case-sensitively and insensitively, and confirm the insensitive results are a superset and every case-sensitive result matches exactly, including on files with non-ASCII letters.",
    dep: ["encoding-detection"]
  },
  "filename-index": {
    s: "A separate index over file paths, supporting lookup by name, prefix, extension and directory, used for path filters, file finders and filename ranking.",
    d: "Paths are tokenized into segments and indexed as strings for substring and prefix matching, often with a small trigram index of their own because paths are short and numerous. Each entry also stores metadata used in filters: repository, language, size and branch membership. Lookups return document ids that feed into the content query as a pre-filter. It is hard because monorepos have tens of millions of paths, directory moves rewrite many paths at once, and path matching must follow the case rules of the code host.",
    k: ["Separate path index vs paths as another field in the main index: a separate index is small and fast to scan, while a shared one reuses code at the price of mixing statistics.", "Store full paths vs path components with shared prefixes: shared prefixes save space in deep trees but make substring matching harder."],
    p: ["A directory rename in a large repository creates millions of changed paths that must be reindexed together.", "Case differences on case-insensitive hosts produce duplicate paths that differ only in case."],
    v: "Look up a path fragment and confirm the result equals a directory listing filtered by the same fragment on the mirror, then rename a directory and confirm only the new paths are returned after the next index update.",
    dep: ["trigram-index", "shard-file-format"]
  },
  "symbol-index": {
    s: "An index of defined names and their kind and location, supporting exact, prefix and fuzzy lookup, used by symbol search, quick open and ranking.",
    d: "Built from symbol extraction, it stores each name once with its locations in a sorted structure so prefix and range queries are fast. Fuzzy lookup uses camel-case and underscore-aware tokens so that a few capital letters find a long name. Entries carry kind, language, container and visibility for filters and boosts. The hard part is relevance within the lookup itself: large codebases have many identical names, and typo tolerance must not return noise for short names.",
    k: ["Sorted names with prefix search vs full-text index of names: sorted is compact and good for exact and prefix lookups, while full-text handles substrings at higher cost.", "Camel-case aware tokens vs raw characters: tokens match how people abbreviate names, but depend on a naming convention that varies by language."],
    p: ["Names with unusual characters or Unicode break the tokenization and become unfindable.", "Fuzzy matches on three-letter names return hundreds of unrelated results."],
    v: "Look up a symbol by its exact name, by prefix and by the initials of its camel-case words, and confirm each returns the symbol, and that a nonexistent name returns nothing.",
    dep: ["symbol-extraction", "shard-file-format"]
  },
  "content-store": {
    s: "The compressed storage of the actual file text inside each shard, from which candidate files are read for verification and snippet extraction.",
    d: "File contents are concatenated in blocks, compressed, and addressed by document id and offset in the shard file. Identical files are stored once and referenced from each path. A read decompresses just the block holding a file, and recently used blocks stay in the page cache. Because verification reads many files, layout matters: files that are likely to be read together are stored together. The hard part is the read cost of broad queries, where decompression, not matching, becomes the bottleneck.",
    k: ["Block compression with larger blocks vs smaller: large blocks compress better and read more data than needed per file, while small blocks reduce read waste and compress less.", "Store content in the index vs fetch from the mirror at query time: in-index content is fast and doubles storage, while fetching saves space and adds latency and a dependency."],
    p: ["A shard where all content must be decompressed for each query consumes CPU instead of disk.", "Deduplication keyed by hash alone treats two files with the same hash and different paths as one, losing path-specific data."],
    v: "Read a random file by document id and confirm bytes equal the file in the mirror at the indexed revision. Measure the time to verify 10,000 candidates and confirm it is within the budget.",
    dep: ["index-compression", "shard-file-format"]
  },
  "index-compression": {
    s: "The compression applied to posting lists, names and content to reduce memory and disk use, chosen per structure for the best trade between size and decode speed.",
    d: "Posting lists use delta and bit-packing, content uses general-purpose block compression, and names use shared prefixes or dictionaries. The decoders are tuned with vector instructions where available. The aim is for the index to fit in memory, since a hit in the page cache is orders of magnitude faster than a disk read. It is hard because every choice affects query latency, build time and complexity, and because a compression bug corrupts results rather than failing visibly.",
    k: ["Heavier compression vs faster decoding: heavier fits more in memory per machine, but costs CPU on every query.", "Compress per structure vs one general method: per-structure methods exploit data shape and add several formats to maintain."],
    p: ["Decoder changes that are not backward compatible make older shards unreadable.", "Compression chosen on a small test corpus performs differently at full scale."],
    v: "Round-trip each structure with randomized and real data and confirm byte-exact output, and report the compression ratio and decode throughput for each against its target.",
    dep: []
  },
  "shard-file-format": {
    s: "The on-disk layout of one index shard: a header, sections for postings, names, symbols and content, and metadata, designed to be mapped into memory read-only and versioned.",
    d: "A shard is an immutable file for one set of repositories. A header records format version, build time, repository ids and section offsets. Sections for trigram tables, postings, filename and symbol indexes and content follow, aligned for direct mapping. Immutability means a reader needs no locks, and updates produce a new shard. The hard part is versioning: servers run mixed versions during rollouts, so the reader must support old formats, and every format change forces a decision on rebuilding all shards.",
    k: ["Immutable shard files vs updatable in place: immutable files are simple, safe to cache and copy, but updates mean rebuilds, while in-place updates are cheap and need locking and recovery.", "One file per shard vs a directory of files: one file moves and verifies as a unit, while several files allow independent updates."],
    p: ["A truncated shard file from an interrupted copy loads and gives wrong results unless a checksum is verified.", "Format changes without a version bump crash older readers at query time."],
    v: "Write a shard, flip a byte in it, and confirm the loader rejects it by checksum. Load shards from two format versions on one server and confirm both answer the same queries identically.",
    dep: ["index-compression"]
  },
  "delta-index": {
    s: "A small additional index holding recent changes on top of a large base shard, so new commits become searchable quickly without rebuilding the whole shard.",
    d: "When a repository changes, the indexer builds a small shard for only the changed or added files and records which base documents are deleted or superseded. A query searches the base and delta shards and hides superseded documents. Deltas accumulate until a merge rebuilds a fresh base. This turns a rebuild of a large repository into work proportional to the change. The difficulty is that every delta adds a lookup to each query, and merges must happen before the chain gets long.",
    k: ["Delta shards with periodic merge vs full rebuild per change: deltas give freshness in seconds and add query overhead as they pile up; full rebuilds keep queries fastest and are slow.", "Mark deletions in a mask vs rewrite the base: masks are quick but leave dead data, rewriting reclaims space at the cost of build work."],
    p: ["A long chain of deltas on a hot repository slows queries on its shard noticeably.", "A crash between writing a delta and updating the mask shows a file twice, old and new."],
    v: "Commit a new line to a large repository, and confirm that it is searchable within the target seconds through a delta, that the old version of the file no longer matches, and that after a merge the delta is gone.",
    dep: ["incremental-indexing", "shard-file-format", "deletion-handling"]
  },
  "shard-assignment": {
    s: "The rule that decides which shard each repository belongs to and which servers hold each shard, balancing size, load and failure domains.",
    d: "Repositories are packed into shards of a target size, often by repository so that a repository filter touches few shards. Shards are placed on servers by consistent hashing or a placement service that accounts for disk, memory, current load and failure zones. The assignment is stored in the shard map. It is hard because repository sizes and query popularity are very skewed: a few giant repositories dominate, and putting hot repositories together makes hot shards.",
    k: ["Whole repositories in one shard vs spread documents by hash: repository-local shards make filters cheap and keep related files together, while hashing balances load but forces every query to hit every shard.", "Consistent hashing vs a central placement service: hashing needs no coordinator and moves little data on changes, while a service can use load data and explain decisions."],
    p: ["All the busiest repositories land on the same servers and create a hot spot.", "Assignment ignores failure zones, so one rack failure removes both replicas of a shard."],
    v: "Compute placement for a corpus and confirm no server exceeds the memory budget, no two replicas share a failure zone, and the load estimate across servers is within a stated spread.",
    dep: ["shard-map", "large-repo-splitting"]
  },
  "index-servers": {
    s: "The machines that hold shards in memory-mapped files and answer shard-level queries, doing the lookup, intersection and verification work for their shards.",
    d: "Each server loads its assigned shards at start, maps them into memory, and exposes a query endpoint. It uses a worker pool, per-query memory limits and deadlines, and reports health and load. Servers are sized to hold the working set in the page cache, with fast local disks. They are stateless apart from shard files, which can be refetched from storage. The hard part is cold start: a restarted server has an empty cache and slow first queries, and it takes a long time to pull terabytes of shards.",
    k: ["Local SSDs with shard copies vs remote storage: local disks give fast random reads and require copying shards on replacement, while remote storage simplifies replacement and adds latency.", "Many small servers vs few large ones: small servers limit the damage of a failure and increase fan-out, while large ones reduce fan-out and concentrate risk."],
    p: ["A restart returns the server to the pool before its cache is warm, and it serves slow queries as if healthy.", "One query with a huge candidate set exhausts server memory and takes down other queries on it."],
    v: "Restart a server and confirm it reports not ready until its shards are loaded and warm, then drive a replayed query log and confirm latency percentiles match the pre-restart values.",
    dep: ["memory-mapped-files", "shard-file-format", "page-cache"]
  },
  "replica-sets": {
    s: "Multiple copies of each shard on different servers, providing more query capacity and the ability to survive a server or zone failure.",
    d: "Each shard has two or more replicas, each a full copy loaded on a separate server in a different failure zone. The coordinator spreads queries across replicas by load and sends hedged requests to a second one if the first is slow. New replicas are populated by copying the shard file from storage. Since shards are immutable and built elsewhere, there is no replication protocol between replicas, only copying, which keeps the design simple.",
    k: ["Replicate by copying immutable shards vs build each replica independently: copying guarantees identical results, while independent builds duplicate expensive work.", "Fewer replicas with spare capacity vs many replicas: fewer saves memory and risks overload during a failure, while many costs more and absorbs failures."],
    p: ["Replicas at different index versions return different results to the same query, depending on which one answers.", "Losing a zone drops capacity so far that surviving replicas fall over in a cascade."],
    v: "Take a server down during a replayed query load and confirm that error rate stays below the target, all shards still have a live replica, and latency percentiles remain within the objective.",
    dep: ["index-servers", "shard-distribution", "shard-failover"]
  },
  "shard-rebalancing": {
    s: "Moving shards between servers to even out size and load as repositories grow, servers join or leave, and hot spots appear.",
    d: "A balancer compares each server's disk, memory and query load with the fleet average and plans moves. A move copies the shard to the target, waits for it to load and warm, updates the shard map, and only then removes the source copy, so queries never find a missing shard. Moves are rate-limited to protect query traffic from copy load. The challenge is stability: a naive balancer chases load that fluctuates and moves shards constantly.",
    k: ["Move proactively on a schedule vs only on imbalance thresholds: schedules are predictable and cause churn, thresholds move only when needed and tolerate some imbalance.", "Balance on size vs on query load: size is stable and easy to measure, while load balances real work but changes by the hour."],
    p: ["Updating the shard map before the target is warm sends queries to a cold copy.", "Two balancers act on the same shards and move them back and forth."],
    v: "Add an empty server and confirm shards move onto it gradually until its load is near the average, with zero failed queries during the movement and the old copies removed after.",
    dep: ["shard-map", "index-servers", "shard-distribution"]
  },
  "large-repo-splitting": {
    s: "Dividing very large repositories, such as monorepos, into several shards by directory or hash so no single shard exceeds the size an index server handles well.",
    d: "A repository over a size limit is split into parts, usually by top-level directory or by document id ranges, each indexed as its own shard with the same repository id. A query for that repository fans out to all its parts. Path filters can prune parts when the split follows directories. The hard part is that splitting makes one repository's queries cost many shards, and a uniform split ignores that code concentrates in a few directories.",
    k: ["Split by directory vs by hash: directories keep related files together and let path filters skip shards, while hashing balances size and always touches every part.", "Split at fixed size vs adaptively: fixed size is simple, and adaptive follows growth but needs rebalancing."],
    p: ["A directory-based split gives one shard 70 percent of the code and defeats the purpose.", "Ranking features computed per shard disagree between parts of one repository."],
    v: "Index a monorepo of known size and confirm no shard exceeds the limit, all files are present exactly once across parts, and a query with a path filter touches only the parts containing that path.",
    dep: ["shard-assignment", "path-filter"]
  },
  "shard-failover": {
    s: "Detection of unhealthy servers and automatic routing to healthy replicas, with restoration of lost copies, so a failure does not break queries.",
    d: "Health checks and the coordinator's own error and latency measurements mark a server as degraded or down. Traffic moves to other replicas, and the balancer schedules re-creation of lost replicas elsewhere from stored shard files. Circuit breakers stop sending requests to a failing server. The hard part is partial failure: a server that is slow, not dead, passes shallow health checks and keeps stalling queries, and flapping between healthy and unhealthy causes churn.",
    k: ["Aggressive ejection vs patient: aggressive ejection removes slow servers fast and can eject too many at once during load spikes, while patience tolerates blips and hurts latency.", "Rebuild lost replicas immediately vs wait for the server to return: immediate restores redundancy and floods the network for a brief outage; waiting risks running with one copy."],
    p: ["Health checks that only test the port report a server with a full disk as healthy.", "Ejecting servers during a global slowdown removes capacity and makes it worse."],
    v: "Inject latency on one replica and confirm traffic shifts away within the detection time and recovers when removed. Kill a server and confirm the lost replicas are recreated and the shard count per zone returns to target.",
    dep: ["replica-sets", "shard-map", "query-metrics-and-slos"]
  },
  "shard-distribution": {
    s: "Delivery of newly built shard files from the indexer to the servers that serve them, verifying checksums and switching over atomically.",
    d: "Built shards are uploaded to object storage with their checksums. Servers are told the new shard version through the shard map, download it, verify it, map it into memory and then atomically begin serving it in place of the old one. Old versions remain until no query uses them. Peer-to-peer copying among servers reduces load on storage. It is hard because shards are large, many arrive at once after a format change, and an incomplete or corrupted copy must never be served.",
    k: ["Pull from storage vs push from the indexer: pull lets each server pace itself, while push gives the indexer control and can overload receivers.", "Switch over per shard vs per snapshot of the whole fleet: per shard is quick and mixes versions across a query, while whole-snapshot is consistent and slower."],
    p: ["A download that completes but fails verification and is served anyway returns corrupt results.", "A mass reindex floods storage bandwidth and starves query servers' own reloads."],
    v: "Publish a new shard version and confirm each server verifies the checksum, serves the new version for new queries, completes in-flight queries on the old one, and the old file is deleted afterward.",
    dep: ["object-storage", "shard-file-format", "shard-map"]
  },
  "shard-map": {
    s: "The authoritative table of which shards exist, which repositories each contains, which version is current and which servers hold each replica, consulted by every query.",
    d: "The map is stored in a small consistent store and cached in each coordinator with a version number. It lists shards with repository ids, size, version and replica locations and health. The planner uses it to scope queries to the needed shards, and the balancer and distribution services update it. It is hard because it is on the path of every query and every change: it must be fast to read, strictly consistent when shards move, and available during failures.",
    k: ["Strongly consistent store vs eventually consistent gossip: strong consistency avoids queries to shards that moved, while gossip scales and tolerates partitions but briefly misroutes.", "Cache the map in coordinators vs fetch per query: caching makes lookups free and stale for a moment, while fetching is current and a bottleneck."],
    p: ["A coordinator with a stale map queries a server that dropped the shard and returns partial results with no error.", "The store becoming unavailable stops all queries if coordinators have no cached copy."],
    v: "Move a shard, then confirm in tracing that every coordinator sends later queries to the new location within the cache bound, and that queries during the move return complete results.",
    dep: []
  },
  "repository-discovery": {
    s: "Finding all repositories that should be indexed, from the code hosts and their organizations, applying include and exclude rules and noticing new, renamed, archived and deleted ones.",
    d: "A discovery job lists repositories from each connected host by organization, group or explicit list, applies patterns and size limits, and compares with the catalog. New repositories are queued for indexing, renamed ones are matched by stable host id, and deleted ones are retired. Settings per repository, such as extra branches, come from the catalog or a file in the repository. The difficulty is scale and rate limits: hosts with hundreds of thousands of repositories need paginated, incremental listing.",
    k: ["Index everything by default vs allowlist: default-all gives full coverage and risks indexing scratch and sensitive repositories, while an allowlist is controlled and misses new ones.", "Poll on a schedule vs react to events: polling is simple and slow to see changes, while events are quick and can be lost."],
    p: ["A renamed repository is treated as a new one, so its old index and the new one both appear.", "Forks and mirrors multiply the repository count without adding new code."],
    v: "Create, rename and archive a test repository in the host and confirm the catalog shows the new, renamed and archived states within the discovery interval, with one entry per host id.",
    dep: ["code-host-connectors"]
  },
  "code-host-connectors": {
    s: "Adapters for each code host that handle authentication, listing repositories, fetching code, reading permissions and receiving change events through one common interface.",
    d: "A connector wraps a host's API and clone protocol behind operations such as list repositories, fetch a ref, list permissions and register a webhook. It handles credentials, pagination, retries and rate limits, and normalizes host-specific names and fields. Adding a host means adding a connector. The hard part is the variety and fragility of hosts: APIs change, rate limits are strict, self-hosted versions differ, and outages at the host look like deleted repositories if handled carelessly.",
    k: ["One interface for all hosts vs host-specific features: a common interface keeps the system simple, while host features such as code review links are lost or need extensions.", "Use API access tokens per organization vs a user token: organization tokens are stable and broad, while user tokens give per-user limits and tie to a person who may leave."],
    p: ["A host outage returns an empty repository list and the sync treats every repository as deleted.", "Token expiry stops fetching silently and the index slowly goes stale."],
    v: "Point the connector at a test host, list repositories, fetch a branch and read permissions, then simulate an empty response and confirm the system treats it as an error, not a mass deletion.",
    dep: []
  },
  "source-mirrors": {
    s: "Local bare copies of every indexed repository kept in sync with the host, used as the source for indexing, history views and fetching file contents.",
    d: "A mirror service clones each repository once, then fetches updates incrementally. Indexers read from the mirror, so they never contend with users on the host and can retry freely. Mirrors are sharded across machines like the index and garbage collected regularly. Large repositories use partial clones and shallow history where full history is not needed. The hard parts are disk and network volume, long first clones of huge repositories, and corruption of a mirror after interrupted fetches.",
    k: ["Full mirrors vs fetch on demand: full mirrors make indexing and history fast and local, while on-demand fetching saves storage and makes each operation slow and host-dependent.", "Shallow or partial clones vs full history: much smaller and faster, but blame and history views cannot see older commits."],
    p: ["An interrupted fetch leaves a mirror in a state where a later index builds from a partial tree.", "A force-pushed branch makes the mirror's refs diverge until it is pruned."],
    v: "Push a commit to a test repository and confirm the mirror's branch head equals the host's after the next fetch. Interrupt a fetch mid-transfer and confirm the next one repairs the mirror rather than serving a corrupt copy.",
    dep: ["code-host-connectors", "disk-layout"]
  },
  "change-triggers": {
    s: "The signals that tell the indexer a repository changed: host webhooks for immediate notice, with periodic polling as a backstop for lost events.",
    d: "A webhook receiver verifies the sender, extracts repository and ref, and enqueues an index job, collapsing bursts of pushes into one. A poller periodically compares each repository's head with the indexed one and enqueues differences, which catches missed or never-delivered events. Triggers carry a priority and the time of the change, so freshness can be measured. The difficulty is correctness under duplicates and loss: events arrive twice, out of order or not at all.",
    k: ["Webhooks with polling fallback vs polling only: webhooks give minutes of lag or less and need a public endpoint, while polling is simple and bounded by its interval and load on the host.", "Debounce bursts vs index every push: debouncing saves work for busy repositories, but delays the last change slightly."],
    p: ["Unverified webhooks let anyone trigger expensive indexing of any repository.", "A broken webhook is only noticed when someone reports old results, because polling hides it."],
    v: "Push a commit and confirm an index job is queued within seconds. Disable webhooks and confirm the poller picks up the commit within the polling interval.",
    dep: ["code-host-connectors", "build-scheduling"]
  },
  "branch-selection": {
    s: "The policy for which branches, tags and revisions of each repository are indexed, since each additional one increases index size and build cost.",
    d: "The default is the main branch. Repository settings add patterns for release branches or tags, and a maximum count may apply. The indexer resolves patterns to commit ids at build time and records which branches contain each file. Branches deleted in the host are dropped from the index. The hard part is cost: unlimited branches would multiply the index, but too few mean engineers cannot search the release they maintain.",
    k: ["Configuration in the repository vs central policy: repository files let owners choose and drift, while central policy is consistent and a bottleneck.", "Index release branches by pattern vs by an explicit list: patterns follow new releases automatically and may include unwanted ones, lists are exact and need updating."],
    p: ["A pattern that matches thousands of branches turns one repository into a huge index.", "A deleted release branch remains searchable until a cleanup that never runs."],
    v: "Configure a repository with a release branch pattern, create a matching branch and confirm it becomes searchable and labeled. Delete it and confirm it disappears after the next sync.",
    dep: ["repository-discovery", "revision-filter"]
  },
  "incremental-indexing": {
    s: "Updating the index for only the files that changed between the indexed commit and the new one, reusing everything else.",
    d: "The indexer diffs the old and new commits to list added, modified and deleted paths, and then re-processes only those files: detection, parsing, symbol extraction and n-gram generation. The output is a delta shard, merged into the base later. When the diff is huge or history was rewritten, it falls back to a full rebuild. It is hard because correctness depends on the diff being right, and any state kept across runs, such as a stale document table, can drift from the repository.",
    k: ["Incremental by diff vs rebuild per change: diff-based work is proportional to change and complex, while rebuilds are simple, always correct and expensive for large repositories.", "Trust stored state vs verify periodically: trusting is fast, and a periodic full verification catches drift at a cost."],
    p: ["A missed deletion in the diff leaves removed code searchable indefinitely.", "Bugs in incremental logic make the incremental index differ from a fresh one, and only a comparison finds it."],
    v: "Apply a series of commits incrementally and build a fresh index of the final commit, then compare the two document sets and query results, confirming they are identical.",
    dep: ["source-mirrors", "delta-index", "document-filtering"]
  },
  "document-filtering": {
    s: "The set of rules deciding which files in a commit enter the index: size, binary, generated, ignored paths and per-repository exclusions.",
    d: "As the indexer walks a commit's tree, each file passes through filters in order: ignore patterns from configuration and an ignore file in the repository, binary and size checks, generated and vendored detection, and language rules. Excluded files are recorded with a reason so debugging tools can answer why a file is not searchable. Filters make the index smaller and results cleaner. The hard part is silent loss: an overbroad rule removes real code and nobody notices until a search fails.",
    k: ["Record skipped files with reasons vs drop silently: records cost a little space and make missing results explainable, while silence is smaller and a support burden.", "Central filter rules vs per-repository rules: central rules are uniform, while per-repository rules fit local conventions and need review."],
    p: ["A new generated-file pattern excludes a directory of real source.", "A file skipped for size is still counted in repository totals, so the totals disagree with search."],
    v: "For a repository, list every file in the tree and every file in the index with skip reasons, and confirm each file is either indexed or has a recorded reason, with totals that add up.",
    dep: ["generated-code-detection", "binary-and-minified-filtering", "language-detection"]
  },
  "fork-deduplication": {
    s: "Avoiding duplicate index entries for forks and copies, by indexing shared commits once and keeping only the differing files for each fork.",
    d: "A fork shares most history and files with its parent. The indexer detects forks from host metadata or by matching commit ids, and either skips indexing forks unless they diverge or indexes only files whose content differs from the parent. At query time a result appears once, with a note that forks also contain it. It is hard because forks may diverge substantially, vendored copies are not recorded as forks, and deduplication must preserve the ability to search a fork specifically.",
    k: ["Skip forks by default vs index them: skipping removes huge duplication and hides fork-specific changes, while indexing all keeps everything and multiplies size.", "Deduplicate by content hash vs by repository relationship: content hash catches copies anywhere, while repository relationships are cheap and miss copied files."],
    p: ["A long-lived fork with major changes is skipped and its unique code cannot be found.", "Deduplication by hash hides a result from the repository the user was filtering for."],
    v: "Index a repository and ten forks, and confirm a query matching shared code returns one result with a fork note and that index size is close to one copy plus the differences.",
    dep: ["repository-discovery", "content-store"]
  },
  "index-build-workers": {
    s: "A pool of machines or processes that take index jobs, read from mirrors, build shards and upload them, scaled to the rate of change.",
    d: "Workers pull jobs from a queue, check out the commit from the mirror, run filtering, language detection, parsing and index construction, then write the shard file and register it. They are CPU and memory heavy and scale horizontally; large repositories may take hours. Jobs are idempotent so retries are safe. The difficulty is resource variance: one monorepo build needs far more memory than a thousand small ones, so scheduling must size jobs and isolate failures.",
    k: ["Dedicated big-job workers vs a uniform pool: dedicated workers protect small jobs from monsters, while a uniform pool is simpler and wastes memory on small jobs.", "Build on spot capacity vs reserved: spot capacity is far cheaper and requires jobs that tolerate eviction."],
    p: ["An out-of-memory build on a monorepo is retried forever and blocks the queue.", "Workers with a different parser version from the query path build shards that behave differently."],
    v: "Submit a mix of a tiny and a very large repository, and confirm both finish, the large one on a worker of the right size, with shard checksums registered and no retries beyond the limit.",
    dep: ["source-mirrors", "syntax-parsers", "trigram-index", "shard-file-format"]
  },
  "build-scheduling": {
    s: "Deciding the order and timing of index jobs, so important and fresh changes are built first and no single repository or burst starves the rest.",
    d: "A scheduler takes triggers with priorities and chooses among them using fairness and weights: interactive or recently viewed repositories, size, time since last build and cost. It limits concurrency per repository and per host, and applies backoff to repositories that keep failing. Bursts such as a mass format migration are throttled so they do not delay normal changes. It is hard because freshness goals pull against cost, and starvation is easy to cause.",
    k: ["Priority by importance vs first come first served: priority makes critical repositories fresh and starves low-priority ones, while FIFO is fair and slow for everything under load.", "Retry failed builds immediately vs backoff: immediate retry fixes transient errors fast and floods when the failure is permanent."],
    p: ["A repository with a permanently failing build consumes retries and delays others.", "A migration job at high priority delays all fresh changes for hours."],
    v: "Queue a burst of 1,000 changes plus one important repository's change, and confirm the important change is built first, the queue drains within the target, and no repository waits longer than the starvation bound.",
    dep: ["change-triggers", "index-build-workers", "freshness-tracking"]
  },
});
