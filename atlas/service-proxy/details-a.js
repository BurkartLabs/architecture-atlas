// Details for the service proxy plate, part 1: control plane, dynamic configuration, operations, topologies.
ATLAS.details("service-proxy", {
  "mesh-config-model": {
    s: "The high-level, declarative description of services, traffic rules, security policy and proxy defaults that operators write, kept separate from the low-level configuration each proxy runs.",
    d: "Operators describe intent: which services exist, how traffic is split, which callers may reach which service, what timeouts apply. The control plane stores these objects, validates them and watches them for change. The model is intentionally smaller and more stable than the proxy's own configuration, which is large and changes with the proxy version. What makes it hard is scope: a rule written once may apply to thousands of proxies, and two rules can overlap, so the control plane needs deterministic precedence and good validation before anything is pushed.",
    k: ["Declarative intent versus raw proxy configuration: operators get a stable, small surface and version independence, but cannot reach proxy features the model has not yet exposed.", "Namespaced, scoped objects versus one global document: teams can own their own rules, at the cost of precedence rules and conflicts between owners."],
    p: ["Two overlapping rules from different owners resolve silently by precedence, and the winner is not the one the author expected.", "A model change accepted by validation but untranslatable for some proxy versions is dropped without any visible error."],
    v: "Apply a rule shifting ten percent of traffic to a new version, then query a proxy's effective routes and confirm the split appears. Apply an invalid rule and confirm it is rejected before any proxy receives it.",
    dep: []
  },
  "service-registry-sync": {
    s: "Keeps the control plane's picture of services and their endpoints current by watching the platform's registry and converting changes into cluster and endpoint updates.",
    d: "The control plane subscribes to an orchestrator's or registry's change stream: services, endpoint addresses, readiness, labels, locality. Each change updates an internal model that is then translated into per-proxy cluster and endpoint resources. Events arrive in bursts during rollouts, so changes are coalesced by a debounce interval before pushing. The difficulty is correctness under churn: a stale or missing endpoint sends traffic to a host that is gone, and an over-eager push storm can overload both the control plane and every proxy.",
    k: ["Watching the registry versus polling it: watches deliver changes quickly and cheaply, but a missed event leaves permanent drift unless a periodic full resync repairs it.", "Debouncing pushes versus pushing every event: debouncing cuts load during rollouts, but adds seconds before a new endpoint becomes reachable."],
    p: ["A registry outage is read as an empty service list, and the control plane pushes empty clusters to the whole fleet.", "Rolling updates produce thousands of endpoint events per minute, and without coalescing the push queue grows faster than proxies can apply it."],
    v: "Scale a service from three to six instances and time the interval until a proxy's endpoint list shows all six. Then kill the registry connection and confirm proxies keep the last known endpoints.",
    dep: ["mesh-config-model"]
  },
  "identity-issuance": {
    s: "A certificate authority inside the control plane that gives every workload a short-lived, verifiable identity and signs the certificates its proxy presents.",
    d: "A proxy proves its workload's identity to the control plane using something the platform vouches for, such as a signed token bound to the workload. The control plane maps that to a stable identity name, then signs a short-lived certificate carrying it. The proxy requests renewal well before expiry. The signing key is the root of trust for the whole mesh, so it is usually held by an intermediate authority with a longer-lived root kept offline. The difficult parts are authenticating the first request, scaling signing to thousands of renewals, and rotating the authority itself.",
    k: ["Short-lived certificates versus long-lived with revocation: short lifetimes make revocation unnecessary, but make the issuer a hard availability dependency for renewals.", "An in-mesh authority versus an external one: in-mesh is simple to run, while an external one fits organizational key custody but adds a slower dependency."],
    p: ["Renewal happens at expiry rather than well before it, so a control plane outage of minutes causes mesh-wide handshake failures.", "A workload that can obtain another workload's token can obtain its identity, so bootstrap credentials are the real security boundary."],
    v: "Inspect the certificate a proxy presents, confirm its identity name and a lifetime of hours, and watch a renewal occur partway through that lifetime with no dropped connections.",
    dep: ["mesh-config-model"]
  },
  "policy-distribution": {
    s: "Packages authorization, authentication and traffic policy into configuration for the right proxies and pushes it, so enforcement happens at each hop rather than centrally.",
    d: "Policy objects name targets by workload label, namespace or service. The control plane resolves which proxies each applies to, translates it into filter configuration such as allow and deny rules keyed on identity, path and method, and pushes it through the dynamic configuration API. Enforcement is local and fast, but the policy is only as current as the last push. It is hard because the same rule must compile identically for many proxy versions, and a mistake can lock out every caller at once.",
    k: ["Distributed enforcement versus a central decision service: local checks add microseconds and survive control plane outages, but policy changes propagate with delay.", "Default-allow versus default-deny: default-deny is safer, but a missing or late policy push causes outages instead of silent exposure."],
    p: ["A broad deny rule is pushed before the matching allow rules reach the callers' destinations, and traffic stops mesh-wide.", "Policy targeted by label silently stops applying after a workload is relabeled, leaving it unprotected."],
    v: "Apply a rule allowing only one caller identity, send requests from two identities and confirm one is accepted and one is rejected. Remove the rule and confirm both succeed within the expected propagation time.",
    dep: ["mesh-config-model", "authz-filters", "dynamic-config-api"]
  },
  "sidecar-injection": {
    s: "Automatically adds a proxy container, its bootstrap configuration and traffic redirection rules to each workload at creation time, so applications need no changes.",
    d: "A mutating admission hook intercepts workload creation, adds the proxy container and an init step that installs redirection rules, and mounts the identity and bootstrap configuration. Injection is controlled by namespace or workload labels. The proxy starts alongside the application, so start order matters: if the application makes calls before the proxy is ready, they fail. Shutdown order matters equally, since the proxy must outlive the application's last outbound call. It is hard because every workload creation depends on the hook being available, and upgrades require recreating workloads.",
    k: ["Automatic injection versus manual: automatic gives uniform coverage, but makes workload creation depend on the hook, which can block every deployment if it is down.", "A privileged init step versus a node-level redirect: init steps are self-contained but need elevated permissions in every workload."],
    p: ["The application starts and calls out before the proxy accepts traffic, causing a burst of startup failures that look like application bugs.", "A hook failure policy of 'fail' blocks all workload creation cluster-wide during a control plane outage."],
    v: "Create a workload in an injected namespace and confirm it contains a proxy container, that its outbound call appears in proxy access logs, and that deleting it lets in-flight requests finish.",
    dep: ["mesh-config-model", "traffic-interception", "bootstrap-config"]
  },
  "trust-federation": {
    s: "Lets proxies in separate meshes or trust domains validate each other's certificates by exchanging trust anchors and mapping identities across the boundary.",
    d: "Each mesh has its own root of trust. To allow calls across meshes, the control planes exchange trust bundles, the sets of root certificates each side will accept, and distribute them to proxies as validation contexts. Identities carry a domain component so policy can distinguish local callers from remote ones. Gateways typically sit at the boundary to avoid every proxy needing a route to every remote workload. It is hard because bundle rotation must reach all proxies in both meshes before the old root is retired.",
    k: ["Federated trust bundles versus a shared root: federation keeps each mesh's key independent, but needs a bundle exchange and rotation process between operators.", "Per-pair gateways versus direct proxy-to-proxy paths: gateways narrow the network surface, at the cost of an extra hop and a shared failure point."],
    p: ["A remote mesh rotates its root and the new bundle is not fetched in time, so every cross-mesh handshake fails.", "Identity names from two domains collide in policy because rules match only the local part."],
    v: "Call a service in a second mesh and confirm the handshake succeeds, then remove its trust bundle from a proxy and confirm the same call fails with a certificate validation error.",
    dep: ["identity-issuance", "peer-validation"]
  },
  "dynamic-config-api": {
    s: "The streaming interface through which a management server pushes configuration resources to each proxy, replacing restarts and static files as the way to change behavior.",
    d: "A proxy opens a long-lived stream to a management server and subscribes to resource types: listeners, routes, clusters, endpoints, secrets. The server responds with versioned resource sets whenever they change, and the proxy applies them and acknowledges. Because it is one protocol for every resource type, a single stream can carry all of them in a defined order. It is hard because the proxy keeps carrying traffic while configuration changes under it, so every update must be validated and applied without disturbing existing connections.",
    k: ["A streaming push versus periodic polling of files: streams give seconds of latency and carry rejection feedback, but require a long-lived connection and server capacity per proxy.", "One aggregated stream versus a stream per resource type: aggregation preserves update ordering, at the cost of a single stream becoming a bottleneck."],
    p: ["The stream drops and reconnects with no backoff, and thousands of proxies hammer the management server at once.", "A proxy keeps running on stale configuration after losing the server, and nobody notices because traffic still flows."],
    v: "Change a route on the management server and measure the time until a proxy's configuration dump shows it. Stop the server and confirm the proxy keeps serving with its last configuration.",
    dep: ["resource-subscriptions", "config-ack-nack", "bootstrap-config"]
  },
  "resource-subscriptions": {
    s: "The mechanism by which a proxy declares which named resources it wants, so the server sends only what that proxy needs rather than the entire mesh.",
    d: "Resources are identified by type and name. A proxy subscribes to named listeners or routes, and to clusters and endpoints for the services it can actually call. In a large mesh, sending every service to every proxy wastes memory and push bandwidth, so subscriptions are scoped by dependency declarations or learned lazily when traffic first appears. The server tracks each proxy's subscription set and version per type. It is hard because scoping too tightly makes valid calls fail with no route, and scoping loosely makes updates expensive.",
    k: ["Subscribing to everything versus scoped subscriptions: everything is simple and always correct, but memory and push costs grow with mesh size.", "Declared dependencies versus on-demand discovery: declared lists are predictable, while on-demand loading serves the first request slowly or fails it."],
    p: ["A new dependency is called before its subscription is added, and requests fail with no-route errors until configuration catches up.", "Wildcard subscriptions on a large mesh push hundreds of megabytes per proxy and cause memory exhaustion."],
    v: "Start a proxy scoped to one service and confirm its configuration dump holds only that service's cluster and endpoints. Add a dependency and confirm the new cluster appears without restart.",
    dep: ["dynamic-config-api"]
  },
  "incremental-updates": {
    s: "Sends only the resources that were added, changed or removed since the last version, so a small change does not retransmit the entire configuration.",
    d: "In the state-of-the-world form, every response carries the full resource set for a type and the proxy diffs it against what it has. In the incremental form, the server sends deltas, added or updated resources and a list of removed names, and the proxy keeps a version per resource. Endpoint churn is the main motivation, since one instance change would otherwise resend thousands of endpoints. It is hard because deltas need exact bookkeeping on both sides, and a lost or reordered delta leaves the proxy silently inconsistent until a full resync.",
    k: ["Deltas versus full snapshots: deltas cut bandwidth and apply cost for large sets, but require per-resource version tracking and resync logic after errors.", "Server-driven versus proxy-driven pull: server push minimizes latency, while proxy-driven requests let each proxy control its own load."],
    p: ["A removed-resource notice is lost on reconnect and the proxy routes to an endpoint that was deleted hours ago.", "The server resends full snapshots to every proxy after each small change, negating the benefit and saturating the network."],
    v: "Change one endpoint in a cluster of five thousand and compare bytes received by a proxy against the full cluster size. Reconnect the stream and confirm the proxy resyncs to an identical resource set.",
    dep: ["dynamic-config-api", "resource-subscriptions"]
  },
  "config-ack-nack": {
    s: "The acknowledgment protocol by which a proxy tells the server which configuration version it applied, or rejects an update with a reason.",
    d: "Every response carries a version and a nonce. The proxy applies the update and replies with that version to accept it, or replies with its previous version plus an error detail to reject it. This gives the server a record of what each proxy actually runs and stops a bad update from silently spreading. Rejection leaves the old configuration in force. It is hard because rejection is per proxy: a configuration valid for one version can fail on another, and the server must notice that a subset of the fleet is stuck on old versions.",
    k: ["Explicit rejection versus silent drop: rejection exposes the error to operators and keeps the proxy safe, but only works if someone monitors it.", "A per-resource-type version versus one global version: per-type versions localize failures, but make cross-type consistency harder to reason about."],
    p: ["A rejected update is logged only on the proxy, and the server keeps believing the fleet is current for days.", "Retrying the same rejected configuration in a tight loop floods the stream and hides real updates."],
    v: "Push a deliberately invalid route and confirm the proxy keeps serving the previous routes, reports a rejection with a reason, and the server's per-proxy view shows the older version.",
    dep: ["dynamic-config-api"]
  },
  "warming-and-ordering": {
    s: "Applies updates in a safe sequence and prepares new resources, such as clusters, before routes can send traffic to them, so no request is routed to something not ready.",
    d: "Resources reference each other: routes name clusters, clusters need endpoints, listeners need secrets. A new cluster is warmed, meaning it fetches endpoints and performs initial health checks, before it becomes visible. The safe order for additions is clusters and endpoints first, then routes, then listeners, and the reverse for removals. Within the proxy, old versions stay live until the new one is ready, then are swapped atomically. It is hard because eventual consistency means the server may deliver resources in any order, so the proxy must hold back a resource until its dependencies exist.",
    k: ["Make-before-break ordering versus applying in arrival order: ordering prevents blackholed requests, but delays visibility and needs dependency tracking.", "Waiting for initial health checks versus going live immediately: waiting avoids sending to unready hosts, but slows rollout of new clusters."],
    p: ["A route is applied before its cluster, and requests return no-cluster errors until the cluster arrives seconds later.", "A cluster whose initial discovery never completes stays warming forever and holds up listener updates behind it."],
    v: "Push a route to a cluster that does not yet exist and confirm the update is held. Then push the cluster and confirm the route takes effect only after the cluster reports ready.",
    dep: ["dynamic-config-api", "upstream-clusters", "route-table", "cluster-manager"]
  },
  "bootstrap-config": {
    s: "The small static configuration a proxy reads at startup: its identity, where the management server is, admin address, and defaults needed before any dynamic configuration arrives.",
    d: "At startup the proxy has no listeners or clusters. Bootstrap tells it who it is, which node and locality it reports as, how to reach and authenticate to the management server, where to bind the admin interface and how to configure logging and statistics. It can also contain static listeners and clusters, which is the entire configuration for simple edge deployments. It is hard because bootstrap is the one configuration that cannot be changed through the control plane, so mistakes require a restart and a bad value can leave the proxy unable to receive anything.",
    k: ["Static configuration versus fully dynamic: static is simple and independent of the control plane, but changes need a restart or a redeploy.", "Fetching listeners at startup versus holding traffic until ready: waiting avoids serving with partial configuration, but extends startup and can fail readiness."],
    p: ["The management server address is wrong in one environment, and the proxy starts healthy but never receives any configuration.", "Bootstrap and dynamic definitions of the same listener conflict, and the proxy fails to bind at startup."],
    v: "Start the proxy with only a bootstrap file pointing at a management server, and confirm it reports not-ready until the first listeners and clusters arrive, then reports ready and accepts connections.",
    dep: []
  },
  "admin-interface": {
    s: "A local management endpoint that exposes configuration dumps, statistics, cluster health and runtime controls for one proxy, for operators and automation.",
    d: "The admin server listens on a separate address, normally loopback, and serves the effective configuration, cluster and endpoint state, counters, listener lists and logging controls. It can also change state: set log levels, drain listeners, reset counters, force a health check failure. Dumping configuration shows what the proxy is actually running, which can differ from what the control plane intended. It is hard because it is an unauthenticated write interface on a process that carries production traffic, and dumps can reveal secrets and topology.",
    k: ["Rich read and write endpoints versus a read-only surface: write access allows live debugging and draining, but turns anything that can reach the port into an operator.", "A separate admin listener versus exposing it on the data port: a separate address keeps it off the network path, but needs deliberate access for tooling."],
    p: ["The admin port is bound to all interfaces and reachable from the workload network, allowing anyone to drain or reconfigure the proxy.", "A configuration dump is attached to a ticket and includes private key references and internal addresses."],
    v: "Request the configuration dump and confirm it matches the version the control plane last sent. From a non-local address, confirm the admin port refuses the connection.",
    dep: ["stats-counters", "bootstrap-config"]
  },
  "hot-restart": {
    s: "Replaces a running proxy binary without refusing connections, by starting a new process that takes over listening sockets while the old one finishes its work.",
    d: "The new process asks the old one over a local channel for its listening sockets, or shares them through socket inheritance or port reuse, then begins accepting. The old process stops accepting, drains its connections and exits after a deadline. Statistics are carried across, so counters do not reset to zero, usually through shared memory. It is hard because both processes run together briefly, so they must not both own mutable state such as rate limit buckets, and any change to the shared layout between versions breaks the handoff.",
    k: ["Socket handoff to a new process versus restart in place: handoff keeps accepting without a gap, but requires a stable inter-process protocol across versions.", "Shared-memory statistics versus fresh counters: sharing keeps continuity for dashboards, but ties both versions to one memory layout."],
    p: ["Old and new processes both run for hours because long-lived connections never close, doubling memory use.", "A version that changes the shared statistics layout crashes when started next to the old one."],
    v: "Run a steady request load, trigger a hot restart to a new build, and confirm zero failed requests, an unbroken counter series, and that the old process exits after the drain period.",
    dep: ["connection-draining", "listeners", "stats-counters"]
  },
  "connection-draining": {
    s: "Gracefully retires listeners and connections: stop accepting new work, tell peers to go elsewhere, and give in-flight requests time to finish before closing.",
    d: "On shutdown, a listener removal or configuration change, the proxy marks itself draining. It fails health checks so load balancers stop selecting it, tells HTTP/1.1 peers to close after the current response and sends HTTP/2 and HTTP/3 peers a graceful shutdown notice. Connections close as streams complete, and a hard deadline closes the rest. Draining is spread over time to avoid all peers reconnecting at once. It is hard because long-lived streams and upgraded connections may never finish, so the deadline always cuts something.",
    k: ["A long drain period versus a short one: long drains protect slow requests, but prolong deployments and keep old processes and configuration alive.", "Staggered closure versus closing at the deadline: staggering avoids reconnect storms, but keeps some connections on old configuration longer."],
    p: ["The proxy exits at its deadline while the orchestrator's kill timeout is shorter, so requests are cut by the platform instead.", "Streaming calls are severed at the deadline with no notice, and clients treat it as a server failure."],
    v: "Send a ten-second request, begin draining, and confirm new connections are refused or redirected, the in-flight request completes normally, and the process exits after it.",
    dep: ["listeners", "http-connection-manager", "readiness-liveness"]
  },
  "stats-counters": {
    s: "Named counters, gauges and histograms recorded on every layer of the proxy: connections, requests, response classes, retries, ejections, latencies and configuration updates.",
    d: "Each component increments counters in its own scope, such as per listener, per route or per cluster, and each worker updates its own copy so the hot path takes no locks. A flusher periodically merges the copies and pushes them to a sink or serves them for scraping. Histograms summarize latency distributions, not just averages. It is hard because cardinality grows with the number of clusters, hosts and routes, and statistics for thousands of upstreams can consume more memory than the connections they describe.",
    k: ["Per-host statistics versus per-cluster only: per-host data finds the bad instance, but multiplies memory and metric storage by fleet size.", "Pushing to a sink versus serving for scrape: push controls timing and works with short-lived proxies, while scrape is simpler but needs reachability."],
    p: ["Tags built from request attributes such as path create unbounded metric names and exhaust memory.", "Counters that are merged only at flush time make a worker's recent activity invisible during an incident."],
    v: "Send a known number of requests, half of them failing, and confirm the request and error counters at listener, route and cluster scope match the counts exactly after the next flush.",
    dep: ["thread-local-stats"]
  },
  "access-logs": {
    s: "A per-request or per-connection record written when it ends, with timestamps, route, upstream host, status, bytes, timings and a flag explaining why it ended.",
    d: "Loggers attach to listeners, connection managers or routes and render a configured format after the stream completes, using fields the proxy has collected: peer identity, selected cluster, response flags such as upstream timeout or rate limited, and durations for each phase. Output goes to files, a stream or a remote logging service. The response flag is the most valuable field, because it distinguishes failures the proxy generated from failures the upstream returned. It is hard to do at volume without adding latency or losing records.",
    k: ["Logging every request versus sampling or filtering: complete logs make incident analysis reliable, but cost storage and CPU at high request rates.", "Synchronous file writes versus a buffered stream: buffering keeps request latency flat, but can lose the final records in a crash."],
    p: ["Sensitive headers or tokens are logged verbatim and end up in a log store with broad read access.", "Logs are written only on successful completion, so requests that reset mid-stream leave no record."],
    v: "Send a request that times out upstream and confirm its log line shows the cluster, the host tried, the elapsed time and a timeout flag distinct from the flag for an upstream error response.",
    dep: ["http-connection-manager", "stats-counters"]
  },
  "distributed-tracing": {
    s: "Propagates a trace identifier through each hop and reports a span for each request the proxy handles, so a call across many services can be reconstructed.",
    d: "On request arrival the proxy reads trace headers, starts a span as a child of any incoming one or begins a new trace, and forwards updated headers upstream. When the request completes it reports the span with timing, route and status to a collector. Sampling decides which traces are kept. The proxy can only link hops if the application copies the trace headers from inbound to outbound requests, since it cannot know which outbound call belongs to which inbound one. Sampling decisions must be consistent across hops.",
    k: ["Head sampling at the edge versus sampling in the collector: head sampling is cheap, but discards slow or failed traces before they are known to be interesting.", "Proxy-generated spans versus application instrumentation: proxy spans need no code changes, but show only network behavior and cannot see inside the service."],
    p: ["The application does not forward trace headers, so every hop starts a new trace and the call graph is fragmented.", "Tracing at full sampling on a busy edge adds measurable latency and floods the collector."],
    v: "Send one request through three services and confirm the collector shows a single trace with a span from each proxy, correctly parented, with durations that sum plausibly to the end-to-end time.",
    dep: ["http-connection-manager", "header-manipulation"]
  },
  "readiness-liveness": {
    s: "Endpoints and signals that tell an orchestrator or load balancer whether a proxy is alive and whether it should be sent traffic right now.",
    d: "Liveness answers whether the process is running and its event loops are responsive. Readiness answers whether it has received initial configuration and is accepting traffic, and it flips to failing during drain so upstream balancers move away before shutdown. Some designs also report readiness of the application behind the sidecar, or fail readiness when the control plane is unreachable at startup. It is hard because the two signals have different failure consequences: failing liveness restarts the process, failing readiness only removes it from rotation.",
    k: ["Readiness tied to first configuration versus to process start: tying it to configuration avoids serving with nothing configured, but delays traffic if the control plane is slow.", "Restart on failed liveness versus alert only: restarting repairs hangs automatically, but can turn a control plane outage into a crash loop."],
    p: ["Liveness checks depend on the control plane, so an outage there restarts every proxy at once.", "Readiness stays true during drain, and the load balancer sends new requests to a process that is about to exit."],
    v: "Start a proxy without a reachable control plane and confirm readiness fails. Begin a drain on a ready proxy and confirm readiness flips to failing while in-flight requests complete.",
    dep: ["admin-interface", "bootstrap-config"]
  },
  "overload-manager": {
    s: "Monitors the proxy's own resource use, such as memory, connections and event loop delay, and triggers escalating protective actions before it fails.",
    d: "Resource monitors sample heap size, file descriptors, active connections and the lag of each worker's event loop. Thresholds map to actions: stop accepting new connections, disable keep-alive, shorten timeouts, reset the oldest or heaviest streams, and finally refuse everything. Actions are graduated so the proxy sheds the cheapest load first. It is hard because the proxy must decide quickly with incomplete knowledge, and an action that frees memory late can arrive after the process has already been killed by the platform.",
    k: ["Graduated actions versus a single hard limit: graduated actions degrade gently and preserve the most valuable traffic, but need careful tuning of each threshold.", "Shedding at the proxy versus relying on platform limits: proxy shedding is orderly and visible, while platform kills are abrupt and lose all in-flight work."],
    p: ["Thresholds are set above the container memory limit, so the platform kills the proxy before any action triggers.", "Resetting streams with no distinction between critical and best-effort traffic sheds the health checks that keep the service alive."],
    v: "Drive memory use up with a flood of large slow requests and confirm the proxy first disables keep-alive, then rejects new connections, and recovers fully once the load stops, without being killed.",
    dep: ["stats-counters", "event-loop", "connection-handling"]
  },
  "sidecar-deployment": {
    s: "A proxy runs next to every workload instance and handles all of its inbound and outbound traffic, so mesh features apply with no application changes.",
    d: "Each workload instance gets its own proxy in the same network namespace, receiving outbound calls through redirection and inbound calls on the workload's address. Identity is per workload and policy is enforced at both ends of each call. Configuration is scoped to that workload's dependencies, which keeps memory per proxy modest. The cost is the sum across the fleet: one proxy per instance consumes CPU and memory everywhere, adds two proxy hops to each call, and ties proxy upgrades to workload restarts.",
    k: ["A proxy per workload versus shared proxies: per-workload isolation gives precise identity and blast radius, but multiplies resource cost and upgrade effort by instance count.", "Co-located lifecycle versus independent proxy lifecycle: co-location keeps them in step, but makes proxy fixes require restarting applications."],
    p: ["Resource requests for the sidecar are underestimated, and a traffic spike throttles the proxy while the application sits idle.", "Short-lived batch jobs finish but the proxy keeps running, so the job never completes."],
    v: "Measure added latency and memory with the sidecar on and off for one workload, and confirm identity-based policy distinguishes two callers in the same namespace without application changes.",
    dep: ["traffic-interception", "sidecar-injection", "worker-threads"]
  },
  "per-node-deployment": {
    s: "One shared proxy runs on each machine and serves every workload on it, reducing proxy count but sharing one proxy between unrelated workloads.",
    d: "A node agent handles traffic for all workloads scheduled onto its machine. Redirection sends each workload's traffic into the agent, which must distinguish workloads by source address or tunnel and apply that workload's identity and policy. The agent is upgraded independently of workloads and its fleet size is the node count, not the instance count. It is hard because isolation is weaker: one noisy workload shares CPU, connection limits and failure with its neighbors, and the agent must safely hold the identities of many workloads at once.",
    k: ["A shared node proxy versus a sidecar per workload: far fewer proxies to run and upgrade, but weaker isolation and a larger blast radius per failure.", "Layer 4 only at the node versus full layer 7: L4 is cheap and generic, while layer 7 features need a more capable proxy somewhere else."],
    p: ["A single workload's connection flood exhausts limits in the node proxy, degrading every other workload on that machine.", "A node proxy crash takes down networking for all its workloads at once, instead of one instance."],
    v: "Run two workloads on one node with different policies, confirm each is treated under its own identity, then crash the node proxy and measure how many workloads lose connectivity and for how long.",
    dep: ["traffic-interception", "mutual-tls", "tcp-proxy"]
  },
  "sidecarless-deployment": {
    s: "Moves mesh behavior out of per-workload proxies, either into the application's own network library or into the node, so no proxy process is injected beside each workload.",
    d: "Two approaches exist. In the library approach, the application links code that speaks the dynamic configuration protocol and performs routing, balancing and security itself, with no extra hop. In the node approach, a lightweight agent handles secure transport and a shared proxy handles layer 7 only where needed. Both reduce the per-instance cost and the extra hop. The tradeoff is ownership: library features are tied to the application's language and release cycle, and a fleet in many languages needs the same behavior implemented many times.",
    k: ["Library-based mesh versus proxy-based: no extra hop or process, but behavior depends on every application's library version and language.", "Node-level secure transport with selective layer 7 versus full proxies: cheaper at scale, but features beyond transport security need another component in the path."],
    p: ["An old library version in one service ignores a new policy field, and the service silently bypasses the policy.", "Behavior diverges between languages because each library implements retries and timeouts slightly differently."],
    v: "Call between two services with the same policy and confirm identical retry, timeout and balancing behavior in each implementation, and that no per-workload proxy process exists in the deployment.",
    dep: ["dynamic-config-api", "mutual-tls", "round-robin"]
  },
  "edge-gateway": {
    s: "A shared proxy at the boundary of a network that accepts traffic from outside, terminates TLS, applies public-facing policy and routes to internal services.",
    d: "An edge gateway faces untrusted clients. It owns public certificates and names, terminates TLS, normalizes and validates requests, enforces rate limits and authentication, and routes by host and path to clusters. It is typically run as a replicated, autoscaled fleet behind an address that moves between instances, such as an anycast or virtual address. Its configuration is often simpler and more static than a mesh sidecar's. It is hard because it is the first thing attackers and traffic spikes meet, so overload behavior and request validation matter more than features.",
    k: ["A dedicated gateway fleet versus gateway logic inside each service: a dedicated fleet centralizes policy and certificates, but is a shared dependency whose failure is total.", "Terminating TLS at the edge versus passing it through: termination enables layer 7 policy, but puts private keys and plaintext on the edge."],
    p: ["Internal-only routes are reachable through the public listener because virtual hosts share one route table.", "Autoscaling reacts too slowly to a spike, and the gateway is the component that fails first."],
    v: "Send traffic from an external address to a public name and confirm TLS termination, routing and rate limiting apply. Request an internal-only path from outside and confirm it is refused.",
    dep: ["listeners", "tls-termination", "route-table", "global-rate-limit"]
  },
  "traffic-interception": {
    s: "Redirects a workload's inbound and outbound connections into its proxy without changing the application, usually by firewall rules or kernel-level redirection.",
    d: "Rules in the workload's network namespace send outbound connections to the proxy's outbound listener and inbound ones to its inbound listener, excluding the proxy's own traffic to avoid loops. The proxy recovers the original destination from the redirected socket to know where the application meant to connect. Some designs avoid rules by having the application call the proxy explicitly, or use kernel programs to redirect at socket level. It is hard because exclusions, special ports, IPv6 and traffic that must bypass the mesh, such as health probes, all need explicit handling.",
    k: ["Transparent redirection versus explicit proxy addresses: transparent needs no application change, but is invisible, privileged and a hard source of debugging confusion.", "Firewall-rule redirection versus socket-level redirection: socket-level avoids extra packet traversal and conntrack cost, but depends on newer kernel features."],
    p: ["The proxy's own outbound connections are redirected back to itself, creating a loop that consumes all connections.", "A health probe from the platform is redirected through the proxy and fails, so the workload is killed as unhealthy."],
    v: "From inside a workload, connect to a service address and confirm the proxy log records the connection with the original destination. Confirm the proxy's own upstream connections are not redirected.",
    dep: ["original-destination", "listeners"]
  },
  "config-consistency": {
    s: "How quickly and how uniformly new configuration reaches a fleet, and what the system does while some proxies have the new version and others do not.",
    d: "Configuration changes propagate over seconds to minutes, and at any moment different proxies run different versions. The control plane cannot make an atomic change across a fleet, so every change must be safe when old and new coexist: routes after clusters, additions before removals, and rules that tolerate both versions of a peer. Each resource type is updated independently. Consistency also covers rejection, where a subset of proxies refuses a change and the fleet is permanently split. The practical result is that rollout speed, safe ordering and visibility into what each proxy runs must be designed together.",
    k: ["Fast global push versus staged rollout by percentage of proxies: fast push fixes mistakes quickly, but a mistake also reaches everyone before anyone notices.", "Eventually consistent updates versus transactional ones: eventual consistency scales and survives partitions, but every change must be valid in mixed fleets."],
    p: ["A change valid only when all proxies have it causes errors during the propagation window.", "A proxy that missed an update stays stale indefinitely because nothing compares its version to the fleet's."],
    v: "Push a change and graph, per proxy, the version in effect over time. Confirm the fleet converges within the target interval and that no request fails during the mixed-version period.",
    dep: ["dynamic-config-api", "config-ack-nack", "warming-and-ordering"]
  },
  "failure-domains": {
    s: "How far a single failure spreads: one connection, one worker, one proxy, one cluster, or every proxy in the mesh through shared control plane state.",
    d: "The data path is designed so that failures stay local: a connection belongs to one worker, an upstream failure is contained by limits and ejection, and a proxy keeps serving on its last configuration if the control plane is gone. The control plane is the shared failure domain, since a bad push or a broken signing authority can affect everything simultaneously. Topology matters too: a shared node proxy has a larger blast radius than a sidecar. Good designs make the data plane survive a total control plane outage.",
    k: ["Data plane independence from the control plane versus live dependence on it: independence survives outages, but lets proxies run stale configuration and identity until they expire.", "Smaller proxies with narrow scope versus shared proxies: narrow scope shrinks blast radius, at the price of more proxies to run."],
    p: ["A control plane outage coincides with certificate expiry, converting a degraded mode into a full outage.", "One cluster's retries exhaust shared connection limits and degrade unrelated routes through the same proxy."],
    v: "Stop the control plane for an hour and confirm traffic continues with unchanged success rates. Then break one upstream and confirm unrelated clusters show no change in latency or errors.",
    dep: ["circuit-breaking", "connection-ownership", "bootstrap-config"]
  },
  "added-latency": {
    s: "The delay, CPU and memory that each proxy hop adds to a request, and the design choices that keep it small enough to accept.",
    d: "A request through a sidecar mesh passes two proxies, each adding queueing, parsing, filter execution, a possible TLS handshake and an extra copy of the data. Typical added median latency is under a millisecond per hop, but tail latency grows with CPU contention, connection setup and filter cost. Fleet-wide, the proxies themselves consume a meaningful share of the machines. The design levers are fewer hops, connection reuse, avoiding full request buffering, cheaper filters and skipping layer 7 parsing when layer 4 is enough.",
    k: ["Layer 7 processing everywhere versus layer 4 where possible: layer 7 provides routing and policy, but costs parsing and buffering that layer 4 avoids.", "More CPU headroom per proxy versus tight packing: headroom protects tail latency, but raises the fleet's overall cost."],
    p: ["Added latency is measured at the median only, hiding a much larger tail effect from queueing under load.", "Each additional filter looks cheap alone, and together they double the per-request CPU cost."],
    v: "Run the same load directly and through the proxy and compare the median, 99th and 99.9th percentile latency and CPU per thousand requests, repeated at several concurrency levels.",
    dep: ["http-filter-chain", "connection-pool", "worker-threads"]
  },
  "identity-and-trust": {
    s: "How the system establishes who each workload is, proves it on every connection and decides what that identity may do, from the issuing authority down to individual requests.",
    d: "Identity starts with an authority issuing short-lived certificates, flows through secret distribution into proxies, is proven with mutual TLS on each connection and is read by authorization filters as the caller's name. Trust has levels: which authorities a proxy accepts, which names it accepts from them, and which of those names may call which service. Each step must hold for the result to be meaningful. A weakness anywhere, such as an exposed bootstrap token, makes everything downstream decorative.",
    k: ["Identity per workload versus per node or per network location: per workload gives precise policy, but needs issuance and rotation at much higher volume.", "Transport-level identity versus application tokens: transport identity needs no code and covers every protocol, but says nothing about the end user."],
    p: ["Traffic that bypasses the proxy reaches a workload directly, and the workload accepts it because it was never required to be authenticated.", "Authentication succeeds but authorization is left at default-allow, so every authenticated caller reaches everything."],
    v: "Attempt a call from a workload without a valid certificate, with a valid certificate from another trust domain and with an unauthorized identity, and confirm each is refused at a different, logged step.",
    dep: ["identity-issuance", "mutual-tls", "authz-filters", "peer-validation"]
  },
  "overload-behavior": {
    s: "What the system does when demand exceeds capacity: which work it queues, limits, rejects or abandons, and whether that protection is applied at each layer.",
    d: "Overload is handled in layers. Connection and request limits bound what a proxy accepts, circuit breakers bound what it sends to one upstream, rate limits shape callers and the overload manager reacts to the proxy's own resources. Each limit should reject fast with a distinct signal rather than queue without bound, since queues convert overload into latency for everyone. Retries are the main amplifier, because a failing service gets more traffic exactly when it can least handle it. The goal is graceful degradation, not maximum throughput.",
    k: ["Failing fast with explicit rejection versus queueing: rejection keeps latency bounded and signals callers to back off, but visibly drops requests that a queue might have served.", "Uniform limits versus priority-aware shedding: uniform limits are simple, but shed health checks and critical traffic along with the rest."],
    p: ["Retries from every layer multiply a brief upstream slowdown into several times the normal load.", "Limits are set in each layer independently and the tightest one is not the one expected, so the effective capacity is unknown."],
    v: "Ramp load to three times capacity and confirm excess requests are rejected quickly with a distinct code, latency of accepted requests stays near baseline, and throughput recovers fully when load returns to normal.",
    dep: ["circuit-breaking", "retry-budgets", "overload-manager", "local-rate-limit"]
  },
  "upgrade-compatibility": {
    s: "Whether old and new versions of proxies, control plane and configuration can run together during a rollout, and how far apart their versions may drift.",
    d: "A fleet is never upgraded at once, so the control plane must serve configuration that older proxies understand, and new proxies must accept configuration produced for older ones. Configuration schemas evolve by adding optional fields and deprecating old ones over several releases. Extensions have their own compatibility surface: plugins built against one interface version may not load in another. Hot restart, certificates and statistics layouts add further coupling. The rule is a published skew window, with the control plane upgraded before the proxies it serves.",
    k: ["A wide version skew window versus lockstep upgrades: wide windows allow gradual, low-risk rollouts, but require every schema change to be backward compatible for longer.", "Translating configuration per proxy version versus one format for all: translation lets features arrive safely, but multiplies the control plane's testing matrix."],
    p: ["The control plane is upgraded after the proxies and emits a field older proxies reject, so a rollout stalls half done.", "A sandboxed plugin compiled against an older interface fails to load on the new proxy, and the route using it returns errors."],
    v: "Run a mixed fleet of the oldest and newest supported proxy versions against the new control plane under load, and confirm all accept their configuration with no rejections and no change in success rate.",
    dep: ["config-ack-nack", "hot-restart", "extension-registry", "dynamic-config-api"]
  },
});
