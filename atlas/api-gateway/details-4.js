// Details for the API gateway plate, part 4: logging and tracing, control plane, availability, cross-cutting concerns.
ATLAS.details("api-gateway", {
  "access-logs": {
    s: "One structured record per request with caller, route, status, sizes, timings and decisions, written without slowing the request path.",
    d: "Each record carries the consumer, route, upstream, status codes from the gateway and the backend, bytes, gateway and upstream timings, the policy that rejected it, and the correlation identifier. Records are buffered and written asynchronously to a file, a socket or a collector. They are the first evidence in any incident. It is hard because volume is huge, logging must never block traffic, and records must contain enough to explain a decision while excluding secrets and personal data.",
    k: ["Log every request versus sample: full logs support audit and billing disputes and cost storage, sampling is cheap and loses rare events.", "Synchronous write versus buffered asynchronous: synchronous never loses a line and puts disk speed on the latency path, buffering is fast and drops lines in a crash."],
    p: ["Authorization headers or query strings with tokens end up in logs.", "A full log disk or slow collector blocks workers and turns logging into an outage."],
    v: "Send a known set of requests, including rejected ones, and confirm one record each with correct status, timings and rejecting policy, then fill the log sink and confirm traffic latency does not change.",
    dep: ["filter-chain", "correlation-ids", "log-redaction"]
  },
  "correlation-ids": {
    s: "A unique identifier assigned to each request at the edge and passed through every hop and log, so one request can be followed across systems.",
    d: "The gateway accepts a valid identifier from a trusted caller or generates a new one, adds it to the request headers sent upstream, to the response and to every log line and trace. Backends copy it into their own logs and downstream calls. It is the join key for debugging. It is hard because it only works if every service propagates it, and because accepting client-supplied values without validation allows log injection or collisions.",
    k: ["Trust inbound identifiers versus always generate: trusting lets clients correlate their own logs and invites spoofing, always generating is safe and loses the client's link.", "Random identifier versus time-ordered: random is simple, time-ordered helps storage locality and reveals timing."],
    p: ["A client-supplied identifier contains newlines or control characters and corrupts log lines.", "One service in the chain drops the header and traces break there."],
    v: "Send a request through the gateway to a multi-hop backend and search logs of each service for the identifier. It appears in every one, and the response header returns the same value.",
    dep: ["filter-chain", "header-manipulation"]
  },
  "distributed-tracing": {
    s: "Creates and forwards trace context so the gateway's span appears as the first segment of an end-to-end timeline across services.",
    d: "The gateway starts or continues a trace using the standard context headers, records spans for its own work and for each upstream call, and exports them to a collector, usually sampled. It shows where time goes: gateway policy, connection setup, backend. It is hard because sampling decisions must be consistent across services, high volume makes tracing expensive, and spans need attributes such as route and consumer without leaking sensitive data.",
    k: ["Head sampling versus tail sampling: head sampling decides up front and is cheap and misses rare errors, tail sampling keeps interesting traces and needs a collector that holds whole traces.", "Gateway starts traces versus continues the caller's: starting guarantees a trace for each request, continuing joins the client's trace and trusts external context."],
    p: ["The gateway drops incoming trace headers and every trace starts a new unconnected root.", "Span attributes include query strings or tokens."],
    v: "Make a request that crosses three services and open its trace: one connected timeline, with the gateway span showing policy time and upstream time separately, and no credentials in any attribute.",
    dep: ["correlation-ids", "http-parser", "gateway-metrics"]
  },
  "gateway-metrics": {
    s: "Counters, gauges and histograms about traffic, errors, latency, saturation and internals, exposed for scraping or pushed to a metrics system.",
    d: "Metrics cover request rates and status by route and upstream, latency histograms for gateway and upstream time, open connections, pool use, limiter rejections, cache hits, config version and certificate expiry. They feed dashboards, alerts and automatic canary decisions. It is hard because label cardinality can explode (consumer, path), counting must be cheap on the hot path, and averages hide the tail, so histograms with agreed bucket boundaries are needed.",
    k: ["Labels per route and consumer versus aggregated: detailed labels answer more questions and can overwhelm the metrics store, aggregation is cheap and loses attribution.", "Pull scraping versus push: pull is simple to discover and reach and covers failed nodes poorly, push works across networks and loses data silently."],
    p: ["Raw URL paths used as labels create millions of series and bring down the metrics store.", "Alerts use average latency and miss a slow tail that hurts users."],
    v: "Send a known mix of requests and compare dashboard counts and percentiles with the load generator's own numbers. They agree, and series count stays flat as unique paths increase.",
    dep: ["filter-chain", "worker-model"]
  },
  "audit-trail": {
    s: "A tamper-resistant record of administrative actions: who changed which route, policy, key or limit, when, and what the change was.",
    d: "Every call to the admin API and every pipeline-driven change writes an entry with the actor, the object, the before and after, and the result, to an append-only store separate from operational logs. It supports compliance, incident reviews and rollback. It is hard because changes made through several paths (console, pipeline, emergency access) must all be captured, actors need real identities rather than shared accounts, and entries must be protected from the same administrators they record.",
    k: ["Record diffs versus whole objects: diffs are compact and need replay to understand, whole objects are easy to read and heavier and may contain secrets.", "Store with the control plane versus an external immutable store: local is simple and can be changed by a compromised admin, external is trustworthy and an extra system."],
    p: ["A shared admin account makes every entry say the same actor.", "Secrets in changed objects are stored in plain text in the trail."],
    v: "Change a route through each path (console, API, pipeline) and confirm each change appears with the right actor, before and after values and result, and that an administrator cannot edit or delete past entries.",
    dep: ["admin-api", "state-store"]
  },
  "log-redaction": {
    s: "Removes or masks sensitive values from logs and traces, and samples verbose records, so telemetry is safe to store and cheap to keep.",
    d: "Rules strip credential headers, tokens in query strings, configured body fields and patterns resembling card numbers or emails before records leave the process. Sampling keeps all errors and a fraction of successes. Done at the gateway, it protects every downstream log system. It is hard because logging pipelines grow new fields, pattern matching is imperfect, and debugging an incident often needs exactly the data one wants to hide, so temporary, audited, narrowly scoped exceptions are needed.",
    k: ["Redact at the source versus in the log pipeline: at the source sensitive data never leaves the process, in the pipeline is easier to update and exposes raw data in transit.", "Allowlist of fields versus denylist: an allowlist is safe by default and drops useful new fields, a denylist keeps everything and leaks whatever was not listed."],
    p: ["A new custom header carries a token and is logged in full because the denylist did not know it.", "Sampling drops the one request that failed in an unusual way."],
    v: "Send requests containing known test secrets in headers, query strings and bodies, then search the log sink and traces for them. None is found, while all error requests are present.",
    dep: ["access-logs", "data-masking", "filter-chain"]
  },
  "admin-api": {
    s: "The authenticated interface for creating, reading, changing and deleting gateway configuration, used by consoles, pipelines and people.",
    d: "The API exposes routes, upstreams, consumers, credentials, plans and policies as resources, with authentication, role-based permissions, validation and optimistic concurrency. All other tools, the console and the pipeline included, should use it. It is a privileged interface into traffic for every API, so it is a high-value target. It is hard because it must be reachable by operators and not by the public, its permissions must be fine enough to separate teams, and writes must be validated before they spread.",
    k: ["Admin API on a separate port and network versus the public listener: separate keeps it off the internet and needs access paths, shared is simple and risky.", "Fine-grained roles per workspace versus coarse admin: fine roles contain mistakes and multiply setup, coarse is easy and gives everyone a blast radius."],
    p: ["The admin interface is exposed to the internet with default or no credentials.", "Two operators edit the same object and the last write silently wins."],
    v: "Call the admin API from the public network and confirm it is unreachable, then as roles with different permissions and confirm each can change only its own workspace, and a stale update is rejected with a conflict.",
    dep: ["declarative-config", "config-validation", "multi-tenancy", "audit-trail"]
  },
  "declarative-config": {
    s: "The complete desired state of the gateway written as files or documents, stored in version control, instead of built up through individual commands.",
    d: "A configuration describes all routes, upstreams, consumers, plugins and settings in a schema-checked format. The gateway or a controller reconciles the running state to it. It makes changes reviewable, repeatable and recoverable, and allows copies of the environment. It is hard because large configurations need composition and templating, which adds its own errors, and because runtime-created state, such as keys issued in the portal, must live somewhere that does not conflict with the file.",
    k: ["Whole-state files versus incremental API edits: files give review and rollback and make small changes heavy, API edits are quick and invisible to version control.", "Templated configuration versus plain: templates reduce repetition and hide what is actually deployed, plain is verbose and visible."],
    p: ["Operators make hotfixes through the API and the next pipeline run silently reverts them.", "A templating mistake generates a valid configuration that routes everything to one service."],
    v: "Apply a configuration to an empty gateway and compare the live state with the files: no differences. Change one route in the file and confirm only that route changes in the diff and on the nodes.",
    dep: ["config-validation", "state-store"]
  },
  "config-validation": {
    s: "Checks a proposed configuration for syntax, schema, references and policy before it is applied, and can simulate its effect on recorded requests.",
    d: "Validation runs in stages: schema and type checks, referential checks (every route's upstream exists), conflict detection between routes, security linting (no unauthenticated admin routes) and a dry run that replays sample traffic against old and new configurations and shows differences. It blocks mistakes before they reach every node. It is hard because the most damaging errors are semantically valid, such as a route that matches too broadly, so tests need realistic traffic.",
    k: ["Validate only structure versus also behavior replay: structure checks are fast and catch typos, replay catches wrong but valid changes and needs maintained traffic samples.", "Block on lint warnings versus advisory: blocking enforces standards and slows urgent fixes, advisory keeps speed and gets ignored."],
    p: ["A new catch-all route passes validation and takes traffic from existing specific routes.", "Validation runs on the control plane's version while nodes run a different version that rejects the config."],
    v: "Submit a configuration with a missing upstream, a conflicting route and a broad route that shadows others. Each is rejected or flagged before distribution, and a replay report names the requests whose routing would change.",
    dep: ["declarative-config", "route-matching"]
  },
  "config-distribution": {
    s: "Delivers the validated configuration to every gateway node, as snapshots or streams, and confirms which version each node is running.",
    d: "Nodes either pull from the control plane or hold a stream open to receive updates, build the new configuration off to the side, and swap it in atomically. Some designs have each node read a shared database and poll. Nodes report their applied version so the system knows when a change has fully propagated. It is hard because propagation is not instantaneous, so nodes briefly disagree, a revoked credential stays valid until the last node updates, and a slow or failing node must not block the rest.",
    k: ["Push stream versus polling: push propagates in seconds and needs long-lived connections and ordering, polling is simple and has a delay of one interval and constant load.", "Full snapshots versus incremental deltas: snapshots are simple and self-healing and heavy for large configs, deltas are light and need correct ordering and recovery."],
    p: ["A node misses an update and runs stale policy for days because nothing compares versions.", "A large configuration is rebuilt on every change and causes CPU spikes on all nodes at the same moment."],
    v: "Change a route and record applied-version reports from every node: all reach the new version within the stated time, requests are never routed by a half-applied configuration, and a revoked key is refused everywhere.",
    dep: ["state-store", "graceful-reload", "config-versioning"]
  },
  "config-versioning": {
    s: "Keeps every applied configuration as an immutable, identified version, so any change can be compared and any version restored quickly.",
    d: "Each applied configuration is stored with an identifier, author, time and parent, and nodes report which one they run. Rollback re-applies a previous version through the same distribution path. Version identifiers also tag logs and metrics, so changes can be linked to regressions. It is hard because the configuration refers to state outside itself (credentials, plans, certificates), so restoring an old version may not restore the old behavior unless those are versioned too.",
    k: ["Store full versions versus diffs: full versions restore instantly and use space, diffs are compact and depend on a chain staying intact.", "Automatic rollback on metrics versus manual: automatic limits damage quickly and can revert the wrong thing during unrelated incidents, manual is deliberate and slow."],
    p: ["A rollback restores routes but not the credentials and plans they refer to, leaving mismatched state.", "Versions are pruned to save space and the last known good one is gone."],
    v: "Apply a bad change, observe the regression with the version label on metrics, roll back, and confirm the previous behavior returns on all nodes within the propagation time and matches the stored version exactly.",
    dep: ["declarative-config", "state-store", "audit-trail"]
  },
  "gitops-pipeline": {
    s: "The automated path from a reviewed change in version control to validation, staged rollout and production, with gates and rollback.",
    d: "Changes to configuration files are reviewed and merged, then a pipeline validates them, applies them to a test gateway, runs contract and smoke tests, and promotes through environments, possibly to a fraction of nodes first. The pipeline is the only identity allowed to write production. It gives review, history and repeatability. It is hard because the pipeline holds production write access, emergency changes need a faster path that still leaves a record, and drift between files and live state must be detected.",
    k: ["Pipeline as the only writer versus allowing console edits: one writer gives clean history and slows emergencies, console edits are fast and cause drift.", "Promote all nodes at once versus staged: staged limits damage and takes longer, at once is quick and exposes every user."],
    p: ["An emergency console edit is never back-ported to version control and is overwritten later.", "The pipeline's credentials are broader than needed and a compromised build can change any route."],
    v: "Merge a change with an intentional error in a test environment and confirm the pipeline stops it before production. Merge a good change and confirm staged promotion, with the version visible on each node and in the audit trail.",
    dep: ["declarative-config", "config-validation", "admin-api"]
  },
  "multi-tenancy": {
    s: "Separates teams, environments or customers within one gateway, with their own routes, consumers, limits and permissions, and prevents cross-impact.",
    d: "Workspaces or tenants namespace configuration objects and attach roles, quotas and plugins. Data plane isolation may be logical (shared nodes, per-tenant limits) or physical (dedicated nodes). It lets many teams share one platform and its operations. It is hard because shared nodes mean shared failure: one tenant's traffic or configuration can exhaust memory, connections or CPU, and cross-tenant references and global resources, such as certificates, blur the boundaries.",
    k: ["Shared data plane with logical isolation versus dedicated nodes per tenant: sharing is efficient and noisy neighbors can hurt others, dedicated isolates failures and costs more to run.", "Per-tenant configuration objects versus a shared library: per-tenant is isolated and duplicated, shared is consistent and couples teams."],
    p: ["A tenant's expensive plugin or regex slows the shared workers for everyone.", "An object name collision lets one tenant reference another's upstream or credential."],
    v: "Overload one tenant's routes and confirm other tenants' latency and error rates stay within targets, and that a tenant's administrator cannot list or reference another's objects through the admin API.",
    dep: ["admin-api", "state-store", "concurrency-limits"]
  },
  "node-fleet": {
    s: "Many identical gateway nodes that hold no durable state of their own, so any node can fail or be replaced without losing data.",
    d: "Nodes receive configuration from the control plane, keep counters and caches as disposable state, and write telemetry out. Because they are interchangeable they scale horizontally and are replaced by deployment, not repair. Capacity planning counts handshake rate, request rate and body bytes. It is hard because some state is not truly disposable, such as local counters used for limits and warm caches, so replacing nodes changes behavior, and fleet size multiplies per-node limits.",
    k: ["Few large nodes versus many small: large nodes use cores efficiently and make each failure costly, small nodes limit failure impact and raise coordination overhead.", "Immutable nodes replaced on change versus in-place updates: immutable is predictable and slower, in-place is quick and accumulates drift."],
    p: ["Limits and pool sizes set per node silently change meaning when the fleet size changes.", "All nodes start together after a deploy and hit the control plane and backends at once."],
    v: "Kill a random node under load and confirm no more than the in-flight requests on it fail, traffic shifts within the balancer's detection time, and a replacement joins and receives configuration unaided.",
    dep: ["config-distribution", "worker-model", "listeners-and-tls"]
  },
  "front-load-balancer": {
    s: "The layer in front of the gateway nodes that spreads connections across them and removes failed ones, using DNS, an anycast address or a network load balancer.",
    d: "It distributes new connections among healthy nodes, checks their health, and may terminate or pass through TLS. A layer-4 balancer is fast and simple and sees no HTTP, a layer-7 balancer can route by host and path. It sets the client address visible to the gateway, through a proxy protocol header or forwarded headers. It is hard because it is a single point of failure that needs its own redundancy, connection draining must align with the gateway's, and client address handling is a common security and rate-limiting bug.",
    k: ["Layer-4 passthrough versus layer-7 balancer: layer 4 preserves TLS and client certificates and sees nothing of requests, layer 7 gives HTTP-aware control and a second proxy to operate.", "DNS-based versus anycast addressing: DNS is flexible and slow to change because of caching, anycast fails over quickly and needs network-level support."],
    p: ["The gateway sees the balancer's address as the client and every consumer shares one rate-limit key.", "Health checks pass at the balancer while the gateway is overloaded and refuses real work."],
    v: "Remove a node and a front balancer instance in turn under load and confirm clients reconnect within the stated time, the gateway logs show true client addresses, and health checks reflect gateway readiness.",
    dep: ["node-fleet", "listeners-and-tls", "active-health-checks"]
  },
  "multi-region": {
    s: "Runs the gateway in more than one region, with traffic steering, regional failover and decisions about what state is shared across regions.",
    d: "Each region has its own fleet and local access to backends, with global traffic management sending users to the nearest healthy region. Configuration replicates from one source, and counters and caches are regional unless deliberately shared. It improves latency and survives a regional outage. It is hard because global limits and quotas need cross-region state with high latency, failover can overload the surviving region, and configuration changes must reach all regions in a safe order.",
    k: ["Regional limits versus global limits: regional limits are fast and add up to more than the total allowance, global limits are exact and add cross-region latency or lag.", "Active-active versus active-passive: active-active uses all capacity and demands that every region handle a failover surge, active-passive is simpler and leaves idle spend."],
    p: ["A region fails and its traffic doubles the load on its neighbor, which then also fails.", "A quota is enforced per region so customers receive several times their plan."],
    v: "Fail one region in a drill and confirm users shift within the target time, the remaining regions stay below capacity thresholds, and quota use after failover stays within the plan.",
    dep: ["front-load-balancer", "state-store", "config-distribution", "counter-store"]
  },
  "graceful-reload": {
    s: "Applies configuration changes and software upgrades without dropping connections, by building the new state beside the old and draining the old.",
    d: "On a change the gateway constructs new routing and policy tables, swaps them in atomically for new requests, and lets requests in flight finish on the old ones. For binary upgrades, a new process takes over the listening sockets and the old exits after draining. Long-lived connections are given a deadline. It is hard because memory use doubles during overlap, long connections delay completion, and a failed build of the new state must leave the old one running.",
    k: ["In-process reload versus rolling replacement of nodes: reload is instant and bound to process lifetime bugs, replacement is clean and slower and loses warm state.", "Drain deadline short versus long: short finishes deploys fast and cuts slow clients, long is gentle and keeps old versions running for hours."],
    p: ["Reload under heavy configuration builds the tables twice and exceeds memory.", "A reload with an invalid configuration kills workers instead of keeping the old state."],
    v: "Reload repeatedly under steady load with a mix of short requests and long streams. No request fails, memory returns to baseline, and an intentionally invalid configuration leaves the old one serving.",
    dep: ["worker-model", "config-distribution", "listeners-and-tls"]
  },
  "autoscaling": {
    s: "Adds and removes gateway nodes according to load, so capacity follows demand without manual intervention.",
    d: "A controller watches CPU, request rate, connections or latency, and changes the node count within limits, with cooldowns to avoid oscillation. New nodes must pull configuration and warm connections before accepting traffic. It saves cost and absorbs spikes. It is hard because TLS handshakes and sudden bursts arrive faster than nodes start, scaling in cuts live connections, and every scaling event changes per-node limits and pool sizes.",
    k: ["Scale on CPU versus on request rate or connections: CPU is simple and lags for I/O-bound work, request metrics track demand and need thresholds matched to the workload.", "Predictive or scheduled scaling versus reactive: scheduled scaling prepares for known peaks and misses surprises, reactive handles any spike after it has begun."],
    p: ["A traffic spike arrives faster than nodes start, and the existing ones fail before help comes.", "Scale-in removes nodes holding long streams and clients reconnect together."],
    v: "Ramp load from low to peak in a test and watch: latency stays within target during scale-out, new nodes pass readiness before taking traffic, and scale-in drains connections with no extra errors.",
    dep: ["node-fleet", "gateway-metrics", "graceful-reload"]
  },
  "disconnected-mode": {
    s: "How data plane nodes keep serving with their last known configuration when the control plane or state store is unreachable.",
    d: "Nodes cache the applied configuration and credentials locally and continue to authenticate, route and limit while the control plane is down, accepting that changes and revocations cannot arrive. They resume syncing when it returns and report how long they were disconnected. It makes the control plane's availability independent of the data path. It is hard because the longer the outage, the staler the policy, and a restarting node with no cached configuration cannot start unless a last-good copy is stored locally.",
    k: ["Serve stale configuration indefinitely versus stop after a deadline: indefinite keeps traffic flowing and ignores revocations, a deadline limits staleness and converts a control outage into an API outage.", "Persist configuration to local disk versus keep in memory: disk lets restarts survive an outage and stores sensitive data at rest."],
    p: ["A node restarts during a control plane outage with no cached configuration and cannot serve at all.", "Revoked keys keep working for the whole outage and nobody is alerted that nodes are stale."],
    v: "Block the control plane from all nodes, send traffic for an hour, and restart one node. Traffic keeps flowing with last-good configuration, the restarted node starts from its local copy, and an alert reports the disconnection age.",
    dep: ["config-distribution", "state-store", "secrets-store"]
  },
  "state-store": {
    s: "The durable database holding configuration, consumers, credentials, plans and sometimes counters, replicated for availability.",
    d: "A relational or key-value store keeps the authoritative copy of everything the control plane manages, with replicas for read scaling and failover and backups for recovery. Nodes read from it directly or from caches fed by it. It is the system of record for credentials and plans. It is hard because data-plane reads must not depend on it synchronously, schema changes must work across versions of nodes, and its loss without backups is loss of the whole API estate.",
    k: ["Gateway nodes read the store directly versus through the control plane: direct reads are simple and let store load scale with node count, an intermediary shields the store and adds a component.", "Strongly consistent store versus eventually consistent: strong consistency makes credential changes exact and costs availability in partitions, eventual is available and delays revocations."],
    p: ["Every node queries the store per request and an outage or slow query takes down all traffic.", "Backups exist but a restore has never been tested and takes a day when needed."],
    v: "Restore the latest backup into a clean environment and confirm routes, consumers and credentials match production. Then fail over the primary and confirm the control plane resumes and nodes keep serving without errors.",
    dep: []
  },
  "fail-open-or-closed": {
    s: "The choice, made per dependency, between letting traffic through or blocking it when a policy check, limiter or lookup cannot be completed.",
    d: "Every check that depends on something external has a failure behavior: the rate-limit store, the token introspection endpoint, the policy engine, the external processor. Failing closed preserves the guarantee, such as authentication, and turns a dependency outage into an API outage. Failing open preserves availability and skips the guarantee. The right answer differs by control: authentication fails closed, limit counters often fail open, and the choice must be explicit, tested and visible on dashboards.",
    k: ["Closed for security controls versus open for protective ones: closed for authentication and authorization protects data, open for limits protects availability and exposes backends.", "One global default versus per-check setting: a global default is simple and wrong for some checks, per-check settings are accurate and need to be reviewed together."],
    p: ["A policy engine error evaluates to allow and nobody notices because no alert exists for the fallback.", "Everything fails closed and a counter store outage takes down all APIs."],
    v: "In staging, disable each dependency in turn and send traffic. Each check follows its documented failure mode, the fallback is logged and alerted, and the result matches the written decision table.",
    dep: ["counter-store", "policy-engine", "token-introspection", "external-processing"]
  },
  "latency-overhead": {
    s: "The time the gateway adds to every request, which sets how many checks, hops and transformations the design can afford.",
    d: "Every layer spends time: TLS handshake, parsing, authentication, policy, limiter lookups, transformation, upstream connection and response handling. A typical goal is a few milliseconds at the median and a controlled tail, which makes synchronous network calls on the hot path, such as introspection or external policy, costly choices. Budgets are set for the whole pipeline and measured as gateway time separate from upstream time, so that regressions from a new policy are visible at once.",
    k: ["Local checks with cached data versus live lookups: local is fast and stale, live is exact and puts a network round trip in every request.", "Many small policies versus one combined: small ones are reusable and add overhead per step, combined ones are faster and harder to maintain."],
    p: ["Each added policy adds a millisecond and nobody measures the total until it is twenty.", "Tail latency comes from garbage collection, lock contention or a cold cache and is invisible in averages."],
    v: "Measure gateway-added latency at median, 99th and 99.9th percentiles for a representative route with all policies on, against a direct call to the backend, and compare with the written budget on every release.",
    dep: ["filter-chain", "gateway-metrics", "worker-model"]
  },
  "state-consistency": {
    s: "How closely every node must agree about counters, cache contents, revoked credentials and configuration, and what is traded for that agreement.",
    d: "Gateway nodes hold copies of state that changes at the same time: configuration, credentials, plans, cache entries and limit counters. Perfect agreement needs coordination on the request path, which costs latency and availability. Most designs choose bounded staleness: configuration within seconds, revocation within a stated time, limits accurate to a margin. The important step is to write the bounds down per kind of state and design the product promises (quotas, revocation, purges) to fit them.",
    k: ["Strict coordination versus bounded staleness: coordination gives exact answers with latency and outage risk, bounded staleness is fast and allows brief overshoot or delayed revocation.", "One consistency level for all state versus per kind: one is easy to explain, per kind spends strictness where it matters, such as revocation, and relaxes it for metrics."],
    p: ["A revocation promise of immediate effect is made while nodes cache credentials for minutes.", "Rate limits advertised as exact are enforced per node and overshoot by the node count."],
    v: "For each state type, apply a change and measure time until every node reflects it, then compare with the documented bound. Violations show as a failing check, not a surprise in an incident.",
    dep: ["config-distribution", "counter-store", "cache-invalidation", "api-key-auth"]
  },
  "contract-stability": {
    s: "The promise that published routes, formats and behavior stay compatible, and the process for changing them, which constrains every routing and transformation choice.",
    d: "Clients outside the organization cannot be forced to upgrade, so the gateway is where the public contract is held steady while backends change. That drives versioning rules, deprecation periods, transformation layers, schema checks on both sides and usage tracking by version. Changes are classified as compatible or breaking, announced, measured and sunset on a published timetable. It touches the portal, the catalog, the transformation and routing layers and the analytics that show who is still on an old version.",
    k: ["Evolve one version compatibly versus cut new versions: compatible evolution keeps clients stable and limits what can change, new versions allow clean breaks and multiply what is maintained.", "Long deprecation windows versus short: long windows protect customers and keep old code alive, short ones free the team and break integrators."],
    p: ["A backend change alters an error code and a client that depended on it breaks with no version bump.", "A version is sunset on schedule and the biggest customer was still on it."],
    v: "Run recorded client contract tests against every supported version on each release and review traffic by version before a sunset. No supported version fails, and no active consumer remains on a retiring one.",
    dep: ["version-routing", "schema-validation", "api-catalog", "body-transformation"]
  },
  "trust-boundaries": {
    s: "Where the gateway stops trusting input and what it vouches for to the services behind it, which defines what backends may assume about each request.",
    d: "Outside the gateway, everything is untrusted, including headers that claim identity. Inside, backends accept identity the gateway asserts, so the gateway must strip incoming copies, authenticate the hop, and pass a minimal identity. Backends should still verify what they can, and network controls should ensure that only the gateway can reach them. If a service is reachable around the gateway, none of its policies apply. The decisions are which headers are trusted, how backends authenticate the gateway, and what is re-verified downstream.",
    k: ["Backends trust gateway-asserted identity versus re-verify: trust is simple and fast and a bypass of the gateway is total compromise, re-verification is robust and duplicates work.", "Network isolation only versus mutual authentication of the hop: isolation is easy to set up and fails silently with one misconfigured rule, mutual authentication makes bypass visible."],
    p: ["Backends are reachable directly from the internal network and attackers send the identity header themselves.", "Internal identity headers are not stripped from inbound requests."],
    v: "Attempt to call each backend directly, and through the gateway with forged identity headers. Direct calls are refused by network or authentication, and forged headers never reach the backend.",
    dep: ["header-manipulation", "mutual-tls", "credential-exchange", "upstream-pools"]
  },
  "blast-radius": {
    s: "How much of the API estate a single bad change, noisy tenant or failed dependency can break, and what contains it.",
    d: "The gateway is on the path of every API, so one misconfigured route, one expensive plugin or one saturated shared resource can reach all of them. Containment comes from several decisions: validating and staging configuration changes, per-tenant isolation of limits and connections, bulkheads in connection pools, separate fleets for critical APIs, canary rollout of gateway versions and fast rollback. The aim is that any one failure affects a known, small slice and that the slice is visible in the monitoring.",
    k: ["One shared fleet versus fleets split by criticality or tenant: shared is cheaper and has one big failure domain, splitting contains failures and multiplies operations.", "Fast global config rollout versus staged: global is simple and reaches everyone with the mistake, staged is slow and limits it to a few nodes first."],
    p: ["One tenant's configuration change takes down every tenant because configuration is global.", "A gateway version upgrade is rolled out to every node at once and a regression hits all traffic."],
    v: "Deploy a deliberately bad change to a canary slice and confirm it is detected and contained to that slice, other slices keep serving within targets, and rollback restores the slice within the documented time.",
    dep: ["multi-tenancy", "config-versioning", "canary-routing", "concurrency-limits"]
  },
});
