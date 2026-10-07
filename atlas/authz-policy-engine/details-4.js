// Details part 4: consistency, caching and performance, policy distribution.
ATLAS.details("authz-policy-engine", {
  "consistency-tokens": {
    s: "An opaque token naming a position in the history of permission changes, returned by writes and passed to later checks so they see at least that change.",
    d: "When an application writes a relationship it receives a token. It stores the token with the resource, and later passes it with checks on that resource, so the engine reads data no older than the token. Without a token the engine may use a slightly stale snapshot for speed. The token carries just enough to order versions. The difficulty is plumbing: applications must store and forward tokens correctly, and a missing token silently downgrades a check to the weaker guarantee.",
    k: ["Token per resource versus per session: per resource gives exact guarantees where they matter, while per session is simpler and over-constrains unrelated reads.", "Require a token versus make it optional: required tokens force correct use, but burden every caller, and optional ones default to a weaker guarantee."],
    p: ["An application that stores no token falls back to stale reads right after a revocation, which is when it matters.", "Tokens issued by one region and presented in another that has not yet caught up cause waits or errors."],
    v: "Write a revocation, then check immediately with its token through a lagging replica and confirm deny; check without a token and confirm the documented, possibly stale, result.",
    dep: ["snapshot-reads", "write-ordering", "relationship-write-api"]
  },
  "snapshot-reads": {
    s: "Evaluates a whole decision against one consistent point in the data, so a traversal does not see half of an update.",
    d: "The store keeps versions with positions; a check picks a position, from the request's token or a recent default, and every read in its traversal uses it. Without a fixed snapshot, two reads in one check could see before and after a change and produce an answer that never matched any real state. Using recent snapshots allows caching and replica reads. The difficulty is choosing the position: newest is correct and slow, older is quick and stale.",
    k: ["Fully consistent newest read versus bounded-staleness recent snapshot: newest is always right and costs a coordination round trip, while recent snapshots are fast and may miss the last seconds of change.", "One snapshot per check versus per sub-read: per check gives a coherent answer, while per sub-read lowers wait and can mix versions."],
    p: ["A traversal that reads group membership and resource edges at different versions returns an answer true in no actual state.", "Retention of old versions shorter than long-running list queries aborts them midway."],
    v: "Run a long traversal while concurrently rewriting the edges it reads and confirm the answer matches the state at one single position, not a mixture.",
    dep: ["relationship-store-engine", "write-ordering"]
  },
  "new-enemy-guard": {
    s: "Prevents the case where access is removed from a person and then content is added that they should not see, yet a stale read still lets them in.",
    d: "The classic scenario: an owner removes a person from a folder, then adds a private document. If the check for that document uses data older than the removal, the person is still seen as a member and reads it. The fix is to tie a document's check to a position at least as new as the last permission change that applied to it, recorded as a token when content is created. The difficulty is applying it consistently across every code path that creates or changes content.",
    k: ["Check at the position of the content write versus a global fresh read: content-position tokens give exact safety with caching, while global fresh reads are simple and slow.", "Accept the risk with short bounded staleness versus close it: accepting is cheap, but is a real exposure for sharing products."],
    p: ["Applications that never save the token at content creation use stale reads and lose protection exactly when ordering matters.", "Moving content between folders without refreshing its token carries a stale position."],
    v: "Remove a user from a folder, immediately add a document to it, check access as that user through a replica that has not yet seen the removal, and confirm deny.",
    dep: ["consistency-tokens", "snapshot-reads", "write-ordering"]
  },
  "write-ordering": {
    s: "Assigns every permission change a place in one global order, so any two changes are seen in the same sequence everywhere.",
    d: "The store serializes writes using a consensus protocol or synchronized clocks with bounded uncertainty, and stamps each commit with its position. Later reads and tokens refer to those positions. This is what lets \"as of now\" and \"at least as new as\" mean the same thing in every region. The difficulty is cost: strict global ordering adds cross-region latency to every write, and clock error bounds mean a write may wait out the uncertainty before it can be acknowledged.",
    k: ["Global ordering versus per-shard ordering: global order is easiest to reason about, but limits write latency and throughput, while per-shard order is fast and gives up cross-shard guarantees.", "Clock-based ordering versus consensus rounds: clocks give cheap reads at a fixed wait on writes, whereas consensus avoids special hardware and adds round trips."],
    p: ["Unbounded clock drift on one node breaks ordering guarantees without any visible failure.", "Writes concentrated on one object serialize and queue behind each other during a bulk import."],
    v: "Issue two conflicting writes from different regions at the same time and confirm every replica applies them in the same order, with positions strictly increasing.",
    dep: ["relationship-store-engine"]
  },
  "cross-region-replication": {
    s: "Copies permission data to regions near the services using it, so checks are local, while keeping the replicas ordered and recoverable.",
    d: "Writes go to a leader or a quorum, and replicas in other regions receive the ordered change stream. Reads at a given position are served locally if the replica has reached it, else they wait or are forwarded. Active regions can serve checks independently if the primary is lost. The difficulty is lag: when a replica falls behind, either decisions are stale, or they block, and the engine must expose that lag to operators and callers.",
    k: ["Local replica reads versus forwarding to the leader: local reads are fast and may lag, while forwarded reads are fresh and cost a cross-region trip.", "Single write region versus multi-region writes: a single region is simple and consistent, while multi-region writes lower write latency and need conflict handling."],
    p: ["A replica that quietly stops applying changes keeps granting access to revoked users for hours.", "Failing over to a lagging region loses recent permission changes, including revocations."],
    v: "Revoke access in the primary region and measure the time until checks in a remote region deny; stop replication and confirm the lag alarm fires and positioned checks wait or fail rather than pass.",
    dep: ["relationship-change-stream", "write-ordering", "high-availability"]
  },
  "revocation-propagation": {
    s: "The path by which removing access reaches every cache, token and session that could still honor it, and the time bound within which it must succeed.",
    d: "Revocation touches more than the store: decision caches, sidecar bundles, derived indexes and issued tokens. The system pushes invalidations along the change stream, expires caches by time, and, for high-risk cases, maintains a revocation list that enforcement points consult. Each layer has its own delay, and the end-to-end bound is the sum. The difficulty is that the longest path wins: one forgotten cache with a day-long lifetime defeats everything else.",
    k: ["Push invalidation versus short lifetimes: push is quick and can be missed, while short lifetimes are robust and cost more load.", "Strict revocation bound for all access versus tiered: one bound is simple to promise, while tiers spend effort on the sensitive cases and accept slower for the rest."],
    p: ["A token cache at an enforcement point with a one-hour lifetime keeps honoring a removed user after every other layer has updated.", "Revocation is tested only against the store, never end to end."],
    v: "Revoke a user's access, then poll every layer from store to browser session and record the time each stops allowing; confirm the slowest is within the published bound.",
    dep: ["cache-invalidation", "relationship-change-stream", "token-claims"]
  },
  "read-your-writes": {
    s: "Guarantees that a person who just changed a permission sees its effect on their very next request, even when the request is served by a different replica.",
    d: "After a write the application keeps the returned token in the user's session or on the changed object, and attaches it to the next checks. The engine then serves those reads from a position at least as new, waiting briefly for a replica to catch up. Without it, users share a document and then see it missing, or revoke access and see it still working. The difficulty is storing tokens in the right place and keeping the wait bounded.",
    k: ["Session-scoped tokens versus object-scoped tokens: session tokens fix the user's own view cheaply, while object tokens fix it for everyone and need storage per object.", "Wait for the replica versus route to the leader: waiting preserves locality, but delays, while routing is immediate and costs a longer path."],
    p: ["A user clicks share, the page reloads from a replica that has not caught up, and the share looks lost, so they click again and create duplicates.", "Tokens dropped by a proxy turn every request into a stale read."],
    v: "Share an item and reload through a replica forced to lag by one second; confirm the item appears as shared, and that without the token the stale view is observable.",
    dep: ["consistency-tokens", "snapshot-reads"]
  },
  "decision-cache": {
    s: "Remembers recent allow and deny answers so repeated identical questions skip evaluation, trading a bounded risk of staleness for large reductions in latency and load.",
    d: "The cache maps a normalized request key to a decision and the data version it was computed against, with a time to live. It lives at the enforcement point, in the engine, or both. Hit rates of ninety percent are common because users repeat actions. Entries are dropped by time, by invalidation events or by memory pressure. The hard part is correctness under change: a cached allow outliving a revocation is a security defect, so lifetimes must be set from the freshness the business accepts.",
    k: ["Cache allows and denies versus denies only: caching both gives the best hit rate, while caching only denies is safe against revocation and gives up most of the benefit.", "Time-based expiry versus event-driven invalidation: time-based is simple and bounds staleness, while events are precise and can be lost."],
    p: ["A long-lived cached allow honors access for minutes after revocation, which the business never agreed to.", "A cache stampede on expiry sends all requests to the engine at once."],
    v: "Warm the cache, revoke a permission, and measure how long cached checks keep returning allow; confirm the time is no greater than the configured bound.",
    dep: ["cache-key-design", "cache-invalidation"]
  },
  "subgraph-cache": {
    s: "Caches intermediate results of traversal, such as a user's resolved group memberships or a folder's computed viewers, shared across many different checks.",
    d: "Rather than caching whole decisions, which rarely repeat across different resources, the engine caches the answers to sub-questions that many checks share: the transitive groups of a user, the ancestor chain of a folder. Entries are tagged with the position at which they were computed. The difficulty is invalidation: a change to one edge can invalidate sub-results for many subjects, so the cache needs dependency tracking or conservative expiry.",
    k: ["Cache sub-results versus whole decisions: sub-results get higher reuse across resources, but need more bookkeeping, while whole decisions are simple and low-hit.", "Track dependencies precisely versus expire by time: precise tracking invalidates only what changed, while time expiry is simple and either stale or wasteful."],
    p: ["Changing membership of a large group must invalidate cached closures for every member, causing a spike of recomputation.", "A cached closure computed at an old position is reused for a check requiring a newer one."],
    v: "Run a thousand checks for one user across different documents and confirm group resolution is computed once; change a group edge and confirm the next check recomputes it.",
    dep: ["graph-traversal", "cache-invalidation", "nested-groups"]
  },
  "cache-key-design": {
    s: "Defines what makes two requests the same for caching: which fields are part of the key, how they are normalized, and which are deliberately left out.",
    d: "A key must contain every input that can change the answer, including subject, action, resource, relevant attributes and the policy revision, and nothing that cannot, such as request identifiers. Normalization makes equivalent requests collide: ordering of lists, case, canonical identifiers. Time-dependent rules need a coarse time bucket in the key. The difficulty is omission: leaving out an input that matters returns one user's answer to another, which is the worst caching bug there is.",
    k: ["Include all attributes read versus only declared ones: all attributes is safe and lowers hit rate, while declared-only needs the compiler to know exactly which attributes a rule reads.", "Fine time bucket versus coarse: fine buckets are accurate and miss often, while coarse buckets hit and let a time-limited grant linger."],
    p: ["A key without the policy revision serves answers from an old policy after a release.", "Including a request identifier in the key makes the cache never hit."],
    v: "Issue requests differing in one input at a time, such as attribute, subject and revision, and confirm each produces a separate cache entry; issue equivalent requests with reordered fields and confirm one entry.",
    dep: ["policy-compiler", "request-context-assembly"]
  },
  "cache-invalidation": {
    s: "Removes or refreshes cached decisions and sub-results when the data or policy they depend on changes, using change events, versions or time.",
    d: "Cache entries are tagged with the data position and policy revision they used. The change stream tells caches which objects, subjects or revisions changed, and affected entries are dropped. A secondary protection is a maximum age for every entry, since events can be lost. When changes are too wide to map to entries, a whole cache is flushed. The difficulty is precision: invalidating too little is a security problem and invalidating too much destroys the benefit.",
    k: ["Targeted invalidation versus flush on any change: targeted keeps hit rates but is complex and can miss, while flushing is simple and costly under constant writes.", "Version-checked reads versus eager deletion: checking the version on every hit is always correct and adds a lookup, while eager deletion is cheap and depends on delivery."],
    p: ["Invalidation messages dropped during a network partition leave caches stale until the maximum age.", "A bulk import triggers a flush storm that takes the engine to its knees."],
    v: "Change a relationship and confirm cached entries depending on it are dropped within seconds while unrelated ones remain; drop the event stream and confirm entries still expire at the maximum age.",
    dep: ["relationship-change-stream", "cache-key-design"]
  },
  "request-coalescing": {
    s: "Merges concurrent identical in-flight questions, whether decisions or store reads, into a single computation whose result is shared with every waiter.",
    d: "When a hundred requests ask the same check simultaneously, the first runs and the rest wait for its result instead of each traversing the graph. The same applies to store reads for hot keys. Tracking in-flight work keyed by the cache key bounds load during bursts and cache misses. The difficulty is failure and cancellation: if the leader fails or is canceled, waiters need a retry, and a very slow leader should not hold every waiter hostage.",
    k: ["Coalesce at the decision versus at the store read: decision-level avoids repeated evaluation, while read-level helps every query shape at a finer grain.", "Waiters share the leader's deadline versus have their own: sharing is simple, but one impatient caller can cancel work others needed."],
    p: ["A leader that errors causes every waiter to see the same transient failure.", "Coalescing keys that omit the consistency position merge requests needing different freshness."],
    v: "Fire five hundred identical concurrent checks at a cold cache and confirm via counters that one evaluation and one set of store reads occurred, and all callers received the same result.",
    dep: ["cache-key-design", "graph-traversal"]
  },
  "precomputed-indexes": {
    s: "Derived lookup structures built ahead of time, such as flattened group closures or per-subject reachable sets, that make common checks and list queries single reads.",
    d: "A background job consumes the change stream and maintains structures like a materialized membership closure or an inverted index from subject to accessible resources. Checks then do one or two lookups instead of a traversal. They serve very large or latency-critical workloads. The difficulty is maintenance cost and lag: each write may update many entries, the derived index trails the source of truth by some delay, and rebuilding after a bug can take hours.",
    k: ["Materialize reachability versus traverse on demand: materialized sets make checks and lists fast, but multiply write work and storage by fan-out.", "Derived index as the source for decisions versus only as a hint: using it directly is fastest and exposes its lag, while a hint verified against the store is safe and slower."],
    p: ["A derived index that lags by a minute grants access that was revoked, if used without verification.", "A bug in the index builder silently produces wrong entries, and rebuilding a billion rows takes a day."],
    v: "Compare a sample of ten thousand decisions from the index against full traversal and confirm they agree at the same position; measure the index's lag behind the store under write load.",
    dep: ["relationship-change-stream", "tuple-indexes", "nested-groups"]
  },
  "hot-key-handling": {
    s: "Protects the engine and store when a few objects, such as a company-wide group or a viral document, receive a disproportionate share of reads or writes.",
    d: "Techniques include replicating hot rows across shards and reading from any copy, caching hot sub-results with a longer life and early refresh, splitting a large group into buckets, and rate limiting callers who hammer one object. Detection comes from per-key counters. The difficulty is that hot keys shift: yesterday's cold document is today's incident, so handling must be automatic, and a mitigation that relaxes consistency for hot keys must be deliberate.",
    k: ["Replicate hot data versus shard it further: replication spreads reads for popular objects, while a hot write key still serializes and needs splitting instead.", "Relax freshness for hot keys versus keep it uniform: relaxation keeps the system up, and gives up a guarantee exactly where many people are affected."],
    p: ["One all-employee group referenced by every resource makes a single shard the bottleneck for the whole company.", "Auto-scaling reacts after the hot spot has already caused timeouts."],
    v: "Direct heavy read load at one group, confirm per-key counters flag it, load spreads across replicas, and latency for unrelated checks remains within its normal band.",
    dep: ["sharding-and-partitioning", "subgraph-cache", "engine-observability"]
  },
  "policy-bundle-builder": {
    s: "Packages compiled policy, schema and any static data into one immutable, versioned, signed artifact that engines can load atomically.",
    d: "The builder runs in the pipeline after tests and analysis pass, collects the compiled modules, schema and reference data, computes a content hash, records the source revision, and signs the result. Engines verify the signature before loading. A bundle is the unit of release, rollback and audit. The difficulty is size and reproducibility: large data in bundles slows distribution, and builds that are not byte-for-byte reproducible make it impossible to verify what is running.",
    k: ["Policy and data in one bundle versus separate artifacts: one bundle is atomic and consistent, while separate artifacts let data refresh independently of releases.", "Sign every bundle versus trust the network: signing protects against tampering in transit and at rest, and needs key management and rotation."],
    p: ["An unsigned bundle path lets anyone with write access to storage change the rules fleet-wide.", "A non-reproducible build produces different hashes for the same source and hides drift."],
    v: "Build the same source twice and confirm identical hashes; alter one byte of a bundle and confirm engines refuse it with a signature error.",
    dep: ["policy-compiler", "policy-version-control", "policy-unit-tests"]
  },
  "bundle-distribution": {
    s: "Delivers bundles from the control plane to every engine and sidecar by polling or push, with resumable downloads, version reporting and rate-limited fan-out.",
    d: "Engines poll a bundle service or subscribe to notifications, fetch a new bundle by hash, verify it and report the revision they run. A content delivery layer or regional mirrors absorb fan-out. The control plane tracks which revision each engine has, and can wait for a fraction to confirm before continuing. The difficulty is skew: during rollout the fleet runs mixed revisions, and failures to fetch leave pockets running old policy for long periods.",
    k: ["Push notification plus pull versus polling only: push gets the revision out quickly, while polling is simple, resilient and slower to converge.", "Central bundle service versus peer distribution: central is simple to control and secure, while peer distribution lowers load and widens the trust surface."],
    p: ["Engines that cannot reach the bundle service stay on an old revision with no alert.", "Thousands of engines polling at the same moment overload the bundle service."],
    v: "Publish a new revision and measure the time until ninety-nine percent of engines report it; block one engine's access and confirm it is flagged as behind within its alarm threshold.",
    dep: ["policy-bundle-builder", "engine-observability"]
  },
  "policy-activation": {
    s: "The atomic switch from one loaded policy revision to the next on an engine, performed without dropping requests and with the old revision kept for instant fallback.",
    d: "An engine loads the new bundle into memory beside the current one, validates it with a self-test set, and then swaps a pointer so new requests use it while in-flight requests finish on the old one. The old revision stays until a grace period passes. Activation is recorded with a timestamp. The difficulty is atomicity across a fleet: engines flip at slightly different times, and a caller that makes two related checks may see two revisions.",
    k: ["Swap per engine independently versus coordinated fleet-wide flip: independent swaps are simple and tolerate failures, while coordinated flips give a single cutover time and need a coordinator that can fail.", "Self-test before activation versus trust the build: self-tests catch bad loads at the edge, and cost startup time."],
    p: ["A swap that discards caches built under the old revision drops hit rate to zero and causes a load spike.", "A failed activation leaves an engine half loaded, serving neither revision correctly."],
    v: "Activate a new revision under steady traffic and confirm zero failed requests, a clear switch point in the decision log's revision field, and that rollback restores the old behavior within seconds.",
    dep: ["bundle-distribution", "decision-cache"]
  },
  "canary-and-rollback": {
    s: "Rolls a policy change out to a small fraction of traffic or engines first, compares behavior with the old policy, and reverts automatically or by one command if it diverges.",
    d: "A rollout controller activates the new revision on a canary group, watches disagreement with the shadow baseline, error rates, denial rates by route, and latency, and proceeds in widening steps only if thresholds hold. Rollback re-activates the previous bundle by hash. It limits the damage of a faulty change to a small population. The difficulty is signals: policy bugs show up as changes in denial rates, and distinguishing a legitimate tightening from a mistake needs context.",
    k: ["Automatic rollback on metrics versus human decision: automatic reacts in seconds and can flap or misread a deliberate tightening, while human decisions are slower and informed.", "Canary by engine versus by tenant or user: by engine is simple, while by tenant keeps one customer's experience consistent."],
    p: ["A denial rate that jumps on a small canary is lost in noise, and the change is promoted.", "Rollback restores rules but not the data change that accompanied them."],
    v: "Roll out a deliberately broken revision to one percent, confirm the denial-rate guard halts it, rolls back automatically, and the log shows which requests were affected.",
    dep: ["shadow-evaluation", "policy-activation", "engine-observability"]
  },
  "local-data-replication": {
    s: "Keeps a subset of relationship and attribute data on each engine or sidecar current by following the change stream, so local checks need no remote reads.",
    d: "An engine subscribes to changes for the namespaces and types it serves, applies them in order to a local store, and records its position. A bootstrap loads a snapshot, then catches up. A filter keeps only data the engine's workloads can need. Checks answer from local state when it has reached the requested position. The difficulty is size and security: full copies of all permission data on every host are heavy and risky, so filters must be exact.",
    k: ["Full replica versus filtered subset: full replicas answer everything locally, while subsets use less memory, and require a miss path to the central store.", "Replicate raw tuples versus derived indexes: raw tuples are small and need computation, while derived indexes are larger, and answer faster."],
    p: ["A replica whose filter omits one relation type returns deny for access that the central engine would allow.", "A corrupted local store keeps serving wrong answers until it is rebuilt."],
    v: "Bootstrap a new replica, compare answers to the central engine for ten thousand sampled checks at one position, and confirm zero differences; stop the stream and confirm the replica reports its position falling behind.",
    dep: ["relationship-change-stream", "snapshot-reads"]
  },
  "schema-migration": {
    s: "Changes the schema of types, relations and attributes while live data and running policy still refer to the old shape, in steps that never leave a gap in access.",
    d: "A migration is planned as expand, then migrate, then contract: add the new relation, dual-write tuples under both, backfill existing data, switch policy to read the new relation, and finally remove the old one. Each step is its own release with its own rollback. Checks verify that decisions are identical before and after. The difficulty is volume and ordering: backfilling billions of tuples takes time, during which both forms must stay in step.",
    k: ["Dual-write and backfill versus a maintenance window: dual-write needs no downtime and more steps, while a window is simple and unacceptable for always-on products.", "Verify with shadow evaluation versus trust the migration: shadow verification catches mismatches before cutover and costs extra evaluation."],
    p: ["Removing the old relation before every service stopped writing it leaves new data unreadable.", "A backfill that misses tuples created during the run creates silent gaps in access."],
    v: "Migrate a relation on a copy of production data, run shadow evaluation of old versus new schema across sampled traffic, and confirm identical decisions before cutting over.",
    dep: ["schema-and-types", "shadow-evaluation", "relationship-write-api"]
  },
});
