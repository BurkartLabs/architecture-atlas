// Details for the cluster orchestrator plate, part 2: workloads, controller machinery, autoscaling.
ATLAS.details("cluster-orchestrator", {
  "workload-unit": {
    s: "The smallest schedulable object: one or more containers that share a network identity and volumes, are placed on one machine together and live and die as a group.",
    d: "The spec lists containers, volumes, resource requests, a restart policy, security settings and scheduling constraints. The scheduler assigns it to a node once; it is never moved, only replaced. Containers in it share a network namespace and can share storage, so tightly coupled helpers sit beside the main process. It has a unique name and address that disappear with it. The hard part is its disposability: most fields are immutable after creation, and everything that wants it to persist must be a controller that makes new ones.",
    k: ["Multi-container group as the unit versus one container per unit: a group lets helpers share network and storage with the main process, but couples their scheduling, scaling and fate.", "Replace-not-mutate versus in-place edits: replacement keeps the model simple and reproducible, but forces a restart for changes that could have been applied live."],
    p: ["Creating bare units with no controller means a node failure loses the workload permanently.", "Putting independently scaled services in one unit forces them to scale together."],
    v: "Create a two-container unit, confirm both containers reach each other on localhost and mount the same volume, then delete the node it runs on and confirm the unit is not recreated unless a controller owns it.",
    dep: ["resource-model", "container-runtime-interface", "volumes"]
  },
  "workload-lifecycle": {
    s: "The phases a workload unit moves through, from pending to running to a terminal state, including how a graceful stop is requested, delayed and finally forced.",
    d: "A unit is pending until scheduled and its images and volumes are ready, running while any container runs, then succeeded or failed once all have exited. Deletion sets a deadline and a termination timestamp: stop hooks run, containers get a terminate signal, and after the grace period a kill. Endpoint removal races with termination, so traffic may still arrive. Conditions record finer states such as scheduled and ready. The hard part is making shutdown clean, because deletion, traffic removal and process signals all travel through different components.",
    k: ["Grace period with a pre-stop hook versus immediate kill: the grace period drains connections and flushes data, but slows rollouts and node drains.", "Phase summary plus detailed conditions versus a single state machine: conditions are extensible and independent, but consumers must interpret combinations."],
    p: ["Applications ignoring the terminate signal are killed after the grace period and lose in-flight work.", "Traffic is still routed to a terminating unit because endpoint removal has not propagated yet."],
    v: "Delete a unit that is serving requests under load with a pre-stop delay. Confirm no request fails, the process receives the terminate signal after the delay, and the unit leaves the endpoint list before it exits.",
    dep: ["workload-unit", "workload-sync-loop", "endpoint-slices", "health-probes"]
  },
  "init-and-sidecar-containers": {
    s: "Containers inside a workload unit with special ordering: init containers run to completion before the main ones start, and sidecars run alongside them for the unit's whole life.",
    d: "Init containers run one at a time in order and must succeed, so they prepare data, wait for dependencies or fetch configuration. Sidecars start before the main containers, stay running, and are stopped after them, supporting proxies, log shippers and credential refreshers. Both share the unit's volumes and network. The hard part is ordering and lifecycle: a sidecar that never becomes ready blocks startup, one that stops before the main container loses its traffic path, and in batch units a never-exiting helper keeps the unit from completing.",
    k: ["Native sidecar ordering versus plain containers started together: ordering guarantees the helper is ready first, but adds startup and shutdown dependencies.", "Init containers for setup versus doing setup in the application: init isolates privileged or heavy steps, but each one adds startup time and an image to pull."],
    p: ["A helper container that keeps running prevents a batch workload from ever reaching completed.", "A proxy sidecar that exits first drops the main container's outbound connections during shutdown."],
    v: "Start a unit whose init container sleeps ten seconds. Confirm main containers start only after it exits successfully, and that a failing init container makes the unit retry with backoff without starting the main ones.",
    dep: ["workload-unit", "workload-lifecycle", "container-runtime-interface"]
  },
  "replicated-sets": {
    s: "A controller that keeps a specified number of identical workload units running, creating or deleting units to match the count and replacing any that disappear.",
    d: "It selects units by labels and compares their count with the desired count. If fewer exist, it creates units from a template; if more, it deletes the surplus, preferring those not ready or newest. It sets itself as owner of what it creates and adopts matching orphans. It tracks expectations so it does not over-create before earlier creates are visible. The hard part is that selection is by labels: overlapping selectors make two controllers fight over the same units, and an edited label can orphan a unit.",
    k: ["Label-selector ownership versus explicit membership lists: selectors are flexible and let units be adopted or released, but overlapping selectors cause fights.", "Delete preference for not-ready, newest units versus random: this keeps healthy, warm units serving, at some cost in predictability."],
    p: ["Two controllers with overlapping selectors keep creating and deleting each other's units.", "Changing a unit's labels to debug it detaches it from its controller, which immediately makes a replacement."],
    v: "Set the desired count to five and delete two units by hand. Confirm two replacements appear within seconds, the count stays at five, and each new unit carries the controller as owner.",
    dep: ["workload-unit", "reconciliation-loops", "owner-references", "informers-and-caches"]
  },
  "rolling-deployments": {
    s: "A controller that manages versioned replicated sets to roll a new workload template out gradually, with limits on unavailable and surplus units, and rolls back on request.",
    d: "On a template change it creates a new replicated set and shifts replicas from old to new in steps bounded by a maximum surge and maximum unavailable. It waits for new units to become ready before continuing and stops if progress stalls past a deadline. Old sets are kept scaled to zero for rollback history. Other strategies replace everything at once. The hard part is that readiness is the only safety signal: if probes do not reflect real health, a bad version rolls out to all replicas.",
    k: ["Rolling replacement versus recreate-all: rolling keeps the service up with two versions briefly mixed, and recreate is simple but causes downtime.", "Readiness-gated progress versus time-based progress: gating halts bad versions, but is only as good as the probe."],
    p: ["A weak readiness probe lets a broken version pass and replace every healthy replica.", "Two versions run at once, so schema or protocol changes must be compatible both ways."],
    v: "Roll out a version that fails its readiness probe. Confirm the rollout stalls with at most the configured unavailable units, old units keep serving, and a rollback command restores the previous version.",
    dep: ["replicated-sets", "health-probes", "reconciliation-loops"]
  },
  "stateful-sets": {
    s: "A controller for workloads that need stable identity: ordered, uniquely named units with persistent per-unit storage, started, updated and stopped in a defined sequence.",
    d: "Units get predictable ordinal names, stable network names through a headless service, and a volume claim created per unit that survives deletion and is reattached to the replacement of the same name. Creation and scaling proceed in order, waiting for each to be ready; updates go in reverse order, optionally by partition. It is built for databases and clustered systems. The hard part is data safety: a node that is unreachable but still running makes the controller unable to know whether a unit is really dead, and forcing replacement risks two writers.",
    k: ["Ordered, one-at-a-time operations versus parallel: order protects quorum-based systems during changes, but makes scale and upgrade slow.", "Retaining claims on scale-down versus deleting them: retaining prevents accidental data loss, but leaks storage until someone cleans it up."],
    p: ["Force-deleting a unit on an unreachable node starts a replacement while the original may still write to the same volume.", "Scaling down and up later reattaches old data that no longer matches the cluster's membership."],
    v: "Scale a three-member set to zero and back to three. Confirm each member returns with its original name and its original volume contents, and that members start strictly in ordinal order.",
    dep: ["workload-unit", "persistent-volume-claims", "services", "reconciliation-loops"]
  },
  "node-daemons": {
    s: "A controller that runs exactly one copy of a workload unit on every machine, or every machine matching a selector, adding and removing copies as nodes come and go.",
    d: "It watches nodes and creates a unit bound to each eligible one, bypassing normal scheduling queues but still honoring taints through tolerations it adds. Typical payloads are log collectors, node metrics, network plugin agents and storage agents. Updates roll node by node with a limit on unavailable nodes. The hard part is that these units compete with application workloads for node resources and are often critical: node networking may depend on one, so its absence, or its priority, matters.",
    k: ["One copy per node versus a replicated set with anti-affinity: the per-node controller tracks node membership automatically, and a replicated set gives count control but not automatic coverage.", "Tolerating all taints versus selected ones: broad tolerations ensure coverage on special nodes, but can place the daemon on nodes meant to be drained or isolated."],
    p: ["A daemon without resource requests is evicted first under pressure, silently removing logging or networking from the node.", "A bad daemon update rolling across every node at once breaks the whole fleet."],
    v: "Add a new machine to the cluster and confirm a daemon copy is created on it without manual action. Remove a node label used in the selector and confirm its copy is deleted.",
    dep: ["workload-unit", "taints-and-tolerations", "reconciliation-loops", "informers-and-caches"]
  },
  "batch-jobs": {
    s: "Controllers for work that runs to completion: jobs that track a set of units until enough succeed, and scheduled jobs that create jobs on a time pattern.",
    d: "A job creates units, retries failures up to a backoff limit, and records completion when the required number has succeeded. Modes include parallel workers, fixed completion counts and indexed work where each unit handles one slice. A scheduled job creates a job per time match, with rules for overlapping runs and missed starts. Finished jobs may be cleaned up after a time to live. The hard part is at-least-once semantics: retries and overlapping runs mean the work itself must be idempotent.",
    k: ["Retry failed units versus fail the job fast: retry absorbs transient node failures, and fast failure surfaces a bad job without wasting resources.", "Allow, forbid or replace overlapping scheduled runs: forbidding avoids double processing but skips runs, while allowing risks contention."],
    p: ["Thousands of finished jobs left in the store slow every list and bloat storage.", "A scheduled job misses its window during a control-plane outage and either never runs or runs in a burst."],
    v: "Run an indexed job of ten slices where one fails twice. Confirm that slice is retried, all ten finish, and the job reports success exactly once with the retry count recorded.",
    dep: ["workload-unit", "reconciliation-loops", "garbage-collection", "owner-references"]
  },
  "health-probes": {
    s: "Periodic checks defined in the workload spec that decide whether a container has started, is alive and is ready to receive traffic.",
    d: "Three kinds exist. A startup probe gates the others for slow starters. A liveness probe causes a restart on repeated failure. A readiness probe removes the unit from service endpoints without restarting it. Each runs an HTTP request, a TCP connect, a command inside the container or a remote procedure call from the node agent, with period, timeout and failure threshold. The hard part is setting them: liveness that depends on downstream services causes restart cascades, and readiness that is too lenient makes rollouts unsafe.",
    k: ["Liveness restarting versus readiness only draining: restarts fix deadlocks, but a wrongly tuned liveness probe turns a slow dependency into a crash loop.", "Probe from the node agent versus an in-app check on its own: the agent's view tests the real network path, at the cost of probe load per unit."],
    p: ["A liveness probe that calls a shared database makes every replica restart when the database slows.", "Probe timeouts shorter than a garbage-collection pause trigger unnecessary restarts."],
    v: "Make a container's health endpoint return failure. Confirm readiness failure removes it from endpoints within the period times threshold, and that only liveness failure triggers a container restart.",
    dep: ["probe-workers", "endpoint-slices", "workload-lifecycle"]
  },
  "disruption-budgets": {
    s: "A declaration of how many replicas of a workload may be voluntarily unavailable at once, which eviction requests must respect.",
    d: "The budget selects units by label and states a minimum available count or maximum unavailable count. A controller computes how many disruptions are currently allowed. Drains, autoscaler scale-down and other voluntary evictions go through the eviction API, which rejects a request that would exceed the allowance. It does not apply to involuntary failures such as node crashes. The hard part is that budgets can conflict with maintenance: a budget requiring all replicas blocks drains forever, and a single-replica workload cannot be both protected and movable.",
    k: ["Strict budget versus permissive: strict protects availability during maintenance, but can stall drains and upgrades indefinitely.", "Percentages versus absolute numbers: percentages adapt as replicas scale, while absolute numbers are predictable but go stale after resizing."],
    p: ["A budget set to allow zero disruptions blocks node upgrades until someone edits it.", "Teams assume budgets protect against node failures, but they only govern voluntary evictions."],
    v: "Set a budget allowing one unavailable out of three. Issue two evictions together and confirm the first succeeds, the second is rejected until the replacement is ready, and a node crash is unaffected by the budget.",
    dep: ["workload-unit", "api-server", "node-drain-and-maintenance"]
  },
  "requests-and-limits": {
    s: "Per-container declarations of the resources it needs to be scheduled and the maximum it may use, which drive placement, throttling, eviction order and cost.",
    d: "Requests are what the scheduler reserves on a node and what proportional CPU shares are based on. Limits are enforced by the runtime through cgroups: CPU above the limit is throttled, memory above it triggers an out-of-memory kill. The ratio between requests and limits sets the quality-of-service class. Defaults and bounds can be imposed per namespace. The hard part is estimation: low requests overcommit nodes and cause noisy neighbors, while generous ones strand capacity.",
    k: ["Limits equal to requests versus limits above: equal gives predictable guaranteed behavior, while burstable allows higher utilization at the risk of eviction.", "CPU limits versus none: limits prevent noisy neighbors, but throttle latency-sensitive programs even when the machine is idle."],
    p: ["Memory limits below real peak use cause repeated out-of-memory kills that look like application crashes.", "Requests copied from a template across services leave nodes full on paper and idle in practice."],
    v: "Run a container with a 256 MiB memory limit that allocates 512 MiB. Confirm it is killed with an out-of-memory reason, and that a CPU-limited busy loop shows throttled periods in its cgroup statistics.",
    dep: ["qos-and-cgroups", "quotas-and-limits", "filtering"]
  },
  "reconciliation-loops": {
    s: "The core pattern: a loop observes current state, compares it with the declared state, and takes the smallest action that moves one toward the other, then repeats.",
    d: "Each controller watches the resource types it cares about, and for each changed object computes what should exist, reads what does exist and creates, updates or deletes to close the gap. It writes observed results to the object's status. A loop is triggered by events and by periodic resync, and runs again until nothing is left to do. It never remembers what happened, only what is. The hard part is making each step safe to repeat, partially applied and interleaved with other controllers.",
    k: ["Continuous reconciliation versus one-shot command execution: reconciliation heals drift and survives restarts, at the cost of constant background work and indirect, delayed effects.", "One narrow loop per concern versus one large controller: narrow loops are testable and independently failing, but their combined behavior emerges from interaction."],
    p: ["A reconcile that is not idempotent creates duplicates every time it re-runs after a crash.", "Two loops with different ideas of correct state keep overwriting each other indefinitely."],
    v: "Kill a controller halfway through creating five objects, restart it, and confirm it ends with exactly five. Then delete one by hand and confirm it is recreated without any event other than the watch notification.",
    dep: ["informers-and-caches", "work-queues", "desired-vs-observed-state", "level-triggered-logic"]
  },
  "level-triggered-logic": {
    s: "The design rule that a controller acts on the current state of an object, not on the sequence of events that led there, so a missed event never causes a missed action.",
    d: "An edge-triggered handler reacts to an event such as created or scaled and breaks if the event is lost or arrives twice. A level-triggered one, upon any signal, re-derives what is needed from the full current picture. Events become just hints to look again. Periodic resync covers dropped hints. This makes controllers robust to restarts, reordering and coalescing of events. The hard part is discipline: carrying state across handler calls in memory, or inferring intent from the type of change, reintroduces edge behavior.",
    k: ["Recompute from full state versus react to deltas: recomputation is robust to loss and duplication, but costs more per event and requires state to be fully observable.", "Coalesced events by object key versus an ordered event log: coalescing bounds work under bursts, but handlers lose the history of intermediate states."],
    p: ["A handler that acts only on a delete event leaves orphaned resources when the event is missed during a restart.", "Keeping a local counter of what was done diverges from reality after any crash."],
    v: "Stop a controller, create and delete the same object three times, then start it. Confirm it ends in the state matching the final object alone, without replaying the intermediate steps.",
    dep: ["reconciliation-loops", "informers-and-caches", "work-queues"]
  },
  "informers-and-caches": {
    s: "A client-side component that lists a resource type once, then follows a watch to maintain a local, indexed copy that controllers read instead of querying the server.",
    d: "It performs an initial list, records the version, opens a watch from there and applies each added, modified or deleted event to a local store, with indexes by namespace or label. Handlers are notified and enqueue keys. If the watch breaks or the version is too old, it relists. Many controllers in one process share one informer per type. The hard part is memory and staleness: caches hold every object of the type, and reads reflect only what has arrived, so read-your-own-write is not guaranteed.",
    k: ["Local cache reads versus direct API reads: caches remove nearly all read load from the server, but can be seconds stale and consume memory proportional to object count.", "Shared informers versus one per controller: sharing cuts server watches and memory, but couples controllers to one cache's lifecycle."],
    p: ["A controller reading its own just-created object from the cache finds nothing and creates it again.", "Caching full objects of a huge type, such as every unit and secret, exhausts the controller's memory."],
    v: "Create an object, then restart the controller's watch connection by blocking network for one minute. Confirm the cache resyncs from a relist, ends identical to the server's list, and handlers see no lost final state.",
    dep: ["watch-streams", "resource-versions", "api-server"]
  },
  "work-queues": {
    s: "A queue between event handlers and workers that deduplicates keys, limits concurrency per key and retries failures with exponential backoff.",
    d: "Handlers add the namespace and name of changed objects. The queue collapses repeated adds of a key still waiting, ensures one key is never processed by two workers at once, and re-adds a key later when processing returns an error, with increasing delay and an overall rate limit. A fixed number of workers pull from it. The hard part is tuning: too little backoff hammers the API during failures, too much delays recovery, and a poison object can retry forever and hide other problems.",
    k: ["Deduplicate by key versus process every event: deduplication bounds work under bursts and fits level-triggered logic, but intermediate states are never seen.", "Exponential backoff with a cap versus fixed retry interval: backoff protects dependencies in failure, but can leave recovered objects waiting at the maximum delay."],
    p: ["An object that always fails keeps cycling at the maximum delay and masks real problems in logs and metrics.", "Too few workers let one slow reconcile starve everything else in the queue."],
    v: "Make one object fail permanently while changing others. Confirm others reconcile promptly, the failing key's retry delay grows to its cap, and queue depth and retry metrics reflect it.",
    dep: ["informers-and-caches", "level-triggered-logic"]
  },
  "controller-manager": {
    s: "The process that hosts the built-in controllers together, giving them shared credentials, caches, leader election and configuration.",
    d: "One binary starts dozens of controllers, such as replication, deployment, namespace cleanup, endpoints, node lifecycle, volume binding and garbage collection, each with its own queues and workers but sharing informers and API clients. Each can use a separate service account. A cloud-specific variant is split out so it can be released independently. Running several copies for availability uses leader election so that only one set of loops is active. The hard part is that failure or slowness in one controller must not stall the others sharing the process.",
    k: ["All controllers in one process versus separate processes: one process shares caches and simplifies deployment, but couples release and failure.", "Per-controller service accounts versus one broad identity: separate identities limit blast radius, at the cost of more roles to define and audit."],
    p: ["A panic in one controller restarts the process and briefly pauses all other loops.", "Cluster-wide permissions on the shared identity let any controller bug modify unrelated resources."],
    v: "Stop the active controller manager among three replicas. Confirm another acquires leadership within the lease duration and loops resume, and that no object is created twice during the handover.",
    dep: ["leader-election", "informers-and-caches", "reconciliation-loops", "service-accounts"]
  },
  "leader-election": {
    s: "A protocol ensuring only one replica of a control-plane component, such as the scheduler or controller manager, is active at a time while others wait as standbys.",
    d: "Replicas compete to create or renew a lease object in the API, recording holder identity and renew time. The holder renews before the duration expires and stops work if it fails to; others take over once it lapses. It relies on the store's atomic compare-and-update. The hard part is clocks and pauses: a leader that pauses for longer than the lease may wake still believing it leads, so safety relies on fencing in write conflict detection, not on timing alone.",
    k: ["Lease with renew deadline versus continuous heartbeat to a coordinator: leases are simple on top of the existing store, but failover time is bounded below by the duration.", "Short versus long lease duration: short fails over fast but flaps under API slowness, while long is stable but extends the gap."],
    p: ["A leader paused by garbage collection resumes and acts after another replica has taken over.", "API server slowness makes renewals miss their deadline, so leadership flaps and work repeatedly restarts."],
    v: "Freeze the active replica's process for longer than the lease duration. Confirm a standby takes over, and that the frozen replica on resume stops acting, with no conflicting writes accepted.",
    dep: ["leases", "resource-versions", "api-server"]
  },
  "owner-references": {
    s: "Metadata on an object naming the object that owns it, which lets the system track dependency and delete children automatically when the owner goes away.",
    d: "A child lists its owner's kind, name and unique id. A flag marks the owning controller, so only one controller manages it, and another controls whether deleting the owner blocks on the child. Controllers use the reference to adopt orphans and to find their own children. The garbage collector uses it to delete dependents. Owners and dependents must be in the same namespace, or the owner cluster-scoped. The hard part is the ownership graph: a wrong or missing reference either leaks resources or deletes something still wanted.",
    k: ["Controller owner reference versus label-only association: references give a single authoritative parent and automatic cleanup, but labels allow loose grouping without deletion semantics.", "Unique id in the reference versus name only: the id prevents a recreated same-named owner from inheriting old children, at the cost of children orphaned by recreation."],
    p: ["Recreating a parent object by hand orphans or deletes all its children because the id changed.", "A missing reference leaves volumes and services behind long after the workload is gone."],
    v: "Create a controller-managed object with children, inspect a child's metadata for the owner reference, then delete the owner with cascading and confirm every child with that reference is removed.",
    dep: ["resource-model", "garbage-collection"]
  },
  "garbage-collection": {
    s: "The controller that deletes objects whose owners no longer exist, with foreground, background and orphan modes for choosing what happens to dependents on deletion.",
    d: "It builds a graph of owner references from watching all resource types. When an owner is deleted it removes dependents according to the mode: background deletes the owner at once and children afterward; foreground marks the owner deleting and removes it only after blocking children are gone; orphan strips the references and leaves children. It also runs periodically for dead references. The hard part is cost and correctness at scale: the graph covers every type, and a cluster with huge object counts or unavailable custom types can delay collection.",
    k: ["Background versus foreground cascading: background returns quickly, while foreground guarantees the owner remains until dependents have finished.", "Collect on owner absence versus explicit delete of children: automatic collection prevents leaks, but one wrong reference deletes live resources."],
    p: ["An unavailable aggregated API makes the collector unable to verify owners and stall deletion cluster-wide.", "Deleting a namespace's owner cascades to volume claims and takes data with it."],
    v: "Delete a deployment in each mode with a slow-terminating child. Confirm background removes the parent immediately, foreground keeps it until children are gone, and orphan leaves children running with no owner reference.",
    dep: ["owner-references", "finalizers", "informers-and-caches", "api-server"]
  },
  "finalizers": {
    s: "Keys on an object that block its actual removal until the controller that owns each key finishes cleanup and removes it, enabling safe external teardown.",
    d: "Deleting an object that has finalizers only sets a deletion timestamp. The object stays visible while each owning controller sees the timestamp, releases external resources such as cloud disks or load balancers, and removes its key. When the list is empty the API removes the object. The pattern lets declarative deletion drive imperative cleanup. The hard part is stuckness: if the controller is gone or buggy, the object stays terminating forever, and operators are tempted to strip the key by hand and leak the external resource.",
    k: ["Finalizer-gated deletion versus immediate delete with best-effort cleanup: gating guarantees cleanup ran, but a broken controller blocks deletion indefinitely.", "Single finalizer per controller versus shared: separate keys make ownership clear and cleanups independent, but lengthen the list that must drain."],
    p: ["Uninstalling an operator before deleting its resources leaves objects terminating forever, with nobody to clear their keys.", "Forcibly removing a finalizer leaks the cloud resource it protected."],
    v: "Delete an object with a finalizer while its controller is stopped. Confirm it remains with a deletion timestamp. Start the controller and confirm it cleans up the external resource and the object is then removed.",
    dep: ["resource-model", "reconciliation-loops", "api-server"]
  },
  "node-lifecycle-controller": {
    s: "The controller that watches node heartbeats, marks silent nodes unhealthy, applies taints and drives the eviction of their workloads at a controlled rate.",
    d: "Each node's agent renews a lease and posts status. When updates stop for a grace period, the controller sets the node's ready condition to unknown and adds not-ready and unreachable taints. Workloads without matching tolerations are then evicted after their toleration time. If too many nodes in a zone are unhealthy, the controller reduces or stops evictions, assuming a network partition rather than mass failure. The hard part is distinguishing a dead node from a partitioned one, since evicting units that are still running risks duplicates.",
    k: ["Taint-based eviction with per-workload grace versus a global node timeout: per-workload tolerations let stateful work wait longer, but add more configuration to get right.", "Slowing evictions during large outages versus acting normally: slowing avoids a self-inflicted stampede on a partition, but delays recovery in real failures."],
    p: ["A control-plane network partition makes healthy nodes look dead, and workloads are evicted needlessly.", "Replacement units start while the originals still run on a partitioned node, giving two copies at once."],
    v: "Cut network access from one node to the API server. Confirm the node turns unknown after the grace period, receives taints, and its workloads are evicted after their toleration seconds and rescheduled elsewhere.",
    dep: ["leases", "taints-and-tolerations", "node-registration-heartbeat", "reconciliation-loops"]
  },
  "horizontal-autoscaler": {
    s: "A controller that changes the replica count of a workload controller to hold a metric such as CPU or request rate near a target.",
    d: "On an interval it reads metrics for the target's units, computes desired replicas as current times the ratio of observed to target value, applies tolerance, stabilization windows and rate limits, and writes the result into the target's scale subresource. It supports resource, custom and external metrics, and a minimum and maximum. The hard part is dynamics: metric delay, slow startup and readiness lag make it oscillate or overshoot, and missing metrics must not be read as zero load.",
    k: ["Short versus long stabilization windows: short reacts quickly to spikes, but flaps, while long smooths replica counts and keeps capacity while load falls.", "Utilization relative to requests versus absolute metric values: relative values are easy to set but depend on requests being accurate."],
    p: ["Requests set far too high or low make CPU-percent targets meaningless and scaling wrong.", "Scaling on CPU for a workload bound by a downstream database adds replicas that make the problem worse."],
    v: "Apply a step in load to a workload with a target of fifty percent. Confirm replicas rise to the computed value in bounded steps, hold through brief dips, and fall only after the stabilization window.",
    dep: ["resource-metrics-pipeline", "replicated-sets", "requests-and-limits", "reconciliation-loops"]
  },
  "vertical-autoscaler": {
    s: "A component that observes actual resource use over time and recommends or applies new requests and limits for a workload's containers.",
    d: "A recommender aggregates historical usage into percentiles with a safety margin, an updater evicts units whose requests deviate far from the recommendation, and an admission hook injects the recommended values into replacement units. Recommendation-only mode just reports. Resizing in place without a restart is limited by what the runtime and cgroups allow. The hard part is that changes need a restart for most workloads, and combining it with a horizontal autoscaler on the same metric makes them fight.",
    k: ["Recommend-only versus automatic apply: recommend-only is safe and teaches right sizing, while automatic keeps up with change but evicts units to apply it.", "Percentile-plus-margin sizing versus peak sizing: percentiles save resources, but a rare spike can then trigger a kill."],
    p: ["Automatic eviction of the only replica causes downtime each time it resizes.", "Using it together with a horizontal autoscaler on CPU leads to constant oscillation."],
    v: "Run a workload with deliberately oversized requests and recommend-only mode on. Confirm the recommendation converges near observed usage plus margin and no unit is restarted until apply mode is enabled.",
    dep: ["resource-metrics-pipeline", "requests-and-limits", "admission-webhooks", "workload-unit"]
  },
  "cluster-autoscaler": {
    s: "A controller that adds machines when workloads cannot be scheduled for lack of capacity and removes under-used machines whose workloads can be placed elsewhere.",
    d: "It watches for units that are unschedulable due to resources, simulates adding a node from each configured group to see which would help, and requests that group to grow. It periodically checks nodes with low utilization, simulates evicting their units elsewhere and removes those safe to delete after a delay. It respects disruption budgets and annotations that block removal. The hard part is lag and simulation fidelity: machines take minutes to join, and its model of scheduling must match the real scheduler's constraints.",
    k: ["Scale up on pending units versus predictive scaling: reacting to pending units is simple and accurate, but users wait for machine boot, so some keep spare headroom.", "Aggressive versus conservative scale-down: aggressive saves cost, but churns workloads and can scale in just before demand returns."],
    p: ["Units with local storage or restrictive budgets pin nodes and stop scale-down entirely.", "Scale-up for a unit that no machine type could ever fit repeats forever without effect."],
    v: "Create more replicas than capacity allows. Confirm the autoscaler adds a node, pending units schedule onto it, and after load is removed an idle node is drained and deleted after the configured delay.",
    dep: ["scheduling-cycle", "disruption-budgets", "cloud-provider-interface", "node-drain-and-maintenance"]
  },
  "resource-metrics-pipeline": {
    s: "The path that collects CPU and memory usage from node agents and serves it through a standard API for autoscalers, dashboards and top-style commands.",
    d: "Each node agent exposes per-container usage from its runtime and cgroups. A cluster-level collector scrapes every node on an interval, keeps only the latest points in memory and registers an aggregated API for current usage. A separate adapter can expose custom or external metrics from a monitoring system through similar APIs. It is for control decisions, not history. The hard part is staleness and gaps: scrape intervals delay scaling decisions, and a scrape failure makes metrics disappear for autoscalers.",
    k: ["In-memory latest-values collector versus a full time-series store for control: in-memory is light and fast, but offers no history and loses data on restart.", "Aggregated API versus a separate metrics endpoint: aggregation gives autoscalers a stable standard interface, but ties them to the collector's availability."],
    p: ["Missing metrics after a collector restart cause autoscalers to hold or misbehave until data returns.", "Scrape intervals of tens of seconds mean autoscaling lags short traffic spikes."],
    v: "Run a CPU-burning workload and query the metrics API. Confirm the reported usage matches the runtime's own cgroup measurement within the scrape interval, and that stopping the collector makes the API return unavailable.",
    dep: ["node-agent", "aggregated-api-servers", "qos-and-cgroups"]
  },
});
