// Details for the artifact repository plate, part 5: availability, operations and cross-cutting concerns.
ATLAS.details("artifact-repository", {
  "cluster-nodes": {
    s: "Several repository servers sharing one metadata database and content store, so capacity grows and any one node can fail without stopping service.",
    d: "Every node runs the full service and is interchangeable for client requests. They coordinate through the shared database, the shared or replicated content store and an invalidation channel for caches. Singleton work such as cleanup and index rebuilds is assigned to one node at a time. Nodes join and leave with a membership mechanism. The hard parts are what must be shared, since local caches and staging areas are not, and what happens when nodes disagree about who is running singleton jobs after a network partition.",
    k: ["Active-active nodes vs one active and standbys: active-active uses all capacity and requires every shared resource to cope; standbys are simpler and waste hardware.", "Shared content store vs per-node copies: shared is simple and a single point of failure; per-node needs replication between nodes and tolerates storage loss."],
    p: ["Two nodes both running the same cleanup job after a partition, deleting the same content twice or racing each other.", "Node-local staging space exhausted on one node while others are idle, because the balancer ignored it."],
    v: "Stop one of three nodes during a sustained load of uploads and downloads and confirm no client sees errors beyond a retryable blip, and that cleanup keeps running on exactly one remaining node.",
    dep: ["metadata-database","metadata-cache","load-balancing","job-scheduler"]
  },
  "load-balancing": {
    s: "Distributes client requests across repository nodes, checking their health and spreading load so no single node is saturated or serving after it has failed.",
    d: "A balancer in front receives all traffic, sends requests to nodes that pass health checks and removes the unhealthy. Downloads are long streams, so connection counts matter more than request counts. Uploads may need stickiness for multi-part sessions unless any node can finish them. TLS is terminated at the balancer or passed through. The hard parts are health checks that reflect real ability to serve, not just a running process, and draining nodes gracefully so a long download is not cut off during maintenance.",
    k: ["Least connections vs round robin: least connections adapts to long downloads and uneven nodes, while round robin is simple and can pile long streams onto one node.", "Session affinity for uploads vs stateless nodes: affinity is easy and lost when a node dies; shared session state survives failure and costs coordination."],
    p: ["A health check that tests only the HTTP port keeps routing to a node whose database connection is gone.", "Removing a node without draining, cutting off multi-gigabyte downloads in progress."],
    v: "Break one node's database connection and confirm the balancer stops sending it traffic within the check interval, while an in-flight download on a draining node completes before it stops.",
    dep: ["cluster-nodes","metrics-and-health","http-server"]
  },
  "push-replication": {
    s: "Copies new and changed artifacts from a source repository to one or more targets as they arrive, so other sites have the content before anyone asks.",
    d: "On each change event the source sends the file and its metadata to the target's API, with retries and a queue per target. It can be event-driven for immediacy or scheduled for efficiency, and may cover selected repositories or paths. Content already present at the target is detected by digest and not resent. It is used to feed distant offices and disaster recovery sites. The difficulty is falling behind: a slow link accumulates a backlog, deletes and overwrites must replicate correctly, and conflicting local writes at the target must be forbidden or resolved.",
    k: ["Event-driven push vs scheduled batch: event-driven keeps targets current and amplifies bursts; scheduled smooths load and widens the staleness window.", "Replicating deletes vs additive only: replicating deletes keeps sites identical, while additive protects against a mistaken delete spreading everywhere."],
    p: ["A queue backlog on a slow link growing for days with nobody alerted until a site needs a new release.", "A mistaken bulk delete at the source faithfully replicated to every target."],
    v: "Publish a file at the source and measure how long until the target serves it with the same digest. Take the link down, publish ten more, restore it, and confirm the backlog drains in order.",
    dep: ["event-stream","job-scheduler","content-addressed-store","management-api"]
  },
  "pull-replication": {
    s: "A target site fetches content from a source on a schedule or on demand, caching what its local users need without the source knowing about it.",
    d: "The remote site is configured with the source as an upstream and pulls selected repositories, either everything on a timetable or individual files on first request. Because the target initiates, it works across firewalls and for sites that are only intermittently connected. On demand pulling behaves like a proxy to another repository. It places control with the receiving team. The hard parts are deciding what to prefetch, verifying content by digest as it arrives, and handling sources that change while a pull is running.",
    k: ["Prefetch on schedule vs fetch on demand: prefetch gives predictable local speed and copies unused content; on demand copies only what is used and makes the first request slow.", "Pull from the origin vs from the nearest replica: the nearest reduces long-haul traffic and can propagate a stale or corrupt copy."],
    p: ["A first request for a large release at a remote site waiting minutes for the long-haul transfer.", "Pulling from a replica that is itself behind, so a site never sees the latest version."],
    v: "Request a never-seen artifact at the remote site, confirm it is pulled and its digest verified, then disconnect from the source and confirm the second request is served locally.",
    dep: ["proxy-repository","integrity-verification","multi-site-topology"]
  },
  "multi-site-topology": {
    s: "The arrangement of repositories across sites: which is the authority for each repository, who replicates to whom, and which site clients should use.",
    d: "Common shapes are a single primary with read-only replicas, a hub with regional spokes, and a mesh where every site is authoritative for some repositories. The topology records, per repository, where writes are allowed and how changes flow. A clear rule that a given path has exactly one writable home avoids conflicts. It also determines recovery: which site takes over if the primary is lost. The difficulty is organizational as much as technical, since teams want local writes and the design needs one authority to stay consistent.",
    k: ["Single authoritative writer per repository vs multi-writer: one writer avoids conflicts entirely and adds latency for distant publishers; multi-writer is fast and needs conflict resolution.", "Hub-and-spoke vs mesh: hub-and-spoke is simple to reason about and funnels through one site; mesh is resilient and complex to monitor."],
    p: ["Two sites both accepting a publish of the same version, producing different content under one name.", "No documented promotion of a replica to primary, so a disaster becomes an improvised procedure."],
    v: "Publish to a repository's authoritative site and confirm it appears at each replica, then attempt a write at a replica and confirm refusal. Run the documented failover drill and time it.",
    dep: ["push-replication","pull-replication","immutability-enforcement"]
  },
  "edge-caching": {
    s: "Caches downloads close to clients, in front of or beside the repository, so repeated fetches of popular files do not cross the network each time.",
    d: "An edge cache holds copies of immutable content addressed by digest or versioned path, serving later requests locally. It is a content delivery layer or a small proxy repository at each office or build farm. Because releases never change, they can be cached for a long time, while index files need short lifetimes. The hard parts are cache invalidation for the few mutable things, preserving authorization when the edge serves cached private content, and the loss of download statistics at the origin.",
    k: ["Long lifetime for immutable files and short for indexes vs one lifetime: splitting by mutability gets high hit rates without stale resolution; a single lifetime must be a compromise.", "Edge enforces authorization vs origin only: enforcing at the edge protects private content and requires token validation there; origin-only is simple and leaks cached private files."],
    p: ["A long-lived cache of an index file making a new release invisible to a whole office for an hour.", "A cached private artifact served to an unauthenticated request because the edge did not check permissions."],
    v: "Download a large release twice from a client at the edge site and confirm the second request is served locally from the cache with matching digest and no origin request in the log.",
    dep: ["range-requests","proxy-repository","usage-tracking"]
  },
  "geo-routing": {
    s: "Directs each client to the nearest or fastest repository site, usually by name resolution or by the balancer, and moves them elsewhere when a site fails.",
    d: "A global name resolves to different sites depending on the client's location or measured latency, with health checks removing failed sites. Combined with replication, it gives each office local speed and automatic failover. Clients use a single address in their configuration. The hard parts are keeping the resolver's view of health current, the lifetime of cached name answers, and routing a client to a site that does not yet hold the content it asked for because replication lags.",
    k: ["Latency-based routing vs fixed regional assignment: latency adapts to real conditions and can flap; fixed is predictable and ignores a degraded link.", "Short resolver cache lifetime vs long: short follows failures quickly and raises resolver load; long is cheap and keeps clients on a dead site."],
    p: ["A client routed to a nearby replica that lacks a fresh release, so the build fails with not-found.", "Cached name answers keeping clients on a failed site long after it was removed."],
    v: "Resolve the global name from clients in two regions and confirm each gets its local site. Fail one site and confirm clients there reach another within the resolver lifetime.",
    dep: ["multi-site-topology","load-balancing","metrics-and-health"]
  },
  "failover": {
    s: "The procedure and mechanism by which service continues on another node or site when the active one fails, including promotion of replicas and redirection of clients.",
    d: "Within a cluster, the balancer drops failed nodes automatically. For the database and for site loss, failover means promoting a replica to primary, pointing nodes and clients at it, and making sure the old primary cannot accept writes if it returns. Replication lag decides what is lost. Automatic failover is fast and risks split-brain, and manual failover is deliberate and slower. Practiced drills matter more than design here, because untested failover plans fail for mundane reasons such as expired credentials.",
    k: ["Automatic promotion vs manual decision: automatic minimizes downtime and risks promoting during a brief partition; manual avoids mistakes and extends the outage.", "Synchronous database replication vs asynchronous: synchronous loses no committed metadata and slows every write; asynchronous is fast and can lose the latest changes."],
    p: ["The old primary returning and accepting writes, producing two diverging databases.", "Failover to a replica whose content store lacks blobs the database already references."],
    v: "Kill the primary database in a staging environment with live traffic, measure time to restored service, then compare node and blob counts to prove no committed artifact was lost or left dangling.",
    dep: ["cluster-nodes","metadata-database","multi-site-topology","backup-restore"]
  },
  "backup-restore": {
    s: "Periodic copies of the metadata database and content store that allow the repository to be rebuilt after loss, corruption or a destructive mistake.",
    d: "Two things must be backed up consistently: the database, which names everything, and the blobs it refers to. Backups of the database are taken often and the content store is copied incrementally, or protected by the storage service's own versioning. A restore must produce a pair that agree, and the safe order is to write content first and metadata last. Because content is immutable, copying it is cheap. The difficulty is verifying that restores actually work, and the time a full restore takes at large scale.",
    k: ["Backup the database more often than content vs together: separately is cheap and needs the content backup to be at least as new as the database; together is simple and heavy.", "Replica as backup vs independent snapshots: a replica is current and replicates mistakes and corruption; snapshots are older and protect against both."],
    p: ["Restoring a database newer than the content backup, leaving nodes that point at blobs that were never copied.", "Backups never test-restored, found unreadable on the day they are needed."],
    v: "Restore the latest backup into an isolated environment, run an integrity scan comparing every node to its blob, and download a random sample of one hundred artifacts, confirming zero mismatches.",
    dep: ["metadata-database","content-addressed-store","integrity-verification"]
  },
  "shared-storage-consistency": {
    s: "Keeping every node's view of shared content and metadata coherent when storage offers weaker guarantees than the repository needs.",
    d: "Nodes write blobs to shared storage and then record them in the database, and other nodes read them shortly after. If storage is eventually consistent, a read can miss a just-written blob. If caches are per node, listings can disagree. The repository copes with ordering rules, retries on not-found within a short window, and by never reusing a path with different content. Failures are intermittent and rare, which makes them the hardest class: a one-in-a-million miss across a thousand builds a day is a weekly mystery.",
    k: ["Retry reads briefly on not-found vs trust storage guarantees: retrying hides short lag and delays real misses; trusting is simple and shows every inconsistency as an error.", "Content-addressed immutable keys vs mutable object names: immutable keys make stale reads harmless, while mutable names need strong consistency."],
    p: ["A node serving a not-found for a blob written seconds earlier by another node, which the client reports as a missing artifact.", "A network file system that caches directory entries, hiding a newly renamed file."],
    v: "From one node write ten thousand blobs and immediately read each from a second node, counting misses. Confirm zero final failures, and a count of retries that matches storage's documented lag.",
    dep: ["blob-store-abstraction","metadata-cache","transaction-model"]
  },
  "http-server": {
    s: "The network front end that terminates connections, authenticates requests, streams large bodies and routes to the right format adapter or API handler.",
    d: "It accepts connections with TLS, parses requests, authenticates by token, certificate or login, applies rate limits and dispatches. Most traffic is large streaming transfers, so it must handle slow clients without tying up resources, support resumption, and never buffer whole files in memory. Many clients behave unusually: unusual headers, missing content lengths, chunked bodies, long idle periods. The hard parts are resource limits under many concurrent transfers and backpressure between slow clients and fast storage.",
    k: ["Streaming everything vs buffering for simplicity: streaming bounds memory and makes verification trickier; buffering is easy and fails on large files.", "Terminate TLS in the server vs at a front proxy: in the server is self-contained, while a proxy centralizes certificates and adds a hop that may interfere with streaming."],
    p: ["Thousands of slow clients holding connections until the server runs out of file handles.", "A proxy in front buffering whole uploads to disk, doubling the time and exhausting its volume."],
    v: "Run a load of two thousand concurrent downloads of a 1 GB file at limited client speed and confirm memory stays flat, and a simultaneous small request still returns within its normal latency.",
    dep: ["format-adapters","access-tokens","rate-limits"]
  },
  "job-scheduler": {
    s: "Runs background work such as cleanup, index rebuilds, scans, replication and token expiry on schedules or triggers, with coordination so each job runs once per cluster.",
    d: "Jobs are defined with a schedule, a concurrency limit and a lock so that only one node runs a singleton. Work is picked from a queue, with retries and a record of outcomes. Priorities keep user-visible work ahead of maintenance. The hard parts are coordination without a single point of failure, jobs that run longer than their interval, and visibility: a job that fails quietly means retention, scans or replication silently stop, and the first sign is a full disk or a stale replica.",
    k: ["Database-backed locks vs a dedicated coordinator: database locks need no extra service and depend on its availability; a coordinator is more capable and one more thing to run.", "Skip a run when the previous has not finished vs queue it: skipping avoids pile-ups and drops work; queuing never loses work and can build a backlog."],
    p: ["A scheduled job failing every night for weeks because nobody watched its status.", "Two nodes both believing they hold a lock after a pause, running the same cleanup concurrently."],
    v: "Trigger a job from a cluster of three nodes and confirm exactly one runs it. Kill that node mid-job and confirm another takes it over, with outcomes recorded and an alert for the failed run.",
    dep: ["metadata-database","metrics-and-health"]
  },
  "configuration-system": {
    s: "Holds the settings that control the server: storage locations, database connections, limits, keys and feature switches, with defined sources, precedence and reload rules.",
    d: "Settings come from files, environment, and stored system configuration edited through the API. Some can change at runtime, others need a restart. Secrets are referenced from a vault or encrypted. In clusters, shared settings must be identical on every node, so they live in the database or are distributed by deployment tooling. Difficulties are drift between nodes, secrets leaking through logs or exports, and settings whose misconfiguration is silent, such as cleanup limits or cache sizes that only show up under load.",
    k: ["Settings stored in the database vs in files: the database is shared and editable at runtime and needs a running database to start; files are explicit and need distribution.", "Fail at startup on invalid settings vs fall back to defaults: failing is loud and prevents silent misbehavior, while defaults keep the service up with the wrong setting."],
    p: ["One node started with an old configuration file and quietly behaves differently from the rest.", "Secrets included in a support bundle sent to a third party."],
    v: "Export the effective configuration from every node and diff them, confirming identical shared settings. Set an invalid value in a staging node and confirm it refuses to start with a message naming the setting.",
    dep: ["metadata-database"]
  },
  "metrics-and-health": {
    s: "Exposes counters, timings and health endpoints for requests, storage, database, queues and jobs, so operators and balancers can tell whether the service is working.",
    d: "Metrics include request rate, latency and error rate by repository and format, bytes served, cache hit rate, database pool usage, queue depth, replication lag and storage usage. Health endpoints distinguish live, meaning the process runs, from ready, meaning it can serve. These feed dashboards, alerts and balancers. The hard parts are choosing signals that predict trouble, such as the age of the oldest queued replication event, and avoiding high-cardinality labels such as per-artifact counters that overwhelm the monitoring system.",
    k: ["Readiness that checks dependencies vs a simple liveness check: dependency checks route around real faults and can cascade a shared outage across all nodes; liveness is stable and blind.", "Per-repository metric labels vs aggregates: per-repository labels show which team causes load and increase series count; aggregates are cheap and less useful."],
    p: ["A readiness check failing on a brief database blip and removing every node from the balancer together.", "No alert on replication lag, so a stale replica serves old content for days."],
    v: "Stop the database and confirm the readiness endpoint turns unhealthy within its interval while liveness stays up, and that an alert fires on the queue depth and error rate metrics.",
    dep: ["http-server","job-scheduler"]
  },
  "usage-reporting": {
    s: "Reports of storage, downloads, users and repositories over time, used for capacity planning, chargeback, license accounting and spotting unused or runaway content.",
    d: "Aggregations over node sizes, download counts and access logs produce per-repository and per-team figures: bytes stored, growth, most-downloaded artifacts, requests by identity. They are computed periodically rather than live. Teams use them to charge storage back, to find the largest consumers and to prove compliance with retention rules. The challenge is attribution: shared content, copies by reference, proxied traffic and automation identities all make the question of who used what harder than a sum.",
    k: ["Precomputed periodic reports vs live queries: precomputed is cheap and stale by hours, while live queries are current and heavy against the main database.", "Attributing deduplicated content to every referrer vs first uploader: every referrer is fair per team and over-counts; first uploader is accurate in total and arbitrary per team."],
    p: ["Reports that count each pipeline's service account as one user, hiding which team drives load.", "Growth trends computed from live nodes only, ignoring trash and orphaned blobs holding real disk."],
    v: "Compare the report's total stored bytes with the storage backend's own usage figure, after accounting for trash and orphans, and confirm they agree within a stated tolerance.",
    dep: ["metadata-database","usage-tracking","quota-management"]
  },
  "online-upgrade": {
    s: "Moving a running cluster to a new version without downtime, one node at a time, with database changes compatible across versions.",
    d: "Nodes are drained and upgraded in sequence while others serve traffic, so for a while two versions share a database and content store. That demands expand-then-contract schema changes, tolerant formats for stored data and replication messages, and a defined order for upgrading sites. A rollback plan must exist before starting. Hard parts are features that are unsafe in a mixed fleet, long migrations and singleton jobs that move between nodes of different versions.",
    k: ["Rolling upgrade vs stop-the-world: rolling avoids downtime and constrains every change to be backward compatible; stopping is simple and costs a maintenance window.", "Upgrade replicas before primary vs primary first: replicas first catch compatibility problems with less risk, and primary first may emit data replicas cannot read."],
    p: ["A new version writing data an older node cannot read, breaking the nodes that have not yet been upgraded.", "A release that cannot be rolled back after a data conversion, discovered on the first bad day."],
    v: "Upgrade a staging cluster one node at a time under continuous upload and download traffic, confirm zero failed requests beyond retries, and confirm every node reports the new version and agrees on schema.",
    dep: ["cluster-nodes","schema-migration","load-balancing"]
  },
  "capacity-planning": {
    s: "Estimating how much storage, database, network and node capacity the repository needs as builds, dependencies and users grow, and acting before limits are reached.",
    d: "Inputs are growth per day of stored content, upload and download rates, peak concurrency, database size and index sizes, and the effect of retention. Storage growth is usually the dominant line, followed by database size and the network at peak build times. Planning uses reports and trend lines, then sets thresholds that trigger expansion or cleanup. It is hard because growth is bursty, new formats such as container images change the profile abruptly, and the point where the database no longer fits memory arrives without warning.",
    k: ["Plan for peak concurrency vs average: peak sizing avoids slowdowns during release waves and leaves hardware idle most of the time; average sizing is cheaper and fails when it counts.", "Scale up nodes vs scale out: scaling up is simple and has a ceiling; scaling out has no ceiling and requires a design that shares nothing."],
    p: ["Disk full alarms arriving at ninety-nine percent because thresholds were set from last year's growth.", "Adding a container format to a repository sized for small packages and exhausting storage in weeks."],
    v: "Project the next twelve months from the last ninety days of the growth report, then compare the prediction made six months ago with what actually occurred and record the error.",
    dep: ["usage-reporting","metrics-and-health","retention-policies"]
  },
  "admin-cli": {
    s: "A command-line tool for administrators and automation to run maintenance, export configuration, check integrity and perform recovery tasks outside the web interface.",
    d: "It calls the management API for ordinary operations and has local modes for tasks that need direct access: checking and repairing the content store, rebuilding indexes, exporting and importing configuration, rotating keys and running migrations. Scripted use matters because repositories are managed as code. It must be safe by default: destructive commands need explicit confirmation, show what they will do, and write to the audit log. The danger is power: local modes bypass the permission model.",
    k: ["Local mode with direct database access vs API only: direct access can repair what the server cannot, and bypasses permissions and audit.", "Dry-run as default vs apply as default: dry-run prevents accidents and gets skipped in scripts; apply is faster and punishes typos."],
    p: ["A repair command run against the wrong environment because the target was taken from a stale environment variable.", "Local maintenance actions that leave no audit entry."],
    v: "Run an integrity check in dry-run mode on a test instance with a planted corrupt blob, confirm it reports the blob without changing anything, then apply and confirm repair and an audit entry.",
    dep: ["management-api","integrity-verification","audit-log"]
  },
  "immutability-contract": {
    s: "The decision whether a published version or digest can ever change, and the single place where exceptions are allowed, which every layer must honor.",
    d: "Clients, caches, replicas and auditors all assume that a name and version mean one set of bytes. If the repository allows overwriting, every cache can hold a different answer. The contract spans enforcement at upload, protection of tags and indexes, replication, cleanup that must not delete what a pin protects, and a defined path for rare corrections such as a new version that supersedes a bad one. The decision needs to be made per stage: development may move, release may not.",
    k: ["Immutable releases with supersede-by-new-version vs correctable in place: immutability protects caches and audits and forces a new version for every fix; correction in place is convenient and unsafe.", "Deleting a bad release vs yanking it from resolution: deletion removes the evidence and breaks existing pins; yanking keeps old builds working and hides it from new ones."],
    p: ["Allowing overwrite on release repositories for convenience, after which no cache can be trusted.", "Replication sites configured without the same rule, accepting a conflicting version."],
    v: "Attempt to alter a released version through every path: upload, copy, move, tag update and replication target. Confirm each is refused and logged, and that the allowed supersede path produces a new version.",
    dep: ["immutability-enforcement","overwrite-policy","multi-site-topology"]
  },
  "trust-and-provenance": {
    s: "The decision about whom the repository believes: which sources, builders, keys and signatures are trusted, and what evidence is required before content is released.",
    d: "Everything that enters is either built by a trusted pipeline or fetched from an outside source. Trust is expressed in routing rules, curation, signatures, scans, provenance statements and approval gates, and each depends on keys and identities that must be managed. A repository is a choke point where those checks can be applied once. The decision shapes how pipelines authenticate, how proxies are configured and what an incident response looks like when a source or key is found compromised.",
    k: ["Verify at the repository vs only at the consumer: central checks protect everyone and make the repository a trusted party; consumer checks need no trust in it and are skipped by lazy clients.", "Allow-list of trusted builders vs trust any valid signature: an allow-list limits what one stolen key can do and takes maintenance."],
    p: ["Treating the repository as trusted by definition, so content that was malicious on arrival is served indefinitely.", "No plan to revoke a compromised signing key across stored artifacts and client trust stores."],
    v: "Simulate a compromised publisher key: revoke it, then list every artifact it signed, block new downloads of them, and confirm a client with the updated trust configuration rejects an old signed file.",
    dep: ["signature-verification","provenance-records","upstream-routing","approval-gates"]
  },
  "consistency-model": {
    s: "The decision about what readers may see between a write and its effects elsewhere: indexes, caches, replicas and search, and how long the gap may last.",
    d: "A publish touches content storage, the database, the index files clients read, caches on every node, the search index and replicas. They cannot all change at the same instant. The model states the order of writes, the maximum staleness of each derived view and what a client may rely on, for instance that after a successful publish the artifact is downloadable from the same site, while search and remote replicas may lag. Without an explicit model each component picks its own, and pipelines that publish then immediately resolve hit rare failures.",
    k: ["Read-your-writes for downloads and indexes vs eventual everywhere: read-your-writes for the core path prevents publish-then-fail pipelines and costs coordination; eventual is cheap and surprising.", "Synchronous index update on publish vs asynchronous: synchronous is immediately correct and slows uploads; asynchronous is fast and opens a gap."],
    p: ["A pipeline publishing then resolving through a different node whose cache still says not-found.", "Replicas serving an index that lists a version whose blob has not arrived yet."],
    v: "Publish and immediately resolve through a different node and a replica in a loop of ten thousand iterations, and record the maximum and 99th percentile delay until success, comparing with the documented bounds.",
    dep: ["metadata-cache","index-generator","push-replication","transaction-model"]
  },
  "storage-cost-growth": {
    s: "The decision about how much storage the repository may consume and how that growth is bounded through retention, deduplication, tiering and quotas.",
    d: "Build output grows without limit unless something removes it, and every build artifact, container layer and cached dependency adds to the total. Cost is storage, replication copies at every site, backups and the network to move them. The decision links retention rules, quotas, tier choices and replication scope, and who pays. Deciding late means a crisis cleanup under pressure, when the rule that is safe to apply is the hardest to choose.",
    k: ["Aggressive retention for snapshots vs keeping everything: aggressive retention bounds cost and risks deleting something someone needed; keeping everything is safe and grows indefinitely.", "Replicate everything to every site vs on demand: everything gives local speed and multiplies cost; on demand pays only for use and slows first requests."],
    p: ["Retention introduced only when the disk is nearly full, forcing hurried deletion of content nobody has checked.", "Counting only primary storage in cost, while replicas and backups multiply it by five."],
    v: "Compute total storage including replicas, backups and trash per team over the last year, compare with the budget, and confirm the retention rules in force would hold next year's projected growth under the limit.",
    dep: ["retention-policies","quota-management","storage-tiering","deduplication"]
  },
  "upstream-dependence": {
    s: "The decision about how much the organization's builds depend on external sources being available and honest, and how the repository insulates them.",
    d: "Every proxy repository ties builds to someone else's service. Caching shields against outages, but only for what was fetched before, while mirroring everything protects further and costs storage. Dependence also means exposure to deletion, to replaced content and to malicious releases. The decision covers which sources are allowed, how long entries are cached, whether builds may reach external sources directly, and what happens to builds when a source disappears.",
    k: ["Mirror what is used vs mirror entire sources: used-only is small and fails for a never-fetched version; full mirrors protect more and cost storage and sync.", "Block direct access to external sources vs allow bypass: blocking forces all content through checks, and stops builds when the proxy is down; bypass keeps builds running and unprotected."],
    p: ["A source removing a widely used package, leaving builds that never cached it permanently broken.", "Clients configured to fall back to public sources when the repository is unreachable, defeating every policy."],
    v: "Cut external network access from the repository and run a clean build of a representative project; record which dependencies were served from cache and which failed, and compare with the declared build manifest.",
    dep: ["proxy-repository","negative-cache","curation-rules","virtual-repository"]
  },
  "tenancy-and-isolation": {
    s: "The decision about how teams and organizations share one repository: what is separated by repository, by account, by instance, and what each can see or consume.",
    d: "A single shared instance is efficient and demands strong permission rules, quotas and rate limits so one team cannot read, fill or slow another. Separate instances isolate completely and multiply operations. Between them are namespaces with their own permissions, storage and quotas. The decision affects whether deduplication crosses boundaries, since shared content can reveal that another team holds the same file, and whether search, usage reports and tokens are scoped to a tenant.",
    k: ["Shared instance with permission isolation vs instance per tenant: shared is cheaper and a mistake exposes everyone; per-tenant is safe and costs operations for each.", "Deduplicate across tenants vs per tenant: across tenants saves space and leaks existence by digest probing; per tenant costs storage and is clean."],
    p: ["Search or counts showing the existence of another team's private packages.", "One team's runaway pipeline exhausting the shared storage quota and stopping every other team's releases."],
    v: "As a user in one tenant, attempt to read, search for and probe by digest content in another tenant, and confirm every attempt returns not-found without revealing that the content exists.",
    dep: ["permission-targets","quota-management","rate-limits","deduplication"]
  },
});
