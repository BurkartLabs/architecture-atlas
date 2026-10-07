// Details for the cluster orchestrator plate, part 4: access, admission and tenancy; scheduler.
ATLAS.details("cluster-orchestrator", {
  "authentication": {
    s: "Establishes who is making a request, from client certificates, bearer tokens, identity-provider assertions or a trusted proxy, and produces a user name and groups.",
    d: "The API server tries each configured authenticator in turn until one succeeds. Certificates identify users by subject; signed tokens from an external identity provider carry claims mapped to names and groups; service account tokens identify workloads; a front proxy can assert identity in headers. The result is an identity, not permissions. Requests that match none are anonymous or rejected. The hard part is lifecycle: certificates are hard to revoke, long-lived static tokens leak, and group claims from an identity provider can change faster than cached tokens expire.",
    k: ["External identity provider tokens versus client certificates: tokens integrate with single sign-on and expire quickly, while certificates work offline but are difficult to revoke.", "Allow anonymous with limited rights versus reject: anonymous access supports health checks and discovery, but widens the surface if roles are loose."],
    p: ["Long-lived client certificates issued to people cannot be revoked and outlive their employment.", "Mapping groups from untrusted claims lets a user grant themselves a privileged group."],
    v: "Send requests with a valid certificate, a valid token, an expired token and no credential. Confirm identities and groups are recorded for the first two, and the last two are rejected or treated as anonymous as configured.",
    dep: ["control-plane-pki", "service-accounts", "trust-boundaries"]
  },
  "service-accounts": {
    s: "Identities for workloads and controllers, whose short-lived signed tokens are projected into workload units so programs can authenticate to the API.",
    d: "A service account is a namespaced object. When a workload runs, the node agent requests a time-bound token bound to that unit and audience, mounts it as a file and refreshes it before expiry. The API server validates the signature, expiry and that the bound unit still exists. Access comes from roles bound to the account. The hard part is least privilege: the default account is shared by every unit that does not name another, and legacy long-lived tokens never expire.",
    k: ["Bound short-lived tokens versus long-lived secrets: bound tokens limit theft damage and die with the unit, but programs must reread refreshed files.", "One account per workload versus a namespace default: per-workload accounts permit tight roles, at the cost of more objects and bindings."],
    p: ["Workloads running with the namespace default account all share whatever permissions anyone granted to it.", "A program reads the token once at startup and fails after it expires."],
    v: "Read the token from inside a workload, decode its claims and confirm audience, expiry and bound unit are present. Delete the unit and confirm the token is rejected before its original expiry.",
    dep: ["authentication", "rbac", "volumes", "node-agent"]
  },
  "rbac": {
    s: "Authorization by roles that list allowed verbs on resources, bound to users, groups and service accounts within a namespace or cluster-wide, with everything else denied.",
    d: "Roles contain rules naming API groups, resources, resource names and verbs. Bindings attach a role to subjects, in one namespace or across the cluster. The authorizer checks a request against all bindings that apply to the identity and allows if any grants it; there are no deny rules. Aggregated roles compose from labels. Escalation prevention stops users granting more than they hold. The hard part is auditing: effective permission is a union spread across many objects, and a few verbs such as creating workloads, reading secrets or impersonating are as powerful as admin.",
    k: ["Additive allow-only rules versus rules with deny: allow-only is simple to reason about locally, but one broad binding cannot be overridden by a more specific restriction.", "Namespaced roles versus cluster-wide: namespaced roles confine mistakes to one namespace, while cluster roles reduce repetition but widen exposure."],
    p: ["Permission to create workloads in a namespace is effectively permission to read its secrets and use its accounts.", "Wildcard rules added for convenience grant access to resource types added later."],
    v: "As a restricted user, attempt allowed and disallowed verbs on several resources and confirm exact results. Run the effective-permissions query for that user and confirm it lists only the intended rules.",
    dep: ["authentication", "api-server", "namespaces"]
  },
  "admission-chain": {
    s: "The ordered stages after authorization where built-in and external plugins may modify or reject a write request before it is validated and stored.",
    d: "Mutating plugins run first and may change the object, for example by adding defaults, injecting sidecars or setting a storage class; validating plugins run after all mutations and may only accept or reject. Built-in plugins enforce quotas, limit ranges, namespace lifecycle and security rules. Plugins apply to creates, updates and deletes, and some to connect requests. The hard part is ordering and interaction: one mutation can invalidate another's assumption, and a failing or slow plugin blocks writes to everything it covers.",
    k: ["Mutate-then-validate ordering versus interleaved: this guarantees validators see the final object, but a mutation by a later plugin may still surprise earlier ones.", "Fail closed versus fail open on plugin error: failing closed keeps policy strict, while failing open keeps the cluster writable at the cost of unenforced rules."],
    p: ["Two mutating hooks that change the same field produce results that depend on call order.", "A failing policy plugin that fails closed blocks all writes, including the fix that would repair it."],
    v: "Create an object that an enabled plugin must default and one that a validator must reject. Confirm the stored first object has the injected fields, and the second is refused with the plugin named in the error.",
    dep: ["api-server", "admission-webhooks", "admission-policies", "quotas-and-limits"]
  },
  "admission-webhooks": {
    s: "External HTTPS services that the API server calls during admission to mutate or validate objects, so organizations can add policy and defaults without changing the server.",
    d: "A configuration object names the service, the resources and operations to match, a timeout and a failure policy. For each match the API server sends the proposed object and receives an allow or deny, plus a patch from mutating hooks. Hooks run in the request path with TLS and a trusted certificate authority. Typical uses are sidecar injection, policy enforcement and defaulting. The hard part is availability: a hook is a synchronous dependency of every write it matches, and hooks that match their own workloads can deadlock the cluster.",
    k: ["Webhook policy versus in-process rules: webhooks can express anything and consult other systems, but add latency, an outage risk and a service to operate.", "Narrow match rules versus broad: narrow rules limit exposure to a hook's failures, while broad ones give consistent enforcement."],
    p: ["A hook with fail-closed policy that matches its own workload prevents it from restarting and locks the cluster.", "Hooks calling the API server recursively create loops and timeouts under load."],
    v: "Stop the webhook service and create a matching object under each failure policy. Confirm fail-open admits and fail-closed rejects with a clear timeout error, and that unmatched resources are unaffected throughout.",
    dep: ["admission-chain", "control-plane-pki", "extensibility-model"]
  },
  "admission-policies": {
    s: "Declarative admission rules written in an expression language and evaluated inside the API server, offering policy without a separate service to run.",
    d: "A policy object holds expressions over the request and the object, with parameters taken from other resources, and a binding scopes it to namespaces or labels with an action: deny, warn or audit. The server compiles and evaluates the expressions with bounded cost, so no network call or extra process is involved. Mutating forms apply patches the same way. The hard part is expressiveness: rules that need external data or complex logic do not fit, and a mistake in a rule silently rejects valid objects.",
    k: ["In-process expressions versus webhooks: in-process is fast, always available and cost-bounded, but cannot call outside systems or run arbitrary code.", "Warn and audit modes before deny: observation first finds mistakes without breaking users, but delays real enforcement."],
    p: ["A rule that references a missing field rejects every object instead of only the intended ones.", "Policies deployed straight to deny with no audit phase break existing workflows."],
    v: "Deploy a policy forbidding privileged workloads in warn mode, create one and confirm a warning with the rule is returned. Switch to deny and confirm the identical request is rejected.",
    dep: ["admission-chain", "schema-validation", "namespaces"]
  },
  "workload-security-standards": {
    s: "Named baselines of what workloads may do, such as running privileged, using host namespaces or mounting host paths, enforced per namespace at admission.",
    d: "Three profiles range from unrestricted through a baseline that blocks known privilege escalations to a restricted one that demands non-root users, dropped capabilities and a default syscall filter. A label on the namespace selects the profile and the mode: enforce rejects, audit logs and warn tells the user. Older per-workload policy objects were replaced by this label-based model. The hard part is adoption: strict profiles break images that run as root, so migration uses warn and audit first.",
    k: ["Per-namespace profile labels versus per-workload policy objects: labels are simple to apply and reason about, but offer coarse choices and no custom rules.", "Enforcement at workload creation versus at the controller: checking the unit catches everything, while checking controllers gives earlier feedback but misses direct creation."],
    p: ["Enforcing on a controller template but not the units it creates lets violations appear only at creation time.", "Operators label system namespaces permissive and forget them, leaving an escalation path."],
    v: "Label a namespace restricted, then create a privileged unit and a root-user unit. Confirm both are rejected naming the violated control, and that a compliant unit with dropped capabilities is accepted.",
    dep: ["admission-chain", "namespaces", "trust-boundaries"]
  },
  "namespaces": {
    s: "Named scopes that group most resources, giving each team or application its own names, access rules, quotas and policies inside one shared cluster.",
    d: "Most resource names are unique only within a namespace. Roles, bindings, quotas, limits, network policies and security profiles attach to it, making it the natural unit of delegation. Deleting a namespace removes everything in it through a controller that waits for finalizers. Some resources, such as nodes and volumes, are cluster-wide. Namespaces are not a hard security boundary on their own: nodes, the network and cluster-wide resources are still shared.",
    k: ["Namespace per team versus per application or environment: per team keeps delegation simple, while finer scopes give tighter policy but more objects to manage.", "Namespaces in one cluster versus separate clusters: namespaces are cheap and share capacity, but share the kernel, network and control plane failure domain."],
    p: ["Assuming namespaces isolate workloads, then running untrusted code beside sensitive services on shared nodes.", "A stuck namespace deletion hangs forever because a finalizer's controller is gone."],
    v: "Create two namespaces with same-named objects and confirm they coexist. Grant a user access to only one and confirm access elsewhere is denied. Delete one and confirm every contained object is removed.",
    dep: ["resource-model", "rbac", "finalizers"]
  },
  "quotas-and-limits": {
    s: "Per-namespace ceilings on total resource use and object counts, plus default and bounds for each container, enforced at admission so teams cannot take more than their share.",
    d: "A quota object caps sums such as requested CPU and memory, storage, and counts of workloads, services and claims in a namespace, optionally by priority class or scope. Admission rejects any request that would exceed the cap and controllers keep usage accurate. Limit ranges set default requests and limits and minimum and maximum per container. Quota requires requests be set on workloads, which defaults provide. The hard part is that quota is accounted at admission, not at runtime, and a rejection reaches the controller, not the user.",
    k: ["Hard quota at admission versus soft accounting: hard quota guarantees isolation of capacity, but wastes unused allocation and rejects work instead of queueing it.", "Defaults via limit ranges versus requiring explicit values: defaults make quotas workable for existing manifests, but hide sizing decisions behind guessed numbers."],
    p: ["A replicated controller hits quota and keeps failing creation with the error visible only in events.", "Defaults applied to all containers in a namespace give every workload the same size regardless of need."],
    v: "Set a quota of ten CPUs, create workloads requesting eleven and confirm the excess creation is rejected with a quota error. Confirm usage in the quota status matches the sum of requests.",
    dep: ["admission-chain", "namespaces", "requests-and-limits"]
  },
  "scheduling-queue": {
    s: "The ordered holding area for workload units that need a node, separating those ready to try, those waiting for a cluster change and those backing off after a failure.",
    d: "New units enter an active queue ordered by priority and arrival. A unit that fails to fit moves to an unschedulable set and returns only when a relevant event, such as a node appearing or a unit being deleted, might help it. Units with backoff wait with growing delay, and a periodic flush guards against missed events. Plugins can register which events matter to them. The hard part is efficiency: retrying every unit on every event wastes work, while ignoring events strands units that could now fit.",
    k: ["Event-driven requeue versus periodic retry of all: event-driven wakes only units that could benefit, but a missed hint leaves one stuck until the flush.", "Priority ordering with FIFO tie-break versus fair sharing: priority ensures important work goes first, but low-priority units can wait indefinitely."],
    p: ["A large batch of unschedulable units at head of the queue delays the scheduling of newly created, schedulable ones.", "A plugin that does not register the right events leaves units unschedulable until the timed flush."],
    v: "Create units that cannot fit, then add a node with enough capacity. Confirm they leave the unschedulable set and bind within seconds without waiting for the periodic flush.",
    dep: ["scheduler-framework", "informers-and-caches", "work-queues"]
  },
  "scheduling-cycle": {
    s: "The sequence for one workload unit: choose a node by filtering and scoring, reserve it in the scheduler's cache, then bind asynchronously by writing the assignment to the API.",
    d: "The scheduling cycle runs serially: filter nodes, score the survivors, select the best and assume the unit onto it in the in-memory cache so later decisions see it. The binding cycle runs concurrently: permit and pre-bind steps, such as volume binding, then the API write that sets the node name. If binding fails, the assumed state is undone and the unit requeued. The hard part is staleness: the cache can differ from reality, so a node agent may reject a unit the scheduler judged to fit.",
    k: ["Serial decisions with asynchronous binding versus fully parallel scheduling: serial keeps decisions consistent against one cache, while async hides API latency, but limits throughput to one decision at a time.", "Sampling a fraction of nodes versus scoring all: sampling bounds latency in huge clusters, but may miss the best node."],
    p: ["A bind failure after the cache assumed placement leaves the cache wrong until the assumption times out.", "Scheduling latency grows with node count until it limits how fast large jobs can start."],
    v: "Create a workload and trace its scheduling: confirm filter, score and bind are logged in order, the node name appears on the object afterward, and scheduling latency metrics record the attempt.",
    dep: ["filtering", "scoring", "scheduling-queue", "scheduler-framework", "api-server"]
  },
  "filtering": {
    s: "The hard-constraint stage that removes nodes unable to run a unit: insufficient resources, wrong labels, unmet port, volume, taint or affinity requirements.",
    d: "Each filter plugin checks one rule against a node and reports pass or fail with a reason. Resource fit compares requests to a node's allocatable minus assigned requests; others check selectors, taints, ports, volume zone and attach limits, topology spread and affinity. Plugins run in sequence and stop at the first failure per node, with checks often parallelized across nodes. If no node survives, the failure reasons feed events and preemption. The hard part is cost and fidelity: the checks must match what the node will really enforce.",
    k: ["Cheap, selective filters first versus fixed order: ordering by cost cuts per-node work, but must be tuned to workload mix.", "Hard rules versus preferences expressed as scores: hard rules guarantee constraints, but make units unschedulable instead of degraded."],
    p: ["Allocatable differing from real free capacity because of unaccounted system overhead leads to rejections at the node.", "Unreadable failure messages leave users unable to tell why a unit is pending."],
    v: "Create a unit requesting more CPU than any node's allocatable. Confirm it stays pending with an event listing, per node, which constraint failed, and that it schedules once a larger node joins.",
    dep: ["requests-and-limits", "taints-and-tolerations", "affinity-and-anti-affinity", "scheduler-framework"]
  },
  "scoring": {
    s: "The soft-preference stage that ranks feasible nodes with weighted plugin scores, such as spreading, bin-packing, image locality and affinity preference, and picks the best.",
    d: "Each scoring plugin gives every feasible node a number, normalized to a common range, multiplied by a configured weight and summed. Typical plugins prefer least-allocated nodes for spreading or most-allocated for packing, nodes that already have the image, and nodes matching preferred affinities. Ties break randomly. The hard part is that weights encode policy: spreading helps availability and burst absorption while packing enables autoscaler scale-down, and the two goals pull in opposite directions.",
    k: ["Spreading versus bin-packing: spreading improves resilience and headroom, while packing frees whole nodes for removal and saves cost.", "Many tuned weights versus few simple ones: tuning fits a specific fleet, but is brittle and hard to reason about as workloads change."],
    p: ["Image-locality preference piles units onto one node that already has the image, creating a hotspot.", "Scores based on requests ignore actual usage and place new units on busy nodes."],
    v: "Schedule twenty identical units onto an empty cluster under spreading and then packing profiles. Confirm spreading distributes them evenly and packing fills nodes in turn, leaving others empty.",
    dep: ["scheduler-framework", "filtering", "scheduling-cycle"]
  },
  "affinity-and-anti-affinity": {
    s: "Rules that attract a unit to nodes with certain labels, or to or away from nodes already running other units, as hard requirements or weighted preferences.",
    d: "Node affinity matches node labels. Inter-unit affinity places a unit in the same topology domain, such as a node or zone, as units matching a selector; anti-affinity places it in a different one. Each rule is required during scheduling or a preference with a weight, and ignored once running. Rules are evaluated against existing units in the cache. The hard part is cost: inter-unit rules must consider all units in each domain, making them one of the most expensive scheduling features in large clusters.",
    k: ["Required versus preferred rules: required guarantees separation, such as one replica per node, but leaves units pending when impossible, while preferred degrades gracefully.", "Anti-affinity versus topology spread: anti-affinity is strict and simple, but handles only one-per-domain, while spread constraints allow balanced counts."],
    p: ["Required anti-affinity across more replicas than nodes leaves some pending until the autoscaler adds machines.", "Inter-unit rules on thousands of units slow scheduling for the entire cluster."],
    v: "Schedule three replicas with required anti-affinity on a three-node cluster and confirm one per node. Add a fourth replica and confirm it stays pending with an event naming the anti-affinity rule.",
    dep: ["filtering", "scoring", "topology-spread"]
  },
  "taints-and-tolerations": {
    s: "Node markers that repel units unless they carry a matching toleration, used to reserve nodes for special workloads and to signal unhealthy conditions.",
    d: "A taint has a key, value and effect: no new scheduling, prefer not to schedule, or evict existing units. A toleration in the unit's spec matches taints by key, value and operator, optionally with a time limit for the evict effect. Controllers add taints automatically when a node is not ready, unreachable, out of memory or disk, or unschedulable. Tolerations let system daemons run anywhere. The hard part is that tolerations are requests, not grants, so any workload may tolerate a taint unless admission restricts it.",
    k: ["Taints on nodes versus labels with selectors on units: taints protect special nodes from everything by default, while selectors need every workload to opt in or out.", "Tolerate with a time limit versus forever: a limit lets work ride out brief problems, but forever keeps units on failing nodes."],
    p: ["Any user can add a toleration to run on nodes reserved for sensitive workloads unless admission blocks it.", "Tolerating all taints for convenience keeps units on nodes that are being drained or are failing."],
    v: "Taint a node with a no-schedule effect and create units with and without a matching toleration. Confirm only the tolerating unit schedules there, and an evict taint removes non-tolerating units already running.",
    dep: ["filtering", "node-lifecycle-controller", "node-pressure-eviction"]
  },
  "topology-spread": {
    s: "Constraints that bound how unevenly a workload's units may be distributed across failure domains such as zones and nodes, measured as the maximum count difference.",
    d: "A constraint names a topology key, a maximum skew, a label selector and what to do when it cannot be satisfied: refuse or schedule anyway with a lower score. The scheduler counts matching units per domain, and rejects nodes whose placement would exceed the skew relative to the least-filled domain. It supports minimum domains and node-eligibility policies. The hard part is that it only constrains scheduling: later deletions or scale-downs can leave the distribution uneven, and rebalancing needs a separate component.",
    k: ["Skew limits versus strict anti-affinity: skew allows more replicas than domains with balance, but only bounds imbalance rather than guaranteeing one per domain.", "Refuse versus best-effort when unsatisfiable: refusing preserves availability guarantees, but leaves units pending, while best-effort keeps running at the cost of concentration."],
    p: ["After scale-down or node loss the distribution becomes lopsided, and nothing moves units back.", "Counting units from a selector that matches other workloads gives skew numbers that confuse operators."],
    v: "Deploy nine replicas with a zone skew of one over three zones. Confirm three per zone, then drain one zone and confirm replacements respect the skew or stay pending, as the constraint's mode states.",
    dep: ["filtering", "scoring", "failure-domains"]
  },
  "preemption": {
    s: "When no node fits a unit, the scheduler picks lower-priority units to evict from a node, so the higher-priority one can take their place.",
    d: "After filtering finds nothing, a post-filter step simulates, per candidate node, removing lower-priority units until the pending one fits, preferring victims that minimize priority disruption and respect disruption budgets where possible. It evicts victims, records a nominated node on the pending unit and requeues it. Higher-priority work waiting in the queue can also take the nominated space. The hard part is that nomination is a hint: the freed room can be used by other units before the preemptor binds.",
    k: ["Preempt to make room versus wait for capacity: preemption keeps critical workloads running at once, but disrupts others, and cascades if victims in turn preempt.", "Honoring disruption budgets as best effort versus a strict barrier: best-effort lets critical work in, but may violate availability promises of the victims."],
    p: ["Priority inversion between teams lets one team's high priority class evict another team's production workloads.", "Victims are evicted, but the preemptor still cannot bind because of a constraint the simulation missed."],
    v: "Fill a node with low-priority units, then create a high-priority unit that does not fit. Confirm victims are evicted gracefully, the new unit is nominated and binds to that node, and the events name the victims.",
    dep: ["filtering", "scheduling-queue", "disruption-budgets", "workload-lifecycle"]
  },
  "scheduler-framework": {
    s: "A plugin architecture with defined extension points through scheduling and binding, so features and custom policies are plugins, not changes to the core algorithm.",
    d: "Extension points include queue sorting, pre-filter, filter, post-filter, pre-score, score, reserve, permit, pre-bind, bind and post-bind. Built-in features are plugins using them, and operators choose and configure plugins per scheduling profile; several profiles can run in one process, selected by a name in the unit's spec. Out-of-process extenders can be called too, but add latency. The hard part is performance and state: plugins share a per-cycle state and run in the hot path, so a slow one reduces throughput for all.",
    k: ["In-process plugins versus out-of-process extenders: plugins are fast and see internal state, but must be compiled in, while extenders can be written independently but add network latency.", "Several profiles in one scheduler versus several schedulers: profiles share cache and avoid conflicts, while separate schedulers can race to assign the same resources."],
    p: ["Two schedulers with separate caches bind different units to the last free capacity of one node.", "A slow plugin in the filter stage multiplies by node count and collapses scheduling throughput."],
    v: "Enable a custom score plugin in a second profile and create units naming that profile. Confirm they are placed by the new plugin's preference while units on the default profile are unaffected.",
    dep: ["scheduling-queue", "informers-and-caches"]
  },
});
