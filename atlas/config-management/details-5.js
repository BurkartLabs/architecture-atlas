// Details for the configuration management plate, part 5: agent, transport and convergence engine.
ATLAS.details("config-management", {
  "node-agent": {
    s: "A resident program on each node that requests its plan, applies it to the machine, and reports the result, so the node converges even when no operator is connected.",
    d: "The agent runs as a service, wakes on a timer or a trigger, gathers facts, requests a plan over an authenticated channel, applies it with the local engine and uploads a report. Because it runs locally with high privilege, it keeps working through network loss and can use its cached plan. It is a program that must be kept running, updated and secured on every machine. The risks are resource use, since a long run competes with the workload, and the fact that it is one of the most privileged programs on the node.",
    k: ["Resident agent vs a run launched by a scheduler: resident is simple to trigger and costs memory; scheduled launches use nothing between runs and need their own supervision.", "Agent compiles locally vs applies a server-built plan: local compilation tolerates outages and needs code on every node; server plans keep logic central."],
    p: ["The agent hangs, nothing restarts it, and the node silently stops converging for months.", "A runaway run consumes CPU on a latency-sensitive production machine."],
    v: "Stop the central server, change a managed file by hand on a test node, and confirm the agent still runs on schedule and records the failure to fetch a plan, then restores the file from its cached plan.",
    dep: ["pull-schedule", "mutual-tls-channel", "apply-loop", "run-lock"]
  },
  "pull-schedule": {
    s: "The timing by which agents check in: how often they run, how runs are spread out, and how they behave after errors or long outages.",
    d: "A typical interval is tens of minutes. Each agent runs at its own offset and backs off after failures. The interval is the upper bound on how long drift stays uncorrected and how long a change takes to propagate, and the lower bound on server load. Maintenance windows and run-once modes support nodes that must change only at certain times. It is a trade-off the operator tunes: faster means fresher and more expensive.",
    k: ["Short interval vs long interval: short gives fast convergence and heavy server load; long saves capacity and lets drift persist.", "Fixed schedule vs event-triggered runs: a schedule is predictable; events respond quickly and need a notification path."],
    p: ["A tight interval on a large fleet saturates the server, and runs slow down, which extends the interval further.", "Nodes asleep or powered off skip runs, and the report shows no drift because nothing ran."],
    v: "Record the run start times reported by a test group over a day and confirm that each node's interval matches the configured value within the allowed jitter and that none exceeded the limit.",
    dep: ["node-agent", "splay-and-jitter"]
  },
  "push-orchestrator": {
    s: "A controller that connects to chosen nodes on demand and tells them to apply configuration now, reporting results back to the operator in one place.",
    d: "The operator selects nodes and the orchestrator opens a connection to each, in parallel up to a limit, runs the plan and streams results. It requires reachability from the controller to every node and credentials for each. Push gives immediate, ordered, supervised changes, which suits deployments and one-time operations such as rolling restarts. It does not by itself correct drift between pushes, and the controller is a point whose compromise reaches everything it can connect to.",
    k: ["Push on demand vs periodic pull: push gives control and immediacy; pull gives continuous convergence and works through firewalls.", "Orchestrate in sequence vs in parallel: sequence supports rolling changes with health checks; parallel finishes faster and fails everywhere at once."],
    p: ["Nodes changed only by push drift between pushes, and nobody notices because no run happens.", "The controller's credentials grant access to every machine, and its host becomes the most valuable target."],
    v: "Push a change to a group of five test nodes with a concurrency of two, and confirm at most two are being changed at any time and that results from all five are reported together.",
    dep: ["agentless-transport", "cli-and-api", "operator-access-control"]
  },
  "agentless-transport": {
    s: "Reaches nodes over standard remote login instead of a resident agent, copying small programs to the node, running them and removing them afterward.",
    d: "The controller opens a remote shell session to each node, uploads modules or scripts, executes them with the node's interpreter, collects structured output and cleans up. Nothing runs between connections, and no agent needs installing or upgrading. It needs an interpreter on the node and credentials for access. It is hard at scale because each node needs a connection, and per-task copying and process launching are slow, so large fleets rely on connection reuse and pipelining.",
    k: ["Agentless vs resident agent: agentless needs nothing installed and no daemon to secure; an agent runs faster, works offline and keeps converging.", "Ship modules per run vs keep them on the node: shipping keeps nodes clean and costs bandwidth; keeping them is faster and leaves state to manage."],
    p: ["A node lacks the required interpreter version, and tasks fail in ways unrelated to the configuration.", "Host key verification is disabled to avoid prompts, which removes protection against impersonation."],
    v: "Run a task over the transport on a node with no agent and confirm the output is returned, nothing remains in the temporary directory afterward, and a second run produces the same result.",
    dep: ["connection-pooling", "privilege-escalation", "node-identity"]
  },
  "mutual-tls-channel": {
    s: "The encrypted connection between agent and server in which each side proves its identity with a certificate, so neither can be impersonated on the network.",
    d: "The agent presents its certificate and verifies the server's, and the connection is encrypted with TLS. The server maps the certificate to a node identity used for authorization. Certificates have lifetimes and need renewal; revocation lists or short lifetimes handle compromised ones. The channel is the base of the system's security. Typical problems are operational: expired certificates, clock skew that makes valid certificates look expired, and load balancers that terminate TLS and lose the client identity.",
    k: ["Terminate TLS at the server vs at a load balancer: at the server keeps client identity intact; at a balancer is convenient and requires passing identity on safely.", "Long certificate lifetimes vs short with automatic renewal: long is simple and risky if stolen; short limits exposure and depends on renewal working."],
    p: ["Certificates expire together, and the whole fleet stops being able to connect on the same day.", "A balancer terminates TLS, and the server trusts a forwarded header that anyone can forge."],
    v: "Present an expired certificate and a certificate for a different node from a test client and confirm the server rejects the first and authorizes the second only for its own node's data.",
    dep: ["node-identity", "clock-and-timezone"]
  },
  "connection-pooling": {
    s: "Keeps connections to nodes or servers open and reuses them across requests and tasks, so setup costs such as key exchange are paid once.",
    d: "Opening an encrypted connection costs several round trips and cryptographic work. Pooling holds sessions open and multiplexes requests over them. Agentless controllers use persistent sessions per node during a run, and agents reuse connections to the server within a run. It is essential for speed at scale. The risk is stale connections: a session dropped silently by a firewall or a node reboot looks alive until the next use, then fails, so keepalives and retries are required.",
    k: ["Long-lived pooled connections vs fresh connections per task: pooled is fast and has stale-connection failures; fresh is slow and always current.", "Large pools vs small: large pools increase parallelism and file descriptor use; small pools are gentle on the server."],
    p: ["A firewall drops idle sessions without telling either end, and the next task hangs until a timeout.", "A pool is shared across privilege levels, and a task runs with a stronger session than intended."],
    v: "Run twenty tasks against one node and confirm from connection logs that one session served them all, then drop the session mid-run and confirm the next task reconnects and completes.",
    dep: ["mutual-tls-channel", "timeouts-and-cancellation"]
  },
  "agent-self-update": {
    s: "The means by which the agent itself is upgraded across the fleet, usually by declaring the agent package as a managed resource and restarting it safely.",
    d: "The configuration system manages its own agent: a package resource sets the version, and a service resource restarts it. The running agent replaces itself during a run, so the restart must not kill the run midway or leave the node without a working agent. Version skew between agents and servers must be supported for a period, since upgrades roll out gradually. A bad agent release that cannot start is the worst failure, because the tool needed to fix it is the one that broke.",
    k: ["Manage the agent through the system vs update it by a separate process: self-management keeps one mechanism; a separate process can repair an agent the system cannot.", "Pin the agent version vs follow the latest: pinning controls rollout; following latest gets fixes and surprises."],
    p: ["A faulty agent version fails at start-up on every node, with no running agent left to roll it back.", "A new agent speaks a protocol the older servers do not understand, and runs fail during the rollout."],
    v: "Upgrade the agent on a test node through the system, and confirm the new version reports on the next run, then break the new package and confirm a recovery path restores a working agent.",
    dep: ["package-provider", "service-provider", "batched-rollouts"]
  },
  "run-triggers": {
    s: "Ways to start a run right now rather than waiting for the schedule: a message from the server, a local command, a signal, or an event such as boot.",
    d: "Agents can listen for a trigger message through a persistent connection or message bus, accept a local command from an operator, or run at boot and after network changes. Triggers support urgent fixes, deployment tooling and post-provision convergence. They compete with scheduled runs, so the agent must serialize them. The difficulty is control: unauthenticated or overly easy triggers allow an attacker or a mistake to force fleet-wide runs, and a trigger storm creates the same load spike that splay prevents.",
    k: ["Server-initiated triggers vs agents polling faster: server triggers are immediate and need an inbound or persistent channel; faster polling needs nothing new and costs load.", "Trigger runs a full convergence vs a limited set of tags: full is safe and heavy; limited is quick and risks partial state."],
    p: ["A deploy script triggers every node at once and defeats splay, saturating the server.", "A trigger arrives while a run is in progress and starts a second overlapping run."],
    v: "Trigger a run on a test node while its schedule is idle, and confirm it starts within seconds, then trigger twice quickly and confirm the second does not overlap the first.",
    dep: ["node-agent", "run-lock", "operator-access-control"]
  },
  "run-lock": {
    s: "A guard that ensures only one convergence run executes on a node at a time, even when a schedule, a trigger and an operator command overlap.",
    d: "The agent takes a lock file or system lock when a run begins and releases it on completion, with a record of the process holding it. A second run either waits, skips or exits with a message. The lock also protects shared resources such as the package database from concurrent change. The difficulty is staleness: a run that crashes leaves the lock behind, so the lock must record a process identity and expire, or the node is stuck forever.",
    k: ["Skip when locked vs wait for the lock: skipping avoids queues and loses the requested run; waiting honors it and can build up backlog.", "Lock file vs OS-level lock: a file is visible and can be left stale; OS locks release on crash and are less transparent."],
    p: ["A crashed run leaves the lock behind, and every following run reports that a run is in progress.", "Two different tools both manage the package database and each lacks the other's lock."],
    v: "Start a long run, attempt a second run, and confirm the second exits with a clear message naming the first, then kill the first and confirm the next run proceeds without manual cleanup.",
    dep: ["local-cache-and-state"]
  },
  "resource-abstraction": {
    s: "The common model that treats every managed thing as a resource with a type, a current state that can be read, a desired state, and an operation to change one into the other.",
    d: "A resource type defines attributes, which of them identify an instance, and how to read and write each. The engine works only against this interface, so files, packages, users and custom things all follow the same cycle. This uniformity is what allows reporting, dry runs and dependency handling to work across everything. It is hard because the real world is not tidy: some things cannot be read without a side effect, some attributes interact, and some changes cannot be undone.",
    k: ["A uniform resource interface vs bespoke handling per type: uniform gives common reporting and dry runs; bespoke handling suits odd cases and loses shared behavior.", "Fine-grained attributes vs one whole-resource state: fine-grained gives precise change reports; whole-resource is simpler and coarse."],
    p: ["A resource type cannot read its state without changing something, so its dry run is not really a dry run.", "Two resource types manage the same underlying object, and each undoes the other."],
    v: "Inspect a test resource of each type through the engine's read interface and confirm that all report current values in the same structure, without altering the node.",
    dep: ["provider-selection"]
  },
  "state-comparison": {
    s: "Reads each resource's actual state and decides, attribute by attribute, whether it matches the desired state, producing the list of differences to correct.",
    d: "For each resource the provider reads the real value and the engine compares it to the target, using type-aware rules: modes compared as numbers, content by checksum, lists with or without ordering. Only differing attributes are changed. Correct comparison is what makes runs idempotent. Mistakes here create endless changes or missed ones: a comparison that treats equivalent forms as different, such as quoted and unquoted values, reports a change on every run.",
    k: ["Compare by checksum vs by full content: checksums are cheap for large files; full content allows a readable diff and costs memory.", "Normalize values before comparing vs compare literally: normalizing avoids false changes; literal comparison is simple and noisy."],
    p: ["Equivalent values in different forms compare as unequal, and a resource reports a change on every run.", "A comparison ignores an attribute, so a manual edit to it is never noticed."],
    v: "Run convergence twice on a test node and confirm the second report shows zero changes, then alter one attribute by hand and confirm only that attribute is reported as different.",
    dep: ["resource-abstraction", "filesystem-semantics"]
  },
  "apply-loop": {
    s: "Walks the ordered plan, and for each resource whose state differs from the desired state performs the change, records the outcome, and handles dependencies and failures.",
    d: "The loop takes resources in dependency order, reads their state, skips those already correct, applies changes through providers, then verifies and records the result. It triggers notifications to dependents and skips resources whose dependencies failed. The loop is the heart of the agent and mostly serial, because ordering matters. It is hard because changes can partly succeed, can alter the machine's ability to continue, such as a network change, and need to leave a clear record of exactly what was done.",
    k: ["Serial application vs parallel where the graph allows: serial is predictable and slow; parallel is faster and makes failures and logs harder to read.", "Verify after each change vs trust the provider: verification catches silent failures and doubles reads; trust is faster and wrong when providers err."],
    p: ["A change to network settings cuts the connection mid-run and the report never reaches the server.", "A provider reports success without verifying, and the resource is wrong until the next run."],
    v: "Apply a plan that changes five resources on a test node, then read each directly from the machine and confirm every one matches the desired state and the report lists exactly those five.",
    dep: ["state-comparison", "dependency-graph", "error-handling-and-retries"]
  },
  "dry-run-mode": {
    s: "Runs the whole comparison without changing anything, reporting what would be changed so operators can preview the effect of code before it is applied.",
    d: "In this mode the engine reads states and computes differences but skips every write, producing a report of intended changes with values. It is the basis of review previews, drift detection and compliance audits. It is only as honest as the providers: ones that cannot predict, such as commands whose effect is unknown, can only say they would run. The hard limit is that a later resource may depend on the result of an earlier one that did not actually happen, so the prediction can diverge from reality.",
    k: ["Preview with real node state vs preview against sample data: real state is accurate and needs node access; sample data is safe and can miss differences.", "Commands marked as would-run vs skipped entirely: reporting them is honest about uncertainty; skipping hides possible changes."],
    p: ["A dry run is trusted, but a command resource always shows would-run, so a real destructive change is hidden among noise.", "Resources that depend on earlier changes show no difference in the dry run and then change on the real run."],
    v: "Run in dry mode against a test node with a pending change, confirm the report lists it and the node is untouched, then run for real and confirm the actual changes match the preview.",
    dep: ["state-comparison", "resource-abstraction"]
  },
  "drift-detection": {
    s: "Notices that a node's actual state has moved away from the declared state between runs, by comparing on each run or on a separate audit schedule.",
    d: "Every run is also a drift check: any resource that needed changing was out of line before the run. A separate audit pass can check without correcting. File integrity monitoring and event subscriptions detect changes sooner than the next run. The output feeds drift reports and alerts. It is hard to distinguish meaningful drift from legitimate churn, since logs, caches and application data change constantly, and because a value that another program rewrites is a conflict to fix, not drift to correct.",
    k: ["Detect at run time only vs continuous monitoring: run-time detection costs nothing extra and finds drift late; continuous monitoring finds it fast and adds an agent job.", "Auto-correct vs alert and wait: correcting restores the standard; alerting protects emergency changes made deliberately."],
    p: ["An application rewrites a managed file, and the system corrects it every run, causing flapping.", "Drift is corrected so quickly that no one learns that something keeps changing the setting."],
    v: "Modify a managed file on a test node, wait for the next detection pass, and confirm the system records that the file drifted, with its old and new values, before or as it is corrected.",
    dep: ["state-comparison", "run-reports"]
  },
  "error-handling-and-retries": {
    s: "Decides what happens when a resource fails: record the error, skip dependents, continue with unrelated resources and retry transient failures where that is safe.",
    d: "A failed resource is marked failed, resources depending on it are skipped, and independent ones continue, unless the run is set to stop at the first error. Transient errors such as a package mirror timeout are retried a few times with delay. The report preserves the first failure's message. It is hard to tell transient from permanent errors, and retrying non-idempotent operations can repeat their effect: a command that fails after doing half its work is not safe to run again.",
    k: ["Continue past failures vs stop at the first: continuing converges as much as possible and can mask a root cause; stopping is cautious and leaves the node half configured.", "Automatic retries vs fail and wait for the next run: retries hide transient problems; waiting is simple and slower to recover."],
    p: ["A retried command repeats a partial side effect, such as appending a line twice.", "Skipped dependents bury the first failure in a long list of consequences."],
    v: "Make one package source unreachable on a test node, run convergence, and confirm the package fails after the configured retries, its dependents are skipped, and unrelated resources are still applied.",
    dep: ["dependency-graph", "run-reports"]
  },
  "timeouts-and-cancellation": {
    s: "Limits how long any operation or whole run may take, and stops it cleanly when exceeded, so one hung command cannot block a node indefinitely.",
    d: "Each provider call, command and fact probe has a timeout, and the run has an overall limit. When exceeded, the engine terminates the child process, records the failure and continues or aborts. Cancellation by an operator follows the same path. Good defaults prevent hung network mounts and stuck package tools from stalling nodes. The challenge is picking values: too short kills slow but legitimate work such as a large package install, too long lets one hang consume the whole run window.",
    k: ["Per-operation timeouts vs one run-level timeout: per-operation isolates the slow step; a run-level limit is simple and stops everything.", "Kill the process vs ask it to stop: killing is certain and can leave partial work; asking is gentler and may not be heeded."],
    p: ["A killed package installation leaves the package database locked and every later run fails.", "A default timeout is too short for a big download, and the install fails and retries forever on slow links."],
    v: "Run a command resource that sleeps beyond its timeout on a test node, and confirm the run reports a timeout failure on time, the child process is gone, and later resources were handled normally.",
    dep: ["apply-loop", "command-execution-provider"]
  },
  "run-state-persistence": {
    s: "Saves what the engine learned and did during a run, such as checksums, last-run results and the cached plan, so later runs can be quick, resume sensibly and work offline.",
    d: "The agent stores the last plan, the last report and per-resource state such as checksums in a local directory. With the cached plan it can converge without the server, and checksums avoid rereading large files. A summary of the last run lets operators and monitoring see the node's state locally. It is hard because it is a cache that must never override reality: stale local state that disagrees with the machine produces wrong decisions, so state is advice and the machine is always re-read.",
    k: ["Persist state locally vs recompute every run: persistence saves time and enables offline operation; recomputing is simpler and always correct.", "Trust the cache vs verify against the machine: trusting is fast and wrong after outside changes; verifying costs reads and stays honest."],
    p: ["A restored backup of the state directory makes the agent believe resources are already correct.", "The cached plan is used after the node's role changed, and it keeps applying the old role offline."],
    v: "Disconnect a test node from the server, run the agent, and confirm it applies the cached plan and reports the run locally, then reconnect and confirm the queued report is delivered.",
    dep: ["local-cache-and-state"]
  }
});
