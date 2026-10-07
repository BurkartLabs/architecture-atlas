// Details for the code search plate, part 4: freshness, operations, storage, cross-cutting concerns.
ATLAS.details("code-search", {
  "freshness-tracking": {
    s: "Measures the gap between a commit landing in the code host and its appearing in search results, per repository, and shows it to users and operators.",
    d: "Each shard records the commit id it was built from. A tracker compares that with the host's current head and computes lag, publishing percentiles and per-repository staleness. The UI can show the indexed commit and age beside results, and the API can ask for results only from at least a given commit. Alerts fire when lag exceeds the objective. The hard part is defining freshness honestly: lag has queue time, build time and distribution time, and an average hides the repositories that are hours behind.",
    k: ["Show indexed commit to users vs hide it: showing it explains missing results and invites mistrust, while hiding it looks cleaner and causes confusing bug reports.", "Track per repository vs fleet average: per repository finds neglected ones, and averages are easier to alert on but hide the tail."],
    p: ["Measuring lag only from build start misses a day spent waiting in the queue.", "A repository whose triggers broke shows lag of zero because the tracker only measures repositories with pending jobs."],
    v: "Push a commit, record the time, and poll a search for a unique string in it. The measured delay must match the lag the tracker reports to within a few seconds.",
    dep: ["shard-map", "change-triggers"]
  },
  "index-version-compat": {
    s: "The rules letting servers, builders and coordinators of different software versions work together, so a format or behavior change can roll out without downtime.",
    d: "Each shard declares its format version and the query protocol has its own version. Readers support the current and previous formats, and the coordinator sends only features that every involved server supports. Changes follow expand-then-contract: first release readers that understand the new format, then start writing it, then retire the old one. It is hard because the fleet is never uniform during a rollout, and a change to something like case folding alters results, not just layout.",
    k: ["Support N-1 versions in readers vs require lockstep upgrades: support allows gradual rollout and doubles testing, while lockstep is simple and requires downtime or a full-fleet switch.", "Version the query protocol separately vs with the index format: separate versions let the two evolve independently and need a compatibility matrix."],
    p: ["A new reader released before all shards are migrated meets old files it cannot open.", "A behavior change in tokenization lands without a version bump, and old and new shards disagree on matches."],
    v: "Run a mixed fleet with one server on the new version and others on the old, send a replayed query load, and confirm results are identical to a single-version fleet and no errors occur.",
    dep: ["shard-file-format"]
  },
  "reindexing-and-migration": {
    s: "Rebuilding all or part of the index to adopt a new format, parser, language rule or filter, while keeping the old index serving until the new one is ready.",
    d: "A migration plans a rebuild of every shard with the new code, runs it at low priority, and swaps shards in as they finish. Progress is tracked per shard and the result verified by sampling queries against old and new. A full rebuild of a large corpus takes days and heavy compute, so it is staged by importance. The difficulty is capacity and risk: the rebuild competes with normal changes for workers, and a bug in the new build is propagated to the whole corpus unless a canary is checked first.",
    k: ["Rebuild everything vs lazily on next change: rebuilding all gives uniform behavior quickly and costs a lot, while lazy rebuilds are free and leave a long tail of old shards.", "Canary a small set first vs roll out broadly: canarying catches bugs before they spread, and delays the benefit."],
    p: ["A migration that raises load on the mirrors slows fresh updates throughout.", "No comparison of old and new results lets a regression ship unnoticed."],
    v: "Rebuild a canary set of shards with the new code and compare results of a replayed query log between old and new. Expect differences only where intended, and confirm freshness lag stays within the objective during the run.",
    dep: ["index-build-workers", "index-version-compat", "shard-distribution"]
  },
  "deletion-handling": {
    s: "Making deleted files, removed repositories and rewritten history disappear from search promptly, including the content, names, symbols and cached results.",
    d: "A deleted file appears in the next diff and is marked superseded in a delta mask; a removed repository has its shards dropped and map entries deleted; a force push that rewrites history triggers a rebuild of the affected branch. Caches keyed by index version are naturally invalidated. Legal removals, such as leaked secrets or takedown requests, need an expedited path that rebuilds and purges mirrors and backups. It is hard because deleted data lingers in many places, such as old shard versions, caches and backups.",
    k: ["Mask deletions until the next merge vs rewrite immediately: masks are instant and keep the dead bytes, while rewrites remove them at the cost of a build.", "Treat force pushes as full rebuilds vs trust the diff: rebuilds are always right and expensive, while the diff is cheap and can be wrong when history is rewritten."],
    p: ["A purged secret remains in an old shard version or backup and in the audit log.", "A removed repository's names still appear in suggestions served from a stale cache."],
    v: "Delete a file containing a unique string and confirm it stops matching within the freshness objective. Remove a repository and confirm no shard, suggestion or cached result references it afterward.",
    dep: ["delta-index", "incremental-indexing", "garbage-collection"]
  },
  "garbage-collection": {
    s: "Reclaiming space from old shard versions, stale deltas, orphaned mirrors and unreferenced content so storage does not grow without bound.",
    d: "Collectors scan the shard map to find shard files no longer referenced by any current version, delete them after a grace period that covers in-flight queries, and merge or drop old deltas. Mirror collectors prune unreachable objects and repositories removed from the catalog. Object storage lifecycle rules remove expired uploads. It is hard because deleting too soon removes data a slow query or a rollback needs, and deleting too late wastes disk until a server fills up.",
    k: ["Grace period before deletion vs immediate: a grace period supports rollback and slow readers at a cost in disk, while immediate deletion frees space and risks failing queries.", "Collect centrally vs on each server: central collection sees the whole map and is a single point of work, while local collection is simple and cannot know what is referenced elsewhere."],
    p: ["A collector with a stale map deletes a shard that was just promoted.", "Disks fill because collection failed for weeks without any alert."],
    v: "Publish a new shard version and confirm that after the grace period the old file is gone from the server and storage, while a query started before the swap completes successfully.",
    dep: ["shard-map", "object-storage"]
  },
  "query-metrics-and-slos": {
    s: "The measurements and targets that define a healthy service: latency percentiles, error and truncation rates, freshness lag, and the budget each is allowed to burn.",
    d: "Coordinators and servers emit counters and histograms: request latency at several percentiles, shard fan-out, candidates per query, timeouts, partial results and cache hits. Service objectives set targets such as the 95th percentile under a second. Dashboards break results down by query shape, because a broad regex and an exact string have very different costs. It is hard because averages are misleading: the tail determines experience, and one expensive query class can hide inside healthy overall numbers.",
    k: ["Measure by query class vs overall: classes explain regressions and need a classifier and more metrics, while overall numbers are simple and hide where the problem is.", "Count partial results as failures vs successes: counting them as failures shows incomplete answers honestly, while counting them as successes makes the objective easy to meet."],
    p: ["Alerting on mean latency misses a tail that has become unusable.", "Truncated results counted as success hide an index that no longer covers the corpus."],
    v: "Replay a recorded query log through a staging service and confirm the dashboard's percentiles match the replay harness's own measurements, and that injected slowness on one shard triggers the alert.",
    dep: ["query-coordinator", "tracing"]
  },
  "query-logging": {
    s: "A record of each query's text, scope, plan, timing and result counts, used for performance analysis, ranking evaluation and replay in tests.",
    d: "Coordinators write structured log entries per query: normalized text, filters, user identity or a pseudonym, planned shards, per-stage timing, candidate and result counts, and truncation. Logs feed analysis of slow queries and are sampled for replay in load tests. Retention and access are limited because queries often include code and identifiers. The difficulty is privacy and volume: queries are sensitive, volume is high, and the most useful logs for debugging are the least safe to keep.",
    k: ["Log full text vs normalized shape: full text allows exact replay, while normalized shapes protect content and lose the ability to reproduce.", "Log everything vs sample: complete logs help investigations, while sampling cuts cost and misses rare events."],
    p: ["A pasted credential in a query lands in a log that many engineers can read.", "Logs without the index version make a slow query impossible to reproduce later."],
    v: "Run a query and find its log entry with plan, per-stage times and counts. Replay a sample of logged queries on staging and confirm result counts match within a stated tolerance.",
    dep: ["query-coordinator"]
  },
  "tracing": {
    s: "Distributed traces following each query from the coordinator through every shard request, showing where time goes and which shard or stage was slowest.",
    d: "A trace id is created at the coordinator and sent with each shard request. Spans record planning, each shard's postings read, intersection, verification and merge, with attributes such as candidates and bytes read. Traces are sampled, with slow and failed queries always kept. They allow answers to why one query took four seconds. It is hard because fan-out creates hundreds of spans per query, so storing all of them is expensive, and sampling must keep the interesting ones.",
    k: ["Tail-based sampling vs random sampling: tail-based keeps the slow and failed queries and requires buffering spans until the query ends, while random is simple and misses rare cases.", "Detailed spans inside the shard vs coordinator-level only: detail shows exactly where time goes and adds overhead on the hot path."],
    p: ["Missing trace propagation on a retry path makes the slow part invisible.", "Span attributes with query text leak sensitive strings into the tracing system."],
    v: "Run a deliberately slow query and find its trace, confirming it shows each shard, the slowest shard's stage breakdown and total time equal to the observed latency within a small margin.",
    dep: ["query-coordinator", "shard-fanout"]
  },
  "rate-limiting": {
    s: "Limits on how many queries, how much compute and how many results each user, token or client may consume, applied at the front door and per shard.",
    d: "Limits are set per user and per token as requests per second plus a cost budget based on estimated work, such as candidates scanned. Interactive traffic gets priority over bulk scripts via separate queues. Exceeding a limit returns a clear throttling response with a retry time. Per-shard protections, such as concurrency caps, prevent one expensive query from taking all workers. It is hard because cost is only known after execution, so limits mix up-front estimates with in-flight cancellation.",
    k: ["Limit by request count vs by cost: counts are simple and treat a trivial and a huge query the same, while cost-based limits are fair and need estimates.", "Separate lanes for interactive and bulk vs a shared pool: lanes keep people fast and leave capacity idle, while a shared pool uses everything and lets bots slow people."],
    p: ["A single bot looping on a broad pattern slows search for the entire company.", "Limits without a retry-after hint make clients retry in a tight loop."],
    v: "Run a script at twice the allowed rate and confirm the excess is rejected with a retry time while a concurrent interactive user keeps normal latency.",
    dep: ["query-coordinator", "query-planner"]
  },
  "capacity-planning": {
    s: "Estimating the servers, memory, disk and build workers needed for the corpus and query load, and projecting growth ahead of time.",
    d: "Planners model index size as a multiple of source size, memory as the share of the index that must be hot, and query cost from fan-out and candidates. They use growth rates of repositories and code, query rates and peak hours, and failure headroom for losing a zone. Load tests with replayed logs validate the model. The difficulty is that code grows unevenly and ingesting one huge repository or a format change can double needs overnight.",
    k: ["Provision for peak with headroom vs scale up automatically: provisioning is simple and wastes capacity, while autoscaling needs fast shard loading that cold caches make slow.", "Keep the whole index in memory vs hot subset: all in memory gives stable latency at high cost, while a hot subset is cheaper and has slow tails."],
    p: ["Planning on average load leaves no room for the Monday morning peak or a zone failure.", "Index growth from a new language or a larger gram scheme is not forecast and fills disks."],
    v: "Replay a peak-hour query log at 1.5 times the rate against a staging fleet sized by the plan, with one zone removed, and confirm latency objectives are still met.",
    dep: ["query-metrics-and-slos", "index-servers"]
  },
  "config-and-rollout": {
    s: "Distributing settings and new software versions to the fleet safely, with staged rollout, quick rollback and visibility into what version each machine runs.",
    d: "Configuration such as ranking weights, limits, language rules and feature switches is stored in version control and pushed to services with validation. Software and config changes roll out gradually: a canary slice first, compared against the rest on latency and result quality, then wider. Ranking changes are tested offline on judged queries and online with experiments. The hard part is that a bad config can silently degrade results rather than crash, so health checks must include quality signals.",
    k: ["Config separate from code releases vs bundled: separate config changes quickly, but a config can then break a binary that does not expect it, while bundling is consistent and slower.", "Ranking experiments on live users vs offline only: live experiments measure real behavior and expose some users to worse results; offline is safe and less representative."],
    p: ["A ranking weight pushed fleet-wide without a canary buries correct results for everyone.", "Machines running different config versions give different answers to the same query."],
    v: "Roll a config change to a canary slice, confirm the slice reports the new version and metrics diverge as expected, then roll back and confirm all machines report the old version within the rollback target.",
    dep: ["query-metrics-and-slos"]
  },
  "abuse-protection": {
    s: "Defenses against queries and clients that harm the service or the code: catastrophic patterns, bulk scraping of source, and attempts to probe for hidden repositories.",
    d: "Protections include limits on pattern complexity and time, per-query memory caps, detection of unusually broad or numerous queries from one account, and bulk-export restrictions. Alerts fire on credential-format searches by accounts that do not normally search for them. Responses to hidden repositories must look the same as to nonexistent ones. It is hard because legitimate refactoring tools look like scrapers, and every limit has a valid user whom it blocks.",
    k: ["Block automatically vs alert for review: automatic blocks stop damage quickly and hit valid users, while review is accurate and slow.", "Restrict bulk result export vs allow with logging: restriction reduces mass copying, while logging respects workflows and relies on later detection."],
    p: ["A regular expression crafted for exponential backtracking ties up workers until it hits a time limit.", "Error messages that differ for hidden and missing repositories allow enumerating private project names."],
    v: "Submit a known pathological pattern and confirm it is rejected or cut off within the time limit without affecting other queries. Probe a hidden repository name and confirm the response is identical to a nonexistent one.",
    dep: ["rate-limiting", "search-audit-log", "literal-and-regex-terms"]
  },
  "object-storage": {
    s: "Durable storage for built shard files, source mirrors' archives and uploaded code intelligence data, from which servers fetch what they need.",
    d: "Builders upload shards with checksums and metadata; servers download them on assignment. Storage provides durability and cheap capacity, so index servers hold only cached copies and can be replaced from it. Lifecycle rules expire old versions, and replication across zones guards against loss. It is hard because shard files are large and arrive in bursts, bandwidth is finite, and eventual consistency on listings can make a just-uploaded shard briefly invisible.",
    k: ["Object storage as the source of truth vs local disks only: storage makes servers disposable and adds a download step to every recovery, while local-only is faster and loses data with a disk.", "Store whole files vs chunks: whole files are simple, while chunks allow resumable parallel transfer and ranged reads."],
    p: ["Registering a shard in the map before the upload is visible makes servers fail to fetch it.", "Unbounded retention of old versions grows the bill and the listing time."],
    v: "Upload a shard, delete the server's local copy, and confirm the server restores it from storage with matching checksum and serves queries again within the recovery target.",
    dep: []
  },
  "memory-mapped-files": {
    s: "Mapping shard files directly into a server's address space so the operating system loads pages on demand and shares them across processes without copying.",
    d: "A server opens each shard read-only and maps it. Accessing a posting list or a block of content faults in just those pages from disk, and the kernel keeps hot ones cached. Many shards can be mapped even if their total size exceeds RAM, and a restart finds a warm cache if the files are still cached. It is hard because page faults are invisible latency: a cold page costs a disk read in the middle of a query, and the program cannot easily control eviction or prefetch.",
    k: ["Memory mapping vs explicit read calls with own cache: mapping is simple, zero-copy and shares the OS cache, while explicit reads give predictable I/O and control and duplicate memory.", "Lock hot sections in memory vs let the OS decide: locking guarantees latency for key structures and reduces memory for everything else."],
    p: ["A mapped file on a failing disk raises a fault that crashes the whole process instead of returning an error.", "Overcommitting mapped size relative to RAM causes thrashing under broad queries."],
    v: "Drop the OS cache, run a query, and compare latency to a repeat run. Confirm the first run reads from disk, the second is served from memory, and the page fault counter explains the difference.",
    dep: ["page-cache", "shard-file-format"]
  },
  "page-cache": {
    s: "The memory the operating system uses to hold recently read shard pages, which determines whether queries run at memory speed or disk speed.",
    d: "Index servers are sized so that the frequently touched parts of their shards, mainly trigram tables, common postings and hot content blocks, fit in the cache. The service avoids evicting them by limiting other memory use, warming the cache after restarts by reading key sections, and advising the kernel about access patterns. Query cost is dominated by whether a posting list read hits memory. The difficulty is that a single wide scan can evict the working set.",
    k: ["Warm cache proactively vs on demand: proactive warming makes restarts fast and delays readiness, while on demand is simple and exposes users to cold queries.", "Isolate scan-heavy queries vs share one cache: isolation protects the working set and complicates memory accounting."],
    p: ["A bulk scan from one script evicts the hot set and every user sees a slow period.", "Running other memory-hungry software on the same server shrinks the cache without any alert."],
    v: "Run a query mix, then a wide scan, then the mix again, and confirm the second run's latency and cache hit ratio return to within a small margin of the first.",
    dep: ["memory-mapped-files", "disk-layout"]
  },
  "disk-layout": {
    s: "How shards, mirrors and temporary build data are placed on disks, with attention to sequential reads, separation of workloads and space for growth.",
    d: "Index servers use fast local solid-state disks for shards, formatted with a file system suited to large read-mostly files. Mirrors and builders use larger, cheaper volumes. Build scratch space is separate so builds cannot fill the disk holding live shards. Within a shard file, sections are ordered so frequently used data is contiguous. The hard part is free space: a new shard version must coexist with the old during the swap, so disks need headroom of one extra version.",
    k: ["Dedicated disks for serving vs shared with builds: dedicated disks keep latency steady, while shared ones use space better and let build I/O hurt queries.", "Reserve headroom for two versions vs tight packing: headroom makes swaps safe and costs capacity, while tight packing risks a full disk mid-swap."],
    p: ["A swap onto a disk with no room for two versions fails halfway and leaves the server with neither.", "Mirror garbage collection running on the serving disks stalls queries."],
    v: "Check each server's free space exceeds the size of its largest shard, then perform a swap under load and confirm no failed queries and that disk use returns to normal after cleanup.",
    dep: []
  },
  "index-backup": {
    s: "Keeping recoverable copies of the metadata and, where needed, the shards, so the service can be restored after a loss of storage, a bad migration or an operator mistake.",
    d: "Shards are rebuildable from source mirrors, so backups focus on what is not: the shard map, repository catalog, permission data, uploaded code intelligence data and configuration. Object storage versioning protects shards. Restore drills rebuild from scratch to measure how long recovery takes, which for a large corpus is days, so keeping shard copies in a second region shortens it. The hard part is knowing the real recovery time, which only a drill can tell.",
    k: ["Back up shards vs rebuild from source: backups restore quickly and cost storage, while rebuilds are free until needed and take days.", "Back up uploaded precise data vs regenerate: regenerating needs every repository's build to run again, so uploads are often worth keeping."],
    p: ["Backups never restored in a test turn out to be incomplete when needed.", "A restore of an old shard map points at shards already garbage collected."],
    v: "Restore the catalog, shard map and uploaded data into an empty environment, rebuild or copy shards, and confirm queries return the same results as production for a sample, with the elapsed time recorded.",
    dep: ["object-storage", "shard-map"]
  },
  "permission-model": {
    s: "The decision of what results a user may see and how that is enforced across index, cache, logs and navigation, shaping every layer that touches code content.",
    d: "Options range from no filtering (everyone sees everything), through per-repository access mirroring the code host, to per-path rules. The choice decides what shards store, how caches are keyed, whether suggestions can be shared, and how much work each query does. Once chosen, every new feature, such as embeddings or alerts, must be built under it. Retrofitting permissions onto a system built without them usually means a rewrite, because leaked data is spread across components.",
    k: ["Mirror host permissions vs own the model: mirroring avoids two sources of truth and inherits sync delays, while an own model is flexible and duplicates administration.", "Filter early in shards vs late at the coordinator: early filtering is efficient and spreads the security logic, while late filtering concentrates it and wastes work."],
    p: ["A new feature added later, such as suggestions, forgets to apply filtering and leaks private names.", "Different parts of the system hold different permission versions, giving inconsistent results."],
    v: "For a matrix of test users and repositories, run every kind of request (search, counts, suggestions, navigation, alerts, API) and confirm none returns anything a user could not open directly in the host.",
    dep: ["permission-filtering", "permission-sync", "repository-visibility"]
  },
  "freshness-vs-cost": {
    s: "The decision of how quickly changes must appear in search, against the build, storage and query overhead that each increment of freshness costs.",
    d: "Seconds-level freshness needs webhooks, delta shards and frequent merges; hours-level freshness allows batch rebuilds that are simpler and cheaper. Different repositories may deserve different tiers. The target also sets how long deletions linger and how many deltas queries must consult. Choosing it early matters because it dictates the architecture of indexing, distribution and the shard format, and it is the number users notice most when it is wrong.",
    k: ["Near real-time deltas vs periodic batch builds: deltas give fresh results and add moving parts and query overhead, while batches are simple and leave a window of staleness.", "Uniform freshness vs tiers by importance: tiers focus cost where it matters and require a policy and exceptions."],
    p: ["Users find their own commit missing for ten minutes and stop trusting the tool for recent work.", "Promising freshness without measuring it makes the real figure drift."],
    v: "Measure end-to-end lag from commit to searchable for a sample of repositories across a week, and confirm the stated percentiles of lag are met for each tier.",
    dep: ["freshness-tracking", "delta-index", "change-triggers"]
  },
  "exactness": {
    s: "The decision whether a result list must be complete and exact like grep, or may be approximate, truncated and ranked like a web search, which changes the index, planner and interface.",
    d: "Exact mode returns every match and supports counts and refactoring, but cost grows with the number of matches. Ranked mode returns the best first and stops, which keeps latency flat and makes totals approximate. Most systems offer both through limits and flags, and should be explicit about which one a given response is. The decision shapes early termination, merging, pagination and what scripts can rely on.",
    k: ["Complete results by default vs ranked and truncated: completeness serves refactoring and audits at unbounded cost, while truncation serves reading and navigation and cannot prove absence.", "One mode for all clients vs separate modes for people and bots: one mode is simpler to explain, while separate modes let bulk callers pay for completeness."],
    p: ["A script treats a truncated list as the full set and refactors only part of the code.", "A user concludes a function is unused because the first page showed no callers."],
    v: "Run a query with known total of 50,000 matches in exact mode and confirm all are returned with a correct count, and in ranked mode confirm the response is flagged truncated with a count marked approximate.",
    dep: ["early-termination", "result-merging", "results-page"]
  },
  "memory-vs-disk": {
    s: "The decision of how much of the index must be held in memory for the latency target, and the cost and failure behavior that follows from that choice.",
    d: "An index fully resident in memory gives low and stable latency and needs many large machines; an index mostly on solid-state disk costs far less, and its tail latency depends on cache hit rates. The choice affects shard size, replica counts, restart behavior and how queries are shaped to avoid scanning. It is revisited as the corpus grows, because the hot set does not grow as quickly as the total, and a design that assumes all in memory breaks the budget.",
    k: ["All in memory vs disk-backed with a hot set: memory gives predictable latency at high cost per gigabyte, while disk-backed is cheaper and has slow tails on cold queries.", "Compress harder to fit in memory vs keep fast to decode: compression fits more, and decoding spends CPU on every query."],
    p: ["Growth pushes the working set beyond memory and latency worsens gradually until it is a crisis.", "Cost estimates assume the hot set but the load test used only popular queries."],
    v: "Run a replayed query mix with the page cache limited to the planned hot-set size and confirm latency objectives are met. Reduce it by 25 percent and record the degradation, to know the margin.",
    dep: ["page-cache", "index-compression", "capacity-planning"]
  },
  "language-coverage": {
    s: "The decision of which languages receive deep support, such as parsers, symbols and precise navigation, and which are treated as plain text, and how new ones are added.",
    d: "Text search works for any language, since it needs only bytes. Symbols, structural queries, definition ranking and navigation each need per-language work, and precise navigation needs build integration per ecosystem. Organizations usually choose a core set by usage and add others on demand. The decision affects ranking consistency, since languages with symbol data rank better than those without, and sets expectations for what navigation can do.",
    k: ["Deep support for a few languages vs shallow for many: depth gives accurate navigation where most code lives, while breadth gives uniform but approximate features.", "Pluggable language modules vs built-in: plugins let teams add languages and need a stable interface and sandboxing, while built-in is consistent and slower to extend."],
    p: ["Teams in unsupported languages see weaker results and conclude the tool is not for them.", "A language added without ranking calibration floods results or never appears."],
    v: "For each supported language, run a standard checklist (symbol search, definition, references, structural query) against a sample repository and confirm each capability works or is explicitly documented as unsupported.",
    dep: ["language-detection", "syntax-parsers", "build-integrated-indexers"]
  },
  "secrets-in-code": {
    s: "The reality that source code contains credentials, personal data and licensed text, so indexing it makes them searchable and demands a policy for detection, access and removal.",
    d: "A search engine makes any committed secret easy to find, by users and attackers alike. Policies include scanning for credential patterns at index time and flagging or excluding them, alerting owners, restricting who can search certain patterns, and an emergency purge path. Detection has false positives and misses encoded values. The decision to treat the search index itself as sensitive data affects storage encryption, logging, cache contents and backup retention across every layer.",
    k: ["Exclude detected secrets from the index vs index and alert: excluding limits spread and hides evidence needed to rotate them, while indexing helps find all copies and keeps them searchable.", "Allow anyone to search for credential formats vs restrict: open search helps defenders find leaks and equally helps misuse, so restriction needs monitoring."],
    p: ["A purged secret is still in old shards, caches, logs and backups and keeps being served.", "Rotation is skipped because teams assume deleting the commit is enough."],
    v: "Commit a test credential, confirm it is flagged within the freshness objective, then run the purge path and confirm it is gone from shards, caches, snippets, logs and backups, and that the audit trail records it.",
    dep: ["search-audit-log", "deletion-handling", "document-filtering"]
  },
});
