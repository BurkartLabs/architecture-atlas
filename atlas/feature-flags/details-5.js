// Details for the feature flag service plate, part 5: delivery, control plane, cross-cutting concerns.
ATLAS.details("feature-flags", {
  "flag-config-api": {
    s: "The authenticated HTTP interface for reading and changing flags, segments and settings, used by the console, automation and integrations alike.",
    d: "Resources are projects, environments, flags, segments, members and tokens, with create, read, update and delete operations and, for flags, a patch format that applies precise changes such as adding a rule or changing a rollout weight. Each write carries the version it was based on and is rejected on mismatch. Responses support filtering and paging. It is hard because it is a public contract that scripts depend on for years, and because the same permissions and validation must apply to every caller.",
    k: ["Semantic patch operations versus replacing the whole flag: small safe edits that do not overwrite concurrent changes, but a larger API to design and version.", "Versioned URLs versus compatible evolution of one version: callers can pin behavior, but old versions must be maintained."],
    p: ["Scripts that write whole flag documents overwrite rules added by others since they last read.", "A rate limit tuned for the console blocks a legitimate bulk migration partway through, leaving a half-applied state."],
    v: "Patch a single rule weight through the API with the current version, then repeat with the old version and confirm the second call is rejected with a conflict and the first change is intact.",
    dep: ["flag-store", "validation-and-compilation", "roles-and-permissions", "config-versioning"]
  },
  "polling-client": {
    s: "The SDK loop that asks for the ruleset at a fixed interval, using a version or entity tag so an unchanged answer costs almost nothing.",
    d: "Every interval, with jitter, the client sends an HTTP request with the last entity tag it holds. The server or CDN answers with not modified, or with the new ruleset. Polling works through proxies and firewalls, is trivial to cache at the edge, and needs no open connections. Its freshness equals the interval. It is hard because the interval trades latency against load: a thousand clients polling every ten seconds is a hundred requests a second, and a million is a hundred thousand.",
    k: ["Polling versus streaming: simple, cacheable and firewall-friendly, but changes take up to a full interval to arrive.", "Short interval with conditional requests versus long interval: fresher flags and cheap not-modified answers, but total request volume scales with fleet size."],
    p: ["All clients started by one deploy poll in lockstep and hit the origin together every interval.", "A client ignores the entity tag and downloads the full ruleset on every poll."],
    v: "Change a flag and measure the time until a polling client returns the new value. Confirm it is within one interval and that unchanged polls get a not-modified response with no body.",
    dep: ["flag-config-api", "delta-and-conditional-updates", "retry-and-backoff"]
  },
  "streaming-connection": {
    s: "A long-lived connection from client to service over which changes are pushed as soon as they are published, giving freshness in seconds.",
    d: "The SDK opens a persistent HTTP connection using server-sent events or a similar protocol. The service sends full or partial updates when a flag changes, plus periodic heartbeats so dead connections are detected. On disconnect the client reconnects and requests state since its last version, falling back to polling if streaming keeps failing. Proxies that buffer or time out idle responses are a common obstacle. It is hard because it costs one open connection per client, which dominates infrastructure sizing at scale.",
    k: ["Push over a persistent connection versus polling: changes arrive in seconds, but the tier holds a connection for every client.", "Sending the changed flag versus a notification to refetch: lower latency and lower load on the API, but the message carries sensitive rules that need the same access control."],
    p: ["An intermediate proxy buffers the stream, so updates arrive in large delayed bursts or not at all.", "A missed update during reconnect is never detected because the client does not compare versions."],
    v: "Open a stream, change a flag and confirm the client receives the update in under a few seconds. Kill the connection, change the flag again, reconnect and confirm the client catches up to the latest version.",
    dep: ["change-notification-fanout", "relay-proxy", "delta-and-conditional-updates", "retry-and-backoff"]
  },
  "relay-proxy": {
    s: "A process run by the customer, in their network, that holds a copy of the ruleset and serves it to many SDKs, reducing outbound connections and giving a local fallback.",
    d: "The relay connects to the service once, receives all updates, and exposes the same streaming and polling interfaces locally. SDKs inside a cluster talk to the relay instead of the internet, which saves bandwidth, supports network policies that forbid outbound traffic from application pods, and keeps working with its cached data if the connection to the service drops. It can also store data in a database for other relays. It is hard because it is one more production component to operate and keep current.",
    k: ["A relay in the customer's network versus connecting directly: fewer external connections and local resilience, but one more service to run and patch.", "Relay with persistent storage versus memory only: survives restarts without service access, but holds a copy of private rules on disk."],
    p: ["An outdated relay version does not understand a new ruleset format and quietly stops updating.", "The relay becomes a single point of failure when every application depends on one instance."],
    v: "Point SDKs at the relay, cut the relay's link to the service and confirm SDKs keep returning values and receive the correct update once the link is restored.",
    dep: ["streaming-connection", "flag-config-api", "persistent-sdk-cache", "service-tokens-and-keys"]
  },
  "edge-cache-distribution": {
    s: "Serves rulesets and evaluated payloads from caches near users, so most requests never reach the origin and latency is a short hop.",
    d: "The publisher writes each new ruleset version to object storage behind a content delivery network, using URLs that are either versioned and immutable or short-lived. Clients and relays fetch from the nearest point. Invalidation on change purges the short-lived object so the next request fetches the new one. It is hard because cache invalidation is never instant everywhere, authorization must still apply to private rulesets, and a wrongly cached response can serve one environment's data to another.",
    k: ["Short time-to-live caching versus explicit invalidation: simple and robust, but freshness is bounded by the lifetime.", "Immutable versioned URLs versus a stable URL with revalidation: perfectly cacheable, but clients need a way to learn the newest URL."],
    p: ["A cache key that ignores the environment key serves production rules to a staging client.", "Invalidation fails silently, so some locations keep serving an old ruleset for the full time-to-live."],
    v: "Publish a change and request the ruleset from multiple regions repeatedly, recording version. Confirm every location serves the new version within the stated target and none serves another environment's data.",
    dep: ["config-publisher", "snapshot-files", "service-tokens-and-keys"]
  },
  "change-notification-fanout": {
    s: "Takes one published change and delivers a notification to every connected stream, relay and subscriber, across many servers, quickly and without loss.",
    d: "When the publisher writes a new version, it emits a message on an internal bus. Each streaming server, holding thousands of client connections, subscribes to the environments its clients use, and forwards the update. Servers keep the latest version per environment so a new connection can be caught up immediately. It is hard because fan-out multiplies one change into millions of writes, the bus can lose or reorder messages, and a thundering herd of refetches follows if the notification says only to refetch.",
    k: ["Publishing the change itself versus a version number: no extra fetch, but large messages for large rulesets; with a version only, small messages but a wave of refetches.", "Per-environment topics versus one global topic: servers receive only what they need, but there are many topics to manage."],
    p: ["A streaming server misses a bus message and keeps clients on an old version indefinitely.", "Every client refetches the full ruleset on one notification and saturates the origin."],
    v: "With ten thousand simulated streaming clients, publish one change and confirm all of them report the new version within the target, and that the origin saw the expected number of fetches.",
    dep: ["config-publisher", "flag-store"]
  },
  "delta-and-conditional-updates": {
    s: "Sends only what changed since a client's version, or nothing when nothing changed, so large rulesets cost little to keep current.",
    d: "Clients identify the version they hold. The service answers with a not-modified status, a patch listing changed and deleted flags and segments since that version, or the full ruleset if the client is too far behind or the history is missing. Patches carry versions per item so the store can apply them out of order safely. It is hard because the service must keep enough change history to build patches, and because a patch applied to the wrong base produces a ruleset that never existed.",
    k: ["Patches versus full rulesets on every change: far less bandwidth for big rulesets, but history must be kept and patch logic tested.", "Per-item versions versus one global version: safe independent application, but every flag and segment carries extra metadata."],
    p: ["A client applies a patch built against a different base version and ends with an inconsistent ruleset.", "Compaction of change history drops entries and clients far behind get stuck requesting patches that cannot be built."],
    v: "Change one flag in a ruleset of ten thousand and confirm a client receives only that flag. Request from an unknown old version and confirm the response is a full ruleset that evaluates identically.",
    dep: ["config-versioning", "ruleset-serialization", "in-memory-flag-store"]
  },
  "snapshot-files": {
    s: "Complete, versioned ruleset files written to storage, used for fast bootstrap, relays, edge runtimes, backups and environments with no connection to the service.",
    d: "The publisher writes a complete snapshot per environment on each change, in the shared serialization format, with its version and a checksum, optionally signed. Consumers download the file from storage or a cache instead of calling the API. Old snapshots are retained for rollback and audit. It is hard because snapshots multiply storage and write load when changes are frequent, and because every consumer must verify integrity and know how to detect that a file is older than one it already holds.",
    k: ["Writing a snapshot on every change versus periodically: consumers always see the latest, but write amplification with frequent edits.", "Signed snapshots versus plain files: consumers can verify origin from untrusted storage, but key distribution and rotation add work."],
    p: ["A truncated upload is read by a client that does not verify the checksum and loads half a ruleset.", "A client replaces its ruleset with an older snapshot because versions are not compared."],
    v: "Download a snapshot, verify its checksum and signature, load it into an offline SDK and evaluate a sample of flags. Corrupt one byte and confirm the SDK rejects the file and keeps its previous ruleset.",
    dep: ["ruleset-serialization", "config-publisher", "config-versioning"]
  },
  "flag-store": {
    s: "The durable database of flags, segments, environments and settings, the single source of truth that every other component reads or is derived from.",
    d: "A transactional store holds flag definitions with their per-environment configurations, segments, metadata and members. Writes are single-document transactions with version checks, so concurrent edits do not interleave. Reads for the console go to the store; reads for SDKs come from derived snapshots and caches, so the store is not on the hot path. Scale is modest in rows and extreme in read fan-out. It is hard because a corrupt or lost store takes every customer's configuration with it, and backups must be restorable.",
    k: ["A relational store with transactions versus a document store: strong constraints, joins and audit consistency, but harder horizontal scaling.", "Keeping the store off the evaluation path versus direct reads: protects availability, but means every read path is a derived copy that can lag."],
    p: ["Restoring from backup loses recent flag changes and rolls clients back to older versions unnoticed.", "Large audit or event tables share the database and slow the configuration queries."],
    v: "Make a change, take a backup, restore it into a clean environment and confirm every flag, segment and version matches the original, and that clients bootstrapped from it evaluate identically.",
    dep: ["config-versioning", "environment-model", "project-and-namespace-model"]
  },
  "config-versioning": {
    s: "Assigns a monotonically increasing version to each flag, segment and environment configuration, so any party can tell which is newer and whether it holds the latest.",
    d: "Every successful write increments the version of the changed item and of the environment's whole ruleset. Writers must present the version they started from. Readers and SDKs compare versions to drop stale updates, build patches and verify catch-up after reconnect. Version numbers are issued inside the store's transaction so there are no duplicates or gaps in order. It is hard because versions have to remain monotonic across restores, regional failover and imports.",
    k: ["A counter per item versus a global environment version: precise, independent comparison of items, but two numbers to keep coherent.", "Counters versus timestamps: versions never depend on clocks, but they cannot be compared across systems that did not issue them."],
    p: ["After a restore from backup the version counter goes backward, and clients ignore the correct updates as stale.", "Two regions assign versions independently and produce conflicting numbers for different changes."],
    v: "Make fifty changes through concurrent writers and confirm versions are strictly increasing without duplicates. Restore from backup and confirm the next version is higher than any previously issued.",
    dep: ["flag-store"]
  },
  "environment-model": {
    s: "The division of a project into environments such as development, staging and production, each with its own flag state, keys, segments and permissions.",
    d: "An environment is a boundary: it holds a separate configuration of every flag, its own SDK keys and its own data in the event pipeline. Creating one clones or initializes flags. The set of flags and variants is shared at the project level, while targeting, state and rollouts are per environment. It is hard because environments multiply: teams add per-developer or per-branch environments and the system must handle hundreds, each with keys, snapshots and rules to keep consistent.",
    k: ["Shared flag definitions with per-environment state versus fully separate flags: one identity across stages and easy comparison, but a flag cannot exist in production only.", "Few long-lived environments versus many ephemeral ones: simple governance, but developers cannot test in isolation."],
    p: ["A new environment is created from a template that includes production's segments with real user lists.", "Hundreds of abandoned environments keep generating snapshots and streams that nobody uses."],
    v: "Create an environment, confirm it has distinct SDK keys, and that changing a flag in it does not alter any other environment's served value or version.",
    dep: ["project-and-namespace-model", "flag-store"]
  },
  "project-and-namespace-model": {
    s: "Groups flags into projects, and projects into accounts or organizations, with keys unique within a project and settings and access applied at each level.",
    d: "An account owns projects; a project owns flags, segments and environments. Flag keys are unique only within a project, so two teams can use the same name. Access and billing attach at the account level; roles at project level. Some systems add folders or tags inside a project. It is hard because project boundaries are hard to change later: splitting or merging requires moving flags and rewriting every reference in application code, and a key shared by two services must live in one project.",
    k: ["One project per product or team versus one large project: isolation, ownership and smaller rulesets per project, but a flag shared across services needs cross-project handling.", "Flat keys with tags versus hierarchical namespaces: easy lookup and renaming, but structure relies on convention."],
    p: ["Two services need the same flag, but they are in different projects, so one flag becomes two that drift apart.", "One enormous project makes every ruleset huge and every SDK load flags it will never use."],
    v: "Create two projects with a flag of the same key and confirm changes in one do not appear in the other, and that an SDK key for one project cannot fetch the other's ruleset.",
    dep: ["flag-store"]
  },
  "validation-and-compilation": {
    s: "Checks every proposed change for correctness before it is stored, and turns the human-edited configuration into the compact form SDKs consume.",
    d: "Validation covers schema, types, unique keys, existing variant references, weights summing to full range, segment and prerequisite references, cycles, depth limits and regex safety. Compilation precomputes what the SDK would otherwise compute: resolved references, normalized operators and sorted structures. Invalid changes are rejected with specific messages. It is hard because it is the last defense before configuration reaches every client, because rules change over time, and because stored older configurations must still load after the validator tightens.",
    k: ["Rejecting invalid changes at save versus tolerating them in SDKs: bad configuration never ships, but old stored data needs migration when rules tighten.", "Compiling server-side versus in each SDK: SDKs stay small and fast, but compiled output becomes a format to version."],
    p: ["A validation gap lets a rollout with weights totaling over one hundred percent reach production.", "A stricter validator rejects existing flags on re-save and blocks unrelated edits."],
    v: "Submit changes with a dangling segment reference, a cycle, an invalid pattern and weights that do not sum to the whole, and confirm each is rejected with a specific error and no new version is created.",
    dep: ["flag-and-variant-model", "ruleset-serialization", "targeting-operators"]
  },
  "config-publisher": {
    s: "Takes each accepted change, builds the delivery artifacts for the environment and pushes them to caches, snapshots and notification channels in a defined order.",
    d: "After a transaction commits, the publisher reads the new environment state, compiles the ruleset, writes the snapshot to storage, invalidates caches, updates streaming servers and relays and emits webhooks and audit events. A transactional outbox ensures that if it crashes, it resumes rather than losing the publication. Order matters: storage before notification, so notified clients find the data. It is hard because the steps are not atomic across systems, and a partial publication leaves some paths on a new version and others on an old one.",
    k: ["Outbox with at-least-once publication versus fire-and-forget: no change is lost on a crash, but consumers must tolerate duplicates.", "Publishing to all channels in parallel versus in order: lower latency, but a notification can arrive before the data is readable."],
    p: ["The notification goes out before the snapshot is written, and clients fetch the old data and conclude they are current.", "A crash after commit and before publication leaves the store ahead of every delivery path."],
    v: "Kill the publisher after a commit and before delivery, restart it, and confirm snapshots, caches and streams all reach the new version, with exactly one webhook per change.",
    dep: ["flag-store", "validation-and-compilation", "snapshot-files", "config-versioning"]
  },
  "multi-region-replication": {
    s: "Keeps the control plane and delivery path running in several regions, replicating configuration so a regional failure stops neither changes nor SDK reads.",
    d: "Delivery tiers run active in many regions, each serving from a locally replicated copy of snapshots and the streaming state. The authoritative store may be single-writer with replicas, or multi-primary with conflict rules. Failover for writes is slower and rarer than failover for reads, which is the part that matters for running applications. It is hard because replication lag means regions briefly disagree, failover can lose recent writes, and version numbers must remain consistent when a different region becomes the writer.",
    k: ["Single writer region with replicas versus multi-primary: simple, consistent writes, but a writer outage blocks changes until promotion.", "Serving reads from the nearest region versus a pinned region: low latency and resilience, but clients may see different versions around a change."],
    p: ["A failover promotes a replica that missed the last few writes and silently reverts recent flag changes.", "A client fails over to a distant region and sees an older version than it previously held, then ignores updates."],
    v: "Disable one region in a test deployment and confirm SDKs continue to receive updates from another region and that a change made afterward reaches all clients, with no version regression.",
    dep: ["flag-store", "config-versioning", "edge-cache-distribution"]
  },
  "data-residency": {
    s: "Ensures configuration and event data are stored and processed only in regions the customer chose, to meet legal and contractual requirements.",
    d: "Accounts are pinned to a region for the store, event pipeline and logs. Delivery caches may be global for rulesets if those hold no personal data, while events carrying context attributes stay in the pinned region. Cross-region support access is controlled and logged. Separate instances per region are the simplest implementation. It is hard because a global feature such as a shared console, support tooling or analytics export can leak data across the boundary, and because the edge cache serves from everywhere by design.",
    k: ["Separate full instances per region versus one global system with data tagging: strict, understandable isolation, but duplicated operations and no cross-region view.", "Global rulesets with regional events versus all regional: lower latency and simpler delivery, but rulesets containing individual user keys may not be allowed to leave."],
    p: ["A global edge cache holds a ruleset with explicit user lists that must not leave the region.", "Support tooling in another region reads event data during a ticket, breaching the residency promise."],
    v: "Create an account pinned to one region, generate events and configuration, and confirm from storage and network inventory that no persisted copy or processing occurs outside that region.",
    dep: ["flag-store", "evaluation-event-ingestion", "edge-cache-distribution"]
  },
  "consistency-and-propagation-delay": {
    s: "How long a flag change takes to reach every client, and what a user or system sees in the window when some have the change and some do not.",
    d: "Propagation includes validation, commit, publication, notification fan-out and the client's own update interval. Streaming gets it to seconds; polling to the interval; edge caches and mobile apps to minutes or longer. During propagation, two servers handling one user's consecutive requests may disagree. Features needing coordination, such as a database migration gated by a flag, must be designed to tolerate both states at once. It is the cross-cutting reality that no flag change is instantaneous or atomic across a fleet.",
    k: ["Designing features for both states during propagation versus assuming atomic change: correct under real conditions, but needs forward-and-backward compatible code.", "Paying for faster propagation with streaming and short caches versus accepting minutes: tighter incident response, but more connections and cost."],
    p: ["A feature requiring all servers to agree breaks during the seconds when only some have the flag.", "Teams quote the streaming delay as a guarantee, and are surprised by minutes-long delay on mobile and edge."],
    v: "Change a flag and sample the version held by a large fleet every second. Plot the distribution of times to converge and confirm the high percentile meets the stated target for each client type.",
    dep: ["config-publisher", "change-notification-fanout", "polling-client", "in-memory-flag-store"]
  },
  "latency-budget": {
    s: "The time a flag check may add to a request, which is usually microseconds, and how each design choice spends or protects it.",
    d: "Server evaluations from in-memory rules cost microseconds, so a page can check hundreds of flags. Remote evaluation, per-check queries to a segment store, or a blocking initialization wait costs milliseconds to seconds and does not scale to the number of checks a request makes. The budget covers cold start, first evaluation after deploy and the p99 under load, not only the average. It is the reason evaluation is local and the network is kept off the request path.",
    k: ["Local evaluation versus remote evaluation: no per-check latency and no outage coupling, but rules must be distributed to every runtime.", "Precomputed values per user versus evaluating on demand: constant-time reads, but a context change triggers recomputation."],
    p: ["A flag check inside a tight loop calls a remote segment store and turns microseconds into seconds.", "Latency is measured on warm instances only, hiding the cold start that waits for the first ruleset."],
    v: "Benchmark evaluation of the busiest flag with realistic contexts and rule counts at production concurrency, and confirm the p99 stays under the documented microsecond figure with no network calls made.",
    dep: ["in-memory-flag-store", "rule-evaluator", "initialization-timeout"]
  },
  "failure-semantics": {
    s: "What an application gets from a flag check when anything goes wrong, and the rule that the service being down must never take the application down.",
    d: "The system fails open to defined values: last known rules if present, persisted cache next, call-site default last. Every layer states its failure behavior: SDK initialization, streaming loss, ingestion backlog, control plane outage, bad configuration. The control plane may be fully unavailable and the application keeps running. The cost is that during failure, flags are stale and kill switches cannot be pressed. It is the philosophy that decides every other fallback and keeps flags a convenience, not a dependency.",
    k: ["Failing to stale or default values versus failing the request: applications survive the outage, but run on out-of-date rules.", "Safe default per flag versus one global default: each feature chooses its own safe state, but needs deliberate choices at every call site."],
    p: ["A safety flag whose default is the unsafe state is switched off by an outage instead of staying on.", "Failure paths are never exercised, so the first test of the fallback happens during a real outage."],
    v: "In a staging environment, take down the flag service entirely during a load test and confirm the application error rate and latency are unchanged while flags return last known or default values.",
    dep: ["last-known-good-cache", "in-code-default-values", "initialization-timeout", "degraded-mode-signals"]
  },
  "trust-boundaries": {
    s: "Which parties may see which data: server code sees full rules, browsers and phones see only their own values, and operators and analysts see different slices.",
    d: "Server SDKs hold complete targeting rules, including segments and customer lists, so they live in trusted infrastructure. Client-side code can be read and modified by the user, so it receives only evaluated values, and must never be the sole enforcement of access or payment. Contexts sent to the service are personal data. Console users, automation tokens and support staff each get least privilege. It decides key types, evaluation location and what the event pipeline may store.",
    k: ["Evaluating on the server for untrusted clients versus shipping rules: private targeting stays private, but each context change needs a request.", "Treating client flags as UI hints versus as access control: simple frontends, but real enforcement stays on the server side."],
    p: ["A paid feature is gated only by a client-side flag, and anyone can unlock it by editing local storage.", "Full rulesets, with named customer lists, are shipped to every browser."],
    v: "Inspect network traffic and storage in a browser session and confirm no rules, segment lists or other users' attributes are present. Modify a client-side value locally and confirm server-side enforcement still denies the gated action.",
    dep: ["service-tokens-and-keys", "client-side-sdk", "attribute-privacy", "roles-and-permissions"]
  },
  "scale-and-cost": {
    s: "How load and cost grow with the number of clients, flags, evaluations and events, and which design choices keep each of them from growing with traffic.",
    d: "Evaluations are free of network cost if local. Costs scale with connections (streaming), requests (polling), events (ingestion), ruleset size times clients (bandwidth), and retained data (storage). Event volume tracks product traffic, so summarizing and sampling are the controls. Streaming tiers are sized by connection count. Edge caches absorb read fan-out. It is the reason architecture choices such as relay proxies and summarized events exist at all.",
    k: ["Flat cost per client through connections versus cost per evaluation through remote calls: predictable capacity planning, but per-client resources needed even for idle apps.", "Sampling and summarizing events versus keeping everything: cheap, but loses detail that later questions may need."],
    p: ["Doubling the fleet doubles streaming connections and event batches, and the tier was sized for the old count.", "An evaluation inside a hot loop with full per-evaluation events produces billions of events a day."],
    v: "Load test with ten times the expected clients and event rate and confirm connection count, ingestion rate, origin request rate and storage growth match the capacity model within a stated margin.",
    dep: ["streaming-connection", "event-batching-and-sampling", "edge-cache-distribution", "relay-proxy"]
  },
  "tenancy-and-isolation": {
    s: "How one customer's configuration, traffic and failures are kept from affecting another's, in a service shared by many organizations.",
    d: "Every record carries an account and project identifier enforced in the data layer, not only in the API. Rate limits and quotas are per account so a noisy client cannot starve others. Cache keys include the environment. Streaming and ingestion tiers shed load per tenant. Large customers may get dedicated cells. A bug in any of these is a data breach or an outage for others. Tenancy sets how keys, caches, queues and the event pipeline are partitioned.",
    k: ["Shared infrastructure with logical isolation versus dedicated cells: efficient and simple operations, but a bug or noisy tenant can affect everyone.", "Per-tenant quotas versus global limits: fair sharing, but legitimate bursts from a big customer get throttled."],
    p: ["A cache key without an account identifier serves one customer's ruleset to another.", "One customer's event spike fills a shared queue and delays usage data for every other tenant."],
    v: "Using credentials from tenant A, attempt to read, write and stream every resource type of tenant B and confirm all are denied. Flood tenant A with events and confirm tenant B's ingestion latency is unchanged.",
    dep: ["project-and-namespace-model", "service-tokens-and-keys", "environment-model", "evaluation-event-ingestion"]
  },
});
