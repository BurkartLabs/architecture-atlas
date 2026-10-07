// Details for the chaos engineering plate, part 2: scheduling, safety guards, measurement.
ATLAS.details("chaos-engineering", {
  "experiment-scheduler": {
    s: "Decides when each experiment starts, taking account of calendars, freezes, running experiments and system health, and launches it at the chosen time.",
    d: "The scheduler holds a queue of experiments with one-time or recurring schedules. At the chosen time it checks the preconditions: approvals valid, no freeze, no active incident, steady state healthy, capacity within limits. If any fail, it delays or skips with a recorded reason. It hands the experiment to the workflow engine and records the start. It is hard because it must be conservative: skipping a run is safe, starting one at the wrong moment is not, so every check defaults to no.",
    k: ["Fixed clock times vs health-triggered starts: fixed times are predictable for teams; health-triggered starts run only when the system is calm, but can delay indefinitely.", "Skip a missed run vs run it late: skipping avoids stacking; running late keeps coverage but may land in a bad window."],
    p: ["A scheduler that starts at the clock time without rechecking the freeze calendar runs a test during a release.", "Timezone handling errors move a daily run into peak traffic."],
    v: "Schedule an experiment while an incident is open in a test setup: it must be skipped with the reason incident active, and start normally once the incident closes.",
    dep: ["change-windows","freeze-calendar","incident-conflict-check","workflow-engine"]
  },
  "change-windows": {
    s: "Defined time periods in which experiments are allowed, chosen for when staff are present and customer impact would be smallest.",
    d: "A window states days, hours and timezone, often limited to business hours when responders are at their desks and away from peak traffic, holidays and quarter ends. Windows can differ per environment and per service tier. The scheduler refuses to start outside the window and the abort controller may end an experiment that overruns it. It is hard because the best time for people and the best time for traffic often differ, and global services have no quiet hour.",
    k: ["Business hours vs off-peak hours: business hours have staff to respond; off-peak lowers impact but leaves fewer people to help when something goes wrong.", "Per-service windows vs a global window: per-service fits local patterns; a global one is easier to communicate and enforce."],
    p: ["A window defined in one timezone and read in another places an experiment at the busiest hour.", "Experiments running past the end of a window continue unwatched."],
    v: "Attempt to start an experiment one minute outside its window: the scheduler refuses, and one that overruns the window end is stopped at the boundary, both visible in the audit log.",
    dep: ["freeze-calendar"]
  },
  "freeze-calendar": {
    s: "A calendar of periods when no experiment may run, such as major launches, sales events, audits and incident recovery.",
    d: "Entries are created by operations or product owners and apply to a service, a region or everything. The scheduler and the validator both consult the calendar; an active freeze can also trigger abort of running experiments. Emergency freezes can be added instantly. The calendar integrates with release tooling so a deployment freeze implies a chaos freeze. It is hard because freezes pile up and, if too many, mean experiments almost never run and resilience knowledge goes stale.",
    k: ["Freeze all faults vs freeze only risky ones: freezing everything is simple and safe; freezing only risky ones keeps low-impact testing alive during long periods.", "Calendar entered by people vs derived from other systems: manual is flexible but forgotten; derived from release and incident systems stays correct automatically."],
    p: ["A freeze that applies at start time only does not stop a long experiment that straddles its beginning.", "Emergency freezes that take minutes to propagate let a scheduled run begin."],
    v: "Add an emergency freeze while an experiment runs: the abort controller stops it and the scheduler refuses new starts within the stated propagation time.",
    dep: ["abort-controller","audit-log"]
  },
  "workflow-engine": {
    s: "Runs an experiment as an ordered set of steps: check, inject, observe, revert, verify, report, with state kept so it can resume or abort at any step.",
    d: "The engine takes the spec and executes it as a state machine. Steps include pre-checks, applying each fault, waiting, evaluating metrics, removing faults and verifying recovery. State is stored durably so a crash of the control plane does not leave faults in an unknown state; on restart it reads the state and continues or reverts. It is hard because failure of the engine itself is the nastiest case: a half-finished experiment must be recognized and cleaned up.",
    k: ["Durable state machine vs in-memory execution: durable survives restarts and gives an audit trail; in-memory is simpler and faster but loses track of active faults.", "Revert on any error vs pause on error: reverting is safest; pausing keeps evidence for diagnosis but leaves faults in place."],
    p: ["An engine that records a fault as applied before the agent confirms it believes it is clean when it is not.", "Retrying a failed injection step without idempotence applies the fault twice."],
    v: "Kill the control plane mid-experiment in a test environment: on restart the engine finds the active run, and either resumes or reverts every fault, and the final state matches the report.",
    dep: ["command-channel","abort-controller","fault-expiry"]
  },
  "continuous-chaos": {
    s: "Running small, low-risk experiments all the time on a schedule so resilience is checked as the system changes, not only during occasional events.",
    d: "A continuous program runs a rotating set of experiments such as killing one random instance in a group, adding mild latency to a dependency or failing a small fraction of calls. The scope is small enough to be safe without a human present, and guards are always active. Results feed the scorecard, and failures create findings. It works only where basic resilience already exists. It is hard because constant background faults add noise to other teams' data and make real incidents harder to recognize.",
    k: ["Always-on random faults vs scheduled ones: always-on keeps teams honest; scheduled ones are easier to interpret and to avoid at risky times.", "Opt-in vs opt-out by service: opt-out spreads resilience practice quickly; opt-in respects readiness but leaves weak services untested."],
    p: ["Enabling it for a service with no redundancy turns routine tests into repeated outages.", "Background faults that are not marked in alerts and dashboards produce false incident reports."],
    v: "Over a week, confirm each enrolled service saw its planned experiments, each was marked in dashboards, and none exceeded its limit, as listed in the experiment history.",
    dep: ["experiment-scheduler","blast-radius-limit","guard-watcher"]
  },
  "concurrency-control": {
    s: "Limits how many experiments run at once and prevents overlapping ones from sharing targets or dependencies in ways that confuse results.",
    d: "The platform tracks active experiments and their resolved targets and dependencies. A new experiment is queued if it overlaps a running one on targets, shares a critical dependency or would exceed a global limit of simultaneous faults. Locks are taken on targets and released at the end or on abort. It is hard because overlap is not only about identical targets: two experiments on different services that share a database interact, and the dependency map may not show it.",
    k: ["Lock on targets vs lock on dependencies: target locks are simple and exact; dependency locks catch hidden interactions but block more work.", "Global cap vs per-team cap: a global cap protects the whole system; per-team caps are fairer but allow teams to collide."],
    p: ["Locks not released after a crash block all later experiments on those targets indefinitely.", "Two experiments overlapping unnoticed produce a result neither team can interpret."],
    v: "Start two experiments targeting the same instance group: the second queues with its reason, and starts only after the first releases its lock, as the schedule shows.",
    dep: ["dependency-map","target-selector"]
  },
  "ci-integration": {
    s: "Runs resilience experiments as a pipeline stage so that a build or deployment is blocked or flagged when a fault breaks its hypothesis.",
    d: "A pipeline step triggers an experiment against a staging or canary deployment, waits for the verdict and fails the stage when the hypothesis does not hold or the experiment aborts. It uses the trigger API and receives results as status. Experiments in a gate must be fast, deterministic and cheap enough to run on each change. Longer experiments run on a schedule after deploy. It is hard because chaos results can be noisy, and a flaky gate trains people to ignore or bypass it.",
    k: ["Blocking gate vs advisory report: blocking prevents regressions from shipping; advisory avoids stalling delivery on noisy results.", "Run on every change vs on a nightly schedule: every change finds the culprit quickly; nightly is cheaper but blames a batch of changes."],
    p: ["A flaky experiment in a blocking gate leads the team to rerun until it passes, which hides real regressions.", "Running the gate against a shared staging environment makes results depend on other teams' work."],
    v: "Introduce a deliberate regression, such as removing a retry, and confirm the pipeline stage fails with a link to the report showing the broken hypothesis.",
    dep: ["trigger-api","experiment-report","spec-validation"]
  },
  "trigger-api": {
    s: "The programmatic interface for starting, stopping, querying and listing experiments, used by pipelines, chat tools and other automation.",
    d: "The API accepts a spec or a reference to one, returns a run identifier and exposes status, events and results. It enforces the same authentication, approval and policy as the console. Webhooks or events notify callers of progress. Stop and status calls must always work, even when the rest of the platform is degraded. It is hard to keep the API safe for automation: a loop with a bug could start hundreds of runs, so rate limits and concurrency rules apply to API callers too.",
    k: ["Synchronous run vs asynchronous run: synchronous is easy for scripts to use; asynchronous scales and survives disconnects.", "Per-call credentials vs shared service accounts: per-call attributes actions to a person; shared accounts are easy for automation but obscure who did what."],
    p: ["An API that skips approval checks gives automation a way around the controls humans follow.", "A client that retries a start call after a timeout starts a second run."],
    v: "Call start twice with the same idempotency key and confirm only one run exists, and call stop while the console is unavailable to confirm the experiment halts.",
    dep: ["access-control","approval-workflow","workflow-engine"]
  },

  "abort-controller": {
    s: "The component that stops a running experiment on any trigger and drives every fault to its cleaned-up state, independent of the injection path.",
    d: "It listens for triggers from the guard watcher, kill switch, freeze calendar, dead-man timer and humans, then instructs every agent and proxy to remove faults, verifies each acknowledgment and records the outcome. It has its own connections to targets and, where possible, a separate network path. It retries until cleanup is confirmed and escalates if it cannot. It is hard because the conditions that call for an abort, such as a network failure, are the same that make cleanup unreliable.",
    k: ["Independent path vs shared path with the injector: independent survives a broken injector but doubles the machinery; shared is simpler but may fail together.", "Revert in parallel vs in order: parallel is fastest; ordered avoids a thundering herd of recovering components."],
    p: ["An abort that marks the experiment ended before agents confirm cleanup leaves faults running unrecorded.", "An abort path that depends on the same message queue as injection stalls when that queue is the victim."],
    v: "Trigger an abort during a network fault and confirm every target reports the fault removed and normal traffic returns, with acknowledgment times in the audit log.",
    dep: ["command-channel","auto-revert","audit-log"]
  },
  "guard-watcher": {
    s: "Continuously evaluates guard metrics during an experiment and triggers the abort controller when any crosses its limit.",
    d: "The watcher polls or subscribes to metrics that indicate real harm: error rates, latency, queue depth, customer-facing alerts and business signals. It compares each to its threshold with a minimum breach duration. It runs separately from the system under test and, ideally, reads a second source of data as a cross-check. If it loses its data, it treats that as a breach and aborts, since flying blind is not safe. The difficulty is the delay: metrics arrive seconds to minutes late, during which harm continues.",
    k: ["Fail closed on missing data vs fail open: failing closed aborts on a monitoring outage, which is safe but noisy; failing open keeps experiments running when monitoring is flaky but loses protection.", "Fast raw signals vs smoothed signals: raw signals react quickly but false-alarm; smoothed ones are stable but late."],
    p: ["Guards reading a metric pipeline that the fault itself degrades stop receiving data and see nothing wrong.", "A guard threshold copied from a different service never trips on this one."],
    v: "Stop the metric feed in a test run: the watcher must abort within the configured staleness limit and record missing data as the cause.",
    dep: ["metric-ingest","abort-controller","abort-conditions"]
  },
  "kill-switch": {
    s: "A single control that immediately stops all experiments and blocks new ones, available to a wide group of people and also to automation.",
    d: "The switch sets a global flag read by the scheduler, workflow engine and every agent, and triggers cleanup of all active faults. It is reachable from the console, a chat command, a command-line tool and an API, and works even if the main user interface is down. Agents also check the flag locally, so a stopped control plane still halts faults. It is hard because it must be simple and reliable enough to trust under stress, yet must also be used rarely enough that people are not afraid of it.",
    k: ["Anyone can press vs restricted to a few: anyone gives the fastest response to harm; restriction prevents accidental use but delays action.", "Global switch vs per-service switch: global is simplest in a crisis; per-service avoids halting unrelated work."],
    p: ["A switch that only stops new experiments leaves running faults in place.", "Using the switch is treated as blame, so people hesitate to press it."],
    v: "Press the switch during three running experiments in a test environment: all faults are cleared within the stated time, new starts are refused, and the person and time are recorded.",
    dep: ["abort-controller","audit-log"]
  },
  "auto-revert": {
    s: "Removes each injected fault and restores the target to its previous state when an experiment ends normally or is aborted.",
    d: "Every fault has an inverse, and the injector records what it changed: the rules added, the processes stopped, the limits set. Revert applies the inverse in a safe order and then verifies the target matches its saved state. Some faults cannot be undone by reversing an action: a killed instance must be replaced by the orchestrator, and a filled disk needs files removed. For those, the platform records the expected recovery path and checks it happened. It is hard to make revert complete, idempotent and verifiable.",
    k: ["Restore from recorded change vs restore by re-asserting known good state: recorded change is precise; re-asserting known state also repairs drift but may overwrite legitimate changes.", "Verify by reading the target vs trust the agent's report: reading the target catches silent failures; trusting is cheaper and faster."],
    p: ["A revert that removes a traffic rule by its position rather than its identity deletes another team's rule.", "Revert declared successful before the target service recovers hides slow recovery."],
    v: "After each fault type in a test, compare the target's configuration, rules and resource limits to a snapshot taken before injection: they must match exactly.",
    dep: ["host-agent","fault-expiry"]
  },
  "deadman-timer": {
    s: "A countdown the control plane must keep renewing; if it stops, the targets remove their own faults.",
    d: "Each agent holds a lease on the fault and removes it when the lease expires unless the control plane renews it. This ensures that a crashed platform, a lost network link or an unreachable operator cannot leave a fault running. Lease lengths are short, from seconds to a few minutes. Agents enforce them locally with their own clock. It is hard to pick the length: short leases are safe but break an experiment during brief control plane hiccups, and long ones leave a fault in place longer.",
    k: ["Short lease with frequent renewal vs long lease: short leases limit exposure but make the experiment fragile; long leases are stable but leave faults longer after a failure.", "Local expiry vs central expiry: local works when disconnected; central is easier to observe but depends on connectivity."],
    p: ["Renewals that ride the same network as a partition fault expire the lease, so the experiment ends early and the result is meaningless.", "Agent clocks that drift expire leases early or late."],
    v: "Block an agent from the control plane in a test: the fault is removed within the lease length plus tolerance, as shown by the agent's local log and the target's behavior.",
    dep: ["host-agent","fault-expiry"]
  },
  "fault-expiry": {
    s: "A required maximum lifetime on every fault, enforced where it is applied, so nothing injected can outlive its planned duration.",
    d: "Every fault carries an absolute end time. The agent or proxy stores it with the fault and removes the fault at that time even without further instructions. The control plane also runs a sweeper that lists active faults across all targets and removes any past expiry or without a matching run. The sweeper is a safety net for orphans caused by bugs. It is hard because orphaned faults are hard to see: a small amount of added latency left on one host may go unnoticed for months.",
    k: ["Enforced at the target vs enforced centrally only: target-side enforcement works in a partition; central sweeping finds orphans and leaks agents did not know about.", "Hard maximum durations vs per-experiment durations only: hard maximums stop misconfigured runs; per-experiment values allow legitimate long tests."],
    p: ["A fault applied directly by hand with the agent command line has no expiry and stays until someone notices.", "A sweeper that only checks runs it knows about misses faults from runs whose records were lost."],
    v: "List all active faults on a host after an experiment: there must be none, and any intentionally leaked fault in a test must be removed by the sweeper by its expiry time.",
    dep: ["host-agent","audit-log"]
  },
  "incident-conflict-check": {
    s: "Prevents experiments from starting, and stops running ones, when a real incident, alert or on-call handoff affects the same systems.",
    d: "The check reads the incident system, active alerts and on-call schedules. It blocks starts when a related incident is open, or when a target has firing alerts, or when the responsible on-call person is mid-handoff or unreachable. It also watches for a new incident while an experiment is running and aborts if the affected services overlap. It is hard because deciding whether an incident is related needs the dependency map, and a conservative rule that blocks on any incident stops all testing during busy periods.",
    k: ["Block on any incident vs only related incidents: any is the safest but stops testing too often; related-only needs a good dependency map and may miss indirect effects.", "Abort running experiments on a new incident vs let them finish: aborting removes confusion about the cause; finishing preserves the result but muddies diagnosis."],
    p: ["An experiment still running when an incident opens makes responders chase the fault they cannot distinguish from the real cause.", "Incident data entered late means the check passes while the incident is already underway."],
    v: "Open a test incident on a service the experiment touches: the running experiment aborts and a queued one is refused, both naming the incident identifier.",
    dep: ["abort-controller","dependency-map"]
  },
  "access-control": {
    s: "Defines who may create, approve, run, stop and view experiments, on which environments and which fault types.",
    d: "Roles separate authors, approvers, operators and viewers, and permissions are scoped by environment, service and fault class. Destructive faults and production scope are separate permissions. The platform's own agents have credentials that can cause harm, so their identities, networks and tokens are tightly limited and rotated. Authentication uses the organization's identity system. It is hard because the platform is, by design, a way to damage production, so it is a prime target and an accident risk.",
    k: ["Fine-grained permissions vs a few roles: fine-grained control matches real risks but is tedious to maintain; few roles are simple but over-grant.", "Time-limited elevation vs standing access: time-limited reduces exposure; standing access is easier for regular programs."],
    p: ["An agent token stored in a shared image lets anyone with the image inject faults.", "Viewers who can see target lists learn which systems are fragile or unprotected."],
    v: "Attempt each action with a viewer, an author and an operator account: only permitted actions succeed, and every refusal is logged with the missing permission.",
    dep: ["audit-log"]
  },
  "audit-log": {
    s: "A tamper-evident record of every action by people, automation and agents: who requested, approved, started, changed and stopped each fault, and when.",
    d: "Every control plane decision and every agent action is written as a structured event with identity, target, parameters, time and outcome. Logs go to storage outside the platform's reach and are retained according to policy. They support investigation, compliance and the timeline of an experiment. It is hard to make it complete: agents must log even when disconnected, and the log must record cleanup as carefully as injection.",
    k: ["Append-only external store vs the platform's own database: external is trustworthy and survives platform failure; internal is simpler to query.", "Log intent only vs intent and confirmed effect: intent is easy to record; confirmed effect shows what actually happened on the target."],
    p: ["Logging only starts and not stops makes it impossible to prove a fault was removed.", "Agent logs buffered locally and lost with the host lose the most important evidence."],
    v: "Pick one experiment and trace it from request to cleanup in the log: each step appears with identity, target and confirmation, and no gap is longer than the stated interval.",
    dep: []
  },

  "metric-ingest": {
    s: "Reads the system's existing telemetry, such as time series, logs and traces, into the platform so that experiments can be judged against it.",
    d: "Connectors query the organization's monitoring and logging systems on a schedule or by streaming and normalize metric names, labels and time bases. Queries are defined in the steady-state definition. The ingest keeps short-lived copies for the experiment window and for later reporting. It is hard because telemetry has delays, gaps and resolution limits, and because a fault may damage the monitoring itself, so measurements go missing exactly when they matter.",
    k: ["Query the existing store on demand vs copy into the platform: querying avoids duplication and uses what teams already trust; copying survives monitoring outages and gives consistent history.", "High resolution vs coarse resolution: high resolution sees short effects but costs more; coarse is cheaper and hides brief failures."],
    p: ["A metric label changed by a team silently makes the query return empty, and the evaluator treats that as healthy.", "Ingest delay of a minute makes guards react a minute after harm began."],
    v: "Inject a known step change into a metric in a test setup and confirm the platform sees it with a delay within the documented bound and with the right labels.",
    dep: []
  },
  "baseline-builder": {
    s: "Computes what normal looks like for each steady-state metric from past data, adjusted for time of day, day of week and recent trend.",
    d: "The builder takes recent history of each metric, removes periods of known incidents and earlier experiments and models the daily and weekly pattern. It provides an expected value and an acceptable band for any point in time. A control group of untouched instances can supply a live baseline. The baseline is stored with the experiment so the verdict is reproducible. It is hard because traffic changes, releases and seasonality shift normal, and a baseline from last month may no longer apply.",
    k: ["Historical baseline vs concurrent control group: historical is available for any target; a control group cancels shared trends and time-of-day effects.", "Short history vs long history: short follows recent change; long smooths noise and captures seasonality."],
    p: ["A baseline that includes a past outage widens the band so much that real harm looks normal.", "Comparing a Monday experiment to a weekend baseline blames the fault for the traffic difference."],
    v: "Compute a baseline for a metric and test it on a week of data without faults: at least the stated fraction of points fall inside the band, and none during a known-quiet period fall outside.",
    dep: ["metric-ingest"]
  },
  "steady-state-evaluator": {
    s: "Compares live metrics with the steady-state definition before, during and after an experiment and returns healthy, degraded or violated with evidence.",
    d: "Before the fault, the evaluator confirms the system is healthy and refuses to start otherwise. During it, evaluation runs at a fixed interval and records each result. After it, the evaluator waits for recovery within a time limit. It supports several metrics with rules for combining them. The result feeds the hypothesis check, the report and the ramp controller. It is hard because noisy metrics produce flapping verdicts, and because recovery has no single clear moment.",
    k: ["Evaluate every sample vs evaluate windows: every sample is responsive but noisy; windows are stable but delay detection.", "All metrics must pass vs any may fail: requiring all to pass is conservative; allowing weighted combinations handles known-noisy signals."],
    p: ["A system already degraded before the fault leads the evaluator to attribute the problem to the fault if the pre-check is skipped.", "No recovery time limit lets a slow recovery be recorded as a pass."],
    v: "Run an experiment with a known harmful fault in a test environment: the evaluator reports violated at the expected time, and after revert reports recovered within the limit.",
    dep: ["steady-state-definition","baseline-builder","metric-ingest"]
  },
  "statistical-comparison": {
    s: "Applies statistical tests to decide whether a difference between experiment and control, or before and during a fault, is real or noise.",
    d: "The comparison uses distributions rather than averages: percentiles of latency, error rates with confidence intervals, and tests that account for autocorrelated time series. Where a control group exists, differences between treated and untreated instances are compared at the same time. The output is an effect size and a confidence level. It is hard because short experiments and small traffic samples make real effects undetectable, and many metrics tested at once yield false positives.",
    k: ["Control group comparison vs before-and-after comparison: a control group removes shared trends; before-and-after needs no spare capacity but confuses the fault with time.", "Fixed-duration test vs sequential test: fixed is easy to interpret; sequential can stop early but needs careful error control."],
    p: ["Averaging latency hides a tail that doubled.", "Declaring no effect from a test that lacked the power to see one gives false assurance."],
    v: "Run the comparison on a synthetic dataset with a known five percent shift: it detects the shift at the stated confidence, and reports no effect on a dataset with none.",
    dep: ["baseline-builder","metric-ingest"]
  },
  "slo-adapter": {
    s: "Translates the organization's service level objectives and error budgets into experiment guards and verdicts, so tests respect agreed reliability limits.",
    d: "The adapter reads each service's objectives, current budget consumption and burn rate. It sets guard thresholds from them, refuses or limits experiments when the budget is nearly spent, and reports how much budget an experiment consumed. A hypothesis can be stated directly as the objective holding during the fault. It is hard because objectives are defined over long windows while experiments last minutes, so the relation between a short fault and a monthly budget needs explicit rules.",
    k: ["Spend error budget on experiments vs keep it for users: spending it deliberately makes resilience work routine; keeping it avoids any added risk but leaves weaknesses hidden.", "Burn-rate guards vs absolute guards: burn-rate guards adapt to the objective; absolute guards are simpler to explain."],
    p: ["Running an experiment on a service with an exhausted budget pushes it into breach with no room left.", "Counting experiment-induced errors against a team's objective without agreement causes disputes."],
    v: "Reduce a test service's remaining budget below the policy limit: new experiments on it are refused with the budget figures shown, and a completed experiment reports its budget cost.",
    dep: ["metric-ingest","guard-watcher"]
  },
  "synthetic-probes": {
    s: "Scripted requests the platform sends itself to measure user-visible behavior independently of the system's own instrumentation during a fault.",
    d: "Probes act like users: they log in, fetch pages, place test orders or call public interfaces, from several locations, at regular intervals. Their results provide a ground-truth signal that does not depend on the target's metrics, which a fault may break or distort. Probe traffic carries a marker so it is excluded from business metrics. It is hard because probes cover only the paths someone scripted, and a few probes per minute cannot see failures that affect a small share of real users.",
    k: ["External probes vs internal probes: external ones see what users see including network and edge; internal ones are more precise about where a failure happens.", "Read-only probes vs probes that write: read-only are safe; write probes test critical flows but need cleanup and isolated test data."],
    p: ["Probes that hit a cache and not the real path report health while users get errors.", "Probe traffic not marked pollutes business and capacity metrics."],
    v: "Fail a downstream service in a test: the probe for the dependent flow fails within one probe interval from at least two locations, and its failures show in the experiment report.",
    dep: ["experiment-annotations"]
  },
  "trace-correlation": {
    s: "Uses distributed traces to show exactly how a fault propagated: which calls slowed or failed, which retries followed and which fallbacks ran.",
    d: "Traces from the instrumented services are filtered by the experiment's time window and target, and tagged to show the injected fault. The platform compares trace shapes with and without the fault, showing how many calls, retries and timeouts occurred. It reveals unexpected paths and hidden dependencies, which feed the dependency map. It is hard because traces are sampled, so rare effects may be missing, and because a fault can break the propagation of trace context itself.",
    k: ["Tag traces affected by the fault vs infer from timing: explicit tags are exact; inference needs no extra instrumentation but is uncertain.", "Higher sampling during experiments vs normal sampling: higher sampling shows more but costs storage; normal sampling is cheaper and misses rare paths."],
    p: ["A broken trace context cuts a trace in half, and the downstream effect appears unrelated.", "Sampling that drops error traces hides the very calls the experiment caused."],
    v: "Inject a latency fault on a known dependency and find, in the traces, the slow spans on that call and the retries the caller made, with the fault tag on affected spans.",
    dep: ["experiment-annotations"]
  },
  "experiment-annotations": {
    s: "Markers written into dashboards, logs and traces at the moments faults start, change and end, so anyone looking at telemetry can see an experiment was running.",
    d: "The platform posts events to the monitoring system and annotates charts, adds tags to logs and passes a marker to traces. Annotations carry the experiment identifier, the fault, the owner and a link. They let responders recognize deliberate faults and keep alerts from being treated as unexplained. They also allow later analysis to include or exclude experiment periods. It is hard to make them consistent across tools, and to make sure they are posted even when the monitoring system is degraded.",
    k: ["Annotate everything vs annotate only dashboards: everything is thorough but needs integration with many tools; dashboards alone are cheap and reach the people most likely to need them.", "Push events vs pull by monitoring: pushing is immediate; pulling keeps the platform out of the monitoring path but delays markers."],
    p: ["A missing end annotation makes an old experiment look like it is still running.", "Annotations not shown on the alert page leave the on-call engineer treating an experiment as an outage."],
    v: "Run a short experiment and confirm start and end markers appear on the service's dashboard, in its logs and in the alert view, within the stated delay and with a link to the run.",
    dep: ["metric-ingest"]
  },
});
