// Details for the cluster orchestrator plate, part 1: clients, extension, operations, cross-cutting concerns.
ATLAS.details("cluster-orchestrator", {
  "command-line-client": {
    s: "The tool operators use to create, inspect, change and debug resources, translating subcommands and manifest files into API requests and rendering the answers.",
    d: "It reads a connection file naming clusters, credentials and defaults, discovers which resource types the server offers, and maps friendly names to API paths. Commands apply manifests, list and describe objects, stream logs, open shells and port tunnels, and wait for conditions. Output formatting and server-side printing keep columns consistent across versions. The hard part is being a stable scripting surface: scripts parse its output for years, while the server's resource types and defaults keep changing under it.",
    k: ["Discovery at runtime versus compiled-in type knowledge: the client works with custom resources it has never seen, at the cost of extra round trips and a cache to invalidate.", "Human-oriented default output versus structured output: tables are readable, but scripts that parse them break when columns change."],
    p: ["A shared connection file with a production context selected by accident turns a test command into an outage.", "Scripts parsing table output silently break on upgrade because a column was added or reordered."],
    v: "Run a get on a custom resource type installed minutes ago and confirm the client resolves it without an update. Run a delete with the dry-run flag and confirm the server reports what would be removed while the object still exists.",
    dep: ["api-server", "authentication"]
  },
  "client-libraries": {
    s: "Language-specific packages that wrap the API with typed objects, authentication, retries, watches and caches, so programs can drive the cluster without hand-built HTTP calls.",
    d: "Libraries are generated from the API's schema and add the hand-written parts that matter: loading credentials from a file or from the in-cluster service account, backing off on throttling, resuming watches after a disconnect and sharing a local cache. Programs running inside the cluster use the same library as external tools. The hard part is version drift: generated types lag new fields, and an old client that reads and rewrites an object can drop fields it does not know about.",
    k: ["Generated typed clients versus dynamic untyped clients: types catch mistakes at build time, while dynamic clients handle any custom resource without regeneration.", "Library-managed retries versus caller-managed: defaults protect the server from retry storms, but hide throttling from callers who need to shed load."],
    p: ["An old client doing read-modify-write on a newer object type drops fields it does not understand.", "Unbounded retries from many clients after an outage amplify load on a recovering API server."],
    v: "Point a program at a watch and kill the connection mid-stream. Confirm it reconnects from its last version, delivers every change exactly once to the handler, and never relists the full collection.",
    dep: ["api-server", "watch-streams", "service-accounts"]
  },
  "manifest-templating": {
    s: "Tools that generate or customize resource definitions from parameters, overlays and shared packages, so one description yields many environments and versions.",
    d: "Two families exist. Template engines substitute values into text and package the result with a version and dependencies. Overlay tools patch a base set of manifests without templating, keeping each file valid on its own. Both output plain resource definitions for the client to apply. Packages add install, upgrade and rollback bookkeeping. The hard part is that the output is only checked when applied: a rendering that is syntactically fine can still be semantically wrong, and the generated result is rarely reviewed.",
    k: ["Text templates versus structured overlays: templates are flexible for anything, but invalid output appears only at render or apply time, and overlays stay valid at the cost of expressiveness.", "Client-side rendering versus in-cluster rendering: client-side keeps the cluster simple, while in-cluster tracking records release state but adds another controller to trust."],
    p: ["Values files drift between environments until nobody can say which settings production actually has.", "Rendered output is applied without review, so a template change silently alters unrelated resources."],
    v: "Render the same package for two environments and diff the output against what the server holds after apply. Confirm every difference traces to a declared parameter and nothing else changed.",
    dep: ["command-line-client", "server-side-apply"]
  },
  "gitops-reconciler": {
    s: "A controller that continuously compares cluster state to a source repository and applies or reports differences, making version control the record of intent.",
    d: "An in-cluster controller polls or is notified of new commits, renders manifests, computes a diff against live objects and applies changes, optionally pruning objects removed from the repository. It reports sync and health status per application. Credentials stay inside the cluster instead of in a build system. The hard part is ownership: other controllers, autoscalers and people also change objects, so the reconciler must distinguish intended drift from unwanted drift, and ordering dependencies between resources must be expressed.",
    k: ["Pull-based continuous reconciliation versus push-based pipeline apply: pull self-heals manual changes and needs no external credentials, but a bad commit propagates everywhere it targets.", "Automatic pruning versus manual deletion: pruning keeps the cluster exactly matching the repository, but a bad path change can delete live data volumes."],
    p: ["Fighting an autoscaler that owns the replica count makes the reconciler and autoscaler flip the value back and forth.", "Pruning removes a resource that was only moved to another path in the repository."],
    v: "Manually scale a managed workload by hand and confirm the reconciler reports drift and restores the declared value within its interval. Remove a resource from the repository and confirm it is pruned only when pruning is enabled.",
    dep: ["manifest-templating", "server-side-apply", "api-server"]
  },
  "custom-resource-definitions": {
    s: "A mechanism for registering a new resource type with the API server at runtime, with its schema, versions and subresources, without changing or restarting the server.",
    d: "A definition object names the group, kind, scope and versions, and carries a structural schema. Once accepted, the API server serves list, get, watch, create, update and delete for the new type, validates it, stores it and enforces access control exactly as for built-in types. Status and scale can be separate subresources. Nothing acts on the objects until a controller does. The hard part is that custom types share the server's capacity and storage, and removing the definition deletes every object of that type.",
    k: ["Generic in-server handling versus a dedicated API server: definitions are cheap to add and inherit all machinery, but cannot implement custom storage or non-standard request handling.", "Structural schema required versus free-form: a required schema enables validation, pruning and defaulting, at the cost of forcing authors to model their data carefully."],
    p: ["Deleting a definition cascades to every stored object of that type, often without a prompt.", "Schemas that evolve incompatibly leave stored objects that fail validation on the next update."],
    v: "Install a new definition, create an object, and confirm it appears in discovery, accepts watch streams and is rejected on a schema violation. Remove the definition in a test cluster and confirm its objects disappear.",
    dep: ["schema-validation", "api-versioning", "api-server", "resource-model"]
  },
  "operators": {
    s: "Controllers that encode a human operator's knowledge of running one application, using custom resources as the interface for install, backup, scaling and upgrade.",
    d: "An operator defines a custom resource describing the application as a user thinks of it, such as a database cluster with a size and version, and runs a controller that creates and maintains the underlying workloads, volumes, services and secrets. It handles day-two tasks: failover, backup, resharding, version upgrades. It reports state in the resource's status. The hard part is that operations knowledge is encoded as code that must tolerate being killed at any step, resumed, and run twice, and that its mistakes can destroy data at scale.",
    k: ["Custom-resource-driven operator versus a runbook plus a package: the operator automates continuously, but its bugs become outages across every instance it manages.", "Operator owns children exclusively versus tolerating manual edits: ownership gives predictable convergence, while tolerance leaves operators room to hotfix during incidents."],
    p: ["An upgrade step interrupted halfway leaves the application in a state the controller never planned for.", "Operators with cluster-wide permissions become high-value targets for privilege escalation."],
    v: "Kill the operator in the middle of a version upgrade of a managed application. Restart it and confirm the upgrade resumes from observed state and completes with no data loss and no duplicate resources.",
    dep: ["custom-resource-definitions", "reconciliation-loops", "informers-and-caches", "owner-references", "finalizers"]
  },
  "conversion-webhooks": {
    s: "A service the API server calls to translate a custom resource between its versions, so clients can use any served version while one is stored.",
    d: "When a request or a stored object uses a different version than the one being asked for, the API server sends the object to a registered service that returns the converted form. Conversions must round-trip without losing fields and must be consistent in both directions. The server calls it for reads, writes and every watch event, so latency and availability matter. The hard part is that the service is a hard dependency of the resource type: if it is down, the type becomes unreadable.",
    k: ["Webhook conversion versus none with identical schemas: webhooks allow real schema changes across versions, but add a network dependency to every read.", "Storing the newest version versus the oldest: the newest avoids repeated conversion, but migrating stored data requires rewriting every object."],
    p: ["A conversion service outage makes list and watch of the resource fail for every client and controller.", "A lossy conversion silently drops a field when a client updates through an older version."],
    v: "Create an object at the oldest version, read it at the newest and back, and confirm the result is byte-identical in the shared fields. Stop the service and confirm reads fail clearly rather than returning partial data.",
    dep: ["custom-resource-definitions", "api-versioning"]
  },
  "aggregated-api-servers": {
    s: "Additional API servers registered behind the main one, which proxies their paths so they appear as part of one API with shared authentication and discovery.",
    d: "The main server forwards requests for a registered group and version to a separate service, passing the authenticated identity. The extension serves its own types with its own storage, validation and semantics, such as metrics that are computed rather than stored. Discovery merges both. The hard part is operating a second server: it needs its own availability, certificates and storage, and the main server's availability checks and request limits do not protect it.",
    k: ["Aggregated server versus custom resources: aggregation allows custom storage, subresources and non-standard verbs, but costs a separately operated service with its own failure modes.", "Delegated authorization versus own checks: delegating keeps one policy language, at the price of an extra call to the main server for every request."],
    p: ["An unhealthy aggregated service makes discovery slow or fail for the whole API when clients refresh their type lists.", "The extension trusts forwarded identity headers without verifying the proxy's certificate."],
    v: "Register an extension, list its resources through the main API endpoint with an ordinary client, then stop the extension and confirm only its types return an unavailable error while all others still work.",
    dep: ["api-server", "authentication", "control-plane-pki"]
  },
  "cluster-upgrades": {
    s: "The ordered procedure for moving control-plane components and node agents to a new version while keeping workloads running and the API available.",
    d: "Control-plane instances are upgraded first, one at a time behind a load balancer, then nodes are cordoned, drained, upgraded and returned. Storage schema migrations and API deprecations are applied in between. Managed environments automate the sequence and offer surge nodes to preserve capacity. The hard part is the unrecoverable steps: a stored-data migration or a removed API version cannot be undone by rolling the binary back, so a verified backup and a deprecation scan are prerequisites.",
    k: ["In-place upgrade versus building a new cluster and moving workloads: in-place is cheaper and keeps identity, while replacement gives easy rollback at the cost of migrating state and traffic.", "One minor version at a time versus skipping: skipping saves effort, but the skew policy only guarantees tested paths for adjacent versions."],
    p: ["A manifest using a removed API version stops applying after the upgrade and breaks deployment pipelines.", "Draining all nodes of one pool at once exceeds disruption budgets and takes down a replicated service."],
    v: "Upgrade a staging cluster that runs a replicated service under continuous load. Confirm request success stays above target throughout, every node reports the new version, and no object in the store uses a removed API version.",
    dep: ["version-skew-policy", "node-drain-and-maintenance", "store-snapshots", "api-versioning"]
  },
  "version-skew-policy": {
    s: "The published rules for how far apart in version the cluster's components, clients and nodes may be, which every upgrade order must respect.",
    d: "The API server is the reference. Node agents may lag it by a few minor versions but never lead it, controllers and the scheduler may lag by one, and clients may differ by one in either direction. In a multi-instance control plane, the oldest and newest API servers must be within one version during a rolling upgrade. The rules exist because components share only the wire API, not code, so compatibility is a tested range. The hard part is enforcing it: nothing stops an operator from exceeding it until something breaks.",
    k: ["Strict skew limits versus unrestricted compatibility: limits keep the test matrix small and behavior defined, but force steady upgrade work on every cluster.", "Newer-control-plane-first ordering versus lockstep: ordering lets nodes lag during a long rollout, at the cost of the control plane carrying compatibility paths for old agents."],
    p: ["A node agent left several versions behind starts failing on new API fields long after the control plane upgrade.", "A client tool two versions ahead sends fields an older server rejects or silently drops."],
    v: "Inventory the versions of every API server instance, node agent, controller and client in use. Confirm each pair falls inside the published range, and that no node reports a version newer than the API server.",
    dep: ["api-compatibility", "api-versioning"]
  },
  "node-drain-and-maintenance": {
    s: "The workflow that marks a machine unschedulable and gracefully evicts its workloads so it can be patched, replaced or removed with minimal disruption.",
    d: "Cordoning sets the node unschedulable so no new work arrives. Draining then requests eviction for each workload through the eviction API, which checks disruption budgets and refuses if the budget would be violated. Per-node daemons and static workloads are skipped. Workloads with local storage or no controller need explicit handling. Once empty, the node can be upgraded or deleted. The hard part is stuck drains: a budget that allows zero disruptions, or a workload that will not terminate, blocks maintenance indefinitely.",
    k: ["Eviction API with budget checks versus direct deletion: evictions respect availability promises, but a strict budget can stall a drain forever.", "Cordon then drain versus drain alone: cordoning first stops the scheduler from putting new work back, while skipping it leaves a race with freshly scheduled workloads."],
    p: ["A single-replica workload with a zero-disruption budget blocks every drain of its node.", "Draining without a replacement node leaves evicted workloads pending with nowhere to go."],
    v: "Drain a node hosting one replica of a three-replica service with a budget of one. Confirm the replica reschedules elsewhere before the next eviction is allowed and the service never drops below two ready replicas.",
    dep: ["disruption-budgets", "workload-lifecycle", "api-server"]
  },
  "audit-logging": {
    s: "A record of every request to the API server: who made it, what they asked, which stage it reached and what the response was, for security review and forensics.",
    d: "The API server emits events at stages: request received, response started, response complete and panic. A policy chooses, per resource, user and verb, whether to log nothing, metadata, the request body or request and response bodies. Backends write to a file or send batches to a webhook. The hard part is volume and sensitivity: logging bodies of secrets stores the secret in the log, while omitting detail makes incidents unexplainable, and an overwhelmed webhook backend can slow or block the API server.",
    k: ["Metadata-only for sensitive resources versus full bodies: metadata avoids leaking secrets into logs, but cannot show what exactly changed.", "Blocking versus best-effort backend: blocking guarantees no unlogged request, while best-effort protects availability but can drop evidence."],
    p: ["Request-body logging on secrets copies every credential into a log system with weaker access control.", "A slow or unreachable webhook backend backs up and increases API request latency."],
    v: "Create, read and delete a test secret as a known user. Confirm the log shows three events with that user, verb and resource name, and that no secret value appears in any logged body.",
    dep: ["api-server", "authentication", "rbac"]
  },
  "control-plane-observability": {
    s: "Metrics, logs, traces and events that expose the health and performance of the API server, store, scheduler and controllers, rather than of the workloads they run.",
    d: "Each component exports counters and histograms on an endpoint: request rate and latency per resource and verb, watch counts, queue depth and processing time per controller, scheduling attempts and latency, and store commit and fsync latency. Events record state changes for humans. Optional tracing follows a request across components. The hard part is knowing which signals matter: queue depth growing in a controller, or store fsync latency rising, precedes outages that request error rates only show late.",
    k: ["Pull-based metric endpoints versus push: pull makes each component simple and observable by anything, at the cost of needing network access to every component.", "High-cardinality labels per resource versus aggregate-only: per-resource detail finds the one abusive client, but can multiply series and overload the metrics system."],
    p: ["Alerting only on API errors misses a stuck controller whose queue has been growing for an hour.", "Events are rate-limited, expire quickly and are dropped under load, so they vanish when needed most."],
    v: "Inject a one-second delay into store writes and confirm the commit latency metric, API request latency and controller queue depth each show it within a scrape interval, and that an alert fires.",
    dep: ["api-server", "work-queues", "scheduling-cycle", "consensus-backed-store"]
  },
  "multi-cluster-federation": {
    s: "Tooling that treats several clusters as one fleet: propagating resources to many clusters, routing traffic between them and keeping identity and policy consistent.",
    d: "A management layer holds templates plus placement rules and creates matching objects in member clusters through their APIs, then collects status back. Service discovery can be exported across clusters, and a global load balancer or shared network routes users to a healthy region. Each member remains independently operable. The hard part is that clusters are separate failure domains by design: federation must not recreate a global single point of failure, and partial failure leaves clusters inconsistent.",
    k: ["Push from a central manager versus pull by agents in each member: push is simple to start, while pull works across firewalls and lets members keep running during a manager outage.", "Many small clusters versus few large: small clusters limit blast radius and upgrade risk, but multiply fleet management and underuse capacity."],
    p: ["A bad change propagated to every cluster at once removes the isolation that separate clusters were meant to provide.", "Clusters diverge after a partial rollout, and the manager's view of them is stale."],
    v: "Propagate a workload to three clusters, disconnect one from the manager, and confirm the other two update while the disconnected cluster keeps serving its current version and is reported as unreachable.",
    dep: ["api-server", "failure-domains", "services"]
  },
  "eventual-consistency": {
    s: "Components read from caches and watch streams that trail the store, so every control loop must tolerate acting on slightly stale views of the world.",
    d: "Writes are linearizable in the store, but nearly every reader works from a local copy fed by watch events. The scheduler may place onto a node that has already filled up, a controller may create a duplicate before it sees the first, and a node agent may act on a spec that was just changed. The system stays correct by using optimistic concurrency on writes, idempotent actions and expectations of pending creates. The hard part is that staleness is invisible in normal operation and only appears under load or partition.",
    k: ["Cached reads with conflict detection on write versus quorum reads everywhere: caching scales to thousands of readers, but each actor must handle rejected stale writes.", "Expectation tracking versus re-reading before acting: tracking avoids duplicate creates cheaply, but a lost event can leave a controller waiting until timeout."],
    p: ["A controller creating objects on a stale view makes duplicates, and the surplus stays until the next sync notices.", "Tests on a quiet single-node cluster never exercise stale reads, so races ship unnoticed."],
    v: "Delay the watch stream to one controller by several seconds during a scale-up. Confirm it creates no more than the desired count and that the cluster converges to exactly the right number afterward.",
    dep: ["informers-and-caches", "resource-versions", "watch-cache"]
  },
  "extensibility-model": {
    s: "The decision that platform features are added as new resource types plus controllers and webhooks, not as changes to the core, and what that implies for every layer.",
    d: "Because every feature is an API resource watched by a loop, extensions use the same mechanisms as built-ins: definitions, controllers, admission hooks, plugin interfaces for networks, storage, devices and runtimes, and scheduler plugins. The core stays small and neutral, and alternatives compete behind stable interfaces. The cost appears in operations: a cluster is an assembly of independently versioned parts, and each extension adds a failure mode, an upgrade dependency and a permission set that someone must own.",
    k: ["Open extension points versus a closed, integrated feature set: openness allows ecosystem growth and fit, but pushes integration testing and failure ownership onto the cluster operator.", "Out-of-process plugins versus in-tree code: out-of-process isolates faults and permits independent release, at the cost of network hops and version coordination."],
    p: ["Too many webhooks and controllers make every request and rollout depend on a dozen separate services being healthy.", "Extensions grant themselves broad permissions because narrowing them was never anyone's job."],
    v: "List every webhook, definition, plugin and cluster-wide controller installed. Confirm each has a named owner, a documented failure behavior and a tested upgrade path, and that the cluster survives removing any one.",
    dep: ["custom-resource-definitions", "admission-webhooks", "network-plugin-interface", "storage-plugin-interface", "scheduler-framework"]
  },
  "scale-limits": {
    s: "The measured ceilings on objects, watches, nodes and request rates that the store and API server can sustain, and the designs chosen to stay beneath them.",
    d: "Limits come from the store's size and latency, per-object size, the number of watchers and the cost of listing large collections, plus the scheduler's per-workload work across all nodes. Designs that respect them use chunked lists, watch caches, endpoint slicing, sharded controllers, rate limits and per-namespace quotas. Published thresholds are guidance, not guarantees; they depend on object churn and size. The hard part is that overload is non-linear: a restart storm of many clients listing everything at once can topple a cluster that is healthy at steady state.",
    k: ["Few large clusters versus many small ones: large clusters pool capacity and simplify placement, but push against shared store and API limits and enlarge outage impact.", "Scaling controllers by sharding versus bigger machines: sharding scales further but needs partition ownership logic, while bigger machines are simple until they are not enough."],
    p: ["Millions of short-lived objects such as completed jobs bloat the store long before node counts matter.", "A full relist by thousands of agents after an API restart overloads the server that just came back."],
    v: "Load a test cluster to target object counts, then restart the API servers while all agents reconnect. Confirm request latency recovers within target and the store's size and commit latency stay inside documented bounds.",
    dep: ["priority-and-fairness", "watch-cache", "consensus-backed-store", "endpoint-slices"]
  },
  "trust-boundaries": {
    s: "The decision about who and what is trusted at each interface: users, workloads, node agents, controllers and the store, and how each is authenticated and limited.",
    d: "Only the API server talks to the store, and every other component is an authenticated client with narrow permissions. Node agents may read only what their node needs and write only its own objects. Workloads run as untrusted by default, isolated by the runtime, namespaces, network policy and per-workload identities. Control-plane certificates secure every hop. The hard part is that a few components are near-omnipotent, such as the store and controllers that can create any workload, and compromise of a single node must not become compromise of the cluster.",
    k: ["Node-scoped credentials and authorization versus one shared agent identity: scoping limits a stolen node to its own workloads, but needs per-node identities issued and rotated.", "Default-deny with explicit grants versus convenience defaults: default-deny contains breaches, while open defaults make first use easy and every cluster weaker."],
    p: ["A workload with access to the node's agent credentials or runtime socket can read every secret on that node.", "Cluster-wide roles bound to broad groups give far more access than anyone intended."],
    v: "From a workload on one node, attempt to read another node's workload secrets and to create privileged workloads. Confirm both are denied by authorization or admission and each attempt appears in the audit log.",
    dep: ["authentication", "rbac", "control-plane-pki", "workload-security-standards", "network-policy"]
  },
  "failure-domains": {
    s: "The decision about which failures the cluster is built to survive: a process, a machine, a rack, a zone or a whole cluster, and what is replicated across each.",
    d: "Control-plane instances and store members spread across zones; nodes carry zone labels the scheduler uses to spread replicas; volumes are tied to zones; load balancers span zones. Node-agent autonomy means a lost control plane does not stop running workloads, only changes to them. Beyond a zone, separate clusters are the isolation unit. The hard part is the hidden coupling: a zonal volume pins a workload to its zone, and a store spread across distant zones pays latency on every write.",
    k: ["Store spread across zones versus within one: spreading survives a zone loss, but each write waits for a cross-zone round trip.", "Replicas spread across zones versus packed for efficiency: spreading survives zone loss and costs cross-zone traffic and some idle capacity."],
    p: ["All replicas land in the zone that has the only available capacity, so a zone failure takes the whole service.", "A zonal volume prevents rescheduling into a surviving zone, leaving the workload pending."],
    v: "Block all traffic to one zone in a staging cluster. Confirm the API stays writable, running workloads elsewhere stay healthy, and replicas of spread workloads recover to the desired count in the remaining zones.",
    dep: ["topology-spread", "quorum-and-members", "node-lifecycle-controller", "persistent-volumes"]
  },
  "api-compatibility": {
    s: "The commitment that clients, controllers and stored objects keep working across releases, through versioned resources, deprecation windows and round-trippable conversions.",
    d: "Resource versions mature from experimental to stable, with stated lifetimes for each. Fields are only added, never repurposed, and defaults are fixed per version. Objects are stored in one version and converted on demand. Deprecated versions keep being served for a published window and then are removed. Since components, extensions and manifests are written by different parties on different schedules, the API is the contract holding them together. The hard part is old stored data and old manifests, which outlive the release that created them.",
    k: ["Long deprecation windows versus fast removal: long windows spare users forced migrations, but keep dead code and tests alive in the server for years.", "Additive-only evolution versus breaking changes at major versions: additive keeps all clients working, at the cost of accumulating fields that are hard to remove."],
    p: ["A beta API removed on schedule breaks pipelines that nobody had touched since they were written.", "A new default applied to old objects changes the behavior of workloads that did not change."],
    v: "Take a manifest set recorded two releases ago and apply it to the current version. Confirm it is accepted or rejected with a clear deprecation message, and that stored objects round-trip through conversion unchanged.",
    dep: ["api-versioning", "conversion-webhooks", "version-skew-policy"]
  },
});
