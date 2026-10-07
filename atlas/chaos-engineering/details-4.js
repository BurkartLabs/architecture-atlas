// Details for the chaos engineering plate, part 4: injection mechanisms and cross-cutting concerns.
ATLAS.details("chaos-engineering", {
  "host-agent": {
    s: "A small privileged program on each target host that receives fault instructions from the control plane, applies them locally, reports status and removes them on expiry.",
    d: "The agent runs as a service on the host or in a privileged container. It holds a list of active faults with their end times, applies each through the right mechanism, such as traffic control, resource limits, signals or stress workers, and reports back. It persists its state so that a restart can resume cleanup. It must have minimal footprint and must not be a victim of its own faults. It is hard because it has broad power on production machines, so its code, permissions and update path are security-critical.",
    k: ["Persistent agent vs agent started on demand: persistent is ready instantly and can enforce expiry; on demand has no standing footprint but needs a way to start safely.", "Agent applies faults itself vs calls other tools: applying itself gives control and verification; calling tools reuses well-known utilities but is harder to clean up reliably."],
    p: ["An agent affected by its own CPU or network fault cannot receive the stop command.", "Agents running old versions apply faults with different semantics from the control plane's expectation."],
    v: "Apply a fault, restart the agent, and confirm it reloads the active fault list, continues enforcing the expiry and removes the fault on time, as seen on the host and in the audit log.",
    dep: ["agent-registration","command-channel","privilege-model","fault-expiry"]
  },
  "agent-registration": {
    s: "How agents announce themselves, prove their identity and tell the control plane what host they are on, what they can do and which labels apply.",
    d: "At startup an agent authenticates with a credential, sends its host identity, environment, labels, capabilities and version, and receives its configuration. The control plane keeps an inventory of live agents used by the target selector. Agents refresh their registration regularly, and stale ones are removed. It is hard because identity must be bound to the real host: an agent that can claim any environment label could be told to take part in the wrong experiment.",
    k: ["Self-reported labels vs labels taken from the infrastructure: self-reported are easy but forgeable; infrastructure-sourced labels are authoritative but need integration.", "Pre-shared token vs instance identity: tokens are simple to roll out; instance identity cannot be copied between hosts."],
    p: ["A cloned machine image registers twice with the same identity, and faults go to the wrong host.", "Agents never expired from the inventory are selected as targets though the host is gone."],
    v: "Start a new host with an agent and confirm it appears in the inventory with correct environment and labels within the registration interval, and disappears after being stopped past the timeout.",
    dep: ["privilege-model","access-control"]
  },
  "command-channel": {
    s: "The authenticated, encrypted connection over which the control plane sends fault instructions and receives acknowledgments, status and heartbeats.",
    d: "Agents typically open an outbound connection to the control plane, so hosts need no inbound ports. Commands carry the fault, parameters, expiry and a signature or token; agents acknowledge receipt, application and removal. Heartbeats show liveness. Messages are idempotent so a repeat does not apply a fault twice. It is hard because the channel shares fate with the network faults it carries: a partition test can cut the channel that was to heal it.",
    k: ["Agent pulls commands vs control plane pushes: pull works through firewalls and scales simply; push gives faster abort but requires reachable agents.", "Same network path as application traffic vs a separate management path: separate survives network faults; sharing is simpler but fragile."],
    p: ["Commands that are not signed let anyone on the network inject faults.", "At-least-once delivery without idempotence applies the same fault twice."],
    v: "During a network fault on application traffic, send a stop command and confirm the agent acknowledges it within the timeout, and replay the same command to confirm no double application.",
    dep: ["privilege-model","agent-registration"]
  },
  "privilege-model": {
    s: "The set of rights granted to agents and drivers, restricted to what each fault type needs, with controls over who can ask for them.",
    d: "Faults need powers such as changing network rules, signaling processes and limiting resources. The agent holds those through narrow capabilities rather than full administrator rights where possible, and rejects fault types it is not configured for. Commands are checked against policy at the agent as well as the control plane. Credentials for cloud actions are scoped by role and time. It is hard because the useful faults require powerful rights, and the agent is an attractive target for attackers.",
    k: ["Narrow capabilities per fault vs full administrator rights: narrow limits damage from compromise or bugs; full rights are simpler and let every fault work everywhere.", "Policy checked at the agent too vs only at the control plane: agent checks protect against a compromised control plane; they need policy distribution."],
    p: ["An agent with administrator rights on every host is a single compromise away from fleet-wide outage.", "Long-lived cloud credentials left on hosts outlast the experiment program."],
    v: "Ask an agent to apply a fault type it is not allowed: it refuses and logs the denial, and a credential scoped to one environment fails when used on another.",
    dep: ["access-control"]
  },
  "sidecar-injector": {
    s: "Adds a fault-injection helper container or process alongside a workload, so faults can be applied inside its network and process space without changing the application.",
    d: "On deployment or on request, a controller adds a helper container to a workload's group, sharing its network and, if allowed, its process space. The helper can apply traffic faults, run stress inside the same resource limits and signal processes. It is removed afterward. This gives per-workload control without host privileges. It is hard because adding a container may restart the workload and change its behavior, and the helper's own resource use counts against the workload.",
    k: ["Always-present helper vs injected on demand: always-present is ready quickly but costs resources and widens the attack surface; on demand is lean but adds a deployment step.", "Share the target's resource limits vs separate limits: sharing is realistic; separate limits keep the helper from distorting results."],
    p: ["Injecting the helper triggers a restart, so the experiment measures the restart, not the fault.", "A helper left in a workload after a failed cleanup continues to hold privileges."],
    v: "Inject the helper into a running workload and confirm it can apply a network fault inside the workload's network space only, with neighbors unaffected, then confirm removal leaves the workload's definition unchanged.",
    dep: ["cluster-operator","privilege-model"]
  },
  "cluster-operator": {
    s: "A controller inside a container cluster that turns experiment resources into actions on workloads: kills, evictions, network rules and resource changes.",
    d: "The operator watches experiment objects declared in the cluster, resolves targets through labels and namespaces, and applies faults by calling the cluster's interface or by driving helper agents. It records status on the objects and cleans up when they are deleted or expire. Using cluster permissions, it can be limited to certain namespaces. It is hard because the cluster's own controllers fight the fault: a deleted instance is replaced, a changed limit is reverted, and the operator must account for that.",
    k: ["Experiments as cluster resources vs an external control plane: resources fit existing tooling and permission models; an external plane works across environments and clusters.", "Namespace-scoped operator vs cluster-wide: namespace-scoped limits the damage; cluster-wide can test shared infrastructure but needs strict guards."],
    p: ["An operator with cluster-wide rights is a powerful way to damage all workloads if misconfigured.", "Deleting the experiment resource without cleanup logic leaves faults behind."],
    v: "Create an experiment resource targeting a labeled group, confirm only those workloads are affected, delete the resource and confirm every fault is removed and the status reports completion.",
    dep: ["privilege-model","fault-expiry","target-selector"]
  },
  "cloud-api-driver": {
    s: "Applies infrastructure faults through the cloud provider's control interface: stopping instances, detaching volumes, changing routes and security rules, and altering quotas.",
    d: "The driver holds scoped credentials and maps experiment steps to provider calls, such as terminate instance, detach network interface, replace route or revoke a permission. It records every change and the previous value for revert, and waits for the provider to report the new state. Rate limits and eventual consistency complicate it. It is hard because provider actions can be slow, partly successful or irreversible, and because the credentials are exactly those an attacker would want.",
    k: ["Use provider fault services vs direct calls: provider services are integrated and supported; direct calls are portable across providers and fully scriptable.", "Revert by recorded inverse vs by re-applying declared state: inverse is precise; re-applying state is robust to drift but may overwrite other changes."],
    p: ["Detaching a volume from the wrong instance because of a stale identifier causes real data unavailability.", "Provider throttling during revert delays cleanup when it is most needed."],
    v: "Apply a route change through the driver in a test account and compare the routing table before, during and after: the changes are exactly the recorded ones and the original state is restored.",
    dep: ["privilege-model","auto-revert","audit-log"]
  },
  "agent-health": {
    s: "Monitoring of agents themselves: liveness, version, applied faults, clock offset and resource use, so the platform knows what it can safely control.",
    d: "Agents send heartbeats with their active faults, version and clock reading. The control plane tracks missing heartbeats, mismatches between expected and reported faults, and agents that fail to acknowledge. An experiment may not start on targets whose agents are unhealthy, and an unhealthy agent with a fault applied raises an alert. It is hard because silence is ambiguous: a missing heartbeat may mean a dead agent, a partition or the effect of the experiment itself.",
    k: ["Strict health requirement before start vs best effort: strict avoids unknown states; best effort lets more experiments run but may leave faults the platform cannot remove.", "Heartbeat only vs heartbeat plus state reconciliation: heartbeat is cheap; reconciliation catches drift between what the platform thinks is applied and what is."],
    p: ["An experiment starts on a target whose agent died an hour ago, and no fault is applied.", "An unhealthy agent holding a fault is not noticed until the expiry sweeper runs."],
    v: "Stop one agent during a run and confirm an alert fires within the heartbeat timeout, the run is marked degraded and the platform lists the fault as unconfirmed.",
    dep: ["host-agent","command-channel"]
  },

  "proxy-fault-filter": {
    s: "A module in a request proxy that delays, fails, aborts or modifies matching requests according to rules supplied by the control plane.",
    d: "The filter sits in the data path of a proxy and evaluates each request against fault rules: match conditions, a percentage, and an action such as delay, abort with a status, reset or modify. Rules arrive through the proxy's configuration channel and expire. It records counts of faults applied for verification. It is hard because it must add negligible overhead when no fault is active, must never fail open or closed in an unsafe way, and sees only traffic that actually crosses the proxy.",
    k: ["Filter in the existing proxy vs a dedicated fault proxy: using the existing proxy adds no hop; a dedicated one isolates fault code from the production path.", "Rules pushed dynamically vs baked into configuration: dynamic allows quick abort; baked-in rules are simple and audited but slow to change."],
    p: ["A rule applied to a shared proxy affects every service behind it, not just the target.", "A fault rule that stays in configuration after cleanup keeps failing a share of traffic."],
    v: "Install a rule failing ten percent of one route, check the proxy's fault counters against client-observed failures, then remove it and see counters stop and error rates return to baseline.",
    dep: ["header-targeting","percentage-sampling","fault-expiry"]
  },
  "mesh-fault-rules": {
    s: "Fault policies expressed in a service mesh's routing configuration, applied by every sidecar proxy to calls between selected services.",
    d: "A mesh control plane distributes routing rules to sidecar proxies, including delay and abort policies with percentages for chosen source and destination services. This gives per-call targeting across the whole mesh with no application change and uses the same configuration system as normal traffic rules. It is hard because faults and real routing rules interact in one configuration, rule propagation takes time and is uneven across proxies, and mistakes in matching can affect the wrong services.",
    k: ["Faults in the production routing configuration vs a separate overlay: shared configuration is simple and well understood; a separate overlay avoids touching production rules but needs extra tooling.", "Apply at the caller's proxy vs the callee's: caller-side tests the caller's view; callee-side applies to every caller at once."],
    p: ["Uneven propagation means some proxies apply the fault later than others, blurring the measurement start.", "A fault rule merged into the routing configuration by a deploy persists long after the experiment."],
    v: "Apply a delay rule between two services and confirm every caller proxy shows the delay within the propagation time, other destinations are unaffected, and removal restores baseline latency.",
    dep: ["proxy-fault-filter","header-targeting"]
  },
  "header-targeting": {
    s: "Marks test requests with a header or context value so faults apply only to marked traffic, even deep in a chain of calls.",
    d: "A test client or entry proxy adds a marker; each hop forwards it in a standard context field, and fault filters apply rules only to requests carrying it, or carrying a certain percentage of markers. This allows experiments on production services with real code paths and almost no customer exposure. It requires that every service and library propagate the marker. It is hard because propagation is routinely lost at queues, thread boundaries and third-party calls, and because marked requests can be crafted by outsiders unless the edge strips them.",
    k: ["Marker set by internal test clients vs set by a sampling proxy on real users: internal markers are safe; sampled real traffic tests real impact.", "Standard propagated context vs a custom header: standard context is carried by existing libraries; a custom header is explicit but often dropped."],
    p: ["Outside clients send the marker and trigger faults on their own requests, or on each other's, if the edge does not strip it.", "A queue hop discards the marker, so downstream steps are unaffected."],
    v: "Send marked and unmarked requests through a three-hop chain: only marked ones show the fault at the target hop, and a request with a forged marker from outside the edge is stripped.",
    dep: ["proxy-fault-filter"]
  },
  "gateway-faults": {
    s: "Faults applied at the edge gateway or load balancer, such as rejected requests, slow responses or removed backends, to test client-facing behavior.",
    d: "The gateway, which sees all external traffic, can reject a share of requests, throttle, delay, return maintenance pages or remove backends from rotation. It tests client retries, front-end error pages, caching and failover between regions or pools. It is also where rate limiting and shedding are enforced, so faults can test those. It is hard because the edge is the most sensitive place to inject faults: any mistake affects everyone, so rules need very strict limits.",
    k: ["Edge faults vs internal faults: edge faults test what real users see; internal faults test dependencies and contain the effect.", "Fault a subset of users vs a subset of requests: users give consistent experiences and are easy to exclude; requests give smoother statistics."],
    p: ["A broad rule on the edge removes all backends and causes a real outage.", "Faults on the edge affect partners and automated clients that cannot handle them."],
    v: "Reject two percent of requests for an internal test user group at the gateway and confirm only that group sees errors, with the gateway's metrics matching the client-side counts.",
    dep: ["proxy-fault-filter","blast-radius-limit"]
  },
  "application-hooks": {
    s: "A small library or middleware inside the application that applies faults at defined points when the platform enables them, with no effect otherwise.",
    d: "Developers add hooks around calls to dependencies, handlers and data access. Each hook asks a local policy whether to fail, delay or alter the operation, and the policy is updated by the agent or a configuration channel. This allows faults that infrastructure cannot produce, such as a specific error value from a specific function. It is hard because the library adds code to production, so it must be extremely cheap, safe by default and impossible to enable accidentally.",
    k: ["Hooks in application code vs outside injection: hooks give precise, typed faults; outside injection needs no code change and works for any program.", "Disabled by default and enabled per experiment vs enabled in test builds only: per-experiment lets production testing happen; test-only builds keep production code free of the risk."],
    p: ["A hook enabled by a configuration typo fails real requests.", "Hooks that diverge across languages and teams behave differently under the same experiment."],
    v: "With no experiment active, measure the added latency of the hooks on a hot path and confirm it is below the stated limit; then enable one fault and confirm only that call site is affected.",
    dep: ["command-channel","access-control"]
  },

  "traffic-shaping": {
    s: "Operating system facilities that queue, delay, drop, reorder or rate-limit packets on an interface, used to create network faults without touching applications.",
    d: "Packet scheduling disciplines attached to an interface or a class of traffic add delay, loss, duplication, corruption and bandwidth limits. Filters choose traffic by address, port or marker. Firewall rules complement them by dropping or rejecting matching packets. They work for any program on the host. They are hard to use safely: rules are global state on the host, apply to outgoing traffic more easily than incoming, and a mistaken filter can cut the host off from the network.",
    k: ["Egress shaping only vs also shaping ingress: egress is simple and reliable; ingress needs redirection tricks but tests how a server sees a bad network.", "Match by address vs by process or marker: address is easy; process or marker matching is more precise but needs kernel support."],
    p: ["A rule with a broad filter drops the management connection, so the host is unreachable and cannot be repaired remotely.", "Rules left on an interface survive agent restarts and keep degrading traffic."],
    v: "Add a delay rule for one destination address, measure round-trip time to it and to another destination, then remove it and check the interface's rule list is the same as before.",
    dep: ["namespace-entry","privilege-model"]
  },
  "cgroup-limits": {
    s: "Resource groups that cap or share processor, memory, I/O and process count for a set of processes, used to create resource faults that stay inside the target's boundary.",
    d: "The kernel organizes processes into groups with limits and accounting. The platform lowers the limits of the target's group to throttle processor time, cap memory, restrict I/O bandwidth or limit the number of processes. This confines the fault to the target and produces realistic behavior such as throttling and out-of-memory kills. Original values are saved and restored. It is hard because container runtimes and orchestrators manage the same settings and may overwrite or fight the changes.",
    k: ["Change the limits of the target's group vs add a competing group: changing limits is precise; a competing group models a noisy neighbor with the original limits intact.", "Hard limit vs soft limit: hard limits give predictable failure; soft limits give gradual degradation and are closer to contention."],
    p: ["The orchestrator reapplies its configured limits and silently undoes the fault.", "Setting memory limit below current use kills the process immediately, which tests nothing about gradual pressure."],
    v: "Lower a group's processor quota to half, read the group's throttling counters and observe the target's latency, then restore the saved quota and see the counters stop increasing.",
    dep: ["namespace-entry","privilege-model"]
  },
  "syscall-faults": {
    s: "Intercepts system calls made by a process and makes selected ones fail, slow or return odd values, to test how software handles errors from the operating system.",
    d: "A tracing or filtering mechanism intercepts calls for file opens, reads and writes, network connects, time queries and memory allocation, and returns an error such as no space, permission denied or interrupted, or delays the call. It works on unmodified programs and finds poorly handled errors. It is hard because interception adds overhead, some mechanisms stop the whole process on each call, and error values must be realistic or the program fails in ways that real systems never would.",
    k: ["Interposition by tracing vs by filter in the kernel: tracing is flexible but slow; kernel filtering is fast but limited to what it can express.", "Fail a single call vs fail a class of calls: a single call finds one fragile path; a class shows system-wide dependence."],
    p: ["Failing a write that the program assumes cannot fail causes silent data loss.", "Heavy tracing slows the process so much that timeouts fire for reasons unrelated to the fault."],
    v: "Make file creation fail with no space for one process and confirm it logs the error, retries or degrades as designed, and does not crash or corrupt data, while other processes continue normally.",
    dep: ["namespace-entry","privilege-model"]
  },
  "kernel-probes": {
    s: "Small verified programs loaded into the kernel that observe or alter events, such as network packets or function calls, with low overhead and no change to applications.",
    d: "Probes attach to hook points in the kernel and run safe, bounded code that can drop packets, return errors from chosen functions or add delay, using shared tables for per-target rules. They allow fine-grained, low-overhead faults and also measure effects. The kernel verifies each program for safety before loading. They are hard because they depend on kernel version and available hook points, need broad privileges, and bugs in the control tooling can have wide effect.",
    k: ["In-kernel probes vs user-space proxies: probes are fast and universal on the host; proxies are portable and easier to debug but see only proxied traffic.", "Fault and measure together vs separate tools: together proves the fault was applied; separate tools avoid coupling and keep measurement independent."],
    p: ["A probe written for one kernel version fails to load or behaves differently on another.", "Probes left loaded after an experiment keep altering traffic and are invisible to normal tools."],
    v: "Load a probe that drops one percent of packets to a test port, count drops in the probe's table, compare with client-observed loss and verify the probe list is empty after unload.",
    dep: ["privilege-model","namespace-entry"]
  },
  "signal-delivery": {
    s: "Sends operating system signals, such as terminate, stop, continue or user-defined, to processes to test shutdown, pause and recovery behavior.",
    d: "The agent delivers a signal to a chosen process or group. Termination tests graceful shutdown; a forced kill tests crash behavior; stop and continue freeze a process in place without closing connections, creating a hung peer for others to detect. User-defined signals can trigger application-specific diagnostics or fault modes. It is hard because freezing a process creates states that real failures produce but few tests do, such as a node that holds its lease while not doing any work.",
    k: ["Terminate vs freeze: terminate tests restart and failover quickly; freeze tests failure detection and leases, which is harder and more revealing.", "Signal the process vs signal the whole group: one process is precise; the group also hits children and helpers and models a container kill."],
    p: ["A frozen process is resumed late, after its lease has been taken over, and then acts as a stale leader.", "Signaling by process name hits a different process with the same name."],
    v: "Freeze the leader process for twice the lease time and confirm another node takes over, the old leader stops acting when resumed and no conflicting writes occur.",
    dep: ["namespace-entry","privilege-model"]
  },
  "block-layer-faults": {
    s: "Injects delay or errors into block device operations below the filesystem, to test storage failure handling in filesystems, databases and replicas.",
    d: "A device-mapping layer or kernel fault-injection feature wraps a block device and delays, fails or drops selected reads and writes, or simulates a device that loses acknowledged writes after a simulated power cut. Software above sees what real disk failures produce. It tests filesystem recovery, database checksums and replication repair. It is hard because the faults can leave real filesystem damage, needing a throwaway volume, and because the same layer is used by the host's own storage.",
    k: ["Delay and error injection vs power-loss simulation: delay and errors test handling of live failures; power-loss simulation tests crash consistency, which is where data corruption shows.", "Wrapper on a test volume vs on a production volume: a test volume is safe; a production volume is realistic but can damage data."],
    p: ["Injecting errors on the volume holding the operating system crashes the host.", "A lost write on a database volume leaves corruption that survives the experiment."],
    v: "Wrap a scratch volume, fail one percent of writes, run a database workload with checksums and confirm errors are detected and reported, then unwrap and verify the volume with a filesystem check.",
    dep: ["namespace-entry","privilege-model"]
  },
  "namespace-entry": {
    s: "Entering a target's isolated view of the network, processes or filesystem so that a fault applies to that container only and not to its neighbors or the host.",
    d: "Containers use separate network, process, mount and resource namespaces. The agent or helper joins the target's namespace, then applies network rules, signals or probes inside it. This confines faults to the target without touching the host's own interfaces. It works with runtimes by finding the target's namespace handles from the runtime interface. It is hard because getting the right namespace requires the runtime's cooperation, and entering namespaces needs high privileges and care about which one a command runs in.",
    k: ["Enter the namespace from outside vs run a helper inside it: entering from outside needs no change to the workload; a helper inside is simpler and holds fewer host privileges.", "Per-container targeting vs per-host targeting: per-container isolates the effect; per-host tests host-wide failure."],
    p: ["A rule applied in the host namespace by mistake affects every container on the machine.", "A restarted container gets a new namespace, so the rule remains on the old one and the fault silently ends."],
    v: "Apply a delay rule inside one container's network namespace and confirm that only that container's traffic is delayed, while a neighbor and the host's own traffic are unchanged.",
    dep: ["privilege-model"]
  },

  "safety-before-realism": {
    s: "Every design choice favors the ability to stop and undo over how faithfully a fault imitates reality, because an experiment that cannot be stopped is an outage.",
    d: "The platform can only be trusted if its safety path is simpler and more independent than its injection path. Guards run apart from the system they protect. Every fault has an expiry, an inverse and a verified revert. Limits are enforced by code that experimenters cannot change in the same session. Realism comes second: a fault that is a little too gentle teaches less, while one that cannot be stopped teaches the organization to stop testing. This decision shapes the control plane, the agents, the approval flow and the metrics used for aborts.",
    k: ["Independent safety path vs shared machinery: independent costs more to build and operate but works when the injector fails; shared is simpler and fails together.", "Conservative defaults vs realistic defaults: conservative defaults make adoption safe and slow findings; realistic defaults find more but carry real risk to users."],
    p: ["Safety logic added late as extra checks inside the injector fails whenever the injector does.", "Teams bypass slow safety controls and run faults by hand, with none of the protections."],
    v: "Disable the control plane's database and message queue in a test: all active faults still end by their expiry and the kill switch still clears them, shown by target state and the agents' logs.",
    dep: []
  },
  "environment-fidelity": {
    s: "How closely the environment under test resembles production in traffic, capacity, configuration and dependencies, which decides what a passing result is worth.",
    d: "Resilience depends on details that test environments omit: real load, real data sizes, real dependency limits, autoscaling headroom and operational practices. Experiments in a faithful environment give strong evidence; experiments in a toy environment give evidence only about the toy. Production testing gets full fidelity at the cost of risk, which is why it needs the strongest guards and the smallest blast radius. This decision affects target selection, load generation, the interpretation of reports and how findings are prioritized.",
    k: ["Test in production vs in a replica: production gives real evidence and needs strict safeguards; a replica is safe but can miss the interactions that matter.", "Synthetic load vs real traffic: synthetic load is repeatable and safe; real traffic includes the surprising patterns real users produce."],
    p: ["A pass in a lightly loaded staging system is read as proof for production, which has a tenth of the headroom.", "Staging shares a dependency with production, so tests quietly cross the boundary."],
    v: "Compare staging and production on a list of fidelity factors, such as instance counts, data size and traffic shape, and record each gap next to every result so readers know what the result covers.",
    dep: []
  },
  "reversibility": {
    s: "Whether every fault can be undone completely and verifiably, and what happens to the damage that cannot be undone, such as lost data or killed instances.",
    d: "Some faults reverse simply, such as removing a delay rule. Others leave consequences: data lost on a full disk, a failed-over leader, a restarted cache that is cold, messages processed twice. The platform decides which faults to allow by their reversibility and by what residue they leave, and requires cleanup steps and checks for the rest. It shapes the fault library, the revert logic and what environments are permitted for which faults. It matters most for stateful systems.",
    k: ["Allow only fully reversible faults vs allow irreversible ones with extra controls: reversible-only is safe but never tests real data-loss handling; irreversible faults find the deepest weaknesses and need isolated environments.", "Revert by undo vs revert by rebuild: undo is quick; rebuilding from known state is robust but slow and costly."],
    p: ["An experiment that is reversible in design leaves behind queued work or stale caches that make later results misleading.", "Recovery from a destructive test is assumed to be tested but has never been run."],
    v: "After each experiment in a test environment, run a state comparison against the pre-experiment snapshot, covering configuration, data and queue depth, and list every difference and who is responsible for it.",
    dep: []
  },
  "measurement-validity": {
    s: "Whether the metrics, baselines and statistics used to judge an experiment actually measure what users experience, and remain available when the fault is applied.",
    d: "A verdict is only as good as the signal. Metrics can be delayed, sampled, aggregated away from the failing slice or lost because the fault disrupts the telemetry path. Baselines can be contaminated, and small samples can hide real effects. Validity needs outcome metrics, independent probes, controls and a rule that missing data is a failure, not a pass. It shapes the steady-state definition, the guard watcher, the evaluator and the report, and it is where most misleading chaos results originate.",
    k: ["Independent measurement vs reuse of the system's own telemetry: independent measurement survives faults but costs more to build; reuse is cheap and often fails with the system.", "Many metrics vs a few outcome metrics: many catch more effects and give more false alarms; a few are clear and may miss quiet harm."],
    p: ["An experiment declared passed because the dashboard was empty during the fault.", "Averages over all regions hide a total outage in one region."],
    v: "Run an experiment with a known failure and check each verdict path: the guard, the evaluator and the probes all report it, and removing the telemetry feed produces an abort rather than a pass.",
    dep: ["metric-ingest","synthetic-probes"]
  },
  "organizational-trust": {
    s: "The social conditions that allow chaos engineering to continue: leadership support, blameless handling of findings, advance notice and a record that experiments are safe.",
    d: "People will accept deliberate failures only if past experiments were safe, announced and productive, and if finding a weakness is treated as success. Trust is built by starting small, honoring freezes, stopping on request, and fixing what is found. One badly handled experiment can end the program. This shapes the approval flow, the incident channel, the scorecard design, the notification practices and the way findings are routed to teams. It is not technical, but every technical feature either supports or erodes it.",
    k: ["Opt-in adoption vs mandated coverage: opt-in builds willing partners and covers little; mandate spreads practice quickly and risks resentment and box-ticking.", "Blameless review vs accountability for outcomes: blameless review brings honest reports; accountability drives fixes but can lead teams to hide weaknesses."],
    p: ["An unannounced experiment that coincides with a real problem makes the program a scapegoat and gets it frozen.", "Findings that are never fixed teach teams that running experiments is pointless."],
    v: "Survey the teams that own tested services: they can state when experiments run, how to stop one and what became of the last finding, and the finding tracker shows the same history.",
    dep: ["finding-tracker","approval-workflow"]
  },
  "cost-of-experimentation": {
    s: "The cost in engineering time, spare capacity, customer risk and noise that experiments impose, set against the outages they are expected to prevent.",
    d: "Writing and reviewing experiments, running spare capacity for safe tests, building probes and fixing findings all cost money and attention. Experiments also add noise to monitoring and a small risk of customer impact. The program is worth it only where the value of a found weakness exceeds these costs, which favors testing critical services, common failure modes and fast, automated experiments. This shapes templates, continuous schedules, the choice between production and staging and how effort is directed by the coverage map.",
    k: ["Broad shallow coverage vs deep tests of critical services: broad coverage finds easy problems everywhere; deep tests find rare serious failures where they matter most.", "Automated experiments vs hand-run game days: automation is cheap per run and finds regressions; game days are expensive and train people and procedures."],
    p: ["Running low-value experiments to fill a scorecard consumes time that could have fixed known findings.", "Spare capacity needed for safe testing is cut in a cost review, and experiments are then too risky to run."],
    v: "For one quarter, list each experiment with its cost and the findings it produced: every high-cost experiment has a finding or a recorded reason for retesting, and the cheapest ones produce most of the regression catches.",
    dep: ["coverage-map","continuous-chaos"]
  },
});
