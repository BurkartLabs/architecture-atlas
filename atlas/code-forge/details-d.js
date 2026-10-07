// Details for the code hosting forge plate, part 4: replication, metadata infrastructure, scaling, cross-cutting.
ATLAS.details("code-forge", {
  "replica-placement": {
    s: "Chooses which machines hold each repository's copies, spreading them across failure domains while balancing capacity and load.",
    d: "Each repository has a primary and at least two replicas, placed on different racks or zones. The placer considers free space, current load, the repository's expected activity and its fork network, which should live together for object sharing. Placement decisions are recorded in the routing table. Replacing a failed node means rebuilding its copies elsewhere without overloading the sources. The hard parts are co-locating forks without creating hot machines, and making placement sticky enough that rebalancing does not constantly move data.",
    k: ["Whole fork networks on one node vs spreading forks: co-location lets forks share objects and concentrates load; spreading balances load and gives up sharing.", "Fixed replica count vs by importance: a fixed count is simple and uniform; tiering saves space on quiet repositories and complicates durability promises."],
    p: ["Replicas placed in the same failure domain are all lost in one power or network event.", "Rebuilding a dead node's repositories from a few sources saturates them and degrades live traffic."],
    v: "Inspect placement for a sample of repositories and confirm no two copies share a failure domain; fail a node in a test environment and confirm every affected repository regains its full replica count within the target time.",
    dep: ["repository-routing","storage-node-agent","fork-networks","metadata-database"]
  },
  "reference-transactions": {
    s: "The protocol that makes a ref update take effect on a quorum of replicas, or on none, so replicas agree on every branch tip.",
    d: "A push to the primary proposes ref updates to replicas before committing. Each replica takes locks, verifies the old values, and votes. If a quorum agrees, all commit; otherwise the update is aborted. Replicas that missed an update are marked out of date and repaired by fetching the missing objects. Object data does not need agreement since it is content-addressed and immutable; only refs do. The difficulty is latency, since each push waits for votes, and partial failures where a replica votes yes and then dies.",
    k: ["Quorum voting on refs vs primary-only writes with asynchronous copy: voting protects against losing acknowledged pushes and adds latency; asynchronous is fast and can lose recent pushes on failure.", "Synchronous replicas in one region vs across regions: one region keeps latency low and risks regional loss; across regions survives disasters and slows pushes."],
    p: ["A replica that voted yes but crashed before applying serves stale refs until repaired, unless it is marked out of date.", "Locks held through a slow vote block other pushes to the same repository for seconds."],
    v: "Push while one replica is down and confirm the push succeeds with quorum and the downed replica is flagged out of date; restart it and confirm refs converge to the same values on all three.",
    dep: ["replica-placement","bare-repository-layout","storage-node-agent"]
  },
  "replica-reads": {
    s: "Routes read traffic such as clones and web views to replicas that are known to be up to date, spreading load off the primary.",
    d: "Most repository traffic is reads, and replicas can serve them if they have the latest refs. The router asks which replicas are consistent for a repository, using the replication state tracked by the transaction layer, and picks one by load or locality. If none is current, it reads from the primary. For reads right after a push, such as a pull request page, the system must guarantee the user sees their own write. The hard parts are knowing freshness cheaply and avoiding all reads landing on the replica that is least busy.",
    k: ["Read-after-write guarantees via the primary vs eventual reads from any replica: guarantees avoid confusing stale views and give up some load balancing; eventual spreads load and shows old data.", "Load-aware selection vs random: load-aware avoids hot replicas and needs fresh load data; random is stateless and uneven."],
    p: ["A stale replica is chosen because its out-of-date flag has not yet propagated, so a clone misses a fresh push.", "All replicas of a popular repository are on busy nodes, so adding replicas does not help."],
    v: "Push and immediately fetch from many concurrent clients and confirm every fetch returns the new commit; confirm read traffic distribution across replicas of a hot repository is within the expected range.",
    dep: ["reference-transactions","repository-routing","replica-placement"]
  },
  "failover": {
    s: "Promotes a replica to primary when the current primary is unreachable, preserving acknowledged pushes and avoiding two nodes accepting writes.",
    d: "A health checker detects an unresponsive primary and, after confirmation by several observers, selects the most up-to-date replica using replication state. The new primary is written to the routing table with a generation number, and the old one is fenced so that late requests are rejected. Writes resume once the new primary is chosen. The danger is split-brain: both believe they own the repository. Failover is tuned between reacting fast to real failures and not flapping on brief network pauses.",
    k: ["Automatic failover vs operator-approved: automatic restores service within seconds and can make wrong decisions in partitions; manual is careful and prolongs outages.", "Promoting only fully consistent replicas vs any available: consistent replicas avoid losing pushes and may leave a repository read-only; any replica restores writes and risks loss."],
    p: ["A paused primary resumes after failover and accepts a write, producing divergent histories if it is not fenced.", "Failover triggered by a monitoring glitch moves many repositories at once and overloads the new primaries."],
    v: "Block the primary's network in a test, confirm a replica is promoted within the target, that pushes acknowledged before the failure are present, and that the old primary rejects writes when it returns.",
    dep: ["reference-transactions","repository-routing","replica-placement","observability-and-tracing"]
  },
  "integrity-repair": {
    s: "Continuously checks that every replica holds the same refs and valid objects, and repairs disagreements or corruption from healthy copies.",
    d: "Background verifiers compare refs and checksums across replicas, rehash objects on a rolling schedule, and check for missing objects reachable from refs. When a replica is out of date or corrupt, a repair job fetches the missing objects from a healthy one. Disk errors, bugs and operator mistakes all produce damage that replication alone copies rather than fixes. The cost is full reads of all data, spread over weeks, and the policy question of which copy is right when they disagree.",
    k: ["Frequent full verification vs sampling: full catches everything and consumes disk bandwidth; sampling is cheap and leaves damage undetected longer.", "Automatic repair from the majority vs manual review: automatic fixes common cases fast and can spread a bad copy if the majority is wrong."],
    p: ["A bug that writes bad objects on the primary replicates them to every copy before anyone notices.", "Verification traffic competes with user requests on busy disks and causes latency spikes."],
    v: "Corrupt an object on one replica in a test, and confirm the verifier detects it within its cycle, repairs it from another copy and records the event; confirm user latency stays within bounds during verification.",
    dep: ["object-database","replica-placement","maintenance-scheduler","backup-and-restore"]
  },
  "backup-and-restore": {
    s: "Periodic and continuous copies of repositories and metadata to separate storage, with tested procedures for restoring one repository or the whole service.",
    d: "Replication protects against machine failure but not against deletion, corruption or software bugs, which copy to all replicas. Backups add history: periodic snapshots or bundles of repositories plus the metadata database's log. Per-repository restore requires indexes of what is stored where. Backups are encrypted and kept in another failure domain. The measure that matters is restore time, not backup size, which is why untested backups are assumed not to work.",
    k: ["Snapshotting whole disks vs per-repository backups: disk snapshots are simple and restore everything or nothing; per-repository gives targeted restore and needs more machinery.", "Backing up metadata and repositories at the same instant vs separately: together restores a coherent state and is hard to coordinate; separately drifts and needs reconciliation."],
    p: ["A backup of the repository and a metadata copy taken hours apart restores pull requests that point to commits that do not exist.", "Backups never restored in practice turn out to be incomplete or unreadable during an incident."],
    v: "Restore a randomly chosen repository from backup into a scratch environment, run an integrity check, and compare its refs and metadata against production, recording the elapsed time against the recovery target.",
    dep: ["blob-object-store","metadata-database","object-database","data-retention-and-export"]
  },
  "metadata-database": {
    s: "The relational store holding everything that is not repository data: accounts, permissions, pull requests, issues, settings and routing tables.",
    d: "A primary with replicas, partitioned by tenant or table groups as it outgrows one machine. Application code reads from replicas where staleness is tolerable and from the primary after writes. Schema changes run online in steps so no migration blocks traffic. Transactions keep related rows consistent, but operations spanning the repositories and the database cannot be one transaction, so they are sequenced with compensating steps. The hard problems are hot rows such as per-repository counters, and keeping migrations safe at the table sizes forges reach.",
    k: ["Sharding by repository or organization vs by table: tenant sharding keeps related rows together and makes cross-tenant queries awkward; table sharding is simple and does not scale one huge table.", "Online schema change in expand-then-contract steps vs downtime migrations: stepwise has no downtime and takes multiple releases; downtime is simple and unacceptable."],
    p: ["A migration that locks a table with hundreds of millions of rows takes the site down.", "Reading from a lagging replica right after a write shows users that their change did not happen."],
    v: "Run a column addition and backfill on a production-sized copy while a load generator runs and confirm no request fails and replication lag stays within bounds; read after write through the app and confirm the new value is visible.",
    dep: ["backup-and-restore"]
  },
  "cache-layer": {
    s: "In-memory stores in front of the database and repository service holding computed results such as permissions, rendered pages, counters and rate-limit state.",
    d: "Entries are keyed by what they depend on, often including a version or commit id so they never need invalidation, as with anything derived from an immutable object. Mutable data, like permissions, is invalidated by events or has short lifetimes. Caches reduce load and hide the true cost of cold paths, so the system must still work when the cache is empty. The difficulty is stampedes, when a popular entry expires and many requests recompute it, and correctness around stale permissions.",
    k: ["Content-addressed keys that never invalidate vs explicit invalidation: addressed keys are always correct and apply only to immutable data; invalidation covers mutable data and risks missed events.", "Short time-to-live vs event-based invalidation: short lifetimes are simple and bound staleness; events are precise and fail when one is lost."],
    p: ["A cache flush or node loss sends all traffic to the database at once and causes an outage.", "A cached permission outlives a removal and a former member keeps reading private data."],
    v: "Empty the cache during steady traffic and confirm the database and repository service handle the surge without errors, and that request coalescing limits recomputation of a popular entry to one.",
    dep: ["metadata-database"]
  },
  "job-queue": {
    s: "A durable queue and worker pool for work that should not happen inside a request: indexing, notifications, hook delivery, maintenance and mergeability computation.",
    d: "Producers enqueue jobs with arguments, priority and optional uniqueness keys; workers pull, execute and acknowledge. Retries use backoff, failed jobs move to a dead-letter set, and separate queues keep slow job types from blocking fast ones. Because delivery is at least once, jobs must be idempotent. Enqueuing must be consistent with the database transaction that triggered it, or jobs run before data is visible or never run. Sizing and fairness across tenants are the ongoing challenges.",
    k: ["Enqueue inside the database transaction vs after commit: inside never loses a job and couples the queue to the database; after commit is simple and can lose jobs on crash.", "Per-type queues vs one shared queue: per-type isolates failures and needs capacity planning for each; shared is simple and lets one flood starve all."],
    p: ["A job runs before the transaction that created its data commits and finds nothing, then fails or silently does nothing.", "One tenant enqueues a million jobs and delays everyone else's notifications without per-tenant fairness."],
    v: "Enqueue a job that fails twice and confirm it retries with increasing delay then succeeds exactly once in effect; kill a worker mid-job and confirm another completes it without duplicating side effects.",
    dep: ["metadata-database","cache-layer"]
  },
  "blob-object-store": {
    s: "Durable, cheap storage for large immutable files such as attachments, release assets, packages, archives, backups and large-file content, accessed by key.",
    d: "An object storage service, usually replicated or erasure-coded across zones, holds data under keys. Application servers write through short-lived signed addresses so bytes bypass them. Lifecycle rules move old data to colder tiers or delete it. Reads go through a content delivery layer for popular files. Because objects are immutable and keys unique, consistency questions are simple; the hard parts are cost, including egress, and cleanup of data no longer referenced anywhere.",
    k: ["Direct client uploads with signed addresses vs proxying: direct saves application bandwidth and needs careful scoping of each signature; proxying is simple and costly.", "Tiering cold data vs keeping everything hot: tiering cuts storage cost and makes rare restores slow; hot is fast and expensive."],
    p: ["Orphaned objects from abandoned multipart uploads accumulate and quietly raise the bill unless lifecycle rules remove them.", "A signed address scoped too broadly lets a client read or overwrite other users' files."],
    v: "Upload a large file with a signed address, confirm the bytes did not pass through application servers, and confirm an address for one key cannot read another; check lifecycle rules remove an abandoned upload on schedule.",
    dep: ["cost-control"]
  },
  "notification-fanout": {
    s: "The job that turns one event into many recipients: finds who should be told, checks they may see it, and creates inbox entries and outgoing messages.",
    d: "On each event, the fan-out resolves subscribers: authors, mentioned users, watchers, review requests and team members. For a repository with many watchers, the list can be huge, so work is split into batches handled by separate jobs. Each recipient is checked for access and preferences, then inbox rows and email or push messages are created. Duplicates are suppressed by thread. Email replies map back to comments through signed addresses. The hard part is volume and the guarantee that no one is notified of something they cannot see.",
    k: ["Batching recipients into many small jobs vs one large job: batches parallelize and resume after failure and add coordination; one job is simple and long-running.", "Immediate delivery vs digesting: immediate is timely and noisy; digests reduce load and delay time-sensitive items."],
    p: ["A release announcement on a repository with a million watchers floods the queue for hours and delays review notifications.", "Retrying a half-finished fan-out sends some recipients duplicate emails."],
    v: "Trigger an event for ten thousand watchers and confirm each gets exactly one inbox entry and at most one email, within the target time, and that a recipient lacking access receives nothing.",
    dep: ["job-queue","teams-and-roles","metadata-database"]
  },
  "hot-repository-detection": {
    s: "Finds repositories receiving unusual load from clones, polling or pushes, so that caching, limits or extra replicas can be applied before they hurt everyone else.",
    d: "Front ends and storage nodes emit per-repository counters for operations and CPU time. An aggregator ranks them over short windows and flags outliers. Reactions include raising replica counts, enabling pack caches, tightening limits on specific clients, or moving the repository to dedicated machines. Common causes are build farms cloning on every commit, popular open-source releases, and misconfigured polling bots. The hard problem is distinguishing legitimate heat, such as a release day, from abuse, and reacting within minutes.",
    k: ["Automated mitigation vs alert for human decision: automation reacts in seconds and can throttle legitimate users; human decision is accurate and slower than the spike.", "Per-repository vs per-client attribution: per-repository finds hot data and punishes everyone using it; per-client finds the culprit and needs more tracking."],
    p: ["Detection windows that are too long notice a flood after the node has already failed.", "Throttling a hot popular repository breaks thousands of downstream builds that all depend on it."],
    v: "Generate a burst of clones against one test repository and confirm it is flagged within the target time with the top client identified, and that mitigation such as the pack cache engages automatically.",
    dep: ["observability-and-tracing","pack-cache","api-rate-limiting","replica-placement"]
  },
  "pack-cache": {
    s: "Stores recently built packs or their pieces so repeated identical fetches of the same objects are served from cache instead of recomputed.",
    d: "Many clients make the same request: a full clone of the default branch tip, or an incremental fetch from the previous release. The cache keys on the repository, the requested tips and the filter, stores the generated pack on local disk or object storage, and serves it directly. It is most effective for large popular repositories and for build farms. Entries expire quickly because tips move. The hard parts are correctness, since a cached pack must not outlive permission or deletion changes, and the storage cost.",
    k: ["Caching complete responses vs reusing partial computations: complete responses are nearly free to serve and match rarely; partial reuse matches often and still costs some CPU.", "Cache on the storage node vs a shared tier: local avoids network hops and caches duplicate across replicas; shared deduplicates and adds a dependency."],
    p: ["A cached pack of a repository made private is still served to anonymous clients because the check was done only at build time.", "Caching every unique request fills the disk with entries that are never reused."],
    v: "Issue the same clone twice and confirm the second is served from cache with a fraction of the CPU; make the repository private and confirm an anonymous request is refused and the cached entry is not served.",
    dep: ["pack-generation","blob-object-store","repository-visibility"]
  },
  "load-shedding": {
    s: "Deliberately rejecting or deferring work when a node nears overload, so that important requests still succeed and the system recovers instead of collapsing.",
    d: "Each tier tracks queue depth, concurrency and latency, and refuses new work above a threshold, returning a clear retry signal. Priority classes protect pushes, interactive web requests and health checks over bulk clones and background jobs. Concurrency limits per repository and per client prevent a single actor from taking all capacity. Shedding must happen early, before expensive work starts, and clients need to back off rather than retry instantly. Without it, overload creates timeouts, which cause retries, which increase load.",
    k: ["Rejecting new requests vs queueing them: rejection keeps latency bounded and surfaces errors; queueing smooths bursts and lets latency grow until everything times out.", "Static limits vs adaptive limits: static limits are predictable and wrong when hardware or workload changes; adaptive follows reality and can oscillate."],
    p: ["Clients retrying immediately after a refusal multiply the load and turn a spike into an outage.", "Health checks served from the same overloaded pool fail and cause nodes to be removed, shrinking capacity further."],
    v: "Drive a node past its capacity and confirm excess requests get fast refusals with retry hints, pushes and web requests keep their latency target, and the node recovers within seconds after the load drops.",
    dep: ["observability-and-tracing"]
  },
  "shard-rebalancing": {
    s: "Moves repositories between storage nodes to even out disk use and load, without interrupting reads or losing pushes.",
    d: "A planner compares node capacity and traffic and proposes moves. A move copies the repository to the destination, catches up with ongoing writes, briefly pauses writes to cut over, updates the routing table, and later deletes the source. Fork networks move together. Rate limits cap concurrent moves so the copying does not hurt live traffic. Most of the time this is routine capacity work; the hard parts are the cutover safety and avoiding oscillation, where the planner keeps moving the same hot repository around.",
    k: ["Online move with a short write pause vs read-only repository during move: a short pause keeps writes nearly always available and needs careful catch-up logic; read-only is simple and blocks work for large repositories.", "Moving by size vs by traffic: size balances disks and ignores heat; traffic balances load and can strand capacity."],
    p: ["Updating the route before the copy finishes sends reads to a node missing recent objects.", "Moving a hot repository to an idle node simply makes that node hot while the rest remain idle."],
    v: "Move a repository under continuous clones and pushes and confirm no request fails, no acknowledged push is lost, the source is deleted only after verification, and checksums on the destination match.",
    dep: ["repository-routing","replica-placement","reference-transactions","maintenance-scheduler"]
  },
  "maintenance-scheduler": {
    s: "Decides when each repository gets repacking, verification, graph rebuilds and cleanup, balancing freshness against the load those jobs create.",
    d: "A scheduler scores repositories by churn since last maintenance, pack counts, loose object counts and read heat, then issues jobs to storage nodes within an I/O and CPU budget. Quiet hours get heavier work. Jobs are resumable and cancellable when interactive traffic rises. It ties together packfile maintenance, bitmap rebuilds and integrity checks so one pass does not conflict with another. The tension is that skipping maintenance slowly degrades performance, while running too much degrades it immediately.",
    k: ["Event-driven triggers on push counts vs periodic sweeps: event-driven reacts to churn and needs counters; periodic sweeps are simple and waste work on idle repositories.", "Strict I/O budgets vs run when idle: budgets protect latency and can leave work undone; idle-based finishes work and may never find idle time."],
    p: ["Jobs that never get scheduled because the budget is always consumed by the same few busy repositories leave the rest degrading.", "A maintenance job holding a repository lock blocks pushes for the duration of a long repack."],
    v: "Create repositories with different churn levels and confirm the scheduler's order matches their scores, that jobs stay within the I/O budget, and that a push during maintenance is not blocked longer than the lock limit.",
    dep: ["packfile-maintenance","commit-graph-and-bitmaps","storage-node-agent","observability-and-tracing"]
  },
  "observability-and-tracing": {
    s: "Metrics, logs and distributed traces that show where time and errors occur across front ends, repository operations, queues and storage, with per-repository and per-tenant breakdowns.",
    d: "Each request carries an identifier through the web tier, services, the repository agent and background jobs, so one slow clone or push can be followed end to end. Metrics cover latency percentiles, error rates, queue depth, replica lag and cache hit rates, split by operation type. Repository-specific measures include pack build time and bytes sent. High-cardinality labels like repository names are costly, so they go to logs or sampled traces. The hard part is making the data actionable under incident pressure.",
    k: ["Sampling traces vs capturing all: sampling bounds cost and may miss the rare failure; capturing all is complete and expensive.", "Per-repository labels on metrics vs aggregated: per-repository helps find hot spots and explodes storage; aggregation is cheap and hides them."],
    p: ["A trace identifier lost at the queue boundary makes asynchronous failures impossible to link to their cause.", "Dashboards built on averages hide the long tail that large clones and heavy users experience."],
    v: "Trigger one slow clone and trace it from the front end to the pack build on a storage node, confirming each hop's time is visible and the same identifier appears in every log line.",
    dep: ["job-queue"]
  },
  "consistency-and-ordering": {
    s: "Which operations must agree on one order, where stale reads are acceptable, and how multi-step actions across the repositories and the database stay coherent.",
    d: "A merge changes a ref in repository, a record in the database, an index and notifications, with no shared transaction. The forge sequences these steps so that a failure at any point leaves something repairable, typically making repository the source of truth for content and the database for metadata, and rebuilding derived state from events. Ref updates need strong agreement across replicas, while feeds and counts can lag. Every feature picks how stale is acceptable and what repairs drift.",
    k: ["Repositories as the source of truth with derived metadata vs metadata as truth: repository-first makes recovery possible from the repository and demands reconciliation jobs; metadata-first is simple and can disagree with actual refs.", "Strong consistency for refs and eventual for everything else: protects code integrity and leaves users sometimes seeing stale counts."],
    p: ["A merge updates the ref but fails to update the pull request record, leaving it open on code that is already merged.", "Two services each assume the other orders events and neither does, so reordered events leave wrong final state."],
    v: "Inject a failure between each step of a merge in a test environment and confirm each leaves a state that a reconciliation job repairs to match the repository's actual refs.",
    dep: ["reference-transactions","metadata-database","job-queue","receive-pack"]
  },
  "content-addressing": {
    s: "Objects are named by the hash of their content, which makes them immutable, deduplicable, cacheable forever and verifiable, and shapes storage, replication and caching.",
    d: "Because a commit id covers its content and its parents, history cannot be changed without changing every later id. This property lets forks share storage, replicas copy objects without coordination, caches never invalidate for object data, and corruption be detected by rehashing. It also means that deleting content is hard: objects are shared and referenced from unexpected places, and a leaked secret in one commit lives in every clone. Identifiers also leak existence: a known id can be probed against a store.",
    k: ["Sharing objects across tenants for efficiency vs isolating storage: sharing saves space and risks revealing that a private object exists; isolation is safe and wasteful.", "Immutable history vs allowing erasure: immutability gives trust and caching and makes legal removal and secret cleanup disruptive."],
    p: ["A commit id guessed or leaked can be fetched through a shared store from a different repository unless reads are scoped by reachability.", "Removing sensitive content requires rewriting history and coordinating with every fork and clone, which rarely completes."],
    v: "Request a private repository's commit id through a public fork in the same network and confirm refusal; verify that rehashing a random sample of stored objects matches their ids.",
    dep: ["object-database","fork-networks","packfile-maintenance"]
  },
  "multi-tenancy-isolation": {
    s: "Keeping one customer's data, load and failures from affecting another, across shared storage, queues, caches and search indexes.",
    d: "Every shared component needs a tenant boundary: permission checks on every read path, per-tenant limits on CPU and queue use, quota on storage, and namespaced cache and index keys. Fork networks and shared object stores blur boundaries and need extra scoping. Noisy neighbors appear as pack builds, search queries and webhook deliveries, so each shared pool has fairness rules. Large customers may get dedicated storage or queues. The weak points are the newly added features that forget the boundary.",
    k: ["Shared infrastructure with fairness controls vs dedicated per-customer stacks: shared is efficient and depends on every limit being right; dedicated isolates and multiplies operations.", "Checking permissions centrally vs in each feature: central is auditable and a performance dependency; per-feature is fast and inconsistent."],
    p: ["One customer's build farm clones continuously and consumes enough storage-node CPU to slow everyone on that node.", "A new feature queries a shared index without the tenant filter and returns another customer's data."],
    v: "Run a heavy load as one tenant and confirm another tenant's latency stays within target; run a test that queries every search and list endpoint as a tenant with no access and confirm zero foreign results.",
    dep: ["teams-and-roles","load-shedding","repository-visibility","quota-and-size-limits"]
  },
  "abuse-resistance": {
    s: "Treating all input as hostile: repositories, markup, filenames, webhook targets and repository packets are crafted by attackers, and each must be bounded in time, memory and effect.",
    d: "Repositories can contain deeply nested trees, millions of refs, pathological deltas and filenames that exploit path handling. Rendered content can carry script. Webhook URLs can target internal services. Builds and pages can host malware or mine currency. Defenses include resource limits on every parser and repository command, sandboxing, output sanitizing, outbound request filtering, rate limits and reputation systems. It is an ongoing contest: each new feature that processes user data opens a new surface.",
    k: ["Strict limits that reject unusual but valid input vs permissive handling: strict protects shared capacity and frustrates large legitimate projects; permissive is friendly and exploitable.", "Sandboxing every processor vs trusting vetted code: sandboxing contains bugs and costs performance and complexity; trust is fast and one bug is a breach."],
    p: ["A parser without a time limit lets a single crafted file stall workers handling every other customer's requests.", "Path normalization differences between components allow writing outside the intended repository directory."],
    v: "Feed the system a fuzz corpus of malformed packs, refs, filenames and markup and confirm each is rejected or handled within time and memory limits without crashing a shared process.",
    dep: ["markup-rendering","pre-receive-hooks","webhook-dispatch","abuse-and-spam-controls"]
  },
  "backward-compatibility": {
    s: "Years of clients, scripts and integrations depend on exact protocol behavior, URLs and API shapes, so changes must coexist with old behavior for a long time.",
    d: "Version control clients of many ages speak different protocol versions and capabilities; the server must serve all of them. Clone URLs are embedded in build files and package metadata. API fields are parsed by unknown programs. Hook payloads are consumed by automation. Compatibility shapes decisions such as redirects after renames, versioned APIs, protocol feature negotiation and deprecation schedules. The cost is permanent: every supported old behavior is code that must be tested and secured.",
    k: ["Long support windows vs fast removal: long windows protect integrators and accumulate legacy paths; fast removal simplifies and breaks users.", "Feature negotiation vs version flags: negotiation lets old and new clients coexist automatically and expands the test matrix; flags are explicit and require coordination."],
    p: ["Dropping an old protocol option breaks a large share of build agents that nobody had tracked.", "A change in the order of fields in a payload breaks a receiver that parsed by position."],
    v: "Run a compatibility suite of old client versions and recorded integration payloads against a release candidate and confirm every recorded interaction still succeeds before shipping.",
    dep: ["api-versioning","ref-advertisement","accounts-and-orgs"]
  },
  "cost-control": {
    s: "The dominant costs are storage, egress bandwidth, compute for pack building and builds, and search indexes, and design choices are made to bound them per user.",
    d: "Most of the bill is a few things: repository bytes times replicas, bytes sent out to clients, CPU for packing and indexing, and hosted compute for automation. Controls include deduplicating objects across forks, caching packs, tiering cold data, limiting indexed content, quotas, and charging for large files and bandwidth. Free tiers and public open-source hosting make cost a product decision. The risk is that a feature priced on average use is bankrupted by a few heavy users.",
    k: ["Metered limits per account vs flat limits: metering matches cost to use and complicates the product and billing; flat limits are simple and subsidize heavy users.", "Indexing everything vs indexing selectively: everything gives complete search and large cost; selective bounds cost and omits content users expect."],
    p: ["Large file bandwidth for popular public projects exceeds the revenue of the account that owns them.", "Hosting abuse such as mirroring media or running mining jobs consumes capacity before limits catch it."],
    v: "Produce a cost breakdown per storage byte, egress byte and compute hour for a sample of top accounts and confirm the largest cost drivers match the limits and prices set for them.",
    dep: ["quota-and-size-limits","pack-cache","blob-object-store","large-file-store"]
  },
});
